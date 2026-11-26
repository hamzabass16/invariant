/**
 * The drafter's words and shapes, pure: the instructions the model is
 * given to turn a methodology document (or a profile and a book's outline)
 * into recipes over the ontology, the tool schema its answer must fit, the
 * request body, and the parsing of the answer back into a draft. No network
 * and nothing server-only, so the synthetic loop (scripts/synth-loop.ts) and
 * the checks can build and read the same requests the app sends. The call
 * itself, with a person's key, lives in lib/methodology-draft.ts alone.
 */
import { z } from "zod";

import type { Book } from "@/lib/holdings";
import type { ModelProvider } from "@/lib/model-provider";
import { draftSchema, STARTER_FIGURES, type Methodology } from "@/lib/methodology";
import { describeOntology } from "@/lib/ontology";
import { DIRECT_UPLOAD_MAX_BYTES } from "@/lib/reach";
import { INPUTS, PROFILES, type Setup } from "@/lib/setup";
import { MODELS } from "@/lib/models";

export const DEFAULT_MODEL = MODELS.best;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
/** The most a document may weigh once it is in the person's Drive (`DIRECT_UPLOAD_MAX_BYTES`), the largest the model is sent. */
export { DIRECT_UPLOAD_MAX_BYTES as MAX_DRIVE_DOCUMENT_BYTES } from "@/lib/reach";
export const ACCEPTED = { "application/pdf": "pdf", "text/plain": "text", "text/markdown": "text" } as const;

export { keyLooksValid } from "@/lib/model-provider";

export type DraftRequest = {
  /** The person's own provider (lib/model-provider.ts), read from their vault for this call. */
  provider: ModelProvider;
  setup: Setup;
  today: string;
  /** Read from a document. */
  document?: { name: string; mime: keyof typeof ACCEPTED; bytes: Uint8Array };
  /** Suggest or revise from the book's shape (never its names). */
  book?: Book | null;
  /** Revise this draft... */
  current?: Methodology | null;
  /** ...as asked here. */
  instruction?: string;
};

export type Draft = z.infer<typeof draftSchema>;

/** The book in outline for the drafter: shapes and shares, no names, no amounts. */
export function bookOutline(book: Book): string {
  const total = book.holdings.reduce((s, h) => s + Math.abs(h.value), 0) || 1;
  const by = new Map<string, number>();
  for (const h of book.holdings) by.set(h.assetClass, (by.get(h.assetClass) ?? 0) + Math.abs(h.value));
  const classes = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((v / total) * 100).toFixed(0)}%`);
  const themes = [...new Set(book.holdings.flatMap((h) => h.themes))].slice(0, 12);
  const kinds = [...new Set(book.transactions.map((t) => t.kind))];
  const dates = book.transactions.map((t) => t.date).sort();
  return [
    `${book.holdings.length} holdings across ${new Set(book.holdings.map((h) => h.account)).size} accounts; base currency ${book.fx.base}; currencies ${[...new Set(book.holdings.map((h) => h.currency))].join(", ")}.`,
    `By asset class: ${classes.join(", ")}.`,
    themes.length ? `Themes tagged: ${themes.join(", ")}.` : "No themes tagged.",
    book.lookThrough.length ? `${book.lookThrough.length} companies visible inside private funds.` : "",
    kinds.length ? `Transactions on record: ${kinds.join(", ")}${dates.length ? `, from ${dates[0]} to ${dates[dates.length - 1]}` : ""}.` : "No transactions on record.",
  ]
    .filter(Boolean)
    .join("\n");
}

const EXAMPLES = [
  STARTER_FIGURES["net-worth"],
  STARTER_FIGURES["largest-holding"],
  {
    id: "dividends-by-month",
    label: "Dividend income by month",
    about: "Dividends received, by month, over the last two years.",
    unit: "money",
    expr: { op: "measure", of: { measure: "sum", over: "transactions", field: "amount", where: [{ field: "kind", is: "eq", value: "dividend" }], window: { kind: "last_months", months: 24 } } },
    by: "month",
    view: "bars",
  },
  {
    id: "dividend-growth",
    label: "Dividend growth",
    about: "Dividends in the last twelve months against the twelve before.",
    unit: "pct",
    expr: {
      op: "growth",
      now: { measure: "sum", over: "transactions", field: "amount", where: [{ field: "kind", is: "eq", value: "dividend" }], window: { kind: "ttm" } },
      before: { measure: "sum", over: "transactions", field: "amount", where: [{ field: "kind", is: "eq", value: "dividend" }], window: { kind: "prior_ttm" } },
    },
    view: "tile",
  },
  {
    id: "weight-by-holding",
    label: "Weight by holding",
    about: "Each holding's share of net worth.",
    unit: "pct",
    expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "owner_value", where: [{ field: "asset_class", is: "not_in", value: ["cash", "deposit", "option"] }] }, den: { measure: "sum", over: "holdings", field: "owner_value", whole: true } },
    by: "symbol",
    view: "table",
  },
];

export function instructions(setup: Setup, today: string, mode: "document" | "suggest" | "revise") {
  const who = `The owner is a ${PROFILES[setup.profile].label.toLowerCase()} whose figures come from: ${setup.inputs.map((i) => INPUTS[i].label).join(", ")}. Today is ${today}. Base currency ${setup.baseCurrency}.`;
  const task =
    mode === "document"
      ? "You read an investor's methodology document and record how a portfolio app should apply it, by calling record_methodology once."
      : mode === "suggest"
        ? "The owner has no written methodology. Propose a modest starting one from their profile, inputs and the outline of their book, by calling record_methodology once. They will approve, trim or edit it; nothing takes effect until they confirm. Every rule is a guideline (severity guideline) with section 'S1', 'S2'... and text that reads as a suggestion they can keep or drop. Prefer figures the book can show today; include at most two that need data no input supplies yet, only if central to how such an owner invests. name: a short name such as 'Suggested methodology'. adopted: null."
        : "Revise the owner's current draft methodology as they ask, by calling record_methodology once with the whole revised methodology. Keep everything they did not ask to change, ids included.";
  return `${task} Your whole answer is that one call to record_methodology; write nothing outside it.

${who}

The app computes every figure itself, deterministically, from recipes over the ontology below. You write the recipes; you never compute values. A recipe that reads a field no input supplies is allowed: the app then says what it needs instead of a number. Never invent a limit the document does not give.

How to write a methodology:
- figures: each has an id, label, unit and expr (measure | ratio | growth | difference | scaled over measures). A tile has no "by" and shows one number; bars, line, donut or table need a "by" grouping. Shares of the total are a ratio whose denominator has whole: true. Growth compares a ttm window with prior_ttm. Money fields are already in the base currency.
- classes: how the owner sorts holdings (criteria on holding fields; the first class whose test holds wins). A class whose document says "at least five of these seven thresholds" lists the seven as criteria with minimum: 5; one that counts a share of what could be measured ("71% of the thresholds the filings give") uses minimumShare: 71 instead, and a criterion with no reading is then left out of the count; a gate that must hold whatever the count (growth above 20%, an asset class) goes in required. Without a minimum, every criterion must hold. A criterion that applies only under a condition ("FCF conversion, unless loans receivable exceed equity") carries given: the filters that must hold for it to be measured; one the document lets pass another way ("interest cover above 15x, or net cash") carries or: alternatives, each a filter with its own given, read only when the criterion itself does not hold. Measurement bases the document states (which debt, which tax rate, which period) are chosen by the field: read each field's description and pick the one whose basis matches. Figures can then filter on field "class" with a class id, or group by "class". Only when the document sorts holdings into named kinds.
- rules: every rule the document states, with its section (its numbering, or the nearest heading), its own words shortened, and severity breach only for a hard limit it says must not be crossed. A level the owner wants to be told about (an alert, a monitor, a trigger) is a rule with severity watch and a test. A rule the app can measure gets test: { figure, is, limit }, where the figure is one of yours (add one if needed; a grouped figure is tested for every group, a tile for the whole). A rule the app cannot measure gets test: null; it is kept as the owner's to check.
- returns, drawdowns, volatility and beta are series statistics (expr op series) over the account's value series or a benchmark, never measures over holdings. A top-N figure (the five largest holdings together) is a measure with top: N.
- dashboard.headline: up to six tile figure ids, most important first. dashboard.sections: in the order the document cares about them: { kind: "figures", label, figures } for groups of your figures, { kind: "panel", id, view } for the built-in panels, each with from: the document section that asks for it when one does. dashboard.themes: themes the document tracks by name.
- a macro or market section (volatility regimes, yields, the curve, gold and silver, the dollar, oil) becomes figures over markets (see Market indicators below) with watch rules at the levels it names, in a figures section of its own named as the document names it.
- gaps: what the document asks for that no field, object, measure, window or grouping here can express (an indicator the feed lacks, a figure of a kind the ontology has no name for, a rule on data no object carries). One entry per ask, with its section, the ask in the document's words shortened, and what would be needed; the owner reads these and the app grows. Never a figure of the owner's portfolio. Empty when everything landed. Do not list a rule you recorded with test: null; those are the owner's to check, not gaps.
- evaluation: only when the document says how its own success should be proved (beat an index, a class that should lead, price that should follow earnings over so many years): one test per proof, of the kinds listed in the schema, with its section and claim in the document's words. Omit it when the document states none.
- practices: the practices the document names, each of which keeps a page: decision_log (a written record or a vote behind trades and decisions), trade_log (it reviews the trades themselves: a journal, win rate, holding periods), trade_check (a check before a trade: where new money may go, what a purchase must meet first), todo_list (duties per holding with a date or a clock: a vote, a record, a review within so many days). Only what the document names; an empty list keeps those pages off until the owner adds them.
- summary: two or three plain sentences on how this owner invests. Not investment advice; no encouragement.

Ontology:
${describeOntology()}

Example figures (JSON):
${JSON.stringify(EXAMPLES.map(({ ...f }) => ("needs" in f ? { ...f, needs: undefined } : f)))}`;
}

export function toolSchema() {
  const schema = z.toJSONSchema(draftSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export type DraftMode = "document" | "suggest" | "revise";

export function draftMode(req: Omit<DraftRequest, "provider">): DraftMode {
  return req.document ? "document" : req.current ? "revise" : "suggest";
}

/** The messages a draft request sends; throws a plain Error when the document is too large. */
export function draftMessages(req: Omit<DraftRequest, "provider">): unknown[] {
  const content: unknown[] = [];
  if (req.document) {
    if (req.document.bytes.length > DIRECT_UPLOAD_MAX_BYTES) throw new Error("document too large");
    content.push(
      ACCEPTED[req.document.mime] === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(req.document.bytes).toString("base64") }, title: req.document.name }
        : { type: "text", text: `Document: ${req.document.name}\n\n${new TextDecoder().decode(req.document.bytes).slice(0, 400_000)}` },
    );
    content.push({ type: "text", text: "Record this methodology." });
  } else {
    if (req.book) content.push({ type: "text", text: `Outline of the book:\n${bookOutline(req.book)}` });
    if (req.current) {
      const body = Object.fromEntries(Object.entries(req.current).filter(([k]) => k !== "source" && k !== "origin"));
      content.push({ type: "text", text: `Current draft:\n${JSON.stringify(body)}` });
    }
    content.push({ type: "text", text: req.current ? `Change asked for: ${(req.instruction ?? "").slice(0, 2000)}` : "Propose a starting methodology." });
  }
  return [{ role: "user", content }];
}

/** The whole request body for the Claude API, without the key. */
export function draftRequestBody(req: Omit<DraftRequest, "provider">, model = DEFAULT_MODEL): Record<string, unknown> {
  return {
    model,
    max_tokens: 16000,
    system: instructions(req.setup, req.today, draftMode(req)),
    tools: [{ name: "record_methodology", description: "Record the methodology as the app will apply it.", input_schema: toolSchema() }],
    // Current models reject a forced tool choice; the instructions ask for the one call instead.
    tool_choice: { type: "auto" },
    messages: draftMessages(req),
  };
}

/** A failed read keeps what was wrong: each problem in words for the model, and its place in the record (codes and paths alone, for a log). */
export type DraftParse =
  | { ok: true; draft: Draft }
  | { ok: false; issues: number; called: boolean; callId: string | null; problems: string[]; where: string[] };

/** At most this many problems are told back to the model. */
export const MAX_DRAFT_PROBLEMS = 20;

/** Reads the API's answer: the one tool call, validated; never a half-read methodology. */
export function parseDraftResponse(body: unknown): DraftParse {
  const content = (body as { content?: { type: string; name?: string; id?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_methodology");
  const parsed = draftSchema.safeParse(call?.input);
  if (parsed.success) return { ok: true, draft: parsed.data };
  const issues = parsed.error.issues;
  return {
    ok: false,
    issues: issues.length,
    called: !!call,
    callId: typeof call?.id === "string" ? call.id : null,
    problems: issues.slice(0, MAX_DRAFT_PROBLEMS).map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`),
    where: issues.slice(0, MAX_DRAFT_PROBLEMS).map((i) => `${i.code}@${i.path.map((x) => (typeof x === "number" ? "#" : String(x))).join(".") || "root"}`),
  };
}

/**
 * The draft asked once more (Hamza, 20 Nov 2026: a 60-page methodology came
 * back with two references that did not hold, and the whole reading was
 * refused): the same conversation, the model's own record, and what the app
 * found wrong with it, as the tool's error; it records the whole methodology
 * again. Null when there was no call to answer.
 */
export function draftRepairBody(body: Record<string, unknown>, answer: { content?: unknown[] }, parsed: DraftParse): Record<string, unknown> | null {
  if (parsed.ok || !parsed.callId || !Array.isArray(answer.content)) return null;
  const said = [
    "The record did not hold together, so the app could not apply it:",
    ...parsed.problems.map((p) => `- ${p}`),
    ...(parsed.issues > parsed.problems.length ? [`- and ${parsed.issues - parsed.problems.length} more of the same kind.`] : []),
    "Call record_methodology once more with the whole methodology, mending these and changing nothing else. Every id a rule, the headline, a section or a filter names must be one you record.",
  ].join("\n");
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return {
    ...body,
    messages: [...messages, { role: "assistant", content: answer.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: parsed.callId, is_error: true, content: said }] }],
  };
}
