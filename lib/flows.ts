/**
 * The Flows screen's other four cards (Hamza, 21 Nov 2026: "what's happening
 * in the markets right now, the flows"), each from a public US government
 * source, read once for everyone and kept in the registry's shared figures
 * (kind `flow`, one row per source):
 *
 * - positioning: the CFTC's weekly Commitments of Traders (Traders in
 *   Financial Futures and the Disaggregated report, futures only), asset
 *   managers' and leveraged funds' net futures on the S&P 500, the
 *   Nasdaq-100, the 10-year note and the dollar, and managed money's on gold
 *   and crude, as a share of open interest against its own three years;
 * - foreign: the Treasury's TIC table 1, foreign net purchases of US
 *   long-term securities by month;
 * - cash: the SEC's money market fund statistics, net assets by fund type;
 * - insiders: the SEC's quarterly insider transactions data set, open-market
 *   purchases and sales (codes P and S) by S&P 500 and Nasdaq-100 companies'
 *   insiders, by sector.
 *
 * Every figure is what was reported, never a forecast. Parsers throw on a
 * document they cannot read, so a card never looks empty. Pure: no fetch, no
 * server-only import (lib/flows-run.ts reads them).
 */
import { z } from "zod";

export const FLOW_SOURCES = ["positioning", "foreign", "cash", "insiders"] as const;
export type FlowSource = (typeof FLOW_SOURCES)[number];

/** How often each source is asked again, in days; a failed read is asked again after a day. */
export const FLOW_SOURCE_DAYS: Record<FlowSource, number> = { positioning: 1, foreign: 3, cash: 3, insiders: 7 };
export const FLOW_SOURCE_RETRY_DAYS = 1;

const num = z.number().finite();

// ---------------------------------------------------------------- positioning

/** The CFTC's datasets on its public reporting site: Traders in Financial Futures and Disaggregated, futures only. */
export const COT_DATASETS = { tff: "gpe5-46if", disagg: "72hh-3qpy" } as const;
export type CotGroup = "asset" | "lev" | "managed";
export const COT_GROUP_LABEL: Record<CotGroup, string> = { asset: "Asset managers", lev: "Leveraged funds", managed: "Managed money" };

export type CotMarket = { id: string; label: string; code: string; dataset: keyof typeof COT_DATASETS; groups: CotGroup[] };

/** The markets read, by the CFTC's contract market code (checked on the 10 Nov 2026 report). */
export const COT_MARKETS: readonly CotMarket[] = [
  { id: "spx", label: "S&P 500", code: "13874A", dataset: "tff", groups: ["asset", "lev"] },
  { id: "ndx", label: "Nasdaq-100", code: "209742", dataset: "tff", groups: ["asset", "lev"] },
  { id: "ust10", label: "10-year Treasury note", code: "043602", dataset: "tff", groups: ["asset", "lev"] },
  { id: "dxy", label: "US dollar index", code: "098662", dataset: "tff", groups: ["asset", "lev"] },
  { id: "gold", label: "Gold", code: "088691", dataset: "disagg", groups: ["managed"] },
  { id: "crude", label: "WTI crude oil", code: "067651", dataset: "disagg", groups: ["managed"] },
];

/** Weeks of history kept and judged against: three years. */
export const COT_WEEKS = 156;

const COT_FIELDS: Record<CotGroup, [string, string]> = {
  asset: ["asset_mgr_positions_long", "asset_mgr_positions_short"],
  lev: ["lev_money_positions_long", "lev_money_positions_short"],
  managed: ["m_money_positions_long_all", "m_money_positions_short_all"],
};

/** The address that asks for a market's weeks, newest first, with only the fields read. */
export function cotUrl(m: CotMarket, weeks = COT_WEEKS + 4): string {
  const fields = ["report_date_as_yyyy_mm_dd", "open_interest_all", ...m.groups.flatMap((g) => COT_FIELDS[g])];
  const q = new URLSearchParams({ cftc_contract_market_code: m.code, $select: fields.join(","), $order: "report_date_as_yyyy_mm_dd DESC", $limit: String(weeks) });
  return `https://publicreporting.cftc.gov/resource/${COT_DATASETS[m.dataset]}.json?${q.toString()}`;
}

export const cotWeekSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), oi: num.nonnegative(), net: z.record(z.string(), num) });
export type CotWeek = z.infer<typeof cotWeekSchema>;

/** A market's weeks from the CFTC's answer, oldest first: each group's long less short. Throws on an answer with none. */
export function parseCot(raw: unknown, m: CotMarket): CotWeek[] {
  if (!Array.isArray(raw)) throw new Error("not a list");
  const out: CotWeek[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const date = String(row.report_date_as_yyyy_mm_dd ?? "").slice(0, 10);
    const oi = Number(row.open_interest_all);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(oi) || oi <= 0) continue;
    const net: Record<string, number> = {};
    for (const g of m.groups) {
      const [l, s] = COT_FIELDS[g].map((k) => Number(row[k]));
      if (Number.isFinite(l) && Number.isFinite(s)) net[g] = l - s;
    }
    if (Object.keys(net).length) out.push({ date, oi, net });
  }
  if (!out.length) throw new Error("no weeks");
  const byDate = new Map(out.map((w) => [w.date, w]));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-COT_WEEKS);
}

export const positioningSchema = z.object({ markets: z.record(z.string(), z.array(cotWeekSchema)), problems: z.array(z.string()), readAt: z.string() });
export type Positioning = z.infer<typeof positioningSchema>;

export type PositionRow = {
  market: string;
  label: string;
  group: CotGroup;
  date: string;
  /** Net long as a share of open interest, in percent; below zero is net short. */
  pct: number;
  /** The change since the week before, in points. */
  change: number | null;
  /** The three years' low and high of that share. */
  low: number;
  high: number;
  /** Where it sits in its three years, 0 at the low and 100 at the high. */
  rank: number;
  weeks: number;
};

/** Each market and group's latest week against its own history; a market not read is left out. */
export function positionRows(p: Positioning): PositionRow[] {
  const rows: PositionRow[] = [];
  for (const m of COT_MARKETS) {
    const weeks = p.markets[m.id] ?? [];
    for (const g of m.groups) {
      const series = weeks.filter((w) => w.net[g] !== undefined).map((w) => ({ date: w.date, pct: (w.net[g] / w.oi) * 100 }));
      const last = series[series.length - 1];
      if (!last) continue;
      const prev = series[series.length - 2];
      const values = series.map((s) => s.pct);
      const low = Math.min(...values);
      const high = Math.max(...values);
      rows.push({ market: m.id, label: m.label, group: g, date: last.date, pct: last.pct, change: prev ? last.pct - prev.pct : null, low, high, rank: high > low ? ((last.pct - low) / (high - low)) * 100 : 50, weeks: series.length });
    }
  }
  return rows;
}

/** The rank in words: near the three years' high or low, or between. */
export function rankWords(rank: number): string {
  return rank >= 90 ? "near its three-year high" : rank <= 10 ? "near its three-year low" : rank >= 65 ? "high in its range" : rank <= 35 ? "low in its range" : "mid-range";
}

// ---------------------------------------------------------------- insiders

/** The quarters before the one `day` falls in, newest first ("2026q3", "2026q2"), `n` of them. */
export function quartersBefore(day: string, n = 2): string[] {
  let y = Number(day.slice(0, 4));
  let q = Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
    out.push(`${y}q${q}`);
  }
  return out;
}

/** A tab-separated table with its header row, as records; a quote is part of the value, as the SEC writes them. */
export function readTsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const head = (lines.shift() ?? "").split("\t").map((h) => h.trim().toUpperCase());
  if (head.length < 2) throw new Error("no header");
  const out: Record<string, string>[] = [];
  for (const line of lines) {
    if (!line) continue;
    const cells = line.split("\t");
    const r: Record<string, string> = {};
    head.forEach((h, i) => (r[h] = (cells[i] ?? "").trim()));
    out.push(r);
  }
  return out;
}

export const sectorFlowSchema = z.object({ sector: z.string(), bought: num.nonnegative(), sold: num.nonnegative(), buyers: z.number().int().nonnegative(), sellers: z.number().int().nonnegative() });
export const insiderBuySchema = z.object({ symbol: z.string(), value: num.nonnegative(), filings: z.number().int().positive() });
export const insidersSchema = z.object({
  quarter: z.string().regex(/^\d{4}q[1-4]$/),
  sectors: z.array(sectorFlowSchema),
  /** The companies whose insiders bought the most on the open market, largest first. */
  topBuys: z.array(insiderBuySchema),
  companies: z.number().int().nonnegative(),
  readAt: z.string(),
});
export type Insiders = z.infer<typeof insidersSchema>;

/** The largest single trade counted, in dollars; a row past it is a typing error in the filing, left out. */
export const MAX_TRADE_USD = 5e9;
export const TOP_BUYS = 8;

/**
 * A quarter's open-market trades by the insiders of the companies named in
 * `sectors` (symbol to sector): each Form 4's non-derivative purchases (P)
 * and sales (S) at their reported price, summed by sector; amendments and
 * other forms left out, and a company counted once per side for the people
 * count. Throws when the tables hold no Form 4.
 */
export function insidersOf(quarter: string, submissionTsv: string, transTsv: string, sectors: ReadonlyMap<string, string>, readAt: string): Insiders {
  const subs = readTsv(submissionTsv);
  // BRK.B, BRK-B and BRKB are one company: matched with the punctuation taken out.
  const bare = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const named = new Map([...sectors.keys()].map((k) => [bare(k), k]));
  const forms = new Map<string, string>();
  for (const s of subs) {
    if (s.DOCUMENT_TYPE !== "4") continue;
    const symbol = named.get(bare(s.ISSUERTRADINGSYMBOL ?? ""));
    if (symbol) forms.set(s.ACCESSION_NUMBER, symbol);
  }
  if (!subs.some((s) => s.DOCUMENT_TYPE === "4")) throw new Error("no form 4");
  const bySector = new Map<string, { bought: number; sold: number; buyers: Set<string>; sellers: Set<string> }>();
  const buys = new Map<string, { value: number; filings: Set<string> }>();
  const companies = new Set<string>();
  for (const t of readTsv(transTsv)) {
    const code = t.TRANS_CODE;
    if (code !== "P" && code !== "S") continue;
    const symbol = forms.get(t.ACCESSION_NUMBER);
    if (!symbol) continue;
    const value = Number(t.TRANS_SHARES) * Number(t.TRANS_PRICEPERSHARE);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_TRADE_USD) continue;
    const sector = sectors.get(symbol)!;
    const s = bySector.get(sector) ?? { bought: 0, sold: 0, buyers: new Set(), sellers: new Set() };
    companies.add(symbol);
    if (code === "P") {
      s.bought += value;
      s.buyers.add(symbol);
      const b = buys.get(symbol) ?? { value: 0, filings: new Set() };
      b.value += value;
      b.filings.add(t.ACCESSION_NUMBER);
      buys.set(symbol, b);
    } else {
      s.sold += value;
      s.sellers.add(symbol);
    }
    bySector.set(sector, s);
  }
  return {
    quarter,
    sectors: [...bySector.entries()].map(([sector, s]) => ({ sector, bought: s.bought, sold: s.sold, buyers: s.buyers.size, sellers: s.sellers.size })).sort((a, b) => b.sold + b.bought - (a.sold + a.bought)),
    topBuys: [...buys.entries()].map(([symbol, b]) => ({ symbol, value: b.value, filings: b.filings.size })).sort((a, b) => b.value - a.value).slice(0, TOP_BUYS),
    companies: companies.size,
    readAt,
  };
}

/** The quarter in words: "Jul to Sep 2026". */
export function quarterWords(q: string): string {
  const n = Number(q.slice(5));
  return `${["Jan", "Apr", "Jul", "Oct"][n - 1]} to ${["Mar", "Jun", "Sep", "Dec"][n - 1]} ${q.slice(0, 4)}`;
}

// ---------------------------------------------------------------- foreign

/** The Treasury's TIC table 1: foreign net purchases of US long-term securities, by country and month, in millions of dollars. */
export const TIC_URL = "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table1.txt";
/** The all-countries row's code in the TIC country list; regional totals sit beside it, so countries are never summed. */
export const TIC_TOTAL_CODE = "99996";
/** Months kept and drawn. */
export const TIC_MONTHS = 24;

export const ticMonthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), treasuries: num, agencies: num, corporates: num, equities: num });
export type TicMonth = z.infer<typeof ticMonthSchema>;
export const foreignSchema = z.object({ months: z.array(ticMonthSchema), readAt: z.string() });
export type Foreign = z.infer<typeof foreignSchema>;

/**
 * The all-countries row's months from table 1, oldest first, in dollars: the
 * file's own field-code row names the columns, so a column moved is still
 * read. Throws when the file has no such row or no total, never summing the
 * countries, which would count the regional totals twice.
 */
export function parseTicTable1(text: string): TicMonth[] {
  const lines = text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim()));
  const h = lines.findIndex((c) => c[0]?.toLowerCase() === "country" && c.includes("country_code") && c.includes("date"));
  if (h < 0) throw new Error("no field-code row");
  const col = (name: string) => lines[h].indexOf(name);
  const at = { code: col("country_code"), date: col("date"), treas: col("for_lt_treas_net"), agcy: col("for_lt_agcy_net"), corp: col("for_lt_corp_net"), eqty: col("for_lt_eqty_net") };
  if (Object.values(at).some((i) => i < 0)) throw new Error("a column is missing");
  const value = (c: string[], i: number) => {
    const v = Number((c[i] ?? "").replace(/,/g, ""));
    return Number.isFinite(v) ? v * 1e6 : null;
  };
  const byMonth = new Map<string, TicMonth>();
  for (const c of lines.slice(h + 1)) {
    if (c[at.code] !== TIC_TOTAL_CODE && !/^grand total$/i.test(c[0] ?? "")) continue;
    const month = c[at.date];
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) continue;
    const [treasuries, agencies, corporates, equities] = [at.treas, at.agcy, at.corp, at.eqty].map((i) => value(c, i));
    if (treasuries === null || agencies === null || corporates === null || equities === null) continue;
    byMonth.set(month, { month, treasuries, agencies, corporates, equities });
  }
  if (!byMonth.size) throw new Error("no grand total");
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-TIC_MONTHS);
}

/** The last twelve months' sums by kind, and the bonds together. */
export function foreignYear(months: readonly TicMonth[]) {
  const year = months.slice(-12);
  const sum = (k: keyof Omit<TicMonth, "month">) => year.reduce((s, m) => s + m[k], 0);
  return { months: year.length, treasuries: sum("treasuries"), agencies: sum("agencies"), corporates: sum("corporates"), equities: sum("equities") };
}

// ---------------------------------------------------------------- cash

/** The OFR's money market fund monitor, keyless: what the funds hold in all, and by instrument, at each month's end, in dollars. */
export const MMF_SERIES = [
  { id: "total", mnemonic: "MMF-MMF_TOT-M", label: "All holdings" },
  { id: "treasuries", mnemonic: "MMF-MMF_T_TOT-M", label: "Treasuries" },
  { id: "repo", mnemonic: "MMF-MMF_RP_TOT-M", label: "Repurchase agreements" },
  { id: "agencies", mnemonic: "MMF-MMF_AG_TOT-M", label: "Agency and GSE debt" },
  { id: "bank", mnemonic: "MMF-MMF_BRA_TOT-M", label: "Bank-related" },
  { id: "other", mnemonic: "MMF-MMF_OA_TOT-M", label: "Other" },
] as const;
export type MmfId = (typeof MMF_SERIES)[number]["id"];
export const mmfUrl = (mnemonic: string) => `https://data.financialresearch.gov/v1/series/timeseries?mnemonic=${encodeURIComponent(mnemonic)}`;
/** Months kept and drawn: five years. */
export const MMF_MONTHS = 60;

const mmfPoint = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: num });
export const cashSchema = z.object({ series: z.record(z.string(), z.array(mmfPoint)), readAt: z.string() });
export type Cash = z.infer<typeof cashSchema>;

/** A series' month-ends from the OFR's `[date, value]` pairs, oldest first; throws on an answer with none. */
export function parseOfrSeries(raw: unknown): { date: string; value: number }[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { timeseries?: unknown }).timeseries) ? (raw as { timeseries: unknown[] }).timeseries : null;
  if (!list) throw new Error("not a series");
  const out = list.flatMap((p) => (Array.isArray(p) && typeof p[0] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && Number.isFinite(Number(p[1])) && p[1] !== null ? [{ date: p[0], value: Number(p[1]) }] : []));
  if (!out.length) throw new Error("no points");
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-MMF_MONTHS);
}

/** The latest month and the change on a year: the total and each instrument's share of it. */
export function cashNow(c: Cash) {
  const total = c.series.total ?? [];
  const last = total[total.length - 1];
  if (!last) return null;
  const yearAgo = total.find((p) => p.date.slice(0, 7) === `${Number(last.date.slice(0, 4)) - 1}${last.date.slice(4, 7)}`) ?? null;
  const parts = MMF_SERIES.filter((s) => s.id !== "total").flatMap((s) => {
    const p = (c.series[s.id] ?? []).find((x) => x.date === last.date);
    return p ? [{ id: s.id, label: s.label, value: p.value, share: (p.value / last.value) * 100 }] : [];
  });
  return { date: last.date, total: last.value, yearChange: yearAgo ? ((last.value - yearAgo.value) / yearAgo.value) * 100 : null, parts };
}

// ---------------------------------------------------------------- the kept row

export const flowSourceRowSchema = z.object({
  positioning: positioningSchema.nullable(),
  foreign: foreignSchema.nullable(),
  cash: cashSchema.nullable(),
  insiders: insidersSchema.nullable(),
  /** Each source's last try and the sentence of its last failure, kept beside the last good copy. */
  tried: z.record(z.string(), z.object({ at: z.string(), error: z.string().nullable() })),
});
export type FlowSourceRow = z.infer<typeof flowSourceRowSchema>;
export const EMPTY_FLOW_SOURCES: FlowSourceRow = { positioning: null, foreign: null, cash: null, insiders: null, tried: {} };

/** The sources due a read at `now`: never read, past their rhythm, or failed more than a day ago. */
export function flowSourcesDue(row: FlowSourceRow, now: Date): FlowSource[] {
  return FLOW_SOURCES.filter((s) => {
    const t = row.tried[s];
    if (!t) return true;
    const days = (now.getTime() - Date.parse(t.at)) / 86_400_000;
    return t.error || !row[s] ? days >= FLOW_SOURCE_RETRY_DAYS : days >= FLOW_SOURCE_DAYS[s];
  });
}
