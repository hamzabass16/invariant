"use client";

import { useState } from "react";

import { chooseFamilyAction, confirmEdgarContactAction, editSectionAction, queueStudyAction, removeStudyAction, retryStudyAction, uploadTemplateAction } from "@/app/(app)/research/actions";
import { ActionForm } from "@/components/app/action-form";
import { FileAction } from "@/components/app/file-action";
import { ListRow } from "@/components/ui/list";
import { FAMILIES, FAMILY_LABEL, type AppliedSection, type Family } from "@/lib/research";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/**
 * What the SEC sees, and the person's yes. EDGAR asks every client for a
 * name and a contact address in its User-Agent; the app sends "Invariant
 * (address)" with each filing request the person makes, and nothing before
 * they confirm. The sign-in address is offered, any address can be typed.
 */
export function EdgarContactForm({ defaultAddress }: { defaultAddress: string }) {
  return (
    <ActionForm action={confirmEdgarContactAction} label="Confirm" pendingLabel="Saving" variant="secondary" size="sm" className="px-4 pb-4">
      <p className="pt-2 text-footnote text-text-secondary">
        The SEC asks every program that reads its filings to say who it is and how to reach them. With each filing request you make, Invariant sends the SEC the words <span className="data">Invariant (your address)</span> and the ticker, and nothing else about you. The address stays in your vault; withdraw it here any time and no filing is read.
      </p>
      <label className="mt-3 block text-subhead">
        Address the SEC may write to
        <input name="address" type="email" className={field} defaultValue={defaultAddress} maxLength={120} required autoComplete="email" />
      </label>
      <label className="mt-3 mb-3 flex items-start gap-3 text-subhead">
        <input name="consent" type="checkbox" value="yes" required className="mt-1 h-4 w-4 accent-accent" />
        <span>The SEC may see this address with each filing request I make from Invariant.</span>
      </label>
    </ActionForm>
  );
}

export function NewStudyForm({ hasKey, needsContact, subject = null, ownClaude = false }: { hasKey: boolean; needsContact: boolean; /** A symbol the form opens on (the Theses screen's holding), else empty. */ subject?: string | null; /** The beta: the sections are written by the person's own Claude through the connector. */ ownClaude?: boolean }) {
  return (
    <ActionForm action={queueStudyAction} label="Start the study" pendingLabel="Queuing" className="card px-4 py-4">
      <label className="block text-subhead">
        Ticker, company or subject
        <input name="subject" className={field} placeholder="NVDA, Nvidia, or: US long bonds into a cutting cycle" maxLength={60} required autoComplete="off" defaultValue={subject ?? undefined} />
      </label>
      <label className="mt-3 block text-subhead">
        Your question, if any
        <textarea name="question" rows={2} maxLength={600} className={field} placeholder="Does it pass the Classification Test on the latest quarter, and where is the DCF gap?" />
      </label>
      <p className="mt-2 mb-3 text-footnote text-text-tertiary">
        A company the SEC lists, by ticker or by name, is read from its filings (five years and the trailing twelve months); the methodology&apos;s checks run on those figures; then {ownClaude ? "your own Claude writes the sections through the Invariant connector; the study's page has the prompt." : "the sections are written with the AI, a few at a time."}{hasKey || ownClaude ? "" : " Add the AI on Setup first."}{needsContact ? " A company needs the SEC contact confirmed above." : ""}
      </p>
    </ActionForm>
  );
}

export function StudyControls({ id, status, pending, stalled }: { id: string; status: "queued" | "running" | "done" | "failed"; pending: number; stalled: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {status === "failed" || stalled ? (
        <ActionForm action={retryStudyAction} label={pending ? "Continue" : "Mark as done"} variant="primary" size="sm">
          <input type="hidden" name="id" value={id} />
        </ActionForm>
      ) : null}
      <ActionForm action={removeStudyAction} label="Remove" variant="ghost" size="sm">
        <input type="hidden" name="id" value={id} />
      </ActionForm>
    </div>
  );
}

export function TemplateUpload({ family }: { family: Family }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full px-4 py-3 text-left text-body text-accent-text">
        Use my own template instead
      </button>
    );
  return (
    <div className="px-4 pb-4">
      <p className="mb-3 pt-2 text-footnote text-text-secondary">A text or Markdown file. Each heading (# Title, ## Title or 1. Title) starts a section; the text under it says what the section must establish. It stays in your vault and replaces the canonical sections; your methodology amends it the same way.</p>
      <FileAction
        action={uploadTemplateAction}
        name="template"
        accept=".md,.txt,.markdown,text/plain,text/markdown"
        label="Choose the template file"
        pendingLabel="Reading"
        doneLabel="Template in use"
        extra={
          <label className="mb-3 block w-full text-subhead">
            It is a template for
            <select name="family" defaultValue={family} className={field}>
              {FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {FAMILY_LABEL[f]} studies
                </option>
              ))}
            </select>
          </label>
        }
      />
    </div>
  );
}

export function FamilyPicker({ current }: { current: Family }) {
  return (
    <ActionForm action={chooseFamilyAction} label="Use this family's template" variant="secondary" size="sm" className="px-4 pb-4">
      <label className="block pt-2 text-subhead">
        Template family
        <select name="family" defaultValue={current} className={`${field} mb-3`}>
          {FAMILIES.map((f) => (
            <option key={f} value={f}>
              {FAMILY_LABEL[f]}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}

/** One section of the template, with its guidance and what the methodology adds; editable in drive mode. */
export function TemplateSectionRow({ s, index, family, editable }: { s: AppliedSection; index: number; family: Family; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <ListRow
        wrap
        label={
          <>
            <span className="data mr-2 text-text-tertiary">{index + 1}</span>
            {s.title}
          </>
        }
        detail={
          <>
            <span className="block">{s.guidance || "No guidance yet."}</span>
            {s.amendments.map((a) => (
              <span key={a} className="block text-text-tertiary">
                From your methodology: {a}
              </span>
            ))}
          </>
        }
        trailing={
          editable ? (
            <button type="button" onClick={() => setEditing((v) => !v)} className="shrink-0 text-subhead text-accent-text">
              {editing ? "Close" : "Edit"}
            </button>
          ) : undefined
        }
      />
      {editing ? (
        <div className="px-4 pb-4">
          <ActionForm action={editSectionAction} label="Save guidance" variant="secondary" size="sm">
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="family" value={family} />
            <textarea name="guidance" defaultValue={s.guidance} rows={4} maxLength={2000} className={`${field} mb-3`} />
          </ActionForm>
        </div>
      ) : null}
    </>
  );
}
