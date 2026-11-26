/**
 * Fundamentals read from SEC filings for every listed holding in one pass,
 * kept in the vault as the `filings` file: for each symbol, the company the
 * SEC matched, the date it was read, the latest framed quarter and the
 * ontology's fundamentals fields derived from its XBRL facts (lib/edgar-facts.ts),
 * its sector (the official GICS sector and sub-industry when the S&P 500 or
 * Nasdaq-100 list carries it, else the one its SEC industry code maps to,
 * lib/sectors.ts), its revenue by geography from its latest annual filing
 * (lib/edgar-segments.ts), or a sentence when the SEC lists no such company. Nothing is estimated and
 * no model is involved. A Research study of the same company lays its own
 * figures over these when it is newer. Pure; lib/edgar.ts fetches.
 */
import { z } from "zod";

import { seriesTableSchema } from "@/lib/earnings";
import { revenueGeographySchema, type Book } from "@/lib/holdings";
import { segmentHistorySchema } from "@/lib/edgar-segments";
import { incomeFlowSchema } from "@/lib/income-flow";
import { consensusSchema } from "@/lib/forward";
import { insidersSchema } from "@/lib/insiders";
import { shortInterestSchema } from "@/lib/short-interest";

export const filingEntrySchema = z.object({
  /** The holding's symbol as the book carries it. */
  symbol: z.string().max(40),
  /** The ticker the SEC lists the company under; null when it lists none. */
  ticker: z.string().max(12).nullable(),
  cik: z.number().nullable(),
  name: z.string().max(200).nullable(),
  /** When the filings were read (ISO date-time). */
  readAt: z.string(),
  latestQuarter: z.string().nullable(),
  /** The period the trailing figures cover, in words ("TTM to 2026Q2", "FY2025"); absent in files written before it was kept. */
  period: z.string().max(40).nullable().optional(),
  /** The SEC industry code (SIC), its description, and the sector it maps to (lib/sectors.ts); absent before the first read that kept them. */
  sic: z.number().nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  sector: z.string().max(40).nullable().optional(),
  /** The GICS sub-industry when an index list carries the company; absent otherwise. */
  subIndustry: z.string().max(80).nullable().optional(),
  /** The country of the company's business address in its filings (lib/edgar-facts.ts); absent before the first read that kept it. */
  country: z.string().max(60).nullable().optional(),
  /** Where the sector came from, in words ("GICS, S&P 500 list", "SEC industry code"); absent in files written before it was kept. */
  sectorBasis: z.string().max(60).nullable().optional(),
  /** Revenue by geography from the latest 10-K, 20-F or 40-F (else 10-Q), with the form, period and accession (lib/edgar-segments.ts geographyRead); null when the filing gives none, absent before the first read that kept it. */
  revenueGeography: revenueGeographySchema.nullable().optional(),
  /** The trailing twelve months' diluted EPS by the day each quarter ended, oldest first (lib/edgar-facts.ts ttmEpsHistory), for the portfolio's P/E over the year; absent before the first read that kept it. */
  epsTtm: z.array(z.object({ end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), eps: z.number() })).max(16).optional(),
  /** Trailing sales, gross profit, EPS and free cash flow per share by quarter end, oldest first (lib/edgar-facts.ts ttmPerShareHistory), for the five-year valuation history; absent before the first read that kept it. */
  perShareTtm: z.array(z.object({ end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), revenue: z.number().nullable(), grossProfit: z.number().nullable(), eps: z.number().nullable(), fcf: z.number().nullable() })).max(24).optional(),
  /** The currency the per-share history is filed in (USD, or DKK for a Danish filer), for carrying it to the listing's price. */
  perShareCurrency: z.string().max(3).nullable().optional(),
  /** The filings' last five fiscal years and the trailing twelve months (lib/edgar-facts.ts studyTable), and the last eight quarters (lib/earnings.ts quartersOf), for the company page's Financials before any report after results is kept (Hamza, 23 Oct 2026); absent before the first read that kept them. */
  years: seriesTableSchema.nullable().optional(),
  quarters: seriesTableSchema.nullable().optional(),
  /** Revenue by segment and by product over the last quarters and years, from the latest annual report and 10-Qs (lib/edgar-segments.ts mergeSegmentSeries), for the company page's stacked revenue chart (Hamza, 4 Nov 2026); absent before the first read that kept it. */
  segmentHistory: segmentHistorySchema.nullable().optional(),
  /** How the latest quarter's and the trailing twelve months' revenue became profit, from the facts (lib/income-flow.ts flowFromFacts; Hamza, 5 Nov 2026), for the company page and the Holdings look-through; absent before the first read that kept them. */
  flows: z.object({ quarter: incomeFlowSchema.nullable(), ttm: incomeFlowSchema.nullable() }).nullable().optional(),
  /** The insiders' open-market purchases and sales from their Form 4s (lib/insiders.ts); absent before the first read that kept them. */
  insiders: insidersSchema.optional(),
  /** Short interest at FINRA's latest published settlement date (lib/short-interest.ts); null when FINRA's file does not list the symbol, absent before the first read. */
  shortInterest: shortInterestSchema.nullable().optional(),
  /** The analysts' consensus EPS from Nasdaq's published estimates (lib/forward.ts), read with the filings; null when Nasdaq lists none, absent before the first read. */
  consensus: consensusSchema.nullable().optional(),
  /** The ontology's fundamentals fields; null with a reason in `notes`. */
  values: z.record(z.string(), z.number().nullable()),
  notes: z.array(z.string().max(300)).max(30),
  /** Why nothing was read, when nothing was. */
  error: z.string().max(400).nullable(),
});
export type FilingEntry = z.infer<typeof filingEntrySchema>;

export const filingsFileSchema = z.object({ version: z.literal(1), bySymbol: z.record(z.string(), filingEntrySchema), updated: z.string() });
export type FilingsFile = z.infer<typeof filingsFileSchema>;
export const EMPTY_FILINGS: FilingsFile = { version: 1, bySymbol: {}, updated: "" };

/** How old a filings read may be before opening the app reads it again: a day, less the margin for the morning run's own clock. */
export const FILINGS_STALE_HOURS = 20;

/**
 * Whether the filings are due a read when the app is opened: never read, a
 * listed holding with no entry (bought since the last read), or a read older
 * than FILINGS_STALE_HOURS. The morning refresh reads them too; this is for
 * a day it did not run.
 */
export function filingsStale(filings: FilingsFile | null, book: Book, now: Date): boolean {
  const symbols = readableSymbols(book);
  if (!symbols.length) return false;
  if (!filings?.updated) return true;
  if (symbols.some((s) => !filings.bySymbol[s])) return true;
  // A read kept before the filings' own years were kept is read again once, so the company page's Financials fill now.
  if (symbols.some((s) => !filings.bySymbol[s].error && filings.bySymbol[s].years === undefined)) return true;
  const age = now.getTime() - Date.parse(filings.updated);
  return !(age >= 0 && age < FILINGS_STALE_HOURS * 3_600_000);
}

/** Holdings whose filings can be read: listed equities, by symbol, once each. */
export function readableSymbols(book: Book): string[] {
  const out: string[] = [];
  for (const h of book.holdings) {
    if (h.assetClass !== "equity") continue;
    const s = h.symbol.toUpperCase();
    // A statement may name a share by its ISIN or its name alone; the SEC lists neither, so neither is asked for.
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s) || /\s/.test(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** A filings entry's values as the ontology reads them: an entry written before the engine was read carries company revenue growth as the engine, which is what the rule used until then. */
export function entryValues(e: FilingEntry): Record<string, number | null> {
  return "engine_growth_pct" in e.values ? e.values : { ...e.values, engine_growth_pct: e.values.revenue_growth_pct ?? null, engine_share_pct: e.values.revenue_growth_pct === null || e.values.revenue_growth_pct === undefined ? null : 100 };
}

/** The book with each holding's filings figures, sector, country and revenue by geography laid on; a holding's own figures and a sector, country or split the source supplied win where both exist. */
export function applyFilings(book: Book, filings: FilingsFile | null): Book {
  if (!filings || !Object.keys(filings.bySymbol).length) return book;
  return {
    ...book,
    holdings: book.holdings.map((h) => {
      const e = filings.bySymbol[h.symbol.toUpperCase()];
      if (!e || e.error) return h;
      return { ...h, fundamentals: { ...entryValues(e), ...(h.fundamentals ?? {}) }, sector: h.sector ?? e.sector ?? null, country: h.country ?? e.country ?? null, revenueGeography: h.revenueGeography ?? e.revenueGeography ?? null };
    }),
  };
}

/** One sentence on the file for the Setup screen. */
export function filingsSummary(filings: FilingsFile | null): string | null {
  if (!filings || !Object.keys(filings.bySymbol).length) return null;
  const entries = Object.values(filings.bySymbol);
  const read = entries.filter((e) => !e.error);
  const failed = entries.filter((e) => e.error);
  const when = filings.updated.slice(0, 10);
  const head = `Filings read for ${read.length} of ${entries.length} compan${entries.length === 1 ? "y" : "ies"}, holdings and watchlist, on ${when}.`;
  return failed.length ? `${head} Not read: ${failed.map((e) => `${e.symbol} (${e.error})`).join("; ")}` : head;
}
