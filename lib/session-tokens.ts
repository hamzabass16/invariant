import "server-only";

import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";

/**
 * The signed-in person's provider tokens, read from the encrypted session
 * cookie (lib/auth.ts) once per call. The vault follows the provider: a
 * Google sign-in reaches their Drive, a Microsoft sign-in their OneDrive app
 * folder. Nothing here logs or returns a token in an error.
 */

export type ProviderTokens = {
  access: string | null;
  refresh: string | null;
  /** Unix seconds. */
  expires: number;
  /** Whether the person left the folder permission ticked on the consent screen. */
  folder: boolean;
};

export type SessionTokens = { provider: "google" | "microsoft"; email: string | null; tokens: ProviderTokens };

export async function sessionTokens(): Promise<SessionTokens | null> {
  const jar = await cookies();
  const secure = jar.has("__Secure-authjs.session-token") || [...jar.getAll()].some((c) => c.name.startsWith("__Secure-authjs.session-token."));
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const token = (await getToken({ req: { headers: { cookie: cookieHeader } }, secret: process.env.AUTH_SECRET, secureCookie: secure })) as
    | { email?: string | null; google?: { access: string | null; refresh: string | null; expires: number; drive: boolean }; microsoft?: ProviderTokens }
    | null;
  const email = typeof token?.email === "string" ? token.email.toLowerCase() : null;
  if (token?.microsoft) return { provider: "microsoft", email, tokens: token.microsoft };
  if (token?.google) return { provider: "google", email, tokens: { access: token.google.access, refresh: token.google.refresh, expires: token.google.expires, folder: token.google.drive } };
  return null;
}
