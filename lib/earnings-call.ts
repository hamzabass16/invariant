/**
 * The results call as a report carries it (Hamza, 29 Oct 2026: "Guidance is
 * basically the most important part of these earnings report and must be
 * given or integrated in a whole slide or two, testing it against my
 * thesis"; "quartr's earnings call transcript including the analyst Q&A ...
 * must be integrated in these slides"): what the company guided, each item
 * against what it guided before and against the thesis's pillars, watch items
 * and pathway; what the analysts asked and what management answered; the
 * prepared remarks' main points.
 *
 * Two ways in. The person's own Claude may write it back through
 * write_thesis as an evidence entry's `call`, in its own words: laid on the
 * report as it is, no model of the app's. Without one, the person's model
 * reads the notes added to the thesis since the results and,
 * the web, into the same shape (`callReadRequestBody`). The bearing on the
 * thesis names a pillar, a watch item or the pathway exactly as kept, or
 * none. Pure: no network, no key.
 */
import { z } from "zod";

import type { EarningsReport } from "@/lib/earnings";
import { INVESTIGATIVE } from "@/lib/investigate";

export const MAX_GUIDANCE = 10;
export const MAX_QA = 10;
export const MAX_REMARKS = 6;
export const MAX_BEATS = 14;
/** A line within this share of what was expected is in line, not a beat or a miss. */
export const INLINE_PCT = 1;
/** Searches the call read may make. */
export const CALL_SEARCHES = 6;
/** Pages read whole: the call's transcript or prepared remarks, once a search has found them (Hamza, 4 Nov 2026). */
export const CALL_FETCHES = 3;
/** The release's own documents the call read is given, at most. */
export const CALL_DOCUMENT_CHARS = 60_000;

export const GUIDANCE_CHANGES = ["raised", "lowered", "kept", "new", "withdrawn"] as const;
export type GuidanceChange = (typeof GUIDANCE_CHANGES)[number];
export const BEARINGS = ["supports", "challenges", "neutral"] as const;
export type Bearing = (typeof BEARINGS)[number];
export const SAID_WHERE = ["call", "release", "slides", "filing"] as const;
export const BEAT_RESULTS = ["beat", "miss", "inline"] as const;
export type BeatResult = (typeof BEAT_RESULTS)[number];
export const BEAT_AGAINST = ["consensus", "guidance"] as const;

const page = z.object({ title: z.string().min(1).max(160), url: z.string().regex(/^https:\/\/[^\s/]+\.[^\s]+$/).max(800) });
export type CallPage = z.infer<typeof page>;

export const guidanceItemSchema = z.object({
  metric: z.string().min(1).max(100).describe("What is guided, in the company's terms: revenue, operating margin, capital expenditure, a segment's growth."),
  period: z.string().max(40).nullable().default(null).describe("The period it is for: Q4 2026, FY2026, 2027."),
  said: z.string().min(1).max(240).describe("What the company said, with its own figures or words: $195bn to $205bn; to rise significantly."),
  before: z.string().max(240).nullable().default(null).describe("What it guided before for the same metric and period, and when; null when it gave none."),
  change: z.enum(GUIDANCE_CHANGES).nullable().default(null).describe("raised, lowered, kept, new or withdrawn against the guidance before."),
  where: z.enum(SAID_WHERE).nullable().default(null).describe("Where it was said: call, release, slides or filing."),
  bearsOn: z.string().max(200).nullable().default(null).describe("The thesis's pillar, watch item or 'pathway' it bears on, exactly as kept; null when none."),
  reading: z.enum(BEARINGS).nullable().default(null).describe("Whether it supports or challenges that part of the thesis, or neither."),
  why: z.string().max(500).nullable().default(null).describe("Why, in a sentence or two, against the thesis's own words."),
  source: page.nullable().default(null),
});
export type GuidanceItem = z.infer<typeof guidanceItemSchema>;

export const callQaSchema = z.object({
  analyst: z.string().min(1).max(120).describe("The analyst and the firm."),
  asked: z.string().min(1).max(500).describe("The question, in your own words."),
  answered: z.string().min(1).max(800).describe("Management's answer, in your own words; a short quoted phrase at most."),
  bearsOn: z.string().max(200).nullable().default(null),
  reading: z.enum(BEARINGS).nullable().default(null),
  source: page.nullable().default(null),
});
export type CallQa = z.infer<typeof callQaSchema>;

/**
 * A reported line against what was expected of it (Hamza, 29 Oct 2026: "there
 * has to be a slide showing all the beats and misses"): against the analysts'
 * consensus as the day's pages print it, or against what the company itself
 * guided for the quarter.
 */
export const beatSchema = z.object({
  line: z.string().min(1).max(100).describe("The reported line: revenue, adjusted EPS, a segment's revenue, operating margin, a KPI."),
  actual: z.string().min(1).max(80).describe("What was reported, as printed: $102.3bn, $2.87, 32.1%."),
  expected: z.string().min(1).max(80).describe("What was expected, as printed: the consensus, or the company's own guidance for the quarter."),
  against: z.enum(BEAT_AGAINST).describe("consensus (the analysts') or guidance (the company's own)."),
  result: z.enum(BEAT_RESULTS).describe(`beat, miss, or inline when within ${INLINE_PCT}%.`),
  by: z.string().max(40).nullable().default(null).describe("By how much, as the page puts it or worked from the two figures: +3.1%, $0.12."),
  source: page.nullable().default(null),
});
export type Beat = z.infer<typeof beatSchema>;

/** The call as the person's Claude writes it through write_thesis, or as the call read returns it. */
export const callReadingSchema = z.object({
  guidance: z.array(guidanceItemSchema).max(MAX_GUIDANCE).default([]).describe("Every item the company guided on the release, the slides or the call, the most consequential first."),
  qa: z.array(callQaSchema).max(MAX_QA).default([]).describe("The analysts' questions on the call and management's answers, in order."),
  remarks: z.array(z.string().min(1).max(400)).max(MAX_REMARKS).default([]).describe("The prepared remarks' main points, one line each."),
  beats: z.array(beatSchema).max(MAX_BEATS).default([]).describe("Every reported line the pages set against the analysts' consensus or the company's own guidance for the quarter: revenue, EPS, segments, margins, KPIs; beat, miss or in line."),
});
export type CallReading = z.infer<typeof callReadingSchema>;

/**
 * The call on the report: the reading, where it came from (`notes`: written
 * by the person's own Claude through write_thesis; `read`: read by the
 * person's model from the notes and the web), the source named, and the key
 * of the notes it was read from, so a new note reads it again.
 */
export const reportCallSchema = callReadingSchema.extend({
  from: z.enum(["notes", "read"]),
  source: z.string().max(200),
  at: z.string(),
  key: z.string().max(400),
  note: z.string().max(300).nullable().default(null),
});
export type ReportCall = z.infer<typeof reportCallSchema>;

/** What the thesis offers to bear on: its pillars, its watch items and its pathway, by the names they are kept under. */
export type CallLens = { text: string | null; pillars: { name: string; text: string }[]; watch: string[]; pathway: string | null; kills: string[] };
/** A note added to the thesis since the results, as the call read is given it. */
export type CallNote = { id: string; at: string; source: string; summary: string; changes: string | null };

/** The targets a bearing may name, as kept: each pillar, each watch item, "pathway" when there is one. */
export function lensTargets(lens: CallLens | null): string[] {
  if (!lens) return [];
  return [...lens.pillars.map((p) => p.name), ...lens.watch, ...(lens.pathway ? ["pathway"] : [])];
}

/** A bearing matched to a target the thesis keeps, else none: by its words, ignoring case, or as the start of a longer watch item. */
export function matchTarget(v: string | null, targets: readonly string[]): string | null {
  if (!v) return null;
  const k = v.trim().toLowerCase();
  if (!k) return null;
  return targets.find((t) => t.toLowerCase() === k) ?? targets.find((t) => t.toLowerCase().startsWith(k) || k.startsWith(t.toLowerCase())) ?? null;
}

/** The key of the notes a call is read from: their ids, so a note added since asks for the call again. */
export const notesKey = (notes: readonly CallNote[]): string => (notes.length ? notes.map((n) => n.id).sort().join(",") : "none").slice(0, 400);

/**
 * The call a person's own Claude wrote back, when one of the notes since the
 * results carries it: the newest, with the thesis's targets checked. Null
 * when none does, so the call read runs instead.
 */
export function callFromNotes(notes: readonly (CallNote & { call: CallReading | null })[], lens: CallLens | null, now: string): ReportCall | null {
  const withCall = notes.filter((n) => n.call && (n.call.guidance.length || n.call.qa.length || n.call.remarks.length || n.call.beats.length)).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!withCall?.call) return null;
  const targets = lensTargets(lens);
  const c = withCall.call;
  return reportCallSchema.parse({
    guidance: c.guidance.map((g) => ({ ...g, bearsOn: matchTarget(g.bearsOn, targets), reading: matchTarget(g.bearsOn, targets) ? g.reading : null })),
    qa: c.qa.map((q) => ({ ...q, bearsOn: matchTarget(q.bearsOn, targets), reading: matchTarget(q.bearsOn, targets) ? q.reading : null })),
    remarks: c.remarks,
    beats: c.beats,
    from: "notes",
    source: withCall.source,
    at: now,
    key: notesKey(notes),
    note: null,
  });
}

/** Hours after which a call read that came back empty is asked again. */
export const CALL_RETRY_HOURS = 24;

const emptyCall = (c: CallReading) => !c.guidance.length && !c.qa.length && !c.remarks.length && !c.beats.length;

/**
 * A call the app read with no analysts' Q&A (the transcript not posted yet;
 * the release and its remarks come first) is read again every
 * TRANSCRIPT_RETRY_HOURS until TRANSCRIPT_RETRY_DAYS after the results day
 * (Hamza, 4 Nov 2026: read until a transcript is found).
 */
export const TRANSCRIPT_RETRY_HOURS = 6;
export const TRANSCRIPT_RETRY_DAYS = 3;

/** Whether a report is owed a call read: read, and its call missing, read from other notes, empty and a day old, or without its Q&A while the results are recent. */
export function callDue(r: Pick<EarningsReport, "status" | "call"> & { date?: string }, key: string, now: string): boolean {
  if (r.status !== "release" && r.status !== "complete") return false;
  if (!r.call || r.call.key !== key) return true;
  const since = Date.parse(now) - Date.parse(r.call.at);
  if (emptyCall(r.call)) return since > CALL_RETRY_HOURS * 3_600_000;
  if (r.call.from !== "read" || r.call.qa.length || !r.date) return false;
  const within = Date.parse(now) - Date.parse(`${r.date}T00:00:00Z`) <= (TRANSCRIPT_RETRY_DAYS + 1) * 86_400_000;
  return within && since > TRANSCRIPT_RETRY_HOURS * 3_600_000;
}

/** The key a brief keeps of the call it was written from: when and how the call was read, so a new reading writes it again. */
export const callKeyOf = (c: ReportCall | null | undefined): string | null => (c && !emptyCall(c) ? `${c.from}:${c.at}`.slice(0, 400) : null);

/** What a thesis offers the call read: its words, pillars, watch items and pathway, and the record's kill signals and triggers as the report reads them. */
export function lensOf(thesis: { text: string; pillars: readonly { name: string; text: string }[]; watch: readonly string[]; pathway: string | null } | null, triggers: readonly { kind: string; label: string }[]): CallLens | null {
  if (!thesis && !triggers.length) return null;
  return { text: thesis?.text.trim() || null, pillars: (thesis?.pillars ?? []).map((p) => ({ name: p.name, text: p.text })), watch: [...(thesis?.watch ?? [])], pathway: thesis?.pathway ?? null, kills: triggers.map((t) => `${t.kind === "kill" ? "Kill signal" : "Trigger"}: ${t.label}`) };
}

/** The evidence added since the results as the call read takes it. */
export function notesOf(evidence: readonly { id: string; at: string; source: string; summary: string; changes: string | null; call?: CallReading | null }[]): (CallNote & { call: CallReading | null })[] {
  return evidence.map((e) => ({ id: e.id, at: e.at, source: e.source, summary: e.summary, changes: e.changes, call: e.call ?? null }));
}

/** The call as words, for the brief's material and the email. */
export function callWords(c: CallReading | null | undefined): string {
  if (!c || emptyCall(c)) return "";
  return [
    c.guidance.length ? `Guidance:\n${c.guidance.map((g) => `- ${g.metric}${g.period ? ` (${g.period})` : ""}: ${g.said}${g.before ? ` Before: ${g.before}.` : ""}${g.change ? ` ${CHANGE_WORD[g.change]}.` : ""}${g.bearsOn ? ` Bears on ${g.bearsOn}${g.reading ? `, ${BEARING_WORD[g.reading].toLowerCase()}` : ""}.` : ""}${g.why ? ` ${g.why}` : ""}`).join("\n")}` : null,
    c.beats.length ? `Against expectations:\n${c.beats.map((b) => `- ${b.line}: ${b.actual} against ${b.expected} (${b.against}), ${RESULT_WORD[b.result].toLowerCase()}${b.by ? ` by ${b.by}` : ""}.`).join("\n")}` : null,
    c.remarks.length ? `Prepared remarks:\n${c.remarks.map((m) => `- ${m}`).join("\n")}` : null,
    c.qa.length ? `Analysts' questions:\n${c.qa.map((q) => `- ${q.analyst} asked: ${q.asked} Answer: ${q.answered}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const lensWords = (lens: CallLens | null): string => lensText(lens);

const lensText = (lens: CallLens | null): string => {
  if (!lens) return "No thesis is kept for this company; leave bearsOn null.";
  const parts = [
    lens.text ? `The thesis, in the person's words:\n${lens.text.slice(0, 2500)}` : null,
    lens.pillars.length ? `Pillars (name: what must stay true):\n${lens.pillars.map((p) => `- ${p.name}: ${p.text.slice(0, 300)}`).join("\n")}` : null,
    lens.watch.length ? `Watch items:\n${lens.watch.map((w) => `- ${w}`).join("\n")}` : null,
    lens.pathway ? `pathway: ${lens.pathway.slice(0, 800)}` : null,
    lens.kills.length ? `Kill signals and triggers on the record:\n${lens.kills.map((k) => `- ${k}`).join("\n")}` : null,
  ];
  return parts.filter(Boolean).join("\n\n");
};

/** The tool the answer must fit: the reading, each web item with its page, each item from the notes marked so. */
const callToolSchema = () => {
  const item = <T extends z.ZodRawShape>(shape: z.ZodObject<T>) => shape.extend({ fromNotes: z.boolean().default(false).describe("true when the item comes from the notes given, not a page you found.") });
  const schema = z.toJSONSchema(z.object({ guidance: z.array(item(guidanceItemSchema)).max(MAX_GUIDANCE), qa: z.array(item(callQaSchema)).max(MAX_QA), remarks: z.array(z.string().max(400)).max(MAX_REMARKS), beats: z.array(item(beatSchema)).max(MAX_BEATS) }), { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
};

/**
 * The call read on the person's model: the notes added since the results
 * first (what their own Claude read in the call), then, the
 * web for the call as reported (the guidance is often given on the call, not
 * in the release); every item bearing on the thesis by the names it keeps.
 */
export function callReadRequestBody(
  r: Pick<EarningsReport, "symbol" | "name" | "date" | "quarter" | "release">,
  facts: string,
  lens: CallLens | null,
  notes: readonly CallNote[],
  model: string,
  web: boolean,
  material: { documents?: string | null; fetch?: boolean } = {},
): Record<string, unknown> {
  const targets = lensTargets(lens);
  const docs = material.documents ? material.documents.slice(0, CALL_DOCUMENT_CHARS) : null;
  const fetch = web && !!material.fetch;
  return {
    model,
    max_tokens: 8000,
    system: `You read one company's results call for a private investor's portfolio app: what the company guided, what the analysts asked and what management answered, and the prepared remarks.${web ? ` Search the web for the call as reported that day: its transcript coverage, the guidance the CFO gave, the analysts' questions. The guidance is often given only on the call, not in the release, so search for it by name ("${r.name ?? r.symbol} ${r.quarter ? r.quarter.replace("/", " ") : ""} earnings call guidance", "outlook", "capex", "CFO"). At most ${CALL_SEARCHES} searches.${fetch ? ` Where a search finds the call's transcript or the prepared remarks (the company's investor relations site, or a publisher that prints the transcript in full), fetch that page and read it whole, at most ${CALL_FETCHES} fetches, so the guidance, the remarks and the Q&A come from the call itself.` : ""}` : docs ? " You have no web search: read the release's documents and the notes, and say less rather than guess." : " You have no web search: read the notes alone, and say less rather than guess."}${docs && r.release ? ` The release's own documents as filed with the SEC are given below: the press release and its exhibits, which often hold the CFO commentary, the prepared remarks, the shareholder letter or the slides. Read the guidance there first. An item from them takes the filing's page, ${r.release.url}, titled "${r.release.form} filed ${r.release.filed}".` : ""}

Rules:
- The notes below are what the person's own Claude read in the call and the documents; use them first, marked fromNotes. A web item needs its page (a real https URL and title).
- guidance: every item the company guided for a coming quarter, year or later year, the most consequential first: revenue, margins, expenses, capital expenditure, a segment, share count, buybacks, and words without a figure ("2027 capex to rise significantly"). Give what it guided before for the same metric and period, and whether this raised, lowered, kept, began or withdrew it. Never a figure the company did not give; never an analyst's estimate as guidance.
- qa: each analyst's question and management's answer, in your own words (a short quoted phrase at most), in the order asked, up to ${MAX_QA}.
- remarks: the prepared remarks' main points, one line each, up to ${MAX_REMARKS}.
- beats: every reported line the pages set against what was expected, up to ${MAX_BEATS}: revenue, EPS (say adjusted or GAAP), each segment, margins, the company's KPIs; against the analysts' consensus as a page prints it, or against what the company itself guided for this quarter. actual and expected as printed; result beat, miss, or inline when within ${INLINE_PCT}%. Never an expectation no page gives.
- bearsOn: one of these exactly, or null: ${targets.length ? targets.map((t) => `"${t}"`).join(", ") : "none (no thesis is kept)"}. reading: whether the item supports or challenges that part of the thesis, or neither; why: in a sentence or two against the thesis's own words.
${INVESTIGATIVE}
- Whole sentences; no opinion, no advice, no exclamation marks.
- Your whole answer is one call to record_call; write nothing outside it.`,
    tools: [...(web ? [{ type: "web_search_20250305", name: "web_search", max_uses: CALL_SEARCHES }] : []), ...(fetch ? [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: CALL_FETCHES }] : []), { name: "record_call", description: "Record the reading of the call.", input_schema: callToolSchema() }],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              facts,
              "",
              lensText(lens),
              "",
              notes.length ? `Notes added to the thesis since the results, by the person's own Claude or the person:\n${notes.map((n) => `[${n.at}] ${n.source}: ${n.summary}${n.changes ? ` Changed: ${n.changes}` : ""}`).join("\n\n")}` : "No notes were added to the thesis since the results.",
              ...(docs ? ["", `The release's documents as filed with the SEC:\n${docs}`] : []),
              "",
              "Read the call.",
            ].join("\n"),
          },
        ],
      },
    ],
  };
}

// The answer read item by item: a field over its length cut at a sentence, an item that does not hold left out, never the whole reading.
export function sentenceCut(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const at = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "));
  if (at > max / 3) return head.slice(0, at + 1);
  const clause = Math.max(head.lastIndexOf("; "), head.lastIndexOf(", "));
  return `${head.slice(0, clause > max / 3 ? clause : head.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}.`;
}
function listOf(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const j: unknown = JSON.parse(v);
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  }
  return [];
}
function pageOf(v: unknown): CallPage | null {
  const x = (v ?? {}) as Record<string, unknown>;
  const url = typeof x.url === "string" ? x.url.trim() : "";
  const r = page.safeParse({ title: sentenceCut(x.title, 160) || url.slice(0, 160), url });
  return r.success ? r.data : null;
}
const oneOf = <T extends string>(v: unknown, of: readonly T[]): T | null => (typeof v === "string" && (of as readonly string[]).includes(v) ? (v as T) : null);

export type CallParse = { ok: true; reading: CallReading; dropped: number } | { ok: false; reason: string };

export function parseCallResponse(body: unknown, targets: readonly string[]): CallParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_call");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the call" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  let dropped = 0;
  const sourced = (x: Record<string, unknown>): { source: CallPage | null; ok: boolean } => {
    const source = pageOf(x.source);
    return { source, ok: x.fromNotes === true || !!source };
  };
  const guidance = listOf(raw.guidance)
    .map((g) => {
      const x = (g ?? {}) as Record<string, unknown>;
      const metric = sentenceCut(x.metric, 100);
      const said = sentenceCut(x.said, 240);
      const s = sourced(x);
      if (!metric || !said || !s.ok) {
        dropped += 1;
        return null;
      }
      const bearsOn = matchTarget(typeof x.bearsOn === "string" ? x.bearsOn : null, targets);
      return { metric, period: sentenceCut(x.period, 40) || null, said, before: sentenceCut(x.before, 240) || null, change: oneOf(x.change, GUIDANCE_CHANGES), where: oneOf(x.where, SAID_WHERE), bearsOn, reading: bearsOn ? oneOf(x.reading, BEARINGS) : null, why: sentenceCut(x.why, 500) || null, source: s.source };
    })
    .filter((g): g is GuidanceItem => !!g)
    .slice(0, MAX_GUIDANCE);
  const qa = listOf(raw.qa)
    .map((q) => {
      const x = (q ?? {}) as Record<string, unknown>;
      const analyst = sentenceCut(x.analyst, 120);
      const asked = sentenceCut(x.asked, 500);
      const answered = sentenceCut(x.answered, 800);
      const s = sourced(x);
      if (!analyst || !asked || !answered || !s.ok) {
        dropped += 1;
        return null;
      }
      const bearsOn = matchTarget(typeof x.bearsOn === "string" ? x.bearsOn : null, targets);
      return { analyst, asked, answered, bearsOn, reading: bearsOn ? oneOf(x.reading, BEARINGS) : null, source: s.source };
    })
    .filter((q): q is CallQa => !!q)
    .slice(0, MAX_QA);
  const remarks = listOf(raw.remarks)
    .map((m) => sentenceCut(m, 400))
    .filter(Boolean)
    .slice(0, MAX_REMARKS);
  const beats = listOf(raw.beats)
    .map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      const line = sentenceCut(x.line, 100);
      const actual = sentenceCut(x.actual, 80);
      const expected = sentenceCut(x.expected, 80);
      const against = oneOf(x.against, BEAT_AGAINST);
      const result = oneOf(x.result, BEAT_RESULTS);
      const s = sourced(x);
      if (!line || !actual || !expected || !against || !result || !s.ok) {
        dropped += 1;
        return null;
      }
      return { line, actual, expected, against, result, by: sentenceCut(x.by, 40) || null, source: s.source };
    })
    .filter((b): b is Beat => !!b)
    .slice(0, MAX_BEATS);
  if (!guidance.length && !qa.length && !remarks.length && !beats.length) return { ok: false, reason: dropped ? "every item lacked its page or its words" : "the reading held no guidance, question or remark" };
  return { ok: true, reading: { guidance, qa, remarks, beats }, dropped };
}

/** The guidance in a line, for a card or an email: the first items as said, with the change. */
export function guidanceLine(call: CallReading | null | undefined, n = 2): string | null {
  const g = call?.guidance ?? [];
  if (!g.length) return null;
  return g
    .slice(0, n)
    .map((x) => `${x.metric}${x.period ? ` (${x.period})` : ""}: ${x.said.replace(/\.$/, "")}${x.change ? `, ${x.change}` : ""}`)
    .join("; ")
    .concat(".");
}

export const CHANGE_WORD: Record<GuidanceChange, string> = { raised: "Raised", lowered: "Lowered", kept: "Kept", new: "New", withdrawn: "Withdrawn" };
export const BEARING_WORD: Record<Bearing, string> = { supports: "Supports", challenges: "Challenges", neutral: "Neither" };

/** A beat as the slide draws it: the reader's, or the app's own (diluted EPS against Nasdaq's consensus for the quarter). */
export type BeatRow = Beat & { app: boolean };

const num = (v: string): number | null => {
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/**
 * Every beat and miss the report knows: the call reading's, then the app's
 * own diluted EPS against the analysts' consensus Nasdaq published for the
 * quarter, when the reading has no EPS line against the consensus and the
 * figures are in US dollars. The consensus is the analysts', labelled so and
 * never a verdict; it may be on an adjusted basis, which the row says.
 */
export function beatsOf(r: { figures: readonly { label: string; now: string }[]; currency: string | null; consensusEps?: number | null; estimates?: number | null; call?: { beats?: Beat[] } | null }): BeatRow[] {
  const read: BeatRow[] = (r.call?.beats ?? []).map((b) => ({ ...b, app: false }));
  const eps = r.figures.find((f) => /^EPS/i.test(f.label));
  const has = read.some((b) => b.against === "consensus" && /EPS|per share/i.test(b.line));
  const c = r.consensusEps ?? null;
  const usd = !r.currency || r.currency.toUpperCase() === "USD";
  const actual = eps ? num(eps.now) : null;
  if (has || c === null || actual === null || !usd) return read;
  const diff = actual - c;
  const pct = c !== 0 ? (diff / Math.abs(c)) * 100 : null;
  const result: BeatResult = pct !== null && Math.abs(pct) < INLINE_PCT ? "inline" : diff > 0 ? "beat" : diff < 0 ? "miss" : "inline";
  const by = `${diff >= 0 ? "+" : "-"}$${Math.abs(diff).toFixed(2)}${pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}`;
  return [{ line: "EPS, diluted (GAAP)", actual: `$${actual.toFixed(2)}`, expected: `$${c.toFixed(2)}${r.estimates ? `, ${r.estimates} estimate${r.estimates === 1 ? "" : "s"}` : ""}`, against: "consensus", result, by, source: null, app: true }, ...read];
}

export const RESULT_WORD: Record<BeatResult, string> = { beat: "Beat", miss: "Miss", inline: "In line" };
