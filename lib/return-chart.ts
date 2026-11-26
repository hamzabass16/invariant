import type { Book } from "@/lib/holdings";
import { lastSession, newYorkDateOf, type LiveQuote } from "@/lib/live";
import { addDays, addMonths, benchmarkIndex, navIndex, valueOnOrBefore } from "@/lib/performance";

/**
 * The Dashboard's chart of the book against SPY and QQQ (Hamza, 15 Oct
 * 2026): the time-weighted return or the value of the book over a period
 * the person picks, live while the US market is open. Pure: the data is
 * built once on the server from the book's own series and the benchmark
 * series the markets feed lends it, and the client turns a mode, a period
 * and the live prices into lines with no fetch of its own. In value mode
 * the benchmarks are drawn as what the book's starting value would be worth
 * in each, so the three lines share one axis.
 */

export const CHART_PERIODS = ["YTD", "3M", "6M", "1Y", "2Y", "5Y", "Custom"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
export const CHART_MODES = ["return", "value"] as const;
export type ChartMode = (typeof CHART_MODES)[number];
export const MODE_LABEL: Record<ChartMode, string> = { return: "Return", value: "Value" };

export type ReturnChartData = {
  /** The book's own dates, oldest first. */
  dates: string[];
  /** The book's value in its base currency on each date. */
  nav: number[];
  /** The time-weighted index (deposits and withdrawals taken out), 100 at the first date. */
  index: number[];
  /** Each benchmark's close on or before each date; null before its series starts. */
  benchmarks: Record<string, (number | null)[]>;
  currency: string;
  asOf: string;
};

const MONTHS: Partial<Record<ChartPeriod, number>> = { "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60 };

/** The book's series and the benchmarks named, aligned to the book's dates; null without a value series. */
export function returnChartData(book: Book, benchmarks: readonly string[]): ReturnChartData | null {
  const idx = navIndex(book);
  if (!idx) return null;
  const out: Record<string, (number | null)[]> = {};
  for (const symbol of benchmarks) {
    const bi = benchmarkIndex(book, symbol);
    if (!bi) continue;
    out[symbol] = idx.dates.map((d) => valueOnOrBefore(bi.dates, bi.index, d));
  }
  return { dates: idx.dates, nav: idx.nav, index: idx.index, benchmarks: out, currency: book.fx.base, asOf: book.asOf };
}

export type CustomWindow = { from: string; to: string };

/** The window a period names, clipped to the series: YTD from the last day of the year before, a count of months back, or the custom dates. */
export function chartWindow(period: ChartPeriod, custom: CustomWindow | null, first: string, asOf: string): { from: string; to: string } {
  if (period === "Custom" && custom && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) && custom.from < custom.to) {
    return { from: custom.from < first ? first : custom.from, to: custom.to > asOf ? asOf : custom.to };
  }
  if (period === "YTD") {
    const from = `${+asOf.slice(0, 4) - 1}-12-31`;
    return { from: from < first ? first : from, to: asOf };
  }
  const months = MONTHS[period] ?? 12;
  const from = addDays(addMonths(asOf, -months), -1);
  return { from: from < first ? first : from, to: asOf };
}

export type ChartLive = { bookRatio: number | null; quotes: readonly LiveQuote[]; now: Date };

export type ChartLine = { key: string; label: string; values: (number | null)[] };
export type ChartOut = {
  dates: string[];
  lines: ChartLine[];
  from: string;
  to: string;
  /** True when the last point is today's prices rather than a close. */
  live: boolean;
  /** The book's figure at the end: the return in percent, or the value. */
  end: number | null;
};

const BOOK_KEY = "book";

/**
 * The lines for a mode and a period: the book first, then each benchmark.
 * Return mode rebases every series to 0% at the window's first point; value
 * mode draws the book's value and each benchmark as the book's starting value
 * grown by that benchmark. With live prices from a session after the book's
 * last date (today's while the market is open, the last session's after the
 * close), one more point is appended for that session: the book at its live
 * ratio, each benchmark at its quote over its previous close (a quote not
 * dated that session is not used).
 */
export function chartSeries(data: ReturnChartData, mode: ChartMode, period: ChartPeriod, custom: CustomWindow | null, live: ChartLive | null): ChartOut {
  const w = chartWindow(period, custom, data.dates[0], data.asOf);
  // The first point on or before `from`, so a window that starts on a weekend reads from the close before it.
  let i0 = 0;
  for (let i = 0; i < data.dates.length; i++) if (data.dates[i] <= w.from) i0 = i;
  const keep: number[] = [];
  for (let i = i0; i < data.dates.length; i++) if (data.dates[i] <= w.to) keep.push(i);
  if (!keep.length) return { dates: [], lines: [], from: w.from, to: w.to, live: false, end: null };
  const dates = keep.map((i) => data.dates[i]);
  const nav = keep.map((i) => data.nav[i]);
  const index = keep.map((i) => data.index[i]);
  const bench: Record<string, (number | null)[]> = {};
  for (const [k, v] of Object.entries(data.benchmarks)) bench[k] = keep.map((i) => v[i]);

  // The last session's prices (today's while the market is open), when the window reaches the book's last date and the market has moved since.
  let isLive = false;
  if (live && live.bookRatio !== null && w.to === data.asOf && dates[dates.length - 1] === data.dates[data.dates.length - 1]) {
    const today = lastSession(live.now);
    if (today > dates[dates.length - 1]) {
      isLive = true;
      dates.push(today);
      nav.push(nav[nav.length - 1] * live.bookRatio);
      index.push(index[index.length - 1] * live.bookRatio);
      for (const k of Object.keys(bench)) {
        const q = live.quotes.find((x) => x.symbol.toUpperCase() === k);
        const last = bench[k][bench[k].length - 1];
        bench[k].push(q && last !== null && newYorkDateOf(q.time) === today ? last * (q.price / q.prevClose) : null);
      }
    }
  }

  const n0 = nav[0];
  const x0 = index[0];
  const rebase = (v: number | null, base: number | null) => (v === null || base === null || base <= 0 ? null : (v / base - 1) * 100);
  const lines: ChartLine[] = [];
  if (mode === "return") {
    lines.push({ key: BOOK_KEY, label: "Your portfolio", values: index.map((v) => rebase(v, x0)) });
    for (const [k, v] of Object.entries(bench)) lines.push({ key: k, label: k, values: v.map((x) => rebase(x, v[0])) });
  } else {
    lines.push({ key: BOOK_KEY, label: "Your portfolio", values: nav.slice() });
    for (const [k, v] of Object.entries(bench)) {
      const b0 = v[0];
      lines.push({ key: k, label: `${n0 > 0 ? "Same money in " : ""}${k}`, values: v.map((x) => (x === null || b0 === null || b0 <= 0 ? null : (x / b0) * n0)) });
    }
  }
  const book = lines[0].values;
  const end = book.length ? book[book.length - 1] : null;
  return { dates, lines, from: dates[0], to: dates[dates.length - 1], live: isLive, end };
}
