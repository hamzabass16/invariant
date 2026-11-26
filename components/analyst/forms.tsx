"use client";

import { useState } from "react";

import { approveLessonAction, askAction, discardLessonAction, keepFigureAction, removeThreadAction } from "@/app/(app)/analyst/actions";
import { ActionForm } from "@/components/app/action-form";
import { ListRow } from "@/components/ui/list";
import { toolLabel, type Lesson, type TraceStep } from "@/lib/analyst";
import type { Figure } from "@/lib/recipes";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/** One question; in a conversation, the follow-up. The action runs the agent on the person's key and can take a minute or two. */
export function AskForm({ thread, hasKey, placeholder }: { thread: string | null; hasKey: boolean; placeholder: string }) {
  return (
    <ActionForm action={askAction} label={thread ? "Ask" : "Ask the analyst"} pendingLabel="Working" note="Planning the figures, computing them and writing the answer with the AI. A minute or two." className="card px-4 py-4">
      {thread ? <input type="hidden" name="thread" value={thread} /> : null}
      <label className="block text-subhead">
        {thread ? "Follow up" : "Your question"}
        <textarea name="question" rows={thread ? 2 : 3} maxLength={1500} className={field} placeholder={placeholder} required />
      </label>
      <p className="mt-2 mb-3 text-footnote text-text-tertiary">
        Every number in the answer is computed by the app from a recipe the analyst wrote; every verdict runs your methodology&apos;s own rules and cites the section.{hasKey ? "" : " The AI is not set up on this deployment yet."}
      </p>
    </ActionForm>
  );
}

export function ThreadControls({ id }: { id: string }) {
  return (
    <ActionForm action={removeThreadAction} label="Remove conversation" variant="ghost" size="sm">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}

/** How an answer was worked out: each tool call with what was asked and the first part of what came back. */
export function Trace({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  return (
    <div className="mt-3 border-t border-hairline pt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-footnote text-accent-text" aria-expanded={open}>
        {open ? "Hide" : "Show"} how it was worked out ({steps.length} {steps.length === 1 ? "step" : "steps"})
      </button>
      {open ? (
        <ol className="mt-2 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="text-footnote">
              <p className="font-medium text-text-secondary">
                {i + 1}. {toolLabel(s.tool)}
              </p>
              <pre className="data mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-text-secondary">{s.summary}</pre>
              <pre className="data mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed">{s.result}</pre>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** The recipes computed for an answer, each keepable as one of the person's own figures. */
export function KeepFigures({ thread, message, figures, kept }: { thread: string; message: number; figures: Figure[]; kept: Set<string> }) {
  if (!figures.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {figures.map((f) => {
        const already = kept.has(f.label);
        return (
          <ActionForm key={f.id} action={keepFigureAction} label={already ? `${f.label}: kept` : `Keep "${f.label}" as my figure`} variant="secondary" size="sm">
            <input type="hidden" name="thread" value={thread} />
            <input type="hidden" name="message" value={message} />
            <input type="hidden" name="figure" value={f.id} />
          </ActionForm>
        );
      })}
    </div>
  );
}

export function LessonRow({ lesson }: { lesson: Lesson }) {
  return (
    <ListRow
      wrap
      label={lesson.text}
      detail={`${lesson.reason}${lesson.status === "approved" ? " · in force" : " · proposed, not in force"}`}
      trailing={
        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
          {lesson.status === "proposed" ? (
            <ActionForm action={approveLessonAction} label="Approve" variant="primary" size="sm">
              <input type="hidden" name="id" value={lesson.id} />
            </ActionForm>
          ) : null}
          <ActionForm action={discardLessonAction} label={lesson.status === "approved" ? "Withdraw" : "Discard"} variant="ghost" size="sm">
            <input type="hidden" name="id" value={lesson.id} />
          </ActionForm>
        </div>
      }
    />
  );
}
