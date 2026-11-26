import "server-only";

import { addDays } from "date-fns";

import { providerFor } from "@/lib/hosted-model";
import { agentById, agentFeedbackSchema, costOf, EMPTY_FEEDBACK, lessonFromRatings, lessonRequestBody, lessonsFor, mayRun, parseLesson, tierAbove, TIER_MODEL, unlearned, usageOf, withLesson, type AgentFeedback } from "@/lib/agents";
import { filingsOfWeek, reportsOfEarnings } from "@/lib/company-news-run";
import { earningsFileSchema, earningsSubjects, type EarningsFile } from "@/lib/earnings";
import { bookSchema } from "@/lib/holdings";
import { loadCompanyHeadlines } from "@/lib/markets-feed";
import { hostsOnDemand } from "@/lib/deployment";
import { callModel } from "@/lib/methodology-draft";
import { MODELS } from "@/lib/models";
import { modelFor, providerCannot, withAdvisor, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { newslettersFileSchema, type NewslettersFile } from "@/lib/newsletters";
import { podcastsFileSchema, type PodcastsFile } from "@/lib/podcasts";
import { EMPTY_RECORDS, preferencesSchema, recordsSchema, type Preferences, type Records } from "@/lib/preferences";
import { classWords } from "@/lib/recipes";
import { companiesDue, EMPTY_RESEARCH_CACHE, HOSTED_JUDGE_MODEL, JUDGE_ADVICE, JUDGE_MODEL, knownFor, lensHasHardCalls, PRICED_MODEL, parsePricedIn, pricedInRequestBody, researchCacheSchema, runNewsResearch, runRecord, SIFT_MODEL, withPricedIn, withResearch, withRun, type Lens, type PricedFacts, type PricedIn, type ResearchCache, type ResearchItem, type ResearchResult } from "@/lib/research-agent";
import { setupSchema, type Setup } from "@/lib/setup";
import { SyncError } from "@/lib/sync-error";
import { addedSince, thesesFileSchema, thesisFor, type ThesesFile } from "@/lib/theses";
import { materialFor, type HuntSubject } from "@/lib/thesis-hunter";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/**
 * Runs the Research Agent (lib/research-agent.ts) for the person, on their
 * own model (Hamza, 23 Oct 2026, after the agents doc). Company news is its
 * first task: each listed holding and watchlist company once a day, the
 * week's headlines, the SEC's filings of the week, the app's own results
 * reports and the person's newsletters and podcasts that name it gathered
 * without a model, then filtered, sifted against the person's lens and
 * judged into findings, each kept in the vault's `research_cache` with the
 * items left out and why. The priced-in question runs on request. The agent
 * stops at the person's weekly ceiling and when they switch it off, and says
 * so; a model's answer that does not hold keeps the last good findings and a
 * sentence. Nothing of the book goes in a log line; a symbol never does.
 */

export type ResearchRun = { read: number; found: number; failed: number; sentence: string; problem: string | null };

/** The companies read when the app is opened; the morning refresh takes the rest. */
export const RESEARCH_ON_OPEN = 3;
/** The companies read by the morning refresh at most. */
export const RESEARCH_PER_MORNING = 15;
/** How many companies are read side by side. */
const AT_ONCE = 4;

const KIND_WORDS: Record<string, string> = { trigger: "Trigger", kill: "Kill signal" };

/** The person's lens on each company: the thesis, its pillars and watch items, the record's signals, the methodology's classes and rules. */
export function lensesFor(subjects: readonly { symbol: string; name: string | null; held: boolean }[], theses: ThesesFile | null, records: Records, setup: Setup | null): Lens[] {
  const m = setup?.methodology ?? null;
  return subjects.map((s) => {
    const sym = s.symbol.toUpperCase();
    const t = theses?.bySymbol[sym] ?? null;
    const r = records.bySymbol[sym] ?? records.bySymbol[s.symbol] ?? null;
    return {
      symbol: sym,
      name: s.name,
      held: s.held,
      thesis: t?.text.trim() ? t.text : null,
      pathway: t?.pathway ?? null,
      pillars: (t?.pillars ?? []).map((p) => ({ name: p.name, text: p.text })),
      signals: (r?.triggers ?? []).map((x) => `${KIND_WORDS[x.kind] ?? "Signal"} ${x.field} ${x.is === "lte" ? "at or below" : "at or above"} ${x.value}${x.note ? ` (${x.note})` : ""}`),
      watch: t?.watch ?? [],
      methodology: m ? `${m.name}. ${m.summary}`.trim() : null,
      classes: (m?.classes ?? []).map((c) => `${c.label}: ${classWords(c)}`),
      rules: (m?.rules ?? []).map((x) => `${x.section} ${x.text}`),
    };
  });
}

const huntSubjectOf = (l: Lens): HuntSubject => ({ key: `stock:${l.symbol}`, kind: "stock", id: l.symbol, title: l.symbol, name: l.name, text: l.thesis ?? "", pathway: l.pathway, pillars: l.pillars, watch: l.watch, signals: l.signals });

/**
 * What the agent gathers for one company over a window, without a model: the
 * headlines (read once a run, the window applied by the filter), the SEC's
 * filings since the window's first day when the person confirmed the
 * contact, the app's own reports, and the person's newsletter points and
 * podcast write-ups that name it.
 */
export function gatherFor(l: Lens, today: string, contact: Preferences["edgarContact"], earnings: EarningsFile | null, newsletters: NewslettersFile | null, podcasts: PodcastsFile | null, theses: ThesesFile | null) {
  let headlines: Promise<ResearchItem[]> | null = null;
  return async (windowDays: number): Promise<ResearchItem[]> => {
    const from = addDays(new Date(`${today}T12:00:00Z`), -(windowDays - 1)).toISOString().slice(0, 10);
    headlines ??= loadCompanyHeadlines([l.symbol], today).then((h) => h.items.map((i): ResearchItem => ({ ref: "", kind: "news", title: i.title.slice(0, 300), source: i.source.slice(0, 200), url: i.url, at: i.at, text: null, form: null })));
    const [news, sec] = await Promise.all([headlines, contact ? filingsOfWeek(l.symbol, from, contact).catch(() => []) : Promise.resolve([])]);
    const own = reportsOfEarnings(earnings, new Set([l.symbol]), from);
    const files: ResearchItem[] = [...sec, ...own].map((i) => ({ ref: "", kind: i.form ? "filing" : "report", title: i.title.slice(0, 300), source: i.source.slice(0, 200), url: i.url, at: i.at, text: null, form: i.form ? i.form.slice(0, 12) : null }));
    const theirs: ResearchItem[] = materialFor(huntSubjectOf(l), newsletters, podcasts, today).map((i) => ({ ref: "", kind: i.from === "podcast" ? "podcast" : "newsletter", title: i.text.slice(0, 300), source: i.source.slice(0, 200), url: i.url, at: i.date, text: i.text.slice(0, 1500), form: null }));
    // What the person's own Claude read and wrote to the thesis in the window, or a note of theirs (Hamza, 26 Oct 2026).
    const reads: ResearchItem[] = addedSince(thesisFor(theses, l.symbol), from).map((e) => ({ ref: "", kind: "read", title: e.summary.slice(0, 300), source: e.source.slice(0, 200), url: null, at: e.at, text: [e.summary, e.changes ? `Changed: ${e.changes}` : ""].filter(Boolean).join(" ").slice(0, 1500), form: null }));
    return [...files, ...news, ...theirs, ...reads];
  };
}

/**
 * The models the provider runs for the two steps (§3.1; the person's one model on any other provider).
 * Beta members: Haiku for both, the Judge asked again on Sonnet when its reading fails the check.
 * The operator and the allowlist (`hostsOnDemand`): the Judge on Sonnet, consulting Opus on a hard call
 * (Hamza, 9 Nov 2026: "keep it how it was for me and the allowlist").
 */
const modelsOf = (p: ModelProvider, hosted: boolean) =>
  hosted
    ? { sift: modelFor(p, SIFT_MODEL), judge: modelFor(p, HOSTED_JUDGE_MODEL), retry: null }
    : { sift: modelFor(p, SIFT_MODEL), judge: modelFor(p, JUDGE_MODEL), retry: p.kind === "anthropic" ? tierAbove(JUDGE_MODEL) : null };

async function readOne(provider: ModelProvider, hosted: boolean, l: Lens, today: string, known: ReturnType<typeof knownFor>, lessons: string[], gather: ReturnType<typeof gatherFor>): Promise<ResearchResult> {
  try {
    const models = modelsOf(provider, hosted);
    // The Judge may consult Opus on a hard call, on a Claude key, for the operator and the allowlist alone (the advisor; Hamza, 4 and 9 Nov 2026).
    const advised = (body: ModelRequest) => (hosted && body.model === models.judge && lensHasHardCalls(l) ? withAdvisor(body, provider, MODELS.best, JUDGE_ADVICE) : body);
    return await runNewsResearch({ lens: l, today, known, lessons }, gather, (body) => callModel(provider, advised(body as ModelRequest)), models);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[research] company: ${e.logDetail ?? "failed"}`);
    return { findings: [], kept: [], dropped: [], steps: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 }, costUsd: 0, windowDays: 7, sentence: `${e.message.slice(0, 300)} Tried again on the next run.`, failed: true };
  }
}

/**
 * Reads the company news of the companies due, at most `max`, or the one
 * named by `only` whether due or not; `force` (Run now on the Agents screen)
 * reads the `max` read longest ago even when read today. Null when there is
 * no company to read or none is due, so a quiet run adds nothing to the sync
 * status.
 */
export async function companyNewsResearchInto(vault: Vault, now: Date, max: number, only: string | null = null, force = false): Promise<ResearchRun | null> {
  const today = localDay(now);
  const [book, records, theses, setup, preferences, file] = await Promise.all([
    vault.readJson("book", bookSchema).catch(() => null),
    vault.readJson("records", recordsSchema).catch(() => null),
    vault.readJson("theses", thesesFileSchema).catch(() => null),
    vault.readJson("setup", setupSchema).catch(() => null),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
    vault.readJson("research_cache", researchCacheSchema),
  ]);
  const rec = records ?? EMPTY_RECORDS;
  const subjects = earningsSubjects(book, rec.bySymbol, []).map((s) => ({ symbol: s.symbol, name: s.name, held: s.kind === "holding" }));
  if (!subjects.length) return null;
  const symbols = subjects.map((s) => s.symbol.toUpperCase());
  const last = (s: string) => file?.companies[s]?.readAt ?? "";
  const due = only ? symbols.filter((s) => s === only.toUpperCase()) : force ? [...symbols].sort((a, b) => last(a).localeCompare(last(b))).slice(0, max) : companiesDue(symbols, file, today, max);
  if (!due.length) return null;
  const agent = agentById("company_news")!;
  const gate = mayRun(agent, preferences?.agentsOff ?? [], preferences?.agentBudgets ?? {}, file?.runs ?? [], now.toISOString());
  if (!gate.ok) return { read: 0, found: 0, failed: 0, sentence: gate.sentence, problem: null };
  const provider = await providerFor(vault);
  if (!provider) return { read: 0, found: 0, failed: 0, sentence: "The AI is not set up on this deployment yet.", problem: "The AI is not set up here." };
  const hosted = hostsOnDemand(vault.owner);
  const [earnings, newsletters, podcasts, feedback] = await Promise.all([
    vault.readJson("earnings", earningsFileSchema).catch(() => null),
    vault.readJson("newsletters", newslettersFileSchema).catch(() => null),
    vault.readJson("podcasts", podcastsFileSchema).catch(() => null),
    vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null),
  ]);
  const contact = preferences?.edgarContact ?? null;
  const lessons = lessonsFor(feedback, ["research_agent", "company_news"]);
  const lenses = lensesFor(subjects.filter((s) => due.includes(s.symbol.toUpperCase())), theses, rec, setup);
  const results: { symbol: string; r: ResearchResult }[] = [];
  for (let i = 0; i < lenses.length; i += AT_ONCE) {
    const batch = lenses.slice(i, i + AT_ONCE);
    results.push(...(await Promise.all(batch.map(async (l) => ({ symbol: l.symbol, r: await readOne(provider, hosted, l, today, knownFor(file, l.symbol), lessons, gatherFor(l, today, contact, earnings, newsletters, podcasts, theses)) })))));
  }
  // Read again just before writing, so a pass that ran meanwhile is not lost.
  let latest: ResearchCache = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? file ?? EMPTY_RESEARCH_CACHE;
  for (const { symbol, r } of results) latest = withResearch(latest, symbol, r, runRecord("company_news", symbol, now, { steps: r.steps, findings: r.findings.length, costUsd: r.costUsd, sentence: r.sentence, failed: r.failed }), now, today);
  await vault.writeJson("research_cache", latest);
  const found = results.reduce((n, x) => n + x.r.findings.length, 0);
  const failed = results.filter((x) => x.r.failed).length;
  const read = results.length;
  const sentence = `Read ${read} compan${read === 1 ? "y" : "ies"}: ${found} finding${found === 1 ? "" : "s"}${failed ? `; ${failed} not read and tried again on the next run` : ""}.`;
  return { read, found, failed, sentence, problem: null };
}

/**
 * Asks what the price already assumes against the thesis (§4.3), for one
 * company, from the facts the thesis page computed (the reverse DCF, what was
 * delivered, the guidance, the person's cases, the pillars). The company's
 * kept items from today's pass are its evidence, and a few
 * searches. Kept a week in `research_cache`; a failure is the sentence.
 */
export async function pricedInInto(vault: Vault, facts: PricedFacts, now: Date): Promise<{ ok: true; reading: PricedIn } | { ok: false; sentence: string }> {
  const today = localDay(now);
  const [file, preferences, feedback, hostedAi] = await Promise.all([
    vault.readJson("research_cache", researchCacheSchema).catch(() => null),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
    vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null),
    providerFor(vault),
  ]);
  const agent = agentById("priced_in")!;
  const gate = mayRun(agent, preferences?.agentsOff ?? [], preferences?.agentBudgets ?? {}, file?.runs ?? [], now.toISOString());
  if (!gate.ok) return { ok: false, sentence: gate.sentence };
  const provider = hostedAi;
  if (!provider) return { ok: false, sentence: "The AI is not set up on this deployment yet." };
  const web = !providerCannot(provider, "web_search");
  const items = (file?.companies[facts.symbol.toUpperCase()]?.kept ?? []).map((k, i) => ({ ...k, ref: `S${i + 1}` }));
  const lessons = lessonsFor(feedback, ["research_agent", "priced_in"]);
  try {
    const body = pricedInRequestBody(facts, items, lessons, web, modelFor(provider, PRICED_MODEL));
    const answer = await callModel(provider, body as ModelRequest);
    const parsed = parsePricedIn(answer, facts, items, web, now, today);
    const usage = usageOf(answer);
    const model = String(body.model);
    const cost = costOf(model, usage);
    const step = { id: "judge", model, read: items.length, kept: parsed.ok ? parsed.reading.pillars.length : 0, tokensIn: usage.input + usage.cacheRead + usage.cacheWrite, tokensOut: usage.output, searches: usage.searches, costUsd: cost, note: parsed.ok ? null : parsed.reason };
    const latest = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? file ?? EMPTY_RESEARCH_CACHE;
    if (!parsed.ok) {
      await vault.writeJson("research_cache", withRun(latest, runRecord("priced_in", facts.symbol, now, { steps: [step], findings: 0, costUsd: cost, sentence: `Not read: ${parsed.reason}.`, failed: true }), now));
      return { ok: false, sentence: `Not read: ${parsed.reason}. Try again.` };
    }
    const reading = { ...parsed.reading, costUsd: cost };
    await vault.writeJson("research_cache", withPricedIn(latest, reading, runRecord("priced_in", facts.symbol, now, { steps: [step], findings: reading.pillars.length, costUsd: cost, sentence: reading.summary }), now));
    return { ok: true, reading };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[research] priced in: ${e.logDetail ?? "failed"}`);
    return { ok: false, sentence: e.message.slice(0, 300) };
  }
}

/**
 * Proposes one lesson for an agent from the ratings not yet behind one: on
 * the person's model when they have one (a small model, a few US tenths of a
 * cent), else from the note or the reasons they ticked. The lesson is
 * pending until the person approves it on the Agents screen.
 */
export async function proposeLessonInto(vault: Vault, agentId: string, now: Date): Promise<{ ok: true; text: string } | { ok: false; sentence: string }> {
  const agent = agentById(agentId);
  if (!agent) return { ok: false, sentence: "No such agent." };
  const file: AgentFeedback = (await vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null)) ?? EMPTY_FEEDBACK;
  const ratings = unlearned(file, agent.id);
  if (!ratings.length) return { ok: false, sentence: "Rate a finding not useful, with what was wrong, and a lesson can be proposed from it." };
  let text: string | null = null;
  let by: "model" | "you" = "you";
  const provider = await providerFor(vault);
  if (provider) {
    try {
      text = parseLesson(await callModel(provider, lessonRequestBody(agent, ratings.slice(0, 20), modelFor(provider, TIER_MODEL.haiku!)) as ModelRequest));
      if (text) by = "model";
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[research] lesson: ${e.logDetail ?? "failed"}`);
    }
  }
  text ??= lessonFromRatings(ratings);
  if (!text) return { ok: false, sentence: "The ratings say nothing a lesson could follow yet." };
  const latest = (await vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null)) ?? file;
  await vault.writeJson("agent_feedback", withLesson(latest, { agent: agent.id, text, from: ratings.map((r) => r.id), by, at: now.toISOString() }));
  return { ok: true, text };
}
