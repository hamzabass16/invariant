import { FIELDS } from "@/lib/ontology";

/**
 * How each figure the app derives is calculated, in words a person reads
 * beside it (Hamza, 27 Oct 2026: "each metric like this should have a small
 * information button users can hover their mouse over to see how it was
 * calculated exactly"). A field of the ontology reads its own description,
 * the basis the drafter reads too, with the field names in it put as their
 * labels and the code's references left out; a figure the screens compute
 * beside the fields (the peers' median, the portfolio's P/E) has its own
 * words here. Pure: nothing fetched or kept.
 */

/** Plainer words where the ontology's description is written for the drafter. */
const OWN: Record<string, string> = {
  implied_growth_pct:
    "The revenue growth a year over the next nine years at which a discounted cash flow model is worth today's price (a reverse DCF). The model starts from the filings' trailing revenue and free cash flow, less stock-based compensation, keeps today's margin, and fades growth year by year from the base path toward 4%; it discounts at 9% a year, mid-year, with 3% growth after year nine, adds cash and investments, takes off debt and divides by diluted shares. The app scales the growth path until the value per share meets the price and reports the nine years' compound growth. The app's arithmetic on the filings, not a forecast; none when free cash flow is not positive, and below zero when the price asks for revenue to shrink.",
  net_debt_to_ebitda:
    "Debt (borrowings and finance leases, current and long-term) less cash, at the latest balance sheet date, over trailing twelve months EBITDA: operating income plus depreciation and amortisation. None when EBITDA is not positive; below zero when cash exceeds debt.",
  fcf_margin_pct:
    "Trailing twelve months free cash flow over revenue. Free cash flow is cash from operations less purchases of property, equipment and intangibles.",
  payout_ratio_pct: "Trailing twelve months dividends paid over net income. None when net income is not positive.",
  dividend_growth_5y_pct: "Dividend per share growth a year, compounded, from the fiscal year five years back to the last one, from the filings.",
  dividend_years_raised: "The run of fiscal years, counting back from the last, in which the filed dividend per share was higher than the year before.",
  forward_pe:
    "Price over the next twelve months' EPS as the filings carry it forward: trailing diluted EPS grown at the company's revenue growth, held between -50% and +100%, so a one-off gain in EPS is not carried forward twice. The app's arithmetic on what was filed, not a forecast; none when trailing EPS is not positive.",
};

/** Figures the screens compute that are not fields of the ontology. */
export const EXTRA_INFO = {
  price_to_gross_profit: "Price over trailing twelve months gross profit per diluted share, in the filings' currency.",
  peers_median: "The middle value of the multiple among the company's peers: the other companies of the S&P 500 and the Nasdaq-100 in the same GICS sub-industry, else the same SEC industry code at four, three, then two digits until three are found. Each peer's figure is from its own filings at its last close.",
  sector_whole: "The sector as one company: the market value of every company in the sector with the figure, over the sum of the figure under each (market value over the multiple). It weighs the large companies as an index does, the harmonic mean by market value.",
  portfolio_pe: "The book's P/E as one company: the listed holdings' value over the earnings that value buys, which is the harmonic mean of their P/E weighted by value. A holding with no P/E (a loss, a fund, no filings) is left out and named. The year's range reads each holding's daily closes over its trailing EPS as known then (a quarter counts 45 days after it ends), at today's shares and rate.",
  history: "Each week's close over the trailing twelve months' per-share figure known that week (a quarter counts 45 days after it ends, from the filings), over five years. A week above 100x is left out as not meaningful. The median is the middle week; the percentile is where today's sits among them.",
  consensus_ntm: "The analysts' consensus EPS from Nasdaq's published estimates for the next twelve months: the fiscal year in progress for the months it has left and the next for the rest. Theirs, never the app's.",
} as const;
export type ExtraInfo = keyof typeof EXTRA_INFO;

const CODE_REFERENCES = /\s*\((?:[^()]*\blib\/[^()]*|see [a-z_]+(?:, [a-z_]+)*)\)|[;,]?\s*see [a-z]+(?:_[a-z0-9]+)+(?: for [^.;]+)?/g;

/** A field's description with the field names as their labels and the code's references left out. */
function plain(about: string): string {
  return about
    .replace(CODE_REFERENCES, "")
    .replace(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g, (id) => (id in FIELDS ? FIELDS[id as keyof typeof FIELDS].label.toLowerCase() : id))
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\.\s*\./g, ".")
    .trim();
}

/** How a field is calculated, or null when the ontology has no such field. */
export function metricInfo(field: string): string | null {
  if (field in OWN) return OWN[field];
  const def = (FIELDS as Record<string, { about: string } | undefined>)[field];
  return def ? plain(def.about) : null;
}
