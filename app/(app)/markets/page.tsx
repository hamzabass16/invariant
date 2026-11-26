import { Globe } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { FreshBadge } from "@/components/ui/freshness";
import { freshness } from "@/lib/freshness";
import type { Route } from "next";
import { YourData } from "@/components/custom-data/your-data";

import { NoFigures } from "@/components/app/no-figures";
import { LineChart } from "@/components/charts/line-chart";
import { FiguresSection } from "@/components/dashboard/sections";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { CurveChart } from "@/components/markets/curve";
import { EconomiesMap } from "@/components/markets/economies-map";
import { NextOnCalendar } from "@/components/markets/econ-calendar";
import { OddsCard } from "@/components/markets/odds-card";
import { CreditStressCard } from "@/components/markets/credit-stress";
import { creditStress } from "@/lib/credit-stress";
import { signedPct } from "@/lib/market-day";
import { cadenceOf, formatChange, formatLevel, MARKETS, marketDef, monthsBefore, type MarketPoint, type MarketRow } from "@/lib/markets";
import { loadEconomies, loadOdds } from "@/lib/markets-feed";
import { deriveScreens } from "@/lib/screen-data";
import { marketsTitle, marketSections, marketSymbolsOf, readsMarkets, SIGNAL_LABEL, SIGNAL_TONE, type Signal } from "@/lib/screens";
import { localDay, daysBetween, longDate } from "@/lib/time";
import { screen, screenerFor } from "@/lib/workspace";

export const metadata = { title: "Macro · Invariant" };

/** The world chart: the S&P 500 against developed, developed outside the US, and emerging markets, from one start. */
const WORLD = [
  { symbol: "SPY", label: "S&P 500", color: "var(--series-spy)" },
  { symbol: "DM", label: "Developed markets", color: "var(--series-hcmp)" },
  { symbol: "DMXUS", label: "Developed excluding the US", color: "var(--series-qqq)" },
  { symbol: "EM", label: "Emerging markets", color: "var(--arch-cm)" },
] as const;
const ABROAD = ["FTSE", "DAX", "N225", "NIFTY", "SSEC"] as const;

/** Series over their common dates, each divided by its first value and times 100. */
function indexed(series: Record<string, { date: string; value: number }[]>, symbols: readonly string[], sessions = 252) {
  const sets = symbols.map((s) => new Map((series[s] ?? []).map((p) => [p.date, p.value])));
  const present = symbols.filter((s) => (series[s] ?? []).length > 1);
  const dates = [...new Set(symbols.flatMap((s) => (series[s] ?? []).map((p) => p.date)))].filter((d) => sets.every((m, i) => !present.includes(symbols[i]) || m.has(d))).sort().slice(-sessions);
  return { dates, values: symbols.map((s, i) => (present.includes(s) && dates.length ? dates.map((d) => Math.round(((sets[i].get(d) as number) / (sets[i].get(dates[0]) as number)) * 1000) / 10) : [])) };
}

/** The last `years` of a series by the calendar. */
function lastYears(pts: readonly MarketPoint[], years: number): MarketPoint[] {
  const last = pts[pts.length - 1];
  if (!last) return [];
  const from = monthsBefore(last.date, years * 12);
  return pts.filter((p) => p.date > from);
}

/** A year of an indicator: the last 252 sessions of a daily one, the last calendar year of a weekly or monthly one. */
function yearOf(symbol: string, pts: readonly MarketPoint[]): MarketPoint[] {
  const def = marketDef(symbol);
  return def && cadenceOf(def) !== "daily" ? lastYears(pts, 1) : pts.slice(-252);
}

/**
 * Series of different cadences on the dates of the first: each value the
 * last reading on or before that date, so a monthly figure holds until the
 * next month's, as it was known then.
 */
function aligned(series: Record<string, MarketPoint[]>, symbols: readonly string[], years: number) {
  const dates = lastYears(series[symbols[0]] ?? [], years).map((p) => p.date);
  return {
    dates,
    values: symbols.map((s) => {
      const pts = series[s] ?? [];
      let i = -1;
      return dates.map((d) => {
        while (i + 1 < pts.length && pts[i + 1].date <= d) i++;
        return i >= 0 ? pts[i].value : null;
      });
    }),
  };
}

/** A small chart of one indicator over a span, titled with its level and its change over the span. */
function Small({ symbol, pts, row, span, format, baseline = null, badge }: { symbol: string; pts: MarketPoint[]; row: MarketRow | undefined; span: string; format: "pct1" | "num2" | "int"; baseline?: number | null; badge?: React.ReactNode }) {
  const def = marketDef(symbol);
  if (!def || pts.length < 2) return null;
  return (
    <LineChart
      badge={badge}
      title={`${def.name} · ${row ? formatLevel(row.level, row.unit) : ""}`}
      subtitle={`${span}, to ${longDate(pts[pts.length - 1].date)}. ${def.about}`}
      dates={pts.map((p) => p.date)}
      series={[{ key: symbol, label: def.name, color: "var(--series-hcmp)", values: pts.map((p) => p.value) }]}
      format={format}
      height={160}
      baseline={baseline}
      tableCaption={`${def.name} by ${cadenceOf(def) === "monthly" ? "month" : cadenceOf(def) === "weekly" ? "week" : "day"}`}
      tableEvery={pts.length > 120 ? 10 : pts.length > 60 ? 4 : 1}
    />
  );
}

// One hue per line, from the benchmark and archetype hues; status colours are never series.
const LINE_COLORS = ["var(--series-spy)", "var(--series-qqq)", "var(--arch-cm)", "var(--arch-tr)", "var(--arch-dg)", "var(--accent-text)"];

const formatFor = (unit: MarketRow["unit"]) => (unit === "pct" ? "num2" : unit === "money" ? "usd" : unit === "ratio" ? "ratio" : "num2");

/** "reading · limit · section", skipping what the signal does not have. */
const readingLine = (s: Signal) => [s.reading, s.limit ? `limit ${s.limit}` : null, s.rule.section].filter(Boolean).join(" · ");

/**
 * The market indicators the methodology reads, titled after the section that
 * asks for them: the
 * methodology's own figures over them, its rules on them as signals, and a
 * year of each indicator it names. An indicator the feed could not read is a
 * sentence, never a zero.
 */
export default async function MarketsPage() {
  const ws = await screen("overview");
  const m = ws.setup.methodology;
  // The screen is Macro (Hamza, 19 Oct 2026); the methodology's own section name leads the line under it.
  const title = "Macro";
  const section = marketsTitle(m);
  const sectionLead = section !== title ? `${section} · ` : "";
  if (!ws.book)
    return (
      <>
        <PageHeader title={title} />
        <PageBody>
          <NoFigures what="Markets" />
        </PageBody>
      </>
    );
  const today = localDay();
  const markets = ws.book.markets;
  const data = deriveScreens({ book: ws.book, methodology: m, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("markets");
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  const sections = marketSections(m);
  const figs = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  const marketSignals = data.signals.filter((s) => {
    const f = s.rule.test ? figs.get(s.rule.test.figure) : null;
    return !!f && readsMarkets(f);
  });
  const named = marketSymbolsOf(m);
  const world = markets ? indexed(markets.series, WORLD.map((w) => w.symbol)) : null;
  const dow = markets ? indexed(markets.series, ["DJI", "DJT"]) : null;
  const rec = (markets?.series.RECPROB ?? []).slice(-252);
  const xhb = (markets?.series.XHB ?? []).slice(-252);
  const recRow = markets?.rows.find((r) => r.symbol === "RECPROB");
  const rowOf = (symbol: string) => markets?.rows.find((r) => r.symbol === symbol);
  const fed = lastYears(markets?.series.FEDBS ?? [], 5);
  const overnight = markets ? aligned(markets.series, ["EFFR", "SOFR"], 5) : null;
  const usRates = markets ? aligned(markets.series, ["MORT30", "EFFR", "CPIYOY"], 5) : null;
  const economies = on("market_economies") ? await loadEconomies(today) : null;
  const odds = on("market_odds") ? await loadOdds(markets?.rows.find((r) => r.symbol === "EFFR")?.level ?? null).catch(() => null) : null;
  // Credit stress from the filings: the person's own read of what they hold and watch, then the screener's companies (lib/credit-stress.ts).
  const stress = on("market_credit")
    ? await (async () => {
        const { file } = await screenerFor(ws);
        const own = Object.fromEntries(Object.values(ws.filings?.bySymbol ?? {}).filter((e) => !e.error).map((e) => [(e.ticker ?? e.symbol).toUpperCase(), { values: e.values, name: e.name, sector: e.sector ?? null }]));
        const held = new Set((ws.fullBook ?? ws.book)?.holdings.filter((h) => h.assetClass === "equity").map((h) => h.symbol.toUpperCase()) ?? []);
        const watched = new Set(Object.keys(ws.records.bySymbol).map((s) => s.toUpperCase()).filter((s) => !held.has(s)));
        return { at: file.updated, data: creditStress(file, own, held, watched) };
      })()
    : null;
  const rows = markets?.rows ?? [];
  const age = markets && markets.rows.length ? daysBetween(markets.asOf, today) : null;
  // Every card says how fresh it is: the market feed is read at most an hour apart; the demo is a fixed sample.
  const marketsFresh = ws.mode === "demo" ? ws.fresh : markets && markets.rows.length ? freshness("hourly", markets.asOf, today) : null;
  const mBadge = marketsFresh ? <FreshBadge compact fresh={marketsFresh} /> : null;
  const subtitle = markets && markets.rows.length ? `${sectionLead}${markets.rows.length} of ${MARKETS.length} indicators as of ${longDate(markets.asOf)}${age !== null && age > 3 ? ` (${age} days old)` : ""} · ${markets.source}` : "No indicator could be read.";

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} fresh={markets && markets.rows.length ? <ScreenFreshness kind="hourly" asOf={markets.asOf} /> : null} />
      <PageBody>
        {!sections.length ? (
          <div className="mb-8 card">
            <EmptyState icon={Globe} title="No market figures yet" instruction="This screen fills from a methodology section that reads the market indicators: VIX, yields, the curve, gold and silver, the dollar, oil, SPY, QQQ. Choose one on Setup and its name heads this screen." action={null} />
          </div>
        ) : null}

        {on("market_sections")
          ? sections.map((s) => <FiguresSection key={s.label} section={s} figures={m?.figures ?? []} ctx={data.ctx} inputs={ws.setup.inputs} fresh={{ book: ws.fresh, markets: marketsFresh }} markets={rows} signals={marketSignals} />)
          : null}

        {on("market_rules") ? (
          <ListSection grid header={`Rules on the markets · ${marketSignals.length}`} trailing={mBadge} footer={marketSignals.length ? "Each rule cites its section. A watch tripped is amber; a reading the feed could not give is grey." : undefined} className="mb-8">
            {marketSignals.length ? (
              marketSignals.map((s) => (
                <ListLinkRow key={s.key} href={"/signals" as Route} label={<span className="block whitespace-normal">{s.rule.text}</span>} detail={<span className="data">{readingLine(s)}</span>} value={<StatusPill tone={SIGNAL_TONE[s.status]}>{SIGNAL_LABEL[s.status]}</StatusPill>} />
              ))
            ) : (
              <ListRow wrap label="No rule tests a market figure." detail="A level the methodology watches (VIX above 30, the curve below zero) reads here once it is a rule." />
            )}
          </ListSection>
        ) : null}

        {on("market_cycle") && markets ? (
          <>
            <h2 className="section-header mb-4 px-1">Cycle signals</h2>
            <div className="mb-8">
              <CurveChart series={markets.series} badge={mBadge} />
            </div>
            {rec.length > 1 ? (
              <div className="mb-8">
                <LineChart
                  badge={mBadge}
                  title={`Recession probability, twelve months ahead${recRow ? ` · ${recRow.level.toFixed(1)}%` : ""}`}
                  subtitle="The New York Fed's yield-curve model, computed here from the 10-year less 3-month spread averaged over the month. Readings above 30% came before past US recessions; in 2023 it read above 50% and none followed. A model, not a forecast."
                  dates={rec.map((p) => p.date)}
                  series={[{ key: "RECPROB", label: "Probability", color: "var(--series-hcmp)", values: rec.map((p) => p.value) }]}
                  format="pct1"
                  baseline={30}
                  tableCaption="Recession probability by day"
                  tableEvery={5}
                />
              </div>
            ) : null}
            {dow && dow.dates.length > 1 ? (
              <div className="mb-8">
                <LineChart
                  badge={mBadge}
                  title="Dow industrials against transports · one year"
                  subtitle={`Both indexed to 100 on ${longDate(dow.dates[0])}. Dow theory: a new high in one the other does not confirm is a warning; the transports carry what the industrials make.`}
                  dates={dow.dates}
                  series={[
                    { key: "DJI", label: "Industrials (DJI)", color: "var(--series-hcmp)", values: dow.values[0] },
                    { key: "DJT", label: "Transports (DJT)", color: "var(--series-spy)", values: dow.values[1] },
                  ].filter((x) => x.values.length)}
                  format="num2"
                  baseline={100}
                  tableCaption="Industrials and transports indexed to 100, by day"
                  tableEvery={5}
                />
              </div>
            ) : null}
            {xhb.length > 1 ? (
              <div className="mb-8">
                <LineChart
                  badge={mBadge}
                  title="Homebuilders (XHB) · one year"
                  subtitle={`${marketDef("XHB")?.about ?? ""} In US dollars.`}
                  dates={xhb.map((p) => p.date)}
                  series={[{ key: "XHB", label: "XHB", color: "var(--series-hcmp)", values: xhb.map((p) => p.value) }]}
                  format="num2"
                  height={180}
                  tableCaption="XHB by day"
                  tableEvery={5}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {on("market_liquidity") && markets && (fed.length > 1 || (overnight && overnight.dates.length > 1)) ? (
          <>
            <h2 className="section-header mb-4 px-1">Liquidity</h2>
            {fed.length > 1 ? (
              <div className="mb-8">
                <LineChart
                  badge={mBadge}
                  title={`Fed securities holdings · $${Math.round(fed[fed.length - 1].value).toLocaleString("en-US")}bn`}
                  subtitle={`Each Wednesday for five years, to ${longDate(fed[fed.length - 1].date)}${rowOf("FEDBS")?.change1m !== null && rowOf("FEDBS")?.change1m !== undefined ? `; ${(rowOf("FEDBS")!.change1m as number) >= 0 ? "up" : "down"} $${Math.abs(Math.round(rowOf("FEDBS")!.change1m as number)).toLocaleString("en-US")}bn in a month` : ""}. Treasuries and mortgage securities the Federal Reserve holds (New York Fed): rising, it is buying bonds and adding liquidity; falling, it is letting them run off.`}
                  dates={fed.map((p) => p.date)}
                  series={[{ key: "FEDBS", label: "Holdings, $bn", color: "var(--series-hcmp)", values: fed.map((p) => p.value) }]}
                  format="int"
                  area
                  tableCaption="Fed securities holdings by week, $bn"
                  tableEvery={4}
                />
              </div>
            ) : null}
            {overnight && overnight.dates.length > 1 ? (
              <div className="mb-8">
                <LineChart
                  badge={mBadge}
                  title="Overnight rates · five years"
                  subtitle={`The fed funds effective rate and SOFR each day to ${longDate(overnight.dates[overnight.dates.length - 1])} (New York Fed).${[["EFFR", "Fed funds"], ["SOFR", "SOFR"]].map(([sym, label]) => { const r = rowOf(sym); return r ? ` ${label} ${formatLevel(r.level, "pct")}, ${formatChange(r, "1m")} in a month, ${formatChange(r, "1y")} in a year.` : ""; }).join("")}`}
                  dates={overnight.dates}
                  series={[
                    { key: "EFFR", label: "Fed funds", color: "var(--series-hcmp)", values: overnight.values[0] },
                    { key: "SOFR", label: "SOFR", color: "var(--series-spy)", values: overnight.values[1] },
                  ]}
                  format="pct1"
                  tableCaption="Overnight rates by day"
                  tableEvery={20}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {on("market_economy") && markets ? (
          <>
            <h2 className="section-header mb-4 px-1">The US economy</h2>
            {usRates && usRates.dates.length > 1 ? (
              <div className="mb-8">
                <LineChart
                  badge={mBadge}
                  title="Mortgage rates, interest rates and inflation · five years"
                  subtitle={`Each week to ${longDate(usRates.dates[usRates.dates.length - 1])}: Freddie Mac's 30-year mortgage rate, the fed funds rate, and consumer prices against a year before, each as it stood that week (inflation is monthly and holds until the next reading).`}
                  dates={usRates.dates}
                  series={[
                    { key: "MORT30", label: "30-year mortgage", color: "var(--series-hcmp)", values: usRates.values[0] },
                    { key: "EFFR", label: "Fed funds", color: "var(--series-spy)", values: usRates.values[1] },
                    { key: "CPIYOY", label: "Inflation (CPI)", color: "var(--series-qqq)", values: usRates.values[2] },
                  ].filter((x) => x.values.some((v) => v !== null))}
                  format="pct1"
                  tableCaption="Mortgage rate, fed funds and inflation by week"
                  tableEvery={4}
                />
              </div>
            ) : null}
            <div className="pair-grid mb-8 grid gap-4 lg:grid-cols-2">
              <Small badge={mBadge} symbol="UNRATE" pts={lastYears(markets.series.UNRATE ?? [], 5)} row={rowOf("UNRATE")} span="Five years" format="pct1" />
              <Small badge={mBadge} symbol="SENTIMENT" pts={lastYears(markets.series.SENTIMENT ?? [], 5)} row={rowOf("SENTIMENT")} span="Five years" format="num2" />
              <Small badge={mBadge} symbol="FEARGREED" pts={(markets.series.FEARGREED ?? []).slice(-252)} row={rowOf("FEARGREED")} span="One year" format="int" baseline={50} />
              <Small badge={mBadge} symbol="TAXREC" pts={lastYears(markets.series.TAXREC ?? [], 5)} row={rowOf("TAXREC")} span="Five years" format="int" />
            </div>
          </>
        ) : null}

        {on("market_world") && markets && world && world.dates.length > 1 ? (
          <div className="mb-8">
            <LineChart
              badge={mBadge}
              title="Developed, emerging and the S&P 500 · one year"
              subtitle={`Each indexed to 100 on ${longDate(world.dates[0])}, in US dollars, to ${longDate(world.dates[world.dates.length - 1])}. Developed markets is MSCI World (URTH), developed outside the US the Vanguard FTSE fund (VEA), emerging MSCI Emerging Markets (EEM).`}
              dates={world.dates}
              series={WORLD.map((w, i) => ({ key: w.symbol, label: w.label, color: w.color, values: world.values[i] })).filter((x) => x.values.length)}
              format="num2"
              baseline={100}
              tableCaption="Indexed to 100, by day"
              tableEvery={5}
            />
          </div>
        ) : null}
        {on("market_world") && markets ? (
          <div className="pair-grid mb-8 grid gap-4 lg:grid-cols-2">
            {ABROAD.map((symbol) => {
              const def = marketDef(symbol);
              const row = rows.find((r) => r.symbol === symbol);
              const year = (markets.series[symbol] ?? []).slice(-252);
              if (!def || year.length < 2) return null;
              return (
                <LineChart
                  key={symbol}
                  badge={mBadge}
                  title={`${def.name}${row?.change1yPct !== null && row?.change1yPct !== undefined ? ` · ${signedPct(row.change1yPct, 1)} in a year` : ""}`}
                  subtitle={def.about}
                  dates={year.map((p) => p.date)}
                  series={[{ key: symbol, label: def.name, color: "var(--series-hcmp)", values: year.map((p) => p.value) }]}
                  format="num2"
                  height={160}
                  tableCaption={`${def.name} by day`}
                  tableEvery={5}
                />
              );
            })}
          </div>
        ) : null}

        {on("market_calendar") ? <NextOnCalendar today={today} /> : null}
        {stress ? <CreditStressCard stress={stress.data} badge={ws.mode === "demo" ? mBadge : stress.at ? <FreshBadge compact fresh={freshness("daily", stress.at.slice(0, 10), today)} /> : null} /> : null}
        {on("market_odds") && odds ? <OddsCard odds={odds} today={today} demo={ws.mode === "demo"} badge={ws.mode === "demo" ? mBadge : <FreshBadge compact fresh={freshness("hourly", odds.readAt.slice(0, 10), today)} />} /> : null}

        {on("market_lines") && markets
          ? named.map((symbol, i) => {
              const def = marketDef(symbol);
              const pts = markets.series[symbol] ?? [];
              if (!def || pts.length < 2) return null;
              const year = yearOf(symbol, pts);
              if (year.length < 2) return null;
              return (
                <div key={symbol} className="mb-8">
                  <LineChart
                    badge={mBadge}
                    title={`${def.name} · one year`}
                    subtitle={`${longDate(year[0].date)} to ${longDate(year[year.length - 1].date)}. ${def.about}`}
                    dates={year.map((p) => p.date)}
                    series={[{ key: symbol, label: def.name, color: LINE_COLORS[i % LINE_COLORS.length], values: year.map((p) => p.value) }]}
                    format={formatFor(def.unit)}
                    tableCaption={`${def.name} by day`}
                    tableEvery={year.length > 60 ? 5 : 1}
                  />
                </div>
              );
            })
          : null}

        {on("your_data_markets") ? <YourData file={ws.customData} screen="markets" demo={ws.mode === "demo"} /> : null}

        {on("market_economies") ? economies ? <EconomiesMap data={economies} badge={ws.mode === "demo" ? mBadge : <FreshBadge compact fresh={freshness("daily", economies.readAt.slice(0, 10), today)} />} /> : (
          <ListSection grid header="Major economies" className="mb-8">
            <ListRow wrap label="The OECD, BIS and IMF figures are still being read; they arrive on the next page." />
          </ListSection>
        ) : null}


        <p className="px-1 text-caption text-text-tertiary">Public feeds, read only; nothing about you is sent. Not investment advice.</p>
      </PageBody>
    </>
  );
}
