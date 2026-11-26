"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";
import { nextOf } from "@/lib/sign-in";
import { normaliseEmail } from "@/lib/users";

export type SignInState = { error: string | null };

/**
 * Sign in with an email and password from the app's own store
 * (lib/users.ts), through the credentials provider in lib/auth.ts. A wrong
 * pair, a locked or unverified address and a closed store all read the same
 * sentence, so the form says nothing about which addresses exist.
 */
export async function signInWithPasswordAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  try {
    await signIn("credentials", { email, password, redirectTo: nextOf(String(form.get("next") ?? "")) });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.type === "CredentialsSignin" ? "That email and password do not match." : "Sign-in failed. Try again." };
    throw e;
  }
  return { error: null };
}
