"use client";

import { X } from "lucide-react";
import { useActionState } from "react";

import { dropAction, reviseAction, sampleDraftAction, type MethodologyState } from "@/app/(app)/methodology/actions";
import { ActionForm } from "@/components/app/action-form";
import { reached } from "@/components/app/reach";

/**
 * The builder's controls: remove an element from the draft, ask for changes in
 * words, start from a sample, keep the person's model provider. Each is a small form
 * posting to a server action; the page re-renders with the new draft.
 */

export function RemoveButton({ id, label }: { id: string; label: string }) {
  const [state, run, pending] = useActionState<MethodologyState, FormData>(reached(dropAction), { error: null });
  return (
    <form action={run} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} aria-label={`Remove ${label}`} title="Remove from the draft" className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-40">
        <X className="size-4" aria-hidden />
      </button>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}

export function ReviseForm() {
  return (
    <ActionForm action={reviseAction} label="Ask for the change" pendingLabel="Rewriting the draft" note="Takes up to a minute." className="card px-4 py-4">
      <label className="block">
        <span className="mb-1 block text-subhead">Change something in words</span>
        <textarea name="instruction" rows={2} maxLength={2000} required placeholder="Cap any single holding at 15%, and show dividend income by quarter rather than month." className="mb-3 block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body" />
      </label>
    </ActionForm>
  );
}

export function SampleButton({ sample, label, variant = "secondary", doneHref }: { sample: string; label: string; variant?: "primary" | "secondary"; doneHref?: string }) {
  return (
    <ActionForm action={sampleDraftAction} label={label} variant={variant} doneLabel="Drafted" doneHref={doneHref} className="inline-block">
      <input type="hidden" name="sample" value={sample} />
    </ActionForm>
  );
}
