"use client";

import { useActionState } from "react";

import { setRecapAction, writeRecapNowAction, type RecapState } from "@/app/(app)/markets/actions";
import { DoneMark, stamped, useDone, type Ran } from "@/components/app/done-mark";
import { Button } from "@/components/ui/button";
import type { RecapChoice } from "@/lib/market-recap";

/** Where "What happened" comes from: two boxes, either or both. */
export function RecapChoiceForm({ choice }: { choice: RecapChoice }) {
  const [state, run, pending] = useActionState<Ran<RecapState>, FormData>(stamped(setRecapAction), { error: null });
  const done = useDone(state);
  return (
    <form action={run} className="px-4 py-3">
      <p className="mb-2 text-footnote text-text-secondary">Where it comes from</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        <label className="flex items-center gap-3 text-subhead">
          <input type="checkbox" name="newsletter" defaultChecked={choice.newsletter} className="size-4 accent-[var(--accent)]" />
          A recap newsletter you forward (free)
        </label>
        <label className="flex items-center gap-3 text-subhead">
          <input type="checkbox" name="claude" defaultChecked={choice.claude} className="size-4 accent-[var(--accent)]" />
          A recap the AI writes from the web
        </label>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Keep
        </Button>
        {done ? <DoneMark label="Kept" /> : null}
      </div>
      {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}

/** Write it now: the last session's recap on the person's Claude, at once. */
export function WriteRecapNow({ label }: { label: string }) {
  const [state, run, pending] = useActionState<Ran<RecapState>, FormData>(stamped(writeRecapNowAction), { error: null });
  const done = useDone(state);
  return (
    <form action={run}>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {pending ? "Writing" : label}
      </Button>
      {done ? <DoneMark label="Written" className="ml-3" /> : null}
      {pending ? <p className="mt-2 text-footnote text-text-secondary">The AI searches the day&rsquo;s news and writes it up; this takes up to a minute.</p> : null}
      {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}

/** Turn on the Claude recap from Today, keeping the newsletter choice as it was. */
export function TurnOnRecap({ newsletter }: { newsletter: boolean }) {
  const [state, run, pending] = useActionState<Ran<RecapState>, FormData>(stamped(setRecapAction), { error: null });
  const done = useDone(state);
  return (
    <form action={run}>
      {newsletter ? <input type="hidden" name="newsletter" value="on" /> : null}
      <input type="hidden" name="claude" value="on" />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Turn it on
      </Button>
      {done ? <DoneMark label="On" className="ml-3" /> : null}
      {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}
