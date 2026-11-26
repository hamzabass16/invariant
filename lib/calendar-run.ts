import "server-only";

import { isShut } from "@/lib/licences";

import { eventLinks, REPORTS_BACK_DAYS, reportEvent } from "@/lib/calendar-links";
import { ECON_EVENTS, linkKey, reachKey, type EconEvent, type EventLink } from "@/lib/econ-calendar";
import { econReachWords, eventReaches, reachWords } from "@/lib/econ-exposure";
import { calendarFoundSchema, foundEvents } from "@/lib/calendar-agent";
import { companyHref } from "@/lib/company";
import { earningsFileSchema, earningsSubjects, entriesFor, REACTION_BENCHMARK, TIME_LABEL, type EarningsEntry, type EarningsReport } from "@/lib/earnings";
import { earningsSensitivity, earningsView, eventSensitivity, listedWeights, sensitivityView, type SensitivityView } from "@/lib/event-sensitivity";
import { expectedFor, type ExpectedMove } from "@/lib/expected-move";
import type { FilingsFile } from "@/lib/filings";
import type { Book } from "@/lib/holdings";
import { EMPTY_CLOSES, type Closes } from "@/lib/markets";
import { betKey, betSourceWords, betView, ODDS_BUDGET_MS, ODDS_DAYS, type BetView } from "@/lib/event-odds";
import { eventOf, macroKey, type MacroReport } from "@/lib/macro-report";
import { loadCloses, loadEarnings, loadEventBets } from "@/lib/markets-feed";
import type { Methodology } from "@/lib/methodology";
import type { EdgarContact, Preferences, Records } from "@/lib/preferences";
import { reactionHistory } from "@/lib/reaction-history";
import { addDaysTo } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/** Closes far enough back to reach the event table's first year. */
export const SENSITIVITY_DAYS = 2900;
/** Results this far ahead get their company's past reactions read. */
export const EARNINGS_SENSITIVITY_DAYS = 45;

export type CalendarInput = {
  book: Book | null;
  methodology: Methodology | null;
  entries: readonly EarningsEntry[];
  reports: readonly EarningsReport[];
  expected: readonly ExpectedMove[] | undefined;
  filings: FilingsFile | null;
  contact: EdgarContact | null;
  today: string;
  wait: "budget" | "full";
  /** Events the person's Calendar agent found, beside the table. */
  found?: readonly EconEvent[];
  /** The reports after macro events, each opened from its event (Hamza, 6 Nov 2026). */
  macroReports?: readonly MacroReport[];
};

export type CalendarView = {
  events: EconEvent[];
  /** What each event touches in the book, as sentences, by reachKey. */
  reach: Record<string, string[]>;
  /** The historical sensitivity of each kind of event, by reachKey. */
  sensitivity: Record<string, SensitivityView>;
  /** What the prediction markets bet on each event ahead, by `betKey`: the market, or why none is shown (Hamza, 28 Oct 2026). */
  bets: Record<string, { bet: BetView | null; note: string }>;
  /** What each event opens once it has a report, by linkKey: past results their earnings report, a macro event its report (Hamza, 6 Nov 2026). */
  links: Record<string, EventLink>;
  notes: string[];
};


/** A followed company's results as a calendar event. */
export function resultsEvent(e: EarningsEntry, expected?: readonly ExpectedMove[]): EconEvent {
  const kind = e.kind === "holding" ? "a holding" : e.kind === "watch" ? "on your watchlist" : "a company you follow";
  const est = e.epsForecast !== null ? ` Analysts' EPS estimate $${e.epsForecast.toFixed(2)}.` : "";
  const moved = expectedFor(expected ? [...expected] : undefined, e.symbol, e.date);
  const priced = moved ? ` The options price a move of ${moved.pct.toFixed(1)}% either way.` : "";
  return {
    date: e.date,
    kind: "earnings",
    area: "us",
    symbol: e.symbol.toUpperCase(),
    short: e.symbol.toUpperCase(),
    name: `${e.symbol.toUpperCase()} results`,
    time: e.time === "unknown" ? "Time not given" : TIME_LABEL[e.time],
    about: `${e.subjectName ?? e.symbol}, ${kind}${e.quarter ? `, for ${e.quarter.replace("/", " ")}` : ""}.${est}${priced}`,
    source: companyHref(e.symbol),
    indicator: null,
  };
}

/**
 * The one calendar (Hamza, 27 Oct 2026): the releases, decisions, elections,
 * summits and deadlines, the followed companies' results and what the
 * Calendar agent found, each with what it touches in the book and how the
 * book took the same kind of event before.
 */
export async function calendarView(i: CalendarInput): Promise<CalendarView> {
  const notes: string[] = [];
  const results = i.entries.filter((e) => e.date >= addDaysTo(i.today, -7)).map((e) => resultsEvent(e, i.expected));
  const from = addDaysTo(i.today, -REPORTS_BACK_DAYS);
  // Past results with a kept report, and past macro events with one, so each opens its report.
  const seen = new Set(results.map((e) => `${e.symbol}|${e.date}`));
  const past = i.reports.filter((r) => r.date >= from && r.date < i.today && (r.status === "release" || r.status === "complete") && !seen.has(`${r.symbol.toUpperCase()}|${r.date}`)).map(reportEvent);
  const table = [...ECON_EVENTS, ...(i.found ?? [])];
  const macro = (i.macroReports ?? []).filter((m) => m.date >= from);
  const macroPast = macro.filter((m) => !table.some((e) => macroKey(e) === m.key)).map((m) => eventOf(m));
  const events = [...new Map([...table, ...macroPast, ...results, ...past].map((e) => [linkKey(e), e])).values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const links = eventLinks(events, i.reports, macro);
  const ahead = events.filter((e) => e.date >= i.today);
  const reach: Record<string, string[]> = Object.fromEntries(Object.entries(eventReaches(ahead, i.book, i.methodology)).map(([k, r]) => [k, reachWords(r)]));
  const weights = listedWeights(i.book);
  for (const e of results) {
    const w = weights.find((x) => x.symbol === e.symbol)?.weight ?? 0;
    reach[reachKey(e)] = [w > 0 ? `${e.symbol} is ${(w * 100).toFixed(1)}% of your book.` : `${e.symbol} is not in your book.`];
  }
  const sensitivity: Record<string, SensitivityView> = {};
  const soon = results.filter((e) => e.date >= i.today && e.date <= addDaysTo(i.today, EARNINGS_SENSITIVITY_DAYS));
  const tickers = [...new Set([...weights.map((w) => w.symbol), ...soon.map((e) => e.symbol!), REACTION_BENCHMARK])].sort();
  const closes: Closes =
    tickers.length > 1
      ? await loadCloses(tickers.join(","), i.today, i.wait, SENSITIVITY_DAYS).catch(
          (): Closes => ({
            ...EMPTY_CLOSES,
            problems: ["The price feed could not be read."],
          }),
        )
      : EMPTY_CLOSES;
  const bench = closes.series[REACTION_BENCHMARK] ?? [];
  if (!bench.length) notes.push("SPY's closes could not be read, so the history of each event is not drawn yet.");
  // What the markets bet on each event of the next fortnight: the deeper of Kalshi and Polymarket with a question that is the event's own (Hamza, 28 Oct 2026).
  const effr = i.book?.markets?.rows.find((r) => r.symbol === "EFFR")?.level ?? null;
  const asked = ahead.filter((e) => e.kind !== "earnings" && e.date <= addDaysTo(i.today, ODDS_DAYS));
  type Bets = Awaited<ReturnType<typeof loadEventBets>>;
  const reading = asked.length ? loadEventBets(asked, effr).catch((): Bets => ({})) : Promise.resolve<Bets>({});
  // On a page the markets get a short budget; the reads go on behind it and the next visit finds them cached.
  const read = i.wait === "budget" ? await Promise.race([reading, new Promise<Bets | null>((r) => setTimeout(() => r(null), ODDS_BUDGET_MS))]) : await reading;
  if (read === null) notes.push("The prediction markets are still being read; they show on the next visit.");
  const bets: CalendarView["bets"] = {};
  for (const e of asked) {
    const r = read?.[macroKey(e)];
    if (r) bets[betKey(e)] = { bet: r.bet ? betView(r.bet) : null, note: r.note };
  }
  if (bench.length && weights.length) {
    const kinds = new Map<string, EconEvent>();
    for (const e of ahead) if (e.kind !== "earnings" && !kinds.has(reachKey(e))) kinds.set(reachKey(e), e);
    for (const [k, e] of kinds) {
      // The next occurrence at the markets' prices, where their question lines up with the history's outcomes.
      const bet = read?.[macroKey(e)]?.bet ?? null;
      const s = eventSensitivity(e, weights, closes.series, bench, bet?.prices ?? null, bet?.prices ? bet.source : null);
      if (s && (s.rows.length || s.note)) {
        const view = sensitivityView(s);
        sensitivity[k] = bet && s.expected ? { ...view, words: [...view.words, betSourceWords(bet)] } : view;
      }
    }
  }
  for (const e of soon) {
    const points = closes.series[e.symbol!] ?? [];
    if (!points.length) continue;
    const cik = i.filings?.bySymbol[e.symbol!]?.cik ?? null;
    const { releaseDaysFor } = await import("@/lib/company-run");
    const releases =
      cik && i.contact
        ? await releaseDaysFor(cik, i.contact, i.today).catch(() => ({
            days: [],
            problem: null,
          }))
        : { days: [], problem: null };
    const history = reactionHistory({
      symbol: e.symbol!,
      releases: releases.days,
      reports: i.reports.filter((r) => r.status !== "failed"),
      closes: points,
      bench,
      settled: addDaysTo(i.today, -1),
      expected: i.expected,
    });
    const moves = history.rows.map((r) => r.movePct / 100);
    const priced = expectedFor(i.expected ? [...i.expected] : undefined, e.symbol!, e.date)?.pct ?? null;
    const s = earningsSensitivity(moves, weights.find((w) => w.symbol === e.symbol)?.weight ?? 0, priced);
    if (s) sensitivity[reachKey(e)] = earningsView(e.symbol!, s);
  }
  if (closes.problems.length && !notes.length) notes.push(`${closes.problems.length} compan${closes.problems.length === 1 ? "y's" : "ies'"} closes could not be read; the history counts them as still.`);
  return { events, reach, sensitivity, bets, links, notes };
}

/**
 * The calendar read from a vault, for the weekly review's Next week on the
 * calendar (lib/report.ts withWeekAhead): the Nasdaq calendar waited for in
 * full, the earnings file and what the Calendar agent found. A part that
 * cannot be read leaves it out and says so.
 */
export async function calendarFromVault(vault: Vault, book: Book, methodology: Methodology | null, filings: FilingsFile | null, preferences: Preferences, records: Records, today: string): Promise<CalendarView> {
  const [{ calendar, pending }, kept, found] = await Promise.all([loadEarnings(today, "full"), vault.readJson("earnings", earningsFileSchema).catch(() => null), vault.readJson("calendar_events", calendarFoundSchema).catch(() => null)]);
  const entries = entriesFor(calendar, earningsSubjects(book, records.bySymbol, preferences.earnings));
  const view = await calendarView({ book, methodology, entries, reports: kept?.reports ?? [], expected: kept?.expected, filings, contact: preferences.edgarContact ?? null, today, wait: "full", found: foundEvents(found) });
  return calendar ? view : { ...view, notes: [...view.notes, isShut(pending ?? "") ? pending! : "The earnings calendar could not be read, so your companies' results are left out."] };
}

export { econReachWords, listedWeights };
