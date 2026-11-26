"use client";

import { useActionState } from "react";

import { decideSenderAction } from "@/app/(app)/newsletters/actions";
import { DoneMark, stamped, useDone, type Ran } from "@/components/app/done-mark";
import { Button } from "@/components/ui/button";
import type { Sender } from "@/lib/newsletters";

/**
 * One sender the person decides on, now or after the first filter was
 * made: Keep and Remove on a proposal, Remove alone on a kept one, Keep
 * again on a removed one. Each press says it worked; the list re-renders
 * from the vault.
 */
export function SenderRow({ sender }: { sender: Sender }) {
  const [state, run, pending] = useActionState<Ran<{ error: string | null }>, FormData>(
    stamped(async (_prev: Ran<{ error: string | null }>, form: FormData) => decideSenderAction(sender.address, form.get("status") === "kept" ? "kept" : "removed")),
    { error: null },
  );
  const done = useDone(state);
  return (
    <form action={run} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-[11rem] flex-1">
        <div className="truncate text-body">{sender.name ?? sender.address}</div>
        <div className="mt-0.5 truncate text-footnote text-text-secondary">
          {sender.name ? <span className="data">{sender.address}</span> : null}
          {sender.name && sender.cadence ? " · " : ""}
          {sender.cadence ?? ""}
          {sender.status === "proposed" ? `${sender.name || sender.cadence ? " · " : ""}Found by your Claude` : ""}
        </div>
        {state.error ? <p className="mt-1 text-footnote text-danger">{state.error}</p> : null}
      </div>
      {done ? <DoneMark /> : null}
      <span className="flex shrink-0 gap-2">
        {sender.status !== "kept" ? (
          <Button type="submit" name="status" value="kept" variant={sender.status === "proposed" ? "primary" : "secondary"} size="sm" loading={pending}>
            {sender.status === "proposed" ? "Keep" : "Keep again"}
          </Button>
        ) : null}
        {sender.status !== "removed" ? (
          <Button type="submit" name="status" value="removed" variant="secondary" size="sm" loading={pending}>
            Remove
          </Button>
        ) : null}
      </span>
    </form>
  );
}
