"use server";

import { revalidatePath } from "next/cache";

import { MAX_ADDED, SYMBOL, symbolKey } from "@/lib/earnings";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type EarningsState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<EarningsState> {
  try {
    await fn();
    revalidatePath("/earnings");
    revalidatePath("/notifications");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[earnings] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** Follows a company's results without holding or watching it. */
export async function addEarningsAction(_prev: EarningsState, form: FormData): Promise<EarningsState> {
  const ws = await getWorkspace();
  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase();
  if (!SYMBOL.test(symbol)) return { error: "A symbol is letters, digits, dots and dashes, as the exchange lists it: MSFT, BRK.B." };
  const k = symbolKey(symbol);
  if (ws.book?.holdings.some((h) => symbolKey(h.symbol) === k)) return { error: `You hold ${symbol}, so it is on the calendar already.` };
  if (Object.keys(ws.records.bySymbol).some((s) => symbolKey(s) === k)) return { error: `${symbol} is on your watchlist, so it is on the calendar already.` };
  if (ws.preferences.earnings.some((s) => symbolKey(s) === k)) return { error: `${symbol} is on the calendar already.` };
  if (ws.preferences.earnings.length >= MAX_ADDED) return { error: `The calendar follows at most ${MAX_ADDED} added companies; remove one first.` };
  return guarded(() => savePreferences({ ...ws.preferences, earnings: [...ws.preferences.earnings, symbol] }));
}

/** Stops following a company added on the Earnings screen; its reports already written stay. */
export async function removeEarningsAction(_prev: EarningsState, form: FormData): Promise<EarningsState> {
  const ws = await getWorkspace();
  const k = symbolKey(String(form.get("symbol") ?? ""));
  if (!ws.preferences.earnings.some((s) => symbolKey(s) === k)) return { error: "That company was not added here." };
  return guarded(() => savePreferences({ ...ws.preferences, earnings: ws.preferences.earnings.filter((s) => symbolKey(s) !== k) }));
}

/** Reads the results now, as the evening read and the morning refresh do: what each company filed, the figures, the tests, and the reading of the release on the person's Claude. */
export async function readResultsNowAction(): Promise<EarningsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo shows fictional reports and reads nothing." };
  try {
    const { openVault } = await import("@/lib/vault");
    const vault = await openVault();
    const { readEarningsInto } = await import("@/lib/earnings-run");
    const now = new Date();
    const run = await readEarningsInto(vault, now);
    if (run?.written) {
      const { checkAlerts } = await import("@/lib/alerts-run");
      await checkAlerts(vault, ws.operator.email, now).catch((e: unknown) => {
        if (!(e instanceof SyncError)) throw e;
      });
    }
    revalidatePath("/earnings");
    revalidatePath("/notifications");
    return run ? (run.failed ? { error: run.sentence } : { error: null }) : { error: "No company on your calendar has reported in the last weeks without a finished report." };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}
