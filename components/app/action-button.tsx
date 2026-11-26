"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { DoneMark, useDone, type Ran } from "@/components/app/done-mark";
import { reach } from "@/components/app/reach";
import { Button } from "@/components/ui/button";

type State = Ran<{ error: string | null }>;

/** A one-tap server action: a spinner while it runs, a check when it is done, its error beside it when it is not. */
export function ActionButton({ action, label, variant = "primary", size, doneLabel = "Done", doneHref }: { action: () => Promise<{ error: string | null }>; label: string; variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" | "lg"; doneLabel?: string; doneHref?: string }) {
  const router = useRouter();
  const [state, run, pending] = useActionState<State, FormData>(async () => ({ ...(await reach(action)), ran: Date.now() }), { error: null });
  const done = useDone(state, 2800, doneHref ? () => router.push(doneHref as Route) : undefined);
  return (
    <form action={run} className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
      <Button type="submit" variant={variant} size={size} loading={pending}>
        {label}
      </Button>
      {done ? <DoneMark label={doneLabel} /> : null}
      {state.error ? <p className="mt-1 w-full text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}
