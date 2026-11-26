import { ActionForm } from "@/components/app/action-form";
import { StatusPill } from "@/components/ui/status";
import { usd } from "@/lib/agents";
import { PRICED_LABEL, pricedFresh, type PricedFacts, type PricedIn as Reading, type PricedVerdict } from "@/lib/research-agent";
import { longDate } from "@/lib/time";

import { pricedInAction } from "@/app/(app)/agents/actions";

const VERDICT_TONE: Record<PricedVerdict, "ok" | "info" | "neutral" | "warn"> = { priced: "neutral", partly: "info", not_priced: "ok", bet_against: "warn" };

const pct = (v: number | null) => (v === null ? "n/a" : `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(1)}%`);

/**
 * What the price assumes (the agents doc, §4.3): the app's own figures first
 * (what the reverse DCF says the price needs, what was delivered, the
 * guidance and the person's cases), then the reading on the person's own
 * model, each pillar priced in, partly, not priced in or bet against, with
 * its evidence and pages. Asked on request; a reading is kept a week.
 */
export function PricedInPanel({ facts, reading, today, editable, hasModel }: { facts: PricedFacts | null; reading: Reading | undefined; today: string; editable: boolean; hasModel: boolean }) {
  const fresh = pricedFresh(reading, today);
  const shown = reading ?? null;
  const f = shown?.facts ?? facts;
  return (
    <div className="card px-4 py-4">
      {f ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-footnote text-text-secondary">What the price needs</dt>
            <dd className="data mt-1 text-title-3">{f.implied ? `${pct(f.implied.cagrPct)} a year` : "n/a"}</dd>
            <dd className="mt-0.5 text-caption text-text-tertiary">{f.implied ? `Revenue growth, end margin ${pct(f.implied.marginPct)}; reverse DCF on ${f.implied.basis}` : "No reverse DCF until the filings are read"}</dd>
          </div>
          <div>
            <dt className="text-footnote text-text-secondary">What was delivered</dt>
            <dd className="data mt-1 text-title-3">{f.delivered?.cagrPct !== null && f.delivered ? `${pct(f.delivered.cagrPct)} a year` : f.delivered ? pct(f.delivered.lastPct) : "n/a"}</dd>
            <dd className="mt-0.5 text-caption text-text-tertiary">{f.delivered ? `Revenue growth${f.delivered.cagrPct !== null ? ` over ${f.delivered.years} years, ${pct(f.delivered.lastPct)} in the latest` : " in the latest year"}` : "No years of filings read yet"}</dd>
          </div>
          <div>
            <dt className="text-footnote text-text-secondary">Your cases</dt>
            <dd className="data mt-1 text-title-3">{f.cases ? `${f.cases.low.toFixed(0)} · ${f.cases.base.toFixed(0)} · ${f.cases.high.toFixed(0)}` : "none"}</dd>
            <dd className="mt-0.5 text-caption text-text-tertiary">{f.cases ? `Bear, base and bull a share against ${f.price !== null ? `${f.price.toFixed(2)} ${f.currency ?? ""}`.trimEnd() : "the price"}` : "Keep a valuation in the calculator above"}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-footnote text-text-secondary">The question needs today&rsquo;s price, which the app reads for a holding or a watchlist company once its closes are read.</p>
      )}
      {f?.guidance ? <p className="mt-3 text-footnote text-text-secondary">Guidance on file: {f.guidance}</p> : null}

      {shown ? (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="text-subhead font-semibold">{shown.summary}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {fresh ? "Read" : "Read more than a week ago,"} {longDate(shown.day)} with the AI{shown.web ? ", with the web" : ", from the kept news alone"}
            {shown.costUsd !== null ? `, about ${usd(shown.costUsd)}` : ""}.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {shown.pillars.map((p) => (
              <li key={p.id} className="rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-footnote font-semibold">{p.pillar}</span>
                  <StatusPill tone={VERDICT_TONE[p.verdict]}>{PRICED_LABEL[p.verdict]}</StatusPill>
                </p>
                <p className="mt-1 text-footnote text-text-secondary">{p.evidence}</p>
                {p.sources.length ? (
                  <ul className="mt-1 space-y-0.5 text-caption text-text-tertiary">
                    {p.sources.map((s, i) => (
                      <li key={`${s.url ?? s.title}-${i}`}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-text">
                            {s.title}
                          </a>
                        ) : (
                          s.title
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {facts && (editable || !shown) ? (
        <div className="mt-4">
          {!hasModel && editable ? (
            <p className="text-footnote text-text-secondary">The reading runs with the AI, which is not set up on this deployment yet.</p>
          ) : (
            <ActionForm action={pricedInAction} label={shown ? "Ask again" : "Ask what the price assumes"} pendingLabel="Reading" variant={shown ? "secondary" : "primary"} size="sm" doneLabel="Read" note="One call with the AI, a few searches">
              <input type="hidden" name="facts" value={JSON.stringify(facts)} />
            </ActionForm>
          )}
        </div>
      ) : null}
      <p className="mt-3 text-caption text-text-tertiary">The figures are the app&rsquo;s; the reading of each pillar is the AI&rsquo;s, with its pages. Not investment advice.</p>
    </div>
  );
}
