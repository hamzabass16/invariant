"use server";

import { revalidatePath } from "next/cache";

import { ASK_CLAUDE_SENTENCE } from "@/lib/ask-claude";
import { providerFor } from "@/lib/hosted-model";
import { decisionId, decisionSchema, withDecision, type Outcome } from "@/lib/decisions";
import { recordFields } from "@/lib/holdings";

import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { getWorkspace, saveDecisions, saveRecords } from "@/lib/workspace";

export type WatchState = { error: string | null };

/**
 * "Check now" on the Real estate screen: runs the property watch on the
 * person's own key and keeps the result in their vault. Nothing is applied to
 * a valuation; the screen shows what was found and its sources.
 */
export async function runWatchAction(): Promise<WatchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo shows a sample watch and runs none. Signed in, it runs with the AI." };
  if (ws.askClaude) return { error: ASK_CLAUDE_SENTENCE };
  if (!ws.book) return { error: "No figures have arrived yet." };
  if (!ws.hasModelKey) return { error: "The AI is not set up on this deployment yet." };
  try {
    const { openVault } = await import("@/lib/vault");
    const v = await openVault();
    const provider = await providerFor(v);
    if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "no provider");
    const { runPropertyWatch } = await import("@/lib/property-watch-run");
    await runPropertyWatch(v, ws.book, provider, localDay());
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[watch] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** The key a revaluation decision answers: the property and the value suggested, so a new suggestion asks again. */
const revalueKey = (holdingId: string, value: number) => `revalue:${holdingId}:${value}`.slice(0, 200);

/**
 * Accept or keep: the property watch's suggested revaluation, decided by the
 * owner. Accepting lays the value on the property's record with today's date
 * and the watch's basis, and files the decision; keeping files the decision
 * alone. Neither is ever done by the watch itself.
 */
async function settleRevaluation(form: FormData, outcome: Extract<Outcome, "accepted" | "kept">): Promise<WatchState> {
  const ws = await getWorkspace();
  const id = String(form.get("holdingId") ?? "");
  const h = ws.book?.holdings.find((x) => x.id === id && x.assetClass === "real_estate");
  const s = ws.propertyWatch?.properties.find((p) => p.holdingId === id)?.suggestedValuation;
  if (!h || !s) return { error: "That suggestion is no longer there." };
  if (h.symbol.length > 40) return { error: "This property's name is too long to keep a record under; shorten it in the book." };
  const today = localDay();
  const now = new Date().toISOString();
  const entry = decisionSchema.parse({
    id: decisionId(ws.decisions, today),
    date: today,
    kind: "note",
    symbol: h.symbol.toUpperCase().slice(0, 40),
    title: `${outcome === "accepted" ? "Accepted" : "Kept my value over"} the suggested revaluation of ${h.name}`.slice(0, 120),
    text: `Suggested ${s.value.toLocaleString("en-US")} ${h.currency}: ${s.basis}`.slice(0, 4000),
    filedAt: now,
    action: { on: revalueKey(h.id, s.value), outcome, targetPct: null, by: null, votedClass: null, reading: null },
  });
  try {
    if (outcome === "accepted") {
      const prev = ws.records.bySymbol[h.symbol] ?? recordFields.parse({ ownValuation: null, since: null, note: null });
      await saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [h.symbol]: { ...prev, revaluation: { value: s.value, asOf: today, source: `Property watch, accepted ${today}: ${s.basis}`.slice(0, 200) } } } });
    }
    await saveDecisions(withDecision(ws.decisions, entry, now));
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[watch] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

export async function acceptRevaluationAction(_prev: WatchState, form: FormData): Promise<WatchState> {
  return settleRevaluation(form, "accepted");
}

export async function keepValuationAction(_prev: WatchState, form: FormData): Promise<WatchState> {
  return settleRevaluation(form, "kept");
}
