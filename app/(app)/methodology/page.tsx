import { GitFork, Network, Settings2 } from "lucide-react";
import { AskClaudeCard } from "@/components/app/ask-claude";
import { askState } from "@/lib/ask-claude-run";
import type { Route } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { listingWords, type ListingView } from "@/lib/marketplace";
import { packHeld, RULE_PACKS } from "@/lib/rule-packs";
import { ReviseForm } from "@/components/methodology/builder";
import { ChecksView, ClassesView, FiguresView, GapsView, LayoutView, RulesView, Stat, ViewTabs, VIEWS, type View } from "@/components/methodology/views";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { EvaluationView } from "@/components/methodology/evaluation";
import { ShadowView, VersionsView } from "@/components/methodology/shadow-versions";
import { adoptMethodology, libraryEntry } from "@/lib/library";
import { adoptListing } from "@/lib/marketplace";
import { versionsOf } from "@/lib/methodology-versions";
import { shadowCompare } from "@/lib/shadow";
import { loadCloses } from "@/lib/markets-feed";
import { contextFor, evaluate, type Methodology } from "@/lib/methodology";
import { benchmarkFor, evaluateMethodology, evaluationSymbols } from "@/lib/methodology-evaluation";
import { benchmarksOf, weightsFor } from "@/lib/screens";
import { HISTORY_DAYS } from "@/lib/valuation-history";
import { localDay, longDate } from "@/lib/time";
import { evaluationFor, screen, type Workspace } from "@/lib/workspace";

import { addRulePackAction, confirmDraftAction, discardDraftAction, listMethodologyAction, restoreAction, unlistMethodologyAction } from "./actions";

type Closes = Record<string, { date: string; value: number }[]>;

/** The closes the evaluation reads: five years from the feed, else the book's own, the longer of the two for each symbol. */
function longer(a: Closes, b: Closes): Closes {
  const out: Closes = { ...a };
  for (const [s, pts] of Object.entries(b)) if (!out[s] || pts.length > out[s].length) out[s] = pts;
  return out;
}

/** The shadow methodology's reading on the book (lib/shadow.ts): a library entry, or a listing on the marketplace. */
async function shadowOf(ws: Workspace, m: Methodology, today: string) {
  const id = ws.preferences.shadow;
  if (!id || !ws.book) return null;
  let other: Methodology | null = null;
  if (id.startsWith("market:")) {
    if (ws.mode !== "drive") return null;
    try {
      const { registryAvailable, marketListing } = await import("@/lib/registry");
      const l = registryAvailable() ? await marketListing(id.slice(7), ws.operator.email) : null;
      other = l ? adoptListing(l) : null;
    } catch {
      other = null;
    }
  } else {
    const e = libraryEntry(id);
    other = e ? adoptMethodology(e) : null;
  }
  return other && ws.setup ? shadowCompare(m, other, ws.book, today, ws.setup.inputs) : null;
}

/** When each sealed version was first seen, read from the registry; none in the demo. */
async function versionReceipts(ws: Workspace): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ws.mode !== "drive") return out;
  try {
    const { registryAvailable, receiptOf } = await import("@/lib/registry");
    if (!registryAvailable()) return out;
    for (const v of versionsOf(ws.decisions?.entries ?? []).slice(0, 30)) {
      const at = await receiptOf(v.fingerprint);
      if (at) out.set(v.fingerprint, at);
    }
  } catch {
    // The versions are drawn without their times.
  }
  return out;
}

/** The Evaluation view's reading: since when, whether the person follows it, and each test on the book, the closes and the filings. */
async function evaluationOf(ws: Workspace, m: Methodology, findings: ReturnType<typeof evaluate>, today: string) {
  const book = ws.book!;
  const { weights } = weightsFor(book, m, contextFor(book, today, m));
  const named = benchmarksOf(m);
  const symbols = evaluationSymbols(weights, benchmarkFor(named, book, {}));
  const [read, { file, error }] = await Promise.all([loadCloses(symbols.join(","), today, "budget", HISTORY_DAYS), evaluationFor(ws)]);
  const closes = longer(book.series?.holdings ?? {}, read.series);
  const e = evaluateMethodology({ m, book, file, weights, findings, decisions: ws.decisions, logsDecisions: (m.practices ?? []).includes("decision_log"), benchmarks: named, closes, filings: ws.filings });
  return { e, file, error };
}

export const metadata = { title: "Methodology · Invariant" };
export const maxDuration = 800;

const ORIGIN_WORDS = { document: "Read from", suggested: "Suggested from", library: "Adopted from the library:", sample: "The demo's" } as const;

function Links({ draft }: { draft?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={draft ? "/methodology/graph?draft=1" : "/methodology/graph"} className={buttonStyles({ variant: "secondary", size: "sm" })}>
        <GitFork className="size-4" aria-hidden /> Inspect the graph
      </Link>
      <Link href="/methodology/ontology" className={buttonStyles({ variant: "ghost", size: "sm" })}>
        <Network className="size-4" aria-hidden /> The ontology
      </Link>
      {draft ? null : (
        <Link href="/setup#methodology" className={buttonStyles({ variant: "ghost", size: "sm" })}>
          <Settings2 className="size-4" aria-hidden /> Change or replace it on Setup
        </Link>
      )}
    </div>
  );
}

/** The methodology at a glance: its name and summary, where it came from, and how much of it the app tests. */
function Hero({ m, draft }: { m: Methodology; draft: boolean }) {
  const tested = m.rules.filter((r) => r.test).length;
  return (
    <section className={draft ? "reveal mb-6 rounded-card border border-accent bg-accent-subtle px-4 py-4 lg:px-5" : "reveal mb-6 card px-4 py-4 lg:px-5"} data-tour="methodology-hero">
      <p className="section-header">{draft ? "Draft to confirm" : "In use"}</p>
      <h2 className="mt-1 text-title-2 font-semibold">{m.name}</h2>
      <p className="mt-1 text-footnote text-text-tertiary">
        {ORIGIN_WORDS[m.origin]} {m.source.title}
        {m.adopted ? ` · adopted ${longDate(m.adopted)}` : ""}
        {m.lineage ? ` · forked from ${m.lineage.parent}${m.lineage.credit ? `, by ${m.lineage.credit}` : ""}; your changes are your own` : ""}
      </p>
      <p className="mt-3 max-w-[70ch] text-subhead text-text-secondary">{m.summary}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Classes" value={m.classes.length} />
        <Stat label="Rules" value={m.rules.length} />
        <Stat label="The app tests" value={tested} tone="ok" />
        <Stat label="Figures" value={m.figures.length} />
      </div>
    </section>
  );
}

/**
 * The rules the person invests by, read as a graph the app computes from:
 * a summary, then one part at a time behind tabs (checks, classes, rules,
 * figures, the dashboard's shape, gaps). Choosing, uploading, suggesting
 * and the model live on Setup; a draft waits here to be checked, trimmed
 * and confirmed.
 */
export default async function MethodologyPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [ws, sp] = await Promise.all([screen("methodology"), searchParams]);
  const { setup, book } = ws;
  const m = ws.draft ?? setup.methodology;
  const editable = !!ws.draft;
  const today = localDay();
  const findings = m && book ? evaluate(m, book, today, setup.inputs) : null;
  const fallback: View = findings && !editable ? "checks" : "rules";
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") && ((sp.view !== "checks" && sp.view !== "evaluation" && sp.view !== "shadow") || (findings && !editable)) ? (sp.view as View) : fallback;
  const judged = view === "evaluation" && m && findings ? await evaluationOf(ws, m, findings, today) : null;
  const evalAsk = judged ? await askState(ws) : { ask: false, connected: null };
  const shadow = view === "shadow" && m && book ? await shadowOf(ws, m, today) : null;
  const sealed = view === "versions" ? await versionReceipts(ws) : new Map<string, string>();
  // The person's own listing on the marketplace (Hamza, 9 Nov 2026), read only in their own app.
  let listing: ListingView | null = null;
  if (ws.mode === "drive" && !editable && m) {
    try {
      const { registryAvailable, myListing } = await import("@/lib/registry");
      if (registryAvailable()) listing = await myListing(ws.operator.email);
    } catch {
      listing = null;
    }
  }
  const counts = m ? { ...(findings && !editable ? { checks: findings.length, evaluation: null, shadow: null } : {}), classes: m.classes.length, rules: m.rules.length, figures: m.figures.length, layout: m.dashboard.sections.length, versions: versionsOf(ws.decisions?.entries ?? []).length, gaps: m.gaps.length } : {};

  return (
    <>
      <PageHeader title="Methodology" subtitle={m ? "The rules you invest by, as the app reads and tests them." : "The rules you invest by. Choose one on Setup."} />
      <PageBody>
        {!m ? (
          <EmptyState
            icon={GitFork}
            title="No methodology yet"
            instruction="Choose a ready-made one, upload your document or ask for a suggestion on Setup. It opens here as a draft you check and confirm."
            action={
              <Link href="/setup#methodology" className={buttonStyles({ variant: "primary" })}>
                Choose one on Setup
              </Link>
            }
          />
        ) : (
          <>
            <Hero m={m} draft={editable} />
            {editable ? (
              <div className="mb-6 card px-4 py-4 lg:px-5">
                <p className="text-subhead">Check each class, rule and figure below. Remove what you do not want with the ×{ws.mode === "drive" ? ", or ask for a change in words" : ""}. Confirming rebuilds your dashboard around it; discarding leaves everything as it is.</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ActionButton action={confirmDraftAction} label="Confirm and rebuild" doneLabel="Confirmed" />
                  {ws.mode === "demo" && ws.demo?.draft?.drop.length ? <ActionButton action={restoreAction} label={`Put back ${ws.demo.draft.drop.length} removed`} variant="secondary" doneLabel="Put back" /> : null}
                  <ActionButton action={discardDraftAction} label="Discard" variant="ghost" doneLabel="Discarded" />
                </div>
                {ws.mode === "drive" && ws.hasModelKey ? (
                  <div className="mt-4 border-t border-hairline pt-4">
                    <ReviseForm />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mb-6">
              <Links draft={editable} />
            </div>
            <ViewTabs current={view} counts={counts} base="/methodology" />
            <div data-tour="methodology-view">
              {view === "checks" && findings ? <ChecksView findings={findings} m={m} ccy={book!.fx.base} /> : null}
              {view === "evaluation" && judged && m ? <EvaluationView e={judged.e} file={judged.file} m={m} editable={ws.mode === "drive"} canSuggest={ws.mode === "drive" && !!ws.hasModelKey && !evalAsk.ask} error={judged.error} ask={evalAsk.ask ? <AskClaudeCard feature="evaluation" connected={evalAsk.connected} demo={ws.mode === "demo"} className="mt-1" /> : undefined} /> : null}
              {view === "classes" ? <ClassesView m={m} book={book} today={today} inputs={setup.inputs} editable={editable} /> : null}
              {view === "rules" ? <RulesView m={m} ccy={book?.fx.base ?? setup.baseCurrency} editable={editable} /> : null}
              {view === "figures" ? <FiguresView m={m} book={book} today={today} inputs={setup.inputs} editable={editable} /> : null}
              {view === "layout" ? <LayoutView m={m} /> : null}
              {view === "gaps" ? <GapsView m={m} /> : null}
              {view === "shadow" ? <ShadowView cmp={shadow} chosen={ws.preferences.shadow} editable={ws.mode === "drive"} /> : null}
              {view === "versions" ? <VersionsView entries={ws.decisions?.entries ?? []} sealed={sealed} /> : null}
            </div>
            <div className="mt-8 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
              <ListSection header="Rule packs" grid footer="A few common rules, each with the figure it tests. Adding one makes a draft you check and confirm; a rule you already have is kept as it is. Remove any part of it with the × before confirming.">
                {RULE_PACKS.map((p) => (
                  <ListRow
                    key={p.id}
                    wrap
                    label={p.name}
                    detail={`${p.about} ${p.rules.map((r) => r.text).join(" ")}`}
                    value={
                      packHeld(m, p) ? (
                        <span className="text-footnote text-text-tertiary">In your methodology</span>
                      ) : (
                        <ActionForm action={addRulePackAction} label="Add as a draft" pendingLabel="Adding" doneLabel="Draft ready" variant="secondary" size="sm">
                          <input type="hidden" name="pack" value={p.id} />
                        </ActionForm>
                      )
                    }
                  />
                ))}
              </ListSection>
              {!editable ? (
                <section className="mb-8" aria-labelledby="market-listing">
                  <h2 id="market-listing" className="section-header mb-2 px-1">On the marketplace</h2>
                  <div className="card space-y-3 px-4 py-4 text-subhead">
                    {listing ? (
                      <p>
                        Listed as <span className="font-semibold">{listing.name}</span>, by {listing.credit}: {listingWords(listing)}. Adopted by {listing.adopters} {listing.adopters === 1 ? "person" : "people"}.
                      </p>
                    ) : (
                      <p className="text-text-secondary">List the methodology in use so others can adopt it as a draft, credited to you. Only its figures, classes and rules go, never a holding, an amount or your document. Free for now.</p>
                    )}
                    {ws.mode === "drive" ? (
                      <ActionForm action={listMethodologyAction} label={listing ? "List it again as it is now" : "List it"} pendingLabel="Listing" doneLabel="Listed" variant="secondary" size="sm">
                        <label className="block text-footnote text-text-secondary">
                          Credited to
                          <input name="credit" defaultValue={listing?.credit ?? ""} maxLength={60} required className="mt-1 block w-full rounded-[10px] border border-hairline bg-surface-2 px-3 py-2 text-subhead text-text" placeholder="The name others see" />
                        </label>
                      </ActionForm>
                    ) : (
                      <p className="text-footnote text-text-tertiary">The demo lists nothing.</p>
                    )}
                    {listing ? <ActionButton action={unlistMethodologyAction} label="Take it off the shelf" variant="ghost" doneLabel="Taken off" /> : null}
                    <p className="text-footnote">
                      <Link href={"/methodology/market" as Route} className="text-accent-text underline-offset-4 hover:underline">
                        Browse the marketplace
                      </Link>
                    </p>
                  </div>
                </section>
              ) : null}
            </div>
          </>
        )}
        <p className="mt-8 px-1 text-footnote text-text-tertiary">Each rule cites its section in your document. A rule the app cannot measure is yours to check, never passing. Not investment advice.</p>
      </PageBody>
    </>
  );
}
