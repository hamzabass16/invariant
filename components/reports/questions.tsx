"use client";

import { addQuestionAction, removeQuestionAction } from "@/app/(app)/reports/actions";
import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/**
 * The questions a person wants every review to answer (Hamza, 18 Oct 2026):
 * each kept in their preferences and answered on their own key from the
 * review's figures, as a section of the report, a slide of the deck and a
 * chapter of the PDF. Up to six; one line to add, Remove beside each.
 */
export function ReviewQuestions({ questions, max, hasKey }: { questions: readonly string[]; max: number; hasKey: boolean }) {
  return (
    <section className="mb-8">
      <h2 className="section-header mb-2 px-1">Questions for every review</h2>
      <ListSection footer={`Each is answered with the AI from the review's own figures, as a section of the review, a slide of the deck and a chapter of the PDF report. Up to ${max}. Not advice.${hasKey ? "" : " Add the AI on Setup first; the questions are kept meanwhile."}`}>
        {questions.length ? (
          questions.map((q, i) => <ListRow key={`${i}-${q}`} wrap label={q} trailing={<ActionButton action={removeQuestionAction.bind(null, i)} label="Remove" variant="ghost" size="sm" doneLabel="Removed" />} />)
        ) : (
          <ListRow wrap label="None yet" detail="For example: Is the book more concentrated than my methodology allows, and where? Which holding moved the book most, and does its thesis explain it?" />
        )}
      </ListSection>
      {questions.length < max ? (
        <ActionForm action={addQuestionAction} label="Keep this question" variant="secondary" doneLabel="Kept" className="card mt-3 px-4 py-4">
          <label className="mb-3 block text-subhead">
            A question about your portfolio
            <input name="question" className={field} placeholder="What should I do about the holdings over their caps?" maxLength={300} required />
          </label>
        </ActionForm>
      ) : null}
    </section>
  );
}
