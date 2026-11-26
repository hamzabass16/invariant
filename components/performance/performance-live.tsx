"use client";

import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { StatTile } from "@/components/app/figures";
import { GroupedBars } from "@/components/charts/grouped-bars";
import { LineChart } from "@/components/charts/line-chart";
import { RangeBar } from "@/components/dashboard/range-bar";
import { FiguresSection } from "@/components/dashboard/sections";
import { LiveBadge, restingFresh, useLiveBook, useMarketOpen } from "@/components/live/live";
import { AlphaCard } from "@/components/performance/alpha-card";
import { DayStatsCards } from "@/components/performance/day-stats";
import { InsightNote } from "@/components/performance/insights";
import { IrrCard } from "@/components/performance/irr-card";
import { FreshBadge } from "@/components/ui/freshness";
import { ListRow, ListSection } from "@/components/ui/list";
import { returnRange, riskRange, yearRange } from "@/lib/figure-range";
import { closedOn, FRESH, type Fresh } from "@/lib/freshness";
import { pct, signedPct } from "@/lib/format";
import { money, unlistedSentence, type Book } from "@/lib/holdings";
import { liveSeriesBook, type LiveSubject } from "@/lib/live";
import type { RangeSpec, MarketRow } from "@/lib/markets";
import { contextFor, type Methodology, type Section } from "@/lib/methodology";
import type { Period } from "@/lib/ontology";
import type { PerfInsight } from "@/lib/perf-insights";
import { alphaStats, annualise, benchmarkIndex, cashShare, dayStats, drawdownSeries, flowsLeftOut, growthOf100, moneyWeighted, monthlyGrid, navIndex, periodReturns, riskStats, WINDOW_KEYS, windowOf, type WindowKey } from "@/lib/performance";
import { computeExpr, type Figure } from "@/lib/recipes";
import type { Signal } from "@/lib/screens";
import type { InputId } from "@/lib/setup";
import { daysBetween, longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

// The account's own hue, then one hue per benchmark in the methodology's order. Status colours are never series.
const ACCOUNT = { label: "Account", color: "var(--series-hcmp)" };
const BENCH_COLORS = ["var(--series-spy)", "var(--series-qqq)", "var(--viz-text)"];
/** SPY and QQQ keep their own hues wherever they appear; another benchmark takes the next free one. */
const FIXED_BENCH: Record<string, string> = { SPY: "var(--series-spy)", QQQ: "var(--series-qqq)" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const NO_SERIES = "Needs the account value by day. Add the \"Net Asset Value (NAV) in Base\" section to the IBKR Flex query (the guide on Setup shows where) and upload the statement again.";
const NO_BENCHMARK = "No benchmark named in the methodology.";
const needsPrices = (symbol: string) => `Needs benchmark prices (${symbol}), which no connection supplies yet.`;

const n1 = (v: number | null, suffix = "") => (v === null ? "n/a" : `${v.toFixed(1)}${suffix}`);
const n2 = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
// The page's windows as the ontology's periods, for a return's scale.
const PERIOD_OF: Record<WindowKey, Period> = { "3M": "3m", YTD: "ytd", "1Y": "1y", "Since start": "inception" };
const bar = (range: RangeSpec | null, format: (v: number) => string) => (range ? <RangeBar range={range} format={format} /> : undefined);
const pctText = (v: number) => `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;

function Tone({ v }: { v: number | null }) {
  if (v === null) return <span className="text-text-tertiary">n/a</span>;
  return <span className={v > 0 ? "text-ok" : v < 0 ? "text-danger" : ""}>{signedPct(v, 1)}</span>;
}

const href = (window: WindowKey, irr: WindowKey, alpha: WindowKey, hash = "") => `/performance?window=${encodeURIComponent(window)}&irr=${encodeURIComponent(irr)}&alpha=${encodeURIComponent(alpha)}${hash}`;

function Segmented({ current, irr, alpha }: { current: WindowKey; irr: WindowKey; alpha: WindowKey }) {
  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1" role="group" aria-label="Window for growth, risk and the gap below the high">
      {WINDOW_KEYS.map((w) => (
        <Link key={w} href={href(w, irr, alpha) as Route} aria-current={w === current ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-[8px] px-3 text-subhead", w === current ? "bg-surface text-text" : "text-text-secondary")}>
          {w}
        </Link>
      ))}
    </div>
  );
}

/** The drawdown tile's period as one of the page's windows, and in words for the tile beside it. */
const PERIOD_WINDOW: Partial<Record<Period, WindowKey>> = { "3m": "3M", ytd: "YTD", "1y": "1Y", inception: "Since start" };
const WINDOW_WORDS: Record<WindowKey, string> = { "3M": "three months", YTD: "this year", "1Y": "one year", "Since start": "since the start" };

export type PerformanceLiveProps = {
  book: Book;
  netWorth: number;
  subjects: LiveSubject[];
  /** Live prices are read (the person's own app; the demo has none). */
  live: boolean;
  fresh: Fresh | null;
  ccy: string;
  methodology: Methodology | null;
  benchmarks: string[];
  windowKey: WindowKey;
  irrKey: WindowKey;
  alphaKey: WindowKey;
  slots: string[];
  /** The methodology's sections of returns and risk, its figures and what they read with. */
  own: Extract<Section, { kind: "figures" }>[];
  figures: Figure[];
  inputs: InputId[];
  signals: Signal[];
  markets: MarketRow[] | null;
  today: string;
  noFlows: string | null;
  splitOff: string | null;
  /** The readings of each card through the methodology, when made on the figures and windows shown (lib/perf-insights.ts). */
  insights?: readonly PerfInsight[] | null;
};

/**
 * Performance at today's prices (Hamza, 19 Oct 2026: "always make a card live
 * when possible"): while the US market is open the page asks for the listed
 * holdings' and the benchmarks' prices every 30 seconds, as the Dashboard
 * does, lays the session on the account's series and the benchmarks'
 * (`liveSeriesBook`) and computes every card again from it here: the
 * tiles, the IRR, alpha, the returns by period, growth, risk, the days, the
 * drawdown and the months. After the bell the session's closes stay, badged
 * as closed on its date. Without prices it is the book as kept.
 */
export function PerformanceLive(p: PerformanceLiveProps) {
  const extra = React.useMemo(() => [...new Set([...p.benchmarks, "SPY", "QQQ"])], [p.benchmarks]);
  const s = useLiveBook(p.subjects, p.netWorth, p.live, extra);
  const open = useMarketOpen();
  const ratio = s.book && p.netWorth > 0 ? s.book.netWorth / p.netWorth : null;
  const lived = React.useMemo(() => (s.at ? liveSeriesBook(p.book, ratio, s.quotes, s.at) : null), [p.book, ratio, s.quotes, s.at]);
  const book: Book = lived ?? p.book;
  // A card drawn from the session: Live with the time while the market is open, else closed on the session's date; the book as kept rests as a live card does.
  const badgeFresh: Fresh | null = lived ? (open ? { kind: "live", label: FRESH.live.label, when: null, rhythm: "Prices every 30 seconds while the US market is open.", stale: false } : closedOn(lived.session)) : restingFresh(p.fresh, p.live, open);
  const fresh = lived && open ? <LiveBadge at={s.at} failedAt={s.failedAt} /> : badgeFresh ? <FreshBadge compact fresh={badgeFresh} /> : null;

  const on = (id: string) => p.slots.includes(id);
  const { benchmarks, ccy, windowKey, irrKey, alphaKey } = p;
  const present = benchmarks.filter((x) => benchmarkIndex(book, x) !== null);
  const missing = benchmarks.filter((x) => !present.includes(x));
  const others = benchmarks.filter((x) => !FIXED_BENCH[x]);
  const benchColor = (x: string) => FIXED_BENCH[x] ?? BENCH_COLORS.slice(2)[Math.max(0, others.indexOf(x)) % BENCH_COLORS.slice(2).length];
  const benchSeries = present.map((x) => ({ key: x, label: x, color: benchColor(x) }));
  const benchmarkNote = benchmarks.length ? missing.map(needsPrices).join(" ") : NO_BENCHMARK;

  const idx = navIndex(book);
  const flowGaps = flowsLeftOut(book);
  const netWorth = lived ? s.book!.netWorth : p.netWorth;
  const cash = cashShare(book);
  const periods = idx ? periodReturns(book, benchmarks, book.asOf) : [];
  const ytd = periods.find((x) => x.key === "YTD");
  const since = periods.find((x) => x.key === "Since start");
  const sinceDays = since ? daysBetween(since.from, since.to) : 0;
  const sinceAnnual = since?.account != null && sinceDays > 366 ? annualise(since.account, sinceDays) : null;
  const ddAll = drawdownSeries(book, "Since start");
  // Growth of 100 draws SPY and QQQ beside the methodology's own benchmarks (Hamza, 19 Oct 2026).
  const growthBench = [...new Set([...present, "SPY", "QQQ"])].filter((x) => benchmarkIndex(book, x) !== null);
  const growth = growthOf100(book, growthBench, windowKey);
  const risk = riskStats(book, benchmarks[0] ?? null, windowKey);
  const dd = drawdownSeries(book, windowKey);
  // Bad and good days, alpha and the comparison, against the methodology's first benchmark with prices, else SPY (Hamza, 19 Oct 2026).
  const versus = present[0] ?? (benchmarkIndex(book, "SPY") ? "SPY" : null);
  const days = idx && on("day_stats") ? dayStats(book, versus, windowOf(windowKey, book.asOf, idx.dates[0])) : null;
  const grid = monthlyGrid(book, benchmarks);
  const mw = on("irr") ? moneyWeighted(book, irrKey) : null;
  const alpha = idx && on("alpha") && versus ? alphaStats(book, versus, alphaKey) : null;
  const gridSeries = [{ key: "account", ...ACCOUNT }, ...benchSeries];
  const ctx = React.useMemo(() => contextFor(book, p.today, p.methodology), [book, p.today, p.methodology]);

  // The methodology's own series figures, so no card below repeats one (Hamza, 20 Oct 2026: no repeated cards).
  const ownSeries = p.own.flatMap((sec) => sec.figures).map((id) => p.figures.find((f) => f.id === id)).flatMap((f) => (f && f.expr.op === "series" && f.expr.of === "nav" ? [f.expr] : []));
  const ownReads = (stat: string) => ownSeries.some((e) => e.stat === stat);
  // Beside the methodology's worst drawdown, over its own period, a figure the ontology offers that nothing else on the page shows (Hamza, 20 Oct 2026: the Alpha tile repeated the Alpha card): the Sortino ratio, by the same recipe a methodology would name.
  const ddFigure = p.own.flatMap((sec) => sec.figures).map((id) => p.figures.find((f) => f.id === id)).find((f) => f?.expr.op === "series" && f.expr.stat === "max_drawdown");
  const ddPeriod: Period = ddFigure && ddFigure.expr.op === "series" ? ddFigure.expr.period : "1y";
  const tileWindow = PERIOD_WINDOW[ddPeriod] ?? "1Y";
  const sortino = React.useMemo(() => (ddFigure && !ownReads("sortino") ? computeExpr({ op: "series", of: "nav", stat: "sortino", period: ddPeriod }, "ratio", ctx, p.inputs) : null), [ddFigure, ddPeriod, ctx, p.inputs]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortinoValue = sortino?.kind === "scalar" ? sortino.value : null;
  const gapSection = ddFigure ? p.own.findIndex((sec) => sec.figures.includes(ddFigure.id)) : -1;
  const gapTile = sortino ? [{
    key: "sortino",
    tile: (
      <StatTile
        label={`Sortino ratio, ${WINDOW_WORDS[tileWindow]}`}
        value={sortinoValue === null ? "n/a" : `${sortinoValue.toFixed(2)}`}
        extra={bar(riskRange(sortinoValue, "sortino"), (v) => v.toFixed(1))}
        detail={sortinoValue === null ? "Needs two returns in the period" : "return a year per unit of downside swing"}
        badge={fresh}
      />
    ),
  }] : [];

  // The risk cells less those another card on the page already shows over the same span (Hamza, 20 Oct 2026: no repeated cards): the return is Returns by period's, the worst day Good and bad days', the worst fall the high-water chart's, and a figure the methodology's own tiles carry stays theirs.
  const riskAll: [string, string, string, RangeSpec | null][] = risk
    ? [
        ["Return", n1(risk.twr, "%"), "time-weighted, in the window", risk.twr === null ? null : returnRange(risk.twr, PERIOD_OF[windowKey])],
        ["Volatility", n1(risk.volatility, "%"), risk.volatility === null ? "needs two returns" : "a year", riskRange(risk.volatility, "volatility")],
        ["Beta", n2(risk.beta), benchmarks[0] ? (present.includes(benchmarks[0]) ? (risk.beta === null ? `against ${benchmarks[0]}; needs three paired returns` : `against ${benchmarks[0]}`) : needsPrices(benchmarks[0])) : NO_BENCHMARK, riskRange(risk.beta, "beta")],
        ["Correlation", n2(risk.correlation), benchmarks[0] ? (present.includes(benchmarks[0]) ? `with ${benchmarks[0]}` : needsPrices(benchmarks[0])) : NO_BENCHMARK, riskRange(risk.correlation, "correlation")],
        ["Sharpe", n2(risk.sharpe), `excess over ${(risk.rate * 100).toFixed(1)}% a year`, riskRange(risk.sharpe, "sharpe")],
        ["Worst fall", n1(risk.worstFall, "%"), "one observation", riskRange(risk.worstFall, "worst_fall")],
        ["Max drawdown", n1(risk.maxDrawdown, "%"), "peak to trough in the window", riskRange(risk.maxDrawdown, "max_drawdown")],
        ["Calmar", n2(risk.calmar), risk.days < 365 ? "needs a year of window" : "annualised return over the worst fall", riskRange(risk.calmar, "calmar")],
      ]
    : [];
  // Each cell another card already draws, with what it is and where (Hamza, 20 Oct 2026: no repeated cards).
  const shownElsewhere: Record<string, [string, string] | null> = {
    Return: on("by_period") ? ["the return", "Returns by period"] : null,
    Volatility: ownReads("volatility") ? ["volatility", "the tiles above"] : null,
    Beta: ownReads("beta") ? ["beta", "the tiles above"] : null,
    "Worst fall": days ? ["the worst day", "Good and bad days"] : null,
    "Max drawdown": on("drawdown") ? ["the worst fall from a high", "Below the high-water mark"] : ownReads("max_drawdown") ? ["the worst fall from a high", "the tiles above"] : null,
  };
  const riskCells = riskAll.filter(([label]) => !shownElsewhere[label]);
  const leftWhere = new Map<string, string[]>();
  for (const [label] of riskAll) {
    const at = shownElsewhere[label];
    if (at) leftWhere.set(at[1], [...(leftWhere.get(at[1]) ?? []), at[0]]);
  }
  const riskLeft = leftWhere.size ? `Shown elsewhere on the page: ${[...leftWhere].map(([where, what]) => `${what.join(" and ")} in ${where}`).join("; ")}.` : null;
  const riskCols = ({ 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 5: "md:grid-cols-3", 6: "md:grid-cols-3" } as Record<number, string>)[riskCells.length] ?? "md:grid-cols-4";

  // Money a statement's own totals say moved that its rows do not list: every figure over those dates counts it, so the page says so first (Hamza, 19 Oct 2026).
  const unlisted = book.series?.unlisted ?? [];

  return (
    <div data-live={lived ? (open ? "today" : "close") : "book"}>
      {unlisted.length ? (
        <p role="note" className="mb-6 rounded-card bg-warn/15 px-4 py-3 text-subhead text-text">
          {unlistedSentence(unlisted, p.ccy)} Until then the returns, the best and worst days, the IRR and alpha over {unlisted.length === 1 ? "that period" : "those periods"} are not to be relied on.
        </p>
      ) : null}
      {p.own.map((sec, i) => (
        <div key={`${sec.label}-${i}`} data-tour="perf-sections">
          <FiguresSection section={sec} figures={p.figures} ctx={ctx} inputs={p.inputs} fresh={{ book: badgeFresh, markets: null }} markets={p.markets} signals={p.signals} more={i === gapSection ? gapTile : []} />
        </div>
      ))}

      {idx && on("perf_tiles") && !p.own.length ? (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile center label={lived && open ? "Net worth now" : "Net worth"} value={money(netWorth, ccy)} extra={bar(yearRange(netWorth, book.series?.nav ?? [], book.asOf), (v) => money(v, ccy))} detail={`cash ${pct(cash, 1)}`} badge={fresh} />
          <StatTile
            label={benchmarks.length ? `${book.asOf.slice(0, 4)} vs ${benchmarks[0]}` : "This year"}
            value={<Tone v={ytd?.account ?? null} />}
            extra={bar(ytd?.account == null ? null : returnRange(ytd.account, "ytd"), pctText)}
            badge={fresh}
            detail={benchmarks.length ? [...present.map((x) => `${x} ${ytd?.benchmarks[x] == null ? "n/a" : signedPct(ytd.benchmarks[x] as number, 1)}`), ...missing.map(needsPrices)].join(" · ") : NO_BENCHMARK}
          />
          <StatTile label="Since start" badge={fresh} value={<Tone v={since?.account ?? null} />} extra={bar(since?.account == null ? null : returnRange(since.account, "inception"), pctText)} detail={`${longDate(idx.dates[0])}${sinceAnnual !== null ? ` · ${signedPct(sinceAnnual, 1)} a year` : ""}`} />
          <StatTile
            label="Below the high"
            badge={fresh}
            value={ddAll ? (ddAll.current === 0 ? "At a high" : pct(ddAll.current, 1)) : "n/a"}
            tone={ddAll && ddAll.current < -10 ? "warn" : "neutral"}
            extra={bar(ddAll ? riskRange(ddAll.current, "high_water_gap") : null, pctText)}
            detail={ddAll ? `high ${longDate(ddAll.highDate)} · worst fall ${pct(ddAll.maxDrawdown, 1)}` : undefined}
          />
        </div>
      ) : null}

      {idx && !on("by_period") && (on("perf_tiles") || p.own.length) ? <InsightNote insights={p.insights} card="returns" /> : null}
      {idx && mw ? <IrrCard mw={mw} ccy={ccy} badge={fresh} windows={WINDOW_KEYS.map((w) => ({ key: w, href: href(windowKey, w, alphaKey, "#irr-title"), current: w === irrKey }))} flowsNote={flowGaps.length ? "Flows in a currency the book cannot convert are left out, as in the returns below." : null} noFlows={p.noFlows} /> : null}
      {idx && mw ? <InsightNote insights={p.insights} card="irr" /> : null}

      {idx && on("alpha") ? <AlphaCard a={alpha} badge={fresh} windows={WINDOW_KEYS.map((w) => ({ key: w, href: href(windowKey, irrKey, w, "#alpha"), current: w === alphaKey }))} needs={versus ? `Needs at least 20 returns against ${versus} in this window.` : needsPrices("SPY")} /> : null}
      {idx && on("alpha") && alpha ? <InsightNote insights={p.insights} card="alpha" /> : null}

      {!idx ? (
        <ListSection header={p.splitOff ? `No series for ${p.splitOff}` : "No account series yet"} footer="Concentration and the portfolio by holding and by class are on Holdings; they need no series.">
          <ListRow wrap label={p.splitOff ? "The account value by day covers more than this portfolio's accounts, so its returns cannot be told apart from the others'. Choose All portfolios at the top to see the returns." : NO_SERIES} />
        </ListSection>
      ) : null}
      {idx && flowGaps.length ? (
        <ListSection header="Flows left out" className="mb-8">
          <ListRow wrap label={`${flowGaps.map((g) => `${g.count} ${g.count === 1 ? "flow" : "flows"} in ${g.currency}`).join(", ")} not taken out of the returns: the book carries no rate to ${ccy} for ${flowGaps.length === 1 ? "it" : "them"}, so those days read as gains or losses.`} />
        </ListSection>
      ) : null}

      {idx && on("by_period") ? (
        <div className="mb-8">
          <GroupedBars
            title="Returns by period"
            badge={fresh}
            subtitle={`Time-weighted, in percent, to the same date${lived ? (open ? ", today at the prices now" : ", the last session at its close") : ""}. Deposits and withdrawals are taken out.`}
            groups={periods.map((x) => ({ key: x.key, label: x.key, values: [x.account, ...present.map((b) => x.benchmarks[b] ?? null)], note: x.note ?? "series too short" }))}
            series={gridSeries.map((x) => ({ label: x.label, color: x.color }))}
            format="signedPct1"
            tableCaption="Account and benchmark returns for each period"
          />
          <p className="mt-2 px-4 text-footnote text-text-secondary">
            {benchmarkNote}
            {periods.filter((x) => x.note).map((x) => ` ${x.key}: ${x.note}`).join("")}
          </p>
        </div>
      ) : null}
      {idx && on("by_period") ? <InsightNote insights={p.insights} card="returns" /> : null}

      {idx && (on("growth") || on("risk") || on("drawdown")) ? <Segmented current={windowKey} irr={irrKey} alpha={alphaKey} /> : null}

      {idx && growth && on("growth") ? (
        <div className="mb-8">
          <LineChart
            title={`Growth of 100 · ${windowKey}`}
            badge={fresh}
            subtitle={`${longDate(growth.from)} to ${longDate(growth.to)}. ${benchmarkNote}`}
            dates={growth.dates}
            series={[{ key: "account", ...ACCOUNT, values: growth.account }, ...growthBench.map((x) => ({ key: x, label: x, color: benchColor(x), values: growth.benchmarks[x] ?? [] }))]}
            format="int"
            baseline={100}
            tableCaption={`Growth of 100 over ${windowKey}`}
            tableEvery={growth.dates.length > 60 ? 5 : 1}
          />
        </div>
      ) : null}

      {idx && risk && on("risk") ? (
        <ListSection
          header={`Risk · ${windowKey}`}
          trailing={fresh}
          footer={`${longDate(risk.from)} to ${longDate(risk.to)}: ${risk.n} returns, ${risk.perYear} a year assumed from their spacing. ${book.market ? `Risk-free rate ${(risk.rate * 100).toFixed(1)}% a year from the book's market inputs.` : "No risk-free rate in the book; taken as 0."}`}
        >
          <div className={cn("grid grid-cols-2 gap-px bg-hairline", riskCols)}>
            {riskCells.map(([label, value, detail, range], i) => (
              <div key={label} className={cn("bg-surface px-4 py-3", riskCells.length % 2 === 1 && i === riskCells.length - 1 ? "col-span-2 md:col-span-1" : "")}>
                <p className="section-header">{label}</p>
                <p className="data mt-1 text-title-3 font-semibold">{value}</p>
                {range ? <RangeBar range={range} format={["Return", "Volatility", "Worst fall", "Max drawdown"].includes(label) ? pctText : (v) => v.toFixed(1)} /> : null}
                <p className="mt-1 text-footnote text-text-secondary">{detail}</p>
              </div>
            ))}
          </div>
          {riskLeft ? <p className="px-4 pt-2 text-caption text-text-tertiary">{riskLeft}</p> : null}
        </ListSection>
      ) : null}
      {idx && risk && on("risk") ? <InsightNote insights={p.insights} card="risk" /> : null}

      {days ? <DayStatsCards s={days} badge={fresh} /> : null}
      {days ? <InsightNote insights={p.insights} card="days" /> : null}

      {idx && dd && on("drawdown") ? (
        <div className="mb-8">
          <LineChart
            title={`Below the high-water mark · ${windowKey}`}
            badge={fresh}
            subtitle={`Worst fall ${pct(dd.maxDrawdown, 1)} to ${longDate(dd.troughDate)} · high ${longDate(dd.highDate)} · ${dd.current === 0 ? "at a high now" : `${pct(dd.current, 1)} now`}.`}
            dates={dd.dates}
            series={[{ key: "account", ...ACCOUNT, values: dd.values }]}
            format="pct0"
            area
            baseline={0}
            tableCaption="Percent below the high-water mark by date"
            tableEvery={dd.dates.length > 60 ? 5 : 1}
          />
        </div>
      ) : null}
      {idx && dd && on("drawdown") ? <InsightNote insights={p.insights} card="drawdown" /> : null}

      {idx && on("monthly") && grid.years.length ? (
        <ListSection header="Monthly returns" trailing={fresh} footer={`Percent, time-weighted, from each month's last point. ${benchmarkNote}`}>
          <div className="overflow-x-auto px-4 py-3">
            <table className="data w-full text-footnote">
              <caption className="sr-only">Monthly returns by year for the account and the benchmarks</caption>
              <thead>
                <tr className="text-text-tertiary">
                  <th scope="col" className="py-1 pr-3 text-left font-medium">
                    Year
                  </th>
                  {MONTHS.map((mo) => (
                    <th key={mo} scope="col" className="py-1 px-1.5 text-right font-medium">
                      {mo}
                    </th>
                  ))}
                  <th scope="col" className="py-1 pl-3 text-right font-medium">
                    Year
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.years.map((y) =>
                  gridSeries.map((g, si) => {
                    const cell = (c: (typeof y.months)[number]) => (c ? (g.key === "account" ? c.account : c.benchmarks[g.key] ?? null) : null);
                    const total = g.key === "account" ? y.total.account : y.total.benchmarks[g.key] ?? null;
                    return (
                      <tr key={`${y.year}-${g.key}`} className={si === 0 ? "border-t border-hairline" : ""}>
                        <th scope="row" className="py-1 pr-3 text-left font-normal whitespace-nowrap text-text-secondary">
                          {si === 0 ? y.year : ""} <span className="text-text-tertiary">{g.label}</span>
                        </th>
                        {y.months.map((c, i) => {
                          const v = cell(c);
                          return (
                            <td key={i} className={cn("py-1 px-1.5 text-right", v === null ? "text-text-tertiary" : v > 0 ? "text-ok" : v < 0 ? "text-danger" : "")}>
                              {v === null ? (c ? "n/a" : "") : v.toFixed(1)}
                            </td>
                          );
                        })}
                        <td className={cn("py-1 pl-3 text-right font-medium", total === null ? "text-text-tertiary" : total >= 0 ? "text-ok" : "text-danger")}>{total === null ? "n/a" : signedPct(total, 1)}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </ListSection>
      ) : null}
      {s.problem && p.live && !lived && open ? <p className="mb-6 px-1 text-footnote text-text-secondary">{s.problem}</p> : null}
    </div>
  );
}
