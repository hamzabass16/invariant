/**
 * Holds the markets object (lib/markets.ts) and what rides on it: the two
 * feed formats parse, the rows and derived indicators compute, a feed that
 * fails is a sentence and never a zero, the feed lends SPY and QQQ to a book
 * without benchmark series, a measure over markets reads a level, a class
 * counts its passes (required gate, minimum of criteria), the Markets screen
 * switches on from the methodology and takes its section's name, and the
 * drafter can record what the ontology cannot say.
 * Run: npm run check:markets
 */
import { eventLinks, REPORTS_BACK_DAYS, reportEvent } from "../lib/calendar-links";
import { reportKey, type EarningsReport } from "../lib/earnings";
import { macroKey, type MacroReport } from "../lib/macro-report";
import { linkKey } from "../lib/econ-calendar";
import { mondayOf, weekDays } from "../lib/time";
import { creditPoints, creditStress, zoneOf } from "@/lib/credit-stress";
import { INVESTIGATIVE } from "../lib/investigate";
import { ECON_EVENTS, ECON_KIND, econAhead, econTableNote, nextFomc } from "../lib/econ-calendar";
import { betKey, betView, chooseBet, decisionPrices, kalshiBet, MIN_TRADED, noBetWords, oddsQuery, polymarketBet } from "../lib/event-odds";
import { deeperFed, fedOdds, fedOddsGap, fedSourceWords, KALSHI_EVENT, KALSHI_NEXT, kalshiCursor, kalshiEvent, oddsSchema, parseKalshiFed, parsePolymarketFed, parsePolymarketRecession, POLYMARKET_FED } from "../lib/odds";
import { parseShortFile, settlementDates, shortChangePct, shortFields, withShareCount } from "../lib/short-interest";
import { companyFeed, demoNews, demoNewsSchema, MAX_PER_COMPANY, newsFrom, newsItemSchema, parseRss, reportsFrom, whenWords } from "../lib/company-news";
import { readFileSync } from "node:fs";
import { cashNow, COT_MARKETS, cotUrl, EMPTY_FLOW_SOURCES, flowSourceRowSchema, flowSourcesDue, foreignYear, insidersOf, parseCot, parseOfrSeries, parseTicTable1, positionRows, quartersBefore, quarterWords, rankWords, type FlowSourceRow } from "../lib/flows";
import { etfFlows, FLOW_FUNDS, flowDollars, fundFlowSchema, fundTickersOf, mergeMonths, netOf, nportFilingsOf, nportSeriesOf, parseNportFlows, reportsFor, sankeyLayout, sankeySides, shiftYm, windowWords, BUCKETS, type FundFlow } from "../lib/etf-flows";
import { z } from "zod";
import { creditsFor, creditsForNames, feedOf, feedOpen, feedShut, FEEDS, foldShut, FRED_PUBLIC, isShut, licensedOnly } from "../lib/licences";
import { ecbCross, parseEcbDaily, parseTreasuryPar } from "../lib/macro-sources";
import { secCalendar, secResultsDue, EMPTY_EARNINGS } from "../lib/earnings";

import { instructions } from "../lib/draft-prompt";
import { bookSchema, type Book, type Holding } from "../lib/holdings";
import { adoptMethodology, libraryEntry } from "../lib/library";
import { composeBook, listedTickers } from "../lib/compose-book";
import { correlationMatrix, describeR, matrixSeries, MIN_RETURNS, pearson } from "../lib/correlation";
import { bookDay, breadth, closedBy, closeInstant, completeDay, indexDrivers, marketDaySchema, moveOn, movers, newslettersSince, parseNasdaqCaps, parseYahooIntraday, sectorsOf, sessionOf } from "../lib/market-day";
import { inViewSize, squarify } from "../lib/treemap";
import { asClosed, closedOn, freshness } from "../lib/freshness";
import { agoText, CLOSED_AGO_MINUTES, countdownText, indexNow, isTradingHours, lastSession, liveBook, liveSession, marketCountdown, nextOpen, sinceClose, liveSubjects, parseYahooQuote, parseYahooSpark, type LiveSubject } from "../lib/live";
import { bigMoves, EMPTY_RECAPS, holdingMoves, keepRecap, listedSymbols, MOVE_ALERT_PCT, moveNotices, movesToExplain, parseRecapResponse, RECAP_MAX_SEARCHES, RECAP_NEWSLETTERS, recapDue, recapFilter, recapFor, recapRequestBody, recapsFileSchema, unwritten } from "../lib/market-recap";
import { MOVE_PREFIX, reconcile } from "../lib/alerts";
import { cadenceOf, fearGreedBand, fearGreedView, formatMarketFigure, keepFor, marketDef, monthsBefore, normalCdf, recessionProbability } from "../lib/markets";
import { parseBls, parseFearGreed, parseMtsReceipts, parseNyFedRates, parsePmms, parseSoma, parseUmich, trailingYear, yearOnYear } from "../lib/macro-sources";
import { buildEconomies, cellStrength, csvCells, economiesSchema, growthOnYear, IMF, OECD_OUTLOOK, parseBisRates, parseImf, parseOecdOutlook, parseOecdSeries } from "../lib/economies";
import { buildMarkets, earningsYield, parseMultpl, EMPTY_MARKETS, withCloses, yahooSymbol, formatChange, formatLevel, MARKETS, marketRangeOf, marketsSchema, marketSymbolsIn, parseFred, parseStooq, parseYahoo, rangeOf, rowFrom, withMarkets, type Fetched, type MarketRow } from "../lib/markets";
import { contextFor, draftSchema, evaluate, graph, methodologySchema } from "../lib/methodology";
import { describeOntology, evalCtx, fieldAvailable, FIELDS, inputsFor, SCREEN_IDS, SCREENS } from "../lib/ontology";
import { DEFAULT_PREFERENCES, EMPTY_RECORDS, preferencesSchema } from "../lib/preferences";
import { classRegister } from "../lib/class-register";
import { classifier, classTest, classWords, computeExpr, criterionLabel, passWords, type ClassDef, type Criterion } from "../lib/recipes";
import { benchmarksOf, marketSections, marketsTitle, marketSymbolsOf, screensOn, shownWhen, slotsOn } from "../lib/screens";
import { setupSchema } from "../lib/setup";
import { setZoneSource } from "../lib/time";
import { expandSampleCloses, pickSampleCloses, sampleClosesSchema } from "../lib/demo-markets";
import { acceptedUnix, extendedAnswerSchema, extendedMove, extendedSubjects, parseExtendedChart, SESSION_WORDS, sessionAt, sinceResults } from "../lib/extended-hours";

// The checks read days and clocks in one zone, as a person in Athens would see them.
setZoneSource(() => "Europe/Athens");

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const near = (a: number | null | undefined, b: number, tol = 0.01) => a !== null && a !== undefined && Math.abs(a - b) <= tol;
const today = "2026-10-11";

// --- The two feed formats ---------------------------------------------------------
const stooq = "Date,Open,High,Low,Close,Volume\n2026-10-06,500,505,499,501.5,1000\n2026-10-07,501,506,500,503,1000\nnot a row\n2026-10-08,503,508,502,0,1000\n2026-10-09,503,510,502,507.25,1200\n";
const spy = parseStooq(stooq);
check("stooq: Date and Close read, bad rows and zero closes dropped, oldest first", spy.length === 3 && spy[0].date === "2026-10-06" && spy[2].value === 507.25, JSON.stringify(spy));
const fred = "observation_date,VIXCLS\n2026-10-06,17.2\n2026-10-07,.\n2026-10-08,19.9\n2026-10-09,18.1\n";
const vix = parseFred(fred);
check("FRED: the dot for a missing day is skipped", vix.length === 3 && vix[1].value === 19.9);
const yahoo = JSON.stringify({ chart: { result: [{ meta: { symbol: "GC=F" }, timestamp: [1791590400, 1791676800, 1791763200], indicators: { quote: [{ close: [4012.5, null, 4030.25] }] } }], error: null } });
const gold = parseYahoo(yahoo);
check("Yahoo: timestamps become dates, a null close is skipped, oldest first", gold.length === 2 && gold[0].date === "2026-10-10" && gold[1].value === 4030.25, JSON.stringify(gold));
try {
  parseYahoo("<html>blocked</html>");
  check("Yahoo: a page that is not a chart throws", false);
} catch {
  check("Yahoo: a page that is not a chart throws", true);
}
const sourced = MARKETS.filter((m) => m.feed.kind === "sources");
check("every sourced indicator lists its sources in order; FRED, which does not answer Vercel, is never the only one nor the first; SPY and QQQ fall back three times; only those no other free source carries (the Nifty, the Fed's holdings, CNN's index, the Treasury's receipts) have one", sourced.every((m) => m.feed.kind === "sources" && (m.feed.sources.length >= 2 || ["NIFTY", "FEDBS", "FEARGREED", "TAXREC"].includes(m.symbol) || (m.feed.sources[0].kind === "eps_yield" && m.feed.sources[0].index.length >= 2))) && sourced.every((m) => m.feed.kind === "sources" && m.feed.sources[0].kind !== "fred") && sourced.filter((m) => m.feed.kind === "sources" && m.feed.sources.length === 4).length === 2, sourced.map((m) => `${m.symbol}:${m.feed.kind === "sources" ? m.feed.sources.map((s) => s.kind).join(">") : ""}`).join(" "));
// --- multpl and the earnings yield -----------------------------------------------
const multpl = `<table id="datatable"><tr><th>Date</th><th>Value</th></tr>
<tr class="odd"><td>Jun 30, 2026</td><td>&#x2002;295.36</td></tr>
<tr><td>May 31, 2026</td><td>
&#x2002;1,283.14
</td></tr><tr><td>Oct 9, 2026</td><td><abbr title="Estimate">&#8224;</abbr> (Estimate) 3.75%</td></tr><tr><td>not a date</td><td>1</td></tr></table>`;
const mp = parseMultpl(multpl);
check("multpl: dates in words become ISO, entities and the estimate mark are dropped, thousands read, oldest first", mp.length === 3 && mp[0].date === "2026-05-31" && mp[0].value === 1283.14 && mp[1].value === 295.36 && mp[2].date === "2026-10-09" && mp[2].value === 3.75, JSON.stringify(mp));
let multplThrew = false;
try {
  parseMultpl("<html>Too many requests</html>");
} catch {
  multplThrew = true;
}
check("multpl: a page with no table throws rather than reading as no earnings", multplThrew);
const ey = earningsYield([{ date: "2026-03-31", value: 260 }, { date: "2026-06-30", value: 300 }], [{ date: "2026-03-30", value: 6000 }, { date: "2026-04-01", value: 6500 }, { date: "2026-07-01", value: 6000 }, { date: "2026-07-02", value: 0 }]);
check("earnings yield: each close takes the latest earnings dated on or before it; a day before any earnings and a zero close are left out", ey.length === 2 && ey[0].date === "2026-04-01" && near(ey[0].value, 4, 1e-6) && ey[1].date === "2026-07-01" && near(ey[1].value, 5, 1e-6), JSON.stringify(ey));
const spxey = MARKETS.find((m) => m.symbol === "SPXEY")!;
check("the S&P 500 earnings yield has a source: multpl's earnings over the index from Yahoo, else FRED; never an ETF price, whose level is a tenth of the index", spxey.feed.kind === "sources" && spxey.feed.sources[0].kind === "eps_yield" && spxey.feed.sources[0].eps.table === "s-p-500-earnings" && spxey.feed.sources[0].index.map((x) => (x.kind === "yahoo" ? x.symbol : x.kind === "fred" ? x.id : "?")).join(",") === "^GSPC,SP500");
check("the indicators FRED alone used to carry each have a Yahoo Finance source first", ["VIX", "US10Y", "US2Y", "DXY", "WTI"].every((sym) => { const d = MARKETS.find((m) => m.symbol === sym); return d?.feed.kind === "sources" && d.feed.sources[0].kind === "yahoo" && d.feed.sources.some((s) => s.kind === "fred"); }));
check("FRED: the older DATE header reads too", parseFred("DATE,DGS10\n2026-10-09,4.1\n").length === 1);
let threw = 0;
for (const bad of ["<html>Exceeded the daily hits limit</html>", "", "a,b\n1,2"]) {
  try {
    parseStooq(bad);
  } catch {
    threw += 1;
  }
  try {
    parseFred(bad);
  } catch {
    threw += 1;
  }
}
check("a limit page, an empty answer or another file throws rather than reading as prices", threw === 6, String(threw));

// --- Rows and derived indicators ----------------------------------------------------
const days = (n: number, start: number, step: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 1 + i)).toISOString().slice(0, 10), value: start + i * step }));
const def = (s: string) => MARKETS.find((m) => m.symbol === s)!;
const row = rowFrom(def("US10Y"), days(300, 3.0, 0.005))!;
check("a row carries the latest level, its one-year range and its place in it", near(row.level, 3.0 + 299 * 0.005, 1e-9) && near(row.low1y, 3.0 + 48 * 0.005, 1e-9) && near(row.rangePct, 100, 1e-6) && row.asOf > "2026-07-01", JSON.stringify(row));
check("changes over a day, a month and a year, in level and in percent", near(row.change1d, 0.005, 1e-9) && near(row.change1m, 21 * 0.005, 1e-9) && near(row.change1y, 252 * 0.005, 1e-9) && near(row.change1dPct, (0.005 / (row.level - 0.005)) * 100, 1e-6));
check("a short series has no year change, never a zero", rowFrom(def("VIX"), days(10, 15, 0.1))!.change1yPct === null && rowFrom(def("VIX"), days(10, 15, 0.1))!.change1mPct === null);
check("an empty series is no row", rowFrom(def("VIX"), []) === null);
check("yields change in basis points, the rest in percent", formatChange(row, "1m") === "+10 bp" && formatChange({ ...row, unit: "number" }, "1m").endsWith("%") && formatLevel(2575.84, "money") === "2,576" && formatLevel(4.17, "pct") === "4.17%" && formatLevel(86.36, "ratio") === "86.4x");

const fetched: Fetched[] = [
  { symbol: "VIX", points: days(300, 14, 0.02) },
  { symbol: "US10Y", points: days(300, 3.5, 0.002) },
  { symbol: "US2Y", points: days(300, 3.9, -0.001) },
  { symbol: "GOLD", points: days(300, 2400, 1) },
  { symbol: "SILVER", points: days(300, 28, 0.01) },
  { symbol: "DXY", problem: "US dollar index could not be reached." },
  { symbol: "WTI", points: [] },
  { symbol: "SPY", points: days(300, 500, 0.5) },
  { symbol: "QQQ", points: days(300, 450, 0.4) },
];
const mk = buildMarkets(fetched, "test");
const by = new Map(mk.rows.map((r) => [r.symbol, r]));
check("every fetched indicator is a row; the dollar and oil are sentences, not zeros", by.size === 9 && !by.has("DXY") && !by.has("WTI") && mk.problems.some((p) => /dollar index could not be reached/.test(p)) && mk.problems.some((p) => /Oil, WTI came back empty/.test(p)), mk.problems.join(" | "));
check("the curve is 10y less 2y, day by day", near(by.get("US10Y2Y")!.level, by.get("US10Y")!.level - by.get("US2Y")!.level, 1e-6) && by.get("US10Y2Y")!.level < 0 === by.get("US10Y")!.level < by.get("US2Y")!.level);
check("the gold to silver ratio divides day by day", near(by.get("GOLDSILVER")!.level, by.get("GOLD")!.level / by.get("SILVER")!.level, 1e-3));
check("the earnings yield that was not fetched is a sentence, never a zero", !by.has("SPXEY") && mk.problems.some((p) => /earnings yield was not asked for/.test(p)));
check("a fetched earnings yield is a row in percent", (() => { const r = buildMarkets([{ symbol: "SPXEY", points: days(300, 3.5, 0.001) }], "t").rows.find((x) => x.symbol === "SPXEY"); return !!r && r.unit === "pct" && near(r.level, 3.5 + 299 * 0.001, 1e-9); })());
check("a daily series is trimmed to a year and a month, oldest first", mk.series.VIX.length === 274 && mk.series.VIX[0].date < mk.series.VIX[1].date);
check("SPY and QQQ keep five years, so an account older than a year is set against them from its start", mk.series.SPY.length === 300 && mk.series.QQQ.length === 300 && MARKETS.filter((m) => m.symbol === "SPY" || m.symbol === "QQQ").every((m) => m.years === 5));
check("as of is the newest date, and the whole validates", mk.asOf === mk.series.SPY.at(-1)!.date && marketsSchema.safeParse(mk).success);
const none = buildMarkets([], "test");
check("nothing fetched: no rows, every indicator a sentence", none.rows.length === 0 && none.problems.length === MARKETS.length && marketsSchema.safeParse(none).success);

// --- Into a book --------------------------------------------------------------------
const dani = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
const bare: Book = { ...dani, series: undefined };
const lent = withMarkets(bare, mk, ["SPY", "QQQ", "VIX", "ZZZ"]);
check("the feed lends SPY, QQQ and VIX to a book with no series; an unknown symbol gets nothing", !!lent.series && Object.keys(lent.series.benchmarks).sort().join(",") === "QQQ,SPY,VIX" && lent.series.nav.length === 0 && lent.markets === mk, Object.keys(lent.series?.benchmarks ?? {}).join(","));
const kept = withMarkets(dani, mk, ["SPY", "QQQ"]);
check("a series the broker's file supplied is kept over the feed's", kept.series!.benchmarks.SPY === dani.series!.benchmarks.SPY && kept.series!.benchmarks.QQQ === mk.series.QQQ && kept.series!.nav.length === dani.series!.nav.length && /\+/.test(kept.series!.source));
check("naming nothing lays the markets on and leaves the series alone", withMarkets(dani, mk, []).series === dani.series && withMarkets(bare, mk, []).series === undefined);
check("the vault's copy of the book validates without markets", bookSchema.safeParse(dani).success && bookSchema.safeParse(kept).success);

// --- The ontology -------------------------------------------------------------------
check("market fields are supplied by the feed, which asks nothing of the person", fieldAvailable("market_level", []) && inputsFor("market_level") === null && inputsFor("dividend_yield_pct") === null && inputsFor("value")?.includes("ibkr") === true && FIELDS.market_symbol.object === "markets");
const ctxM = evalCtx(kept, today);
const level = (symbol: string) => computeExpr({ op: "measure", of: { measure: "max", over: "markets", field: "market_level", where: [{ field: "market_symbol", is: "eq", value: symbol }] } }, "number", ctxM, ["ibkr"]);
const vixLevel = level("VIX");
check("a measure over markets reads the indicator's level", vixLevel.kind === "scalar" && near(vixLevel.value, by.get("VIX")!.level, 1e-9) && !vixLevel.needs.length, JSON.stringify(vixLevel));
const dxy = level("DXY");
const dxySum = computeExpr({ op: "measure", of: { measure: "sum", over: "markets", field: "market_level", where: [{ field: "market_symbol", is: "eq", value: "DXY" }] } }, "number", ctxM, ["ibkr"]);
check("an indicator the feed did not return is no reading, even for a sum", dxy.kind === "scalar" && dxy.value === null && dxySum.kind === "scalar" && dxySum.value === null && !dxy.needs.length);
const byIndicator = computeExpr({ op: "measure", of: { measure: "max", over: "markets", field: "market_change_1y_pct", where: [] } }, "pct", ctxM, ["ibkr"], "symbol");
check("markets group by indicator", byIndicator.kind === "series" && byIndicator.points.length === 9 && byIndicator.points.every((p) => by.has(p.key as never)));
const age = computeExpr({ op: "measure", of: { measure: "max", over: "markets", field: "market_age_days", where: [{ field: "market_symbol", is: "eq", value: "VIX" }] } }, "days", ctxM, ["ibkr"]);
check("age is days from the latest close to today", age.kind === "scalar" && age.value !== null && age.value >= 0);
check("a book without markets measures nothing over them, never a zero", (() => { const r = computeExpr({ op: "measure", of: { measure: "sum", over: "markets", field: "market_level", where: [] } }, "number", evalCtx({ ...dani, markets: undefined }, today), ["ibkr"]); return r.kind === "scalar" && r.value === null; })());
check("the drafter is told about markets and gaps", /market_symbol/.test(describeOntology()) && /Market indicators: a figure over markets/.test(describeOntology()) && /gaps:/.test(instructions(setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr"], tradesOptions: true, helperName: null, methodology: null, updated: today }), today, "document")));
check("symbols named in market filters", marketSymbolsIn([{ field: "market_symbol", is: "eq", value: "vix" }, { field: "market_symbol", is: "in", value: ["GOLD", "SILVER"] }, { field: "market_level", is: "gt", value: 1 }]).join(",") === "VIX,GOLD,SILVER");

// --- Classes that count ---------------------------------------------------------------
const seven: ClassDef["criteria"] = [
  { field: "roic_pct", is: "gte", value: 20 },
  { field: "gross_margin_pct", is: "gte", value: 40 },
  { field: "operating_leverage", is: "gt", value: 0 },
  { field: "fcf_conversion", is: "gte", value: 0.9 },
  { field: "interest_cover", is: "gt", value: 15 },
  { field: "revenue_growth_pct", is: "gt", value: 0 },
  { field: "fcf_per_share_growth_pct", is: "gt", value: 0 },
];
const cm: ClassDef = { id: "cm", label: "Compounding Machine", required: [{ field: "revenue_growth_pct", is: "lte", value: 20 }], criteria: seven, minimum: 5 };
const tr: ClassDef = { id: "tr", label: "Transitional", required: [{ field: "revenue_growth_pct", is: "gt", value: 20 }], criteria: seven, minimum: 4 };
const dg: ClassDef = { id: "dg", label: "Disruptive Growth", criteria: [{ field: "revenue_growth_pct", is: "gt", value: 20 }] };
const base = dani.holdings.find((h) => h.symbol === "AAPL")!;
const withF = (f: Partial<Record<string, number | null>>): Holding => ({ ...base, id: `t-${Object.values(f).join("-")}`, fundamentals: { roic_pct: 25, gross_margin_pct: 45, operating_leverage: 1.2, fcf_conversion: 1.0, interest_cover: 20, revenue_growth_pct: 10, engine_growth_pct: f.revenue_growth_pct ?? 10, fcf_per_share_growth_pct: 5, ...f } as Holding["fundamentals"] });
const ctxC = evalCtx(dani, today);
const cls = classifier([cm, tr, dg], ctxC);
check("seven of seven, growth 10: a Compounding Machine", cls(withF({})) === "cm");
check("five of seven, growth 10: still a Compounding Machine", cls(withF({ interest_cover: 5, operating_leverage: -0.2 })) === "cm");
check("four of seven, growth 10: no class", cls(withF({ interest_cover: 5, operating_leverage: -0.2, fcf_conversion: 0.5 })) === null);
check("four of seven, growth 25: Transitional", cls(withF({ revenue_growth_pct: 25, interest_cover: 5, operating_leverage: -0.2, fcf_conversion: 0.5 })) === "tr");
check("two of seven, growth 25: Disruptive Growth", cls(withF({ revenue_growth_pct: 25, interest_cover: 5, operating_leverage: -0.2, fcf_conversion: 0.5, roic_pct: 5, gross_margin_pct: 20 })) === "dg");
const unread = classTest(cm, withF({ interest_cover: null, operating_leverage: null, fcf_conversion: null }), ctxC);
check("a threshold with no reading does not hold and is counted as unread", unread.passes === 4 && unread.unread === 3 && unread.needed === 5 && !unread.holds && cls(withF({ interest_cover: null, operating_leverage: null, fcf_conversion: null })) === null, JSON.stringify({ passes: unread.passes, unread: unread.unread }));
check("the required gate is read apart from the count", classTest(cm, withF({ revenue_growth_pct: 25 }), ctxC).holds === false && classTest(cm, withF({ revenue_growth_pct: 25 }), ctxC).passes === 7);
check("a class without a minimum needs every criterion, as before", classifier([{ id: "x", label: "X", criteria: [{ field: "asset_class", is: "eq", value: "equity" }, { field: "roic_pct", is: "gte", value: 20 }] }], ctxC)(withF({})) === "x" && classifier([{ id: "x", label: "X", criteria: [{ field: "asset_class", is: "eq", value: "equity" }, { field: "roic_pct", is: "gte", value: 20 }] }], ctxC)(withF({ roic_pct: 10 })) === null);
check("a minimum above the count of criteria does not validate", !methodologySchema.safeParse({ ...adoptMethodology(libraryEntry("hcmp")!), classes: [{ ...cm, minimum: 8 }] }).success);
check("the class in words carries the gate and the count", /at most 20; then at least 5 of 7: Return on invested capital at least 20/.test(classWords(cm)) && !/at least/.test(classWords(dg).split(":")[0]), classWords(cm));

// --- The library and the screen -----------------------------------------------------
const hcmp = adoptMethodology(libraryEntry("hcmp")!);
check("HCMP's archetypes count 71% and 57% of the measurable thresholds behind a growth gate", hcmp.classes.find((c) => c.id === "cm")?.minimumShare === 71 && hcmp.classes.find((c) => c.id === "tr")?.minimumShare === 57 && hcmp.classes.find((c) => c.id === "cm")?.required?.[0].field === "engine_growth_pct" && hcmp.classes.find((c) => c.id === "cm")?.criteria.length === 7);
// The v3.4 measurement rules, as the library writes them: C4 (ROIC on NOPAT at 21%, non-positive capital passes, goodwill), C6 (FCF less intangibles, a lender is not measured), C7 (net interest for a net-cash company), C8 (margin against the prior year).
const hcmpCm = hcmp.classes.find((c) => c.id === "cm")!;
const v34 = (f: Partial<Record<string, number | null>>): Holding => ({ ...base, id: `v-${Object.values(f).join("-")}`, fundamentals: { roic_pct: 25, gross_margin_pct: 45, operating_margin_change_pts: 1.2, fcf_conversion: 1.0, interest_cover: 20, revenue_growth_pct: 10, engine_growth_pct: f.revenue_growth_pct ?? 10, fcf_per_share_growth_pct: 5, loans_to_equity: 0, nonoperating_share_of_net_income_pct: 0, cash_to_debt_pct: 40, net_debt: 100, net_interest_expense: 5, invested_capital: 1000, operating_margin_pct: 20, goodwill_share_of_capital_pct: 10, ...f } as Holding["fundamentals"] });
const v34cls = classifier(hcmp.classes, ctxC);
check("v3.4: four of seven with growth above 20 is Transitional, five of seven without is a Compounding Machine", v34cls(v34({ roic_pct: 13.3, fcf_conversion: 0.6, fcf_per_share_growth_pct: -3, revenue_growth_pct: 25 })) === "tr" && v34cls(v34({ roic_pct: 13.3, fcf_conversion: 0.6 })) === "cm" && v34cls(v34({ roic_pct: 13.3, fcf_conversion: 0.6, fcf_per_share_growth_pct: -3 })) === null);
const lender = classTest(hcmpCm, v34({ loans_to_equity: 1.5, fcf_conversion: 1.3 }), ctxC);
check("C6: a lender's FCF conversion is not measured and leaves the count", !lender.criteria[3].read && /not measured: Loans receivable to equity at most 1/.test(lender.criteria[3].note ?? "") && lender.unread === 1 && lender.passes === 6 && lender.needed === 5 && lender.holds, JSON.stringify(lender.criteria[3]));
const lenderGrowth = v34({ loans_to_equity: 1.5, revenue_growth_pct: 46, roic_pct: 10, operating_margin_change_pts: -0.5, interest_cover: 13.7 });
check("C6 on a fast-growing lender: three of six measurable is below 57%, so Disruptive Growth", v34cls(lenderGrowth) === "dg");
const netCash = classTest(hcmpCm, v34({ interest_cover: null, net_interest_expense: -5, net_debt: -100, cash_to_debt_pct: null }), ctxC);
check("C7: net interest income with net cash passes threshold 5 by its alternative", netCash.criteria[4].pass && netCash.criteria[4].read && /met by Net interest expense at most 0 \(when Net debt at most 0\)/.test(netCash.criteria[4].note ?? "") && netCash.criteria[4].field === "net_interest_expense", JSON.stringify(netCash.criteria[4]));
check("C7: cash at 75% of debt lets net interest cover count; at 40% the gross cover stands", classTest(hcmpCm, v34({ interest_cover: 12, interest_cover_net: 30, cash_to_debt_pct: 80 }), ctxC).criteria[4].pass && !classTest(hcmpCm, v34({ interest_cover: 12, interest_cover_net: 30, cash_to_debt_pct: 40 }), ctxC).criteria[4].pass);
const negative = classTest(hcmpCm, v34({ roic_pct: null, invested_capital: -200 }), ctxC);
check("C4: invested capital at or below zero with a positive operating margin passes ROIC", negative.criteria[0].pass && /met by Invested capital at most 0/.test(negative.criteria[0].note ?? "") && !classTest(hcmpCm, v34({ roic_pct: null, invested_capital: -200, operating_margin_pct: -3 }), ctxC).criteria[0].pass);
check("C4: an acquirer with goodwill above half of capital is read excluding goodwill", classTest(hcmpCm, v34({ roic_pct: 12, roic_ex_goodwill_pct: 35, goodwill_share_of_capital_pct: 60 }), ctxC).criteria[0].pass && !classTest(hcmpCm, v34({ roic_pct: 12, roic_ex_goodwill_pct: 35, goodwill_share_of_capital_pct: 30 }), ctxC).criteria[0].pass);
check("a near miss on the share: four of six measurable is 67%, one short of a Compounding Machine", (() => { const t = classTest(hcmpCm, v34({ fcf_per_share_growth_pct: null, fcf_conversion: 0.87, interest_cover: 5.7 }), ctxC); return t.passes === 4 && t.unread === 1 && t.needed === 5 && !t.holds && passWords(t) === "4 of 6 hold (5 needed); 1 of 7 without a reading"; })());
check("nothing measurable: the class does not hold", !classTest({ id: "e", label: "E", criteria: [{ field: "roic_pct", is: "gte", value: 20 }], minimumShare: 50 }, v34({ roic_pct: null }), ctxC).holds);
const roicCriterion = hcmpCm.criteria[0] as Criterion;
check("a criterion in words carries its alternatives and their conditions", criterionLabel(roicCriterion) === "Return on invested capital at least 20, or Invested capital at most 0 (when Operating margin above 0), or ROIC excluding goodwill at least 20 (when Goodwill share of invested capital above 50)", criterionLabel(roicCriterion));
check("the class in words says the share of the measurable", /at least 71% of those measurable among 7: Return on invested capital at least 20, or/.test(classWords(hcmpCm)), classWords(hcmpCm));
check("a class cannot give both a minimum and a minimum share", !methodologySchema.safeParse({ ...hcmp, classes: [{ ...hcmpCm, minimum: 5 }] }).success);
const hcmpCls = classifier(hcmp.classes, ctxC);
check("HCMP sorts a fictional holding the same way", hcmpCls(withF({})) === "cm" && hcmpCls(withF({ revenue_growth_pct: 25, interest_cover: 5, operating_leverage: -0.2, fcf_conversion: 0.5 })) === "tr");
// --- The Classification Register: the test laid out by holding ---------------------
{
  const trH = v34({ revenue_growth_pct: 25, roic_pct: 13.3, fcf_conversion: 0.6, fcf_per_share_growth_pct: -3 });
  const lenderH = { ...v34({ loans_to_equity: 1.5, fcf_conversion: 1.3 }), id: "lender" };
  const cashH = { ...v34({ interest_cover: null, net_interest_expense: -5, net_debt: -100, cash_to_debt_pct: null }), id: "netcash" };
  const noneH = { ...v34({ roic_pct: 13.3, fcf_conversion: 0.6, fcf_per_share_growth_pct: -3 }), id: "none" };
  const reg = classRegister(hcmp.classes, [{ symbol: "TRX", name: "T", weight: 5, holding: trH }, { symbol: "LND", name: "L", weight: 4, holding: lenderH }, { symbol: "NCS", name: "N", weight: 3, holding: cashH }, { symbol: "NON", name: "X", weight: 2, holding: noneH }], ctxC);
  const shared = reg.columns.filter((c) => !c.requiredIn.length && c.classes.join(",") === "Compounding Machine,Transitional");
  const gates = reg.columns.filter((c) => c.requiredIn.length);
  check("register: one column per criterion, each once; HCMP's seven thresholds are shared by two classes, the two growth gates come first, and Transitional's gate is Disruptive Growth's criterion", shared.length === 7 && gates.length === 2 && reg.columns.length === 9 && reg.columns.slice(0, 2).every((c) => c.requiredIn.length) && gates[1].classes.join(",") === "Transitional,Disruptive Growth" && gates[1].requiredIn.join(",") === "Transitional", reg.columns.map((c) => `${c.label}[${c.classes.join("/")}|${c.requiredIn.join("/")}]`).join(" | "));
  const optionH = { ...base, id: "opt", assetClass: "option" as const, fundamentals: undefined };
  const withOpt = classRegister(hcmp.classes, [{ symbol: "TRX", name: "T", weight: 5, holding: trH }, { symbol: "OPT", name: "O", weight: 1, holding: optionH }], ctxC);
  check("register: a holding no criterion reads and no class places is left out and named", withOpt.rows.length === 1 && withOpt.left.join(",") === "OPT", JSON.stringify(withOpt.left));
  const [t, l, n, x] = reg.rows;
  check("register: the class and its count come from the test, and the classes ahead say what kept it out", t.classLabel === "Transitional" && t.passes === 4 && t.why.length === 1 && /^Compounding Machine: required Disruption engine growth at most 20 does not hold \(25\.0%\)/.test(t.why[0]), `${t.classLabel} ${t.passes} ${t.why.join(" / ")}`);
  const fcfCol = shared.find((c) => c.test.startsWith("FCF conversion") || /conversion/i.test(c.label))!;
  check("register: a criterion whose condition fails is not measured, never a fail", l.classLabel === "Compounding Machine" && l.cells[fcfCol.key]?.status === "not_measured" && l.cells[fcfCol.key]?.value === null, JSON.stringify(l.cells[fcfCol.key]));
  const coverCol = shared.find((c) => /interest cover/i.test(c.label))!;
  check("register: an alternative that meets a criterion passes, with its reading and the note naming it", n.cells[coverCol.key]?.status === "pass" && /met by Net interest expense/.test(n.cells[coverCol.key]?.note ?? ""), JSON.stringify(n.cells[coverCol.key]));
  check("register: a holding no class places names the nearest class and why each class does not hold", x.classLabel === null && /^nearest, /.test(x.count) && x.why.length === 3, `${x.count} / ${x.why.join(" / ")}`);
  check("register: a reading is in its field's unit", reg.rows[0].cells[shared[0].key]?.value === "13.3%", reg.rows[0].cells[shared[0].key]?.value ?? "none");
}
const shownH = shownWhen(hcmp, kept, EMPTY_RECORDS, null);
check("HCMP's macro section puts the session on the Dashboard, above the book's day; After the close and What happened are on At the Close (Hamza, 18 Oct 2026), the podcasts after them (20 Oct 2026)", slotsOn("today", shownH).join(",").includes("market_indices,market_heatmap,market_drivers,market_movers,book_day") && slotsOn("after_close", shownH).join(",") === "close_brief,extended_hours,market_today,company_news,podcasts" && !(SCREEN_IDS as readonly string[]).includes("markets_today"), slotsOn("today", shownH).join(","));
check("HCMP's macro section switches the Markets screen on, with every slot", shownH.markets && screensOn(shownH).includes("markets") && slotsOn("markets", shownH).join(",") === "market_sections,market_rules,market_cycle,market_liquidity,market_economy,market_world,market_calendar,market_odds,market_credit,market_lines,your_data_markets,market_economies", slotsOn("markets", shownH).join(","));
{
  const row = (symbol: string) => ({ symbol, low1y: null, high1y: null }) as unknown as Parameters<typeof marketRangeOf>[1][number];
  const dir = (symbol: string) => marketRangeOf({ symbol, field: "market_change_1m_pct" }, [row(symbol)], 2)?.better;
  check("a change is better in the indicator's own direction: none for the gold to silver ratio or a yield, lower for the VIX, higher for an index", dir("GOLDSILVER") === null && dir("US10Y") === null && dir("US10Y2Y") === null && dir("VIX") === "low" && dir("SPY") === "high", [dir("GOLDSILVER"), dir("VIX"), dir("SPY")].join(","));
}
check("the methodology's own section names the Macro screen's first line", marketsTitle(hcmp) === "Macroeconomic Analysis & Time-Horizon Framework" && marketSections(hcmp).length === 1 && marketsTitle(null) === "Macro");
check("the indicators HCMP names, in its order", marketSymbolsOf(hcmp).join(",") === "VIX,US10Y,US2Y,US10Y2Y,GOLDSILVER,DXY,WTI,SPXEY");
const mInd = methodologySchema.parse(JSON.parse(readFileSync("data/samples/methodology.individual.json", "utf8")));
const mDiv = methodologySchema.parse(JSON.parse(readFileSync("data/samples/methodology.dividend_growth.json", "utf8")));
check("the options sample reads the VIX; dividend growth does not, so its Markets screen is off", shownWhen(mInd, kept, EMPTY_RECORDS, null).markets && !shownWhen(mDiv, kept, EMPTY_RECORDS, null).markets && !screensOn(shownWhen(mDiv, kept, EMPTY_RECORDS, null)).includes("markets"));
const findings = evaluate(hcmp, kept, today, ["ibkr"]);
const vixF = findings.find((f) => f.rule.id === "vix-complacency")!;
const dxyF = findings.find((f) => f.rule.id === "curve-inverted")!;
check("the VIX watch reads the feed's level and cites section 0", vixF.status !== "n/a" && vixF.status !== "manual" && vixF.rule.section === "0" && vixF.actual !== null, `${vixF.status} ${vixF.actual}`);
check("the curve watch reads the derived spread", dxyF.status === "pass" || dxyF.status === "near" || dxyF.status === "fail", dxyF.status);
const noFeed = evaluate(hcmp, { ...dani, markets: { ...EMPTY_MARKETS, problems: ["x"] } }, today, ["ibkr"]);
check("without the feed a market rule has no reading, never a pass", noFeed.find((f) => f.rule.id === "vix-panic")!.status === "n/a");
const ctxH = contextFor(kept, today, hcmp);
check("a market figure in HCMP's section computes on the lent markets", (() => { const f = hcmp.figures.find((x) => x.id === "yield-curve")!; const r = computeExpr(f.expr, f.unit, ctxH, ["ibkr"]); return r.kind === "scalar" && near(r.value, by.get("US10Y2Y")!.level, 1e-6); })());
check("the graph links market fields to the feed", graph(hcmp).nodes.some((n) => n.id === "input:feed") && graph(hcmp).edges.some((e) => e.from === "field:market_level" && e.to === "input:feed"));

// --- Gaps ------------------------------------------------------------------------
const draft = draftSchema.safeParse({ ...Object.fromEntries(Object.entries(hcmp).filter(([k]) => k !== "source" && k !== "origin" && k !== "gaps")) });
check("a draft without gaps reads as none", draft.success && draft.data.gaps.length === 0);
check("HCMP's library entry names what the ontology cannot say yet, and nothing of a portfolio", hcmp.gaps.length === 3 && !hcmp.gaps.some((g) => /earnings yield/i.test(g.asks)) && hcmp.gaps.every((g) => g.section && g.asks && g.missing) && !/\b(AMZN|GOOGL|META|\$[\d,]+)\b/.test(JSON.stringify(hcmp.gaps)));
check("a gap over 300 characters does not validate", !draftSchema.safeParse({ ...draft.success ? draft.data : {}, gaps: [{ section: "0", asks: "x".repeat(301), missing: "y" }] }).success);

// --- The sample -----------------------------------------------------------------
const sample = marketsSchema.parse(JSON.parse(readFileSync("data/samples/markets.json", "utf8")));
check("the fictional sample validates and carries every indicator, the earnings yield and the recession probability among them", sample.rows.length === MARKETS.length && sample.rows.some((r) => r.symbol === "RECPROB") && sample.problems.length === 0 && sample.rows.some((r) => r.symbol === "SPXEY") && sample.source === "fictional sample" && sample.asOf === (JSON.parse(readFileSync("data/samples/showcase.book.json", "utf8")) as { asOf: string }).asOf);
check("the sample's derived indicators agree with their parts", near(sample.rows.find((r) => r.symbol === "US10Y2Y")!.level, sample.rows.find((r) => r.symbol === "US10Y")!.level - sample.rows.find((r) => r.symbol === "US2Y")!.level, 1e-3));


// --- One book for the screens and the reports -------------------------------------
// A review is built on the same book as the screens: the filings' figures and the feed's SPY series both reach it.
{
  const parts = { records: null, research: null, markets: mk, methodology: hcmp, filings: { version: 1 as const, updated: "2026-10-13T06:00:00Z", bySymbol: { AAPL: { symbol: "AAPL", ticker: "AAPL", cik: 1, name: "Sample", readAt: "2026-10-13T06:00:00Z", latestQuarter: "2026Q2", values: { check_only_pct: 7 }, notes: [], error: null, sector: "Information Technology" } } } };
  const composed = composeBook(bare, parts)!;
  check("the composed book carries the filings' figures and sector", composed.holdings.find((h) => h.symbol === "AAPL")?.fundamentals?.check_only_pct === 7 && composed.holdings.find((h) => h.symbol === "AAPL")?.sector === (bare.holdings.find((h) => h.symbol === "AAPL")?.sector ?? "Information Technology"));
  check("the composed book lends the methodology's benchmarks their series", benchmarksOf(hcmp).length === 0 || benchmarksOf(hcmp).every((b) => !(b in mk.series) || !!composed.series?.benchmarks[b]), benchmarksOf(hcmp).join(","));
  const run = readFileSync("lib/report-run.ts", "utf8");
  const ws = readFileSync("lib/workspace.ts", "utf8");
  check("the reports and the screens compose the book with the one function", /composeBook\(/.test(run) && /composeBook\(/.test(ws) && !/applyFilings\(|applyResearch\(|withMarkets\(/.test(run));
}

// ---------------------------------------------------------------------------
// Closes per holding and the correlation matrix
{
  check("a plain ticker goes to the price feed as itself, a share class with a dash", yahooSymbol("amzn") === "AMZN" && yahooSymbol("BRK B") === "BRK-B" && yahooSymbol("BRK.B") === "BRK-B");
  check("an option symbol, an ISIN or a fund's name never becomes a price request", yahooSymbol("AAPL 261120C00245000") === null && yahooSymbol("GR0000000000") === null && yahooSymbol("Alpha Ventures II") === null && yahooSymbol("DEP-12M") === null);
  const sample = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
  check("the listed tickers are the shares and funds, once each, never options or cash", JSON.stringify(listedTickers(sample)) === JSON.stringify(["AAPL", "VOO"]));
  const closesFile = sampleClosesSchema.parse(JSON.parse(readFileSync("data/samples/closes.json", "utf8")));
  const closes = pickSampleCloses(expandSampleCloses(closesFile), closesFile, "AAPL,VOO,SPY,QQQ", "2026-10-11", 400);
  {
    // The demo's closes (4 Nov 2026): every symbol the showcase holds or traded, SPY and QQQ, the event reports' funds; the book's own closes where it carries them.
    const all = expandSampleCloses(closesFile);
    const show = bookSchema.parse(JSON.parse(readFileSync("data/samples/showcase.book.json", "utf8")));
    const traded = [...new Set((show.transactions ?? []).filter((t) => t.kind === "buy" || t.kind === "sell").map((t) => t.symbol.toUpperCase()))];
    const wanted = [...new Set([...show.holdings.map((h) => h.symbol.toUpperCase()), ...traded, "SPY", "QQQ", "IWM", "TLT", "UUP", "GLD", "USO"])];
    check("the demo's closes carry every symbol the showcase holds or traded, SPY, QQQ and the event reports' funds", wanted.every((s) => (all[s]?.length ?? 0) > 250), wanted.filter((s) => !((all[s]?.length ?? 0) > 250)).join(","));
    const same = Object.entries({ ...(show.series?.holdings ?? {}), ...(show.series?.benchmarks ?? {}) }).every(([s, pts]) => pts.every((p) => Math.abs((all[s]?.find((x) => x.date === p.date)?.value ?? 0) - p.value) <= 0.051));
    check("the demo's closes are the book's own where the book carries them", same);
    const picked = pickSampleCloses(all, closesFile, "MA,ZZZZ", "2026-11-04", 30);
    check("the demo answers as the feed does: the tickers asked, the days asked, a sentence for one it lacks", Object.keys(picked.series).join(",") === "MA" && picked.series.MA.every((p) => p.date >= "2026-10-05") && picked.problems.length === 1 && (all.SPY?.[0]?.date ?? "") <= "2019-01-02");
  }
  const own = { ...sample, series: { ...(sample.series ?? { nav: [], benchmarks: {}, source: "x" }), holdings: { AAPL: [{ date: "2026-01-02", value: 1 }, { date: "2026-01-05", value: 2 }] } as Record<string, { date: string; value: number }[]> } };
  const laid = withCloses(own, closes);
  check("the feed's closes are laid on for the holdings without any, and a source's own closes are kept", laid.series?.holdings?.AAPL?.length === 2 && (laid.series?.holdings?.VOO?.length ?? 0) > 200);
  check("closes leave the vault's copy untouched", own.series.holdings.VOO === undefined);
  const mk = buildMarkets(MARKETS.filter((d) => d.feed.kind === "sources").map((d) => ({ symbol: d.symbol, points: (JSON.parse(readFileSync("data/samples/markets.json", "utf8")).series[d.symbol] ?? []) })), "sample");
  const composed = composeBook(sample, { records: EMPTY_RECORDS, filings: null, research: null, markets: mk, methodology: null, closes })!;
  check("the composed book carries the closes beside the lent benchmarks", (composed.series?.holdings?.AAPL?.length ?? 0) > 200 && composed.series?.nav.length === sample.series?.nav.length);
  const kept = withMarkets(laid, mk, ["SPY", "QQQ"]);
  check("lending the benchmarks keeps the closes per holding", (kept.series?.holdings?.VOO?.length ?? 0) > 200);

  check("Pearson of a series with itself is 1, with its mirror -1, of a flat series none", near(pearson([1, 2, 3, 5], [1, 2, 3, 5]), 1, 1e-9) && near(pearson([1, 2, 3, 5], [-1, -2, -3, -5]), -1, 1e-9) && pearson([1, 1, 1], [1, 2, 3]) === null);
  const days = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  const walk = (seed: number, f: (i: number) => number) => days.map((date, i) => ({ date, value: 100 * (1 + 0.001 * i) + f(i) + seed }));
  const a = walk(0, (i) => Math.sin(i) * 3);
  const b = walk(5, (i) => Math.sin(i) * 3);
  const c = walk(0, (i) => -Math.sin(i) * 3);
  const late = days.slice(70).map((date, i) => ({ date, value: 50 + i }));
  const m = correlationMatrix([{ symbol: "A", kind: "holding", points: a }, { symbol: "B", kind: "holding", points: b }, { symbol: "C", kind: "holding", points: c }, { symbol: "NEW", kind: "holding", points: late }, { symbol: "SPY", kind: "benchmark", points: a }], days[days.length - 1], "1M");
  check("the matrix is symmetric with 1 on the diagonal", !!m && m.r.every((row, i) => row.every((v, j) => (i === j ? v === 1 : v === m.r[j][i]))));
  check("two holdings that move alike read near +1, against each other near -1", !!m && (m.r[0][1] ?? 0) > 0.95 && (m.r[0][2] ?? 0) < -0.95, m ? `${m.r[0][1]?.toFixed(3)} ${m.r[0][2]?.toFixed(3)}` : "no matrix");
  check("a holding that started trading inside the window is named, never filled", !!m && !m.rows.some((r) => r.symbol === "NEW") && m.left.some((l) => l.symbol === "NEW" && /only \d+ of the 21 sessions/.test(l.why)), JSON.stringify(m?.left));
  check("the window reads the benchmark's sessions: 21 for a month", m?.sessions === 21 && m.from === days[days.length - 22]);
  check("the benchmark closes the rows", m?.rows[m.rows.length - 1].symbol === "SPY" && m.rows[m.rows.length - 1].kind === "benchmark");
  check("the holdings' average pair leaves the benchmark out", !!m && m.average !== null && near(m.average, ((m.r[0][1] as number) + (m.r[0][2] as number) + (m.r[1][2] as number)) / 3, 1e-9));
  check("fewer than two readable series is no matrix, never an empty one", correlationMatrix([{ symbol: "A", kind: "holding", points: a }, { symbol: "B", kind: "holding", points: [] }], days[79], "1M") === null);
  check("a coefficient on too few common sessions is left empty", MIN_RETURNS >= 10);
  const ds = matrixSeries(composed, ["AAPL", "VOO"], ["SPY", "QQQ"]);
  const dm = correlationMatrix(ds, "2026-10-11", "3M");
  check("the demo's matrix reads AAPL, VOO, SPY and QQQ over three months", !!dm && dm.rows.map((r) => r.symbol).join(",") === "AAPL,VOO,SPY,QQQ" && dm.sessions === 63, dm ? `${dm.rows.map((r) => r.symbol)} ${dm.sessions}` : "none");
  check("a weekly benchmark in the broker's file gives way to the feed's daily one", ds.find((x) => x.symbol === "SPY")!.points.length > (sample.series?.benchmarks.SPY?.length ?? 0));
  check("an index fund moves with its index", !!dm && (dm.r[1][2] ?? 0) > 0.9, dm ? String(dm.r[1][2]) : "none");
  check("the words follow the sign and the size", describeR(0.85) === "moved together very closely" && describeR(-0.4) === "moved against each other loosely" && describeR(0.1) === "moved together barely");
  const feed = readFileSync("lib/markets-feed.ts", "utf8");
  check("a ticker never reaches a log line", /fetchSource\(\{ kind: "yahoo", symbol: ticker \}, today, "a holding's closes", days\)/.test(feed) && /closes: \$\{problems.length\} of/.test(feed));
}

// ---------------------------------------------------------------------------
// The last session: the clock, the moves, the heat map and the movers
{
  // 14 Oct 2026: New York is on summer time (UTC-4).
  check("before 16:20 in New York the last closed session is the weekday before", closedBy(new Date("2026-10-14T20:10:00Z")) === "2026-10-13");
  check("from 16:20 in New York it is today", closedBy(new Date("2026-10-14T20:25:00Z")) === "2026-10-14");
  check("an Athens morning reads the session of the night before", closedBy(new Date("2026-10-14T05:30:00Z")) === "2026-10-13");
  check("a weekend walks back to Friday", closedBy(new Date("2026-10-18T15:00:00Z")) === "2026-10-16" && closedBy(new Date("2026-10-19T12:00:00Z")) === "2026-10-16");
  check("a holiday is settled by the index's own closes, never a table", sessionOf([{ date: "2026-11-25", value: 1 }, { date: "2026-11-27", value: 2 }], "2026-11-26") === "2026-11-25");
  check("the close is 16:00 in New York, in UTC, summer and winter", closeInstant("2026-10-13") === "2026-10-13T20:00:00.000Z" && closeInstant("2026-12-14") === "2026-12-14T21:00:00.000Z");
  const pts = [{ date: "2026-10-09", value: 100 }, { date: "2026-10-12", value: 102 }, { date: "2026-10-13", value: 96.9 }];
  const mv = moveOn(pts, "2026-10-13");
  check("a move is the close against the close before, in percent", !!mv && mv.prevClose === 102 && near(mv.changePct, -5, 1e-9), JSON.stringify(mv));
  check("no close that session is no move, never a zero", moveOn(pts, "2026-10-14") === null && moveOn(pts, "2026-10-09") === null);
  const caps = parseNasdaqCaps(JSON.stringify({ data: { rows: [{ symbol: "AAPL", marketCap: "3,700,000,000,000.00" }, { symbol: "BRK/B", marketCap: "1,050,000,000,000" }, { symbol: "ZERO", marketCap: "" }] } }));
  check("the screener's market values read, a share class in the SEC's spelling, an empty one skipped", caps.get("AAPL") === 3.7e12 && caps.get("BRK-B") === 1.05e12 && !caps.has("ZERO"));
  let threw = false;
  try {
    parseNasdaqCaps("<html>Access denied</html>");
  } catch {
    threw = true;
  }
  check("a screener answer that is not the screener throws, so the map says it sized alike", threw);
  const intra = parseYahooIntraday(JSON.stringify({ chart: { result: [{ meta: { chartPreviousClose: 7807.1 }, timestamp: [1791900000, 1791900300, 1791900600], indicators: { quote: [{ close: [7800, null, 7805.45] }] } }] } }));
  check("an intraday chart reads its prices and the close before; a null price is skipped", intra.prevClose === 7807.1 && intra.points.length === 2 && intra.points[1].v === 7805.45);
  const day = marketDaySchema.parse(JSON.parse(readFileSync("data/samples/market-day.json", "utf8")));
  check("the fictional session validates: real names, invented moves, four indices", day.moves.length > 80 && day.indices.length === 4 && /fictional/.test(day.source) && day.sizeBy === "cap");
  const { gainers, losers } = movers(day);
  check("the movers are the ten that rose most and the ten that fell most, in order", gainers.length === 10 && losers.length === 10 && gainers.every((g, i) => i === 0 || g.changePct <= gainers[i - 1].changePct) && losers.every((l, i) => i === 0 || l.changePct >= losers[i - 1].changePct) && gainers[0].changePct === Math.max(...day.moves.map((m) => m.changePct)));
  const sectors = sectorsOf(day);
  check("the sectors are weighted by market value, largest first, and hold every company once", sectors[0].sector === "Information Technology" && sectors.reduce((n, s) => n + s.moves.length, 0) === day.moves.length && sectors.every((s, i) => i === 0 || s.weight <= sectors[i - 1].weight));
  const drivers = indexDrivers(day);
  const spx = drivers.find((d) => d.name === "S&P 500");
  const qqq = drivers.find((d) => d.name === "QQQ");
  check("the S&P 500's drivers: every priced company, weights summing to 100, parts summing to the implied move, largest first", !!spx && spx.priced === day.moves.length && near(spx.drivers.reduce((s, d) => s + d.weight, 0), 100, 0.01) && near(spx.drivers.reduce((s, d) => s + d.contribution, 0), spx.impliedPct, 0.001) && spx.drivers.every((d, i) => i === 0 || d.contribution <= spx.drivers[i - 1].contribution), JSON.stringify(spx?.impliedPct));
  check("QQQ's drivers are the Nasdaq-100's companies, those outside the S&P 500 included, beside QQQ's own move", !!qqq && qqq.members === day.nasdaq100.length && qqq.drivers.some((d) => d.symbol === "ASML") && qqq.drivers.every((d) => day.nasdaq100.includes(d.symbol)) && qqq.actualPct === day.qqq?.changePct);
  check("the Nasdaq-100 companies outside the S&P 500 never reach the heat map", !day.moves.some((m) => m.symbol === "ASML") && sectorsOf(day).every((s) => s.moves.every((m) => m.symbol !== "ASML")));
  const asmlBare = { ...day.others.find((o) => o.symbol === "ASML")!, sector: null, name: null };
  const bare = marketDaySchema.parse({ ...day, others: [asmlBare, ...day.others.filter((o) => o.symbol !== "ASML")] });
  check("a Nasdaq-100 company its list gives no sector is still read and still counts in QQQ's drivers", bare.others[0].sector === null && !!indexDrivers(bare).find((d) => d.name === "QQQ")?.drivers.some((d) => d.symbol === "ASML"));
  check("a read is kept until the next close only when most companies are priced and the Nasdaq-100 list was read", completeDay(day, 0.95) && !completeDay({ ...day, nasdaq100: [] }, 0.95) && !completeDay({ ...day, moves: day.moves.slice(0, 10) }, 0.95));
  const twin = (symbol: string, name: string) => ({ symbol, name, sector: "Communication Services" as const, subIndustry: null, cap: 2e12, close: 101, prevClose: 100, changePct: 1 });
  const dual = indexDrivers({ ...day, moves: [twin("GOOGL", "Alphabet Inc. (Class A)"), twin("GOOG", "Alphabet Inc. (Class C)"), { ...twin("XOM", "Exxon Mobil"), cap: 2e12, changePct: -1, close: 99 }], nasdaq100: [], others: [] });
  check("two share classes the screener gives one value are one company, split between them", near(dual[0].drivers.find((d) => d.symbol === "GOOGL")!.weight, 25, 0.5) && near(dual[0].drivers.find((d) => d.symbol === "XOM")!.weight, 50, 0.6), JSON.stringify(dual[0]?.drivers.map((d) => [d.symbol, d.weight])));
  check("no market values, no drivers: the map sized alike says so itself", indexDrivers({ ...day, sizeBy: "equal" }).length === 0);
  const bd = bookDay(
    [
      { symbol: "AAPL", name: "Apple", value: 6000 },
      { symbol: "ZZZZ", name: "Elsewhere", value: 3000 },
      { symbol: "NONE", name: "No close", value: 500 },
    ],
    10000,
    day.session,
    "2026-10-08",
    day,
    { ZZZZ: [{ date: "2026-10-08", value: 50 }, { date: day.session, value: 49 }] },
  );
  const aapl = day.moves.find((m) => m.symbol === "AAPL")!;
  check("the book's day: each holding's weight of net worth times its move, the session's own move first, its closes else, the rest held unchanged and named", !!bd && bd.rows.length === 2 && near(bd.changePct, 0.6 * aapl.changePct + 0.3 * -2, 1e-3) && near(bd.change, 6000 * aapl.changePct / 100 - 60, 0.01) && bd.unpriced.join() === "NONE" && near(bd.pricedPct, 90, 1e-6), JSON.stringify(bd));
  const dated = bookDay([{ symbol: "ZZZZ", name: "Elsewhere", value: 4900 }], 10000, day.session, day.session, day, { ZZZZ: [{ date: "2026-10-08", value: 50 }, { date: day.session, value: 49 }] });
  check("a book dated the session itself is scaled back to the close before", !!dated && near(dated.rows[0].weight, 50, 1e-6) && near(dated.change, -100, 0.01));
  check("no net worth or no holdings is no book day, never a zero", bookDay([], 10000, day.session, null, day, {}) === null && bookDay([{ symbol: "A", name: "A", value: 1 }], 0, day.session, null, day, {}) === null);
  const b = breadth(day);
  check("breadth counts every company once", b.up + b.down + b.flat === day.moves.length);
  const box = { x: 0, y: 0, w: 1200, h: 700 };
  const placed = squarify(sectors, (s) => s.weight, box);
  const total = sectors.reduce((s, x) => s + x.weight, 0);
  check("the treemap's areas are in proportion to the values and fill the box without leaving it", placed.length === sectors.length && placed.every((p) => near((p.w * p.h) / (box.w * box.h), p.item.weight / total, 1e-6) && p.x >= -1e-6 && p.y >= -1e-6 && p.x + p.w <= box.w + 1e-6 && p.y + p.h <= box.h + 1e-6));
  check("a value of zero takes no space", squarify([1, 0, 2], (v) => v, box).length === 2);
  const book = [30, 25, 20, 10, 8, 5, 1.5, 0.3, 0.2, 0];
  const kept = squarify(book, inViewSize(book, (v) => v), { x: 0, y: 0, w: 420, h: 560 });
  check("in view: every holding gets a tile at least 3% of the map, a holding of nothing too, each big enough for its ticker", kept.length === book.length && kept.every((p) => p.w * p.h >= 0.0299 * 420 * 560 * (book.reduce((s, v) => s + v, 0) / book.reduce((s, v) => s + Math.max(v, 0.03 * 100), 0)) && p.w >= 34 && p.h >= 20), kept.map((p) => `${p.item}:${p.w.toFixed(0)}x${p.h.toFixed(0)}`).join(" "));
  const letters = [
    { status: "read", receivedAt: "2026-10-13T22:06:00.000Z", id: "a" },
    { status: "read", receivedAt: "2026-10-13T14:00:00.000Z", id: "b" },
    { status: "failed", receivedAt: "2026-10-13T23:00:00.000Z", id: "c" },
  ];
  const since = newslettersSince(letters, "2026-10-13");
  check("what happened today is the newsletters read since the close", since.since === "close" && since.digests.map((d) => d.id).join() === "a");
  const before = newslettersSince(letters, "2026-10-14");
  check("before the recap arrives, the latest day's stand in, said so", before.since === "latest" && before.digests.length === 2);
  check("the normal distribution reads 0.5 at zero and its tails", near(normalCdf(0), 0.5, 1e-7) && near(normalCdf(1.96), 0.975, 1e-4) && near(normalCdf(-1.96), 0.025, 1e-4));
  const flat = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value: 0 }));
  const prob = recessionProbability(flat);
  check("the New York Fed's model: a flat curve reads about 29.7%, starting once a month of the spread is in", prob.length === 10 && near(prob[0].value, 29.69, 0.02), JSON.stringify(prob[0]));
  const inverted = recessionProbability(flat.map((p) => ({ ...p, value: -1 })));
  check("an inverted curve reads higher than a flat one", inverted[0].value > 50);
  const page = readFileSync("app/(app)/markets/page.tsx", "utf8");
  const sessionPage = readFileSync("app/(app)/page.tsx", "utf8");
  const afterPage = readFileSync("app/(app)/after-close/page.tsx", "utf8");
  check("Today draws the session from its slots, At the Close what happened from its own; Markets draws the cycle signals, the economies and the world from theirs", ["market_indices", "market_drivers", "market_heatmap", "market_movers"].every((id) => sessionPage.includes(`on("${id}")`) && !page.includes(`on("${id}")`)) && afterPage.includes('on("market_today")') && !sessionPage.includes('on("market_today")') && ["market_cycle", "market_liquidity", "market_economy", "market_economies", "market_world"].every((id) => page.includes(`on("${id}")`)));
}

// --- The macro sources, from the shapes each publisher sent on 14 Oct 2026 ---------
{
  const throws = (f: () => unknown) => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  const effr = parseNyFedRates('{ "refRates": [ { "effectiveDate": "2026-10-09", "type": "EFFR" ,"percentRate": 3.88 ,"targetRateFrom": 3.75 ,"targetRateTo": 4.00 ,"volumeInBillions": 110 ,"revisionIndicator": "" }, { "effectiveDate": "2026-10-08", "type": "EFFR" ,"percentRate": 3.87 } ] }');
  check("New York Fed rates: newest-first answer read oldest first", effr.length === 2 && effr[0].date === "2026-10-08" && effr[1].value === 3.88);
  check("New York Fed rates: an empty answer or a page throws", throws(() => parseNyFedRates('{ "refRates": [ ] }')) && throws(() => parseNyFedRates("<html>")));
  const soma = parseSoma('{"soma": { "summary": [ { "asOfDate": "2026-09-30", "mbs": "2000000000000.00", "total": "6512345000000" }, { "asOfDate": "2026-10-07", "total": "6498765432100" }, { "asOfDate": "2026-10-08", "total": "" } ] } }');
  check("SOMA: total holdings in billions, a blank week skipped", soma.length === 2 && soma[1].value === 6498.77 && soma[0].value === 6512.35);
  const pmms = parsePmms("date,pmms30,pmms30p,pmms15,pmms15p,pmms51,pmms51p,pmms51m,pmms51spread\n4/2/1971,7.33, ,,,,,,\n10/8/2026,7.40,0.6,6.73,0.6,,,,\n10/15/2026, ,,,,,,,");
  check("Freddie Mac: M/D/YYYY dates, the 30-year rate, a blank week skipped", pmms.length === 2 && pmms[1].date === "2026-10-08" && pmms[1].value === 7.4);
  check("Freddie Mac: another file throws", throws(() => parsePmms("Date,Close\n2026-10-08,1")));
  const bls = parseBls('{"status":"REQUEST_SUCCEEDED","responseTime":104,"message":[],"Results":{"series":[{"seriesID":"LNS14000000","data":[{"year":"2026","period":"M09","periodName":"September","value":"4.4","footnotes":[{}]},{"year":"2026","period":"M08","value":"4.3"},{"year":"2025","period":"M13","value":"4.1"}]}]}}', "LNS14000000");
  check("BLS: months dated the first, the annual average (M13) skipped", bls.length === 2 && bls[1].date === "2026-09-01" && bls[1].value === 4.4);
  check("BLS: a refused answer (the daily limit) throws", throws(() => parseBls('{"status":"REQUEST_NOT_PROCESSED","message":["You have exceeded our limit"],"Results":{}}', "LNS14000000")));
  const umich = parseUmich("Table 1: The Index of Consumer Sentiment\n,,\nMonth,YYYY,ICS_ALL\nAugust,2026,58.2\nSeptember,2026,55.1\n");
  check("Michigan: read by shape, month name, year and index", umich.length === 2 && umich[1].date === "2026-09-01" && umich[1].value === 55.1);
  check("Michigan: a page that is not the table throws", throws(() => parseUmich("<html><body>Not found</body></html>")));
  const fg = parseFearGreed('{"fear_and_greed": {"score": 44.6, "rating": "fear", "timestamp": "2026-10-14T00:00:00+00:00", "previous_close": 44.74}, "fear_and_greed_historical": {"timestamp": 1791936000000.0, "score": 44.6, "rating": "fear", "data": [{"x": 1760400000000.0, "y": 28.285714285714285, "rating": "fear"}, {"x": 1791936000000.0, "y": 44.6, "rating": "fear"}]}}');
  check("CNN: the history by day and today's score, one point a day", fg.length === 2 && fg[0].value === 28.3 && fg[1].date === "2026-10-14" && fg[1].value === 44.6, JSON.stringify(fg));
  check("CNN: a refusal page throws", throws(() => parseFearGreed("I'm a teapot")));
  const mts = parseMtsReceipts('{"data":[{"record_date":"2026-07-31","current_month_net_rcpt_amt":"201234567890.12"},{"record_date":"2026-08-31","current_month_net_rcpt_amt":"179040465653.06"},{"record_date":"2026-09-30","current_month_net_rcpt_amt":"null"}],"meta":{"count":3}}');
  check("Treasury: net receipts by month in billions, a blank month skipped", mts.length === 2 && mts[1].value === 179.04);
  const monthly = Array.from({ length: 25 }, (_, i) => ({ date: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, value: 100 * 1.03 ** (i / 12) }));
  const yoy = yearOnYear(monthly);
  check("year on year: each month against the same month a year before, from the thirteenth", yoy.length === 13 && near(yoy[0].value, 3, 0.01) && yoy[0].date === "2025-01-01");
  const flows = Array.from({ length: 14 }, (_, i) => ({ date: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, value: 10 }));
  const t12 = trailingYear(flows);
  check("trailing twelve months: the sum from the twelfth month, a gap leaves the month out", t12.length === 3 && t12[0].value === 120 && trailingYear(flows.filter((p) => p.date !== "2025-06-01")).length === 0);
  check("months move by the calendar, the day kept where the month has it", monthsBefore("2026-03-31", 1) === "2026-02-28" && monthsBefore("2026-10-09", 12) === "2025-10-09");
  const weekly = Array.from({ length: 300 }, (_, i) => ({ date: new Date(Date.UTC(2021, 0, 6) + i * 7 * 864e5).toISOString().slice(0, 10), value: 100 + i }));
  const mort = rowFrom(marketDef("MORT30")!, weekly)!;
  check("a weekly indicator changes over its last reading, a calendar month and a calendar year", cadenceOf(marketDef("MORT30")!) === "weekly" && mort.change1d === 1 && mort.change1m === 5 && mort.change1y === 53, `${mort.change1d} ${mort.change1m} ${mort.change1y}`);
  const kept = keepFor(marketDef("MORT30")!, weekly);
  check("a weekly indicator keeps five years and a month, a daily one a year of sessions", kept.length >= 261 && kept.length <= 266 && keepFor(marketDef("VIX")!, weekly).length === 274, String(kept.length));
  const built = buildMarkets([{ symbol: "CPIYOY", points: monthly }, { symbol: "TAXREC", points: flows.slice(0, 5) }], "test");
  check("CPI arrives as an index and leaves as its change on a year before", near(built.series.CPIYOY?.[built.series.CPIYOY.length - 1].value, 3, 0.01));
  check("a monthly flow too short for a year is a sentence, never a zero", !built.series.TAXREC && built.problems.some((p) => p.includes("too short")));

  // The economies
  const imfText = '{"values":{"GGXWDG_NGDP":{"SDN":{"2026":128.5},"USA":{"2025":120.1,"2026":121.4},"JPN":{"2026":232.0}}},"api":{"version":"1"}}';
  const debt = parseImf(imfText, "GGXWDG_NGDP");
  check("IMF: the economies on the map kept, the rest dropped", debt.USA?.["2026"] === 121.4 && debt.JPN?.["2026"] === 232 && !("SDN" in debt));
  check("IMF: an answer with none of the economies throws", throws(() => parseImf('{"values":{"GGXWDG_NGDP":{"SDN":{"2026":1}}}}', "GGXWDG_NGDP")));
  check("a CSV line keeps commas and quotes inside quotes", csvCells('M,US,"Rates, ""end"" of period",2026-10,3.875').join("|") === 'M|US|Rates, "end" of period|2026-10|3.875');
  const bisText = 'FREQ,REF_AREA,UNIT_MEASURE,COMPILATION,TIME_PERIOD,OBS_VALUE,OBS_STATUS\nD,US,368,"Mid-point of the target range, from 2008",2026-10-05,3.875,A\nD,US,368,"Mid-point",2026-10-06,3.875,A\nD,XM,368,"Deposit facility, the rate",2026-10-06,2,A\nD,AU,368,"",2026-09-24,,A';
  const rates = parseBisRates(bisText);
  check("BIS: the latest rate per area, an empty observation skipped", rates.US?.date === "2026-10-06" && rates.XM?.value === 2 && !rates.AU, JSON.stringify(rates));
  const oecdText = JSON.stringify({ data: { dataSets: [{ observations: { "0:0:0": [100, 0], "0:0:1": [104, 0], "1:0:0": [200, 0], "1:0:1": [202, 0], "1:0:2": [999, 0] } }], structures: [{ dimensions: { observation: [{ id: "REF_AREA", values: [{ id: "USA" }, { id: "EA20" }] }, { id: "MEASURE", values: [{ id: "MABM" }] }, { id: "TIME_PERIOD", values: [{ id: "2025-08" }, { id: "2026-08" }, { id: "bad" }] }] } }] } });
  const oecd = parseOecdSeries(oecdText);
  check("OECD: series per area by month, a period that is not a month skipped", oecd.USA?.length === 2 && oecd.EA20?.length === 2 && growthOnYear(oecd.USA)?.value === 4 && growthOnYear(oecd.EA20)?.value === 1);
  check("OECD: an error page throws", throws(() => parseOecdSeries("<html>NoRecordsFound</html>")));
  const outlookText = JSON.stringify({ data: { dataSets: [{ observations: { "0:0:0:0": [121.4], "0:0:0:1": [120.1], "0:1:0:0": [2.1], "1:0:0:0": [42], "2:0:0:0": [9] } }], structures: [{ dimensions: { observation: [{ id: "REF_AREA", values: [{ id: "USA" }, { id: "CHE" }, { id: "OECD" }] }, { id: "MEASURE", values: [{ id: "GGFLQ" }, { id: "GDPV_ANNPCT" }] }, { id: "FREQ", values: [{ id: "A" }] }, { id: "TIME_PERIOD", values: [{ id: "2026" }, { id: "2025" }] }] } }] } });
  const outlook = parseOecdOutlook(outlookText);
  check("OECD Economic Outlook: each figure filed under its job by economy and year, an area off the map dropped", outlook.debt?.USA?.["2026"] === 121.4 && outlook.debt?.USA?.["2025"] === 120.1 && outlook.realGrowth?.USA?.["2026"] === 2.1 && outlook.debt?.CHE?.["2026"] === 42 && !outlook.debt?.OECD, JSON.stringify(outlook));
  check("OECD Economic Outlook: every IMF job has a measure, plus nominal growth, harmonised inflation and interest paid, and an error page throws", Object.keys(IMF).every((k) => k in OECD_OUTLOOK) && OECD_OUTLOOK.nominalGrowth === "GDP_ANNPCT" && OECD_OUTLOOK.inflationHarmonised === "CPIH_YTYPCT" && OECD_OUTLOOK.interestPaid === "GGINTP" && throws(() => parseOecdOutlook("<html>NoRecordsFound</html>")));
  const econ = buildEconomies({ annual: { realGrowth: { USA: { "2026": 2 } }, inflation: { USA: { "2026": 3 } }, primaryBalance: { USA: { "2025": -3, "2026": -3 } }, overallBalance: { USA: { "2025": -6.5, "2026": -7 } } }, rates, money: oecd }, "2026", "2026-10-14T00:00:00Z", "test");
  const us = econ.rows.find((r) => r.code === "USA")!;
  check("nominal growth compounds real growth and inflation", us.nominalGrowth === 5.06);
  check("interest growth is this year's share over last year's, carried by nominal growth; the gap is growth less interest", us.interest === 4 && us.interestGrowth === 20.07 && us.growthLessInterest === -15.01, `${us.interest} ${us.interestGrowth} ${us.growthLessInterest}`);
  const given = buildEconomies({ annual: { realGrowth: { DEU: { "2026": 0.7 }, JPN: { "2026": 0.6 } }, nominalGrowth: { DEU: { "2026": 3.33 } }, inflation: { JPN: { "2026": 1.8 } }, inflationHarmonised: { DEU: { "2026": 2.7 } }, interestPaid: { DEU: { "2025": 49544, "2026": 53979 }, JPN: { "2025": 8860, "2026": 11662 } }, primaryBalance: { JPN: { "2025": -2, "2026": -2 } }, overallBalance: { JPN: { "2025": -1.98, "2026": -2.3 } } }, rates, money: oecd }, "2026", "2026-10-14T00:00:00Z", "test");
  const deG = given.rows.find((r) => r.code === "DEU")!;
  const jpG = given.rows.find((r) => r.code === "JPN")!;
  check("the OECD's own nominal growth is used when given; harmonised inflation stands in for headline", deG.nominalGrowth === 3.33 && jpG.nominalGrowth === 2.41, `${deG.nominalGrowth} ${jpG.nominalGrowth}`);
  check("interest growth is gross interest paid this year on last, even where net interest is below zero", deG.interestGrowth === 8.95 && deG.growthLessInterest === -5.62 && jpG.interestGrowth === 31.63, `${deG.interestGrowth} ${deG.growthLessInterest} ${jpG.interestGrowth}`);
  const de = econ.rows.find((r) => r.code === "DEU")!;
  check("a euro member carries the euro area's rate and money, said so; a figure no source gave is null", de.policyRate?.value === 2 && de.policyArea === "euro area" && de.moneyArea === "euro area" && de.debt === null && de.nominalGrowth === null);
  const sample = economiesSchema.safeParse(JSON.parse(readFileSync("data/samples/economies.json", "utf8")));
  check("the economies sample is fictional and validates, every economy a row", sample.success && sample.data.rows.length === 9 && sample.data.source.startsWith("fictional"));
  if (sample.success) {
    const rows = sample.data.rows;
    const low = rows.reduce((a, r) => ((r.debt ?? 0) < (a.debt ?? 0) ? r : a));
    const high = rows.reduce((a, r) => ((r.debt ?? 0) > (a.debt ?? 0) ? r : a));
    check("the map ranks within a column: the lowest debt is the strongest reading, the highest the weakest; a column with no direction stays neutral", cellStrength(rows, "debt", low) === 1 && cellStrength(rows, "debt", high) === -1 && cellStrength(rows, "policyRate", low) === 0);
  }
  const mkSample = marketsSchema.safeParse(JSON.parse(readFileSync("data/samples/markets.json", "utf8")));
  check("the markets sample carries the liquidity and US economy series", mkSample.success && ["FEDBS", "EFFR", "SOFR", "MORT30", "CPIYOY", "UNRATE", "SENTIMENT", "FEARGREED", "TAXREC"].every((k) => (mkSample.data.series[k]?.length ?? 0) > 10));
  const page = readFileSync("app/(app)/markets/page.tsx", "utf8");
  check("the Markets screen reads the economies only when its slot is on", page.includes('on("market_economies") ? await loadEconomies(today)'));
}

// --- What happened: the recap newsletter guide and the Claude recap ----------
{
  const day = marketDaySchema.parse(JSON.parse(readFileSync("data/samples/market-day.json", "utf8")));
  const body = recapRequestBody(day) as { system: string; tools: { type?: string; name: string; max_uses?: number }[]; messages: { content: { text: string }[] }[] };
  check("investigate: the recap asks why the company did what moved it", body.system.includes(INVESTIGATIVE));
  check("the recap searches the web a few times and records through one tool", body.tools.some((t) => t.type === "web_search_20250305" && t.max_uses === RECAP_MAX_SEARCHES) && body.tools.some((t) => t.name === "record_recap"));
  check("the recap is given the session's own figures, never asked to invent them", body.messages[0].content[0].text.includes(`Session: ${day.session}`) && body.messages[0].content[0].text.includes("S&P 500") && /never state another level/.test(body.system));
  const point = { headline: "Yields rose", line: "The 10-year closed higher.", symbols: ["TLT"], source: { title: "A page", url: "https://news.example.com/a" } };
  const ok = parseRecapResponse({ content: [{ type: "tool_use", name: "record_recap", input: { summary: "Rates drove it.", points: [point, { ...point, symbols: ["TLT", "TLT"] }] } }] });
  check("a recorded recap is read, its tickers once each", ok.ok && ok.reading.points.length === 2 && ok.reading.points[1].symbols.length === 1);
  const noPage = parseRecapResponse({ content: [{ type: "tool_use", name: "record_recap", input: { summary: "Rates drove it.", points: [{ ...point, source: { title: "A page", url: "http://news.example.com/a" } }] } }] });
  check("a point without an https page is refused, never kept", !noPage.ok && noPage.called);
  const words = parseRecapResponse({ content: [{ type: "text", text: "The market fell." }] });
  check("an answer in words is a sentence, not an empty recap", !words.ok && !words.called);
  const now = new Date("2026-10-09T22:40:00Z");
  const failed = unwritten(day.session, "The model is busy.", now);
  check("a recap that could not be written keeps its sentence", failed.status === "failed" && failed.sentence === "Not written: The model is busy." && failed.reading === null);
  const withFail = keepRecap(EMPTY_RECAPS, failed, now);
  check("a failed recap is due again", recapDue(withFail, day.session) && recapDue(null, day.session));
  const written = { session: day.session, writtenAt: now.toISOString(), status: "written" as const, sentence: null, reading: ok.ok ? ok.reading : null };
  const kept = keepRecap(withFail, written, now);
  check("a written recap replaces the failed one for its session, and is not due again", kept.recaps.length === 1 && kept.recaps[0].status === "written" && !recapDue(kept, day.session));
  const older = keepRecap(kept, { ...written, session: "2026-10-08" }, now);
  check("recaps are kept newest first", older.recaps.map((r) => r.session).join(",") === `${day.session},2026-10-08`);
  check("the screen shows the session's own recap, else the latest written", recapFor(older, day.session)?.since === "close" && recapFor(older, "2026-10-12")?.since === "latest" && recapFor(older, "2026-10-12")?.recap.session === day.session && recapFor(EMPTY_RECAPS, day.session) === null);
  const sample = recapsFileSchema.parse(JSON.parse(readFileSync("data/samples/recaps.json", "utf8")));
  check("the demo's recap is of the demo's session, says it is fictional, and cites example pages only", sample.recaps[0].session === day.session && /fictional/i.test(sample.recaps[0].reading?.summary ?? "") && sample.recaps.every((r) => (r.reading?.points ?? []).every((p) => p.source.url.startsWith("https://example.com/"))));
  check("the StockMKTNewz guide names its free sign-up page and the sender the filter catches", RECAP_NEWSLETTERS[0].signUp === "https://www.stockmktnewz.com/" && recapFilter() === "from:(stockmktnewz@mail.beehiiv.com)");
  check("an older preferences file reads as the newsletters alone", preferencesSchema.parse({ version: 1, theme: "system", navOrder: [], hidden: [], headline: null, figures: [], updated: "" }).recap.newsletter === true && DEFAULT_PREFERENCES.recap.claude === false);
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons.filter((c) => c.path === "/api/cron/evening");
  check("the evening read runs on weekdays right after the close's read in summer and in winter (16:35 New York), then when the newsletters arrive and again after midnight UTC, the night after each weekday", crons.length === 6 && crons.every((c) => c.schedule.endsWith(/^\d+ [01] /.test(c.schedule) ? "* * 2-6" : "* * 1-5")) && ["0", "1"].every((h) => crons.some((c) => new RegExp(`^\\d+ ${h} `).test(c.schedule))) && ["20", "21", "22", "23"].every((h) => crons.some((c) => new RegExp(`^\\d+ ${h} `).test(c.schedule))) && crons.filter((c) => /^\d+ 2[01] /.test(c.schedule)).every((c) => Number(c.schedule.split(" ")[0]) >= 25), crons.map((c) => c.schedule).join("; "));
  const catchUp = readFileSync("lib/catch-up.ts", "utf8");
  check("opening the app after the close writes the session's recap when it is due and the person chose it, then checks alerts (Hamza, 17 Oct 2026)", /ws\.preferences\.recap\.claude && ws\.provider\?\.kind === "anthropic"/.test(catchUp) && /loadMarketDay\(at, "full"\)/.test(catchUp) && /due\(await vault\.readJson\("recaps"/.test(catchUp) && /writeRecapInto\(vault, provider, day, at/.test(catchUp) && /checkAlerts\(vault, email, at\)/.test(catchUp));
  const brief = readFileSync("components/today/close-brief.tsx", "utf8");
  const todaySrc = readFileSync("app/(app)/after-close/page.tsx", "utf8");
  check("after the bell the brief is about today's session, says it is being written until it is, asks the page again, and folds the close before away", /isTradingHours\(new Date\(\)\) \? closedBy\(new Date\(\)\) : lastSession\(new Date\(\)\)/.test(todaySrc) && /is being written/.test(brief) && /RefreshWhilePending every=\{30\}/.test(brief) && /Show the close before/.test(brief) && !/two hours after the close/.test(brief) && /day\.session < lastSession\(new Date\(\)\)/.test(readFileSync("app/(app)/markets/actions.ts", "utf8")));
  const run = readFileSync("lib/market-recap-run.ts", "utf8");
  check("the evening run reads newsletters and writes recaps only for the choice each person made", /prefs\.recap\.newsletter/.test(run) && /prefs\.recap\.claude/.test(run) && /recapDue\(/.test(run));
  check("the recap is refused with a sentence on a provider that cannot search the web", /providerCannot\(provider, "web_search"\)/.test(run));
  const page = readFileSync("app/(app)/after-close/page.tsx", "utf8");
  check("At the Close reads the session's recaps only when the person chose them", /on\("market_today"\) && ws\.preferences\.recap\.claude\) \? recapsFor\(ws\)/.test(page) && /on\("market_today"\) && ws\.preferences\.recap\.newsletter \? newslettersFor\(ws\)/.test(page));

  // After the close on Today: why each holding moved, and a 2% move alerted.
  const listedBook = { holdings: [
    { symbol: "AAA", name: "Alpha", assetClass: "equity" },
    { symbol: "aaa", name: "Alpha again", assetClass: "equity" },
    { symbol: "ZZZZ", name: "Elsewhere", assetClass: "etf" },
    { symbol: "NOPE", name: "Unpriced", assetClass: "equity" },
    { symbol: "BOND1", name: "A bond", assetClass: "bond" },
  ] } as unknown as Book;
  const firstMove = day.moves[0];
  const withHeld = { holdings: [...listedBook.holdings, { symbol: firstMove.symbol, name: firstMove.name ?? firstMove.symbol, assetClass: "equity" }] } as unknown as Book;
  const moves = holdingMoves(withHeld, day, { ZZZZ: [{ date: "2026-10-08", value: 50 }, { date: day.session, value: 51.5 }] });
  check("each listed holding's move comes from the session's read, else its own closes; an unpriced one is left out, never flat", moves.length === 2 && moves.some((m) => m.symbol === firstMove.symbol && m.changePct === firstMove.changePct) && moves.some((m) => m.symbol === "ZZZZ" && m.changePct === 3) && !moves.some((m) => m.symbol === "NOPE" || m.symbol === "BOND1"), JSON.stringify(moves));
  check("the closes read asks only for listed symbols, once each", listedSymbols(listedBook).join(",") === "AAA,NOPE,ZZZZ", listedSymbols(listedBook).join(","));
  check("holdings are explained largest move first, once each", movesToExplain([{ symbol: "A", name: "A", changePct: 0.5 }, { symbol: "B", name: "B", changePct: -4 }, { symbol: "a", name: "A", changePct: 1 }]).map((m) => m.symbol).join(",") === "B,A");
  const held = [{ symbol: "BIG", name: "Big Co", changePct: -3.4 }, { symbol: "FLAT", name: "Flat Co", changePct: 0.1 }];
  const asked = recapRequestBody(day, undefined, held) as { system: string; tools: { type?: string; name: string; max_uses?: number }[]; messages: { content: { text: string }[] }[] };
  check("the recap is given each holding's move and searches once more for each large one", asked.messages[0].content[0].text.includes("BIG (Big Co) -3.40%") && asked.messages[0].content[0].text.includes("FLAT (Flat Co) +0.10%") && asked.tools.some((t) => t.type === "web_search_20250305" && t.max_uses === RECAP_MAX_SEARCHES + 1));
  check("a large move is explained from a page of that day, or says no news explains it; never an invented cause", /2% or more either way \(BIG\)/.test(asked.system) && /no news that day explains it/.test(asked.system) && /Never invent a cause/.test(asked.system));
  check("a recap with no holdings asks nothing of them", !/holdings:/.test(body.system) && (body as { max_tokens?: number }).max_tokens === 4000);
  const said = parseRecapResponse({ content: [{ type: "tool_use", name: "record_recap", input: { summary: "Rates drove it.", points: [point], holdings: [
    { symbol: "FLAT", why: "Held with the market.", source: null },
    { symbol: "BIG", why: "Guidance was cut.", source: { title: "A page", url: "https://news.example.com/big" } },
    { symbol: "OTHER", why: "Not held.", source: null },
  ] } }] }, held);
  check("each holding line keeps the app's own move and name, runs largest move first, and drops a symbol not held", said.ok && said.reading.holdings.map((h) => `${h.symbol}:${h.changePct}:${h.name}`).join(",") === "BIG:-3.4:Big Co,FLAT:0.1:Flat Co");
  const reading = said.ok ? said.reading : null;
  check(`a move of ${MOVE_ALERT_PCT}% or more either way is a big move`, bigMoves(reading).map((h) => h.symbol).join(",") === "BIG");
  const movedFile = keepRecap(EMPTY_RECAPS, { session: day.session, writtenAt: now.toISOString(), status: "written", sentence: null, reading }, now);
  const notes = moveNotices(movedFile);
  check("a person's own move alert decides what is big: 5% leaves the 3.4% fall out, 0.1% takes the flat one in; 50% is allowed, no upper limit (Hamza, 29 Oct 2026), under 0.5% is not", moveNotices(movedFile, 5).length === 0 && bigMoves(reading, 0.1).length === 2 && /0\.5% or more either way/.test(JSON.stringify(recapRequestBody(day, "m", held, 0.5))) && preferencesSchema.parse({ ...DEFAULT_PREFERENCES }).moveAlertPct === MOVE_ALERT_PCT && preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, moveAlertPct: 50 }).success && !preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, moveAlertPct: 0.2 }).success);
  check("a big move is an alert with Claude's reason and its page, keyed by symbol and session", notes.length === 1 && notes[0].key === `${MOVE_PREFIX}BIG:${day.session}` && /^BIG fell 3\.4% on /.test(notes[0].title) && notes[0].detail === "Guidance was cut. Source: A page." && notes[0].href === "/");
  check("no written recap, no move alerts", moveNotices(null).length === 0 && moveNotices(withFail).length === 0);
  const fired = reconcile(null, notes, now.toISOString());
  const nextDay = keepRecap(movedFile, { session: "2026-11-04", writtenAt: now.toISOString(), status: "written", sentence: null, reading: { ...reading!, holdings: [] } }, now);
  const onScreen = reconcile(fired.file, [], now.toISOString(), [MOVE_PREFIX]);
  const afterNext = reconcile(fired.file, moveNotices(nextDay), now.toISOString());
  check("a move fires once, stays open on a screen that cannot read the recaps, and clears when the next session's recap is written", fired.fired.length === 1 && onScreen.file.items[0].clearedAt === null && afterNext.file.items[0].clearedAt !== null);
  check("the demo's recap explains its fictional holdings from example pages only", (sample.recaps[0].reading?.holdings ?? []).length >= 3 && sample.recaps[0].reading!.holdings.every((h) => h.source === null || h.source.url.startsWith("https://example.com/")) && sample.recaps[0].reading!.holdings.some((h) => Math.abs(h.changePct) < MOVE_ALERT_PCT));
  check("the evening run explains each person's holdings and checks alerts after a written recap", /movesFor\(vault, day, now\)/.test(run) && /checkAlerts\(vault, e\.email, now\)/.test(run));
  const sync = readFileSync("lib/daily-sync.ts", "utf8");
  check("the evening run asks IBKR for the statement when the book is older than the session and keeps it only when newer", /fetchFlexEvening\(vault, now, day\?\.session \?\? null\)/.test(run) && /flexEveningDue\(connections, book\?\.asOf \?\? null, session\)/.test(sync) && /imported\.book\.asOf > book\.asOf/.test(sync) && /mergeSync\(prev, \[\{ source: "ibkr_flex", outcome: "ok"[^\n]*"evening"\)/.test(sync));
  const alertsRun = readFileSync("lib/alerts-run.ts", "utf8");
  check("the alert check lays the latest recap's big moves on the alerts at the person's own move", /moveNotices\(recaps, preferences\?\.moveAlertPct\)/.test(alertsRun));
  const screensData = readFileSync("lib/screen-data.ts", "utf8");
  check("a screen keeps the move alerts as the last check left them", /\[WATCH_PREFIX, MOVE_PREFIX,/.test(screensData));
  const afterClosePage = readFileSync("app/(app)/after-close/page.tsx", "utf8");
  check("After the close leads At the Close, under Notifications, and reads the recaps only when chosen (Hamza, 18 Oct 2026)", slotsOn("today", shownWhen(null, null, null, null)).slice(0, 3).join(",") === "live_book,portfolio_grid,headline" && slotsOn("after_close", shownWhen(null, null, null, null))[0] === "close_brief" && /on\("close_brief"\) && recapChoice\.claude\) \|\| /.test(afterClosePage));
}

// --- prices while the market is open (lib/live.ts) ---------------------------------
{
  // 15 Oct 2026 was a Thursday: 14:30 UTC is 10:30 in New York.
  check("live: open from 09:30 to 16:00 New York on a weekday", isTradingHours(new Date("2026-10-15T14:30:00Z")) && !isTradingHours(new Date("2026-10-15T13:20:00Z")) && !isTradingHours(new Date("2026-10-15T20:00:00Z")) && isTradingHours(new Date("2026-10-15T19:59:00Z")));
  check("live: closed on a Saturday", !isTradingHours(new Date("2026-10-17T15:00:00Z")));
  check("live: closed on a holiday, and from 13:00 on an early close", !isTradingHours(new Date("2026-11-26T15:00:00Z")) && isTradingHours(new Date("2026-11-27T16:00:00Z")) && !isTradingHours(new Date("2026-11-27T18:30:00Z")));
  // After the bell the top right says how long ago the market closed, for two hours, then that the markets have closed and when they open (Hamza, 15 Oct 2026).
  const since = (iso: string) => sinceClose(new Date(iso));
  check("since the close: seconds after 16:00 New York on a trading day, none before it, during the session, on a weekend or a holiday", since("2026-10-15T20:00:00Z") === 0 && since("2026-10-15T21:05:09Z") === 3909 && since("2026-10-15T19:59:00Z") === null && since("2026-10-15T12:00:00Z") === null && since("2026-10-17T20:30:00Z") === null && since("2026-11-26T20:30:00Z") === null);
  check("since the close: from 13:00 on an early close, and counted for two hours", since("2026-11-27T18:30:00Z") === 1800 && CLOSED_AGO_MINUTES === 120);
  const atClose = freshness("close", "2026-10-15", "2026-10-15");
  const closedBadge = asClosed(atClose);
  check("a live card outside the session stays badged Live, with Markets have closed and the same date beside it, never At the close (Hamza, 16 Oct 2026)", closedBadge.kind === "closed" && closedBadge.label === "Live" && closedBadge.when === `Markets have closed · ${atClose.when}` && !closedBadge.stale && asClosed(freshness("close", "2026-10-01", "2026-10-15")).stale, JSON.stringify(closedBadge));
  check("ago reads 42 min ago, 1 h ago and 1 h 05 min ago", agoText(2530) === "42 min ago" && agoText(3600) === "1 h ago" && agoText(3909) === "1 h 05 min ago");
  // After the bell the live layer keeps the last session's closes and names that day (Hamza, 17 Oct 2026: on Saturday the cards had gone back to the 15 Oct statement, badged "Markets have closed · 15 Oct").
  const sess = (iso: string) => lastSession(new Date(iso));
  check("the last session: today from the open on a trading day, the day before until then, Friday through the weekend, the day before a holiday", sess("2026-10-16T14:00:00Z") === "2026-10-16" && sess("2026-10-16T13:00:00Z") === "2026-10-15" && sess("2026-10-16T22:00:00Z") === "2026-10-16" && sess("2026-10-17T15:00:00Z") === "2026-10-16" && sess("2026-10-18T15:00:00Z") === "2026-10-16" && sess("2026-10-19T12:00:00Z") === "2026-10-16" && sess("2026-10-19T14:00:00Z") === "2026-10-19" && sess("2026-11-26T15:00:00Z") === "2026-11-25" && sess("2026-11-27T20:00:00Z") === "2026-11-27", [sess("2026-10-17T15:00:00Z"), sess("2026-10-19T12:00:00Z")].join(" "));
  check("a live card holding the last session's closes is badged on that day, never the statement's", closedOn("2026-10-16").when === "Markets have closed · 16 Oct" && closedOn("2026-10-16").label === "Live" && closedOn("2026-10-16").kind === "closed" && !closedOn("2026-10-16").stale);
  const opens = (iso: string) => nextOpen(new Date(iso));
  check("the next open: tomorrow after a weekday's close, Monday from Friday's close or the weekend, today before the open, past a holiday", opens("2026-10-15T21:00:00Z").when === "tomorrow" && opens("2026-10-15T21:00:00Z").date === "2026-10-16" && opens("2026-10-16T21:00:00Z").when === "Monday" && opens("2026-10-17T15:00:00Z").date === "2026-10-19" && opens("2026-10-15T10:00:00Z").when === "today" && opens("2026-11-25T22:00:00Z").date === "2026-11-27" && opens("2026-11-25T22:00:00Z").when === "Friday");
  {
    const cd = (iso: string) => marketCountdown(new Date(iso));
    check("countdown: to the open within two hours of it, to the second", cd("2026-10-15T12:00:00Z")?.to === "open" && cd("2026-10-15T12:00:00Z")?.seconds === 5400 && cd("2026-10-15T13:29:30Z")?.seconds === 30 && cd("2026-10-15T11:20:00Z") === null);
    check("countdown: to the close within two hours of it, none mid-session or after", cd("2026-10-15T18:30:00Z")?.to === "close" && cd("2026-10-15T18:30:00Z")?.seconds === 5400 && cd("2026-10-15T13:45:00Z") === null && cd("2026-10-15T20:00:00Z") === null);
    check("countdown: none on a weekend or a holiday, to 13:00 on an early close", cd("2026-10-17T13:00:00Z") === null && cd("2026-11-26T13:00:00Z") === null && cd("2026-11-27T17:00:00Z")?.seconds === 3600 && cd("2026-11-27T17:00:00Z")?.early === true);
    check("countdown: reads 1:05:09 and 42:10", countdownText(3909) === "1:05:09" && countdownText(2530) === "42:10");
  }
  const t0 = Date.parse("2026-10-15T15:00:00Z") / 1000;
  const chart = (meta: Record<string, unknown>, closes: (number | null)[] = [100, 101, null, 102]) => JSON.stringify({ chart: { result: [{ meta, timestamp: closes.map((_, i) => t0 - (closes.length - i) * 300), indicators: { quote: [{ close: closes }] } }] } });
  const q = parseYahooQuote("AAPL", chart({ currency: "USD", regularMarketPrice: 102.5, regularMarketTime: t0, previousClose: 100, chartPreviousClose: 99 }));
  check("live: a chart of the day is a quote: price, the close before, currency, time", q.price === 102.5 && q.prevClose === 100 && q.currency === "USD" && q.time === t0 && q.points.length === 3);
  const q2 = parseYahooQuote("MSFT", chart({ chartPreviousClose: 50 }, [51, 52]));
  check("live: without a price in the meta, the last five-minute price stands in", q2.price === 52 && q2.prevClose === 50 && q2.currency === null);
  let threw = 0;
  for (const bad of ["<html>rate limited</html>", JSON.stringify({ chart: { result: null } }), chart({ regularMarketPrice: 10, regularMarketTime: t0 }, [])]) {
    try {
      parseYahooQuote("X", bad);
    } catch {
      threw++;
    }
  }
  check("live: a page that is not a chart, no result, or no close before throws", threw === 3);
  const ix = indexNow({ symbol: "SPX", name: "S&P 500", about: "Standard & Poor's 500" }, { ...q, price: 5100, prevClose: 5000 });
  check("live: an index now carries its move from yesterday's close", ix.close === 5100 && ix.changePct === 2 && ix.points.length === 3);

  const subjects: LiveSubject[] = [
    { symbol: "AAA", name: "Alpha", value: 40_000, price: 100, currency: "USD", cap: 20, capSection: "3.1" },
    { symbol: "BBB", name: "Beta", value: 20_000, price: 50, currency: "USD", cap: null, capSection: null },
    { symbol: "CCC", name: "Gamma", value: 10_000, price: 10, currency: "EUR", cap: 10, capSection: "3.2" },
    { symbol: "DDD", name: "Delta", value: 5_000, price: 20, currency: "USD", cap: 10, capSection: "3.2" },
    { symbol: "EEE", name: "Epsilon", value: 5_000, price: 30, currency: "USD", cap: 10, capSection: "3.2" },
  ];
  const now = new Date(t0 * 1000);
  const quotes = [
    { symbol: "AAA", price: 104, prevClose: 100, currency: "USD", time: t0 },
    { symbol: "BBB", price: 49, prevClose: 50, currency: "USD", time: t0 },
    { symbol: "CCC", price: 10.5, prevClose: 10, currency: "USD", time: t0 },
    { symbol: "DDD", price: 80, prevClose: 20, currency: "USD", time: t0 },
    { symbol: "EEE", price: 31, prevClose: 30, currency: "USD", time: t0 - 86_400 },
  ];
  const lb = liveBook(subjects, 200_000, quotes, now)!;
  check("live: each holding moves from the book's own price; net worth by the difference", !!lb && lb.sinceBook === 1200 && lb.netWorth === 201_200, JSON.stringify(lb && { s: lb.sinceBook, n: lb.netWorth }));
  check("live: the day is the price against the close before, in money and percent of the book at the close", lb.change === 1200 && Math.abs(lb.changePct - (1200 / 200_000) * 100) < 1e-9, `${lb.change} ${lb.changePct}`);
  const aaa = lb.rows.find((r) => r.symbol === "AAA")!;
  check("live: a row carries its weight now, its move and its part", aaa.changePct === 4 && Math.abs(aaa.weight - (41_600 / 201_200) * 100) < 1e-3 && aaa.change === 1600 && Math.abs(aaa.contribution - 0.8) < 1e-9 && aaa.over === true && aaa.capSection === "3.1");
  check("live: rows run from the largest part down", lb.rows.map((r) => r.symbol).join(",") === "AAA,BBB");
  const why = Object.fromEntries(lb.left.map((l) => [l.symbol, l.why]));
  check("live: another currency, a price far from the book's and a quote from before today are not used, and say why", why.CCC === "quoted in USD, held in EUR" && why.DDD?.includes("another listing") && why.EEE === "no trade yet today" && lb.unpriced.join(",") === "CCC,DDD,EEE", JSON.stringify(why));
  check("live: nothing fresh is no live book: before the first trade or on a holiday", liveBook(subjects, 200_000, quotes.map((x) => ({ ...x, time: t0 - 86_400 })), now) === null && liveBook(subjects, 0, quotes, now) === null && liveBook([], 1, quotes, now) === null);
  {
    // Saturday 17 Oct 2026: Friday's closes (16:00 New York, 20:00 UTC) are the last session's and stay on the book; Thursday's are not used.
    const friday = Date.parse("2026-10-16T20:00:00Z") / 1000;
    const saturday = new Date("2026-10-17T15:00:00Z");
    const shut = liveBook(subjects, 200_000, quotes.map((x) => ({ ...x, time: x.symbol === "EEE" ? friday - 86_400 : friday })), saturday)!;
    const whyShut = Object.fromEntries(shut.left.map((l) => [l.symbol, l.why]));
    check("live: after the bell the book keeps the last session's closes, dated that session, and a quote from the session before is not used", !!shut && shut.session === "2026-10-16" && shut.netWorth === 201_200 && shut.change === 1200 && whyShut.EEE === "no trade in the last session" && liveBook(subjects, 200_000, quotes.map((x) => ({ ...x, time: friday - 86_400 })), saturday) === null, JSON.stringify(shut && { s: shut.session, n: shut.netWorth, why: whyShut }));
  }
  const ls = liveSubjects([
    { symbol: "AAA", name: "Alpha", value: 1, cap: { cap: 20, rule: { section: "3.1" } }, holdings: [{ assetClass: "equity", price: 10, currency: "USD" }] },
    { symbol: "OPT", name: "A call", value: 1, cap: null, holdings: [{ assetClass: "option", price: 1, currency: "USD" }] },
    { symbol: "PRIV", name: "Fund", value: 1, cap: null, holdings: [{ assetClass: "private_fund", price: null, currency: "USD" }] },
    { symbol: "ETF", name: "An ETF", value: 1, cap: null, holdings: [{ assetClass: "etf", price: 5, currency: "USD" }] },
    { symbol: "NOPX", name: "No price", value: 1, cap: null, holdings: [{ assetClass: "equity", price: null, currency: "USD" }] },
  ]);
  check("live: only shares and funds with a price go live; options and private assets stay as the book has them", ls.map((x) => x.symbol).join(",") === "AAA,ETF" && ls[0].cap === 20 && ls[0].capSection === "3.1");
}


{
  // Units on every market figure (Hamza, 15 Oct 2026): gold per ounce, oil per barrel, yields in percent, an index in points, changes in basis points.
  check("market figures carry their units: gold per ounce, the 10-year in percent, the curve in percent, the dollar index in points", formatMarketFigure("GOLD", "market_level", 4174.2) === "$4,174 /oz" && formatMarketFigure("US10Y", "market_level", 4.091) === "4.09%" && formatMarketFigure("US10Y2Y", "market_level", 0.52) === "0.52%" && formatMarketFigure("DXY", "market_level", 98.6) === "98.60 pts" && formatMarketFigure("WTI", "market_level", 61.2) === "$61.20 /bbl", [formatMarketFigure("GOLD", "market_level", 4174.2), formatMarketFigure("DXY", "market_level", 98.6)].join(" | "));
  check("a yield's change is in basis points, a price's in percent, the recession probability's in points", formatMarketFigure("US10Y", "market_change_1d", -0.05) === "-5 bp" && formatMarketFigure("GOLD", "market_change_1d_pct", 1.234) === "+1.2%" && formatMarketFigure("RECPROB", "market_change_1m", 2) === "+2.0 pts" && formatMarketFigure("NOPE", "market_level", 1) === null);

  // The session live: Yahoo's spark in either shape, laid on the kept session.
  const t = Math.floor(new Date("2026-10-15T15:00:00Z").getTime() / 1000);
  const v7 = JSON.stringify({ spark: { result: [{ symbol: "AAPL", response: [{ meta: { regularMarketPrice: 101, regularMarketTime: t, chartPreviousClose: 100 }, timestamp: [t - 60, t], indicators: { quote: [{ close: [100.5, 101] }] } }] }] } });
  const dict = JSON.stringify({ MSFT: { symbol: "MSFT", timestamp: [t - 60, t], close: [400, 404], chartPreviousClose: 400 } });
  const a = parseYahooSpark(v7).get("AAPL");
  const b = parseYahooSpark(dict).get("MSFT");
  let threw = false;
  try {
    parseYahooSpark("<html>");
  } catch {
    threw = true;
  }
  check("Yahoo's spark is read in both its shapes, and a page that is neither throws", a?.price === 101 && a?.prevClose === 100 && b?.price === 404 && b?.time === t && threw);
  const kept = marketDaySchema.parse(JSON.parse(readFileSync("data/samples/market-day.json", "utf8")));
  const quotes = new Map(kept.moves.map((m) => [m.symbol.toUpperCase(), { price: m.close * 1.01, prevClose: m.close, time: t }]));
  const live = liveSession(kept, quotes, [], new Date(t * 1000));
  const few = liveSession(kept, new Map([...quotes].slice(0, 3)), [], new Date(t * 1000));
  const old = liveSession(kept, new Map([...quotes].map(([k, q]) => [k, { ...q, time: t - 86_400 }])), [], new Date(t * 1000));
  // CNN's fear and greed on a gauge (Hamza, 16 Oct 2026): the bands as CNN draws them, the close before, and a week, a month and a year back.
  const fg = fearGreedView([{ date: "2025-10-14", value: 27.4 }, { date: "2026-09-15", value: 26.6 }, { date: "2026-10-08", value: 39.2 }, { date: "2026-10-14", value: 32.1 }, { date: "2026-10-15", value: 24.9 }]);
  check("the fear and greed view names the score now with its band, the previous close, and the last reading on or before a week, a month and a year earlier", fg?.now.value === 25 && fg.now.label === "Extreme fear" && fg.previous?.value === 32 && fg.previous.label === "Fear" && fg.weekAgo?.date === "2026-10-08" && fg.monthAgo?.date === "2026-09-15" && fg.yearAgo?.date === "2025-10-14" && fearGreedView([]) === null && fearGreedView([{ date: "2026-10-15", value: 60 }])?.previous === null, JSON.stringify(fg));
  check("the bands are CNN's: under 25 extreme fear, to 45 fear, to 55 neutral, to 75 greed, then extreme greed", fearGreedBand(24.9).label === "Extreme fear" && fearGreedBand(25).label === "Fear" && fearGreedBand(50).label === "Neutral" && fearGreedBand(60).label === "Greed" && fearGreedBand(75).label === "Extreme greed" && fearGreedBand(100).label === "Extreme greed");
  check("the session so far is the kept session at today's prices, and none when too few are priced today or the prices are yesterday's", live?.session === "2026-10-15" && live.moves.every((m) => Math.abs(m.changePct - 1) < 0.01) && few === null && old === null);
}

// --- Every metric card gets a range (Hamza, 19 Oct 2026) ------------------------
{
  const row = (symbol: MarketRow["symbol"], level: number, low1y: number, high1y: number): MarketRow => ({ symbol, name: symbol, unit: "number", level, change1dPct: null, change1mPct: 2, change1yPct: null, change1d: null, change1m: null, change1y: null, low1y, high1y, rangePct: null, asOf: "2026-10-09" });
  const vix = rangeOf(row("VIX", 20, 12, 40), 20)!;
  check("an indicator with a known scale is drawn on it, lower better for the VIX, with the reading's place clamped", vix.source === "scale" && vix.low === 10 && vix.high === 50 && vix.better === "low" && vix.pct === 25 && rangeOf(row("VIX", 80, 12, 40), 80)!.pct === 100 && rangeOf(row("VIX", 5, 12, 40), 5)!.pct === 0);
  const gold = rangeOf(row("GOLD", 3000, 2000, 4000), 3000)!;
  check("an indicator with no scale is drawn on its own year, with no better end; a flat year gives none", gold.source === "year" && gold.low === 2000 && gold.high === 4000 && gold.better === null && gold.pct === 50 && rangeOf(row("GOLD", 3000, 3000, 3000), 3000) === null);
  check("the earnings yield and sentiment read higher as better; the recession probability, the mortgage rate and unemployment lower; a yield and the yield curve have no better end", rangeOf(row("US10Y2Y", 0.5, 0, 1), 0.5)!.better === null && rangeOf(row("US10Y3M", 0.5, 0, 1), 0.5)!.better === null && rangeOf(row("SPXEY", 4, 3, 5), 4)!.better === "high" && rangeOf(row("SENTIMENT", 60, 50, 70), 60)!.better === "high" && rangeOf(row("RECPROB", 30, 10, 40), 30)!.better === "low" && rangeOf(row("MORT30", 6, 5, 7), 6)!.better === "low" && rangeOf(row("UNRATE", 4, 3, 5), 4)!.better === "low" && rangeOf(row("US10Y", 4, 3, 5), 4)!.better === null);
  const rows = [row("VIX", 20, 12, 40), row("SPY", 6000, 5000, 6500)];
  check("a figure on one indicator's level takes its range, a change a symmetric scale for its span, the place in the year 0 to 100, and anything else none", marketRangeOf({ symbol: "VIX", field: "market_level" }, rows, 20)!.high === 50 && marketRangeOf({ symbol: "SPY", field: "market_change_1m_pct" }, rows, 3)!.low === -15 && marketRangeOf({ symbol: "SPY", field: "market_change_1m_pct" }, rows, 3)!.pct === 60 && marketRangeOf({ symbol: "SPY", field: "market_range_pct" }, rows, 70)!.pct === 70 && marketRangeOf({ symbol: "SPY", field: "market_change_1m" }, rows, 3) === null && marketRangeOf({ symbol: "DXY", field: "market_level" }, rows, 100) === null && marketRangeOf(null, rows, 1) === null && marketRangeOf({ symbol: "VIX", field: "market_level" }, rows, null) === null);
  check("every scale has a low under its high and a line, and the Markets page hands the rows and the rules to the section, whose tiles draw the bar", MARKETS.every((d) => !d.scale || (d.scale.low < d.scale.high && d.scale.note.length > 0)) && /markets=\{rows\} signals=\{marketSignals\}/.test(readFileSync("app/(app)/markets/page.tsx", "utf8")) && /<RangeBar range=\{range\}/.test(readFileSync("components/dashboard/figure.tsx", "utf8")) && /SIGNAL_TONE\[signal\.status\]/.test(readFileSync("components/dashboard/figure.tsx", "utf8")));
}

// Company news and reports on At the Close (Hamza, 19 Oct 2026).
{
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title><![CDATA[Results beat &amp; guidance raised]]></title><link>https://example.com/a</link><pubDate>Fri, 16 Oct 2026 20:05:00 GMT</pubDate></item>
<item><title>Analysts weigh the quarter - Example News</title><link>https://news.example.org/b</link><pubDate>Thu, 15 Oct 2026 09:00:00 +0000</pubDate><source url="https://news.example.org">Example News</source></item>
<item><title>No date</title><link>https://example.com/c</link></item>
<item><title>Plain http</title><link>http://example.com/d</link><pubDate>Thu, 15 Oct 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;
  const got = parseRss(rss, "ma");
  check("a news feed gives each headline with its link, date and publisher; one without a date or an https link is left out", got.length === 2 && got[0].title === "Results beat & guidance raised" && got[0].at === "2026-10-16T20:05" && got[0].source === "example.com" && got[0].symbol === "MA" && got[1].title === "Analysts weigh the quarter" && got[1].source === "Example News", JSON.stringify(got.map((g) => [g.title, g.at, g.source])));
  let threw = false;
  try {
    parseRss("<html>blocked</html>", "MA");
  } catch {
    threw = true;
  }
  check("a page that is not a feed throws, so it never looks like a quiet week", threw);
  const subs = { filings: { recent: { form: ["8-K", "4", "10-Q", "8-K"], filingDate: ["2026-10-16", "2026-10-15", "2026-10-14", "2026-09-01"], accessionNumber: ["0001-26-000001", "0001-26-000002", "0001-26-000003", "0001-26-000004"], primaryDocument: ["a.htm", "b.xml", "c.htm", "d.htm"], primaryDocDescription: ["8-K", "", "QUARTERLY REPORT", ""], acceptanceDateTime: ["2026-10-16T16:31:02.000Z", "", "", ""] } } };
  const reps = reportsFrom(subs, "ma", "2026-10-13", (a, d) => `https://example.com/${a}/${d}`);
  check("the SEC's list gives the week's filings of the forms worth a card, each linked to its document", reps.length === 2 && reps[0].form === "8-K" && reps[0].title === "Current report" && reps[0].at === "2026-10-16T16:31" && reps[1].title === "Quarterly report: QUARTERLY REPORT" && reps[1].url === "https://example.com/0001-26-000003/c.htm" && reps.every((r) => r.kind === "report" && r.source === "SEC EDGAR"));
  const many = Array.from({ length: 6 }, (_, i) => ({ symbol: "MA", kind: "news" as const, title: `Story ${i}`, url: `https://example.com/s${i}`, source: "X", at: `2026-10-${13 + i}T10:00`, form: null }));
  const feed = companyFeed([...many, { ...many[0], url: "https://example.com/dup" }, { symbol: "ASML", kind: "report", title: "Current report", url: "https://example.com/r", source: "SEC EDGAR", at: "2026-10-18T16:00", form: "6-K" }, { symbol: "MA", kind: "news", title: "Old", url: "https://example.com/old", source: "X", at: "2026-10-01T10:00", form: null }], "2026-10-19");
  check("the grid is the week's, the newest first, one card per link and headline, four headlines a company at most", feed[0].symbol === "ASML" && feed.filter((f) => f.symbol === "MA").length === MAX_PER_COMPANY && !feed.some((f) => f.title === "Old") && feed.map((f) => f.at).every((a, i, all) => i === 0 || all[i - 1] >= a) && newsFrom("2026-10-19") === "2026-10-13", feed.map((f) => `${f.symbol}:${f.title}`).join(", "));
  check("the card says when in words", whenWords("2026-10-19T14:05", "2026-10-19") === "Today 17:05" && whenWords("2026-10-18", "2026-10-19") === "Yesterday" && whenWords("2026-10-15", "2026-10-19") === "Thu 15 Oct");
  const sample = demoNews(demoNewsSchema.parse(JSON.parse(readFileSync("data/samples/company-news.json", "utf8"))), "2026-10-19");
  check("the demo's sample is fictional and stays around today", sample.length > 5 && sample.every((i) => i.url.startsWith("https://example.com/") && i.at >= "2026-10-13") && sample.every((i) => newsItemSchema.safeParse(i).success));
  const news = readFileSync("components/markets/company-news.tsx", "utf8");
  const feedSrc = readFileSync("lib/markets-feed.ts", "utf8");
  check("At the Close draws the news as a grid of cards that open the article or the report, and the feeds are read in the markets feed alone", SCREENS.after_close.slots.includes("company_news") && /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3/.test(news) && /target="_blank"/.test(news) && /feeds\.finance\.yahoo\.com/.test(feedSrc) && /news\.google\.com/.test(feedSrc) && !/console\.(warn|log|error)\([^)]*ticker/.test(feedSrc.slice(feedSrc.indexOf("Company headlines"))));
}


// The economic calendar, the prediction markets and short interest (Hamza, 21 Oct 2026)
{
  const ahead = econAhead("2026-10-21");
  check("econ: the calendar lists the publishers' dates ahead in order, the Fed's decision days with the dot plot on the quarter's last meeting", ahead.find((e) => e.kind === "fomc")?.date === "2026-10-28" && ahead.every((e, i) => i === 0 || ahead[i - 1].date <= e.date) && ECON_EVENTS.filter((e) => e.kind === "fomc").length === 10 && ECON_EVENTS.find((e) => e.date === "2026-12-09" && e.kind === "fomc")?.projections === true && ECON_EVENTS.every((e) => /^https:\/\/[^\s/]+\.[^\s/]+\//.test(e.source)) && ECON_EVENTS.filter((e) => !["election", "summit", "deadline"].includes(e.kind)).every((e) => /^https:\/\/(spa\.gov\.sa|www\.opec\.org|www\.(federalreserve|bls|bea|fec)\.gov|www\.ecb\.europa\.eu|www\.bankofengland\.co\.uk|www\.boj\.or\.jp|www\.bankofcanada\.ca|www\.snb\.ch|www\.info\.gouv\.fr|www\.ine\.mx|www\.gov\.il|servicios\.infoleg\.gob\.ar)\//.test(e.source)), ahead.map((e) => `${e.date}:${e.kind}`).join(", "));
  check("econ: each event that the app reads names its indicator, and a table that runs out says so", ECON_KIND.cpi.indicator === "CPIYOY" && ECON_KIND.jobs.indicator === "UNRATE" && ECON_KIND.fomc.indicator === "EFFR" && econTableNote("2027-12-01") !== null && econTableNote("2026-10-01") === null && /Job openings \(JOLTS\) to 2026-12-01/.test(econTableNote("2026-10-21") ?? "") && !/GDP/.test(econTableNote("2026-10-21") ?? "") && nextFomc("2026-10-29")?.date === "2026-12-09");
  check("econ: Macro carries the calendar and the odds, and Calendar the calendar", SCREENS.markets.slots.includes("market_calendar") && SCREENS.markets.slots.includes("market_odds") && SCREENS.calendar.slots.includes("economic_calendar"));
  const kalshi = { markets: [
    { ticker: "KXFED-26OCT-T3.50", event_ticker: "KXFED-26OCT", floor_strike: 3.5, strike_type: "greater", yes_bid: 95, yes_ask: 97, close_time: "2026-10-28T18:00:00Z" },
    { ticker: "KXFED-26OCT-T3.75", event_ticker: "KXFED-26OCT", floor_strike: 3.75, strike_type: "greater", yes_bid_dollars: "0.2800", yes_ask_dollars: "0.3000", close_time: "2026-10-28T18:00:00Z" },
    { ticker: "KXFED-26OCT-T4.00", event_ticker: "KXFED-26OCT", floor_strike: 4.0, strike_type: "greater", yes_bid: 1, yes_ask: 3, close_time: "2026-10-28T18:00:00Z" },
    { ticker: "KXFED-26DEC-T3.75", event_ticker: "KXFED-26DEC", floor_strike: 3.75, strike_type: "greater", yes_bid: 10, yes_ask: 12, close_time: "2026-12-09T19:00:00Z" },
  ] };
  const fed = fedOdds(parseKalshiFed(kalshi), 3.83, "2026-10-21T10:00:00Z");
  check("odds: the next meeting's cut, hold and hike come from the markets at the range's two bounds, the range read from the effective rate", fed !== null && fed.meeting === "2026-10-28" && fed.upper === 4 && fed.hike === 2 && fed.hold === 27 && fed.cut === 71 && fed.bigCut === 4 && Math.abs(fed.cut + fed.hold + fed.hike - 100) < 0.01, JSON.stringify(fed));
  check("odds: no effective rate or no market at a bound is no reading, never a guess", fedOdds(parseKalshiFed(kalshi), null, "2026-10-21") === null && fedOdds(parseKalshiFed(kalshi), 2.1, "2026-10-21") === null);
  // Kalshi's series is paged and lists the meetings furthest out first, so the next meeting is read by its own event (Hamza, 23 Oct 2026: the card had no numbers).
  check("odds: the next meeting's event is named by its day, its markets read by that ticker, and the series' cursor followed", kalshiEvent("2026-10-28") === "KXFED-26OCT" && kalshiEvent("2027-01-27") === "KXFED-27JAN" && KALSHI_EVENT("2026-12-09").endsWith("event_ticker=KXFED-26DEC&limit=200") && kalshiCursor({ cursor: "abc" }) === "abc" && kalshiCursor({ cursor: "" }) === null && KALSHI_NEXT("a b").endsWith("&cursor=a%20b"));
  const later = parseKalshiFed({ markets: [...kalshi.markets, { ticker: "KXFED-26SEP-T3.75", event_ticker: "KXFED-26SEP", floor_strike: 3.75, strike_type: "greater", yes_bid_dollars: "0.5", yes_ask_dollars: "0.5", close_time: "2026-10-27T18:00:00Z" }] });
  check("odds: the meeting the calendar names wins over another event that closes sooner", fedOdds(later, 3.83, "2026-10-21T10:00:00Z", "2026-10-28")?.hold === 27);
  const far = parseKalshiFed({ markets: [{ ticker: "KXFED-26OCT-T4.50", event_ticker: "KXFED-26OCT", floor_strike: 4.5, strike_type: "greater", yes_bid_dollars: "0.01", yes_ask_dollars: "0.02", close_time: "2026-10-28T18:00:00Z" }, { ticker: "KXFED-26OCT-T5.00", event_ticker: "KXFED-26OCT", floor_strike: 5, strike_type: "greater", yes_bid_dollars: "0.00", yes_ask_dollars: "0.01", close_time: "2026-10-28T18:00:00Z" }] });
  const gap = fedOddsGap(far, 3.83, "2026-10-21T10:00:00Z", "2026-10-28");
  check("odds: no market at the range says which meeting, the levels listed and today's range", gap === "Kalshi's markets for the 28 October meeting run from 4.50% to 5.00%, with none at both bounds of today's range, 3.75% to 4.00%." && fedOddsGap([], 3.83, "2026-10-21T10:00:00Z", "2026-10-28") === "Kalshi lists no open market for the 28 October meeting.", gap);
  // Hamza, 28 Oct 2026: the Fed's odds from whichever of Kalshi and Polymarket has more money on the meeting.
  const pm = { events: [
    { title: "How many dissent at the October Fed meeting?", slug: "dissent", endDate: "2026-10-28T23:59:00Z", closed: false, volume: 38375, markets: [{ groupItemTitle: "0", outcomes: '["Yes","No"]', outcomePrices: '["0.2","0.8"]' }] },
    { title: "Fed Decision in October?", slug: "fed-decision-in-october-2026", endDate: "2026-10-29T03:59:00Z", closed: false, volume: 85036780.9, openInterest: 20195419.8, markets: [
      { groupItemTitle: "50+ bps decrease", outcomes: '["Yes", "No"]', outcomePrices: '["0.0005", "0.9995"]' },
      { groupItemTitle: "25 bps decrease", outcomes: '["Yes", "No"]', outcomePrices: '["0.0005", "0.9995"]' },
      { groupItemTitle: "No change", outcomes: '["Yes", "No"]', outcomePrices: '["0.9485", "0.0515"]' },
      { groupItemTitle: "25 bps increase", outcomes: '["Yes", "No"]', outcomePrices: '["0.0475", "0.9525"]' },
      { groupItemTitle: "50+ bps increase", outcomes: '["Yes", "No"]', outcomePrices: '["0.0035", "0.9965"]' },
    ] },
    { title: "Fed Decision in October?", slug: "fed-decision-in-october-2025", endDate: "2025-10-30T03:59:00Z", closed: true, markets: [] },
  ] };
  const pf = parsePolymarketFed(pm, "2026-10-28", 3.83);
  check("odds: Polymarket's decision event for the meeting, its outcomes by their labels, decreases a cut and increases a hike, adding to one", pf !== null && pf.source === "Polymarket" && pf.hold === 94.8 && pf.hike === 5.1 && pf.cut === 0.1 && pf.upper === 4 && pf.traded === 85036780.9 && pf.url.endsWith("fed-decision-in-october-2026") && parsePolymarketFed(pm, "2026-12-09", 3.83) === null && POLYMARKET_FED("2026-12-09").includes("q=fed%20decision%20in%20december"), JSON.stringify(pf));
  const kf = { ...fed!, traded: 494000, open: 201000 };
  const deep = deeperFed(kf, pf);
  check("odds: the deeper market by money traded on the meeting wins, the other's depth kept, and it says so", deep?.source === "Polymarket" && deep.other?.source === "Kalshi" && deeperFed({ ...kf, traded: 9e7 }, pf)?.source === "Kalshi" && deeperFed(kf, null) === kf && deeperFed(null, pf) === pf && deeperFed(kf, { ...pf!, meeting: "2026-12-09" }) === kf && fedSourceWords(deep!) === "Polymarket's prices, the deeper market on this meeting: $85.0M traded and $20.2M open, against $494k and $201k on Kalshi.", deep ? fedSourceWords(deep) : "none");
  check("odds: a reading kept before the source was named parses as Kalshi's", oddsSchema.parse({ fed: { meeting: "2026-10-28", upper: 4, cut: 1, hold: 98, hike: 1, bigCut: null, url: "https://kalshi.com/markets/kxfed" }, recession: null, readAt: "x", problems: [] }).fed?.source === "Kalshi");
  // Hamza, 28 Oct 2026: every event's own market, when one has enough money on it (shapes as Polymarket and Kalshi answered that day).
  const yes = (p: number) => `["${p}", "${(1 - p).toFixed(4)}"]`;
  const boj = { events: [{ title: "Bank of Japan Decision in October?", slug: "bank-of-japan-decision-in-october-20260731151537", endDate: "2026-10-30T00:00:00Z", closed: false, volume: 332375.87, openInterest: 100163.3, markets: [
    { groupItemTitle: "50+ bps decrease", outcomes: '["Yes", "No"]', outcomePrices: yes(0.0005) }, { groupItemTitle: "25 bps decrease", outcomes: '["Yes", "No"]', outcomePrices: yes(0.0015) },
    { groupItemTitle: "No change", outcomes: '["Yes", "No"]', outcomePrices: yes(0.9855) }, { groupItemTitle: "25 bps increase", outcomes: '["Yes", "No"]', outcomePrices: yes(0.0115) }, { groupItemTitle: "50+ bps increase", outcomes: '["Yes", "No"]', outcomePrices: yes(0.004) },
  ] }, { title: "Bank of Japan Decision in December?", slug: "boj-dec", endDate: "2026-12-18T00:00:00Z", closed: false, volume: 25073, markets: [{ groupItemTitle: "No change", outcomes: '["Yes", "No"]', outcomePrices: yes(0.9) }] }] };
  const bojEvent = ECON_EVENTS.find((e) => e.kind === "boj" && e.date === "2026-10-30")!;
  const bb = polymarketBet(boj, bojEvent);
  check("event odds: a central bank's decision event read for its own meeting, its outcomes the history's cut, hold and hike", bb !== null && bb.source === "Polymarket" && Math.abs((bb.prices?.Hold ?? 0) - 0.9855) < 0.005 && Math.abs((bb.prices?.Hike ?? 0) - 0.0155) < 0.002 && bb.outcomes[0].label === "No change" && polymarketBet(boj, { ...bojEvent, date: "2026-12-17" })?.title === "Bank of Japan Decision in December?" && oddsQuery(bojEvent)?.polymarket?.includes("q=bank%20of%20japan%20decision%20in%20october") === true, JSON.stringify(bb));
  const cpiEvent = ECON_EVENTS.find((e) => e.kind === "cpi" && e.date === "2026-11-10")!;
  const cpi = { events: [{ title: "October Inflation US - Annual", slug: "october-inflation-us-annual", endDate: "2026-11-11T04:59:00Z", closed: false, volume: 33691.8, openInterest: 4309.1, markets: [
    { groupItemTitle: "≤3.5%", outcomes: '["Yes", "No"]', outcomePrices: yes(0.1) }, { groupItemTitle: "3.6%", outcomes: '["Yes", "No"]', outcomePrices: yes(0.2) }, { groupItemTitle: "3.7%", outcomes: '["Yes", "No"]', outcomePrices: yes(0.3) },
    { groupItemTitle: "3.8%", outcomes: '["Yes", "No"]', outcomePrices: yes(0.25) }, { groupItemTitle: "≥3.9%", outcomes: '["Yes", "No"]', outcomePrices: yes(0.15) },
  ] }, { title: "October Inflation US - Monthly", slug: "m", endDate: "2026-11-11T04:59:00Z", closed: false, volume: 32025, markets: [{ groupItemTitle: "0.2%", outcomes: '["Yes", "No"]', outcomePrices: yes(0.3) }] }] };
  const cb = polymarketBet(cpi, cpiEvent);
  check("event odds: CPI's 12-month buckets give the chance inflation comes out above the last reading (3.7%), the history's own split", cb !== null && Math.abs((cb.prices?.["Inflation higher"] ?? 0) - 0.4) < 1e-9 && Math.abs((cb.prices?.["Inflation not higher"] ?? 0) - 0.6) < 1e-9 && cb.title === "October Inflation US - Annual", JSON.stringify(cb?.prices));
  const israelEvent = ECON_EVENTS.find((e) => e.kind === "election" && e.area === "israel")!;
  const kpm = { markets: [
    { ticker: "KXISRAELPM-26OCT27-GEIZ", event_ticker: "KXISRAELPM-26OCT27", title: "Prime Minister of Israel after the 2026 election?", yes_sub_title: "Gadi Eizenkot", status: "active", yes_bid_dollars: "0.4900", yes_ask_dollars: "0.5000", volume_fp: "75804", close_time: "2027-10-27T14:00:00Z" },
    { ticker: "KXISRAELPM-26OCT27-BNET", event_ticker: "KXISRAELPM-26OCT27", title: "Prime Minister of Israel after the 2026 election?", yes_sub_title: "Benjamin Netanyahu", status: "active", yes_bid_dollars: "0.3400", yes_ask_dollars: "0.3500", volume_fp: "499715", close_time: "2027-10-27T14:00:00Z" },
  ] };
  const ib = kalshiBet(kpm, israelEvent);
  check("event odds: an election's own market by its day on Kalshi, shown beside the history and never weighed into it", oddsQuery(israelEvent)?.kalshi?.includes("event_ticker=KXISRAELPM-26OCT27") === true && ib !== null && ib.prices === null && ib.outcomes[0].label === "Gadi Eizenkot" && ib.title === "Prime Minister of Israel after the 2026 election?" && ib.traded === 575519 && betView(ib).weighed === false && betView(ib).outcomes[0].pct === "50%", JSON.stringify(ib));
  const u3 = { markets: [4.1, 4.2, 4.3].map((k, i) => ({ ticker: `KXU3-26OCT-T${k}`, event_ticker: "KXU3-26OCT", floor_strike: k, strike_type: "greater", status: "active", yes_bid_dollars: ["0.70", "0.40", "0.15"][i], yes_ask_dollars: ["0.72", "0.44", "0.19"][i], volume_fp: "600", close_time: "2026-11-06T13:29:00Z" })) };
  const jobsEvent = ECON_EVENTS.find((e) => e.kind === "jobs" && e.date === "2026-11-06")!;
  const jb = kalshiBet(u3, jobsEvent);
  check("event odds: unemployment above the last reading (4.2%) is the chance it rises; a market with under the floor traded is not used, and says so", oddsQuery(jobsEvent)?.kalshi?.includes("event_ticker=KXU3-26OCT") === true && Math.abs((jb?.prices?.["Unemployment up"] ?? 0) - 0.42) < 1e-9 && chooseBet([jb]) === null && /under \$25k traded \(Kalshi \$2k\)/.test(noBetWords([jb])) && noBetWords([]) === "Neither Kalshi nor Polymarket lists a question that is this event's own." && MIN_TRADED === 25_000, noBetWords([jb]));
  const gdpEvent = ECON_EVENTS.find((e) => e.kind === "gdp" && e.date === "2026-10-29")!;
  const gdp = { markets: [[2, "0.91", "0.92"], [3, "0.62", "0.63"], [4, "0.11", "0.12"]].map(([k, b, a]) => ({ ticker: `KXGDP-26OCT30-T${k}`, event_ticker: "KXGDP-26OCT30", floor_strike: k, strike_type: "greater", status: "active", yes_bid_dollars: b, yes_ask_dollars: a, volume_fp: "50000", close_time: "2026-10-30T12:29:00Z" })).concat([{ ticker: "KXGDP-27JUL29-T2", event_ticker: "KXGDP-27JUL29", floor_strike: 2, strike_type: "greater", status: "active", yes_bid_dollars: "0.5", yes_ask_dollars: "0.5", volume_fp: "999999", close_time: "2027-07-29T12:29:00Z" }]) };
  const gb = kalshiBet(gdp, gdpEvent);
  check("event odds: GDP's levels from the release settled with it, the next one's left out, each as the chance it comes out above", gb !== null && gb.traded === 150000 && gb.outcomes.map((o) => o.label).join(",") === "Above 2.0%,Above 3.0%,Above 4.0%" && gb.prices === null, JSON.stringify(gb));
  check("event odds: of two, the one whose question lines up with the history first, then the deeper; a decision's labels read as cut, hold and hike", chooseBet([ib, { ...ib!, source: "Polymarket", traded: 9e6 }])?.source === "Polymarket" && chooseBet([{ ...cb!, traded: 30000 }, { ...gb!, traded: 9e6 }])?.source === "Polymarket" && decisionPrices([{ label: "No change", p: 0.5 }, { label: "Cut 25 bps", p: 0.5 }])?.Cut === 0.5 && betKey(israelEvent) === `${israelEvent.date}:${israelEvent.name}`);
  const oddsFeed = readFileSync("lib/markets-feed.ts", "utf8");
  check("odds: the feed reads the next meeting's event first, then the series page by page", /KALSHI_EVENT\(meeting\)/.test(oddsFeed) && /KALSHI_NEXT\(cursor\)/.test(oddsFeed) && /KALSHI_MAX_PAGES/.test(oddsFeed));
  const grid = readFileSync("components/markets/econ-month.tsx", "utf8");
  check("econ: the calendar is a month grid, Monday to Friday, and the whole week in a month with a weekend election, each day's events as chips that open under it", /monthGrid\(month, weekends\)/.test(grid) && /role="grid"/.test(grid) && /setDay\(d\)/.test(grid) && readFileSync("components/markets/econ-calendar.tsx", "utf8").includes("<EconMonth"));
  // Hamza, 6 Nov 2026: a week by default, the month on the switch; a past result or event opens its report.
  check("econ: the calendar opens on a week, Monday to Friday, with the month on a switch", /useState<"week" \| "month">\("week"\)/.test(grid) && /weekDays\(monday, weekends\)/.test(grid) && mondayOf("2026-11-06") === "2026-11-02" && mondayOf("2026-11-08") === "2026-11-02" && weekDays("2026-11-02").join(",") === "2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-06" && weekDays("2026-11-02", true).length === 7);
  {
    const rep = { symbol: "gh", date: "2026-11-05", time: "post", quarter: "2026/Q3", status: "complete", updatedAt: "2026-11-06T10:00:00Z", headline: "No kill signal on file." } as unknown as EarningsReport;
    const ev = reportEvent(rep);
    const fomcPast = ECON_EVENTS.find((e) => e.kind === "fomc" && e.date === "2026-10-28")!;
    const cpiNext = ECON_EVENTS.find((e) => e.kind === "cpi" && e.date > "2026-11-06")!;
    const links = eventLinks([ev, fomcPast, cpiNext], [rep, { ...rep, status: "upcoming" } as unknown as EarningsReport], [{ key: macroKey(fomcPast) } as unknown as MacroReport]);
    check("econ: a past result opens its earnings report and a macro event its report; one without a report opens nothing", links[linkKey(ev)]?.href === `/earnings?report=${encodeURIComponent(reportKey(rep))}#report` && links[linkKey(fomcPast)]?.href === `/calendar?event=${encodeURIComponent(macroKey(fomcPast))}#event-reports` && !links[linkKey(cpiNext)] && ev.name === "GH results" && REPORTS_BACK_DAYS >= 365, JSON.stringify(links));
    check("econ: a chip with a report is a link, and the day lists it", /links\[linkKey\(e\)\]/.test(grid) && /<Link key=\{key\(e\)\} href=\{link\.href/.test(grid) && /macroReports: macro\?\.file\.reports/.test(readFileSync("app/(app)/calendar/page.tsx", "utf8")));
  }
  const poly = { events: [
    { title: "US recession in 2025?", slug: "us-recession-2025", endDate: "2025-12-31T00:00:00Z", closed: true, markets: [{ outcomes: '["Yes","No"]', outcomePrices: '["0.02","0.98"]' }] },
    { title: "US recession in 2026?", slug: "us-recession-2026", endDate: "2026-12-31T00:00:00Z", markets: [{ outcomes: '["Yes","No"]', outcomePrices: '["0.085","0.915"]' }] },
    { title: "Germany recession?", slug: "de", endDate: "2026-12-31T00:00:00Z", markets: [{ outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]' }] },
  ] };
  const rec = parsePolymarketRecession(poly, "2026-10-21T00:00:00Z");
  check("odds: the US recession market is the open one that ends soonest, its yes price as a percent, with its page", rec?.yes === 8.5 && rec.url === "https://polymarket.com/event/us-recession-2026" && rec.ends === "2026-12-31", JSON.stringify(rec));
  check("odds: the demo's sample parses", oddsSchema.safeParse(JSON.parse(readFileSync("data/samples/odds.json", "utf8"))).success);
  check("short: settlement dates are the 15th and the month's end, moved back over weekends", settlementDates("2026-11-20").join(",") === "2026-11-13,2026-10-30,2026-10-15,2026-09-30" && settlementDates("2026-12-31", 2).join(",") === "2026-12-31,2026-12-15", settlementDates("2026-11-20").join(","));
  const pipe = "accountingYearMonthNumber|symbolCode|issueName|issuerServicesGroupExchangeCode|marketClassCode|currentShortPositionQuantity|previousShortPositionQuantity|stockSplitFlag|averageDailyVolumeQuantity|daysToCoverQuantity|revisionFlag|changePercent|changePreviousNumber|settlementDate\n20261015|MA|Mastercard Inc|A|NYSE|9000000|8500000||3000000|3.00||5.88|500000|20261015\n20261015|ZZZZ|Other|A|OTC|5|5||1|5||0|0|20261015";
  const csv = '"issueSymbolIdentifier","settlementDate","issueName","marketCategoryCode","currentShortShareNumber","previousShortShareNumber","changePercent","percentageChangefromPreviousShort","averageShortShareNumber","daysToCoverNumber","marketCategoryDescription"\n"MA","2026-10-15","Mastercard","N","9,000,000","8,500,000","5.88","5.88","3,000,000","3.00","NYSE"';
  const a = parseShortFile(pipe, ["ma"]).get("MA");
  const b = parseShortFile(csv, ["MA"]).get("MA");
  check("short: FINRA's file is read in either delimiter and either naming, only the symbols asked for kept", !!a && !!b && a.short === 9000000 && b.short === 9000000 && a.daysToCover === 3 && b.averageVolume === 3000000 && a.settlement === "2026-10-15" && b.market === "NYSE" && parseShortFile(pipe, ["MA"]).size === 1, JSON.stringify([a, b]));
  const si = withShareCount(a!, "2026-10-15", 900_000_000, true);
  check("short: the share of the shares outstanding needs the filings' count in US dollars, else it is none", si.pctOfShares === 1 && withShareCount(a!, "2026-10-15", 900_000_000, false).pctOfShares === null && shortFields(si).days_to_cover === 3 && Math.round(shortChangePct(si)! * 100) / 100 === 5.88);
  const feed = readFileSync("lib/markets-feed.ts", "utf8");
  check("short, options and odds are fetched in the market feed alone, the demo reading nothing or its sample", /export async function loadShortInterest/.test(feed) && /export async function loadExpectedMove/.test(feed) && /export const loadOdds/.test(feed) && /storageMode\(\) === "demo"[^\n]*return \{ settlement: null/.test(feed) && /odds\.json/.test(feed));
}

{
  // Before the open and after the close (Hamza, 4 Nov 2026): Yahoo's chart with the extended sessions, read by New York's clock.
  const u = (iso: string) => Date.parse(iso) / 1000;
  const chart = (bars: [string, number][], close: [string, number] | null) =>
    JSON.stringify({ chart: { result: [{ meta: { currency: "USD", ...(close ? { regularMarketPrice: close[1], regularMarketTime: u(close[0]) } : {}) }, timestamp: bars.map(([t]) => u(t)), indicators: { quote: [{ close: bars.map(([, v]) => v) }] } }] } });
  check("the sessions run 04:00, 09:30, 16:00 and 20:00 New York, closed at the weekend", sessionAt(u("2026-11-04T14:29:00Z")) === "pre" && sessionAt(u("2026-11-04T14:30:00Z")) === "regular" && sessionAt(u("2026-11-04T21:00:00Z")) === "post" && sessionAt(u("2026-11-05T01:00:00Z")) === "closed" && sessionAt(u("2026-11-04T08:59:00Z")) === "closed" && sessionAt(u("2026-11-07T15:00:00Z")) === "closed");
  const after = parseExtendedChart("NWND", chart([["2026-11-03T20:55:00Z", 100], ["2026-11-03T21:00:00Z", 101], ["2026-11-03T22:00:00Z", 104]], ["2026-11-03T21:00:00Z", 100]));
  const am = extendedMove(after);
  check("after hours is set against the day's own close", am?.session === "post" && am.close === 100 && am.price === 104 && am.pct === 4 && am.closeDay === "2026-11-03", JSON.stringify(am));
  const pre = extendedMove(parseExtendedChart("NWND", chart([["2026-11-03T20:55:00Z", 100], ["2026-11-03T22:00:00Z", 104], ["2026-11-04T12:00:00Z", 98]], ["2026-11-03T21:00:00Z", 100])));
  check("pre-market is set against the last session's close", pre?.session === "pre" && pre.close === 100 && pre.pct === -2, JSON.stringify(pre));
  check("while the session trades there is no extended move; a body that is no chart throws", extendedMove(parseExtendedChart("NWND", chart([["2026-11-04T15:00:00Z", 99]], ["2026-11-04T15:00:00Z", 99]))) === null && (() => { try { parseExtendedChart("NWND", "<html>"); return false; } catch { return true; } })() && (() => { try { parseExtendedChart("NWND", JSON.stringify({ chart: { result: [] } })); return false; } catch { return true; } })());
  check("the SEC's acceptance time is New York's wall clock, in winter and in summer", acceptedUnix("2026-11-03T16:05:12.000Z") === u("2026-11-03T21:05:12Z") && acceptedUnix("2026-07-30T16:05:00.000Z") === u("2026-07-30T20:05:00Z") && acceptedUnix(null) === null && acceptedUnix("soon") === null);
  const since = sinceResults(after, acceptedUnix("2026-11-03T16:05:12.000Z"), { price: 100, date: "2026-11-03" });
  check("since the results is the price now against the last trade before the release", since?.base.basis === "release" && since.base.price === 101 && since.now.price === 104 && since.now.session === "post" && since.pct === 2.97, JSON.stringify(since));
  const early = sinceResults(after, acceptedUnix("2026-11-03T08:00:00.000Z"), { price: 99, date: "2026-11-02" });
  check("a release before the chart reaches back is set against the close before the results", early?.base.basis === "close" && early.base.price === 99 && early.pct === 5.05, JSON.stringify(early));
  check("a price from before the release is no move since it", sinceResults(after, acceptedUnix("2026-11-03T19:00:00.000Z"), null) === null);
  check("the session words say which session the price is from", SESSION_WORDS.pre === "Pre-market" && SESSION_WORDS.post === "After hours" && SESSION_WORDS.regular === "In the session");
  check("the answer's shape carries the session, the moves, the since tiles and the problems", extendedAnswerSchema.safeParse({ session: "post", moves: [{ ...am, currency: "USD" }], since: [{ ...since, currency: "USD" }], problems: [] }).success);
  check("the subjects are the listed holdings, then the watchlist, the companies with results marked", (() => {
    const book = { holdings: [{ symbol: "NWND", name: "Northwind", assetClass: "equity", listed: true, value: 10 }, { symbol: "CASH", name: "Cash", assetClass: "cash", value: 5 }] } as never;
    const file = { reports: [{ symbol: "NWND", date: "2026-11-03", status: "release" }], upcoming: [] } as never;
    const got = extendedSubjects(book, ["CTSO"], file, "2026-11-04");
    return got.map((g) => g.symbol).join(",") === "NWND,CTSO" && got[0].group === "holding" && got[0].results !== null && got[1].group === "watch" && got[1].results === null;
  })());
  check("At the Close carries the extended sessions right after the close brief", SCREENS.after_close.slots[1] === "extended_hours");
}
// Credit stress from the filings (lib/credit-stress.ts; Hamza, 5 Nov 2026).
{
  const co = (symbol: string, sector: string | null, values: Record<string, number>, error: string | null = null) => ({ symbol, name: `${symbol} Corp (fictional)`, cik: 1, sector, subIndustry: null, sic: null, cap: 1e9, price: 10, readAt: "2026-11-04T05:00:00.000Z", values, shares: null, usd: true, error });
  const file = {
    version: 1 as const,
    universe: ["AAA", "BBB", "CCC", "BNK", "NEW", "OLD"],
    bySymbol: {
      AAA: co("AAA", "Industrials", { altman_z: 1.2, interest_cover: 1.5, net_debt_to_ebitda: 5.1 }),
      BBB: co("BBB", "Information Technology", { altman_z: 4.4, interest_cover: 40, net_debt_to_ebitda: -0.8 }),
      CCC: co("CCC", "Utilities", { altman_z: 2.1 }),
      BNK: co("BNK", "Financials", { altman_z: 0.4 }),
      NEW: co("NEW", "Health Care", {}, "SEC did not answer"),
      OLD: co("OLD", "Energy", { interest_cover: 9 }),
    },
    updated: "2026-11-04T05:00:00.000Z",
  };
  const own = { BBB: { values: { altman_z: 3.5, interest_cover: 30 }, name: "BBB Corp (fictional)", sector: "Information Technology" }, ZZZ: { values: {}, name: "ZZZ (fictional)" } };
  const cs = creditStress(file, own, new Set(["BBB", "ZZZ"]), new Set(["AAA"]));
  check("credit stress: Altman's zones below 1.81, to 2.99, above", zoneOf(1.8) === "distress" && zoneOf(1.81) === "grey" && zoneOf(2.99) === "grey" && zoneOf(3) === "safe");
  check("credit stress: held and watched with a score, the lowest first, the person's own read winning, one without a score left out", cs.yours.map((r) => r.symbol).join() === "AAA,BBB" && cs.yours[1].z === 3.5 && cs.yours[1].own === "held" && cs.yours[0].own === "watched", JSON.stringify(cs.yours.map((r) => [r.symbol, r.z])));
  check("credit stress: a bank is not judged, a failed read and a read before the score are counted, never a zero", cs.lowest.every((r) => r.symbol !== "BNK") && cs.notJudged === 1 && cs.unread === 2 && cs.scored === 3 && cs.distress === 1 && cs.ready, JSON.stringify(cs));
  // Hamza, 6 Nov 2026: the lowest list held only his own, read first; it is drawn once most of the index is scored.
  const early = creditStress({ ...file, universe: [...file.universe, "D1", "D2", "D3", "D4"], bySymbol: { ...file.bySymbol, ...Object.fromEntries(["D1", "D2", "D3", "D4"].map((s) => [s, co(s, "Industrials", { interest_cover: 3 })])) } }, own, new Set(["BBB"]), new Set());
  check("credit stress: under half the index scored, no lowest list (it would be mostly the person's own)", !early.ready && early.lowest.length === 0 && early.yours.length === 1, JSON.stringify([early.ready, early.scored, early.unread]));
  const pts = creditPoints({ yours: cs.yours, lowest: [...cs.lowest, { ...cs.lowest[0], symbol: "FAR", netDebtToEbitda: 40, z: -12, zone: "distress" }, { ...cs.lowest[0], symbol: "NOE", netDebtToEbitda: null }] });
  const far = pts.points.find((p) => p.row.symbol === "FAR");
  check("credit stress: the chart places held, watched and the lowest not already theirs once each", pts.points.find((p) => p.row.symbol === "AAA")?.set === "watched" && pts.points.filter((p) => p.row.symbol === "AAA").length === 1 && pts.points.find((p) => p.row.symbol === "FAR")?.set === "lowest" && [...pts.points.map((p) => p.row.symbol), ...pts.unplaced.map((r) => r.symbol)].filter((s) => s === "BBB").length === 1, JSON.stringify(pts.points.map((p) => [p.row.symbol, p.set])));
  check("credit stress: a point past an edge sits on it with its arrow; one with no EBITDA is named, never placed at zero", !!far && far.clipX === 1 && far.clipY === -1 && far.x === pts.axes.xMax && far.y === pts.axes.yMin && pts.unplaced.map((r) => r.symbol).join() === "BBB,CCC,NOE", JSON.stringify([far, pts.axes, pts.unplaced.map((r) => r.symbol)]));
}

// Lawful sources for the beta (Hamza, 9 Nov 2026: "Lawful only"): one deployment switch shuts every unlicensed feed before it is asked.
{
  const on = { SOURCES: "licensed" };
  check("licences: the switch is the deployment's, off unless SOURCES=licensed", !licensedOnly({}) && licensedOnly(on) && licensedOnly({ SOURCES: " Licensed " }) && !licensedOnly({ SOURCES: "all" }));
  check("licences: off, every address may be asked", feedShut("https://query1.finance.yahoo.com/v8/finance/chart/SPY", {}) === null && feedShut("https://example.com/x", {}) === null && feedOpen("kalshi", {}));
  const yahoo = feedShut("https://query1.finance.yahoo.com/v8/finance/chart/SPY", on);
  check("licences: on, Yahoo, Nasdaq, Cboe, Kalshi and podscripts are shut with a sentence that says why", !!yahoo && isShut(yahoo) && /Yahoo Finance is not shown in the beta: its terms bar/.test(yahoo) && !!feedShut("https://api.nasdaq.com/api/calendar/earnings?date=2026-11-09", on) && !!feedShut("https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json", on) && !!feedShut("https://api.elections.kalshi.com/trade-api/v2/markets", on) && !!feedShut("https://podscripts.co/podcasts/all-in", on), String(yahoo));
  check("licences: on, the SEC, the Treasury, the BLS, the New York Fed, the OECD, the BIS, the IMF, the ECB and Wikipedia stay open", ["https://data.sec.gov/submissions/CIK0000320193.json", "https://home.treasury.gov/resource-center/x.csv", "https://api.bls.gov/publicAPI/v2/timeseries/data/", "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json", "https://sdmx.oecd.org/public/rest/data/x", "https://stats.bis.org/api/v1/data/x", "https://www.imf.org/external/datamapper/api/x", "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"].every((u) => feedShut(u, on) === null));
  check("licences: on, a host on no list is shut, so a new source is never shown by default", isShut(feedShut("https://new-source.example.com/data", on) ?? "") && feedOf("https://new-source.example.com/data") === null);
  check("licences: FRED opens only its US government series", feedShut("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", on) === null && FRED_PUBLIC.has("UNRATE") && /FRED's VIXCLS is not shown in the beta/.test(feedShut("https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS", on) ?? "") && !!feedShut("https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2", on));
  check("licences: every licensed feed carries the credit its terms ask for, and every shut one says why", FEEDS.every((f) => f.why.length > 3 && (!f.licensed || !!f.credit)));
  const folded = foldShut(["VIX came back empty.", "Yahoo Finance is not shown in the beta: x.", "CNN's fear and greed index is not shown in the beta: y.", "FRED's VIXCLS is not shown in the beta: z."], "indicators");
  check("licences: many shut indicators fold into one sentence naming their sources once, the real failures kept apart", folded.length === 2 && folded[0] === "VIX came back empty." && /^3 indicators are not shown in the beta: their sources' terms bar it \(Yahoo Finance, CNN's fear and greed index and FRED's privately published series\)\.$/.test(folded[1]), JSON.stringify(folded));
  check("licences: the credits line names each source once", creditsFor(["fred", "treasury", "fred"]) === "Source: FRED, Federal Reserve Bank of St. Louis; US Department of the Treasury." && creditsForNames(["the US Treasury", "Freddie Mac (earlier reading)", "Yahoo Finance"]) === "Source: US Department of the Treasury; Freddie Mac Primary Mortgage Market Survey." && creditsFor([]) === "");
  const par = 'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"\n11/06/2026,4.10,4.08,4.05,4.01,3.98,3.90,3.75,3.55,3.50,3.62,3.80,4.12,4.55,4.60\n11/05/2026,4.11,4.09,4.06,4.02,,3.91,3.76,3.57,3.52,3.64,3.82,4.15,4.58,\n';
  const ten = parseTreasuryPar(par, "10 Yr");
  const thirty = parseTreasuryPar(par, "30 Yr");
  let missing = false;
  try { parseTreasuryPar("Date,Other\n11/06/2026,1", "10 Yr"); } catch { missing = true; }
  check("Treasury: the par yield curve CSV reads a tenor by its column's name, oldest first, a blank day skipped, a missing column thrown", ten.length === 2 && ten[0].date === "2026-11-05" && ten[1].value === 4.12 && thirty.length === 1 && thirty[0].value === 4.6 && missing, JSON.stringify([ten, thirty]));
  const ecb = parseEcbDaily('<gesmes:Envelope><Cube><Cube time="2026-11-06"><Cube currency="USD" rate="1.0850"/><Cube currency="GBP" rate="0.8400"/></Cube></Cube></gesmes:Envelope>');
  check("ECB: the daily reference rates read per euro, and a cross is the base over the currency", ecb.date === "2026-11-06" && ecb.perEuro.USD === 1.085 && Math.abs((ecbCross(ecb.perEuro, "GBP", "USD") ?? 0) - 1.085 / 0.84) < 1e-9 && ecbCross(ecb.perEuro, "EUR", "USD") === 1.085 && ecbCross(ecb.perEuro, "JPY", "USD") === null, JSON.stringify(ecb));
  const cal = secCalendar([{ symbol: "MA", days: [{ date: "2026-10-30", time: "pre" }, { date: "2026-07-31", time: "pre" }] }, { symbol: "NVDA", days: [{ date: "2026-11-19", time: "post" }] }], "2026-10-19", "2026-11-09", [], "2026-11-09T12:00:00Z");
  check("SEC results: the calendar is the 8-K 2.02 releases in the window, never a date ahead and never an estimate", cal.rows.length === 1 && cal.rows[0].symbol === "MA" && cal.rows[0].time === "pre" && cal.rows[0].epsForecast === null && cal.publishedTo === null, JSON.stringify(cal.rows));
  const fileWith = { ...EMPTY_EARNINGS, followed: ["MA"] };
  check("SEC results: the watch reads when a followed company filed today or yesterday and no release was read, and not for an older one", secResultsDue(fileWith, [{ symbol: "MA", days: [{ date: "2026-11-09" }] }], "2026-11-09") && secResultsDue(fileWith, [{ symbol: "MA", days: [{ date: "2026-11-08" }] }], "2026-11-09") && !secResultsDue(fileWith, [{ symbol: "MA", days: [{ date: "2026-11-05" }] }], "2026-11-09"));
  const src = (f: string) => readFileSync(f, "utf8");
  check("licences: the feeds ask the gate before every fetch, the watch polls the SEC, and the alerts keep the report's email where no calendar is read", /feedShut\(/.test(src("lib/markets-feed.ts")) && /feedShut\(/.test(src("lib/podcast-feed.ts")) && /feedShut\(/.test(src("lib/sectors-feed.ts")) && /secResultsOut/.test(src("lib/jobs-run.ts")) && /licensed \? reportNotices\(kept, today\)/.test(src("lib/alerts-run.ts")));
}

// Where the money in ETFs went, from the funds' N-PORT reports (Hamza, 20 Nov 2026: "SEC filings").
{
  const doc = (series: string, date: string, flows: [string, string, string][]) =>
    `<edgarSubmission><formData><genInfo><regName>Sample Trust</regName><seriesName>Sample Fund</seriesName><seriesId>${series}</seriesId><repPdEnd>2026-12-31</repPdEnd><repPdDate>${date}</repPdDate></genInfo><fundInfo><totAssets>100</totAssets><netAssets>5000000000</netAssets>${flows.map(([sa, re, rd], i) => `<mon${i + 1}Flow redemption="${rd}" reinvestment="${re}" sales="${sa}"/>`).join("")}</fundInfo><invstOrSecs><invstOrSec><name>x</name></invstOrSec></invstOrSecs></formData></edgarSubmission>`;
  const q = parseNportFlows(doc("S000000001", "2026-09-30", [["300", "0", "100"], ["N/A", "N/A", "N/A"], ["200", "10", "50"]]));
  check("ETF flows: an N-PORT's three months read from mon1Flow to mon3Flow, month 3 the report's own, N/A no figure, a month with none left out", q.seriesId === "S000000001" && q.netAssets === 5e9 && q.months.length === 2 && q.months[0].month === "2026-07" && q.months[1].month === "2026-09" && netOf(q.months[0]) === 200 && netOf(q.months[1]) === 160, JSON.stringify(q.months));
  let noFlows = false;
  try { parseNportFlows(doc("S000000001", "2026-09-30", [])); } catch { noFlows = true; }
  let notNport = false;
  try { nportSeriesOf("<html>no</html>"); } catch { notNport = true; }
  check("ETF flows: a report with no flows or a document that is not an N-PORT throws, never a quiet quarter", noFlows && notNport);
  check("ETF flows: the series alone is read from the general information", nportSeriesOf(doc("S000000002", "2026-08-31", []).split("</genInfo>")[0] + "</genInfo>").seriesId === "S000000002");
  const tick = fundTickersOf({ fields: ["cik", "seriesId", "classId", "symbol"], data: [[36405, "S000002839", "C000092055", "voo"], [884394, "", "", "SPY"], ["x", "S1", "C1", "BAD"]] });
  check("ETF flows: the SEC's fund list reads by its field names, the ticker upper-cased, no series a null, a row without a CIK left out", tick.get("VOO")?.cik === 36405 && tick.get("VOO")?.seriesId === "S000002839" && tick.get("SPY")?.seriesId === null && !tick.has("BAD"));
  const subs = { filings: { recent: { form: ["NPORT-P", "497K", "NPORT-P", "NPORT-P", "NPORT-P"], accessionNumber: ["0000000001-26-000004", "0000000001-26-000009", "0000000001-26-000003", "0000000001-26-000002", "0000000001-25-000001"], filingDate: ["2026-11-25", "2026-11-01", "2026-08-25", "2026-08-20", "2025-05-01"], reportDate: ["2026-09-30", "", "2026-06-30", "2026-06-30", "2025-03-31"], primaryDocument: ["xslFormNPORT-P_X01/primary_doc.xml", "a.htm", "primary_doc.xml", "primary_doc.xml", "primary_doc.xml"] } } };
  const list = nportFilingsOf(subs, "2026-01-01");
  const idx = { "0000000001-26-000004": "S1", "0000000001-26-000003": "S2", "0000000001-26-000002": "S1" };
  check("ETF flows: a trust's NPORT-Ps since the cut, newest period first, the raw document; a series' two latest by the index", list.length === 3 && list[0].document === "primary_doc.xml" && reportsFor(list, idx, "S1").map((x) => x.accession).join(",") === "0000000001-26-000004,0000000001-26-000002" && reportsFor(list, idx, "S2").length === 1 && reportsFor(list, idx, null).length === 2);
  const merged = mergeMonths([parseNportFlows(doc("S1", "2026-06-30", [["1", "0", "0"], ["1", "0", "0"], ["1", "0", "0"]])), parseNportFlows(doc("S1", "2026-09-30", [["5", "0", "0"], ["5", "0", "0"], ["5", "0", "0"]]))]);
  check("ETF flows: two reports give six months, each once", merged.length === 6 && merged[0].month === "2026-04" && merged[5].month === "2026-09" && shiftYm("2026-01", -2) === "2025-11");
  const mk = (symbol: string, bucket: string, months: string[], net: number, assets = 1e10): FundFlow => ({ symbol, bucket, name: null, reports: [{ accession: "a", reportDate: "2026-09-30", netAssets: assets }], months: months.map((month) => ({ month, sales: net > 0 ? net : 0, reinvestment: 0, redemption: net < 0 ? -net : 0 })), readAt: "2026-11-20T05:00:00Z", error: null });
  const six = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const funds = [{ symbol: "AAA", bucket: "sp500" }, { symbol: "BBB", bucket: "bills" }, { symbol: "CCC", bucket: "factor" }, { symbol: "DDD", bucket: "factor" }, { symbol: "EEE", bucket: "munis" }];
  const kept = { AAA: mk("AAA", "sp500", six, 10e9, 5e11), BBB: mk("BBB", "bills", six, 4e9), CCC: mk("CCC", "factor", six, -2e9), DDD: mk("DDD", "factor", ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"], -1e9, 1e9) };
  const fl = etfFlows(funds, kept);
  check("ETF flows: the window is the latest three months most of the read funds' assets report; a fund short of it and one not read are named", fl.months.join(",") === "2026-07,2026-08,2026-09" && fl.counted === 3 && fl.outside.join() === "DDD" && fl.unread.join() === "EEE" && windowWords(fl.months) === "Jul to Sep 2026", JSON.stringify(fl.months));
  check("ETF flows: each bucket sums its funds over the window, pulled and landed apart, new money the difference", fl.buckets.find((b) => b.id === "sp500")?.net === 30e9 && fl.pulled === 6e9 && fl.landed === 42e9 && fl.newMoney === 36e9 && flowDollars(-6e9, true) === "−$6.0B" && flowDollars(30e9, true) === "+$30.0B");
  const sides = sankeySides(fl);
  const sum = (ns: { value: number }[]) => ns.reduce((t, n) => t + n.value, 0);
  check("ETF flows: the left side is the buckets that lost money and the new money, the right those that gained, both adding to what landed", sides.left.map((n) => n.id).join() === "factor,new" && sides.right.map((n) => n.id).join() === "sp500,bills" && Math.abs(sum(sides.left) - sum(sides.right)) < 1);
  const outflow = etfFlows(funds, { AAA: mk("AAA", "sp500", six, -10e9, 5e11), BBB: mk("BBB", "bills", six, 4e9) });
  check("ETF flows: when more left than landed, the right side carries the money that left the funds", outflow.newMoney < 0 && sankeySides(outflow).right.some((n) => n.kind === "left") && !sankeySides(outflow).left.some((n) => n.kind === "new"));
  const many = etfFlows(BUCKETS.map((b, i) => ({ symbol: `F${i}`, bucket: b.id })), Object.fromEntries(BUCKETS.map((b, i) => [`F${i}`, mk(`F${i}`, b.id, six, (i % 3 === 0 ? -1 : 1) * (i + 1) * 1e8)])));
  const ms = sankeySides(many);
  check("ETF flows: past eight a side the rest fold into one, named by count", ms.right.length <= 9 && ms.right.some((n) => /other buckets/.test(n.label)) && ms.left.filter((n) => n.kind === "out").length <= 8);
  for (const w of [343, 1000]) {
    const g = sankeyLayout(ms, w);
    const pitch = g.compact ? 30 : 34;
    const inside = [...g.left, ...g.right].every((b) => b.y >= -0.5 && b.y + b.h <= g.height + 0.5 && Number.isFinite(b.labelY));
    const apart = [g.left, g.right].every((side) => side.every((b, i) => i === 0 || b.labelY - side[i - 1].labelY >= pitch - 0.5));
    check(`ETF flows at ${w}px: every bar inside the chart, the labels a pitch apart, no path with a gap in it`, inside && apart && g.links.every((l) => !/NaN/.test(l.path)) && g.compact === w < 560, JSON.stringify(g.left.map((b) => [b.y, b.h])));
  }
  const sample = etfFlows(FLOW_FUNDS, z.record(z.string(), fundFlowSchema).parse(JSON.parse(readFileSync("data/samples/etf_flows.json", "utf8"))));
  check("ETF flows: the demo's sample is fictional, follows every fund and reads into a window", sample.followed === FLOW_FUNDS.length && sample.months.length === 3 && sample.unread.length === 0 && /\(sample\)/.test(readFileSync("data/samples/etf_flows.json", "utf8")));
  check("ETF flows: a phone draws a short name for every bucket longer than sixteen letters", BUCKETS.every((b) => (b.short ?? b.label).length <= 16));
  check("ETF flows: every followed fund names a bucket, each ticker once, a trust with no series carries its CIK and its name", FLOW_FUNDS.every((x) => BUCKETS.some((b) => b.id === x.bucket)) && new Set(FLOW_FUNDS.map((x) => x.symbol)).size === FLOW_FUNDS.length && FLOW_FUNDS.filter((x) => x.cik).every((x) => !!x.named));
  const pure = readFileSync("lib/etf-flows.ts", "utf8");
  check("ETF flows: the module is pure and the run reads only the start of each report", !/server-only|from "@\/lib\/(edgar|registry)"/.test(pure) && /FUND_INFO_END/.test(readFileSync("lib/etf-flows-run.ts", "utf8")) && /readEtfFlows\(now/.test(readFileSync("app/api/cron/screener/route.ts", "utf8")));
}

// The Flows screen's four sources beside the ETFs (Hamza, 21 Nov 2026: "not really macro ... the flows").
{
  const spx = COT_MARKETS.find((m) => m.id === "spx")!;
  const gold = COT_MARKETS.find((m) => m.id === "gold")!;
  const u = new URL(cotUrl(spx));
  check("flows: the CFTC is asked for one market by its code, newest first, only the fields read", u.host === "publicreporting.cftc.gov" && u.searchParams.get("cftc_contract_market_code") === "13874A" && /DESC/.test(u.searchParams.get("$order") ?? "") && /asset_mgr_positions_long/.test(u.searchParams.get("$select") ?? "") && !/m_money/.test(u.searchParams.get("$select") ?? "") && /72hh-3qpy/.test(cotUrl(gold)));
  const cotRaw = [
    { report_date_as_yyyy_mm_dd: "2026-11-10T00:00:00.000", open_interest_all: "1000", asset_mgr_positions_long: "600", asset_mgr_positions_short: "100", lev_money_positions_long: "100", lev_money_positions_short: "400" },
    { report_date_as_yyyy_mm_dd: "2026-11-03T00:00:00.000", open_interest_all: "1000", asset_mgr_positions_long: "500", asset_mgr_positions_short: "100", lev_money_positions_long: "200", lev_money_positions_short: "300" },
    { report_date_as_yyyy_mm_dd: "2026-10-27T00:00:00.000", open_interest_all: "1000", asset_mgr_positions_long: "300", asset_mgr_positions_short: "200", lev_money_positions_long: "250", lev_money_positions_short: "250" },
    { report_date_as_yyyy_mm_dd: "bad", open_interest_all: "1000" },
    { report_date_as_yyyy_mm_dd: "2026-10-20T00:00:00.000", open_interest_all: "0" },
  ];
  const weeks = parseCot(cotRaw, spx);
  check("flows: the CFTC's weeks read oldest first, values as strings, long less short; a row without a date or open interest left out", weeks.length === 3 && weeks[0].date === "2026-10-27" && weeks[2].net.asset === 500 && weeks[2].net.lev === -300, JSON.stringify(weeks));
  let cotThrows = false;
  try {
    parseCot([{ report_date_as_yyyy_mm_dd: "x" }], spx);
  } catch {
    cotThrows = true;
  }
  check("flows: a CFTC answer with no week throws, never a quiet market", cotThrows);
  const rows = positionRows({ markets: { spx: weeks }, problems: [], readAt: "2026-11-14T05:00:00Z" });
  const am = rows.find((r) => r.group === "asset")!;
  const lev = rows.find((r) => r.group === "lev")!;
  check("flows: each group's latest share of open interest against its own weeks, the change in points, a market not read left out", rows.length === 2 && am.pct === 50 && am.change === 10 && am.low === 10 && am.high === 50 && am.rank === 100 && lev.pct === -30 && lev.rank === 0 && rankWords(am.rank) === "near its three-year high" && rankWords(50) === "mid-range", JSON.stringify(rows));
  const tic = ["Table 1: foreign net purchases", "country\tcountry_code\tdate\tfor_lt_treas_net\tfor_lt_agcy_net\tfor_lt_corp_net\tfor_lt_eqty_net", "Japan\t42609\t2026-09\t10\t1\t2\t3", "Europe\t19992\t2026-09\t500\t5\t5\t5", "Grand Total\t99996\t2026-09\t1,200.5\t-20\t30\t-40", "Grand Total\t99996\t2026-08\t100\t0\t0\t0"].join("\n");
  const ticMonths = parseTicTable1(tic);
  check("flows: TIC's all-countries row alone, by the file's own field names, in dollars, oldest first; countries and regions never summed", ticMonths.length === 2 && ticMonths[0].month === "2026-08" && ticMonths[1].treasuries === 1200.5e6 && ticMonths[1].equities === -40e6 && foreignYear(ticMonths).treasuries === 1300.5e6, JSON.stringify(ticMonths));
  let ticThrows = false;
  try {
    parseTicTable1(tic.split("\n").filter((l) => !/Grand Total/.test(l)).join("\n"));
  } catch {
    ticThrows = true;
  }
  check("flows: a TIC file with no grand total throws, rather than adding up the countries", ticThrows);
  const ofr = parseOfrSeries([["2025-10-31", 6.0e12], ["2026-10-31", 7.2e12], ["2026-09-30", null], ["bad", 1]]);
  const ofrWrapped = parseOfrSeries({ timeseries: [["2026-10-31", 1]] });
  const cash = cashNow({ series: { total: ofr, treasuries: [{ date: "2026-10-31", value: 3.6e12 }] }, readAt: "x" });
  check("flows: the OFR's [date, value] pairs read oldest first, a null left out; the latest total, its change on a year and each part's share", ofr.length === 2 && ofr[0].date === "2025-10-31" && ofrWrapped.length === 1 && cash?.total === 7.2e12 && Math.abs((cash?.yearChange ?? 0) - 20) < 1e-9 && cash?.parts[0].share === 50, JSON.stringify(cash));
  const sub = ["ACCESSION_NUMBER\tFILING_DATE\tDOCUMENT_TYPE\tISSUERTRADINGSYMBOL", "A1\t01-JUL-2026\t4\tbrk.b", "A2\t02-JUL-2026\t4\tAAPL", "A3\t02-JUL-2026\t4/A\tAAPL", "A4\t02-JUL-2026\t4\tZZZZ"].join("\n");
  const trans = ["ACCESSION_NUMBER\tTRANS_CODE\tTRANS_SHARES\tTRANS_PRICEPERSHARE", "A1\tP\t100\t500", "A1\tP\t10\t500", "A2\tS\t1000\t200", "A2\tM\t1000\t1", "A3\tP\t1\t1", "A4\tP\t100\t100", "A2\tS\t1e12\t100"].join("\n");
  const sectors = new Map([["BRK-B", "Financials"], ["AAPL", "Information Technology"]]);
  const ins = insidersOf("2026q3", sub, trans, sectors, "x");
  const fin = ins.sectors.find((x) => x.sector === "Financials");
  const it = ins.sectors.find((x) => x.sector === "Information Technology");
  check("flows: insiders' open-market purchases and sales by sector, Form 4 alone (no amendment, no exercise), BRK.B matched to BRK-B, a company outside the index and a trade past the cap left out", fin?.bought === 55_000 && fin.buyers === 1 && it?.sold === 200_000 && it.bought === 0 && ins.companies === 2 && ins.topBuys.length === 1 && ins.topBuys[0].symbol === "BRK-B" && ins.topBuys[0].filings === 1, JSON.stringify(ins));
  let insThrows = false;
  try {
    insidersOf("2026q3", "ACCESSION_NUMBER\tDOCUMENT_TYPE\tISSUERTRADINGSYMBOL\nA1\t3\tAAPL", trans, sectors, "x");
  } catch {
    insThrows = true;
  }
  check("flows: an insider data set with no Form 4 throws", insThrows);
  check("flows: the quarters before a day, newest first, across a year", quartersBefore("2026-11-21").join() === "2026q3,2026q2" && quartersBefore("2027-02-01", 2).join() === "2026q4,2026q3" && quarterWords("2026q3") === "Jul to Sep 2026");
  const now = new Date("2026-11-21T05:00:00Z");
  const kept: FlowSourceRow = { ...EMPTY_FLOW_SOURCES, positioning: { markets: { spx: weeks }, problems: [], readAt: "2026-11-20T05:00:00Z" }, foreign: { months: ticMonths, readAt: "2026-11-20T05:00:00Z" }, tried: { positioning: { at: "2026-11-20T05:00:00Z", error: null }, foreign: { at: "2026-11-20T05:00:00Z", error: null }, cash: { at: "2026-11-20T12:00:00Z", error: "The OFR did not answer." } } };
  check("flows: a source is due when never read, past its rhythm or failed a day ago; a good copy within its rhythm is not", flowSourcesDue(kept, now).join() === "positioning,insiders" && flowSourcesDue(EMPTY_FLOW_SOURCES, now).length === 4);
  const sample = flowSourceRowSchema.parse(JSON.parse(readFileSync("data/samples/flow_sources.json", "utf8")));
  check("flows: the demo's sample parses with every source and fictional names for the largest purchases", !!sample.positioning && !!sample.foreign && !!sample.cash && !!sample.insiders && positionRows(sample.positioning).length === 10 && sample.insiders.topBuys.every((b) => !["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META"].includes(b.symbol)));
  const flowsScreen = SCREENS.flows;
  const macroPage = readFileSync("app/(app)/markets/page.tsx", "utf8");
  check("flows: a screen of its own with six cards, under Markets in the menu; Macro draws no flows", flowsScreen.slots.join() === "flow_etfs,flow_funds,flow_positioning,flow_foreign,flow_cash,flow_insiders" && !SCREENS.markets.slots.some((x) => /flow/.test(x)) && !/EtfFlowsCard|etfFlowsFor/.test(macroPage) && /"markets", "flows"/.test(readFileSync("components/app/nav-items.ts", "utf8")));
  const pureFlows = readFileSync("lib/flows.ts", "utf8");
  check("flows: the module is pure; the CFTC, the Treasury and the OFR are licensed feeds read through the market feed; the SEC through its own file", !/import "server-only"|from "@\/lib\/(edgar|registry|markets-feed)"/.test(pureFlows) && ["cftc", "ofr"].every((id) => FEEDS.some((f) => f.id === id && f.licensed)) && FEEDS.some((f) => f.hosts.includes("ticdata.treasury.gov")) && /secFile\(/.test(readFileSync("lib/flows-run.ts", "utf8")) && /readFlowSources\(now/.test(readFileSync("app/api/cron/screener/route.ts", "utf8")));
}

if (failed) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\ncheck:markets ok (${passed} passed): the feed parses, a failed indicator is a sentence, SPY and QQQ are lent to the book, a class counts its passes, and the Markets screen takes the methodology's own section name.`);
