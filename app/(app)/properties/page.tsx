import { ActionButton } from "@/components/app/action-button";
import { AskClaudeCard } from "@/components/app/ask-claude";
import { askState } from "@/lib/ask-claude-run";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { ActionForm } from "@/components/app/action-form";
import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { decisionOn } from "@/lib/decisions";
import { ownerValue } from "@/lib/exposure";
import { money } from "@/lib/holdings";
import { daysUntil } from "@/lib/time";
import { screen } from "@/lib/workspace";

import { acceptRevaluationAction, keepValuationAction, runWatchAction } from "./actions";

export const metadata = { title: "Real estate · Invariant" };
// "Check now" runs one web-searching model call per property, side by side, on the person's key.
export const maxDuration = 300;

const RENTAL = { long_term: "Rented long-term", short_stay: "Short-stay rental", own_use: "Own use", vacant: "Vacant" } as const;
const ARROW = { up: "Likely up", down: "Likely down", unclear: "Unclear" } as const;

export default async function PropertiesPage() {
  const ws = await screen("properties");
  const { book, sample, propertyWatch: watch, mode, hasModelKey, provider, decisions } = ws;
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Real estate" />
        <PageBody>
          <NoFigures what="Properties" />
        </PageBody>
      </>
    );
  const ccy = book.fx.base;
  const props = book.holdings.filter((h) => h.assetClass === "real_estate" && h.property);
  const ask = props.length ? await askState(ws) : { ask: false, connected: null };

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Real estate" subtitle={watch ? `Last checked ${watch.updated}` : "Not checked yet"} />
      <PageBody>
        <SampleNote sample={sample} asOf={book.asOf} />
        {props.length && ask.ask ? <AskClaudeCard feature="property_watch" connected={ask.connected} demo={mode === "demo"} /> : null}
        {mode === "drive" && props.length && !ask.ask ? (
          <div className="mb-8 card px-4 py-4">
            <p className="mb-3 text-subhead text-text-secondary">
              A check searches the web with the AI, one call per property with up to six searches each: asking rents nearby, the short-stay market, and news that could move the price, every figure with the page it came from. Run it when you want it, about weekly.
              {!hasModelKey ? " The AI is not set up on this deployment yet." : provider?.kind !== "anthropic" ? " The AI cannot search the web here." : ""}
            </p>
            <ActionButton action={runWatchAction} label={watch ? "Check again now" : "Check now"} variant={hasModelKey && provider?.kind === "anthropic" ? "primary" : "secondary"} />
          </div>
        ) : null}
        {props.map((h) => {
          const p = h.property!;
          const w = watch?.properties.find((x) => x.holdingId === h.id);
          const stale = p.valuationDate !== null && daysUntil(p.valuationDate) < -365;
          return (
            <div key={h.id} className="mb-10">
              <ListSection header={h.name} footer={w?.whatChanged ? `This week: ${w.whatChanged}` : undefined}>
                <ListRow
                  label="Value to you"
                  detail={`${money(h.value, h.currency)} at ${p.ownershipPct}%${p.mortgage ? `, less ${money(p.mortgage, h.currency)} mortgage` : ""} · ${p.valuationSource}`}
                  value={<span className="data">{money(ownerValue(h, book), ccy)}</span>}
                />
                {stale ? <ListRow label="Valuation is over 12 months old" detail="A fresh estimate or appraisal keeps net worth honest." trailing={<StatusPill tone="warn">Stale</StatusPill>} wrap /> : null}
                <ListRow label={RENTAL[p.rental]} detail={p.address} value={p.monthlyRent ? <span className="data">{money(p.monthlyRent, h.currency)}/mo</span> : undefined} />
                {w?.suggestedValuation
                  ? (() => {
                      const settled = decisionOn(decisions, `revalue:${h.id}:${w.suggestedValuation.value}`.slice(0, 200));
                      return (
                        <>
                          <ListRow wrap label="Suggested revaluation" detail={settled?.action ? `${w.suggestedValuation.basis} ${settled.action.outcome === "accepted" ? "Accepted" : "You kept your value"} on ${settled.date}.` : `${w.suggestedValuation.basis} Not applied until you accept it.`} value={<span className="data">{money(w.suggestedValuation.value, h.currency)}</span>} />
                          {settled ? null : (
                            <div className="flex flex-wrap gap-2 px-4 pb-3">
                              <ActionForm action={acceptRevaluationAction} label="Accept" pendingLabel="Saving" variant="secondary" size="sm">
                                <input type="hidden" name="holdingId" value={h.id} />
                              </ActionForm>
                              <ActionForm action={keepValuationAction} label="Keep mine" pendingLabel="Saving" variant="ghost" size="sm">
                                <input type="hidden" name="holdingId" value={h.id} />
                              </ActionForm>
                            </div>
                          )}
                        </>
                      );
                    })()
                  : null}
              </ListSection>

              {w?.longTerm ? (
                <ListSection grid header="Long-term rents nearby" footer={`${w.longTerm.note} Sources: ${w.longTerm.sources.map((s) => s.title).join(", ")}.`}>
                  <ListRow wrap label={`Median of ${w.longTerm.count} listings within ${w.longTerm.radiusKm} km`} detail={`Range ${money(w.longTerm.low, h.currency)} to ${money(w.longTerm.high, h.currency)}${w.longTerm.trendPct !== null ? ` · ${w.longTerm.trendPct > 0 ? "+" : ""}${w.longTerm.trendPct.toFixed(1)}% on last quarter` : ""}`} value={<span className="data">{money(w.longTerm.medianRent, h.currency)}/mo</span>} />
                  {p.monthlyRent ? <ListRow label="Your rent against the median" value={<span className="data">{(((p.monthlyRent - w.longTerm.medianRent) / w.longTerm.medianRent) * 100).toFixed(0)}%</span>} /> : null}
                </ListSection>
              ) : null}

              {w?.shortStay ? (
                <ListSection grid header="Short-stay market nearby" footer={`${w.shortStay.note} Sources: ${w.shortStay.sources.map((s) => s.title).join(", ")}.`}>
                  <ListRow label="Average nightly rate" value={<span className="data">{w.shortStay.adr === null ? "n/a" : money(w.shortStay.adr, h.currency)}</span>} />
                  <ListRow label="Occupancy" value={<span className="data">{w.shortStay.occupancyPct === null ? "n/a" : `${w.shortStay.occupancyPct}%`}</span>} />
                </ListSection>
              ) : null}

              {w?.news.length ? (
                <ListSection grid header="What could move the price">
                  {w.news.map((n) => (
                    <ListRow
                      wrap
                      key={n.title}
                      label={
                        <a href={n.source.url} target="_blank" rel="noreferrer" className="underline decoration-text-tertiary underline-offset-2">
                          {n.title}
                        </a>
                      }
                      detail={`${n.date}${n.distanceKm !== null ? ` · ${n.distanceKm} km away` : ""} · ${n.why}`}
                      trailing={<StatusPill tone={n.direction === "up" ? "ok" : n.direction === "down" ? "danger" : "neutral"}>{ARROW[n.direction]}</StatusPill>}
                    />
                  ))}
                </ListSection>
              ) : null}
            </div>
          );
        })}
        <p className="px-1 text-footnote text-text-tertiary">Asking prices lag and overstate deals; small-area samples are thin. Not investment advice.</p>
      </PageBody>
    </>
  );
}
