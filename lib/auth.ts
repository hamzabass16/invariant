import "server-only";

import NextAuth from "next-auth";
import { cache } from "react";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { APP_FOLDER_SCOPE, GRAPH_SCOPES, microsoftConfigured } from "@/lib/microsoft-user";
import { INVITE_COOKIE } from "@/lib/plans";
import { storageMode } from "@/lib/storage";
import { checkPassword, isMember, joinWithProvider, normaliseEmail, signUpOpen, usersAvailable } from "@/lib/users";

/**
 * Google or Microsoft sign-in against an allowlist of one or more addresses in
 * ALLOWED_EMAILS (comma-separated), or an account in the app's own store
 * (lib/users.ts): made by sign-up while SIGN_UP=open (or =invite, with an
 * invitation from /ops carried in the `pos_invite` cookie), by Google or Microsoft
 * (the row is made at the first sign-in) or by email and password verified
 * with an emailed code; afterwards it signs in with the password through the
 * credentials provider below. Nobody else gets a session, and an unset
 * allowlist with sign-up closed admits nobody: a deployment that forgets
 * them is locked, not open.
 * Microsoft appears only when the operator registered an Entra app
 * (AUTH_MICROSOFT_ENTRA_ID_ID and _SECRET); any Microsoft account, personal,
 * work or school, may then sign in if its address is on the list.
 *
 * In drive mode the sign-in also asks for the one folder permission its
 * provider offers: drive.file at Google (the files this app creates in the
 * person's Drive, nothing else), Files.ReadWrite.AppFolder at Microsoft (the
 * Apps/Portfolio OS folder in their OneDrive, nothing else). The vault
 * follows the provider (lib/vault.ts). Provider tokens stay inside the
 * encrypted session cookie; the session the browser can read carries name,
 * email and picture only.
 */

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const normalise = (email: string) => email.trim().toLowerCase();

export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalise)
    .filter(Boolean);
}

const drive = storageMode() === "drive";

const providers: Provider[] = [
  drive
    ? Google({
        authorization: {
          params: {
            scope: `openid email profile ${DRIVE_FILE_SCOPE}`,
            // A refresh token, so the app can read the person's folder after the first hour.
            access_type: "offline",
            prompt: "consent",
          },
        },
      })
    : Google,
];
if (microsoftConfigured()) {
  providers.push(
    MicrosoftEntraID({
      // offline_access gives the refresh token; the folder scope only in drive mode.
      authorization: { params: { scope: drive ? GRAPH_SCOPES : "openid profile email User.Read" } },
      // A work account may carry its address as preferred_username and no email claim; the photo is left out to keep the cookie small.
      profile: (p: { sub?: string; name?: string; email?: string; preferred_username?: string }) => ({ id: p.sub, name: p.name ?? null, email: p.email ?? p.preferred_username ?? null, image: null }),
    }),
  );
}

// Email and password, for an account in the app's own store (lib/users.ts). Only a verified account with the right password gets a user.
providers.push(
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(c) {
      if (!usersAvailable()) return null;
      const email = normaliseEmail(String(c?.email ?? ""));
      const password = String(c?.password ?? "");
      if (!email || !password) return null;
      return (await checkPassword(email, password)) ? { id: email, email, name: null } : null;
    },
  }),
);

/** Which sign-ins this deployment offers, for the sign-in page. */
export function signInProviders(): ("google" | "microsoft")[] {
  return microsoftConfigured() ? ["google", "microsoft"] : ["google"];
}

/**
 * Whether an address may use the app: on the allowlist, or a verified
 * account in the store. Read on every request, so removing an address or a
 * row ends a live session.
 */
export const admitted = cache(async (email: string): Promise<boolean> => {
  const e = normalise(email);
  if (allowedEmails().includes(e)) return true;
  return usersAvailable() && (await isMember(e));
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const email = normalise(user.email);
      if (allowedEmails().includes(email)) return true;
      if (!usersAvailable()) return false;
      // The credentials provider only returns a verified account.
      if (account?.provider === "credentials") return true;
      if (await isMember(email)) return true;
      // A Google or Microsoft sign-in joins on the spot while sign-up is open; invite-only, with the invitation checked on Create an account.
      if (!signUpOpen()) return false;
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      const joined = await joinWithProvider(email, jar.get(INVITE_COOKIE)?.value ?? null);
      if (!joined) return "/sign-up?invite=needed";
      try {
        jar.delete(INVITE_COOKIE);
      } catch {
        // Cookies are read-only in some contexts; it runs out in half an hour anyway.
      }
      await (await import("@/lib/beta-run")).recordEvent(email, "signed_up");
      return true;
    },
    async jwt({ token, account }) {
      if (account?.provider === "credentials") {
        // A password sign-in carries no folder token; the vault is the Drive linked on Welcome (lib/vault.ts).
        delete token.google;
        delete token.microsoft;
      }
      if (account?.provider === "google" && drive) {
        token.google = {
          access: account.access_token ?? null,
          refresh: account.refresh_token ?? null,
          expires: account.expires_at ?? 0,
          // Google lets people untick a scope on the consent screen; remembered so Setup can say so.
          drive: (account.scope ?? "").split(" ").includes(DRIVE_FILE_SCOPE),
        };
        delete token.microsoft;
      }
      if (account?.provider === "microsoft-entra-id" && drive) {
        token.microsoft = {
          access: account.access_token ?? null,
          refresh: account.refresh_token ?? null,
          expires: account.expires_at ?? 0,
          // Microsoft may return the scope list with or without the Graph prefix.
          folder: (account.scope ?? "").split(" ").some((sc) => sc.endsWith(APP_FOLDER_SCOPE)),
        };
        delete token.google;
      }
      return token;
    },
  },
});
