/**
 * The Calendar agent (Hamza, 27 Oct 2026: "a calendar agent that checks for
 * all these dates and events 3 months out, at the beginning of each month").
 * The table in lib/econ-calendar.ts holds the dates the publishers set a year
 * ahead; this agent looks for the rest on the person's own Claude key, once a
 * month: elections and referendums, summits, OPEC+ meetings and the trade,
 * sanctions, funding and treaty deadlines whose dates are set in the next
 * three months. Each event needs its official page, a date inside the
 * window, one of the kinds the calendar draws and an economy it names; one the
 * table already holds is dropped. The events land on the Calendar beside the
 * table's, with the same reach in the book, and as alerts the day before.
 * Nothing here is a forecast of what the event decides.
 *
 * Pure.
 */
import { z } from "zod";

import { ECON_EVENTS, type EconArea, type EconEvent, type EconKind } from "@/lib/econ-calendar";
import { ECON_AREAS } from "@/lib/econ-exposure";
import { addDaysTo } from "@/lib/time";
import { MODELS } from "@/lib/models";

/** How far ahead the agent looks. */
export const CALENDAR_AHEAD_DAYS = 92;
/** The searches one run may make on the person's key. */
export const CALENDAR_SEARCHES = 8;
/** The events one run keeps at most. */
export const MAX_FOUND = 30;
export const CALENDAR_MODEL = MODELS.standard;
export const CALENDAR_MAX_TOKENS = 8000;
/** The alerts the found events make: apart from the table's, so a screen that did not read the file keeps them as they were. */
export const FOUND_PREFIX = "econ-found:";

/** The kinds the agent may add; the central banks and the US releases stay the table's. */
export const FOUND_KINDS = ["election", "summit", "deadline", "opec"] as const satisfies readonly EconKind[];
const AREA_IDS = Object.keys(ECON_AREAS) as [EconArea, ...EconArea[]];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const https = z
  .string()
  .max(400)
  .refine((u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" && !!url.hostname && !/^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname);
    } catch {
      return false;
    }
  });

export const foundEventSchema = z.object({
  date: z.string().regex(DAY),
  kind: z.enum(FOUND_KINDS),
  area: z.enum(AREA_IDS),
  name: z.string().min(3).max(120),
  short: z.string().min(1).max(12).optional(),
  time: z.string().max(60),
  about: z.string().max(400),
  source: https,
  /** The day the agent found it. */
  found: z.string().regex(DAY),
});
export type FoundEvent = z.infer<typeof foundEventSchema>;

export const calendarFoundSchema = z.object({
  version: z.literal(1),
  events: z.array(foundEventSchema).max(MAX_FOUND * 3).default([]),
  /** The month of the last run that came back, YYYY-MM; a failed run leaves it, so the next day tries again. */
  month: z.string().nullable().default(null),
  /** When it last ran, ISO, whether it came back or not. */
  ranAt: z.string().nullable().default(null),
  /** What the last run did, in a sentence. */
  sentence: z.string().max(400).nullable().default(null),
  updated: z.string(),
});
export type CalendarFound = z.infer<typeof calendarFoundSchema>;
export const EMPTY_FOUND: CalendarFound = { version: 1, events: [], month: null, ranAt: null, sentence: null, updated: "" };

/** Due once a month: when no run has come back this month, and none was tried today. */
export function calendarAgentDue(file: CalendarFound | null, today: string): boolean {
  if (file?.month === today.slice(0, 7)) return false;
  return file?.ranAt?.slice(0, 10) !== today;
}

/** The found events as the calendar draws them. */
export const foundEvents = (file: CalendarFound | null): EconEvent[] => (file?.events ?? []).map((e) => ({ date: e.date, kind: e.kind, area: e.area, name: e.name, short: e.short, time: e.time || "Time not set", about: `${e.about} Found by the Calendar agent on ${e.found}.`, source: e.source, indicator: null }));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const near = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= 86_400_000;

const STOP = new Set(["the", "and", "for", "of", "on", "in", "to", "a", "an", "us", "eu", "uk", "with", "its", "end", "ends", "meeting", "vote"]);
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
/** Most of the shorter name's words in the longer: "Section 301 tariff exclusions expire" is the table's "US Section 301 exclusions on Chinese products expire". */
function sameName(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true;
  const [x, y] = [words(a), words(b)];
  const small = x.size <= y.size ? x : y;
  const big = small === x ? y : x;
  return small.size >= 2 && [...small].filter((w) => big.has(w)).length / small.size >= 0.6;
}

/** Whether an event is one the table (or a find already kept) holds: the same kind in the same economy within a day, or the same event by its name within a day. */
export function alreadyHeld(e: Pick<FoundEvent, "date" | "kind" | "area" | "name">, known: readonly Pick<EconEvent, "date" | "kind" | "area" | "name">[]): boolean {
  return known.some((k) => near(k.date, e.date) && ((k.kind === e.kind && k.area === e.area) || sameName(k.name, e.name)));
}

const modelEventSchema = z.object({
  date: z.string(),
  kind: z.string(),
  area: z.string(),
  name: z.string(),
  short: z.string().optional(),
  time: z.string().optional(),
  about: z.string().optional(),
  source: z.string(),
});
const modelAnswerSchema = z.object({ events: z.array(modelEventSchema), note: z.string().optional() });

/** The one call: the window, the kinds and economies the calendar draws, what the table already holds; the web search does the finding. */
export function calendarRequestBody(today: string, known: readonly EconEvent[] = ECON_EVENTS, model = CALENDAR_MODEL): Record<string, unknown> {
  const until = addDaysTo(today, CALENDAR_AHEAD_DAYS);
  const schema = z.toJSONSchema(modelAnswerSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const held = known.filter((e) => e.date >= today && e.date <= until && (FOUND_KINDS as readonly string[]).includes(e.kind));
  const areas = AREA_IDS.map((a) => `${a} (${ECON_AREAS[a].label})`).join(", ");
  return {
    model,
    max_tokens: CALENDAR_MAX_TOKENS,
    system: `You keep a portfolio app's calendar of the dated events that move markets. Find the events set for ${today} to ${until} that the calendar does not hold yet, searching the web (at most ${CALENDAR_SEARCHES} searches).

What to look for, in the major economies and where markets watch: national elections, referendums and leadership votes; summits (G7, G20, NATO, EU Council, APEC, BRICS, major trade or peace talks with a set date); OPEC and OPEC+ meetings; deadlines with a set date (tariffs and trade truces, sanctions, government funding and debt limits, treaty and court deadlines that markets follow).

Rules:
- Only an event whose date is set and published on an official page: the government's, the electoral body's, the summit's or the organisation's own site. Never a date from a forecast, a rumour or a news story alone; the source is that official https page, one you opened.
- kind is one of: election, summit, deadline, opec. The central banks' decisions and the US releases are already on the calendar; leave them out.
- area is the economy it decides, one of: ${areas}. Use world for an event of no one economy.
- short is a chip of at most 12 characters (G7, NATO, Tariffs); time is the local time or "All day".
- about is one or two plain sentences on what it decides, no opinion, no prediction of the outcome, no advice.
- Leave out what the calendar already holds, listed below.
- When nothing new is set, record no events and say so in note.
- Your whole answer is one call to record_events; write nothing outside it.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: CALENDAR_SEARCHES },
      { name: "record_events", description: "Record the dated events found.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `Already on the calendar from ${today} to ${until}:\n${held.length ? held.map((e) => `- ${e.date} ${e.kind} ${e.area}: ${e.name}`).join("\n") : "None of these kinds."}\n\nFind what else is set for those three months, today being ${today}.` }] }],
  };
}

export type CalendarParse = { ok: true; events: FoundEvent[]; dropped: number; note: string } | { ok: false; reason: string };

/**
 * Reads the answer item by item: an event outside the window, of a kind or an
 * economy the calendar does not draw, without an https page, or one already
 * held is dropped and counted; one bad item never costs the rest.
 */
export function parseCalendarResponse(body: unknown, today: string, known: readonly EconEvent[] = ECON_EVENTS): CalendarParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_events");
  if (!call) return { ok: false, reason: (body as { stop_reason?: string } | null)?.stop_reason === "max_tokens" ? "the answer ran past its length before it recorded the events" : "the model answered in words instead of recording the events" };
  const raw = call.input as { events?: unknown; note?: unknown } | null;
  const items = Array.isArray(raw?.events) ? raw.events : null;
  if (!items) return { ok: false, reason: "the answer held no list of events" };
  const until = addDaysTo(today, CALENDAR_AHEAD_DAYS);
  const out: FoundEvent[] = [];
  let dropped = 0;
  for (const item of items) {
    const m = modelEventSchema.safeParse(item);
    if (!m.success) {
      dropped++;
      continue;
    }
    const e = foundEventSchema.safeParse({ date: m.data.date.trim(), kind: m.data.kind.trim().toLowerCase(), area: m.data.area.trim().toLowerCase(), name: m.data.name.trim().slice(0, 120), short: m.data.short?.trim().slice(0, 12) || undefined, time: (m.data.time ?? "").trim().slice(0, 60), about: (m.data.about ?? "").trim().slice(0, 400), source: m.data.source.trim(), found: today });
    if (!e.success || e.data.date < today || e.data.date > until || alreadyHeld(e.data, [...known, ...out]) || out.length >= MAX_FOUND) {
      dropped++;
      continue;
    }
    out.push(e.data);
  }
  return { ok: true, events: out, dropped, note: typeof raw?.note === "string" ? raw.note.slice(0, 300) : "" };
}

/** A run's events laid on the file: the window's events replaced by the new read, the past month kept so the calendar still shows what passed. */
export function withFound(file: CalendarFound | null, events: readonly FoundEvent[], today: string, now: Date, sentence: string): CalendarFound {
  const kept = (file?.events ?? []).filter((e) => e.date < today && e.date >= addDaysTo(today, -31));
  return calendarFoundSchema.parse({ version: 1, events: [...kept, ...events].sort((a, b) => a.date.localeCompare(b.date)), month: today.slice(0, 7), ranAt: now.toISOString(), sentence, updated: now.toISOString() });
}

/** A run that did not come back: the events kept as they were, the sentence saying why, tried again tomorrow. */
export const withFailedRun = (file: CalendarFound | null, now: Date, sentence: string): CalendarFound => calendarFoundSchema.parse({ ...(file ?? EMPTY_FOUND), ranAt: now.toISOString(), sentence, updated: now.toISOString() });

export function foundSentence(n: number, dropped: number, note: string): string {
  const base = n ? `Found ${n} dated event${n === 1 ? "" : "s"} in the next three months the calendar did not hold.` : `Found nothing new set in the next three months${note ? `: ${note}` : "."}`;
  return `${base}${dropped ? ` ${dropped} left out: outside the window, without an official page, or already on the calendar.` : ""}`.slice(0, 400);
}
