import { z } from "zod";

import { marketDef, MARKET_SYMBOLS } from "@/lib/markets";
import type { Methodology } from "@/lib/methodology";
import { FIELDS, FUNDAMENTAL_FIELDS } from "@/lib/ontology";
import { classWords, testWords } from "@/lib/recipes";
import type { CompanyVerdict } from "@/lib/research";
import type { CapState, Weight } from "@/lib/screens";
import { numbersIn, printed } from "@/lib/statements";
import { MAX_PILLARS, MAX_WATCH, paragraphsOf, pillarFieldOk, withEvidence, type MarketThesis, type Pillar, type Thesis } from "@/lib/theses";
import { MODELS } from "@/lib/models";
import { READ_BEHIND } from "@/lib/investigate";

/**
 * Add to thesis, in the app (Hamza, 19 Oct 2026: "in-app, using the user's
 * Claude API, then the user would approve, deny, or amend the highlighted
 * changes to the thesis after uploading the document or data").
 *
 * The person uploads a document or data on a thesis's page. The app reads
 * it with the AI with the thesis and the methodology it lives
 * under beside it (Hamza, 19 Oct 2026: "does the user's model read against
 * the user's methodology in addition to against the thesis as well, because
 * it should"), through one tool (`propose_changes`): a summary of what the
 * document says that bears on the thesis and on the methodology's classes
 * and rules as they apply to the subject, and a short list of proposed changes, each naming the paragraph,
 * pathway, watch item or pillar it touches, the words before and after, and
 * why. The app then checks every change against the thesis as kept (a
 * target that is not there is dropped and named, a pillar test on a figure
 * the subject cannot read loses its test) and every figure in the proposal
 * against the document's printed text (an unprinted one is named, never
 * silently used), and keeps the proposal pending in the vault's
 * `thesis_proposals` file. The thesis page shows each change highlighted,
 * with Approve, Deny or Amend; Apply writes the kept ones and an evidence
 * entry (the source, its date, what it said, what changed) under Added to
 * the thesis, and clears the proposal. Nothing moves until the person
 * applies it; a valuation, a DCF, a record, a class and an order never move.
 *
 * Pure: the model call and the vault are in lib/thesis-review-run.ts.
 */

export const REVIEW_MODEL = MODELS.standard;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 150_000;
export const MAX_CHANGES = 12;
/** The files the picker takes: a PDF (its text layer, or the PDF itself) or a text file. */
export const ACCEPT = ".pdf,.txt,.md,.csv,.tsv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json";
export const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".tsv", ".json"] as const;
export const DATA_EXTENSIONS = [".csv", ".tsv", ".json"] as const;

export type Subject = { kind: "stock"; symbol: string } | { kind: "market"; id: string };

/** The key a pending proposal is kept under: one per thesis. */
export const proposalKey = (s: Subject): string => (s.kind === "stock" ? `stock:${s.symbol.toUpperCase()}` : `market:${s.id}`);

export const CHANGE_TARGETS = ["text", "pathway", "watch", "pillar"] as const;
export type ChangeTarget = (typeof CHANGE_TARGETS)[number];
export const TARGET_LABEL: Record<ChangeTarget, string> = { text: "Thesis", pathway: "Pathway", watch: "Watch item", pillar: "Pillar" };

const testSchema = z.object({ field: z.string().min(1).max(40), is: z.enum(["gte", "lte"]), value: z.number() });

/** One change the model proposes, as the tool records it. */
export const changeReadSchema = z.object({
  target: z.enum(CHANGE_TARGETS).describe("text: one paragraph of the thesis; pathway: the pathway; watch: one watch item; pillar: one pillar."),
  before: z.string().max(6000).nullable().describe("text: the paragraph as it stands, copied exactly, or null to add a paragraph; pathway: null; watch: the item as it stands, or null to add one; pillar: the pillar's name as it stands, or null to add a pillar."),
  after: z.string().max(6000).nullable().describe("The paragraph, pathway, item or pillar text after the change; null to remove it."),
  name: z.string().max(80).nullable().optional().describe("A new pillar's name; otherwise null."),
  test: testSchema.nullable().optional().describe("A new pillar's test: a figure the subject reads (listed in the instructions), at or above (gte) or at or below (lte) a level; null when the document gives none."),
  reason: z.string().min(1).max(400).describe("What in the document calls for this change, with the figure and its date where there is one."),
});
export type ChangeRead = z.infer<typeof changeReadSchema>;

/** What the tool records: the document, what it says that bears on the thesis, the changes it calls for. */
export const proposalReadSchema = z.object({
  source: z.string().min(1).max(200).describe("The document's title: the issuer and what it is (Q3 2026 earnings call transcript, Morgan Stanley note of 12 Oct 2026, a table of monthly deliveries)."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("The document's own date, YYYY-MM-DD, or null when it prints none."),
  kind: z.enum(["document", "data"]).describe("data for a table or a series of figures; document otherwise."),
  summary: z.string().min(1).max(1500).describe("What the document says that bears on this thesis, in a paragraph: figures with their dates, as printed; what it supports, what it strains; nothing it does not say."),
  changes: z.array(changeReadSchema).max(MAX_CHANGES).describe("The changes the document calls for, few and specific; none when it changes nothing."),
});
export type ProposalRead = z.infer<typeof proposalReadSchema>;

/** A change once checked against the thesis as kept, with an id for the form and a line naming where it lands. */
export const changeSchema = changeReadSchema.extend({
  id: z.string().min(1).max(16),
  /** Where it lands: "Thesis, paragraph 2", "Pathway", "Watch item", "Pillar: Pricing power", "New pillar". */
  where: z.string().min(1).max(120),
  /** For a pillar change: the pillar's id, or null for a new one. */
  pillarId: z.string().max(20).nullable().default(null),
});
export type ProposedChange = z.infer<typeof changeSchema>;

export const proposalSchema = z.object({
  key: z.string().min(1).max(60),
  subject: z.discriminatedUnion("kind", [z.object({ kind: z.literal("stock"), symbol: z.string().min(1).max(10) }), z.object({ kind: z.literal("market"), id: z.string().min(1).max(40) })]),
  /** When it was read, ISO. */
  at: z.string(),
  document: z.object({ name: z.string().min(1).max(160), bytes: z.number().int().nonnegative(), readFrom: z.enum(["text", "pdf"]) }),
  source: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  kind: z.enum(["document", "data"]),
  summary: z.string().min(1).max(1500),
  changes: z.array(changeSchema).max(MAX_CHANGES),
  /** Changes the model proposed that could not be placed on the thesis as kept, each as a sentence. */
  dropped: z.array(z.string().max(300)).max(MAX_CHANGES),
  /** Figures in the summary or the changes that the document's text does not print; empty when the PDF itself was read, since then there is no text to check against. */
  unchecked: z.array(z.string().max(60)).max(40),
  /** The methodology the document was read against, by name; null when none was on file (Hamza, 19 Oct 2026). */
  against: z.string().max(80).nullable().default(null),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const proposalsFileSchema = z.object({
  version: z.literal(1),
  /** One pending proposal per thesis, by `proposalKey`; a new upload replaces it. */
  byKey: z.record(z.string().max(60), proposalSchema),
  updated: z.string(),
});
export type ProposalsFile = z.infer<typeof proposalsFileSchema>;
export const EMPTY_PROPOSALS: ProposalsFile = { version: 1, byKey: {}, updated: "" };

export const proposalFor = (file: ProposalsFile | null, subject: Subject): Proposal | null => file?.byKey[proposalKey(subject)] ?? null;
export const withProposal = (file: ProposalsFile, p: Proposal, now: string): ProposalsFile => ({ version: 1, byKey: { ...file.byKey, [p.key]: p }, updated: now });
export function withoutProposal(file: ProposalsFile, key: string, now: string): ProposalsFile {
  const byKey = { ...file.byKey };
  delete byKey[key];
  return { version: 1, byKey, updated: now };
}

/** A text file's kind by its name: data for a table, document otherwise. */
export const documentKind = (name: string): "document" | "data" => (DATA_EXTENSIONS.some((x) => name.toLowerCase().endsWith(x)) ? "data" : "document");
export const isTextName = (name: string): boolean => TEXT_EXTENSIONS.some((x) => name.toLowerCase().endsWith(x));

// ---------------------------------------------------------------------------
// The request and the answer

/** The thesis as the model sees it: the words, the pathway, the pillars with their tests, the watch items. */
export type ThesisView = { text: string; pathway: string | null; pillars: readonly Pillar[]; watch: readonly string[] };
export const viewOf = (t: Thesis | MarketThesis | null): ThesisView => ({ text: t?.text ?? "", pathway: t && "pathway" in t ? t.pathway : null, pillars: t?.pillars ?? [], watch: t?.watch ?? [] });

export type ReviewInput = {
  document: { name: string; text: string | null; pdf: Uint8Array | null };
  /** "MA (Mastercard)", or the market thesis's title. */
  subject: { kind: "stock" | "market"; label: string };
  thesis: ThesisView;
  /** The methodology the thesis lives under, with where the subject stands under it today; null when none is confirmed yet (Hamza, 19 Oct 2026: the document is read against both). */
  methodology: MethodologyView | null;
  today: string;
};

/** The figures a new pillar may test, for the instructions: the price and the fundamental fields for a stock, the indicators for a market thesis. */
export function testableFields(kind: "stock" | "market"): { id: string; label: string }[] {
  if (kind === "market") return MARKET_SYMBOLS.map((s) => ({ id: s, label: marketDef(s)?.name ?? s }));
  const fields = FIELDS as Record<string, { label: string }>;
  return [{ id: "price", label: "Price" }, ...FUNDAMENTAL_FIELDS.map((f) => ({ id: f, label: fields[f]?.label ?? f }))];
}

// ---------------------------------------------------------------------------
// The methodology beside the thesis (Hamza, 19 Oct 2026: the document is read against both)

/**
 * Where a stock stands under the methodology today, as the app reads it: the
 * class its tests give it and every class's count, the rules its filings'
 * figures can test with their reading, the figures themselves, and its weight
 * against the cap its class gets (null when not held).
 */
export type Standing = {
  classLabel: string | null;
  classTests: { label: string; holds: boolean; passes: number; needed: number; unread: number }[];
  checks: { section: string; text: string; status: "pass" | "near" | "fail" | "n/a"; figure: string; actual: string | null; limit: string; detail: string }[];
  fields: { label: string; value: string }[];
  weight: { pct: number; cap: number | null; section: string | null; state: CapState } | null;
};

/** The methodology as the model reads it beside the thesis: its name and summary, each class's test in words, each rule with its section and how the app tests it, and the standing. */
export type MethodologyView = {
  name: string;
  summary: string;
  classes: { label: string; about: string | null; test: string }[];
  rules: { section: string; text: string; severity: "breach" | "guideline" | "watch"; tested: string | null }[];
  standing: Standing | null;
};

/** The standing from the research check on a one-holding book (lib/research.ts checkCompany) and the holding's weight (lib/screens.ts weightsFor). */
export function standingOf(v: CompanyVerdict, w: Pick<Weight, "weight" | "cap" | "state"> | null): Standing {
  return {
    classLabel: v.classLabel,
    classTests: v.classTests.map((t) => ({ label: t.label, holds: t.holds, passes: t.passes, needed: t.needed, unread: t.unread })),
    checks: v.checks.map((c) => ({ section: c.rule.section, text: c.rule.text, status: c.status, figure: c.figure, actual: c.actual, limit: c.limit, detail: c.detail })),
    fields: v.fields.map((f) => ({ label: f.label, value: f.value })),
    weight: w ? { pct: w.weight, cap: w.cap?.cap ?? null, section: w.cap?.rule.section ?? null, state: w.state } : null,
  };
}

/** The methodology in the words the request carries: every class's test (lib/recipes.ts classWords) and every rule with its section, its kind and how the app tests it, else that it is the person's to check. */
export function methodologyView(m: Methodology, ccy: string, standing: Standing | null): MethodologyView {
  const figs = new Map(m.figures.map((f) => [f.id, f]));
  return {
    name: m.name,
    summary: m.summary,
    classes: m.classes.map((c) => ({ label: c.label, about: c.about ?? null, test: classWords(c) })),
    rules: m.rules.map((r) => {
      const f = r.test ? figs.get(r.test.figure) : undefined;
      return { section: r.section, text: r.text, severity: r.severity, tested: r.test && f ? testWords({ expr: f.expr, unit: f.unit, is: r.test.is, limit: r.test.limit, each: f.by }, ccy) : null };
    }),
    standing,
  };
}

const SEVERITY_WORDS = { breach: "hard limit", guideline: "guideline", watch: "watch level" } as const;
const STATUS_WORDS = { pass: "holds", near: "holds, near the limit", fail: "does not hold", "n/a": "unread" } as const;
const CAP_WORDS: Record<CapState, string> = { over: "over the cap", near: "near the cap", within: "within the cap", none: "no cap" };

const methodologyWords = (kind: "stock" | "market", label: string, v: MethodologyView | null): string => {
  if (!v) return "Methodology: none confirmed yet, so the document is read against the thesis alone.";
  const lines = [
    `Methodology: ${v.name}. ${v.summary}`.trim(),
    v.classes.length ? "Classes (a holding is in the first whose test holds; each criterion is a figure at a level):" : "Classes: none.",
    ...v.classes.map((c) => `- ${c.label}: ${c.test}${c.about ? `. ${c.about}` : ""}`),
    v.rules.length ? "Rules (section · rule · kind · how the app tests it):" : "Rules: none.",
    ...v.rules.map((r) => `- ${r.section} · ${r.text} · ${SEVERITY_WORDS[r.severity]} · ${r.tested ? `tested as ${r.tested}` : "the person's to check; the app cannot measure it"}`),
  ];
  if (kind === "stock") {
    const s = v.standing;
    if (!s) lines.push(`Where ${label} stands under it today: no reading (not held, and no filings read).`);
    else {
      lines.push(`Where ${label} stands under it today (the app's own reading from the filings; never restate it as a verdict):`);
      lines.push(`- Class: ${s.classLabel ?? "none, no class's test holds"}${s.classTests.length ? ` (${s.classTests.map((t) => `${t.label}: ${t.passes} of ${t.needed} criteria hold${t.unread ? `, ${t.unread} unread` : ""}`).join("; ")})` : ""}`);
      if (s.weight) lines.push(`- Weight: ${s.weight.pct.toFixed(2)}% of the book, ${s.weight.cap !== null ? `cap ${s.weight.cap}%${s.weight.section ? ` (${s.weight.section})` : ""}, ${CAP_WORDS[s.weight.state]}` : "no cap"}`);
      if (s.checks.length) lines.push(`- Rules on its figures: ${s.checks.map((c) => `${c.section} ${STATUS_WORDS[c.status]}${c.actual !== null ? ` (${c.figure} ${c.actual}, limit ${c.limit})` : c.detail ? ` (${c.detail})` : ""}`).join("; ")}`);
      if (s.fields.length) lines.push(`- Figures from the filings: ${s.fields.map((f) => `${f.label} ${f.value}`).join(", ")}`);
    }
  }
  return lines.join("\n");
};

const thesisWords = (kind: "stock" | "market", t: ThesisView): string => {
  const paragraphs = paragraphsOf(t.text);
  return [
    `Thesis (${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"}):`,
    paragraphs.length ? paragraphs.map((p, i) => `[paragraph ${i + 1}] ${p}`).join("\n") : "(none written yet)",
    ...(kind === "stock" ? [`Pathway: ${t.pathway ?? "(none)"}`] : []),
    `Pillars (${t.pillars.length}):`,
    t.pillars.length ? t.pillars.map((p) => `- ${p.name}: ${p.text}${p.test ? ` [tested: ${p.test.field} ${p.test.is === "gte" ? "at or above" : "at or below"} ${p.test.value}]` : " [no test]"}`).join("\n") : "(none)",
    `Watch items (${t.watch.length}):`,
    t.watch.length ? t.watch.map((w) => `- ${w}`).join("\n") : "(none)",
  ].join("\n");
};

export function reviewRequestBody(input: ReviewInput, model = REVIEW_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(proposalReadSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const content: Record<string, unknown>[] = [];
  if (input.document.text !== null) {
    const cut = input.document.text.length > MAX_TEXT_CHARS;
    content.push({ type: "text", text: `Document: ${input.document.name}${cut ? " (first part; the rest was cut for length)" : ""}\n\n${input.document.text.slice(0, MAX_TEXT_CHARS)}` });
  } else if (input.document.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(input.document.pdf).toString("base64") }, title: input.document.name.slice(0, 120) });
  }
  content.push({ type: "text", text: `The thesis this document is read against, ${input.subject.kind === "stock" ? `on ${input.subject.label}` : `a market thesis: "${input.subject.label}"`}, as kept today (${input.today}):\n\n${thesisWords(input.subject.kind, input.thesis)}` });
  content.push({ type: "text", text: `The methodology the thesis lives under, which the document is read against too:\n\n${methodologyWords(input.subject.kind, input.subject.label, input.methodology)}\n\nPropose the changes.` });
  const fields = testableFields(input.subject.kind);
  return {
    model,
    max_tokens: 8000,
    system: `You read one document or table a person uploaded against one of their investment theses and the methodology the thesis lives under, in their own portfolio app, and propose what to change in the thesis. The person approves, denies or amends each change; nothing moves until they do.

Rules:
- Read the document for what bears on this thesis and on the methodology as it applies to the subject: figures, guidance, events, a view, and what they do to a class's criteria, a rule, a cap or a pillar's figure. Record a one-paragraph summary with every figure as printed and dated, naming the class criterion or the rule's section (3.1, D.1(c)) a figure bears on. Say nothing the document does not say.
- Propose a change only where the document changes what the thesis says, or adds something the thesis should carry under its methodology: a paragraph revised or added, the pathway revised, a watch item added, revised or removed, a pillar's text revised or a pillar added or removed. Few and specific; none when the document changes nothing. A change's reason names the class or the rule it answers, by section, where one does.
- The methodology is applied by the app, never by you. Where the subject stands under it today is given as the app's reading: say what the document changes in the figures a class or a rule reads, and leave the class, the breach and the pass to the app.
- A change to a paragraph copies the paragraph exactly in "before" and gives the whole revised paragraph in "after", keeping the person's words wherever they still hold. A new paragraph has "before" null. "after" null removes.
- A pillar change names the pillar by its name in "before". A new pillar has "before" null, its name in "name", its text in "after", and a test only when the document supports a level: a figure from this list, at or above (gte) or at or below (lte) a level, preferring one the methodology's classes or rules read: ${fields.map((f) => `${f.id} (${f.label})`).join(", ")}.
- Never propose a valuation, a target price, a class, a buy or a sale. Not advice: say what the document says and what it changes.
${READ_BEHIND} Who wrote the document and why matters here: a company's own deck, a broker's note and a filing say different things for different reasons.
- Your whole answer is one call to propose_changes; write nothing outside it.`,
    tools: [{ name: "propose_changes", description: "Record what the document says about the thesis and the changes it calls for.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  };
}

export type ReviewParse = { ok: true; read: ProposalRead } | { ok: false; reason: string; called: boolean };

/** Reads the answer: the one propose_changes call, validated. */
export function parseReviewResponse(body: unknown): ReviewParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "propose_changes");
  if (!call) return { ok: false, reason: "the model answered in words instead of proposing changes", called: false };
  const parsed = proposalReadSchema.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)`, called: true };
  return { ok: true, read: parsed.data };
}

// ---------------------------------------------------------------------------
// The check against the thesis and the document

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const same = (a: string, b: string): boolean => norm(a) === norm(b) || norm(a).toLowerCase() === norm(b).toLowerCase();

/** The index of the paragraph a "before" names, or -1: whitespace and case do not count. */
export function paragraphIndex(paragraphs: readonly string[], before: string): number {
  const i = paragraphs.findIndex((p) => same(p, before));
  if (i >= 0) return i;
  const m = before.match(/^\[?paragraph (\d+)\]?$/i);
  return m ? Math.min(paragraphs.length, Number(m[1])) - 1 : -1;
}

export type Checked = { changes: ProposedChange[]; dropped: string[]; unchecked: string[] };

/**
 * Places each proposed change on the thesis as kept. A paragraph, watch
 * item or pillar the thesis does not have is dropped and named; a new
 * pillar's test on a figure the subject cannot read loses its test and
 * says so in its reason; a change that changes nothing is dropped; adds
 * past the limits are dropped. Then every figure in the summary and the
 * changes is looked for in the document's text (when it was read as text):
 * one the text does not print is listed, never used in silence.
 */
export function checkProposal(read: ProposalRead, thesis: ThesisView, kind: "stock" | "market", text: string | null): Checked {
  const paragraphs = paragraphsOf(thesis.text);
  const changes: ProposedChange[] = [];
  const dropped: string[] = [];
  let watchCount = thesis.watch.length;
  let pillarCount = thesis.pillars.length;
  const seenParagraphs = new Set<number>();
  read.changes.forEach((c, i) => {
    const id = `c${i + 1}`;
    const after = c.after === null ? null : c.after.trim() || null;
    const base = { ...c, after, id, pillarId: null as string | null, name: c.name ?? null, test: c.test ?? null };
    if (c.target === "text") {
      if (c.before === null) {
        if (!after) return void dropped.push("A new paragraph with no words.");
        return void changes.push({ ...base, where: `Thesis, new paragraph`, before: null });
      }
      const at = paragraphIndex(paragraphs, c.before);
      if (at < 0) return void dropped.push(`A change to a paragraph the thesis does not have: "${norm(c.before).slice(0, 80)}${norm(c.before).length > 80 ? "…" : ""}".`);
      if (seenParagraphs.has(at)) return void dropped.push(`A second change to paragraph ${at + 1}; the first is kept.`);
      if (after !== null && same(paragraphs[at], after)) return void dropped.push(`Paragraph ${at + 1} unchanged.`);
      seenParagraphs.add(at);
      return void changes.push({ ...base, where: `Thesis, paragraph ${at + 1}`, before: paragraphs[at] });
    }
    if (c.target === "pathway") {
      if (kind !== "stock") return void dropped.push("A pathway on a market thesis; market theses have none.");
      if (after !== null && thesis.pathway !== null && same(thesis.pathway, after)) return void dropped.push("Pathway unchanged.");
      if (after === null && thesis.pathway === null) return void dropped.push("Removing a pathway that is not there.");
      return void changes.push({ ...base, where: "Pathway", before: thesis.pathway });
    }
    if (c.target === "watch") {
      if (c.before === null) {
        if (!after) return void dropped.push("A new watch item with no words.");
        if (thesis.watch.some((w) => same(w, after))) return void dropped.push(`A watch item already there: "${after.slice(0, 60)}".`);
        if (watchCount >= MAX_WATCH) return void dropped.push(`A new watch item past the limit of ${MAX_WATCH}.`);
        watchCount += 1;
        return void changes.push({ ...base, where: "New watch item", before: null });
      }
      const item = thesis.watch.find((w) => same(w, c.before!));
      if (!item) return void dropped.push(`A change to a watch item the thesis does not have: "${norm(c.before).slice(0, 60)}".`);
      if (after !== null && same(item, after)) return void dropped.push("Watch item unchanged.");
      if (after === null) watchCount -= 1;
      return void changes.push({ ...base, where: "Watch item", before: item });
    }
    // pillar
    if (c.before === null) {
      if (!after) return void dropped.push("A new pillar with no words.");
      if (pillarCount >= MAX_PILLARS) return void dropped.push(`A new pillar past the limit of ${MAX_PILLARS}.`);
      pillarCount += 1;
      const name = (c.name ?? "").trim() || after.split(/[.:]/)[0].slice(0, 80);
      let test = c.test ?? null;
      let reason = c.reason;
      if (test && !pillarFieldOk(test.field, kind)) {
        reason = `${reason} (Its test named ${test.field}, which the app cannot read for this thesis, so the pillar is added without a test.)`;
        test = null;
      } else if (test && kind === "market") test = { ...test, field: test.field.toUpperCase() };
      return void changes.push({ ...base, name, test, reason, where: `New pillar: ${name}`, before: null });
    }
    const pillar = thesis.pillars.find((p) => same(p.name, c.before!)) ?? thesis.pillars.find((p) => same(p.text, c.before!));
    if (!pillar) return void dropped.push(`A change to a pillar the thesis does not have: "${norm(c.before).slice(0, 60)}".`);
    if (after !== null && same(pillar.text, after)) return void dropped.push(`Pillar "${pillar.name}" unchanged.`);
    if (after === null) pillarCount -= 1;
    return void changes.push({ ...base, where: `Pillar: ${pillar.name}`, before: pillar.text, pillarId: pillar.id, name: pillar.name, test: null });
  });
  return { changes, dropped, unchecked: text === null ? [] : uncheckedFiguresIn([read.summary, ...changes.flatMap((c) => [c.after ?? "", c.reason])], text) };
}

/** The figures in the model's words that the document's text does not print, as it printed them, each once; years and small counts are not figures. */
export function uncheckedFiguresIn(texts: readonly string[], documentText: string): string[] {
  const nums = numbersIn(documentText);
  const out: string[] = [];
  for (const t of texts) {
    for (const raw of t.match(/-?\d[\d,.']*\d(?:\s?%)?|\b\d\b%/g) ?? []) {
      const token = raw.replace(/\s?%$/, "");
      const n = Number(token.replace(/[',]/g, ""));
      if (!Number.isFinite(n) || Math.abs(n) < 10 || (/^(19|20)\d\d$/.test(token) && !raw.endsWith("%"))) continue;
      if (!printed(n, nums) && !out.includes(raw.trim())) out.push(raw.trim());
    }
  }
  return out.slice(0, 40);
}

// ---------------------------------------------------------------------------
// Highlighting: the words that change

export type DiffToken = { op: "eq" | "del" | "ins"; text: string };
const DIFF_CAP = 400;

/** The words of `before` and `after` with the deleted and inserted ones marked, by longest common subsequence; past the cap, the whole of each. */
export function wordDiff(before: string, after: string): DiffToken[] {
  const a = before.split(/(\s+)/).filter((x) => x !== "");
  const b = after.split(/(\s+)/).filter((x) => x !== "");
  if (a.length > DIFF_CAP || b.length > DIFF_CAP) return [...(before ? [{ op: "del" as const, text: before }] : []), ...(after ? [{ op: "ins" as const, text: after }] : [])];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffToken[] = [];
  const push = (op: DiffToken["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("eq", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  // Whitespace that only sits between a deletion and an insertion reads better as unchanged.
  return out.filter((t) => t.text !== "");
}

// ---------------------------------------------------------------------------
// Applying what the person kept

export const DECISIONS = ["approve", "deny", "amend"] as const;
export type Decision = (typeof DECISIONS)[number];
export type Decided = { decision: Decision; amended: string | null };

export type Applied<T> = { thesis: T; kept: number; denied: number; lines: string[] };

/** Reads the review form: `d_<id>` is the decision, `a_<id>` the amended words; a change the form does not name is denied. */
export function decisionsFrom(form: { get(key: string): unknown }, changes: readonly ProposedChange[]): Record<string, Decided> {
  const out: Record<string, Decided> = {};
  for (const c of changes) {
    const d = String(form.get(`d_${c.id}`) ?? "deny");
    const decision: Decision = (DECISIONS as readonly string[]).includes(d) ? (d as Decision) : "deny";
    const amended = decision === "amend" ? String(form.get(`a_${c.id}`) ?? "").trim() || null : null;
    out[c.id] = { decision: decision === "amend" && amended === null ? "deny" : decision, amended };
  }
  return out;
}

/** The sentence an applied change leaves in the evidence entry. */
export function changeLine(c: ProposedChange, amended: string | null): string {
  const how = amended !== null ? ", amended" : "";
  if (c.target === "text") return c.before === null ? `a paragraph added${how}` : c.after === null ? `paragraph removed` : `${c.where.replace("Thesis, ", "")} revised${how}`;
  if (c.target === "pathway") return c.after === null ? "pathway removed" : c.before === null ? `pathway added${how}` : `pathway revised${how}`;
  if (c.target === "watch") return c.before === null ? `watch item added${how}` : c.after === null ? "watch item removed" : `watch item revised${how}`;
  return c.before === null ? `pillar "${c.name ?? "new"}" added${how}` : c.after === null ? `pillar "${c.name}" removed` : `pillar "${c.name}" revised${how}`;
}

/**
 * Applies the approved and amended changes to the thesis, in the order
 * proposed, then adds the evidence entry: the document, its date, what it
 * said, and what changed (or that nothing did). The valuation, the DCF and
 * everything else on the thesis stay as they are.
 */
export function applyProposal<T extends Thesis | MarketThesis>(thesis: T, proposal: Proposal, decisions: Record<string, Decided>, now: Date, today: string): Applied<T> {
  const iso = now.toISOString();
  let paragraphs = paragraphsOf(thesis.text);
  let pathway: string | null = "pathway" in thesis ? thesis.pathway : null;
  let watch = [...thesis.watch];
  let pillars: Pillar[] = [...thesis.pillars];
  const lines: string[] = [];
  let denied = 0;
  const removedParagraphs = new Set<number>();
  for (const c of proposal.changes) {
    const d = decisions[c.id] ?? { decision: "deny", amended: null };
    if (d.decision === "deny") {
      denied += 1;
      continue;
    }
    const after = d.decision === "amend" ? d.amended : c.after;
    if (c.target === "text") {
      if (c.before === null) {
        if (after) paragraphs.push(after);
      } else {
        const at = paragraphIndex(paragraphs.map((p, i) => (removedParagraphs.has(i) ? "" : p)), c.before);
        if (at < 0) {
          denied += 1;
          continue;
        }
        if (after === null) removedParagraphs.add(at);
        else paragraphs[at] = after;
      }
    } else if (c.target === "pathway") pathway = after;
    else if (c.target === "watch") {
      if (c.before === null) {
        if (after && !watch.some((w) => same(w, after))) watch.push(after);
      } else {
        const at = watch.findIndex((w) => same(w, c.before!));
        if (at < 0) {
          denied += 1;
          continue;
        }
        if (after === null) watch.splice(at, 1);
        else watch[at] = after;
      }
    } else if (c.before === null) {
      if (after && pillars.length < MAX_PILLARS) pillars.push({ id: `p${iso.slice(2, 10).replace(/-/g, "")}${pillars.length}${c.id}`, name: (c.name ?? "").trim() || after.split(/[.:]/)[0].slice(0, 80), text: after.slice(0, 600), test: c.test ?? null });
    } else {
      const at = pillars.findIndex((p) => p.id === c.pillarId);
      if (at < 0) {
        denied += 1;
        continue;
      }
      if (after === null) pillars.splice(at, 1);
      else pillars[at] = { ...pillars[at], text: after.slice(0, 600) };
    }
    lines.push(changeLine(c, d.decision === "amend" ? d.amended : null));
  }
  paragraphs = paragraphs.filter((_, i) => !removedParagraphs.has(i));
  watch = watch.map((w) => w.trim()).filter(Boolean).slice(0, MAX_WATCH);
  pillars = pillars.slice(0, MAX_PILLARS);
  const text = paragraphs.join("\n\n").slice(0, 6000);
  const changed: T = "pathway" in thesis ? ({ ...thesis, text, pathway, watch, pillars, updatedAt: iso } as T) : ({ ...thesis, text, watch, pillars, updatedAt: iso } as T);
  const changes = lines.length ? lines.join("; ").replace(/^./, (ch) => ch.toUpperCase()) : null;
  const next = withEvidence(changed, { at: proposal.date ?? today, source: proposal.source, kind: proposal.kind, summary: proposal.summary, changes, via: "claude" }, iso);
  return { thesis: next, kept: lines.length, denied, lines };
}
