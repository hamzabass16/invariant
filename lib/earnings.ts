/**
 * Earnings: when each company the person follows reports, an alert the day
 * before, and a report after the results. Pure: the calendar is read in
 * lib/markets-feed.ts (`loadEarnings`), the filings and the model call are
 * made in lib/earnings-run.ts.
 *
 * The companies are the person's listed holdings, their watchlist (records of
 * symbols not held) and the companies they added on the Earnings screen. The
 * dates come from the Nasdaq earnings calendar, one public page per day, the
 * date alone in the address: the symbol, the time of day (before the open, after
 * the close, or not given), the fiscal quarter and the consensus estimate.
 *
 * The report after the results is HCMP's post-earnings note in the
 * methodology's own terms. Every figure comes from the company's own filing
 * (SEC EDGAR, the quarter against the same quarter a year before); the class
 * test and the rules are the methodology's own recipes run on the new
 * figures; the triggers, the kill signals and the valuation are the person's
 * own records. The headline is written by the app from those, never by a
 * model. On a Claude key, a short reading of the release and the call (what
 * the company guided, what changed) is added, every point with its page; on
 * any other provider it is left out with a sentence.
 */
import { z } from "zod";

import { dcfSummarySchema, type DcfSummary } from "@/lib/dcf";
import { expectedFor, expectedMoveSchema, MAX_EXPECTED } from "@/lib/expected-move";
import { INVESTIGATE_SEARCHES, INVESTIGATIVE, MAX_UNEXPECTED } from "@/lib/investigate";
import { valuationSummarySchema, type ValuationSummary } from "@/lib/valuation";
import { HISTORY_LABEL, HISTORY_METRICS, historyWords, type ValuationHistory } from "@/lib/valuation-history";
import type { PeerComparison } from "@/lib/peers";
import { nearestQuarter, quarterBefore, studyTable, type FactsTable, type Fundamentals } from "@/lib/edgar-facts";
import { LINE_KINDS, type Engine, type SegmentHistory, type SegmentRead } from "@/lib/edgar-segments";
import { buildFlow, flowFromFacts, incomeFlowSchema, segmentSources, type FlowLines, type IncomeFlow } from "@/lib/income-flow";
import type { Book, Holding, HoldingRecord, RevenueGeography } from "@/lib/holdings";
import type { CompanyVerdict, CriterionLine, Study } from "@/lib/research";
import type { Notice } from "@/lib/screens";
import { numbersIn, printed } from "@/lib/statements";
import { daysBetween, longDate } from "@/lib/time";
import { MODELS } from "@/lib/models";
import { reportCallSchema, sentenceCut } from "@/lib/earnings-call";
import { deckBriefSchema, type DeckBrief } from "@/lib/deck-brief";
import { flowAsks, flowNotesSchema, type FlowNotes } from "@/lib/flow-notes";
import { DECK_NEEDS, DECK_WAIT_DAYS, type DeckNeed } from "@/lib/ontology";

// ---------------------------------------------------------------------------
// The calendar

export const EARNINGS_TIMES = ["pre", "post", "unknown"] as const;
export type EarningsTime = (typeof EARNINGS_TIMES)[number];
export const TIME_LABEL: Record<EarningsTime, string> = { pre: "Before the open", post: "After the close", unknown: "Time not given" };
export const TIME_SHORT: Record<EarningsTime, string> = { pre: "BMO", post: "AMC", unknown: "" };

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const earningsRowSchema = z.object({
  symbol: z.string().min(1).max(20),
  name: z.string().max(160).nullable(),
  /** The report date, New York. */
  date: isoDay,
  time: z.enum(EARNINGS_TIMES),
  /** The fiscal quarter as Nasdaq names it: "Sep/2026". */
  quarter: z.string().max(20).nullable(),
  /** The consensus EPS estimate, in US dollars; null when none. */
  epsForecast: z.number().nullable(),
  estimates: z.number().int().nullable(),
  lastYearEps: z.number().nullable(),
});
export type EarningsRow = z.infer<typeof earningsRowSchema>;

export const earningsCalendarSchema = z.object({
  from: isoDay,
  to: isoDay,
  rows: z.array(earningsRowSchema),
  /** Days the calendar could not be read for; their reports are missing, never assumed absent. */
  missed: z.array(isoDay),
  /** The last day Nasdaq has published; later days answer with no data until it adds them, which is not a gap. */
  publishedTo: isoDay.nullable().optional(),
  problems: z.array(z.string().max(300)).max(10),
  readAt: z.string(),
});
export type EarningsCalendar = z.infer<typeof earningsCalendarSchema>;

/** Days before today the calendar is read for, so a report just past is still on it. */
export const EARNINGS_BACK_DAYS = 21;
/** Days ahead the calendar is read for: a quarter's season, about. */
export const EARNINGS_AHEAD_DAYS = 70;

/** "$1.23" → 1.23, "($0.12)" → -0.12, "" or "N/A" → null. */
export function nasdaqMoney(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t || /^n\/?a$/i.test(t)) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()$,\s-]/g, ""));
  return Number.isFinite(n) && t.replace(/[()$,\s-]/g, "") !== "" ? (neg ? -n : n) : null;
}

const TIME_OF: Record<string, EarningsTime> = { "time-pre-market": "pre", "time-after-hours": "post" };

const nasdaqSchema = z.object({
  data: z
    .object({ rows: z.array(z.record(z.string(), z.unknown())).nullable().optional() })
    .loose()
    .nullable(),
}).loose();

/**
 * One day of the Nasdaq earnings calendar (its JSON for one date). A day with no
 * reports answers with no rows, which is an empty list; a day Nasdaq has not
 * published answers with no data at all, which is null (`calendarReach` says
 * whether it is past the end of what is published or a gap inside it);
 * anything that is not that document throws, so a broken page never reads as
 * a quiet day.
 */
export function parseNasdaqEarnings(text: string, date: string): EarningsRow[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not JSON");
  }
  const r = nasdaqSchema.safeParse(json);
  if (!r.success) throw new Error("not the earnings calendar");
  if (r.data.data === null) return null;
  const out: EarningsRow[] = [];
  for (const row of r.data.data.rows ?? []) {
    const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    if (!/^[A-Z][A-Z0-9./-]{0,14}$/.test(symbol)) continue;
    const est = Number(row.noOfEsts);
    out.push({
      symbol,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 160) : null,
      date,
      time: TIME_OF[String(row.time ?? "")] ?? "unknown",
      quarter: typeof row.fiscalQuarterEnding === "string" && row.fiscalQuarterEnding.trim() ? row.fiscalQuarterEnding.trim().slice(0, 20) : null,
      epsForecast: nasdaqMoney(row.epsForecast),
      estimates: Number.isInteger(est) && est > 0 ? est : null,
      lastYearEps: nasdaqMoney(row.lastYearEPS),
    });
  }
  return out;
}

/**
 * Where the published calendar ends. Nasdaq publishes some weeks ahead, so the
 * days after the last one it answered for come back with no data: those are
 * not yet published, never a quiet day and never a gap. A day with no data
 * before that end is a gap, named as one.
 */
export function calendarReach(answered: readonly string[], unpublished: readonly string[]): { publishedTo: string | null; gaps: string[] } {
  const publishedTo = answered.length ? [...answered].sort().at(-1)! : null;
  return { publishedTo, gaps: unpublished.filter((d) => publishedTo === null || d < publishedTo).sort() };
}

/** The weekdays from `from` to `to`, both included: the days the calendar is read for. */
export function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** One spelling per listing: BRK.B, BRK/B and BRK-B are the same company. */
export const symbolKey = (s: string) => s.trim().toUpperCase().replace(/[/-]/g, ".");

// ---------------------------------------------------------------------------
// Whose reports

export const SUBJECT_KINDS = ["holding", "watch", "added"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];
export const KIND_LABEL: Record<SubjectKind, string> = { holding: "Holding", watch: "Watchlist", added: "Added" };

export type EarningsSubject = { symbol: string; name: string | null; kind: SubjectKind };

/** Companies the person added on the Earnings screen, at most this many. */
export const MAX_ADDED = 40;
export const SYMBOL = /^[A-Z][A-Z0-9.\-/]{0,14}$/;

/**
 * The companies whose reports the person follows: each listed equity they
 * hold, each symbol on their watchlist, each company they added; one entry
 * per company, the first reason winning.
 */
export function earningsSubjects(book: Book | null, records: Record<string, HoldingRecord>, added: readonly string[]): EarningsSubject[] {
  const out = new Map<string, EarningsSubject>();
  for (const h of book?.holdings ?? []) {
    if (h.assetClass !== "equity") continue;
    const k = symbolKey(h.symbol);
    if (!SYMBOL.test(k) || out.has(k)) continue;
    out.set(k, { symbol: h.symbol.toUpperCase(), name: h.name, kind: "holding" });
  }
  for (const s of Object.keys(records)) {
    const k = symbolKey(s);
    if (!SYMBOL.test(k) || out.has(k)) continue;
    out.set(k, { symbol: s.toUpperCase(), name: null, kind: "watch" });
  }
  for (const s of added) {
    const k = symbolKey(s);
    if (!SYMBOL.test(k) || out.has(k)) continue;
    out.set(k, { symbol: s.toUpperCase(), name: null, kind: "added" });
  }
  return [...out.values()];
}

export type EarningsEntry = EarningsRow & { kind: SubjectKind; subjectName: string | null };

/** The calendar's rows for the person's companies, by date. */
export function entriesFor(calendar: EarningsCalendar | null, subjects: readonly EarningsSubject[]): EarningsEntry[] {
  const by = new Map(subjects.map((s) => [symbolKey(s.symbol), s]));
  const seen = new Set<string>();
  const out: EarningsEntry[] = [];
  for (const r of calendar?.rows ?? []) {
    const s = by.get(symbolKey(r.symbol));
    if (!s) continue;
    const key = `${symbolKey(r.symbol)}|${r.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, symbol: s.symbol, kind: s.kind, subjectName: s.name ?? r.name });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || TIME_ORDER[a.time] - TIME_ORDER[b.time] || a.symbol.localeCompare(b.symbol));
}

const TIME_ORDER: Record<EarningsTime, number> = { pre: 0, unknown: 1, post: 2 };

/** The subjects with no date on the calendar's window: said so, never left out quietly. */
export function undated(subjects: readonly EarningsSubject[], entries: readonly EarningsEntry[], today: string): EarningsSubject[] {
  const ahead = new Set(entries.filter((e) => e.date >= today).map((e) => symbolKey(e.symbol)));
  return subjects.filter((s) => !ahead.has(symbolKey(s.symbol)));
}

/** "Sep/2026" → "the quarter to Sep 2026"; null stays null. */
export function quarterWords(q: string | null): string | null {
  if (!q) return null;
  const m = /^([A-Za-z]{3})\/(\d{4})$/.exec(q);
  return m ? `the quarter to ${m[1]} ${m[2]}` : q;
}

// ---------------------------------------------------------------------------
// The month on screen

/** The month of a day, "2026-10". */
export const monthOf = (date: string) => date.slice(0, 7);
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export { monthGrid, shiftMonth } from "@/lib/time";

// ---------------------------------------------------------------------------
// The alert the day before

export const EARNINGS_PREFIX = "earnings:";

/**
 * A report tomorrow, as an alert: it fires the day before (the person's day), so the
 * morning check emails it, holds through the day itself and clears after.
 */
export function earningsNotices(entries: readonly EarningsEntry[], today: string): Notice[] {
  const out: Notice[] = [];
  for (const e of entries) {
    const days = daysBetween(today, e.date);
    if (days !== 1 && days !== 0) continue;
    const when = days === 1 ? "tomorrow" : "today";
    const q = quarterWords(e.quarter);
    out.push({
      key: `${EARNINGS_PREFIX}${symbolKey(e.symbol)}:${e.date}`,
      date: addDays(e.date, -1) < today ? today : addDays(e.date, -1),
      tone: "info",
      title: `${e.symbol} reports ${when}, ${e.time === "unknown" ? longDate(e.date) : `${TIME_LABEL[e.time].toLowerCase()} in New York`}`,
      detail: [`${KIND_LABEL[e.kind]}${e.subjectName ? `: ${e.subjectName}` : ""}.`, q ? `Results for ${q}.` : null, e.epsForecast !== null ? `Consensus EPS $${e.epsForecast.toFixed(2)}${e.estimates ? ` from ${e.estimates} estimate${e.estimates === 1 ? "" : "s"}` : ""}.` : null, "The report follows once the results are filed."].filter(Boolean).join(" "),
      href: `/earnings?month=${monthOf(e.date)}&day=${e.date}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The report after the results

const httpsUrl = z
  .string()
  .max(500)
  .refine((u) => /^https:\/\/[^\s/]+\.[^\s/]+/.test(u), "an https address");
export const sourceSchema = z.object({ title: z.string().min(1).max(160), url: httpsUrl });

export const filingRefSchema = z.object({ form: z.string().max(12), filed: isoDay, url: httpsUrl, period: isoDay.nullable(), /** The SEC accession number, so the filing's own documents can be read; null in a reference kept before it was added. */ accession: z.string().max(25).nullable().default(null),
  /** When the SEC accepted it, on New York's clock as the SEC prints it; null in a reference kept before it was added (Hamza, 4 Nov 2026: the move since the results came out). */
  accepted: z.string().max(30).nullish(),
});
export type FilingRef = z.infer<typeof filingRefSchema>;

export const figureLineSchema = z.object({
  label: z.string().max(60),
  /** The quarter's figure as shown, in the filing's currency. */
  now: z.string().max(40),
  before: z.string().max(40).nullable(),
  /** Change on the same quarter a year before, in percent; null when it cannot be read or means nothing. */
  changePct: z.number().nullable(),
  /** The quarter immediately before, when the source gives it (a release prints it; the facts need not). */
  prior: z.string().max(40).nullable().default(null),
});
export type FigureLine = z.infer<typeof figureLineSchema>;

/** What the person's Claude read in the release and the call: a few sentences, what was guided, and points with their pages. */
const modelCommentarySchema = z.object({
  summary: z.string().min(1).max(700),
  guidance: z.string().max(500).nullable(),
  points: z.array(z.object({ line: z.string().min(1).max(400), source: sourceSchema })).max(6),
  /** What the company did that investors did not expect, and why it did it (Hamza, 23 Oct 2026; lib/investigate.ts). A report kept before reads none. */
  unexpected: z
    .array(z.object({ what: z.string().min(1).max(300), why: z.string().min(1).max(700), sources: z.array(sourceSchema).min(1).max(4) }))
    .max(MAX_UNEXPECTED)
    .default([]),
});
export const commentarySchema = modelCommentarySchema;
export type Commentary = z.infer<typeof commentarySchema>;

/** What the person's Claude read on why the stock moved: two or three sentences and the pages they came from. */
const modelReactionSchema = z.object({
  why: z.string().min(1).max(700),
  points: z.array(z.object({ line: z.string().min(1).max(400), source: sourceSchema })).max(4),
});

/**
 * How the stock reacted to the results (Hamza, 20 Oct 2026: the report said
 * what was reported, never how investors took it): the move from the last
 * close before the results to the close of the first session that traded on
 * them, the app's own from the closes, beside the benchmark's over the same
 * sessions; and, why, from that day's pages.
 */
export const reactionSchema = z.object({
  /** The first session that traded on the results. */
  session: isoDay,
  from: z.object({ date: isoDay, close: z.number() }),
  to: z.object({ date: isoDay, close: z.number() }),
  movePct: z.number(),
  benchmark: z.string().max(12).nullable(),
  benchmarkPct: z.number().nullable(),
  why: z.string().max(700).nullable().default(null),
  points: z.array(z.object({ line: z.string().min(1).max(400), source: sourceSchema })).max(4).default([]),
  /** Why the reasons are not there, when they are not. */
  note: z.string().max(300).nullable().default(null),
});
export type Reaction = z.infer<typeof reactionSchema>;

// ---------------------------------------------------------------------------
// The quarter's figures from the release itself
//
// A 10-Q filer's release (an 8-K) comes weeks before the 10-Q, and a 20-F
// filer's quarters come on a 6-K that carries no XBRL at all; the quarter's
// figures are nonetheless printed in the release. The release is read the way
// a statement is (lib/statements.ts): its documents fetched from the SEC as
// HTML, stripped to text, read by the AI through one tool,
// then every figure checked against the printed text. A figure the text does
// not print is dropped and named, never used.

export const RELEASE_UNITS = ["units", "thousands", "millions", "billions"] as const;
export type ReleaseUnit = (typeof RELEASE_UNITS)[number];
const UNIT_MULT: Record<ReleaseUnit, number> = { units: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };
export const RELEASE_LINES = ["revenue", "costOfRevenue", "grossProfit", "rnd", "sellingMarketing", "generalAdmin", "sga", "operatingIncome", "taxExpense", "netIncome", "epsDiluted", "cfo", "capex", "fcf"] as const;
export type ReleaseLineKey = (typeof RELEASE_LINES)[number];
export const RELEASE_LINE_LABEL: Record<ReleaseLineKey, string> = { revenue: "Revenue", costOfRevenue: "Cost of revenue", grossProfit: "Gross profit", rnd: "Research and development", sellingMarketing: "Sales and marketing", generalAdmin: "General and administrative", sga: "Selling, general and administrative", operatingIncome: "Operating income", taxExpense: "Income tax", netIncome: "Net income", epsDiluted: "EPS, diluted", cfo: "Cash from operations", capex: "Capital expenditure", fcf: "Free cash flow" };
const printedNumber = z.number().finite().nullable();
/** One line as the release prints it: the quarter, the quarter immediately before, the same quarter a year before; null where the release does not print it. */
const releaseLineSchema = z.object({ now: printedNumber, quarterBefore: printedNumber, yearBefore: printedNumber });
export type ReleaseLine = z.infer<typeof releaseLineSchema>;
/** A line a release kept before 5 Nov 2026 never asked for: none. */
const NO_LINE: ReleaseLine = { now: null, quarterBefore: null, yearBefore: null };
const releaseKpiSchema = z.object({ name: z.string().min(1).max(60), unit: z.string().max(24), now: printedNumber, quarterBefore: printedNumber, yearBefore: printedNumber });
const modelReleaseSchema = z.object({
  /** The quarter the release reports, in its own words ("Q3 2026"). */
  period: z.string().min(1).max(40),
  periodEnd: isoDay.nullable(),
  currency: z.string().min(1).max(8),
  /** The unit the money lines are printed in; EPS is per share whatever the unit. */
  unit: z.enum(RELEASE_UNITS),
  lines: z.object({ revenue: releaseLineSchema, costOfRevenue: releaseLineSchema.default(NO_LINE), grossProfit: releaseLineSchema, rnd: releaseLineSchema.default(NO_LINE), sellingMarketing: releaseLineSchema.default(NO_LINE), generalAdmin: releaseLineSchema.default(NO_LINE), sga: releaseLineSchema.default(NO_LINE), operatingIncome: releaseLineSchema, taxExpense: releaseLineSchema.default(NO_LINE), netIncome: releaseLineSchema, epsDiluted: releaseLineSchema, cfo: releaseLineSchema, capex: releaseLineSchema, fcf: releaseLineSchema }),
  /** The company's own measures of its quarter (bookings, backlog, units), as printed. */
  kpis: z.array(releaseKpiSchema).max(6),
});
export type ReleaseRead = z.infer<typeof modelReleaseSchema>;
export const releaseFiguresSchema = modelReleaseSchema.extend({
  /** The filing's documents the text came from. */
  documents: z.array(z.string().max(120)).max(8),
  /** The figures the model recorded that the text does not print: dropped, never used. */
  dropped: z.array(z.string().max(80)).max(40),
  readAt: z.string(),
});
export type ReleaseFigures = z.infer<typeof releaseFiguresSchema>;

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", pound: "£", yen: "¥", ndash: "-", mdash: "-", minus: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "...", copy: "(c)", reg: "(R)", trade: "(TM)", times: "x", sect: "§", para: "¶", bull: "•", middot: "·", deg: "°", plusmn: "±", frac12: "1/2", frac14: "1/4", frac34: "3/4" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * An HTML document as text: scripts, styles and the inline-XBRL header
 * dropped, block ends and rows as line breaks, cells separated by " | " so
 * every printed number stays its own token, entities decoded, blank lines
 * removed.
 */
export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|ix:header|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote|pre)\s*>/gi, "\n").replace(/<\/t[dh]\s*>/gi, " | ").replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t   ]+/g, " ").replace(/( \| )+/g, " | ").replace(/^\| | \|$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

const filingIndexSchema = z.object({ directory: z.object({ item: z.array(z.object({ name: z.string() }).loose()) }).loose() }).loose();
/** Documents of one release read as text, at most. */
export const MAX_RELEASE_DOCS = 6;

/**
 * The documents of a release worth reading, from the filing's index.json:
 * the primary document first, then the exhibits (99.1 is the press release,
 * 99.2 often the statements), then the rest, HTML only; the SEC's own R
 * pages, the index page and the complete submission file are left out.
 * Throws when the document is not a filing index.
 */
export function releaseDocumentsOf(json: unknown, primary: string | null): string[] {
  const r = filingIndexSchema.safeParse(json);
  if (!r.success) throw new Error("not a filing index");
  const names = r.data.directory.item.map((i) => i.name).filter((n) => /\.html?$/i.test(n) && !/^R\d+\.htm$/i.test(n) && !/-index(-headers)?\.html?$/i.test(n) && !/FilingSummary/i.test(n));
  const rank = (n: string) => (primary && n.toLowerCase() === primary.toLowerCase() ? 0 : /ex-?99|ex99|exhibit|press|release|earning|results/i.test(n) ? 1 : 2);
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, MAX_RELEASE_DOCS);
}

/** Characters of release text the model is given, at most; the primary document and the exhibits come first, so the press release is never the part cut. */
export const MAX_RELEASE_CHARS = 120_000;

/** One text from the documents' texts, each under its name, cut at MAX_RELEASE_CHARS. */
export function releaseText(parts: readonly { name: string; text: string }[]): string {
  let out = "";
  for (const p of parts) {
    if (out.length >= MAX_RELEASE_CHARS) break;
    const t = p.text.trim();
    if (!t) continue;
    out += `=== ${p.name} ===\n${t}\n\n`;
  }
  return out.length > MAX_RELEASE_CHARS ? out.slice(0, MAX_RELEASE_CHARS) : out;
}

export type ReleaseInput = { symbol: string; name: string | null; date: string; quarter: string | null; form: string; text: string };

/** The request that reads the release's text through one tool, on any provider. */
export function releaseRequestBody(input: ReleaseInput, model = EARNINGS_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelReleaseSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 4000,
    system: `You read one company's results release, as filed with the SEC, and record the quarter's figures for a person's portfolio app.

Rules:
- Copy every figure exactly as the release prints it, as a plain number: 11,662 is 11662; (1,234) is -1234; 12.95 is 12.95. Never compute, estimate, convert, annualise or round a figure that is not printed; when a figure is not printed, record null.
- unit is the unit the money lines are printed in (millions when the table says "in millions" or "€ million"); EPS is per share whatever the unit. Record capex as a positive number.
- period is the quarter the release reports, in its own words (Q3 2026, third quarter 2026); periodEnd is its last day.
- lines are the quarter's own figures, never the year to date or the nine months: the quarter (now), the quarter immediately before it (quarterBefore) and the same quarter a year before (yearBefore), each only where the release prints it. grossProfit is gross profit, not the margin; costOfRevenue is the cost of revenue as printed (cost of sales, cost of goods sold, cost of revenues), as a positive number, recorded whether or not gross profit is printed. rnd, sellingMarketing, generalAdmin and sga are the operating expenses as printed, positive (sga only when the release prints selling, general and administrative as one line); taxExpense is the income tax charge, positive for a charge. fcf only when the release itself prints free cash flow; cfo and capex when it prints them.
- kpis: up to six measures the company itself reports for the quarter (net bookings, backlog, units, subscribers, installed base sales, a segment's sales), each with its unit as printed, never a figure already in lines.
- Your whole answer is one call to record_quarter; write nothing outside it.`,
    tools: [{ name: "record_quarter", description: "Record the quarter's figures as the release prints them.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `Company: ${input.name ?? input.symbol} (${input.symbol}). Results reported ${input.date}${input.quarter ? `, for the fiscal quarter ending ${input.quarter}` : ""}. The ${input.form} filed with the SEC, as text:\n\n${input.text}\n\nRecord the quarter's figures.` }] }],
  };
}

export type ReleaseParse = { ok: true; read: ReleaseRead } | { ok: false; reason: string; called: boolean };

/** Reads the answer: the one record_quarter call, validated. */
export function parseReleaseResponse(body: unknown): ReleaseParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_quarter");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the quarter", called: false };
  const parsed = modelReleaseSchema.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)`, called: true };
  return { ok: true, read: parsed.data };
}

/**
 * The read with every figure the text does not print set to null, and the
 * names of those dropped. The check is the statements' (lib/statements.ts
 * printed): the number as printed, allowing the rounding a release prints.
 */
export function checkReleaseRead(x: ReleaseRead, text: string): { read: ReleaseRead; dropped: string[] } {
  const nums = numbersIn(text);
  const dropped: string[] = [];
  const keep = (label: string, v: number | null): number | null => {
    if (v === null) return null;
    if (printed(v, nums)) return v;
    dropped.push(label.slice(0, 80));
    return null;
  };
  const lines = {} as ReleaseRead["lines"];
  for (const k of RELEASE_LINES) {
    const l = x.lines[k];
    const label = RELEASE_LINE_LABEL[k];
    lines[k] = { now: keep(`${label} (quarter)`, l.now), quarterBefore: keep(`${label} (quarter before)`, l.quarterBefore), yearBefore: keep(`${label} (a year before)`, l.yearBefore) };
  }
  const kpis = x.kpis
    .map((k) => ({ ...k, now: keep(`${k.name} (quarter)`, k.now), quarterBefore: keep(`${k.name} (quarter before)`, k.quarterBefore), yearBefore: keep(`${k.name} (a year before)`, k.yearBefore) }))
    .filter((k) => k.now !== null || k.quarterBefore !== null || k.yearBefore !== null);
  return { read: { ...x, lines, kpis }, dropped: dropped.slice(0, 40) };
}

/** Gross profit as printed, else revenue less the cost of revenue when both are (a release that prints no gross profit line; 4 Nov 2026). */
function releaseGross(L: ReleaseRead["lines"], w: keyof ReleaseLine): number | null {
  if (L.grossProfit[w] !== null) return L.grossProfit[w];
  const rev = L.revenue[w];
  const cost = L.costOfRevenue?.[w] ?? null;
  return rev !== null && cost !== null ? rev - Math.abs(cost) : null;
}

/** Free cash flow as printed, else cash from operations less capital expenditure when both are. */
function releaseFcf(L: ReleaseRead["lines"], w: keyof ReleaseLine): number | null {
  if (L.fcf[w] !== null) return L.fcf[w];
  const cfo = L.cfo[w];
  const capex = L.capex[w];
  return cfo !== null && capex !== null ? cfo - Math.abs(capex) : null;
}

/** The quarter's lines from the release, in the shape the filing's give: against a year before, with the quarter before beside. */
export function releaseLines(x: ReleaseRead): FigureLine[] {
  const m = UNIT_MULT[x.unit];
  const L = x.lines;
  const out: FigureLine[] = [];
  const flow = (label: string, l: ReleaseLine, perShare = false) => {
    if (l.now === null) return;
    const fmt = (v: number) => (perShare ? v.toFixed(2) : money(v * m));
    out.push({ label, now: fmt(l.now), before: l.yearBefore === null ? null : fmt(l.yearBefore), prior: l.quarterBefore === null ? null : fmt(l.quarterBefore), changePct: change(l.now, l.yearBefore ?? undefined) });
  };
  const margin = (label: string, l: ReleaseLine) => {
    const rev = L.revenue;
    if (l.now === null || rev.now === null || rev.now <= 0) return;
    const p = (v: number | null, r: number | null) => (v === null || r === null || r <= 0 ? null : pctText((v / r) * 100));
    out.push({ label, now: p(l.now, rev.now)!, before: p(l.yearBefore, rev.yearBefore), prior: p(l.quarterBefore, rev.quarterBefore), changePct: null });
  };
  flow("Revenue", L.revenue);
  margin("Gross margin", { now: releaseGross(L, "now"), quarterBefore: releaseGross(L, "quarterBefore"), yearBefore: releaseGross(L, "yearBefore") });
  flow("Operating income", L.operatingIncome);
  margin("Operating margin", L.operatingIncome);
  flow("Net income", L.netIncome);
  flow("EPS, diluted", L.epsDiluted, true);
  const fcf = { now: releaseFcf(L, "now"), quarterBefore: releaseFcf(L, "quarterBefore"), yearBefore: releaseFcf(L, "yearBefore") };
  flow("Free cash flow", fcf);
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The quarter a release reports as a key ("2026Q3"): from its period end, else from the calendar's fiscal quarter end ("Sep/2026"); null when neither says. */
export function releaseQuarterKey(x: { periodEnd: string | null }, quarter: string | null): string | null {
  if (x.periodEnd) {
    const q = nearestQuarter(x.periodEnd);
    if (q) return q.key;
  }
  const m = quarter ? /^([A-Za-z]{3})\/(\d{4})$/.exec(quarter) : null;
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  return mon < 0 ? null : `${m[2]}Q${Math.floor(mon / 3) + 1}`;
}

const QUARTER_ROWS: { key: string; label: string; unit: SeriesTable["rows"][number]["unit"] }[] = [
  { key: "revenue", label: "Revenue", unit: "money" },
  { key: "grossMarginPct", label: "Gross margin", unit: "pct" },
  { key: "operatingIncome", label: "Operating income", unit: "money" },
  { key: "operatingMarginPct", label: "Operating margin", unit: "pct" },
  { key: "netIncome", label: "Net income", unit: "money" },
  { key: "epsDiluted", label: "EPS, diluted", unit: "perShare" },
  { key: "fcf", label: "Free cash flow", unit: "money" },
];
const quarterLabel = (k: string) => `Q${k.slice(5)} ${k.slice(2, 4)}`;
const yearBeforeKey = (k: string) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;

/**
 * The quarterly series: the filings' facts (quarterTable), with the quarters
 * the releases printed laid where the facts have none (the facts win where
 * both have a figure), the last eight quarters, oldest first. The note names
 * the columns that are the releases'. Null when neither gives a line.
 */
export function quartersOf(table: FactsTable | null, releases: readonly { key: string; read: ReleaseRead }[]): { table: SeriesTable; note: string | null } | null {
  const pts = new Map<string, Map<string, number>>();
  const put = (row: string, q: string, v: number | null) => {
    if (v === null || !Number.isFinite(v)) return;
    if (!pts.has(row)) pts.set(row, new Map());
    pts.get(row)!.set(q, v);
  };
  const fromRelease = new Set<string>();
  for (const { key, read } of releases) {
    if (!/^\d{4}Q[1-4]$/.test(key)) continue;
    const m = UNIT_MULT[read.unit];
    const L = read.lines;
    const at: [keyof ReleaseLine, string][] = [["now", key], ["quarterBefore", quarterBefore(key)], ["yearBefore", yearBeforeKey(key)]];
    for (const [w, q] of at) {
      const rev = L.revenue[w];
      if (rev === null || rev <= 0 || pts.get("revenue")?.has(q)) continue;
      fromRelease.add(q);
      put("revenue", q, rev * m);
      const gross = releaseGross(L, w);
      if (gross !== null) put("grossMarginPct", q, (gross / rev) * 100);
      if (L.operatingIncome[w] !== null) {
        put("operatingIncome", q, L.operatingIncome[w]! * m);
        put("operatingMarginPct", q, (L.operatingIncome[w]! / rev) * 100);
      }
      if (L.netIncome[w] !== null) put("netIncome", q, L.netIncome[w]! * m);
      if (L.epsDiluted[w] !== null) put("epsDiluted", q, L.epsDiluted[w]!);
      const f = releaseFcf(L, w);
      if (f !== null) put("fcf", q, f * m);
    }
  }
  const base = table ? quarterTable(table) : null;
  const baseKeys = table?.latestQuarter ? factsQuarterKeys(table.latestQuarter) : [];
  if (base) {
    for (const row of base.rows) row.values.forEach((v, i) => (v === null ? null : (put(row.key, baseKeys[i], v), fromRelease.delete(baseKeys[i]))));
  }
  const keys = [...new Set([...baseKeys, ...[...pts.values()].flatMap((m) => [...m.keys()])])].sort().slice(-8);
  if (!keys.length) return null;
  const rows: SeriesTable["rows"] = QUARTER_ROWS.map((r) => ({ key: r.key, label: r.label, unit: r.unit, values: keys.map((k) => pts.get(r.key)?.get(k) ?? null) })).filter((r) => r.values.some((v) => v !== null));
  if (!rows.length) return null;
  const own = keys.filter((k) => fromRelease.has(k)).map(quarterLabel);
  const note = own.length ? (own.length === keys.length ? `Every quarter from the releases, as printed and checked against their text; the filings carry no quarterly facts.` : `${own.join(", ")} from the release${own.length > 1 ? "s" : ""}, as printed and checked against the text; the rest from the filings' facts.`) : null;
  return { table: { cols: keys.map(quarterLabel), rows }, note };
}

// ---------------------------------------------------------------------------
// Earlier releases: the quarters a 6-K filer printed before this one
//
// A 20-F filer's facts carry no quarters at all, so its quarterly series would
// hold only what this release printed (the quarter, the one before, the same
// one a year before). The earlier results 6-Ks are on the same submissions
// list; the run reads them the same way, a few per run, until eight quarters
// are in (Hamza, 16 Oct 2026). The helpers here are pure: which quarters are
// still missing, which 6-Ks could be the release, and whether a text reads as
// that quarter's results.

/** How many quarters the series reaches back, this one included. */
export const QUARTERS_BACK = 8;
/** Earlier releases read on the model in one run; the rest wait for the next. */
export const EARLIER_RELEASES_PER_RUN = 4;
/** The window after a quarter's end in which its results come out: a week at the earliest, two months at the latest. */
export const RESULTS_WINDOW_DAYS: readonly [number, number] = [7, 60];

/** The quarters the releases given cover with a revenue figure: each one's own quarter, the quarter before it and the same quarter a year before, where printed. */
export function releaseCoverage(releases: readonly { key: string; read: ReleaseRead }[]): Set<string> {
  const out = new Set<string>();
  for (const { key, read } of releases) {
    if (!/^\d{4}Q[1-4]$/.test(key)) continue;
    const at: [keyof ReleaseLine, string][] = [["now", key], ["quarterBefore", quarterBefore(key)], ["yearBefore", yearBeforeKey(key)]];
    for (const [w, q] of at) {
      const rev = read.lines.revenue[w];
      if (rev !== null && rev > 0) out.add(q);
    }
  }
  return out;
}

/** The quarters before `latest` that no release covers, newest first, within QUARTERS_BACK of it (the latest itself left out). */
export function missingQuarters(latest: string, covered: ReadonlySet<string>, back = QUARTERS_BACK): string[] {
  if (!/^\d{4}Q[1-4]$/.test(latest)) return [];
  const out: string[] = [];
  let k = quarterBefore(latest);
  for (let i = 1; i < back; i++) {
    if (!covered.has(k)) out.push(k);
    k = quarterBefore(k);
  }
  return out;
}

/** The last day of a quarter key: "2026Q3" is 2026-09-30. */
export function quarterEnd(key: string): string {
  const y = key.slice(0, 4);
  return `${y}-${["03-31", "06-30", "09-30", "12-31"][Number(key.slice(5)) - 1]}`;
}

/**
 * The 6-Ks on the submissions list that could be the quarter's results: filed
 * in the results window after its end, oldest first, those already tried left
 * out. Which one is the release is settled by reading it (looksLikeResults,
 * then the model's own periodEnd).
 */
export function candidateReleases(json: unknown, cik: number, key: string, archive: FilingLink, tried: readonly string[] = []): FilingRef[] {
  const r = submissionsSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document with recent filings");
  const f = r.data.filings.recent;
  const end = quarterEnd(key);
  const from = addDays(end, RESULTS_WINDOW_DAYS[0]);
  const to = addDays(end, RESULTS_WINDOW_DAYS[1]);
  const out: FilingRef[] = [];
  for (let i = 0; i < f.form.length; i++) {
    const filed = f.filingDate[i];
    if (f.form[i] !== "6-K" || !filed || filed < from || filed > to) continue;
    const accession = f.accessionNumber[i]?.slice(0, 25) ?? null;
    if (accession && tried.includes(accession)) continue;
    out.push({ form: "6-K", filed, url: archive(cik, f.accessionNumber[i], f.primaryDocument?.[i] || undefined), period: f.reportDate?.[i] && /^\d{4}-\d{2}-\d{2}$/.test(f.reportDate[i]) ? f.reportDate[i] : null, accession });
  }
  return out.sort((a, b) => a.filed.localeCompare(b.filed));
}

const QUARTER_WORDS = ["first", "second", "third", "fourth"];
const QUARTER_END_WORDS = [["march 31", "31 march"], ["june 30", "30 june"], ["september 30", "30 september"], ["december 31", "31 december"]];

/**
 * Whether a filing's text reads as the quarter's results: it names the
 * quarter and its year (Q3 2026, third quarter of 2026, three months ended
 * September 30, 2026), carries a sales or revenue line and prints a table's
 * worth of figures. A dividend notice, a buyback report or a presentation
 * about something else does not pass; the model's read settles the rest.
 */
export function looksLikeResults(text: string, key: string): boolean {
  if (!/^\d{4}Q[1-4]$/.test(key) || text.length < 500) return false;
  const t = text.toLowerCase();
  const mentions = (k: string) => {
    const y = k.slice(0, 4);
    const q = Number(k.slice(5));
    const word = QUARTER_WORDS[q - 1];
    const names = [`q${q} ${y}`, `q${q}-${y}`, `q${q}'${y.slice(2)}`, `${y} q${q}`, `${word} quarter ${y}`, `${word} quarter of ${y}`, `${word}-quarter ${y}`, `${word} quarter of fiscal ${y}`, `${word} quarter fiscal ${y}`, ...QUARTER_END_WORDS[q - 1].flatMap((d) => [`${d}, ${y}`, `${d} ${y}`])];
    return names.reduce((n, name) => n + t.split(name).length - 1, 0);
  };
  const own = mentions(key);
  if (!own) return false;
  // A release names its own quarter more than the next one (which the quarter after's release, or an outlook, would name more).
  const q = Number(key.slice(5));
  const after = q === 4 ? `${Number(key.slice(0, 4)) + 1}Q1` : `${key.slice(0, 4)}Q${q + 1}`;
  if (mentions(after) >= own) return false;
  if (!/net sales|revenue|turnover/.test(t)) return false;
  return numbersIn(text).length >= 20;
}

/** The last eight quarter keys ending at the latest, oldest first. */
function factsQuarterKeys(latest: string): string[] {
  const keys: string[] = [];
  let k = latest;
  for (let i = 0; i < 8; i++) {
    keys.unshift(k);
    k = quarterBefore(k);
  }
  return keys;
}

// ---------------------------------------------------------------------------
/** A deck kept in Drive: Google Slides, or (`file`) the .pptx as it is when Drive would not convert it, shown in Drive's viewer. */
export const reportDocStateSchema = z.object({ at: z.string(), sig: z.string().max(16), ready: z.boolean(), drop: z.array(z.string().max(400)).max(40).default([]), held: z.array(z.string().max(200)).max(40).default([]) });
export type ReportDocState = z.infer<typeof reportDocStateSchema>;
export const keptDeckSchema = z.object({ id: z.string().regex(/^[\w-]{10,200}$/), url: z.string().regex(/^https:\/\/(docs|drive)\.google\.com\//), at: z.string(), file: z.boolean().optional(), /** The deck layout it was drawn with; a deck drawn before DECK_LAYOUT is drawn again. */ layout: z.number().int().optional() });
/** The decks' layout: raised when the slides change, so every kept deck is drawn again (29 Oct 2026: guidance, the call and the study's words on their own slides, nothing cut). */
export const DECK_LAYOUT = 3;

/**
 * Whether the earnings deck may be made (Hamza, 4 Nov 2026: no deck posted
 * that says the study is not done or lacks what is coming; the ontology's
 * DECK_NEEDS): the quarter's figures, the call read (or found not to be
 * available), the study written on these results and the deck's words from
 * it. `writes` is whether the person's model can read the call and write the
 * study at all; without one, those are not waited for. Past DECK_WAIT_DAYS
 * after the results the deck is made with what is on file, and `late` says so.
 */
export function deckReadiness(r: Pick<EarningsReport, "date" | "figures" | "call" | "detail">, writes: boolean, today: string): { ready: boolean; waiting: DeckNeed[]; late: boolean } {
  const study = r.detail?.study && r.detail.study.finishedAt.slice(0, 10) >= r.date ? r.detail.study : null;
  const age = daysBetween(r.date, today);
  const met: Record<DeckNeed, boolean> = {
    figures: r.figures.length > 0,
    call: !writes || r.call !== null,
    flow: !writes || !r.detail?.flow || !flowAsks(r.detail.flow).length || !!r.detail.flowNotes,
    study: !writes || !!study || age > RESULTS_STUDY_DAYS,
    brief: !writes || !study || (!!r.detail?.brief && r.detail.brief.studyId === study.id),
  };
  const waiting = DECK_NEEDS.map((n) => n.key).filter((k) => !met[k]);
  const late = waiting.length > 0 && age >= DECK_WAIT_DAYS;
  return { ready: waiting.length === 0 || late, waiting, late };
}

/** The sentence a screen shows while a report's deck waits; null once it is made or may be. */
export function deckWaiting(r: EarningsReport, writes: boolean, today: string): string | null {
  if (r.doc?.ready || (r.status !== "release" && r.status !== "complete")) return null;
  const d = deckReadiness(r, writes, today);
  if (d.ready) return r.doc && !r.doc.ready ? "The earnings report is being read through before it is sent; it goes out once it reads whole." : null;
  return deckWaitWords(d.waiting);
}

/** What a deck waits for, in a sentence. */
export function deckWaitWords(waiting: readonly DeckNeed[]): string {
  const parts = DECK_NEEDS.filter((n) => waiting.includes(n.key)).map((n) => n.about);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  return `The earnings report is made once ${list} ${parts.length === 1 ? "is" : "are"} in, and emailed then; after ${DECK_WAIT_DAYS} days it is made with what is on file.`;
}

// The detail behind the deck: what the deep dive draws, kept with the report

export const seriesTableSchema = z.object({
  cols: z.array(z.string().max(24)).max(12),
  rows: z.array(z.object({ key: z.string().max(40), label: z.string().max(80), unit: z.enum(["money", "perShare", "shares", "pct", "ratio"]), values: z.array(z.number().nullable()).max(12) })).max(40),
});
export type SeriesTable = z.infer<typeof seriesTableSchema>;

const criterionSchema = z.object({ label: z.string().max(160), value: z.string().max(60).nullable(), pass: z.boolean(), read: z.boolean(), note: z.string().max(300).nullable() });

export const weeklyPointSchema = z.object({ date: isoDay, close: z.number() });
export type WeeklyPoint = z.infer<typeof weeklyPointSchema>;

/** Beta on weekly log returns against a benchmark, with the test of beta = 1. */
export const betaSchema = z.object({
  benchmark: z.string().max(20),
  weeks: z.number().int(),
  beta: z.number(),
  se: z.number(),
  /** t for H0: beta = 1, and its one-sided p (H1: beta > 1). */
  t: z.number(),
  p: z.number(),
  r2: z.number(),
  /** Annualised volatility of the holding and the benchmark, in percent. */
  volatility: z.number(),
  benchVolatility: z.number(),
  /** The deepest fall from a high over the window, in percent, for both. */
  worstFall: z.number(),
  benchWorstFall: z.number(),
});
export type BetaStats = z.infer<typeof betaSchema>;

/** At most this many reads added since the results are carried on a report. */
export const MAX_READS = 4;
/** One read added to the thesis since the results, as a report carries it. */
export const addedReadSchema = z.object({ at: isoDay, source: z.string().max(200), summary: z.string().max(600), changes: z.string().max(300).nullable() });
export type AddedRead = z.infer<typeof addedReadSchema>;


/**
 * What the post-earnings deck draws beyond the headline, kept with the
 * report so the deck is made from the report alone: the position as the book
 * carried it, the filings' five years and eight quarters, the segment and
 * geography lines, the engine, every criterion and rule, the study on file,
 * and a year of weekly closes with the beta against the methodology's first
 * benchmark. Null in a report kept before it was added; a part the data could
 * not fill is null and the deck says what it needs.
 */
export const histPointSchema = z.object({ date: isoDay, value: z.number() });
/** The five-year multiple as the deck keeps it: the weekly line (a gap where the figure under it was near zero), its median, low, high and today. */
export const deckHistorySchema = z.object({
  metric: z.enum(HISTORY_METRICS),
  label: z.string().max(20),
  points: z.array(z.object({ date: isoDay, value: z.number().nullable() })).max(280),
  median: z.number().nullable(),
  low: histPointSchema.nullable(),
  high: histPointSchema.nullable(),
  now: histPointSchema.nullable(),
  percentile: z.number().nullable(),
  words: z.string().max(300),
});
export type DeckHistory = z.infer<typeof deckHistorySchema>;
/** The peers as the deck keeps them: each multiple for the company, its peers' median and its sector as a whole, the basis in words and the peers by name. */
export const deckPeersSchema = z.object({
  words: z.string().max(300),
  sector: z.string().max(80).nullable(),
  rows: z.array(z.object({ label: z.string().max(20), company: z.number().nullable(), peersMedian: z.number().nullable(), peersN: z.number().int(), sectorWhole: z.number().nullable(), sectorN: z.number().int() })).max(8),
  peers: z.array(z.object({ symbol: z.string().max(12), name: z.string().max(80).nullable() })).max(8),
  notes: z.array(z.string().max(200)).max(4),
});
export type DeckPeers = z.infer<typeof deckPeersSchema>;

const detailSchema = z.object({
  position: z
    .object({ quantity: z.number(), price: z.number().nullable(), value: z.number(), currency: z.string().max(3), costBasis: z.number().nullable(), gainPct: z.number().nullable(), cap: z.number().nullable(), capSection: z.string().max(40).nullable(), asOf: isoDay })
    .nullable(),
  years: seriesTableSchema.nullable(),
  quarters: seriesTableSchema.nullable(),
  /** Which of the quarters' columns came from the releases rather than the filings' facts; null when every one is the facts'. */
  quartersNote: z.string().max(300).nullable().default(null),
  /** How the quarter's revenue became profit, as a flow (lib/income-flow.ts; Hamza, 5 Nov 2026): the filings' facts, else the release's printed lines. */
  flow: incomeFlowSchema.nullable().default(null),
  /** The measures the company itself reports in its release (bookings, backlog, units), the quarter against the one before and a year before, as printed. */
  kpis: z.array(z.object({ name: z.string().max(60), unit: z.string().max(24), now: z.number().nullable(), quarterBefore: z.number().nullable(), yearBefore: z.number().nullable() })).max(6).default([]),
  segments: z.object({ form: z.string().max(12), period: z.string().max(40), lines: z.array(z.object({ name: z.string().max(80), value: z.number(), growthPct: z.number().nullable(), sharePct: z.number().nullable(), excluded: z.string().max(200).nullable(), kind: z.enum(LINE_KINDS).nullable().default(null) })).max(20) }).nullable(),
  geography: z.object({ form: z.string().max(12), period: z.string().max(40), lines: z.array(z.object({ name: z.string().max(80), sharePct: z.number() })).max(20), partial: z.boolean(), note: z.string().max(300).nullable() }).nullable(),
  engine: z.object({ growthPct: z.number().nullable(), sharePct: z.number().nullable(), line: z.string().max(80).nullable(), notes: z.array(z.string().max(300)).max(6) }).nullable(),
  /** The ontology's fundamentals as read from the filings, by field; a note for each that could not be. */
  fundamentals: z.record(z.string(), z.number().nullable()),
  fundamentalsNotes: z.array(z.string().max(300)).max(30),
  /** The class the tests name (else the best count), criterion by criterion, and the floors of every class. */
  criteria: z.object({ classLabel: z.string().max(80), passes: z.number(), needed: z.number(), of: z.number(), required: z.array(criterionSchema).max(12), lines: z.array(criterionSchema).max(20) }).nullable(),
  floors: z.array(z.object({ label: z.string().max(80), needed: z.number(), of: z.number() })).max(12),
  /** Every rule the methodology tested on the new figures, passes included. */
  checks: z.array(z.object({ section: z.string().max(40), text: z.string().max(300), status: z.enum(["pass", "near", "fail", "n/a"]), actual: z.string().max(40).nullable(), limit: z.string().max(40), figure: z.string().max(80) })).max(40),
  /** The latest finished study of the company on the Research screen, a few hundred characters per section. */
  study: z.object({ id: z.string().max(12), finishedAt: z.string(), question: z.string().max(600), sections: z.array(z.object({ id: z.string().max(40), title: z.string().max(80), text: z.string().max(900) })).max(30) }).nullable(),
  /** A year of weekly closes and the beta, when the price feed answered. */
  prices: z
    .object({
      closes: z.array(weeklyPointSchema).max(60),
      /** The benchmark's weekly closes over the same weeks, so the deck can draw the real pairs; empty in a report kept before it was added. */
      benchCloses: z.array(weeklyPointSchema).max(60).default([]),
      beta: betaSchema.nullable(),
      note: z.string().max(200).nullable(),
      /** The last close of each calendar year the feed reached, oldest first, then today's; the deck's valuation history reads them against the years' EPS. */
      yearEnds: z.array(weeklyPointSchema).max(12).default([]),
    })
    .nullable(),
  /** The thesis in the person's words: the Theses screen's text (else the record's note), in full. */
  thesis: z.string().max(6000).nullable(),
  /** The pathway a Transitional thesis names, and what the thesis says to watch. */
  pathway: z.string().max(1500).nullable().default(null),
  watch: z.array(z.string().max(300)).max(8).default([]),
  /** The thesis's pillars, each read on the new figures: supported, mixed, at risk or unread. */
  pillars: z.array(z.object({ name: z.string().max(80), text: z.string().max(600), tag: z.enum(["supported", "mixed", "risk", "unread"]), words: z.string().max(200) })).max(6).default([]),
  /** The person's DCF at the report's price (lib/dcf.ts), when a thesis carries one. */
  dcf: dcfSummarySchema.nullable().default(null),
  /** The valuation by stage on the new figures (lib/valuation.ts): the stage the filings decide, the metrics useful at it, the chosen method's cases; null in a report kept before it. */
  valuation: valuationSummarySchema.nullable().default(null),
  /** What was added to the thesis on or after the results day, newest first: what the person's own Claude read and wrote back with write_thesis , or a note of theirs (Hamza, 26 Oct 2026). Laid again by the runs while the results are recent (withThesisReads in lib/theses.ts). */
  added: z.array(addedReadSchema).max(MAX_READS).default([]),
  /** The quarter before this one as its report left it, so the deck can say what changed. */
  before: z.object({ quarter: z.string().max(20).nullable(), date: isoDay, classNow: z.string().max(80).nullable(), killsMet: z.number(), kills: z.number(), figures: z.array(figureLineSchema).max(10), valuationBase: z.number().nullable(), price: z.number().nullable() }).nullable().default(null),
  /** The latest balance sheet lines the DCF bridges with, in the filing's currency. */
  balance: z.object({ cash: z.number().nullable(), investments: z.number().nullable(), debt: z.number().nullable(), shares: z.number().nullable(), quarter: z.string().max(20).nullable() }).nullable().default(null),
  /** The multiple over five years, each week's close over the trailing per-share figure known then (lib/valuation-history.ts), for the deck's chart (Hamza, 27 Oct 2026); null in a report kept before it or with no closes. */
  history: deckHistorySchema.nullable().default(null),
  /** The company's multiples against its peers' median and its sector as a whole (lib/peers.ts), for the deck's chart; null when the screener has read no peer. */
  peers: deckPeersSchema.nullable().default(null),
  /** The deck's own words for the slides a study answers (lib/deck-brief.ts), written from the study and the call; null until written. */
  brief: deckBriefSchema.nullable().default(null),
  /** What lies behind the flow's lines (lib/flow-notes.ts; Hamza, 5 Nov 2026): why the company spends what it does and where it goes, from the release, the call and the web; null until written. */
  flowNotes: flowNotesSchema.nullable().default(null),
});
export type EarningsDetail = z.infer<typeof detailSchema>;

/** The last close of each week, Monday to Sunday, oldest first. */
export function weeklyCloses(points: readonly { date: string; value: number }[]): WeeklyPoint[] {
  const byWeek = new Map<string, WeeklyPoint>();
  for (const p of points.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const d = new Date(`${p.date}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    byWeek.set(monday, { date: p.date, close: p.value });
  }
  return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

// Student's t: the regularized incomplete beta by continued fraction (Numerical Recipes betacf).
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function betacf(a: number, b: number, x: number): number {
  const EPS = 3e-14;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** P(T > t) for Student's t with `df` degrees of freedom. */
export function tTailP(t: number, df: number): number {
  const x = df / (df + t * t);
  const twoSided = betaI(df / 2, 0.5, x);
  return t >= 0 ? twoSided / 2 : 1 - twoSided / 2;
}

/**
 * Beta of the holding on the benchmark over weekly log returns, least
 * squares, with the standard error, the test of beta = 1 (one-sided, beta
 * above 1), R squared, annualised volatility and the worst fall of each.
 * Null with fewer than 20 shared weeks.
 */
/** The weekly log returns of a holding and its benchmark over the weeks both have a close, as [benchmark, holding] pairs. */
export function weeklyPairs(holding: readonly WeeklyPoint[], bench: readonly WeeklyPoint[]): [number, number][] {
  const weekOf = (d: string) => {
    const x = new Date(`${d}T00:00:00Z`);
    return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  };
  const b = new Map(bench.map((p) => [weekOf(p.date), p.close]));
  const pairs: [number, number][] = [];
  let prev: { h: number; b: number } | null = null;
  for (const p of holding) {
    const bc = b.get(weekOf(p.date));
    if (bc === undefined || p.close <= 0 || bc <= 0) continue;
    if (prev) pairs.push([Math.log(bc / prev.b), Math.log(p.close / prev.h)]);
    prev = { h: p.close, b: bc };
  }
  return pairs;
}

export function betaStats(holding: readonly WeeklyPoint[], bench: readonly WeeklyPoint[], benchmark: string): BetaStats | null {
  const pairs = weeklyPairs(holding, bench);
  const n = pairs.length;
  if (n < 20) return null;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const sxy = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const syy = pairs.reduce((s, [, y]) => s + (y - my) ** 2, 0);
  if (sxx === 0 || syy === 0) return null;
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  const sse = pairs.reduce((s, [x, y]) => s + (y - alpha - beta * x) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const t = se > 0 ? (beta - 1) / se : 0;
  const vol = (xs: number[]) => Math.sqrt((xs.reduce((s, v) => s + (v - xs.reduce((a, c) => a + c, 0) / xs.length) ** 2, 0) / (xs.length - 1)) * 52) * 100;
  const fall = (ps: readonly WeeklyPoint[]) => {
    let hi = -Infinity;
    let worst = 0;
    for (const p of ps) {
      hi = Math.max(hi, p.close);
      worst = Math.min(worst, p.close / hi - 1);
    }
    return -worst * 100;
  };
  const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    benchmark,
    weeks: n,
    beta: round(beta),
    se: round(se),
    t: round(t),
    p: round(tTailP(t, n - 2)),
    r2: round(sxx === 0 ? 0 : (sxy * sxy) / (sxx * syy)),
    volatility: round(vol(pairs.map(([, y]) => y)), 2),
    benchVolatility: round(vol(pairs.map(([x]) => x)), 2),
    worstFall: round(fall(holding), 2),
    benchWorstFall: round(fall(bench), 2),
  };
}

/** The last eight quarters of the flows and margins, oldest first, as a series table. */
export function quarterTable(t: FactsTable): SeriesTable | null {
  if (!t.latestQuarter) return null;
  const keys = factsQuarterKeys(t.latestQuarter);
  const at = (f: keyof FactsTable["quarterly"], q: string) => t.quarterly[f]?.[q] ?? null;
  const r = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
  const fcf = (q: string) => (at("cfo", q) === null || at("capex", q) === null ? null : at("cfo", q)! - at("capex", q)! - (at("intangiblesPurchases", q) ?? 0));
  const rows: SeriesTable["rows"] = (
    [
    { key: "revenue", label: "Revenue", unit: "money", values: keys.map((q) => at("revenue", q)) },
    { key: "grossMarginPct", label: "Gross margin", unit: "pct", values: keys.map((q) => (r(at("grossProfit", q), at("revenue", q)) === null ? null : r(at("grossProfit", q), at("revenue", q))! * 100)) },
    { key: "operatingIncome", label: "Operating income", unit: "money", values: keys.map((q) => at("operatingIncome", q)) },
    { key: "operatingMarginPct", label: "Operating margin", unit: "pct", values: keys.map((q) => (r(at("operatingIncome", q), at("revenue", q)) === null ? null : r(at("operatingIncome", q), at("revenue", q))! * 100)) },
    { key: "netIncome", label: "Net income", unit: "money", values: keys.map((q) => at("netIncome", q)) },
    { key: "epsDiluted", label: "EPS, diluted", unit: "perShare", values: keys.map((q) => at("epsDiluted", q)) },
    { key: "fcf", label: "Free cash flow", unit: "money", values: keys.map(fcf) },
  ] as SeriesTable["rows"]
  ).filter((row) => row.values.some((v) => v !== null));
  if (!rows.length) return null;
  return { cols: keys.map(quarterLabel), rows };
}

export type DetailInput = {
  holding: Pick<Holding, "quantity" | "price" | "value" | "currency" | "costBasis" | "asOf"> | null;
  cap: { cap: number; section: string } | null;
  table: FactsTable | null;
  segments: SegmentRead | null;
  geography: RevenueGeography | null;
  engine: Engine | null;
  fundamentals: Fundamentals | null;
  verdict: CompanyVerdict | null;
  study: Study | null;
  closes: { holding: readonly { date: string; value: number }[]; bench: readonly { date: string; value: number }[]; benchmark: string; note: string | null } | null;
  /** The thesis from the Theses screen, read on the new figures (lib/theses.ts); a record's note alone comes as `text`. */
  thesis: { text: string | null; pathway?: string | null; watch?: string[]; pillars?: EarningsDetail["pillars"]; dcf?: DcfSummary | null; valuation?: ValuationSummary | null } | null;
  before: EarningsReport | null;
  balance: EarningsDetail["balance"];
  /** The quarters the releases printed (this report's first, then earlier reports'), each with its quarter key, for the series where the facts have none. */
  releases: readonly { key: string; read: ReleaseRead }[];
  kpis: EarningsDetail["kpis"];
  /** What was added to the thesis since the results (lib/theses.ts addedReads). */
  added?: readonly AddedRead[];
  /** The brief kept on the report before, carried while its study is the same one. */
  brief?: DeckBrief | null;
  /** The notes on the flow kept on the report before; written again when the flow or the call moves on (flowNotesDue). */
  flowNotes?: FlowNotes | null;
  /** The five-year multiple and the peers, when read. */
  history?: ValuationHistory | null;
  peers?: PeerComparison | null;
  /** This report's own release read, with its quarter key, and the filings' segment history, for the flow. */
  ownRelease?: { key: string | null; read: ReleaseRead } | null;
  segmentHistory?: SegmentHistory | null;
};

/** The release's lines for the flow, in money: the quarter or the same quarter a year before. */
function releaseFlowLines(read: ReleaseRead, w: keyof ReleaseLine): FlowLines {
  const m = UNIT_MULT[read.unit];
  const L = read.lines;
  const x = (l: ReleaseLine | undefined, abs = false) => (l && l[w] !== null ? (abs ? Math.abs(l[w]!) : l[w]!) * m : null);
  return { revenue: x(L.revenue), costOfRevenue: x(L.costOfRevenue, true), grossProfit: x(L.grossProfit), rnd: x(L.rnd, true), sellingMarketing: x(L.sellingMarketing, true), generalAdmin: x(L.generalAdmin, true), sga: x(L.sga, true), operatingIncome: x(L.operatingIncome), taxExpense: x(L.taxExpense), netIncome: x(L.netIncome) };
}

/** The quarter's flow from the release's printed lines alone, before the 10-Q, or for a filer whose quarters only the release gives. */
export function flowFromRelease(read: ReleaseRead, history: SegmentHistory | null = null): IncomeFlow | null {
  return buildFlow(releaseFlowLines(read, "now"), releaseFlowLines(read, "yearBefore"), { label: read.period, basis: "quarter", currency: read.currency, from: "release" }, read.periodEnd ? segmentSources(history, read.periodEnd, "quarter") : null);
}

/** The report's flow: the filings' quarter once they carry this report's quarter, else the release's own lines. */
function reportFlow(i: DetailInput): IncomeFlow | null {
  const own = i.ownRelease ?? null;
  const fromFacts = i.table && (!own || i.table.latestQuarter === own.key) ? flowFromFacts(i.table, "quarter", i.segmentHistory) : null;
  return fromFacts ?? (own ? flowFromRelease(own.read, i.segmentHistory ?? null) : null);
}

/** The last close of each calendar year, oldest first, and the latest close after them. */
export function yearEndCloses(points: readonly { date: string; value: number }[]): WeeklyPoint[] {
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const byYear = new Map<string, WeeklyPoint>();
  for (const p of sorted) byYear.set(p.date.slice(0, 4), { date: p.date, close: p.value });
  const last = sorted[sorted.length - 1];
  const ends = [...byYear.values()].filter((p) => p.date.slice(0, 4) !== last.date.slice(0, 4) || p.date === last.date);
  if (ends[ends.length - 1]?.date !== last.date) ends.push({ date: last.date, close: last.value });
  return ends.slice(-12);
}

/** The detail from what the run read; every part null where the data was not there. */
export function buildDetail(i: DetailInput): EarningsDetail {
  const v = i.verdict;
  const own = v?.classTests.length ? (v.classTests.find((t) => t.classId === v.classId) ?? v.classTests.slice().sort((a, b) => b.passes / Math.max(1, b.criteria.length) - a.passes / Math.max(1, a.criteria.length))[0]) : null;
  const line = (c: CriterionLine) => ({ label: c.label.slice(0, 160), value: c.value?.slice(0, 60) ?? null, pass: c.pass, read: c.read, note: c.note?.slice(0, 300) ?? null });
  const weekly = i.closes ? weeklyCloses(i.closes.holding).slice(-60) : [];
  const beta = i.closes && weekly.length ? betaStats(weekly, weeklyCloses(i.closes.bench), i.closes.benchmark) : null;
  return {
    position: i.holding
      ? {
          quantity: i.holding.quantity,
          price: i.holding.price,
          value: i.holding.value,
          currency: i.holding.currency,
          costBasis: i.holding.costBasis,
          gainPct: i.holding.costBasis && i.holding.costBasis > 0 ? Math.round(((i.holding.value - i.holding.costBasis) / i.holding.costBasis) * 1000) / 10 : null,
          cap: i.cap?.cap ?? null,
          capSection: i.cap?.section ?? null,
          asOf: i.holding.asOf,
        }
      : null,
    years: i.table ? studyTable(i.table) : null,
    quarters: quartersOf(i.table, i.releases)?.table ?? null,
    quartersNote: quartersOf(i.table, i.releases)?.note ?? null,
    flow: reportFlow(i),
    kpis: i.kpis.slice(0, 6).map((k) => ({ name: k.name.slice(0, 60), unit: k.unit.slice(0, 24), now: k.now, quarterBefore: k.quarterBefore, yearBefore: k.yearBefore })),
    segments: i.segments ? { form: i.segments.form.slice(0, 12), period: i.segments.period.slice(0, 40), lines: i.segments.lines.slice(0, 20).map((l) => ({ name: l.name.slice(0, 80), value: l.value, growthPct: l.growthPct, sharePct: l.sharePct, excluded: l.excluded?.slice(0, 200) ?? null, kind: l.kind })) } : null,
    geography: i.geography ? { form: i.geography.form, period: i.geography.period, lines: i.geography.lines.slice(0, 20).map((l) => ({ name: l.name, sharePct: l.sharePct })), partial: i.geography.partial, note: i.geography.note } : null,
    engine: i.engine ? { growthPct: i.engine.values.engine_growth_pct ?? null, sharePct: i.engine.values.engine_share_pct ?? null, line: i.engine.line?.name.slice(0, 80) ?? null, notes: i.engine.notes.slice(0, 6).map((n) => n.slice(0, 300)) } : null,
    fundamentals: Object.fromEntries(Object.entries(i.fundamentals?.values ?? {}).map(([k, x]) => [k, x ?? null])),
    fundamentalsNotes: (i.fundamentals?.notes ?? []).slice(0, 30).map((n) => n.slice(0, 300)),
    criteria: own ? { classLabel: own.label.slice(0, 80), passes: own.passes, needed: own.needed, of: own.criteria.length, required: own.required.slice(0, 12).map(line), lines: own.criteria.slice(0, 20).map(line) } : null,
    floors: (v?.classTests ?? []).slice(0, 12).map((t) => ({ label: t.label.slice(0, 80), needed: t.needed, of: t.criteria.length })),
    checks: (v?.checks ?? []).slice(0, 40).map((c) => ({ section: c.rule.section.slice(0, 40), text: c.rule.text.slice(0, 300), status: c.status, actual: c.actual?.slice(0, 40) ?? null, limit: c.limit.slice(0, 40), figure: c.figure.slice(0, 80) })),
    study: i.study ? studyOnReport(i.study) : null,
    prices: i.closes ? { closes: weekly, benchCloses: i.closes ? weeklyCloses(i.closes.bench).slice(-60) : [], beta, note: i.closes.note?.slice(0, 200) ?? (weekly.length ? null : "The price feed gave no closes for this symbol."), yearEnds: yearEndCloses(i.closes.holding) } : null,
    thesis: i.thesis?.text?.slice(0, 6000) ?? null,
    pathway: i.thesis?.pathway?.slice(0, 1500) ?? null,
    watch: (i.thesis?.watch ?? []).slice(0, 8).map((w) => w.slice(0, 300)),
    pillars: (i.thesis?.pillars ?? []).slice(0, 6).map((p) => ({ name: p.name.slice(0, 80), text: p.text.slice(0, 600), tag: p.tag, words: p.words.slice(0, 200) })),
    dcf: i.thesis?.dcf ?? null,
    valuation: i.thesis?.valuation ?? null,
    added: (i.added ?? []).slice(0, MAX_READS),
    before: i.before
      ? {
          quarter: i.before.quarter,
          date: i.before.date,
          classNow: i.before.classNow,
          killsMet: i.before.triggers.filter((t) => t.kind === "kill" && t.met).length,
          kills: i.before.triggers.filter((t) => t.kind === "kill").length,
          figures: i.before.figures.slice(0, 10),
          valuationBase: i.before.valuation?.base ?? null,
          price: i.before.valuation?.price ?? i.before.detail?.position?.price ?? null,
        }
      : null,
    balance: i.balance,
    history: i.history ? deckHistory(i.history) : null,
    peers: i.peers ? deckPeers(i.peers) : null,
    brief: i.brief ?? null,
    flowNotes: i.flowNotes ?? null,
  };
}

/** The five-year multiple as the deck keeps it, thinned to at most 270 weeks. */
export function deckHistory(h: ValuationHistory): DeckHistory | null {
  if (!h.points.some((p) => p.value !== null)) return null;
  const step = Math.max(1, Math.ceil(h.points.length / 270));
  const points = h.points.filter((_, i) => i % step === 0 || i === h.points.length - 1).map((p) => ({ date: p.date, value: p.value }));
  return { metric: h.metric, label: HISTORY_LABEL[h.metric], points, median: h.median, low: h.low, high: h.high, now: h.now, percentile: h.percentile, words: historyWords(h).slice(0, 300) };
}

/** The peers as the deck keeps them; null when no multiple has a peer read. */
export function deckPeers(p: PeerComparison): DeckPeers | null {
  if (!p.rows.some((r) => r.peersMedian !== null || r.sectorWhole !== null)) return null;
  return {
    words: p.words.slice(0, 300),
    sector: p.sector?.slice(0, 80) ?? null,
    rows: p.rows.slice(0, 8).map((r) => ({ label: r.label, company: r.company, peersMedian: r.peersMedian, peersN: r.peersN, sectorWhole: r.sectorWhole, sectorN: r.sectorN })),
    peers: p.peers.slice(0, 8).map((x) => ({ symbol: x.symbol.slice(0, 12), name: x.name?.slice(0, 80) ?? null })),
    notes: p.notes.slice(0, 4).map((n) => n.slice(0, 200)),
  };
}

export const REPORT_STATUSES = ["waiting", "release", "complete", "failed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const earningsReportSchema = z.object({
  symbol: z.string().max(20),
  name: z.string().max(160).nullable(),
  kind: z.enum(SUBJECT_KINDS),
  /** The report date from the calendar, New York. */
  date: isoDay,
  time: z.enum(EARNINGS_TIMES),
  quarter: z.string().max(20).nullable(),
  /**
   * waiting: nothing filed yet; release: the results are out (8-K or 6-K)
   * and the figures wait for the 10-Q or 10-K; complete: the figures are in;
   * failed: a sentence, and nothing more is tried.
   */
  status: z.enum(REPORT_STATUSES),
  headline: z.string().max(400),
  sentence: z.string().max(400).nullable(),
  release: filingRefSchema.nullable(),
  filing: filingRefSchema.nullable(),
  /** The quarter the figures are for ("2026Q3") and against which quarter. */
  period: z.string().max(40).nullable(),
  currency: z.string().max(8).nullable(),
  figures: z.array(figureLineSchema).max(10),
  /** Where the figures came from: the filing's XBRL facts, or the release itself read and checked against its text; null with none. */
  figuresFrom: z.enum(["filing", "release"]).nullable().default(null),
  /** The quarter's figures as the release printed them, checked against its text (lib/earnings.ts checkReleaseRead); the filing's facts replace them in `figures` once filed. */
  releaseFigures: releaseFiguresSchema.nullable().default(null),
  /** Why the release's figures are not there, when they are not. */
  releaseNote: z.string().max(300).nullable().default(null),
  /** Earlier quarters' releases, read the same way so a 6-K filer's series reaches QUARTERS_BACK quarters; each with the quarter it is for. */
  earlierReleases: z.array(z.object({ key: z.string().regex(/^\d{4}Q[1-4]$/), release: filingRefSchema, figures: releaseFiguresSchema })).max(12).default([]),
  /** 6-Ks in a results window that were read and were not results (a dividend, a buyback), by accession, so they are not fetched again. */
  earlierTried: z.array(z.string().max(25)).max(80).default([]),
  /** Where the earlier quarters stand: how many were read, what still waits; null when nothing was looked for. */
  earlierNote: z.string().max(300).nullable().default(null),
  /** The class the tests gave before the new figures (null when there was no reading) and now. */
  classBefore: z.string().max(80).nullable(),
  classNow: z.string().max(80).nullable(),
  /** Each class's count on the new figures: "7 of 7". */
  tests: z.array(z.object({ label: z.string().max(80), holds: z.boolean(), passes: z.number(), needed: z.number(), of: z.number() })).max(12),
  /** The methodology's rules on the new figures that fail or come near, with their sections. */
  rules: z.array(z.object({ text: z.string().max(300), section: z.string().max(40), status: z.enum(["fail", "near"]), actual: z.string().max(40).nullable(), limit: z.string().max(40) })).max(12),
  /** The person's own triggers and kill signals on the new figures. */
  triggers: z.array(z.object({ kind: z.enum(["trigger", "kill"]), label: z.string().max(200), met: z.boolean().nullable(), /** Today's reading of the field the signal watches, as words; null when nothing read it. */ reading: z.string().max(40).nullable().default(null) })).max(12),
  valuation: z.object({ low: z.number().nullable(), base: z.number(), high: z.number().nullable(), price: z.number().nullable(), basis: z.string().max(80).nullable().default(null), asOf: z.string().nullable().default(null) }).nullable(),
  weight: z.number().nullable(),
  commentary: commentarySchema.nullable(),
  /** Why the commentary is not there, when it is not. */
  commentaryNote: z.string().max(300).nullable(),
  /** How the stock reacted and why; null until the first session after the results has closed. */
  reaction: reactionSchema.nullable().default(null),
  /** The analysts' consensus EPS for the quarter from Nasdaq's calendar, in US dollars, and how many estimates; the analysts', never a verdict. */
  consensusEps: z.number().nullable().default(null),
  estimates: z.number().int().nullable().default(null),
  /** The results call (lib/earnings-call.ts): what was guided, what the analysts asked, the prepared remarks; from the person's own Claude's notes or read on their model. Null until read. */
  call: reportCallSchema.nullable().default(null),
  /** The move the options priced before the results (lib/expected-move.ts), copied from the file's readings; null when none was read. */
  expectedMove: expectedMoveSchema.nullable().default(null),
  builtAt: z.string(),
  updatedAt: z.string(),
  /** When the SEC was last asked for this report's filings; null in a report kept before it was added. */
  checkedAt: z.string().nullable().default(null),
  /** The deck kept as Google Slides in the person's vault, for the Earnings screen to embed; `at` is when, so a report updated after it is kept again. */
  deck: keptDeckSchema.nullable().default(null),
  /** The reaction deck kept before the one earnings deck (4 Nov 2026); no longer made or shown. */
  reactionDeck: keptDeckSchema.nullable().default(null),
  /** What the deep-dive deck draws (lib/earnings-deck.ts); null in a report kept before it was added. */
  detail: detailSchema.nullable().default(null),
  /**
   * The earnings report as a document (lib/earnings-doc.ts), once it is whole
   * and the reviewer has read it (lib/doc-review.ts): when, the fingerprint of
   * its words, whether it is ready to send, the lines the reviewer took out,
   * and what holds it. Drawn from the kept report on request, never stored.
   */
  doc: reportDocStateSchema.nullable().default(null),
});
export type EarningsReport = z.infer<typeof earningsReportSchema>;

/** Reports kept, newest first. */
export const KEEP_REPORTS = 60;
/** Days after a report date the 10-Q is waited for; a filer that takes longer is said to. */
export const FILING_WAIT_DAYS = 50;

/** Minutes after midnight in New York from which a report of that day is looked for: before the open, from 07:00; after the close, from 16:30. */
export const PRE_FROM = 7 * 60;
export const POST_FROM = 16 * 60 + 30;
/** Days ahead the followed companies' results dates are kept on the file, for the results watch. */
export const UPCOMING_DAYS = 14;
export const MAX_UPCOMING = 80;
/** The most companies a person's results watch polls the SEC for, where no calendar is read. */
export const MAX_FOLLOWED = 80;
/** A followed company's results date, kept so the results watch can tell from one file whether anything is due (Hamza, 4 Nov 2026). */
export const upcomingResultSchema = z.object({ symbol: z.string().min(1).max(20), date: isoDay, time: z.enum(EARNINGS_TIMES) });
export type UpcomingResult = z.infer<typeof upcomingResultSchema>;

export const earningsFileSchema = z.object({
  version: z.literal(1),
  reports: z.array(earningsReportSchema).max(KEEP_REPORTS),
  /** The moves the options priced before each report, read in the days before it (lib/expected-move.ts). */
  expected: z.array(expectedMoveSchema).max(MAX_EXPECTED).default([]),
  /** The followed companies' results from yesterday to UPCOMING_DAYS ahead, as the last read found them. */
  upcoming: z.array(upcomingResultSchema).max(MAX_UPCOMING).default([]),
  /** The followed symbols, kept where no calendar is read (SOURCES=licensed), so the results watch can poll the SEC for them. */
  followed: z.array(z.string().min(1).max(20)).max(MAX_FOLLOWED).optional(),
  updated: z.string(),
});
export type EarningsFile = z.infer<typeof earningsFileSchema>;
export const EMPTY_EARNINGS: EarningsFile = { version: 1, reports: [], expected: [], upcoming: [], updated: "" };

/** The followed entries from the day before `today` to UPCOMING_DAYS ahead, soonest first: what the results watch reads. */
export function upcomingOf(entries: readonly Pick<EarningsEntry, "symbol" | "date" | "time">[], today: string): UpcomingResult[] {
  return entries
    .filter((e) => (e.date >= today ? daysBetween(today, e.date) <= UPCOMING_DAYS : daysBetween(e.date, today) <= 1))
    .map((e) => ({ symbol: e.symbol, date: e.date, time: e.time }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_UPCOMING);
}

/**
 * Whether the results watch should read this person's results now: a
 * followed company reported today and its hour has come (before the open
 * from PRE_FROM, after the close from POST_FROM, New York), or reported
 * yesterday, and no release has been read for it yet. One file decides it,
 * so a quarter-hourly watch costs one read when nothing is due.
 */
export function resultsWatchDue(file: EarningsFile | null, ny: { date: string; minutes: number }): boolean {
  if (!file?.upcoming.length) return false;
  const kept = new Map(file.reports.map((r) => [reportKey(r), r]));
  return file.upcoming.some((u) => {
    const out = u.date === ny.date ? ny.minutes >= (u.time === "post" ? POST_FROM : PRE_FROM) : u.date < ny.date && daysBetween(u.date, ny.date) <= 1;
    if (!out) return false;
    const r = kept.get(reportKey(u));
    return !r || r.status === "waiting";
  });
}

/**
 * Where no calendar may be read (SOURCES=licensed, Hamza, 9 Nov 2026:
 * "Lawful only"), the calendar is the results the companies have filed: each
 * 8-K with item 2.02 on its SEC submissions (lib/reaction-history.ts
 * releaseDays), dated by its acceptance on New York's clock. No date ahead
 * is known, so there is no alert the day before; a report is read as soon
 * as the filing is out.
 */
export function secCalendar(found: readonly { symbol: string; days: readonly { date: string; time: "pre" | "post" }[] }[], from: string, to: string, problems: readonly string[], readAt: string): EarningsCalendar {
  const rows: EarningsRow[] = [];
  for (const f of found) for (const d of f.days) if (d.date >= from && d.date <= to) rows.push({ symbol: f.symbol, name: null, date: d.date, time: d.time, quarter: null, epsForecast: null, estimates: null, lastYearEps: null });
  return { from, to, rows, missed: [], publishedTo: null, problems: problems.slice(0, 10).map((p) => p.slice(0, 300)), readAt };
}

/**
 * Whether the results watch should read now where no calendar is read: a
 * followed company filed its results today or yesterday (New York) and no
 * release has been read for it. `found` is each followed symbol's releases
 * as the SEC lists them.
 */
export function secResultsDue(file: EarningsFile | null, found: readonly { symbol: string; days: readonly { date: string }[] }[], nyDate: string): boolean {
  const kept = new Map((file?.reports ?? []).map((r) => [reportKey(r), r]));
  return found.some((f) =>
    f.days.some((d) => {
      if (d.date > nyDate || daysBetween(d.date, nyDate) > 1) return false;
      const r = kept.get(reportKey({ symbol: f.symbol, date: d.date }));
      return !r || r.status === "waiting";
    }),
  );
}

export const reportKey = (r: Pick<EarningsReport, "symbol" | "date">) => `${symbolKey(r.symbol)}:${r.date}`;

/** The file with one report put in its place, newest report date first. */
export function keepReport(file: EarningsFile | null, report: EarningsReport, now: string): EarningsFile {
  const rest = (file?.reports ?? []).filter((r) => reportKey(r) !== reportKey(report));
  return { version: 1, reports: [report, ...rest].sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol)).slice(0, KEEP_REPORTS), expected: file?.expected ?? [], upcoming: file?.upcoming ?? [], updated: now };
}

/**
 * Whether a report read again says what the kept one said: the same stage,
 * the same filings, the same headline and figures, and the same class and
 * rules. Such a report keeps the kept one's date and deck, so a release read
 * every day until its filing lands is not remade every day.
 */
export function sameReport(a: EarningsReport, b: EarningsReport): boolean {
  // Each read the way the file keeps it, keys in one order: a report just built and the one read back from the vault differ in neither.
  const kept = (r: EarningsReport) => earningsReportSchema.safeParse(r).data ?? r;
  const key = (raw: EarningsReport) => {
    const r = kept(raw);
    return sortedJson([r.status, r.release?.url ?? null, r.filing?.url ?? null, r.headline, r.figures, r.classNow, r.tests, r.rules, r.triggers, r.weight, r.detail?.criteria ?? null, r.detail?.checks ?? null, r.detail?.position ?? null, r.detail?.quarters ?? null, r.commentary ?? null]);
  };
  return key(a) === key(b);
}

/** JSON with every object's keys in alphabetical order, undefined left out. */
function sortedJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${sortedJson(o[k])}`)
    .join(",")}}`;
}

/** Whether a report should be read again: not yet complete, not failed, and within the wait for the filing. */
export function reportDue(r: EarningsReport | null, today: string, now?: string): boolean {
  return !r || contentDue(r, today, now) || reactionDue(r, today);
}

/**
 * Hours between two reads of a report that has its release and waits for
 * the quarterly filing, which takes weeks: opening the app reads it again no
 * sooner, so neither the SEC nor the decks are asked every few minutes.
 */
export const RELEASE_RECHECK_HOURS = 6;

/**
 * Whether the filings are owed a read: a report not complete within
 * FILING_WAIT_DAYS, or one kept before its detail. A release read in the last
 * RELEASE_RECHECK_HOURS waits (given `now`); a report still waiting on its
 * release never does.
 */
export function contentDue(r: EarningsReport, today: string, now?: string): boolean {
  if (r.status === "complete") return !r.detail;
  if (r.status === "failed") return false;
  if (r.status === "release" && now && r.checkedAt && Date.parse(now) - Date.parse(r.checkedAt) < RELEASE_RECHECK_HOURS * 3_600_000) return false;
  return daysBetween(r.date, today) <= FILING_WAIT_DAYS;
}

/**
 * The entries whose results should be out: reported on or before today (an
 * after-the-close report on today counts once the evening run reads it).
 */
export function reported(entries: readonly EarningsEntry[], today: string): EarningsEntry[] {
  return entries.filter((e) => e.date <= today && daysBetween(e.date, today) <= FILING_WAIT_DAYS);
}

// ---------------------------------------------------------------------------
// What the company filed around its report date

const submissionsSchema = z
  .object({
    filings: z.object({ recent: z.object({ accessionNumber: z.array(z.string()), form: z.array(z.string()), filingDate: z.array(z.string()), reportDate: z.array(z.string()).optional(), primaryDocument: z.array(z.string()).optional(), items: z.array(z.string()).optional(), acceptanceDateTime: z.array(z.string()).optional() }).loose() }).loose(),
  })
  .loose();

export const PERIODIC_FORMS = ["10-Q", "10-K", "20-F", "40-F"] as const;

export type FiledAround = {
  /** The results release: an 8-K with item 2.02 (else any 8-K) or a 6-K, filed from the day before the report date to three days after. */
  release: FilingRef | null;
  /** The quarterly or annual report filed from the day before the report date to FILING_WAIT_DAYS after. */
  filing: FilingRef | null;
  /** A filer of 20-F or 40-F with no 10-Q: its quarters come on 6-K without XBRL figures. */
  foreign: boolean;
  /** Every 6-K in the release's window, earliest first: a foreign filer files buybacks and dividends on 6-K too, so the run tests each as results before taking it (Hamza, 5 Nov 2026: NVO's report was read from a buyback). */
  sixKs?: FilingRef[];
};

/** The address of a filing's document, from lib/edgar.ts, which alone names the SEC's hosts. */
export type FilingLink = (cik: number, accession: string, doc: string | undefined) => string;

/** Reads a company's SEC submissions for what it filed around a report date; throws when the document is not that. */
export function filingsAround(json: unknown, cik: number, date: string, archive: FilingLink): FiledAround {
  const r = submissionsSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document with recent filings");
  const f = r.data.filings.recent;
  const from = addDays(date, -1);
  let release: (FilingRef & { item202: boolean }) | null = null;
  let filing: FilingRef | null = null;
  let tenQ = false;
  let annualForeign = false;
  const sixKs: FilingRef[] = [];
  for (let i = 0; i < f.form.length; i++) {
    const form = f.form[i];
    const filed = f.filingDate[i];
    if (form === "10-Q") tenQ = true;
    if (form === "20-F" || form === "40-F") annualForeign = true;
    if (!filed || filed < from) continue;
    const ref = { form, filed, url: archive(cik, f.accessionNumber[i], f.primaryDocument?.[i] || undefined), period: f.reportDate?.[i] && /^\d{4}-\d{2}-\d{2}$/.test(f.reportDate[i]) ? f.reportDate[i] : null, accession: f.accessionNumber[i]?.slice(0, 25) ?? null, accepted: f.acceptanceDateTime?.[i] && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(f.acceptanceDateTime[i]) ? f.acceptanceDateTime[i].slice(0, 30) : null };
    if ((form === "8-K" || form === "6-K") && filed <= addDays(date, 3)) {
      if (form === "6-K") sixKs.push(ref);
      const item202 = form === "6-K" || (f.items?.[i] ?? "").split(",").map((x) => x.trim()).includes("2.02");
      // The earliest release after the date, an 8-K that carries results (item 2.02) before one that does not.
      if (!release || (item202 && !release.item202) || (item202 === release.item202 && filed < release.filed)) release = { ...ref, item202 };
    }
    if ((PERIODIC_FORMS as readonly string[]).includes(form) && filed <= addDays(date, FILING_WAIT_DAYS) && (!filing || filed < filing.filed)) filing = ref;
  }
  const rel = release ? { form: release.form, filed: release.filed, url: release.url, period: release.period, accession: release.accession, accepted: release.accepted } : null;
  sixKs.sort((a, b) => a.filed.localeCompare(b.filed) || (a.accepted ?? "").localeCompare(b.accepted ?? ""));
  return { release: rel, filing, foreign: annualForeign && !tenQ, sixKs };
}

// ---------------------------------------------------------------------------
// The figures of the quarter, from the filing

const money = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}bn` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}m` : a.toFixed(0);
  return `${v < 0 ? "-" : ""}${s}`;
};
const pctText = (v: number) => `${v.toFixed(1)}%`;
const change = (now: number, before: number | undefined) => (before !== undefined && before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

/** A figure as the report writes it ("16.0m", "-6.5m", "1.20bn", "35.4%", "0.37") read back to a number, and whether it is a share in percent. */
function figureValue(t: string | null): { v: number; pct: boolean; scaled: boolean } | null {
  const m = t?.trim().replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)(bn|m|%)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return { v: m[2] === "bn" ? n * 1e9 : m[2] === "m" ? n * 1e6 : n, pct: m[2] === "%", scaled: m[2] === "bn" || m[2] === "m" };
}

/**
 * A figure line's change on a year (Hamza, 5 Nov 2026: no row without one
 * when a year before is known): in percent on a positive base, in points for
 * a margin, else, over a loss a year before, in the figure's own units, since
 * a percent of a loss means nothing. `up` is whether it rose; null when
 * nothing can be set against it.
 */
export function figureChange(f: Pick<FigureLine, "now" | "before" | "changePct">): { text: string; up: boolean | null } | null {
  const up = (d: number) => (d === 0 ? null : d > 0);
  if (f.changePct !== null) return { text: `${f.changePct >= 0 ? "+" : ""}${f.changePct.toFixed(1)}%`, up: up(f.changePct) };
  const a = figureValue(f.now);
  const b = figureValue(f.before);
  if (!a || !b || a.pct !== b.pct) return null;
  const d = a.v - b.v;
  const sign = d >= 0 ? "+" : "-";
  if (a.pct) return { text: `${sign}${Math.abs(d).toFixed(1)} pts`, up: up(Math.round(d * 10)) };
  return { text: `${sign}${a.scaled || b.scaled ? money(Math.abs(d)) : Math.abs(d).toFixed(2)}`, up: up(d) };
}

/** The quarter's lines against the same quarter a year before: revenue, margins, earnings, cash. Empty when the filer reports no quarters. */
export function quarterFigures(t: FactsTable): { period: string | null; lines: FigureLine[] } {
  const q = t.latestQuarter;
  if (!q) return { period: null, lines: [] };
  const ago = `${Number(q.slice(0, 4)) - 1}${q.slice(4)}`;
  const Q = t.quarterly;
  const lines: FigureLine[] = [];
  const flow = (label: string, k: keyof typeof Q, perShare = false) => {
    const now = Q[k][q];
    if (now === undefined) return;
    const before = Q[k][ago];
    const fmt = (v: number) => (perShare ? v.toFixed(2) : money(v));
    lines.push({ label, now: fmt(now), before: before === undefined ? null : fmt(before), changePct: change(now, before), prior: null });
  };
  const margin = (label: string, k: keyof typeof Q) => {
    const rev = Q.revenue[q];
    const v = Q[k][q];
    if (rev === undefined || v === undefined || rev <= 0) return;
    const r0 = Q.revenue[ago];
    const v0 = Q[k][ago];
    lines.push({ label, now: pctText((v / rev) * 100), before: r0 !== undefined && v0 !== undefined && r0 > 0 ? pctText((v0 / r0) * 100) : null, changePct: null, prior: null });
  };
  flow("Revenue", "revenue");
  margin("Gross margin", "grossProfit");
  flow("Operating income", "operatingIncome");
  margin("Operating margin", "operatingIncome");
  flow("Net income", "netIncome");
  flow("EPS, diluted", "epsDiluted", true);
  const cfo = Q.cfo[q];
  const capex = Q.capex[q];
  if (cfo !== undefined && capex !== undefined) {
    const before = Q.cfo[ago] !== undefined && Q.capex[ago] !== undefined ? Q.cfo[ago] - Math.abs(Q.capex[ago]) : undefined;
    const now = cfo - Math.abs(capex);
    lines.push({ label: "Free cash flow", now: money(now), before: before === undefined ? null : money(before), changePct: change(now, before), prior: null });
  }
  return { period: `${q} against ${ago}`, lines };
}

// ---------------------------------------------------------------------------
// The headline, written by the app

export type ReportParts = {
  symbol: string;
  kind: SubjectKind;
  status: ReportStatus;
  classBefore: string | null;
  classNow: string | null;
  testsOfClass: { passes: number; of: number } | null;
  killsMet: number;
  kills: number;
  triggersMet: number;
  rulesFailing: number;
  releaseForm: string | null;
  sentence: string | null;
  /** Where the quarter's figures came from, when there are any. */
  figuresFrom?: "filing" | "release" | null;
  /** Whether the methodology's tests were run (on the quarter's figures, or on the last filed ones before the filing). */
  tested: boolean;
};

/**
 * HCMP's first line: kill signals, the class, whether a decision is owed; or,
 * before the figures, what has been filed and what is waited for.
 */
export function reportHeadline(p: ReportParts): string {
  if (p.status === "failed") return `${p.symbol}: the results could not be read. ${p.sentence ?? ""}`.trim();
  if (p.status === "waiting") return `${p.symbol}: nothing filed with the SEC yet; the report follows the filing.`;
  const kill = p.kills ? (p.killsMet ? `${p.killsMet} kill signal${p.killsMet === 1 ? "" : "s"} met` : "No kill signal met") : "No kill signal on file";
  if (p.status === "release" && !p.tested) return `${p.symbol} reported on ${p.releaseForm ?? "8-K"}; ${p.figuresFrom === "release" ? "the quarter's figures are the release's own, checked against its text; " : ""}${kill.charAt(0).toLowerCase()}${kill.slice(1)} on the last figures. The class is re-tested when the ${p.releaseForm === "6-K" ? "annual 20-F" : "10-Q"} lands.`;
  const count = p.testsOfClass ? ` (${p.testsOfClass.passes} of ${p.testsOfClass.of})` : "";
  const cls =
    p.classNow === null
      ? p.classBefore
        ? `${p.symbol} leaves ${p.classBefore}: no class places it now`
        : `no class places ${p.symbol}`
      : p.kind !== "holding" || p.classBefore === null
        ? `${p.symbol} tests as ${article(p.classNow)}${count}`
        : p.classBefore === p.classNow
          ? `${p.symbol} stays ${article(p.classNow)}${count}`
          : `${p.symbol} moves from ${p.classBefore} to ${p.classNow}${count}`;
  const owed = p.kind !== "holding" ? "not held, so nothing is owed" : p.killsMet || p.rulesFailing || (p.classBefore !== null && p.classBefore !== p.classNow) ? "a decision is owed" : p.triggersMet ? "a trigger to look at; no decision owed" : "no decision owed";
  // Before the quarterly filing the tests read the last figures filed, and say so (Hamza, 16 Oct 2026).
  const waited = p.releaseForm === "6-K" ? "20-F" : "10-Q";
  if (p.status === "release") return `${kill}; ${cls}; ${owed}. Reported on ${p.releaseForm ?? "8-K"}; ${p.figuresFrom === "release" ? `the quarter's figures are the release's own, checked against its text; the tests read the last filing until the ${waited} lands` : `the quarter's own figures wait for the ${waited}, and these read the last filing`}.`;
  return `${kill}; ${cls}; ${owed}.`;
}

const article = (label: string) => `${/^[AEIOU]/i.test(label) ? "an" : "a"} ${label}`;

// ---------------------------------------------------------------------------
// Assembling a report

export type ReportInput = {
  entry: EarningsEntry;
  status: ReportStatus;
  sentence: string | null;
  release: FilingRef | null;
  filing: FilingRef | null;
  table: FactsTable | null;
  /** The methodology's verdict on the new figures (null with no methodology or no figures). */
  verdict: CompanyVerdict | null;
  classBefore: string | null;
  record: HoldingRecord | null;
  /** The new figures' readings for the record's triggers, by field; the price under "price". */
  readings: Record<string, number | null>;
  price: number | null;
  weight: number | null;
  prev: EarningsReport | null;
  now: string;
  /** The detail behind the deck, when the figures are in. */
  detail: EarningsDetail | null;
  /** The quarter's figures from the release itself, checked, when the filing has none yet; and why not, when they are not there. */
  releaseFigures?: ReleaseFigures | null;
  releaseNote?: string | null;
  /** Earlier quarters' releases read for a 6-K filer, the 6-Ks found not to be results, and where that stands. */
  earlierReleases?: EarningsReport["earlierReleases"];
  earlierTried?: string[];
  earlierNote?: string | null;
};

/** The report from what was read: the app's own words and figures; the commentary is laid on after, by the run. */
export function buildReport(i: ReportInput): EarningsReport {
  const q = i.table && i.status === "complete" ? quarterFigures(i.table) : { period: null, lines: [] };
  // The filing's facts when they carry the quarter; else the release's own figures, each found printed in its text.
  const fromRelease = !q.lines.length && i.releaseFigures ? releaseLines(i.releaseFigures) : [];
  const figures = q.lines.length ? q.lines : fromRelease;
  const figuresFrom = q.lines.length ? ("filing" as const) : fromRelease.length ? ("release" as const) : null;
  const v = i.verdict;
  const own = v?.classId ? v.classTests.find((t) => t.classId === v.classId) : null;
  const triggers = (i.record?.triggers ?? []).map((t) => {
    const r = i.readings[t.field];
    const met = r === null || r === undefined ? null : t.is === "lte" ? r <= t.value : r >= t.value;
    const reading = r === null || r === undefined ? null : `${Math.round(r * 100) / 100}`.slice(0, 40);
    return { kind: t.kind, label: `${t.note ? `${t.note}: ` : ""}${t.field === "price" ? "price" : t.field.replace(/_/g, " ")} ${t.is === "lte" ? "at or below" : "at or above"} ${t.value}`.slice(0, 200), met, reading };
  });
  const rules = (v?.checks ?? [])
    .filter((c) => c.status === "fail" || c.status === "near")
    .slice(0, 12)
    .map((c) => ({ text: c.rule.text.slice(0, 300), section: c.rule.section.slice(0, 40), status: c.status as "fail" | "near", actual: c.actual, limit: c.limit }));
  const parts: ReportParts = {
    symbol: i.entry.symbol,
    kind: i.entry.kind,
    status: i.status,
    classBefore: i.classBefore,
    classNow: v?.classLabel ?? null,
    testsOfClass: own ? { passes: own.passes, of: own.criteria.length } : null,
    killsMet: triggers.filter((t) => t.kind === "kill" && t.met).length,
    kills: triggers.filter((t) => t.kind === "kill").length,
    triggersMet: triggers.filter((t) => t.kind === "trigger" && t.met).length,
    rulesFailing: rules.filter((r) => r.status === "fail").length,
    releaseForm: i.release?.form ?? null,
    sentence: i.sentence,
    figuresFrom,
    tested: !!v,
  };
  const ov = i.record?.ownValuation;
  return {
    symbol: i.entry.symbol,
    name: i.entry.subjectName ?? i.entry.name,
    kind: i.entry.kind,
    date: i.entry.date,
    time: i.entry.time,
    quarter: i.entry.quarter,
    status: i.status,
    headline: reportHeadline(parts).slice(0, 400),
    sentence: i.sentence,
    release: i.release,
    filing: i.filing,
    period: figuresFrom === "filing" ? q.period : figuresFrom === "release" ? `${i.releaseFigures!.period}, from the release` : null,
    currency: figuresFrom === "release" ? i.releaseFigures!.currency : (i.table?.currency ?? null),
    figures,
    figuresFrom,
    releaseFigures: i.releaseFigures ?? null,
    releaseNote: i.releaseNote ?? null,
    earlierReleases: i.earlierReleases ?? [],
    earlierTried: i.earlierTried ?? [],
    earlierNote: i.earlierNote ?? null,
    classBefore: i.classBefore,
    // The class, the tests and the rules stand whenever the methodology was run: on the quarter's figures once filed, on the last filed figures before that.
    classNow: v?.classLabel ?? null,
    tests: (v?.classTests ?? []).map((t) => ({ label: t.label, holds: t.holds, passes: t.passes, needed: t.needed, of: t.criteria.length })).slice(0, 12),
    rules,
    triggers,
    valuation: ov ? { low: ov.low ?? null, base: ov.base, high: ov.high ?? null, price: i.price, basis: ov.basis ?? null, asOf: ov.asOf ?? null } : null,
    weight: i.weight,
    commentary: i.prev?.commentary ?? null,
    commentaryNote: i.prev?.commentaryNote ?? null,
    reaction: i.prev?.reaction ?? null,
    call: i.prev?.call ?? null,
    consensusEps: i.entry.epsForecast ?? i.prev?.consensusEps ?? null,
    estimates: i.entry.estimates ?? i.prev?.estimates ?? null,
    expectedMove: i.prev?.expectedMove ?? null,
    builtAt: i.prev?.builtAt ?? i.now,
    updatedAt: i.now,
    checkedAt: i.now,
    deck: null,
    reactionDeck: null,
    detail: i.detail,
    doc: i.prev?.doc ?? null,
  };
}

/** The reports on screen and in alerts: the latest per company, newest date first. */
export function latestReports(file: EarningsFile | null): EarningsReport[] {
  return (file?.reports ?? []).slice().sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
}

export const REPORT_PREFIX = "earnings-report:";
/** Days a report's alert stays open after it was written. */
const REPORT_ALERT_DAYS = 7;
/** Results from this day on announce their deck by itself; earlier ones had theirs in the results email. */
const DECK_MAIL_FROM = "2026-11-04";

/**
 * A report as an alert: once when the results are out, again when the
 * figures are in. Red when a kill signal is met, amber when a decision is
 * owed, else information. It clears a week after it was written.
 */
export function reportNotices(file: EarningsFile | null, today: string): Notice[] {
  const out: Notice[] = [];
  for (const r of file?.reports ?? []) {
    if (r.status !== "release" && r.status !== "complete") continue;
    const day = r.updatedAt.slice(0, 10);
    const recent = daysBetween(day, today) <= REPORT_ALERT_DAYS;
    const stage = r.status === "complete" ? "figures" : "release";
    const killed = r.triggers.some((t) => t.kind === "kill" && t.met);
    const owed = /decision is owed/.test(r.headline);
    const fig = r.figures.find((f) => f.label === "Revenue");
    const detail = [fig ? `Revenue ${fig.now}${r.currency ? ` ${r.currency}` : ""}${fig.changePct !== null ? `, ${fig.changePct >= 0 ? "+" : ""}${fig.changePct.toFixed(1)}% on a year` : ""}.` : null, r.commentary?.summary ?? null, (r.filing ?? r.release) ? `${(r.filing ?? r.release)!.form} filed ${longDate((r.filing ?? r.release)!.filed)}.` : null]
      .filter(Boolean)
      .join(" ");
    const title = `${r.symbol}${r.quarter ? ` ${quarterWords(r.quarter) ?? r.quarter.replace("/", " ")}` : ""} results: ${r.headline}`.slice(0, 300);
    const tone = killed ? "danger" : owed ? "warn" : "info";
    // The report once whole and read through, as the one alert that is emailed (Hamza, 4 Nov 2026: one email per report, when complete).
    // It takes the stage's place on Notifications (Hamza, 6 Nov 2026: "why is there two notifications of the same event").
    const docDay = r.doc?.ready ? r.doc.at.slice(0, 10) : null;
    if (docDay && r.date >= DECK_MAIL_FROM && daysBetween(docDay, today) <= REPORT_ALERT_DAYS) {
      out.push({
        key: `${REPORT_PREFIX}${reportKey(r)}:deck`,
        date: docDay > today ? today : docDay,
        tone,
        title,
        detail: sentenceCut(`The earnings report is ready. ${detail}`, 500),
        href: `/earnings?deck=${encodeURIComponent(r.symbol)}#decks`,
      });
      continue;
    }
    if (!recent) continue;
    out.push({
      key: `${REPORT_PREFIX}${reportKey(r)}:${stage}`,
      date: day > today ? today : day,
      tone,
      title,
      detail: detail.slice(0, 500) || "The report is on the Earnings screen.",
      href: `/earnings?report=${encodeURIComponent(reportKey(r))}#report`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The commentary, on the person's Claude

export const EARNINGS_MODEL = MODELS.standard;
/** The commentary and why the shares moved: Haiku first since the beta (Hamza, 9 Nov 2026), Sonnet when the check refuses the reading. */
export const COMMENTARY_MODEL = MODELS.fast;
export const EARNINGS_MAX_SEARCHES = 4;

/** What the model is given: the company, the date, the filings and the app's own figures, so it never states another. */
export function reportFacts(r: EarningsReport): string {
  const lines = [
    `Company: ${r.name ?? r.symbol} (${r.symbol}).`,
    `Results reported ${r.date}${r.time !== "unknown" ? `, ${TIME_LABEL[r.time].toLowerCase()} New York time` : ""}${r.quarter ? `, for the fiscal quarter ending ${r.quarter}` : ""}.`,
    r.release ? `Results release: ${r.release.form} filed ${r.release.filed}, ${r.release.url}` : null,
    r.filing ? `Quarterly filing: ${r.filing.form} filed ${r.filing.filed}, ${r.filing.url}` : null,
    r.figures.length ? `The app's figures from the filing (${r.period}, ${r.currency ?? "reporting currency"}):\n${r.figures.map((f) => `- ${f.label}: ${f.now}${f.before ? ` against ${f.before}` : ""}${f.changePct !== null ? ` (${f.changePct >= 0 ? "+" : ""}${f.changePct.toFixed(1)}%)` : ""}`).join("\n")}` : "The quarter's figures are not in the SEC's data yet.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function commentaryRequestBody(r: EarningsReport, model = COMMENTARY_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelCommentarySchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 5000,
    system: `You read one company's quarterly results for a person's portfolio app, by searching the web: the company's own release and investor materials first, then the call as reported that day, then whatever shows why the company did what it did. At most ${EARNINGS_MAX_SEARCHES + INVESTIGATE_SEARCHES} searches.

Rules:
- The app's figures from the filing are given below. Use them; never state another figure for a line they give.
- summary: three sentences at most, in plain words, on what the quarter showed and what the company said about it.
- guidance: what the company guided for the next quarter or the year, with its own figures, as the release or the call states it; null when it gave none.
- points: up to six things a holder would want to know (a segment's growth, orders or backlog, margins, a buyback, a change in outlook, management's own words), each one line with the page it came from, its real https URL and title.
- unexpected: up to ${MAX_UNEXPECTED} things the company did or announced that investors did not expect, the most consequential first: what it did in one line, and why it did it in two or three sentences, with the pages that show it. None when nothing surprised; never a surprise the pages do not call one.
${INVESTIGATIVE}
- Nothing from before the report date unless that day's pages tie it to the results, except what explains why the company did something unexpected (an executive's record, a hire, what it said in earlier quarters). No opinion, no advice, no recommendation, no exclamation marks.
- Your whole answer is one call to record_results; write nothing outside it.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: EARNINGS_MAX_SEARCHES + INVESTIGATE_SEARCHES },
      { name: "record_results", description: "Record the reading of the results.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${reportFacts(r)}\n\nRead these results.` }] }],
  };
}

export type CommentaryParse = { ok: true; commentary: Commentary } | { ok: false; reason: string };

export function parseCommentaryResponse(body: unknown): CommentaryParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_results");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the reading" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  const summary = text(raw.summary, 700);
  if (!summary) return { ok: false, reason: cutShort(body) ? "the answer ran past its length before the summary" : "the answer held no summary" };
  const guidance = text(raw.guidance, 500);
  const unexpected = list(raw.unexpected)
    .map((u) => {
      const x = (u ?? {}) as Record<string, unknown>;
      const what = text(x.what, 300);
      const why = text(x.why, 700);
      const sources = list(x.sources).map(source).filter((s): s is Source => !!s).slice(0, 4);
      return what && why && sources.length ? { what, why, sources } : null;
    })
    .filter((u): u is NonNullable<typeof u> => !!u)
    .slice(0, MAX_UNEXPECTED);
  return { ok: true, commentary: { summary, guidance: guidance || null, points: pointsOf(raw.points, 6), unexpected } };
}

/*
 * The model's answer read item by item (Hamza, 27 Oct 2026: a commentary one
 * character over a limit was thrown away whole, "did not fit"): a text over
 * its length is cut at a sentence, a list sent as JSON text is read as a list,
 * a point or a page that does not hold is left out, never the whole reading.
 */
type Source = z.infer<typeof sourceSchema>;
function text(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return sentenceCut(t, max);
}
function list(v: unknown): unknown[] {
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
function source(v: unknown): Source | null {
  const x = (v ?? {}) as Record<string, unknown>;
  const r = sourceSchema.safeParse({ title: text(x.title, 160) || (typeof x.url === "string" ? text(x.url, 160) : ""), url: typeof x.url === "string" ? x.url.trim() : x.url });
  return r.success ? r.data : null;
}
function pointsOf(v: unknown, max: number): { line: string; source: Source }[] {
  return list(v)
    .map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const line = text(x.line, 400);
      const s = source(x.source);
      return line && s ? { line, source: s } : null;
    })
    .filter((p): p is { line: string; source: Source } => !!p)
    .slice(0, max);
}
const cutShort = (body: unknown) => (body as { stop_reason?: string } | null)?.stop_reason === "max_tokens";

/** The item-by-item readers of a model's answer, for the other readings that keep the same shape (lib/macro-report.ts). */
export const modelReaders = { text, list, source, pointsOf, cutShort };

// ---------------------------------------------------------------------------
// The reaction: how the stock took the results, and why

/** Days after the results the reaction is looked for; a feed that never answers gives up after them. */
export const REACTION_DAYS = 7;
/** The benchmark the move is set beside. */
export const REACTION_BENCHMARK = "SPY";

/** Whether a report is owed its reaction: read, without one, within REACTION_DAYS of the results. */
export function reactionDue(r: EarningsReport, today: string): boolean {
  return r.status !== "failed" && !r.reaction && daysBetween(r.date, today) <= REACTION_DAYS;
}

type Close = { date: string; value: number };

/**
 * The move on the results: from the last close before they were out to the
 * close of the first session that traded on them. Before the open, that is
 * the report day itself; after the close, the next session; a time not given
 * spans both, from the close before the report day to the session after it.
 * `settled` is the last session whose close is final (the feed's last bar is
 * live while the market is open). Null until that session has closed.
 */
export function reactionMove(r: Pick<EarningsReport, "date" | "time">, closes: readonly Close[], bench: readonly Close[] | null, settled: string): Omit<Reaction, "why" | "points" | "note"> | null {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const after = r.time === "pre" ? (c: Close) => c.date >= r.date : (c: Close) => c.date > r.date;
  const before = r.time === "post" ? (c: Close) => c.date <= r.date : (c: Close) => c.date < r.date;
  const to = sorted.find(after);
  const from = [...sorted].reverse().find(before);
  if (!to || !from || to.date > settled || !(from.value > 0)) return null;
  const pct = (a: number, b: number) => Math.round(((b / a - 1) * 100) * 100) / 100;
  const at = (s: readonly Close[] | null, d: string) => s?.find((c) => c.date === d)?.value ?? null;
  const b0 = at(bench, from.date);
  const b1 = at(bench, to.date);
  return { session: to.date, from: { date: from.date, close: from.value }, to: { date: to.date, close: to.value }, movePct: pct(from.value, to.value), benchmark: bench ? REACTION_BENCHMARK : null, benchmarkPct: b0 && b1 ? pct(b0, b1) : null };
}

/** The move in a sentence: "Fell 7.2% to 612.30 on 16 Oct, the first session on the results; SPY +0.4% over the same sessions." */
export function reactionWords(x: Pick<Reaction, "session" | "from" | "to" | "movePct" | "benchmark" | "benchmarkPct">): string {
  const verb = x.movePct > 0.05 ? "Rose" : x.movePct < -0.05 ? "Fell" : "Held flat at";
  const size = Math.abs(x.movePct) > 0.05 ? ` ${Math.abs(x.movePct).toFixed(1)}% to` : "";
  const close = x.to.close.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const spans = x.from.date < x.session && daysBetween(x.from.date, x.session) > 4 ? ` from ${longDate(x.from.date)}` : "";
  const bench = x.benchmark && x.benchmarkPct !== null ? `; ${x.benchmark} ${x.benchmarkPct >= 0 ? "+" : ""}${x.benchmarkPct.toFixed(1)}% over the same sessions` : "";
  return `${verb}${size} ${close} on ${longDate(x.session)}, the first session on the results${spans}${bench}.`;
}

/** What waits, in a sentence, while the session that trades on the results has not closed. */
export function reactionWaits(r: Pick<EarningsReport, "date" | "time">): string {
  return r.time === "pre" ? `How the stock took the results is read after the close of ${longDate(r.date)}.` : `How the stock took the results is read after the close of the session after ${longDate(r.date)}.`;
}

export function reactionRequestBody(r: EarningsReport, move: Omit<Reaction, "why" | "points" | "note">, model = COMMENTARY_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelReactionSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 2000,
    system: `You explain, for a person's portfolio app, why a company's shares moved as they did on the session that traded on its quarterly results, by searching the web for that day's reporting: news coverage of the move, the call as reported, analysts quoted in the press. At most ${EARNINGS_MAX_SEARCHES} searches.

Rules:
- The app's move is given below. Use it; never state another move or price.
- why: two or three sentences in plain words on what investors reacted to, as that day's pages report it: the guidance against what was expected, management's own words (for example, a company declining to confirm next year's growth), a figure against expectations, orders, margins. Name the reason the pages give; when they disagree, say so.
- points: up to four lines a holder would want, each with the page it came from, its real https URL and title.
${INVESTIGATIVE}
- Pages from the results day or the session after, and older pages only where they explain why the company did what investors reacted to. No opinion, no advice, no recommendation, no exclamation marks.
- Your whole answer is one call to record_reaction; write nothing outside it.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: EARNINGS_MAX_SEARCHES },
      { name: "record_reaction", description: "Record why the shares moved on the results.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${reportFacts(r)}\nThe shares: ${reactionWords(move)} The close before the results was ${move.from.close} on ${move.from.date}.\n\nWhy did they move?` }] }],
  };
}

export type ReactionParse = { ok: true; why: string; points: Reaction["points"] } | { ok: false; reason: string };

export function parseReactionResponse(body: unknown): ReactionParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_reaction");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the reading" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  const why = text(raw.why, 700);
  if (!why) return { ok: false, reason: cutShort(body) ? "the answer ran past its length before the reason" : "the answer held no reason" };
  return { ok: true, why, points: pointsOf(raw.points, 4) };
}

// ---------------------------------------------------------------------------
// The demo

/** The demo's calendar keeps its days relative to today, so it always shows a season; its rows carry `offset` in weekdays instead of a date. */
export const demoEarningsSchema = z.object({
  rows: z.array(earningsRowSchema.omit({ date: true }).extend({ offset: z.number().int() })),
  reports: z.array(earningsReportSchema.omit({ date: true, builtAt: true, updatedAt: true }).extend({ offset: z.number().int() })),
  expected: z.array(expectedMoveSchema.omit({ date: true, readAt: true }).extend({ offset: z.number().int() })).default([]),
});

/** A weekday `n` weekdays from `today` (negative for before); today itself when it is a weekday and n is 0. */
export function weekdayFrom(today: string, n: number): string {
  let d = today;
  const step = n < 0 ? -1 : 1;
  const weekend = (x: string) => [0, 6].includes(new Date(`${x}T00:00:00Z`).getUTCDay());
  while (weekend(d)) d = addDays(d, step);
  for (let left = Math.abs(n); left > 0; ) {
    d = addDays(d, step);
    if (!weekend(d)) left--;
  }
  return d;
}

export function demoEarnings(raw: unknown, today: string): { calendar: EarningsCalendar; file: EarningsFile } {
  const d = demoEarningsSchema.parse(raw);
  const rows = d.rows.map(({ offset, ...r }) => ({ ...r, date: weekdayFrom(today, offset) }));
  const expected = d.expected.map(({ offset, ...x }) => {
    const date = weekdayFrom(today, offset);
    return { ...x, date, readAt: `${weekdayFrom(today, Math.min(offset, 0) - 1)}T19:00:00.000Z`, expiry: addDays(date, Math.max(0, (5 - new Date(`${date}T00:00:00Z`).getUTCDay() + 7) % 7)) };
  });
  const reports = d.reports.map(({ offset, ...r }) => {
    const date = weekdayFrom(today, offset);
    // Read the next morning; a report out today was read today, never tomorrow.
    const at = date < today ? `${addDays(date, 1)}T07:00:00.000Z` : `${today}T14:00:00.000Z`;
    // The sample's filings are dated on the report day, whatever date the file carries.
    const shift = (f: FilingRef | null) => (f ? { ...f, filed: date } : null);
    // A sample reaction to a report before the open is the report day's close against the weekday's before;
    // after the close, the next weekday's close against the report day's.
    const after = r.time === "post";
    const session = weekdayFrom(today, after ? offset + 1 : offset);
    const reaction = r.reaction ? { ...r.reaction, session, from: { ...r.reaction.from, date: after ? date : weekdayFrom(today, offset - 1) }, to: { ...r.reaction.to, date: session } } : null;
    return { ...r, date, release: shift(r.release), filing: shift(r.filing), reaction, expectedMove: r.expectedMove ?? expectedFor(expected, r.symbol, date), builtAt: at, updatedAt: at };
  });
  return {
    calendar: { from: addDays(today, -EARNINGS_BACK_DAYS), to: addDays(today, EARNINGS_AHEAD_DAYS), rows, missed: [], problems: [], readAt: `${today}T06:00:00.000Z` },
    file: { version: 1, reports, expected, upcoming: [], updated: `${today}T06:00:00.000Z` },
  };
}

// ---------------------------------------------------------------------------
// A study at every report (Hamza, 27 Oct 2026: "this should be done anyways at every post-earnings report")

/** Days after the results within which the earnings run queues a study of the company, so a report read late still gets one and an old one never does. */
export const RESULTS_STUDY_DAYS = 21;

/** A finished study as the report's detail keeps it: the sections written, a few hundred characters each, for the deck. */
export function studyOnReport(study: Study): NonNullable<EarningsDetail["study"]> {
  return { id: study.id, finishedAt: study.finishedAt ?? study.requestedAt, question: study.question.slice(0, 600), sections: study.sections.filter((x) => study.written[x.id]).slice(0, 30).map((x) => ({ id: x.id.slice(0, 40), title: x.title.slice(0, 80), text: study.written[x.id].slice(0, 900) })) };
}

const sameSymbol = (a: string | null, b: string) => !!a && symbolKey(a) === symbolKey(b);

/**
 * The report owed a study: the newest report per company with its results
 * read (release or complete), within RESULTS_STUDY_DAYS, with no study of the
 * company asked for since its results day, in any state, a holding before a
 * watched company. One at a time: none while a study queued for results is
 * still being written. Null when none is owed.
 */
export function resultsStudyDue(reports: readonly EarningsReport[], studies: readonly Study[], today: string): EarningsReport | null {
  if (studies.some((x) => x.forResults && (x.status === "queued" || x.status === "running"))) return null;
  const newest = new Map<string, EarningsReport>();
  for (const r of reports) {
    const k = symbolKey(r.symbol);
    if (!newest.has(k) || newest.get(k)!.date < r.date) newest.set(k, r);
  }
  return (
    [...newest.values()]
      .filter((r) => (r.status === "release" || r.status === "complete") && r.date <= today && daysBetween(r.date, today) <= RESULTS_STUDY_DAYS)
      .filter((r) => !studies.some((x) => sameSymbol(x.ticker, r.symbol) && (x.forResults === r.date || x.requestedAt.slice(0, 10) >= r.date)))
      .sort((a, b) => Number(b.kind === "holding") - Number(a.kind === "holding") || b.date.localeCompare(a.date))[0] ?? null
  );
}

/** The question a results study answers, in the person's own terms. */
export function resultsStudyQuestion(r: EarningsReport): string {
  return `The results of ${r.quarter ? r.quarter.replace("/", " ") : "the quarter"}, reported ${longDate(r.date)}: what they change for the business, its competition and moats, its valuation against its history and peers, and the thesis, the classes and the rules.`.slice(0, 600);
}

/**
 * Each company's newest report with the newest finished study of it laid on
 * its detail, when that study is newer than the one it carries; the report's
 * time moves on, so its decks are made again with the study's sections.
 */
export function withStudiesOnReports(file: EarningsFile, studies: readonly Study[], now: string): { file: EarningsFile; laid: number } {
  const done = studies.filter((x) => x.status === "done" && x.ticker).sort((a, b) => (b.finishedAt ?? b.requestedAt).localeCompare(a.finishedAt ?? a.requestedAt));
  const newest = new Map<string, string>();
  for (const r of file.reports) {
    const k = symbolKey(r.symbol);
    if (!newest.has(k) || newest.get(k)! < r.date) newest.set(k, r.date);
  }
  let laid = 0;
  const reports = file.reports.map((r) => {
    if (!r.detail || newest.get(symbolKey(r.symbol)) !== r.date) return r;
    const study = done.find((x) => sameSymbol(x.ticker, r.symbol));
    if (!study) return r;
    const at = study.finishedAt ?? study.requestedAt;
    if (r.detail.study && (r.detail.study.id === study.id || r.detail.study.finishedAt >= at)) return r;
    laid += 1;
    return { ...r, detail: { ...r.detail, study: studyOnReport(study) }, updatedAt: now };
  });
  return { file: laid ? { ...file, reports, updated: now } : file, laid };
}
