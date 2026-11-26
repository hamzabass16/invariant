import { ChevronRight } from "lucide-react";
import type * as React from "react";
import type { Route } from "next";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import Link from "next/link";

import { StatTile } from "@/components/app/figures";
import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { ProfitWaterfall } from "@/components/trades/profit-waterfall";
import { RealisedMap } from "@/components/trades/realised-map";
import { Columns } from "@/components/charts/columns";
import { GroupedBars } from "@/components/charts/grouped-bars";
import { ListLinkRow } from "@/components/ui/list";
import { loadCloses } from "@/lib/markets-feed";
import { ROTATION_DAYS, TRADE_SPANS } from "@/lib/trades";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { saleLogged } from "@/lib/decisions";
import { JUDGE_AFTER_DAYS, PLAN_WINDOW_DAYS, plannedTrades, POSTMORTEM_DAYS, POSTMORTEM_KEEP_DAYS, postMortems, REASONED_DAYS, reasonedTrades } from "@/lib/judgement";
import { pct, shares } from "@/lib/format";
import { money, unconvertibleNote } from "@/lib/holdings";
import { addDays, windowOf, WINDOW_KEYS, type WindowKey } from "@/lib/performance";
import { deriveScreens } from "@/lib/screen-data";
import { fillsNewestFirst, inWindow, matchLots, profitSources, tradeCosts, monthlyActivity, realisedBySymbol, rotationOutcomes, rotationsOf, rotationSummary, tradedSymbols, tradeStats, winLoss } from "@/lib/trades";
import { localDay, daysBetween, longDate, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Trades · Invariant" };

const WINDOW_LABEL: Record<WindowKey, string> = { "3M": "3M", YTD: "YTD", "1Y": "1Y", "Since start": "Whole ledger" };

function Segmented({ current }: { current: WindowKey }) {
  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1" role="group" aria-label="Window for the trade statistics">
      {WINDOW_KEYS.map((w) => (
        <Link
          key={w}
          href={`/trades?window=${encodeURIComponent(w)}` as Route}
          aria-current={w === current ? "page" : undefined}
          className={cn("inline-flex h-9 items-center rounded-[8px] px-3 text-subhead", w === current ? "bg-surface text-text" : "text-text-secondary")}
        >
          {WINDOW_LABEL[w]}
        </Link>
      ))}
    </div>
  );
}

const signedMoney = (v: number, ccy: string) => `${v > 0 ? "+" : ""}${money(v, ccy)}`;
const Signed = ({ v, ccy }: { v: number; ccy: string }) => <span className={v > 0 ? "text-ok" : v < 0 ? "text-danger" : ""}>{signedMoney(v, ccy)}</span>;
const num = (v: number | null, ccy: string) => (v === null ? "n/a" : money(v, ccy));
const days = (v: number | null) => (v === null ? "n/a" : String(Math.round(v)));
const unit = (v: number | null, ccy: string) => (v === null ? "n/a" : v >= 1000 ? money(v, ccy) : money(v, ccy, 2));
/** A cost in base: cents below a thousand, since a commission is often a dollar. */
const cost = (v: number, ccy: string) => (Math.abs(v) >= 1000 ? money(v, ccy) : money(v, ccy, 2));
/** The fill's commission and tax, when the statement carried them. */
const fillCosts = (f: { commission?: number; tax?: number }, ccy: string) =>
  [f.commission ? `commission ${cost(f.commission, ccy)}` : null, f.tax ? `tax ${cost(f.tax, ccy)}` : null].filter(Boolean).join(", ");

/** Show all and its way back: an accent row of its own, so it never reads as one more fill (Hamza, 15 Oct 2026). */
function MoreLink({ href, children }: { href: Route; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className="flex min-h-[3rem] items-center justify-center gap-1.5 border-t border-hairline bg-accent-subtle px-4 text-subhead font-medium text-accent-text transition-colors hover:brightness-110">
      {children}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Fills shown before Show all, and the most Show all draws. */
const FILLS_SHOWN = 7;
const FILLS_ALL_MAX = 500;

/** The query keys that open a list in full, each with the id of its section. */
const MORE = { fills: "fills", rotations: "rotations", companies: "companies", realised: "realised" } as const;
type MoreKey = keyof typeof MORE;

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ window?: string } & Partial<Record<MoreKey, string>>> }) {
  const sp = await searchParams;
  const windowKey: WindowKey = WINDOW_KEYS.includes(sp.window as WindowKey) ? (sp.window as WindowKey) : "1Y";
  const ws = await screen("trades");
  const book = ws.book;
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Trades" />
        <PageBody>
          <NoFigures what="Fills" />
        </PageBody>
      </>
    );

  const today = localDay();
  const ccy = ws.setup.baseCurrency;
  const data = deriveScreens({ book, methodology: ws.setup.methodology, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("trades");
  const on = (id: (typeof slots)[number]) => slots.includes(id);

  const all = fillsNewestFirst(book);
  const first = all.length ? all[all.length - 1].date : null;
  const last = all.length ? all[0].date : null;
  const asOf = book.asOf;
  const ledgerStart = first ?? asOf;
  const w = windowOf(windowKey, asOf, ledgerStart);
  const from = windowKey === "Since start" ? ledgerStart : addDays(w.from, 1);
  const to = asOf;

  const lots = matchLots(book);
  const closed = inWindow(lots.closed, from, to, (l) => l.closed);
  const stats = tradeStats(closed);
  const realised = realisedBySymbol(closed);
  const fills = inWindow(all, from, to);
  const activity = monthlyActivity(book).slice(-12);
  const hasLog = ws.decisions.entries.length > 0;
  const leftOut = unconvertibleNote(book, "trades");
  const sells = fills.filter((f) => f.side === "sell");
  // Wins against losses, the rotations and the companies traded, over the window (Hamza, 15 Oct 2026).
  const wl = on("wins_losses") ? winLoss(closed) : null;
  const costs = on("trade_costs") ? tradeCosts(book, from, to) : null;
  const profit = costs ? profitSources(book, from, to, stats.total) : null;
  const traded = on("by_company") ? tradedSymbols(fills) : [];
  const rotationsRaw = on("rotations") ? rotationsOf(all.filter((f) => f.date >= from && f.date <= to)) : [];
  const rotationSymbols = [...new Set(rotationsRaw.flatMap((r) => [r.sold, r.bought]))];
  const rotationDays = rotationsRaw.length ? Math.min(TRADE_SPANS["5Y"], Math.max(400, daysBetween(rotationsRaw[0].date, today) + 40)) : 0;
  const rotationCloses = rotationSymbols.length ? await loadCloses(rotationSymbols.join(","), today, "budget", rotationDays) : null;
  const rotations = rotationCloses ? rotationOutcomes(rotationsRaw, rotationCloses.series, rotationCloses.asOf > "1970-01-02" ? rotationCloses.asOf : asOf) : [];
  const rotation = rotationSummary(rotations);
  const pts = (v: number | null) => (v === null ? "n/a" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)} pts`);
  const spct = (v: number | null) => (v === null ? "n/a" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`);
  const unlogged = sells.filter((f) => !saleLogged(ws.decisions, f.symbol, f.date));
  // The reasoned-trade score (Hamza, 9 Nov 2026): the past year's trades with a reason, and how the reasons fared against SPY since.
  const reasonedRead = on("trades_reasoned") ? reasonedTrades(book, ws.decisions, {}, today) : null;
  // Cooling-off trades and sale post-mortems (Hamza, 9 Nov 2026, the twenty further ways): planned against impulsive trades, and each sale looked back on a year later.
  const plannedRead = on("trades_planned") ? plannedTrades(book, ws.decisions, {}, today) : null;
  const postRead = on("trades_postmortems") ? postMortems(book, ws.decisions, {}, today) : null;
  const judgedSymbols = [...new Set([...(reasonedRead?.rows.filter((r) => r.reason).map((r) => r.symbol) ?? []), ...(plannedRead?.rows.map((r) => r.symbol) ?? []), ...(postRead?.rows.map((r) => r.symbol) ?? [])])].slice(0, 60);
  const judgedDays = postRead?.rows.length ? POSTMORTEM_DAYS + POSTMORTEM_KEEP_DAYS + 30 : REASONED_DAYS + 30;
  const judgedCloses = judgedSymbols.length ? await loadCloses([...judgedSymbols, "SPY"].join(","), today, "budget", judgedDays) : null;
  const reasoned = reasonedRead && judgedCloses ? reasonedTrades(book, ws.decisions, judgedCloses.series, today) : reasonedRead;
  const planned = plannedRead && judgedCloses ? plannedTrades(book, ws.decisions, judgedCloses.series, today) : plannedRead;
  const post = postRead && judgedCloses ? postMortems(book, ws.decisions, judgedCloses.series, today) : postRead;
  const label = (ym: string) => `${ym.slice(2, 4)}/${ym.slice(5, 7)}`;
  // The latest few of each list, the rest one tap away, so the page never runs long (Hamza, 15 and 16 Oct 2026: fills, then the rotations, the companies and the realised P&L too).
  const showAll = sp.fills === "all";
  const shown = showAll ? fills.slice(0, FILLS_ALL_MAX) : fills.slice(0, FILLS_SHOWN);
  const fillsHref = (all: boolean) => moreHref("fills", all);
  const allOf = (key: MoreKey) => sp[key] === "all";
  function moreHref(key: MoreKey, all: boolean): Route {
    const q = new URLSearchParams();
    if (sp.window) q.set("window", sp.window);
    for (const k of Object.keys(MORE) as MoreKey[]) if (k === key ? all : sp[k] === "all") q.set(k, "all");
    const qs = q.toString();
    return `/trades${qs ? `?${qs}` : ""}#${MORE[key]}` as Route;
  }
  /** Show all and its way back under a list of `total` rows, of which `FILLS_SHOWN` show by default. */
  const more = (key: MoreKey, total: number, noun: string) =>
    total > FILLS_SHOWN ? (allOf(key) ? <MoreLink href={moreHref(key, false)}>Show the latest only</MoreLink> : <MoreLink href={moreHref(key, true)}>{`Show all ${total} ${noun}`}</MoreLink>) : null;
  const some = <T,>(key: MoreKey, list: readonly T[], max = FILLS_ALL_MAX): T[] => (allOf(key) ? list.slice(0, max) : list.slice(0, FILLS_SHOWN));

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Trades" subtitle={first && last ? `Ledger from ${longDate(first)} to ${longDate(last)} · ${all.length} fill${all.length === 1 ? "" : "s"} · lots matched first in, first out.` : "No fills in the statement yet."} />
      <PageBody>
        <SampleNote sample={ws.sample} showcase={ws.showcase} asOf={book.asOf} />
        {leftOut ? (
          <ListSection header="Left out" className="mb-6">
            <ListRow wrap label={leftOut} />
          </ListSection>
        ) : null}
        <Segmented current={windowKey} />
        {first && windowKey !== "Since start" && w.from < first ? <p className="-mt-4 mb-6 px-1 text-footnote text-text-tertiary">The ledger begins on {longDate(first)}, so this window holds every fill in it.</p> : null}

        {on("trade_stats") ? (
          // The average win and loss are When you win and When you lose's own,
          // so the row leaves them to that section when it is drawn (Hamza,
          // 20 Oct 2026: no repeated cards).
          <div className={`mb-8 grid grid-cols-2 gap-3 ${wl ? "lg:grid-cols-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1" : "lg:grid-cols-4"}`}>
            <StatTile label="Sales won" value={stats.sales ? `${stats.won} of ${stats.sales}` : "none"} detail={stats.wonPct === null ? "no sale closed in the window" : `${pct(stats.wonPct, 0)} won · one symbol on one day is one sale`} />
            <StatTile
              label="Profit factor"
              value={stats.profitFactor === null ? "n/a" : stats.profitFactor.toFixed(2)}
              detail={stats.sales ? `won ${money(stats.grossProfit, ccy)} · lost ${money(stats.grossLoss, ccy)}` : "gains over losses"}
              tone={stats.profitFactor === null ? "neutral" : stats.profitFactor >= 1 ? "ok" : "danger"}
            />
            {wl ? null : <StatTile label="Average win / loss" value={`${num(stats.avgWin, ccy)} / ${num(stats.avgLoss, ccy)}`} detail={stats.sales ? <Signed v={stats.total} ccy={ccy} /> : "per sale, in the window"} />}
            <StatTile label="Days held, winners / losers" value={`${days(stats.avgDaysWinners)} / ${days(stats.avgDaysLosers)}`} detail="from the lots behind each sale, weighted by units" />
          </div>
        ) : null}
        {on("trade_stats") && lots.warnings.length ? <p className="-mt-5 mb-8 px-1 text-footnote text-text-tertiary">{lots.warnings.join(" ")}</p> : null}

        {costs ? (
          <section id="costs" className="mb-8 scroll-mt-20">
            <h2 className="section-header mb-2 px-1">Where the profit came from</h2>
            {profit ? (
              <ProfitWaterfall
                profit={profit}
                ccy={ccy}
                title={`${signedMoney(Math.round(profit.total), ccy)} from ${longDate(profit.start.date)} to ${longDate(profit.end.date)}`}
                subtitle="Each source of profit in turn, base currency; each bar starts where the one above it ended."
                footer={`The total is the account's value at the end, ${money(profit.end.value, ccy)}, less its value at the start, ${money(profit.start.value, ccy)}, less ${money(profit.flows + profit.unlisted, ccy)} put in or taken out${profit.unlisted ? `, of which ${money(profit.unlisted, ccy)} by transfers the statement does not list` : ""}. Realised is the sales' P&L before their own commission and tax, which are counted under fees and taxes. Capital gain is the rest: the change in what is still held, options, currency on cash and anything no row names${profit.steps.some((s) => !s.read) ? ", and a source marked n/a, which the statement does not carry" : ""}.`}
              />
            ) : (
              <p className="mb-3 px-1 text-footnote text-text-secondary">The breakdown of the profit needs the account&apos;s value by day over the window, which the IBKR Flex statement carries in its NAV section.</p>
            )}
            <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Commission"
                value={costs.read ? cost(costs.commission, ccy) : "n/a"}
                detail={!costs.read ? "the statement's fills carry none" : costs.fills ? `on ${costs.costed} of ${costs.fills} fill${costs.fills === 1 ? "" : "s"}${costs.pctOfTraded !== null ? ` · with tax, ${pct(costs.pctOfTraded, 2)} of ${money(costs.traded, ccy)} traded` : ""}` : "no fills in the window"}
              />
              <StatTile label="Tax on trades" value={costs.read ? cost(costs.tradeTax, ccy) : "n/a"} detail={costs.read ? "transaction taxes and stamp duty charged on the fills" : "the statement's fills carry none"} />
              <StatTile label="Tax withheld on dividends" value={costs.cashRead && costs.withheldRead ? cost(costs.dividendTax, ccy) : "n/a"} detail={!costs.cashRead ? "needs the Cash Transactions section" : costs.withheldRead ? "taken at source before the dividend reached the account" : "read from the next statement fetched"} />
              <StatTile label="Other fees" value={costs.cashRead ? cost(costs.fees, ccy) : "n/a"} detail={costs.cashRead ? "custody, data and other fees in the cash ledger" : "needs the Cash Transactions section"} />
            </div>
            <p className="px-1 text-footnote text-text-tertiary">
              {costs.read || costs.cashRead ? `${cost(costs.total, ccy)} in all over the window, in base currency at each row's own rate.` : ""}
              {costs.read && costs.bySymbol.length ? ` Most in commission and tax: ${costs.bySymbol.slice(0, 3).map((b) => `${b.symbol} ${cost(b.cost, ccy)}`).join(", ")}.` : ""}
              {!costs.read ? (ws.mode === "demo" ? " The showcase's statement was kept before fills carried their commission and tax." : " In the IBKR Flex query's Trades section, tick Select All so each fill carries its Commission and Taxes; the next morning's fetch brings them, and an earlier year uploaded again on Setup brings its own.") : ""}
              {costs.read && costs.costed < costs.fills ? ` ${costs.fills - costs.costed} fill${costs.fills - costs.costed === 1 ? "" : "s"} in the window came from a statement without them; upload that year again on Setup to count them.` : ""}
            </p>
          </section>
        ) : null}

        {wl ? (
          <section className="mb-8" data-tour="wins-losses">
            <h2 className="section-header mb-2 px-1">When you win and when you lose</h2>
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="When you win" value={wl.avgWinPct === null ? "n/a" : spct(wl.avgWinPct)} detail={wl.avgWin === null ? "no winning sale in the window" : `${money(wl.avgWin, ccy)} on average, ${wl.won} sale${wl.won === 1 ? "" : "s"}`} tone={wl.won ? "ok" : "neutral"} />
              <StatTile label="When you lose" value={wl.avgLossPct === null ? "n/a" : spct(-wl.avgLossPct)} detail={wl.avgLoss === null ? "no losing sale in the window" : `${money(-wl.avgLoss, ccy)} on average, ${wl.lost} sale${wl.lost === 1 ? "" : "s"}`} tone={wl.lost ? "danger" : "neutral"} />
              <StatTile label="Win against loss" value={wl.winLossRatio === null ? "n/a" : `${wl.winLossRatio.toFixed(2)}x`} detail={wl.wonPct === null ? "average win over average loss" : `${on("trade_stats") ? "" : `${pct(wl.wonPct, 0)} of sales won · `}a loss costs ${wl.winLossRatio === null ? "n/a" : wl.winLossRatio >= 1 ? "less" : "more"} than a win makes`} tone={wl.winLossRatio === null ? "neutral" : wl.winLossRatio >= 1 ? "ok" : "warn"} />
              <StatTile label="Per sale, on average" value={wl.expectancy === null ? "n/a" : signedMoney(wl.expectancy, ccy)} detail={wl.best && wl.worst ? `best ${wl.best.symbol} ${signedMoney(wl.best.pnl, ccy)} · worst ${wl.worst.symbol} ${signedMoney(wl.worst.pnl, ccy)}` : wl.best ? `best ${wl.best.symbol} ${signedMoney(wl.best.pnl, ccy)}` : "win rate times the average win, less the loss rate times the average loss"} tone={wl.expectancy === null ? "neutral" : wl.expectancy >= 0 ? "ok" : "danger"} />
            </div>
            {wl.sales ? (
              <div className="pair-grid-md grid grid-cols-1 gap-3 md:grid-cols-2">
                <GroupedBars
                  title="What a win makes against what a loss costs"
                  subtitle="Per sale in the window, base currency. A loss is drawn as the money it cost."
                  groups={[
                    { key: "avg", label: "Average", values: [wl.avgWin, wl.avgLoss === null ? null : -wl.avgLoss] },
                    { key: "biggest", label: "Biggest", values: [wl.best?.pnl ?? null, wl.worst?.pnl ?? null] },
                    { key: "total", label: "All sales", values: [wl.won ? wl.bars.filter((b) => b.pnl > 0).reduce((a, b) => a + b.pnl, 0) : null, wl.lost ? wl.bars.filter((b) => b.pnl < 0).reduce((a, b) => a + b.pnl, 0) : null] },
                  ]}
                  series={[{ label: "When you win", color: "var(--series-hcmp)" }, { label: "When you lose", color: "var(--series-spy)" }]}
                  format={`ccy:${ccy}`}
                  tableCaption="A win against a loss: the average, the biggest and the total, in the window"
                />
                <Columns title="Each sale, as a percent of its cost" subtitle="In date order; a sale is one symbol on one day." labels={wl.bars.map((b) => `${b.symbol} ${shortDate(b.date)}`)} values={wl.bars.map((b) => b.pct)} color="var(--series-hcmp)" format="signedPct1" tableCaption="Each sale's gain or loss as a percent of the cost of its lots" />
              </div>
            ) : null}
          </section>
        ) : null}

        {on("rotations") ? (
          <section className="mb-8" data-tour="rotations">
            <h2 className="section-header mb-2 px-1">Rotations: money moved from one holding to another</h2>
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Rotations" value={String(rotation.rotations)} detail={`a sale funding a buy of another symbol within ${ROTATION_DAYS} days · ${rotation.judged} judged by the closes`} />
              <StatTile label="Better where it went" value={rotation.judged ? `${rotation.better} of ${rotation.judged}` : "n/a"} detail={rotation.betterPct === null ? "the bought side beat the sold side since" : `${pct(rotation.betterPct, 0)} of the judged rotations`} tone={rotation.betterPct === null ? "neutral" : rotation.betterPct >= 50 ? "ok" : "warn"} />
              <StatTile label="Spread, average" value={pts(rotation.avgSpreadPts)} detail={rotation.weightedSpreadPts === null ? "the bought side's return less the sold side's, since the sale" : `${pts(rotation.weightedSpreadPts)} weighted by the money moved`} tone={rotation.avgSpreadPts === null ? "neutral" : rotation.avgSpreadPts >= 0 ? "ok" : "danger"} />
              <StatTile label="Against staying put" value={rotation.gain === null ? "n/a" : signedMoney(rotation.gain, ccy)} detail="what the moved money gained or lost against staying where it was, to the latest close" tone={rotation.gain === null ? "neutral" : rotation.gain >= 0 ? "ok" : "danger"} />
            </div>
            {rotations.length ? (
              <div className="grid grid-cols-1 gap-x-8">
                {rotation.judged ? (
                  <Columns height={240} title="Spread per rotation" subtitle="The bought side's return less the sold side's, in points, since the sale; the rotations the closes cover." labels={rotations.filter((r) => r.spreadPts !== null).map((r) => `${r.sold}→${r.bought}`)} values={rotations.filter((r) => r.spreadPts !== null).map((r) => r.spreadPts)} color="var(--series-hcmp)" format="signedPct1" tableCaption="Each rotation's spread in points: the bought side's return since the sale less the sold side's" />
                ) : (
                  <p className="px-1 text-footnote text-text-secondary">None of the rotations is judged: the closes of the symbols on both sides have not been read.</p>
                )}
                <ListSection grid id="rotations" header={`Each rotation · ${rotations.length}`} footer={`A sale's proceeds are shared out over the buys of other symbols in the ${ROTATION_DAYS} days after it, in date order; the fills of one symbol on one day are one sale or one buy. Each side's return runs from the sale's date to the latest close; a side the price feed does not cover is not judged.${rotationCloses?.problems.length ? ` ${rotationCloses.problems.join(" ")}` : ""}`}>
                  {some("rotations", rotations).map((r, i) => (
                    <ListRow
                      key={`${r.date}-${r.sold}-${r.bought}-${i}`}
                      wrap
                      label={<span>Sold <span className="data">{r.sold}</span>, bought <span className="data">{r.bought}</span></span>}
                      detail={`${longDate(r.date)}${r.boughtOn !== r.date ? `, bought ${shortDate(r.boughtOn)}` : ""} · ${money(r.amount, ccy)} · since then ${r.sold} ${spct(r.soldSince)}, ${r.bought} ${spct(r.boughtSince)}`}
                      value={<span className={r.spreadPts === null ? "text-text-tertiary" : r.spreadPts > 0 ? "text-ok" : r.spreadPts < 0 ? "text-danger" : ""}>{pts(r.spreadPts)}</span>}
                    />
                  ))}
                  {allOf("rotations") && rotations.length > FILLS_ALL_MAX ? <ListRow label={`${rotations.length - FILLS_ALL_MAX} earlier rotations not shown.`} detail="Narrow the window to see them." /> : null}
                  {more("rotations", rotations.length, "rotations")}
                </ListSection>
              </div>
            ) : (
              <p className="px-1 text-footnote text-text-secondary">No sale in the window funded a buy of another symbol within {ROTATION_DAYS} days.</p>
            )}
          </section>
        ) : null}

        {on("unlogged") ? (
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Without a Decision Log entry"
              value={sells.length ? `${unlogged.length} of ${sells.length}` : "none to judge"}
              tone={unlogged.length ? "danger" : sells.length ? "ok" : "neutral"}
              detail={unlogged.length ? `${unlogged.slice(0, 3).map((f) => `${f.symbol} ${longDate(f.date)}`).join(", ")}${unlogged.length > 3 ? ` and ${unlogged.length - 3} more` : ""}` : "sales in the window, an entry naming the holding within a week"}
            />
          </div>
        ) : null}

        {reasoned && reasoned.trades ? (
          <section className="mb-8" aria-labelledby="reasoned">
            <h2 id="reasoned" className="section-header mb-2 px-1">Your reasons, scored</h2>
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Trades with a reason" value={`${reasoned.reasoned} of ${reasoned.trades}`} detail={`the past year's buys and sales with a Decision Log entry${reasoned.reasonedPct === null ? "" : ` · ${pct(reasoned.reasonedPct, 0)}`}`} tone={reasoned.reasonedPct === null ? "neutral" : reasoned.reasonedPct >= 80 ? "ok" : "warn"} />
              <StatTile label="Reasons borne out" value={reasoned.judged ? `${reasoned.right} of ${reasoned.judged}` : "none judged yet"} detail={reasoned.rightPct === null ? `a reason is judged ${JUDGE_AFTER_DAYS} days on, against SPY` : `${pct(reasoned.rightPct, 0)}: a buy that beat SPY since, a sale that then did worse`} tone={reasoned.rightPct === null ? "neutral" : reasoned.rightPct >= 50 ? "ok" : "warn"} />
            </div>
            <ListSection grid footer="Scores the thinking, not the money: whether a trade carried a written reason, and whether the reasoned ones fared better than SPY since. Past trades, not a forecast or advice.">
              {reasoned.rows.filter((r) => r.reason).slice(0, 6).map((r) => (
                <ListRow key={`${r.symbol}-${r.date}-${r.side}`} wrap label={<span>{r.side === "buy" ? "Bought" : "Sold"} <span className="data">{r.symbol}</span></span>} detail={`${longDate(r.date)} · ${r.reason}`} value={<span className={r.right === null ? "text-text-tertiary" : r.right ? "text-ok" : "text-danger"}>{r.right === null ? "not judged yet" : `${spct(r.movePct)} vs SPY ${spct(r.spyPct)}`}</span>} />
              ))}
              {!reasoned.reasoned ? <ListRow wrap label="No trade has a reason yet" detail="Answer a new trade's question on Notifications and it is kept in the Decision Log." /> : null}
            </ListSection>
          </section>
        ) : null}

        {planned && (planned.rows.length || planned.open.length) ? (
          <section className="mb-8" aria-labelledby="planned">
            <h2 id="planned" className="section-header mb-2 px-1">Planned or not</h2>
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Planned a day ahead" value={planned.plannedPct === null ? "no trades" : pct(planned.plannedPct, 0)} detail={`${planned.planned.trades} of ${planned.rows.length} trades in the past year had a plan on Trade check a day to ${PLAN_WINDOW_DAYS} days before`} tone={planned.plannedPct === null ? "neutral" : planned.plannedPct >= 50 ? "ok" : "warn"} />
              <StatTile label="Planned ones against SPY" value={planned.planned.rightPct === null ? "none judged yet" : pct(planned.planned.rightPct, 0)} detail={planned.planned.judged ? `${planned.planned.right} of ${planned.planned.judged} fared better than SPY since` : `a trade is judged ${JUDGE_AFTER_DAYS} days on`} tone="neutral" />
              <StatTile label="Unplanned ones against SPY" value={planned.impulsive.rightPct === null ? "none judged yet" : pct(planned.impulsive.rightPct, 0)} detail={planned.impulsive.judged ? `${planned.impulsive.right} of ${planned.impulsive.judged} fared better than SPY since` : `a trade is judged ${JUDGE_AFTER_DAYS} days on`} tone="neutral" />
              <StatTile label="Plans open" value={String(planned.open.length)} detail={`written in the past ${PLAN_WINDOW_DAYS} days and not traded yet`} tone="neutral" />
            </div>
            <ListSection grid footer="A plan is written on Trade check before the trade and kept in the Decision Log; a trade it names a day to a month later counts as planned. The app counts and measures; it never trades.">
              {planned.open.slice(0, 6).map((d) => (
                <ListRow key={d.id} wrap label={<span>Plan: <span className="data">{d.symbol}</span></span>} detail={`${longDate(d.date)} · ${d.title}${d.text ? ` · ${d.text.slice(0, 160)}` : ""}`} value={<StatusPill tone="info">open</StatusPill>} />
              ))}
              {!planned.open.length ? <ListRow wrap label="No plan open" detail={<span>Write the next one on <Link href="/check" className="text-accent-text underline-offset-4 hover:underline">Trade check</Link> a day before you trade.</span>} /> : null}
            </ListSection>
          </section>
        ) : null}

        {post && (post.rows.length || post.waiting.length) ? (
          <section className="mb-8" aria-labelledby="postmortems">
            <h2 id="postmortems" className="section-header mb-2 px-1">Sales a year on</h2>
            <ListSection grid header={post.judged ? `${post.well} of ${post.judged} sales well made` : `${post.waiting.length} waiting for their year`} footer="Each sale is looked back on a year after it was made: the reason written then, and what the stock did since against SPY. Doing worse than SPY means the sale was well made; better, that it was early. Past prices, not a forecast or advice.">
              {post.rows.slice(0, 6).map((r) => (
                <ListRow key={`${r.symbol}-${r.date}`} wrap label={<span>Sold <span className="data">{r.symbol}</span> {longDate(r.date)}</span>} detail={r.reason ?? "No reason written at the time."} value={<span className={r.verdict === null ? "text-text-tertiary" : r.verdict === "sold well" ? "text-ok" : "text-warn"}>{r.verdict === null ? "no closes" : `${r.verdict} · ${spct(r.movePct)} vs SPY ${spct(r.spyPct)}`}</span>} />
              ))}
              {post.waiting.slice(0, post.rows.length ? 2 : 4).map((w) => (
                <ListRow key={`w-${w.symbol}-${w.date}`} wrap label={<span>Sold <span className="data">{w.symbol}</span> {longDate(w.date)}</span>} detail={`Looked back on ${longDate(w.due)}.`} value={<span className="text-text-tertiary">waiting</span>} />
              ))}
            </ListSection>
          </section>
        ) : null}

        <div className="flow-cols">
          <div className="flow-col">
            {on("activity") ? (
              <div className="pair-grid-md mb-8 grid grid-cols-1 gap-3 md:grid-cols-2">
                <Columns title="Bought per month" labels={activity.map((a) => label(a.ym))} values={activity.map((a) => a.bought)} color="var(--series-hcmp)" format={`ccy:${ccy}`} tableCaption="Money bought per month, last twelve months with fills" />
                <Columns title="Sold per month" labels={activity.map((a) => label(a.ym))} values={activity.map((a) => a.sold)} color="var(--series-spy)" format={`ccy:${ccy}`} tableCaption="Money sold per month, last twelve months with fills" />
              </div>
            ) : null}

            {on("by_company") ? (
              <ListSection grid id="companies" header={`By company · ${traded.length}`} footer="Every company with a fill in the window. Open one for its price chart with each buy and sale on it." className="mb-8">
                {traded.length ? (
                  some("companies", traded).map((t) => (
                    <ListLinkRow key={t.symbol} href={`/trades/${encodeURIComponent(t.symbol)}` as Route} label={<span className="data">{t.symbol}</span>} detail={`${t.buys} buy${t.buys === 1 ? "" : "s"} ${money(t.bought, ccy)} · ${t.sells} sale${t.sells === 1 ? "" : "s"} ${money(t.sold, ccy)} · ${shortDate(t.first)} to ${shortDate(t.last)}`} />
                  ))
                ) : (
                  <ListRow label="No fills in the window." />
                )}
                {more("companies", traded.length, "companies")}
              </ListSection>
            ) : null}

          </div>

          <div className="flow-col">
            {on("fills") ? (
              <ListSection grid
                id="fills"
                header={`Fills · ${fills.length}`}
                footer={hasLog ? "Each sale shows whether a Decision Log entry names the holding within a week either side." : undefined}
              >
                {fills.length ? (
                  shown.map((f, i) => (
                    <ListRow
                      key={`${f.date}-${f.symbol}-${f.side}-${i}`}
                      label={
                        <span>
                          {f.side === "buy" ? "Bought" : "Sold"} <span className="data">{shares(f.quantity)} {f.symbol}</span>
                        </span>
                      }
                      detail={`${longDate(f.date)}${f.price !== null ? ` at ${unit(f.price, f.currency)}` : ""}${fillCosts(f, ccy) ? ` · ${fillCosts(f, ccy)}` : ""} · ${f.account}`}
                      value={money(f.amount, ccy)}
                      trailing={hasLog && f.side === "sell" ? <StatusPill tone={saleLogged(ws.decisions, f.symbol, f.date) ? "ok" : "danger"}>{saleLogged(ws.decisions, f.symbol, f.date) ? "Logged" : "No entry"}</StatusPill> : undefined}
                    />
                  ))
                ) : (
                  <ListRow label="No fills in the window." />
                )}
                {!showAll && fills.length > FILLS_SHOWN ? <MoreLink href={fillsHref(true)}>{`Show all ${fills.length} fills`}</MoreLink> : null}
                {showAll && fills.length > FILLS_ALL_MAX ? <ListRow label={`${fills.length - FILLS_ALL_MAX} earlier fills not shown.`} detail="Narrow the window to see them." /> : null}
                {showAll && fills.length > FILLS_SHOWN ? <MoreLink href={fillsHref(false)}>Show the latest only</MoreLink> : null}
              </ListSection>
            ) : null}
          </div>
        </div>

        {/* Across the page, under both columns, so it never sits alone beside empty space (Hamza, 20 Oct 2026). */}
        <RealisedMap rows={realised} ccy={ccy} footer="Each tile is a holding sold in the window, sized by what its sales made or lost and coloured by that against the cost of the lots closed. Proceeds less cost: the broker's own realised P&L where the statement carries it, else first in, first out over the ledger; a holding only the broker's P&L prices has no cost and takes its sign's colour." />

        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
