import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/app/action-form";
import { AskClaudeCard } from "@/components/app/ask-claude";
import { AddToThesis } from "@/components/theses/add-to-thesis";
import { askState } from "@/lib/ask-claude-run";
import { ClaudeWrites } from "@/components/theses/claude-writes";
import { partViews } from "@/lib/thesis-writes";
import { EvidenceList } from "@/components/theses/evidence-list";
import { FigureGrid } from "@/components/theses/figure-grid";
import { HunterFinds } from "@/components/theses/hunter-finds";
import { MarketThesisForm } from "@/components/theses/market-thesis-form";
import { NoteForm } from "@/components/theses/note-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { PublishCall } from "@/components/theses/publish-call";
import { ThesisReceipt } from "@/components/theses/thesis-receipt";
import { marketWords } from "@/lib/receipts";
import { StatusPill } from "@/components/ui/status";
import { marketDef } from "@/lib/markets";
import { marketReadings, marketThesisFor, paragraphsOf, PILLAR_TAG_LABEL, pillarReadings } from "@/lib/theses";
import { proposalFor } from "@/lib/thesis-review";
import { companyHref } from "@/lib/company";
import { loadCloses } from "@/lib/markets-feed";
import { measuredFrom } from "@/lib/theses";
import { returnSince, SCORE_BENCHMARK } from "@/lib/thesis-scorecard";
import { localDay, longDate } from "@/lib/time";
import { HISTORY_DAYS } from "@/lib/valuation-history";
import { huntFor, huntKey } from "@/lib/thesis-hunter";
import { screen, thesesFor, thesisHunterFor, thesisProposalsFor, thesisWritesFor } from "@/lib/workspace";

import { removeMarketThesisAction } from "../../actions";

// Hunt now runs the Thesis Hunter on the person's model, with a few web searches.
export const maxDuration = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await screen("overview");
  const { file } = await thesesFor(ws);
  const m = marketThesisFor(file, decodeURIComponent(id));
  return { title: `${m?.title ?? "Market thesis"} · Invariant` };
}

const TAG_TONE = { supported: "ok", mixed: "warn", risk: "danger", unread: "neutral" } as const;
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * One market thesis: the text, the pillars read on today's indicator levels,
 * what to watch, what was added to it (a document the person's Claude read
 * on their own model, or a note of theirs), Add to thesis, and
 * the form to change or remove it (Hamza, 18 Oct 2026).
 */
export default async function MarketThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await screen("overview");
  const { id: raw } = await params;
  const [{ file, error }, proposals, hunter, claudeWrites, ask] = await Promise.all([thesesFor(ws), thesisProposalsFor(ws), thesisHunterFor(ws), thesisWritesFor(ws), askState(ws)]);
  const m = marketThesisFor(file, decodeURIComponent(raw));
  if (!m) notFound();
  const rows = ws.book?.markets?.rows ?? [];
  const readings = marketReadings(rows);
  const pillars = pillarReadings(m.pillars, readings);
  const indicators = [...new Set(m.pillars.map((p) => p.test?.field).filter((f): f is string => !!f))];
  const editable = ws.mode === "drive";
  const asOf = ws.book?.markets?.asOf ?? null;
  // The basket against SPY from the day the thesis was written (Hamza, 23 Oct 2026).
  const from = measuredFrom(m);
  const basketCloses = m.basket.length ? await loadCloses([...m.basket, SCORE_BENCHMARK].join(","), localDay(), "budget", HISTORY_DAYS) : null;
  const members = m.basket.map((s) => ({ s, r: returnSince(basketCloses?.series[s], from.day) }));
  const got = members.filter((x) => x.r !== null);
  const basketPct = got.length ? got.reduce((a, x) => a + x.r!, 0) / got.length : null;
  const spyPct = basketCloses ? returnSince(basketCloses.series[SCORE_BENCHMARK], from.day) : null;
  const sgn = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle="Market thesis"
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/theses/market/${encodeURIComponent(m.id)}/pdf`} download className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
              Export as PDF
            </a>
            <Link href={"/theses" as Route} className={`${buttonStyles({ variant: "secondary", size: "sm" })} border border-hairline`}>
              All theses
            </Link>
          </div>
        }
      />
      <PageBody>
        {error ? <p className="mb-4 px-1 text-footnote text-danger">{error}</p> : null}
        <ClaudeWrites writes={claudeWrites.file.pending.filter((p) => p.key === `market:${m.id}`).map((p) => ({ write: p, parts: partViews(file, p), href: null }))} />
        <div className="flow-cols">
          <div className="flow-col">
            <section id="thesis" className="mb-8 scroll-mt-20">
              <h2 className="section-header mb-2 px-4">The thesis</h2>
              {m.text.trim() ? (
                <div className="card mb-3 px-4 py-4">
                  {paragraphsOf(m.text).map((p, i) => (
                    <p key={i} className={i ? "mt-3 text-body" : "text-body"}>
                      {p}
                    </p>
                  ))}
                  <p className="mt-3 text-caption text-text-tertiary">Updated {longDate(m.updatedAt.slice(0, 10))}</p>
                  <p className="mt-1">
                    <ThesisReceipt words={marketWords(m)} />
                    <PublishCall words={marketWords(m)} keyOf={`market:${m.id}`} email={ws.mode === "drive" ? ws.operator.email : null} />
                  </p>
                </div>
              ) : (
                <ListSection className="mb-3">
                  <ListRow wrap label="No text yet" detail={editable ? "Write it below, or paste the Add to thesis prompt into your Claude with a document." : "The demo's theses are fictional and read-only."} />
                </ListSection>
              )}
              {pillars.length ? (
                <ListSection header="Pillars, read today" footer={asOf ? `Indicators at ${longDate(asOf)}; a pillar within a tenth of its level reads Mixed.` : "No indicator reading yet; the pillars read once the market feed answers."} className="mb-3">
                  {pillars.map((p) => (
                    <ListRow key={p.pillar.id} wrap label={p.pillar.name} detail={`${p.pillar.text}${p.words ? ` ${p.words}` : ""}`} value={<StatusPill tone={TAG_TONE[p.tag]}>{PILLAR_TAG_LABEL[p.tag]}</StatusPill>} />
                  ))}
                </ListSection>
              ) : null}
              {m.watch.length ? (
                <ListSection header="Watch" className="mb-3">
                  {m.watch.map((x) => (
                    <ListRow key={x} wrap label={x} />
                  ))}
                </ListSection>
              ) : null}
              {m.basket.length ? (
                <ListSection grid header={`The basket · ${basketPct === null ? "not measured yet" : `${sgn(basketPct)} against ${SCORE_BENCHMARK} ${spyPct === null ? "n/a" : sgn(spyPct)}`}`} footer={`In equal parts, each from its close on ${longDate(from.day)}${from.approx ? " (the thesis's first evidence or last change, written before the day was kept)" : ", the day the thesis was written"}. Only measured: it changes no rule and buys nothing.${basketCloses?.problems.length ? ` ${basketCloses.problems[0]}` : ""}`} className="mb-3">
                  {members.map((x) => (
                    <ListRow key={x.s} label={<a href={companyHref(x.s)} className="data hover:underline">{x.s}</a>} value={x.r === null ? "n/a" : <span className={spyPct !== null && x.r >= spyPct ? "text-ok" : spyPct !== null ? "text-danger" : ""}>{sgn(x.r)}</span>} />
                  ))}
                </ListSection>
              ) : null}
              {editable ? (
                <details className="group" open={!m.text.trim()}>
                  <summary className="cursor-pointer px-4 py-2 text-subhead text-accent-text">Edit the thesis and its pillars</summary>
                  <div className="mt-2">
                    <MarketThesisForm thesis={m} />
                    <ActionForm action={removeMarketThesisAction} label="Remove the thesis" variant="ghost" size="sm" className="mt-2 px-4" doneHref="/theses">
                      <input type="hidden" name="id" value={m.id} />
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </section>
            {m.text.trim() ? <HunterFinds hunt={huntFor(hunter.file, huntKey({ kind: "market", id: m.id }))} subject={{ kind: "market", id: m.id }} editable={editable} hasModel={ws.hasModelKey} /> : null}
          </div>
          <div className="flow-col">
            {indicators.length ? (
              <ListSection grid header="The indicators it reads" footer="From the Markets feed, read-only; Markets shows each one's history." className="mb-8">
                {indicators.map((sym) => {
                  const row = rows.find((r) => r.symbol === sym) ?? null;
                  const def = marketDef(sym);
                  return <ListRow key={sym} wrap label={def?.name ?? sym} detail={def?.about ?? undefined} value={<span className="data">{row ? n(row.level) : "unread"}</span>} />;
                })}
              </ListSection>
            ) : null}
            {proposals.error ? <p className="mb-2 px-1 text-footnote text-danger">{proposals.error}</p> : null}
            <AddToThesis ask={ask.ask ? <AskClaudeCard id="add" feature="add_to_thesis" subject={m.title} connected={ask.connected} demo={ws.mode === "demo"} className="card mb-3" /> : undefined} subject={{ kind: "market", id: m.id }} pending={proposalFor(proposals.file, { kind: "market", id: m.id })} editable={editable} hasModel={ws.hasModelKey} />
            {editable ? (
              <details className="group mb-4">
                <summary className="cursor-pointer px-4 py-2 text-subhead text-accent-text">Add a note yourself</summary>
                <div className="mt-2">
                  <NoteForm subject={{ kind: "market", id: m.id }} />
                </div>
              </details>
            ) : null}
            <EvidenceList evidence={m.evidence} />
          </div>
        </div>
        <FigureGrid figures={m.figures} subject={{ kind: "market", id: m.id }} editable={editable} />
      </PageBody>
    </>
  );
}
