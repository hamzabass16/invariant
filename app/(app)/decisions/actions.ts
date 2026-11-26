"use server";

import { revalidatePath } from "next/cache";

import { DECISION_KINDS, decisionId, decisionSchema, withDecision, withoutDecision, type DecisionKind } from "@/lib/decisions";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { getWorkspace, saveDecisions } from "@/lib/workspace";

export type DecisionState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<DecisionState> {
  try {
    await fn();
    revalidatePath("/decisions");
    revalidatePath("/");
    revalidatePath("/trades");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[decisions] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const oneOf = <T extends string>(v: string, list: readonly T[]): T | null => ((list as readonly string[]).includes(v) ? (v as T) : null);

/** Files one entry in the Decision Log: a trade, a vote, a methodology change or a note. */
export async function addDecisionAction(_prev: DecisionState, form: FormData): Promise<DecisionState> {
  const ws = await getWorkspace();
  const date = str(form, "date") || localDay();
  const kind = oneOf<DecisionKind>(str(form, "kind"), DECISION_KINDS);
  if (!kind) return { error: "Choose a kind: trade, vote, methodology or note." };
  const title = str(form, "title");
  if (!title) return { error: "Give the entry a title." };
  const symbolRaw = str(form, "symbol").toUpperCase();
  if (symbolRaw && !/^[A-Z0-9.\-]{1,40}$/.test(symbolRaw)) return { error: "A symbol is letters, digits, dots and dashes." };
  const entry = decisionSchema.safeParse({
    id: decisionId(ws.decisions, date),
    date,
    kind,
    symbol: symbolRaw || null,
    title,
    text: str(form, "text"),
    filedAt: new Date().toISOString(),
  });
  if (!entry.success) return { error: "The date is YYYY-MM-DD, the title 120 characters at most, the text 4,000." };
  return guarded(() => saveDecisions(withDecision(ws.decisions, entry.data, new Date().toISOString())));
}

/** Takes one entry out of the Decision Log. */
export async function removeDecisionAction(_prev: DecisionState, form: FormData): Promise<DecisionState> {
  const ws = await getWorkspace();
  const id = str(form, "id");
  if (!ws.decisions.entries.some((d) => d.id === id)) return { error: "That entry is no longer in the log." };
  return guarded(() => saveDecisions(withoutDecision(ws.decisions, id, new Date().toISOString())));
}

/** Edits one entry in place: its date, kind, symbol, title and text. It keeps its id, when it was filed and the decision it records. */
export async function editDecisionAction(_prev: DecisionState, form: FormData): Promise<DecisionState> {
  const ws = await getWorkspace();
  const id = str(form, "id");
  const prev = ws.decisions.entries.find((d) => d.id === id);
  if (!prev) return { error: "That entry is no longer in the log." };
  const kind = oneOf<DecisionKind>(str(form, "kind"), DECISION_KINDS);
  if (!kind) return { error: "Choose a kind: trade, vote, methodology or note." };
  const title = str(form, "title");
  if (!title) return { error: "Give the entry a title." };
  const symbolRaw = str(form, "symbol").toUpperCase();
  if (symbolRaw && !/^[A-Z0-9.\-]{1,40}$/.test(symbolRaw)) return { error: "A symbol is letters, digits, dots and dashes." };
  const entry = decisionSchema.safeParse({ ...prev, date: str(form, "date") || prev.date, kind, symbol: symbolRaw || null, title, text: str(form, "text") });
  if (!entry.success) return { error: "The date is YYYY-MM-DD, the title 120 characters at most, the text 4,000." };
  return guarded(() => saveDecisions(withDecision(ws.decisions, entry.data, new Date().toISOString())));
}

/**
 * Cooling-off (Hamza, 9 Nov 2026, the twenty further ways): writes the plan
 * for a trade before it is made, a `plan` entry naming the company, the side
 * and why. A trade the broker's ledger shows a day to a month later counts
 * as planned on Trades. Nothing is sent to a broker.
 */
export async function planTradeAction(_prev: DecisionState, form: FormData): Promise<DecisionState> {
  const ws = await getWorkspace();
  const date = localDay();
  const side = str(form, "side") === "sell" ? "sell" : "buy";
  const symbol = str(form, "symbol").toUpperCase();
  if (!/^[A-Z0-9.\-]{1,40}$/.test(symbol)) return { error: "Name the company by its ticker." };
  const why = str(form, "text");
  if (why.length < 10) return { error: "Write why, in a line or more, before you trade." };
  const entry = decisionSchema.safeParse({
    id: decisionId(ws.decisions, date),
    date,
    kind: "plan",
    symbol,
    title: `${side === "buy" ? "Buy" : "Sell"} ${symbol}`,
    text: why.slice(0, 4000),
    filedAt: new Date().toISOString(),
    action: { on: `plan:${symbol}:${date}`, outcome: side === "buy" ? "add" : "sell", targetPct: null, by: null, votedClass: null, reading: null },
  });
  if (!entry.success) return { error: "The plan could not be written as given." };
  return guarded(() => saveDecisions(withDecision(ws.decisions, entry.data, new Date().toISOString())));
}
