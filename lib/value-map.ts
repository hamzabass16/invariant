import { grownForward, type Consensus } from "@/lib/forward";
import { MIN_PLAUSIBLE_PE } from "@/lib/portfolio-pe";
import { daysBetween } from "@/lib/time";

/**
 * The value map (Hamza, 24 Oct 2026, after Dividendology's "Stock value
 * map"): each listed holding and watchlist company placed by its forward P/E
 * against its EPS growth a year, with the line where the two are equal (a PEG
 * of 1). Above the line the price asks more than a point of P/E for each
 * point of growth; below it, less. The growth is either the analysts'
 * projection (Nasdaq's yearly consensus, from the fiscal year in progress to
 * the furthest year it lists) or what the filings show was delivered (the
 * trailing EPS over three to five years). The forward P/E is the analysts'
 * when Nasdaq has one, else the filings' own carried a year at revenue
 * growth (lib/forward.ts). A reference line, never a verdict; the app
 * forecasts nothing. Pure.
 */

export const VALUE_MAP_BASES = ["projected", "delivered"] as const;
export type ValueMapBasis = (typeof VALUE_MAP_BASES)[number];
export const BASIS_WORDS: Record<ValueMapBasis, string> = { projected: "Analysts' projected", delivered: "Delivered" };

/** The span of delivered growth asked for, and the least a company's filings must cover. */
export const DELIVERED_YEARS = 5;
export const MIN_DELIVERED_YEARS = 3;
/** The least span of the analysts' years for a growth rate. */
export const MIN_PROJECTED_YEARS = 1;
/** The axes' least reach: the picture's 60% growth and 50x P/E. */
export const MAP_GROWTH_MAX = 60;
export const MAP_PE_MAX = 50;

export type ValueMapInput = {
  symbol: string;
  name: string;
  held: boolean;
  /** Percent of the book; null for a watchlist company. */
  weight: number | null;
  /** The ontology's fields: consensus_forward_pe and forward_pe are read, else pe_ratio carried a year at revenue_growth_pct. */
  values: Record<string, number | null | undefined> | null | undefined;
  consensus: Pick<Consensus, "years"> | null | undefined;
  /** Trailing EPS by quarter end, oldest first (the filings' perShareTtm, else epsTtm). */
  eps: readonly { end: string; eps: number | null }[] | null | undefined;
};

export type Growth = { pct: number; years: number; from: string; to: string };
export type ValueMapPoint = {
  symbol: string;
  name: string;
  held: boolean;
  weight: number | null;
  fwdPe: number;
  peBasis: "analysts" | "filings";
  projected: Growth | null;
  delivered: Growth | null;
};
export type ValueMap = { points: ValueMapPoint[]; missing: { symbol: string; why: string }[] };

const round1 = (v: number) => Math.round(v * 10) / 10;
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** The analysts' EPS growth a year from the fiscal year in progress to the furthest year Nasdaq lists; none below a year apart or without positive EPS at both ends. */
export function projectedGrowth(c: Pick<Consensus, "years"> | null | undefined, today: string): Growth | null {
  const ahead = [...(c?.years ?? [])].sort((a, b) => a.end.localeCompare(b.end)).filter((y) => monthEnd(y.end) >= today);
  if (ahead.length < 2) return null;
  const first = ahead[0];
  const last = ahead.at(-1)!;
  const years = daysBetween(monthEnd(first.end), monthEnd(last.end)) / 365.25;
  if (years < MIN_PROJECTED_YEARS - 0.05 || !(first.eps > 0) || !(last.eps > 0)) return null;
  return { pct: round1((Math.pow(last.eps / first.eps, 1 / years) - 1) * 100), years: Math.round(years), from: first.end, to: last.end };
}

/** The filings' EPS growth a year over the last five years, else the longest span of at least three they keep; none without positive EPS at both ends. */
export function deliveredGrowth(eps: ValueMapInput["eps"]): Growth | null {
  const pts = (eps ?? []).filter((p): p is { end: string; eps: number } => p.eps !== null).sort((a, b) => a.end.localeCompare(b.end));
  const last = pts.at(-1);
  if (!last) return null;
  const target = new Date(Date.parse(`${last.end}T00:00:00Z`) - DELIVERED_YEARS * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const first = pts.find((p) => p.end >= target) ?? pts[0];
  const years = daysBetween(first.end, last.end) / 365.25;
  if (years < MIN_DELIVERED_YEARS - 0.1 || !(first.eps > 0) || !(last.eps > 0)) return null;
  return { pct: round1((Math.pow(last.eps / first.eps, 1 / years) - 1) * 100), years: Math.round(years * 10) / 10, from: first.end.slice(0, 7), to: last.end.slice(0, 7) };
}

/** Every company with a positive forward P/E, the analysts' first; the rest named with what they lack. */
export function valueMap(inputs: readonly ValueMapInput[], today: string): ValueMap {
  const points: ValueMapPoint[] = [];
  const missing: ValueMap["missing"] = [];
  const seen = new Set<string>();
  for (const i of inputs) {
    const symbol = i.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const analysts = i.values?.consensus_forward_pe ?? null;
    // A read kept before forward_pe was derived: the trailing P/E over EPS carried a year at revenue growth, the same arithmetic.
    const carried = grownForward(1, i.values?.revenue_growth_pct ?? null);
    const trailing = i.values?.pe_ratio ?? null;
    const filings = i.values?.forward_pe ?? (carried && trailing !== null && trailing > 0 ? trailing / carried : null);
    const fwdPe = analysts !== null && analysts > 0 ? analysts : filings !== null && filings > 0 ? filings : null;
    if (fwdPe === null) {
      missing.push({ symbol, why: i.values ? "no positive forward P/E (EPS not positive, or not read yet)" : "no figures from the filings yet" });
      continue;
    }
    // As on the portfolio's P/E: a multiple this low is a split or a currency the filings do not match yet, never a bargain.
    if (fwdPe < MIN_PLAUSIBLE_PE) {
      missing.push({ symbol, why: `a forward P/E under ${MIN_PLAUSIBLE_PE}× reads as a split or a currency its filings do not match yet` });
      continue;
    }
    points.push({ symbol, name: i.name, held: i.held, weight: i.weight, fwdPe: round1(fwdPe), peBasis: analysts !== null && analysts > 0 ? "analysts" : "filings", projected: projectedGrowth(i.consensus, today), delivered: deliveredGrowth(i.eps) });
  }
  return { points, missing };
}

/** The growth a point is placed at on a basis; null when that basis has none. */
export const growthOn = (p: ValueMapPoint, basis: ValueMapBasis): Growth | null => (basis === "projected" ? p.projected : p.delivered);

/** Forward P/E over growth; null at growth of zero or below, where a PEG means nothing. */
export function peg(p: ValueMapPoint, basis: ValueMapBasis): number | null {
  const g = growthOn(p, basis);
  return g && g.pct > 0 ? Math.round((p.fwdPe / g.pct) * 100) / 100 : null;
}

/** The axes: at least the picture's reach, more when a point goes past it, in steps of ten. */
export function mapAxes(points: readonly ValueMapPoint[], basis: ValueMapBasis): { xMin: number; xMax: number; yMax: number } {
  const gs = points.map((p) => growthOn(p, basis)?.pct).filter((v): v is number => v !== undefined);
  const up = (v: number) => Math.ceil(v / 10) * 10;
  return { xMin: Math.min(0, Math.floor(Math.min(0, ...gs) / 10) * 10), xMax: Math.max(MAP_GROWTH_MAX, up(Math.max(0, ...gs) + 2)), yMax: Math.max(MAP_PE_MAX, up(Math.max(0, ...points.map((p) => p.fwdPe)) + 2)) };
}

/** "6 of 9 sit above the line": how many ask more than a point of P/E for each point of growth. */
export function mapWords(points: readonly ValueMapPoint[], basis: ValueMapBasis): string {
  const placed = points.filter((p) => growthOn(p, basis));
  if (!placed.length) return basis === "projected" ? "No company has the analysts' yearly estimates to place it yet." : "No company has three years of EPS from its filings to place it yet.";
  const above = placed.filter((p) => (peg(p, basis) ?? Infinity) > 1).length;
  return `${above} of ${placed.length} ${placed.length === 1 ? "company sits" : "companies sit"} above the line, paying more than a point of forward P/E for each point of ${basis === "projected" ? "projected" : "delivered"} EPS growth a year.`;
}

export type LabelBox = { x: number; y: number; anchor: "start" | "end" | "middle"; dy: number; hidden?: boolean };

/**
 * Where each point's label goes, in pixels: to the right, the left, above or
 * below, the first that clears the labels and dots already placed and stays
 * inside the plot. Greedy, from the most crowded first; enough for a book.
 */
export function placeLabels(dots: readonly { x: number; y: number; text: string }[], plot: { left: number; right: number; top: number; bottom: number }, charW = 7.2, h = 14, blocked: readonly { l: number; r: number; t: number; b: number }[] = [], optional: (i: number) => boolean = () => false): LabelBox[] {
  type Box = { l: number; r: number; t: number; b: number };
  // Each dot, and anything else already drawn (a zone's name), is in the way of a label.
  const taken: Box[] = [...blocked, ...dots.map((d) => ({ l: d.x - 5, r: d.x + 5, t: d.y - 5, b: d.y + 5 }))];
  const hits = (a: Box) => taken.some((b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
  const out: LabelBox[] = new Array(dots.length);
  // The labels that must be drawn are placed first; an optional one with no clear place is left to the table.
  const order = dots.map((_, i) => i).sort((a, b) => Number(optional(a)) - Number(optional(b)));
  for (const i of order) {
    const d = dots[i];
    const w = d.text.length * charW;
    const tries: { box: Box; label: LabelBox }[] = [
      { box: { l: d.x + 8, r: d.x + 8 + w, t: d.y - h / 2, b: d.y + h / 2 }, label: { x: d.x + 8, y: d.y, anchor: "start", dy: 4 } },
      { box: { l: d.x - 8 - w, r: d.x - 8, t: d.y - h / 2, b: d.y + h / 2 }, label: { x: d.x - 8, y: d.y, anchor: "end", dy: 4 } },
      { box: { l: d.x - w / 2, r: d.x + w / 2, t: d.y - 8 - h, b: d.y - 8 }, label: { x: d.x, y: d.y - 8, anchor: "middle", dy: -3 } },
      { box: { l: d.x - w / 2, r: d.x + w / 2, t: d.y + 8, b: d.y + 8 + h }, label: { x: d.x, y: d.y + 8, anchor: "middle", dy: 11 } },
      { box: { l: d.x + 5, r: d.x + 5 + w, t: d.y - 6 - h, b: d.y - 6 }, label: { x: d.x + 5, y: d.y - 6, anchor: "start", dy: -3 } },
      { box: { l: d.x - 5 - w, r: d.x - 5, t: d.y - 6 - h, b: d.y - 6 }, label: { x: d.x - 5, y: d.y - 6, anchor: "end", dy: -3 } },
      { box: { l: d.x + 5, r: d.x + 5 + w, t: d.y + 6, b: d.y + 6 + h }, label: { x: d.x + 5, y: d.y + 6, anchor: "start", dy: 11 } },
      { box: { l: d.x - 5 - w, r: d.x - 5, t: d.y + 6, b: d.y + 6 + h }, label: { x: d.x - 5, y: d.y + 6, anchor: "end", dy: 11 } },
    ];
    const inside = (b: Box) => b.l >= plot.left && b.r <= plot.right && b.t >= plot.top && b.b <= plot.bottom;
    const free = tries.find((t) => inside(t.box) && !hits(t.box));
    if (!free && optional(i)) {
      out[i] = { ...tries[0].label, hidden: true };
      continue;
    }
    const pick = free ?? tries.find((t) => inside(t.box)) ?? tries[0];
    taken.push(pick.box);
    out[i] = pick.label;
  }
  return out;
}
