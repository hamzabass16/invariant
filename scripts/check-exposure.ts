/**
 * Holds lib/exposure.ts to hand-computed answers on the fictional books in
 * data/samples/: net worth with real estate net of mortgage and ownership,
 * fund look-through (reported weights and equal-weight estimates), themes,
 * overlap, fixed income and commitments. Run: npm run check:exposure
 */
import { ECON_EVENTS, ECON_THROUGH, econNotices, reachKey } from "../lib/econ-calendar";
import { eventReach, reachWords } from "../lib/econ-exposure";
import { CPI_HISTORY, ECB_HISTORY, FOMC_HISTORY, JOBS_HISTORY, US_ELECTIONS } from "../lib/event-history";
import { earningsSensitivity, earningsWords, eventSensitivity, pastEvents, sensitivityView, statOf } from "../lib/event-sensitivity";
import { calendarAgentDue, calendarRequestBody, EMPTY_FOUND, foundEvents, FOUND_PREFIX, parseCalendarResponse, withFound } from "../lib/calendar-agent";
import { agentById } from "../lib/agents";
import type { EconEvent } from "../lib/econ-calendar";
import { EMPTY_MACRO, eventWindowOpen, readFrom, releaseAt, isUpdate, lastDayOf, MACRO_PREFIX, MACRO_RETRY_DAYS, macroDue, macroHeadline, macroInProgress, macroOfAlert, UPDATE_MARK, macroFigures, macroKey, macroNotices, macroReportEmail, macroReportOf, macroRequestBody, parseMacroResponse, retryHours, pricedSoon, stillPriced, tradedOn, withMacroReport, withPriced, type MacroReport } from "../lib/macro-report";
import sampleMacro from "../data/samples/macro_reports.json";
import { SCREENS } from "../lib/ontology";
import { readFileSync } from "node:fs";

import { commitments, fixedIncome, fundLookThrough, fundOverlapMatrix, netWorth, NO_SPLIT, overlap, REVENUE_REGIONS, revenueByGeography, revenueByRegion, revenueRegionOf, sectorsLookingThrough, themeExposure } from "../lib/exposure";
import { portfolioPe } from "../lib/portfolio-pe";
import { whatEachMade } from "../lib/holding-made";
import { dividendsOf, paysDividends, safetyOf } from "../lib/dividends";
import { ttmEpsHistory, type FactsTable } from "../lib/edgar-facts";
import { bookSchema, toBase } from "../lib/holdings";
import { setZoneSource } from "../lib/time";

// The checks read days and clocks in one zone, as a person in Athens would see them.
setZoneSource(() => "Europe/Athens");

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const near = (a: number | null, b: number, tol = 0.01) => a !== null && Math.abs(a - b) <= tol;

const dad = bookSchema.parse(JSON.parse(readFileSync("data/samples/dad.book.json", "utf8")));

// Hand total, EUR: cash 85,000; deposits 150,000 + 60,000×0.86 = 51,600; bonds 101,200 + 49,700;
// NVDA 16,800×0.86 = 14,448; Fund A 240,000×0.86 = 206,400; Fund B 180,000;
// Athens (420,000 − 60,000)×100% = 360,000; Paros 900,000×50% = 450,000. Total 1,648,348.
const nw = netWorth(dad);
check("net worth", near(nw.total, 1_648_348), nw.total.toFixed(2));
check("illiquid = funds + real estate", near(nw.illiquid, 206_400 + 180_000 + 360_000 + 450_000), nw.illiquid.toFixed(2));
check("oldest valuation date surfaced", nw.oldestAsOf === "2026-10-09");

const lt = fundLookThrough(dad);
const helixA = lt.find((r) => r.parentId === "vc:a" && r.name.startsWith("Helix"))!;
check("Fund A uses reported fair values (9 of 20m = 45%)", near(helixA.weight, 0.45, 1e-9) && !helixA.estimated && near(helixA.value, 206_400 * 0.45));
const helixB = lt.find((r) => r.parentId === "vc:b" && r.name.startsWith("Helix"))!;
check("Fund B without values is an equal-weight estimate", near(helixB.weight, 0.25, 1e-9) && helixB.estimated && near(helixB.value, 45_000));

const themes = themeExposure(dad);
const ai = themes.find((t) => t.theme === "AI and semiconductors")!;
// Direct NVDA 14,448; Fund A Helix 92,880 + NVDA 20,640; Fund B Helix 45,000 + Kestrel 45,000 = 217,968.
check("AI exposure looks through both funds", near(ai.value, 217_968), ai.value.toFixed(2));
check("AI estimated part is Fund B's", near(ai.estimated, 90_000), ai.estimated.toFixed(2));
check("funds are not double counted under Venture", !themes.some((t) => t.theme === "Venture"));

const ov = overlap(dad);
const nvda = ov.find((r) => r.ticker === "NVDA");
check("NVDA held at the bank and inside Fund A", !!nvda && nvda.places.length === 2 && near(nvda.total, 14_448 + 20_640), nvda ? nvda.total.toFixed(2) : "missing");
const helix = ov.find((r) => r.company.startsWith("Helix"));
check("Helix AI Labs matched across funds despite 'Inc.'", !!helix && helix.places.length === 2);
check("Northwind matched across funds", ov.some((r) => r.company.startsWith("Northwind")));
const pairs = fundOverlapMatrix(dad);
check("Fund A and Fund B share two companies", pairs.length === 1 && pairs[0].shared.length === 2, pairs.map((p) => p.shared.join(" + ")).join("; "));

const fi = fixedIncome(dad, "2026-10-11");
check("fixed income total", near(fi.total, 150_000 + 51_600 + 101_200 + 49_700), fi.total.toFixed(2));
// Weighted over stated yields: (150,000×2.4 + 51,600×3.9 + 101,200×2.9) / 302,800.
check("weighted yield uses only stated yields", near(fi.weightedYieldPct, (150_000 * 2.4 + 51_600 * 3.9 + 101_200 * 2.9) / 302_800, 1e-9), fi.weightedYieldPct?.toFixed(4));
check("yield coverage below 100% (one note has no stated yield)", near(fi.yieldCoverage, 302_800 / 352_500, 1e-9));
check("USD deposit maturing within 90 days", fi.maturingSoon.length === 1 && fi.maturingSoon[0].maturity === "2026-12-01");
check("ladder by year", fi.ladder.map((l) => l.key).join(",") === "2026,2027,2029");

const cm = commitments(dad);
check("unfunded commitments", near(cm.totalUnfunded, 90_000 * 0.86 + 100_000), cm.totalUnfunded.toFixed(2));
check("cash and deposits cover unfunded", near(cm.coverage, (85_000 + 201_600) / (77_400 + 100_000), 1e-9));

let threw = false;
try {
  toBase(100, "CHF", dad.fx);
} catch {
  threw = true;
}
check("a missing FX rate throws, never guesses", threw);

const dani = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
const daniOv = overlap(dani);
const aapl = daniOv.find((r) => r.ticker === "AAPL");
check("Dani's AAPL across two brokers and options", !!aapl && new Set(aapl.places.map((p) => p.via)).size === 3, aapl?.places.map((p) => p.via).join(", "));

// Revenue by country: each company's split from its filing, weighted by what is held. A fictional book.
const split = (lines: [string, "country" | "region", number][], placedPct = 100) => ({ form: "10-K", period: "year to 2025-12-31", periodEnd: "2025-12-31", accession: null, lines: lines.map(([name, grain, sharePct]) => ({ name, grain, sharePct })), placedPct, partial: placedPct < 97, note: null });
const holding = (id: string, symbol: string, assetClass: string, value: number, revenueGeography: unknown = undefined) => ({ id, account: id.split(":")[0], source: "manual", assetClass, symbol, name: symbol, quantity: 1, price: value, value, costBasis: null, currency: "USD", asOf: "2026-10-10", valuation: "broker", country: "US", sector: null, themes: [], ...(revenueGeography ? { revenueGeography } : {}) });
const geoBook = bookSchema.parse({
  asOf: "2026-10-10",
  holdings: [
    holding("A:NWND", "NWND", "equity", 4_000, split([["United States", "country", 60], ["Europe", "region", 40]])),
    holding("B:NWND", "NWND", "equity", 1_000, split([["United States", "country", 60], ["Europe", "region", 40]])),
    holding("A:KSTR", "KSTR", "equity", 2_000, split([["United States", "country", 50], ["Germany", "country", 30]], 80)),
    holding("A:FUND", "FUND", "etf", 2_000),
    holding("A:USD", "USD", "cash", 1_000),
  ],
  lookThrough: [],
  transactions: [],
  fx: { base: "USD", rates: {}, asOf: "2026-10-10", source: "x" },
});
const rev = revenueByGeography(geoBook);
const us = rev.places.find((p) => p.name === "United States");
// United States: 5,000×60% + 2,000×50% = 4,000 of 10,000; Europe 2,000; Germany 600; not placed 2,000×20% = 400; no split 3,000.
check("revenue by country weights each company's lines by what is held, summed across accounts and companies", near(us?.value ?? null, 4_000) && near(us?.share ?? null, 0.4, 1e-9) && us?.symbols.join(",") === "NWND,KSTR" && near(rev.places.find((p) => p.name === "Europe")?.value ?? null, 2_000) && rev.places.find((p) => p.name === "Germany")?.grain === "country", JSON.stringify(rev.places));
check("a company's revenue its filing does not place is its own line, never a country", near(rev.unplaced.value, 400) && rev.unplaced.symbols.join(",") === "KSTR" && !rev.places.some((p) => /unknown/i.test(p.name)));
check("cash and holdings with no split are one named remainder, with how many and what weight", rev.rest.count === 2 && near(rev.rest.value, 3_000) && near(rev.rest.share, 0.3, 1e-9) && rev.rest.labels.join(",") === "FUND,USD cash" && NO_SPLIT === "Cash and holdings with no geographic split");
check("the lines, the not placed and the remainder add up to net worth", near(rev.places.reduce((s, p) => s + p.value, 0) + rev.unplaced.value + rev.rest.value, rev.total));
check("each company is listed once with its split's source", rev.companies.map((c) => `${c.symbol}:${c.value}`).join(",") === "NWND:5000,KSTR:2000" && rev.companies[0].geography.form === "10-K");
const dadRev = revenueByGeography(dad);
check("a book whose filings are unread has no country at all: everything is the named remainder, never 100% unknown", dadRev.places.length === 0 && near(dadRev.rest.share, 1, 1e-9) && dadRev.rest.count > 0);

// Revenue by region (Hamza, 15 Oct 2026): every reported line in the one region it names, so no two slices overlap.
check("each reported line goes to the one region it names: Europe with Canada to EMEA, the US with Canada to the Americas, an unnamed elsewhere to rest of world", revenueRegionOf("Europe and Canada") === "Europe, Middle East and Africa" && revenueRegionOf("US & Canada") === "Americas" && revenueRegionOf("Americas") === "Americas" && revenueRegionOf("United States") === "Americas" && revenueRegionOf("Greater China") === "Asia-Pacific" && revenueRegionOf("Rest of world") === "Rest of world, not split" && revenueRegionOf("International") === "Rest of world, not split" && revenueRegionOf("Netherlands") === "Europe, Middle East and Africa");
const reg = revenueByRegion(geoBook);
check("revenue by region adds the lines into four regions that never overlap, and keeps the same remainders", reg.regions.map((r) => r.region).join("|") === "Americas|Europe, Middle East and Africa" && near(reg.regions[0].value, 4_000) && near(reg.regions[1].value, 2_600) && near(reg.regions.reduce((s, r) => s + r.value, 0) + reg.unplaced.value + reg.rest.value, reg.total) && REVENUE_REGIONS.length === 4, JSON.stringify(reg.regions));

// Sectors looking through funds (Hamza, 19 Oct 2026): a fund the report opens counts toward its companies' sectors at its weight times each one's share.
{
  const lt = [
    { parentId: "f1", name: "A", ticker: "A", sector: "Information Technology", country: null, stage: null, themes: [], fairValue: 75, asOf: "2026-10-01", parentName: "Fund", weight: 0.75, value: 0, estimated: false },
    { parentId: "f1", name: "B", ticker: "B", sector: "Health Care", country: null, stage: null, themes: [], fairValue: 25, asOf: "2026-10-01", parentName: "Fund", weight: 0.25, value: 0, estimated: false },
  ];
  const sec = sectorsLookingThrough([{ symbol: "MSFT", weight: 30, sector: "Information Technology", ids: ["h1"] }, { symbol: "FUND", weight: 20, sector: null, ids: ["f1"] }, { symbol: "XYZ", weight: 5, sector: null, ids: ["h3"] }], lt);
  const it = sec.find((x) => x.sector === "Information Technology")!;
  const hc = sec.find((x) => x.sector === "Health Care")!;
  check("a fund's companies count toward their own sectors, the holding's toward its own; what has none comes last", near(it.weight, 45) && near(it.direct, 30) && near(it.throughFunds, 15) && it.funds.join() === "FUND" && it.symbols.join() === "MSFT" && near(hc.weight, 5) && sec.at(-1)!.sector === "No sector yet" && near(sec.reduce((t, x) => t + x.weight, 0), 55), JSON.stringify(sec.map((x) => [x.sector, x.weight])));
}

// The portfolio's P/E: the harmonic mean by value, and its year from closes against trailing EPS as known then.
{
  const today = "2026-10-16";
  const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse("2025-10-01T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10)).filter((d) => d <= today);
  const flat = (v: number) => days(400).map((date) => ({ date, value: v }));
  const eps = [{ end: "2025-03-31", eps: 4 }, { end: "2025-06-30", eps: 4 }, { end: "2025-09-30", eps: 5 }, { end: "2025-12-31", eps: 5 }, { end: "2026-03-31", eps: 5 }, { end: "2026-06-30", eps: 5 }];
  const r = portfolioPe([
    { symbol: "AAA", value: 600, price: 100, pe: 20, epsTtm: eps, closes: flat(100) },
    { symbol: "BBB", value: 400, price: 50, pe: 10, epsTtm: [{ end: "2025-03-31", eps: 5 }, { end: "2026-06-30", eps: 5 }], closes: flat(50) },
    { symbol: "LOSS", value: 100, price: 10, pe: null, epsTtm: null, closes: null },
  ], today);
  // 1000 / (600/20 + 400/10) = 1000 / 70.
  check("today's P/E is value over earnings, a holding with no P/E left out and named", near(r.pe, 1000 / 70) && near(r.earningsYield, 7) && near(r.coveredPct, (1000 / 1100) * 100) && r.left.length === 1 && r.left[0].symbol === "LOSS" && r.included[0].symbol === "AAA" && near(r.included[0].weight, 60), JSON.stringify([r.pe, r.coveredPct]));
  // Before 14 Nov 2025 (30 Sep plus 45 days) AAA's known EPS was 4, so its P/E was 25 at the same price: 1000 / (600/25 + 400/10) = 15.625.
  const early = r.history.find((h) => h.date === "2025-11-01")!;
  const late = r.history.find((h) => h.date === "2026-01-05")!;
  check("the year reads each holding's EPS as known then, a quarter counting 45 days after it ends", !!early && near(early.pe, 15.63, 0.01) && !!late && near(late.pe, 1000 / 70, 0.01) && r.historyPct > 99 && !!r.range && near(r.range.high, 15.63, 0.01) && near(r.range.low, 1000 / 70, 0.01), JSON.stringify([early, late, r.range]));
  const odd = portfolioPe([{ symbol: "AAA", value: 600, price: 100, pe: 20, epsTtm: null, closes: null }, { symbol: "SPL", value: 400, price: 100, pe: 1.2, epsTtm: null, closes: null }], today);
  check("a P/E under 3× is named as a misread, never let pull the mean down", odd.pe === 20 && odd.left.some((l) => l.symbol === "SPL" && /split/.test(l.why)));
  const none = portfolioPe([{ symbol: "AAA", value: 600, price: 100, pe: 20, epsTtm: null, closes: flat(100) }], today);
  check("without trailing EPS by quarter the range waits and says why, never guessed", none.pe === 20 && none.range === null && none.history.length === 0 && /no trailing EPS/.test(none.historyLeft[0]?.why ?? ""));
  const t = { latestQuarter: "2026Q2", quarterly: { epsDiluted: { "2025Q1": 1, "2025Q2": 1, "2025Q3": 1.2, "2025Q4": 1.3, "2026Q1": 1.4, "2026Q2": 1.5 } }, annual: { epsDiluted: {} } } as unknown as FactsTable;
  const hist = ttmEpsHistory(t);
  check("trailing EPS by quarter sums each quarter's four, dated by the quarter's end, oldest first", hist.length === 3 && hist[0].end === "2025-12-31" && near(hist[0].eps, 4.5) && hist[2].end === "2026-06-30" && near(hist[2].eps, 5.4), JSON.stringify(hist));
}

// What each holding made (Hamza, 19 Oct 2026): past year from the value a year ago and the year's fills; since the start from cost basis and realised.
{
  const h = (symbol: string, quantity: number, price: number, costBasis: number | null) => ({ id: `ib:${symbol}`, account: "IBKR", source: "ibkr", assetClass: "equity", symbol, name: symbol, quantity, price, value: quantity * price, costBasis, currency: "USD", asOf: "2026-10-16", valuation: "broker", country: null, sector: null, themes: [] });
  const t = (date: string, kind: string, symbol: string, quantity: number, price: number | null, amount: number, realized?: number) => ({ date, account: "IBKR", kind, symbol, quantity, price, amount, currency: "USD", ...(realized !== undefined ? { realized } : {}) });
  const b = bookSchema.parse({
    asOf: "2026-10-16",
    holdings: [h("AAA", 10, 120, 900), h("BBB", 5, 40, 250)],
    lookThrough: [],
    transactions: [t("2026-03-02", "buy", "BBB", 5, 50, -250), t("2026-02-01", "sell", "CCC", -4, 30, 120, 20), t("2026-05-01", "dividend", "AAA", 0, null, 15), t("2026-06-01", "interest", "", 0, null, 7), t("2026-06-01", "fee", "", 0, null, -3)],
    fx: { base: "USD", asOf: "2026-10-16", rates: {}, source: "test" },
    series: { nav: [], benchmarks: {}, holdings: { AAA: [{ date: "2025-10-15", value: 100 }], CCC: [{ date: "2025-10-14", value: 25 }] }, source: "test" },
  });
  const y = whatEachMade(b, "year", "2026-10-16");
  const by = (sym: string) => y.rows.find((r) => r.symbol === sym)!;
  // AAA: 1200 - 10×100 + 15 = 215; BBB: 200 - 0 - 250 = -50; CCC sold: 0 - 4×25 + 120 = 20; interest and fees +4.
  check("the past year: value now less a year ago, less buys, plus sales and dividends; a sold holding marked; interest and fees apart", near(by("AAA").made, 215) && near(by("AAA").dividends, 15) && near(by("BBB").made, -50) && near(by("CCC").made, 20) && by("CCC").sold && near(y.other, 4) && near(y.total, 189) && y.rows[0].symbol === "AAA" && y.from === "2025-10-16", JSON.stringify(y));
  check("each holding's return is what it made over the money it had at work, and the map sizes it by its value now", near(by("AAA").pct, 21.5) && near(by("BBB").pct, -20) && near(by("CCC").pct, 20) && near(by("AAA").value, 1200) && by("CCC").value === 0, JSON.stringify(y.rows.map((r) => [r.symbol, r.pct, r.value])));
  const st = whatEachMade(b, "start", "2026-10-16");
  const bs = (sym: string) => st.rows.find((r) => r.symbol === sym)!;
  check("since the start: value less cost basis, plus the broker's realised and dividends", near(bs("AAA").made, 315) && near(bs("BBB").made, -50) && near(bs("CCC").made, 20) && bs("CCC").sold, JSON.stringify(st.rows));
  const noClose = whatEachMade({ ...b, series: undefined }, "year", "2026-10-16");
  check("a holding held a year ago with no close then is named, never counted as zero", noClose.left.some((l) => l.symbol === "AAA" && /no close/.test(l.why)) && !noClose.rows.some((r) => r.symbol === "AAA"));
}

// --- Dividends (Hamza, 19 Oct 2026) -------------------------------------------
{
  const dani = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
  const d = dividendsOf(dani, "2026-10-11");
  check("a payer the filings do not cover counts what it paid over the past year, net of tax: AAPL across two accounts and VOO", d.holdings.map((h) => `${h.symbol}:${h.annual}:${h.source}`).join(",") === "AAPL:371:received,VOO:308:received" && d.annual === 679 && d.monthly === 56.58, d.holdings.map((h) => `${h.symbol}:${h.annual}:${h.source}`).join(","));
  check("the yield is the year's dividends over every listed holding's value, the yield on cost over what they cost", d.yieldPct === 0.67 && d.yieldOnCostPct === 0.83, `${d.yieldPct} ${d.yieldOnCostPct}`);
  check("received over the past twelve months against the twelve before", d.received12 === 679 && d.receivedPrior12 === 641 && d.growthPct === 5.9 && d.ledger && d.since === "2024-11-14", `${d.received12} ${d.receivedPrior12} ${d.growthPct}`);
  check("the past twelve months by month, and the last three calendar years month by month", d.byMonth.length === 12 && d.byMonth[0].month === "2025-11" && d.byMonth[0].amount === 91 && d.byMonth.at(-1)!.month === "2026-10" && d.byYear.map((y) => y.year).join(",") === "2024,2025,2026" && d.byYear[2].months[8] === 80, JSON.stringify(d.byMonth.slice(0, 2)));
  check("future payments place each payer in the months it paid in, its year shared by what it paid then, from next month", d.upcoming[0].month === "2026-11" && d.upcoming[0].amount === 91 && d.upcoming[0].parts[0].symbol === "AAPL" && d.upcoming[1].amount === 74 && Math.abs(d.upcoming.reduce((t, u) => t + u.amount, 0) - 679) < 0.05 && !d.undated.length, JSON.stringify(d.upcoming.slice(0, 2)));
  check("received by company, largest first", d.receivedBySymbol.map((r) => r.symbol).join(",") === "AAPL,VOO");
  const withFilings = { ...dani, holdings: dani.holdings.map((h) => (h.symbol === "AAPL" && h.assetClass === "equity" ? { ...h, fundamentals: { dividend_yield_pct: 0.5, payout_ratio_pct: 15, dividend_growth_5y_pct: 5, dividend_years_raised: 12 } } : h)) };
  const f = dividendsOf(withFilings, "2026-10-11");
  const aapl = f.holdings.find((h) => h.symbol === "AAPL")!;
  check("a company with a yield in its filings is set to pay that yield on what is held, and its safety reads Reliable on all four tests", aapl.source === "filings" && aapl.annual === 402.5 && aapl.safety?.score === 100 && aapl.safety.band === "Reliable" && f.holdings.find((h) => h.symbol === "VOO")!.safety === null, JSON.stringify(aapl.safety));
  check("safety scores the tests the filings read, bands the score, and gives none below three tests", safetyOf({ payoutPct: 70, yearsRaised: 3, growth5yPct: 2.5, yieldPct: 7 })?.score === 45 && safetyOf({ payoutPct: 70, yearsRaised: 3, growth5yPct: 2.5, yieldPct: 7 })?.band === "Uncertain" && safetyOf({ payoutPct: 120, yearsRaised: null, growth5yPct: -3, yieldPct: 12 })?.band === "At risk" && safetyOf({ payoutPct: 50, yearsRaised: null, growth5yPct: null, yieldPct: 3 }) === null);
  const noLedger = dividendsOf({ ...withFilings, transactions: [] }, "2026-10-11");
  check("without a ledger the filings still give the year, the payer is named as not placed in a month, and nothing received is shown as zero", noLedger.annual === 402.5 && noLedger.received12 === null && !noLedger.ledger && noLedger.undated.map((u) => u.symbol).join(",") === "AAPL" && noLedger.upcoming.every((u) => u.amount === 0));
  check("a book pays dividends when its ledger shows one or the filings give a listed holding a yield", paysDividends(dani) && paysDividends({ ...withFilings, transactions: [] }) && !paysDividends({ ...dani, transactions: [] }));
}

// What a calendar event touches in the book (Hamza, 27 Oct 2026): revenue there, its currency, the methodology's rules on what it moves.
{
  const ecb = eventReach("ecb", "euro", geoBook, null);
  check("econ reach: the ECB touches the revenue reported in euro-area countries, and a line naming Europe is counted apart", Math.abs(ecb.revenue.share - 0.06) < 1e-9 && ecb.revenue.symbols.join() === "KSTR" && Math.abs(ecb.wider.share - 0.2) < 1e-9 && ecb.currency.share === 0, JSON.stringify({ r: ecb.revenue.share, w: ecb.wider.share }));
  const fed = eventReach("fomc", "us", geoBook, null);
  check("econ reach: the Fed touches the US revenue and every holding in dollars", Math.abs(fed.revenue.share - 0.4) < 1e-9 && Math.abs(fed.currency.share - 1) < 1e-9);
  const words = reachWords(ecb);
  check("econ reach: in words, with the methodology saying when it has no figure on what the event moves", words.some((w) => /6\.0% of your book is revenue your holdings report in the euro area \(KSTR\)/.test(w)) && words.some((w) => /wider region/.test(w)) && words.some((w) => /no figure on the indicators it moves/.test(w)), words.join(" | "));
  const world = reachWords(eventReach("opec", "world", geoBook, null));
  check("econ reach: an event of no one economy is read through the methodology alone", world.length === 1 && /methodology/.test(world[0]));
  const notices = econNotices("2026-11-02", ECON_EVENTS, { [reachKey({ kind: "election", area: "us" })]: ["Reach line."] });
  check("econ alerts: one per day with events, the day before and on the day, carrying the reach", notices.length === 1 && notices[0].key === "econ:2026-11-03" && /^Tomorrow: /.test(notices[0].title) && /US midterm elections/.test(notices[0].title) && /Reach line\./.test(notices[0].detail) && econNotices("2026-11-03").some((n) => /^Today: /.test(n.title)) && !econNotices("2026-11-04").some((n) => n.key === "econ:2026-11-03"), notices.map((n) => n.title).join(" | "));
  check("econ calendar: the major central banks and the elections are on it, and an election set far ahead does not stretch the release table", ["ecb", "boe", "boj", "boc", "snb"].every((k) => ECON_EVENTS.some((e) => e.kind === k)) && ECON_EVENTS.some((e) => e.kind === "election" && e.area === "israel") && ECON_EVENTS.some((e) => e.kind === "election" && e.area === "france") && ECON_EVENTS.some((e) => e.kind === "summit" && e.short === "G20") && ECON_EVENTS.some((e) => e.kind === "opec") && ECON_THROUGH === ECON_EVENTS.filter((e) => e.kind === "jolts").map((e) => e.date).sort().at(-1) && ECON_EVENTS.some((e) => e.kind === "gdp" && e.date === "2027-12-22"));
}

// The historical sensitivity (Hamza, 27 Oct 2026): today's book on each past occurrence, by outcome, beside SPY; history, never a forecast.
{
  const asc = (xs: readonly (readonly [string, ...unknown[]])[]) => xs.every((x, i) => i === 0 || x[0] > xs[i - 1][0]);
  check("event history: every table is in date order, dates are days, and the Fed's moves are whole quarter points", [FOMC_HISTORY, CPI_HISTORY, JOBS_HISTORY, ECB_HISTORY].every((t) => asc(t) && t.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x[0]))) && FOMC_HISTORY.every(([, bp]) => bp % 25 === 0) && FOMC_HISTORY.some(([d, bp]) => d === "2020-03-15" && bp === -100) && US_ELECTIONS.includes("2024-11-05"));
  check("event history: outcomes are read from the publisher's figure, the reading before it the comparison", pastEvents({ kind: "fomc", area: "us" }).find((p) => p.date === "2022-06-15")?.outcome === "Hike" && pastEvents({ kind: "cpi", area: "us" }).every((p) => p.outcome === "Inflation higher" || p.outcome === "Inflation not higher") && pastEvents({ kind: "election", area: "france" }).length === 0 && pastEvents({ kind: "gdp", area: "us" }).length === 0);
  // A made-up market: SPY up 1% on cut days, down 1% on hike days; one holding moves twice as much.
  const days: string[] = [];
  for (let t = Date.parse("2022-01-03T00:00:00Z"); t <= Date.parse("2022-12-30T00:00:00Z"); t += 86_400_000) if (![0, 6].includes(new Date(t).getUTCDay())) days.push(new Date(t).toISOString().slice(0, 10));
  const fomc = new Map(FOMC_HISTORY.filter(([d]) => d.startsWith("2022")).map(([d, bp]) => [d, bp]));
  let spy = 100;
  let aaa = 100;
  const bench: { date: string; value: number }[] = [];
  const held: { date: string; value: number }[] = [];
  for (const d of days) {
    const bp = fomc.get(d);
    const m = bp === undefined ? 0 : bp > 0 ? -0.01 : bp < 0 ? 0.01 : 0.002;
    spy *= 1 + m;
    aaa *= 1 + 2 * m;
    bench.push({ date: d, value: spy });
    held.push({ date: d, value: aaa });
  }
  const s = eventSensitivity({ kind: "fomc", area: "us" }, [{ symbol: "AAA", weight: 0.5 }], { AAA: held }, bench, { Cut: 0.2, Hold: 0.3, Hike: 0.5 });
  const hike = s?.rows.find((r) => r.outcome === "Hike");
  const holdRow = s?.rows.find((r) => r.outcome === "Hold");
  check("sensitivity: a hike day's move is today's weight times the holding's move, beside SPY's, counted per outcome", !!hike && hike.book!.n === 7 && Math.abs(hike.book!.mean - -0.01) < 1e-9 && Math.abs(hike.spy!.mean - -0.01) < 1e-9 && hike.book!.down === 1 && Math.abs(holdRow!.book!.mean - 0.002) < 1e-9, JSON.stringify(s?.rows.map((r) => [r.outcome, r.book?.n, r.book?.mean])));
  check("sensitivity: the markets' prices weigh only the outcomes history has, so a cut nobody lived through this year is left out", !!s?.expected && !("Cut" in s.expected.prices) && Math.abs(s.expected.book - (0.3 * 0.002 + 0.5 * -0.01) / 0.8) < 1e-9);
  check("sensitivity: a session with under half the book's closes is not a reading, and closes that reach nothing say so", eventSensitivity({ kind: "fomc", area: "us" }, [{ symbol: "AAA", weight: 0.5 }, { symbol: "BBB", weight: 0.5 }], { AAA: held.slice(0, 5) }, bench)?.rows.every((r) => r.book === null || r.book.n === 0) !== false && eventSensitivity({ kind: "fomc", area: "us" }, [], {}, [])?.note === "The closes the app reads do not reach any past occurrence.");
  check("sensitivity: the mean carries a 95% interval that holds it, and one reading has no width", (() => { const st = statOf([0.01, -0.02, 0.005, 0.0]); const one = statOf([0.01]); return !!st && st.lo < st.mean && st.hi > st.mean && st.n === 4 && Math.abs(st.down - 0.25) < 1e-12 && one!.lo === one!.hi; })());
  const view = s ? sensitivityView(s) : null;
  check("sensitivity: the screen's rows are text with the interval, and the words say history at today's weights", !!view && /today's weights/.test(view.title) && /\(.+ to .+\)/.test(view.rows[0].book) && view.words.some((w) => /At the markets' prices/.test(w)));
  const e = earningsSensitivity([0.08, -0.05, 0.02, -0.03], 0.1, 6);
  check("sensitivity: a company's past reactions give the move either way and its share of the book, with the options' price beside", !!e && Math.abs(e.absMean - 0.045) < 1e-12 && Math.abs(e.bookMean - 0.0045) < 1e-12 && e.up === 2 && earningsWords("AAA", e).some((w) => /0\.60% of your book/.test(w)) && earningsSensitivity([], 0.1) === null);
}

// The Calendar agent (Hamza, 27 Oct 2026): monthly, three months out, each event with its official page.
{
  const today = "2026-11-01";
  check("calendar agent: due once a month, tried again the next day after a failure", calendarAgentDue(null, today) && !calendarAgentDue({ ...EMPTY_FOUND, month: "2026-11" }, "2026-11-20") && !calendarAgentDue({ ...EMPTY_FOUND, month: "2026-10", ranAt: "2026-11-01T06:00:00Z" }, today) && calendarAgentDue({ ...EMPTY_FOUND, month: "2026-10", ranAt: "2026-11-01T06:00:00Z" }, "2026-11-02"));
  const body = calendarRequestBody(today) as { tools: { type?: string; name: string }[]; tool_choice: { type: string }; max_tokens: number; system: string; temperature?: number };
  check("calendar agent: one call with web search and a recording tool, never forced, no temperature, the window named", body.tools.some((t) => t.type === "web_search_20250305") && body.tools.some((t) => t.name === "record_events") && body.tool_choice.type === "auto" && body.temperature === undefined && body.system.includes("2027-02-01"));
  const answer = { content: [{ type: "tool_use", name: "record_events", input: { events: [
    { date: "2026-12-05", kind: "summit", area: "world", name: "Sample summit", short: "Sample", time: "All day", about: "Leaders meet.", source: "https://example.org/summit" },
    { date: "2026-11-09", kind: "deadline", area: "us", name: "Section 301 tariff exclusions expire", time: "All day", about: "Already held.", source: "https://ustr.gov/x" },
    { date: "2027-05-01", kind: "election", area: "uk", name: "Too far", time: "", about: "", source: "https://example.org/far" },
    { date: "2026-12-10", kind: "fomc", area: "us", name: "Not ours", time: "", about: "", source: "https://example.org/fed" },
    { date: "2026-12-11", kind: "election", area: "atlantis", name: "Nowhere", time: "", about: "", source: "https://example.org/x" },
    { date: "2026-12-12", kind: "opec", area: "world", name: "No page", time: "", about: "", source: "http://example.org/opec" },
    { date: "2026-12-14", kind: "election", area: "japan", name: "Japan upper house vote (sample)", about: "A vote.", source: "https://example.org/jp" },
    "junk",
  ], note: "" } }] };
  const parsed = parseCalendarResponse(answer, today);
  check("calendar agent: read item by item; outside the window, a kind or economy the calendar does not draw, no https page or already on the table are dropped and counted", parsed.ok && parsed.events.map((x) => x.name).join("|") === "Sample summit|Japan upper house vote (sample)" && parsed.dropped === 6 && parsed.events[1].time === "", JSON.stringify(parsed));
  check("calendar agent: an answer in words or cut short is a sentence, never an empty calendar", !parseCalendarResponse({ content: [{ type: "text", text: "hi" }] }, today).ok && /ran past/.test((parseCalendarResponse({ content: [], stop_reason: "max_tokens" }, today) as { reason: string }).reason));
  const kept = withFound({ ...EMPTY_FOUND, events: [{ date: "2026-10-20", kind: "summit", area: "world", name: "Old", time: "", about: "", source: "https://example.org/old", found: "2026-10-01" }, { date: "2026-11-20", kind: "summit", area: "world", name: "Replaced", time: "", about: "", source: "https://example.org/r", found: "2026-10-01" }] }, parsed.ok ? parsed.events : [], today, new Date("2026-11-01T06:00:00Z"), "s");
  check("calendar agent: a run replaces the window's events and keeps the past month's; the month is marked", kept.events.map((x) => x.name).join("|") === "Old|Sample summit|Japan upper house vote (sample)" && kept.month === "2026-11");
  const found = foundEvents(kept);
  const alerts = econNotices("2026-12-04", found, {}, FOUND_PREFIX);
  check("calendar agent: what it found is drawn like the table's and alerted the day before under its own prefix", found.every((x) => x.indicator === null && /Calendar agent/.test(x.about)) && alerts.length === 1 && alerts[0].key === "econ-found:2026-12-05" && /Tomorrow: Sample summit/.test(alerts[0].title));
  check("calendar agent: on the Agents page with a ceiling, running on the person's key through callModel, kept in the vault", agentById("calendar_agent")?.weeklyUsd === 1 && /callModel\(provider, calendarRequestBody\(/.test(readFileSync("lib/calendar-agent-run.ts", "utf8")) && /providerCannot\(provider, "web_search"\)/.test(readFileSync("lib/calendar-agent-run.ts", "utf8")) && /"calendar_events"/.test(readFileSync("lib/vault-keys.ts", "utf8")));
}

// One calendar (Hamza, 27 Oct 2026): the Calendar holds it all, Macro and Earnings link to it.
check("one calendar: the Calendar draws the events with the results, their reach and history; Macro lists the next two weeks and links; Earnings links", /calendarView\(\{/.test(readFileSync("app/(app)/calendar/page.tsx", "utf8")) && /NextOnCalendar/.test(readFileSync("app/(app)/markets/page.tsx", "utf8")) && !/EconCalendar /.test(readFileSync("app/(app)/markets/page.tsx", "utf8")) && /\/calendar#econ-calendar/.test(readFileSync("app/(app)/earnings/page.tsx", "utf8")) && SCREENS.calendar.shown === "always" && SCREENS.calendar.slots[0] === "economic_calendar");

// After each macro event, a report, an alert with its moves and an email (Hamza, 27 and 29 Oct 2026).
async function macroChecks() {
  const ev = (date: string, kind: EconEvent["kind"], name: string, area: EconEvent["area"] = "us"): EconEvent => ({ date, kind, area, name, time: "", about: "A sample.", source: "https://example.org/e", indicator: null });
  check(
    "event reports: the session that traded an event: its own day, the next for an election or a deadline, after a summit's last day, past a weekend and a holiday",
    tradedOn(ev("2026-10-28", "fomc", "Fed rate decision")) === "2026-10-28" && tradedOn(ev("2026-11-03", "election", "US midterm elections")) === "2026-11-04" && tradedOn(ev("2026-10-26", "summit", "CCP Central Committee plenum, to 29 October", "china")) === "2026-10-30" && tradedOn(ev("2026-11-29", "opec", "OPEC+")) === "2026-11-30" && tradedOn(ev("2026-11-09", "deadline", "Tariffs", "china")) === "2026-11-10" && tradedOn(ev("2026-11-26", "summit", "EU Council, to 27 November", "euro")) === "2026-11-30" && lastDayOf(ev("2026-12-30", "summit", "Sample, to 2 January", "world")) === "2027-01-02",
  );
  const fed = ev("2026-10-28", "fomc", "Fed rate decision");
  const cpi = ev("2026-10-14", "cpi", "Consumer prices (CPI)");
  const old = ev("2026-10-01", "jobs", "Jobs report");
  const later = ev("2026-10-30", "boj", "Bank of Japan rate decision", "japan");
  const earn: EconEvent = { ...ev("2026-10-28", "earnings", "META results"), symbol: "META" };
  const keptCpi = { ...EMPTY_MACRO, reports: [{ ...(sampleMacro.reports[1] as unknown as MacroReport), key: macroKey(cpi), outcome: null, tries: 1, triedAt: "2026-10-16T20:40:00Z", outcomeAt: null }] };
  const due = macroDue([fed, cpi, old, later, earn], keptCpi, true, "2026-10-28T21:00:00Z");
  check("event reports: due once read can begin, within five days, never a company's results; a report without its outcome past seven days is left", due.map((e) => e.name).join("|") === "Fed rate decision", due.map((e) => e.name).join("|"));
  {
    // One step (Hamza, 7 Nov 2026): the outcome and how investors took it, half an hour after the event, never waiting for the close.
    const fedAt = { ...fed, time: "14:00 ET" };
    const cpiAt = { ...ev("2026-11-10", "cpi", "Consumer prices (CPI)"), time: "08:30 ET" };
    const ecbAt = { ...ev("2026-10-29", "ecb", "ECB rate decision", "euro"), time: "14:15 CET" };
    const boeAt = { ...ev("2026-11-05", "boe", "Bank of England rate decision", "uk"), time: "12:00 London" };
    const mid = ev("2026-11-03", "election", "US midterm elections");
    check(
      "event one step: the event's own clock on its calendar line in New York, Frankfurt or London, through the clocks' change, and read 30 minutes after; with no clock, an election from midnight UTC after it, the Bank of Japan in Tokyo's morning, any other from 14:00 UTC",
      releaseAt(fedAt) === Date.parse("2026-10-28T18:00:00Z") && readFrom(fedAt) === Date.parse("2026-10-28T18:30:00Z") && readFrom(cpiAt) === Date.parse("2026-11-10T14:00:00Z") && releaseAt(ecbAt) === Date.parse("2026-10-29T13:15:00Z") && releaseAt(boeAt) === Date.parse("2026-11-05T12:00:00Z") &&
        readFrom(mid) === Date.parse("2026-11-04T00:00:00Z") && readFrom(later) === Date.parse("2026-10-30T04:00:00Z") && readFrom(cpi) === Date.parse("2026-10-14T14:00:00Z") && releaseAt(mid) === null,
    );
    check("event one step: due half an hour after it came out, the session still open; without a model, a kept report is not asked again", macroDue([fedAt], null, true, "2026-10-28T18:20:00Z").length === 0 && macroDue([fedAt], null, true, "2026-10-28T18:35:00Z").length === 1 && macroDue([mid], null, true, "2026-11-04T06:00:00Z").length === 1 && macroDue([mid], null, true, "2026-11-03T23:00:00Z").length === 0);
    check("event one step: the quarter-hourly watch opens for three hours from when an event's report can be read", !eventWindowOpen([fedAt], new Date("2026-10-28T18:00:00Z")) && eventWindowOpen([fedAt], new Date("2026-10-28T19:00:00Z")) && !eventWindowOpen([fedAt], new Date("2026-10-28T22:00:00Z")) && !eventWindowOpen([{ ...fedAt, kind: "earnings" }], new Date("2026-10-28T19:00:00Z")));
    const outcome = { label: null, decided: "A sample outcome was declared.", expected: null, surprise: null, markets: "Investors bought the banks and sold long bonds.", points: [], final: true };
    const figures = { markets: [], book: null, bookNote: null, history: null };
    const one = macroReportOf(mid, "2026-11-04", figures, null, [], { outcome, note: null, tried: true, hours: 2 }, null, "2026-11-04T06:00:00Z");
    const file1 = withMacroReport(null, one, "2026-11-04T06:00:00Z");
    const n1 = macroNotices(file1, "2026-11-04");
    check("event one step: one report, one alert with the outcome and how investors took it, never read again once final", one.stage === "reaction" && one.outcomeAt === null && n1.length === 1 && n1[0].key === `${MACRO_PREFIX}${macroKey(mid)}` && /A sample outcome was declared/.test(n1[0].title) && /bought the banks/.test(n1[0].detail) && /^After US midterm elections/.test(macroReportEmail(one, null).subject) && /How investors took it/.test(macroReportEmail(one, null).text) && macroDue([mid], file1, true, "2026-11-04T21:30:00Z").length === 0, JSON.stringify(n1.map((n) => [n.key, n.title, n.detail])));
    const early = macroReportOf(fedAt, "2026-10-28", figures, null, [], { outcome, note: null, tried: true }, null, "2026-10-28T18:40:00Z");
    check("event one step: a report written before its session's close is an alert that day", macroNotices(withMacroReport(null, early, "x"), "2026-10-28").length === 1);
    const pending = macroReportOf(mid, "2026-11-04", figures, null, [], { outcome: { ...outcome, final: false }, note: null, tried: true, hours: 2 }, null, "2026-11-04T01:00:00Z");
    const file2 = withMacroReport(null, pending, "2026-11-04T01:00:00Z");
    check("event one step: an outcome not final is read again every two hours for two days, then every six", macroDue([mid], file2, true, "2026-11-04T02:00:00Z").length === 0 && macroDue([mid], file2, true, "2026-11-04T03:00:00Z").length === 1 && pending.outcomeAt === null && /every 2 hours/.test(pending.outcomeNote ?? "") && retryHours(mid, "2026-11-04T03:00:00Z") === 2 && retryHours(mid, "2026-11-06T03:00:00Z") === 6);
    const legacy = withMacroReport(null, { ...one, stage: "outcome" }, "x");
    check("event one step: a report kept from the two steps with its outcome alone is read once more, outcome and reaction together", macroDue([mid], legacy, true, "2026-11-07T00:30:00Z").length === 1 && macroDue([mid], legacy, false, "2026-11-07T00:30:00Z").length === 0);
    const before = macroInProgress([fedAt], null, new Date("2026-10-28T17:00:00Z"));
    check("event one step: Being read now says when the report is read, half an hour after the event", before.length === 1 && before[0].state === "waiting" && /30 minutes after it comes out, from 28 Oct, 20:30 your time/.test(before[0].words), before[0]?.words);
  }
  check("event reports: without a model a report kept without its outcome is not asked for again", macroDue([cpi], keptCpi, false, "2026-10-17T06:00:00Z").length === 0 && macroDue([cpi], keptCpi, true, "2026-10-17T06:00:00Z").length === 1);
  const pendingKept = (triedAt: string) => ({ ...keptCpi, reports: [{ ...keptCpi.reports[0], outcome: { label: null, decided: "The count is still going on.", expected: null, surprise: null, markets: null, points: [], final: false }, triedAt }] });
  check(
    "event reports: past two days an outcome not out yet is read again every six hours, a run up to 45 minutes early counting, for seven days after the event; a final one never again",
    macroDue([cpi], pendingKept("2026-10-16T20:40:00Z"), true, "2026-10-17T00:30:00Z").length === 0 &&
      macroDue([cpi], pendingKept("2026-10-16T20:40:00Z"), true, "2026-10-17T02:00:00Z").length === 1 &&
      macroDue([cpi], pendingKept("2026-10-17T00:30:00Z"), true, "2026-10-17T06:00:00Z").length === 1 &&
      macroDue([cpi], pendingKept("2026-10-14T20:40:00Z"), true, "2026-10-23T21:00:00Z").length === 0 &&
      MACRO_RETRY_DAYS === 7 &&
      macroDue([cpi], { ...keptCpi, reports: [{ ...keptCpi.reports[0], outcome: { ...pendingKept("x").reports[0].outcome, final: true } }] }, true, "2026-10-17T06:00:00Z").length === 0,
  );

  // Closes: SPY and two holdings around the session; the history on the table's own past FOMC days.
  const days = ["2026-10-26", "2026-10-27", "2026-10-28"];
  const series = (vals: number[]) => days.map((date, i) => ({ date, value: vals[i] }));
  const closes = { SPY: series([100, 100, 101]), QQQ: series([200, 200, 203]), AAA: series([50, 50, 52]), BBB: series([20, 20, 19]), TLT: series([90, 90, 90.9]) };
  const f = macroFigures(fed, "2026-10-28", [{ symbol: "AAA", weight: 0.5 }, { symbol: "BBB", weight: 0.3 }], closes, closes.SPY, "Cut", null);
  check("event reports: the markets by their ETFs and the book at today's weights on the session, the holdings that moved it most first", near(f.markets.find((m) => m.symbol === "SPY")!.movePct, 1) && near(f.markets.find((m) => m.symbol === "TLT")!.movePct, 1) && !f.markets.some((m) => m.symbol === "UUP") && near(f.book!.movePct, 0.5 * 4 + 0.3 * -5) && f.book!.movers[0].symbol === "AAA" && near(f.book!.covered, 0.8), JSON.stringify(f));
  const thin = macroFigures(fed, "2026-10-28", [{ symbol: "AAA", weight: 0.2 }, { symbol: "ZZZ", weight: 0.7 }], closes, closes.SPY, null, null);
  check("event reports: a book most of whose closes were not read has no move, and says so", thin.book === null && /could not be read/.test(thin.bookNote ?? ""));

  const fake = (input: unknown, stop = "tool_use") => ({ content: [{ type: "tool_use", name: "record_outcome", input }], stop_reason: stop });
  const ok = parseMacroResponse(fake({ outcome: "cut", decided: "The committee cut by 25 bp.", expected: "", points: JSON.stringify([{ line: "Has a page", source: { title: "Fed", url: "https://www.federalreserve.gov/x" } }, { line: "No page", source: { title: "x", url: "http://x" } }]) }), "fomc");
  check("event reports: the outcome read item by item; the label matched to the kind's own, a point without an https page dropped, points sent as JSON text read", ok.ok && ok.outcome.label === "Cut" && ok.outcome.expected === null && ok.outcome.points.length === 1, JSON.stringify(ok));
  const words = parseMacroResponse(fake({ outcome: "Pause", decided: "Held." }), "fomc");
  check("event reports: a label the kind does not name is left out, never the reading; a kind with no labels keeps none", words.ok && words.outcome.label === null && (parseMacroResponse(fake({ outcome: "Cut", decided: "x" }), "summit") as { ok: true; outcome: { label: string | null } }).outcome.label === null);
  check("event reports: an answer in words or cut short is a sentence", !parseMacroResponse({ content: [{ type: "text", text: "hi" }] }, "fomc").ok && /ran past/.test((parseMacroResponse(fake({}, "max_tokens"), "fomc") as { reason: string }).reason));
  const body = macroRequestBody(fed, "2026-10-28", { ...f, priced: { Cut: 0.8, Hold: 0.2 } }) as { tool_choice: { type: string }; temperature?: unknown; tools: { name: string }[]; messages: { content: { text: string }[] }[] };
  check("event reports: one call with web search on the person's key, what was priced given, never the app's moves, the book or an amount; the tool asked for, not forced", body.tool_choice.type === "auto" && body.temperature === undefined && body.tools.some((t) => t.name === "record_outcome") && !/SPY|book|\+1\.00%/.test(body.messages[0].content[0].text) && /Cut 80%/.test(body.messages[0].content[0].text) && !/\$/.test(body.messages[0].content[0].text));
  // Hamza, 4 Nov 2026: how investors took it, told from the news; read between the lines.
  const sys = (body as unknown as { system: string }).system;
  check("event reports: how investors took it from the day's reporting (rotations, what was bought and sold), an index move tied to the event only where the reporting does, no index figures, read between the lines", /how investors took it/.test(sys) && /rotation/.test(sys) && /Tie a move to the event only where the reporting does/.test(sys) && /No index levels and no index percentages/.test(sys) && /Read between the lines/.test(sys) && /up to three lines/.test(sys));

  const pending = parseMacroResponse(fake({ decided: "Exit polls give the bloc 61 seats; the count goes on.", final: false }), "election");
  check("event reports: an outcome not out yet is kept as not final, with what is known so far", pending.ok && pending.outcome.final === false && ok.ok && ok.outcome.final === true && (parseMacroResponse(fake({ decided: "x", final: "false" }), "election") as { ok: true; outcome: { final: boolean } }).outcome.final === false);
  const again = macroRequestBody(fed, "2026-10-28", { ...f, priced: null }, undefined, { decided: "The count goes on.", readAt: "2026-10-28T20:40:00Z" }) as { messages: { content: { text: string }[] }[] };
  check("event reports: a reading again says what the last one found and asks what has come out since", /2026-10-28 20:40 UTC, found the outcome not out yet: The count goes on\. Look for what has come out since/.test(again.messages[0].content[0].text));
  const priced = withPriced(null, fed, { prices: { Cut: 6, Hold: 3, Hike: 1 }, by: "Polymarket" }, "2026-10-27T20:00:00Z");
  check("event reports: the market's prices kept for the event they price as shares adding to one, with whose they are; none read is nothing kept", near(priced.priced[macroKey(fed)].prices.Cut, 0.6) && priced.priced[macroKey(fed)].by === "Polymarket" && withPriced(null, fed, null, "x") === EMPTY_MACRO && withPriced(null, fed, { prices: { Cut: 0 }, by: "Kalshi" }, "x") === EMPTY_MACRO);
  check("event reports: a reading prices the Fed until 13:30 New York on its day and any other event until its day begins", stillPriced(fed, new Date("2026-10-28T17:00:00Z"), { date: "2026-10-28", minutes: 13 * 60 }) && !stillPriced(fed, new Date("2026-10-28T18:00:00Z"), { date: "2026-10-28", minutes: 14 * 60 }) && stillPriced({ kind: "cpi", date: "2026-11-10" }, new Date("2026-11-09T22:00:00Z"), { date: "2026-11-09", minutes: 17 * 60 }) && !stillPriced({ kind: "cpi", date: "2026-11-10" }, new Date("2026-11-10T00:30:00Z"), { date: "2026-11-09", minutes: 19 * 60 + 30 }) && pricedSoon(ECON_EVENTS, "2026-10-28").some((e) => e.kind === "ecb") && !pricedSoon(ECON_EVENTS, "2026-10-28").some((e) => e.kind === "earnings"));
  const report = macroReportOf(fed, "2026-10-28", f, { Cut: 0.6, Hold: 0.3, Hike: 0.1 }, ["Sample reach."], { outcome: ok.ok ? ok.outcome : null, note: null, tried: true }, null, "2026-10-28T20:40:00Z");
  const file = withMacroReport(priced, report, "2026-10-28T20:40:00Z");
  check("event reports: kept newest first, the price reading it used let go", file.reports[0].key === macroKey(fed) && !file.priced[macroKey(fed)] && file.reports[0].tries === 1);
  const notes = macroNotices(file, "2026-10-29");
  check("event reports: each report is an alert for three days after its session, linked to its report on the Calendar", notes.length === 1 && notes[0].key === `${MACRO_PREFIX}${macroKey(fed)}` && /^After Fed rate decision: Cut\. The committee cut by 25 bp\./.test(notes[0].title) && !/your book|SPY|%/.test(notes[0].title + notes[0].detail) && notes[0].figures === undefined && /\/calendar\?event=/.test(notes[0].href) && macroNotices(file, "2026-11-05").length === 0);
  check("event reports: the book's move is never the alert's tone or its words", macroNotices({ ...file, reports: [{ ...report, book: { ...report.book!, movePct: -2.4 } }] }, "2026-10-28")[0].tone === "info");
  const notFinal = macroReportOf(fed, "2026-10-28", f, null, [], { outcome: { ...(ok.ok ? ok.outcome : ({} as never)), final: false }, note: null, tried: true }, null, "2026-10-28T20:40:00Z");
  const finalLater = macroReportOf(fed, "2026-10-28", f, null, [], { outcome: ok.ok ? ok.outcome : null, note: null, tried: true }, notFinal, "2026-10-29T06:00:00Z");
  const both = macroNotices({ ...file, reports: [finalLater] }, "2026-10-29");
  check(
    "event reports: while not final the report says so and when it is read again; once a later run reads it final it is told again as its own alert, linked to the same report",
    /^Not final yet\. /.test(macroHeadline(notFinal)) && /read again every 6 hours/.test(notFinal.outcomeNote ?? "") && notFinal.outcomeAt === null && finalLater.outcomeAt === "2026-10-29T06:00:00Z" && finalLater.outcomeNote === null &&
      both.length === 2 && both[1].key === `${MACRO_PREFIX}${macroKey(fed)}#outcome` && macroOfAlert({ ...file, reports: [finalLater] }, both[1].key)?.key === macroKey(fed) &&
      /the outcome: Cut/.test(macroReportEmail(finalLater, null).subject) && /not final yet/i.test(macroReportEmail(notFinal, null).subject) && /read again every 6 hours/.test(macroReportEmail(notFinal, null).text),
    JSON.stringify(both.map((n) => n.key)),
  );
  const stillOut = macroReportOf(fed, "2026-10-28", f, null, [], { outcome: { ...(ok.ok ? ok.outcome : ({} as never)), decided: "The count goes on.", final: false }, note: null, tried: true }, notFinal, "2026-10-29T02:40:00Z");
  const told = macroNotices({ ...file, reports: [stillOut] }, "2026-10-29");
  const update = told.find((n) => n.key.includes(UPDATE_MARK));
  check(
    "event reports: each reading again while the outcome is not out is its own alert and email, saying when it was read and what is known, so a quiet run never looks skipped",
    !macroNotices({ ...file, reports: [notFinal] }, "2026-10-28").some((n) => n.key.includes(UPDATE_MARK)) &&
      update?.key === `${MACRO_PREFIX}${macroKey(fed)}${UPDATE_MARK}2026-10-29T02:40:00Z` && /still not final, as read 29 Oct, 04:40 your time/.test(update.title) && /The count goes on/.test(update.detail) &&
      macroOfAlert({ ...file, reports: [stillOut] }, update.key)?.key === macroKey(fed) && /still not final, as read/.test(macroReportEmail(stillOut, null).subject) &&
      !macroNotices({ ...file, reports: [finalLater] }, "2026-10-29").some((n) => n.key.includes(UPDATE_MARK)),
    JSON.stringify(told.map((n) => n.key)),
  );
  // Hamza, 29 Oct 2026: only an actual update is told.
  const sameAgain = macroReportOf(fed, "2026-10-28", f, null, [], { outcome: { ...(ok.ok ? ok.outcome : ({} as never)), decided: "The count goes on!", final: false }, note: null, tried: true, news: true }, stillOut, "2026-10-29T08:40:00Z");
  const saidNothing = macroReportOf(fed, "2026-10-28", f, null, [], { outcome: { ...(ok.ok ? ok.outcome : ({} as never)), decided: "Counting continues, with no winner named yet.", final: false }, note: null, tried: true, news: false }, stillOut, "2026-10-29T08:40:00Z");
  const moved = macroReportOf(fed, "2026-10-28", f, null, [], { outcome: { ...(ok.ok ? ok.outcome : ({} as never)), decided: "With 90% counted, the bloc leads by four seats.", final: false }, note: null, tried: true, news: true }, stillOut, "2026-10-29T08:40:00Z");
  const updatesOf = (r: MacroReport) => macroNotices({ ...file, reports: [r] }, "2026-10-29").filter((n) => n.key.includes(UPDATE_MARK)).map((n) => n.key.split(UPDATE_MARK)[1]);
  check(
    "event reports: a reading again that brings nothing new is kept but not told, whether its words match the last or the model says so; one that moves is told, and an earlier update stays",
    updatesOf(sameAgain).join() === "2026-10-29T02:40:00Z" && updatesOf(saidNothing).join() === "2026-10-29T02:40:00Z" && updatesOf(moved).join() === "2026-10-29T02:40:00Z,2026-10-29T08:40:00Z" &&
      !isUpdate(sameAgain) && !isUpdate(saidNothing) && isUpdate(moved) && saidNothing.readings.length === 3 && saidNothing.readings[2].news === false,
    JSON.stringify([updatesOf(sameAgain), updatesOf(saidNothing), updatesOf(moved)]),
  );
  check("event reports: the model says whether a reading again is news; a missing answer is left to the words", (parseMacroResponse(fake({ decided: "x", final: false, news: false }), "election") as { news: boolean | null }).news === false && (parseMacroResponse(fake({ decided: "x", final: false }), "election") as { news: boolean | null }).news === null && /news: only when an earlier reading is given/.test((again as unknown as { system: string }).system));
  // Hamza, 28 Oct 2026: a read in progress shows on the Calendar, with every reading so far.
  check("event reports: each reading of an outcome is kept on the report, oldest first, the final one marked", stillOut.readings.length === 2 && stillOut.readings[1].decided === "The count goes on." && stillOut.readings[1].at === "2026-10-29T02:40:00Z" && !stillOut.readings[1].final && finalLater.readings.at(-1)?.final === true && macroReportOf(fed, "2026-10-28", f, null, [], { outcome: null, note: null, tried: false }, stillOut, "2026-10-29T03:00:00Z").readings.length === 2, JSON.stringify(stillOut.readings));
  const israel = ECON_EVENTS.find((e) => e.kind === "election" && e.area === "israel" && e.date === "2026-10-27")!;
  const inTheDay = macroInProgress([israel, fed], EMPTY_MACRO, new Date("2026-10-28T09:45:00Z"));
  const afterBell = macroInProgress([israel], EMPTY_MACRO, new Date("2026-10-28T20:30:00Z"));
  const pendingFile = withMacroReport(null, { ...stillOut, key: macroKey(israel), name: israel.name, date: israel.date, session: "2026-10-28" }, "2026-10-29T02:40:00Z");
  const pend = macroInProgress([israel], pendingFile, new Date("2026-10-29T03:00:00Z"));
  check(
    "event reports: an event that has happened shows as being read until its outcome is final: waiting for its time, due once read can begin, then each reading and the next",
    inTheDay.length === 2 && inTheDay.find((x) => x.key === macroKey(israel))?.state === "due" && inTheDay.find((x) => x.key === macroKey(fed))?.state === "waiting" && /from 28 Oct, 16:00 your time/.test(inTheDay.find((x) => x.key === macroKey(fed))!.words) &&
      afterBell[0]?.state === "due" && pend[0]?.state === "pending" && pend[0].readings.length === 2 && /Not final yet\. Last read 29 Oct, 04:40 your time; next around 29 Oct, 06:40/.test(pend[0].words) &&
      macroInProgress([israel], withMacroReport(null, { ...finalLater, key: macroKey(israel) }, "x"), new Date("2026-10-29T08:00:00Z")).length === 0 && macroInProgress([israel], EMPTY_MACRO, new Date("2026-10-26T09:00:00Z")).length === 0,
    JSON.stringify([...inTheDay, ...pend].map((x) => x.words)),
  );
  const withReaction = { ...report, outcome: { ...report.outcome!, expected: "A cut of 25 bp was priced.", markets: "Money rotated from the chip suppliers into the large platforms as yields fell." } };
  const mail = macroReportEmail(withReaction, "https://app.example");
  check(
    "event reports: its own email, short, in three parts (what happened, the outcome against what was expected, how investors took it), then the pages; no move, no book, no history, no deck, never an amount",
    /After Fed rate decision: Cut/.test(mail.subject) && /^What happened:$/m.test(mail.text) && /^The outcome:$/m.test(mail.text) && /Expected: A cut of 25 bp was priced\./.test(mail.text) && /^How investors took it:$/m.test(mail.text) && /rotated from the chip suppliers/.test(mail.text) &&
      !/your book|SPY|history|forecast|[+-]\d+\.\d+%/i.test(mail.text + mail.html) && /On the Calendar/.test(mail.html) && !/deck|Attached/i.test(mail.text + mail.html) && !/\$\d/.test(mail.text) && /calendar\?event=/.test(mail.html) && mail.text.split("\n").length < 25,
    mail.text,
  );
  const run = readFileSync("lib/macro-report-run.ts", "utf8");
  const alertsRun = readFileSync("lib/alerts-run.ts", "utf8");
  check(
    "event reports: on the Agents page with a ceiling, on the person's key through callModel, kept in the vault; an alert, the close's notification and its own email; run in the evening, the morning and on opening",
    agentById("macro_reports")?.weeklyUsd === 2 && /callModel\(provider, macroRequestBody\(/.test(run) && /providerCannot\(provider, "web_search"\)/.test(run) && /mayRun\(/.test(run) && /"macro_reports"/.test(readFileSync("lib/vault-keys.ts", "utf8")) && /macroNotices\(macro/.test(alertsRun) && /macroMail\(report\)/.test(alertsRun) && /readMacroReportsInto/.test(alertsRun) && /runAsJobs\("alerts", request\)/.test(readFileSync("app/api/cron/alerts/route.ts", "utf8")) && /alertsFor\(e, now, true\)/.test(readFileSync("lib/jobs-run.ts", "utf8")) && /readMacroReportsInto/.test(readFileSync("lib/market-recap-run.ts", "utf8")) && /readMacroReportsInto/.test(readFileSync("lib/daily-sync.ts", "utf8")) && /readMacroReportsInto/.test(readFileSync("lib/catch-up.ts", "utf8")) && SCREENS.calendar.slots.includes("event_reports"),
  );
}

macroChecks().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
