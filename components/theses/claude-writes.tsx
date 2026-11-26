"use client";

import * as React from "react";

import { ActionForm } from "@/components/app/action-form";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { wordDiff } from "@/lib/thesis-review";
import type { PartView, PendingWrite } from "@/lib/thesis-writes";
import { longDate } from "@/lib/time";

import { approveClaudeWriteAction, denyClaudeWriteAction } from "@/app/(app)/theses/actions";

/**
 * What the person's own Claude proposed to a thesis through write_thesis
 * (Hamza, 9 Nov 2026: "a pending proposal with Approve, Deny and Amend"):
 * each part ticked to keep, the words before and after highlighted, the
 * thesis and the pathway open to amend; Keep applies the ticked parts,
 * Dismiss drops the proposal. Nothing moves until they choose.
 */
export function ClaudeWrites({ writes, title = true }: { writes: { write: PendingWrite; parts: PartView[]; href: string | null }[]; title?: boolean }) {
  if (!writes.length) return null;
  return (
    <section id="claude-writes" className="mb-8 scroll-mt-20" aria-label="Proposed by your Claude">
      {title ? <h2 className="section-header mb-3">Proposed by your Claude</h2> : null}
      <div className="flex flex-col gap-4">
        {writes.map((w) => (
          <WriteCard key={w.write.id} pending={w.write} parts={w.parts} href={w.href} />
        ))}
      </div>
    </section>
  );
}

function WriteCard({ pending: p, parts, href }: { pending: PendingWrite; parts: PartView[]; href: string | null }) {
  return (
    <div className="card px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {href ? (
              <a href={href} className="hover:underline">
                {p.name}
              </a>
            ) : (
              p.name
            )}
          </p>
          <p className="text-footnote text-text-tertiary">Sent by your Claude on {longDate(p.at.slice(0, 10))}{p.isNew ? " · a new thesis" : ""}</p>
        </div>
        <StatusPill tone="info">Waiting for you</StatusPill>
      </div>
      <ActionForm action={approveClaudeWriteAction} label="Keep what is ticked" pendingLabel="Keeping" doneLabel="Kept" className="mt-3" note="The ticked parts are written on the thesis, as amended, marked as added by Claude.">
        <input type="hidden" name="id" value={p.id} />
        <p className="mb-2 text-footnote text-text-secondary">Untick what you do not want; nothing moves until you keep it.</p>
        <ol className="mb-4 flex flex-col gap-3">
          {parts.map((v) => (
            <PartCard key={v.part} view={v} />
          ))}
        </ol>
      </ActionForm>
      <div className="mt-3">
        <ActionForm action={denyClaudeWriteAction} label="Dismiss" pendingLabel="Dismissing" doneLabel="Dismissed" variant="ghost" size="sm">
          <input type="hidden" name="id" value={p.id} />
        </ActionForm>
      </div>
    </div>
  );
}

function PartCard({ view: v }: { view: PartView }) {
  const [kept, setKept] = React.useState(true);
  const [amend, setAmend] = React.useState(false);
  const amendable = v.part === "text" || v.part === "pathway";
  return (
    <li className={cn("rounded-[12px] border border-hairline bg-surface-2 px-3 py-3 transition-opacity", !kept && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-subhead font-semibold">
          <input type="checkbox" name="keep" value={v.part} checked={kept} onChange={(e) => setKept(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {v.words}
        </label>
        {amendable && kept ? (
          <button type="button" onClick={() => setAmend((a) => !a)} className="rounded-control px-2.5 py-1 text-footnote text-accent-text hover:bg-accent/10">
            {amend ? "Use Claude's words" : "Amend"}
          </button>
        ) : null}
      </div>
      {v.line !== null ? (
        <p className="mt-2 text-body leading-relaxed">{v.line}</p>
      ) : (
        <div className="mt-2 whitespace-pre-line text-body leading-relaxed">
          <Highlighted before={v.before ?? ""} after={v.after ?? ""} />
        </div>
      )}
      {amend && kept ? (
        <label className="mt-2 block text-footnote text-text-secondary">
          Your words
          <textarea name={`amend_${v.part}`} defaultValue={v.after ?? ""} rows={v.part === "text" ? 6 : 3} maxLength={6000} className="mt-1 block w-full rounded-control border border-hairline-strong bg-surface px-3 py-2 text-body text-text" />
        </label>
      ) : null}
    </li>
  );
}

/** The words before and after, the removed ones struck through, the added ones marked. */
function Highlighted({ before, after }: { before: string; after: string }) {
  if (!before) return <ins className="rounded-[4px] bg-ok/15 px-0.5 text-text no-underline">{after}</ins>;
  if (!after) return <del className="rounded-[4px] bg-danger/15 px-0.5 text-text-secondary">{before}</del>;
  return (
    <>
      {wordDiff(before, after).map((t, i) =>
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
