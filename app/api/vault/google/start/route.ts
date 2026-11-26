import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { DRIVE_FILE_SCOPE } from "@/lib/auth";
import { LINK_COOKIE, originOfRequest } from "@/lib/drive-link";
import { operatorOrNull } from "@/lib/session";
import { storageMode } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * "Connect Google Drive" on Welcome, for someone who signed in by email and
 * password: sends them to Google's consent page asking for the one folder
 * permission (drive.file, the files this app makes and nothing else) with a
 * refresh token, and comes back to the callback beside this route. The
 * signed-in address is not put in the URL; the person picks the Google
 * account themselves.
 */
export async function GET(request: Request) {
  const operator = await operatorOrNull();
  if (!operator) return NextResponse.redirect(new URL("/sign-in", request.url));
  const origin = await originOfRequest();
  if (storageMode() !== "drive") return NextResponse.redirect(`${origin}/welcome`);
  const nonce = randomBytes(16).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    redirect_uri: `${origin}/api/vault/google/callback`,
    response_type: "code",
    scope: `openid email ${DRIVE_FILE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    state: nonce,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(LINK_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/vault/google", maxAge: 600 });
  return res;
}
