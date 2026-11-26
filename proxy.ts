import { NextResponse, type NextRequest } from "next/server";

/**
 * The front door (Hamza, 4 Nov 2026): someone with no session who opens the
 * app's own address sees the Invariant site (app/site) there, with Log in and
 * Sign up at the top right; a signed-in person goes on to their Dashboard. A
 * session cookie that is no longer good still reaches the Dashboard, which
 * sends it to sign in as before. A demo deployment's / is the showcase.
 */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

export function proxy(request: NextRequest) {
  if (process.env.STORAGE === "demo") return NextResponse.next();
  // The local preview shim signs in without a cookie (lib/session.ts); it never runs on Vercel.
  if (process.env.PREVIEW_OPERATOR_EMAIL && !process.env.VERCEL) return NextResponse.next();
  const signedIn = SESSION_COOKIES.some((n) => request.cookies.has(n) || request.cookies.has(`${n}.0`));
  if (signedIn) return NextResponse.next();
  return NextResponse.rewrite(new URL("/site", request.url));
}

export const config = { matcher: "/" };
