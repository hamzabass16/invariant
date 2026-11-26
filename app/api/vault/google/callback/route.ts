import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { DRIVE_FILE_SCOPE } from "@/lib/auth";
import { LINK_COOKIE, originOfRequest } from "@/lib/drive-link";
import { exchangeCode } from "@/lib/google-user";
import { chooseDrive, registryAvailable } from "@/lib/registry";
import { operatorOrNull } from "@/lib/session";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";

/**
 * Back from Google's consent page: the state must match the cookie the start
 * route set, the code is exchanged for a refresh token, and the token is
 * kept sealed in the registry as the person's vault (lib/registry.ts
 * chooseDrive). Welcome then says what happened: linked, denied (the folder
 * box unticked, or the page closed) or failed. Nothing of the token or the
 * code reaches a log.
 */
export async function GET(request: Request) {
  const operator = await operatorOrNull();
  if (!operator) return NextResponse.redirect(new URL("/sign-in", request.url));
  const origin = await originOfRequest();
  const back = (outcome: "linked" | "denied" | "failed" | "unavailable") => NextResponse.redirect(`${origin}/welcome?drive=${outcome}`);
  if (storageMode() !== "drive") return back("unavailable");
  if (!registryAvailable()) return back("unavailable");
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const jar = await cookies();
  const nonce = jar.get(LINK_COOKIE)?.value ?? null;
  if (params.get("error") || !code || !state || !nonce || state !== nonce) return back("denied");
  let outcome: "linked" | "denied" | "failed";
  try {
    const { refresh, scopes } = await exchangeCode(code, `${origin}/api/vault/google/callback`);
    if (!refresh || !scopes.includes(DRIVE_FILE_SCOPE)) outcome = "denied";
    else {
      await chooseDrive(operator.email, refresh);
      outcome = "linked";
    }
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[vault] drive link ${e.logDetail ?? "failed"}`);
    outcome = "failed";
  }
  const res = back(outcome);
  res.cookies.set(LINK_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/vault/google", maxAge: 0 });
  return res;
}
