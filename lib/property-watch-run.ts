import "server-only";

import type { Book } from "@/lib/holdings";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { mergeWatch, parseWatchResponse, unchecked, WATCH_MODEL, watchRequestBody, type PropertyWatch } from "@/lib/property-watch";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/**
 * Runs the property watch in the app, on the person's own key: one call per
 * property, side by side, each searching the web through the model and
 * recording what it found; the file goes to the person's vault. A property
 * whose call fails gets a sentence, never an empty entry, and the others
 * still land. Only the Claude provider can search the web here; another
 * provider is refused with a sentence before anything is spent.
 */
export async function runPropertyWatch(vault: Vault, book: Book, provider: ModelProvider, today: string): Promise<PropertyWatch> {
  const cannot = providerCannot(provider, "web_search");
  if (cannot) throw new SyncError(cannot, "watch on a non-anthropic provider");
  const props = book.holdings.filter((h) => h.assetClass === "real_estate" && h.property);
  if (!props.length) throw new SyncError("No property is on the books yet.", "no properties");
  const model = modelFor(provider, process.env.ANTHROPIC_WATCH_MODEL || WATCH_MODEL);
  const entries = await Promise.all(
    props.map(async (h) => {
      try {
        const parsed = parseWatchResponse(await callModel(provider, watchRequestBody(h, today, model) as ModelRequest, { agent: "property_watch", step: "watch", subject: h.id }), h.id);
        if (!parsed.ok) {
          console.error(`[watch] ${parsed.reason}`);
          return unchecked(h.id, parsed.reason);
        }
        return parsed.entry;
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[watch] one property failed: ${e.logDetail ?? "failed"}`);
        return unchecked(h.id, e.message);
      }
    }),
  );
  const file = mergeWatch(entries, today);
  await vault.writeJson("property_watch", file);
  return file;
}
