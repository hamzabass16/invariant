/**
 * Before the open and after the close (Hamza, 4 Nov 2026: "the overnight
 * performance of stocks ... if it's still pre-market, what's pre-market
 * trading looking like, or aftermarket"), and how a company has traded since
 * its results reached the SEC ("right next to the earnings report ... live,
 * whether it's pre-market, after-market, or live in the market right now").
 *
 * Pure: lib/markets-feed.ts reads Yahoo Finance's chart of the last days in
 * five-minute bars with the extended sessions in them, the ticker alone in
 * the URL; this reads it. Every session is read by the New York clock:
 * pre-market from 04:00 to the 09:30 open, the session to 16:00 (13:00 on an
 * early close), after hours to 20:00. A price is the last trade printed;
 * nothing is forecast. Nothing of anyone's book is in here.
 */
import { z } from "zod";

import type { EarningsFile } from "@/lib/earnings";
import type { Book } from "@/lib/holdings";
import { closeMinutesOf, MARKET_OPEN_MINUTES } from "@/lib/live";
import { newYorkClock } from "@/lib/market-day";

/** How long each bar the chart is asked for lasts, in seconds. */
export const BAR_SECONDS = 5 * 60;
/** The chart's reach: five sessions, so a report from last week still has the price when it came out. */
export const EXTENDED_RANGE = "5d";
/** The first minute of pre-market and the last of after hours in New York. */
export const PRE_MARKET_MINUTES = 4 * 60;
export const AFTER_HOURS_END_MINUTES = 20 * 60;
/** How often a page asks while pre-market or after hours trade; the feed keeps each chart this long. */
export const EXTENDED_POLL_SECONDS = 60;
/** The reports a since-the-results tile is drawn for: released within this many days. */
export const SINCE_RESULTS_DAYS = 7;
/** The most symbols one request names. */
export const EXTENDED_MAX_SYMBOLS = 40;

export type Bar = { t: number; v: number };
export type ExtSession = "pre" | "regular" | "post" | "closed";

export type ExtendedChart = {
  symbol: string;
  currency: string | null;
  /** The last regular-session price and when it printed (unix seconds): the close once a session has ended. */
  regular: { price: number; t: number } | null;
  /** Every five-minute bar with a price, pre-market and after hours included, oldest first. */
  bars: Bar[];
};

const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ currency: z.string().nullish(), regularMarketPrice: z.number().nullish(), regularMarketTime: z.number().nullish() }).loose(),
          timestamp: z.array(z.number()).nullish(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()).nullish() }).loose()) }).loose(),
        }).loose(),
      )
      .nullish(),
  }).loose(),
});

/** Yahoo's chart with the extended sessions, read; throws when the text is not one. */
export function parseExtendedChart(symbol: string, text: string): ExtendedChart {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not a Yahoo chart");
  }
  const r = chartSchema.safeParse(json);
  const res = r.success ? r.data.chart.result?.[0] : null;
  if (!res) throw new Error("not a Yahoo chart");
  const closes = res.indicators.quote[0]?.close ?? [];
  const bars: Bar[] = [];
  (res.timestamp ?? []).forEach((t, i) => {
    const v = closes[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) bars.push({ t, v });
  });
  bars.sort((a, b) => a.t - b.t);
  const m = res.meta;
  const regular = m.regularMarketPrice && m.regularMarketPrice > 0 && m.regularMarketTime ? { price: m.regularMarketPrice, t: m.regularMarketTime } : null;
  if (!bars.length && !regular) throw new Error("no prices");
  return { symbol, currency: m.currency ?? null, regular, bars };
}

const WEEKEND = new Set(["Sat", "Sun"]);

/** Which session a moment falls in by the New York clock; a weekend, or the night between 20:00 and 04:00, is closed. */
export function sessionAt(unix: number): ExtSession {
  const ny = newYorkClock(new Date(unix * 1000));
  if (WEEKEND.has(ny.weekday)) return "closed";
  if (ny.minutes >= PRE_MARKET_MINUTES && ny.minutes < MARKET_OPEN_MINUTES) return "pre";
  if (ny.minutes >= MARKET_OPEN_MINUTES && ny.minutes < closeMinutesOf(ny.date)) return "regular";
  if (ny.minutes >= closeMinutesOf(ny.date) && ny.minutes < AFTER_HOURS_END_MINUTES) return "post";
  return "closed";
}

/** The New York date of a moment. */
export const nyDate = (unix: number) => newYorkClock(new Date(unix * 1000)).date;

/** The session a bar traded in: the bar's own start, so the 15:55 bar is the session's last and the 16:00 bar after hours' first. */
const barSession = (b: Bar) => sessionAt(b.t);

/** The last regular-session price on or before a New York date: the feed's own close when it is that day's, else the last regular bar's. */
function regularCloseBy(c: ExtendedChart, day: string, before: boolean): { price: number; t: number } | null {
  const ok = (d: string) => (before ? d < day : d <= day);
  if (c.regular && ok(nyDate(c.regular.t))) {
    // The feed's close is the official one; a later regular bar on an earlier-allowed day would mean the feed's is stale, so the bars are asked too.
    const later = c.bars.filter((b) => barSession(b) === "regular" && ok(nyDate(b.t)) && b.t > c.regular!.t + BAR_SECONDS);
    if (!later.length) return c.regular;
  }
  const last = [...c.bars].reverse().find((b) => barSession(b) === "regular" && ok(nyDate(b.t)));
  return last ? { price: last.v, t: last.t + BAR_SECONDS } : null;
}

export type ExtendedMove = {
  symbol: string;
  session: "pre" | "post";
  price: number;
  /** When the price printed, unix seconds: the bar's end. */
  at: number;
  /** The close it is set against: the session before for pre-market, the day's own close for after hours. */
  close: number;
  closeDay: string;
  pct: number;
};

/**
 * The latest pre-market or after-hours price against the close before it:
 * pre-market against the last session's close, after hours against that
 * day's close. Null while the session trades (the live price is the
 * session's) or when no extended bar has printed since the last close.
 */
export function extendedMove(c: ExtendedChart): ExtendedMove | null {
  const last = c.bars.at(-1);
  if (!last) return null;
  const session = barSession(last);
  if (session !== "pre" && session !== "post") return null;
  const day = nyDate(last.t);
  const close = regularCloseBy(c, day, session === "pre");
  if (!close || !(close.price > 0)) return null;
  return { symbol: c.symbol, session, price: last.v, at: last.t + BAR_SECONDS, close: close.price, closeDay: nyDate(close.t), pct: round2(((last.v - close.price) / close.price) * 100) };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * A New York wall-clock time as the SEC prints an acceptance
 * ("2026-10-30T16:05:23.000Z": New York's clock, whatever the Z says) in unix
 * seconds; null when it is not one.
 */
export function acceptedUnix(accepted: string | null | undefined): number | null {
  const m = accepted?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const wall = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}Z`) / 1000;
  if (!Number.isFinite(wall)) return null;
  // New York is four or five hours behind UTC; the offset whose clock reads the wall time back is the one.
  for (const h of [4, 5]) {
    const t = wall + h * 3600;
    const ny = newYorkClock(new Date(t * 1000));
    if (ny.date === m[1] && ny.minutes === Number(m[2]) * 60 + Number(m[3])) return t;
  }
  return wall + 5 * 3600;
}

export type SinceResults = {
  symbol: string;
  /** The price when the results came out: the last trade before the SEC accepted the release, or the close before it when the chart does not reach back. */
  base: { price: number; at: number; basis: "release" | "close" };
  now: { price: number; at: number; session: ExtSession };
  pct: number;
};

/**
 * How the stock has traded since its results reached the SEC: the last price
 * now (pre-market, the session or after hours) against the last trade before
 * the release was accepted. When the chart does not reach back that far, the
 * close before the results stands in (`before`, the report's own
 * `reaction.from`), and the basis says so. Null when neither is known.
 */
export function sinceResults(c: ExtendedChart, acceptedAt: number | null, before: { price: number; date: string } | null): SinceResults | null {
  const last = c.bars.at(-1);
  const nowPrice = last ? { price: last.v, at: last.t + BAR_SECONDS, session: barSession(last) } : c.regular ? { price: c.regular.price, at: c.regular.t, session: sessionAt(c.regular.t) } : null;
  if (!nowPrice) return null;
  let base: SinceResults["base"] | null = null;
  if (acceptedAt !== null && c.bars.length && c.bars[0].t + BAR_SECONDS <= acceptedAt) {
    const prior = [...c.bars].reverse().find((b) => b.t + BAR_SECONDS <= acceptedAt);
    if (prior) base = { price: prior.v, at: prior.t + BAR_SECONDS, basis: "release" };
  }
  if (!base && before && before.price > 0) base = { price: before.price, at: Date.parse(`${before.date}T20:00:00Z`) / 1000, basis: "close" };
  if (!base) return null;
  // A price from before the release is not a move since it.
  if (acceptedAt !== null && nowPrice.at <= acceptedAt) return null;
  return { symbol: c.symbol, base, now: nowPrice, pct: round2(((nowPrice.price - base.price) / base.price) * 100) };
}

/** What a session is called on a tile. */
export const SESSION_WORDS: Record<ExtSession, string> = { pre: "Pre-market", regular: "In the session", post: "After hours", closed: "Last trade" };

/** True while pre-market or after hours trade, by the New York clock. */
export const extendedOpen = (now: Date) => {
  const s = sessionAt(Math.floor(now.getTime() / 1000));
  return s === "pre" || s === "post";
};

// ---------------------------------------------------------------------------
// The answer the route sends a page

export const extendedAnswerSchema = z.object({
  session: z.enum(["pre", "regular", "post", "closed"]),
  moves: z.array(z.object({ symbol: z.string(), session: z.enum(["pre", "post"]), price: z.number(), at: z.number(), close: z.number(), closeDay: z.string(), pct: z.number(), currency: z.string().nullable() })),
  since: z.array(z.object({ symbol: z.string(), base: z.object({ price: z.number(), at: z.number(), basis: z.enum(["release", "close"]) }), now: z.object({ price: z.number(), at: z.number(), session: z.enum(["pre", "regular", "post", "closed"]) }), pct: z.number(), currency: z.string().nullable() })),
  problems: z.array(z.string()),
});
export type ExtendedAnswer = z.infer<typeof extendedAnswerSchema>;

/** What a page asks for since the results: the symbol, when the SEC accepted the release, and the close before it as kept. */
export const sinceAskSchema = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.\-]{1,12}$/),
  accepted: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/).max(30).nullable(),
  before: z.object({ price: z.number().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable(),
});
export type SinceAsk = z.infer<typeof sinceAskSchema>;

// ---------------------------------------------------------------------------
// Who is asked about

/** The most companies At the Close asks about. */
export const EXTENDED_MAX_SUBJECTS = 40;
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1]}`;
const dayBefore = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * The companies At the Close asks about before the open and after the close:
 * the listed shares and funds held, then the watchlist, each marked with its
 * results day when it reported yesterday or reports today (a kept report or
 * the earnings file's upcoming dates), at most EXTENDED_MAX_SUBJECTS.
 */
export function extendedSubjects(book: Book | null, watch: readonly string[], file: EarningsFile | null, today: string): { symbol: string; name: string; group: "holding" | "watch"; results: string | null }[] {
  const recent = new Set([today, dayBefore(today)]);
  const results = new Map<string, string>();
  for (const r of file?.reports ?? []) if (recent.has(r.date)) results.set(r.symbol.toUpperCase(), r.date);
  for (const u of file?.upcoming ?? []) if (recent.has(u.date)) results.set(u.symbol.toUpperCase(), u.date);
  const out = new Map<string, { symbol: string; name: string; group: "holding" | "watch"; results: string | null }>();
  for (const h of book?.holdings ?? []) {
    const k = h.symbol.toUpperCase();
    if ((h.assetClass !== "equity" && h.assetClass !== "etf") || !SYMBOL.test(k) || out.has(k)) continue;
    const d = results.get(k);
    out.set(k, { symbol: k, name: h.name, group: "holding", results: d ? (d === today ? "today" : shortDay(d)) : null });
  }
  for (const s of watch) {
    const k = s.toUpperCase();
    if (!SYMBOL.test(k) || out.has(k)) continue;
    const d = results.get(k);
    out.set(k, { symbol: k, name: k, group: "watch", results: d ? (d === today ? "today" : shortDay(d)) : null });
  }
  return [...out.values()].slice(0, EXTENDED_MAX_SUBJECTS);
}
