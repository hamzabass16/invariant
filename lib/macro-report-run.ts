import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { agentById, costOf, mayRun, usageOf, type RunStep } from "@/lib/agents";
import { alertsFileSchema, reconcilePrefix } from "@/lib/alerts";
import { brokersFileSchema, withBrokers } from "@/lib/brokers";
import { calendarFoundSchema, foundEvents } from "@/lib/calendar-agent";
import { SENSITIVITY_DAYS } from "@/lib/calendar-run";
import { composeBook } from "@/lib/compose-book";
import { ECON_EVENTS, type EconArea } from "@/lib/econ-calendar";
import { eventReach, reachWords } from "@/lib/econ-exposure";
import { listedWeights } from "@/lib/event-sensitivity";
import { filingsFileSchema } from "@/lib/filings";
import { bookSchema } from "@/lib/holdings";
import { EMPTY_MACRO, gaugesFor, MACRO_MODEL, MACRO_PER_RUN, MACRO_PREFIX, macroDue, macroFigures, macroKey, macroNotices, macroReportOf, macroReportsFileSchema, macroRequestBody, parseMacroResponse, pricedSoon, retryHours, stillPriced, tradedOn, withMacroReport, withPriced, type MacroReport, type MacroReportsFile } from "@/lib/macro-report";
import { closedBy, newYorkClock } from "@/lib/market-day";
import { EMPTY_CLOSES, EMPTY_MARKETS, type Closes } from "@/lib/markets";
import { pricedOf } from "@/lib/event-odds";
import { loadCloses, loadEventBets, loadMarkets } from "@/lib/markets-feed";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelRequest } from "@/lib/model-provider";
import { EMPTY_RECORDS, preferencesSchema, recordsSchema } from "@/lib/preferences";
import { EMPTY_RESEARCH_CACHE, researchCacheSchema, runRecord, withRun } from "@/lib/research-agent";
import { setupSchema } from "@/lib/setup";
import { statementsFileSchema, withStatements } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

export type MacroRun = { written: number; sentence: string; problem: string | null };

/**
 * The reports after the macro events whose session has closed
 * (lib/macro-report.ts): the markets' and the book's moves and history from
 * the closes, what the event touches in the book, and the
 * outcome read from the web on the person's own key, behind the agent's
 * switch and weekly ceiling. Each report is kept and laid on the alerts
 * with its moves (no deck, Hamza, 29 Oct 2026), so the
 * close's notification and the alert check's email carry it. Before each
 * event, the deeper of Kalshi's and Polymarket's prices on it are kept so the
 * report can set what was priced beside what came. Null when nothing was due or kept; `force` is Run now on
 * Agents. The log gets counts, never a symbol.
 */
export async function readMacroReportsInto(vault: Vault, now: Date = new Date(), force = false): Promise<MacroRun | null> {
  const today = localDay(now);
  const nowIso = now.toISOString();
  const [file, found, setup, fileBook, records, filings, statements, brokers, preferences, research, hostedAi] = await Promise.all([
    vault.readJson("macro_reports", macroReportsFileSchema).catch(() => null),
    vault.readJson("calendar_events", calendarFoundSchema).catch(() => null),
    vault.readJson("setup", setupSchema).catch(() => null),
    vault.readJson("book", bookSchema).catch(() => null),
    vault.readJson("records", recordsSchema).catch(() => null),
    vault.readJson("filings", filingsFileSchema).catch(() => null),
    vault.readJson("statements", statementsFileSchema).catch(() => null),
    vault.readJson("brokers", brokersFileSchema).catch(() => null),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
    vault.readJson("research_cache", researchCacheSchema).catch(() => null),
    providerFor(vault),
  ]);
  const events = [...ECON_EVENTS, ...foundEvents(found)];
  let next: MacroReportsFile = file ?? EMPTY_MACRO;
  let changed = false;

  // What the markets price for each event today or tomorrow, kept until it happens (the Fed from 27 Oct 2026, every kind from 28 Oct).
  const ny = newYorkClock(now);
  const soon = pricedSoon(events, today).filter((e) => stillPriced(e, now, ny));
  if (soon.length) {
    const effr = soon.some((e) => e.kind === "fomc") ? ((await loadMarkets(today).catch(() => null))?.rows.find((r) => r.symbol === "EFFR")?.level ?? null) : null;
    const bets = await loadEventBets(soon, effr, now).catch(() => ({}) as Awaited<ReturnType<typeof loadEventBets>>);
    for (const e of soon) {
      const bet = bets[macroKey(e)]?.bet ?? null;
      const laid = withPriced(next, e, bet ? { prices: pricedOf(bet), by: bet.source } : null, nowIso);
      if (laid !== next) {
        next = laid;
        changed = true;
      }
    }
  }

  const agent = agentById("macro_reports")!;
  const off = preferences?.agentsOff ?? [];
  const gate = mayRun(agent, off, preferences?.agentBudgets ?? {}, research?.runs ?? [], nowIso);
  const provider = hostedAi;
  const cannot = !provider ? "The AI is not set up on this deployment yet." : providerCannot(provider, "web_search");
  const modelNote = cannot ?? (gate.ok ? null : gate.sentence);
  const canRead = !modelNote || (force && !off.includes(agent.id) && !cannot);
  const due = macroDue(events, next, canRead, nowIso).slice(0, MACRO_PER_RUN);
  if (!due.length) {
    if (changed) await vault.writeJson("macro_reports", macroReportsFileSchema.parse(next));
    return force ? { written: 0, sentence: "No event's report is owed.", problem: null } : null;
  }

  const base = setup?.baseCurrency ?? "USD";
  const raw = withBrokers(withStatements(fileBook, statements, base, today).book, brokers, base, today).book;
  const m = setup?.methodology ?? null;
  const book = composeBook(raw, { records: records ?? EMPTY_RECORDS, filings, research: null, markets: EMPTY_MARKETS, methodology: m });
  const weights = listedWeights(book);
  const tickers = [...new Set([...weights.map((w) => w.symbol), ...due.flatMap((e) => gaugesFor(e.area).map((g) => g.symbol))])].sort();
  const closes: Closes = await loadCloses(tickers.join(","), today, "full", SENSITIVITY_DAYS).catch((): Closes => ({ ...EMPTY_CLOSES, problems: ["The price feed could not be read."] }));
  const bench = closes.series.SPY ?? [];

  const model = provider ? modelFor(provider, process.env.ANTHROPIC_MACRO_MODEL || MACRO_MODEL) : MACRO_MODEL;
  const steps: RunStep[] = [];
  const kept = new Map(next.reports.map((r) => [r.key, r]));
  let written = 0;
  const failures: string[] = [];
  const closed = closedBy(now);
  for (const e of due) {
    const session = tradedOn(e);
    // One step (Hamza, 7 Nov 2026): read half an hour after the event, the session that trades it often still open; its closes are kept when they are in.
    const open = session > closed || !bench.some((c) => c.date === session);
    const hours = retryHours(e, nowIso);
    const key = macroKey(e);
    const before = kept.get(key) ?? null;
    const priced = before?.priced ?? next.priced[key]?.prices ?? null;
    const pricedBy = before?.priced ? (before.pricedBy ?? null) : (next.priced[key]?.by ?? null);
    const first = macroFigures(e, session, weights, closes.series, bench, before?.outcome?.label ?? null, priced);
    let outcome: MacroReport["outcome"] = null;
    let note: string | null = modelNote && !canRead ? modelNote : null;
    let tried = false;
    let news: boolean | null = null;
    if (canRead && provider && (!before?.outcome?.final || before.stage === "outcome")) {
      tried = true;
      try {
        const answer = await callModel(provider, macroRequestBody(e, session, { ...first, priced, pricedBy }, model, before?.outcome && !before.outcome.final ? { decided: before.outcome.decided, readAt: before.triedAt ?? before.updatedAt } : null, hours) as ModelRequest);
        const u = usageOf(answer);
        const parsed = parseMacroResponse(answer, e.kind);
        steps.push({ id: "outcome", model, read: 1, kept: parsed.ok ? 1 : 0, tokensIn: u.input + u.cacheRead + u.cacheWrite, tokensOut: u.output, searches: u.searches, costUsd: costOf(model, u), note: parsed.ok ? null : parsed.reason });
        if (parsed.ok) {
          outcome = parsed.outcome;
          news = parsed.news;
        }
        else note = `Your Claude's reading came back unread: ${parsed.reason}. Read again in ${hours} hours.`;
      } catch (err) {
        if (!(err instanceof SyncError)) throw err;
        console.error(`[macro] outcome: ${err.logDetail ?? "failed"}`);
        note = `${err.message.slice(0, 300)} Read again in ${hours} hours.`;
      }
      if (note) failures.push(note);
    }
    const computed = outcome ? macroFigures(e, session, weights, closes.series, bench, outcome.label, priced) : first;
    // Before the close there are no moves to keep; the history on the kind of event stands.
    const figures = open ? { ...computed, markets: [], book: null, bookNote: null } : computed;
    const reach = book && e.area ? reachWords(eventReach(e.kind, e.area as EconArea, book, m)) : [];
    // Nothing read and nothing kept (no key, the agent off) keeps nothing while the session is open: it is tried at the next run.
    if (open && !outcome && !before) continue;
    const report = macroReportOf(e, session, figures, priced, reach, { outcome, note, tried, news, hours }, before, nowIso, pricedBy);
    next = withMacroReport(next, report, nowIso);
    written += 1;
  }
  if (!written && !changed) return force ? { written: 0, sentence: "Nothing new to report.", problem: null } : null;
  await vault.writeJson("macro_reports", macroReportsFileSchema.parse(next));
  if (written) {
    const alerts = await vault.readJson("alerts", alertsFileSchema).catch(() => null);
    await vault.writeJson("alerts", reconcilePrefix(alerts, MACRO_PREFIX, macroNotices(next, today), nowIso).file);
  }
  const sentence = `${written} event report${written === 1 ? "" : "s"} written${failures.length ? `; ${failures.length} outcome${failures.length === 1 ? "" : "s"} not read yet` : ""}${modelNote && !canRead ? `. ${modelNote}` : "."}`.slice(0, 400);
  if (steps.length) {
    const runs = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? research ?? EMPTY_RESEARCH_CACHE;
    const cost = steps.reduce((s, x) => s + (x.costUsd ?? 0), 0);
    await vault.writeJson("research_cache", withRun(runs, runRecord("macro_reports", due[0].date, now, { steps, findings: steps.filter((x) => x.kept).length, costUsd: cost, sentence, failed: steps.every((x) => !x.kept) }), now));
  }
  console.info(`[macro] ${written} written, ${failures.length} outcomes unread`);
  return { written, sentence, problem: force && failures.length ? failures[0] : null };
}
