import { NotebookPen } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { ActionForm } from "@/components/app/action-form";
import { NoFigures } from "@/components/app/no-figures";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { DECISION_KINDS, DECISION_LABEL, decisionsFor, outcomeWords, sortedDecisions, type Decision, type DecisionKind } from "@/lib/decisions";
import { deriveScreens } from "@/lib/screen-data";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";
import { letterFor } from "@/lib/judgement-run";

import { addDecisionAction, editDecisionAction, removeDecisionAction } from "./actions";

export const metadata = { title: "Decision Log · Invariant" };

const KIND_TONE: Record<DecisionKind, "warn" | "info" | "neutral"> = { trade: "warn", vote: "info", methodology: "neutral", note: "neutral", plan: "info" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

const SYMBOL = /^[A-Z0-9.\-]{1,40}$/;

type Query = { symbol?: string; kind?: string; title?: string; text?: string };

/** One entry, folded to its date, kind and title; open, its text, its symbol, Edit and Remove. */
function Entry({ d }: { d: Decision }) {
  const paragraphs = d.text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  return (
      <details className="group px-4 py-3">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="data text-footnote text-text-secondary">{longDate(d.date)}</span>
            <StatusPill tone={KIND_TONE[d.kind]}>{DECISION_LABEL[d.kind]}</StatusPill>
            {d.symbol ? <span className="data text-footnote text-text-secondary">{d.symbol}</span> : null}
            {d.action ? <StatusPill tone="ok">{outcomeWords(d.action)}</StatusPill> : null}
            {d.via === "claude" ? <span className="text-caption text-text-tertiary">Written by your Claude</span> : null}
          </div>
          <p className="mt-1 text-body font-medium">{d.title}</p>
        </summary>
        <div className="mt-3 space-y-2 text-subhead">
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="text-text-tertiary">No text.</p>}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {d.symbol ? (
              <Link href={`/holdings/${encodeURIComponent(d.symbol)}` as Route} className="text-subhead text-accent-text">
                {d.symbol}
              </Link>
            ) : null}
            <ActionForm action={removeDecisionAction} label="Remove" variant="ghost" size="sm">
              <input type="hidden" name="id" value={d.id} />
            </ActionForm>
          </div>
          <details className="pt-1">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Edit</summary>
            <ActionForm action={editDecisionAction} label="Save the entry" pendingLabel="Saving" variant="secondary" size="sm" className="mt-3">
              <input type="hidden" name="id" value={d.id} />
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-subhead">
                  Date
                  <input name="date" type="date" className={`${field} data`} defaultValue={d.date} required />
                </label>
                <label className="block text-subhead">
                  Kind
                  <select name="kind" className={field} defaultValue={d.kind}>
                    {DECISION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {DECISION_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-subhead">
                Symbol, if one
                <input name="symbol" className={`${field} data uppercase`} maxLength={40} defaultValue={d.symbol ?? ""} autoComplete="off" />
              </label>
              <label className="mt-3 block text-subhead">
                Title
                <input name="title" className={field} maxLength={120} defaultValue={d.title} required />
              </label>
              <label className="mt-3 mb-3 block text-subhead">
                Text
                <textarea name="text" rows={5} maxLength={4000} className={field} defaultValue={d.text} />
              </label>
              {d.action ? <p className="mb-3 text-footnote text-text-tertiary">The decision it records ({outcomeWords(d.action)}) stays as filed; file a new one from the item to change it.</p> : null}
            </ActionForm>
          </details>
        </div>
      </details>
  );
}

/**
 * The person's own record of what they decided and why. Entries are kept in
 * their vault (this browser in the demo); the Trade check links here with a
 * draft, and the Trades screen asks whether each sale has an entry.
 */
export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const ws = await screen("overview");
  if (!ws.book)
    return (
      <>
        <PageHeader title="Decision Log" />
        <PageBody>
          <NoFigures what="Decisions" />
        </PageBody>
      </>
    );
  const today = localDay();
  const data = deriveScreens({ book: ws.book, methodology: ws.setup.methodology, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("decisions");
  const filter = q.symbol?.toUpperCase().trim() || "";
  const filtered = SYMBOL.test(filter) ? filter : null;
  const entries = filtered ? decisionsFor(ws.decisions, filtered) : sortedDecisions(ws.decisions);
  const kept = ws.mode === "demo" ? "kept in this browser" : "kept in your vault";
  const draftKind = (DECISION_KINDS as readonly string[]).includes(q.kind ?? "") ? (q.kind as DecisionKind) : "note";
  const draftSymbol = (q.symbol ?? "").toUpperCase().trim();
  const n = entries.length;
  // The monthly letter on how you decided (Hamza, 9 Nov 2026): the same as the monthly review carries, read now for this month.
  const letter = slots.includes("decision_letter") && !filtered ? await letterFor(ws.book, ws.setup.methodology, ws.setup.inputs, ws.decisions, ws.records, today).catch(() => null) : null;

  return (
    <>
      <PageHeader title="Decision Log" subtitle={filtered ? `${n} ${n === 1 ? "entry" : "entries"} naming ${filtered}` : `${n} ${n === 1 ? "entry" : "entries"}, newest first · ${kept}`} />
      <PageBody>
        {!filtered && n ? (
          <p className="mb-4 text-footnote text-text-secondary">
            <a href="/decisions/pdf" className="text-accent-text underline-offset-4 hover:underline">
              Export the journal as a sealed PDF
            </a>
            : every entry oldest first, each amount masked, with a fingerprint anyone can check, so it cannot be backdated.
          </p>
        ) : null}
        {filtered ? (
          <div className="mb-6">
            <Link href="/decisions" className="inline-flex h-9 items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">
              Show all entries
            </Link>
          </div>
        ) : null}
        {letter ? (
          <ListSection grid className="mb-8" header={`How you decided this month: ${letter.summary}`} footer="Read by the app from this log, your valuations, your rules and the prices since; the monthly review carries the same. It scores how you decided, never the money made. Not advice.">
            {letter.lines.map((l) => (
              <ListRow key={l.label} wrap label={l.label} detail={l.detail} value={<StatusPill tone={l.tone}>{l.value}</StatusPill>} />
            ))}
          </ListSection>
        ) : null}
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {slots.includes("decision_form") ? (
            <ListSection header="New entry" footer="A trade names the symbol and the reason; a vote records how you voted and why; a methodology entry records what changed in the document. The log is yours; nothing is sent anywhere.">
              <ActionForm action={addDecisionAction} label="File the entry" pendingLabel="Filing" variant="secondary" size="sm" className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <label className="block text-subhead">
                    Date
                    <input name="date" type="date" className={`${field} data`} defaultValue={today} required />
                  </label>
                  <label className="block text-subhead">
                    Kind
                    <select name="kind" className={field} defaultValue={draftKind}>
                      {DECISION_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {DECISION_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-3 block text-subhead">
                  Symbol, if one
                  <input name="symbol" className={`${field} data uppercase`} maxLength={40} defaultValue={SYMBOL.test(draftSymbol) ? draftSymbol : ""} autoComplete="off" />
                </label>
                <label className="mt-3 block text-subhead">
                  Title
                  <input name="title" className={field} maxLength={120} defaultValue={(q.title ?? "").slice(0, 120)} required />
                </label>
                <label className="mt-3 mb-3 block text-subhead">
                  Text
                  <textarea name="text" rows={5} maxLength={4000} className={field} defaultValue={(q.text ?? "").slice(0, 4000)} placeholder="What you decided, the rule it rests on, and what would change your mind." />
                </label>
              </ActionForm>
            </ListSection>
          ) : null}
          {slots.includes("decision_entries") ? (
            <div>
              {entries.length ? (
                <ListSection grid header={filtered ? `Entries naming ${filtered}` : `Entries · ${entries.length}`}>
                  {entries.map((d) => <Entry key={d.id} d={d} />)}
                </ListSection>
              ) : (
                <ListSection header={filtered ? `Entries naming ${filtered}` : "Entries"}>
                  <EmptyState icon={NotebookPen} title={filtered ? `No entry names ${filtered}` : "No entries yet"} instruction={filtered ? "File one with the symbol, or show all entries." : "File a trade, a vote, a change to the methodology or a note. The Trades screen asks whether each sale has an entry within a week."} action={null} />
                </ListSection>
              )}
            </div>
          ) : null}
        </div>
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
