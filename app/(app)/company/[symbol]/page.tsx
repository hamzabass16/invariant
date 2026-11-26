import type { Route } from "next";
import { beatsOf, guidanceLine, RESULT_WORD } from "@/lib/earnings-call";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IncomeFlowChart, type FlowView } from "@/components/charts/income-flow";
import { LineChart } from "@/components/charts/line-chart";
import { CompanyCharts, CompanyValuation } from "@/components/company/company-charts";
import { SegmentRevenue } from "@/components/company/segment-revenue";
import { segmentFamilies } from "@/lib/edgar-segments";
import { cn } from "@/lib/utils";
import { BullBearSection } from "@/components/company/bull-bear";
import { InsidersSection } from "@/components/company/insiders";
import { PeerValuation } from "@/components/company/peer-valuation";
import { ValuationRange } from "@/components/app/figures";
import { BAND_LABEL, fairRow, ZONE_LABEL, type OwnValuation } from "@/lib/fair-value";
import { ReactionHistorySection } from "@/components/company/reaction-history";
import { InfoTip } from "@/components/ui/info-tip";
import { CBOE_PAGE, expectedFor } from "@/lib/expected-move";
import { ReactionBlock } from "@/components/earnings/report";
import { CompanyNews } from "@/components/markets/company-news";
import { buttonStyles } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { BRIEF_DAYS, briefReport, foreignFiler, companyCharts, lastMove, latestReportOf, nextReport, statGroups, type ChartPeriod } from "@/lib/company";
import { bullBear } from "@/lib/bull-bear";
import { historiesFor, publicCompanyEntry, releaseDaysFor } from "@/lib/company-run";
import { ActionForm } from "@/components/app/action-form";
import { watchSymbolAction } from "@/app/(app)/watchlist/actions";
import { reportsOfEarnings } from "@/lib/company-news-run";
import { companyFeed, newsFrom } from "@/lib/company-news";
import { quarterWords, REACTION_BENCHMARK, reportKey, TIME_LABEL } from "@/lib/earnings";
import { money } from "@/lib/holdings";
import { loadCloses, loadCompanyHeadlines } from "@/lib/markets-feed";
import { addDays } from "@/lib/performance";
import { reactionHistory } from "@/lib/reaction-history";
import { newYorkClock } from "@/lib/market-day";
import { flowFromSeries } from "@/lib/income-flow";
import { holdingFolder, paragraphsOf, thesisFor } from "@/lib/theses";
import { huntFor, huntKey } from "@/lib/thesis-hunter";
import { addDaysTo, localDay, longDate } from "@/lib/time";
import { fillsOf } from "@/lib/trades";
import { consensusPe, estimateBars, multiplesAt } from "@/lib/forward";
import { EstimatesCard } from "@/components/company/estimates";
import { EcosystemCard, ecosystemWaiting } from "@/components/company/ecosystem";
import { ecosystemFor } from "@/lib/ecosystem-run";
import { registryAvailable } from "@/lib/registry";
import { peerComparison } from "@/lib/peers";
import { HISTORY_DAYS, historyMetricFor } from "@/lib/valuation-history";
import { agentFeedbackFor, earningsView, researchFor, screen, screenerFor, thesesFor, thesisHunterFor } from "@/lib/workspace";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} · Invariant` };
}

const price2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A company's page (Hamza, 20 Oct 2026, after Qualtrim's Insights), opened
 * from its ticker anywhere in the app: the price and the next results; the
 * brief, which is the report after the results for ten days after them (how
 * the stock took them included), else the week's news; the key figures from
 * the filings; the price and the valuation metric over time; the quarters,
 * years and per-share figures as columns; where the revenue comes from; the
 * person's own thesis and record, linked; the news. Everything is what the
 * app already reads; nothing is forecast.
 */
export default async function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const ws = await screen("overview");
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) notFound();
  const today = localDay();
  const book = ws.book;
  const holding = book?.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
  const record = Object.entries(ws.records.bySymbol).find(([s]) => s.toUpperCase() === symbol)?.[1] ?? null;
  const own = ws.filings?.bySymbol[symbol] ?? null;
  const traded = book ? fillsOf(book).some((f) => f.symbol.toUpperCase() === symbol) : false;
  const [earnings, theses, hunter, research, feedback] = await Promise.all([earningsView(ws), thesesFor(ws), thesisHunterFor(ws), researchFor(ws), agentFeedbackFor(ws)]);
  const report = latestReportOf(earnings.file, symbol);
  const demo = ws.mode === "demo";
  const known = !!(holding || record || own || report || traded);
  // The demo opens only the companies it carries; the app opens any public company (Hamza, 21 Oct 2026).
  if (!known && demo) notFound();

  const [closes, bench, headlines] = await Promise.all([loadCloses(symbol, today, "budget", HISTORY_DAYS), loadCloses(REACTION_BENCHMARK, today, "budget", HISTORY_DAYS), loadCompanyHeadlines([symbol], today)]);
  const points = closes.series[symbol] ?? [];
  const move = lastMove(points);
  const contact = ws.preferences.edgarContact ?? null;
  // A company whose filings the morning read does not keep (neither held nor watched, though perhaps traded before or reported on): read now, shared for the day, kept nowhere.
  const filing = own ?? (!demo && contact ? await publicCompanyEntry(symbol, move?.price ?? null, contact, today) : null);
  if (!known && !filing && !points.length) notFound();
  const onDemand = !own && !!filing;
  const price = holding?.price ?? move?.price ?? null;
  const ccy = holding?.currency ?? "USD";
  const filedCcy = filing?.perShareCurrency ?? report?.currency ?? ccy;
  const histories = await historiesFor(symbol, filing, ccy, demo, today, closes);
  const thesis = thesisFor(theses.file, symbol);
  const perShare = [...(filing?.perShareTtm ?? [])].sort((a, b) => a.end.localeCompare(b.end));
  const values: Record<string, number | null> = { ...(filing && !filing.error ? filing.values : {}), ...(holding?.fundamentals ?? {}) };
  // A company read with no price of its own (a watchlist company) is priced here at the last close, the filings' currency alike.
  if (ccy === filedCcy) for (const [k, v] of Object.entries(multiplesAt(price, perShare))) if (values[k] === null || values[k] === undefined) values[k] = v;
  values.consensus_forward_pe = consensusPe(price, ccy, filing?.consensus) ?? values.consensus_forward_pe ?? null;
  const screener = await screenerFor(ws);
  const listed = screener.file.bySymbol[symbol];
  const peers = peerComparison({ symbol, sector: filing?.sector ?? listed?.sector ?? null, subIndustry: filing?.subIndustry ?? listed?.subIndustry ?? null, sic: filing?.sic ?? listed?.sic ?? null, values }, Object.values(screener.file.bySymbol));
  const held = new Set((book?.holdings ?? []).map((h) => h.symbol.toUpperCase()));
  const stats = statGroups(values, filedCcy, price, ccy === filedCcy ? (perShare.at(-1) ?? null) : null);
  const charts = companyCharts(report, perShare, filing && !filing.error ? filing : null);
  // The filed years' EPS, then the analysts' by year with their low and high (Hamza, 21 Nov 2026), labelled as theirs.
  // The companies its annual report names, read once per report for everyone (Hamza, 21 Nov 2026); the demo reads none.
  const registry = !demo && registryAvailable();
  const eco = registry ? await ecosystemFor(symbol) : null;
  const estimates = filing?.consensus?.years.length ? estimateBars(filing && !filing.error ? filing.years : null, filing.consensus, filedCcy) : [];
  const brief = briefReport(report, today);
  const next = nextReport(earnings.entries, symbol, today);
  const priced = next ? expectedFor(earnings.file?.expected, symbol, next.date) : null;
  const name = holding?.name && holding.name !== symbol ? holding.name : (filing?.name ?? report?.name ?? null);
  const total = book?.holdings.reduce((a, h) => a + h.value, 0) ?? 0;
  const weight = holding && total > 0 ? (holding.value / total) * 100 : null;
  const year = points.filter((p) => p.date >= addDays(today, -365));
  const news = companyFeed([...headlines.items, ...reportsOfEarnings(earnings.file, new Set([symbol]), newsFrom(today))], today);
  const empty: Record<ChartPeriod, string> = {
    quarterly: demo ? "The demo keeps no quarterly history." : filing && !filing.error && filing.quarters !== undefined ? "The filings carry no quarterly figures for this company; a filer of 20-Fs reports quarters only in its releases, which the report after its next results reads." : "The quarters arrive with the next morning's filings read.",
    annual: demo ? "The demo keeps no yearly history." : filing && !filing.error && filing.years !== undefined ? "The filings carry no yearly figures for this company." : "The years arrive with the next morning's filings read.",
    ttm: demo ? "The demo keeps no quarterly history." : "The figures per share arrive with the next morning's filings read.",
  };
  // What it sells and where, each its own chart over time, never a donut beside it (Hamza, 7 Nov 2026).
  const families = filing?.segmentHistory ? segmentFamilies(filing.segmentHistory) : [];
  const sells = families.filter((f) => f !== "geography");
  const where = families.includes("geography");
  const thesisText = paragraphsOf(thesis?.text)[0] ?? null;
  // Beside the report after the results, the week's list leaves out that same report.
  const weekNews = brief ? news.filter((n) => !n.url.startsWith("/")) : news;
  // The last results and how the stock took each (Hamza, 23 Oct 2026, after Rallies.AI).
  const releases = !demo && filing?.cik && contact ? await releaseDaysFor(filing.cik, contact, today) : { days: [], problem: null };
  const ny = newYorkClock(new Date());
  const history = reactionHistory({
    symbol,
    releases: releases.days,
    reports: (earnings.file?.reports ?? []).filter((r) => r.status !== "failed"),
    closes: points,
    bench: bench.series[REACTION_BENCHMARK] ?? null,
    settled: ny.minutes >= 16 * 60 + 20 ? ny.date : addDaysTo(ny.date, -1),
    expected: earnings.file?.expected,
    reportHref: (r) => `/earnings?report=${encodeURIComponent(reportKey(r))}#report`,
    note: releases.problem ?? (!points.length ? (closes.problems[0] ?? null) : !demo && !filing?.cik ? (contact ? "The SEC lists no filer under this ticker, so only the results the app read are here." : "Confirm the contact the SEC will see, on Setup under Company filings, and the releases are read from the company's 8-Ks.") : null),
  });
  // Bull and bear from what the person keeps: their cases, pillars, kill signals and the Hunter's finds.
  const folder = holdingFolder({ symbol, holding: { symbol, name: name ?? symbol, price, currency: ccy, fundamentals: values, record: holding?.record ?? record ?? undefined }, thesis, earnings: earnings.file, studies: [], readings: { price, ...values }, today });
  const cases = bullBear({ price, ccy, ownValuation: (holding?.record ?? record)?.ownValuation ?? null, pillars: folder.pillars, signals: folder.signals, finds: huntFor(hunter.file, huntKey({ kind: "stock", symbol })).finds, hasThesis: !!thesis?.text.trim() });

  // How the revenue became profit (Hamza, 5 Nov 2026): the filings' latest quarter and twelve months, kept with the read, else from the series it keeps; the release's own quarter when it is newer than the filings.
  const clean = filing && !filing.error ? filing : null;
  const filedQuarter = clean?.flows?.quarter ?? flowFromSeries(clean?.quarters, "quarter", filedCcy, clean?.segmentHistory);
  const releaseFlow = report?.detail?.flow?.from === "release" && report.quarter && (!clean?.latestQuarter || report.quarter > clean.latestQuarter) ? report.detail.flow : null;
  const quarterFlow = releaseFlow ?? filedQuarter;
  const ttmFlow = clean?.flows?.ttm ?? flowFromSeries(clean?.years, "ttm", filedCcy, clean?.segmentHistory);
  // What lies behind the quarter's lines, from the report on that quarter (Hamza, 5 Nov 2026).
  const notesOn = report?.detail?.flowNotes?.notes.length && (quarterFlow === releaseFlow || (!!report.quarter && clean?.latestQuarter === report.quarter)) ? report.detail.flowNotes : null;
  const flowViews: FlowView[] = [...(quarterFlow ? [{ key: "quarter", word: "Quarter", flow: quarterFlow, notes: notesOn?.notes ?? [], notesNote: notesOn?.note ?? null }] : []), ...(ttmFlow ? [{ key: "ttm", word: ttmFlow.basis === "year" ? "Year" : "Twelve months", flow: ttmFlow }] : [])];

  return (
    <>
      <PageHeader
        title={symbol}
        subtitle={name ?? "Company"}
        action={
          <div className="flex flex-wrap gap-2">
            {holding || record || thesis ? (
              <Link href={`/theses/${encodeURIComponent(symbol)}` as Route} className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
                Thesis
              </Link>
            ) : null}
            {!holding && !record ? (
              <ActionForm action={watchSymbolAction} label="Add to watchlist" pendingLabel="Adding" doneLabel="On your watchlist" variant="secondary" size="sm">
                <input type="hidden" name="symbol" value={symbol} />
              </ActionForm>
            ) : null}
            {holding ? (
              <Link href={`/holdings/${encodeURIComponent(symbol)}` as Route} className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
                Your record
              </Link>
            ) : null}
            {traded ? (
              <Link href={`/trades/${encodeURIComponent(symbol)}` as Route} className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
                Trades
              </Link>
            ) : null}
          </div>
        }
      />
      <PageBody>
        <section className="card mb-6 px-4 py-5 text-center lg:px-6">
          <p className="data text-large-title font-semibold">{price === null ? "n/a" : `${price2(price)} ${ccy}`}</p>
          {move ? (
            <p className="mt-1 text-subhead text-text-secondary">
              {move.pct !== null ? <span className={`data font-medium ${move.pct > 0 ? "text-ok" : move.pct < 0 ? "text-danger" : "text-text"}`}>{`${move.pct > 0 ? "+" : ""}${move.pct.toFixed(2)}%`}</span> : null} at the close of {longDate(move.date)}
            </p>
          ) : (
            <p className="mt-1 text-footnote text-text-secondary">{closes.problems[0] ?? "No closes came back."}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-footnote text-text-secondary">
            {holding ? <StatusPill tone="info">Held{weight !== null ? ` · ${weight.toFixed(2)}%` : ""}</StatusPill> : record ? <StatusPill tone="neutral">On your watchlist</StatusPill> : traded ? <StatusPill tone="neutral">Traded before</StatusPill> : null}
            {next ? (
              <Link href={`/earnings?month=${next.date.slice(0, 7)}&day=${next.date}#day` as Route} className="text-accent-text">
                Results {longDate(next.date)}
                {next.time !== "unknown" ? `, ${TIME_LABEL[next.time].toLowerCase()}` : ""}
              </Link>
            ) : null}
            {filing?.sector ? <span>· {filing.sector}</span> : null}
            {filing?.country ? <span>· {filing.country}</span> : null}
          </div>
        </section>

        <section className="mb-8" aria-labelledby="brief">
          <h2 id="brief" className="section-header mb-2 px-1">
            Brief
          </h2>
          {/* The brief is the company now, in parts (Hamza, 20 Oct 2026: the report after the results is one part of it, never the whole). */}
          <div className={`grid grid-cols-1 gap-4 ${brief ? "lg:grid-cols-2 lg:items-start" : ""}`}>
            {brief ? (
              <div className="card px-4 py-4 lg:px-6">
                <p className="section-header text-accent-text">
                  After the results{brief.quarter ? ` · ${quarterWords(brief.quarter)}` : ""} · reported {longDate(brief.date)}
                </p>
                <p className="mt-2 text-body">{brief.headline}</p>
                <ReactionBlock r={brief} className="mt-4" />
                {brief.commentary ? (
                  <div className="mt-4">
                    <h3 className="section-header mb-2">What the release and the call said</h3>
                    <p className="text-subhead">{brief.commentary.summary}</p>
                    {guidanceLine(brief.call, 3) ?? brief.commentary.guidance ? (
                      <p className="mt-2 text-subhead">
                        <span className="text-text-secondary">Guidance: </span>
                        {guidanceLine(brief.call, 3) ?? brief.commentary.guidance}
                      </p>
                    ) : null}
                    {beatsOf(brief).length ? (
                      <p className="mt-2 text-subhead">
                        <span className="text-text-secondary">Against expectations: </span>
                        {beatsOf(brief)
                          .slice(0, 4)
                          .map((b) => `${b.line} ${RESULT_WORD[b.result].toLowerCase()}${b.by ? ` ${b.by}` : ""}`)
                          .join("; ")}
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <Link href={`/earnings?report=${encodeURIComponent(reportKey(brief))}#report` as Route} className="mt-4 inline-block text-subhead text-accent-text">
                  The full report after the results
                </Link>
              </div>
            ) : null}
            <div className="card px-4 py-4 lg:px-6">
              <p className="section-header text-accent-text">This week</p>
              {weekNews.length ? (
                <ul className="mt-2 space-y-2">
                  {weekNews.slice(0, brief ? 4 : 5).map((n) => (
                    <li key={n.url} className="text-subhead">
                      <a href={n.url} target={n.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="hover:underline">
                        {n.title}
                      </a>{" "}
                      <span className="text-footnote text-text-tertiary">
                        {n.source}, {longDate(n.at.slice(0, 10))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-subhead text-text-secondary">{headlines.problems[0] ?? "No headline or filing this week."}</p>
              )}
              <dl className="mt-4 space-y-1 border-t border-hairline pt-3 text-footnote">
                {!brief && report ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="text-text-secondary">Last results</dt>
                    <dd className="text-right">
                      <Link href={`/earnings?report=${encodeURIComponent(reportKey(report))}#report` as Route} className="text-accent-text">
                        {report.quarter ? `${quarterWords(report.quarter)}, ` : ""}reported {longDate(report.date)}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-text-secondary">Next results</dt>
                  <dd className="text-right">{next ? `${longDate(next.date)}${next.time !== "unknown" ? `, ${TIME_LABEL[next.time].toLowerCase()}` : ""}` : "Not on the calendar yet"}</dd>
                </div>
                {priced ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="text-text-secondary">Options price</dt>
                    <dd className="data text-right">
                      ±{priced.pct.toFixed(1)}% on the results{" "}
                      <a href={CBOE_PAGE(symbol)} target="_blank" rel="noreferrer" className="font-sans text-accent-text">
                        Cboe
                      </a>
                    </dd>
                  </div>
                ) : null}
                {thesisText ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="text-text-secondary">Your thesis</dt>
                    <dd className="min-w-0 text-right">
                      <Link href={`/theses/${encodeURIComponent(symbol)}` as Route} className="text-accent-text">
                        On file{thesis?.updatedAt ? `, ${longDate(thesis.updatedAt.slice(0, 10))}` : ""}
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
          <p className="mt-2 px-1 text-caption text-text-tertiary">{brief ? `The week's headlines and filings, and for ${BRIEF_DAYS} days after the results the report after them, with how the stock took them.` : `The week's headlines and filings. For ${BRIEF_DAYS} days after ${next ? `the results on ${longDate(next.date)}` : "the next results"}, the report after them joins the brief.`}</p>
        </section>

        <section className="mb-8" aria-labelledby="figures">
          <h2 id="figures" className="section-header mb-2 px-1">
            Key figures
          </h2>
          <div className="term-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((g) => (
              <div key={g.title} className="term-cell">
                <p className="text-subhead font-semibold">{g.title}</p>
                {g.rows.length ? (
                  <dl className="mt-1.5 space-y-1">
                    {g.rows.map((r) => (
                      <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-dotted border-hairline pb-1 text-footnote">
                        <dt className="flex items-center gap-1 text-text-secondary">
                          {r.label}
                          {r.info ? <InfoTip id={`${g.title}-${r.label}`} label={r.label} text={r.info} align="start" /> : null}
                        </dt>
                        <dd className="data text-text">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-1.5 text-footnote text-text-tertiary">Not in the filings read.</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-caption text-text-tertiary">{filing && !filing.error ? `From SEC filings${filing.period ? `, ${filing.period}` : ""}, read ${onDemand ? "when this page was opened, shared for the day" : longDate(filing.readAt.slice(0, 10))}. Multiples at ${onDemand ? "the last close" : "today's price"} over the trailing twelve months.${onDemand ? " Added to your watchlist, it is read each morning with its segments and geography." : ""}` : (filing?.error ?? (known ? "The filings are read each morning for every holding and watchlist company." : contact ? "The SEC lists no company under this ticker, so there are no filings to read." : "Confirm the contact the SEC will see, on Setup under Company filings, and any public company's filings are read when its page is opened."))}</p>
        </section>

        <section className="mb-8" aria-labelledby="financials">
          <h2 id="financials" className="section-header mb-2 px-1">
            Financials
          </h2>
          <CompanyCharts charts={charts} ccy={filedCcy && /^[A-Z]{3}$/.test(filedCcy) ? filedCcy : "USD"} empty={empty} />
          {report?.detail?.quartersNote ? <p className="mt-2 px-1 text-caption text-text-tertiary">{report.detail.quartersNote}</p> : null}
        </section>

        {estimates.some((b) => b.kind === "analysts") ? (
          <section className="mb-8" aria-label="The analysts' estimates">
            <EstimatesCard bars={estimates} words={filing!.consensus!.words} readAt={longDate(filing!.consensus!.readAt.slice(0, 10))} />
          </section>
        ) : null}

        {flowViews.length ? (
          <section className="mb-8" aria-label="Where the revenue went">
            <IncomeFlowChart title="Where the revenue went" subtitle={`Revenue${flowViews.some((v) => v.flow.sources.length) ? " by segment" : ""} to gross profit, operating income and net income, from the ${releaseFlow ? "release as printed and the filings" : "SEC filings"}. Margins and growth against the same period a year before.`} views={flowViews} />
          </section>
        ) : null}

        <section className="mb-8" aria-label="Ecosystem">
          {eco && !eco.error && eco.relations.length ? (
            <EcosystemCard symbol={symbol} name={name ?? symbol} eco={eco} linkable={(s) => !demo || held.has(s.toUpperCase())} filedOn={eco.filed ? longDate(eco.filed) : null} />
          ) : (
            <>
              <h2 className="section-header mb-2 px-1">
                Ecosystem
              </h2>
              <p className="px-1 text-footnote text-text-tertiary">{ecosystemWaiting(eco, demo, registry)}</p>
            </>
          )}
        </section>

        <BullBearSection symbol={symbol} cases={cases} />

        <ReactionHistorySection symbol={symbol} history={history} demo={demo} />

        <InsidersSection symbol={symbol} cik={filing?.cik ?? null} insiders={filing?.insiders} short={filing?.shortInterest} today={today} demo={demo} foreign={foreignFiler(filing, report)} />

        <YourValueSection symbol={symbol} price={price} ccy={ccy} own={(holding?.record ?? record)?.ownValuation ?? null} today={today} />

        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          {year.length > 1 ? (
            <LineChart title="Price, past year" subtitle={`Daily closes, ${ccy}`} dates={year.map((p) => p.date)} series={[{ key: "price", label: symbol, color: "var(--series-hcmp)", values: year.map((p) => p.value) }]} format="num2" height={240} tableCaption={`${symbol} daily closes, past year`} tableEvery={5} />
          ) : (
            <p className="card px-4 py-3 text-footnote text-text-secondary">{closes.problems[0] ?? "No closes came back."}</p>
          )}
          <CompanyValuation histories={histories} initial={historyMetricFor(thesis?.valuation?.method)} />
        </section>

        <section className="mb-8" aria-labelledby="peers">
          <h2 id="peers" className="sr-only">
            Against its peers and its sector
          </h2>
          <PeerValuation symbol={symbol} comparison={peers} consensus={histories.consensus ?? null} linkable={(s) => !demo || held.has(s.toUpperCase())} />
        </section>


        {/* Revenue by segment or product, and by geography, each stacked by quarter or year (Hamza, 4 Nov 2026, after Qualtrim; no donuts, 7 Nov 2026). */}
        {filing?.segmentHistory && (sells.length || where) ? (
          <section className={cn("mb-8 grid grid-cols-1 gap-6", sells.length && where ? "xl:grid-cols-2" : "")} aria-label="Revenue by segment and geography">
            {sells.length ? <SegmentRevenue history={filing.segmentHistory} only={sells} ccy={filedCcy && /^[A-Z]{3}$/.test(filedCcy) ? filedCcy : "USD"} /> : null}
            {where ? <SegmentRevenue history={filing.segmentHistory} only={["geography"]} ccy={filedCcy && /^[A-Z]{3}$/.test(filedCcy) ? filedCcy : "USD"} /> : null}
          </section>
        ) : filing && own && !demo ? (
          <p className="mb-8 px-1 text-caption text-text-tertiary">{filing.segmentHistory?.note ?? "Revenue by segment and by geography, quarter by quarter, arrives with the next morning's read of the filings."}</p>
        ) : null}

        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card px-4 py-4">
            <h2 className="section-header mb-2">Your thesis</h2>
            {thesisText ? <p className="text-subhead">{thesisText}</p> : <p className="text-footnote text-text-secondary">No thesis written yet.</p>}
            <Link href={`/theses/${encodeURIComponent(symbol)}` as Route} className="mt-3 inline-block text-subhead text-accent-text">
              {thesisText ? "The thesis, its pillars and the valuation" : "Write one, with the valuation calculator"}
            </Link>
          </div>
          {/* The one amount of the person's own on a public page: stealth hides it (Hamza, 7 Nov 2026). */}
          <div className="card px-4 py-4" data-private="">
            <h2 className="section-header mb-2">{holding ? "Your holding" : "Your watchlist record"}</h2>
            {holding ? (
              <p className="text-subhead">
                {holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} shares, {money(holding.value, book?.fx.base ?? ccy)}
                {weight !== null ? `, ${weight.toFixed(2)}% of the book` : ""}.
              </p>
            ) : record ? (
              <p className="text-subhead">{record.note ?? "On your watchlist."}</p>
            ) : (
              <p className="text-footnote text-text-secondary">Not held now; it is in your trades.</p>
            )}
            {record?.ownValuation ? (
              <p className="mt-1 text-footnote text-text-secondary">
                Your valuation: {price2(record.ownValuation.low ?? record.ownValuation.base)} to {price2(record.ownValuation.high ?? record.ownValuation.base)}, base {price2(record.ownValuation.base)}.
              </p>
            ) : null}
            <Link href={(holding ? `/holdings/${encodeURIComponent(symbol)}` : "/watchlist") as Route} className="mt-3 inline-block text-subhead text-accent-text">
              {holding ? "Rules, triggers and decisions on it" : "The watchlist"}
            </Link>
          </div>
        </section>

        <CompanyNews items={news} problems={headlines.problems} today={today} held={new Set(holding ? [symbol] : [])} companies={1} fresh={null} demo={demo} intro={`${symbol}'s headlines, filings and results reports over the past week, the newest first.`} research={holding || record ? { file: research.file, feedback: feedback.file, editable: true, symbols: [symbol] } : undefined} />
        <p className="px-1 text-caption text-text-tertiary">Figures from SEC filings and the price feed; nothing here is a forecast. Not investment advice.</p>
      </PageBody>
    </>
  );
}

/**
 * The price against the fair value the person set on this company's thesis
 * (Hamza, 4 Nov 2026, with Holdings' Against your fair value): the base, the
 * bear and the bull per share, where the price sits among them, and the move
 * to the base; a company with no valuation of theirs says where to set one.
 */
function YourValueSection({ symbol, price, ccy, own, today }: { symbol: string; price: number | null; ccy: string; own: OwnValuation | null; today: string }) {
  const r = own ? fairRow({ symbol, name: symbol, value: 1, price, currency: ccy, own }, today) : null;
  const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });
  return (
    <section id="your-value" className="card mb-8 scroll-mt-20 px-4 py-3" aria-labelledby="your-value-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="your-value-title" className="text-subhead font-semibold">
          Against your fair value
        </h2>
        {r ? <StatusPill tone={r.band === "under" ? "ok" : r.band === "over" ? "warn" : "neutral"}>{BAND_LABEL[r.band]}</StatusPill> : null}
        <Link href={`/theses/${encodeURIComponent(symbol)}#valuation` as Route} className="ml-auto text-footnote text-accent-text">
          {own ? "Change it on the thesis" : "Set it on the thesis"}
        </Link>
      </div>
      {r ? (
        <>
          <p className="mt-1 text-footnote text-text-secondary">
            {n2(r.price)} {ccy} against your base of {n2(r.own.base)}: {r.pctOfBase.toFixed(0)}% of it, {r.toBasePct >= 0 ? "+" : "−"}
            {Math.abs(r.toBasePct).toFixed(1)}% to reach it{r.zone ? `, ${ZONE_LABEL[r.zone]}` : ""}. Set {longDate(r.own.asOf)}
            {r.own.basis ? `, ${r.own.basis}` : ""}
            {r.stale ? ", over a year ago" : ""}.
          </p>
          <div className="mt-2 max-w-xl">
            <ValuationRange low={r.own.low} base={r.own.base} high={r.own.high} price={r.price} />
          </div>
        </>
      ) : (
        <p className="mt-1 text-footnote text-text-secondary">{own ? "No price to set against your valuation yet." : "No valuation of yours yet. Set a bear, base and bull per share in the Valuation calculator on the thesis and press Keep; Holdings then sets the whole book against them."}</p>
      )}
    </section>
  );
}
