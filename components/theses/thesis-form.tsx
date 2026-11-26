import { ActionForm } from "@/components/app/action-form";
import { FIELDS, FUNDAMENTAL_FIELDS } from "@/lib/ontology";
import { MAX_PILLARS, MAX_WATCH, type Thesis } from "@/lib/theses";

import { saveThesisAction } from "@/app/(app)/theses/actions";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const small = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-2.5 py-1.5 text-footnote text-text";

/**
 * The thesis in the person's words, as HCMP's record Docs carry it: the
 * text, the pathway (what a Transitional holding must do to move up), what to
 * watch, and the pillars, each with the ontology field and level that tests it
 * so every report reads the new figures against them.
 */
export function ThesisForm({ symbol, thesis }: { symbol: string; thesis: Thesis | null }) {
  const pillars = [...(thesis?.pillars ?? [])];
  while (pillars.length < Math.min(MAX_PILLARS, Math.max(3, (thesis?.pillars.length ?? 0) + 1))) pillars.push({ id: "", name: "", text: "", test: null });
  return (
    <ActionForm action={saveThesisAction} label={thesis ? "Save the thesis" : "Write the thesis"} pendingLabel="Saving" doneLabel="Saved" className="card px-4 py-4">
      <input type="hidden" name="symbol" value={symbol} />
      <label className="block text-subhead">
        The thesis
        <textarea name="text" rows={6} maxLength={6000} className={field} defaultValue={thesis?.text ?? ""} placeholder="Why this business, in your own words: what it sells, who pays, what must stay true. A paragraph per idea." />
      </label>
      <label className="mt-3 block text-subhead">
        The pathway, if the class is a step on the way
        <textarea name="pathway" rows={2} maxLength={1500} className={field} defaultValue={thesis?.pathway ?? ""} placeholder="What the company must show, over how long, to move to the next class." />
      </label>
      <label className="mt-3 block text-subhead">
        What to watch, one line each (up to {MAX_WATCH})
        <textarea name="watch" rows={3} maxLength={2500} className={field} defaultValue={(thesis?.watch ?? []).join("\n")} placeholder="Export licences on servicing tools already sold." />
      </label>
      <fieldset className="mt-4">
        <legend className="section-header">The pillars</legend>
        <p className="mt-1 mb-2 text-footnote text-text-tertiary">What the thesis stands on, each with the figure that tests it. A pillar with no test is yours to judge; one with a test is scored on every report: supported, mixed within a tenth of the level, or at risk.</p>
        <div className="space-y-3">
          {pillars.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-[12px] bg-surface-2 p-3 sm:grid-cols-[1fr_2fr] lg:grid-cols-[1fr_2fr_1fr_6rem_6rem]">
              <label className="block text-caption text-text-secondary">
                Pillar {i + 1}
                <input name={`pillar_${i}_name`} className={small} defaultValue={p.name} maxLength={80} placeholder="Pricing power" />
              </label>
              <label className="block text-caption text-text-secondary">
                What must stay true
                <input name={`pillar_${i}_text`} className={small} defaultValue={p.text} maxLength={600} placeholder="Gross margin holds above its past peak through the cycle." />
              </label>
              <label className="block text-caption text-text-secondary">
                Tested on
                <select name={`pillar_${i}_field`} className={small} defaultValue={p.test?.field ?? ""}>
                  <option value="">No test</option>
                  <option value="price">Price</option>
                  {FUNDAMENTAL_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELDS[f].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-caption text-text-secondary">
                Holds when
                <select name={`pillar_${i}_is`} className={small} defaultValue={p.test?.is ?? "gte"}>
                  <option value="gte">at or above</option>
                  <option value="lte">at or below</option>
                </select>
              </label>
              <label className="block text-caption text-text-secondary">
                Level
                <input name={`pillar_${i}_value`} type="number" step="any" inputMode="decimal" className={`${small} data`} defaultValue={p.test?.value ?? ""} />
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 mb-3 text-footnote text-text-tertiary">Kept in your vault&apos;s theses file. The decks read the thesis and score the pillars; nothing here changes a class or a cap.</p>
    </ActionForm>
  );
}
