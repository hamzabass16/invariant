/**
 * The markets object: a small set of public indicators (VIX, Treasury
 * yields, gold and silver, the dollar, oil, SPY and QQQ) read from a free
 * daily feed (Yahoo Finance, FRED, stooq, and multpl for S&P 500
 * earnings; FRED does not answer Vercel's
 * servers, so it is the fallback wherever another source has the series),
 * so a methodology's macro section can be measured like any other. Each indicator is a row (level, changes, one-year range, age) and a
 * price series; a methodology reads the rows with a measure over "markets"
 * and the series with a series figure naming the symbol.
 *
 * This module is pure: the catalogue, the parsers for the three source
 * formats, the figures derived from them, and the merge into a book. The
 * fetch itself lives in lib/markets-feed.ts. An indicator that cannot be
 * read is a sentence in `problems` and no row; never a zero.
 */
import { z } from "zod";

import { trailingYear, yearOnYear, type TreasuryTenor } from "@/lib/macro-sources";
import { daysBetween } from "@/lib/time";

export const MARKET_SYMBOLS = ["VIX", "US10Y", "US2Y", "US10Y2Y", "GOLD", "SILVER", "GOLDSILVER", "DXY", "WTI", "SPY", "QQQ", "SPXEY", "DJI", "COMP", "RUT", "DM", "DMXUS", "EM", "FTSE", "DAX", "N225", "NIFTY", "SSEC", "DJT", "XHB", "US3M", "US5Y", "US30Y", "US10Y3M", "RECPROB", "FEDBS", "EFFR", "SOFR", "MORT30", "CPIYOY", "UNRATE", "SENTIMENT", "FEARGREED", "TAXREC"] as const;
export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];

export type MarketUnit = "number" | "pct" | "money" | "ratio";

/** One public daily source for an indicator. */
export type Source =
  /** A FRED series (fredgraph.csv: observation_date,<id>; "." for a missing day). */
  | { kind: "fred"; id: string }
  /** A stooq daily file (Date,Open,High,Low,Close,Volume). */
  | { kind: "stooq"; symbol: string }
  /** A Yahoo Finance chart (JSON: chart.result[0].timestamp and indicators.quote[0].close). */
  | { kind: "yahoo"; symbol: string }
  /** A multpl monthly table (HTML: one row per month, date then value). */
  | { kind: "multpl"; table: string }
  /**
   * Trailing earnings over the index, day by day: the latest twelve-month
   * reported earnings per share from a multpl table, over each day's close of
   * the index from the first of `index` that answers, in percent.
   */
  | { kind: "eps_yield"; eps: { kind: "multpl"; table: string }; index: Source[] }
  /** A New York Fed reference rate, daily (refRates of effectiveDate and percentRate). */
  | { kind: "nyfed"; rate: "effr" | "sofr" }
  /** The New York Fed's System Open Market Account summary, each Wednesday's holdings. */
  | { kind: "soma" }
  /** Freddie Mac's Primary Mortgage Market Survey history, weekly. */
  | { kind: "pmms" }
  /** A BLS series through its public API, monthly. */
  | { kind: "bls"; series: string }
  /** The University of Michigan's monthly sentiment table. */
  | { kind: "umich" }
  /** CNN's fear and greed index, daily. */
  | { kind: "cnn_fg" }
  /** One line of the Treasury's Monthly Statement, table 4 (receipts by source). */
  | { kind: "mts"; line: string }
  /** The US Treasury's daily par yield curve, one tenor's column, this year and last. */
  | { kind: "treasury"; tenor: TreasuryTenor };

export type Feed =
  /** Public daily sources, tried in order until one answers; the first is the one the row names. */
  | { kind: "sources"; sources: Source[] }
  /** One catalogue series divided by another, day by day. */
  | { kind: "ratio"; num: MarketSymbol; den: MarketSymbol }
  /** One catalogue series less another, day by day. */
  | { kind: "difference"; a: MarketSymbol; b: MarketSymbol }
  /**
   * The New York Fed's yield-curve model of a recession twelve months ahead:
   * the normal distribution at -0.5333 - 0.6330 times the 10-year less
   * 3-month spread, the spread averaged over the month (21 sessions) to each
   * day, in percent.
   */
  | { kind: "recession"; spread: MarketSymbol }
  /** No free daily source yet: the row says what it needs. */
  | { kind: "none"; needs: string };

/** Where an indicator sits on the board. */
export const MARKET_GROUPS = ["rates", "liquidity", "us_economy", "commodities", "us_equity", "world_equity"] as const;
export type MarketGroup = (typeof MARKET_GROUPS)[number];
export const MARKET_GROUP_LABEL: Record<MarketGroup, string> = { rates: "Volatility and rates", liquidity: "Liquidity", us_economy: "The US economy", commodities: "Commodities and the dollar", us_equity: "US equities", world_equity: "World equities" };

/**
 * How often an indicator is published. A daily one changes by sessions; a
 * weekly or monthly one changes by the calendar (its last reading, the month
 * and the year before) and keeps `years` of history for its chart.
 */
export type Cadence = "daily" | "weekly" | "monthly";

/** What is done to a source's series before it becomes the indicator: a monthly index as its change on a year before, a seasonal monthly flow as its trailing twelve months. */
export type Transform = "yoy" | "sum12";

/** A known scale to draw an indicator's level on (VIX from 10 to 50) rather than its own year, with the better end when there is one, and a line saying how to read it. */
export type Scale = { low: number; high: number; better: "high" | "low" | null; note: string };

export type MarketDef = { symbol: MarketSymbol; name: string; unit: MarketUnit; group: MarketGroup; about: string; feed: Feed; cadence?: Cadence; years?: number; transform?: Transform; scale?: Scale };

export const cadenceOf = (def: Pick<MarketDef, "cadence">): Cadence => def.cadence ?? "daily";

const yahooThen = (yahoo: string, ...rest: Source[]): Feed => ({ kind: "sources", sources: [{ kind: "yahoo", symbol: yahoo }, ...rest] });

/** Every indicator the feed offers, in the order the board shows them. */
export const MARKETS: readonly MarketDef[] = [
  { symbol: "VIX", scale: { low: 10, high: 50, better: "low", note: "Below 15 is calm, above 30 panic." }, group: "rates", name: "VIX", unit: "number", about: "CBOE volatility index, close (Yahoo Finance ^VIX, else FRED VIXCLS).", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "^VIX" }, { kind: "fred", id: "VIXCLS" }] } },
  { symbol: "US10Y", scale: { low: 0, high: 6, better: null, note: "Where the yield has run since 2000." }, group: "rates", name: "US 10-year yield", unit: "pct", about: "10-year Treasury yield (CBOE ^TNX on Yahoo Finance, else the Treasury's daily par yield curve, else FRED DGS10, the constant maturity yield).", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "^TNX" }, { kind: "treasury", tenor: "10 Yr" }, { kind: "fred", id: "DGS10" }] } },
  { symbol: "US2Y", scale: { low: 0, high: 6, better: null, note: "Where the yield has run since 2000." }, group: "rates", name: "US 2-year yield", unit: "pct", about: "2-year Treasury yield (the CME 2-year yield future on Yahoo Finance, 2YY=F, else the Treasury's daily par yield curve, else FRED DGS2, the constant maturity yield).", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "2YY=F" }, { kind: "treasury", tenor: "2 Yr" }, { kind: "fred", id: "DGS2" }] } },
  { symbol: "US10Y2Y", scale: { low: -2, high: 3, better: null, note: "Below zero the curve is inverted, which has come before most US recessions; a steeper curve is not better by itself." }, group: "rates", name: "Yield curve, 10y less 2y", unit: "pct", about: "The 10-year yield less the 2-year; negative when the curve is inverted.", feed: { kind: "difference", a: "US10Y", b: "US2Y" } },
  { symbol: "GOLD", group: "commodities", name: "Gold", unit: "money", about: "Gold, US dollars an ounce (stooq spot, else the Yahoo Finance front-month future).", feed: { kind: "sources", sources: [{ kind: "stooq", symbol: "xauusd" }, { kind: "yahoo", symbol: "GC=F" }] } },
  { symbol: "SILVER", group: "commodities", name: "Silver", unit: "money", about: "Silver, US dollars an ounce (stooq spot, else the Yahoo Finance front-month future).", feed: { kind: "sources", sources: [{ kind: "stooq", symbol: "xagusd" }, { kind: "yahoo", symbol: "SI=F" }] } },
  { symbol: "GOLDSILVER", scale: { low: 40, high: 120, better: null, note: "High in fear; near 60 over the long run." }, group: "commodities", name: "Gold to silver ratio", unit: "ratio", about: "Ounces of silver one ounce of gold buys.", feed: { kind: "ratio", num: "GOLD", den: "SILVER" } },
  { symbol: "DXY", scale: { low: 80, high: 120, better: null, note: "Where the index has run since 2000." }, group: "commodities", name: "US dollar index", unit: "number", about: "ICE US dollar index (DXY) on Yahoo Finance, DX-Y.NYB; else FRED's broad trade-weighted index, DTWEXBGS, which runs on a different scale.", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "DX-Y.NYB" }, { kind: "fred", id: "DTWEXBGS" }] } },
  { symbol: "WTI", scale: { low: 20, high: 150, better: null, note: "Where the price has run since 2000." }, group: "commodities", name: "Oil, WTI", unit: "money", about: "West Texas Intermediate, US dollars a barrel (the front-month future on Yahoo Finance, CL=F, else FRED's spot price, DCOILWTICO).", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "CL=F" }, { kind: "fred", id: "DCOILWTICO" }] } },
  { symbol: "SPY", years: 5, group: "us_equity", name: "S&P 500", unit: "number", about: "S&P 500 index level, close (Yahoo Finance ^GSPC, else FRED SP500); stands in for SPY as a benchmark, with the same daily moves less dividends.", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "^GSPC" }, { kind: "fred", id: "SP500" }, { kind: "stooq", symbol: "spy.us" }, { kind: "yahoo", symbol: "SPY" }] } },
  { symbol: "QQQ", years: 5, group: "us_equity", name: "Nasdaq-100", unit: "number", about: "Nasdaq-100 index level, close (Yahoo Finance ^NDX, else FRED NASDAQ100); stands in for QQQ as a benchmark, with the same daily moves less dividends.", feed: { kind: "sources", sources: [{ kind: "yahoo", symbol: "^NDX" }, { kind: "fred", id: "NASDAQ100" }, { kind: "stooq", symbol: "qqq.us" }, { kind: "yahoo", symbol: "QQQ" }] } },
  {
    symbol: "SPXEY",
    scale: { low: 2, high: 8, better: "high", note: "Higher is a cheaper index." },
    group: "us_equity",
    name: "S&P 500 earnings yield",
    unit: "pct",
    about: "Trailing twelve-month reported earnings per share of the S&P 500 (multpl, from S&P's own figures, monthly and dated to the period they cover) over each day's close of the index (Yahoo Finance ^GSPC, else FRED SP500). The earnings step once a month and arrive weeks after the quarter; the price moves daily.",
    feed: { kind: "sources", sources: [{ kind: "eps_yield", eps: { kind: "multpl", table: "s-p-500-earnings" }, index: [{ kind: "yahoo", symbol: "^GSPC" }, { kind: "fred", id: "SP500" }] }] },
  },
  { symbol: "DJI", group: "us_equity", name: "Dow Jones Industrial Average", unit: "number", about: "Dow Jones Industrial Average, close (Yahoo Finance ^DJI, else stooq ^dji).", feed: yahooThen("^DJI", { kind: "stooq", symbol: "^dji" }) },
  { symbol: "COMP", group: "us_equity", name: "Nasdaq Composite", unit: "number", about: "Nasdaq Composite index, close (Yahoo Finance ^IXIC, else stooq ^ndq).", feed: yahooThen("^IXIC", { kind: "stooq", symbol: "^ndq" }) },
  { symbol: "RUT", group: "us_equity", name: "Russell 2000", unit: "number", about: "Russell 2000 index of small US companies, close (Yahoo Finance ^RUT, else the iShares Russell 2000 ETF, IWM, which moves with it).", feed: yahooThen("^RUT", { kind: "yahoo", symbol: "IWM" }) },
  { symbol: "DM", group: "world_equity", name: "Developed markets", unit: "money", about: "MSCI World, the developed markets including the US, through the iShares MSCI World ETF (URTH), US dollars (Yahoo Finance, else stooq).", feed: yahooThen("URTH", { kind: "stooq", symbol: "urth.us" }) },
  { symbol: "DMXUS", group: "world_equity", name: "Developed markets excluding the US", unit: "money", about: "The developed markets outside the US, through the Vanguard FTSE Developed Markets ETF (VEA), US dollars (Yahoo Finance, else stooq).", feed: yahooThen("VEA", { kind: "stooq", symbol: "vea.us" }) },
  { symbol: "EM", group: "world_equity", name: "Emerging markets", unit: "money", about: "MSCI Emerging Markets through the iShares MSCI Emerging Markets ETF (EEM), US dollars (Yahoo Finance, else stooq).", feed: yahooThen("EEM", { kind: "stooq", symbol: "eem.us" }) },
  { symbol: "FTSE", group: "world_equity", name: "FTSE 100", unit: "number", about: "FTSE 100, London, close in pounds (Yahoo Finance ^FTSE, else stooq ^ukx).", feed: yahooThen("^FTSE", { kind: "stooq", symbol: "^ukx" }) },
  { symbol: "DAX", group: "world_equity", name: "DAX 40", unit: "number", about: "DAX 40, Frankfurt, close in euros (Yahoo Finance ^GDAXI, else stooq ^dax).", feed: yahooThen("^GDAXI", { kind: "stooq", symbol: "^dax" }) },
  { symbol: "N225", group: "world_equity", name: "Nikkei 225", unit: "number", about: "Nikkei 225, Tokyo, close in yen (Yahoo Finance ^N225, else stooq ^nkx).", feed: yahooThen("^N225", { kind: "stooq", symbol: "^nkx" }) },
  { symbol: "NIFTY", group: "world_equity", name: "India, Nifty 50", unit: "number", about: "Nifty 50, the National Stock Exchange of India, close in rupees (Yahoo Finance ^NSEI).", feed: yahooThen("^NSEI") },
  { symbol: "DJT", group: "us_equity", name: "Dow Jones Transportation Average", unit: "number", about: "Dow Jones Transportation Average, close (Yahoo Finance ^DJT, else stooq ^djt). Dow theory reads it against the industrials: a trend one confirms and the other does not is a warning.", feed: yahooThen("^DJT", { kind: "stooq", symbol: "^djt" }) },
  { symbol: "XHB", group: "us_equity", name: "Homebuilders (XHB)", unit: "money", about: "SPDR S&P Homebuilders ETF, US dollars (Yahoo Finance, else stooq): homebuilders and the makers of what goes in a home, a read on the consumer's spending.", feed: yahooThen("XHB", { kind: "stooq", symbol: "xhb.us" }) },
  { symbol: "US3M", scale: { low: 0, high: 6, better: null, note: "Where the yield has run since 2000." }, group: "rates", name: "US 3-month yield", unit: "pct", about: "13-week Treasury bill yield (CBOE ^IRX on Yahoo Finance, else the Treasury's daily par yield curve, else FRED DGS3MO).", feed: yahooThen("^IRX", { kind: "treasury", tenor: "3 Mo" }, { kind: "fred", id: "DGS3MO" }) },
  { symbol: "US5Y", scale: { low: 0, high: 6, better: null, note: "Where the yield has run since 2000." }, group: "rates", name: "US 5-year yield", unit: "pct", about: "5-year Treasury yield (CBOE ^FVX on Yahoo Finance, else the Treasury's daily par yield curve, else FRED DGS5).", feed: yahooThen("^FVX", { kind: "treasury", tenor: "5 Yr" }, { kind: "fred", id: "DGS5" }) },
  { symbol: "US30Y", scale: { low: 0, high: 6, better: null, note: "Where the yield has run since 2000." }, group: "rates", name: "US 30-year yield", unit: "pct", about: "30-year Treasury yield (CBOE ^TYX on Yahoo Finance, else the Treasury's daily par yield curve, else FRED DGS30).", feed: yahooThen("^TYX", { kind: "treasury", tenor: "30 Yr" }, { kind: "fred", id: "DGS30" }) },
  { symbol: "US10Y3M", scale: { low: -2, high: 4, better: null, note: "Below zero the curve is inverted, which has come before most US recessions; a steeper curve is not better by itself." }, group: "rates", name: "Yield curve, 10y less 3m", unit: "pct", about: "The 10-year yield less the 3-month bill, the spread the New York Fed's recession model reads; negative when inverted.", feed: { kind: "difference", a: "US10Y", b: "US3M" } },
  { symbol: "RECPROB", scale: { low: 0, high: 100, better: "low", note: "The chance of a recession within a year." }, group: "rates", name: "Recession probability, 12 months", unit: "pct", about: "The New York Fed's yield-curve model: the chance of a US recession twelve months ahead, from the 10-year less 3-month spread averaged over the month (probit, -0.5333 - 0.6330 x spread). Computed here from the two yields, not read from the Fed.", feed: { kind: "recession", spread: "US10Y3M" } },
  { symbol: "FEDBS", group: "liquidity", name: "Fed securities holdings, $bn", unit: "number", cadence: "weekly", about: "The Federal Reserve's System Open Market Account: Treasuries and mortgage securities it holds each Wednesday, in billions of dollars (New York Fed). Rising is the Fed buying bonds and adding liquidity; falling is quantitative tightening.", feed: { kind: "sources", sources: [{ kind: "soma" }] } },
  { symbol: "EFFR", scale: { low: 0, high: 6, better: null, note: "Where the rate has run since 2000." }, group: "liquidity", name: "Fed funds effective rate", unit: "pct", years: 5, about: "The effective federal funds rate, the overnight rate banks lend reserves at, daily (New York Fed, else FRED EFFR).", feed: { kind: "sources", sources: [{ kind: "nyfed", rate: "effr" }, { kind: "fred", id: "EFFR" }] } },
  { symbol: "SOFR", scale: { low: 0, high: 6, better: null, note: "Where the rate has run since 2018." }, group: "liquidity", name: "SOFR", unit: "pct", years: 5, about: "The Secured Overnight Financing Rate, overnight cash lent against Treasuries, daily (New York Fed, else FRED SOFR). Above the fed funds rate, collateral is plentiful and cash is scarce.", feed: { kind: "sources", sources: [{ kind: "nyfed", rate: "sofr" }, { kind: "fred", id: "SOFR" }] } },
  { symbol: "MORT30", scale: { low: 2, high: 9, better: "low", note: "Where the rate has run since 2000." }, group: "us_economy", name: "30-year mortgage rate", unit: "pct", cadence: "weekly", about: "The average 30-year fixed mortgage rate in Freddie Mac's weekly survey (else FRED MORTGAGE30US).", feed: { kind: "sources", sources: [{ kind: "pmms" }, { kind: "fred", id: "MORTGAGE30US" }] } },
  { symbol: "CPIYOY", scale: { low: -2, high: 10, better: null, note: "The Fed aims at 2%." }, group: "us_economy", name: "US inflation (CPI, a year)", unit: "pct", cadence: "monthly", transform: "yoy", about: "The consumer price index for all urban consumers against the same month a year before, in percent (BLS CUUR0000SA0, else FRED CPIAUCNS).", feed: { kind: "sources", sources: [{ kind: "bls", series: "CUUR0000SA0" }, { kind: "fred", id: "CPIAUCNS" }] } },
  { symbol: "UNRATE", scale: { low: 2, high: 12, better: "low", note: "Where the rate has run since 1990." }, group: "us_economy", name: "US unemployment rate", unit: "pct", cadence: "monthly", about: "The share of the labour force out of work and looking, seasonally adjusted (BLS LNS14000000, else FRED UNRATE).", feed: { kind: "sources", sources: [{ kind: "bls", series: "LNS14000000" }, { kind: "fred", id: "UNRATE" }] } },
  { symbol: "SENTIMENT", scale: { low: 50, high: 110, better: "high", note: "1966 = 100." }, group: "us_economy", name: "Consumer sentiment (Michigan)", unit: "number", cadence: "monthly", about: "The University of Michigan's index of consumer sentiment, 1966 = 100 (else FRED UMCSENT).", feed: { kind: "sources", sources: [{ kind: "umich" }, { kind: "fred", id: "UMCSENT" }] } },
  { symbol: "FEARGREED", scale: { low: 0, high: 100, better: null, note: "Under 25 extreme fear, over 75 extreme greed." }, group: "us_economy", name: "Fear and greed (CNN)", unit: "number", about: "CNN's fear and greed index from seven market gauges, 0 (extreme fear) to 100 (extreme greed); under 25 is extreme fear, over 75 extreme greed.", feed: { kind: "sources", sources: [{ kind: "cnn_fg" }] } },
  { symbol: "TAXREC", group: "us_economy", name: "Federal income tax receipts, $bn a year", unit: "number", cadence: "monthly", transform: "sum12", about: "Individual income taxes the US Treasury collected, net of refunds, over the twelve months to each month, in billions of dollars (Monthly Treasury Statement, table 4). Falling receipts have come before recessions.", feed: { kind: "sources", sources: [{ kind: "mts", line: "Total -- Individual Income Taxes" }] } },
  { symbol: "SSEC", group: "world_equity", name: "China, Shanghai Composite", unit: "number", about: "Shanghai Stock Exchange Composite, close in yuan (Yahoo Finance 000001.SS, else stooq ^shc).", feed: yahooThen("000001.SS", { kind: "stooq", symbol: "^shc" }) },
];

export const marketDef = (symbol: string): MarketDef | null => MARKETS.find((m) => m.symbol === symbol.toUpperCase()) ?? null;

/** The range a market card draws its reading on: the indicator's known scale when the catalogue has one, else its own one-year low to high (Hamza, 19 Oct 2026: every metric card gets a range). */
export type RangeSpec = { low: number; high: number; better: "high" | "low" | null; note: string; source: "scale" | "year"; /** Where the reading sits, 0 at the low and 100 at the high, clamped. */ pct: number };

const place = (value: number, low: number, high: number) => (high > low ? Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100)) : 50);

/** A reading of an indicator's level on its range, or null when neither a scale nor a year's range exists. */
export function rangeOf(row: Pick<MarketRow, "symbol" | "low1y" | "high1y">, value: number, def: MarketDef | null = marketDef(row.symbol)): RangeSpec | null {
  if (def?.scale) return { ...def.scale, source: "scale", pct: place(value, def.scale.low, def.scale.high) };
  if (row.high1y > row.low1y) return { low: row.low1y, high: row.high1y, better: null, note: "Its one-year low to high.", source: "year", pct: place(value, row.low1y, row.high1y) };
  return null;
}

/** The symmetric scales a change is drawn on, by span: a move past them is off the end. */
const CHANGE_SCALES: Record<string, number> = { market_change_1d_pct: 5, market_change_1m_pct: 15, market_change_1y_pct: 40 };

/** A market figure's range: a level on the indicator's scale or year, a change on a symmetric scale for its span, a place in the year's range on 0 to 100; null for a figure the bar cannot say anything about. */
export function marketRangeOf(read: { symbol: string; field: string } | null, rows: readonly MarketRow[], value: number | null): RangeSpec | null {
  if (!read || value === null) return null;
  const row = rows.find((r) => r.symbol === read.symbol.toUpperCase());
  if (!row) return null;
  if (read.field === "market_level") return rangeOf(row, value);
  const span = CHANGE_SCALES[read.field];
  // A change is better in the indicator's own direction (a falling VIX, a rising index), and has none where the level has none (the gold to silver ratio, a yield, the yield curve; Hamza, 19 Oct 2026).
  const def = marketDef(row.symbol);
  const better = def?.scale ? def.scale.better : def?.group === "us_equity" || def?.group === "world_equity" ? "high" : null;
  if (span) return { low: -span, high: span, better, note: `A move of ${span}% either way fills the bar.`, source: "scale", pct: place(value, -span, span) };
  if (read.field === "market_range_pct") return { low: 0, high: 100, better: null, note: "0 at the one-year low, 100 at the high.", source: "scale", pct: place(value, 0, 100) };
  return null;
}

// ---------------------------------------------------------------------------
// Shapes

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const point = z.object({ date: isoDate, value: z.number() });
export type MarketPoint = z.infer<typeof point>;

export const marketRowSchema = z.object({
  symbol: z.enum(MARKET_SYMBOLS),
  name: z.string(),
  unit: z.enum(["number", "pct", "money", "ratio"]),
  level: z.number(),
  /** Change over one session, one month (21 sessions) and one year (252 sessions), as a percentage; null when the series is too short. */
  change1dPct: z.number().nullable(),
  change1mPct: z.number().nullable(),
  change1yPct: z.number().nullable(),
  /** Change in level over the same spans, for yields and spreads where points matter more than percentages. */
  change1d: z.number().nullable(),
  change1m: z.number().nullable(),
  change1y: z.number().nullable(),
  low1y: z.number(),
  high1y: z.number(),
  /** Where the level sits in its one-year range: 0 at the low, 100 at the high. */
  rangePct: z.number().nullable(),
  asOf: isoDate,
});
export type MarketRow = z.infer<typeof marketRowSchema>;

export const marketsSchema = z.object({
  /** The newest date any indicator has. */
  asOf: isoDate,
  source: z.string(),
  rows: z.array(marketRowSchema),
  /** The price series behind each row, oldest first, about a year of sessions. */
  series: z.record(z.string(), z.array(point)),
  /** One sentence per indicator that could not be read. */
  problems: z.array(z.string()),
});
export type Markets = z.infer<typeof marketsSchema>;

export const EMPTY_MARKETS: Markets = { asOf: "1970-01-01", source: "none", rows: [], series: {}, problems: [] };

// ---------------------------------------------------------------------------
// The two CSV formats

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A stooq daily file: Date,Open,High,Low,Close,Volume. Throws when the text is not that file. */
export function parseStooq(text: string): MarketPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0]?.split(",").map((s) => s.trim().toLowerCase()) ?? [];
  const d = head.indexOf("date");
  const c = head.indexOf("close");
  if (d < 0 || c < 0) throw new Error("not a stooq daily file");
  const out: MarketPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = cells[d]?.trim();
    const value = Number(cells[c]);
    if (!DATE.test(date ?? "") || !Number.isFinite(value) || value <= 0) continue;
    out.push({ date: date!, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/**
 * A multpl table page: rows of a date ("Jun 30, 2026") and a value
 * ("295.36", "3.84%", "† (Estimate) 3.75%"). Tags and entities are dropped,
 * the first number after the date is the value. Throws when no row reads, so
 * a changed page is a sentence, never an empty indicator.
 */
export function parseMultpl(html: string): MarketPoint[] {
  const out: MarketPoint[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map((c) => c.replace(/<[^>]+>/g, " ").replace(/&[#\w]+;/g, " ").replace(/\s+/g, " ").trim());
    if (cells.length < 2) continue;
    const d = cells[0].match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/);
    const n = cells[1].replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!d || !n || !MONTHS[d[1].toLowerCase()]) continue;
    const value = Number(n[0]);
    if (!Number.isFinite(value)) continue;
    out.push({ date: `${d[3]}-${MONTHS[d[1].toLowerCase()]}-${d[2].padStart(2, "0")}`, value });
  }
  if (!out.length) throw new Error("not a multpl table");
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Earnings yield by day: for each close of the index, the latest earnings
 * dated on or before that day over the close, in percent. Days before the
 * first earnings are left out; a close at or below zero is skipped.
 */
export function earningsYield(eps: readonly MarketPoint[], index: readonly MarketPoint[]): MarketPoint[] {
  const e = [...eps].filter((p) => p.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  const out: MarketPoint[] = [];
  let i = -1;
  for (const p of [...index].sort((a, b) => a.date.localeCompare(b.date))) {
    while (i + 1 < e.length && e[i + 1].date <= p.date) i++;
    if (i < 0 || p.value <= 0) continue;
    out.push({ date: p.date, value: Math.round((e[i].value / p.value) * 1e6) / 1e4 });
  }
  return out;
}

/** A FRED fredgraph.csv: observation_date (or DATE),<series>; "." where the day has no value. Throws when the text is not that file. */
export function parseFred(text: string): MarketPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0]?.split(",").map((s) => s.trim().toLowerCase()) ?? [];
  if (head.length < 2 || !["date", "observation_date"].includes(head[0])) throw new Error("not a FRED csv");
  const out: MarketPoint[] = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(",").map((s) => s.trim());
    if (!DATE.test(date ?? "") || raw === "." || raw === "" || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date: date!, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** A Yahoo Finance chart answer: timestamps (seconds, UTC) against closes, nulls on holidays. Throws when the JSON is not a chart. */
export function parseYahoo(text: string): MarketPoint[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not a Yahoo chart");
  }
  const r = yahooSchema.safeParse(json);
  if (!r.success || !r.data.chart.result?.length) throw new Error("not a Yahoo chart");
  const { timestamp, indicators } = r.data.chart.result[0];
  const closes = indicators.quote[0]?.close ?? [];
  const out: MarketPoint[] = [];
  timestamp.forEach((t, i) => {
    const value = closes[i];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
    out.push({ date: new Date(t * 1000).toISOString().slice(0, 10), value });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const yahooSchema = z.object({
  chart: z.object({
    result: z.array(z.object({ timestamp: z.array(z.number()), indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()) })) }) })).nullable(),
  }),
});

// ---------------------------------------------------------------------------
// Figures from a series

const SESSIONS_1M = 21;
const SESSIONS_1Y = 252;

function changes(pts: MarketPoint[], back: number): { pct: number | null; abs: number | null } {
  const last = pts[pts.length - 1];
  const then = pts[pts.length - 1 - back];
  if (!last || !then) return { pct: null, abs: null };
  return { pct: then.value === 0 ? null : ((last.value - then.value) / Math.abs(then.value)) * 100, abs: last.value - then.value };
}

/** An ISO date moved by whole months, the day kept where the month has it (31 Mar less a month is 28 or 29 Feb). */
export function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, days))).toISOString().slice(0, 10);
}

/** The change to the last point from the last point on or before a date; none when the series does not reach back that far. */
function changeSince(pts: MarketPoint[], date: string): { pct: number | null; abs: number | null } {
  const last = pts[pts.length - 1];
  let then: MarketPoint | undefined;
  for (const p of pts) if (p.date <= date) then = p;
  if (!last || !then || then === last) return { pct: null, abs: null };
  return { pct: then.value === 0 ? null : ((last.value - then.value) / Math.abs(then.value)) * 100, abs: last.value - then.value };
}

/**
 * The row for one indicator from its series (oldest first); null for an
 * empty series. A daily indicator changes over one session, 21 and 252; a
 * weekly or monthly one over its last reading, a calendar month and a
 * calendar year, so `change1d` is the change since the reading before.
 */
export function rowFrom(def: MarketDef, pts: MarketPoint[]): MarketRow | null {
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const daily = cadenceOf(def) === "daily";
  const yearAgo = monthsBefore(last.date, 12);
  const year = daily ? pts.slice(-SESSIONS_1Y) : pts.filter((p) => p.date > yearAgo);
  const low1y = Math.min(...year.map((p) => p.value));
  const high1y = Math.max(...year.map((p) => p.value));
  const d1 = changes(pts, 1);
  const m1 = daily ? changes(pts, SESSIONS_1M) : changeSince(pts, monthsBefore(last.date, 1));
  const y1 = daily ? changes(pts, SESSIONS_1Y) : changeSince(pts, yearAgo);
  return {
    symbol: def.symbol,
    name: def.name,
    unit: def.unit,
    level: last.value,
    change1dPct: d1.pct,
    change1mPct: m1.pct,
    change1yPct: y1.pct,
    change1d: d1.abs,
    change1m: m1.abs,
    change1y: y1.abs,
    low1y,
    high1y,
    rangePct: high1y === low1y ? null : ((last.value - low1y) / (high1y - low1y)) * 100,
    asOf: last.date,
  };
}

/** Two series combined day by day where both have a point. */
function combineDaily(a: MarketPoint[], b: MarketPoint[], f: (x: number, y: number) => number | null): MarketPoint[] {
  const byDate = new Map(b.map((p) => [p.date, p.value]));
  const out: MarketPoint[] = [];
  for (const p of a) {
    const y = byDate.get(p.date);
    if (y === undefined) continue;
    const v = f(p.value, y);
    if (v !== null && Number.isFinite(v)) out.push({ date: p.date, value: Math.round(v * 1e4) / 1e4 });
  }
  return out;
}

/** The standard normal distribution function (Abramowitz and Stegun 26.2.17, error under 1e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** The New York Fed's probit on the 10-year less 3-month spread, in percent, from the spread averaged over the 21 sessions to each day. */
export function recessionProbability(spread: readonly MarketPoint[]): MarketPoint[] {
  const out: MarketPoint[] = [];
  for (let i = SESSIONS_1M - 1; i < spread.length; i++) {
    const month = spread.slice(i - SESSIONS_1M + 1, i + 1);
    const avg = month.reduce((s, p) => s + p.value, 0) / month.length;
    out.push({ date: spread[i].date, value: Math.round(normalCdf(-0.5333 - 0.633 * avg) * 1e4) / 100 });
  }
  return out;
}

/**
 * The history an indicator keeps: a daily one a year of sessions plus the
 * month the one-year change needs; anything with `years` (or a weekly or
 * monthly one, five years by default) that many calendar years plus a month.
 */
export function keepFor(def: MarketDef, pts: MarketPoint[]): MarketPoint[] {
  const years = def.years ?? (cadenceOf(def) === "daily" ? 0 : 5);
  if (!years) return pts.slice(-(SESSIONS_1Y + SESSIONS_1M + 1));
  const last = pts[pts.length - 1];
  if (!last) return pts;
  const from = monthsBefore(last.date, years * 12 + 1);
  return pts.filter((p) => p.date >= from);
}

/** What the feed returned for one fetched indicator: its series, or a sentence on why there is none. */
export type Fetched = { symbol: MarketSymbol; points?: MarketPoint[]; problem?: string };

/**
 * The markets object from what the feed returned: a row and a series per
 * indicator that came back, the derived ones computed from them, and a
 * sentence per indicator that did not. Sessions beyond a year plus a month
 * are dropped so the one-year change still has its base.
 */
export function buildMarkets(fetched: readonly Fetched[], source: string): Markets {
  const series: Record<string, MarketPoint[]> = {};
  const problems: string[] = [];
  const got = new Map(fetched.map((f) => [f.symbol, f]));
  for (const def of MARKETS) {
    const feed = def.feed;
    let pts: MarketPoint[] | null = null;
    if (feed.kind === "sources") {
      const f = got.get(def.symbol);
      if (!f) problems.push(`${def.name} was not asked for.`);
      else if (f.problem) problems.push(f.problem);
      else if (!f.points?.length) problems.push(`${def.name} came back empty.`);
      else pts = def.transform === "yoy" ? yearOnYear(f.points) : def.transform === "sum12" ? trailingYear(f.points) : f.points;
      if (pts && !pts.length) {
        problems.push(`${def.name} came back too short to compare with a year before.`);
        pts = null;
      }
    } else if (feed.kind === "ratio" || feed.kind === "difference") {
      const [x, y] = feed.kind === "ratio" ? [feed.num, feed.den] : [feed.a, feed.b];
      const a = series[x];
      const b = series[y];
      if (!a || !b) problems.push(`${def.name} needs ${marketDef(x)?.name ?? x} and ${marketDef(y)?.name ?? y}.`);
      else pts = combineDaily(a, b, feed.kind === "ratio" ? (p, q) => (q === 0 ? null : p / q) : (p, q) => p - q);
      if (pts && !pts.length) {
        problems.push(`${def.name} has no day where both series have a value.`);
        pts = null;
      }
    } else if (feed.kind === "recession") {
      const spread = series[feed.spread];
      if (!spread) problems.push(`${def.name} needs ${marketDef(feed.spread)?.name ?? feed.spread}.`);
      else pts = recessionProbability(spread);
      if (pts && !pts.length) {
        problems.push(`${def.name} needs a month of the spread.`);
        pts = null;
      }
    } else {
      problems.push(`${def.name} needs ${feed.needs}.`);
    }
    if (pts) series[def.symbol] = keepFor(def, pts);
  }
  const rows = MARKETS.map((def) => (series[def.symbol] ? rowFrom(def, series[def.symbol]) : null)).filter((r): r is MarketRow => r !== null);
  const asOf = rows.reduce((d, r) => (r.asOf > d ? r.asOf : d), "1970-01-01");
  return { asOf, source, rows, series, problems };
}

// ---------------------------------------------------------------------------
// Into a book

type SeriesLike = { nav: MarketPoint[]; benchmarks: Record<string, MarketPoint[]>; source: string };
type BookLike = { series?: SeriesLike; markets?: Markets };

/**
 * Lays the markets on a book and lends its series to the benchmarks the
 * methodology names (SPY, QQQ, VIX...) when the book carries none of its
 * own. A series the broker's file supplied is kept; the feed never replaces
 * it. Pure; the vault's copy of the book is untouched.
 */
export function withMarkets<B extends BookLike>(book: B, markets: Markets, named: readonly string[]): B {
  const benchmarks = { ...(book.series?.benchmarks ?? {}) };
  let lent = 0;
  for (const s of named) {
    const key = s.toUpperCase();
    if ((benchmarks[s]?.length ?? 0) > 0 || (benchmarks[key]?.length ?? 0) > 0) continue;
    const pts = markets.series[key];
    if (pts?.length) {
      benchmarks[s] = pts;
      lent += 1;
    }
  }
  if (!lent) return { ...book, markets };
  // Spread first, so closes per holding the book already carries survive.
  const series: SeriesLike = { ...book.series, nav: book.series?.nav ?? [], benchmarks, source: [book.series?.source, markets.source].filter(Boolean).join(" + ") };
  return { ...book, markets, series };
}

/** The symbol a figure's market filters name (market_symbol eq or in), uppercased. */
export function marketSymbolsIn(where: readonly { field: string; is: string; value?: unknown }[]): string[] {
  const out: string[] = [];
  for (const w of where) {
    if (w.field !== "market_symbol" || (w.is !== "eq" && w.is !== "in")) continue;
    for (const v of Array.isArray(w.value) ? w.value : [w.value]) if (typeof v === "string" && !out.includes(v.toUpperCase())) out.push(v.toUpperCase());
  }
  return out;
}

/** A level in its unit, for the board. */
export function formatLevel(value: number | null, unit: MarketUnit): string {
  if (value === null) return "n/a";
  switch (unit) {
    case "pct":
      return `${value.toFixed(2)}%`;
    case "money":
      return value >= 1000 ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : value.toFixed(2);
    case "ratio":
      return `${value.toFixed(1)}x`;
    case "number":
      return value.toFixed(2);
  }
}

/** What a price is quoted per, where it is a commodity's. */
const PER: Partial<Record<string, string>> = { GOLD: "/oz", SILVER: "/oz", WTI: "/bbl" };

/**
 * A methodology figure that reads one indicator, written in the indicator's
 * own unit so it never shows a bare number: a yield in percent and its change
 * in basis points, a price in dollars with what it is quoted per, a ratio as
 * a multiple, an index in points, billions as billions. Null for a field this
 * does not know, so the figure keeps its own unit.
 */
export function formatMarketFigure(symbol: string, field: string, value: number | null): string | null {
  const def = MARKETS.find((d) => d.symbol === symbol.toUpperCase());
  if (!def || value === null) return value === null && def ? "n/a" : null;
  const bn = /\$bn/.test(def.name);
  const level = (v: number, signed = false): string => {
    const sign = signed ? (v > 0 ? "+" : v < 0 ? "-" : "") : v < 0 ? "-" : "";
    const a = Math.abs(v);
    switch (def.unit) {
      case "pct":
        return `${sign}${a.toFixed(2)}%`;
      case "money":
        return `${sign}$${a >= 1000 ? a.toLocaleString("en-US", { maximumFractionDigits: 0 }) : a.toFixed(2)}${PER[def.symbol] ? ` ${PER[def.symbol]}` : ""}`;
      case "ratio":
        return `${sign}${a.toFixed(1)}x`;
      case "number":
        return bn ? `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}bn` : `${sign}${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
    }
  };
  if (field === "market_level" || field === "market_1y_low" || field === "market_1y_high") return level(value);
  if (/^market_change_1[dmy]_pct$/.test(field)) return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  if (/^market_change_1[dmy]$/.test(field)) {
    if (def.symbol === "RECPROB" || def.symbol === "FEARGREED") return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
    if (def.unit === "pct") return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)} bp`;
    return level(value, true);
  }
  return null;
}

/** A change for the board: basis points for yields and spreads, points for the recession probability and the fear and greed index, a percentage for the rest. */
export function formatChange(row: MarketRow, span: "1d" | "1m" | "1y"): string {
  const pct = span === "1d" ? row.change1dPct : span === "1m" ? row.change1mPct : row.change1yPct;
  const abs = span === "1d" ? row.change1d : span === "1m" ? row.change1m : row.change1y;
  // A probability moves in percentage points, never basis points.
  if (row.symbol === "RECPROB" || row.symbol === "FEARGREED") return abs === null ? "n/a" : `${abs >= 0 ? "+" : ""}${abs.toFixed(1)} pts`;
  if (row.unit === "pct") return abs === null ? "n/a" : `${abs >= 0 ? "+" : ""}${(abs * 100).toFixed(0)} bp`;
  return pct === null ? "n/a" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Closes per holding

/**
 * The Yahoo Finance symbol for a listed holding's ticker: a share class
 * written with a space or a dot (BRK B, BRK.B) takes a dash. Null for what is
 * not a plain ticker (an option symbol, an ISIN, a private asset's name), so
 * nothing but a ticker ever goes in a URL.
 */
export function yahooSymbol(symbol: string): string | null {
  const s = symbol.trim().toUpperCase().replace(/[ .]/g, "-");
  return /^[A-Z][A-Z0-9]{0,5}(-[A-Z])?$/.test(s) ? s : null;
}

/** The daily closes of the listed holdings the feed read, with a sentence for each it could not. */
export type Closes = { asOf: string; source: string; series: Record<string, MarketPoint[]>; problems: string[] };
export const EMPTY_CLOSES: Closes = { asOf: "1970-01-01", source: "none", series: {}, problems: [] };

/**
 * Lays the feed's closes on a book as `series.holdings`, for the symbols the
 * book carries none for; a source's own closes are kept. Pure; the vault's
 * copy of the book is untouched.
 */
export function withCloses<B extends BookLike & { series?: SeriesLike & { holdings?: Record<string, MarketPoint[]> } }>(book: B, closes: Closes): B {
  const have = { ...(book.series?.holdings ?? {}) };
  let added = 0;
  for (const [symbol, pts] of Object.entries(closes.series)) {
    if ((have[symbol]?.length ?? 0) > 0 || !pts.length) continue;
    have[symbol] = pts;
    added += 1;
  }
  if (!added) return book;
  const series = { nav: book.series?.nav ?? [], benchmarks: book.series?.benchmarks ?? {}, holdings: have, source: [book.series?.source, `closes from ${closes.source}`].filter(Boolean).join(" + ") };
  return { ...book, series };
}

// ---------------------------------------------------------------------------
// CNN's fear and greed index on a gauge (Hamza, 16 Oct 2026)

/** CNN's own bands: up to 25 extreme fear, to 45 fear, to 55 neutral, to 75 greed, above that extreme greed. */
export const FEAR_GREED_BANDS = [
  { to: 25, label: "Extreme fear", side: "fear" },
  { to: 45, label: "Fear", side: "fear" },
  { to: 55, label: "Neutral", side: "neutral" },
  { to: 75, label: "Greed", side: "greed" },
  { to: 100, label: "Extreme greed", side: "greed" },
] as const;
export type FearGreedBand = (typeof FEAR_GREED_BANDS)[number];

/** The band a score falls in; a score at a boundary belongs to the band above it, as CNN draws it (25 is fear). */
export function fearGreedBand(value: number): FearGreedBand {
  return FEAR_GREED_BANDS.find((b, i) => value < b.to || i === FEAR_GREED_BANDS.length - 1) ?? FEAR_GREED_BANDS[0];
}

export type FearGreedPoint = { value: number; date: string; label: string };
export type FearGreedView = { now: FearGreedPoint; previous: FearGreedPoint | null; weekAgo: FearGreedPoint | null; monthAgo: FearGreedPoint | null; yearAgo: FearGreedPoint | null };

/**
 * The gauge's readings from the index's daily series: the latest score, the
 * close before it, and the last score on or before a week, a month and a
 * year earlier, each with its band's name. Null when the series is empty;
 * a lookback the series does not reach is null, never a guess.
 */
export function fearGreedView(points: readonly MarketPoint[]): FearGreedView | null {
  const sorted = [...points].filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const at = (p: MarketPoint): FearGreedPoint => ({ value: Math.round(p.value), date: p.date, label: fearGreedBand(p.value).label });
  const last = sorted[sorted.length - 1];
  const back = (days: number): FearGreedPoint | null => {
    let best: MarketPoint | null = null;
    for (const p of sorted) if (daysBetween(p.date, last.date) >= days && (!best || p.date > best.date)) best = p;
    return best ? at(best) : null;
  };
  return { now: at(last), previous: sorted.length > 1 ? at(sorted[sorted.length - 2]) : null, weekAgo: back(7), monthAgo: back(30), yearAgo: back(365) };
}
