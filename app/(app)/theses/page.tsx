import { Lightbulb } from "lucide-react";
import type { Route } from "next";

import { ClassTag } from "@/components/app/figures";
import { SampleNote } from "@/components/app/sample-note";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { ClaudePromptCard, FILL_STEPS } from "@/components/theses/claude-prompt";
import { ClaudeWrites } from "@/components/theses/claude-writes";
import { MarketThesisForm } from "@/components/theses/market-thesis-form";
import { ThesisScorecard } from "@/components/theses/scorecard";
import { GridSection, ThesisCard } from "@/components/theses/thesis-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { deriveScreens } from "@/lib/screen-data";
import { STAGE } from "@/lib/ontology";
import { fillThesesPrompt, holdingFolder, marketReadings, MAX_MARKET_THESES, pillarReadings, thesesSubjects, thesisFor, type HoldingFolder } from "@/lib/theses";
import { loadCloses } from "@/lib/markets-feed";
import { scorecardSymbols, thesisScorecard } from "@/lib/thesis-scorecard";
import { CALIBRATION_DAYS, calibrationOf } from "@/lib/judgement";
import { addDaysTo } from "@/lib/time";
import { localDay, longDate } from "@/lib/time";
import { HISTORY_DAYS } from "@/lib/valuation-history";
import { claudeWriteHref, partViews } from "@/lib/thesis-writes";
import { earningsFor, screen, thesesFor, thesisWritesFor } from "@/lib/workspace";

export const metadata = { title: "Theses · Invariant" };

type Folder = { s: ReturnType<typeof thesesSubjects>[number]; w: { weight: number; classId: string | null; classLabel: string } | null; f: HoldingFolder };

/**
 * Theses, split into Market theses and Stock theses, the latter as holdings
 * and watchlist (Hamza, 18 Oct 2026). A market thesis is what the person
 * believes about rates, a cycle or a theme, its pillars read on the
 * indicators; a stock thesis is one folder per holding, as HCMP keeps them in
 * Drive (Hamza, 16 Oct 2026): the thesis written or not, how its pillars read
 * today, the kill signals, the valuation against the price and the latest
 * results. The person's own Claude fills either in through the connector.
 */
export default async function ThesesPage() {
  const ws = await screen("overview");
  const { setup, book } = ws;
  const today = localDay();
  const [{ file, error }, earnings, claudeWrites] = await Promise.all([thesesFor(ws), earningsFor(ws), thesisWritesFor(ws)]);
  const held = new Set((book?.holdings ?? []).map((h) => h.symbol.toUpperCase()));
  const watchlist = Object.keys(ws.records.bySymbol).filter((s) => !held.has(s.toUpperCase()));
  const subjects = thesesSubjects(book?.holdings ?? [], file, watchlist);
  const data = book ? deriveScreens({ book, methodology: setup.methodology, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today) : null;
  const slots = data?.slots("theses") ?? [];
  const on = (id: (typeof slots)[number]) => !data || slots.includes(id);
  const folders: Folder[] = subjects.map((s) => {
    const holding = book?.holdings.find((h) => h.symbol.toUpperCase() === s.symbol) ?? null;
    const w = data?.weights.find((x) => x.symbol === s.symbol) ?? null;
    return { s, w, f: holdingFolder({ symbol: s.symbol, holding, thesis: thesisFor(file, s.symbol), earnings: earnings.file, studies: ws.research.studies }) };
  });
  const holdingsFolders = folders.filter((x) => x.s.held);
  const watchFolders = folders.filter((x) => !x.s.held);
  const written = holdingsFolders.filter((x) => x.f.thesis?.text.trim()).length;
  const owed = holdingsFolders.filter((x) => !x.f.thesis?.text.trim()).map((x) => x.s.symbol);
  const markets = file?.markets ?? [];
  const readings = marketReadings(book?.markets?.rows ?? []);
  const editable = ws.mode === "drive";
  // The scorecard reads the closes the company pages read (five years, shared), so a thesis of any age is measured.
  const scored = on("thesis_scorecard") ? scorecardSymbols(file, subjects) : [];
  const closes = scored.length > 1 ? await loadCloses(scored.join(","), today, "budget", HISTORY_DAYS) : null;
  const card = closes ? thesisScorecard(file, subjects, closes.series) : null;
  const scoreOf = (key: string) => card?.rows.find((r) => r.key === key) ?? null;
  // The calibration score (Hamza, 9 Nov 2026): each own valuation set a year ago or more, against the close a year after it was set.
  const valuations = Object.fromEntries(Object.entries(ws.records.bySymbol).map(([s, r]) => [s.toUpperCase(), r.ownValuation ?? null]));
  const dueSymbols = on("thesis_calibration") ? Object.entries(valuations).filter(([, v]) => v && addDaysTo(v.asOf, CALIBRATION_DAYS) <= today).map(([s]) => s).slice(0, 40) : [];
  const calCloses = dueSymbols.length ? await loadCloses(dueSymbols.join(","), today, "budget", HISTORY_DAYS) : null;
  const calibration = on("thesis_calibration") ? calibrationOf(valuations, calCloses?.series ?? {}, today) : null;
  const againstFact = (key: string) => {
    const r = scoreOf(key);
    return r?.againstPct != null ? [{ label: "Against SPY", value: `${r.againstPct > 0 ? "+" : ""}${r.againstPct.toFixed(1)} pts since ${longDate(r.since)}` }] : [];
  };
  const marketCard = (m: (typeof markets)[number]) => {
    const pr = pillarReadings(m.pillars, readings);
    const supported = pr.filter((p) => p.tag === "supported").length;
    const tested = pr.filter((p) => p.tag !== "unread").length;
    const risk = pr.some((p) => p.tag === "risk");
    const facts = [
      { label: "Pillars", value: tested ? `${supported} of ${tested} supported` : m.pillars.length ? `${m.pillars.length}, unread` : "none" },
      { label: "To watch", value: m.watch.length ? String(m.watch.length) : "none" },
      { label: "Added", value: m.evidence.length ? String(m.evidence.length) : "nothing yet" },
      { label: "Updated", value: m.text.trim() ? longDate(m.updatedAt.slice(0, 10)) : "no text yet" },
      ...againstFact(`market:${m.id}`),
    ];
    return <ThesisCard key={m.id} href={`/theses/market/${encodeURIComponent(m.id)}` as Route} title={m.title} note={m.text.trim() || undefined} facts={facts} pill={<StatusPill tone={risk ? "danger" : tested ? "ok" : "neutral"}>{risk ? "Pillar at risk" : tested ? "Supported" : "Unread"}</StatusPill>} />;
  };
  const stockCard = ({ s, w, f }: Folder) => {
    const supported = f.pillars.filter((p) => p.tag === "supported").length;
    const tested = f.pillars.filter((p) => p.tag !== "unread").length;
    const kills = f.signals.filter((x) => x.kind === "kill");
    const killsMet = kills.filter((x) => x.met).length;
    const chosen = f.valuation.result.chosen;
    const gap = chosen?.vsPricePct?.base ?? null;
    const stage = f.valuation.result.stage;
    const facts = [
      { label: "Thesis", value: f.thesis?.text.trim() ? longDate(f.thesis.updatedAt.slice(0, 10)) : "none yet" },
      { label: "Pillars", value: tested ? `${supported} of ${tested} supported` : f.pillars.length ? `${f.pillars.length}, untested` : "none" },
      { label: "Kill signals", value: kills.length ? `${killsMet} of ${kills.length} met` : "none" },
      ...(stage ? [{ label: "Stage", value: `${STAGE[stage].n} ${STAGE[stage].label}` }] : []),
      { label: "Valuation", value: chosen ? `${chosen.short} base ${chosen.cases!.base.toLocaleString("en-US", { maximumFractionDigits: 0 })}${gap !== null ? ` · ${Math.abs(gap).toFixed(0)}% ${gap >= 0 ? "below" : "above"}` : ""}` : "none" },
      ...(f.latest ? [{ label: "Results", value: longDate(f.latest.date) }] : []),
      ...againstFact(`stock:${s.symbol}`),
    ];
    const tone = killsMet ? "danger" : f.pillars.some((p) => p.tag === "risk") ? "warn" : f.thesis?.text.trim() ? "ok" : "neutral";
    return (
      <ThesisCard
        key={s.symbol}
        href={`/theses/${encodeURIComponent(s.symbol)}` as Route}
        title={<span className="data">{s.symbol}</span>}
        aside={w ? `${w.weight.toFixed(2)}%` : undefined}
        subtitle={s.name && s.name !== s.symbol ? s.name : undefined}
        tags={
          ws.shown.classes && w ? (
            <>
              <ClassTag label={w.classId ? w.classLabel : null} />
              {!s.held ? <StatusPill tone="neutral">{s.watched ? "Watched" : "Not held"}</StatusPill> : null}
            </>
          ) : !s.held ? (
            <StatusPill tone="neutral">{s.watched ? "Watched" : "Not held"}</StatusPill>
          ) : undefined
        }
        facts={facts}
        pill={<StatusPill tone={tone}>{killsMet ? "Kill signal met" : f.pillars.some((p) => p.tag === "risk") ? "Pillar at risk" : f.thesis?.text.trim() ? "On file" : `${f.owed.length} owed`}</StatusPill>}
      />
    );
  };
  return (
    <>
      <PageHeader title="Theses" fresh={<ScreenFreshness />} subtitle={`${markets.length} market ${markets.length === 1 ? "thesis" : "theses"}; ${written} of ${holdingsFolders.length} holdings have one${watchFolders.length ? `, ${watchFolders.length} on the watchlist` : ""}. Each stock folder holds the thesis and its pillars, the kill signals, the Valuation calculator, the latest results with both decks, and the study.`} />
      <PageBody>
        {ws.book && ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={ws.book.asOf} /> : null}
        {error ? <p className="mb-4 px-1 text-footnote text-danger">{error}</p> : null}
        {claudeWrites.error ? <p className="mb-4 px-1 text-footnote text-danger">{claudeWrites.error}</p> : null}
        {/* What the person's own Claude proposed through write_thesis, every thesis's, waiting for them (Hamza, 9 Nov 2026). */}
        <ClaudeWrites writes={claudeWrites.file.pending.map((p) => ({ write: p, parts: partViews(file, p), href: p.isNew ? null : claudeWriteHref(p) }))} />

        {/* The prompt for the person's own Claude, above the theses and folded shut until the arrow opens it (Hamza, 19 Oct 2026). */}
        {ws.mode !== "demo" || folders.length ? <ClaudePromptCard id="fill" title="Fill the theses in with your own Claude" intro={owed.length ? `${owed.length} ${owed.length === 1 ? "holding has" : "holdings have"} no thesis yet. Your Claude reads each one's figures, filings, class and rules through the Invariant connector and writes the thesis for you to review.` : "Every holding has a thesis. Your Claude can still write one over again, or add the market theses, through the Invariant connector."} steps={FILL_STEPS} prompt={fillThesesPrompt(owed, markets.length > 0)} demo={ws.mode === "demo"} /> : null}

        {card ? <ThesisScorecard card={card} problems={closes?.problems ?? []} /> : null}
        {calibration && (calibration.rows.length || calibration.waiting.length) ? (
          <section className="mb-8" aria-labelledby="calibration">
            <h2 id="calibration" className="section-header mb-2 px-1">Your valuations, a year on</h2>
            <div className="card px-4 py-3 text-subhead">
              {calibration.judged ? (
                <p>
                  <span className="data font-semibold">{calibration.inside} of {calibration.judged}</span> bear-to-bull ranges held the price a year after they were set ({calibration.sharePct}%); the base was {calibration.medianBaseGapPct}% from the price, the median.
                </p>
              ) : (
                <p className="text-text-secondary">No valuation is a year old yet.</p>
              )}
              {calibration.rows.filter((r) => r.side).length ? (
                <ul className="mt-2 space-y-1 text-footnote text-text-secondary">
                  {calibration.rows.filter((r) => r.side).slice(0, 10).map((r) => (
                    <li key={r.symbol}>
                      <span className="data text-text">{r.symbol}</span>{` set ${longDate(r.asOf)}: ${r.low} to ${r.high}, base ${r.base}; ${r.price!.toFixed(2)} a year on, ${r.side === "inside" ? "inside the range" : r.side === "below" ? "below the bear" : "above the bull"}`}
                    </li>
                  ))}
                </ul>
              ) : null}
              {calibration.waiting.length ? <p className="mt-2 text-footnote text-text-tertiary">{`${calibration.waiting.length} more ${calibration.waiting.length === 1 ? "is" : "are"} judged a year after being set, the first on ${longDate(calibration.waiting[0].due)} (${calibration.waiting[0].symbol}).`}</p> : null}
            </div>
            <p className="mt-2 px-1 text-caption text-text-tertiary">Calibration scores your own bear, base and bull per share against what the price did, a year on: a range that holds the price about as often as you meant it to is a calibrated one. Never a forecast or advice.</p>
          </section>
        ) : null}

        {on("thesis_markets") ? (
          <GridSection id="markets" header={`Market theses · ${markets.length}`} footer="What you believe about the market itself: rates, a cycle, a sector, a theme. Each pillar is read on an indicator the app reads every day. A basket names the companies that express it, scored against SPY above; a market thesis changes no rule.">
            {markets.length ? markets.map(marketCard) : <div className="card px-4 py-3 text-body sm:col-span-2 lg:col-span-3"><span className="block">No market thesis yet</span><span className="mt-0.5 block text-footnote text-text-secondary">{editable ? "Write one below, or have your Claude write it through the connector." : "The demo keeps one fictional market thesis per sample; this sample has none."}</span></div>}
            {editable && markets.length < MAX_MARKET_THESES ? (
              <details className="group sm:col-span-2 lg:col-span-3">
                <summary className="cursor-pointer px-4 py-2 text-subhead text-accent-text">New market thesis</summary>
                <div className="mt-2">
                  <MarketThesisForm thesis={null} />
                </div>
              </details>
            ) : null}
          </GridSection>
        ) : null}

        {!folders.length ? (
          <EmptyState icon={Lightbulb} title="No listed equity yet" instruction="Stock theses are kept per listed holding and per watchlist symbol. Add a broker or a statement on Setup, or a symbol on Watchlist, and each gets a folder here." action={null} />
        ) : (
          <>
            <h2 className="section-header mb-2 px-1">Stock theses</h2>
            {([
              ["holdings", `Holdings · ${holdingsFolders.length}`, holdingsFolders, "Open a holding for its thesis, pillars, kill signals, valuation, decks and study. A thesis is yours; the app reads the figures against it and never rewrites it."],
              ["watchlist", `Watchlist · ${watchFolders.length}`, watchFolders, "A thesis for a company you watch but do not hold, read on the price alone until it is held; a symbol with a thesis that is no longer held or watched stays here."],
            ] as const).map(([key, header, list, footer]) =>
              list.length || key === "holdings" ? (
                <GridSection key={key} id={key} header={header} footer={footer} className="mb-6">
                  {!list.length ? <div className="card px-4 py-3 text-body sm:col-span-2 lg:col-span-3"><span className="block">No holding yet</span><span className="mt-0.5 block text-footnote text-text-secondary">Add a broker or a statement on Setup.</span></div> : null}
                  {list.map(stockCard)}
                </GridSection>
              ) : null,
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
