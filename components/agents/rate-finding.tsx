"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/app/action-form";
import { DoneMark, stamped, useDone } from "@/components/app/done-mark";
import { WRONG_LABEL, WRONG_REASONS, type Rating } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { rateFindingAction } from "@/app/(app)/agents/actions";

const rateUseful = stamped(rateFindingAction);

/**
 * Was a finding useful: a green thumb up or a red thumb down. Once rated, the
 * thumb chosen and what was said, with "Change your mind?" to rate it again;
 * a thumb down opens what was wrong, and the form folds away once it is saved
 * (Hamza, 27 Oct 2026: a choice already made never asks again).
 */
export function RateFinding({ agent, target, subject, title, rating, editable }: { agent: string; target: string; subject: string; title: string; rating: Rating | null; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(false);
  const [usefulState, setUsefulState] = useState<{ error: string | null; ran?: number }>({ error: null });
  const [savingUseful, setSavingUseful] = useState(false);
  const usefulDone = useDone(usefulState, 2800, () => setEditing(false));
  const hidden = (
    <>
      <input type="hidden" name="agent" value={agent} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="title" value={title} />
    </>
  );
  const said = rating ? (rating.verdict === "useful" ? "You rated this useful." : `You rated this not useful${rating.reasons.length ? `: ${rating.reasons.map((r) => WRONG_LABEL[r].toLowerCase()).join(", ")}` : ""}${rating.note ? `. "${rating.note}"` : "."}`) : null;
  const thumb = rating ? rating.verdict === "useful" ? <ThumbsUp className="size-4 shrink-0 text-ok" aria-hidden /> : <ThumbsDown className="size-4 shrink-0 text-danger" aria-hidden /> : null;
  if (!editable) return said ? <p className="mt-2 flex items-center gap-1.5 text-caption text-text-tertiary">{thumb}{said}</p> : null;

  if (rating && !editing) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline pt-2 text-caption text-text-tertiary">
        {thumb}
        <span>{said}</span>
        {usefulDone ? <DoneMark label="Kept" /> : null}
        <button type="button" onClick={() => { setEditing(true); setWhy(false); }} className="text-caption font-medium text-accent underline-offset-2 hover:underline">
          Change your mind?
        </button>
      </div>
    );
  }

  const useful = async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ agent, target, subject, title, verdict: "useful" })) form.set(k, v);
    setSavingUseful(true);
    setWhy(false);
    setUsefulState(await rateUseful({ error: null }, form));
    setSavingUseful(false);
  };
  const thumbButton = "inline-flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-50";
  return (
    <div className="mt-3 border-t border-hairline pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-text-tertiary">Was this useful?</span>
        <button type="button" onClick={useful} disabled={savingUseful} aria-label="Useful" title="Useful" className={cn(thumbButton, "bg-ok/10 text-ok hover:bg-ok/20")}>
          <ThumbsUp className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => setWhy((o) => !o)} aria-expanded={why} aria-label="Not useful" title="Not useful" className={cn(thumbButton, why ? "bg-danger text-white" : "bg-danger/10 text-danger hover:bg-danger/20")}>
          <ThumbsDown className="size-4" aria-hidden />
        </button>
        {editing ? (
          <button type="button" onClick={() => { setEditing(false); setWhy(false); }} className="text-caption text-text-secondary underline-offset-2 hover:underline">
            Keep my rating
          </button>
        ) : null}
        {usefulDone ? <DoneMark label="Kept" /> : null}
      </div>
      {usefulState.error ? <p className="mt-2 text-footnote text-danger">{usefulState.error}</p> : null}
      {why ? (
        <ActionForm action={rateFindingAction} label="Save" variant="secondary" size="sm" doneLabel="Saved" className="mt-2" onDone={() => { setWhy(false); setEditing(false); }}>
          {hidden}
          <input type="hidden" name="verdict" value="not_useful" />
          <fieldset className="mb-2 flex flex-wrap gap-2">
            <legend className="mb-1 text-caption text-text-secondary">What was wrong</legend>
            {WRONG_REASONS.map((r) => (
              <label key={r} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-caption has-[:checked]:bg-accent has-[:checked]:text-white">
                <input type="checkbox" name="reason" value={r} defaultChecked={rating?.reasons.includes(r)} className="sr-only" />
                {WRONG_LABEL[r]}
              </label>
            ))}
          </fieldset>
          <textarea name="note" rows={2} maxLength={500} defaultValue={rating?.note ?? ""} placeholder="In your words, what should it have done? (optional)" className="mb-2 w-full rounded-[10px] bg-surface-2 px-3 py-2 text-footnote" />
        </ActionForm>
      ) : null}
    </div>
  );
}
