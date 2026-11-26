import { z } from "zod";
import type { FactsTable, Flow } from "@/lib/edgar-facts";
import { separateHistory, type SegmentHistory, type SegmentPeriod } from "@/lib/edgar-segments";

/**
 * How a period's revenue became profit, as a flow (Hamza, 5 Nov 2026, after
 * the "income statement flow" charts: "much easier to understand and much
 * more visually appealing"): the revenue by segment, region or holding on
 * the left, then revenue, gross profit and the cost of revenue, operating
 * income and the operating expenses with their parts, and net income with
 * tax and the rest. One model for a company's quarter or trailing twelve
 * months (from the filings' facts or the release's own printed figures) and
 * for the book's look-through (each holding's share of its company's lines,
 * at its weight), and one layout (`flowLayout`) that the web page, the PDF,
 * the app's cards and the email picture all draw, so they never disagree.
 *
 * Nothing is estimated: a line the filings do not carry is not drawn, a
 * level that does not add up is not drawn, and a loss ends the flow at the
 * level it occurs, said in words. Pure.
 */

/** At most this many sources (segments, regions, holdings) before the rest are one "Other". */
export const FLOW_SOURCES = 6;
/** A source list is drawn only when it adds up to revenue within this share. */
export const SOURCES_TOLERANCE = 0.02;
/** A node smaller than this share of revenue is folded into its neighbour's remainder. */
export const MIN_NODE_SHARE = 0.003;

const num = z.number().finite();
const part = z.object({ name: z.string().max(80), value: num });

export const incomeFlowSchema = z.object({
  /** The period in words: "Q3 2026", "TTM to 2026Q3", "Past twelve months". */
  label: z.string().max(60),
  basis: z.enum(["quarter", "ttm", "year"]),
  /** The currency the money is in; null for a look-through, which is in the book's base. */
  currency: z.string().max(8).nullable(),
  from: z.enum(["filing", "release", "lookthrough"]),
  sourcesKind: z.enum(["segment", "product", "region", "holding"]).nullable(),
  sources: z.array(part.extend({ growthPct: num.nullable() })).max(FLOW_SOURCES + 1),
  revenue: num,
  revenueGrowthPct: num.nullable(),
  costOfRevenue: num.nullable(),
  grossProfit: num.nullable(),
  /** Costs that reach the operating expenses straight from revenue: a company that files no gross profit line (all its costs), or, in a look-through, the holdings that file none. */
  directCosts: num.nullable(),
  /** Operating income that does not pass through gross profit, for the same reason. */
  directOperating: num.nullable(),
  /** The operating expenses' own lines (research and development, selling and marketing, ...), the rest named as such; each line's growth on the same period a year before where both are filed. */
  opex: z.array(part.extend({ growthPct: num.nullable().default(null) })).max(6),
  operatingIncome: num.nullable(),
  taxExpense: num.nullable(),
  /** What lies between operating income and net income besides the tax: interest, other gains and losses; a cost when positive. */
  otherCosts: num.nullable(),
  /** The same when it adds to net income. */
  otherIncome: num.nullable(),
  netIncome: num.nullable(),
  /** Margins the same period a year before, for the change in points. */
  before: z.object({ grossMarginPct: num.nullable(), operatingMarginPct: num.nullable(), netMarginPct: num.nullable() }).nullable(),
  growth: z.object({ grossProfit: num.nullable(), operatingIncome: num.nullable(), netIncome: num.nullable() }).nullable(),
  /** What the flow leaves out and why, in words (a holding with no filings, a line not filed). */
  notes: z.array(z.string().max(160)).max(12).default([]),
});
export type IncomeFlow = z.infer<typeof incomeFlowSchema>;

/** One period's lines, as the facts or the release give them; absent or null where not filed. */
export type FlowLines = Partial<Record<"revenue" | "costOfRevenue" | "grossProfit" | "rnd" | "sellingMarketing" | "generalAdmin" | "sga" | "operatingIncome" | "pretaxIncome" | "taxExpense" | "netIncome", number | null>>;

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const growth = (now: number | null, then: number | null | undefined) => (isNum(now) && isNum(then) && then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : null);
const pct = (v: number | null | undefined, r: number | null | undefined) => (isNum(v) && isNum(r) && r > 0 ? (v / r) * 100 : null);

/** Gross profit as filed, else revenue less the cost of revenue; none when it does not fit inside revenue. */
function grossOf(l: FlowLines): number | null {
  const r = l.revenue;
  if (!isNum(r) || r <= 0) return null;
  const g = isNum(l.grossProfit) ? l.grossProfit : isNum(l.costOfRevenue) ? r - Math.abs(l.costOfRevenue) : null;
  return g !== null && g > 0 && g <= r * 1.0001 ? g : null;
}

/** The operating expenses' own lines: research and development, then selling and marketing and general and administrative, else the two together. */
function opexParts(l: FlowLines): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  if (isNum(l.rnd) && l.rnd > 0) out.push({ name: "Research and development", value: l.rnd });
  if (isNum(l.sellingMarketing) && l.sellingMarketing > 0 && isNum(l.generalAdmin) && l.generalAdmin > 0) {
    out.push({ name: "Sales and marketing", value: l.sellingMarketing }, { name: "General and administrative", value: l.generalAdmin });
  } else if (isNum(l.sga) && l.sga > 0) out.push({ name: "Selling, general and administrative", value: l.sga });
  return out;
}

/** Parts that fit inside a total, the rest named; none when the parts are more than the total (a line classed elsewhere). */
function split(total: number, parts: { name: string; value: number }[], rest: string, revenue: number): { name: string; value: number }[] {
  const sum = parts.reduce((a, p) => a + p.value, 0);
  if (!parts.length || sum > total * 1.02) return [];
  const left = total - sum;
  return left > revenue * MIN_NODE_SHARE ? [...parts, { name: rest, value: left }] : parts;
}

/** Sources that add up to revenue, the largest first, past FLOW_SOURCES as Other; none when they do not add up. */
export function flowSources(revenue: number, lines: readonly { name: string; value: number; growthPct?: number | null }[]): IncomeFlow["sources"] {
  const pos = lines.filter((l) => isNum(l.value) && l.value > 0).sort((a, b) => b.value - a.value);
  if (pos.length < 2) return [];
  const sum = pos.reduce((a, l) => a + l.value, 0);
  if (sum > revenue * (1 + SOURCES_TOLERANCE) || sum < revenue * 0.8) return [];
  const head = pos.slice(0, FLOW_SOURCES).map((l) => ({ name: l.name.slice(0, 80), value: l.value, growthPct: l.growthPct ?? null }));
  const rest = pos.slice(FLOW_SOURCES).reduce((a, l) => a + l.value, 0) + Math.max(0, revenue - sum);
  return rest > revenue * MIN_NODE_SHARE ? [...head, { name: "Other", value: rest, growthPct: null }] : head;
}

/**
 * The flow of one period from its lines and the same period a year before.
 * Null when there is no revenue. Gross profit is drawn only when it is filed
 * (or the cost of revenue is); without it the costs go straight from
 * revenue. The operating expenses are gross profit less operating income,
 * split into their filed lines when those fit. Below operating income, the
 * tax and the rest are what lies between it and net income.
 */
export function buildFlow(now: FlowLines, before: FlowLines | null, meta: { label: string; basis: IncomeFlow["basis"]; currency: string | null; from: IncomeFlow["from"] }, sources: { kind: NonNullable<IncomeFlow["sourcesKind"]>; lines: readonly { name: string; value: number; growthPct?: number | null }[] } | null = null): IncomeFlow | null {
  const rev = now.revenue;
  if (!isNum(rev) || rev <= 0) return null;
  const gross = grossOf(now);
  const op = isNum(now.operatingIncome) ? now.operatingIncome : null;
  const net = isNum(now.netIncome) ? now.netIncome : null;
  const parts = opexParts(now);
  let opex: { name: string; value: number }[] = [];
  let directCosts: number | null = null;
  let directOperating: number | null = null;
  if (gross !== null && op !== null && op > 0 && gross >= op) opex = split(gross - op, parts, "Other operating", rev);
  if (gross === null && op !== null && op > 0) {
    directCosts = rev - op;
    directOperating = op;
    opex = split(directCosts, parts, "Cost of revenue and other", rev);
  }
  let taxExpense: number | null = null;
  let otherCosts: number | null = null;
  let otherIncome: number | null = null;
  if (op !== null && op > 0 && net !== null) {
    taxExpense = isNum(now.taxExpense) && now.taxExpense > 0 ? now.taxExpense : null;
    const rest = op - (taxExpense ?? 0) - Math.max(0, net);
    if (rest >= 0) otherCosts = rest > rev * MIN_NODE_SHARE ? rest : null;
    else otherIncome = -rest > rev * MIN_NODE_SHARE ? -rest : null;
  }
  const b = before && isNum(before.revenue) && before.revenue > 0 ? before : null;
  const was = new Map(b ? opexParts(b).map((p) => [p.name, p.value]) : []);
  const src = sources ? flowSources(rev, sources.lines) : [];
  return {
    ...meta,
    sourcesKind: src.length ? sources!.kind : null,
    sources: src,
    revenue: rev,
    revenueGrowthPct: growth(rev, b?.revenue),
    costOfRevenue: gross !== null ? rev - gross : null,
    grossProfit: gross,
    directCosts,
    directOperating,
    opex: opex.map((p) => ({ ...p, growthPct: growth(p.value, was.get(p.name)) })),
    operatingIncome: op,
    taxExpense,
    otherCosts,
    otherIncome,
    netIncome: net,
    before: b ? { grossMarginPct: pct(grossOf(b), b.revenue), operatingMarginPct: pct(b.operatingIncome, b.revenue), netMarginPct: pct(b.netIncome, b.revenue) } : null,
    growth: b ? { grossProfit: growth(gross, grossOf(b)), operatingIncome: growth(op, b.operatingIncome), netIncome: growth(net, b.netIncome) } : null,
    notes: [],
  };
}

// ---------------------------------------------------------------------------
// From the filings

const DAY = 86_400_000;
const near = (a: string, b: string, days = 20) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= days * DAY;
const shiftDays = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** The last day of a calendar quarter key: "2026Q3" is 2026-09-30. */
export const quarterEnd = (key: string) => `${key.slice(0, 4)}-${["03-31", "06-30", "09-30", "12-31"][Number(key.slice(5)) - 1]}`;
const quarterBack = (key: string, n: number) => {
  const i = Number(key.slice(0, 4)) * 4 + Number(key.slice(5)) - 1 - n;
  return `${Math.floor(i / 4)}Q${(i % 4) + 1}`;
};
/** "2026Q3" in words: "Q3 2026". */
export const quarterWords = (key: string) => `Q${key.slice(5)} ${key.slice(0, 4)}`;

type Sources = { kind: "segment" | "product"; lines: { name: string; value: number; growthPct: number | null }[] };

/**
 * The revenue by segment, else by product, for the period ending near `end`
 * from the filings' segment history: a quarter, a year, or four quarters
 * summed for the trailing twelve months (all four filed, or none). Each line's
 * growth is against the same period a year before, when filed. Null when no
 * family has the period.
 */
export function segmentSources(given: SegmentHistory | null | undefined, end: string, span: "quarter" | "year" | "ttm"): Sources | null {
  // Never places: a flow's sources are what the company sells (separateHistory for a history kept before places had their own family).
  const h = given ? separateHistory(given) : null;
  for (const kind of ["segment", "product"] as const) {
    const fam = h?.[kind];
    if (!fam) continue;
    const at = (list: readonly SegmentPeriod[], e: string) => list.find((p) => near(p.end, e)) ?? null;
    const sum = (ends: string[], list: readonly SegmentPeriod[]) => {
      const ps = ends.map((e) => at(list, e));
      if (ps.some((p) => !p)) return null;
      const m = new Map<string, number>();
      for (const p of ps) for (const l of p!.lines) m.set(l.name, (m.get(l.name) ?? 0) + l.value);
      return m;
    };
    let now: Map<string, number> | null = null;
    let then: Map<string, number> | null = null;
    if (span === "year") {
      now = sum([end], fam.years);
      then = sum([shiftDays(end, -365)], fam.years);
    } else {
      const ends = span === "quarter" ? [end] : [0, 1, 2, 3].map((n) => shiftDays(end, -91 * n));
      now = sum(ends, fam.quarters);
      then = sum(ends.map((e) => shiftDays(e, -365)), fam.quarters);
    }
    if (!now || now.size < 2) continue;
    return { kind, lines: [...now].map(([name, value]) => ({ name, value, growthPct: growth(value, then?.get(name)) })) };
  }
  return null;
}

/** The lines of one period from the facts: a quarter's, or the trailing twelve months'. */
function factLines(t: FactsTable, get: (k: Flow) => number | null | undefined): FlowLines {
  const v = (k: Flow) => {
    const x = get(k);
    return isNum(x) ? x : null;
  };
  // SG&A falls back to G&A alone in the facts; then it is G&A, not the whole.
  const sga = t.concept.sga === "GeneralAndAdministrativeExpense" ? null : v("sga");
  return { revenue: v("revenue"), costOfRevenue: v("costOfRevenue"), grossProfit: v("grossProfit"), rnd: v("rnd"), sellingMarketing: v("sellingMarketing"), generalAdmin: v("generalAdmin"), sga, operatingIncome: v("operatingIncome"), pretaxIncome: v("pretaxIncome"), taxExpense: v("taxExpense"), netIncome: v("netIncome") };
}

/**
 * A company's flow from its filings' facts: the latest quarter against the
 * same quarter a year before, or the trailing twelve months against the
 * twelve before (the latest fiscal year for a filer with no quarters), with
 * the revenue by segment from the segment history when it has the period.
 */
export function flowFromFacts(t: FactsTable, span: "quarter" | "ttm", history: SegmentHistory | null | undefined = null): IncomeFlow | null {
  if (span === "quarter") {
    const q = t.latestQuarter;
    if (!q) return null;
    const ago = quarterBack(q, 4);
    return buildFlow(factLines(t, (k) => t.quarterly[k][q]), factLines(t, (k) => t.quarterly[k][ago]), { label: quarterWords(q), basis: "quarter", currency: t.currency, from: "filing" }, segmentSources(history, quarterEnd(q), "quarter"));
  }
  if (t.basis === "none") return null;
  if (t.basis === "annual") {
    const y = t.years.at(-1);
    const end = y ? (history?.segment ?? history?.product)?.years.find((p) => p.end.slice(0, 4) === y)?.end ?? null : null;
    return buildFlow(factLines(t, (k) => t.ttm[k]), factLines(t, (k) => t.priorTtm[k]), { label: t.period ?? "The latest year", basis: "year", currency: t.currency, from: "filing" }, end ? segmentSources(history, end, "year") : null);
  }
  const q = t.latestQuarter;
  return buildFlow(factLines(t, (k) => t.ttm[k]), factLines(t, (k) => t.priorTtm[k]), { label: q ? `Twelve months to ${quarterWords(q)}` : "Past twelve months", basis: "ttm", currency: t.currency, from: "filing" }, q ? segmentSources(history, quarterEnd(q), "ttm") : null);
}

/** A table of series as the filings entry keeps it (lib/earnings.ts SeriesTable): columns, and rows of values by key. */
export type SeriesLike = { cols: readonly string[]; rows: readonly { key: string; values: readonly (number | null)[] }[] };

const SERIES_KEYS = ["revenue", "costOfRevenue", "grossProfit", "rnd", "sellingMarketing", "generalAdmin", "sga", "operatingIncome", "pretaxIncome", "taxExpense", "netIncome"] as const;

/** One column's lines from a series table; gross profit from the gross margin when only that is kept. */
function seriesLines(t: SeriesLike, i: number): FlowLines {
  const at = (k: string) => {
    const v = t.rows.find((r) => r.key === k)?.values[i];
    return isNum(v) ? v : null;
  };
  const out: FlowLines = {};
  for (const k of SERIES_KEYS) out[k] = at(k);
  const margin = at("grossMarginPct");
  if (!isNum(out.grossProfit) && !isNum(out.costOfRevenue) && isNum(margin) && isNum(out.revenue)) out.grossProfit = (out.revenue * margin) / 100;
  // A table keeps no concept, so an SG&A that is G&A alone (the same figure) is G&A.
  if (isNum(out.sga) && isNum(out.generalAdmin) && Math.abs(out.sga - out.generalAdmin) < 1) out.sga = null;
  return out;
}

/** "Q3 24" (lib/earnings.ts quartersOf's columns, calendar quarters) as "2024Q3"; null for any other column. */
const seriesQuarter = (col: string) => {
  const m = /^Q([1-4]) (\d{2})$/.exec(col);
  return m ? `20${m[2]}Q${m[1]}` : null;
};

/**
 * A company's flow from the series its filings entry keeps, for an entry read
 * before the flows were kept (and the demo's): the latest quarter of the
 * quarters table against the same quarter a year before, or the last column
 * of the years table (the trailing twelve months, else the latest year)
 * against the year before it. Fewer lines than the facts (no operating
 * expenses' parts unless kept), never a figure the table lacks.
 */
export function flowFromSeries(t: SeriesLike | null | undefined, span: "quarter" | "ttm", currency: string | null, history: SegmentHistory | null | undefined = null): IncomeFlow | null {
  if (!t || !t.cols.length) return null;
  const rev = t.rows.find((r) => r.key === "revenue")?.values ?? [];
  let i = t.cols.length - 1;
  while (i >= 0 && !(isNum(rev[i]) && rev[i]! > 0)) i--;
  if (i < 0) return null;
  const col = t.cols[i];
  if (span === "quarter") {
    const q = seriesQuarter(col);
    if (!q) return null;
    const ago = quarterBack(q, 4);
    const j = t.cols.findIndex((c) => seriesQuarter(c) === ago);
    return buildFlow(seriesLines(t, i), j >= 0 ? seriesLines(t, j) : null, { label: quarterWords(q), basis: "quarter", currency, from: "filing" }, segmentSources(history, quarterEnd(q), "quarter"));
  }
  const ttm = /^TTM to (\d{4}Q[1-4])$/.exec(col)?.[1] ?? null;
  if (ttm) return buildFlow(seriesLines(t, i), null, { label: `Twelve months to ${quarterWords(ttm)}`, basis: "ttm", currency, from: "filing" }, segmentSources(history, quarterEnd(ttm), "ttm"));
  if (!/^\d{4}$/.test(col)) return null;
  const j = t.cols.indexOf(String(Number(col) - 1));
  const end = (history?.segment ?? history?.product)?.years.find((p) => p.end.slice(0, 4) === col)?.end ?? null;
  return buildFlow(seriesLines(t, i), j >= 0 ? seriesLines(t, j) : null, { label: `Fiscal ${col}`, basis: "year", currency, from: "filing" }, end ? segmentSources(history, end, "year") : null);
}

/** One holding's company flow at its share of the book: its revenue is the holding's value over the company's price to sales. */
export type LookHolding = { symbol: string; value: number; psRatio: number | null; flow: IncomeFlow | null };

/**
 * The book's look-through flow (Hamza, 5 Nov 2026): each listed holding's
 * share of its company's trailing twelve months, sized by what is held (the
 * value over the price to sales, so the currency of the filings never
 * enters), every line of the company's flow scaled to it, and summed. The
 * holdings are the sources. A holding with no price to sales or no flow is
 * left out and named; a holding whose company files no gross profit line
 * reaches the operating expenses straight from revenue.
 */
export function lookThroughFlow(holdings: readonly LookHolding[], label = "Past twelve months, your share"): IncomeFlow | null {
  const notes: string[] = [];
  const used: { symbol: string; k: number; f: IncomeFlow; share: number }[] = [];
  for (const h of holdings) {
    if (!(h.value > 0)) continue;
    if (!h.flow || !(h.flow.revenue > 0)) {
      notes.push(`${h.symbol}: no filed revenue the app reads`);
      continue;
    }
    if (!isNum(h.psRatio) || h.psRatio <= 0) {
      notes.push(`${h.symbol}: no price to sales to size its share`);
      continue;
    }
    const share = h.value / h.psRatio;
    used.push({ symbol: h.symbol, k: share / h.flow.revenue, f: h.flow, share });
  }
  if (!used.length) return null;
  const sum = (pick: (f: IncomeFlow) => number | null, k: (u: (typeof used)[number]) => number = (u) => u.k) => used.reduce((a, u) => a + (pick(u.f) ?? 0) * k(u), 0);
  const revenue = sum((f) => f.revenue);
  const withGross = used.filter((u) => u.f.grossProfit !== null);
  const opAll = used.every((u) => u.f.operatingIncome !== null);
  const netAll = used.every((u) => u.f.netIncome !== null);
  const grossProfit = withGross.length ? withGross.reduce((a, u) => a + u.f.grossProfit! * u.k, 0) : null;
  const operatingIncome = opAll ? sum((f) => f.operatingIncome) : null;
  const netIncome = netAll ? sum((f) => f.netIncome) : null;
  if (!opAll) notes.push(`operating income not filed by ${used.filter((u) => u.f.operatingIncome === null).map((u) => u.symbol).join(", ")}`);
  const noGross = used.filter((u) => u.f.grossProfit === null);
  if (noGross.length && withGross.length) notes.push(`no gross profit line filed by ${noGross.map((u) => u.symbol).join(", ")}: their costs reach the operating expenses straight from revenue`);
  let directCosts: number | null = null;
  let directOperating: number | null = null;
  let opex: IncomeFlow["opex"] = [];
  if (operatingIncome !== null && operatingIncome > 0) {
    directOperating = noGross.reduce((a, u) => a + (u.f.operatingIncome ?? 0) * u.k, 0);
    directCosts = noGross.reduce((a, u) => a + (u.f.revenue - (u.f.operatingIncome ?? 0)) * u.k, 0);
    const viaGross = grossProfit !== null ? grossProfit - (operatingIncome - directOperating) : 0;
    const total = viaGross + directCosts;
    if (viaGross >= 0 && total > 0) {
      // Each company's own lines, scaled, when every one has them; else the total alone.
      const names = new Map<string, number>();
      let complete = true;
      for (const u of used) {
        if (!u.f.opex.length) complete = false;
        for (const p of u.f.opex) {
          const n = /^(Other operating|Cost of revenue and other)$/.test(p.name) ? "Other costs" : p.name;
          names.set(n, (names.get(n) ?? 0) + p.value * u.k);
        }
      }
      opex = complete ? split(total, [...names].filter(([n]) => n !== "Other costs").map(([name, value]) => ({ name, value })), "Other costs", revenue).map((p) => ({ ...p, growthPct: null })) : [];
    }
    if (!directCosts) directCosts = null;
    if (!directOperating) directOperating = null;
  }
  const taxExpense = netIncome !== null ? sum((f) => f.taxExpense) || null : null;
  let otherCosts: number | null = null;
  let otherIncome: number | null = null;
  if (operatingIncome !== null && operatingIncome > 0 && netIncome !== null) {
    const rest = operatingIncome - (taxExpense ?? 0) - Math.max(0, netIncome);
    if (rest >= 0) otherCosts = rest > revenue * MIN_NODE_SHARE ? rest : null;
    else otherIncome = -rest > revenue * MIN_NODE_SHARE ? -rest : null;
  }
  return {
    label,
    basis: "ttm",
    currency: null,
    from: "lookthrough",
    sourcesKind: used.length >= 2 ? "holding" : null,
    sources: used.length >= 2 ? flowSources(revenue, used.map((u) => ({ name: u.symbol, value: u.share, growthPct: u.f.revenueGrowthPct }))) : [],
    revenue,
    revenueGrowthPct: null,
    costOfRevenue: grossProfit !== null ? withGross.reduce((a, u) => a + u.f.revenue * u.k, 0) - grossProfit : null,
    grossProfit,
    directCosts: grossProfit !== null ? directCosts : null,
    directOperating: grossProfit !== null ? directOperating : null,
    opex,
    operatingIncome,
    taxExpense,
    otherCosts,
    otherIncome,
    netIncome,
    before: null,
    growth: null,
    notes: notes.slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// The layout: nodes in columns, bands between them

/** What a node or band is, for each face to colour: a source by its slot, revenue, a profit or a cost. */
export type FlowRole = { kind: "source"; slot: number } | { kind: "revenue" } | { kind: "profit" } | { kind: "cost" };
export type FlowNode = { id: string; x: number; y: number; w: number; h: number; role: FlowRole; name: string; value: number; sub: string[]; side: "left" | "right" | "above" | "below" };
export type FlowBand = { d: string; role: FlowRole; title: string };
export type FlowText = { x: number; y: number; text: string; anchor: "start" | "middle" | "end"; tone: "name" | "value" | "sub" | "cost" | "profit"; size: number; bold?: boolean };
export type FlowGeometry = { width: number; height: number; nodes: FlowNode[]; bands: FlowBand[]; texts: FlowText[] };

type N = { id: string; col: number; name: string; value: number; role: FlowRole; sub: string[] };
type L = { from: string; to: string; value: number; role: FlowRole };

const sign = (v: number) => (v < 0 ? "-" : "");
/** A money figure short enough for a node: 14.8bn, 512m. */
export function flowMoney(v: number, currency: string | null = null): string {
  const a = Math.abs(v);
  const s = a >= 1e12 ? `${(a / 1e12).toFixed(2)}tn` : a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2)}bn` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k` : a.toFixed(0);
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
  return `${sign(v)}${sym}${s.replace(/\.0+(?=[a-z])/, "")}${sym || !currency ? "" : ` ${currency}`}`;
}
const pts = (now: number | null, then: number | null | undefined) => (isNum(now) && isNum(then) ? `${now - then >= 0 ? "+" : ""}${(now - then).toFixed(1)} pts y/y` : null);
const yoy = (g: number | null | undefined) => (isNum(g) ? `${g >= 0 ? "+" : ""}${g.toFixed(1)}% y/y` : null);

/** The nodes and links of a flow, in columns: sources, revenue, gross profit and cost, operating income and expenses, net income and the rest. */
function graph(f: IncomeFlow, money: (v: number) => string): { nodes: N[]; links: L[]; words: string[] } {
  const nodes: N[] = [];
  const links: L[] = [];
  const words: string[] = [];
  const r = f.revenue;
  const keep = (v: number | null): v is number => isNum(v) && v > r * MIN_NODE_SHARE;
  const margin = (v: number | null) => (isNum(v) ? `${((v / r) * 100).toFixed(1)}% margin` : null);
  f.sources.forEach((s, i) => {
    nodes.push({ id: `s${i}`, col: 0, name: s.name, value: s.value, role: { kind: "source", slot: i }, sub: [`${((s.value / r) * 100).toFixed(1)}% of revenue`, yoy(s.growthPct)].filter((x): x is string => !!x) });
    links.push({ from: `s${i}`, to: "rev", value: s.value, role: { kind: "source", slot: i } });
  });
  nodes.push({ id: "rev", col: 1, name: "Revenue", value: r, role: { kind: "revenue" }, sub: [yoy(f.revenueGrowthPct)].filter((x): x is string => !!x) });
  const g = f.grossProfit;
  const op = f.operatingIncome;
  const opPos = isNum(op) && op > 0;
  if (keep(g)) {
    nodes.push({ id: "gross", col: 2, name: "Gross profit", value: g, role: { kind: "profit" }, sub: [margin(g), pts((g / r) * 100, f.before?.grossMarginPct)].filter((x): x is string => !!x) });
    links.push({ from: "rev", to: "gross", value: g, role: { kind: "profit" } });
    if (keep(f.costOfRevenue)) {
      nodes.push({ id: "cor", col: 2, name: "Cost of revenue", value: f.costOfRevenue, role: { kind: "cost" }, sub: [] });
      links.push({ from: "rev", to: "cor", value: f.costOfRevenue, role: { kind: "cost" } });
    }
  }
  if (opPos) {
    const viaGross = op - (f.directOperating ?? 0);
    nodes.push({ id: "op", col: 3, name: "Operating income", value: op, role: { kind: "profit" }, sub: [margin(op), pts((op / r) * 100, f.before?.operatingMarginPct)].filter((x): x is string => !!x) });
    if (keep(g) && viaGross > 0) links.push({ from: "gross", to: "op", value: viaGross, role: { kind: "profit" } });
    if (keep(f.directOperating)) links.push({ from: "rev", to: "op", value: f.directOperating, role: { kind: "profit" } });
    if (keep(f.otherIncome)) {
      nodes.push({ id: "oi", col: 3, name: "Other income", value: f.otherIncome, role: { kind: "profit" }, sub: [] });
    }
    const viaGrossCost = keep(g) ? g - viaGross : 0;
    const opexTotal = viaGrossCost + (f.directCosts ?? 0);
    if (opexTotal > r * MIN_NODE_SHARE) {
      nodes.push({ id: "opex", col: 3, name: keep(g) ? "Operating expenses" : "Costs and expenses", value: opexTotal, role: { kind: "cost" }, sub: [`${((opexTotal / r) * 100).toFixed(1)}% of revenue`] });
      if (viaGrossCost > r * MIN_NODE_SHARE) links.push({ from: "gross", to: "opex", value: viaGrossCost, role: { kind: "cost" } });
      if (keep(f.directCosts)) links.push({ from: "rev", to: "opex", value: f.directCosts, role: { kind: "cost" } });
    }
    const net = f.netIncome;
    if (isNum(net) && net > 0) {
      nodes.push({ id: "net", col: 4, name: "Net income", value: net, role: { kind: "profit" }, sub: [margin(net), pts((net / r) * 100, f.before?.netMarginPct)].filter((x): x is string => !!x) });
      links.push({ from: "op", to: "net", value: Math.min(net, op - (f.taxExpense ?? 0) - (f.otherCosts ?? 0)), role: { kind: "profit" } });
      if (keep(f.otherIncome)) links.push({ from: "oi", to: "net", value: f.otherIncome, role: { kind: "profit" } });
    } else if (isNum(net)) words.push(`Net loss of ${money(-net)} after operating income of ${money(op)}.`);
    if (keep(f.taxExpense)) {
      nodes.push({ id: "tax", col: 4, name: "Tax", value: f.taxExpense, role: { kind: "cost" }, sub: [] });
      links.push({ from: "op", to: "tax", value: f.taxExpense, role: { kind: "cost" } });
    }
    if (keep(f.otherCosts)) {
      nodes.push({ id: "oc", col: 4, name: f.taxExpense === null ? "Tax, interest and other" : "Interest and other", value: f.otherCosts, role: { kind: "cost" }, sub: [] });
      links.push({ from: "op", to: "oc", value: f.otherCosts, role: { kind: "cost" } });
    }
    if (nodes.some((n) => n.id === "opex")) {
      f.opex.filter((p) => p.value > r * MIN_NODE_SHARE).forEach((p, i) => {
        nodes.push({ id: `x${i}`, col: 4, name: p.name, value: p.value, role: { kind: "cost" }, sub: [] });
        links.push({ from: "opex", to: `x${i}`, value: p.value, role: { kind: "cost" } });
      });
    }
  } else if (isNum(op)) {
    words.push(`Operating loss of ${money(-op)}${keep(g) ? `: the operating expenses were more than the gross profit of ${money(g)}` : ""}.`);
  } else if (!keep(g) && isNum(f.netIncome) && f.netIncome > 0 && f.netIncome < r) {
    // A filer with no operating income line (a broker, a bank): revenue to net income and the rest, nothing between.
    const net = f.netIncome;
    nodes.push({ id: "net", col: 2, name: "Net income", value: net, role: { kind: "profit" }, sub: [margin(net), pts((net / r) * 100, f.before?.netMarginPct)].filter((x): x is string => !!x) });
    links.push({ from: "rev", to: "net", value: net, role: { kind: "profit" } });
    if (keep(r - net)) {
      nodes.push({ id: "rest", col: 2, name: "Costs, tax and other", value: r - net, role: { kind: "cost" }, sub: [`${(((r - net) / r) * 100).toFixed(1)}% of revenue`] });
      links.push({ from: "rev", to: "rest", value: r - net, role: { kind: "cost" } });
    }
  }
  return { nodes, links, words };
}

const BAR = 10;
const LINE_FULL = 12;
/** The narrowest the full flow is laid out at; below it the flow is drawn compact (smaller names, wrapped, no margins or growth, which the table view carries). */
export const FLOW_MIN_WIDTH = 640;
/** The narrowest the compact flow is laid out at, a phone's card. */
export const FLOW_COMPACT_WIDTH = 300;
// The figures are set in a monospace face, every character 0.6 of the size.
const textWidth = (t: string, size: number, _bold = false) => t.length * size * 0.6;
/** A name in lines no wider than `max`, broken at spaces, never cut. */
function wrap(name: string, max: number, size = 11): string[] {
  if (textWidth(name, size, true) <= max) return [name];
  const out: string[] = [];
  let line = "";
  for (const w of name.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, size, true) > max) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/**
 * The flow laid out to a width (FLOW_MIN_WIDTH at least): each used column at
 * an even step, each node as tall as its value at one scale, the nodes of a
 * column spread over the height, each band leaving its node in the order of
 * its targets and arriving in the order of its sources, so no two cross at
 * a node. The sources' names sit left of them, the last column's right of
 * it, the others' above their node, a node moved down when its names would
 * meet the column before's.
 */
export function flowLayout(f: IncomeFlow, width = 760, money: (v: number) => string = (v) => flowMoney(v, f.currency)): FlowGeometry & { words: string[] } {
  const compact = width < FLOW_MIN_WIDTH;
  width = Math.max(compact ? FLOW_COMPACT_WIDTH : FLOW_MIN_WIDTH, width);
  const built = graph(f, money);
  const { links, words } = built;
  // Compact, each node carries its name and value alone; the margins and growth are the table view's.
  // Compact, the other income goes last in its column, so the band to the operating expenses crosses nothing on its way down.
  const nodes = compact ? [...built.nodes.filter((n) => n.id !== "oi"), ...built.nodes.filter((n) => n.id === "oi")].map((n) => ({ ...n, sub: [] })) : built.nodes;
  const NAME = compact ? 10 : 11;
  const VALUE = 10;
  const LINE = compact ? 11 : LINE_FULL;
  const cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b);
  const hasLeft = cols[0] === 0;
  const lastCol = cols[cols.length - 1];
  const valueText = (n: N) => (n.role.kind === "cost" ? `(${money(n.value)})` : money(n.value));
  const sideMax = width * (compact ? 0.22 : 0.24);
  const isSide = (n: N) => n.col === 0 || n.col === lastCol;
  const names = new Map(nodes.filter(isSide).map((n) => [n.id, wrap(n.name, sideMax - 10, NAME)]));
  const sideWide = (n: N) => Math.max(...names.get(n.id)!.map((t) => textWidth(t, NAME, true)), textWidth(valueText(n), VALUE), ...n.sub.map((x) => textWidth(x, 9)));
  // A side as wide as its widest label, at most `sideMax`, unless one word alone is wider: a word is never cut.
  const padOf = (list: N[]) => {
    const word = Math.max(0, ...list.flatMap((n) => names.get(n.id)!.map((t) => textWidth(t, NAME, true))));
    return Math.min(Math.max(sideMax, word), Math.max(0, ...list.map(sideWide))) + (compact ? 6 : 10);
  };
  const leftPad = hasLeft ? padOf(nodes.filter((n) => n.col === 0)) : compact ? 44 : 70;
  const rightPad = padOf(nodes.filter((n) => n.col === lastCol));
  const step = cols.length > 1 ? (width - leftPad - rightPad - BAR) / (cols.length - 1) : 0;
  // The names between, wrapped to a column's step when compact, else on one line.
  for (const n of nodes) if (!isSide(n)) names.set(n.id, compact ? wrap(n.name, Math.max(48, step + 8), NAME) : [n.name]);
  const wide = (n: N) => Math.max(...names.get(n.id)!.map((t) => textWidth(t, NAME, true)), textWidth(valueText(n), VALUE), ...n.sub.map((x) => textWidth(x, 9)));
  const xOf = (col: number) => leftPad + cols.indexOf(col) * step;
  const inner = 300;
  const top = 14 + LINE * 4;
  const scale = (inner * 0.5) / f.revenue;
  const placed = new Map<string, FlowNode>();
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let height = top + inner;
  for (const col of cols) {
    const list = nodes.filter((n) => n.col === col);
    const hs = list.map((n) => Math.max(2, n.value * scale));
    const total = hs.reduce((a, h) => a + h, 0);
    const side: FlowNode["side"] = col === 0 ? "left" : col === lastCol && cols.length > 1 ? "right" : "above";
    const gap = list.length > 1 ? Math.max(side === "above" ? LINE * 4 + 8 : 10, Math.min(90, (inner - total) / (list.length - 1))) : 0;
    let y = list.length === 1 ? top + Math.max(0, (inner - total) / 2) : top;
    let lastCentre = -Infinity;
    let minTop = -Infinity;
    list.forEach((n, i) => {
      let at: FlowNode["side"] = side;
      if (side === "above") {
        // The names above the node, else below it when the column before's are in the way; the node moves down only when neither is clear.
        const lh = (names.get(n.id)!.length + 1 + n.sub.length) * LINE + 4;
        const half = wide(n) / 2;
        const cx = xOf(col) + BAR / 2;
        const hit = (y0: number, y1: number) => boxes.some((b) => b.x0 < cx + half && cx - half < b.x1 && b.y0 < y1 && y0 < b.y1);
        if (y - lh < minTop) y = minTop + lh;
        for (let tries = 0; tries < 40; tries++) {
          if (!hit(y - lh, y)) break;
          if (!hit(y + hs[i], y + hs[i] + lh)) {
            at = "below";
            break;
          }
          y += 8;
        }
        boxes.push(at === "below" ? { x0: cx - half, x1: cx + half, y0: y, y1: y + hs[i] + lh } : { x0: cx - half, x1: cx + half, y0: y - lh, y1: y + hs[i] });
        minTop = at === "below" ? y + hs[i] + lh + 4 : y + hs[i] + 4;
      } else {
        const need = (names.get(n.id)!.length + 1 + (side === "left" ? n.sub.length : Math.min(1, n.sub.length))) * LINE + 4;
        const centre = y + hs[i] / 2;
        if (centre - lastCentre < need) y += need - (centre - lastCentre);
        lastCentre = y + hs[i] / 2;
      }
      placed.set(n.id, { id: n.id, x: xOf(col), y, w: BAR, h: hs[i], role: n.role, name: n.name, value: n.value, sub: n.sub, side: at });
      y += hs[i] + gap;
    });
    height = Math.max(height, y - gap + LINE * 3, minTop + LINE);
  }
  const order = (id: string) => placed.get(id)!.y;
  const live = links.filter((l) => placed.has(l.from) && placed.has(l.to));
  const outs = [...live].sort((a, b) => order(a.to) - order(b.to));
  const ins = [...live].sort((a, b) => order(a.from) - order(b.from));
  const outY = new Map<L, number>();
  const inY = new Map<L, number>();
  const at = new Map<string, number>();
  for (const l of outs) {
    const y0 = at.get(`o${l.from}`) ?? placed.get(l.from)!.y;
    outY.set(l, y0);
    at.set(`o${l.from}`, y0 + Math.max(1, l.value * scale));
  }
  for (const l of ins) {
    const y1 = at.get(`i${l.to}`) ?? placed.get(l.to)!.y;
    inY.set(l, y1);
    at.set(`i${l.to}`, y1 + Math.max(1, l.value * scale));
  }
  const q = (v: number) => Math.round(v * 10) / 10;
  const bands: FlowBand[] = live.map((l) => {
    const a = placed.get(l.from)!;
    const b = placed.get(l.to)!;
    const w = Math.max(1, l.value * scale);
    const y0 = outY.get(l)!;
    const y1 = inY.get(l)!;
    const x0 = a.x + a.w;
    const x1 = b.x;
    const xm = (x0 + x1) / 2;
    return { d: `M${q(x0)} ${q(y0)}C${q(xm)} ${q(y0)} ${q(xm)} ${q(y1)} ${q(x1)} ${q(y1)}L${q(x1)} ${q(y1 + w)}C${q(xm)} ${q(y1 + w)} ${q(xm)} ${q(y0 + w)} ${q(x0)} ${q(y0 + w)}Z`, role: l.role, title: `${a.name} to ${b.name}: ${money(l.value)}` };
  });
  const texts: FlowText[] = [];
  for (const n of placed.values()) {
    const tone: FlowText["tone"] = n.role.kind === "cost" ? "cost" : n.role.kind === "profit" ? "profit" : "value";
    const val = n.role.kind === "cost" ? `(${money(n.value)})` : money(n.value);
    if (n.side === "above" || n.side === "below") {
      const cx = n.x + n.w / 2;
      const nm = names.get(n.id) ?? [n.name];
      const lines = [...nm, val, ...n.sub];
      const first = n.side === "above" ? n.y - 6 - (lines.length - 1) * LINE : n.y + n.h + 6 + LINE - 2;
      lines.forEach((t, i) => texts.push({ x: q(cx), y: q(first + i * LINE), text: t, anchor: "middle", tone: i < nm.length ? "name" : i === nm.length ? tone : "sub", size: i < nm.length ? NAME : i === nm.length ? (compact ? VALUE : 11) : 9, bold: i <= nm.length }));
    } else {
      const left = n.side === "left";
      const x = q(left ? n.x - 6 : n.x + n.w + 6);
      const nm = names.get(n.id) ?? [n.name];
      const lines = [...nm, val, ...(left ? n.sub : n.sub.slice(0, 1))];
      const y0 = n.y + n.h / 2 - ((lines.length - 1) * LINE) / 2 + 4;
      lines.forEach((t, i) => texts.push({ x, y: q(y0 + i * LINE), text: t, anchor: left ? "end" : "start", tone: i < nm.length ? "name" : i === nm.length ? tone : "sub", size: i < nm.length ? NAME : i === nm.length ? VALUE : 9, bold: i <= nm.length }));
    }
  }
  return { width, height: Math.ceil(height), nodes: [...placed.values()], bands, texts, words };
}

/** The flow's own figures in a sentence each, for a table view, a screen reader and the email's words. */
export function flowLines(f: IncomeFlow, money: (v: number) => string = (v) => flowMoney(v, f.currency)): { label: string; value: string; detail: string | null }[] {
  const r = f.revenue;
  const m = (v: number) => `${((v / r) * 100).toFixed(1)}% of revenue`;
  const out: { label: string; value: string; detail: string | null }[] = [];
  for (const s of f.sources) out.push({ label: s.name, value: money(s.value), detail: [m(s.value), yoy(s.growthPct)].filter(Boolean).join(", ") });
  out.push({ label: "Revenue", value: money(r), detail: yoy(f.revenueGrowthPct) });
  if (isNum(f.costOfRevenue)) out.push({ label: "Cost of revenue", value: money(f.costOfRevenue), detail: m(f.costOfRevenue) });
  if (isNum(f.grossProfit)) out.push({ label: "Gross profit", value: money(f.grossProfit), detail: [m(f.grossProfit).replace("of revenue", "margin"), pts((f.grossProfit / r) * 100, f.before?.grossMarginPct)].filter(Boolean).join(", ") });
  for (const p of f.opex) out.push({ label: p.name, value: money(p.value), detail: [m(p.value), yoy(p.growthPct ?? null)].filter(Boolean).join(", ") });
  if (isNum(f.operatingIncome)) out.push({ label: "Operating income", value: money(f.operatingIncome), detail: [m(f.operatingIncome).replace("of revenue", "margin"), pts((f.operatingIncome / r) * 100, f.before?.operatingMarginPct)].filter(Boolean).join(", ") });
  if (isNum(f.taxExpense)) out.push({ label: "Tax", value: money(f.taxExpense), detail: null });
  if (isNum(f.otherCosts)) out.push({ label: f.taxExpense === null ? "Tax, interest and other" : "Interest and other", value: money(f.otherCosts), detail: null });
  if (isNum(f.otherIncome)) out.push({ label: "Other income", value: money(f.otherIncome), detail: null });
  if (isNum(f.netIncome)) out.push({ label: "Net income", value: money(f.netIncome), detail: [m(f.netIncome).replace("of revenue", "margin"), pts((f.netIncome / r) * 100, f.before?.netMarginPct)].filter(Boolean).join(", ") });
  return out;
}

/** The colours a surface draws the flow in: the sources by slot, profit and cost by role, the words by tone. */
export type FlowPalette = { sources: readonly string[]; revenue: string; profit: string; cost: string; surface: string; text: { name: string; value: string; sub: string; profit: string; cost: string } };

/** The fill of a node or band by its role. */
export const flowFill = (role: FlowRole, p: FlowPalette) => (role.kind === "source" ? p.sources[role.slot % p.sources.length] : role.kind === "revenue" ? p.revenue : role.kind === "profit" ? p.profit : p.cost);

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The flow as one SVG, for the report's page and anything else that takes a
 * string: each band with its title for a tooltip, every word ringed in the
 * surface's colour so a band behind it never makes it hard to read.
 */
export function flowSvg(f: IncomeFlow, width: number, p: FlowPalette, label: string, font = "inherit"): string {
  const g = flowLayout(f, width);
  const bands = g.bands.map((b) => `<path d="${b.d}" fill="${flowFill(b.role, p)}" fill-opacity="0.38"><title>${escXml(b.title)}</title></path>`).join("");
  const nodes = g.nodes.map((n) => `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="2" fill="${flowFill(n.role, p)}"><title>${escXml(`${n.name}: ${flowMoney(n.value, f.currency)}`)}</title></rect>`).join("");
  const texts = g.texts.map((t) => `<text x="${t.x}" y="${t.y}" text-anchor="${t.anchor}" font-size="${t.size}"${t.bold ? ' font-weight="600"' : ""} fill="${p.text[t.tone]}" stroke="${p.surface}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${escXml(t.text)}</text>`).join("");
  return `<svg viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${escXml(label)}" font-family="${escXml(font)}">${bands}${nodes}${texts}</svg>`;
}
