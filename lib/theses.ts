import { z } from "zod";

import { dcfInputsSchema, dcfSummary, runDcf, type DcfInputs, type DcfResult } from "@/lib/dcf";
import { callReadingSchema, sentenceCut, type CallReading } from "@/lib/earnings-call";
import { MAX_READS, reportKey, symbolKey, type AddedRead, type EarningsEntry, type EarningsFile, type EarningsReport } from "@/lib/earnings";
import { recordFields, type Holding, type HoldingRecord } from "@/lib/holdings";
import { daysBetween } from "@/lib/time";
import { marketDef, MARKET_SYMBOLS } from "@/lib/markets";
import { FIELDS, FUNDAMENTAL_FIELDS, STAGES } from "@/lib/ontology";
import type { Study } from "@/lib/research";
import { ownValuationFrom, runValuation, stageOf, VALUATION_METHODS, valuationInputsSchema, valuationSummary, type ValuationInputs, type ValuationMethod, type ValuationResult, type ValuationSeed, type ValuationSummary } from "@/lib/valuation";

/**
 * Theses: for each holding, what the person believes and what must stay
 * true, kept in their vault's `theses` file beside the record (triggers,
 * kill signals, the own valuation; lib/preferences.ts). The Theses screen
 * replicates HCMP's holding folder in Drive (Hamza, 16 Oct 2026): the
 * record, the research Doc on the stock template, the charts, the deep
 * dive and the post-earnings reaction, the archive. Here that is the
 * thesis in the person's words, its pillars each with the figure that tests
 * it and today's reading, the pathway, the watch items, the Valuation
 * calculator (lib/valuation.ts: the stage from the filings, the metrics
 * useful at it, the DCF of lib/dcf.ts) whose chosen cases become the
 * record's own valuation, the latest
 * post-earnings report with its earnings deck, the latest study on Research,
 * and the earlier ones. Every post-earnings deck reads the thesis, the
 * pillars and the valuation from here, so a deck is never missing them once they
 * are written. Pure: no vault, no network.
 *
 * Theses are split (Hamza, 18 Oct 2026): market theses (what the person
 * believes about rates, a cycle, a theme, kept in the same file under
 * `markets`, each pillar tested on a market indicator's level) and stock
 * theses, the latter listed as holdings and watchlist on the screen. A
 * thesis is filled in by the person, or by their own Claude through the
 * connector (`write_thesis` in lib/mcp-tools.ts, applied by `writeThesis`
 * here), and "Add to thesis" has their Claude fold a document they read
 * into it: an `evidence` entry (what it said, what it changed) and, where
 * the document changes them, the words, the pillars or the watch items.
 */


export const PILLAR_TAGS = ["supported", "mixed", "risk", "unread"] as const;
export type PillarTag = (typeof PILLAR_TAGS)[number];
export const PILLAR_TAG_LABEL: Record<PillarTag, string> = { supported: "Supported", mixed: "Mixed", risk: "Risk", unread: "No reading" };

export const pillarSchema = z.object({
  id: z.string().min(1).max(20),
  name: z.string().min(1).max(80),
  /** What must stay true, in a sentence or two. */
  text: z.string().max(600),
  /** The figure that tests it: a fundamental field of the ontology, or the price, at or above or at or below a level; null for a pillar the filings cannot read. */
  test: z.object({ field: z.string().min(1).max(40), is: z.enum(["gte", "lte"]), value: z.number() }).nullable().default(null),
});
export type Pillar = z.infer<typeof pillarSchema>;

export const MAX_PILLARS = 6;
export const MAX_WATCH = 8;
/** Evidence entries kept per thesis; the oldest leave first. */
export const MAX_EVIDENCE = 40;
export const MAX_MARKET_THESES = 20;
/** Companies in a market thesis's basket. */
export const MAX_BASKET = 12;
export const MARKET_THESIS_LIMIT_WORDS = `There are already ${MAX_MARKET_THESES} market theses; remove one before adding another.`;

export const EVIDENCE_KINDS = ["document", "data", "note"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** What was folded into a thesis: a document, data or a note, read by the person's Claude ("claude") or written by the person ("you"). */
export const evidenceSchema = z.object({
  id: z.string().min(1).max(24),
  /** The day it was added, YYYY-MM-DD. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The document's title, the data's name, or a few words naming the note. */
  source: z.string().min(1).max(200),
  kind: z.enum(EVIDENCE_KINDS),
  /** What it says that bears on the thesis, in a paragraph. */
  summary: z.string().min(1).max(1500),
  /** What it changed in the thesis (the words, a pillar, a watch item), or null when nothing changed. */
  changes: z.string().max(800).nullable().default(null),
  via: z.enum(["claude", "you"]),
  /** The results call as the person's own Claude read it (lib/earnings-call.ts): the guidance, the analysts' questions and the answers, the prepared remarks; null for any other entry. */
  call: callReadingSchema.nullable().optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

// ---------------------------------------------------------------------------
// Charts and pictures (Hamza, 20 Oct 2026: "allow claude through MCP to add
// images and charts to the theses")

export const MAX_FIGURES = 12;
export const MAX_FIGURE_POINTS = 120;
export const MAX_FIGURE_SERIES = 4;

/** An https address on a named host: never a data: address, a bare IP or this machine, so a picture is only ever drawn from a public page. */
export function publicImageUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  return u.protocol === "https:" && host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":") && host !== "localhost" && !host.endsWith(".local") && !host.endsWith(".internal") && !u.username && !u.password;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A chart the app draws itself from the figures given: a line over dates or bars over labels, on one axis, in one unit. */
export const figureChartSchema = z.object({
  type: z.enum(["line", "bar"]),
  /** The x-axis: dates (YYYY-MM-DD, oldest first) for a line; years, quarters or names for bars. */
  labels: z.array(z.string().min(1).max(40)).min(2).max(MAX_FIGURE_POINTS),
  series: z.array(z.object({ name: z.string().min(1).max(60), values: z.array(z.number().finite().nullable()) })).min(1).max(MAX_FIGURE_SERIES),
  /** The one unit every value is in: "%", "x", "USD bn"; empty for a plain number. */
  unit: z.string().max(12).default(""),
});
export type FigureChart = z.infer<typeof figureChartSchema>;

export const thesisFigureSchema = z.object({
  id: z.string().min(1).max(24),
  title: z.string().min(1).max(120),
  /** What it shows and why it bears on the thesis, in a sentence or two. */
  caption: z.string().max(400).nullable().default(null),
  /** Where the picture or the figures come from: a filing, a page, a dataset. */
  source: z.string().min(1).max(200),
  sourceUrl: z.string().max(1000).nullable().default(null),
  /** The day it was added, YYYY-MM-DD. */
  at: z.string().regex(DAY),
  /** Who added it: the person's Claude through the connector, the person, or the Thesis Hunter (lib/thesis-hunter.ts). */
  via: z.enum(["claude", "you", "hunter"]),
  /** A picture from a public https address, drawn from its own host with no referrer; the app keeps the address alone. */
  image: z.object({ url: z.string().max(1000).refine(publicImageUrl, "a public https address"), alt: z.string().max(200).default("") }).nullable().default(null),
  chart: figureChartSchema.nullable().default(null),
});
export type ThesisFigure = z.infer<typeof thesisFigureSchema>;

export const thesisSchema = z.object({
  /** The thesis in the person's own words: a few paragraphs. */
  text: z.string().max(6000),
  pillars: z.array(pillarSchema).max(MAX_PILLARS).default([]),
  /** The pathway: what the business must become over the holding period, where the methodology asks for one. */
  pathway: z.string().max(1500).nullable().default(null),
  /** What to watch, in words: things the reviews report that are not triggers. */
  watch: z.array(z.string().max(200)).max(MAX_WATCH).default([]),
  dcf: dcfInputsSchema.nullable().default(null),
  /** The Valuation calculator's inputs: the stage when the person set one, the method, the estimates (lib/valuation.ts); null before any are kept. */
  valuation: valuationInputsSchema.nullable().default(null),
  /** What was added to the thesis over time (Hamza, 18 Oct 2026), newest last. Files written before it existed carry none. */
  evidence: z.array(evidenceSchema).max(MAX_EVIDENCE).default([]),
  /** Charts and pictures that bear on it, oldest first (Hamza, 20 Oct 2026). */
  figures: z.array(thesisFigureSchema).max(MAX_FIGURES).default([]),
  /** The day the thesis was first written, for the scorecard against SPY (Hamza, 23 Oct 2026); kept by `withThesis`. Files written before it carry none. */
  since: z.string().regex(DAY).nullable().default(null),
  updatedAt: z.string(),
});
export type Thesis = z.infer<typeof thesisSchema>;

/**
 * A market thesis: what the person believes about rates, a cycle, a sector or
 * a theme, with pillars each tested on a market indicator's level (the
 * indicator's symbol in `test.field`: VIX, US10Y, FEARGREED...), the watch
 * items and the evidence folded in. It names no holding.
 */
export const marketThesisSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  title: z.string().min(1).max(120),
  text: z.string().max(6000),
  pillars: z.array(pillarSchema).max(MAX_PILLARS).default([]),
  watch: z.array(z.string().max(200)).max(MAX_WATCH).default([]),
  evidence: z.array(evidenceSchema).max(MAX_EVIDENCE).default([]),
  figures: z.array(thesisFigureSchema).max(MAX_FIGURES).default([]),
  /** The companies that express it, measured together against SPY from `since` (a thesis basket; Hamza, 23 Oct 2026). Measured only; it changes no rule and buys nothing. */
  basket: z.array(z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/)).max(MAX_BASKET).default([]),
  since: z.string().regex(DAY).nullable().default(null),
  updatedAt: z.string(),
});
export type MarketThesis = z.infer<typeof marketThesisSchema>;

export const thesesFileSchema = z.object({
  version: z.literal(1),
  /** The stock theses, by symbol. */
  bySymbol: z.record(z.string().max(40), thesisSchema),
  /** The market theses, in the order written. Files written before they existed carry none. */
  markets: z.array(marketThesisSchema).max(MAX_MARKET_THESES).default([]),
  updated: z.string(),
});
export type ThesesFile = z.infer<typeof thesesFileSchema>;
export const EMPTY_THESES: ThesesFile = { version: 1, bySymbol: {}, markets: [], updated: "" };
export const EMPTY_THESIS: Omit<Thesis, "updatedAt"> = { text: "", pillars: [], pathway: null, watch: [], dcf: null, valuation: null, evidence: [], figures: [], since: null };

/**
 * The day a thesis was first written: kept as written, else the day the one
 * before it carried, else its first evidence, else today. A thesis with no
 * words yet has none.
 */
export function sinceFor<T extends { text: string; since: string | null; evidence: Evidence[] }>(next: T, prev: T | null, now: string): string | null {
  if (!next.text.trim()) return next.since ?? prev?.since ?? null;
  return next.since ?? prev?.since ?? next.evidence.map((e) => e.at).sort()[0] ?? now.slice(0, 10);
}

/** The day a thesis is measured from, and whether that day is only its last change (a thesis written before the day was kept). */
export function measuredFrom(t: { since: string | null; evidence: Evidence[]; updatedAt: string }): { day: string; approx: boolean } {
  if (t.since) return { day: t.since, approx: false };
  const first = t.evidence.map((e) => e.at).sort()[0];
  return first ? { day: first, approx: true } : { day: t.updatedAt.slice(0, 10), approx: true };
}

/** A basket typed as words: tickers split on commas, spaces or lines, upper-cased, each once, at most MAX_BASKET. */
export function basketFrom(typed: string): string[] {
  return [...new Set(typed.toUpperCase().split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(x)))].slice(0, MAX_BASKET);
}

/** A market thesis's id from its title: lower-case words joined by dashes. */
export function marketThesisId(title: string): string {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return id || "thesis";
}

/** The market thesis with an id, or whose title reads the same, or null. */
export function marketThesisFor(file: ThesesFile | null, idOrTitle: string): MarketThesis | null {
  const want = idOrTitle.trim().toLowerCase();
  return (file?.markets ?? []).find((m) => m.id === want || m.title.trim().toLowerCase() === want || m.id === marketThesisId(idOrTitle)) ?? null;
}

/** The file with one market thesis replaced (or removed with null), in its place. */
export function withMarketThesis(file: ThesesFile, id: string, thesis: MarketThesis | null, now: string): ThesesFile {
  const markets = file.markets.filter((m) => m.id !== id);
  const at = file.markets.findIndex((m) => m.id === id);
  if (thesis) markets.splice(at < 0 ? markets.length : at, 0, { ...thesis, since: sinceFor(thesis, file.markets[at] ?? null, now) });
  return { ...file, markets, updated: now };
}

/** The readings a market thesis's pillars are scored on: each indicator's latest level by symbol. */
export const marketReadings = (rows: readonly { symbol: string; level: number }[]): Record<string, number> => Object.fromEntries(rows.map((r) => [r.symbol, r.level]));

/** The figure a pillar's test may name: the price or a fundamental field for a stock, an indicator's symbol for a market thesis. */
export function pillarFieldOk(field: string, subject: "stock" | "market"): boolean {
  if (subject === "market") return (MARKET_SYMBOLS as readonly string[]).includes(field.toUpperCase());
  return field === "price" || (FUNDAMENTAL_FIELDS as readonly string[]).includes(field);
}

/** The name of the figure a pillar's test reads, for the reading's words. */
export function pillarFieldName(field: string): string {
  if (field === "price") return "Price";
  const m = marketDef(field);
  if (m) return m.name;
  return (FIELDS as Record<string, { label: string }>)[field]?.label ?? field.replace(/_/g, " ");
}

/** A new evidence entry's id: the day and a short random tail, unique within a thesis. */
export const evidenceId = (at: string, taken: readonly string[] = []): string => {
  let id = "";
  do id = `e${at.replace(/-/g, "").slice(2)}${Math.random().toString(36).slice(2, 6)}`;
  while (taken.includes(id));
  return id;
};

/** The thesis with an evidence entry added, the oldest dropped past the limit, dated and timed now. */
export function withEvidence<T extends { evidence: Evidence[]; updatedAt: string }>(thesis: T, entry: Omit<Evidence, "id" | "call"> & { call?: CallReading | null }, now: string): T {
  const e: Evidence = { ...entry, call: entry.call ?? null, id: evidenceId(entry.at, thesis.evidence.map((x) => x.id)) };
  return { ...thesis, evidence: [...thesis.evidence, e].slice(-MAX_EVIDENCE), updatedAt: now };
}

/** What was folded into a thesis on or after a day, newest first: what the person's Claude or the person added since a company's results (Hamza, 26 Oct 2026). */
export function addedSince(thesis: { evidence: Evidence[] } | null, day: string): Evidence[] {
  return (thesis?.evidence ?? []).filter((e) => e.at >= day).sort((a, b) => b.at.localeCompare(a.at));
}

/** How far back the results a person's Claude is pointed to reach. */
export const RESULTS_READ_DAYS = 21;

/**
 * The results a followed company released in the past RESULTS_READ_DAYS,
 * newest first, one per company, each with what was added to its thesis
 * since: what the person's own Claude, on a schedule they set, reads next
 * from the sources they connect it to, and writes back with write_thesis
 * (Hamza, 26 Oct 2026). The app reads no such source itself.
 */
/**
 * Whether the call is read for a company's results: an entry added since
 * them carries the call (guidance, questions, remarks or beats). An entry
 * without it, such as one written before the call was asked for (Hamza,
 * 29 Oct 2026: a thesis with evidence must still get the call's content),
 * leaves the results to read once more.
 */
export const callRead = (added: readonly Evidence[]): boolean => added.some((e) => !!e.call && (e.call.guidance.length + e.call.qa.length + e.call.remarks.length + e.call.beats.length > 0));

export function resultsToRead(earnings: EarningsFile | null, file: ThesesFile | null, today: string): { key: string; symbol: string; name: string | null; date: string; quarter: string | null; figuresIn: boolean; added: Evidence[]; read: boolean }[] {
  const seen = new Set<string>();
  const out: ReturnType<typeof resultsToRead> = [];
  for (const r of [...(earnings?.reports ?? [])].sort((a, b) => b.date.localeCompare(a.date))) {
    if (r.status !== "release" && r.status !== "complete") continue;
    const age = daysBetween(r.date, today);
    if (age < 0 || age > RESULTS_READ_DAYS) continue;
    const k = symbolKey(r.symbol);
    if (seen.has(k)) continue;
    seen.add(k);
    const added = addedSince(thesisFor(file, r.symbol), r.date);
    out.push({ key: reportKey(r), symbol: r.symbol.toUpperCase(), name: r.name, date: r.date, quarter: r.quarter, figuresIn: r.status === "complete", added, read: callRead(added) });
  }
  return out;
}

/** How often the person's results routine runs, as its own Claude is told to keep it. */
export const ROUTINE_SCHEDULES = ["every 6 hours", "every day", "every week"] as const;
export type RoutineSchedule = (typeof ROUTINE_SCHEDULES)[number];
/** Days ahead a followed company's results make the routine look every day. */
export const ROUTINE_DAILY_DAYS = 7;
/** Days after its results a company not yet read keeps the routine looking every 6 hours; after that, every day while it is listed. */
export const ROUTINE_RETRY_DAYS = 3;

/**
 * The schedule the person's results routine should keep, from the results
 * calendar the app already reads, so a month with no results costs a run a
 * week (Hamza, 26 Oct 2026: "barely costs or consumes anything in
 * no-earnings months"): every 6 hours from a followed company's results
 * day until it is read, or ROUTINE_RETRY_DAYS after; every day
 * while one reports within ROUTINE_DAILY_DAYS or an older one waits; every
 * week otherwise. A calendar that could not be read keeps it daily. Each run
 * sets its own schedule from this, so nothing is guessed by the model.
 */
export function routineSchedule(rows: ReturnType<typeof resultsToRead>, entries: readonly EarningsEntry[] | null, file: ThesesFile | null, today: string): { every: RoutineSchedule; why: string; next: EarningsEntry | null } {
  const ahead = (entries ?? []).filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const next = ahead[0] ?? null;
  const slot = (e: EarningsEntry) => (e.time === "pre" ? ", before the open" : e.time === "post" ? ", after the close" : "");
  const at = (e: EarningsEntry) => `${e.symbol} on ${e.date}${slot(e)}`;
  const unread = rows.filter((r) => !r.read);
  const recent = unread.find((r) => daysBetween(r.date, today) <= ROUTINE_RETRY_DAYS);
  if (recent) return { every: "every 6 hours", why: `${recent.symbol}'s results of ${recent.date} are not read yet`, next };
  const near = (entries ?? []).find((e) => { const d = daysBetween(e.date, today); return d <= ROUTINE_RETRY_DAYS && d >= 0 && !addedSince(thesisFor(file, e.symbol), e.date).length; });
  if (near) return { every: "every 6 hours", why: near.date === today ? `${near.symbol} reports today${slot(near)}` : `${near.symbol}'s results of ${near.date} are not read yet`, next };
  if (unread.length) return { every: "every day", why: `${unread.map((r) => r.symbol).join(", ")} still to read`, next };
  if (!entries) return { every: "every day", why: "the results calendar could not be read just now", next: null };
  if (next && daysBetween(today, next.date) <= ROUTINE_DAILY_DAYS) return { every: "every day", why: `the next results are ${at(next)}`, next };
  return { every: "every week", why: next ? `the next results are ${at(next)}` : "no followed company has a results date on the calendar yet", next };
}

/** What was added since the results as a report carries it: the newest MAX_READS, clipped to the report's lengths. */
export function addedReads(evidence: readonly Evidence[]): AddedRead[] {
  return evidence.slice(0, MAX_READS).map((e) => ({ at: e.at, source: e.source.slice(0, 200), summary: e.summary.slice(0, 600), changes: e.changes ? sentenceCut(e.changes, 300) || e.changes.slice(0, 300) : null }));
}

/**
 * The reports of the past RESULTS_READ_DAYS with what was added to each
 * thesis since its results laid on their detail, so the report, its decks and
 * its email carry what the person's own Claude read after the results. A
 * report whose reads changed has its earnings deck made again (its kept deck
 * marked older than the report, still embedded until the new one is kept);
 * the report keeps its date, so its alert does not fire again.
 */
export function withThesisReads(file: EarningsFile, theses: ThesesFile | null, today: string): { file: EarningsFile; changed: number } {
  let changed = 0;
  const reports = file.reports.map((r) => {
    if (!r.detail || (r.status !== "release" && r.status !== "complete")) return r;
    const age = daysBetween(r.date, today);
    if (age < 0 || age > RESULTS_READ_DAYS) return r;
    const added = addedReads(addedSince(thesisFor(theses, r.symbol), r.date));
    if (JSON.stringify(added) === JSON.stringify(r.detail.added ?? [])) return r;
    changed += 1;
    return { ...r, detail: { ...r.detail, added }, deck: r.deck ? { ...r.deck, at: "" } : null };
  });
  return { file: changed ? { ...file, reports } : file, changed };
}

/** The thesis kept for a symbol, whatever its spelling. */
export function thesisFor(file: ThesesFile | null, symbol: string): Thesis | null {
  const k = symbolKey(symbol);
  const key = Object.keys(file?.bySymbol ?? {}).find((s) => symbolKey(s) === k);
  return key ? file!.bySymbol[key] : null;
}

/** The file with one symbol's thesis replaced (or removed with null), under the spelling already kept. */
export function withThesis(file: ThesesFile, symbol: string, thesis: Thesis | null, now: string): ThesesFile {
  const k = symbolKey(symbol);
  const key = Object.keys(file.bySymbol).find((s) => symbolKey(s) === k) ?? symbol.toUpperCase();
  const bySymbol = { ...file.bySymbol };
  if (thesis) bySymbol[key] = { ...thesis, since: sinceFor(thesis, file.bySymbol[key] ?? null, now) };
  else delete bySymbol[key];
  return { ...file, version: 1, bySymbol, updated: now };
}

export type PillarReading = { pillar: Pillar; reading: number | null; tag: PillarTag; words: string };

/** Whether a reading is within a tenth of its level: the pillar holds, or fails, by little. */
const near = (reading: number, level: number) => Math.abs(reading - level) <= Math.abs(level) * 0.1;

/**
 * Each pillar against today's readings (the holding's price and fundamentals
 * by field): supported when its test holds, risk when it fails, mixed when
 * it holds or fails by less than a tenth of the level, no reading when it
 * has no test or the figure is not read.
 */
export function pillarReadings(pillars: readonly Pillar[], readings: Record<string, number | null | undefined>): PillarReading[] {
  return pillars.map((pillar) => {
    const t = pillar.test;
    const reading = t ? (readings[t.field] ?? null) : null;
    if (!t) return { pillar, reading: null, tag: "unread", words: "Not tested by a figure; yours to judge." };
    const name = pillarFieldName(t.field);
    if (reading === null) return { pillar, reading: null, tag: "unread", words: `${name} has no reading yet.` };
    const holds = t.is === "gte" ? reading >= t.value : reading <= t.value;
    const tag: PillarTag = near(reading, t.value) ? "mixed" : holds ? "supported" : "risk";
    const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return { pillar, reading, tag, words: `${name} ${fmt(reading)} against ${t.is === "gte" ? "at least" : "at most"} ${fmt(t.value)}${tag === "mixed" ? ", within a tenth" : holds ? "" : ": not met"}.` };
  });
}

/** The thesis's paragraphs, trimmed, empty lines dropped. */
export const paragraphsOf = (text: string | null | undefined): string[] => (text ?? "").split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean);

export type DeckRef = { id: string; url: string; at: string } | null;

/** What a holding's folder holds, as the Theses screen lays it out and the post-earnings run reads it. */
export type HoldingFolder = {
  symbol: string;
  name: string | null;
  held: boolean;
  thesis: Thesis | null;
  pillars: PillarReading[];
  record: HoldingRecord | null;
  /** The record's triggers and kill signals with today's reading. */
  signals: { id: string; kind: "trigger" | "kill"; label: string; reading: number | null; met: boolean | null; note: string | null }[];
  dcf: { inputs: DcfInputs; result: DcfResult } | null;
  /** The valuation run on the kept inputs (or on the stage alone), the DCF among its metrics. */
  valuation: { inputs: ValuationInputs | null; result: ValuationResult };
  /** The latest report with results out, and every report of the symbol, newest first. */
  latest: EarningsReport | null;
  reports: EarningsReport[];
  /** The latest finished study of the symbol on Research, and every study of it, newest first. */
  study: Study | null;
  studies: Study[];
  /** What the folder still lacks, in the order to fill it. */
  owed: { key: "thesis" | "pillars" | "signals" | "dcf" | "valuation" | "study" | "report"; words: string }[];
};

export type FolderInput = {
  symbol: string;
  holding: Pick<Holding, "symbol" | "name" | "price" | "currency" | "fundamentals" | "record"> | null;
  thesis: Thesis | null;
  earnings: EarningsFile | null;
  studies: readonly Study[];
  /** Today's readings for the pillars and the signals: the price under "price", the fundamentals by field. */
  readings?: Record<string, number | null | undefined>;
  /** The day, for a valuation run with nothing kept. */
  today?: string;
};

const hasDeck = (r: EarningsReport) => r.status === "release" || r.status === "complete";

/** The symbol's folder: the thesis and its pillars read today, the record's signals, the DCF run on its kept inputs, the reports and the studies, and what is owed. */
export function holdingFolder(i: FolderInput): HoldingFolder {
  const k = symbolKey(i.symbol);
  const readings: Record<string, number | null | undefined> = i.readings ?? { price: i.holding?.price ?? null, ...(i.holding?.fundamentals ?? {}) };
  const record = i.holding?.record ?? null;
  const signals = (record?.triggers ?? []).map((t) => {
    const r = readings[t.field] ?? null;
    return { id: t.id, kind: t.kind, label: `${t.field === "price" ? "Price" : t.field.replace(/_/g, " ")} ${t.is === "lte" ? "at or below" : "at or above"} ${t.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, reading: r, met: r === null ? null : t.is === "lte" ? r <= t.value : r >= t.value, note: t.note };
  });
  const reports = (i.earnings?.reports ?? []).filter((r) => symbolKey(r.symbol) === k && hasDeck(r)).sort((a, b) => b.date.localeCompare(a.date));
  const studies = i.studies.filter((s) => s.ticker && symbolKey(s.ticker) === k).slice().sort((a, b) => (b.finishedAt ?? b.requestedAt).localeCompare(a.finishedAt ?? a.requestedAt));
  const study = studies.find((s) => s.status === "done") ?? null;
  let dcf: HoldingFolder["dcf"] = null;
  if (i.thesis?.dcf) {
    const inputs = i.thesis.dcf;
    dcf = { inputs, result: runDcf(inputs) };
  }
  const valuation = { inputs: i.thesis?.valuation ?? null, result: runValuation({ inputs: i.thesis?.valuation ?? null, dcf: dcf?.result ?? null, readings, price: i.holding?.price ?? null, priceCurrency: i.holding?.currency ?? null, asOf: i.thesis?.valuation?.asOf ?? i.thesis?.dcf?.asOf ?? i.today ?? "1970-01-01" }) };
  const pillars = pillarReadings(i.thesis?.pillars ?? [], readings);
  const owed: HoldingFolder["owed"] = [];
  if (!i.thesis?.text.trim()) owed.push({ key: "thesis", words: "Write the thesis: why this business, and what must stay true." });
  if (i.thesis?.text.trim() && !i.thesis.pillars.length) owed.push({ key: "pillars", words: "Name the pillars the thesis stands on, each with the figure that tests it." });
  if (!signals.some((s) => s.kind === "kill")) owed.push({ key: "signals", words: "Record the kill signals on the holding, so every result re-scores them." });
  if (!valuation.result.chosen) owed.push({ key: "dcf", words: "Run the Valuation calculator: the stage, your estimates on the metrics useful at it, the DCF; the chosen cases become your valuation." });
  else if (!record?.ownValuation) owed.push({ key: "valuation", words: "Keep the valuation, so its cases are read as your valuation." });
  if (!study) owed.push({ key: "study", words: "Queue a study on Research: the stock template's prose fills the decks." });
  if (!reports.length) owed.push({ key: "report", words: "No results read yet; the report and its decks arrive after the next earnings." });
  return { symbol: i.holding?.symbol ?? i.symbol.toUpperCase(), name: i.holding?.name ?? reports[0]?.name ?? null, held: !!i.holding, thesis: i.thesis, pillars, record, signals, dcf, valuation, latest: reports[0] ?? null, reports, study, studies, owed };
}

/**
 * The thesis as the earnings run lays it on a report's detail: the words,
 * the pillars read on the new figures, the DCF summary at the report's
 * price, and the valuation: the stage on the new figures (read even with no
 * thesis, since the filings decide it) and the chosen method's cases.
 */
export function thesisDetail(thesis: Thesis | null, readings: Record<string, number | null | undefined>, price: number | null, asOf = "1970-01-01"): { text: string | null; pathway: string | null; watch: string[]; pillars: { name: string; text: string; tag: PillarTag; words: string }[]; dcf: ReturnType<typeof dcfSummary> | null; valuation: ValuationSummary } {
  let result: DcfResult | null = null;
  if (thesis?.dcf) {
    // The kept inputs at the report's price, when the inputs were priced in the listing's currency too.
    const at = price !== null && thesis.dcf.price !== null ? { ...thesis.dcf, price } : thesis.dcf;
    result = runDcf(at);
  }
  const vin = thesis?.valuation ? (price !== null && thesis.valuation.price !== null ? { ...thesis.valuation, price } : thesis.valuation) : null;
  const valuation = valuationSummary(runValuation({ inputs: vin, dcf: result, readings, price, priceCurrency: vin?.priceCurrency ?? result?.priceCurrency ?? null, asOf: vin?.asOf ?? result?.asOf ?? asOf }));
  if (!thesis) return { text: null, pathway: null, watch: [], pillars: [], dcf: null, valuation };
  const pillars = pillarReadings(thesis.pillars, readings).map((p) => ({ name: p.pillar.name, text: p.pillar.text, tag: p.tag, words: p.words }));
  return { text: thesis.text.trim() || null, pathway: thesis.pathway, watch: thesis.watch, pillars, dcf: result ? dcfSummary(result) : null, valuation };
}

/**
 * The stock theses the screen lists: the listed equities held, by weight;
 * the watchlist's symbols (recorded without being held); and a symbol with a
 * thesis that is neither any more. Each says which it is.
 */
export function thesesSubjects(holdings: readonly Pick<Holding, "symbol" | "name" | "assetClass" | "value">[], file: ThesesFile | null, watchlist: readonly string[] = []): { symbol: string; name: string | null; held: boolean; watched: boolean }[] {
  const seen = new Map<string, { symbol: string; name: string | null; held: boolean; value: number }>();
  for (const h of holdings) {
    if (h.assetClass !== "equity" || !/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(h.symbol)) continue;
    const k = symbolKey(h.symbol);
    const prev = seen.get(k);
    seen.set(k, { symbol: prev?.symbol ?? h.symbol.toUpperCase(), name: prev?.name ?? h.name, held: true, value: (prev?.value ?? 0) + Math.max(0, h.value) });
  }
  const held = [...seen.values()].sort((a, b) => b.value - a.value).map(({ symbol, name }) => ({ symbol, name, held: true, watched: false }));
  const watchedKeys = new Set<string>();
  const watched: { symbol: string; name: string | null; held: boolean; watched: boolean }[] = [];
  for (const s of watchlist) {
    const k = symbolKey(s);
    if (seen.has(k) || watchedKeys.has(k) || !/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(s)) continue;
    watchedKeys.add(k);
    watched.push({ symbol: s.toUpperCase(), name: null, held: false, watched: true });
  }
  watched.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const gone = Object.keys(file?.bySymbol ?? {})
    .filter((s) => !seen.has(symbolKey(s)) && !watchedKeys.has(symbolKey(s)))
    .sort()
    .map((s) => ({ symbol: s.toUpperCase(), name: null, held: false, watched: false }));
  return [...held, ...watched, ...gone];
}

// ---------------------------------------------------------------------------
// Written by the person's own Claude through the connector (write_thesis)

const pillarWriteSchema = z.object({
  name: z.string().min(1).max(80),
  text: z.string().max(600).default(""),
  /** The figure that tests it and the level; leave it out for a pillar the figures cannot read. */
  test: z.object({ field: z.string().min(1).max(40), is: z.enum(["gte", "lte"]), value: z.number() }).nullable().default(null),
});

const evidenceWriteSchema = z.object({
  source: z.string().min(1).max(200).describe("The document's title, the data's name, or a few words naming the note."),
  kind: z.enum(EVIDENCE_KINDS).default("document"),
  summary: z.string().min(1).max(1500).describe("What it says that bears on the thesis, in a paragraph; figures with their dates."),
  changes: z.string().max(800).nullable().default(null).describe("What it changes in the thesis, in a sentence or two; null when nothing changes."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The document's own date, YYYY-MM-DD; today when left out."),
  call: callReadingSchema.optional().describe("For a results call: every item the company guided (with what it guided before, whether it was raised, lowered or kept, and the pillar, watch item or 'pathway' of the thesis it bears on, exactly as get_theses names them), each analyst's question with management's answer, the prepared remarks' main points, and every reported line set against the analysts' consensus or the company's own guidance for the quarter (beat, miss or in line, as the source prints both), all in your own words with a short quoted phrase at most. Drawn on the post-earnings decks' guidance, beats and misses, and call slides."),
});

/** A chart or a picture as the person's Claude writes it (Hamza, 20 Oct 2026): exactly one of the two, each with its source. */
export const figureWriteSchema = z.object({
  title: z.string().min(1).max(120).describe("What it shows, in a few words; a figure with the same title on the thesis is replaced."),
  caption: z.string().max(400).nullable().optional().describe("What it shows and why it bears on the thesis, in a sentence or two."),
  source: z.string().min(1).max(200).describe("Where the picture or the figures come from: the filing, the page, the dataset."),
  sourceUrl: z.string().max(1000).nullable().optional().describe("The page it comes from, https."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The figures' own date, YYYY-MM-DD; today when left out."),
  image: z.object({ url: z.string().max(1000).describe("A public https address of the picture (a PNG, JPEG, GIF, WebP or SVG on a page anyone can open); never a data: address."), alt: z.string().max(200).default("").describe("What the picture shows, for someone who cannot see it.") }).optional().describe("A picture to show; give this or chart."),
  chart: z
    .object({
      type: z.enum(["line", "bar"]).describe("line: one or a few series over dates; bar: values over years, quarters or names."),
      labels: z.array(z.string().min(1).max(40)).min(2).max(MAX_FIGURE_POINTS).describe("The x-axis: for a line, dates YYYY-MM-DD oldest first; for bars, the labels in order."),
      series: z.array(z.object({ name: z.string().min(1).max(60), values: z.array(z.number().nullable()).describe("One value per label, null where there is none.") })).min(1).max(MAX_FIGURE_SERIES).describe("Up to four series, all in the one unit."),
      unit: z.string().max(12).default("").describe("The unit every value is in: %, x, USD bn; empty for a plain number. Two units are two charts."),
    })
    .optional()
    .describe("A chart the app draws from these figures, on one axis; give this or image."),
});
export type FigureWrite = z.infer<typeof figureWriteSchema>;

/**
 * The figures after a write: each written one replaces the one with its
 * title, or is added; `remove` takes ids or titles out. A picture must be a
 * public https address and a chart's series must carry one value per label,
 * a line's labels dates in order; anything else is refused with a sentence.
 */
export function withFigures(prev: readonly ThesisFigure[], writes: readonly FigureWrite[] | undefined, remove: readonly string[] | undefined, iso: string, today: string, via: ThesisFigure["via"] = "claude"): ThesisFigure[] {
  const gone = new Set((remove ?? []).map((x) => x.trim().toLowerCase()));
  let out = prev.filter((f) => !gone.has(f.id.toLowerCase()) && !gone.has(f.title.toLowerCase()));
  for (const [i, w] of (writes ?? []).entries()) {
    if (!w.image === !w.chart) throw new ThesisWriteProblem(`"${w.title}": give either an image or a chart, not ${w.image ? "both" : "neither"}.`);
    if (w.image && !publicImageUrl(w.image.url)) throw new ThesisWriteProblem(`"${w.title}": the picture must be a public https address on a named host, not a data: address, an IP or a private host.`);
    if (w.sourceUrl && !/^https?:\/\//.test(w.sourceUrl)) throw new ThesisWriteProblem(`"${w.title}": the source's page must be an http or https address.`);
    if (w.chart) {
      const n = w.chart.labels.length;
      const short = w.chart.series.find((x) => x.values.length !== n);
      if (short) throw new ThesisWriteProblem(`"${w.title}": series "${short.name}" has ${short.values.length} values for ${n} labels; give one per label, null where there is none.`);
      if (w.chart.series.every((x) => x.values.every((v) => v === null || !Number.isFinite(v)))) throw new ThesisWriteProblem(`"${w.title}": the chart has no values.`);
      if (w.chart.type === "line" && (!w.chart.labels.every((l) => DAY.test(l)) || w.chart.labels.some((l, j) => j > 0 && l <= w.chart!.labels[j - 1]))) throw new ThesisWriteProblem(`"${w.title}": a line chart's labels are dates, YYYY-MM-DD, oldest first; use a bar chart for years, quarters or names.`);
    }
    const kept = out.find((f) => f.title.toLowerCase() === w.title.trim().toLowerCase());
    const taken = out.map((f) => f.id);
    const figure = thesisFigureSchema.parse({
      id: kept?.id ?? figureId(iso, i, taken),
      title: w.title.trim(),
      caption: w.caption?.trim() || null,
      source: w.source.trim(),
      sourceUrl: w.sourceUrl ?? null,
      at: w.date ?? today,
      via,
      image: w.image ? { url: w.image.url, alt: w.image.alt.trim() } : null,
      chart: w.chart ? { ...w.chart, series: w.chart.series.map((x) => ({ name: x.name, values: x.values.map((v) => (v === null || !Number.isFinite(v) ? null : v)) })) } : null,
    });
    out = kept ? out.map((f) => (f.id === kept.id ? figure : f)) : [...out, figure];
  }
  if (out.length > MAX_FIGURES) throw new ThesisWriteProblem(`A thesis holds ${MAX_FIGURES} charts and pictures at most; remove some (removeFigures) before adding more.`);
  return out;
}

const figureId = (iso: string, i: number, taken: readonly string[]): string => {
  const base = `f${iso.slice(2, 19).replace(/\D/g, "")}${i}`;
  let id = base;
  for (let k = 1; taken.includes(id); k++) id = `${base}${k}`;
  return id.slice(0, 24);
};

/** A trigger or kill signal as the person's Claude writes it on the record (Hamza, 19 Oct 2026): a figure at or below or at or above a level. */
const triggerWriteSchema = z.object({
  kind: z.enum(["trigger", "kill"]).describe("kill: a kill signal, the thesis is broken when met; trigger: a trigger to act or re-test on."),
  field: z.string().min(1).max(40).describe("'price' or a fundamental field of the ontology (describe_recipes lists them)."),
  is: z.enum(["lte", "gte"]).describe("lte: met at or below the level; gte: met at or above it."),
  value: z.number(),
  note: z.string().max(200).nullable().default(null).describe("What it means and where it comes from, in a line."),
});
const casesWriteSchema = z.object({ bear: z.number(), base: z.number(), bull: z.number() });
/** Price levels on the record, for an alert when the price is at or below `below` or at or above `above`. */
const levelsWriteSchema = z.object({ below: z.number().positive().nullable().default(null), above: z.number().positive().nullable().default(null) });
/** The Valuation calculator's inputs as the person's Claude fills them: laid on the inputs the filings seed, so the per-share figures stay the filings' own (Hamza, 19 Oct 2026). */
const valuationWriteSchema = z.object({
  stage: z.enum(STAGES).nullable().optional().describe("The stage when it differs from the one the filings place the company in; null keeps the filings' reading."),
  method: z.enum(VALUATION_METHODS as [ValuationMethod, ...ValuationMethod[]]).optional().describe("The metric whose bear, base and bull become the person's own valuation: ps, pgp, trailing_pe, trailing_pfcf, forward_pe, forward_pfcf, tam or dcf (dcf only when a DCF is kept)."),
  multiples: z.object({ ps: casesWriteSchema.optional(), pgp: casesWriteSchema.optional(), forward_pe: casesWriteSchema.optional(), forward_pfcf: casesWriteSchema.optional(), trailing_pe: casesWriteSchema.optional(), trailing_pfcf: casesWriteSchema.optional() }).optional().describe("The bear, base and bull multiple of each metric estimated; a metric left out keeps today's."),
  forward: z.object({ eps: z.number().optional(), fcf: z.number().optional() }).optional().describe("Next twelve months' EPS and free cash flow per share, in the filings' currency."),
  tam: z.object({ market: z.number().positive(), sharePct: z.object({ bear: z.number().min(0).max(100), base: z.number().min(0).max(100), bull: z.number().min(0).max(100) }), marginPct: z.number().min(-50).max(100), multiple: z.number().min(0).max(1000), shares: z.number().positive() }).optional().describe("The addressable market in millions of the filings' currency, the share taken in each case, the margin on it, the multiple that profit deserves, the shares in millions."),
  cases: casesWriteSchema.optional().describe("Bear, base and bull per share in the price's currency, valued directly: kept as the person's own valuation when the filings give the calculator nothing to seed, or beside it."),
  note: z.string().max(600).nullable().optional().describe("Sources and what the estimates rest on, as the header of a model."),
});
export type ValuationWrite = z.infer<typeof valuationWriteSchema>;

/** What write_thesis takes: a stock thesis by symbol, or a market thesis by id or title; each field given replaces, evidence is added. */
export const thesisWriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stock"),
    symbol: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/).describe("The holding's or watchlist symbol."),
    text: z.string().max(6000).optional().describe("The thesis in the person's voice: why this business, what must stay true; a paragraph per idea. Replaces the text when given."),
    pathway: z.string().max(1500).nullable().optional().describe("What the company must show to move to the next class, where the methodology asks for one."),
    pillars: z.array(pillarWriteSchema).max(MAX_PILLARS).optional().describe("The pillars the thesis stands on; each test names 'price' or a fundamental field of the ontology (describe_recipes lists them). Replaces the pillars when given."),
    watch: z.array(z.string().max(200)).max(MAX_WATCH).optional().describe("What to watch, one line each. Replaces the watch items when given."),
    evidence: evidenceWriteSchema.optional().describe("A document, data or note folded into the thesis: added to its evidence."),
    figures: z.array(figureWriteSchema).max(MAX_FIGURES).optional().describe("Charts and pictures to show on the thesis, each with its source: a chart the app draws from the figures given, or a picture from a public https address. One with a title already on the thesis replaces it."),
    removeFigures: z.array(z.string().min(1).max(120)).max(MAX_FIGURES).optional().describe("Charts or pictures to take off the thesis, by title or id."),
    triggers: z.array(triggerWriteSchema).max(12).optional().describe("The holding's kill signals and triggers, on its record; each a figure at or beyond a level, an alert when met. Replaces them when given."),
    levels: levelsWriteSchema.nullable().optional().describe("Price levels to hear of (at or below, at or above), on the record; null clears them."),
    valuation: valuationWriteSchema.optional().describe("The Valuation calculator's inputs; the chosen method's bear, base and bull become the person's own valuation on the record."),
  }),
  z.object({
    kind: z.literal("market"),
    thesis: z.string().min(1).max(120).describe("The market thesis's id or title; a title not on file starts a new one."),
    title: z.string().min(1).max(120).optional().describe("A new title for it."),
    text: z.string().max(6000).optional().describe("The thesis in the person's voice. Replaces the text when given."),
    pillars: z.array(pillarWriteSchema).max(MAX_PILLARS).optional().describe("The pillars; each test names a market indicator's symbol (VIX, US10Y, US10Y2Y, FEARGREED, CPIYOY...; describe_recipes lists them) and a level. Replaces the pillars when given."),
    watch: z.array(z.string().max(200)).max(MAX_WATCH).optional().describe("What to watch, one line each. Replaces the watch items when given."),
    evidence: evidenceWriteSchema.optional().describe("A document, data or note folded into the thesis: added to its evidence."),
    figures: z.array(figureWriteSchema).max(MAX_FIGURES).optional().describe("Charts and pictures to show on the thesis, each with its source: a chart the app draws from the figures given, or a picture from a public https address. One with a title already on the thesis replaces it."),
    removeFigures: z.array(z.string().min(1).max(120)).max(MAX_FIGURES).optional().describe("Charts or pictures to take off the thesis, by title or id."),
    basket: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/)).max(MAX_BASKET).optional().describe("The listed companies that express the thesis, measured together against SPY from the day it was written. Replaces the basket when given."),
  }),
]);
export type ThesisWrite = z.infer<typeof thesisWriteSchema>;

/** The same write as one flat object (an MCP tool's input is one JSON Schema object): `kind` says which fields count; `thesisWriteSchema` reads it. */
export const thesisWriteInputSchema = z.object({
  kind: z.enum(["stock", "market"]).describe("stock: a holding's or watchlist symbol's thesis; market: a market thesis."),
  symbol: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/).optional().describe("kind stock: the symbol."),
  thesis: z.string().min(1).max(120).optional().describe("kind market: the market thesis's id or title; a title not on file starts a new one."),
  title: z.string().min(1).max(120).optional().describe("kind market: a new title for it."),
  text: z.string().max(6000).optional().describe("The thesis in the person's voice; a paragraph per idea. Replaces the text when given."),
  pathway: z.string().max(1500).nullable().optional().describe("kind stock: what the company must show to move to the next class, where the methodology asks for one."),
  pillars: z.array(pillarWriteSchema).max(MAX_PILLARS).optional().describe("The pillars the thesis stands on; each test names 'price' or a fundamental field (stock) or a market indicator's symbol (market); describe_recipes lists them. Replaces the pillars when given."),
  watch: z.array(z.string().max(200)).max(MAX_WATCH).optional().describe("What to watch, one line each. Replaces the watch items when given."),
  evidence: evidenceWriteSchema.optional().describe("A document, data or note folded into the thesis: added to its evidence."),
  figures: z.array(figureWriteSchema).max(MAX_FIGURES).optional().describe("Charts and pictures to show on the thesis, each with its source: a chart the app draws from the figures given, or a picture from a public https address. One with a title already on the thesis replaces it."),
  removeFigures: z.array(z.string().min(1).max(120)).max(MAX_FIGURES).optional().describe("Charts or pictures to take off the thesis, by title or id."),
  triggers: z.array(triggerWriteSchema).max(12).optional().describe("kind stock: the holding's kill signals and triggers, kept on its record (each a figure, 'price' or a fundamental field, at or below or at or above a level; an alert and a to-do when met). Replaces them when given."),
  levels: levelsWriteSchema.nullable().optional().describe("kind stock: price levels to hear of, at or below and at or above, on the record; null clears them."),
  basket: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/)).max(MAX_BASKET).optional().describe("kind market: the listed companies that express the thesis, measured together against SPY from the day it was written. Replaces the basket when given."),
  valuation: valuationWriteSchema.optional().describe("kind stock: the Valuation calculator's inputs (stage, method, multiples, forward figures, TAM, or bear, base and bull per share as cases); the chosen method's cases become the person's own valuation on the record."),
});

/** A write that cannot be applied: a sentence for the model to relay. */
export class ThesisWriteProblem extends Error {}

export type ThesisWriteOutcome = { file: ThesesFile; subject: string; changed: string[]; created: boolean };

/** Whether a stock write carries anything for the record (triggers, levels, a valuation), which `writeThesis` leaves to `recordFromWrite`. */
export function writesRecord(w: ThesisWrite): boolean {
  return w.kind === "stock" && (w.triggers !== undefined || w.levels !== undefined || w.valuation !== undefined);
}

/**
 * Applies what the person's Claude wrote to the file: the fields given replace
 * the thesis's, the evidence is added, nothing else moves (the valuation, the
 * DCF and the record stay as they are). A pillar's test must name a figure
 * the subject can read; a market thesis past the limit is refused.
 */
export function writeThesis(file: ThesesFile, w: ThesisWrite, now: Date, today: string): ThesisWriteOutcome {
  const iso = now.toISOString();
  const changed: string[] = [];
  const pillarsOf = (given: z.infer<typeof pillarWriteSchema>[] | undefined, prev: readonly Pillar[], subject: "stock" | "market"): Pillar[] | null => {
    if (!given) return null;
    return given.map((p, i) => {
      if (p.test && !pillarFieldOk(p.test.field, subject)) throw new ThesisWriteProblem(`Pillar "${p.name}" tests ${p.test.field}, which is not ${subject === "market" ? "a market indicator the app reads" : "the price or a fundamental field of the ontology"}. describe_recipes lists what can be tested.`);
      const test = p.test ? { ...p.test, field: subject === "market" ? p.test.field.toUpperCase() : p.test.field } : null;
      return { id: prev[i]?.id ?? `p${iso.slice(2, 10).replace(/-/g, "")}${i}`, name: p.name, text: p.text, test };
    });
  };
  const addFigures = <T extends { figures: ThesisFigure[] }>(thesis: T): T => {
    if (!w.figures?.length && !w.removeFigures?.length) return thesis;
    const figures = withFigures(thesis.figures, w.figures, w.removeFigures, iso, today);
    changed.push("figures");
    return { ...thesis, figures };
  };
  const addEvidence = <T extends { evidence: Evidence[]; updatedAt: string }>(thesis: T): T => {
    if (!w.evidence) return thesis;
    changed.push("evidence");
    return withEvidence(thesis, { at: w.evidence.date ?? today, source: w.evidence.source, kind: w.evidence.kind, summary: w.evidence.summary, changes: w.evidence.changes, via: "claude", call: w.evidence.call ?? null }, iso);
  };
  if (w.kind === "stock") {
    const symbol = w.symbol.toUpperCase();
    const prev = thesisFor(file, symbol);
    let next: Thesis = { ...EMPTY_THESIS, ...(prev ?? {}), updatedAt: iso };
    if (w.text !== undefined) {
      next = { ...next, text: w.text };
      changed.push("text");
    }
    if (w.pathway !== undefined) {
      next = { ...next, pathway: w.pathway };
      changed.push("pathway");
    }
    const pillars = pillarsOf(w.pillars, prev?.pillars ?? [], "stock");
    if (pillars) {
      next = { ...next, pillars };
      changed.push("pillars");
    }
    if (w.watch) {
      next = { ...next, watch: w.watch.map((x) => x.trim()).filter(Boolean) };
      changed.push("watch");
    }
    next = addFigures(addEvidence(next));
    if (!changed.length) {
      // The record's part (triggers, levels, a valuation) is applied by recordFromWrite and withValuationInputs; a write with only that leaves the thesis as it is.
      if (writesRecord(w)) return { file, subject: symbol, changed, created: false };
      throw new ThesisWriteProblem("Nothing to write: give the text, the pathway, the pillars, the watch items, charts or pictures, the triggers, the levels, the valuation or an evidence entry.");
    }
    const parsed = thesisSchema.safeParse(next);
    if (!parsed.success) throw new ThesisWriteProblem(`The thesis does not fit: ${parsed.error.issues[0]?.message ?? "unknown"}.`);
    return { file: withThesis(file, symbol, parsed.data, iso), subject: symbol, changed, created: !prev };
  }
  const prev = marketThesisFor(file, w.thesis);
  if (!prev && file.markets.length >= MAX_MARKET_THESES) throw new ThesisWriteProblem(`There are already ${MAX_MARKET_THESES} market theses; remove one in Invariant before adding another.`);
  const title = (w.title ?? prev?.title ?? w.thesis).trim();
  const id = prev?.id ?? marketThesisId(title);
  if (!prev && file.markets.some((m) => m.id === id)) throw new ThesisWriteProblem(`A market thesis already reads as "${title}"; name it by its id to change it.`);
  let next: MarketThesis = prev ? { ...prev, title, updatedAt: iso } : { id, title, text: "", pillars: [], watch: [], evidence: [], figures: [], basket: [], since: null, updatedAt: iso };
  if (!prev || (w.title && w.title.trim() !== prev.title)) changed.push("title");
  if (w.text !== undefined) {
    next = { ...next, text: w.text };
    changed.push("text");
  }
  const pillars = pillarsOf(w.pillars, prev?.pillars ?? [], "market");
  if (pillars) {
    next = { ...next, pillars };
    changed.push("pillars");
  }
  if (w.watch) {
    next = { ...next, watch: w.watch.map((x) => x.trim()).filter(Boolean) };
    changed.push("watch");
  }
  if (w.basket) {
    next = { ...next, basket: basketFrom(w.basket.join(" ")) };
    changed.push("basket");
  }
  next = addFigures(addEvidence(next));
  if (!changed.length) throw new ThesisWriteProblem("Nothing to write: give the text, the pillars, the watch items, the basket, charts or pictures, or an evidence entry.");
  const parsed = marketThesisSchema.safeParse(next);
  if (!parsed.success) throw new ThesisWriteProblem(`The market thesis does not fit: ${parsed.error.issues[0]?.message ?? "unknown"}.`);
  return { file: withMarketThesis(file, id, parsed.data, iso), subject: title, changed, created: !prev };
}

/** The latest post-earnings report kept for a symbol, whatever its deck; null when none. */
export function latestReportFor(earnings: EarningsFile | null, symbol: string): EarningsReport | null {
  const k = symbolKey(symbol);
  return (earnings?.reports ?? []).filter((r) => symbolKey(r.symbol) === k).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/** What a kept report gives the Valuation calculator to seed from: the trailing figures in whole units of the filings' currency; null with no report or no filings' years. */
export function valuationSeedOf(r: EarningsReport | null): ValuationSeed | null {
  const t = r?.detail?.years;
  if (!r || !t) return null;
  const last = (key: string) => t.rows.find((x) => x.key === key)?.values.at(-1) ?? null;
  const b = r.detail?.balance ?? null;
  return { revenue: last("revenue"), grossProfit: last("grossProfit"), fcf: last("fcf"), epsDiluted: last("epsDiluted"), dilutedShares: last("dilutedShares") ?? b?.shares ?? null, revenueGrowthPct: r.detail?.fundamentals.revenue_growth_pct ?? null, epsGrowthPct: r.detail?.fundamentals.eps_growth_pct ?? null, periodLabel: t.cols.at(-1) ?? null, currency: r.currency };
}

/**
 * The calculator's inputs with what the person's Claude wrote laid on the
 * inputs kept, else the ones the filings seed (Hamza, 19 Oct 2026): the
 * per-share figures stay the filings' own; the stage, the method, each
 * multiple given, the forward figures, the TAM and the note are Claude's.
 * Null when there is nothing to lay them on (no report read yet), so the
 * caller asks for cases instead.
 */
export function valuationFromWrite(w: ValuationWrite, kept: ValuationInputs | null, seeded: ValuationInputs | null, today: string): ValuationInputs | null {
  const on = kept ?? seeded;
  if (!on) return null;
  const multiples = { ...on.multiples };
  for (const k of ["ps", "pgp", "forward_pe", "forward_pfcf", "trailing_pe", "trailing_pfcf"] as const) {
    const m = w.multiples?.[k];
    if (m) multiples[k] = { bear: Math.min(m.bear, m.base), base: m.base, bull: Math.max(m.bull, m.base) };
  }
  const draft: ValuationInputs = {
    ...on,
    stage: w.stage === undefined ? on.stage : w.stage,
    method: w.method ?? on.method,
    forward: { eps: w.forward?.eps ?? on.forward.eps, fcf: w.forward?.fcf ?? on.forward.fcf },
    multiples,
    tam: w.tam ?? on.tam,
    note: w.note === undefined ? on.note : w.note,
    asOf: today,
  };
  const parsed = valuationInputsSchema.safeParse(draft);
  if (!parsed.success) throw new ThesisWriteProblem(`The valuation does not fit: ${parsed.error.issues[0]?.message ?? "unknown"}.`);
  return parsed.data;
}

/** The thesis with the calculator's inputs kept on it (a thesis started when none is on file); the DCF and the words stay. */
export function withValuationInputs(file: ThesesFile, symbol: string, inputs: ValuationInputs, now: string): ThesesFile {
  const prev = thesisFor(file, symbol);
  return withThesis(file, symbol.toUpperCase(), { ...EMPTY_THESIS, ...(prev ?? {}), valuation: inputs, updatedAt: now }, now);
}

/** The person's own valuation the calculator's chosen cases make, run on today's readings; null when the method cannot be valued. */
export function ownValuationOf(inputs: ValuationInputs, dcf: DcfInputs | null, readings: Record<string, number | null | undefined>, price: number | null, priceCurrency: string | null, today: string): HoldingRecord["ownValuation"] {
  const result = runValuation({ inputs, dcf: dcf ? runDcf(dcf) : null, readings, price, priceCurrency, asOf: today });
  const ov = ownValuationFrom(result);
  return ov ? { low: ov.low, base: ov.base, high: ov.high, asOf: ov.asOf, basis: ov.basis } : null;
}

/** The stage the filings' readings give today, for seeding the calculator. */
export function stageToday(readings: Record<string, number | null | undefined>): ValuationInputs["stage"] {
  return stageOf(readings).stage;
}

export const EMPTY_RECORD: HoldingRecord = recordFields.parse({ ownValuation: null, since: null, note: null });

/**
 * The record with what the person's Claude wrote on it (Hamza, 19 Oct 2026):
 * the triggers and kill signals (each on 'price' or a fundamental field, else
 * refused and named), the price levels, the own valuation. A symbol with no
 * record gets one, which puts a stock not held on the watchlist. The class,
 * the since date, the note and the sector stay as they are.
 */
export function recordFromWrite(prev: HoldingRecord | null, w: { triggers?: ThesisWrite extends infer T ? (T extends { kind: "stock"; triggers?: infer U } ? U : never) : never; levels?: z.infer<typeof levelsWriteSchema> | null; ownValuation?: HoldingRecord["ownValuation"] }, now: string): { record: HoldingRecord; changed: string[] } {
  const changed: string[] = [];
  let next: HoldingRecord = { ...EMPTY_RECORD, ...(prev ?? {}) };
  if (w.triggers) {
    const triggers = w.triggers.map((t, i) => {
      if (!pillarFieldOk(t.field, "stock")) throw new ThesisWriteProblem(`${t.kind === "kill" ? "Kill signal" : "Trigger"} ${i + 1} tests ${t.field}, which is not the price or a fundamental field of the ontology. describe_recipes lists what can be tested.`);
      return { id: prev?.triggers[i]?.id ?? `t${now.slice(2, 10).replace(/-/g, "")}${i}`, kind: t.kind, field: t.field, is: t.is, value: t.value, note: t.note ?? null };
    });
    next = { ...next, triggers };
    const kills = triggers.filter((t) => t.kind === "kill").length;
    changed.push(`${kills} kill signal${kills === 1 ? "" : "s"} and ${triggers.length - kills} trigger${triggers.length - kills === 1 ? "" : "s"}`);
  }
  if (w.levels !== undefined) {
    next = { ...next, levels: w.levels && (w.levels.below !== null || w.levels.above !== null) ? { below: w.levels.below, above: w.levels.above } : null };
    changed.push("levels");
  }
  if (w.ownValuation !== undefined) {
    next = { ...next, ownValuation: w.ownValuation };
    changed.push(w.ownValuation ? `valuation (${w.ownValuation.base.toLocaleString("en-US", { maximumFractionDigits: 2 })} base per share, ${w.ownValuation.basis ?? "no basis"})` : "valuation");
  }
  const parsed = recordFields.safeParse(next);
  if (!parsed.success) throw new ThesisWriteProblem(`The record does not fit: ${parsed.error.issues[0]?.message ?? "unknown"}.`);
  return { record: parsed.data, changed };
}

// ---------------------------------------------------------------------------
// The prompts the person copies into their own Claude

/** What the person pastes into their Claude to fill the theses in through the connector: the stock theses owed, then the market theses. */
export function fillThesesPrompt(owed: readonly string[], hasMarkets: boolean): string {
  const subjects = owed.length ? `my holdings without a thesis yet (${owed.join(", ")})` : "each of my holdings";
  return [
    `Using my Invariant connector, write the theses for ${subjects}. For each: call get_holdings for its figures and class, get_methodology for the rules and classes that apply, get_edgar_facts for its filings, and search_vault for any study or review that mentions it.`,
    "Then call write_thesis once per holding (kind \"stock\") with: the thesis in my voice in three or four short paragraphs (what it sells, who pays, what must stay true), up to six pillars each tested on the price or a fundamental field the ontology reads (describe_recipes lists them) at a level the filings support, the pathway where my methodology puts the holding in a class that is a step on the way, and up to eight watch items.",
    "In the same call fill in its kill signals and triggers (triggers: kind kill or trigger, the field, at or below or at or above, the level, a note on where it comes from) from my methodology and my record of it, and the Valuation calculator (valuation: the method useful at the company's stage, my bear, base and bull multiple on each metric, the forward EPS and free cash flow per share, or bear, base and bull per share as cases when the filings give nothing to seed); the chosen method's cases become my own valuation.",
    "To add a stock to my watchlist, call write_thesis for its symbol the same way: a symbol I do not hold gets a record and joins the watchlist, with its thesis, what to watch, its triggers and the price levels to hear of (levels: below, above).",
    hasMarkets ? "Leave my market theses as they are unless I ask." : "If I hold views about the market itself (rates, a cycle, a theme), write each as a market thesis (kind \"market\"), its pillars tested on the indicators the app reads (VIX, US10Y, US10Y2Y, FEARGREED, CPIYOY...).",
    "Every figure must come from a tool. Do not change a DCF, a class or anything else, and place no order. Tell me, holding by holding, what you wrote; I review each on the Theses screen.",
  ].join("\n");
}
