"use server";

import { revalidatePath } from "next/cache";

import { ASK_CLAUDE_SENTENCE } from "@/lib/ask-claude";
import { LOOK_THROUGH_FUNDS } from "@/lib/look-through";
import type { WindowKey } from "@/lib/performance";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace } from "@/lib/workspace";

export type ReadState = { error: string | null };

/**
 * Reads the page through the methodology on the AI
 * (lib/perf-insights-run.ts), at the windows the page shows: Hamza, 23 Oct
 * 2026, "press AI insight to get it".
 */
export async function perfInsightsAction(_prev: ReadState, form: FormData): Promise<ReadState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo calls no model: these are sample readings. In your app the AI writes them from your figures." };
  if (ws.askClaude) return { error: ASK_CLAUDE_SENTENCE };
  const m = ws.setup?.methodology;
  if (!m) return { error: "Confirm a methodology first: the readings are made through it." };
  if (!ws.book) return { error: "No figures yet." };
  const { WINDOW_KEYS } = await import("@/lib/performance");
  const pick = (k: string, d: WindowKey): WindowKey => (WINDOW_KEYS.includes(form.get(k) as WindowKey) ? (form.get(k) as WindowKey) : d);
  const { readPerfInsights } = await import("@/lib/perf-insights-run");
  const { benchmarksOf } = await import("@/lib/screens");
  const { deriveScreens } = await import("@/lib/screen-data");
  const { lookThrough } = await import("@/lib/look-through");
  const { localDay } = await import("@/lib/time");
  const { openVault } = await import("@/lib/vault");
  // The look-through as the page draws it, so its two cards are read too.
  const data = deriveScreens({ book: ws.book, methodology: m, inputs: ws.setup?.inputs ?? [], shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, localDay());
  const look = data.slots("performance").includes("look_through") ? lookThrough(m, data.weights, ws.benchmarks, LOOK_THROUGH_FUNDS) : null;
  try {
    await readPerfInsights(await openVault(), m, ws.book, benchmarksOf(m), { window: pick("window", "1Y"), irr: pick("irr", "Since start"), alpha: pick("alpha", "1Y") }, new Date(), look);
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[insights] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
  revalidatePath("/performance");
  return { error: null };
}
