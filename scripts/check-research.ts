/**
 * Research (lib/research.ts, lib/edgar-facts.ts, lib/research-prompt.ts):
 * a fictional filing becomes a facts table and the ontology's fundamentals,
 * each methodology family gets its template amended by the methodology, the
 * methodology's own recipes judge the subject, studies step to completion,
 * and the writer's request carries no key. Run: npm run check:research
 */
import { form4sOf, INSIDER_PERIODS, insiderPeriodDays, INSIDER_READ_DAYS, insiderFields, insiderNotices, insiderView, LYNCH_QUOTE, parseForm4, tradeWords, withForms } from "../lib/insiders";
import { FUNDAMENTAL_FIELDS } from "../lib/ontology";
import { EXTRA_INFO, metricInfo } from "../lib/metric-info";
import { companiesToRead as screenToRead, EMPTY_SCREENER, keptValues, screenOf, screenSentence, universeOf, withCompanies, withEngineStandIn, withShared, type ScreenCompany } from "../lib/screener";
import { applyFilters, chosenFilters, classFilter, mapDay, methodologyLevels, NO_SECTOR, SCREEN_FILTERS, screenFilters, sectorFilter, SORT_KEYS as SORT_KEYS_LIST, sortOf, sortRows, tableRows } from "../lib/screener-table";
import { atPrice } from "../lib/forward";
import { dcfDefaults, runDcf } from "../lib/dcf";
import { closenessOf, filingOf, fundFilings, FUNDS, FUNDS_READ, fundsDue, infoTableName, inDollars, issuerCompany, issuerWords, movesOf, parseInfoTable, rankFunds, sharesByCusip, staleFiling, thirteenFsOf } from "../lib/funds";
import { readFileSync } from "node:fs";
import { creedMatch, creedMethodology, creedRequestBody, creedsDue, creedSchema, creedThesis, CREED_REFRESH_DAYS, CREED_RETRY_DAYS, CREED_VERSION, failedCreed, fundNameOf, fundThesisTaken, lensOf, matchWords, parseCreedResponse, printedIn, rankByCreed, STATED_SECTION, takeFundThesis, themesOf, type FundCreed } from "../lib/fund-creeds";
import { MAX_MARKET_THESES } from "../lib/theses";
import { businessSections, ecoCandidate, ecoGroups, ecoNeedsRead, ecoRequestBody, ecosystemSchema, ECO_MAX_CHARS, ECO_RECHECK_DAYS, ECO_RETRY_DAYS, ECO_VERSION, failedEco, latestAnnualOf, parseEcoResponse } from "../lib/ecosystem";

import { foreignFiler, segmentChart } from "../lib/company";
import { companyProfileOf, companyRows, countryOfAddress, derivedSeries, factsTable, factsText, findCompany, fundamentalsOf, searchCompanies, lastReported, latestBalance, latestQuarterText, nameWords, shareBasisNote, splitsOf, studyTable } from "../lib/edgar-facts";
import { engineOf, geographyFilingOf, geographyRead, instanceFileOf, latestFilingOf, memberName, mergeSegmentSeries, periodicFilingsOf, placeOf, reconcileGeography, revenueGeographyOf, segmentHistoryFilings, segmentHistorySchema, segmentRead, segmentSeriesOf, segmentText, withEngine, businessLines, mixedNote, separateHistory, segmentFamilies, SEGMENT_HISTORY_VERSION } from "../lib/edgar-segments";
import { entryValues } from "../lib/filings";
import { adoptMethodology, libraryEntry } from "../lib/library";
import { benchmarksFileSchema, companiesToRead, lookThrough, lookThroughFields, weighted } from "../lib/look-through";
import { issuersOf, latestNportOf, parseNport } from "../lib/nport";
import { weightsFor } from "../lib/screens";
import { applyFilings, EMPTY_FILINGS, filingsFileSchema, filingsSummary, readableSymbols } from "../lib/filings";
import { bookSchema } from "../lib/holdings";
import { applyRecords, DEFAULT_PREFERENCES, edgarAddressValid, edgarUserAgent, preferencesSchema, recordsSchema } from "../lib/preferences";
import { htmlText, parseGicsTable, parseTickerTable, secTicker, sectorOfSic, sectorWeights } from "../lib/sectors";
import { computeFigure, contextFor, methodologySchema } from "../lib/methodology";
import { suppliedByBook } from "../lib/ontology";
import { afterStep, applyResearch, canonicalTemplate, checkCompany, classTestsMarkdown, EMPTY_RESEARCH, FAMILIES, failStudy, familyOf, MAX_STUDIES, newStudy, nextStep, RETRY_DAYS, RETRY_HOURS, retryDue, SECTION_CHARS, SECTIONS_PER_STEP, STALL_MINUTES, stalled, stepGroups, studyMarkdown, studySchema, studyToTakeUp, subjectBook, templateFor, templateFromText, tickerOf, withStudy } from "../lib/research";
import { CLIPPED_NOTE, clipSection, parseResearchResponse, researchMessages, researchRequestBody } from "../lib/research-prompt";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}
const near = (a: number | null | undefined, b: number, tol = 0.01) => a !== null && a !== undefined && Math.abs(a - b) <= tol;
const read = (f: string) => JSON.parse(readFileSync(`data/samples/${f}`, "utf8"));

// --- The SEC contact ---------------------------------------------------------
check("a preferences file written before the SEC contact existed reads as no contact", preferencesSchema.parse({ ...DEFAULT_PREFERENCES, edgarContact: undefined }).edgarContact === null);
check("the User-Agent is the product name and the confirmed address, nothing else", edgarUserAgent({ address: " ops@example.com ", consentedAt: "2026-10-12T00:00:00Z" }) === "Invariant (ops@example.com)");
check("an address is one email address", edgarAddressValid("ops@example.com") && !edgarAddressValid("ops") && !edgarAddressValid("two words@example.com") && !edgarAddressValid(""));
check("the deployment names no SEC contact of its own", !/EDGAR_USER_AGENT/.test(readFileSync("lib/edgar.ts", "utf8")) && !/EDGAR_USER_AGENT=/.test(readFileSync(".env.example", "utf8")));

// --- Which company a subject names -------------------------------------------
const list = companyRows({
  "0": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  "1": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "2": { cik_str: 1018724, ticker: "AMZN", title: "AMAZON COM INC" },
  "3": { cik_str: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
  "4": { cik_str: 1543151, ticker: "UBER", title: "Uber Technologies, Inc" },
  "5": { cik_str: 756894, ticker: "GOLD", title: "Barrick Mining Corp" },
  "6": { cik_str: 1, ticker: "GFI", title: "GOLD FIELDS LTD" },
  "7": { cik_str: 2, ticker: "GOLD2", title: "Gold Royalty Corp" },
  "8": { cik_str: 1326801, ticker: "META", title: "Meta Platforms, Inc." },
  "9": { cik_str: 3, ticker: "APLE", title: "Apple Hospitality REIT, Inc." },
  "10": { bad: true },
});
check("the SEC list reads into rows, skipping a malformed entry", list.length === 10 && list[0].ticker === "NVDA");
check("name words drop punctuation, a leading the and legal forms", nameWords("The Coca-Cola Company").join(" ") === "COCA COLA" && nameWords("AMAZON COM INC").join(" ") === "AMAZON" && nameWords("Meta Platforms, Inc.").join(" ") === "META PLATFORMS");
check("a ticker as typed wins", findCompany(list, "nvda")?.ticker === "NVDA" && findCompany(list, "brk-b")?.cik === 1067983);
check("a company name equal to the SEC's title finds it", findCompany(list, "NVIDIA")?.ticker === "NVDA" && findCompany(list, "Nvidia Corporation")?.ticker === "NVDA" && findCompany(list, "Berkshire Hathaway")?.ticker === "BRK-B" && findCompany(list, "amazon")?.ticker === "AMZN");
check("the first title in the SEC's order wins a tie", findCompany(list, "Apple")?.ticker === "AAPL");
check("one title beginning with the words finds it", findCompany(list, "Uber")?.ticker === "UBER" && findCompany(list, "Meta")?.ticker === "META");
check("a word many titles begin with matches by ticker only, never by name", findCompany(list, "Gold")?.ticker === "GOLD" && findCompany(list.filter((r) => r.ticker !== "GOLD"), "Gold") === null);
{
  const hits = (q: string) => searchCompanies(list, q).map((r) => r.ticker).join();
  check("search: the exact ticker first, then tickers starting with it, then names, one row per company", hits("gold") === "GOLD,GOLD2,GFI" && hits("APL").startsWith("APLE") && hits("") === "" && hits("platforms") === "META", hits("gold"));
  check("search: every word typed starts a word of the name", hits("berk hath") === "BRK-B" && hits("apple hosp") === "APLE" && hits("apple bank") === "");
  check("search: at most the cap", searchCompanies(list, "a", 2).length === 2);
  check("a 20-F, 6-K or non-dollar filer is foreign, so its insiders file no Form 4", foreignFiler({ perShareCurrency: "EUR" }, null) && foreignFiler({ perShareCurrency: "USD", revenueGeography: { form: "20-F" } }, null) && !foreignFiler({ perShareCurrency: "USD", revenueGeography: { form: "10-K" } }, null) && !foreignFiler(null, null));
}
check("a theme matches no company", findCompany(list, "US long bonds into a cutting cycle") === null && findCompany(list, "") === null);
try {
  companyRows([]);
  check("a list that is not the SEC's throws", false);
} catch {
  check("a list that is not the SEC's throws", true);
}

// --- Filings ---------------------------------------------------------------
const t = factsTable(read("edgar_companyfacts_sample.json"));
check("latest quarter is the last quarter reported", t.latestQuarter === "2026Q2" && t.basis === "ttm" && t.period === "TTM to 2026Q2", String(t.latestQuarter));
check("five fiscal years, oldest first", t.years.join(",") === "2021,2022,2023,2024,2025", t.years.join(","));
check("the fourth quarter, never framed by the SEC, is the year less the nine months", t.quarterly.revenue["2025Q4"] === 320e6 && t.quarterly.revenue["2024Q4"] === 280e6 && Object.keys(t.quarterly.revenue).length === 8, JSON.stringify(t.quarterly.revenue));
check("a period filed twice (the comparative in a later 10-Q) is read once", t.annual.revenue["2025"] === 1220e6 && t.quarterly.revenue["2025Q1"] === 290e6);
check("the reporting currency is read from the filings", t.currency === "USD", String(t.currency));
check("TTM sums the last four quarters", near(t.ttm.revenue, 1300e6, 1) && near(t.priorTtm.revenue, 1145e6, 1), `${t.ttm.revenue} / ${t.priorTtm.revenue}`);
check("a balance is read at the latest quarter end", latestBalance(t, "cash")?.quarter === "2026Q2" && latestBalance(t, "cash")?.value === 160e6);
check("every concept the fixture files is read; only the ones it never files are missing", t.missing.every((k) => ["costOfRevenue", "rnd", "sga", "sellingMarketing", "generalAdmin", "sbc", "buybacks", "acquisitions", "receivables", "inventory", "goodwill", "nonoperatingIncome", "intangiblesPurchases", "interestIncome", "marketableSecurities", "longTermInvestments", "shortTermDebt", "financeLeases", "minorityInterest", "loansReceivable", "intangibles", "assetsCurrent", "liabilitiesCurrent", "retainedEarnings"].includes(k)) && !t.missing.includes("grossProfit"), t.missing.join(","));
check("the facts text names the entity and the TTM column", /Northwind/.test(factsText(t)) && /TTM to 2026Q2/.test(factsText(t)) && /Revenue \| 800m/.test(factsText(t)));

const f = fundamentalsOf(t, 50);
const v = f.values;
check("revenue growth from TTM against prior TTM", near(v.revenue_growth_pct, 13.537), String(v.revenue_growth_pct));
check("gross margin", near(v.gross_margin_pct, 60), String(v.gross_margin_pct));
check("free cash flow margin (CFO less capex)", near(v.fcf_margin_pct, 21.923), String(v.fcf_margin_pct));
check("free cash flow conversion", near(v.fcf_conversion, 1.3702, 0.001), String(v.fcf_conversion));
check("interest cover", near(v.interest_cover, 26), String(v.interest_cover));
check("ROIC from NOPAT at 21% over equity plus debt less cash (C4)", near(v.roic_pct, 17.117), String(v.roic_pct));
check("invested capital, net debt, cash to debt and the operating margin against the prior year (C8)", v.invested_capital === 1200e6 && v.net_debt === 240e6 && near(v.cash_to_debt_pct, 40) && near(v.operating_margin_pct, 20) && near(v.operating_margin_change_pts, 1.4847, 0.001), JSON.stringify([v.invested_capital, v.net_debt, v.cash_to_debt_pct, v.operating_margin_pct, v.operating_margin_change_pts]));
check("net interest equals gross interest when no interest income is filed; a lender's ratio reads as none; FCF on operating income (C6, C7)", near(v.interest_cover_net, 26) && v.net_interest_expense === 10e6 && v.loans_to_equity === 0 && v.nonoperating_share_of_net_income_pct === 0 && near(v.fcf_conversion_operating, 1.3875, 0.001), JSON.stringify([v.interest_cover_net, v.net_interest_expense, v.loans_to_equity, v.fcf_conversion_operating]));
check("net debt to EBITDA", near(v.net_debt_to_ebitda, 0.857, 0.001), String(v.net_debt_to_ebitda));
check("operating leverage", near(v.operating_leverage, 1.6727, 0.001), String(v.operating_leverage));
check("FCF per share growth", near(v.fcf_per_share_growth_pct, 26.667), String(v.fcf_per_share_growth_pct));
check("EPS growth", near(v.eps_growth_pct, 22.353), String(v.eps_growth_pct));
check("P/E needs the price", near(v.pe_ratio, 24.038), String(v.pe_ratio));
check("forward P/E: the P/E over the trailing EPS carried a year on at revenue growth, not its own (Hamza, 23 Oct 2026)", near(v.forward_pe, 24.038 / 1.13537, 0.01), String(v.forward_pe));
check("P/S and P/FCF at the price, their forward twins carried at revenue growth", typeof v.ps_ratio === "number" && typeof v.forward_ps === "number" && near(v.forward_ps, (v.ps_ratio as number) / 1.13537, 0.01) && typeof v.pfcf_ratio === "number" && near(v.forward_pfcf, (v.pfcf_ratio as number) / 1.13537, 0.01), JSON.stringify([v.ps_ratio, v.forward_ps, v.pfcf_ratio, v.forward_pfcf]));
check("dividend yield", near(v.dividend_yield_pct, 0.8), String(v.dividend_yield_pct));
check("payout ratio", near(v.payout_ratio_pct, 19.231), String(v.payout_ratio_pct));
check("five-year dividend growth", near(v.dividend_growth_5y_pct, 9.856), String(v.dividend_growth_5y_pct));
check("years of raises", v.dividend_years_raised === 5, String(v.dividend_years_raised));
check("the only notes say which unreported lines were read as none", f.notes.length === 4 && f.notes.every((n) => /read as none|no goodwill|^altman_z: current assets/.test(n)), f.notes.join("; "));
const noPrice = fundamentalsOf(t, null);
check("without a price the P/E is null with a reason", noPrice.values.pe_ratio === null && noPrice.notes.some((n) => /pe_ratio.*price/.test(n)), noPrice.notes.join("; "));
const thin = factsTable({ cik: 1, entityName: "Thin Co", facts: { "us-gaap": { Revenues: { units: { USD: [{ end: "2025-12-31", val: 10, frame: "CY2025" }] } } } } });
const thinF = fundamentalsOf(thin, 10);
check("a filer with no dated figures gets nulls with reasons, never zeros", thin.basis === "none" && thin.latestQuarter === null && thinF.values.revenue_growth_pct === null && thinF.notes.length >= 10 && !Object.values(thinF.values).some((x) => x === 0), thinF.notes.slice(0, 2).join("; "));
// A 20-F filer: IFRS concepts, euros, one figure a year and no quarter at all.
const fy = (name: string, vals: Record<string, number>, unit = "EUR") => ({ [name]: { units: { [unit]: Object.entries(vals).map(([y, val]) => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, fy: Number(y), fp: "FY", form: "20-F", filed: `${Number(y) + 1}-02-10` })) } } });
const ifrs = factsTable({
  cik: 2,
  entityName: "Nordlicht NV (fictional)",
  facts: {
    "ifrs-full": {
      ...fy("Revenue", { 2023: 20e9, 2024: 24e9, 2025: 30e9 }),
      ...fy("GrossProfit", { 2024: 12e9, 2025: 15.6e9 }),
      ...fy("ProfitLossFromOperatingActivities", { 2024: 7e9, 2025: 9.8e9 }),
      ...fy("ProfitLoss", { 2024: 6e9, 2025: 8e9 }),
      ...fy("CashFlowsFromUsedInOperatingActivities", { 2024: 8e9, 2025: 10e9 }),
      ...fy("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", { 2024: 1e9, 2025: 1.2e9 }),
      ...fy("FinanceCosts", { 2024: 0.2e9, 2025: 0.2e9 }),
      ...fy("AdjustedWeightedAverageShares", { 2024: 400e6, 2025: 400e6 }, "shares"),
      ...fy("DilutedEarningsLossPerShare", { 2024: 15, 2025: 20 }, "EUR/shares"),
      Equity: { units: { EUR: [{ end: "2024-12-31", val: 18e9, fy: 2024, fp: "FY", form: "20-F", filed: "2025-02-10" }, { end: "2025-12-31", val: 20e9, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }] } },
      Borrowings: { units: { EUR: [{ end: "2025-12-31", val: 4e9, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }] } },
      CashAndCashEquivalents: { units: { EUR: [{ end: "2025-12-31", val: 5e9, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }] } },
    },
  },
});
const ifrsF = fundamentalsOf(ifrs, 700);
check("a 20-F filer is read year against year, in its own currency", ifrs.basis === "annual" && ifrs.period === "FY2025" && ifrs.currency === "EUR" && ifrs.latestQuarter === null, `${ifrs.basis} ${ifrs.period} ${ifrs.currency}`);
check("IFRS concepts fill revenue growth, gross margin, FCF conversion and interest cover", near(ifrsF.values.revenue_growth_pct, 25) && near(ifrsF.values.gross_margin_pct, 52) && near(ifrsF.values.fcf_conversion, 1.1, 0.001) && near(ifrsF.values.interest_cover, 49), JSON.stringify(ifrsF.values));
check("the annual basis is said in a note and the balance is the year end's", ifrsF.notes.some((n) => /FY2025.*no quarterly/.test(n)) && latestBalance(ifrs, "equity")?.value === 20e9 && near(ifrsF.values.fcf_per_share_growth_pct, 25.714), ifrsF.notes.join("; "));
// An IFRS filer that adds back depreciation and amortisation as two lines on its cash flow statement: D&A is their sum (self-fix, reader:b4a8fdeaaa6dc706).
{
  const parts = (combined: boolean) => factsTable({
    cik: 2,
    entityName: "Nordlicht NV (fictional)",
    facts: {
      "ifrs-full": {
        ...fy("Revenue", { 2024: 24e9, 2025: 30e9 }),
        ...fy("ProfitLossFromOperatingActivities", { 2024: 7e9, 2025: 9.8e9 }),
        ...fy("ProfitLoss", { 2024: 6e9, 2025: 8e9 }),
        ...fy("AdjustmentsForDepreciationExpense", { 2024: 1.5e9, 2025: 1.6e9 }),
        ...fy("AdjustmentsForAmortisationExpense", { 2024: 0.3e9, 2025: 0.4e9 }),
        ...(combined ? fy("AdjustmentsForDepreciationAndAmortisationExpense", { 2025: 2.1e9 }) : {}),
        Borrowings: { units: { EUR: [{ end: "2025-12-31", val: 4e9, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }] } },
        CashAndCashEquivalents: { units: { EUR: [{ end: "2025-12-31", val: 1e9, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }] } },
      },
    },
  });
  const apart = parts(false);
  const apartF = fundamentalsOf(apart, null);
  check("an IFRS filer's depreciation and amortisation added back apart are summed into D&A, so net debt to EBITDA is read", near(apart.ttm.da, 2e9) && near(apartF.values.net_debt_to_ebitda, 3e9 / 11.8e9, 1e-9) && !apart.missing.includes("da") && apart.derived.some((d) => /depreciation and the amortisation lines added together/.test(d)) && !apartF.notes.some((n) => /AdjustmentsFor\w+Expense under a name the app does not read/.test(n)), JSON.stringify({ da: apart.ttm.da, v: apartF.values.net_debt_to_ebitda, notes: apartF.notes.filter((n) => n.startsWith("net_debt_to")) }));
  const both = parts(true);
  check("a year with a combined D&A line keeps it; the parts fill only the years it lacks", near(both.annual.da["2025"], 2.1e9) && near(both.annual.da["2024"], 1.8e9), JSON.stringify(both.annual.da));
}
// An IFRS filer with no cost of sales or gross profit line: the cost of inventories recognised as an expense stands in, said so (self-fix, reader:61f5329af2bb235d).
{
  const byNature = (costOfSales: boolean) => factsTable({
    cik: 2,
    entityName: "Nordlicht NV (fictional)",
    facts: {
      "ifrs-full": {
        ...fy("Revenue", { 2024: 24e9, 2025: 30e9 }),
        ...fy("CostOfInventoriesRecognisedAsExpenseDuringPeriod", { 2024: 14e9, 2025: 18e9 }),
        ...(costOfSales ? fy("CostOfSales", { 2024: 15e9, 2025: 19.5e9 }) : {}),
        ...fy("ProfitLoss", { 2024: 3e9, 2025: 4e9 }),
      },
    },
  });
  const inv = byNature(false);
  const invF = fundamentalsOf(inv, null);
  check("an IFRS filer with no cost of sales line has its gross margin from the cost of inventories expensed, the basis in a note", near(invF.values.gross_margin_pct, 40) && inv.concept.costOfRevenue === "ifrs-full:CostOfInventoriesRecognisedAsExpenseDuringPeriod" && !inv.missing.includes("costOfRevenue") && inv.derived.some((d) => /cost of inventories recognised as an expense/.test(d)) && invF.notes.some((n) => /^gross_margin_pct: revenue less the cost of inventories/.test(n)) && !invF.notes.some((n) => /CostOfInventoriesRecognisedAsExpenseDuringPeriod under a name the app does not read/.test(n)), JSON.stringify({ gm: invF.values.gross_margin_pct, notes: invF.notes.filter((n) => n.startsWith("gross_margin")) }));
  const sold = byNature(true);
  check("a filer that reports cost of sales keeps it; the cost of inventories expensed is never read in its place", near(fundamentalsOf(sold, null).values.gross_margin_pct, 35) && sold.concept.costOfRevenue === "ifrs-full:CostOfSales" && !sold.derived.some((d) => /cost of inventories/.test(d)), JSON.stringify(sold.annual.costOfRevenue));
}
// Altman's Z-score: working capital, retained earnings, operating income and revenue over assets, market value over liabilities (assets less equity).
const yearEnd = (val: number) => ({ units: { EUR: [{ end: "2025-12-31", val, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }] } });
const withBalance = factsTable({
  cik: 2,
  entityName: "Nordlicht NV (fictional)",
  facts: {
    "ifrs-full": {
      ...fy("Revenue", { 2023: 20e9, 2024: 24e9, 2025: 30e9 }),
      ...fy("ProfitLossFromOperatingActivities", { 2024: 7e9, 2025: 9.8e9 }),
      ...fy("ProfitLoss", { 2024: 6e9, 2025: 8e9 }),
      ...fy("AdjustedWeightedAverageShares", { 2024: 400e6, 2025: 400e6 }, "shares"),
      ...fy("DilutedEarningsLossPerShare", { 2024: 15, 2025: 20 }, "EUR/shares"),
      Equity: yearEnd(20e9),
      Assets: yearEnd(40e9),
      CurrentAssets: yearEnd(15e9),
      CurrentLiabilities: yearEnd(8e9),
      RetainedEarnings: yearEnd(12e9),
    },
  },
});
const zF = fundamentalsOf(withBalance, 700);
check("Altman's Z-score is read from the balance sheet and the price (1.2, 1.4, 3.3, 0.6 and 1.0 weights)", near(zF.values.altman_z, 10.5885, 0.001), String(zF.values.altman_z));
check("a filer reporting no current assets has no Z-score, and says why", f.values.altman_z === null && f.notes.some((n) => /^altman_z: current assets/.test(n)), f.notes.filter((n) => n.startsWith("altman")).join("; "));
check("with no price there is no Z-score", fundamentalsOf(withBalance, null).values.altman_z === null);
// A company that moved from "Revenues" to the newer concept keeps every year, and a Jan-ending fiscal year lands in the year it mostly covers.
const moved = factsTable({
  cik: 3,
  entityName: "Switch Co",
  facts: {
    "us-gaap": {
      Revenues: { units: { USD: [{ start: "2017-01-01", end: "2017-12-31", val: 100, fy: 2017, fp: "FY", form: "10-K", filed: "2018-02-01" }] } },
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ start: "2018-01-01", end: "2018-12-31", val: 120, fy: 2018, fp: "FY", form: "10-K", filed: "2019-02-01" }, { start: "2025-02-01", end: "2026-01-31", val: 300, fy: 2025, fp: "FY", form: "10-K", filed: "2026-03-20" }, { start: "2025-11-01", end: "2026-01-31", val: 90, fy: 2025, fp: "FY", form: "10-K", filed: "2026-03-20" }, { start: "2025-02-01", end: "2025-10-31", val: 210, fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-12-01" }] } },
    },
  },
});
check("concepts merge across a name change; a January year end is the year before", moved.annual.revenue["2017"] === 100 && moved.annual.revenue["2018"] === 120 && moved.annual.revenue["2025"] === 300 && moved.quarterly.revenue["2025Q4"] === 90, JSON.stringify(moved.annual.revenue));
// --- The segment note: the engine from the filing itself ----------------------------
const recent = { filings: { recent: { accessionNumber: ["0000000001-26-000090", "0000000001-26-000080", "0000000001-26-000070"], form: ["8-K", "10-Q", "10-K"], reportDate: ["2026-08-01", "2026-06-30", "2025-12-31"], filingDate: ["2026-08-02", "2026-07-30", "2026-02-10"] } } };
check("the latest periodic filing is the newest 10-Q, 10-K, 20-F or 40-F, its accession without dashes", (() => { const f = latestFilingOf(recent); return f?.form === "10-Q" && f.accession === "000000000126000080" && f.reportDate === "2026-06-30"; })());
check("the two newest periodic filings are kept for the failover, the latest first", periodicFilingsOf(recent).map((f) => f.form).join(",") === "10-Q,10-K" && periodicFilingsOf(recent)[1].accession === "000000000126000070" && periodicFilingsOf({ filings: { recent: { accessionNumber: ["1"], form: ["8-K"] } } }).length === 0);
check("a company with only 8-Ks has no filing to read; a document that is not a list throws", latestFilingOf({ filings: { recent: { accessionNumber: ["1"], form: ["8-K"] } } }) === null && (() => { try { latestFilingOf({ filings: { recent: {} } }); return false; } catch { return true; } })());
check("the instance is the _htm.xml the SEC extracts, else a plain dated xml, else nothing", instanceFileOf({ directory: { item: [{ name: "R1.htm" }, { name: "nwnd-20260630_cal.xml" }, { name: "nwnd-20260630_htm.xml" }] } }) === "nwnd-20260630_htm.xml" && instanceFileOf({ directory: { item: [{ name: "nwnd-20260630.xml" }, { name: "nwnd-20260630_lab.xml" }] } }) === "nwnd-20260630.xml" && instanceFileOf({ directory: { item: [{ name: "index.htm" }] } }) === null);
check("a member reads as words", memberName("nwnd:NorthwindCloudSegmentMember") === "Northwind Cloud" && memberName("amzn:AWSSegmentMember") === "AWS" && memberName("srt:NorthAmericaMember") === "North America");
check("a name a filer ran together is split into words only when every part is a known word (Hamza, 6 Nov 2026)", memberName("bkng:AdvertisingandotherrevenuesMember") === "Advertising and other revenues" && memberName("bkng:MerchantRevenueMember") === "Merchant Revenue" && memberName("x:TransportationMember") === "Transportation" && memberName("x:ExpandingmarketsMember") === "Expandingmarkets", [memberName("bkng:AdvertisingandotherrevenuesMember"), memberName("x:ExpandingmarketsMember")].join(" | "));
const seg = segmentRead(readFileSync("data/samples/edgar_instance_sample.xml", "utf8"), "10-Q")!;
check("the instance reads as the quarter, with the company total from the undimensioned fact", seg !== null && seg.period === "quarter to 2026-06-30" && seg.periodDays === 90 && seg.totalRevenue === 340e6 && seg.form === "10-Q", JSON.stringify(seg && { period: seg.period, days: seg.periodDays, total: seg.totalRevenue }));
check("segments first, largest first, then revenue lines; eliminations and two-dimension facts are not lines", seg.lines.map((l) => l.name).join(",") === "Retail,Northwind Cloud,Installed Base Service,Subscriptions", seg.lines.map((l) => l.name).join(","));
const cloud = seg.lines.find((l) => l.name === "Northwind Cloud")!;
check("a segment behind the operating-segments item reads with its prior year, growth and share", cloud.value === 75e6 && cloud.prior === 50e6 && near(cloud.growthPct!, 50) && near(cloud.sharePct!, 22.059) && cloud.excluded === null, JSON.stringify(cloud));
check("a line with no prior-year figure has no growth, never zero", seg.lines.find((l) => l.name === "Subscriptions")!.growthPct === null && seg.lines.find((l) => l.name === "Subscriptions")!.prior === null);
check("an installed-base service line is marked excluded under C3(a)", /installed-base service line \(C3\(a\)\)/.test(seg.lines.find((l) => l.name === "Installed Base Service")!.excluded ?? ""));
const eng = engineOf(seg, 13.537);
check("lines read from the previous filing say so in the engine note and the facts", (() => { const prev = { ...seg, fallback: "read from the previous 10-K (year to 2025-12-31) because the latest filing could not be: The latest 10-Q carries no XBRL instance to read segments from" }; return engineOf(prev, 13.537).notes.some((n) => /^engine: read from the previous 10-K/.test(n)) && /an earlier filing: the latest could not be read/.test(segmentText(prev, "USD")); })());
check("the engine is the fastest line at least 15% of revenue growing above 20%, over company growth", near(eng.values.engine_growth_pct!, 50) && near(eng.values.engine_share_pct!, 22.059) && eng.line?.name === "Northwind Cloud" && eng.notes.some((n) => /engine: Northwind Cloud, 22\.1% of revenue, \+50\.0% over the quarter to 2026-06-30.*C3\(b\).*yours to check/.test(n)), eng.notes.join("; "));
check("the excluded service line never becomes the engine even when it grows fastest", engineOf({ ...seg, lines: seg.lines.filter((l) => l.name !== "Northwind Cloud") }, 13.537).values.engine_growth_pct === 13.537 && engineOf({ ...seg, lines: seg.lines.filter((l) => l.name !== "Northwind Cloud") }, 13.537).notes.some((n) => /Installed Base Service excluded as installed-base service, C3\(a\)/.test(n)));
check("company growth stands when it is the faster; its share is 100", engineOf(seg, 60).values.engine_growth_pct === 60 && engineOf(seg, 60).values.engine_share_pct === 100 && engineOf(seg, 60).line === null);
check("no instance, or a read that failed, leaves company growth with a sentence; no growth at all is no reading", engineOf(null, 11).values.engine_growth_pct === 11 && engineOf(null, 11).notes.some((n) => /has no segment or revenue line; company revenue growth stands in/.test(n)) && engineOf(null, 11, "SEC EDGAR could not be reached for the filing index").notes.some((n) => /could not be reached.*stands in/.test(n)) && engineOf(null, null).values.engine_growth_pct === null && engineOf(null, null).notes.some((n) => /no reading/.test(n)));
check("the engine lays on the fundamentals with its notes", (() => { const w = withEngine({ values: { revenue_growth_pct: 13.537 }, notes: ["x"] }, eng); return near(w.values.engine_growth_pct!, 50) && w.values.revenue_growth_pct === 13.537 && w.notes.length === 2; })());
check("the lines as text name the period, the total, each figure, growth, share and exclusion", /quarter to 2026-06-30 against a year before, in USD; company revenue 340m/.test(segmentText(seg, "USD")) && /- Northwind Cloud: 75m \(prior 50m, \+50\.0%\), 22\.1% of revenue/.test(segmentText(seg, "USD")) && /Installed Base Service \(revenue line\): 68m.*installed-base service line/.test(segmentText(seg, "USD")) && /Subscriptions \(revenue line\): 30m \(no prior-year figure\)/.test(segmentText(seg, "USD")) && /none in the latest filing/.test(segmentText(null, "USD")), segmentText(seg, "USD"));
{
  // A 20-F filer's segments sit on IFRS's own axis (27 Oct 2026: SPOT's Premium and Ad-Supported read as none).
  const ctx = (id: string, start: string, end: string, dims: string) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:segment>${dims}</xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
  const dim = (axis: string, member: string) => `<xbrldi:explicitMember dimension="${axis}">${member}</xbrldi:explicitMember>`;
  const ifrs = [
    ctx("t", "2025-01-01", "2025-12-31", ""),
    ctx("p", "2025-01-01", "2025-12-31", dim("ifrs-full:SegmentsAxis", "spot:PremiumMember")),
    ctx("a", "2025-01-01", "2025-12-31", dim("ifrs-full:SegmentsAxis", "spot:AdSupportedMember")),
    ctx("p0", "2024-01-01", "2024-12-31", dim("ifrs-full:SegmentsAxis", "spot:PremiumMember")),
    `<ifrs-full:Revenue contextRef="t">17000</ifrs-full:Revenue><ifrs-full:Revenue contextRef="p">15000</ifrs-full:Revenue><ifrs-full:Revenue contextRef="a">2000</ifrs-full:Revenue><ifrs-full:Revenue contextRef="p0">12500</ifrs-full:Revenue>`,
  ].join("");
  const read = segmentRead(ifrs, "20-F");
  check("a 20-F's segments on IFRS's axis are read, with the year before and the share", read?.lines.length === 2 && read.lines[0]!.name === "Premium" && Math.round(read.lines[0]!.growthPct!) === 20 && Math.round(read.lines[0]!.sharePct!) === 88, JSON.stringify(read?.lines));
}
{
  // Revenue by segment over time (Hamza, 4 Nov 2026, after Qualtrim): quarters and years from several filings, the fourth quarter derived.
  const ctx = (id: string, start: string, end: string, dims: string) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:segment>${dims}</xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
  const dim = (member: string) => `<xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">${member}</xbrldi:explicitMember>`;
  const fact = (id: string, v: number) => `<us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="${id}" unitRef="usd">${v}</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>`;
  const instance = (periods: { start: string; end: string; a: number; b: number }[]) =>
    `<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>` +
    periods.map((p, i) => [ctx(`t${i}`, p.start, p.end, ""), ctx(`a${i}`, p.start, p.end, dim("x:AlphaSegmentMember")), ctx(`b${i}`, p.start, p.end, dim("x:BetaSegmentMember")), fact(`t${i}`, p.a + p.b), fact(`a${i}`, p.a), fact(`b${i}`, p.b)].join("")).join("");
  // Three 10-Qs, each with its quarter and the one a year before (and a nine months, left out), and the 10-K's years.
  const q3 = segmentSeriesOf(instance([{ start: "2026-07-01", end: "2026-09-30", a: 70, b: 40 }, { start: "2025-07-01", end: "2025-09-30", a: 60, b: 30 }, { start: "2026-01-01", end: "2026-09-30", a: 200, b: 110 }]));
  const q2 = segmentSeriesOf(instance([{ start: "2026-04-01", end: "2026-06-30", a: 66, b: 38 }, { start: "2025-04-01", end: "2025-06-30", a: 55, b: 28 }]));
  const q1 = segmentSeriesOf(instance([{ start: "2026-01-01", end: "2026-03-31", a: 64, b: 32 }, { start: "2025-01-01", end: "2025-03-31", a: 50, b: 25 }]));
  const k = segmentSeriesOf(instance([{ start: "2025-01-01", end: "2025-12-31", a: 230, b: 115 }, { start: "2024-01-01", end: "2024-12-31", a: 180, b: 90 }]));
  check("an instance reads its quarters and years on a segment axis with their totals, never the nine months", q3.family.segment.length === 2 && q3.family.segment.every((p) => p.kind === "quarter" && p.total === [...p.lines.values()].reduce((a, b) => a + b, 0)) && q3.currency === "USD" && k.family.segment.every((p) => p.kind === "year"), JSON.stringify(q3.family.segment.map((p) => [p.end, p.kind])));
  const merged = mergeSegmentSeries([q3, q2, q1, k]).segment!;
  const q4 = merged.quarters.find((p) => p.end === "2025-12-31");
  check("the fourth quarter is the year less its first three, line by line, and marked derived", !!q4 && q4.derived && q4.lines.find((l) => l.name === "Alpha")?.value === 230 - 50 - 55 - 60 && q4.lines.find((l) => l.name === "Beta")?.value === 115 - 25 - 28 - 30 && q4.total === 345 - 75 - 83 - 90, JSON.stringify(q4));
  check("quarters run oldest first to the latest, years the same; a filed quarter is never derived", merged.quarters.map((p) => p.end).join(",") === "2025-03-31,2025-06-30,2025-09-30,2025-12-31,2026-03-31,2026-06-30,2026-09-30" && merged.quarters.filter((p) => p.derived).length === 1 && merged.years.map((p) => p.end).join(",") === "2024-12-31,2025-12-31", merged.quarters.map((p) => p.end).join(","));
  check("a period restated in a later filing takes the later figures", mergeSegmentSeries([segmentSeriesOf(instance([{ start: "2025-07-01", end: "2025-09-30", a: 61, b: 30 }])), q3]).segment!.quarters[0].lines[0].value === 61);
  check("a single line on the axis is no split; a split past the total is a mix of axes and left out", segmentSeriesOf(`${ctx("t", "2026-01-01", "2026-03-31", "")}${ctx("a", "2026-01-01", "2026-03-31", dim("x:AlphaSegmentMember"))}${fact("t", 10)}${fact("a", 10)}`).family.segment.length === 0 && segmentSeriesOf(instance([{ start: "2026-01-01", end: "2026-03-31", a: 10, b: 5 }]).replace(/>15</, ">12<")).family.segment.length === 0);
  check("text that is no instance throws", (() => { try { segmentSeriesOf("<html>Not found</html>"); return false; } catch { return true; } })());
  check("the history reads the three latest 10-Qs and the latest annual report, newest first", segmentHistoryFilings([{ form: "10-Q", accession: "4", reportDate: "2026-09-30", filingDate: "2026-10-30" }, { form: "10-Q", accession: "3", reportDate: "2026-06-30", filingDate: "2026-07-30" }, { form: "10-Q", accession: "2", reportDate: "2026-03-31", filingDate: "2026-04-30" }, { form: "10-K", accession: "1", reportDate: "2025-12-31", filingDate: "2026-02-10" }, { form: "10-Q", accession: "0", reportDate: "2025-09-30", filingDate: "2025-10-30" }] as never).map((f) => f.accession).join(",") === "4,3,2,1");
  check("the history keeps in its schema", segmentHistorySchema.safeParse({ segment: merged, product: null, accessions: ["4", "3", "2", "1"], currency: "USD", readAt: "2026-11-04T06:00:00Z", note: null }).success);
  const chart = segmentChart(merged.quarters, "quarterly")!;
  check("the stacked chart labels each quarter, the largest line at the base, and names the derived quarter", chart.labels.join(",") === "Q1 25,Q2 25,Q3 25,Q4 25,Q1 26,Q2 26,Q3 26" && chart.parts.map((p) => p.label).join(",") === "Alpha,Beta" && chart.derived.join(",") === "Q4 25", JSON.stringify(chart.labels));
  check("each part's growth is on the same quarter a year before, none where it is not kept", Math.abs(chart.growth[0][6]! - ((70 - 60) / 60) * 100) < 0.1 && chart.growth[0][0] === null, JSON.stringify(chart.growth[0]));
  const many = segmentChart([0, 1].map((i) => ({ end: `202${5 + i}-12-31`, lines: ["A", "B", "C", "D", "E", "F"].map((n, j) => ({ name: n, value: 60 - j * 10 + i })) })), "annual")!;
  check("past four lines and one more, the rest fold into Other; years read FY", many.parts.map((p) => p.label).join(",") === "A,B,C,D,Other" && many.parts.at(-1)!.other && many.parts.at(-1)!.values[0] === 20 + 10 && many.labels.join(",") === "FY2025,FY2026", JSON.stringify(many.parts.map((p) => p.label)));
  check("one period is no chart", segmentChart([merged.quarters[0]], "quarterly") === null);
}

{
  // Places never mixed with what the company sells (Hamza, 5 Nov 2026: "geographic segments mixed with product and services segments ... two different sets of inputs for the graphs and pie charts").
  const ctx = (id: string, start: string, end: string, dims: string) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:segment>${dims}</xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
  const on = (axis: string, member: string) => `<xbrldi:explicitMember dimension="${axis}">${member}</xbrldi:explicitMember>`;
  const fact = (id: string, v: number) => `<us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="${id}" unitRef="usd">${v}</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>`;
  const SEG = "us-gaap:StatementBusinessSegmentsAxis";
  const PROD = "srt:ProductOrServiceAxis";
  const GEO = "srt:StatementGeographicalAxis";
  const build = (lines: [string, string, number][], total: number, start = "2026-07-01", end = "2026-09-30") =>
    `<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>${ctx("t", start, end, "")}${fact("t", total)}` + lines.map(([axis, member, v], i) => `${ctx(`c${i}`, start, end, on(axis, member))}${fact(`c${i}`, v)}`).join("");
  // A MercadoLibre: segments that are countries, product lines beside them.
  const meli = segmentSeriesOf(build([[SEG, "meli:BrazilMember", 55], [SEG, "meli:MexicoMember", 25], [SEG, "meli:OtherCountriesMember", 20], [PROD, "meli:CommerceServicesMember", 60], [PROD, "meli:FintechServicesMember", 40]], 100));
  check("segments that are all places are read as geography, never as segments; the products stay products", meli.family.segment.length === 0 && meli.family.geography.length === 1 && [...meli.family.geography[0].lines.keys()].join(",") === "Brazil,Mexico,Other countries" && [...meli.family.product[0].lines.keys()].join(",") === "Commerce Services,Fintech Services", JSON.stringify({ g: meli.family.geography.map((p) => [...p.lines.keys()]), s: meli.family.segment.length }));
  // An Amazon: segments that mix regions with a business, a geographic axis with a country inside its region.
  const amzn = segmentSeriesOf(build([[SEG, "amzn:NorthAmericaSegmentMember", 60], [SEG, "amzn:InternationalSegmentMember", 22], [SEG, "amzn:AmazonWebServicesSegmentMember", 18], [PROD, "amzn:OnlineStoresMember", 70], [PROD, "amzn:AWSMember", 30], [GEO, "country:US", 62], [GEO, "srt:AmericasMember", 66], [GEO, "country:DE", 14], [GEO, "amzn:RestOfWorldMember", 24]], 100));
  check("segments that mix places with a business are no split, and named", amzn.family.segment.length === 0 && amzn.mixed.length === 1 && amzn.mixed[0].join(",") === "North America,International,Amazon Web Services" && /mix places with businesses \(North America, International, Amazon Web Services\)/.test(mixedNote(amzn.mixed) ?? ""), JSON.stringify(amzn.mixed));
  check("the geographic axis is its own family, its lines made to add up: no country beside the region holding it", amzn.family.geography.length === 1 && [...amzn.family.geography[0].lines.keys()].sort().join(",") === "Germany,Rest of world,United States" && amzn.family.product.length === 1, JSON.stringify(amzn.family.geography.map((p) => [...p.lines])));
  check("a segment read marks each line's kind on its axis: a segment, a product, a place or a mix", (() => { const r = segmentRead(build([[SEG, "amzn:NorthAmericaSegmentMember", 60], [SEG, "amzn:AmazonWebServicesSegmentMember", 40], [PROD, "amzn:OnlineStoresMember", 70], [PROD, "amzn:AWSMember", 30]], 100), "10-Q")!; const m = segmentRead(build([[SEG, "meli:BrazilMember", 60], [SEG, "meli:MexicoMember", 40], [PROD, "meli:CommerceMember", 70]], 100), "10-Q")!; return r.lines.filter((l) => l.kind === "mixed").length === 2 && r.lines.filter((l) => l.kind === "product").length === 2 && m.lines.filter((l) => l.kind === "place").length === 2 && /\(place\)/.test(segmentText(m, "USD")) && /never call a place a segment/.test(segmentText(m, "USD")); })());
  const lines = (names: string[]) => names.map((name, i) => ({ name, sharePct: 50 - i * 5, growthPct: null }));
  check("the business donut takes one split: segments when they are their own, else products, never a place", businessLines([...lines(["North America", "International"]).map((l) => ({ ...l, kind: "mixed" as const })), ...lines(["Online stores", "AWS"]).map((l) => ({ ...l, kind: "product" as const }))])?.kind === "product" && businessLines([...lines(["Brazil", "Mexico"]).map((l) => ({ ...l, kind: "place" as const })), ...lines(["Commerce", "Fintech"]).map((l) => ({ ...l, kind: "product" as const }))])!.lines.map((l) => l.name).join(",") === "Commerce,Fintech");
  check("lines kept before their kind are told apart by their names, then cut where the shares pass the whole", businessLines([{ name: "Americas", sharePct: 50, growthPct: null }, { name: "Europe", sharePct: 35, growthPct: null }, { name: "Asia Pacific, Middle East and Africa", sharePct: 15, growthPct: null }, { name: "Business to business", sharePct: 60, growthPct: null }, { name: "Direct to consumer", sharePct: 40, growthPct: null }])!.lines.map((l) => l.name).join(",") === "Business to business,Direct to consumer" && businessLines([{ name: "Family of Apps", sharePct: 98, growthPct: null }, { name: "Reality Labs", sharePct: 2, growthPct: null }, { name: "Advertising", sharePct: 97, growthPct: null }])!.lines.length === 2);
  const year = (end: string, names: string[]) => ({ end, total: 100, lines: names.map((n, i) => ({ name: n, value: 60 - i * 20 })), derived: false });
  const keptBefore = segmentHistorySchema.parse({ segment: { quarters: [], years: [year("2024-12-31", ["Americas", "Europe", "Asia Pacific, Middle East and Africa"]), year("2025-12-31", ["Americas", "Europe", "Asia Pacific, Middle East and Africa"])] }, product: { quarters: [], years: [year("2024-12-31", ["Business to business", "Direct to consumer"]), year("2025-12-31", ["Business to business", "Direct to consumer"])] }, accessions: ["1"], currency: "EUR", readAt: "2026-11-04T06:00:00Z" });
  const sep = separateHistory(keptBefore);
  check("a history kept before is separated by its names: segments that are places become the geography", keptBefore.version === 1 && sep.segment === null && sep.geography?.years.length === 2 && sep.product?.years.length === 2);
  const mixedKept = separateHistory({ ...keptBefore, segment: { quarters: [], years: [year("2025-12-31", ["North America", "International", "Amazon Web Services"])] } });
  check("a kept history whose segments mix places with a business drops them, with a note", mixedKept.segment === null && mixedKept.geography === null && /mix places with businesses/.test(mixedKept.note ?? ""));
  check("a history read under the current version passes as it is, and is read again from the filings when older", separateHistory({ ...keptBefore, version: SEGMENT_HISTORY_VERSION }).segment !== null && /kept\.version >= SEGMENT_HISTORY_VERSION/.test(readFileSync("lib/edgar.ts", "utf8")));
  const page = readFileSync("app/(app)/company/[symbol]/page.tsx", "utf8");
  check("the company page draws what it sells and where each as a chart over time, and no donut (Hamza, 7 Nov 2026)", segmentFamilies(keptBefore).join(",") === "product,geography" && /only=\{sells\}/.test(page) && /only=\{\["geography"\]\}/.test(page) && !/<CompanySegments|<CompanyGeography|<Donut\b/.test(page));
  check("the segment chart has a geography tab of its own, and the flow's sources are never places", /geography: "By geography"/.test(readFileSync("components/company/segment-revenue.tsx", "utf8")) && /separateHistory\(given\)/.test(readFileSync("lib/income-flow.ts", "utf8")));
}
check("an instance with contexts but no segment line is null; text that is no instance throws", segmentRead("<xbrli:context id=\"c\"><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period></xbrli:context><us-gaap:Revenues contextRef=\"c\">5</us-gaap:Revenues>", "10-Q") === null && (() => { try { segmentRead("<html><body>Not found</body></html>", "10-Q"); return false; } catch { return true; } })());
check("a filings entry written before the engine was read carries company growth as the engine", entryValues({ symbol: "X", ticker: "X", cik: 1, name: "X", readAt: "2026-10-01T00:00:00Z", latestQuarter: "2026Q2", values: { revenue_growth_pct: 12 }, notes: [], error: null }).engine_growth_pct === 12 && entryValues({ symbol: "X", ticker: "X", cik: 1, name: "X", readAt: "2026-10-01T00:00:00Z", latestQuarter: "2026Q2", values: { revenue_growth_pct: 12, engine_growth_pct: 30 }, notes: [], error: null }).engine_growth_pct === 30 && entryValues({ symbol: "X", ticker: "X", cik: 1, name: "X", readAt: "2026-10-01T00:00:00Z", latestQuarter: "2026Q2", values: { revenue_growth_pct: null }, notes: [], error: null }).engine_share_pct === null);

// --- Revenue by geography ------------------------------------------------------
// Small fictional instances: contexts with a period and explicit members, revenue facts on them. Only the shape of a filing; no real filer's figures.
const xbrl = (facts: { concept?: string; prefix?: string; dims?: [string, string][]; start?: string; end?: string; value: number }[]) =>
  `<xbrl xmlns:xbrli="x" xmlns:xbrldi="y">${facts
    .map((f, i) => `<xbrli:context id="c${i}"><xbrli:entity><xbrli:segment>${(f.dims ?? []).map(([a, m]) => `<xbrldi:explicitMember dimension="${a}">${m}</xbrldi:explicitMember>`).join("")}</xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>${f.start ?? "2025-01-01"}</xbrli:startDate><xbrli:endDate>${f.end ?? "2025-12-31"}</xbrli:endDate></xbrli:period></xbrli:context><${f.prefix ?? "us-gaap"}:${f.concept ?? "Revenues"} contextRef="c${i}" unitRef="usd" decimals="-6">${f.value}</${f.prefix ?? "us-gaap"}:${f.concept ?? "Revenues"}>`)
    .join("")}</xbrl>`;
const GEO = "srt:StatementGeographicalAxis";
// A US filer: the United States and outside it, the year and the quarter before it, a prior year that must not be read.
const usFiler = geographyRead(
  xbrl([
    { value: 1000 },
    { dims: [[GEO, "country:US"]], value: 620 },
    { dims: [[GEO, "us-gaap:NonUsMember"]], value: 380 },
    { dims: [[GEO, "country:US"]], start: "2025-10-01", value: 170 },
    { dims: [[GEO, "country:US"]], start: "2024-01-01", end: "2024-12-31", value: 500 },
    { dims: [["srt:ProductOrServiceAxis", "nwnd:CloudMember"]], value: 300 },
  ]),
  "10-K",
)!;
check(
  "geography: a US filer's year reads the United States and outside it as shares of revenue, the quarter and the year before left out, a product line never a place",
  usFiler !== null && usFiler.period === "year to 2025-12-31" && usFiler.lines.length === 2 && usFiler.lines[0].name === "United States" && usFiler.lines[0].grain === "country" && near(usFiler.lines[0].sharePct, 62) && usFiler.lines[1].name === "Outside the US" && usFiler.lines[1].grain === "region" && near(usFiler.placedPct, 100) && !usFiler.partial && usFiler.note === null,
  JSON.stringify(usFiler?.lines),
);
// A foreign filer: IFRS axis, company members in its own words, an aggregate of three of them, and a segments axis whose members are businesses.
const foreign = geographyRead(
  xbrl([
    { prefix: "ifrs-full", concept: "Revenue", value: 2000 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:GeographicalAreasAxis", "abcd:ChinaMember"]], value: 600 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:GeographicalAreasAxis", "abcd:RestOfAsiaMember"]], value: 300 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:GeographicalAreasAxis", "abcd:EMEAMember"]], value: 400 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:GeographicalAreasAxis", "abcd:InternationalOperationsMember"]], value: 1300 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:GeographicalAreasAxis", "country:US"]], value: 700 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:SegmentsAxis", "abcd:LithographyMember"]], value: 1500 },
    { prefix: "ifrs-full", concept: "Revenue", dims: [["ifrs-full:SegmentsAxis", "abcd:ServicesMember"]], value: 500 },
  ]),
  "20-F",
)!;
check(
  "geography: a foreign filer's own members read in words (China, Rest of Asia, Europe, Middle East and Africa), the aggregate that overlaps them left out with a note, business segments never places",
  foreign !== null && foreign.lines.map((l) => `${l.name}:${l.grain}:${l.sharePct.toFixed(0)}`).join(",") === "United States:country:35,China:country:30,Europe, Middle East and Africa:region:20,Rest of Asia:region:15" && /International operations left out: it overlaps/.test(foreign.note ?? "") && !foreign.partial,
  JSON.stringify(foreign?.lines) + foreign?.note,
);
// A company that reports by country as its segments, with the operating-segments member beside it.
const bySegment = geographyRead(
  xbrl([
    { value: 100 },
    { dims: [["srt:ConsolidationItemsAxis", "srt:OperatingSegmentsMember"], ["us-gaap:StatementBusinessSegmentsAxis", "meli:BrazilSegmentMember"]], value: 55 },
    { dims: [["srt:ConsolidationItemsAxis", "srt:OperatingSegmentsMember"], ["us-gaap:StatementBusinessSegmentsAxis", "meli:MexicoSegmentMember"]], value: 25 },
    { dims: [["srt:ConsolidationItemsAxis", "srt:OperatingSegmentsMember"], ["us-gaap:StatementBusinessSegmentsAxis", "meli:OtherCountriesSegmentMember"]], value: 20 },
    { dims: [["us-gaap:StatementBusinessSegmentsAxis", "meli:BrazilSegmentMember"], ["srt:ProductOrServiceAxis", "meli:ProductMember"]], value: 10 },
  ]),
  "10-K",
)!;
check("geography: segments that are all places read as geography (Brazil, Mexico, Other countries); a fact on a second axis is not a line", bySegment !== null && bySegment.lines.map((l) => `${l.name}:${l.sharePct.toFixed(1)}`).join(",") === "Brazil:55.0,Mexico:25.0,Other countries:20.0", JSON.stringify(bySegment?.lines));
// Two splits of the same revenue on one axis, and a country inside a region: the set that adds up and names the most is kept.
const overlapping = geographyRead(
  xbrl([
    { value: 1000 },
    { dims: [[GEO, "abcd:UnitedStatesAndCanadaMember"]], value: 400 },
    { dims: [[GEO, "srt:EuropeMember"]], value: 250 },
    { dims: [[GEO, "srt:AsiaPacificMember"]], value: 250 },
    { dims: [[GEO, "abcd:RestOfWorldMember"]], value: 100 },
    { dims: [[GEO, "country:US"]], value: 350 },
    { dims: [[GEO, "abcd:WorldwideTotalMember"]], value: 1000 },
  ]),
  "10-K",
)!;
check("geography: a total member and a country inside a region are dropped, never counted twice; the four regions that add up stay", overlapping !== null && overlapping.lines.map((l) => l.name).join(",") === "United States and Canada,Europe,Asia Pacific,Rest of world" && near(overlapping.placedPct, 100) && /United States left out/.test(overlapping.note ?? ""), JSON.stringify(overlapping?.lines) + overlapping?.note);
check("geography: an instance with no geographic axis gives nothing, never 100% unknown; text that is no instance throws", geographyRead(xbrl([{ value: 10 }, { dims: [["srt:ProductOrServiceAxis", "x:AdsMember"]], value: 7 }]), "10-K") === null && (() => { try { geographyRead("<html>Not found</html>", "10-K"); return false; } catch { return true; } })());
const part = reconcileGeography([{ name: "United States", grain: "country", value: 50 }, { name: "Germany", grain: "country", value: 10 }], 100)!;
check("geography: lines that place only part of revenue are kept as given and the company is partial, the rest not placed", part.partial && near(part.placedPct, 60) && near(part.lines[0].sharePct, 50) && /place 60\.0% of revenue/.test(part.note ?? ""));
const noTotal = reconcileGeography([{ name: "Americas", grain: "region", value: 60 }, { name: "United States", grain: "country", value: 40 }, { name: "Other Americas", grain: "region", value: 20 }, { name: "Europe", grain: "region", value: 40 }], null)!;
check("geography: without a company total, a line that is the sum of others is dropped and the shares are of the lines", noTotal.lines.map((l) => `${l.name}:${l.sharePct.toFixed(1)}`).join(",") === "United States:40.0,Europe:40.0,Other Americas:20.0" && /Americas left out as the sum/.test(noTotal.note ?? ""), JSON.stringify(noTotal));
check("geography: members read in words, at their grain", placeOf("country:KR").name === "South Korea" && placeOf("country:GB").name === "United Kingdom" && placeOf("srt:AsiaPacificMember").name === "Asia Pacific" && placeOf("us-gaap:NonUsMember").name === "Outside the US" && placeOf("asml:ChinaMember").grain === "country" && placeOf("meli:BrazilSegmentMember").name === "Brazil" && placeOf("goog:EMEAMember").name === "Europe, Middle East and Africa" && placeOf("amzn:RestOfWorldMember").name === "Rest of world" && placeOf("x:USMember").name === "United States" && placeOf("srt:EuropeMember").grain === "region");
const periodic = { filings: { recent: { accessionNumber: ["a3", "a2", "a1", "a0"], form: ["10-Q", "10-Q", "10-K", "10-Q"], reportDate: ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"] } } };
check("geography: read from the latest annual filing, else the latest 10-Q", geographyFilingOf(periodic)?.accession === "a1" && geographyFilingOf({ filings: { recent: { accessionNumber: ["q"], form: ["10-Q"] } } })?.form === "10-Q" && geographyFilingOf({ filings: { recent: { accessionNumber: ["e"], form: ["8-K"] } } }) === null);
const kept = revenueGeographyOf(usFiler, "0000000001-26-000004");
const geoBook = applyFilings(
  { asOf: "2026-10-12", holdings: [{ id: "a", symbol: "NWND", name: "Northwind", assetClass: "equity", account: "x", currency: "USD", quantity: 1, price: 200, value: 200, sector: null, country: null, themes: [], fundamentals: {} }] as never, lookThrough: [], transactions: [], fx: { base: "USD", rates: {}, asOf: "2026-10-12", source: "x" } },
  filingsFileSchema.parse({ version: 1, updated: "2026-10-12T00:00:00.000Z", bySymbol: { NWND: { symbol: "NWND", ticker: "NWND", cik: 1, name: "Northwind", readAt: "2026-10-12T00:00:00.000Z", latestQuarter: "2026Q2", revenueGeography: kept, values: {}, notes: [], error: null } } }),
);
check("geography: the filings file keeps the split with its form, period and accession, and lays it on the holding", geoBook.holdings[0].revenueGeography?.form === "10-K" && geoBook.holdings[0].revenueGeography?.accession === "0000000001-26-000004" && geoBook.holdings[0].revenueGeography?.lines[0].name === "United States");
const showcaseFilings = filingsFileSchema.parse(read("showcase.filings.json"));
check("the showcase's filings carry each company's split from its latest annual filing, each adding up to its revenue", Object.values(showcaseFilings.bySymbol).every((e) => e.revenueGeography && ["10-K", "20-F", "40-F"].includes(e.revenueGeography.form) && near(e.revenueGeography.placedPct, 100, 0.01) && !e.revenueGeography.partial && /^\d{10}-\d{2}-\d{6}$/.test(e.revenueGeography.accession ?? "")), Object.values(showcaseFilings.bySymbol).filter((e) => !e.revenueGeography).map((e) => e.symbol).join(","));

// --- The company profile and its sector --------------------------------------------
const profile = companyProfileOf({ cik: 1018724, name: "AMAZON COM INC", sic: "5961", sicDescription: "Retail-Catalog & Mail-Order Houses", fiscalYearEnd: "1231", filings: { recent: {} } });
check("the profile reads the industry code, its description and the year end", profile.sic === 5961 && profile.industry === "Retail-Catalog & Mail-Order Houses" && profile.fiscalYearEnd === "1231", JSON.stringify(profile));
const nl = companyProfileOf({ sic: "3559", addresses: { business: { stateOrCountry: "P7", stateOrCountryDescription: "NETHERLANDS" } } });
check("the profile reads the country of the business address: a state is the United States, a province of Canada is Canada, another in title case, none is null", profile.country === null && nl.country === "Netherlands" && countryOfAddress("WA", "WA") === "United States" && countryOfAddress("A6", "ONTARIO, CANADA") === "Canada" && countryOfAddress("M5", "KOREA, REPUBLIC OF") === "Korea, Republic of" && countryOfAddress(null, null) === null, `${nl.country} ${countryOfAddress("M5", "KOREA, REPUBLIC OF")}`);
check("a profile with no code is null, never zero", companyProfileOf({ sic: "", sicDescription: "" }).sic === null && companyProfileOf({ sic: "" }).industry === null);
try {
  companyProfileOf(null);
  check("a document that is not a profile throws", false);
} catch {
  check("a document that is not a profile throws", true);
}
check(
  "the SEC industry code maps to a GICS-style sector: retail, platforms, drugs, brokers, chip tools, footwear, travel",
  sectorOfSic(5961) === "Consumer Discretionary" && sectorOfSic(7370) === "Communication Services" && sectorOfSic(7372) === "Information Technology" && sectorOfSic(2834) === "Health Care" && sectorOfSic(6211) === "Financials" && sectorOfSic(3559) === "Information Technology" && sectorOfSic(3140) === "Consumer Discretionary" && sectorOfSic(4700) === "Consumer Discretionary" && sectorOfSic(6282) === "Financials" && sectorOfSic(7389) === "Industrials" && sectorOfSic(4911) === "Utilities" && sectorOfSic(6798) === "Real Estate",
  [5961, 7370, 7372, 2834, 6211, 3559, 3140, 4700, 6282, 7389].map((c) => `${c}:${sectorOfSic(c)}`).join(" "),
);
check("a code outside the table or none at all is null", sectorOfSic(9721) === null && sectorOfSic(null) === null && sectorOfSic(undefined) === null && sectorOfSic(NaN) === null);
const sectorBook = applyFilings(
  { asOf: "2026-10-12", holdings: [{ id: "a", symbol: "AMZN", name: "Amazon", assetClass: "equity", account: "x", currency: "USD", quantity: 1, price: 200, value: 200, sector: null, country: null, themes: [], fundamentals: {} }, { id: "b", symbol: "XYZ", name: "Own", assetClass: "equity", account: "x", currency: "USD", quantity: 1, price: 10, value: 10, sector: "Utilities", country: null, themes: [], fundamentals: {} }] as never, lookThrough: [], transactions: [], fx: { base: "USD", rates: {}, asOf: "2026-10-12", source: "x" } },
  { version: 1, updated: "2026-10-12T00:00:00.000Z", bySymbol: { AMZN: { symbol: "AMZN", ticker: "AMZN", cik: 1, name: "Amazon", readAt: "2026-10-12T00:00:00.000Z", latestQuarter: "2026Q2", period: "TTM to 2026Q2", sic: 5961, industry: "Retail", country: "United States", sector: "Consumer Discretionary", values: { revenue_growth_pct: 11 }, notes: [], error: null }, XYZ: { symbol: "XYZ", ticker: "XYZ", cik: 2, name: "Own", readAt: "2026-10-12T00:00:00.000Z", latestQuarter: null, sic: 4911, industry: "Electric", sector: "Utilities", values: {}, notes: [], error: null } } },
);
check("filings lay the sector and the country on a holding that has none; a sector the source supplied stays", sectorBook.holdings[0].sector === "Consumer Discretionary" && sectorBook.holdings[0].country === "United States" && sectorBook.holdings[1].country === null && sectorBook.holdings[1].sector === "Utilities" && sectorBook.holdings[0].fundamentals?.revenue_growth_pct === 11);
const sw = sectorWeights([{ symbol: "AMZN", weight: 14.5, sector: "Consumer Discretionary" }, { symbol: "MELI", weight: 3.7, sector: "Consumer Discretionary" }, { symbol: "NEW", weight: 2, sector: null }, { symbol: "MA", weight: 10.3, sector: "Industrials" }]);
check("sector weights sum per sector, largest first, the unread last", sw.map((s) => `${s.sector}:${s.weight.toFixed(1)}`).join(" ") === "Consumer Discretionary:18.2 Industrials:10.3 No sector yet:2.0", sw.map((s) => `${s.sector}:${s.weight.toFixed(1)}`).join(" "));

try {
  factsTable({ hello: 1 });
  check("a non-facts document throws", false);
} catch (e) {
  check("a non-facts document throws", e instanceof Error && /company facts/.test(e.message));
}

// --- Families and templates -------------------------------------------------
const mDiv = methodologySchema.parse(read("methodology.dividend_growth.json"));
const mInd = methodologySchema.parse(read("methodology.individual.json"));
const mFam = methodologySchema.parse(read("methodology.family_office.json"));
check("a dividend methodology reads as fundamentals", familyOf(mDiv).family === "fundamentals", JSON.stringify(familyOf(mDiv).scores));
check("an options methodology reads as options", familyOf(mInd).family === "options", JSON.stringify(familyOf(mInd).scores));
check("a family investment policy reads as macro", familyOf(mFam).family === "macro", JSON.stringify(familyOf(mFam).scores));
for (const fam of FAMILIES) {
  const c = canonicalTemplate(fam);
  const ids = new Set(c.sections.map((s) => s.id));
  check(`${fam} template has unique ids and a conclusion`, ids.size === c.sections.length && ids.has("conclusion"));
  check(`${fam} template has a rules section`, c.sections.some((s) => s.tags.includes("rules")));
}
check("the fundamentals template has sixteen sections, core business first", canonicalTemplate("fundamentals").sections.length === 16 && canonicalTemplate("fundamentals").sections[0].id === "core-business");

const applied = templateFor(mDiv, null, "USD");
const classification = applied.sections.find((s) => s.id === "classification")!;
check("classes amend the classification section", classification.amendments.filter((a) => a.startsWith("Class ")).length === 3, classification.amendments.join(" | "));
check("rules reading fundamentals amend it with their section and test", classification.amendments.some((a) => a.startsWith("2.1:") && /at most 60/.test(a)) && classification.amendments.some((a) => a.startsWith("2.2:")), classification.amendments.join(" | "));
check("a rule on holdings weights does not amend a fundamentals study", !classification.amendments.some((a) => a.startsWith("1.2:")));
const optApplied = templateFor(mInd, null, "USD");
check("an options methodology's rules land in its checks", optApplied.sections.find((s) => s.id === "checks")!.amendments.length > 0, optApplied.notes.join(" "));
const famApplied = templateFor(mFam, null, "EUR");
check("a macro methodology's allocation rules land in positioning", famApplied.sections.find((s) => s.id === "positioning")!.amendments.length > 0);

const own = templateFromText("# Core Business\nWhat it sells.\n\n## Classification Test\nThresholds.\n\n3. Kill Signals\nWhen to sell.\n\nVALUATION\nDCF.\n", "My template", "fundamentals", "2026-10-12T00:00:00.000Z");
check("an uploaded template splits on #, ##, numbered and capital headings", own.sections.map((s) => s.id).join(",") === "core-business,classification-test,kill-signals,valuation", own.sections.map((s) => s.id).join(","));
check("uploaded headings get their tags", own.sections[1].tags.includes("classes") && own.sections[2].tags.includes("exit") && own.sections[3].tags.includes("valuation"));
check("the guidance is the text under the heading", own.sections[0].guidance === "What it sells.");
try {
  templateFromText("no headings here\njust text", "x", "quant", "2026-10-12T00:00:00.000Z");
  check("a document without headings throws", false);
} catch (e) {
  check("a document without headings throws", e instanceof Error && /heading/i.test(e.message));
}
const ownApplied = templateFor(mDiv, own, "USD");
check("the person's template replaces the canonical one and is still amended", ownApplied.template.origin === "uploaded" && ownApplied.sections[1].amendments.length > 0);

// --- Checks on the subject -------------------------------------------------
const today = "2026-10-12";
const book = subjectBook("NWND", "Northwind Instruments", v, 50, "USD", today);
check("the subject book validates with its fundamentals", bookSchema.safeParse(book).success && book.holdings[0].fundamentals?.payout_ratio_pct !== undefined);
const verdict = checkCompany(mDiv, "fundamentals", book, today);
check("the subject falls in the first fitting class", verdict.classLabel === "Dividend payer", String(verdict.classLabel));
const payout = verdict.checks.find((c) => c.rule.id === "payout");
const raises = verdict.checks.find((c) => c.rule.id === "raises");
check("payout 19% passes at most 60%", payout?.status === "pass" && payout.actual === "19.2%", `${payout?.status} ${payout?.actual}`);
check("five raises fail at least ten", raises?.status === "fail" && raises.actual === "5.00", `${raises?.status} ${raises?.actual}`);
check("the weight rule is not among a fundamentals study's checks", !verdict.checks.some((c) => c.rule.id === "position-cap"));
const bare = checkCompany(mDiv, "fundamentals", subjectBook("THEME", "A theme", {}, null, "USD", today), today);
check("without figures every check is not testable, never passing", bare.checks.length > 0 && bare.checks.every((c) => c.status === "n/a"));

// --- Studies ---------------------------------------------------------------
check("a ticker is recognised, a sentence is not", tickerOf("asml") === "ASML" && tickerOf("BRK.B") === "BRK.B" && tickerOf("US long bonds") === null);
const now = "2026-10-12T10:00:00.000Z";
let study = newStudy("abc123def456", "nwnd", "Does it pass?", applied, now);
check("a new study freezes the template and queues every section", study.ticker === "NWND" && study.subject === "NWND" && study.pending.length === 16 && study.status === "queued");
let file = withStudy(EMPTY_RESEARCH, study, now);
for (let i = 0; i < MAX_STUDIES + 2; i++) {
  const done = { ...newStudy(`a${String(i).padStart(11, "0")}`, `T${i}`, "", applied, now), status: "done" as const, pending: [] };
  file = withStudy(file, done, now);
}
check("the cap drops the oldest finished study and keeps the running one", file.studies.length === MAX_STUDIES && file.studies.some((s) => s.id === "abc123def456"));
const step1 = nextStep(study);
check(`a step is ${SECTIONS_PER_STEP} sections in order`, step1.length === SECTIONS_PER_STEP && step1[0].id === "core-business");
const groups = stepGroups(study);
check("a run writes every pending section in groups, side by side, in template order", groups.length === 4 && groups.map((g) => g.length).join() === "4,4,4,4" && groups[0][0].id === "core-business" && groups[3][3].id === "conclusion" && groups.flat().map((s) => s.id).join() === study.pending.join());
check("a queued study is touched when queued and is not stalled yet", study.touchedAt === now && !stalled(study, now));
const later = new Date(Date.parse(now) + (STALL_MINUTES + 1) * 60_000).toISOString();
check(`a running study untouched for ${STALL_MINUTES} minutes is stalled; a done one never`, stalled({ ...study, status: "running" }, later) && !stalled({ ...study, status: "done" }, later) && !stalled(study, new Date(Date.parse(now) + 60_000).toISOString()));
check("a study kept before touchedAt existed still reads", studySchema.safeParse(Object.fromEntries(Object.entries(study).filter(([k]) => k !== "touchedAt"))).success);
study = afterStep(study, Object.fromEntries(step1.map((s) => [s.id, `Text for ${s.title}.`])), now);
check("after a step the sections are kept and the rest stay pending", Object.keys(study.written).length === SECTIONS_PER_STEP && study.pending.length === 16 - SECTIONS_PER_STEP && study.status === "running" && study.touchedAt === now);
check("groups shrink as sections land, so Continue writes only the rest", stepGroups(study).flat().length === 16 - SECTIONS_PER_STEP);
let all = study;
while (all.pending.length) all = afterStep(all, Object.fromEntries(nextStep(all).map((s) => [s.id, "Done."])), now);
check("a study is done when nothing is pending", all.status === "done" && all.finishedAt === now);
{
  const stopped = { ...failStudy(study, "x", now), forResults: now.slice(0, 10) };
  const at = (h: number) => new Date(Date.parse(now) + h * 3_600_000).toISOString();
  check(`a results study that stopped is taken up again ${RETRY_HOURS} hours later, within ${RETRY_DAYS} days, and never one asked by hand`, !retryDue(stopped, at(RETRY_HOURS - 1)) && retryDue(stopped, at(RETRY_HOURS)) && !retryDue(stopped, at(RETRY_DAYS * 24 + 1)) && !retryDue({ ...stopped, forResults: null }, at(RETRY_HOURS)));
  const cut: typeof study = { ...study, status: "running", forResults: now.slice(0, 10), touchedAt: now, requestedAt: now };
  check(`a results study whose run is cut short is taken up again only within ${RETRY_DAYS} days of being asked, so one cut short every time is not run for good`, studyToTakeUp([cut], at(1))?.id === cut.id && studyToTakeUp([cut], at(RETRY_DAYS * 24 + 1)) === undefined && studyToTakeUp([{ ...cut, forResults: null }], at(1)) === undefined && studyToTakeUp([stopped], at(RETRY_HOURS))?.id === stopped.id);
}
check("an unknown section id is dropped", Object.keys(afterStep(study, { nope: "x" }, now).written).length === SECTIONS_PER_STEP);
const failed = failStudy(study, "SEC EDGAR could not be reached.", now);
check("a failure is a sentence on the study", failed.status === "failed" && failed.error === "SEC EDGAR could not be reached.");

// --- The writer's request --------------------------------------------------
const body = researchRequestBody(mDiv, { ...study, facts: factsText(t), verdict: { classId: "payer", classLabel: "Dividend payer", checks: [], classTests: [] } }, nextStep(study));
const text = JSON.stringify(body);
check("the request names the tool and the sections to write", /write_sections/.test(text) && /"- profitability:/.test(text) === false && /- moats: /.test(text));
check("the request carries the facts and the written sections, never a key", /Northwind/.test(text) && /Text for Core business/.test(text) && !/sk-ant/.test(text) && !/key/i.test(String(body.system)));
check("each writer sees the other sections written beside it and is told to keep off them", /written separately at the same time/.test(text) && /- Conclusion/.test(text) && !/- Core business\n/.test(text));
check("the instructions allow no figure beyond those given, and arithmetic only on two of them", /copied as given/.test(String(body.system)) && /add, subtract or divide two of those figures/.test(String(body.system)));
check("the request asks for the tool call instead of forcing it", (body.tool_choice as { type: string }).type === "auto" && /one call to write_sections/.test(String(body.system)));
const asked = nextStep(study).map((s) => s.id);
const good = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: { sections: asked.map((id) => ({ id, markdown: "Some text." })) } }] }, asked);
check("a full answer parses", good.ok && Object.keys(good.written).length === asked.length);
const partial = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: { sections: [{ id: asked[0], markdown: "Only one." }] } }] }, asked);
check("a partial answer keeps what came back and names the rest for Continue", partial.ok && Object.keys(partial.written).length === 1 && partial.missing.length === asked.length - 1);
const long = "Para one.\n\n" + "x".repeat(SECTION_CHARS) + "\n\nLast.";
const mixed = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: { sections: [{ id: asked[0], markdown: long }, { id: asked[1], markdown: "" }, { id: asked[2] }, { id: "not-asked", markdown: "Stray." }, ...asked.slice(3).map((id) => ({ id, markdown: "Fine." }))] } }] }, asked);
check("one bad section costs that section alone; a long one is cut to fit and says so", mixed.ok && mixed.written[asked[0]].length <= SECTION_CHARS && mixed.written[asked[0]].endsWith(CLIPPED_NOTE) && mixed.clipped.includes(asked[0]) && mixed.missing.join() === [asked[1], asked[2]].join() && !("not-asked" in mixed.written));
const tooLong = parseResearchResponse({ stop_reason: "max_tokens", content: [{ type: "tool_use", name: "write_sections", input: {} }] }, asked);
check("an answer cut for length is refused as cut, so the run asks for fewer sections", !tooLong.ok && tooLong.cut && /length/.test(tooLong.reason));
check("a long section is cut at a paragraph that fits", clipSection("a".repeat(100) + "\n\n" + "b".repeat(100), 160).startsWith("a".repeat(100) + "\n\n" + CLIPPED_NOTE.slice(0, 3)));
check("an answer without the tool call is refused", !parseResearchResponse({ content: [{ type: "text", text: "hi" }] }, asked).ok);
const asText = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: { sections: JSON.stringify(asked.map((id) => ({ id, markdown: "As text." }))) } }] }, asked);
check("sections sent as JSON text are read, not refused as no list", asText.ok && Object.keys(asText.written).length === asked.length);
const keyed = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: { sections: Object.fromEntries(asked.map((id) => [id, "Keyed."])) } }] }, asked);
check("sections keyed by id are read", keyed.ok && keyed.written[asked[0]] === "Keyed.");
const bareList = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: asked.map((id) => ({ id, markdown: "Bare." })) }] }, asked);
check("a bare list of sections is read", bareList.ok && Object.keys(bareList.written).length === asked.length);
check("an empty call is still refused with a reason", (() => { const r = parseResearchResponse({ content: [{ type: "tool_use", name: "write_sections", input: {} }] }, asked); return !r.ok && /no list/.test(r.reason); })());

// --- Share basis ---------------------------------------------------------------
check("continuous share counts carry no share-basis note", shareBasisNote(t) === "" && !/Share basis/.test(factsText(t)));
const splitYears = [...t.years];
const split = { ...t, annual: { ...t.annual, dilutedShares: Object.fromEntries(splitYears.map((y, i) => [y, i < 2 ? 25 : 250])) } };
check("a tenfold jump in diluted shares names the last year on the old basis", /through 2022 are on a different share basis/.test(shareBasisNote(split)) && /Share basis/.test(factsText(split)));

// --- Reading back -------------------------------------------------------------
const md = studyMarkdown({ ...all, facts: factsText(t), verdict: { classId: "payer", classLabel: "Dividend payer", checks: [{ ruleId: "payout", section: "2.1", text: "Payout under 60%", severity: "guideline", status: "pass", actual: "19.2%", limit: "60%", detail: "", figure: "Price to own valuation" }], classTests: [] } });
check("the Markdown has the title, the checks table and every section", /^# NWND/.test(md) && /\| 2.1 \| Payout under 60% \| Price to own valuation \| 60% \| 19.2% \| pass \|/.test(md) && /## Conclusion/.test(md) && /Not investment advice/.test(md));

// --- Research laid on the book -----------------------------------------------
const dani = bookSchema.parse(read("dani.book.json"));
const held = dani.holdings.find((h) => h.assetClass === "equity")!;
const researched = applyResearch(dani, { version: 1, updated: now, studies: [{ ...all, ticker: held.symbol, subject: held.symbol, fundamentals: { payout_ratio_pct: 35, dividend_years_raised: 12 } }] });
check("a finished study lays its fundamentals on the matching holding", researched.holdings.find((h) => h.id === held.id)?.fundamentals?.payout_ratio_pct === 35);
check("the book then supplies those fields", suppliedByBook(researched).has("payout_ratio_pct") && !suppliedByBook(dani).has("payout_ratio_pct"));
const payoutFigure = mDiv.figures.find((x) => x.id === "payout-ratio")!;
const before = computeFigure(payoutFigure, contextFor(dani, today, mDiv), ["ibkr"]);
const after = computeFigure(payoutFigure, contextFor(researched, today, mDiv), ["ibkr"]);
check("a fundamentals figure needs data before research and computes after", before.needs.length === 1 && after.needs.length === 0 && after.kind === "scalar" && after.value === 35, JSON.stringify({ before: before.needs, after }));

// --- One pass over every holding's filings ----------------------------------
{
  const symbols = readableSymbols(dani);
  check("readable symbols are the listed equities, once each", symbols.length > 0 && new Set(symbols).size === symbols.length && symbols.every((s) => dani.holdings.some((h) => h.symbol.toUpperCase() === s && h.assetClass === "equity")), symbols.join(","));
  const first = symbols[0];
  const file = filingsFileSchema.parse({
    version: 1,
    updated: "2026-10-12T14:00:00.000Z",
    bySymbol: {
      [first]: { symbol: first, ticker: first, cik: 1, name: "First Co", readAt: "2026-10-12T14:00:00.000Z", latestQuarter: "2026Q2", values: { roic_pct: 17.3, gross_margin_pct: 60 }, notes: [], error: null },
      ZZZZ: { symbol: "ZZZZ", ticker: null, cik: null, name: null, readAt: "2026-10-12T14:00:00.000Z", latestQuarter: null, values: {}, notes: [], error: "the SEC lists no company under this symbol" },
    },
  });
  const laid = applyFilings(dani, file);
  const h = laid.holdings.find((x) => x.symbol.toUpperCase() === first)!;
  check("filings lay their figures on the holding", h.fundamentals?.roic_pct === 17.3 && h.fundamentals?.gross_margin_pct === 60);
  const own = applyFilings({ ...dani, holdings: dani.holdings.map((x) => (x.symbol.toUpperCase() === first ? { ...x, fundamentals: { roic_pct: 20 } } : x)) }, file);
  check("a holding's own figure wins over the filings", own.holdings.find((x) => x.symbol.toUpperCase() === first)!.fundamentals?.roic_pct === 20);
  check("a failed read lays nothing", applyFilings(dani, file).holdings.every((x) => x.symbol !== "ZZZZ" || !x.fundamentals));
  check("an empty filings file changes nothing", applyFilings(dani, EMPTY_FILINGS) === dani && filingsSummary(null) === null);
  check("the summary counts reads and names failures", /read for 1 of 2 companies, holdings and watchlist, on 2026-10-12/.test(filingsSummary(file) ?? "") && /ZZZZ \(the SEC lists no company/.test(filingsSummary(file) ?? ""), filingsSummary(file) ?? "");
}

// --- Derived gross profit, a share count that is never differenced, GICS from an index list ------------
{
  const fy = (name: string, vals: Record<string, number>, unit = "USD") => ({ [name]: { units: { [unit]: Object.entries(vals).map(([y, val]) => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, filed: `${Number(y) + 1}-02-10` })) } } });
  const retailer = factsTable({ cik: 7, entityName: "Broadline Co", facts: { "us-gaap": { ...fy("Revenues", { 2024: 1000e6, 2025: 1200e6 }), ...fy("CostOfRevenue", { 2024: 600e6, 2025: 700e6 }), ...fy("NetIncomeLoss", { 2024: 50e6, 2025: 60e6 }) } } });
  check("gross profit is revenue less cost of revenue when no gross profit line is filed", retailer.annual.grossProfit["2025"] === 500e6 && retailer.annual.grossProfit["2024"] === 400e6 && !retailer.missing.includes("grossProfit") && retailer.derived.length === 1, JSON.stringify(retailer.annual.grossProfit));
  const rf = fundamentalsOf(retailer, null);
  check("the derived gross margin carries a note saying how it was built", near(rf.values.gross_margin_pct, 41.667) && rf.notes.some((n) => /gross_margin_pct: gross profit is revenue less cost of revenue/.test(n)), `${rf.values.gross_margin_pct} ${rf.notes.join("; ")}`);
  check("the facts text says what was derived", /Derived: gross profit is revenue less cost of revenue/.test(factsText(retailer)) && /Cost of revenue \| 600m/.test(factsText(retailer)));
  check("the fixture, which files gross profit, derives nothing", t.derived.length === 0 && !/Derived:/.test(factsText(t)));
  const neither = factsTable({ cik: 8, entityName: "Bank Co", facts: { "us-gaap": { ...fy("Revenues", { 2024: 100e6, 2025: 110e6 }) } } });
  check("with neither line the margin is null and the reason names both", fundamentalsOf(neither, null).values.gross_margin_pct === null && fundamentalsOf(neither, null).notes.some((n) => /neither gross profit nor cost of revenue/.test(n)));
  // A weighted average share count: three quarters, a nine-month and a full-year average, every one 100m shares.
  const q = (start: string, end: string, val: number) => ({ start, end, val, filed: "2026-03-01" });
  const shares = factsTable({
    cik: 9,
    entityName: "Even Co",
    facts: {
      "us-gaap": {
        Revenues: { units: { USD: [q("2025-01-01", "2025-03-31", 10e6), q("2025-04-01", "2025-06-30", 10e6), q("2025-07-01", "2025-09-30", 10e6), q("2025-01-01", "2025-09-30", 30e6), q("2025-01-01", "2025-12-31", 40e6), q("2024-01-01", "2024-03-31", 9e6), q("2024-04-01", "2024-06-30", 9e6), q("2024-07-01", "2024-09-30", 9e6), q("2024-01-01", "2024-12-31", 36e6)] } },
        WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [q("2025-01-01", "2025-03-31", 100e6), q("2025-04-01", "2025-06-30", 100e6), q("2025-07-01", "2025-09-30", 100e6), q("2025-01-01", "2025-09-30", 100e6), q("2025-01-01", "2025-12-31", 100e6), q("2024-01-01", "2024-03-31", 100e6), q("2024-04-01", "2024-06-30", 100e6), q("2024-07-01", "2024-09-30", 100e6), q("2024-01-01", "2024-12-31", 100e6)] } },
      },
    },
  });
  check("a flow is differenced (Q4 is the year less nine months)", shares.quarterly.revenue["2025Q4"] === 10e6 && shares.quarterly.revenue["2024Q4"] === 9e6, JSON.stringify(shares.quarterly.revenue));
  check("a share count is never differenced: the year's average stands for the fourth quarter", shares.quarterly.dilutedShares["2025Q4"] === 100e6 && shares.quarterly.dilutedShares["2024Q4"] === 100e6 && shares.ttm.dilutedShares === 100e6 && shares.priorTtm.dilutedShares === 100e6, JSON.stringify({ q: shares.quarterly.dilutedShares, ttm: shares.ttm.dilutedShares }));

  // Hamza's Claude's audit of 19 Oct 2026, over the connector: five ways the filings' figures went wrong.
  // 1. A 25-for-1 split (Booking, 2026): the 2026 10-Qs restate the 2025 quarters; the quarters they do not restate are put on today's count too.
  const d = (start: string, end: string, val: number, filed: string, fp = "Q1") => ({ start, end, val, filed, fp });
  const split = factsTable({
    cik: 10,
    entityName: "Lodging Co",
    facts: {
      "us-gaap": {
        Revenues: { units: { USD: [d("2025-01-01", "2025-03-31", 100e6, "2025-04-25"), d("2025-04-01", "2025-06-30", 110e6, "2025-07-25", "Q2"), d("2025-07-01", "2025-09-30", 120e6, "2025-10-25", "Q3"), d("2025-01-01", "2025-09-30", 330e6, "2025-10-25", "Q3"), d("2025-01-01", "2025-12-31", 450e6, "2026-02-20", "FY"), d("2026-01-01", "2026-03-31", 115e6, "2026-04-25"), d("2026-04-01", "2026-06-30", 125e6, "2026-07-25", "Q2")] } },
        EarningsPerShareDiluted: { units: { "USD/shares": [d("2025-01-01", "2025-03-31", 10.07, "2025-04-25"), d("2025-01-01", "2025-03-31", 0.4, "2026-04-25"), d("2025-04-01", "2025-06-30", 37.38, "2025-07-25", "Q2"), d("2025-04-01", "2025-06-30", 1.5, "2026-07-25", "Q2"), d("2025-07-01", "2025-09-30", 27.43, "2025-10-25", "Q3"), d("2025-01-01", "2025-09-30", 74.88, "2025-10-25", "Q3"), d("2025-01-01", "2025-12-31", 100, "2026-02-20", "FY"), d("2026-01-01", "2026-03-31", 1.1, "2026-04-25"), d("2026-04-01", "2026-06-30", 1.6, "2026-07-25", "Q2")] } },
        WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [d("2025-01-01", "2025-03-31", 33.093e6, "2025-04-25"), d("2025-01-01", "2025-03-31", 827e6, "2026-04-25"), d("2025-07-01", "2025-09-30", 32.5e6, "2025-10-25", "Q3"), d("2026-04-01", "2026-06-30", 810e6, "2026-07-25", "Q2")] } },
        CommonStockDividendsPerShareDeclared: { units: { "USD/shares": [d("2025-07-01", "2025-09-30", 9.6, "2025-10-25", "Q3"), d("2026-04-01", "2026-06-30", 0.4, "2026-07-25", "Q2")] } },
      },
    },
  });
  check("a split is read from a period filed twice at a whole-number ratio: 25 new shares per old one, from the restating filing", JSON.stringify(split.splits) === JSON.stringify([{ factor: 25, filed: "2026-04-25" }]), JSON.stringify(split.splits));
  check("per-share figures filed before the split are divided and share counts multiplied, so the trailing EPS is on one basis", near(split.quarterly.epsDiluted["2025Q3"], 1.0972, 0.001) && near(split.quarterly.epsDiluted["2025Q4"], (100 - 74.88) / 25, 0.001) && split.quarterly.epsDiluted["2026Q2"] === 1.6 && near(split.quarterly.dilutedShares["2025Q3"], 812.5e6) && near(split.ttm.epsDiluted!, 1.0972 + 1.0048 + 1.1 + 1.6, 0.01) && near(split.quarterly.dividendPerShare["2025Q3"], 0.384, 0.001), JSON.stringify({ eps: split.quarterly.epsDiluted, ttm: split.ttm.epsDiluted }));
  check("the split is said in the table and in the figures' notes", split.derived.some((x) => /25-for-1 split/.test(x)) && fundamentalsOf(split, 220).notes.some((n) => /25-for-1/.test(n)) && near(fundamentalsOf(split, 220).values.pe_ratio!, 220 / (1.0972 + 1.0048 + 1.1 + 1.6), 0.05), fundamentalsOf(split, 220).notes.join("; "));
  const restated = factsTable({ cik: 11, entityName: "Restated Co", facts: { "us-gaap": { EarningsPerShareDiluted: { units: { "USD/shares": [d("2025-01-01", "2025-03-31", 1.0, "2025-04-25"), d("2025-01-01", "2025-03-31", 0.9, "2026-04-25"), d("2025-04-01", "2025-06-30", 2.2, "2025-07-25", "Q2"), d("2025-04-01", "2025-06-30", 1.0, "2026-07-25", "Q2")] } } } } });
  check("a restatement off a whole number (0.9 of the figure, or 2.2 times) is not a split and nothing is adjusted", restated.splits.length === 0 && restated.quarterly.epsDiluted["2025Q1"] === 0.9 && restated.quarterly.epsDiluted["2025Q2"] === 1.0, JSON.stringify(restated.splits));
  check("a reverse split (1 for 10) reads below one and multiplies the per-share figures filed before it", JSON.stringify(splitsOf({ cik: 12, entityName: "", facts: { "us-gaap": { EarningsPerShareDiluted: { units: { "USD/shares": [d("2025-01-01", "2025-03-31", 0.1, "2025-04-25"), d("2025-01-01", "2025-03-31", 1.0, "2026-04-25")] } } } } }, "USD")) === JSON.stringify([{ factor: 0.1, filed: "2026-04-25" }]));
  // 2. Amazon's 10-Qs carry the trailing twelve months to each quarter; a twelve-month duration is a year only when a filing marks it FY.
  const rolling = factsTable({
    cik: 13,
    entityName: "Everything Co",
    facts: {
      "us-gaap": {
        NetIncomeLoss: { units: { USD: [d("2024-01-01", "2024-12-31", 80e9, "2025-02-05", "FY"), d("2025-01-01", "2025-12-31", 100e9, "2026-02-05", "FY"), d("2025-04-01", "2026-03-31", 110e9, "2026-05-01"), d("2025-07-01", "2026-06-30", 120e9, "2026-07-31", "Q2"), d("2026-01-01", "2026-03-31", 30e9, "2026-05-01"), d("2026-04-01", "2026-06-30", 35e9, "2026-07-31", "Q2"), d("2025-01-01", "2025-03-31", 20e9, "2025-05-01"), d("2025-04-01", "2025-06-30", 25e9, "2025-07-31", "Q2"), d("2025-07-01", "2025-09-30", 25e9, "2025-10-31", "Q3"), d("2025-01-01", "2025-09-30", 70e9, "2025-10-31", "Q3")] } },
      },
    },
  });
  check("a rolling twelve months in a 10-Q is not a fiscal year: FY2025 stays the 10-K's and no year is made of a quarter's trailing figure", JSON.stringify(rolling.annual.netIncome) === JSON.stringify({ 2024: 80e9, 2025: 100e9 }) && rolling.quarterly.netIncome["2025Q4"] === 30e9 && rolling.ttm.netIncome === 120e9 && rolling.years.join() === "2024,2025", JSON.stringify({ annual: rolling.annual.netIncome, ttm: rolling.ttm.netIncome }));
  check("the fixture, which marks every period, reads the same years as before", t.years.join() === "2021,2022,2023,2024,2025", t.years.join());
  // 3. A broker's total is RevenuesNetOfInterestExpense; its contract concept carries commissions alone (Interactive Brokers).
  const broker = factsTable({ cik: 14, entityName: "Broker Co", facts: { "us-gaap": { ...fy("RevenuesNetOfInterestExpense", { 2024: 5e9, 2025: 6.2e9 }, "USD"), ...fy("RevenueFromContractWithCustomerExcludingAssessedTax", { 2024: 2.1e9, 2025: 2.44e9 }, "USD"), ...fy("Revenues", { 2018: 1.9e9, 2019: 1.95e9 }, "USD") } } });
  check("net revenue is read before the contract concept, and the years before the net line began keep the total line", broker.annual.revenue["2025"] === 6.2e9 && broker.annual.revenue["2019"] === 1.95e9 && broker.concept.revenue === "RevenuesNetOfInterestExpense", JSON.stringify(broker.annual.revenue));
  // 4. A price in another currency than the filings' (a Novo Nordisk ADR in dollars, earnings in kroner) is no P/E.
  const adr = fundamentalsOf(t, 50, "DKK");
  const carried = fundamentalsOf(t, 7.5, "DKK", 0.15);
  check("with the day's rate (listing units per filing unit) the price is carried into the filings' currency: 7.5 DKK at 1 USD = 0.15 DKK is 50 USD, and the note names the rate", near(carried.values.pe_ratio, 24.038) && near(carried.values.dividend_yield_pct, 0.8) && carried.notes.some((n) => /pe_ratio, dividend_yield_pct: the price in DKK is read in USD at 1 USD = 0.15 DKK, one listed share taken as one filed share/.test(n)) && near(fundamentalsOf(t, 50, "USD", 7).values.pe_ratio, 24.038), JSON.stringify([carried.values.pe_ratio, carried.notes.filter((n) => /DKK/.test(n))]));
  check("a price in another currency than the filings leaves the P/E and the yield as none, and says which two currencies", adr.values.pe_ratio === null && adr.values.dividend_yield_pct === null && adr.notes.some((n) => /pe_ratio: the price is in DKK and the filings in USD; read as none/.test(n)) && near(fundamentalsOf(t, 50, "usd").values.pe_ratio, 24.038) && near(fundamentalsOf(t, 50).values.pe_ratio, 24.038), adr.notes.filter((n) => /currency|DKK/.test(n)).join("; "));
  // 5. A balance line last filed years before the trailing period (Uber's non-current securities, 2019) is none, not cash.
  const bal = (end: string, val: number, filed: string) => ({ end, val, filed, fp: "Q2" });
  const staleCo = factsTable({
    cik: 15,
    entityName: "Rides Co",
    facts: {
      "us-gaap": {
        Revenues: { units: { USD: [d("2025-07-01", "2025-09-30", 10e9, "2025-11-01", "Q3"), d("2025-01-01", "2025-09-30", 28e9, "2025-11-01", "Q3"), d("2025-01-01", "2025-12-31", 39e9, "2026-02-10", "FY"), d("2026-01-01", "2026-03-31", 11e9, "2026-05-05"), d("2026-04-01", "2026-06-30", 12e9, "2026-08-05", "Q2")] } },
        OperatingIncomeLoss: { units: { USD: [d("2025-07-01", "2025-09-30", 1e9, "2025-11-01", "Q3"), d("2025-01-01", "2025-09-30", 2.8e9, "2025-11-01", "Q3"), d("2025-01-01", "2025-12-31", 3.9e9, "2026-02-10", "FY"), d("2026-01-01", "2026-03-31", 1.1e9, "2026-05-05"), d("2026-04-01", "2026-06-30", 1.2e9, "2026-08-05", "Q2")] } },
        StockholdersEquity: { units: { USD: [bal("2026-06-30", 20e9, "2026-08-05")] } },
        LongTermDebt: { units: { USD: [bal("2026-06-30", 8e9, "2026-08-05")] } },
        CashAndCashEquivalentsAtCarryingValue: { units: { USD: [bal("2026-06-30", 5e9, "2026-08-05")] } },
        MarketableSecuritiesNoncurrent: { units: { USD: [bal("2019-09-30", 10.4e9, "2019-11-05"), bal("2019-06-30", 10e9, "2019-08-05")] } },
      },
    },
  });
  const staleF = fundamentalsOf(staleCo);
  check("a balance last reported before the trailing period is none: net debt counts the cash alone, and the note names the quarter it was last filed at", latestBalance(staleCo, "longTermInvestments") === null && lastReported(staleCo, "longTermInvestments") === "2019Q3" && staleF.values.net_debt === 3e9 && near(staleF.values.cash_to_debt_pct, 62.5) && staleF.notes.some((n) => n === "long-term investments: last reported at 2019Q3, before the trailing period; read as none"), JSON.stringify({ net: staleF.values.net_debt, notes: staleF.notes.filter((n) => /last reported/.test(n)) }));
  check("a balance within the trailing period is read as before, and the 20-F filer's year-end balance stands for its year", latestBalance(staleCo, "equity")?.quarter === "2026Q2" && latestBalance(ifrs, "equity")?.quarter === "2025Q4" && latestBalance(t, "cash")?.quarter === "2026Q2", JSON.stringify([latestBalance(staleCo, "equity"), latestBalance(ifrs, "equity")]));
  const page = `<html><body><table class="wikitable"><tr><th>Year</th><th>Change</th></tr><tr><td>2025</td><td>+1</td></tr></table>
<table id="constituents" class="wikitable sortable"><tbody><tr><th><a href="#">Symbol</a></th><th>Security</th><th>GICS Sector</th><th>GICS Sub-Industry</th><th>Headquarters Location</th></tr>
<tr><td><a href="/x">MA</a></td><td>Mastercard</td><td>Financials</td><td>Transaction &amp; Payment Processing Services</td><td>Purchase, New York</td></tr>
<tr><td>BRK.B</td><td>Berkshire Hathaway</td><td>Financials</td><td>Multi-Sector Holdings</td><td>Omaha, Nebraska</td></tr>
<tr><td>UBER</td><td>Uber</td><td>Industrials</td><td>Passenger Ground Transportation</td><td>San Francisco</td></tr>
<tr><td>ODD</td><td>Odd Co</td><td>Space Travel</td><td>Rockets</td><td>Nowhere</td></tr>
<tr><td>MA</td><td>Mastercard again</td><td>Industrials</td><td>Dup</td><td>x</td></tr></tbody></table></body></html>`;
  const gics = parseGicsTable(page);
  check("the constituents table is read: ticker in the SEC's spelling, official sector and sub-industry", gics.length === 3 && gics[0].ticker === "MA" && gics[0].sector === "Financials" && gics[0].subIndustry === "Transaction & Payment Processing Services" && gics[1].ticker === "BRK-B" && gics[2].sector === "Industrials", JSON.stringify(gics));
  check("the company's name is read beside its ticker", gics[0].name === "Mastercard" && gics[1].name === "Berkshire Hathaway");
  check("a sector the eleven do not name is skipped and the first row for a ticker wins", !gics.some((g) => g.ticker === "ODD") && gics.filter((g) => g.ticker === "MA").length === 1 && gics[0].subIndustry !== "Dup");
  let threw = false;
  try {
    parseGicsTable("<html><table><tr><th>Year</th></tr><tr><td>1</td></tr></table></html>");
  } catch {
    threw = true;
  }
  check("a page with no constituents table throws, never an empty index", threw);
  const icb = `<table class="wikitable"><tr><th>Ticker</th><th>Company</th><th>ICB Industry</th><th>ICB Subsector</th></tr><tr><td>ADBE</td><td>Adobe Inc.</td><td>Technology</td><td>Software</td></tr><tr><td>BRK.B</td><td>x</td><td>y</td><td>z</td></tr><tr><td>ADBE</td><td>again</td><td>y</td><td>z</td></tr></table>`;
  let icbThrew = false;
  try {
    parseGicsTable(icb);
  } catch {
    icbThrew = true;
  }
  const tickers = parseTickerTable(icb, 2);
  let shortThrew = false;
  try {
    parseTickerTable(icb);
  } catch {
    shortThrew = true;
  }
  check("a list that classifies by ICB gives its members and no GICS sectors; a table too short to be the list throws", icbThrew && tickers.join() === "ADBE,BRK-B" && shortThrew, tickers.join());
  check("html text decodes entities and drops tags", htmlText("<a href=x>S&amp;P&nbsp;500</a> <sup>[1]</sup>") === "S&P 500 [1]" && secTicker("brk.b") === "BRK-B");
  check("a filings entry carries the sector's basis and sub-industry", filingsFileSchema.parse({ version: 1, updated: "", bySymbol: { MA: { symbol: "MA", ticker: "MA", cik: 1, name: "Mastercard", readAt: "2026-10-13T00:00:00.000Z", latestQuarter: "2026Q2", sector: "Financials", subIndustry: "Transaction & Payment Processing Services", sectorBasis: "GICS, S&P 500 list", values: {}, notes: [], error: null } } }).bySymbol.MA.sectorBasis === "GICS, S&P 500 list");
}

// --- A recorded sector lays over the source's; the class is the test's alone ------------
{
  const hcmp = methodologySchema.parse({ ...JSON.parse(readFileSync("data/library/hcmp.methodology.json", "utf8")), adopted: null, origin: "library" });
  const old = recordsSchema.parse({ version: 1, updated: "", bySymbol: { X: { ownValuation: null, since: null, note: "kept" } } });
  check("a records file written before the sector existed reads as no sector", old.bySymbol.X.sector === null);
  const first = dani.holdings.find((h) => h.assetClass === "equity")!;
  const recorded = applyRecords(dani, { version: 1, updated: "", bySymbol: { [first.symbol]: { ownValuation: null, since: null, note: null, sector: "Financials", levels: null, triggers: [], revaluation: null } } });
  const h = recorded.holdings.find((x) => x.symbol === first.symbol)!;
  check("a recorded sector lays over the source's and changes no class", h.sector === "Financials" && contextFor(recorded, today, hcmp).classOf(h) === contextFor(dani, today, hcmp).classOf(first));
}

// --- What the writer is given: derived rows, the latest quarter, ratios, class tests, the holding ---
{
  const d = derivedSeries(t);
  const op = d.find((r) => r.key === "operatingMarginPct");
  const last = t.years[t.years.length - 1];
  check("derived margins have one value per year and the trailing period, as arithmetic on the reported rows", !!op && op.values.length === t.years.length + 1 && near(op.values[t.years.length - 1], ((t.annual.operatingIncome[last] ?? 0) / (t.annual.revenue[last] ?? 1)) * 100, 0.05), JSON.stringify(op?.values));
  check("free cash flow is cash from operations less capital expenditure, a gap where either is missing", (() => { const f = d.find((r) => r.key === "fcf"); if (!f) return false; const i = t.years.findIndex((y) => typeof t.annual.cfo[y] === "number" && typeof t.annual.capex[y] === "number"); return i >= 0 && near(f.values[i], t.annual.cfo[t.years[i]]! - t.annual.capex[t.years[i]]!, 1) && f.values.every((v, j) => (j < t.years.length && (t.annual.cfo[t.years[j]] === undefined || t.annual.capex[t.years[j]] === undefined)) === (v === null) || j >= t.years.length); })());
  const lq = latestQuarterText(t);
  check("the latest quarter is set against the year before, or left out when the filer has no quarters", t.latestQuarter ? /^Latest quarter, \d{4}Q[1-4], against \d{4}Q[1-4]:$/.test(lq[0]) && lq.length > 1 : lq.length === 0, lq[0]);
  const ft = factsText(t);
  check("the facts text carries thousands separators, the derived margins and the latest quarter", /\d,\d{3}/.test(ft) && /Operating margin/.test(ft) && (t.latestQuarter ? /Latest quarter/.test(ft) : true));
  const st = studyTable(t);
  check("the study table keeps the reported rows and the derived ones as numbers, one column per period", st.cols.length === t.years.length + 1 && st.rows.some((r) => r.key === "revenue" && r.unit === "money") && st.rows.some((r) => r.key === "grossMarginPct" && r.unit === "pct") && st.rows.every((r) => r.values.length === st.cols.length));
  const rich = {
    ...study,
    facts: ft,
    fundamentals: { roic: 0.231, gross_margin: 0.52 },
    fundamentalsNotes: ["interest cover (no interest expense line)"],
    verdict: { classId: "cm", classLabel: "Compounding Machine", checks: [{ ruleId: "r1", section: "3.1", text: "At most 10%", severity: "breach", status: "pass" as const, actual: "4.6%", limit: "≤ 10%", detail: "", figure: "Weight" }], classTests: [{ classId: "cm", label: "Compounding Machine", holds: true, passes: 1, needed: 1, unread: 0, required: [], criteria: [{ label: "ROIC ≥ 20%", value: "23.1%", pass: true, read: true, note: null }] }] },
    holding: { price: 101.5, currency: "USD", quantity: 12, weightPct: 4.6, capPct: 10, classLabel: "Compounding Machine", ownValuation: null },
    markets: [{ name: "VIX", value: "16.2", asOf: "2026-10-12" }],
  };
  const msg = JSON.stringify(researchMessages(rich, nextStep(study)));
  check("the writer sees the ratios, the class tests, the holding and the market readings", /Ratios the app derived/.test(msg) && /23\.1%/.test(msg) && /not derived: interest cover/.test(msg) && /Classification Test, as the app read it/.test(msg) && /Held: 12 units at 101\.5 USD/.test(msg) && /VIX: 16\.2/.test(msg) && /tests Weight/.test(msg));
  check("a subject not in the book is said to have no share price", /Not held in the book, so no share price/.test(JSON.stringify(researchMessages({ ...rich, holding: null }, nextStep(study)))));
  const sys = String(researchRequestBody(mDiv, rich, nextStep(study)).system);
  check("the rules allow arithmetic only with the working shown, mark general knowledge, and close each section", /working/.test(sys) && /not verified/.test(sys) && /What to take from this/.test(sys));
  const ctm = classTestsMarkdown(rich);
  check("the class tests become one table per class, the one that holds first", ctm[0] === "### Classification Test" && ctm.some((l) => l === "| Criterion | Reading | Result |") && ctm.some((l) => /ROIC ≥ 20% \| 23\.1% \| pass/.test(l)));
  check("the Markdown file carries the holding, the markets and the figure each rule tests", (() => { const md = studyMarkdown(rich); return /\*\*In the book\.\*\*/.test(md) && /VIX 16\.2/.test(md) && /\| 3\.1 \| At most 10% \| Weight \|/.test(md); })());
}

// ---------------------------------------------------------------------------
// Look-through: SPY and QQQ from their N-PORT reports, the book by class
{
  const sec = (name: string, cusip: string, pct: number, cat = "EC") => `<invstOrSec><name>${name}</name><lei>X</lei><title>${name} common</title><cusip>${cusip}</cusip><identifiers><isin value="US${cusip}0"/></identifiers><balance>10</balance><valUSD>100</valUSD><pctVal>${pct}</pctVal><assetCat>${cat}</assetCat></invstOrSec>`;
  const xml = `<?xml version="1.0"?><edgarSubmission xmlns="http://www.sec.gov/edgar/nport"><formData><genInfo><repPdEnd>2026-09-30</repPdEnd><repPdDate>2026-06-30</repPdDate></genInfo><fundInfo><totAssets>1000</totAssets><netAssets>990</netAssets></fundInfo><invstOrSecs>${sec("Alder Systems Inc", "111111101", 6.5)}${sec("Birch Networks Inc", "222222105", 3.1)}${sec("Birch Networks Inc", "222222204", 2.9)}${sec("Cedar &amp; Sons", "333333100", 1.2)}${sec("Treasury Bill", "912797000", 0.5, "DBT")}</invstOrSecs></formData></edgarSubmission>`;
  const rep = parseNport(xml);
  check("an N-PORT report reads its date, net assets and every position", rep.reportDate === "2026-06-30" && rep.netAssets === 990 && rep.positions.length === 5 && rep.positions[0].isin === "US1111111010");
  const iss = issuersOf(rep);
  check("two share classes of one company are one issuer, by the CUSIP's issuer code", iss.length === 3 && iss[1].name === "Birch Networks Inc" && near(iss[1].pct, 6.0, 1e-9) && iss[1].classes === 2 && iss[0].name === "Alder Systems Inc", JSON.stringify(iss));
  check("debt and cash vehicles are not companies", !iss.some((i) => i.name === "Treasury Bill"));
  check("an entity in a name is decoded", iss.some((i) => i.name === "Cedar & Sons"));
  let threw = false;
  try {
    parseNport("<html><body>Not found</body></html>");
  } catch {
    threw = true;
  }
  check("a page that is not an N-PORT report throws, never reads as a fund with no holdings", threw);
  const subs = { filings: { recent: { form: ["N-CSR", "NPORT-P", "NPORT-P", "NPORT-EX"], filingDate: ["2026-09-01", "2026-05-28", "2026-08-28", "2026-08-29"], reportDate: ["", "2026-03-31", "2026-06-30", "2026-06-30"], accessionNumber: ["0000000000-26-000001", "0001067839-26-000024", "0001067839-26-000030", "0001067839-26-000031"], primaryDocument: ["a.htm", "xslFormNPORT-P_X01/primary_doc.xml", "xslFormNPORT-P_X01/primary_doc.xml", "x.htm"] } } };
  const latest = latestNportOf(subs);
  check("the latest NPORT-P is taken, and its raw XML rather than the styled view", latest?.accession === "0001067839-26-000030" && latest.document === "primary_doc.xml" && latest.reportDate === "2026-06-30");
  check("a fund with no NPORT-P has none", latestNportOf({ filings: { recent: { form: ["N-CSR"], filingDate: ["2026-01-01"], accessionNumber: ["0000000000-26-000001"], primaryDocument: ["a"] } } }) === null);
  const picks = companiesToRead([{ symbol: "SPY", issuers: [{ name: "A", pct: 7 }, { name: "B", pct: 6 }, { name: "C", pct: 1 }] }, { symbol: "QQQ", issuers: [{ name: "a", pct: 9 }, { name: "D", pct: 5 }] }], 3);
  check("the companies read are the largest across both funds, each once, within the budget", JSON.stringify(picks) === JSON.stringify(["a", "B", "D"]), JSON.stringify(picks));

  const hcmp = adoptMethodology(libraryEntry("hcmp")!);
  const fields = lookThroughFields(hcmp);
  check("the look-through reads the figures the methodology's classes test", fields.includes("roic_pct") && fields.includes("revenue_growth_pct") && fields.includes("engine_growth_pct"), fields.join(","));
  check("amounts of money are never averaged across companies", !fields.some((f) => f === "invested_capital" || f === "net_debt" || f === "net_interest_expense"));
  check("no methodology, no look-through rows", lookThroughFields(null).length === 0);
  const w = weighted([{ weight: 30, values: { roic_pct: 20 } }, { weight: 10, values: { roic_pct: 40 } }, { weight: 60, values: { roic_pct: null } }], "roic_pct");
  check("the average is weighted by position and says what it covers", near(w.value, 25, 1e-9) && near(w.coverage, 40, 1e-9) && w.read === 2 && w.of === 3);
  check("a group where no company reports the figure is no reading, never a zero", weighted([{ weight: 5, values: {} }], "roic_pct").value === null);

  const b = bookSchema.parse(read("dani.book.json"));
  const fake = { ...b, holdings: b.holdings.map((h) => (h.symbol === "AAPL" ? { ...h, fundamentals: { roic_pct: 50, revenue_growth_pct: 6 } } : h)) };
  const ctx = contextFor(fake, "2026-10-11", hcmp);
  const ws = weightsFor(fake, hcmp, ctx).weights;
  const bench = benchmarksFileSchema.parse(read("benchmarks.json"));
  const look = lookThrough(hcmp, ws, bench, ["SPY", "QQQ"]);
  check("the book's look-through reads listed companies only: no fund, option or cash", !!look && look.holdings.map((h) => h.symbol).join(",") === "AAPL" && near(look.book.readings.roic_pct.value, 50, 1e-9), look?.holdings.map((h) => h.symbol).join(","));
  check("SPY and QQQ are worked out the same way and say what they cover", !!look && look.funds.map((f) => f.key).join(",") === "SPY,QQQ" && /largest companies read, \d+% of the fund, from its N-PORT report to the SEC for 2026-06-30/.test(look.funds[0].note ?? ""), look?.funds[0]?.note ?? "");
  const spy = bench.funds.SPY;
  const readOnes = spy.constituents.filter((c) => !c.error);
  const hand = readOnes.reduce((t, c) => t + (c.values.roic_pct as number) * c.pct, 0) / readOnes.reduce((t, c) => t + c.pct, 0);
  check("SPY's average is the fund-weighted average of the companies read", !!look && near(look.funds[0].readings.roic_pct.value, hand, 1e-9));
  check("a company not read leaves the fund's average, never counts as zero", !!look && look.funds[0].readings.roic_pct.read === readOnes.length);
  check("the demo's benchmarks are fictional", spy.constituents.every((c) => c.ticker === null && c.cik === null));
  const run = readFileSync("lib/benchmarks-run.ts", "utf8");
  check("a refresh that read none of a fund's companies keeps the last good copy", /never replaces a good copy/.test(run) && /The last copy stays/.test(run));
  check("the refresh logs no company name", !/console\.(error|warn|log|info)\([^)]*\$\{name\}/.test(run));
  const sync = readFileSync("lib/daily-sync.ts", "utf8");
  check("SPY and QQQ are read again each morning, from the shared figures first, and no button asks for it", /age < REFRESH_HOURS/.test(sync) && /readBenchmarksInto/.test(sync) && /sharedFigures\("screen"\)/.test(readFileSync("lib/benchmarks-run.ts", "utf8")) && !/readBenchmarksAction/.test(readFileSync("app/(app)/performance/page.tsx", "utf8")));
}


// Insider trades from Form 4 (Hamza, 21 Oct 2026, with Peter Lynch's line)
{
  const subs = { filings: { recent: { accessionNumber: ["0001-26-000003", "0001-26-000002", "0001-26-000001", "0001-25-000009"], form: ["4", "8-K", "4", "4"], filingDate: ["2026-10-17", "2026-10-15", "2026-10-02", "2025-01-02"], primaryDocument: ["xslF345X05/wk-form4_1.xml", "ma-8k.htm", "xslF345X05/form4.xml", "xslF345X05/old.xml"] } } };
  const refs = form4sOf(subs, "2025-09-01", ["0001-26-000001"]);
  check("insiders: the Form 4s since the window's start, not yet read, newest first, the XML without the stylesheet's folder", refs.length === 1 && refs[0].accession === "0001-26-000003" && refs[0].document === "wk-form4_1.xml", JSON.stringify(refs));
  const xml = `<?xml version="1.0"?><ownershipDocument><documentType>4</documentType><issuer><issuerCik>0001141391</issuerCik><issuerName>Mastercard Inc</issuerName><issuerTradingSymbol>MA</issuerTradingSymbol></issuer>
  <reportingOwner><reportingOwnerId><rptOwnerCik>1</rptOwnerCik><rptOwnerName>DOE JANE Q</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>0</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Financial Officer</officerTitle><isTenPercentOwner>0</isTenPercentOwner></reportingOwnerRelationship></reportingOwner>
  <aff10b5One>0</aff10b5One>
  <nonDerivativeTable>
   <nonDerivativeTransaction><securityTitle><value>Class A Common Stock</value></securityTitle><transactionDate><value>2026-10-15</value></transactionDate><transactionCoding><transactionFormType>4</transactionFormType><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1,000</value></transactionShares><transactionPricePerShare><value>500.25</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts><postTransactionAmounts><sharesOwnedFollowingTransaction><value>12000</value></sharesOwnedFollowingTransaction></postTransactionAmounts><ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction>
   <nonDerivativeTransaction><transactionDate><value>2026-10-16</value></transactionDate><transactionCoding><transactionCode>S</transactionCode><footnoteId id="F1"/></transactionCoding><transactionAmounts><transactionShares><value>400</value></transactionShares><transactionPricePerShare><value>510</value></transactionPricePerShare></transactionAmounts><ownershipNature><directOrIndirectOwnership><value>I</value></directOrIndirectOwnership></ownershipNature></nonDerivativeTransaction>
   <nonDerivativeTransaction><transactionDate><value>2026-10-16</value></transactionDate><transactionCoding><transactionCode>F</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>50</value></transactionShares></transactionAmounts></nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes><footnote id="F1">Sold under a Rule 10b5-1 trading plan adopted on 1 May 2026.</footnote></footnotes></ownershipDocument>`;
  const form = parseForm4(xml, { accession: "0001-26-000003", filed: "2026-10-17" });
  const [buy, sale] = form.trades;
  check("insiders: a Form 4's open-market purchase and sale are read with who made them; a tax withholding is counted and left out", form.trades.length === 2 && form.others === 1 && buy.code === "P" && buy.shares === 1000 && buy.price === 500.25 && buy.value === 500250 && buy.name === "Jane Q Doe" && buy.role === "Chief Financial Officer" && buy.direct && !buy.plan && buy.ownedAfter === 12000 && form.issuer === "MA", JSON.stringify(form));
  check("insiders: a sale whose footnote names a 10b5-1 plan is marked planned, and one held through a trust indirect", sale.code === "S" && sale.plan && !sale.direct && /under a 10b5-1 plan/.test(tradeWords(sale)));
  let threw = false;
  try {
    parseForm4("<html>no</html>", { accession: "x", filed: "2026-10-17" });
  } catch {
    threw = true;
  }
  check("insiders: a page that is not an ownership document is refused, never read as no trades", threw);
  const ins = withForms(null, [{ ref: refs[0], form }, { ref: { accession: "0001-26-000004", filed: "2026-10-18", document: "x.xml" }, form: null }], 2, "2026-10-21T06:00:00.000Z");
  const v = insiderView(ins, "2026-10-21")!;
  check("insiders: the year's purchases less sales and the buyers are the ontology's two fields; a form that failed is not remembered", v.buys.value === 500250 && v.sales.value === 204000 && v.net === 296250 && v.plannedPct === 100 && insiderFields(ins, "2026-10-21").insider_buyers === 1 && insiderFields(ins, "2026-10-21").insider_net_buying === 296250 && ins.read.join() === "0001-26-000003" && ins.waiting === 2 && insiderFields(null, "2026-10-21").insider_net_buying === null, JSON.stringify(v));
  const again = withForms(ins, [{ ref: refs[0], form }], 0, "2026-10-22T06:00:00.000Z");
  check("insiders: a form read twice is one set of trades", again.trades.length === 2);
  const filingsFile = { version: 1 as const, updated: "", bySymbol: { MA: { symbol: "MA", ticker: "MA", cik: 1141391, name: "Mastercard", readAt: "", latestQuarter: null, values: {}, notes: [], error: null, insiders: ins } } };
  const notices = insiderNotices(filingsFile, "2026-10-21");
  check("insiders: each purchase filed in the last fortnight is an alert linking the company's insiders, a sale is not", notices.length === 1 && notices[0].key === "insider:MA:0001-26-000003" && notices[0].href === "/company/MA#insiders" && /Jane Q Doe bought/.test(notices[0].title) && insiderNotices(filingsFile, "2026-11-20").length === 0, JSON.stringify(notices));
  check("insiders: the company page offers the past year, the year to date, six months and three, each a whole window of the forms read, and shows no read date (Hamza, 23 Oct 2026)", insiderPeriodDays("ytd", "2026-10-23") === 295 && insiderPeriodDays("1y", "2026-10-23") === 365 && insiderPeriodDays("6m", "2026-10-23") === 182 && INSIDER_PERIODS.every((p) => insiderPeriodDays(p.key, "2026-12-31") <= INSIDER_READ_DAYS) && /<InsiderPeriods/.test(readFileSync("components/company/insiders.tsx", "utf8")) && !/readAt/.test(readFileSync("components/company/insiders.tsx", "utf8")) && /role="tablist"/.test(readFileSync("components/company/insider-periods.tsx", "utf8")));
  check("insiders: the four new fields are fundamentals of the ontology, and the page carries Peter Lynch's line", ["insider_net_buying", "insider_buyers", "short_interest_pct", "days_to_cover"].every((f) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(f)) && LYNCH_QUOTE.words === "Insiders might sell their shares for any number of reasons, but they buy them for only one: they think the price will rise." && LYNCH_QUOTE.by === "Peter Lynch" && /LYNCH_QUOTE\.words/.test(readFileSync("components/company/insiders.tsx", "utf8")));
  const edgarSrc = readFileSync("lib/edgar.ts", "utf8");
  check("insiders: the forms are read in lib/edgar.ts alone, by the CIK and the accession, a few a run", /export async function insiderForms/.test(edgarSrc) && /FORMS_PER_RUN/.test(edgarSrc) && /insiderForms\(found\.cik, contact/.test(readFileSync("lib/filings-run.ts", "utf8")));
}

// The methodology screener and the top funds' 13Fs (Hamza, 21 Oct 2026).
{
  const mv = (symbol: string, cap: number | null) => ({ symbol, name: `${symbol} Inc`, sector: "Information Technology", subIndustry: null, cap, close: 100, prevClose: 99, changePct: 1 });
  const universe = universeOf({ moves: [mv("AAA", 5e11), mv("BBB", 2e12), mv("BRK.B", 9e11)] as never, others: [{ ...mv("NDX1", 3e11), sector: null }, { ...mv("AAA", 5e11), sector: null }] as never });
  check("screener: the S&P 500 and the Nasdaq-100's others, each once, the largest first", universe.map((u) => u.symbol).join() === "BBB,BRK.B,AAA,NDX1", JSON.stringify(universe));
  const row = (symbol: string, readAt: string, values: Record<string, number>, error: string | null = null): ScreenCompany => ({ symbol, name: symbol, cik: 1, sector: null, subIndustry: null, sic: null, cap: 1e11, price: 100, readAt, values, shares: null, usd: true, error });
  const file = { ...EMPTY_SCREENER, bySymbol: { AAA: row("AAA", "2026-10-01T05:00:00Z", { roic_pct: 30 }), "BRK.B": row("BRK.B", "2026-10-20T05:00:00Z", { roic_pct: 10 }, "x") } };
  check("screener: never-read companies first, the largest first, then the stalest past a week; one the person's filings read is left to that read", screenToRead(universe, file, "2026-10-21", 5, new Set(["NDX1"])).map((u) => u.symbol).join() === "BBB,AAA", screenToRead(universe, file, "2026-10-21", 5, new Set(["NDX1"])).map((u) => u.symbol).join());
  check("screener: a failed read is tried again after three days, not before", !screenToRead(universe, file, "2026-10-22", 5).some((u) => u.symbol === "BRK.B") && screenToRead(universe, file, "2026-10-23", 5).some((u) => u.symbol === "BRK.B"));
  {
    const recent = { ...EMPTY_SCREENER, bySymbol: { BBB: row("BBB", "2026-11-03T05:00:00Z", { roic_pct: 20 }), AAA: row("AAA", "2026-11-05T05:00:00Z", { roic_pct: 30 }), "BRK.B": row("BRK.B", "2026-11-05T05:00:00Z", { roic_pct: 10 }) } };
    const picks = screenToRead(universe, recent, "2026-11-06", 20).map((u) => u.symbol).join();
    check("screener: a read kept before the Z-score was added is due again right after the never-read, ahead of the weekly refresh; one read since is not", picks === "NDX1,BBB", picks);
  }
  check("screener: only the ontology's fields are kept, as numbers, never a null or zero for a missing one", JSON.stringify(keptValues({ roic_pct: 31.23456, made_up: 3, gross_margin_pct: null })) === '{"roic_pct":31.23}');
  const kept = withCompanies({ ...file, bySymbol: { AAA: row("AAA", "2026-10-01T05:00:00Z", { roic_pct: 30 }) } }, universe, [row("AAA", "2026-10-21T05:00:00Z", {}, "SEC refused")], "2026-10-21T05:00:00Z");
  check("screener: a failed read keeps the last good figures", kept.bySymbol.AAA.values.roic_pct === 30 && kept.bySymbol.AAA.error === null && kept.universe.length === 4);
  const m = { ...mInd, classes: [{ id: "quality", label: "Quality", criteria: [{ field: "roic_pct", is: "gte", value: 20 }, { field: "gross_margin_pct", is: "gte", value: 40 }, { field: "engine_growth_pct", is: "gte", value: 15 }], minimum: 2 }] } as typeof mInd;
  const screenFile = { version: 1 as const, universe: ["Q1", "Q2", "N1", "X1"], updated: "", bySymbol: { Q1: row("Q1", "2026-10-20T05:00:00Z", { roic_pct: 30, gross_margin_pct: 60 }), Q2: { ...row("Q2", "2026-10-19T05:00:00Z", { roic_pct: 25, gross_margin_pct: 50 }), cap: 5e11 }, N1: row("N1", "2026-10-20T05:00:00Z", { roic_pct: 25, gross_margin_pct: 20 }), X1: row("X1", "2026-10-20T05:00:00Z", { roic_pct: 5, gross_margin_pct: 10 }) } };
  const sc = screenOf(m, screenFile, { N1: { values: { engine_growth_pct: 30 }, name: "N1 Corp" } }, new Set(["N1"]), new Set(["Q1"]), "2026-10-21")!;
  check("screener: the person's classes run on every company, the largest first; their own filings win for a company they hold", sc.classes[0].rows.map((r) => r.symbol).join() === "Q2,N1,Q1" && sc.classes[0].rows.find((r) => r.symbol === "N1")!.held && sc.classes[0].rows.find((r) => r.symbol === "Q1")!.watched && sc.placed.X1 === null && sc.placed.Q1 === "quality", JSON.stringify(sc.classes[0].rows.map((r) => r.symbol)));
  const sc2 = screenOf(m, screenFile, {}, new Set(), new Set(), "2026-10-21")!;
  check("screener: a company one criterion short is a near miss naming what failed; a field the screener reads for none is named", sc2.near.map((r) => r.symbol).join() === "N1" && sc2.near[0].short.some((x) => /gross margin/i.test(x)) && sc2.unread.some((u) => u.field === "engine_growth_pct") && sc2.read === 4, JSON.stringify(sc2.near));
  {
    // Hamza, 23 Oct 2026: "no disruptive growth stocks at all ... in the whole S&P 500". The engine stands in from revenue growth until the segment note is read.
    const dg = { ...mInd, classes: [{ id: "disruptive", label: "Disruptive Growth", criteria: [{ field: "engine_growth_pct", is: "gt", value: 20 }] }] } as typeof mInd;
    const f3 = { version: 1 as const, universe: ["G1", "G2", "G3"], updated: "", bySymbol: { G1: row("G1", "2026-10-20T05:00:00Z", { revenue_growth_pct: 35 }), G2: row("G2", "2026-10-20T05:00:00Z", { revenue_growth_pct: 8, engine_growth_pct: 42, engine_share_pct: 30 }), G3: row("G3", "2026-10-20T05:00:00Z", { revenue_growth_pct: 9 }) } };
    const s3 = screenOf(dg, f3, {}, new Set(), new Set(), "2026-10-21")!;
    check("screener: a company whose segment note is not read yet has company revenue growth standing in for the engine, as a holding without segment lines does, and the screen counts them", s3.classes[0].rows.map((r) => r.symbol).join() === "G1,G2" && s3.classes[0].rows.find((r) => r.symbol === "G1")!.standIn === true && s3.classes[0].rows.find((r) => r.symbol === "G2")!.standIn === false && s3.standIn === 2 && !s3.unread.some((u) => u.field === "engine_growth_pct"), JSON.stringify(s3.classes[0].rows.map((r) => [r.symbol, r.standIn])));
    check("screener: the stand-in never overrides an engine read, and no revenue growth means no engine", withEngineStandIn({ engine_growth_pct: 5, revenue_growth_pct: 30 }).values.engine_growth_pct === 5 && !withEngineStandIn({ roic_pct: 10 }).standIn && (withEngineStandIn({ revenue_growth_pct: 12 }).values as Record<string, number>).engine_share_pct === 100);
    check("screener: each company's engine is read from its own segment note in the screener's run, as a holding's is", /segmentLines\(found\.cik, contact\)/.test(readFileSync("lib/screener-run.ts", "utf8")) && /engineOf\(segments/.test(readFileSync("lib/screener-run.ts", "utf8")));
  }
  check("screener: no classes, no screen; an empty file says how it fills", screenOf({ ...m, classes: [] }, screenFile, {}, new Set(), new Set(), "2026-10-21") === null && /a share at a time/.test(screenSentence(null)));
  // The screener as a table, a heat map and filter pills (Hamza, 23 Oct 2026, after TradingView's).
  const tday = { moves: [{ ...mv("Q1", 3e11), changePct: 2.5 }, { ...mv("Q2", 5e11), changePct: -1.2 }, { ...mv("Z9", 1e10), changePct: 0.4 }], others: [{ ...mv("N1", 2e11), sector: null, changePct: -3 }], nasdaq100: ["Q2", "N1"] };
  const trows = tableRows(screenFile, tday as never, sc.placed, { N1: { values: { pe_ratio: 40 }, name: "N1 Corp" } }, new Set(["N1"]), new Set());
  const tr = (s: string) => trows.find((r) => r.symbol === s)!;
  check("screener table: one row a company, the session's moves and the file's figures together; a company the file has not read has a price and no figure", trows.length === 5 && tr("Q1").changePct === 2.5 && tr("Q1").classId === "quality" && tr("Z9").read === false && tr("Z9").roic === null && tr("Z9").price === 100 && tr("X1").changePct === null, JSON.stringify(trows.map((r) => [r.symbol, r.read, r.changePct])));
  check("screener table: the index lists and the person's own filings win for a company they hold", tr("Q2").spx && tr("Q2").ndx && !tr("N1").spx && tr("N1").ndx && tr("N1").pe === 40 && tr("N1").held && tr("N1").name === "N1 Inc");
  const tfilters = [...SCREEN_FILTERS, sectorFilter(trows), classFilter([{ id: "quality", label: "Quality" }])];
  const tpick = (q: Record<string, string>) => applyFilters(trows, chosenFilters(tfilters, q)).map((r) => r.symbol).sort().join();
  check("screener filters: one choice each from the address, all must hold; an unknown choice is ignored", tpick({ index: "ndx" }) === "N1,Q2" && tpick({ chg: "up2" }) === "Q1" && tpick({ chg: "down2" }) === "N1" && tpick({ cap: "large", index: "spx" }) === "Z9" && tpick({ cap: "mega" }) === "N1,Q1,Q2" && tpick({ cap: "nonsense" }) === trows.map((r) => r.symbol).sort().join(), tpick({ cap: "large", index: "spx" }));
  check("screener filters: a filter on a figure leaves out a company not read, never counting it as passing", tpick({ roic: "o20" }) === "N1,Q1,Q2" && !tpick({ roic: "u10" }).includes("Z9") && tpick({ class: "none" }) === "X1" && tpick({ class: "quality" }) === "N1,Q1,Q2", `${tpick({ roic: "o20" })} / ${tpick({ class: "none" })}`);
  check("screener filters: the sectors are the rows' own, the largest first, a Nasdaq-100 company outside the S&P 500 under its own heading", sectorFilter(trows).options[0].label === "Information Technology" && sectorFilter(trows).options.some((o) => o.label === NO_SECTOR) && tpick({ sector: "information-technology" }) === "Q1,Q2,Z9");
  check("screener table: the forward P/E from the file, or the P/E over its revenue growth for a read kept before it", tr("N1").forwardPe === null && tableRows({ ...screenFile, bySymbol: { ...screenFile.bySymbol, Q1: { ...screenFile.bySymbol.Q1, values: { ...screenFile.bySymbol.Q1.values, pe_ratio: 24, revenue_growth_pct: 20 } } } }, tday as never, sc.placed, {}, new Set(), new Set()).find((r) => r.symbol === "Q1")?.forwardPe === 20 && tpick({ fpe: "u15" }) !== undefined, String(tr("N1").forwardPe));
  // The methodology's own levels: a figure its classes test gets its pill, a figure a fixed pill reads gets the level among its choices; no price band.
  const ownClasses = [{ id: "quality", label: "Quality", criteria: [{ field: "gross_margin_pct" as const, is: "gte" as const, value: 50 }, { field: "roic_pct" as const, is: "gte" as const, value: 15 }] }];
  const ownFilters = screenFilters(trows, ownClasses, [{ id: "quality", label: "Quality" }]);
  const ownPick = (q: Record<string, string>) => applyFilters(trows, chosenFilters(ownFilters, q)).map((r) => r.symbol).sort().join();
  const gm = ownFilters.find((f) => f.id === "m-gross_margin_pct");
  check("screener filters: no price band; a figure the classes test gets its own pill at the methodology's level, both ways, a company not read left out", !SCREEN_FILTERS.some((f) => f.id === "price") && !!gm && gm.label === "Gross margin" && gm.options.map((o) => o.label).join("|") === "50% or more, your level|Under 50%" && ownPick({ "m-gross_margin_pct": "ge-50" }) === "Q1,Q2" && ownPick({ "m-gross_margin_pct": "under-50" }) === "N1,X1", JSON.stringify([gm?.label, gm?.options.map((o) => o.label), ownPick({ "m-gross_margin_pct": "ge-50" })]));
  const roicPill = ownFilters.find((f) => f.id === "roic");
  check("screener filters: a level on a figure a fixed pill reads joins that pill, never a second one; the session's pills, then the sector, then the figures, then the class", !!roicPill?.options.some((o) => o.id === "ge-15" && o.label === "15% or more, your level") && !ownFilters.some((f) => f.id === "m-roic_pct") && ownFilters.map((f) => f.id).slice(0, 4).join() === "index,chg,cap,sector" && ownFilters.at(-1)?.id === "class" && methodologyLevels([{ id: "x", label: "X", criteria: [{ field: "sector" as never, is: "eq", value: "Energy" }] }]).size === 0, ownFilters.map((f) => f.id).join());
  const sortedPe = sortRows(trows, "pe", "asc").map((r) => r.symbol);
  check("screener sort: by any column, a company with no figure last either way, market value by default", sortOf({}).key === "cap" && sortOf({}).dir === "desc" && sortOf({ sort: "symbol" }).dir === "asc" && sortOf({ sort: "bogus" }).key === "cap" && sortedPe[0] === "N1" && sortedPe.at(-1) === "Z9" && sortRows(trows, "pe", "desc").at(-1)?.symbol === "Z9" && sortRows(trows, "changePct", "desc")[0].symbol === "Q1", sortedPe.join());
  const md = mapDay({ ...tday, session: "2026-10-22", readAt: "", source: "", sizeBy: "cap", universe: 3, indices: [], qqq: null, problems: [] } as never, applyFilters(trows, chosenFilters(tfilters, { index: "ndx" })));
  check("screener heat map: exactly the companies the filters leave, the Nasdaq-100's others in a sector of their own", md.moves.map((x) => x.symbol).sort().join() === "N1,Q2" && md.moves.find((x) => x.symbol === "N1")!.sector === (NO_SECTOR as never) && md.others.length === 0);
  const screenPage = readFileSync("app/(app)/screener/page.tsx", "utf8");
  check("screener page: table, heat map and your classes as views, the filters as pills in the address, the columns sorting", /FilterPills/.test(screenPage) && /ScreenTable/.test(screenPage) && /<HeatMap day=\{mapDay\(/.test(screenPage) && /"classes"/.test(screenPage) && /sortHref/.test(screenPage) && /TABLE_SHOWN/.test(screenPage));
  // 13Fs
  const subs = { filings: { recent: { form: ["4", "13F-HR", "13F-HR/A", "13F-HR"], accessionNumber: ["a", "0001-26-2", "0001-26-3", "0001-26-1"], filingDate: ["2026-10-01", "2026-08-14", "2026-08-20", "2026-05-15"], reportDate: ["", "2026-06-30", "2026-06-30", "2026-03-31"], primaryDocument: ["x", "xslForm13F_X02/primary_doc.xml", "y", "z"] } } };
  const refs13 = thirteenFsOf(subs);
  check("13F: the manager's 13F-HRs newest first, an amendment left out", refs13.map((r) => r.accession).join() === "0001-26-2,0001-26-1" && refs13[0].period === "2026-06-30");
  check("13F: the information table is the XML the index names so, never the cover page", infoTableName({ directory: { item: [{ name: "primary_doc.xml" }, { name: "50240.xml" }, { name: "0001-26-2-index.htm" }] } }) === "50240.xml" && infoTableName({ directory: { item: [{ name: "primary_doc.xml" }, { name: "form13fInfoTable.xml" }, { name: "other.xml" }] } }) === "form13fInfoTable.xml");
  const xml = `<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable><nameOfIssuer>MASTERCARD INC</nameOfIssuer><titleOfClass>CL A</titleOfClass><cusip>57636Q104</cusip><value>600000000</value><shrsOrPrnAmt><sshPrnamt>1,000,000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion></infoTable>
  <infoTable><nameOfIssuer>MASTERCARD INC</nameOfIssuer><titleOfClass>CL A</titleOfClass><cusip>57636Q104</cusip><value>150000000</value><shrsOrPrnAmt><sshPrnamt>250000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>DFND</investmentDiscretion></infoTable>
  <ns1:infoTable xmlns:ns1="x"><ns1:nameOfIssuer>BERKSHIRE HATHAWAY INC DEL</ns1:nameOfIssuer><ns1:cusip>084670702</ns1:cusip><ns1:value>250000000</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>500000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt></ns1:infoTable>
  <infoTable><nameOfIssuer>MASTERCARD INC</nameOfIssuer><cusip>57636Q104</cusip><value>90000000</value><shrsOrPrnAmt><sshPrnamt>2000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Call</putCall></infoTable>
</informationTable>`;
  const rows13 = parseInfoTable(xml);
  check("13F: rows of one CUSIP are added up, a call option is left out, a namespaced table reads the same, in dollars", rows13.length === 2 && rows13[0].cusip === "57636Q104" && rows13[0].value === 750000000 && rows13[0].shares === 1250000 && rows13[1].value === 250000000, JSON.stringify(rows13));
  let refused = false;
  try {
    parseInfoTable("<html>not a table</html>");
  } catch {
    refused = true;
  }
  check("13F: a document with no information table is refused, never read as no positions", refused);
  check("13F: the issuer's name loses its state of incorporation and its class, so the SEC's list finds it", issuerWords("BERKSHIRE HATHAWAY INC DEL").join(" ") === "BERKSHIRE HATHAWAY" && issuerWords("ALPHABET INC CAP STK CL A").join(" ") === "ALPHABET" && issuerWords("META PLATFORMS INC").join(" ") === "META PLATFORMS");
  const secList = [
    { cik: 70858, ticker: "BAC", title: "BANK OF AMERICA CORP /DE/" },
    { cik: 1046179, ticker: "TSM", title: "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD" },
    { cik: 937966, ticker: "ASML", title: "ASML HOLDING NV" },
    { cik: 6951, ticker: "AMAT", title: "APPLIED MATERIALS INC /DE" },
    { cik: 8670, ticker: "ADP", title: "AUTOMATIC DATA PROCESSING INC" },
    { cik: 1404912, ticker: "KKR", title: "KKR & Co. Inc." },
    { cik: 908937, ticker: "SIRI", title: "Sirius XM Holdings Inc." },
    { cik: 1001250, ticker: "BN", title: "Brookfield Corp /ON/" },
    { cik: 1861449, ticker: "BAM", title: "Brookfield Asset Management Ltd." },
    { cik: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
    { cik: 1067983, ticker: "BRK-A", title: "BERKSHIRE HATHAWAY INC" },
    { cik: 1652044, ticker: "GOOGL", title: "Alphabet Inc." },
    { cik: 2488, ticker: "AMD", title: "ADVANCED MICRO DEVICES INC" },
    { cik: 1, ticker: "ADVA", title: "ADVANCED MEDICAL GROUP INC" },
  ];
  const matched13 = ["BANK OF AMER CORP", "TAIWAN SEMICONDUCTOR MANUFAC", "ASML HLDG NV", "APPLIED MATLS INC", "AUTOMATIC DATA PROCESSING IN", "KKR & CO L P DEL", "SIRIUSXM HOLDINGS INC", "BROOKFIELD CORP", "BERKSHIRE HATHAWAY INC DEL", "ALPHABET INC CAP STK CL A"].map((n) => issuerCompany(secList, n)?.ticker ?? null);
  check("13F: names the 13F abbreviates or cuts short find their company in the SEC's list", matched13.join() === "BAC,TSM,ASML,AMAT,ADP,KKR,SIRI,BN,BRK-B,GOOGL", matched13.join());
  check("13F: a name the start of several companies' matches none, never a guess", issuerCompany(secList, "ADVANCED M") === null && issuerCompany(secList, "ADVANCED") === null);
  const thousands = inDollars([{ name: "A", cusip: "1", value: 5000, shares: 40_000 }, { name: "B", cusip: "2", value: 3000, shares: 20_000 }, { name: "C", cusip: "3", value: 100, shares: 1000 }]);
  check("13F: a table written in thousands is put in dollars; one in dollars is left as it is", thousands[0].value === 5_000_000 && inDollars([{ name: "A", cusip: "1", value: 5_000_000, shares: 40_000 }])[0].value === 5_000_000);
  const filing13 = filingOf(rows13, refs13[0]);
  filing13.positions[0].ticker = "MA";
  filing13.positions[1].ticker = "BRK-B";
  check("13F: the filing keeps its total, its count and each position's share", filing13.total === 1e9 && filing13.count === 2 && filing13.positions[0].pct === 75);
  const prev13 = { accession: "0001-26-1", period: "2026-03-31", pct: { "57636Q104": 60, OLDCUSIP0: 12 } };
  const moves = movesOf(filing13, sharesByCusip(rows13), prev13, { OLDCUSIP0: { name: "OLD CO", ticker: "OLD" } })!;
  check("13F: the quarter's moves: new, added by half a point or more, and sold", moves.bought.map((x) => x.ticker).join() === "BRK-B" && moves.added.map((x) => x.ticker).join() === "MA" && moves.sold.map((x) => x.ticker).join() === "OLD" && moves.trimmed.length === 0 && movesOf(filing13, {}, null) === null, JSON.stringify(moves));
  const fund = { id: "berkshire", cik: 1067983, name: "Berkshire Hathaway", manager: "x", checkedAt: "2026-10-21T05:00:00Z", latest: filing13, previous: prev13, moves, error: null, read: FUNDS_READ };
  const close = closenessOf(fund, (t) => (t === "MA" ? "quality" : t === "BRK-B" ? null : undefined), new Map([["quality", "Quality"]]), new Map([["MA", 10]]))!;
  check("13F: a company list the SEC does not answer leaves the fund's last good copy, never a 13F with no companies matched (Hamza, 23 Oct 2026: unrated funds)", !/findIssuer\([^)]*\)\.catch/.test(readFileSync("lib/funds-run.ts", "utf8")) && FUNDS_READ >= 3 && /Not ranked: /.test(readFileSync("app/(app)/top-funds/page.tsx", "utf8")));
  check("13F: closeness is the share of what could be judged that the person's classes take, beside the overlap with their book", close.fit === 75 && close.judged === 100 && close.byClass[0].label === "Quality" && close.overlap === 10 && close.shared.join() === "MA", JSON.stringify(close));
  const other = { ...fund, id: "other", name: "Other", latest: { ...filing13, positions: filing13.positions.map((p) => ({ ...p, ticker: p.ticker === "MA" ? "ZZZ" : p.ticker })) } };
  const ranked13 = rankFunds({ version: 1, byId: { other, berkshire: fund }, updated: "" }, (f) => closenessOf(f, (t) => (t === "MA" ? "quality" : t === "BRK-B" ? null : undefined), new Map(), new Map()));
  check("13F: the funds closest to the methodology rank first; one the app can judge too little of goes after", ranked13.map((r) => r.fund.id).join() === "berkshire,other");
  check("13F: every fund is due its first look, and none again within the week", fundsDue(null, new Date("2026-10-21T05:00:00Z")).length === FUNDS.length && fundsDue({ version: 1, updated: "", byId: Object.fromEntries(FUNDS.map((d) => [d.id, { ...fund, id: d.id, cik: d.cik, checkedAt: "2026-10-20T05:00:00Z" }])) }, new Date("2026-10-21T05:00:00Z")).length === 0);
  check("13F: a fund kept under an earlier reading is read again", fundsDue({ version: 1, updated: "", byId: Object.fromEntries(FUNDS.map((d) => [d.id, { ...fund, id: d.id, cik: d.cik, checkedAt: "2026-10-20T05:00:00Z", read: FUNDS_READ - 1 }])) }, new Date("2026-10-21T05:00:00Z")).length === FUNDS.length);
  const oldFund = { ...fund, id: "old", name: "Old", latest: { ...filing13, period: "2023-12-31" } };
  const rankedOld = rankFunds({ version: 1, byId: { old: oldFund, other, berkshire: fund }, updated: "" }, (f) => closenessOf(f, (t) => (t === "MA" ? "quality" : t === "BRK-B" ? null : undefined), new Map(), new Map()), "2026-10-23");
  check("13F: a fund whose latest 13F is two quarters old or more is ranked last and said to be old", staleFiling(oldFund, "2026-10-23") && !staleFiling(fund, "2026-10-23") && rankedOld.map((r) => r.fund.id).join() === "berkshire,other,old", rankedOld.map((r) => r.fund.id).join());
  check("13F: the fund list names each manager once, with its SEC CIK", new Set(FUNDS.map((f) => f.cik)).size === FUNDS.length && FUNDS.every((f) => f.cik > 0 && f.name && f.manager) && FUNDS.some((f) => f.cik === 1067983));
  {
    const ref = (accession: string, period: string) => ({ accession, period, filed: `${period}x`, document: "x.xml" });
    const merged = fundFilings([{ cik: 2026053, refs: [ref("new-2", "2026-09-30"), ref("new-1", "2026-06-30")] }, { cik: 1336528, refs: [ref("old-q2", "2026-06-30"), ref("old-q1", "2026-03-31"), ref("old-q4", "2025-12-31")] }]);
    check("13F: a fund whose holdings moved to a new filer reads its quarters, then the earlier filer's before it, each with the CIK that filed it (Pershing Square, 6 Nov 2026)", merged.map((r) => `${r.cik}:${r.accession}`).join() === "2026053:new-2,2026053:new-1,1336528:old-q1,1336528:old-q4" && FUNDS.find((f) => f.id === "pershing")?.cik === 2026053 && FUNDS.find((f) => f.id === "pershing")?.before?.includes(1336528) === true, merged.map((r) => `${r.cik}:${r.accession}`).join());
  }
  const edgarSrc13 = readFileSync("lib/edgar.ts", "utf8");
  check("13F and the screener read SEC EDGAR through lib/edgar.ts alone, by the CIK and the accession", /export async function thirteenFs/.test(edgarSrc13) && /export async function thirteenFTable/.test(edgarSrc13) && !/fetch\(/.test(readFileSync("lib/funds-run.ts", "utf8")) && !/fetch\(/.test(readFileSync("lib/screener-run.ts", "utf8")));
}

// Shared company figures and priced-in growth (Hamza, 23 Oct 2026: "Shared figures only").
{
  const pg = (price: number | null) => fundamentalsOf(t, price);
  const at50 = pg(50).values.implied_growth_pct;
  const at80 = pg(80).values.implied_growth_pct;
  check("priced-in growth: the reverse DCF on the filings' free cash flow gives the growth the price assumes, more for a dearer price", typeof at50 === "number" && Number.isFinite(at50) && typeof at80 === "number" && at80 > at50, `${at50} / ${at80}`);
  {
    // At the growth it reports, the base case is worth the price: the figure is the reverse DCF's own.
    const seedRev = t.ttm.revenue!;
    const fcf = t.ttm.cfo! - t.ttm.capex! - (t.ttm.intangiblesPurchases ?? 0);
    const inputs = dcfDefaults("cash_flow", { revenue: seedRev, fcf, netIncome: t.ttm.netIncome, sbc: t.ttm.sbc, dilutedShares: t.ttm.dilutedShares, revenueGrowthPct: pg(50).values.revenue_growth_pct ?? null, cash: latestBalance(t, "cash")?.value ?? null, investments: null, debt: latestBalance(t, "debt")?.value ?? null, balanceLabel: null, periodLabel: null, currency: t.currency }, 50, t.currency, "2026-01-01", 1)!;
    const r = runDcf(inputs);
    check("priced-in growth: matches the DCF calculator's reverse DCF on the same seed within a tenth of a point", inputs !== null && near(r.implied?.cagrPct, at50!, 0.1), `${r.implied?.cagrPct} vs ${at50}`);
  }
  check("priced-in growth: none without a price, with the reason, and a field of the ontology", pg(null).values.implied_growth_pct === null && pg(null).notes.some((n) => /^implied_growth_pct: no price/.test(n)) && (FUNDAMENTAL_FIELDS as readonly string[]).includes("implied_growth_pct"));
  check("a read at another price: the multiples move with the price, the yield against it, priced-in growth and the rest as read", JSON.stringify(atPrice({ pe_ratio: 20, forward_pfcf: 30, dividend_yield_pct: 2, roic_pct: 25, implied_growth_pct: 9 }, 100, 110)) === JSON.stringify({ pe_ratio: 22, forward_pfcf: 33, dividend_yield_pct: 1.81818, roic_pct: 25, implied_growth_pct: 9 }) && atPrice({ pe_ratio: 20 }, null, 110).pe_ratio === 20);
  const mv2 = (symbol: string) => ({ symbol, name: symbol, sector: "Financials", subIndustry: null, cap: 1e11, close: 100, prevClose: 99, changePct: 1 });
  const uni = universeOf({ moves: [mv2("S1"), mv2("S2"), mv2("S3"), mv2("S4")] as never, others: [] as never });
  const r2 = (symbol: string, readAt: string, values: Record<string, number>, error: string | null = null): ScreenCompany => ({ symbol, name: symbol, cik: 1, sector: null, subIndustry: null, sic: null, cap: 1e11, price: 100, readAt, values, shares: null, usd: true, error });
  const mine = { ...EMPTY_SCREENER, bySymbol: { S1: r2("S1", "2026-10-10T05:00:00Z", { roic_pct: 10 }), S2: r2("S2", "2026-10-20T05:00:00Z", { roic_pct: 20 }), S3: r2("S3", "2026-10-10T05:00:00Z", { roic_pct: 30 }) } };
  const sharedRows = [r2("S1", "2026-10-22T05:00:00Z", { roic_pct: 11 }), r2("S2", "2026-10-12T05:00:00Z", { roic_pct: 19 }), r2("S3", "2026-10-22T05:00:00Z", {}, "SEC refused"), r2("S4", "2026-10-22T05:00:00Z", { roic_pct: 40 }), r2("GONE", "2026-10-22T05:00:00Z", { roic_pct: 1 })];
  const laid = withShared(mine, sharedRows, uni, new Set(["S4"]));
  check("shared figures: a later shared read replaces the person's row, an older one does not, a failed one never replaces a good row, and a company their own filings read or no list carries is left alone", laid.adopted === 1 && laid.file.bySymbol.S1.values.roic_pct === 11 && laid.file.bySymbol.S2.values.roic_pct === 20 && laid.file.bySymbol.S3.values.roic_pct === 30 && !laid.file.bySymbol.S4 && !laid.file.bySymbol.GONE, JSON.stringify(laid));
  check("shared figures: what the shared read already holds is not read again in the person's run", screenToRead(uni, laid.file, "2026-10-23", 10).map((u) => u.symbol).join() === "S4,S3", screenToRead(uni, laid.file, "2026-10-23", 10).map((u) => u.symbol).join());
  const tdShared = { moves: [{ ...mv2("S1"), close: 120 }], others: [], nasdaq100: [] };
  const trShared = tableRows({ ...EMPTY_SCREENER, universe: ["S1"], bySymbol: { S1: r2("S1", "2026-10-20T05:00:00Z", { pe_ratio: 20, implied_growth_pct: 8, dividend_yield_pct: 1.2 }) } }, tdShared as never, {}, {}, new Set(), new Set())[0];
  check("screener table: a read from earlier in the week is laid at the session's close, and priced-in growth is a column that sorts", near(trShared.pe, 24) && near(trShared.divYield, 1) && trShared.impliedGrowth === 8 && SORT_KEYS_LIST.includes("impliedGrowth"), JSON.stringify(trShared));
  const regSrc = readFileSync("lib/registry.ts", "utf8");
  check("shared figures: the registry's table keeps a company, a kind and its read alone, never an address, and a failed read never replaces a good one", /create table if not exists company_figures \(\s*symbol text not null,\s*kind text not null,\s*entry jsonb not null,\s*read_at timestamptz not null,\s*primary key \(symbol, kind\)\s*\)/.test(regSrc) && /excluded\.entry->>'error'\) is null or \(company_figures\.entry->>'error'\) is not null/.test(regSrc));
  const runSrc = readFileSync("lib/screener-run.ts", "utf8");
  check("shared figures: the deployment reads with its own SEC contact and opens no vault; a person's run lays the shared reads first and shares what it reads", /export async function fillSharedCompanies\(now: Date, max: number, budgetMs: number\)/.test(runSrc) && /operatorContact\(\)/.test(runSrc) && /withShared\(kept, shared, universe, ownSymbols\)/.test(runSrc) && /await share\(fresh\)/.test(runSrc) && /fillSharedCompanies\(now, SHARED_PER_RUN/.test(readFileSync("app/api/cron/screener/route.ts", "utf8")));
  check("shared figures: a company page's read is kept for everyone for a week and laid at the opener's price", /sharedFigures\("page", \[symbol\]\)/.test(readFileSync("lib/company-run.ts", "utf8")) && /atPrice\(kept\.entry\.values, kept\.price, price\)/.test(readFileSync("lib/company-run.ts", "utf8")));
}

{
  // How each metric is calculated, behind its (i) (Hamza, 27 Oct 2026).
  const shown = [...FUNDAMENTAL_FIELDS, "forward_pe", "ps_ratio", "forward_ps", "pfcf_ratio", "forward_pfcf", "implied_growth_pct", "consensus_forward_pe"];
  const words = shown.map((f) => [f, metricInfo(f)] as const);
  const missing = words.filter(([, w]) => !w).map(([f]) => f);
  const codey = words.filter(([, w]) => w && (/\blib\//.test(w) || /\b[a-z]+_[a-z0-9_]+\b/.test(w) || /\(\s*\)|,\s*[.,]/.test(w))).map(([f, w]) => `${f}: ${w}`);
  check("metric info: every field a company page, the screener or the peers card shows says how it is calculated", missing.length === 0, missing.join(", "));
  check("metric info: the words name fields by their labels and carry no code reference or dangling punctuation", codey.length === 0, codey.slice(0, 3).join(" | "));
  check("metric info: priced-in growth is explained as the reverse DCF it is, and the figures computed beside the fields have their own words", /reverse DCF/.test(metricInfo("implied_growth_pct") ?? "") && /discounts at 9%/.test(metricInfo("implied_growth_pct") ?? "") && Object.values(EXTRA_INFO).every((w) => w.length > 40));
  check("metric info: an unknown field has no words rather than made-up ones", metricInfo("no_such_field") === null);
}

{
  // A filer that gives its quarters only as six and nine months (Hamza, 4 Nov 2026: the app's gaps are fixed, not hidden).
  const usd = (rows: [string, string, number, string?][]) => ({ units: { USD: rows.map(([start, end, val, fp]) => ({ start, end, val, filed: "2026-10-30", form: "10-Q", ...(fp ? { fp } : {}) })) } });
  const ytd = factsTable({
    cik: 9, entityName: "Year To Date Co", facts: { "us-gaap": {
      Revenues: usd([["2025-01-01", "2025-03-31", 100, "Q1"], ["2025-04-01", "2025-06-30", 110, "Q2"], ["2025-07-01", "2025-09-30", 120, "Q3"], ["2025-10-01", "2025-12-31", 130, "Q4"], ["2026-01-01", "2026-03-31", 140, "Q1"], ["2026-04-01", "2026-06-30", 150, "Q2"], ["2026-07-01", "2026-09-30", 160, "Q3"], ["2024-01-01", "2024-12-31", 380, "FY"], ["2025-01-01", "2025-12-31", 460, "FY"]]),
      InterestExpense: usd([["2024-01-01", "2024-09-30", 27, "Q3"], ["2024-01-01", "2024-12-31", 36, "FY"], ["2025-01-01", "2025-06-30", 20, "Q2"], ["2025-01-01", "2025-09-30", 31, "Q3"], ["2025-01-01", "2025-12-31", 42, "FY"], ["2026-01-01", "2026-06-30", 24, "Q2"], ["2026-01-01", "2026-09-30", 37, "Q3"]]),
      PaymentsForProceedsFromProductiveAssets: usd([["2025-10-01", "2025-12-31", 5, "Q4"], ["2026-01-01", "2026-03-31", 5, "Q1"], ["2026-04-01", "2026-06-30", 5, "Q2"], ["2026-07-01", "2026-09-30", 5, "Q3"]]),
      OtherShortTermBorrowings: { units: { USD: [{ end: "2026-09-30", val: 70, filed: "2026-10-30", form: "10-Q" }] } },
    } },
  });
  check("year to date: the twelve months are the year plus this year to date less last year's, when no quarter is filed on its own", ytd.ttm.interestExpense === 42 + 37 - 31, String(ytd.ttm.interestExpense));
  check("year to date: the twelve months before are read the same way, and the table says so", ytd.priorTtm.interestExpense === 36 + 31 - 27, String(ytd.priorTtm.interestExpense));
  check("year to date: the derivation is named", ytd.derived.some((d) => /this year to date less the same months a year before/.test(d) && /interest expense/i.test(d)), ytd.derived.join(" | "));
  check("a broker's capital expenditure (PaymentsForProceedsFromProductiveAssets) is read", ytd.ttm.capex === 20, String(ytd.ttm.capex));
  check("other short-term borrowings are read as short-term debt", !ytd.missing.includes("shortTermDebt"), ytd.missing.join(","));
  const f = fundamentalsOf(ytd, null);
  const gap = factsTable({
    cik: 10, entityName: "Own Concept Co", facts: { "us-gaap": {
      Revenues: usd([["2025-10-01", "2025-12-31", 100, "Q4"], ["2026-01-01", "2026-03-31", 100, "Q1"], ["2026-04-01", "2026-06-30", 100, "Q2"], ["2026-07-01", "2026-09-30", 100, "Q3"]]),
      OperatingIncomeLoss: usd([["2025-10-01", "2025-12-31", 20, "Q4"], ["2026-01-01", "2026-03-31", 20, "Q1"], ["2026-04-01", "2026-06-30", 20, "Q2"], ["2026-07-01", "2026-09-30", 20, "Q3"]]),
      InterestExpenseDebtSeniorNotes: usd([["2025-10-01", "2025-12-31", 2, "Q4"], ["2026-07-01", "2026-09-30", 2, "Q3"]]),
    } },
  });
  const gapNotes = fundamentalsOf(gap, null).notes ?? [];
  check("a line the filings carry under a concept the app does not read is named as the app's gap, with the concept", gapNotes.some((n) => /^interest_cover: .*InterestExpenseDebtSeniorNotes under a name the app does not read yet/.test(n)), gapNotes.join(" | "));
  check("a filer with only current borrowings has that as its debt, said so", (f.notes ?? []).some((n) => /^debt: .*current borrowings alone/.test(n)), JSON.stringify(f.notes ?? []));
  check("a concept the app reads under another line (other short-term borrowings, read as short-term debt) is never named as one it does not read", !ytd.unread?.debt?.includes("OtherShortTermBorrowings") && !(f.notes ?? []).some((n) => /OtherShortTermBorrowings under a name the app does not read yet/.test(n)), JSON.stringify(f.notes ?? []));
}

// What each fund says it does (Hamza, 9 Nov 2026: "fetch each fund's methodology and theses and use that to rank similarity to the user").
{
  const at = "2026-11-09T05:00:00.000Z";
  const record = (input: unknown) => ({ content: [{ type: "tool_use", name: "record_creed", input }], stop_reason: "tool_use" });
  const answer = record({
    summary: "Owns a few businesses with high returns on capital, held for years.",
    styles: ["quality", "long_term", "momentum"],
    tests: [{ field: "roic_pct", want: "higher", words: "High returns" }, { field: "forward_pe", want: "lower", words: "A fair price" }, { field: "beta", want: "lower", words: "Not a field" }, { field: "roic_ex_goodwill_pct", want: "higher", words: "A repeat of the same group" }],
    theses: [
      { ticker: "ma", title: "Cards keep winning", words: "Cash gives way to cards.", source: { title: "Letter", url: "https://example.com/l", date: "2026-10-20" } },
      { theme: "ai", title: "AI spending runs for years", words: "Data centres keep growing.", source: { title: "Letter", url: "https://example.com/l" } },
      { ticker: "GOOGL", title: "No page", words: "x", source: { title: "Blog", url: "http://example.com/x" } },
      { title: "Neither ticker nor theme", words: "x", source: { title: "Letter", url: "https://example.com/l" } },
    ],
    sources: [{ title: "Letter", url: "https://example.com/l", date: "2026-10-20" }, { title: "Bad", url: "javascript:alert(1)" }],
  });
  const parsed = parseCreedResponse(answer, "quality_fund", at, "m");
  check("a creed is read item by item: a style, figure or thesis outside the fixed words, or without an https page, is dropped and counted; a ticker is upper-cased", parsed.ok && parsed.creed.styles.join(",") === "quality,long_term" && parsed.creed.tests.map((t) => `${t.group}:${t.want}`).join(",") === "roic:higher,pe:lower" && parsed.creed.theses.map((t) => t.ticker ?? t.theme).join(",") === "MA,ai" && parsed.creed.sources.length === 1 && parsed.dropped === 6, JSON.stringify(parsed));
  check("a creed with no summary, or no page, is no reading", !parseCreedResponse(record({ summary: "", styles: [], tests: [], theses: [], sources: [] }), "x", at, null).ok && !parseCreedResponse(record({ summary: "Says things.", styles: [], tests: [], theses: [], sources: [] }), "x", at, null).ok && !parseCreedResponse({ content: [{ type: "text", text: "words" }] }, "x", at, null).ok);
  const body = creedRequestBody({ name: "Example Fund", manager: "A manager" }, "2026-11-09");
  const sys = String(body.system);
  check("the creed call names the fund alone and the fixed words, searches the manager's own pages and never sends a figure of anyone's", /Example Fund/.test(sys) && /own words/.test(sys) && /roic_pct/.test(sys) && /quality \(/.test(sys) && !JSON.stringify(body.messages).match(/\$|weight|holding/i) && (body.tools as { name: string }[]).some((t) => t.name === "web_search"));
  const good = parsed.ok ? parsed.creed : (null as unknown as FundCreed);
  const defs = [{ id: "a", name: "A", manager: "", cik: 1 }, { id: "b", name: "B", manager: "", cik: 2 }, { id: "c", name: "C", manager: "", cik: 3 }, { id: "d", name: "D", manager: "", cik: 4 }];
  const now = new Date(at);
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const due = creedsDue(defs, { a: { ...good, id: "a", readAt: ago(10) }, b: { ...good, id: "b", readAt: ago(CREED_REFRESH_DAYS + 1), failedAt: ago(2) }, c: failedCreed(undefined, "c", ago(CREED_RETRY_DAYS + 1), "Not read.") }, now);
  check("a creed is due when never read, a failed one a week on, a good one a quarter on unless a retry failed this week; the never read first", due.map((d) => d.id).join(",") === "d,c", due.map((d) => d.id).join(","));
  check("a failed read over a good one keeps the good one, marked to be tried again", failedCreed(good, "x", at, "No.").summary === good.summary && failedCreed(good, "x", at, "No.").failedAt === at && failedCreed(undefined, "x", at, "No.").error === "No.");
  const mine = { ...mInd, classes: [{ id: "q", label: "Quality", criteria: [{ field: "roic_pct", is: "gte", value: 15 }, { field: "pe_ratio", is: "lte", value: 30 }, { field: "revenue_growth_pct", is: "gte", value: 5 }, { field: "net_debt_to_ebitda", is: "lte", value: 3 }, { field: "net_debt_to_ebitda", is: "gte", value: -5 }] }] } as typeof mInd;
  const theses = { bySymbol: { MA: { text: "Cards.", pillars: [], pathway: null, watch: [], dcf: null, valuation: null, evidence: [], figures: [], since: null, updatedAt: at }, V: { text: " ", pillars: [], pathway: null, watch: [], dcf: null, valuation: null, evidence: [], figures: [], since: null, updatedAt: at } }, markets: [{ id: "ai-capex", title: "AI capex keeps rising", text: "Data centers.", pillars: [], watch: [], evidence: [], figures: [], basket: ["NVDA"], since: null, updatedAt: at }] };
  const lens = lensOf(mine, theses);
  check("the person's lens is read from their classes with no model: a figure tested both ways is left out, the styles follow, and their theses' companies and themes", [...lens.tests.entries()].map(([g, w]) => `${g}:${w}`).join(",") === "roic:higher,pe:lower,revenue_growth:higher" && [...lens.styles].sort().join(",") === "growth,quality,value" && [...lens.tickers].sort().join(",") === "MA,NVDA" && [...lens.themes].join(",") === "ai", JSON.stringify({ t: [...lens.tests], s: [...lens.styles], k: [...lens.tickers], h: [...lens.themes] }));
  const m = creedMatch(good, lens)!;
  check("a fund's match is the share of the person's approach it says it shares: two figures the same way and one style of three figures and three styles", m.agree.join(",") === "roic,pe" && !m.against.length && m.styles.sort().join(",") === "quality,value" && Math.abs((m.approach ?? 0) - ((2 * 2 + 2) / (3 * 2 + 3)) * 100) < 1e-9 && m.tickers.join(",") === "MA" && m.themes.join(",") === "ai", JSON.stringify(m));
  const against = creedMatch({ ...good, styles: [], tests: [{ group: "pe", want: "higher", words: "Pays up" }] }, lens)!;
  check("a figure it wants the other way counts against, never below zero, and is named", against.approach === 0 && against.against.join(",") === "pe" && /the other way/.test(matchWords(against, lens)));
  check("with no classes to lay it on, the approach is unmeasured, never a zero", creedMatch(good, lensOf(null, theses))!.approach === null);
  const ranked = rankByCreed([{ id: "z", name: "Z" }, { id: "q", name: "Q" }, { id: "n", name: "N" }], { q: { ...good, id: "q" }, z: { ...good, id: "z", tests: [], styles: [] }, n: failedCreed(undefined, "n", at, "No.") }, lens);
  check("the funds rank by their approach, then the theses both hold, a fund with no reading last", ranked.map((r) => r.id).join(",") === "q,z,n" && ranked[2].match === null, ranked.map((r) => r.id).join(","));
  check("themes are read from the words of a market thesis", themesOf("The Fed cuts rates while oil stays tight").join(",") === "rates,energy");
  const sample = JSON.parse(readFileSync("data/samples/fund_creeds.json", "utf8")) as Record<string, unknown>;
  const funds13 = JSON.parse(readFileSync("data/samples/funds.json", "utf8")) as { byId: Record<string, unknown> };
  check("the demo's creeds are fictional, one for each of its fictional funds, on reserved example pages", Object.entries(sample).every(([id, c]) => creedSchema.safeParse(c).success && id in funds13.byId && JSON.stringify(c).match(/https:\/\/[^"]+/g)!.every((u) => u.startsWith("https://example.com/"))) && Object.keys(sample).length === Object.keys(funds13.byId).length);
  // On the marketplace (Hamza, 9 Nov 2026: "add the top fund's methodologies and theses to the methodology and theses marketplace").
  check("a level is kept only when its number is printed in the words", printedIn("ROIC above 15%", 15) && printedIn("under 2.5 times", 2.5) && !printedIn("ROIC above 150%", 15) && !printedIn("High returns", 15) && !printedIn("above 1.5 times", 15));
  const levelled = parseCreedResponse(record({ summary: "Owns quality.", styles: [], tests: [{ field: "roic_pct", want: "higher", words: "ROIC above 15%", level: 15 }, { field: "pe_ratio", want: "lower", words: "A fair price", level: 25 }], theses: [], sources: [{ title: "Letter", url: "https://example.com/l" }] }), "q", at, "m");
  const lv = levelled.ok ? levelled.creed : (null as unknown as FundCreed);
  check("a stated level is kept on the field the fund named, one the words do not print is dropped, and the reading carries its version", lv.tests[0].level === 15 && lv.tests[0].field === "roic_pct" && lv.tests[1].level === null && lv.version === CREED_VERSION, JSON.stringify(lv?.tests));
  check("a creed kept under an earlier reading is read again", creedsDue([defs[0]], { a: { ...good, id: "a", readAt: ago(10), version: 1 } }, now).length === 1 && creedsDue([defs[0]], { a: { ...good, id: "a", readAt: ago(10), version: undefined } }, now).length === 1 && creedsDue([defs[0]], { a: { ...lv, id: "a", readAt: ago(10) } }, now).length === 0);
  const fund = { id: "q", name: "Example Quality", manager: "A manager" };
  const base = { figures: mInd.figures, dashboard: mInd.dashboard };
  const fm = creedMethodology(lv, fund, base)!;
  check("a fund's approach adopts as a draft on the person's own figures, each figure it looks for a guideline to check citing what it stated, its levels alone a class, credited to the fund", !!fm && fm.adopted === null && fm.figures.map((f) => f.id).join() === base.figures.map((f) => f.id).join() && fm.rules.length === 2 && fm.rules.every((r) => r.test === null && r.severity === "guideline" && r.section === STATED_SECTION) && fm.classes.length === 1 && JSON.stringify(fm.classes[0].criteria) === JSON.stringify([{ field: "roic_pct", is: "gte", value: 15 }]) && fm.lineage?.parent === "Example Quality" && fm.lineage?.credit === "A manager" && fm.lineage?.source === "market", JSON.stringify(fm));
  check("a fund that states no level gives no class, never a made-up one, and a failed reading gives no draft", creedMethodology(good, fund, base)!.classes.length === 0 && creedMethodology(failedCreed(undefined, "x", at, "No."), fund, base) === null);
  check("a fund is named as its reading keeps it, else as the list of funds does", fundNameOf("berkshire", null)?.name === "Berkshire Hathaway" && fundNameOf("nobody", null) === null);
  const shelf = { q: good };
  const stock = creedThesis(shelf, "q", 0)!;
  const theme = creedThesis(shelf, "q", 1)!;
  check("a stated thesis is found again by its fund and place, never from a form's words", stock.ticker === "MA" && theme.theme === "ai" && creedThesis(shelf, "q", 9) === null && creedThesis(shelf, "z", 0) === null);
  const empty = { version: 1 as const, bySymbol: {}, markets: [], updated: at };
  const t1 = takeFundThesis(empty, stock, fund, now, "2026-11-09");
  const s1 = t1.file.bySymbol.MA;
  check("taking a fund's thesis on a company starts the folder with its words, credited, and an entry naming the fund and its page", t1.kind === "stock" && t1.started && s1.text.includes("Cash gives way to cards.") && s1.text.includes("Example Quality") && s1.evidence.length === 1 && s1.evidence[0].via === "you" && s1.evidence[0].source.startsWith("Example Quality") && s1.evidence[0].summary.includes("https://example.com/l") && fundThesisTaken(t1.file, stock), JSON.stringify(s1));
  const t2 = takeFundThesis(theses as unknown as typeof empty, stock, fund, now, "2026-11-09");
  check("on a company the person already has words for, only an entry is added; their words stay", !t2.started && t2.file.bySymbol.MA.text === "Cards." && t2.file.bySymbol.MA.evidence.length === 1);
  const t3 = takeFundThesis(empty, theme, fund, now, "2026-11-09");
  check("a thesis on a theme becomes a market thesis under its title, started with its words; taken again it adds an entry to the same one", t3.kind === "market" && t3.file.markets.length === 1 && t3.file.markets[0].title === theme.title && t3.file.markets[0].evidence.length === 1 && takeFundThesis(t3.file, theme, fund, now, "2026-11-09").file.markets[0].evidence.length === 2 && takeFundThesis(t3.file, theme, fund, now, "2026-11-09").file.markets.length === 1);
  const full = { ...empty, markets: Array.from({ length: MAX_MARKET_THESES }, (_, n) => ({ ...t3.file.markets[0], id: `m${n}`, title: `M ${n}` })) };
  let refused = false;
  try {
    takeFundThesis(full, theme, fund, now, "2026-11-09");
  } catch {
    refused = true;
  }
  check("a new market thesis past the limit is refused", refused);
}

// A company's ecosystem from its own annual report (Hamza, 21 Nov 2026)
{
  const subs = { filings: { recent: { accessionNumber: ["0001-26-000003", "0001-26-000002", "0001-25-000001", "0001-26-000004"], form: ["10-Q", "10-K", "10-K", "10-K/A"], filingDate: ["2026-08-01", "2026-02-10", "2025-02-11", "2026-03-01"], primaryDocument: ["q.htm", "k26.htm", "k25.htm", "ka.htm"] } } };
  const annual = latestAnnualOf(subs);
  check("ecosystem: the latest 10-K with its document, an amendment and a 10-Q left out", annual?.accession === "0001-26-000002" && annual.primary === "k26.htm" && annual.filed === "2026-02-10", JSON.stringify(annual));
  check("ecosystem: no annual report is none", latestAnnualOf({ filings: { recent: { accessionNumber: ["a"], form: ["8-K"], filingDate: ["2026-01-01"], primaryDocument: ["x.htm"] } } }) === null && latestAnnualOf(null) === null);
  const filler = "The company designs chips. ".repeat(200);
  const report = `Table of contents Item 1. Business 3 Item 2. Properties 20\n\nItem 1. Business\n${filler}We rely on Taiwan Semiconductor Manufacturing Company Limited to make our wafers. We compete with Advanced Micro Devices and Intel Corporation.\nItem 1A. Risk Factors\nOur sales are concentrated.\nItem 2. Properties\nWe lease offices.\nNote 14. Sales to Acme Distribution Inc. accounted for 14% of our total revenue in fiscal 2025.`;
  const part = businessSections(report, "10-K");
  check("ecosystem: the business section read through the risk factors, the table of contents skipped, the share paragraph added", part.found && part.text.startsWith("Item 1. Business\n") && part.text.includes("Risk Factors") && !part.text.includes("We lease offices") && part.text.includes("Acme Distribution Inc. accounted for 14%") && !part.cut, part.text.slice(0, 80));
  check("ecosystem: a report with no section is read from its start, within the limit", (() => { const p = businessSections("x".repeat(ECO_MAX_CHARS * 2), "10-K"); return !p.found && p.text.length <= ECO_MAX_CHARS; })());
  const body = ecoRequestBody({ symbol: "NVDA", name: "NVIDIA" }, { form: "10-K", filed: "2026-02-10" }, part.text) as { tools: { name?: string; type?: string }[]; tool_choice: { type: string } };
  check("ecosystem: one tool, no web search, the choice left to the model", body.tools.length === 1 && body.tools[0].name === "record_ecosystem" && body.tool_choice.type === "auto");
  const answer = (relations: unknown[]) => ({ content: [{ type: "tool_use", name: "record_ecosystem", input: { relations } }] });
  const parsed = parseEcoResponse(answer([
    { name: "Taiwan Semiconductor Manufacturing Company Limited", ticker: "TSM", kind: "supplier", quote: "We rely on Taiwan Semiconductor Manufacturing Company Limited to make our wafers." },
    { name: "Advanced Micro Devices", ticker: "amd", kind: "Competitor", quote: "We compete with Advanced Micro Devices and Intel Corporation." },
    { name: "Intel Corporation", ticker: "INTC", kind: "competitor", quote: "We compete with Advanced Micro Devices and Intel Corporation." },
    { name: "Acme Distribution Inc.", kind: "customer", share: 14, quote: "Sales to Acme Distribution Inc. accounted for 14% of our total revenue in fiscal 2025." },
    { name: "Samsung", kind: "supplier", quote: "We rely on Samsung to make our memory." },
    { name: "Broadcom", kind: "competitor", quote: "We compete with Advanced Micro Devices and Intel Corporation." },
    { name: "Intel Corporation", kind: "competitor", quote: "We compete with Advanced Micro Devices and Intel Corporation." },
    { name: "Lessor", kind: "landlord", quote: "We lease offices." },
    { name: "NVIDIA", ticker: "NVDA", kind: "partner", quote: "The company designs chips." },
  ]), part.text, "NVDA", new Set(["TSM", "AMD", "NVDA"]));
  check("ecosystem: a relation kept only when its quote is printed and names it; a repeat, an unknown kind and a made-up quote dropped", parsed.ok && parsed.relations.length === 4 && parsed.dropped === 5, JSON.stringify(parsed));
  if (parsed.ok) {
    check("ecosystem: a ticker kept only on the SEC's list, the kind read in any case", parsed.relations[0].ticker === "TSM" && parsed.relations[1].ticker === "AMD" && parsed.relations[1].kind === "competitor" && parsed.relations[2].ticker === null);
    check("ecosystem: a customer's share kept when its quote prints it", parsed.relations[3].share === 14);
    const g = ecoGroups({ relations: parsed.relations });
    check("ecosystem: grouped in the four kinds' order", g.map((x) => x.kind).join() === "supplier,customer,competitor");
  }
  const noShare = parseEcoResponse(answer([{ name: "Acme Distribution Inc.", kind: "customer", share: 20, quote: "Sales to Acme Distribution Inc. accounted for 14% of our total revenue in fiscal 2025." }]), part.text, "NVDA", null);
  check("ecosystem: a share the quote does not print is left off", noShare.ok && noShare.relations[0].share === null);
  check("ecosystem: an answer in words is no reading", !parseEcoResponse({ content: [{ type: "text", text: "TSMC" }] }, part.text, "NVDA", null).ok);
  const now = new Date("2026-11-21T05:00:00Z");
  const good = ecosystemSchema.parse({ symbol: "NVDA", form: "10-K", accession: "0001-26-000002", filed: "2026-02-10", url: null, readAt: "2026-02-12T05:00:00Z", model: "m", relations: [], dropped: 0, note: null, version: ECO_VERSION });
  check("ecosystem: none kept is due; a report read this year is not; a year on it is asked weekly", ecoCandidate(null, now) && !ecoCandidate({ ...good, filed: "2026-06-01" }, now) && ecoCandidate(good, new Date(Date.parse("2026-02-10") + ECO_RECHECK_DAYS * 86_400_000)) && !ecoCandidate({ ...good, checkedAt: "2026-11-19T05:00:00Z" }, now));
  const bad = failedEco(null, "NVDA", null, "2026-11-20T05:00:00Z", "No report.");
  check("ecosystem: a failed read waits its days; over a good one the good one stays", !ecoCandidate(bad, now) && ecoCandidate(bad, new Date(Date.parse("2026-11-20T05:00:00Z") + ECO_RETRY_DAYS * 86_400_000)) && failedEco(good, "NVDA", null, "2026-11-20T05:00:00Z", "x").accession === good.accession && !failedEco(good, "NVDA", null, "2026-11-20T05:00:00Z", "x").error);
  check("ecosystem: the same report is not read again, a newer one is", !ecoNeedsRead(good, { accession: "0001-26-000002", form: "10-K", filed: "2026-02-10", primary: "k.htm" }) && ecoNeedsRead(good, { accession: "0001-27-000001", form: "10-K", filed: "2027-02-10", primary: "k.htm" }) && ecoNeedsRead({ ...good, version: 0 }, { accession: "0001-26-000002", form: "10-K", filed: null, primary: "k.htm" }));
}

if (failures.length) {
  console.error(`check:research FAILED (${failures.length}):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`check:research ok (${passed} passed): filings become figures, each family gets its template, the methodology's recipes judge the subject, and the writer only writes.`);
