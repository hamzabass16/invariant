"use server";

import { revalidatePath } from "next/cache";

import { decisionId, decisionSchema, OUTCOMES, outcomeWords, withDecision, type DecisionKind, type Outcome } from "@/lib/decisions";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { OUTCOMES_FOR } from "@/lib/todo";
import { getWorkspace, saveDecisions } from "@/lib/workspace";

export type DecideState = { error: string | null };

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYMBOL = /^[A-Z0-9.\- ]{1,40}$/;

/**
 * Files the decision that answers one to-do item, a signal, a clock or an
 * expiry: a Decision Log entry whose action names the item's key, the
 * outcome and its terms. A vote's class is recorded beside the class the
 * tests give and never applied. Nothing is sent anywhere; the order, if any,
 * is the person's to place with their broker.
 */
export async function decideAction(_prev: DecideState, form: FormData): Promise<DecideState> {
  const ws = await getWorkspace();
  const act = str(form, "act") as keyof typeof OUTCOMES_FOR;
  if (!(act in OUTCOMES_FOR)) return { error: "That item takes no decision here." };
  const outcome = str(form, "outcome") as Outcome;
  if (!(OUTCOMES as readonly string[]).includes(outcome) || !OUTCOMES_FOR[act].includes(outcome)) return { error: "Choose one of the outcomes offered." };
  const on = str(form, "on");
  if (!on || on.length > 200) return { error: "That item is no longer on the list." };
  const symbolRaw = str(form, "symbol").toUpperCase();
  const symbol = symbolRaw && SYMBOL.test(symbolRaw) ? symbolRaw : null;
  const targetRaw = str(form, "targetPct");
  const targetPct = targetRaw === "" ? null : Number(targetRaw);
  if (targetPct !== null && (!Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100)) return { error: "The target weight is a percent between 0 and 100." };
  if (outcome === "trim" && targetPct === null) return { error: "Give the weight to trim to." };
  const by = str(form, "by") || null;
  if (by && !DATE.test(by)) return { error: "The date is YYYY-MM-DD." };
  const today = localDay();
  if (by && by < today) return { error: "The date is today or later." };
  if (outcome === "probation" && !by) return { error: "Probation runs until a date; give it." };
  const votedClassRaw = act === "vote" ? str(form, "votedClass") : "";
  const classes = ws.setup?.methodology?.classes ?? [];
  if (votedClassRaw && !classes.some((c) => c.id === votedClassRaw)) return { error: "Choose one of your methodology's classes." };
  const votedClass = votedClassRaw || null;
  const note = str(form, "note").slice(0, 4000);
  const action = { on, outcome, targetPct: outcome === "trim" ? targetPct : null, by: outcome === "trim" || outcome === "sell" || outcome === "probation" ? by : null, votedClass, reading: str(form, "reading").slice(0, 80) || null };
  const kind: DecisionKind = act === "vote" ? "vote" : act === "check" ? "note" : ["trim", "sell", "add", "rolled", "closed", "let_go"].includes(outcome) ? "trade" : "note";
  const classLabel = votedClass ? classes.find((c) => c.id === votedClass)?.label ?? votedClass : null;
  const subject = str(form, "title").replace(/^Yours to check: /, "").slice(0, 200);
  const head = act === "vote" ? `Vote${symbol ? ` on ${symbol}` : ""}: ${outcomeWords(action)}${classLabel ? `, ${classLabel}` : ""}` : `${outcomeWords(action)}${symbol && !subject.startsWith(symbol) ? ` ${symbol}` : ""}`;
  const entry = decisionSchema.safeParse({
    id: decisionId(ws.decisions, today),
    date: today,
    kind,
    symbol,
    title: `${head}: ${subject}`.slice(0, 120),
    text: [note, act === "vote" && classLabel ? `Class voted: ${classLabel}. Kept beside the class the methodology's tests give; never applied.` : null].filter(Boolean).join("\n\n"),
    filedAt: new Date().toISOString(),
    action,
  });
  if (!entry.success) return { error: "The decision could not be filed as it stands; shorten the note." };
  try {
    await saveDecisions(withDecision(ws.decisions, entry.data, new Date().toISOString()));
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[decide] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}
