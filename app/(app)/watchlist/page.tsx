import { Eye } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { ScreenFreshness } from "@/components/app/screen-freshness";

import { ActionForm } from "@/components/app/action-form";
import { ValuationRange } from "@/components/app/figures";
import { NoFigures } from "@/components/app/no-figures";
import { WatchEditor, type WatchInitial } from "@/components/watchlist/watch-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { companyHref } from "@/lib/company";
import { historiesFor } from "@/lib/company-run";
import { multiplesAt } from "@/lib/forward";
import { spotsFor, type HoldingRecord } from "@/lib/holdings";
import { loadCloses } from "@/lib/markets-feed";
import { peerComparison } from "@/lib/peers";
import { checkCompany, familyOf, subjectBook } from "@/lib/research";
import { deriveScreens } from "@/lib/screen-data";
import { thesisFor } from "@/lib/theses";
import { addDaysTo, localDay, longDate } from "@/lib/time";
import { stageOf } from "@/lib/valuation";
import { HISTORY_DAYS, HISTORY_METRICS, type HistoryMetric } from "@/lib/valuation-history";
import { watchReference, type WatchReference } from "@/lib/watch-reference";
import { screen, screenerFor, thesesFor } from "@/lib/workspace";

import { unwatchAction, watchSymbolAction } from "./actions";

export const metadata = { title: "Watchlist · Invariant" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });

type Watched = { symbol: string; record: HoldingRecord; price: number | null; thesis: string | null; reference: WatchReference | null; closes: { dates: string[]; values: number[] } | null; standing: string | null };

/** One watched symbol: its thesis, its levels and its valuation against the price, and the editor that shapes them against a reference (Hamza, 23 Oct 2026). */
function WatchedRow({ w, demo }: { w: Watched; demo: boolean }) {
  const { symbol, record, price, thesis } = w;
  const v = record.ownValuation;
  const s = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  const initial: WatchInitial = { thesis: thesis ?? record.note ?? "", low: s(v?.low), base: s(v?.base), high: s(v?.high), below: s(record.levels?.below), above: s(record.levels?.above), basis: v?.basis ?? "", asOf: v?.asOf ?? localDay(), since: record.since ?? "" };
  return (
    <div className="px-4 py-4">
      {/* The whole symbol, never cut; Remove keeps to the right and wraps under it when there is no room (Hamza, 19 Oct 2026). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={companyHref(symbol) as Route} className="data shrink-0 text-title-3 font-semibold text-accent-text hover:underline">
          {symbol}
        </Link>
        {price !== null ? <span className="data text-subhead text-text-secondary">{fmt(price)}</span> : null}
        <ActionForm action={unwatchAction} label="Remove" variant="ghost" size="sm" className="ml-auto">
          <input type="hidden" name="symbol" value={symbol} />
        </ActionForm>
      </div>
      {thesis ? (
        <p className="mt-1 line-clamp-3 text-subhead">
          {thesis}{" "}
          <Link href={`/theses/${encodeURIComponent(symbol)}` as Route} className="text-footnote text-accent-text hover:underline">
            Open the thesis
          </Link>
        </p>
      ) : record.note ? (
        <p className="mt-1 text-subhead">{record.note}</p>
      ) : null}
      {record.levels ? (
        <p className="data mt-1 text-caption text-text-secondary">
          Alert {[record.levels.below !== null ? `at or below ${fmt(record.levels.below)}` : null, record.levels.above !== null ? `at or above ${fmt(record.levels.above)}` : null].filter(Boolean).join(", or ")}
        </p>
      ) : null}
      <p className="data mt-1 text-caption text-text-tertiary">
        {[record.since ? `Since ${longDate(record.since)}` : null, v ? `Valued ${longDate(v.asOf)}${v.basis ? ` (${v.basis})` : ""}` : null].filter(Boolean).join(" · ") || "No date recorded."}
      </p>
      {v && price !== null ? (
        <div className="mt-3">
          <ValuationRange low={v.low} base={v.base} high={v.high} price={price} />
          <p className="data mt-1 text-caption text-text-secondary">Price is {((price / v.base) * 100).toFixed(0)}% of base.</p>
        </div>
      ) : v ? (
        <p className="mt-2 text-footnote text-text-secondary">No price for {symbol} yet; the valuation is shown against the price once a feed supplies one.</p>
      ) : null}
      <details className="mt-3" open={!v && !record.levels}>
        <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">{v ? "Thesis and valuation" : "Set the valuation"}</summary>
        <WatchEditor symbol={symbol} action={watchSymbolAction} initial={initial} reference={w.reference} closes={w.closes} standing={w.standing} demo={demo} />
      </details>
    </div>
  );
}

/**
 * Symbols the person follows without holding: every record whose symbol
 * matches no holding. A record carries a note, a date and, when the person
 * has one, a valuation that the Trade check and the methodology read. The
 * app never asks a broker to watch anything.
 */
export default async function WatchlistPage() {
  const ws = await screen("overview");
  if (!ws.book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Watchlist" />
        <PageBody>
          <NoFigures what="Watched symbols" />
        </PageBody>
      </>
    );
  const today = localDay();
  const data = deriveScreens({ book: ws.book, methodology: ws.setup.methodology, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("watchlist");
  const held = new Set(ws.book.holdings.map((h) => h.symbol.toUpperCase()));
  const watched = Object.entries(ws.records.bySymbol)
    .filter(([symbol]) => !held.has(symbol.toUpperCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const book = ws.book;
  const spots = spotsFor(book);
  // Five years of closes for each watched symbol from the market feed (the ticker and a date range alone in the URL), within the page's budget: the last for the price, the year for the chart, the five for the valuation's range.
  const closes = watched.length ? await loadCloses(watched.map(([s]) => s.toUpperCase()).sort().join(","), today, "budget", HISTORY_DAYS).catch(() => null) : null;
  const priceOf = (symbol: string): number | null => {
    const s = symbol.toUpperCase();
    const fed = closes?.series[s];
    if (fed?.length) return fed[fed.length - 1].value;
    const spot = Object.entries(spots).find(([k]) => k.toUpperCase() === s)?.[1];
    if (spot !== undefined) return spot;
    return book.holdings.find((h) => h.symbol.toUpperCase() === s && h.price !== null)?.price ?? null;
  };

  const demo = ws.mode === "demo";
  const [{ file: theses }, screener] = await Promise.all([thesesFor(ws), watched.length ? screenerFor(ws) : Promise.resolve(null)]);
  const m = ws.setup.methodology;
  const yearAgo = addDaysTo(today, -365);
  const rows: Watched[] = await Promise.all(
    watched.map(async ([symbol, record]) => {
      const sym = symbol.toUpperCase();
      const price = priceOf(symbol);
      const thesis = thesisFor(theses, sym);
      const filing = ws.filings?.bySymbol[sym] ?? null;
      const values = filing && !filing.error ? filing.values : {};
      const histories = await historiesFor(sym, filing, "USD", demo, today, closes ?? undefined).catch(() => null);
      const year = (closes?.series[sym] ?? []).filter((p) => p.date >= yearAgo);
      const peerValues: Record<string, number | null | undefined> = { ...values };
      if ((filing?.perShareCurrency ?? "USD") === "USD") for (const [k, x] of Object.entries(multiplesAt(price, filing?.perShareTtm ?? []))) if (peerValues[k] === null || peerValues[k] === undefined) peerValues[k] = x;
      const listed = screener?.file.bySymbol[sym];
      const peers = screener ? peerComparison({ symbol: sym, sector: filing?.sector ?? listed?.sector ?? null, subIndustry: filing?.subIndustry ?? listed?.subIndustry ?? null, sic: filing?.sic ?? listed?.sic ?? null, values: peerValues }, Object.values(screener.file.bySymbol)) : null;
      const kept = thesis?.valuation?.method;
      const method = kept && (HISTORY_METRICS as readonly string[]).includes(kept) ? (kept as HistoryMetric) : null;
      const reference = histories ? watchReference({ histories: histories.byMetric, method, stage: thesis?.valuation?.stage ?? stageOf(values).stage, price, peers, consensusPe: histories.consensus?.pe ?? null }) : null;
      let standing: string | null = null;
      if (m && Object.keys(values).length) {
        const verdict = checkCompany(m, familyOf(m).family, subjectBook(sym, filing?.name ?? sym, values, price, "USD", today), today);
        const closest = [...verdict.classTests].sort((a, b) => b.passes - b.needed - (a.passes - a.needed))[0];
        standing = verdict.classLabel
          ? `${m.name} places it in ${verdict.classLabel} on its filings.`
          : closest
            ? `${m.name} places it in no class on its filings; closest is ${closest.label}, ${closest.passes} of ${closest.needed} needed${closest.unread ? `, ${closest.unread} unread` : ""}.`
            : null;
      }
      return { symbol, record, price, thesis: thesis?.text || null, reference, closes: year.length > 1 ? { dates: year.map((p) => p.date), values: year.map((p) => p.value) } : null, standing };
    }),
  );

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Watchlist" subtitle={`${watched.length} watched · kept with your records${ws.mode === "demo" ? " in this browser" : " in your vault"}`} />
      <PageBody>
        <div>
          {slots.includes("watch_form") ? (
            <ListSection header="Watch a symbol" footer="A watched symbol is a record without a holding: its thesis and valuation follow it if you buy. An alert level is a price: it fires on Notifications and by email at the twice-daily check, and so does a price at or below the low. Nothing is sent to a broker.">
              <ActionForm action={watchSymbolAction} label="Watch" pendingLabel="Saving" variant="primary" size="md" className="px-4 pb-4">
                <label className="block pt-3 text-subhead">
                  Symbol
                  <input name="symbol" className={`${field} data uppercase`} maxLength={40} required autoComplete="off" placeholder="NVDA" />
                </label>
                <label className="mt-3 block text-subhead">
                  Thesis
                  <textarea name="thesis" rows={3} className={field} maxLength={6000} placeholder="Why it is watched, what it must become, and what would make it a buy" />
                </label>
                <label className="mt-3 block text-subhead">
                  Watched since
                  <input name="since" type="date" className={field} defaultValue={today} />
                </label>
                <p className="mt-2 mb-3 text-footnote text-text-tertiary">{demo ? "In the demo the thesis is kept as the record's note." : "The thesis is kept on the Theses screen."} Once added, its card shows a year of closes and a reference from its own five-year range, its peers and its sector, to set the low, base, high and the alerts against. A symbol you hold has its thesis on the Theses screen.</p>
              </ActionForm>
            </ListSection>
          ) : null}
          {slots.includes("watched") ? (
            <ListSection grid="wide" header={`Watched (${watched.length})`}>
              {watched.length ? (
                rows.map((w) => <WatchedRow key={w.symbol} w={w} demo={demo} />)
              ) : (
                <EmptyState icon={Eye} title="Nothing watched" instruction="Add a symbol with its thesis; its card then shows the price, a reference valuation and the fields for your low, base, high and alerts." action={null} />
              )}
            </ListSection>
          ) : null}
        </div>
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
