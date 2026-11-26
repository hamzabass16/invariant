import { forwardRows } from "@/lib/forward";
import { EPS_KNOWN_AFTER_DAYS } from "@/lib/portfolio-pe";
import type { ValuationMetric } from "@/lib/ontology";
import { addDays } from "@/lib/performance";

/**
 * A company's valuation multiple over five years (Hamza, 20 Oct 2026: a
 * chart of the metric chosen in the Valuation calculator, and an alert when
 * a holding or a watchlist company is near its five-year low on it). Each
 * week's close over the trailing per-share figure known that week: a
 * quarter's figures count from EPS_KNOWN_AFTER_DAYS after it ended, as the
 * portfolio's P/E does, so the line never uses a result before it was
 * published. A figure of zero or below has no multiple and leaves a gap.
 * The forward multiples (Hamza, 23 Oct 2026) read each week's figure as the
 * filings then known carried it twelve months on (lib/forward.ts
 * forwardRows), so they have a history too; the analysts' consensus has none
 * and is drawn beside the line. The market size or a DCF is shown by its
 * trailing twin (`historyMetricFor`). Pure.
 */

export const HISTORY_METRICS = ["trailing_pe", "forward_pe", "ps", "forward_ps", "pgp", "trailing_pfcf", "forward_pfcf"] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];
export const HISTORY_LABEL: Record<HistoryMetric, string> = { trailing_pe: "P/E", forward_pe: "Fwd P/E", ps: "P/S", forward_ps: "Fwd P/S", pgp: "P/GP", trailing_pfcf: "P/FCF", forward_pfcf: "Fwd P/FCF" };
const FIGURE: Record<HistoryMetric, "revenue" | "grossProfit" | "eps" | "fcf"> = { trailing_pe: "eps", forward_pe: "eps", ps: "revenue", forward_ps: "revenue", pgp: "grossProfit", trailing_pfcf: "fcf", forward_pfcf: "fcf" };
/** The metrics read on the figures carried twelve months on. */
export const FORWARD_HISTORY: ReadonlySet<HistoryMetric> = new Set(["forward_pe", "forward_ps", "forward_pfcf"]);

export const HISTORY_YEARS = 5;
/** Days of closes the chart reads: five years and a little before. */
export const HISTORY_DAYS = 1900;
/** Near the low: at most this many percent above the five-year low. */
export const NEAR_LOW_PCT = 5;
/** Below this much history the low is not judged: a year of weeks is no five-year low. */
export const MIN_HISTORY_WEEKS = 104;
/**
 * An earnings or cash-flow multiple above this is not meaningful (Hamza,
 * 23 Oct 2026, on AMZN's 680x Fwd P/E of 2023): it says the figure under it
 * was near zero, not that the price was dear. Such a week is a gap, left out
 * of the low, median and high, and counted.
 */
export const NOT_MEANINGFUL_ABOVE = 100;
const CAPPED: ReadonlySet<HistoryMetric> = new Set(["trailing_pe", "forward_pe", "trailing_pfcf", "forward_pfcf"]);

export type PerShareRow = { end: string; revenue: number | null; grossProfit: number | null; eps: number | null; fcf: number | null };
export type Point = { date: string; value: number };

/** The metric the chart and the alert read for the method chosen: itself, else its trailing twin. */
export function historyMetricFor(method: ValuationMetric | null | undefined): HistoryMetric {
  if (method === "ps" || method === "pgp" || method === "trailing_pe" || method === "trailing_pfcf" || method === "forward_pe" || method === "forward_pfcf") return method;
  if (method === "dcf" || method === "reverse_dcf") return "trailing_pfcf";
  return "ps";
}

export type ValuationHistory = {
  metric: HistoryMetric;
  points: { date: string; value: number | null }[];
  now: Point | null;
  low: Point | null;
  high: Point | null;
  median: number | null;
  /** Where today's multiple sits among the five years' weeks, 0 the lowest, 100 the highest. */
  percentile: number | null;
  /** Years of history the line covers. */
  years: number;
  /** Today's multiple is within NEAR_LOW_PCT of the five-year low, with enough history to judge. */
  nearLow: boolean;
  /** Weeks left out as above NOT_MEANINGFUL_ABOVE, and whether today's is one. */
  notMeaningful: number;
  nowNotMeaningful?: boolean;
};

/** The last close of each week (Monday-keyed), and the latest close itself. */
function weekly(closes: readonly Point[]): Point[] {
  const out: Point[] = [];
  let key = "";
  for (const c of closes) {
    const d = new Date(`${c.date}T00:00:00Z`);
    const monday = addDays(c.date, -((d.getUTCDay() + 6) % 7));
    if (monday === key) out[out.length - 1] = c;
    else {
      out.push(c);
      key = monday;
    }
  }
  return out;
}

/**
 * The multiple at each week's close over the last five years. `fx` carries
 * the filings' per-share figures into the price's currency (listing units per
 * filing unit, 1 when the same). Null when there are no closes or no
 * per-share figures to divide by.
 */
export function valuationHistory(metric: HistoryMetric, closes: readonly Point[], rows: readonly PerShareRow[], today: string, fx = 1): ValuationHistory | null {
  const field = FIGURE[metric];
  const known = (FORWARD_HISTORY.has(metric) ? forwardRows(rows) : [...rows])
    .filter((r) => r[field] !== null)
    .map((r) => ({ from: addDays(r.end, EPS_KNOWN_AFTER_DAYS), figure: (r[field] as number) * fx }))
    .sort((a, b) => a.from.localeCompare(b.from));
  if (!known.length || !closes.length) return null;
  const start = addDays(today, -Math.round(HISTORY_YEARS * 365.25));
  const sorted = [...closes].filter((c) => c.date >= start && c.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const points = weekly(sorted).map((c) => {
    let figure: number | null = null;
    for (const k of known) {
      if (k.from > c.date) break;
      figure = k.figure;
    }
    return { date: c.date, value: figure !== null && figure > 0 ? Math.round((c.value / figure) * 100) / 100 : null };
  });
  let notMeaningful = 0;
  const nowNotMeaningful = CAPPED.has(metric) && (points.at(-1)?.value ?? 0) > NOT_MEANINGFUL_ABOVE;
  if (CAPPED.has(metric))
    for (const p of points)
      if (p.value !== null && p.value > NOT_MEANINGFUL_ABOVE) {
        p.value = null;
        notMeaningful += 1;
      }
  const first = points.findIndex((p) => p.value !== null);
  const line = first < 0 ? [] : points.slice(first);
  const valued = line.filter((p): p is Point => p.value !== null);
  if (!valued.length) return { metric, points: line, now: null, low: null, high: null, median: null, percentile: null, years: 0, nearLow: false, notMeaningful, nowNotMeaningful };
  const last = line[line.length - 1];
  const now = last.value === null ? null : (last as Point);
  const low = valued.reduce((a, p) => (p.value < a.value ? p : a));
  const high = valued.reduce((a, p) => (p.value > a.value ? p : a));
  const ordered = valued.map((p) => p.value).sort((a, b) => a - b);
  const mid = ordered.length / 2;
  const median = ordered.length % 2 ? ordered[Math.floor(mid)] : (ordered[mid - 1] + ordered[mid]) / 2;
  const percentile = now === null || ordered.length < 2 ? null : Math.round((ordered.filter((v) => v < now.value).length / (ordered.length - 1)) * 100);
  const years = Math.round(((Date.parse(line[line.length - 1].date) - Date.parse(line[0].date)) / (365.25 * 86_400_000)) * 10) / 10;
  const nearLow = now !== null && valued.length >= MIN_HISTORY_WEEKS && now.value <= low.value * (1 + NEAR_LOW_PCT / 100);
  return { metric, points: line, now, low, high, median: Math.round(median * 100) / 100, percentile, years, nearLow, notMeaningful, nowNotMeaningful };
}

/** The history in a sentence: where today's multiple sits against the five years. */
export function historyWords(h: ValuationHistory): string {
  const label = HISTORY_LABEL[h.metric];
  if (!h.now || !h.low || !h.high || h.median === null) {
    if (h.nowNotMeaningful) return `${label} is above ${NOT_MEANINGFUL_ABOVE}x today, not meaningful: the figure under it is near zero.${nmWords(h)}`;
    return FORWARD_HISTORY.has(h.metric) ? `No ${label} to show: the trailing figure is zero or below, or has no year before to grow from.` : `No ${label} to show: the trailing figure is zero or below, or the filings give none.`;
  }
  const span = h.years >= HISTORY_YEARS - 0.2 ? "five-year" : `${h.years.toFixed(1)}-year`;
  const where = h.nearLow ? `within ${NEAR_LOW_PCT}% of its ${span} low` : h.percentile !== null && h.percentile <= 20 ? `in the lowest fifth of its ${span} range` : h.percentile !== null && h.percentile >= 80 ? `in the highest fifth of its ${span} range` : `inside its ${span} range`;
  const thin = h.points.filter((p) => p.value !== null).length < MIN_HISTORY_WEEKS ? ` Under two years of history, so a low is not judged.` : "";
  const basis = FORWARD_HISTORY.has(h.metric) ? " (the trailing figure carried a year on at revenue growth)" : "";
  return `${label}${basis} ${h.now.value.toFixed(1)}x, ${where}: low ${h.low.value.toFixed(1)}x, median ${h.median.toFixed(1)}x, high ${h.high.value.toFixed(1)}x.${thin}${nmWords(h)}`;
}

/** The weeks left out as not meaningful, in a sentence; none when there are none. */
export function nmWords(h: Pick<ValuationHistory, "notMeaningful">): string {
  return h.notMeaningful ? ` ${h.notMeaningful} week${h.notMeaningful === 1 ? "" : "s"} above ${NOT_MEANINGFUL_ABOVE}x are left out as not meaningful.` : "";
}
