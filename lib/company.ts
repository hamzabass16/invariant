import type { EarningsEntry, EarningsFile, EarningsReport, SeriesTable } from "@/lib/earnings";
import { separateHistory, type SegmentHistory } from "@/lib/edgar-segments";
import { EXTRA_INFO, metricInfo } from "@/lib/metric-info";
import { FIELDS, type FieldId } from "@/lib/ontology";
import { daysBetween } from "@/lib/time";
import type { PerShareRow } from "@/lib/valuation-history";

/**
 * A company's page (Hamza, 20 Oct 2026, after Qualtrim's Insights): one page
 * per holding or watchlist company, opened from its ticker anywhere in the
 * app. Its brief is the company now, in parts: the week's headlines and
 * filings, the next results and, for BRIEF_DAYS after the results, the report
 * after them with how the stock took them (Hamza, 20 Oct 2026: one part of the
 * brief, never the whole); its figures are the ones the app already
 * keeps (the filings read, the report's quarters and years, the closes),
 * nothing estimated and no analyst's forecast. The thesis stays the person's
 * own, on Theses. Pure.
 */

/** Days after the results their report is a part of the brief. */
export const BRIEF_DAYS = 10;

export const companyHref = (symbol: string) => `/company/${encodeURIComponent(symbol.toUpperCase())}`;

/**
 * Whether the company files as a foreign private issuer (20-F, 40-F, 6-K, or
 * its figures in another currency than the dollar), whose insiders the SEC
 * does not ask for Form 4s: the insiders card says so rather than waiting.
 */
export function foreignFiler(filing: { perShareCurrency?: string | null; revenueGeography?: { form: string } | null } | null, report: Pick<EarningsReport, "release" | "filing"> | null): boolean {
  const forms = [filing?.revenueGeography?.form, report?.release?.form, report?.filing?.form].filter((f): f is string => !!f);
  if (forms.some((f) => /^(20-F|40-F|6-K)/.test(f))) return true;
  return !!filing?.perShareCurrency && filing.perShareCurrency !== "USD";
}

/** The company's latest report after the results, kept. */
export function latestReportOf(file: EarningsFile | null, symbol: string): EarningsReport | null {
  const s = symbol.toUpperCase();
  return (file?.reports ?? []).filter((r) => r.symbol.toUpperCase() === s).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/** The report the brief carries: the latest, within BRIEF_DAYS of its results. */
export function briefReport(r: EarningsReport | null, today: string): EarningsReport | null {
  return r && r.date <= today && daysBetween(r.date, today) <= BRIEF_DAYS ? r : null;
}

/** The company's next report date on the calendar, today included. */
export function nextReport(entries: readonly EarningsEntry[], symbol: string, today: string): EarningsEntry | null {
  const s = symbol.toUpperCase();
  return entries.filter((e) => e.symbol.toUpperCase() === s && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** The last close and its move on the close before. */
export function lastMove(closes: readonly { date: string; value: number }[]): { date: string; price: number; pct: number | null } | null {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last) return null;
  const prev = sorted.at(-2);
  return { date: last.date, price: last.value, pct: prev && prev.value > 0 ? Math.round((last.value / prev.value - 1) * 10000) / 100 : null };
}

/** A group of figures, each with how it is calculated (lib/metric-info.ts). */
export type StatGroup = { title: string; rows: { label: string; value: string; info: string | null }[] };

const GROUPS: { title: string; fields: FieldId[] }[] = [
  { title: "Valuation", fields: ["pe_ratio", "forward_pe", "consensus_forward_pe", "ps_ratio", "forward_ps", "pfcf_ratio", "forward_pfcf", "implied_growth_pct", "dividend_yield_pct"] },
  { title: "Cash flow", fields: ["fcf_margin_pct", "fcf_conversion", "fcf_per_share_growth_pct", "capital_returned_pct"] },
  { title: "Margins and growth", fields: ["gross_margin_pct", "operating_margin_pct", "revenue_growth_pct", "eps_growth_pct", "roic_pct"] },
  { title: "Balance", fields: ["net_debt", "net_debt_to_ebitda", "cash_to_debt_pct", "interest_cover"] },
];

/** A money figure in whole units of its currency, shortened: $143.3B. */
export function compactMoney(v: number, ccy: string | null): string {
  const c = ccy && /^[A-Z]{3}$/.test(ccy) ? ccy : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: c, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
}

/** A field's figure in its own unit: money shortened in the filings' currency, never a bare 23458000000. */
export function fieldText(f: FieldId, v: number, ccy: string | null): string {
  const t = FIELDS[f].type;
  if (t === "days") return `${v.toFixed(0)} days`;
  if (t === "pct") return `${v.toFixed(1)}%`;
  if (t === "ratio") return `${v.toFixed(2)}x`;
  if (t === "money") return compactMoney(v, ccy);
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/**
 * The key figures in four groups, from the filings' fields: a figure the
 * filings did not give is left out of its group, never shown as a zero; a
 * group with none says so. The valuation group adds today's multiples on the
 * trailing per-share figures, where there are any.
 */
export function statGroups(values: Readonly<Record<string, number | null | undefined>>, ccy: string | null, price: number | null, perShare: PerShareRow | null): StatGroup[] {
  return GROUPS.map((g) => {
    const rows = g.fields.flatMap((f) => {
      const v = values[f];
      return v === null || v === undefined || !Number.isFinite(v) ? [] : [{ label: FIELDS[f].label, value: fieldText(f, v, ccy), info: metricInfo(f) }];
    });
    if (g.title === "Valuation" && price !== null && perShare) {
      // A multiple the filings' fields already carry is not drawn twice.
      const m = (label: string, x: number | null, info: string | null) => (x !== null && x > 0 && !rows.some((r) => r.label === label) ? [{ label, value: `${(price / x).toFixed(1)}x`, info }] : []);
      rows.push(...m("Price to sales", perShare.revenue, metricInfo("ps_ratio")), ...m("Price to gross profit", perShare.grossProfit, EXTRA_INFO.price_to_gross_profit), ...m("Price to free cash flow", perShare.fcf, metricInfo("pfcf_ratio")));
    }
    return { title: g.title, rows };
  });
}

export type ChartFormat = "money" | "perShare" | "pct" | "shares";
export type ChartSpec = { key: string; title: string; labels: string[]; values: (number | null)[]; format: ChartFormat };
export const CHART_PERIODS = ["quarterly", "annual", "ttm"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
export const CHART_PERIOD_LABEL: Record<ChartPeriod, string> = { quarterly: "Quarterly", annual: "Annually", ttm: "Per share, TTM" };

/** The lines drawn, in order, with their titles: a line the table does not carry, or carries empty, is not drawn. */
const LINES: { key: string; title: string; format: ChartFormat }[] = [
  { key: "revenue", title: "Revenue", format: "money" },
  { key: "grossProfit", title: "Gross profit", format: "money" },
  { key: "operatingIncome", title: "Operating income", format: "money" },
  { key: "netIncome", title: "Net income", format: "money" },
  { key: "fcf", title: "Free cash flow", format: "money" },
  { key: "epsDiluted", title: "EPS, diluted", format: "perShare" },
  { key: "grossMarginPct", title: "Gross margin", format: "pct" },
  { key: "operatingMarginPct", title: "Operating margin", format: "pct" },
  { key: "fcfMarginPct", title: "Free cash flow margin", format: "pct" },
  { key: "sbc", title: "Stock-based compensation", format: "money" },
  { key: "dividendPerShare", title: "Dividend per share", format: "perShare" },
  { key: "dilutedShares", title: "Diluted shares", format: "shares" },
];

function fromTable(t: SeriesTable | null | undefined): ChartSpec[] {
  if (!t) return [];
  const cols = t.cols;
  return LINES.flatMap((l) => {
    const row = t.rows.find((r) => r.key === l.key);
    if (!row || row.values.every((v) => v === null)) return [];
    return [{ key: l.key, title: l.title, labels: cols, values: cols.map((_, i) => row.values[i] ?? null), format: l.format }];
  });
}

/**
 * A small chart's headline, as Qualtrim's financials grid reads (Hamza,
 * 21 Nov 2026): the latest figure with its column, and its change on the
 * same period a year before (four quarters back, or the year before): in
 * percent for an amount, in points for a margin. None where either is not
 * kept, or where a percent would be read across zero (a base at or below
 * zero, or a figure turned negative).
 */
export function chartHeadline(c: ChartSpec, period: ChartPeriod): { latest: number | null; label: string | null; change: number | null; unit: "pct" | "pts"; words: string } {
  let i = c.values.length - 1;
  while (i >= 0 && c.values[i] === null) i -= 1;
  const back = period === "annual" ? 1 : 4;
  const words = period === "annual" ? "on the year before" : "on a year before";
  const unit = c.format === "pct" ? ("pts" as const) : ("pct" as const);
  if (i < 0) return { latest: null, label: null, change: null, unit, words };
  const now = c.values[i]!;
  const then = i - back >= 0 ? c.values[i - back] : null;
  const change = then === null ? null : unit === "pts" ? Math.round((now - then) * 10) / 10 : then > 0 && now >= 0 ? Math.round(((now - then) / then) * 1000) / 10 : null;
  return { latest: now, label: c.labels[i] ?? null, change, unit, words };
}

/** "2026-06-30" as "Q2 26". */
const quarterLabel = (end: string) => `Q${Math.ceil(Number(end.slice(5, 7)) / 3)} ${end.slice(2, 4)}`;

/**
 * The charts for each period: the quarters and years of the report kept
 * after the results when it has them, else the filings' own, read every
 * morning for every holding and watchlist company and when any other
 * company's page opens (Hamza, 23 Oct 2026: never waiting for the next
 * results); and the trailing twelve months per share from the same read.
 */
export function companyCharts(report: EarningsReport | null, perShare: readonly PerShareRow[], filed?: { years?: SeriesTable | null; quarters?: SeriesTable | null } | null): Record<ChartPeriod, ChartSpec[]> {
  const rows = [...perShare].sort((a, b) => a.end.localeCompare(b.end));
  const labels = rows.map((r) => quarterLabel(r.end));
  const ttm: ChartSpec[] = (
    [
      ["revenue", "Sales per share"],
      ["grossProfit", "Gross profit per share"],
      ["eps", "EPS, trailing"],
      ["fcf", "Free cash flow per share"],
    ] as const
  ).flatMap(([k, title]) => (rows.some((r) => r[k] !== null) ? [{ key: `ttm-${k}`, title, labels, values: rows.map((r) => r[k]), format: "perShare" as const }] : []));
  const pick = (kept: SeriesTable | null | undefined, own: SeriesTable | null | undefined) => {
    const k = fromTable(kept);
    return k.length ? k : fromTable(own);
  };
  return { quarterly: pick(report?.detail?.quarters, filed?.quarters), annual: pick(report?.detail?.years, filed?.years), ttm };
}

// ---------------------------------------------------------------------------
// Revenue by segment over time (Hamza, 4 Nov 2026, after Qualtrim)

/** How many lines keep a hue of their own before the rest are one "Other" part, as on the segment donut. */
export const SEGMENT_HUES = 4;

export type SegmentChart = {
  labels: string[];
  /** One part per line, the largest of the latest period first (the base of each column); "Other" last when lines are folded. */
  parts: { label: string; values: (number | null)[]; other: boolean }[];
  /** Each part's growth on the same period a year before, in percent; null where that period is not kept. */
  growth: (number | null)[][];
  /** Labels of the columns whose figures are the year less its first three quarters. */
  derived: string[];
};

const yearLabel = (end: string) => `FY${end.slice(0, 4)}`;

/**
 * The stacked revenue chart of one family of lines (segments or products) over
 * its quarters or years: the lines of the latest period, the largest first,
 * the first SEGMENT_HUES with a part each and the rest one "Other" part (all
 * of them when only one would be folded), each part's growth on the period a
 * year before. Null with fewer than two periods.
 */
export function segmentChart(periods: readonly { end: string; lines: readonly { name: string; value: number }[]; derived?: boolean }[], kind: "quarterly" | "annual"): SegmentChart | null {
  if (periods.length < 2) return null;
  const latest = periods.at(-1)!;
  const order = [...latest.lines].sort((a, b) => b.value - a.value).map((l) => l.name);
  // A line that is not in the latest period still has its history; it joins Other.
  const all = [...new Set([...order, ...periods.flatMap((p) => p.lines.map((l) => l.name))])];
  const head = all.length > SEGMENT_HUES + 1 ? order.slice(0, SEGMENT_HUES) : all;
  const rest = all.filter((n) => !head.includes(n));
  const valueOf = (p: (typeof periods)[number], names: readonly string[]) => {
    const got = p.lines.filter((l) => names.includes(l.name));
    return got.length ? got.reduce((a, l) => a + l.value, 0) : null;
  };
  const parts = [...head.map((n) => ({ label: n, names: [n], other: false })), ...(rest.length ? [{ label: "Other", names: rest, other: true }] : [])];
  const yearBefore = (end: string) => periods.findIndex((q) => Math.abs(daysBetween(q.end, end) - 365) <= 20);
  return {
    labels: periods.map((p) => (kind === "quarterly" ? quarterLabel(p.end) : yearLabel(p.end))),
    parts: parts.map((x) => ({ label: x.label, values: periods.map((p) => valueOf(p, x.names)), other: x.other })),
    growth: parts.map((x) =>
      periods.map((p) => {
        const j = yearBefore(p.end);
        if (j < 0) return null;
        const now = valueOf(p, x.names);
        const then = valueOf(periods[j], x.names);
        return now !== null && then !== null && then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : null;
      }),
    ),
    derived: periods.filter((p) => p.derived).map((p) => (kind === "quarterly" ? quarterLabel(p.end) : yearLabel(p.end))),
  };
}

