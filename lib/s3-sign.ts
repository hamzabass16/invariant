/**
 * AWS Signature Version 4 for one S3-style request, with WebCrypto, so it
 * runs in a Vercel function today and in a browser later (PR 4). Pure: no
 * network, no clock of its own; the caller passes the moment, so the check
 * can hold it against the signature AWS publishes for its example request.
 *
 * Only what a bucket vault needs: path-style URLs, a payload hash, HEAD, GET,
 * PUT and DELETE. Nothing here logs; the secret enters as a parameter and
 * leaves as a key-derived signature.
 */

export type S3Credentials = { accessKeyId: string; secretAccessKey: string; region: string };

export type SignedRequest = { url: string; headers: Record<string, string> };

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, encoder.encode(data));
}

/** RFC 3986 encoding of one path segment, as S3 expects (S3 wants "/" kept and everything else strict). */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

/** 20130524T000000Z and 20130524 from a Date. */
export function amzDate(now: Date): { stamp: string; day: string } {
  const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return { stamp, day: stamp.slice(0, 8) };
}

/**
 * Signs one request. `url` already carries the path (and a query, if any);
 * `payloadHash` is the SHA-256 of the body, or of the empty string.
 */
export async function signS3Request(
  input: { method: string; url: string; headers?: Record<string, string>; payloadHash: string; now: Date },
  creds: S3Credentials,
): Promise<SignedRequest> {
  const u = new URL(input.url);
  const { stamp, day } = amzDate(input.now);
  // Header names lower-cased once, so canonical form and the sent request agree.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v;
  headers.host = u.host;
  headers["x-amz-content-sha256"] = input.payloadHash;
  headers["x-amz-date"] = stamp;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((h) => `${h}:${headers[h].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const query = Array.from(u.searchParams.entries())
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  // The path as S3 canonicalises it: each segment decoded, then strictly re-encoded ("$" is %24, "/" stays).
  const canonicalPath = encodePath(decodeURIComponent(u.pathname || "/"));
  const canonical = [input.method.toUpperCase(), canonicalPath, query, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${day}/${creds.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonical)].join("\n");
  const kDate = await hmac(encoder.encode(`AWS4${creds.secretAccessKey}`), day);
  const kRegion = await hmac(kDate, creds.region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, toSign));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== "host") out[k] = v;
  out.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  u.pathname = canonicalPath;
  return { url: u.toString(), headers: out };
}
