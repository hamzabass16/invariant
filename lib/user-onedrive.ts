import "server-only";

import type { z } from "zod";

import { SyncError } from "@/lib/sync-error";
import { VAULT_KEYS, type VaultKey } from "@/lib/vault-keys";

/**
 * The person's own Invariant app folder in their OneDrive (personal, work
 * or school; a SharePoint-backed OneDrive is the same drive): the Microsoft
 * counterpart of lib/user-drive.ts, and the only file allowed to call
 * Microsoft Graph for files (npm run check:guard).
 *
 * With Files.ReadWrite.AppFolder the app sees one folder, Apps/Portfolio OS,
 * which Graph creates on the first write, and nothing else in the drive. Each
 * file is found by its fixed name in that folder. Plain fetch, no SDK.
 */

const PROD = "https://graph.microsoft.com/v1.0";
// A test may point the adapter at a fake Graph (scripts/check-vault.ts); a deployment never can.
const BASE = process.env.NODE_ENV !== "production" && process.env.PORTFOLIO_OS_GRAPH_BASE ? process.env.PORTFOLIO_OS_GRAPH_BASE : PROD;
const ROOT = `${BASE}/me/drive/special/approot`;

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    throw new SyncError("Could not reach OneDrive. Try again in a moment.", "graph unreachable");
  }
  if (res.ok) return res;
  if (res.status === 401) throw new SyncError("Your Microsoft sign-in has run out. Sign out and sign in again.", "graph 401");
  if (res.status === 403) throw new SyncError("OneDrive refused the request. Sign out, sign in again, and accept the folder permission. On a work account an administrator may first have to approve Invariant.", "graph 403");
  if (res.status === 404) throw new SyncError("An Invariant file is missing from your OneDrive. It may have been deleted.", "graph 404");
  if (res.status === 429 || res.status === 503) throw new SyncError("OneDrive is busy. Try again in a moment.", `graph ${res.status}`);
  throw new SyncError("OneDrive returned an error. Try again in a moment.", `graph ${res.status}`);
}

type Child = { id: string; name: string };

/** The folder's children; an empty folder, or one not created yet, is an empty list. */
async function children(token: string): Promise<Child[]> {
  let res: Response;
  try {
    res = await call(token, `${ROOT}/children?$select=id,name&$top=200`);
  } catch (e) {
    // Graph answers 404 for an app folder that no write has created yet; that is "no files", not a missing file.
    if (e instanceof SyncError && e.logDetail === "graph 404") return [];
    throw e;
  }
  const body = (await res.json()) as { value?: unknown };
  if (!Array.isArray(body.value)) throw new SyncError("OneDrive returned something unexpected. Try again in a moment.", "graph children not a list");
  return body.value.filter((c): c is Child => !!c && typeof c === "object" && typeof (c as Child).id === "string" && typeof (c as Child).name === "string");
}

/** Where a key's file lives: `key.json`, or for the attached document, any file named `methodology_source.<ext>`. */
function matches(key: VaultKey, name: string): boolean {
  return key === "methodology_source" ? name === key || name.startsWith(`${key}.`) : name === `${key}.json`;
}

async function find(token: string, key: VaultKey): Promise<Child | null> {
  return (await children(token)).find((c) => matches(key, c.name)) ?? null;
}

/**
 * Reads one of the app's files, validated against its schema. Null only when
 * the file does not exist yet; a file that exists but cannot be read throws,
 * so it never looks like an empty portfolio.
 */
export async function readJson<T>(token: string, key: VaultKey, schema: z.ZodType<T>): Promise<T | null> {
  const item = await find(token, key);
  if (!item) return null;
  const res = await call(token, `${BASE}/me/drive/items/${item.id}/content`);
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new SyncError(`Your ${key.replace("_", " ")} file in OneDrive is not readable. Nothing was changed.`, `${key} not JSON`);
  }
  const ok = schema.safeParse(parsed);
  if (!ok.success) throw new SyncError(`Your ${key.replace("_", " ")} file in OneDrive has an unexpected shape. Nothing was changed.`, `${key} failed schema`);
  return ok.data;
}

async function upload(token: string, name: string, mime: string, body: Uint8Array | string): Promise<string> {
  // A simple upload: Graph takes up to 250 MB this way, far beyond any file the app keeps.
  const res = await call(token, `${ROOT}:/${encodeURIComponent(name)}:/content`, { method: "PUT", headers: { "content-type": mime }, body: body as BodyInit });
  const out = (await res.json().catch(() => ({}))) as { id?: unknown };
  if (typeof out.id !== "string") throw new SyncError("Could not save to your OneDrive.", `${name} upload had no id`);
  return out.id;
}

export async function writeJson(token: string, key: VaultKey, data: unknown): Promise<void> {
  await upload(token, `${key}.json`, "application/json", JSON.stringify(data, null, 1));
}

/** Keeps the attached methodology document in the person's folder, under the app's name for it plus the document's own extension. */
export async function saveDocument(token: string, name: string, mime: string, bytes: Uint8Array): Promise<string> {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
  // One attached document at a time: an earlier one with another extension goes to the recycle bin first.
  const old = (await children(token)).filter((c) => matches("methodology_source", c.name) && c.name !== `methodology_source${ext}`);
  for (const c of old) await call(token, `${BASE}/me/drive/items/${c.id}`, { method: "DELETE" });
  return upload(token, `methodology_source${ext}`, mime, bytes);
}

export async function removeFile(token: string, key: VaultKey): Promise<void> {
  const item = await find(token, key);
  if (!item) return;
  // Graph's DELETE moves the item to the drive's recycle bin, where the person can restore it.
  await call(token, `${BASE}/me/drive/items/${item.id}`, { method: "DELETE" });
}

/** Every key, for the check: the adapter knows the same fixed list as the others. */
export const KEYS = VAULT_KEYS;
