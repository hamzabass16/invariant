"use server";

import { revalidatePath } from "next/cache";

import { agentById, agentFeedbackSchema, EMPTY_FEEDBACK, VERDICTS, WRONG_REASONS, withDecision, withLesson, withRating, type WrongReason } from "@/lib/agents";
import { pricedFactsSchema } from "@/lib/research-agent";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type AgentState = { error: string | null };

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

const DEMO = "The demo keeps nothing and runs no agent; in your own app this is kept in your vault and teaches the agent.";

async function guarded(fn: () => Promise<void>, paths: string[] = []): Promise<AgentState> {
  try {
    await fn();
    for (const p of ["/agents", ...paths]) revalidatePath(p);
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[agents] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

async function vaultOrDemo() {
  const ws = await getWorkspace();
  if (ws.mode === "demo") throw new SyncError(DEMO, "agents in demo");
  const { openVault } = await import("@/lib/vault");
  return { ws, vault: await openVault() };
}

function agentOf(form: FormData) {
  const a = agentById(str(form, "agent"));
  if (!a) throw new SyncError("No such agent.", "unknown agent");
  return a;
}

/** One finding rated useful or not, with what was wrong and a note; rating it again replaces the rating. */
export async function rateFindingAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const agent = agentOf(form);
    const verdict = str(form, "verdict");
    if (!(VERDICTS as readonly string[]).includes(verdict)) throw new SyncError("Choose useful or not useful.", "bad verdict");
    const reasons = form.getAll("reason").map(String).filter((r): r is WrongReason => (WRONG_REASONS as readonly string[]).includes(r));
    const note = str(form, "note").slice(0, 500) || null;
    if (verdict === "not_useful" && !reasons.length && !note) throw new SyncError("Tick what was wrong, or say it in a line, so the agent can learn from it.", "no reason");
    const { ws, vault } = await vaultOrDemo();
    const file = (await vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null)) ?? EMPTY_FEEDBACK;
    await vault.writeJson("agent_feedback", withRating(file, { agent: agent.id, target: str(form, "target").slice(0, 80), subject: str(form, "subject").slice(0, 80), title: str(form, "title").slice(0, 200), at: new Date().toISOString(), verdict: verdict as "useful" | "not_useful", reasons, note }));
    // The agent, its step and the reasons alone, counted without a name (lib/improvements.ts); never the finding, the note or the company.
    const [{ ratingSignals }, { recordSignals }] = await Promise.all([import("@/lib/improvements"), import("@/lib/improvements-run")]);
    await recordSignals(ws.operator.email, ws.preferences, false, ratingSignals({ agent: agent.id, verdict, reasons }));
  }, ["/after-close", `/agents/${str(form, "agent")}`]);
}

/** A lesson proposed from the ratings not yet behind one, on the person's model or from their own words; pending until approved. */
export async function proposeLessonAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const agent = agentOf(form);
    const { vault } = await vaultOrDemo();
    const { proposeLessonInto } = await import("@/lib/research-agent-run");
    const r = await proposeLessonInto(vault, agent.id, new Date());
    if (!r.ok) throw new SyncError(r.sentence, "no lesson");
  }, [`/agents/${str(form, "agent")}`]);
}

/** A lesson in the person's own words, approved as written. */
export async function addLessonAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const agent = agentOf(form);
    const text = str(form, "text");
    if (text.length < 3) throw new SyncError("Write the lesson in a line.", "short lesson");
    const { vault } = await vaultOrDemo();
    const at = new Date().toISOString();
    const file = (await vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null)) ?? EMPTY_FEEDBACK;
    const added = withLesson(file, { agent: agent.id, text, from: [], by: "you", at });
    const id = added.lessons.find((l) => l.agent === agent.id)!.id;
    await vault.writeJson("agent_feedback", withDecision(added, id, "approved", at));
  }, [`/agents/${str(form, "agent")}`]);
}

/** A lesson approved, so it rides every later brief of its agent, or denied, so it is not proposed again. */
export async function decideLessonAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const status = str(form, "status");
    if (status !== "approved" && status !== "denied") throw new SyncError("Approve or deny.", "bad status");
    const { vault } = await vaultOrDemo();
    const file = (await vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null)) ?? EMPTY_FEEDBACK;
    if (!file.lessons.some((l) => l.id === str(form, "id"))) throw new SyncError("That lesson is no longer there.", "lesson gone");
    await vault.writeJson("agent_feedback", withDecision(file, str(form, "id"), status, new Date().toISOString()));
  }, [`/agents/${str(form, "agent")}`]);
}

/** An agent run now, on the AI: company news for the five companies read longest ago, or one thesis due a hunt. */
export async function runAgentAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const agent = agentOf(form);
    const { vault } = await vaultOrDemo();
    const now = new Date();
    if (agent.id === "company_news" || agent.id === "research_agent") {
      const { companyNewsResearchInto } = await import("@/lib/research-agent-run");
      const run = await companyNewsResearchInto(vault, now, 5, null, true);
      if (!run) throw new SyncError("No listed holding or watchlist company to read.", "nothing to read");
      if (run.problem || (!run.read && run.sentence)) throw new SyncError(run.sentence, "research not run");
      return;
    }
    if (agent.id === "thesis_hunter") {
      const { huntThesesInto } = await import("@/lib/thesis-hunter-run");
      const run = await huntThesesInto(vault, now, 1);
      if (!run) throw new SyncError("No thesis is due a hunt this week; Hunt now on a thesis hunts it at once.", "nothing due");
      if (run.problem || (!run.hunted && run.sentence)) throw new SyncError(run.sentence, "hunter not run");
      return;
    }
    if (agent.id === "calendar_agent") {
      const { findCalendarEventsInto } = await import("@/lib/calendar-agent-run");
      const run = await findCalendarEventsInto(vault, now, true);
      if (run?.problem) throw new SyncError(run.problem, "calendar agent not run");
      return;
    }
    if (agent.id === "macro_reports") {
      const { readMacroReportsInto } = await import("@/lib/macro-report-run");
      const run = await readMacroReportsInto(vault, now, true);
      if (run?.problem) throw new SyncError(run.problem, "event reports not run");
      return;
    }
    if (agent.id === "planner") {
      const { planDayInto, runPlanExtrasInto } = await import("@/lib/agents-run");
      const run = await planDayInto(vault, now, true);
      if (run?.problem) throw new SyncError(run.sentence, "planner not run");
      await runPlanExtrasInto(vault, now);
      return;
    }
    if (agent.id === "lenses") {
      const { lensReadingsInto } = await import("@/lib/agents-run");
      const run = await lensReadingsInto(vault, now, true);
      if (run?.problem) throw new SyncError(run.sentence, "lenses not run");
      return;
    }
    if (agent.id === "agent_builder") {
      const { runCustomAgentsInto } = await import("@/lib/agents-run");
      const run = await runCustomAgentsInto(vault, now);
      if (!run) throw new SyncError("None of your agents is on and due; Run now on an agent below runs it at once.", "no custom due");
      if (run.problem) throw new SyncError(run.sentence, "custom not run");
      return;
    }
    throw new SyncError("This agent runs where it is placed, not from here.", "no run now");
  }, ["/after-close", "/calendar", `/agents/${str(form, "agent")}`]);
}

/** An agent switched on or off; off, it runs nowhere until switched on again. */
export async function switchAgentAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const agent = agentOf(form);
    const ws = await getWorkspace();
    const on = str(form, "on") === "1";
    const off = ws.preferences.agentsOff.filter((x) => x !== agent.id);
    await savePreferences({ ...ws.preferences, agentsOff: on ? off : [...off, agent.id] });
  }, [`/agents/${str(form, "agent")}`]);
}

/** The weekly ceiling for an agent in US dollars on the person's key; empty puts back the agent's own. */
export async function budgetAgentAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const agent = agentOf(form);
    const ws = await getWorkspace();
    const raw = str(form, "usd").replace(/^\$/, "");
    const budgets = { ...ws.preferences.agentBudgets };
    if (raw === "") delete budgets[agent.id];
    else {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 1000) throw new SyncError("A ceiling is a number of US dollars a week, from 0 to 1,000.", "bad budget");
      budgets[agent.id] = Math.round(v * 100) / 100;
    }
    await savePreferences({ ...ws.preferences, agentBudgets: budgets });
  }, [`/agents/${str(form, "agent")}`]);
}

/** What the price assumes against the thesis, from the facts the thesis page computed, on the AI. */
export async function pricedInAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(
    async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(str(form, "facts"));
      } catch {
        throw new SyncError("The page's figures could not be read; reload it and ask again.", "facts not json");
      }
      const facts = pricedFactsSchema.safeParse(raw);
      if (!facts.success) throw new SyncError("The page's figures could not be read; reload it and ask again.", "facts invalid");
      const symbol = facts.data.symbol;
      const { vault } = await vaultOrDemo();
      const { pricedInInto } = await import("@/lib/research-agent-run");
      const r = await pricedInInto(vault, facts.data, new Date());
      if (!r.ok) throw new SyncError(r.sentence, "priced in not read");
      revalidatePath(`/theses/${encodeURIComponent(symbol)}`);
    },
    ["/theses"],
  );
}

// ---------------------------------------------------------------------------
// The lens agents and the Agent Builder (Hamza, 4 Nov 2026)

/** A lens switched on or off; on, it reads each morning's findings after the Research Agent. */
export async function switchLensAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const { LENS_IDS } = await import("@/lib/lens-agents");
    const lens = str(form, "lens");
    if (!(LENS_IDS as readonly string[]).includes(lens)) throw new SyncError("No such lens.", "bad lens");
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError(DEMO, "lens in demo");
    const rest = ws.preferences.lensAgents.filter((l) => l !== lens);
    await savePreferences({ ...ws.preferences, lensAgents: str(form, "on") === "1" ? [...rest, lens] : rest });
  }, ["/agents/lenses"]);
}

/** The person's words compiled into an agent, kept as a draft to test. */
export async function buildAgentAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const { vault } = await vaultOrDemo();
    const { compileCustomAgentInto } = await import("@/lib/agents-run");
    const r = await compileCustomAgentInto(vault, str(form, "words"), new Date());
    if (!r.ok) throw new SyncError(r.sentence, "agent not compiled");
  }, ["/agents/agent_builder"]);
}

/** One of the person's agents run on the past week, for them to read before switching it on; or run now, once on. */
export async function testAgentAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const { vault } = await vaultOrDemo();
    const id = str(form, "id");
    const { testCustomAgentInto, runCustomAgentsInto } = await import("@/lib/agents-run");
    if (str(form, "mode") === "run") {
      const r = await runCustomAgentsInto(vault, new Date(), [id]);
      if (!r) throw new SyncError("Turn the agent on first.", "custom not on");
      if (r.problem) throw new SyncError(r.sentence, "custom not run");
      return;
    }
    const r = await testCustomAgentInto(vault, id, new Date());
    if (!r.ok) throw new SyncError(r.sentence, "agent not tested");
  }, ["/agents/agent_builder", "/notifications"]);
}

/** One of the person's agents switched on (only once tested), off, or removed with its findings. */
export async function setAgentAction(_prev: AgentState, form: FormData): Promise<AgentState> {
  return guarded(async () => {
    const { vault } = await vaultOrDemo();
    const { customAgentsFileSchema, withAgent, withoutAgent } = await import("@/lib/custom-agents");
    const { keepCustomNotices } = await import("@/lib/agents-run");
    const id = str(form, "id");
    const to = str(form, "to");
    const now = new Date();
    const file = await vault.readJson("custom_agents", customAgentsFileSchema).catch(() => null);
    const a = file?.agents.find((x) => x.id === id);
    if (!file || !a) throw new SyncError("That agent is no longer there.", "custom gone");
    let next = file;
    if (to === "remove") next = withoutAgent(file, id, now);
    else if (to === "on") {
      if (!a.test) throw new SyncError("Test it on the past week first, and read what it found.", "custom untested");
      next = withAgent(file, id, (x) => ({ ...x, status: "on" }), now);
    } else if (to === "off") next = withAgent(file, id, (x) => ({ ...x, status: "off" }), now);
    else throw new SyncError("Turn on, off or remove.", "bad custom change");
    await vault.writeJson("custom_agents", next);
    await keepCustomNotices(vault, next, now);
  }, ["/agents/agent_builder", "/notifications"]);
}
