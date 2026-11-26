import Link from "next/link";

import { guidanceLine } from "@/lib/earnings-call";
import { buttonStyles } from "@/components/ui/button";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/app/action-form";
import { CapLabel, ClassTag, StatTile, ValuationRange, WeightBar } from "@/components/app/figures";
import { EarningsReportCard } from "@/components/earnings/report";
import { NewStudyForm } from "@/components/research/forms";
import { AskClaudeCard } from "@/components/app/ask-claude";
import { AddToThesis } from "@/components/theses/add-to-thesis";
import { askState } from "@/lib/ask-claude-run";
import { ClaudeWrites } from "@/components/theses/claude-writes";
import { partViews } from "@/lib/thesis-writes";

import { DeckEmbed } from "@/components/theses/deck-embed";
import { EvidenceList } from "@/components/theses/evidence-list";
import { FigureGrid } from "@/components/theses/figure-grid";
import { HunterFinds } from "@/components/theses/hunter-finds";
import { NoteForm } from "@/components/theses/note-form";
import { ThesisForm } from "@/components/theses/thesis-form";
import { ValuationCalculator } from "@/components/theses/valuation-calculator";
import { PricedInPanel } from "@/components/agents/priced-in";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { PublishCall } from "@/components/theses/publish-call";
import { ThesisReceipt } from "@/components/theses/thesis-receipt";
import { stockWords } from "@/lib/receipts";
import { StatusPill } from "@/components/ui/status";
import { dcfDefaults, type DcfBasis, type DcfInputs, type DcfSeed } from "@/lib/dcf";
import { deckWaiting, type EarningsReport } from "@/lib/earnings";
import { money } from "@/lib/holdings";
import { deriveScreens } from "@/lib/screen-data";
import { capTone } from "@/lib/screens";
import { holdingFolder, paragraphsOf, PILLAR_TAG_LABEL, thesisFor, valuationSeedOf } from "@/lib/theses";
import { localDay, longDate } from "@/lib/time";
import { listingRate } from "@/lib/markets-feed";
import { companyHref } from "@/lib/company";
import { historiesFor } from "@/lib/company-run";
import { PeerValuation } from "@/components/company/peer-valuation";
import { multiplesAt } from "@/lib/forward";
import { peerComparison } from "@/lib/peers";
import { valuationDefaults } from "@/lib/valuation";
import { proposalFor } from "@/lib/thesis-review";
import { huntFor, huntKey } from "@/lib/thesis-hunter";
import { pricedFactsFrom } from "@/lib/research-agent";
import { earningsFor, researchFor, screen, screenerFor, thesesFor, thesisHunterFor, thesisProposalsFor, thesisWritesFor } from "@/lib/workspace";

import { removeThesisAction, saveValuationAction } from "../actions";

// Hunt now runs the Thesis Hunter on the person's model, with a few web searches.
export const maxDuration = 300;

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} thesis · Invariant` };
}

const TAG_TONE = { supported: "ok", mixed: "warn", risk: "danger", unread: "neutral" } as const;
const n = (v: number, d = 2) => v.toLocaleString("en-US", { maximumFractionDigits: d });

/** What the latest report's filings give the DCF to start from: the trailing lines, the growth and the balance sheet, whole units. */
function seedOf(r: EarningsReport | null): DcfSeed | null {
  const t = r?.detail?.years;
  if (!r || !t) return null;
  const last = (key: string) => t.rows.find((x) => x.key === key)?.values.at(-1) ?? null;
  const b = r.detail?.balance ?? null;
  return { revenue: last("revenue"), fcf: last("fcf"), netIncome: last("netIncome"), sbc: last("sbc"), dilutedShares: last("dilutedShares") ?? b?.shares ?? null, revenueGrowthPct: r.detail?.fundamentals.revenue_growth_pct ?? null, cash: b?.cash ?? null, investments: b?.investments ?? null, debt: b?.debt ?? null, balanceLabel: b?.quarter ? `at ${b.quarter}` : null, periodLabel: t.cols.at(-1) ?? null, currency: r.currency };
}



/**
 * One holding's folder, as HCMP keeps it in Drive: the thesis and its
 * pillars read today, the record's kill signals and triggers, the Valuation
 * calculator (the stage from the filings, the metrics useful at it, the DCF),
 * the latest results with the earnings deck, the study on
 * the stock template, and the archive. The decks read the thesis, the pillars
 * and the valuation from here (Hamza, 16 Oct 2026).
 */
export default async function ThesisPage({ params }: { params: Promise<{ symbol: string }> }) {
  const ws = await screen("overview");
  const { setup, book } = ws;
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) notFound();
  const today = localDay();
  const [{ file, error }, earnings, proposals, hunter, claudeWrites, ask] = await Promise.all([thesesFor(ws), earningsFor(ws), thesisProposalsFor(ws), thesisHunterFor(ws), thesisWritesFor(ws), askState(ws)]);
  const holding = book?.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
  const thesis = thesisFor(file, symbol);
  if (!holding && !thesis) notFound();
  const data = book ? deriveScreens({ book, methodology: setup.methodology, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today) : null;
  const w = data?.weights.find((x) => x.symbol === symbol) ?? null;
  const slots = data?.slots("theses") ?? [];
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  const f = holdingFolder({ symbol, holding, thesis, earnings: earnings.file, studies: ws.research.studies, today });
  const editable = ws.mode === "drive";
  const ccy = setup.baseCurrency;
  const price = holding?.price ?? null;
  const seed = seedOf(f.latest);
  const vSeed = valuationSeedOf(f.latest);
  // A price in another currency than the filings' is laid on the seeds at the day's rate; the demo and a subject not held need none.
  const fx = holding && ws.mode !== "demo" ? (await listingRate(holding.currency, seed?.currency ?? vSeed?.currency ?? null, today)).fx : null;
  const seeds: Record<DcfBasis, DcfInputs | null> = { cash_flow: seed ? dcfDefaults("cash_flow", seed, price, holding?.currency ?? null, today, fx) : null, earnings: seed ? dcfDefaults("earnings", seed, price, holding?.currency ?? null, today, fx) : null };
  const valuationSeed = vSeed ? valuationDefaults(vSeed, f.valuation.result.reading.stage, price, holding?.currency ?? null, today, !!(f.dcf ?? seeds.cash_flow ?? seeds.earnings), fx) : null;
  const readings: Record<string, number | null | undefined> = { price, ...(holding?.fundamentals ?? {}) };
  const histories = await historiesFor(symbol, ws.filings?.bySymbol[symbol] ?? null, holding?.currency ?? "USD", ws.mode === "demo", today);
  const filing = ws.filings?.bySymbol[symbol] ?? null;
  const screener = on("thesis_peers") ? await screenerFor(ws) : null;
  const listed = screener?.file.bySymbol[symbol];
  const peerValues: Record<string, number | null | undefined> = { ...(filing && !filing.error ? filing.values : {}), ...(holding?.fundamentals ?? {}) };
  // A watchlist company has no price of its own: its multiples are read at the last close, as on its company page.
  if (!holding && (filing?.perShareCurrency ?? "USD") === "USD") for (const [k, v] of Object.entries(multiplesAt(histories.price ?? null, filing?.perShareTtm ?? []))) if (peerValues[k] === null || peerValues[k] === undefined) peerValues[k] = v;
  const peers = screener ? peerComparison({ symbol, sector: filing?.sector ?? listed?.sector ?? null, subIndustry: filing?.subIndustry ?? listed?.subIndustry ?? null, sic: filing?.sic ?? listed?.sic ?? null, values: peerValues }, Object.values(screener.file.bySymbol)) : null;
  const rec = f.record;
  const earlier = f.reports.slice(1);
  const otherStudies = f.studies.filter((s) => s.id !== f.study?.id);
  const name = holding?.name ?? f.name;
  const research = on("thesis_priced_in") ? await researchFor(ws) : null;
  const pricedFacts = on("thesis_priced_in")
    ? pricedFactsFrom({
        symbol,
        name,
        price: price ?? histories.price ?? null,
        currency: holding?.currency ?? (price === null && histories.price !== null ? "USD" : null),
        dcf: f.thesis?.dcf ?? seeds.cash_flow ?? seeds.earnings,
        years: f.latest?.detail?.years ?? null,
        guidance: guidanceLine(f.latest?.call, 4) ?? f.latest?.commentary?.guidance ?? null,
        cases: rec?.ownValuation ? { low: rec.ownValuation.low, base: rec.ownValuation.base, high: rec.ownValuation.high, basis: rec.ownValuation.basis } : null,
        pillars: f.thesis?.pillars ?? [],
      })
    : null;

  return (
    <>
      <PageHeader title={symbol} subtitle={name && name !== symbol ? name : "Thesis"} action={
          <div className="flex flex-wrap gap-2">
            <a href={`/theses/${encodeURIComponent(symbol)}/pdf`} download className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
              Export as PDF
            </a>
            <Link href={"/theses" as Route} className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
              All theses
            </Link>
          </div>
        } />
      <PageBody>
        {error ? <p className="mb-4 px-1 text-footnote text-danger">{error}</p> : null}
        <ClaudeWrites writes={claudeWrites.file.pending.filter((p) => p.key === `stock:${symbol}`).map((p) => ({ write: p, parts: partViews(file, p), href: null }))} />
        <div className="mb-4 flex flex-wrap items-center gap-2 px-1 text-subhead text-text-secondary">
          {ws.shown.classes && w ? <ClassTag label={w.classId ? w.classLabel : null} full /> : null}
          {!f.held ? <StatusPill tone="neutral">Not held</StatusPill> : null}
          {w?.cap ? <span>· {w.cap.cap}% cap ({w.cap.rule.section})</span> : null}
          <Link href={companyHref(symbol) as Route} className="text-accent-text">
            Company
          </Link>
          {holding ? <Link href={`/holdings/${encodeURIComponent(symbol)}` as Route} className="text-accent-text">Holding record</Link> : null}
          {thesis ? <ThesisReceipt words={stockWords(symbol, thesis)} /> : null}
          {thesis ? <PublishCall words={stockWords(symbol, thesis)} keyOf={symbol} email={ws.mode === "drive" ? ws.operator.email : null} /> : null}
        </div>

        {on("thesis_record") && w && holding ? (
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card px-4 py-3.5">
              <p className="section-header">{w.cap ? "Weight / cap" : "Weight"}</p>
              <p className="data mt-1 text-title-2 font-semibold">{w.cap ? <CapLabel weight={w.weight} cap={w.cap.cap} tone={capTone(w.state)} /> : `${w.weight.toFixed(2)}%`}</p>
              {w.cap ? (
                <div className="mt-2">
                  <WeightBar weight={w.weight} cap={w.cap.cap} scale={data!.scale} tone={capTone(w.state)} />
                </div>
              ) : (
                <p className="mt-0.5 text-footnote text-text-secondary">of net worth</p>
              )}
            </div>
            <StatTile label="Price" value={price !== null ? `${n(price)} ${holding.currency}` : "n/a"} detail={`${money(w.value, ccy)} held`} />
            <StatTile label="Your valuation" value={rec?.ownValuation ? n(rec.ownValuation.base, 0) : f.valuation.result.chosen ? n(f.valuation.result.chosen.cases!.base, 0) : "none"} detail={rec?.ownValuation ? `${rec.ownValuation.basis ?? "base case"}, ${longDate(rec.ownValuation.asOf)}` : f.valuation.result.chosen ? `${f.valuation.result.chosen.short} base case, not kept as the valuation yet` : "Run the Valuation calculator below"} tone={rec?.ownValuation && price !== null ? (price > rec.ownValuation.base ? "warn" : "ok") : "neutral"} />
            <StatTile label="Kill signals" value={f.signals.some((s) => s.kind === "kill") ? `${f.signals.filter((s) => s.kind === "kill" && s.met).length} of ${f.signals.filter((s) => s.kind === "kill").length} met` : "none"} detail={f.latest ? `last results ${longDate(f.latest.date)}` : "no results read yet"} tone={f.signals.some((s) => s.kind === "kill" && s.met) ? "danger" : f.signals.some((s) => s.kind === "kill") ? "ok" : "neutral"} />
          </div>
        ) : null}

        {rec?.ownValuation && price !== null ? (
          <div className="card mb-8 px-4 py-3">
            <ValuationRange low={rec.ownValuation.low} base={rec.ownValuation.base} high={rec.ownValuation.high} price={price} />
          </div>
        ) : null}

        {f.owed.length ? (
          <ListSection header={`Still owed · ${f.owed.length}`} footer="In the order to fill the folder; the decks say what they need until it is there." className="mb-8">
            {f.owed.map((o) => (
              <ListRow key={o.key} wrap label={o.words} value={<StatusPill tone="warn">Owed</StatusPill>} />
            ))}
          </ListSection>
        ) : null}

        <div className="flow-cols">
          <div className="flow-col">
            {on("thesis_pillars") ? (
              <section id="thesis" className="mb-8 scroll-mt-20">
                <h2 className="section-header mb-2 px-4">The thesis</h2>
                {f.thesis?.text.trim() ? (
                  <div className="card mb-3 px-4 py-4">
                    {paragraphsOf(f.thesis.text).map((p, i) => (
                      <p key={i} className={i ? "mt-3 text-body" : "text-body"}>
                        {p}
                      </p>
                    ))}
                    {f.thesis.pathway ? <p className="mt-3 text-footnote text-text-secondary">Pathway: {f.thesis.pathway}</p> : null}
                    <p className="mt-3 text-caption text-text-tertiary">Updated {longDate(f.thesis.updatedAt.slice(0, 10))}</p>
                  </div>
                ) : null}
                {f.pillars.length ? (
                  <ListSection header="Pillars, read today" className="mb-3">
                    {f.pillars.map((p) => (
                      <ListRow key={p.pillar.id} wrap label={p.pillar.name} detail={`${p.pillar.text}${p.words ? ` ${p.words}` : ""}`} value={<StatusPill tone={TAG_TONE[p.tag]}>{PILLAR_TAG_LABEL[p.tag]}</StatusPill>} />
                    ))}
                  </ListSection>
                ) : null}
                {f.thesis?.watch.length ? (
                  <ListSection header="Watch" className="mb-3">
                    {f.thesis.watch.map((x) => (
                      <ListRow key={x} wrap label={x} />
                    ))}
                  </ListSection>
                ) : null}
                {editable ? (
                  <details className="group" open={!f.thesis?.text.trim()}>
                    <summary className="cursor-pointer px-4 py-2 text-subhead text-accent-text">{f.thesis ? "Edit the thesis and its pillars" : "Write the thesis"}</summary>
                    <div className="mt-2">
                      <ThesisForm symbol={symbol} thesis={f.thesis} />
                      {f.thesis ? (
                        <ActionForm action={removeThesisAction} label="Remove the thesis" variant="ghost" size="sm" className="mt-2 px-4">
                          <input type="hidden" name="symbol" value={symbol} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </details>
                ) : (
                  <p className="px-4 text-footnote text-text-tertiary">The demo&apos;s theses are fictional and read-only. In your own copy you write each one here.</p>
                )}
              </section>
            ) : null}
            {on("thesis_hunter") && f.thesis?.text.trim() ? <HunterFinds hunt={huntFor(hunter.file, huntKey({ kind: "stock", symbol }))} subject={{ kind: "stock", id: symbol }} editable={editable} hasModel={ws.hasModelKey} /> : null}
          </div>
          <div className="flow-col">
            {on("thesis_signals") ? (
              <ListSection grid id="signals" header="Kill signals and triggers" footer={holding ? <span>Kept on the <Link href={`/holdings/${encodeURIComponent(symbol)}` as Route} className="text-accent-text">holding record</Link>; every result re-scores each one, and a met one is an alert and a decision.</span> : "Kept on the holding record while the position is held."} className="mb-8">
                {f.signals.length ? (
                  f.signals.map((s) => (
                    <ListRow key={s.id} wrap label={`${s.kind === "kill" ? "Kill signal" : "Trigger"}: ${s.label}`} detail={`${s.reading === null ? "No reading today" : `Today ${n(s.reading)}`}${s.note ? ` · ${s.note}` : ""}`} value={<StatusPill tone={s.met === null ? "neutral" : s.met ? (s.kind === "kill" ? "danger" : "warn") : "ok"}>{s.met === null ? "Unread" : s.met ? "Met" : "Not met"}</StatusPill>} />
                  ))
                ) : (
                  <ListRow wrap label="None on the record" detail="Add kill signals and triggers on the holding record: a field of the ontology or the price, at or past a level." />
                )}
              </ListSection>
            ) : null}
            {on("thesis_evidence") ? (
              <>
                {proposals.error ? <p className="mb-2 px-1 text-footnote text-danger">{proposals.error}</p> : null}
                <AddToThesis ask={ask.ask ? <AskClaudeCard id="add" feature="add_to_thesis" subject={symbol} connected={ask.connected} demo={ws.mode === "demo"} className="card mb-3" /> : undefined} subject={{ kind: "stock", symbol }} pending={proposalFor(proposals.file, { kind: "stock", symbol })} editable={editable} hasModel={ws.hasModelKey} />
                {editable ? (
                  <details className="group mb-4">
                    <summary className="cursor-pointer px-4 py-2 text-subhead text-accent-text">Add a note yourself</summary>
                    <div className="mt-2">
                      <NoteForm subject={{ kind: "stock", symbol }} />
                    </div>
                  </details>
                ) : null}
                <EvidenceList evidence={f.thesis?.evidence ?? []} />
              </>
            ) : null}
          </div>
        </div>

        {on("thesis_figures") ? <FigureGrid figures={f.thesis?.figures ?? []} subject={{ kind: "stock", id: symbol }} editable={editable} /> : null}

        {on("thesis_dcf") ? (
          <section id="valuation" className="mb-8 scroll-mt-20">
            <h2 className="section-header mb-2 px-4">Valuation calculator</h2>
            <ValuationCalculator symbol={symbol} kept={f.thesis?.valuation ?? null} keptDcf={f.thesis?.dcf ?? null} seed={valuationSeed} dcfSeeds={seeds} readings={readings} currency={f.latest?.currency ?? holding?.currency ?? ccy} price={price} priceCurrency={holding?.currency ?? null} asOf={today} editable={editable} action={saveValuationAction} histories={histories} />
          </section>
        ) : null}

        {on("thesis_priced_in") ? (
          <section id="priced-in" className="mb-8 scroll-mt-20" aria-labelledby="priced-in-title">
            <h2 id="priced-in-title" className="section-header mb-2 px-4">
              What the price assumes
            </h2>
            <PricedInPanel facts={pricedFacts} reading={research?.file.pricedIn[symbol]} today={today} editable={editable} hasModel={ws.hasModelKey} />
          </section>
        ) : null}

        {on("thesis_peers") && peers ? (
          <section id="peers" className="mb-8 scroll-mt-20" aria-label="Against its peers and its sector">
            <PeerValuation symbol={symbol} comparison={peers} consensus={histories.consensus ?? null} linkable={(s) => ws.mode !== "demo" || !!book?.holdings.some((h) => h.symbol.toUpperCase() === s.toUpperCase())} />
          </section>
        ) : null}

        {on("thesis_report") ? (
          <section id="results" className="mb-8 scroll-mt-20">
            <h2 className="section-header mb-2 px-4">Latest results</h2>
            {f.latest ? (
              <>
                <EarningsReportCard r={f.latest} />
                <DeckEmbed report={f.latest} title={`${symbol} earnings report`} waiting={deckWaiting(f.latest, ws.hasModelKey, today)} demo={ws.mode === "demo"} studies={f.studies.filter((s) => s.status === "done").map((s) => s.id)} />
              </>
            ) : (
              <ListSection>
                <ListRow wrap label="No results read yet" detail="Once the company reports, the report and its earnings deck are written here from its filings, the methodology, this thesis and the valuation." value={<Link href={"/earnings" as Route} className="text-subhead text-accent-text">Earnings</Link>} />
              </ListSection>
            )}
          </section>
        ) : null}

        {on("thesis_study") ? (
          <section id="study" className="mb-8 scroll-mt-20">
            <h2 className="section-header mb-2 px-4">Study on the stock template</h2>
            {f.study ? (
              <ListSection footer="The decks read its competition, moats, SWOT, valuation and investment questions.">
                <ListLinkRow href={`/research/${f.study.id}` as Route} label={f.study.templateTitle} detail={`${f.study.question || "No question"} · ${longDate((f.study.finishedAt ?? f.study.requestedAt).slice(0, 10))}`} value={<StatusPill tone="ok">Done</StatusPill>} />
                <ListLinkRow href={`/research/${f.study.id}/pdf` as Route} download label="Download as PDF" detail="In the stock template's own face." value={<span className="text-footnote text-accent-text">PDF</span>} />
              </ListSection>
            ) : editable ? (
              <NewStudyForm hasKey={ws.hasModelKey} needsContact={!ws.preferences.edgarContact} subject={symbol} ownClaude={ws.askClaude} />
            ) : (
              <ListSection>
                <ListRow wrap label="No study on file" detail="In your own copy a study of the company is queued from here and written with the AI." />
              </ListSection>
            )}
          </section>
        ) : null}

        {on("thesis_archive") && (earlier.length || otherStudies.length) ? (
          <ListSection grid id="archive" header="Archive" footer="Every earlier report's decks and every earlier study, newest first." className="mb-8">
            {earlier.map((r) => (
              <ListLinkRow key={`${r.symbol}:${r.date}`} href={`/earnings?deck=${encodeURIComponent(symbol)}#decks` as Route} label={`${r.quarter ? r.quarter.replace("/", " ") : "Results"} · ${longDate(r.date)}`} detail={r.headline} value={<span className="text-footnote text-accent-text">Decks</span>} />
            ))}
            {otherStudies.map((s) => (
              <ListLinkRow key={s.id} href={`/research/${s.id}` as Route} label={s.templateTitle} detail={longDate((s.finishedAt ?? s.requestedAt).slice(0, 10))} value={<StatusPill tone={s.status === "done" ? "ok" : s.status === "failed" ? "danger" : "info"}>{s.status}</StatusPill>} />
            ))}
          </ListSection>
        ) : null}
      </PageBody>
    </>
  );
}
