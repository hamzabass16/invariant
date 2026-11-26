import { Bot, BookOpenCheck, Mic, Building2, CalendarClock, FileSearch, Search, FolderLock, Landmark, Layers, Lightbulb, Mail, Newspaper, Plug, RefreshCw, Sparkles, UserRound, Wallet, Home, Upload, KeyRound, ListOrdered, Trash2, History, AudioLines } from "lucide-react";
import Link from "next/link";
import { checkNewslettersAction } from "@/app/(app)/newsletters/actions";
import type { KeptConfirmation } from "@/app/(app)/statements/actions";
import { RecapChoiceForm } from "@/components/markets/recap-controls";
import { FilterBuilder } from "@/components/newsletters/filter-builder";
import { ForwardingWatch } from "@/components/statements/forwarding-watch";
import { InboxCheck } from "@/components/statements/inbox-check";
import { BACKFILL_DAYS, type ForwardingProof, type NewsletterSendersFile } from "@/lib/newsletters";
import { PODCAST_DAYS, PODSCRIPTS, showUrl, type PodcastShow } from "@/lib/podcasts";
import { recapNewslettersFor } from "@/lib/market-recap";

import { draftFromDriveAction, removeMethodologyAction, startDocumentUploadAction, suggestAction, uploadAction } from "@/app/(app)/methodology/actions";
import { withdrawEdgarContactAction } from "@/app/(app)/research/actions";
import { addPodcastAction, removePodcastAction } from "@/app/(app)/setup/podcast-actions";
import { saveFirstThesisAction } from "@/app/(app)/theses/actions";
import { connectSnapTradeAction, fetchNowAction, importBookAction, morningRefreshAction, removeEtoroAction, removeFlexAction, removeSnapTradeAction } from "@/app/(app)/setup/actions";
import { dropBucketAction } from "@/app/(app)/setup/vault-actions";
import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { FileAction } from "@/components/app/file-action";
import { SampleButton } from "@/components/methodology/builder";
import { LibraryCards } from "@/components/methodology/library";
import { PortfoliosSection } from "@/components/portfolios/portfolios-section";
import { RecapGuide } from "@/components/newsletters/recap-guide";
import { EdgarContactForm } from "@/components/research/forms";
import { FlexGuideBody, FlexHistoryDates, flexHistorySteps } from "@/components/setup/flex-guide";
import { BucketForm, EtoroForm, FlexTokenForm, SnapTradeForm } from "@/components/setup/forms";
import { CHATGPT_STEPS, CLAUDE_STEPS, ETORO_STEPS, mailSteps, newsletterSteps, OTHER_ASSET_STEPS, PROPERTY_STEPS, SNAPTRADE_STEPS, Steps } from "@/components/setup/guides";
import { Fold, SetupCard, type CardState, type Fact } from "@/components/setup/setup-card";
import { buttonStyles } from "@/components/ui/button";
import type { FlexSummary, KeySummary, SyncSource, SyncStep } from "@/lib/connections";
import type { Book } from "@/lib/holdings";
import type { Methodology } from "@/lib/methodology";
import type { ProviderSummary } from "@/lib/model-provider";
import type { Preferences } from "@/lib/preferences";
import type { PortfoliosFile } from "@/lib/portfolios";
import { INPUTS, PROFILES, type Setup } from "@/lib/setup";
import { atUtcHour, localDay, daysBetween } from "@/lib/time";
import type { VaultInfo } from "@/lib/vault";

export type Line = { source: SyncSource; label: string; line: string; outcome: SyncStep["outcome"] };

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one.endsWith("s") ? `${one}es` : one.endsWith("y") ? `${one.slice(0, -1)}ies` : `${one}s`}`;

/** What a part of the book holds: holdings, accounts, the day it is as of and the days of account value. */
export function bookLine(book: Book | null, source?: Book["holdings"][number]["source"]): string | null {
  if (!book) return null;
  const hs = source ? book.holdings.filter((h) => h.source === source) : book.holdings;
  if (!hs.length) return null;
  const accounts = new Set(hs.map((h) => h.account)).size;
  const days = source === "ibkr" || !source ? (book.series?.nav.length ?? 0) : 0;
  return `${plural(hs.length, "holding")} in ${plural(accounts, "account")}, as of ${day(book.asOf)}${days ? `, with ${days} days of account value` : ""}.`;
}

const lineOf = (lines: Line[], source: SyncSource) => lines.find((l) => l.source === source) ?? null;
const lineFact = (label: string, l: Line | null): Fact | null => (l ? { label, value: l.line, tone: l.outcome === "failed" ? "warn" : l.outcome === "ok" ? undefined : "muted" } : null);
const facts = (xs: (Fact | null | false)[]): Fact[] => xs.filter((x): x is Fact => !!x);

// ---------------------------------------------------------------------------
// 01 · Your rules

export type MethodologyProps = { m: Methodology | null; draft: Methodology | null; demo: boolean; hasModel: boolean; mode: PortfoliosFile["mode"]; profile: Setup["profile"]; sampleLabel: string };
export const methodologyState = ({ m, draft }: MethodologyProps): CardState => (draft ? "attention" : m ? "in_use" : "missing");

export function MethodologyCard(p: MethodologyProps) {
  const { m, draft, demo, hasModel, mode, profile, sampleLabel } = p;
  const origin = m ? (m.origin === "library" ? `Adopted from the library: ${m.source.title}` : m.origin === "suggested" ? "Suggested from your profile and portfolio" : m.origin === "sample" ? "The demo's methodology" : `Read from ${m.source.title}`) : null;
  const state = methodologyState(p);
  return (
    <SetupCard
      id="methodology"
      icon={BookOpenCheck}
      title="Your methodology"
      about="The rules you invest by. Every screen, check and alert is built from it."
      state={state}
      stateLabel={draft ? "Draft to confirm" : undefined}
      facts={facts([
        { label: "In use", value: m ? m.name : "None yet. Choose a ready-made one, upload your document, or ask for a suggestion.", tone: m ? undefined : "muted" },
        m ? { label: "Where it came from", value: `${origin}${m.adopted ? `, adopted ${day(m.adopted)}` : ""}.` } : null,
        m ? { label: "What it holds", value: `${plural(m.classes.length, "class")} · ${plural(m.rules.length, "rule")}, ${m.rules.filter((r) => r.test).length} the app tests · ${plural(m.figures.length, "figure")}` } : null,
        draft ? { label: "Waiting for you", value: `A draft, ${draft.name}. Review it and confirm or discard on Methodology; nothing changes until you do.`, tone: "warn" } : null,
        mode === "each" ? { label: "Portfolios", value: "Each portfolio keeps its own. Switch to one at the top of the screen to change its methodology.", tone: "muted" } : null,
      ])}
      actions={
        <>
          {draft ? (
            <Link href="/methodology" className={buttonStyles({ size: "sm" })}>
              Review the draft
            </Link>
          ) : null}
          {m ? (
            <Link href="/methodology" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Open it
            </Link>
          ) : null}
        </>
      }
    >
      <Fold title={m ? "Switch to a ready-made methodology" : "Choose a ready-made methodology"} icon={Layers} open={!m && !draft}>
        <p className="mb-3 text-footnote text-text-secondary">No key needed: the file is the methodology itself. It opens as a draft you confirm on Methodology.</p>
        <LibraryCards mode={demo ? "demo" : "drive"} current={m?.origin === "library" ? m.source.title : null} doneHref="/methodology" />
      </Fold>
      {demo ? (
        <Fold title="Try a fictional sample" icon={Sparkles}>
          <p className="mb-3 text-footnote text-text-secondary">In your own app you upload your document here or ask for a suggestion. The demo shows the same draft from a fictional sample instead, with no model.</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton action={suggestAction} label="Suggest one from my portfolio" variant="secondary" doneLabel="Drafted; opening it" doneHref="/methodology" />
            <SampleButton sample={profile} label={sampleLabel} doneHref="/methodology" />
            <SampleButton sample="dividend_growth" label="Dividend growth sample" doneHref="/methodology" />
          </div>
        </Fold>
      ) : (
        <>
          <Fold title={m ? "Upload a new version of your document" : "Upload your methodology document"} icon={Upload}>
            <p className="mb-3 text-footnote text-text-secondary">A PDF or a text file up to 20 MB, read with the AI; one over 4 MB goes from your browser straight to your Google Drive first. Save a Word or Google Doc as PDF or text first. An Invariant methodology file (.json) is taken as it is, with no model.</p>
            {hasModel ? (
              <FileAction action={uploadAction} name="document" accept="application/pdf,text/plain,text/markdown,.md,application/json,.json" label={m ? "Upload the new version" : "Upload my methodology"} pendingLabel="Reading" note="Reading a long document can take a minute or two." doneLabel="Read; opening the draft" doneHref="/methodology" variant="primary" direct={{ start: startDocumentUploadAction, finish: draftFromDriveAction }} />
            ) : (
              <p className="text-footnote text-warn">The AI is not set up on this deployment yet. A .json methodology file needs none.</p>
            )}
          </Fold>
          <Fold title="Ask for a suggestion from my portfolio" icon={Sparkles}>
            <p className="mb-3 text-footnote text-text-secondary">No document, or a thin one? The app proposes a starting methodology from your profile, inputs and the shape of your portfolio. You trim or change it before it takes effect.</p>
            {hasModel ? <ActionButton action={suggestAction} label="Suggest one" variant="secondary" size="sm" doneLabel="Drafted; opening it" doneHref="/methodology" /> : <p className="text-footnote text-warn">The AI is not set up on this deployment yet.</p>}
          </Fold>
        </>
      )}
      {m && !demo ? (
        <Fold title="Remove the methodology" icon={Trash2}>
          <p className="mb-3 text-footnote text-text-secondary">The dashboard goes back to the one built from your inputs. Your document stays in your vault.</p>
          <ActionButton action={removeMethodologyAction} label="Remove methodology" variant="ghost" size="sm" doneLabel="Removed" />
        </Fold>
      ) : null}
    </SetupCard>
  );
}

export type ModelProps = { provider: ProviderSummary | null; demo: boolean; spent: number | null; cap: number; /** The beta: what is asked on demand runs on the person's own Claude. */ ownClaude?: boolean };
export const modelState = ({ provider, demo, spent, cap }: ModelProps): CardState => (demo ? "demo" : !provider ? "missing" : spent !== null && spent >= cap ? "attention" : "in_use");

/** Dollars as the card says them: whole cents. */
const dollars = (v: number) => `$${v.toFixed(2)}`;

/**
 * The AI, run by Invariant on its own Claude key (Hamza, 4 Nov 2026): no
 * key to make. The card says whether it runs here and what this month's use
 * has cost against the person's cap, an estimate at list price.
 */
export function ModelCard(p: ModelProps) {
  const { provider, demo, spent, cap, ownClaude } = p;
  return (
    <SetupCard
      id="model"
      icon={Bot}
      title="The AI"
      about={ownClaude ? "Two parts. What runs by itself (your first methodology draft, the recap after the close, review commentary, the reports after results, the research agents) is run by Invariant on Claude, with no key to make. What you ask for (the analyst, a document added to a thesis, a study, reading your performance, the property watch, how to judge your methodology, a figure from the web) runs on your own Claude through the connector below, each with its prompt on the screen." : "Reads your methodology, writes studies, the analyst's answers, the recap after the close and review commentary. Run by Invariant on Claude, so there is no key to make."}
      state={modelState(p)}
      stateLabel={demo ? "Not used in the demo" : undefined}
      facts={facts([
        { label: "In use", value: demo ? "The demo calls no model. In your app the AI runs on Invariant's own Claude account." : provider ? "Claude, run by Invariant" : "Not set up on this deployment yet.", tone: provider || demo ? undefined : "muted" },
        provider && !demo ? { label: "This month", value: spent === null ? `Up to ${dollars(cap)} of AI a month` : `${dollars(spent)} of ${dollars(cap)}, an estimate at list price; resets on the 1st`, tone: spent !== null && spent >= cap ? "warn" : undefined } : null,
        provider && !demo ? { label: "Your figures", value: "Sent to Anthropic for each call alone, under Invariant's account; the app keeps them only in your vault." } : null,
        ownClaude ? { label: "On your Claude", value: "What you ask for runs on your own Claude plan through the Invariant connector, not against this cap. Your Claude reads through the app's tools; the app computes every figure." } : null,
      ])}
    />
  );
}

// ---------------------------------------------------------------------------
// 02 · Your money

export type IbkrProps = { book: Book | null; flex: FlexSummary; lines: Line[]; notes: string[]; updated: string | null; fetched: boolean; demo: boolean; registry: boolean };
export const ibkrState = ({ book, lines, demo }: IbkrProps): CardState => (demo ? "demo" : lineOf(lines, "ibkr_flex")?.outcome === "failed" ? "attention" : bookLine(book, "ibkr") ? "in_use" : "missing");

export function IbkrCard(p: IbkrProps) {
  const { book, flex, lines, notes, updated, fetched, demo, registry } = p;
  const held = bookLine(book, "ibkr");
  const fetch = lineOf(lines, "ibkr_flex");
  const state = ibkrState(p);
  // The source's freshness, once on Sources & settings (Hamza, 19 Oct 2026: on Setup instead): current within a week of today, else stale.
  const stale = !demo && !!held && !!book && daysBetween(book.asOf.slice(0, 10), localDay()) > 7;
  // How far back the account values reach (Hamza, 19 Oct 2026: since inception), and the way to reach further.
  const firstDay = held && book?.series?.source === "ibkr" ? (book.series.nav[0]?.date ?? null) : null;
  return (
    <SetupCard
      id="ibkr"
      icon={Landmark}
      title="Interactive Brokers"
      about="Your positions, trades, cash and daily account value, from an Activity Flex statement."
      state={state}
      stateLabel={demo ? "Snapshot" : fetch?.outcome === "failed" ? "Fetch failed" : stale ? "Stale" : held ? "Current" : undefined}
      facts={facts([
        { label: "What the app has", value: held ?? "No statement yet. Upload one below, or keep a Flex token so it is fetched every morning and after the close.", tone: held ? undefined : "muted" },
        demo ? { label: "Updates", value: "This snapshot never updates. In your app, a Flex token fetches the statement every morning.", tone: "muted" } : null,
        !demo && updated && held ? { label: "Last written", value: `${day(updated)}, ${fetched ? "fetched with your Flex token" : "from a statement you uploaded"}.` } : null,
        !demo
          ? flex
            ? { label: "Fetched by itself", value: `On. Every morning, and after the close once IBKR has made the day's statement. Query ${flex.queryId}, token kept ${day(flex.savedAt)}.${registry ? "" : " The schedule store is not set up on this deployment, so only Fetch now runs it."}`, tone: "ok" }
            : { label: "Fetched by itself", value: "Off. The statement changes only when you upload one. Keep a Flex token below and the app fetches it every morning and after the close.", tone: "muted" }
          : null,
        lineFact("Last fetch", fetch),
        firstDay ? { label: "History", value: `From ${day(firstDay)}. For the years before, upload past statements: Add your history since the start, below.` } : null,
        notes.length ? { label: "What it lacked", value: notes.join(" "), tone: "warn" } : null,
      ])}
      actions={
        demo ? null : (
          <>
            <FileAction action={importBookAction} name="statement" accept=".xml,.json,text/xml,application/xml,application/json" label={held ? "Upload a newer statement" : "Upload a statement"} pendingLabel="Reading" doneLabel="Statement read" variant={held ? "secondary" : "primary"} />
            {flex ? <ActionButton action={fetchNowAction} label="Fetch now" variant="secondary" size="sm" doneLabel="Fetched" /> : null}
          </>
        )
      }
    >
      {demo ? null : flex ? (
        <Fold title="Replace the Flex token" icon={KeyRound}>
          <FlexTokenForm replacing />
          <div className="mt-4 border-t border-hairline pt-3">
            <ActionButton action={removeFlexAction} label="Remove the token" variant="ghost" size="sm" doneLabel="Removed" />
          </div>
        </Fold>
      ) : (
        <Fold title="Fetch it by itself: keep your Flex token" icon={RefreshCw}>
          <FlexTokenForm replacing={false} />
        </Fold>
      )}
      {demo || !held ? null : (
        <Fold title="Add your history since the start" icon={History}>
          <p className="mb-1 text-footnote text-text-secondary">
            IBKR sends at most a year in each statement, so the morning fetch covers the last year. Upload each earlier year once and it stays{firstDay ? `. The app holds your account from ${day(firstDay)}` : ""}.
          </p>
          <Steps steps={flexHistorySteps(firstDay)} extra={firstDay ? { 1: <FlexHistoryDates firstDay={firstDay} /> } : undefined} />
          <div className="mt-3">
            <FileAction action={importBookAction} name="statement" accept=".xml,text/xml,application/xml" label="Upload an earlier year" pendingLabel="Reading" doneLabel="History added" variant="secondary" />
          </div>
        </Fold>
      )}
      <Fold title="How to make the Flex query and the token, step by step" icon={ListOrdered}>
        <FlexGuideBody />
      </Fold>
    </SetupCard>
  );
}

export type BrokersProps = { book: Book | null; snaptrade: KeySummary; etoro: KeySummary; showSnapTrade: boolean; showEtoro: boolean; connected: boolean; lines: Line[]; demo: boolean };
export function brokersState({ book, snaptrade, etoro, lines, demo }: BrokersProps): CardState {
  if (demo) return "demo";
  const failed = [lineOf(lines, "snaptrade"), lineOf(lines, "etoro")].some((l) => l?.outcome === "failed");
  return failed ? "attention" : bookLine(book, "snaptrade") || bookLine(book, "etoro") ? "in_use" : snaptrade || etoro ? "attention" : "missing";
}

export function OtherBrokersCard(p: BrokersProps) {
  const { book, snaptrade, etoro, showSnapTrade, showEtoro, connected, lines, demo } = p;
  if (!showSnapTrade && !showEtoro) return null;
  const snapHeld = bookLine(book, "snaptrade");
  const etoroHeld = bookLine(book, "etoro");
  const failed = [lineOf(lines, "snaptrade"), lineOf(lines, "etoro")].some((l) => l?.outcome === "failed");
  const state = brokersState(p);
  return (
    <SetupCard
      id="brokers"
      icon={Building2}
      title="Other brokers"
      about="Schwab, Wealthsimple, Questrade, Fidelity, Robinhood and others through your own free SnapTrade key; eToro through your own read-only keys."
      state={state}
      stateLabel={demo ? "In your app" : state === "attention" && !failed ? "Connect a broker" : undefined}
      facts={demo ? [
        { label: "SnapTrade", value: "In your app: make your own free SnapTrade Personal key, keep it here, then press Connect a broker and sign in to Schwab, Wealthsimple, Questrade, Fidelity, Robinhood or another on its own page. Fetched every morning." },
        { label: "eToro", value: "In your app: make two read-only keys in eToro (Settings, Trading, API Key Management) and keep them here. Fetched every morning." },
      ] : facts([
        showSnapTrade ? { label: "SnapTrade", value: snaptrade ? `Key kept ${day(snaptrade.savedAt)}. ${snapHeld ?? (connected ? "Back from SnapTrade: press Fetch now to read the broker you connected." : "No broker connected yet: press Connect a broker.")}` : "No key yet. Make your free key, then keep it below.", tone: snaptrade ? undefined : "muted" } : null,
        showEtoro ? { label: "eToro", value: etoro ? `Keys kept ${day(etoro.savedAt)}. ${etoroHeld ?? "Nothing fetched yet."}` : "No keys yet. Make read-only keys in eToro, then keep them below.", tone: etoro ? undefined : "muted" } : null,
        lineFact("Last SnapTrade fetch", lineOf(lines, "snaptrade")),
        lineFact("Last eToro fetch", lineOf(lines, "etoro")),
      ])}
      actions={
        !demo && (snaptrade || etoro) ? (
          <>
            {snaptrade ? <ActionButton action={connectSnapTradeAction} label="Connect a broker" variant={snapHeld ? "secondary" : "primary"} size="sm" doneLabel="Opening SnapTrade" /> : null}
            <ActionButton action={fetchNowAction} label="Fetch now" variant="secondary" size="sm" doneLabel="Fetched" />
          </>
        ) : null
      }
    >
      {showSnapTrade ? (
        <>
          {demo ? null : <Fold title={snaptrade ? "Replace the SnapTrade key" : "Keep your SnapTrade key"} icon={KeyRound}>
            <SnapTradeForm replacing={!!snaptrade} />
            {snaptrade ? (
              <div className="mt-4 border-t border-hairline pt-3">
                <ActionButton action={removeSnapTradeAction} label="Remove the key" variant="ghost" size="sm" doneLabel="Removed" />
              </div>
            ) : null}
          </Fold>}
          <Fold title="How to get the SnapTrade key, step by step" icon={ListOrdered}>
            <Steps steps={SNAPTRADE_STEPS("your broker")} note="Free and read-only: the key is yours, sees only your own accounts, and the app asks it for accounts, positions and cash alone. It cannot place, change or cancel an order." />
          </Fold>
        </>
      ) : null}
      {showEtoro ? (
        <>
          {demo ? null : <Fold title={etoro ? "Replace the eToro keys" : "Keep your eToro keys"} icon={KeyRound}>
            <EtoroForm replacing={!!etoro} />
            {etoro ? (
              <div className="mt-4 border-t border-hairline pt-3">
                <ActionButton action={removeEtoroAction} label="Remove the keys" variant="ghost" size="sm" doneLabel="Removed" />
              </div>
            ) : null}
          </Fold>}
          <Fold title="How to make the eToro keys, step by step" icon={ListOrdered}>
            <Steps steps={ETORO_STEPS} note="Free: eToro charges nothing for its API. The account must be verified. The key only reads; the app never opens or closes a position." />
          </Fold>
        </>
      ) : null}
    </SetupCard>
  );
}

export type StatementsProps = { inbox: string | null; helper: string; applied: number; waiting: number; line: Line | null; banks: boolean; funds: boolean; demo: boolean };
export const statementsState = ({ demo, waiting, applied }: StatementsProps): CardState => (demo ? "demo" : waiting ? "attention" : applied ? "in_use" : "missing");

export function StatementsCard(p: StatementsProps) {
  const { inbox, helper, applied, waiting, line, banks, funds, demo } = p;
  const kind = banks && funds ? "statement or fund report" : banks ? "statement" : "fund report or capital account statement";
  return (
    <SetupCard
      id="statements"
      icon={Mail}
      title={banks && funds ? "Bank statements and fund reports" : banks ? "Bank statements" : "Private fund reports"}
      about="Forwarded to your own statements address, read with the AI, every figure checked against the document before it is used."
      state={statementsState(p)}
      stateLabel={demo ? "In your app" : waiting ? `${waiting} to confirm` : undefined}
      facts={demo ? [
        { label: "Your address", value: "In your app: your own statements address, shown here with a Copy button. Forward each bank statement, portfolio report or fund report to it, or set a Gmail filter once." },
        { label: "What happens", value: "Each PDF is read with the AI and every figure is checked against the document before it is used. One that does not check waits on Statements for you." },
      ] : facts([
        { label: "Your address", value: inbox ? <span className="data break-all">{inbox}</span> : `Not set up on this deployment yet. ${helper} switches it on once.`, tone: inbox ? undefined : "muted" },
        { label: "What the app has", value: applied ? `${plural(applied, "document")} in use${waiting ? `, ${waiting} waiting for you on Statements` : ""}.` : waiting ? `${plural(waiting, "document")} waiting for you on Statements.` : "Nothing yet. Forward the first one, or upload a PDF on Statements.", tone: applied ? undefined : "muted" },
        lineFact("Last inbox read", line),
      ])}
      actions={
        demo ? null : <>
          {inbox ? <CopyButton text={inbox} label="Copy the address" /> : null}
          <Link href="/statements" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Open Statements
          </Link>
        </>
      }
    >
      <Fold title="How to forward them, step by step" icon={ListOrdered}>
        <Steps steps={mailSteps(kind, inbox, helper)} />
      </Fold>
    </SetupCard>
  );
}

export function AssetsCard({ kind, helper, count }: { kind: "property" | "other_assets"; helper: string; count: number }) {
  return (
    <SetupCard
      id={kind === "property" ? "property" : "other-assets"}
      icon={kind === "property" ? Home : Wallet}
      title={INPUTS[kind].label}
      about={INPUTS[kind].how}
      state={count ? "in_use" : "missing"}
      facts={[{ label: "On file", value: count ? `${plural(count, kind === "property" ? "property" : "asset")}.` : `None yet. ${helper} enters each one once from your notes.`, tone: count ? undefined : "muted" }]}
    >
      <Fold title="What to have ready, step by step" icon={ListOrdered}>
        <Steps steps={kind === "property" ? PROPERTY_STEPS(helper) : OTHER_ASSET_STEPS(helper)} />
      </Fold>
    </SetupCard>
  );
}


export type ThesesProps = { folders: { symbol: string; name: string | null; text: string; written: string | null; valuation: { low: number | null; base: number; high: number | null; asOf: string } | null; price: number | null; currency: string | null }[]; error: string | null; demo: boolean };
export const thesesState = ({ folders, demo }: ThesesProps): CardState => (demo ? "demo" : !folders.length ? "optional" : folders.some((f) => f.text.trim() || f.valuation) ? "in_use" : "missing");

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 });
const quick = "data mt-1 block w-full rounded-control border border-hairline-strong bg-surface px-2.5 py-1.5 text-footnote text-text";

/**
 * Theses and valuations: one folder per listed holding, as HCMP keeps them.
 * The first telling fits here: a few lines on why the business, and the
 * person's own bear, base and bull per share. The pillars, the pathway, the
 * Valuation calculator and the DCF are in the holding's folder on Theses.
 */
export function ThesesCard(p: ThesesProps) {
  const { folders, error, demo } = p;
  const written = folders.filter((f) => f.text.trim()).length;
  const valued = folders.filter((f) => f.valuation).length;
  return (
    <SetupCard
      id="theses"
      icon={Lightbulb}
      title="Theses and valuations"
      about="Why you hold each company, in your own words, and what you think a share is worth. Every report reads the new figures against them; the app never rewrites a thesis."
      state={thesesState(p)}
      stateLabel={demo ? "In your app" : folders.length ? `${written} of ${folders.length}` : "No listed equity"}
      facts={demo ? [
        { label: "In your app", value: "Each listed holding gets a folder: a short thesis here, and on Theses its pillars with the figure that tests each, the kill signals, the Valuation calculator by stage and the DCF." },
        { label: "Your valuation", value: "Your bear, base and bull per share. The Dashboard, the alerts and each post-earnings report read the price against them." },
      ] : facts([
        { label: "What the app has", value: folders.length ? `${plural(written, "thesis")} written and ${plural(valued, "valuation")} kept, of ${plural(folders.length, "listed holding")}.` : "No listed equity in the book yet. Each gets a folder here once your holdings are in.", tone: written || valued ? undefined : "muted" },
        error ? { label: "Theses file", value: error, tone: "warn" } : null,
      ])}
      actions={
        <Link href="/theses" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Open Theses
        </Link>
      }
    >
      {demo || !folders.length ? null : (
        <Fold title={`Write each one, a few lines at a time (${folders.length})`} icon={Lightbulb} open={written < folders.length}>
          <p className="mb-3 text-footnote text-text-secondary">A line or two is enough to start; the folder on Theses takes the pillars, the pathway and the calculator. The three figures are per share{folders[0]?.currency ? `, in the holding's own currency` : ""}; leave what you do not know blank.</p>
          <ul className="space-y-3">
            {folders.map((f) => (
              <li key={f.symbol} className="rounded-[12px] bg-surface-2 p-3">
                <ActionForm action={saveFirstThesisAction} label="Keep" size="sm" doneLabel="Kept">
                  <input type="hidden" name="symbol" value={f.symbol} />
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0">
                      <span className="data font-semibold">{f.symbol}</span>
                      {f.name && f.name !== f.symbol ? <span className="ml-2 text-subhead text-text-secondary">{f.name}</span> : null}
                    </p>
                    <p className="text-caption text-text-tertiary">
                      {f.price !== null ? `Price ${money(f.price)}${f.currency ? ` ${f.currency}` : ""}` : null}
                      {f.written ? `${f.price !== null ? " · " : ""}thesis ${day(f.written)}` : ""}
                      {f.valuation ? ` · valued ${day(f.valuation.asOf)}` : ""}
                      {" · "}
                      <Link href={`/theses/${encodeURIComponent(f.symbol)}`} className="text-accent-text underline-offset-2 hover:underline">
                        Open the folder
                      </Link>
                    </p>
                  </div>
                  <label className="block text-caption text-text-secondary">
                    The thesis
                    <textarea name="text" rows={2} maxLength={6000} defaultValue={f.text} placeholder="Why this business: what it sells, who pays, what must stay true." className="mt-1 block w-full rounded-control border border-hairline-strong bg-surface px-2.5 py-1.5 text-footnote text-text" />
                  </label>
                  <div className="my-2 grid grid-cols-3 gap-2">
                    {(["low", "base", "high"] as const).map((k) => (
                      <label key={k} className="block text-caption text-text-secondary">
                        {k === "low" ? "Bear" : k === "base" ? "Base" : "Bull"}
                        <input name={k} inputMode="decimal" defaultValue={f.valuation?.[k] ?? ""} placeholder={k === "base" ? "Per share" : "Optional"} className={quick} />
                      </label>
                    ))}
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </SetupCard>
  );
}

// ---------------------------------------------------------------------------
// 03 · What the app reads for you

export type FilingsProps = { summary: string | null; equities: number; contact: string | null; demo: boolean; defaultAddress: string; line: Line | null };
export const filingsState = ({ demo, equities, contact, summary }: FilingsProps): CardState => (demo ? "demo" : !equities ? "optional" : !contact ? "attention" : summary ? "in_use" : "missing");

export function FilingsCard(p: FilingsProps) {
  const { summary, equities, contact, demo, defaultAddress, line } = p;
  const state = filingsState(p);
  return (
    <SetupCard
      id="filings"
      icon={FileSearch}
      title="Company filings"
      about="Revenue growth, margins, ROIC, cash conversion and the rest, read from each listed holding's SEC filings. Nothing is estimated."
      state={state}
      stateLabel={!demo && equities && !contact ? "Confirm the contact" : undefined}
      facts={facts([
        { label: "What the app has", value: summary ?? (equities ? "Not read yet." : "No listed equity in the book; filings are read for equities only."), tone: summary ? undefined : "muted" },
        { label: "Updates", value: demo ? "The snapshot's filings never update." : "By themselves: every morning, and when you open the app if they are a day old or a new holding has none. After results, the report is read the same evening." },
        demo ? null : { label: "SEC contact", value: contact ?? "Not confirmed. The SEC asks every program that reads its filings who it is; nothing is read until you confirm.", tone: contact ? undefined : "warn" },
        lineFact("Last read", line),
      ])}
    >
      {demo ? null : contact ? (
        <Fold title="Withdraw the SEC contact" icon={Trash2}>
          <p className="mb-3 text-footnote text-text-secondary">No filing is read until you confirm a contact again.</p>
          <ActionButton action={withdrawEdgarContactAction} label="Withdraw" variant="ghost" size="sm" doneLabel="Withdrawn" />
        </Fold>
      ) : (
        <Fold title="Confirm the SEC contact" icon={Mail} open={equities > 0}>
          <div className="-mx-4 lg:-mx-5">
            <EdgarContactForm defaultAddress={defaultAddress} />
          </div>
        </Fold>
      )}
    </SetupCard>
  );
}

export type MorningProps = { lines: Line[]; scheduled: "none" | "reviews" | null; registry: boolean; demo: boolean };
export const morningState = ({ demo, registry, scheduled }: MorningProps): CardState => (demo ? "demo" : !registry ? "attention" : scheduled ? "in_use" : "missing");

export function MorningCard(p: MorningProps) {
  const { lines, scheduled, registry, demo } = p;
  const state = morningState(p);
  const status = demo
    ? "The demo fetches nothing. In your app, every source below is read each morning, before the reviews."
    : !registry
      ? "This deployment has no schedule store yet, so nothing runs while you are away. Fetch now still works."
      : scheduled === "reviews"
        ? `On, with your review schedule: about ${atUtcHour(6)} your time, before the review is built.`
        : scheduled === "none"
          ? `On: about ${atUtcHour(6)} your time each day.`
          : "Off. Turn it on so the app reads everything while you are away.";
  return (
    <SetupCard
      id="refresh"
      icon={CalendarClock}
      title="Every morning"
      about="Your broker statements, keys, inbox, results and filings, read again each morning so the app is ready before you open it."
      state={state}
      stateLabel={state === "in_use" ? "On" : state === "missing" ? "Off" : undefined}
      facts={facts([
        { label: "Morning refresh", value: status, tone: scheduled ? "ok" : "muted" },
        ...lines.map((l): Fact => ({ label: l.label, value: l.line, tone: l.outcome === "failed" ? "warn" : l.outcome === "skipped" ? "muted" : undefined })),
      ])}
      actions={
        demo ? null : (
          <>
            {registry && !scheduled ? <ActionButton action={morningRefreshAction} label="Turn on" size="sm" doneLabel="On" /> : null}
            <ActionButton action={fetchNowAction} label="Fetch statements now" variant="secondary" size="sm" doneLabel="Fetched" />
          </>
        )
      }
    />
  );
}


export type NewslettersProps = {
  address: string | null;
  helper: string;
  month: number;
  lastRead: string | null;
  recap: Preferences["recap"];
  hasModel: boolean;
  error: string | null;
  demo: boolean;
  /** What the inbox received: Gmail's filter, by hand, read on the key. */
  proof: ForwardingProof;
  /** Gmail's forwarding request as confirmed, kept in the vault. */
  kept: KeptConfirmation | null;
  senders: { file: NewsletterSendersFile; error: string | null };
  /** The prompt that has the person's Claude forward the last week, with their kept senders. */
  backfill: string | null;
  sharedOn: boolean;
};
export const newslettersState = ({ demo, month, lastRead }: NewslettersProps): CardState => (demo ? "demo" : month || lastRead ? "in_use" : "missing");

const CONFIRM_HOW = { pressed: "the app pressed Google's Confirm", already: "Google reported it verified" } as const;

/**
 * Newsletters (Hamza, 19 Oct 2026: the Newsletters page folded in here, since
 * At the Close shows the newsletters themselves): whether the chain works
 * (the forwarding address confirmed, what Gmail's filter and the person
 * forwarded, what their model read), the address with Check for newsletters
 * now, then the three steps in Gmail's own words: the address, which the card
 * confirms by itself while it is unconfirmed; the filter on the senders their
 * Claude finds; the last week through their Claude. Then where After the
 * close and What happened come from, the recap newsletter and their Claude's.
 */
export function NewslettersCard(p: NewslettersProps) {
  const { address, helper, month, lastRead, recap, hasModel, error, demo, proof, kept, senders, backfill, sharedOn } = p;
  const verified = !!kept || proof.byFilter > 0;
  const recapLetter = recapNewslettersFor(demo)[0];
  return (
    <SetupCard
      id="newsletters"
      icon={Newspaper}
      title="Newsletters and the daily recap"
      about={`Forward the newsletters you read to your own newsletters address. Each is read with the AI into a few lines and its pictures, shown on At the Close and in your weekly and monthly review. The free ${recapLetter.name} comes through the same filter and opens What happened today on its own, apart from the other newsletters.`}
      state={newslettersState(p)}
      stateLabel={demo ? "In your app" : undefined}
      facts={demo ? facts([
        { label: "Your address", value: "In your app: your own newsletters address, shown here with a Copy button, and a Gmail filter set once on the senders you choose." },
        kept ? { label: "Forwarding", value: `Confirmed ${day(kept.confirmedAt.slice(0, 10))}: ${CONFIRM_HOW[kept.how]}.` } : null,
        proof.byFilter ? { label: "Gmail's filter", value: `${plural(proof.byFilter, "newsletter")} forwarded${proof.lastFilterAt ? `, the last on ${day(proof.lastFilterAt.slice(0, 10))}` : ""}.` } : null,
        { label: "What happens", value: "Each newsletter is read once with the AI into a topic, two lines, the points that touch your holdings and the pictures that show them. Only the digest is kept." },
      ]) : facts([
        { label: "Your address", value: address ? <span className="data break-all">{address}</span> : `Not set up on this deployment yet. ${helper} switches it on once.`, tone: address ? undefined : "muted" },
        address ? { label: "Forwarding", value: kept ? `Confirmed ${day(kept.confirmedAt.slice(0, 10))}: ${CONFIRM_HOW[kept.how]}.` : proof.byFilter ? "Verified: Gmail's filter has forwarded to it." : "Not confirmed yet. Add the address in Gmail (step 1); this card confirms the request by itself.", tone: verified ? undefined : "warn" } : null,
        address ? { label: "Gmail's filter", value: proof.byFilter ? `${plural(proof.byFilter, "newsletter")} forwarded${proof.lastFilterAt ? `, the last on ${day(proof.lastFilterAt.slice(0, 10))}` : ""}.` : "Nothing yet. A filter forwards only what arrives from now on.", tone: proof.byFilter ? undefined : "muted" } : null,
        address && proof.byHand ? { label: "Forwarded by you", value: `${proof.byHand}${proof.lastHandAt ? `, the last on ${day(proof.lastHandAt.slice(0, 10))}` : ""}.` } : null,
        { label: "What the app has", value: month ? `${plural(month, "newsletter")} read in the last 30 days${lastRead ? `, the last on ${day(lastRead)}` : ""}${proof.failed ? `; ${proof.failed} not read yet, tried again each run` : ""}. They are on At the Close.` : lastRead ? `None this month; the last was read on ${day(lastRead)}.` : "None yet. A forwarded newsletter shows on At the Close once read.", tone: month ? undefined : "muted" },
        { label: "After the close", value: recap.newsletter && recap.claude ? "The recap newsletter and the AI's own recap." : recap.claude ? "The AI's own recap, written from the web after the close." : `The free ${recapLetter.name}, forwarded by the same Gmail filter, and any recap newsletter you forward.`, tone: undefined },
        hasModel ? null : { label: "The AI", value: "The AI is not set up on this deployment yet; until then newsletters wait, unread.", tone: "warn" },
        error ? { label: "Newsletters file", value: error, tone: "warn" } : null,
      ])}
      actions={
        demo ? null : (
          <>
            {address ? <CopyButton text={address} label="Copy the address" /> : null}
            <Link href="/after-close" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Open At the Close
            </Link>
          </>
        )
      }
    >
      {!demo && address ? (
        <div className="mb-3">
          <InboxCheck action={checkNewslettersAction} label="Check for newsletters now" wait="A morning's newsletters can take a minute to read." />
        </div>
      ) : null}
      <Fold title="1 · Add your newsletters address to Gmail" icon={Mail}>
        <ol className="mb-3 list-decimal space-y-2 pl-5 text-subhead">
          <li>
            Open Gmail on a computer. Click the gear at the top right, then <b>See all settings</b>, then the <b>Forwarding and POP/IMAP</b> tab.
          </li>
          <li>
            Click <b>Add a forwarding address</b>, paste your newsletters address, then <b>Next</b> and <b>Proceed</b>. Gmail sends a confirmation request to it.
          </li>
          <li>Leave Setup open: it confirms Gmail&rsquo;s request by itself within a minute, pressing Google&rsquo;s Confirm for you. Leave forwarding itself off: only the filter in step 2 sends anything.</li>
        </ol>
        {!demo && address && !verified ? <ForwardingWatch kind="newsletters" kept={kept} next="Go on to the filter in step 2." /> : null}
      </Fold>
      <Fold title="2 · Make a filter that forwards them" icon={ListOrdered}>
        <p className="mb-3 text-footnote text-text-secondary">Nothing to type into Gmail&rsquo;s search bar: the senders are found by the AI or pasted here, the filter writes itself and Gmail opens with it filled in.</p>
        <FilterBuilder address={address} file={senders.file} error={senders.error} recap={recap.newsletter ? recapLetter : null} />
      </Fold>
      <Fold title={`3 · Start with the last ${BACKFILL_DAYS} days`} icon={History}>
        <p className="mb-3 text-footnote text-text-secondary">
          Gmail&rsquo;s filter forwards only what arrives from now on, and the app never reads your Gmail, so the week before comes from your own Claude. Paste this into Claude with its Gmail connector on; each newsletter is read once it lands. Without Claude, forward any newsletter to your address by hand.
        </p>
        {backfill ? (
          <div className="flex items-start justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
            <p className="min-w-0 whitespace-pre-wrap text-footnote text-text-secondary">{backfill}</p>
            <CopyButton text={backfill} label="Copy prompt" />
          </div>
        ) : (
          <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-footnote text-text-secondary">{address ? "Keep at least one sender in step 2 and the prompt appears here with your senders in it." : "Your newsletters address is not set up yet."}</p>
        )}
      </Fold>
      <Fold title="After the close: where the recap comes from" icon={Newspaper}>
        <div className="-mx-4 mb-3 border-y border-hairline">
          <RecapChoiceForm choice={recap} />
        </div>
        <RecapGuide address={address} drive={false} compact sharedOn={sharedOn} demo={demo} />
      </Fold>
      <Fold title="How they are read" icon={ListOrdered}>
        <Steps steps={newsletterSteps(address, helper).slice(-1)} note={`Only newsletters forwarded from your own account are read. A newsletter is its writer's argument, never a verdict on your holdings.`} />
      </Fold>
    </SetupCard>
  );
}

export type PodcastsProps = {
  shows: readonly PodcastShow[];
  /** Episodes written up in the last 30 days, and the newest one's date. */
  month: number;
  lastDate: string | null;
  failed: number;
  hasModel: boolean;
  error: string | null;
  demo: boolean;
};
export const podcastsState = ({ demo, shows, month, hasModel }: PodcastsProps): CardState => (demo ? "demo" : !shows.length ? "missing" : !hasModel ? "attention" : month ? "in_use" : "optional");

/**
 * Podcasts (Hamza, 20 Oct 2026): the shows the person follows on
 * podscripts.co, All-In to begin with. Each new episode's transcript is read
 * on their own model into a summary and a perspective against their book,
 * watchlist, theses and methodology, shown on At the Close. Only the
 * write-up is kept.
 */
export function PodcastsCard(p: PodcastsProps) {
  const { shows, month, lastDate, failed, hasModel, error, demo } = p;
  return (
    <SetupCard
      id="podcasts"
      icon={Mic}
      title="Podcasts"
      about="Follow the shows you listen to. Each new episode's transcript on podscripts.co is read with the AI into what was said and what it means for your holdings, watchlist, theses and methodology, shown on At the Close."
      state={podcastsState(p)}
      stateLabel={demo ? "In your app" : undefined}
      facts={facts([
        { label: "You follow", value: shows.length ? shows.map((s) => s.title).join(", ") : "No show. Add one below.", tone: shows.length ? undefined : "muted" },
        demo
          ? { label: "What happens", value: "Each morning and when you open the app, new episodes of the past fortnight are written up with the AI, a few at a time. The transcript is never kept." }
          : { label: "What the app has", value: month ? `${plural(month, "episode")} written up in the last 30 days${lastDate ? `, the newest from ${day(lastDate)}` : ""}${failed ? `; ${failed} not read yet, tried again each run` : ""}.` : `None yet. Episodes from the past ${PODCAST_DAYS} days are written up each morning and when you open the app.`, tone: month ? undefined : "muted" },
        hasModel || demo ? null : { label: "The AI", value: "The AI is not set up on this deployment yet; until then new episodes wait, unread.", tone: "warn" },
        error ? { label: "Podcasts file", value: error, tone: "warn" } : null,
      ])}
      actions={
        <Link href="/after-close#podcasts" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Open At the Close
        </Link>
      }
    >
      {shows.length ? (
        <Fold title={`Shows you follow · ${shows.length}`} icon={ListOrdered} open>
          <ul className="divide-y divide-hairline">
            {shows.map((s) => (
              <li key={s.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                {demo ? (
                  <span className="min-w-0 text-subhead">{s.title}</span>
                ) : (
                  <a href={showUrl(s.slug)} target="_blank" rel="noreferrer noopener" className="min-w-0 text-subhead text-accent-text">
                    {s.title}
                  </a>
                )}
                {demo ? null : (
                  <ActionForm action={removePodcastAction} label="Remove" variant="ghost" size="sm">
                    <input type="hidden" name="show" value={s.slug} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Fold>
      ) : null}
      {demo ? null : (
        <Fold title="Add a show" icon={Mic} open={!shows.length}>
          <ActionForm action={addPodcastAction} label="Follow" pendingLabel="Reading the show" doneLabel="Following">
            <label className="mb-1 block text-footnote text-text-secondary" htmlFor="podcast-show">
              The show&rsquo;s address on podscripts.co
            </label>
            <input id="podcast-show" name="show" required placeholder={`${PODSCRIPTS.replace("https://", "")}/podcasts/…`} autoComplete="off" spellCheck={false} className="mb-3 block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body" />
          </ActionForm>
        </Fold>
      )}
      <Fold title="How to add a show" icon={ListOrdered}>
        <Steps
          steps={[
            { title: "Find the show on podscripts.co", detail: "Open podscripts.co and search for the show you listen to. It carries free transcripts of many investing and business podcasts." },
            { title: "Copy its address", detail: "Open the show's own page, the one that lists its episodes, and copy the address from the browser's bar. An episode's address works too." },
            { title: "Paste it above and press Follow", detail: "The app reads the show's page once to check it. From then on, new episodes are written up with the AI each morning and when you open the app." },
          ]}
          note="Only the write-up is kept, never the transcript. A podcast is its hosts' argument; the verdict on a holding stays your methodology's. Not investment advice."
        />
      </Fold>
    </SetupCard>
  );
}

// ---------------------------------------------------------------------------
// 04 · How you see it

export function PortfoliosCard({ file, demo, shared }: { file: PortfoliosFile; demo: boolean; shared: string | null }) {
  const n = file.items.length;
  return (
    <SetupCard
      id="portfolios"
      icon={Layers}
      title="Portfolios"
      about="Group your accounts: a broker each, or private assets apart. The switch at the top of every screen then shows all of them together or one alone."
      state={n > 1 ? "in_use" : "optional"}
      stateLabel={n > 1 ? `${n} portfolios` : "One portfolio"}
      facts={facts([
        { label: "Portfolios", value: file.items.map((p) => `${p.name} (${plural(p.accounts.length, "account")})`).join(" · ") || "One, holding every account." },
        { label: "Methodology", value: n < 2 ? "One portfolio: your methodology applies to it." : file.mode === "each" ? "Each portfolio keeps its own. All together shows combined figures with no verdict of their own." : `${shared ?? "Your methodology"} applies to every portfolio and to all of them together.` },
      ])}
    >
      <Fold title={n > 1 ? "Arrange your portfolios" : "Add a portfolio"} icon={Layers}>
        <PortfoliosSection file={file} demo={demo} shared={shared} bare />
      </Fold>
    </SetupCard>
  );
}

export function ClaudeCard({ url, demo }: { url: string; demo: boolean }) {
  return (
    <SetupCard
      id="claude"
      icon={Plug}
      title="Your own Claude or ChatGPT"
      about="Add this app to Claude as a connector, or to ChatGPT as an app, and ask about your portfolio there. Either reads through the app's own tools; the only things it can write are a thesis and a newsletter proposal, each landing here for you to review."
      state="optional"
      facts={[{ label: "Address", value: <span className="data break-all">{url}</span> }]}
      actions={
        <span className="inline-flex flex-wrap items-center gap-3">
          <CopyButton text={url} label="Copy the address" />
          <a href="/api/skill" download className="text-subhead text-accent-text">Download the Invariant skill</a>
          <a href="/api/methodology/schema" target="_blank" rel="noreferrer" className="text-subhead text-accent-text">The rule language, as a schema</a>
        </span>
      }
    >
      <Fold title="How to add it to Claude, step by step" icon={ListOrdered}>
        <Steps steps={CLAUDE_STEPS(demo)} note={demo ? "The demo's server reads the anonymized snapshot only, with no sign-in." : "Remove it in Claude at any time."} />
      </Fold>
      <Fold title="How to add it to ChatGPT, step by step" icon={ListOrdered}>
        <Steps steps={CHATGPT_STEPS(demo)} note={demo ? "The demo's server reads the anonymized snapshot only, with no sign-in." : "The same address and the same sign-in as Claude's; delete it in ChatGPT at any time."} />
      </Fold>
      <Fold title="Public research, with no sign-in" icon={Search}>
        <p className="px-1 text-subhead text-text-secondary">A second address anyone can add the same way, with no sign-in: any US-listed company&rsquo;s figures from its SEC filings, its insiders&rsquo; Form 4 trades, FINRA&rsquo;s short interest and the days it released its results. It reads public filings alone, never your portfolio, a price or a model.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 px-1">
          <span className="data break-all text-footnote">{`${url}/research`}</span>
          <CopyButton text={`${url}/research`} label="Copy" />
        </div>
      </Fold>
    </SetupCard>
  );
}

export function ProfileCard({ setup, children }: { setup: Setup; children: React.ReactNode }) {
  return (
    <SetupCard
      id="profile"
      icon={UserRound}
      title="Who it is for, and where your money is"
      about="Your answers to the four steps. They decide which cards are on this page and which screens the app has."
      state="in_use"
      stateLabel="Answered"
      facts={[
        { label: "For", value: `${setup.ownerName || "You"} · ${PROFILES[setup.profile].label} · reported in ${setup.baseCurrency}` },
        { label: "Your inputs", value: setup.inputs.map((i) => INPUTS[i].label).join(" · ") },
        ...(setup.helperName ? [{ label: "Helping you", value: setup.helperName }] : []),
      ]}
    >
      <Fold title="Change your answers" icon={UserRound}>
        {children}
      </Fold>
    </SetupCard>
  );
}

export function VaultCard({ vault, buckets }: { vault: VaultInfo | null; buckets: boolean }) {
  const folder = vault?.provider === "microsoft" ? "your OneDrive app folder" : "your Google Drive folder";
  return (
    <SetupCard
      id="vault"
      icon={FolderLock}
      title="Your vault"
      about="Where everything above is kept: setup, figures, methodology, keys, records and reports. The app sees nothing outside it."
      state={vault ? "in_use" : "attention"}
      facts={[{ label: "Your files", value: vault ? `In ${vault.where}.` : "Your vault could not be opened.", tone: vault ? undefined : "warn" }]}
    >
      {vault?.kind === "bucket" ? (
        <Fold title={`Back to ${folder}`} icon={FolderLock}>
          <p className="mb-3 text-footnote text-text-secondary">The files stay in the bucket. The app returns to {folder}, with whatever is there.</p>
          <ActionButton action={dropBucketAction} label={`Back to ${folder}`} variant="ghost" size="sm" doneLabel="Back" />
        </Fold>
      ) : buckets ? (
        <Fold title="Use a bucket of your own instead" icon={FolderLock}>
          <BucketForm />
        </Fold>
      ) : null}
    </SetupCard>
  );
}
