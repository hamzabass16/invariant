/**
 * The person's model provider, pure. Every model call the app makes (reading a
 * methodology, writing a study, the analyst, the report's commentary, the
 * property watch) runs on a provider the person chose and pays for:
 *
 *   - "anthropic": their own Claude API key;
 *   - "openai_compatible": any endpoint that speaks the OpenAI chat
 *     completions API (Groq, OpenRouter, Together, Fireworks, a vLLM or Ollama
 *     server reachable from the internet), so an open-source model can do the
 *     work on their own account.
 *
 * The deployment holds no model key. This module knows no network: it says
 * what a provider is, whether one looks usable, and translates the one
 * request shape the app writes (the Anthropic Messages shape, built by the
 * pure prompt modules) to and from the OpenAI shape, so every parser in the
 * app reads one shape whatever the provider. The calls themselves are made in
 * lib/methodology-draft.ts (fetch) and lib/analyst-agent.ts (LangChain) alone.
 */
import { z } from "zod";

export const PROVIDER_KINDS = ["anthropic", "openai_compatible"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_LABEL: Record<ProviderKind, string> = { anthropic: "Claude (Anthropic)", openai_compatible: "OpenAI-compatible endpoint" };

export const providerSchema = z.object({
  kind: z.enum(PROVIDER_KINDS),
  /** The key, kept in the vault and read for a call. Null is allowed for an endpoint that needs none. */
  apiKey: z.string().max(400).nullable(),
  /** The endpoint's base URL (ending in /v1 for most providers); null for Anthropic. */
  baseUrl: z.string().max(300).nullable(),
  /** The model name; null means the app's default for that call (Anthropic only). */
  model: z.string().max(120).nullable(),
  /** The person's meter on the Invariant key (lib/model-meter.ts), set by lib/hosted-model.ts alone and never kept. */
  meter: z.string().max(64).nullable().optional(),
  /** That person's monthly cap in US dollars (their plan's, lib/beta-run.ts `capFor`), set with the meter and never kept; none means the deployment's own. */
  cap: z.number().nonnegative().nullable().optional(),
});
export type ModelProvider = z.infer<typeof providerSchema>;

/** The vault's secrets file. `anthropicKey` is the older field; a provider set beside it wins. */
export const secretsSchema = z.object({
  anthropicKey: z.string().max(200).nullable(),
  provider: providerSchema.nullable().optional().default(null),
});
export type Secrets = z.infer<typeof secretsSchema>;

/** The provider the secrets name, or null when there is none to call. */
export function modelProviderOf(secrets: Secrets | null | undefined): ModelProvider | null {
  if (!secrets) return null;
  if (secrets.provider && providerLooksValid(secrets.provider)) return secrets.provider;
  if (secrets.anthropicKey && keyLooksValid(secrets.anthropicKey)) return { kind: "anthropic", apiKey: secrets.anthropicKey, baseUrl: null, model: null };
  return null;
}

/** The shape of a Claude API key, checked before it is kept; never its value. */
export function keyLooksValid(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

/** Whether a provider can be called at all: a Claude key of the right shape, or an https endpoint with a model named. */
export function providerLooksValid(p: ModelProvider): boolean {
  if (p.kind === "anthropic") return !!p.apiKey && keyLooksValid(p.apiKey);
  return !!p.baseUrl && /^https:\/\/[^\s/]+/.test(p.baseUrl) && !!p.model && p.model.trim().length > 0 && !/\s/.test(p.model);
}

/** Why a provider as typed cannot be kept; null when it can. */
export function providerProblem(p: ModelProvider): string | null {
  if (p.kind === "anthropic") return p.apiKey && keyLooksValid(p.apiKey) ? null : "That does not look like a Claude API key. It starts with sk-ant-.";
  if (!p.baseUrl || !/^https:\/\/[^\s/]+/.test(p.baseUrl)) return "The endpoint needs an https address, such as https://api.groq.com/openai/v1.";
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(p.baseUrl)) return "The app runs on a server, so an address on your own computer cannot be reached. Give it a public address.";
  if (!p.model || !p.model.trim() || /\s/.test(p.model)) return "Name the model exactly as the endpoint lists it, such as llama-3.3-70b-versatile.";
  return null;
}

/** What a screen may say about the provider: the kind, the host and the model, never the key. */
export type ProviderSummary = { kind: ProviderKind; label: string; host: string | null; model: string | null; hasKey: boolean };

export function summarizeProvider(p: ModelProvider | null): ProviderSummary | null {
  if (!p) return null;
  let host: string | null = null;
  if (p.baseUrl) {
    try {
      host = new URL(p.baseUrl).host;
    } catch {
      host = null;
    }
  }
  return { kind: p.kind, label: PROVIDER_LABEL[p.kind], host, model: p.model, hasKey: !!p.apiKey };
}

/** The model a call uses: the provider's own when set, else the app's default for that call. */
export function modelFor(p: ModelProvider, fallback: string): string {
  return p.model?.trim() || fallback;
}

/**
 * Whether the provider can run a request that needs more than text and tools:
 * a PDF document, or the web search the property watch uses. Only Claude can,
 * and the message says what to do instead.
 */
export function providerCannot(p: ModelProvider, need: "pdf" | "web_search"): string | null {
  if (p.kind === "anthropic") return null;
  return need === "pdf" ? "An OpenAI-compatible endpoint cannot read a PDF here. Save the document as plain text or Markdown and upload that, or switch the provider to Claude." : "This searches the web through the model, which only the Claude provider can do here. Switch the provider to Claude under Your model on Setup to use it.";
}

/** Removes the key's value from a sentence bound for a log or a screen. */
export function scrubKey(text: string, p: ModelProvider | null): string {
  let out = text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]").replace(/\b(Bearer|x-api-key)\s+\S+/gi, "$1 [key]");
  if (p?.apiKey && p.apiKey.length >= 8) out = out.split(p.apiKey).join("[key]");
  return out;
}

// ---------------------------------------------------------------------------
// One request shape, two wire formats

type Block = { type: string; [k: string]: unknown };
type Message = { role: "user" | "assistant"; content: string | Block[] };

/** The Anthropic Messages body every pure prompt module writes. */
export type ModelRequest = {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: Message[];
  tools?: { name: string; description?: string; input_schema?: Record<string, unknown>; type?: string; [k: string]: unknown }[];
  tool_choice?: { type: string };
  [k: string]: unknown;
};

/** The Anthropic-shaped answer every parser in the app reads. */
/** `usage` is the provider's token count, in the Messages shape (input_tokens, output_tokens), read for the agents' cost estimates. */
export type ModelResponse = { content: Block[]; stop_reason: string | null; model?: string; usage?: Record<string, unknown> };

/**
 * A turn the API paused (stop_reason "pause_turn": a long run of web
 * searches stopped before the answer) is sent back as the assistant's own
 * turn so the model carries on from where it stood, at most PAUSE_TURNS
 * times; the parts are joined into one answer, so every parser reads the
 * call it was asked for (Hamza's GOOGL brief, 29 Oct 2026, came back in
 * words).
 */
export const PAUSE_TURNS = 3;
export const pausedTurn = (r: ModelResponse) => r.stop_reason === "pause_turn";

export function continuedRequest(body: ModelRequest, paused: ModelResponse): ModelRequest {
  const messages: Message[] = Array.isArray(body.messages) ? body.messages : [];
  return { ...body, messages: [...messages, { role: "assistant" as const, content: paused.content }] };
}

function addCounts(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!a) return b;
  if (!b) return a;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const was = out[k];
    out[k] = typeof v === "number" && typeof was === "number" ? was + v : v && typeof v === "object" && was && typeof was === "object" ? addCounts(was as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}

/** The parts of a paused answer as one: every block in order, the last stop, the usage added up. */
export function joinedResponses(a: ModelResponse, b: ModelResponse): ModelResponse {
  return { ...b, content: [...a.content, ...b.content], usage: addCounts(a.usage, b.usage) };
}

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * The request as sent to Anthropic, with its prompt cached (Hamza, 24 Oct
 * 2026: Anthropic wrote that his key's cache hit rate was low): a breakpoint on
 * the system prompt, so the tools and the instructions every call of a kind
 * shares (each newsletter of a run, each company's sift, a retry) are read
 * back at a tenth of the price for five minutes; and, for a request carrying
 * a conversation, the automatic breakpoint on its last turn, so the next turn
 * reads the history. A request already marked is sent as written; one with no
 * system and one message gains nothing and is left alone, since a breakpoint
 * after unique text only pays the write premium. Only Anthropic reads it; an
 * OpenAI-compatible request is translated from the unmarked body.
 */
export function withPromptCache(body: ModelRequest): Record<string, unknown> {
  const marked = (v: unknown) => !!v && typeof v === "object" && "cache_control" in v;
  const system = body.system as unknown;
  const blocks = Array.isArray(system) ? (system as Block[]) : null;
  if (marked(body) || blocks?.some(marked) || body.messages.some((m) => Array.isArray(m.content) && m.content.some(marked))) return body;
  const hasSystem = (typeof system === "string" && !!system.trim()) || !!blocks?.length;
  if (!hasSystem && body.messages.length < 2) return body;
  const out: Record<string, unknown> = { ...body };
  if (typeof system === "string" && system.trim()) out.system = [{ type: "text", text: system, cache_control: EPHEMERAL }];
  else if (blocks?.length) out.system = blocks.map((b, i) => (i === blocks.length - 1 ? { ...b, cache_control: EPHEMERAL } : b));
  if (body.messages.length > 1) out.cache_control = EPHEMERAL;
  return out;
}

// ---------------------------------------------------------------------------
// The advisor (Hamza, 4 Nov 2026: Opus directs, Sonnet and Haiku work). On a
// Claude key a Sonnet step may consult Opus on a hard call inside the same
// request, through Anthropic's advisor tool (beta); the executor decides when,
// told by the step's own words. Never on an open model, never forced.

/** The advisor tool's type and the beta that carries it. */
export const ADVISOR_TOOL_TYPE = "advisor_20260301";
export const ADVISOR_BETA = "advisor-tool-2026-03-01";
/** Consults at most, per request: the advisor bills at the stronger model's rates. */
export const ADVISOR_USES = 2;

/** Whether a request carries the advisor tool. */
export const hasAdvisor = (body: ModelRequest): boolean => (body.tools ?? []).some((t) => t.type === ADVISOR_TOOL_TYPE);

/**
 * The request with the advisor tool on it and a line saying when to ask, on a
 * Claude key whose executor is below the advisor; unchanged otherwise (an open
 * model, the advisor's own model, a request that already carries it).
 */
export function withAdvisor(body: ModelRequest, provider: ModelProvider, advisor: string, when: string): ModelRequest {
  if (provider.kind !== "anthropic" || hasAdvisor(body) || !body.model || body.model === advisor) return body;
  const line = `\n\nAn advisor on a stronger model is available as the advisor tool. ${when.trim()} Never ask it for routine items, and never more than twice.`;
  const system = typeof body.system === "string" ? `${body.system}${line}` : body.system;
  return { ...body, system, tools: [...(body.tools ?? []), { type: ADVISOR_TOOL_TYPE, name: "advisor", model: advisor, max_uses: ADVISOR_USES }] };
}

/** The request without the advisor, for a retry when the API refuses the pairing or the beta. */
export function withoutAdvisor(body: ModelRequest): ModelRequest {
  if (!hasAdvisor(body)) return body;
  const tools = (body.tools ?? []).filter((t) => t.type !== ADVISOR_TOOL_TYPE);
  const system = typeof body.system === "string" ? body.system.replace(/\n\nAn advisor on a stronger model is available as the advisor tool\.[^]*?never more than twice\./, "") : body.system;
  const { tools: _all, tool_choice, ...rest } = body;
  void _all;
  return tools.length ? { ...rest, system, tools, ...(tool_choice ? { tool_choice } : {}) } : { ...rest, system };
}

/** A content block turned into the text an OpenAI message carries; a document block is refused, not dropped. */
function blockText(b: Block): string {
  if (b.type === "text") return String(b.text ?? "");
  if (b.type === "document") throw new Error("document block");
  if (b.type === "tool_result") return typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
  return "";
}

/**
 * The same request for an OpenAI-compatible endpoint: system as the first
 * message, tools as functions, tool_choice auto, max_tokens kept. Throws a
 * plain Error on a document block (a PDF), which those endpoints cannot take
 * in this shape; the caller turns it into a sentence.
 */
export function toOpenAIRequest(body: ModelRequest, model: string): Record<string, unknown> {
  const messages: Record<string, unknown>[] = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  for (const m of body.messages) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map(blockText).join("\n");
      const calls = m.content.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id ?? ""), type: "function", function: { name: String(b.name ?? ""), arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    const results = m.content.filter((b) => b.type === "tool_result");
    for (const r of results) messages.push({ role: "tool", tool_call_id: String(r.tool_use_id ?? ""), content: blockText(r) });
    const rest = m.content.filter((b) => b.type !== "tool_result").map(blockText).filter(Boolean);
    if (rest.length) messages.push({ role: "user", content: rest.join("\n\n") });
  }
  const out: Record<string, unknown> = { model, messages };
  if (body.max_tokens) out.max_tokens = body.max_tokens;
  const tools = (body.tools ?? []).filter((t) => !t.type || t.type === "custom");
  if (tools.length) {
    out.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
    out.tool_choice = "auto";
  }
  return out;
}

/**
 * An OpenAI chat completion read back into the Anthropic shape: text becomes a
 * text block, each tool call a tool_use block with its arguments parsed. A
 * call whose arguments are not JSON becomes a text block carrying them, so the
 * parsers say "no tool call" rather than reading half an answer.
 */
export function fromOpenAIResponse(body: unknown): ModelResponse {
  const b = body as { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]; model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
  const choice = b?.choices?.[0];
  const content: Block[] = [];
  const text = choice?.message?.content;
  if (typeof text === "string" && text.trim()) content.push({ type: "text", text });
  for (const c of choice?.message?.tool_calls ?? []) {
    const name = c.function?.name ?? "";
    const raw = c.function?.arguments ?? "";
    try {
      content.push({ type: "tool_use", id: c.id ?? "", name, input: raw.trim() ? JSON.parse(raw) : {} });
    } catch {
      content.push({ type: "text", text: `[${name} called with arguments that were not JSON] ${raw.slice(0, 400)}` });
    }
  }
  const finish = choice?.finish_reason ?? null;
  const usage = b?.usage ? { input_tokens: b.usage.prompt_tokens ?? 0, output_tokens: b.usage.completion_tokens ?? 0 } : undefined;
  return { content, stop_reason: finish === "tool_calls" ? "tool_use" : finish === "length" ? "max_tokens" : finish ? "end_turn" : null, model: b?.model, ...(usage ? { usage } : {}) };
}

/** The endpoint's chat completions URL from its base, whether the base ends in /v1 or not. */
export function completionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}
