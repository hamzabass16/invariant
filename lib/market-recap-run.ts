import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { fetchFlexEvening, openStatementsInbox } from "@/lib/daily-sync";
import type { InboxSession } from "@/lib/inbox-mail";
import type { SharedIssue } from "@/lib/newsletters";
import { closedBy, newYorkClock, type MarketDay } from "@/lib/market-day";
import { bookSchema } from "@/lib/holdings";
import { EMPTY_RECAPS, holdingMoves, MOVE_ALERT_PCT, keepRecap, listedSymbols, parseRecapResponse, RECAP_MODEL, recapDue, recapRequestBody, recapsFileSchema, unwritten, type HoldingMove, type Recap } from "@/lib/market-recap";
import { loadCloses, loadMarketDay } from "@/lib/markets-feed";
import { callChecked } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { DEFAULT_PREFERENCES, preferencesSchema } from "@/lib/preferences";
import { pushFileSchema, recapDue as recapOwed } from "@/lib/push";
import { pushProblem, sendCloseRecapInto } from "@/lib/push-send";
import { enrolments, type ScheduledEnrolment } from "@/lib/registry";
import { setupSchema } from "@/lib/setup";
import { brokersFileSchema, withBrokers } from "@/lib/brokers";
import { statementsFileSchema, withStatements } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { vaultForEnrolment, type Vault } from "@/lib/vault";
import { enterZone } from "@/lib/zone";

/**
 * "What happened" after the close, and the IBKR statement when the
 * session's is already made (`fetchFlexEvening`). Two ways, as each person chose on
 * Markets: the recap newsletters they forward (StockMKTNewz arrives about two
 * hours after the close), read from the inbox as soon as they land; and a
 * recap their own Claude writes from the web, with why each of their listed
 * holdings moved; a move of 2% or more is then an alert, in the app and by
 * email, from the same check the alerts cron runs. The evening cron runs both for
 * everyone enrolled; "Write it now" on Markets runs the second for one
 * person. Read-only toward the inbox and the web; the only writes are to the
 * person's vault.
 */

/**
 * The person's listed holdings and how each moved in the session: the
 * session's read where it carries a symbol, the holding's own closes
 * otherwise. Read from their vault for the call and never kept or logged; a
 * book that cannot be read is no holdings, and the recap is the market's alone.
 */
export async function movesFor(vault: Vault, day: MarketDay, now: Date): Promise<HoldingMove[]> {
  try {
    const [setup, fileBook, statements, brokers] = await Promise.all([vault.readJson("setup", setupSchema).catch(() => null), vault.readJson("book", bookSchema).catch(() => null), vault.readJson("statements", statementsFileSchema).catch(() => null), vault.readJson("brokers", brokersFileSchema).catch(() => null)]);
    const today = localDay(now);
    const book = setup ? withBrokers(withStatements(fileBook, statements, setup.baseCurrency, today).book, brokers, setup.baseCurrency, today).book : fileBook;
    const carried = new Set([...day.moves, ...day.others].map((m) => m.symbol.toUpperCase()));
    const missing = listedSymbols(book).filter((s) => !carried.has(s.toUpperCase()));
    const closes = missing.length ? await loadCloses(missing.join(","), today, "full").catch(() => null) : null;
    return holdingMoves(book, day, closes?.series ?? {});
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return [];
  }
}

/** Writes one session's recap on the person's key, with why each of their holdings moved, and keeps it; a recap that could not be written keeps its sentence, and the next run tries again. */
export async function writeRecapInto(vault: Vault, provider: ModelProvider | null, day: MarketDay, now: Date, moves: readonly HoldingMove[] = [], alertPct = MOVE_ALERT_PCT): Promise<Recap> {
  const recap = await writeRecap(provider, day, now, moves, alertPct);
  const file = (await vault.readJson("recaps", recapsFileSchema).catch(() => null)) ?? EMPTY_RECAPS;
  await vault.writeJson("recaps", keepRecap(file, recap, now));
  return recap;
}

async function writeRecap(provider: ModelProvider | null, day: MarketDay, now: Date, moves: readonly HoldingMove[], alertPct: number): Promise<Recap> {
  if (!provider) return unwritten(day.session, "the AI is not set up on this deployment yet", now);
  const cannot = providerCannot(provider, "web_search");
  if (cannot) return unwritten(day.session, cannot, now);
  try {
    // Haiku first since the beta (Hamza, 9 Nov 2026); a recap the check refuses is asked once more on Sonnet.
    const parsed = await callChecked(provider, recapRequestBody(day, modelFor(provider, RECAP_MODEL), moves, alertPct) as ModelRequest, { agent: "market_recap", step: "write", subject: day.session }, (answer) => parseRecapResponse(answer, moves), (p) => p.ok);
    if (!parsed.ok) {
      console.error(`[recap] ${parsed.reason}`);
      return unwritten(day.session, parsed.called ? "what came back did not hold together; it is tried again on the next run" : "the model answered in words instead of recording the recap; it is tried again on the next run", now);
    }
    return { session: day.session, writtenAt: now.toISOString(), status: "written", sentence: null, reading: parsed.reading };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[recap] ${e.logDetail ?? "failed"}`);
    return unwritten(day.session, e.message, now);
  }
}

export type EveningSummary = { checked: number; session: string | null; statements: number; newsletters: number; recaps: number; reports: number; events: number; alerted: number; pushed: number; failed: string[] };

/**
 * The evening pass, for everyone enrolled: the recap newsletters that have
 * arrived since the morning, read once each, and a recap written by the
 * person's Claude when they chose it and the session has none yet, then
 * the one notification recapping the day's alerts on the devices they turned
 * on (lib/push-send.ts), once per session. One
 * person's failure never stops the others; the log carries counts, never an
 * address or a figure.
 */
export async function runEveningRead(now: Date = new Date()): Promise<EveningSummary> {
  const { rows } = await enrolments();
  const { day } = await loadMarketDay(now, "full");
  const summary: EveningSummary = { checked: rows.length, session: day?.session ?? null, statements: 0, newsletters: 0, recaps: 0, reports: 0, events: 0, alerted: 0, pushed: 0, failed: [] };
  const ctx = eveningContext(day, summary.failed);
  try {
    for (const e of rows) {
      enterZone(e.schedule.zone);
      try {
        await eveningFor(e, now, ctx, summary);
      } catch (err) {
        console.error(`[evening] one enrolment failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
        summary.failed.push(err instanceof SyncError ? err.message : "An evening read could not run.");
      }
    }
  } finally {
    await ctx.close();
  }
  console.info(`[evening] ${summary.checked} checked, ${summary.statements} statements fetched, ${summary.newsletters} newsletters read, ${summary.recaps} recaps written, ${summary.reports} earnings reports written, ${summary.events} event reports written, ${summary.alerted} alerts emailed, ${summary.pushed} close recaps pushed, ${summary.failed.length} failed`);
  return summary;
}

/** What one evening run reads once and lends to every person in it: the session, the app's own inbox and the shared recap's issues, each opened only when someone needs it. */
export type EveningContext = { day: MarketDay | null; inbox: () => Promise<{ session: InboxSession | null; problem: string | null }>; shared: () => Promise<{ issues: SharedIssue[]; problem: string | null }>; close: () => Promise<void> };

export function eveningContext(day: MarketDay | null, failed: string[]): EveningContext {
  let opened: Promise<{ session: InboxSession | null; problem: string | null }> | null = null;
  // The recap newsletter the app itself subscribes to, read once from the app's inbox and laid into each vault (Hamza, 18 Oct 2026).
  let shared: Promise<{ issues: SharedIssue[]; problem: string | null }> | null = null;
  return {
    day,
    inbox: () => (opened ??= openStatementsInbox()),
    shared: () =>
      (shared ??= import("@/lib/shared-recap-run").then(async ({ loadSharedRecaps }) => {
        const read = await loadSharedRecaps(day?.session ?? null);
        if (read.problem) failed.push(read.problem);
        return read;
      })),
    close: async () => {
      const o = opened ? await opened.catch(() => null) : null;
      await o?.session?.close().catch(() => undefined);
    },
  };
}

/** One enrolment's evening read, counted into `summary`. A failure the caller turns into a sentence is thrown. */
export async function eveningFor(e: ScheduledEnrolment, now: Date, ctx: EveningContext, summary: EveningSummary): Promise<void> {
  const day = ctx.day;
  const vault = await vaultForEnrolment(e);
  const prefs = (await vault.readJson("preferences", preferencesSchema).catch(() => null)) ?? DEFAULT_PREFERENCES;
  let alertNow = false;
  const { sharedRecapOn } = await import("@/lib/shared-recap-run");
  if (prefs.recap.newsletter && sharedRecapOn(e.email)) {
    const shared = await ctx.shared();
    if (shared.issues.length) {
      const { laySharedRecapsInto } = await import("@/lib/inbox-run");
      const lay = await laySharedRecapsInto(vault, shared.issues, now);
      summary.newsletters += lay.laid;
      if (lay.failed) summary.failed.push(`${lay.failed} shared recap issue${lay.failed === 1 ? "" : "s"} could not be read on a person's model; tried again on the next run.`);
    }
  }
  // The IBKR statement, when the session's is already made: a trade made today then shows tonight rather than tomorrow morning (Hamza, 17 Oct 2026).
  const flex = await fetchFlexEvening(vault, now, day?.session ?? null);
  if (flex.outcome === "replaced") {
    summary.statements += 1;
    // A trade made today changes the weights the Community card shares (Hamza, 19 Oct 2026).
    await (await import("@/lib/community-run")).republishQuietly(vault, e.email, now);
  } else if (flex.sentence) summary.failed.push(flex.sentence);
  if (prefs.recap.newsletter) {
    const opened = await ctx.inbox();
    if (opened.session) {
      const { readNewslettersInto } = await import("@/lib/inbox-run");
      const run = await readNewslettersInto(vault, e.email, opened.session, now);
      if (run) {
        summary.newsletters += run.read;
        if (run.failed) summary.failed.push(run.sentence);
      }
    }
  }
  if (prefs.recap.claude && day && recapDue(await vault.readJson("recaps", recapsFileSchema).catch(() => null), day.session)) {
    const provider = await providerFor(vault);
    const recap = await writeRecapInto(vault, provider, day, now, await movesFor(vault, day, now), prefs.moveAlertPct);
    if (recap.status === "written") {
      summary.recaps += 1;
      // A holding that moved the person's alert or more is an alert now, with Claude's reason, in the app and by email, rather than at the next check.
      alertNow = true;
    } else if (recap.sentence) summary.failed.push(recap.sentence);
  }
  // The results out today: the report goes out tonight, not at the next check.
  try {
    const { readEarningsInto } = await import("@/lib/earnings-run");
    const run = await readEarningsInto(vault, now);
    if (run?.written) {
      summary.reports += run.written;
      alertNow = true;
    }
    if (run?.failed) summary.failed.push(run.sentence);
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    summary.failed.push(err.message);
  }
  // The macro events the session just traded: each report goes out tonight, with its deck, in the close's notification and by email (Hamza, 27 Oct 2026).
  try {
    const { readMacroReportsInto } = await import("@/lib/macro-report-run");
    const run = await readMacroReportsInto(vault, now);
    if (run?.written) {
      summary.events += run.written;
      alertNow = true;
    }
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    summary.failed.push(err.message);
  }
  // The recap after the close, on the devices the person turned on (Hamza, 20 Oct 2026): once per session, on the close's own day in New York, after the alerts are checked.
  const pushNow = !!day && closedBy(now) === day.session && newYorkClock(now).date === day.session && !pushProblem() && recapOwed(await vault.readJson("push", pushFileSchema).catch(() => null), day.session);
  if (alertNow || pushNow) {
    const { checkAlerts } = await import("@/lib/alerts-run");
    const check = await checkAlerts(vault, e.email, now).catch((err: unknown) => {
      if (err instanceof SyncError) return { problem: err.message, emailed: 0 };
      throw err;
    });
    summary.alerted += check.emailed;
    if (check.problem) summary.failed.push(check.problem);
  }
  if (pushNow && day) {
    const sent = await sendCloseRecapInto(vault, day.session, now).catch((err: unknown) => {
      if (err instanceof SyncError) summary.failed.push(err.message);
      else throw err;
      return null;
    });
    if (sent?.sent) summary.pushed += 1;
  }
}
