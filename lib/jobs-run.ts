import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { withAgentLedger } from "@/lib/agent-ledger";
import { connectionProblem } from "@/lib/connection-string";
import { ABANDONED_SENTENCE, DISPATCH_CAP, dedupeKey, expired, retryWait, JOB_KINDS, LOCK_MINUTES, KEEP_DAYS, MAX_ATTEMPTS, retryAt, runSlot, WORKER_START_MS, WORKERS, workersToStart, type JobKind, type JobRow, type JobStatus } from "@/lib/jobs";
import { logEvent, who } from "@/lib/log";
import { enrolments, scheduledEnrolment, type ScheduledEnrolment } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";
import { withZone } from "@/lib/zone";

/**
 * The jobs table and its workers (docs/ARCHITECTURE.md §5.3, ADR 0002).
 *
 *   jobs  one row per person and run: the kind, the person's sign-in address
 *         (the same key report_enrolments has), when it is due, its state,
 *         its attempts and, when it failed, the sentence it failed with.
 *         Never a figure, a token or anything read from a vault. Finished
 *         rows are deleted after KEEP_DAYS; withdrawing deletes the
 *         person's.
 *
 * A cron enqueues one job per enrolment (`enqueueForEveryone`; the key makes
 * a second cron in the same run enqueue nothing) and starts WORKERS workers
 * (`startWorkers`), each a POST to /api/jobs/run, its own function with its
 * own time, which takes due jobs one at a time with `for update skip
 * locked` until its time is up (`drain`). A job that throws is tried again
 * after 1, 4 and 16 minutes, by the worker that ran it while its time
 * allows; the dispatcher, a cron once an hour (`dispatch`; every minute
 * until 25 Nov 2026, ADR 0008), starts workers for whatever is still due
 * and not being run, so a job a run left behind waits an hour at most, not
 * a day. Logs are JSON lines with a fingerprint of the
 * person (lib/log.ts), never the address.
 */

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

export function jobsAvailable(): boolean {
  return !connectionProblem(process.env.DATABASE_URL);
}

function sql(): { q: Sql; ready: Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url)) throw new SyncError("Scheduled runs are not set up on this deployment.", "no DATABASE_URL");
  const q: Sql = neon(url);
  ready ??= q`
    create table if not exists jobs (
      id bigserial primary key,
      kind text not null,
      email text not null,
      dedupe_key text not null unique,
      run_at timestamptz not null,
      status text not null default 'queued',
      attempts integer not null default 0,
      locked_until timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      last_error text,
      created_at timestamptz not null default now()
    )`
    .then(() => q`create index if not exists jobs_due on jobs (status, run_at)`)
    // The operator's last day (recentJobs) and pruning read by creation; withdrawing deletes by address.
    .then(() => q`create index if not exists jobs_created on jobs (created_at)`)
    .then(() => q`create index if not exists jobs_email on jobs (email)`)
    .then(() => undefined);
  return { q, ready };
}

async function run<T>(fn: (q: Sql) => Promise<T>): Promise<T> {
  const { q, ready: table } = sql();
  try {
    await table;
    return await fn(q);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    ready = null;
    throw new SyncError("The job queue could not be reached. Try again in a moment.", "jobs query failed");
  }
}

/** One job per enrolment for this run; the ones already queued for it are left as they are. Returns how many were new. */
export async function enqueueForEveryone(kind: JobKind, now: Date = new Date()): Promise<{ queued: number; people: number; unreadable: number }> {
  const all = await enrolments();
  // The hourly reviews run queues only the people whose review is due this hour, so an hour with none is no rows.
  const { isDue } = await import("@/lib/report");
  const rows = kind === "reviews" ? all.rows.filter((e) => isDue(e.schedule, now, e.lastSlot, e.lastOutcome)) : all.rows;
  const unreadable = all.unreadable;
  const slot = runSlot(kind, now);
  let queued = 0;
  // In batches, so ten thousand people are a few dozen statements, not ten thousand.
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const emails = batch.map((e) => e.email);
    const keys = batch.map((e) => dedupeKey(kind, who(e.email), slot));
    const inserted = (await run((q) => q`
      insert into jobs (kind, email, dedupe_key, run_at)
      select ${kind}, e, k, ${now.toISOString()}::timestamptz from unnest(${emails}::text[], ${keys}::text[]) as t(e, k)
      on conflict (dedupe_key) do nothing
      returning id`)) as { id: string }[];
    queued += inserted.length;
  }
  logEvent("info", "jobs.enqueued", { kind, queued, people: rows.length, unreadable });
  return { queued, people: rows.length, unreadable };
}

type Claimed = { id: string; kind: string; email: string; attempts: number; run_at: string | Date };

/**
 * Fails each job whose worker died on its last attempt, so a job that kills
 * its function every time is not taken up again until it expires.
 */
async function failAbandoned(now: Date): Promise<number> {
  const at = now.toISOString();
  const rows = (await run((q) => q`
    update jobs set status = 'failed', finished_at = ${at}::timestamptz, locked_until = null, last_error = ${ABANDONED_SENTENCE}
    where status = 'running' and locked_until < ${at}::timestamptz and attempts >= ${MAX_ATTEMPTS}
    returning kind`)) as { kind: string }[];
  for (const r of rows) logEvent("warn", "job.abandoned", { kind: r.kind });
  return rows.length;
}

/** The next due job, claimed for LOCK_MINUTES; a job whose worker died is claimed again once its lock runs out, while it has attempts left. */
async function claimOne(now: Date): Promise<Claimed | null> {
  const lock = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
  const rows = (await run((q) => q`
    update jobs set status = 'running', attempts = attempts + 1, locked_until = ${lock}::timestamptz, started_at = ${now.toISOString()}::timestamptz
    where id = (
      select id from jobs
      where (status = 'queued' and run_at <= ${now.toISOString()}::timestamptz)
         or (status = 'running' and locked_until < ${now.toISOString()}::timestamptz and attempts < ${MAX_ATTEMPTS})
      order by run_at, id
      limit 1
      for update skip locked
    )
    returning id, kind, email, attempts, run_at`)) as Claimed[];
  return rows[0] ?? null;
}

async function settle(id: string, status: JobStatus, error: string | null, at: Date, again: Date | null = null): Promise<void> {
  if (again) {
    await run((q) => q`update jobs set status = 'queued', run_at = ${again.toISOString()}::timestamptz, locked_until = null, last_error = ${error} where id = ${id}`);
    return;
  }
  await run((q) => q`update jobs set status = ${status}, finished_at = ${at.toISOString()}::timestamptz, locked_until = null, last_error = ${error} where id = ${id}`);
}

/**
 * What one job does for one person, the same steps the run loops take,
 * each in the person's own zone. A sentence the steps return (a source that
 * failed, a review that could not be built) is the person's, kept on their
 * screens; only a throw makes the job fail and be tried again.
 */
async function perform(kind: JobKind, e: ScheduledEnrolment, now: Date): Promise<string | null> {
  // One ledger for the person's turn (lib/agent-ledger.ts): every agent's call gated, counted and kept once at the end.
  return withZone(e.schedule.zone, () => withAgentLedger(async () => (await import("@/lib/vault")).vaultForEnrolment(e), async () => {
    if (kind === "morning") {
      const { morningSyncFor, openStatementsInbox } = await import("@/lib/daily-sync");
      let opened: Awaited<ReturnType<typeof openStatementsInbox>> | null = null;
      const problems: string[] = [];
      try {
        // A refresh that fails keeps the last good figures, and the reviews still go out on them.
        const sync = await morningSyncFor(e, now, async (email) => {
          opened ??= await openStatementsInbox();
          return { email, ...opened };
        }).catch((err: unknown) => {
          if (!(err instanceof SyncError)) throw err;
          return { refreshed: false, failed: [err.message] };
        });
        problems.push(...sync.failed);
      } finally {
        const o = opened as { session: { close: () => Promise<void> } | null } | null;
        await o?.session?.close().catch(() => undefined);
      }
      // The reviews go out from their own hourly run, at the person's hour (kind "reviews").
      const { alertsFor } = await import("@/lib/alerts-run");
      const alerts = await alertsFor(e, now);
      if (alerts.problem) problems.push(alerts.problem);
      return problems[0] ?? null;
    }
    if (kind === "reviews") {
      const { reportsFor } = await import("@/lib/report-run");
      return (await reportsFor(e, now)).failed;
    }
    if (kind === "alerts") {
      const { alertsFor } = await import("@/lib/alerts-run");
      // The evening check also reads again an event whose outcome was not out yet (Hamza, 28 Oct 2026).
      return (await alertsFor(e, now, true)).problem;
    }
    if (kind === "evening") {
      const { loadMarketDay } = await import("@/lib/markets-feed");
      const { eveningContext, eveningFor } = await import("@/lib/market-recap-run");
      const { day } = await loadMarketDay(now, "full");
      const failed: string[] = [];
      const ctx = eveningContext(day, failed);
      const summary = { checked: 1, session: day?.session ?? null, statements: 0, newsletters: 0, recaps: 0, reports: 0, events: 0, alerted: 0, pushed: 0, failed };
      try {
        await eveningFor(e, now, ctx, summary);
      } finally {
        await ctx.close();
      }
      return failed[0] ?? null;
    }
    const { vaultForEnrolment } = await import("@/lib/vault");
    const vault = await vaultForEnrolment(e);
    if (kind === "results") {
      // Three files say whether a followed company's results, or a macro event's outcome, are out and unread; only then is the full read made, and what is written is emailed at once (Hamza, 4 Nov 2026).
      const [{ earningsFileSchema, resultsWatchDue }, { newYorkClock }] = await Promise.all([import("@/lib/earnings"), import("@/lib/market-day")]);
      const [{ macroReadDue, macroReportsFileSchema }, { calendarFoundSchema, foundEvents }, { ECON_EVENTS }] = await Promise.all([import("@/lib/macro-report"), import("@/lib/calendar-agent"), import("@/lib/econ-calendar")]);
      const [file, macro, found] = await Promise.all([
        vault.readJson("earnings", earningsFileSchema).catch(() => null),
        vault.readJson("macro_reports", macroReportsFileSchema).catch(() => null),
        vault.readJson("calendar_events", calendarFoundSchema).catch(() => null),
      ]);
      // Where no calendar is read (SOURCES=licensed), the SEC's list of each followed company's filings says whether results are out.
      const { licensedOnly } = await import("@/lib/licences");
      const results = licensedOnly() ? await (await import("@/lib/earnings-run")).secResultsOut(file, now) : resultsWatchDue(file, newYorkClock(now));
      // A macro event's report is read half an hour after it comes out, outcome and reaction in one go (Hamza, 7 Nov 2026).
      const events = macroReadDue([...ECON_EVENTS, ...foundEvents(found)], macro, now);
      if (!results && !events) return null;
      let written = 0;
      let problem: string | null = null;
      if (results) {
        const { readEarningsInto } = await import("@/lib/earnings-run");
        const run = await readEarningsInto(vault, now);
        written += run?.written ?? 0;
        if (run?.failed) problem = run.sentence;
      }
      if (events) {
        const { readMacroReportsInto } = await import("@/lib/macro-report-run");
        const run = await readMacroReportsInto(vault, now);
        written += run?.written ?? 0;
      }
      if (written) {
        const { checkAlerts } = await import("@/lib/alerts-run");
        const check = await checkAlerts(vault, e.email, now);
        if (check.problem) return check.problem;
      }
      return problem;
    }
    if (kind === "hunter") {
      const { huntThesesInto } = await import("@/lib/thesis-hunter-run");
      const run = await huntThesesInto(vault, now);
      return run?.failed ? run.sentence : null;
    }
    // The screener's and the top funds' share for this person, after the shared read the cron made for everyone.
    const [{ preferencesSchema }, { setupSchema }] = await Promise.all([import("@/lib/preferences"), import("@/lib/setup")]);
    const [preferences, setup] = await Promise.all([vault.readJson("preferences", preferencesSchema).catch(() => null), vault.readJson("setup", setupSchema).catch(() => null)]);
    const contact = preferences?.edgarContact ?? null;
    if (!contact || !setup) return null;
    const { readFundsInto } = await import("@/lib/funds-run");
    await readFundsInto(vault, contact, now, SCREENER_BUDGET_MS / 4);
    if (setup.methodology?.classes.length) {
      const [{ SCREEN_PER_RUN }, { readScreenerInto }] = await Promise.all([import("@/lib/screener"), import("@/lib/screener-run")]);
      await readScreenerInto(vault, contact, now, SCREEN_PER_RUN, SCREENER_BUDGET_MS * 0.75);
    }
    return null;
  }));
}

/** A cron function's time (800 s on Vercel Pro, less a margin), and the longest a job is given once started; the workers' start window is what is left. */
const CRON_MS = 790_000;
const JOB_MS = 180_000;

/** One person's share of the screener's time, as the loop gave each before. */
const SCREENER_BUDGET_MS = 110_000;

/** Runs one claimed job and settles it: done, tried again after a backoff, failed, or expired when it is too late to be of use. A retry's time is handed to `retried`, so the worker that set it can wait for it. */
async function runClaimed(job: Claimed, retried: (at: Date) => void = () => undefined): Promise<JobStatus> {
  const kind = job.kind as JobKind;
  const started = Date.now();
  const at = new Date();
  const person = who(job.email);
  if (!JOB_KINDS.includes(kind)) {
    await settle(job.id, "failed", "A job of a kind this version does not know.", at);
    return "failed";
  }
  if (expired(kind, new Date(job.run_at), at)) {
    await settle(job.id, "expired", null, at);
    logEvent("warn", "job.expired", { kind, who: person });
    return "expired";
  }
  try {
    const e = await scheduledEnrolment(job.email);
    // Withdrawn since the job was queued: nothing to do.
    const problem = e ? await perform(kind, e, at) : null;
    await settle(job.id, "done", problem, new Date());
    logEvent("info", "job.done", { kind, who: person, ms: Date.now() - started, attempt: job.attempts, problem: problem !== null });
    return "done";
  } catch (err) {
    const sentence = err instanceof SyncError ? err.message : "The run stopped on an unexpected error.";
    const again = retryAt(job.attempts, new Date());
    await settle(job.id, "failed", sentence, new Date(), again).catch(() => undefined);
    if (again) retried(again);
    logEvent("error", "job.failed", { kind, who: person, ms: Date.now() - started, attempt: job.attempts, detail: err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error", retry: again !== null });
    return again ? "queued" : "failed";
  }
}

/**
 * A worker: takes due jobs one after another until none is due or
 * WORKER_START_MS has passed. A job it tried again within that time is
 * waited for and taken here, so a retry no longer needs the dispatcher to
 * wake the database every minute (Hamza, 25 Nov 2026).
 */
export async function drain(startMs: number = WORKER_START_MS): Promise<{ ran: number; done: number; failed: number }> {
  const began = Date.now();
  const out = { ran: 0, done: 0, failed: 0 };
  const retries: number[] = [];
  await failAbandoned(new Date());
  while (Date.now() - began < startMs) {
    const job = await claimOne(new Date());
    if (!job) {
      const wait = retryWait(retries, Date.now(), began + startMs);
      if (wait === null) break;
      retries.splice(0, retries.length, ...retries.filter((t) => t > Date.now() + wait));
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    const status = await runClaimed(job, (at) => retries.push(at.getTime()));
    out.ran += 1;
    if (status === "done") out.done += 1;
    else if (status === "failed" || status === "queued") out.failed += 1;
  }
  return out;
}

/**
 * Starts the workers for a cron's run, each a POST to /api/jobs/run with the
 * cron's own secret, so each runs in its own function with its own time, and
 * waits for them. Where the deployment cannot reach itself (a local run), the
 * jobs are drained here instead. Returns what the workers ran.
 */
export async function startWorkers(origin: string, workers: number = WORKERS, startMs: number = WORKER_START_MS): Promise<{ ran: number; done: number; failed: number; workers: number }> {
  const secret = process.env.CRON_SECRET ?? "";
  const total = { ran: 0, done: 0, failed: 0, workers: 0 };
  const results = await Promise.allSettled(
    Array.from({ length: workers }, () =>
      fetch(`${origin}/api/jobs/run?start=${Math.round(startMs)}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error(`worker ${r.status}`);
        return (await r.json()) as { ran: number; done: number; failed: number };
      }),
    ),
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    total.workers += 1;
    total.ran += r.value.ran;
    total.done += r.value.done;
    total.failed += r.value.failed;
  }
  if (total.workers === 0) {
    logEvent("warn", "jobs.inline", { reason: "no worker reached" });
    const inline = await drain(startMs);
    return { ...inline, workers: 0 };
  }
  return total;
}

/** Jobs due now (queued and due, or held by a worker that died with attempts left) and jobs a live worker holds. */
export async function queueState(now: Date = new Date()): Promise<{ due: number; busy: number }> {
  const at = now.toISOString();
  const rows = (await run((q) => q`
    select
      count(*) filter (where (status = 'queued' and run_at <= ${at}::timestamptz) or (status = 'running' and locked_until < ${at}::timestamptz and attempts < ${MAX_ATTEMPTS}))::int as due,
      count(*) filter (where status = 'running' and locked_until >= ${at}::timestamptz)::int as busy
    from jobs where status in ('queued', 'running')`)) as { due: number; busy: number }[];
  return { due: Number(rows[0]?.due ?? 0), busy: Number(rows[0]?.busy ?? 0) };
}

/**
 * The hourly dispatcher: one query when nothing is due;
 * otherwise it starts as many workers as `workersToStart` gives and waits
 * for them, each in its own function. Counts alone come back.
 */
export async function dispatch(request: Request, now: Date = new Date()): Promise<{ due: number; busy: number; started: number; ran: number; done: number; failed: number }> {
  const state = await queueState(now);
  const n = workersToStart(state.due, state.busy, DISPATCH_CAP);
  if (n === 0) return { ...state, started: 0, ran: 0, done: 0, failed: 0 };
  const ran = await startWorkers(new URL(request.url).origin, n, WORKER_START_MS);
  logEvent("info", "jobs.dispatch", { ...state, started: n, ran: ran.ran, done: ran.done, failed: ran.failed });
  return { ...state, started: n, ran: ran.ran, done: ran.done, failed: ran.failed };
}

/** The last day's jobs, for the operator's screen and the deep health check; no address leaves this function. */
export async function recentJobs(now: Date = new Date()): Promise<JobRow[]> {
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const rows = (await run((q) => q`
    select kind, status, run_at, started_at, finished_at, attempts, last_error from jobs
    where created_at >= ${since}::timestamptz or status in ('queued', 'running')`)) as { kind: JobKind; status: JobStatus; run_at: string | Date; started_at: string | Date | null; finished_at: string | Date | null; attempts: number; last_error: string | null }[];
  const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());
  return rows.map((r) => ({ kind: r.kind, status: r.status, runAt: new Date(r.run_at).toISOString(), startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), attempts: r.attempts, error: r.last_error }));
}

/** Deletes finished jobs older than KEEP_DAYS. */
export async function pruneJobs(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  const rows = (await run((q) => q`delete from jobs where status in ('done', 'failed', 'expired') and created_at < ${before}::timestamptz returning id`)) as { id: string }[];
  return rows.length;
}

/** A person's jobs, deleted when they withdraw. */
export async function forgetJobs(email: string): Promise<void> {
  if (!jobsAvailable()) return;
  await run((q) => q`delete from jobs where email = ${email}`);
}

/** The cron's run as jobs: enqueue one per person, start the workers, prune the old rows. The response carries counts alone. */
export async function runAsJobs(kind: JobKind, request: Request, now: Date = new Date(), workers: number = WORKERS, cronStarted: number = now.getTime()): Promise<{ queued: number; people: number; unreadable: number; ran: number; done: number; failed: number; workers: number }> {
  const enq = await enqueueForEveryone(kind, now);
  const origin = new URL(request.url).origin;
  // The workers stop starting jobs early enough that the last one ends before the cron's own time does.
  const startMs = Math.max(10_000, Math.min(WORKER_START_MS, CRON_MS - (Date.now() - cronStarted) - JOB_MS));
  // No more workers than jobs to run (at least one, for any left from before).
  const ran = await startWorkers(origin, Math.min(workers, Math.max(1, enq.queued)), startMs);
  await pruneJobs(now).catch(() => 0);
  if (kind === "morning") await import("@/lib/model-meter").then((m) => m.pruneSpend(now)).catch(() => undefined);
  logEvent("info", "jobs.run", { kind, ...enq, ...ran });
  return { ...enq, ...ran };
}
