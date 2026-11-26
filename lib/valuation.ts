import { z } from "zod";

import { DCF_BASIS_LABEL, type DcfResult } from "@/lib/dcf";
import { FIELDS, METRIC_USE_LABEL, metricUse, STAGE, STAGE_READS, STAGE_TESTS, STAGES, VALUATION_METRIC, VALUATION_METRICS, type FundamentalField, type MetricUse, type StageId, type ValuationMetric } from "@/lib/ontology";

/**
 * The Valuation calculator on the Theses screen (Hamza, 16 Oct 2026),
 * after Brian Feroldi's "Valuation by Stage": the stage the filings place
 * the company in, decided by the ontology's STAGE_TESTS on the fundamental
 * fields (first match wins, every clause read from the filings, the rule
 * named); the metrics useful at that stage, each valued on the person's own
 * bear, base and bull estimate times the per-share figure the filings
 * supply (sales, gross profit, trailing earnings and free cash flow, the
 * person's own forward figures, the addressable market); and the DCF from
 * lib/dcf.ts. The method the person chooses gives the record's own
 * valuation. Pure: nothing fetched, kept or logged. Not investment advice.
 *
 * Per-share figures are in the filings' currency; `fx` (listing units per
 * one filing unit, 1 when the same) carries each value to the price's.
 */

export type StageReading = {
  /** The stage the tests decided, or null when the filings give too little to decide. */
  stage: StageId | null;
  /** The rule that decided it, or what is missing. */
  words: string;
  /** Every field the tests read, with today's value. */
  read: { field: FundamentalField; label: string; value: number | null }[];
  /** A test skipped because its field had no reading. */
  notes: string[];
};

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
const label = (f: FundamentalField) => (FIELDS as Record<string, { label: string }>)[f]?.label ?? f.replace(/_/g, " ");

/** The stage from today's fundamentals, by the ontology's tests in order; deterministic, the rule and the figures named. */
export function stageOf(readings: Record<string, number | null | undefined>): StageReading {
  const fields = [...new Set(STAGE_TESTS.flatMap((t) => t.when.map((w) => w.field)))];
  const read = fields.map((field) => ({ field, label: label(field), value: readings[field] ?? null }));
  const value = (f: FundamentalField) => readings[f] ?? null;
  const missing = STAGE_READS.filter((f) => value(f) === null);
  if (missing.length) return { stage: null, words: `Needs ${missing.map(label).join(" and ")} from the filings before a stage can be decided.`, read, notes: [] };
  const notes: string[] = [];
  for (const t of STAGE_TESTS) {
    let holds = true;
    let skipped = false;
    for (const w of t.when) {
      const v = value(w.field);
      if (v === null) {
        skipped = true;
        break;
      }
      if (!(w.is === "lt" ? v < w.value : v >= w.value)) {
        holds = false;
        break;
      }
    }
    if (skipped) {
      notes.push(`${STAGE[t.stage].label} could not be tested: ${t.when.filter((w) => value(w.field) === null).map((w) => label(w.field).toLowerCase()).join(" and ")} not read from the filings.`);
      continue;
    }
    if (holds && !t.when.length && notes.length) {
      // The catch-all would only guess between the stages whose tests were skipped.
      const need = [...new Set(STAGE_TESTS.flatMap((x) => x.when.filter((w) => value(w.field) === null).map((w) => label(w.field).toLowerCase())))];
      return { stage: null, words: `Free cash flow is a tenth of revenue or more; needs ${need.join(" and ")} from the filings to tell operating leverage from capital return.`, read, notes };
    }
    if (holds) {
      const figures = t.when.map((w) => `${label(w.field).toLowerCase()} ${fmt(value(w.field)!)}${FIELDS[w.field].type === "pct" ? "%" : ""}`).join(", ");
      return { stage: t.stage, words: `${t.words}${figures ? ` Read: ${figures}.` : ""}`, read, notes };
    }
  }
  return { stage: null, words: "No stage test held on the figures read.", read, notes };
}

/** The metrics a person can keep as the method of their valuation: every metric but the reverse DCF, which only reads the price. */
export const VALUATION_METHODS = VALUATION_METRICS.filter((m) => m !== "reverse_dcf") as Exclude<ValuationMetric, "reverse_dcf">[];
export type ValuationMethod = (typeof VALUATION_METHODS)[number];
/** The metrics valued as a multiple of a per-share figure. */
export const MULTIPLE_METRICS = ["ps", "pgp", "forward_pe", "forward_pfcf", "trailing_pe", "trailing_pfcf"] as const;
export type MultipleMetric = (typeof MULTIPLE_METRICS)[number];

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const casesSchema = z.object({ bear: z.number(), base: z.number(), bull: z.number() });
export type Cases = z.infer<typeof casesSchema>;
const multiple = z.object({ bear: z.number().min(0).max(1000), base: z.number().min(0).max(1000), bull: z.number().min(0).max(1000) });
const perShare = z.number().nullable().default(null);

export const valuationInputsSchema = z.object({
  /** The person's own stage, when they set one; null reads the filings'. */
  stage: z.enum(STAGES).nullable().default(null),
  /** The metric whose cases are kept as the own valuation. */
  method: z.enum(VALUATION_METHODS as [ValuationMethod, ...ValuationMethod[]]),
  /** The filings' currency, the price's currency and the rate between them. */
  currency: z.string().min(3).max(8),
  priceCurrency: z.string().max(8).nullable().default(null),
  fx: z.number().positive().default(1),
  price: z.number().positive().nullable().default(null),
  /** Trailing per-share figures in the filings' currency, from the filings, each editable. */
  perShare: z.object({ revenue: perShare, grossProfit: perShare, eps: perShare, fcf: perShare }),
  perShareLabel: z.string().max(60).nullable().default(null),
  /** The person's own next-twelve-months figures per share, in the filings' currency. */
  forward: z.object({ eps: perShare, fcf: perShare }),
  /** The bear, base and bull multiple of each metric the person estimated. */
  multiples: z.object({ ps: multiple.nullable().default(null), pgp: multiple.nullable().default(null), forward_pe: multiple.nullable().default(null), forward_pfcf: multiple.nullable().default(null), trailing_pe: multiple.nullable().default(null), trailing_pfcf: multiple.nullable().default(null) }),
  /** The addressable market in millions of the filings' currency, the share taken in each case, the margin on it, the multiple that profit deserves, and the shares in millions. */
  tam: z.object({ market: z.number().positive(), sharePct: z.object({ bear: z.number().min(0).max(100), base: z.number().min(0).max(100), bull: z.number().min(0).max(100) }), marginPct: z.number().min(-50).max(100), multiple: z.number().min(0).max(1000), shares: z.number().positive() }).nullable().default(null),
  asOf: isoDay,
  note: z.string().max(600).nullable().default(null),
});
export type ValuationInputs = z.infer<typeof valuationInputsSchema>;

export type MetricReading = {
  metric: ValuationMetric;
  label: string;
  short: string;
  /** How useful the metric is at the stage; null when no stage is decided. */
  use: MetricUse | null;
  /** The three values per share in the price's currency, or null with `words` saying what is missing. */
  cases: Cases | null;
  vsPricePct: Cases | null;
  words: string;
};

export type ValuationResult = {
  /** The filings' stage, the person's own when set, and which is in force. */
  reading: StageReading;
  stage: StageId | null;
  own: boolean;
  /** Every metric, the most useful at the stage first, each valued where its inputs exist. */
  metrics: MetricReading[];
  method: ValuationMethod | null;
  /** The chosen method's cases, or null when its inputs are missing. */
  chosen: MetricReading | null;
  /** The basis in a few words, for the record. */
  basis: string | null;
  price: number | null;
  priceCurrency: string | null;
  asOf: string;
};

const USE_ORDER: Record<MetricUse, number> = { useful: 0, somewhat: 1, not: 2 };
const r2 = (v: number) => Math.round(v * 100) / 100;

function versus(cases: Cases, price: number | null): Cases | null {
  if (!price) return null;
  const g = (v: number) => (v / price - 1) * 100;
  return { bear: g(cases.bear), base: g(cases.base), bull: g(cases.bull) };
}

/** The three values of a multiple on a per-share figure, carried to the price's currency. */
function byMultiple(figure: number | null, m: { bear: number; base: number; bull: number } | null, fx: number, needs: string): { cases: Cases | null; words: string } {
  if (figure === null) return { cases: null, words: `Needs ${needs}.` };
  if (figure <= 0) return { cases: null, words: `${needs[0].toUpperCase()}${needs.slice(1)} is not positive, so a multiple of it says nothing.` };
  if (!m) return { cases: null, words: "Enter the bear, base and bull multiple." };
  return { cases: { bear: r2(figure * m.bear * fx), base: r2(figure * m.base * fx), bull: r2(figure * m.bull * fx) }, words: `${fmt(m.bear)}× / ${fmt(m.base)}× / ${fmt(m.bull)}× on ${fmt(figure)} per share.` };
}

/**
 * Every metric valued on the inputs and the DCF, the stage decided from the
 * readings (the person's own stage in force when set), and the chosen
 * method's cases. With no inputs kept the stage and the DCF still read, so
 * a report carries the stage before anything is estimated.
 */
export function runValuation(i: { inputs: ValuationInputs | null; dcf: DcfResult | null; readings: Record<string, number | null | undefined>; price: number | null; priceCurrency: string | null; asOf: string }): ValuationResult {
  const reading = stageOf(i.readings);
  const v = i.inputs;
  const stage = v?.stage ?? reading.stage;
  const own = !!v?.stage && v.stage !== reading.stage;
  const price = v?.price ?? i.price;
  const priceCurrency = v?.priceCurrency ?? i.priceCurrency;
  const fx = v?.fx ?? 1;
  const dcf = i.dcf;
  const metricOf = (metric: ValuationMetric): MetricReading => {
    const m = VALUATION_METRIC[metric];
    const use = stage ? metricUse(metric, stage) : null;
    let cases: Cases | null = null;
    let words = "";
    if (metric === "dcf") {
      if (dcf) {
        cases = { bear: r2(dcf.cases.bear.perShare), base: r2(dcf.cases.base.perShare), bull: r2(dcf.cases.bull.perShare) };
        words = `DCF on ${DCF_BASIS_LABEL[dcf.basis].toLowerCase()}, as of ${dcf.asOf}.`;
      } else words = "Run the DCF below.";
    } else if (metric === "reverse_dcf") {
      if (dcf?.implied) words = `The price needs ${dcf.implied.cagrPct !== null && Number.isFinite(dcf.implied.cagrPct) ? `${fmt(dcf.implied.cagrPct)}% revenue growth a year` : "a growth no path reaches"} at ${dcf.implied.marginPct === null ? "the base margin" : `a ${fmt(dcf.implied.marginPct)}% margin`} on the base path.`;
      else words = dcf ? "Needs a price." : "Run the DCF below.";
    } else if (metric === "tam") {
      const t = v?.tam ?? null;
      if (!t) words = "Enter the market, the share in each case, the margin, the multiple and the shares.";
      else {
        const per = (sharePct: number) => r2(((t.market * (sharePct / 100) * (t.marginPct / 100) * t.multiple) / t.shares) * fx);
        cases = { bear: per(t.sharePct.bear), base: per(t.sharePct.base), bull: per(t.sharePct.bull) };
        words = `${fmt(t.sharePct.bear)}% / ${fmt(t.sharePct.base)}% / ${fmt(t.sharePct.bull)}% of a ${t.market.toLocaleString("en-US", { maximumFractionDigits: 0 })}m market at a ${fmt(t.marginPct)}% margin, ${fmt(t.multiple)}× that profit, over ${fmt(t.shares)}m shares.`;
      }
    } else {
      const figure = !v ? null : metric === "ps" ? v.perShare.revenue : metric === "pgp" ? v.perShare.grossProfit : metric === "trailing_pe" ? v.perShare.eps : metric === "trailing_pfcf" ? v.perShare.fcf : metric === "forward_pe" ? v.forward.eps : v.forward.fcf;
      const needs = metric === "ps" ? "revenue per share from the filings" : metric === "pgp" ? "gross profit per share from the filings" : metric === "trailing_pe" ? "trailing EPS from the filings" : metric === "trailing_pfcf" ? "trailing free cash flow per share from the filings" : metric === "forward_pe" ? "your next-twelve-months EPS" : "your next-twelve-months free cash flow per share";
      const r = byMultiple(figure, v?.multiples[metric] ?? null, fx, needs);
      cases = r.cases;
      words = r.words;
    }
    return { metric, label: m.label, short: m.short, use, cases, vsPricePct: cases ? versus(cases, price) : null, words };
  };
  const metrics = VALUATION_METRICS.map(metricOf).sort((a, b) => (a.use && b.use ? USE_ORDER[a.use] - USE_ORDER[b.use] : 0) || VALUATION_METRICS.indexOf(a.metric) - VALUATION_METRICS.indexOf(b.metric));
  const method: ValuationMethod | null = v?.method ?? (dcf ? "dcf" : null);
  const chosen = method ? (metrics.find((m) => m.metric === method) ?? null) : null;
  const how = (m: MetricReading) => (m.metric === "dcf" ? `DCF on ${DCF_BASIS_LABEL[dcf!.basis].toLowerCase()}` : m.metric === "tam" ? `TAM, ${fmt(v!.tam!.sharePct.base)}% share base` : `${m.short} ${fmt(v!.multiples[m.metric as MultipleMetric]!.base)}× base`);
  const basis = chosen?.cases ? `${how(chosen)}${stage ? `, stage ${STAGE[stage].n} ${STAGE[stage].label}` : ""}, ${i.asOf}`.slice(0, 80) : null;
  return { reading, stage, own, metrics, method, chosen: chosen?.cases ? chosen : null, basis, price, priceCurrency, asOf: i.asOf };
}

/** The record's own valuation from the chosen method: bear as the low, base, bull as the high, the method and stage in a few words. */
export function ownValuationFrom(r: ValuationResult): { low: number; base: number; high: number; basis: string; asOf: string } | null {
  const c = r.chosen?.cases;
  if (!c || !r.basis) return null;
  return { low: r2(Math.min(c.bear, c.base)), base: r2(c.base), high: r2(Math.max(c.bull, c.base)), basis: r.basis, asOf: r.asOf };
}

export type ValuationSeed = {
  /** Trailing figures in whole units of the filings' currency: revenue, gross profit, free cash flow, diluted EPS, diluted shares. */
  revenue: number | null;
  grossProfit: number | null;
  fcf: number | null;
  epsDiluted: number | null;
  dilutedShares: number | null;
  /** Growth on the trailing twelve months, in percent, to carry the trailing figures a year forward. */
  revenueGrowthPct: number | null;
  epsGrowthPct: number | null;
  periodLabel: string | null;
  currency: string | null;
};

/** The multiple the price pays today for a per-share figure, else a plain starting multiple; bear at four fifths, bull at six fifths. */
function seedMultiple(figure: number | null, price: number | null, fx: number, fallback: number) {
  const today = figure && figure > 0 && price ? price / (figure * fx) : null;
  const base = today && today > 0 && today < 500 ? Math.round(today * 10) / 10 : fallback;
  return { bear: Math.round(base * 8) / 10, base, bull: Math.round(base * 12) / 10 };
}

/**
 * The inputs the filings suggest before the person changes any: the trailing
 * per-share figures, the forward figures at the trailing growth, each
 * multiple at today's (bear four fifths, bull six fifths), the addressable
 * market left for the person, and the method: the DCF when it is useful at
 * the stage and exists, else the first useful metric the filings can value.
 * Null when the filings give no revenue or share count.
 */
export function valuationDefaults(s: ValuationSeed, stage: StageId | null, price: number | null, priceCurrency: string | null, asOf: string, hasDcf: boolean, fx: number | null = null): ValuationInputs | null {
  if (!s.revenue || s.revenue <= 0 || !s.dilutedShares || s.dilutedShares <= 0 || !s.currency) return null;
  const same = !priceCurrency || priceCurrency === s.currency;
  // A price in another currency is laid on the figures at the day's rate when one is given (listing units per filing unit), else left for the person.
  const rate = same ? 1 : fx && fx > 0 ? fx : null;
  const p = rate ? price : null;
  const per = (v: number | null) => (v === null ? null : r2(v / s.dilutedShares!));
  const ps = { revenue: per(s.revenue), grossProfit: per(s.grossProfit), eps: s.epsDiluted === null ? null : r2(s.epsDiluted), fcf: per(s.fcf) };
  const g = (pct: number | null) => 1 + Math.max(-20, Math.min(60, pct ?? 8)) / 100;
  const forward = { eps: ps.eps === null ? null : r2(ps.eps * g(s.epsGrowthPct ?? s.revenueGrowthPct)), fcf: ps.fcf === null ? null : r2(ps.fcf * g(s.revenueGrowthPct)) };
  const multiples = {
    ps: seedMultiple(ps.revenue, p, rate ?? 1, 5),
    pgp: seedMultiple(ps.grossProfit, p, rate ?? 1, 10),
    forward_pe: seedMultiple(forward.eps, p, rate ?? 1, 20),
    forward_pfcf: seedMultiple(forward.fcf, p, rate ?? 1, 20),
    trailing_pe: seedMultiple(ps.eps, p, rate ?? 1, 22),
    trailing_pfcf: seedMultiple(ps.fcf, p, rate ?? 1, 22),
  };
  const valued = (m: ValuationMethod) => (m === "dcf" ? hasDcf : m === "tam" ? false : m === "ps" ? ps.revenue! > 0 : m === "pgp" ? (ps.grossProfit ?? 0) > 0 : m === "trailing_pe" ? (ps.eps ?? 0) > 0 : m === "trailing_pfcf" ? (ps.fcf ?? 0) > 0 : m === "forward_pe" ? (forward.eps ?? 0) > 0 : (forward.fcf ?? 0) > 0);
  const ranked = stage ? [...VALUATION_METHODS].sort((a, b) => USE_ORDER[metricUse(a, stage)] - USE_ORDER[metricUse(b, stage)]) : [...VALUATION_METHODS];
  const method = (stage && hasDcf && metricUse("dcf", stage) === "useful" ? "dcf" : null) ?? ranked.find(valued) ?? "ps";
  const draft = { stage: null, method, currency: s.currency, priceCurrency: same ? s.currency : priceCurrency, fx: rate ?? 1, price: p, perShare: ps, perShareLabel: s.periodLabel ? `Per share, ${s.periodLabel}` : "Per share, trailing twelve months", forward, multiples, tam: null, asOf, note: null };
  const parsed = valuationInputsSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

/** What a kept report carries of the valuation, so the deck draws the slide from the report alone. */
export const valuationSummarySchema = z.object({
  stage: z.enum(STAGES).nullable(),
  stageWords: z.string().max(300),
  own: z.boolean(),
  method: z.enum(VALUATION_METHODS as [ValuationMethod, ...ValuationMethod[]]).nullable(),
  methodLabel: z.string().max(60).nullable(),
  perShare: casesSchema.nullable(),
  vsPricePct: casesSchema.nullable(),
  basis: z.string().max(80).nullable(),
  price: z.number().nullable(),
  priceCurrency: z.string().max(8).nullable(),
  asOf: isoDay,
  /** Every metric at the stage: how useful, and its cases where valued. */
  lines: z.array(z.object({ metric: z.enum(VALUATION_METRICS), label: z.string().max(60), use: z.enum(["useful", "somewhat", "not"]).nullable(), perShare: casesSchema.nullable(), words: z.string().max(200) })).max(9),
});
export type ValuationSummary = z.infer<typeof valuationSummarySchema>;

export function valuationSummary(r: ValuationResult): ValuationSummary {
  return {
    stage: r.stage,
    stageWords: r.reading.words.slice(0, 300),
    own: r.own,
    method: r.method,
    methodLabel: r.method ? VALUATION_METRIC[r.method].label : null,
    perShare: r.chosen?.cases ?? null,
    vsPricePct: r.chosen?.vsPricePct ? { bear: r2(r.chosen.vsPricePct.bear), base: r2(r.chosen.vsPricePct.base), bull: r2(r.chosen.vsPricePct.bull) } : null,
    basis: r.basis,
    price: r.price,
    priceCurrency: r.priceCurrency,
    asOf: r.asOf,
    lines: r.metrics.map((m) => ({ metric: m.metric, label: m.label.slice(0, 60), use: m.use, perShare: m.cases, words: m.words.slice(0, 200) })),
  };
}

/** The stage's metrics in a sentence: which are useful, which somewhat. */
export function stageMetricsWords(stage: StageId): string {
  const useful = VALUATION_METRICS.filter((m) => metricUse(m, stage) === "useful").map((m) => VALUATION_METRIC[m].short);
  const some = VALUATION_METRICS.filter((m) => metricUse(m, stage) === "somewhat").map((m) => VALUATION_METRIC[m].short);
  return `${METRIC_USE_LABEL.useful}: ${useful.join(", ") || "none"}. ${METRIC_USE_LABEL.somewhat}: ${some.join(", ") || "none"}.`;
}
