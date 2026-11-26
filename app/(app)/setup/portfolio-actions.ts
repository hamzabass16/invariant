"use server";

import { revalidatePath } from "next/cache";

import { addPortfolio, lensFor, MAX_PORTFOLIOS, METHODOLOGY_MODES, moveAccount, removePortfolio, renamePortfolio, type MethodologyMode } from "@/lib/portfolios";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePortfolios, savePreferences } from "@/lib/workspace";

export type PortfolioState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<PortfolioState> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[portfolios] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/**
 * Looks through one portfolio (`lens`), several together (each checked `ids`),
 * or all of them together (an empty value, or every one checked). Kept with
 * the person's preferences.
 */
export async function setLensAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await getWorkspace();
  const picked = form.getAll("ids").map(String).filter(Boolean);
  const ids = picked.length ? picked : str(form, "lens") ? [str(form, "lens")] : [];
  if (ids.some((id) => !ws.portfolios.items.some((p) => p.id === id))) return { error: "That portfolio is no longer there." };
  if (form.has("aggregate") && !picked.length) return { error: "Tick the portfolios to put together." };
  return guarded(() => savePreferences({ ...ws.preferences, lens: lensFor(ws.portfolios, ids) }));
}

export async function addPortfolioAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await getWorkspace();
  const name = str(form, "name");
  if (!name) return { error: "Give the portfolio a name." };
  if (ws.portfolios.items.length >= MAX_PORTFOLIOS) return { error: `${MAX_PORTFOLIOS} portfolios at most.` };
  return guarded(() => savePortfolios(addPortfolio(ws.portfolios, name)));
}

export async function renamePortfolioAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await getWorkspace();
  const name = str(form, "name");
  if (!name) return { error: "Give the portfolio a name." };
  return guarded(() => savePortfolios(renamePortfolio(ws.portfolios, str(form, "id"), name)));
}

/** Removes a portfolio; its accounts join the first one left, and a lens on it goes back to all. */
export async function removePortfolioAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await getWorkspace();
  const id = str(form, "id");
  if (ws.portfolios.items.length === 1) return { error: "Keep at least one portfolio." };
  return guarded(async () => {
    await savePortfolios(removePortfolio(ws.portfolios, id));
    if (ws.preferences.lens === id) await savePreferences({ ...ws.preferences, lens: null });
  });
}

export async function moveAccountAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await getWorkspace();
  const account = str(form, "account");
  const to = str(form, "to");
  if (!ws.portfolios.items.some((p) => p.accounts.includes(account))) return { error: "That account is not in your book." };
  if (!ws.portfolios.items.some((p) => p.id === to)) return { error: "Choose a portfolio." };
  return guarded(() => savePortfolios(moveAccount(ws.portfolios, account, to)));
}

/** One methodology for all portfolios, or one each. Switching keeps every methodology already confirmed. */
export async function setMethodologyModeAction(_prev: PortfolioState, form: FormData): Promise<PortfolioState> {
  const ws = await getWorkspace();
  const mode = str(form, "mode") as MethodologyMode;
  if (!(METHODOLOGY_MODES as readonly string[]).includes(mode)) return { error: "Choose one methodology for all, or one per portfolio." };
  return guarded(() => savePortfolios({ ...ws.portfolios, mode }));
}
