import { z } from "zod";

import type { MarketPoint } from "@/lib/markets";
import { SECTORS } from "@/lib/sectors";

/**
 * The last US session, read once it has closed: how every S&P 500 company
 * moved (the heat map and the top movers) and how the four US indices traded
 * through the day. Nothing here reads a portfolio: the companies are the
 * index's, from its public constituents list, and the prices are public
 * closes. A session is read only after 16:20 New York time, so a figure is
 * always a close, never a price in the middle of the day; until the next
 * close the screen keeps the last one. Pure: the clock, the parsers, the
 * moves, the movers and the sectors; lib/markets-feed.ts fetches.
 */

/** Minutes after midnight in New York from which a session's close is read: the close at 16:00 plus twenty minutes for the last prints. */
export const CLOSE_READ_MINUTES = 16 * 60 + 20;

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });

/** The date, the minutes after midnight and the weekday in New York. */
export function newYorkClock(now: Date): { date: string; minutes: number; weekday: string } {
  const parts = Object.fromEntries(NY.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: parts.weekday };
}

const dayBefore = (date: string, days = 1) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * The latest weekday whose session has closed by the clock: today in New
 * York from 16:20, otherwise the weekday before. A holiday is not in this
 * calendar; the index's own closes settle it (`sessionOf`), so no table of
 * holidays can go stale.
 */
export function closedBy(now: Date): string {
  const ny = newYorkClock(now);
  let d = ny.minutes >= CLOSE_READ_MINUTES ? ny.date : dayBefore(ny.date);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = dayBefore(d);
  return d;
}

/** The session the closes say was the last on or before `by`: the newest date in the series that is not after it; null for none. */
export function sessionOf(points: readonly MarketPoint[], by: string): string | null {
  let best: string | null = null;
  for (const p of points) if (p.date <= by && (!best || p.date > best)) best = p.date;
  return best;
}

/** The moment a session closed, 16:00 in New York, as an ISO instant in UTC. */
export function closeInstant(session: string): string {
  // New York is four or five hours behind UTC; the hour that reads 16:00 there is the close.
  for (const h of [20, 21]) {
    const at = new Date(`${session}T${h}:00:00Z`);
    const ny = newYorkClock(at);
    if (ny.date === session && ny.minutes === 16 * 60) return at.toISOString();
  }
  return new Date(`${session}T20:00:00Z`).toISOString();
}

/** A close and the one before it, and the move between, for a session; null when the series has no close that day or none before it. */
export function moveOn(points: readonly MarketPoint[], session: string): { close: number; prevClose: number; changePct: number } | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const i = sorted.findIndex((p) => p.date === session);
  if (i < 1) return null;
  const close = sorted[i].value;
  const prevClose = sorted[i - 1].value;
  if (!(close > 0) || !(prevClose > 0)) return null;
  return { close, prevClose, changePct: Math.round(((close - prevClose) / prevClose) * 1e6) / 1e4 };
}

// ---------------------------------------------------------------------------
// The shapes

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dayMoveSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  sector: z.enum(SECTORS),
  subIndustry: z.string().nullable(),
  /** Market value in US dollars from the listing exchange's screener; null when it could not be read, and the map then sizes every company alike. */
  cap: z.number().nullable(),
  close: z.number(),
  prevClose: z.number(),
  changePct: z.number(),
});
export type DayMove = z.infer<typeof dayMoveSchema>;
/** A Nasdaq-100 company outside the S&P 500: its list gives no GICS sector, so it has none here; it never draws on the map. */
export const otherMoveSchema = dayMoveSchema.extend({ sector: z.enum(SECTORS).nullable() });
export type OtherMove = z.infer<typeof otherMoveSchema>;

export const intradayPointSchema = z.object({ t: z.number(), v: z.number() });
export const indexDaySchema = z.object({
  symbol: z.string(),
  name: z.string(),
  about: z.string(),
  close: z.number(),
  prevClose: z.number(),
  changePct: z.number(),
  /** Five-minute prices through the session, seconds since 1970 against the level. */
  points: z.array(intradayPointSchema),
});
export type IndexDay = z.infer<typeof indexDaySchema>;

/** A fund's own close and move that session, beside what its companies' moves add up to. */
export const fundDaySchema = z.object({ symbol: z.string(), name: z.string(), close: z.number(), prevClose: z.number(), changePct: z.number() });
export type FundDay = z.infer<typeof fundDaySchema>;

export const marketDaySchema = z.object({
  /** The session these closes are of. */
  session: isoDate,
  readAt: z.string(),
  source: z.string(),
  /** How the heat map sizes a company: by its market value, or all alike when no value could be read. */
  sizeBy: z.enum(["cap", "equal"]),
  /** The companies in the index's list that day. */
  universe: z.number(),
  moves: z.array(dayMoveSchema),
  indices: z.array(indexDaySchema),
  /** The Nasdaq-100's tickers that day, from its public list; QQQ's drivers are its companies' moves. */
  nasdaq100: z.array(z.string()).default([]),
  /** The Nasdaq-100 companies outside the S&P 500, read the same way; never on the heat map. */
  others: z.array(otherMoveSchema).default([]),
  /** QQQ's own close and move, to set beside what its companies add up to. */
  qqq: fundDaySchema.nullable().default(null),
  /** One sentence per thing that could not be read; a company with no close is counted, never named one by one. */
  problems: z.array(z.string()),
});
export type MarketDay = z.infer<typeof marketDaySchema>;

/**
 * A read whole enough to keep until the next close: most of the S&P 500
 * priced, and the Nasdaq-100's list read, so QQQ's drivers are never left out
 * for a day by one bad read of a list.
 */
export function completeDay(d: MarketDay, share: number): boolean {
  return d.universe > 0 && d.moves.length >= d.universe * share && d.nasdaq100.length > 0;
}

/** The four US indices of the session cards, in the order the recap shows them. */
export const DAY_INDICES = [
  { symbol: "SPX", yahoo: "^GSPC", name: "S&P 500", about: "Standard & Poor's 500" },
  { symbol: "COMP", yahoo: "^IXIC", name: "Nasdaq", about: "Nasdaq Composite" },
  { symbol: "DJI", yahoo: "^DJI", name: "Dow Jones", about: "Dow Jones Industrial Average" },
  { symbol: "IWM", yahoo: "IWM", name: "IWM", about: "iShares Russell 2000 ETF" },
] as const;

// ---------------------------------------------------------------------------
// Parsers

/** Market values by ticker (SEC spelling, BRK-B) from the Nasdaq stock screener's answer. Throws when the answer is not the screener's. */
export function parseNasdaqCaps(text: string): Map<string, number> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not the Nasdaq screener");
  }
  const rows = (json as { data?: { rows?: unknown; table?: { rows?: unknown } } } | null)?.data;
  const list = Array.isArray(rows?.rows) ? rows.rows : Array.isArray(rows?.table?.rows) ? rows.table.rows : null;
  if (!list) throw new Error("not the Nasdaq screener");
  const out = new Map<string, number>();
  for (const r of list as { symbol?: unknown; marketCap?: unknown }[]) {
    if (typeof r?.symbol !== "string") continue;
    const cap = Number(String(r.marketCap ?? "").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(cap) || cap <= 0) continue;
    out.set(r.symbol.trim().toUpperCase().replace(/[/.^]/g, "-"), cap);
  }
  if (!out.size) throw new Error("the Nasdaq screener sent no market values");
  return out;
}

const intradaySchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ chartPreviousClose: z.number().nullish(), previousClose: z.number().nullish() }).passthrough(),
          timestamp: z.array(z.number()).nullish(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()).nullish() })) }),
        }),
      )
      .nullable(),
  }),
});

/** A Yahoo Finance intraday chart: the session's prices by time and the close before it. Throws when the JSON is not a chart or has no previous close. */
export function parseYahooIntraday(text: string): { prevClose: number; points: { t: number; v: number }[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not a Yahoo chart");
  }
  const r = intradaySchema.safeParse(json);
  const res = r.success ? r.data.chart.result?.[0] : null;
  if (!res) throw new Error("not a Yahoo chart");
  const prevClose = res.meta.chartPreviousClose ?? res.meta.previousClose ?? null;
  if (!prevClose || prevClose <= 0) throw new Error("no previous close");
  const closes = res.indicators.quote[0]?.close ?? [];
  const points: { t: number; v: number }[] = [];
  (res.timestamp ?? []).forEach((t, i) => {
    const v = closes[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) points.push({ t, v });
  });
  return { prevClose, points: points.sort((a, b) => a.t - b.t) };
}

// ---------------------------------------------------------------------------
// What the screen draws

/** The ten that rose most and the ten that fell most, by their move that session; a company that did not move is in neither. */
export function movers(day: MarketDay | null, n = 10): { gainers: DayMove[]; losers: DayMove[] } {
  const moves = day?.moves ?? [];
  return {
    gainers: moves.filter((m) => m.changePct > 0).sort((a, b) => b.changePct - a.changePct || a.symbol.localeCompare(b.symbol)).slice(0, n),
    losers: moves.filter((m) => m.changePct < 0).sort((a, b) => a.changePct - b.changePct || a.symbol.localeCompare(b.symbol)).slice(0, n),
  };
}

export type SectorDay = { sector: (typeof SECTORS)[number]; weight: number; changePct: number; up: number; down: number; moves: DayMove[] };

/**
 * The sectors of the map, largest first: each one's weight (its companies'
 * market value, or their count when the map is sized alike), its move
 * weighted the same way, how many rose and fell, and its companies, largest
 * first.
 */
export function sectorsOf(day: MarketDay | null): SectorDay[] {
  const size = (m: DayMove) => (day?.sizeBy === "cap" && m.cap ? m.cap : 1);
  const by = new Map<string, DayMove[]>();
  for (const m of day?.moves ?? []) by.set(m.sector, [...(by.get(m.sector) ?? []), m]);
  return [...by.entries()]
    .map(([sector, moves]) => {
      const weight = moves.reduce((s, m) => s + size(m), 0);
      const changePct = weight ? moves.reduce((s, m) => s + size(m) * m.changePct, 0) / weight : 0;
      return { sector: sector as SectorDay["sector"], weight, changePct: Math.round(changePct * 100) / 100, up: moves.filter((m) => m.changePct > 0).length, down: moves.filter((m) => m.changePct < 0).length, moves: [...moves].sort((a, b) => size(b) - size(a) || a.symbol.localeCompare(b.symbol)) };
    })
    .sort((a, b) => b.weight - a.weight || a.sector.localeCompare(b.sector));
}

/** How many companies rose, fell and did not move that session: the line under the heat map's title. */
export function breadth(day: MarketDay | null): { up: number; down: number; flat: number } {
  const moves = day?.moves ?? [];
  return { up: moves.filter((m) => m.changePct > 0).length, down: moves.filter((m) => m.changePct < 0).length, flat: moves.filter((m) => m.changePct === 0).length };
}

// ---------------------------------------------------------------------------
// What drove the day

/** One company's or holding's part in a day's move: its weight at the close before, its own move, and the two multiplied, in percentage points of the whole. */
export type Driver = { symbol: string; name: string | null; weight: number; changePct: number; contribution: number };

export type IndexDrivers = {
  name: "S&P 500" | "QQQ";
  /** The index's or the fund's own move that session; null when it was not read. */
  actualPct: number | null;
  /** What its companies' moves add up to, each weighted by its market value at the close before. */
  impliedPct: number;
  /** Companies on the list, and how many were priced with a market value. */
  members: number;
  priced: number;
  /** Every priced company, largest contribution first. */
  drivers: Driver[];
};

const issuerOf = (name: string | null, symbol: string) => (name ?? symbol).replace(/\s*\((?:class|series)[^)]*\)\s*$/i, "").trim().toLowerCase();

/**
 * Each company's market value at the close before (its value at the close
 * scaled back by its move). Two share classes of one issuer that the screener
 * gives the same value (within 2%) share it, so the company is counted once.
 */
function valuesBefore(moves: readonly OtherMove[]): { move: OtherMove; before: number }[] {
  const sized = moves.filter((m) => m.cap && m.cap > 0 && m.close > 0);
  const byIssuer = new Map<string, OtherMove[]>();
  for (const m of sized) byIssuer.set(issuerOf(m.name, m.symbol), [...(byIssuer.get(issuerOf(m.name, m.symbol)) ?? []), m]);
  return sized.map((m) => {
    const group = byIssuer.get(issuerOf(m.name, m.symbol)) ?? [m];
    const caps = group.map((g) => g.cap as number);
    const same = group.length > 1 && Math.max(...caps) / Math.min(...caps) <= 1.02;
    const cap = same ? (m.cap as number) / group.length : (m.cap as number);
    return { move: m, before: (cap * m.prevClose) / m.close };
  });
}

/** Weights, contributions and their sum over a set of moves; largest contribution first. */
function driversOver(moves: readonly OtherMove[]): { impliedPct: number; drivers: Driver[] } {
  const rows = valuesBefore(moves);
  const total = rows.reduce((s, r) => s + r.before, 0);
  if (!(total > 0)) return { impliedPct: 0, drivers: [] };
  const drivers = rows
    .map(({ move: m, before }) => {
      const weight = (before / total) * 100;
      return { symbol: m.symbol, name: m.name, weight: Math.round(weight * 1e4) / 1e4, changePct: m.changePct, contribution: Math.round(((weight * m.changePct) / 100) * 1e5) / 1e5 };
    })
    .sort((a, b) => b.contribution - a.contribution || a.symbol.localeCompare(b.symbol));
  return { impliedPct: Math.round(drivers.reduce((s, d) => s + d.contribution, 0) * 1e4) / 1e4, drivers };
}

/**
 * What moved the S&P 500 and QQQ that session: every company's weight at the
 * close before by market value, its move, and the two multiplied. Market
 * values stand in for the index's own float-adjusted (S&P) or modified
 * (Nasdaq-100) weights, so the sum can differ from the index's move by a few
 * hundredths, and both are shown. Nothing when the map was sized alike (no
 * market values) or a list was not read.
 */
export function indexDrivers(day: MarketDay | null): IndexDrivers[] {
  if (!day || day.sizeBy !== "cap") return [];
  const out: IndexDrivers[] = [];
  const spx = driversOver(day.moves);
  if (spx.drivers.length) out.push({ name: "S&P 500", actualPct: day.indices.find((i) => i.symbol === "SPX")?.changePct ?? null, ...spx, members: day.universe, priced: spx.drivers.length });
  const ndx = new Set(day.nasdaq100);
  if (ndx.size) {
    const q = driversOver([...day.moves, ...day.others].filter((m) => ndx.has(m.symbol)));
    if (q.drivers.length) out.push({ name: "QQQ", actualPct: day.qqq?.changePct ?? null, ...q, members: ndx.size, priced: q.drivers.length });
  }
  return out;
}

/** The n that added most and the n that took away most. */
export function topDrivers(drivers: readonly Driver[], n = 8): { up: Driver[]; down: Driver[] } {
  return { up: drivers.filter((d) => d.contribution > 0).slice(0, n), down: drivers.filter((d) => d.contribution < 0).sort((a, b) => a.contribution - b.contribution || a.symbol.localeCompare(b.symbol)).slice(0, n) };
}

/** A holding as the book's day reads it: its symbol, name and value to the owner in the base currency. */
export type BookDayInput = { symbol: string; name: string; value: number };

export type BookDay = {
  session: string;
  /** Net worth as the book gives it, base currency. */
  netWorth: number;
  /** The book's move that session from its priced holdings, in percent of net worth; the rest is held at no change. */
  changePct: number;
  /** The same in the base currency. */
  change: number;
  /** Every priced holding, largest contribution first. */
  rows: (Driver & { value: number; change: number })[];
  /** Share of net worth priced that session. */
  pricedPct: number;
  /** Listed holdings with no close for the session, by symbol. */
  unpriced: string[];
};

/**
 * How the book moved in a session: each listed holding's weight of net worth
 * at the close before, its move that day (from the session's own read when
 * the company is in it, else its own daily closes) and the two multiplied.
 * Cash, deposits, funds, bonds, options and anything without a close that
 * day count as unchanged and are named. A holding's value is taken as at the
 * close before; a book dated the session itself is scaled back by the move.
 */
export function bookDay(holdings: readonly BookDayInput[], netWorth: number, session: string, asOf: string | null, day: MarketDay | null, closes: Record<string, readonly MarketPoint[]>): BookDay | null {
  if (!(netWorth > 0) || !holdings.length) return null;
  const known = new Map([...(day?.moves ?? []), ...(day?.others ?? [])].map((m) => [m.symbol.toUpperCase(), m.changePct]));
  const rows: BookDay["rows"] = [];
  const unpriced: string[] = [];
  for (const h of holdings) {
    const key = h.symbol.toUpperCase();
    const pct = known.get(key) ?? (closes[h.symbol] ?? closes[key] ? (moveOn(closes[h.symbol] ?? closes[key], session)?.changePct ?? null) : null);
    if (pct === null || pct === undefined) {
      unpriced.push(h.symbol);
      continue;
    }
    const before = asOf && asOf >= session ? h.value / (1 + pct / 100) : h.value;
    const weight = (before / netWorth) * 100;
    rows.push({ symbol: h.symbol, name: h.name, value: h.value, weight: Math.round(weight * 1e4) / 1e4, changePct: pct, contribution: Math.round(((weight * pct) / 100) * 1e5) / 1e5, change: Math.round(((before * pct) / 100) * 100) / 100 });
  }
  if (!rows.length) return { session, netWorth, changePct: 0, change: 0, rows, pricedPct: 0, unpriced };
  rows.sort((a, b) => b.contribution - a.contribution || a.symbol.localeCompare(b.symbol));
  const change = rows.reduce((s, r) => s + r.change, 0);
  return { session, netWorth, changePct: Math.round(rows.reduce((s, r) => s + r.contribution, 0) * 1e4) / 1e4, change: Math.round(change * 100) / 100, rows, pricedPct: Math.round(rows.reduce((s, r) => s + r.weight, 0) * 100) / 100, unpriced };
}

/** A contribution as percentage points: +0.12 pt, -0.03 pt. */
export const signedPts = (v: number, digits = 2) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits)} pt`;

/** The move at which a heat-map tile takes its pole's full colour, as the recap's own scale runs: three percent. */
export const MOVE_FULL_AT = 3;
const moveStrength = (pct: number) => Math.min(1, Math.abs(pct) / MOVE_FULL_AT);
/** A heat-map tile's colour: blue up, red down, grey at no move, full colour at MOVE_FULL_AT either way. */
export const moveFill = (pct: number) => (pct === 0 ? "var(--move-mid)" : `color-mix(in oklab, ${pct > 0 ? "var(--move-up)" : "var(--move-down)"} ${Math.round(moveStrength(pct) * 100)}%, var(--move-mid))`);
/** The ink that reads on that colour. */
export const moveInk = (pct: number) => (moveStrength(pct) > 0.5 ? "var(--move-ink)" : "var(--text)");
/** The same colours on another scale: full colour at `full` percent either way (a year's or a lifetime's return). */
export const moveFillAt = (pct: number, full: number) => moveFill((pct / full) * MOVE_FULL_AT);
export const moveInkAt = (pct: number, full: number) => moveInk((pct / full) * MOVE_FULL_AT);

/** A move as the recap writes it: +4.23%, -0.02%. */
export const signedPct = (v: number, digits = 2) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits)}%`;

/** A market value as $1.2T, $340B or $25B. */
export function capWords(cap: number | null): string {
  if (!cap) return "n/a";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(cap >= 1e13 ? 1 : 2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(cap >= 1e11 ? 0 : 1)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

/** The newsletters of the session: those dated since its close (a newsletter's own date, else its arrival), else the latest day's, so the morning before the recap arrives still shows yesterday's. */
export function newslettersSince<D extends { status: string; receivedAt: string; date?: string }>(digests: readonly D[], session: string | null): { since: "close" | "latest"; digests: D[] } {
  const at = (d: D) => d.date ?? d.receivedAt;
  const read = digests.filter((d) => d.status === "read").sort((a, b) => at(b).localeCompare(at(a)));
  if (session) {
    const from = closeInstant(session);
    const after = read.filter((d) => at(d) >= from);
    if (after.length) return { since: "close", digests: after };
  }
  const day = read[0] ? at(read[0]).slice(0, 10) : undefined;
  return { since: "latest", digests: day ? read.filter((d) => at(d).slice(0, 10) === day) : [] };
}
