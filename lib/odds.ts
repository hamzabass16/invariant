/**
 * What the prediction markets bet on (Hamza, 21 Oct 2026: "prediction-market
 * odds, if free"): the chance of a cut, a hold or a hike at the Fed's next
 * meeting, from whichever of Kalshi's federal funds markets and Polymarket's
 * "Fed Decision in <month>?" has more money on that meeting (Hamza, 28 Oct
 * 2026: "whichever has more liquidity"), and the chance of a US recession,
 * from Polymarket. Both publish their prices with no key and no
 * account; a price of 0.62 on a yes contract is a 62% chance as the market
 * prices it. Read an hour apart, nothing of the person in the request.
 *
 *   Kalshi     https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFED&status=open
 *   Polymarket https://gamma-api.polymarket.com/public-search?q=recession
 *              https://gamma-api.polymarket.com/public-search?q=fed%20decision%20in%20october
 *
 * Kalshi's markets ask whether the upper bound of the target range will be
 * above a level after the meeting. With the range today (read from the
 * effective rate, which sits a few hundredths above the lower bound), a hike
 * is "above the upper bound", a hold is "above the lower bound" less that,
 * and a cut is the rest. Polymarket's event lists each outcome as its own
 * market (50+ bps decrease, 25 bps decrease, no change, 25 bps increase...).
 * Which is deeper is read by the money traded on the meeting's markets (a
 * Kalshi contract pays $1, so its contracts traded are dollars of notional;
 * Polymarket's volume is in dollars), then by the money still open. Nothing
 * here is the app's forecast.
 *
 * Pure: the parsers and the arithmetic. lib/markets-feed.ts fetches.
 */
import { z } from "zod";

export const KALSHI_FED = "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFED&status=open&limit=200";
export const KALSHI_PAGE = "https://kalshi.com/markets/kxfed";
/** The pages of the series read at most when the next meeting's own event is not found (Kalshi's list is paged by a cursor, a meeting a page or less). */
export const KALSHI_MAX_PAGES = 4;
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** A meeting's event on Kalshi, by its decision day: 2026-10-28 is KXFED-26OCT. */
export const kalshiEvent = (meeting: string) => `KXFED-${meeting.slice(2, 4)}${MON[Number(meeting.slice(5, 7)) - 1]}`;
/** One meeting's markets. */
export const KALSHI_EVENT = (meeting: string) => `https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${kalshiEvent(meeting)}&limit=200`;
/** The series' next page after a cursor. */
export const KALSHI_NEXT = (cursor: string) => `${KALSHI_FED}&cursor=${encodeURIComponent(cursor)}`;
/** The cursor to the series' next page, or null on the last. */
export function kalshiCursor(json: unknown): string | null {
  const c = (json as { cursor?: unknown } | null)?.cursor;
  return typeof c === "string" && c.trim() ? c : null;
}
export const POLYMARKET_SEARCH = "https://gamma-api.polymarket.com/public-search?q=recession&limit_per_type=20";
export const POLYMARKET_EVENT = (slug: string) => `https://polymarket.com/event/${encodeURIComponent(slug)}`;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Polymarket's search for a meeting's decision event, by the meeting's month ("Fed Decision in October?"). */
export const POLYMARKET_FED = (meeting: string) => `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(`fed decision in ${MONTH_NAMES[Number(meeting.slice(5, 7)) - 1].toLowerCase()}`)}&limit_per_type=20`;
export const FED_SOURCES = ["Kalshi", "Polymarket"] as const;
export type FedSource = (typeof FED_SOURCES)[number];

export const fedOddsSchema = z.object({
  /** The day the market closes, the meeting's decision day. */
  meeting: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The upper bound of the range today, in percent; null when the effective rate was not read. */
  upper: z.number().nullable(),
  cut: z.number(),
  hold: z.number(),
  hike: z.number(),
  /** A cut of half a point or more, part of `cut`; null when no market reaches that far down. */
  bigCut: z.number().nullable(),
  url: z.string().url(),
  /** Whose prices these are. */
  source: z.enum(FED_SOURCES).default("Kalshi"),
  /** Dollars traded on the meeting's markets, and still open; null when the market does not say. */
  traded: z.number().nullable().default(null),
  open: z.number().nullable().default(null),
  /** The other market's depth on the same meeting, when it was read, so the choice can be shown. */
  other: z.object({ source: z.enum(FED_SOURCES), traded: z.number().nullable(), open: z.number().nullable() }).nullable().default(null),
});
export type FedOdds = z.infer<typeof fedOddsSchema>;

export const recessionOddsSchema = z.object({ title: z.string().max(200), yes: z.number(), ends: z.string().nullable(), url: z.string().url() });
export type RecessionOdds = z.infer<typeof recessionOddsSchema>;

export const oddsSchema = z.object({ fed: fedOddsSchema.nullable(), recession: recessionOddsSchema.nullable(), readAt: z.string(), problems: z.array(z.string()) });
export type Odds = z.infer<typeof oddsSchema>;

const price = (cents: unknown, dollars: unknown): number | null => {
  if (typeof dollars === "string" && dollars.trim() !== "" && Number.isFinite(Number(dollars))) return Number(dollars);
  if (typeof dollars === "number" && Number.isFinite(dollars)) return dollars;
  if (typeof cents === "number" && Number.isFinite(cents)) return cents / 100;
  return null;
};

type KalshiMarket = { strike: number; p: number; event: string; closes: string; volume: number; open: number };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);

/** Kalshi's open federal funds markets: each one's level and its yes price (the bid and ask's middle, else the last trade), 0 to 1. */
export function parseKalshiFed(json: unknown): KalshiMarket[] {
  const markets = (json as { markets?: unknown } | null)?.markets;
  if (!Array.isArray(markets)) throw new Error("no markets");
  const out: KalshiMarket[] = [];
  for (const m of markets as Record<string, unknown>[]) {
    const strike = typeof m.floor_strike === "number" ? m.floor_strike : typeof m.floor_strike === "string" ? Number(m.floor_strike) : null;
    if (strike === null || !Number.isFinite(strike) || (m.strike_type && m.strike_type !== "greater")) continue;
    const bid = price(m.yes_bid, m.yes_bid_dollars);
    const ask = price(m.yes_ask, m.yes_ask_dollars);
    const last = price(m.last_price, m.last_price_dollars);
    const p = bid !== null && ask !== null && ask > 0 && ask >= bid ? (bid + ask) / 2 : last;
    const closes = typeof m.close_time === "string" ? m.close_time : typeof m.expiration_time === "string" ? m.expiration_time : null;
    if (p === null || !closes || typeof m.event_ticker !== "string") continue;
    out.push({ strike, p: Math.min(1, Math.max(0, p)), event: m.event_ticker, closes, volume: num(m.volume_fp ?? m.volume), open: num(m.open_interest_fp ?? m.open_interest) });
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 1000) / 10;

/**
 * The next meeting's chances from Kalshi's markets and the effective rate:
 * the event that closes first after `now`, its "above" prices made to fall
 * as the level rises, read at the range's two bounds. Null when the event
 * has no market at either bound.
 */
export function fedOdds(markets: readonly KalshiMarket[], effr: number | null, now: string, meeting?: string | null): FedOdds | null {
  if (effr === null) return null;
  const future = markets.filter((m) => m.closes > now);
  // The next meeting's own event when the calendar names it, else the one that closes first.
  const named = meeting ? kalshiEvent(meeting) : null;
  const event = (named && future.some((m) => m.event === named) ? named : null) ?? [...future].sort((a, b) => a.closes.localeCompare(b.closes))[0]?.event;
  if (!event) return null;
  const ms = future.filter((m) => m.event === event).sort((a, b) => a.strike - b.strike);
  // "Above" falls as the level rises: each price is held at or below the one before.
  for (let i = 1; i < ms.length; i++) ms[i] = { ...ms[i], p: Math.min(ms[i].p, ms[i - 1].p) };
  const lower = Math.floor(effr * 4 + 1e-9) / 4;
  const upper = lower + 0.25;
  const at = (x: number) => ms.find((m) => Math.abs(m.strike - x) < 0.01)?.p ?? null;
  const aboveUpper = at(upper);
  const aboveLower = at(lower);
  if (aboveUpper === null || aboveLower === null) return null;
  const below = at(lower - 0.25);
  return { meeting: ms[0].closes.slice(0, 10), upper, hike: round1(aboveUpper), hold: round1(aboveLower - aboveUpper), cut: round1(1 - aboveLower), bigCut: below === null ? null : round1(1 - below), url: KALSHI_PAGE, source: "Kalshi", traded: ms.reduce((t, m) => t + m.volume, 0), open: ms.reduce((t, m) => t + m.open, 0), other: null };
}

const yesOf = (m: Record<string, unknown>): number | null => {
  try {
    const outcomes = JSON.parse(typeof m.outcomes === "string" ? m.outcomes : '["Yes","No"]') as string[];
    const prices = (JSON.parse(m.outcomePrices as string) as string[]).map(Number);
    const yes = prices[Math.max(0, outcomes.findIndex((o) => /^yes$/i.test(o)))];
    return Number.isFinite(yes) ? Math.min(1, Math.max(0, yes)) : null;
  } catch {
    return null;
  }
};

/**
 * Polymarket's decision event for `meeting` ("Fed Decision in October?", its
 * end a day or two after the decision): each outcome's market by its own
 * label, decreases as a cut, no change as a hold, increases as a hike, the
 * yes prices made to add up to one. Null when the search holds no open event
 * for that meeting or none of its outcomes can be read.
 */
export function parsePolymarketFed(json: unknown, meeting: string, effr: number | null): FedOdds | null {
  const events = (json as { events?: unknown } | null)?.events ?? json;
  if (!Array.isArray(events)) throw new Error("no events");
  const month = MONTH_NAMES[Number(meeting.slice(5, 7)) - 1];
  const title = new RegExp(`^\\s*fed(eral reserve)? (interest rate )?decision in ${month}\\b`, "i");
  const last = new Date(Date.parse(`${meeting}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const e = (events as Record<string, unknown>[]).find((x) => typeof x.title === "string" && title.test(x.title) && x.closed !== true && typeof x.endDate === "string" && x.endDate.slice(0, 10) >= meeting && x.endDate.slice(0, 10) <= last && typeof x.slug === "string");
  if (!e) return null;
  let cut = 0;
  let hold = 0;
  let hike = 0;
  let big = 0;
  let read = 0;
  for (const m of Array.isArray(e.markets) ? (e.markets as Record<string, unknown>[]) : []) {
    if (m.closed === true) continue;
    const label = `${typeof m.groupItemTitle === "string" ? m.groupItemTitle : ""} ${typeof m.question === "string" ? m.question : ""}`;
    const p = yesOf(m);
    if (p === null) continue;
    if (/no change/i.test(label)) hold += p;
    else if (/decrease|cut/i.test(label)) {
      cut += p;
      if (/50\+|75|100/.test(label)) big += p;
    } else if (/increase|hike|raise/i.test(label)) hike += p;
    else continue;
    read += 1;
  }
  const sum = cut + hold + hike;
  if (!read || !(sum > 0)) return null;
  const upper = effr === null ? null : Math.floor(effr * 4 + 1e-9) / 4 + 0.25;
  const traded = num(e.volume);
  const open = num(e.openInterest);
  return { meeting, upper, cut: round1(cut / sum), hold: round1(hold / sum), hike: round1(hike / sum), bigCut: round1(big / sum), url: POLYMARKET_EVENT(e.slug as string), source: "Polymarket", traded: traded || null, open: open || null, other: null };
}

/**
 * The deeper of the two readings of one meeting: more money traded on it,
 * else more still open; the other's depth kept beside it. A reading of
 * another meeting, or none, leaves the one there is.
 */
export function deeperFed(kalshi: FedOdds | null, poly: FedOdds | null): FedOdds | null {
  if (!kalshi || !poly || kalshi.meeting !== poly.meeting) return kalshi ?? poly;
  const depth = (o: FedOdds) => [o.traded ?? 0, o.open ?? 0];
  const [kt, ko] = depth(kalshi);
  const [pt, po] = depth(poly);
  const polyWins = pt !== kt ? pt > kt : po > ko;
  const [win, lose] = polyWins ? [poly, kalshi] : [kalshi, poly];
  return { ...win, upper: win.upper ?? lose.upper, other: { source: lose.source, traded: lose.traded, open: lose.open } };
}

const dollars = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);

/** Whose prices these are and why, in a sentence: "Polymarket's, the deeper market on this meeting: $85.0M traded and $20.2M open, against $494k and $201k on Kalshi." */
export function fedSourceWords(f: Pick<FedOdds, "source" | "traded" | "open" | "other">): string {
  const depth = (t: number | null, o: number | null) => [t !== null ? `${dollars(t)} traded` : null, o !== null ? `${dollars(o)} open` : null].filter(Boolean).join(" and ");
  const own = depth(f.traded, f.open);
  if (!f.other) return own ? `${f.source}'s prices, with ${own} on this meeting.` : `${f.source}'s prices.`;
  const other = depth(f.other.traded, f.other.open).replace(/ traded| open/g, "");
  return `${f.source}'s prices, the deeper market on this meeting${own ? `: ${own}` : ""}${other ? `, against ${other} on ${f.other.source}` : ""}.`;
}

/**
 * Why there is no reading, in a sentence that names the meeting and the
 * levels Kalshi lists, so a gap is never a bare "no market".
 */
export function fedOddsGap(markets: readonly KalshiMarket[], effr: number, now: string, meeting: string | null): string {
  const lower = Math.floor(effr * 4 + 1e-9) / 4;
  const range = `${lower.toFixed(2)}% to ${(lower + 0.25).toFixed(2)}%`;
  const named = meeting ? kalshiEvent(meeting) : null;
  const ms = markets.filter((m) => m.closes > now && (!named || m.event === named));
  const when = meeting ? `the ${Number(meeting.slice(8, 10))} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(meeting.slice(5, 7)) - 1]} meeting` : "the next meeting";
  if (!ms.length) return `Kalshi lists no open market for ${when}.`;
  const strikes = ms.map((m) => m.strike).sort((a, b) => a - b);
  return `Kalshi's markets for ${when} run from ${strikes[0].toFixed(2)}% to ${strikes.at(-1)!.toFixed(2)}%, with none at both bounds of today's range, ${range}.`;
}

/** Polymarket's open market on a US recession that ends soonest after `now`: its yes price, 0 to 100. */
export function parsePolymarketRecession(json: unknown, now: string): RecessionOdds | null {
  const events = (json as { events?: unknown } | null)?.events ?? json;
  if (!Array.isArray(events)) throw new Error("no events");
  const found: RecessionOdds[] = [];
  for (const e of events as Record<string, unknown>[]) {
    const title = typeof e.title === "string" ? e.title : "";
    if (!/recession/i.test(title) || !/\bUS\b|U\.S\.|United States|America/i.test(title) || e.closed === true) continue;
    const ends = typeof e.endDate === "string" ? e.endDate : null;
    if (ends && ends < now) continue;
    const market = (Array.isArray(e.markets) ? (e.markets as Record<string, unknown>[]) : []).find((m) => m.closed !== true && typeof m.outcomePrices === "string");
    if (!market) continue;
    try {
      const yes = yesOf(market);
      if (yes === null || typeof e.slug !== "string") continue;
      found.push({ title: title.slice(0, 200), yes: round1(yes), ends: ends?.slice(0, 10) ?? null, url: POLYMARKET_EVENT(e.slug) });
    } catch {
      continue;
    }
  }
  return found.sort((a, b) => (a.ends ?? "9999").localeCompare(b.ends ?? "9999"))[0] ?? null;
}
