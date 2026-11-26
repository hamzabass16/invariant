"use server";

import { revalidatePath } from "next/cache";

import { MAX_WORD_SCREENS, wordScreenId, wordScreenSchema } from "@/lib/screen-words";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type ScreenerState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<ScreenerState> {
  try {
    await fn();
    revalidatePath("/screener");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[screener] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/**
 * Keeps a screen asked in words (lib/screen-words.ts; Hamza, 23 Oct 2026):
 * compiled once on the AI into filters the app runs on the
 * screener's companies; words no field reads are refused with a sentence.
 */
export async function askScreenAction(_prev: ScreenerState, form: FormData): Promise<ScreenerState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo compiles no screens; your own app does, with the AI." };
  const words = String(form.get("words") ?? "").replace(/\s+/g, " ").trim();
  if (words.length < 3) return { error: "Write the screen in a few words first." };
  if (words.length > 300) return { error: "Keep it under 300 characters." };
  const kept = ws.preferences.wordScreens;
  return guarded(async () => {
    const { openVault } = await import("@/lib/vault");
    const { compileScreen } = await import("@/lib/words-run");
    const got = await compileScreen(await openVault(), words);
    if (!got.ok) throw new SyncError(got.reason, "screen not compiled");
    const s = wordScreenSchema.parse({ id: wordScreenId(kept.map((x) => x.id)), words, filters: got.filters, cannot: [...got.cannot, ...got.dropped.map((d) => `Left out ${d}.`)].slice(0, 4), at: new Date().toISOString() });
    // The newest first; past the limit the oldest leaves.
    await savePreferences({ ...ws.preferences, wordScreens: [s, ...kept.filter((x) => x.words.toLowerCase() !== words.toLowerCase())].slice(0, MAX_WORD_SCREENS) });
  });
}

/** Removes a screen asked in words. */
export async function removeScreenAction(_prev: ScreenerState, form: FormData): Promise<ScreenerState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo keeps no screens." };
  const id = String(form.get("id") ?? "");
  if (!ws.preferences.wordScreens.some((s) => s.id === id)) return { error: "That screen is no longer kept." };
  return guarded(() => savePreferences({ ...ws.preferences, wordScreens: ws.preferences.wordScreens.filter((s) => s.id !== id) }));
}
