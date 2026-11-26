"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { DoneMark, useDone, type Ran } from "@/components/app/done-mark";
import { reach } from "@/components/app/reach";
import { Button } from "@/components/ui/button";

type State = Ran<{ error: string | null }>;

/**
 * A form whose fields go to a server action: a spinner while it runs, a
 * check when it is done, the action's error beside the button when it is
 * not. `children` are the fields; `label` the button; `doneHref` a screen
 * to open once the check has been seen.
 */
export function ActionForm({
  action,
  label,
  pendingLabel,
  variant = "primary",
  size,
  className,
  children,
  note,
  doneLabel = "Done",
  doneHref,
  onDone,
}: {
  action: (prev: { error: string | null }, form: FormData) => Promise<{ error: string | null }>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: React.ReactNode;
  /** Shown under the button while the action runs. */
  note?: string;
  doneLabel?: string;
  doneHref?: string;
  /** Runs once the check has been seen, for a form that folds itself away after it worked. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [state, run, pending] = useActionState<State, FormData>(async (prev, form) => ({ ...(await reach(() => action(prev, form))), ran: Date.now() }), { error: null });
  const done = useDone(state, 2800, doneHref || onDone ? () => (doneHref ? router.push(doneHref as Route) : onDone?.()) : undefined);
  return (
    <form action={run} className={className}>
      {children}
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
        <Button type="submit" variant={variant} size={size} loading={pending}>
          {pending && pendingLabel ? pendingLabel : label}
        </Button>
        {done ? <DoneMark label={doneLabel} /> : null}
      </span>
      {pending && note ? <p className="mt-2 text-footnote text-text-secondary">{note}</p> : null}
      {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}
