"use client";

import { useActionState } from "react";

import { checkInviteAction, type InviteState } from "@/app/sign-up/actions";
import { reached } from "@/components/app/reach";
import { Button } from "@/components/ui/button";

const field = "data h-12 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body uppercase tracking-[0.15em] placeholder:normal-case placeholder:tracking-normal placeholder:text-text-tertiary focus:border-accent focus:outline-none";

/** Invite-only sign-up, step zero: the code the operator sent. A code that would let the person in opens the rest of the page. */
export function InviteForm() {
  const [state, check, checking] = useActionState<InviteState, FormData>(reached(checkInviteAction), { error: null });
  return (
    <form action={check} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-subhead">Invitation code</span>
        <input name="invite" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} required placeholder="XXXX-XXXX-XXXX" className={field} />
      </label>
      <Button type="submit" size="lg" loading={checking}>
        Continue
      </Button>
      {state.error ? <p className="text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}
