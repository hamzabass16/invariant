/**
 * The analyst: questions about a person's own portfolio, answered from their
 * methodology, their figures and what is in their vault, with every number
 * computed by the app.
 *
 * Built the way a deterministic analyst tool is built: the model plans, the
 * app computes. A question becomes tasks; each task is a recipe over the
 * ontology (lib/recipes.ts), validated against figureSchema and computed by
 * computeFigure, the same way the Overview computes its tiles. The model never
 * does arithmetic: a figure it wants comes back from compute_figures or it does
 * not exist. A verdict comes from methodology_checks, which runs the person's
 * own rules with their own recipes and cites their sections. What the vault
 * already knows (rules, figures, studies, reports, records, approved lessons)
 * is searched with a small BM25 index, not recalled from memory.
 *
 * Where a person's methodology does not yet say how to answer a question, the
 * analyst proposes a lesson: a standing instruction in words, kept in their
 * vault and used only once they approve it. A figure the analyst computed can
 * be kept as one of the person's own figures (lib/preferences.ts), so an output
 * becomes an input on the Overview. Nothing adapts itself.
 *
 * Pure: the agent (lib/analyst-graph.ts), the screen and the check share it.
 */
import { z } from "zod";

import type { Book } from "@/lib/holdings";
import { computeFigure, contextFor, evaluate, inputLabel, testedAs, type Methodology } from "@/lib/methodology";
import { describeOntology, FIELD_IDS, FIELDS, fieldValue, type FieldId } from "@/lib/ontology";
import type { Records } from "@/lib/preferences";
import { exprWords, figureSchema, formatUnit, needsWords, type Figure, type Result } from "@/lib/recipes";
import type { ReportsFile } from "@/lib/report";
import { criteriaWords, familyOf, FAMILY_LABEL, type Family, type ResearchFile } from "@/lib/research";
import type { InputId, Setup } from "@/lib/setup";
import { MODELS } from "@/lib/models";

// ---------------------------------------------------------------------------
// Limits and the file in the vault

export const ANALYST_MODEL = MODELS.standard;
export const MAX_THREADS = 20;
export const MAX_MESSAGES = 40;
export const MAX_TRACE = 16;
export const MAX_LESSONS = 30;
export const MAX_FIGURES_PER_ANSWER = 8;
/** Tool rounds per question. Each is one model call and one tool run; the recursion limit is twice this plus the answer. */
export const MAX_STEPS = 8;
export const MAX_QUESTION_CHARS = 1500;
/** How many earlier turns of a thread the model sees. */
export const HISTORY_TURNS = 10;

const id12 = z.string().regex(/^[a-f0-9]{12}$/);

export const traceStepSchema = z.object({
  tool: z.string().max(40),
  /** What was asked of the tool, in words or trimmed JSON. */
  summary: z.string().max(500),
  /** The first part of what came back. */
  result: z.string().max(800),
});
export type TraceStep = z.infer<typeof traceStepSchema>;

export const messageSchema = z.object({
  role: z.enum(["person", "analyst"]),
  text: z.string().max(16000),
  at: z.string(),
  trace: z.array(traceStepSchema).max(MAX_TRACE).default([]),
  /** Recipes the analyst computed for this answer, offered to keep as the person's own figures. */
  figures: z.array(figureSchema).max(MAX_FIGURES_PER_ANSWER).default([]),
});
export type Message = z.infer<typeof messageSchema>;

export const threadSchema = z.object({
  id: id12,
  title: z.string().min(1).max(120),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(messageSchema).max(MAX_MESSAGES),
});
export type Thread = z.infer<typeof threadSchema>;

export const lessonSchema = z.object({
  id: id12,
  /** The standing instruction, in words the person can read and the model can follow. */
  text: z.string().min(1).max(600),
  /** Why the analyst proposed it: what the methodology did not say. */
  reason: z.string().max(600),
  status: z.enum(["proposed", "approved"]),
  threadId: id12.nullable(),
  at: z.string(),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const analystFileSchema = z.object({
  version: z.literal(1),
  threads: z.array(threadSchema).max(MAX_THREADS),
  lessons: z.array(lessonSchema).max(MAX_LESSONS),
  updated: z.string(),
});
export type AnalystFile = z.infer<typeof analystFileSchema>;
export const EMPTY_ANALYST: AnalystFile = { version: 1, threads: [], lessons: [], updated: "" };

// ---------------------------------------------------------------------------
// Threads and lessons

export function titleOf(question: string): string {
  const t = question.replace(/\s+/g, " ").trim();
  return (t.length > 72 ? `${t.slice(0, 71).trimEnd()}…` : t) || "Question";
}

export function newThread(id: string, question: string, now: string): Thread {
  return threadSchema.parse({ id, title: titleOf(question), createdAt: now, updatedAt: now, messages: [] });
}

/** Adds a thread at the top. Throws a sentence at the cap, so nothing is dropped quietly. */
export function withThread(file: AnalystFile, thread: Thread, now: string): AnalystFile {
  if (file.threads.length >= MAX_THREADS) throw new Error(`${MAX_THREADS} conversations at most. Remove one first.`);
  return { ...file, threads: [thread, ...file.threads], updated: now };
}

export function withoutThread(file: AnalystFile, id: string, now: string): AnalystFile {
  return { ...file, threads: file.threads.filter((t) => t.id !== id), updated: now };
}

/** Appends messages to a thread and moves it to the top. Throws a sentence at the cap. */
export function withMessages(file: AnalystFile, threadId: string, messages: Message[], now: string): AnalystFile {
  const thread = file.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error("That conversation is no longer in your vault.");
  if (thread.messages.length + messages.length > MAX_MESSAGES) throw new Error(`${MAX_MESSAGES} messages in one conversation at most. Start a new one.`);
  const next: Thread = { ...thread, messages: [...thread.messages, ...messages.map((m) => messageSchema.parse(m))], updatedAt: now };
  return { ...file, threads: [next, ...file.threads.filter((t) => t.id !== threadId)], updated: now };
}

/** A lesson proposed by the analyst; one with the same words is not proposed twice. */
export function proposeLesson(file: AnalystFile, lesson: Omit<Lesson, "status">, now: string): AnalystFile {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (file.lessons.some((l) => same(l.text, lesson.text))) return file;
  if (file.lessons.length >= MAX_LESSONS) throw new Error(`${MAX_LESSONS} lessons at most. Discard one first.`);
  return { ...file, lessons: [...file.lessons, lessonSchema.parse({ ...lesson, status: "proposed" })], updated: now };
}

export function approveLesson(file: AnalystFile, id: string, now: string): AnalystFile {
  return { ...file, lessons: file.lessons.map((l) => (l.id === id ? { ...l, status: "approved" as const } : l)), updated: now };
}

export function withoutLesson(file: AnalystFile, id: string, now: string): AnalystFile {
  return { ...file, lessons: file.lessons.filter((l) => l.id !== id), updated: now };
}

export const approvedLessons = (file: AnalystFile) => file.lessons.filter((l) => l.status === "approved");

// ---------------------------------------------------------------------------
// The corpus: what the vault already knows, as searchable documents

export type DocKind = "rule" | "figure" | "class" | "study" | "report" | "record" | "lesson";
export type Doc = { id: string; kind: DocKind; title: string; text: string };

export type Corpus = { methodology: Methodology | null; research: ResearchFile | null; reports: ReportsFile | null; records: Records | null; book: Book | null; lessons: Lesson[]; ccy: string };

/** Every document the analyst may cite: the methodology element by element, studies by section, reports by section, records by holding, approved lessons. */
export function corpusOf(c: Corpus): Doc[] {
  const out: Doc[] = [];
  const m = c.methodology;
  if (m) {
    for (const r of m.rules) out.push({ id: `rule:${r.id}`, kind: "rule", title: `Rule ${r.section}`, text: `${r.text} (${r.severity}; ${testedAs(r, m, c.ccy)})` });
    for (const f of m.figures) out.push({ id: `figure:${f.id}`, kind: "figure", title: `Figure ${f.label}`, text: `${f.about ?? ""} ${exprWords(f.expr)}${f.by ? ` by ${f.by}` : ""} (id ${f.id}, unit ${f.unit})`.trim() });
    for (const k of m.classes) out.push({ id: `class:${k.id}`, kind: "class", title: `Class ${k.label}`, text: `${k.about ?? ""} ${criteriaWords(k)} (id ${k.id})`.trim() });
  }
  for (const s of c.research?.studies ?? []) {
    for (const sec of s.sections) {
      const text = s.written[sec.id];
      if (text) out.push({ id: `study:${s.id}:${sec.id}`, kind: "study", title: `${s.subject}: ${sec.title}`, text: text.slice(0, 4000) });
    }
    if (s.verdict) out.push({ id: `study:${s.id}:verdict`, kind: "study", title: `${s.subject}: methodology checks`, text: [`Class: ${s.verdict.classLabel ?? "none"}`, ...s.verdict.checks.map((k) => `${k.section} ${k.text}: ${k.status}${k.actual ? ` (now ${k.actual}, limit ${k.limit})` : ""}`)].join(". ") });
  }
  for (const r of c.reports?.reports ?? []) {
    for (const sec of r.sections) out.push({ id: `report:${r.id}:${sec.heading}`, kind: "report", title: `Report ${r.asOf}: ${sec.heading}`, text: sec.lines.map((l) => `${l.label}: ${l.value}${l.detail ? ` (${l.detail})` : ""}`).join(". ") });
  }
  for (const h of c.book?.holdings ?? []) {
    const rec = h.record ?? c.records?.bySymbol[h.symbol];
    if (!rec) continue;
    const parts = [rec.ownValuation ? `own valuation base ${rec.ownValuation.base}${rec.ownValuation.low !== null || rec.ownValuation.high !== null ? ` (range ${rec.ownValuation.low ?? "?"} to ${rec.ownValuation.high ?? "?"})` : ""} as of ${rec.ownValuation.asOf}${rec.ownValuation.basis ? `, ${rec.ownValuation.basis}` : ""}` : "", rec.since ? `held since ${rec.since}` : "", rec.note ?? ""].filter(Boolean);
    if (parts.length) out.push({ id: `record:${h.symbol}`, kind: "record", title: `Record ${h.symbol} ${h.name}`, text: parts.join(". ") });
  }
  for (const l of c.lessons) if (l.status === "approved") out.push({ id: `lesson:${l.id}`, kind: "lesson", title: "Approved lesson", text: `${l.text} (${l.reason})` });
  return out;
}

// ---------------------------------------------------------------------------
// Search: BM25 over the corpus, no model and no network

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "be", "by", "as", "at", "it", "its", "my", "our", "with", "what", "which", "how", "does", "do", "this", "that", "than", "from", "not", "no", "any", "per"]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%.$-]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export type Hit = { doc: Doc; score: number };

/** Okapi BM25 (k1 1.2, b 0.75) over title and text. Deterministic; ties break by corpus order. */
export function searchCorpus(docs: Doc[], query: string, k = 6): Hit[] {
  const q = [...new Set(tokens(query))];
  if (!q.length || !docs.length) return [];
  const bodies = docs.map((d) => tokens(`${d.title} ${d.title} ${d.text}`));
  const avg = bodies.reduce((s, b) => s + b.length, 0) / bodies.length || 1;
  const df = new Map<string, number>();
  for (const b of bodies) for (const t of new Set(b)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const k1 = 1.2;
  const bb = 0.75;
  const hits: Hit[] = docs.map((doc, i) => {
    const body = bodies[i];
    const tf = new Map<string, number>();
    for (const t of body) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - bb + (bb * body.length) / avg)));
    }
    return { doc, score };
  });
  return hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

export function hitsText(hits: Hit[]): string {
  if (!hits.length) return "Nothing in the vault matches. Say so, and answer from the methodology's text and the figures the tools return.";
  return hits.map((h, i) => `${i + 1}. [${h.doc.kind}] ${h.doc.title}\n${h.doc.text.slice(0, 1200)}`).join("\n\n");
}

// ---------------------------------------------------------------------------
// Tasks: the model's plan, compiled to recipes and computed by the app

export type TaskRow = { figure: Figure | null; result: Result | null; text: string; issue: string | null };

/** What the person can supply for a figure: the methodology's context (classes applied, research laid on). */
export type TaskContext = { methodology: Methodology | null; book: Book; today: string; inputs: readonly InputId[]; ccy: string };

export function resultWords(r: Result, f: Figure, ccy: string): string {
  if (r.kind === "scalar") {
    if (r.value === null) return r.needs.length ? `needs data: ${needsWords(r.needs, inputLabel)}` : "no value (nothing matched)";
    return formatUnit(r.value, f.unit, ccy);
  }
  const shown = r.points.slice(0, 15);
  const rows = shown.map((p) => `${p.label}: ${p.value === null ? "n/a" : formatUnit(p.value, f.unit, ccy)}`);
  const more = r.points.length > shown.length ? ` … and ${r.points.length - shown.length} more` : "";
  const needs = r.needs.length ? ` Needs data: ${needsWords(r.needs, inputLabel)}.` : "";
  return `${rows.join("; ")}${more}${needs}`;
}

/**
 * Validates each recipe against figureSchema and computes the valid ones with
 * the same function as the Overview. An invalid recipe returns its issues as
 * text for the model to repair; a recipe reading a field no input supplies
 * returns what it needs, never a zero. Never throws.
 */
export function runTasks(raw: unknown[], c: TaskContext): TaskRow[] {
  const ctx = contextFor(c.book, c.today, c.methodology);
  return raw.slice(0, 6).map((r, i) => {
    const parsed = figureSchema.safeParse(r);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 4).map((x) => `${x.path.join(".") || "recipe"}: ${x.message}`).join("; ");
      return { figure: null, result: null, text: `Recipe ${i + 1} is not valid: ${issues}. Fix it and call compute_figures again.`, issue: issues };
    }
    const f = parsed.data;
    const result = computeFigure(f, ctx, c.inputs);
    return { figure: f, result, text: `${f.label} (${exprWords(f.expr)}${f.by ? ` by ${f.by}` : ""}, ${f.unit}): ${resultWords(result, f, c.ccy)}`, issue: null };
  });
}

export const tasksText = (rows: TaskRow[]) => rows.map((r) => r.text).join("\n");

/** The methodology's rules run on the book, each with its section, its figure and the result. */
export function checksText(m: Methodology, book: Book, today: string, inputs: readonly InputId[], ruleIds?: string[]): string {
  const want = ruleIds?.length ? new Set(ruleIds) : null;
  const findings = evaluate(m, book, today, inputs).filter((f) => !want || want.has(f.rule.id));
  if (!findings.length) return want ? `No rule has an id in ${[...want].join(", ")}. The rules are: ${m.rules.map((r) => `${r.id} (${r.section})`).join(", ")}.` : "The methodology has no rules.";
  return findings
    .map((f) => {
      const status = f.status === "manual" ? "yours to check (the app cannot measure it)" : f.status === "n/a" ? "not testable yet" : f.status;
      return `[${status}] ${f.rule.section} ${f.rule.text} (${f.rule.severity}, id ${f.rule.id})${f.figure ? ` · tests ${f.figure.label}` : ""}${f.actual !== null ? ` · now ${f.actual}` : ""}${f.limit !== null ? ` · limit ${f.limit}` : ""}${f.detail ? ` · ${f.detail}` : ""}`;
    })
    .join("\n");
}

const DEFAULT_FIELDS: FieldId[] = ["symbol", "name", "asset_class", "value", "price", "quantity", "class"];

/** Holdings as rows of ontology fields, read the same way recipes read them. Unknown fields and symbols are named, never silently dropped. */
export function holdingsText(book: Book, c: { methodology: Methodology | null; today: string; ccy: string }, symbols?: string[], fields?: string[]): string {
  const ctx = contextFor(book, c.today, c.methodology);
  const wantSym = symbols?.length ? new Set(symbols.map((s) => s.toUpperCase())) : null;
  const rows = book.holdings.filter((h) => !wantSym || wantSym.has(h.symbol.toUpperCase())).slice(0, 40);
  const bad = (fields ?? []).filter((f) => !(FIELD_IDS as string[]).includes(f) || FIELDS[f as FieldId].object !== "holdings");
  const ids = ((fields ?? []).filter((f) => !bad.includes(f)) as FieldId[]).slice(0, 12);
  const use = ids.length ? ids : DEFAULT_FIELDS;
  const lines: string[] = [];
  if (bad.length) lines.push(`Not holdings fields in the ontology: ${bad.join(", ")}.`);
  if (wantSym) {
    const missing = [...wantSym].filter((s) => !book.holdings.some((h) => h.symbol.toUpperCase() === s));
    if (missing.length) lines.push(`Not in the book: ${missing.join(", ")}.`);
  }
  if (!rows.length) lines.push("No holdings matched.");
  for (const h of rows) {
    const cells = use.map((id) => {
      const v = fieldValue(id, { object: "holdings", row: h }, ctx);
      const d = FIELDS[id];
      const shown = v === null ? "n/a" : typeof v === "number" ? (d.type === "money" ? formatUnit(v, "money", c.ccy) : d.type === "pct" ? formatUnit(v, "pct", c.ccy) : String(Math.round(v * 1000) / 1000)) : Array.isArray(v) ? v.join("|") : String(v);
      return `${id}=${shown}`;
    });
    lines.push(cells.join(" · "));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The system prompt: the methodology, the ontology, the family's way of working, the approved lessons

const FAMILY_STEPS: Record<Family, string[]> = {
  fundamentals: [
    "Where a holding sits: holding_fields for its class criteria fields, then methodology_checks; name the class and each test with its figure.",
    "Valuation: the person's own valuation is a record (price_to_own_valuation_pct, own_valuation_age_days); never invent a fair value. If a study of the ticker exists, search_vault finds its valuation section.",
    "Growth and quality: the fundamentals fields on the holding (revenue_growth_pct, roic_pct, fcf_margin_pct, …) came from a study of its filings; edgar_facts reads the filings again when the question needs the raw series.",
    "Sizing and caps: compute each holding's share of the total (a ratio of value over value with whole on the denominator, by symbol or class) with compute_figures and set it against the rule's limit from methodology_checks.",
  ],
  options: [
    "Exposure: compute_figures over holdings with asset_class = option, grouped by option_underlying, for option_delta_value and assignment_cash.",
    "Expiry and events: option_days_to_expiry per contract with holding_fields; the rules on delta, days and premium come from methodology_checks.",
    "Premium earned: transactions of kind option_premium (or the methodology's own figure), windowed ttm or last_months.",
  ],
  quant: [
    "Returns and risk: series statistics (return, volatility, max_drawdown, beta vs a benchmark) over the periods the methodology names; a benchmark the book does not carry returns needs data, which you report.",
    "Signal rules: methodology_checks runs them; where a rule is yours to check, say which figure would make it testable.",
  ],
  macro: [
    "Allocation: compute_figures with value, or the share of the total (value over whole value), grouped by asset_class, country or currency; set each against the policy's bands from methodology_checks.",
    "Income and duration: bond_yield_pct, bond_maturity and deposit_rate_pct per holding with holding_fields.",
    "Look-through: measures over lookthrough for what the funds hold, grouped by lt_sector or lt_country.",
  ],
};

/** How a recipe is written, for the analyst's prompt and for the MCP server's describe_recipes. */
export const RECIPE_SHAPE: readonly string[] = [
  "A recipe for compute_figures is a JSON object: { id, label, unit (money|pct|ratio|count|days|number), view (tile for one number; bars, line, donut or table with a grouping), by? (a grouping), expr }. expr is one of:",
  '  { "op": "measure", "of": M } · { "op": "ratio", "num": M, "den": M } · { "op": "growth", "now": M, "before": M } · { "op": "difference", "a": M, "b": M } · { "op": "scaled", "of": M, "by": number } · { "op": "series", "stat", "of": "nav" or a benchmark symbol, "vs"?: benchmark for beta, "period" }',
  '  where M is { "measure": sum|count|avg|min|max, "over": holdings|transactions|lookthrough, "field"?: a field of that object, "where"?: [{ "field", "is", "value" }], "window"?: { "kind", "months"? } (transactions only), "whole"?: true, "top"?: N, "abs"?: true }.',
  'Example: {"id":"weight-by-symbol","label":"Weight by holding","unit":"pct","view":"bars","by":"symbol","expr":{"op":"ratio","num":{"measure":"sum","over":"holdings","field":"value"},"den":{"measure":"sum","over":"holdings","field":"value","whole":true}}}',
];

export type PromptInput = { methodology: Methodology; setup: Setup; book: Book | null; lessons: Lesson[]; today: string; studies: number; reports: number };

export function systemPrompt(p: PromptInput): string {
  const m = p.methodology;
  const fam = familyOf(m);
  const approved = p.lessons.filter((l) => l.status === "approved");
  const book = p.book;
  const bookLine = book ? `The book has ${book.holdings.length} holdings as of ${book.asOf}, ${book.transactions.length} transactions, ${book.lookThrough.length} look-through rows, and ${book.series?.nav?.length ? `a value series of ${book.series.nav.length} points` : "no value series"}; benchmarks carried: ${Object.keys(book.series?.benchmarks ?? {}).join(", ") || "none"}.` : "No figures have arrived yet: every recipe will return what it needs. Say so plainly.";
  return [
    `You are the analyst inside Invariant for ${p.setup.ownerName}, who invests by the methodology "${m.name}" (${FAMILY_LABEL[fam.family]}; ${m.summary}). Today is ${p.today}; the base currency is ${p.setup.baseCurrency}.`,
    "",
    "How you work, without exception:",
    "1. The plan is the analysis. Decide which figures answer the question, write each as a recipe over the ontology below, and call compute_figures. The app computes them deterministically; you never do arithmetic, estimate, extrapolate or recall a number. A number that did not come back from a tool does not appear in your answer.",
    "2. Verdicts come from the methodology. Call methodology_checks for any question about a rule, a limit, a breach or a class; quote the rule's section (3.1, D.1(c)) and its own words. A rule the app cannot measure is theirs to check: say so, never call it passing.",
    "3. What the vault knows comes from search_vault: the methodology element by element, research studies, past reports, records and approved lessons. Cite what you used by its title.",
    "4. When a recipe comes back invalid, repair it from the issues and call again. When a figure returns 'needs data', report which input would supply it; never fill the gap.",
    "5. When the methodology does not say how to judge what was asked, answer with what the figures show, say that the methodology is silent, and call propose_lesson with a one-sentence standing instruction the owner could approve. Never apply a lesson that is not in the approved list below.",
    "6. Write plainly and briefly: the answer first, then the figures that support it, each named as the tool returned it, then the rule cited. No encouragement, no exclamation marks, no advice to buy or sell; the owner decides. Markdown is fine (short paragraphs, bullets, a small table); no headings.",
    "",
    `Ways of working for ${FAMILY_LABEL[fam.family].toLowerCase()} questions:`,
    ...FAMILY_STEPS[fam.family].map((s) => `- ${s}`),
    "",
    bookLine,
    `The vault holds ${p.studies} research ${p.studies === 1 ? "study" : "studies"} and ${p.reports} past ${p.reports === 1 ? "report" : "reports"}.`,
    "",
    "The methodology's rules (id · section · text · severity · what it tests):",
    ...m.rules.map((r) => `- ${r.id} · ${r.section} · ${r.text} · ${r.severity} · ${testedAs(r, m, p.setup.baseCurrency)}`),
    "",
    "The methodology's figures (id · label · recipe · unit), reusable in compute_figures as they are:",
    ...m.figures.map((f) => `- ${f.id} · ${f.label} · ${exprWords(f.expr)}${f.by ? ` by ${f.by}` : ""} · ${f.unit}`),
    "",
    m.classes.length ? "The methodology's classes (id · label · criteria; a holding is in the first class whose criteria all hold):" : "The methodology has no classes.",
    ...m.classes.map((k) => `- ${k.id} · ${k.label} · ${criteriaWords(k)}`),
    "",
    approved.length ? "Approved lessons (standing instructions from the owner):" : "Approved lessons: none yet.",
    ...approved.map((l) => `- ${l.text}`),
    "",
    ...RECIPE_SHAPE,
    "",
    "The ontology:",
    describeOntology(),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Traces

export function traceStep(tool: string, args: unknown, result: string): TraceStep {
  let summary: string;
  try {
    summary = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    summary = String(args);
  }
  return traceStepSchema.parse({ tool, summary: summary.length > 500 ? `${summary.slice(0, 497)}…` : summary, result: result.length > 800 ? `${result.slice(0, 797)}…` : result });
}

export const TOOL_LABEL: Record<string, string> = {
  search_vault: "Searched the vault",
  compute_figures: "Computed figures",
  methodology_checks: "Ran the methodology's checks",
  holding_fields: "Read holdings",
  edgar_facts: "Read SEC filings",
  propose_lesson: "Proposed a lesson",
};

export const toolLabel = (tool: string) => TOOL_LABEL[tool] ?? tool;

// ---------------------------------------------------------------------------
// The demo: one conversation whose answers are the tools' own output, no model

export const DEMO_THREAD_ID = "0000000000d0";

/**
 * A fictional conversation for the demo, built from the sample methodology and
 * book by the same functions the tools run: the checks and two recipes. The
 * answers are the tool results laid out as the analyst would cite them; no
 * model is called and no number is written by hand.
 */
export function demoThread(m: Methodology, book: Book, today: string, inputs: readonly InputId[], ccy: string): Thread {
  const at = `${today}T09:00:00.000Z`;
  const checks = checksText(m, book, today, inputs);
  const tripped = checks.split("\n").filter((l) => /^\[(fail|near)\]/.test(l));
  const answer1 = [
    tripped.length ? `${tripped.length} ${tripped.length === 1 ? "rule is" : "rules are"} at or past a limit today; the rest pass, or are yours to check.` : "No rule is at or past its limit today.",
    "",
    ...checks.split("\n").map((l) => `- ${l}`),
    "",
    "Each line ran the rule's own recipe on the book; the section is the methodology's.",
  ].join("\n");
  const weight = figureSchema.parse({ id: "weight-by-symbol", label: "Weight by holding", unit: "pct", view: "bars", by: "symbol", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "value" }, den: { measure: "sum", over: "holdings", field: "value", whole: true } } });
  const top = figureSchema.parse({ id: "top-five-share", label: "Share of the top five holdings", unit: "pct", view: "tile", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "value", top: 5 }, den: { measure: "sum", over: "holdings", field: "value" } } });
  const rows = runTasks([weight, top], { methodology: m, book, today, inputs, ccy });
  const answer2 = ["Computed from the book as it stands:", "", ...rows.map((r) => `- ${r.text}`), "", "Both are recipes over the ontology; either can be kept as one of your own figures."].join("\n");
  return threadSchema.parse({
    id: DEMO_THREAD_ID,
    title: "Which rules does the book trip today?",
    createdAt: at,
    updatedAt: at,
    messages: [
      { role: "person", text: "Which rules does the book trip today?", at, trace: [], figures: [] },
      { role: "analyst", text: answer1, at, trace: [traceStep("methodology_checks", {}, checks)], figures: [] },
      { role: "person", text: "And how concentrated is it?", at, trace: [], figures: [] },
      { role: "analyst", text: answer2, at, trace: [traceStep("compute_figures", { figures: [weight, top] }, tasksText(rows))], figures: rows.map((r) => r.figure).filter((f): f is Figure => !!f) },
    ],
  });
}
