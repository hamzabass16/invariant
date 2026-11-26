"use server";

import { revalidatePath } from "next/cache";

import type { InboxState } from "@/app/(app)/statements/actions";
import { addSenders, decideSender, EMPTY_SENDERS, newsletterSendersSchema, type SenderStatus, withRead } from "@/lib/newsletters";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

/**
 * Check for newsletters now: reads this person's new newsletters from the
 * inbox at once, as the morning refresh would, and finds Gmail's forwarding
 * confirmation code for their newsletters address.
 */
export async function checkNewslettersAction(): Promise<InboxState> {
  const none = { message: null, code: null, link: null, forAddress: null, confirmed: false };
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo has fictional newsletters of its own and reads none.", ...none };
  if (ws.error && !ws.setup) return { error: ws.error, ...none };
  const { openStatementsInbox } = await import("@/lib/daily-sync");
  const { session, problem } = await openStatementsInbox();
  if (!session) return { error: problem ?? "The inbox is not set up yet. The person who runs Invariant sets it up once.", ...none };
  try {
    const { openVault } = await import("@/lib/vault");
    const { readNewslettersInto, confirmForwardingInto } = await import("@/lib/inbox-run");
    const vault = await openVault();
    const email = ws.operator.email;
    const now = new Date();
    const fwd = (await confirmForwardingInto(vault, email, session, undefined, now)).requests.find((r) => r.kind === "newsletters") ?? null;
    const run = await readNewslettersInto(vault, email, session, now);
    revalidatePath("/", "layout");
    const message = run ? run.sentence : fwd ? null : "No newsletter from you in the inbox in the last 30 days. Forwarded newsletters appear a few minutes after they arrive.";
    return { error: null, message, code: fwd?.code ?? null, link: fwd?.link ?? null, forAddress: fwd?.forAddress ?? null, confirmed: fwd?.confirmed ?? false, forwarding: fwd?.sentence ?? null };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message, ...none };
    throw e;
  } finally {
    await session.close();
  }
}

const DEMO_KEEPS_NOTHING = "The demo keeps nothing; its senders are fictional.";

/** Reads the senders file, changes it, writes it back; the demo refuses with a sentence. */
async function changeSenders(change: (file: Parameters<typeof decideSender>[0], now: string) => Parameters<typeof decideSender>[0]): Promise<{ error: string | null }> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: DEMO_KEEPS_NOTHING };
  try {
    const { openVault } = await import("@/lib/vault");
    const vault = await openVault();
    const file = (await vault.readJson("newsletter_senders", newsletterSendersSchema)) ?? EMPTY_SENDERS;
    await vault.writeJson("newsletter_senders", change(file, new Date().toISOString()));
    revalidatePath("/setup");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}

/** Keep or remove one proposed sender; a removed one is not proposed again. */
export async function decideSenderAction(address: string, status: Exclude<SenderStatus, "proposed">): Promise<{ error: string | null }> {
  if (status !== "kept" && status !== "removed") return { error: "Keep or remove." };
  return changeSenders((file, now) => decideSender(file, address, status, now));
}

/** Add senders of the person's own: a list of addresses or From lines pasted in. */
export async function addSendersAction(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const text = String(form.get("senders") ?? "").slice(0, 20_000);
  if (!/@/.test(text)) return { error: "No email address in what was pasted. Paste the senders' addresses, or whole From lines." };
  return changeSenders((file, now) => addSenders(file, text, now).file);
}

/**
 * The person opened a newsletter on the Dashboard (Hamza, 18 Oct 2026): its
 * id joins the opened ones in their preferences, so it no longer shows as
 * unread. The demo keeps the mark in the page alone.
 */
export async function markNewsletterReadAction(id: string): Promise<{ error: string | null }> {
  if (!/^[0-9a-f]{16}$/.test(id)) return { error: "Not a newsletter." };
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: null };
  if (ws.preferences.newslettersRead.includes(id)) return { error: null };
  try {
    // No revalidation: the page marks it read itself, and the next load reads the vault.
    await savePreferences({ ...ws.preferences, newslettersRead: withRead(ws.preferences.newslettersRead, id) });
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}
