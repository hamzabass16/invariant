import { CATEGORY_HUES } from "@/lib/asset-classes";
import { companyHref } from "@/lib/company";
import { Inbox } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import Link from "next/link";
import type { Route } from "next";
import { YourData } from "@/components/custom-data/your-data";

import { CapLabel, ClassTag, WeightBar } from "@/components/app/figures";
import { Cited } from "@/components/ui/cite";
import { CorrelationMatrixChart } from "@/components/charts/correlation-matrix";
import { FiguresSection } from "@/components/dashboard/sections";
import { regionView } from "@/components/holdings/revenue-geography";
import { ConcentrationCard } from "@/components/performance/concentration";
import { PortfolioPeCard } from "@/components/holdings/portfolio-pe";
import { FairValueCard } from "@/components/holdings/fair-value";
import { ValueMapCard } from "@/components/holdings/value-map";
import { IncomeFlowChart } from "@/components/charts/income-flow";
import { flowFromSeries, lookThroughFlow } from "@/lib/income-flow";
import { WhatEachMade } from "@/components/holdings/what-made";
import { MADE_WINDOWS, whatEachMade, type MadeWindow } from "@/lib/holding-made";
import { fillsOf } from "@/lib/trades";
import { FreshBadge } from "@/components/ui/freshness";
import { ClassRegister } from "@/components/holdings/class-register";
import { assetClassView, classView, currencyView, holdingView } from "@/components/holdings/portfolio-donuts";
import { DonutTabs, type DonutView } from "@/components/charts/donut-tabs";
import { LivePositionsTable } from "@/components/holdings/live-positions";
import { WhereMoneyIs } from "@/components/holdings/where-money-is";
import { SampleNote } from "@/components/app/sample-note";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { classRegister } from "@/lib/class-register";
import { correlationMatrix, DEFAULT_MATRIX_BENCHMARKS, MATRIX_WINDOW_WORDS, MATRIX_WINDOWS, matrixSeries, type MatrixWindow } from "@/lib/correlation";
import { fairValueBook } from "@/lib/fair-value";
import { money } from "@/lib/holdings";
import { withCloses } from "@/lib/markets";
import { loadCloses } from "@/lib/markets-feed";
import { cashShare } from "@/lib/performance";
import { positionsOf } from "@/lib/positions";
import { CORRELATION_MIN_WEIGHT } from "@/lib/review";
import { LISTED_FOR_DAY, ownerValueOf } from "@/lib/ontology";
import { deriveScreens } from "@/lib/screen-data";
import { dashboardFor } from "@/lib/methodology";
import { dashboardWith } from "@/lib/preferences";
import { benchmarksOf, capTone, filtersOnClass, readsByHolding, readsComposition, repeatsConcentration, SIGNAL_LABEL, SIGNAL_TONE, worstSignal, type Weight } from "@/lib/screens";
import { freshness } from "@/lib/freshness";
import { SECTOR_BASIS } from "@/lib/sectors";
import { fundLookThrough, sectorsLookingThrough, type SectorShare } from "@/lib/exposure";
import { portfolioPe } from "@/lib/portfolio-pe";
import { localDay, longDate } from "@/lib/time";
import { VALUE_MAP_BASES, valueMap, type ValueMapBasis } from "@/lib/value-map";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Holdings · Invariant" };

// Seven sector hues in a fixed order, the rest folded into one slice; what has no sector yet is neutral.
const SECTOR_HUES = CATEGORY_HUES;

const pct1 = (x: number) => `${x.toFixed(1)}%`;
/** Who makes up a sector: its holdings, then the funds it is reached through. */
const sectorGroup = (x: SectorShare) => [...x.symbols, ...x.funds.map((f) => `through ${f}`)].join(", ");
const sectorDetail = (x: SectorShare) => (x.throughFunds > 0.05 ? `${pct1(x.weight)}, ${pct1(x.throughFunds)} through funds${x.estimated > 0.05 ? ` (${pct1(x.estimated)} estimated)` : ""}` : pct1(x.weight));

function sectorSlices(sectors: SectorShare[]) {
  const named = sectors.filter((x) => x.sector !== "No sector yet");
  const none = sectors.find((x) => x.sector === "No sector yet");
  const top = named.slice(0, SECTOR_HUES.length);
  const rest = named.slice(SECTOR_HUES.length);
  return [
    ...top.map((x, i) => ({ key: x.sector, label: x.sector, value: x.weight, color: SECTOR_HUES[i], group: sectorGroup(x), detail: sectorDetail(x) })),
    ...(rest.length ? [{ key: "other", label: `${rest.length} more sectors`, value: rest.reduce((t, x) => t + x.weight, 0), color: "var(--text-tertiary)", group: rest.map((x) => x.sector).join(", "), detail: "" }] : []),
    ...(none ? [{ key: "none", label: none.sector, value: none.weight, color: "var(--arch-none)", group: sectorGroup(none), detail: sectorDetail(none) }] : []),
  ];
}

/** Price against the owner's base valuation, as a signed percentage; null without both. */
function premium(w: Weight): number | null {
  const h = w.holdings[0];
  const base = h.record?.ownValuation?.base;
  return base && h.price ? (h.price / base - 1) * 100 : null;
}

/**
 * Holdings, pies first (Hamza, 15 Oct 2026): the portfolio by holding and by
 * class, the positions, every holding grouped by the class the methodology
 * gives it against its cap, how the holdings move together, concentration,
 * revenue by region, the methodology's composition figures, the
 * Classification Register, sectors and where the money is. Every card says
 * how fresh it is; prices now are on the Dashboard.
 */
export default async function HoldingsPage({ searchParams }: { searchParams: Promise<{ corr?: string; made?: string; vm?: string }> }) {
  const sp = await searchParams;
  const corrWindow: MatrixWindow = MATRIX_WINDOWS.includes(sp.corr as MatrixWindow) ? (sp.corr as MatrixWindow) : "3M";
  const madeWindow: MadeWindow = MADE_WINDOWS.includes(sp.made as MadeWindow) ? (sp.made as MadeWindow) : "year";
  const mapBasis: ValueMapBasis = VALUE_MAP_BASES.includes(sp.vm as ValueMapBasis) ? (sp.vm as ValueMapBasis) : "projected";
  const ws = await screen("overview");
  const { setup, book } = ws;
  const today = localDay();
  const ccy = setup.baseCurrency;
  if (!book) {
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Holdings" />
        <PageBody>
          <EmptyState icon={Inbox} title="No holdings yet" instruction="They appear here once an input is connected." action={<Link href="/setup" className={buttonStyles({ variant: "secondary" })}>See what to connect</Link>} />
        </PageBody>
      </>
    );
  }
  const data = deriveScreens({ book, methodology: setup.methodology, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const groups = ws.shown.classes ? data.mix.filter((c) => c.count > 0).map((c) => ({ key: c.classId ?? c.kind, header: `${c.label} · ${c.weight.toFixed(1)}%${c.cap ? ` · ${c.cap.cap}% cap each` : ""}`, rows: c.kind === "cash" ? [] : data.weights.filter((w) => w.classId === c.classId), cash: c.kind === "none" ? [] : book.holdings.filter((h) => (h.assetClass === "cash" || h.assetClass === "deposit") && data.ctx.classOf(h) === c.classId) })) : [{ key: "all", header: `${data.weights.length} holdings`, rows: data.weights, cash: book.holdings.filter((h) => h.assetClass === "cash" || h.assetClass === "deposit") }];
  const hasCaps = ws.shown.caps;
  const slots = data.slots("holdings");
  const classes = setup.methodology?.classes ?? [];
  const register = slots.includes("class_register") && classes.length && data.weights.length ? classRegister(classes, data.weights.map((w) => ({ symbol: w.symbol, name: w.name, weight: w.weight, holding: w.holdings[0] })), data.ctx) : null;
  // How the holdings move together: the listed holdings of at least 1% by weight, then the benchmarks, from the price feed's daily closes.
  const listed = data.weights.filter((w) => w.weight >= CORRELATION_MIN_WEIGHT && (w.holdings[0]?.assetClass === "equity" || w.holdings[0]?.assetClass === "etf")).map((w) => w.symbol);
  const named = benchmarksOf(setup.methodology);
  const benches = [...named, ...DEFAULT_MATRIX_BENCHMARKS.filter((b) => !named.includes(b))];
  // The positions table reads every listed holding's closes; the matrix only those of 1% or more. One read serves both.
  const positionsOn = slots.includes("positions");
  const peOn = slots.includes("portfolio_pe");
  const equities = data.weights.filter((w) => w.holdings[0]?.assetClass === "equity");
  const madeOn = slots.includes("what_made");
  // What each holding made over the past year needs a close a year ago for every holding held then, sold ones included.
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const soldThisYear = madeOn && madeWindow === "year" ? fillsOf(book).filter((f) => f.date > yearAgo && f.side === "sell").map((f) => f.symbol) : [];
  const tickers = [...new Set([...(slots.includes("correlation") ? listed : []), ...(peOn ? equities.map((w) => w.symbol) : []), ...(madeOn && madeWindow === "year" ? book.holdings.filter((h) => LISTED_FOR_DAY.has(h.assetClass)).map((h) => h.symbol) : []), ...soldThisYear, ...(positionsOn ? book.holdings.filter((h) => LISTED_FOR_DAY.has(h.assetClass)).map((h) => h.symbol) : [])])];
  const closes = tickers.length ? await loadCloses(tickers.join(","), today) : null;
  const priced = closes ? withCloses(book, closes) : book;
  const matrix = closes && slots.includes("correlation") && listed.length ? correlationMatrix(matrixSeries(priced, listed, benches), today, corrWindow) : null;
  const unread = [...(closes?.problems.filter((p) => listed.some((l) => p.startsWith(l))) ?? []), ...(matrix?.left.filter((l) => !closes?.problems.some((p) => p.startsWith(l.symbol))).map((l) => `${l.symbol}: ${l.why}.`) ?? [])];
  // Sectors look through the funds whose reports list their companies (Hamza, 19 Oct 2026: in place of the Themes list).
  const lookThrough = fundLookThrough(book);
  const sectors = sectorsLookingThrough(data.weights.map((w) => ({ symbol: w.symbol, weight: w.weight, sector: w.holdings[0]?.sector ?? null, ids: w.holdings.map((h) => h.id) })), lookThrough);
  const throughFunds = sectors.reduce((t, x) => t + x.throughFunds, 0);
  // The portfolio's P/E today and over the year, from the filings and the closes (lib/portfolio-pe.ts).
  const pe = peOn ? portfolioPe(equities.map((w) => ({ symbol: w.symbol, value: w.value, price: w.holdings[0]?.price ?? null, pe: w.holdings[0]?.fundamentals?.pe_ratio ?? null, epsTtm: ws.filings?.bySymbol[w.symbol.toUpperCase()]?.epsTtm ?? null, closes: priced.series?.holdings?.[w.symbol] ?? null })), today) : null;
  const made = madeOn ? whatEachMade(priced, madeWindow, today) : null;
  // Each listed holding's price against the base the person set on its thesis, and the book over them by value (lib/fair-value.ts; Hamza, 4 Nov 2026).
  const fair = slots.includes("fair_value") && equities.length ? fairValueBook(equities.map((w) => ({ symbol: w.symbol, name: w.name, value: w.value, price: w.holdings[0]?.price ?? null, currency: w.holdings[0]?.currency ?? null, own: w.holdings.find((h) => h.record?.ownValuation)?.record?.ownValuation ?? ws.records.bySymbol[w.symbol]?.ownValuation ?? ws.records.bySymbol[w.symbol.toUpperCase()]?.ownValuation ?? null })), today) : null;
  // Forward P/E against EPS growth for the holdings and the watchlist (lib/value-map.ts).
  const filingOf = (sym: string) => ws.filings?.bySymbol[sym.toUpperCase()];
  const epsOf = (sym: string) => {
    const e = filingOf(sym);
    return e?.perShareTtm?.length && e.perShareTtm.length >= (e.epsTtm?.length ?? 0) ? e.perShareTtm : (e?.epsTtm ?? null);
  };
  const heldSymbols = new Set(equities.map((w) => w.symbol));
  const vmap = slots.includes("value_map")
    ? valueMap(
        [
          ...equities.map((w) => ({ symbol: w.symbol, name: w.name, held: true, weight: w.weight, values: { ...(filingOf(w.symbol)?.values ?? {}), ...(w.holdings[0]?.fundamentals ?? {}) }, consensus: filingOf(w.symbol)?.consensus, eps: epsOf(w.symbol) })),
          ...Object.keys(ws.records.bySymbol)
            .map((s) => s.toUpperCase())
            .filter((s) => !heldSymbols.has(s) && !book.holdings.some((h) => h.symbol.toUpperCase() === s))
            .map((s) => ({ symbol: s, name: filingOf(s)?.name ?? s, held: false, weight: null, values: filingOf(s)?.values ?? null, consensus: filingOf(s)?.consensus, eps: epsOf(s) })),
        ],
        today,
      )
    : null;
  // The book as an income statement: each listed holding's share of its company's twelve months, summed (lib/income-flow.ts lookThroughFlow; Hamza, 5 Nov 2026).
  const bookFlowRaw = slots.includes("book_flow") && equities.length
    ? lookThroughFlow(
        equities.map((w) => {
          const e = filingOf(w.symbol);
          const clean = e && !e.error ? e : null;
          return { symbol: w.symbol, value: w.value, psRatio: w.holdings[0]?.fundamentals?.ps_ratio ?? clean?.values.ps_ratio ?? null, flow: clean?.flows?.ttm ?? flowFromSeries(clean?.years, "ttm", clean?.perShareCurrency ?? null, clean?.segmentHistory) };
        }),
      )
    : null;
  const bookFlow = bookFlowRaw ? { ...bookFlowRaw, currency: ccy } : null;
  const spxYield = book.markets?.rows.find((r) => r.symbol === "SPXEY")?.level ?? null;
  // What the book is made of, as the methodology measures it (lib/screens.ts readsComposition), less what the pies and the register already draw.
  const base = dashboardFor(setup.profile, ws.modules, setup.methodology);
  const { figures, dashboard } = dashboardWith(base.figures, base.dashboard, ws.preferences);
  const composition = slots.includes("holdings_sections") ? dashboard.sections.filter((s): s is Extract<typeof s, { kind: "figures" }> => s.kind === "figures" && readsComposition(setup.methodology, s) && !readsByHolding(setup.methodology, s) && !repeatsConcentration(setup.methodology, s)) : [];
  const drawnElsewhere = figures.filter((f) => !!f.by || filtersOnClass(f)).map((f) => f.id);
  // One donut card with a tab per view the methodology switches on (Hamza, 19 Oct 2026: in place of a donut each).
  const views: DonutView[] = [
    slots.includes("by_holding") ? holdingView(setup.methodology, data.mix, data.weights, ccy) : null,
    slots.includes("by_class") ? classView(setup.methodology, data.mix, cashShare(book)) : null,
    slots.includes("allocation") ? assetClassView(book) : null,
    slots.includes("holdings_by_sector") && sectors.length
      ? {
          key: "sectors",
          tab: "Sectors",
          title: "Sectors",
          subtitle: `Weight of the holdings by sector, looking through funds: ${SECTOR_BASIS}. A fund whose report lists its companies counts toward their sectors at its share of each${throughFunds > 0.05 ? ` (${pct1(throughFunds)} of net worth is reached through funds)` : ""}; a holding with no filing read yet is "No sector yet".`,
          slices: sectorSlices(sectors),
          legend: sectorSlices(sectors).map((x) => ({ label: x.label, color: x.color, kind: "rect" as const })),
          centre: { value: String(sectors.filter((x) => x.sector !== "No sector yet").length), label: "sectors" },
          tableCaption: "Weight of the holdings by sector, looking through funds",
          tableHead: ["Sector", "Weight", "Holdings", "Weight"],
        }
      : null,
    slots.includes("revenue_regions") ? regionView(book) : null,
    slots.includes("allocation") ? currencyView(book) : null,
  ].filter((v): v is DonutView => v !== null);
  // Every card says how fresh it is: the book's own, or the price feed's closes for the matrix.
  const bookBadge = ws.fresh ? <FreshBadge compact fresh={ws.fresh} /> : null;
  // The value map and the register read the filings, fetched every morning (Hamza, 27 Oct 2026: the value map said the statement's "Uploaded").
  const filingsBadge = ws.mode === "demo" ? bookBadge : ws.filings?.updated ? <FreshBadge compact fresh={freshness("daily", ws.filings.updated.slice(0, 10), today)} /> : bookBadge;
  const closesBadge = ws.mode === "demo" ? bookBadge : closes ? <FreshBadge compact fresh={freshness("close", closes.asOf, today)} /> : null;

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Holdings" subtitle={`${data.weights.length} holding${data.weights.length === 1 ? "" : "s"}${ws.shown.classes ? ", grouped by class" : ""} · ${money(data.netWorth, ccy)} net worth`} />
      <PageBody>
        {ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={book.asOf} /> : null}
        {views.length ? <DonutTabs id="composition" views={views} badge={bookBadge} /> : null}
        {/* Live while the US market is open, from the same feed as the Dashboard; shut, Live with "Markets have closed" beside it (Hamza, 16 Oct 2026). */}
        {positionsOn ? <LivePositionsTable positions={positionsOf(priced)} ccy={ccy} symbols={book.holdings.filter((h) => LISTED_FOR_DAY.has(h.assetClass)).map((h) => h.symbol)} live={ws.mode === "drive"} fresh={ws.mode === "demo" ? ws.fresh : closes ? freshness("close", closes.asOf, today) : ws.fresh} /> : null}
        {fair ? <FairValueCard book={fair} ccy={ccy} badge={closesBadge ?? bookBadge} /> : null}
        {pe ? <PortfolioPeCard pe={pe} spx={spxYield && spxYield > 0 ? 100 / spxYield : null} badge={closesBadge ?? bookBadge} /> : null}
        {vmap && (vmap.points.length || vmap.missing.length) ? <ValueMapCard map={vmap} basis={mapBasis} hrefFor={(b) => `/holdings?vm=${b}${sp.made ? `&made=${sp.made}` : ""}${sp.corr ? `&corr=${sp.corr}` : ""}#value-map`} badge={filingsBadge} /> : null}
        {made ? <WhatEachMade made={made} ccy={ccy} hrefFor={(w) => `/holdings?made=${w}${sp.corr ? `&corr=${sp.corr}` : ""}#what-made`} badge={madeWindow === "year" ? (closesBadge ?? bookBadge) : bookBadge} /> : null}
        {bookFlow ? (
          <section id="book-flow" className="mb-8 scroll-mt-20">
            <IncomeFlowChart title="Where your share of the revenue goes" badge={filingsBadge} subtitle="Each listed holding's share of its company's past twelve months, sized by what you hold over its price to sales, summed: revenue by holding to gross profit, operating income and net income. From the SEC filings; what you would own of each line if the book were one company." views={[{ key: "ttm", word: "Twelve months", flow: bookFlow }]} />
          </section>
        ) : null}
        {groups.map((g) => (
          // The caps this group's weights are read against, cited in the margin from 1024px (Hamza, 4 Nov 2026).
          <Cited key={g.key} cites={hasCaps ? g.rows.flatMap((w) => (w.cap ? [{ section: w.cap.rule.section, about: w.cap.figure.label }] : [])) : []}>
          <ListSection grid header={g.header} trailing={bookBadge} className="mb-6">
            {g.rows.map((w) => {
              const sig = worstSignal(data.signals, w.symbol);
              const prem = premium(w);
              const h = w.holdings[0];
              return (
                <Link key={w.symbol} href={companyHref(w.symbol) as Route} className="block px-4 py-3 transition-colors active:bg-surface-2">
                  <div className="flex items-baseline gap-2">
                    <span className="data font-semibold">{w.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-subhead text-text-secondary">{w.name}</span>
                    {sig && (sig.status === "red" || sig.status === "amber") ? <StatusPill tone={SIGNAL_TONE[sig.status]}>{SIGNAL_LABEL[sig.status]}</StatusPill> : null}
                    <span className="ml-auto whitespace-nowrap">{hasCaps ? <CapLabel weight={w.weight} cap={w.cap?.cap ?? null} tone={capTone(w.state)} /> : <span className="data">{w.weight.toFixed(2)}%</span>}</span>
                  </div>
                  {hasCaps ? (
                    <div className="mt-2">
                      <WeightBar weight={w.weight} cap={w.cap?.cap ?? null} scale={data.scale} tone={capTone(w.state)} />
                    </div>
                  ) : null}
                  <div className="data mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-secondary">
                    {ws.shown.classes ? <ClassTag label={w.classId ? w.classLabel : null} /> : null}
                    <span>{money(w.value, ccy)}</span>
                    {h.price !== null ? <span>{h.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} {h.currency}</span> : null}
                    {prem !== null ? <span className={prem > 0 ? "text-warn" : "text-ok"}>{prem > 0 ? "+" : ""}{prem.toFixed(1)}% vs own valuation</span> : null}
                    {w.holdings.length > 1 ? <span>{w.holdings.length} accounts</span> : null}
                  </div>
                </Link>
              );
            })}
            {g.cash.map((h) => (
              <ListRow key={h.id} label={h.name} detail={`${h.assetClass === "deposit" ? "Deposit" : "Cash"} in ${h.account}`} value={<span className="data">{money(ownerValueOf(h, book), ccy)}</span>} />
            ))}
          </ListSection>
          </Cited>
        ))}
        {!data.weights.length ? <ListSection><div className="px-4 py-3 text-subhead text-text-secondary">Only cash so far.</div></ListSection> : null}
        {slots.includes("correlation") && listed.length ? (
          matrix ? (
            <div className="mb-8">
              <CorrelationMatrixChart
                matrix={matrix}
                badge={closesBadge}
                windows={MATRIX_WINDOWS.map((w) => ({ key: w, href: `/holdings?corr=${w}${sp.made ? `&made=${sp.made}` : ""}`, current: w === corrWindow }))}
                subtitle={`Daily returns over ${MATRIX_WINDOW_WORDS[matrix.window]}, ${matrix.sessions} sessions to ${longDate(matrix.to)}. Holdings of 1% or more, then ${benches.join(", ").replace(/, ([^,]*)$/, " and $1")}.${matrix.average !== null ? ` Holdings move together at ${matrix.average.toFixed(2)} on average.` : ""}`}
              />
              {unread.length ? <p className="mt-2 px-4 text-footnote text-text-secondary">Left out: {unread.join(" ")}</p> : null}
            </div>
          ) : (
            <ListSection header="How the holdings move together" className="mb-8">
              <ListRow wrap label={`Needs daily closes for at least two of the listed holdings and the benchmarks over ${MATRIX_WINDOW_WORDS[corrWindow]}. ${closes?.problems.length ? closes.problems.join(" ") : ""}`.trim()} />
            </ListSection>
          )
        ) : null}
        {slots.includes("concentration") ? <ConcentrationCard weights={data.weights} badge={bookBadge} /> : null}
        {composition.map((s, i) => (
          <FiguresSection key={`${s.label}-${i}`} section={s} figures={figures} ctx={data.ctx} inputs={setup.inputs} omit={drawnElsewhere} fresh={{ book: ws.fresh, markets: null }} />
        ))}
        {register ? <ClassRegister register={register} badge={filingsBadge} /> : null}
        {slots.includes("allocation") ? <WhereMoneyIs book={book} badge={bookBadge} /> : null}
        {slots.includes("your_data_holdings") ? <YourData file={ws.customData} screen="holdings" demo={ws.mode === "demo"} /> : null}
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
