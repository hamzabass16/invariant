/**
 * Ready-made methodologies a person can adopt instead of writing their own:
 * each a methodology file (the graph itself, so no key or reading is needed),
 * a plain summary of what it is and whom it suits, and, where its author
 * works from one, a stock research template. Adopting one makes a draft the
 * person confirms, like any other; it then takes effect for them alone.
 *
 * Nothing here is anyone's portfolio: a library entry carries rules, classes
 * and figures, never a holding, a figure of a book or a Decision Log. The
 * check `npm run check:library` holds that. Pure.
 */
import dividendGrowthMethodology from "@/data/library/dividend-growth.methodology.json";
import grahamMethodology from "@/data/library/graham.methodology.json";
import greenblattMethodology from "@/data/library/greenblatt.methodology.json";
import hcmpMethodology from "@/data/library/hcmp.methodology.json";
import lynchMethodology from "@/data/library/lynch.methodology.json";
import { methodologySchema, type Methodology } from "@/lib/methodology";
import { templateSchema, type Template, type TemplateSection } from "@/lib/research";

export const LIBRARY_IDS = ["hcmp", "graham", "greenblatt", "lynch", "dividend-growth"] as const;
export type LibraryId = (typeof LIBRARY_IDS)[number];

export type LibraryEntry = {
  id: LibraryId;
  name: string;
  /** Who wrote it, as credited on the card. */
  credit: string;
  /** One line under the name. */
  oneLine: string;
  /** Plain paragraphs: what it is, whom it suits, what it asks of the person, what the app does with it. */
  summary: readonly string[];
  methodology: Methodology;
  /** The author's own stock research template, when they work from one. */
  template: Template | null;
};

const sec = (id: string, title: string, guidance: string, tags: TemplateSection["tags"] = []): TemplateSection => ({ id, title, guidance, tags });

/** HCMP's Standardized Stock Template, aligned to Methodology v3.1: sixteen sections, in its order. */
const HCMP_TEMPLATE: Template = templateSchema.parse({
  version: 1,
  family: "fundamentals",
  title: "HCMP Standardized Stock Template",
  origin: "library",
  updated: "2026-10-09T00:00:00.000Z",
  sections: [
    sec("core-business", "The core business", "Business summary; who the customer is; the total addressable market and the business segments; what makes the company different (its unique value proposition); the investment thesis in a few sentences. (Section 1.1)"),
    sec("growth", "Growth", "Revenue growth quarter on quarter, year on year, and as three-year and five-year compound rates; organic revenue growth; diluted EPS growth year on year, three-year and five-year; free cash flow per share growth year on year and five-year; a company-specific KPI such as net revenue retention or GMV; ROCE. Every figure from a filing, with its source. Then: what to take from this. (Section 1.2)"),
    sec("profitability", "Profitability", "Gross, operating, net and free cash flow margins, trailing twelve months against the five-year average; operating leverage (EBIT growth over revenue growth); revenue growth stability (the coefficient of variation of growth rates). What to take from this: room for growth, and so on. (Section 1.2)"),
    sec("segments", "Segments", "Each segment's revenue in the last quarter, growth year on year, share of revenue, gross margin and industry metric. Mark any reported segment or disclosed revenue line that is at least 15% of revenue and grew above 20% year on year in the latest quarter: that is a disruption engine, unless it comes from pricing or from service revenue on an existing installed base. (D.1(a))"),
    sec("competition", "Competition", "For each competitor: market cap, gross margin, revenue growth, industry metric, market share and unique value proposition. User reviews: what users think of and rate the product, what employees rate the work environment and management, how users compare it with competitors."),
    sec("moats", "Moats, four pillars", "Network effects (user growth, retention, ARPU trend); pricing power (gross margin trend, revenue growth against volume growth, price increases against CPI); switching costs (customer retention, CLV to CAC, recurring revenue share); intangible and physical assets (brand equity, patents and IP, irreplaceable physical assets: ROA, replacement cost against market value, asset utilisation). What to take from this. (Section 1.3)"),
    sec("valuation", "Valuation", "Trailing and forward P/E, EV/EBITDA, price to sales, PEG, P/CF and their forward versions, FCF yield, market cap over annualised quarterly revenue, each against its sector average; a chart of the multiple that best fits the company over its history. Judge the multiple by the company's stage, justified with the figures above; for a Compounding Machine lead with FCF yield, not P/E. What to take from this: why the valuation is where it is, and past jumps and falls. (Section 1.5)", ["valuation"]),
    sec("earnings", "Earnings", "Key highlights of the latest call: plans, guidance, analyst questions. Results against guidance for the latest and the next quarter (revenue, operating income). The record over the last eight quarters (beat, in line, miss) and what explains any large miss or beat."),
    sec("capital-allocation", "Capital allocation", "ROIC, shareholder yield, credit rating, net debt, debt to equity, net debt to EBITDA, stock compensation as a share of operating cash flow, buybacks and buyback yield, share count trend, buyback authorisation left, dividend yield, payout ratio, dividend growth, FCF conversion (free cash flow over net income), interest coverage (EBIT over interest), current ratio, cash conversion. What to take from this. (Section 1.4)"),
    sec("dcf", "DCF model", "Your own discounted cash flow with explicit growth, margin and discount-rate assumptions and a bear, base and bull case, kept with the record. A third-party price target does not count. Explain the assumptions. (Section 1.5, v3.1 Probation Hold (c))"),
    sec("swot", "SWOT analysis", "Threats and weaknesses: insider selling, geography, management change, culture, layoffs, macro, valuation, margins. Opportunities and strengths. Questions to think about: can they tackle their risks and take their opportunities, and how durable are the strengths? (Section 2 summary)"),
    sec("key-question", "Key research question and statistical validation", "The core question, the qualitative mechanics, and the statistical test: hypotheses, test statistic, p-value at alpha 0.05, R or R squared, sample size and window, with a plain conclusion. Kept as good practice; only Macro Plays require a regression."),
    sec("investment-questions", "Investment questions, all five", "Why now? What is it that others are not realising about this stock, and why? What has the market priced in, and what has it not? Why exactly would you be on the winning side of this trade? For a large cap, what unseen future information will push the price higher; for a small cap, what do you know that others do not? (Section 2 summary)"),
    sec("classification", "Categorisation: the Classification Test", "Step 1, the seven Compounding Machine thresholds, each pass, fail or not measurable: ROIC at or above 20%; gross margin at or above 40%; operating leverage (operating margin up year on year); FCF conversion at or above 0.9x; interest coverage above 15x (net cash passes); organic growth positive; FCF per share growth positive. Pass share is passes over measurable thresholds. Step 2, the disruption engine: company revenue growth above 20%, or a segment growing above 20% that is at least 15% of revenue. Step 3, short-term external factor adjustments, only for currency and one-off items quantified in the filing. Step 4, the result: 71% or more and no engine is a Compounding Machine (10% cap); 57% or more with an engine is Transitional (20% cap, with a written pathway, two triggers and a vote); below 57% with an engine is Disruptive Growth (5% cap); below 71% and no engine is no archetype (a 3.4 review within 30 days, or a Probation Hold). Step 5, Transitional only: the compounding pathway within three to seven years and at least two measurable reclassification triggers. (Section 2 summary, D.1)", ["classes"]),
    sec("kill-signals", "Kill signals and sell discipline", "The measurable signals that would trigger each 3.4 review: Quality Erosion, Thesis Failure, Unpredictability, Opportunity Cost, and the Dividend Sin for income holdings. For a Transitional holding, also the archetype-move triggers, and how far each is from tripping. (Section 3.4)", ["exit"]),
    sec("conclusion", "Conclusion", "Good, okay or bad on business operations (competition, industry, growth thesis), valuation, and the figures (revenue growth, segments, cash flow growth, debt, profitability and margins, ROIC, dividend record, earnings record). Short-term and long-term outlook. Position sizing: the archetype cap, the current weight and the room under the cap; any buy needs an IC majority vote with the record attached. Final recommendation. Not investment advice. (Sections 3.1 and D.5)"),
  ],
});

export const LIBRARY: readonly LibraryEntry[] = [
  {
    id: "hcmp",
    name: "HCMP Investment Methodology v3.4",
    credit: "Hamza Bassatne, HCMP",
    oneLine: "A concentrated book of quality businesses, each sorted by a Classification Test into an archetype with a cap, every decision a logged vote.",
    summary: [
      "What it is. A fundamentals methodology for a concentrated equity portfolio. Each holding is tested on seven thresholds from its SEC filings (ROIC, gross margin, operating leverage, FCF conversion, interest cover, organic growth and FCF per share growth) and sorted by its pass share and whether it has a disruption engine into a Compounding Machine (10% cap), a Transitional holding (20% cap) or a Disruptive Growth stock (5% cap). A holding that fails and sits one threshold short can be held on probation for up to four quarterly filings.",
      "Whom it suits. Someone who owns ten to thirty businesses they understand, reads filings, and wants a rule for how much of each to own and when to sell, rather than a view on the market. It is not a trading, options or macro methodology.",
      "What it asks of you. A written thesis and your own valuation (a DCF with a bear, base and bull case) for every holding; two measurable triggers for a Transitional holding; a sale only for one of four reasons (Quality Erosion, Thesis Failure, Unpredictability, Opportunity Cost); and every buy, sale or reclassification logged as a vote in the Decision Log.",
      "What the app does with it. It reads the filings for each holding, classifies them on the measurement bases the methodology writes down (ROIC after a 21% tax on equity plus debt less cash, free cash flow less intangibles at 0.9x, net interest cover for a net-cash company, margins against the prior year), holds every weight against its archetype's cap, lists what is owed on the to-do list, and gives the Research screen HCMP's sixteen-section stock template. Where a threshold cannot be measured from the filing, the app says so and leaves it out of the count; the disruption engine is read from the filing's own segment note, company revenue growth standing in where the filing has no lines.",
    ],
    methodology: methodologySchema.parse({ ...hcmpMethodology, adopted: null, origin: "library" }),
    template: HCMP_TEMPLATE,
  },
  // Public frameworks (Hamza, 9 Nov 2026, the twenty further ways): well-known published approaches written in the ontology's recipes, credited "after" their authors since they are readings of a book, never the author's own file. What the ontology cannot say yet is in each one's gaps.
  {
    id: "graham",
    name: "Defensive investor, after Benjamin Graham",
    credit: "After Benjamin Graham, The Intelligent Investor",
    oneLine: "Large, sound companies with a dividend and growing earnings, bought at a moderate price, ten to thirty of them.",
    summary: [
      "What it is. A reading of the defensive investor's rules in The Intelligent Investor: diversify across ten to thirty stocks, buy only companies with modest debt, a dividend and growing earnings, and never pay more than about fifteen times earnings. A share of the book stays out of stocks.",
      "Whom it suits. Someone who wants safety and little work, and is content with the market's return less its worst falls.",
      "What the app does with it. It tests each holding's P/E, dividend, EPS growth and debt from the filings, holds each weight under 10% and counts the holdings. What Graham asks that the filings read cannot measure yet (price to book, the current ratio, a twenty-year dividend record) is listed as a gap, never passed.",
    ],
    methodology: methodologySchema.parse({ ...grahamMethodology, adopted: null, origin: "library" }),
    template: null,
  },
  {
    id: "greenblatt",
    name: "Magic formula, after Joel Greenblatt",
    credit: "After Joel Greenblatt, The Little Book That Beats the Market",
    oneLine: "Good businesses at bargain prices: a high return on capital at a low price on earnings, twenty to thirty held about a year.",
    summary: [
      "What it is. A reading of the magic formula: rank companies by return on capital and by earnings yield, buy the best combined, hold twenty to thirty in about equal shares, and replace each after about a year. Utilities and financials are left out.",
      "Whom it suits. Someone who wants a mechanical rule and the patience to hold it through years when it lags.",
      "What the app does with it. ROIC stands in for return on capital and the P/E for earnings yield; the Screener lists the companies the class takes. The ranking itself and Greenblatt's own measures are gaps.",
    ],
    methodology: methodologySchema.parse({ ...greenblattMethodology, adopted: null, origin: "library" }),
    template: null,
  },
  {
    id: "lynch",
    name: "Growth at a reasonable price, after Peter Lynch",
    credit: "After Peter Lynch, One Up on Wall Street",
    oneLine: "Sort each company into its kind, pay a price in line with its growth, keep debt low, and know the story.",
    summary: [
      "What it is. A reading of One Up on Wall Street: know what you own and why, sort each company into a kind (here the fast grower and the stalwart), pay no more than its growth justifies, prefer little debt, and own no more stocks than you can follow.",
      "Whom it suits. Someone who reads about the companies they own and wants each holding sized by what kind of company it is.",
      "What the app does with it. It reads EPS and revenue growth, the P/E and the debt from the filings, places each holding in its kind and holds each weight to its cap. The PEG and the other four kinds are gaps; the two-minute story is yours to write on Theses.",
    ],
    methodology: methodologySchema.parse({ ...lynchMethodology, adopted: null, origin: "library" }),
    template: null,
  },
  {
    id: "dividend-growth",
    name: "Dividend growth",
    credit: "A framework as income investors practise it",
    oneLine: "Companies that have raised their dividend for a decade, pay it from cash with room to spare, and keep raising it.",
    summary: [
      "What it is. A dividend growth framework: hold twenty or more companies with ten years of raises, a payout under 60% and dividend growth of 5% a year or more, none above 8% of the book and no sector above a quarter.",
      "Whom it suits. Someone living, or planning to live, on the income, who judges the book by what it pays rather than its price.",
      "What the app does with it. It reads the years raised, the payout, the growth and the yield from the filings, holds the weights and sectors to their caps, and opens the Dividends screen first. A cut or freeze as an alert is a gap.",
    ],
    methodology: methodologySchema.parse({ ...dividendGrowthMethodology, adopted: null, origin: "library" }),
    template: null,
  },
];

export function libraryEntry(id: string): LibraryEntry | null {
  return LIBRARY.find((e) => e.id === id) ?? null;
}

export const isLibraryId = (id: string): id is LibraryId => (LIBRARY_IDS as readonly string[]).includes(id);

/** The entry's methodology as a draft for one person: not yet adopted, credited to its source, nothing of anyone else's. */
export function adoptMethodology(entry: LibraryEntry): Methodology {
  return methodologySchema.parse({ ...entry.methodology, adopted: null, origin: "library", source: { title: entry.name, fileId: null }, lineage: { parent: entry.name, credit: entry.credit, source: "library" } });
}

/** The entry's template as the person's own, dated now. */
export function adoptTemplate(entry: LibraryEntry, now: string): Template | null {
  return entry.template ? templateSchema.parse({ ...entry.template, origin: "library", updated: now }) : null;
}

/** Counts for the card. */
export function libraryCounts(entry: LibraryEntry): { classes: number; rules: number; tested: number; figures: number } {
  const m = entry.methodology;
  return { classes: m.classes.length, rules: m.rules.length, tested: m.rules.filter((r) => r.test).length, figures: m.figures.length };
}
