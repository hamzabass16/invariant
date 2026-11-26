/**
 * The scheduled runs as jobs, one per person and run (docs/ARCHITECTURE.md
 * §5.3, ADR 0002). Pure: the kinds, the keys that make enqueuing
 * idempotent, the backoff, and the operator's summary. The table and the
 * workers are in lib/jobs-run.ts.
 *
 * Before jobs, each cron looped over every enrolment inside one function of
 * 300 seconds, so the run stopped somewhere past fifteen to fifty people and
 * one slow person delayed everyone after them. Now a cron enqueues one job
 * per person and starts a few workers, each its own function with its own
 * time; a job that fails is tried again with a backoff, by the worker that
 * ran it when the retry falls inside its time (`retryWait`), and a job a run
 * could not reach is picked up by the dispatcher, a cron once an hour
 * (Hamza, 25 Nov 2026; every minute before, ADR 0008, which kept the free
 * database awake around the clock), instead of waiting for the next run.
 */

export const JOB_KINDS = ["morning", "reviews", "alerts", "evening", "results", "hunter", "screener"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_WORDS: Record<JobKind, string> = {
  morning: "Morning refresh and alerts",
  reviews: "Weekly and monthly reviews",
  alerts: "Evening alert check",
  evening: "After the close",
  results: "Results watch",
  hunter: "Thesis Hunter",
  screener: "Screener and top funds",
};

/** Attempts before a job is left as failed. */
export const MAX_ATTEMPTS = 3;
/** Kept on a job whose worker died on its last attempt, so it is failed and never claimed again. */
export const ABANDONED_SENTENCE = "The run stopped before it finished, three times.";
/** Minutes before the second and third attempts. */
export const BACKOFF_MINUTES = [1, 4, 16] as const;
/** How long a claimed job is held before another worker may take it (a worker that died); longer than a function may live (800 s on Pro), so a live worker's job is never taken from it. */
export const LOCK_MINUTES = 14;
/** Days a finished job is kept for the operator's screen. */
export const KEEP_DAYS = 30;
/** Workers a cron starts at once; each takes jobs one after another until its time is up. */
export const WORKERS = 6;
/** A worker starts no new job this long after it began, so the job it runs finishes inside its function's time (800 s on Vercel Pro). */
export const WORKER_START_MS = 600_000;
/** Workers the hourly dispatcher keeps busy at most, beside the ones a cron started. */
export const DISPATCH_CAP = 8;

/**
 * How many workers the dispatcher starts: none when nothing is due, else
 * enough for the due jobs, never past the cap counting the workers already
 * busy. A worker takes jobs one after another, so one per due job is the
 * most that helps.
 */
export function workersToStart(due: number, busy: number, cap: number = DISPATCH_CAP): number {
  if (!(due > 0)) return 0;
  return Math.max(0, Math.min(due, cap - Math.max(0, busy)));
}
/**
 * How long a worker that found nothing due waits for a retry it set itself:
 * until the earliest one still ahead, or at once for one already due, or
 * null when none is left or the earliest falls after the worker's start
 * window ends (`endMs`), so the hourly dispatcher or the next run takes it.
 */
export function retryWait(retries: readonly number[], nowMs: number, endMs: number): number | null {
  const next = retries.length ? Math.min(...retries) : null;
  if (next === null || next > endMs) return null;
  return Math.max(0, next - nowMs);
}

/** A job not run within this long of its time is left as expired rather than run late (a morning refresh at night). */
export const EXPIRE_HOURS: Record<JobKind, number> = { morning: 14, reviews: 2, alerts: 10, evening: 5, results: 1, hunter: 20, screener: 20 };

/**
 * The run a job belongs to, from the instant the cron fired: the day for the
 * once-a-day runs, the day and hour for the evening's six, the quarter hour
 * for the results watch. With the person's
 * fingerprint and the kind it makes the job's key, so a cron fired twice in
 * the same run (Vercel may) enqueues nothing new.
 */
/** Whether a company's results may be coming out: weekdays 10:00 to 14:45 UTC, before the open, and 20:00 to 23:45 UTC, after the close; the results watch runs every quarter hour then, and outside them only after a calendar event (Hamza, 7 Nov 2026). */
export const resultsHours = (now: Date) => now.getUTCDay() >= 1 && now.getUTCDay() <= 5 && ((now.getUTCHours() >= 10 && now.getUTCHours() <= 14) || now.getUTCHours() >= 20);

export function runSlot(kind: JobKind, at: Date): string {
  const iso = at.toISOString();
  // The results watch runs every quarter of an hour in the results windows.
  if (kind === "results") return `${iso.slice(0, 14)}${String(Math.floor(at.getUTCMinutes() / 15) * 15).padStart(2, "0")}`;
  return kind === "evening" || kind === "alerts" || kind === "reviews" ? iso.slice(0, 13) : iso.slice(0, 10);
}

export function dedupeKey(kind: JobKind, person: string, slot: string): string {
  return `${kind}:${person}:${slot}`;
}

/** When a job that failed its `attempts`-th try is tried again, or null when it is left as failed. */
export function retryAt(attempts: number, at: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[Math.max(0, Math.min(attempts - 1, BACKOFF_MINUTES.length - 1))];
  // A little spread, so jobs that failed together (a host that answered 429) do not come back together.
  const jitter = Math.floor(Math.random() * 30_000);
  return new Date(at.getTime() + minutes * 60_000 + jitter);
}

/** Whether a job due at `runAt` is too late to run at `now`. */
export function expired(kind: JobKind, runAt: Date, now: Date): boolean {
  return now.getTime() - runAt.getTime() > EXPIRE_HOURS[kind] * 3_600_000;
}

export type JobStatus = "queued" | "running" | "done" | "failed" | "expired";

export type JobRow = { kind: JobKind; status: JobStatus; runAt: string; startedAt: string | null; finishedAt: string | null; attempts: number; error: string | null };

export type KindSummary = { kind: JobKind; words: string; queued: number; running: number; done: number; failed: number; expired: number; retried: number; p95Seconds: number | null; oldestWaitingMinutes: number | null; errors: { sentence: string; count: number }[] };

/** The operator's view of the last day's jobs, per kind: counts, the slowest twentieth, the oldest waiting and the commonest failures. Never a person. */
export function summarise(rows: readonly JobRow[], now: Date): KindSummary[] {
  return JOB_KINDS.map((kind) => {
    const mine = rows.filter((r) => r.kind === kind);
    const count = (s: JobStatus) => mine.filter((r) => r.status === s).length;
    const durations = mine
      .filter((r) => r.status === "done" && r.startedAt && r.finishedAt)
      .map((r) => (Date.parse(r.finishedAt as string) - Date.parse(r.startedAt as string)) / 1000)
      .sort((a, b) => a - b);
    const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] : null;
    const waiting = mine.filter((r) => r.status === "queued" && Date.parse(r.runAt) <= now.getTime()).map((r) => Date.parse(r.runAt));
    const errors = new Map<string, number>();
    for (const r of mine) if (r.error && (r.status === "failed" || r.status === "queued")) errors.set(r.error, (errors.get(r.error) ?? 0) + 1);
    return {
      kind,
      words: JOB_WORDS[kind],
      queued: count("queued"),
      running: count("running"),
      done: count("done"),
      failed: count("failed"),
      expired: count("expired"),
      retried: mine.filter((r) => r.attempts > 1).length,
      p95Seconds: p95 === null ? null : Math.round(p95),
      oldestWaitingMinutes: waiting.length ? Math.round((now.getTime() - Math.min(...waiting)) / 60_000) : null,
      errors: [...errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sentence, c]) => ({ sentence, count: c })),
    };
  });
}

/** The queue's lag: minutes the oldest due job has waited, or zero. */
export function queueLag(rows: readonly JobRow[], now: Date): number {
  const due = rows.filter((r) => r.status === "queued" && Date.parse(r.runAt) <= now.getTime()).map((r) => Date.parse(r.runAt));
  return due.length ? Math.round((now.getTime() - Math.min(...due)) / 60_000) : 0;
}
