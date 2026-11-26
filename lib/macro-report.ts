/**
 * A report after each macro event (Hamza, 27 Oct 2026: "The macro events
 * should tell me the outcomes and how it affects my portfolio and the markets
 * in general in a reaction deck like the earnings one, sent as a notification
 * and an email"). Once the session that traded an event on the calendar has
 * closed, the app reads how the markets took it (SPY, QQQ, small caps, long
 * Treasuries, the dollar, gold, oil and the economy's own market, each the
 * ETF that tracks it, close to close on that session) and how the book took
 * it (each listed holding at today's weight times its own move, the holdings
 * that moved it most), sets that beside the book's history on the same kind
 * of event (lib/event-sensitivity.ts) and, for the Fed, beside what the
 * deeper of Kalshi and Polymarket priced the day before, and names what the event touches in the book under
 * the methodology (lib/econ-exposure.ts). On a Claude key the person's own
 * model reads the outcome from the web (what was decided or published, what
 * was expected, what differed and why the markets moved), every point with
 * its page; the moves are the app's. The report is kept in the vault's
 * `macro_reports` file, drawn on the Calendar and summarised in an alert
 * with the moves as chips (and so the close's notification) and its own
 * email; no deck (Hamza, 29 Oct 2026: "no need for powerpoint decks for every
 * single calendar event").
 *
 * History at today's weights and what was priced are context, never a
 * forecast; nothing here is advice. Pure: imports nothing server-only.
 */
import { z } from "zod";

import type { AlertsEmail } from "@/lib/alerts";
import { modelReaders, sourceSchema } from "@/lib/earnings";
import { ECON_AREAS } from "@/lib/econ-exposure";
import { ECON_EVENTS, GEOPOLITICS, type EconArea, type EconEvent, type EconKind } from "@/lib/econ-calendar";
import { eventSensitivity, NEXT_SESSION, sessionOf, type Sensitivity, type Stat, type Weighted } from "@/lib/event-sensitivity";
import { MARKET_HOLIDAYS } from "@/lib/live";
import type { Notice } from "@/lib/screens";
import { addDaysTo, localMoment, daysBetween, longDate } from "@/lib/time";
import { READ_BEHIND } from "@/lib/investigate";
import { MODELS } from "@/lib/models";

const { text, list, pointsOf, cutShort } = modelReaders;

/** The alerts the reports make. */
export const MACRO_PREFIX = "macro-report:";
/** An event is reported within this many days of the session that traded it; an older one is left. */
export const MACRO_DAYS = 5;
/** A report is an alert for this many days after its session. */
export const MACRO_NOTICE_DAYS = 3;
/** The reports one run writes at most. */
export const MACRO_PER_RUN = 3;
/**
 * An outcome not out yet (the votes still counted, the talks still going) or
 * a reading that failed is read again every MACRO_RETRY_HOURS, until
 * MACRO_RETRY_DAYS after the session (Hamza, 28 Oct 2026: "try every 6
 * hours like with the earnings Quartr thing").
 */
export const MACRO_RETRY_HOURS = 6;
export const MACRO_RETRY_DAYS = 7;
/**
 * One step (Hamza, 7 Nov 2026: "no need to wait until the market close ...
 * investors will react momentarily so just wait until there is sufficient
 * investor sentiment maximum like 30 minutes then send out the calendar event
 * report in one go"): the outcome and how investors took it are read
 * together, REACTION_MINUTES after the event's own time on the calendar. It
 * replaces the two steps of 4 Nov 2026 (the outcome at once, the reaction
 * after the US close). A reading not final is tried again every
 * EARLY_RETRY_HOURS for EARLY_RETRY_SPAN_HOURS, then every MACRO_RETRY_HOURS.
 */
export const REACTION_MINUTES = 30;
export const EARLY_RETRY_HOURS = 2;
export const EARLY_RETRY_SPAN_HOURS = 48;
/** The hour, UTC, from which an event with no clock time on the calendar is read on its last day: after the US releases at 08:30 New York and the European decisions. */
export const EARLY_FROM_UTC_HOUR = 14;
/** The Bank of Japan announces when its meeting ends, in Tokyo's morning: read from this hour, UTC. */
export const BOJ_FROM_UTC_HOUR = 4;
export const MACRO_MODEL = MODELS.standard;
export const MACRO_SEARCHES = 5;
export const MACRO_MAX_TOKENS = 3000;
/** The reports kept, newest first. */
export const MAX_MACRO_REPORTS = 80;
/** The holdings that moved the book most, named on the report. */
export const MACRO_MOVERS = 6;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = z.string().regex(DAY);

/** What each kind decides, as the event history names it; a kind not here records its outcome in words alone. */
export const OUTCOMES: Partial<Record<EconKind, readonly string[]>> = {
  fomc: ["Cut", "Hold", "Hike"],
  ecb: ["Cut", "Hold", "Hike"],
  boe: ["Cut", "Hold", "Hike"],
  boj: ["Cut", "Hold", "Hike"],
  boc: ["Cut", "Hold", "Hike"],
  snb: ["Cut", "Hold", "Hike"],
  cpi: ["Inflation higher", "Inflation not higher"],
  jobs: ["Unemployment up", "Unemployment not up"],
};

/** The readings of an outcome kept on its report: four a day over MACRO_RETRY_DAYS, and the first. */
export const MAX_READINGS = 30;

/** The markets every report reads, each by the ETF that tracks it (one price feed, one kind of move). */
export const MARKET_GAUGES: readonly { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq-100" },
  { symbol: "IWM", label: "US small caps" },
  { symbol: "TLT", label: "Long Treasuries" },
  { symbol: "UUP", label: "US dollar" },
  { symbol: "GLD", label: "Gold" },
  { symbol: "USO", label: "Oil" },
];
/** The economy's own market, for an event outside the US. */
export const AREA_GAUGE: Partial<Record<EconArea, { symbol: string; label: string }>> = {
  euro: { symbol: "FEZ", label: "Euro Stoxx 50" },
  uk: { symbol: "EWU", label: "UK shares" },
  japan: { symbol: "EWJ", label: "Japanese shares" },
  canada: { symbol: "EWC", label: "Canadian shares" },
  switzerland: { symbol: "EWL", label: "Swiss shares" },
  france: { symbol: "EWQ", label: "French shares" },
  mexico: { symbol: "EWW", label: "Mexican shares" },
  israel: { symbol: "EIS", label: "Israeli shares" },
  china: { symbol: "FXI", label: "Chinese large caps" },
  argentina: { symbol: "ARGT", label: "Argentine shares" },
};

export const gaugesFor = (area: EconArea) => [...MARKET_GAUGES, ...(AREA_GAUGE[area] ? [AREA_GAUGE[area]!] : [])];

const statSchema = z.object({ n: z.number().int(), mean: z.number(), lo: z.number(), hi: z.number(), min: z.number(), max: z.number(), down: z.number() });

export const macroReportSchema = z.object({
  key: z.string().max(80),
  date: isoDay,
  kind: z.string().max(12),
  area: z.string().max(12),
  name: z.string().max(140),
  about: z.string().max(500).default(""),
  /** The event's official page, or the calendar when it has none. */
  source: z.string().max(400),
  /** The session that traded it. */
  session: isoDay,
  builtAt: z.string(),
  updatedAt: z.string(),
  /** What the markets priced the day before, for the Fed; null when not read. */
  priced: z.record(z.string(), z.number()).nullable().default(null),
  /** Whose prices: the deeper of Kalshi and Polymarket on the meeting; a report kept before the field had Kalshi's. */
  pricedBy: z.string().max(20).nullable().default(null),
  /** The outcome as the person's model read it from the web; null without one. */
  outcome: z
    .object({
      label: z.string().max(40).nullable(),
      decided: z.string().max(700),
      expected: z.string().max(500).nullable(),
      surprise: z.string().max(700).nullable(),
      markets: z.string().max(700).nullable(),
      points: z.array(z.object({ line: z.string().max(400), source: sourceSchema })).max(6),
      /** False while the outcome is not out yet (the count goes on, the talks go on): what is known so far, read again later. */
      final: z.boolean().default(true),
    })
    .nullable()
    .default(null),
  /** "reaction" for every report since 7 Nov 2026 (one step); "outcome" for one kept from 4 to 7 Nov with its outcome alone, owed its reaction. */
  stage: z.enum(["outcome", "reaction"]).default("reaction"),
  /** Why there is no outcome yet, or that it is not final, in a sentence. */
  outcomeNote: z.string().max(400).nullable().default(null),
  tries: z.number().int().default(0),
  /** When the model last tried the outcome. */
  triedAt: z.string().nullable().default(null),
  /** When a final outcome was read on a later run than the report's first, so it is told again. */
  outcomeAt: z.string().nullable().default(null),
  /** Each reading of the outcome, the oldest first, so the updates while it was not out stay on the page (Hamza, 28 Oct 2026). */
  readings: z.array(z.object({ at: z.string(), decided: z.string().max(700), final: z.boolean(), news: z.boolean().nullable().default(null) })).max(MAX_READINGS).default([]),
  /** Each market's move on the session, in percent. */
  markets: z.array(z.object({ symbol: z.string().max(10), label: z.string().max(40), movePct: z.number() })).default([]),
  /** The book's move on the session at today's weights, in percent of the whole book. */
  book: z
    .object({
      movePct: z.number(),
      /** Share of the book, 0 to 1, whose closes were read on the session. */
      covered: z.number(),
      movers: z.array(z.object({ symbol: z.string().max(20), weightPct: z.number(), movePct: z.number(), contributionPct: z.number() })).max(MACRO_MOVERS),
    })
    .nullable()
    .default(null),
  bookNote: z.string().max(300).nullable().default(null),
  /** The book's history on this kind of event: the outcome's own row when the outcome is read, else every occurrence. */
  history: z
    .object({ outcome: z.string().max(40).nullable(), from: z.string().nullable(), book: statSchema.nullable(), spy: statSchema.nullable(), expected: z.object({ book: z.number(), spy: z.number() }).nullable() })
    .nullable()
    .default(null),
  /** What the event touches in the book under the methodology, as sentences. */
  reach: z.array(z.string().max(500)).max(8).default([]),
});
export type MacroReport = z.infer<typeof macroReportSchema>;

export const macroReportsFileSchema = z.object({
  version: z.literal(1),
  reports: z.array(macroReportSchema).max(MAX_MACRO_REPORTS).default([]),
  /** The markets' prices for a coming Fed meeting, by event key, kept until the meeting is reported; `by` names whose. */
  priced: z.record(z.string(), z.object({ prices: z.record(z.string(), z.number()), readAt: z.string(), by: z.string().max(20).default("Kalshi") })).default({}),
  updated: z.string(),
});
export type MacroReportsFile = z.infer<typeof macroReportsFileSchema>;
export const EMPTY_MACRO: MacroReportsFile = { version: 1, reports: [], priced: {}, updated: "" };

// ---------------------------------------------------------------------------
// Which events, and the session that traded each

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** An event's key: its day, kind, economy and name, so two events of one day stay apart. */
export const macroKey = (e: Pick<EconEvent, "date" | "kind" | "area" | "name">) => `${e.date}:${e.kind}:${e.area}:${slug(e.name)}`.slice(0, 80);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The last day of an event that runs over several ("..., to 29 October"); its own day otherwise. */
export function lastDayOf(e: Pick<EconEvent, "date" | "name">): string {
  const m = / to (\d{1,2}) ([A-Za-z]+)/.exec(e.name);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) return e.date;
  const year = Number(e.date.slice(0, 4)) + (month + 1 < Number(e.date.slice(5, 7)) ? 1 : 0);
  const d = `${year}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return DAY.test(d) && d >= e.date ? d : e.date;
}

const weekend = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
const shut = (d: string) => weekend(d) || MARKET_HOLIDAYS.includes(d);

/**
 * The US session that traded an event: its own day when the market is open
 * that day (a release before the open, a decision in the afternoon), the next
 * one for a result counted overnight or a deadline at midnight, and after the
 * last day of an event that runs over several.
 */
export function tradedOn(e: Pick<EconEvent, "date" | "kind" | "name">): string {
  const last = lastDayOf(e);
  let d = NEXT_SESSION.has(e.kind) || last !== e.date ? addDaysTo(last, 1) : last;
  while (shut(d)) d = addDaysTo(d, 1);
  return d;
}

/** The events a report is written for: every calendar event but a company's results, which Earnings reports. */
export const reportable = (events: readonly EconEvent[]) => events.filter((e) => e.kind !== "earnings");

/**
 * The events due a report (one step, Hamza, 7 Nov 2026): from readFrom, within
 * MACRO_DAYS of its day, none kept yet; or one kept before 7 Nov as its first
 * step alone, owed its reaction; or one kept without a final outcome that the
 * model may read again (retryHours since its last try, within
 * MACRO_RETRY_DAYS). The oldest first, so a late run catches up in order.
 */
export function macroDue(events: readonly EconEvent[], file: MacroReportsFile | null, canRead: boolean, now: string): EconEvent[] {
  const kept = new Map((file?.reports ?? []).map((r) => [r.key, r]));
  const at = Date.parse(now);
  const today = now.slice(0, 10);
  return reportable(events)
    .filter((e) => {
      if (at < readFrom(e)) return false;
      const r = kept.get(macroKey(e));
      if (!r) return daysBetween(lastDayOf(e), today) <= MACRO_DAYS;
      if (!canRead) return false;
      if (r.stage === "outcome") return daysBetween(lastDayOf(e), today) <= MACRO_DAYS;
      return !r.outcome?.final && daysBetween(lastDayOf(e), today) <= MACRO_RETRY_DAYS && retryDue(r, now, retryHours(e, now));
    })
    .sort((a, b) => readFrom(a) - readFrom(b) || a.name.localeCompare(b.name));
}

const CLOCK_ZONES: Record<string, string> = { ET: "America/New_York", CET: "Europe/Berlin", London: "Europe/London" };

/** A wall-clock time in a zone, as an instant: the zone's offset at that moment, read twice so a change of clocks that day lands right. */
function wallClock(day: string, hour: number, minute: number, zone: string): number {
  const guess = Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const offset = (t: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`) - t;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

/** When an event comes out, from its time on the calendar ("08:30 ET", "14:15 CET", "12:00 London") on its last day; null when the calendar gives no clock time. */
export function releaseAt(e: Pick<EconEvent, "date" | "name" | "time">): number | null {
  const m = /^(\d{1,2}):(\d{2}) (ET|CET|London)$/.exec(e.time ?? "");
  return m ? wallClock(lastDayOf(e), Number(m[1]), Number(m[2]), CLOCK_ZONES[m[3]]) : null;
}

/**
 * When an event's report is read: REACTION_MINUTES after it comes out, once
 * investors have taken it (Hamza, 7 Nov 2026). With no clock time on the
 * calendar: an election or anything counted overnight from midnight UTC after
 * its day, the Bank of Japan from BOJ_FROM_UTC_HOUR on its day, any other
 * from EARLY_FROM_UTC_HOUR on its last day.
 */
export function readFrom(e: Pick<EconEvent, "date" | "kind" | "name" | "time">): number {
  const at = releaseAt(e);
  if (at !== null) return at + REACTION_MINUTES * 60_000;
  const last = lastDayOf(e);
  if (NEXT_SESSION.has(e.kind)) return Date.parse(`${addDaysTo(last, 1)}T00:00:00Z`);
  const hour = e.kind === "boj" ? BOJ_FROM_UTC_HOUR : EARLY_FROM_UTC_HOUR;
  return Date.parse(`${last}T${String(hour).padStart(2, "0")}:00:00Z`);
}

/** How often a reading not final is tried again: every EARLY_RETRY_HOURS for EARLY_RETRY_SPAN_HOURS after readFrom, then every MACRO_RETRY_HOURS. */
export const retryHours = (e: Pick<EconEvent, "date" | "kind" | "name" | "time">, now: string) => (Date.parse(now) - readFrom(e) < EARLY_RETRY_SPAN_HOURS * 3600_000 ? EARLY_RETRY_HOURS : MACRO_RETRY_HOURS);

/** Whether any event's report is due now, for the results watch's cheap gate; a person who cannot read outcomes is gated again inside the run. */
export function macroReadDue(events: readonly EconEvent[], file: MacroReportsFile | null, now: Date): boolean {
  return macroDue(events, file, true, now.toISOString()).length > 0;
}

/** Whether a table event came out within the last `hours`: the quarter-hourly watch outside the results hours runs only then. */
export function eventWindowOpen(events: readonly EconEvent[], now: Date, hours = 3): boolean {
  const at = now.getTime();
  return reportable(events).some((e) => at >= readFrom(e) && at - readFrom(e) <= hours * 3600_000);
}

/** A scheduled run may fire up to an hour late or early, so a try a little under six hours on counts. */
const RETRY_SLACK_MS = 45 * 60_000;
/** A report's outcome may be tried again: never tried, or `hours` since the last try, within the runs' slack (a quarter of the wait at most). */
export const retryDue = (r: Pick<MacroReport, "triedAt">, now: string, hours: number = MACRO_RETRY_HOURS) => !r.triedAt || Date.parse(now) - Date.parse(r.triedAt) >= hours * 3600_000 - Math.min(RETRY_SLACK_MS, hours * 900_000);

/** The events a market reading should be kept for: today or tomorrow, so the report can set what was priced beside what happened (every kind since 28 Oct 2026). */
export const pricedSoon = (events: readonly EconEvent[], today: string) => reportable(events).filter((e) => e.date >= today && e.date <= addDaysTo(today, 1));

/**
 * Whether a reading taken now still prices the event: the Fed's until 13:30
 * in New York on its day, before the 14:00 decision; any other until its day
 * begins in UTC, before the releases at 08:30 New York, the European
 * decisions and the Bank of Japan's in Tokyo's morning.
 */
export function stillPriced(e: Pick<EconEvent, "kind" | "date">, now: Date, ny: { date: string; minutes: number }): boolean {
  if (e.kind === "fomc") return ny.date < e.date || (ny.date === e.date && ny.minutes < 13 * 60 + 30);
  return now.toISOString().slice(0, 10) < e.date;
}

/** A market's reading laid on the file for the event it prices: the prices as shares that add to one, and whose they are. */
export function withPriced(file: MacroReportsFile | null, e: EconEvent, priced: { prices: Record<string, number>; by: string } | null, now: string): MacroReportsFile {
  const base = file ?? EMPTY_MACRO;
  if (!priced) return base;
  const sum = Object.values(priced.prices).reduce((s, x) => s + x, 0);
  if (!(sum > 0)) return base;
  const prices = Object.fromEntries(Object.entries(priced.prices).map(([k, v]) => [k, v / sum]));
  return macroReportsFileSchema.parse({ ...base, priced: { ...base.priced, [macroKey(e)]: { prices, readAt: now, by: priced.by } }, updated: now });
}

// ---------------------------------------------------------------------------
// The figures: the markets and the book on the session, and history

type Close = { date: string; value: number };

const moveOn = (points: readonly Close[] | undefined, session: string): number | null => {
  if (!points?.length) return null;
  const s = sessionOf(
    points.map((p) => p.date),
    session,
  );
  if (!s || s.session !== session) return null;
  const a = points.find((p) => p.date === s.before)?.value;
  const b = points.find((p) => p.date === s.session)?.value;
  return a && b ? b / a - 1 : null;
};

export type MacroFigures = Pick<MacroReport, "markets" | "book" | "bookNote" | "history">;

/**
 * The markets' and the book's moves on the session, and the book's history on
 * the kind of event: `closes` holds each gauge's and each listed holding's
 * daily closes, `bench` SPY's over the years the history reaches.
 */
export function macroFigures(e: Pick<EconEvent, "kind" | "area">, session: string, weights: readonly Weighted[], closes: Readonly<Record<string, readonly Close[]>>, bench: readonly Close[], outcome: string | null, priced: Readonly<Record<string, number>> | null): MacroFigures {
  const markets = gaugesFor(e.area as EconArea)
    .map((g) => ({ ...g, move: moveOn(g.symbol === "SPY" && bench.length ? bench : closes[g.symbol], session) }))
    .filter((g): g is { symbol: string; label: string; move: number } => g.move !== null)
    .map((g) => ({ symbol: g.symbol, label: g.label, movePct: g.move * 100 }));
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let book: MacroReport["book"] = null;
  let bookNote: string | null = null;
  if (!weights.length) bookNote = "No listed holding in the book, so its move is not read.";
  else {
    const read = weights.map((w) => ({ ...w, move: moveOn(closes[w.symbol], session) })).filter((w): w is Weighted & { move: number } => w.move !== null);
    const covered = read.reduce((s, w) => s + w.weight, 0);
    if (!read.length || covered < total * 0.5) bookNote = "Most of the book's closes on that session could not be read, so its move is not shown.";
    else {
      const move = read.reduce((s, w) => s + w.weight * w.move, 0);
      const movers = [...read]
        .sort((a, b) => Math.abs(b.weight * b.move) - Math.abs(a.weight * a.move))
        .slice(0, MACRO_MOVERS)
        .map((w) => ({ symbol: w.symbol, weightPct: w.weight * 100, movePct: w.move * 100, contributionPct: w.weight * w.move * 100 }));
      book = { movePct: move * 100, covered, movers };
    }
  }
  const s = eventSensitivity(e, weights, closes, bench, priced);
  return { markets, book, bookNote, history: historyOf(s, outcome) };
}

/** The history row the report sets beside this time: the outcome's own, else every occurrence (an election has one). */
export function historyOf(s: Sensitivity | null, outcome: string | null): MacroReport["history"] {
  if (!s || (!s.rows.length && !s.all.book)) return null;
  const row = outcome ? s.rows.find((r) => r.outcome === outcome) : s.rows.length === 1 ? s.rows[0] : null;
  const pick = (x: Stat | null) => (x ? { n: x.n, mean: x.mean, lo: x.lo, hi: x.hi, min: x.min, max: x.max, down: x.down } : null);
  return { outcome: row?.outcome ?? null, from: s.from, book: pick(row ? row.book : s.all.book), spy: pick(row ? row.spy : s.all.spy), expected: s.expected ? { book: s.expected.book, spy: s.expected.spy } : null };
}

const share = (x: number) => `${(x * 100).toFixed(0)}%`;

/**
 * The app's headline: the outcome as read, nothing of the index or the book
 * (Hamza, 4 Nov 2026: an index's move that day cannot be told apart from
 * the rest of the day's news, so the report says how investors took it, from
 * the reporting, instead).
 */
export function macroHeadline(r: Pick<MacroReport, "outcome" | "session">): string {
  if (!r.outcome) return "What came out of it is not read yet.";
  return `${r.outcome.final ? "" : "Not final yet. "}${r.outcome.decided}`;
}

// ---------------------------------------------------------------------------
// The model's reading of the outcome

const INVESTIGATE = `- Be investigative. When the decision or the figure was not what was expected, find out why from the event's own record: the statement's words and what changed in them, the votes and dissents, the officials' remarks after it, the release's components and revisions, what changed since the last one. Name what the pages show and what they do not; never a motive they do not support.
${READ_BEHIND}`;

const modelOutcomeSchema = z.object({
  outcome: z.string().optional(),
  decided: z.string(),
  expected: z.string().optional(),
  surprise: z.string().optional(),
  markets: z.string().optional(),
  points: z.array(z.object({ line: z.string(), source: z.object({ title: z.string(), url: z.string() }) })).optional(),
  final: z.boolean().optional(),
  news: z.boolean().optional(),
});

/** The facts the model is given: the event, its page, what was priced before it. Never a move of the book, an index or an amount of money. */
export function macroFacts(e: Pick<EconEvent, "name" | "date" | "time" | "about" | "source" | "area">, session: string, f: Pick<MacroReport, "priced"> & { pricedBy?: string | null }): string {
  return [
    `Event: ${e.name}, ${e.date}, ${e.time}. ${e.about}`,
    `Economy: ${ECON_AREAS[e.area as EconArea]?.label ?? e.area}. Official page: ${e.source.startsWith("http") ? e.source : "none given"}.`,
    `The session that traded it: ${session}.`,
    f.priced ? `What ${f.pricedBy ?? "Kalshi"}'s markets priced the day before: ${Object.entries(f.priced).map(([o, p]) => `${o} ${share(p)}`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The one call: the outcome from the official page and that day's reporting, with web search. */
export function macroRequestBody(e: EconEvent, session: string, f: Pick<MacroReport, "priced"> & { pricedBy?: string | null }, model = MACRO_MODEL, earlier: { decided: string; readAt: string } | null = null, hours: number = MACRO_RETRY_HOURS): Record<string, unknown> {
  const schema = z.toJSONSchema(modelOutcomeSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const labels = OUTCOMES[e.kind];
  return {
    model,
    max_tokens: MACRO_MAX_TOKENS,
    system: `You report, for a person's portfolio app, what came out of a macro event and how investors took it, by searching the web: the official page first, then that day's reporting. At most ${MACRO_SEARCHES} searches. The person reads it as an email or a notification, so every field is short.

Rules:
- decided: one sentence, two at most, on what was decided or published, with its figures as the official page prints them (the rate and the change in basis points; the index and its change; payrolls and the unemployment rate; who won; what was agreed or extended).${labels ? `\n- outcome: one of ${labels.map((l) => `"${l}"`).join(", ")}, as the official figures show it (inflation higher means the year-on-year rate rose from the month before; unemployment up means the rate rose).` : "\n- outcome: leave it out."}
- expected: what was expected beforehand as that day's reporting states it (the economists' survey, the futures' pricing), in one sentence; leave it out when the pages do not say.
- surprise: what differed from what was expected and what in it was new (the statement's words, the votes, a revision, the guidance), in one or two sentences; leave it out when nothing did.
- markets: how investors took it in the first half hour or so after it came out, as the reporting and the markets' live coverage tell it, in two or three sentences: where the money went (a rotation from one group of companies to another, which sectors, styles, bonds, currencies or commodities were bought and sold) and the reasons the reporting gives. Tie a move to the event only where the reporting does; an index's move that day can come from other news, and when other news drove the day, say what it was. No index levels and no index percentages.
- points: up to three lines a holder would want, each with the page it came from, its real https URL and title.
- final: false when the outcome is not out yet: the votes are still being counted and no official or near-final result names the winner, a meeting or talks are still going on, the figure is not yet published. Then decided says what is known so far (the exit polls, the partial count, where the talks stand) and when the result is due; the app reads it again in ${hours} hours. True once it is out.
- news: only when an earlier reading is given below. True when something has come out since it (a count moved on, a winner or a figure named, talks ended, a date set); false when what is known is what that reading said, however it is worded. The person is told only when it is true.
${INVESTIGATE}
- Pages from the event's day and the session after, and older pages only where they explain the outcome. No opinion of your own, no forecast, no advice, no recommendation, no exclamation marks.
- Your whole answer is one call to record_outcome; write nothing outside it.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: MACRO_SEARCHES },
      { name: "record_outcome", description: "Record what came out of the event and how the markets took it.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${macroFacts(e, session, f)}${earlier ? `\nAn earlier reading, ${earlier.readAt.slice(0, 16).replace("T", " ")} UTC, found the outcome not out yet: ${earlier.decided} Look for what has come out since.` : ""}\n\nWhat came out of it, against what was expected, and how did investors take it?` }] }],
  };
}

export type MacroParse = { ok: true; outcome: NonNullable<MacroReport["outcome"]>; news: boolean | null } | { ok: false; reason: string };

/** Reads the answer item by item: a point without a page is dropped, a label the kind does not name is left out, never the reading. */
export function parseMacroResponse(body: unknown, kind: string): MacroParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_outcome");
  if (!call) return { ok: false, reason: cutShort(body) ? "the answer ran past its length before it recorded the outcome" : "the model answered in words instead of recording the outcome" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  const decided = text(raw.decided, 700);
  if (!decided) return { ok: false, reason: cutShort(body) ? "the answer ran past its length before the outcome" : "the answer held no outcome" };
  const labels = OUTCOMES[kind as EconKind] ?? [];
  const said = text(raw.outcome, 40).toLowerCase();
  const label = labels.find((l) => l.toLowerCase() === said) ?? null;
  const opt = (v: unknown, max: number) => text(v, max) || null;
  return { ok: true, outcome: { label, decided, expected: opt(raw.expected, 500), surprise: opt(raw.surprise, 700), markets: opt(raw.markets, 700), points: pointsOf(list(raw.points), 3), final: raw.final !== false && raw.final !== "false" }, news: raw.news === true || raw.news === "true" ? true : raw.news === false || raw.news === "false" ? false : null };
}

// ---------------------------------------------------------------------------
// The report, kept

/** A report built or rebuilt: the figures, the outcome when read, what it touches. */
export function macroReportOf(e: EconEvent, session: string, figures: MacroFigures, priced: Record<string, number> | null, reach: readonly string[], read: { outcome: MacroReport["outcome"]; note: string | null; tried: boolean; news?: boolean | null; hours?: number }, before: MacroReport | null, now: string, pricedBy: string | null = null): MacroReport {
  const outcome = read.outcome ?? before?.outcome ?? null;
  return macroReportSchema.parse({
    key: macroKey(e),
    date: e.date,
    kind: e.kind,
    area: e.area,
    name: e.name.slice(0, 140),
    about: e.about.slice(0, 500),
    source: e.source.slice(0, 400),
    session,
    builtAt: before?.builtAt ?? now,
    updatedAt: now,
    priced,
    pricedBy: priced ? (pricedBy ?? before?.pricedBy ?? null) : null,
    outcome: read.outcome ?? before?.outcome ?? null,
    outcomeNote: (read.note ?? (outcome && !outcome.final ? pendingNote(read.tried ? now : (before?.triedAt ?? now), read.hours ?? MACRO_RETRY_HOURS) : null))?.slice(0, 400) ?? null,
    tries: (before?.tries ?? 0) + (read.tried ? 1 : 0),
    triedAt: read.tried ? now : (before?.triedAt ?? null),
    // A final outcome read after the report was first written is told again.
    outcomeAt: before?.outcomeAt ?? (before && read.outcome?.final && !before.outcome?.final ? now : null),
    stage: "reaction",
    readings: readingsOf(before, read.tried ? read.outcome : null, now, read.news ?? null),
    ...figures,
    reach: reach.slice(0, 8).map((x) => x.slice(0, 500)),
  });
}

/**
 * The readings kept: the report's own, else the one it was kept with before
 * the field, then this one when the model read one. A reading is news when
 * the model says something came out since the last one; words the same as the
 * last are never news, whatever the model says (Hamza, 29 Oct 2026: only an
 * actual update is told).
 */
function readingsOf(before: MacroReport | null, read: MacroReport["outcome"], now: string, news: boolean | null): MacroReport["readings"] {
  const kept = before?.readings.length ? before.readings : before?.outcome ? [{ at: before.triedAt ?? before.updatedAt, decided: before.outcome.decided.slice(0, 700), final: before.outcome.final, news: null }] : [];
  if (!read) return kept.slice(-MAX_READINGS);
  const last = kept.at(-1);
  const same = !!last && sameWords(last.decided, read.decided);
  return [...kept, { at: now, decided: read.decided.slice(0, 700), final: read.final, news: same ? false : last ? news : true }].slice(-MAX_READINGS);
}

const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim() === b.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** The readings again since the report that are news, not final yet: each is told once. A reading kept before the field counts as news, as it was told. */
export const newsReadings = (r: Pick<MacroReport, "readings" | "builtAt">) => r.readings.filter((x) => x.at !== r.builtAt && !x.final && x.news !== false);

/** What a report says while its outcome is not out yet. */
export const pendingNote = (now: string, hours: number = MACRO_RETRY_HOURS) => `Not final when read ${localMoment(now)} your time; read again every ${hours} hours until it is, for ${MACRO_RETRY_DAYS} days after the event.`;

/** The report laid on the file, the newest session first; a priced reading it used is let go. */
export function withMacroReport(file: MacroReportsFile | null, r: MacroReport, now: string): MacroReportsFile {
  const base = file ?? EMPTY_MACRO;
  const reports = [r, ...base.reports.filter((x) => x.key !== r.key)].sort((a, b) => b.session.localeCompare(a.session) || a.name.localeCompare(b.name)).slice(0, MAX_MACRO_REPORTS);
  const priced = Object.fromEntries(Object.entries(base.priced).filter(([k]) => k !== r.key && reports.every((x) => x.key !== k) && k.slice(0, 10) >= addDaysTo(now.slice(0, 10), -7)));
  return macroReportsFileSchema.parse({ ...base, reports, priced, updated: now });
}

/**
 * What is being read now (Hamza, 28 Oct 2026: "if there is a fetch ongoing
 * it should show"): every calendar event that has happened and whose report
 * is not in or not final. Waiting for its half hour of trading; due at the
 * next run; or kept with an outcome not out yet, with each reading so far and
 * when the next is due.
 */
export type InProgress = { key: string; name: string; date: string; session: string; state: "waiting" | "due" | "pending"; words: string; readings: MacroReport["readings"] };

export function macroInProgress(events: readonly EconEvent[], file: MacroReportsFile | null, now: Date): InProgress[] {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const kept = new Map((file?.reports ?? []).map((r) => [r.key, r]));
  const out: InProgress[] = [];
  for (const e of reportable(events)) {
    const key = macroKey(e);
    const r = kept.get(key);
    if (r?.outcome?.final && r.stage !== "outcome") continue;
    const from = readFrom(e);
    const base = { key, name: e.name, date: e.date, session: tradedOn(e), readings: r?.readings ?? [] };
    if (!r || r.stage === "outcome") {
      if (e.date > today || daysBetween(lastDayOf(e), today) > MACRO_DAYS) continue;
      if (now.getTime() < from) out.push({ ...base, state: "waiting", words: `Read with how investors took it ${releaseAt(e) !== null ? `${REACTION_MINUTES} minutes after it comes out, ` : ""}from ${localMoment(new Date(from).toISOString())} your time.` });
      else out.push({ ...base, state: "due", words: "Its report is read at the next run." });
      continue;
    }
    if (daysBetween(lastDayOf(e), today) > MACRO_RETRY_DAYS) continue;
    const hours = retryHours(e, nowIso);
    const next = r.triedAt ? new Date(Date.parse(r.triedAt) + hours * 3600_000).toISOString() : null;
    const last = r.triedAt ? `Last read ${localMoment(r.triedAt)} your time` : "Not read yet";
    out.push({ ...base, state: "pending", words: `${r.outcome ? "Not final yet." : (r.outcomeNote ?? "The outcome is not read yet.")} ${last}; ${next ? `next around ${localMoment(next)}` : "read at the next run"}, every ${hours} hours until it is final.` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** The event a kept report stands for, from the table or the found events; built from the report itself when neither holds it any longer. */
export function eventOf(r: MacroReport, found: readonly EconEvent[] = []): EconEvent {
  return [...ECON_EVENTS, ...found].find((e) => macroKey(e) === r.key) ?? { date: r.date, kind: r.kind as EconKind, area: r.area as EconArea, name: r.name, time: "", about: r.about, source: r.source, indicator: null };
}

// ---------------------------------------------------------------------------
// The alert and the email

/** The alert told again when an outcome not out at the report comes out later. */
export const OUTCOME_SUFFIX = "#outcome";
/** Each reading again of an outcome not out yet is told as its own alert, keyed by when it was read (Hamza, 28 Oct 2026). */
export const UPDATE_MARK = "#update@";
const clock = (iso: string) => `${localMoment(iso)} your time`;
/** A report whose latest reading again, its outcome still not final, brought something new: an update to tell. */
export const isUpdate = (r: Pick<MacroReport, "triedAt" | "builtAt" | "outcome" | "readings">) => !!r.triedAt && r.triedAt !== r.builtAt && !r.outcome?.final && newsReadings(r).at(-1)?.at === r.triedAt;

/**
 * Each report is an alert for MACRO_NOTICE_DAYS after its session, in three
 * parts: what happened, the outcome against what was expected, and how
 * investors took it from the day's reporting; no index's move and no line
 * on the book (Hamza, 4 Nov 2026). An outcome that came out after the
 * report was written (an election's count) is an alert of its own for
 * MACRO_NOTICE_DAYS from when it was read, and so is each reading again
 * while it is not out, so a quiet six hours never looks like a skipped one.
 */
export function macroNotices(file: MacroReportsFile | null, today: string): Notice[] {
  const reports = file?.reports ?? [];
  const href = (r: MacroReport) => `/calendar?event=${encodeURIComponent(r.key)}#event-reports`;
  const later = reports
    .filter((r) => r.outcomeAt && r.outcome?.final && daysBetween(r.outcomeAt.slice(0, 10), today) <= MACRO_NOTICE_DAYS && r.outcomeAt.slice(0, 10) <= today)
    .map((r) => ({
      key: `${MACRO_PREFIX}${r.key}${OUTCOME_SUFFIX}`,
      date: r.outcomeAt!.slice(0, 10),
      tone: "info" as const,
      title: `${r.name}: ${outcomeLine(r.outcome!)}`.slice(0, 200),
      detail: [againstExpected(r.outcome!), r.outcome!.markets].filter(Boolean).join(" ").slice(0, 1200),
      href: href(r),
    }));
  const updates = reports
    .filter((r) => !r.outcome?.final)
    .flatMap((r) =>
      newsReadings(r)
        .filter((x) => daysBetween(x.at.slice(0, 10), today) <= MACRO_NOTICE_DAYS && x.at.slice(0, 10) <= today)
        .map((x) => ({
          key: `${MACRO_PREFIX}${r.key}${UPDATE_MARK}${x.at}`,
          date: x.at.slice(0, 10),
          tone: "info" as const,
          title: `${r.name}: still not final, as read ${clock(x.at)}`.slice(0, 200),
          detail: [x.decided, x.at === r.triedAt ? r.outcomeNote : null].filter(Boolean).join(" ").slice(0, 1200),
          href: href(r),
        })),
    );
  // Dated the day it was written: in one step that is often before the session that trades it (Hamza, 7 Nov 2026).
  const told = (r: MacroReport) => (r.builtAt.slice(0, 10) < r.session ? r.builtAt.slice(0, 10) : r.session);
  return reports
    .filter((r) => r.stage !== "outcome" && told(r) <= today && daysBetween(told(r), today) <= MACRO_NOTICE_DAYS)
    .map((r) => ({
      key: `${MACRO_PREFIX}${r.key}`,
      date: told(r),
      tone: "info" as const,
      title: `After ${r.name}: ${r.outcome ? outcomeLine(r.outcome) : "the outcome is not read yet"}`.slice(0, 200),
      detail: (r.outcome ? [againstExpected(r.outcome), r.outcome.markets] : [r.outcomeNote]).filter(Boolean).join(" ").slice(0, 1200),
      href: href(r),
    }))
    .concat(updates, later);
}

type Outcome = NonNullable<MacroReport["outcome"]>;
/** What happened, in a line: the label, then what was decided; not final said first. */
const outcomeLine = (o: Outcome) => `${o.final ? (o.label ? `${o.label}. ` : "") : "Not final yet. "}${o.decided}`;
/** The outcome against what was expected, in a sentence or two; empty when the reporting gave neither. */
export const againstExpected = (o: Pick<Outcome, "expected" | "surprise">) => [o.expected ? `Expected: ${o.expected.replace(/^expected:?\s*/i, "")}` : "", o.surprise ?? ""].filter(Boolean).join(" ");
/** The pages the reading came from, each once. */
const pagesOf = (o: Outcome | null) => [...new Map((o?.points ?? []).map((p) => [p.source.url, p.source])).values()];

/** The kept report an alert stands for; null for any other alert. */
export function macroOfAlert(file: MacroReportsFile | null, key: string): MacroReport | null {
  if (!key.startsWith(MACRO_PREFIX)) return null;
  const k = key.slice(MACRO_PREFIX.length).replace(/#.*$/, "");
  return file?.reports.find((r) => r.key === k) ?? null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const INK = "#15171d";
const SOFT = "#5a5e68";
const TEAL = "#0f7b75";

/**
 * The report as its own email, short (Hamza, 4 Nov 2026): what happened, the
 * outcome against what was expected, and how investors took it from the
 * day's reporting, then the pages it came from. No index's move, no book,
 * no history; no deck and no PDF.
 */
export function macroReportEmail(r: MacroReport, appUrl: string | null): AlertsEmail {
  const base = appUrl && /^https:\/\/[^/\s]+$/.test(appUrl.replace(/\/$/, "")) ? appUrl.replace(/\/$/, "") : null;
  const page = base ? `${base}/calendar?event=${encodeURIComponent(r.key)}#event-reports` : null;
  const o = r.outcome;
  const subject = (isUpdate(r) ? `${r.name}: ${o ? "still not final" : "outcome not read yet"}, as read ${clock(r.triedAt!)}` : `${r.outcomeAt && o?.final ? `${r.name}, the outcome` : `After ${r.name}`}: ${o ? outcomeLine(o) : "the outcome is not read yet"}`).slice(0, 160);
  const against = o ? againstExpected(o) : "";
  const reaction = o?.markets ?? null;
  const pages = pagesOf(o);
  const parts: [string, string][] = [
    ["What happened", o ? o.decided : (r.outcomeNote ?? "The outcome is not read yet.")],
    ...(o && (o.label || against) ? [["The outcome", [o.label && o.final ? `${o.label}.` : "", against].filter(Boolean).join(" ")] as [string, string]] : []),
    ...(o && !o.final && r.outcomeNote ? [["Not final yet", r.outcomeNote] as [string, string]] : []),
    ...(reaction ? [["How investors took it", reaction] as [string, string]] : []),
  ];
  const text = [
    `${r.name}, ${longDate(r.date)}`,
    "",
    ...parts.flatMap(([h, b]) => [`${h}:`, `  ${b}`, ""]),
    ...(pages.length ? ["Read from:", ...pages.map((x) => `  ${x.title}: ${x.url}`), ""] : []),
    page ? `On the Calendar: ${page}` : "The report is on the Calendar.",
    r.source.startsWith("https://") ? `The official page: ${r.source}` : "",
    "Not investment advice.",
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");

  const p = (s: string, color = INK) => `<p style="margin:0 0 8px;font:14px/20px Arial,sans-serif;color:${color}">${s}</p>`;
  const section = (title: string, body: string) => `<p style="margin:18px 0 6px;font:600 12px/16px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${SOFT}">${esc(title)}</p>${body}`;
  const button = (href: string, label: string) => `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border-radius:8px;background:${TEAL};color:#fff;text-decoration:none;font:600 14px/18px Arial,sans-serif">${esc(label)}</a>`;
  const html =
    `<div style="background:#f4f1ea;padding:24px 16px"><div style="max-width:620px;margin:0 auto">` +
    `<p style="margin:0 0 4px;font:600 12px/16px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${TEAL}">Invariant · After the event</p>` +
    `<h1 style="margin:0 0 4px;font:700 22px/28px Arial,sans-serif;color:${INK}">${esc(r.name)}</h1>` +
    `<p style="margin:0;font:14px/20px Arial,sans-serif;color:${SOFT}">${esc(longDate(r.date))}</p>` +
    parts.map(([h, b]) => section(h, p(esc(b), h === "Not final yet" ? SOFT : INK))).join("") +
    (pages.length ? section("Read from", `<p style="margin:0;font:14px/20px Arial,sans-serif">${pages.map((x) => `<a href="${esc(x.url)}" style="color:${TEAL}">${esc(x.title)}</a>`).join(" · ")}</p>`) : "") +
    (page ? `<div style="margin:18px 0 0">${button(page, "On the Calendar")}</div>` : "") +
    `<p style="margin:16px 0 0;font:13px/18px Arial,sans-serif;color:${SOFT}">${r.source.startsWith("https://") ? `<a href="${esc(r.source)}" style="color:${TEAL}">The official page</a>. ` : ""}Not investment advice.</p>` +
    `</div></div>`;
  return { subject, text, html };
}

/** Whether a kind is a decision on rates. */
export const isRateDecision = (kind: string) => ["fomc", "ecb", "boe", "boj", "boc", "snb"].includes(kind);
/** Whether a kind is geopolitics rather than a release or a decision. */
export const isGeopolitics = (kind: string) => GEOPOLITICS.has(kind as EconKind);
