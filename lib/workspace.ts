import "server-only";

import { licensedOnly } from "@/lib/licences";

import { readFileSync } from "node:fs";
import path from "node:path";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { composeBook } from "@/lib/compose-book";
import { EMPTY_MACRO, macroReportsFileSchema, type MacroReportsFile } from "@/lib/macro-report";
import { calendarFoundSchema, EMPTY_FOUND, type CalendarFound } from "@/lib/calendar-agent";
import { analystFileSchema, demoThread, EMPTY_ANALYST, type AnalystFile } from "@/lib/analyst";
import { decisionsFileSchema, EMPTY_DECISIONS, type DecisionsFile } from "@/lib/decisions";
import { filingsFileSchema, type FilingsFile } from "@/lib/filings";
import { alertsFileSchema, EMPTY_ALERTS, type AlertsFile } from "@/lib/alerts";
import { benchmarksFileSchema, type BenchmarksFile } from "@/lib/look-through";
import { bookSchema, keepHistory, type Book } from "@/lib/holdings";
import { forwardingFileSchema, type ForwardingFile } from "@/lib/inbox";
import { inboxTag } from "@/lib/inbox-tag";
import { adoptMethodology, isLibraryId, LIBRARY_IDS, libraryEntry } from "@/lib/library";
import { EMPTY_MARKETS, withMarkets, type Markets } from "@/lib/markets";
import { loadEarnings, loadMarkets } from "@/lib/markets-feed";
import { EMPTY_EARNINGS, earningsFileSchema, earningsNotices, earningsSubjects, entriesFor, reportNotices, symbolKey, type EarningsFile } from "@/lib/earnings";
import { methodologySchema, without, type Methodology } from "@/lib/methodology";
import { applyRecords, DEFAULT_PREFERENCES, EMPTY_RECORDS, preferencesSchema, recordsSchema, type Preferences, type Records } from "@/lib/preferences";
import { defaultPortfolios, lensView, portfoliosFileSchema, withNewAccounts, type Portfolio, type PortfoliosFile } from "@/lib/portfolios";
import { hostedAvailable } from "@/lib/hosted-model";
import type { ProviderSummary } from "@/lib/model-provider";
import { propertyWatchSchema, type PropertyWatch } from "@/lib/property-watch";
import { EMPTY_RESEARCH, researchFileSchema, type ResearchFile } from "@/lib/research";
import { EMPTY_RESEARCH_CACHE, researchCacheSchema, type ResearchCache } from "@/lib/research-agent";
import { agentFeedbackSchema, EMPTY_FEEDBACK, type AgentFeedback } from "@/lib/agents";
import { customAgentsFileSchema, EMPTY_CUSTOM_AGENTS, type CustomAgentsFile } from "@/lib/custom-agents";
import { LENS_IDS } from "@/lib/lens-agents";
import { EMPTY_EVALUATION, evaluationFileSchema, type EvaluationFile } from "@/lib/methodology-evaluation";
import { perfInsightsFileSchema, type PerfInsightsFile } from "@/lib/perf-insights";
import { communityFileSchema, type CommunityProfile } from "@/lib/community";
import { EMPTY_THESES, thesesFileSchema, type ThesesFile } from "@/lib/theses";
import { EMPTY_PROPOSALS, proposalsFileSchema, type ProposalsFile } from "@/lib/thesis-review";
import { EMPTY_THESIS_WRITES, thesisWritesFileSchema, type ThesisWritesFile } from "@/lib/thesis-writes";
import { benchmarksOf, HEADLINE_BENCHMARKS, screensOn, shownWhen, type Shown } from "@/lib/screens";
import { brokersFileSchema, withBrokers } from "@/lib/brokers";
import { EMPTY_STATEMENTS, statementsFileSchema, withStatements, type StatementsFile } from "@/lib/statements";
import { customDataFileSchema, dataKeysSchema, EMPTY_CUSTOM_DATA, EMPTY_DATA_KEYS, type CustomDataFile } from "@/lib/custom-data";
import { EMPTY_RECAPS, recapsFileSchema, type RecapsFile } from "@/lib/market-recap";
import { EMPTY_PODCASTS, podcastsFileSchema, type PodcastsFile } from "@/lib/podcasts";
import { EMPTY_NEWSLETTERS, EMPTY_SENDERS, newslettersAddressFor, newslettersFileSchema, newsletterSendersSchema, type NewslettersFile, type NewsletterSendersFile } from "@/lib/newsletters";
import { requireOperator, type Operator } from "@/lib/session";
import { bookForInputs, modulesFor, setupSchema, type Module, type ProfileId, type Setup } from "@/lib/setup";
import { PRACTICES, type ScreenId } from "@/lib/ontology";
import { storageMode, type StorageMode } from "@/lib/storage";
import { closedBy } from "@/lib/market-day";
import { SyncError } from "@/lib/sync-error";
import { EMPTY_HUNTER, thesisHunterFileSchema, type ThesisHunterFile } from "@/lib/thesis-hunter";
import { EMPTY_SCREENER, keptValues, screenerFileSchema, type ScreenCompany, type ScreenerFile } from "@/lib/screener";
import { creedSchema, type Creeds } from "@/lib/fund-creeds";
import { etfFlows, FLOW_FUNDS, fundFlowSchema, type EtfFlows } from "@/lib/etf-flows";
import { flowSourceRowSchema, type FlowSourceRow } from "@/lib/flows";
import { EMPTY_FUNDS, fundsFileSchema, type FundsFile } from "@/lib/funds";
import { localDay } from "@/lib/time";
import { hostsOnDemand } from "@/lib/deployment";
import { syncStatusSchema, type SyncStatus } from "@/lib/connections";
import { bookFreshness, type Fresh } from "@/lib/freshness";
import { NO_VAULT, type Vault, type VaultInfo } from "@/lib/vault";
import { DEMO_WATCHERS } from "@/lib/watchers";

/**
 * One person's workspace: their setup, their figures, and the screens those
 * switch on. Every screen loads it the same way, whoever the person is.
 *
 * In drive mode everything comes from the person's own vault (lib/vault.ts):
 * their Google Drive folder, their OneDrive app folder or their own bucket.
 * In demo mode it is the fictional sample for the chosen
 * profile, cut down to the chosen inputs, with the choices kept in a cookie;
 * a methodology there is a reference to a sample file plus the elements the
 * visitor removed in the builder, never the whole document.
 */

export const SAMPLE_IDS = ["individual", "family_office", "dividend_growth"] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];
export const SAMPLE_LABEL: Record<SampleId, string> = { individual: "Sample: options income rules", family_office: "Sample: family investment policy", dividend_growth: "Sample: dividend growth" };

/**
 * The showcase: an anonymized, dated snapshot of a real portfolio, its
 * methodology, filings, Decision Log, one study and the recap of its last
 * session, opened by /try with a guided tour. The owner authorized it; no
 * name, address, account or file of theirs is in it, and it never updates.
 */
export const SHOWCASE_ID = "showcase";

/** The demo's stand-in for a methodology: which sample or library entry, and what the visitor removed from it. */
export const demoRefSchema = z.object({ sample: z.enum([...SAMPLE_IDS, ...LIBRARY_IDS, SHOWCASE_ID]), drop: z.array(z.string().max(40)).max(80) });
export type DemoRef = z.infer<typeof demoRefSchema>;

export type Workspace = {
  mode: StorageMode;
  operator: Operator;
  /** The setup as the screens see it: its methodology is the one that applies through the lens (lib/portfolios.ts). */
  setup: Setup | null;
  /** The setup as kept, with the methodology for all portfolios. Anything that saves the setup starts from this one. */
  baseSetup: Setup | null;
  /** Null when no figures have arrived yet: a new drive-mode person before the first sync. Through the lens: one portfolio's part, or the whole. */
  book: Book | null;
  /** The whole book, every portfolio together. */
  fullBook: Book | null;
  /** The person's portfolios (each account in one), and the one the screens look through; null for all together. */
  portfolios: PortfoliosFile;
  lens: Portfolio | null;
  sample: boolean;
  /** Demo only: the anonymized snapshot opened by /try, rather than a fictional sample. */
  showcase: boolean;
  propertyWatch: PropertyWatch | null;
  /** A drafted methodology waiting for the owner's confirmation. */
  draft: Methodology | null;
  /** Whether the deployment runs the AI (lib/hosted-model.ts); never the key. */
  hasModelKey: boolean;
  /** Whether the AI asked for on demand runs on the person's own Claude (the beta's hybrid AI): everyone but the operator and the allowlist, and the demo. */
  askClaude: boolean;
  /** The provider's kind, host and model for the screens; never the key. */
  provider: ProviderSummary | null;
  /** How the person arranged the app: theme, screen order, headline, their own figures (lib/preferences.ts). */
  preferences: Preferences;
  /** What the person recorded about their holdings; already laid on the book. */
  records: Records;
  /** What the last uploaded statement lacked (lib/import-book.ts); empty when the book came another way. */
  bookNotes: string[];
  /** When the book was last written, by an upload or the morning fetch (ISO); null in the demo and before the first. */
  bookUpdated: string | null;
  /** What the last refresh did, source by source (lib/connections.ts); null in the demo and before the first. */
  sync: SyncStatus | null;
  /** How fresh the book is: live, daily, uploaded, a snapshot or a sample (lib/freshness.ts); null with no book. */
  fresh: Fresh | null;
  /** The person's research studies (lib/research.ts); finished ones lay their fundamentals on the book. */
  research: ResearchFile;
  /** The analyst's conversations and lessons (lib/analyst.ts). */
  analyst: AnalystFile;
  /** Fundamentals read from SEC filings for every listed holding (lib/filings.ts); null in the demo and before the first read. */
  filings: FilingsFile | null;
  /** SPY's and QQQ's largest companies with their filings' figures, for the look-through (lib/look-through.ts); the demo's are fictional. */
  benchmarks: BenchmarksFile | null;
  /** Every alert that fired, cleared, was emailed or dismissed (lib/alerts.ts); in the demo, this browser's dismissals. */
  alerts: AlertsFile;
  /** The person's Decision Log (lib/decisions.ts); in the demo, this browser's entries. */
  decisions: DecisionsFile;
  /** What each bank statement and fund report said (lib/statements.ts); the ones in use are already laid on the book. */
  statements: StatementsFile;
  /** What the statements could not put on the book (a currency without a rate, a fund without your share). */
  statementNotes: string[];
  /** The data the person added themselves (lib/custom-data.ts), each with its last reading; the demo's are fictional. */
  customData: CustomDataFile;
  /** Demo only: what the cookie points at, so actions can edit the references. */
  demo: { methodology: DemoRef | null; draft: DemoRef | null } | null;
  modules: Module[];
  /** What the methodology and the book switch on (lib/screens.ts), and the screens that are on in the skeleton's order. */
  shown: Shown;
  screens: ScreenId[];
  /** Where the person's files are (lib/vault.ts); null in the demo. Never a credential. */
  vault: VaultInfo | null;
  /** A sentence when the vault could not be read. Screens show it instead of figures. */
  error: string | null;
};

/** The switches and the screens on, from the confirmed methodology, the book, the records and the Decision Log. */
function screensFor(setup: Setup | null, book: Book | null, records: Records | null, decisions: DecisionsFile | null, prefs: Preferences | null): { shown: Shown; screens: ScreenId[] } {
  const shown = shownWhen(setup?.methodology ?? null, book, records, decisions, prefs?.practices ?? []);
  return { shown, screens: screensOn(shown) };
}

/**
 * The workspace through the person's lens: all portfolios together, or one.
 * The book becomes that portfolio's part and the setup carries the
 * methodology that applies to it; everything switched on is worked out
 * again from the two. The kept setup and the whole book stay beside them.
 */
function applyLens(ws: Omit<Workspace, "baseSetup" | "fullBook" | "portfolios" | "lens">, file: PortfoliosFile | null): Workspace {
  const portfolios = withNewAccounts(file ?? defaultPortfolios(ws.book), ws.book);
  const view = lensView(portfolios, ws.preferences.lens, ws.setup?.methodology ?? null, ws.book);
  const setup = ws.setup ? { ...ws.setup, methodology: view.methodology } : null;
  return {
    ...ws,
    baseSetup: ws.setup,
    fullBook: ws.book,
    portfolios,
    lens: view.portfolio,
    setup,
    book: view.book,
    modules: setup ? modulesFor(setup, view.book) : ["setup"],
    ...screensFor(setup, view.book, ws.records, ws.decisions, ws.preferences),
  };
}

// ---------------------------------------------------------------------------
// Demo

const DEMO_COOKIE = "pos_demo_setup";
const PREFS_COOKIE = "pos_demo_prefs";
/** The theme alone, readable by the root layout before any workspace is loaded; set in both modes. */
export const THEME_COOKIE = "pos_theme";
// `dropped`: the showcase's own records (its holdings' and its watchlist's) the visitor removed, so a removal holds; in the showcase the cookie keeps only what differs from it.
const prefsCookieSchema = z.object({ preferences: preferencesSchema, records: recordsSchema, decisions: decisionsFileSchema.default(EMPTY_DECISIONS), alerts: alertsFileSchema.default(EMPTY_ALERTS), portfolios: portfoliosFileSchema.nullable().default(null), dropped: z.array(z.string().max(40)).max(40).default([]) });
const SAMPLE_BOOK: Record<ProfileId, string> = { individual: "dani.book.json", family_office: "dad.book.json" };

const demoCookieSchema = setupSchema.omit({ methodology: true }).extend({ methodology: demoRefSchema.nullable(), draft: demoRefSchema.nullable().optional(), showcase: z.boolean().optional() });

function readSample<T>(file: string, schema: z.ZodType<T>): T {
  if (!/^[a-z_.]+\.json$/.test(file)) throw new Error("Sample files are plain names inside data/samples.");
  return schema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", file), "utf8")));
}

export function sampleMethodology(ref: DemoRef): Methodology {
  if (isLibraryId(ref.sample)) return without(adoptMethodology(libraryEntry(ref.sample)!), ref.drop);
  const m = readSample(`methodology.${ref.sample}.json`, methodologySchema);
  return without({ ...m, origin: "sample" }, ref.drop);
}

export function sampleBook(profile: ProfileId): Book {
  return readSample(SAMPLE_BOOK[profile], bookSchema);
}

async function readDemoCookie(): Promise<z.infer<typeof demoCookieSchema> | null> {
  const raw = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = demoCookieSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type PrefsCookie = { preferences: Preferences; records: Records; decisions: DecisionsFile; alerts: AlertsFile; portfolios: PortfoliosFile | null; dropped: string[] };
const EMPTY_PREFS_COOKIE: PrefsCookie = { preferences: DEFAULT_PREFERENCES, records: EMPTY_RECORDS, decisions: EMPTY_DECISIONS, alerts: EMPTY_ALERTS, portfolios: null, dropped: [] };
async function readPrefsCookie(): Promise<PrefsCookie> {
  const raw = (await cookies()).get(PREFS_COOKIE)?.value;
  if (!raw) return EMPTY_PREFS_COOKIE;
  try {
    const parsed = prefsCookieSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_PREFS_COOKIE;
  } catch {
    return EMPTY_PREFS_COOKIE;
  }
}

/** The market feed, started before the vault is read so the two overlap; never a rejection, so an early vault error leaves nothing dangling. */
function startFeed(): Promise<Markets> {
  return loadMarkets(localDay()).catch((e: unknown) => {
    console.error(`[markets] feed failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { ...EMPTY_MARKETS, problems: ["The market feed could not be read."] };
  });
}

/** The market indicators laid on the book, lending their series to the benchmarks the methodology names (SPY, QQQ) when the book has none. */
async function withFeed(book: Book | null, m: Methodology | null, feed: Promise<Markets>): Promise<Book | null> {
  if (!book) return null;
  return withMarkets(book, await feed, [...benchmarksOf(m), ...HEADLINE_BENCHMARKS]);
}

/**
 * The showcase's own records: each holding's (its valuation, triggers, kill
 * signals and levels, kept on the holding in the snapshot) and the
 * watchlist's (showcase.records.json, fictional), as a records file holds both.
 */
function showcaseRecords(): Records {
  const held = readSample("showcase.book.json", bookSchema).holdings.flatMap((h) => (h.record ? [[h.symbol, h.record] as const] : []));
  const watched = readSample("showcase.records.json", recordsSchema);
  return { ...watched, bySymbol: { ...Object.fromEntries(held), ...watched.bySymbol } };
}

/** The showcase's records with the visitor's own on top: theirs win, and a showcase record they removed stays removed. */
function withShowcaseRecords(own: Records, dropped: readonly string[]): Records {
  const base = showcaseRecords();
  const gone = new Set(dropped.map((s) => s.toUpperCase()));
  const kept = Object.fromEntries(Object.entries(base.bySymbol).filter(([s]) => !gone.has(s.toUpperCase())));
  return { ...base, bySymbol: { ...kept, ...own.bySymbol }, updated: own.updated || base.updated };
}

/** What the visitor's cookie keeps of a records file in the showcase: the records that differ from the showcase's, and the showcase's they removed. */
function showcaseRecordsDiff(records: Records): { records: Records; dropped: string[] } {
  const base = showcaseRecords().bySymbol;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const own = Object.fromEntries(Object.entries(records.bySymbol).filter(([s, r]) => !base[s] || !same(base[s], r)));
  const dropped = Object.keys(base).filter((s) => !records.bySymbol[s]);
  return { records: { ...records, bySymbol: own }, dropped };
}

/** The showcase opens with the practices its owner keeps (Trade check, Decision Log, the to-do) and two people followed on Community, until the visitor saves their own choices. */
const SHOWCASE_FOLLOWING = ["quiet-compounder", "margin-hunter"];
function showcasePreferences(p: Preferences): Preferences {
  if (p.updated) return p;
  return { ...p, practices: p.practices.length ? p.practices : [...PRACTICES], following: p.following.length ? p.following : SHOWCASE_FOLLOWING };
}

/** The snapshot /try opens: the anonymized owner's setup, with their methodology by reference. */
export function showcaseSetup(): z.infer<typeof demoCookieSchema> {
  return { version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr"], tradesOptions: false, helperName: null, methodology: { sample: SHOWCASE_ID, drop: [] }, draft: null, showcase: true, updated: "2026-10-10T00:00:00.000Z" };
}

async function demoWorkspace(operator: Operator): Promise<Workspace> {
  return applyLens(...(await demoRaw(operator)));
}

/** The showcase as /try opens it, read without a browser's cookies: what the demo's MCP server serves. */
export async function showcaseWorkspace(): Promise<Workspace> {
  return applyLens(...(await demoRaw({ name: "Demo", email: "demo", image: null }, { cookie: showcaseSetup(), prefs: EMPTY_PREFS_COOKIE })));
}

async function demoRaw(operator: Operator, preset?: { cookie: z.infer<typeof demoCookieSchema>; prefs: typeof EMPTY_PREFS_COOKIE }): Promise<[Parameters<typeof applyLens>[0], PortfoliosFile | null]> {
  const c = preset ? preset.cookie : await readDemoCookie();
  const { preferences: ownPreferences, records: ownRecords, decisions: ownDecisions, alerts, portfolios, dropped } = preset ? preset.prefs : await readPrefsCookie();
  const setup: Setup | null = c ? { ...c, methodology: c.methodology ? sampleMethodology(c.methodology) : null } : null;
  const showcase = !!c?.showcase;
  const records = showcase ? withShowcaseRecords(ownRecords, dropped) : ownRecords;
  const preferences = showcase ? showcasePreferences(ownPreferences) : ownPreferences;
  // The showcase carries the snapshot's filings, study and Decision Log; a visitor's own entries go on top.
  const filings = showcase ? readSample("showcase.filings.json", filingsFileSchema) : null;
  // The snapshot's own study, then the sample's fictional ones (showcase.studies.json), newest first.
  const research = showcase ? (() => {
    const kept = readSample("showcase.research.json", researchFileSchema);
    const more = readSample("showcase.studies.json", researchFileSchema).studies.filter((s) => !kept.studies.some((k) => k.id === s.id));
    return { ...kept, studies: [...kept.studies, ...more].sort((a, b) => (b.finishedAt ?? b.requestedAt).localeCompare(a.finishedAt ?? a.requestedAt)) };
  })() : EMPTY_RESEARCH;
  const decisions = showcase ? (() => {
    const kept = readSample("showcase.decisions.json", decisionsFileSchema);
    const own = new Set(ownDecisions.entries.map((e) => e.id));
    return { ...kept, entries: [...ownDecisions.entries, ...kept.entries.filter((e) => !own.has(e.id))] };
  })() : ownDecisions;
  const feed = startFeed();
  const book = showcase
    ? setup ? composeBook(readSample("showcase.book.json", bookSchema), { records, filings, research, markets: await feed, methodology: setup.methodology }) : null
    : await withFeed(setup ? applyRecords(bookForInputs(sampleBook(setup.profile), setup.inputs), records) : null, setup?.methodology ?? null, feed);
  const propertyWatch = setup?.inputs.includes("property") && setup.profile === "family_office" ? readSample("dad.property_watch.json", propertyWatchSchema) : null;
  return [{
    mode: "demo",
    vault: null,
    bookNotes: [],
    bookUpdated: null,
    sync: null,
    fresh: book ? bookFreshness({ mode: "demo", showcase, asOf: book.asOf, steps: [] }, localDay()) : null,
    research,
    // One fictional conversation, built from the sample by the tools themselves; no model.
    analyst: setup?.methodology && book ? { ...EMPTY_ANALYST, threads: [demoThread(setup.methodology, book, localDay(), setup.inputs, setup.baseCurrency)] } : EMPTY_ANALYST,
    filings,
    benchmarks: readSample("benchmarks.json", benchmarksFileSchema),
    // The showcase's alerts as the last check left them (moves, five-year lows, the agents' findings), with this browser's dismissals on top.
    alerts: showcase ? showcaseAlerts(alerts) : alerts,
    decisions,
    // The family office sample shows what reading looks like; its figures are the sample book's own, so nothing is laid on.
    statements: setup?.profile === "family_office" && setup.inputs.some((i) => i === "bank_statements" || i === "fund_reports") ? readSample("dad.statements.json", statementsFileSchema) : EMPTY_STATEMENTS,
    statementNotes: [],
    customData: setup ? (() => {
      const sample = readSample("custom_data.json", customDataFileSchema);
      return movedSample(sample, sample.updated, customDataFileSchema);
    })() : EMPTY_CUSTOM_DATA,
    operator,
    setup,
    book,
    sample: true,
    showcase,
    propertyWatch,
    draft: c?.draft ? sampleMethodology(c.draft) : null,
    hasModelKey: false,
    askClaude: true,
    provider: null,
    // The demo's watchers are compiled ahead (lib/watchers.ts), so its alerts and its Watchers card agree.
    // The lens agents are on in the showcase, so the Agents screen shows what each read.
    preferences: { ...preferences, watchers: preferences.watchers.length ? preferences.watchers : DEMO_WATCHERS, lensAgents: showcase && !preferences.lensAgents.length ? [...LENS_IDS] : preferences.lensAgents },
    records,
    demo: { methodology: c?.methodology ?? null, draft: c?.draft ?? null },
    modules: setup ? modulesFor(setup, book) : ["setup"],
    ...screensFor(setup, book, records, decisions, preferences),
    error: null,
  }, portfolios];
}

// ---------------------------------------------------------------------------
// Drive

/** What a screen says about the AI: Claude, run by Invariant on its own key (lib/hosted-model.ts). */
const HOSTED_SUMMARY: ProviderSummary = { kind: "anthropic", label: "Claude, run by Invariant", host: null, model: null, hasKey: true };
export const bookNotesSchema = z.object({ notes: z.array(z.string().max(300)).max(10), updated: z.string() });

async function driveWorkspace(operator: Operator): Promise<Workspace> {
  return applyLens(...(await driveRaw(operator)));
}

/**
 * One person's workspace from a vault opened another way than the browser's
 * session: the MCP server's, from the sign-in the person's own Claude carries.
 */
export async function vaultWorkspace(operator: Operator, vault: Vault): Promise<Workspace> {
  return applyLens(...(await driveRaw(operator, vault)));
}

async function driveRaw(operator: Operator, given?: Vault): Promise<[Parameters<typeof applyLens>[0], PortfoliosFile | null]> {
  const { openVault } = await import("@/lib/vault");
  let info: VaultInfo | null = null;
  const started = Date.now();
  const feed = startFeed();
  try {
    const opened = given ?? (await openVault());
    const openMs = Date.now() - started;
    info = { kind: opened.kind, where: opened.where, provider: opened.provider };
    // Each file's time, by key, for the log line below; a key is not a figure.
    const fileMs: [string, number][] = [];
    const vault = {
      ...opened,
      readJson: async <T,>(key: Parameters<typeof opened.readJson>[0], schema: z.ZodType<T>): Promise<T | null> => {
        const t = Date.now();
        try {
          return await opened.readJson(key, schema);
        } finally {
          fileMs.push([key, Date.now() - t]);
        }
      },
    };
    // Every file in one go: the vault lists once and downloads in parallel. The setup and the book
    // decide what the person sees; the other files are theirs to arrange and a bad one must not turn
    // every screen into a fresh wizard. Each degrades on its own, and the sentence still reaches the screen.
    const problems: string[] = [];
    const soft = async <T,>(key: Parameters<typeof vault.readJson>[0], schema: Parameters<typeof vault.readJson<T>>[1]): Promise<T | null> => {
      try {
        return await vault.readJson(key, schema);
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[workspace] ${e.logDetail ?? `${key} read failed`}`);
        problems.push(e.message);
        return null;
      }
    };
    const [setup, fileBook, propertyWatch, draft, preferences, records, bookNotes, research, analyst, filings, decisions, statements, benchmarks, alerts, customData, portfolios, brokers, sync] = await Promise.all([
      vault.readJson("setup", setupSchema),
      vault.readJson("book", bookSchema),
      soft("property_watch", propertyWatchSchema),
      soft("methodology_draft", methodologySchema),
      soft("preferences", preferencesSchema),
      soft("records", recordsSchema),
      soft("book_notes", bookNotesSchema),
      soft("research", researchFileSchema),
      soft("analyst", analystFileSchema),
      soft("filings", filingsFileSchema),
      soft("decisions", decisionsFileSchema),
      soft("statements", statementsFileSchema),
      soft("benchmarks", benchmarksFileSchema),
      soft("alerts", alertsFileSchema),
      soft("custom_data", customDataFileSchema),
      soft("portfolios", portfoliosFileSchema),
      soft("brokers", brokersFileSchema),
      soft("sync", syncStatusSchema),
    ]);
    const readMs = Date.now() - started;
    const base = setup?.baseCurrency ?? fileBook?.fx.base ?? "USD";
    const laidStatements = withStatements(fileBook, statements, base, localDay());
    const laidBrokers = withBrokers(laidStatements.book, brokers, base, localDay());
    const laid = { book: laidBrokers.book, notes: [...laidStatements.notes, ...laidBrokers.notes] };
    const rawBook = laid.book;
    const book = composeBook(rawBook, { records, filings, research, markets: await feed, methodology: setup?.methodology ?? null });
    // Timings only, never a figure or a name: what a slow page spent on the vault and on the market feed.
    const slowest = fileMs.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, ms]) => `${k} ${ms}`).join(", ");
    console.info(`[workspace] vault ${readMs} ms (sign-in ${openMs} ms; slowest ${slowest}), feed wait ${Date.now() - started - readMs} ms`);
    return [{
      mode: "drive",
      operator,
      setup,
      book,
      sample: false,
      showcase: false,
      propertyWatch,
      draft,
      hasModelKey: hostedAvailable(),
      askClaude: !hostsOnDemand(operator.email),
      provider: hostedAvailable() ? HOSTED_SUMMARY : null,
      preferences: preferences ?? DEFAULT_PREFERENCES,
      records: records ?? EMPTY_RECORDS,
      bookNotes: bookNotes?.notes ?? [],
      bookUpdated: bookNotes?.updated ?? null,
      sync,
      fresh: book ? bookFreshness({ mode: "drive", showcase: false, asOf: book.asOf, steps: sync?.steps ?? [] }, localDay()) : null,
      research: research ?? EMPTY_RESEARCH,
      analyst: analyst ?? EMPTY_ANALYST,
      filings,
      benchmarks,
      alerts: alerts ?? EMPTY_ALERTS,
      decisions: decisions ?? EMPTY_DECISIONS,
      statements: statements ?? EMPTY_STATEMENTS,
      statementNotes: laid.notes,
      customData: customData ?? EMPTY_CUSTOM_DATA,
      demo: null,
      vault: info,
      modules: setup ? modulesFor(setup, book) : ["setup"],
      ...screensFor(setup, book, records, decisions, preferences),
      error: problems.length ? problems.join(" ") : null,
    }, portfolios];
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    // An email sign-in that has not linked a Drive yet is sent to Welcome, not logged as a failure.
    if (e.logDetail !== NO_VAULT) console.error(`[workspace] ${e.logDetail ?? "vault read failed"}`);
    return [{ mode: "drive", operator, setup: null, book: null, sample: false, showcase: false, propertyWatch: null, draft: null, hasModelKey: false, askClaude: true, provider: null, preferences: DEFAULT_PREFERENCES, records: EMPTY_RECORDS, bookNotes: [], bookUpdated: null, sync: null, fresh: null, research: EMPTY_RESEARCH, analyst: EMPTY_ANALYST, filings: null, benchmarks: null, alerts: EMPTY_ALERTS, decisions: EMPTY_DECISIONS, statements: EMPTY_STATEMENTS, statementNotes: [], customData: EMPTY_CUSTOM_DATA, demo: null, vault: info, modules: ["setup"], ...screensFor(null, null, null, null, null), error: e.message }, null];
  }
}

/** The signed-in person's workspace, read once per request. */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const operator = await requireOperator();
  return storageMode() === "drive" ? driveWorkspace(operator) : demoWorkspace(operator);
});

/** For a screen: the workspace, sent to Welcome when there is none yet, and a 404 when its screen is not switched on. */
export async function screen(module: Module): Promise<Workspace & { setup: Setup }> {
  const ws = await getWorkspace();
  if (!ws.setup) redirect("/welcome");
  if (!ws.modules.includes(module)) notFound();
  return ws as Workspace & { setup: Setup };
}

// ---------------------------------------------------------------------------
// Saving

/**
 * Keeps the Community card in step after a save that could change it: the
 * theses, the book, the setup (Hamza, 19 Oct 2026). Rebuilt after the
 * response is sent, from the same vault, by lib/community-run.ts; someone
 * not sharing costs one registry read, and a failure is a log line.
 */
function republishAfter(vault: Vault, operator: Operator): void {
  after(async () => {
    const { republishQuietly } = await import("@/lib/community-run");
    await republishQuietly(vault, operator.email);
  });
}

async function writeDemoCookie(value: z.infer<typeof demoCookieSchema>): Promise<void> {
  (await cookies()).set(DEMO_COOKIE, JSON.stringify(demoCookieSchema.parse(value)), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

/**
 * Saves the setup. In the demo the methodology is kept as its reference: the
 * one passed in `demo`, else the one already in the cookie when the setup still
 * carries a methodology, else none.
 */
export async function saveSetup(setup: Setup, demo?: { methodology?: DemoRef | null; draft?: DemoRef | null }): Promise<void> {
  const valid = setupSchema.parse(setup);
  if (storageMode() === "demo") {
    const prev = await readDemoCookie();
    const { methodology, ...rest } = valid;
    await writeDemoCookie({
      ...rest,
      methodology: demo?.methodology !== undefined ? demo.methodology : methodology ? (prev?.methodology ?? { sample: rest.profile, drop: [] }) : null,
      draft: demo?.draft !== undefined ? demo.draft : (prev?.draft ?? null),
      showcase: prev?.showcase,
    });
    return;
  }
  const { openVault } = await import("@/lib/vault");
  const v = await openVault();
  await v.writeJson("setup", valid);
  republishAfter(v, await requireOperator());
}

const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });

/** Browsers drop a cookie over 4 KB without a word, so the demo says so instead of losing the person's figures. */
const COOKIE_LIMIT = 3800;
function demoCookieValue(value: unknown): string {
  const text = JSON.stringify(value);
  if (text.length > COOKIE_LIMIT) throw new SyncError("The demo keeps your figures and records in a browser cookie, and it is full. Remove a figure or a record first.", "demo prefs cookie over limit");
  return text;
}

/**
 * Saves the person's arrangement of the app. The theme also goes in its own
 * cookie, in both modes, so the first paint has it before any file is read.
 */
export async function savePreferences(prefs: Preferences): Promise<void> {
  const valid = preferencesSchema.parse({ ...prefs, updated: new Date().toISOString() });
  const jar = await cookies();
  jar.set(THEME_COOKIE, valid.theme, cookieOptions());
  if (storageMode() === "demo") {
    const prev = await readPrefsCookie();
    jar.set(PREFS_COOKIE, demoCookieValue(prefsCookieSchema.parse({ ...prev, preferences: valid })), cookieOptions());
    return;
  }
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("preferences", valid);
}

/**
 * Saves a book uploaded on Setup (drive mode only); the notes from the import
 * are kept beside it, so Setup can say what the statement lacked.
 */
export async function saveBook(book: Book, notes: string[]): Promise<void> {
  if (storageMode() === "demo") throw new SyncError("The demo has fictional figures of its own.", "import in demo");
  const { openVault } = await import("@/lib/vault");
  const v = await openVault();
  const prev = await v.readJson("book", bookSchema).catch(() => null);
  const kept = keepHistory(prev, book);
  // An earlier year lends its days; it never replaces the book or its notes (Hamza, 19 Oct 2026: since inception).
  const earlier = !!prev && book.asOf < prev.asOf;
  if (earlier && (kept.series?.nav.length ?? 0) <= (prev.series?.nav.length ?? 0)) {
    throw new SyncError("That statement adds no earlier days: it covers dates the app already holds, another account, or has no daily account value. Run the query for the year before the first day shown and upload that.", "import older");
  }
  await v.writeJson("book", bookSchema.parse(kept));
  if (!earlier) await v.writeJson("book_notes", { notes: notes.slice(0, 10).map((n) => n.slice(0, 300)), updated: new Date().toISOString() });
  const operator = await requireOperator();
  republishAfter(v, operator);
  await (await import("@/lib/beta-run")).recordEvent(operator.email, "statement_read");
}

/** Saves what the person records about their holdings. */
export async function saveRecords(records: Records): Promise<void> {
  const valid = recordsSchema.parse({ ...records, updated: new Date().toISOString() });
  if (storageMode() === "demo") {
    const prev = await readPrefsCookie();
    const kept = (await readDemoCookie())?.showcase ? showcaseRecordsDiff(valid) : { records: valid, dropped: prev.dropped };
    (await cookies()).set(PREFS_COOKIE, demoCookieValue(prefsCookieSchema.parse({ ...prev, ...kept })), cookieOptions());
    return;
  }
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("records", valid);
}

/**
 * Saves the alerts file. In the demo the browser keeps only what the visitor
 * dismissed (ids, no wording), so the cookie stays small; the rest is derived
 * on each visit.
 */
export async function saveAlerts(file: AlertsFile): Promise<void> {
  const valid = alertsFileSchema.parse({ ...file, updated: new Date().toISOString() });
  if (storageMode() === "demo") {
    const prev = await readPrefsCookie();
    const dismissed = valid.items.filter((i) => i.dismissedAt !== null && i.clearedAt === null).slice(0, 12).map((i) => ({ ...i, title: "", detail: "", href: "/" }));
    (await cookies()).set(PREFS_COOKIE, demoCookieValue(prefsCookieSchema.parse({ ...prev, alerts: { ...valid, items: dismissed } })), cookieOptions());
    return;
  }
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("alerts", valid);
}

/**
 * Saves the person's portfolios. The demo keeps the groups in this browser's
 * cookie under one methodology: a methodology per portfolio needs a vault.
 */
export async function savePortfolios(file: PortfoliosFile): Promise<void> {
  const valid = portfoliosFileSchema.parse({ ...file, updated: new Date().toISOString() });
  if (storageMode() === "demo") {
    if (valid.mode === "each") throw new SyncError("The demo keeps one methodology for all portfolios; one each needs your own vault.", "demo each mode");
    const prev = await readPrefsCookie();
    (await cookies()).set(PREFS_COOKIE, demoCookieValue(prefsCookieSchema.parse({ ...prev, portfolios: { ...valid, items: valid.items.map((p) => ({ ...p, methodology: null })) } })), cookieOptions());
    return;
  }
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("portfolios", valid);
}

/** Saves the Decision Log: the vault's decisions file, or this browser's cookie in the demo. */
export async function saveDecisions(decisions: DecisionsFile): Promise<void> {
  const valid = decisionsFileSchema.parse({ ...decisions, updated: new Date().toISOString() });
  if (storageMode() === "demo") {
    const prev = await readPrefsCookie();
    // A cookie holds a few kilobytes: the demo keeps the newest twenty entries.
    (await cookies()).set(PREFS_COOKIE, demoCookieValue(prefsCookieSchema.parse({ ...prev, decisions: { ...valid, entries: valid.entries.slice(0, 20) } })), cookieOptions());
    return;
  }
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("decisions", valid);
}

/**
 * Saves the person's own data definitions and readings, and the API key one
 * of them needs (null removes it). Drive mode only: the demo's are fictional
 * and it reads nothing. The key goes to its own file and is never read back
 * to a screen.
 */
export async function saveCustomData(file: CustomDataFile, key?: { id: string; value: string | null }): Promise<void> {
  if (storageMode() === "demo") throw new SyncError("The demo shows fictional data and reads nothing. In your own copy, Add data keeps it in your vault.", "custom data in demo");
  const { openVault } = await import("@/lib/vault");
  const v = await openVault();
  if (key) {
    const keys = (await v.readJson("data_keys", dataKeysSchema)) ?? EMPTY_DATA_KEYS;
    const next = { ...keys.keys };
    if (key.value) next[key.id] = key.value;
    else delete next[key.id];
    await v.writeJson("data_keys", dataKeysSchema.parse({ version: 1, keys: next }));
  }
  await v.writeJson("custom_data", customDataFileSchema.parse({ ...file, updated: new Date().toISOString() }));
}

/** Demo only: points the draft at a sample, or clears it. */
export async function saveDemoDraft(draft: DemoRef | null): Promise<void> {
  const prev = await readDemoCookie();
  if (!prev) return;
  await writeDemoCookie({ ...prev, draft });
}

/** Demo only: opens the showcase, forgetting the visitor's earlier choices and entries. */
export async function startShowcase(): Promise<void> {
  if (storageMode() !== "demo") return;
  await writeDemoCookie(showcaseSetup());
  (await cookies()).delete(PREFS_COOKIE);
}

/** Starts again: the demo forgets its choices; drive mode keeps the person's files and only reopens the wizard. */
export async function resetDemo(): Promise<void> {
  if (storageMode() === "demo") {
    const jar = await cookies();
    jar.delete(DEMO_COOKIE);
    jar.delete(PREFS_COOKIE);
  }
}

/** The person's own newsletters address: the statements inbox with their tag and "-news" (lib/newsletters.ts). */
export function newslettersAddress(email: string): string | null {
  const inbox = process.env.INBOX_ADDRESS;
  if (storageMode() === "demo") return "statements+demo-news@example.com";
  if (!inbox) return null;
  return newslettersAddressFor(inbox, inboxTag(email));
}

const DAY_MS = 86_400_000;
const weekendAt = (t: number) => [0, 6].includes(new Date(t).getUTCDay());

/**
 * A day of the demo's newsletters laid on the sessions just gone (4 Nov
 * 2026): the sample's newest day lands on `target`, and every other day as
 * many weekdays before it as it sat before the sample's newest, a weekend
 * day after its Friday, so each daily recap stays a weekday's issue.
 */
function demoNewsletterDay(day: string, newest: string, target: string): number {
  let t = Date.parse(`${day}T00:00:00Z`);
  let weekend = 0;
  while (weekendAt(t)) {
    t -= DAY_MS;
    weekend += 1;
  }
  let n = 0;
  for (let u = Date.parse(`${newest}T00:00:00Z`); u > t; u -= DAY_MS) if (!weekendAt(u)) n += 1;
  let s = Date.parse(`${target}T00:00:00Z`);
  while (n > 0) {
    s -= DAY_MS;
    if (!weekendAt(s)) n -= 1;
  }
  return s + weekend * DAY_MS;
}

/**
 * The person's newsletter digests, read only by the screens that show them,
 * so no other page waits on the file. The demo's are fictional, laid on the
 * last sessions closed in New York (the newest on the last one, each at its
 * own time of day and never after now), and touch only the sample book's
 * holdings.
 */
export async function newslettersFor(ws: Workspace): Promise<{ file: NewslettersFile; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("newsletters.json", newslettersFileSchema);
    const held = new Set((ws.book?.holdings ?? []).map((h) => h.symbol.toUpperCase()));
    const newest = sample.digests.reduce((m, d) => (d.receivedAt > m ? d.receivedAt : m), "").slice(0, 10);
    const now = Date.now();
    const target = closedBy(new Date(now));
    const at = (iso: string) => new Date(Math.min(now - 60_000, demoNewsletterDay(iso.slice(0, 10), newest, target) + (Date.parse(iso) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)))).toISOString();
    const digests = sample.digests.map((d) => ({ ...d, receivedAt: at(d.receivedAt), ...(d.date ? { date: at(d.date) } : {}), reading: d.reading ? { ...d.reading, points: d.reading.points.map((p) => ({ ...p, symbols: p.symbols.filter((s) => held.has(s)) })) } : null }));
    return { file: { ...sample, digests }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("newsletters", newslettersFileSchema)) ?? EMPTY_NEWSLETTERS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_NEWSLETTERS, error: e.message };
  }
}

/**
 * The podcasts the person follows and the episodes written up (Hamza, 20 Oct
 * 2026). The demo's are fictional, dated to the last fortnight.
 */
export async function podcastsFor(ws: Workspace): Promise<{ file: PodcastsFile; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("podcasts.json", podcastsFileSchema);
    const latest = sample.episodes.reduce((m, e) => (e.date > m ? e.date : m), "");
    const shift = latest ? Date.parse(`${localDay()}T00:00:00Z`) - 86_400_000 - Date.parse(`${latest}T00:00:00Z`) : 0;
    const move = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + shift).toISOString().slice(0, 10);
    return { file: { ...sample, episodes: sample.episodes.map((e) => ({ ...e, date: move(e.date), readAt: `${move(e.date)}T07:00:00.000Z` })) }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("podcasts", podcastsFileSchema)) ?? EMPTY_PODCASTS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_PODCASTS, error: e.message };
  }
}

/** Keeps the podcasts file: the shows followed and the episodes written up. */
export async function savePodcasts(file: PodcastsFile): Promise<void> {
  if (storageMode() === "demo") throw new SyncError("The demo's podcasts are fictional and cannot be changed. In your own copy, the shows you follow are kept in your vault.", "podcasts in demo");
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("podcasts", podcastsFileSchema.parse({ ...file, updated: new Date().toISOString() }));
}

/**
 * The newsletter senders the person's Claude proposed through the connector
 * and what the person decided, read only by Setup's Newsletters card. The
 * demo's are fictional and cannot be changed.
 */
export async function newsletterSendersFor(ws: Workspace): Promise<{ file: NewsletterSendersFile; error: string | null }> {
  if (ws.mode === "demo") return { file: readSample("newsletter_senders.json", newsletterSendersSchema), error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("newsletter_senders", newsletterSendersSchema)) ?? EMPTY_SENDERS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_SENDERS, error: e.message };
  }
}

/** Gmail's forwarding confirmations the app kept for this person (lib/inbox.ts); the demo's are a fictional sample, dated around today. */
export async function forwardingFor(ws: Workspace): Promise<ForwardingFile | null> {
  if (ws.mode !== "drive") {
    const sample = readSample("forwarding.json", forwardingFileSchema);
    return movedSample(sample, sample.updated, forwardingFileSchema);
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return await (await openVault()).readJson("forwarding", forwardingFileSchema);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return null;
  }
}

/**
 * The recaps the person's Claude wrote after each close, read only by the
 * screen that shows them. The demo's is fictional and calls no model.
 */
export async function recapsFor(ws: Workspace): Promise<{ file: RecapsFile; error: string | null }> {
  if (ws.mode === "demo") return { file: readSample(ws.showcase ? "showcase.recaps.json" : "recaps.json", recapsFileSchema), error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("recaps", recapsFileSchema)) ?? EMPTY_RECAPS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_RECAPS, error: e.message };
  }
}

/**
 * The reports after each company's results, read only by the screen that
 * shows them. The demo's are fictional, from the sample calendar.
 */
export async function earningsFor(ws: Workspace): Promise<{ file: EarningsFile; error: string | null }> {
  if (ws.mode === "demo") return { file: (await loadEarnings(localDay())).file ?? EMPTY_EARNINGS, error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("earnings", earningsFileSchema)) ?? EMPTY_EARNINGS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_EARNINGS, error: e.message };
  }
}

/**
 * What the Thesis Hunter found for each thesis (lib/thesis-hunter.ts). The
 * demo's finds are a fictional sample whose days stay around today.
 */
/**
 * What the Calendar agent found (lib/calendar-agent.ts). The demo's sample is
 * fictional, its days moved so they stay ahead of today.
 */
export async function calendarFoundFor(ws: Workspace): Promise<{ file: CalendarFound; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("calendar_events.json", calendarFoundSchema);
    const shift = Date.parse(`${localDay()}T00:00:00Z`) - Date.parse(`${sample.updated.slice(0, 10)}T00:00:00Z`);
    const move = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + shift).toISOString().slice(0, 10);
    return { file: { ...sample, month: localDay().slice(0, 7), ranAt: sample.ranAt ? `${move(sample.ranAt.slice(0, 10))}${sample.ranAt.slice(10)}` : null, events: sample.events.map((e) => ({ ...e, date: move(e.date), found: move(e.found) })) }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("calendar_events", calendarFoundSchema)) ?? EMPTY_FOUND, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_FOUND, error: e.message };
  }
}

/**
 * The reports after the macro events (lib/macro-report.ts). The demo's are a
 * fictional sample whose days are moved so the latest stays a few days back.
 */
export async function macroReportsFor(ws: Workspace): Promise<{ file: MacroReportsFile; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("macro_reports.json", macroReportsFileSchema);
    const shift = Date.parse(`${localDay()}T00:00:00Z`) - Date.parse(`${sample.updated.slice(0, 10)}T00:00:00Z`);
    const move = (d: string) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + shift).toISOString().slice(0, 10);
    const at = (iso: string) => `${move(iso)}${iso.slice(10)}`;
    return { file: { ...sample, updated: at(sample.updated), reports: sample.reports.map((r) => ({ ...r, key: `${move(r.date)}${r.key.slice(10)}`, date: move(r.date), session: move(r.session), builtAt: at(r.builtAt), updatedAt: at(r.updatedAt), deck: null })) }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("macro_reports", macroReportsFileSchema)) ?? EMPTY_MACRO, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_MACRO, error: e.message };
  }
}

export async function thesisHunterFor(ws: Workspace): Promise<{ file: ThesisHunterFile; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("thesis_hunter.json", thesisHunterFileSchema);
    const shift = Date.parse(`${localDay()}T00:00:00Z`) - Date.parse(`${sample.updated.slice(0, 10)}T00:00:00Z`);
    const move = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + shift).toISOString().slice(0, 10);
    const subjects = Object.fromEntries(Object.entries(sample.subjects).map(([k, h]) => [k, { ...h, huntedAt: h.huntedAt ? `${move(h.huntedAt.slice(0, 10))}${h.huntedAt.slice(10)}` : null, finds: h.finds.map((f) => ({ ...f, found: move(f.found), date: f.date ? move(f.date) : null, figure: f.figure ? { ...f.figure, at: move(f.figure.at) } : null })) }]));
    return { file: { ...sample, subjects }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("thesis_hunter", thesisHunterFileSchema)) ?? EMPTY_HUNTER, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_HUNTER, error: e.message };
  }
}

/** The showcase's alerts: the fictional sample the twice-daily check would have left, moved to today, with what this browser dismissed laid on it. */
function showcaseAlerts(own: AlertsFile): AlertsFile {
  const sample = readSample("alerts.json", alertsFileSchema);
  const kept = movedSample(sample, sample.updated, alertsFileSchema);
  const dismissed = new Map(own.items.filter((i) => i.dismissedAt !== null).map((i) => [i.id, i.dismissedAt]));
  const ids = new Set(kept.items.map((i) => i.id));
  return { ...kept, items: [...kept.items.map((i) => (dismissed.has(i.id) ? { ...i, dismissedAt: dismissed.get(i.id) ?? null } : i)), ...own.items.filter((i) => !ids.has(i.id))] };
}

/** Every date in a demo sample moved by the same number of days, so a fictional sample stays around today. */
function movedSample<T>(sample: T, from: string, schema: z.ZodType<T>): T {
  const shift = Date.parse(`${localDay()}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const json = JSON.stringify(sample).replace(/\b(\d{4}-\d{2}-\d{2})(?=T|"|\b)/g, (d) => new Date(Date.parse(`${d}T00:00:00Z`) + shift).toISOString().slice(0, 10));
  return schema.parse(JSON.parse(json));
}

/**
 * The Research Agent's file (lib/research-agent.ts): each company's findings,
 * what it kept and dropped, the priced-in readings and every agent's runs. The
 * demo's is a fictional sample whose days stay around today, and it runs nothing.
 */
export async function researchFor(ws: Workspace): Promise<{ file: ResearchCache; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("research_cache.json", researchCacheSchema);
    return { file: movedSample(sample, sample.updated, researchCacheSchema), error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("research_cache", researchCacheSchema)) ?? EMPTY_RESEARCH_CACHE, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_RESEARCH_CACHE, error: e.message };
  }
}

/** The agents the person built in the Agent Builder; the showcase's are a fictional sample, tested and run around today, and the demo builds nothing. */
export async function customAgentsFor(ws: Workspace): Promise<{ file: CustomAgentsFile; error: string | null }> {
  if (ws.mode === "demo") {
    if (!ws.showcase) return { file: EMPTY_CUSTOM_AGENTS, error: null };
    const sample = readSample("custom_agents.json", customAgentsFileSchema);
    return { file: movedSample(sample, sample.updated, customAgentsFileSchema), error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("custom_agents", customAgentsFileSchema)) ?? EMPTY_CUSTOM_AGENTS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_CUSTOM_AGENTS, error: e.message };
  }
}

/** The person's ratings of the agents' findings and the lessons from them (lib/agents.ts); the demo's are a fictional sample, kept in the page alone. */
export async function agentFeedbackFor(ws: Workspace): Promise<{ file: AgentFeedback; error: string | null }> {
  if (ws.mode === "demo") {
    const sample = readSample("agent_feedback.json", agentFeedbackSchema);
    return { file: movedSample(sample, sample.updated, agentFeedbackSchema), error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("agent_feedback", agentFeedbackSchema)) ?? EMPTY_FEEDBACK, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_FEEDBACK, error: e.message };
  }
}

/** How the person judges their methodology (lib/methodology-evaluation.ts); the showcase's is a sample of tests confirmed, made by no model; any other demo reads the app's defaults. */
export async function evaluationFor(ws: Workspace): Promise<{ file: EvaluationFile; error: string | null }> {
  if (ws.mode === "demo") return { file: ws.showcase ? readSample("showcase.evaluation.json", evaluationFileSchema) : EMPTY_EVALUATION, error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("evaluation", evaluationFileSchema)) ?? EMPTY_EVALUATION, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_EVALUATION, error: e.message };
  }
}

/** The Performance page read through the methodology (lib/perf-insights.ts); the demo shows a sample, made by no model. */
export async function perfInsightsFor(ws: Workspace): Promise<{ file: PerfInsightsFile | null; error: string | null }> {
  if (ws.mode === "demo") return { file: ws.showcase ? readSample("perf_insights.json", perfInsightsFileSchema) : null, error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: await (await openVault()).readJson("perf_insights", perfInsightsFileSchema), error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: null, error: e.message };
  }
}

/**
 * The screener's companies (lib/screener.ts). The demo has no S&P 500 read:
 * its screener is the sample's fictional figures for the session's companies
 * (data/samples/screener.json) beside the showcase's holdings, so the screen
 * shows how the classes sort a list, and says it is a sample.
 */
export async function screenerFor(ws: Workspace): Promise<{ file: ScreenerFile; error: string | null }> {
  if (ws.mode === "demo") {
    const at = `${localDay()}T06:00:00.000Z`;
    const sample = readSample("screener.json", screenerFileSchema);
    const bySymbol: Record<string, ScreenCompany> = Object.fromEntries(Object.values(sample.bySymbol).map((c) => [c.symbol, { ...c, readAt: at }]));
    for (const e of Object.values(ws.filings?.bySymbol ?? {})) {
      if (e.error) continue;
      const symbol = (e.ticker ?? e.symbol).toUpperCase();
      bySymbol[symbol] = { symbol, name: e.name, cik: e.cik, sector: e.sector ?? null, subIndustry: e.subIndustry ?? null, sic: e.sic ?? null, cap: null, price: null, readAt: e.readAt, values: keptValues(e.values), shares: null, usd: true, error: null };
    }
    return { file: { version: 1, universe: Object.keys(bySymbol), bySymbol, updated: at }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("screener", screenerFileSchema)) ?? EMPTY_SCREENER, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_SCREENER, error: e.message };
  }
}

/** The top funds' 13Fs (lib/funds.ts); the demo's are fictional funds in a sample file. */
export async function fundsFor(ws: Workspace): Promise<{ file: FundsFile; error: string | null }> {
  if (ws.mode === "demo") return { file: readSample("funds.json", fundsFileSchema), error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("funds", fundsFileSchema)) ?? EMPTY_FUNDS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_FUNDS, error: e.message };
  }
}

/** What the top funds say they do (lib/fund-creeds.ts), read once for everyone and kept in the registry; the demo's are fictional. */
export async function fundCreedsFor(ws: Workspace): Promise<{ creeds: Creeds; error: string | null }> {
  if (ws.mode === "demo") return { creeds: readSample("fund_creeds.json", z.record(z.string(), creedSchema)), error: null };
  try {
    const { keptCreeds } = await import("@/lib/fund-creeds-run");
    return { creeds: await keptCreeds(), error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { creeds: {}, error: e.message };
  }
}

/** Where the money in the largest US ETFs went (lib/etf-flows.ts), read once for everyone and kept in the registry; the demo's are fictional. */
export async function etfFlowsFor(ws: Workspace): Promise<{ flows: EtfFlows | null; error: string | null }> {
  if (ws.mode === "demo") return { flows: etfFlows(FLOW_FUNDS, readSample("etf_flows.json", z.record(z.string(), fundFlowSchema))), error: null };
  try {
    const { etfFlowsNow } = await import("@/lib/etf-flows-run");
    return { flows: await etfFlowsNow(), error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { flows: null, error: e.message };
  }
}

/** The Flows screen's other four sources (lib/flows.ts), read once for everyone; the demo's are a fictional sample. */
export async function flowSourcesFor(ws: Workspace): Promise<FlowSourceRow | null> {
  if (ws.mode === "demo") return readSample("flow_sources.json", flowSourceRowSchema);
  const { keptFlowSources } = await import("@/lib/flows-run");
  return keptFlowSources();
}

/** Saves the Thesis Hunter's file; the demo's finds are fictional and stay as they are. */
export async function saveThesisHunter(file: ThesisHunterFile): Promise<void> {
  if (storageMode() === "demo") throw new SyncError("The demo's finds are fictional and stay as they are.", "thesis hunter in demo");
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("thesis_hunter", thesisHunterFileSchema.parse({ ...file, updated: new Date().toISOString() }));
}

/**
 * The person's theses, one per holding (lib/theses.ts), read by the Theses
 * screen and the earnings run. The demo's are fictional and read-only.
 */
export async function thesesFor(ws: Workspace): Promise<{ file: ThesesFile; error: string | null }> {
  if (ws.mode === "demo") {
    // The showcase keeps its own (fictional words on the anonymized book's holdings).
    const sample = ws.showcase ? readSample("showcase.theses.json", thesesFileSchema) : readSample("theses.json", thesesFileSchema);
    // The holdings' theses and the watchlist's: a watched company's thesis is written when it is added.
    const ours = new Set([...(ws.book?.holdings ?? []).map((h) => h.symbol.toUpperCase()), ...Object.keys(ws.records.bySymbol).map((s) => s.toUpperCase())]);
    const bySymbol = Object.fromEntries(Object.entries(sample.bySymbol).filter(([k]) => ours.has(k.toUpperCase())));
    return { file: { ...sample, bySymbol }, error: null };
  }
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("theses", thesesFileSchema)) ?? EMPTY_THESES, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_THESES, error: e.message };
  }
}

/**
 * The Community screen's reading (Hamza, 18 Oct 2026): every profile shared
 * on this deployment and the person's own, from the registry; the demo reads
 * a fictional sample and shares nothing. A registry that is not set up, or
 * cannot be reached, is a sentence, never an empty room.
 */
export async function communityFor(ws: Workspace): Promise<{ profiles: CommunityProfile[]; mine: CommunityProfile | null; available: boolean; error: string | null }> {
  if (ws.mode === "demo") {
    // The sample's cards changed in the days before 4 Nov 2026; they move with today, so what followed people changed stays recent.
    const shift = Date.parse(`${localDay()}T00:00:00Z`) - Date.parse("2026-11-04T00:00:00Z");
    const move = (iso: string) => (Number.isFinite(Date.parse(iso)) ? new Date(Date.parse(iso) + shift).toISOString() : iso);
    const profiles = readSample("community.json", communityFileSchema).profiles.map((p) => ({ ...p, updatedAt: move(p.updatedAt), changed: p.changed ? { ...p.changed, at: move(p.changed.at) } : null }));
    return { profiles, mine: null, available: true, error: null };
  }
  const { registryAvailable, registryProblem, communityProfiles, myProfile } = await import("@/lib/registry");
  if (!registryAvailable()) return { profiles: [], mine: null, available: false, error: registryProblem() ?? "The community needs the deployment's registry, which is not set up." };
  try {
    const [{ profiles, unreadable }, mine] = await Promise.all([communityProfiles(), myProfile(ws.operator.email)]);
    return { profiles, mine, available: true, error: unreadable ? `${unreadable} shared profile${unreadable === 1 ? " could" : "s could"} not be read and ${unreadable === 1 ? "is" : "are"} left out.` : null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { profiles: [], mine: null, available: true, error: e.message };
  }
}

/** The changes documents the person uploaded propose to their theses, pending their review (lib/thesis-review.ts); the showcase shows one fictional proposal, made by no model, and applies nothing. */
export async function thesisProposalsFor(ws: Workspace): Promise<{ file: ProposalsFile; error: string | null }> {
  if (ws.mode === "demo") return { file: ws.showcase ? readSample("thesis_proposals.json", proposalsFileSchema) : EMPTY_PROPOSALS, error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("thesis_proposals", proposalsFileSchema)) ?? EMPTY_PROPOSALS, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_PROPOSALS, error: e.message };
  }
}

/** Saves the pending proposals; the demo keeps none. */
export async function saveThesisProposals(file: ProposalsFile): Promise<void> {
  if (storageMode() === "demo") throw new SyncError("The demo's theses are fictional and read-only.", "thesis proposals in demo");
  const { openVault } = await import("@/lib/vault");
  await (await openVault()).writeJson("thesis_proposals", proposalsFileSchema.parse({ ...file, updated: new Date().toISOString() }));
}

/** What the person's own Claude proposed to their theses through write_thesis, pending their review (lib/thesis-writes.ts); the demo has none. */
export async function thesisWritesFor(ws: Workspace): Promise<{ file: ThesisWritesFile; error: string | null }> {
  if (ws.mode === "demo") return { file: EMPTY_THESIS_WRITES, error: null };
  try {
    const { openVault } = await import("@/lib/vault");
    return { file: (await (await openVault()).readJson("thesis_writes", thesisWritesFileSchema)) ?? EMPTY_THESIS_WRITES, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { file: EMPTY_THESIS_WRITES, error: e.message };
  }
}

/** Saves the theses file. The demo's theses are fictional and cannot be changed. */
export async function saveTheses(file: ThesesFile): Promise<void> {
  if (storageMode() === "demo") throw new SyncError("The demo's theses are fictional and cannot be changed. In your own copy, each thesis is kept in your vault.", "theses in demo");
  const { openVault } = await import("@/lib/vault");
  const v = await openVault();
  await v.writeJson("theses", thesesFileSchema.parse({ ...file, updated: new Date().toISOString() }));
  republishAfter(v, await requireOperator());
}

/**
 * The Earnings screen's reading: the calendar around today (the feed's short
 * budget), the person's companies on it, the reports kept, and the alerts
 * they make; `notices` is null while the calendar has not been read, so a
 * screen keeps the alerts as the last check left them.
 */
export async function earningsView(ws: Workspace, wait: "budget" | "full" = "budget") {
  const today = localDay();
  const [{ calendar, pending }, kept] = await Promise.all([loadEarnings(today, wait), earningsFor(ws)]);
  const subjects = earningsSubjects(ws.book, ws.records.bySymbol, ws.preferences.earnings);
  const entries = entriesFor(calendar, subjects);
  // The demo's sample reports are for the showcase's companies; a sample book shows only its own.
  const ours = new Set(subjects.map((s) => symbolKey(s.symbol)));
  const file = ws.mode === "demo" ? { ...kept.file, reports: kept.file.reports.filter((r) => ours.has(symbolKey(r.symbol))) } : kept.file;
  return { today, calendar, pending, subjects, entries, file, error: kept.error, notices: calendar ? [...earningsNotices(entries, today), ...reportNotices(file, today)] : licensedOnly() ? reportNotices(file, today) : null };
}

/**
 * The person's own statements address: one inbox for the deployment, with a
 * tag per person so each forwarded statement lands in the right Drive. Set by
 * INBOX_ADDRESS; the tag is a short hash of their sign-in, never their email.
 */
export function statementsAddress(email: string): string | null {
  const inbox = process.env.INBOX_ADDRESS;
  if (storageMode() === "demo") return "statements+demo@example.com";
  if (!inbox || !/^[^@\s+]+@[^@\s]+$/.test(inbox)) return null;
  const [local, domain] = inbox.split("@");
  return `${local}+${inboxTag(email)}@${domain}`;
}
