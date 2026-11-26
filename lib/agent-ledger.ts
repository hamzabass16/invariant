import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

import { agentById, agentFeedbackSchema, lessonsFor, mayRun, runsFromCalls, runsWithPending, type AgentFeedback, type AgentRun, type CallEntry, type CallTag, type Usage } from "@/lib/agents";
import { preferencesSchema } from "@/lib/preferences";
import { EMPTY_RESEARCH_CACHE, researchCacheSchema, withRuns } from "@/lib/research-agent";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/**
 * The agents' runtime (Hamza, 4 Nov 2026: one hierarchy every agent runs
 * on). Each model call names its agent and step (`CallTag`); the ledger the
 * call runs under reads the person's switches, ceilings, kept runs and
 * approved lessons once, gates the call with `mayRun`, lays the lessons on
 * the brief, counts the tokens the provider reports and keeps one run per
 * agent and subject in the vault's research_cache when the work is done.
 *
 * A scheduled run and opening the app hold a ledger for their whole turn
 * (`withAgentLedger`); a request (a server action, a route) gets one of its
 * own, kept after the response through `after`. A call with no ledger at all
 * (a script, the operator's shared reads) runs ungated and uncounted, as
 * before. Nothing here calls a model or reads a key; the counts are
 * estimates at list price (lib/agents.ts).
 */

type GateState = { off: string[]; budgets: Record<string, number>; runs: AgentRun[]; feedback: AgentFeedback | null };
type Ledger = { open: () => Promise<Vault>; vault: Promise<Vault> | null; state: Promise<GateState> | null; entries: CallEntry[]; flushed: boolean };

const HELD_KEY = "__portfolioOsAgentLedger";
const held: AsyncLocalStorage<Ledger> =
  ((globalThis as Record<string, unknown>)[HELD_KEY] as AsyncLocalStorage<Ledger> | undefined) ??
  ((globalThis as Record<string, unknown>)[HELD_KEY] = new AsyncLocalStorage<Ledger>());
const REQUEST_KEY = "__portfolioOsRequestLedgers";
const byRequest: WeakMap<object, Ledger> =
  ((globalThis as Record<string, unknown>)[REQUEST_KEY] as WeakMap<object, Ledger> | undefined) ??
  ((globalThis as Record<string, unknown>)[REQUEST_KEY] = new WeakMap<object, Ledger>());

const ledgerOf = (open: () => Promise<Vault>): Ledger => ({ open, vault: null, state: null, entries: [], flushed: false });

/** Runs one person's work under one ledger, kept once at the end whatever happens inside. */
export async function withAgentLedger<T>(open: () => Promise<Vault>, run: () => Promise<T>): Promise<T> {
  const l = ledgerOf(open);
  try {
    return await held.run(l, run);
  } finally {
    await flush(l);
  }
}

/** The ledger this call runs under: the turn's, else the request's (made on first use and kept after the response), else none. */
async function current(): Promise<Ledger | null> {
  const turn = held.getStore();
  if (turn) return turn;
  const store = workUnitAsyncStorage.getStore();
  if (!store || typeof store !== "object") return null;
  const known = byRequest.get(store);
  if (known) return known;
  try {
    const { openVault } = await import("@/lib/vault");
    const vault = openVault();
    await vault;
    const l: Ledger = { ...ledgerOf(() => vault), vault };
    byRequest.set(store, l);
    const { after } = await import("next/server");
    after(() => flush(l));
    return l;
  } catch {
    // No signed-in vault here (a public page, a script): the call runs ungated and uncounted.
    return null;
  }
}

function vaultOf(l: Ledger): Promise<Vault> {
  l.vault ??= l.open();
  return l.vault;
}

function stateOf(l: Ledger): Promise<GateState> {
  l.state ??= (async () => {
    const vault = await vaultOf(l);
    const [prefs, research, feedback] = await Promise.all([
      vault.readJson("preferences", preferencesSchema).catch(() => null),
      vault.readJson("research_cache", researchCacheSchema).catch(() => null),
      vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null),
    ]);
    return { off: prefs?.agentsOff ?? [], budgets: prefs?.agentBudgets ?? {}, runs: research?.runs ?? [], feedback };
  })();
  return l.state;
}

/**
 * Before a call: whether the agent may run, and its approved lessons. A
 * switched-off agent or one at its weekly ceiling throws the sentence
 * `mayRun` gives, which every caller already keeps as the reason nothing was
 * read. With no ledger, nothing is held back and no lesson is laid.
 */
export async function beforeCall(tag: CallTag, now = new Date()): Promise<{ lessons: string[] }> {
  const l = await current();
  const agent = agentById(tag.agent);
  if (!l || !agent) return { lessons: [] };
  let state: GateState;
  try {
    state = await stateOf(l);
  } catch {
    return { lessons: [] };
  }
  const gate = mayRun(agent, state.off, state.budgets, runsWithPending(state.runs, l.entries, now), now.toISOString());
  if (!gate.ok) throw new SyncError(gate.sentence, `agent gated: ${agent.id}`);
  return { lessons: lessonsFor(state.feedback, agent.id) };
}

/** After a call: what it cost, or the sentence it failed with, counted on the ledger it ran under. */
export async function afterCall(tag: CallTag, model: string | null, usage: Usage, failed: string | null, escalated = false, now = new Date()): Promise<void> {
  const l = await current();
  if (!l || !agentById(tag.agent) || l.flushed) return;
  l.entries.push({ agent: tag.agent, step: tag.step, subject: (tag.subject ?? tag.agent).slice(0, 80), at: now.toISOString(), model, usage, failed: failed ? failed.slice(0, 300) : null, escalated });
}

/** Keeps the ledger's runs in research_cache, read fresh so the runs the Research Agent kept meanwhile stay. A failed write is a log line, never the work's failure. */
async function flush(l: Ledger): Promise<void> {
  if (l.flushed) return;
  l.flushed = true;
  if (!l.entries.length) return;
  const now = new Date();
  try {
    const vault = await vaultOf(l);
    const file = (await vault.readJson("research_cache", researchCacheSchema).catch(() => null)) ?? EMPTY_RESEARCH_CACHE;
    await vault.writeJson("research_cache", withRuns(file, runsFromCalls(l.entries, now), now));
  } catch (e) {
    console.error(`[agents] runs not kept: ${e instanceof SyncError ? (e.logDetail ?? "write failed") : "unexpected error"} (${l.entries.length} calls)`);
  }
}
