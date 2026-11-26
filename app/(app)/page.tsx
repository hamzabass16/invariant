import { FileUp, Inbox, ListChecks, Presentation, Siren } from "lucide-react";
import { freshness } from "@/lib/freshness";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import Link from "next/link";
import type { Route } from "next";

import { SampleNote } from "@/components/app/sample-note";
import { YourData } from "@/components/custom-data/your-data";
import { figureText } from "@/components/dashboard/figure";
import { FearGreedCard } from "@/components/dashboard/fear-greed";
import { ResonanceLine, type ResonanceState } from "@/components/dashboard/resonance-line";
import { DashboardSection, FiguresSection } from "@/components/dashboard/sections";
import { FreshBadge } from "@/components/ui/freshness";
import { BookNow, type HeadlineTile, type LiveFigures } from "@/components/live/live";
import { RefreshWhilePending } from "@/components/live/refresh";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { reportsFileSchema, type Report } from "@/lib/report";
import { SyncError } from "@/lib/sync-error";
import { bookDay, breadth, closedBy, newYorkClock, sessionOf } from "@/lib/market-day";
import { liveSubjects, yearBase } from "@/lib/live";
import { returnChartData } from "@/lib/return-chart";
import { loadCloses, loadMarketDay } from "@/lib/markets-feed";
import { withCloses } from "@/lib/markets";
import { positionsOf } from "@/lib/positions";
import { GRID_FIELDS, type GridExtra } from "@/lib/portfolio-grid";
import { holdingView } from "@/components/holdings/portfolio-donuts";
import type { PortfolioGridProps } from "@/components/dashboard/portfolio-grid";
import { computeFigure, dashboardFor, evaluate, findingCounts, inputLabel } from "@/lib/methodology";
import { needsWords } from "@/lib/recipes";
import { LISTED_FOR_DAY, ownerValueOf, PANELS } from "@/lib/ontology";
import { perPortfolio } from "@/lib/portfolios";
import { resonanceOf } from "@/lib/resonance";
import { cashShare } from "@/lib/performance";
import { figureRangeOf, yearRange } from "@/lib/figure-range";
import { dashboardWith } from "@/lib/preferences";
import { deriveScreens } from "@/lib/screen-data";
import { DividendTiles } from "@/components/dividends/cards";
import { dividendsOf } from "@/lib/dividends";
import { benchmarksOf, HEADLINE_BENCHMARKS, headlineTiles, marketSections, readsByHolding, readsComposition, readsMarkets, readsDividends, readsPrices, readsSeriesOnly } from "@/lib/screens";
import { INPUTS, PROFILES, inputsWithoutData, type InputId } from "@/lib/setup";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Dashboard · Invariant" };

/** The first page after a close starts reading five hundred companies for the session; the read carries on after the response, within this. */
export const maxDuration = 300;


/** Which input would fill a panel the methodology asks for. */
const FILLS: Partial<Record<string, InputId>> = { options: "ibkr", income: "bank_statements", funds: "fund_reports", properties: "property" };

/** The latest scheduled report, read softly: a vault that cannot give it leaves the row out, never a wrong verdict. */
async function latestReport(mode: string): Promise<Report | null> {
  if (mode !== "drive") return null;
  try {
    const { openVault } = await import("@/lib/vault");
    const file = await (await openVault()).readJson("reports", reportsFileSchema);
    return file?.reports[0] ?? null;
  } catch (e) {
    if (e instanceof SyncError) return null;
    throw e;
  }
}

/**
 * The Dashboard, the first screen (Hamza's ruling of 15 Oct 2026: Today and
 * the Dashboard are one screen, called Dashboard): the methodology's headline
 * figures, how the book did in the last closed session (the day's move, every
 * listed holding with its move and its part in the whole, why each moved),
 * the session itself (the indices through the day, what drove the S&P 500
 * and QQQ, the heat map, the movers, what happened), what needs a decision,
 * the methodology's checks, weights against caps and the class mix, what is
 * on watch, the latest review, then the methodology's own sections in its
 * order. A section of returns and risk alone is on Performance when that
 * screen is on. A slot the methodology never asks for is not drawn
 * (lib/ontology.ts SCREENS).
 */
export default async function DashboardPage() {
  const ws = await screen("overview");
  const { setup, book } = ws;
  const today = localDay();
  const m = setup.methodology;
  const waiting = inputsWithoutData(setup, book);
  const data = book ? deriveScreens({ book, methodology: m, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences, research: ws.research, alerts: ws.alerts, statements: ws.statements }, today) : null;
  const slots = data ? data.slots("today") : [];
  // A dividend methodology's tiles from the Dividends screen (Hamza, 19 Oct 2026).
  
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  // The book in the last closed session: the session's read where it carries a holding, its own closes otherwise; nothing of the book is kept or logged.
  const listed = new Map<string, { symbol: string; name: string; value: number }>();
  for (const h of book?.holdings ?? []) {
    if (!LISTED_FOR_DAY.has(h.assetClass)) continue;
    const got = listed.get(h.symbol.toUpperCase()) ?? { symbol: h.symbol, name: h.name, value: 0 };
    got.value += ownerValueOf(h, book!);
    listed.set(h.symbol.toUpperCase(), got);
  }
  const dayOn = !!data && (on("book_day") || on("live_book")) && listed.size > 0;
  // The portfolio as one ruled grid at the top (Hamza, 21 Nov 2026), from the positions at their closes.
  const gridOn = !!data && on("portfolio_grid") && listed.size > 0;
  // The session's own slots read the same kept session, whether or not the book has a listed holding.
  const sessionOn = !!data && (["market_indices", "market_drivers", "market_heatmap", "market_movers"] as const).some((id) => on(id));
  const [session, closes, latest] = await Promise.all([
    dayOn || sessionOn ? loadMarketDay() : null,
    dayOn || gridOn ? loadCloses([...listed.values()].map((l) => l.symbol).join(","), today) : null,
    on("latest_review") ? latestReport(ws.mode) : null,
  ]);
  const day = session?.day ?? null;
  const held = (book?.holdings ?? []).map((h) => h.symbol);
  const b = breadth(day);
  // The methodology's headline figures, as the person chose them on Customise; moved here from the Dashboard.
  const base = dashboardFor(setup.profile, ws.modules, m);
  const { figures, dashboard } = dashboardWith(base.figures, base.dashboard, ws.preferences);
  // Less the book's total, which the net worth tile says, and the weights by class, which Holdings draws (lib/screens.ts dashboardHeadline).
  const holdingsOn = ws.screens.includes("holdings");
  // This year, SPY against the book against QQQ (Hamza, 15 Oct 2026): from the value series and the benchmarks' closes, moved by today's prices on the page.
  // The demo is frozen at its snapshot, so its year ends at the book's date.
  const yearDay = ws.mode === "demo" && book ? book.asOf : newYorkClock(new Date()).date;
  const demoYear = ws.mode === "demo";
  const series = book?.series;
  const year = on("headline") && series ? { book: yearBase(series.nav, yearDay, true), SPY: yearBase(series.benchmarks.SPY ?? [], yearDay, demoYear), QQQ: yearBase(series.benchmarks.QQQ ?? [], yearDay, demoYear) } : null;
  const yearOn = !!year && !!(year.book || year.SPY || year.QQQ);
  // One function with the live route (lib/screens.ts headlineTiles), so the tiles the page draws are the ones the route recomputes at today's prices.
  const headline = on("headline") && data ? headlineTiles(figures, dashboard.headline, { holdingsOn, series: !!series?.nav.length, markets: !!book?.markets, yearOn }) : [];
  const { missing, fromMethodology } = base;
  // A section of returns and risk alone is drawn on Performance when that screen is on (lib/screens.ts readsSeriesOnly);
  // one that lists the holdings one by one or class by class, or measures what the book is made of, is left to Holdings (readsByHolding, readsComposition);
  // one with a figure over the market indicators is drawn on Markets, which is named after it, so the Dashboard leaves it out while Markets is on (marketSections; Hamza, 18 Oct 2026).
  const onMarkets = ws.screens.includes("markets") ? new Set(marketSections(m).map((s) => s.label)) : new Set<string>();
  const sections = dashboard.sections.filter((s) => !(ws.screens.includes("performance") && readsSeriesOnly(m, s)) && !(holdingsOn && (readsByHolding(m, s) || readsComposition(m, s))) && !(s.kind === "figures" && onMarkets.has(s.label)));
  const watching = (data?.signals ?? []).filter((s) => s.status === "amber");
  // All portfolios together, each under its own methodology: the combined view has no verdict, so each portfolio's is read under its name.
  const byPortfolio = data && ws.portfolios.mode === "each" && !ws.lens && ws.fullBook ? perPortfolio(ws.portfolios, null, ws.fullBook).map((p) => ({ ...p, counts: p.methodology ? findingCounts(evaluate(p.methodology, p.book, today, setup.inputs)) : null })) : [];
  // The verdict first (Hamza, 4 Nov 2026): Resonance from the methodology's own checks, the decisions the to-do and the new trades ask for; with no confirmed methodology, what it waits for.
  const resonance: ResonanceState | null = byPortfolio.length
    ? { kind: "waits", words: "Each portfolio is read under its own methodology, below; choose one at the top for its Resonance." }
    : !m
      ? ws.draft
        ? { kind: "waits", words: "Waits for you to confirm your methodology.", href: "/methodology", action: "Confirm it on Methodology" }
        : { kind: "waits", words: "Waits for a confirmed methodology: the rules it reads your book against.", href: "/setup#methodology", action: "Choose one on Setup" }
      : data
        ? { kind: "read", r: resonanceOf(data.findings, data.todo, data.notices), owedHref: ws.screens.includes("todo") ? "/todo" : "/notifications" }
        : null;
  // Through one portfolio, a value series that spans other accounts is left out (lib/portfolios.ts, scopeBook).
  const splitOff = !!ws.lens && !!ws.fullBook?.series?.nav.length && !ws.book?.series?.nav.length;
  const listedAsOf = (book?.holdings ?? []).reduce<string | null>((d, h) => (LISTED_FOR_DAY.has(h.assetClass) && (!d || h.asOf > d) ? h.asOf : d), null);
  // The book's last session: the session's read where it has come back; until then the holdings' own closes name the last session, so the tile is never blank (Hamza, 16 Oct 2026).
  const lastClose = session?.day?.session ?? (closes ? Object.values(closes.series).reduce<string | null>((best, pts) => { const d = sessionOf(pts, closedBy(new Date())); return d && (!best || d > best) ? d : best; }, null) : null);
  const mine = data && lastClose ? bookDay([...listed.values()], data.netWorth, lastClose, listedAsOf, session?.day ?? null, closes?.series ?? {}) : null;
  const ccy = setup.baseCurrency;
  // Each holding's class, the filings' fields the grid's tabs read and the person's own valuation, as Holdings reads them.
  const grid: PortfolioGridProps | null = gridOn && book && data ? {
    positions: positionsOf(closes ? withCloses(book, closes) : book),
    extras: Object.fromEntries(data.weights.map((w): [string, GridExtra] => {
      const values: Record<string, number | null> = { ...(ws.filings?.bySymbol[w.symbol.toUpperCase()]?.values ?? {}), ...(w.holdings[0]?.fundamentals ?? {}) };
      return [w.symbol.toUpperCase(), {
        classLabel: w.classId ? w.classLabel : null,
        fields: Object.fromEntries(GRID_FIELDS.map((f) => [f, values[f] ?? null])),
        own: w.holdings.find((h) => h.record?.ownValuation)?.record?.ownValuation ?? ws.records.bySymbol[w.symbol]?.ownValuation ?? ws.records.bySymbol[w.symbol.toUpperCase()]?.ownValuation ?? null,
      }];
    })),
    allocation: holdingView(m, data.mix, data.weights, ccy).slices,
    ccy,
    worthRange: book.series?.nav.length ? yearRange(data.netWorth, book.series.nav, book.asOf) : null,
    bookWorth: data.netWorth,
    fairHref: holdingsOn ? "/holdings#fair-value" : null,
  } : null;
  const sources = setup.inputs.map((i) => INPUTS[i].label).join(", ");
  const cash = book ? cashShare(book) : 0;
  // How fresh each card is: the book's own, the market feed's, the last close's. The demo is a frozen snapshot, never stale.
  const closeFresh = lastClose ? (ws.mode === "demo" ? { ...freshness("close", lastClose, today), stale: false } : freshness("close", lastClose, today)) : null;
  const figFresh = { book: ws.fresh, markets: ws.mode === "demo" ? ws.fresh : book?.markets ? freshness("hourly", book.markets.asOf, today) : null };

  // The headline tiles as computed at the close; the page recomputes the ones a price moves in the browser while the market is open (components/live/live.tsx).
  // The dividend tiles, unless a headline figure already reads the dividends (Hamza, 19 Oct 2026: nothing said twice).
  const glance = data && book && slots.includes("dividend_glance") && !headline.some(readsDividends) ? dividendsOf(book, localDay()) : null;
  const tiles: HeadlineTile[] = data && book ? headline.map((f) => {
    const r = computeFigure(f, data.ctx, setup.inputs);
    const empty = splitOff && JSON.stringify(f.expr).includes('"of":"nav"') ? "The value series covers more than this portfolio; choose All portfolios for it" : "Nothing to measure yet";
    const text = r.kind !== "scalar" ? "n/a" : r.needs.length ? "n/a" : figureText(f, r.value, book.fx.base);
    const detail = r.kind !== "scalar" ? "Not a single number" : r.needs.length ? needsWords(r.needs, inputLabel) : r.value === null ? empty : f.about ?? null;
    // Each reading on its range, as on Markets (Hamza, 19 Oct 2026): the indicator's own, a series statistic's scale, or the rule's limit.
    const test = data.signals.find((sg) => sg.rule.test?.figure === f.id)?.rule.test ?? null;
    const range = r.kind === "scalar" && !r.needs.length ? figureRangeOf(f, r.value, { markets: book.markets?.rows ?? null, rule: test }) : null;
    return { id: f.id, label: f.label, text, detail, markets: readsMarkets(f), prices: readsPrices(f), figure: f, range, limit: test?.limit ?? null };
  }) : [];

  // What the browser needs to recompute those tiles at today's prices: the book without its value series, the methodology, the figures a price moves, the inputs. Nothing of it is kept or sent anywhere.
  const liveFigures: LiveFigures | null = ws.mode === "drive" && book && tiles.some((t) => t.prices) ? { book: { ...book, series: undefined }, methodology: m, figures: headline.filter(readsPrices), inputs: [...setup.inputs], today } : null;

  // After the close, What happened and the newsletters moved to At the Close, under Notifications (Hamza, 18 Oct 2026).
  // The session's cards (the indices, the book's day under them, the drivers, the heat map, the movers), in the live component so each turns live at the bell.
  const sessionProps = data && book && sessionOn ? {
    close: day,
    held,
    show: { indices: on("market_indices"), drivers: on("market_drivers"), heatmap: on("market_heatmap"), movers: on("market_movers") },
    intro: `${day ? `Last close ${longDate(day.session)}: ${b.up} of the S&P 500 rose, ${b.down} fell. While the US market is open each card shows the session so far.` : "Read once a session has closed, 16:20 in New York."}${session?.pending ? ` ${session.pending}` : ""}`,
  } : null;

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Dashboard" subtitle={book ? `Positions from ${sources}, ${longDate(book.asOf)} · ${fromMethodology ? `Shaped by ${m!.name}` : `${PROFILES[setup.profile].label}, no methodology yet`}` : `${PROFILES[setup.profile].label}, built from your inputs`} />
      <PageBody>
        {ws.error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{ws.error}</p> : null}
        {book && ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={book.asOf} /> : null}
        {resonance ? <ResonanceLine state={resonance} /> : null}

        {!book || !data ? (
          <EmptyState
            icon={Inbox}
            title="No figures yet"
            instruction={`They appear here as ${sources} connect${ws.modules.includes("statements") ? " and the first statements arrive" : ""}.`}
            action={
              <Link href="/setup" className={buttonStyles({ variant: "secondary" })}>
                See what to connect
              </Link>
            }
          />
        ) : (
          <>
            <div data-tour="headline">
              <BookNow
                subjects={liveSubjects(data.weights)}
                netWorth={data.netWorth}
                worthRange={book.series?.nav.length ? yearRange(data.netWorth, book.series.nav, book.asOf) : null}
                ccy={ccy}
                cashPct={cash}
                close={mine && mine.rows.length ? mine : null}
                bookFresh={ws.fresh}
                closeFresh={closeFresh}
                waiting={listed.size ? (session?.pending ? "Being read; it appears in a moment." : "Read after the US close.") : "No listed holdings to price."}
                live={ws.mode === "drive"}
                headline={tiles}
                headlineFresh={figFresh}
                liveFigures={liveFigures}
                year={yearOn ? year : null}
                yearFresh={ws.fresh}
                chart={on("return_chart") ? returnChartData(book, [...new Set([...HEADLINE_BENCHMARKS, ...benchmarksOf(m)])]) : null}
                session={sessionProps}
                dayOn={dayOn}
                grid={grid}
                beforeChart={glance ? (
                  <section className="mb-8" aria-label="Dividends">
                    <h2 className="section-header mb-3 px-1">Dividends</h2>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <DividendTiles d={glance} ccy={ccy} link />
                    </div>
                  </section>
                ) : null}
              />
            </div>
            {session?.pending ? <RefreshWhilePending /> : null}

            {byPortfolio.length ? (
              <ListSection header="Each portfolio under its own methodology" footer="Switch to a portfolio at the top to see its rules, caps and sections." className="mb-8">
                {byPortfolio.map((p) => (
                  <ListRow
                    key={p.portfolio.id}
                    wrap
                    label={p.portfolio.name}
                    detail={p.counts ? `${p.methodology!.name}: ${p.counts.breaches} breach${p.counts.breaches === 1 ? "" : "es"}, ${p.counts.outside} outside guideline, ${p.counts.tripped} watch${p.counts.tripped === 1 ? "" : "es"} tripped, ${p.counts.pass} within.` : "No methodology of its own yet."}
                  />
                ))}
              </ListSection>
            ) : null}

            {/* What needs a decision is on Notifications; the rule checks are on Methodology and the weights against caps on Holdings (Hamza, 15 Oct 2026); the caps at today's prices left the Dashboard (Hamza, 18 Oct 2026). */}
            {on("todo") && data.todo.length ? (
              <ListSection grid header={`Methodology to-do · ${data.todo.length}`} footer={<Link href="/todo" className="text-accent-text">The whole list, with what done looks like</Link>} className="mb-8">
                {data.todo.slice(0, 4).map((t) => (
                  <ListLinkRow key={t.key} href={t.href as Route} leading={<ListChecks className={`mt-0.5 size-5 shrink-0 ${t.group === "now" ? "text-danger" : t.group === "due" ? "text-warn" : "text-text-tertiary"}`} aria-hidden />} label={t.title} detail={t.why} />
                ))}
              </ListSection>
            ) : null}

            {/* CNN's fear and greed index on a gauge, above On watch (Hamza, 16 Oct 2026). */}
            {on("fear_greed") && book.markets ? <FearGreedCard series={book.markets.series.FEARGREED ?? []} problem={book.markets.problems.find((p) => /fear/i.test(p)) ?? null} badge={figFresh.markets ? <FreshBadge compact fresh={figFresh.markets} /> : null} /> : null}

            {on("on_watch") && watching.length ? (
              <ListSection grid header={`On watch · ${watching.length} amber`} footer={<Link href="/signals" className="text-accent-text">All {data.signals.length} signals</Link>} className="mb-8">
                {watching
                  .slice(0, 8)
                  .map((s) => (
                    <ListLinkRow
                      key={s.key}
                      href={(s.symbol ? `/holdings/${encodeURIComponent(s.symbol)}` : "/signals") as Route}
                      leading={<Siren className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />}
                      label={s.symbol ? <><span className="data mr-2">{s.symbol}</span>{s.rule.text}</> : s.rule.text}
                      detail={`${s.reading ? `Reading ${s.reading} against ${s.limit ?? "the limit"} · ` : ""}${s.rule.section}`}
                    />
                  ))}
              </ListSection>
            ) : null}
            {on("latest_review") ? (
              <ListSection header="Latest review" className="mb-8">
                {latest ? (
                  <ListLinkRow href="/reports" leading={<Presentation className="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden />} label={latest.title} detail={latest.summary} value={<span className="data text-text-secondary">{latest.asOf}</span>} />
                ) : (
                  <ListLinkRow href="/reports" leading={<Presentation className="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden />} label="Reviews" detail={ws.mode === "demo" ? "The demo\u2019s last weekly and monthly are on Reviews, built on each visit." : "No review built yet. The schedule is on the Reviews screen."} />
                )}
              </ListSection>
            ) : null}
            {on("sections") ? (
              <>
                {/* The holdings donut sits on Holdings and Performance; only with neither does it keep a place here. */}
                {!ws.screens.includes("performance") && !ws.screens.includes("holdings") && !sections.some((s) => s.kind === "panel" && s.id === "holdings") ? <DashboardSection id="holdings" view="chart" ctx={panelCtx()} /> : null}
                {sections.map((s, i) =>
                  s.kind === "figures" ? (
                    <FiguresSection key={`${s.label}-${i}`} section={s} figures={figures} ctx={data.ctx} inputs={setup.inputs} omit={headline.map((f) => f.id)} fresh={figFresh} markets={book?.markets?.rows ?? null} signals={data.signals} />
                  ) : (
                    <DashboardSection key={`${s.id}-${i}`} id={s.id} view={s.view} ctx={panelCtx()} />
                  ),
                )}
              </>
            ) : null}
            {missing.length ? (
              <div className="mb-8 rounded-card bg-surface-2 px-4 py-3 text-footnote text-text-secondary">
                Your methodology also asks for {missing.map((id) => PANELS[id].label).join(", ")}. Add {missing.map((id) => (FILLS[id] ? INPUTS[FILLS[id]!].label : PANELS[id].label)).join(", ")} in{" "}
                <Link href="/setup" className="text-accent-text">
                  Setup
                </Link>{" "}
                to fill {missing.length > 1 ? "them" : "it"}.
              </div>
            ) : null}
            {!m ? (
              <Link href="/methodology" className="mb-8 flex items-center gap-3 rounded-card border border-dashed border-hairline px-4 py-3 text-subhead hover:bg-surface-2">
                <FileUp className="size-5 shrink-0 text-accent-text" aria-hidden />
                <span>
                  <span className="block text-body">Attach or build your methodology</span>
                  <span className="block text-footnote text-text-secondary">Every screen is rebuilt around it: its caps, its classes, its rules, its benchmarks.</span>
                </span>
              </Link>
            ) : null}
            {waiting.length ? <p className="mb-6 px-1 text-footnote text-text-tertiary">Not connected yet: {waiting.map((i) => INPUTS[i].label).join(", ")}.</p> : null}
          </>
        )}
        {on("your_data_today") ? <YourData file={ws.customData} screen="today" demo={ws.mode === "demo"} /> : null}
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );

  function panelCtx() {
    return { book: book!, today, themes: dashboard.themes, watch: ws.propertyWatch, classOf: data!.ctx.classOf, classLabel: (id: string) => m?.classes.find((x) => x.id === id)?.label ?? id };
  }
}
