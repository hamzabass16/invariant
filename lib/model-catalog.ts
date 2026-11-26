import "server-only";

import { createHash } from "node:crypto";

import { modelIdsOf, newestModels, type ModelTier } from "@/lib/models";

/**
 * Anthropic's model list, read on the key the call goes out on (Hamza,
 * 4 Nov 2026: new models taken up by themselves). One GET to /v1/models,
 * kept CATALOG_HOURS in this instance under a fingerprint of the key, never
 * the key itself; a list that cannot be read keeps the models written in
 * lib/models.ts, so a failure costs the upgrade, never a call.
 */

export const CATALOG_HOURS = 12;
const MODELS_API = "https://api.anthropic.com/v1/models?limit=100";
const BUDGET_MS = 4000;

type Kept = { at: number; newest: Partial<Record<ModelTier, string>> };
const KEY = "__portfolioOsModelCatalog";
const kept: Map<string, Kept> = ((globalThis as Record<string, unknown>)[KEY] as Map<string, Kept> | undefined) ?? ((globalThis as Record<string, unknown>)[KEY] = new Map<string, Kept>());
const inFlight = new Map<string, Promise<Partial<Record<ModelTier, string>>>>();

/** Each tier's newest model on this key; empty (the models as written) when the list cannot be read. */
export async function newestModelsFor(apiKey: string | null | undefined): Promise<Partial<Record<ModelTier, string>>> {
  const key = (apiKey ?? "").trim();
  if (!key || process.env.STORAGE === "demo") return {};
  const id = createHash("sha256").update(key).digest("hex").slice(0, 24);
  const hit = kept.get(id);
  if (hit && Date.now() - hit.at < CATALOG_HOURS * 3_600_000) return hit.newest;
  const running = inFlight.get(id);
  if (running) return running;
  const read = (async () => {
    try {
      const res = await fetch(MODELS_API, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, cache: "no-store", signal: AbortSignal.timeout(BUDGET_MS) });
      if (!res.ok) throw new Error(`models ${res.status}`);
      const newest = newestModels(modelIdsOf(await res.json()));
      kept.set(id, { at: Date.now(), newest });
      return newest;
    } catch (e) {
      console.error(`[models] list not read: ${e instanceof Error ? e.message.slice(0, 80) : "failed"}; the models as written stay`);
      // Asked again in an hour, not on every call.
      kept.set(id, { at: Date.now() - (CATALOG_HOURS - 1) * 3_600_000, newest: hit?.newest ?? {} });
      return hit?.newest ?? {};
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, read);
  return read;
}
