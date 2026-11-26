import { ActionForm } from "@/components/app/action-form";

import { addNoteAction } from "@/app/(app)/theses/actions";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/** A note of the person's own, added to a thesis as evidence: its source, what it said, what it changed. */
export function NoteForm({ subject }: { subject: { kind: "stock"; symbol: string } | { kind: "market"; id: string } }) {
  return (
    <ActionForm action={addNoteAction} label="Add the note" pendingLabel="Adding" doneLabel="Added" variant="secondary" size="sm" className="card px-4 py-4">
      <input type="hidden" name="kind" value={subject.kind} />
      <input type="hidden" name="subject" value={subject.kind === "stock" ? subject.symbol : subject.id} />
      <label className="block text-subhead">
        What it is
        <input name="source" className={field} maxLength={200} placeholder="Q3 call, a broker note, a conversation" required />
      </label>
      <label className="mt-3 block text-subhead">
        What it says that bears on the thesis
        <textarea name="summary" rows={3} maxLength={1500} className={field} required />
      </label>
      <label className="mt-3 mb-3 block text-subhead">
        What it changes, if anything
        <input name="changes" className={field} maxLength={800} placeholder="Nothing yet" />
      </label>
    </ActionForm>
  );
}
