import "server-only";

import { headers } from "next/headers";

/**
 * Linking a Google Drive after an email sign-in (app/api/vault/google): the
 * state cookie's name, and the app's own address for the redirect back.
 */

/** The state cookie: a nonce the callback must bring back, so a link cannot be planted from elsewhere. */
export const LINK_COOKIE = "pos_drive_link";

/** The app's own address as the request reached it. */
export async function originOfRequest(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}
