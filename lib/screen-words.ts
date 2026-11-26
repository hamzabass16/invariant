import { z } from "zod";

import { FIELDS, FUNDAMENTAL_FIELDS } from "@/lib/ontology";
import { classSchema, filterLabel, type ClassDef, type Filter } from "@/lib/recipes";
import { SECTORS } from "@/lib/sectors";
import { MODELS } from "@/lib/models";

/**
 * A screen asked in words (Hamza, 23 Oct 2026, after Rallies.AI's Vibe
 * Screener): "cash-rich software with margins over 30%" is compiled once, on
 * the AI, into filters on the ontology's fields, kept with
 * the words, and run by the app on the same companies the classes screen
 * (lib/screener.ts `screenWith`), each filter shown before the results. The
 * model never sees a company or ranks one; what the filters cannot say is
 * named. Pure.
 */

export const MAX_WORD_SCREENS = 6;
export const MAX_SCREEN_FILTERS = 6;
export const SCREEN_WORDS_MODEL = MODELS.fast;

export const SCREEN_FIELDS = ["sector", ...FUNDAMENTAL_FIELDS] as const;

export const wordScreenSchema = z.object({
  id: z.string().min(1).max(16),
  words: z.string().min(3).max(300),
  filters: z
    .array(z.object({ field: z.enum(SCREEN_FIELDS), is: z.enum(["gte", "lte", "in"]), value: z.union([z.number(), z.array(z.enum(SECTORS)).min(1).max(SECTORS.length)]) }))
    .min(1)
    .max(MAX_SCREEN_FILTERS),
  /** What the words ask that no field reads, said so. */
  cannot: z.array(z.string().max(200)).max(4).default([]),
  at: z.string(),
});
export type WordScreen = z.infer<typeof wordScreenSchema>;

const compiledSchema = z.object({
  filters: z
    .array(z.object({ field: z.string().max(40), is: z.enum(["gte", "lte", "in"]), value: z.union([z.number(), z.array(z.string().max(40)).max(11)]).describe("A number in the field's unit (30 for 30%); for sector with is 'in', the sectors' names.") }))
    .max(MAX_SCREEN_FILTERS),
  cannot: z.array(z.string().max(200)).max(4).optional().describe("What the words ask that none of the fields reads (a product, a theme, news, a forecast), one line each."),
});

const fieldLines = () => FUNDAMENTAL_FIELDS.map((f) => `- ${f}: ${(FIELDS as Record<string, { label: string }>)[f]?.label ?? f}`).join("\n");

export function screenWordsRequestBody(words: string, model = SCREEN_WORDS_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(compiledSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 600,
    system: `You turn a stock screen asked in words into filters a portfolio app runs itself on the S&P 500 and the Nasdaq-100. You never name, pick or rank a company; you only translate the words into filters on the fields below.

Fields:
- sector, is "in", a list of: ${SECTORS.join(", ")}
${fieldLines()}

Rules:
- Each filter is a field at or above (gte) or at or below (lte) a number in the field's own unit: 30 for 30%, 25 for a P/E of 25.
- Words that mean a level ("cash-rich", "cheap", "fast-growing", "no debt") become the plainest level a reader would agree with, and nothing more.
- At most ${MAX_SCREEN_FILTERS} filters. What none of the fields can read (a product, a theme, a customer, news, a forecast) goes in cannot, one line each, never forced onto a field.
- Your whole answer is one call to record_screen.`,
    tools: [{ name: "record_screen", description: "Record the filters the app will run.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: words }] }],
  };
}

export type ScreenWordsParse = { ok: true; filters: WordScreen["filters"]; cannot: string[]; dropped: string[] } | { ok: false; reason: string };

/** The model's filters, checked: a field the app does not read, or a sector not on the list, is dropped and named; none left is a sentence. */
export function parseScreenWordsResponse(body: unknown): ScreenWordsParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_screen");
  if (!call) return { ok: false, reason: "The model answered in words instead of filters. Try other words." };
  const p = compiledSchema.safeParse(call.input);
  if (!p.success) return { ok: false, reason: "What came back was not a set of filters. Try other words." };
  const filters: WordScreen["filters"] = [];
  const dropped: string[] = [];
  for (const f of p.data.filters) {
    if (f.field === "sector") {
      const list = (Array.isArray(f.value) ? f.value : []).map((s) => SECTORS.find((x) => x.toLowerCase() === s.toLowerCase())).filter((s): s is (typeof SECTORS)[number] => !!s);
      if (list.length) filters.push({ field: "sector", is: "in", value: [...new Set(list)] });
      else dropped.push(`a sector not on the list (${Array.isArray(f.value) ? f.value.join(", ") : String(f.value)})`);
      continue;
    }
    if (!(FUNDAMENTAL_FIELDS as readonly string[]).includes(f.field) || typeof f.value !== "number" || f.is === "in") {
      dropped.push(`"${f.field}", a figure the app does not read`);
      continue;
    }
    filters.push({ field: f.field as (typeof FUNDAMENTAL_FIELDS)[number], is: f.is, value: f.value });
  }
  if (!filters.length) return { ok: false, reason: p.data.cannot?.length ? `No field the filings carry reads that: ${p.data.cannot.join("; ").replace(/\.$/, "")}.` : "No field the filings carry reads that. Name a figure: a margin, growth, a multiple, the debt." };
  return { ok: true, filters, cannot: (p.data.cannot ?? []).slice(0, 4), dropped };
}

/** The screen as a class the recipes run: every filter must hold. */
export function screenClass(s: Pick<WordScreen, "id" | "words" | "filters">): ClassDef {
  return classSchema.parse({ id: `words-${s.id}`, label: s.words.slice(0, 60), criteria: s.filters.map((f) => ({ field: f.field, is: f.is, value: f.value })) });
}

/** Each filter in words, for above the results. */
export const screenFilterWords = (s: Pick<WordScreen, "filters">): string[] => s.filters.map((f) => filterLabel(f as Filter));

/** A new screen's id, unique among those kept. */
export const wordScreenId = (taken: readonly string[]): string => {
  let id = "";
  do id = `s${Math.random().toString(36).slice(2, 9)}`;
  while (taken.includes(id));
  return id;
};

/** The demo's one screen, compiled ahead and kept in the code, since the demo calls no model. */
export const DEMO_WORD_SCREEN: WordScreen = {
  id: "sdemo",
  words: "Growing over 10% a year with operating margins above 25% and little debt",
  filters: [
    { field: "revenue_growth_pct", is: "gte", value: 10 },
    { field: "operating_margin_pct", is: "gte", value: 25 },
    { field: "net_debt_to_ebitda", is: "lte", value: 1 },
  ],
  cannot: [],
  at: "2026-10-09T18:00:00.000Z",
};
