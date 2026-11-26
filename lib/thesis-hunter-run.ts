import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { newslettersFileSchema, type NewslettersFile } from "@/lib/newsletters";
import { podcastsFileSchema, type PodcastsFile } from "@/lib/podcasts";
import { EMPTY_RECORDS, recordsSchema } from "@/lib/preferences";
import { agentById, costOf, mayRun, usageOf, type RunStep } from "@/lib/agents";
import { preferencesSchema } from "@/lib/preferences";
import { EMPTY_RESEARCH_CACHE, researchCacheSchema, runRecord, withRun, type ResearchCache } from "@/lib/research-agent";
import { SyncError } from "@/lib/sync-error";
import { thesesFileSchema } from "@/lib/theses";
import { EMPTY_HUNTER, huntFor, hunterRequestBody, hunterRunSentence, huntSentence, huntSubjects, HUNTER_MODEL, HUNTS_PER_RUN, materialFor, parseHunterResponse, subjectsDue, thesisHunterFileSchema, withHunt, type Find, type HuntSubject, type ThesisHunterFile } from "@/lib/thesis-hunter";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/**
 * Runs the Thesis Hunter (lib/thesis-hunter.ts) on the AI:
 * the theses due today, a few at a time and in parallel, each one call with
 * the web search on a Claude provider and the person's own newsletters and
 * podcasts on any, and for a stock the items the Research Agent kept for it
 * today (lib/research-agent.ts; Hamza, 23 Oct 2026). Only the finds are kept, in the vault's `thesis_hunter`
 * file; a thesis that could not be hunted keeps its finds and a sentence and
 * is tried again the next day. Each thesis is hunted once a week: the daily
 * cron takes the ones whose week is up for everyone, opening the app hunts
 * one, and "Hunt now" on a thesis hunts that one at any time.
 */

export type HunterRun = { hunted: number; found: number; failed: number; sentence: string; problem: string | null };

const KIND_NAMES: Record<string, string> = { trigger: "Trigger", kill: "Kill signal" };

/** One thesis hunted; never throws for a provider's answer, which becomes the sentence. */
async function huntOne(provider: ModelProvider, s: HuntSubject, prev: ThesisHunterFile, newsletters: NewslettersFile | null, podcasts: PodcastsFile | null, research: ResearchCache | null, now: Date): Promise<{ key: string; finds: Find[]; sentence: string; failed: boolean; step: RunStep | null }> {
  const today = localDay(now);
  const web = !providerCannot(provider, "web_search");
  const known = huntFor(prev, s.key).finds.map((f) => ({ title: f.title, url: f.sourceUrl }));
  const feed = s.kind === "stock" ? (research?.companies[s.id]?.kept ?? []) : [];
  const input = { subject: s, today, items: materialFor(s, newsletters, podcasts, today, feed), known, web };
  try {
    const model = modelFor(provider, process.env.ANTHROPIC_HUNTER_MODEL || HUNTER_MODEL);
    const answer = await callModel(provider, hunterRequestBody(input, model) as ModelRequest);
    const u = usageOf(answer);
    const parsed = parseHunterResponse(answer, input, now);
    const step: RunStep = { id: "hunt", model, read: input.items.length, kept: parsed.ok ? parsed.finds.length : 0, tokensIn: u.input + u.cacheRead + u.cacheWrite, tokensOut: u.output, searches: u.searches, costUsd: costOf(model, u), note: parsed.ok ? null : parsed.reason };
    if (!parsed.ok) return { key: s.key, finds: [], sentence: `Not hunted: ${parsed.reason}; tried again tomorrow.`, failed: true, step };
    return { key: s.key, finds: parsed.finds, sentence: huntSentence(parsed.finds.length, parsed.dropped, parsed.note, web), failed: false, step };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[hunter] thesis: ${e.logDetail ?? "failed"}`);
    return { key: s.key, finds: [], sentence: `${e.message.slice(0, 300)} Tried again tomorrow.`, failed: true, step: null };
  }
}

/**
 * Hunts the theses due, at most `max`, or the one named by `only` whether due
 * or not. Null when no thesis has words to hunt for or none is due, so a
 * quiet morning adds no line to the sync status.
 */
export async function huntThesesInto(vault: Vault, now: Date, max = HUNTS_PER_RUN, only: string | null = null): Promise<HunterRun | null> {
  const [theses, records, file] = await Promise.all([vault.readJson("theses", thesesFileSchema).catch(() => null), vault.readJson("records", recordsSchema).catch(() => null), vault.readJson("thesis_hunter", thesisHunterFileSchema)]);
  const signals = Object.fromEntries(Object.entries((records ?? EMPTY_RECORDS).bySymbol).map(([s, r]) => [s.toUpperCase(), r.triggers.map((t) => `${KIND_NAMES[t.kind]} ${t.field} ${t.is === "lte" ? "at or below" : "at or above"} ${t.value}${t.note ? ` (${t.note})` : ""}`)]));
  const subjects = huntSubjects(theses, {}, signals);
  const due = only ? subjects.filter((s) => s.key === only) : subjectsDue(subjects, file ?? EMPTY_HUNTER, localDay(now), max);
  if (!due.length) return null;
  // The person's switch and weekly ceiling on the Agents screen (lib/agents.ts; Hamza, 23 Oct 2026); Hunt now on a thesis runs past the ceiling, never past the switch.
  const [preferences, research] = await Promise.all([vault.readJson("preferences", preferencesSchema).catch(() => null), vault.readJson("research_cache", researchCacheSchema).catch(() => null)]);
  const off = preferences?.agentsOff ?? [];
  const gate = mayRun(agentById("thesis_hunter")!, off, preferences?.agentBudgets ?? {}, research?.runs ?? [], now.toISOString());
  if (!gate.ok && (!only || off.includes("thesis_hunter"))) return { hunted: 0, found: 0, failed: 0, sentence: gate.sentence, problem: only ? gate.sentence : null };
  const provider = await providerFor(vault);
  if (!provider) return { hunted: 0, found: 0, failed: 0, sentence: "The AI is not set up on this deployment yet.", problem: "The AI is not set up here." };
  const [newsletters, podcasts] = await Promise.all([vault.readJson("newsletters", newslettersFileSchema).catch(() => null), vault.readJson("podcasts", podcastsFileSchema).catch(() => null)]);
  const results = await Promise.all(due.map((s) => huntOne(provider, s, file ?? EMPTY_HUNTER, newsletters, podcasts, research, now)));
  // Read again just before writing, so a find dismissed meanwhile stays dismissed.
  let latest = (await vault.readJson("thesis_hunter", thesisHunterFileSchema)) ?? file ?? EMPTY_HUNTER;
  for (const r of results) latest = withHunt(latest, r.key, r.finds, r.sentence, now);
  await vault.writeJson("thesis_hunter", latest);
  // Each hunt's run, with its tokens and estimated cost, for the Agents screen.
  let runs: ResearchCache = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? research ?? EMPTY_RESEARCH_CACHE;
  for (const r of results) runs = withRun(runs, runRecord("thesis_hunter", r.key, now, { steps: r.step ? [r.step] : [], findings: r.finds.length, costUsd: r.step ? r.step.costUsd : 0, sentence: r.sentence, failed: r.failed }), now);
  await vault.writeJson("research_cache", runs);
  // The finds are no alerts: the weekly and monthly review carry them (Hamza, 5 Nov 2026: "that should only show in the weekly report").
  const run = { hunted: results.length, found: results.reduce((n, r) => n + r.finds.length, 0), failed: results.filter((r) => r.failed).length };
  return { ...run, sentence: hunterRunSentence(run), problem: null };
}
