import "server-only";

import { cache } from "react";
import type { z } from "zod";

import { SyncError } from "@/lib/sync-error";
import { VAULT_KEYS, type VaultKey } from "@/lib/vault-keys";

/**
 * The person's own "Portfolio OS" folder in their Google Drive: the only place
 * the app keeps anything of theirs. With the drive.file scope the app sees the
 * files it created and nothing else in their Drive, and this is the only file
 * allowed to write there (npm run check:guard).
 *
 * Each file is found by a private tag (appProperties portfolioOs=<key>), not
 * by its name, so renaming or moving it in Drive does not lose it. Plain
 * fetch, no googleapis dependency.
 *
 * Speed: one request lists every tagged file once (id and modifiedTime by
 * key), so ten reads cost one listing and their downloads, not twenty calls;
 * and a file whose modifiedTime has not changed since a warm instance last
 * parsed it is served from memory, keyed by id and modifiedTime, so a stale
 * copy can never be served. The cache holds parsed JSON only, never a token.
 * A file this instance just wrote is read back as written (`written`): the
 * listing is a search, which Drive brings up to date a few seconds after a
 * write, so right after a save it can still name the file's earlier time
 * and would otherwise serve the earlier copy (a dismissed alert back on
 * Notifications until the next visit; Hamza, 19 Oct 2026).
 */

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TAG = "portfolioOs";
const FOLDER_KEY = "folder";

/** The files the app keeps (lib/vault-keys.ts); nothing outside the list is ever written. */
export const DRIVE_KEYS = VAULT_KEYS;
export type DriveKey = VaultKey;
/** The review decks kept before 4 Nov 2026, still listed so a folder that holds one reads as before; none is written now. */
const DECK_KEYS = ["deck_weekly", "deck_monthly"] as const;
/** The reviews as PDFs (lib/review-pdf.ts): one per kind, the newest kept and the one before moved to the bin (Hamza, 18 Oct 2026). */
export const REPORT_KEYS = ["report_weekly", "report_monthly"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** A Drive call that has not answered in this long is a sentence, not a page that never loads. */
const CALL_TIMEOUT_MS = 20_000;

async function call(token: string, url: string, init: RequestInit = {}, timeoutMs = CALL_TIMEOUT_MS): Promise<Response> {
  let res: Response;
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  try {
    res = await fetch(url, { ...init, signal, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new SyncError(`Google Drive did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again in a moment.`, "drive timeout");
    throw new SyncError("Could not reach Google Drive. Try again in a moment.", "drive unreachable");
  }
  if (res.ok) return res;
  if (res.status === 401) throw new SyncError("Your Google sign-in has run out. Sign out and sign in again.", "drive 401");
  if (res.status === 403) throw new SyncError("Google Drive refused the request. Sign out, sign in again, and leave the Drive box ticked.", "drive 403");
  if (res.status === 404) throw new SyncError("An Invariant file is missing from your Drive. It may have been deleted.", "drive 404");
  throw new SyncError("Google Drive returned an error. Try again in a moment.", `drive ${res.status}`);
}

type Entry = { id: string; modifiedTime: string };

/** Every tagged file the app can see, newest first per key; one listing per request. */
const index = cache(async (token: string): Promise<Map<string, Entry>> => {
  // Drive accepts the tag only as a key and value pair, so the listing names every file the app
  // keeps (the folder and each vault key); a tag with a key alone comes back 400.
  const tagged = [FOLDER_KEY, ...DRIVE_KEYS, ...DECK_KEYS, ...REPORT_KEYS].map((k) => `appProperties has { key='${TAG}' and value='${k}' }`).join(" or ");
  const q = `(${tagged}) and trashed=false`;
  const started = Date.now();
  const res = await call(token, `${API}?${new URLSearchParams({ q, fields: "files(id,modifiedTime,appProperties)", orderBy: "modifiedTime desc", pageSize: "100", spaces: "drive" })}`);
  const body = (await res.json()) as { files?: { id?: string; modifiedTime?: string; appProperties?: Record<string, string> }[] };
  const out = new Map<string, Entry>();
  for (const f of body.files ?? []) {
    const key = f.appProperties?.[TAG];
    if (key && f.id && !out.has(key)) out.set(key, { id: f.id, modifiedTime: f.modifiedTime ?? "" });
  }
  // Timings only, never a name or a figure.
  console.info(`[drive] listing ${Date.now() - started} ms`);
  return out;
});

async function findId(token: string, key: string): Promise<string | null> {
  return (await index(token)).get(key)?.id ?? null;
}

/** Parsed files by id and modifiedTime, for the life of a warm instance; bounded so it never grows past a few people's folders. */
const parsedCache = new Map<string, unknown>();
const PARSED_CACHE_MAX = 64;
function remember(k: string, v: unknown) {
  if (parsedCache.size >= PARSED_CACHE_MAX) parsedCache.delete(parsedCache.keys().next().value!);
  parsedCache.set(k, v);
}

/** What this instance last wrote to each file, with the time Drive gave the write, so a listing that still names an earlier time serves the copy written and never the one before. */
const written = new Map<string, { modifiedTime: string; parsed: unknown }>();
function noteWritten(id: string, modifiedTime: string, parsed: unknown) {
  if (!modifiedTime) return;
  if (written.size >= PARSED_CACHE_MAX) written.delete(written.keys().next().value!);
  written.set(id, { modifiedTime, parsed });
  remember(`${id}@${modifiedTime}`, parsed);
}

async function ensureFolder(token: string): Promise<string> {
  const id = await findId(token, FOLDER_KEY);
  if (id) return id;
  const res = await call(token, `${API}?fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Portfolio OS", mimeType: "application/vnd.google-apps.folder", appProperties: { [TAG]: FOLDER_KEY } }),
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new SyncError("Could not create the Portfolio OS folder in your Drive.", "folder create had no id");
  return body.id;
}

/**
 * A file's bytes, asked for a second time when Drive has not answered the
 * first request within HEDGE_MS. Drive's downloads are small here (tens of
 * kilobytes) but now and then one waits seconds for no reason of its own;
 * whichever copy arrives first is used and the other is cancelled. Both are
 * the same read of the same file, so nothing is ever written twice.
 */
const HEDGE_MS = 900;
async function download(token: string, id: string): Promise<string> {
  const url = `${API}/${id}?alt=media`;
  const controllers: AbortController[] = [];
  const attempt = () => {
    const c = new AbortController();
    controllers.push(c);
    return call(token, url, { signal: c.signal }).then((res) => res.text());
  };
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let attempts = 0;
    let failures = 0;
    let firstError: unknown = null;
    const finish = () => {
      settled = true;
      clearTimeout(timer);
      for (const c of controllers) c.abort();
    };
    const launch = () => {
      attempts += 1;
      attempt().then(
        (text) => {
          if (settled) return;
          finish();
          resolve(text);
        },
        (e: unknown) => {
          if (settled) return;
          firstError ??= e;
          failures += 1;
          // A refusal (401, 403, 404) is the answer, not a slow request: it is said at once.
          const refused = e instanceof SyncError && /^drive (401|403|404)$/.test(e.logDetail ?? "");
          if (!refused && attempts < 2) {
            clearTimeout(timer);
            launch(); // a failed first request is asked once more, at once
            return;
          }
          if (refused || failures >= attempts) {
            finish();
            reject(firstError);
          }
        },
      );
    };
    const timer = setTimeout(() => {
      if (!settled && attempts < 2) launch();
    }, HEDGE_MS);
    launch();
  });
}

/**
 * Reads one of the app's files, validated against its schema. Null only when
 * the file does not exist yet; a file that exists but cannot be read throws,
 * so it never looks like an empty portfolio.
 */
export async function readJson<T>(token: string, key: DriveKey, schema: z.ZodType<T>): Promise<T | null> {
  const entry = (await index(token)).get(key);
  if (!entry) return null;
  const cacheKey = `${entry.id}@${entry.modifiedTime}`;
  let parsed: unknown;
  const last = written.get(entry.id);
  if (last && (!entry.modifiedTime || entry.modifiedTime < last.modifiedTime)) parsed = last.parsed;
  else if (entry.modifiedTime && parsedCache.has(cacheKey)) parsed = parsedCache.get(cacheKey);
  else {
    const text = await download(token, entry.id);
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SyncError(`Your ${key.replace("_", " ")} file in Drive is not readable. Nothing was changed.`, `${key} not JSON`);
    }
    if (entry.modifiedTime) remember(cacheKey, parsed);
  }
  const ok = schema.safeParse(parsed);
  if (!ok.success) throw new SyncError(`Your ${key.replace("_", " ")} file in Drive has an unexpected shape. Nothing was changed.`, `${key} failed schema`);
  return ok.data;
}

/** A metadata part and a media part in one upload body. */
function multipart(meta: Record<string, unknown>, mime: string, blob: Uint8Array): { body: Uint8Array; type: string } {
  const boundary = `pos${crypto.randomUUID().replace(/-/g, "")}`;
  const head = new TextEncoder().encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + blob.length + tail.length);
  body.set(head, 0);
  body.set(blob, head.length);
  body.set(tail, head.length + blob.length);
  return { body, type: `multipart/related; boundary=${boundary}` };
}

async function upsert(token: string, key: DriveKey, name: string, mime: string, data: Uint8Array | string): Promise<{ id: string; modifiedTime: string }> {
  const id = await findId(token, key);
  const blob = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (id) {
    const res = await call(token, `${UPLOAD}/${id}?uploadType=media&fields=id,modifiedTime`, { method: "PATCH", headers: { "content-type": mime }, body: blob as BodyInit });
    const out = (await res.json().catch(() => ({}))) as { modifiedTime?: string };
    (await index(token)).set(key, { id, modifiedTime: out.modifiedTime ?? "" });
    return { id, modifiedTime: out.modifiedTime ?? "" };
  }
  const folder = await ensureFolder(token);
  const { body, type } = multipart({ name, parents: [folder], mimeType: mime, appProperties: { [TAG]: key } }, mime, blob);
  const res = await call(token, `${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, { method: "POST", headers: { "content-type": type }, body: body as BodyInit });
  const out = (await res.json()) as { id?: string; modifiedTime?: string };
  if (!out.id) throw new SyncError("Could not save to your Drive.", `${key} create had no id`);
  (await index(token)).set(key, { id: out.id, modifiedTime: out.modifiedTime ?? "" });
  return { id: out.id, modifiedTime: out.modifiedTime ?? "" };
}

export async function writeJson(token: string, key: DriveKey, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 1);
  const { id, modifiedTime } = await upsert(token, key, `${key}.json`, "application/json", text);
  // Read back as written until the listing catches up; a copy of the text, so a caller's later change to `data` is not served.
  noteWritten(id, modifiedTime, JSON.parse(text));
}

/** Keeps the attached methodology document in the person's folder, next to what was drafted from it. */
export async function saveDocument(token: string, name: string, mime: string, bytes: Uint8Array): Promise<string> {
  return (await upsert(token, "methodology_source", name, mime, bytes)).id;
}

/** A Drive file id as Drive writes them; anything else is never put in a URL. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * Opens a resumable upload of the methodology document into the person's
 * folder, for their browser to send the file to Drive itself (Hamza, 19 Nov
 * 2026: a 5.6 MB methodology was over what a request to the app may carry).
 * The session is opened for the app's own origin, which is what lets the
 * browser send to it; the address it returns is good for that one file and
 * carries no token. The file kept before is replaced in place.
 */
export async function startDocumentUpload(token: string, name: string, mime: string, size: number, origin: string): Promise<string> {
  const id = await findId(token, "methodology_source");
  const meta = id ? { name, mimeType: mime } : { name, parents: [await ensureFolder(token)], mimeType: mime, appProperties: { [TAG]: "methodology_source" } };
  const res = await call(token, id ? `${UPLOAD}/${id}?uploadType=resumable` : `${UPLOAD}?uploadType=resumable`, {
    method: id ? "PATCH" : "POST",
    headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-type": mime, "x-upload-content-length": String(size), origin },
    body: JSON.stringify(meta),
  });
  const at = res.headers.get("location");
  if (!at || !at.startsWith(`${UPLOAD}`)) throw new SyncError("Google Drive did not open the upload. Try again in a moment.", "resumable upload had no location");
  return at;
}

/** The methodology document the browser sent to the folder, read back; refuses any file the app did not keep as that document. */
export async function readDocument(token: string, id: string): Promise<{ name: string; mime: string; bytes: Uint8Array }> {
  if (!DRIVE_ID.test(id)) throw new SyncError("That upload did not come back from your Drive. Try again.", "document id malformed");
  const meta = (await (await call(token, `${API}/${id}?fields=name,mimeType,appProperties`)).json()) as { name?: string; mimeType?: string; appProperties?: Record<string, string> };
  if (meta.appProperties?.[TAG] !== "methodology_source") throw new SyncError("That file is not the methodology document Invariant keeps in your Drive.", "not the methodology source");
  const res = await call(token, `${API}/${id}?alt=media`, {}, 60_000);
  return { name: meta.name ?? "methodology", mime: meta.mimeType ?? "", bytes: new Uint8Array(await res.arrayBuffer()) };
}

/**
 * Keeps a review's PDF in the person's folder as it is (no conversion),
 * the previous one of the same kind to the bin, where they
 * can restore it; the link is Drive's own viewer.
 */
export async function savePdf(token: string, key: ReportKey, name: string, pdf: Uint8Array): Promise<{ id: string; url: string }> {
  const before = await findId(token, key);
  const folder = await ensureFolder(token);
  const { body, type } = multipart({ name: name.replace(/\.pdf$/i, ""), parents: [folder], mimeType: "application/pdf", appProperties: { [TAG]: key } }, "application/pdf", pdf);
  const res = await call(token, `${UPLOAD}?uploadType=multipart&fields=id,modifiedTime,webViewLink`, { method: "POST", headers: { "content-type": type }, body: body as BodyInit });
  const out = (await res.json()) as { id?: string; modifiedTime?: string; webViewLink?: string };
  if (!out.id) throw new SyncError("Could not keep the report in your Drive.", `${key} create had no id`);
  (await index(token)).set(key, { id: out.id, modifiedTime: out.modifiedTime ?? "" });
  if (before && before !== out.id) {
    await call(token, `${API}/${before}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) }).catch((e: unknown) => {
      console.error(`[drive] previous report kept: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "failed"}`);
    });
  }
  const url = out.webViewLink && /^https:\/\/drive\.google\.com\//.test(out.webViewLink) ? out.webViewLink : `https://drive.google.com/file/d/${out.id}/view`;
  return { id: out.id, url };
}

export async function removeFile(token: string, key: DriveKey): Promise<void> {
  const id = await findId(token, key);
  if (!id) return;
  // Moved to the person's Drive bin, where they can restore it; never deleted outright.
  await call(token, `${API}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) });
  (await index(token)).delete(key);
}
