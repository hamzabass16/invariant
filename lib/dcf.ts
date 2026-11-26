import { z } from "zod";

/**
 * The DCF calculator on the Theses screen, in the shape of HCMP's own
 * models (ASML_DCF_model_2026-10-15.py and the others under theses/models):
 * a revenue path for each of three cases, a margin moving in a straight
 * line from today's to the case's end margin over three years, the flow
 * discounted at the middle of each year, a terminal value on the last
 * flow, the balance sheet's cash, investments and debt, the diluted share
 * count, and the price in the listing's currency at the day's rate. Two
 * bases: free cash flow less stock-based compensation (dilution counted as
 * a cost, as HCMP does), or earnings (net income, where the compensation is
 * already expensed). A sensitivity grid of WACC against terminal growth on
 * the base case, and a reverse DCF: the growth, and the margin, the price
 * implies. Pure: the figures come in, the values come out; nothing is
 * fetched, kept or logged here. Not investment advice.
 *
 * Money is in millions of the model's currency; shares in millions; the
 * per-share value therefore in units of that currency, converted to the
 * listing's at `fx` (listing units per one model unit, 1 when the same).
 */

export const DCF_BASES = ["cash_flow", "earnings"] as const;
export type DcfBasis = (typeof DCF_BASES)[number];
export const DCF_BASIS_LABEL: Record<DcfBasis, string> = { cash_flow: "Free cash flow", earnings: "Earnings" };
export const DCF_BASIS_ABOUT: Record<DcfBasis, string> = {
  cash_flow: "The flow is revenue times the free cash flow margin, less stock-based compensation as a share of revenue, so dilution counts as a cost.",
  earnings: "The flow is revenue times the net margin: net income, where stock-based compensation is already expensed.",
};
export const DCF_CASES = ["bear", "base", "bull"] as const;
export type DcfCaseName = (typeof DCF_CASES)[number];
export const DCF_CASE_LABEL: Record<DcfCaseName, string> = { bear: "Bear", base: "Base", bull: "Bull" };
/** The sensitivity grid, as HCMP's decks draw it. */
export const DCF_WACCS = [8, 9, 10, 11] as const;
export const DCF_TERMINALS = [2.5, 3, 3.5] as const;
export const DCF_MIN_YEARS = 5;
export const DCF_MAX_YEARS = 10;
/** The margin reaches the case's end margin by this year. */
export const DCF_RAMP_YEARS = 3;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pct = z.number().min(-100).max(300);

export const dcfCaseSchema = z.object({
  /** Revenue growth for each forecast year, in percent. */
  growthPct: z.array(pct).min(DCF_MIN_YEARS).max(DCF_MAX_YEARS),
  /** The margin the flow settles at, in percent of revenue. */
  marginEndPct: z.number().min(-50).max(100),
});
export type DcfCase = z.infer<typeof dcfCaseSchema>;

export const dcfInputsSchema = z
  .object({
    basis: z.enum(DCF_BASES),
    /** The model's currency: the filings' reporting currency. */
    currency: z.string().min(3).max(8),
    /** Revenue of the starting year, in millions: the trailing twelve months, or the current year's guide midpoint. */
    revenue: z.number().positive(),
    revenueLabel: z.string().max(60).nullable().default(null),
    /** Today's margin of the flow, in percent of revenue. */
    marginNowPct: z.number().min(-50).max(100),
    /** Stock-based compensation as a share of revenue, in percent; taken off the flow on the cash flow basis only. */
    sbcPct: z.number().min(0).max(50).default(0),
    waccPct: z.number().min(3).max(25),
    terminalGrowthPct: z.number().min(0).max(6),
    /** The balance sheet at the latest date, in millions. */
    cash: z.number().min(0).default(0),
    investments: z.number().min(0).default(0),
    debt: z.number().min(0).default(0),
    balanceLabel: z.string().max(60).nullable().default(null),
    /** Diluted shares, in millions. */
    shares: z.number().positive(),
    /** The price in the listing's currency, and that currency. */
    price: z.number().positive().nullable(),
    priceCurrency: z.string().max(8).nullable().default(null),
    /** Listing-currency units per one model-currency unit (USD per EUR); 1 when they are the same. */
    fx: z.number().positive().default(1),
    cases: z.object({ bear: dcfCaseSchema, base: dcfCaseSchema, bull: dcfCaseSchema }),
    asOf: isoDay,
    /** Sources and what changed from the last run, as the header of HCMP's models. */
    note: z.string().max(600).nullable().default(null),
  })
  .refine((i) => i.terminalGrowthPct < i.waccPct, { message: "Terminal growth must be below the discount rate.", path: ["terminalGrowthPct"] })
  .refine((i) => DCF_CASES.every((c) => i.cases[c].growthPct.length === i.cases.base.growthPct.length), { message: "Every case runs the same number of years.", path: ["cases"] });
export type DcfInputs = z.infer<typeof dcfInputsSchema>;

export type DcfRow = { year: number; revenue: number; marginPct: number; flow: number };
export type DcfCaseResult = {
  name: DcfCaseName;
  rows: DcfRow[];
  pvFlows: number;
  pvTerminal: number;
  /** The terminal value's share of the enterprise value, in percent. */
  terminalSharePct: number;
  equity: number;
  /** Per share in the model's currency, and in the listing's. */
  perShareModel: number;
  perShare: number;
  /** The value against the price, in percent; null without a price. */
  vsPricePct: number | null;
};
export type DcfImplied = {
  /** The base growth path scaled to meet the price: the scale, the first year's growth and the revenue CAGR it means. */
  growthScale: number;
  firstYearGrowthPct: number;
  cagrPct: number;
  /** The end margin that meets the price on the base growth path. */
  marginPct: number | null;
};
export type DcfResult = {
  basis: DcfBasis;
  cases: Record<DcfCaseName, DcfCaseResult>;
  /** The base case over the grid: rows by WACC, columns by terminal growth, in the listing's currency. */
  sensitivity: { waccs: readonly number[]; terminals: readonly number[]; values: number[][] };
  implied: DcfImplied | null;
  price: number | null;
  priceCurrency: string | null;
  currency: string;
  asOf: string;
  /** The model's assumptions in four short lines, as the deck's DCF slide prints them. */
  assumptions: string[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** One case at one discount rate and terminal growth, in the listing's currency per share. */
function valueCase(i: DcfInputs, c: DcfCase, waccPct: number, tgPct: number, name: DcfCaseName): DcfCaseResult {
  const w = waccPct / 100;
  const g = tgPct / 100;
  const startYear = Number(i.asOf.slice(0, 4));
  let rev = i.revenue;
  let pv = 0;
  const rows: DcfRow[] = [];
  const n = c.growthPct.length;
  for (let k = 0; k < n; k++) {
    rev *= 1 + c.growthPct[k] / 100;
    const m = i.marginNowPct + (c.marginEndPct - i.marginNowPct) * Math.min(1, (k + 1) / DCF_RAMP_YEARS);
    const flow = (rev * (m - (i.basis === "cash_flow" ? i.sbcPct : 0))) / 100;
    // Each year's flow arrives through the year: discounted from its middle.
    pv += flow / (1 + w) ** (k + 0.5);
    rows.push({ year: startYear + k + 1, revenue: rev, marginPct: m, flow });
  }
  const last = rows[n - 1].flow;
  const tv = (last * (1 + g)) / (w - g);
  const pvTv = tv / (1 + w) ** (n - 0.5);
  const ev = pv + pvTv;
  const equity = ev + i.cash + i.investments - i.debt;
  const perShareModel = equity / i.shares;
  const perShare = perShareModel * i.fx;
  return { name, rows, pvFlows: pv, pvTerminal: pvTv, terminalSharePct: ev > 0 ? (pvTv / ev) * 100 : 0, equity, perShareModel, perShare, vsPricePct: i.price ? (perShare / i.price - 1) * 100 : null };
}

/** The growth scale, or the end margin, on the base path that meets the price; bisection, null when no value in range meets it. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number | null {
  const fl = f(lo) - target;
  const fh = f(hi) - target;
  if (!Number.isFinite(fl) || !Number.isFinite(fh) || fl * fh > 0) return null;
  let a = lo;
  let b = hi;
  for (let k = 0; k < 80; k++) {
    const mid = (a + b) / 2;
    const fm = f(mid) - target;
    if ((fm < 0) === (fl < 0)) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

export function runDcf(i: DcfInputs): DcfResult {
  const cases = Object.fromEntries(DCF_CASES.map((c) => [c, valueCase(i, i.cases[c], i.waccPct, i.terminalGrowthPct, c)])) as Record<DcfCaseName, DcfCaseResult>;
  const values = DCF_WACCS.map((w) => DCF_TERMINALS.map((t) => valueCase(i, i.cases.base, w, t, "base").perShare));
  let implied: DcfImplied | null = null;
  if (i.price) {
    const scale = solve((k) => valueCase(i, { ...i.cases.base, growthPct: i.cases.base.growthPct.map((g) => g * k) }, i.waccPct, i.terminalGrowthPct, "base").perShare, i.price, -1, 6);
    const margin = solve((m) => valueCase(i, { ...i.cases.base, marginEndPct: m }, i.waccPct, i.terminalGrowthPct, "base").perShare, i.price, -50, 100);
    if (scale !== null) {
      const n = i.cases.base.growthPct.length;
      let rev = i.revenue;
      for (const g of i.cases.base.growthPct) rev *= 1 + (g * scale) / 100;
      implied = { growthScale: scale, firstYearGrowthPct: i.cases.base.growthPct[0] * scale, cagrPct: ((rev / i.revenue) ** (1 / n) - 1) * 100, marginPct: margin };
    } else if (margin !== null) implied = { growthScale: NaN, firstYearGrowthPct: NaN, cagrPct: NaN, marginPct: margin };
  }
  const n = i.cases.base.growthPct.length;
  const assumptions = [
    `${i.revenueLabel ?? "Starting revenue"} ${i.currency} ${Math.round(i.revenue).toLocaleString("en-US")}m; base growth ${i.cases.base.growthPct[0].toFixed(0)}% fading to ${i.cases.base.growthPct[n - 1].toFixed(0)}% over ${n} years.`,
    `${DCF_BASIS_LABEL[i.basis]} margin ${r1(i.marginNowPct)}% now, settling at ${r1(i.cases.base.marginEndPct)}% (bear ${r1(i.cases.bear.marginEndPct)}%, bull ${r1(i.cases.bull.marginEndPct)}%)${i.basis === "cash_flow" ? `; SBC ${r1(i.sbcPct)}% of revenue taken off` : ""}.`,
    `WACC ${r1(i.waccPct)}%, terminal growth ${r1(i.terminalGrowthPct)}%; flows discounted from mid-year; terminal value ${Math.round(cases.base.terminalSharePct)}% of the base enterprise value.`,
    `Cash ${Math.round(i.cash).toLocaleString("en-US")}m${i.investments ? `, investments ${Math.round(i.investments).toLocaleString("en-US")}m` : ""}, debt ${Math.round(i.debt).toLocaleString("en-US")}m${i.balanceLabel ? ` (${i.balanceLabel})` : ""}; ${i.shares.toLocaleString("en-US", { maximumFractionDigits: 1 })}m diluted shares${i.fx !== 1 ? `; ${i.fx} ${i.priceCurrency ?? ""} per ${i.currency}` : ""}.`,
  ];
  return { basis: i.basis, cases, sensitivity: { waccs: DCF_WACCS, terminals: DCF_TERMINALS, values }, implied, price: i.price, priceCurrency: i.priceCurrency, currency: i.currency, asOf: i.asOf, assumptions };
}

/** What a kept report carries of the DCF, so the deck draws the slide from the report alone. */
export const dcfSummarySchema = z.object({
  basis: z.enum(DCF_BASES),
  asOf: isoDay,
  currency: z.string().max(8),
  priceCurrency: z.string().max(8).nullable(),
  price: z.number().nullable(),
  perShare: z.object({ bear: z.number(), base: z.number(), bull: z.number() }),
  vsPricePct: z.object({ bear: z.number().nullable(), base: z.number().nullable(), bull: z.number().nullable() }),
  sensitivity: z.object({ waccs: z.array(z.number()).max(6), terminals: z.array(z.number()).max(6), values: z.array(z.array(z.number()).max(6)).max(6) }),
  assumptions: z.array(z.string().max(300)).max(4),
  implied: z.object({ firstYearGrowthPct: z.number().nullable(), cagrPct: z.number().nullable(), marginPct: z.number().nullable() }).nullable(),
  terminalSharePct: z.number(),
});
export type DcfSummary = z.infer<typeof dcfSummarySchema>;

export function dcfSummary(r: DcfResult): DcfSummary {
  const fin = (v: number) => (Number.isFinite(v) ? v : null);
  return {
    basis: r.basis,
    asOf: r.asOf,
    currency: r.currency,
    priceCurrency: r.priceCurrency,
    price: r.price,
    perShare: { bear: r.cases.bear.perShare, base: r.cases.base.perShare, bull: r.cases.bull.perShare },
    vsPricePct: { bear: r.cases.bear.vsPricePct, base: r.cases.base.vsPricePct, bull: r.cases.bull.vsPricePct },
    sensitivity: { waccs: [...r.sensitivity.waccs], terminals: [...r.sensitivity.terminals], values: r.sensitivity.values.map((row) => row.map((v) => Math.round(v * 100) / 100)) },
    assumptions: r.assumptions.map((a) => a.slice(0, 300)),
    implied: r.implied ? { firstYearGrowthPct: fin(r.implied.firstYearGrowthPct), cagrPct: fin(r.implied.cagrPct), marginPct: r.implied.marginPct } : null,
    terminalSharePct: r.cases.base.terminalSharePct,
  };
}

/** A straight fade from the first year's growth to the last's over n years. */
export function fade(fromPct: number, toPct: number, years: number): number[] {
  return Array.from({ length: years }, (_, k) => Math.round((fromPct + ((toPct - fromPct) * k) / Math.max(1, years - 1)) * 10) / 10);
}

export type DcfSeed = {
  /** Trailing figures in whole units of the reporting currency, from the filings: revenue, the flow (free cash flow or net income), stock-based compensation, diluted shares. */
  revenue: number | null;
  fcf: number | null;
  netIncome: number | null;
  sbc: number | null;
  dilutedShares: number | null;
  /** Revenue growth on the trailing twelve months, in percent. */
  revenueGrowthPct: number | null;
  /** The latest balance sheet, whole units. */
  cash: number | null;
  investments: number | null;
  debt: number | null;
  balanceLabel: string | null;
  periodLabel: string | null;
  currency: string | null;
};

/**
 * The inputs the filings suggest, before the person changes any: the
 * trailing revenue and margin, growth fading from the trailing rate to 4%
 * over nine years (bear at half, bull at one and a half), the end margin at
 * today's (bear five points below, bull five above), WACC 9% and terminal
 * growth 3% as HCMP's models use, the balance sheet, the shares and the
 * price. Null when the filings give no revenue, no flow or no share count;
 * the calculator then starts empty and says what it needs.
 */
export function dcfDefaults(basis: DcfBasis, s: DcfSeed, price: number | null, priceCurrency: string | null, asOf: string, fx: number | null = null): DcfInputs | null {
  const flow = basis === "cash_flow" ? s.fcf : s.netIncome;
  if (!s.revenue || s.revenue <= 0 || flow === null || !s.dilutedShares || s.dilutedShares <= 0 || !s.currency) return null;
  const m = (flow / s.revenue) * 100;
  const g0 = Math.max(-20, Math.min(60, s.revenueGrowthPct ?? 8));
  const years = 9;
  const same = !priceCurrency || priceCurrency === s.currency;
  // A price in another currency is laid on the model at the day's rate when one is given (listing units per model unit), else left for the person.
  const rate = same ? 1 : fx && fx > 0 ? fx : null;
  const draft = {
    basis,
    currency: s.currency,
    revenue: s.revenue / 1e6,
    revenueLabel: s.periodLabel ? `Revenue, ${s.periodLabel}` : "Revenue, trailing twelve months",
    marginNowPct: r1(m),
    sbcPct: basis === "cash_flow" && s.sbc !== null && s.sbc > 0 ? r1((s.sbc / s.revenue) * 100) : 0,
    waccPct: 9,
    terminalGrowthPct: 3,
    cash: Math.max(0, (s.cash ?? 0) / 1e6),
    investments: Math.max(0, (s.investments ?? 0) / 1e6),
    debt: Math.max(0, (s.debt ?? 0) / 1e6),
    balanceLabel: s.balanceLabel,
    shares: s.dilutedShares / 1e6,
    price: rate ? price : null,
    priceCurrency: same ? s.currency : priceCurrency,
    fx: rate ?? 1,
    cases: {
      bear: { growthPct: fade(g0 / 2, 3, years), marginEndPct: r1(m - 5) },
      base: { growthPct: fade(g0, 4, years), marginEndPct: r1(m) },
      bull: { growthPct: fade(g0 * 1.5, 5, years), marginEndPct: r1(m + 5) },
    },
    asOf,
    note: null,
  };
  const parsed = dcfInputsSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

/** The record's own valuation from a DCF: bear as the low case, base, bull as the high, with the basis in a few words. */
export function valuationFromDcf(r: DcfResult): { low: number; base: number; high: number; basis: string; asOf: string } {
  const round = (v: number) => Math.round(v * 100) / 100;
  return { low: round(Math.min(r.cases.bear.perShare, r.cases.base.perShare)), base: round(r.cases.base.perShare), high: round(Math.max(r.cases.bull.perShare, r.cases.base.perShare)), basis: `DCF on ${DCF_BASIS_LABEL[r.basis].toLowerCase()}, ${r.asOf}`.slice(0, 80), asOf: r.asOf };
}
