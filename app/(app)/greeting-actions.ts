"use server";

import { quoteKey, QUOTES, withShown } from "@/lib/greeting";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

/**
 * Notes the quote the greeting just showed in the person's own preferences
 * (Hamza, 4 Nov 2026), so every device they use takes the next one and none
 * comes round again before every other has shown. The demo keeps the record
 * on the device alone.
 */
export async function noteQuoteShownAction(key: string): Promise<{ error: string | null }> {
  if (!QUOTES.some((q) => quoteKey(q) === key)) return { error: "Not a quote." };
  const ws = await getWorkspace();
  // A vault that could not be read carries the default preferences: never written over the person's own.
  if (ws.mode !== "drive" || ws.error || !ws.setup) return { error: null };
  const shown = ws.preferences.quotesShown;
  if (shown.at(-1) === key) return { error: null };
  try {
    // No revalidation: the greeting has already moved on, and the next load reads the vault.
    await savePreferences({ ...ws.preferences, quotesShown: withShown(shown, key) });
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}
