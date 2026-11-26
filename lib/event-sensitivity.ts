/**
 * The historical sensitivity of the book to the calendar's events (Hamza,
 * 27 Oct 2026: "how the portfolio would react in events with binary outcomes
 * based on history, forecasting portfolio and market reaction
 * mathematically"). For each past occurrence of a kind of event
 * (lib/event-history.ts), the move of today's book on the session that
 * traded on it, each listed holding at today's weight times its own close to
 * close move, beside SPY's, split by what the event decided (a cut, a hold or
 * a hike; inflation higher or not; unemployment up or not). Each outcome
 * gives its count, its mean with a 95% interval (Student's t), its range and
 * how often the book fell. Where the markets price the outcomes (the deeper
 * of Kalshi and Polymarket on the Fed), the expected move is the mean of each outcome weighted by its
 * price. This is history at today's weights, the app's arithmetic, and never
 * a promise of the next reaction; the screens say so.
 *
 * Earnings: each company's past reactions (lib/reaction-history.ts), up and
 * down, and the same moves at its weight in the book.
 *
 * Pure.
 */
import type { EconEvent, EconKind } from "@/lib/econ-calendar";
import { CPI_HISTORY, ECB_HISTORY, FOMC_HISTORY, JOBS_HISTORY, US_ELECTIONS } from "@/lib/event-history";
import { ownerValue } from "@/lib/exposure";
import type { Book } from "@/lib/holdings";
import { tCritical } from "@/lib/performance";

type Close = { date: string; value: number };
export type Weighted = { symbol: string; weight: number };

/** Each listed holding's share of the whole book, so cash and the unlisted stay still. */
export function listedWeights(book: Book | null): Weighted[] {
  if (!book) return [];
  const total = book.holdings.reduce((s, h) => s + ownerValue(h, book), 0);
  if (!(total > 0)) return [];
  const by = new Map<string, number>();
  for (const h of book.holdings) if (h.assetClass === "equity" || h.assetClass === "etf") by.set(h.symbol.toUpperCase(), (by.get(h.symbol.toUpperCase()) ?? 0) + ownerValue(h, book) / total);
  return [...by.entries()].map(([symbol, weight]) => ({ symbol, weight }));
}

/** A past occurrence and the outcome its publisher reported. */
export type PastEvent = { date: string; outcome: string; detail: string };

/** The kinds whose session is the next one: results counted overnight, a deadline at midnight. */
export const NEXT_SESSION: ReadonlySet<EconKind> = new Set(["election", "deadline"]);

const bp = (x: number) => `${x > 0 ? "+" : ""}${x} bp`;

/** The past occurrences of an event, with their outcomes; empty for a kind the table has no history of. */
export function pastEvents(e: Pick<EconEvent, "kind" | "area">): PastEvent[] {
  switch (e.kind) {
    case "fomc":
      return FOMC_HISTORY.map(([date, change]) => ({ date, outcome: change < 0 ? "Cut" : change > 0 ? "Hike" : "Hold", detail: bp(change) }));
    case "ecb":
      return ECB_HISTORY.map(([date, change]) => ({ date, outcome: change < 0 ? "Cut" : change > 0 ? "Hike" : "Hold", detail: bp(change) }));
    case "cpi":
      return CPI_HISTORY.slice(1).map(([date, v], i) => {
        const before = CPI_HISTORY[i][1];
        return { date, outcome: v > before ? "Inflation higher" : "Inflation not higher", detail: `${v.toFixed(1)}% from ${before.toFixed(1)}%` };
      });
    case "jobs":
      return JOBS_HISTORY.slice(1).map(([date, payrolls, rate], i) => {
        const before = JOBS_HISTORY[i][2];
        return { date, outcome: rate > before ? "Unemployment up" : "Unemployment not up", detail: `${payrolls.toLocaleString("en-US")}k jobs, ${rate.toFixed(1)}% from ${before.toFixed(1)}%` };
      });
    case "election":
      return e.area === "us" ? US_ELECTIONS.map((date) => ({ date, outcome: "US election", detail: "general election" })) : [];
    default:
      return [];
  }
}

/** The session that traded on an event of `date`, and the close before it; null when the closes do not reach it. */
export function sessionOf(dates: readonly string[], date: string, next = false): { session: string; before: string } | null {
  const i = dates.findIndex((d) => (next ? d > date : d >= date));
  if (i <= 0) return null;
  return { session: dates[i], before: dates[i - 1] };
}

const moveOn = (series: ReadonlyMap<string, number>, s: { session: string; before: string }) => {
  const a = series.get(s.before);
  const b = series.get(s.session);
  return a && b ? b / a - 1 : null;
};

export type Stat = { n: number; mean: number; lo: number; hi: number; min: number; max: number; down: number };

/** Count, mean with its 95% interval, range and the share of falls. */
export function statOf(xs: readonly number[]): Stat | null {
  if (!xs.length) return null;
  const n = xs.length;
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const half = n > 1 ? tCritical(n - 1) * (sd / Math.sqrt(n)) : 0;
  return { n, mean, lo: mean - half, hi: mean + half, min: Math.min(...xs), max: Math.max(...xs), down: xs.filter((x) => x < 0).length / n };
}

export type OutcomeRow = { outcome: string; book: Stat | null; spy: Stat | null; last: PastEvent & { book: number | null; spy: number | null } };

export type Sensitivity = {
  rows: OutcomeRow[];
  all: { book: Stat | null; spy: Stat | null };
  /** The share of today's book the past moves could read: listed holdings with closes on each session, on average. */
  covered: number;
  from: string | null;
  /** Each outcome's price in the prediction markets, when one is given, and the move it implies. */
  /** The book's and SPY's move at the markets' prices; `by` names whose prices (Kalshi, Polymarket). */
  expected: { book: number; spy: number; prices: Record<string, number>; by?: string | null } | null;
  note: string | null;
};

/**
 * Today's book on each past occurrence of the event. `weights` are each
 * listed holding's share of the whole book (cash and what has no closes stay
 * still), `closes` each one's daily closes, `bench` SPY's.
 */
export function eventSensitivity(e: Pick<EconEvent, "kind" | "area">, weights: readonly Weighted[], closes: Readonly<Record<string, readonly Close[]>>, bench: readonly Close[], prices: Readonly<Record<string, number>> | null = null, by: string | null = null): Sensitivity | null {
  const past = pastEvents(e);
  if (!past.length) return null;
  const dates = bench.map((c) => c.date);
  const spy = new Map(bench.map((c) => [c.date, c.value]));
  const series = new Map(weights.map((w) => [w.symbol, new Map((closes[w.symbol] ?? []).map((c) => [c.date, c.value]))]));
  const total = weights.reduce((s, w) => s + w.weight, 0);
  const seen: { p: PastEvent; book: number | null; spy: number | null; covered: number }[] = [];
  for (const p of past) {
    const s = sessionOf(dates, p.date, NEXT_SESSION.has(e.kind));
    if (!s) continue;
    let book = 0;
    let covered = 0;
    for (const w of weights) {
      const m = moveOn(series.get(w.symbol)!, s);
      if (m === null) continue;
      book += w.weight * m;
      covered += w.weight;
    }
    // A session most of the book had no close for is no reading of it.
    seen.push({ p, book: total > 0 && covered >= total * 0.5 ? book : null, spy: moveOn(spy, s), covered });
  }
  if (!seen.length) return { rows: [], all: { book: null, spy: null }, covered: 0, from: null, expected: null, note: "The closes the app reads do not reach any past occurrence." };
  const outcomes = [...new Set(past.map((p) => p.outcome))];
  const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
  const rows: OutcomeRow[] = outcomes
    .map((o) => {
      const of = seen.filter((x) => x.p.outcome === o);
      const last = of[of.length - 1];
      return of.length ? { outcome: o, book: statOf(nums(of.map((x) => x.book))), spy: statOf(nums(of.map((x) => x.spy))), last: { ...last.p, book: last.book, spy: last.spy } } : null;
    })
    .filter((r): r is OutcomeRow => r !== null);
  const all = { book: statOf(nums(seen.map((x) => x.book))), spy: statOf(nums(seen.map((x) => x.spy))) };
  let expected: Sensitivity["expected"] = null;
  if (prices) {
    const priced = rows.filter((r) => prices[r.outcome] !== undefined && r.book && r.spy);
    const sum = priced.reduce((s, r) => s + prices[r.outcome], 0);
    if (priced.length && sum > 0) expected = { book: priced.reduce((s, r) => s + (prices[r.outcome] / sum) * r.book!.mean, 0), spy: priced.reduce((s, r) => s + (prices[r.outcome] / sum) * r.spy!.mean, 0), prices: Object.fromEntries(priced.map((r) => [r.outcome, prices[r.outcome] / sum])), by };
  }
  const coveredAvg = seen.reduce((s, x) => s + x.covered, 0) / seen.length;
  return { rows, all, covered: total > 0 ? coveredAvg : 0, from: seen[0].p.date, expected, note: null };
}

export type EarningsSensitivity = { n: number; up: number; moves: Stat | null; absMean: number; bookMean: number; weight: number; expectedPct: number | null };

/** A company's past reactions to its results, and the same moves at its weight in the book; `expected` is the options' priced move, when read. */
export function earningsSensitivity(moves: readonly number[], weight: number, expectedPct: number | null = null): EarningsSensitivity | null {
  if (!moves.length) return null;
  const abs = moves.reduce((s, x) => s + Math.abs(x), 0) / moves.length;
  return { n: moves.length, up: moves.filter((x) => x > 0).length, moves: statOf(moves), absMean: abs, bookMean: abs * weight, weight, expectedPct };
}

const pct = (x: number, d = 2) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;

/** The sensitivity as sentences, for the calendar's alert, the weekly slide and the table's caption. */
export function sensitivityWords(s: Sensitivity): string[] {
  const out: string[] = [];
  if (s.note) return [s.note];
  for (const r of s.rows) {
    if (!r.book) continue;
    out.push(`${r.outcome} (${r.book.n} since ${s.from?.slice(0, 4)}): your book ${pct(r.book.mean)} on average, from ${pct(r.book.min)} to ${pct(r.book.max)}, against SPY ${r.spy ? pct(r.spy.mean) : "unread"}.`);
  }
  if (s.expected) out.push(`At ${s.expected.by ? `${s.expected.by}'s` : "the markets'"} prices (${Object.entries(s.expected.prices).map(([o, p]) => `${o} ${(p * 100).toFixed(0)}%`).join(", ")}), history puts your book at ${pct(s.expected.book)} and SPY at ${pct(s.expected.spy)} on the day.`);
  if (s.covered < 0.9) out.push(`${Math.round(s.covered * 100)}% of the book had closes on those days; the rest is counted as still.`);
  return out;
}

export function earningsWords(symbol: string, s: EarningsSensitivity): string[] {
  return [
    `${symbol} moved ${pct(s.absMean, 1).replace("+", "")} either way on average after its last ${s.n} results, up ${s.up} times and down ${s.n - s.up}; at ${(s.weight * 100).toFixed(1)}% of your book that is ${pct(s.bookMean, 2).replace("+", "")} of it.`,
    ...(s.expectedPct !== null ? [`The options price a move of ${s.expectedPct.toFixed(1)}% either way this time, or ${((s.expectedPct / 100) * s.weight * 100).toFixed(2)}% of your book.`] : []),
  ];
}

/** What a screen draws: the table's rows as text, and the sentences. */
export type SensitivityView = { title: string; rows: { outcome: string; n: number; book: string; range: string; spy: string; fell: string }[]; words: string[] };

const signed = (x: number) => pct(x);

export function sensitivityView(s: Sensitivity): SensitivityView {
  return {
    title: `On past occurrences since ${s.from?.slice(0, 4) ?? "the closes begin"}, at today's weights`,
    rows: s.rows.filter((r) => r.book).map((r) => ({ outcome: r.outcome, n: r.book!.n, book: `${signed(r.book!.mean)} (${signed(r.book!.lo)} to ${signed(r.book!.hi)})`, range: `${signed(r.book!.min)} to ${signed(r.book!.max)}`, spy: r.spy ? signed(r.spy.mean) : "unread", fell: `${Math.round(r.book!.down * 100)}%` })),
    words: sensitivityWords(s).filter((w) => !/ on average, from /.test(w)),
  };
}

export function earningsView(symbol: string, s: EarningsSensitivity): SensitivityView {
  return {
    title: `${symbol} after its last ${s.n} results`,
    rows: [],
    words: earningsWords(symbol, s),
  };
}
