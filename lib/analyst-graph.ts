/**
 * The analyst's agent: a LangChain tool-calling loop over a model the caller
 * supplies, with tools that only ever run the app's own pure functions on the
 * person's own data.
 *
 *   search_vault        BM25 over the methodology, studies, reports, records, approved lessons
 *   compute_figures     recipes over the ontology, validated and computed by the app (the plan is the analysis)
 *   methodology_checks  the person's rules on their book, each cited by section
 *   holding_fields      holdings as ontology fields
 *   edgar_facts         a company's filings, through the capability the caller passes (lib/edgar.ts on the server)
 *   propose_lesson      a standing instruction for the owner to approve; never applied on its own
 *
 * This file knows no key and makes no network call of its own: the model and
 * the EDGAR reader are injected, so the check runs it with a fake model and
 * the server (lib/analyst-agent.ts) runs it with the Anthropic chat client on
 * the person's key. Not for client components: it carries LangChain.
 */
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, anthropicPromptCachingMiddleware, createAgent, HumanMessage, tool, ToolMessage, type BaseMessage } from "langchain";
import { z } from "zod";

import {
  checksText,
  corpusOf,
  hitsText,
  holdingsText,
  MAX_FIGURES_PER_ANSWER,
  MAX_STEPS,
  runTasks,
  searchCorpus,
  systemPrompt,
  tasksText,
  traceStep,
  type Corpus,
  type Lesson,
  type PromptInput,
  type TraceStep,
} from "@/lib/analyst";
import type { Book } from "@/lib/holdings";
import type { Methodology } from "@/lib/methodology";
import type { Figure } from "@/lib/recipes";
import type { InputId, Setup } from "@/lib/setup";

export type Turn = { role: "person" | "analyst"; text: string };

export type AnalystInput = {
  methodology: Methodology;
  setup: Setup;
  book: Book | null;
  corpus: Omit<Corpus, "methodology" | "book" | "ccy" | "lessons">;
  lessons: Lesson[];
  today: string;
  inputs: readonly InputId[];
  history: Turn[];
  question: string;
  /** Reads a company's filings into text; null when the caller offers none (the check, or no network). */
  edgar: ((ticker: string) => Promise<string>) | null;
};

export type AnalystOutput = {
  text: string;
  trace: TraceStep[];
  /** Valid recipes computed during the answer, for the owner to keep. */
  figures: Figure[];
  lessons: { text: string; reason: string }[];
  /** Model calls made. */
  rounds: number;
};

export class AnalystLimitError extends Error {
  constructor() {
    super(`The analyst took more than ${MAX_STEPS} steps without an answer. Ask a narrower question.`);
    this.name = "AnalystLimitError";
  }
}

const EMPTY_BOOK: Book = { asOf: "1970-01-01", holdings: [], lookThrough: [], transactions: [], fx: { base: "USD", rates: {}, asOf: "1970-01-01", source: "none" } };

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p && typeof p === "object" && "text" in p && typeof (p as { text: unknown }).text === "string" ? (p as { text: string }).text : "")).join("");
  return "";
}

/** Runs one question through the agent and returns the answer with its trace. Throws AnalystLimitError at the step cap; anything else from the model is rethrown for the caller to word. */
export async function runAnalyst(model: BaseChatModel, input: AnalystInput): Promise<AnalystOutput> {
  const ccy = input.setup.baseCurrency;
  const book = input.book ?? EMPTY_BOOK;
  const docs = corpusOf({ ...input.corpus, methodology: input.methodology, book: input.book, lessons: input.lessons, ccy });
  const figures: Figure[] = [];
  const lessons: { text: string; reason: string }[] = [];
  const taskCtx = { methodology: input.methodology, book, today: input.today, inputs: input.inputs, ccy };

  const tools = [
    tool(async ({ query, k }) => hitsText(searchCorpus(docs, query, k)), {
      name: "search_vault",
      description: "Search what the owner's vault already knows: the methodology's rules, figures and classes, research studies by section, past reports, records about holdings, approved lessons. Returns the best matches with their text.",
      schema: z.object({ query: z.string().min(1).max(300), k: z.number().int().min(1).max(12).default(6) }),
    }),
    tool(
      async ({ figures: raw }) => {
        const rows = runTasks(raw, taskCtx);
        for (const r of rows) if (r.figure && figures.length < MAX_FIGURES_PER_ANSWER && !figures.some((f) => f.id === r.figure!.id)) figures.push(r.figure);
        return tasksText(rows);
      },
      {
        name: "compute_figures",
        description: "Compute up to six figures from recipes over the ontology (shape in the system prompt). The app validates each recipe and computes it the way the Overview does; an invalid recipe comes back with its issues to fix; a figure reading data no input supplies comes back as 'needs data'. Every number in your answer must come from here or from methodology_checks.",
        schema: z.object({ figures: z.array(z.record(z.string(), z.unknown())).min(1).max(6) }),
      },
    ),
    tool(async ({ ruleIds }) => (input.book ? checksText(input.methodology, book, input.today, input.inputs, ruleIds) : "No figures have arrived yet, so no rule can be tested. Say so."), {
      name: "methodology_checks",
      description: "Run the methodology's rules on the owner's book with their own recipes. Each line gives the status (pass, near, fail, yours to check, not testable yet), the section, the rule's words, the figure tested, the current value and the limit. Pass ruleIds to run some rules only.",
      schema: z.object({ ruleIds: z.array(z.string().max(40)).max(40).optional() }),
    }),
    tool(async ({ symbols, fields }) => (input.book ? holdingsText(book, { methodology: input.methodology, today: input.today, ccy }, symbols, fields) : "No figures have arrived yet; the book is empty."), {
      name: "holding_fields",
      description: "Read holdings as ontology fields (symbol, name, asset_class, value, price, quantity and the methodology class by default; name other holdings fields to read them, e.g. revenue_growth_pct, price_to_own_valuation_pct, option_days_to_expiry). Pass symbols to read some holdings only.",
      schema: z.object({ symbols: z.array(z.string().max(40)).max(40).optional(), fields: z.array(z.string().max(40)).max(12).optional() }),
    }),
    tool(
      async ({ ticker }) => {
        if (!input.edgar) return "Filings cannot be read here.";
        return input.edgar(ticker.toUpperCase());
      },
      {
        name: "edgar_facts",
        description: "Read a company's SEC filings (XBRL company facts: five calendar years and the trailing twelve months of revenue, income, cash flow, shares, dividends, balances) as a table. US-listed companies only; a foreign listing or a fund has none.",
        schema: z.object({ ticker: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/) }),
      },
    ),
    tool(
      async ({ lesson, reason }) => {
        if (lessons.length >= 3) return "Three lessons per answer at most; this one was not recorded.";
        lessons.push({ text: lesson, reason });
        return "Recorded as a proposal. The owner will see it and may approve it; until then it is not in force.";
      },
      {
        name: "propose_lesson",
        description: "Propose a standing instruction for the owner to approve, when their methodology does not say how to judge what they asked. One sentence, in their vocabulary, testable where possible. Never treat it as approved.",
        schema: z.object({ lesson: z.string().min(10).max(600), reason: z.string().min(1).max(600) }),
      },
    ),
  ];

  const prompt: PromptInput = { methodology: input.methodology, setup: input.setup, book: input.book, lessons: input.lessons, today: input.today, studies: input.corpus.research?.studies.length ?? 0, reports: input.corpus.reports?.reports.length ?? 0 };
  // On a Claude key each step of the loop reads the system prompt and the turns before it from Anthropic's cache; any other model is left as it was.
  const agent = createAgent({ model, tools, systemPrompt: systemPrompt(prompt), middleware: [anthropicPromptCachingMiddleware({ minMessagesToCache: 1, unsupportedModelBehavior: "ignore" })] });
  const history: BaseMessage[] = input.history.map((t) => (t.role === "person" ? new HumanMessage(t.text) : new AIMessage(t.text)));
  const messages: BaseMessage[] = [...history, new HumanMessage(input.question)];

  let result: { messages: BaseMessage[] };
  try {
    result = (await agent.withConfig({ recursionLimit: MAX_STEPS * 2 + 1 }).invoke({ messages })) as { messages: BaseMessage[] };
  } catch (e) {
    if (e instanceof Error && e.name === "GraphRecursionError") throw new AnalystLimitError();
    throw e;
  }

  const fresh = result.messages.slice(messages.length);
  const byCall = new Map<string, string>();
  for (const msg of fresh) if (ToolMessage.isInstance(msg) && msg.tool_call_id) byCall.set(msg.tool_call_id, contentText(msg.content));
  const trace: TraceStep[] = [];
  let rounds = 0;
  for (const msg of fresh) {
    if (!AIMessage.isInstance(msg)) continue;
    rounds += 1;
    for (const call of msg.tool_calls ?? []) trace.push(traceStep(call.name, call.args, byCall.get(call.id ?? "") ?? "(no result)"));
  }
  const last = fresh.filter((m) => AIMessage.isInstance(m)).at(-1);
  const text = last ? contentText(last.content).trim() : "";
  return { text: text || "The analyst returned no text. Ask again, or more narrowly.", trace: trace.slice(0, 16), figures, lessons, rounds };
}
