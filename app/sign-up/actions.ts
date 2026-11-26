"use server";

import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { sendSignUpCode } from "@/lib/report-mail";
import { allow, limitKey, requestIp } from "@/lib/rate-limit";
import { SyncError } from "@/lib/sync-error";
import { INVITE_COOKIE, INVITE_COOKIE_SECONDS, normalInviteCode } from "@/lib/plans";
import { INVITE_UNUSABLE, inviteUsable, normaliseEmail, passwordProblem, resendCode, signUpMode, startSignUp, verifySignUp } from "@/lib/users";

export type SignUpState = { error: string | null; email: string | null; verified: boolean };

const EMPTY_SIGN_UP: SignUpState = { error: null, email: null, verified: false };

/** Codes one address can be sent in an hour, and one network address can ask for (docs/ARCHITECTURE.md §5.6): without them the form sends mail to any address as often as it is pressed. */
const CODES_PER_ADDRESS = 3;
const CODES_PER_NETWORK = 10;

/** A sentence when this address or this network has had its codes for the hour, else null; counted across every instance. */
async function codeLimit(email: string): Promise<string | null> {
  const ip = requestIp(await headers());
  const [address, network] = await Promise.all([allow(limitKey("code-address", email), CODES_PER_ADDRESS, 3600), allow(limitKey("code-network", ip), CODES_PER_NETWORK, 3600)]);
  if (!address) return "Three codes have gone to this address in the last hour. Use the latest one, or try again in an hour.";
  if (!network) return "Too many codes have been asked for from this network in the last hour. Try again in an hour.";
  return null;
}

/** The invitation checked on this page, if any. */
async function inviteOf(): Promise<string | null> {
  return (await cookies()).get(INVITE_COOKIE)?.value ?? null;
}

export type InviteState = { error: string | null };

/**
 * Invite-only (SIGN_UP=invite): the code first. One that would let the person
 * in is kept in a cookie for half an hour, for whichever way they then make
 * the account; it is used up only when the account is made. Tries are
 * limited per network, as the codes are.
 */
export async function checkInviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  if (signUpMode() !== "invite") redirect("/sign-up");
  const code = normalInviteCode(String(form.get("invite") ?? ""));
  if (!code) return { error: "Enter the invitation code you were sent." };
  const ip = requestIp(await headers());
  if (!(await allow(limitKey("invite-network", ip), 20, 3600))) return { error: "Too many codes have been tried from this network in the last hour. Try again in an hour." };
  if (!(await inviteUsable(code))) return { error: INVITE_UNUSABLE };
  (await cookies()).set(INVITE_COOKIE, code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: INVITE_COOKIE_SECONDS });
  redirect("/sign-up");
}

async function guarded(fn: () => Promise<SignUpState>): Promise<SignUpState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SyncError) {
      // The detail names the step, never the address, the password or the code.
      console.error(`[sign-up] ${e.logDetail ?? "failed"}`);
      return { ...EMPTY_SIGN_UP, error: e.message };
    }
    throw e;
  }
}

/** Step one: the address and a password; a six-digit code goes to the address. */
export async function startSignUpAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!email) return { ...EMPTY_SIGN_UP, error: "Enter your email address." };
  const problem = passwordProblem(password);
  if (problem) return { ...EMPTY_SIGN_UP, error: problem };
  return guarded(async () => {
    const limited = await codeLimit(email);
    if (limited) return { error: limited, email: null, verified: false };
    const { code } = await startSignUp(email, password, await inviteOf());
    await sendSignUpCode(email, code);
    return { error: null, email, verified: false };
  });
}

/** A new code to the same address, when the first did not arrive. */
export async function resendCodeAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  if (!email) return { ...EMPTY_SIGN_UP, error: "Start again with your email address." };
  return guarded(async () => {
    const limited = await codeLimit(email);
    if (limited) return { error: limited, email, verified: false };
    const { code } = await resendCode(email);
    await sendSignUpCode(email, code);
    return { error: null, email, verified: false };
  });
}

/**
 * Step two: the code. A match verifies the account and signs the person in
 * with the password they typed a moment ago, straight to Welcome. When the
 * password is no longer in the form (a reload), the account is verified and
 * the page says to sign in.
 */
export async function verifySignUpAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  const code = String(form.get("code") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email) return { ...EMPTY_SIGN_UP, error: "Start again with your email address." };
  const verified = await guarded(async () => {
    await verifySignUp(email, code, await inviteOf());
    await (await import("@/lib/beta-run")).recordEvent(email, "signed_up");
    return { error: null, email, verified: true };
  });
  if (!verified.error) (await cookies()).delete(INVITE_COOKIE);
  if (verified.error || !password) return verified;
  try {
    await signIn("credentials", { email, password, redirectTo: "/welcome" });
  } catch (e) {
    if (e instanceof AuthError) return { error: null, email, verified: true };
    throw e;
  }
  return verified;
}
