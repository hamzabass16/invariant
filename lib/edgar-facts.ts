/**
 * SEC EDGAR company facts, read into a small table the research can cite.
 * The input is the XBRL "companyfacts" JSON the SEC publishes for every filer
 * (the companyfacts endpoint of the SEC's XBRL API). Every fact is read by
 * its own dates (see "Periods" below): quarters come from quarterly
 * durations and from year-to-date ones less the shorter before them, fiscal
 * years from durations of about a year, balances from instants at quarter
 * ends; a period filed twice is read once, from the later filing. A 20-F
 * filer with no quarterly reports is read year against year.
 *
 * From the table come the ontology's fundamentals fields (lib/ontology.ts
 * FUNDAMENTAL_FIELDS) for the company, each derived here the same way every
 * time, or null with a reason when a concept is missing. Nothing is
 * estimated. Pure: no network; lib/edgar.ts fetches.
 */
import { z } from "zod";

import { dcfDefaults, runDcf } from "@/lib/dcf";
import { grownForward } from "@/lib/forward";
import type { FundamentalField } from "@/lib/ontology";

/**
 * One fact. The dates, the value, the frame and the filing date are read;
 * everything else the SEC puts on a fact (accession, fiscal year and period,
 * form) is carried through untouched, whatever its type, because a
 * single odd entry among tens of thousands must not throw the whole company
 * away. A fact that lacks a number or an end date is skipped, not fatal.
 */
const point = z.object({ end: z.string(), val: z.number(), frame: z.string().nullable().optional(), start: z.string().nullable().optional(), filed: z.string().nullable().optional(), fp: z.string().nullable().optional() }).loose();
const concept = z.object({ units: z.record(z.string(), z.array(z.unknown())) }).loose();
export const companyFactsSchema = z.object({ cik: z.coerce.number(), entityName: z.string().nullable().default(""), facts: z.record(z.string(), z.record(z.string(), z.unknown())) }).loose();
export type CompanyFacts = z.infer<typeof companyFactsSchema>;

// ---------------------------------------------------------------------------
// Which company a subject names

/** One row of the SEC's company list (company_tickers.json), in the SEC's order. */
export type CompanyRow = { cik: number; ticker: string; title: string };

const rowSchema = z.object({ cik_str: z.number(), ticker: z.string(), title: z.string() }).passthrough();

/** The SEC's company list as rows, in the SEC's order; throws when the shape is not the list. */
export function companyRows(json: unknown): CompanyRow[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("not the SEC company list");
  const rows: CompanyRow[] = [];
  for (const v of Object.values(json as Record<string, unknown>)) {
    const r = rowSchema.safeParse(v);
    if (r.success) rows.push({ cik: r.data.cik_str, ticker: r.data.ticker.toUpperCase(), title: r.data.title });
  }
  if (!rows.length) throw new Error("the SEC company list is empty");
  return rows;
}

/** Words the SEC's titles carry that a person does not type: legal forms and the odd "com". */
const SUFFIXES = new Set(["CORP", "CORPORATION", "INC", "INCORPORATED", "LTD", "LIMITED", "PLC", "CO", "COMPANY", "HOLDINGS", "HOLDING", "HLDGS", "COM", "SA", "NV", "AG", "SE", "LLC", "LP", "DE", "NEW"]);

/** Upper-case words, punctuation gone, a leading "the" and trailing legal forms dropped. */
export function nameWords(s: string): string[] {
  const words = s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words[0] === "THE") words.shift();
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words;
}

/**
 * The company a subject names, or null. In order: the SEC's ticker as typed
 * (NVDA); a name equal to the SEC's title once legal forms are dropped
 * (NVIDIA, Nvidia Corporation, Berkshire Hathaway); then the one title that
 * begins with the subject's words when exactly one does (Uber). A word many
 * titles begin with (Gold) matches none, so a theme stays a theme. The first
 * match in the SEC's order wins.
 */
export function findCompany(rows: CompanyRow[], subject: string): CompanyRow | null {
  const typed = subject.trim().toUpperCase();
  if (!typed) return null;
  const byTicker = rows.find((r) => r.ticker === typed);
  if (byTicker) return byTicker;
  const want = nameWords(subject);
  if (!want.length) return null;
  const key = want.join(" ");
  const equal = rows.find((r) => nameWords(r.title).join(" ") === key);
  if (equal) return equal;
  if (key.length < 4) return null;
  const leading = rows.filter((r) => {
    const t = nameWords(r.title);
    return t.length > want.length && want.every((w, i) => t[i] === w);
  });
  return leading.length === 1 ? leading[0] : null;
}

/** Results a company search returns at most. */
export const SEARCH_MAX = 24;

/**
 * Companies matching what a person typed, for the Companies screen: the
 * exact ticker first, then tickers that start with it, then names holding
 * every word typed (each word the start of a word of the name), in the SEC's
 * own order, which lists the largest first. One row per company (the first
 * ticker the SEC lists for it).
 */
export function searchCompanies(rows: readonly CompanyRow[], typed: string, max: number = SEARCH_MAX): CompanyRow[] {
  const q = typed.trim().toUpperCase();
  if (!q) return [];
  const want = nameWords(typed);
  const first = new Map<number, CompanyRow>();
  for (const r of rows) if (!first.has(r.cik)) first.set(r.cik, r);
  const exact = rows.filter((r) => r.ticker === q);
  const prefix = /^[A-Z0-9.-]{1,10}$/.test(q) ? rows.filter((r) => r.ticker !== q && r.ticker.startsWith(q) && first.get(r.cik) === r) : [];
  const named = want.length
    ? [...first.values()].filter((r) => {
        const t = nameWords(r.title);
        return want.every((w) => t.some((x) => x.startsWith(w)));
      })
    : [];
  const out: CompanyRow[] = [];
  const seen = new Set<number>();
  for (const r of [...exact, ...prefix, ...named]) {
    if (seen.has(r.cik)) continue;
    seen.add(r.cik);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The company's profile (the submissions document)

export type CompanyProfile = { sic: number | null; industry: string | null; fiscalYearEnd: string | null; country: string | null };

const addressSchema = z.object({ stateOrCountry: z.string().nullable().optional(), stateOrCountryDescription: z.string().nullable().optional() }).loose();
const submissionsSchema = z.object({ sic: z.union([z.string(), z.number()]).nullable().optional(), sicDescription: z.string().nullable().optional(), fiscalYearEnd: z.string().nullable().optional(), addresses: z.object({ business: addressSchema.nullable().optional() }).loose().nullable().optional() }).loose();

/** The fifty states, the District and the territories as EDGAR codes them: a business address there is in the United States. */
const US_CODES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" "));

/**
 * The country of the company's business address as its filing gives it: a US
 * state code is the United States; EDGAR describes any other code in words
 * ("NETHERLANDS", "ONTARIO, CANADA"), which is set in title case, a Canadian
 * province read as Canada. Null when the filing gives no address.
 */
export function countryOfAddress(code: string | null | undefined, description: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  if (US_CODES.has(c)) return "United States";
  const d = (description ?? "").trim();
  if (!d) return null;
  if (/,\s*CANADA$/i.test(d)) return "Canada";
  return d.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(Of|And|The)\b/g, (w) => w.toLowerCase());
}

/** The industry code, its description, the fiscal year end ("1231") and the country of the business address from a submissions document; throws when the shape is not that document. */
export function companyProfileOf(json: unknown): CompanyProfile {
  const r = submissionsSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document");
  const sic = r.data.sic === null || r.data.sic === undefined || r.data.sic === "" ? null : Number(r.data.sic);
  const business = r.data.addresses?.business;
  return { sic: sic !== null && Number.isInteger(sic) ? sic : null, industry: r.data.sicDescription?.trim() || null, fiscalYearEnd: r.data.fiscalYearEnd?.trim() || null, country: countryOfAddress(business?.stateOrCountry, business?.stateOrCountryDescription) };
}

/** Flows over a period, read by year and by quarter. */
export const FLOWS = ["revenue", "costOfRevenue", "grossProfit", "rnd", "sga", "sellingMarketing", "generalAdmin", "operatingIncome", "nonoperatingIncome", "netIncome", "cfo", "capex", "intangiblesPurchases", "da", "sbc", "interestExpense", "interestIncome", "taxExpense", "pretaxIncome", "epsDiluted", "dilutedShares", "dividendsPaid", "dividendPerShare", "buybacks", "acquisitions"] as const;
export type Flow = (typeof FLOWS)[number];
/** Balances at a date, read at quarter ends. */
export const BALANCES = ["cash", "marketableSecurities", "longTermInvestments", "debt", "shortTermDebt", "financeLeases", "equity", "minorityInterest", "assets", "receivables", "loansReceivable", "inventory", "goodwill", "intangibles", "sharesOutstanding", "assetsCurrent", "liabilitiesCurrent", "retainedEarnings"] as const;
export type Balance = (typeof BALANCES)[number];

/** How a concept is measured: in the reporting currency, per share in it, or in shares. */
type Measure = "money" | "perShare" | "shares";

/**
 * The concepts each key is read from, in order of preference: us-gaap names
 * for a 10-K/10-Q filer, then the IFRS names a 20-F filer uses (prefixed
 * ifrs-full:), then dei. Every name is read and merged; for one period the
 * earliest-listed concept that reports it wins, so a company that moved from
 * "Revenues" to "RevenueFromContractWithCustomer..." in 2018 still has every
 * year. A broker or bank files its total as RevenuesNetOfInterestExpense and
 * the contract concept for commissions alone, so the net line is read first.
 */
const CONCEPTS: Record<Flow | Balance, { names: string[]; measure: Measure }> = {
  revenue: { names: ["RevenuesNetOfInterestExpense", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "ifrs-full:Revenue", "ifrs-full:RevenueFromContractsWithCustomers"], measure: "money" },
  costOfRevenue: { names: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization", "ifrs-full:CostOfSales"], measure: "money" },
  grossProfit: { names: ["GrossProfit", "ifrs-full:GrossProfit"], measure: "money" },
  rnd: { names: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost", "ifrs-full:ResearchAndDevelopmentExpense"], measure: "money" },
  sga: { names: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense", "ifrs-full:SellingGeneralAndAdministrativeExpense"], measure: "money" },
  // The two parts of SG&A where the company files them apart, for the income statement flow (Hamza, 5 Nov 2026).
  sellingMarketing: { names: ["SellingAndMarketingExpense", "ifrs-full:SellingExpense", "ifrs-full:DistributionCosts"], measure: "money" },
  generalAdmin: { names: ["GeneralAndAdministrativeExpense", "ifrs-full:AdministrativeExpense"], measure: "money" },
  operatingIncome: { names: ["OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities"], measure: "money" },
  nonoperatingIncome: { names: ["NonoperatingIncomeExpense", "OtherNonoperatingIncomeExpense", "ifrs-full:OtherGainsLosses"], measure: "money" },
  netIncome: { names: ["NetIncomeLoss", "ProfitLoss", "ifrs-full:ProfitLossAttributableToOwnersOfParent", "ifrs-full:ProfitLoss"], measure: "money" },
  cfo: { names: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations", "ifrs-full:CashFlowsFromUsedInOperatingActivities"], measure: "money" },
  capex: { names: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForProceedsFromProductiveAssets", "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], measure: "money" },
  intangiblesPurchases: { names: ["PaymentsToAcquireIntangibleAssets", "ifrs-full:PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities"], measure: "money" },
  sbc: { names: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense", "ifrs-full:KeyManagementPersonnelCompensationSharebasedPayment"], measure: "money" },
  da: { names: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "ifrs-full:DepreciationAndAmortisationExpense", "ifrs-full:AdjustmentsForDepreciationAndAmortisationExpense", "ifrs-full:DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss"], measure: "money" },
  interestExpense: { names: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestPaidNet", "ifrs-full:InterestExpense", "ifrs-full:FinanceCosts"], measure: "money" },
  interestIncome: { names: ["InvestmentIncomeInterest", "InterestIncomeOther", "InvestmentIncomeInterestAndDividend", "InterestAndDividendIncomeOperating", "InterestAndOtherIncome", "ifrs-full:InterestIncome", "ifrs-full:FinanceIncome"], measure: "money" },
  taxExpense: { names: ["IncomeTaxExpenseBenefit", "ifrs-full:IncomeTaxExpenseContinuingOperations"], measure: "money" },
  pretaxIncome: { names: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments", "ifrs-full:ProfitLossBeforeTax"], measure: "money" },
  epsDiluted: { names: ["EarningsPerShareDiluted", "EarningsPerShareBasic", "ifrs-full:DilutedEarningsLossPerShare", "ifrs-full:BasicEarningsLossPerShare"], measure: "perShare" },
  dilutedShares: { names: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic", "ifrs-full:AdjustedWeightedAverageShares", "ifrs-full:WeightedAverageShares"], measure: "shares" },
  dividendsPaid: { names: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "ifrs-full:DividendsPaidClassifiedAsFinancingActivities", "ifrs-full:DividendsPaid"], measure: "money" },
  dividendPerShare: { names: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid", "ifrs-full:DividendsRecognisedAsDistributionsToOwnersPerShare", "ifrs-full:DividendsProposedOrDeclaredBeforeFinancialStatementsAuthorisedForIssueButNotRecognisedAsDistributionToOwnersPerShare"], measure: "perShare" },
  buybacks: { names: ["PaymentsForRepurchaseOfCommonStock", "ifrs-full:PaymentsToAcquireOrRedeemEntitysShares"], measure: "money" },
  acquisitions: { names: ["PaymentsToAcquireBusinessesNetOfCashAcquired", "PaymentsToAcquireBusinessesGross", "ifrs-full:CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities"], measure: "money" },
  cash: { names: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "ifrs-full:CashAndCashEquivalents"], measure: "money" },
  marketableSecurities: { names: ["MarketableSecuritiesCurrent", "ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "DebtSecuritiesAvailableForSaleCurrent", "ifrs-full:CurrentFinancialAssetsAtFairValueThroughProfitOrLoss"], measure: "money" },
  longTermInvestments: { names: ["LongTermInvestments", "MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "DebtSecuritiesAvailableForSaleNoncurrent", "ifrs-full:NoncurrentFinancialAssetsAtFairValueThroughProfitOrLoss"], measure: "money" },
  debt: { names: ["LongTermDebt", "LongTermDebtNoncurrent", "DebtLongtermAndShorttermCombinedAmount", "LongTermDebtAndCapitalLeaseObligations", "ConvertibleDebtNoncurrent", "LongTermLoansPayable", "ConvertibleNotesPayable", "ifrs-full:Borrowings", "ifrs-full:NoncurrentBorrowings", "ifrs-full:LongtermBorrowings"], measure: "money" },
  shortTermDebt: { names: ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper", "OtherShortTermBorrowings", "LoansPayableCurrent", "ifrs-full:CurrentBorrowings"], measure: "money" },
  financeLeases: { names: ["FinanceLeaseLiability", "FinanceLeaseLiabilityNoncurrent", "CapitalLeaseObligations"], measure: "money" },
  equity: { names: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "ifrs-full:EquityAttributableToOwnersOfParent", "ifrs-full:Equity"], measure: "money" },
  minorityInterest: { names: ["MinorityInterest", "ifrs-full:NoncontrollingInterests"], measure: "money" },
  assets: { names: ["Assets", "ifrs-full:Assets"], measure: "money" },
  receivables: { names: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "ifrs-full:TradeAndOtherCurrentReceivables"], measure: "money" },
  loansReceivable: { names: ["LoansAndLeasesReceivableNetReportedAmount", "NotesReceivableNet", "FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss", "LoansReceivableNet", "ifrs-full:LoansAndReceivables"], measure: "money" },
  inventory: { names: ["InventoryNet", "ifrs-full:Inventories"], measure: "money" },
  goodwill: { names: ["Goodwill", "ifrs-full:Goodwill"], measure: "money" },
  intangibles: { names: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet", "ifrs-full:IntangibleAssetsOtherThanGoodwill"], measure: "money" },
  sharesOutstanding: { names: ["dei:EntityCommonStockSharesOutstanding", "ifrs-full:NumberOfSharesOutstanding"], measure: "shares" },
  // For the Altman Z-score (altman_z): working capital, retained earnings.
  assetsCurrent: { names: ["AssetsCurrent", "ifrs-full:CurrentAssets"], measure: "money" },
  liabilitiesCurrent: { names: ["LiabilitiesCurrent", "ifrs-full:CurrentLiabilities"], measure: "money" },
  retainedEarnings: { names: ["RetainedEarningsAccumulatedDeficit", "ifrs-full:RetainedEarnings"], measure: "money" },
};

/**
 * Depreciation and amortisation as two lines, for a filer that files no
 * combined one: an IFRS filer's cash flow statement often adds them back
 * apart (AdjustmentsForDepreciationExpense, AdjustmentsForAmortisationExpense).
 * Their sum is D&A for a period both parts report and no combined line does.
 */
/**
 * The cost of inventories recognised as an expense (IAS 2.36(d)), which an
 * IFRS filer that reports no cost of sales line still discloses in its
 * inventories note; IAS 2.38 says it is often what cost of sales means. Read
 * as cost of revenue only when the filings carry neither a cost of sales nor
 * a gross profit line, and said so, since it leaves out costs that never pass
 * through inventories (a service line's people, say).
 */
const INVENTORIES_EXPENSED: { names: string[]; measure: Measure } = { names: ["ifrs-full:CostOfInventoriesRecognisedAsExpenseDuringPeriod"], measure: "money" };

const DA_PARTS: { names: string[]; measure: Measure }[] = [
  { names: ["Depreciation", "ifrs-full:AdjustmentsForDepreciationExpense", "ifrs-full:DepreciationExpense"], measure: "money" },
  { names: ["AmortizationOfIntangibleAssets", "ifrs-full:AdjustmentsForAmortisationExpense", "ifrs-full:AmortisationExpense"], measure: "money" },
];

export const LABEL: Record<Flow | Balance, string> = {
  revenue: "Revenue",
  costOfRevenue: "Cost of revenue",
  grossProfit: "Gross profit",
  rnd: "Research and development",
  sga: "Selling, general and administrative",
  sellingMarketing: "Sales and marketing",
  generalAdmin: "General and administrative",
  operatingIncome: "Operating income",
  nonoperatingIncome: "Non-operating income (expense)",
  netIncome: "Net income",
  cfo: "Cash from operations",
  capex: "Capital expenditure",
  intangiblesPurchases: "Purchases of intangibles",
  da: "Depreciation and amortisation",
  sbc: "Share-based compensation",
  interestExpense: "Interest expense",
  interestIncome: "Interest income",
  taxExpense: "Income tax",
  pretaxIncome: "Pre-tax income",
  epsDiluted: "EPS, diluted",
  dilutedShares: "Diluted shares",
  dividendsPaid: "Dividends paid",
  dividendPerShare: "Dividend per share",
  buybacks: "Share repurchases",
  acquisitions: "Acquisitions, net of cash acquired",
  cash: "Cash",
  marketableSecurities: "Marketable securities, current",
  longTermInvestments: "Long-term investments",
  debt: "Debt",
  shortTermDebt: "Short-term debt",
  financeLeases: "Finance leases",
  equity: "Equity",
  minorityInterest: "Minority interests",
  assets: "Total assets",
  receivables: "Receivables",
  loansReceivable: "Loans receivable",
  inventory: "Inventory",
  goodwill: "Goodwill",
  intangibles: "Intangibles, excluding goodwill",
  sharesOutstanding: "Shares outstanding",
  assetsCurrent: "Current assets",
  liabilitiesCurrent: "Current liabilities",
  retainedEarnings: "Retained earnings",
};

/** Period key → value: "2025" for a year, "2025Q3" for a quarter. */
export type Series = Record<string, number>;

export type FactsTable = {
  cik: number;
  entity: string;
  /** The currency the money concepts are read in (the one the revenue is filed in most). */
  currency: string | null;
  /** The latest quarter the revenue (else net income) is reported for, e.g. "2026Q2"; null when the filer reports no quarters. */
  latestQuarter: string | null;
  /**
   * What the trailing figures stand on: the last four quarters to
   * latestQuarter ("ttm"), the latest fiscal year of a filer with no quarterly
   * reports ("annual"), or nothing ("none").
   */
  basis: "ttm" | "annual" | "none";
  /** The period the trailing figures cover, in words: "TTM to 2026Q2", "FY2025"; null when none. */
  period: string | null;
  /** The last five fiscal years with a revenue figure, oldest first. */
  years: string[];
  annual: Record<Flow, Series>;
  quarterly: Record<Flow, Series>;
  /** Balances at quarter ends, by quarter key. */
  balances: Record<Balance, Series>;
  /** The trailing twelve months (or the latest year): each flow summed, shares averaged; null when a quarter is missing. */
  ttm: Record<Flow, number | null>;
  /** The twelve months before those. */
  priorTtm: Record<Flow, number | null>;
  /** Concept keys with no data at all. */
  missing: (Flow | Balance)[];
  /** The concept each key was read from (the first listed with figures), so a reader can tell a total from a non-current line. */
  concept: Partial<Record<Flow | Balance, string>>;
  /** How a figure the filings do not report directly was built from ones they do; empty when none was. */
  derived: string[];
  /** The share splits the filings restated, oldest first; every per-share figure and share count is on today's count. */
  splits: Split[];
  /**
   * For a key with no data, the concepts the filings do carry that look like
   * it (by name, in the right units, filed in the last two years) and that
   * the app does not read: a gap of the app's, never the company's (Hamza,
   * 4 Nov 2026). Empty for a key the company truly does not file.
   */
  unread: Partial<Record<Flow | Balance, string[]>>;
};

// ---------------------------------------------------------------------------
// Periods
//
// The SEC's calendar frames (CY2025Q3) are not enough: a 10-K reports the
// year and the fourth quarter is never framed, a company that changed concept
// names has frames split across them, and a 20-F filer has no quarters at
// all. So every fact is read by its own dates: a duration of about a quarter
// is a quarter; a longer year-to-date duration yields the quarter it ends in
// once the shorter one before it is taken away (Q4 = year less nine months,
// Q3 = nine less six, Q2 = six less Q1); a duration of about a year is a
// fiscal year, keyed by the calendar year it mostly falls in. A period filed
// twice (the comparative in a later filing) is read once, from the later
// filing.

const DAY = 86_400_000;
const parseDay = (s: string) => Date.parse(`${s}T00:00:00Z`);
const quarterEnds = (y: number) => [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`];

/** The calendar quarter whose end is nearest the date, within 45 days (a 52-week or odd fiscal calendar); null otherwise. */
export function nearestQuarter(date: string): { key: string; y: number; q: number } | null {
  const t = parseDay(date);
  if (!Number.isFinite(t)) return null;
  const y = Number(date.slice(0, 4));
  let best: { key: string; y: number; q: number; gap: number } | null = null;
  for (const yy of [y - 1, y, y + 1]) {
    const ends = quarterEnds(yy);
    for (let i = 0; i < ends.length; i++) {
      const gap = Math.abs(parseDay(ends[i]) - t) / DAY;
      if (gap <= 45 && (best === null || gap < best.gap)) best = { key: `${yy}Q${i + 1}`, y: yy, q: i + 1, gap };
    }
  }
  return best === null ? null : { key: best.key, y: best.y, q: best.q };
}

/** The quarter before "2026Q1" is "2025Q4". */
export function quarterBefore(key: string): string {
  const y = Number(key.slice(0, 4));
  const q = Number(key.slice(5));
  return q === 1 ? `${y - 1}Q4` : `${y}Q${q - 1}`;
}

/** Walks back n quarters from latest ("2026Q2" → 2026Q2, 2026Q1, 2025Q4, 2025Q3). */
function quarterKeys(latest: string, n: number): string[] {
  const out: string[] = [];
  let k = latest;
  for (let i = 0; i < n; i++) {
    out.push(k);
    k = quarterBefore(k);
  }
  return out;
}

/** How many quarters a duration spans by its length: 1 to 4, or 0 when it is none of those. */
function quartersIn(start: string, end: string): number {
  const days = (parseDay(end) - parseDay(start)) / DAY + 1;
  if (!Number.isFinite(days) || days < 60) return 0;
  if (days <= 100) return 1;
  if (days <= 190) return 2;
  if (days <= 285) return 3;
  if (days <= 380) return 4;
  return 0;
}

type Duration = { start: string; end: string; val: number; filed: string; fp: string | null };

/** A share split read from the filings: figures filed before `filed` are on the old share count, `factor` new shares per old one (below 1 for a reverse split). */
export type Split = { factor: number; filed: string };

/**
 * A split shows in the facts as the same period filed twice with a per-share
 * figure (or a share count) that changed by a whole number of times: Booking
 * filed its 2025 quarters again in 2026 at a twenty-fifth of the EPS and
 * twenty-five times the shares. Each such pair, read on the diluted EPS, the
 * diluted shares and the shares outstanding, names a factor and the filing
 * that restated; the factor most pairs agree on is the split. A ratio more
 * than 5% off a whole number is a restatement for another reason, not a split.
 */
export function splitsOf(facts: CompanyFacts, currency: string | null): Split[] {
  const votes = new Map<string, number>();
  for (const key of ["epsDiluted", "dilutedShares", "sharesOutstanding"] as const) {
    const measure = CONCEPTS[key].measure;
    for (const name of CONCEPTS[key].names) {
      const byPeriod = new Map<string, z.infer<typeof point>[]>();
      for (const p of pointsOf(facts, name, measure, currency)) {
        if (typeof p.filed !== "string" || p.val === 0) continue;
        const id = `${p.start ?? ""}|${p.end}`;
        byPeriod.set(id, [...(byPeriod.get(id) ?? []), p]);
      }
      for (const pts of byPeriod.values()) {
        const sorted = [...pts].sort((a, b) => (a.filed! < b.filed! ? -1 : a.filed! > b.filed! ? 1 : 0));
        for (let i = 1; i < sorted.length; i++) {
          const earlier = sorted[i - 1];
          const later = sorted[i];
          if (earlier.filed === later.filed) continue;
          // New shares per old one: a per-share figure falls by the factor, a share count rises by it.
          const r = measure === "shares" ? later.val / earlier.val : earlier.val / later.val;
          const whole = r >= 1 ? Math.round(r) : 1 / Math.round(1 / r);
          const off = r >= 1 ? Math.abs(r - whole) / whole : Math.abs(1 / r - 1 / whole) * whole;
          if ((r >= 1 ? whole : 1 / whole) < 2 || off > 0.05) continue;
          const id = `${whole}|${later.filed}`;
          votes.set(id, (votes.get(id) ?? 0) + 1);
        }
      }
    }
  }
  // One split per restating filing, the factor most pairs agree on; two filings within a year of each other restating by the same factor are one split.
  const byFiled = new Map<string, { factor: number; n: number }>();
  for (const [id, n] of votes) {
    const [f, filed] = id.split("|");
    const prev = byFiled.get(filed);
    if (!prev || n > prev.n) byFiled.set(filed, { factor: Number(f), n });
  }
  const out: Split[] = [];
  for (const [filed, { factor }] of [...byFiled.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const last = out.at(-1);
    if (last && last.factor === factor && (parseDay(filed) - parseDay(last.filed)) / DAY <= 366) continue;
    out.push({ factor, filed });
  }
  return out;
}

/** The point on today's share count: a figure filed before a split is divided (per share) or multiplied (shares) by its factor. */
function onTodaysShares(p: z.infer<typeof point>, measure: Measure, splits: Split[]): number {
  if (measure === "money" || !splits.length || typeof p.filed !== "string") return p.val;
  let v = p.val;
  for (const s of splits) if (p.filed < s.filed) v = measure === "shares" ? v * s.factor : v / s.factor;
  return v;
}

/** Every duration fact of the concepts, one per (start, end), the later filing winning a repeat and an earlier-listed concept winning a tie. */
function durations(facts: CompanyFacts, key: Flow | Balance, currency: string | null, splits: Split[] = []): Duration[] {
  return durationsOf(facts, CONCEPTS[key], currency, splits);
}

/** The same, for any list of concepts read as one line. */
function durationsOf(facts: CompanyFacts, spec: { names: string[]; measure: Measure }, currency: string | null, splits: Split[] = []): Duration[] {
  const seen = new Map<string, Duration & { rank: number }>();
  spec.names.forEach((name, rank) => {
    for (const p of pointsOf(facts, name, spec.measure, currency)) {
      if (!p.start) continue;
      const id = `${p.start}|${p.end}`;
      const prev = seen.get(id);
      const filed = typeof p.filed === "string" ? p.filed : "";
      // A later filing of the same period restates it; between concepts, the one listed first wins.
      if (!prev || rank < prev.rank || (rank === prev.rank && filed > prev.filed)) seen.set(id, { start: p.start, end: p.end, val: onTodaysShares(p, spec.measure, splits), filed, fp: typeof p.fp === "string" ? p.fp : null, rank });
    }
  });
  return [...seen.values()];
}

/** Instant facts of the concepts, one per date, the later filing winning. */
function instants(facts: CompanyFacts, key: Balance, currency: string | null, splits: Split[] = []): Series {
  const seen = new Map<string, { val: number; filed: string; rank: number }>();
  CONCEPTS[key].names.forEach((name, rank) => {
    for (const p of pointsOf(facts, name, CONCEPTS[key].measure, currency)) {
      if (p.start) continue;
      const prev = seen.get(p.end);
      const filed = typeof p.filed === "string" ? p.filed : "";
      if (!prev || rank < prev.rank || (rank === prev.rank && filed > prev.filed)) seen.set(p.end, { val: onTodaysShares(p, CONCEPTS[key].measure, splits), filed, rank });
    }
  });
  const out: Series = {};
  for (const [date, v] of seen) {
    const q = nearestQuarter(date);
    if (q && !(q.key in out && date < latestDateFor[q.key]!)) {
      out[q.key] = v.val;
      latestDateFor[q.key] = date;
    }
  }
  return out;
}
// The date each balance key was read at, so the nearer of two dates in one quarter wins.
let latestDateFor: Record<string, string> = {};

const CURRENCY = /^[A-Z]{3}$/;

/** The unit a concept is read in, given the company's currency. */
function unitsFor(measure: Measure, currency: string | null): (unit: string) => boolean {
  if (measure === "shares") return (u) => u === "shares";
  if (measure === "perShare") return (u) => (currency ? u === `${currency}/shares` : /^[A-Z]{3}\/shares$/.test(u));
  return (u) => (currency ? u === currency : CURRENCY.test(u));
}

/** The facts of one concept ("Revenues", "ifrs-full:Revenue", "dei:..."), in the units the measure allows. */
function pointsOf(facts: CompanyFacts, name: string, measure: Measure, currency: string | null): z.infer<typeof point>[] {
  const [taxonomy, local] = name.includes(":") ? name.split(":") : ["us-gaap", name];
  const entry = concept.safeParse((facts.facts[taxonomy] ?? {})[local]);
  if (!entry.success) return [];
  const allowed = unitsFor(measure, currency);
  const out: z.infer<typeof point>[] = [];
  for (const [unit, pts] of Object.entries(entry.data.units)) {
    if (!allowed(unit)) continue;
    for (const raw of pts) {
      const r = point.safeParse(raw);
      if (r.success) out.push(r.data);
    }
  }
  return out;
}

/** The currency the revenue (else net income, else assets) is filed in most often. */
function currencyOf(facts: CompanyFacts): string | null {
  for (const key of ["revenue", "netIncome", "assets"] as const) {
    const count = new Map<string, number>();
    for (const name of CONCEPTS[key].names) {
      const [taxonomy, local] = name.includes(":") ? name.split(":") : ["us-gaap", name];
      const entry = concept.safeParse((facts.facts[taxonomy] ?? {})[local]);
      if (!entry.success) continue;
      for (const [unit, pts] of Object.entries(entry.data.units)) if (CURRENCY.test(unit)) count.set(unit, (count.get(unit) ?? 0) + pts.length);
    }
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
  }
  return null;
}

/**
 * The quarters and fiscal years of one flow from its durations: reported
 * quarters first, then the ones a year-to-date figure yields. A flow that
 * does not add up over time (a weighted average share count) is never
 * differenced: the year-to-date average stands for the quarter it ends in.
 * A twelve-month duration is a fiscal year only when a filing marks it as one
 * (fp "FY"): Amazon's 10-Qs also carry the trailing twelve months to each
 * quarter, which is not a year of the company's. Durations with no mark at
 * all (an older document) are read as years by their length.
 */
export function periodsOf(ds: Duration[], additive = true): { quarterly: Series; annual: Series } {
  const quarterly: Series = {};
  const annual: Series = {};
  const marked = ds.some((d) => d.fp);
  // Year-to-date durations by span and the quarter they end in, so Q4 = FY less 9M and so on.
  const spans = new Map<string, Duration>();
  for (const d of ds) {
    const n = quartersIn(d.start, d.end);
    const q = nearestQuarter(d.end);
    if (!n || !q) continue;
    spans.set(`${n}|${q.key}`, d);
    if (n === 1) quarterly[q.key] = d.val;
    if (n === 4 && (!marked || d.fp === "FY")) {
      // The fiscal year is keyed by the calendar year most of it falls in.
      const mid = new Date((parseDay(d.start) + parseDay(d.end)) / 2);
      annual[String(mid.getUTCFullYear())] = d.val;
    }
  }
  const aligned = (a: Duration, b: Duration) => Math.abs(parseDay(a.start) - parseDay(b.start)) / DAY <= 15;
  for (const [id, d] of spans) {
    const n = Number(id.slice(0, 1));
    const key = id.slice(2);
    if (n === 1 || key in quarterly) continue;
    if (!additive) {
      quarterly[key] = d.val;
      continue;
    }
    const shorter = spans.get(`${n - 1}|${quarterBefore(key)}`);
    if (shorter && aligned(d, shorter)) {
      quarterly[key] = d.val - shorter.val;
      continue;
    }
    // No shorter year-to-date figure: the quarters before it, when every one is reported.
    const before = quarterKeys(quarterBefore(key), n - 1);
    if (before.every((k) => k in quarterly)) quarterly[key] = d.val - before.reduce((t, k) => t + quarterly[k], 0);
  }
  return { quarterly, annual };
}

const sumOrNull = (s: Series, keys: string[]) => (keys.every((k) => k in s) ? keys.reduce((t, k) => t + s[k], 0) : null);

const yearBack = (key: string) => `${Number(key.slice(0, 4)) - 1}${key.slice(4)}`;

/**
 * The twelve months to `latest` from the year-to-date figures when a quarter
 * is not filed on its own: the last fiscal year, plus this year to date, less
 * the same months a year before (Cenovus, Mercado Libre and many others file
 * their quarters only as six and nine months). The fiscal year must end
 * within the four quarters to `latest` and each year-to-date figure must start
 * where its fiscal year does; anything else is none.
 */
export function ttmFromYearToDate(ds: Duration[], latest: string): number | null {
  const marked = ds.some((d) => d.fp);
  const byEnd = new Map<string, Duration[]>();
  for (const d of ds) {
    const q = nearestQuarter(d.end);
    if (!q) continue;
    byEnd.set(q.key, [...(byEnd.get(q.key) ?? []), d]);
  }
  const span = (key: string, n: number, from?: string) =>
    (byEnd.get(key) ?? []).find((d) => quartersIn(d.start, d.end) === n && (n !== 4 || !marked || d.fp === "FY") && (from === undefined || Math.abs(parseDay(d.start) - parseDay(from)) / DAY <= 15));
  const back = quarterKeys(latest, 4);
  for (let m = 0; m < 4; m++) {
    const fy = span(back[m], 4);
    if (!fy) continue;
    if (m === 0) return fy.val;
    // This year to date starts the day after the fiscal year ends; last year's starts where that fiscal year started.
    const nextStart = new Date(parseDay(fy.end) + DAY).toISOString().slice(0, 10);
    const ytd = span(latest, m, nextStart);
    const before = span(yearBack(latest), m, fy.start);
    return ytd && before ? fy.val + ytd.val - before.val : null;
  }
  return null;
}

/** Reads the facts into the table. Throws when the JSON is not a companyfacts document. */
/**
 * What each key's concept is called when a filer names it its own way: a
 * concept matching the pattern (and none of `not`) in the filings that the
 * key's list does not name is a concept the app could read but does not.
 * Only the keys a figure on a screen stands on are looked for.
 */
const LOOKS_LIKE: Partial<Record<Flow | Balance, { re: RegExp; not?: RegExp }>> = {
  revenue: { re: /Revenue|^Sales|SalesRevenue|TurnoverRevenue/, not: /Deferred|Unearned|Cost|Receivable|Percent|Contract(?:With)?CustomerLiability|Remaining|Unbilled|Increase|Recogni[sz]ed(?:That|In)|Tax|Expense|Assessed$/ },
  costOfRevenue: { re: /^CostOf|CostOfSales|CostsOfRevenue/, not: /Percent|Capitali[sz]ed|Contract/ },
  grossProfit: { re: /GrossProfit|GrossMargin/, not: /Percent/ },
  operatingIncome: { re: /OperatingIncome|OperatingProfit|ProfitLossFromOperating|IncomeLossFromOperations|OperatingIncomeLoss/, not: /Nonoperating|NonOperating|Other|Percent|Segment|Tax|Before|Per/ },
  netIncome: { re: /^NetIncome|^ProfitLoss/, not: /Percent|PerShare|Noncontrolling|Other|Comprehensive|Discontinued|Adjustment/ },
  cfo: { re: /OperatingActivities|CashGeneratedFromOperations|CashFlowsFromOperations/, not: /Discontinued|Investing|Financing|Other|Interest|Tax|Adjustment|IncreaseDecrease/ },
  capex: { re: /PropertyPlantAndEquipment|CapitalExpenditure|ProductiveAssets|PurchaseOfProperty|PaymentsForCapitalImprovements/, not: /Proceeds|Sale|Disposal|Depreciation|Gross|Net$|Impairment|Useful|Accumulated|Additions(?!ToProperty)/ },
  sbc: { re: /ShareBasedCompensation|SharebasedPayment|StockBasedCompensation|EquityBasedCompensation/, not: /Tax|Unrecogni[sz]ed|Number|Weighted|Period|Grant|Vested|Award|Options|Reserve|Liabilit/ },
  da: { re: /Depreciation|Amorti[sz]ation/, not: /Accumulated|Impairment|Intangible(?:Assets)?Net|Percent|Useful|Debt|Discount|Premium|Lease(?!s?Right)/ },
  interestExpense: { re: /InterestExpense|FinanceCost|InterestPaid|InterestCost/, not: /Income|Capitali[sz]ed|Receiv|Accrued|Payable|Rate|Lease|Deposit|Amorti/ },
  debt: { re: /Borrowings|LongTermDebt|NotesPayable|SeniorNotes|ConvertibleNotes|LoansPayable|DebtInstrumentCarryingAmount|DebtCurrentAndNoncurrent/, not: /Proceeds|Repayment|Repayments|Interest|FairValue|Rate|Maturit|Fees|Covenant|Issuance|Increase|Decrease|Gain|Loss|Term$|Percent|Unamortized|Discount/ },
  equity: { re: /StockholdersEquity|^Equity$|EquityAttributable|ShareholdersEquity/, not: /Per|Increase|Other|Note|Ratio|Percent|Change|Adjustment|Comprehensive/ },
};

/** The concepts in the filings that look like a key the app found nothing for, in its units, filed within two years of the latest fact; the most filed first. */
function unreadFor(facts: CompanyFacts, k: Flow | Balance, currency: string | null, since: string): string[] {
  const look = LOOKS_LIKE[k];
  if (!look) return [];
  // A concept read under any key (other short-term borrowings, read as short-term debt) is one the app reads, never named as unread.
  const known = new Set([...Object.values(CONCEPTS), INVENTORIES_EXPENSED].flatMap((c) => c.names));
  const allowed = unitsFor(CONCEPTS[k].measure, currency);
  const found: { name: string; n: number }[] = [];
  for (const [taxonomy, entries] of Object.entries(facts.facts)) {
    if (taxonomy === "dei") continue;
    for (const [local, raw] of Object.entries(entries)) {
      const name = taxonomy === "us-gaap" ? local : `${taxonomy}:${local}`;
      if (known.has(name) || !look.re.test(local) || look.not?.test(local)) continue;
      const entry = concept.safeParse(raw);
      if (!entry.success) continue;
      let n = 0;
      for (const [unit, pts] of Object.entries(entry.data.units)) {
        if (!allowed(unit)) continue;
        for (const p of pts) {
          const r = point.safeParse(p);
          if (r.success && r.data.end >= since) n += 1;
        }
      }
      if (n) found.push({ name, n });
    }
  }
  return found.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 4).map((f) => f.name);
}

/** The latest end date any fact of the filer carries. */
function latestEnd(facts: CompanyFacts): string {
  let last = "";
  for (const entries of Object.values(facts.facts))
    for (const raw of Object.values(entries)) {
      const entry = concept.safeParse(raw);
      if (!entry.success) continue;
      for (const pts of Object.values(entry.data.units))
        for (const p of pts) {
          const end = (p as { end?: unknown }).end;
          if (typeof end === "string" && end > last) last = end;
        }
    }
  return last;
}

export function factsTable(json: unknown): FactsTable {
  const parsed = companyFactsSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Not a company facts document${issue ? ` (${issue.path.join(".") || "root"}: ${issue.message})` : ""}.`);
  }
  const facts = parsed.data;
  const currency = currencyOf(facts);
  const splits = splitsOf(facts, currency);
  const annual = {} as Record<Flow, Series>;
  const quarterly = {} as Record<Flow, Series>;
  const spans = {} as Record<Flow, Duration[]>;
  const balances = {} as Record<Balance, Series>;
  const missing: (Flow | Balance)[] = [];
  const concept: FactsTable["concept"] = {};
  const conceptOf = (k: Flow | Balance) => CONCEPTS[k].names.find((name) => pointsOf(facts, name, CONCEPTS[k].measure, currency).length);
  for (const k of FLOWS) {
    const ds = durations(facts, k, currency, splits);
    if (!ds.length) missing.push(k);
    else concept[k] = conceptOf(k);
    const p = periodsOf(ds, CONCEPTS[k].measure !== "shares");
    spans[k] = ds;
    annual[k] = p.annual;
    quarterly[k] = p.quarterly;
  }
  const derived: string[] = [];
  for (const s of splits) derived.push(`per-share figures and share counts filed before ${s.filed} are put on today's share count, after a ${s.factor >= 1 ? `${s.factor}-for-1` : `1-for-${Math.round(1 / s.factor)}`} split the later filings restated`);
  // No cost of sales and no gross profit line: the cost of inventories expensed stands in for cost of revenue, said so.
  if (missing.includes("costOfRevenue") && missing.includes("grossProfit")) {
    const ds = durationsOf(facts, INVENTORIES_EXPENSED, currency, splits);
    if (ds.length) {
      const p = periodsOf(ds, true);
      spans.costOfRevenue = ds;
      annual.costOfRevenue = p.annual;
      quarterly.costOfRevenue = p.quarterly;
      concept.costOfRevenue = INVENTORIES_EXPENSED.names[0];
      missing.splice(missing.indexOf("costOfRevenue"), 1);
      derived.push("cost of revenue is the cost of inventories recognised as an expense, since the filings report no cost of sales line; gross profit on it leaves out costs that never pass through inventories");
    }
  }
  // Many filers report no gross profit line (a retailer, a platform, a card network); revenue less cost of revenue is the same figure.
  let builtGross = 0;
  for (const [rev, cost, gross] of [[annual.revenue, annual.costOfRevenue, annual.grossProfit], [quarterly.revenue, quarterly.costOfRevenue, quarterly.grossProfit]] as const) {
    for (const key of Object.keys(rev)) {
      if (key in gross || !(key in cost)) continue;
      gross[key] = rev[key] - cost[key];
      builtGross += 1;
    }
  }
  if (builtGross) {
    derived.push("gross profit is revenue less cost of revenue where the filings report no gross profit line");
    const i = missing.indexOf("grossProfit");
    if (i >= 0) missing.splice(i, 1);
  }
  // D&A filed only as its two parts: their sum, for each period both report and no combined line does.
  const ownDa = new Set(spans.da.map((d) => `${d.start}|${d.end}`));
  const [depreciation, amortisation] = DA_PARTS.map((part) => new Map(durationsOf(facts, part, currency, splits).map((d) => [`${d.start}|${d.end}`, d])));
  const summedDa: Duration[] = [];
  for (const [id, d] of depreciation) {
    const a = amortisation.get(id);
    if (!a || ownDa.has(id)) continue;
    summedDa.push({ start: d.start, end: d.end, val: d.val + a.val, filed: d.filed > a.filed ? d.filed : a.filed, fp: d.fp ?? a.fp });
  }
  if (summedDa.length) {
    const ds = [...spans.da, ...summedDa];
    const p = periodsOf(ds, true);
    spans.da = ds;
    annual.da = p.annual;
    quarterly.da = p.quarterly;
    derived.push("depreciation and amortisation is the depreciation and the amortisation lines added together where the filings report no combined line");
    const i = missing.indexOf("da");
    if (i >= 0) {
      missing.splice(i, 1);
      concept.da = DA_PARTS.map((part) => part.names.find((name) => pointsOf(facts, name, part.measure, currency).length)).join(" + ");
    }
  }
  for (const k of BALANCES) {
    latestDateFor = {};
    balances[k] = instants(facts, k, currency, splits);
    if (!Object.keys(balances[k]).length) missing.push(k);
    else concept[k] = conceptOf(k);
  }
  const lead = Object.keys(quarterly.revenue).length ? quarterly.revenue : quarterly.netIncome;
  const latestQuarter = Object.keys(lead).sort().at(-1) ?? null;
  const leadYears = Object.keys(annual.revenue).length ? annual.revenue : annual.netIncome;
  const years = Object.keys(leadYears).sort().slice(-5);
  const ttm = {} as Record<Flow, number | null>;
  const priorTtm = {} as Record<Flow, number | null>;
  const average = (k: Flow) => k === "dilutedShares";
  let basis: FactsTable["basis"] = "none";
  let period: string | null = null;
  if (latestQuarter) {
    const last8 = quarterKeys(latestQuarter, 8);
    const fromYtd: Flow[] = [];
    for (const k of FLOWS) {
      let now = sumOrNull(quarterly[k], last8.slice(0, 4));
      let before = sumOrNull(quarterly[k], last8.slice(4));
      // A quarter filed only inside a year-to-date figure: the year, plus this year to date, less last year's.
      const additive = CONCEPTS[k].measure !== "shares";
      if (now === null && additive) {
        now = ttmFromYearToDate(spans[k], latestQuarter);
        if (now !== null) fromYtd.push(k);
      }
      if (before === null && additive) before = ttmFromYearToDate(spans[k], last8[4]);
      ttm[k] = now === null ? null : average(k) ? now / 4 : now;
      priorTtm[k] = before === null ? null : average(k) ? before / 4 : before;
    }
    if (fromYtd.length) derived.push(`the twelve months of ${fromYtd.map((k) => LABEL[k].toLowerCase()).join(", ")} are the last fiscal year plus this year to date less the same months a year before, since the filings do not give each quarter on its own`);
    basis = "ttm";
    period = `TTM to ${latestQuarter}`;
  } else if (years.length) {
    const y = years.at(-1)!;
    const prior = String(Number(y) - 1);
    for (const k of FLOWS) {
      ttm[k] = annual[k][y] ?? null;
      priorTtm[k] = annual[k][prior] ?? null;
    }
    basis = "annual";
    period = `FY${y}`;
  } else {
    for (const k of FLOWS) {
      ttm[k] = null;
      priorTtm[k] = null;
    }
  }
  const last = latestEnd(facts);
  const since = last ? `${Number(last.slice(0, 4)) - 2}${last.slice(4)}` : "";
  const unread: FactsTable["unread"] = {};
  for (const k of missing) {
    const names = unreadFor(facts, k, currency, since);
    if (names.length) unread[k] = names;
  }
  return { cik: facts.cik, entity: facts.entityName ?? "", currency, latestQuarter, basis, period, years, annual, quarterly, balances, ttm, priorTtm, missing, concept, derived, splits, unread };
}

/** How many trailing EPS readings the filings file keeps per company: three years of quarters, enough for a year's range of the P/E as each quarter was known. */
export const EPS_HISTORY_QUARTERS = 12;

/**
 * The trailing twelve months' diluted EPS at each of the last quarters, by
 * the calendar day the quarter ended (four quarters summed, on today's share
 * count as the table already is); a quarter missing any of its four is left
 * out. A filer of years alone gives each year's EPS at its year end. Pure;
 * the portfolio's P/E history reads it (lib/portfolio-pe.ts).
 */
export function ttmEpsHistory(t: FactsTable, n = EPS_HISTORY_QUARTERS): { end: string; eps: number }[] {
  const q = t.quarterly.epsDiluted ?? {};
  if (t.latestQuarter && Object.keys(q).length) {
    const keys = quarterKeys(t.latestQuarter, n + 3);
    const out: { end: string; eps: number }[] = [];
    for (let i = 0; i < n; i++) {
      const four = keys.slice(i, i + 4);
      if (four.length < 4 || four.some((k) => !(k in q))) continue;
      const [y, qq] = four[0].split("Q").map(Number);
      out.push({ end: quarterEnds(y)[qq - 1], eps: Math.round(four.reduce((s2, k) => s2 + q[k], 0) * 1e4) / 1e4 });
    }
    return out.reverse();
  }
  const a = t.annual.epsDiluted ?? {};
  return Object.keys(a)
    .sort()
    .slice(-Math.ceil(n / 4))
    .map((y) => ({ end: `${y}-12-31`, eps: Math.round(a[y] * 1e4) / 1e4 }));
}

/** How many trailing per-share readings the filings file keeps per company: five years of quarters and the two before, for a five-year valuation history as each quarter was known. */
export const PER_SHARE_HISTORY_QUARTERS = 22;

export type PerShareTtm = { end: string; revenue: number | null; grossProfit: number | null; eps: number | null; fcf: number | null };

/**
 * The trailing twelve months' sales, gross profit, diluted EPS and free cash
 * flow per share at each of the last quarters, by the calendar day the
 * quarter ended (Hamza, 20 Oct 2026: a five-year chart of the valuation
 * metric chosen). Four quarters summed, over the diluted shares of the last
 * of them, on today's share count as the table already is; free cash flow is
 * operating cash flow less capex and intangibles, as everywhere. A line
 * missing any of its four quarters is null; a quarter with none is left out.
 * A filer of years alone gives each year's figures at its year end. Pure.
 */
export function ttmPerShareHistory(t: FactsTable, n = PER_SHARE_HISTORY_QUARTERS): PerShareTtm[] {
  const r4 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
  const row = (end: string, sum: (k: Flow) => number | null, shares: number | null, eps: number | null): PerShareTtm | null => {
    const per = (v: number | null) => (v === null || !shares || shares <= 0 ? null : r4(v / shares));
    const cfo = sum("cfo");
    const capex = sum("capex");
    const fcf = cfo === null || capex === null ? null : cfo - capex - (sum("intangiblesPurchases") ?? 0);
    const out = { end, revenue: per(sum("revenue")), grossProfit: per(sum("grossProfit")), eps: r4(eps), fcf: per(fcf) };
    return out.revenue === null && out.grossProfit === null && out.eps === null && out.fcf === null ? null : out;
  };
  if (t.latestQuarter && Object.keys(t.quarterly.revenue ?? {}).length) {
    const keys = quarterKeys(t.latestQuarter, n + 3);
    const out: PerShareTtm[] = [];
    for (let i = 0; i < n; i++) {
      const four = keys.slice(i, i + 4);
      if (four.length < 4) continue;
      const sum = (k: Flow) => {
        const q = t.quarterly[k] ?? {};
        return four.every((x) => x in q) ? four.reduce((a, x) => a + q[x], 0) : null;
      };
      const shares = t.quarterly.dilutedShares?.[four[0]] ?? null;
      const [y, qq] = four[0].split("Q").map(Number);
      const r = row(quarterEnds(y)[qq - 1], sum, shares, sum("epsDiluted"));
      if (r) out.push(r);
    }
    return out.reverse();
  }
  return t.years.slice(-Math.ceil(n / 4)).flatMap((y) => {
    const r = row(`${y}-12-31`, (k) => t.annual[k]?.[y] ?? null, t.annual.dilutedShares?.[y] ?? null, t.annual.epsDiluted?.[y] ?? null);
    return r ? [r] : [];
  });
}

/** The quarters a balance may stand for the trailing period: its four quarters, or the latest fiscal year's. */
function balanceWindow(t: FactsTable): ((k: string) => boolean) | null {
  if (t.latestQuarter) {
    const keys = new Set(quarterKeys(t.latestQuarter, 4));
    return (k) => keys.has(k);
  }
  if (t.basis === "annual") {
    // A fiscal year ending mid-year is keyed by the calendar year before, so its year-end balance is dated the year after.
    const y = Number(t.years.at(-1));
    return (k) => Number(k.slice(0, 4)) === y || Number(k.slice(0, 4)) === y + 1;
  }
  return null;
}

/** The latest balance within the trailing period (its four quarters, or the latest year); a line last reported before it is none, see lastReported. */
export function latestBalance(t: FactsTable, key: Balance): { value: number; quarter: string } | null {
  const inWindow = balanceWindow(t);
  const keys = Object.keys(t.balances[key]).sort();
  const upTo = t.latestQuarter ? keys.filter((k) => k <= t.latestQuarter!) : keys;
  const q = upTo.filter((k) => !inWindow || inWindow(k)).at(-1);
  return q ? { value: t.balances[key][q], quarter: q } : null;
}

/** The quarter a balance was last reported at, however long ago; null when never. */
export function lastReported(t: FactsTable, key: Balance): string | null {
  return Object.keys(t.balances[key]).sort().at(-1) ?? null;
}

export type Fundamentals = { values: Partial<Record<FundamentalField, number | null>>; notes: string[] };

/** The tax taken off operating income for NOPAT: one statutory rate, so every filer is read on the same basis. */
export const TAX_RATE = 0.21;
const pctChange = (now: number | null, before: number | null) => (now === null || before === null || before <= 0 ? null : ((now - before) / before) * 100);
const ratio = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);

/**
 * The ontology's fundamentals for the company, from the trailing twelve months
 * and the latest balances; `price` (the holding's, when held) is needed for
 * the price to earnings and dividend yield. When `priceCurrency` (the
 * holding's) is not the filings' own, `fx` (listing units per one filing
 * unit, read at the day's rate by `listingRate`) carries the price into the
 * filings' currency, one listed share taken as one filed share; without it a
 * Novo Nordisk ADR priced in dollars against earnings filed in kroner is no
 * ratio, and said so. A balance last reported before the trailing period
 * (Uber's non-current securities, last filed in 2019) is read as none and
 * said so. Each null carries a note.
 */
/** The lines each fundamental reads, so a figure the app could not derive names the concepts it missed. */
const FIELD_READS: Partial<Record<FundamentalField, (Flow | Balance)[]>> = {
  revenue_growth_pct: ["revenue"],
  gross_margin_pct: ["grossProfit", "costOfRevenue"],
  operating_margin_pct: ["operatingIncome"],
  operating_margin_change_pts: ["operatingIncome"],
  fcf_margin_pct: ["cfo", "capex"],
  fcf_conversion: ["cfo", "capex", "netIncome"],
  fcf_per_share_growth_pct: ["cfo", "capex"],
  roic_pct: ["operatingIncome", "equity", "debt"],
  net_debt: ["debt", "cash"],
  cash_to_debt_pct: ["debt", "cash"],
  net_debt_to_ebitda: ["debt", "cash", "operatingIncome", "da"],
  interest_cover: ["interestExpense", "operatingIncome"],
  altman_z: ["assets", "assetsCurrent", "liabilitiesCurrent", "retainedEarnings", "operatingIncome", "revenue"],
};

export function fundamentalsOf(t: FactsTable, price: number | null = null, priceCurrency: string | null = null, fx: number | null = null): Fundamentals {
  const values: Partial<Record<FundamentalField, number | null>> = {};
  const notes: string[] = [];
  const miss = (field: FundamentalField, why: string) => {
    values[field] = null;
    // A line the filings carry under a concept the app does not read yet is the app's gap, named so it is fixed, never shown as the company's.
    const names = [...new Set((FIELD_READS[field] ?? []).flatMap((k) => t.unread?.[k] ?? []))];
    notes.push(`${field}: ${why}${names.length ? `; the filings carry ${names.slice(0, 3).join(", ")} under a name the app does not read yet` : ""}`);
  };
  const { ttm, priorTtm } = t;
  // The price is usable only in the filings' currency: carried there at the day's rate when one is given, else none.
  const listing = priceCurrency?.toUpperCase() ?? null;
  const differs = price !== null && !!listing && !!t.currency && listing !== t.currency;
  const converted = differs && fx && fx > 0;
  const otherCurrency = differs && !converted ? `the price is in ${listing} and the filings in ${t.currency}; read as none` : null;
  if (converted) notes.push(`pe_ratio, dividend_yield_pct: the price in ${listing} is read in ${t.currency} at 1 ${t.currency} = ${fx.toLocaleString("en-US", { maximumSignificantDigits: 4 })} ${listing}, one listed share taken as one filed share`);
  const priceInFilings = price === null ? null : converted ? price / fx : price;
  // A balance line that stopped before the trailing period is none, with the quarter it was last filed at.
  const stale = (key: Balance) => {
    if (latestBalance(t, key)) return null;
    const last = lastReported(t, key);
    return last ? `last reported at ${last}, before the trailing period; read as none` : null;
  };
  for (const key of ["marketableSecurities", "longTermInvestments", "shortTermDebt", "financeLeases", "minorityInterest", "loansReceivable", "goodwill", "intangibles"] as const) {
    const why = stale(key);
    if (why) notes.push(`${LABEL[key].toLowerCase()}: ${why}`);
  }
  for (const s of t.splits) notes.push(`per-share figures filed before ${s.filed} are on today's share count (a ${s.factor >= 1 ? `${s.factor}-for-1` : `1-for-${Math.round(1 / s.factor)}`} split)`);
  if (t.basis === "none") {
    for (const f of ["revenue_growth_pct", "gross_margin_pct", "fcf_margin_pct", "fcf_conversion", "fcf_conversion_operating", "nonoperating_share_of_net_income_pct", "interest_cover", "interest_cover_net", "net_interest_expense", "cash_to_debt_pct", "net_debt", "loans_to_equity", "roic_pct", "invested_capital", "roic_ex_goodwill_pct", "goodwill_share_of_capital_pct", "operating_margin_pct", "operating_margin_change_pts", "net_debt_to_ebitda", "operating_leverage", "fcf_per_share_growth_pct", "eps_growth_pct", "pe_ratio", "forward_pe", "ps_ratio", "forward_ps", "pfcf_ratio", "forward_pfcf", "implied_growth_pct", "dividend_yield_pct", "payout_ratio_pct", "capital_returned_pct", "altman_z"] as const) miss(f, "no revenue or net income for a quarter or a year in the filings");
  } else {
    if (t.basis === "annual") notes.push(`figures are for ${t.period} against the year before: the company files no quarterly reports with the SEC`);
    const rev = ttm.revenue;
    const revGrowth = pctChange(rev, priorTtm.revenue);
    if (revGrowth === null) miss("revenue_growth_pct", t.basis === "annual" ? "revenue is not reported for two fiscal years" : "revenue is not reported for eight full quarters");
    else values.revenue_growth_pct = revGrowth;
    const gm = ratio(ttm.grossProfit, rev);
    if (gm === null) miss("gross_margin_pct", t.missing.includes("costOfRevenue") ? "neither gross profit nor cost of revenue is reported" : "gross profit is not reported for every quarter of the period");
    else {
      values.gross_margin_pct = gm * 100;
      if (t.concept.costOfRevenue === INVENTORIES_EXPENSED.names[0]) notes.push("gross_margin_pct: revenue less the cost of inventories recognised as an expense; the filings report no cost of sales or gross profit line, so costs outside inventories are not taken out");
      else if (t.derived.some((d) => d.startsWith("gross profit"))) notes.push("gross_margin_pct: gross profit is revenue less cost of revenue; the filings report no gross profit line");
    }
    // Free cash flow is cash from operations less purchases of property, equipment and intangibles (a filer with no intangibles line buys none).
    const fcf = ttm.cfo === null || ttm.capex === null ? null : ttm.cfo - ttm.capex - (ttm.intangiblesPurchases ?? 0);
    const priorFcf = priorTtm.cfo === null || priorTtm.capex === null ? null : priorTtm.cfo - priorTtm.capex - (priorTtm.intangiblesPurchases ?? 0);
    if (fcf !== null && ttm.intangiblesPurchases) notes.push("free cash flow: purchases of intangibles are taken out with capital expenditure");
    const fm = ratio(fcf, rev);
    if (fm === null) miss("fcf_margin_pct", "cash from operations or capital expenditure is not reported");
    else values.fcf_margin_pct = fm * 100;
    const conv = ratio(fcf, ttm.netIncome);
    if (conv === null || (ttm.netIncome ?? 0) <= 0) miss("fcf_conversion", fcf === null ? "free cash flow cannot be derived" : "net income is not positive");
    else values.fcf_conversion = conv;
    // After-tax operating income as the base, for when non-operating gains or losses distort net income.
    const nopat = ttm.operatingIncome === null ? null : ttm.operatingIncome * (1 - TAX_RATE);
    if (fcf === null || nopat === null || nopat <= 0) miss("fcf_conversion_operating", fcf === null ? "free cash flow cannot be derived" : "operating income is not positive");
    else values.fcf_conversion_operating = fcf / nopat;
    if (ttm.netIncome === null || ttm.netIncome <= 0) miss("nonoperating_share_of_net_income_pct", "net income is not positive");
    else {
      values.nonoperating_share_of_net_income_pct = (Math.abs(ttm.nonoperatingIncome ?? 0) / ttm.netIncome) * 100;
      if (ttm.nonoperatingIncome === null) notes.push("nonoperating_share_of_net_income_pct: the filings report no non-operating line; read as none");
    }
    const equity = latestBalance(t, "equity");
    const debt = latestBalance(t, "debt");
    const cash = latestBalance(t, "cash");
    const shortDebt = latestBalance(t, "shortTermDebt");
    const leases = latestBalance(t, "financeLeases");
    const securities = latestBalance(t, "marketableSecurities");
    const longInvestments = latestBalance(t, "longTermInvestments");
    const minority = latestBalance(t, "minorityInterest");
    const loans = latestBalance(t, "loansReceivable");
    // Debt is the total: a non-current line gets the current one added; a total line stands alone.
    const debtIsNoncurrent = /Noncurrent|NoncurrentBorrowings/.test(t.concept.debt ?? "");
    // A filer with only current borrowings on its balance sheet: those are its debt.
    const totalDebt = debt === null ? (shortDebt === null ? null : shortDebt.value + (leases?.value ?? 0)) : debt.value + (debtIsNoncurrent ? (shortDebt?.value ?? 0) : 0) + (leases?.value ?? 0);
    if (debt === null && shortDebt) notes.push("debt: the filings report current borrowings alone, read as the whole debt");
    if (debt && debtIsNoncurrent && shortDebt) notes.push("debt: the current portion is added to the non-current line");
    if (debt && leases) notes.push("debt: finance leases are counted with debt");
    const equityIncludesMinority = /IncludingPortionAttributableToNoncontrollingInterest|ifrs-full:Equity$/.test(t.concept.equity ?? "");
    const totalEquity = equity === null ? null : equity.value + (equityIncludesMinority ? 0 : (minority?.value ?? 0));
    const liquid = cash === null ? null : cash.value + (securities?.value ?? 0) + (longInvestments?.value ?? 0);
    if (totalDebt === null) {
      const why = stale("debt") ?? "no debt concept reported";
      miss("cash_to_debt_pct", why);
      miss("net_debt", why);
    } else if (liquid === null) {
      const why = stale("cash") ?? "cash is not reported";
      miss("cash_to_debt_pct", why);
      miss("net_debt", why);
    } else {
      values.net_debt = totalDebt - liquid;
      if (totalDebt > 0) values.cash_to_debt_pct = (liquid / totalDebt) * 100;
      else miss("cash_to_debt_pct", "debt is zero; see net_debt");
    }
    if (ttm.interestExpense === null || ttm.interestExpense <= 0 || ttm.operatingIncome === null) miss("interest_cover", "interest expense or operating income is not reported");
    else values.interest_cover = ttm.operatingIncome / ttm.interestExpense;
    if (ttm.interestExpense === null && ttm.interestIncome === null) {
      miss("net_interest_expense", "neither interest expense nor interest income is reported");
      miss("interest_cover_net", "neither interest expense nor interest income is reported");
    } else {
      const net = (ttm.interestExpense ?? 0) - (ttm.interestIncome ?? 0);
      values.net_interest_expense = net;
      if (net <= 0) miss("interest_cover_net", "net interest is income, not expense");
      else if (ttm.operatingIncome === null) miss("interest_cover_net", "operating income is not reported");
      else values.interest_cover_net = ttm.operatingIncome / net;
    }
    if (!totalEquity || totalEquity <= 0) miss("loans_to_equity", stale("equity") ?? "equity is not positive");
    else {
      values.loans_to_equity = (loans?.value ?? 0) / totalEquity;
      if (!loans) notes.push("loans_to_equity: the filings report no loans receivable line; read as none");
    }
    if (ttm.operatingIncome === null || totalEquity === null) {
      const eq = stale("equity") ?? "equity is not reported";
      miss("invested_capital", eq);
      miss("roic_pct", totalEquity === null ? eq : "operating income is not reported");
      miss("roic_ex_goodwill_pct", totalEquity === null ? eq : "operating income is not reported");
      miss("goodwill_share_of_capital_pct", eq);
    } else {
      const invested = totalEquity + (totalDebt ?? 0) - (cash?.value ?? 0) - (securities?.value ?? 0);
      values.invested_capital = invested;
      if (!debt) notes.push("invested_capital: no debt concept reported; equity less cash and securities");
      if (minority && !equityIncludesMinority) notes.push("invested_capital: minority interests are counted with equity");
      const acquired = (latestBalance(t, "goodwill")?.value ?? 0) + (latestBalance(t, "intangibles")?.value ?? 0);
      if (invested <= 0) {
        miss("roic_pct", "invested capital is not positive: every return on it is unbounded");
        miss("goodwill_share_of_capital_pct", "invested capital is not positive");
      } else {
        values.roic_pct = ((ttm.operatingIncome * (1 - TAX_RATE)) / invested) * 100;
        values.goodwill_share_of_capital_pct = (acquired / invested) * 100;
      }
      if (acquired <= 0) miss("roic_ex_goodwill_pct", "the filings report no goodwill or acquired intangibles");
      else if (invested - acquired <= 0) miss("roic_ex_goodwill_pct", "invested capital less goodwill and intangibles is not positive");
      else values.roic_ex_goodwill_pct = ((ttm.operatingIncome * (1 - TAX_RATE)) / (invested - acquired)) * 100;
    }
    const ebitda = ttm.operatingIncome === null || ttm.da === null ? null : ttm.operatingIncome + ttm.da;
    if (ebitda === null || ebitda <= 0 || totalDebt === null) miss("net_debt_to_ebitda", ebitda === null ? "operating income or depreciation is not reported" : totalDebt === null ? "no debt concept reported" : "EBITDA is not positive");
    else values.net_debt_to_ebitda = (totalDebt - (cash?.value ?? 0)) / ebitda;
    const opGrowth = pctChange(ttm.operatingIncome, priorTtm.operatingIncome);
    if (opGrowth === null || revGrowth === null || Math.abs(revGrowth) < 0.5) miss("operating_leverage", opGrowth === null ? "operating income is not positive in both years" : "revenue growth is too close to zero to divide by");
    else values.operating_leverage = opGrowth / revGrowth;
    const margin = ratio(ttm.operatingIncome, rev);
    const priorMargin = ratio(priorTtm.operatingIncome, priorTtm.revenue);
    if (margin === null) miss("operating_margin_pct", "operating income or revenue is not reported");
    else values.operating_margin_pct = margin * 100;
    if (margin === null || priorMargin === null) miss("operating_margin_change_pts", "operating income or revenue is not reported for both periods");
    else values.operating_margin_change_pts = (margin - priorMargin) * 100;
    const fcfps = fcf !== null && ttm.dilutedShares ? fcf / ttm.dilutedShares : null;
    const priorFcfps = priorFcf !== null && priorTtm.dilutedShares ? priorFcf / priorTtm.dilutedShares : null;
    const fg = pctChange(fcfps, priorFcfps);
    if (fg === null) miss("fcf_per_share_growth_pct", "free cash flow per share is not positive in both years or shares are not reported");
    else values.fcf_per_share_growth_pct = fg;
    const eg = pctChange(ttm.epsDiluted, priorTtm.epsDiluted);
    if (eg === null) miss("eps_growth_pct", "diluted EPS is not positive in both years");
    else values.eps_growth_pct = eg;
    if (price === null) miss("pe_ratio", "no price: the company is not in the book");
    else if (otherCurrency) miss("pe_ratio", otherCurrency);
    else if (ttm.epsDiluted === null || ttm.epsDiluted <= 0) miss("pe_ratio", "trailing EPS is not positive");
    else values.pe_ratio = priceInFilings! / ttm.epsDiluted;
    // The next twelve months as the filings carry them forward (lib/forward.ts), and the trailing price to sales and to free cash flow.
    const perShare = (v: number | null) => (v === null || !ttm.dilutedShares || ttm.dilutedShares <= 0 ? null : v / ttm.dilutedShares);
    const multiple = (field: "forward_pe" | "ps_ratio" | "forward_ps" | "pfcf_ratio" | "forward_pfcf", figure: number | null, why: string) => {
      if (price === null) miss(field, "no price: the company is not in the book");
      else if (otherCurrency) miss(field, otherCurrency);
      else if (figure === null || figure <= 0) miss(field, why);
      else values[field] = priceInFilings! / figure;
    };
    // Carried at revenue growth, not the figure's own, so a one-off gain is not carried forward twice (lib/forward.ts).
    multiple("forward_pe", grownForward(ttm.epsDiluted, revGrowth), "trailing EPS is not positive or revenue growth is not read");
    multiple("ps_ratio", perShare(rev), "revenue or diluted shares are not reported");
    multiple("forward_ps", grownForward(perShare(rev), revGrowth), "revenue per share or its growth is not read");
    multiple("pfcf_ratio", fcfps, "free cash flow per share is not positive");
    multiple("forward_pfcf", grownForward(fcfps, revGrowth), "free cash flow per share is not positive or revenue growth is not read");
    // What the price assumes: the reverse DCF on free cash flow at the filings' own trailing figures (lib/dcf.ts), the app's arithmetic and never a forecast.
    if (price === null) miss("implied_growth_pct", "no price: the company is not in the book");
    else if (otherCurrency) miss("implied_growth_pct", otherCurrency);
    else if (fcf === null || fcf <= 0 || !rev || rev <= 0) miss("implied_growth_pct", "free cash flow or revenue is not positive");
    else {
      const seed = { revenue: rev, fcf, netIncome: ttm.netIncome, sbc: ttm.sbc, dilutedShares: ttm.dilutedShares, revenueGrowthPct: revGrowth, cash: cash?.value ?? null, investments: (securities?.value ?? 0) + (longInvestments?.value ?? 0) || null, debt: totalDebt, balanceLabel: null, periodLabel: null, currency: t.currency };
      // The year only labels the model's rows; the figure does not depend on it.
      const inputs = dcfDefaults("cash_flow", seed, priceInFilings, t.currency, `${/^\d{4}/.test(t.latestQuarter ?? "") ? t.latestQuarter!.slice(0, 4) : "2000"}-01-01`, 1);
      const cagr = inputs ? runDcf(inputs).implied?.cagrPct : null;
      if (!inputs) miss("implied_growth_pct", "diluted shares are not reported");
      else if (cagr === null || cagr === undefined || !Number.isFinite(cagr)) miss("implied_growth_pct", "no path from the trailing one mirrored to six times it meets the price");
      else values.implied_growth_pct = cagr;
    }
    // Altman's 1968 Z-score, the market value at today's price in the filings' currency; liabilities by the balance sheet's identity.
    const assets = latestBalance(t, "assets");
    const currentAssets = latestBalance(t, "assetsCurrent");
    const currentLiabilities = latestBalance(t, "liabilitiesCurrent");
    const retained = latestBalance(t, "retainedEarnings");
    const sharesOut = latestBalance(t, "sharesOutstanding")?.value ?? ttm.dilutedShares ?? null;
    const liabilities = assets && totalEquity !== null ? assets.value - totalEquity : null;
    if (price === null) miss("altman_z", "no price: the company is not in the book");
    else if (otherCurrency) miss("altman_z", otherCurrency);
    else if (!assets || assets.value <= 0) miss("altman_z", stale("assets") ?? "total assets are not reported");
    else if (!currentAssets || !currentLiabilities) miss("altman_z", "current assets or current liabilities are not reported (a bank or an insurer reports neither)");
    else if (!retained) miss("altman_z", stale("retainedEarnings") ?? "retained earnings are not reported");
    else if (ttm.operatingIncome === null || rev === null) miss("altman_z", "operating income or revenue is not reported");
    else if (!sharesOut || sharesOut <= 0) miss("altman_z", "shares outstanding are not reported");
    else if (liabilities === null || liabilities <= 0) miss("altman_z", totalEquity === null ? stale("equity") ?? "equity is not reported" : "total liabilities are not positive");
    else {
      const a = assets.value;
      values.altman_z = (1.2 * (currentAssets.value - currentLiabilities.value)) / a + (1.4 * retained.value) / a + (3.3 * ttm.operatingIncome) / a + (0.6 * priceInFilings! * sharesOut) / liabilities + rev / a;
    }
    if (price === null) miss("dividend_yield_pct", "no price: the company is not in the book");
    else if (otherCurrency) miss("dividend_yield_pct", otherCurrency);
    else if (ttm.dividendPerShare === null) miss("dividend_yield_pct", "dividend per share is not reported");
    else values.dividend_yield_pct = (ttm.dividendPerShare / priceInFilings!) * 100;
    if (ttm.dividendsPaid === null || ttm.netIncome === null || ttm.netIncome <= 0) miss("payout_ratio_pct", ttm.dividendsPaid === null ? "dividends paid are not reported" : "net income is not positive");
    else values.payout_ratio_pct = (ttm.dividendsPaid / ttm.netIncome) * 100;
    // What goes back: buybacks and dividends over free cash flow; a filer reporting neither line returns nothing it reports.
    if (fcf === null || fcf <= 0) miss("capital_returned_pct", fcf === null ? "free cash flow cannot be derived" : "free cash flow is not positive");
    else if (ttm.buybacks === null && ttm.dividendsPaid === null) miss("capital_returned_pct", "neither buybacks nor dividends paid are reported");
    else values.capital_returned_pct = (((ttm.buybacks ?? 0) + (ttm.dividendsPaid ?? 0)) / fcf) * 100;
  }
  const dps = t.annual.dividendPerShare;
  const dpsYears = Object.keys(dps).sort();
  if (dpsYears.length >= 6) {
    const last = dps[dpsYears.at(-1)!];
    const first = dps[dpsYears.at(-6)!];
    if (first > 0 && last > 0) values.dividend_growth_5y_pct = ((last / first) ** (1 / 5) - 1) * 100;
    else miss("dividend_growth_5y_pct", "dividend per share is zero in one of the years");
  } else miss("dividend_growth_5y_pct", dpsYears.length ? "fewer than six years of dividends per share are reported" : "dividend per share is not reported");
  if (dpsYears.length) {
    let raised = 0;
    for (let i = dpsYears.length - 1; i > 0 && dps[dpsYears[i]] > dps[dpsYears[i - 1]]; i--) raised += 1;
    values.dividend_years_raised = raised;
  } else miss("dividend_years_raised", "dividend per share is not reported");
  return { values, notes };
}

const money = (v: number | null | undefined) => (v === null || v === undefined ? "" : Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6).toLocaleString("en-US")}m` : v.toFixed(2));
const pct = (v: number | null) => (v === null ? "" : `${v.toFixed(1)}%`);

export type DerivedRow = { key: "grossMarginPct" | "operatingMarginPct" | "netMarginPct" | "fcf" | "fcfMarginPct" | "cashConversion"; label: string; unit: "pct" | "money" | "ratio"; values: (number | null)[] };

/**
 * Ratios built from the rows above, one value per year and one for the
 * trailing period: margins, free cash flow (cash from operations less
 * capital expenditure) and its margin, and cash conversion (cash from
 * operations over net income). Each is arithmetic on two reported figures,
 * so the writer can cite a margin without working it out; the inputs stay in
 * the table beside it.
 */
export function derivedSeries(t: FactsTable): DerivedRow[] {
  const at = (k: Flow, i: number): number | null => (i < t.years.length ? (t.annual[k][t.years[i]] ?? null) : t.ttm[k]);
  const n = t.years.length + 1;
  const r = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
  const row = (key: DerivedRow["key"], label: string, unit: DerivedRow["unit"], f: (i: number) => number | null): DerivedRow => ({ key, label, unit, values: Array.from({ length: n }, (_, i) => f(i)) });
  const fcf = (i: number) => (at("cfo", i) === null || at("capex", i) === null ? null : at("cfo", i)! - at("capex", i)! - (at("intangiblesPurchases", i) ?? 0));
  const rows = [
    row("grossMarginPct", "Gross margin", "pct", (i) => (r(at("grossProfit", i), at("revenue", i)) === null ? null : r(at("grossProfit", i), at("revenue", i))! * 100)),
    row("operatingMarginPct", "Operating margin", "pct", (i) => (r(at("operatingIncome", i), at("revenue", i)) === null ? null : r(at("operatingIncome", i), at("revenue", i))! * 100)),
    row("netMarginPct", "Net margin", "pct", (i) => (r(at("netIncome", i), at("revenue", i)) === null ? null : r(at("netIncome", i), at("revenue", i))! * 100)),
    row("fcf", "Free cash flow (CFO less capex and intangibles)", "money", fcf),
    row("fcfMarginPct", "Free cash flow margin", "pct", (i) => (r(fcf(i), at("revenue", i)) === null ? null : r(fcf(i), at("revenue", i))! * 100)),
    row("cashConversion", "Cash conversion (CFO over net income)", "ratio", (i) => ((at("netIncome", i) ?? 0) > 0 ? r(at("cfo", i), at("netIncome", i)) : null)),
  ];
  return rows.filter((x) => x.values.some((v) => v !== null));
}

/** The derived rows as text lines, in the facts table's columns. */
function derivedText(t: FactsTable): string[] {
  const rows = derivedSeries(t);
  if (!rows.length) return [];
  return ["Derived from the rows above (each is one reported figure over or less another):", ...rows.map((d) => [d.label, ...d.values.map((v) => (d.unit === "pct" ? pct(v) : d.unit === "money" ? money(v) : v === null ? "" : `${v.toFixed(2)}x`))].join(" | "))];
}

/**
 * The latest reported quarter against the same quarter a year earlier, for
 * every flow both quarters carry, with the change in percent where the
 * earlier figure is positive. Empty for a filer with no quarters.
 */
export function latestQuarterText(t: FactsTable): string[] {
  if (!t.latestQuarter) return [];
  const q = t.latestQuarter;
  const yearAgo = `${Number(q.slice(0, 4)) - 1}${q.slice(4)}`;
  const lines: string[] = [];
  for (const k of FLOWS) {
    const now = t.quarterly[k][q];
    const before = t.quarterly[k][yearAgo];
    if (now === undefined || before === undefined) continue;
    const perShare = CONCEPTS[k].measure === "perShare";
    const fmt = (v: number) => (perShare ? v.toFixed(2) : money(v));
    const change = before > 0 ? ` (${now >= before ? "+" : ""}${(((now - before) / before) * 100).toFixed(1)}%)` : "";
    lines.push(`${LABEL[k]}: ${fmt(now)} vs ${fmt(before)}${change}`);
  }
  return lines.length ? [`Latest quarter, ${q}, against ${yearAgo}:`, ...lines] : [];
}

/** The figures a study keeps for its charts and tables: the columns, the reported rows and the derived ones, numbers as they are. */
export type StudyTable = { cols: string[]; rows: { key: string; label: string; unit: "money" | "perShare" | "shares" | "pct" | "ratio"; values: (number | null)[] }[] };

export function studyTable(t: FactsTable): StudyTable {
  // An annual filer's trailing period is its last fiscal year itself, so that column would repeat the year beside it (FY25, FY25); the years alone stand.
  const trailing = t.basis !== "annual";
  const cols = trailing ? [...t.years, t.period ?? "TTM"] : [...t.years];
  const cut = <T,>(xs: T[]) => (trailing ? xs : xs.slice(0, t.years.length));
  const reported = FLOWS.filter((k) => !t.missing.includes(k)).map((k) => ({ key: k, label: LABEL[k], unit: CONCEPTS[k].measure, values: cut([...t.years.map((y) => t.annual[k][y] ?? null), t.ttm[k]]) }));
  const derived = derivedSeries(t).map((d) => ({ key: d.key, label: d.label, unit: d.unit, values: cut(d.values) }));
  return { cols, rows: [...reported, ...derived] };
}

/**
 * The table as text for the writer: one row per concept, the last five years
 * and the trailing twelve months, money in millions of the reporting currency.
 * Every figure the writer may cite is here; nothing else is a fact.
 */
export function factsText(t: FactsTable): string {
  const cols = [...t.years, t.period ?? "TTM"];
  const rows = FLOWS.filter((k) => !t.missing.includes(k)).map((k) => [LABEL[k], ...t.years.map((y) => money(t.annual[k][y])), money(t.ttm[k])].join(" | "));
  const bal = BALANCES.filter((k) => !t.missing.includes(k)).map((k) => {
    const b = latestBalance(t, k);
    return b ? `${LABEL[k]} at ${b.quarter}: ${money(b.value)}` : `${LABEL[k]}: not reported`;
  });
  return [`${t.entity} (CIK ${t.cik}). Figures from SEC filings, in millions${t.currency ? ` of ${t.currency}` : ""} unless per share.`, `Concept | ${cols.join(" | ")}`, ...rows, ...derivedText(t), ...bal, ...latestQuarterText(t), shareBasisNote(t), ...t.derived.map((d) => `Derived: ${d}.`), t.missing.length ? `Not reported: ${t.missing.map((k) => LABEL[k].toLowerCase()).join(", ")}.` : ""].filter(Boolean).join("\n");
}

/**
 * Old years come from old filings and are not restated for a later split, so
 * the share count can jump between two years while the business did not.
 * The note names the last year on the old basis, so no one compares
 * per-share figures across it; empty when the counts are continuous.
 */
export function shareBasisNote(t: FactsTable): string {
  const years = t.years.filter((y) => typeof t.annual.dilutedShares[y] === "number" && t.annual.dilutedShares[y]! > 0);
  let last: string | null = null;
  for (let i = 1; i < years.length; i++) {
    const ratio = t.annual.dilutedShares[years[i]]! / t.annual.dilutedShares[years[i - 1]]!;
    if (ratio >= 1.8 || ratio <= 1 / 1.8) last = years[i - 1];
  }
  return last ? `Share basis: diluted shares, EPS and dividend per share through ${last} are on a different share basis from later years (a split since, not restated in the older filings); compare per-share figures only within one basis.` : "";
}
