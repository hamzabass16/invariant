import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { agentById, costOf, mayRun, usageOf, type RunStep } from "@/lib/agents";
import { alertsFileSchema, reconcilePrefix } from "@/lib/alerts";
import { calendarAgentDue, calendarFoundSchema, calendarRequestBody, CALENDAR_MODEL, foundEvents, foundSentence, FOUND_PREFIX, parseCalendarResponse, withFailedRun, withFound } from "@/lib/calendar-agent";
import { ECON_EVENTS, econNotices } from "@/lib/econ-calendar";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelRequest } from "@/lib/model-provider";
import { preferencesSchema } from "@/lib/preferences";
import { EMPTY_RESEARCH_CACHE, researchCacheSchema, runRecord, withRun } from "@/lib/research-agent";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

export type CalendarAgentRun = { found: number; sentence: string; problem: string | null };

/**
 * The Calendar agent's monthly look three months ahead, on the person's own
 * Claude key (lib/calendar-agent.ts). Null when it is not due, so a quiet
 * morning adds no line; `force` runs it now (Run now on Agents), never past
 * the switch. Its run is kept for the Agents screen with its estimated cost.
 */
export async function findCalendarEventsInto(vault: Vault, now: Date, force = false): Promise<CalendarAgentRun | null> {
  const today = localDay(now);
  const file = await vault.readJson("calendar_events", calendarFoundSchema).catch(() => null);
  if (!force && !calendarAgentDue(file, today)) return null;
  const [preferences, research] = await Promise.all([vault.readJson("preferences", preferencesSchema).catch(() => null), vault.readJson("research_cache", researchCacheSchema).catch(() => null)]);
  const off = preferences?.agentsOff ?? [];
  const agent = agentById("calendar_agent")!;
  const gate = mayRun(agent, off, preferences?.agentBudgets ?? {}, research?.runs ?? [], now.toISOString());
  if (!gate.ok && (!force || off.includes(agent.id))) return { found: 0, sentence: gate.sentence, problem: force ? gate.sentence : null };
  const provider = await providerFor(vault);
  const cannot = !provider ? "The AI is not set up on this deployment yet." : providerCannot(provider, "web_search");
  if (cannot || !provider) {
    // Without a Claude key nothing is searched; the month is marked so the morning does not ask again each day.
    await vault.writeJson("calendar_events", { ...withFailedRun(file, now, cannot ?? ""), month: today.slice(0, 7) });
    return { found: 0, sentence: cannot ?? "", problem: force ? cannot : null };
  }
  const known = [...ECON_EVENTS, ...foundEvents(file).filter((e) => e.date < today)];
  const model = modelFor(provider, process.env.ANTHROPIC_CALENDAR_MODEL || CALENDAR_MODEL);
  let step: RunStep | null = null;
  let latest = file;
  let result: CalendarAgentRun;
  try {
    const answer = await callModel(provider, calendarRequestBody(today, known, model) as ModelRequest);
    const u = usageOf(answer);
    const parsed = parseCalendarResponse(answer, today, known);
    step = { id: "find", model, read: 0, kept: parsed.ok ? parsed.events.length : 0, tokensIn: u.input + u.cacheRead + u.cacheWrite, tokensOut: u.output, searches: u.searches, costUsd: costOf(model, u), note: parsed.ok ? null : parsed.reason };
    if (!parsed.ok) {
      const sentence = `Not read: ${parsed.reason}; tried again tomorrow.`;
      latest = withFailedRun(file, now, sentence);
      result = { found: 0, sentence, problem: force ? sentence : null };
    } else {
      const sentence = foundSentence(parsed.events.length, parsed.dropped, parsed.note);
      latest = withFound(file, parsed.events, today, now, sentence);
      result = { found: parsed.events.length, sentence, problem: null };
    }
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[calendar-agent] ${e.logDetail ?? "failed"}`);
    const sentence = `${e.message.slice(0, 300)} Tried again tomorrow.`;
    latest = withFailedRun(file, now, sentence);
    result = { found: 0, sentence, problem: force ? sentence : null };
  }
  await vault.writeJson("calendar_events", latest);
  const runs = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? research ?? EMPTY_RESEARCH_CACHE;
  await vault.writeJson("research_cache", withRun(runs, runRecord("calendar_agent", today.slice(0, 7), now, { steps: step ? [step] : [], findings: result.found, costUsd: step ? step.costUsd : 0, sentence: result.sentence, failed: !!result.problem || (!step?.kept && !!step?.note) }), now));
  // The events found are alerts the day before, like the table's.
  const alerts = await vault.readJson("alerts", alertsFileSchema).catch(() => null);
  await vault.writeJson("alerts", reconcilePrefix(alerts, FOUND_PREFIX, econNotices(today, foundEvents(latest), {}, FOUND_PREFIX), now.toISOString()).file);
  return result;
}
