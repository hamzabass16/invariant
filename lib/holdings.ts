/**
 * One holdings model for every source. Each adapter (IBKR Flex, SnapTrade,
 * the Statements Inbox, the real-estate form) writes these records, so the
 * screens and the statistics never care where a figure came from. Pure: zod
 * schemas and types only.
 *
 * Every value carries its as-of date and where it came from, because a bank
 * statement from last month, a fund report from last quarter and a broker
 * mark from last night are not the same kind of number.
 */
import { z } from "zod";

import { marketsSchema } from "@/lib/markets";
import { longDate } from "@/lib/time";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

export const ASSET_CLASSES = ["equity", "etf", "option", "bond", "deposit", "cash", "private_fund", "real_estate", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Where a value came from, most to least current. */
export const VALUATION_SOURCES = ["broker", "bank_statement", "fund_report", "manual", "estimate"] as const;

export const optionFields = z.object({
  underlying: z.string(),
  right: z.enum(["C", "P"]),
  strike: z.number().positive(),
  expiry: isoDate,
  /** Shares per contract; 100 for standard US equity options. */
  multiplier: z.number().positive(),
});
export type OptionFields = z.infer<typeof optionFields>;

export const bondFields = z.object({
  issuer: z.string(),
  isin: z.string().nullable(),
  coupon: z.number().nullable(),
  maturity: isoDate.nullable(),
  /** As stated on the statement; null when it is not stated. Never computed silently. */
  yieldPct: z.number().nullable(),
  rating: z.string().nullable(),
});

export const depositFields = z.object({
  ratePct: z.number().nullable(),
  start: isoDate.nullable(),
  maturity: isoDate.nullable(),
});

export const fundFields = z.object({
  manager: z.string(),
  vintage: z.number().int().nullable(),
  commitment: z.number().nonnegative(),
  called: z.number().nonnegative(),
  distributions: z.number().nonnegative(),
  /** The fund's own figures, as reported; null when the report does not give them. */
  reported: z.object({ dpi: z.number().nullable(), tvpi: z.number().nullable(), irrPct: z.number().nullable() }),
});

export const propertyFields = z.object({
  address: z.string(),
  country: z.string(),
  ownershipPct: z.number().min(0).max(100),
  purchasePrice: z.number().nullable(),
  purchaseDate: isoDate.nullable(),
  mortgage: z.number().nonnegative(),
  monthlyRent: z.number().nullable(),
  rental: z.enum(["long_term", "short_stay", "own_use", "vacant"]),
  valuationSource: z.string(),
  /** When the value was last set; over a year old is flagged. */
  valuationDate: isoDate.nullable(),
});

/**
 * A company's revenue by geography as its own filing reports it
 * (lib/edgar-segments.ts geographyRead): each line the filing gives, in the
 * company's own grain (a country, a region), as a share of company revenue.
 * `placedPct` is what the lines place: below 100 when the filing places only
 * part of revenue, which `partial` also says. Nothing estimated.
 */
export const revenueGeographySchema = z.object({
  /** The form read ("10-K", "20-F", "40-F", "10-Q"). */
  form: z.string().max(10),
  /** The period in words ("year to 2025-12-31"). */
  period: z.string().max(40),
  periodEnd: isoDate,
  /** The filing's accession number, so a screen can say which filing. */
  accession: z.string().max(25).nullable(),
  lines: z.array(z.object({ name: z.string().max(80), grain: z.enum(["country", "region"]), sharePct: z.number() })).max(30),
  placedPct: z.number(),
  /** True when the lines do not reconcile to company revenue within a few percent. */
  partial: z.boolean(),
  note: z.string().max(300).nullable(),
});
export type RevenueGeography = z.infer<typeof revenueGeographySchema>;

/**
 * What the owner records about a holding themselves: their own valuation per
 * unit (a DCF, an appraisal), when it entered its current standing, a note.
 * Kept in the vault's records file and merged into the book; never from a
 * broker.
 */
export const recordFields = z.object({
  ownValuation: z.object({ low: z.number().nullable(), base: z.number(), high: z.number().nullable(), asOf: isoDate, basis: z.string().max(80).nullable() }).nullable(),
  /** The date the holding entered its current standing (a class, a probation, a watch); for clocks. */
  since: isoDate.nullable(),
  note: z.string().max(300).nullable(),
  /** The sector the owner assigns, over the one the filings give; null leaves the filings' sector. */
  sector: z.string().max(40).nullable().default(null),
  /** Price levels the person wants to hear of: an alert when the price is at or below `below`, or at or above `above` (lib/alerts.ts). */
  levels: z.object({ below: z.number().positive().nullable(), above: z.number().positive().nullable() }).nullable().default(null),
  /**
   * The holding's own triggers and kill signals, as the person wrote them for
   * it: a figure ("price" or a fundamental field of the ontology), at or
   * below or at or above a level. A met one is an alert and a to-do item
   * (lib/alerts.ts triggerNotices); it never changes a class.
   */
  triggers: z
    .array(z.object({ id: z.string().min(1).max(20), kind: z.enum(["trigger", "kill"]), field: z.string().min(1).max(40), is: z.enum(["lte", "gte"]), value: z.number(), note: z.string().max(200).nullable() }))
    .max(12)
    .default([]),
  /** A property's value as the person accepted it (from the property watch or their own appraisal): the whole property, in its currency. */
  revaluation: z.object({ value: z.number().positive(), asOf: isoDate, source: z.string().max(200) }).nullable().default(null),
});
export type HoldingRecord = z.infer<typeof recordFields>;

export const holdingSchema = z.object({
  id: z.string(),
  account: z.string(),
  source: z.enum(["ibkr", "snaptrade", "etoro", "statements", "manual"]),
  assetClass: z.enum(ASSET_CLASSES),
  /** Ticker, OCC symbol, ISIN or a readable name for private assets. */
  symbol: z.string(),
  name: z.string(),
  quantity: z.number(),
  /** Per unit, in the holding's currency (per share for options, not per contract). */
  price: z.number().nullable(),
  /** Market value in the holding's currency; negative for short options. */
  value: z.number(),
  costBasis: z.number().nullable(),
  /** Change in value since the previous close, in the holding's currency; null when the source gives no previous close. */
  dayChange: z.number().nullable().optional(),
  currency,
  asOf: isoDate,
  valuation: z.enum(VALUATION_SOURCES),
  country: z.string().nullable(),
  sector: z.string().nullable(),
  themes: z.array(z.string()),
  option: optionFields.optional(),
  bond: bondFields.optional(),
  deposit: depositFields.optional(),
  fund: fundFields.optional(),
  property: propertyFields.optional(),
  record: recordFields.optional(),
  /** Company fundamentals by ontology field id, laid on by research (lib/research.ts); never from a broker. */
  fundamentals: z.record(z.string(), z.number().nullable()).optional(),
  /** Revenue by geography from the company's latest annual filing, laid on from the filings file (lib/filings.ts); never from a broker. */
  revenueGeography: revenueGeographySchema.nullable().optional(),
});
export type Holding= z.infer<typeof holdingSchema>;

/** What sits inside a fund (or an ETF): one row per underlying company. */
export const lookThroughSchema = z.object({
  parentId: z.string(),
  name: z.string(),
  /** A public ticker when the company is listed, so overlap with direct holdings can be found. */
  ticker: z.string().nullable(),
  sector: z.string().nullable(),
  country: z.string().nullable(),
  stage: z.string().nullable(),
  themes: z.array(z.string()),
  /** Fair value in the fund's report currency, when the report gives it. */
  fairValue: z.number().nullable(),
  asOf: isoDate,
});
export type LookThroughRow = z.infer<typeof lookThroughSchema>;

export const TRANSACTION_KINDS = [
  "buy",
  "sell",
  "option_open",
  "option_close",
  "assignment",
  "exercise",
  "expiry",
  "capital_call",
  "distribution",
  "coupon",
  "interest",
  "dividend",
  "deposit",
  "withdrawal",
  "fee",
] as const;

export const transactionSchema = z.object({
  date: isoDate,
  account: z.string(),
  kind: z.enum(TRANSACTION_KINDS),
  symbol: z.string(),
  quantity: z.number(),
  price: z.number().nullable(),
  /** Cash effect in the transaction's currency: positive in, negative out. */
  amount: z.number(),
  currency,
  /** The same cash effect in the base currency as the source reported it (IBKR's "Net Cash in Base"); used over a rate when present. */
  amountBase: z.number().optional(),
  /**
   * The broker's own realised P&L on a closing fill, in the transaction's
   * currency, matched over its whole lot history (IBKR's FIFO realised P&L).
   * It prices a sale of shares bought before the ledger begins.
   */
  realized: z.number().optional(),
  /** What the fill paid in commission, in the transaction's currency, as a cost (a rebate is negative); already inside `amount`. */
  commission: z.number().optional(),
  /** Tax paid on the transaction (a fill's transaction tax, or the tax withheld on a dividend), in its currency, as a cost; already inside `amount`. */
  tax: z.number().optional(),
  option: optionFields.optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/** FX to the instance's base currency: units of base per one unit of `currency`. */
export const fxSchema = z.object({ base: currency, asOf: isoDate, rates: z.record(currency, z.number().positive()), source: z.string() });
export type Fx = z.infer<typeof fxSchema>;

/** Prices the Greeks need: the risk-free rate and underlying prices the book has no shares of. */
export const marketSchema = z.object({ asOf: isoDate, rate: z.number(), spots: z.record(z.string(), z.number().positive()), source: z.string() });

const seriesPoint = z.object({ date: isoDate, value: z.number() });
/**
 * Time series the book carries: the account's value by day (in base currency,
 * from the broker's own report) and any benchmark price series a source
 * supplies. Returns, drawdowns and betas are computed from these and only
 * these; no series, no figure.
 */
export const seriesSchema = z.object({
  nav: z.array(seriesPoint),
  benchmarks: z.record(z.string(), z.array(seriesPoint)),
  /**
   * Daily closes per holding symbol, in the holding's currency, when a source
   * supplies them. Contribution by holding and the correlation of the book
   * are computed from these and only these; without them the review says what
   * it needs. No broker statement carries them yet.
   */
  holdings: z.record(z.string(), z.array(seriesPoint)).optional(),
  /**
   * Money the statement's own Change in NAV says came in or went out over a
   * period that its rows do not list (a transfer without the Transfers
   * section), in base: the returns over those dates count it, and the screens
   * say so (lib/adapters/ibkr-flex.ts unlistedFlowOf).
   */
  unlisted: z.array(z.object({ from: isoDate, to: isoDate, amount: z.number() })).optional(),
  source: z.string(),
});
export type Series = z.infer<typeof seriesSchema>;

export const bookSchema = z.object({
  asOf: isoDate,
  holdings: z.array(holdingSchema),
  lookThrough: z.array(lookThroughSchema),
  transactions: z.array(transactionSchema),
  fx: fxSchema,
  market: marketSchema.optional(),
  series: seriesSchema.optional(),
  /** The public market indicators, laid on at read time (lib/markets.ts); never part of the vault's copy. */
  markets: marketsSchema.optional(),
});
export type Book = z.infer<typeof bookSchema>;

/**
 * A new statement laid over the book kept before it, so the history grows
 * instead of starting again (Hamza, 19 Oct 2026: the IRR "should be a longer
 * timeframe"): an IBKR Flex query covers a year at most, so each fetch would
 * otherwise drop everything older. The kept book's account values and
 * ledger rows dated before the new statement's first value carry over, from
 * the same source and the same accounts only; the new statement wins
 * wherever both speak. A statement older than the kept book (a past year
 * uploaded on Setup) only lends it its earlier history. A new statement with
 * no value series, or a kept book from elsewhere, replaces the book as before.
 */
export function keepHistory(prev: Book | null, incoming: Book): Book {
  if (!prev) return incoming;
  // The newer of the two is the book; the older only lends its history.
  const [earlier, next] = incoming.asOf >= prev.asOf ? [prev, incoming] : [incoming, prev];
  // One that cannot be laid beside the other leaves the newer as it was: an older upload never replaces it.
  if (!earlier.series || !next.series || earlier.series.source !== next.series.source || !prev.series || !incoming.series) return next;
  const accounts = (b: Book) => [...new Set([...b.holdings.map((h) => h.account), ...b.transactions.map((t) => t.account)])].sort().join("|");
  if (accounts(earlier) !== accounts(next) && accounts(earlier) && accounts(next)) return next;
  // The statement just read wins over the dates it covers, so a year uploaded again (with Transfers ticked,
  // say) replaces what was kept for it; the kept book keeps every date outside them (Hamza, 19 Oct 2026).
  const from = fromFirstValue(incoming.series.nav)[0]?.date;
  if (!from) return next;
  const to = incoming.asOf;
  const outside = (d: string) => d < from || d > to;
  const nav = [...prev.series.nav.filter((p) => outside(p.date)), ...incoming.series.nav].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const transactions = [...prev.transactions.filter((t) => outside(t.date)), ...incoming.transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // A gap a statement found stays with its dates until a statement for them is read again.
  const unlisted = [...(prev.series.unlisted ?? []).filter((u) => u.to < from || u.from > to), ...(incoming.series.unlisted ?? [])];
  const { unlisted: _drop, ...rest } = next.series;
  void _drop;
  return { ...next, transactions, series: { ...rest, nav: fromFirstValue(nav), ...(unlisted.length ? { unlisted } : {}) } };
}

/**
 * The sentence for money a statement's own totals say moved that its rows do
 * not list: when, how much, what it does to the returns, and what to tick.
 */
export function unlistedSentence(gaps: readonly { from: string; to: string; amount: number }[], base: string): string {
  const each = gaps.map((g) => `${money(Math.abs(g.amount), base)} ${g.amount > 0 ? "came in" : "went out"} between ${longDate(g.from)} and ${longDate(g.to)}`).join("; ");
  return `${each[0].toUpperCase()}${each.slice(1)} by transfer on days the statement does not list, so the returns over those dates count it as ${gaps.every((g) => g.amount > 0) ? "a gain" : gaps.every((g) => g.amount < 0) ? "a loss" : "a gain or a loss"}. In the IBKR Flex query tick the Transfers section (Select All) and Change in NAV, then upload ${gaps.length === 1 ? "that period" : "those periods"} again.`;
}

/** A value series from its first day with money in it: the days before an account is funded are not its history. */
export function fromFirstValue<T extends { value: number }>(nav: readonly T[]): T[] {
  const i = nav.findIndex((p) => p.value > 0);
  return i <= 0 ? [...nav] : nav.slice(i);
}

/** Units of base per one unit of `ccy`, or null when the table has none; never a guess. */
export function rateOf(ccy: string, fx: Fx): number | null {
  if (ccy === fx.base) return 1;
  const rate = fx.rates[ccy];
  return rate && rate > 0 ? rate : null;
}

/** Converts an amount in `ccy` to the base currency. Throws rather than guessing a rate. */
export function toBase(amount: number, ccy: string, fx: Fx): number {
  const rate = rateOf(ccy, fx);
  if (rate === null) throw new Error(`No ${ccy} to ${fx.base} rate in the FX table dated ${fx.asOf}.`);
  return amount * rate;
}

/**
 * A transaction's cash effect in the base currency: the source's own base
 * figure when it gave one, else the amount at the table's rate, else null.
 * Null is "left out, and said so" on the screens, never a throw: one trade
 * in a currency the statement never priced must not take the app down.
 */
export function baseAmountOf(t: Transaction, fx: Fx): number | null {
  if (t.amountBase !== undefined && Number.isFinite(t.amountBase)) return t.amountBase;
  const rate = rateOf(t.currency, fx);
  return rate === null ? null : t.amount * rate;
}

/** Currencies the ledger uses that nothing can convert, with how many transactions each leaves out. */
export function unconvertible(book: Book): { currency: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of book.transactions) if (baseAmountOf(t, book.fx) === null) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  return [...counts.entries()].map(([currency, count]) => ({ currency, count })).sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

/** The sentence a screen shows for ledger entries nothing can convert; empty when there are none. */
export function unconvertibleNote(book: Book, what = "entries"): string | null {
  const gaps = unconvertible(book);
  if (!gaps.length) return null;
  const list = gaps.map((g) => `${g.count} ${what === "entries" ? (g.count === 1 ? "entry" : "entries") : what} in ${g.currency}`).join(", ");
  return `${list} left out: the statement carries no rate to ${book.fx.base} for ${gaps.length === 1 ? "it" : "them"}. Tick "FX Rate to Base" and "Net Cash in Base" in the Trades section of the IBKR Flex query (Select All covers both) and upload it again.`;
}

/** Latest underlying prices: the book's own share marks, filled in from its market inputs. */
export function spotsFor(book: Book): Record<string, number> {
  const spots: Record<string, number> = {};
  for (const h of book.holdings) if ((h.assetClass === "equity" || h.assetClass === "etf") && h.price !== null) spots[h.symbol] = h.price;
  return { ...spots, ...(book.market?.spots ?? {}) };
}

/** The rate the Greeks use when the book carries none: 4% a year, said on the Options screen. */
export const DEFAULT_RATE = 0.04;

/** Money in a given currency, no decimals unless asked. */
export function money(n: number, ccy: string, digits = 0): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
