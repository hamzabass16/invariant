"use server";

import { revalidatePath } from "next/cache";

import { signOut } from "@/lib/auth";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type AccountState = { error: string | null };

/** Changes the signed-in account's password; a sentence when it cannot, never the password in a log. */
export async function changePasswordAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo has no account to change." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("again") ?? "")) return { error: "The two new passwords are not the same." };
  try {
    const { changePassword } = await import("@/lib/users");
    await changePassword(ws.operator.email, current, next);
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[account] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/**
 * Delete my account (the beta's outside users, GDPR): everything the
 * deployment keeps about the person goes (`deleteAccount` in
 * lib/beta-run.ts), then they are signed out. Their files stay in their own
 * Drive, which the page says before they press.
 */
export async function deleteAccountAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo has no account." };
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") return { error: "Type delete to confirm." };
  try {
    await (await import("@/lib/beta-run")).deleteAccount(ws.operator.email);
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[account] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
  await signOut({ redirectTo: "/sign-in?deleted=1" });
  return { error: null };
}

/** Signs out and opens the sign-in page. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}

/** Open data, on or off (lib/open-data.ts; Hamza, 9 Nov 2026): off deletes every week the person gave. */
export async function setDonateAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo gives nothing." };
  const on = String(form.get("donate") ?? "") === "on";
  try {
    await savePreferences({ ...ws.preferences, donate: on, updated: new Date().toISOString() });
    if (!on) await (await import("@/lib/registry")).forgetDonations(ws.operator.email).catch(() => undefined);
    revalidatePath("/account");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[account] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/**
 * Help improve Invariant, on or off (lib/improvements.ts): off, nothing more
 * is counted and what this person raised is taken out of the counts.
 */
export async function setImproveAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo counts nothing." };
  const on = String(form.get("improve") ?? "") === "on";
  try {
    await savePreferences({ ...ws.preferences, improve: on, updated: new Date().toISOString() });
    if (!on) await (await import("@/lib/improvements-run")).forgetSignals(ws.operator.email);
    revalidatePath("/account");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[account] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}
