import { ScreenFreshness } from "@/components/app/screen-freshness";
import { AskClaudeCard } from "@/components/app/ask-claude";
import { askState } from "@/lib/ask-claude-run";
import { YourData } from "@/components/custom-data/your-data";

import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { FreshBadge } from "@/components/ui/freshness";
import { InsightsBar } from "@/components/performance/insights";
import { LookThroughSection } from "@/components/performance/look-through";
import { PerformanceLive } from "@/components/performance/performance-live";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { liveSubjects } from "@/lib/live";
import { LOOK_THROUGH_FUNDS, lookThrough } from "@/lib/look-through";
import { navIndex, WINDOW_KEYS, type WindowKey } from "@/lib/performance";
import { deriveScreens } from "@/lib/screen-data";
import { benchmarksOf, readsSeriesOnly } from "@/lib/screens";
import { dashboardFor } from "@/lib/methodology";
import { dashboardWith } from "@/lib/preferences";
import { localDay, longDate } from "@/lib/time";
import { perfInsightsFor, screen } from "@/lib/workspace";
import { insightsCurrent } from "@/lib/perf-insights";

export const metadata = { title: "Performance · Invariant" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ window?: string; irr?: string; alpha?: string }> }) {
  const sp = await searchParams;
  const pick = (v: string | undefined, d: WindowKey): WindowKey => (WINDOW_KEYS.includes(v as WindowKey) ? (v as WindowKey) : d);
  const windowKey = pick(sp.window, "1Y");
  // The IRR's own period, chosen on its card (Hamza, 19 Oct 2026); since the series began unless chosen. Alpha's, a year unless chosen.
  const irrKey = pick(sp.irr, "Since start");
  const alphaKey = pick(sp.alpha, "1Y");
  const ws = await screen("performance");
  // Through one portfolio, a value series that spans other accounts is left out (lib/portfolios.ts, scopeBook): say so, not that the broker sent none.
  const splitOff = !!ws.lens && !!ws.fullBook?.series?.nav.length && !ws.book?.series?.nav.length;
  const book = ws.book;
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Performance" />
        <PageBody>
          <NoFigures what="Returns" />
        </PageBody>
      </>
    );

  const today = localDay();
  const m = ws.setup.methodology;
  const data = deriveScreens({ book, methodology: m, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("performance");
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  const benchmarks = benchmarksOf(m);
  const idx = navIndex(book);
  const ledgerFlows = book.transactions.some((t) => t.kind === "deposit" || t.kind === "withdrawal");
  const ledgerCash = book.transactions.some((t) => t.kind === "dividend" || t.kind === "interest" || t.kind === "fee");
  const noFlows = !ledgerFlows && ledgerCash ? "The broker's ledger carries dividends but not one deposit or withdrawal. With Interactive Brokers, open the Flex query, tick Deposits & Withdrawals (or Select All) inside Cash Transactions, save and fetch again. If no money went in or out, nothing is missing." : null;
  // Every card says how fresh it is: the account series and the holdings arrive with the book.
  const fresh = ws.fresh ? <FreshBadge compact fresh={ws.fresh} /> : null;
  const look = on("look_through") ? lookThrough(m, data.weights, ws.benchmarks, LOOK_THROUGH_FUNDS) : null;

  // The methodology's own returns and risk (a dashboard section whose figures all read the value series), moved here from the first screen; its lines are drawn below with the benchmarks, so its tiles lead.
  const base = dashboardFor(ws.setup.profile, ws.modules, m);
  const { figures, dashboard } = dashboardWith(base.figures, base.dashboard, ws.preferences);
  const own = on("perf_sections") && idx ? dashboard.sections.filter((s) => readsSeriesOnly(m, s)).flatMap((s) => (s.kind === "figures" ? [{ ...s, figures: s.figures.filter((id) => figures.find((f) => f.id === id)?.view === "tile") }] : [])).filter((s) => s.figures.length) : [];
  // Each card read through the methodology, when asked (lib/perf-insights.ts); drawn under its card only when made on the figures and windows shown.
  const windows = { window: windowKey, irr: irrKey, alpha: alphaKey };
  const insights = on("perf_insights") && m && idx ? await perfInsightsFor(ws) : null;
  const current = !!insights && insightsCurrent(insights.file, book.asOf, windows, m?.name ?? "");
  const ask = insights ? await askState(ws) : { ask: false, connected: null };
  const canRead = ws.mode === "drive" && ws.hasModelKey && !ask.ask;
  // The book as the browser needs it to compute every card again at today's prices: the closes per holding are not read here, so they stay behind.
  const sent = book.series ? { ...book, series: { ...book.series, holdings: undefined } } : book;

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Performance" subtitle={`As of ${longDate(book.asOf)} · Series from ${(book.series?.source ?? "no source yet").replace(/\.$/, "")} · Returns are context, never the verdict.`} />
      <PageBody>
        <SampleNote sample={ws.sample} showcase={ws.showcase} asOf={book.asOf} />

        {insights && m && (insights.file || !ask.ask) ? <InsightsBar file={insights.file} methodology={m.name} asOf={book.asOf} windows={windows} current={current} canRead={canRead} demo={ws.mode === "demo"} error={insights.error} /> : null}
        {insights && m && ask.ask ? <AskClaudeCard feature="perf_insights" connected={ask.connected} demo={ws.mode === "demo"} /> : null}

        <PerformanceLive
          book={sent}
          netWorth={data.netWorth}
          subjects={liveSubjects(data.weights)}
          live={ws.mode === "drive"}
          fresh={ws.fresh}
          ccy={ws.setup.baseCurrency}
          methodology={m}
          benchmarks={benchmarks}
          windowKey={windowKey}
          irrKey={irrKey}
          alphaKey={alphaKey}
          slots={[...slots]}
          own={own}
          figures={figures}
          inputs={[...ws.setup.inputs]}
          signals={data.signals}
          markets={book.markets?.rows ?? null}
          today={today}
          noFlows={noFlows}
          splitOff={splitOff ? (ws.lens?.name ?? "this portfolio") : null}
          insights={insights?.file && (current || ws.mode === "demo") ? insights.file.items : null}
        />

        {look ? <LookThroughSection look={look} m={m} benchmarks={benchmarks} badge={fresh} demo={ws.mode === "demo"} insights={insights?.file && (current || ws.mode === "demo") ? insights.file.items : null} /> : null}

        {on("your_data_performance") ? <YourData file={ws.customData} screen="performance" demo={ws.mode === "demo"} /> : null}
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
