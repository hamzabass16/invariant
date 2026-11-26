/**
 * Holds the two build stages to hand-worked answers on the fictional samples:
 * inputs switch screens on (lib/setup.ts), and a methodology, written as
 * recipes over the ontology (lib/ontology.ts, lib/recipes.ts), reshapes the
 * dashboard and checks its rules (lib/methodology.ts).
 * Run: npm run check:setup
 */
import { readFileSync } from "node:fs";
import { adoptMethodology, LIBRARY } from "../lib/library";
import { packHeld, RULE_PACKS, rulePack, withPack } from "../lib/rule-packs";

import { z } from "zod";

import { bookSchema } from "../lib/holdings";
import { classWaiting, computeFigure, contextFor, dashboardFor, draftSchema, evaluate, fieldsRead, findingCounts, graph, methodologySchema, starter, without, type Methodology } from "../lib/methodology";
import { FIELD_IDS, FIELDS, describeOntology, evalCtx, fieldAvailable } from "../lib/ontology";
import { applyRecords, dashboardWith, DEFAULT_PREFERENCES, moveNav, orderNav } from "../lib/preferences";
import { classifier, computeExpr, exprWords, figureSchema, formatUnit, runTest, testWords } from "../lib/recipes";
import { bookForInputs, inputsWithoutData, modulesFor, setupSchema, type Setup } from "../lib/setup";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const read = (f: string) => JSON.parse(readFileSync(`data/samples/${f}`, "utf8"));
const near = (a: number | null, b: number, tol = 0.01) => a !== null && Math.abs(a - b) <= tol;

const dani = bookSchema.parse(read("dani.book.json"));
const dad = bookSchema.parse(read("dad.book.json"));
const mInd = methodologySchema.parse(read("methodology.individual.json"));
const mFam = methodologySchema.parse(read("methodology.family_office.json"));
const mDiv = methodologySchema.parse(read("methodology.dividend_growth.json"));
const today = "2026-10-11";
const BOTH = ["ibkr", "schwab"] as const;
const FAMILY = ["bank_statements", "fund_reports", "property"] as const;

const setup = (over: Partial<Setup>): Setup =>
  setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr"], tradesOptions: false, helperName: null, methodology: null, updated: today, ...over });

// ── Stage 1: inputs → screens ───────────────────────────────────────────────
check("individual, IBKR, trades options", same(modulesFor(setup({ tradesOptions: true }), null), ["overview", "allocation", "options", "newsletters", "methodology", "setup"]));
check("individual, IBKR, no options, no book: no Options screen", !modulesFor(setup({}), null).includes("options"));
const schwabOnly = bookForInputs(dani, ["schwab"]);
check("an option in the book switches Options on even when not ticked", modulesFor(setup({ inputs: ["schwab"] }), schwabOnly).includes("options") === schwabOnly.holdings.some((h) => h.assetClass === "option"));
const fam = setup({ profile: "family_office", baseCurrency: "EUR", inputs: [...FAMILY] });
check("family office, email and property", same(modulesFor(fam, null), ["overview", "allocation", "fixed_income", "funds", "properties", "statements", "newsletters", "methodology", "setup"]));
const banksOnly = bookForInputs(dad, ["bank_statements"]);
check("bank statements alone keep no funds or property", !banksOnly.holdings.some((h) => h.assetClass === "private_fund" || h.assetClass === "real_estate"));
check("look-through follows its fund out", banksOnly.lookThrough.length === 0);
check("all inputs keep the whole book", bookForInputs(dad, [...FAMILY]).holdings.length === dad.holdings.length);
check("inputs without data are named", same(inputsWithoutData(setup({ inputs: ["ibkr", "other_broker"] }), dani), ["other_broker"]));
check("setup needs at least one input", !setupSchema.safeParse({ ...fam, inputs: [] }).success);
check("setup needs a real currency code", !setupSchema.safeParse({ ...fam, baseCurrency: "euro" }).success);

// ── The ontology ────────────────────────────────────────────────────────────
check("every field names its object and supplier", FIELD_IDS.every((id) => FIELDS[id].object && FIELDS[id].suppliedBy));
check("fundamentals are named but supplied by nothing yet", FIELDS.dividend_yield_pct.suppliedBy === "none" && !fieldAvailable("dividend_yield_pct", ["ibkr", "schwab", "bank_statements"]));
check("fund fields need fund reports", !fieldAvailable("fund_unfunded", ["bank_statements"]) && fieldAvailable("fund_unfunded", ["fund_reports"]));
check("the ontology describes itself for the drafter", describeOntology().includes("owner_value") && describeOntology().includes("prior_ttm"));

// ── Recipes: hand-worked on Dani's book (net worth 196,230) ─────────────────
const ctxInd = contextFor(dani, today, mInd);
const fig = (m: Methodology, id: string) => m.figures.find((f) => f.id === id)!;
const nw = computeFigure(fig(mInd, "net-worth"), ctxInd, BOTH);
check("net worth from a recipe", nw.kind === "scalar" && near(nw.value, 196_230), nw.kind === "scalar" ? String(nw.value) : nw.kind);
// Short puts assigned: MSFT 415×100 + TSLA 200×100 = 61,500 → 31.34%.
const put = computeFigure(fig(mInd, "put-share"), ctxInd, BOTH);
check("short put obligation share", put.kind === "scalar" && near(put.value, 31.34), put.kind === "scalar" ? String(put.value) : "");
// Premium in the month to 11 Oct: 608.95 + 898.70 + 849.30 + 699.30 = 3,056.25.
const prem = computeFigure(fig(mInd, "premium-month"), ctxInd, BOTH);
check("premium collected in the last month", prem.kind === "scalar" && near(prem.value, 3056.25), prem.kind === "scalar" ? String(prem.value) : "");
// Weight by symbol: AAPL 80,500 of 196,230 = 41.02%, VOO 21,000 = 10.70%.
const w = computeFigure(fig(mInd, "weight-by-symbol"), ctxInd, BOTH);
check("weights by symbol, largest first", w.kind === "series" && w.points[0].key === "AAPL" && near(w.points[0].value, 41.02) && near(w.points[1].value, 10.7), w.kind === "series" ? JSON.stringify(w.points) : "");
// Cash 92,000 of 196,230 = 46.88%.
const cash = computeFigure(fig(mInd, "cash-share"), ctxInd, BOTH);
check("cash share", cash.kind === "scalar" && near(cash.value, 46.88));
// One short option within 21 days: MSFT 16 Oct put.
const soon = computeFigure(fig(mInd, "expiring-soon"), ctxInd, BOTH);
check("short options at 21 days counted", soon.kind === "scalar" && soon.value === 1);
// Premium by month fills the gap: Aug, Sep, Oct.
const pbm = computeFigure(fig(mInd, "premium-by-month"), ctxInd, BOTH);
check("premium by month, a month per point in order", pbm.kind === "series" && same(pbm.points.map((p) => p.key), ["2026-08", "2026-09", "2026-10"]), pbm.kind === "series" ? pbm.points.map((p) => p.key).join(",") : "");
check("premium by month values", pbm.kind === "series" && near(pbm.points[0].value, 548.95) && near(pbm.points[1].value, 558.7 + 608.95 + 898.7) && near(pbm.points[2].value, 849.3 + 699.3));
// Classes: core = equities and ETF (3), overlay = 7 options, cash = 2.
const classOf = classifier(mInd.classes, contextFor(dani, today, null));
check("classes sort holdings by their criteria", dani.holdings.filter((h) => classOf(h) === "core").length === 3 && dani.holdings.filter((h) => classOf(h) === "overlay").length === 7 && dani.holdings.filter((h) => classOf(h) === "cash").length === 2);
const byClass = computeFigure(fig(mInd, "value-by-class"), ctxInd, BOTH);
check("value by class groups by the methodology's classes", byClass.kind === "series" && near(byClass.points.find((p) => p.key === "core")!.value, 101_500) && near(byClass.points.find((p) => p.key === "cash")!.value, 92_000));

// ── Rules on Dani's book ────────────────────────────────────────────────────
const byId = (m: Methodology, book: typeof dani, inputs: readonly ("ibkr" | "schwab" | "bank_statements" | "fund_reports" | "property")[]) => Object.fromEntries(evaluate(m, book, today, inputs).map((f) => [f.rule.id, f]));
const findingCountsOf = (m: Methodology) => findingCounts(evaluate(m, dani, today, BOTH));
const ind = byId(mInd, dani, BOTH);
check("position cap breached, worst holding named", ind["position-cap"].status === "fail" && ind["position-cap"].actual === "41.0%" && ind["position-cap"].detail.startsWith("AAPL"), `${ind["position-cap"].actual} ${ind["position-cap"].detail}`);
check("short put obligation breached", ind["put-obligation"].status === "fail" && ind["put-obligation"].actual === "31.3%", ind["put-obligation"].actual ?? "");
check("a rule the recipes cannot express is the owner's to check", ind["covered-calls"].status === "manual");
check("roll at 21 days fails with one contract due", ind["roll-21"].status === "fail" && ind["roll-21"].actual === "1");
check("cash floor passes", ind["cash-floor"].status === "pass");

// ── Dad's book (net worth EUR 1,648,348) ────────────────────────────────────
const famF = byId(mFam, dad, FAMILY);
// Liquid 451,948 → 27.42%, inside the 25% floor but within 10% of it.
check("liquidity near its floor", famF.liquidity.status === "near" && famF.liquidity.actual === "27.4%", famF.liquidity.actual ?? "");
// Cash and deposits 286,600 against unfunded 77,400 + 100,000 = 177,400 → 1.62x.
check("calls covered", famF["call-cover"].status === "pass" && famF["call-cover"].actual === "1.62x", famF["call-cover"].actual ?? "");
// USD: 51,600 + 14,448 + 206,400 = 272,448 → 16.53%.
check("USD share within", famF["usd-share"].status === "pass" && famF["usd-share"].actual === "16.5%", famF["usd-share"].actual ?? "");
// The 12-month deposit: 150,000 of 352,500 fixed income = 42.6%, over the 40% guideline; the Hellenic 2029 bond is 28.7%.
check("largest share of fixed income fails the 40% guideline, worst named", famF["issuer-spread"].status === "fail" && famF["issuer-spread"].actual === "42.6%" && famF["issuer-spread"].detail.startsWith("12-month term deposit"), `${famF["issuer-spread"].actual} ${famF["issuer-spread"].detail}`);
// Athens: 60,000 on 420,000 = 14.3%.
check("loan to value within", famF.ltv.status === "pass" && famF.ltv.actual === "14.3%", famF.ltv.actual ?? "");
check("family vote is manual", famF["family-vote"].status === "manual");
check("AI through funds computes to a share", famF["ai-theme"].status === "pass" && famF["ai-theme"].actual !== null, famF["ai-theme"].actual ?? "");
const noFunds = byId(mFam, banksOnly, ["bank_statements"]);
check("a rule needing an unconnected input waits and says which", noFunds["call-cover"].status === "n/a" && noFunds["call-cover"].needs.some((n) => n.field === "fund_unfunded") && noFunds["call-cover"].detail.includes("Private fund reports"), noFunds["call-cover"].detail);

// ── Dividend growth: a dashboard no profile hard-codes ──────────────────────
const ctxDiv = contextFor(dani, today, mDiv);
// Dividends: twelve months to 11 Oct 2026 = 318 + 53 + 308 = 679; the twelve before = 306 + 51 + 284 = 641.
const ttm = computeFigure(fig(mDiv, "dividend-income-ttm"), ctxDiv, BOTH);
check("dividend income, trailing twelve months", ttm.kind === "scalar" && near(ttm.value, 679), ttm.kind === "scalar" ? String(ttm.value) : "");
const growth = computeFigure(fig(mDiv, "dividend-growth"), ctxDiv, BOTH);
check("dividend growth = 38 / 641", growth.kind === "scalar" && near(growth.value, 5.93), growth.kind === "scalar" ? String(growth.value) : "");
// Yield on cost: 679 over 54,000 + 9,800 + 18,500 = 82,300 → 0.825%.
const yoc = computeFigure(fig(mDiv, "yield-on-cost"), ctxDiv, BOTH);
check("yield on cost", yoc.kind === "scalar" && near(yoc.value, 0.825, 0.001));
const byMonth = computeFigure(fig(mDiv, "dividends-by-month"), ctxDiv, BOTH);
check("dividends by month over two years, gaps as zero", byMonth.kind === "series" && byMonth.points.length === 23 && byMonth.points[0].key === "2024-11" && byMonth.points.filter((p) => p.value === 0).length === 7, byMonth.kind === "series" ? `${byMonth.points.length} months` : "");
const byHolding = computeFigure(fig(mDiv, "income-by-holding"), ctxDiv, BOTH);
check("income by holding", byHolding.kind === "series" && near(byHolding.points.find((p) => p.key === "AAPL")!.value, 371) && near(byHolding.points.find((p) => p.key === "VOO")!.value, 308));
const payout = computeFigure(fig(mDiv, "payout-ratio"), ctxDiv, BOTH);
check("a figure on fundamentals says what it needs, never a zero", payout.needs.length === 1 && payout.needs[0].field === "payout_ratio_pct" && payout.needs[0].inputs === null);
const div = byId(mDiv, dani, BOTH);
check("dividend growth rule passes at 5.9% against 5%", div.growth.status === "pass" && div.growth.actual === "5.9%", div.growth.actual ?? "");
check("20% cap breached by AAPL", div["position-cap"].status === "fail" && div["position-cap"].actual === "41.0%");
check("payout rule waits for data it names", div.payout.status === "n/a" && div.payout.detail.includes("no connection supplies yet"), div.payout.detail);
// IBKR alone: 318 against 306 → 3.9%, now short of 5%.
const ibkrOnly = bookForInputs(dani, ["ibkr"]);
const divIbkr = byId(mDiv, ibkrOnly, ["ibkr"]);
check("the same rule fails on a smaller book", divIbkr.growth.status === "fail" && divIbkr.growth.actual === "3.9%", divIbkr.growth.actual ?? "");

// ── The dashboard ───────────────────────────────────────────────────────────
const famBanks = modulesFor(setup({ profile: "family_office", inputs: ["bank_statements", "property"] }), null);
const s1 = starter("family_office", famBanks);
check("starter leads with net worth and liquidity", same(s1.dashboard.headline.slice(0, 2), ["net-worth", "liquid-share"]));
check("starter skips fund figures without a fund input", !s1.dashboard.headline.includes("call-cover"));
check("starter panels only for switched-on screens", !s1.dashboard.sections.some((s) => s.kind === "panel" && (s.id === "funds" || s.id === "options")));
check("starter figures are valid recipes", s1.figures.every((f) => figureSchema.safeParse(f).success));
const d2 = dashboardFor("family_office", famBanks, mFam);
check("methodology dashboard keeps its order, minus the panel it cannot fill", d2.fromMethodology && d2.dashboard.sections[0].kind === "figures" && d2.dashboard.sections[0].label === "Exposure", JSON.stringify(d2.dashboard.sections[0]));
check("a panel without its input is named, not dropped", same(d2.missing, ["funds"]));
check("methodology headline replaces the starter", same(d2.dashboard.headline, mFam.dashboard.headline));
const dDiv = dashboardFor("individual", modulesFor(setup({ inputs: [...BOTH], tradesOptions: true }), dani), mDiv);
check("dividend dashboard leads with income and growth, not options", same(dDiv.dashboard.headline.slice(0, 2), ["dividend-income-ttm", "dividend-growth"]) && !dDiv.dashboard.sections.some((s) => s.kind === "panel" && s.id === "options"));

// ── The graph ───────────────────────────────────────────────────────────────
const g = graph(mDiv);
const edge = (from: string, to: string, kind: string) => g.edges.some((e) => e.from === from && e.to === to && e.kind === kind);
check("rule → section", edge("rule:growth", "section:1.1", "sits_in"));
check("rule → figure", edge("rule:growth", "figure:dividend-growth", "tests"));
check("figure → fields", edge("figure:dividend-growth", "field:amount", "reads") && edge("figure:dividend-growth", "field:kind", "reads"));
check("field → inputs", edge("field:amount", "input:ibkr", "supplied_by"));
check("dashboard → figure", edge("dashboard", "figure:dividend-income-ttm", "shows"));
check("every edge points at a node", g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to)));
check("fields read include the grouping", fieldsRead(fig(mDiv, "income-by-holding")).includes("txn_symbol"));

// ── The builder: removing an element, references follow ─────────────────────
const trimmed = without(mDiv, ["dividend-growth", "payer"]);
check("removed figure is gone", !trimmed.figures.some((f) => f.id === "dividend-growth"));
check("its rule becomes the owner's to check", trimmed.rules.find((r) => r.id === "growth")?.test === null);
check("headline loses it", !trimmed.dashboard.headline.includes("dividend-growth"));
check("removed class is gone and the rest validate", !trimmed.classes.some((c) => c.id === "payer") && methodologySchema.safeParse(trimmed).success);
check("removing a section's last figure removes the section", without(mInd, ["premium-by-month"]).dashboard.sections.every((s) => s.kind !== "figures" || s.label !== "Income"));

// ── Schema integrity ────────────────────────────────────────────────────────
const broken = { ...mDiv, rules: [...mDiv.rules, { id: "x", section: "9", text: "x", severity: "guideline", test: { figure: "nope", is: "lte", limit: 1 } }] };
check("a rule on a missing figure is refused", !methodologySchema.safeParse(broken).success);
check("a headline that is not a tile is refused", !methodologySchema.safeParse({ ...mDiv, dashboard: { ...mDiv.dashboard, headline: ["dividends-by-month"] } }).success);
// --- Groups say who is in them; a statement without transactions is not a zero ---
const grouped = computeExpr({ op: "measure", of: { measure: "sum", over: "holdings", field: "owner_value", where: [] } }, "money", ctxInd, BOTH, "class");
check("a holding no class fits is grouped as No class yet, never Unknown", grouped.kind === "series" && !grouped.points.some((p) => p.label === "Unknown") && (grouped.points.every((p) => p.key !== "none") || grouped.points.some((p) => p.label === "No class yet")));
check("a group over holdings names its members", grouped.kind === "series" && grouped.points.every((p) => Array.isArray(p.members) && p.members.length > 0), JSON.stringify(grouped.kind === "series" ? grouped.points.map((p) => p.members) : null));
const noTx = { ...dani, transactions: [] };
const divNoTx = computeExpr({ op: "measure", of: { measure: "sum", over: "transactions", field: "amount", where: [{ field: "kind", is: "eq", value: "dividend" }], window: { kind: "ttm" } } }, "money", contextFor(noTx, today, mInd), BOTH);
check("a sum over transactions when the book has none is nothing to measure, not zero", divNoTx.kind === "scalar" && divNoTx.value === null, JSON.stringify(divNoTx));
const divTx = computeExpr({ op: "measure", of: { measure: "sum", over: "transactions", field: "amount", where: [{ field: "kind", is: "eq", value: "option_close" }], window: { kind: "ttm" } } }, "money", ctxInd, BOTH);
check("a sum over transactions that exist but match nothing in the window is zero", divTx.kind === "scalar" && typeof divTx.value === "number", JSON.stringify(divTx));

check("a measure on a field of another object is refused", !figureSchema.safeParse({ id: "x", label: "x", unit: "money", view: "tile", expr: { op: "measure", of: { measure: "sum", over: "transactions", field: "owner_value", where: [] } } }).success);
check("a text field cannot be summed", !figureSchema.safeParse({ id: "x", label: "x", unit: "money", view: "tile", expr: { op: "measure", of: { measure: "sum", over: "holdings", field: "name", where: [] } } }).success);
const schema = z.toJSONSchema(draftSchema, { target: "draft-7", unrepresentable: "any" }) as { type?: string; properties?: Record<string, unknown> };
check("draft schema is an object with figures, rules and dashboard", schema.type === "object" && !!schema.properties?.figures && !!schema.properties?.rules && !!schema.properties?.dashboard);
check("draft schema leaves the source to the app", !schema.properties?.source);

// ── Words ───────────────────────────────────────────────────────────────────
check("a recipe reads in words", exprWords(fig(mDiv, "dividend-growth").expr).startsWith("change in total amount of transactions where kind is dividend in the last twelve months"), exprWords(fig(mDiv, "dividend-growth").expr));
check("a test reads in words", testWords({ expr: fig(mDiv, "cash-share").expr, unit: "pct", is: "gte", limit: 5 }, "USD").endsWith("at least 5.0%"));
check("money formats in the base currency", formatUnit(1500, "money", "EUR") === "€1,500" && formatUnit(1.5, "ratio", "USD") === "1.50x");
const t = runTest({ expr: fig(mInd, "weight-by-symbol").expr, unit: "pct", is: "lte", limit: 35, each: "symbol" }, ctxInd, BOTH);
check("a grouped test reports the worst group", t.status === "fail" && t.worst[0].key === "AAPL" && t.tested === 2);
check("a scalar recipe through computeExpr", computeExpr(fig(mInd, "net-worth").expr, "money", ctxInd, BOTH).kind === "scalar");

// ── Series, records, top-N and watches (the HCMP parity lessons) ────────────
// The individual sample carries a fictional weekly value series from 2024-10-11 to 2026-10-09 (105 points).
const ret = computeFigure(fig(mInd, "return-ytd"), ctxInd, BOTH);
check("return this year from the value series", ret.kind === "scalar" && near(ret.value, 46.16), ret.kind === "scalar" ? String(ret.value) : "");
const g100 = computeFigure(fig(mInd, "growth-of-100"), ctxInd, BOTH);
check("growth of 100 is a series by day starting at 100", g100.kind === "series" && g100.points.length === 105 && near(g100.points[0].value, 100) && near(g100.points[104].value, 165.51), g100.kind === "series" ? `${g100.points.length} ${g100.points[g100.points.length - 1]?.value}` : "");
const dd = computeFigure(fig(mInd, "max-drawdown"), ctxInd, BOTH);
check("worst fall since inception", dd.kind === "scalar" && near(dd.value, -14.6), dd.kind === "scalar" ? String(dd.value) : "");
const gap = computeFigure(fig(mInd, "below-high"), ctxInd, BOTH);
check("at a new high the gap is zero", gap.kind === "scalar" && near(gap.value, 0));
const beta = computeFigure(fig(mInd, "beta-spy"), ctxInd, BOTH);
check("beta computes when the book carries the benchmark series", beta.kind === "scalar" && beta.value !== null && Number.isFinite(beta.value) && !beta.needs.length);
const sortino = computeExpr({ op: "series", stat: "sortino", of: "nav", period: "1y" }, "ratio", ctxInd, BOTH);
check("the Sortino ratio computes from the value series alone", sortino.kind === "scalar" && sortino.value !== null && Number.isFinite(sortino.value) && !sortino.needs.length, sortino.kind === "scalar" ? String(sortino.value) : "");
check("the Sortino ratio needs no benchmark", figureSchema.safeParse({ id: "x", label: "x", unit: "ratio", view: "tile", expr: { op: "series", stat: "sortino", of: "nav", period: "1y" } }).success);
const betaQqq = computeExpr({ op: "series", stat: "beta", of: "nav", vs: "QQQ", period: "1y" }, "ratio", ctxInd, BOTH);
check("beta against a benchmark the book lacks waits, naming it", betaQqq.kind === "scalar" && betaQqq.value === null && betaQqq.needs.some((n) => n.field === "benchmark_series" && n.inputs === null && n.label.includes("QQQ")));
check("a series figure reads the series fields", same(fieldsRead(fig(mInd, "beta-spy")), ["nav_series", "benchmark_series"]));
// Top five outside cash and options: AAPL 69,000 + VOO 21,000 + AAPL (Schwab) 11,500 = 101,500 (only three such holdings) of 196,230 = 51.72%.
const top5 = computeFigure(fig(mInd, "top-five"), ctxInd, BOTH);
check("top five together", top5.kind === "scalar" && near(top5.value, 51.72), top5.kind === "scalar" ? String(top5.value) : "");
const top1 = computeExpr({ op: "measure", of: { measure: "sum", over: "holdings", field: "owner_value", where: [{ field: "asset_class", is: "not_in", value: ["cash", "deposit", "option"] }], top: 1 } }, "money", ctxInd, BOTH);
check("top 1 is the largest holding", top1.kind === "scalar" && near(top1.value, 69_000));
// AAPL at 230 against an own valuation of 205: 112.2%.
const pvo = computeFigure(fig(mInd, "price-vs-own"), ctxInd, BOTH);
check("price against the owner's own valuation, per symbol", pvo.kind === "series" && pvo.points.length === 1 && pvo.points[0].key === "AAPL" && near(pvo.points[0].value, 112.2), pvo.kind === "series" ? JSON.stringify(pvo.points) : "");
check("days in standing from the record", computeExpr({ op: "measure", of: { measure: "max", over: "holdings", field: "record_days", where: [] } }, "days", ctxInd, BOTH).kind === "scalar");
// Day change: only the IBKR AAPL line carries one, -0.6% of 69,000 = -414; the rest are null and add nothing.
const day = computeFigure(fig(mInd, "day-change"), ctxInd, BOTH);
check("change since previous close, where reported", day.kind === "scalar" && near(day.value, -414), day.kind === "scalar" ? String(day.value) : "");
const watch = byId(mInd, dani, BOTH)["drawdown-watch"];
check("a watch at a new high is watching, not tripped", watch.status === "pass" && watch.rule.severity === "watch");
check("watches are counted apart from breaches", findingCountsOf(mInd).tripped === 0 && findingCountsOf(mInd).breaches === 2);
check("a by-day series needs by: date", !figureSchema.safeParse({ id: "x", label: "x", unit: "number", view: "line", expr: { op: "series", stat: "growth_of_100", of: "nav", period: "1y" } }).success);
check("beta needs a benchmark", !figureSchema.safeParse({ id: "x", label: "x", unit: "ratio", view: "tile", expr: { op: "series", stat: "beta", of: "nav", period: "1y" } }).success);
check("top needs a field", !figureSchema.safeParse({ id: "x", label: "x", unit: "count", view: "tile", expr: { op: "measure", of: { measure: "count", over: "holdings", where: [], top: 5 } } }).success);
check("the ontology describes series statistics and top", describeOntology().includes("growth_of_100") && describeOntology().includes("top: N"));
check("series words", exprWords(fig(mInd, "beta-spy").expr) === "beta of the account's value against SPY over the last year", exprWords(fig(mInd, "beta-spy").expr));



// ── Preferences: the person's own arrangement, laid over the methodology ───
{
  const prefs = { ...DEFAULT_PREFERENCES, navOrder: ["/methodology", "/"], hidden: ["/options", "/more"] };
  const items = [{ href: "/" }, { href: "/allocation" }, { href: "/options" }, { href: "/methodology" }, { href: "/more" }];
  check("nav order puts listed screens in their order, and a screen the order does not name right after the one the skeleton puts before it (Hamza, 18 Oct 2026)", same(orderNav(items, prefs).map((n) => n.href), ["/methodology", "/more", "/", "/allocation"]));
  check("a screen added after the order was saved lands where the skeleton means it, not at the bottom", same(orderNav([{ href: "/" }, { href: "/notifications" }, { href: "/after-close" }, { href: "/holdings" }, { href: "/more" }], { ...DEFAULT_PREFERENCES, navOrder: ["/holdings", "/", "/notifications", "/more"] }).map((n) => n.href), ["/holdings", "/", "/notifications", "/after-close", "/more"]) && same(orderNav([{ href: "/new" }, { href: "/" }, { href: "/more" }], { ...DEFAULT_PREFERENCES, navOrder: ["/more", "/"] }).map((n) => n.href), ["/new", "/more", "/"]));
  check("Today and Sources & settings never hide", orderNav(items, prefs).some((n) => n.href === "/more") && orderNav(items, { ...prefs, hidden: ["/"] }).some((n) => n.href === "/"));
  const hrefs = items.map((i) => i.href);
  check("moving the first screen up changes nothing", same(moveNav(DEFAULT_PREFERENCES, hrefs, "/", "up"), DEFAULT_PREFERENCES));
  check("moving a screen down swaps it with the next", same(orderNav(items, moveNav(DEFAULT_PREFERENCES, hrefs, "/", "down")).map((n) => n.href).slice(0, 2), ["/allocation", "/"]));
  check("hiding then showing restores", same(moveNav(moveNav(DEFAULT_PREFERENCES, hrefs, "/options", "hide"), hrefs, "/options", "show").hidden, []));
  const mine = figureSchema.parse({ id: "my-cash", label: "Cash", unit: "money", expr: { op: "measure", of: { measure: "sum", over: "holdings", field: "owner_value", where: [{ field: "asset_class", is: "eq", value: "cash" }] } }, view: "tile" });
  const d = dashboardWith(mInd.figures, mInd.dashboard, { ...DEFAULT_PREFERENCES, figures: [mine], headline: ["my-cash", "net-worth", "not-a-figure", "premium-by-month"] });
  check("custom figures join the dashboard in their own section", d.figures.some((f) => f.id === "my-cash") && d.dashboard.sections[0].kind === "figures" && d.dashboard.sections[0].label === "Your figures");
  check("a headline pick keeps only tiles that exist", same(d.dashboard.headline, ["my-cash", "net-worth"]));
  check("a headline with nothing valid falls back to the methodology's", same(dashboardWith(mInd.figures, mInd.dashboard, { ...DEFAULT_PREFERENCES, headline: ["nope"] }).dashboard.headline, mInd.dashboard.headline));
  check("a custom figure computes like any other", (() => { const r = computeFigure(mine, ctxInd, BOTH); return r.kind === "scalar" && near(r.value, dani.holdings.filter((h) => h.assetClass === "cash").reduce((s, h) => s + h.value, 0)); })());
  const rec = applyRecords(dani, { version: 1, bySymbol: { VOO: { ownValuation: { low: null, base: 500, high: null, asOf: "2026-10-01", basis: null }, since: null, note: null, sector: null, levels: null, triggers: [], revaluation: null } }, updated: "" });
  check("records lay on the holding by symbol and leave the rest", rec.holdings.find((h) => h.symbol === "VOO")?.record?.ownValuation?.base === 500 && rec.holdings.find((h) => h.id === "ib:AAPL")?.record?.ownValuation?.base === 205);
  check("own valuation age reads the record's date", computeExpr({ op: "measure", of: { measure: "avg", over: "holdings", field: "own_valuation_age_days", where: [{ field: "symbol", is: "eq", value: "VOO" }] } }, "days", evalCtx(rec, "2026-10-11"), BOTH).kind === "scalar");
  check("a sum over rows that carry nothing in the field is null, never a zero", (() => { const r = computeExpr({ op: "measure", of: { measure: "sum", over: "holdings", field: "own_valuation", where: [{ field: "symbol", is: "eq", value: "VOO" }] } }, "money", ctxInd, BOTH); return r.kind === "scalar" && r.value === null; })());
  check("abs measures size regardless of sign", (() => { const r = computeExpr({ op: "measure", of: { measure: "sum", over: "holdings", field: "value", where: [{ field: "asset_class", is: "eq", value: "option" }], abs: true } }, "money", ctxInd, BOTH); return r.kind === "scalar" && r.value !== null && r.value > 0; })());
}

{
  // A class on company figures waits for the filings in one line, never one line a field "no connection supplies"; once any holding carries filings figures it waits for nothing (Hamza, 5 Nov 2026).
  const cls = { id: "cm", label: "Compounder", criteria: [{ field: "roic_pct", is: "gte", value: 20 }, { field: "gross_margin_pct", is: "gte", value: 40 }, { field: "revenue_growth_pct", is: "gte", value: 10 }] } as Parameters<typeof classWaiting>[0];
  const before = classWaiting(cls, ["ibkr"]);
  check("a class on company figures names the filings once before they are read", /SEC filings/.test(before) && !/no connection supplies/.test(before) && (before.match(/SEC filings/g) ?? []).length === 1, before);
  check("once the filings gave any holding a figure the class waits for nothing", classWaiting(cls, ["ibkr"], new Set(["roic_pct"])) === "", classWaiting(cls, ["ibkr"], new Set(["roic_pct"])));
}

// --- Rule packs (9 Nov 2026) ----------------------------------------------------
{
  const base = adoptMethodology(LIBRARY[0]);
  const conc = rulePack("concentration")!;
  const r = withPack(base, rulePack("cash")!);
  check("rule packs: each pack's figures and rules hold under the ontology's schemas", RULE_PACKS.length >= 4 && RULE_PACKS.every((p) => p.rules.every((x) => !x.test || p.figures.some((f) => f.id === x.test!.figure))));
  check("rule packs: a pack is laid on as a draft, its figures, rules and a section added once; a held rule is kept as it is", "draft" in r && r.draft.rules.some((x) => x.id === "pack-cash-floor") && r.draft.figures.filter((f) => f.id === "cash-share").length === 1 && r.draft.dashboard.sections.some((x) => x.kind === "figures" && x.label === "Cash buffer") && "error" in withPack(r.draft, rulePack("cash")!) && packHeld(r.draft, rulePack("cash")!));
  const withConc = withPack(base, conc);
  check("rule packs: a figure the methodology already has by id is not added twice", "draft" in withConc && withConc.draft.figures.filter((f) => f.id === "largest-holding").length <= 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
