/**
 * The move the options market priced for the results (Hamza, 21 Oct 2026,
 * after Unusual Whales): before a company reports, the at-the-money straddle
 * of the first expiry that trades on the results, over the share price. A
 * straddle (a call and a put at the same strike) pays the size of the move
 * either way, so its price is what the market paid to hold that move:
 *
 *   expected move = (call mid + put mid) at the strike nearest the price, over the price
 *
 * Read from Cboe's delayed quotes (fifteen minutes late, no key) in the
 * days before the report and kept as it stood before the session that
 * trades on the results; after them the report sets it beside the move the
 * shares made. Nothing is forecast: it is what the options cost.
 *
 * Pure: the chain parser and the arithmetic. lib/markets-feed.ts fetches.
 */
import { z } from "zod";

import { MARKET_HOLIDAYS } from "@/lib/live";
import { addDaysTo, daysBetween } from "@/lib/time";

/** Cboe's delayed quotes, the symbol alone in the URL; the second host answers when the first does not. */
export const CBOE_QUOTES = (symbol: string) => [`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`, `https://cdn-api.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`];
export const CBOE_PAGE = (symbol: string) => `https://www.cboe.com/delayed_quotes/${encodeURIComponent(symbol.toLowerCase())}/quote_table`;

/** Days before the report the move is read; it is read again on each run until the session that trades on the results opens. */
export const EXPECTED_DAYS = 4;
/** Companies read in one run. */
export const EXPECTED_PER_RUN = 8;
/** A reading younger than this is not read again. */
export const EXPECTED_FRESH_HOURS = 3;
/** Kept, newest first. */
export const MAX_EXPECTED = 120;

export const expectedMoveSchema = z.object({
  symbol: z.string().max(12),
  /** The report date it is for. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readAt: z.string(),
  /** The expiry and the strike of the straddle. */
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strike: z.number(),
  spot: z.number(),
  /** The call's and the put's mid prices added. */
  straddle: z.number(),
  /** The straddle over the price, in percent: the move priced either way. */
  pct: z.number(),
});
export type ExpectedMove = z.infer<typeof expectedMoveSchema>;

export type ChainQuote = { expiry: string; type: "C" | "P"; strike: number; bid: number | null; ask: number | null; last: number | null };
export type Chain = { spot: number; quotes: ChainQuote[] };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Cboe's delayed quotes: `data.current_price` and `data.options`, each option
 * named in the OCC form (root, YYMMDD, C or P, the strike times a thousand
 * in eight digits). Throws when there is no price or no option.
 */
export function parseCboeChain(json: unknown): Chain {
  const data = (json as { data?: { current_price?: unknown; close?: unknown; options?: unknown } } | null)?.data;
  const spot = n(data?.current_price) ?? n(data?.close);
  if (spot === null || spot <= 0) throw new Error("no price");
  if (!Array.isArray(data?.options)) throw new Error("no options");
  const quotes: ChainQuote[] = [];
  for (const o of data.options as { option?: unknown; bid?: unknown; ask?: unknown; last_trade_price?: unknown }[]) {
    const m = typeof o?.option === "string" ? o.option.match(/(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/) : null;
    if (!m) continue;
    quotes.push({ expiry: `20${m[1]}-${m[2]}-${m[3]}`, type: m[4] as "C" | "P", strike: Number(m[5]) / 1000, bid: n(o.bid), ask: n(o.ask), last: n(o.last_trade_price) });
  }
  if (!quotes.length) throw new Error("no options");
  return { spot, quotes };
}

const weekday = (d: string) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6 && !MARKET_HOLIDAYS.includes(d);
};

/** The first session that trades on the results: the report day for a report before the open (or at a time not given), the next session for one after the close. */
export function sessionOnResults(date: string, time: string): string {
  if (time !== "post") return date;
  let d = addDaysTo(date, 1);
  while (!weekday(d)) d = addDaysTo(d, 1);
  return d;
}

/** Whether the session that trades on the results has opened by New York's date and minutes; until then the move is read again. */
export function stillBefore(date: string, time: string, ny: { date: string; minutes: number }): boolean {
  const s = sessionOnResults(date, time);
  return ny.date < s || (ny.date === s && ny.minutes < 9 * 60 + 30);
}

const mid = (q: ChainQuote | undefined) => {
  if (!q) return null;
  if (q.bid !== null && q.ask !== null && q.ask > 0 && q.ask >= q.bid) return (q.bid + q.ask) / 2;
  return q.last !== null && q.last > 0 ? q.last : null;
};

/**
 * The straddle at the strike nearest the price, in the first expiry on or
 * after the session that trades on the results, both legs priced; null when
 * the chain has no such expiry or no strike with both a call and a put.
 */
export function expectedMove(chain: Chain, symbol: string, date: string, time: string, readAt: string): ExpectedMove | null {
  const session = sessionOnResults(date, time);
  const expiries = [...new Set(chain.quotes.map((q) => q.expiry))].filter((e) => e >= session).sort();
  for (const expiry of expiries.slice(0, 2)) {
    const legs = chain.quotes.filter((q) => q.expiry === expiry);
    const strikes = [...new Set(legs.map((q) => q.strike))].sort((a, b) => Math.abs(a - chain.spot) - Math.abs(b - chain.spot));
    for (const strike of strikes.slice(0, 3)) {
      const c = mid(legs.find((q) => q.type === "C" && q.strike === strike));
      const p = mid(legs.find((q) => q.type === "P" && q.strike === strike));
      if (c === null || p === null) continue;
      const straddle = c + p;
      return { symbol, date, readAt, expiry, strike, spot: chain.spot, straddle: Math.round(straddle * 100) / 100, pct: Math.round((straddle / chain.spot) * 1000) / 10 };
    }
  }
  return null;
}

/** The readings with one put in its place, newest report first; those for reports long past dropped. */
export function keepExpected(list: readonly ExpectedMove[], x: ExpectedMove, today: string): ExpectedMove[] {
  return [x, ...list.filter((e) => !(e.symbol === x.symbol && e.date === x.date))].filter((e) => daysBetween(e.date, today) <= 120).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_EXPECTED);
}

/** The reading kept for a report, if any. */
export function expectedFor(list: readonly ExpectedMove[] | undefined, symbol: string, date: string): ExpectedMove | null {
  return list?.find((e) => e.symbol.toUpperCase() === symbol.toUpperCase() && e.date === date) ?? null;
}

/** "Options priced a move of 6.2% either way; the shares moved 9.1%, more than priced." */
export function againstPriced(x: ExpectedMove, movePct: number | null): string {
  const priced = `Options priced a move of ${x.pct.toFixed(1)}% either way (the ${x.strike} straddle to ${x.expiry})`;
  if (movePct === null) return `${priced}.`;
  const a = Math.abs(movePct);
  const word = a > x.pct * 1.1 ? "more than priced" : a < x.pct * 0.9 ? "less than priced" : "about what was priced";
  return `${priced}; the shares moved ${a.toFixed(1)}%, ${word}.`;
}
