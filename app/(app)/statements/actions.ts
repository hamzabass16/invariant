"use server";

import { revalidatePath } from "next/cache";

import { providerFor } from "@/lib/hosted-model";
import { confirmationOf, type ForwardingKind } from "@/lib/inbox";

import { EMPTY_STATEMENTS, statementsFileSchema, type StatementDoc } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace } from "@/lib/workspace";

type State = { error: string | null };

const MAX_FILES = 6;
const DEMO = "The demo has fictional statements of its own and reads none.";

/** Reads the PDFs the person chose, with the AI; each becomes an entry on the Statements screen, a failure included. */
export async function uploadStatementsAction(_prev: State, form: FormData): Promise<State> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: DEMO };
  if (ws.error && !ws.setup) return { error: ws.error };
  const files = form.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose a statement or a fund report first." };
  if (files.length > MAX_FILES) return { error: `Choose up to ${MAX_FILES} at a time.` };
  try {
    const { openVault } = await import("@/lib/vault");
    const { readStatements } = await import("@/lib/statements-run");
    const vault = await openVault();
    const provider = await providerFor(vault);
    if (!provider) return { error: "The AI is not set up on this deployment yet." };
    const docs = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), via: "upload" as const })));
    await readStatements(vault, provider, docs, new Date());
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { error: null };
}

/** The person has looked at a document's figures against it and uses them. */
export async function confirmStatementAction(id: string): Promise<State> {
  return change(id, (d) => (d.status === "review" ? { ...d, status: "applied", confirmedAt: new Date().toISOString() } : d));
}

/** Removes a document's entry; its figures leave the book with it. */
export async function removeStatementAction(id: string): Promise<State> {
  return change(id, () => null);
}

async function change(id: string, edit: (d: StatementDoc) => StatementDoc | null): Promise<State> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: DEMO };
  if (!/^[0-9a-f]{16}$/.test(id)) return { error: "That document is not in your list." };
  try {
    const { openVault } = await import("@/lib/vault");
    const vault = await openVault();
    const file = (await vault.readJson("statements", statementsFileSchema)) ?? EMPTY_STATEMENTS;
    if (!file.documents.some((d) => d.id === id)) return { error: "That document is no longer in your list." };
    const documents = file.documents.map((d) => (d.id === id ? edit(d) : d)).filter((d): d is StatementDoc => d !== null);
    await vault.writeJson("statements", statementsFileSchema.parse({ ...file, documents, updated: new Date().toISOString() }));
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { error: null };
}

export type InboxState = { error: string | null; message: string | null; code: string | null; link: string | null; forAddress: string | null; confirmed: boolean; forwarding?: string | null };

export type KeptConfirmation = { confirmedAt: string; how: "pressed" | "already" };
export type Arrived = { emails: number; read: number; failed: number; setAside: number; sentence: string; at: string };
export type ForwardingWatch = { error: string | null; forAddress: string | null; confirmed: boolean; code: string | null; link: string | null; forwarding: string | null; seen: boolean; kept: KeptConfirmation | null; arrived: Arrived | null };

/** One look per person and kind every `WATCH_EVERY_MS` at most, whatever the page asks: the inbox is one account for everyone. */
const WATCH_EVERY_MS = 20_000;
const lastWatch = new Map<string, { at: number; state: ForwardingWatch }>();

/**
 * Watches for Gmail's forwarding request to this person's address and
 * confirms it by itself (Hamza, 18 Oct 2026: he added the address in Gmail
 * and the request sat unconfirmed until something read the inbox). The
 * Statements screen and Setup's Newsletters card ask every half minute while they are
 * open, each for its own address; a look reads the confirmations of the
 * last two days, keeps a new one in the vault's `forwarding` file and
 * reports the kept one, so a confirmation shows today and after. On
 * Newsletters the same look reads any newsletter that has just arrived,
 * so a forwarded one appears within a minute, read (Hamza, 18 Oct 2026:
 * "there has to be something that shows me it worked"). The result is
 * kept in memory for twenty seconds so a page asking again, or two pages
 * at once, open the inbox once.
 */
export async function watchForwardingAction(kind: ForwardingKind = "statements"): Promise<ForwardingWatch> {
  const none = { forAddress: null, confirmed: false, code: null, link: null, forwarding: null, seen: false, kept: null, arrived: null };
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: DEMO, ...none };
  if (ws.error && !ws.setup) return { error: ws.error, ...none };
  const email = ws.operator.email;
  const cacheKey = `${email}:${kind}`;
  const recent = lastWatch.get(cacheKey);
  if (recent && Date.now() - recent.at < WATCH_EVERY_MS) return recent.state;
  const { openStatementsInbox } = await import("@/lib/daily-sync");
  const { session, problem } = await openStatementsInbox();
  if (!session) return { error: problem ?? "The statements inbox is not set up yet. The person who runs Invariant sets it up once.", ...none };
  try {
    const { openVault } = await import("@/lib/vault");
    const { confirmForwardingInto, readNewslettersInto } = await import("@/lib/inbox-run");
    const vault = await openVault();
    const now = new Date();
    const { file, requests } = await confirmForwardingInto(vault, email, session, new Date(now.getTime() - 2 * 86_400_000).toISOString(), now);
    const fwd = requests.find((r) => r.kind === kind) ?? null;
    const c = confirmationOf(file, kind);
    const kept: KeptConfirmation | null = c ? { confirmedAt: c.confirmedAt, how: c.how } : null;
    let arrived: Arrived | null = null;
    if (kind === "newsletters") {
      const run = await readNewslettersInto(vault, email, session, now);
      if (run?.emails) {
        arrived = { ...run, at: now.toISOString() };
        revalidatePath("/setup");
        revalidatePath("/after-close");
      }
    }
    const state: ForwardingWatch = fwd ? { error: null, forAddress: fwd.forAddress, confirmed: fwd.confirmed, code: fwd.code, link: fwd.link, forwarding: fwd.sentence, seen: true, kept, arrived } : { error: null, ...none, kept, arrived };
    lastWatch.set(cacheKey, { at: Date.now(), state: { ...state, arrived: null } });
    return state;
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message, ...none };
    throw e;
  } finally {
    await session.close();
  }
}

/**
 * Check the inbox now: reads this person's new statements from the
 * statements inbox at once, as the morning refresh would, and finds Gmail's
 * forwarding confirmation code for them, which they type into Gmail to
 * finish setting up forwarding.
 */
export async function checkInboxAction(): Promise<InboxState> {
  const none = { message: null, code: null, link: null, forAddress: null, confirmed: false };
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: DEMO, ...none };
  if (ws.error && !ws.setup) return { error: ws.error, ...none };
  const { openStatementsInbox } = await import("@/lib/daily-sync");
  const { session, problem } = await openStatementsInbox();
  if (!session) return { error: problem ?? "The statements inbox is not set up yet. The person who runs Invariant sets it up once.", ...none };
  try {
    const { openVault } = await import("@/lib/vault");
    const { readInboxInto, confirmForwardingInto } = await import("@/lib/inbox-run");
    const vault = await openVault();
    const email = ws.operator.email;
    const now = new Date();
    const fwd = (await confirmForwardingInto(vault, email, session, undefined, now)).requests.find((r) => r.kind === "statements") ?? null;
    const run = await readInboxInto(vault, email, session, now);
    revalidatePath("/", "layout");
    const message = run ? run.sentence : fwd ? null : "Nothing from you in the inbox in the last 30 days. Forwarded statements appear a few minutes after they are sent.";
    return { error: null, message, code: fwd?.code ?? null, link: fwd?.link ?? null, forAddress: fwd?.forAddress ?? null, confirmed: fwd?.confirmed ?? false, forwarding: fwd?.sentence ?? null };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message, ...none };
    throw e;
  } finally {
    await session.close();
  }
}
