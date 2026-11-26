import type { Route } from "next";
import Link from "next/link";

import { HierarchyMap, LayerMap, Spend, STATUS_TONE, StepLoop, Tile } from "@/components/agents/agent-map";
import { LearningCurve } from "@/components/agents/learning-curve";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { AGENT_RULES, AGENTS, agentById, ceilingOf, DECISIONS, learningCurve, ratingSummary, ROLLOUT, STATUS_LABEL, usd, weekSpend, wrongCounts, type Tier } from "@/lib/agents";
import { tierModelsNow } from "@/lib/models";
import { slotsOn } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { agentFeedbackFor, researchFor, screen } from "@/lib/workspace";

export const metadata = { title: "Agents · Invariant" };

const TRIGGER_WORDS = { schedule: "Scheduled", event: "On an event", request: "On request" } as const;

/**
 * Agents (Hamza, 23 Oct 2026, from "Invariant: Agents, Research Agent and
 * Agent Builder"): how the agents are built (the three layers and the
 * Research Agent's loop), every agent's contract with its last run, this
 * week's estimated cost against its ceiling and how
 * its findings were rated, the learning curve across all of them, and the
 * rules they run under. Each agent opens its own page.
 */
export default async function AgentsPage() {
  const ws = await screen("overview");
  const today = localDay();
  const now = new Date().toISOString();
  const [research, feedback] = await Promise.all([researchFor(ws), agentFeedbackFor(ws)]);
  const slots = slotsOn("agents", ws.shown);
  const on = (s: string) => slots.includes(s as never);
  const runs = research.file.runs;
  const ra = agentById("research_agent")!;
  const curve = learningCurve(feedback.file, null, today);
  const wrong = wrongCounts(feedback.file, null);
  const pending = feedback.file.lessons.filter((l) => l.status === "pending").length;
  const totalWeek = AGENTS.reduce((t, a) => t + weekSpend(runs, a.id, now).usd, 0);
  const tiersNow = await newestTiers(ws);
  const rated = feedback.file.ratings.length;
  const useful = feedback.file.ratings.filter((r) => r.verdict === "useful").length;

  return (
    <>
      <PageHeader title="Agents" subtitle="What reads for you with the AI, how each is built, what it costs and how it is learning from your ratings." fresh={<ScreenFreshness />} />
      <PageBody>
        {research.error ? <p className="card mb-4 px-4 py-3 text-footnote text-danger">{research.error}</p> : null}
        {ws.mode === "demo" ? <p className="mb-4 px-1 text-footnote text-text-secondary">The demo&rsquo;s runs, findings and ratings are fictional, and no agent runs here.</p> : !ws.hasModelKey ? <p className="card mb-4 px-4 py-3 text-footnote">The agents run with the AI, which is not set up on this deployment yet.</p> : null}

        <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Live agents" value={String(AGENTS.filter((a) => a.status === "live" || a.status === "on_agent").length)} sub={`of ${AGENTS.length} in the doc`} />
          <Tile label="This week, estimated" value={usd(totalWeek)} sub="with the AI, list prices" />
          <Tile label="Findings rated" value={String(feedback.file.ratings.length)} sub={rated ? `${Math.round((useful / rated) * 100)}% found useful` : "none yet"} />
          <Tile label="Lessons" value={String(feedback.file.lessons.filter((l) => l.status === "approved").length)} sub={pending ? `${pending} waiting for you` : "approved"} />
        </dl>

        {on("agent_map") ? (
          <section className="mb-8" aria-labelledby="agent-map">
            <h2 id="agent-map" className="section-header mb-2 px-1">
              How the agents are built
            </h2>
            <h3 className="mb-2 px-1 text-subhead font-semibold">The hierarchy</h3>
            <p className="mb-3 px-1 text-footnote text-text-secondary">Every agent on the model each of its steps runs on, the strongest at the top. Each tier moves to its family&rsquo;s newest model as Anthropic releases it, read twice a day, and goes back to the one before for any request the new one refuses.</p>
            <HierarchyMap now={tiersNow} />
            <h3 className="mb-2 mt-5 px-1 text-subhead font-semibold">The layers</h3>
            <LayerMap />
            <h3 className="mb-2 mt-5 px-1 text-subhead font-semibold">The Research Agent&rsquo;s loop</h3>
            <p className="mb-3 px-1 text-footnote text-text-secondary">{ra.purpose} Every task agent above asks it a question; it answers in the same five steps, and every step records what it read, what it kept and what it cost.</p>
            <StepLoop steps={ra.steps} />
          </section>
        ) : null}

        {on("agent_cards") ? (
          <section className="mb-8" aria-labelledby="agent-cards">
            <h2 id="agent-cards" className="section-header mb-2 px-1">
              The agents
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AGENTS.map((a) => {
                const last = runs.find((r) => r.agent === a.id || (a.id === "research_agent" && r.agent === "company_news"));
                const spend = weekSpend(runs, a.id, now);
                const ceiling = ceilingOf(a, ws.preferences.agentBudgets);
                const off = ws.preferences.agentsOff.includes(a.id);
                const r = ratingSummary(feedback.file, a.id);
                return (
                  <li key={a.id} className="min-w-0">
                    <Link href={`/agents/${a.id}` as Route} className="card flex h-full flex-col px-4 py-3 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-subhead font-semibold">{a.name}</span>
                        <StatusPill tone={off ? "warn" : STATUS_TONE[a.status]}>{off ? "Off" : STATUS_LABEL[a.status]}</StatusPill>
                      </p>
                      <p className="mt-1.5 line-clamp-3 flex-1 text-footnote text-text-secondary">{a.purpose}</p>
                      <p className="mt-2 text-caption text-text-tertiary">{a.triggers.map((t) => TRIGGER_WORDS[t.kind]).filter((x, i, all) => all.indexOf(x) === i).join(", ")}</p>
                      <p className="mt-1 text-caption text-text-tertiary">{last ? `Last run ${longDate(last.at.slice(0, 10))}: ${last.sentence}` : a.status === "planned" ? "Not built yet." : a.status === "own_path" ? "Runs on its own path today." : "No run yet."}</p>
                      {ceiling !== null ? <Spend used={spend.usd} ceiling={ceiling} /> : null}
                      {a.rated && r.rated ? <p className="mt-1 text-caption text-text-tertiary">{r.rated} rated, {Math.round(r.share ?? 0)}% useful</p> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {on("agent_curve") ? (
          <section className="mb-8" aria-labelledby="agent-curve">
            <h2 id="agent-curve" className="section-header mb-2 px-1">
              How the agents are learning
            </h2>
            <LearningCurve curve={curve} wrong={wrong} empty="Rate a finding as useful or not, on Company news or an agent's page, and the curve starts here." />
          </section>
        ) : null}

        {on("agent_rules") ? (
          <section className="mb-8" aria-labelledby="agent-rules">
            <h2 id="agent-rules" className="section-header mb-2 px-1">
              The rules every agent follows
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AGENT_RULES.map((r) => (
                <li key={r.title} className="card px-4 py-3">
                  <p className="text-subhead font-semibold">{r.title}</p>
                  <p className="mt-1 text-footnote text-text-secondary">{r.words}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="card px-4 py-3">
                <p className="text-subhead font-semibold">The rollout</p>
                <ol className="mt-2 space-y-1.5 text-footnote">
                  {ROLLOUT.map((r) => (
                    <li key={r.release} className="flex items-start gap-2">
                      <span className="data w-5 shrink-0 text-text-tertiary">{r.release}</span>
                      <span className="flex-1">{r.words}</span>
                      <StatusPill tone={r.state === "built" ? "ok" : r.state === "next" ? "info" : "neutral"}>{r.state === "built" ? "Built" : r.state === "next" ? "Next" : "Later"}</StatusPill>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="card px-4 py-3">
                <p className="text-subhead font-semibold">Decisions taken</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-footnote text-text-secondary">
                  {DECISIONS.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-3 px-1 text-caption text-text-tertiary">Costs are estimates from the tokens your provider reports, at list prices; your provider&rsquo;s bill is the figure that counts. Not investment advice.</p>
          </section>
        ) : null}
      </PageBody>
    </>
  );
}

/** Each model tier as it is now; empty in the demo, without the AI or when the list cannot be read. */
async function newestTiers(ws: Awaited<ReturnType<typeof screen>>): Promise<Partial<Record<Tier, string>>> {
  if (ws.mode === "demo" || ws.provider?.kind !== "anthropic") return {};
  try {
    const { openVault } = await import("@/lib/vault");
    const { providerFor } = await import("@/lib/hosted-model");
    const { newestModelsFor } = await import("@/lib/model-catalog");
    const provider = await providerFor(await openVault());
    const now = tierModelsNow(await newestModelsFor(provider?.kind === "anthropic" ? provider.apiKey : null));
    return { haiku: now.fast, sonnet: now.standard, opus: now.best };
  } catch {
    return {};
  }
}
