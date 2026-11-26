import { ScreenFreshness } from "@/components/app/screen-freshness";
import { EtfFlowsCard, FundsMovedCard } from "@/components/markets/etf-flows";
import { CashCard, ForeignCard, InsidersCard, PositioningCard } from "@/components/markets/flow-cards";
import { FreshBadge } from "@/components/ui/freshness";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { freshness, type FreshKind } from "@/lib/freshness";
import type { FlowSource, FlowSourceRow } from "@/lib/flows";
import { slotsOn } from "@/lib/screens";
import { localDay } from "@/lib/time";
import { etfFlowsFor, flowSourcesFor, screen } from "@/lib/workspace";

export const metadata = { title: "Flows · Invariant" };
export const maxDuration = 300;

/** A card whose source could not be read: its title and the sentence. */
function Unread({ title, sentence }: { title: string; sentence: string }) {
  return (
    <section className="card px-4 py-3">
      <h3 className="section-header">{title}</h3>
      <p className="mt-1 text-footnote text-text-secondary">{sentence}</p>
    </section>
  );
}

/** The sentence for a source not read yet: its last try's, else when it will be. */
function unreadWords(row: FlowSourceRow | null, s: FlowSource): string {
  const tried = row?.tried[s];
  if (tried?.error) return tried.error;
  return "Read at the next morning run, for everyone.";
}

/** When a source was last checked: its last try when that held, else the copy kept. */
function checkedAt(row: FlowSourceRow, s: FlowSource, readAt: string): string {
  const tried = row.tried[s];
  return tried && tried.error === null ? tried.at : readAt;
}

/**
 * Flows (Hamza, 21 Nov 2026: "not really macro ... what's happening in the
 * markets right now, the flows"): where money is moving, each card from a
 * public filing or a government report, read once for everyone, each saying
 * how far behind it is.
 */
export default async function FlowsPage() {
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  const today = localDay();
  const slots = slotsOn("flows", ws.shown);
  const on = (id: string) => slots.includes(id as (typeof slots)[number]);
  const etf = on("flow_etfs") || on("flow_funds") ? await etfFlowsFor(ws) : null;
  const sourcesOn = on("flow_positioning") || on("flow_foreign") || on("flow_cash") || on("flow_insiders");
  const row = sourcesOn ? await flowSourcesFor(ws) : null;
  const badge = (kind: FreshKind, at: string | null | undefined) => (demo ? <FreshBadge compact fresh={freshness("sample", null, today)} /> : at ? <FreshBadge compact fresh={freshness(kind, at.slice(0, 10), today)} /> : null);
  const weekly = (at: string | null | undefined) => badge("weekly", at);

  return (
    <>
      <PageHeader title="Flows" subtitle="Where money is moving in the markets" fresh={<ScreenFreshness />} />
      <PageBody>
        <p className="mb-6 px-1 text-footnote text-text-secondary">
          {demo ? "Fictional figures, for the demo. " : ""}Each card is read from public filings and government reports, once for everyone, and says which weeks or months it covers: a fund&rsquo;s report is public weeks after the month it covers. What money did, not what it will do. Not investment advice.
        </p>
        <div className="space-y-8">
          {on("flow_etfs") ? etf?.flows ? <EtfFlowsCard flows={etf.flows} badge={weekly(etf.flows.readAt)} /> : etf?.error ? <Unread title="Where the money in ETFs went" sentence={etf.error} /> : null : null}
          {on("flow_funds") && etf?.flows ? <FundsMovedCard flows={etf.flows} badge={weekly(etf.flows.readAt)} /> : null}
          {on("flow_positioning") ? row?.positioning ? <PositioningCard positioning={row.positioning} badge={badge("daily", checkedAt(row, "positioning", row.positioning.readAt))} /> : <Unread title="How the big traders are positioned" sentence={unreadWords(row, "positioning")} /> : null}
          {on("flow_foreign") ? row?.foreign ? <ForeignCard foreign={row.foreign} badge={badge("daily", checkedAt(row, "foreign", row.foreign.readAt))} /> : <Unread title="What foreigners bought and sold" sentence={unreadWords(row, "foreign")} /> : null}
          {on("flow_cash") ? row?.cash ? <CashCard cash={row.cash} badge={badge("daily", checkedAt(row, "cash", row.cash.readAt))} /> : <Unread title="Cash on the sidelines" sentence={unreadWords(row, "cash")} /> : null}
          {on("flow_insiders") ? row?.insiders ? <InsidersCard insiders={row.insiders} badge={badge("weekly", checkedAt(row, "insiders", row.insiders.readAt))} /> : <Unread title="Insiders across the S&P 500 and Nasdaq-100" sentence={unreadWords(row, "insiders")} /> : null}
        </div>
      </PageBody>
    </>
  );
}
