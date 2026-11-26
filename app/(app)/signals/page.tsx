import { Activity } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import type { Route } from "next";

import { NoFigures } from "@/components/app/no-figures";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { decisionOn, outcomeWords } from "@/lib/decisions";
import { deriveScreens } from "@/lib/screen-data";
import { SIGNAL_GROUP, SIGNAL_LABEL, SIGNAL_ORDER, SIGNAL_TONE, type Signal } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Triggers & kill signals · Invariant" };

/** "reading · limit · section", skipping what the signal does not have. */
function readingLine(s: Signal): string {
  return [s.reading, s.limit ? `limit ${s.limit}` : null, s.rule.section].filter(Boolean).join(" · ");
}

/**
 * Every tested rule as one signal per holding, grouped by status: red for a
 * breach or a guideline failing, amber near the limit or a watch tripped,
 * grey waiting for data, information for the rules the person checks, the
 * rest clear. Each signal names its section.
 */
export default async function SignalsPage() {
  const ws = await screen("overview");
  if (!ws.book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Triggers & kill signals" />
        <PageBody>
          <NoFigures what="Signals" />
        </PageBody>
      </>
    );
  const today = localDay();
  const data = deriveScreens({ book: ws.book, methodology: ws.setup.methodology, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("signals");
  const tested = (data.m?.rules ?? []).filter((r) => r.test).length;
  const signals = data.signals;

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Triggers & kill signals" subtitle={`${signals.length} signal${signals.length === 1 ? "" : "s"} from ${tested} tested rule${tested === 1 ? "" : "s"} · readings as of ${longDate(ws.book.asOf)}`} />
      <PageBody>
        {!data.m || !tested ? (
          <div className="mb-8 card">
            <EmptyState icon={Activity} title="No tested rules yet" instruction="Signals come from the rules your methodology tests. Choose a methodology on Setup and each tested rule reads here." action={null} />
          </div>
        ) : !slots.includes("signal_groups") ? null : signals.length === 0 ? (
          <p className="mb-8 px-1 text-subhead text-text-secondary">The tested rules have nothing to read yet; a holding they apply to puts a signal here.</p>
        ) : (
          SIGNAL_ORDER.map((status) => {
            const items = signals.filter((s) => s.status === status);
            if (!items.length) return null;
            return (
              <ListSection grid key={status} header={`${SIGNAL_GROUP[status]} · ${items.length}`}>
                {items.map((s) => (
                  <ListLinkRow
                    key={s.key}
                    href={(s.symbol ? `/holdings/${encodeURIComponent(s.symbol)}` : "/methodology") as Route}
                    label={
                      <span className="block whitespace-normal">
                        {s.symbol ? <span className="data mr-2 font-semibold">{s.symbol}</span> : null}
                        {s.rule.text}
                      </span>
                    }
                    detail={
                      <>
                        <span className="data">{readingLine(s)}</span>
                        {s.detail ? <span className="block">{s.detail}</span> : null}
                        {(() => {
                          const d = s.status === "red" ? decisionOn(ws.decisions, `red:${s.key}`) : null;
                          return d?.action ? <span className="block text-text-tertiary">Decided {outcomeWords(d.action)} on {longDate(d.date)}; the to-do list says whether it still answers.</span> : null;
                        })()}
                      </>
                    }
                    value={<StatusPill tone={SIGNAL_TONE[status]}>{SIGNAL_LABEL[status]}</StatusPill>}
                  />
                ))}
              </ListSection>
            );
          })
        )}
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
