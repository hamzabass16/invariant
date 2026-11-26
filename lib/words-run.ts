import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { callChecked } from "@/lib/methodology-draft";
import { modelFor, type ModelRequest } from "@/lib/model-provider";
import { parseScreenWordsResponse, SCREEN_WORDS_MODEL, screenWordsRequestBody, type ScreenWordsParse } from "@/lib/screen-words";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";
import { parseWatcherResponse, WATCHER_MODEL, watcherRequestBody, type WatcherParse } from "@/lib/watchers";

/**
 * Words compiled into recipes on the AI (Hamza, 23 Oct 2026,
 * after Rallies.AI): a watcher (lib/watchers.ts) or a screen
 * (lib/screen-words.ts). One short call each, made when the person keeps
 * the words, never at a check or a page; the words alone go to the model,
 * never a figure of their book.
 */

async function providerOf(vault: Vault) {
  const provider = await providerFor(vault);
  if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "words no provider");
  return provider;
}

export async function compileWatcher(vault: Vault, words: string, known: readonly string[]): Promise<WatcherParse> {
  const provider = await providerOf(vault);
  // A reading that does not compile is asked once more on the tier above (lib/agents.ts, tierAbove).
  return callChecked(provider, watcherRequestBody(words, known, modelFor(provider, WATCHER_MODEL)) as ModelRequest, { agent: "words", step: "watcher" }, parseWatcherResponse, (p) => p.ok);
}

export async function compileScreen(vault: Vault, words: string): Promise<ScreenWordsParse> {
  const provider = await providerOf(vault);
  return callChecked(provider, screenWordsRequestBody(words, modelFor(provider, SCREEN_WORDS_MODEL)) as ModelRequest, { agent: "words", step: "screen" }, parseScreenWordsResponse, (p) => p.ok);
}
