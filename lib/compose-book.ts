/**
 * The book every screen and every report reads: the broker's book with the
 * statements in use already laid on (lib/statements.ts), then the person's
 * records, the filings' fundamentals and sectors, their research studies,
 * the market feed, which lends its series to the benchmarks the
 * methodology names (SPY, QQQ), and, where the caller read them, the daily
 * closes of the listed holdings (contribution and correlation). One function, so a review can never be built
 * on a thinner book than the screens show. Pure; the caller reads the files
 * and the feed.
 */
import type { FilingsFile } from "@/lib/filings";
import { applyFilings } from "@/lib/filings";
import type { Book } from "@/lib/holdings";
import { withCloses, withMarkets, type Closes, type Markets } from "@/lib/markets";
import type { Methodology } from "@/lib/methodology";
import { applyRecords, type Records } from "@/lib/preferences";
import { applyResearch, type ResearchFile } from "@/lib/research";
import { benchmarksOf, HEADLINE_BENCHMARKS } from "@/lib/screens";

export type BookParts = { records: Records | null; filings: FilingsFile | null; research: ResearchFile | null; markets: Markets; methodology: Methodology | null; closes?: Closes | null };

export function composeBook(book: Book | null, p: BookParts): Book | null {
  if (!book) return null;
  const composed = withMarkets(applyResearch(applyFilings(applyRecords(book, p.records), p.filings), p.research), p.markets, [...benchmarksOf(p.methodology), ...HEADLINE_BENCHMARKS]);
  return p.closes ? withCloses(composed, p.closes) : composed;
}

/** The tickers whose daily closes the book can use: listed shares and funds, once each. */
export function listedTickers(book: Book | null): string[] {
  if (!book) return [];
  return [...new Set(book.holdings.filter((h) => h.assetClass === "equity" || h.assetClass === "etf").map((h) => h.symbol))].sort();
}
