"use client";

import { useActionState } from "react";

import { checkInboxAction, type InboxState } from "@/app/(app)/statements/actions";
import { DoneMark, stamped, useDone, type Ran } from "@/components/app/done-mark";
import { ForwardingFallback } from "@/components/statements/forwarding-fallback";
import { Button } from "@/components/ui/button";

/**
 * Check the inbox now. When Gmail's forwarding confirmation came, the app
 * has followed its link and pressed Google's Confirm by itself and says so;
 * when Google did not take it from here, Google's page is offered for the
 * one click, with the code if Gmail sent one (Hamza, 17 and 18 Oct 2026). The newsletters screen passes its
 * own check and label.
 */
export function InboxCheck({ action = checkInboxAction, wait = "A few statements can take a minute to read.", label = "Check the inbox now" }: { action?: () => Promise<InboxState>; wait?: string; label?: string }) {
  const [state, run, pending] = useActionState<Ran<InboxState>, FormData>(stamped(action), { error: null, message: null, code: null, link: null, forAddress: null, confirmed: false });
  const done = useDone(state);
  return (
    <form action={run}>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {pending ? "Checking" : label}
      </Button>
      {done ? <DoneMark label="Checked" className="ml-3" /> : null}
      {pending ? <p className="mt-2 text-footnote text-text-secondary">{wait}</p> : null}
      {state.forAddress && state.confirmed ? (
        <div className="mt-3 rounded-[10px] bg-surface-2 px-3 py-3">
          <p className="text-subhead text-text">Gmail&rsquo;s forwarding from {state.forAddress} is confirmed.</p>
          <p className="mt-1 text-footnote text-text-secondary">Back in Gmail the address now shows as verified; nothing to type. Go on to the filter.</p>
        </div>
      ) : null}
      {state.forAddress && !state.confirmed ? (
        <div className="mt-3">
          <ForwardingFallback forAddress={state.forAddress} sentence={state.forwarding ?? null} code={state.code} link={state.link} next="Go on to the filter." />
        </div>
      ) : null}
      {state.message ? <p className="mt-2 text-footnote text-text-secondary">{state.message}</p> : null}
      {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}
