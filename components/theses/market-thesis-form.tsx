import { ActionForm } from "@/components/app/action-form";
import { MARKETS } from "@/lib/markets";
import { MAX_BASKET, MAX_PILLARS, MAX_WATCH, type MarketThesis } from "@/lib/theses";

import { saveMarketThesisAction } from "@/app/(app)/theses/actions";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const small = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-2.5 py-1.5 text-footnote text-text";

/**
 * A market thesis in the person's words: the title, the text, what to watch,
 * and the pillars, each tested on a market indicator's level so the screen
 * reads it every day.
 */
export function MarketThesisForm({ thesis }: { thesis: MarketThesis | null }) {
  const pillars = [...(thesis?.pillars ?? [])];
  while (pillars.length < Math.min(MAX_PILLARS, Math.max(2, (thesis?.pillars.length ?? 0) + 1))) pillars.push({ id: "", name: "", text: "", test: null });
  return (
    <ActionForm action={saveMarketThesisAction} label={thesis ? "Save the thesis" : "Write the market thesis"} pendingLabel="Saving" doneLabel="Saved" doneHref={thesis ? undefined : "/theses"} className="card px-4 py-4">
      {thesis ? <input type="hidden" name="id" value={thesis.id} /> : null}
      <label className="block text-subhead">
        Title
        <input name="title" className={field} maxLength={120} defaultValue={thesis?.title ?? ""} placeholder="Rates stay higher for longer" required />
      </label>
      <label className="mt-3 block text-subhead">
        The thesis
        <textarea name="text" rows={6} maxLength={6000} className={field} defaultValue={thesis?.text ?? ""} placeholder="What you believe about the market, and what it means for the book. A paragraph per idea." />
      </label>
      <label className="mt-3 block text-subhead">
        What to watch, one line each (up to {MAX_WATCH})
        <textarea name="watch" rows={3} maxLength={2500} className={field} defaultValue={(thesis?.watch ?? []).join("\n")} placeholder="Term premium after each refunding." />
      </label>
      <label className="mt-3 block text-subhead">
        The basket: companies that express it, up to {MAX_BASKET}
        <input name="basket" className={`${field} data`} maxLength={140} defaultValue={(thesis?.basket ?? []).join(", ")} placeholder="NVDA, AVGO, TSM" />
        <span className="mt-1 block text-footnote text-text-tertiary">Measured together, in equal parts, against SPY from the day the thesis was written. Only measured: it changes no rule and buys nothing.</span>
      </label>
      <fieldset className="mt-4">
        <legend className="section-header">The pillars</legend>
        <p className="mt-1 mb-2 text-footnote text-text-tertiary">What the thesis stands on, each tested on an indicator the app reads every day: supported, mixed within a tenth of the level, or at risk. A pillar with no test is yours to judge.</p>
        <div className="space-y-3">
          {pillars.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-[12px] bg-surface-2 p-3 sm:grid-cols-[1fr_2fr] lg:grid-cols-[1fr_2fr_1fr_6rem_6rem]">
              <label className="block text-caption text-text-secondary">
                Pillar {i + 1}
                <input name={`pillar_${i}_name`} className={small} defaultValue={p.name} maxLength={80} placeholder="Ten-year yield" />
              </label>
              <label className="block text-caption text-text-secondary">
                What must stay true
                <input name={`pillar_${i}_text`} className={small} defaultValue={p.text} maxLength={600} placeholder="The ten-year yield stays at or above 4%." />
              </label>
              <label className="block text-caption text-text-secondary">
                Tested on
                <select name={`pillar_${i}_field`} className={small} defaultValue={p.test?.field ?? ""}>
                  <option value="">No test</option>
                  {MARKETS.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.name}
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
      <p className="mt-3 mb-3 text-footnote text-text-tertiary">Kept in your vault&apos;s theses file beside the stock theses. It changes no rule.</p>
    </ActionForm>
  );
}
