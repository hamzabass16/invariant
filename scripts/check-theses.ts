/**
 * check:theses — the Theses screen and the Valuation calculator: the DCF
 * reproduces HCMP's ASML Q3 2026 model (15 Oct 2026) from the same inputs,
 * by cash flow and by earnings, with its sensitivity and reverse DCF; the
 * stage is decided from the filings by the ontology's tests (Valuation by
 * stage, after Brian Feroldi) with the rule named, and the matrix of metrics
 * by stage is the chart's; every metric is valued on the person's estimates;
 * the inputs the filings seed hold their schema; the pillars are scored on today's readings;
 * a holding's folder says what it still owes; the screen lists the listed
 * equities and a thesis no longer held; the ontology carries the screen, its
 * slots and the kit's two deck skeletons; the pure modules stay pure.
 */
import { deliveredGrowth, mapAxes, mapWords, peg, placeLabels, projectedGrowth, valueMap } from "../lib/value-map";
import { CALIBRATION_DAYS, calibrationOf, decidingLetter, JUDGE_AFTER_DAYS, planSide, plannedTrades, POSTMORTEM_DAYS, postMortems, reasonedTrades } from "../lib/judgement";
import { withDecidingLetter } from "../lib/report";
import type { Book } from "../lib/holdings";
import { readFileSync } from "node:fs";
import { bullBear } from "../lib/bull-bear";
import { returnSince, scorecardSymbols, scorecardWords, thesisScorecard } from "../lib/thesis-scorecard";
import { INVESTIGATIVE } from "../lib/investigate";

import { valuationLowNotices, VALUATION_LOW_PREFIX } from "../lib/alerts";
import { addDays } from "../lib/performance";
import { HISTORY_METRICS, historyMetricFor, historyWords, MIN_HISTORY_WEEKS, NOT_MEANINGFUL_ABOVE, valuationHistory, type HistoryMetric, type ValuationHistory } from "../lib/valuation-history";
import { consensusOf, consensusPe, estimateBars, FILED_YEARS_SHOWN, FORWARD_GROWTH_MAX, forwardPeOf, forwardRows, grownForward, multiplesAt, ntmConsensus, parseNasdaqForecast } from "../lib/forward";
import { chartHeadline } from "../lib/company";
import { MIN_PEERS, peerComparison, peersOf } from "../lib/peers";
import { screenCompanySchema } from "../lib/screener";
import { quantile, referenceMetric, watchReference } from "../lib/watch-reference";

import { DCF_BASES, dcfDefaults, dcfInputsSchema, dcfSummary, dcfSummarySchema, fade, runDcf, valuationFromDcf, type DcfInputs } from "../lib/dcf";
import { EARNINGS_DOC, FIELDS, FUNDAMENTAL_FIELDS, METRIC_USE, SCREENS, SLOTS, STAGE, STAGE_TESTS, STAGES, VALUATION_METRICS, metricUse } from "../lib/ontology";
import { methodologySchema } from "../lib/methodology";
import type { CompanyVerdict } from "../lib/research";
import { applyProposal, checkProposal, decisionsFrom, EMPTY_PROPOSALS, methodologyView, parseReviewResponse, proposalFor, proposalKey, proposalSchema, reviewRequestBody, standingOf, testableFields, uncheckedFiguresIn, viewOf, withoutProposal, withProposal, wordDiff, type Proposal, type ProposalRead } from "../lib/thesis-review";
import { EMPTY_HUNTER, FINDS_PER_HUNT, huntFor, huntKey, hunterRequestBody, huntSubjects, materialFor, parseHunterResponse, shownFinds, subjectsDue, withDismissed, withHunt, type HuntInput } from "../lib/thesis-hunter";
import { alertsView, EMPTY_ALERTS, HUNTER_PREFIX, newsWorthy, reconcile, unreadAlerts } from "../lib/alerts";
import { bandOf, fairRow, fairSentence, fairValueBook } from "../lib/fair-value";
import { newslettersFileSchema } from "../lib/newsletters";
import { ownValuationFrom, runValuation, stageMetricsWords, stageOf, valuationDefaults, valuationInputsSchema, valuationSummary, valuationSummarySchema } from "../lib/valuation";
import { basketFrom, measuredFrom, sinceFor, EMPTY_RECORD, EMPTY_THESES, EMPTY_THESIS, fillThesesPrompt, holdingFolder, latestReportFor, marketReadings, marketThesisFor, marketThesisId, MAX_EVIDENCE, MAX_MARKET_THESES, ownValuationOf, pillarFieldName, pillarFieldOk, pillarReadings, recordFromWrite, thesesFileSchema, thesesSubjects, thesisDetail, thesisFor, ThesisWriteProblem, valuationFromWrite, valuationSeedOf, withEvidence, withThesis, withValuationInputs, writesRecord, writeThesis, type Thesis, type ThesesFile, type ThesisWrite } from "../lib/theses";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? `\n     ${detail}` : ""}`);
}
const read = (p: string) => readFileSync(p, "utf8");
const near = (a: number, b: number, pct: number) => Math.abs(a / b - 1) * 100 <= pct;

// HCMP's ASML model of 15 Oct 2026 (quarter_refresh_kit/examples/ASML_Q3_2026/ASML_DCF_model_2026-10-15.py), its inputs as written:
// FY2026 revenue EUR 44,500m (guide midpoint), FCF margin 32% moving to the case's end margin by FY2029, SBC 0.6% of revenue,
// WACC 9%, terminal growth 3%, cash 12,735.1m, investments 3,368.6m, debt 2,697.2m, 381.3m shares, USD 1.1195 per EUR, price USD 1,638.51.
// It printed USD 1,032 base, 644 bear, 1,662 bull. Its flows are discounted from 1 Jul of each year seen from 15 Oct (0.71 years);
// the app discounts from mid-year (0.5), so it values about 2% higher.
const asml: DcfInputs = dcfInputsSchema.parse({
  basis: "cash_flow",
  currency: "EUR",
  revenue: 44500,
  revenueLabel: "Revenue, FY2026 guide midpoint",
  marginNowPct: 32,
  sbcPct: 0.6,
  waccPct: 9,
  terminalGrowthPct: 3,
  cash: 8030.9 + 4704.2,
  investments: 1129.2 + 2239.4,
  debt: 4390.9 - 1693.7,
  balanceLabel: "27 Sep 2026",
  shares: 384.1 - 2.8,
  price: 1638.51,
  priceCurrency: "USD",
  fx: 1.1195,
  cases: {
    base: { growthPct: [12, 10, 9, 8, 7, 6, 5, 4, 4], marginEndPct: 32 },
    bear: { growthPct: [-10, 5, 8, 6, 5, 4, 4, 4, 3], marginEndPct: 27 },
    bull: { growthPct: [25, 18, 14, 12, 10, 8, 7, 6, 5], marginEndPct: 38 },
  },
  asOf: "2026-10-15",
  note: null,
});
const r = runDcf(asml);
check("the DCF reproduces HCMP's ASML model: base about USD 1,032, bear 644, bull 1,662 per ADR (within 3%, the mid-year convention apart)", near(r.cases.base.perShare, 1032, 3) && near(r.cases.bear.perShare, 644, 3) && near(r.cases.bull.perShare, 1662, 3), `${r.cases.base.perShare.toFixed(0)} ${r.cases.bear.perShare.toFixed(0)} ${r.cases.bull.perShare.toFixed(0)}`);
check("the base case's revenue path is the model's (FY2035 EUR 83,132m) and the terminal value about 63% of the enterprise value", near(r.cases.base.rows[8].revenue, 83132, 0.1) && r.cases.base.rows[8].year === 2035 && near(r.cases.base.terminalSharePct, 63, 4), `${r.cases.base.rows[8].revenue.toFixed(0)} ${r.cases.base.terminalSharePct.toFixed(1)}%`);
check("the margin moves in a straight line to the end margin by the third year, and SBC comes off the flow on the cash flow basis only", near(r.cases.bull.rows[0].marginPct, 34, 0.1) && near(r.cases.bull.rows[2].marginPct, 38, 0.1) && near(r.cases.base.rows[0].flow, 49840 * 0.314, 0.2) && near(runDcf({ ...asml, basis: "earnings" }).cases.base.rows[0].flow, 49840 * 0.32, 0.2));
check("the price is read against each case in the listing's currency, through the FX", r.cases.base.vsPricePct !== null && r.cases.base.vsPricePct < -30 && r.cases.bull.vsPricePct !== null && r.cases.bull.vsPricePct > 0 && near(r.cases.base.perShare / r.cases.base.perShareModel, 1.1195, 0.01));
check("the sensitivity grid runs WACC 8 to 11 against terminal growth 2.5 to 3.5 and falls with the rate", r.sensitivity.values.length === 4 && r.sensitivity.values[0].length === 3 && r.sensitivity.values[0][1] > r.sensitivity.values[1][1] && r.sensitivity.values[1][1] > r.sensitivity.values[2][1] && near(r.sensitivity.values[1][1], r.cases.base.perShare, 0.01) && r.sensitivity.values[1][2] > r.sensitivity.values[1][1]);
check("the reverse DCF finds the growth the price needs on the base path, above the base case, and the margin at base growth", r.implied !== null && r.implied.growthScale > 1 && r.implied.cagrPct > 7 && r.implied.cagrPct < 25 && r.implied.marginPct !== null && r.implied.marginPct > 32, JSON.stringify(r.implied));
check("the assumptions are four lines the deck prints, naming the revenue, the margins, the rate and the balance sheet", r.assumptions.length === 4 && /44,500m/.test(r.assumptions[0]) && /SBC 0.6%/.test(r.assumptions[1]) && /WACC 9%/.test(r.assumptions[2]) && /381.3m diluted shares/.test(r.assumptions[3]), r.assumptions.join(" | "));
const summary = dcfSummary(r);
check("the summary a report keeps holds its schema and carries the cases, the grid, the implied figures and the assumptions", dcfSummarySchema.safeParse(summary).success && summary.perShare.base === r.cases.base.perShare && summary.sensitivity.values.length === 4 && summary.implied !== null);
const ov = valuationFromDcf(r);
check("the record's own valuation is the bear, base and bull, with the basis in a few words", ov.low < ov.base && ov.base < ov.high && /^DCF on free cash flow, 2026-10-15$/.test(ov.basis) && ov.asOf === "2026-10-15");
check("terminal growth at or above the rate is refused, and so are cases of different lengths", !dcfInputsSchema.safeParse({ ...asml, terminalGrowthPct: 9 }).success && !dcfInputsSchema.safeParse({ ...asml, cases: { ...asml.cases, bear: { ...asml.cases.bear, growthPct: [1, 2, 3, 4, 5] } } }).success);

// The inputs the filings seed: trailing revenue and flow, growth fading to 4%, the balance sheet, the shares; null without a flow or a share count.
const seed = { revenue: 30_500e6, fcf: 14_000e6, netIncome: 13_000e6, sbc: 550e6, dilutedShares: 883e6, revenueGrowthPct: 12.3, cash: 9_000e6, investments: 0, debt: 24_600e6, balanceLabel: "at 2026Q2", periodLabel: "TTM Jun 2026", currency: "USD" };
const dflt = dcfDefaults("cash_flow", seed, 585, "USD", "2026-10-16");
check("the defaults from the filings hold the schema: millions, today's margin, growth fading from the trailing rate to 4%, WACC 9 and terminal growth 3, SBC off the cash flow", dflt !== null && dflt.revenue === 30_500 && near(dflt.marginNowPct, 45.9, 0.1) && dflt.cases.base.growthPct[0] === 12.3 && dflt.cases.base.growthPct.at(-1) === 4 && dflt.waccPct === 9 && dflt.terminalGrowthPct === 3 && dflt.sbcPct === 1.8 && dflt.shares === 883 && dflt.price === 585, JSON.stringify(dflt));
const earn = dcfDefaults("earnings", seed, 585, "USD", "2026-10-16");
check("by earnings the flow is net income and SBC is not taken off again", earn !== null && near(earn.marginNowPct, 42.6, 0.1) && earn.sbcPct === 0);
check("no flow or no share count seeds nothing, and the calculator starts empty", dcfDefaults("cash_flow", { ...seed, fcf: null }, 585, "USD", "2026-10-16") === null && dcfDefaults("earnings", { ...seed, dilutedShares: null }, 585, "USD", "2026-10-16") === null);
check("a price in another currency is not laid on the model's figures", dcfDefaults("cash_flow", { ...seed, currency: "EUR" }, 585, "USD", "2026-10-16")!.price === null);
const euroDcf = dcfDefaults("cash_flow", { ...seed, currency: "EUR" }, 585, "USD", "2026-10-16", 1.17)!;
check("with the day's rate the price is laid on the model and the rate kept as fx (listing units per model unit); a missing rate still leaves it", euroDcf.price === 585 && euroDcf.fx === 1.17 && euroDcf.priceCurrency === "USD" && euroDcf.currency === "EUR" && dcfDefaults("cash_flow", { ...seed, currency: "EUR" }, 585, "USD", "2026-10-16", null)!.fx === 1, JSON.stringify({ price: euroDcf.price, fx: euroDcf.fx }));
check("fade runs a straight line between two rates", fade(12, 4, 9).join(",") === "12,11,10,9,8,7,6,5,4");

// Valuation by stage: the ontology's tables and tests, after Brian Feroldi's chart.
check("the ontology carries the six stages in order with their source of value, and nine metrics with a usefulness at each stage", STAGES.length === 6 && STAGES.map((s) => STAGE[s].n).join(",") === "1,2,3,4,5,6" && STAGE.capital_return.source === "Buybacks, dividends, M&A" && VALUATION_METRICS.length === 9 && VALUATION_METRICS.every((m) => METRIC_USE[m].length === 6));
check("the matrix is the chart's: P/S useful at startup, hyper growth and break even; trailing P/E useful only at capital return; the DCF useful at operating leverage and capital return; nothing useful in decline", metricUse("ps", "startup") === "useful" && metricUse("ps", "break_even") === "useful" && metricUse("ps", "decline") === "not" && metricUse("trailing_pe", "capital_return") === "useful" && metricUse("trailing_pe", "operating_leverage") === "somewhat" && metricUse("trailing_pe", "break_even") === "not" && metricUse("dcf", "operating_leverage") === "useful" && metricUse("dcf", "hyper_growth") === "not" && metricUse("tam", "startup") === "useful" && metricUse("tam", "capital_return") === "not" && VALUATION_METRICS.every((m) => metricUse(m, "decline") === "not"));
check("every stage test reads fundamental fields of the ontology, and the capital returned is a field derived from the filings", STAGE_TESTS.every((t) => t.when.every((w) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(w.field))) && FIELDS.capital_returned_pct !== undefined && /capital_returned_pct = /.test(read("lib/edgar-facts.ts")));
const stageOn = (r: Record<string, number | null>) => stageOf(r).stage;
check("the stage is decided from the figures, first test wins: shrinking revenue is decline; 30%+ growth with thin cash is hyper growth; a loss-maker growing slower is a startup; thin positive cash is break even", stageOn({ revenue_growth_pct: -4, fcf_margin_pct: 15, operating_margin_change_pts: 1, capital_returned_pct: 80 }) === "decline" && stageOn({ revenue_growth_pct: 45, fcf_margin_pct: -8 }) === "hyper_growth" && stageOn({ revenue_growth_pct: 45, fcf_margin_pct: 5 }) === "hyper_growth" && stageOn({ revenue_growth_pct: 12, fcf_margin_pct: -8, operating_margin_pct: -15 }) === "startup" && stageOn({ revenue_growth_pct: 12, fcf_margin_pct: 4 }) === "break_even");
check("a profitable business whose capacity spending runs ahead of its operating cash is not a startup: negative free cash flow with an operating profit is break even, and with the operating margin unread the startup test is noted, never guessed", stageOn({ revenue_growth_pct: 15.8, fcf_margin_pct: -1.5, operating_margin_pct: 12.1 }) === "break_even" && stageOf({ revenue_growth_pct: 12, fcf_margin_pct: -8 }).stage === "break_even" && stageOf({ revenue_growth_pct: 12, fcf_margin_pct: -8 }).notes.some((n) => /Startup could not be tested/.test(n)));
check("cash-generative: half or more of free cash flow returned is capital return; the margin widening with most cash kept is operating leverage; the margin narrowing with cash kept is capital return", stageOn({ revenue_growth_pct: 6, fcf_margin_pct: 25, operating_margin_change_pts: 0.5, capital_returned_pct: 90 }) === "capital_return" && stageOn({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9, operating_margin_change_pts: 1.5, capital_returned_pct: 14 }) === "operating_leverage" && stageOn({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9, operating_margin_change_pts: -2, capital_returned_pct: 14 }) === "capital_return");
const undecided = stageOf({ fcf_margin_pct: 20 });
check("without revenue growth or the cash margin no stage is decided and the reading says what it needs; cash-generative with the margin change and the capital returned unread, the two skipped tests are noted and nothing is guessed", undecided.stage === null && /Needs Revenue growth/.test(undecided.words) && stageOf({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9 }).stage === null && /to tell operating leverage from capital return/.test(stageOf({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9 }).words) && stageOf({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9 }).notes.length === 2 && stageOf({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9, operating_margin_change_pts: 1 }).stage === "operating_leverage", `${undecided.words} | ${stageOf({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9 }).notes.join(" / ")}`);
const opl = stageOf({ revenue_growth_pct: 13.5, fcf_margin_pct: 21.9, operating_margin_change_pts: 1.5, capital_returned_pct: 14 });
check("the reading names the rule and the figures read, and the stage's metrics in a sentence", /operating margin held or widened/.test(opl.words) && /Read: .*operating margin change 1.5/.test(opl.words) && opl.read.length === 5 && /Useful: Fwd P\/E, Fwd P\/FCF, DCF, Reverse DCF\. Somewhat useful: TAM, P\/S, P\/GP, P\/E, P\/FCF\./.test(stageMetricsWords("operating_leverage")), `${opl.words} | ${stageMetricsWords("operating_leverage")}`);

// The calculator: the inputs the filings seed, every metric valued on the person's estimates, the chosen method as the own valuation.
const vseed = { revenue: 30_500e6, grossProfit: 23_000e6, fcf: 14_000e6, epsDiluted: 14.4, dilutedShares: 883e6, revenueGrowthPct: 12.3, epsGrowthPct: 15, periodLabel: "TTM Jun 2026", currency: "USD" };
const vdflt = valuationDefaults(vseed, "operating_leverage", 585, "USD", "2026-10-16", true);
const euroV = valuationDefaults({ ...vseed, currency: "EUR" }, "operating_leverage", 585, "USD", "2026-10-16", true, 1.17);
check("the calculator's seed takes a price in another currency at the day's rate: the multiples are today's on the price in the filings' currency, fx kept; without a rate the price is left", !!euroV && euroV.fx === 1.17 && euroV.price === 585 && near(euroV.multiples.trailing_pe!.base, Math.round((585 / (vseed.epsDiluted! * 1.17)) * 10) / 10, 0.001) && valuationDefaults({ ...vseed, currency: "EUR" }, "operating_leverage", 585, "USD", "2026-10-16", true)!.price === null, JSON.stringify(euroV && { fx: euroV.fx, pe: euroV.multiples.trailing_pe }));
check("the defaults hold the schema: per-share figures from the filings, forward figures at the trailing growth, each multiple at today's with bear at four fifths and bull at six fifths, the DCF as the method where useful", vdflt !== null && near(vdflt.perShare.revenue!, 34.54, 0.1) && vdflt.perShare.eps === 14.4 && near(vdflt.forward.eps!, 16.56, 0.1) && near(vdflt.multiples.trailing_pe!.base, 40.6, 0.5) && near(vdflt.multiples.trailing_pe!.bear, 32.5, 1) && near(vdflt.multiples.trailing_pe!.bull, 48.7, 1) && vdflt.method === "dcf" && vdflt.price === 585, JSON.stringify(vdflt));
check("without a DCF the method is the first useful metric the filings can value; at a startup the first is sales; nothing seeds without revenue or shares", valuationDefaults(vseed, "operating_leverage", 585, "USD", "2026-10-16", false)!.method === "forward_pe" && valuationDefaults(vseed, "startup", 585, "USD", "2026-10-16", true)!.method === "ps" && valuationDefaults({ ...vseed, revenue: null }, "startup", 585, "USD", "2026-10-16", true) === null);
check("a price in another currency is not laid on the figures", valuationDefaults({ ...vseed, currency: "EUR" }, null, 585, "USD", "2026-10-16", false)!.price === null);
const readings = { revenue_growth_pct: 13.5, fcf_margin_pct: 21.9, operating_margin_change_pts: 1.5, capital_returned_pct: 14 };
const vin = valuationInputsSchema.parse({ ...vdflt!, method: "forward_pe", multiples: { ...vdflt!.multiples, forward_pe: { bear: 25, base: 30, bull: 35 } }, tam: { market: 500_000, sharePct: { bear: 5, base: 8, bull: 12 }, marginPct: 40, multiple: 20, shares: 883 } });
const vres = runValuation({ inputs: vin, dcf: runDcf(asml), readings, price: 585, priceCurrency: "USD", asOf: "2026-10-16" });
const fpe = vres.metrics.find((m) => m.metric === "forward_pe")!;
const tam = vres.metrics.find((m) => m.metric === "tam")!;
check("every metric is valued on the estimates: forward P/E is the multiple on the person's forward EPS, TAM is share times margin times the multiple over the shares, each against the price", near(fpe.cases!.base, 16.56 * 30, 0.2) && near(fpe.vsPricePct!.base, (16.56 * 30) / 585 * 100 - 100, 1) && near(tam.cases!.base, (500_000 * 0.08 * 0.4 * 20) / 883, 0.1) && vres.metrics.find((m) => m.metric === "dcf")!.cases!.base === Math.round(runDcf(asml).cases.base.perShare * 100) / 100 && /The price needs/.test(vres.metrics.find((m) => m.metric === "reverse_dcf")!.words), `${fpe.words} | ${tam.words}`);
check("the metrics are in the order of their use at the stage, the useful first; the chosen method's cases become the own valuation with the method and stage in the basis", vres.metrics.slice(0, 4).every((m) => m.use === "useful") && vres.metrics.at(-1)!.use !== "useful" && vres.chosen?.metric === "forward_pe" && ownValuationFrom(vres)!.base === Math.round(16.56 * 30 * 100) / 100 && /^Fwd P\/E 30× base, stage 4 Operating leverage, 2026-10-16$/.test(ownValuationFrom(vres)!.basis), `${vres.metrics.map((m) => `${m.metric}:${m.use}`).join(",")} | ${ownValuationFrom(vres)?.basis}`);
const ownStage = runValuation({ inputs: { ...vin, stage: "capital_return" }, dcf: null, readings, price: 585, priceCurrency: "USD", asOf: "2026-10-16" });
check("a stage the person set is in force and said to be theirs, the filings' still read; with no inputs at all the stage still reads and nothing is chosen", ownStage.stage === "capital_return" && ownStage.own && ownStage.reading.stage === "operating_leverage" && metricUse("trailing_pe", ownStage.stage) === "useful" && runValuation({ inputs: null, dcf: null, readings, price: 585, priceCurrency: "USD", asOf: "2026-10-16" }).stage === "operating_leverage" && runValuation({ inputs: null, dcf: null, readings, price: 585, priceCurrency: "USD", asOf: "2026-10-16" }).chosen === null);
const nomult = runValuation({ inputs: { ...vin, method: "trailing_pe", perShare: { ...vin.perShare, eps: -2 } }, dcf: null, readings, price: 585, priceCurrency: "USD", asOf: "2026-10-16" });
check("a negative figure values nothing and says so, so the chosen method gives no valuation", nomult.chosen === null && /not positive/.test(nomult.metrics.find((m) => m.metric === "trailing_pe")!.words) && ownValuationFrom(nomult) === null);
const vsum = valuationSummary(vres);
check("the summary a report keeps holds its schema with the stage, the chosen cases and every metric's use", valuationSummarySchema.safeParse(vsum).success && vsum.stage === "operating_leverage" && vsum.method === "forward_pe" && vsum.perShare?.base === fpe.cases!.base && vsum.lines.length === 9);

// The theses file and the pillars.
const file = thesesFileSchema.parse(JSON.parse(read("data/samples/theses.json")));
const ma = thesisFor(file, "ma");
check("the sample theses file holds its schema and a symbol is found whatever its case; the sample keeps a valuation by forward earnings", ma !== null && ma.pillars.length === 4 && ma.dcf !== null && ma.valuation?.method === "forward_pe" && thesisFor(file, "MA") === ma);
const reads = pillarReadings(ma!.pillars, { revenue_growth_pct: 12.1, roic_pct: 31, fcf_conversion: 1.05 });
check("a pillar is supported past its level, mixed within a tenth of it, at risk below it, and unread with no test or no reading", reads.map((p) => p.tag).join(",") === "supported,mixed,supported,unread" && /12.1/.test(reads[0].words), reads.map((p) => `${p.tag}:${p.words}`).join(" | "));
check("a pillar at or below its level on a lower-is-better test reads the same way", pillarReadings([{ id: "x", name: "Leverage", text: "", test: { field: "net_debt_to_ebitda", is: "lte", value: 2 } }], { net_debt_to_ebitda: 2.6 })[0].tag === "risk" && pillarReadings([{ id: "x", name: "Leverage", text: "", test: { field: "net_debt_to_ebitda", is: "lte", value: 2 } }], { net_debt_to_ebitda: 1.2 })[0].tag === "supported");
const detail = thesisDetail(ma, { revenue_growth_pct: 12.1, roic_pct: 31, fcf_conversion: 0.95 }, 600);
check("the thesis detail a report keeps carries the words, the pillars scored, the DCF at the report's price and the valuation with the stage on the figures", detail.text !== null && detail.pillars.length === 4 && detail.dcf !== null && detail.dcf.price === 600 && detail.pillars[0].tag === "supported" && detail.valuation.method === "forward_pe" && detail.valuation.price === 600 && detail.valuation.stage === null);
check("no thesis gives an empty detail with the stage still read from the figures, never a throw", thesisDetail(null, {}, 600).pillars.length === 0 && thesisDetail(null, {}, 600).dcf === null && thesisDetail(null, readings, 600).valuation.stage === "operating_leverage" && thesisDetail(null, readings, 600).valuation.method === null);
const now = "2026-10-16T10:00:00.000Z";
const added = withThesis(EMPTY_THESES, "nvo", { text: "A thesis.", pillars: [], pathway: null, watch: [], dcf: null, valuation: null, evidence: [], figures: [], since: null, updatedAt: now } as Thesis, now);
check("a thesis is kept under the upper-case symbol and removed with null", thesisFor(added, "NVO")?.text === "A thesis." && added.updated === now && Object.keys(withThesis(added, "NVO", null, now).bySymbol).length === 0);

// A holding's folder: what it holds and what it still owes.
const holding = { symbol: "MA", name: "Mastercard", price: 585, currency: "USD", fundamentals: { revenue_growth_pct: 12.1, roic_pct: 45, fcf_conversion: 1.1 }, record: { ownValuation: null, since: null, note: null, sector: null, levels: [], triggers: [{ id: "k1", kind: "kill" as const, field: "revenue_growth_pct", is: "lte" as const, value: 5, note: "Growth stalls" }], revaluation: null } };
const folder = holdingFolder({ symbol: "MA", holding: holding as unknown as Parameters<typeof holdingFolder>[0]["holding"], thesis: ma, earnings: null, studies: [], today: "2026-10-16" });
check("the folder reads the pillars and the kill signals on today's figures, runs the kept DCF and the valuation with the stage on the holding's fundamentals", folder.pillars.filter((p) => p.tag === "supported").length === 3 && folder.signals.length === 1 && folder.signals[0].met === false && folder.signals[0].reading === 12.1 && folder.dcf !== null && folder.dcf.result.cases.base.perShare > 0 && folder.valuation.result.chosen?.metric === "forward_pe" && folder.valuation.result.stage === null && /Needs Free cash flow margin/.test(folder.valuation.result.reading.words), folder.valuation.result.reading.words);
check("the folder says what it still owes, in the order to fill it: the valuation kept on the record, the study, the report", folder.owed.map((o) => o.key).join(",") === "valuation,study,report", folder.owed.map((o) => o.key).join(","));
const empty = holdingFolder({ symbol: "XYZ", holding: null, thesis: null, earnings: null, studies: [] });
check("an empty folder owes the thesis, the kill signals, the valuation, the study and the report", empty.owed.map((o) => o.key).join(",") === "thesis,signals,dcf,study,report" && !empty.held && /Valuation calculator/.test(empty.owed[2].words));

// The screen's list: listed equities by value, then a thesis no longer held.
const subjects = thesesSubjects([{ symbol: "ASML", name: "ASML", assetClass: "equity", value: 5000 }, { symbol: "MA", name: "Mastercard", assetClass: "equity", value: 6000 }, { symbol: "VOO", name: "Vanguard", assetClass: "etf", value: 9000 }, { symbol: "MA", name: "Mastercard", assetClass: "equity", value: 1000 }], file);
check("the list is the listed equities by value, one line per symbol, then a thesis no longer held, and never a fund", subjects.map((s) => `${s.symbol}${s.held ? "" : "*"}`).join(",") === "MA,ASML,AAPL*", subjects.map((s) => s.symbol).join(","));
const withWatch = thesesSubjects([{ symbol: "ASML", name: "ASML", assetClass: "equity", value: 5000 }], file, ["tem", "ASML", "GH", "TEM", "bad symbol"]);
check("the watchlist follows the holdings, each once, upper-cased, a held symbol and a malformed one left out; a thesis no longer held or watched comes last", withWatch.map((s) => `${s.symbol}${s.held ? "" : s.watched ? "~" : "*"}`).join(",") === "ASML,GH~,TEM~,AAPL*,MA*", withWatch.map((s) => s.symbol).join(","));

// Market theses, evidence and what the person's Claude writes through the connector (Hamza, 18 Oct 2026).
const wnow = new Date("2026-10-18T10:00:00.000Z");
const base: ThesesFile = { ...EMPTY_THESES, bySymbol: { MA: { ...EMPTY_THESIS, text: "Mastercard earns a toll on every card payment.", pillars: [{ id: "p1", name: "Volume", text: "Volume grows.", test: { field: "revenue_growth_pct", is: "gte", value: 10 } }], watch: ["Regulation"], updatedAt: "2026-10-01T00:00:00.000Z" } } };
check("a market thesis's id is its title in lower-case dashes, forty characters at most, and never empty", marketThesisId("Rates stay higher, for longer!") === "rates-stay-higher-for-longer" && marketThesisId("A".repeat(60)).length === 40 && marketThesisId("!!!") === "thesis");
const r1 = writeThesis(base, { kind: "market", thesis: "Rates stay higher", text: "The ten-year holds above 4%.", pillars: [{ name: "Ten-year", text: "Yield at or above 4%.", test: { field: "us10y", is: "gte", value: 4 } }], watch: [" Term premium ", ""] }, wnow, "2026-10-18");
check("a market thesis not on file is started by title with the indicator upper-cased and blank watch lines dropped", r1.created && r1.subject === "Rates stay higher" && r1.changed.join() === "title,text,pillars,watch" && r1.file.markets[0].id === "rates-stay-higher" && r1.file.markets[0].pillars[0].test?.field === "US10Y" && r1.file.markets[0].watch.join("|") === "Term premium" && r1.file.updated === wnow.toISOString());
const r2 = writeThesis(r1.file, { kind: "market", thesis: "rates-stay-higher", evidence: { source: "FOMC minutes", kind: "document", summary: "Members see rates on hold.", changes: "Nothing yet.", date: "2026-10-15" } }, wnow, "2026-10-18");
check("evidence is added to a market thesis by id, dated by the document, marked as Claude's, the text untouched", !r2.created && r2.changed.join() === "evidence" && r2.file.markets.length === 1 && r2.file.markets[0].evidence.length === 1 && r2.file.markets[0].evidence[0].via === "claude" && r2.file.markets[0].evidence[0].at === "2026-10-15" && r2.file.markets[0].text === "The ten-year holds above 4%.");
check("a market thesis is found by id, by title in any case, or by the id its title makes", marketThesisFor(r2.file, "RATES STAY HIGHER")?.id === "rates-stay-higher" && marketThesisFor(r2.file, "rates stay higher")?.id === "rates-stay-higher" && marketThesisFor(r2.file, "nothing") === null);
const r3 = writeThesis(base, { kind: "stock", symbol: "ma", pathway: "Show operating leverage.", evidence: { source: "Q3 2026 release", kind: "document", summary: "Revenue up 14%.", changes: null } }, wnow, "2026-10-18");
check("a stock thesis keeps its text and pillars when only the pathway and evidence are written, the evidence dated today when the document has no date", r3.changed.join() === "pathway,evidence" && r3.file.bySymbol.MA.text === base.bySymbol.MA.text && r3.file.bySymbol.MA.pillars.length === 1 && r3.file.bySymbol.MA.pathway === "Show operating leverage." && r3.file.bySymbol.MA.evidence[0].at === "2026-10-18" && r3.file.bySymbol.MA.evidence[0].id.startsWith("e261018"));
const r4 = writeThesis(base, { kind: "stock", symbol: "GH", text: "A watchlist thesis." }, wnow, "2026-10-18");
check("a thesis for a symbol not on file is created with the text alone", r4.created && r4.file.bySymbol.GH.text === "A watchlist thesis." && r4.file.bySymbol.GH.pillars.length === 0 && r4.file.bySymbol.GH.evidence.length === 0);
const refused = (w: ThesisWrite, f: ThesesFile = base) => {
  try {
    writeThesis(f, w, wnow, "2026-10-18");
    return null;
  } catch (e) {
    return e instanceof ThesisWriteProblem ? e.message : `other: ${String(e)}`;
  }
};
check("a pillar tested on a field the subject cannot read is refused, naming it; so is a market pillar on a fundamental field, and a write with nothing in it", /not_a_field/.test(refused({ kind: "stock", symbol: "MA", pillars: [{ name: "X", text: "", test: { field: "not_a_field", is: "gte", value: 1 } }] }) ?? "") && /revenue_growth_pct.*market indicator/.test(refused({ kind: "market", thesis: "Rates", pillars: [{ name: "X", text: "", test: { field: "revenue_growth_pct", is: "gte", value: 1 } }] }) ?? "") && /Nothing to write/.test(refused({ kind: "stock", symbol: "MA" }) ?? ""));
const full: ThesesFile = { ...EMPTY_THESES, markets: Array.from({ length: MAX_MARKET_THESES }, (_, i) => ({ id: `t${i}`, title: `Thesis ${i}`, text: "", pillars: [], watch: [], evidence: [], figures: [], basket: [], since: null, updatedAt: wnow.toISOString() })) };
check("a file at the limit refuses a new market thesis but still takes a change to one on file", /already/.test(refused({ kind: "market", thesis: "New one", text: "x" }, full) ?? "") && writeThesis(full, { kind: "market", thesis: "t3", text: "Changed." }, wnow, "2026-10-18").file.markets[3].text === "Changed.");
check("the evidence list keeps the newest forty", withEvidence({ evidence: Array.from({ length: MAX_EVIDENCE }, (_, i) => ({ id: `e${i}`, at: "2026-10-01", source: "s", kind: "note" as const, summary: "x", changes: null, via: "you" as const })), updatedAt: "" }, { at: "2026-10-18", source: "new", kind: "note", summary: "y", changes: null, via: "you" }, wnow.toISOString()).evidence.at(-1)?.source === "new" && withEvidence({ evidence: Array.from({ length: MAX_EVIDENCE }, (_, i) => ({ id: `e${i}`, at: "2026-10-01", source: "s", kind: "note" as const, summary: "x", changes: null, via: "you" as const })), updatedAt: "" }, { at: "2026-10-18", source: "new", kind: "note", summary: "y", changes: null, via: "you" }, wnow.toISOString()).evidence.length === MAX_EVIDENCE);
check("a market pillar reads on the indicator's level by symbol", pillarReadings(r1.file.markets[0].pillars, marketReadings([{ symbol: "US10Y", level: 4.6 }, { symbol: "VIX", level: 18 }]))[0].tag === "supported" && pillarReadings(r1.file.markets[0].pillars, marketReadings([{ symbol: "US10Y", level: 4.1 }]))[0].tag === "mixed" && pillarReadings(r1.file.markets[0].pillars, marketReadings([{ symbol: "US10Y", level: 3.2 }]))[0].tag === "risk" && pillarReadings(r1.file.markets[0].pillars, {})[0].tag === "unread");
check("the pillars' figures are the price or a fundamental field for a stock, an indicator for a market thesis", pillarFieldOk("price", "stock") && pillarFieldOk("revenue_growth_pct", "stock") && !pillarFieldOk("VIX", "stock") && pillarFieldOk("vix", "market") && !pillarFieldOk("price", "market") && pillarFieldName("US10Y") === "US 10-year yield" && pillarFieldName("price") === "Price");
// Charts and pictures written through the connector (Hamza, 20 Oct 2026).
const bars = { type: "bar" as const, labels: ["2023", "2024", "2025"], series: [{ name: "Revenue growth", values: [12, 10, null] }], unit: "%" };
const fg1 = writeThesis(base, { kind: "stock", symbol: "MA", figures: [{ title: "Growth by year", source: "10-K 2025", chart: bars }, { title: "Network map", source: "Investor day", sourceUrl: "https://example.com/deck", image: { url: "https://example.com/map.png", alt: "The network" } }] }, wnow, "2026-10-18");
const fma = fg1.file.bySymbol.MA;
check("a chart and a picture are added to a stock thesis with their sources, marked as Claude's, the rest untouched", fg1.changed.join() === "figures" && fma.figures.length === 2 && fma.figures[0].chart?.series[0].values[2] === null && fma.figures[1].image?.url === "https://example.com/map.png" && fma.figures.every((f) => f.via === "claude" && f.at === "2026-10-18") && new Set(fma.figures.map((f) => f.id)).size === 2 && fma.text === base.bySymbol.MA.text);
const fg2 = writeThesis(fg1.file, { kind: "stock", symbol: "MA", figures: [{ title: "growth by year", source: "10-Q Q3", caption: "Now with the quarter.", chart: { ...bars, labels: ["2023", "2024", "Q3 2026"] } }], removeFigures: ["Network map"] }, wnow, "2026-10-18");
check("a figure with a title already on the thesis replaces it, keeping its id; removeFigures takes one off by title", fg2.file.bySymbol.MA.figures.length === 1 && fg2.file.bySymbol.MA.figures[0].id === fma.figures[0].id && fg2.file.bySymbol.MA.figures[0].caption === "Now with the quarter." && fg2.file.bySymbol.MA.figures[0].chart?.labels[2] === "Q3 2026");
const fg3 = writeThesis(r1.file, { kind: "market", thesis: "rates-stay-higher", figures: [{ title: "Ten-year", source: "Treasury", chart: { type: "line", labels: ["2026-09-30", "2026-10-15"], series: [{ name: "US10Y", values: [4.1, 4.2] }], unit: "%" } }] }, wnow, "2026-10-18");
check("a line chart over dates is added to a market thesis", fg3.changed.join() === "figures" && fg3.file.markets[0].figures[0].chart?.type === "line");
check(
  "a picture that is not a public https address, a chart whose series miss a label, a line over years, and a figure with both or neither are refused with a sentence",
  /public https/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s", image: { url: "data:image/png;base64,AAAA", alt: "" } }] }) ?? "") &&
    /public https/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s", image: { url: "https://127.0.0.1/a.png", alt: "" } }] }) ?? "") &&
    /public https/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s", image: { url: "http://example.com/a.png", alt: "" } }] }) ?? "") &&
    /2 values for 3 labels/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s", chart: { ...bars, series: [{ name: "a", values: [1, 2] }] } }] }) ?? "") &&
    /line chart's labels are dates/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s", chart: { ...bars, type: "line" } }] }) ?? "") &&
    /either an image or a chart/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s" }] }) ?? "") &&
    /either an image or a chart/.test(refused({ kind: "stock", symbol: "MA", figures: [{ title: "x", source: "s", chart: bars, image: { url: "https://example.com/a.png", alt: "" } }] }) ?? ""),
);
check("a thesis holds twelve charts and pictures at most", /twelve|12/.test(refused({ kind: "stock", symbol: "MA", figures: Array.from({ length: 13 }, (_, i) => ({ title: `c${i}`, source: "s", chart: bars })) }) ?? ""));
check("a thesis file kept before the figures reads with none", thesesFileSchema.parse({ version: 1, bySymbol: { MA: { text: "x", updatedAt: "2026-10-01" } }, updated: "" }).bySymbol.MA.figures.length === 0);
// The record's part of a write (Hamza, 19 Oct 2026): kill signals and triggers, price levels, the valuation calculator; a symbol not held joins the watchlist.
const recOnly: ThesisWrite = { kind: "stock", symbol: "MA", triggers: [{ kind: "kill", field: "revenue_growth_pct", is: "lte", value: 5, note: "C1" }, { kind: "trigger", field: "price", is: "gte", value: 700, note: null }] };
check("a write with only the record's part leaves the thesis file as it is and is not refused; one with nothing at all is", writesRecord(recOnly) && !writesRecord({ kind: "stock", symbol: "MA", text: "x" }) && writeThesis(base, recOnly, wnow, "2026-10-18").changed.length === 0 && writeThesis(base, recOnly, wnow, "2026-10-18").file === base && /Nothing to write/.test(refused({ kind: "stock", symbol: "MA" }) ?? ""));
const rw1 = recordFromWrite(null, { triggers: recOnly.triggers, levels: { below: 500, above: null }, ownValuation: { low: 520, base: 600, high: 700, asOf: "2026-10-18", basis: "Trailing P/E" } }, wnow.toISOString());
check("the record takes the kill signals and triggers with ids, the levels and the own valuation, and says what changed", rw1.record.triggers.length === 2 && rw1.record.triggers[0].kind === "kill" && rw1.record.triggers[0].id.startsWith("t261018") && rw1.record.triggers[1].note === null && rw1.record.levels?.below === 500 && rw1.record.levels?.above === null && rw1.record.ownValuation?.base === 600 && rw1.changed.join("|") === "1 kill signal and 1 trigger|levels|valuation (600 base per share, Trailing P/E)", JSON.stringify(rw1));
const rw2 = recordFromWrite(rw1.record, { triggers: [{ kind: "kill", field: "price", is: "lte", value: 400, note: null }], levels: null }, wnow.toISOString());
check("a later write replaces the triggers keeping the first's id, clears the levels, and keeps the valuation", rw2.record.triggers.length === 1 && rw2.record.triggers[0].id === rw1.record.triggers[0].id && rw2.record.levels === null && rw2.record.ownValuation?.base === 600 && rw2.changed.join("|") === "1 kill signal and 0 triggers|levels");
check("a trigger on a figure the app cannot read is refused and named; a record with nothing written is the empty record", (() => { try { recordFromWrite(null, { triggers: [{ kind: "kill", field: "vibes", is: "lte", value: 1, note: null }] }, wnow.toISOString()); return false; } catch (e) { return e instanceof ThesisWriteProblem && /Kill signal 1 tests vibes/.test(e.message); } })() && recordFromWrite(null, {}, wnow.toISOString()).changed.length === 0 && recordFromWrite(null, {}, wnow.toISOString()).record.triggers.length === 0 && EMPTY_RECORD.ownValuation === null);
const laid = valuationFromWrite({ method: "trailing_pe", multiples: { trailing_pe: { bear: 30, base: 25, bull: 40 } }, forward: { eps: 20 }, note: "From the Q3 call." }, null, vdflt, "2026-10-18");
check("the calculator's inputs are Claude's method, multiples (bear never above base), forward figure and note laid on the filings' seed, the per-share figures the filings' own, dated today", laid?.method === "trailing_pe" && laid.multiples.trailing_pe!.bear === 25 && laid.multiples.trailing_pe!.base === 25 && laid.multiples.trailing_pe!.bull === 40 && laid.multiples.ps!.base === vdflt!.multiples.ps!.base && laid.forward.eps === 20 && laid.forward.fcf === vdflt!.forward.fcf && laid.perShare.eps === vdflt!.perShare.eps && laid.note === "From the Q3 call." && laid.asOf === "2026-10-18" && laid.stage === null, JSON.stringify(laid));
check("a write laid on kept inputs keeps them where it says nothing; with nothing to lay on it is null; a stage given is the person's", valuationFromWrite({ stage: "capital_return" }, laid, null, "2026-10-19")?.method === "trailing_pe" && valuationFromWrite({ stage: "capital_return" }, laid, null, "2026-10-19")?.stage === "capital_return" && valuationFromWrite({ method: "ps" }, null, null, "2026-10-19") === null);
const withV = withValuationInputs(base, "ma", laid!, wnow.toISOString());
const ovv = ownValuationOf(laid!, null, { price: 585 }, 585, "USD", "2026-10-18");
check("the inputs are kept on the thesis, the words untouched, and the chosen method's cases become the own valuation", withV.bySymbol.MA.valuation?.method === "trailing_pe" && withV.bySymbol.MA.text === base.bySymbol.MA.text && withValuationInputs(base, "GH", laid!, wnow.toISOString()).bySymbol.GH.text === "" && ovv !== null && ovv.base === Math.round(laid!.perShare.eps! * 25 * 100) / 100 && ovv.low === ovv.base && ovv.high === Math.round(laid!.perShare.eps! * 40 * 100) / 100 && /P\/E/i.test(ovv.basis ?? ""), JSON.stringify(ovv));
check("the latest report for a symbol is the newest by date, in any case, and a seed reads its years' last column", latestReportFor({ version: 1, updated: "", reports: [], expected: [], upcoming: [] }, "MA") === null && latestReportFor(null, "MA") === null && valuationSeedOf(null) === null);
const fill = fillThesesPrompt(["MA", "ASML"], false);
check("the fill-in prompt names the holdings owed, the connector's tools, write_thesis per holding, the market theses when none is on file, and that every figure comes from a tool", fill.includes("MA, ASML") && fill.includes("get_holdings") && fill.includes("get_methodology") && fill.includes("write_thesis") && fill.includes("market thesis") && fill.includes("Every figure must come from a tool") && fill.includes("kill signals and triggers") && fill.includes("Valuation calculator") && fill.includes("watchlist") && !fill.includes("Do not change a valuation") && !fillThesesPrompt([], true).includes("If I hold views") && fillThesesPrompt([], true).includes("each of my holdings"));
// Add to thesis, in the app (Hamza, 19 Oct 2026): the request, the check against the thesis and the document, the highlighting, the apply.
const rthesis: Thesis = { ...EMPTY_THESIS, text: "Mastercard earns a toll on every card payment.\n\nThe take rate has held near 20 basis points for a decade.", pathway: "Stay a Compounding Machine.", pillars: [{ id: "p1", name: "Pricing power", text: "Net revenue yield holds.", test: { field: "revenue_growth_pct", is: "gte", value: 10 } }], watch: ["Take rate by region"], updatedAt: wnow.toISOString() };
const rbody = reviewRequestBody({ document: { name: "MA Q3 2026 call.txt", text: "Revenue grew 14% to $7,800m. Take rate 19 bps.", pdf: null }, subject: { kind: "stock", label: "MA (Mastercard)" }, thesis: viewOf(rthesis), methodology: null, today: "2026-10-19" }) as { tools: { name: string }[]; messages: { content: { type: string; text?: string }[] }[]; system: string };
check("the request carries the document as text, the thesis paragraph by paragraph with its pathway, pillars and watch items, one tool propose_changes, and the figures a new pillar may test", rbody.tools[0].name === "propose_changes" && /Take rate 19 bps/.test(rbody.messages[0].content[0].text ?? "") && /\[paragraph 2\] The take rate/.test(rbody.messages[0].content[1].text ?? "") && /Pathway: Stay/.test(rbody.messages[0].content[1].text ?? "") && /Pricing power: Net revenue yield holds\. \[tested: revenue_growth_pct at or above 10\]/.test(rbody.messages[0].content[1].text ?? "") && /revenue_growth_pct \(/.test(rbody.system) && /Never propose a valuation/.test(rbody.system) && testableFields("market").some((f) => f.id === "VIX") && testableFields("stock")[0].id === "price");
// The methodology beside the thesis (Hamza, 19 Oct 2026): its classes and rules in words, and where the stock stands under it today.
const rm = methodologySchema.parse(JSON.parse(readFileSync("data/samples/methodology.individual.json", "utf8")));
const rrule = rm.rules.find((r) => r.test)!;
const rverdict: CompanyVerdict = { classId: "core", classLabel: "Core", checks: [{ rule: rrule, status: "pass", actual: "35%", limit: "20%", detail: "", figure: "Return on capital" }, { rule: rm.rules.find((r) => !r.test) ?? rrule, status: "n/a", actual: null, limit: "1", detail: "The filings give no figure for this.", figure: "x" }], classTests: [{ classId: "core", label: "Core", holds: true, passes: 6, needed: 7, unread: 1, required: [], criteria: [] }, { classId: "overlay", label: "Options overlay", holds: false, passes: 0, needed: 1, unread: 0, required: [], criteria: [] }], fields: [{ field: "revenue_growth_pct", label: "Revenue growth", value: "14%" }] };
const rview = methodologyView(rm, "USD", standingOf(rverdict, { weight: 8.5, cap: { classId: null, cap: 10, rule: rrule, figure: rm.figures[0] }, state: "within" }));
const rwith = reviewRequestBody({ document: { name: "call.txt", text: "Revenue grew 14%.", pdf: null }, subject: { kind: "stock", label: "MA (Mastercard)" }, thesis: viewOf(rthesis), methodology: rview, today: "2026-10-19" }) as { messages: { content: { type: string; text?: string }[] }[]; system: string };
const rmeth = rwith.messages[0].content[2].text ?? "";
check("the request carries the methodology beside the thesis: its name, every class's test in words, every rule with its section, kind and how the app tests it or that it is the person's to check, and where the stock stands today (class with each class's count, weight against the cap with its section, the rules on its figures, the figures); the instructions read the document against both, name the section a figure bears on and leave the verdict to the app", rmeth.includes(`Methodology: ${rm.name}.`) && rmeth.includes("- Core: ") && rmeth.includes(`- ${rrule.section} · ${rrule.text} · `) && /· tested as /.test(rmeth) && /the person's to check/.test(rmeth) && rmeth.includes("Where MA (Mastercard) stands under it today") && rmeth.includes("- Class: Core (Core: 6 of 7 criteria hold, 1 unread; Options overlay: 0 of 1 criteria hold)") && rmeth.includes(`- Weight: 8.50% of the book, cap 10% (${rrule.section}), within the cap`) && rmeth.includes(`${rrule.section} holds (Return on capital 35%, limit 20%)`) && /unread \(The filings give no figure for this\.\)/.test(rmeth) && rmeth.includes("- Figures from the filings: Revenue growth 14%") && rmeth.endsWith("Propose the changes.") && /and the methodology the thesis lives under/.test(rwith.system) && /naming the class criterion or the rule's section \(3\.1, D\.1\(c\)\)/.test(rwith.system) && /leave the class, the breach and the pass to the app/.test(rwith.system) && /preferring one the methodology's classes or rules read/.test(rwith.system), rmeth);
const rnocap = methodologyView(rm, "USD", standingOf(rverdict, { weight: 3.2, cap: null, state: "none" }));
check("with no methodology the request says it is read against the thesis alone; a stock not held and not read has no standing, said so; a holding under no cap says so; a market thesis carries the rules but no standing", /none confirmed yet, so the document is read against the thesis alone/.test(rbody.messages[0].content[2].text ?? "") && /no reading \(not held, and no filings read\)/.test((reviewRequestBody({ document: { name: "a.txt", text: "x", pdf: null }, subject: { kind: "stock", label: "SPOT" }, thesis: viewOf(null), methodology: methodologyView(rm, "USD", null), today: "2026-10-19" }) as { messages: { content: { text?: string }[] }[] }).messages[0].content[2].text ?? "") && /- Weight: 3\.20% of the book, no cap/.test((reviewRequestBody({ document: { name: "a.txt", text: "x", pdf: null }, subject: { kind: "stock", label: "MA" }, thesis: viewOf(null), methodology: rnocap, today: "2026-10-19" }) as { messages: { content: { text?: string }[] }[] }).messages[0].content[2].text ?? "") && (() => { const t = (reviewRequestBody({ document: { name: "a.txt", text: "x", pdf: null }, subject: { kind: "market", label: "Rates" }, thesis: viewOf(null), methodology: rview, today: "2026-10-19" }) as { messages: { content: { text?: string }[] }[] }).messages[0].content[2].text ?? ""; return /Rules \(section/.test(t) && !/stands under it today/.test(t); })());
check("a proposal kept before the methodology was read against parses with none", proposalSchema.parse({ key: "stock:MA", subject: { kind: "stock", symbol: "MA" }, at: wnow.toISOString(), document: { name: "a.txt", bytes: 1, readFrom: "text" }, source: "s", date: null, kind: "document", summary: "x", changes: [], dropped: [], unchecked: [] }).against === null);
const rpdf = reviewRequestBody({ document: { name: "note.pdf", text: null, pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }, subject: { kind: "market", label: "Rates stay higher" }, thesis: viewOf(null), methodology: null, today: "2026-10-19" }) as { messages: { content: { type: string; text?: string }[] }[] };
check("a PDF with no text layer goes as a document block; a market thesis is named by its title and has no pathway line", rpdf.messages[0].content[0].type === "document" && /a market thesis: "Rates stay higher"/.test(rpdf.messages[0].content[1].text ?? "") && !/Pathway:/.test(rpdf.messages[0].content[1].text ?? "") && /\(none written yet\)/.test(rpdf.messages[0].content[1].text ?? ""));
check("an answer in words is not a proposal; a propose_changes call that fits is", !parseReviewResponse({ content: [{ type: "text", text: "Here is what I think." }] }).ok && parseReviewResponse({ content: [{ type: "tool_use", name: "propose_changes", input: { source: "Q3 call", date: "2026-10-16", kind: "document", summary: "Revenue grew 14%.", changes: [] } }] }).ok && !parseReviewResponse({ content: [{ type: "tool_use", name: "propose_changes", input: { source: "" } }] }).ok);
const rread: ProposalRead = {
  source: "Q3 2026 earnings call",
  date: "2026-10-16",
  kind: "document",
  summary: "Revenue grew 14% to $7,800m; the take rate was 19 bps; management guided to 12.5% growth.",
  changes: [
    { target: "text", before: "The take rate has held near 20 basis points for a decade.", after: "The take rate has held near 20 basis points for a decade, and was 19 bps in Q3 2026.", reason: "The call printed 19 bps." },
    { target: "text", before: "A paragraph that is not in the thesis.", after: "Something else.", reason: "x" },
    { target: "text", before: "Mastercard earns a toll on every card payment.", after: "Mastercard  earns a toll on every card payment.", reason: "nothing" },
    { target: "watch", before: null, after: "Guidance of 12.5% growth against 14% delivered", reason: "Guidance." },
    { target: "pillar", before: "PRICING POWER", after: "Net revenue yield holds; 19 bps in Q3 2026.", reason: "The call." },
    { target: "pillar", before: null, name: "Cross-border", after: "Cross-border volume keeps growing faster than the total.", test: { field: "not_a_field", is: "gte", value: 1 }, reason: "The call." },
    { target: "pathway", before: null, after: "Stay a Compounding Machine through FY2027.", reason: "Guidance." },
    { target: "watch", before: "Nothing like this", after: "x", reason: "x" },
  ],
};
const rdoc = "Mastercard Q3 2026. Net revenue $7,800m, up 14%. Take rate 19 bps. Cross-border volume up 15%.";
const rchecked = checkProposal(rread, viewOf(rthesis), "stock", rdoc);
check("each change is placed on the thesis as kept: paragraph 2 by its words, the pillar by its name whatever the case, a new watch item and a new pillar, the pathway; a paragraph or item the thesis does not have and an unchanged paragraph are dropped and named", rchecked.changes.length === 5 && rchecked.changes[0].where === "Thesis, paragraph 2" && rchecked.changes[1].where === "New watch item" && rchecked.changes[2].where === "Pillar: Pricing power" && rchecked.changes[2].pillarId === "p1" && rchecked.changes[3].where === "New pillar: Cross-border" && rchecked.changes[4].where === "Pathway" && rchecked.changes[4].before === "Stay a Compounding Machine." && rchecked.dropped.length === 3 && rchecked.dropped.some((d) => /not in the thesis/.test(d)) && rchecked.dropped.some((d) => /unchanged/.test(d)), JSON.stringify({ where: rchecked.changes.map((c) => c.where), dropped: rchecked.dropped }));
check("a new pillar's test on a figure the subject cannot read is dropped and said so in its reason; a figure the document does not print (12.5%) is named and a printed one (19 bps, 14%) is not", rchecked.changes[3].test === null && /added without a test/.test(rchecked.changes[3].reason) && rchecked.unchecked.includes("12.5%") && !rchecked.unchecked.some((u) => /^19|^14/.test(u)) && uncheckedFiguresIn(["Revenue of $7,800m"], rdoc).length === 0 && checkProposal(rread, viewOf(rthesis), "stock", null).unchecked.length === 0, JSON.stringify(rchecked.unchecked));
check("a pathway proposed on a market thesis is dropped", checkProposal({ ...rread, changes: [rread.changes[6]] }, viewOf({ ...r1.file.markets[0] }), "market", null).dropped.length === 1);
const rdiff = wordDiff("The take rate has held near 20 basis points.", "The take rate has held near 19 basis points, and was 19 bps.");
check("the highlighting marks the words removed and added and keeps the rest; a block past the cap is the whole before and after", rdiff.some((t) => t.op === "del" && /20/.test(t.text)) && rdiff.filter((t) => t.op === "ins").map((t) => t.text).join("|").includes("and was 19 bps") && rdiff.filter((t) => t.op === "eq").map((t) => t.text).join("").includes("The take rate has held near ") && wordDiff("a b", "a c").length === 3 && wordDiff(Array.from({ length: 500 }, (_, i) => `w${i}`).join(" "), "x").length === 2);
const rproposal: Proposal = { key: proposalKey({ kind: "stock", symbol: "ma" }), subject: { kind: "stock", symbol: "MA" }, at: wnow.toISOString(), document: { name: "call.txt", bytes: 120, readFrom: "text" }, source: rread.source, date: rread.date, kind: "document", summary: rread.summary, changes: rchecked.changes, dropped: rchecked.dropped, unchecked: rchecked.unchecked, against: rm.name };
const rform = new Map<string, string>([["d_c1", "approve"], ["d_c4", "amend"], ["a_c4", "Guidance of 12.5% against 14% delivered: watch Q4"], ["d_c5", "deny"], ["d_c6", "approve"], ["d_c7", "amend"], ["a_c7", ""]]);
const rdecisions = decisionsFrom(rform, rproposal.changes);
check("the form's decisions are read per change: approve, deny, amend with the words; an amend with no words and a change the form does not name are denied", rdecisions.c1.decision === "approve" && rdecisions.c4.decision === "amend" && rdecisions.c4.amended?.startsWith("Guidance of 12.5%") === true && rdecisions.c5.decision === "deny" && rdecisions.c7.decision === "deny");
const rapplied = applyProposal(rthesis, rproposal, rdecisions, wnow, "2026-10-19");
check("apply writes the approved paragraph, the amended watch item and the new pillar, leaves the denied pillar and pathway as they were, and adds the evidence entry naming what changed", /19 bps in Q3 2026\./.test(rapplied.thesis.text) && rapplied.thesis.text.startsWith("Mastercard earns a toll") && rapplied.thesis.watch.length === 2 && rapplied.thesis.watch[1].endsWith("watch Q4") && rapplied.thesis.pillars.length === 2 && rapplied.thesis.pillars[0].text === "Net revenue yield holds." && rapplied.thesis.pillars[1].name === "Cross-border" && rapplied.thesis.pillars[1].test === null && rapplied.thesis.pathway === "Stay a Compounding Machine." && rapplied.kept === 3 && rapplied.denied === 2 && rapplied.thesis.evidence.length === 1 && rapplied.thesis.evidence[0].via === "claude" && rapplied.thesis.evidence[0].at === "2026-10-16" && rapplied.thesis.evidence[0].source === rread.source && /Paragraph 2 revised; watch item added, amended; pillar "Cross-border" added/.test(rapplied.thesis.evidence[0].changes ?? "") && rapplied.thesis.dcf === rthesis.dcf, JSON.stringify({ changes: rapplied.thesis.evidence[0].changes, kept: rapplied.kept, denied: rapplied.denied }));
const rnone = applyProposal(rthesis, rproposal, {}, wnow, "2026-10-19");
check("denying everything keeps the thesis as it was and still records the document as evidence with nothing changed; a document with no date is dated today", rnone.thesis.text === rthesis.text && rnone.kept === 0 && rnone.thesis.evidence[0].changes === null && applyProposal(rthesis, { ...rproposal, date: null }, {}, wnow, "2026-10-19").thesis.evidence[0].at === "2026-10-19");
const rfile = withProposal(EMPTY_PROPOSALS, rproposal, wnow.toISOString());
check("one proposal is kept per thesis under its key, found by the subject whatever the symbol's case, and removed on apply or dismiss", proposalFor(rfile, { kind: "stock", symbol: "ma" })?.source === rread.source && proposalFor(rfile, { kind: "market", id: "x" }) === null && Object.keys(withoutProposal(rfile, proposalKey({ kind: "stock", symbol: "MA" }), wnow.toISOString()).byKey).length === 0 && proposalKey({ kind: "market", id: "rates" }) === "market:rates");
check("Add to thesis is in the app: the upload on both thesis pages, the review with Approve, Deny and Amend, the three actions, the server half writing the proposals file alone, the vault key; the copy-into-Claude prompt for it is gone", /<AddToThesis/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /<AddToThesis/.test(read("app/(app)/theses/market/[id]/page.tsx")) && /<FileAction/.test(read("components/theses/add-to-thesis.tsx")) && /wordDiff\(/.test(read("components/theses/proposal-review.tsx")) && /name=\{`d_\$\{c\.id\}`\}/.test(read("components/theses/proposal-review.tsx")) && /"approve", "deny", "amend"/.test(read("components/theses/proposal-review.tsx")) && ["proposeFromDocumentAction", "applyProposalAction", "dismissProposalAction"].every((f) => new RegExp(`export async function ${f}`).test(read("app/(app)/theses/actions.ts"))) && /vault\.writeJson\("thesis_proposals"/.test(read("lib/thesis-review-run.ts")) && !/writeJson\("theses"/.test(read("lib/thesis-review-run.ts")) && /"thesis_proposals"/.test(read("lib/vault-keys.ts")) && !/addToThesisPrompt|ADD_STEPS/.test(read("lib/theses.ts") + read("components/theses/claude-prompt.tsx") + read("app/(app)/theses/[symbol]/page.tsx")) && /add to a thesis/.test(read("app/privacy/page.tsx")) && /methodologyFor\(ws, subject\)/.test(read("app/(app)/theses/actions.ts")) && /checkCompany\(/.test(read("app/(app)/theses/actions.ts")) && /against the thesis\{proposal\.against/.test(read("components/theses/proposal-review.tsx")));

check("the sample theses file carries one market thesis on the indicators and an evidence entry on a stock thesis, fictional and read-only", file.markets.length === 1 && file.markets[0].pillars.every((p) => !p.test || pillarFieldOk(p.test.field, "market")) && Object.values(file.bySymbol).some((t) => t.evidence.length) && Object.values(file.bySymbol).every((t) => t.evidence.every((e) => e.summary.length)));
check("the market thesis page, the list's sections, the Add to thesis card and the note form are in place; the MCP server reads the theses and proposes a write for review, kept on approval through writeThesisInto", /marketThesisFor\(/.test(read("app/(app)/theses/market/[id]/page.tsx")) && /Market theses ·/.test(read("app/(app)/theses/page.tsx")) && /Watchlist ·/.test(read("app/(app)/theses/page.tsx")) && /fillThesesPrompt\(/.test(read("app/(app)/theses/page.tsx")) && /<AddToThesis/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /<EvidenceList/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /<NoteForm/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /<HunterFinds/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /<HunterFinds/.test(read("app/(app)/theses/market/[id]/page.tsx")) && /Export as PDF/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /name: "get_theses"/.test(read("lib/mcp-tools.ts")) && /name: "write_thesis"/.test(read("lib/mcp-tools.ts")) && /proposeThesisWriteInto\(/.test(read("lib/mcp-run.ts")) && /vault\.writeJson\("thesis_writes"/.test(read("lib/theses-run.ts")) && /writeThesisInto\(/.test(read("app/(app)/theses/actions.ts")) && /<ClaudeWrites/.test(read("app/(app)/theses/page.tsx")) && /<ClaudeWrites/.test(read("app/(app)/theses/[symbol]/page.tsx")) && /<ClaudeWrites/.test(read("app/(app)/theses/market/[id]/page.tsx")) && /vault\.writeJson\("theses"/.test(read("lib/theses-run.ts")));

// The ontology: the screen, its slots, the kit's skeletons.
check("the Theses screen is in the ontology with its sixteen slots, the scorecard, the calibration, the market theses, the evidence, the charts and pictures, the Thesis Hunter, the record, the Valuation calculator and what the price assumes among them", SCREENS.theses !== undefined && SCREENS.theses.href === "/theses" && SCREENS.theses.slots.length === 16 && SCREENS.theses.slots.includes("thesis_calibration") && SCREENS.theses.slots.includes("thesis_priced_in") && SCREENS.theses.slots.includes("thesis_peers") && SCREENS.theses.slots.includes("thesis_figures") && SCREENS.theses.slots.includes("thesis_hunter") && SLOTS.thesis_hunter.label === "Added by Thesis Hunter" && SCREENS.theses.slots.includes("thesis_markets") && SCREENS.theses.slots.includes("thesis_evidence") && SLOTS.thesis_list.label === "Stock theses" && SCREENS.theses.slots.every((s) => s in SLOTS) && SCREENS.theses.slots.includes("thesis_dcf") && SLOTS.thesis_dcf.label === "Valuation calculator" && /Feroldi/.test(SLOTS.thesis_dcf.about) && EARNINGS_DOC.find((x) => x.key === "valuation")!.reads.includes("dcf"));
check("the earnings report's skeleton is in the ontology: each page once, each with what it answers and what it reads, from the cover to the sources", EARNINGS_DOC[0].key === "cover" && EARNINGS_DOC.at(-1)!.key === "sources" && new Set(EARNINGS_DOC.map((x) => x.key)).size === EARNINGS_DOC.length && EARNINGS_DOC.every((x) => x.reads.length && x.what.length > 3) && ["thesis", "valuation", "test", "signals", "competition", "moats", "swot", "questions"].every((k) => EARNINGS_DOC.some((x) => x.key === k)));

// Pure modules, the vault key, the nav.
check("lib/dcf.ts, lib/valuation.ts, lib/theses.ts, lib/thesis-review.ts, lib/thesis-hunter.ts, lib/thesis-pdf.ts and lib/push.ts import nothing server-only", ["lib/dcf.ts", "lib/valuation.ts", "lib/theses.ts", "lib/thesis-review.ts", "lib/thesis-hunter.ts", "lib/thesis-pdf.ts", "lib/push.ts"].every((f) => !/server-only|@\/lib\/vault|@\/lib\/workspace|next\//.test(read(f))));
check("the theses file is a vault key, the screen has a nav icon, and the demo keeps a fictional sample it never writes", /"theses"/.test(read("lib/vault-keys.ts")) && /theses: Lightbulb/.test(read("components/app/nav-items.ts")) && /readSample\("theses.json"/.test(read("lib/workspace.ts")) && /cannot be changed/.test(read("lib/workspace.ts")));
check("keeping the valuation writes the thesis (the estimates and the DCF) and the chosen method's cases as the record's own valuation; the demo refuses", /ownValuationFrom\(/.test(read("app/(app)/theses/actions.ts")) && /saveRecords\(/.test(read("app/(app)/theses/actions.ts")) && /saveTheses\(/.test(read("app/(app)/theses/actions.ts")) && /valuationInputsSchema\.safeParse/.test(read("app/(app)/theses/actions.ts")));
check("the calculator runs the same functions the decks use, in the browser: the stage and the metrics from lib/valuation.ts, the DCF by cash flow or by earnings inside it", /"use client"/.test(read("components/theses/valuation-calculator.tsx")) && /runValuation\(/.test(read("components/theses/valuation-calculator.tsx")) && /<DcfModel/.test(read("components/theses/valuation-calculator.tsx")) && /runDcf\(/.test(read("components/theses/dcf-calculator.tsx")) && DCF_BASES.every((b) => read("components/theses/dcf-calculator.tsx").includes(`"${b}"`) || /DCF_BASES\.map/.test(read("components/theses/dcf-calculator.tsx"))) && /Valuation calculator/.test(read("app/(app)/theses/[symbol]/page.tsx")));


// --- The five-year valuation history and its low (Hamza, 20 Oct 2026) ---
{
  const today = "2026-10-20";
  // Daily closes for five and a half years: 100 until the last month, then 52.
  const closes: { date: string; value: number }[] = [];
  for (let d = addDays(today, -2000); d <= today; d = addDays(d, 1)) closes.push({ date: d, value: d >= addDays(today, -30) ? 52 : 100 });
  // Quarterly rows: sales per share 10 throughout; EPS 2, then -1 for the last quarter; the last row ended 2026-09-30, not yet known.
  const rows = [] as { end: string; revenue: number | null; grossProfit: number | null; eps: number | null; fcf: number | null }[];
  for (let y = 2020; y <= 2026; y++) for (const md of ["03-31", "06-30", "09-30", "12-31"]) if (`${y}-${md}` <= "2026-09-30") rows.push({ end: `${y}-${md}`, revenue: `${y}-${md}` === "2026-09-30" ? 1 : 10, grossProfit: null, eps: `${y}-${md}` === "2026-06-30" ? -1 : 2, fcf: 4 });
  const ps = valuationHistory("ps", closes, rows, today)!;
  check("history: weekly points over five years", ps.points.length >= 255 && ps.points.length <= 263, String(ps.points.length));
  check("history: a quarter is not used before it was known (the 30 Sep figure of 1 would make 52x)", ps.now?.value === 5.2, String(ps.now?.value));
  check("history: low, median and high", ps.low?.value === 5.2 && ps.high?.value === 10 && ps.median === 10, JSON.stringify([ps.low, ps.median, ps.high]));
  check("history: near the low with enough weeks", ps.nearLow && ps.percentile === 0);
  check("history: words name the metric and the range", /^P\/S 5\.2x, within 5% of its five-year low: low 5\.2x, median 10\.0x, high 10\.0x\.$/.test(historyWords(ps)), historyWords(ps));
  const pe = valuationHistory("trailing_pe", closes, rows, today)!;
  check("history: a loss leaves a gap and no multiple today", pe.now === null && pe.points.at(-1)?.value === null && /trailing figure is zero or below/.test(historyWords(pe)), historyWords(pe));
  const fx = valuationHistory("ps", closes, rows, today, 0.5)!;
  check("history: a rate scales the level, never the low", fx.now?.value === 10.4 && fx.nearLow === ps.nearLow && fx.percentile === ps.percentile);
  const short = valuationHistory("ps", closes.slice(-400), rows, today)!;
  check("history: under two years the low is not judged", !short.nearLow && short.points.filter((p) => p.value !== null).length < MIN_HISTORY_WEEKS && /not judged/.test(historyWords(short)), historyWords(short));
  check("history: none without closes or rows", valuationHistory("ps", [], rows, today) === null && valuationHistory("ps", closes, [], today) === null);
  // EPS of 0.5 for a year in the middle: price 100 over it is 200x, not meaningful (Hamza, 23 Oct 2026, AMZN's 680x of 2023).
  const nmRows = rows.map((r) => (r.end >= "2023-03-31" && r.end <= "2023-12-31" ? { ...r, eps: 0.5 } : r));
  const nm = valuationHistory("trailing_pe", closes, nmRows, today)!;
  check("history: an earnings multiple above 100x is a gap, counted and left out of the high", nm.notMeaningful > 30 && (nm.high?.value ?? 999) <= NOT_MEANINGFUL_ABOVE && /left out as not meaningful/.test(historyWords({ ...nm, now: nm.low })) && valuationHistory("ps", closes, nmRows, today)!.notMeaningful === 0, JSON.stringify([nm.notMeaningful, nm.high]));
  check("history: the chosen method's trailing twin", historyMetricFor("forward_pe") === "forward_pe" && historyMetricFor("trailing_pe") === "trailing_pe" && historyMetricFor("dcf") === "trailing_pfcf" && historyMetricFor("pgp") === "pgp" && historyMetricFor(null) === "ps" && historyMetricFor("tam") === "ps");
  const notices = valuationLowNotices([{ symbol: "AAA", held: true, chosen: true, history: ps }, { symbol: "BBB", held: false, chosen: false, history: pe }, { symbol: "CCC", held: false, chosen: false, history: short }], today);
  check("alerts: one near its low, keyed by metric, to the thesis's valuation", notices.length === 1 && notices[0].key === `${VALUATION_LOW_PREFIX}AAA:ps` && notices[0].href === "/theses/AAA#valuation" && notices[0].tone === "info", JSON.stringify(notices));
  check("alerts: says held or watched and the metric's source", /^Held\. P\/S 5\.2x/.test(notices[0].detail ?? "") && /method chosen/.test(notices[0].detail ?? ""), notices[0]?.detail ?? "");
}

// ---------------------------------------------------------------------------
// Forward multiples, the analysts' consensus, peers and the watchlist's reference (Hamza, 23 Oct 2026)
{
  check("forward: a trailing figure carried a year on at its growth, the growth held to its bounds", grownForward(2, 10) === 2.2 && grownForward(2, 500) === 2 * (1 + FORWARD_GROWTH_MAX / 100) && grownForward(2, -90) === 1 && grownForward(-1, 10) === null && grownForward(2, null) === null);
  const fr = forwardRows([{ end: "2025-06-30", revenue: 100, grossProfit: null, eps: 1, fcf: 2 }, { end: "2026-06-30", revenue: 120, grossProfit: null, eps: 1.5, fcf: 1 }]);
  check("forward: each row's figures grow at its revenue growth on the row a year before, not their own (Hamza, 23 Oct 2026, AMZN); the first has none", fr[0].eps === null && Math.abs((fr[1].revenue ?? 0) - 144) < 1e-9 && Math.abs((fr[1].eps ?? 0) - 1.8) < 1e-9 && Math.abs((fr[1].fcf ?? 0) - 1.2) < 1e-9, JSON.stringify(fr));
  // AMZN's own filings: TTM diluted EPS 6.56 to 12.43 on one-off gains while revenue grew about 11%; its own growth would carry 12.43 to 23.5.
  const amzn = forwardRows([{ end: "2025-06-30", revenue: 670, grossProfit: null, eps: 6.56, fcf: null }, { end: "2026-06-30", revenue: 744, grossProfit: null, eps: 12.43, fcf: null }]);
  check("forward: a one-off gain in EPS is not carried forward twice", Math.abs((amzn[1].eps ?? 0) - 12.43 * (744 / 670)) < 1e-9, JSON.stringify(amzn[1]));
  const m = multiplesAt(30, [{ end: "2025-06-30", revenue: 100, grossProfit: null, eps: 1, fcf: 2 }, { end: "2026-06-30", revenue: 120, grossProfit: null, eps: 1.5, fcf: 1 }]);
  check("forward: the multiples at a price, trailing and forward", m.pe_ratio === 20 && Math.abs((m.forward_pe ?? 0) - 16.67) < 0.01 && m.ps_ratio === 0.25 && m.pfcf_ratio === 30 && m.forward_pfcf === 25, JSON.stringify(m));
  check("forward: a read kept before the field derives it from the P/E and revenue growth", Math.abs((forwardPeOf({ pe_ratio: 24, revenue_growth_pct: 20, eps_growth_pct: 90 }) ?? 0) - 20) < 1e-9 && forwardPeOf({ forward_pe: 15, pe_ratio: 24 }) === 15 && forwardPeOf({ forward_pe: null, pe_ratio: 24, revenue_growth_pct: 20 }) === null);
  const page = JSON.stringify({ data: { yearlyForecast: { rows: [{ fiscalEnd: "Dec 2026", consensusEPSForecast: "$4.00", noOfEstimates: 30 }, { fiscalEnd: "Dec 2027", consensusEPSForecast: 5, noOfEstimates: "28" }, { fiscalEnd: "Dec 2028", consensusEPSForecast: "--" }] } } });
  const years = parseNasdaqForecast(page);
  check("consensus: Nasdaq's yearly rows read, a dash left out", years.length === 2 && years[0].end === "2026-12" && years[0].eps === 4 && years[1].estimates === 28, JSON.stringify(years));
  // The analysts' EPS by year with their low and high, beside the filed years (Hamza, 21 Nov 2026).
  const ranged = parseNasdaqForecast(JSON.stringify({ data: { yearlyForecast: { rows: [{ fiscalEnd: "Dec 2026", consensusEPSForecast: "$4.00", lowEPSForecast: "$3.50", highEPSForecast: "$4.40", noOfEstimates: 30 }, { fiscalEnd: "Dec 2027", consensusEPSForecast: 5, LowEPSForecast: 6, HighEPSForecast: 7 }] } } }));
  check("consensus: the low and high read in either casing, a range not around the consensus dropped", ranged[0].low === 3.5 && ranged[0].high === 4.4 && (ranged[1].low ?? null) === null && (ranged[1].high ?? null) === null, JSON.stringify(ranged));
  const filedYears = { cols: ["2020", "2021", "2022", "2023", "2024", "2025", "TTM"], rows: [{ key: "epsDiluted", values: [1, 1.5, -0.5, 2, 2.5, 3, 3.2] }] };
  const bars = estimateBars(filedYears, consensusOf(ranged, "2026-10-23", "2026-10-23T06:00:00.000Z"), "USD");
  check("estimates: the last filed years then the analysts' years after them, labelled", bars.length === FILED_YEARS_SHOWN + 2 && bars[0].label === "FY22A" && bars.at(-2)!.label === "FY26E" && bars.at(-2)!.kind === "analysts" && bars.at(-2)!.low === 3.5, JSON.stringify(bars.map((b) => b.label)));
  check("estimates: growth on the bar before, none from a loss", bars[1].growth === null && bars[2].growth === 25 && bars.at(-2)!.growth === Math.round(((4 - 3) / 3) * 1000) / 10, JSON.stringify(bars.map((b) => b.growth)));
  check("estimates: filed figures in another currency are left out, the analysts' stand alone", estimateBars(filedYears, consensusOf(ranged, "2026-10-23", "2026-10-23T06:00:00.000Z"), "EUR").every((b) => b.kind === "analysts"));
  const hq = chartHeadline({ key: "revenue", title: "Revenue", labels: ["Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26"], values: [10, 11, 12, 13, 12, null], format: "money" }, "quarterly");
  check("financials: the headline is the latest figure and its change on a year before", hq.latest === 12 && hq.label === "Q1 26" && hq.change === 20, JSON.stringify(hq));
  const hm = chartHeadline({ key: "m", title: "Margin", labels: ["2024", "2025"], values: [20, 23.5], format: "pct" }, "annual");
  const hl = chartHeadline({ key: "fcf", title: "FCF", labels: ["2024", "2025"], values: [-5, 4], format: "money" }, "annual");
  check("financials: a margin moves in points, a change from a loss is none", hm.change === 3.5 && hm.unit === "pts" && hl.change === null);
  check("consensus: no estimates is an empty list, a page not Nasdaq's throws", parseNasdaqForecast(JSON.stringify({ data: null })).length === 0 && (() => { try { parseNasdaqForecast("<html>"); return false; } catch { return true; } })());
  const ntm = ntmConsensus(years, "2026-10-23");
  check("consensus: the next twelve months weight the year in progress by its months left", ntm.eps !== null && Math.abs(ntm.eps - (4 * 2 + 5 * 10) / 12) < 1e-9 && /2 months of FY Dec 2026/.test(ntm.words), JSON.stringify(ntm));
  check("consensus: no year after leaves no figure, said so", ntmConsensus(years.slice(0, 1), "2026-10-23").eps === null);
  const c = consensusOf(years, "2026-10-23", "2026-10-23T06:00:00.000Z");
  check("consensus: the price over it, for a price in dollars alone", consensusPe(48.33, "USD", c) === Math.round((48.33 / c.ntmEps!) * 100) / 100 && consensusPe(48.33, "EUR", c) === null && consensusPe(null, "USD", c) === null);

  const co = (symbol: string, sub: string | null, sic: number | null, cap: number, values: Record<string, number>, sector = "Information Technology") => screenCompanySchema.parse({ symbol, name: `${symbol} Inc`, cik: 1, sector, subIndustry: sub, sic, cap, price: 10, readAt: "2026-10-23T05:00:00.000Z", values });
  const universe = [co("AAA", "Semiconductors", 3674, 100, { pe_ratio: 20, forward_pe: 16 }), co("BBB", "Semiconductors", 3674, 300, { pe_ratio: 40, forward_pe: 30 }), co("CCC", "Systems Software", 7372, 600, { pe_ratio: 30 }), co("DDD", null, 3672, 50, { pe_ratio: 10 }), co("EEE", null, 3690, 50, { pe_ratio: 12 }, "Industrials")];
  const gics = peerComparison({ symbol: "AAA", sector: "Information Technology", subIndustry: "Semiconductors", sic: 3674, values: { pe_ratio: 20, forward_pe: 16 } }, universe);
  const pe = gics.rows.find((r) => r.field === "pe_ratio")!;
  check("peers: the GICS sub-industry first, the company left out", gics.basis.kind === "gics" && gics.peerCount === 1 && gics.peers[0].symbol === "BBB" && pe.peersMedian === 40 && pe.vsPeersPct === -50, JSON.stringify(pe));
  check("peers: the sector as a whole is its value over the earnings under it", pe.sectorN === 4 && Math.abs((pe.sectorWhole ?? 0) - Math.round((1050 / (100 / 20 + 300 / 40 + 600 / 30 + 50 / 10)) * 100) / 100) < 1e-9, JSON.stringify(pe));
  const sic = peersOf({ symbol: "ZZZ", sector: null, subIndustry: null, sic: 3674, values: {} }, universe);
  check("peers: no sub-industry widens the SEC code a digit at a time until enough are found", sic.basis.kind === "sic" && sic.basis.digits === 3 && sic.peers.length >= MIN_PEERS && !sic.peers.some((p) => p.symbol === "CCC" || p.symbol === "EEE"), JSON.stringify(sic.basis));
  check("peers: none without a sub-industry or a code, said so", peerComparison({ symbol: "ZZZ", sector: null, subIndustry: null, sic: null, values: {} }, universe).basis.kind === "none");

  // The watchlist's reference, on a forward P/E history of five years.
  const pts = Array.from({ length: 260 }, (_, i) => ({ date: addDays("2021-10-25", i * 7), value: 10 + (i % 21) }));
  const hist: ValuationHistory = { metric: "forward_pe", points: pts, now: { date: pts.at(-1)!.date, value: 20 }, low: { date: pts[0].date, value: 10 }, high: { date: pts[20].date, value: 30 }, median: 20, percentile: 50, years: 5, nearLow: false, notMeaningful: 0 };
  const histories = Object.fromEntries(HISTORY_METRICS.map((k) => [k, k === "forward_pe" ? hist : null])) as Record<HistoryMetric, ValuationHistory | null>;
  check("reference: the thesis's method first, else the stage's useful metric, else the first read", referenceMetric(histories, "forward_pe", "startup")?.metric === "forward_pe" && /kept on your thesis/.test(referenceMetric(histories, "forward_pe", null)!.why) && /useful at the capital return stage/.test(referenceMetric(histories, null, "capital_return")!.why) && /first metric/.test(referenceMetric(histories, null, "startup")!.why));
  check("reference: a quantile interpolates", quantile([1, 2, 3, 4], 0.5) === 2.5 && quantile([], 0.5) === null);
  const ref = watchReference({ histories, method: null, stage: "capital_return", price: 100, peers: gics, consensusPe: 25 })!;
  const q1 = quantile(pts.map((p) => p.value), 0.25)!;
  check("reference: today's figure is the price over today's multiple, each line a price on it", ref.perShare === 5 && ref.lines.find((l) => l.key === "median")?.price === 100 && ref.lines.find((l) => l.key === "low")?.price === 50 && ref.lines.find((l) => l.key === "peers")?.price === 150 && ref.lines.find((l) => l.key === "analysts")?.price === 80, JSON.stringify(ref.lines));
  check("reference: the suggestion is the quartiles and the median, the alerts at the low and the high", ref.suggestion?.base === 100 && ref.suggestion.low === Math.round(q1 * 5 * 100) / 100 && ref.suggestion.below === ref.suggestion.low && ref.suggestion.above === ref.suggestion.high && ref.suggestion.basis.length <= 80, JSON.stringify(ref.suggestion));
  const thinHist = { ...hist, points: pts.slice(-50), years: 1 };
  const thinRef = watchReference({ histories: { ...histories, forward_pe: thinHist }, method: null, stage: "capital_return", price: 100, peers: gics, consensusPe: null })!;
  check("reference: under two years, the peers' median is the base alone", thinRef.suggestion?.base === 150 && thinRef.suggestion.low === null && /peers' median/.test(thinRef.words), JSON.stringify(thinRef.suggestion));
  check("reference: nothing read, no reference", watchReference({ histories: { ...histories, forward_pe: null }, method: null, stage: null, price: 100, peers: null, consensusPe: null }) === null);

  const beside = valuationLowNotices([{ symbol: "AAA", held: false, chosen: true, beside: true, history: { ...hist, nearLow: true, now: { date: pts.at(-1)!.date, value: 10.2 } } }], "2026-10-23");
  check("alerts: the forward P/E is watched beside the method chosen, keyed by its metric", beside.length === 1 && beside[0].key === `${VALUATION_LOW_PREFIX}AAA:forward_pe` && /beside the method chosen/.test(beside[0].detail ?? ""), JSON.stringify(beside));
}

// ---------------------------------------------------------------------------
// The Thesis Hunter (Hamza, 20 Oct 2026)
{
  const hTheses: ThesesFile = { ...base, markets: [{ id: "rates-stay-higher", title: "Rates stay higher", text: "Long yields stay above four percent.", pillars: [], watch: [], evidence: [], figures: [], updatedAt: "2026-10-01T00:00:00.000Z" } as unknown as ThesesFile["markets"][number]] };
  const subjects = huntSubjects(hTheses, { MA: "Mastercard Inc" }, { MA: ["Kill: revenue growth below 5"] });
  check("hunter: every thesis with words is a subject, stocks first", subjects.map((x) => x.key).join() === "stock:MA,market:rates-stay-higher" && subjects[0].name === "Mastercard Inc" && subjects[0].signals.length === 1, subjects.map((x) => x.key).join());
  const huntedMa = withHunt(EMPTY_HUNTER, "stock:MA", [], "Nothing new.", new Date("2026-10-20T04:00:00Z"));
  const due = subjectsDue(subjects, huntedMa, "2026-10-20", 4);
  check("hunter: a thesis hunted this week waits its week out; never hunted goes first", due.map((x) => x.key).join() === "market:rates-stay-higher" && subjectsDue(subjects, huntedMa, "2026-10-21", 1)[0].key === "market:rates-stay-higher" && subjectsDue(subjects, huntedMa, "2026-10-26", 4).every((x) => x.key !== "stock:MA") && subjectsDue(subjects, huntedMa, "2026-10-27", 4).some((x) => x.key === "stock:MA"), due.map((x) => x.key).join());
  const nl = newslettersFileSchema.parse(JSON.parse(readFileSync("data/samples/newsletters.json", "utf8")));
  const items = materialFor(subjects[0], nl, null, "2026-10-10");
  check("hunter: the person's own newsletter points on the symbol, each with a ref", items.length > 0 && items.every((i) => i.from === "newsletter" && /^N\d+$/.test(i.ref)) && items.some((i) => /Payments/.test(i.text)), JSON.stringify(items.map((i) => i.text.slice(0, 40))));
  check("hunter: nothing outside the period", materialFor(subjects[0], nl, null, "2027-01-10").length === 0 && materialFor(subjects[0], null, null, "2026-10-10").length === 0);
  const input: HuntInput = { subject: subjects[0], today: "2026-10-20", items: [{ ref: "N1", from: "newsletter", source: "Sample: Daily", date: "2026-10-19", url: null, text: "Payments hold.", pictures: [{ ref: "N1.1", url: "https://example.com/chart.png", alt: "Volumes" }] }], known: [{ title: "Old news", url: "https://example.com/old" }], web: true };
  const body = hunterRequestBody(input) as { tools: { name: string }[]; tool_choice: { type: string } };
  check("investigate: the hunter asks why on the web, and asks nothing it cannot search for", (body as unknown as { system: string }).system.includes(INVESTIGATIVE) && !(hunterRequestBody({ ...input, web: false }) as { system: string }).system.includes(INVESTIGATIVE));
  check("hunter: web search only when the provider can, the record tool always", body.tools.some((t) => t.name === "web_search") && body.tool_choice.type === "auto" && !(hunterRequestBody({ ...input, web: false }) as { tools: { name: string }[] }).tools.some((t) => t.name === "web_search"));
  const answer = (finds: unknown[]) => ({ content: [{ type: "tool_use", name: "record_finds", input: { finds, note: "" } }] });
  const f = (o: Record<string, unknown>) => ({ title: "Volumes up", summary: "Cross-border volume rose 15% in Q3.", stance: "backs", pillar: "volume", from: "web", ref: "https://example.com/q3", source: "Example", date: "2026-10-18", chart: null, chartTitle: null, picture: null, ...o });
  const parsed = parseHunterResponse(
    answer([
      f({}),
      f({ title: "From the newsletter", from: "newsletter", ref: "n1", source: "made up", date: "2020-01-01", picture: "N1.1" }),
      f({ title: "No page", ref: "not a url" }),
      f({ title: "Old news", ref: "https://example.com/other" }),
      f({ title: "Past the limit", ref: "https://example.com/more" }),
    ]),
    input,
    new Date("2026-10-20T04:00:00Z"),
  );
  check("hunter: a web find needs a page, a ref must be listed, a repeat is dropped", parsed.ok && parsed.finds.length >= 2 && parsed.dropped >= 2 && !parsed.finds.some((x) => x.title === "No page" || x.title === "Unknown ref" || x.title === "Old news"), JSON.stringify(parsed));
  const fromNl = parsed.ok ? parsed.finds.find((x) => x.from === "newsletter") : undefined;
  check("hunter: a newsletter find takes the app's source and date, and its picture by ref", fromNl?.source === "Sample: Daily" && fromNl.date === "2026-10-19" && fromNl.figure?.image?.url === "https://example.com/chart.png" && fromNl.figure.via === "hunter", JSON.stringify(fromNl));
  const more = parseHunterResponse(answer([f({ title: "Unknown ref", from: "podcast", ref: "P9" }), f({ title: "Bad chart", ref: "https://example.com/c", chart: { type: "line", unit: "%", labels: ["Q1", "Q2"], series: [{ name: "x", values: [1] }] } })]), input, new Date("2026-10-20T04:00:00Z"));
  check("hunter: more finds than asked are cut, never lost; an unlisted ref is dropped; a chart that does not fit costs the figure, not the find", parsed.ok && parsed.finds.length + parsed.dropped === FINDS_PER_HUNT && !parsed.finds.some((x) => x.title === "Past the limit") && more.ok && more.finds.length === 1 && more.finds[0].title === "Bad chart" && more.finds[0].figure === null && more.dropped === 1, JSON.stringify(more));
  check("hunter: the pillar is named as the thesis names it", parsed.ok && parsed.finds[0].pillar === "Volume", parsed.ok ? String(parsed.finds[0].pillar) : "");
  check("hunter: words alone are not a find", !parseHunterResponse({ content: [{ type: "text", text: "Here is what I found" }] }, input, new Date()).ok);
  const kept = withHunt(EMPTY_HUNTER, huntKey({ kind: "stock", symbol: "ma" }), parsed.ok ? parsed.finds : [], "Found.", new Date("2026-10-20T04:00:00Z"));
  const id = shownFinds(huntFor(kept, "stock:MA"))[0]?.id ?? "";
  check("hunter: a dismissed find leaves the page", shownFinds(huntFor(withDismissed(kept, "stock:MA", id, new Date()), "stock:MA")).length === shownFinds(huntFor(kept, "stock:MA")).length - 1);
  {
    // A find is no alert (Hamza, 5 Nov 2026: "that should only show in the weekly report").
    const at = "2026-11-05T06:00:00.000Z";
    const prevAlerts = { ...EMPTY_ALERTS, items: [{ id: `${HUNTER_PREFIX}stock:MA:x@${at}`, key: `${HUNTER_PREFIX}stock:MA:x`, firedAt: at, clearedAt: null, tone: "warn" as const, title: "Thesis Hunter on MA: x", detail: "", href: "/theses/MA#hunter", figures: [], emailedAt: null, dismissedAt: null }] };
    const after = reconcile(prevAlerts, [{ key: `${HUNTER_PREFIX}stock:MA:y`, date: "2026-11-05", tone: "info", title: "Thesis Hunter on MA: y", detail: "", href: "/theses/MA#hunter" }], at);
    check("hunter: a find is no alert; one kept before is dropped from Notifications, the badge and the push", after.file.items.length === 0 && after.fired.length === 0 && alertsView(prevAlerts).now.length === 0 && unreadAlerts(prevAlerts, null).length === 0 && !newsWorthy(prevAlerts.items[0]));
    const run = read("lib/thesis-hunter-run.ts"), alertsRun = read("lib/alerts-run.ts"), page = read("app/(app)/notifications/page.tsx");
    check("hunter: neither the hunt, the twice-daily check nor Notifications makes an alert of a find", !/writeJson\("alerts"/.test(run) && !/thesis_hunter/.test(alertsRun) && !/thesisHunterFor|hunter/.test(page));
  }
}

// --- The thesis scorecard and bull and bear (Hamza, 23 Oct 2026) ------------
{
  const file = thesesFileSchema.parse(JSON.parse(readFileSync("data/samples/theses.json", "utf8")));
  const subjects = [{ symbol: "MA", held: true }, { symbol: "AAPL", held: false }];
  const s = (pairs: [string, number][]) => pairs.map(([date, value]) => ({ date, value }));
  const series = {
    SPY: s([["2025-10-31", 100], ["2026-01-02", 105], ["2026-03-02", 104], ["2026-10-22", 110]]),
    MA: s([["2025-10-31", 500], ["2026-01-02", 520], ["2026-10-22", 600]]),
    AAPL: s([["2026-01-02", 200], ["2026-03-02", 200], ["2026-10-22", 190]]),
  };
  check("scorecard: a return is from the close on or before the day written to the last close", returnSince(series.MA, "2025-11-03") === 20 && returnSince(series.SPY, "2026-03-02") === 5.77 && returnSince([], "2026-01-01") === null);
  const card = thesisScorecard(file, subjects, series);
  const ma = card.rows.find((r) => r.key === "stock:MA");
  const aapl = card.rows.find((r) => r.key === "stock:AAPL");
  const rates = card.rows.find((r) => r.kind === "market");
  check("scorecard: each stock thesis against SPY since it was written, the best first", ma?.returnPct === 20 && ma.benchmarkPct === 10 && ma.againstPct === 10 && card.rows[0].key === "stock:MA", JSON.stringify(card.rows.map((r) => [r.key, r.againstPct])));
  check("scorecard: a watched thesis is measured too, and marked not held", aapl?.held === false && aapl.againstPct === -10.77, String(aapl?.againstPct));
  check("scorecard: a market thesis's basket is its companies in equal parts from the day it was written", !!rates && rates.members.join(",") === "MA,AAPL" && rates.returnPct === 5.19 && rates.since === "2026-01-05", JSON.stringify(rates));
  check("scorecard: a basket member with no closes is named, never counted as flat", thesisScorecard({ ...file, markets: file.markets.map((m) => ({ ...m, basket: [...m.basket, "NOPE"] })) }, [], series).rows.find((r) => r.kind === "market")?.missing.join(",") === "NOPE");
  check("scorecard: said in a sentence", /of 3 theses are ahead of SPY since they were written/.test(scorecardWords(card.summary)) && scorecardWords({ measured: 0, ahead: 0, avgAgainstPct: null }).startsWith("No thesis"));
  check("scorecard: the symbols read are SPY, the theses and the baskets", scorecardSymbols(file, subjects).join(",").startsWith("SPY") && scorecardSymbols(file, subjects).includes("AAPL"));
  const t0 = { ...EMPTY_THESIS, text: "", evidence: [] };
  const t1 = { ...EMPTY_THESIS, text: "It compounds.", evidence: [] };
  check("since: a thesis is dated when it first gets words, and keeps that day after", sinceFor(t1, t0, "2026-10-23T10:00:00Z") === "2026-10-23" && sinceFor({ ...t1, text: "It compounds, still." }, { ...t1, since: "2026-01-02" }, "2026-10-23T10:00:00Z") === "2026-01-02" && sinceFor(t0, null, "2026-10-23T10:00:00Z") === null);
  check("since: a thesis written before the day was kept is measured from its first evidence, marked approximate", measuredFrom({ since: null, evidence: [{ at: "2026-02-01" } as never], updatedAt: "2026-09-01T00:00:00Z" }).approx && measuredFrom({ since: "2026-03-01", evidence: [], updatedAt: "x" }).day === "2026-03-01");
  check("basket: typed tickers are upper-cased, each once, a word that is no ticker dropped", basketFrom("ma, aapl msft;MA  12x").join(",") === "MA,AAPL,MSFT");

  const pill = (name: string, tag: "supported" | "risk" | "mixed" | "unread") => ({ pillar: { name, text: "", field: null, is: null, value: null } as never, reading: null, tag, words: `${name} today` }) as never;
  const bb = bullBear({
    price: 100,
    ccy: "USD",
    ownValuation: { low: 70, base: 120, high: 160, asOf: "2026-10-01", basis: "P/E, stage 4" },
    pillars: [pill("Growth", "supported"), pill("Margin", "risk"), pill("Debt", "mixed"), pill("Moat", "unread")],
    signals: [{ kind: "kill", label: "Revenue shrinks", met: false, note: null }, { kind: "trigger", label: "Price under 80", met: true, note: null }],
    finds: [{ stance: "backs", title: "Backed", summary: "s", source: "web", sourceUrl: "https://a.example", date: "2026-10-20", found: "2026-10-21", pillar: null, dismissed: false }, { stance: "challenges", title: "Challenged", summary: "s", source: "web", sourceUrl: "https://b.example", date: "2026-10-19", found: "2026-10-21", pillar: null, dismissed: false }, { stance: "challenges", title: "Dismissed", summary: "s", source: "web", sourceUrl: null, date: null, found: "2026-10-21", pillar: null, dismissed: true }],
    hasThesis: true,
  });
  check("bull and bear: the person's bull and base above the price are bull, the bear case is bear", bb.bull.filter((l) => l.from === "valuation").length === 2 && bb.bear.some((l) => l.from === "valuation" && /bear case, 70.00/.test(l.text)));
  check("bull and bear: a pillar that holds is bull, one that fails or nearly does is bear, an unread one is neither", bb.bull.some((l) => /Growth holds/.test(l.text)) && bb.bear.some((l) => /Margin fails/.test(l.text)) && bb.bear.some((l) => /Debt is close/.test(l.text)) && ![...bb.bull, ...bb.bear].some((l) => /Moat/.test(l.text)));
  check("bull and bear: no kill signal met is a bull line; a trigger is neither side", bb.bull.some((l) => /None of your 1 kill signal is met/.test(l.text)) && ![...bb.bull, ...bb.bear].some((l) => /Price under 80/.test(l.text)));
  check("bull and bear: the Thesis Hunter's finds go to their side, a dismissed one nowhere", bb.bull.some((l) => l.text === "Backed") && bb.bear.some((l) => l.text === "Challenged") && ![...bb.bull, ...bb.bear].some((l) => l.text === "Dismissed"));
  const empty = bullBear({ price: 100, ccy: "USD", ownValuation: null, pillars: [], signals: [], finds: [], hasThesis: false });
  check("bull and bear: with nothing on file each side is empty and says what would fill it, never a model's words", !empty.bull.length && !empty.bear.length && empty.owed.length >= 2);
  check("ontology: the scorecard opens Theses", SCREENS.theses.slots[0] === "thesis_scorecard" && !!SLOTS.thesis_scorecard);
}

{
  // The value map (lib/value-map.ts)
  const years = [{ end: "2026-12", eps: 10, estimates: 30 }, { end: "2027-12", eps: 12, estimates: 28 }, { end: "2028-12", eps: 14.4, estimates: 20 }];
  const g = projectedGrowth({ years }, "2026-10-24");
  check("projected growth runs from the fiscal year in progress to the furthest year listed, a year at a time", !!g && g.pct === 20 && g.years === 2 && g.from === "2026-12" && g.to === "2028-12", JSON.stringify(g));
  check("a year already ended is not the start, and one year ahead alone is no growth rate", projectedGrowth({ years: [{ end: "2025-12", eps: 8, estimates: 1 }, { end: "2026-12", eps: 10, estimates: 1 }] }, "2026-10-24") === null);
  check("no growth rate from a loss", projectedGrowth({ years: [{ end: "2026-12", eps: -1, estimates: 1 }, { end: "2028-12", eps: 2, estimates: 1 }] }, "2026-10-24") === null);
  const q = (y: number, eps: number) => ({ end: `${y}-06-30`, eps });
  const d = deliveredGrowth([q(2020, 1), q(2021, 1.1), q(2022, 1.21), q(2023, 1.331), q(2024, 1.4641), q(2025, 1.61051), q(2026, 1.771561)]);
  check("delivered growth is the last five years of trailing EPS, a year at a time", !!d && Math.abs(d.pct - 10) < 0.1 && Math.abs(d.years - 5) < 0.05, JSON.stringify(d));
  check("under three years of EPS is no delivered growth", deliveredGrowth([q(2024, 1), q(2026, 2)]) === null);
  const map = valueMap(
    [
      { symbol: "AAA", name: "A", held: true, weight: 10, values: { consensus_forward_pe: 30, forward_pe: 25 }, consensus: { years }, eps: null },
      { symbol: "BBB", name: "B", held: false, weight: null, values: { pe_ratio: 22, revenue_growth_pct: 10 }, consensus: null, eps: [q(2021, 1), q(2026, 1.61051)] },
      { symbol: "CCC", name: "C", held: true, weight: 5, values: { pe_ratio: -4 }, consensus: null, eps: null },
      { symbol: "DDD", name: "D", held: true, weight: 3, values: { forward_pe: 1.2 }, consensus: null, eps: null },
    ],
    "2026-10-24",
  );
  const a = map.points.find((p) => p.symbol === "AAA")!;
  const b = map.points.find((p) => p.symbol === "BBB")!;
  check("the analysts' forward P/E first; a read with none carries the trailing P/E a year at revenue growth", a.fwdPe === 30 && a.peBasis === "analysts" && b.fwdPe === 20 && b.peBasis === "filings");
  check("a company with no positive forward P/E is named, never placed at zero, and one under 3x is a split or currency gap, never a bargain", map.missing.map((m) => m.symbol).join() === "CCC,DDD" && /split or a currency/.test(map.missing[1].why));
  check("PEG is forward P/E over growth: 30 over 20% is 1.5; none where the basis has no growth", peg(a, "projected") === 1.5 && peg(b, "projected") === null && peg(b, "delivered") === 2);
  check("the words count those above the line on the basis shown", /1 of 1 company sits above/.test(mapWords(map.points, "projected")) && /1 of 1/.test(mapWords(map.points, "delivered")));
  const ax = mapAxes([{ ...a, fwdPe: 73, projected: { pct: 64, years: 3, from: "", to: "" } }], "projected");
  check("the axes reach at least 60% and 50x, further in tens when a company is past them", ax.xMax === 70 && ax.yMax === 80 && mapAxes([], "projected").xMax === 60);
  const ls = placeLabels([{ x: 100, y: 100, text: "AAA" }, { x: 104, y: 100, text: "BBB" }], { left: 0, right: 400, top: 0, bottom: 300 });
  check("two labels at one spot do not sit on each other", !(ls[0].x === ls[1].x && ls[0].y + ls[0].dy === ls[1].y + ls[1].dy));
}

// --- Against your fair value (Hamza, 4 Nov 2026) ---
{
  const d = "2026-11-04";
  const own = (base: number, low: number | null = null, high: number | null = null, asOf = "2026-10-01") => ({ low, base, high, asOf, basis: "P/E" });
  const fb = fairValueBook(
    [
      { symbol: "AAA", name: "A", value: 6000, price: 80, currency: "USD", own: own(100, 70, 130) },
      { symbol: "BBB", name: "B", value: 4000, price: 120, currency: "USD", own: own(100, null, 140, "2025-06-01") },
      { symbol: "CCC", name: "C", value: 2000, price: 50, currency: "USD", own: null },
      { symbol: "DDD", name: "D", value: 1000, price: null, currency: "USD", own: own(10) },
    ],
    d,
  );
  // At the bases: 6000*100/80 + 4000*100/120 = 7500 + 3333.33 = 10833.33 over 10000 worth today.
  check("the book's fair value is each holding's worth times its base over its price, by value", Math.abs(fb.fair - 10833.333) < 0.01 && Math.abs((fb.toFairPct ?? 0) - 8.3333) < 0.001 && fb.band === "under" && Math.abs((fb.pctOfFair ?? 0) - 92.3077) < 0.001, JSON.stringify({ fair: fb.fair, to: fb.toFairPct }));
  check("each holding's price against its base, the most upside first, with where it sits among bear and bull", fb.rows.map((r) => `${r.symbol}:${r.toBasePct.toFixed(1)}:${r.band}:${r.zone}`).join() === "AAA:25.0:under:low_base,BBB:-16.7:over:base_high" && fb.rows[0].weightPct === 60, fb.rows.map((r) => `${r.symbol}:${r.toBasePct.toFixed(1)}:${r.band}:${r.zone}`).join());
  check("a holding with no valuation or no price is named, never counted", fb.missing.map((m) => `${m.symbol}:${m.why}`).join() === "CCC:no valuation of yours yet,DDD:no price to set against it" && Math.abs(fb.coveredPct - (10000 / 13000) * 100) < 1e-9);
  // Bears: AAA at 70, BBB has none so at its base: 6000*70/80 + 4000*100/120 = 5250 + 3333.33.
  check("the bear and bull count a holding with no case at its base, and say how many", !!fb.bear && Math.abs(fb.bear.fair - 8583.333) < 0.01 && fb.bear.atBase === 1 && !!fb.bull && fb.bull.atBase === 0 && Math.abs(fb.bull.fair - (6000 * 130 / 80 + 4000 * 140 / 120)) < 0.01);
  check("within 5% of the base is at value; a valuation over a year old says so", bandOf(4.9) === "at" && bandOf(-4.9) === "at" && bandOf(5.1) === "under" && bandOf(-5.1) === "over" && fb.rows.find((r) => r.symbol === "BBB")!.stale && !fb.rows.find((r) => r.symbol === "AAA")!.stale);
  check("the sentence says below, at or above, by how much and over what", /^Below your value: the 2 holdings you have valued \(77% of the listed book by value\) would rise 8\.3%/.test(fairSentence(fb)) && /None of your listed holdings/.test(fairSentence(fairValueBook([], d))), fairSentence(fb));
  check("a price above the bull and below the bear are named", fairRow({ symbol: "X", name: "X", value: 1, price: 200, currency: null, own: own(100, 80, 150) }, d)?.zone === "above_high" && fairRow({ symbol: "X", name: "X", value: 1, price: 60, currency: null, own: own(100, 80, 150) }, d)?.zone === "below_low" && fairRow({ symbol: "X", name: "X", value: 1, price: 60, currency: null, own: own(0) }, d) === null);
}

// --- Judgement: calibration and the reasoned-trade score (9 Nov 2026) --------
{
  const closes = (pts: [string, number][]) => pts.map(([date, value]) => ({ date, value }));
  const cal = calibrationOf(
    { AAA: { low: 80, base: 100, high: 120, asOf: "2025-10-01" }, BBB: { low: 80, base: 100, high: 120, asOf: "2025-10-01" }, CCC: { low: 80, base: 100, high: 120, asOf: "2026-06-01" }, DDD: { low: null, base: 100, high: null, asOf: "2025-01-01" } },
    { AAA: closes([["2026-10-01", 110]]), BBB: closes([["2026-09-30", 130]]) },
    "2026-11-09",
  );
  check("calibration: a valuation a year old is judged against the close a year after it was set; a newer one waits; one without a range is left out", cal.judged === 2 && cal.inside === 1 && cal.sharePct === 50 && cal.rows.find((r) => r.symbol === "BBB")?.side === "above" && cal.waiting.length === 1 && cal.waiting[0].due === "2027-06-01" && cal.medianBaseGapPct === 20 && CALIBRATION_DAYS === 365);
  const t = (symbol: string, date: string, kind: "buy" | "sell") => ({ symbol, date, kind, quantity: 1 }) as unknown as Book["transactions"][number];
  const book = { asOf: "2026-11-09", transactions: [t("AAA", "2026-09-01", "buy"), t("AAA", "2026-09-01", "buy"), t("BBB", "2026-10-01", "sell"), t("CCC", "2026-11-01", "buy")] } as unknown as Pick<Book, "transactions" | "asOf">;
  const dec = { version: 1 as const, updated: "", entries: [{ id: "1", date: "2026-09-02", kind: "trade" as const, symbol: "AAA", title: "Bought for the margins", text: "", filedAt: "", action: null }, { id: "2", date: "2026-10-01", kind: "note" as const, symbol: "BBB", title: "Sold", text: "", filedAt: "", action: { on: "trade:BBB:2026-10-01:sell", outcome: "sell" as const, targetPct: null, by: null, votedClass: null, reading: null } }] };
  const series = { AAA: closes([["2026-09-01", 100], ["2026-11-07", 120]]), BBB: closes([["2026-10-01", 100], ["2026-11-07", 110]]), SPY: closes([["2026-09-01", 100], ["2026-10-01", 100], ["2026-11-07", 105]]) };
  const rt = reasonedTrades(book, dec, series, "2026-11-09");
  check("reasoned trades: a day's fills of one symbol are one trade, a reason found by the trade's answer or a trade entry within a week, judged a month on against SPY", rt.trades === 3 && rt.reasoned === 2 && rt.reasonedPct === 67 && rt.judged === 2 && rt.right === 1 && rt.rows.find((r) => r.symbol === "CCC")?.reason === null && JUDGE_AFTER_DAYS === 30);
  // Cooling-off trades, sale post-mortems and the monthly letter (Hamza, 9 Nov 2026, the twenty further ways).
  const plan = (id: string, date: string, symbol: string, title: string, outcome: "add" | "sell" | null) => ({ id, date, kind: "plan" as const, symbol, title, text: "Why", filedAt: "", action: outcome ? { on: `plan:${symbol}:${date}`, outcome, targetPct: null, by: null, votedClass: null, reading: null } : null });
  const withPlans = { ...dec, entries: [...dec.entries, plan("p1", "2026-08-30", "AAA", "Buy AAA", "add"), plan("p2", "2026-09-30", "BBB", "Buy BBB", "add"), plan("p3", "2026-11-05", "DDD", "Sell DDD", null)] };
  const pt = plannedTrades(book, withPlans, series, "2026-11-09");
  check("cooling off: a trade planned a day to a month before on its own side is planned; a plan on the other side or the same day is not; an open plan is listed", planSide(plan("x", "2026-01-01", "X", "Trim X", null)) === "sell" && pt.rows.find((r) => r.symbol === "AAA")?.planned === "2026-08-30" && pt.rows.find((r) => r.symbol === "BBB")?.planned === null && pt.planned.trades === 1 && pt.impulsive.trades === 2 && pt.plannedPct === 33 && pt.open.map((d) => d.symbol).join() === "DDD");
  const oldSale = { asOf: "2026-11-09", transactions: [t("EEE", "2025-10-01", "sell"), t("FFF", "2026-06-01", "sell")] } as unknown as Pick<Book, "transactions" | "asOf">;
  const pm = postMortems(oldSale, { ...dec, entries: [{ ...dec.entries[0], id: "e", symbol: "EEE", date: "2025-09-29", title: "Sold: thesis broke", kind: "trade" as const }] }, { EEE: closes([["2025-10-01", 100], ["2026-10-01", 90]]), SPY: closes([["2025-10-01", 100], ["2026-10-01", 115]]) }, "2026-11-09");
  check("post-mortems: a sale is looked back on a year later with the reason written then; doing worse than SPY is well made; a younger sale waits", POSTMORTEM_DAYS === 365 && pm.rows.length === 1 && pm.rows[0].verdict === "sold well" && pm.rows[0].reason === "Sold: thesis broke" && pm.rows[0].movePct === -10 && pm.waiting.length === 1 && pm.waiting[0].due === "2027-06-01");
  const letter = decidingLetter({ month: "2026-10", entries: [{ date: "2026-10-01", kind: "trade" }, { date: "2026-10-03", kind: "plan" }, { date: "2026-09-01", kind: "note" }], reasoned: rt, planned: pt, calibration: cal, rules: { score: 80, measured: 5, breaches: 1 }, postMortems: pm });
  check("the monthly letter: a line for each part of how the person decided, what to look at again named, never an amount", letter.lines.length === 6 && letter.lines[0].value === "2 entries" && /look again at/.test(letter.summary) && !letter.lines.some((l) => /\$/.test(`${l.value} ${l.detail}`)));
  const monthly = { kind: "monthly", sections: [{ heading: "Trades", lines: [], footer: null, slot: "review_trades" }, { heading: "Rules", lines: [], footer: null, slot: "review_rulebook" }] } as unknown as Parameters<typeof withDecidingLetter>[0];
  const laidLetter = withDecidingLetter(monthly, letter);
  check("the monthly letter is laid on a monthly review alone, right after the trades", laidLetter.sections.map((x) => x.slot).join() === "review_trades,review_letter,review_rulebook" && withDecidingLetter({ ...monthly, kind: "weekly" } as typeof monthly, letter).sections.length === 2);
}

if (failed) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\ncheck:theses ok (${passed} passed): the DCF reproduces HCMP's ASML model by cash flow and by earnings, the stage is decided from the filings by the ontology's tests and the metrics valued on the person's estimates, the pillars are scored on today's figures, a folder says what it owes, the five-year valuation history is read as each quarter was known with its low an alert, the forward multiples, the consensus and the peers are read as said and the watchlist's reference turns them into prices, the Thesis Hunter keeps only finds with a source the app can check and leaves them to the review, never an alert, the ontology carries the screen and the kit's two skeletons, each thesis is scored against SPY since it was written, and bull and bear come from the person's own cases, pillars, kill signals and finds, and the book is set against the fair values the person set.`);
