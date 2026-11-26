import "server-only";

import { sessionTokens, type ProviderTokens } from "@/lib/session-tokens";
import { SyncError } from "@/lib/sync-error";

/**
 * The signed-in person's own Google access token, for their own Drive folder.
 *
 * It lives in the encrypted session cookie (lib/auth.ts, read by
 * lib/session-tokens.ts). Server components cannot rewrite that cookie, so
 * when the hour-long access token has run out it is refreshed here and kept
 * in memory until it expires again, keyed by a hash of the refresh token.
 * Nothing here logs or returns a token in an error.
 */

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const fresh = new Map<string, { access: string; expires: number }>();

async function googleTokens(): Promise<ProviderTokens | null> {
  const s = await sessionTokens();
  return s?.provider === "google" ? s.tokens : null;
}

async function keyOf(refresh: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(refresh)));
  return Buffer.from(bytes).toString("hex").slice(0, 32);
}

/** The refresh token of the signed-in person, for enrolling in the scheduled report; null when the sign-in has none. */
export async function googleRefreshToken(): Promise<string | null> {
  const g = await googleTokens();
  return g?.folder && g.refresh ? g.refresh : null;
}

/** Whether the person granted the Drive permission at sign-in. */
export async function driveGranted(): Promise<boolean> {
  return !!(await googleTokens())?.folder;
}

export async function driveAccessToken(): Promise<string> {
  const g = await googleTokens();
  if (!g) throw new SyncError("You are not signed in to Google. Sign out and sign in again.", "no google tokens in session");
  if (!g.folder) {
    throw new SyncError("Invariant does not have its Drive folder permission. Sign out, sign in again, and leave the Drive box ticked.", "drive.file not granted");
  }
  const now = Math.floor(Date.now() / 1000);
  if (g.access && g.expires - 60 > now) return g.access;
  if (!g.refresh) throw new SyncError("Your Google sign-in has run out. Sign out and sign in again.", "no refresh token");

  return refreshAccessToken(g.refresh);
}

/** An access token from a refresh token, cached until it expires. Nothing here logs or returns a token in an error. */
export async function refreshAccessToken(refresh: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await keyOf(refresh);
  const cached = fresh.get(key);
  if (cached && cached.expires - 60 > now) return cached.access;

  let res: Response;
  try {
    res = await fetch(TOKEN_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID ?? "",
        client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
  } catch {
    throw new SyncError("Could not reach Google. Try again in a moment.", "token endpoint unreachable");
  }
  if (!res.ok) {
    const code = await res
      .json()
      .then((b: { error?: unknown }) => (typeof b.error === "string" ? b.error : "unknown"))
      .catch(() => "unreadable");
    throw new SyncError(
      code === "invalid_grant" ? "Google ended this sign-in (a password change or a removed permission). Sign out and sign in again." : "Google's sign-in service returned an error. Try again in a moment.",
      `refresh ${res.status} ${code}`,
    );
  }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new SyncError("Google returned something unexpected. Try again in a moment.", "refresh had no access_token");
  const expires = now + (typeof body.expires_in === "number" ? body.expires_in : 3600);
  fresh.set(key, { access: body.access_token, expires });
  return body.access_token;
}

/**
 * The tokens behind a code from Google's consent page, for linking a Drive
 * after an email sign-in (app/api/vault/google): the refresh token, kept
 * sealed in the registry, and the scopes granted, so the caller can see the
 * folder permission was left ticked. Nothing here logs or returns a token in
 * an error.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ refresh: string | null; scopes: string[] }> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID ?? "",
        client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
  } catch {
    throw new SyncError("Could not reach Google. Try again in a moment.", "token endpoint unreachable");
  }
  if (!res.ok) {
    const reason = await res
      .json()
      .then((b: { error?: unknown }) => (typeof b.error === "string" ? b.error : "unknown"))
      .catch(() => "unreadable");
    throw new SyncError("Google did not accept the sign-in. Try Connect Google Drive again.", `code exchange ${res.status} ${reason}`);
  }
  const body = (await res.json()) as { refresh_token?: unknown; scope?: unknown };
  return { refresh: typeof body.refresh_token === "string" ? body.refresh_token : null, scopes: typeof body.scope === "string" ? body.scope.split(" ") : [] };
}
