import { metricUse, STAGE, type StageId, type ValuationMetric } from "@/lib/ontology";
import type { PeerComparison, PeerField } from "@/lib/peers";
import { HISTORY_LABEL, MIN_HISTORY_WEEKS, type HistoryMetric, type ValuationHistory } from "@/lib/valuation-history";

/**
 * A reference for a watched company's low, base and high (Hamza, 23 Oct 2026:
 * "I don't really know my low base high. I need more of a reference"): the
 * metric the thesis keeps, else the one the stage the filings place the
 * company in makes useful; the company's own five-year range on it, its
 * peers' median and its sector as a whole, and on the forward P/E the
 * analysts' EPS at its own median; each turned into a price on today's
 * per-share figure (today's price over today's multiple, so no currency is
 * converted). The suggestion is the five-year lower quartile, median and
 * upper quartile, else the peers' median as the base alone; the alerts at
 * the low and the high. The app's arithmetic on the filings, for the person
 * to shape; never a target. Pure.
 */

export type ReferenceLine = { key: "low" | "q1" | "median" | "q3" | "high" | "peers" | "sector" | "analysts"; label: string; multiple: number | null; price: number };

export type WatchSuggestion = { low: number | null; base: number; high: number | null; below: number | null; above: number | null; basis: string };

export type WatchReference = {
  metric: HistoryMetric;
  label: string;
  /** Why this metric: the thesis's method, the stage, or the first with a reading. */
  why: string;
  price: number | null;
  /** Today's multiple and the per-share figure it implies, in the price's currency. */
  multiple: number | null;
  perShare: number | null;
  lines: ReferenceLine[];
  suggestion: WatchSuggestion | null;
  /** How the suggestion was made, or why there is none. */
  words: string;
};

/** The history metrics a stage can make useful, the ones read on earnings first. */
const PREFERENCE: readonly HistoryMetric[] = ["forward_pe", "trailing_pe", "forward_pfcf", "trailing_pfcf", "pgp", "ps", "forward_ps"];
/** The calculator's metric each history metric is judged as, for the stage's matrix. */
const AS_METRIC: Record<HistoryMetric, ValuationMetric> = { trailing_pe: "trailing_pe", forward_pe: "forward_pe", ps: "ps", forward_ps: "ps", pgp: "pgp", trailing_pfcf: "trailing_pfcf", forward_pfcf: "forward_pfcf" };
const PEER_FIELD: Partial<Record<HistoryMetric, PeerField>> = { trailing_pe: "pe_ratio", forward_pe: "forward_pe", ps: "ps_ratio", forward_ps: "forward_ps", trailing_pfcf: "pfcf_ratio", forward_pfcf: "forward_pfcf" };

const round = (v: number) => Math.round(v * 100) / 100;
const usable = (h: ValuationHistory | null | undefined): h is ValuationHistory & { now: NonNullable<ValuationHistory["now"]> } => !!h?.now && h.now.value > 0;

/** The multiple at a share of the way up the sorted weeks, interpolated. */
export function quantile(values: readonly number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return s[lo] + (s[hi] - s[lo]) * (at - lo);
}

/** The metric the reference reads: the thesis's method, else the stage's first useful one with a reading, else the first with a reading. */
export function referenceMetric(histories: Readonly<Record<HistoryMetric, ValuationHistory | null>>, method: HistoryMetric | null, stage: StageId | null): { metric: HistoryMetric; why: string } | null {
  if (method && usable(histories[method])) return { metric: method, why: `${HISTORY_LABEL[method]}, the method kept on your thesis.` };
  if (stage) {
    for (const use of ["useful", "somewhat"] as const) {
      const m = PREFERENCE.find((p) => metricUse(AS_METRIC[p], stage) === use && usable(histories[p]));
      if (m) return { metric: m, why: `${HISTORY_LABEL[m]}, ${use === "useful" ? "useful" : "somewhat useful"} at the ${STAGE[stage].label.toLowerCase()} stage the filings place it in.` };
    }
  }
  const m = PREFERENCE.find((p) => usable(histories[p]));
  return m ? { metric: m, why: `${HISTORY_LABEL[m]}, the first metric the filings give a reading for${stage ? "" : "; no stage is decided yet"}.` } : null;
}

export function watchReference(input: {
  histories: Readonly<Record<HistoryMetric, ValuationHistory | null>>;
  method: HistoryMetric | null;
  stage: StageId | null;
  price: number | null;
  peers: PeerComparison | null;
  /** The analysts' consensus forward P/E at today's price, when read. */
  consensusPe: number | null;
}): WatchReference | null {
  const pick = referenceMetric(input.histories, input.method, input.stage);
  if (!pick) return null;
  const h = input.histories[pick.metric]!;
  const label = HISTORY_LABEL[pick.metric];
  const price = input.price ?? h.now?.value ?? null;
  const multiple = h.now?.value ?? null;
  const perShare = price !== null && multiple !== null && multiple > 0 ? price / multiple : null;
  const base = { metric: pick.metric, label, why: pick.why, price, multiple, perShare };
  if (perShare === null) return { ...base, lines: [], suggestion: null, words: `No ${label} today, so no price can be read from it.` };
  const at = (m: number) => round(m * perShare);
  const weeks = h.points.map((p) => p.value).filter((v): v is number => v !== null && v > 0);
  const q1 = quantile(weeks, 0.25);
  const q3 = quantile(weeks, 0.75);
  const lines: ReferenceLine[] = [];
  const add = (key: ReferenceLine["key"], name: string, m: number | null) => {
    if (m !== null && m > 0) lines.push({ key, label: name, multiple: round(m), price: at(m) });
  };
  const span = h.years >= 4.8 ? "Five-year" : `${h.years.toFixed(1)}-year`;
  add("low", `${span} low`, h.low?.value ?? null);
  add("q1", "Lower quartile", q1);
  add("median", `${span} median`, h.median);
  add("q3", "Upper quartile", q3);
  add("high", `${span} high`, h.high?.value ?? null);
  const row = PEER_FIELD[pick.metric] ? input.peers?.rows.find((r) => r.field === PEER_FIELD[pick.metric]) : undefined;
  add("peers", `Peers' median${row?.peersN ? ` (${row.peersN})` : ""}`, row?.peersMedian ?? null);
  add("sector", "Sector, whole", row?.sectorWhole ?? null);
  // The analysts' EPS times the company's own median forward P/E: their figure, the company's multiple.
  if (pick.metric === "forward_pe" && input.consensusPe && input.consensusPe > 0 && h.median && input.price) {
    lines.push({ key: "analysts", label: "Analysts' EPS at its median", multiple: round(h.median), price: round((input.price / input.consensusPe) * h.median) });
  }
  const enough = weeks.length >= MIN_HISTORY_WEEKS && q1 !== null && q3 !== null && h.median !== null;
  if (enough) {
    const low = at(q1!);
    const high = at(q3!);
    return { ...base, lines, suggestion: { low, base: at(h.median!), high, below: low, above: high, basis: `${label} ${q1!.toFixed(1)}x, ${h.median!.toFixed(1)}x, ${q3!.toFixed(1)}x: ${span.toLowerCase()} quartiles`.slice(0, 80) }, words: `Low, base and high at its ${span.toLowerCase()} lower quartile, median and upper quartile ${label}, on today's ${perShare.toFixed(2)} a share; the alerts at the low and the high.` };
  }
  const peerLine = lines.find((l) => l.key === "peers");
  if (peerLine) return { ...base, lines, suggestion: { low: null, base: peerLine.price, high: null, below: null, above: null, basis: `${label} ${peerLine.multiple!.toFixed(1)}x, its peers' median`.slice(0, 80) }, words: `Under two years of its own ${label}, so the base is its peers' median on today's ${perShare.toFixed(2)} a share; set the low and the high yourself.` };
  return { ...base, lines, suggestion: null, words: `Under two years of its own ${label} and no peers read, so nothing is suggested; the lines are what can be read.` };
}
