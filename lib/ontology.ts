/**
 * The ontology: the pre-coded labelling of what exists in a person's book and
 * what can be done with it. Everything a methodology can refer to is here, by
 * name: the objects (holdings, transactions, look-through rows), each field
 * with its type, its unit and the input that supplies it, the measures, the
 * time windows, the groupings, the comparators and the built-in panels the app
 * knows how to draw.
 *
 * The methodology is the graph laid over it (lib/methodology.ts): figures,
 * classes and rules written as recipes in this vocabulary (lib/recipes.ts).
 * Nothing here belongs to one investing style; a style's figures come from its
 * own document.
 *
 * A field no input supplies yet (company fundamentals) is still named, with
 * `suppliedBy: "none"`, so a methodology that needs it is told so rather than
 * handed a zero. Pure: the screens, the drafter and the checks share it.
 */
import { ASSET_CLASSES, baseAmountOf, DEFAULT_RATE, spotsFor, toBase, TRANSACTION_KINDS, VALUATION_SOURCES, type Book, type Holding, type LookThroughRow, type Transaction } from "@/lib/holdings";
import type { MarketRow } from "@/lib/markets";
import { contractView, daysToExpiry } from "@/lib/options";
import type { InputId, Module } from "@/lib/setup";

export const OBJECTS = ["holdings", "transactions", "lookthrough", "markets", "series"] as const;
export type ObjectId = (typeof OBJECTS)[number];
export const OBJECT_LABEL: Record<ObjectId, string> = { holdings: "holdings", transactions: "transactions", lookthrough: "companies inside funds", markets: "market indicators", series: "time series" };
/** Objects a measure can be taken over; a time series is read by the series operation instead. */
export const MEASURABLE = ["holdings", "transactions", "lookthrough", "markets"] as const;

export type FieldType = "money" | "number" | "pct" | "ratio" | "days" | "date" | "text" | "enum" | "flag" | "list" | "series";
export type FieldValue = number | string | boolean | string[] | null;

const BROKERS: readonly InputId[] = ["ibkr", "schwab", "other_broker", "etoro"];
const ANY: readonly InputId[] = ["ibkr", "schwab", "other_broker", "etoro", "bank_statements", "fund_reports", "property", "other_assets"];

export type FieldDef = {
  object: ObjectId;
  label: string;
  type: FieldType;
  /** Allowed values for an enum. */
  values?: readonly string[];
  /** Inputs that can supply it; "feed" for the public market feed, which needs no input; "none" when no connection offers it yet. */
  suppliedBy: readonly InputId[] | "feed" | "none";
  about: string;
};

export type EvalCtx = {
  book: Book;
  today: string;
  /** Market inputs for the Greeks, built once per evaluation. */
  market: { today: string; rate: number; spots: Record<string, number> };
  /** The class a methodology gives each holding, by holding id; null when unclassified. */
  classOf: (h: Holding) => string | null;
  /** Fields the book carries values for beyond what the inputs supply: company fundamentals laid on holdings by research. */
  supplied: ReadonlySet<FieldId>;
};

export function evalCtx(book: Book, today: string, classOf: (h: Holding) => string | null = () => null, supplied: ReadonlySet<FieldId> = suppliedByBook(book)): EvalCtx {
  return { book, today, market: { today, rate: book.market?.rate ?? DEFAULT_RATE, spots: spotsFor(book) }, classOf, supplied };
}

/** The fundamentals fields at least one holding carries a value for (lib/research.ts lays them on). */
export function suppliedByBook(book: Book): Set<FieldId> {
  const out = new Set<FieldId>();
  for (const h of book.holdings) for (const [k, v] of Object.entries(h.fundamentals ?? {})) if (v !== null && (FUNDAMENTAL_FIELDS as readonly string[]).includes(k)) out.add(k as FieldId);
  return out;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The holdings a session's closes price: shares and funds listed on an exchange. */
export const LISTED_FOR_DAY: ReadonlySet<string> = new Set(["equity", "etf"]);

/** A holding's value to its owner, in base currency: real estate net of its mortgage and at the owner's share. */
export function ownerValueOf(h: Holding, book: Book): number {
  if (h.assetClass === "real_estate" && h.property) return toBase((h.value - h.property.mortgage) * (h.property.ownershipPct / 100), h.currency, book.fx);
  return toBase(h.value, h.currency, book.fx);
}

const f = (object: ObjectId, label: string, type: FieldType, suppliedBy: FieldDef["suppliedBy"], about: string, values?: readonly string[]): FieldDef => ({ object, label, type, suppliedBy, about, values });

/** Every field a recipe can name. Money fields are read in the base currency. */
export const FIELDS = {
  // Holdings
  value: f("holdings", "Market value", "money", ANY, "Market value in the base currency; negative for short options."),
  owner_value: f("holdings", "Value to the owner", "money", ANY, "Market value at the owner's share, real estate net of its mortgage. Net worth is the sum of this."),
  cost: f("holdings", "Cost basis", "money", [...BROKERS, "other_assets", "property"], "What was paid, in the base currency; null when not known."),
  gain_pct: f("holdings", "Gain on cost", "pct", [...BROKERS, "other_assets", "property"], "Value against cost, as a percentage; null without a cost."),
  day_change: f("holdings", "Change since previous close", "money", BROKERS, "Value now less value at the previous close, in base currency; null when the broker's report gives no previous close."),
  day_change_pct: f("holdings", "Change since previous close, %", "pct", BROKERS, "The same change as a percentage of the previous close."),
  quantity: f("holdings", "Quantity", "number", ANY, "Units held; contracts for options, negative when short."),
  price: f("holdings", "Price", "number", ANY, "Per unit, in the holding's own currency."),
  asset_class: f("holdings", "Asset class", "enum", ANY, "equity, etf, option, bond, deposit, cash, private_fund, real_estate or other.", ASSET_CLASSES),
  symbol: f("holdings", "Symbol", "text", ANY, "Ticker, option symbol, ISIN or a name for private assets."),
  name: f("holdings", "Name", "text", ANY, "The holding's name."),
  account: f("holdings", "Account", "text", ANY, "The account it sits in."),
  currency: f("holdings", "Currency", "text", ANY, "The holding's own currency code."),
  country: f("holdings", "Country", "text", ANY, "Country of the issuer or the property; null when unknown."),
  sector: f("holdings", "Sector", "text", ANY, "Sector of the issuer, GICS-style, from the industry code the SEC files it under once filings are read (lib/sectors.ts), or as the source supplied it; null when unknown."),
  themes: f("holdings", "Themes", "list", ANY, "Investment themes tagged on the holding, e.g. AI."),
  liquid: f("holdings", "Liquid", "flag", ANY, "True outside private funds and real estate."),
  as_of: f("holdings", "Valued on", "date", ANY, "The date of the value."),
  age_days: f("holdings", "Days since valued", "days", ANY, "Days between the valuation date and today."),
  valuation: f("holdings", "Valuation source", "enum", ANY, "broker, bank_statement, fund_report, manual or estimate.", VALUATION_SOURCES),
  class: f("holdings", "Methodology class", "text", ANY, "The class the methodology gives the holding, from its own classes; null when none fits."),
  // The owner's own record of a holding (the vault's records file), never a broker's.
  own_valuation: f("holdings", "Own valuation", "number", ANY, "The owner's own valuation per unit (a DCF base case, an appraisal), as they recorded it; null until they do."),
  own_valuation_low: f("holdings", "Own valuation, low", "number", ANY, "The low end of the owner's valuation range; null when not recorded."),
  own_valuation_high: f("holdings", "Own valuation, high", "number", ANY, "The high end of the owner's valuation range; null when not recorded."),
  price_to_own_valuation_pct: f("holdings", "Price against own valuation", "pct", ANY, "Price as a percentage of the owner's base valuation: 100 at fair value, 80 at a 20% discount; null without a valuation."),
  own_valuation_age_days: f("holdings", "Days since own valuation", "days", ANY, "Days since the owner last set their valuation; for a rule that a valuation must be refreshed within a year."),
  record_since: f("holdings", "In its standing since", "date", ANY, "The date the owner recorded the holding entering its current standing (a class, a probation, a watch)."),
  record_days: f("holdings", "Days in its standing", "days", ANY, "Days since record_since; for clocks such as a probation that ends after N days."),
  // Options
  option_underlying: f("holdings", "Underlying", "text", BROKERS, "The underlying symbol of an option."),
  option_right: f("holdings", "Call or put", "enum", BROKERS, "C or P.", ["C", "P"]),
  option_strike: f("holdings", "Strike", "number", BROKERS, "Strike price."),
  option_expiry: f("holdings", "Expiry", "date", BROKERS, "Expiry date."),
  option_days_to_expiry: f("holdings", "Days to expiry", "days", BROKERS, "Days from today to expiry."),
  option_delta_value: f("holdings", "Delta-adjusted value", "money", BROKERS, "Share-equivalent exposure of an option times the underlying price, in base currency; needs a price for the underlying."),
  assignment_cash: f("holdings", "Cash if assigned", "money", BROKERS, "For a short put: strike times multiplier times contracts; what assignment would cost."),
  option_iv_pct: f("holdings", "Implied volatility", "pct", "none", "Annualised implied volatility of the contract; needs a market data source."),
  option_iv_rank: f("holdings", "IV rank", "pct", "none", "Where today's implied volatility sits in its one-year range, 0 to 100."),
  option_expected_move: f("holdings", "Expected move", "money", "none", "The one-standard-deviation move in the underlying to expiry, in base currency; from implied volatility."),
  // Bonds and deposits
  bond_issuer: f("holdings", "Issuer", "text", ["bank_statements", ...BROKERS], "The bond's issuer."),
  bond_coupon_pct: f("holdings", "Coupon", "pct", ["bank_statements", ...BROKERS], "Coupon rate as a percentage."),
  bond_maturity: f("holdings", "Maturity", "date", ["bank_statements", ...BROKERS], "Maturity date of a bond or deposit."),
  bond_yield_pct: f("holdings", "Stated yield", "pct", ["bank_statements", ...BROKERS], "Yield as the statement states it; never computed."),
  bond_rating: f("holdings", "Rating", "text", ["bank_statements", ...BROKERS], "Credit rating as stated."),
  deposit_rate_pct: f("holdings", "Deposit rate", "pct", ["bank_statements"], "Interest rate of a deposit."),
  // Private funds
  fund_manager: f("holdings", "Fund manager", "text", ["fund_reports"], "The manager of a private fund."),
  fund_vintage: f("holdings", "Vintage", "number", ["fund_reports"], "Vintage year."),
  fund_commitment: f("holdings", "Commitment", "money", ["fund_reports"], "Total committed to the fund."),
  fund_called: f("holdings", "Called", "money", ["fund_reports"], "Capital called so far."),
  fund_unfunded: f("holdings", "Unfunded", "money", ["fund_reports"], "Commitment less called: what the fund can still call."),
  fund_distributions: f("holdings", "Distributions", "money", ["fund_reports"], "Paid back so far."),
  fund_dpi: f("holdings", "DPI", "ratio", ["fund_reports"], "Distributions to paid-in, as the fund reports it."),
  fund_tvpi: f("holdings", "TVPI", "ratio", ["fund_reports"], "Total value to paid-in, as the fund reports it."),
  fund_irr_pct: f("holdings", "Fund IRR", "pct", ["fund_reports"], "IRR as the fund reports it."),
  // Real estate
  property_ownership_pct: f("holdings", "Ownership share", "pct", ["property"], "The owner's share of the property."),
  property_mortgage: f("holdings", "Mortgage", "money", ["property"], "Mortgage outstanding, in base currency."),
  property_ltv_pct: f("holdings", "Loan to value", "pct", ["property"], "Mortgage over the property's value."),
  property_monthly_rent: f("holdings", "Monthly rent", "money", ["property"], "Rent per month, in base currency; null when not let."),
  property_annual_rent: f("holdings", "Annual rent", "money", ["property"], "Twelve times the monthly rent."),
  property_rental: f("holdings", "Rental status", "enum", ["property"], "long_term, short_stay, own_use or vacant.", ["long_term", "short_stay", "own_use", "vacant"]),
  property_valuation_date: f("holdings", "Property valued on", "date", ["property"], "When the property's value was last set."),
  // Company fundamentals: named so a methodology can ask, supplied by nothing yet.
  dividend_yield_pct: f("holdings", "Dividend yield", "pct", "none", "Trailing twelve months dividend per share over the price, in the filings' currency: a price in another currency is carried over at the day's rate, one listed share as one filed share, and per-share figures filed before a split are on today's share count."),
  payout_ratio_pct: f("holdings", "Payout ratio", "pct", "none", "Dividends over earnings."),
  dividend_growth_5y_pct: f("holdings", "Dividend growth, 5 years", "pct", "none", "Annualised dividend per share growth over five years."),
  dividend_years_raised: f("holdings", "Years of dividend raises", "number", "none", "Consecutive years the dividend was raised."),
  revenue_growth_pct: f("holdings", "Revenue growth", "pct", "none", "Trailing twelve months revenue against the twelve months before. A fiscal year is a twelve-month duration a filing marks as one, never a 10-Q's trailing twelve months; a broker's or bank's net revenue line is its revenue."),
  fcf_margin_pct: f("holdings", "Free cash flow margin", "pct", "none", "Free cash flow over revenue."),
  roic_pct: f("holdings", "Return on invested capital", "pct", "none", "Trailing twelve months operating income after a 21% tax, over invested capital (equity with minority interests, plus debt and finance leases, less cash and current marketable securities) at the latest balance sheet date. No reading when invested capital is not positive; see invested_capital."),
  invested_capital: f("holdings", "Invested capital", "money", "none", "Equity with minority interests, plus debt and finance leases, less cash and current marketable securities, at the latest balance sheet date within the trailing period. At or below zero when buybacks have taken equity negative."),
  roic_ex_goodwill_pct: f("holdings", "ROIC excluding goodwill", "pct", "none", "ROIC with goodwill and acquired intangibles taken out of invested capital, for acquirers; see goodwill_share_of_capital_pct."),
  goodwill_share_of_capital_pct: f("holdings", "Goodwill share of invested capital", "pct", "none", "Goodwill and acquired intangibles over invested capital."),
  operating_margin_pct: f("holdings", "Operating margin", "pct", "none", "Operating income over revenue, trailing twelve months."),
  operating_margin_change_pts: f("holdings", "Operating margin change", "number", "none", "Trailing twelve months operating margin less the margin of the twelve months before, in percentage points; above zero when operating income grew faster than revenue."),
  net_debt_to_ebitda: f("holdings", "Net debt to EBITDA", "ratio", "none", "Leverage."),
  pe_ratio: f("holdings", "Price to earnings", "ratio", "none", "Price over trailing twelve months diluted EPS, in the filings' currency: a price in another currency is carried over at the day's rate, one listed share as one filed share, and per-share figures filed before a split are on today's share count."),
  forward_pe: f("holdings", "Forward P/E, from the filings", "ratio", "none", "Price over the next twelve months' EPS as the filings carry it forward: trailing diluted EPS grown at revenue growth on the twelve months before (revenue_growth_pct), held between -50% and +100%, so a one-off gain in EPS is not carried forward twice. The app's arithmetic on what was filed, with a five-year history, not a forecast; none when trailing EPS is not positive. See consensus_forward_pe for the analysts'."),
  consensus_forward_pe: f("holdings", "Forward P/E, analysts' consensus", "ratio", "none", "Price over the analysts' consensus EPS for the next twelve months, from Nasdaq's published estimates: the fiscal year in progress for the months it has left and the next for the rest. Read for the companies held, watched or opened, for a price in US dollars; the analysts' figure, never the app's."),
  ps_ratio: f("holdings", "Price to sales", "ratio", "none", "Price over trailing twelve months revenue per diluted share, in the filings' currency, the price carried over at the day's rate as for pe_ratio."),
  forward_ps: f("holdings", "Forward P/S, from the filings", "ratio", "none", "Price over the next twelve months' revenue per share as the filings carry it forward: trailing revenue per share grown at revenue_growth_pct, the growth held between -50% and +100%; not a forecast."),
  pfcf_ratio: f("holdings", "Price to free cash flow", "ratio", "none", "Price over trailing twelve months free cash flow per diluted share; none when free cash flow is not positive."),
  forward_pfcf: f("holdings", "Forward P/FCF, from the filings", "ratio", "none", "Price over the next twelve months' free cash flow per share as the filings carry it forward: trailing free cash flow per share grown at revenue_growth_pct, held between -50% and +100%; not a forecast."),
  implied_growth_pct: f("holdings", "Priced-in growth", "pct", "none", "The revenue growth a year, over the next nine years, at which a discounted free cash flow model is worth today's price: trailing revenue and free cash flow margin less stock-based compensation, growth fading as dcfDefaults fades it, WACC 9% and terminal growth 3%, the latest balance sheet and diluted shares (lib/dcf.ts's reverse DCF). The app's arithmetic on the filings, not a forecast; below zero when the price asks for revenue to shrink; none when free cash flow is not positive or no path from the trailing one mirrored to six times it meets the price."),
  gross_margin_pct: f("holdings", "Gross margin", "pct", "none", "Gross profit over revenue, trailing twelve months; for an IFRS filer with no cost of sales or gross profit line, revenue less the cost of inventories recognised as an expense, said in the notes."),
  operating_leverage: f("holdings", "Operating leverage", "ratio", "none", "Operating income growth over revenue growth."),
  fcf_conversion: f("holdings", "FCF conversion", "ratio", "none", "Free cash flow (cash from operations less purchases of property, equipment and intangibles) over net income, trailing twelve months."),
  fcf_conversion_operating: f("holdings", "FCF conversion on operating income", "ratio", "none", "Free cash flow over operating income after a 21% tax, for when non-operating gains or losses distort net income; see nonoperating_share_of_net_income_pct."),
  nonoperating_share_of_net_income_pct: f("holdings", "Non-operating share of net income", "pct", "none", "Non-operating income or expense, in absolute terms, over net income, trailing twelve months; zero when the filings report no non-operating line."),
  loans_to_equity: f("holdings", "Loans receivable to equity", "ratio", "none", "Loans and financing receivables over equity at the latest balance sheet date; zero when the filings report no loan book. Above one, cash flow is a lender's, not a converter's."),
  altman_z: f("holdings", "Altman Z-score", "ratio", "none", "Altman's 1968 score of financial distress from the latest balance sheet and the trailing twelve months: 1.2 times working capital (current assets less current liabilities) over total assets, plus 1.4 times retained earnings over total assets, plus 3.3 times operating income over total assets, plus 0.6 times market value (the price times the shares outstanding, in the filings' currency) over total liabilities (total assets less equity with minority interests), plus revenue over total assets. Below 1.81 Altman called distress, 1.81 to 2.99 grey, above 2.99 safe; made for manufacturers, so not read for a bank or an insurer, which report no current assets."),
  interest_cover: f("holdings", "Interest cover", "ratio", "none", "Operating income over gross interest expense, trailing twelve months."),
  interest_cover_net: f("holdings", "Interest cover, net", "ratio", "none", "Operating income over net interest expense (interest expense less interest income), trailing twelve months; no reading when net interest is income, see net_interest_expense."),
  net_interest_expense: f("holdings", "Net interest expense", "money", "none", "Interest expense less interest income, trailing twelve months; at or below zero when interest earned covers interest paid."),
  cash_to_debt_pct: f("holdings", "Cash and investments to debt", "pct", "none", "Cash, current marketable securities and long-term investments over debt and finance leases at the latest balance sheet date within the trailing period, a line last filed before it read as none; no reading without debt, see net_debt."),
  engine_growth_pct: f("holdings", "Disruption engine growth", "pct", "none", "The growth of the disruption engine: company revenue growth, trailing twelve months, or, when a reported segment or revenue line at least 15% of revenue grows faster over the latest filing's period, that line's growth (D.1(a), C3). Read from the filing's own segment note; company growth alone when the filing has no lines."),
  engine_share_pct: f("holdings", "Disruption engine share of revenue", "pct", "none", "The engine line's share of company revenue in the latest filing's period; 100 when the engine is company revenue itself."),
  net_debt: f("holdings", "Net debt", "money", "none", "Debt and finance leases less cash, current marketable securities and long-term investments at the latest balance sheet date within the trailing period; a line last filed before that period is read as none. At or below zero for a net-cash company."),
  fcf_per_share_growth_pct: f("holdings", "FCF per share growth", "pct", "none", "Trailing twelve months free cash flow per share against the twelve months before, both on today's share count after any split."),
  eps_growth_pct: f("holdings", "EPS growth", "pct", "none", "Trailing twelve months diluted EPS against the twelve months before, both on today's share count after any split."),
  insider_net_buying: f("holdings", "Insider net buying", "money", "none", "Open-market purchases less open-market sales by the company's directors, officers and holders of a tenth or more over the past twelve months, in US dollars, from their Form 4 filings (codes P and S). Awards, option exercises, shares withheld for tax and gifts are left out. Below zero when they sold more than they bought."),
  insider_buyers: f("holdings", "Insiders buying", "number", "none", "How many of the company's directors, officers and holders of a tenth or more bought its shares on the open market in the past twelve months, from their Form 4 filings."),
  short_interest_pct: f("holdings", "Short interest", "pct", "none", "Shares sold short at FINRA's latest published settlement date (twice a month) over the shares outstanding the filings report; none for a listing whose filings count other shares (an ADR)."),
  days_to_cover: f("holdings", "Days to cover", "number", "none", "Shares sold short over the average daily volume, as FINRA computes it at its latest settlement date: how many days of trading it would take to buy them back."),
  capital_returned_pct: f("holdings", "Capital returned", "pct", "none", "Buybacks and dividends paid over free cash flow, trailing twelve months; what the company gives back rather than keeps. The stage test reads it (Valuation by stage)."),
  // Transactions
  amount: f("transactions", "Amount", "money", [...BROKERS, "bank_statements", "fund_reports"], "Cash effect in base currency: positive in, negative out."),
  date: f("transactions", "Date", "date", [...BROKERS, "bank_statements", "fund_reports"], "Transaction date."),
  kind: f("transactions", "Kind", "enum", [...BROKERS, "bank_statements", "fund_reports"], "buy, sell, option_open, option_close, assignment, exercise, expiry, capital_call, distribution, coupon, interest, dividend, deposit, withdrawal or fee.", TRANSACTION_KINDS),
  txn_symbol: f("transactions", "Symbol", "text", [...BROKERS, "bank_statements", "fund_reports"], "The instrument the transaction is in."),
  txn_account: f("transactions", "Account", "text", [...BROKERS, "bank_statements", "fund_reports"], "The account it happened in."),
  txn_quantity: f("transactions", "Quantity", "number", [...BROKERS, "bank_statements", "fund_reports"], "Units; contracts for options."),
  txn_price: f("transactions", "Price", "number", [...BROKERS, "bank_statements", "fund_reports"], "Per unit, in the transaction's currency."),
  // Look-through rows
  lt_value: f("lookthrough", "Value through the fund", "money", ["fund_reports"], "The owner's share of the company, through the fund, in base currency; estimated when the report gives no fair values."),
  lt_name: f("lookthrough", "Company", "text", ["fund_reports"], "The company's name."),
  lt_ticker: f("lookthrough", "Ticker", "text", ["fund_reports"], "Public ticker when listed; null otherwise."),
  lt_sector: f("lookthrough", "Sector", "text", ["fund_reports"], "The company's sector."),
  lt_country: f("lookthrough", "Country", "text", ["fund_reports"], "The company's country."),
  lt_stage: f("lookthrough", "Stage", "text", ["fund_reports"], "Seed, growth, buyout and so on, as the report says."),
  lt_themes: f("lookthrough", "Themes", "list", ["fund_reports"], "Themes tagged on the company."),
  lt_fund: f("lookthrough", "Fund", "text", ["fund_reports"], "The fund it is held through."),
  // Market indicators from the public feed (lib/markets.ts): one row per indicator, read with a filter on market_symbol.
  market_symbol: f("markets", "Indicator", "text", "feed", "The indicator's symbol: VIX, US10Y, US2Y, US10Y2Y (10y less 2y), GOLD, SILVER, GOLDSILVER (the ratio), DXY, WTI, SPY (S&P 500), QQQ (Nasdaq-100), SPXEY (S&P 500 earnings yield: trailing reported earnings over the index, in percent), DJI (Dow), COMP (Nasdaq Composite), RUT (Russell 2000), DM (developed markets, MSCI World), DMXUS (developed markets outside the US), EM (emerging markets), FTSE (FTSE 100), DAX (DAX 40), N225 (Nikkei 225), NIFTY (Nifty 50, India), SSEC (Shanghai Composite, China), DJT (Dow Transports), XHB (homebuilders ETF), US3M, US5Y, US30Y (Treasury yields), US10Y3M (10y less 3m), RECPROB (the New York Fed's yield-curve probability of a recession in twelve months, in percent), FEDBS (the Fed's securities holdings, $bn, weekly), EFFR (fed funds effective rate), SOFR, MORT30 (30-year mortgage rate, weekly), CPIYOY (US CPI on a year before, monthly), UNRATE (US unemployment rate, monthly), SENTIMENT (Michigan consumer sentiment, monthly), FEARGREED (CNN fear and greed, 0 to 100), TAXREC (federal individual income tax receipts over twelve months, $bn, monthly)."),
  market_name: f("markets", "Indicator name", "text", "feed", "The indicator's name."),
  market_level: f("markets", "Level", "number", "feed", "The latest close: an index level, a yield in percent, a price in US dollars, or a ratio."),
  market_change_1d_pct: f("markets", "Change, 1 day", "pct", "feed", "Change over the last session, as a percentage of the level."),
  market_change_1m_pct: f("markets", "Change, 1 month", "pct", "feed", "Change over the last 21 sessions, as a percentage."),
  market_change_1y_pct: f("markets", "Change, 1 year", "pct", "feed", "Change over the last 252 sessions, as a percentage."),
  market_change_1d: f("markets", "Change in level, 1 day", "number", "feed", "Change over the last session in the indicator's own unit (percentage points for a yield)."),
  market_change_1m: f("markets", "Change in level, 1 month", "number", "feed", "Change over the last 21 sessions in the indicator's own unit."),
  market_change_1y: f("markets", "Change in level, 1 year", "number", "feed", "Change over the last 252 sessions in the indicator's own unit."),
  market_1y_low: f("markets", "One-year low", "number", "feed", "The lowest close in the last year."),
  market_1y_high: f("markets", "One-year high", "number", "feed", "The highest close in the last year."),
  market_range_pct: f("markets", "Place in one-year range", "pct", "feed", "Where the level sits between its one-year low (0) and high (100)."),
  market_as_of: f("markets", "As of", "date", "feed", "The date of the latest close."),
  market_age_days: f("markets", "Age", "days", "feed", "Days since the latest close."),
  // Time series, read by the series operation (returns, drawdowns, betas), never by a measure.
  nav_series: f("series", "Account value by day", "series", BROKERS, "The account's value by day in base currency, from the broker's own report. Returns and drawdowns come from it."),
  benchmark_series: f("series", "Benchmark prices", "series", "none", "A benchmark's price by day. SPY, QQQ, VIX, GOLD and the other market indicators come from the feed when the methodology names them; any other symbol needs a source."),
} satisfies Record<string, FieldDef>;
export type FieldId = keyof typeof FIELDS;
export const FIELD_IDS = Object.keys(FIELDS) as FieldId[];

/** Company fundamentals: named for methodologies to ask for, supplied by no input; research (lib/research.ts) lays them on a holding. */
export const FUNDAMENTAL_FIELDS = [
  "dividend_yield_pct",
  "payout_ratio_pct",
  "dividend_growth_5y_pct",
  "dividend_years_raised",
  "revenue_growth_pct",
  "fcf_margin_pct",
  "roic_pct",
  "invested_capital",
  "roic_ex_goodwill_pct",
  "goodwill_share_of_capital_pct",
  "operating_margin_pct",
  "operating_margin_change_pts",
  "fcf_conversion_operating",
  "nonoperating_share_of_net_income_pct",
  "loans_to_equity",
  "interest_cover_net",
  "net_interest_expense",
  "cash_to_debt_pct",
  "net_debt",
  "engine_growth_pct",
  "engine_share_pct",
  "net_debt_to_ebitda",
  "pe_ratio",
  "forward_pe",
  "consensus_forward_pe",
  "ps_ratio",
  "forward_ps",
  "pfcf_ratio",
  "forward_pfcf",
  "implied_growth_pct",
  "gross_margin_pct",
  "operating_leverage",
  "fcf_conversion",
  "interest_cover",
  "altman_z",
  "fcf_per_share_growth_pct",
  "eps_growth_pct",
  "capital_returned_pct",
  "insider_net_buying",
  "insider_buyers",
  "short_interest_pct",
  "days_to_cover",
] as const satisfies readonly FieldId[];
export type FundamentalField = (typeof FUNDAMENTAL_FIELDS)[number];

export function fieldsOf(object: ObjectId): FieldId[] {
  return FIELD_IDS.filter((id) => FIELDS[id].object === object);
}

/** Whether a field can have data given the person's inputs, or the values research laid on the book (`supplied`). */
export function fieldAvailable(id: FieldId, inputs: readonly InputId[], supplied?: ReadonlySet<FieldId>): boolean {
  if (supplied?.has(id)) return true;
  const by = FIELDS[id].suppliedBy;
  if (by === "feed") return true;
  return by !== "none" && by.some((i) => inputs.includes(i));
}

/** The inputs a field can come from, for a "needs" line: null when no input supplies it (or the feed does, which asks nothing of the person). */
export function inputsFor(id: FieldId): InputId[] | null {
  const by = FIELDS[id].suppliedBy;
  return by === "none" || by === "feed" ? null : [...by];
}

// ---------------------------------------------------------------------------
// Reading a field off a row

export type Row = { object: "holdings"; row: Holding } | { object: "transactions"; row: Transaction } | { object: "lookthrough"; row: LookThroughRow & { parentName: string; value: number } } | { object: "markets"; row: MarketRow };

const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

export function fieldValue(id: FieldId, r: Row, ctx: EvalCtx): FieldValue {
  const { book } = ctx;
  if (r.object === "holdings") {
    const h = r.row;
    const base = (v: number | null | undefined) => (v === null || v === undefined ? null : toBase(v, h.currency, book.fx));
    switch (id) {
      case "value":
        return base(h.value);
      case "owner_value":
        return ownerValueOf(h, book);
      case "cost":
        return base(h.costBasis);
      case "gain_pct":
        return h.costBasis ? ((h.value - h.costBasis) / Math.abs(h.costBasis)) * 100 : null;
      case "day_change":
        return base(h.dayChange);
      case "day_change_pct": {
        if (h.dayChange === null || h.dayChange === undefined) return null;
        const prev = h.value - h.dayChange;
        return prev === 0 ? null : (h.dayChange / Math.abs(prev)) * 100;
      }
      case "own_valuation":
        return num(h.record?.ownValuation?.base);
      case "own_valuation_low":
        return num(h.record?.ownValuation?.low);
      case "own_valuation_high":
        return num(h.record?.ownValuation?.high);
      case "price_to_own_valuation_pct":
        return h.record?.ownValuation && h.price !== null && h.record.ownValuation.base > 0 ? (h.price / h.record.ownValuation.base) * 100 : null;
      case "own_valuation_age_days":
        return h.record?.ownValuation ? days(h.record.ownValuation.asOf, ctx.today) : null;
      case "record_since":
        return h.record?.since ?? null;
      case "record_days":
        return h.record?.since ? days(h.record.since, ctx.today) : null;
      case "quantity":
        return h.quantity;
      case "price":
        return num(h.price);
      case "asset_class":
        return h.assetClass;
      case "symbol":
        return h.symbol;
      case "name":
        return h.name;
      case "account":
        return h.account;
      case "currency":
        return h.currency;
      case "country":
        return h.country;
      case "sector":
        return h.sector;
      case "themes":
        return h.themes;
      case "liquid":
        return !(h.assetClass === "private_fund" || h.assetClass === "real_estate");
      case "as_of":
        return h.asOf;
      case "age_days":
        return days(h.asOf, ctx.today);
      case "valuation":
        return h.valuation;
      case "class":
        return ctx.classOf(h);
      case "option_underlying":
        return h.option?.underlying ?? null;
      case "option_right":
        return h.option?.right ?? null;
      case "option_strike":
        return num(h.option?.strike);
      case "option_expiry":
        return h.option?.expiry ?? null;
      case "option_days_to_expiry":
        return h.option ? daysToExpiry(h.option.expiry, ctx.today) : null;
      case "option_delta_value": {
        if (!h.option) return null;
        const v = contractView(h, ctx.market);
        return v && v.deltaShares !== null && v.spot !== null ? base(v.deltaShares * v.spot) : null;
      }
      case "assignment_cash":
        return h.option && h.option.right === "P" && h.quantity < 0 ? base(Math.abs(h.quantity) * h.option.strike * h.option.multiplier) : null;
      case "bond_issuer":
        return h.bond?.issuer ?? null;
      case "bond_coupon_pct":
        return num(h.bond?.coupon);
      case "bond_maturity":
        return h.bond?.maturity ?? h.deposit?.maturity ?? null;
      case "bond_yield_pct":
        return num(h.bond?.yieldPct);
      case "bond_rating":
        return h.bond?.rating ?? null;
      case "deposit_rate_pct":
        return num(h.deposit?.ratePct);
      case "fund_manager":
        return h.fund?.manager ?? null;
      case "fund_vintage":
        return num(h.fund?.vintage);
      case "fund_commitment":
        return base(h.fund?.commitment);
      case "fund_called":
        return base(h.fund?.called);
      case "fund_unfunded":
        return h.fund ? base(Math.max(0, h.fund.commitment - h.fund.called)) : null;
      case "fund_distributions":
        return base(h.fund?.distributions);
      case "fund_dpi":
        return num(h.fund?.reported.dpi);
      case "fund_tvpi":
        return num(h.fund?.reported.tvpi);
      case "fund_irr_pct":
        return num(h.fund?.reported.irrPct);
      case "property_ownership_pct":
        return num(h.property?.ownershipPct);
      case "property_mortgage":
        return base(h.property?.mortgage);
      case "property_ltv_pct":
        return h.property && h.value > 0 ? (h.property.mortgage / h.value) * 100 : null;
      case "property_monthly_rent":
        return base(h.property?.monthlyRent);
      case "property_annual_rent":
        return h.property?.monthlyRent === null || h.property?.monthlyRent === undefined ? null : base(h.property.monthlyRent * 12);
      case "property_rental":
        return h.property?.rental ?? null;
      case "property_valuation_date":
        return h.property?.valuationDate ?? null;
      default:
        // Fundamentals: no input supplies them; research lays them on the holding, or they are null.
        return num(h.fundamentals?.[id]);
    }
  }
  if (r.object === "transactions") {
    const t = r.row;
    switch (id) {
      case "amount":
        return baseAmountOf(t, book.fx); // null, a missing reading, when nothing converts the currency
      case "date":
        return t.date;
      case "kind":
        return t.kind;
      case "txn_symbol":
        return t.symbol;
      case "txn_account":
        return t.account;
      case "txn_quantity":
        return t.quantity;
      case "txn_price":
        return num(t.price);
      default:
        return null;
    }
  }
  if (r.object === "markets") {
    const m = r.row;
    switch (id) {
      case "market_symbol":
        return m.symbol;
      case "market_name":
        return m.name;
      case "market_level":
        return m.level;
      case "market_change_1d_pct":
        return m.change1dPct;
      case "market_change_1m_pct":
        return m.change1mPct;
      case "market_change_1y_pct":
        return m.change1yPct;
      case "market_change_1d":
        return m.change1d;
      case "market_change_1m":
        return m.change1m;
      case "market_change_1y":
        return m.change1y;
      case "market_1y_low":
        return m.low1y;
      case "market_1y_high":
        return m.high1y;
      case "market_range_pct":
        return m.rangePct;
      case "market_as_of":
        return m.asOf;
      case "market_age_days":
        return days(m.asOf, ctx.today);
      default:
        return null;
    }
  }
  const l = r.row;
  switch (id) {
    case "lt_value":
      return l.value;
    case "lt_name":
      return l.name;
    case "lt_ticker":
      return l.ticker;
    case "lt_sector":
      return l.sector;
    case "lt_country":
      return l.country;
    case "lt_stage":
      return l.stage;
    case "lt_themes":
      return l.themes;
    case "lt_fund":
      return l.parentName;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Measures, windows, groupings, comparators

export const MEASURES = ["sum", "count", "avg", "min", "max"] as const;
export type Measure = (typeof MEASURES)[number];
export const MEASURE_ABOUT: Record<Measure, string> = {
  sum: "Add the field up over the rows.",
  count: "Count the rows (no field needed).",
  avg: "Average of the field over the rows.",
  min: "Smallest value of the field.",
  max: "Largest value of the field.",
};

export const WINDOWS = ["all", "ttm", "prior_ttm", "ytd", "last_months"] as const;
export type WindowKind = (typeof WINDOWS)[number];
export const WINDOW_ABOUT: Record<WindowKind, string> = {
  all: "Every transaction on record.",
  ttm: "The trailing twelve months to today.",
  prior_ttm: "The twelve months before those (for growth).",
  ytd: "From 1 January this year.",
  last_months: "The last N months; give months.",
};

export const DIMENSIONS = ["holding", "symbol", "asset_class", "account", "currency", "country", "sector", "theme", "class", "kind", "month", "quarter", "year", "stage", "fund", "date"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** The field a grouping reads, per object; null when the grouping does not apply to that object. */
export const DIMENSION_FIELD: Record<Dimension, Partial<Record<ObjectId, FieldId>>> = {
  holding: { holdings: "name", transactions: "txn_symbol", lookthrough: "lt_name", markets: "market_name" },
  symbol: { holdings: "symbol", transactions: "txn_symbol", lookthrough: "lt_ticker", markets: "market_symbol" },
  asset_class: { holdings: "asset_class" },
  account: { holdings: "account", transactions: "txn_account" },
  currency: { holdings: "currency" },
  country: { holdings: "country", lookthrough: "lt_country" },
  sector: { holdings: "sector", lookthrough: "lt_sector" },
  theme: { holdings: "themes", lookthrough: "lt_themes" },
  class: { holdings: "class" },
  kind: { transactions: "kind" },
  month: { transactions: "date" },
  quarter: { transactions: "date" },
  year: { transactions: "date" },
  stage: { lookthrough: "lt_stage" },
  fund: { lookthrough: "lt_fund" },
  date: {},
};
export const DIMENSION_ABOUT: Record<Dimension, string> = {
  holding: "One row per holding (per symbol for transactions, per company for look-through, per indicator for markets).",
  symbol: "By ticker or symbol (per indicator for markets).",
  asset_class: "By asset class.",
  account: "By account.",
  currency: "By the holding's currency.",
  country: "By country.",
  sector: "By sector.",
  theme: "By tagged theme; a holding with two themes counts under both.",
  class: "By the methodology's own classes.",
  kind: "By transaction kind.",
  month: "By calendar month of the transaction.",
  quarter: "By calendar quarter.",
  year: "By calendar year.",
  stage: "By company stage, inside funds.",
  fund: "By the fund a company is held through.",
  date: "By day; only for series figures (growth of 100, drawdown).",
};
export const TIME_DIMENSIONS: readonly Dimension[] = ["month", "quarter", "year"];

export const COMPARATORS = ["lte", "gte", "lt", "gt"] as const;
export type Comparator = (typeof COMPARATORS)[number];
export const COMPARATOR_WORDS: Record<Comparator, string> = { lte: "at most", gte: "at least", lt: "below", gt: "above" };

export const FILTER_OPS = ["eq", "ne", "in", "not_in", "gt", "gte", "lt", "lte", "contains", "is_null", "not_null"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const UNITS = ["money", "pct", "ratio", "count", "days", "number"] as const;
export type Unit = (typeof UNITS)[number];

// ---------------------------------------------------------------------------
// Series statistics: read from the book's time series by the series operation

export const SERIES_STATS = ["return", "max_drawdown", "high_water_gap", "volatility", "beta", "sortino", "growth_of_100", "drawdown"] as const;
export type SeriesStat = (typeof SERIES_STATS)[number];
export const SERIES_STAT_ABOUT: Record<SeriesStat, string> = {
  return: "Change in value over the period, as a percentage (unit pct). One number.",
  max_drawdown: "The worst peak-to-trough fall within the period, as a percentage (unit pct, negative). One number.",
  high_water_gap: "How far the latest value sits below the highest value in the period, as a percentage (unit pct, zero at a new high). One number.",
  volatility: "Annualised standard deviation of returns over the period, as a percentage (unit pct). One number.",
  beta: "Sensitivity to a benchmark over the period (unit ratio); needs vs. One number.",
  sortino: "The yearly return over the downside deviation, the spread of the falls alone (unit ratio, the risk-free rate taken as 0): return per unit of loss, so swings up cost nothing. One number.",
  growth_of_100: "What 100 at the start of the period grew to, by day (unit number); a series, so by: date and a line view.",
  drawdown: "Fall from the running peak, by day, as a percentage (unit pct); a series, so by: date and a line view.",
};
export const PERIODS = ["1m", "3m", "6m", "ytd", "1y", "3y", "inception"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_WORDS: Record<Period, string> = { "1m": "the last month", "3m": "the last three months", "6m": "the last six months", ytd: "this year", "1y": "the last year", "3y": "the last three years", inception: "since inception" };

// ---------------------------------------------------------------------------
// Built-in panels: views the app already knows how to draw

export const PANEL_IDS = ["holdings", "allocation", "themes", "overlap", "options", "income", "funds", "properties", "freshness"] as const;
export type PanelId = (typeof PANEL_IDS)[number];
export const PANELS: Record<PanelId, { label: string; module: Module; about: string }> = {
  holdings: { label: "Holdings", module: "allocation", about: "Every holding by weight, with the class the methodology gives it. On the Overview for every methodology." },
  allocation: { label: "Allocation", module: "allocation", about: "Net worth by asset class." },
  themes: { label: "Themes", module: "allocation", about: "Exposure by theme, looking through funds." },
  overlap: { label: "Overlap", module: "allocation", about: "The same company reached in more than one place." },
  options: { label: "Options", module: "options", about: "Greeks, expiries and contracts that need attention." },
  income: { label: "Fixed income", module: "fixed_income", about: "Maturity ladder and what pays back soon." },
  funds: { label: "Private funds", module: "funds", about: "Commitments, calls and what the funds own." },
  properties: { label: "Real estate", module: "properties", about: "Equity, loan to value and the weekly watch." },
  freshness: { label: "How current", module: "allocation", about: "How old each figure is, by where it came from." },
};

// ---------------------------------------------------------------------------
// The screens: one skeleton for everyone, filled by the methodology

/**
 * What switches a screen or a slot on. The skeleton is the maximum: a slot is
 * drawn only when the methodology asks for it (a cap rule, a watch rule, a
 * series figure, a class) or the book carries what it shows (transactions, a
 * dated holding). A slot the methodology asks for but the data cannot fill yet
 * says what it needs; a slot it never asks for is not drawn.
 *
 *   always        structural: every methodology has it
 *   classes       the methodology sorts holdings into classes
 *   caps          a rule caps the weight of a holding or a class (lib/screens.ts capsFor)
 *   tests         at least one rule the app can test
 *   watch         a rule of severity watch
 *   series        a figure over the time series, or no methodology yet and the book carries a nav series
 *   benchmark     a series figure names a benchmark symbol
 *   transactions  the book carries transactions
 *   valuation     the owner recorded a valuation, or a figure reads own_valuation
 *   clocks        a rule tests days in a standing or days since a valuation
 *   dates         anything dated: a clock, an option expiry, a maturity
 *   fundamentals  a figure or a class criterion reads a company fundamental
 *   sectors       a holding carries a sector (filings read, or the source supplied one)
 *   markets       a figure measures over the market indicators (the Macro screen, the section that asks named under its title)
 *   decisions     the Decision Log has entries
 *   methodology   a methodology is confirmed
 *   dividends     the book pays dividends: one in the ledger, or a listed holding the filings give a yield
 *   dividend_focus the methodology invests for dividends: it reads a dividend field or the ledger's dividends, or its summary says so
 */
export const SHOWN_WHEN = ["always", "classes", "caps", "tests", "watch", "series", "benchmark", "transactions", "valuation", "clocks", "dates", "fundamentals", "sectors", "markets", "decisions", "methodology", "dividends", "dividend_focus"] as const;
export type ShownWhen = (typeof SHOWN_WHEN)[number];
export const SHOWN_WHEN_ABOUT: Record<ShownWhen, string> = {
  always: "Structural: every methodology has it.",
  classes: "The methodology sorts holdings into classes.",
  caps: "A rule caps the weight of a holding or a class.",
  tests: "At least one rule the app can test.",
  watch: "A rule of severity watch.",
  series: "A figure over the time series, or no methodology yet and the book carries a value series.",
  benchmark: "A series figure names a benchmark symbol.",
  transactions: "The book carries transactions.",
  valuation: "The owner recorded a valuation, or a figure reads the own valuation.",
  clocks: "A rule tests days in a standing or days since a valuation.",
  dates: "Anything dated: a clock, an option expiry, a maturity.",
  fundamentals: "A figure or a class criterion reads a company fundamental.",
  sectors: "A holding carries a sector.",
  markets: "A figure measures over the market indicators.",
  decisions: "The Decision Log has entries.",
  methodology: "A methodology is confirmed.",
  dividends: "The book pays dividends: one in the ledger, or a listed holding the filings give a yield.",
  dividend_focus: "The methodology invests for dividends: a figure, class or rule reads a dividend field or the ledger's dividends, or its summary says so. The Dividends screen then sits right after Holdings with a phone tab, and the Dashboard carries its tiles.",
};

/**
 * Practices: the habits some investors keep and others never do. A screen or
 * slot tied to one is off by default (Trades, `DEFAULT_PRACTICES`, is on)
 * and drawn only once the person adds it on Customise, where a practice the methodology names (`practicesOf` in
 * lib/screens.ts) is marked as such; its own condition must hold as well. Not every trader logs decisions, checks a
 * trade against rules first or keeps a to-do of what the rules ask.
 */
export const PRACTICES = ["trade_log", "trade_check", "decision_log", "todo_list"] as const;
export type Practice = (typeof PRACTICES)[number];
/** On for everyone, like any other screen (hidden under Screens on Customise if unwanted): the fills ledger. The others wait to be added. */
export const DEFAULT_PRACTICES: readonly Practice[] = ["trade_log"];
export const PRACTICE_ABOUT: Record<Practice, { label: string; about: string; asks: string }> = {
  trade_log: { label: "Trades", about: "The fills ledger and what it says about the trading: sales won, profit factor, days held.", asks: "The methodology reviews the trades themselves: a trade journal, win rate, holding periods, the buys that beat a benchmark." },
  trade_check: { label: "Trade check", about: "A trade tested against the methodology's rules before any order.", asks: "The methodology asks for a check before a trade: where new money may go, what a purchase must meet first." },
  decision_log: { label: "Decision Log", about: "A written record of trades, votes and changes, with the reason for each.", asks: "The methodology asks for a written record or a vote behind each trade or decision." },
  todo_list: { label: "Methodology to-do", about: "What the rules ask of each holding that is not on file yet: trims, votes, records, clocks.", asks: "The methodology sets duties per holding with a date or a clock: a vote, a record, a review within so many days, a probation." },
};

// Triggers and kill signals close the list, right before Settings (Hamza, 15 Oct 2026).
export const SCREEN_IDS = ["today", "notifications", "after_close", "holdings", "performance", "markets", "flows", "earnings", "dividends", "trades", "watchlist", "research", "companies", "screener", "top_funds", "agents", "theses", "community", "clubs", "analyst", "check", "decisions", "todo", "calendar", "reviews", "methodology", "options", "fixed_income", "funds", "properties", "statements", "signals", "more"] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export const SLOT_IDS = [
  "live_book", "dividend_glance",
  "close_brief", "extended_hours", "company_news", "podcasts", "headline", "return_chart", "todo", "fear_greed", "on_watch", "latest_review", "sections",
  "notices", "watchers",
  "by_holding", "by_class", "positions", "fair_value", "portfolio_pe", "value_map", "what_made", "book_flow", "book_day", "portfolio_grid", "holdings_by_class", "correlation", "concentration", "revenue_regions", "holdings_sections", "class_register", "holdings_by_sector", "allocation", "holding_tiles", "holding_todo", "holding_valuation", "class_test", "holding_dates", "holding_rules", "holding_triggers", "holding_fundamentals", "holding_decisions",
  "dividend_summary", "dividend_yields", "dividend_mix", "dividend_safety", "dividend_growth", "dividend_upcoming", "dividends_received", "dividends_by_holding", "dividend_years",
  "perf_sections", "perf_insights", "perf_tiles", "irr", "alpha", "by_period", "look_through", "growth", "risk", "day_stats", "drawdown", "monthly",
  "market_sections", "market_rules", "market_indices", "market_heatmap", "market_movers", "market_drivers", "market_today", "market_world", "market_cycle", "market_liquidity", "market_economy", "market_economies", "market_lines", "market_calendar", "market_odds", "market_credit",
  "flow_etfs", "flow_funds", "flow_positioning", "flow_foreign", "flow_cash", "flow_insiders",
  "trade_stats", "trade_costs", "activity", "fills", "unlogged", "by_company", "wins_losses", "rotations", "trades_reasoned", "trades_planned", "trades_postmortems",
  "signal_groups",
  "watched", "watch_form",
  "trade_form", "trade_result", "trade_plan", "trade_draft",
  "decision_letter", "decision_form", "decision_entries",
  "todo_now", "todo_due", "todo_later", "todo_decided",
  "dated", "economic_calendar", "event_reports",
  "earnings_calendar", "earnings_reports", "earnings_reads", "earnings_decks", "earnings_add",
  "thesis_scorecard", "thesis_calibration", "thesis_markets", "thesis_list", "thesis_record", "thesis_pillars", "thesis_evidence", "thesis_hunter", "thesis_figures", "thesis_signals", "thesis_dcf", "thesis_priced_in", "thesis_peers", "thesis_report", "thesis_study", "thesis_archive",
  "community_share", "community_following", "community_people", "community_profile", "community_index", "community_pooled", "community_card_link", "community_family",
  "club_list", "club_material", "club_competitions", "club_members", "competition_board", "competition_book", "club_library", "club_meetings", "club_league", "club_records", "club_graduation", "club_challenges", "club_bounties", "club_picks", "club_watch", "club_alumni", "methodology_packs", "methodology_market", "market_funds", "market_fund_theses", "decision_journal",
  "club_course", "club_season", "club_calibration", "club_fund", "club_treasury", "club_mentors", "methodology_shadow", "methodology_versions", "methodology_frameworks", "pack_listings", "community_judgement", "community_badge", "community_mentors", "public_calls", "open_research", "annual_awards", "family_rules",
  "screen_table", "screen_map", "screen_words", "screen_classes", "screen_near", "fund_ranking", "fund_creeds", "fund_moves",
  "agent_map", "agent_cards", "agent_curve", "agent_rules",
  "your_data_today", "your_data_holdings", "your_data_performance", "your_data_markets",
  "review_verdict", "review_alarms", "review_returns", "review_moves", "review_insights", "review_capital", "review_trades", "review_letter", "review_rulebook", "review_theses", "review_hunter", "review_markets", "review_news", "review_newsletters", "review_questions", "review_calendar", "review_week_ahead", "review_month", "review_method",
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export type SlotDef = { label: string; about: string; shown: ShownWhen; practice?: Practice };
export const SLOTS: Record<SlotId, SlotDef> = {
  return_chart: { label: "Return or value against SPY and QQQ", about: "The book's time-weighted return, or its value, against SPY and QQQ over YTD, 3M, 6M, 1Y, 2Y, 5Y or two dates, picked on the chart; live while the US market is open.", shown: "series" },
  headline: { label: "Headline", about: "The tiles at the top: the methodology's headline figures, or the starter's.", shown: "always" },
  live_book: { label: "Net worth and the day", about: "At the top of the Dashboard: net worth and the day's move. While the US market is open, at today's prices with each listed holding's price, value, move and part in the whole, refreshed every 30 seconds from the price feed and badged Live; nothing is kept, and the rules still read the close. Otherwise the statement's net worth and the last closed session, badged with how fresh each is.", shown: "always" },
  todo: { label: "Methodology to-do", about: "The first few items the methodology still requires, with a link to the list.", shown: "methodology", practice: "todo_list" },
  dividend_glance: { label: "Dividends at a glance", about: "For a dividend methodology, the Dividends screen's first tiles on the Dashboard: the yield and yield on cost, what the book is set to pay a year and a month, and the next month's payments, with a link to the screen.", shown: "dividend_focus" },
  dividend_summary: { label: "Yield and dividends", about: "The book's dividend yield and yield on cost; what it is set to pay a year and a month (each company's trailing dividend per share from the filings times what is held, else what a fund paid over the past year), and the past twelve months received against the twelve before.", shown: "dividends" },
  dividend_yields: { label: "Yield and payout", about: "Each payer's dividend yield beside its yield on cost, or its payout ratio, as bars.", shown: "dividends" },
  dividend_mix: { label: "Passive income diversification", about: "Where the year's dividends come from: each payer's share of them as a donut and a list.", shown: "dividends" },
  dividend_safety: { label: "Dividend safety", about: "Each payer's dividend on four tests from its filings (the payout ratio, the years raised, five years' growth, a yield not stretched), scored 0 to 100 and banded Reliable, Safe, Uncertain or At risk; the share of the year's dividends in each band.", shown: "dividends" },
  dividend_growth: { label: "Average annual growth", about: "Each payer's dividend per share growth a year over five years, from its filings.", shown: "dividends" },
  dividend_upcoming: { label: "Future payments", about: "The next twelve months, each payer placed in the months it paid in over the past year, its year's dividend shared by what it paid then; a payer the ledger shows no payment of is named with its year's amount.", shown: "dividends" },
  dividends_received: { label: "Dividends received", about: "The past twelve months' dividends by month, net of the tax withheld, from the broker's ledger.", shown: "dividends" },
  dividends_by_holding: { label: "Dividends received by company", about: "Everything the ledger shows received, by company, largest first.", shown: "dividends" },
  dividend_years: { label: "Dividend growth by month", about: "Each month's dividends in the last three years side by side.", shown: "dividends" },
  fear_greed: { label: "Fear and greed", about: "CNN's fear and greed index on a gauge: the score now with its band, the previous close, a week, a month and a year ago.", shown: "always" },
  on_watch: { label: "On watch", about: "Rules near their limit.", shown: "tests" },
  latest_review: { label: "Latest review", about: "The last scheduled report, with its verdict.", shown: "always" },
  sections: { label: "The methodology's sections", about: "The figure groups and panels the methodology's dashboard asks for, in its order; a section whose figures all read the value series is on Performance when that screen is on.", shown: "always" },
  notices: { label: "Notices", about: "Breaches, watches, dates and reads since the person last looked, by day.", shown: "always" },
  watchers: { label: "Watchers", about: "What the person asks to hear of, in their own words (\"tell me when MA's operating margin falls below 50%\"), compiled once on their own model into a recipe the app tests itself: a figure of a holding, a watchlist company or any holding, at or beyond a level, or a market indicator. The model only compiles; the app reads the figure at every check, and a watcher that holds is an alert (after Rallies.AI).", shown: "always" },
  by_holding: { label: "Portfolio by holding", about: "Every holding's weight, coloured by class, every label whole: the first tab of the one donut card at the top of Holdings, whose tabs are the views below that are on.", shown: "always" },
  by_class: { label: "Portfolio by class", about: "Weight by class, a tab of the donut card.", shown: "classes" },
  positions: { label: "Positions", about: "One row per holding as a broker shows it: position, last price, change over the day, the year, six months and since bought, cost basis, market value, average price, the day's and the unrealized profit and loss; then the cash and the totals. Changes from the broker or the price feed's daily closes; a figure neither gives is a dash.", shown: "always" },
  portfolio_grid: { label: "Your portfolio", about: "The top of the Dashboard as one ruled grid: net worth with the day, the unrealized gain and the cash beside the allocation by holding, the five largest named and the rest as Other; then every position in one table under Overview (value and weight, price, today, total return, the move to the person's own base), Performance, Valuation and Fundamentals (from the filings), beside the day's contributors and detractors in money and points of the book and the book against the person's own fair values. Live while the US market is open, at the close otherwise.", shown: "always" },
  book_day: { label: "How your book is doing", about: "How the person's book moved in the last closed US session: each listed holding's weight, its move and its part in the whole, largest first, and the book's move in percent and in money; cash and anything without a close that day count as unchanged and are named.", shown: "always" },
  holdings_by_class: { label: "Holdings by class", about: "One group per class; one list when there are no classes.", shown: "always" },
  correlation: { label: "How the holdings move together", about: "The correlation of daily returns of every listed holding with every other and with the benchmarks the methodology names and SPY and QQQ, over one month, three months or a year, from the price feed's daily closes; a holding the feed cannot read is named.", shown: "always" },
  allocation: { label: "Where the money is", about: "Liquid and illiquid, currencies, overlap and account; net worth by asset class and by currency as tabs of the donut card.", shown: "always" },
  class_register: { label: "Classification Register", about: "Every holding against every criterion of the methodology's classes: its reading, pass or fail, the count against what its class needs, and what kept it out of the classes ahead. Derived from the Classification Test today; nothing is filed.", shown: "classes" },
  holdings_by_sector: { label: "Sectors", about: "Weight by sector, GICS-style from the SEC industry code, once filings are read or a source supplies sectors; a fund whose report lists its companies counts toward theirs; a tab of the donut card.", shown: "sectors" },
  holding_tiles: { label: "Position", about: "Weight against cap, room to cap, price and quantity, gain on cost.", shown: "always" },
  holding_todo: { label: "To do", about: "What the methodology asks of this holding now, each with the action that answers it: plan a trim, decide, vote, settle.", shown: "methodology", practice: "todo_list" },
  holding_valuation: { label: "Own valuation", about: "The owner's low, base and high with the price placed among them.", shown: "valuation" },
  class_test: { label: "Class criteria", about: "Each criterion of the holding's class against the holding's own figure.", shown: "classes" },
  holding_dates: { label: "Dates", about: "Clocks and dated fields for this holding.", shown: "dates" },
  holding_rules: { label: "Rules on this holding", about: "Every tested rule as it reads for this holding, with its reading and limit.", shown: "tests" },
  holding_triggers: { label: "Triggers and kill signals", about: "The person's own triggers and kill signals for this holding: a price or a fundamental at or beyond a level, each an alert when met.", shown: "always" },
  holding_fundamentals: { label: "Fundamentals", about: "The figures read from filings or research for this holding.", shown: "fundamentals" },
  decision_letter: { label: "How you decided this month", about: "The monthly letter on the Decision Log: the month's entries, trades with a reason, trades planned before, valuations judged a year on, rules kept and sales looked back on, each with what it rests on; the monthly review carries the same. It scores the thinking, never the money.", shown: "always" },
  holding_decisions: { label: "Decisions", about: "Decision Log entries naming this holding.", shown: "decisions" },
  look_through: { label: "Look-through", about: "The fundamentals the methodology's classes and figures test (ROIC, revenue growth, engine growth...), as the weighted average of each listed company's own figure, for the book and for each class, beside SPY and QQQ worked out the same way from the companies each fund reported to the SEC; and every holding's own. Each average says how much it covers.", shown: "fundamentals" },
  perf_sections: { label: "The methodology's returns and risk", about: "The dashboard sections whose figures all read the account's value series (returns against the benchmarks, volatility, beta, drawdown), as tiles at the top; drawn here rather than on the first screen.", shown: "series" },
  perf_tiles: { label: "Returns", about: "Net worth, the year against the benchmark, since the series began, and the gap below the high; drawn when the methodology has no return and risk section of its own.", shown: "series" },
  perf_insights: { label: "In your methodology", about: "Each card on Performance read through the methodology on the AI when they ask: one short reading under each card, whether its figures matter at the methodology's horizon, which way they point and the section they bear on, and a line for the page as a whole. The app computes every figure; a reading quoting one it did not give is dropped. Never advice.", shown: "methodology" },
  alpha: { label: "Alpha", about: "Jensen's alpha against the methodology's first benchmark with prices, else SPY: the book's excess returns regressed on the benchmark's, the intercept a year with its 95% interval, t statistic and p-value, beta and R², and the returns drawn under the fitted line.", shown: "series" },
  irr: { label: "IRR", about: "The money-weighted return since the series began: the one yearly rate that turns the start value and every deposit and withdrawal into the value now, beside the time-weighted return, with what the gap says about timing and what IRR means.", shown: "series" },
  by_period: { label: "Returns by period", about: "The account against each benchmark the methodology names, by period.", shown: "series" },
  growth: { label: "Growth of 100", about: "What 100 at the start of the window grew to, with the benchmarks.", shown: "series" },
  risk: { label: "Risk", about: "Volatility, beta, worst fall, Sharpe, over the chosen window.", shown: "series" },
  day_stats: { label: "Bad days and good days", about: "The loss one day in twenty reaches and the average of those days, the worst and best day; next to the first benchmark, up and down capture and the tracking error; the share of days and months that rose, the best and worst month; over the chosen window.", shown: "series" },
  drawdown: { label: "Below the high-water mark", about: "The gap below the running high, by day.", shown: "series" },
  monthly: { label: "Monthly returns", about: "Year by month, with the benchmarks.", shown: "series" },
  fair_value: { label: "Against your fair value", about: "Each listed holding's price against the base case of the valuation the person set on its thesis (the bear and bull beside it), and the book over all of them weighted by value: below, at or above the person's own fair value, with the move to their bears, bases and bulls. The person's own arithmetic, never a forecast.", shown: "always" },
  book_flow: { label: "Where your share of the revenue goes", about: "The book as an income statement: each listed holding's share of its company's past twelve months, sized by what is held over the price to sales, every line scaled to it and summed, from revenue by holding to gross profit, operating income and net income. The filings' figures, never a forecast; a holding with no filed revenue or price to sales is named.", shown: "always" },
  value_map: { label: "Value map", about: "Each listed holding and watchlist company by its forward P/E against its EPS growth a year, with the PEG 1 line (after Dividendology's stock value map): the growth the analysts project on Nasdaq's yearly consensus, or what the filings show was delivered over three to five years, on a switch. A reference line, never a verdict.", shown: "always" },
  portfolio_pe: { label: "Portfolio P/E", about: "What the book pays for its companies' trailing earnings: the listed holdings' P/E from their filings, weighted by value as a harmonic mean, its earnings yield, the S&P 500's beside it, and its range over the year from each holding's closes against its trailing EPS as known then.", shown: "always" },
  what_made: { label: "What each holding made", about: "Each holding's gain or loss in money over the past year or since the start, with its dividends and whether it was sold, the ones that added most beside the ones that held the book back, and interest and fees on a line of their own.", shown: "always" },
  concentration: { label: "Concentration", about: "Top one, three and five, effective holdings, Herfindahl.", shown: "always" },
  revenue_regions: { label: "Revenue by region", about: "Where the listed holdings' revenue is earned, by position weight, from each company's segment note in its latest annual or quarterly filing, in regions that never overlap: North America, Latin America, Europe, Middle East and Africa, Asia-Pacific, and what a company reports only as the Americas or outside its home; what no filing places is named; a tab of the donut card.", shown: "always" },
  holdings_sections: { label: "The methodology's composition figures", about: "The methodology's sections that measure the holdings themselves (how many, the largest, the top five), each figure drawn as its recipe asks; a figure grouped by holding, sector or class is left to the pies and the register.", shown: "always" },
  market_sections: { label: "The methodology's market figures", about: "The dashboard sections whose figures read the market indicators, each drawn as its recipe asks; the first names the screen.", shown: "markets" },
  market_rules: { label: "Market rules", about: "Every tested rule on a market figure (a VIX watch, an inverted curve), with its reading and limit.", shown: "markets" },
  market_indices: { label: "How the US indices are doing", about: "The S&P 500, the Nasdaq Composite, the Dow and the Russell 2000 (IWM) through the last closed session, each with its close and move, read after the close.", shown: "markets" },
  market_heatmap: { label: "Heat map of the S&P 500", about: "Every S&P 500 company in its GICS sector, sized by market value and coloured by its move in the last closed session; read once the session has closed.", shown: "markets" },
  market_movers: { label: "S&P 500 top movers", about: "The ten S&P 500 companies that rose most and the ten that fell most in the last closed session.", shown: "markets" },
  market_drivers: { label: "What is driving the S&P 500 and QQQ", about: "The companies that added most to the S&P 500's and QQQ's move in the last closed session and the ones that took most away: each one's weight at the close before by market value, its move, and the two multiplied, beside the index's own move.", shown: "markets" },
  market_today: { label: "What happened today", about: "On At the Close: the last session's story, from the source the person chose: the recap newsletters they forward that arrived since the close (StockMKTNewz, with a guide to set it up), each as its summary and points, and a recap their own Claude writes from the web, each point with its page; else the latest day's.", shown: "markets" },
  market_world: { label: "World equities", about: "Developed markets, developed markets outside the US, emerging markets and the S&P 500 over a year from the same start, then the FTSE 100, DAX 40, Nikkei 225, Nifty 50 and Shanghai Composite.", shown: "markets" },
  market_liquidity: { label: "Liquidity", about: "The Fed's bond holdings week by week and their change, and the overnight rates (fed funds and SOFR) over five years.", shown: "markets" },
  market_economy: { label: "The US economy", about: "Mortgage rates, the fed funds rate and inflation on one chart over five years, then unemployment, consumer sentiment, CNN's fear and greed index, federal income tax receipts and the dollar.", shown: "markets" },
  market_economies: { label: "Major economies", about: "A heat map of the developed economies: policy rate, current account, government debt, real and nominal growth, the growth of the interest their governments pay against the growth of their economies, and broad money.", shown: "markets" },
  market_cycle: { label: "Cycle signals", about: "The Treasury curve now against a month and a year ago, the New York Fed's recession probability, the Dow industrials against the transports (Dow theory), and the homebuilders (XHB).", shown: "markets" },
  market_calendar: { label: "Next on the calendar", about: "The next two weeks of the calendar's releases, central bank decisions, elections, summits and deadlines, with the way to the Calendar, where each carries what it touches in the book and its history.", shown: "markets" },
  market_credit: { label: "Credit stress", about: "Altman's Z-score from the filings, with interest cover and net debt to EBITDA, for the companies held and watched first, then the S&P 500 and Nasdaq-100 companies with the lowest scores; banks, insurers and real estate trusts not judged (lib/credit-stress.ts). Altman's zones, never a forecast; no market spread, since none is free to show.", shown: "markets" },
  flow_etfs: { label: "Where the money in ETFs went", about: "The largest US ETFs' monthly flows from their N-PORT reports to the SEC (shares sold and reinvested less redeemed), summed by bucket over the latest three months most of them have filed: what left the buckets that lost money and the new money, spread over the buckets that gained it in proportion, since money is not labelled (lib/etf-flows.ts). Months behind, since a fund's report is public about sixty days after its quarter; the chart says which months.", shown: "always" },
  flow_funds: { label: "The ETFs money moved most", about: "The same three months fund by fund: the ETFs that took in the most and lost the most, each with its bucket (lib/etf-flows.ts fundsMoved).", shown: "always" },
  flow_positioning: { label: "How the big traders are positioned", about: "The CFTC's weekly Commitments of Traders: asset managers' and leveraged funds' net futures on the S&P 500, the Nasdaq-100, the 10-year note and the dollar, and managed money's on gold and crude, each as a share of open interest against its own three years.", shown: "always" },
  flow_foreign: { label: "What foreigners bought and sold", about: "The Treasury's monthly TIC report: foreign net purchases of US Treasuries, agency bonds, corporate bonds and stocks, by month over the past two years.", shown: "always" },
  flow_cash: { label: "Cash on the sidelines", about: "Money market fund assets at each month's end over the past five years, and what they hold (Treasuries, repo, agency debt, bank paper), from the Office of Financial Research's Money Market Fund Monitor, drawn from the funds' own reports to the SEC.", shown: "always" },
  flow_insiders: { label: "Insiders across the S&P 500 and Nasdaq-100", about: "Open-market purchases and sales by the officers, directors and largest owners of S&P 500 and Nasdaq-100 companies (Form 4, codes P and S alone), summed by sector over the last quarter the SEC has published, with the largest purchases.", shown: "always" },
  market_odds: { label: "What the markets bet on", about: "The chance of a cut, a hold or a hike at the Fed's next meeting from Kalshi's or Polymarket's markets, whichever has more traded on it, and of a US recession from Polymarket's, as their prices stand; public, keyless, read an hour apart (lib/odds.ts).", shown: "markets" },
  market_lines: { label: "One year", about: "A line a year long for each indicator the methodology's figures name, with a table view.", shown: "markets" },
  by_company: { label: "By company", about: "Every company traded, with its buys and sells and a chart of its price with each fill on it.", shown: "transactions" },
  wins_losses: { label: "When you win and when you lose", about: "How much a winning sale makes against how much a losing one loses: the averages, the biggest, the win rate, what a sale earns on average.", shown: "transactions" },
  rotations: { label: "Rotations", about: "Money moved from one holding into another in the days after a sale, and what it did there against staying put.", shown: "transactions" },
  trade_stats: { label: "Trade statistics", about: "Sales won, profit factor, average win and loss, days held.", shown: "transactions" },
  trades_planned: { label: "Planned or not", about: "Cooling-off trades: the past year's buys and sales planned on Trade check a day to a month before, against those made without a plan, each judged against SPY a month on; the plans still open. Counts the thinking, never an amount.", shown: "transactions" },
  trades_postmortems: { label: "Sales a year on", about: "Each sale looked back on a year after it was made: the reason written then, and what the stock did since against SPY (worse means well made, better means early); the sales still inside their year with the day each is read. Past prices, never a forecast.", shown: "transactions" },
  trades_reasoned: { label: "Your reasons, scored", about: "The reasoned-trade score: the past year's buys and sales with a reason in the Decision Log, and how the reasoned ones fared against SPY since (a buy that beat it, a sale that then did worse), judged a month on. It scores the thinking, never an amount.", shown: "transactions" },
  trade_costs: { label: "Fees and taxes", about: "What trading cost: the commission and tax on each fill, the tax withheld on dividends and the account's other fees, over the window, and as a share of the money traded.", shown: "transactions" },
  activity: { label: "Bought and sold per month", about: "Money in and out of positions, by month.", shown: "transactions" },
  fills: { label: "Fills", about: "Every buy and sell, newest first.", shown: "transactions" },
  unlogged: { label: "Without a Decision Log entry", about: "Sales with no entry naming the holding within a week.", shown: "decisions", practice: "decision_log" },
  signal_groups: { label: "Signals", about: "Every tested rule per holding: red, amber, no reading, information, clear.", shown: "tests" },
  watched: { label: "Watched", about: "Symbols the owner records without holding, with their valuation and note.", shown: "always" },
  watch_form: { label: "Watch a symbol", about: "Add a symbol with a note and, if the owner has one, a valuation.", shown: "always" },
  trade_form: { label: "Trade", about: "Side, symbol, amount.", shown: "always" },
  trade_result: { label: "Result", about: "Weight now, after and against the cap; every rule that would newly fail or come near.", shown: "tests" },
  trade_plan: { label: "Plan it, trade tomorrow", about: "Cooling off: the trade written as a plan in the Decision Log, in the person's words, before the order; a trade a day to a month later counts as planned on Trades. Nothing is sent to a broker.", shown: "always" },
  trade_draft: { label: "Decision Log draft", about: "An entry ready to file.", shown: "always" },
  decision_form: { label: "New entry", about: "Date, kind, symbol, title, text.", shown: "always" },
  decision_entries: { label: "Entries", about: "Newest first, filterable by symbol.", shown: "always" },
  todo_now: { label: "Do now", about: "Breaches, holdings no class places, sales with no Decision Log entry.", shown: "methodology" },
  todo_due: { label: "Due by a date", about: "Every clock, expiry, maturity and report, by date.", shown: "methodology" },
  todo_later: { label: "Owed, no date", about: "What each manual rule asks per holding and has no record of, what a waiting rule needs, holdings near a cap, a voted class the tests do not give.", shown: "methodology" },
  todo_decided: { label: "Decided", about: "What the person decided in the app, until the reading changes, the date comes, or a checked rule's week is up.", shown: "methodology" },
  earnings_calendar: { label: "Next results", about: "The next date a holding, a watched symbol or a company the person added reports, with the way to the Calendar, where every company's date sits beside the releases, central banks and elections, from the Nasdaq earnings calendar.", shown: "always" },
  earnings_reports: { label: "After the results", about: "For each company on the calendar that has reported: the filing, the quarter's figures against a year before, the methodology's class test and rules on the new figures, the person's own triggers and valuation, and, what the release and the call said, each point with its page.", shown: "always" },
  earnings_reads: { label: "Read after the results", about: "For each company that released results in the past three weeks, what the person's own Claude read after them and wrote to the thesis with write_thesis or what the person added themselves, and the companies with nothing added yet. The app reads the call itself.", shown: "always" },
  earnings_decks: { label: "Post-earnings decks", about: "For each holding, the deck of its latest results in the review's own face (the headline, the quarter against a year before, the class test and rules, triggers and kill signals, the valuation, what the release and the call said, the sources), and every earlier deck by company.", shown: "always" },
  earnings_add: { label: "Add a company", about: "Companies the person follows for their results without holding or watching them.", shown: "always" },
  thesis_calibration: { label: "Your valuations, a year on", about: "The calibration score: each own valuation (the record's bear, base and bull per share) set a year ago or more, against the close a year after it was set, inside the range, below the bear or above the bull, and how far the base was; the ones still waiting with the day each is judged.", shown: "always" },
  thesis_scorecard: { label: "Scorecard", about: "Each stock thesis, held or watched, and each market thesis with a basket of companies, measured against SPY from the day it was written: the company's or the basket's return in equal parts over the same days as SPY's. It scores the ideas, not the trades (after Rallies.AI).", shown: "always" },
  thesis_markets: { label: "Market theses", about: "What the person believes about the market itself (rates, a cycle, a theme), each with pillars tested on the indicators the app reads and the evidence folded in; split from the stock theses.", shown: "always" },
  thesis_list: { label: "Stock theses", about: "The holdings, then the watchlist, each with the state of its folder: the thesis written or not, the pillars read today, the kill signals, the valuation against the price, the latest results.", shown: "always" },
  thesis_record: { label: "The thesis", about: "The thesis in the person's own words, the pathway where the methodology asks for one, and the watch items.", shown: "always" },
  thesis_pillars: { label: "What must stay true", about: "The pillars the thesis stands on, each with the figure that tests it and today's reading: supported, mixed, at risk, or not readable from the filings.", shown: "always" },
  screen_table: { label: "Screener table", about: "Every company in the S&P 500 and the Nasdaq-100 as a row, after TradingView's screener: price, move and market value from the last closed session; P/E, EPS and revenue growth, dividend yield and ROIC from the filings; the class the methodology puts it in; filter pills for the index, price, move, market value, the figures, the sector and the class, and every column sorting.", shown: "always" },
  screen_map: { label: "Screener heat map", about: "The companies the filters leave as a heat map, each in its sector, sized by market value and coloured by its move in the last closed session.", shown: "always" },
  screen_words: { label: "Ask in words", about: "A screen typed in words (\"cash-rich software with margins over 30%\"), compiled once on the AI into filters on the ontology's fields that the app runs itself on the same companies; the filters are shown before the results, and nothing is ranked by the model (after Rallies.AI).", shown: "classes" },
  screen_classes: { label: "What your classes would own", about: "Each class's companies among the S&P 500 and the Nasdaq-100, the largest first, with the count of criteria that held; a held or watched company marked.", shown: "classes" },
  screen_near: { label: "One criterion short", about: "Companies no class takes whose required filters hold and that miss one class by one criterion, with the criterion that failed.", shown: "classes" },
  fund_ranking: { label: "Closest to your methodology", about: "The top funds ranked by the share of their 13F in companies the person's classes would take, of the share the app could judge, with the overlap with their book.", shown: "always" },
  fund_creeds: { label: "Closest in what they say", about: "The top funds ranked by what each says it does, read once a quarter for everyone from its own letters, site and filings (lib/fund-creeds.ts): the share of the tests the person's classes set that it says it wants the same way, less the other way, and the styles both carry, beside the companies and themes both hold a thesis on; each fund's approach, figures and stated theses with their pages.", shown: "always" },
  fund_moves: { label: "What they did", about: "Each fund's new positions, additions, trims and sales against the quarter before.", shown: "always" },
  agent_map: { label: "How the agents are built", about: "The hierarchy (every agent on the model each of its steps runs on: Opus, Sonnet, Haiku and the app's own code), the three layers of the agents doc (capability agents, the task agents on them, the agents people build) and the Research Agent's loop: Gather, Filter, Sift, Judge, Check, with the edge back to Gather, each step's model tier.", shown: "always" },
  agent_cards: { label: "The agents", about: "Every agent's contract: what it is for, what it reads, its trigger, its last run, this week's estimated cost against its ceiling, how its findings were rated, and the switch that turns it off.", shown: "always" },
  agent_curve: { label: "How the agents are learning", about: "The person's ratings week by week: how many were rated, the share found useful, the lessons approved, and what was wrong most often.", shown: "always" },
  agent_rules: { label: "The rules every agent follows", about: "The agents doc's rules, the rollout and the decisions taken, so the person sees what an agent may and may not do.", shown: "always" },
  community_share: { label: "Share with the community", about: "The person's own card: share their theses and their book's weights in percent with the other people on this deployment under a handle, or stop; what is shared is listed in full, and never an amount, an account, a valuation, a DCF, a decision, an alert or the evidence on a thesis.", shown: "always" },
  community_following: { label: "Following", about: "The people the person follows, each with their theses and weights a press away; a handle no longer shared is named.", shown: "always" },
  community_index: { label: "Community index", about: "What the people sharing on this deployment hold together: each company held by at least five of them, with how many hold it and its average weight in percent among them, from the shared cards alone; never a person, an amount or an account (after Rallies.AI).", shown: "always" },
  community_people: { label: "People sharing", about: "Everyone sharing on this deployment, newest first, to follow or open.", shown: "always" },
  community_profile: { label: "A person's profile", about: "One shared profile: the theses in their words (text, pillars with their tests, pathway, watch) and each holding's weight in percent as a donut and a list; nothing of their money's size.", shown: "always" },
  community_pooled: { label: "How methodologies did", about: "The track records people chose to share, pooled by the family of their methodology (fundamentals, options, quant, macro): how many, the median return against SPY and the median share of rules kept, in percent; a family is shown only once at least three people share in it, and never a person.", shown: "always" },
  community_family: { label: "Your family", about: "Family accounts: a household of up to eight people who each sign in to their own app and see each other's shared cards side by side (the five largest weights in percent, the theses, the record against SPY in points and the rules kept), with the holdings two or more of them hold; joined by a code, left at any time, never an amount.", shown: "always" },
  community_card_link: { label: "Your card's link", about: "A private link to the person's own card, for a mentor, a professor or a hiring manager: the same card as Community draws, read without a sign-in; the card may be left off the Community lists; a new link ends the old one, and Turn off ends it.", shown: "always" },
  club_list: { label: "Your clubs", about: "The clubs the person started or joined, each with its members and their role in it; join one with the code its owner or an officer gave, or start one with a name, a line and the Google Drive folder its material already lives in.", shown: "always" },
  club_material: { label: "Club material", about: "The club's Google Drive folder as Google itself draws it, each member seeing it with their own Google sign-in and the access the folder's owner gave them, so lectures, decks and notes added in Drive are here at once; Open in Drive to add or open a file. The app never reads or writes the folder.", shown: "always" },
  club_competitions: { label: "Competitions", about: "The club's virtual portfolio competitions: each with its days, its virtual cash, its weight limit and the leader so far; the owner and officers start one.", shown: "always" },
  club_members: { label: "Members", about: "The club's members under the names they chose and their roles; the owner and officers also see each sign-in address, to paste into Drive's Share box for the folder, the club's join code and a fresh one.", shown: "always" },
  club_library: { label: "Research library", about: "The club's pitches and theses by ticker, newest first, each with its title, words and the member's club name; every member adds one, the author or an officer removes it, and it stays with the club when the author leaves.", shown: "always" },
  club_meetings: { label: "Meetings", about: "Investment committee meetings: an officer calls one with its day and agenda, a line on a ticker tied to the library's newest pitch on it; each member votes for, against or abstains on each item until the minutes are written, the tallies and outcome shown to all, never who voted how.", shown: "always" },
  club_league: { label: "Club league", about: "Every club that chose to show, by its newest competition with at least three entries: the median member's return and the median against SPY, the best return, the date read; never a member's name or an amount.", shown: "always" },
  club_graduation: { label: "Your path", about: "The graduation path from a club to one's own book: learn in a club, run your own book, share your card and record, list your methodology for others; each step marked done or linked.", shown: "always" },
  club_challenges: { label: "Challenges", about: "Club-to-club challenges: a club challenges another by its id to a competition on the same days and rules; once accepted, each club runs its own copy, and the result sets the two medians against SPY side by side.", shown: "always" },
  club_bounties: { label: "Bounties", about: "Thesis bounties: an officer asks for a pitch on a ticker by a date; members answer with pitches, each member votes once for one not their own, and the most voted wins when it closes.", shown: "always" },
  club_picks: { label: "How the picks did", about: "Each pitch in the club's library against SPY since the day it was written, from the closes, with the peer reviews' average score; the pitches, never an amount.", shown: "always" },
  club_watch: { label: "The club's watchlist", about: "A watchlist the club shares, with a level per ticker; a close past a level is an alert for every member on Notifications.", shown: "always" },
  club_alumni: { label: "Alumni", about: "Members who left and chose to be listed, by the year they left, with their role; their sign-in is never shown.", shown: "always" },
  methodology_packs: { label: "Rule packs", about: "Ready-made rules with the figures they test (concentration, diversification, drawdown, a cash buffer), laid on the person's methodology as a draft to confirm; a rule already held is kept as it is.", shown: "always" },
  methodology_market: { label: "Methodology marketplace", about: "Methodologies people chose to list, rules only, credited and counted by adoptions; adopting one makes a draft credited to its author. Free for now; never a holding or an amount.", shown: "always" },
  market_funds: { label: "From the top funds", about: "What each top fund says it does, read from its own letters, site and filings: its summary, each figure it looks for as a guideline to check and, where it states levels, a class on those levels. Adopting one makes a draft on the person's own figures and dashboard, credited to the fund; no level is made up.", shown: "always" },
  market_fund_theses: { label: "Theses the top funds state", about: "The theses the top funds state in their newest letters and talks, each on a company or a theme with its page. Taking one in starts the person's thesis with the fund's words, credited, or adds an entry to the one they have; a company not held joins the watchlist.", shown: "always" },
  club_course: { label: "Course pack", about: "For a university club or class: a term's syllabus week by week (a topic, what to read in the app, the graded task) and, for the owner, officers and adviser, each student's grade in each course competition, out of 100 on the reasons written, the holdings held and the limit kept; never the return.", shown: "always" },
  club_season: { label: "The season", about: "The inter-university season, September to June: each league club's best competition started in the regular season by its median member against SPY, then the top four's competitions in the final round in May and June. Virtual money; clubs on the league alone.", shown: "always" },
  club_calibration: { label: "Calibration board", about: "Each author's pitches with a bear, base and bull a share at least ninety days old: how often the price now sits inside their range, and how far their base was from it at the median. It scores the judgement, never the pick's return.", shown: "always" },
  club_fund: { label: "The club's pick fund", about: "A virtual dollar in each ticker's first pitch at the close on its day, held since, beside a dollar in SPY on the same days, drawn as two lines. Equal-weight and virtual, never anyone's money.", shown: "always" },
  club_treasury: { label: "Treasury", about: "When a club runs real money, the member whose own book holds it links it: the club sees each holding's weight in percent and the trades by day and side, set against the meetings' votes (followed, not acted on, traded against the vote, kept to it). Never an amount, a price or a share count.", shown: "always" },
  club_mentors: { label: "Alumni mentors", about: "Members who stay on after they leave as mentors: they read the library and review pitches with a note under their name, and never compete or vote.", shown: "always" },
  methodology_shadow: { label: "Run beside mine", about: "A second methodology, from the library or the marketplace, read on the same book beside the person's own: each one's rules kept, breaches, what its classes place, and every rule where the two disagree. Nothing changes until the person adopts it as a draft.", shown: "methodology" },
  methodology_versions: { label: "Versions", about: "Every confirmed version of the methodology: its fingerprint sealed in the registry (the hash and the time, never the words), and word for word what changed since the version before, kept as a Decision Log entry.", shown: "methodology" },
  methodology_frameworks: { label: "Public frameworks", about: "The library's frameworks after Benjamin Graham, Joel Greenblatt and Peter Lynch, and dividend growth as income investors practise it: classes and rules in the ontology's terms, credited, with what the ontology cannot yet say listed as gaps; adopted as a draft to confirm.", shown: "always" },
  pack_listings: { label: "Packs from verified analysts", about: "A few rules, eight at most, from a verified analyst's own methodology with the figures they test, listed under their name and laid on the person's methodology as a draft to confirm. Only an author whose shared record carries the verified mark can list one.", shown: "always" },
  community_judgement: { label: "How I decide", about: "The recruiter view on a card, when ticked: the share of trades with a reason and how they fared, the share planned a day ahead, the valuations judged a year on and the club record, in percent alone.", shown: "always" },
  community_badge: { label: "Record badge", about: "The verified record as a badge for a CV or a profile: an image and a link to the card, from the card's private link; withdrawn with the card.", shown: "always" },
  community_mentors: { label: "Mentors", about: "Verified analysts who offer to review a person's methodology and theses: free now, the later price shown; an ask opens the asker's card to that mentor alone until it is answered.", shown: "always" },
  public_calls: { label: "Public sealed calls", about: "A thesis published as a call: its words, the price and SPY on the day, its fingerprint sealed in the registry, and how it has done since against SPY, on a public page; unpublished at any time.", shown: "always" },
  open_research: { label: "Open data for researchers", about: "The pooled open data as one CSV under CC BY 4.0, with what each column means, how to cite it and what it cannot tell; five people or more behind every row, never a name or an amount.", shown: "always" },
  annual_awards: { label: "Annual awards", about: "The year's awards from the listed cards and the league's clubs: best calibrated, most disciplined, every trade reasoned, club of the year and best research library. How people decided, never a return alone.", shown: "always" },
  family_rules: { label: "Family rules", about: "A ready-made rule pack the household keeps together: each member's own app reads it on their own book, and the household sees each rule's status and reading in percent or a count beside each name, never an amount.", shown: "always" },
  decision_journal: { label: "The sealed decision journal", about: "Every Decision Log entry, oldest first, each amount masked, exported as a PDF with the fingerprint of its words sealed in the registry, checkable at /receipt, so the journal cannot be backdated.", shown: "always" },
  club_records: { label: "Your record", about: "Each competition the person entered: return, points against SPY, rank of how many and trades with a reason, kept on their own sign-in when they leave a club or it closes, so the record goes with them; percent and ranks alone, and they forget it with one button.", shown: "always" },
  competition_board: { label: "Leaderboard", about: "Each entry's virtual book at the last close (the last day's close once it has ended), ranked by return on the starting cash, with SPY over the same days, the points each is ahead of or behind it, how many holdings, the largest weight and how many trades carry a reason.", shown: "always" },
  competition_book: { label: "Your virtual book", about: "The member's own entry: cash, each holding at the last close with its weight, every trade with its reason, and the form to buy or sell a listed ticker at the last close within the competition's rules (no short, no margin, the weight limit). Virtual money; nothing is ever traded at a broker.", shown: "always" },
  thesis_figures: { label: "Charts and pictures", about: "Charts and pictures that bear on the thesis, each with its source, added by the person's own Claude through the connector (write_thesis figures): a chart the app draws itself from the figures given, a line over dates or bars over labels on one axis, or a picture shown from a public https page with no referrer; the person removes any.", shown: "always" },
  thesis_hunter: { label: "Added by Thesis Hunter", about: "What the Thesis Hunter found for the thesis: every morning the AI hunts the web (a few searches), the newsletters they forward and the podcasts they follow for research, data, news, charts and pictures that bear on it, and records each find with whether it backs the thesis, challenges it or updates it, the pillar it bears on, its source with its page, and a chart from figures the source prints or a picture it carries. A find never changes the thesis; it is an alert on Notifications and in the recap after the close, and the person dismisses it or runs Hunt now.", shown: "always" },
  thesis_priced_in: { label: "What the price assumes", about: "The priced-in question (the agents doc, §4.3): the reverse DCF at today's price, what the company delivered, the guidance and the person's own cases, the app's figures, then on the AI each pillar read as priced in, partly, not priced in or bet against, with its evidence and pages. Asked on request and kept a week.", shown: "always" },
  thesis_evidence: { label: "Added to the thesis", about: "What was folded into the thesis over time: a document or data the person uploaded and their own model read against the thesis and the methodology it lives under (Add to thesis: the changes it proposes are shown highlighted for them to approve, deny or amend before anything moves), a document their Claude wrote through the connector, or a note of theirs, each with what it said and what it changed.", shown: "always" },
  thesis_signals: { label: "Kill signals and triggers", about: "The record's kill signals and triggers with today's reading, as every post-earnings deck re-scores them.", shown: "always" },
  thesis_peers: { label: "Against its peers and its sector", about: "The company's trailing and forward P/E, P/S and P/FCF from the filings beside its peers' median (the same GICS sub-industry in the S&P 500 and the Nasdaq-100, else the same SEC industry code) and its sector taken whole, the premium or discount on each, and the analysts' consensus forward P/E as its own line. From the screener's file; nothing forecast by the app.", shown: "always" },
  thesis_dcf: { label: "Valuation calculator", about: "The person's own valuation by the company's stage (Valuation by stage, after Brian Feroldi): the stage the filings place the company in, with the rule that decided it; the metrics useful at that stage first, each with the person's bear, base and bull estimate on the filings' own per-share figures (sales, gross profit, trailing and forward earnings and free cash flow, the addressable market); and the discounted cash flow, by free cash flow or by earnings, with a sensitivity grid and the growth and margin the price implies. Kept, the chosen method's cases are the record's own valuation.", shown: "always" },
  thesis_report: { label: "Latest results", about: "The latest post-earnings report with its earnings deck embedded, as the Earnings screen keeps it.", shown: "always" },
  thesis_study: { label: "Research on the stock template", about: "The latest study of the company on the methodology's template, with its PDF, or the form to queue one.", shown: "methodology" },
  thesis_archive: { label: "Archive", about: "Earlier reports, decks and studies of the holding, newest first.", shown: "always" },
  dated: { label: "Dated", about: "Clocks from the rules, option expiries, maturities, the next report.", shown: "dates" },
  economic_calendar: { label: "Events and results", about: "One month grid of the US releases, the major central banks' decisions, the elections, summits and deadlines whose dates are set, what the Calendar agent found and the followed companies' results, each with what it touches in the book under the methodology and how the book, at today's weights, and SPY moved on the session that traded each past occurrence, by outcome (lib/calendar-run.ts, lib/event-sensitivity.ts). History, never a forecast.", shown: "always" },
  event_reports: { label: "After each event", about: "A report after each macro event on the calendar once the session that traded it has closed (lib/macro-report.ts): the markets' and the book's moves on that session, the book against its history on the kind of event and what Kalshi or Polymarket priced the day before where a question is the event's own and deep enough (lib/event-odds.ts), each reading again of an outcome not final, what it touches in the book under the methodology, and the outcome against what was expected, read from the web with each page; summarised here with the moves as bars, as an alert with the moves as chips and as an email. History, never a forecast.", shown: "always" },
  // The weekly and monthly review (lib/review.ts), in HCMP's slide order. A section with nothing to show drops out.
  review_verdict: { label: "Verdict", about: "The worse of two pillars, Behaviour and Holdings and theses; returns are context and never decide it.", shown: "methodology" },
  review_alarms: { label: "Alarms: decisions owed", about: "Breaches with their holding, watches tripped, clocks within 35 days, most urgent first.", shown: "tests" },
  review_returns: { label: "Returns", about: "The period and the year to date, the account against each benchmark the methodology names.", shown: "series" },
  review_moves: { label: "What moved the book", about: "Contribution by holding and by class, and the correlation of the holdings over 21 sessions, from the closes per holding; says what it needs without them.", shown: "series" },
  review_insights: { label: "What the numbers mean", about: "Two to six rule-based sentences from the period's own figures.", shown: "always" },
  review_capital: { label: "Caps by class, and where the capital sits", about: "Weight by class against its cap, then every holding's weight with its headroom.", shown: "always" },
  review_trades: { label: "Trades this period", about: "Every fill with its class, cap, Decision Log entry and vote.", shown: "transactions" },
  review_rulebook: { label: "The rulebook", about: "Every rule followed, partly, not followed or the person's to check; x of y followed.", shown: "methodology" },
  review_theses: { label: "Holdings and theses", about: "Every holding's class and test, what is on file, the period's evidence and its standing; price alone never changes a standing.", shown: "always" },
  podcasts: { label: "Podcasts", about: "On At the Close, after the newsletters: the past fortnight's episodes of the podcasts the person follows (All-In with Chamath, Jason, Sacks & Friedberg until they remove it; any show on podscripts.co added on Setup), each written up on their own model from its transcript on podscripts.co: what was said in a few lines and points, and a perspective in the light of their holdings, watchlist, theses and methodology, naming the rule sections it touches; never advice, never the transcript kept.", shown: "always" },
  company_news: { label: "Company news and reports", about: "On At the Close: the past week's headlines, SEC filings and the app's own results reports for the listed holdings and the watchlist, a grid of cards, the newest first, each opening the article, the filing or the report.", shown: "always" },
  extended_hours: { label: "Before the open and after the close", about: "On At the Close, after the brief: each listed holding and watchlist company that traded pre-market (04:00 to 09:30 New York) or after hours (16:00 to 20:00) since the last close, its last trade and its move against that close, the companies with results first; read live every minute while those sessions trade, from Yahoo Finance.", shown: "always" },
  close_brief: { label: "After the close", about: "On At the Close: what drove the last US session and why each listed holding rose, fell or held flat, written by the person's own Claude from the web after the close; a holding that moved 2% or more is marked and alerted.", shown: "always" },
  your_data_today: { label: "Your data", about: "Figures and series the person added themselves (Add data on Customise), from a public API or their own Claude, each with where it came from and when.", shown: "always" },
  your_data_holdings: { label: "Your data", about: "Figures and series the person added themselves for Holdings, from a public API or their own Claude.", shown: "always" },
  your_data_performance: { label: "Your data", about: "Figures and series the person added themselves for Performance, from a public API or their own Claude.", shown: "always" },
  your_data_markets: { label: "Your data", about: "Figures and series the person added themselves for Markets, from a public API or their own Claude.", shown: "always" },
  review_markets: { label: "Markets this period", about: "Each market indicator the methodology reads, and its benchmarks, moved over the period: a price in percent, a yield or spread in points, from the market feed.", shown: "markets" },
  review_news: { label: "News", about: "Holdings in the news, markets and macro, each item with its source, on the person's own Claude provider.", shown: "always" },
  review_letter: { label: "How you decided this month", about: "The monthly letter on how the person decided: the month's Decision Log entries, trades with a reason, trades planned before they were made, valuations judged a year on, rules kept today and sales looked back on, each with what it rests on. On a monthly review alone; it scores the thinking, never the money.", shown: "always" },
  review_hunter: { label: "What the Thesis Hunter found", about: "The week's finds of the Thesis Hunter on each stock and market thesis, holdings first, then the watchlist, then the market theses: each find's stance on the thesis, the pillar it bears on, what it says and its source. The one place a find is told, since a find is no alert; never a verdict.", shown: "always" },
  review_newsletters: { label: "From your newsletters", about: "The newsletters the person forwarded in the period: how many from each sender, and the points that touch their holdings most, each read with the AI into a short digest.", shown: "always" },
  review_questions: { label: "Your questions", about: "The questions the person keeps on Reviews, up to six, each answered with the AI from the review's own figures as a section of the report and a slide of the deck; never advice.", shown: "always" },
  review_calendar: { label: "Coming up and open items", about: "Dated items in the next 35 days and the methodology's open to-do items.", shown: "always" },
  review_week_ahead: { label: "Next week on the calendar", about: "The calendar's events of the seven days after the review (the releases, central banks, elections, summits and deadlines, what the Calendar agent found and the followed companies' results), each with what it touches in the book under the methodology and how the book, at today's weights, and SPY moved on the same kind of event before. History, never a forecast.", shown: "always" },
  review_month: { label: "The month in numbers", about: "Time-weighted return, worst fall, up and down capture, tracking error, trade quality, realised P&L and the sale hindsight.", shown: "series" },
  review_method: { label: "Sources and method", about: "Where each figure came from and what could not be read.", shown: "always" },
};

/** Where a screen is reached from: the top menu and the phone's tab bar or More list (the default), or a row of the Settings menu alone (`under: "more"`), for a screen that is set up once and then runs by itself. */
export type ScreenDef = { label: string; short: string; href: string; module: Module; about: string; shown: ShownWhen; practice?: Practice; tab: boolean; under?: "more"; slots: readonly SlotId[] };

/**
 * The screens, in the order the top menu shows them; the phone tab bar takes
 * the ones marked tab, then More. The first fourteen are HCMP OS's skeleton
 * and exist for every methodology that asks for them; the input screens
 * follow, switched on by the person's inputs (lib/setup.ts modulesFor).
 */
export const SCREENS: Record<ScreenId, ScreenDef> = {
  today: { label: "Dashboard", short: "Dashboard", href: "/", module: "overview", about: "The first screen: the portfolio as one ruled grid at the top (net worth, the day and the gain beside the allocation, then every holding in a table under four tabs beside the day's contributors and detractors and the book against the person's own fair values), live while the US market is open, beside the methodology's headline figures and, under them, the return or value chart against SPY and QQQ; the session (the four indices, the book as a heat map under them, the S&P 500 heat map with what drove it and QQQ under the map, and top movers, so far today while the market is open, else the last close); CNN's fear and greed index on a gauge, what is on watch, the latest review, then the methodology's own sections in its order (its return and risk sections are on Performance, what the book is made of on Holdings, its market sections on Macro; the rule checks and the weights against caps are on Methodology and Holdings, not here; why each holding moved, what happened and the newsletters are on At the Close, the screen after Notifications). Every card says how fresh it is.", shown: "always", tab: true, slots: ["live_book", "portfolio_grid", "headline", "dividend_glance", "return_chart", "market_indices", "market_heatmap", "market_drivers", "market_movers", "book_day", "todo", "fear_greed", "on_watch", "latest_review", "sections", "your_data_today"] },
  notifications: { label: "Notifications", short: "Alerts", href: "/notifications", module: "overview", about: "Breaches, watches, dates and reads since the person last looked.", shown: "always", tab: false, slots: ["notices", "watchers"] },
  after_close: { label: "At the Close", short: "At the Close", href: "/after-close", module: "overview", about: "The last US session read after the close, in the top menu right after Notifications (named At the Close on 19 Oct 2026, After-Market Close Analysis before): After the close (what drove the session and why each listed holding rose, fell or held flat, written by the AI), the moves before the open and after the close, What happened today (the day's recap newsletter with its pictures, then the Claude recap and its sources) and the week's other newsletters by theme, then Company news and reports, then the podcasts they follow written up with a perspective on their book, each read by the AI.", shown: "always", tab: true, slots: ["close_brief", "extended_hours", "market_today", "company_news", "podcasts"] },
  holdings: { label: "Holdings", short: "Holdings", href: "/holdings", module: "overview", about: "Where the money is and how it moves: one donut card first, its tabs the portfolio by holding, by class, by asset class, by sector, revenue by region and by currency, a positions table with the cash, each holding's price against the fair value the person set and the book against all of them, every holding by class with its weight against its cap and a page of its own, how the holdings move together, concentration, the methodology's composition figures, the Classification Register, and where the money is: liquid and illiquid, currencies, overlap and accounts. Every card says how fresh it is.", shown: "always", tab: true, slots: ["by_holding", "by_class", "positions", "fair_value", "portfolio_pe", "value_map", "what_made", "book_flow", "holdings_by_class", "correlation", "concentration", "revenue_regions", "holdings_sections", "class_register", "holdings_by_sector", "allocation", "holding_tiles", "holding_todo", "holding_valuation", "class_test", "holding_dates", "holding_rules", "holding_triggers", "holding_fundamentals", "holding_decisions", "your_data_holdings"] },
  performance: { label: "Performance", short: "Perform", href: "/performance", module: "performance", about: "Returns, growth, risk and drawdown from the account's own series, against the benchmarks the methodology names.", shown: "series", tab: true, slots: ["perf_sections", "perf_insights", "perf_tiles", "irr", "alpha", "by_period", "growth", "risk", "day_stats", "drawdown", "monthly", "look_through", "your_data_performance"] },
  markets: { label: "Macro", short: "Macro", href: "/markets", module: "overview", about: "The market indicators the methodology reads (VIX, yields, gold and silver, the dollar, oil, the US and world indices), its figures and rules on them, the cycle signals, liquidity, the US economy, world equities and the major economies side by side; named Macro, the section that asks for them under the title.", shown: "markets", tab: false, slots: ["market_sections", "market_rules", "market_cycle", "market_liquidity", "market_economy", "market_world", "market_calendar", "market_odds", "market_credit", "market_lines", "your_data_markets", "market_economies"] },
  flows: { label: "Flows", short: "Flows", href: "/flows", module: "overview", about: "Where money is moving in the markets, from public filings and government reports: the ETFs' flows by bucket and by fund, how the big futures traders are positioned, what foreigners bought and sold, the cash in money market funds and what insiders bought and sold. Each says how far behind it is.", shown: "always", tab: false, slots: ["flow_etfs", "flow_funds", "flow_positioning", "flow_foreign", "flow_cash", "flow_insiders"] },
  dividends: { label: "Dividends", short: "Dividends", href: "/dividends", module: "overview", about: "What the book pays and how safely (after Snowball's): the yield and yield on cost, the year's and the month's dividends, each payer's yield and payout, where the income comes from, each dividend's safety from the filings, its growth over five years, the next twelve months' payments, what was received by month and by company, and each month against the years before. On when the book pays dividends; a dividend methodology puts it right after Holdings, with a phone tab, and its tiles on the Dashboard.", shown: "dividends", tab: true, slots: ["dividend_summary", "dividend_yields", "dividend_mix", "dividend_safety", "dividend_growth", "dividend_upcoming", "dividends_received", "dividends_by_holding", "dividend_years"] },
  earnings: { label: "Earnings", short: "Earnings", href: "/earnings", module: "overview", about: "When each holding, each watched symbol and each company the person adds reports, on a calendar with the time of day, an alert the day before, and a report after the results: the filing's figures, the class test and rules on them, the person's own triggers and valuation, and what the release said.", shown: "always", tab: true, slots: ["earnings_calendar", "earnings_reports", "earnings_reads", "earnings_decks", "earnings_add"] },
  trades: { label: "Trades", short: "Trades", href: "/trades", module: "trades", about: "The fills ledger and what it says about the person's trading.", shown: "transactions", practice: "trade_log", tab: false, slots: ["trade_stats", "trade_costs", "wins_losses", "activity", "rotations", "by_company", "fills", "unlogged", "trades_reasoned", "trades_planned", "trades_postmortems"] },
  signals: { label: "Triggers & kill signals", short: "Signals", href: "/signals", module: "overview", about: "Every tested rule as a signal per holding, grouped by status.", shown: "tests", tab: false, slots: ["signal_groups"] },
  watchlist: { label: "Watchlist", short: "Watch", href: "/watchlist", module: "overview", about: "Symbols the person follows without holding.", shown: "always", tab: false, slots: ["watched", "watch_form"] },
  research: { label: "Research", short: "Research", href: "/research", module: "research", about: "Studies on the methodology's template, with figures from filings.", shown: "methodology", tab: false, slots: [] },
  companies: { label: "Companies", short: "Companies", href: "/companies", module: "overview", about: "The way into any company's page: a search over every company that files with the SEC, by ticker or name, then the person's holdings, watchlist and the companies they traded before. A company neither held nor watched is read from its filings when its page is opened.", shown: "always", tab: false, slots: [] },
  screener: { label: "Screener", short: "Screener", href: "/screener", module: "research", about: "The methodology's own classes run on every company in the S&P 500 and the Nasdaq-100 (after Unusual Whales): a table and a heat map of every company with filter pills, after TradingView's, the companies each class would take, the largest first, and those one criterion short, with the filings' figures at the session's close, read a share at a time each morning. The verdicts are the methodology's recipes; nothing is forecast and nothing is advice.", shown: "classes", tab: false, slots: ["screen_table", "screen_map", "screen_words", "screen_classes", "screen_near"] },
  top_funds: { label: "Top funds", short: "Funds", href: "/top-funds", module: "research", about: "What well-known long-term managers own, from their latest 13F filings at the SEC: each fund ranked by how much of its 13F the person's classes would take, beside its overlap with their book, then by what it says it does and the theses it states, from its own pages, against the person's classes and theses, and what it bought, added, trimmed and sold in the quarter. A 13F shows US long positions at the quarter's end, filed weeks later.", shown: "always", tab: false, slots: ["fund_ranking", "fund_creeds", "fund_moves"] },
  agents: { label: "Agents", short: "Agents", href: "/agents", module: "research", about: "The agents that read for the person with the AI (from the agents doc): how each is built, what it reads, what it costs, its runs with what it kept and dropped, its findings to rate as useful or not with what was wrong, the lessons proposed from the ratings for the person to approve, and the learning curve over time.", shown: "always", tab: false, slots: ["agent_map", "agent_cards", "agent_curve", "agent_rules"] },
  theses: { label: "Theses", short: "Theses", href: "/theses", module: "overview", about: "One folder per holding: the thesis in the person's words with the pillars that must stay true and today's reading of each, the record's kill signals and triggers, the Valuation calculator (the stage from the filings, the metrics useful at it, the DCF) whose chosen cases become the own valuation, the latest post-earnings report with its earnings deck, the latest study on the stock template, and the archive. The decks read the thesis, the pillars and the valuation from here. Split into Market theses and Stock theses, the latter as holdings and watchlist; each is filled in by the person or by their own Claude through the connector (write_thesis), and Add to thesis folds a document their Claude read into one as evidence.", shown: "always", tab: false, slots: ["thesis_scorecard", "thesis_calibration", "thesis_markets", "thesis_list", "thesis_record", "thesis_pillars", "thesis_evidence", "thesis_hunter", "thesis_figures", "thesis_signals", "thesis_dcf", "thesis_priced_in", "thesis_peers", "thesis_report", "thesis_study", "thesis_archive"] },
  community: { label: "Community", short: "Community", href: "/community", module: "overview", about: "Follow other people's theses and see their portfolios: everyone who shares on this deployment, under a handle, with their theses in their words and each holding's weight in percent, never an amount; the people the person follows first; and their own card to share or stop sharing. Sharing is a choice, listed in full, kept in the deployment's registry while it lasts and deleted when it stops.", shown: "always", tab: false, slots: ["community_share", "community_card_link", "community_judgement", "community_badge", "community_mentors", "public_calls", "community_family", "family_rules", "open_research", "annual_awards", "community_index", "community_pooled", "community_following", "community_people", "community_profile"] },
  clubs: { label: "Clubs", short: "Clubs", href: "/clubs", module: "overview", about: "Investment clubs, student-managed funds and committees: the club's material from its own Google Drive folder, shown in the app and always in sync, its members and roles, and virtual portfolio competitions among the members, ranked against SPY. Kept in the deployment's registry: the club, each member's sign-in and chosen name, and their virtual trades; never a figure of anyone's own money.", shown: "always", tab: false, slots: ["club_list", "club_records", "club_material", "club_competitions", "club_library", "club_meetings", "club_members", "club_league", "club_graduation", "club_challenges", "club_bounties", "club_picks", "club_fund", "club_calibration", "club_watch", "club_treasury", "club_course", "club_season", "club_alumni", "club_mentors", "competition_board", "competition_book"] },
  analyst: { label: "Analyst", short: "Analyst", href: "/analyst", module: "analyst", about: "Questions answered by the app's own figures.", shown: "methodology", tab: false, slots: [] },
  check: { label: "Trade check", short: "Check", href: "/check", module: "overview", about: "A trade against the methodology before any order.", shown: "always", practice: "trade_check", tab: false, slots: ["trade_form", "trade_result", "trade_plan", "trade_draft"] },
  decisions: { label: "Decision Log", short: "Decisions", href: "/decisions", module: "overview", about: "The person's own record of trades, votes and changes.", shown: "always", practice: "decision_log", tab: false, slots: ["decision_letter", "decision_form", "decision_entries", "decision_journal"] },
  todo: { label: "Methodology to-do", short: "To do", href: "/todo", module: "methodology", about: "What the methodology requires that is not on file yet, holding by holding, each citing its section.", shown: "methodology", practice: "todo_list", tab: false, slots: ["todo_now", "todo_due", "todo_later", "todo_decided"] },
  calendar: { label: "Calendar", short: "Calendar", href: "/calendar", module: "overview", about: "Every date in one place: the releases, central banks, elections, summits and deadlines and the followed companies' results, a week at a time, each with its reach in the book and its history; then the methodology's clocks, expiries and maturities.", shown: "always", tab: false, slots: ["economic_calendar", "event_reports", "dated"] },
  reviews: { label: "Reviews", short: "Reviews", href: "/reports", module: "overview", about: "The weekly and monthly review on the person's schedule, in this order: verdict, alarms, returns, what moved the book, caps, trades and the rulebook, holdings and theses, what the Thesis Hunter found, markets, news, newsletters, the person's questions, coming up.", shown: "always", tab: false, slots: ["review_verdict", "review_alarms", "review_returns", "review_moves", "review_insights", "review_capital", "review_trades", "review_letter", "review_rulebook", "review_theses", "review_hunter", "review_markets", "review_news", "review_newsletters", "review_questions", "review_calendar", "review_week_ahead", "review_month", "review_method"] },
  methodology: { label: "Methodology", short: "Method", href: "/methodology", module: "methodology", about: "The document as the app reads it, and its graph.", shown: "always", tab: false, slots: ["methodology_packs", "methodology_market", "methodology_frameworks", "pack_listings", "methodology_shadow", "methodology_versions", "market_funds", "market_fund_theses"] },
  options: { label: "Options", short: "Options", href: "/options", module: "options", about: "Greeks, expiries and contracts that need attention.", shown: "always", tab: false, slots: [] },
  fixed_income: { label: "Fixed income", short: "Income", href: "/income", module: "fixed_income", about: "Maturity ladder and what pays back soon.", shown: "always", tab: false, slots: [] },
  funds: { label: "Private funds", short: "Funds", href: "/funds", module: "funds", about: "Commitments, calls and what the funds own.", shown: "always", tab: false, slots: [] },
  properties: { label: "Real estate", short: "Property", href: "/properties", module: "properties", about: "Equity, loan to value and the weekly watch.", shown: "always", tab: false, slots: [] },
  statements: { label: "Statements", short: "Statements", href: "/statements", module: "statements", about: "Statements received by email.", shown: "always", tab: false, slots: [] },
  more: { label: "Settings", short: "More", href: "/more", module: "setup", about: "Setup, Customise, Newsletters, the SEC contact and the vault: a menu opened on hover at the top of the page on a laptop, the More tab's page on a phone.", shown: "always", tab: false, slots: [] },
};

// ---------------------------------------------------------------------------
// The ontology in words, for the drafter

export function describeOntology(): string {
  const fields = OBJECTS.map(
    (o) =>
      `${OBJECT_LABEL[o]} (over: "${o}"):\n` +
      fieldsOf(o)
        .map((id) => {
          const d = FIELDS[id];
          const supply = d.suppliedBy === "none" ? "no input supplies this yet; a recipe using it shows as needing data" : d.suppliedBy === "feed" ? "from the public market feed; no input needed" : `from ${d.suppliedBy.join(", ")}`;
          return `  - ${id} (${d.type}${d.values ? `: ${d.values.join("|")}` : ""}): ${d.about} [${supply}]`;
        })
        .join("\n"),
  ).join("\n");
  const list = <T extends string>(ids: readonly T[], about: Record<T, string>) => ids.map((id) => `  - ${id}: ${about[id]}`).join("\n");
  return [
    "Fields:",
    fields,
    "Measures (over holdings, transactions, lookthrough or markets; add top: N to keep only the N rows with the largest field value, e.g. the top five holdings; add abs: true to measure size regardless of sign, e.g. fees recorded as negative amounts):",
    list(MEASURES, MEASURE_ABOUT),
    "Market indicators: a figure over markets is a measure (max or avg) of market_level, or of a change or range field, filtered on market_symbol eq one symbol (VIX, US10Y, US2Y, US10Y2Y, GOLD, SILVER, GOLDSILVER, DXY, WTI, SPY, QQQ, SPXEY, DJI, COMP, RUT, DM, DMXUS, EM, FTSE, DAX, N225, NIFTY, SSEC, DJT, XHB, US3M, US5Y, US30Y, US10Y3M, RECPROB, FEDBS, EFFR, SOFR, MORT30, CPIYOY, UNRATE, SENTIMENT, FEARGREED, TAXREC). A level the document watches (VIX above 30, the curve below 0) is a rule of severity watch on that figure. A document's macro or market section becomes a figures section of these, with from: its section; the Macro screen then names that section under its title. An indicator the feed does not offer is a gap, not a figure.",
    "Series statistics (expr { op: \"series\", stat, of: \"nav\" or a benchmark symbol, vs?: a benchmark symbol for beta, period }), read from the time series object; nav_series comes from the broker, benchmark_series from the market feed for SPY, QQQ and the other indicators above, and from no input for any other symbol:",
    list(SERIES_STATS, SERIES_STAT_ABOUT),
    `Periods: ${PERIODS.join(", ")}.`,
    "Windows (transactions only):",
    list(WINDOWS, WINDOW_ABOUT),
    "Groupings (by):",
    list(DIMENSIONS, DIMENSION_ABOUT),
    "Filter operators: eq, ne, in, not_in, gt, gte, lt, lte, contains (text or list), is_null, not_null.",
    "Comparators for tests: lte (at most), gte (at least), lt, gt.",
    "Built-in panels:",
    PANEL_IDS.map((id) => `  - ${id}: ${PANELS[id].label}. ${PANELS[id].about}`).join("\n"),
    "Screens (the same skeleton for every methodology; a slot is drawn when its condition holds, so a cap rule draws the caps slot, a watch rule the signals, a series figure the Performance screen, a benchmark symbol in a series figure the comparison):",
    SCREEN_IDS.map((id) => `  - ${id} (${SCREENS[id].shown}${SCREENS[id].practice ? `, practice ${SCREENS[id].practice}` : ""}): ${SCREENS[id].about}${SCREENS[id].slots.length ? ` Slots: ${SCREENS[id].slots.map((sl) => `${sl} (${SLOTS[sl].shown})`).join(", ")}.` : ""}`).join("\n"),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The earnings report's skeleton
//
// One earnings report per results (Hamza, 4 Nov 2026: the deck is "HTML
// embedded in the app, and a PDF"; colourful, minimalist, concise): the pages
// lib/earnings-doc.ts builds, in this order, each with what it answers, the
// stock template section it stands for and what it reads. A page whose source
// is not on file is left out, and what the company does not report is named
// at the end; nothing is drawn as "n/a".

export const DECK_SOURCES = ["filing", "record", "thesis", "dcf", "study", "book", "prices", "methodology", "commentary", "report", "call", "brief"] as const;
export type DeckSource = (typeof DECK_SOURCES)[number];
export const DECK_SOURCE_ABOUT: Record<DeckSource, string> = {
  filing: "the company's SEC filings (XBRL company facts and the filing's instance)",
  record: "the holding's record: triggers, kill signals, the own valuation",
  thesis: "the thesis, its pillars, the pathway and the watch items on Theses",
  dcf: "the valuation kept on Theses: the stage, the chosen metric's cases and the DCF",
  study: "the latest finished study on Research",
  call: "the results call: the guidance, the beats and misses, the analysts' questions and the answers, from your own Claude's notes or read with the AI (lib/earnings-call.ts)",
  brief: "the deck's own words, written with the AI from the study, the release, the call and the thesis (lib/deck-brief.ts)",
  book: "the book: the position, its cost and its weight",
  prices: "weekly closes from the price feed",
  methodology: "the methodology's classes, rules and caps",
  commentary: "the release and the call as the person's own Claude read them",
  report: "the report kept for the results before these",
};

export type DocPageSpec<K extends string = string> = { key: K; what: string; section: number | null; reads: readonly DeckSource[] };

export const EARNINGS_DOC = [
  { key: "cover", what: "The headline, the price and the quarter at a glance", section: null, reads: ["filing", "book", "record"] },
  { key: "review", what: "What is new this quarter against the study", section: null, reads: ["brief", "study", "call", "filing"] },
  { key: "results", what: "The quarter against a year before", section: null, reads: ["filing", "commentary", "report"] },
  { key: "flow", what: "How the quarter's revenue became profit, as a flow from the segments to net income", section: null, reads: ["filing"] },
  { key: "flow_notes", what: "What lies behind the flow's lines: why the company spends what it does and where the money goes", section: null, reads: ["filing", "call", "commentary"] },
  { key: "kpis", what: "The company's own measures by quarter", section: 2, reads: ["filing"] },
  { key: "beats", what: "Beats and misses against the analysts or the guidance", section: 8, reads: ["call", "filing", "report"] },
  { key: "reaction", what: "How the stock took the results", section: 8, reads: ["prices", "commentary"] },
  { key: "highlights", what: "What the release and the call said, and what investors did not expect", section: null, reads: ["commentary"] },
  { key: "guidance", what: "What the company guided, against the thesis", section: 8, reads: ["call", "commentary", "thesis"] },
  { key: "call", what: "The call and the analysts' questions", section: 8, reads: ["call", "thesis"] },
  { key: "business", what: "How it makes money: segments and regions", section: 1, reads: ["filing", "thesis", "study"] },
  { key: "record", what: "The filed years", section: 2, reads: ["filing"] },
  { key: "profit", what: "Profitability and cash", section: 3, reads: ["filing"] },
  { key: "competition", what: "Competition", section: 5, reads: ["brief", "study"] },
  { key: "moats", what: "The moats", section: 6, reads: ["brief", "study"] },
  { key: "swot", what: "Strengths, weaknesses, opportunities, threats", section: 11, reads: ["brief", "study", "methodology", "record"] },
  { key: "capital", what: "Capital allocation", section: 9, reads: ["filing", "brief", "study"] },
  { key: "valuation", what: "Valuation: history, peers and your own", section: 7, reads: ["prices", "filing", "record", "dcf"] },
  { key: "test", what: "The methodology's class test", section: 14, reads: ["methodology", "filing"] },
  { key: "thesis", what: "The thesis, its pillars read on the new figures", section: 14, reads: ["thesis", "filing", "dcf"] },
  { key: "signals", what: "Triggers and kill signals", section: 15, reads: ["record", "filing"] },
  { key: "questions", what: "The investment questions, answered on these results", section: 13, reads: ["brief", "study", "call"] },
  { key: "position", what: "The position or the price", section: null, reads: ["book", "prices"] },
  { key: "verdict", what: "The verdict", section: null, reads: ["methodology", "record"] },
  { key: "sources", what: "Sources", section: null, reads: ["filing", "commentary", "study", "record"] },
] as const satisfies readonly DocPageSpec[];
export type EarningsDocKey = (typeof EARNINGS_DOC)[number]["key"];

/**
 * What the earnings report waits for before it is made (Hamza, 4 Nov 2026:
 * no report that says the study is not done yet or that lacks what is
 * coming). Each is met, or cannot come for this person (no model to read the
 * call or write the study); then the reviewer reads it through
 * (lib/doc-review.ts). Past DECK_WAIT_DAYS after the results it is made with
 * what is on file, a page with nothing to show left out.
 */
export const DECK_NEEDS = [
  { key: "figures", about: "the quarter's figures, from the release or the 10-Q" },
  { key: "call", about: "the call: the guidance, the remarks and the analysts' questions" },
  { key: "flow", about: "the notes on what lies behind the flow's lines" },
  { key: "study", about: "the study written on these results" },
  { key: "brief", about: "the report's own words and the review note, written from the study and the quarter" },
] as const;
export type DeckNeed = (typeof DECK_NEEDS)[number]["key"];
export const DECK_WAIT_DAYS = 5;

/**
 * Valuation by stage, after Brian Feroldi's "Valuation by Stage" chart
 * (Hamza, 16 Oct 2026): six stages a company passes through, what the
 * value comes from at each, and how useful each valuation metric is there.
 * The stage is decided from the filings alone by `stageOf` in
 * lib/valuation.ts, reading the fundamental fields the tests below name,
 * first match wins; the person may set another stage, and the calculator
 * says it is theirs. The metrics are what the person estimates on the
 * Valuation calculator; the app supplies the trailing per-share figures and
 * never a target of its own.
 */
export const STAGES = ["startup", "hyper_growth", "break_even", "operating_leverage", "capital_return", "decline"] as const;
export type StageId = (typeof STAGES)[number];
export const STAGE: Record<StageId, { n: number; label: string; source: string; about: string }> = {
  startup: { n: 1, label: "Startup", source: "Product / market fit", about: "Loss-making, revenue not yet compounding: the value is in whether the product finds its market." },
  hyper_growth: { n: 2, label: "Hyper growth", source: "Revenue growth", about: "Revenue growing 30% or more a year ahead of the cash it makes: the value is in how far the growth runs." },
  break_even: { n: 3, label: "Break even", source: "Positive cash flow", about: "Free cash flow has turned positive but is still thin: the value is in the cash the model can produce." },
  operating_leverage: { n: 4, label: "Operating leverage", source: "Margin expansion", about: "Cash-generative and the operating margin still widening, most of the cash kept to grow: the value is in how far the margin goes." },
  capital_return: { n: 5, label: "Capital return", source: "Buybacks, dividends, M&A", about: "Cash-generative with the margin settled, half or more of free cash flow given back or spent on deals: the value is in what is returned." },
  decline: { n: 6, label: "Decline", source: "Asset sales", about: "Revenue shrinking: the value is in what the assets fetch, not in any multiple of the business." },
};

/** One test of the stage: every clause must hold on the fundamentals; `may` names a clause the test skips, with a note, when its field has no reading. */
export type StageTest = { stage: StageId; when: readonly { field: FundamentalField; is: "lt" | "gte"; value: number }[]; words: string };
/**
 * The stage tests, in order; the first whose clauses all hold decides.
 * Revenue growth and the free cash flow margin must be read for any stage
 * to be decided; the operating margin change and the capital returned are
 * skipped with a note when unread.
 */
export const STAGE_TESTS: readonly StageTest[] = [
  { stage: "decline", when: [{ field: "revenue_growth_pct", is: "lt", value: 0 }], words: "Revenue is shrinking on the trailing twelve months." },
  { stage: "hyper_growth", when: [{ field: "revenue_growth_pct", is: "gte", value: 30 }, { field: "fcf_margin_pct", is: "lt", value: 10 }], words: "Revenue grows 30% or more a year and free cash flow is under a tenth of it." },
  // A startup loses money on its operations too: a profitable business whose spending on capacity runs ahead of its operating cash (negative free cash flow, a positive operating margin) is not one.
  { stage: "startup", when: [{ field: "fcf_margin_pct", is: "lt", value: 0 }, { field: "operating_margin_pct", is: "lt", value: 0 }], words: "Free cash flow and the operating margin are negative, and revenue grows under 30% a year." },
  { stage: "break_even", when: [{ field: "fcf_margin_pct", is: "lt", value: 10 }], words: "Free cash flow is under a tenth of revenue: thin, or below nothing while the business earns an operating profit." },
  { stage: "capital_return", when: [{ field: "capital_returned_pct", is: "gte", value: 50 }], words: "Free cash flow is a tenth of revenue or more and half or more of it goes back as buybacks and dividends." },
  { stage: "operating_leverage", when: [{ field: "operating_margin_change_pts", is: "gte", value: 0 }], words: "Free cash flow is a tenth of revenue or more, most of it kept, and the operating margin held or widened over the year." },
  { stage: "capital_return", when: [], words: "Free cash flow is a tenth of revenue or more, most of it kept, but the operating margin narrowed over the year." },
];
/** The fields a stage needs read before it is decided; the rest are skipped with a note. */
export const STAGE_READS: readonly FundamentalField[] = ["revenue_growth_pct", "fcf_margin_pct"];

export const VALUATION_METRICS = ["tam", "ps", "pgp", "forward_pe", "forward_pfcf", "trailing_pe", "trailing_pfcf", "dcf", "reverse_dcf"] as const;
export type ValuationMetric = (typeof VALUATION_METRICS)[number];
export const METRIC_USES = ["useful", "somewhat", "not"] as const;
export type MetricUse = (typeof METRIC_USES)[number];
export const METRIC_USE_LABEL: Record<MetricUse, string> = { useful: "Useful", somewhat: "Somewhat useful", not: "Not useful" };
/** Each metric: its name, what the person estimates, and what the app supplies from the filings. */
export const VALUATION_METRIC: Record<ValuationMetric, { label: string; short: string; estimate: string; supplies: string }> = {
  tam: { label: "Total addressable market", short: "TAM", estimate: "The market in money, the share the company takes in each case, the margin it earns on it and the multiple that profit deserves.", supplies: "The diluted share count." },
  ps: { label: "Price to sales", short: "P/S", estimate: "The multiple of trailing sales per share in each case.", supplies: "Revenue per share, trailing twelve months." },
  pgp: { label: "Price to gross profit", short: "P/GP", estimate: "The multiple of trailing gross profit per share in each case.", supplies: "Gross profit per share, trailing twelve months." },
  forward_pe: { label: "Price to forward earnings", short: "Fwd P/E", estimate: "Next year's earnings per share, and the multiple in each case.", supplies: "Trailing EPS and its growth, to start from." },
  forward_pfcf: { label: "Price to forward free cash flow", short: "Fwd P/FCF", estimate: "Next year's free cash flow per share, and the multiple in each case.", supplies: "Trailing free cash flow per share and its growth, to start from." },
  trailing_pe: { label: "Price to trailing earnings", short: "P/E", estimate: "The multiple of trailing earnings per share in each case.", supplies: "Diluted EPS, trailing twelve months." },
  trailing_pfcf: { label: "Price to trailing free cash flow", short: "P/FCF", estimate: "The multiple of trailing free cash flow per share in each case.", supplies: "Free cash flow per share, trailing twelve months." },
  dcf: { label: "Discounted cash flow", short: "DCF", estimate: "The revenue path, the end margin, the discount rate and terminal growth in each case.", supplies: "Trailing revenue, margin, stock compensation, the balance sheet and the shares." },
  reverse_dcf: { label: "Reverse DCF", short: "Reverse DCF", estimate: "Nothing: it reads the growth and the margin the price implies on the base path.", supplies: "The DCF's inputs and the price." },
};
/** How useful each metric is at each stage, in STAGES order (Feroldi's matrix). */
export const METRIC_USE: Record<ValuationMetric, readonly [MetricUse, MetricUse, MetricUse, MetricUse, MetricUse, MetricUse]> = {
  tam: ["useful", "useful", "somewhat", "somewhat", "not", "not"],
  ps: ["useful", "useful", "useful", "somewhat", "somewhat", "not"],
  pgp: ["somewhat", "useful", "useful", "somewhat", "somewhat", "not"],
  forward_pe: ["not", "not", "somewhat", "useful", "useful", "not"],
  forward_pfcf: ["not", "not", "somewhat", "useful", "useful", "not"],
  trailing_pe: ["not", "not", "not", "somewhat", "useful", "not"],
  trailing_pfcf: ["not", "not", "not", "somewhat", "useful", "not"],
  dcf: ["not", "not", "somewhat", "useful", "useful", "not"],
  reverse_dcf: ["not", "not", "somewhat", "useful", "useful", "not"],
};
export const metricUse = (metric: ValuationMetric, stage: StageId): MetricUse => METRIC_USE[metric][STAGES.indexOf(stage)];
