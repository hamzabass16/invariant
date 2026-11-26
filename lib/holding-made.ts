/**
 * What each holding made (Hamza, 19 Oct 2026: a card on Holdings, past year
 * or since you started), pure. Since you started, a holding made its value
 * now less its cost basis, plus what its sales realised (the broker's
 * realised P&L, else first-in first-out lots, lib/trades.ts) and its
 * dividends. Over the past year it made its value now less its value a year
 * ago (the shares then, from the shares now less the year's fills, at the
 * close a year ago and today's exchange rate), less what was bought, plus
 * what was sold and its dividends. Interest and fees are one line of their
 * own. A holding nothing can price is left out and named, never counted as
 * zero. Money is in base currency.
 */
import { baseAmountOf, rateOf, type Book, type Transaction } from "@/lib/holdings";
import { LISTED_FOR_DAY, ownerValueOf } from "@/lib/ontology";
import { fillsOf, matchLots } from "@/lib/trades";

export const MADE_WINDOWS = ["year", "start"] as const;
export type MadeWindow = (typeof MADE_WINDOWS)[number];
export const MADE_WINDOW_LABEL: Record<MadeWindow, string> = { year: "Past year", start: "Since you started" };

export type HoldingMade = {
  symbol: string;
  made: number;
  dividends: number;
  sold: boolean;
  /** Its value now in base currency, 0 when sold: what a heat map sizes it by. */
  value: number;
  /** What it made over the money it had at work (the value a year ago plus the year's buys, or the cost basis plus the cost of what was sold), percent; null without it. */
  pct: number | null;
};
export type WhatMade = {
  window: MadeWindow;
  /** The first day counted: a year ago, or null since the start. */
  from: string | null;
  /** Largest gain first. */
  rows: HoldingMade[];
  /** Interest and fees, together; null when the ledger has none. */
  other: number | null;
  total: number;
  left: { symbol: string; why: string }[];
};

const DAY = 86_400_000;
const EPS = 1e-6;
const yearAgo = (today: string) => new Date(Date.parse(`${today}T00:00:00Z`) - 365 * DAY).toISOString().slice(0, 10);
/** A close this many days old still stands for the day a year ago. */
const STALE_CLOSE_DAYS = 7;

function closeOn(points: readonly { date: string; value: number }[] | undefined, day: string): number | null {
  let out: { date: string; value: number } | null = null;
  for (const p of points ?? []) if (p.date <= day) out = p;
  if (!out || Date.parse(`${day}T00:00:00Z`) - Date.parse(`${out.date}T00:00:00Z`) > STALE_CLOSE_DAYS * DAY) return null;
  return out.value;
}

const sumBase = (ts: readonly Transaction[], book: Book) => ts.reduce((s, t) => s + (baseAmountOf(t, book.fx) ?? 0), 0);

export function whatEachMade(book: Book, window: MadeWindow, today: string, closes: Readonly<Record<string, readonly { date: string; value: number }[]>> = book.series?.holdings ?? {}): WhatMade {
  const from = window === "year" ? yearAgo(today) : null;
  const inWindow = (d: string) => (from === null || d > from) && d <= today;
  const listed = book.holdings.filter((h) => LISTED_FOR_DAY.has(h.assetClass));
  const fills = fillsOf(book).filter((f) => inWindow(f.date));
  const dividends = book.transactions.filter((t) => t.kind === "dividend" && t.symbol && inWindow(t.date));
  const key = (s: string) => s.toUpperCase();
  const symbols = new Map<string, string>();
  for (const h of listed) symbols.set(key(h.symbol), h.symbol);
  for (const f of fills) if (!symbols.has(key(f.symbol))) symbols.set(key(f.symbol), f.symbol);
  const closed = window === "start" ? matchLots(book).closed : [];
  const unmatched = window === "start" ? matchLots(book).unmatched : [];
  const rows: HoldingMade[] = [];
  const left: WhatMade["left"] = [];
  for (const [k, symbol] of symbols) {
    const held = listed.filter((h) => key(h.symbol) === k);
    const value = held.reduce((s, h) => s + ownerValueOf(h, book), 0);
    const div = sumBase(dividends.filter((t) => key(t.symbol) === k), book);
    let made: number | null = null;
    let atWork = 0;
    if (window === "start") {
      const basis = held.map((h) => (h.costBasis === null ? null : (() => { const r = rateOf(h.currency, book.fx); return r === null ? null : h.costBasis * r; })()));
      if (basis.some((b) => b === null)) {
        left.push({ symbol, why: "no cost basis from the broker" });
        continue;
      }
      if (unmatched.some((u) => key(u.symbol) === k)) {
        left.push({ symbol, why: "a sale no lot or broker figure prices" });
        continue;
      }
      const realised = closed.filter((c) => key(c.symbol) === k).reduce((s, c) => s + c.pnl, 0);
      const cost = basis.reduce((s: number, b) => s + (b ?? 0), 0);
      made = value - cost + realised + div;
      atWork = cost + closed.filter((c) => key(c.symbol) === k).reduce((s, c) => s + c.cost, 0);
    } else {
      const mine = fills.filter((f) => key(f.symbol) === k);
      const shares = held.reduce((s, h) => s + h.quantity, 0);
      const net = mine.reduce((s, f) => s + (f.side === "buy" ? f.quantity : -f.quantity), 0);
      const sharesThen = shares - net;
      let then = 0;
      if (sharesThen > EPS) {
        const close = closeOn(closes[symbol] ?? closes[k], from!);
        const currency = held[0]?.currency ?? mine[0]?.currency ?? null;
        const rate = currency ? rateOf(currency, book.fx) : null;
        if (close === null || rate === null) {
          left.push({ symbol, why: close === null ? "no close a year ago" : "a currency nothing converts" });
          continue;
        }
        then = sharesThen * close * rate;
      } else if (sharesThen < -EPS) {
        left.push({ symbol, why: "the year's sales exceed the shares held, so the ledger misses a buy" });
        continue;
      }
      const bought = mine.filter((f) => f.side === "buy").reduce((s, f) => s + f.amount, 0);
      const sold = mine.filter((f) => f.side === "sell").reduce((s, f) => s + f.amount, 0);
      made = value - then - bought + sold + div;
      atWork = then + bought;
    }
    if (made !== null && (Math.abs(made) >= 0.5 || held.length)) rows.push({ symbol, made: Math.round(made * 100) / 100, dividends: Math.round(div * 100) / 100, sold: !held.length, value: Math.round(value * 100) / 100, pct: atWork > 0 ? Math.round((made / atWork) * 1e4) / 100 : null });
  }
  rows.sort((a, b) => b.made - a.made || a.symbol.localeCompare(b.symbol));
  const others = book.transactions.filter((t) => (t.kind === "interest" || t.kind === "fee") && inWindow(t.date));
  const other = others.length ? Math.round(sumBase(others, book) * 100) / 100 : null;
  const total = Math.round((rows.reduce((s, r) => s + r.made, 0) + (other ?? 0)) * 100) / 100;
  return { window, from, rows, other, total, left };
}
