/**
 * Where a figure's reading sits on a range, for the bar under a tile (Hamza,
 * 19 Oct 2026: the Markets cards' ranges on the Dashboard and Performance
 * too). A figure on one market indicator reads the indicator's own range
 * (`marketRangeOf`); a statistic of a value series reads a fixed scale for
 * its kind and period; a figure a rule tests reads a scale around the rule's
 * limit, coloured toward the side the rule wants; anything else draws no
 * bar, since a scale it cannot justify would say nothing.
 *
 * Pure: imports nothing server-only.
 */
import { marketRangeOf, marketSymbolsIn, type MarketRow, type RangeSpec } from "@/lib/markets";
import type { Period } from "@/lib/ontology";
import type { Figure } from "@/lib/recipes";

const place = (value: number, low: number, high: number) => (high > low ? Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100)) : 50);

/** A reading on a scale, with which way is better and a line about the scale. */
export function onScale(value: number, low: number, high: number, better: RangeSpec["better"], note: string): RangeSpec | null {
  if (!Number.isFinite(value) || !(high > low)) return null;
  return { low, high, better, note, source: "scale", pct: place(value, low, high) };
}

/** The same range with another reading on it (a live price moving a figure the page computed at the close). */
export function movedTo(range: RangeSpec, value: number): RangeSpec {
  return { ...range, pct: place(value, range.low, range.high) };
}

/** A return's span either way by its period: what fills the bar. */
export const RETURN_SPANS: Record<Period, number> = { "1m": 10, "3m": 20, "6m": 25, ytd: 40, "1y": 40, "3y": 80, inception: 100 };

/** A return over a period, on a symmetric scale for its span: higher is better. */
export function returnRange(value: number, period: Period): RangeSpec | null {
  const span = RETURN_SPANS[period];
  return onScale(value, -span, span, "high", `A gain or loss of ${span}% fills the bar.`);
}

/** The fixed scales for the risk statistics, as [low, high, which way is better, the note]. */
export const RISK_SCALES = {
  volatility: [0, 40, "low", "0 to 40% a year; a broad stock index runs near 15 to 20%."],
  beta: [0, 2, null, "1 moves with the benchmark; below it moves less, above it more."],
  correlation: [-1, 1, null, "1 moves in step with the benchmark, 0 apart from it, -1 against it."],
  sharpe: [-1, 3, "high", "Return over the risk-free rate per unit of volatility; above 1 is strong."],
  calmar: [-1, 3, "high", "The yearly return over the worst fall."],
  sortino: [-1, 4, "high", "The yearly return per unit of downside swing; above 2 is strong."],
  alpha: [-20, 20, "high", "The return a year the benchmark's moves do not explain; 0 is none, 20% either way fills the bar."],
  max_drawdown: [-50, 0, "high", "0 is no fall from a high; a fall of 50% fills the bar."],
  high_water_gap: [-30, 0, "high", "0 is at a high; 30% below it fills the bar."],
  worst_fall: [-10, 0, "high", "The worst single fall between two points; 10% fills the bar."],
} as const satisfies Record<string, readonly [number, number, RangeSpec["better"], string]>;

export type RiskScale = keyof typeof RISK_SCALES;

/** A risk statistic on its fixed scale; null when it has no reading. */
export function riskRange(value: number | null, kind: RiskScale): RangeSpec | null {
  if (value === null) return null;
  const [low, high, better, note] = RISK_SCALES[kind];
  return onScale(value, low, high, better, note);
}

/** A value on its own low to high over the last year (net worth against its year). */
export function yearRange(value: number, points: readonly { date: string; value: number }[], asOf: string): RangeSpec | null {
  const from = `${+asOf.slice(0, 4) - 1}${asOf.slice(4)}`;
  const year = points.filter((p) => p.date > from && p.date <= asOf).map((p) => p.value);
  if (year.length < 2) return null;
  const low = Math.min(...year, value);
  const high = Math.max(...year, value);
  if (!(high > low)) return null;
  return { low, high, better: null, note: "Its low to high over the last year.", source: "year", pct: place(value, low, high) };
}

/** The one indicator and field a figure reads, when it reads a single market indicator's own number. */
export function marketReadOf(figure: Figure): { symbol: string; field: string } | null {
  const e = figure.expr;
  if (e.op !== "measure" || e.of.over !== "markets" || !e.of.field) return null;
  const symbols = marketSymbolsIn(e.of.where);
  return symbols.length === 1 ? { symbol: symbols[0], field: e.of.field } : null;
}

export type RuleLimit = { is: "lte" | "gte" | "lt" | "gt"; limit: number };

/**
 * A figure's range: the indicator's own for a market figure, the fixed scale
 * of a series statistic, a scale around a rule's limit; null for a figure
 * the bar cannot say anything honest about, or one with no reading.
 */
export function figureRangeOf(figure: Figure, value: number | null, opts: { markets?: readonly MarketRow[] | null; rule?: RuleLimit | null } = {}): RangeSpec | null {
  if (value === null || !Number.isFinite(value) || figure.by) return null;
  const read = marketReadOf(figure);
  if (read) return opts.markets ? marketRangeOf(read, opts.markets, value) : null;
  const e = figure.expr;
  if (e.op === "series") {
    if (e.stat === "return") return returnRange(value, e.period);
    if (e.stat === "max_drawdown" || e.stat === "high_water_gap" || e.stat === "volatility" || e.stat === "beta" || e.stat === "sortino") return riskRange(value, e.stat);
    return null;
  }
  const rule = opts.rule;
  if (!rule) return null;
  // Lower is better under a cap: 0 to half as far again past the limit; higher is better over a floor: 0 to twice the floor. The reading always fits.
  if (rule.is === "lte" || rule.is === "lt") {
    if (rule.limit <= 0) return null;
    return onScale(value, Math.min(0, value), Math.max(rule.limit * 1.5, value * 1.1), "low", "The rule keeps it at or below its limit, marked by the tick.");
  }
  if (rule.limit <= 0) return null;
  return onScale(value, Math.min(0, value), Math.max(rule.limit * 2, value * 1.1), "high", "The rule keeps it at or above its limit, marked by the tick.");
}
