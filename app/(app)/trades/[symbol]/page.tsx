import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { ScreenFreshness } from "@/components/app/screen-freshness";
import { StatTile } from "@/components/app/figures";
import { SampleNote } from "@/components/app/sample-note";
import { LineChart, type LineMarker } from "@/components/charts/line-chart";
import { buttonStyles } from "@/components/ui/button";
import { FreshBadge } from "@/components/ui/freshness";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { companyHref } from "@/lib/company";
import { saleLogged } from "@/lib/decisions";
import { shares } from "@/lib/format";
import { freshness } from "@/lib/freshness";
import { money } from "@/lib/holdings";
import { loadCloses } from "@/lib/markets-feed";
import { addDays, addMonths } from "@/lib/performance";
import { fillsOf, matchLots, TRADE_SPAN_KEYS, TRADE_SPANS, type Fill, type TradeSpan } from "@/lib/trades";
import { localDay, longDate, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { screen } from "@/lib/workspace";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} trades · Invariant` };
}

const SPAN_MONTHS: Record<TradeSpan, number> = { "6M": 6, "1Y": 12, "5Y": 60 };
const SPAN_WORDS: Record<TradeSpan, string> = { "6M": "six months", "1Y": "a year", "5Y": "five years" };

function Spans({ symbol, current }: { symbol: string; current: TradeSpan }) {
  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1" role="group" aria-label="Span of the price chart">
      {TRADE_SPAN_KEYS.map((s) => (
        <Link
          key={s}
          href={`/trades/${encodeURIComponent(symbol)}?span=${s}` as Route}
          aria-current={s === current ? "page" : undefined}
          className={cn("inline-flex h-9 items-center rounded-[8px] px-3 text-subhead", s === current ? "bg-surface text-text" : "text-text-secondary")}
        >
          {s}
        </Link>
      ))}
    </div>
  );
}

const signedMoney = (v: number, ccy: string) => `${v > 0 ? "+" : ""}${money(v, ccy)}`;
const unit = (v: number | null, ccy: string) => (v === null ? "n/a" : v >= 1000 ? money(v, ccy) : money(v, ccy, 2));

/** The fills of one day and one side, as one marker: units, the average price, the money, the broker's realised P&L on a sale. */
function markersOf(fills: readonly Fill[], dates: readonly string[], ccy: string): { markers: LineMarker[]; before: number; after: number } {
  const groups = new Map<string, Fill[]>();
  for (const f of fills) {
    const k = `${f.date}:${f.side}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const markers: LineMarker[] = [];
  let before = 0;
  let after = 0;
  for (const [, g] of groups) {
    const date = g[0].date;
    const side = g[0].side;
    if (!dates.length || date < dates[0]) {
      before += g.length;
      continue;
    }
    // The first session on or after the fill's date, so a fill on a day the feed skipped still lands on the chart.
    let i = dates.findIndex((d) => d >= date);
    if (i < 0) {
      if (date > dates[dates.length - 1]) {
        after += g.length;
        continue;
      }
      i = dates.length - 1;
    }
    const units = g.reduce((a, f) => a + f.quantity, 0);
    const amount = g.reduce((a, f) => a + f.amount, 0);
    const priced = g.filter((f) => f.price !== null);
    const avg = priced.length ? priced.reduce((a, f) => a + (f.price as number) * f.quantity, 0) / priced.reduce((a, f) => a + f.quantity, 0) : null;
    const realised = side === "sell" && g.some((f) => f.realized !== undefined) ? g.reduce((a, f) => a + (f.realized ?? 0), 0) : null;
    markers.push({
      i,
      side,
      label: `${side === "buy" ? "Bought" : "Sold"} ${shares(units)}`,
      rows: [
        { label: "Units", value: shares(units) },
        { label: "Price", value: unit(avg, g[0].currency) },
        { label: side === "buy" ? "Paid" : "Received", value: money(amount, ccy) },
        ...(realised !== null ? [{ label: "Realised", value: signedMoney(realised, ccy) }] : []),
        ...(g.length > 1 ? [{ label: "Fills", value: String(g.length) }] : []),
      ],
    });
  }
  return { markers, before, after };
}

/**
 * One company's trades on its own price: the closes over the span picked,
 * each buy and sale marked where it happened, the readout showing what was
 * bought or sold there (Hamza, 15 Oct 2026). Under it, the fills and the
 * lots they closed. The closes come from the price feed on request; a
 * company the feed cannot read keeps its fills and says so.
 */
export default async function TradeSymbolPage({ params, searchParams }: { params: Promise<{ symbol: string }>; searchParams: Promise<{ span?: string }> }) {
  const [{ symbol: raw }, sp] = await Promise.all([params, searchParams]);
  const symbol = decodeURIComponent(raw).toUpperCase();
  const span: TradeSpan = TRADE_SPAN_KEYS.includes(sp.span as TradeSpan) ? (sp.span as TradeSpan) : "1Y";
  const ws = await screen("trades");
  const book = ws.book;
  if (!book) notFound();
  const fills = fillsOf(book)
    .filter((f) => f.symbol.toUpperCase() === symbol)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!fills.length) notFound();

  const today = localDay();
  const ccy = ws.setup.baseCurrency;
  const closes = await loadCloses(symbol, today, "budget", TRADE_SPANS[span]);
  const from = addDays(addMonths(today, -SPAN_MONTHS[span]), -1);
  const points = (closes.series[symbol] ?? []).filter((p) => p.date >= from);
  const dates = points.map((p) => p.date);
  const { markers, before, after } = markersOf(fills, dates, ccy);
  const priceCcy = fills[0].currency;

  const buys = fills.filter((f) => f.side === "buy");
  const sells = fills.filter((f) => f.side === "sell");
  const bought = buys.reduce((a, f) => a + f.amount, 0);
  const sold = sells.reduce((a, f) => a + f.amount, 0);
  const unitsBought = buys.reduce((a, f) => a + f.quantity, 0);
  const unitsSold = sells.reduce((a, f) => a + f.quantity, 0);
  const lots = matchLots(book).closed.filter((l) => l.symbol.toUpperCase() === symbol);
  const realised = lots.reduce((a, l) => a + l.pnl, 0);
  const held = book.holdings.filter((h) => h.symbol.toUpperCase() === symbol);
  const heldUnits = held.reduce((a, h) => a + h.quantity, 0);
  const heldValue = held.reduce((a, h) => a + h.value, 0);
  const name = held[0]?.name && held[0].name !== symbol ? held[0].name : null;
  const hasLog = ws.decisions.entries.length > 0;
  const lastClose = points.length ? points[points.length - 1] : null;
  const chartBadge = ws.mode === "demo" ? (ws.fresh ? <FreshBadge compact fresh={ws.fresh} /> : null) : lastClose ? <FreshBadge compact fresh={freshness("close", lastClose.date, today)} /> : null;
  const skipped = [before ? `${before} fill${before === 1 ? " falls" : "s fall"} before the chart` : "", after ? `${after} fill${after === 1 ? " falls" : "s fall"} after its last close` : ""].filter(Boolean).join("; ");

  return (
    <>
      <PageHeader
        fresh={<ScreenFreshness />}
        title={symbol}
        subtitle={name ?? `${fills.length} fill${fills.length === 1 ? "" : "s"} from ${longDate(fills[0].date)} to ${longDate(fills[fills.length - 1].date)}`}
        action={
          <Link href={companyHref(symbol) as Route} className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
            Company
          </Link>
        }
      />
      <PageBody>
        <SampleNote sample={ws.sample} showcase={ws.showcase} asOf={book.asOf} />

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Bought" value={money(bought, ccy)} detail={`${shares(unitsBought)} units over ${buys.length} fill${buys.length === 1 ? "" : "s"}`} />
          <StatTile label="Sold" value={money(sold, ccy)} detail={sells.length ? `${shares(unitsSold)} units over ${sells.length} fill${sells.length === 1 ? "" : "s"}` : "no sale yet"} />
          <StatTile label="Realised" value={lots.length ? signedMoney(realised, ccy) : "none"} detail={lots.length ? `${lots.length} lot${lots.length === 1 ? "" : "s"} closed, first in, first out` : "no lot closed yet"} tone={lots.length ? (realised >= 0 ? "ok" : "danger") : "neutral"} />
          <StatTile label="Held now" value={heldUnits > 0 ? shares(heldUnits) : "none"} detail={heldUnits > 0 ? `${money(heldValue, ccy)} at the statement's price` : "nothing held at the statement's date"} />
        </div>

        <Spans symbol={symbol} current={span} />
        <div className="mb-8" data-tour="trade-chart">
          {points.length > 1 ? (
            <>
              <LineChart
                title={`${symbol}, with each buy and sale`}
                subtitle={`Daily closes over ${SPAN_WORDS[span]} in ${priceCcy}. A triangle under the line is a buy, one over it a sale; hover or tap a day to see what was bought or sold.${skipped ? ` ${skipped}; a longer span may show them.` : ""}`}
                badge={chartBadge}
                dates={dates}
                series={[{ key: "close", label: symbol, color: "var(--series-hcmp)", values: points.map((p) => p.value) }]}
                format={`ccy:${priceCcy}`}
                height={260}
                markers={markers}
                tableCaption={`${symbol}'s daily close over ${SPAN_WORDS[span]}, with the fills on their day`}
                tableEvery={span === "5Y" ? 20 : span === "1Y" ? 5 : 2}
              />
              {closes.problems.length ? <p className="mt-2 px-1 text-footnote text-text-secondary">{closes.problems.join(" ")}</p> : null}
            </>
          ) : (
            <ListSection header="Price chart">
              <ListRow wrap label={closes.problems.length ? closes.problems.join(" ") : `No closes for ${symbol} over ${SPAN_WORDS[span]} yet.`} detail="The fills below stand on their own; the chart draws once the price feed answers." />
            </ListSection>
          )}
        </div>

        <div className="flow-cols">
          <ListSection grid header={`Fills · ${fills.length}`} footer={hasLog ? "Each sale shows whether a Decision Log entry names the holding within a week either side." : undefined} className="mb-8">
            {fills
              .slice()
              .reverse()
              .map((f, i) => (
                <ListRow
                  key={`${f.date}-${f.side}-${i}`}
                  label={
                    <span>
                      {f.side === "buy" ? "Bought" : "Sold"} <span className="data">{shares(f.quantity)}</span>
                    </span>
                  }
                  detail={`${longDate(f.date)}${f.price !== null ? ` at ${unit(f.price, f.currency)}` : ""} · ${f.account}`}
                  value={money(f.amount, ccy)}
                  trailing={hasLog && f.side === "sell" ? <StatusPill tone={saleLogged(ws.decisions, f.symbol, f.date) ? "ok" : "danger"}>{saleLogged(ws.decisions, f.symbol, f.date) ? "Logged" : "No entry"}</StatusPill> : undefined}
                />
              ))}
          </ListSection>
          <ListSection grid header={`Lots closed · ${lots.length}`} footer="Each sale matched to the units bought first; the gain is proceeds less the cost of those units." className="mb-8">
            {lots.length ? (
              lots
                .slice()
                .reverse()
                .map((l, i) => (
                  <ListRow
                    key={`${l.opened}-${l.closed}-${i}`}
                    wrap
                    label={<span><span className="data">{shares(l.quantity)}</span> {l.opened ? `bought ${shortDate(l.opened)}, ` : "with no buy in the ledger, "}sold {shortDate(l.closed)}</span>}
                    detail={l.opened ? `${money(l.cost, ccy)} in, ${money(l.proceeds, ccy)} out · ${l.daysHeld ?? 0} day${l.daysHeld === 1 ? "" : "s"} held` : `${money(l.proceeds, ccy)} out · the cost is unknown, so no gain is counted`}
                    value={<span className={l.pnl > 0 ? "text-ok" : l.pnl < 0 ? "text-danger" : ""}>{signedMoney(l.pnl, ccy)}</span>}
                  />
                ))
            ) : (
              <ListRow label="No lot closed yet." detail={sells.length ? "The sales could not be matched to earlier buys in the ledger." : "Every unit bought is still held."} />
            )}
          </ListSection>
        </div>

        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
