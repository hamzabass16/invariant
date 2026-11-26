"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { operatorEmails } from "@/lib/deployment";
import { closePull, githubOpsConfig, mergePull } from "@/lib/github-ops";
import { logEvent } from "@/lib/log";
import { SyncError } from "@/lib/sync-error";

/**
 * Merge or close a self-fix pull request from /ops (Hamza, 4 Nov 2026: "you
 * merge"). Each asks the operator check again here, never trusting the page
 * that sent it, and each needs its confirm box ticked. Only a pull request
 * labelled self-fix is touched, and a merge is at the head shown.
 */

type Result = { error: string | null };

async function isOperator(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? "";
  return Boolean(email) && operatorEmails().includes(email);
}

function sentence(e: unknown, fallback: string): string {
  return e instanceof SyncError ? e.message : fallback;
}

export async function mergeSelfFixAction(_prev: Result, form: FormData): Promise<Result> {
  if (!(await isOperator())) return { error: "Only the operator merges from here." };
  if (form.get("confirm") !== "yes") return { error: "Tick the box to say you read it." };
  const cfg = githubOpsConfig();
  if (!cfg?.token) return { error: "No GitHub token is set for this deployment; merge it on GitHub." };
  const number = Number(form.get("number"));
  const sha = String(form.get("sha") ?? "");
  try {
    await mergePull(cfg, number, sha);
    logEvent("info", "self_fix_merged", { pull: number });
  } catch (e) {
    return { error: sentence(e, "The pull request could not be merged.") };
  }
  revalidatePath("/ops");
  return { error: null };
}

export async function closeSelfFixAction(_prev: Result, form: FormData): Promise<Result> {
  if (!(await isOperator())) return { error: "Only the operator closes from here." };
  if (form.get("confirm") !== "yes") return { error: "Tick the box to say you read it." };
  const cfg = githubOpsConfig();
  if (!cfg?.token) return { error: "No GitHub token is set for this deployment; close it on GitHub." };
  const number = Number(form.get("number"));
  try {
    await closePull(cfg, number);
    logEvent("info", "self_fix_closed", { pull: number });
  } catch (e) {
    return { error: sentence(e, "The pull request could not be closed.") };
  }
  revalidatePath("/ops");
  return { error: null };
}

/**
 * Makes an invitation for the beta (Hamza, 9 Nov 2026: invite-only): how many
 * people it lets in, for how many days, and the plan they join on. The code
 * is shown on /ops, which only the operator opens.
 */
export async function makeInviteAction(_prev: Result, form: FormData): Promise<Result> {
  if (!(await isOperator())) return { error: "Only the operator makes invitations." };
  const { isPlan } = await import("@/lib/plans");
  const plan = String(form.get("plan") ?? "");
  try {
    const { makeInvite } = await import("@/lib/users");
    await makeInvite(isPlan(plan) ? plan : null, Number(form.get("uses")), Number(form.get("days")));
    revalidatePath("/ops");
    return { error: null };
  } catch (e) {
    return { error: sentence(e, "The invitation could not be made.") };
  }
}

/** Ends an invitation now; accounts already made with it stay. */
export async function endInviteAction(_prev: Result, form: FormData): Promise<Result> {
  if (!(await isOperator())) return { error: "Only the operator ends invitations." };
  try {
    const { endInvite } = await import("@/lib/users");
    await endInvite(String(form.get("id") ?? ""));
    revalidatePath("/ops");
    return { error: null };
  } catch (e) {
    return { error: sentence(e, "The invitation could not be ended.") };
  }
}
