/**
 * The writer's words and shapes, pure: what the model is told when it writes
 * the sections of a study, the tool its answer must fit, and the parsing of
 * the answer. The model writes prose; every figure it may cite is in the facts
 * text, every verdict is in the checks, and anything beyond them is marked as
 * not verified. The call itself, on the person's key, is made in
 * lib/methodology-draft.ts alone.
 */
import { z } from "zod";

import type { Methodology } from "@/lib/methodology";
import { FIELDS, type FieldId } from "@/lib/ontology";
import { formatUnit, passWords } from "@/lib/recipes";
import { FAMILY_ABOUT, FAMILY_LABEL, SECTION_CHARS, SECTION_WORDS, readingWords, type Study, type TemplateSection } from "@/lib/research";
import { MODELS } from "@/lib/models";
import { READ_BEHIND } from "@/lib/investigate";

export const RESEARCH_MODEL = MODELS.standard;

export function researchInstructions(m: Methodology, study: Study): string {
  return `You write one part of a research study for a private investor, in the shape their methodology asks for. The methodology family is ${FAMILY_LABEL[study.family].toLowerCase()}: ${FAMILY_ABOUT[study.family]}

Rules you must keep:
- Your whole answer is one call to write_sections; write nothing outside it.
- Every number you write comes from the "Figures from the filings", the "Ratios the app derived", the "Classification Test", the "Methodology checks", "The holding in the book" or the "Market readings" given below, copied as given. You may add, subtract or divide two of those figures when a section needs it, showing the working once ("free cash flow 127,006m = 134,360m less 7,354m"); you estimate nothing and never bring a figure from memory. Where a figure is missing, say so in one sentence naming the source that would give it, and move on.
- General knowledge about the company, its market or its competitors is allowed where the section asks for it (what it sells, who competes, how a moat erodes). Keep it in its own paragraph and end that paragraph with "(general knowledge, not verified)" once; do not mark every sentence.
- The methodology's checks and the Classification Test are the verdict. Explain them; never contradict or soften them. State each check once, in the section it belongs to (classification, kill signals); elsewhere refer to it in a few words rather than restating limit and reading. Quote the rule's section (for example "3.1") when you refer to a rule.
- Write impersonally: no "I", no "we". Plain, terse prose. No encouragement, no exclamation marks, no advice to buy or sell; the conclusion is in the methodology's own terms.
- Markdown: short paragraphs, a bullet list or a small table where it reads better, no heading inside a section (the app adds the section title). Figures with thousands separators as given (302,969m), with the unit the first time.
- End every section with one line in bold beginning "What to take from this:" and the one or two conclusions the section supports.
- Each section at most ${SECTION_WORDS} words, tables included.
${READ_BEHIND} In the filings: what a change in a segment's line, a new disclosure, a dropped one or a change of wording shows.

The investor's methodology, "${m.name}": ${m.summary}`;
}

/** The one message: the facts, the checks, the question, and the sections to write with what each must establish. */
export function researchMessages(study: Study, sections: TemplateSection[]): unknown[] {
  const checks = study.verdict
    ? [`Class: ${study.verdict.classLabel ?? "none of the methodology's classes fits"}.`, ...study.verdict.checks.map((c) => `- ${c.section} ${c.text}: tests ${c.figure || "a figure"}; limit ${c.limit}; now ${c.actual ?? "no figure"}; ${c.status === "n/a" ? `not testable (${c.detail})` : c.status}`)].join("\n")
    : "No checks: the methodology has no rule the app can test on this subject.";
  const ratios = Object.entries(study.fundamentals)
    .filter(([k, v]) => v !== null && k in FIELDS)
    .map(([k, v]) => `- ${FIELDS[k as FieldId].label}: ${formatUnit(v as number, FIELDS[k as FieldId].type === "pct" ? "pct" : FIELDS[k as FieldId].type === "ratio" ? "ratio" : "number", study.holding?.currency ?? "USD")}`);
  const ratioNotes = study.fundamentalsNotes.map((n) => `- not derived: ${n}`);
  const classTests = (study.verdict?.classTests ?? []).map((t) => [`${t.label}: ${t.holds ? "holds" : "does not hold"} (${passWords(t)})`, ...t.required.map((x) => `  - required: ${x.label}: ${readingWords(x)}: ${x.pass ? "pass" : x.read ? "fail" : "no reading"}`), ...t.criteria.map((x) => `  - ${x.label}: ${readingWords(x)}: ${x.pass ? "pass" : x.read ? "fail" : "no reading"}`)].join("\n"));
  const holding = study.holding
    ? `Held: ${study.holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} units at ${study.holding.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${study.holding.currency} (the share price to use), ${study.holding.weightPct.toFixed(2)}% of net worth${study.holding.capPct !== null ? ` against a ${study.holding.capPct}% cap` : ""}${study.holding.classLabel ? `; class in the book: ${study.holding.classLabel}` : ""}. ${study.holding.ownValuation ? `The owner's valuation per share: low ${study.holding.ownValuation.low ?? "not set"}, base ${study.holding.ownValuation.base}, high ${study.holding.ownValuation.high ?? "not set"}, as of ${study.holding.ownValuation.asOf}${study.holding.ownValuation.basis ? ` (${study.holding.ownValuation.basis})` : ""}.` : "No owner's valuation is recorded."}`
    : "Not held in the book, so no share price is given; multiples that need a price are not computable here.";
  const written = Object.entries(study.written).map(([id, text]) => `### ${study.sections.find((s) => s.id === id)?.title ?? id}\n${text}`);
  // The groups of a study are written side by side, so each writer sees the rest of the table of contents and keeps off it.
  const asked = new Set(sections.map((s) => s.id));
  const others = study.sections.filter((s) => !asked.has(s.id) && !(s.id in study.written)).map((s) => `- ${s.title}`);
  const text = [
    `Subject: ${study.subject}${study.ticker ? ` (ticker ${study.ticker})` : ""}.`,
    study.question ? `The investor's question: ${study.question}` : "",
    "",
    "Figures from the filings:",
    study.facts ?? `No filings were read${study.factsNote ? `: ${study.factsNote}` : ""}. Every figure you would need is missing; say so where a section needs one.`,
    "",
    "Methodology checks:",
    checks,
    ratios.length || ratioNotes.length ? `\nRatios the app derived from the filings (trailing period; cite as given):\n${[...ratios, ...ratioNotes].join("\n")}` : "",
    classTests.length ? `\nClassification Test, as the app read it (the verdict; the prose explains it):\n${classTests.join("\n")}` : "",
    `\nThe holding in the book: ${holding}`,
    study.markets.length ? `\nMarket readings when the study started (as of ${study.markets[0].asOf}):\n${study.markets.map((r) => `- ${r.name}: ${r.value}`).join("\n")}` : "",
    written.length ? `\nSections already written (for continuity; do not repeat them):\n${written.join("\n\n")}` : "",
    others.length ? `\nOther sections of the study, written separately at the same time (do not cover their ground):\n${others.join("\n")}` : "",
    "",
    "Write these sections now, by calling write_sections once with one entry per section id:",
    ...sections.map((s) => `- ${s.id}: "${s.title}". ${s.guidance}${"amendments" in s && Array.isArray((s as { amendments?: string[] }).amendments) && (s as { amendments: string[] }).amendments.length ? `\n  From the methodology: ${(s as { amendments: string[] }).amendments.join(" / ")}` : ""}`),
  ]
    .filter((l) => l !== "")
    .join("\n");
  return [{ role: "user", content: [{ type: "text", text }] }];
}

export const writeSectionsSchema = z.object({
  sections: z.array(z.object({ id: z.string().min(1).max(40), markdown: z.string().min(1).max(SECTION_CHARS) })).min(1).max(30),
});

export function researchToolSchema() {
  const schema = z.toJSONSchema(writeSectionsSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** The whole request body, without the key. */
export function researchRequestBody(m: Methodology, study: Study, sections: TemplateSection[], model = RESEARCH_MODEL): Record<string, unknown> {
  return {
    model,
    max_tokens: 12000,
    system: researchInstructions(m, study),
    tools: [{ name: "write_sections", description: "Record the written sections of the study.", input_schema: researchToolSchema() }],
    // Current models reject a forced tool choice; the instructions ask for the one call instead.
    tool_choice: { type: "auto" },
    messages: researchMessages(study, sections),
  };
}

export type WriteParse =
  | { ok: true; written: Record<string, string>; missing: string[]; clipped: string[] }
  | { ok: false; reason: string; cut: boolean };

/** A section past the length the study keeps is cut at its last paragraph, else line, that fits, and says so. */
export const CLIPPED_NOTE = "*(Cut here to fit the study's length.)*";
export function clipSection(text: string, max = SECTION_CHARS): string {
  if (text.length <= max) return text;
  const room = max - CLIPPED_NOTE.length - 2;
  const head = text.slice(0, room);
  const at = [head.lastIndexOf("\n\n"), head.lastIndexOf("\n"), head.lastIndexOf(". ") + 1].find((i) => i > room / 2) ?? room;
  return `${head.slice(0, at).trimEnd()}\n\n${CLIPPED_NOTE}`;
}

/**
 * Reads the answer item by item: each asked section that came back as text is
 * kept (a long one cut to fit, said so on the section), the rest are named as
 * missing for Continue to write. Only an answer with no usable section is
 * refused, and `cut` says when the model ran out of room, so the caller can
 * ask for fewer sections at a time.
 */
/** A value the model sent as JSON text where the tool asks for the value itself, read back; anything else as it came. */
function unwrap(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * The sections in whichever shape the model sent them: the list the tool asks
 * for, that list written as JSON text, an object keyed by section id, or the
 * list at the top of the call. None of them is a reason to lose the writing.
 */
export function sectionEntries(input: unknown): unknown[] | null {
  const top = unwrap(input);
  if (Array.isArray(top)) return top;
  if (!top || typeof top !== "object") return null;
  const v = unwrap((top as { sections?: unknown }).sections);
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const inner = (v as { sections?: unknown }).sections;
    if (Array.isArray(unwrap(inner))) return unwrap(inner) as unknown[];
    return Object.entries(v as Record<string, unknown>).map(([id, m]) => ({ id, markdown: typeof m === "string" ? m : (m as { markdown?: unknown } | null)?.markdown }));
  }
  return null;
}

export function parseResearchResponse(body: unknown, asked: readonly string[]): WriteParse {
  const answer = body as { stop_reason?: string; content?: { type: string; name?: string; input?: unknown }[] } | null;
  const cut = answer?.stop_reason === "max_tokens";
  const call = answer?.content?.find((c) => c.type === "tool_use" && c.name === "write_sections");
  const want = new Set(asked);
  const entries = call ? sectionEntries(call.input) : null;
  const written: Record<string, string> = {};
  const clipped: string[] = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    const id = (e as { id?: unknown })?.id;
    const markdown = (e as { markdown?: unknown })?.markdown;
    if (typeof id !== "string" || !want.has(id) || id in written || typeof markdown !== "string" || !markdown.trim()) continue;
    const text = clipSection(markdown.trim());
    if (text !== markdown.trim()) clipped.push(id);
    written[id] = text;
  }
  const missing = asked.filter((id) => !(id in written));
  if (missing.length === asked.length) {
    const reason = cut
      ? "the answer ran past the length the writer is given"
      : !call
        ? "the writer answered without calling write_sections"
        : !Array.isArray(entries)
          ? "the answer held no list of sections"
          : "none of the sections asked for came back as text";
    return { ok: false, reason, cut };
  }
  return { ok: true, written, missing, clipped };
}
