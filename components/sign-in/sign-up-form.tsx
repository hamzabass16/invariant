"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { resendCodeAction, startSignUpAction, verifySignUpAction, type SignUpState } from "@/app/sign-up/actions";
import { DoneMark } from "@/components/app/done-mark";
import { Button } from "@/components/ui/button";
import { reached } from "@/components/app/reach";

const field = "h-12 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body placeholder:text-text-tertiary focus:border-accent focus:outline-none";
const EMPTY: SignUpState = { error: null, email: null, verified: false };

/**
 * Sign up by email in two steps: the address and a password, then the
 * six-digit code emailed to the address. The password stays in this form
 * between the steps so the verified account signs in at once; nothing is
 * kept in the browser.
 */
export function SignUpForm({ minPassword, codeMinutes }: { minPassword: number; codeMinutes: number }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [started, start, starting] = useActionState<SignUpState, FormData>(reached(startSignUpAction), EMPTY);
  const [resent, resend, resending] = useActionState<SignUpState, FormData>(reached(resendCodeAction), EMPTY);
  const [verified, verify, verifying] = useActionState<SignUpState, FormData>(reached(verifySignUpAction), EMPTY);
  const sentTo = started.email;

  if (verified.verified) {
    return (
      <div className="rounded-card border border-ok/40 bg-ok/10 px-4 py-4">
        <DoneMark label="Your account is ready" />
        <p className="mt-2 text-subhead text-text-secondary">
          <Link href="/sign-in" className="font-medium text-accent-text underline-offset-4 hover:underline">
            Sign in
          </Link>{" "}
          with your email and password.
        </p>
      </div>
    );
  }

  if (sentTo) {
    const error = verified.error ?? resent.error;
    return (
      <div className="space-y-4">
        <p className="text-subhead text-text-secondary">
          We emailed a six-digit code to <span className="data text-text">{sentTo}</span>. It works for {codeMinutes} minutes.
        </p>
        <form action={verify} className="space-y-3">
          <input type="hidden" name="email" value={sentTo} />
          <input type="hidden" name="password" value={password} />
          <label className="block">
            <span className="sr-only">Code</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required placeholder="Code" className={`${field} data text-title-3 tracking-[0.3em]`} />
          </label>
          <Button type="submit" size="lg" loading={verifying}>
            Verify and continue
          </Button>
          {error ? <p className="text-footnote text-danger">{error}</p> : null}
        </form>
        <form action={resend} className="flex items-center gap-3">
          <input type="hidden" name="email" value={sentTo} />
          <Button type="submit" variant="ghost" size="sm" loading={resending}>
            Send a new code
          </Button>
          {resent.email && !resent.error ? <DoneMark label="Sent" /> : null}
        </form>
      </div>
    );
  }

  return (
    <form action={start} className="space-y-3">
      <label className="block">
        <span className="sr-only">Email</span>
        <input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="sr-only">Password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={minPassword} required placeholder={`Password, ${minPassword} characters or more`} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      </label>
      <Button type="submit" size="lg" loading={starting}>
        Email me a code
      </Button>
      {started.error ? <p className="text-footnote text-danger">{started.error}</p> : null}
    </form>
  );
}
