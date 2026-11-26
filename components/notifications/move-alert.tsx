"use client";

import { useActionState } from "react";

import { setMoveAlertAction, type NotificationsState } from "@/app/(app)/notifications/actions";
import { DoneMark, stamped, useDone, type Ran } from "@/components/app/done-mark";
import { Button } from "@/components/ui/button";
import { ListSection } from "@/components/ui/list";
import { MOVE_ALERT_MIN, MOVE_ALERT_PCT } from "@/lib/market-recap";

/** The move that is an alert: how far a listed holding moves in a session, either way, before the app says so and emails it. */
export function MoveAlertCard({ pct, editable }: { pct: number; editable: boolean }) {
  const [state, run, pending] = useActionState<Ran<NotificationsState>, FormData>(stamped(setMoveAlertAction), { error: null });
  const done = useDone(state);
  return (
    <ListSection header="A holding's move" className="mb-8" footer={`After each close, a listed holding that moved this much or more, either way, is an alert and an email, with the AI's reason when it writes the recap. ${MOVE_ALERT_PCT}% unless you set your own.`}>
      <form action={run} className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-subhead">
            <span>Alert at</span>
            <input type="number" name="pct" inputMode="decimal" step="0.5" min={MOVE_ALERT_MIN} defaultValue={pct} disabled={!editable} className="data w-20 rounded-control border border-hairline-strong bg-surface-2 px-2 py-1 text-body text-text" aria-label="Move that is an alert, in percent" />
            <span>% or more</span>
          </label>
          {editable ? (
            <Button type="submit" variant="secondary" size="sm" loading={pending}>
              Keep
            </Button>
          ) : null}
          {done ? <DoneMark label="Kept" /> : null}
        </div>
        {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
      </form>
    </ListSection>
  );
}
