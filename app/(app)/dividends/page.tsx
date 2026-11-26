import { notFound } from "next/navigation";

import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { ByCompanyCard, DividendTiles, GrowthCard, IncomeMix, NoLedger, ReceivedCard, SafetyCard, UpcomingCard, YearsCard } from "@/components/dividends/cards";
import { YieldPayout } from "@/components/dividends/yield-payout";
import { FreshBadge } from "@/components/ui/freshness";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { dividendsOf } from "@/lib/dividends";
import { slotsOn } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Dividends · Invariant" };

/**
 * Dividends (Hamza, 19 Oct 2026, after Snowball's Dividends tab): what the
 * book is set to pay and how safely, from the filings, and what it did pay,
 * from the broker's ledger. Its slots are the ontology's (lib/ontology.ts
 * SCREENS.dividends); a dividend methodology puts the screen after Holdings.
 */
export default async function DividendsPage() {
  const ws = await screen("overview");
  if (!ws.screens.includes("dividends")) notFound();
  const book = ws.book;
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Dividends" />
        <PageBody>
          <NoFigures what="Dividends" />
        </PageBody>
      </>
    );
  const today = localDay();
  const ccy = ws.setup.baseCurrency;
  const slots = slotsOn("dividends", ws.shown);
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  const d = dividendsOf(book, today);
  const badge = ws.fresh ? <FreshBadge compact fresh={ws.fresh} /> : null;
  const payers = d.holdings.length > 0;

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Dividends" subtitle={`As of ${longDate(book.asOf)} · What the book is set to pay comes from each company's filings; what it paid, from the broker's ledger. Not investment advice.`} />
      <PageBody>
        {ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={book.asOf} /> : null}
        {!payers ? <p className="mb-6 px-1 text-footnote text-text-secondary">No listed holding pays a dividend the filings or the ledger show yet. The filings are read each morning; the ledger needs Cash Transactions in the IBKR Flex query.</p> : null}
        {payers && (on("dividend_summary") || on("dividend_yields")) ? (
          <div className="mb-8 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {on("dividend_summary") ? (
              <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <DividendTiles d={d} ccy={ccy} />
              </div>
            ) : null}
            {on("dividend_yields") ? (
              <div className="min-w-0 lg:col-span-2">
                <YieldPayout rows={d.holdings.map((h) => ({ symbol: h.symbol, yieldPct: h.yieldPct, yieldOnCostPct: h.yieldOnCostPct, payoutPct: h.payoutPct }))} badge={badge} />
              </div>
            ) : null}
          </div>
        ) : null}
        {payers && on("dividend_mix") ? (
          <div className="mb-8">
            <IncomeMix d={d} ccy={ccy} badge={badge} />
          </div>
        ) : null}
        {payers && on("dividend_safety") ? (
          <div className="mb-8">
            <SafetyCard d={d} ccy={ccy} badge={badge} />
          </div>
        ) : null}
        {payers && (on("dividend_growth") || on("dividend_upcoming")) ? (
          <div className="pair-grid mb-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {on("dividend_growth") ? <GrowthCard d={d} badge={badge} /> : null}
            {on("dividend_upcoming") ? <UpcomingCard d={d} ccy={ccy} badge={badge} /> : null}
          </div>
        ) : null}
        {on("dividends_received") || on("dividends_by_holding") ? (
          d.ledger ? (
            <div className="pair-grid mb-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {on("dividends_received") ? <ReceivedCard d={d} ccy={ccy} badge={badge} /> : null}
              {on("dividends_by_holding") ? <ByCompanyCard d={d} ccy={ccy} badge={badge} /> : null}
            </div>
          ) : (
            <div className="mb-8">
              <NoLedger />
            </div>
          )
        ) : null}
        {d.ledger && on("dividend_years") ? (
          <div className="mb-8">
            <YearsCard d={d} ccy={ccy} badge={badge} />
          </div>
        ) : null}
        {d.left.length ? <p className="mb-4 px-1 text-footnote text-text-secondary">Left out: {d.left.map((l) => `${l.symbol} (${l.why})`).join(", ")}.</p> : null}
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
