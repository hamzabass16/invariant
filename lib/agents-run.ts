import "server-only";

import { agentById, mayRun, runsWithPending, tierAbove } from "@/lib/agents";
import { alertsFileSchema, reconcilePrefix } from "@/lib/alerts";
import { agentsDue, COMPILE_MODEL, compileRequestBody, customAgentNotices, customAgentsFileSchema, CUSTOM_AGENT_PREFIX, EMPTY_CUSTOM_AGENTS, knownOf, kindsOf, questionLens, parseCompile, subjectsOf, withAgent, withNewAgent, withRunFindings, withTest, isDue, wordsProblem, type CustomAgent, type CustomAgentsFile } from "@/lib/custom-agents";
import { earningsFileSchema, earningsSubjects } from "@/lib/earnings";
import { bookSchema } from "@/lib/holdings";
import { failedReading, LENS_IDS, LENS_LABEL, LENS_MODEL, lensesDue, lensRequestBody, parseLensResponse, type LensFinding, type LensId } from "@/lib/lens-agents";
import { callChecked, callModel } from "@/lib/methodology-draft";
import { NO_HOSTED_AI, providerFor } from "@/lib/hosted-model";
import { modelFor, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { newslettersFileSchema } from "@/lib/newsletters";
import { checkPlan, extrasOf, MAX_EXTRA, planRequestBody, PLAN_AGENTS, PLANNER_MODEL, reasonsFor, type DayPlan, type PlanAgent, type PlanFacts } from "@/lib/planner";
import { podcastsFileSchema } from "@/lib/podcasts";
import { EMPTY_RECORDS, preferencesSchema, recordsSchema, type Preferences } from "@/lib/preferences";
import { EMPTY_RESEARCH_CACHE, JUDGE_MODEL, researchCacheSchema, runNewsResearch, SIFT_MODEL, type Finding, type ResearchCache } from "@/lib/research-agent";
import { gatherFor } from "@/lib/research-agent-run";
import { SyncError } from "@/lib/sync-error";
import { thesesFileSchema } from "@/lib/theses";
import { EMPTY_HUNTER, huntSubjects, subjectsDue, thesisHunterFileSchema } from "@/lib/thesis-hunter";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/**
 * Runs the agents of the hierarchy's top and the person's own (Hamza, 4 Nov
 * 2026): the daily planner on Opus, the lens agents on Sonnet after the
 * Research Agent's pass, and the agents the person built in the Agent
 * Builder, each through `callModel` with its tag, so the runtime
 * (lib/agent-ledger.ts) gates it by its switch and ceiling, lays its
 * approved lessons and counts it. A failure is a sentence, never a throw
 * that stops the morning; nothing of the book goes in a log line, and a
 * symbol never does.
 */

const providerOf = (vault: Vault): Promise<ModelProvider | null> => providerFor(vault);

const NO_MODEL = NO_HOSTED_AI;

export type AgentsRun = { sentence: string; problem: string | null };

/** Why an agent cannot run now, from the person's switches and ceilings, or null. */
function blockedBy(agent: string, preferences: Preferences | null, research: ResearchCache | null, now: Date): string | null {
  const a = agentById(agent);
  if (!a) return "No such agent.";
  if (a.status === "planned") return `${a.name} is not built yet.`;
  const gate = mayRun(a, preferences?.agentsOff ?? [], preferences?.agentBudgets ?? {}, runsWithPending(research?.runs ?? [], [], now), now.toISOString());
  return gate.ok ? null : gate.sentence;
}

// ---------------------------------------------------------------------------
// The daily planner

/** What changed for the person, in words and dates: the facts the planner reads. */
async function planFacts(vault: Vault, now: Date, preferences: Preferences | null, research: ResearchCache | null): Promise<PlanFacts> {
  const today = localDay(now);
  const [book, records, theses, earnings, alerts, hunter, custom] = await Promise.all([
    vault.readJson("book", bookSchema).catch(() => null),
    vault.readJson("records", recordsSchema).catch(() => null),
    vault.readJson("theses", thesesFileSchema).catch(() => null),
    vault.readJson("earnings", earningsFileSchema).catch(() => null),
    vault.readJson("alerts", alertsFileSchema).catch(() => null),
    vault.readJson("thesis_hunter", thesisHunterFileSchema).catch(() => null),
    vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null),
  ]);
  const results = [...(earnings?.upcoming ?? []).map((u) => ({ symbol: u.symbol, date: u.date })), ...(earnings?.reports ?? []).map((r) => ({ symbol: r.symbol, date: r.date }))];
  const items = alerts?.items ?? [];
  const subjects = earningsSubjects(book, (records ?? EMPTY_RECORDS).bySymbol, []);
  const companies = subjects.map((s) => {
    const c = research?.companies[s.symbol.toUpperCase()];
    return { symbol: s.symbol.toUpperCase(), held: s.kind === "holding", lastRead: c?.day ?? null, due: !c || c.day < today || c.failed, reasons: reasonsFor(s.symbol, today, results, items) };
  });
  const hunts = huntSubjects(theses);
  const due = new Set(subjectsDue(hunts, hunter ?? EMPTY_HUNTER, today, hunts.length).map((h) => h.key));
  const thesesFacts = hunts.map((h) => ({ key: h.key, title: h.title, lastHunt: hunter?.subjects[h.key]?.huntedAt?.slice(0, 10) ?? null, due: due.has(h.key), reasons: h.kind === "stock" ? reasonsFor(h.id, today, results, items) : [] }));
  const customFacts = (custom?.agents ?? [])
    .filter((a) => a.status === "on")
    .map((a) => {
      const watched = subjectsOf(a.spec, subjects.filter((s) => s.kind === "holding"), subjects.filter((s) => s.kind !== "holding"));
      return { id: a.id, name: a.spec.name, lastRun: a.lastRun?.slice(0, 10) ?? null, due: isDue(a, today), reasons: [...new Set(watched.flatMap((w) => reasonsFor(w.symbol, today, results, items).filter((r) => r.startsWith("results") || r.startsWith("reported")).map((r) => `${w.symbol} ${r}`)))].slice(0, 6) };
    });
  const runnable: PlanAgent[] = [];
  const blocked: PlanFacts["blocked"] = [];
  for (const a of PLAN_AGENTS) {
    const why = blockedBy(a, preferences, research, now);
    if (why) blocked.push({ agent: a, sentence: why });
    else runnable.push(a);
  }
  return { today, runnable, blocked, companies, theses: thesesFacts, custom: customFacts };
}

/**
 * Plans the person's day once each morning, on Opus. Kept in research_cache as `plan`; a day already planned is not
 * planned again. With nothing to plan, no call is made.
 */
export async function planDayInto(vault: Vault, now: Date, force = false): Promise<AgentsRun | null> {
  const today = localDay(now);
  const [preferences, research] = await Promise.all([vault.readJson("preferences", preferencesSchema).catch(() => null), vault.readJson("research_cache", researchCacheSchema).catch(() => null)]);
  if (research?.plan?.day === today && !force) return null;
  const blocked = blockedBy("planner", preferences, research, now);
  if (blocked) return { sentence: blocked, problem: null };
  const facts = await planFacts(vault, now, preferences, research);
  if (!facts.companies.length && !facts.theses.length && !facts.custom.length) return force ? { sentence: "Nothing to plan: no listed holding, watchlist company, thesis or agent of yours.", problem: "Nothing to plan." } : null;
  const provider = await providerOf(vault);
  if (!provider) return { sentence: NO_MODEL, problem: "The AI is not set up." };
  let plan: DayPlan;
  try {
    const checked = await callChecked(provider, planRequestBody(facts, [], modelFor(provider, PLANNER_MODEL)) as ModelRequest, { agent: "planner", step: "plan", subject: today }, (answer) => checkPlan(answer, facts, now), (c) => c.ok);
    plan = checked.ok ? checked.plan : { day: today, at: now.toISOString(), note: "", tasks: [], dropped: [], ran: false, failed: true, sentence: `Not planned: ${checked.reason}; the agents run as scheduled.` };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[planner] ${e.logDetail ?? "failed"}`);
    plan = { day: today, at: now.toISOString(), note: "", tasks: [], dropped: [], ran: false, failed: true, sentence: `${e.message.slice(0, 300)} The agents run as scheduled.` };
  }
  const latest = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? research ?? EMPTY_RESEARCH_CACHE;
  await vault.writeJson("research_cache", researchCacheSchema.parse({ ...latest, plan, updated: now.toISOString() }));
  return { sentence: plan.sentence, problem: null };
}

/** The runs outside the schedule today's plan asks for, once: a thesis hunted early, an agent the person built run early. */
export async function runPlanExtrasInto(vault: Vault, now: Date): Promise<AgentsRun | null> {
  const today = localDay(now);
  const research = await vault.readJson("research_cache", researchCacheSchema).catch(() => null);
  const plan = research?.plan?.day === today && !research.plan.failed ? research.plan : null;
  if (!plan || plan.ran) return null;
  const hunts = extrasOf(plan, "thesis_hunter").slice(0, MAX_EXTRA);
  const builds = extrasOf(plan, "agent_builder").slice(0, MAX_EXTRA);
  // Marked first, so a second morning job never runs them twice.
  await vault.writeJson("research_cache", researchCacheSchema.parse({ ...research!, plan: { ...plan, ran: true }, updated: now.toISOString() }));
  let ran = 0;
  if (hunts.length) {
    const preferences = await vault.readJson("preferences", preferencesSchema).catch(() => null);
    if (!blockedBy("thesis_hunter", preferences, research, now)) {
      const { huntThesesInto } = await import("@/lib/thesis-hunter-run");
      for (const key of hunts) {
        try {
          const r = await huntThesesInto(vault, now, 1, key);
          if (r?.hunted) ran += 1;
        } catch (e) {
          if (!(e instanceof SyncError)) throw e;
          console.error(`[planner] extra hunt: ${e.logDetail ?? "failed"}`);
        }
      }
    }
  }
  if (builds.length) {
    const r = await runCustomAgentsInto(vault, now, builds);
    if (r) ran += builds.length;
  }
  return ran ? { sentence: `The plan ran ${ran} task${ran === 1 ? "" : "s"} outside the schedule.`, problem: null } : null;
}

// ---------------------------------------------------------------------------
// The lens agents

/** Today's findings, the most telling first as each company's Judge ranked them, held companies first. */
function todaysFindings(research: ResearchCache | null, today: string): LensFinding[] {
  return Object.values(research?.companies ?? {})
    .filter((c) => c.day === today)
    .flatMap((c) => c.findings)
    .map((f) => ({ id: f.id, symbol: f.symbol, headline: f.headline, lines: f.lines }));
}

/** Each lens the person turned on reads today's findings once, after the Research Agent's pass. */
export async function lensReadingsInto(vault: Vault, now: Date, force = false): Promise<AgentsRun | null> {
  const today = localDay(now);
  const [preferences, research] = await Promise.all([vault.readJson("preferences", preferencesSchema).catch(() => null), vault.readJson("research_cache", researchCacheSchema).catch(() => null)]);
  const on = (preferences?.lensAgents ?? []).filter((l): l is LensId => (LENS_IDS as readonly string[]).includes(l));
  if (!on.length) return force ? { sentence: "Turn on a lens first.", problem: "No lens on." } : null;
  const findings = todaysFindings(research, today);
  const due = force ? (findings.length ? on : []) : lensesDue(on, research?.lenses ?? {}, today, findings.length);
  if (!due.length) return force ? { sentence: "No findings today for the lenses to read.", problem: "No findings today." } : null;
  const blocked = blockedBy("lenses", preferences, research, now);
  if (blocked) return { sentence: blocked, problem: force ? blocked : null };
  const provider = await providerOf(vault);
  if (!provider) return { sentence: NO_MODEL, problem: "The AI is not set up." };
  const results = await Promise.all(
    due.map(async (lens) => {
      try {
        const answer = await callModel(provider, lensRequestBody(lens, findings, today, [], modelFor(provider, LENS_MODEL)) as ModelRequest, { agent: "lenses", step: "read", subject: lens });
        const parsed = parseLensResponse(answer, findings, today, now);
        return { lens, reading: parsed.ok ? parsed.reading : failedReading(research?.lenses[lens], today, now, `Not read: ${parsed.reason}; tried again on the next run.`) };
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[lenses] ${e.logDetail ?? "failed"}`);
        return { lens, reading: failedReading(research?.lenses[lens], today, now, `${e.message.slice(0, 300)} Tried again on the next run.`) };
      }
    }),
  );
  const latest = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? research ?? EMPTY_RESEARCH_CACHE;
  await vault.writeJson("research_cache", researchCacheSchema.parse({ ...latest, lenses: { ...latest.lenses, ...Object.fromEntries(results.map((r) => [r.lens, r.reading])) }, updated: now.toISOString() }));
  return { sentence: results.map((r) => `${LENS_LABEL[r.lens]}: ${r.reading.sentence}`).join(" ").slice(0, 400), problem: null };
}

// ---------------------------------------------------------------------------
// The agents the person built

/** One agent's pass over its companies on the Research Agent's own steps, over the past week (the Research Agent's own window). */
async function runOne(vault: Vault, provider: ModelProvider, a: CustomAgent, now: Date, step: "test" | "run"): Promise<{ findings: Finding[]; read: number; sentence: string; failed: boolean }> {
  const today = localDay(now);
  const [book, records, preferences, earnings, newsletters, podcasts, theses] = await Promise.all([
    vault.readJson("book", bookSchema).catch(() => null),
    vault.readJson("records", recordsSchema).catch(() => null),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
    vault.readJson("earnings", earningsFileSchema).catch(() => null),
    vault.readJson("newsletters", newslettersFileSchema).catch(() => null),
    vault.readJson("podcasts", podcastsFileSchema).catch(() => null),
    vault.readJson("theses", thesesFileSchema).catch(() => null),
  ]);
  const all = earningsSubjects(book, (records ?? EMPTY_RECORDS).bySymbol, []);
  const watched = subjectsOf(a.spec, all.filter((s) => s.kind === "holding"), all.filter((s) => s.kind !== "holding"));
  if (!watched.length) return { findings: [], read: 0, sentence: "None of the companies it watches is held or on the watchlist now.", failed: false };
  const kinds = kindsOf(a.spec);
  const models = { sift: modelFor(provider, SIFT_MODEL), judge: modelFor(provider, JUDGE_MODEL), retry: provider.kind === "anthropic" ? tierAbove(JUDGE_MODEL) : null };
  const contact = a.spec.sources.includes("filings") ? (preferences?.edgarContact ?? null) : null;
  const findings: Finding[] = [];
  let failed = 0;
  for (const s of watched) {
    const lens = questionLens(a.spec, s);
    const gather = gatherFor(lens, today, contact, earnings, newsletters, podcasts, theses);
    try {
      const r = await runNewsResearch(
        { lens, today, known: step === "test" ? [] : knownOf(a, s.symbol), lessons: [] },
        async (days) => (await gather(days)).filter((i) => kinds.has(i.kind)),
        (body) => callModel(provider, body as ModelRequest, { agent: "agent_builder", step, subject: `${a.id}:${s.symbol}` }),
        models,
      );
      if (r.failed) failed += 1;
      findings.push(...r.findings);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[agent builder] ${step}: ${e.logDetail ?? "failed"}`);
      return { findings, read: watched.length, sentence: `${e.message.slice(0, 300)}`, failed: true };
    }
  }
  const n = findings.length;
  const sentence = `Read ${watched.length} compan${watched.length === 1 ? "y" : "ies"}${step === "test" ? " over the past week" : ""}: ${n} finding${n === 1 ? "" : "s"}${failed ? `; ${failed} not read` : ""}.`;
  return { findings, read: watched.length, sentence, failed: failed === watched.length };
}

/**
 * The person's words compiled on Haiku into an agent's contract (asked once
 * more a tier up when they do not compile), kept as a draft to test. The
 * words alone go to the model, with the symbols held and watched so it can
 * name them; never a figure of the book.
 */
export async function compileCustomAgentInto(vault: Vault, words: string, now: Date): Promise<{ ok: true; id: string } | { ok: false; sentence: string }> {
  const problem = wordsProblem(words);
  if (problem) return { ok: false, sentence: problem };
  const provider = await providerOf(vault);
  if (!provider) return { ok: false, sentence: NO_MODEL };
  const [book, records, file] = await Promise.all([vault.readJson("book", bookSchema).catch(() => null), vault.readJson("records", recordsSchema).catch(() => null), vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null)]);
  const all = earningsSubjects(book, (records ?? EMPTY_RECORDS).bySymbol, []);
  const held = all.filter((s) => s.kind === "holding").map((s) => s.symbol.toUpperCase());
  const watched = all.filter((s) => s.kind !== "holding").map((s) => s.symbol.toUpperCase());
  const parsed = await callChecked(provider, compileRequestBody(words, held, watched, modelFor(provider, COMPILE_MODEL)) as ModelRequest, { agent: "agent_builder", step: "compile" }, (answer) => parseCompile(answer, held, watched), (p) => p.ok);
  if (!parsed.ok) return { ok: false, sentence: parsed.reason };
  const made = withNewAgent(file ?? EMPTY_CUSTOM_AGENTS, words, parsed.spec, parsed.notes, now);
  if (!made.ok) return { ok: false, sentence: made.reason };
  await vault.writeJson("custom_agents", made.file);
  return { ok: true, id: made.id };
}

/** Test-runs one agent on the past week; the person reads the result before switching it on. */
export async function testCustomAgentInto(vault: Vault, id: string, now: Date): Promise<{ ok: true } | { ok: false; sentence: string }> {
  const file = (await vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null)) ?? EMPTY_CUSTOM_AGENTS;
  const a = file.agents.find((x) => x.id === id);
  if (!a) return { ok: false, sentence: "That agent is no longer there." };
  const provider = await providerOf(vault);
  if (!provider) return { ok: false, sentence: NO_MODEL };
  const r = await runOne(vault, provider, a, now, "test");
  if (r.failed && !r.findings.length) return { ok: false, sentence: r.sentence };
  const latest = (await vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null)) ?? file;
  await vault.writeJson("custom_agents", withAgent(latest, id, (x) => withTest(x, r.findings, r.read, r.sentence, now), now));
  return { ok: true };
}

/**
 * Runs the person's agents that are on and due, or the ones named (the
 * plan's extras), and lays their findings on Notifications. Null when none
 * runs.
 */
export async function runCustomAgentsInto(vault: Vault, now: Date, only: readonly string[] | null = null): Promise<AgentsRun | null> {
  const today = localDay(now);
  const file = await vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null);
  const due = only ? (file?.agents ?? []).filter((a) => a.status === "on" && only.includes(a.id)) : agentsDue(file, today);
  if (!due.length || !file) return null;
  const provider = await providerOf(vault);
  if (!provider) return { sentence: NO_MODEL, problem: "The AI is not set up." };
  const results: { id: string; r: Awaited<ReturnType<typeof runOne>> }[] = [];
  for (const a of due) results.push({ id: a.id, r: await runOne(vault, provider, a, now, "run") });
  let latest: CustomAgentsFile = (await vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null)) ?? file;
  for (const { id, r } of results) latest = withAgent(latest, id, (x) => withRunFindings(x, r.findings, r.sentence, r.failed, now), now);
  await vault.writeJson("custom_agents", latest);
  await keepCustomNotices(vault, latest, now);
  const found = results.reduce((n, x) => n + x.r.findings.length, 0);
  return { sentence: `Ran ${results.length} of your agent${results.length === 1 ? "" : "s"}: ${found} finding${found === 1 ? "" : "s"}.`, problem: null };
}

/** The agents' findings laid on the alerts file, under their own prefix. */
export async function keepCustomNotices(vault: Vault, file: CustomAgentsFile, now: Date): Promise<void> {
  try {
    const alerts = await vault.readJson("alerts", alertsFileSchema).catch(() => null);
    await vault.writeJson("alerts", reconcilePrefix(alerts, CUSTOM_AGENT_PREFIX, customAgentNotices(file, localDay(now)), now.toISOString()).file);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[agent builder] alerts: ${e.logDetail ?? "failed"}`);
  }
}
