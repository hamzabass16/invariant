import { parseFlexBook } from "@/lib/adapters/ibkr-flex";
import { elements } from "@/lib/flex";
import { bookSchema, unconvertibleNote, unlistedSentence, type Book, type Holding } from "@/lib/holdings";
import { SyncError } from "@/lib/sync-error";

/**
 * A book from a file the person uploads on Setup, for when no connection
 * feeds it yet: an IBKR Flex statement (XML, the same shape the Flex adapter
 * reads from the web service) or an Invariant book file (JSON in the
 * holdings model, as the parity harness and the samples use). Pure, so the
 * check and the screen share one reading.
 *
 * A statement that cannot be read throws a sentence; it never becomes an
 * empty portfolio. Exchange rates come from the statement's own "FX Rate to
 * Base" columns (Open Positions first, then the latest trade in each
 * currency); a position in a currency without one is refused rather than
 * guessed, and a trade without one is imported but left out of the figures,
 * with a note saying so.
 */

export type Imported = { book: Book; kind: "flex" | "book"; notes: string[] };

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/** What the file is, from its first non-blank character; the name alone is not trusted. */
export function sniff(text: string): "flex" | "book" | null {
  const head = text.replace(/^﻿/, "").trimStart().slice(0, 200);
  if (head.startsWith("<")) return /FlexQueryResponse|FlexStatement/.test(text.slice(0, 4000)) ? "flex" : null;
  if (head.startsWith("{")) return "book";
  return null;
}

export function bookFromFlex(xml: string, accountLabel = "IBKR"): Imported {
  let flex: ReturnType<typeof parseFlexBook>;
  try {
    flex = parseFlexBook(xml, accountLabel);
  } catch (e) {
    throw new SyncError(e instanceof Error ? e.message : "The statement could not be read.", "flex parse failed");
  }
  if (!flex.holdings.length) throw new SyncError("The statement has no open positions, so there is nothing to show. Check that it is for the right account and period.", "flex no positions");

  // Rates from the statement itself; the base currency is 1 by definition.
  const rates: Record<string, number> = { [flex.currency]: 1 };
  for (const p of elements(xml, "OpenPosition")) {
    const ccy = (p.currency ?? "").toUpperCase();
    const rate = Number(p.fxRateToBase);
    if (ccy && Number.isFinite(rate) && rate > 0 && !(ccy in rates)) rates[ccy] = rate;
  }
  // A currency no open position carries (a market left since) is priced by its latest trade's rate.
  const trades = elements(xml, "Trade").filter((t) => (t.levelOfDetail ?? "EXECUTION") === "EXECUTION");
  for (const t of trades.slice().sort((a, b) => (b.tradeDate ?? "").localeCompare(a.tradeDate ?? ""))) {
    const ccy = (t.currency ?? "").toUpperCase();
    const rate = Number(t.fxRateToBase);
    if (ccy && Number.isFinite(rate) && rate > 0 && !(ccy in rates)) rates[ccy] = rate;
  }
  const missing = [...new Set(flex.holdings.map((h) => h.currency).filter((c) => !(c in rates)))];
  if (missing.length) {
    throw new SyncError(`The statement holds positions in ${missing.join(", ")} but no exchange rate to ${flex.currency}. Add the "FX Rate to Base" column to the Flex query's Open Positions section and export it again.`, "flex missing fx");
  }

  const notes: string[] = [];
  if (!flex.transactions.length) notes.push("No trades in this statement; the Trades section of the Flex query adds them.");
  if (!flex.nav.length) notes.push("No account value by day; the \"Net Asset Value (NAV) in Base\" section of the Flex query adds returns and drawdown.");
  const cash = cashHoldings(flex, rates);
  if (!flex.cash) notes.push("The statement carries no cash, so none is shown. Tick the Cash Report section in the Flex query and the cash comes in with the next statement.");
  else if (flex.cash.from === "Equity Summary") notes.push("Cash is read from the Equity Summary in base; the Cash Report section of the Flex query would split it by currency.");

  const book = bookSchema.parse({
    asOf: flex.asOf,
    holdings: [...flex.holdings, ...cash],
    lookThrough: [],
    transactions: flex.transactions,
    fx: { base: flex.currency, asOf: flex.asOf, rates, source: "IBKR Flex statement" },
    series: flex.nav.length ? { nav: flex.nav, benchmarks: {}, source: "IBKR Flex statement", ...(flex.unlisted ? { unlisted: [flex.unlisted] } : {}) } : undefined,
  });
  if (flex.unlisted) notes.push(unlistedSentence([flex.unlisted], flex.currency));
  const leftOut = unconvertibleNote(book, "trades");
  if (leftOut) notes.push(leftOut);
  return { book, kind: "flex", notes };
}

/**
 * The statement's cash as holdings (Hamza, 6 Nov 2026), one per currency
 * when every currency it holds has a rate in the statement, else one in the
 * base currency from the base summary.
 */
export function cashHoldings(flex: ReturnType<typeof parseFlexBook>, rates: Record<string, number>): Holding[] {
  const c = flex.cash;
  if (!c) return [];
  const one = (currency: string, amount: number): Holding => ({ id: `ibkr:${flex.account}:cash:${currency}`, account: flex.account, source: "ibkr", assetClass: "cash", symbol: currency, name: `${currency} cash`, quantity: amount, price: 1, value: amount, costBasis: null, currency, asOf: flex.asOf, valuation: "broker", country: null, sector: null, themes: [] });
  if (c.currencies.length && c.currencies.every((x) => x.currency in rates)) return c.currencies.map((x) => one(x.currency, x.amount));
  return c.base !== 0 ? [one(flex.currency, c.base)] : [];
}

export function bookFromJson(text: string): Imported {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyncError("That file is not valid JSON.", "book json parse failed");
  }
  const ok = bookSchema.safeParse(parsed);
  if (!ok.success) {
    const first = ok.error.issues[0];
    throw new SyncError(`That file is not an Invariant book${first ? ` (${first.path.join(".") || "root"}: ${first.message})` : ""}.`, "book json failed schema");
  }
  if (!ok.data.holdings.length) throw new SyncError("That book has no holdings, so there is nothing to show.", "book json empty");
  return { book: ok.data, kind: "book", notes: [] };
}

/** Reads whichever of the two the file is. */
export function importBook(text: string, accountLabel = "IBKR"): Imported {
  const kind = sniff(text);
  if (kind === "flex") return bookFromFlex(text, accountLabel);
  if (kind === "book") return bookFromJson(text);
  throw new SyncError("Upload an IBKR Flex statement (XML) or an Invariant book file (JSON). Other statements arrive by email on the Statements screen.", "import unknown kind");
}

/** The book in a line, for Setup. */
export function describeBook(book: Book): string {
  const accounts = new Set(book.holdings.map((h) => h.account)).size;
  return `${book.holdings.length} holding${book.holdings.length === 1 ? "" : "s"} in ${accounts} account${accounts === 1 ? "" : "s"}, as of ${book.asOf}, in ${book.fx.base}${book.series?.nav.length ? `, with ${book.series.nav.length} days of account value` : ""}.`;
}
