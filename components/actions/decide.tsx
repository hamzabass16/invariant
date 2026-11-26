import { ActionForm } from "@/components/app/action-form";
import { decideAction } from "@/app/(app)/todo/actions";
import { OUTCOME_LABEL } from "@/lib/decisions";
import type { Methodology } from "@/lib/methodology";
import { OUTCOMES_FOR, type TodoItem } from "@/lib/todo";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

const SUMMARY: Record<keyof typeof OUTCOMES_FOR, string> = { trim: "Plan the trim", decide: "Decide", vote: "Vote", check: "Mark checked", settle: "Rolled, closed or let go" };

/**
 * The action that answers a to-do item, folded under one line: plan a trim,
 * decide (hold, trim, sell, probation), vote (with the class voted, kept and
 * never applied), mark a rule checked, or settle an expiry. Each files a
 * Decision Log entry naming the item; nothing goes to a broker.
 */
export function Decide({ item, m, today }: { item: TodoItem; m: Methodology | null; today: string }) {
  if (!item.act || item.act === "log") return null;
  const act = item.act;
  const outcomes = OUTCOMES_FOR[act];
  const hidden = (
    <>
      <input type="hidden" name="act" value={act} />
      <input type="hidden" name="on" value={item.key} />
      <input type="hidden" name="symbol" value={item.symbol ?? ""} />
      <input type="hidden" name="title" value={item.title} />
      <input type="hidden" name="reading" value={item.reading ?? ""} />
    </>
  );
  if (act === "check")
    return (
      <ActionForm action={decideAction} label="Mark checked" pendingLabel="Filing" variant="secondary" size="sm" className="px-4 pb-3">
        {hidden}
        <input type="hidden" name="outcome" value="checked" />
      </ActionForm>
    );
  const dated = outcomes.some((o) => o === "trim" || o === "sell" || o === "probation");
  return (
    <details className="group px-4 pb-3">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">{SUMMARY[act]}</summary>
      <ActionForm action={decideAction} label="File the decision" pendingLabel="Filing" variant="secondary" size="sm" className="mt-3">
        {hidden}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-subhead">
            Outcome
            <select name="outcome" className={field} defaultValue={outcomes[0]}>
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          {act === "vote" && m?.classes.length ? (
            <label className="block text-subhead">
              Class voted
              <select name="votedClass" className={field} defaultValue="">
                <option value="">None</option>
                {m.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {outcomes.includes("trim") ? (
            <label className="block text-subhead">
              Trim to, % of net worth
              <input name="targetPct" type="number" step="any" min="0" max="100" className={`${field} data`} />
            </label>
          ) : null}
          {dated ? (
            <label className="block text-subhead">
              By, or until
              <input name="by" type="date" min={today} className={`${field} data`} />
            </label>
          ) : null}
        </div>
        <label className="mt-2 mb-3 block text-subhead">
          {act === "vote" ? "Reasons" : "Note"}
          <textarea name="note" rows={2} maxLength={4000} className={field} placeholder={act === "vote" ? "The rules the vote rests on." : "What you decided and why."} />
        </label>
        {act === "vote" ? <p className="mb-3 text-footnote text-text-tertiary">The class you vote is kept beside the class the tests give and never replaces it; where they differ, a to-do asks for the methodology to say so.</p> : null}
        {dated ? <p className="mb-3 text-footnote text-text-tertiary">A trim needs its weight; a probation its end date. A dated decision moves the item to that date.</p> : null}
      </ActionForm>
    </details>
  );
}
