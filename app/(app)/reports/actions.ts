"use server";

import { revalidatePath } from "next/cache";

import { enrol, enrolment, markHandSent, registryAvailable, withdraw } from "@/lib/registry";
import { mailProblem, sendReport } from "@/lib/report-mail";
import { buildFromVault, keepSent } from "@/lib/report-run";
import { currentZone } from "@/lib/time";
import { defaultSchedule, handSlot, MAX_QUESTIONS, REPORT_KINDS, scheduleSchema, type ReportKind } from "@/lib/report";
import { SyncError } from "@/lib/sync-error";
import { openVault } from "@/lib/vault";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type ReportsState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<ReportsState> {
  try {
    await fn();
    revalidatePath("/reports");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[reports] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** The person's schedule when they have one, so a build now reads their clock and their commentary choice. */
async function current(email: string) {
  if (!registryAvailable()) return defaultSchedule();
  return (await enrolment(email).catch(() => null))?.schedule ?? defaultSchedule();
}

/** Builds a review (or today's dashboard) from the vault and keeps it there. Drive mode only: the demo builds its report on the screen itself. The news and the commentary follow the schedule's choice, so a key is spent only when asked. */
export async function buildNowAction(kind: ReportKind = "today"): Promise<ReportsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo builds its review on this screen; nothing is kept." };
  if (!REPORT_KINDS.includes(kind)) return { error: "Choose the weekly or the monthly." };
  return guarded(async () => {
    const s = await current(ws.operator.email);
    await buildFromVault(await openVault(), new Date(), s.prose && ws.hasModelKey, s.zone, kind);
  });
}

/**
 * Builds and emails a review to the signed-in address now, so the person sees
 * what the schedule will send. The commentary follows the schedule's choice,
 * so a key is spent only when asked. The slot the schedule would send the same
 * review in is marked as sent by hand (`handSlot`), so it never comes twice
 * (4 Nov 2026); a first week's slot still sends the kind not sent here.
 */
async function sendNow(kind: "weekly" | "monthly"): Promise<ReportsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo never sends email." };
  const problem = mailProblem();
  if (problem) return { error: "This deployment cannot send email yet." };
  return guarded(async () => {
    const email = ws.operator.email;
    const e = registryAvailable() ? await enrolment(email).catch(() => null) : null;
    const s = e?.schedule ?? defaultSchedule();
    const vault = await openVault();
    const now = new Date();
    const { report, file, pdf } = await buildFromVault(vault, now, s.prose && ws.hasModelKey, s.zone, kind);
    await sendReport(email, report, pdf);
    await keepSent(vault, file, report.id, new Date());
    const hand = e && report.period ? handSlot(e.schedule, now, e.lastSlot, e.lastOutcome, kind, report.period.to) : null;
    // A slot claimed meanwhile is left to its run; the mark is a courtesy, never a reason to fail the send.
    if (e && hand) await markHandSent(email, hand.slot, hand.outcome, e.lastSlot, e.lastOutcome).catch(() => false);
  });
}

export async function sendNowAction(): Promise<ReportsState> {
  return sendNow("weekly");
}

/** The monthly by hand (4 Nov 2026: the October monthly was lost and nothing could email it again). */
export async function sendMonthlyNowAction(): Promise<ReportsState> {
  return sendNow("monthly");
}

export async function scheduleAction(_prev: ReportsState, form: FormData): Promise<ReportsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo has no schedule." };
  if (!registryAvailable()) return { error: "Scheduled reports are not set up on this deployment." };
  if (form.get("day") === null || form.get("hour") === null) return { error: "Choose a day and an hour." };
  const parsed = scheduleSchema.safeParse({
    day: Number(form.get("day")),
    hour: Number(form.get("hour")),
    zone: currentZone(),
    prose: form.get("prose") === "on",
    cadence: String(form.get("cadence") ?? "both"),
  });
  if (!parsed.success) return { error: "Choose a day, an hour and a cadence." };
  if (parsed.data.prose && !ws.hasModelKey) return { error: "A commentary needs the AI, which is not set up on this deployment yet." };
  const { enrolmentAccess } = await import("@/lib/vault-access");
  const access = await enrolmentAccess();
  if (!access) return { error: "Sign out and sign in again, leaving the folder permission ticked, so the report can read your vault while you are away." };
  return guarded(() => enrol(ws.operator.email, parsed.data, access));
}

export async function withdrawAction(): Promise<ReportsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo has no schedule." };
  return guarded(() => withdraw(ws.operator.email));
}

/** Keeps a question the person wants every review to answer (Hamza, 18 Oct 2026): up to six, in their preferences, answered on their own key when the review is built. */
export async function addQuestionAction(_prev: ReportsState, form: FormData): Promise<ReportsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo answers no questions; your own app does, with the AI." };
  const question = String(form.get("question") ?? "").replace(/\s+/g, " ").trim();
  if (question.length < 3) return { error: "Write the question first." };
  if (question.length > 300) return { error: "Keep the question under 300 characters." };
  const kept = ws.preferences.reviewQuestions;
  if (kept.length >= MAX_QUESTIONS) return { error: `Up to ${MAX_QUESTIONS} questions; remove one first.` };
  if (kept.some((q) => q.toLowerCase() === question.toLowerCase())) return { error: "That question is already kept." };
  return guarded(() => savePreferences({ ...ws.preferences, reviewQuestions: [...kept, question] }));
}

/** Removes one kept question, by its place in the list. */
export async function removeQuestionAction(index: number): Promise<ReportsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo keeps no questions." };
  const kept = ws.preferences.reviewQuestions;
  if (!Number.isInteger(index) || index < 0 || index >= kept.length) return { error: "That question is no longer kept." };
  return guarded(() => savePreferences({ ...ws.preferences, reviewQuestions: kept.filter((_, i) => i !== index) }));
}
