import { z } from "zod";

import { daysBetween } from "@/lib/time";

/**
 * The next twelve months, two ways (Hamza, 23 Oct 2026: "both"). From the
 * filings: a trailing per-share figure carried a year on at the company's
 * revenue growth on the twelve months before, held between FORWARD_GROWTH_MIN
 * and FORWARD_GROWTH_MAX. Revenue, not the figure's own growth (Hamza,
 * 23 Oct 2026, on AMZN): a one-off gain or a year near zero swings EPS and
 * free cash flow by multiples and would be carried forward again; revenue
 * moves with the business. The app's arithmetic on what was filed, with a
 * history, never a forecast. From the analysts: Nasdaq's published consensus EPS for the
 * current and next fiscal years, weighted by the months of each inside the
 * next twelve; their figure, labelled as theirs, read now only, never a
 * verdict. Pure: nothing fetched, kept or logged.
 */

export const FORWARD_GROWTH_MIN = -50;
export const FORWARD_GROWTH_MAX = 100;
/** A trailing figure a year before: a row ending this many days back, give or take. */
const YEAR_BEFORE = { min: 330, max: 400 };

const clamp = (g: number) => Math.min(FORWARD_GROWTH_MAX, Math.max(FORWARD_GROWTH_MIN, g));

/** A trailing figure carried twelve months on at its growth; none when either is unread or the figure is not positive. */
export function grownForward(trailing: number | null | undefined, growthPct: number | null | undefined): number | null {
  if (trailing === null || trailing === undefined || !Number.isFinite(trailing) || trailing <= 0) return null;
  if (growthPct === null || growthPct === undefined || !Number.isFinite(growthPct)) return null;
  return trailing * (1 + clamp(growthPct) / 100);
}

/** The growth of a positive figure on a positive one a year before, in percent; none otherwise. */
export function growthOn(now: number | null, before: number | null): number | null {
  return now === null || before === null || now <= 0 || before <= 0 ? null : (now / before - 1) * 100;
}

type Row = { end: string; revenue: number | null; grossProfit: number | null; eps: number | null; fcf: number | null };

/**
 * The per-share history carried forward: each row's figures grown at its
 * revenue growth on the row a year before, so the five-year chart of a
 * forward multiple reads, each week, the forward figure the filings then
 * known supported. A row with no row a year before, or no revenue growth,
 * has no forward figures.
 */
export function forwardRows<R extends Row>(rows: readonly R[]): R[] {
  const sorted = [...rows].sort((a, b) => a.end.localeCompare(b.end));
  return sorted.map((r) => {
    const before = sorted.find((p) => {
      const d = daysBetween(p.end, r.end);
      return d >= YEAR_BEFORE.min && d <= YEAR_BEFORE.max;
    });
    const g = before ? growthOn(r.revenue, before.revenue) : null;
    const f = (k: "revenue" | "grossProfit" | "eps" | "fcf") => grownForward(r[k], g);
    return { ...r, revenue: f("revenue"), grossProfit: f("grossProfit"), eps: f("eps"), fcf: f("fcf") };
  });
}

// ---------------------------------------------------------------------------
// The analysts' consensus

export const consensusYearSchema = z.object({
  /** The fiscal year's last month, YYYY-MM. */
  end: z.string().regex(/^\d{4}-\d{2}$/),
  eps: z.number(),
  estimates: z.number().int().nullable(),
  /** The lowest and highest analyst's EPS for the year, as Nasdaq prints them; absent on a read kept before 21 Nov 2026. */
  low: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
});
export type ConsensusYear = z.infer<typeof consensusYearSchema>;

export const consensusSchema = z.object({
  source: z.literal("Nasdaq"),
  readAt: z.string(),
  years: z.array(consensusYearSchema).max(6),
  /** The next twelve months' EPS from the years, per listed share in US dollars; null with `words` saying why. */
  ntmEps: z.number().nullable(),
  words: z.string().max(300),
});
export type Consensus = z.infer<typeof consensusSchema>;

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** A figure as Nasdaq prints it: a number, or a string like "$8.21", "(0.42)" or "--". */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-$");
  const n = Number(s.replace(/[()$,\s]/g, "").replace(/^-/, ""));
  return s === "" || /^-+$/.test(s) || !Number.isFinite(n) ? null : neg || s.startsWith("-") ? -n : n;
}

/** "Sep 2026", "Sep/2026" or "2026-09" as YYYY-MM. */
function fiscalEnd(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const iso = /^(\d{4})-(\d{2})/.exec(v.trim());
  if (iso) return `${iso[1]}-${iso[2]}`;
  const m = /^([A-Za-z]{3})[a-z]*[\s/.-]+(\d{4})$/.exec(v.trim());
  const month = m ? MONTHS[m[1].toLowerCase()] : undefined;
  return m && month ? `${m[2]}-${month}` : null;
}

/**
 * Nasdaq's analyst earnings forecast page (read in lib/markets-feed.ts):
 * the yearly rows' fiscal year end, consensus EPS, number of estimates and
 * the lowest and highest estimate.
 * Throws when the answer is not that page's shape; an empty list is a
 * company with no estimates.
 */
export function parseNasdaqForecast(text: string): ConsensusYear[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Nasdaq's analyst estimates were not JSON");
  }
  const data = (json as { data?: unknown } | null)?.data;
  if (data === null) return [];
  const yearly = (data as { yearlyForecast?: { rows?: unknown } } | undefined)?.yearlyForecast;
  if (!data || typeof data !== "object") throw new Error("Nasdaq's analyst estimates carried no data");
  if (yearly === null || yearly === undefined) return [];
  const rows = yearly.rows;
  if (rows === null || rows === undefined) return [];
  if (!Array.isArray(rows)) throw new Error("Nasdaq's yearly estimates were not a list");
  const out: ConsensusYear[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const end = fiscalEnd(r?.fiscalEnd ?? r?.fiscalYearEnd);
    const eps = num(r?.consensusEPSForecast ?? r?.consensusEpsForecast);
    const n = num(r?.noOfEstimates);
    const low = num(r?.lowEPSForecast ?? r?.lowEpsForecast);
    const high = num(r?.highEPSForecast ?? r?.highEpsForecast);
    // A range that does not hold the consensus is not the range of these estimates; it is left out.
    const ranged = eps !== null && low !== null && high !== null && low <= eps && eps <= high;
    if (end && eps !== null) out.push({ end, eps, estimates: n === null ? null : Math.round(n), low: ranged ? low : null, high: ranged ? high : null });
  }
  return out.sort((a, b) => a.end.localeCompare(b.end)).slice(0, 6);
}

const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const fy = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `FY ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

/**
 * The next twelve months' consensus EPS: the fiscal year in progress for the
 * months it has left, the next for the rest. None when either year is not
 * estimated, with the sentence saying which.
 */
export function ntmConsensus(years: readonly ConsensusYear[], today: string): { eps: number | null; words: string } {
  const ahead = [...years].sort((a, b) => a.end.localeCompare(b.end)).filter((y) => monthEnd(y.end) >= today);
  const [one, two] = ahead;
  if (!one) return { eps: null, words: "Nasdaq lists no consensus for a fiscal year still to end." };
  const left = Math.min(12, Math.max(0, Math.round(daysBetween(today, monthEnd(one.end)) / 30.44)));
  if (left >= 12) return { eps: one.eps, words: `Analysts' consensus on Nasdaq: ${fy(one.end)}, ${one.eps.toFixed(2)} a share${one.estimates ? ` (${one.estimates} estimates)` : ""}.` };
  if (!two) return { eps: null, words: `Nasdaq lists ${fy(one.end)} but no estimate for the year after, so the next twelve months cannot be weighted.` };
  const eps = (one.eps * left + two.eps * (12 - left)) / 12;
  const est = (y: ConsensusYear) => (y.estimates ? `, ${y.estimates} estimates` : "");
  return { eps, words: `Analysts' consensus on Nasdaq: ${left} months of ${fy(one.end)} (${one.eps.toFixed(2)}${est(one)}) and ${12 - left} of ${fy(two.end)} (${two.eps.toFixed(2)}${est(two)}).` };
}

/** The consensus as kept, from the page's years. */
export function consensusOf(years: readonly ConsensusYear[], today: string, readAt: string): Consensus {
  const n = ntmConsensus(years, today);
  return { source: "Nasdaq", readAt, years: [...years], ntmEps: n.eps === null ? null : Math.round(n.eps * 1e4) / 1e4, words: n.words.slice(0, 300) };
}

/** Price over the consensus, for a price in US dollars per listed share; none otherwise. */
export function consensusPe(price: number | null | undefined, priceCurrency: string | null | undefined, c: Pick<Consensus, "ntmEps"> | null | undefined): number | null {
  if (!c || c.ntmEps === null || c.ntmEps <= 0 || price === null || price === undefined || price <= 0) return null;
  if (priceCurrency && priceCurrency.toUpperCase() !== "USD") return null;
  return Math.round((price / c.ntmEps) * 100) / 100;
}

type Multiples = { pe_ratio: number | null; forward_pe: number | null; ps_ratio: number | null; forward_ps: number | null; pfcf_ratio: number | null; forward_pfcf: number | null };

/**
 * The trailing and forward multiples at a price, from the per-share history:
 * for a company the filings read with no price of its own (a watchlist
 * company, priced on its page at the last close). The price and the figures
 * in one currency; none where a figure is not positive.
 */
export function multiplesAt(price: number | null, rows: readonly Row[]): Multiples {
  const none: Multiples = { pe_ratio: null, forward_pe: null, ps_ratio: null, forward_ps: null, pfcf_ratio: null, forward_pfcf: null };
  if (price === null || price <= 0 || !rows.length) return none;
  const last = [...rows].sort((a, b) => a.end.localeCompare(b.end)).at(-1)!;
  const ahead = forwardRows(rows).at(-1)!;
  const m = (x: number | null) => (x === null || x <= 0 ? null : Math.round((price / x) * 100) / 100);
  return { pe_ratio: m(last.eps), forward_pe: m(ahead.eps), ps_ratio: m(last.revenue), forward_ps: m(ahead.revenue), pfcf_ratio: m(last.fcf), forward_pfcf: m(ahead.fcf) };
}

/** The forward P/E from the filings' fields; a read kept before the field was derived gives it as the P/E over the revenue growth, as fundamentalsOf does. */
export function forwardPeOf(values: Readonly<Record<string, number | null | undefined>>): number | null {
  const v = values.forward_pe;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  const pe = values.pe_ratio;
  if (v === null || typeof pe !== "number" || !Number.isFinite(pe) || pe <= 0) return null;
  const k = grownForward(1, values.revenue_growth_pct);
  return k === null ? null : pe / k;
}

/** The multiples kept with the price they were read at: each moves with the price, the yield against it. */
const PRICE_OVER = ["pe_ratio", "forward_pe", "consensus_forward_pe", "ps_ratio", "forward_ps", "pfcf_ratio", "forward_pfcf"] as const;

/**
 * A read's figures laid at another price of the same share (a shared read
 * from earlier in the week, at today's close): every price multiple scaled by
 * the new price over the old, the dividend yield the other way; the figures
 * the price does not enter, and priced-in growth, which the model solves and
 * no ratio carries, stay as read. Unchanged without both prices.
 */
export function atPrice<V extends Readonly<Record<string, number | null | undefined>>>(values: V, from: number | null | undefined, to: number | null | undefined): V {
  if (!from || !to || from <= 0 || to <= 0 || from === to) return values;
  const k = to / from;
  const out: Record<string, number | null | undefined> = { ...values };
  for (const f of PRICE_OVER) if (typeof out[f] === "number") out[f] = Number((out[f]! * k).toPrecision(6));
  if (typeof out.dividend_yield_pct === "number") out.dividend_yield_pct = Number((out.dividend_yield_pct / k).toPrecision(6));
  return out as V;
}

// ---------------------------------------------------------------------------
// The analysts' EPS by year beside the filed years (Hamza, 21 Nov 2026, after
// Qualtrim's analyst estimates: "integrate these"). The filed years are the
// filings' own; the years ahead are Nasdaq's consensus with its low and high,
// labelled as the analysts', never the app's forecast and never a verdict.

/** How many filed years stand before the analysts' years. */
export const FILED_YEARS_SHOWN = 4;

export type EstimateBar = {
  /** "FY25" with A for a filed year, E for the analysts'. */
  label: string;
  year: string;
  kind: "filed" | "analysts";
  eps: number;
  low: number | null;
  high: number | null;
  estimates: number | null;
  /** On the bar before, in percent; none across zero. */
  growth: number | null;
};

/**
 * The filed diluted EPS of the last few fiscal years, then each analysts'
 * year after the last filed one. The filed years are set beside the
 * analysts' only when the filings are in US dollars, the currency Nasdaq
 * quotes; otherwise the analysts' years stand alone. Empty with neither.
 */
export function estimateBars(filed: { cols: string[]; rows: { key: string; values: (number | null)[] }[] } | null | undefined, c: Consensus | null | undefined, filedCcy: string | null): EstimateBar[] {
  const eps = filed?.rows.find((r) => r.key === "epsDiluted");
  const years: { year: string; eps: number }[] = [];
  if (eps && (filedCcy ?? "USD") === "USD") {
    filed!.cols.forEach((col, i) => {
      const v = eps.values[i];
      if (/^\d{4}$/.test(col) && v !== null && v !== undefined && Number.isFinite(v)) years.push({ year: col, eps: v });
    });
  }
  const shown = years.slice(-FILED_YEARS_SHOWN);
  const last = shown.at(-1)?.year ?? "";
  const bars: Omit<EstimateBar, "growth">[] = [
    ...shown.map((y) => ({ label: `FY${y.year.slice(2)}A`, year: y.year, kind: "filed" as const, eps: y.eps, low: null, high: null, estimates: null })),
    ...(c?.years ?? []).filter((y) => y.end.slice(0, 4) > last).map((y) => ({ label: `FY${y.end.slice(2, 4)}E`, year: y.end.slice(0, 4), kind: "analysts" as const, eps: y.eps, low: y.low ?? null, high: y.high ?? null, estimates: y.estimates })),
  ];
  return bars.map((b, i) => {
    const prev = i ? bars[i - 1].eps : null;
    return { ...b, growth: prev !== null && prev > 0 && b.eps >= 0 ? Math.round(((b.eps - prev) / prev) * 1000) / 10 : null };
  });
}
