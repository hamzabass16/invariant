import { z } from "zod";

import { marketDaySchema, newYorkClock, type BookDay, type DayMove, type IndexDay, type MarketDay } from "@/lib/market-day";

/**
 * Prices while the US market is open, and the last session's after it.
 * Everything else in the app is read at a close; this is the one layer that
 * moves during the session: each listed holding's price now, and from it net
 * worth, the day's move, weights and the caps, worked out in the page from
 * the book it already has. After the bell the same layer keeps the session's
 * closing prices (`lastSession`), so a card never falls back to the
 * statement, and its badge names the session (Hamza, 17 Oct 2026). Nothing
 * here is kept: the vault, the alerts and the reviews still read the close.
 * Pure: the clock, the parser and the arithmetic; lib/markets-feed.ts
 * fetches (`loadLive`) and app/api/live serves it to a signed-in page.
 */

/** The regular session in New York, in minutes after midnight: 09:30 to 16:00. */
export const MARKET_OPEN_MINUTES = 9 * 60 + 30;
export const MARKET_CLOSE_MINUTES = 16 * 60;
/** How often an open page asks for prices; the feed keeps each price this long, so every page in the same half minute shares one read. */
export const LIVE_POLL_SECONDS = 30;
/** How often a page asks while the market is shut: the last session's closes do not move, so once on opening the page and then rarely. */
export const LIVE_CLOSED_POLL_SECONDS = 10 * 60;
/** How often a page left open asks the server for itself again, in minutes (Hamza, 17 Oct 2026). */
export const OPEN_PAGE_REFRESH_MINUTES = 5;
/** The most symbols one request may name. */
export const LIVE_MAX_SYMBOLS = 60;
/** A price further than this from the book's own price is taken for another listing or a split, and not used. */
const PLAUSIBLE = { low: 0.5, high: 2 };

/** True on a trading day between 09:30 and the close in New York (13:00 on an early close); never on a weekend or a listed holiday. */
export function isTradingHours(now: Date): boolean {
  const ny = newYorkClock(now);
  if (!isTradingDay(ny)) return false;
  return ny.minutes >= MARKET_OPEN_MINUTES && ny.minutes < closeMinutesOf(ny.date);
}

/**
 * The days NYSE and Nasdaq are shut, and the days they close at 13:00, as
 * NYSE publishes them through 2027. Only the countdown reads them; past the
 * last year it counts every weekday, so the list is extended each year.
 */
export const MARKET_HOLIDAYS: readonly string[] = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
];
export const MARKET_EARLY_CLOSES: readonly string[] = ["2026-11-27", "2026-12-24", "2027-11-26"];
const EARLY_CLOSE_MINUTES = 13 * 60;

const isTradingDay = (ny: { date: string; weekday: string }) => ny.weekday !== "Sat" && ny.weekday !== "Sun" && !MARKET_HOLIDAYS.includes(ny.date);
/** The minute of the day in New York the session closes on a date: 16:00, 13:00 on an early close. */
export const closeMinutesOf = (date: string) => (MARKET_EARLY_CLOSES.includes(date) ? EARLY_CLOSE_MINUTES : MARKET_CLOSE_MINUTES);

/** How near the countdown starts: two hours before the open and before the close (Hamza, 15 Oct 2026). */
export const COUNTDOWN_MINUTES = 120;

export type MarketCountdown = { to: "open" | "close"; seconds: number; early: boolean };

/**
 * The countdown to the US open or close when one is within two hours, by the
 * New York clock: none on a weekend or a holiday, and to 13:00 on an early
 * close. Seconds are the same in every zone, so they come from the instant.
 */
export function marketCountdown(now: Date): MarketCountdown | null {
  const ny = newYorkClock(now);
  if (ny.weekday === "Sat" || ny.weekday === "Sun" || MARKET_HOLIDAYS.includes(ny.date)) return null;
  const early = MARKET_EARLY_CLOSES.includes(ny.date);
  const close = early ? EARLY_CLOSE_MINUTES : MARKET_CLOSE_MINUTES;
  const at = ny.minutes * 60 + now.getUTCSeconds();
  for (const [to, minutes] of [["open", MARKET_OPEN_MINUTES], ["close", close]] as const) {
    const seconds = minutes * 60 - at;
    if (seconds > 0 && seconds <= COUNTDOWN_MINUTES * 60) return { to, seconds, early: to === "close" && early };
  }
  return null;
}

/** How long after the close the top right still counts the time since it, before it only says the market has closed (Hamza, 15 Oct 2026). */
export const CLOSED_AGO_MINUTES = 120;

/** Seconds since today's close in New York when the market closed today and has not opened since; null during the session, before the open, and on a day with no session. */
export function sinceClose(now: Date): number | null {
  const ny = newYorkClock(now);
  if (!isTradingDay(ny)) return null;
  const seconds = ny.minutes * 60 + now.getUTCSeconds() - closeMinutesOf(ny.date) * 60;
  return seconds >= 0 ? seconds : null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const weekdayWord = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

/**
 * The New York date of the last session that has opened: today once the
 * bell has rung on a trading day, otherwise the trading day before (Friday
 * through the weekend, the day before a holiday). The live layer reads
 * prices against it, so after the close the last session's prices stay on
 * every card and the badge names that day, instead of falling back to the
 * statement (Hamza, 17 Oct 2026: on Saturday the cards had gone back to the
 * 15 Oct statement and said "Markets have closed · 15 Oct").
 */
export function lastSession(now: Date): string {
  const ny = newYorkClock(now);
  if (isTradingDay(ny) && ny.minutes >= MARKET_OPEN_MINUTES) return ny.date;
  let date = ny.date;
  do date = dayBefore(date);
  while (!isTradingDay({ date, weekday: weekdayWord(date) }));
  return date;
}

/** The trading day before a New York date: the session whose close a quote's previous close is. */
export function sessionBefore(date: string): string {
  let d = date;
  do d = dayBefore(d);
  while (!isTradingDay({ date: d, weekday: weekdayWord(d) }));
  return d;
}

/** "42 min ago", "1 h ago", "1 h 05 min ago". */
export function agoText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (!h) return `${m} min ago`;
  return m ? `${h} h ${String(m).padStart(2, "0")} min ago` : `${h} h ago`;
}

const DAY_WORDS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** The next US open after `now`, as a New York date and the word for it ("tomorrow", "Monday"), skipping weekends and holidays. */
export function nextOpen(now: Date): { date: string; when: string } {
  const ny = newYorkClock(now);
  let date = ny.date;
  let days = 0;
  if (isTradingDay(ny) && ny.minutes < MARKET_OPEN_MINUTES) return { date, when: "today" };
  do {
    date = new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    days += 1;
  } while (!isTradingDay({ date, weekday: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] }));
  return { date, when: days === 1 ? "tomorrow" : DAY_WORDS[WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]] };
}

/** 1:05:09, or 42:10 under an hour. */
export function countdownText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The New York date of an instant in seconds since 1970. */
export const newYorkDateOf = (seconds: number) => newYorkClock(new Date(seconds * 1000)).date;

export const liveQuoteSchema = z.object({
  symbol: z.string(),
  price: z.number().positive(),
  prevClose: z.number().positive(),
  /** As the exchange quotes it: "USD", "EUR", "GBp" (pence); null when the feed does not say. */
  currency: z.string().nullable(),
  /** The last trade, seconds since 1970. */
  time: z.number(),
});
export type LiveQuote = z.infer<typeof liveQuoteSchema>;

export const liveAnswerSchema = z.object({
  open: z.boolean(),
  quotes: z.array(liveQuoteSchema),
  indices: z.array(z.object({ symbol: z.string(), name: z.string(), about: z.string(), close: z.number(), prevClose: z.number(), changePct: z.number(), points: z.array(z.object({ t: z.number(), v: z.number() })) })),
  problems: z.array(z.string()),
});
export type LiveAnswer = z.infer<typeof liveAnswerSchema>;

const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z
            .object({
              currency: z.string().nullish(),
              regularMarketPrice: z.number().nullish(),
              regularMarketTime: z.number().nullish(),
              previousClose: z.number().nullish(),
              chartPreviousClose: z.number().nullish(),
            })
            .passthrough(),
          timestamp: z.array(z.number()).nullish(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()).nullish() })) }),
        }),
      )
      .nullable(),
  }),
});

/**
 * A Yahoo Finance chart of the day (range=1d) as a quote: the last price,
 * the close before, the currency, the time of the last trade, and the
 * five-minute prices for a line. Throws when it is not a chart or has no
 * price or no close before.
 */
export function parseYahooQuote(symbol: string, text: string): LiveQuote & { points: { t: number; v: number }[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not a Yahoo chart");
  }
  const r = chartSchema.safeParse(json);
  const res = r.success ? r.data.chart.result?.[0] : null;
  if (!res) throw new Error("not a Yahoo chart");
  const m = res.meta;
  const prevClose = m.previousClose ?? m.chartPreviousClose ?? null;
  const closes = res.indicators.quote[0]?.close ?? [];
  const points: { t: number; v: number }[] = [];
  (res.timestamp ?? []).forEach((t, i) => {
    const v = closes[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) points.push({ t, v });
  });
  points.sort((a, b) => a.t - b.t);
  const price = m.regularMarketPrice ?? points[points.length - 1]?.v ?? null;
  const time = m.regularMarketTime ?? points[points.length - 1]?.t ?? null;
  if (!price || price <= 0) throw new Error("no price");
  if (!prevClose || prevClose <= 0) throw new Error("no previous close");
  if (!time) throw new Error("no time");
  return { symbol, price, prevClose, currency: m.currency ?? null, time, points };
}

/** An index's quote as the index cards draw it. */
export function indexNow(def: { symbol: string; name: string; about: string }, q: LiveQuote & { points: { t: number; v: number }[] }): IndexDay {
  return { symbol: def.symbol, name: def.name, about: def.about, close: q.price, prevClose: q.prevClose, changePct: Math.round(((q.price - q.prevClose) / q.prevClose) * 1e6) / 1e4, points: q.points };
}

/** A listed holding as the page hands it to the live layer: its value to the owner in the base currency at the book's price, that price and its currency, and its cap. */
export type LiveSubject = { symbol: string; name: string; value: number; price: number; currency: string; cap: number | null; capSection: string | null };

/** The listed holdings of a book's weights that carry a price: shares and funds, one per symbol. */
export function liveSubjects(weights: readonly { symbol: string; name: string; value: number; cap: { cap: number; rule: { section: string } } | null; holdings: readonly { assetClass: string; price: number | null; currency: string }[] }[]): LiveSubject[] {
  const out: LiveSubject[] = [];
  for (const w of weights) {
    const lead = w.holdings[0];
    if (!lead || (lead.assetClass !== "equity" && lead.assetClass !== "etf") || !lead.price || !(lead.price > 0) || !(w.value > 0)) continue;
    out.push({ symbol: w.symbol, name: w.name, value: w.value, price: lead.price, currency: lead.currency, cap: w.cap?.cap ?? null, capSection: w.cap?.rule.section ?? null });
  }
  return out;
}

export type LiveRow = BookDay["rows"][number] & { price: number; currency: string; cap: number | null; capSection: string | null; over: boolean };

/** The book at the last session's prices (now, while the market is open). `weight` is each holding's share of net worth now; `contribution` is its share at the close before times its move, as on the last session's card; `session` is the New York date the prices are from. */
export type LiveBook = Omit<BookDay, "rows"> & {
  rows: LiveRow[];
  /** The last trade among the prices used, as an ISO instant. */
  asOf: string;
  /** Net worth now less net worth at the book's own prices, base currency. */
  sinceBook: number;
  /** Listed holdings whose price could not be used, with why. */
  left: { symbol: string; why: string }[];
};

/**
 * Lays today's prices on the book. Each holding's value moves by its price
 * against the book's own price for it (so its currency and the owner's share
 * stay as the book has them, and the exchange rate as the book read it); its
 * day is its price against the close before. Net worth moves by the
 * difference; cash, funds, bonds, options and private assets stay as the book
 * has them. A price from before the last session (`lastSession`: today once
 * the market has opened, else the trading day before, so after the close the
 * session's closing prices stay), in another currency, or too far from the
 * book's price is not used and is named. Null when no price is from that
 * session: the market has not traded yet, or the feed did not answer.
 */
export function liveBook(subjects: readonly LiveSubject[], netWorth: number, quotes: readonly LiveQuote[], now: Date): LiveBook | null {
  if (!(netWorth > 0) || !subjects.length) return null;
  const today = lastSession(now);
  const openNow = newYorkClock(now).date === today;
  const bySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  const used: { s: LiveSubject; q: LiveQuote; valueNow: number; valueBefore: number }[] = [];
  const left: LiveBook["left"] = [];
  for (const s of subjects) {
    const q = bySymbol.get(s.symbol.toUpperCase());
    if (!q) {
      left.push({ symbol: s.symbol, why: "no price came back" });
      continue;
    }
    if (newYorkDateOf(q.time) !== today) {
      left.push({ symbol: s.symbol, why: openNow ? "no trade yet today" : "no trade in the last session" });
      continue;
    }
    if (q.currency && q.currency !== s.currency) {
      left.push({ symbol: s.symbol, why: `quoted in ${q.currency}, held in ${s.currency}` });
      continue;
    }
    const ratio = q.price / s.price;
    if (ratio < PLAUSIBLE.low || ratio > PLAUSIBLE.high) {
      left.push({ symbol: s.symbol, why: "the price is far from the book's; another listing or a split" });
      continue;
    }
    const valueNow = s.value * ratio;
    used.push({ s, q, valueNow, valueBefore: valueNow * (q.prevClose / q.price) });
  }
  if (!used.length) return null;
  const sinceBook = used.reduce((t, u) => t + (u.valueNow - u.s.value), 0);
  const worthNow = netWorth + sinceBook;
  const change = used.reduce((t, u) => t + (u.valueNow - u.valueBefore), 0);
  const worthBefore = worthNow - change;
  const rows: LiveRow[] = used.map(({ s, q, valueNow, valueBefore }) => {
    const changePct = Math.round(((q.price - q.prevClose) / q.prevClose) * 1e6) / 1e4;
    const weight = (valueNow / worthNow) * 100;
    return {
      symbol: s.symbol,
      name: s.name,
      price: q.price,
      currency: s.currency,
      value: Math.round(valueNow * 100) / 100,
      weight: Math.round(weight * 1e4) / 1e4,
      changePct,
      contribution: Math.round(((valueNow - valueBefore) / worthBefore) * 100 * 1e5) / 1e5,
      change: Math.round((valueNow - valueBefore) * 100) / 100,
      cap: s.cap,
      capSection: s.capSection,
      over: s.cap !== null && weight > s.cap,
    };
  });
  rows.sort((a, b) => b.contribution - a.contribution || a.symbol.localeCompare(b.symbol));
  const latest = Math.max(...used.map((u) => u.q.time));
  return {
    session: today,
    netWorth: Math.round(worthNow * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePct: Math.round((change / worthBefore) * 100 * 1e4) / 1e4,
    rows,
    pricedPct: Math.round((used.reduce((t, u) => t + u.valueNow, 0) / worthNow) * 100 * 100) / 100,
    unpriced: left.map((l) => l.symbol),
    asOf: new Date(latest * 1000).toISOString(),
    sinceBook: Math.round(sinceBook * 100) / 100,
    left,
  };
}

// ---------------------------------------------------------------------------
// The session so far

/** How often a page asks for the session so far: every company of the S&P 500 and the Nasdaq-100 is one read, shared by everyone. */
export const LIVE_SESSION_POLL_SECONDS = 60;
/** Symbols in one spark request. */
export const SPARK_BATCH = 20;
/** Below this share of the kept session's companies priced now, the session so far is not drawn and the last close stays. */
const LIVE_SESSION_MIN_SHARE = 0.6;

const sparkPoint = z.object({ symbol: z.string().nullish(), timestamp: z.array(z.number()).nullish(), close: z.array(z.number().nullable()).nullish(), chartPreviousClose: z.number().nullish(), previousClose: z.number().nullish() }).passthrough();
const sparkResult = z.object({
  spark: z.object({
    result: z
      .array(
        z.object({
          symbol: z.string(),
          response: z.array(
            z.object({
              meta: z.object({ regularMarketPrice: z.number().nullish(), regularMarketTime: z.number().nullish(), previousClose: z.number().nullish(), chartPreviousClose: z.number().nullish() }).passthrough(),
              timestamp: z.array(z.number()).nullish(),
              indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()).nullish() })) }).nullish(),
            }),
          ),
        }),
      )
      .nullable(),
  }),
});

export type SparkQuote = { price: number; prevClose: number; time: number };

/**
 * Yahoo Finance's spark answer for up to twenty symbols as quotes: the last
 * price, the close before and the time of the last trade, by symbol as asked.
 * Reads both shapes Yahoo sends (a map by symbol, or `spark.result`); a
 * symbol with no price or no close before is left out. Throws when the answer
 * is neither shape.
 */
export function parseYahooSpark(text: string): Map<string, SparkQuote> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not a Yahoo spark");
  }
  const out = new Map<string, SparkQuote>();
  const keep = (symbol: string, closes: readonly (number | null)[], times: readonly number[], price: number | null | undefined, time: number | null | undefined, prevClose: number | null | undefined) => {
    let last: { t: number; v: number } | null = null;
    times.forEach((t, i) => {
      const v = closes[i];
      if (typeof v === "number" && Number.isFinite(v) && v > 0 && (!last || t >= last.t)) last = { t, v };
    });
    const p = price ?? (last as { t: number; v: number } | null)?.v ?? null;
    const at = time ?? (last as { t: number; v: number } | null)?.t ?? null;
    if (p && p > 0 && prevClose && prevClose > 0 && at) out.set(symbol.toUpperCase(), { price: p, prevClose, time: at });
  };
  const v7 = sparkResult.safeParse(json);
  if (v7.success) {
    for (const r of v7.data.spark.result ?? []) {
      const res = r.response[0];
      if (!res) continue;
      keep(r.symbol, res.indicators?.quote[0]?.close ?? [], res.timestamp ?? [], res.meta.regularMarketPrice, res.meta.regularMarketTime, res.meta.chartPreviousClose ?? res.meta.previousClose);
    }
    return out;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("not a Yahoo spark");
  let any = false;
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    const r = sparkPoint.safeParse(value);
    if (!r.success) continue;
    any = true;
    keep(r.data.symbol ?? key, r.data.close ?? [], r.data.timestamp ?? [], null, null, r.data.chartPreviousClose ?? r.data.previousClose);
  }
  if (!any && Object.keys(json as object).length) throw new Error("not a Yahoo spark");
  return out;
}

/**
 * The session so far, in the shape of a closed one, so the same cards draw
 * it: the kept session's companies (their sectors, market values and lists)
 * at their prices now against the close before, the indices so far, and QQQ.
 * A price from before the last session in New York is not used. Null when
 * too few companies are priced in it (before the first trades, a feed that
 * did not answer), so the kept close stays on screen.
 */
export function liveSession(kept: MarketDay, quotes: ReadonlyMap<string, SparkQuote>, indices: readonly IndexDay[], now: Date): MarketDay | null {
  const today = lastSession(now);
  const fresh = (q: SparkQuote | undefined) => (q && newYorkClock(new Date(q.time * 1000)).date === today ? q : null);
  const move = <T extends DayMove | MarketDay["others"][number]>(m: T): T | null => {
    const q = fresh(quotes.get(m.symbol.toUpperCase()));
    return q ? { ...m, close: q.price, prevClose: q.prevClose, changePct: Math.round(((q.price - q.prevClose) / q.prevClose) * 1e6) / 1e4 } : null;
  };
  const moves = kept.moves.map(move).filter((m): m is DayMove => !!m);
  if (!kept.moves.length || moves.length < kept.moves.length * LIVE_SESSION_MIN_SHARE) return null;
  const others = kept.others.map(move).filter((m): m is MarketDay["others"][number] => !!m);
  const q = fresh(quotes.get("QQQ"));
  const missed = kept.moves.length - moves.length;
  return marketDaySchema.parse({
    ...kept,
    session: today,
    readAt: now.toISOString(),
    source: `Yahoo Finance prices now; the lists, sectors and market values as read at the close of ${kept.session}`,
    moves,
    others,
    indices: indices.length ? indices : [],
    qqq: q ? { symbol: "QQQ", name: "Invesco QQQ Trust", close: q.price, prevClose: q.prevClose, changePct: Math.round(((q.price - q.prevClose) / q.prevClose) * 1e6) / 1e4 } : null,
    problems: missed ? [`${missed} of ${kept.moves.length} companies have no price ${newYorkClock(now).date === today ? "yet today" : "from the last session"}.`] : [],
  });
}

export const liveSessionAnswerSchema = z.object({ open: z.boolean(), day: marketDaySchema.nullable(), problems: z.array(z.string()) });
export type LiveSessionAnswer = z.infer<typeof liveSessionAnswerSchema>;

// ---------------------------------------------------------------------------
// This year, live

/** This year's path of a series: the last close of last year and the last point before `today` (a New York date). */
export type YearBase = { base: number; baseDate: string; last: number; lastDate: string };

/**
 * The base for a return this year: the last point of last year and the last
 * point before today, so today's move is laid on once (`withToday` for the
 * book's own value series, whose last point is the statement the live net
 * worth is measured from). Null when the series
 * has no point before this year or none this year before today.
 */
export function yearBase(points: readonly { date: string; value: number }[], today: string, withToday = false): YearBase | null {
  const start = `${today.slice(0, 4)}-01-01`;
  const sorted = points.filter((p) => p.value > 0 && (withToday ? p.date <= today : p.date < today)).sort((a, b) => a.date.localeCompare(b.date));
  const before = sorted.filter((p) => p.date < start).at(-1);
  const last = sorted.at(-1);
  if (!before || !last || last.date < start) return null;
  return { base: before.value, baseDate: before.date, last: last.value, lastDate: last.date };
}

/** A return this year in percent: the base's path, times today's own move as a ratio (1 when there is none). */
export const yearReturn = (b: YearBase, today = 1) => Math.round((((b.last / b.base) * today - 1) * 100) * 100) / 100;

export type YearCell = { key: "SPY" | "book" | "QQQ"; label: string; pct: number | null; live: boolean; asOf: string | null };
export type YearStrip = { cells: [YearCell, YearCell, YearCell]; spreads: [number | null, number | null] };

/**
 * The Dashboard's year strip (Hamza, 15 Oct 2026): SPY, the book, QQQ, each
 * its return this year, and the book's lead over each in percentage points.
 * While the market is open each moves with today's price: a benchmark by its
 * quote against yesterday's close, the book by its net worth now against the
 * statement's; after the close, with the last session's. A quote from before
 * the last session is not used, and a quote for a session the series already
 * carries is not laid on twice. `asOf` is the day each cell is to.
 */
export function yearStrip(bases: { book: YearBase | null; SPY: YearBase | null; QQQ: YearBase | null }, live: { bookRatio: number | null; quotes: readonly LiveQuote[] } | null, now: Date): YearStrip {
  const today = lastSession(now);
  // A quote is laid on a series only up to the session before it; a series that already carries the session's close is left as it is.
  const ratioOf = (symbol: string, b: YearBase | null) => {
    const q = live?.quotes.find((x) => x.symbol.toUpperCase() === symbol);
    return b && b.lastDate < today && q && newYorkDateOf(q.time) === today ? q.price / q.prevClose : null;
  };
  const bench = (key: "SPY" | "QQQ"): YearCell => {
    const b = bases[key];
    const r = ratioOf(key, b);
    return { key, label: key, pct: b ? yearReturn(b, r ?? 1) : null, live: !!b && r !== null, asOf: b ? (r !== null ? today : b.lastDate) : null };
  };
  const b = bases.book;
  const r = live?.bookRatio ?? null;
  const book: YearCell = { key: "book", label: "Your portfolio", pct: b ? yearReturn(b, r ?? 1) : null, live: !!b && r !== null, asOf: b ? (r !== null ? today : b.lastDate) : null };
  const spy = bench("SPY");
  const qqq = bench("QQQ");
  const spread = (x: YearCell) => (book.pct !== null && x.pct !== null ? Math.round((book.pct - x.pct) * 100) / 100 : null);
  return { cells: [spy, book, qqq], spreads: [spread(spy), spread(qqq)] };
}

// ---------------------------------------------------------------------------
// The book itself at today's prices (Hamza, 16 Oct 2026: everything that can be live is live)

/** The share and fund classes a quote may reprice. */
const PRICED_CLASSES: ReadonlySet<string> = new Set(["equity", "etf"]);

/** Whether a quote may stand in for a price: a trade in the last session, the holding's own currency (or none said), and within reach of the book's price. */
function usableQuote(q: LiveQuote | undefined, price: number | null, currency: string, today: string): q is LiveQuote {
  if (!q || price === null || !(price > 0)) return false;
  if (newYorkDateOf(q.time) !== today) return false;
  if (q.currency && q.currency !== currency) return false;
  const ratio = q.price / price;
  return ratio >= PLAUSIBLE.low && ratio <= PLAUSIBLE.high;
}

type Repriceable = { symbol: string; assetClass: string; price: number | null; value: number; currency: string; dayChange?: number | null };

/**
 * The holdings at today's prices: each share or fund whose quote can be used
 * moves by its price against the book's own, in price, value and the day's
 * change; everything else stays as the book has it. The Dashboard runs the
 * methodology's headline figures on the repriced book in the browser, so
 * nothing of the book leaves the page. `priced` counts the holdings that
 * moved; `session` is the New York date the quotes had to be from (today
 * while the market is open, else the last session, whose closes then stay).
 */
export function repriceHoldings<H extends Repriceable>(holdings: readonly H[], quotes: readonly LiveQuote[], now: Date): { holdings: H[]; priced: number; session: string } {
  const today = lastSession(now);
  const bySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  let priced = 0;
  const out = holdings.map((h) => {
    if (!PRICED_CLASSES.has(h.assetClass)) return h;
    const q = bySymbol.get(h.symbol.toUpperCase());
    if (!usableQuote(q, h.price, h.currency, today)) return h;
    priced += 1;
    const ratio = q.price / h.price!;
    const value = h.value * ratio;
    return { ...h, price: q.price, value, dayChange: value * (1 - q.prevClose / q.price) };
  });
  return { holdings: out, priced, session: today };
}

/**
 * The book with the last session laid on its value series, so returns, risk,
 * the drawdown and the day statistics read today while the US market is open
 * and the session's closes after it (Hamza, 19 Oct 2026: every card that can
 * be live is live). The holdings are repriced (`repriceHoldings`); the account
 * value gains one point for the session, the last one times the move of the
 * priced book (`ratio`: net worth now over net worth at the book's prices,
 * as the Dashboard's return chart takes it); each benchmark whose last point is
 * the session before gains the session's move from its own quote. Null when
 * nothing was priced or the series already holds the session (the evening
 * statement), so the book as kept stands. Nothing is kept.
 */
export function liveSeriesBook<B extends { asOf: string; holdings: readonly Repriceable[]; series?: { nav: { date: string; value: number }[]; benchmarks: Record<string, { date: string; value: number }[]> } }>(book: B, ratio: number | null, quotes: readonly LiveQuote[], now: Date): (B & { session: string }) | null {
  const nav = book.series?.nav ?? [];
  const last = nav[nav.length - 1];
  if (!book.series || !last || ratio === null || !(ratio > 0)) return null;
  const { holdings, priced, session } = repriceHoldings(book.holdings, quotes, now);
  if (!priced || session <= last.date) return null;
  const bySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  const benchmarks: Record<string, { date: string; value: number }[]> = {};
  for (const [k, pts] of Object.entries(book.series.benchmarks)) {
    const end = pts[pts.length - 1];
    const q = bySymbol.get(k.toUpperCase());
    benchmarks[k] = end && end.date >= last.date && end.date === sessionBefore(session) && q && newYorkDateOf(q.time) === session ? [...pts, { date: session, value: end.value * (q.price / q.prevClose) }] : pts;
  }
  return { ...book, asOf: session, holdings, series: { ...book.series, nav: [...nav, { date: session, value: last.value * ratio }], benchmarks }, session };
}

type PositionRowLike = { symbol: string; assetClass: string; last: number | null; currency: string; value: number; cost: number | null; avgPrice: number | null; dayPct: number | null; ytdPct: number | null; sixMonthPct: number | null; sinceBoughtPct: number | null; dayPnl: number | null; unrealizedPnl: number | null };
type PositionsLike<R extends PositionRowLike> = { rows: R[]; cash: { value: number }[]; total: { value: number; cost: number | null; dayPnl: number | null; unrealizedPnl: number | null; cash: number } };

/**
 * The positions table at today's prices: each share or fund with a usable
 * quote takes the price now, its value, day, gain and the changes since the
 * year's and six months' closes move with it, and the totals are summed
 * again; after the close the last session's prices stay, and `session`
 * names that day. Rows the quotes do not cover stay at the close. Null when
 * no row moved, so the table at the close stays.
 */
export function livePositions<R extends PositionRowLike, P extends PositionsLike<R>>(positions: P, quotes: readonly LiveQuote[], now: Date): (P & { priced: number; session: string }) | null {
  const today = lastSession(now);
  const bySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  let priced = 0;
  const rows = positions.rows.map((r) => {
    if (!PRICED_CLASSES.has(r.assetClass)) return r;
    const q = bySymbol.get(r.symbol.toUpperCase());
    if (!usableQuote(q, r.last, r.currency, today)) return r;
    priced += 1;
    const ratio = q.price / r.last!;
    const value = r.value * ratio;
    const dayPct = Math.round(((q.price - q.prevClose) / q.prevClose) * 1e6) / 1e4;
    const grow = (pct: number | null) => (pct === null ? null : Math.round(((1 + pct / 100) * ratio - 1) * 1e6) / 1e4);
    return {
      ...r,
      last: q.price,
      value: Math.round(value * 100) / 100,
      dayPct,
      dayPnl: Math.round(value * (1 - q.prevClose / q.price) * 100) / 100,
      unrealizedPnl: r.cost === null ? null : Math.round((value - r.cost) * 100) / 100,
      sinceBoughtPct: r.avgPrice && r.avgPrice > 0 ? Math.round((q.price / r.avgPrice - 1) * 1e6) / 1e4 : grow(r.sinceBoughtPct),
      ytdPct: grow(r.ytdPct),
      sixMonthPct: grow(r.sixMonthPct),
    };
  });
  if (!priced) return null;
  const sum = (pick: (r: R) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  };
  const cash = positions.cash.reduce((s, c) => s + c.value, 0);
  return { ...positions, rows, priced, session: today, total: { ...positions.total, value: Math.round((rows.reduce((s, r) => s + r.value, 0) + cash) * 100) / 100, dayPnl: sum((r) => r.dayPnl), unrealizedPnl: sum((r) => r.unrealizedPnl) } };
}
