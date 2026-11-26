/**
 * Holds lib/performance.ts and lib/trades.ts to hand-worked answers on small
 * fictional books: the account index takes deposits out, period returns say
 * when a series is too short, growth starts at 100, the drawdown matches a
 * worked fall, beta of a series against itself is 1, the monthly grid picks
 * month ends, lots match first in first out, and a sale with no lot warns
 * rather than throws. Then the sample book goes through everything the
 * Performance and Trades screens call, so neither can throw on it.
 * Run: npm run check:performance
 */
import { readFileSync } from "node:fs";

import { parseFlexBook } from "../lib/adapters/ibkr-flex";
import { bookSchema, keepHistory, type Book } from "../lib/holdings";
import { alphaStats, annualise, benchmarkIndex, tCritical, twoSidedP, cashShare, dayStats, drawdownSeries, flowsLeftOut, growthOf100, moneyWeighted, monthlyGrid, navIndex, periodReturns, riskStats, timingWords, windowOf, WINDOW_KEYS } from "../lib/performance";
import { figureRangeOf, movedTo, returnRange, riskRange, yearRange } from "../lib/figure-range";
import type { Figure } from "../lib/recipes";
import { chartSeries, chartWindow, returnChartData } from "../lib/return-chart";
import { liveSeriesBook } from "../lib/live";
import { tileSpans } from "../components/dashboard/sections";
import { applyFilings, filingsFileSchema, type FilingsFile } from "../lib/filings";
import { contextFor, evaluate, methodologySchema } from "../lib/methodology";
import { confirmProposal, correlation, defaultTests, EMPTY_EVALUATION, evaluateMethodology, evaluationRequestBody, evaluationView, maxFall, parseEvaluationResponse, runEvalTest, startOf, testsFor, type EvalEnv } from "../lib/methodology-evaluation";
import { benchmarksOf, weightsFor, type Weight } from "../lib/screens";
import { figuresNotGiven, insightsCurrent, insightsRequestBody, lookFacts, methodologyLens, parseInsights, perfFacts, perfInsightsFileSchema, INSIGHT_CARDS } from "../lib/perf-insights";
import { againstFund, comparisonFund } from "../lib/look-through";
import { fillsNewestFirst, fillsOf, inWindow, matchLots, profitSources, tradeCosts, monthlyActivity, realisedBySymbol, rotationOutcomes, rotationsOf, rotationSummary, tradedSymbols, tradeStats, winLoss } from "../lib/trades";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const near = (a: number | null | undefined, b: number, tol = 0.01) => a !== null && a !== undefined && Math.abs(a - b) <= tol;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Pt = { date: string; value: number };
type Tx = Book["transactions"][number];
const pts = (...rows: [string, number][]): Pt[] => rows.map(([date, value]) => ({ date, value }));
const tx = (date: string, kind: Tx["kind"], symbol: string, quantity: number, price: number | null, amount: number): Tx => ({ date, account: "Test", kind, symbol, quantity, price, amount, currency: "USD" });
const book = (over: { asOf?: string; transactions?: Tx[]; nav?: Pt[]; benchmarks?: Record<string, Pt[]>; series?: false }): Book =>
  bookSchema.parse({
    asOf: over.asOf ?? "2026-10-09",
    holdings: [],
    lookThrough: [],
    transactions: over.transactions ?? [],
    fx: { base: "USD", asOf: over.asOf ?? "2026-10-09", rates: {}, source: "test" },
    ...(over.series === false ? {} : { series: { nav: over.nav ?? [], benchmarks: over.benchmarks ?? {}, source: "test" } }),
  });

// ── The account index ───────────────────────────────────────────────────────
// 1000 → 1100 with a 50 deposit on the day → 1210. Market alone: +5%, then +10%.
const flows = book({ nav: pts(["2026-01-02", 1000], ["2026-01-05", 1100], ["2026-01-06", 1210]), transactions: [tx("2026-01-05", "deposit", "", 0, null, 50)] });
const idx = navIndex(flows);
check("index starts at 100", idx !== null && idx.index[0] === 100);
check("a deposit is taken out of the day's return", idx !== null && near(idx.index[1], 105) && near(idx.index[2], 115.5), idx ? idx.index.map((v) => v.toFixed(2)).join(", ") : "null");
// The same deposit dated between two points comes out of the next point.
const between = navIndex(book({ nav: pts(["2026-01-02", 1000], ["2026-01-05", 1100], ["2026-01-06", 1210]), transactions: [tx("2026-01-03", "deposit", "", 0, null, 50)] }));
check("a flow between two points comes out of the next point", between !== null && near(between.index[1], 105));
const withdrawal = navIndex(book({ nav: pts(["2026-01-02", 1000], ["2026-01-05", 950]), transactions: [tx("2026-01-05", "withdrawal", "", 0, null, -50)] }));
check("a withdrawal reads as no loss", withdrawal !== null && near(withdrawal.index[1], 100));
check("one point is no index", navIndex(book({ nav: pts(["2026-01-02", 1000]) })) === null);
check("no series is no index", navIndex(book({ series: false })) === null);
const eurFlow = book({ nav: pts(["2026-01-02", 1000], ["2026-01-05", 1100]), transactions: [{ ...tx("2026-01-05", "deposit", "", 0, null, 50), currency: "EUR" }] });
check("a flow nothing converts is left out, not thrown", navIndex(eurFlow) !== null && near(navIndex(eurFlow)!.index[1], 110) && same(flowsLeftOut(eurFlow), [{ currency: "EUR", count: 1 }]));
const eurFlowBase = book({ nav: pts(["2026-01-02", 1000], ["2026-01-05", 1100]), transactions: [{ ...tx("2026-01-05", "deposit", "", 0, null, 46), currency: "EUR", amountBase: 50 }] });
check("a flow with its own base amount is taken out", near(navIndex(eurFlowBase)!.index[1], 105) && flowsLeftOut(eurFlowBase).length === 0);
check("a benchmark the book lacks is null", benchmarkIndex(flows, "SPY") === null);

// ── Windows and period returns ──────────────────────────────────────────────
check("1Y window is the close before, a year back", same(windowOf("1Y", "2026-10-10", "2024-01-01"), { from: "2025-10-09", to: "2026-10-10" }));
check("YTD window starts at last year's close", windowOf("YTD", "2026-10-10", "2024-01-01").from === "2025-12-31");
check("Since start window starts at the first point", windowOf("Since start", "2026-10-10", "2024-01-01").from === "2024-01-01");
const short = book({ asOf: "2026-10-09", nav: pts(["2026-10-01", 100], ["2026-10-08", 102]), benchmarks: { SPY: pts(["2026-10-01", 50], ["2026-10-08", 51]) } });
const periods = periodReturns(short, ["SPY"], "2026-10-09");
const oneY = periods.find((p) => p.key === "1Y")!;
check("a short series gives null for 1Y with a note", oneY.account === null && oneY.benchmarks.SPY === null && /begins 1 Oct 2026/.test(oneY.note ?? ""), oneY.note ?? "no note");
const sinceStart = periods.find((p) => p.key === "Since start")!;
check("since start reads the whole series", near(sinceStart.account, 2) && near(sinceStart.benchmarks.SPY, 2) && sinceStart.note === null);
// 1M as of 9 Oct runs from the 8 Sep close; a series beginning 10 Sep is two days inside the grace week.
const grace = periodReturns(book({ asOf: "2026-10-09", nav: pts(["2026-09-10", 100], ["2026-10-08", 102]) }), [], "2026-10-09").find((p) => p.key === "1M")!;
check("a window a few days before the start still reads from the first point", near(grace.account, 2) && grace.note === null, grace.note ?? String(grace.account));
check("a window weeks before the start is null with a note", oneY.account === null && periods.find((p) => p.key === "1M")!.account === null);
check("annualise doubles over two years to 41.4%", near(annualise(100, 730.5), 41.42, 0.05));

// ── Growth, drawdown, risk ──────────────────────────────────────────────────
const path = book({ asOf: "2026-04-10", nav: pts(["2026-01-05", 100], ["2026-02-05", 110], ["2026-03-05", 99], ["2026-04-05", 105]), benchmarks: { SPY: pts(["2026-01-05", 100], ["2026-02-05", 110], ["2026-03-05", 99], ["2026-04-05", 105]), QQQ: pts(["2026-01-05", 100], ["2026-02-05", 120], ["2026-03-05", 96], ["2026-04-05", 96 * (1 + 2 * (105 / 99 - 1))]) } });
const growth = growthOf100(path, ["SPY", "MISSING"], "Since start");
check("growth starts at 100 for the account and the benchmark", growth !== null && growth.account[0] === 100 && growth.benchmarks.SPY[0] === 100);
check("growth ends where the index does", growth !== null && near(growth.account[3], 105));
check("a benchmark the book lacks is all null", growth !== null && growth.benchmarks.MISSING.every((v) => v === null));
const dd = drawdownSeries(path, "Since start");
check("drawdown: 110 to 99 is -10%", dd !== null && near(dd.maxDrawdown, -10) && dd.troughDate === "2026-03-05", dd ? dd.maxDrawdown.toFixed(2) : "null");
check("drawdown: high dated at the peak, current below it", dd !== null && dd.highDate === "2026-02-05" && near(dd.current, (105 / 110 - 1) * 100));
check("drawdown values are never positive", dd !== null && dd.values.every((v) => v <= 0));
const risk = riskStats(path, "SPY", "Since start");
check("beta of a series against itself is 1", risk !== null && near(risk.beta, 1, 1e-9) && near(risk.correlation, 1, 1e-9), risk ? `${risk.beta} ${risk.correlation}` : "null");
check("risk return matches the index", risk !== null && near(risk.twr, 5));
check("worst fall is the worst single return", risk !== null && near(risk.worstFall, -10));
check("max drawdown in the window matches", risk !== null && near(risk.maxDrawdown, -10));
check("Calmar needs a year", risk !== null && risk.calmar === null && risk.days < 365);
check("monthly spacing is 12 a year", risk !== null && risk.perYear === 12 && risk.n === 3);
const riskQ = riskStats(path, "QQQ", "Since start");
// QQQ moves exactly twice the account each period: cov = 2 var, var(QQQ) = 4 var, beta 0.5.
check("beta against a benchmark moving twice as much is 0.5", riskQ !== null && near(riskQ.beta, 0.5, 1e-6), riskQ ? String(riskQ.beta) : "null");
check("beta without a benchmark is null, the rest stands", (() => { const r = riskStats(path, null, "Since start"); return r !== null && r.beta === null && r.volatility !== null; })());
check("two points: volatility and Sharpe are null", (() => { const r = riskStats(book({ nav: pts(["2026-01-05", 100], ["2026-02-05", 110]) }), null, "Since start"); return r !== null && r.volatility === null && r.sharpe === null && near(r.twr, 10); })());

// ── The monthly grid ────────────────────────────────────────────────────────
const monthly = book({ asOf: "2026-03-10", nav: pts(["2026-01-15", 100], ["2026-01-30", 102], ["2026-02-10", 104], ["2026-02-27", 106], ["2026-03-05", 103]), benchmarks: { SPY: pts(["2026-01-15", 10], ["2026-01-31", 11], ["2026-02-28", 11], ["2026-03-05", 12.1]) } });
const grid = monthlyGrid(monthly, ["SPY"]);
const y26 = grid.years.find((y) => y.year === 2026);
check("grid has the one year", grid.years.length === 1 && !!y26);
check("January from the first point to its last: +2%", near(y26?.months[0]?.account ?? null, 2));
check("February from January's last point: +3.92%", near(y26?.months[1]?.account ?? null, (106 / 102 - 1) * 100));
check("March, partial, from February's last point: -2.83%", near(y26?.months[2]?.account ?? null, (103 / 106 - 1) * 100));
check("months without a point are empty", y26?.months.slice(3).every((m) => m === null) === true);
check("the year compounds its months: +3%", near(y26?.total.account ?? null, 3));
check("benchmark months on its own month ends", near(y26?.months[0]?.benchmarks.SPY ?? null, 10) && near(y26?.months[1]?.benchmarks.SPY ?? null, 0) && near(y26?.months[2]?.benchmarks.SPY ?? null, 10));
check("no series: an empty grid", monthlyGrid(book({ series: false }), []).years.length === 0);

// ── Cash share ──────────────────────────────────────────────────────────────
const cashy = bookSchema.parse({
  asOf: "2026-10-09",
  holdings: [
    { id: "c", account: "A", source: "ibkr", assetClass: "cash", symbol: "USD", name: "Cash", quantity: 250, price: 1, value: 250, costBasis: null, currency: "USD", asOf: "2026-10-09", valuation: "broker", country: null, sector: null, themes: [] },
    { id: "e", account: "A", source: "ibkr", assetClass: "equity", symbol: "AAA", name: "AAA", quantity: 10, price: 75, value: 750, costBasis: null, currency: "USD", asOf: "2026-10-09", valuation: "broker", country: null, sector: null, themes: [] },
  ],
  lookThrough: [],
  transactions: [],
  fx: { base: "USD", asOf: "2026-10-09", rates: {}, source: "test" },
});
check("cash share is 25%", near(cashShare(cashy), 25));
check("cash share of nothing is 0", cashShare(book({})) === 0);

// ── Lots ────────────────────────────────────────────────────────────────────
// Buy 10 @ 100, buy 10 @ 120, sell 15 @ 130: FIFO closes 10 @ 100 (+300) and 5 @ 120 (+50); 5 @ 120 stay open.
const ledger = book({
  asOf: "2026-04-30",
  transactions: [
    tx("2026-01-05", "buy", "ABC", 10, 100, -1000),
    tx("2026-02-05", "buy", "ABC", 10, 120, -1200),
    tx("2026-03-05", "sell", "ABC", 15, 130, 1950),
    tx("2026-01-10", "buy", "XYZ", 10, 50, -500),
    tx("2026-04-10", "sell", "XYZ", 10, 40, 400),
    tx("2026-02-20", "dividend", "ABC", 0, null, 12),
  ],
});
const lots = matchLots(ledger);
const abc = lots.closed.filter((l) => l.symbol === "ABC");
check("FIFO: two closed pieces for ABC", abc.length === 2 && near(abc[0].quantity, 10) && near(abc[1].quantity, 5));
check("FIFO: pnl 10×30 + 5×10 = 350", near(abc.reduce((s, l) => s + l.pnl, 0), 350), abc.map((l) => l.pnl.toFixed(2)).join(" + "));
check("FIFO: the oldest lot goes first", abc[0].opened === "2026-01-05" && abc[1].opened === "2026-02-05" && abc[0].daysHeld === 59 && abc[1].daysHeld === 28);
check("one open lot of 5 at 120", lots.open.length === 1 && near(lots.open[0].quantity, 5) && near(lots.open[0].cost, 600) && lots.open[0].symbol === "ABC");
check("a dividend is not a fill", fillsNewestFirst(ledger).length === 5 && fillsNewestFirst(ledger)[0].date === "2026-04-10");
check("no warnings on a clean ledger", lots.warnings.length === 0);

const stats = tradeStats(lots.closed);
check("two sales, one won", stats.sales === 2 && stats.won === 1 && near(stats.wonPct, 50));
check("profit factor 350 / 100", near(stats.profitFactor, 3.5));
check("average win 350, average loss 100", near(stats.avgWin, 350) && near(stats.avgLoss, 100));
check("days held winners weighted by units: (59×10 + 28×5) / 15", near(stats.avgDaysWinners, (59 * 10 + 28 * 5) / 15) && near(stats.avgDaysLosers, 90));
check("total +250", near(stats.total, 250));
const empty = tradeStats([]);
check("no sales: nulls, not zeros", empty.sales === 0 && empty.wonPct === null && empty.profitFactor === null && empty.avgWin === null && empty.avgDaysWinners === null);
const realised = realisedBySymbol(lots.closed);
check("realised by symbol, best first", realised.length === 2 && realised[0].symbol === "ABC" && near(realised[0].pnl, 350) && realised[1].symbol === "XYZ" && near(realised[1].pnl, -100));
check("realised by symbol carries its return over the cost of the lots closed", realised.every((r) => r.cost > 0 && r.pct !== null && near(r.pct, (r.pnl / r.cost) * 100)), JSON.stringify(realised));

const activity = monthlyActivity(ledger);
check("monthly activity sums money and counts fills", same(activity.map((a) => [a.ym, a.bought, a.sold, a.buys, a.sells]), [["2026-01", 1500, 0, 2, 0], ["2026-02", 1200, 0, 1, 0], ["2026-03", 0, 1950, 0, 1], ["2026-04", 0, 400, 0, 1]]), JSON.stringify(activity));
check("inWindow keeps the closed lots of March", inWindow(lots.closed, "2026-03-01", "2026-03-31", (l) => l.closed).length === 2 && inWindow(fillsNewestFirst(ledger), "2026-03-01", "2026-03-31").length === 1);

const orphan = (() => {
  try {
    return matchLots(book({ transactions: [tx("2026-02-01", "sell", "QQQ", 3, 400, 1200)] }));
  } catch (e) {
    return e as Error;
  }
})();
check("a sell without a lot warns, never throws", !(orphan instanceof Error) && orphan.warnings.length === 1 && /QQQ/.test(orphan.warnings[0]) && orphan.closed.length === 0, orphan instanceof Error ? orphan.message : orphan.warnings[0]);
// A sale of shares bought before the ledger: the broker's realised P&L prices it; without one, one sentence for all.
const priced = matchLots(book({ transactions: [tx("2026-01-05", "buy", "ABC", 5, 100, -500), { ...tx("2026-03-05", "sell", "ABC", 15, 130, 1950), realized: 600 }] }));
check("a sale the broker priced counts with the broker's P&L", priced.unmatched.length === 0 && priced.warnings.length === 0 && near(priced.closed.reduce((s, l) => s + l.pnl, 0), 600), JSON.stringify(priced.closed));
check("the units before the ledger are one piece with no days held", priced.closed.length === 2 && priced.closed[1].opened === null && priced.closed[1].daysHeld === null && near(priced.closed[1].quantity, 10) && near(priced.closed[1].pnl, 400));
check("days held reads only the lots the ledger dates", near(tradeStats(priced.closed).avgDaysWinners, 59));
const many = matchLots(book({ transactions: [tx("2026-02-01", "sell", "QQQ", 3, 400, 1200), tx("2026-02-01", "sell", "QQQ", 0.5, 400, 200), tx("2026-03-01", "sell", "KO", 2, 60, 120)] }));
check("unmatched sales are one sentence naming each holding once", many.warnings.length === 1 && /^2 sales \(QQQ, KO\)/.test(many.warnings[0]) && many.unmatched.length === 3, many.warnings[0]);
const assigned = matchLots(book({ transactions: [tx("2026-01-05", "assignment", "AAPL", 100, 200, -20000), tx("2026-02-05", "exercise", "AAPL", -100, 210, 21000)] }));
check("assignment and exercise are a buy and a sell by the sign of quantity", assigned.closed.length === 1 && near(assigned.closed[0].pnl, 1000));

// ── The Dashboard's return chart ────────────────────────────────────────────
// Four closes, a deposit on the second, SPY beside it; QQQ the book lacks is skipped.
const chartBook = book({
  asOf: "2026-10-09",
  nav: pts(["2026-10-06", 1000], ["2026-10-07", 1100], ["2026-10-08", 1210], ["2026-10-09", 1100]),
  transactions: [tx("2026-10-07", "deposit", "", 0, null, 50)],
  benchmarks: { SPY: pts(["2026-10-05", 100], ["2026-10-07", 102], ["2026-10-08", 104], ["2026-10-09", 103]) },
});
const chart = returnChartData(chartBook, ["SPY", "QQQ"]);
check("chart data follows the book's dates with the index", chart !== null && chart.dates.length === 4 && chart.index[0] === 100 && near(chart.index[1], 105), chart ? chart.index.join(", ") : "null");
check("a benchmark reads its close on or before each date; one the book lacks is left out", chart !== null && same(chart.benchmarks.SPY, [100, 102, 104, 103]) && !("QQQ" in chart.benchmarks));
check("no series is no chart", returnChartData(book({ series: false }), ["SPY"]) === null);
check("YTD window starts at last year's close", same(chartWindow("YTD", null, "2024-01-01", "2026-10-09"), { from: "2025-12-31", to: "2026-10-09" }));
check("3M window is the day before three months back", chartWindow("3M", null, "2024-01-01", "2026-10-09").from === "2026-07-08");
check("a window before the series starts at its first point", chartWindow("5Y", null, "2026-10-06", "2026-10-09").from === "2026-10-06");
check("a custom window is clipped to the series and the last date", same(chartWindow("Custom", { from: "2020-01-01", to: "2030-01-01" }, "2026-10-06", "2026-10-09"), { from: "2026-10-06", to: "2026-10-09" }));
check("a custom window that is not two dates in order falls back to a year", chartWindow("Custom", { from: "2026-10-09", to: "2026-10-01" }, "2024-01-01", "2026-10-09").from === "2025-10-08");
const ret = chartSeries(chart!, "return", "Custom", { from: "2026-10-06", to: "2026-10-09" }, null);
check("return mode starts every line at 0", ret.lines.length === 2 && ret.lines[0].values[0] === 0 && ret.lines[1].values[0] === 0 && !ret.live, JSON.stringify(ret.lines.map((l) => l.values)));
check("return mode is the index rebased, the deposit taken out", near(ret.lines[0].values[1], 5) && near(ret.lines[0].values[3], 5) && near(ret.end, 5));
check("a benchmark in return mode is its own path rebased", near(ret.lines[1].values[3], 3));
const val = chartSeries(chart!, "value", "Custom", { from: "2026-10-06", to: "2026-10-09" }, null);
check("value mode draws the book's value and the same money in the benchmark", val.lines[0].values[1] === 1100 && val.lines[1].label === "Same money in SPY" && near(val.lines[1].values[3], 1030) && val.end === 1100);
// Live: a later New York day, the book up 2%, SPY quoted today at 104 over 103; QQQ (if present) with no quote today stays null.
const noon = new Date("2026-10-12T15:00:00Z");
const live = chartSeries(chart!, "return", "1Y", null, { bookRatio: 1.02, quotes: [{ symbol: "SPY", price: 104, prevClose: 103, currency: "USD", time: Math.floor(noon.getTime() / 1000) }], now: noon });
check("live prices add one point for today", live.live && live.dates.length === 5 && live.dates[4] === "2026-10-12" && live.to === "2026-10-12", live.dates.join(", "));
check("the live point is the book's last close times its live ratio", near(live.lines[0].values[4], (105 * 1.02 / 100 - 1) * 100) && near(live.end, 7.1));
check("a benchmark's live point is its quote over its previous close", near(live.lines[1].values[4], (103 * (104 / 103) / 100 - 1) * 100));
const stale = chartSeries(chart!, "return", "1Y", null, { bookRatio: 1.02, quotes: [{ symbol: "SPY", price: 104, prevClose: 103, currency: "USD", time: Math.floor(noon.getTime() / 1000) - 5 * 86_400 }], now: noon });
check("a quote not dated today gives the benchmark no live point", stale.live && stale.lines[1].values[4] === null);
const sameDay = chartSeries(chart!, "return", "1Y", null, { bookRatio: 1.02, quotes: [], now: new Date("2026-10-09T15:00:00Z") });
check("no live point on the book's own last day", !sameDay.live && sameDay.dates.length === 4);
check("a window that ends before the last close has no live point", !chartSeries(chart!, "return", "Custom", { from: "2026-10-06", to: "2026-10-08" }, { bookRatio: 1.02, quotes: [], now: noon }).live);

// ── Wins against losses, rotations, the companies traded ────────────────────
// A: bought 10 at 100, sold at 120 (+200, +20%); B: bought 10 at 100, sold at 90 (-100, -10%); C: bought and still held.
const wlBook = book({
  asOf: "2026-03-01",
  transactions: [
    tx("2026-01-05", "buy", "A", 10, 100, -1000),
    tx("2026-01-20", "sell", "A", -10, 120, 1200),
    tx("2026-01-21", "buy", "B", 10, 100, -1000),
    tx("2026-01-22", "buy", "C", 5, 50, -250),
    tx("2026-02-10", "sell", "B", -10, 90, 900),
    tx("2026-02-12", "buy", "A", 4, 110, -440),
    tx("2026-02-25", "buy", "D", 2, 100, -200),
  ],
});
const wl = winLoss(matchLots(wlBook).closed);
check("one win of 200 and one loss of 100", wl.sales === 2 && wl.won === 1 && wl.lost === 1 && near(wl.avgWin, 200) && near(wl.avgLoss, 100), JSON.stringify([wl.avgWin, wl.avgLoss]));
check("as a percent of cost: 20% when winning, 10% when losing, both as sizes", near(wl.avgWinPct, 20) && near(wl.avgLossPct, 10));
check("a win makes twice what a loss costs; a sale earns 50 on average", near(wl.winLossRatio, 2) && near(wl.expectancy, 50) && near(wl.profitFactor, 2));
check("best and worst sales are named", wl.best?.symbol === "A" && wl.worst?.symbol === "B" && wl.bars.length === 2 && near(wl.bars[1].pct, -10));
check("no sale is no ratio", (() => { const e = winLoss([]); return e.sales === 0 && e.winLossRatio === null && e.expectancy === null && e.best === null; })());
// Rotations: A's sale (1200) funds B (1000) and C (200, of 250) within ten days, not A's own later buy; B's sale (900) funds A's buy two days later; D is 15 days after B's sale, so not funded by it.
const rot = rotationsOf(fillsOf(wlBook));
check("a sale's proceeds are shared over the buys of other symbols within ten days", same(rot.map((r) => [r.date, r.sold, r.bought, r.amount]), [["2026-01-20", "A", "B", 1000], ["2026-01-20", "A", "C", 200], ["2026-02-10", "B", "A", 440]]), JSON.stringify(rot.map((r) => [r.date, r.sold, r.bought, r.amount])));
const rotCloses = {
  A: pts(["2026-01-02", 100], ["2026-01-20", 120], ["2026-02-10", 110], ["2026-02-27", 121]),
  B: pts(["2026-01-02", 100], ["2026-01-20", 100], ["2026-02-10", 90], ["2026-02-27", 99]),
};
const judged = rotationOutcomes(rot, rotCloses, "2026-02-27");
check("each side's return runs from the sale to the latest close", near(judged[0].soldSince, (121 / 120 - 1) * 100) && near(judged[0].boughtSince, -1) && near(judged[0].spreadPts, -1 - (121 / 120 - 1) * 100), JSON.stringify(judged[0]));
check("a side the closes do not cover is not judged", judged[1].spreadPts === null && judged[1].soldSince !== null && judged[1].boughtSince === null);
check("B to A: sold at 90 then 99 (+10%), bought at 110 then 121 (+10%), spread 0", near(judged[2].spreadPts, 0, 1e-6));
const sum = rotationSummary(judged);
check("the summary counts the judged rotations and weights the spread by the money moved", sum.rotations === 3 && sum.judged === 2 && sum.better === 0 && near(sum.betterPct, 0) && near(sum.weightedSpreadPts, (judged[0].spreadPts! * 1000 + 0 * 440) / 1440) && near(sum.gain, (judged[0].spreadPts! / 100) * 1000), JSON.stringify(sum));
check("no rotation is a summary of nulls", (() => { const e = rotationSummary([]); return e.rotations === 0 && e.betterPct === null && e.gain === null; })());
const traded = tradedSymbols(fillsOf(wlBook));
check("the companies traded, latest fill first, with buys and sales counted", traded[0].symbol === "D" && same(traded.find((t) => t.symbol === "A"), { symbol: "A", buys: 2, sells: 1, bought: 1440, sold: 1200, first: "2026-01-05", last: "2026-02-12" }), JSON.stringify(traded));

// ── The sample book goes through what the screens call ──────────────────────
const dani = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
const ok = (() => {
  try {
    const i = navIndex(dani);
    const bench = ["SPY", "QQQ"];
    const p = periodReturns(dani, bench, dani.asOf);
    const g = monthlyGrid(dani, bench);
    for (const w of WINDOW_KEYS) {
      const gr = growthOf100(dani, bench, w);
      const d = drawdownSeries(dani, w);
      const r = riskStats(dani, "SPY", w);
      if (i && (!gr || !d || !r)) return `window ${w} returned null with a series present`;
      if (gr && gr.account[0] !== 100) return `growth over ${w} does not start at 100`;
      if (d && d.values.some((v) => v > 0)) return `drawdown over ${w} has a positive value`;
    }
    if (!i && (p.some((x) => x.account !== null) || g.years.length)) return "figures without a series";
    cashShare(dani);
    const l = matchLots(dani);
    tradeStats(l.closed);
    realisedBySymbol(l.closed);
    monthlyActivity(dani);
    fillsNewestFirst(dani);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
})();
// The money-weighted return (Hamza, 19 Oct 2026: an IRR card on Performance).
{
  const still = book({ asOf: "2026-01-01", nav: pts(["2025-01-01", 1000], ["2026-01-01", 1100]) });
  const a = moneyWeighted(still, "Since start");
  check("with no deposits or withdrawals the IRR is the time-weighted return a year", !!a && a.yearly && near(a.irr, a.twrYearly ?? NaN, 0.001) && near(a.irr, 10, 0.05) && a.flows === 0 && /IRR is the time-weighted return/.test(timingWords(a)), a ? `${a.irr.toFixed(3)} vs ${a.twrYearly?.toFixed(3)}` : "null");
  // Flat for half a year, then 1000 more goes in and everything gains 10%: the money was in for the rise, so the IRR beats the time-weighted 10%.
  const timed = book({ asOf: "2026-01-01", nav: pts(["2025-01-01", 1000], ["2025-07-01", 1000], ["2025-07-02", 2000], ["2026-01-01", 2200]), transactions: [tx("2025-07-02", "deposit", "", 0, null, 1000)] });
  const b = moneyWeighted(timed, "Since start");
  const t = (d: string) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(2025, 0, 1)) / 86_400_000 / 365.25;
  const residual = b ? -1000 - 1000 / Math.pow(1 + b.irr / 100, t("2025-07-02")) + 2200 / Math.pow(1 + b.irr / 100, t("2026-01-01")) : NaN;
  check("the IRR sets the start value, each deposit on its date and the end value to zero", !!b && Math.abs(residual) < 0.01 && b.deposits === 1000 && b.withdrawals === 0 && b.flows === 1 && b.startValue === 1000 && b.endValue === 2200, b ? `irr ${b.irr.toFixed(2)}, residual ${residual.toFixed(4)}` : "null");
  check("money put in before a rise lifts the IRR above the time-weighted return, and the card says timing helped", !!b && b.twrYearly !== null && b.irr > b.twrYearly + 0.5 && /timing helped/.test(timingWords(b)), b ? `${b.irr.toFixed(2)} vs ${b.twrYearly?.toFixed(2)}` : "null");
  // The same from an IBKR Flex statement: the daily equity summary and a deposit in Cash Transactions.
  const flex = parseFlexBook(`<FlexQueryResponse><FlexStatements><FlexStatement toDate="20260101"><OpenPositions></OpenPositions>
<EquitySummaryInBase><EquitySummaryByReportDateInBase reportDate="20250101" total="1000" /><EquitySummaryByReportDateInBase reportDate="20250701" total="1000" /><EquitySummaryByReportDateInBase reportDate="20250702" total="2000" /><EquitySummaryByReportDateInBase reportDate="20260101" total="2200" /></EquitySummaryInBase>
<CashTransactions><CashTransaction levelOfDetail="DETAIL" type="Deposits/Withdrawals" symbol="" amount="1000" currency="USD" fxRateToBase="1" dateTime="20250702" /></CashTransactions>
</FlexStatement></FlexStatements></FlexQueryResponse>`, "IBKR");
  const fromFlex = book({ asOf: "2026-01-01", nav: flex.nav, transactions: flex.transactions });
  const fi = navIndex(fromFlex);
  const fm = moneyWeighted(fromFlex, "Since start");
  check("a Flex statement's deposit is taken out of the time-weighted return and counted in the IRR", !!fi && near(fi.index[2], 100) && near(fi.index[3], 110) && !!fm && fm.deposits === 1000 && fm.flows === 1 && !!b && near(fm.irr, b.irr, 0.001), fi ? fi.index.map((v) => v.toFixed(2)).join(", ") : "null");
  // Transfers in and out are flows like deposits; a statement whose own totals carry flows its rows do not list says so.
  const moved = parseFlexBook(`<FlexQueryResponse><FlexStatements><FlexStatement toDate="20260101"><OpenPositions></OpenPositions>
<ChangeInNAV fromDate="20250101" toDate="20260101" depositsWithdrawals="1500" assetTransfers="900" />
<EquitySummaryInBase><EquitySummaryByReportDateInBase reportDate="20241231" total="0" /><EquitySummaryByReportDateInBase reportDate="20250101" total="1000" /><EquitySummaryByReportDateInBase reportDate="20250301" total="1900" /><EquitySummaryByReportDateInBase reportDate="20260101" total="2500" /></EquitySummaryInBase>
<CashTransactions><CashTransaction levelOfDetail="DETAIL" type="Deposits/Withdrawals" amount="1000" currency="USD" fxRateToBase="1" dateTime="20250101" /></CashTransactions>
<Transfers><Transfer type="ACATS" direction="IN" symbol="ABC" currency="USD" fxRateToBase="1" date="20250301" positionAmount="900" positionAmountInBase="900" cashTransfer="0" /><Transfer type="INTERNAL" direction="OUT" currency="EUR" fxRateToBase="1.1" date="20250601" cashTransfer="-100" /></Transfers>
</FlexStatement></FlexStatements></FlexQueryResponse>`, "IBKR");
  const flowsMoved = moved.transactions.filter((t) => t.kind === "deposit" || t.kind === "withdrawal").map((t) => `${t.date}:${t.kind}:${t.amountBase?.toFixed(0)}`);
  check("a transfer in is a deposit at its value in base and one out a withdrawal", same(flowsMoved, ["2025-01-01:deposit:1000", "2025-03-01:deposit:900", "2025-06-01:withdrawal:-110"]), flowsMoved.join(", "));
  check("the statement's own totals against its listed flows: what they do not list is a gap with its period", !!moved.unlisted && moved.unlisted.from === "2025-01-01" && near(moved.unlisted.amount, 2400 - (1000 + 900 - 110)), JSON.stringify(moved.unlisted));
  check("the value series starts on the funding day", moved.nav[0].date === "2025-01-01");
  check("a statement whose flows add up has no gap", parseFlexBook(`<FlexQueryResponse><FlexStatements><FlexStatement toDate="20260101"><OpenPositions></OpenPositions><ChangeInNAV fromDate="20250101" toDate="20260101" depositsWithdrawals="1000" /><CashTransactions><CashTransaction levelOfDetail="DETAIL" type="Deposits/Withdrawals" amount="1000" currency="USD" fxRateToBase="1" dateTime="20250702" /></CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>`, "IBKR").unlisted === null);
  // A new statement keeps the history before it: a Flex query covers a year at most.
  const kept = book({ asOf: "2025-06-30", nav: pts(["2025-01-02", 1000], ["2025-03-03", 1500], ["2025-06-30", 1600]), transactions: [tx("2025-03-03", "deposit", "", 0, null, 500)] });
  const fresh = book({ asOf: "2026-01-02", nav: pts(["2025-05-01", 1550], ["2025-06-30", 1610], ["2026-01-02", 1800]) });
  const grown = keepHistory(kept, fresh);
  check("a new statement keeps the account values and ledger before its first day, and wins where both speak", same(grown.series?.nav.map((p) => p.date), ["2025-01-02", "2025-03-03", "2025-05-01", "2025-06-30", "2026-01-02"]) && grown.series?.nav[3].value === 1610 && grown.transactions.length === 1 && grown.asOf === "2026-01-02");
  const again = keepHistory(fresh, kept);
  check("an older statement uploaded after replaces the dates it covers and lends its history; the newer stays the book", again.asOf === "2026-01-02" && same(again.series?.nav.map((p) => `${p.date}:${p.value}`), ["2025-01-02:1000", "2025-03-03:1500", "2025-06-30:1600", "2026-01-02:1800"]) && again.transactions.length === 1, JSON.stringify(again.series?.nav));
  const withTransfer = { ...kept, transactions: [...kept.transactions, tx("2025-04-01", "deposit", "", 0, null, 900)], series: { ...kept.series!, unlisted: undefined } };
  const gapped = keepHistory({ ...again, series: { ...again.series!, unlisted: [{ from: "2025-01-02", to: "2025-06-30", amount: 900 }] } }, withTransfer);
  check("a year read again with its transfers replaces the kept rows and the gap its totals showed", gapped.transactions.length === 2 && gapped.series?.unlisted === undefined, JSON.stringify(gapped.series?.unlisted));
  check("the days before an account is funded are not its history", same(keepHistory(book({ asOf: "2025-01-01", nav: pts(["2024-09-04", 0], ["2024-09-05", 5000]) }), book({ asOf: "2025-06-01", nav: pts(["2025-01-02", 5100], ["2025-06-01", 5200]) })).series?.nav.map((p) => p.date), ["2024-09-05", "2025-01-02", "2025-06-01"]));
  check("an older statement that cannot be laid before the book never replaces it", keepHistory(fresh, { ...kept, series: { ...kept.series!, source: "elsewhere" } }) === fresh && keepHistory(fresh, book({ asOf: "2025-06-30", series: false })) === fresh);
  check("a book from another source or with no series is replaced as before", keepHistory({ ...kept, series: { ...kept.series!, source: "elsewhere" } }, fresh) === fresh && keepHistory(null, fresh) === fresh && keepHistory(kept, book({ asOf: "2026-01-02", series: false })).series === undefined);
  const short = moneyWeighted(book({ asOf: "2026-03-01", nav: pts(["2026-01-02", 1000], ["2026-03-01", 1050]) }), "Since start");
  check("under a year the card reads the window's own return, not a yearly rate", !!short && !short.yearly && near(short.overPeriod, 5, 0.01) && short.twrYearly === null && near(short.twr, 5, 0.01));
  check("no series, or nothing at the start, is no IRR", moneyWeighted(book({ series: false }), "Since start") === null && moneyWeighted(book({ nav: pts(["2026-01-02", 0], ["2026-03-01", 10]), asOf: "2026-03-01" }), "Since start") === null);
}

// Each reading on its range (Hamza, 19 Oct 2026: the Markets cards' ranges on the Dashboard and Performance).
{
  const r = returnRange(20, "ytd");
  check("a return sits on a symmetric scale for its period, higher better", !!r && r.low === -40 && r.high === 40 && r.better === "high" && near(r.pct, 75) && returnRange(-80, "1m")!.pct === 0);
  const dd = riskRange(-25, "max_drawdown");
  check("a drawdown sits on 0 to -50, a volatility on 0 to 40 lower better, a beta on 0 to 2 neutral", !!dd && near(dd.pct, 50) && dd.better === "high" && riskRange(20, "volatility")!.better === "low" && near(riskRange(20, "volatility")!.pct, 50) && riskRange(1, "beta")!.better === null && riskRange(null, "beta") === null);
  const y = yearRange(150, pts(["2025-11-01", 100], ["2026-03-01", 200], ["2026-09-01", 120]), "2026-10-09");
  check("net worth sits on its own low to high over the last year", !!y && y.low === 100 && y.high === 200 && near(y.pct, 50) && y.source === "year" && yearRange(150, pts(["2024-01-01", 1]), "2026-10-09") === null);
  const fig = (expr: Figure["expr"], unit: Figure["unit"] = "pct"): Figure => ({ id: "f", label: "F", about: "", unit, view: "tile", expr } as unknown as Figure);
  const cap = figureRangeOf(fig({ op: "measure", of: { over: "holdings", measure: "max", field: "weight_pct", where: [] } } as unknown as Figure["expr"]), 12, { rule: { is: "lte", limit: 10 } });
  check("a figure a rule caps sits on 0 to half again past the limit, lower better", !!cap && cap.low === 0 && near(cap.high, 15) && near(cap.pct, 80) && cap.better === "low");
  check("a series statistic reads its scale; a figure with no rule and no scale draws no bar", figureRangeOf(fig({ op: "series", stat: "beta", of: "nav", vs: "SPY", period: "1y" } as Figure["expr"], "ratio"), 1.2)?.better === null && figureRangeOf(fig({ op: "measure", of: { over: "holdings", measure: "count", where: [] } } as unknown as Figure["expr"], "count"), 9) === null && figureRangeOf(fig({ op: "series", stat: "return", of: "nav", period: "1y" } as Figure["expr"]), null) === null);
  check("a live price moves the reading along the same range", movedTo(r!, 0).pct === 50 && movedTo(r!, 0).high === 40);
}

check("the sample book runs through every screen input", ok === null, ok ?? `series ${dani.series ? `${dani.series.nav.length} points` : "none"}, ${dani.transactions.length} transactions`);

// Bad and good days, next to a benchmark (Hamza, 19 Oct 2026): forty weekdays where the account moves twice the benchmark.
{
  const dates: string[] = [];
  for (let d = Date.parse("2026-01-05T00:00:00Z"); dates.length < 41; d += 86_400_000) {
    const day = new Date(d);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0, 10));
  }
  const moves = dates.slice(1).map((_, i) => (i % 4 === 0 ? -0.01 : i % 4 === 2 ? -0.02 : 0.015));
  const navV = [1000];
  const spyV = [500];
  for (const m of moves) {
    navV.push(navV.at(-1)! * (1 + 2 * m));
    spyV.push(spyV.at(-1)! * (1 + m));
  }
  const b = book({ asOf: dates.at(-1)!, nav: dates.map((d, i) => ({ date: d, value: navV[i] })), benchmarks: { SPY: dates.map((d, i) => ({ date: d, value: spyV[i] })) } });
  const s = dayStats(b, "SPY", windowOf("Since start", dates.at(-1)!, dates[0]))!;
  check("the bad-day line is the loss one day in twenty reaches, and its average; worst and best day; the share up", s.unit === "day" && s.n === 40 && near(s.badLine, 4) && near(s.badAverage, 4) && near(s.worst?.pct, -4) && near(s.best?.pct, 3) && near(s.upShare, 50), JSON.stringify([s.badLine, s.badAverage, s.worst, s.best, s.upShare]));
  check("an account moving twice the benchmark captures 200% of its ups and downs, and strays from it", near(s.upCapture, 200, 0.5) && near(s.downCapture, 200, 0.5) && (s.trackingError ?? 0) > 10 && s.benchmark === "SPY", JSON.stringify([s.upCapture, s.downCapture, s.trackingError]));
  check("the best and worst month and the months up come from the calendar months", !!s.bestMonth && !!s.worstMonth && s.bestMonth.pct >= s.worstMonth.pct && s.monthsUp !== null && s.bestMonth.ym.startsWith("2026-0"));
  const few = dayStats(book({ nav: pts(["2026-01-02", 1000], ["2026-01-05", 1010], ["2026-01-06", 1000]) }), null, windowOf("Since start", "2026-01-06", "2026-01-02"))!;
  check("below twenty days there is no bad-day line, never a guess; with no benchmark no capture", few.badLine === null && few.badAverage === null && few.upCapture === null && few.benchmark === null && few.worst !== null);
}

// Hamza, 19 Oct 2026: alpha with how it was found, the p-test included.
{
  check("the t distribution's p-values and critical values match the tables", near(twoSidedP(1.96, 100000), 0.05, 0.001) && near(twoSidedP(2.228, 10), 0.05, 0.001) && near(tCritical(10), 2.228, 0.005) && near(tCritical(30), 2.042, 0.005) && twoSidedP(0, 20) === 1);
  const days = 60;
  const dates: string[] = [];
  for (let d = new Date(Date.UTC(2026, 0, 5)); dates.length <= days; d = new Date(d.getTime() + 86_400_000)) if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10));
  const spy = [100];
  const nav = [1000];
  for (let i = 1; i < dates.length; i += 1) {
    const m = (i % 2 ? 1 : -1) * 0.01 * (1 + (i % 5) / 5);
    spy.push(spy[i - 1] * (1 + m));
    // Beta 1.5 and 0.1% a day on top, nothing else: alpha is exactly 0.1% a day, beta 1.5, every point on the line.
    nav.push(nav[i - 1] * (1 + 1.5 * m + 0.001));
  }
  const b = book({ asOf: dates.at(-1)!, nav: dates.map((d, i) => ({ date: d, value: nav[i] })), benchmarks: { SPY: dates.map((d, i) => ({ date: d, value: spy[i] })) } });
  const a = alphaStats(b, "SPY", "Since start");
  check("an account that is 1.5 times SPY plus 0.1% a day has alpha 25.2% a year and beta 1.5, explained wholly", !!a && near(a.alpha, 25.2, 0.01) && near(a.beta, 1.5, 1e-6) && near(a.r2, 1, 1e-6) && a.n === dates.length - 1 && a.df === a.n - 2 && a.points.length === a.n, JSON.stringify(a && [a.alpha, a.beta, a.r2, a.n]));
  check("the excess returns add up: the book's equals alpha plus beta times SPY's", !!a && near(a.bookExcess, a.alpha + a.beta * a.benchExcess, 1e-6));
  // Noise around the line: alpha is still found, with a standard error, a t and a p-value that agree.
  const noisy = nav.map((v, i) => v * (1 + (i % 3 === 0 ? 0.004 : i % 3 === 1 ? -0.003 : -0.001)));
  const an = alphaStats(book({ asOf: dates.at(-1)!, nav: dates.map((d, i) => ({ date: d, value: noisy[i] })), benchmarks: { SPY: dates.map((d, i) => ({ date: d, value: spy[i] })) } }), "SPY", "Since start");
  check("with noise, t is alpha over its standard error, p follows from t, and the 95% interval holds alpha", !!an && an.alphaSe > 0 && near(an.t, an.alpha / an.alphaSe, 1e-6) && near(an.p, twoSidedP(an.t, an.df), 1e-9) && an.low < an.alpha && an.alpha < an.high && an.r2 < 1, JSON.stringify(an && [an.alpha, an.alphaSe, an.t, an.p]));
  check("under twenty returns, or with no prices for the benchmark, there is no alpha", alphaStats(book({ asOf: dates[10], nav: dates.slice(0, 11).map((d, i) => ({ date: d, value: nav[i] })), benchmarks: { SPY: dates.slice(0, 11).map((d, i) => ({ date: d, value: spy[i] })) } }), "SPY", "Since start") === null && alphaStats(b, "QQQ", "Since start") === null);
}

// Hamza, 19 Oct 2026: every card on Performance that can be live is live.
{
  const base = book({ asOf: "2026-10-16", nav: pts(["2026-10-15", 1000], ["2026-10-16", 1010]), benchmarks: { SPY: pts(["2026-10-15", 500], ["2026-10-16", 505]), QQQ: pts(["2026-10-14", 400]) } });
  const held = { ...base, holdings: [{ ...base.holdings[0], symbol: "AAA", assetClass: "equity", price: 10, value: 1010, currency: "USD" }] as Book["holdings"] };
  const now = new Date("2026-10-19T18:00:00Z");
  const t = Date.parse("2026-10-19T17:59:00Z") / 1000;
  const quotes = [{ symbol: "AAA", price: 10.2, prevClose: 10, currency: "USD", time: t }, { symbol: "SPY", price: 510.05, prevClose: 505, currency: "USD", time: t }, { symbol: "QQQ", price: 404, prevClose: 400, currency: "USD", time: t }];
  const lived = liveSeriesBook(held, 1.02, quotes, now);
  check("the session is laid on the account's series and on a benchmark that reached the session before; one that did not is left as it was", !!lived && lived.session === "2026-10-19" && lived.asOf === "2026-10-19" && same(lived.series!.nav.at(-1), { date: "2026-10-19", value: 1030.2 }) && near(lived.series!.benchmarks.SPY.at(-1)!.value, 510.05, 1e-9) && lived.series!.benchmarks.QQQ.length === 1 && near(lived.holdings[0].value, 1030.2, 1e-9), JSON.stringify(lived?.series));
  check("nothing priced, or a series that already holds the session, keeps the book as it is", liveSeriesBook(held, 1.02, [], now) === null && liveSeriesBook({ ...held, series: { ...held.series!, nav: [...held.series!.nav, { date: "2026-10-19", value: 1020 }] } }, 1.02, quotes, now) === null);
  check("a row of tiles is always full: four to a row from 1024px, the short last row shared out, two below with an odd one across", same(tileSpans(8).map((c) => c.includes("lg:col-span-3")), Array(8).fill(true)) && tileSpans(7).slice(4).every((c) => c.includes("lg:col-span-4")) && tileSpans(7)[6].includes("col-span-2") && tileSpans(5)[4].includes("lg:col-span-12") && tileSpans(6).slice(4).every((c) => c.includes("lg:col-span-6")));
}

// Hamza, 20 Oct 2026: Trades shows what trading cost, fees and taxes.
{
  const xml = (trades: string, cash = "") => `<FlexQueryResponse><FlexStatements><FlexStatement toDate="20261001"><OpenPositions></OpenPositions><Trades>${trades}</Trades>${cash ? `<CashTransactions>${cash}</CashTransactions>` : ""}</FlexStatement></FlexStatements></FlexQueryResponse>`;
  const costed = parseFlexBook(xml(`<Trade assetCategory="STK" symbol="AAA" tradeDate="20260901" quantity="10" tradePrice="100" netCash="-1001.5" netCashInBase="-1001.5" ibCommission="-1" taxes="-0.5" buySell="BUY" currency="USD" levelOfDetail="EXECUTION" /><Trade assetCategory="STK" symbol="BBB" tradeDate="20260902" quantity="-5" tradePrice="20" netCash="198" netCashInBase="216" ibCommission="-2" taxes="0" buySell="SELL" currency="EUR" levelOfDetail="EXECUTION" />`, `<CashTransaction levelOfDetail="DETAIL" type="Dividends" symbol="AAA" amount="10" currency="USD" fxRateToBase="1" dateTime="20260910" /><CashTransaction levelOfDetail="DETAIL" type="Withholding Tax" symbol="AAA" amount="-1.5" currency="USD" fxRateToBase="1" dateTime="20260910" /><CashTransaction levelOfDetail="DETAIL" type="Other Fees" symbol="" amount="-3" currency="USD" fxRateToBase="1" dateTime="20260915" />`), "IBKR");
  const buy = costed.transactions.find((t) => t.symbol === "AAA" && t.kind === "buy");
  const held = costed.transactions.find((t) => t.kind === "dividend" && t.amount < 0);
  check("a Flex fill keeps its commission and tax as costs, and the tax withheld on a dividend as tax", buy?.commission === 1 && buy?.tax === 0.5 && held?.tax === 1.5, JSON.stringify([buy, held]));
  const ledger: Book = { ...book({ asOf: "2026-10-01", transactions: costed.transactions }), fx: { base: "USD", asOf: "2026-10-01", rates: { EUR: 1.1 }, source: "test" } };
  const c = tradeCosts(ledger, "2026-08-01", "2026-10-01");
  check("the costs are in base at each fill's own rate: the euro sale's commission at its net cash in base over its net cash", c.read && near(c.commission, 1 + 2 * (216 / 198), 1e-9) && near(c.tradeTax, 0.5, 1e-9) && near(c.dividendTax, 1.5, 1e-9) && near(c.fees, 3, 1e-9) && c.costed === 2 && c.fills === 2 && c.bySymbol[0].symbol === "BBB", JSON.stringify(c));
  check("commission and tax over the money traded, in percent", c.pctOfTraded !== null && near(c.pctOfTraded, ((c.commission + c.tradeTax) / (1001.5 + 216)) * 100, 1e-9));
  const bare = tradeCosts(book({ asOf: "2026-10-01", transactions: parseFlexBook(xml(`<Trade assetCategory="STK" symbol="AAA" tradeDate="20260901" quantity="10" tradePrice="100" netCash="-1001" buySell="BUY" currency="USD" levelOfDetail="EXECUTION" />`), "IBKR").transactions }), "2026-08-01", "2026-10-01");
  check("a statement without the commission field is unread, never a zero; without cash rows the dividend tax and fees are unread too", !bare.read && !bare.cashRead && bare.pctOfTraded === null);
  const old = tradeCosts(book({ asOf: "2026-10-01", transactions: costed.transactions.map(({ tax, ...t }) => (t.kind === "dividend" ? t : { ...t, ...(tax !== undefined ? { tax } : {}) })) }), "2026-08-01", "2026-10-01");
  const grown: Book = { ...ledger, transactions: [...ledger.transactions, tx("2026-09-20", "deposit", "", 0, null, 500), tx("2026-09-21", "interest", "", 0, null, 2)], series: { ...ledger.series!, nav: pts(["2026-08-31", 2000], ["2026-09-30", 2600]), unlisted: [{ from: "2026-09-01", to: "2026-09-30", amount: 40 }] } };
  const p = profitSources(grown, "2026-09-01", "2026-10-01", 30);
  check("the profit's sources add up to the account's change less the money put in, the unlisted transfers too", !!p && near(p.total, 2600 - 2000 - 500 - 40, 1e-9) && near(p.steps.reduce((a, s) => a + s.value, 0), p.total, 1e-9) && p.start.date === "2026-08-31", JSON.stringify(p));
  const step = (k: string) => p!.steps.find((s) => s.key === k)!.value;
  check("dividends are gross, taxes and fees are costs, realised puts the sale's own costs back, interest is other", near(step("dividends"), 10, 1e-9) && near(step("taxes"), -(1.5 + 0.5), 1e-9) && near(step("fees"), -(1 + 2 * (216 / 198) + 3), 1e-9) && near(step("realised"), 30 + 2 * (216 / 198), 1e-9) && near(step("other"), 2, 1e-9));
  check("every source is read when the fills carry their costs and the ledger its cash rows", p!.steps.every((s) => s.read));
  const noCash = profitSources({ ...grown, transactions: grown.transactions.filter((t) => t.kind === "buy" || t.kind === "sell").map((t) => ({ ...t, commission: undefined, tax: undefined })) }, "2026-09-01", "2026-10-01", 30);
  check("without cash rows or the commission field, dividends, taxes, fees and other are unread, and the steps still add up", !!noCash && noCash.steps.filter((s) => !s.read).map((s) => s.key).join() === "dividends,taxes,fees,other" && near(noCash.steps.reduce((a, s) => a + s.value, 0), noCash.total, 1e-9));
  check("no value series over the window, no breakdown", profitSources({ ...grown, series: { ...grown.series!, nav: pts(["2026-09-30", 2600]) } }, "2026-09-01", "2026-10-01", 0) === null);
  check("a withholding kept before the tax was kept on its own is unread, and left out of the total", !old.withheldRead && near(old.total, old.commission + old.tradeTax + old.fees, 1e-9));
}

{
  // Methodology evaluation (lib/methodology-evaluation.ts)
  const file = { ...EMPTY_EVALUATION };
  check("the day the person set is the start", startOf({ adopted: "2026-01-01" }, { ...file, since: "2025-06-01" }, "2025-01-02", "2026-10-09").basis === "yours");
  check("a day set before the figures begin is read from where they begin, and said so", (() => { const s = startOf({ adopted: null }, { ...file, since: "2020-01-01" }, "2025-01-02", "2026-10-09"); return s.day === "2025-01-02" && /you set/.test(s.words); })());
  check("an adopted day with ninety days of figures after it is the start", startOf({ adopted: "2026-03-01" }, null, "2025-01-02", "2026-10-09").basis === "adopted");
  check("an adopted day too recent to judge alone reads the whole record, and says so", (() => { const s = startOf({ adopted: "2026-10-01" }, null, "2025-01-02", "2026-10-09"); return s.basis === "series" && s.day === "2025-01-02" && /adopted/.test(s.words); })());
  check("the deepest fall from a running high", near(maxFall(pts(["2026-01-01", 100], ["2026-01-02", 120], ["2026-01-03", 90], ["2026-01-04", 130], ["2026-01-05", 117]), "2026-01-01", "2026-01-05"), -25, 1e-9));
  check("correlation of a line is 1, of its mirror −1, and none below three pairs", near(correlation([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-9) && near(correlation([1, 2, 3], [3, 2, 1]), -1, 1e-9) && correlation([1, 2], [1, 2]) === null);
  const classes = [{ id: "cm", label: "Compounding Machine" }, { id: "tr", label: "Transitional" }] as never;
  const d = defaultTests({ classes });
  check("the defaults: the book, its fall, each class in its order, and earnings against price over five years", d.map((t) => `${t.kind}:${t.class ?? ""}`).join() === "beats_benchmark:,smaller_drawdown:,class_beats_benchmark:cm,class_beats_benchmark:tr,earnings_track_price:" && d.at(-1)!.years === 5);
  const own = { tests: [{ kind: "earnings_track_price" as const, class: "cm", years: 5, section: "3.1", claim: "Price follows earnings." }] };
  check("the methodology's own proofs win over the person's confirmed tests and the defaults", testsFor({ classes, evaluation: own }, { ...file, tests: d }).source === "methodology");
  check("confirmed tests win over the defaults; a test naming a class the methodology lacks is left out", (() => { const t = testsFor({ classes }, { ...file, tests: [{ kind: "class_beats_benchmark", class: "gone", years: null, section: null, claim: "x" }, d[0]] }); return t.source === "confirmed" && t.tests.length === 1; })());
  check("a methodology whose evaluation names a class it lacks is refused", !methodologySchema.safeParse({ ...JSON.parse(readFileSync("data/samples/methodology.showcase.json", "utf8")), evaluation: { tests: [{ kind: "class_beats_benchmark", class: "nope", claim: "x" }] } }).success);

  const w = (symbol: string, classId: string | null, weight: number): Weight => ({ symbol, name: symbol, holdings: [{ assetClass: "equity", fundamentals: { roic_pct: 20 } } as never], value: weight * 100, weight, classId, classLabel: classId ?? "No class yet", cap: null, state: "within", sharesToCap: null }) as Weight;
  const yearly = (start: number, rate: number) => pts(["2021-06-30", start], ["2022-06-30", start * (1 + rate)], ["2023-06-30", start * (1 + rate) ** 2], ["2024-06-30", start * (1 + rate) ** 3], ["2025-06-30", start * (1 + rate) ** 4], ["2026-06-30", start * (1 + rate) ** 5]);
  const eps = (start: number, rate: number) => [0, 1, 2, 3, 4, 5].map((i) => ({ end: `${2021 + i}-06-30`, revenue: null, grossProfit: null, eps: start * (1 + rate) ** i, fcf: null }));
  const filings = { version: 1, updated: "", bySymbol: { AAA: { perShareTtm: eps(2, 0.15) }, BBB: { perShareTtm: eps(1, 0.05) }, CCC: { perShareTtm: eps(3, 0.3) } } } as unknown as FilingsFile;
  const env: EvalEnv = {
    book: book({ asOf: "2026-06-30", nav: pts(["2021-06-30", 100], ["2026-06-30", 200]), benchmarks: { SPY: yearly(100, 0.1) } }),
    m: { classes },
    start: "2021-06-30",
    asOf: "2026-06-30",
    benchmark: "SPY",
    weights: [w("AAA", "cm", 40), w("BBB", "tr", 30), w("CCC", "cm", 30)],
    closes: { AAA: yearly(50, 0.15), BBB: yearly(20, 0.2), CCC: yearly(30, 0.3), SPY: yearly(100, 0.1) },
    filings,
  };
  const et = runEvalTest({ kind: "earnings_track_price", class: null, years: 5, section: "3.1", claim: "x" }, env);
  const aaa = et.rows.find((r) => r.symbol === "AAA")!;
  check("price against earnings: each holding's price and EPS growth a year over the same five years", near(aaa.a, 15, 0.05) && near(aaa.b, 15, 0.05) && et.rows.length === 3, JSON.stringify(et.rows));
  check("two of three tracking within five points with a strong correlation supports it", et.verdict === "supports" && /2 of 3/.test(et.headline), et.headline);
  const ec = runEvalTest({ kind: "earnings_track_price", class: "cm", years: 5, section: null, claim: "x" }, env);
  check("a class reads its own holdings alone", ec.rows.map((r) => r.symbol).sort().join() === "AAA,CCC");
  const cb = runEvalTest({ kind: "class_beats_benchmark", class: "cm", years: null, section: null, claim: "x" }, env);
  check("a class against the benchmark from the start: both ahead of SPY's 61%, by weight", cb.verdict === "supports" && cb.rows.length === 2 && /2 of 2/.test(cb.headline), cb.headline);
  const bb = runEvalTest({ kind: "beats_benchmark", class: null, years: null, section: null, claim: "x" }, env);
  check("the book doubling over five years against SPY's 10% a year is ahead by about 4.9 points a year", bb.verdict === "supports" && /4\.9 points a year/.test(bb.headline), bb.headline);
  check("a class with no holding today says so", runEvalTest({ kind: "class_beats_benchmark", class: "none", years: null, section: null, claim: "x" }, env).verdict === "no_data");

  const view = { name: "M", summary: "s", adopted: "2026-10-13", classes: [{ id: "cm", label: "CM", test: "ROIC at least 15" }], rules: [{ section: "3.1", text: "r" }], seriesStart: "2025-10-10", firstTrade: "2025-10-02", asOf: "2026-10-10", benchmarks: [] };
  const answer = (input: unknown) => ({ content: [{ type: "tool_use", name: "propose_evaluation", input }] });
  const parsed = parseEvaluationResponse(answer({ since: "2025-10-10", since_why: "first figures", tests: [{ kind: "class_beats_benchmark", class: "cm", section: "3.1", claim: "CM leads" }, { kind: "class_ahead_of_rest", class: "ghost", claim: "x" }, { kind: "earnings_track_price", class: null, section: "9.9", claim: "EPS" }], advice: "Judge it by its classes." }), view);
  check("the proposal keeps what the methodology can read: a class it lacks is dropped, a section it lacks is null, five years by default", parsed.ok && parsed.proposal.tests.length === 2 && parsed.proposal.tests[1].section === null && parsed.proposal.tests[1].years === 5 && parsed.proposal.since === "2025-10-10", JSON.stringify(parsed));
  const late = parseEvaluationResponse(answer({ since: "2027-01-01", since_why: "x", tests: [{ kind: "beats_benchmark", claim: "b" }], advice: "a" }), view);
  check("a day after the latest figures is dropped, never guessed", late.ok && late.proposal.since === null && late.proposal.sinceWhy === null);
  check("words instead of the call are a sentence", !parseEvaluationResponse({ content: [{ type: "text", text: "hi" }] }, view).ok);
  const body = evaluationRequestBody(view) as { tool_choice: { type: string }; temperature?: number; messages: { content: { text: string }[] }[] };
  check("the request asks for the call without forcing it, with no temperature", body.tool_choice.type === "auto" && body.temperature === undefined);
  const c = confirmProposal({ ...file, proposal: { since: "2025-10-10", sinceWhy: "w", tests: d, advice: "a", against: "M", at: "2026-10-10T00:00:00Z" } }, "now");
  check("confirming makes the proposal's tests, day and advice the person's, and clears it", c.proposal === null && c.since === "2025-10-10" && c.tests?.length === d.length && c.advice === "a");

  const sbook = applyFilings(bookSchema.parse(JSON.parse(readFileSync("data/samples/showcase.book.json", "utf8"))), filingsFileSchema.parse(JSON.parse(readFileSync("data/samples/showcase.filings.json", "utf8"))));
  const sm = methodologySchema.parse(JSON.parse(readFileSync("data/samples/methodology.showcase.json", "utf8")));
  const sv = evaluationView(sm, sbook, benchmarksOf(sm));
  check("the model is shown the methodology's words and the record's dates, never an amount", !JSON.stringify(sv).match(/"(value|amount|nav|weight)"/) && sv.firstTrade !== null);
  const { weights } = weightsFor(sbook, sm, contextFor(sbook, sbook.asOf, sm));
  const se = evaluateMethodology({ m: sm, book: sbook, file: null, weights, findings: evaluate(sm, sbook, sbook.asOf, ["ibkr"]), decisions: null, logsDecisions: false, benchmarks: benchmarksOf(sm), closes: sbook.series?.holdings ?? {}, filings: null });
  check("the showcase evaluates: a year from where its figures begin, its classes placing most of the book", se.start.basis === "series" && se.results.length === 6 && se.adherence.placedPct !== null && se.adherence.placedPct > 80, se.headline);
}

// The page read through the methodology (lib/perf-insights.ts)
{
  const sbook = bookSchema.parse(JSON.parse(readFileSync("data/samples/showcase.book.json", "utf8")));
  const sm = methodologySchema.parse(JSON.parse(readFileSync("data/samples/methodology.showcase.json", "utf8")));
  const w = { window: "1Y" as const, irr: "Since start" as const, alpha: "1Y" as const };
  const facts = perfFacts(sbook, benchmarksOf(sm), w);
  check("each card the page draws is given to the model with its figures, in the page's windows", facts.map((f) => f.card).join() === "returns,irr,alpha,risk,drawdown,days" && facts.find((f) => f.card === "alpha")!.lines[0].includes("p-value"), facts.map((f) => f.card).join());
  const lens = methodologySchema.parse(sm) && methodologyLens(sm, benchmarksOf(sm));
  const body = insightsRequestBody(facts, lens) as { tool_choice: { type: string }; temperature?: number; messages: { content: { text: string }[] }[] };
  const text = body.messages[0].content[0].text.split("The cards:")[1] ?? "";
  check("the model gets the methodology's words and the page's percentages, never an amount or a holding", !/\$|USD|net worth/i.test(text) && !sbook.holdings.some((h) => h.assetClass === "equity" && new RegExp(`\\b${h.symbol}\\b`).test(text)) && body.messages[0].content[0].text.includes("D.6"));
  check("the readings are asked for without forcing the call, with no temperature", body.tool_choice.type === "auto" && body.temperature === undefined);
  check("a reading's figure is checked against its card, within rounding", figuresNotGiven("Alpha of -12.9% with a p-value of 0.31 over 262 returns", facts.find((f) => f.card === "alpha")!.lines).length === 0 && figuresNotGiven("Alpha of -12.5% a year", facts.find((f) => f.card === "alpha")!.lines).join() === "-12.5");
  const call = (input: unknown) => ({ content: [{ type: "tool_use", name: "record_insights", input }] });
  const got = parseInsights(
    call({
      overall: "Short record for a long horizon.",
      items: [
        { card: "alpha", reading: "Cannot be told from chance at p 0.31; noise for now.", tone: "noise", sections: ["D.6", "9.9"] },
        { card: "risk", reading: "Volatility of 31.0% a year is high.", tone: "watch", sections: [] },
        { card: "alpha", reading: "Again.", tone: "noise", sections: [] },
      ],
    }),
    facts,
    lens,
  );
  check("a reading quoting a figure its card does not show is dropped and said so, a section the methodology lacks is dropped, a card read twice keeps the first", got.ok && got.items.length === 1 && got.items[0].card === "alpha" && got.items[0].sections.join() === "D.6" && got.dropped.length === 2 && /31\.0/.test(got.dropped.join(" ")), JSON.stringify(got));
  check("an answer in words is a sentence, never empty readings", !parseInsights({ content: [{ type: "text", text: "hi" }] }, facts, lens).ok);
  const sample = perfInsightsFileSchema.parse(JSON.parse(readFileSync("data/samples/perf_insights.json", "utf8")));
  const sections = new Set(sm.rules.map((r) => r.section));
  check("the demo's sample readings are the showcase's cards, its methodology's sections, and quote no figure", sample.against === sm.name && sample.items.every((i) => INSIGHT_CARDS.includes(i.card) && i.sections.every((x) => sections.has(x)) && !figuresNotGiven(i.reading, []).length) && !figuresNotGiven(sample.overall, []).length);
  // The look-through's two cards: the groups on the classes' figures and each holding by class and weight in percent, never an amount.
  const lookFixture = {
    fields: ["roic_pct", "gross_margin_pct"],
    book: { key: "book", label: "Your book", kind: "book", weight: 92.4, readings: { roic_pct: { value: 24.2, coverage: 100, read: 3, of: 3 }, gross_margin_pct: { value: 55.1, coverage: 80, read: 2, of: 3 } }, note: null },
    classes: [],
    funds: [{ key: "SPY", label: "SPY", kind: "fund", weight: 61.3, readings: { roic_pct: { value: 17.5, coverage: 100, read: 60, of: 60 }, gross_margin_pct: { value: null, coverage: 0, read: 0, of: 60 } }, note: "" }],
    holdings: [{ symbol: "AAA", classLabel: "Compounder", weight: 12.5, values: { roic_pct: 31, gross_margin_pct: null } }],
  } as unknown as Parameters<typeof lookFacts>[0];
  const lf = lookFacts(lookFixture);
  check("the Look-through and By holding cards are given to the model: the groups on the classes' figures, each holding with its class and weight, never money", lf.map((f) => f.card).join() === "look_through,by_holding" && lf[0].lines[0] === "Your book, 92.4% of net worth: Return on invested capital 24.2%, Gross margin 55.1% (80.0% of it read)." && lf[0].lines[1].startsWith("SPY, 61.3% of the fund read: Return on invested capital 17.5%.") && lf[1].lines[0] === "AAA (Compounder, 12.5% of net worth): Return on invested capital 31.0%." && !/\$|USD/.test(JSON.stringify(lf)) && lookFacts(null).length === 0, JSON.stringify(lf));
  // One malformed reading costs that reading, never the page's (24 Oct 2026: Read again failed whole on a strict read).
  const loose = parseInsights(
    call({ overall: "Short record.", items: JSON.stringify([{ card: "alpha", reading: "Noise for now.", tone: "noise", sections: ["D.6", "D.6", "D.6", "D.6"] }, { card: "risk", tone: "watch" }, "not a reading"]) }),
    facts,
    lens,
  );
  check("items sent as JSON text are read, a fourth section is cut, a malformed reading is left out and counted, the rest kept", loose.ok && loose.items.length === 1 && loose.items[0].sections.length === 3 && /2 readings were not in a shape/.test(loose.dropped.join(" ")), JSON.stringify(loose));
  const cutOff = parseInsights({ content: [{ type: "tool_use", name: "record_insights", input: {} }], stop_reason: "max_tokens" }, facts, lens);
  check("an answer cut at the model's limit says so, and names what failed for the log without the text", !cutOff.ok && /ran out of room/.test(cutOff.reason) && /stop max_tokens/.test(cutOff.log), JSON.stringify(cutOff));
  // The book against SPY, judged by the classes' own tests, with the holdings pulling it the wrong way.
  const vsFixture = {
    fields: ["roic_pct"],
    book: { key: "book", label: "Your book", kind: "book", weight: 18.5, readings: { roic_pct: { value: 24.19, coverage: 100, read: 2, of: 2 } }, note: null },
    classes: [{ key: "cm", label: "Compounder", kind: "class", weight: 18.5, readings: { roic_pct: { value: 24.19, coverage: 100, read: 2, of: 2 } }, note: null }],
    funds: [{ key: "SPY", label: "SPY", kind: "fund", weight: 61.3, readings: { roic_pct: { value: 27, coverage: 100, read: 60, of: 60 } }, note: "" }],
    holdings: [
      { symbol: "AAA", classLabel: "Compounder", weight: 12.5, values: { roic_pct: 31 } },
      { symbol: "BBB", classLabel: "Compounder", weight: 6, values: { roic_pct: 10 } },
    ],
  } as unknown as Parameters<typeof lookFacts>[0];
  const vsClasses = [{ id: "cm", label: "Compounder", criteria: [{ field: "roic_pct", is: "gte", value: 15 }] }] as unknown as Parameters<typeof againstFund>[1];
  const vs = againstFund(vsFixture, vsClasses, "SPY");
  const r0 = vs?.rows[0];
  check(
    "against SPY: the gap, the classes wanting it higher, the book behind, and the holding pulling it down, the pulls adding up to the gap",
    !!r0 && Math.abs((r0.gap as number) + 2.81) < 0.01 && r0.want === "higher" && r0.stands === "behind" && r0.tests[0].words === "15.0% or more" && r0.tests[0].holds === true && r0.pulls.length === 1 && r0.pulls[0].symbol === "BBB" && Math.abs(r0.pulls[0].pull - (6 / 18.5) * (10 - 27) - 0) < 1e-9 && Math.abs((12.5 / 18.5) * 4 + r0.pulls[0].pull - (r0.gap as number)) < 0.01,
    JSON.stringify(vs),
  );
  const vsLines = lookFacts(vsFixture, vsClasses)[0].lines.join(" ");
  check("the model is given the comparison as the app judged it, the holdings by symbol, class and weight in percent", /Against SPY, Return on invested capital: your book 24\.2%, SPY 27\.0%, 2\.8 pts below SPY; your classes want it higher \(Compounder 15\.0% or more, its holdings average 24\.2%\), so the book is behind SPY/.test(vsLines) && /Pulling it down against SPY most: BBB \(Compounder, 6\.0% of net worth\) at 10\.0%, −5\.5 pts\./.test(vsLines) && !/\$|USD/.test(vsLines), vsLines);
  const both = { ...(vsFixture as object), funds: [...(vsFixture as { funds: object[] }).funds, { key: "QQQ", label: "QQQ", kind: "fund", weight: 70, readings: { roic_pct: { value: 30, coverage: 100, read: 40, of: 40 } }, note: "" }] } as unknown as Parameters<typeof lookFacts>[0];
  check("the fund is the methodology's own benchmark when the look-through reads it, else SPY", comparisonFund(both, ["QQQ"]) === "QQQ" && comparisonFund(both, ["IWM"]) === "SPY" && comparisonFund(both, []) === "SPY" && /Against QQQ, Return on invested capital/.test(lookFacts(both, vsClasses, ["QQQ"])[0].lines.join(" ")));
  check("the comparison asks the model to flag a figure the classes prize where SPY has more", (insightsRequestBody(facts, lens) as { system: string }).system.includes("the market as a whole has more of it"));
  check("a reading is drawn under its card only when made on the figures and windows shown", insightsCurrent(sample, sbook.asOf, w, sm.name) && !insightsCurrent(sample, sbook.asOf, { ...w, window: "3M" }, sm.name) && !insightsCurrent(sample, "2026-10-11", w, sm.name) && !insightsCurrent(null, sbook.asOf, w, sm.name));
}

console.log(failed ? `\n${failed} check(s) failed, ${passed} passed.` : `\nAll ${passed} checks passed.`);
process.exit(failed ? 1 : 0);
