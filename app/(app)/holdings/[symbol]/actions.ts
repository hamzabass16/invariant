"use server";

import { revalidatePath } from "next/cache";

import { recordFields, type HoldingRecord } from "@/lib/holdings";
import { FUNDAMENTAL_FIELDS } from "@/lib/ontology";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, saveRecords } from "@/lib/workspace";

export type TriggerState = { error: string | null };

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

const EMPTY: HoldingRecord = recordFields.parse({ ownValuation: null, since: null, note: null });

async function guarded(symbol: string, fn: () => Promise<void>): Promise<TriggerState> {
  try {
    await fn();
    revalidatePath(`/holdings/${encodeURIComponent(symbol)}`);
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[triggers] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** The record key the workspace keeps for a held symbol: the holding's own spelling. */
function keyFor(records: Record<string, HoldingRecord>, holdings: readonly { symbol: string }[], symbol: string): string | null {
  return Object.keys(records).find((k) => k.toUpperCase() === symbol) ?? holdings.find((h) => h.symbol.toUpperCase() === symbol)?.symbol ?? null;
}

/**
 * Adds a trigger or kill signal to a holding's record: a price or a
 * fundamental at or below, or at or above, a level. Kept in the person's
 * records; met, it is an alert and a to-do item, and it never changes a class.
 */
export async function addTriggerAction(_prev: TriggerState, form: FormData): Promise<TriggerState> {
  const ws = await getWorkspace();
  const symbol = str(form, "symbol").toUpperCase();
  const key = ws.book ? keyFor(ws.records.bySymbol, ws.book.holdings, symbol) : null;
  if (!key) return { error: "That holding is no longer in the book." };
  const kind = str(form, "kind");
  if (kind !== "trigger" && kind !== "kill") return { error: "Choose a trigger or a kill signal." };
  const field = str(form, "field");
  if (field !== "price" && !(FUNDAMENTAL_FIELDS as readonly string[]).includes(field)) return { error: "Choose the price or one of the figures listed." };
  const is = str(form, "is");
  if (is !== "lte" && is !== "gte") return { error: "Choose at or below, or at or above." };
  const value = Number(str(form, "value"));
  if (str(form, "value") === "" || !Number.isFinite(value)) return { error: "The level is a number." };
  const prev = ws.records.bySymbol[key] ?? EMPTY;
  if (prev.triggers.length >= 12) return { error: "A holding keeps twelve triggers at most; remove one first." };
  const id = `t${Date.now().toString(36)}`.slice(0, 20);
  const next = recordFields.safeParse({ ...prev, triggers: [...prev.triggers, { id, kind, field, is, value, note: str(form, "note").slice(0, 200) || null }] });
  if (!next.success) return { error: "The note is 200 characters at most." };
  return guarded(symbol, () => saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [key]: next.data } }));
}

/** Takes one trigger or kill signal off a holding's record. */
export async function removeTriggerAction(_prev: TriggerState, form: FormData): Promise<TriggerState> {
  const ws = await getWorkspace();
  const symbol = str(form, "symbol").toUpperCase();
  const key = ws.book ? keyFor(ws.records.bySymbol, ws.book.holdings, symbol) : null;
  const prev = key ? ws.records.bySymbol[key] : null;
  const id = str(form, "id");
  if (!key || !prev?.triggers.some((t) => t.id === id)) return { error: "That trigger is no longer on the record." };
  return guarded(symbol, () => saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [key]: { ...prev, triggers: prev.triggers.filter((t) => t.id !== id) } } }));
}
