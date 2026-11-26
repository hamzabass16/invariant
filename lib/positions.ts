import { toBase, type Book, type Holding } from "@/lib/holdings";
import { monthsBefore, type MarketPoint } from "@/lib/markets";
import { ownerValueOf } from "@/lib/ontology";

/**
 * The positions table on Holdings, as a broker shows it: one row per symbol
 * (every account's lots of it together), then the cash. Last and average
 * price are in the holding's own currency; every money column is in the base
 * currency. Pure: the book and the daily closes in, rows out. A figure the
 * book or the closes cannot give is null, never a zero.
 */

export type PositionRow = {
  symbol: string;
  name: string;
  assetClass: Holding["assetClass"];
  /** Units held, summed over accounts; contracts for options, negative when short. */
  quantity: number;
  /** Per unit, in the holding's currency. */
  last: number | null;
  currency: string;
  /** Percent changes: the last session, since the last close of the year before, over six months, and on cost. */
  dayPct: number | null;
  ytdPct: number | null;
  sixMonthPct: number | null;
  sinceBoughtPct: number | null;
  /** In base currency. */
  cost: number | null;
  value: number;
  /** What was paid per unit, in the holding's currency. */
  avgPrice: number | null;
  dayPnl: number | null;
  unrealizedPnl: number | null;
  accounts: number;
};

export type CashRow = { id: string; label: string; account: string; currency: string; amount: number; value: number };

export type Positions = {
  rows: PositionRow[];
  cash: CashRow[];
  /** Sums over the rows that carry the figure; the value total is net worth. */
  total: { value: number; cost: number | null; dayPnl: number | null; unrealizedPnl: number | null; cash: number };
};

const CASH_LIKE: ReadonlySet<string> = new Set(["cash", "deposit"]);
/** The classes the price feed's daily closes describe. */
const LISTED: ReadonlySet<string> = new Set(["equity", "etf"]);

const pct = (now: number, then: number | undefined) => (then === undefined || then === 0 ? null : (now / then - 1) * 100);

/** The last close on or before a date. */
function closeOn(pts: MarketPoint[], date: string): MarketPoint | undefined {
  let at: MarketPoint | undefined;
  for (const p of pts) if (p.date <= date) at = p;
  return at;
}

/**
 * A listed holding's day, year-to-date and six-month change from its daily
 * closes, read at the book's date so they describe the same close as Last.
 */
export function closeChanges(pts: MarketPoint[], asOf: string): { day: number | null; ytd: number | null; sixMonth: number | null } {
  const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
  const anchor = closeOn(sorted, asOf) ?? sorted[sorted.length - 1];
  if (!anchor) return { day: null, ytd: null, sixMonth: null };
  const i = sorted.indexOf(anchor);
  const yearEnd = closeOn(sorted, `${Number(anchor.date.slice(0, 4)) - 1}-12-31`);
  const sixMonths = closeOn(sorted, monthsBefore(anchor.date, 6));
  return { day: pct(anchor.value, sorted[i - 1]?.value), ytd: pct(anchor.value, yearEnd?.value), sixMonth: pct(anchor.value, sixMonths?.value) };
}

const sumOrNull = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null);

/** The positions and cash of a book, largest market value first; `closes` by symbol, as `series.holdings` carries them. */
export function positionsOf(book: Book, closes: Record<string, MarketPoint[]> = book.series?.holdings ?? {}): Positions {
  const bySymbol = new Map<string, Holding[]>();
  const cash: CashRow[] = [];
  for (const h of book.holdings) {
    if (CASH_LIKE.has(h.assetClass)) {
      cash.push({ id: h.id, label: h.assetClass === "deposit" ? h.name : `Cash ${h.currency}`, account: h.account, currency: h.currency, amount: h.value, value: ownerValueOf(h, book) });
      continue;
    }
    const key = `${h.symbol.toUpperCase()}|${h.currency}`;
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), h]);
  }
  const rows: PositionRow[] = [...bySymbol.values()].map((lots) => {
    const h = lots[0];
    const quantity = lots.reduce((s, l) => s + l.quantity, 0);
    const native = lots.reduce((s, l) => s + l.value, 0);
    const value = lots.reduce((s, l) => s + ownerValueOf(l, book), 0);
    // Cost and profit only where every lot has a cost; a property's owner value is net of its mortgage, so its cost is not set against it.
    const costed = lots.every((l) => l.costBasis !== null) && h.assetClass !== "real_estate";
    const nativeCost = costed ? lots.reduce((s, l) => s + (l.costBasis ?? 0), 0) : null;
    const cost = nativeCost === null ? null : toBase(nativeCost, h.currency, book.fx);
    // Value is price times units times the multiplier, so the cost scaled the same way is the price paid per unit.
    const avgPrice = nativeCost !== null && h.price !== null && native !== 0 ? (nativeCost / native) * h.price : null;
    const unrealizedPnl = cost === null ? null : value - cost;
    const sinceBoughtPct = cost === null || cost === 0 ? null : ((value - cost) / Math.abs(cost)) * 100;
    const series = LISTED.has(h.assetClass) ? closes[h.symbol] ?? closes[h.symbol.toUpperCase()] : undefined;
    const fromCloses = series?.length ? closeChanges(series, book.asOf) : { day: null, ytd: null, sixMonth: null };
    // The broker's own change since the previous close wins over the feed's when every lot carries it.
    const brokerDay = lots.every((l) => typeof l.dayChange === "number") ? lots.reduce((s, l) => s + (l.dayChange ?? 0), 0) : null;
    const dayPct = brokerDay !== null && native - brokerDay !== 0 ? (brokerDay / Math.abs(native - brokerDay)) * 100 : fromCloses.day;
    const dayPnl = brokerDay !== null ? toBase(brokerDay, h.currency, book.fx) : fromCloses.day !== null ? value - value / (1 + fromCloses.day / 100) : null;
    return { symbol: h.symbol, name: h.name, assetClass: h.assetClass, quantity, last: h.price, currency: h.currency, dayPct, ytdPct: fromCloses.ytd, sixMonthPct: fromCloses.sixMonth, sinceBoughtPct, cost, value, avgPrice, dayPnl, unrealizedPnl, accounts: new Set(lots.map((l) => l.account)).size };
  });
  rows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  cash.sort((a, b) => b.value - a.value);
  const cashTotal = cash.reduce((s, c) => s + c.value, 0);
  return {
    rows,
    cash,
    total: { value: rows.reduce((s, r) => s + r.value, 0) + cashTotal, cost: sumOrNull(rows.map((r) => r.cost)), dayPnl: sumOrNull(rows.map((r) => r.dayPnl)), unrealizedPnl: sumOrNull(rows.map((r) => r.unrealizedPnl)), cash: cashTotal },
  };
}
