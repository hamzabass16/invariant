import { z } from "zod";

import { nextFomc, type EconEvent } from "@/lib/econ-calendar";
import type { EventBet } from "@/lib/event-odds";
import type { ExtendedAnswer, SinceAsk } from "@/lib/extended-hours";
import type { Closes, MarketPoint } from "@/lib/markets";
import type { Odds } from "@/lib/odds";

/**
 * The demo's market samples, read the way the live feeds are (pure; the
 * files are read in lib/markets-feed.ts and the extended-hours route).
 * Everything here is fictional and says so where a screen shows it.
 */

// ---------------------------------------------------------------------------
// Closes: one calendar of sessions, each symbol's closes from its first day

export const sampleClosesSchema = z.object({
  asOf: z.string(),
  source: z.string(),
  note: z.string().optional(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  series: z.record(z.string(), z.object({ from: z.string(), values: z.array(z.number().positive()) })),
});
export type SampleCloses = z.infer<typeof sampleClosesSchema>;

/** Every symbol's closes as points, each from its own first session. */
export function expandSampleCloses(raw: SampleCloses): Record<string, MarketPoint[]> {
  const out: Record<string, MarketPoint[]> = {};
  for (const [symbol, s] of Object.entries(raw.series)) {
    const start = raw.dates.indexOf(s.from);
    if (start < 0) continue;
    out[symbol] = s.values.map((value, i) => ({ date: raw.dates[start + i], value })).filter((p) => !!p.date);
  }
  return out;
}

const minusDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/**
 * What the live feed would answer: the tickers asked for alone, each over the
 * last `days` calendar days to `today`; a ticker the sample does not carry is
 * a sentence, as a feed's miss is.
 */
export function pickSampleCloses(all: Record<string, MarketPoint[]>, raw: Pick<SampleCloses, "asOf" | "source">, tickers: string, today: string, days: number): Closes {
  const from = minusDays(today, days);
  const series: Record<string, MarketPoint[]> = {};
  const problems: string[] = [];
  for (const symbol of [...new Set(tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean))]) {
    const pts = (all[symbol] ?? []).filter((p) => p.date >= from && p.date <= today);
    if (pts.length) series[symbol] = pts;
    else problems.push(`${symbol}: the demo's sample carries no closes for it.`);
  }
  return { asOf: raw.asOf, source: raw.source, series, problems };
}

// ---------------------------------------------------------------------------
// The prediction markets: the next Fed meeting and each event's own question

const outcomeSchema = z.object({ label: z.string().max(60), p: z.number().min(0).max(1) });
export const sampleBetSchema = z.object({
  source: z.enum(["Kalshi", "Polymarket"]),
  /** The question; {month} is the event's month, {year} its year. */
  title: z.string().max(200),
  url: z.string().url(),
  traded: z.number().nullable(),
  open: z.number().nullable(),
  outcomes: z.array(outcomeSchema).min(1).max(6),
  prices: z.record(z.string(), z.number()).nullable().default(null),
  other: z.object({ source: z.enum(["Kalshi", "Polymarket"]), traded: z.number().nullable(), open: z.number().nullable() }).nullable().default(null),
});
/** Their outcomes in the order a screen draws them (a ladder by its strikes, else the likeliest first). Keyed by the event's kind, or its kind and area ("election:us"), or its kind and short name ("summit:COP31"). */
export const sampleEventBetsSchema = z.record(z.string(), sampleBetSchema);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The sample's bet for an event: by its short name, then its area, then its kind alone; none when the sample has no question for it. */
export function sampleBetFor(bets: z.infer<typeof sampleEventBetsSchema>, e: Pick<EconEvent, "kind" | "area" | "date" | "short">): EventBet | null {
  const b = (e.short ? bets[`${e.kind}:${e.short}`] : undefined) ?? bets[`${e.kind}:${e.area}`] ?? bets[e.kind];
  if (!b) return null;
  const title = b.title.replace("{month}", MONTHS[Number(e.date.slice(5, 7)) - 1]).replace("{year}", e.date.slice(0, 4));
  return { ...b, title, outcomes: b.outcomes, prices: b.prices ?? null, other: b.other ?? null };
}

/** The sample's Fed odds, moved to the next meeting from today, so the meeting priced is never one already past. */
export function sampleOdds(odds: Odds, today: string): Odds {
  const meeting = nextFomc(today)?.date ?? null;
  if (!odds.fed || !meeting || odds.fed.meeting >= today) return odds;
  return { ...odds, fed: { ...odds.fed, meeting }, readAt: `${today}T06:00:00.000Z` };
}

// ---------------------------------------------------------------------------
// Before the open and after the close

export const sampleExtendedSchema = z.object({
  note: z.string().optional(),
  /** The session the prints follow: the book's last. */
  closeDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moves: z.array(z.object({ symbol: z.string(), session: z.enum(["pre", "post"]), price: z.number().positive(), close: z.number().positive(), at: z.string(), currency: z.string().nullable().default("USD") })),
});

const pctOf = (price: number, base: number) => Math.round(((price / base - 1) * 100) * 100) / 100;

/**
 * The demo's answer: the sample's after-hours prints of the book's last
 * session, and since the results the last print against the close before
 * them as the page kept it. The session is "closed", since the prints are a
 * snapshot's.
 */
export function sampleExtendedAnswer(sample: z.infer<typeof sampleExtendedSchema>, symbols: readonly string[], since: readonly SinceAsk[], closes: Record<string, readonly MarketPoint[]>): ExtendedAnswer {
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const moves = sample.moves
    .filter((m) => wanted.has(m.symbol.toUpperCase()))
    .map((m) => ({ symbol: m.symbol, session: m.session, price: m.price, at: unix(m.at), close: m.close, closeDay: sample.closeDay, pct: pctOf(m.price, m.close), currency: m.currency ?? "USD" }));
  const out: ExtendedAnswer["since"] = [];
  for (const a of since) {
    const sym = a.symbol.toUpperCase();
    const print = sample.moves.find((m) => m.symbol.toUpperCase() === sym);
    const last = closes[sym]?.at(-1);
    const now = print ? { price: print.price, at: unix(print.at), session: "closed" as const } : last ? { price: last.value, at: unix(`${last.date}T21:00:00Z`), session: "closed" as const } : null;
    const before = a.before ?? (a.accepted ? (() => {
      const pts = closes[sym] ?? [];
      const prior = [...pts].reverse().find((p) => p.date < a.accepted!.slice(0, 10));
      return prior ? { price: prior.value, date: prior.date } : null;
    })() : null);
    if (!now || !before) continue;
    out.push({ symbol: a.symbol, base: { price: before.price, at: unix(`${before.date}T21:00:00Z`), basis: "close" }, now, pct: pctOf(now.price, before.price), currency: print?.currency ?? "USD" });
  }
  return { session: "closed", moves, since: out, problems: [] };
}
