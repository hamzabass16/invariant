"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { connectionsSchema, EMPTY_CONNECTIONS, etoroCredentialsProblem, flexCredentialsProblem, snapTradeCredentialsProblem, type Connections, type SyncSource } from "@/lib/connections";
import { importBook, MAX_IMPORT_BYTES } from "@/lib/import-book";
import { INPUT_IDS, PROFILE_IDS, setupSchema, type InputId } from "@/lib/setup";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, resetDemo, sampleBook, saveBook, saveSetup } from "@/lib/workspace";

export type SaveState = { error: string | null };

/** Stage 1: saves the profile and inputs. A methodology already confirmed is kept. */
export async function saveSetupAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const ws = await getWorkspace();
  const profile = String(form.get("profile") ?? "");
  const inputs = form.getAll("inputs").map(String).filter((i): i is InputId => (INPUT_IDS as readonly string[]).includes(i));
  if (!(PROFILE_IDS as readonly string[]).includes(profile)) return { error: "Choose who this is for." };
  if (!inputs.length) return { error: "Choose at least one place your money is reported." };
  // A folder that could not be read is not overwritten: the wizard would file a setup without the methodology.
  if (ws.error && ws.mode === "drive") return { error: ws.error };
  const p = profile as (typeof PROFILE_IDS)[number];
  const parsed = setupSchema.safeParse({
    version: 1,
    ownerName: String(form.get("ownerName") ?? "").trim(),
    profile: p,
    // The demo's figures are in its sample's currency, whatever is chosen.
    baseCurrency: storageMode() === "demo" ? sampleBook(p).fx.base : String(form.get("baseCurrency") ?? ""),
    inputs,
    tradesOptions: form.get("tradesOptions") === "yes",
    helperName: String(form.get("helperName") ?? "").trim() || null,
    methodology: ws.baseSetup?.profile === p ? (ws.baseSetup?.methodology ?? null) : null,
    updated: new Date().toISOString(),
  });
  if (!parsed.success) return { error: parsed.error.issues.some((i) => i.path[0] === "ownerName") ? "Add the name the app should use for you." : "Something in the form is missing. Check each step." };
  try {
    await saveSetup(parsed.data);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  // A first build opens Welcome's second part, what to give the app (lib/welcome.ts); finishing it opens the tour. A change goes back to the screens.
  redirect(ws.baseSetup ? "/" : "/welcome?step=rules");
}

export async function startOverAction() {
  await resetDemo();
  revalidatePath("/", "layout");
  redirect("/setup");
}

/**
 * Puts a statement's figures in the vault by hand: an IBKR Flex statement or
 * an Invariant book file (lib/import-book.ts). The file is read on the
 * server, validated, and written as the book; the notes come back to Setup.
 */
export async function importBookAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo has fictional figures of its own." };
  if (!ws.setup) return { error: "Finish the four steps first, then upload a statement." };
  if (ws.error) return { error: ws.error };
  const file = form.get("statement");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a statement first." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "That file is over 8 MB. Export a shorter period." };
  try {
    const imported = importBook(await file.text(), "IBKR");
    await saveBook(imported.book, imported.notes);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { error: null };
}

/**
 * Keeps the person's IBKR Flex Web Service token and query id in their vault
 * and fetches the statement at once, so they see it work. A token IBKR
 * refuses is still kept, with IBKR's reason, so they can correct it.
 */
export async function saveFlexAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo fetches nothing." };
  if (!ws.setup) return { error: "Finish the four steps first." };
  const token = String(form.get("token") ?? "").trim();
  const queryId = String(form.get("queryId") ?? "").trim();
  const problem = flexCredentialsProblem(token, queryId);
  if (problem) return { error: problem };
  const { openVault } = await import("@/lib/vault");
  try {
    const v = await openVault();
    await v.writeJson("connections", connectionsSchema.parse({ ...(await keptConnections(v)), ibkrFlex: { token, queryId, savedAt: new Date().toISOString() } }));
    return await refreshNow(v, "ibkr_flex");
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}

/** Fetch now: the broker statements, for this person, at once; filings, results and the agents follow at the morning refresh and on opening the app. */
export async function fetchNowAction(): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo fetches nothing." };
  const { openVault } = await import("@/lib/vault");
  try {
    return await refreshNow(await openVault());
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}

type OpenVault = Awaited<ReturnType<typeof import("@/lib/vault").openVault>>;

/** The connections as kept, so keeping one never drops another. A file that cannot be read stops the save rather than being written over. */
async function keptConnections(v: OpenVault): Promise<Connections> {
  return (await v.readJson("connections", connectionsSchema)) ?? EMPTY_CONNECTIONS;
}

/** The refresh, at once; the sentence of the source just kept when it failed (or of any that failed, for Fetch now). */
async function refreshNow(v: OpenVault, source: SyncSource | null = null): Promise<SaveState> {
  const { syncVault } = await import("@/lib/daily-sync");
  const started = new Date().toISOString();
  const status = await syncVault(v, new Date(), "by hand", null, true);
  revalidatePath("/", "layout");
  if (!status) return { error: "Nothing to fetch yet: keep a broker connection first." };
  const failed = status.steps.find((s) => (source ? s.source === source : ["ibkr_flex", "snaptrade", "etoro"].includes(s.source)) && s.outcome === "failed" && s.at >= started);
  return { error: failed ? failed.sentence : null };
}

/** Takes one connection out of the vault; the figures already fetched stay. */
async function removeConnection(which: "ibkrFlex" | "snaptrade" | "etoro"): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo fetches nothing." };
  const { openVault } = await import("@/lib/vault");
  try {
    const v = await openVault();
    await v.writeJson("connections", connectionsSchema.parse({ ...(await keptConnections(v)), [which]: null }));
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/setup");
  return { error: null };
}

/** Removes the token and query id from the vault; the figures already fetched stay. */
export async function removeFlexAction(): Promise<SaveState> {
  return removeConnection("ibkrFlex");
}

/**
 * Keeps the person's own SnapTrade Personal key (free, for their own
 * accounts) and fetches at once. A key SnapTrade refuses is still kept, with
 * the reason, so they can correct it; one with no broker connected yet says
 * to connect one.
 */
export async function saveSnapTradeAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo fetches nothing." };
  if (!ws.setup) return { error: "Finish the four steps first." };
  const clientId = String(form.get("clientId") ?? "").trim();
  const consumerKey = String(form.get("consumerKey") ?? "").trim();
  const problem = snapTradeCredentialsProblem(clientId, consumerKey);
  if (problem) return { error: problem };
  const { openVault } = await import("@/lib/vault");
  try {
    const v = await openVault();
    await v.writeJson("connections", connectionsSchema.parse({ ...(await keptConnections(v)), snaptrade: { clientId, consumerKey, savedAt: new Date().toISOString() } }));
    return await refreshNow(v, "snaptrade");
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}

export async function removeSnapTradeAction(): Promise<SaveState> {
  return removeConnection("snaptrade");
}

/**
 * Opens SnapTrade's own page to connect a broker to the person's key, asked
 * for read-only; it comes back to Setup. The app never sees the broker's
 * password.
 */
export async function connectSnapTradeAction(): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo connects nothing." };
  const { openVault } = await import("@/lib/vault");
  let url: string;
  try {
    const kept = await keptConnections(await openVault());
    if (!kept.snaptrade) return { error: "Keep your SnapTrade client id and consumer key first." };
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const { snapTradeConnectUrl } = await import("@/lib/snaptrade-api");
    url = await snapTradeConnectUrl(kept.snaptrade, `${proto}://${host}/setup?connected=snaptrade`);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  // SnapTrade's own page, outside the app.
  redirect(url as Route);
}

/** Keeps the person's eToro keys (Read permission, Real environment) and fetches at once. */
export async function saveEtoroAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo fetches nothing." };
  if (!ws.setup) return { error: "Finish the four steps first." };
  const apiKey = String(form.get("apiKey") ?? "").trim();
  const userKey = String(form.get("userKey") ?? "").trim();
  const problem = etoroCredentialsProblem(apiKey, userKey);
  if (problem) return { error: problem };
  const { openVault } = await import("@/lib/vault");
  try {
    const v = await openVault();
    await v.writeJson("connections", connectionsSchema.parse({ ...(await keptConnections(v)), etoro: { apiKey, userKey, savedAt: new Date().toISOString() } }));
    return await refreshNow(v, "etoro");
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}

export async function removeEtoroAction(): Promise<SaveState> {
  return removeConnection("etoro");
}

/**
 * Turns on the morning refresh for someone with no review schedule: an
 * enrolment that builds no review ("none"), so the cron can open their vault
 * while they are away. A schedule already kept on Reviews refreshes too.
 */
export async function morningRefreshAction(): Promise<SaveState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo fetches nothing." };
  const { enrol, enrolment, registryAvailable, renewAccess } = await import("@/lib/registry");
  if (!registryAvailable()) return { error: "This deployment has no schedule store yet, so nothing can run while you are away." };
  try {
    const { enrolmentAccess } = await import("@/lib/vault-access");
    const access = await enrolmentAccess();
    if (!access) return { error: "Sign out and sign in again, leaving the folder permission ticked, so the refresh can read your vault while you are away." };
    // Already on: the sign-in it runs on is renewed, so a token Google ended is replaced by this one.
    if (await enrolment(ws.operator.email)) {
      await renewAccess(ws.operator.email, access);
      return { error: null };
    }
    const { defaultSchedule } = await import("@/lib/report");
    await enrol(ws.operator.email, { ...defaultSchedule(), cadence: "none" }, access);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/setup");
  return { error: null };
}
