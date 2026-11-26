import "server-only";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

import { ANALYST_MODEL } from "@/lib/analyst";
import { afterCall, beforeCall } from "@/lib/agent-ledger";
import { costOf, NO_USAGE, type Usage } from "@/lib/agents";
import { AnalystLimitError, runAnalyst, type AnalystInput, type AnalystOutput } from "@/lib/analyst-graph";
import { factsText } from "@/lib/edgar-facts";
import { newestModelsFor } from "@/lib/model-catalog";
import { modelFor, providerLooksValid, scrubKey, type ModelProvider } from "@/lib/model-provider";
import { currentModel } from "@/lib/models";
import type { EdgarContact } from "@/lib/preferences";
import { SyncError } from "@/lib/sync-error";

/**
 * The one place the person's own provider meets the analyst's model: their
 * Claude key through ChatAnthropic, or an OpenAI-compatible endpoint (an open
 * model on their own account) through ChatOpenAI pointed at that address. The
 * key is read by the caller for this call, handed to the model client and
 * dropped; it is never logged, never echoed, never kept. The agent itself
 * (lib/analyst-graph.ts) knows no key or provider; the demo never reaches
 * this file. Filings are read through lib/edgar.ts, the only EDGAR path, and
 * only with the SEC contact the person confirmed; without one the tool says so
 * and the SEC is never called.
 */
export async function askAnalyst(provider: ModelProvider, input: Omit<AnalystInput, "edgar">, edgarContact: EdgarContact | null): Promise<AnalystOutput> {
  if (!providerLooksValid(provider)) throw new SyncError("The AI is not set up on this deployment yet.", "no usable provider");
  // On the Invariant key the analyst is held to its person's monthly cap and each turn is metered (lib/model-meter.ts).
  const meter = provider.meter ?? null;
  const metering = meter ? await import("@/lib/model-meter") : null;
  if (meter && metering) await metering.assertWithinCap(meter, provider.cap);
  // The agents' runtime (lib/agent-ledger.ts): gated by the Analyst's switch and ceiling, each turn of the loop counted.
  const tag = { agent: "analyst", step: "plan", subject: "question" };
  await beforeCall(tag);
  const name = provider.kind === "anthropic" ? modelFor(provider, process.env.ANTHROPIC_ANALYST_MODEL || ANALYST_MODEL) : modelFor(provider, "");
  // On a Claude key the tier's newest model, as every other call (lib/models.ts `currentModel`; Hamza, 4 Nov 2026), back to the one written when it refuses.
  const newest = provider.kind === "anthropic" && !process.env.ANTHROPIC_ANALYST_MODEL ? currentModel(name, await newestModelsFor(provider.apiKey)) : name;
  const counted: Promise<void>[] = [];
  const turnEnded = (out: unknown) => {
    const used = langchainUsage(out);
    counted.push(afterCall(tag, name || null, used, null));
    if (meter && metering) counted.push(metering.addSpend(meter, costOf(name, used) ?? 0, new Date(), tag.agent));
  };
  const callbacks = [{ handleLLMEnd: (out: unknown) => void turnEnded(out) }];
  // No temperature: the Claude 5 models refuse a non-default one, and the client throws before any request is sent.
  const clientOn = (n: string) =>
    provider.kind === "anthropic"
      ? new ChatAnthropic({ apiKey: provider.apiKey!, model: n, maxTokens: 4000, callbacks })
      : new ChatOpenAI({ apiKey: provider.apiKey || "none", model: n, maxTokens: 4000, configuration: { baseURL: provider.baseUrl! }, callbacks });
  const edgar = async (ticker: string) => {
    const { lookupCompany, companyFacts, NO_CONTACT } = await import("@/lib/edgar");
    if (!edgarContact) return NO_CONTACT;
    const found = await lookupCompany(ticker, edgarContact);
    if (!found) return `SEC EDGAR lists no company under ${ticker}, by ticker or by name; a foreign listing or a fund has no filings there.`;
    return `${found.title} (${found.ticker})\n${factsText(await companyFacts(found.cik, edgarContact))}`;
  };
  try {
    try {
      return await runAnalyst(clientOn(newest), { ...input, edgar });
    } catch (e) {
      const status = (e as { status?: unknown } | null)?.status;
      if (newest === name || (status !== 400 && status !== 404)) throw e;
      console.error("[analyst] newest model refused the request; asked on the model as written");
      return await runAnalyst(clientOn(name), { ...input, edgar });
    }
  } catch (e) {
    await afterCall(tag, name || null, NO_USAGE, e instanceof Error ? e.message.slice(0, 120) : "The analyst could not finish.");
    if (e instanceof AnalystLimitError) throw new SyncError(e.message, "analyst step cap");
    if (e instanceof SyncError) throw e;
    // The model client's errors carry a status and a message; the message is scrubbed of the key
    // and of anything key-shaped before the first 160 characters reach the log.
    const status = (e as { status?: number })?.status;
    const said = e instanceof Error ? scrubKey(e.message, provider).slice(0, 160) : "unknown";
    const detail = `analyst model call failed${status ? ` (${status})` : ""}: ${e instanceof Error ? e.name : "Error"}: ${said}`;
    if (status === 401 || status === 403) throw new SyncError("The AI service refused this deployment's key; its operator needs to renew it.", detail);
    if (status === 404 && provider.kind !== "anthropic") throw new SyncError("The endpoint answered 404: the address or the model name is wrong.", detail);
    if (status === 429) throw new SyncError("The model is rate-limited on your account right now. Try again in a minute.", detail);
    if (status === 529 || (status && status >= 500)) throw new SyncError("The model is overloaded. Try again in a minute.", detail);
    throw new SyncError("The analyst could not finish this question. Nothing was kept; try again or ask more narrowly.", detail);
  } finally {
    await Promise.all(counted);
  }
}

/** The tokens one turn of the loop used, from the message LangChain hands back (`usage_metadata`), in the runs' shape. */
function langchainUsage(out: unknown): Usage {
  const gen = (out as { generations?: { message?: { usage_metadata?: { input_tokens?: number; output_tokens?: number; input_token_details?: { cache_read?: number; cache_creation?: number } } } }[][] } | null)?.generations?.flat()[0];
  const u = gen?.message?.usage_metadata;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const read = n(u?.input_token_details?.cache_read);
  const write = n(u?.input_token_details?.cache_creation);
  return { input: Math.max(0, n(u?.input_tokens) - read - write), output: n(u?.output_tokens), cacheRead: read, cacheWrite: write, searches: 0 };
}
