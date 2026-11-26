import "server-only";

import { z } from "zod";

import { encodePath, sha256Hex, signS3Request, type S3Credentials } from "@/lib/s3-sign";
import { SyncError } from "@/lib/sync-error";
import type { VaultKey } from "@/lib/vault-keys";

/**
 * A bucket in the person's own cloud account, for the strictest: AWS S3,
 * Cloudflare R2, Backblaze B2, Google Cloud Storage (interoperability mode),
 * MinIO, or anything else that speaks the S3 API. The third vault adapter,
 * and the only file allowed to sign S3 requests (npm run check:guard).
 *
 * The same files, under one prefix, path-style
 * (https://endpoint/bucket/prefix/key.json). Removing a file copies it under
 * prefix/bin/ first, since a bucket has no recycle bin of its own. Plain
 * fetch and lib/s3-sign.ts, no SDK.
 */

const httpsOnly = process.env.NODE_ENV === "production";

export const bucketConfigSchema = z.object({
  /** https://s3.eu-central-1.amazonaws.com, https://<account>.r2.cloudflarestorage.com, https://s3.us-west-004.backblazeb2.com ... */
  endpoint: z
    .string()
    .trim()
    .url()
    .refine((u) => (httpsOnly ? u.startsWith("https://") : /^https?:\/\//.test(u)), "The endpoint must start with https://"),
  region: z.string().trim().min(1).max(40).default("auto"),
  bucket: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, "A bucket name is lower-case letters, digits, dots and dashes."),
  prefix: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9._/-]*$/, "A prefix is letters, digits, dots, dashes and slashes.")
    .transform((p) => p.replace(/^\/+|\/+$/g, ""))
    .default("portfolio-os"),
  accessKeyId: z.string().trim().min(1).max(128),
  secretAccessKey: z.string().trim().min(1).max(256),
});
export type BucketConfig = z.infer<typeof bucketConfigSchema>;

/** The bucket in the person's words, without a credential. */
export function describeBucket(c: BucketConfig): string {
  return `the bucket ${c.bucket} at ${new URL(c.endpoint).host}`;
}

function creds(c: BucketConfig): S3Credentials {
  return { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, region: c.region };
}

function objectUrl(c: BucketConfig, objectKey: string): string {
  const base = c.endpoint.replace(/\/+$/, "");
  return `${base}/${encodePath(c.bucket)}/${encodePath(objectKey)}`;
}

function objectKey(c: BucketConfig, key: VaultKey, name = `${key}.json`): string {
  return c.prefix ? `${c.prefix}/${name}` : name;
}

async function send(c: BucketConfig, method: string, url: string, body: Uint8Array | null, headers: Record<string, string> = {}): Promise<Response> {
  const payloadHash = await sha256Hex(body ?? "");
  const signed = await signS3Request({ method, url, headers, payloadHash, now: new Date() }, creds(c));
  let res: Response;
  try {
    res = await fetch(signed.url, { method, headers: signed.headers, body: body as BodyInit | null, cache: "no-store" });
  } catch {
    throw new SyncError("Could not reach your bucket. Check the endpoint, then try again.", "bucket unreachable");
  }
  if (res.ok || res.status === 404) return res;
  if (res.status === 401 || res.status === 403) throw new SyncError("Your bucket refused the credentials. Check the access key, the secret and the bucket's policy.", `bucket ${res.status}`);
  if (res.status === 301 || res.status === 307) throw new SyncError("Your bucket is in another region. Check the endpoint and the region.", `bucket ${res.status}`);
  throw new SyncError("Your bucket returned an error. Try again in a moment.", `bucket ${res.status}`);
}

/**
 * Reads one of the app's files, validated against its schema. Null only when
 * the file does not exist yet; a file that exists but cannot be read throws.
 */
export async function readJson<T>(c: BucketConfig, key: VaultKey, schema: z.ZodType<T>): Promise<T | null> {
  const res = await send(c, "GET", objectUrl(c, objectKey(c, key)), null);
  if (res.status === 404) return null;
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new SyncError(`Your ${key.replace("_", " ")} file in the bucket is not readable. Nothing was changed.`, `${key} not JSON`);
  }
  const ok = schema.safeParse(parsed);
  if (!ok.success) throw new SyncError(`Your ${key.replace("_", " ")} file in the bucket has an unexpected shape. Nothing was changed.`, `${key} failed schema`);
  return ok.data;
}

async function put(c: BucketConfig, objectKey: string, mime: string, body: Uint8Array): Promise<void> {
  const res = await send(c, "PUT", objectUrl(c, objectKey), body, { "content-type": mime });
  if (res.status === 404) throw new SyncError("Your bucket was not found. Check the bucket name and the endpoint.", "bucket put 404");
}

export async function writeJson(c: BucketConfig, key: VaultKey, data: unknown): Promise<void> {
  await put(c, objectKey(c, key), "application/json", new TextEncoder().encode(JSON.stringify(data, null, 1)));
}

/** Keeps the attached methodology document under the app's name for it plus the document's own extension. */
export async function saveDocument(c: BucketConfig, name: string, mime: string, bytes: Uint8Array): Promise<string> {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
  const k = objectKey(c, "methodology_source", `methodology_source${ext}`);
  await put(c, k, mime, bytes);
  return k;
}

/** The object keys under the prefix that belong to `key` (one, or for the attached document any extension). */
async function listKeys(c: BucketConfig, key: VaultKey): Promise<string[]> {
  const prefix = objectKey(c, key, key);
  const url = `${c.endpoint.replace(/\/+$/, "")}/${encodePath(c.bucket)}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=50`;
  const res = await send(c, "GET", url, null);
  if (res.status === 404) throw new SyncError("Your bucket was not found. Check the bucket name and the endpoint.", "bucket list 404");
  const xml = await res.text();
  const keys = Array.from(xml.matchAll(/<Key>([^<]*)<\/Key>/g), (m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  return keys.filter((k) => k === `${prefix}.json` || (key === "methodology_source" && (k === prefix || k.startsWith(`${prefix}.`))));
}

/** A bucket has no bin, so the file is copied under prefix/bin/ before it goes; the probe alone is simply deleted. */
export async function removeFile(c: BucketConfig, key: VaultKey): Promise<void> {
  const keys = key === "probe" ? [objectKey(c, key)] : await listKeys(c, key);
  for (const k of keys) {
    if (key !== "probe") {
      const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
      const binKey = `${c.prefix ? `${c.prefix}/` : ""}bin/${stamp}-${k.slice(k.lastIndexOf("/") + 1)}`;
      const copy = await send(c, "PUT", objectUrl(c, binKey), null, { "x-amz-copy-source": `/${encodePath(c.bucket)}/${encodePath(k)}` });
      if (copy.status === 404) continue;
    }
    await send(c, "DELETE", objectUrl(c, k), null);
  }
}

/** Writes, reads back and removes a probe file, so a pasted bucket is known to work before it is kept. */
export async function probe(c: BucketConfig): Promise<void> {
  const checked = new Date().toISOString();
  await writeJson(c, "probe", { checked });
  const back = await readJson(c, "probe", z.object({ checked: z.string() }));
  if (back?.checked !== checked) throw new SyncError("The bucket accepted a file but did not return it. Check that the bucket is not public-read-only or versioned oddly.", "probe mismatch");
  await removeFile(c, "probe");
}
