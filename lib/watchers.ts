import { z } from "zod";

import type { Book } from "@/lib/holdings";
import type { FilingsFile } from "@/lib/filings";
import { MARKET_SYMBOLS, marketDef } from "@/lib/markets";
import { FIELDS, FUNDAMENTAL_FIELDS } from "@/lib/ontology";
import type { Notice } from "@/lib/screens";
import { MODELS } from "@/lib/models";

/**
 * Watchers in the person's own words (Hamza, 23 Oct 2026, after Rallies.AI's
 * agents): "tell me when MA's operating margin falls below 50%" is compiled
 * once, on the AI, into a recipe the app tests itself: a
 * figure of one company, of every listed holding, or a market indicator, at
 * or beyond a level. The model only compiles; the reading, the verdict and
 * the alert are the app's, at every check, like a trigger on a record. A
 * request the recipes cannot express is said so, never approximated. Pure.
 */

export const MAX_WATCHERS = 12;
export const WATCHER_PREFIX = "watcher:";
export const WATCHER_MODEL = MODELS.fast;

/** A holding's share of the book, in percent, beside the price and the filings' fields. */
export const WEIGHT_FIELD = "weight_pct";
export const WATCHER_FIELDS = ["price", WEIGHT_FIELD, ...FUNDAMENTAL_FIELDS] as const;

const symbol = z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/);

export const watcherSchema = z.object({
  id: z.string().min(1).max(16),
  /** The person's own words, as typed. */
  words: z.string().min(3).max(300),
  /** One company by symbol, every listed holding, or a market indicator. */
  subject: z.discriminatedUnion("kind", [z.object({ kind: z.literal("company"), symbol }), z.object({ kind: z.literal("holdings") }), z.object({ kind: z.literal("market"), symbol: z.enum(MARKET_SYMBOLS) })]),
  /** The figure read: the price, the holding's weight or a fundamental field for a company; the indicator's level for a market. */
  field: z.string().min(1).max(40),
  is: z.enum(["gte", "lte"]),
  value: z.number().finite(),
  /** The recipe in the app's words, shown under the person's. */
  reads: z.string().max(200),
  at: z.string(),
});
export type Watcher = z.infer<typeof watcherSchema>;

/** What the model is asked to record. */
const compiledSchema = z.object({
  ok: z.boolean().describe("false when the request cannot be expressed as one figure at or beyond one level."),
  subject: z.enum(["company", "holdings", "market"]).optional(),
  symbol: z.string().max(12).optional().describe("subject company: the ticker; subject market: the indicator's symbol."),
  field: z.string().max(40).optional().describe("subject company or holdings: one of the fields listed. subject market: omit."),
  is: z.enum(["gte", "lte"]).optional().describe("gte: at or above the level; lte: at or below it."),
  value: z.number().optional().describe("The level, in the field's own unit: 50 for 50%, 4.5 for a 4.5% yield, 900 for a price of 900."),
  why: z.string().max(300).optional().describe("ok false: what the request asks that the recipes cannot read, in a sentence."),
});

const fieldLines = () =>
  WATCHER_FIELDS.map((f) => (f === "price" ? "- price: the last price, in the listing's currency" : f === WEIGHT_FIELD ? `- ${WEIGHT_FIELD}: the holding's share of the book, in percent` : `- ${f}: ${(FIELDS as Record<string, { label: string; description?: string }>)[f]?.label ?? f}`)).join("\n");

export function watcherRequestBody(words: string, known: readonly string[], model = WATCHER_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(compiledSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 400,
    system: `You turn a person's request to be told of something in their portfolio app into one test the app runs itself: one figure, at or above or at or below one level. You never read a figure, judge or advise; you only translate.

Subjects:
- company: one company by ticker (the person's companies: ${known.slice(0, 60).join(", ") || "none listed"}; any other US ticker is allowed).
- holdings: every listed holding at once ("any holding", "a position").
- market: one market indicator by symbol, its level: ${MARKET_SYMBOLS.join(", ")}.

Fields for company and holdings:
${fieldLines()}

Rules:
- "falls below 50%" is lte 50; "rises above", "reaches", "over" are gte. Percent fields take the number of percent.
- A request for two figures, a change over a period, news, an event or a date cannot be expressed: ok false, and why says what it asks that one level cannot read.
- Your whole answer is one call to record_watcher.`,
    tools: [{ name: "record_watcher", description: "Record the test the app will run.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: words }] }],
  };
}

export type WatcherParse = { ok: true; watcher: Omit<Watcher, "id" | "at" | "words"> } | { ok: false; reason: string };

/** The recipe in words: "MA operating margin at or below 50". */
export function watcherReads(w: Pick<Watcher, "subject" | "field" | "is" | "value">): string {
  const level = w.value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const op = w.is === "lte" ? "at or below" : "at or above";
  if (w.subject.kind === "market") return `${marketDef(w.subject.symbol)?.name ?? w.subject.symbol} ${op} ${level}`;
  const name = w.field === "price" ? "price" : w.field === WEIGHT_FIELD ? "weight in the book, %" : ((FIELDS as Record<string, { label: string }>)[w.field]?.label ?? w.field).toLowerCase();
  return `${w.subject.kind === "holdings" ? "Any listed holding's" : `${w.subject.symbol}'s`} ${name} ${op} ${level}`;
}

/** The reading set inside a sentence ("Read as ..."): a plain first word loses its capital ("Any" to "any"); a ticker, an index or a name in capitals keeps it ("MA's", "VIX"). */
export function readsInSentence(reads: string): string {
  return /^[A-Z][a-z]/.test(reads) ? `${reads.charAt(0).toLowerCase()}${reads.slice(1)}` : reads;
}

/** The model's call, checked: a field the app does not read, a symbol not a ticker, or a missing level is refused with a sentence. */
export function parseWatcherResponse(body: unknown): WatcherParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_watcher");
  if (!call) return { ok: false, reason: "The model answered in words instead of a test. Try other words." };
  const p = compiledSchema.safeParse(call.input);
  if (!p.success) return { ok: false, reason: "What came back was not a test. Try other words." };
  const c = p.data;
  if (!c.ok) return { ok: false, reason: c.why ? `That cannot be read as one figure at one level: ${c.why.replace(/\.$/, "")}.` : "That cannot be read as one figure at one level." };
  if (!c.subject || !c.is || c.value === undefined) return { ok: false, reason: "The test came back without a subject, a direction or a level. Name the figure and the level." };
  let subject: Watcher["subject"];
  let field: string;
  if (c.subject === "market") {
    const s = (c.symbol ?? "").toUpperCase();
    if (!(MARKET_SYMBOLS as readonly string[]).includes(s)) return { ok: false, reason: `${c.symbol ?? "That indicator"} is not one the app reads.` };
    subject = { kind: "market", symbol: s as (typeof MARKET_SYMBOLS)[number] };
    field = "level";
  } else {
    if (!c.field || !(WATCHER_FIELDS as readonly string[]).includes(c.field)) return { ok: false, reason: `${c.field ? `"${c.field}"` : "That figure"} is not one the app reads for a company.` };
    field = c.field;
    if (c.subject === "holdings") subject = { kind: "holdings" };
    else {
      const s = (c.symbol ?? "").toUpperCase();
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)) return { ok: false, reason: "Name the company by its ticker." };
      subject = { kind: "company", symbol: s };
    }
  }
  const w = { subject, field, is: c.is, value: c.value };
  return { ok: true, watcher: { ...w, reads: watcherReads(w) } };
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** A company's reading of a field: the holding's own (price, weight, fundamentals), else the filings read for a watchlist company. */
function readingOf(sym: string, field: string, book: Book | null, filings: FilingsFile | null, total: number): number | null {
  const h = book?.holdings.find((x) => x.symbol.toUpperCase() === sym);
  if (field === WEIGHT_FIELD) return h && total > 0 ? (h.value / total) * 100 : null;
  if (field === "price") return h?.price ?? null;
  const own = (h?.fundamentals as Record<string, number | null | undefined> | undefined)?.[field];
  if (typeof own === "number" && Number.isFinite(own)) return own;
  const filed = filings?.bySymbol[sym]?.values?.[field];
  return typeof filed === "number" && Number.isFinite(filed) ? filed : null;
}

/** What a watcher reads today: each subject it covers with its reading, null when the figure is not read. */
export function watcherReadings(w: Watcher, book: Book | null, filings: FilingsFile | null): { symbol: string; reading: number | null; met: boolean }[] {
  const holds = (v: number | null) => v !== null && (w.is === "lte" ? v <= w.value : v >= w.value);
  if (w.subject.kind === "market") {
    const sym = w.subject.symbol;
    const v = book?.markets?.rows.find((r) => r.symbol === sym)?.level ?? null;
    return [{ symbol: sym, reading: v, met: holds(v) }];
  }
  const total = book?.holdings.reduce((a, h) => a + Math.max(0, h.value), 0) ?? 0;
  const symbols = w.subject.kind === "company" ? [w.subject.symbol] : [...new Set((book?.holdings ?? []).filter((h) => h.assetClass === "equity" || h.assetClass === "etf").map((h) => h.symbol.toUpperCase()))];
  return symbols.map((s) => {
    const v = readingOf(s, w.field, book, filings, total);
    return { symbol: s, reading: v, met: holds(v) };
  });
}

/** Each watcher that holds today, one alert per subject it holds for, keyed by the watcher and the subject. */
export function watcherNotices(watchers: readonly Watcher[], book: Book | null, filings: FilingsFile | null, today: string): Notice[] {
  const out: Notice[] = [];
  for (const w of watchers) {
    for (const r of watcherReadings(w, book, filings)) {
      if (!r.met || r.reading === null) continue;
      out.push({
        key: `${WATCHER_PREFIX}${w.id}:${r.symbol}`,
        date: today,
        tone: "warn",
        title: `${w.subject.kind === "market" ? (marketDef(r.symbol)?.name ?? r.symbol) : r.symbol}: ${fmt(r.reading)}, your watcher holds`,
        detail: `You asked: "${w.words}". Read as ${readsInSentence(w.reads)}.`,
        href: w.subject.kind === "market" ? "/markets" : `/company/${encodeURIComponent(r.symbol)}`,
      });
    }
  }
  return out;
}

/** A new watcher's id, unique among those kept. */
export const watcherId = (taken: readonly string[]): string => {
  let id = "";
  do id = `w${Math.random().toString(36).slice(2, 9)}`;
  while (taken.includes(id));
  return id;
};

/** The demo's watchers, compiled ahead and kept in the code, since the demo calls no model. */
export const DEMO_WATCHERS: Watcher[] = [
  { id: "wdemo1", words: "Tell me if MA's operating margin falls below 50%", subject: { kind: "company", symbol: "MA" }, field: "operating_margin_pct", is: "lte", value: 50, reads: "MA's operating margin at or below 50", at: "2026-10-09T18:00:00.000Z" },
  { id: "wdemo2", words: "When any position grows past 14% of the book", subject: { kind: "holdings" }, field: WEIGHT_FIELD, is: "gte", value: 14, reads: "Any listed holding's weight in the book, % at or above 14", at: "2026-10-09T18:00:00.000Z" },
  { id: "wdemo3", words: "If the VIX goes above 25", subject: { kind: "market", symbol: "VIX" }, field: "level", is: "gte", value: 25, reads: "VIX at or above 25", at: "2026-10-09T18:00:00.000Z" },
];
