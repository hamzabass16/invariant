/**
 * A company's ecosystem from its own annual report (Hamza, 21 Nov 2026,
 * after Qualtrim's ecosystem page): the suppliers, customers, partners and
 * competitors the company names in its latest 10-K, 20-F or 40-F, each with
 * the sentence it is named in. Read once per annual report for everyone, on
 * the deployment's key, and kept in the registry's shared company_figures
 * (kind `eco`), so every person's company page draws the same reading.
 *
 * The model only finds the names; the app keeps a relation only when the
 * quote it gives is printed word for word in the report and names the
 * company it is about, a customer's share of revenue only when the quote
 * prints that number, and a ticker only when the SEC's list carries it. No
 * web search, no forecast, no verdict: what the filing says, with where.
 *
 * Pure: the shape, the filing to read, the part of it read, the request,
 * the parser and what is due.
 */
import { z } from "zod";

import { MODELS } from "@/lib/models";

export const ECO_KINDS = ["supplier", "customer", "partner", "competitor"] as const;
export type EcoKind = (typeof ECO_KINDS)[number];
export const ECO_KIND_LABEL: Record<EcoKind, string> = { supplier: "Suppliers", customer: "Customers", partner: "Partners", competitor: "Competitors" };

/** The annual reports read. */
export const ANNUAL_FORMS = ["10-K", "20-F", "40-F"] as const;
/** The reading's shape: one kept under an earlier one is read again. */
export const ECO_VERSION = 1;
/** Characters of the report given to the model: the business and its risks, then the paragraphs on customers' shares. */
export const ECO_MAX_CHARS = 110_000;
/** Of those, at most this many from the paragraphs found outside the business section. */
export const ECO_EXTRA_CHARS = 12_000;
/** Relations kept a company. */
export const ECO_MAX_RELATIONS = 30;
/** A quote's length, in characters. */
export const ECO_QUOTE_MIN = 12;
export const ECO_QUOTE_MAX = 400;
/** A failed read is tried again after this many days. */
export const ECO_RETRY_DAYS = 14;
/** From this many days after the last report was filed, the SEC is asked for the next one, at most weekly. */
export const ECO_RECHECK_DAYS = 330;
export const ECO_CHECK_EVERY_DAYS = 7;
/** Companies read for everyone at the 05:00 UTC run. */
export const ECO_PER_RUN = 8;
export const ECO_MAX_TOKENS = 6000;
/** Finding names in a long text and copying their sentences: the fast tier, every quote checked by the app. */
export const ECO_MODEL = MODELS.fast;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const ecoRelationSchema = z.object({
  name: z.string().min(1).max(120),
  /** The ticker on the SEC's list, null when the company names one the list does not carry (a private company, a foreign one). */
  ticker: z.string().max(12).nullable(),
  kind: z.enum(ECO_KINDS),
  /** The report's own words naming it, copied exactly. */
  quote: z.string().max(ECO_QUOTE_MAX),
  /** A customer's share of revenue in percent, only as the quote prints it. */
  share: z.number().min(0).max(100).nullable(),
});
export type EcoRelation = z.infer<typeof ecoRelationSchema>;

export const ecosystemSchema = z.object({
  symbol: z.string(),
  form: z.string(),
  accession: z.string(),
  filed: z.string().nullable(),
  /** The report's page at the SEC. */
  url: z.string().nullable(),
  readAt: z.string(),
  /** When the SEC was last asked whether a newer report is filed. */
  checkedAt: z.string().nullable().optional(),
  model: z.string().nullable(),
  relations: z.array(ecoRelationSchema),
  /** Relations the app dropped, a quote not printed or a kind not one of the four. */
  dropped: z.number().int().min(0).default(0),
  note: z.string().max(400).nullable(),
  error: z.string().max(300).nullable().optional(),
  failedAt: z.string().nullable().optional(),
  version: z.number().int().optional(),
});
export type Ecosystem = z.infer<typeof ecosystemSchema>;

export type AnnualFiling = { accession: string; form: string; filed: string | null; primary: string };

/** The company's latest annual report on its submissions list, with its primary document; null when none is listed. Amendments are left out. */
export function latestAnnualOf(submissions: unknown): AnnualFiling | null {
  const r = (submissions as { filings?: { recent?: Record<string, unknown[]> } } | null)?.filings?.recent;
  const acc = r?.accessionNumber;
  const form = r?.form;
  if (!Array.isArray(acc) || !Array.isArray(form)) return null;
  const filed = Array.isArray(r?.filingDate) ? r.filingDate : [];
  const primary = Array.isArray(r?.primaryDocument) ? r.primaryDocument : [];
  let best: AnnualFiling | null = null;
  for (let i = 0; i < acc.length; i++) {
    if (!(ANNUAL_FORMS as readonly string[]).includes(String(form[i]))) continue;
    const doc = typeof primary[i] === "string" ? (primary[i] as string) : "";
    if (!doc || !/\.html?$/i.test(doc)) continue;
    const day = typeof filed[i] === "string" && DAY.test(filed[i] as string) ? (filed[i] as string) : null;
    const f = { accession: String(acc[i]), form: String(form[i]), filed: day, primary: doc };
    if (!best || (day && (!best.filed || day > best.filed))) best = f;
  }
  return best;
}

const SPAN_STARTS: Record<string, RegExp[]> = {
  "10-K": [/item\s*1\s*[.:\-–—]?\s*business\b/gi],
  "20-F": [/item\s*4\s*[.:\-–—]?\s*information\s+on\s+the\s+company/gi],
  "40-F": [/(description\s+of\s+(the\s+)?business|general\s+development\s+of\s+the\s+business)/gi],
};
const SPAN_ENDS: Record<string, RegExp> = {
  "10-K": /item\s*2\s*[.:\-–—]?\s*properties\b/gi,
  "20-F": /item\s*5\s*[.:\-–—]?\s*operating\s+and\s+financial/gi,
  "40-F": /(risk\s+factors|dividends\s+and\s+distributions)/gi,
};
/** A paragraph outside the business section worth reading: a customer's share of revenue, a sole supplier, a concentration of risk. */
const EXTRA = /(\b\d{1,2}(?:\.\d)?\s?%\s+of\s+(?:our\s+|the\s+company'?s\s+|total\s+|consolidated\s+|net\s+)*(?:revenues?|sales|net\s+sales)|concentrations?\s+of\s+(?:credit\s+)?risk|(?:sole|single|limited\s+number\s+of)\s+(?:source\s+)?suppliers?|major\s+customers?)/gi;

/**
 * The part of the report the model reads: the business section (Item 1 to
 * Item 2 of a 10-K, so the risk factors with it; Item 4 of a 20-F), the
 * longest span found so the table of contents is skipped; then, apart, the
 * paragraphs elsewhere that name a customer's share of revenue, a sole
 * supplier or a concentration of risk. With no section found, the report
 * from its start. Capped at `ECO_MAX_CHARS`, said so.
 */
export function businessSections(text: string, form: string): { text: string; cut: boolean; found: boolean } {
  const starts = (SPAN_STARTS[form] ?? SPAN_STARTS["10-K"]).flatMap((re) => [...text.matchAll(new RegExp(re.source, "gi"))].map((m) => m.index ?? 0));
  const ends = [...text.matchAll(new RegExp((SPAN_ENDS[form] ?? SPAN_ENDS["10-K"]).source, "gi"))].map((m) => m.index ?? 0);
  let span: [number, number] | null = null;
  for (const s of starts) {
    const e = ends.find((x) => x > s) ?? Math.min(text.length, s + ECO_MAX_CHARS);
    if (!span || e - s > span[1] - span[0]) span = [s, e];
  }
  const found = !!span && span[1] - span[0] > 2000;
  const [a, b] = found ? span! : [0, Math.min(text.length, ECO_MAX_CHARS)];
  const room = ECO_MAX_CHARS - ECO_EXTRA_CHARS;
  const main = text.slice(a, b);
  const extras: string[] = [];
  let extraLen = 0;
  for (const m of text.matchAll(new RegExp(EXTRA.source, "gi"))) {
    const at = m.index ?? 0;
    if (at >= a && at < b) continue;
    const from = Math.max(0, text.lastIndexOf("\n", at - 1) + 1, at - 700);
    const to = Math.min(text.length, at + 700);
    const piece = text.slice(from, to).trim();
    if (extras.some((x) => x.includes(piece.slice(0, 80))) || extraLen + piece.length > ECO_EXTRA_CHARS) continue;
    extras.push(piece);
    extraLen += piece.length;
  }
  const body = main.length > room ? main.slice(0, room) : main;
  const joined = extras.length ? `${body}\n\n[Elsewhere in the report]\n\n${extras.join("\n\n…\n\n")}` : body;
  return { text: joined, cut: main.length > room, found };
}

const relationAnswer = z.object({
  name: z.string().describe("The other company's name as the report writes it in the quote."),
  ticker: z.string().optional().describe("Its US ticker when you know it; left out otherwise."),
  kind: z.string().describe(`One of: ${ECO_KINDS.join(", ")}.`),
  quote: z.string().describe("The report's own sentence naming it, copied exactly, at most 400 characters."),
  share: z.number().optional().describe("For a customer, its share of revenue in percent when the quote prints it."),
});
const answerSchema = z.object({
  relations: z.array(relationAnswer),
  note: z.string().optional().describe("One sentence when the report names few or none, saying so."),
});

/** One call, no web search: the report's text and one tool to record what it names. */
export function ecoRequestBody(company: { symbol: string; name: string }, filing: Pick<AnnualFiling, "form" | "filed">, text: string, model = ECO_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(answerSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: ECO_MAX_TOKENS,
    system: `You read a company's annual report and list the other companies it names as its suppliers, customers, partners and competitors, for a page that shows a company's ecosystem with the report's own words.

Rules:
- Only companies the report itself names. Never one you know of that the report does not name; never a group ("hyperscalers", "large banks") or a government.
- kind: supplier (it buys from them, makes with them, licenses from them, depends on them for supply), customer (it sells to them, or they distribute its products), partner (a joint venture, an alliance, a collaboration, a co-development), competitor (the report names it as competing).
- quote: the sentence naming it, copied character for character from the text, at most 400 characters; cut to the part that names it rather than rewording. The name must appear in the quote as written.
- share: only for a customer, and only when the quote prints its share of revenue as a percentage.
- One entry per company and kind; at most ${ECO_MAX_RELATIONS}, the most important first.
- When the report names few or none, record what it names and say so in note.
Your whole answer is one call to record_ecosystem; write nothing outside it.`,
    tools: [{ name: "record_ecosystem", description: "Record the companies the report names, each with its kind and the report's own sentence.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${company.name} (${company.symbol}), ${filing.form}${filing.filed ? ` filed ${filing.filed}` : ""}:\n\n${text}` }] }],
  };
}

/** Text as it is compared: lower case, quotes and dashes made plain, spaces collapsed. */
export function plainText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a percentage is printed in the words: 12 as "12%", "12 %" or "12 percent", 12.5 as "12.5%". */
function printsPercent(words: string, n: number): boolean {
  const s = String(Math.round(n * 10) / 10).replace(/\.0$/, "");
  return new RegExp(`(^|[^\\d.])${s.replace(".", "\\.")}\\s?(%|percent)`).test(words);
}

export type EcoParse = { ok: true; relations: EcoRelation[]; dropped: number; note: string | null } | { ok: false; reason: string };

/**
 * Reads the answer item by item: a kind not one of the four, a quote not
 * printed in the text it was given or not naming the company it is about, a
 * repeat, is dropped and counted; one bad item never costs the rest. A
 * ticker is kept only when `tickers` carries it and it is not the company's
 * own; a share only when its quote prints it. An answer with no call is no
 * reading; a call with no relation is one, with its note.
 */
export function parseEcoResponse(body: unknown, text: string, self: string, tickers: ReadonlySet<string> | null): EcoParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_ecosystem");
  if (!call) return { ok: false, reason: (body as { stop_reason?: string } | null)?.stop_reason === "max_tokens" ? "the answer ran past its length before it recorded the reading" : "the model answered in words instead of recording the reading" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  const plain = plainText(text);
  const own = self.toUpperCase();
  const out: EcoRelation[] = [];
  let dropped = 0;
  for (const item of Array.isArray(raw.relations) ? raw.relations : []) {
    const m = relationAnswer.safeParse(item);
    const kind = m.success ? m.data.kind.trim().toLowerCase() : "";
    if (!m.success || !(ECO_KINDS as readonly string[]).includes(kind)) {
      dropped++;
      continue;
    }
    const name = m.data.name.trim().replace(/\s+/g, " ").slice(0, 120);
    const quote = m.data.quote.trim().replace(/\s+/g, " ");
    const pq = plainText(quote);
    if (!name || quote.length < ECO_QUOTE_MIN || quote.length > ECO_QUOTE_MAX || !plain.includes(pq) || !pq.includes(plainText(name)) || out.length >= ECO_MAX_RELATIONS) {
      dropped++;
      continue;
    }
    if (out.some((r) => r.kind === kind && plainText(r.name) === plainText(name))) {
      dropped++;
      continue;
    }
    const t = (m.data.ticker ?? "").trim().toUpperCase().replace(/\./g, "-");
    const ticker = t && t !== own && tickers?.has(t) ? t : null;
    const share = kind === "customer" && typeof m.data.share === "number" && Number.isFinite(m.data.share) && m.data.share > 0 && m.data.share <= 100 && printsPercent(quote, m.data.share) ? m.data.share : null;
    out.push({ name, ticker, kind: kind as EcoKind, quote, share });
  }
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 400) : null;
  return { ok: true, relations: out, dropped, note };
}

const days = (now: Date, at: string | null | undefined, n: number) => !at || now.getTime() - Date.parse(at) >= n * 86_400_000;

/** Whether the SEC should be asked about a company: never read, a failed read past its wait, an earlier shape, or a year on from the report read (asked weekly from then). */
export function ecoCandidate(kept: Ecosystem | null | undefined, now: Date): boolean {
  if (!kept) return true;
  if (kept.error) return days(now, kept.failedAt ?? kept.readAt, ECO_RETRY_DAYS);
  if ((kept.version ?? 0) < ECO_VERSION) return days(now, kept.failedAt, ECO_RETRY_DAYS);
  if (!days(now, kept.filed ?? kept.readAt, ECO_RECHECK_DAYS)) return false;
  return days(now, kept.checkedAt ?? kept.readAt, ECO_CHECK_EVERY_DAYS) && days(now, kept.failedAt, ECO_RETRY_DAYS);
}

/** Whether the report the SEC lists now must be read: none kept, a failed one, an earlier shape or a newer report. */
export function ecoNeedsRead(kept: Ecosystem | null | undefined, latest: AnnualFiling): boolean {
  return !kept || !!kept.error || (kept.version ?? 0) < ECO_VERSION || kept.accession !== latest.accession;
}

/** A read that failed: over a good one, the good one marked to be tried again; else the failure, said in a sentence. */
export function failedEco(kept: Ecosystem | null | undefined, symbol: string, filing: AnnualFiling | null, at: string, reason: string): Ecosystem {
  if (kept && !kept.error) return { ...kept, failedAt: at };
  return ecosystemSchema.parse({ symbol, form: filing?.form ?? "", accession: filing?.accession ?? "", filed: filing?.filed ?? null, url: null, readAt: at, model: null, relations: [], dropped: 0, note: null, error: reason.slice(0, 300), failedAt: at, version: ECO_VERSION });
}

/** The relations by kind, in `ECO_KINDS` order, those with a share of revenue first among customers. */
export function ecoGroups(e: Pick<Ecosystem, "relations">): { kind: EcoKind; label: string; items: EcoRelation[] }[] {
  return ECO_KINDS.map((kind) => ({
    kind,
    label: ECO_KIND_LABEL[kind],
    items: e.relations.filter((r) => r.kind === kind).sort((a, b) => (b.share ?? -1) - (a.share ?? -1)),
  })).filter((g) => g.items.length);
}
