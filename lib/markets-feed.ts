import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { cache } from "react";

import { closedBy, completeDay, DAY_INDICES, marketDaySchema, moveOn, parseNasdaqCaps, parseYahooIntraday, sessionOf, type DayMove, type IndexDay, type MarketDay, type OtherMove } from "@/lib/market-day";
import { addDays, calendarReach, demoEarnings, EARNINGS_AHEAD_DAYS, EARNINGS_BACK_DAYS, earningsCalendarSchema, parseNasdaqEarnings, weekdaysBetween, type EarningsCalendar, type EarningsFile, type EarningsRow } from "@/lib/earnings";
import { buildEconomies, ECONOMIES, ECONOMY_FIGURE, economiesSchema, IMF, OECD_OUTLOOK, parseBisRates, parseImf, parseOecdOutlook, parseOecdSeries, type Economies, type EconomyInputs, type ImfKey } from "@/lib/economies";
import { ecbCross, parseBls, parseEcbDaily, parseFearGreed, parseMtsReceipts, parseNyFedRates, parsePmms, parseSoma, parseTreasuryPar, parseUmich } from "@/lib/macro-sources";
import { creditsForNames, feedShut, foldShut, isShut, licensedOnly } from "@/lib/licences";
import { buildMarkets, cadenceOf, earningsYield, MARKETS, marketsSchema, parseFred, parseMultpl, parseStooq, parseYahoo, yahooSymbol, type Closes, type Fetched, type MarketPoint, type Markets, type Source } from "@/lib/markets";
import { acceptedUnix, EXTENDED_MAX_SYMBOLS, EXTENDED_POLL_SECONDS, EXTENDED_RANGE, extendedMove, parseExtendedChart, sinceResults, type ExtendedAnswer, type ExtendedChart, type SinceAsk } from "@/lib/extended-hours";
import { indexNow, isTradingHours, lastSession, LIVE_MAX_SYMBOLS, LIVE_POLL_SECONDS, LIVE_SESSION_POLL_SECONDS, liveSession, parseYahooQuote, parseYahooSpark, SPARK_BATCH, type LiveQuote, type SparkQuote } from "@/lib/live";
import { loadGics } from "@/lib/sectors-feed";
import { storageMode } from "@/lib/storage";
import { demoNews, demoNewsSchema, parseRss, type NewsItem } from "@/lib/company-news";
import { CBOE_QUOTES, expectedMove, parseCboeChain, type ExpectedMove } from "@/lib/expected-move";
import { nextFomc, type EconEvent } from "@/lib/econ-calendar";
import { betSourceWords, chooseBet, fedBet, kalshiBet, noBetWords, oddsQuery, polymarketBet, type EventBet } from "@/lib/event-odds";
import { macroKey } from "@/lib/macro-report";
import { expandSampleCloses, pickSampleCloses, sampleBetFor, sampleClosesSchema, sampleEventBetsSchema, sampleOdds, type SampleCloses } from "@/lib/demo-markets";
import { deeperFed, fedOdds, fedOddsGap, KALSHI_EVENT, KALSHI_FED, KALSHI_MAX_PAGES, KALSHI_NEXT, kalshiCursor, kalshiEvent, oddsSchema, parseKalshiFed, parsePolymarketFed, parsePolymarketRecession, POLYMARKET_FED, POLYMARKET_SEARCH, type Odds } from "@/lib/odds";
import { consensusOf, parseNasdaqForecast, type Consensus } from "@/lib/forward";
import { COT_MARKETS, cotUrl, MMF_SERIES, mmfUrl, parseCot, parseOfrSeries, parseTicTable1, TIC_URL, type CotWeek, type TicMonth } from "@/lib/flows";
import { FINRA_FILE, parseShortFile, PUBLISHED_AFTER_DAYS, settlementDates, type ShortInterest } from "@/lib/short-interest";

/**
 * The market feed, read-only: public daily sources with no key and no
 * account, each indicator's sources tried in order until one answers, the
 * body kept an hour by Next.js and read once per request. Nothing about the
 * person goes out: the URL names the indicator and a date range, nothing
 * else. An indicator that cannot be read is a sentence on the Markets screen
 * and the rest still show; a source that refused is not asked again for ten
 * minutes, so a dead source never holds a page. A page waits a short budget
 * for the sources and no longer: whatever has not answered by then keeps
 * loading after the response (`after`), its last good reading on this
 * instance stands in meanwhile, and the next page has it. A reading under an
 * hour old is served as it is, with no wait at all; an older one stands in
 * while the sources are asked again behind the response. The demo reads a
 * fictional sample and never fetches.
 *
 *   Yahoo  https://query1.finance.yahoo.com/v8/finance/chart/GC=F?period1=...&period2=...&interval=1d
 *   FRED   https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS&cosd=...
 *   stooq  https://stooq.com/q/d/l/?s=xauusd&d1=yyyymmdd&d2=yyyymmdd&i=d
 *   multpl https://www.multpl.com/s-p-500-earnings/table/by-month (S&P 500
 *          trailing reported earnings, monthly; over ^GSPC for the yield)
 *
 * Beside the prices, the macro series, each from its publisher, keyless:
 *
 *   NY Fed   https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=...
 *            (and secured/sofr), https://markets.newyorkfed.org/api/soma/summary.json
 *   Freddie  https://www.freddiemac.com/pmms/docs/PMMS_history.csv
 *   BLS      https://api.bls.gov/publicAPI/v1/timeseries/data/ (POST: the series and years;
 *            25 questions a day an address, so a monthly series is asked twice a day at most)
 *   Michigan https://www.sca.isr.umich.edu/files/tbmics.csv
 *   CNN      https://production.dataviz.cnn.io/index/fearandgreed/graphdata/<from>
 *   Treasury https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_4
 *
 * The same Yahoo chart reads the daily closes of the listed holdings
 * (`loadCloses`), for the correlation matrix and the review's contribution:
 * the ticker and the date range alone in the URL, never a quantity or a value.
 *
 * The last session (`loadMarketDay`) reads the same Yahoo chart for every
 * S&P 500 company over the ten days to the session, once the session has
 * closed, and the four US indices at five-minute steps through it; the
 * market values that size the heat map come from the Nasdaq stock screener,
 * one public file with no key:
 *
 *   Nasdaq https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&download=true
 *   Nasdaq https://api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD (the earnings calendar, one day a page)
 *   Nasdaq https://api.nasdaq.com/api/analyst/AAPL/earnings-forecast (the analysts' consensus, one company a page)
 *
 * From Vercel, FRED never answers and stooq answers 403 (seen in the
 * function logs, 12 and 13 Oct 2026); Yahoo Finance answers. So every
 * indicator lists a Yahoo symbol first and keeps FRED behind it.
 *
 * On a deployment that shows licensed sources alone (SOURCES=licensed, the
 * beta's; lib/licences.ts), every address is put to `feedShut` before it is
 * fetched: a shut source is never asked, and its sentence says why, once per
 * card (`foldShut`). The Treasury's par yield curve stands in for Yahoo's
 * yields and the ECB's reference rates for its currency pairs.
 */

const REVALIDATE_SECONDS = 60 * 60;
/** A weekly or monthly series is asked again after twelve hours, not one: it changes at most once a week, and the BLS counts every question. */
const SLOW_REVALIDATE_SECONDS = 12 * 60 * 60;
/** How long a source may take to answer; FRED can take ten seconds for a year of a series. */
const TIMEOUT_MS = 15_000;
/** How long a page waits for the sources before it renders with what has answered. */
const BUDGET_MS = 2_500;
/** How long a reading kept in memory stands in for a source that is still answering. */
const KEEP_MS = 24 * 60 * 60 * 1000;
/** How long a source that failed is left alone before it is asked again. */
const BACKOFF_MS = 10 * 60 * 1000;
/** A year of sessions plus the month the one-year change needs, in calendar days. */
const LOOKBACK_DAYS = 400;

const dayBefore = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The fetchable sources: every kind but the composed earnings yield, which asks two of them. */
type Plain = Exclude<Source, { kind: "eps_yield" }>;

/** How long an indicator's reading stays fresh, in seconds. */
const freshFor = (def: (typeof MARKETS)[number]) => (cadenceOf(def) === "daily" ? REVALIDATE_SECONDS : SLOW_REVALIDATE_SECONDS);

/** How far back an indicator is asked for: a year and a month, or its years of history plus the year a change on a year before needs. */
const lookbackFor = (def: (typeof MARKETS)[number]) => {
  const years = def.years ?? (cadenceOf(def) === "daily" ? 0 : 5);
  return years ? (years + (def.transform ? 1 : 0)) * 366 + 40 : LOOKBACK_DAYS;
};

const TREASURY = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_4";
/** The Treasury's daily par yield curve for one year, as CSV; the year alone in the URL. */
const TREASURY_PAR = (year: string) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
/** The ECB's euro reference rates of the last working day. */
const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

function urlFor(src: Plain, today: string, days = LOOKBACK_DAYS): string {
  const from = dayBefore(today, days);
  if (src.kind === "nyfed") return `https://markets.newyorkfed.org/api/rates/${src.rate === "effr" ? "unsecured" : "secured"}/${src.rate}/search.json?startDate=${from}&endDate=${today}`;
  if (src.kind === "soma") return "https://markets.newyorkfed.org/api/soma/summary.json";
  if (src.kind === "pmms") return "https://www.freddiemac.com/pmms/docs/PMMS_history.csv";
  if (src.kind === "bls") return "https://api.bls.gov/publicAPI/v1/timeseries/data/";
  if (src.kind === "umich") return "https://www.sca.isr.umich.edu/files/tbmics.csv";
  if (src.kind === "cnn_fg") return `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${from}`;
  if (src.kind === "mts") return `${TREASURY}?filter=${encodeURIComponent(`classification_desc:eq:${src.line},record_date:gte:${from}`)}&fields=record_date,current_month_net_rcpt_amt&sort=record_date&page[size]=400`;
  // The table and nothing else: no date range, nothing of the person.
  if (src.kind === "multpl") return `https://www.multpl.com/${encodeURIComponent(src.table)}/table/by-month`;
  if (src.kind === "treasury") return TREASURY_PAR(today.slice(0, 4));
  if (src.kind === "fred") return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(src.id)}&cosd=${from}`;
  if (src.kind === "stooq") return `https://stooq.com/q/d/l/?s=${encodeURIComponent(src.symbol)}&d1=${from.replaceAll("-", "")}&d2=${today.replaceAll("-", "")}&i=d`;
  const p1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
  const p2 = Math.floor(Date.parse(`${today}T00:00:00Z`) / 1000) + 86_400;
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(src.symbol)}?period1=${p1}&period2=${p2}&interval=1d&events=history`;
}

const NAMES: Record<Plain["kind"], string> = { fred: "FRED", stooq: "stooq", multpl: "multpl", yahoo: "Yahoo Finance", nyfed: "the New York Fed", soma: "the New York Fed", pmms: "Freddie Mac", bls: "the BLS", umich: "the University of Michigan", cnn_fg: "CNN", mts: "the US Treasury", treasury: "the US Treasury" };
const sourceName = (src: Plain) => NAMES[src.kind];
const sourceKey = (src: Plain) => {
  switch (src.kind) {
    case "fred":
      return `fred:${src.id}`;
    case "multpl":
      return `multpl:${src.table}`;
    case "stooq":
    case "yahoo":
      return `${src.kind}:${src.symbol}`;
    case "nyfed":
      return `nyfed:${src.rate}`;
    case "bls":
      return `bls:${src.series}`;
    case "mts":
      return `mts:${src.line}`;
    case "treasury":
      return `treasury:${src.tenor}`;
    default:
      return src.kind;
  }
};

/** The text a source sent, as points; throws when it is not that source's file. */
function parseFor(src: Plain, text: string): MarketPoint[] {
  switch (src.kind) {
    case "fred":
      return parseFred(text);
    case "stooq":
      return parseStooq(text);
    case "multpl":
      return parseMultpl(text);
    case "yahoo":
      return parseYahoo(text);
    case "nyfed":
      return parseNyFedRates(text);
    case "soma":
      return parseSoma(text);
    case "pmms":
      return parsePmms(text);
    case "bls":
      return parseBls(text, src.series);
    case "umich":
      return parseUmich(text);
    case "cnn_fg":
      return parseFearGreed(text);
    case "mts":
      return parseMtsReceipts(text);
    case "treasury":
      return parseTreasuryPar(text, src.tenor);
  }
}

/** The request for a source: a GET for all but the BLS, which takes its series and years as a POST. */
function requestFor(src: Plain, today: string, days: number, revalidate: number): RequestInit {
  const accept = ["yahoo", "nyfed", "soma", "bls", "cnn_fg", "mts"].includes(src.kind) ? "application/json" : src.kind === "multpl" ? "text/html" : "text/csv,text/plain";
  // CNN answers a browser and refuses a bare script; the rest take an honest name.
  const agent = src.kind === "cnn_fg" ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" : "Mozilla/5.0 (compatible; Invariant market feed)";
  const base: RequestInit = { next: { revalidate }, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept, "user-agent": agent } };
  if (src.kind !== "bls") return base;
  const end = Number(today.slice(0, 4));
  // Version 1 answers ten years at most.
  const start = Math.max(end - 9, Number(dayBefore(today, days).slice(0, 4)));
  return { ...base, method: "POST", headers: { ...(base.headers as Record<string, string>), "content-type": "application/json" }, body: JSON.stringify({ seriesid: [src.series], startyear: String(start), endyear: String(end) }) };
}

/** Sources that failed lately, with when they may be asked again. One per server instance; never the data itself. */
const resting = new Map<string, { until: number; why: string }>();
/** The last good answer per indicator on this instance: public market series, nothing of anyone's portfolio. */
const lastGood = new Map<string, { points: MarketPoint[]; source: string; at: number }>();
/** Fetches still running past a page's budget, so a second page in the same second does not start them again. */
const inFlight = new Map<string, Promise<Fetched & { source?: string }>>();

type Answer = { points: MarketPoint[]; source: string } | { problem: string };

/** Earnings over the index: the earnings table, then the index's sources in order; either missing is the sentence. */
async function fetchEpsYield(src: Extract<Source, { kind: "eps_yield" }>, today: string): Promise<Answer> {
  const eps = await fetchSource(src.eps, today);
  if (!("points" in eps)) return { problem: `S&P 500 earnings: ${eps.problem}` };
  const problems: string[] = [];
  for (const ix of src.index) {
    const px = await fetchSource(ix, today);
    if (!("points" in px)) {
      problems.push(px.problem);
      continue;
    }
    const points = earningsYield(eps.points, px.points);
    if (!points.length) return { problem: "the earnings table has no month before the index's first day" };
    return { points, source: `S&P 500 earnings from multpl over the index from ${px.source}` };
  }
  return { problem: `the index: ${problems.join("; ")}` };
}

/** `logAs` names the request in a log line instead of its key, so a holding's ticker never reaches a log. */
async function fetchSource(src: Source, today: string, logAs?: string, days = LOOKBACK_DAYS, revalidate = REVALIDATE_SECONDS): Promise<Answer> {
  if (src.kind === "eps_yield") return fetchEpsYield(src, today);
  // A source this deployment may not show is never asked (lib/licences.ts).
  const shut = feedShut(urlFor(src, today, days));
  if (shut) return { problem: shut };
  if (src.kind === "treasury") return fetchTreasury(src, today, revalidate);
  const key = sourceKey(src);
  const rest = resting.get(key);
  if (rest && rest.until > Date.now()) return { problem: rest.why };
  const fail = (why: string): Answer => {
    resting.set(key, { until: Date.now() + BACKOFF_MS, why });
    return { problem: why };
  };
  const name = sourceName(src);
  let res: Response;
  try {
    res = await fetch(urlFor(src, today, days), requestFor(src, today, days, revalidate));
  } catch (e) {
    // Which failure it was, for the log and the screen: a source that never answers is not one that refused.
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const code = e instanceof Error && e.cause && typeof e.cause === "object" && "code" in e.cause ? String((e.cause as { code: unknown }).code) : null;
    console.warn(`[markets] ${logAs ?? key} ${timedOut ? "timed out" : `failed${code ? ` (${code})` : ""}`}`);
    return fail(timedOut ? `${name} did not answer within ${TIMEOUT_MS / 1000} seconds` : `${name} could not be reached`);
  }
  if (!res.ok) return fail(`${name} answered ${res.status}`);
  let text: string;
  try {
    text = await res.text();
  } catch {
    return fail(`${name}'s answer could not be read`);
  }
  try {
    const points = parseFor(src, text);
    if (!points.length) return fail(`${name} sent no days`);
    resting.delete(key);
    return { points, source: name };
  } catch {
    // A daily-limit page or an HTML error comes back as 200 text that is not the file.
    return fail(`${name} sent something other than its daily file`);
  }
}

/**
 * One tenor of the Treasury's par yield curve over this year and last, so a
 * change on a year is there in January too: the two years' files, each read
 * through `fetchSource`'s gate and kept an hour; last year's missing costs
 * only its days.
 */
async function fetchTreasury(src: Extract<Source, { kind: "treasury" }>, today: string, revalidate: number): Promise<Answer> {
  const year = Number(today.slice(0, 4));
  const read = async (y: number): Promise<MarketPoint[] | string> => {
    const url = TREASURY_PAR(String(y));
    const shut = feedShut(url);
    if (shut) return shut;
    const a = await getText(url, "the US Treasury", revalidate, "text/csv,text/plain", `treasury par ${src.tenor}`);
    if ("problem" in a) return a.problem;
    try {
      return parseTreasuryPar(a.text, src.tenor);
    } catch {
      return "the US Treasury sent something other than its par yield curve";
    }
  };
  const [now, before] = await Promise.all([read(year), read(year - 1)]);
  if (typeof now === "string") return { problem: now };
  const points = [...(typeof before === "string" ? [] : before), ...now];
  if (!points.length) return { problem: "the US Treasury sent no days" };
  return { points, source: "the US Treasury's par yield curve" };
}

/** One indicator: its sources in order until one answers; the problems of every source that did not, in one sentence. */
async function fetchOne(def: (typeof MARKETS)[number], today: string): Promise<Fetched & { source?: string }> {
  const feed = def.feed;
  if (feed.kind !== "sources") return { symbol: def.symbol, points: [] };
  const problems: string[] = [];
  for (const src of feed.sources) {
    const a = await fetchSource(src, today, undefined, lookbackFor(def), freshFor(def));
    if ("points" in a) {
      lastGood.set(def.symbol, { points: a.points, source: a.source, at: Date.now() });
      return { symbol: def.symbol, points: a.points, source: a.source };
    }
    problems.push(a.problem);
  }
  // A source shut by licence is left out of the sentence when another one failed for its own reason, so the failure is what is said; all shut, the card says so.
  const failed = problems.filter((p) => !isShut(p));
  return { symbol: def.symbol, problem: `${def.name}: ${(failed.length ? failed : problems).join("; ")}.` };
}

/** The indicator's fetch, shared by every page on this instance until it settles. */
function fetchShared(def: (typeof MARKETS)[number], today: string): Promise<Fetched & { source?: string }> {
  const key = `${def.symbol}@${today}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = fetchOne(def, today).finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

const wait = (ms: number) => new Promise<"budget">((resolve) => setTimeout(() => resolve("budget"), ms));

/**
 * One indicator within a page's budget: the answer when it comes in time;
 * otherwise the last good reading on this instance, said so, or a sentence
 * that it is still loading. The fetch itself carries on after the response.
 */
async function withinBudget(def: (typeof MARKETS)[number], today: string, budget: Promise<"budget">): Promise<Fetched & { source?: string }> {
  if (def.feed.kind !== "sources") return { symbol: def.symbol, points: [] };
  const kept = lastGood.get(def.symbol);
  const age = kept ? Date.now() - kept.at : Infinity;
  // A reading under an hour old (twelve for a weekly or monthly series) is the answer: no page waits on a source it already has.
  if (kept && age < freshFor(def) * 1000) return { symbol: def.symbol, points: kept.points, source: kept.source };
  const fetching = fetchShared(def, today);
  // An older reading stands in at once while the sources are asked again behind the response.
  if (kept && age < KEEP_MS) {
    keepAlive(fetching);
    return { symbol: def.symbol, points: kept.points, source: `${kept.source} (earlier reading)` };
  }
  const first = await Promise.race([fetching, budget]);
  if (first !== "budget") return first;
  keepAlive(fetching);
  return { symbol: def.symbol, problem: `${def.name} is still being read; it arrives on the next page.` };
}

/** Lets a fetch outlive the response on Vercel; outside a request (a script, a test) the promise simply runs on. */
function keepAlive(p: Promise<unknown>) {
  try {
    after(() => p.catch(() => undefined));
  } catch {
    p.catch(() => undefined);
  }
}

function sampleMarkets(): Markets {
  return marketsSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "markets.json"), "utf8")));
}

/** The markets as of today: the sample in the demo, the sources otherwise. Never throws; a feed that fails is a sentence. */
export const loadMarkets = cache(async (today: string): Promise<Markets> => {
  if (storageMode() === "demo") return sampleMarkets();
  const budget = wait(BUDGET_MS);
  const fetched = await Promise.all(MARKETS.map((def) => withinBudget(def, today, budget)));
  const sources = [...new Set(fetched.map((f) => f.source).filter((s): s is string => !!s))];
  // A licensed deployment names each source with the credit its terms ask for (lib/licences.ts).
  const built = buildMarkets(fetched, (licensedOnly() ? creditsForNames(sources) : sources.join(", ")) || "no source answered");
  const markets = { ...built, problems: foldShut(built.problems, "indicators") };
  for (const p of markets.problems) console.warn(`[markets] ${p}`);
  return markets;
});

// ---------------------------------------------------------------------------
// Closes per listed holding

/** An address of Yahoo's chart, to ask the licence gate whether Yahoo may be read at all. */
const YAHOO_PROBE = "https://query1.finance.yahoo.com/v8/finance/chart/SPY";

/** The last good closes per ticker on this instance: public prices, nothing of anyone's position. */
const closesKept = new Map<string, { points: MarketPoint[]; at: number }>();

async function fetchCloses(ticker: string, today: string, days: number): Promise<{ ticker: string; points?: MarketPoint[]; problem?: string }> {
  const a = await fetchSource({ kind: "yahoo", symbol: ticker }, today, "a holding's closes", days);
  if ("points" in a) {
    closesKept.set(`${ticker}:${days}`, { points: a.points, at: Date.now() });
    return { ticker, points: a.points };
  }
  return { ticker, problem: `${ticker}: ${a.problem}.` };
}

/** The demo's closes, read once per instance: the sample's calendar laid out per symbol. */
let sampleClosesRead: { raw: SampleCloses; all: Record<string, MarketPoint[]> } | null = null;
function sampleCloses(tickers: string, today: string, days: number): Closes {
  if (!sampleClosesRead) {
    const raw = sampleClosesSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "closes.json"), "utf8")));
    sampleClosesRead = { raw, all: expandSampleCloses(raw) };
  }
  return pickSampleCloses(sampleClosesRead.all, sampleClosesRead.raw, tickers, today, days);
}

/**
 * Daily closes of the listed tickers given, comma-separated (one string, so
 * a page reads them once per request), a year and a month back by default
 * or `days` back (the trade charts ask for five years). A page waits the same
 * short budget as the indicators and shows what has answered, the rest
 * arriving on the next page; the morning run (`full`) waits for every
 * ticker. A ticker that is not a plain one is never asked for. Never throws.
 */
export const loadCloses = cache(async (tickers: string, today: string, wait: "budget" | "full" = "budget", days: number = LOOKBACK_DAYS): Promise<Closes> => {
  if (storageMode() === "demo") return sampleCloses(tickers, today, days);
  const symbols = [...new Set(tickers.split(",").map((t) => t.trim()).filter(Boolean))];
  // No licensed source of daily closes yet: one sentence, never one a ticker.
  const shut = feedShut(YAHOO_PROBE);
  if (shut) return { asOf: "1970-01-01", source: "none", series: {}, problems: symbols.length ? [`${shut} Daily closes come back once a licensed price source is in.`] : [] };
  const series: Record<string, MarketPoint[]> = {};
  const problems: string[] = [];
  const asked: { symbol: string; ticker: string }[] = [];
  for (const symbol of symbols) {
    const ticker = yahooSymbol(symbol);
    if (!ticker) problems.push(`${symbol}: not a ticker the price feed knows.`);
    else asked.push({ symbol, ticker });
  }
  const budget = wait === "budget" ? (new Promise((resolve) => setTimeout(() => resolve("budget"), BUDGET_MS)) as Promise<"budget">) : null;
  const answers = await Promise.all(
    asked.map(async ({ symbol, ticker }) => {
      const kept = closesKept.get(`${ticker}:${days}`);
      if (kept && Date.now() - kept.at < REVALIDATE_SECONDS * 1000) return { symbol, points: kept.points };
      const fetching = fetchCloses(ticker, today, days);
      if (!budget) return { symbol, ...(await fetching) };
      if (kept && Date.now() - kept.at < KEEP_MS) {
        keepAlive(fetching);
        return { symbol, points: kept.points };
      }
      const first = await Promise.race([fetching, budget]);
      if (first !== "budget") return { symbol, ...first };
      keepAlive(fetching);
      return { symbol, problem: `${symbol} is still being read; it arrives on the next page.` };
    }),
  );
  for (const a of answers) {
    if (a.points?.length) series[a.symbol] = a.points.slice(-days);
    else problems.push(a.problem ?? `${a.symbol}: no closes came back.`);
  }
  // A count, never a ticker: which companies a person holds stays out of the logs.
  if (problems.length) console.warn(`[markets] closes: ${problems.length} of ${symbols.length} tickers not read`);
  const asOf = Object.values(series).reduce((d, pts) => (pts.length && pts[pts.length - 1].date > d ? pts[pts.length - 1].date : d), "1970-01-01");
  return { asOf, source: "Yahoo Finance", series, problems };
});

/**
 * Units of `base` per one unit of each currency, from Yahoo's currency pairs
 * (`EURUSD=X`): the last close. For the brokers read through a person's own
 * keys, whose holdings come in their own currencies. A pair that cannot be
 * read is a sentence, never a guessed rate. Never throws.
 */
export async function loadFxRates(currencies: readonly string[], base: string, today: string): Promise<{ rates: Record<string, number>; problems: string[] }> {
  const rates: Record<string, number> = {};
  const problems: string[] = [];
  if (storageMode() === "demo") return { rates, problems: ["The demo reads no rates."] };
  const wanted = [...new Set(currencies)].filter((c) => /^[A-Z]{3}$/.test(c) && c !== base);
  // Where Yahoo may not be read, the ECB's reference rates of the last working day, through the euro (Source: ECB statistics).
  if (feedShut(YAHOO_PROBE)) {
    if (!wanted.length) return { rates, problems };
    const a = await getText(ECB_DAILY, "the ECB", REVALIDATE_SECONDS, "application/xml, text/xml", "the ECB's reference rates");
    let perEuro: Record<string, number> | null = null;
    if ("text" in a) {
      try {
        perEuro = parseEcbDaily(a.text).perEuro;
      } catch {
        problems.push("The ECB sent something other than its reference rates.");
      }
    } else problems.push(`The ECB's reference rates: ${a.problem}.`);
    for (const c of wanted) {
      const r = perEuro ? ecbCross(perEuro, c, base) : null;
      if (r) rates[c] = r;
      else if (perEuro) problems.push(`The ECB quotes no ${c} to ${base} rate.`);
    }
    return { rates, problems };
  }
  await Promise.all(
    [...new Set(currencies)]
      .filter((c) => /^[A-Z]{3}$/.test(c) && c !== base)
      .map(async (c) => {
        const a = await fetchSource({ kind: "yahoo", symbol: `${c}${base}=X` }, today, "a currency pair", 14);
        const last = "points" in a ? a.points[a.points.length - 1] : undefined;
        if (last && Number.isFinite(last.value) && last.value > 0) rates[c] = last.value;
        else problems.push(`No ${c} to ${base} rate could be read.`);
      }),
  );
  return { rates, problems };
}

/**
 * The rate that carries a filing's per-share figure to the listing's price:
 * `fx` listing units per one filing unit (USD per DKK for a Novo Nordisk
 * ADR), read from the day's currency pair; 1 when the currencies are the
 * same or either is unknown. A pair that cannot be read is null with a
 * sentence, never a guess. One listed share is taken as one filed share.
 */
export async function listingRate(priceCurrency: string | null, filingsCurrency: string | null, today: string): Promise<{ fx: number | null; note: string | null }> {
  const listing = priceCurrency?.toUpperCase() ?? null;
  const filings = filingsCurrency?.toUpperCase() ?? null;
  if (!listing || !filings || listing === filings) return { fx: 1, note: null };
  const { rates, problems } = await loadFxRates([filings], listing, today);
  const fx = rates[filings];
  if (fx && fx > 0) return { fx, note: `the price in ${listing} is read in ${filings} at 1 ${filings} = ${fx.toLocaleString("en-US", { maximumSignificantDigits: 4 })} ${listing} (${today}), one listed share taken as one filed share` };
  return { fx: null, note: problems[0] ?? `No ${filings} to ${listing} rate could be read.` };
}

// ---------------------------------------------------------------------------
// The last session: every S&P 500 company's move, the four US indices through the day

/** A session's closes do not change, so a company's answer is kept a day; failures are never kept. */
const DAY_REVALIDATE_SECONDS = 24 * 60 * 60;
/** The screener's market values move with prices; a day is near enough to size a map. */
const CAPS_REVALIDATE_SECONDS = 24 * 60 * 60;
/** Requests to Yahoo at a time while the companies are read. */
const DAY_WORKERS = 8;
/** A read that missed more companies than this share is kept only briefly, so the next page asks for the rest. */
const DAY_COMPLETE = 0.95;
const DAY_PARTIAL_KEEP_MS = 20 * 60 * 1000;

type TextAnswer = { text: string } | { problem: string };

async function getText(url: string, name: string, revalidate: number, accept: string, logAs: string): Promise<TextAnswer> {
  const shut = feedShut(url);
  if (shut) return { problem: shut };
  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept, "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; Invariant market feed)" },
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(`[markets] ${logAs} ${timedOut ? "timed out" : "failed"}`);
    return { problem: timedOut ? `${name} did not answer within ${TIMEOUT_MS / 1000} seconds` : `${name} could not be reached` };
  }
  if (!res.ok) return { problem: `${name} answered ${res.status}` };
  try {
    return { text: await res.text() };
  } catch {
    return { problem: `${name}'s answer could not be read` };
  }
}

const unix = (date: string, plusDays = 0) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000) + plusDays * 86_400;

/** Daily closes over the ten days to `to`, and the day after it, so the session and the close before it are both in. */
async function dailyAround(ticker: string, to: string): Promise<MarketPoint[] | string> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${unix(to, -10)}&period2=${unix(to, 1)}&interval=1d`;
  const a = await getText(url, "Yahoo Finance", DAY_REVALIDATE_SECONDS, "application/json", "a company's session");
  if ("problem" in a) return a.problem;
  try {
    return parseYahoo(a.text);
  } catch {
    return "Yahoo Finance sent something other than a chart";
  }
}

async function indexThrough(def: (typeof DAY_INDICES)[number], session: string): Promise<IndexDay | string> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.yahoo)}?period1=${unix(session)}&period2=${unix(session, 1)}&interval=5m`;
  const a = await getText(url, "Yahoo Finance", DAY_REVALIDATE_SECONDS, "application/json", `${def.name} through the session`);
  if ("problem" in a) return `${def.name}: ${a.problem}.`;
  try {
    const { prevClose, points } = parseYahooIntraday(a.text);
    if (points.length < 2) return `${def.name}: no prices through the session came back.`;
    const close = points[points.length - 1].v;
    return { symbol: def.symbol, name: def.name, about: def.about, close, prevClose, changePct: Math.round(((close - prevClose) / prevClose) * 1e6) / 1e4, points };
  } catch {
    return `${def.name}: Yahoo Finance sent something other than a chart.`;
  }
}

async function nasdaqCaps(): Promise<Map<string, number> | string> {
  const a = await getText("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&download=true", "The Nasdaq screener", CAPS_REVALIDATE_SECONDS, "application/json, text/plain, */*", "the Nasdaq screener");
  if ("problem" in a) return a.problem;
  try {
    return parseNasdaqCaps(a.text);
  } catch (e) {
    return e instanceof Error ? `The Nasdaq screener: ${e.message}` : "The Nasdaq screener sent something else";
  }
}

/** One read of a session, start to end; never throws. */
async function readMarketDay(by: string): Promise<MarketDay | null> {
  const spx = await dailyAround("^GSPC", by);
  if (typeof spx === "string") {
    console.warn(`[markets] day: the S&P 500's closes: ${spx}`);
    return null;
  }
  const session = sessionOf(spx, by);
  if (!session) return null;
  const problems: string[] = [];
  const [gics, caps, indices] = await Promise.all([loadGics(), nasdaqCaps(), Promise.all(DAY_INDICES.map((d) => indexThrough(d, session)))]);
  const list = [...gics.by.values()].filter((r) => r.list === "S&P 500");
  // The Nasdaq-100 companies the S&P 500 does not carry, so QQQ's drivers are whole; read the same way, kept apart from the map.
  const inSpx = new Set(list.map((r) => r.ticker));
  const ndx = gics.members["Nasdaq-100"];
  // The Nasdaq-100's own list carries no GICS columns, so a company only it names is read with no sector.
  const extra = ndx.filter((t) => !inSpx.has(t)).map((t) => gics.by.get(t) ?? { ticker: t, sector: null, subIndustry: null, name: null });
  if (!ndx.length) problems.push("The Nasdaq-100 list could not be read; QQQ's drivers are left out.");
  if (!list.length) {
    problems.push(gics.problems.join(" ") || "The S&P 500 list could not be read.");
  }
  if (typeof caps === "string") problems.push(`${caps}; the map sizes every company alike.`);
  const moves: DayMove[] = [];
  const others: OtherMove[] = [];
  let missed = 0;
  let missedOthers = 0;
  const queue: { row: (typeof extra)[number]; inSpx: boolean }[] = [...list.map((row) => ({ row, inSpx: true })), ...extra.map((row) => ({ row, inSpx: false }))];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { row, inSpx: spxRow } = job;
      const ticker = yahooSymbol(row.ticker);
      const pts = ticker ? await dailyAround(ticker, session) : "not a ticker the price feed knows";
      const move = typeof pts === "string" ? null : moveOn(pts, session);
      if (!move) {
        if (spxRow) missed += 1;
        else missedOthers += 1;
        continue;
      }
      const read = { symbol: row.ticker, name: row.name ?? null, subIndustry: row.subIndustry, cap: typeof caps === "string" ? null : (caps.get(row.ticker) ?? null), ...move };
      if (spxRow && row.sector) moves.push({ ...read, sector: row.sector });
      else others.push({ ...read, sector: row.sector });
    }
  };
  const [, qqqPts] = await Promise.all([Promise.all(Array.from({ length: DAY_WORKERS }, worker)), dailyAround("QQQ", session)]);
  if (missed) problems.push(`${missed} of ${list.length} companies had no close for the session.`);
  if (missedOthers) problems.push(`${missedOthers} of the ${extra.length} Nasdaq-100 companies outside the S&P 500 had no close for the session.`);
  const qqqMove = typeof qqqPts === "string" ? null : moveOn(qqqPts, session);
  if (!qqqMove) problems.push(`QQQ: ${typeof qqqPts === "string" ? qqqPts : "no close for the session"}.`);
  const sizeBy = typeof caps !== "string" && moves.filter((m) => m.cap).length >= moves.length * 0.9 ? "cap" : "equal";
  if (sizeBy === "equal" && typeof caps !== "string") problems.push("Too few market values matched the list; the map sizes every company alike.");
  for (const i of indices) if (typeof i === "string") problems.push(i);
  // Counts, never names: the log carries how much was read.
  console.log(`[markets] day ${session}: ${moves.length} of ${list.length} companies, ${others.length} of ${extra.length} more in the Nasdaq-100, ${indices.filter((i) => typeof i !== "string").length} of ${DAY_INDICES.length} indices, sized by ${sizeBy}`);
  return marketDaySchema.parse({
    session,
    readAt: new Date().toISOString(),
    source: `Yahoo Finance closes; the S&P 500 and Nasdaq-100 lists and their GICS sectors from Wikipedia${sizeBy === "cap" ? "; market values from the Nasdaq screener" : ""}`,
    sizeBy,
    universe: list.length,
    moves: moves.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    indices: indices.filter((i): i is IndexDay => typeof i !== "string"),
    nasdaq100: ndx,
    others: others.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    qqq: qqqMove ? { symbol: "QQQ", name: "Invesco QQQ Trust", ...qqqMove } : null,
    problems,
  });
}

/** Reads kept on this instance by the date they were asked for; public prices, nothing of anyone's portfolio. */
const dayKept = new Map<string, { day: MarketDay; at: number }>();
const dayRunning = new Map<string, Promise<MarketDay | null>>();

function dayShared(by: string): Promise<MarketDay | null> {
  const running = dayRunning.get(by);
  if (running) return running;
  const p = readMarketDay(by)
    .then((day) => {
      if (day) dayKept.set(by, { day, at: Date.now() });
      return day;
    })
    .catch(() => null)
    .finally(() => dayRunning.delete(by));
  dayRunning.set(by, p);
  return p;
}

const complete = (d: MarketDay) => completeDay(d, DAY_COMPLETE);

/** A read that missed too many companies: never kept beyond this instance. */
class PartialDay extends Error {}

/**
 * A complete read, kept in the shared data cache under the date it was asked
 * for, so every instance and the next deployment open it at once instead of
 * reading five hundred companies again. A partial or failed read throws, so
 * it is never kept there.
 */
const dayStored = unstable_cache(
  async (by: string): Promise<MarketDay> => {
    const day = await dayShared(by);
    if (!day || !complete(day)) throw new PartialDay();
    return day;
  },
  ["market-day-v3"],
  { revalidate: DAY_REVALIDATE_SECONDS },
);

/** The kept read when there is one, else this instance's own; outside a request (a script) the instance's alone. */
function dayRead(by: string): Promise<MarketDay | null> {
  return dayStored(by)
    .then((d) => {
      const day = marketDaySchema.parse(d);
      dayKept.set(by, { day, at: Date.now() });
      return day;
    })
    .catch((e) => (e instanceof PartialDay ? (dayKept.get(by)?.day ?? null) : (dayKept.get(by)?.day ?? dayShared(by))));
}

export type MarketDayAnswer = { day: MarketDay | null; pending: string | null };

/**
 * The last closed session. A page waits the market feed's short budget and
 * no longer; a read still running carries on after the response and the next
 * page has it. Until a session closes (16:20 in New York) the one before is
 * the answer. The morning run (`full`) waits for the whole read. The demo
 * reads a fictional sample. Never throws.
 */
export const loadMarketDay = cache(async (now: Date = new Date(), wait: "budget" | "full" = "budget"): Promise<MarketDayAnswer> => {
  if (storageMode() === "demo") return { day: marketDaySchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "market-day.json"), "utf8"))), pending: null };
  const shut = feedShut(YAHOO_PROBE);
  if (shut) return { day: null, pending: `${shut} The session's indices, heat map and movers come back once a licensed price source is in.` };
  const by = closedBy(now);
  const kept = dayKept.get(by);
  if (kept && (complete(kept.day) || Date.now() - kept.at < DAY_PARTIAL_KEEP_MS)) return { day: kept.day, pending: null };
  const reading = dayRead(by);
  if (wait === "full") return { day: (await reading) ?? kept?.day ?? null, pending: null };
  const first = await Promise.race([reading, new Promise<"budget">((resolve) => setTimeout(() => resolve("budget"), BUDGET_MS))]);
  if (first !== "budget") return { day: first ?? kept?.day ?? null, pending: first ? null : "The last session could not be read; the S&P 500's own closes did not come back." };
  keepAlive(reading);
  // An older read on this instance stands in while the rest arrives.
  const older = kept?.day ?? [...dayKept.values()].sort((a, b) => b.day.session.localeCompare(a.day.session))[0]?.day ?? null;
  return { day: older, pending: "The last session's closes are being read, all five hundred companies; they arrive on the next page." };
});

// ---------------------------------------------------------------------------
// The major economies

/**
 * The economies map, read from public publishers, keyless:
 *
 *   OECD https://sdmx.oecd.org/public/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO,/USA+DEU+....GDPV_ANNPCT+....A
 *        (the Economic Outlook, annual, with projections for this year)
 *   IMF  https://www.imf.org/external/datamapper/api/v1/<indicator>/USA/DEU/...
 *        (World Economic Outlook and Fiscal Monitor), asked only for a figure
 *        the OECD did not give: it answers 403 to Vercel's functions
 *   BIS  https://stats.bis.org/api/v1/data/WS_CBPOL/D.US+XM+.../all?lastNObservations=10&format=csv
 *   OECD https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_MONAGG,4.0/...M.MABM.XDC..N...
 *
 * Read once every twelve hours (they change at most daily, the outlooks twice
 * a year), kept on the instance, and never waited on longer than a page's
 * budget. A source that fails costs its columns, said so, never the map.
 */
const ECON_FRESH_MS = 12 * 60 * 60 * 1000;
let econKept: { value: Economies; at: number } | null = null;
let econRunning: Promise<Economies> | null = null;

async function readEconomies(today: string): Promise<Economies> {
  const year = today.slice(0, 4);
  const codes = ECONOMIES.map((e) => e.code).join("/");
  const slow = SLOW_REVALIDATE_SECONDS;
  const problems: string[] = [];
  const keys = Object.keys(IMF) as ImfKey[];
  const [outlook, bis, oecd] = await Promise.all([
    getText(`https://sdmx.oecd.org/public/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO,/${codes.split("/").join("+")}.${Object.values(OECD_OUTLOOK).join("+")}.A?startPeriod=${Number(year) - 1}&endPeriod=${year}&dimensionAtObservation=AllDimensions&format=jsondata`, "the OECD", slow, "application/json", "oecd economic outlook"),
    getText(`https://stats.bis.org/api/v1/data/WS_CBPOL/D.${[...new Set(ECONOMIES.map((e) => e.bis))].join("+")}/all?lastNObservations=10&format=csv`, "the BIS", slow, "text/csv", "bis policy rates"),
    getText(`https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_MONAGG,4.0/${[...new Set(ECONOMIES.map((e) => e.oecd))].join("+")}.M.MABM.XDC..N...?startPeriod=${Number(year) - 2}-01&dimensionAtObservation=AllDimensions&format=jsondata`, "the OECD", slow, "application/json", "oecd broad money"),
  ]);
  let annual: EconomyInputs["annual"] = {};
  let outlookProblem: string | null = null;
  if ("problem" in outlook) outlookProblem = outlook.problem;
  else {
    try {
      annual = parseOecdOutlook(outlook.text);
    } catch (e) {
      outlookProblem = (e as Error).message;
    }
  }
  // The IMF only for a figure the OECD did not give; each answer that fails is a sentence.
  const missing = keys.filter((k) => !annual[k]);
  const imfTexts = await Promise.all(missing.map((k) => getText(`https://www.imf.org/external/datamapper/api/v1/${IMF[k]}/${codes}`, "the IMF", slow, "application/json", `imf ${IMF[k]}`)));
  let fromImf = 0;
  missing.forEach((k, i) => {
    const a = imfTexts[i];
    const fail = (why: string) => problems.push(`${ECONOMY_FIGURE[k]}: ${outlookProblem ? `the OECD Economic Outlook (${outlookProblem}) and` : "the OECD Economic Outlook gave none, and"} the IMF (${why}).`);
    if ("problem" in a) return void fail(a.problem);
    try {
      annual[k] = parseImf(a.text, IMF[k]);
      fromImf++;
    } catch (e) {
      fail((e as Error).message);
    }
  });
  const fromOecd = keys.length - missing.length;
  const annualSource = fromOecd && fromImf ? "the OECD Economic Outlook and the IMF" : fromImf ? "the IMF" : "the OECD Economic Outlook";
  const read = <T>(a: TextAnswer, name: string, parse: (t: string) => T): T | null => {
    if ("problem" in a) {
      problems.push(`${name}: ${a.problem}.`);
      return null;
    }
    try {
      return parse(a.text);
    } catch (e) {
      problems.push(`${name}: ${(e as Error).message}.`);
      return null;
    }
  };
  const rates = read(bis, "Policy rates", parseBisRates);
  const money = read(oecd, "Broad money", parseOecdSeries);
  const answered = [fromOecd || money ? "OECD" : null, fromImf ? "IMF" : null, rates ? "BIS" : null].filter(Boolean).join(", ");
  console.log(`[markets] economies: ${fromOecd} of ${keys.length} annual figures from the OECD, ${fromImf} from the IMF, rates ${rates ? "read" : "not read"}, money ${money ? "read" : "not read"}`);
  return buildEconomies({ annual, annualSource, rates, money }, year, new Date().toISOString(), answered || "no source answered", problems);
}

/** The economies map: the sample in the demo; otherwise the last reading under twelve hours old, or a fresh read within the page's budget. Null while the first read is still running. */
export const loadEconomies = cache(async (today: string, wait_: "budget" | "full" = "budget"): Promise<Economies | null> => {
  if (storageMode() === "demo") return economiesSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "economies.json"), "utf8")));
  if (econKept && Date.now() - econKept.at < ECON_FRESH_MS) return econKept.value;
  const running = (econRunning ??= readEconomies(today)
    .then((value) => {
      // A read where nothing answered is never kept: it neither replaces a good one nor stops the next page asking again.
      if (value.source !== "no source answered") econKept = { value, at: Date.now() };
      return econKept?.value ?? value;
    })
    .finally(() => {
      econRunning = null;
    }));
  if (wait_ === "full") return running;
  if (econKept) {
    keepAlive(running);
    return econKept.value;
  }
  const first = await Promise.race([running, wait(BUDGET_MS)]);
  if (first !== "budget") return first;
  keepAlive(running);
  return null;
});

// ---------------------------------------------------------------------------
// Prices while the market is open

/** Each price is kept this long in the shared data cache, so pages open at once share a read. */
const LIVE_REVALIDATE_SECONDS = LIVE_POLL_SECONDS;
/** A live read waits less than a page's fetches: the page asks again in half a minute anyway. */
const LIVE_TIMEOUT_MS = 8_000;

async function liveChart(ticker: string, logAs: string): Promise<(LiveQuote & { points: { t: number; v: number }[] }) | string> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
  const shut = feedShut(url);
  if (shut) return shut;
  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: LIVE_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; Invariant market feed)" },
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(`[markets] ${logAs} ${timedOut ? "timed out" : "failed"}`);
    return timedOut ? "Yahoo Finance did not answer in time" : "Yahoo Finance could not be reached";
  }
  if (!res.ok) return `Yahoo Finance answered ${res.status}`;
  try {
    return parseYahooQuote(ticker, await res.text());
  } catch {
    return "Yahoo Finance sent something other than a chart";
  }
}

/**
 * Prices now for the listed symbols a page names and the four US indices,
 * from Yahoo Finance's chart of the day: one GET per symbol, the ticker alone
 * in the URL, each kept half a minute. A symbol the feed cannot read is a
 * sentence; never a ticker in a log line. The caller decides whether the
 * market is open; the demo never calls this.
 */
export async function loadLive(symbols: readonly string[]): Promise<{ quotes: LiveQuote[]; indices: IndexDay[]; problems: string[] }> {
  const wanted = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].slice(0, LIVE_MAX_SYMBOLS);
  const shut = feedShut(YAHOO_PROBE);
  if (shut) return { quotes: [], indices: [], problems: [`${shut} Prices now come back once a licensed price source is in.`] };
  const [held, ix] = await Promise.all([
    Promise.all(
      wanted.map(async (symbol) => {
        const ticker = yahooSymbol(symbol);
        if (!ticker) return `${symbol}: not a ticker the price feed reads.`;
        const q = await liveChart(ticker, "a holding's price now");
        return typeof q === "string" ? `${symbol}: ${q}.` : { symbol, price: q.price, prevClose: q.prevClose, currency: q.currency, time: q.time };
      }),
    ),
    Promise.all(DAY_INDICES.map(async (def) => {
      const q = await liveChart(def.yahoo, `${def.name} now`);
      return typeof q === "string" ? `${def.name}: ${q}.` : indexNow(def, q);
    })),
  ]);
  return {
    quotes: held.filter((h): h is LiveQuote => typeof h !== "string"),
    indices: ix.filter((i): i is IndexDay => typeof i !== "string"),
    problems: [...held, ...ix].filter((p): p is string => typeof p === "string"),
  };
}

/**
 * Pre-market and after hours, and the move since a company's results came
 * out (Hamza, 4 Nov 2026), from Yahoo Finance's chart of the last five
 * sessions in five-minute bars with the extended sessions in it
 * (lib/extended-hours.ts): one GET per symbol, the ticker alone in the URL,
 * each kept a minute in the shared data cache, so every page in the same
 * minute shares one read. A symbol the feed cannot read is a sentence, never
 * a ticker in a log line. The demo never calls this.
 */
export async function loadExtended(symbols: readonly string[], since: readonly SinceAsk[]): Promise<Omit<ExtendedAnswer, "session">> {
  const shutNow = feedShut(YAHOO_PROBE);
  if (shutNow) return { moves: [], since: [], problems: [`${shutNow} Prices before the open and after the close come back once a licensed price source is in.`] };
  const wanted = [...new Set([...symbols, ...since.map((x) => x.symbol)].map((x) => x.trim().toUpperCase()).filter(Boolean))].slice(0, EXTENDED_MAX_SYMBOLS);
  const charts = new Map<string, ExtendedChart>();
  const problems: string[] = [];
  const queue = [...wanted];
  const worker = async () => {
    for (let symbol = queue.shift(); symbol; symbol = queue.shift()) {
      const ticker = yahooSymbol(symbol);
      if (!ticker) {
        problems.push(`${symbol}: not a ticker the price feed reads.`);
        continue;
      }
      const a = await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${EXTENDED_RANGE}&interval=5m&includePrePost=true`, "Yahoo Finance", EXTENDED_POLL_SECONDS, "application/json", "a price before the open or after the close");
      if ("problem" in a) {
        problems.push(`${symbol}: ${a.problem}.`);
        continue;
      }
      try {
        charts.set(symbol, parseExtendedChart(symbol, a.text));
      } catch {
        problems.push(`${symbol}: Yahoo Finance sent something other than a chart.`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const moves: ExtendedAnswer["moves"] = [];
  for (const s of symbols) {
    const c = charts.get(s.trim().toUpperCase());
    const m = c ? extendedMove(c) : null;
    if (c && m) moves.push({ ...m, symbol: s, currency: c.currency });
  }
  const out: ExtendedAnswer["since"] = [];
  for (const ask of since) {
    const c = charts.get(ask.symbol.toUpperCase());
    const r = c ? sinceResults(c, acceptedUnix(ask.accepted), ask.before) : null;
    if (c && r) out.push({ ...r, symbol: ask.symbol, currency: c.currency });
  }
  return { moves, since: out, problems };
}

/** The session so far, assembled once a minute on an instance; public prices, nothing of anyone's book. */
let liveSessionKept: { day: MarketDay | null; problems: string[]; at: number } | null = null;
let liveSessionRunning: Promise<{ day: MarketDay | null; problems: string[] }> | null = null;

async function sparkBatch(tickers: readonly string[]): Promise<Map<string, SparkQuote> | string> {
  const a = await getText(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${tickers.map(encodeURIComponent).join(",")}&range=1d&interval=5m`, "Yahoo Finance", LIVE_SESSION_POLL_SECONDS, "application/json", "a batch of prices now");
  if ("problem" in a) return a.problem;
  try {
    return parseYahooSpark(a.text);
  } catch {
    return "Yahoo Finance sent something other than prices";
  }
}

/**
 * The session so far for every company the last session's read carries (the
 * S&P 500, the Nasdaq-100 outside it, and QQQ), from Yahoo Finance's spark in
 * batches of twenty, tickers alone in the URL, kept a minute in the shared
 * data cache and assembled once a minute per instance, so the load grows with
 * the minute, not with people. After the close it reads only until the kept
 * read of that session has landed (16:20 New York): once the kept day is the
 * last session, nothing is read and that day is the answer, so the page
 * draws the kept close under the same badge. The demo never calls this.
 * Never throws.
 */
export async function loadLiveSession(now: Date = new Date()): Promise<{ day: MarketDay | null; problems: string[] }> {
  if (liveSessionKept && Date.now() - liveSessionKept.at < LIVE_SESSION_POLL_SECONDS * 1000) return liveSessionKept;
  if (liveSessionRunning) return liveSessionRunning;
  const shut = feedShut(YAHOO_PROBE);
  if (shut) return { day: null, problems: [`${shut} The session comes back once a licensed price source is in.`] };
  liveSessionRunning = (async () => {
    const { day: kept } = await loadMarketDay(now);
    if (!kept) return { day: null, problems: ["The last session has not been read yet, so the companies to price now are not known."] };
    // Shut, once the kept read is the last session, it is the session's close: handed back as it is, so an open page moves from the prices so far to the kept close without a reload.
    if (!isTradingHours(now) && kept.session >= lastSession(now)) return { day: kept, problems: [] };
    // Yahoo's own symbol for each company, and back again to the list's.
    const back = new Map<string, string>();
    for (const m of [...kept.moves, ...kept.others, { symbol: "QQQ" }]) {
      const t = yahooSymbol(m.symbol);
      if (t) back.set(t.toUpperCase(), m.symbol.toUpperCase());
    }
    const tickers = [...back.keys()];
    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += SPARK_BATCH) batches.push(tickers.slice(i, i + SPARK_BATCH));
    const quotes = new Map<string, SparkQuote>();
    const why = new Set<string>();
    const queue = [...batches];
    const worker = async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const got = await sparkBatch(b);
        if (typeof got === "string") why.add(got);
        else for (const [t, q] of got) quotes.set(back.get(t) ?? t, q);
      }
    };
    const [, ix] = await Promise.all([
      Promise.all(Array.from({ length: DAY_WORKERS }, worker)),
      Promise.all(DAY_INDICES.map(async (def) => {
        const q = await liveChart(def.yahoo, `${def.name} now`);
        return typeof q === "string" ? null : indexNow(def, q);
      })),
    ]);
    const day = liveSession(kept, quotes, ix.filter((i): i is IndexDay => !!i), now);
    // A count, never a ticker.
    console.log(`[markets] session so far: ${quotes.size} of ${tickers.length} priced`);
    return { day, problems: day ? [] : [why.size ? `Prices now could not be read: ${[...why].join("; ")}.` : "Too few companies have traded yet today."] };
  })()
    .then((r) => {
      liveSessionKept = { ...r, at: Date.now() };
      return r;
    })
    .catch(() => ({ day: null, problems: ["Prices now could not be read."] }))
    .finally(() => {
      liveSessionRunning = null;
    });
  return liveSessionRunning;
}

// ---------------------------------------------------------------------------
// The earnings calendar

const NASDAQ_EARNINGS = (date: string) => `https://api.nasdaq.com/api/calendar/earnings?date=${date}`;

/** Requests to Nasdaq at a time while the calendar's days are read. */
const EARNINGS_WORKERS = 6;
/** A day ahead can still move (a company confirms its date); a day past cannot. */
const EARNINGS_AHEAD_REVALIDATE_SECONDS = 12 * 60 * 60;
const EARNINGS_PAST_REVALIDATE_SECONDS = 7 * 24 * 60 * 60;
/** A whole read is kept on the instance this long; the morning run reads it again. */
const EARNINGS_FRESH_MS = 6 * 60 * 60 * 1000;
let earningsKept: { today: string; calendar: EarningsCalendar; at: number } | null = null;
let earningsRunning: { today: string; p: Promise<EarningsCalendar> } | null = null;

async function readEarnings(today: string): Promise<EarningsCalendar> {
  const days = weekdaysBetween(addDays(today, -EARNINGS_BACK_DAYS), addDays(today, EARNINGS_AHEAD_DAYS));
  const rows: EarningsRow[] = [];
  const missed: string[] = [];
  const answered: string[] = [];
  const unpublished: string[] = [];
  const why = new Set<string>();
  const queue = [...days];
  const worker = async () => {
    for (let date = queue.shift(); date; date = queue.shift()) {
      const a = await getText(NASDAQ_EARNINGS(date), "The Nasdaq earnings calendar", date < today ? EARNINGS_PAST_REVALIDATE_SECONDS : EARNINGS_AHEAD_REVALIDATE_SECONDS, "application/json, text/plain, */*", "a day of the earnings calendar");
      if ("problem" in a) {
        missed.push(date);
        why.add(a.problem);
        continue;
      }
      try {
        const day = parseNasdaqEarnings(a.text, date);
        if (day === null) unpublished.push(date);
        else {
          answered.push(date);
          rows.push(...day);
        }
      } catch (e) {
        missed.push(date);
        why.add(`The Nasdaq earnings calendar: ${e instanceof Error ? e.message : "an answer that could not be read"}`);
      }
    }
  };
  await Promise.all(Array.from({ length: EARNINGS_WORKERS }, worker));
  // Days past the end of what Nasdaq has published are not gaps; a day with no data inside it is.
  const { publishedTo, gaps } = calendarReach(answered, unpublished);
  if (gaps.length) why.add("The Nasdaq earnings calendar: the calendar answered with no data");
  missed.push(...gaps);
  missed.sort();
  if (missed.length) console.warn(`[markets] earnings calendar: ${missed.length} of ${days.length} days not read`);
  const problems = missed.length ? [`${missed.length} of ${days.length} days could not be read (${[...why].slice(0, 2).join("; ")}); a report on those days is missing, not absent.`] : [];
  return earningsCalendarSchema.parse({ from: days[0], to: days.at(-1)!, rows, missed, publishedTo: unpublished.some((d) => !gaps.includes(d)) ? publishedTo : null, problems, readAt: new Date().toISOString() });
}

function earningsShared(today: string): Promise<EarningsCalendar> {
  if (earningsRunning?.today === today) return earningsRunning.p;
  const p = readEarnings(today)
    .then((calendar) => {
      // A read that missed most days is not kept over a better one.
      if (!earningsKept || earningsKept.today !== today || calendar.missed.length <= earningsKept.calendar.missed.length) earningsKept = { today, calendar, at: Date.now() };
      return calendar;
    })
    .finally(() => {
      if (earningsRunning?.p === p) earningsRunning = null;
    });
  earningsRunning = { today, p };
  return p;
}

export type EarningsAnswer = { calendar: EarningsCalendar | null; pending: string | null };

/**
 * The earnings calendar around today: the Nasdaq calendar, one public page
 * per weekday from three weeks back to ten weeks ahead, the date alone in the
 * URL; every company's row is kept and the person's are picked out on the
 * page, so nothing of theirs goes out. Each day's page is kept in the shared
 * data cache (half a day ahead, a week behind); a page waits the feed's short
 * budget and the rest arrives on the next. A day that cannot be read is
 * named. The demo reads a fictional sample, its days kept relative to today.
 * Never throws.
 */
export const loadEarnings = cache(async (today: string, wait: "budget" | "full" = "budget"): Promise<EarningsAnswer & { file?: EarningsFile }> => {
  if (storageMode() === "demo") {
    const d = demoEarnings(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "earnings.json"), "utf8")), today);
    return { calendar: d.calendar, pending: null, file: d.file };
  }
  // Nasdaq's calendar shut: results are found in the SEC's filings once they are out (secCalendar in lib/earnings-run.ts); no date ahead is known.
  const shut = feedShut(NASDAQ_EARNINGS(today));
  if (shut) return { calendar: null, pending: `${shut} Results are found in each company's SEC filings once they are out, so no date ahead is shown.` };
  const kept = earningsKept?.today === today ? earningsKept : null;
  if (kept && Date.now() - kept.at < EARNINGS_FRESH_MS && !kept.calendar.missed.length) return { calendar: kept.calendar, pending: null };
  const reading = earningsShared(today).catch((): EarningsCalendar | null => null);
  if (wait === "full") return { calendar: (await reading) ?? kept?.calendar ?? earningsKept?.calendar ?? null, pending: null };
  const first = await Promise.race([reading, new Promise<"budget">((resolve) => setTimeout(() => resolve("budget"), BUDGET_MS))]);
  if (first !== "budget") return { calendar: first ?? kept?.calendar ?? null, pending: first ? null : "The Nasdaq earnings calendar could not be read." };
  keepAlive(reading);
  const older = kept?.calendar ?? earningsKept?.calendar ?? null;
  return { calendar: older, pending: older ? "The calendar is being read again; the newest dates arrive on the next page." : "The calendar is being read, about sixty days of it; it arrives on the next page." };
});

// ---------------------------------------------------------------------------
// Company headlines (At the Close, Company news and reports)

/** How long a company's headlines are kept in the shared data cache. */
const NEWS_REVALIDATE_SECONDS = 60 * 60;

/** One ticker's headlines: Yahoo Finance's feed, else Google News's; the ticker alone in the address, a count and never a ticker in a log. */
async function headlinesOf(ticker: string): Promise<{ items: NewsItem[] } | { problem: string }> {
  const yahoo = await getText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`, "Yahoo Finance's news feed", NEWS_REVALIDATE_SECONDS, "application/rss+xml, application/xml, text/xml", "a company's headlines");
  if ("text" in yahoo) {
    try {
      const items = parseRss(yahoo.text, ticker);
      if (items.length) return { items };
    } catch {
      // Not a feed: Google News below.
    }
  }
  const google = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(`${ticker} stock`)}&hl=en-US&gl=US&ceid=US:en`, "Google News", NEWS_REVALIDATE_SECONDS, "application/rss+xml, application/xml, text/xml", "a company's headlines (Google News)");
  if ("problem" in google) return { problem: "problem" in yahoo ? yahoo.problem : google.problem };
  try {
    return { items: parseRss(google.text, ticker) };
  } catch {
    return { problem: "Google News answered with something other than a feed" };
  }
}

/**
 * The headlines of the companies a person follows (the listed holdings and
 * the watchlist), each from the public feeds alone; the sample in the demo.
 * A company whose feeds fail is a sentence naming the feed, never a quiet
 * week. Never throws.
 */
export async function loadCompanyHeadlines(tickers: readonly string[], today: string): Promise<{ items: NewsItem[]; problems: string[] }> {
  if (storageMode() === "demo") return { items: demoNews(demoNewsSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "company-news.json"), "utf8"))), today).filter((i) => tickers.includes(i.symbol)), problems: [] };
  // Neither headline feed may be shown: one sentence, not one a company.
  const shut = feedShut("https://feeds.finance.yahoo.com/rss/2.0/headline");
  if (shut && feedShut("https://news.google.com/rss/search")) return { items: [], problems: tickers.length ? [`Headlines are not shown in the beta: Yahoo Finance's and Google News's terms bar it. The filings and the app's own reports still are.`] : [] };
  const answers = await Promise.all(tickers.slice(0, LIVE_MAX_SYMBOLS).map(async (t) => [t, await headlinesOf(t)] as const));
  const items = answers.flatMap(([, a]) => ("items" in a ? a.items : []));
  const failed = answers.filter(([, a]) => "problem" in a);
  if (failed.length) console.warn(`[markets] headlines unread for ${failed.length} of ${answers.length} companies`);
  const problems = failed.length ? [`Headlines could not be read for ${failed.map(([t]) => t).join(", ")}: ${(failed[0][1] as { problem: string }).problem}.`] : [];
  return { items, problems };
}

// ---------------------------------------------------------------------------
// Short interest (FINRA's twice-monthly file)

/**
 * A published file never changes; it is kept a day on this instance. The
 * file runs to several megabytes, past the shared data cache's 2 MB, so it
 * is fetched without it (asking the cache only logged a refusal on every
 * read; 23 Oct 2026).
 */
const SHORT_REVALIDATE_SECONDS = 0;
const shortKept = new Map<string, { at: number; text: string | null }>();

/** One settlement date's file, or null when FINRA has not published it (or it cannot be read). */
async function shortFile(settlement: string): Promise<string | null> {
  const kept = shortKept.get(settlement);
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.text;
  const got = await getText(FINRA_FILE(settlement), "FINRA", SHORT_REVALIDATE_SECONDS, "text/csv, text/plain, */*", "the short interest file");
  const text = "text" in got ? got.text : null;
  shortKept.set(settlement, { at: Date.now(), text });
  return text;
}

/**
 * The short interest of the symbols given at FINRA's latest published
 * settlement date: the newest date whose file answers, among the last few
 * and none before PUBLISHED_AFTER_DAYS have passed. The symbols are matched
 * here; the URL carries the date alone. The demo reads nothing.
 */
/** The analysts' estimates move a few times a quarter: asked again after twelve hours. */
const CONSENSUS_REVALIDATE_SECONDS = 12 * 60 * 60;

/**
 * The analysts' consensus EPS for a company (Hamza, 23 Oct 2026: forward
 * multiples from the filings and from the analysts, both): Nasdaq's public
 * earnings-forecast page, the ticker alone in the URL, kept twelve hours in
 * the data cache, so the load grows with distinct tickers, not people. Null
 * when Nasdaq lists no estimate; a page that cannot be read is a sentence.
 * Read for the companies held, watched or opened, never the whole screener.
 */
export async function loadConsensus(ticker: string, today: string): Promise<{ consensus: Consensus | null; problem: string | null }> {
  if (storageMode() === "demo") return { consensus: null, problem: null };
  const a = await getText(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(ticker)}/earnings-forecast`, "Nasdaq's analyst estimates", CONSENSUS_REVALIDATE_SECONDS, "application/json, text/plain, */*", "a company's analyst estimates");
  if ("problem" in a) return { consensus: null, problem: a.problem };
  try {
    const years = parseNasdaqForecast(a.text);
    return { consensus: years.length ? consensusOf(years, today, new Date().toISOString()) : null, problem: null };
  } catch (e) {
    console.warn("[markets] a company's analyst estimates could not be read");
    return { consensus: null, problem: e instanceof Error ? e.message : "Nasdaq's analyst estimates could not be read" };
  }
}

export async function loadShortInterest(symbols: readonly string[], today: string): Promise<{ settlement: string | null; rows: Map<string, Omit<ShortInterest, "pctOfShares">>; problem: string | null }> {
  if (storageMode() === "demo" || !symbols.length) return { settlement: null, rows: new Map(), problem: null };
  const shut = feedShut(FINRA_FILE(settlementDates(today)[0] ?? today));
  if (shut) return { settlement: null, rows: new Map(), problem: shut };
  for (const settlement of settlementDates(addDays(today, -PUBLISHED_AFTER_DAYS))) {
    const text = await shortFile(settlement);
    if (!text) continue;
    try {
      return { settlement, rows: parseShortFile(text, symbols), problem: null };
    } catch {
      return { settlement, rows: new Map(), problem: "FINRA's short interest file could not be read" };
    }
  }
  return { settlement: null, rows: new Map(), problem: "FINRA's short interest files could not be reached" };
}

// ---------------------------------------------------------------------------
// Options before results (Cboe's delayed quotes)

/**
 * The expected move priced for a report: the at-the-money straddle of the
 * first expiry that trades on the results, from Cboe's delayed quotes (the
 * symbol alone in the URL). A chain runs to megabytes, so it is never kept in
 * the data cache; the run that reads it keeps the one figure. Null with a
 * sentence when Cboe does not answer or lists no options for the symbol.
 */
export async function loadExpectedMove(symbol: string, date: string, time: string, now: Date = new Date()): Promise<{ move: ExpectedMove | null; problem: string | null }> {
  if (storageMode() === "demo") return { move: null, problem: null };
  let last = "Cboe could not be reached";
  for (const url of CBOE_QUOTES(symbol)) {
    const shut = feedShut(url);
    if (shut) return { move: null, problem: shut };
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; Invariant market feed)" } });
    } catch {
      console.warn("[markets] an options chain could not be reached");
      continue;
    }
    if (res.status === 403 || res.status === 404) {
      last = res.status === 404 ? "Cboe lists no options for it" : "Cboe refused the request";
      continue;
    }
    if (!res.ok) {
      last = `Cboe answered ${res.status}`;
      continue;
    }
    try {
      const move = expectedMove(parseCboeChain(await res.json()), symbol, date, time, now.toISOString());
      return move ? { move, problem: null } : { move: null, problem: "the options listed have no expiry after the results with both legs priced" };
    } catch {
      last = "Cboe's quotes could not be read";
    }
  }
  return { move: null, problem: last };
}

// ---------------------------------------------------------------------------
// Prediction markets (Kalshi's Fed markets, Polymarket's recession market)

/**
 * The chances the prediction markets price: the Fed's next decision from
 * Kalshi (with the effective rate the markets row carries, for the range
 * today) and a US recession from Polymarket. Each public, keyless, kept an
 * hour in the data cache; one that cannot be read is a sentence and the other
 * still shows. The demo reads a fictional sample.
 */
/**
 * Kalshi's markets for the next meeting: its own event first (KXFED-26OCT),
 * else the series a page at a time by its cursor, at most KALSHI_MAX_PAGES,
 * since the series' first page lists the meetings furthest out.
 */
async function readKalshi(meeting: string | null): Promise<{ markets: ReturnType<typeof parseKalshiFed> } | { problem: string }> {
  const out: ReturnType<typeof parseKalshiFed> = [];
  try {
    if (meeting) {
      const own = await getText(KALSHI_EVENT(meeting), "Kalshi", REVALIDATE_SECONDS, "application/json", "the Fed odds");
      if ("text" in own) out.push(...parseKalshiFed(JSON.parse(own.text)));
      if (out.length) return { markets: out };
    }
    let url: string | null = KALSHI_FED;
    for (let page = 0; url && page < KALSHI_MAX_PAGES; page++) {
      const r = await getText(url, "Kalshi", REVALIDATE_SECONDS, "application/json", "the Fed odds");
      if (!("text" in r)) return out.length ? { markets: out } : { problem: `The Fed odds could not be read: ${r.problem}.` };
      const json = JSON.parse(r.text);
      out.push(...parseKalshiFed(json));
      if (meeting && out.some((m) => m.event === kalshiEvent(meeting))) break;
      const cursor = kalshiCursor(json);
      url = cursor ? KALSHI_NEXT(cursor) : null;
    }
    return { markets: out };
  } catch {
    return { problem: "Kalshi's markets could not be read." };
  }
}

/**
 * What the prediction markets bet on each calendar event ahead (Hamza, 28 Oct
 * 2026; lib/event-odds.ts): the Fed's from `loadOdds`, every other event's
 * from Polymarket's search and Kalshi's markets by the event's own words, each
 * address read an hour apart for everyone, nothing of the person in it. Keyed
 * by the event's report key; a market too thin or not the event's own
 * question is a sentence, never a price.
 */
export async function loadEventBets(events: readonly EconEvent[], effr: number | null, now: Date = new Date()): Promise<Record<string, { bet: EventBet | null; note: string }>> {
  if (storageMode() === "demo") return demoEventBets(events, effr, now);
  const out: Record<string, { bet: EventBet | null; note: string }> = {};
  // Both markets shut: each event says so once, and nothing is asked.
  if (feedShut(POLYMARKET_SEARCH) && feedShut(KALSHI_EVENT("2026-01-01"))) {
    for (const e of events) if (e.kind === "fomc" || oddsQuery(e)) out[macroKey(e)] = { bet: null, note: "What the markets bet on is not shown in the beta: Kalshi's and Polymarket's terms bar it." };
    return out;
  }
  const read = new Map<string, Promise<unknown | null>>();
  const json = (url: string) => {
    if (!read.has(url))
      read.set(
        url,
        getText(url, url.includes("kalshi") ? "Kalshi" : "Polymarket", REVALIDATE_SECONDS, "application/json", "the event odds").then((r) => {
          if (!("text" in r)) return null;
          try {
            return JSON.parse(r.text) as unknown;
          } catch {
            return null;
          }
        }),
      );
    return read.get(url)!;
  };
  const fed = events.some((e) => e.kind === "fomc") ? await loadOdds(effr, now).catch(() => null) : null;
  await Promise.all(
    events.map(async (e) => {
      const key = macroKey(e);
      if (e.kind === "fomc") {
        const f = fed?.fed && fed.fed.meeting === e.date ? fed.fed : null;
        const bet = f ? chooseBet([fedBet(f)]) : null;
        out[key] = { bet, note: bet ? betSourceWords(bet) : (fed?.problems.find((p) => /Fed|Kalshi|Polymarket/.test(p)) ?? "Neither Kalshi nor Polymarket could be read for the meeting.") };
        return;
      }
      const q = oddsQuery(e);
      if (!q) return;
      const tries: (EventBet | null)[] = [];
      const [pm, ks] = await Promise.all([q.polymarket ? json(q.polymarket) : null, q.kalshi ? json(q.kalshi) : null]);
      try {
        if (pm) tries.push(polymarketBet(pm, e));
      } catch {
        // A reply of another shape is no market.
      }
      try {
        if (ks) tries.push(kalshiBet(ks, e));
      } catch {
        // As above.
      }
      const bet = chooseBet(tries);
      out[key] = { bet, note: bet ? betSourceWords(bet) : noBetWords(tries) };
    }),
  );
  return out;
}

/** The demo's odds file: the Fed's next meeting and each event's own question, fictional prices. */
const sampleOddsFile = () => JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "odds.json"), "utf8")) as Record<string, unknown>;

/** The demo's bets: the sample's question for each event's kind, the Fed's from the sample odds, keyed as the live read keys them. */
async function demoEventBets(events: readonly EconEvent[], effr: number | null, now: Date): Promise<Record<string, { bet: EventBet | null; note: string }>> {
  const bets = sampleEventBetsSchema.parse(sampleOddsFile().events ?? {});
  const fed = events.some((e) => e.kind === "fomc") ? await loadOdds(effr, now).catch(() => null) : null;
  const out: Record<string, { bet: EventBet | null; note: string }> = {};
  for (const e of events) {
    const f = e.kind === "fomc" && fed?.fed && fed.fed.meeting === e.date ? fed.fed : null;
    const bet = chooseBet([f ? fedBet(f) : e.kind === "fomc" ? null : sampleBetFor(bets, e)]);
    if (!bet && e.kind !== "fomc" && !oddsQuery(e)) continue;
    out[macroKey(e)] = { bet, note: bet ? betSourceWords(bet) : "Neither Kalshi nor Polymarket lists a question that is this event's own." };
  }
  return out;
}

export const loadOdds = cache(async (effr: number | null, now: Date = new Date()): Promise<Odds> => {
  if (storageMode() === "demo") return sampleOdds(oddsSchema.parse(sampleOddsFile()), now.toISOString().slice(0, 10));
  const at = now.toISOString();
  if (feedShut(POLYMARKET_SEARCH) && feedShut(KALSHI_FED)) return { fed: null, recession: null, readAt: at, problems: ["What the markets bet on is not shown in the beta: Kalshi's and Polymarket's terms bar it."] };
  const problems: string[] = [];
  const meeting = nextFomc(at.slice(0, 10))?.date ?? null;
  const [kalshi, poly, polyFed] = await Promise.all([
    readKalshi(meeting),
    getText(POLYMARKET_SEARCH, "Polymarket", REVALIDATE_SECONDS, "application/json", "the recession odds"),
    meeting ? getText(POLYMARKET_FED(meeting), "Polymarket", REVALIDATE_SECONDS, "application/json", "the Fed odds") : Promise.resolve(null),
  ]);
  // Both markets on the meeting, and the deeper one's prices (Hamza, 28 Oct 2026).
  let fromKalshi: Odds["fed"] = null;
  let kalshiGap: string | null = null;
  if ("markets" in kalshi) {
    fromKalshi = fedOdds(kalshi.markets, effr, at, meeting);
    if (!fromKalshi) kalshiGap = effr === null ? "The Fed odds need the effective fed funds rate, which could not be read." : fedOddsGap(kalshi.markets, effr, at, meeting);
  } else kalshiGap = kalshi.problem;
  let fromPoly: Odds["fed"] = null;
  let polyGap: string | null = null;
  if (meeting && polyFed && "text" in polyFed) {
    try {
      fromPoly = parsePolymarketFed(JSON.parse(polyFed.text), meeting, effr);
      if (!fromPoly) polyGap = "Polymarket lists no open market on the meeting's decision.";
    } catch {
      polyGap = "Polymarket's Fed markets could not be read.";
    }
  } else if (polyFed && "problem" in polyFed) polyGap = `Polymarket's Fed markets could not be read: ${polyFed.problem}.`;
  const fed = deeperFed(fromKalshi, fromPoly);
  if (!fed) problems.push(...[kalshiGap, polyGap].filter((x): x is string => !!x));
  let recession: Odds["recession"] = null;
  if ("text" in poly) {
    try {
      recession = parsePolymarketRecession(JSON.parse(poly.text), at);
      if (!recession) problems.push("Polymarket lists no open market on a US recession.");
    } catch {
      problems.push("Polymarket's markets could not be read.");
    }
  } else problems.push(`The recession odds could not be read: ${poly.problem}.`);
  return { fed, recession, readAt: at, problems };
});

/**
 * The CFTC's Commitments of Traders for the Flows screen's markets
 * (lib/flows.ts COT_MARKETS): each market's three years of weeks from its
 * public reporting site, the contract code alone in the address. Not cached
 * here: the screener's 05:00 run keeps the read for everyone. A market that
 * cannot be read is a sentence, the others kept.
 */
export async function loadCot(): Promise<{ markets: Record<string, CotWeek[]>; problems: string[] }> {
  const markets: Record<string, CotWeek[]> = {};
  const problems: string[] = [];
  for (const m of COT_MARKETS) {
    const a = await getText(cotUrl(m), "the CFTC", 0, "application/json", "cot");
    if ("problem" in a) {
      problems.push(`${m.label}: ${a.problem}`);
      continue;
    }
    try {
      markets[m.id] = parseCot(JSON.parse(a.text), m);
    } catch {
      problems.push(`${m.label}: the CFTC sent no weeks`);
    }
  }
  return { markets, problems };
}

/** The Treasury's TIC table 1, the all-countries row by month (lib/flows.ts parseTicTable1); a sentence when it cannot be read. */
export async function loadTic(): Promise<{ months: TicMonth[] } | { problem: string }> {
  const a = await getText(TIC_URL, "the US Treasury's TIC data", 0, "text/plain", "tic table 1");
  if ("problem" in a) return a;
  try {
    return { months: parseTicTable1(a.text) };
  } catch {
    return { problem: "the US Treasury's TIC table 1 carried no all-countries row that could be read" };
  }
}

/** The OFR's money market fund holdings, in all and by instrument (lib/flows.ts MMF_SERIES); the total missing is a sentence. */
export async function loadMmf(): Promise<{ series: Record<string, { date: string; value: number }[]> } | { problem: string }> {
  const series: Record<string, { date: string; value: number }[]> = {};
  for (const s of MMF_SERIES) {
    const a = await getText(mmfUrl(s.mnemonic), "the OFR", 0, "application/json", "ofr mmf");
    if ("problem" in a) {
      if (s.id === "total") return a;
      continue;
    }
    try {
      series[s.id] = parseOfrSeries(JSON.parse(a.text));
    } catch {
      if (s.id === "total") return { problem: "the OFR sent no money market fund months" };
    }
  }
  return { series };
}
