"use client";

import * as React from "react";

import { ActionForm } from "@/components/app/action-form";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { wordDiff, type Decision, type Proposal, type ProposedChange } from "@/lib/thesis-review";
import { longDate } from "@/lib/time";

import { applyProposalAction, dismissProposalAction } from "@/app/(app)/theses/actions";

/**
 * The changes a document proposes to a thesis, each highlighted (the words
 * removed struck through, the words added marked) with Approve, Deny or
 * Amend; Apply writes the kept ones and the evidence entry, Dismiss drops the
 * proposal (Hamza, 19 Oct 2026). Every change starts approved; Amend opens
 * the proposed words to edit.
 */
export function ProposalReview({ proposal }: { proposal: Proposal }) {
  const kind = proposal.subject.kind;
  const subject = kind === "stock" ? proposal.subject.symbol : proposal.subject.id;
  return (
    <div id="proposal" className="card mb-8 scroll-mt-20 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{proposal.source}</p>
          <p className="text-footnote text-text-tertiary">
            {proposal.date ? `Dated ${longDate(proposal.date)} · ` : ""}
            {proposal.document.name} · read {proposal.document.readFrom === "pdf" ? "as a PDF" : "as text"} with the AI against the thesis{proposal.against ? ` and ${proposal.against}` : " alone"}
          </p>
        </div>
        <StatusPill tone="info">{proposal.kind === "data" ? "Data" : "Document"}</StatusPill>
      </div>
      <p className="mt-3 text-subhead">{proposal.summary}</p>
      {proposal.unchecked.length ? (
        <p className="mt-2 rounded-[10px] bg-warn/10 px-3 py-2 text-footnote text-text-secondary">
          Not printed in the document: {proposal.unchecked.join(", ")}. Check these before you approve a change that rests on them.
        </p>
      ) : null}
      {proposal.dropped.length ? (
        <details className="mt-2 text-footnote text-text-tertiary">
          <summary className="cursor-pointer">
            {proposal.dropped.length === 1 ? "One proposed change" : `${proposal.dropped.length} proposed changes`} could not be placed on the thesis and {proposal.dropped.length === 1 ? "was" : "were"} left out
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {proposal.dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {proposal.changes.length ? (
        <ActionForm action={applyProposalAction} label="Apply what you approved" pendingLabel="Applying" doneLabel="Applied" className="mt-4" note="The approved and amended changes are written on the thesis, with the document under Added to the thesis.">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="subject" value={subject} />
          <p className="mb-2 text-footnote text-text-secondary">
            {proposal.changes.length === 1 ? "One change" : `${proposal.changes.length} changes`} proposed. Approve, deny or amend each; nothing moves until you apply.
          </p>
          <ol className="mb-4 flex flex-col gap-3">
            {proposal.changes.map((c) => (
              <ChangeCard key={c.id} change={c} />
            ))}
          </ol>
        </ActionForm>
      ) : (
        <p className="mt-3 text-subhead text-text-secondary">The document calls for no change to the thesis. Keep it as evidence, or dismiss it.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!proposal.changes.length ? (
          <ActionForm action={applyProposalAction} label="Keep as evidence" pendingLabel="Keeping" doneLabel="Kept" variant="secondary" size="sm">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="subject" value={subject} />
          </ActionForm>
        ) : null}
        <ActionForm action={dismissProposalAction} label="Dismiss" pendingLabel="Dismissing" doneLabel="Dismissed" variant="ghost" size="sm">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="subject" value={subject} />
        </ActionForm>
      </div>
    </div>
  );
}

const DECISION_LABEL: Record<Decision, string> = { approve: "Approve", deny: "Deny", amend: "Amend" };

function ChangeCard({ change: c }: { change: ProposedChange }) {
  const [decision, setDecision] = React.useState<Decision>("approve");
  const verb = c.before === null ? "Add" : c.after === null ? "Remove" : "Change";
  return (
    <li className={cn("rounded-[12px] border border-hairline bg-surface-2 px-3 py-3 transition-opacity", decision === "deny" && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-subhead font-semibold">
          {verb} · {c.where}
        </p>
        <div role="radiogroup" aria-label={`Decision on ${c.where}`} className="inline-flex rounded-control border border-hairline-strong p-0.5">
          {(["approve", "deny", "amend"] as const).map((d) => (
            <label key={d} className={cn("cursor-pointer rounded-[7px] px-2.5 py-1 text-footnote", decision === d ? (d === "deny" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent-text") : "text-text-secondary")}>
              <input type="radio" name={`d_${c.id}`} value={d} checked={decision === d} onChange={() => setDecision(d)} className="sr-only" />
              {DECISION_LABEL[d]}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-2 text-body leading-relaxed">
        <Highlighted change={c} />
      </div>
      {c.target === "pillar" && c.before === null && c.test ? (
        <p className="mt-1 text-footnote text-text-tertiary">
          Tested: {c.test.field} {c.test.is === "gte" ? "at or above" : "at or below"} <span className="data">{c.test.value}</span>
        </p>
      ) : null}
      <p className="mt-2 text-footnote text-text-secondary">Why: {c.reason}</p>
      {decision === "amend" ? (
        <label className="mt-2 block text-footnote text-text-secondary">
          Your words
          <textarea name={`a_${c.id}`} defaultValue={c.after ?? ""} rows={4} maxLength={6000} className="mt-1 block w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 text-body text-text" />
        </label>
      ) : null}
    </li>
  );
}

/** The words before and after, the removed ones struck through, the added ones marked. */
function Highlighted({ change: c }: { change: ProposedChange }) {
  if (c.before === null) return <ins className="rounded-[4px] bg-ok/15 px-0.5 text-text no-underline">{c.after}</ins>;
  if (c.after === null) return <del className="rounded-[4px] bg-danger/15 px-0.5 text-text-secondary">{c.before}</del>;
  const tokens = wordDiff(c.before, c.after);
  return (
    <>
      {tokens.map((t, i) =>
        t.op === "eq" ? (
          <React.Fragment key={i}>{t.text}</React.Fragment>
        ) : t.op === "del" ? (
          <del key={i} className="rounded-[4px] bg-danger/15 px-0.5 text-text-secondary">
            {t.text}
          </del>
        ) : (
          <ins key={i} className="rounded-[4px] bg-ok/15 px-0.5 text-text no-underline">
            {t.text}
          </ins>
        ),
      )}
    </>
  );
}
