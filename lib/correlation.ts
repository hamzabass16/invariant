/**
 * The correlation matrix on Holdings: every listed holding against every
 * other, and against the benchmarks, from daily closes over one window.
 * Each pair reads the daily returns both series have on the window's
 * sessions; nothing is estimated, and a series that does not cover the
 * window is named, never filled. Pure.
 */
import type { Book } from "@/lib/holdings";
import { valueOnOrBefore } from "@/lib/performance";

export const MATRIX_WINDOWS = ["1M", "3M", "1Y"] as const;
export type MatrixWindow = (typeof MATRIX_WINDOWS)[number];
/** Trading sessions in each window. */
export const MATRIX_SESSIONS: Record<MatrixWindow, number> = { "1M": 21, "3M": 63, "1Y": 252 };
export const MATRIX_WINDOW_WORDS: Record<MatrixWindow, string> = { "1M": "one month", "3M": "three months", "1Y": "one year" };
/** Below this many paired returns a coefficient means little, so the cell is left empty. */
export const MIN_RETURNS = 15;
/** The market's two references the feed always carries; the matrix reads them after any benchmark the methodology names. */
export const DEFAULT_MATRIX_BENCHMARKS = ["SPY", "QQQ"] as const;

export type MatrixSeries = { symbol: string; kind: "holding" | "benchmark"; points: readonly { date: string; value: number }[] };

export type CorrelationMatrix = {
  window: MatrixWindow;
  /** Sessions in the window, from the first to the last date. */
  sessions: number;
  from: string;
  to: string;
  rows: { symbol: string; kind: "holding" | "benchmark" }[];
  /** r[i][j], symmetric, 1 on the diagonal; null where the pair has too few common returns. */
  r: (number | null)[][];
  /** Series that could not be read on the window, each with why. */
  left: { symbol: string; why: string }[];
  /** The average of every holding pair, when there are two or more. */
  average: number | null;
};

export function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length < 3 || a.length !== b.length) return null;
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb))) : null;
}

function clean(points: readonly { date: string; value: number }[], to: string): { dates: string[]; values: number[] } {
  const byDate = new Map<string, number>();
  for (const p of points) if (p.date <= to && Number.isFinite(p.value) && p.value > 0) byDate.set(p.date, p.value);
  const dates = [...byDate.keys()].sort();
  return { dates, values: dates.map((d) => byDate.get(d) as number) };
}

/** Daily returns on the calendar's sessions; null on a session the series had not started by. */
function returnsOn(calendar: readonly string[], s: { dates: string[]; values: number[] }): (number | null)[] {
  const path = calendar.map((d) => valueOnOrBefore(s.dates, s.values, d));
  const out: (number | null)[] = [];
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    out.push(a !== null && b !== null && a > 0 ? b / a - 1 : null);
  }
  return out;
}

/** The pair's coefficient over the sessions both series have; null below MIN_RETURNS. */
function pairR(x: readonly (number | null)[], y: readonly (number | null)[]): number | null {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] === null || y[i] === null) continue;
    a.push(x[i] as number);
    b.push(y[i] as number);
  }
  return a.length >= MIN_RETURNS ? pearson(a, b) : null;
}

/**
 * The matrix over the last `window` sessions to `to`. The calendar is the
 * sessions of the densest series over the last year (daily closes, never a
 * weekly series), a benchmark's first among equals.
 * Null when fewer than two series can be read.
 */
export function correlationMatrix(series: readonly MatrixSeries[], to: string, window: MatrixWindow): CorrelationMatrix | null {
  const cleaned = series.map((s) => ({ ...s, c: clean(s.points, to) }));
  const left: { symbol: string; why: string }[] = [];
  const usable = cleaned.filter((s) => {
    if (s.c.dates.length >= 2) return true;
    left.push({ symbol: s.symbol, why: "no daily closes" });
    return false;
  });
  if (usable.length < 2) return null;
  // The densest series over the last year sets the sessions, a benchmark first among equals: a weekly series never sets a daily window.
  const yearAgo = new Date(Date.parse(`${to}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const recent = (x: (typeof usable)[number]) => x.c.dates.filter((d) => d >= yearAgo).length;
  const anchor = [...usable].sort((a, b) => recent(b) - recent(a) || (a.kind === "benchmark" ? -1 : 0) - (b.kind === "benchmark" ? -1 : 0))[0];
  const calendar = anchor.c.dates.slice(-(MATRIX_SESSIONS[window] + 1));
  if (calendar.length < MIN_RETURNS + 1) return null;
  const rets = new Map<string, (number | null)[]>();
  const rows: CorrelationMatrix["rows"] = [];
  for (const s of usable) {
    const r = returnsOn(calendar, s.c);
    const have = r.filter((v) => v !== null).length;
    if (have < MIN_RETURNS) {
      left.push({ symbol: s.symbol, why: have ? `closes on only ${have} of the ${calendar.length - 1} sessions` : "no closes in the window" });
      continue;
    }
    rets.set(s.symbol, r);
    rows.push({ symbol: s.symbol, kind: s.kind });
  }
  if (rows.length < 2) return null;
  const r = rows.map((a, i) => rows.map((b, j) => (i === j ? 1 : pairR(rets.get(a.symbol)!, rets.get(b.symbol)!))));
  const pairs: number[] = [];
  rows.forEach((a, i) =>
    rows.forEach((b, j) => {
      if (j > i && a.kind === "holding" && b.kind === "holding" && r[i][j] !== null) pairs.push(r[i][j] as number);
    }),
  );
  return {
    window,
    sessions: calendar.length - 1,
    from: calendar[0],
    to: calendar[calendar.length - 1],
    rows,
    r,
    left,
    average: pairs.length ? pairs.reduce((s, v) => s + v, 0) / pairs.length : null,
  };
}

/**
 * The series the matrix reads from a book: the listed holdings' closes in the
 * order given, then each benchmark's, from the book's own series or the
 * market feed, whichever is daily (more points); a weekly benchmark in a
 * broker's file would flatten every daily return it is paired with.
 */
export function matrixSeries(book: Book, symbols: readonly string[], benchmarks: readonly string[]): MatrixSeries[] {
  const closes = book.series?.holdings ?? {};
  const bench = book.series?.benchmarks ?? {};
  const markets = book.markets?.series ?? {};
  const denser = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined): readonly T[] => ((a?.length ?? 0) >= (b?.length ?? 0) ? (a ?? []) : (b ?? []));
  return [
    ...symbols.map((s) => ({ symbol: s, kind: "holding" as const, points: closes[s] ?? closes[s.toUpperCase()] ?? [] })),
    ...benchmarks.filter((b) => !symbols.includes(b)).map((b) => ({ symbol: b, kind: "benchmark" as const, points: denser(bench[b], markets[b.toUpperCase()]) })),
  ];
}

/** In words, for a cell's title and the table: how closely two series moved. */
export function describeR(r: number): string {
  const a = Math.abs(r);
  const how = a >= 0.8 ? "very closely" : a >= 0.6 ? "closely" : a >= 0.3 ? "loosely" : "barely";
  return r < 0 ? `moved against each other ${a >= 0.3 ? how : "slightly"}` : `moved together ${how}`;
}
