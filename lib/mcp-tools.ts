/**
 * What a person's own Claude may ask of Invariant: the analyst's tools and
 * the screens' own readings, as read-only MCP tools.
 *
 * The same rule as the analyst: the app computes, the model only reads. Each
 * tool runs the app's pure functions over the person's own data (the
 * methodology's checks with their sections, recipes over the ontology, the
 * alerts, the to-do, the Decision Log, the last review, a BM25 search of the
 * vault) and returns text. Nothing here writes but the tools marked so, each
 * to the person's own vault and each shown to them (a newsletter proposal, a
 * thesis proposal they approve, a Decision Log entry, a rating, a study's
 * sections, a price check's verdicts; Hamza, 9 Nov 2026, the beta's
 * write-back): no tool places an order, sends anything or touches a broker,
 * and every tool says what it does in its annotations.
 *
 * Pure: lib/mcp-run.ts hands it the data, scripts/check-mcp.ts runs every
 * tool over the showcase.
 */
import { z } from "zod";

import { alertsView } from "@/lib/alerts";
import { checksText, corpusOf, hitsText, holdingsText, RECIPE_SHAPE, runTasks, searchCorpus, tasksText, type Lesson } from "@/lib/analyst";
import { decisionWriteSchema, sortedDecisions, outcomeWords, type Decision, type DecisionsFile, type DecisionWrite } from "@/lib/decisions";
import { VERDICTS, WRONG_LABEL, WRONG_REASONS, ratingFor, type AgentFeedback, type Verdict, type WrongReason } from "@/lib/agents";
import type { ResearchCache } from "@/lib/research-agent";
import type { ThesisHunterFile } from "@/lib/thesis-hunter";
import type { SectionCheck } from "@/lib/study-writes";
import type { Study } from "@/lib/research";
import type { BrokerCheck } from "@/lib/alerts";
import type { FilingsFile } from "@/lib/filings";
import type { Book } from "@/lib/holdings";
import { testedAs, type Methodology } from "@/lib/methodology";
import { describeOntology } from "@/lib/ontology";
import { lensView, METHODOLOGY_MODE_LABEL, type Portfolio, type PortfoliosFile } from "@/lib/portfolios";
import type { Preferences, Records } from "@/lib/preferences";
import { exprWords, formatUnit } from "@/lib/recipes";
import type { ReportsFile } from "@/lib/report";
import { criteriaWords, type ResearchFile } from "@/lib/research";
import { deriveScreens } from "@/lib/screen-data";
import type { Shown } from "@/lib/screens";
import type { InputId, Setup } from "@/lib/setup";
import type { StatementsFile } from "@/lib/statements";
import type { AlertsFile } from "@/lib/alerts";
import { MAX_FILTER_SENDERS, proposedSenderSchema, type NewsletterSendersFile, type ProposedSender, type proposeSenders } from "@/lib/newsletters";
import type { EarningsEntry, EarningsFile } from "@/lib/earnings";
import { marketReadings, marketThesisFor, pillarReadings, RESULTS_READ_DAYS, resultsToRead, routineSchedule, thesesSubjects, thesisFor, thesisWriteInputSchema, thesisWriteSchema, ThesisWriteProblem, type MarketThesis, type Thesis, type ThesesFile, type ThesisWrite } from "@/lib/theses";
import { TODO_GROUP_LABEL, TODO_GROUPS } from "@/lib/todo";

/** Everything the tools read: one person's workspace, as kept (all portfolios), and today on their clock. */
export type McpSource = {
  today: string;
  /** The demo's anonymized snapshot: no vault, no filings read. */
  demo: boolean;
  setup: Setup | null;
  book: Book | null;
  portfolios: PortfoliosFile;
  shown: Shown;
  preferences: Preferences;
  records: Records;
  decisions: DecisionsFile;
  alerts: AlertsFile;
  research: ResearchFile;
  reports: ReportsFile | null;
  lessons: Lesson[];
  filings: FilingsFile | null;
  statements: StatementsFile;
  /** The address the person's newsletters are forwarded to; null until the operator sets up the inbox. */
  newslettersAddress: string | null;
  /**
   * Lays the newsletter senders the person's Claude found on their vault as
   * proposals, for them to keep or remove on Setup's Newsletters card; null in the demo.
   * The one write a tool may make.
   */
  propose: ((found: readonly ProposedSender[]) => Promise<ReturnType<typeof proposeSenders>>) | null;
  /** The theses file as kept (stock theses by symbol, market theses), or null when it could not be read. */
  theses: ThesesFile | null;
  /** The post-earnings reports as kept, or null when they could not be read. */
  earnings: EarningsFile | null;
  /** The results calendar's dates for the person's followed companies, or null when it could not be read. */
  calendar: EarningsEntry[] | null;
  /** The watchlist: the symbols recorded without being held. */
  watchlist: string[];
  /**
   * Takes a write from the person's Claude to one of their theses: kept
   * pending for them to approve on the Theses screen, or, for an evidence
   * entry alone, added at once; null in the demo (Hamza, 18 Oct 2026; pending
   * since 9 Nov 2026).
   */
  writeThesis: ((w: ThesisWrite) => Promise<ThesisWriteResult>) | null;
  /** Files an entry in the Decision Log, marked as written by Claude; null in the demo. */
  recordDecision: ((w: DecisionWrite) => Promise<Decision>) | null;
  /** The Research Agent's kept findings and the Thesis Hunter's finds, with the person's ratings; null when not read. */
  researchCache: ResearchCache | null;
  hunter: ThesisHunterFile | null;
  feedback: AgentFeedback | null;
  /** Keeps the person's rating of a finding, as the Agents screen does; null in the demo. */
  rateFinding: ((r: FindingRating) => Promise<void>) | null;
  /** The studies waiting to be written, each with its brief (the app reads a queued one's figures first); null in the demo or without a methodology. */
  studiesToWrite: ((id: string | null) => Promise<{ study: Study; brief: string }[]>) | null;
  /** Keeps the sections Claude wrote that pass the figures check; null in the demo or without a methodology. */
  writeStudy: ((id: string, sections: { id: string; markdown: string }[]) => Promise<{ study: Study; check: SectionCheck }>) | null;
  /** Lays a price check's verdicts on the alerts, no price kept; returns what the records do not hold; null in the demo. */
  reportChecks: ((checks: BrokerCheck[]) => Promise<{ fired: number; open: number; unknown: string[] }>) | null;
  /** Sentences about files that could not be read or figures left out. */
  notes: string[];
  /** Reads a company's SEC filings as a table; null where filings are not read. */
  edgar: ((ticker: string) => Promise<string>) | null;
};

export type McpTool<S = McpSource> = {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  run: (src: S, args: never) => string | Promise<string>;
  /** A tool that writes to the person's own vault (a proposal they decide on, a thesis they review). Every other tool is read-only. */
  writes?: true;
  /** A tool that reads a public source outside the app (the SEC, FINRA), marked open-world. */
  open?: true;
};

/** A sentence the tool returns as an error result, never a throw past the protocol. */
export class ToolProblem extends Error {}

/** What became of a write_thesis: applied (an evidence entry alone), or kept pending for the person. */
export type ThesisWriteResult = { pending: false; subject: string; changed: string[]; created: boolean } | { pending: true; subject: string; parts: string[]; isNew: boolean; replaced: boolean };

/** A rating as the Agents screen keeps it. */
export type FindingRating = { agent: "company_news" | "thesis_hunter"; target: string; subject: string; title: string; verdict: Verdict; reasons: WrongReason[]; note: string | null };

// ---------------------------------------------------------------------------
// The view: one portfolio or all of them, with the methodology that applies

type View = { label: string; portfolio: Portfolio | null; methodology: Methodology | null; book: Book | null; ccy: string; inputs: readonly InputId[] };

const portfolioArg = z.string().max(80).optional().describe("A portfolio's name or id, to read one portfolio alone. Leave it out for all portfolios together.");

function viewOf(src: McpSource, portfolio?: string): View {
  if (!src.setup) throw new ToolProblem("Setup is not finished in Invariant yet, so there is nothing to read. Finish Setup in the app first.");
  let id: string | null = null;
  if (portfolio) {
    const want = portfolio.trim().toLowerCase();
    const p = src.portfolios.items.find((x) => x.id.toLowerCase() === want || x.name.toLowerCase() === want);
    if (!p) throw new ToolProblem(`There is no portfolio called "${portfolio}". The portfolios are: ${src.portfolios.items.map((x) => x.name).join(", ")}.`);
    id = p.id;
  }
  const v = lensView(src.portfolios, id, src.setup.methodology, src.book);
  return { label: v.portfolio ? `the ${v.portfolio.name} portfolio` : "all portfolios together", portfolio: v.portfolio, methodology: v.methodology, book: v.book, ccy: src.setup.baseCurrency, inputs: src.setup.inputs };
}

function needBook(v: View): Book {
  if (!v.book) throw new ToolProblem("No figures have arrived yet: the first statement or broker fetch has not come in. Say so; nothing can be computed.");
  return v.book;
}

function needMethodology(src: McpSource, v: View): Methodology {
  if (v.methodology) return v.methodology;
  if (src.portfolios.mode === "each" && !v.portfolio) throw new ToolProblem(`Each portfolio keeps its own methodology, so name one: ${src.portfolios.items.map((p) => p.name).join(", ")}. All portfolios together carry no verdict.`);
  throw new ToolProblem(`No methodology is confirmed for ${v.label}. Its rules cannot be run until the person confirms one in Invariant.`);
}

const screensFor = (src: McpSource, v: View, book: Book, m: Methodology | null) =>
  deriveScreens({ book, methodology: m, inputs: v.inputs, shown: src.shown, filings: src.filings, decisions: src.decisions, preferences: src.preferences, research: src.research, alerts: src.alerts, statements: src.statements }, src.today);

const sentence = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const header = (src: McpSource, v: View) => `Invariant, ${v.label}, read ${src.today}${v.book ? ` (figures as of ${v.book.asOf})` : ""}. Base currency ${v.ccy}. Read-only; not investment advice.`;

// ---------------------------------------------------------------------------
// The tools

const overview: McpTool = {
  name: "get_overview",
  title: "Overview",
  description: "Start here. Net worth, the largest holdings by weight, the portfolios and how methodologies apply to them, the methodology's checks counted by result, open alerts and the to-do, and any file that could not be read. Every later number should come from a tool.",
  input: z.object({ portfolio: portfolioArg }),
  run: (src, a: { portfolio?: string }) => {
    const v = viewOf(src, a.portfolio);
    const lines = [header(src, v), `Owner: ${src.setup!.ownerName}. Inputs: ${src.setup!.inputs.join(", ") || "none"}.`];
    const ps = src.portfolios.items;
    lines.push(ps.length > 1 ? `Portfolios (${METHODOLOGY_MODE_LABEL[src.portfolios.mode].toLowerCase()}): ${ps.map((p) => `${p.name} [${p.accounts.join(", ") || "no accounts"}]${src.portfolios.mode === "each" ? ` under ${p.methodology?.name ?? "no methodology yet"}` : ""}`).join("; ")}.` : "One portfolio.");
    lines.push(v.methodology ? `Methodology: ${v.methodology.name}. ${v.methodology.summary}` : src.portfolios.mode === "each" && !v.portfolio ? "Each portfolio keeps its own methodology; together they carry no verdict. Name a portfolio to run its rules." : "No methodology confirmed yet.");
    if (!v.book) {
      lines.push("No figures have arrived yet.");
    } else {
      const d = screensFor(src, v, v.book, v.methodology);
      lines.push(`Net worth: ${formatUnit(d.netWorth, "money", v.ccy)} across ${v.book.holdings.length} holdings in ${plural(new Set(v.book.holdings.map((h) => h.account)).size, "account")}.`);
      lines.push(`Largest by weight: ${d.weights.slice(0, 10).map((w) => `${w.symbol} ${formatUnit(w.weight, "pct", v.ccy)}`).join(", ") || "none"}.`);
      if (v.methodology) {
        const count = (s: string) => d.findings.filter((f) => f.status === s).length;
        lines.push(`Checks: ${count("pass")} pass, ${count("near")} near, ${count("fail")} fail, ${count("manual")} the person's to check, ${count("n/a")} not testable yet. run_checks gives each with its section.`);
      }
      const open = alertsView(d.alerts).now;
      lines.push(`Alerts open: ${open.length}${open.length ? ` (${open.slice(0, 3).map((x) => x.title.replace(/\.$/, "")).join("; ")}${open.length > 3 ? "; …" : ""})` : ""}.`);
      if (v.methodology) lines.push(`To-do: ${TODO_GROUPS.filter((g) => g !== "decided").map((g) => `${d.todo.filter((t) => t.group === g).length} ${TODO_GROUP_LABEL[g].toLowerCase()}`).join(", ")}.`);
    }
    if (src.notes.length) lines.push(`Not read or left out: ${src.notes.join(" ")}`);
    return lines.join("\n");
  },
};

const holdings: McpTool = {
  name: "get_holdings",
  title: "Holdings",
  description: "Holdings as ontology fields: symbol, name, asset_class, value, price, quantity and the methodology's class by default. Name other holdings fields to read them (for example revenue_growth_pct, roic_pct, fcf_margin_pct, price_to_own_valuation_pct, option_days_to_expiry, sector, country, account); describe_recipes lists every field. Pass symbols to read some holdings only.",
  input: z.object({ portfolio: portfolioArg, symbols: z.array(z.string().max(40)).max(40).optional(), fields: z.array(z.string().max(40)).max(12).optional() }),
  run: (src, a: { portfolio?: string; symbols?: string[]; fields?: string[] }) => {
    const v = viewOf(src, a.portfolio);
    const book = needBook(v);
    return `${header(src, v)}\n${holdingsText(book, { methodology: v.methodology, today: src.today, ccy: v.ccy }, a.symbols, a.fields)}`;
  },
};

/** The methodology in words, element by element, with the ids the other tools take. */
export function methodologyText(m: Methodology, ccy: string, lessons: readonly Lesson[]): string {
  const approved = lessons.filter((l) => l.status === "approved");
  return [
    `${m.name}. ${m.summary}`,
    "",
    "Rules (id · section · text · severity · what it tests):",
    ...m.rules.map((r) => `- ${r.id} · ${r.section} · ${r.text} · ${r.severity} · ${testedAs(r, m, ccy)}`),
    "",
    "Figures (id · label · recipe · unit):",
    ...m.figures.map((f) => `- ${f.id} · ${f.label} · ${exprWords(f.expr)}${f.by ? ` by ${f.by}` : ""} · ${f.unit}`),
    "",
    m.classes.length ? "Classes (id · label · criteria; a holding is in the first class whose test holds):" : "No classes.",
    ...m.classes.map((k) => `- ${k.id} · ${k.label} · ${criteriaWords(k)}`),
    "",
    approved.length ? "Approved lessons (standing instructions the person approved):" : "Approved lessons: none.",
    ...approved.map((l) => `- ${l.text}`),
  ].join("\n");
}

const methodology: McpTool = {
  name: "get_methodology",
  title: "Methodology",
  description: "The person's own methodology, confirmed by them: every rule with its section and what it tests, every figure as a recipe, every class with its criteria, and the lessons they approved. Cite a rule by its section.",
  input: z.object({ portfolio: portfolioArg }),
  run: (src, a: { portfolio?: string }) => {
    const v = viewOf(src, a.portfolio);
    return `${header(src, v)}\n${methodologyText(needMethodology(src, v), v.ccy, src.lessons)}`;
  },
};

const checks: McpTool = {
  name: "run_checks",
  title: "Methodology checks",
  description: "Run the methodology's rules on the book with its own recipes. Each line: the result (pass, near, fail, the person's to check, not testable yet), the section, the rule's words, the figure tested, the value now and the limit. A rule the app cannot measure is the person's to check, never passing. Pass rule_ids to run some rules only.",
  input: z.object({ portfolio: portfolioArg, rule_ids: z.array(z.string().max(40)).max(40).optional() }),
  run: (src, a: { portfolio?: string; rule_ids?: string[] }) => {
    const v = viewOf(src, a.portfolio);
    const m = needMethodology(src, v);
    return `${header(src, v)}\n${checksText(m, needBook(v), src.today, v.inputs, a.rule_ids)}`;
  },
};

const compute: McpTool = {
  name: "compute_figures",
  title: "Compute figures",
  description: "Compute up to six figures from recipes over the ontology (call describe_recipes first for the shape and the fields). The app validates each recipe and computes it as its screens do; an invalid recipe comes back with its issues to fix, and a figure reading data no input supplies comes back as needing it, never as zero. A methodology figure can be reused as it is from get_methodology.",
  input: z.object({ portfolio: portfolioArg, figures: z.array(z.record(z.string(), z.unknown())).min(1).max(6) }),
  run: (src, a: { portfolio?: string; figures: Record<string, unknown>[] }) => {
    const v = viewOf(src, a.portfolio);
    return `${header(src, v)}\n${tasksText(runTasks(a.figures, { methodology: v.methodology, book: needBook(v), today: src.today, inputs: v.inputs, ccy: v.ccy }))}`;
  },
};

const recipes: McpTool = {
  name: "describe_recipes",
  title: "Recipe language",
  description: "How to write a recipe for compute_figures, and the ontology: every object, field, measure, grouping and window the app can compute.",
  input: z.object({}),
  run: () => [...RECIPE_SHAPE, "", "The ontology:", describeOntology()].join("\n"),
};

const alerts: McpTool = {
  name: "get_alerts",
  title: "Alerts",
  description: "The alerts open now (breaches, watches, clocks and dates within a week, met triggers and kill signals, new trades without a reason, statements waiting) and those cleared lately, each with when it fired.",
  input: z.object({ portfolio: portfolioArg }),
  run: (src, a: { portfolio?: string }) => {
    const v = viewOf(src, a.portfolio);
    const view = alertsView(screensFor(src, v, needBook(v), v.methodology).alerts);
    const row = (x: { title: string; detail: string; firedAt: string; clearedAt: string | null }) => `- ${sentence(x.title)} ${x.detail} (fired ${x.firedAt.slice(0, 10)}${x.clearedAt ? `, cleared ${x.clearedAt.slice(0, 10)}` : ""})`;
    return [header(src, v), view.now.length ? "Open now:" : "Nothing open now.", ...view.now.map(row), ...(view.earlier.length ? ["Cleared lately:", ...view.earlier.slice(0, 15).map(row)] : [])].join("\n");
  },
};

const todo: McpTool = {
  name: "get_todo",
  title: "Methodology to-do",
  description: "What the methodology's rules call for now, read against the Decision Log: each item with its group (do now, due by a date, owed with no date, decided), the section that asks for it, why, and what done looks like.",
  input: z.object({ portfolio: portfolioArg }),
  run: (src, a: { portfolio?: string }) => {
    const v = viewOf(src, a.portfolio);
    const m = needMethodology(src, v);
    const items = screensFor(src, v, needBook(v), m).todo;
    if (!items.length) return `${header(src, v)}\nNothing on the to-do.`;
    return [
      header(src, v),
      ...TODO_GROUPS.flatMap((g) => {
        const these = items.filter((t) => t.group === g);
        return these.length ? [`${TODO_GROUP_LABEL[g]}:`, ...these.map((t) => `- ${t.title}${t.section ? ` (${t.section})` : ""}${t.date ? `, by ${t.date}` : ""}. ${t.why} Done when: ${t.done}${t.decision ? ` Decided ${t.decision.date}: ${t.decision.title}.` : ""}`)] : [];
      }),
    ].join("\n");
  },
};

const decisions: McpTool = {
  name: "get_decision_log",
  title: "Decision Log",
  description: "The person's Decision Log, newest first: trades with their reasons, votes, methodology changes and notes. Pass a symbol for one holding's entries.",
  input: z.object({ symbol: z.string().max(40).optional(), limit: z.number().int().min(1).max(100).optional() }),
  run: (src, a: { symbol?: string; limit?: number }) => {
    const want = a.symbol?.toUpperCase();
    const rows = sortedDecisions(src.decisions).filter((d) => !want || d.symbol?.toUpperCase() === want).slice(0, a.limit ?? 30);
    if (!rows.length) return want ? `No Decision Log entry for ${want}.` : "The Decision Log is empty.";
    return rows.map((d) => `- ${d.date} · ${d.kind}${d.symbol ? ` · ${d.symbol}` : ""} · ${d.title}${d.action ? ` · ${outcomeWords(d.action)}` : ""}${d.text ? `\n  ${d.text.replace(/\s+/g, " ").slice(0, 1200)}` : ""}`).join("\n");
  },
};

const review: McpTool = {
  name: "get_latest_review",
  title: "Latest review",
  description: "The last review the app kept (weekly, monthly or the daily report): the verdict with its two pillars, the returns as context, and every section line by line.",
  input: z.object({ kind: z.enum(["weekly", "monthly", "today"]).optional() }),
  run: (src, a: { kind?: "weekly" | "monthly" | "today" }) => {
    const r = (src.reports?.reports ?? []).find((x) => !a.kind || x.kind === a.kind);
    if (!r) return src.demo ? "The demo keeps no reviews." : `No ${a.kind ?? ""} review has been kept yet.`.replace("  ", " ");
    return [
      `${r.title} (${r.kind}${r.period ? `, ${r.period.label}` : ""}; figures as of ${r.asOf}${r.sentAt ? `; sent ${r.sentAt.slice(0, 10)}` : ""})`,
      r.shapedBy,
      r.summary,
      ...(r.verdict ? [`Verdict: ${r.verdict.label}. ${r.verdict.reason}`] : []),
      ...r.sections.flatMap((s) => [``, `${s.heading}`, ...s.lines.map((l) => `- ${l.label}${l.value ? `: ${l.value}` : ""}${l.detail ? ` (${l.detail})` : ""}`), ...(s.footer ? [s.footer] : [])]),
      ...(r.prose ? ["", "Commentary:", r.prose] : []),
    ].join("\n");
  },
};

const search: McpTool = {
  name: "search_vault",
  title: "Search the vault",
  description: "Search what the person's vault already knows: the methodology element by element, research studies by section, past reviews, records about holdings and approved lessons. Returns the best matches with their text; cite them by title.",
  input: z.object({ query: z.string().min(1).max(300), k: z.number().int().min(1).max(12).optional() }),
  run: (src, a: { query: string; k?: number }) => {
    const docs = corpusOf({ methodology: src.setup?.methodology ?? null, research: src.research, reports: src.reports, records: src.records, book: src.book, lessons: src.lessons, ccy: src.setup?.baseCurrency ?? "USD" });
    return hitsText(searchCorpus(docs, a.query, a.k ?? 6));
  },
};

const proposeNewsletters: McpTool = {
  name: "propose_newsletter_senders",
  title: "Propose newsletter senders",
  description:
    "Hands Invariant the newsletters found in the person's mail (through their Gmail connector): each sender's address, the newsletter's name and how often it came. They land on the Newsletters card on Setup as proposals, where the person keeps or removes each one; the kept ones make the Gmail filter that forwards them. Nothing takes effect here, and nothing is read from or changed in their mail.",
  input: z.object({ senders: z.array(proposedSenderSchema).min(1).max(MAX_FILTER_SENDERS).describe("Every recurring investing newsletter found, one entry each.") }),
  writes: true,
  run: async (src, a: { senders: ProposedSender[] }) => {
    if (!src.propose) throw new ToolProblem("The demo keeps nothing, so no sender can be proposed here. In the person's own Invariant the proposals land on the Newsletters card on Setup.");
    const r = await src.propose(a.senders);
    const waiting = r.file.senders.filter((x: NewsletterSendersFile["senders"][number]) => x.status === "proposed").length;
    const lines = [
      `${r.added} new sender${r.added === 1 ? "" : "s"} proposed${r.keptBefore ? `, ${r.keptBefore} already kept` : ""}${r.removedBefore ? `, ${r.removedBefore} the person removed before and stay removed` : ""}.`,
      waiting ? `${waiting} proposal${waiting === 1 ? "" : "s"} now wait on the Newsletters card on Setup in Invariant: the person keeps or removes each one there, then Open in Gmail opens Gmail's filter box with the kept senders filled in, and they tick Forward it to and click Create filter.` : "Nothing waits: every sender was decided before.",
      src.newslettersAddress ? `The filter forwards to ${src.newslettersAddress}.` : "Invariant has no newsletters address for this account yet; the person who runs it sets up the inbox first.",
      "Tell the person to open Newsletters in Invariant. Do not create, change or send anything in Gmail.",
    ];
    return lines.join("\n");
  },
};

// --- Theses -----------------------------------------------------------------

const pillarLines = (pillars: ReturnType<typeof pillarReadings>) => pillars.map((p) => `  - ${p.pillar.name}${p.pillar.text ? `: ${p.pillar.text}` : ""}${p.pillar.test ? ` [${p.pillar.test.field} ${p.pillar.test.is === "gte" ? ">=" : "<="} ${p.pillar.test.value}; ${p.tag}${p.words ? `, ${p.words}` : ""}]` : " [no test; the person's to judge]"}`);
const evidenceLines = (e: Thesis["evidence"]) => (e.length ? [`  Added to the thesis (${e.length}, newest last):`, ...e.slice(-8).map((x) => `  - ${x.at} ${x.source} (${x.kind}, ${x.via === "claude" ? "added by Claude" : "the person's note"}): ${x.summary}${x.changes ? ` Changed: ${x.changes}` : ""}`)] : []);

const figureLines = (f: Thesis["figures"]) => (f.length ? [`  Charts and pictures (${f.length}):`, ...f.map((x) => `  - "${x.title}" (id ${x.id}, ${x.chart ? `${x.chart.type} chart of ${x.chart.series.map((s) => s.name).join(", ")} over ${x.chart.labels.length} labels${x.chart.unit ? `, in ${x.chart.unit}` : ""}` : "picture"}, ${x.via === "claude" ? "added by Claude" : x.via === "hunter" ? "found by the Thesis Hunter" : "the person's"}, ${x.at}): ${x.source}${x.caption ? `. ${x.caption}` : ""}`)] : []);

function stockThesisText(src: McpSource, symbol: string, t: Thesis | null, full: boolean): string[] {
  const h = src.book?.holdings.find((x) => x.symbol.toUpperCase() === symbol) ?? null;
  const head = `${symbol}${h?.name && h.name !== symbol ? ` (${h.name})` : ""}, ${h ? "held" : src.watchlist.some((w) => w.toUpperCase() === symbol) ? "on the watchlist" : "not held or watched"}`;
  if (!t) return [`- ${head}: no thesis yet.`];
  if (!full) return [`- ${head}: ${t.text.trim() ? `thesis updated ${t.updatedAt.slice(0, 10)}` : "no text yet"}, ${t.pillars.length} pillar${t.pillars.length === 1 ? "" : "s"}, ${t.watch.length} to watch, ${t.evidence.length} added${t.pathway ? ", a pathway" : ""}.`];
  const readings = { price: h?.price ?? null, ...(h?.fundamentals ?? {}) };
  return [
    `## ${head}`,
    t.text.trim() ? t.text.trim() : "(no text yet)",
    ...(t.pathway ? [`  Pathway: ${t.pathway}`] : []),
    ...(t.pillars.length ? ["  Pillars, read today:", ...pillarLines(pillarReadings(t.pillars, readings))] : ["  No pillars."]),
    ...(t.watch.length ? ["  Watch:", ...t.watch.map((w) => `  - ${w}`)] : []),
    ...recordLines(src, symbol, readings),
    ...(t.valuation ? [`  Valuation calculator: ${t.valuation.method}${t.valuation.stage ? `, stage ${t.valuation.stage} (the person's)` : ""}, as of ${t.valuation.asOf}${t.valuation.note ? `; ${t.valuation.note}` : ""}.`] : ["  Valuation calculator: not filled in (write_thesis valuation)."]),
    ...figureLines(t.figures),
    ...evidenceLines(t.evidence),
    `  Updated ${t.updatedAt.slice(0, 10)}.`,
  ];
}

/** The record's part of a stock's folder (Hamza, 19 Oct 2026): kill signals and triggers read today, price levels, the own valuation. */
function recordLines(src: McpSource, symbol: string, readings: Record<string, number | null | undefined>): string[] {
  const key = Object.keys(src.records.bySymbol).find((k) => k.toUpperCase() === symbol);
  const r = key ? src.records.bySymbol[key] : null;
  const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const out: string[] = [];
  if (r?.triggers.length) {
    out.push("  Kill signals and triggers, read today:");
    for (const t of r.triggers) {
      const v = readings[t.field] ?? null;
      const met = v === null ? "unread" : (t.is === "lte" ? v <= t.value : v >= t.value) ? "MET" : "not met";
      out.push(`  - ${t.kind === "kill" ? "Kill signal" : "Trigger"}: ${t.field} ${t.is === "lte" ? "at or below" : "at or above"} ${num(t.value)} (id ${t.id}; today ${v === null ? "unread" : num(v)}: ${met})${t.note ? `; ${t.note}` : ""}`);
    }
  } else out.push("  No kill signals or triggers on the record (write_thesis triggers).");
  if (r?.levels && (r.levels.below !== null || r.levels.above !== null)) out.push(`  Price levels: ${[r.levels.below !== null ? `at or below ${num(r.levels.below)}` : null, r.levels.above !== null ? `at or above ${num(r.levels.above)}` : null].filter(Boolean).join(", ")}.`);
  out.push(r?.ownValuation ? `  Own valuation per share: bear ${r.ownValuation.low === null ? "n/a" : num(r.ownValuation.low)}, base ${num(r.ownValuation.base)}, bull ${r.ownValuation.high === null ? "n/a" : num(r.ownValuation.high)}${r.ownValuation.basis ? ` (${r.ownValuation.basis})` : ""}, as of ${r.ownValuation.asOf}.` : "  No own valuation yet (write_thesis valuation).");
  return out;
}

function marketThesisText(src: McpSource, m: MarketThesis, full: boolean): string[] {
  if (!full) return [`- "${m.title}" (id ${m.id}): ${m.text.trim() ? `updated ${m.updatedAt.slice(0, 10)}` : "no text yet"}, ${m.pillars.length} pillar${m.pillars.length === 1 ? "" : "s"}, ${m.watch.length} to watch, ${m.evidence.length} added.`];
  const readings = marketReadings(src.book?.markets?.rows ?? []);
  return [`## "${m.title}" (id ${m.id})`, m.text.trim() ? m.text.trim() : "(no text yet)", ...(m.pillars.length ? ["  Pillars, read on today's indicators:", ...pillarLines(pillarReadings(m.pillars, readings))] : ["  No pillars."]), ...(m.watch.length ? ["  Watch:", ...m.watch.map((w) => `  - ${w}`)] : []), ...figureLines(m.figures), ...evidenceLines(m.evidence), `  Updated ${m.updatedAt.slice(0, 10)}.`];
}

const theses: McpTool = {
  name: "get_theses",
  title: "Theses",
  description:
    "The person's theses as kept on the Theses screen: the stock theses (one per holding and per watchlist symbol: the text in their words, the pillars each tested on the price or a fundamental field and read today, the pathway, the watch items, what was added to it) and the market theses (what they believe about rates, a cycle or a theme, pillars read on the market indicators). With no argument, one line per thesis; name a symbol or a market thesis (id or title) for the whole of it, or pass full for all of them.",
  input: z.object({ symbol: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/).optional().describe("One stock thesis, by symbol."), thesis: z.string().min(1).max(120).optional().describe("One market thesis, by id or title."), full: z.boolean().optional().describe("Every thesis in full.") }),
  run: (src, a: { symbol?: string; thesis?: string; full?: boolean }) => {
    const file = src.theses;
    if (!file && !src.demo) throw new ToolProblem(`The theses could not be read from the person's vault just now. ${src.notes.find((n) => n.startsWith("The theses were not read")) ?? ""} Try again in a moment; nothing was changed.`.replace(/\s+/g, " ").trim());
    const subjects = thesesSubjects(src.book?.holdings ?? [], file, src.watchlist);
    const lines: string[] = [`Theses as of ${src.today}${file?.updated ? `, file updated ${file.updated.slice(0, 10)}` : ""}. Read-only here; write_thesis changes them, and the person reviews each on the Theses screen.`];
    if (a.symbol) {
      const symbol = a.symbol.toUpperCase();
      return [...lines, ...stockThesisText(src, symbol, thesisFor(file, symbol), true)].join("\n");
    }
    if (a.thesis) {
      const m = marketThesisFor(file, a.thesis);
      if (!m) throw new ToolProblem(`No market thesis reads as "${a.thesis}". ${file?.markets.length ? `On file: ${file.markets.map((x) => `"${x.title}" (id ${x.id})`).join(", ")}.` : "None is on file yet; write_thesis with kind market starts one."}`);
      return [...lines, ...marketThesisText(src, m, true)].join("\n");
    }
    const full = !!a.full;
    const markets = file?.markets ?? [];
    lines.push(`# Market theses (${markets.length})`, ...(markets.length ? markets.flatMap((m) => marketThesisText(src, m, full)) : ["None yet."]));
    const held = subjects.filter((s) => s.held);
    const watched = subjects.filter((s) => !s.held);
    lines.push(`# Stock theses: holdings (${held.length})`, ...(held.length ? held.flatMap((s) => stockThesisText(src, s.symbol, thesisFor(file, s.symbol), full)) : ["No listed equity held."]));
    if (watched.length) lines.push(`# Stock theses: watchlist and others (${watched.length})`, ...watched.flatMap((s) => stockThesisText(src, s.symbol, thesisFor(file, s.symbol), full)));
    return lines.join("\n");
  },
};

const resultsTool: McpTool = {
  name: "get_results_to_read",
  title: "Results to read",
  description: `The results the person's followed companies (holdings, watchlist, companies added on Earnings) released in the last ${RESULTS_READ_DAYS} days, newest first: the day, the quarter, whether the filed figures are in, and what was already added to each thesis since (its source and day). A company whose thesis has nothing since its results that carries the call (its guidance, the analysts' questions, the beats) is the one to read: read its call and documents in a source the person connected you to, read its thesis with get_theses, then add what bears on it with write_thesis, in your own words, with the call on the evidence entry. The first line is the schedule a routine running this should keep, from the results calendar: every 6 hours around a company's results until it is read, every day in the week before, every week otherwise.`,
  input: z.object({}),
  run: (src) => {
    if (!src.earnings) return `Schedule: every day (the post-earnings reports could not be read just now).\nThe results to read are not known. Try again later; nothing was changed.`;
    const rows = resultsToRead(src.earnings, src.theses, src.today);
    const plan = routineSchedule(rows, src.calendar, src.theses, src.today);
    const head = `Schedule: ${plan.every} (${plan.why}).`;
    if (!rows.length) return `${head}\nNothing to read: no followed company has released results in the last ${RESULTS_READ_DAYS} days (as of ${src.today}).`;
    const due = rows.filter((r) => !r.read);
    const line = (r: (typeof rows)[number]) =>
      `- ${r.symbol}${r.name ? ` (${r.name})` : ""}: results ${r.date}${r.quarter ? `, ${r.quarter}` : ""}, ${r.figuresIn ? "filed figures in" : "filed figures not yet in"}. ${r.added.length ? `Added to its thesis since: ${r.added.map((e) => `${e.source} (${e.at})`).join("; ")}.${r.read ? "" : " None of it carries the call (guidance, the analysts' questions, the beats): read the call and add an entry with it."}` : "Nothing added to its thesis since."}`;
    if (!due.length) return [`${head}`, `Nothing to read: each of the ${rows.length} results of the last ${RESULTS_READ_DAYS} days already has its call added to its thesis (as of ${src.today}).`, "Already read:", ...rows.map(line)].join("\n");
    return [head, `Results of the last ${RESULTS_READ_DAYS} days, as of ${src.today}: ${rows.length}, of which ${due.length} with the call not yet added to the thesis.`, "To read:", ...due.map(line), ...(rows.length > due.length ? ["Already read:", ...rows.filter((r) => r.read).map(line)] : [])].join("\n");
  },
};

const writeThesisTool: McpTool = {
  name: "write_thesis",
  title: "Write a thesis",
  description:
    "Proposes a change to one of the person's theses, kept in their own vault until they approve it, part by part, on the Theses screen (an evidence entry alone is added at once, marked as added by Claude): a stock thesis by symbol (a holding, a watchlist symbol, or a new symbol, which joins the watchlist) or a market thesis by id or title (a title not on file starts one). Each field given replaces that part of the thesis (text, pathway, pillars, watch); an evidence entry is added to what was folded in, marked as added by Claude. Charts and pictures (figures) are added to either kind, each with its source: a chart the app draws itself from the figures given (a line over dates or bars over labels, up to four series in one unit), or a picture from a public https address; one whose title is already on the thesis replaces it, and removeFigures takes them off by title or id. A stock write may also fill the record's kill signals and triggers (triggers), the price levels to hear of (levels) and the Valuation calculator (valuation: stage, method, multiples, forward figures, TAM, or bear, base and bull per share as cases), whose chosen method's cases become the person's own valuation. A market write may name its basket: the listed companies that express it, measured together against SPY from the day it was written. Read the thesis with get_theses first and keep the person's words where they still hold. A pillar's or trigger's test names a figure the app reads (describe_recipes lists the fields and the market indicators). Nothing else moves: no DCF, class, alert or order.",
  input: thesisWriteInputSchema,
  writes: true,
  run: async (src, raw: z.infer<typeof thesisWriteInputSchema>) => {
    const parsed = thesisWriteSchema.safeParse(raw);
    if (!parsed.success) throw new ToolProblem(`The write does not fit: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}. kind stock needs a symbol; kind market needs the thesis's id or title.`);
    const a: ThesisWrite = parsed.data;
    if (!src.writeThesis) throw new ToolProblem("The demo's theses are fictional and read-only, so nothing can be written here. In the person's own Invariant the thesis lands on the Theses screen for them to review.");
    try {
      const r = await src.writeThesis(a);
      const where = a.kind === "stock" ? `the ${r.subject} thesis` : `the market thesis "${r.subject}"`;
      if (r.pending) return [`Proposed to ${r.isNew ? `start ${where}` : where}: ${r.parts.join(", ")}.${r.replaced ? " It replaces the proposal you made to it before." : ""}`, "Nothing has changed yet. It waits on the Theses screen in Invariant, where the person keeps the parts they want, amends the words if they like, or turns it down. Tell them what you proposed and where to approve it."].join("\n");
      return [`${r.created ? "Started" : "Changed"} ${where}: ${r.changed.join(", ")}.`, "It is on the Theses screen in Invariant, marked as added by Claude. Tell them what you added. Nothing else was changed."].join("\n");
    } catch (e) {
      if (e instanceof ThesisWriteProblem) throw new ToolProblem(e.message);
      throw e;
    }
  },
};

// --- Write-back (Hamza, 9 Nov 2026: the beta's work on the person's own Claude comes back to the app) ---

const recordDecisionTool: McpTool = {
  name: "record_decision",
  title: "Record a decision",
  description:
    "Files an entry in the person's Decision Log, marked as written by Claude: a trade and why, a vote on a class or a rule, a change to the methodology, or a note. Use it when the person has told you what they decided and why, in their words; never decide for them, and never file a trade they have not made. It changes no order, holding, class or rule; the entry is theirs to edit or remove on the Decision Log screen, and a new trade's question on Notifications is answered by an entry for that symbol.",
  input: decisionWriteSchema,
  writes: true,
  run: async (src, a: DecisionWrite) => {
    if (!src.recordDecision) throw new ToolProblem("The demo keeps nothing, so no entry can be filed here. In the person's own Invariant it lands on the Decision Log screen.");
    const d = await src.recordDecision(a);
    return [`Filed in the Decision Log: ${d.date} · ${d.kind}${d.symbol ? ` · ${d.symbol}` : ""} · ${d.title}.`, "It is on the Decision Log screen in Invariant, marked as written by Claude, for the person to edit or remove. Nothing else was changed."].join("\n");
  },
};

const findingsTool: McpTool = {
  name: "get_findings",
  title: "Agents' findings",
  description: "What the app's agents found and kept: the Research Agent's findings on each company's news (today's and earlier ones) and the Thesis Hunter's finds on each thesis, each with its id, its sources and the person's rating if they gave one. Pass a symbol for one company. Rate one with rate_finding when the person tells you what they think of it.",
  input: z.object({ symbol: z.string().max(20).optional(), limit: z.number().int().min(1).max(60).optional() }),
  run: (src, a: { symbol?: string; limit?: number }) => {
    const want = a.symbol?.toUpperCase();
    const rated = (agent: string, id: string) => {
      const r = ratingFor(src.feedback, agent, id);
      return r ? ` Rated ${r.verdict === "useful" ? "useful" : `not useful${r.reasons.length ? ` (${r.reasons.map((x) => WRONG_LABEL[x]).join(", ")})` : ""}`}.` : " Not rated.";
    };
    const news = Object.entries(src.researchCache?.companies ?? {})
      .filter(([s]) => !want || s === want)
      .flatMap(([, c]) => [...c.findings, ...c.earlier])
      .sort((x, y) => y.day.localeCompare(x.day))
      .map((f) => ({ day: f.day, line: `- [company_news ${f.id}] ${f.symbol}, ${f.day}: ${f.headline}. ${f.lines} (${f.stance}${f.bearsOn ? `, bears on ${f.bearsOn}` : ""}; ${f.sources.map((s) => s.source).join(", ")}).${rated("company_news", f.id)}` }));
    const finds = Object.entries(src.hunter?.subjects ?? {})
      .filter(([k]) => !want || k === `stock:${want}`)
      .flatMap(([k, h]) => h.finds.map((f) => ({ day: f.found, line: `- [thesis_hunter ${f.id}] ${k.replace(/^stock:/, "").replace(/^market:/, "market thesis ")}, ${f.found}: ${f.title}. ${f.summary} (${f.stance}${f.pillar ? `, pillar ${f.pillar}` : ""}; ${f.source}).${rated("thesis_hunter", f.id)}` })));
    const rows = [...news, ...finds].sort((x, y) => y.day.localeCompare(x.day)).slice(0, a.limit ?? 30);
    if (!rows.length) return src.demo ? "The demo keeps no findings." : `No finding is kept${want ? ` for ${want}` : ""} yet.`;
    return [`Findings, newest first (agent and id in brackets, for rate_finding):`, ...rows.map((r) => r.line)].join("\n");
  },
};

const rateFindingTool: McpTool = {
  name: "rate_finding",
  title: "Rate a finding",
  description: `Keeps the person's rating of one finding (get_findings lists them with their agent and id): useful, or not useful with what was wrong (${WRONG_REASONS.map((r) => `${r}: ${WRONG_LABEL[r]}`).join("; ")}) and a line in their words. Only what the person said; never your own judgement. A rating teaches the agent once the person approves a lesson from it on the Agents screen.`,
  input: z.object({ agent: z.enum(["company_news", "thesis_hunter"]), id: z.string().min(1).max(80), verdict: z.enum(VERDICTS), reasons: z.array(z.enum(WRONG_REASONS)).max(WRONG_REASONS.length).optional(), note: z.string().max(500).optional() }),
  writes: true,
  run: async (src, a: { agent: "company_news" | "thesis_hunter"; id: string; verdict: Verdict; reasons?: WrongReason[]; note?: string }) => {
    if (!src.rateFinding) throw new ToolProblem("The demo keeps nothing, so no rating can be kept here.");
    const found =
      a.agent === "company_news"
        ? Object.values(src.researchCache?.companies ?? {}).flatMap((c) => [...c.findings, ...c.earlier]).map((f) => ({ id: f.id, subject: f.symbol, title: f.headline })).find((f) => f.id === a.id)
        : Object.entries(src.hunter?.subjects ?? {}).flatMap(([k, h]) => h.finds.map((f) => ({ id: f.id, subject: k, title: f.title }))).find((f) => f.id === a.id);
    if (!found) throw new ToolProblem(`There is no ${a.agent} finding ${a.id}. get_findings lists them.`);
    const reasons = a.verdict === "useful" ? [] : (a.reasons ?? []);
    if (a.verdict === "not_useful" && !reasons.length && !a.note?.trim()) throw new ToolProblem("Say what was wrong (reasons) or give the person's line (note), so the agent can learn from it.");
    await src.rateFinding({ agent: a.agent, target: found.id, subject: found.subject, title: found.title, verdict: a.verdict, reasons, note: a.note?.trim() || null });
    return `Kept: "${found.title}" rated ${a.verdict === "useful" ? "useful" : "not useful"}. It is on the Agents screen in Invariant; a lesson from it rides the agent's next runs only once the person approves it.`;
  },
};

const studiesToWriteTool: McpTool = {
  name: "get_studies_to_write",
  title: "Studies to write",
  description: "The studies the person asked for in Invariant that still have sections to write, each with the brief the app's own writer would get: the template's sections and what each must establish, the methodology's checks as the app ran them, and every figure from the filings you may use. A queued study has its figures read and its checks run first, and kept for the person on the Research screen. Write the sections with write_study.",
  input: z.object({ id: z.string().regex(/^[a-f0-9]{12}$/).optional().describe("One study's id; leave it out for the ones waiting.") }),
  writes: true,
  run: async (src, a: { id?: string }) => {
    if (!src.studiesToWrite) throw new ToolProblem(src.demo ? "The demo writes no study." : "No methodology is confirmed yet, so no study can be written.");
    const due = await src.studiesToWrite(a.id ?? null);
    if (!due.length) return a.id ? `Study ${a.id} has nothing left to write.` : "No study is waiting to be written. The person queues one on the Research screen in Invariant.";
    return due.map(({ study, brief }) => [`# Study ${study.id}: ${study.subject}${study.question ? `. ${study.question}` : ""}`, `Sections to write: ${study.pending.join(", ")}.`, "", brief].join("\n")).join("\n\n---\n\n");
  },
};

const writeStudyTool: McpTool = {
  name: "write_study",
  title: "Write a study",
  description: "Keeps sections of a study get_studies_to_write gave you, in Markdown, one entry per section id. A section is kept only when every figure in it is printed in that study's brief, or worked out on the same line from figures that are; any other is sent back with the figures that were not found, to write again. The study is done once every section is in; the person reads it on the Research screen and downloads it as a PDF.",
  input: z.object({ id: z.string().regex(/^[a-f0-9]{12}$/), sections: z.array(z.object({ id: z.string().min(1).max(40), markdown: z.string().min(1).max(20000) })).min(1).max(30) }),
  writes: true,
  run: async (src, a: { id: string; sections: { id: string; markdown: string }[] }) => {
    if (!src.writeStudy) throw new ToolProblem(src.demo ? "The demo writes no study." : "No methodology is confirmed yet, so no study can be written.");
    const { study, check } = await src.writeStudy(a.id, a.sections);
    const kept = Object.keys(check.kept);
    return [
      kept.length ? `Kept ${kept.length} section${kept.length === 1 ? "" : "s"}: ${kept.join(", ")}${check.clipped.length ? ` (${check.clipped.join(", ")} cut at the study's length)` : ""}.` : "No section was kept.",
      ...check.refused.map((r) => `Not kept: ${r.id} ("${r.title}") states ${r.figures.join(", ")}, which the brief does not print. Write it again with the brief's figures, or show the working on the line.`),
      ...(check.unknown.length ? [`Not sections still to write: ${check.unknown.join(", ")}.`] : []),
      study.pending.length ? `Still to write: ${study.pending.join(", ")}.` : "The study is done; it is on the Research screen in Invariant.",
    ].join("\n");
  },
};

const priceChecksTool: McpTool = {
  name: "report_price_checks",
  title: "Report price checks",
  description:
    "Tells Invariant which of the person's own price levels and price triggers are met now, as you read the prices from their broker through your own connector. Send a verdict for each level or trigger you checked (met or not); never send a price, which Invariant does not keep. get_theses lists each holding's and watchlist symbol's levels (below, above) and its triggers with their ids. A met one becomes an alert on Notifications, emailed with the next check; one you report not met clears. Levels and triggers you did not check stay as they were.",
  input: z.object({ checks: z.array(z.object({ symbol: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/), level: z.enum(["below", "above"]).optional().describe("The price level checked."), trigger: z.string().max(20).optional().describe("The id of a price trigger or kill signal checked."), met: z.boolean() })).min(1).max(120) }),
  writes: true,
  run: async (src, a: { checks: BrokerCheck[] }) => {
    if (!src.reportChecks) throw new ToolProblem("The demo keeps no alerts, so nothing can be reported here.");
    const r = await src.reportChecks(a.checks);
    return [`Kept ${a.checks.length - r.unknown.length} verdict${a.checks.length - r.unknown.length === 1 ? "" : "s"}: ${r.fired} new alert${r.fired === 1 ? "" : "s"}, ${r.open} met in all.`, ...(r.unknown.length ? [`Not on the person's records, so not kept: ${r.unknown.join("; ")}.`] : [])].join("\n");
  },
};

const edgar: McpTool = {
  name: "get_edgar_facts",
  title: "SEC filings",
  description: "A company's SEC filings (XBRL company facts: five calendar years and the trailing twelve months of revenue, income, cash flow, shares, dividends and balances) as a table. US-listed companies only; a foreign listing or a fund has none.",
  input: z.object({ ticker: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/) }),
  run: (src, a: { ticker: string }) => (src.edgar ? src.edgar(a.ticker.toUpperCase()) : "Filings are not read here (the demo reads none)."),
};

export const MCP_TOOLS: readonly McpTool[] = [overview, holdings, methodology, checks, compute, recipes, alerts, todo, decisions, review, search, theses, resultsTool, writeThesisTool, edgar, proposeNewsletters, recordDecisionTool, findingsTool, rateFindingTool, studiesToWriteTool, writeStudyTool, priceChecksTool];

/** What the server says about itself on initialize: how to use the tools, in the app's own rules. */
export const MCP_INSTRUCTIONS = [
  "Invariant: the person's own portfolio, read-only, judged by the methodology they confirmed.",
  "Start with get_overview. Every number in an answer must come from a tool; never estimate, recall or do arithmetic the tools did not return (compute_figures computes any figure the ontology can express).",
  "Verdicts come from run_checks and cite the rule's section (3.1, D.1(c)) in the methodology's own words. A rule the app cannot measure is the person's to check, never passing. A figure that needs data says which input would supply it; never fill the gap.",
  "With several portfolios, name one with the portfolio argument to read it alone; under one methodology per portfolio, all together carry no verdict.",
  "Nothing here places, changes or cancels an order, or touches a broker. A few tools write to the person's own vault, each shown to them: propose_newsletter_senders (proposals on the Newsletters card; the filter is made by them in Gmail), write_thesis (a proposal they approve on the Theses screen, after get_theses has read the thesis; an evidence entry alone is added at once), record_decision (an entry in their Decision Log, in their words, only for what they decided), rate_finding (their rating of an agent's finding, only as they gave it), write_study (a study's sections, every figure from its brief) and report_price_checks (which of their own levels and triggers are met, from their broker's prices, never the prices). Write plainly; no advice to buy or sell; the person decides.",
].join("\n");
