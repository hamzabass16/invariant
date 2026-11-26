import "server-only";

import { DEFAULT_MODEL, draftMode, draftRepairBody, draftRequestBody, MAX_DRIVE_DOCUMENT_BYTES, parseDraftResponse, type Draft, type DraftRequest } from "@/lib/draft-prompt";
import { newestModelsFor } from "@/lib/model-catalog";
import { currentModel } from "@/lib/models";
import { ADVISOR_BETA, completionsUrl, continuedRequest, fromOpenAIResponse, hasAdvisor, joinedResponses, modelFor, PAUSE_TURNS, pausedTurn, providerCannot, providerLooksValid, scrubKey, toOpenAIRequest, withoutAdvisor, withPromptCache, type ModelProvider, type ModelRequest, type ModelResponse } from "@/lib/model-provider";
import { answerCut, emptyAnswerWords, parseAnswerResponse, parseProseResponse, PROSE_MODEL, proseRequestBody, questionRequestBody, type Report } from "@/lib/report";
import { afterCall, beforeCall } from "@/lib/agent-ledger";
import { costOf, NO_USAGE, PRICES, tierAbove, usageOf, withLessons, type CallTag } from "@/lib/agents";
import { SyncError } from "@/lib/sync-error";

export { ACCEPTED, MAX_DOCUMENT_BYTES, MAX_DRIVE_DOCUMENT_BYTES, bookOutline, keyLooksValid, type Draft, type DraftRequest } from "@/lib/draft-prompt";

/**
 * Stage 2: writes a person's methodology as recipes over the ontology, three
 * ways:
 *
 *   - from the document they invest by (every rule recorded with its section;
 *     the figures the document implies; the dashboard it asks for);
 *   - suggested, when they have no document: a modest starting methodology
 *     from their profile, their inputs and the shape of their book, every rule a
 *     guideline for them to keep or drop;
 *   - revised: the current draft plus what they asked to change.
 *
 * One call to the AI provider (lib/model-provider.ts): their
 * Claude API key, or an OpenAI-compatible endpoint of their choosing, kept in
 * their vault, read for this call, never logged. The deployment holds no model
 * key and the demo never calls one. The words, the tool schema and the parsing
 * are pure (lib/draft-prompt.ts); this file is the one place the call is
 * made, for every model call the app makes outside the analyst: the report's
 * commentary (narrateReport), the research writer (writeStudy) and the
 * property watch (callModel, from lib/property-watch-run.ts). An answer that
 * does not fit its schema throws a sentence, never a half-read methodology.
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const NO_PROVIDER = "The AI is not set up on this deployment yet.";

export async function draftMethodology(req: DraftRequest): Promise<Draft> {
  if (!providerLooksValid(req.provider)) throw new SyncError(NO_PROVIDER, "no usable provider");
  const mode = draftMode(req);
  if (req.document && req.document.bytes.length > MAX_DRIVE_DOCUMENT_BYTES) throw new SyncError("That document is over 20 MB. Save it as a PDF without images, or as plain text.", "document too large");
  if (req.document && req.document.mime === "application/pdf") {
    const cannot = providerCannot(req.provider, "pdf");
    if (cannot) throw new SyncError(cannot, "pdf on a non-anthropic provider");
  }
  const { provider, ...rest } = req;
  const body = draftRequestBody(rest, modelFor(provider, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL));
  const tag = { agent: "methodology", step: "draft", subject: mode };
  const answer = await callModel(provider, body as ModelRequest, tag);
  let parsed = parseDraftResponse(answer);
  // A record that does not hold together is told what is wrong and asked once more, rather than refused whole.
  const repair = !parsed.ok && provider.kind === "anthropic" ? draftRepairBody(body, answer, parsed) : null;
  if (repair && !parsed.ok) {
    console.error(`[methodology] draft failed schema once: ${parsed.issues} issues (${parsed.where.join(", ")})`);
    parsed = parseDraftResponse(await callModel(provider, repair as ModelRequest, tag));
  }
  if (!parsed.ok) {
    if (!parsed.called) throw new SyncError("The model answered in words instead of recording the methodology. Nothing was changed; try again, or a model that follows tool calls.", "draft had no tool call");
    throw new SyncError(
      mode === "document" ? "The document was read, but its rules could not be turned into checks. Nothing was changed; try a clearer copy or a PDF." : "The suggestion did not hold together, so nothing was changed. Try again.",
      `draft failed schema: ${parsed.issues} issues (${parsed.where.join(", ")})`,
    );
  }
  return parsed.draft;
}

/**
 * The commentary for the scheduled report, on the person's provider. An
 * empty answer is asked for once more (Hamza, 18 Oct 2026: a weekly went out
 * with "the commentary came back empty"); a second empty answer throws a
 * sentence that says what came back, and the caller leaves the report
 * without one. `cut` says the model ran out of room (a weekly's commentary
 * stopped after nine words), so the review can say so.
 */
export async function narrateReport(provider: ModelProvider, report: Report): Promise<{ text: string; cut: boolean }> {
  if (!providerLooksValid(provider)) throw new SyncError(NO_PROVIDER, "no usable provider");
  const body = proseRequestBody(report, modelFor(provider, process.env.ANTHROPIC_PROSE_MODEL || PROSE_MODEL)) as ModelRequest;
  const tag = { agent: "writer", step: "commentary", subject: "review" };
  let answer = await callModel(provider, body, tag);
  let text = parseProseResponse(answer);
  if (!text) {
    // Asked once more a tier up (Haiku to Sonnet since the beta; Hamza, 9 Nov 2026), else on the same model.
    console.error(`[report] commentary empty once: ${emptyAnswerWords(answer)}`);
    const above = provider.kind === "anthropic" ? tierAbove(String(body.model ?? "")) : null;
    answer = await callModel(provider, above ? { ...body, model: above } : body, tag, !!above);
    text = parseProseResponse(answer);
  }
  if (!text) throw new SyncError(`The commentary came back empty twice: ${emptyAnswerWords(answer)}.`, "prose had no text");
  if (answerCut(answer)) console.error(`[report] commentary cut: ${emptyAnswerWords(answer)}`);
  return { text, cut: answerCut(answer) };
}

/** One of the person's own questions, answered from the review alone on their provider (Hamza, 18 Oct 2026); an empty answer throws a sentence saying what came back. */
export async function answerQuestion(provider: ModelProvider, report: Report, question: string): Promise<{ text: string; cut: boolean }> {
  if (!providerLooksValid(provider)) throw new SyncError(NO_PROVIDER, "no usable provider");
  const body = questionRequestBody(report, question, modelFor(provider, process.env.ANTHROPIC_PROSE_MODEL || PROSE_MODEL)) as ModelRequest;
  const tag = { agent: "writer", step: "answer", subject: "review" };
  let answer = await callModel(provider, body, tag);
  let text = parseAnswerResponse(answer);
  const above = !text && provider.kind === "anthropic" ? tierAbove(String(body.model ?? "")) : null;
  if (above) {
    answer = await callModel(provider, { ...body, model: above }, tag, true);
    text = parseAnswerResponse(answer);
  }
  if (!text) throw new SyncError(`The answer came back empty: ${emptyAnswerWords(answer)}.`, "answer had no text");
  return { text, cut: answerCut(answer) };
}

/** The research writer: one step's sections, on the person's provider. The body and the parsing are pure (lib/research-prompt.ts). */
export async function writeStudy(provider: ModelProvider, body: Record<string, unknown>, subject?: string): Promise<unknown> {
  if (!providerLooksValid(provider)) throw new SyncError(NO_PROVIDER, "no usable provider");
  return callModel(provider, { ...(body as ModelRequest), model: modelFor(provider, String(body.model ?? "")) }, { agent: "writer", step: "study", subject });
}

/**
 * The one call. The request is in the Anthropic shape whatever the provider;
 * an OpenAI-compatible endpoint gets the translation and its answer is read
 * back into that shape, so every parser sees one thing. The key goes in a
 * header and nowhere else; errors become sentences without it.
 */
export async function callModel(provider: ModelProvider, body: ModelRequest, tag?: CallTag, escalated = false): Promise<ModelResponse> {
  // A call on the Invariant key is held to its person's monthly cap and metered (lib/model-meter.ts).
  const meter = provider.meter ?? null;
  const metering = meter ? await import("@/lib/model-meter") : null;
  if (meter && metering) await metering.assertWithinCap(meter, provider.cap);
  // The agents' runtime (lib/agent-ledger.ts): a tagged call is gated by its agent's switch and ceiling, carries its approved lessons, and is counted.
  const { lessons } = tag ? await beforeCall(tag) : { lessons: [] };
  const sent = lessons.length ? withLessons(body, lessons) : body;
  const send = async (b: ModelRequest) => {
    const part = await sendOnce(provider, b);
    if (meter && metering) await metering.addSpend(meter, costOf(part.model && PRICES[part.model] ? part.model : String(b.model ?? part.model ?? ""), usageOf(part)) ?? 0, new Date(), tag?.agent ?? null);
    return part;
  };
  let answer: ModelResponse;
  try {
    answer = await send(sent);
    for (let turn = 0; turn < PAUSE_TURNS && provider.kind === "anthropic" && pausedTurn(answer); turn += 1) {
      answer = joinedResponses(answer, await send(continuedRequest(sent, answer)));
    }
  } catch (e) {
    if (tag) await afterCall(tag, modelNameOf(provider, body), NO_USAGE, e instanceof SyncError ? e.message : "The call failed.", escalated);
    throw e;
  }
  if (tag) await afterCall(tag, modelNameOf(provider, body), usageOf(answer), null, escalated);
  return answer;
}

/** The model a call ran on as the runs keep it: the app's model name on a Claude key, the endpoint's own on an open model. */
function modelNameOf(provider: ModelProvider, body: ModelRequest): string | null {
  return provider.kind === "anthropic" ? String(body.model ?? "") || null : modelFor(provider, String(body.model ?? "")) || null;
}

/**
 * A reading the app checks, asked once more on the tier above when the
 * check refuses the first (Haiku to Sonnet, Sonnet to Opus; Hamza, 4 Nov
 * 2026). Only on a Claude key, where the tiers are the app's; an open model
 * keeps its one reading. The second reading is kept whether or not it holds.
 */
export async function callChecked<T>(provider: ModelProvider, body: ModelRequest, tag: CallTag, parse: (answer: ModelResponse) => T, holds: (parsed: T) => boolean): Promise<T> {
  const first = parse(await callModel(provider, body, tag));
  const above = provider.kind === "anthropic" ? tierAbove(String(body.model ?? "")) : null;
  if (holds(first) || !above) return first;
  return parse(await callModel(provider, { ...body, model: above }, tag, true));
}

/**
 * One request, on a Claude key sent to each tier's newest model (Hamza,
 * 4 Nov 2026: lib/models.ts `currentModel`, the list read by
 * lib/model-catalog.ts); a newer model that refuses it (a 400 or a 404) has
 * it sent once more on the model as written, so an upgrade never costs an
 * answer.
 */
async function sendOnce(provider: ModelProvider, body: ModelRequest): Promise<ModelResponse> {
  if (provider.kind !== "anthropic" || !providerLooksValid(provider)) return sendRaw(provider, body);
  const newest = await newestModelsFor(provider.apiKey);
  const upgraded = onNewest(body, newest);
  if (upgraded === body) return sendRaw(provider, body);
  try {
    return await sendRaw(provider, upgraded);
  } catch (e) {
    if (!(e instanceof SyncError) || !/^anthropic (400|404)\b/.test(e.logDetail ?? "")) throw e;
    console.error(`[model] newest model refused the request; sent on the model as written`);
    return sendRaw(provider, body);
  }
}

/** The request on each tier's newest model, the advisor's too; the same object when nothing is newer. */
function onNewest(body: ModelRequest, newest: Parameters<typeof currentModel>[1]): ModelRequest {
  const model = body.model ? currentModel(body.model, newest) : body.model;
  let changed = model !== body.model;
  const tools = body.tools?.map((t) => {
    if (typeof t.model !== "string") return t;
    const m = currentModel(t.model, newest);
    if (m === t.model) return t;
    changed = true;
    return { ...t, model: m };
  });
  return changed ? { ...body, model, ...(tools ? { tools } : {}) } : body;
}

async function sendRaw(provider: ModelProvider, body: ModelRequest): Promise<ModelResponse> {
  if (!providerLooksValid(provider)) throw new SyncError(NO_PROVIDER, "no usable provider");
  const anthropic = provider.kind === "anthropic";
  let url = ANTHROPIC_API;
  let headers: Record<string, string> = { "content-type": "application/json", "x-api-key": (provider.apiKey ?? "").trim(), "anthropic-version": "2023-06-01", ...(anthropic && hasAdvisor(body) ? { "anthropic-beta": ADVISOR_BETA } : {}) };
  let payload: unknown = anthropic ? withPromptCache(body) : body;
  if (!anthropic) {
    url = completionsUrl(provider.baseUrl!);
    headers = { "content-type": "application/json", ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey.trim()}` } : {}) };
    try {
      payload = toOpenAIRequest(body, modelFor(provider, String(body.model ?? "")));
    } catch {
      throw new SyncError(providerCannot(provider, "pdf")!, "pdf on a non-anthropic provider");
    }
  }
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store" });
  } catch {
    throw new SyncError(anthropic ? "Could not reach the model service. Try again in a moment." : "Could not reach the model service. Try again in a moment.", `${provider.kind} unreachable`);
  }
  // The advisor is a beta: a request it cannot go on (the pairing, the beta not on the account) is sent once more without it, so the step still answers.
  if (res.status === 400 && anthropic && hasAdvisor(body)) {
    console.error(`[model] advisor refused${await apiErrorDetail(res, provider)}; sent without it`);
    return sendRaw(provider, withoutAdvisor(body));
  }
  if (!res.ok) {
    const detail = `${provider.kind} ${res.status}${await apiErrorDetail(res, provider)}`;
    if (res.status === 401 || res.status === 403) throw new SyncError("The AI service refused this deployment's key; its operator needs to renew it.", detail);
    if (res.status === 404 && !anthropic) throw new SyncError("The endpoint answered 404: the address or the model name is wrong.", detail);
    if (res.status === 429 || res.status === 529) throw new SyncError("The model is busy or rate-limited on your account. Try again in a few minutes.", detail);
    if (res.status === 400) throw new SyncError(anthropic ? "The model rejected the request. Nothing was changed; if this repeats, the app needs a fix, not a retry." : "The endpoint rejected the request. Nothing was changed; the model may not support tool calls, which this needs.", detail);
    throw new SyncError("The model returned an error. Try again later.", detail);
  }
  const json = await res.json();
  return anthropic ? (json as ModelResponse) : fromOpenAIResponse(json);
}

/** The API's own error type and message for the server log (a sentence about the request, never the key or the document); empty when unreadable. */
async function apiErrorDetail(res: Response, provider: ModelProvider): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { type?: string; message?: string; code?: string } | string };
    const err = typeof body.error === "string" ? { message: body.error } : body.error;
    const type = err?.type ?? err?.code ?? "";
    const message = scrubKey((err?.message ?? "").replace(/\s+/g, " ").slice(0, 200), provider);
    return type || message ? ` ${type}: ${message}` : "";
  } catch {
    return "";
  }
}
