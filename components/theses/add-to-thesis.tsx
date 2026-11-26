import type * as React from "react";

import { FileAction } from "@/components/app/file-action";
import { ProposalReview } from "@/components/theses/proposal-review";
import { ACCEPT, type Proposal } from "@/lib/thesis-review";

import { proposeFromDocumentAction } from "@/app/(app)/theses/actions";

/**
 * Add to the thesis, in the app (Hamza, 19 Oct 2026): one button picks a
 * document or a table from the person's computer; the app reads it on their
 * own model against this thesis and the methodology it lives under and lays the proposed changes under it,
 * highlighted, for them to approve, deny or amend. The document is read once
 * and never kept. With `ask` (the beta: the AI on demand runs on the
 * person's own Claude) the "Ask your Claude" card stands in its place.
 */
export function AddToThesis({ subject, pending, editable, hasModel, ask }: { subject: { kind: "stock"; symbol: string } | { kind: "market"; id: string }; pending: Proposal | null; editable: boolean; hasModel: boolean; ask?: React.ReactNode }) {
  return (
    <>
      {ask ?? <div id="add" className="card mb-3 scroll-mt-20 px-4 py-4">
        <p className="mb-1 font-semibold">Add to the thesis</p>
        <p className="mb-3 text-subhead text-text-secondary">
          A report, a transcript, a filing, a note or a table of data (PDF, text, Markdown, CSV or JSON). The AI reads it against this thesis and your methodology (its classes, its rules and where this holding stands under them today) and proposes what to change: the words, the pathway, a pillar or a watch item, each shown with what it was and what it becomes, and the rule or class it answers. You approve, deny or amend each one; nothing moves until you apply.
        </p>
        {editable ? (
          <FileAction
            action={proposeFromDocumentAction}
            name="document"
            accept={ACCEPT}
            label="Choose a document or data"
            pendingLabel="Reading"
            doneLabel="Read"
            note="Reading it with the AI against the thesis and your methodology. The proposed changes appear below."
            extra={
              <>
                <input type="hidden" name="kind" value={subject.kind} />
                <input type="hidden" name="subject" value={subject.kind === "stock" ? subject.symbol : subject.id} />
              </>
            }
          />
        ) : (
          <p className="text-footnote text-text-tertiary">The demo&apos;s theses are fictional and read-only. In your own copy you add documents here.</p>
        )}
        {editable && !hasModel ? <p className="mt-2 text-footnote text-text-tertiary">The AI is not set up on this deployment yet.</p> : null}
        <p className="mt-2 text-footnote text-text-tertiary">The document is sent to the AI once and never kept; only what it said and what you approved stay, under Added to the thesis. A valuation, a record, a class or an order never moves.</p>
      </div>}
      {pending ? <ProposalReview proposal={pending} /> : null}
    </>
  );
}
