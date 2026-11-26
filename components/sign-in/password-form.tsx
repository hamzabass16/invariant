"use client";

import { useActionState } from "react";

import { signInWithPasswordAction, type SignInState } from "@/app/sign-in/actions";
import { Button } from "@/components/ui/button";
import { reached } from "@/components/app/reach";

const field = "h-12 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body placeholder:text-text-tertiary focus:border-accent focus:outline-none";

/** Email and password, for an account made on Sign up. The action signs in and leaves; an error is a sentence under the button. */
export function PasswordForm({ next }: { next: string }) {
  const [state, run, pending] = useActionState<SignInState, FormData>(reached(signInWithPasswordAction), { error: null });
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="sr-only">Email</span>
        <input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="Email" className={field} />
      </label>
      <label className="block">
        <span className="sr-only">Password</span>
        <input name="password" type="password" autoComplete="current-password" required placeholder="Password" className={field} />
      </label>
      <Button type="submit" size="lg" variant="secondary" loading={pending}>
        Sign in with email
      </Button>
      {state.error ? <p className="text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}
