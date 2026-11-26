import "server-only";

import { sessionTokens, type ProviderTokens } from "@/lib/session-tokens";
import { SyncError } from "@/lib/sync-error";

/**
 * The signed-in person's own Microsoft Graph access token, for the app folder
 * in their OneDrive (lib/user-onedrive.ts). The same shape as
 * lib/google-user.ts: the token lives in the session cookie, is refreshed
 * here when it has run out, and never reaches a log or an error.
 *
 * The scope asked for is Files.ReadWrite.AppFolder alone: Microsoft documents
 * it for work, school and personal accounts, and it reaches nothing outside
 * the folder named after the app.
 */

export const APP_FOLDER_SCOPE = "Files.ReadWrite.AppFolder";
export const GRAPH_SCOPES = `openid profile email offline_access User.Read ${APP_FOLDER_SCOPE}`;

const TOKEN_URI = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const fresh = new Map<string, { access: string; expires: number }>();

/** Whether a Microsoft sign-in is configured on this deployment; never a value. */
export function microsoftConfigured(): boolean {
  return Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET);
}

async function microsoftTokens(): Promise<ProviderTokens | null> {
  const s = await sessionTokens();
  return s?.provider === "microsoft" ? s.tokens : null;
}

async function keyOf(refresh: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(refresh)));
  return Buffer.from(bytes).toString("hex").slice(0, 32);
}

/** The refresh token of the signed-in person, for enrolling in the scheduled report; null when the sign-in has none. */
export async function microsoftRefreshToken(): Promise<string | null> {
  const m = await microsoftTokens();
  return m?.folder && m.refresh ? m.refresh : null;
}

export async function graphAccessToken(): Promise<string> {
  const m = await microsoftTokens();
  if (!m) throw new SyncError("You are not signed in with Microsoft. Sign out and sign in again.", "no microsoft tokens in session");
  if (!m.folder) {
    throw new SyncError("Invariant does not have its OneDrive app folder permission. Sign out, sign in again, and accept the folder permission.", "AppFolder not granted");
  }
  const now = Math.floor(Date.now() / 1000);
  if (m.access && m.expires - 60 > now) return m.access;
  if (!m.refresh) throw new SyncError("Your Microsoft sign-in has run out. Sign out and sign in again.", "no refresh token");
  return refreshGraphToken(m.refresh);
}

/** An access token from a refresh token, cached until it expires. Nothing here logs or returns a token in an error. */
export async function refreshGraphToken(refresh: string): Promise<string> {
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
        client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
        client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
        refresh_token: refresh,
        grant_type: "refresh_token",
        scope: GRAPH_SCOPES,
      }),
      cache: "no-store",
    });
  } catch {
    throw new SyncError("Could not reach Microsoft. Try again in a moment.", "ms token endpoint unreachable");
  }
  if (!res.ok) {
    const code = await res
      .json()
      .then((b: { error?: unknown }) => (typeof b.error === "string" ? b.error : "unknown"))
      .catch(() => "unreadable");
    throw new SyncError(
      code === "invalid_grant" ? "Microsoft ended this sign-in (a password change, a removed permission or an expired consent). Sign out and sign in again." : "Microsoft's sign-in service returned an error. Try again in a moment.",
      `ms refresh ${res.status} ${code}`,
    );
  }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new SyncError("Microsoft returned something unexpected. Try again in a moment.", "ms refresh had no access_token");
  const expires = now + (typeof body.expires_in === "number" ? body.expires_in : 3600);
  fresh.set(key, { access: body.access_token, expires });
  return body.access_token;
}
