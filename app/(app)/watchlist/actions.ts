"use server";

import { revalidatePath } from "next/cache";

import { recordFields } from "@/lib/holdings";
import { SyncError } from "@/lib/sync-error";
import { EMPTY_THESIS, thesisFor, thesisSchema, withThesis } from "@/lib/theses";
import { localDay } from "@/lib/time";
import { getWorkspace, saveRecords, saveTheses, thesesFor } from "@/lib/workspace";

export type WatchState = { error: string | null };

const SYMBOL = /^[A-Z0-9.\-]{1,40}$/;

async function guarded(fn: () => Promise<void>): Promise<WatchState> {
  try {
    await fn();
    revalidatePath("/watchlist");
    revalidatePath("/companies");
    revalidatePath("/company/[symbol]", "page");
    revalidatePath("/theses");
    revalidatePath("/theses/[symbol]", "page");
    revalidatePath("/");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[watchlist] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const num = (v: string) => (v === "" ? null : Number.isNaN(Number(v)) ? undefined : Number(v));

/**
 * Records a symbol the person follows without holding (Hamza, 23 Oct 2026:
 * the watchlist starts the thesis): its thesis, kept on the Theses screen
 * (in the demo, whose theses are read-only, as the record's note), and the
 * valuation and alert levels when the form carries them. A form without the
 * valuation fields (adding a symbol) keeps what the record had.
 */
export async function watchSymbolAction(_prev: WatchState, form: FormData): Promise<WatchState> {
  const ws = await getWorkspace();
  const symbol = str(form, "symbol").toUpperCase();
  if (!SYMBOL.test(symbol)) return { error: "A symbol is letters, digits, dots and dashes." };
  if (ws.book?.holdings.some((h) => h.symbol.toUpperCase() === symbol)) return { error: `You hold ${symbol}; its thesis is on the Theses screen.` };
  const prev = Object.entries(ws.records.bySymbol).find(([k]) => k.toUpperCase() === symbol)?.[1];
  const valuing = form.has("base");
  const low = num(str(form, "low"));
  const base = num(str(form, "base"));
  const high = num(str(form, "high"));
  if (low === undefined || base === undefined || high === undefined) return { error: "A valuation is a number per unit." };
  if ((low !== null || high !== null) && base === null) return { error: "Give the base case; low and high are optional." };
  if (base !== null && base <= 0) return { error: "A valuation is above zero." };
  if (low !== null && base !== null && low > base) return { error: "The low is above the base." };
  if (high !== null && base !== null && high < base) return { error: "The high is below the base." };
  const below = num(str(form, "below"));
  const above = num(str(form, "above"));
  if (below === undefined || above === undefined || (below !== null && below <= 0) || (above !== null && above <= 0)) return { error: "An alert level is a price above zero." };
  if (below !== null && above !== null && below >= above) return { error: "The lower alert level is below the upper one." };
  const asOf = str(form, "asOf") || ws.book?.asOf || localDay();
  const thesis = form.has("thesis") ? str(form, "thesis").slice(0, 6000) : null;
  const demo = ws.mode === "demo";
  const note = demo && thesis ? thesis.slice(0, 300) : form.has("note") ? str(form, "note").slice(0, 300) || null : (prev?.note ?? null);
  const parsed = recordFields.safeParse({
    ownValuation: !valuing ? (prev?.ownValuation ?? null) : base === null ? null : { low, base, high, asOf, basis: str(form, "basis").slice(0, 80) || null },
    since: str(form, "since") || prev?.since || (prev ? null : localDay()),
    note,
    levels: !valuing ? (prev?.levels ?? null) : below === null && above === null ? null : { below, above },
  });
  if (!parsed.success) return { error: "Dates are YYYY-MM-DD; the basis is 80 characters at most." };
  // Saving a watched symbol again edits it; triggers set elsewhere stay.
  const next = prev ? { ...parsed.data, triggers: prev.triggers, revaluation: prev.revaluation, sector: prev.sector } : parsed.data;
  return guarded(async () => {
    if (thesis && !demo) {
      const { file, error } = await thesesFor(ws);
      // A theses file that cannot be read is never written over.
      if (error) throw new SyncError(`The thesis was not kept: ${error}`, "watch theses read");
      const had = thesisFor(file, symbol);
      if (thesis !== (had?.text ?? "")) {
        const now = new Date().toISOString();
        const t = thesisSchema.safeParse({ ...(had ?? EMPTY_THESIS), text: thesis, updatedAt: now });
        if (!t.success) throw new SyncError("The thesis is 6,000 characters at most.", "watch thesis parse");
        await saveTheses(withThesis(file, symbol, t.data, now));
      }
    }
    await saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [symbol]: next } });
  });
}

/** Takes a symbol off the watchlist. */
export async function unwatchAction(_prev: WatchState, form: FormData): Promise<WatchState> {
  const ws = await getWorkspace();
  const symbol = str(form, "symbol").toUpperCase();
  const key = Object.keys(ws.records.bySymbol).find((k) => k.toUpperCase() === symbol);
  if (!key) return { error: "That symbol is not on the watchlist." };
  const bySymbol = { ...ws.records.bySymbol };
  delete bySymbol[key];
  return guarded(() => saveRecords({ ...ws.records, bySymbol }));
}
