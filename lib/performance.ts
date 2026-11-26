/**
 * Performance and risk statistics over the book's own series: the account's
 * value by day (`book.series.nav`, base currency) and any benchmark price
 * series a source supplied (`book.series.benchmarks`). Period returns, growth
 * of 100, drawdown, volatility, beta, Sharpe, Calmar and the monthly grid are
 * all derived here and nowhere else; no series, no figure.
 *
 * The account index is a time-weighted return: each day's return is the
 * change in value with that day's deposits and withdrawals taken out, so
 * money the person moved in or out never reads as a gain or a loss.
 *
 * Pure: imports nothing server-only. Every function is total on short data: a
 * figure that cannot be computed is null, or the whole result is null, never
 * a throw. Percents are plain numbers (3.2 for 3.2%); dates are ISO strings.
 * Returns are context, never the verdict.
 */
import { baseAmountOf, type Book } from "@/lib/holdings";
import { ownerValueOf } from "@/lib/ontology";
import { daysBetween, longDate } from "@/lib/time";

// ---------------------------------------------------------------- calendar

const DAY = 86_400_000;

const utc = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `date` plus n calendar days. */
export function addDays(date: string, n: number): string {
  return iso(utc(date) + n * DAY);
}

/** `date` plus n calendar months, the day clamped to the month's length. */
export function addMonths(date: string, n: number): string {
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7) - 1 + n;
  const d = +date.slice(8, 10);
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return iso(Date.UTC(yy, mm, Math.min(d, last)));
}

/** The last day of a YYYY-MM month. */
export function monthEnd(ym: string): string {
  return iso(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0));
}

const nextYm = (ym: string) => addMonths(`${ym}-01`, 1).slice(0, 7);

// ---------------------------------------------------------------- lookups

function bisectRight(dates: readonly string[], date: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The value at the last date on or before `date`; null before the first date. */
export function valueOnOrBefore(dates: readonly string[], values: readonly number[], date: string): number | null {
  const i = bisectRight(dates, date) - 1;
  return i >= 0 ? values[i] : null;
}

/** As valueOnOrBefore, but a date before the series takes its first value. */
function clamped(dates: readonly string[], values: readonly number[], date: string): number {
  return values[Math.max(0, bisectRight(dates, date) - 1)];
}

/** Points sorted by date, one per date (the last wins), dates on or before `until`. */
function cleanPoints(points: readonly { date: string; value: number }[], until?: string): { dates: string[]; values: number[] } {
  const byDate = new Map<string, number>();
  for (const p of points) if (!until || p.date <= until) byDate.set(p.date, p.value);
  const dates = [...byDate.keys()].sort();
  return { dates, values: dates.map((d) => byDate.get(d) as number) };
}

// ---------------------------------------------------------------- indices

export type NavIndex = { dates: string[]; nav: number[]; index: number[] };

/**
 * The account index, 100 at the first point, chain-linked by daily returns
 * with external flows removed:
 *
 *   r_t = (V_t − F_t) / V_{t−1} − 1
 *
 * where V_t is the value on date t and F_t the net of deposits (positive)
 * and withdrawals (negative) dated t, in base currency. A flow dated between
 * two points is taken out of the next point. This is a time-weighted return:
 * what the holdings did, not what the person added. Null below two points.
 */
export function navIndex(book: Book): NavIndex | null {
  const all = cleanPoints(book.series?.nav ?? []);
  // From the first day with money in it: a book kept before the funding day was trimmed opens on a zero, which has no return.
  const lead = Math.max(0, all.values.findIndex((v) => v > 0));
  const nav = { dates: all.dates.slice(lead), values: all.values.slice(lead) };
  if (nav.dates.length < 2) return null;
  const flows = new Map<string, number>();
  for (const t of book.transactions) {
    if (t.kind !== "deposit" && t.kind !== "withdrawal") continue;
    const base = baseAmountOf(t, book.fx);
    if (base === null) continue; // nothing converts it; `flowsLeftOut` says so on the screen
    const signed = t.kind === "deposit" ? Math.abs(base) : -Math.abs(base);
    const i = bisectRight(nav.dates, addDays(t.date, -1));
    if (i >= nav.dates.length) continue;
    const at = nav.dates[i];
    flows.set(at, (flows.get(at) ?? 0) + signed);
  }
  const index = [100];
  for (let t = 1; t < nav.dates.length; t += 1) {
    const prev = nav.values[t - 1];
    const r = prev > 0 ? (nav.values[t] - (flows.get(nav.dates[t]) ?? 0)) / prev - 1 : 0;
    index.push(index[t - 1] * (1 + r));
  }
  return { dates: nav.dates, nav: nav.values, index };
}

/** Deposits and withdrawals the index could not take out because nothing converts their currency. */
export function flowsLeftOut(book: Book): { currency: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of book.transactions) {
    if (t.kind !== "deposit" && t.kind !== "withdrawal") continue;
    if (baseAmountOf(t, book.fx) === null) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  }
  return [...counts.entries()].map(([currency, count]) => ({ currency, count })).sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

export type BenchmarkIndex = { dates: string[]; index: number[] };

/** A benchmark's price series rebased to 100 at its first point; null when the book lacks it or it has fewer than two points. */
export function benchmarkIndex(book: Book, symbol: string): BenchmarkIndex | null {
  const pts = cleanPoints(book.series?.benchmarks[symbol] ?? []);
  if (pts.dates.length < 2 || pts.values[0] <= 0) return null;
  return { dates: pts.dates, index: pts.values.map((v) => (v / pts.values[0]) * 100) };
}

// ---------------------------------------------------------------- windows

export const WINDOW_KEYS = ["3M", "YTD", "1Y", "Since start"] as const;
export type WindowKey = (typeof WINDOW_KEYS)[number];

export const PERIOD_KEYS = ["1M", "3M", "6M", "YTD", "1Y", "Since start"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type Window = { from: string; to: string };

const MONTHS_OF: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

/**
 * A named window ending at `asOf`, as (from, to]: `from` is the close before
 * the window's first day. "1Y" as of 10 Oct 2026 runs from the 9 Oct 2025
 * close; "YTD" from the last close of the year before; "Since start" from
 * the first point of the series.
 */
export function windowOf(key: PeriodKey | WindowKey, asOf: string, start: string): Window {
  if (key === "YTD") return { from: `${+asOf.slice(0, 4) - 1}-12-31`, to: asOf };
  if (key === "Since start") return { from: start, to: asOf };
  return { from: addDays(addMonths(asOf, -MONTHS_OF[key]), -1), to: asOf };
}

/** A window that begins up to a week before the series does still reads from its first point. */
const GRACE_DAYS = 7;

/** The cumulative return in percent of an index between the closes on or before `from` and `to`; null when the window reaches before the series by more than a week. */
export function returnOver(dates: readonly string[], index: readonly number[], from: string, to: string): number | null {
  if (to < from || !dates.length) return null;
  if (from < dates[0] && daysBetween(from, dates[0]) > GRACE_DAYS) return null;
  const a = clamped(dates, index, from);
  const b = clamped(dates, index, to);
  return a > 0 ? (b / a - 1) * 100 : null;
}

export type PeriodReturn = {
  key: PeriodKey;
  from: string;
  to: string;
  account: number | null;
  benchmarks: Record<string, number | null>;
  /** Why a figure is null: the series does not reach back that far. */
  note: string | null;
};

/** One row per period ending at `asOf`, cumulative returns in percent; null with a note where a series does not reach back far enough. */
export function periodReturns(book: Book, benchmarks: readonly string[], asOf: string): PeriodReturn[] {
  const idx = navIndex(book);
  const bench = benchmarks.map((s) => [s, benchmarkIndex(book, s)] as const);
  const start = idx?.dates[0] ?? asOf;
  return PERIOD_KEYS.map((key) => {
    const w = windowOf(key, asOf, start);
    const notes: string[] = [];
    const account = idx ? returnOver(idx.dates, idx.index, w.from, w.to) : null;
    if (idx && account === null) notes.push(`Account series begins ${longDate(idx.dates[0])}.`);
    const out: Record<string, number | null> = {};
    for (const [symbol, bi] of bench) {
      const v = bi ? returnOver(bi.dates, bi.index, w.from, w.to) : null;
      if (bi && v === null) notes.push(`${symbol} prices begin ${longDate(bi.dates[0])}.`);
      out[symbol] = v;
    }
    return { key, from: w.from, to: w.to, account, benchmarks: out, note: notes.length ? notes.join(" ") : null };
  });
}

/** Compound annual rate from a cumulative percent over `days`. */
export function annualise(cumulativePct: number, days: number): number | null {
  return days > 0 ? (Math.pow(1 + cumulativePct / 100, 365.25 / days) - 1) * 100 : null;
}

/** The window's first date inside the series: `from`, or the series start when the window reaches before it. */
function startInside(w: Window, first: string): string {
  return w.from < first ? first : w.from;
}

export type Growth = { from: string; to: string; dates: string[]; account: number[]; benchmarks: Record<string, (number | null)[]> };

/** What 100 at the start of the window grew to, by point, with each benchmark on the same dates. Null without an account series. */
export function growthOf100(book: Book, benchmarks: readonly string[], window: WindowKey): Growth | null {
  const idx = navIndex(book);
  if (!idx) return null;
  const w = windowOf(window, book.asOf, idx.dates[0]);
  const s0 = startInside(w, idx.dates[0]);
  if (w.to < s0) return null;
  const dates = [s0, ...idx.dates.filter((d) => d > s0 && d <= w.to)];
  const base = clamped(idx.dates, idx.index, s0);
  const account = dates.map((d) => (clamped(idx.dates, idx.index, d) / base) * 100);
  const out: Record<string, (number | null)[]> = {};
  for (const symbol of benchmarks) {
    const bi = benchmarkIndex(book, symbol);
    if (!bi) {
      out[symbol] = dates.map(() => null);
      continue;
    }
    const b0 = valueOnOrBefore(bi.dates, bi.index, s0) ?? (daysBetween(s0, bi.dates[0]) <= GRACE_DAYS ? bi.index[0] : null);
    out[symbol] = dates.map((d) => {
      const v = valueOnOrBefore(bi.dates, bi.index, d);
      return b0 && v ? (v / b0) * 100 : null;
    });
  }
  return { from: s0, to: w.to, dates, account, benchmarks: out };
}

// ---------------------------------------------------------------- drawdown

export type Drawdown = {
  from: string;
  to: string;
  dates: string[];
  /** Percent below the running high, 0 or negative. */
  values: number[];
  /** The deepest point below the high inside the window, 0 or negative. */
  maxDrawdown: number;
  /** The date of the deepest point. */
  troughDate: string;
  /** Percent below the high now, 0 at a high. */
  current: number;
  /** The date of the high-water mark. */
  highDate: string;
};

/** The gap below the running high, point by point, over the window. Null without an account series. */
export function drawdownSeries(book: Book, window: WindowKey): Drawdown | null {
  const idx = navIndex(book);
  if (!idx) return null;
  return drawdownOver(book, windowOf(window, book.asOf, idx.dates[0]));
}

/** The drawdown over any (from, to] window. */
export function drawdownOver(book: Book, w: Window): Drawdown | null {
  const idx = navIndex(book);
  if (!idx) return null;
  const s0 = startInside(w, idx.dates[0]);
  if (w.to < s0) return null;
  const dates = [s0, ...idx.dates.filter((d) => d > s0 && d <= w.to)];
  const values: number[] = [];
  let peak = 0;
  let highDate = s0;
  let maxDrawdown = 0;
  let troughDate = s0;
  for (const d of dates) {
    const v = clamped(idx.dates, idx.index, d);
    if (v > peak) {
      peak = v;
      highDate = d;
    }
    const dd = peak > 0 ? Math.min(0, (v / peak - 1) * 100) : 0;
    if (dd < maxDrawdown) {
      maxDrawdown = dd;
      troughDate = d;
    }
    values.push(dd);
  }
  return { from: s0, to: w.to, dates, values, maxDrawdown, troughDate, current: values[values.length - 1] ?? 0, highDate };
}

// ---------------------------------------------------------------- risk

const mean = (x: readonly number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);

/** Sample standard deviation; 0 below two points. */
function sdev(x: readonly number[]): number {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1));
}

/** Observations a year from the points' spacing: daily, weekly or monthly. */
function perYear(dates: readonly string[]): number {
  if (dates.length < 3) return 252;
  const gap = daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1);
  return gap <= 2 ? 252 : gap <= 8 ? 52 : 12;
}

export type RiskStats = {
  from: string;
  to: string;
  /** Calendar days the figures cover. */
  days: number;
  /** Returns in the sample. */
  n: number;
  /** Observations a year the annualised figures assume: 252, 52 or 12. */
  perYear: number;
  /** The risk-free rate used, a decimal a year (0 when the book carries none). */
  rate: number;
  twr: number | null;
  /** Annualised, percent. */
  volatility: number | null;
  beta: number | null;
  correlation: number | null;
  /** Excess over the rate, annualised. */
  sharpe: number | null;
  /** The worst single-period return, percent, 0 or negative. */
  worstFall: number | null;
  /** The worst peak-to-trough fall inside the window, percent, 0 or negative. */
  maxDrawdown: number | null;
  /** Annualised return over the size of the worst fall; a window of a year or more. */
  calmar: number | null;
};

/**
 * Volatility, beta and correlation against the benchmark, Sharpe, the worst
 * fall and Calmar over a window, from the account index's own points. Beta
 * and correlation need three paired returns; volatility and Sharpe two;
 * Calmar a year of window. Null without an account series.
 */
export function riskStats(book: Book, benchmark: string | null, window: WindowKey): RiskStats | null {
  const idx = navIndex(book);
  if (!idx) return null;
  return riskOver(book, benchmark, windowOf(window, book.asOf, idx.dates[0]));
}

/** The same statistics over any (from, to] window, for the weekly and monthly reviews. */
export function riskOver(book: Book, benchmark: string | null, w: Window): RiskStats | null {
  const idx = navIndex(book);
  if (!idx) return null;
  const s0 = startInside(w, idx.dates[0]);
  if (w.to < s0) return null;
  const dates = [s0, ...idx.dates.filter((d) => d > s0 && d <= w.to)];
  const path = dates.map((d) => clamped(idx.dates, idx.index, d));
  const r: number[] = [];
  for (let i = 1; i < path.length; i += 1) if (path[i - 1] > 0) r.push(path[i] / path[i - 1] - 1);
  const per = perYear(dates);
  const rate = book.market?.rate ?? 0;
  const last = dates[dates.length - 1];
  const days = daysBetween(s0, last);
  const twr = path[0] > 0 ? (path[path.length - 1] / path[0] - 1) * 100 : null;
  const dd = drawdownOver(book, w);

  let beta: number | null = null;
  let correlation: number | null = null;
  const bi = benchmark ? benchmarkIndex(book, benchmark) : null;
  if (bi) {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      const p = valueOnOrBefore(bi.dates, bi.index, dates[i - 1]);
      const q = valueOnOrBefore(bi.dates, bi.index, dates[i]);
      if (p === null || q === null || p <= 0 || path[i - 1] <= 0) continue;
      a.push(path[i] / path[i - 1] - 1);
      b.push(q / p - 1);
    }
    if (a.length >= 3) {
      const ma = mean(a);
      const mb = mean(b);
      let cov = 0;
      let va = 0;
      let vb = 0;
      for (let i = 0; i < a.length; i += 1) {
        cov += (a[i] - ma) * (b[i] - mb);
        va += (a[i] - ma) ** 2;
        vb += (b[i] - mb) ** 2;
      }
      beta = vb > 0 ? cov / vb : null;
      correlation = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null;
    }
  }

  const sd = sdev(r);
  const excess = r.map((v) => v - rate / per);
  const sdEx = sdev(excess);
  const annual = twr === null ? null : annualise(twr, days);
  return {
    from: s0,
    to: last,
    days,
    n: r.length,
    perYear: per,
    rate,
    twr,
    volatility: r.length >= 2 ? sd * Math.sqrt(per) * 100 : null,
    beta,
    correlation,
    sharpe: r.length >= 2 && sdEx > 0 ? (mean(excess) / sdEx) * Math.sqrt(per) : null,
    worstFall: r.length ? Math.min(0, Math.min(...r) * 100) : null,
    maxDrawdown: dd ? dd.maxDrawdown : null,
    calmar: dd && annual !== null && days >= 365 && dd.maxDrawdown < 0 ? annual / -dd.maxDrawdown : null,
  };
}

// ---------------------------------------------------------------- alpha, with how it was found

/** Fewest paired returns the regression is run on. */
export const ALPHA_MIN_RETURNS = 20;

/** The regularised incomplete beta function I_x(a, b), by its continued fraction (Numerical Recipes 6.4). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lnGamma(a + b) - lnGamma(a) - lnGamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lnBeta);
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(1 - x, b, a);
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let f = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + num * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + num / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    f *= d * c;
    num = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + num * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + num / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const step = d * c;
    f *= step;
    if (Math.abs(step - 1) < 1e-12) break;
  }
  return (front * f) / a;
}

/** ln Γ(z), Lanczos. */
function lnGamma(z: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  const x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** The two-sided p-value of a t statistic with `df` degrees of freedom. */
export function twoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return Math.min(1, Math.max(0, incompleteBeta(df / (df + t * t), df / 2, 0.5)));
}

/** The t a two-sided test at `level` (0.05) needs with `df` degrees of freedom, found by halving. */
export function tCritical(df: number, level = 0.05): number {
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (twoSidedP(mid, df) > level) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type AlphaStats = {
  from: string;
  to: string;
  benchmark: string;
  /** Paired returns in the regression, and the observations a year they come at. */
  n: number;
  perYear: number;
  /** The risk-free rate taken out of both, a decimal a year. */
  rate: number;
  /** Jensen's alpha: the intercept of the regression, a year, percent. */
  alpha: number;
  /** Its standard error, a year, percent, and its 95% interval. */
  alphaSe: number;
  low: number;
  high: number;
  /** The t statistic of alpha against zero, its two-sided p-value and the degrees of freedom. */
  t: number;
  p: number;
  df: number;
  beta: number;
  betaSe: number;
  /** Share of the book's moves the benchmark's explain, 0 to 1. */
  r2: number;
  /** Mean excess returns a year, percent: the book's equals alpha plus beta times the benchmark's. */
  bookExcess: number;
  benchExcess: number;
  /** Each pair of excess returns, percent, for the scatter (at most `ALPHA_POINTS`, evenly picked). */
  points: { x: number; y: number }[];
};

export const ALPHA_POINTS = 400;

/**
 * Jensen's alpha over a window (Hamza, 19 Oct 2026: alpha with how it was
 * derived, the p-test included): the account index's returns and the
 * benchmark's over the same intervals, each less the risk-free rate, are
 * regressed one on the other by least squares; the intercept is alpha, the
 * slope beta. Alpha's standard error gives a t statistic against zero and a
 * two-sided p-value on n - 2 degrees of freedom, and a 95% interval. Daily
 * figures are made yearly by the observations a year. Null without an
 * account series, prices for the benchmark or `ALPHA_MIN_RETURNS` pairs.
 */
export function alphaOver(book: Book, benchmark: string, w: Window): AlphaStats | null {
  const idx = navIndex(book);
  const bi = benchmarkIndex(book, benchmark);
  if (!idx || !bi) return null;
  const s0 = startInside(w, idx.dates[0]);
  if (w.to < s0) return null;
  const dates = [s0, ...idx.dates.filter((d) => d > s0 && d <= w.to)];
  const path = dates.map((d) => clamped(idx.dates, idx.index, d));
  const per = perYear(dates);
  const rate = book.market?.rate ?? 0;
  const rf = rate / per;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const p = valueOnOrBefore(bi.dates, bi.index, dates[i - 1]);
    const q = valueOnOrBefore(bi.dates, bi.index, dates[i]);
    if (p === null || q === null || p <= 0 || path[i - 1] <= 0) continue;
    y.push(path[i] / path[i - 1] - 1 - rf);
    x.push(q / p - 1 - rf);
  }
  const n = x.length;
  if (n < ALPHA_MIN_RETURNS) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  if (!(sxx > 0)) return null;
  const beta = sxy / sxx;
  const a = my - beta * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) sse += (y[i] - a - beta * x[i]) ** 2;
  const df = n - 2;
  const s2 = sse / df;
  const seA = Math.sqrt(s2 * (1 / n + (mx * mx) / sxx));
  const t = seA > 0 ? a / seA : 0;
  const crit = tCritical(df);
  const yearly = (v: number) => v * per * 100;
  const stride = Math.max(1, Math.ceil(n / ALPHA_POINTS));
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i += stride) points.push({ x: x[i] * 100, y: y[i] * 100 });
  return {
    from: s0,
    to: dates[dates.length - 1],
    benchmark,
    n,
    perYear: per,
    rate,
    alpha: yearly(a),
    alphaSe: yearly(seA),
    low: yearly(a - crit * seA),
    high: yearly(a + crit * seA),
    t,
    p: twoSidedP(t, df),
    df,
    beta,
    betaSe: Math.sqrt(s2 / sxx),
    r2: syy > 0 ? 1 - sse / syy : 0,
    bookExcess: yearly(my),
    benchExcess: yearly(mx),
    points,
  };
}

/** Alpha over one of the page's windows ending at the book's date. */
export function alphaStats(book: Book, benchmark: string, window: WindowKey): AlphaStats | null {
  const idx = navIndex(book);
  if (!idx) return null;
  return alphaOver(book, benchmark, windowOf(window, book.asOf, idx.dates[0]));
}

/** What an alpha's p-value says, in a sentence. */
export function alphaWords(a: AlphaStats): string {
  const sign = a.alpha >= 0 ? "ahead of" : "behind";
  const size = `${Math.abs(a.alpha).toFixed(1)}% a year ${sign} what ${a.benchmark}'s moves explain at a beta of ${a.beta.toFixed(2)}`;
  if (a.p < 0.05) return `The book ran ${size}, and at p = ${a.p.toFixed(3)} that is unlikely to be chance over ${a.n} returns: distinguishable from zero at the 5% level.`;
  return `The book ran ${size}, but at p = ${a.p.toFixed(2)} an alpha this size could be chance over ${a.n} returns: not distinguishable from zero at the 5% level. The interval below says how wide the doubt is.`;
}

// ---------------------------------------------------------------- bad and good days, next to a benchmark

export type DayStats = {
  from: string;
  to: string;
  /** "day", "week" or "month", from the points' spacing. */
  unit: "day" | "week" | "month";
  n: number;
  /** The loss one observation in twenty reaches or passes (the 5th percentile), percent, positive; null below twenty. */
  badLine: number | null;
  /** The average loss across those worst observations, percent, positive. */
  badAverage: number | null;
  worst: { pct: number; date: string } | null;
  best: { pct: number; date: string } | null;
  /** Share of observations that rose, percent. */
  upShare: number | null;
  /** Share of calendar months that rose, percent; null below two months. */
  monthsUp: number | null;
  bestMonth: { pct: number; ym: string } | null;
  worstMonth: { pct: number; ym: string } | null;
  benchmark: string | null;
  /** The account's average return on the benchmark's up observations over the benchmark's, percent; null below five. */
  upCapture: number | null;
  /** The same on its down observations. */
  downCapture: number | null;
  /** How far the account's returns strayed from the benchmark's, annualised, percent. */
  trackingError: number | null;
};

/** One in twenty: the share of worst observations the bad-day line and its average read. */
export const BAD_DAY_SHARE = 0.05;

/**
 * Bad and good days over a window (Hamza, 19 Oct 2026, after Pebble's cards):
 * the loss one observation in twenty reaches (historical, the 5th
 * percentile) and the average of those worst ones, the worst and best single
 * observation, the share that rose, the best and worst calendar month and
 * the share of months that rose; and next to the benchmark, up and down
 * capture (the account's average return on the benchmark's up, or down,
 * observations over the benchmark's own) and the tracking error. All from
 * the time-weighted index, so deposits never count as gains.
 */
export function dayStats(book: Book, benchmark: string | null, w: Window): DayStats | null {
  const idx = navIndex(book);
  if (!idx) return null;
  const s0 = startInside(w, idx.dates[0]);
  if (w.to < s0) return null;
  const dates = [s0, ...idx.dates.filter((d) => d > s0 && d <= w.to)];
  const path = dates.map((d) => clamped(idx.dates, idx.index, d));
  const obs: { date: string; r: number }[] = [];
  for (let i = 1; i < path.length; i += 1) if (path[i - 1] > 0) obs.push({ date: dates[i], r: (path[i] / path[i - 1] - 1) * 100 });
  const per = perYear(dates);
  const unit = per === 252 ? "day" : per === 52 ? "week" : "month";
  const sorted = [...obs].sort((a, b) => a.r - b.r);
  const k = Math.max(1, Math.floor(obs.length * BAD_DAY_SHARE));
  const tail = sorted.slice(0, k);
  const enough = obs.length >= 20;
  const months = monthlyGrid({ ...book, series: book.series ? { ...book.series, nav: book.series.nav.filter((p) => p.date <= w.to) } : book.series }, [])
    .years.flatMap((y) => y.months.filter((c): c is GridCell => !!c))
    .filter((c) => monthEnd(c.ym) > s0);
  const bm = months.length ? months.reduce((a, b) => (b.account > a.account ? b : a)) : null;
  const wm = months.length ? months.reduce((a, b) => (b.account < a.account ? b : a)) : null;
  let upCapture: number | null = null;
  let downCapture: number | null = null;
  let trackingError: number | null = null;
  const bi = benchmark ? benchmarkIndex(book, benchmark) : null;
  if (bi) {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      const p = valueOnOrBefore(bi.dates, bi.index, dates[i - 1]);
      const q = valueOnOrBefore(bi.dates, bi.index, dates[i]);
      if (p === null || q === null || p <= 0 || path[i - 1] <= 0) continue;
      a.push(path[i] / path[i - 1] - 1);
      b.push(q / p - 1);
    }
    const up = b.map((v, i) => [a[i], v] as const).filter(([, v]) => v > 0);
    const down = b.map((v, i) => [a[i], v] as const).filter(([, v]) => v < 0);
    const capture = (pairs: readonly (readonly [number, number])[]) => {
      if (pairs.length < 5) return null;
      const mb = mean(pairs.map(([, v]) => v));
      return mb !== 0 ? (mean(pairs.map(([x]) => x)) / mb) * 100 : null;
    };
    upCapture = capture(up);
    downCapture = capture(down);
    trackingError = a.length >= 5 ? sdev(a.map((x, i) => x - b[i])) * Math.sqrt(per) * 100 : null;
  }
  const worst = sorted[0] ?? null;
  const best = sorted.at(-1) ?? null;
  return {
    from: s0,
    to: dates[dates.length - 1],
    unit,
    n: obs.length,
    badLine: enough ? Math.max(0, -tail[tail.length - 1].r) : null,
    badAverage: enough ? Math.max(0, -mean(tail.map((t) => t.r))) : null,
    worst: worst ? { pct: worst.r, date: worst.date } : null,
    best: best ? { pct: best.r, date: best.date } : null,
    upShare: obs.length ? (obs.filter((o) => o.r > 0).length / obs.length) * 100 : null,
    monthsUp: months.length >= 2 ? (months.filter((c) => c.account > 0).length / months.length) * 100 : null,
    bestMonth: bm ? { pct: bm.account, ym: bm.ym } : null,
    worstMonth: wm ? { pct: wm.account, ym: wm.ym } : null,
    benchmark: bi ? benchmark : null,
    upCapture,
    downCapture,
    trackingError,
  };
}

// ---------------------------------------------------------------- monthly grid

export type GridCell = { ym: string; account: number; benchmarks: Record<string, number | null> };
export type GridTotal = { account: number | null; benchmarks: Record<string, number | null> };
export type GridYear = { year: number; months: (GridCell | null)[]; total: GridTotal };

function compound(values: readonly (number | null)[]): number | null {
  if (!values.length || values.some((v) => v === null)) return null;
  return (values.reduce<number>((acc, v) => acc * (1 + (v as number) / 100), 1) - 1) * 100;
}

/**
 * Month by month from month-end index values: each month's return is its last
 * point over the month before's last point; the first month is measured from
 * the series' first point. A month with no point is empty. Years compound
 * the months they hold.
 */
export function monthlyGrid(book: Book, benchmarks: readonly string[]): { years: GridYear[] } {
  const idx = navIndex(book);
  if (!idx) return { years: [] };
  const bench = benchmarks.map((s) => [s, benchmarkIndex(book, s)] as const);
  const first = idx.dates[0];
  const lastYm = idx.dates[idx.dates.length - 1].slice(0, 7);
  const cells: GridCell[] = [];
  let prevEnd = first;
  for (let ym = first.slice(0, 7); ym <= lastYm; ym = nextYm(ym)) {
    const end = monthEnd(ym);
    const has = idx.dates.some((d) => d > prevEnd && d <= end);
    if (!has) continue;
    const a = clamped(idx.dates, idx.index, prevEnd);
    const b = clamped(idx.dates, idx.index, end);
    const out: Record<string, number | null> = {};
    for (const [symbol, bi] of bench) {
      const p = bi ? valueOnOrBefore(bi.dates, bi.index, prevEnd) : null;
      const q = bi ? valueOnOrBefore(bi.dates, bi.index, end) : null;
      out[symbol] = p && q ? (q / p - 1) * 100 : null;
    }
    cells.push({ ym, account: (b / a - 1) * 100, benchmarks: out });
    prevEnd = end;
  }
  const byYear = new Map<number, GridCell[]>();
  for (const c of cells) {
    const y = +c.ym.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), c]);
  }
  const years: GridYear[] = [...byYear.entries()].map(([year, cs]) => ({
    year,
    months: Array.from({ length: 12 }, (_, i) => cs.find((c) => +c.ym.slice(5, 7) === i + 1) ?? null),
    total: { account: compound(cs.map((c) => c.account)), benchmarks: Object.fromEntries(benchmarks.map((s) => [s, compound(cs.map((c) => c.benchmarks[s] ?? null))])) },
  }));
  return { years };
}

// ---------------------------------------------------------------- cash

/** Percent of net worth held as cash and deposits, at the owner's value. */
export function cashShare(book: Book): number {
  let total = 0;
  let cash = 0;
  for (const h of book.holdings) {
    const v = ownerValueOf(h, book);
    total += v;
    if (h.assetClass === "cash" || h.assetClass === "deposit") cash += v;
  }
  return total > 0 ? (cash / total) * 100 : 0;
}

// ---------------------------------------------------------------- money-weighted

export type MoneyWeighted = {
  from: string;
  to: string;
  days: number;
  /** The internal rate of return, a year, in percent: the one rate at which the start value and every flow grow to the end value. */
  irr: number;
  /** The same rate over the window itself, not a year. */
  overPeriod: number;
  /** The time-weighted return over the same window, for comparison, and a year (null under a year). */
  twr: number | null;
  twrYearly: number | null;
  /** True when the window is a year or more, so the screen reads the yearly rates; under a year it reads the window's own. */
  yearly: boolean;
  startValue: number;
  endValue: number;
  /** Deposits in the window, positive, in base currency. */
  deposits: number;
  /** Withdrawals in the window, positive, in base currency. */
  withdrawals: number;
  flows: number;
};

/** Net present value of dated cash flows at a yearly rate r. */
function npv(flows: readonly { t: number; amount: number }[], r: number): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, f.t), 0);
}

/**
 * The money-weighted return (IRR, the XIRR of a spreadsheet) over a window:
 * the start value as money put in at the window's first close, each deposit
 * put in and each withdrawal taken out on its own date, the end value taken
 * out at the last close; the yearly rate that sets them to zero, found by
 * bisection. Unlike the time-weighted return it counts the person's timing:
 * money added before a rise lifts it, money added before a fall lowers it.
 * Null without an account series, under a week of window or with nothing in
 * the account at the start; flows in a currency nothing converts are left
 * out, as the index leaves them (`flowsLeftOut`).
 */
export function moneyWeighted(book: Book, window: WindowKey): MoneyWeighted | null {
  const idx = navIndex(book);
  if (!idx) return null;
  const w = windowOf(window, book.asOf, idx.dates[0]);
  const s0 = startInside(w, idx.dates[0]);
  const end = idx.dates.filter((d) => d <= w.to).pop();
  if (!end || end <= s0) return null;
  const days = daysBetween(s0, end);
  if (days < GRACE_DAYS) return null;
  const startValue = clamped(idx.dates, idx.nav, s0);
  const endValue = clamped(idx.dates, idx.nav, end);
  if (startValue <= 0) return null;
  const year = (d: string) => daysBetween(s0, d) / 365.25;
  const flows: { t: number; amount: number }[] = [{ t: 0, amount: -startValue }];
  let deposits = 0;
  let withdrawals = 0;
  let count = 0;
  for (const t of book.transactions) {
    if ((t.kind !== "deposit" && t.kind !== "withdrawal") || t.date <= s0 || t.date > end) continue;
    const base = baseAmountOf(t, book.fx);
    if (base === null) continue;
    const amount = Math.abs(base);
    if (t.kind === "deposit") deposits += amount;
    else withdrawals += amount;
    count += 1;
    flows.push({ t: year(t.date), amount: t.kind === "deposit" ? -amount : amount });
  }
  flows.push({ t: year(end), amount: endValue });
  // NPV falls as the rate rises when money goes in before it comes out; bisect between a near-total loss and a thousandfold year.
  let lo = -0.9999;
  let hi = 1000;
  if (npv(flows, lo) < 0 || npv(flows, hi) > 0) return null;
  for (let i = 0; i < 200 && hi - lo > 1e-10; i += 1) {
    const mid = (lo + hi) / 2;
    if (npv(flows, mid) > 0) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  const yearly = days >= 365;
  const cumulative = returnOver(idx.dates, idx.index, s0, end);
  const twrYearly = cumulative !== null && yearly ? annualise(cumulative, days) : null;
  const overPeriod = (Math.pow(1 + r, days / 365.25) - 1) * 100;
  return { from: s0, to: end, days, irr: r * 100, overPeriod, twr: cumulative, twrYearly, yearly, startValue, endValue, deposits, withdrawals, flows: count };
}

/** Within half a point a year, the person's timing made no difference worth naming. */
const SAME_WITHIN = 0.5;

/** What the gap between the two returns says about the person's timing, in a sentence. */
export function timingWords(mw: Pick<MoneyWeighted, "irr" | "overPeriod" | "twr" | "twrYearly" | "yearly" | "flows">): string {
  if (!mw.flows) return "No money went in or came out in this time, so the IRR is the time-weighted return.";
  const irr = mw.yearly ? mw.irr : mw.overPeriod;
  const twr = mw.yearly ? mw.twrYearly : mw.twr;
  if (twr === null) return "The time-weighted return needs a longer series to compare with.";
  const gap = irr - twr;
  if (Math.abs(gap) < SAME_WITHIN) return "Your timing made little difference: the two returns are within half a point.";
  return gap > 0
    ? `Your timing helped by ${gap.toFixed(1)} points${mw.yearly ? " a year" : ""}: more of your money was in while the holdings rose.`
    : `Your timing cost ${Math.abs(gap).toFixed(1)} points${mw.yearly ? " a year" : ""}: more of your money was in while the holdings fell.`;
}
