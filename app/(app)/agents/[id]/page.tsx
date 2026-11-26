import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Spend, STATUS_TONE, StepLoop, Tile, TierChip } from "@/components/agents/agent-map";
import { FindingCard } from "@/components/agents/finding-card";
import { LearningCurve } from "@/components/agents/learning-curve";
import { RateFinding } from "@/components/agents/rate-finding";
import { ActionForm } from "@/components/app/action-form";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { agedCalls, agentById, ceilingOf, learningCurve, ratingFor, ratingSummary, STATUS_LABEL, unlearned, usd, weekSpend, wrongCounts, type AgedCall, type Call } from "@/lib/agents";
import { loadCloses } from "@/lib/markets-feed";
import { allFindings, PRICED_LABEL, type Finding, type ResearchCache } from "@/lib/research-agent";
import { STANCE_LABEL, type Find } from "@/lib/thesis-hunter";
import { localDay, longDate } from "@/lib/time";
import { CUSTOM_STATUS_LABEL, MAX_CUSTOM_AGENTS, MAX_WORDS, specWords, type CustomAgent } from "@/lib/custom-agents";
import { LEAN_LABEL, LENS_CREED, LENS_IDS, LENS_LABEL, type LensId } from "@/lib/lens-agents";
import { PLAN_AGENT_LABEL, planFor, type DayPlan } from "@/lib/planner";
import { agentFeedbackFor, customAgentsFor, researchFor, screen, thesisHunterFor } from "@/lib/workspace";

import { addLessonAction, budgetAgentAction, buildAgentAction, decideLessonAction, proposeLessonAction, runAgentAction, setAgentAction, switchAgentAction, switchLensAction, testAgentAction } from "@/app/(app)/agents/actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${agentById(id)?.name ?? "Agent"} · Agents · Invariant` };
}

const TRIGGER_WORDS = { schedule: "Scheduled", event: "On an event", request: "On request" } as const;
const RUNNABLE = new Set(["research_agent", "company_news", "thesis_hunter", "calendar_agent", "planner", "lenses", "agent_builder"]);
const RUN_NOTE: Record<string, string> = { planner: "With the AI; plans today again and runs what it adds.", lenses: "With the AI; each lens on reads today\u2019s findings.", agent_builder: "With the AI; runs your agents that are on and due." };
const LEAN_TONE = { favours: "ok", against: "warn", neither: "neutral" } as const;
const CUSTOM_TONE = { draft: "neutral", tested: "info", on: "ok", off: "warn" } as const;
const RUNS_SHOWN = 15;
const AGED_TONE = { well: "ok", badly: "warn", even: "neutral" } as const;
const AGED_WORDS = { well: "Aged well", badly: "Aged badly", even: "Even" } as const;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/**
 * One agent (Hamza, 23 Oct 2026): its contract in the agents doc's terms
 * (§2.2), its steps with the model tier of each, what a good answer is, its
 * runs with what each step read, kept and cost, the findings to rate, how
 * its calls aged against SPY, its learning curve and the lessons from the
 * ratings, which ride its brief only once the person approves them; and Run
 * now, the off switch and the weekly ceiling.
 */
export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = agentById(id);
  if (!a) notFound();
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  const today = localDay();
  const now = new Date().toISOString();
  const [research, feedback, hunter, custom] = await Promise.all([researchFor(ws), agentFeedbackFor(ws), a.id === "thesis_hunter" ? thesisHunterFor(ws) : null, a.id === "agent_builder" ? customAgentsFor(ws) : null]);
  const ratedAs = a.id === "research_agent" ? "company_news" : a.id;
  const runs = research.file.runs.filter((r) => r.agent === a.id || (a.id === "research_agent" && r.agent === "company_news"));
  const spend = weekSpend(research.file.runs, a.id === "research_agent" ? "company_news" : a.id, now);
  const ceiling = ceilingOf(a, ws.preferences.agentBudgets);
  const off = ws.preferences.agentsOff.includes(a.id);
  const curve = learningCurve(feedback.file, ratedAs, today);
  const wrong = wrongCounts(feedback.file, ratedAs);
  const summary = ratingSummary(feedback.file, ratedAs);
  const lessons = feedback.file.lessons.filter((l) => l.agent === ratedAs);
  const waiting = unlearned(feedback.file, ratedAs).length;

  // Findings to rate, and the calls that took a side, for how they aged.
  const findings: Finding[] = a.id === "company_news" || a.id === "research_agent" ? Object.values(research.file.companies).flatMap((c) => c.findings).sort((x, y) => y.day.localeCompare(x.day)) : [];
  const finds: { key: string; f: Find }[] = hunter ? Object.entries(hunter.file.subjects).flatMap(([key, h]) => h.finds.filter((f) => !f.dismissed).map((f) => ({ key, f }))).sort((x, y) => y.f.found.localeCompare(x.f.found)).slice(0, 12) : [];
  const calls: Call[] =
    a.id === "company_news" || a.id === "research_agent"
      ? Object.values(research.file.companies).flatMap((c) => allFindings(c)).filter((f) => f.stance !== "update").map((f) => ({ id: f.id, agent: "company_news", symbol: f.symbol, day: f.day, stance: f.stance as "backs" | "challenges", title: f.headline }))
      : hunter
        ? Object.entries(hunter.file.subjects).filter(([k]) => k.startsWith("stock:")).flatMap(([k, h]) => h.finds.filter((f) => f.stance !== "update").map((f) => ({ id: f.id, agent: "thesis_hunter", symbol: k.slice(6), day: f.found, stance: f.stance as "backs" | "challenges", title: f.title })))
        : [];
  let aged: AgedCall[] = [];
  if (calls.length) {
    const symbols = [...new Set(calls.map((c) => c.symbol.toUpperCase()))].slice(0, 30);
    const closes = await loadCloses([...symbols, "SPY"].join(","), today, "budget", 200).catch(() => null);
    if (closes) aged = agedCalls(calls, Object.fromEntries(Object.entries(closes.series).map(([k, v]) => [k.toUpperCase(), v.map((p) => ({ date: p.date, close: p.value }))])), today);
  }
  const agedWell = aged.filter((c) => c.aged === "well").length;

  return (
    <>
      <PageHeader title={a.name} subtitle={a.purpose} fresh={<ScreenFreshness />} />
      <PageBody>
        <p className="mb-4 flex flex-wrap items-center gap-2 px-1 text-footnote">
          <Link href="/agents" className="text-accent-text">
            Agents
          </Link>
          <span className="text-text-tertiary">/</span>
          <StatusPill tone={off ? "warn" : STATUS_TONE[a.status]}>{off ? "Off" : STATUS_LABEL[a.status]}</StatusPill>
          {demo ? <span className="text-text-tertiary">Fictional in the demo; nothing runs here.</span> : null}
        </p>

        <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Runs kept" value={String(runs.length)} sub={runs[0] ? `last ${longDate(runs[0].at.slice(0, 10))}` : "none yet"} />
          <Tile label="This week, estimated" value={usd(spend.usd)} sub={ceiling !== null ? `of a ${usd(ceiling)} ceiling` : "no ceiling set"} />
          <Tile label="Found useful" value={summary.share === null ? "n/a" : `${Math.round(summary.share)}%`} sub={`${summary.rated} rated`} />
          <Tile label="Calls aged well" value={aged.length ? `${agedWell} of ${aged.length}` : "n/a"} sub={`against SPY, ${aged.length ? "after five days or more" : "none five days old yet"}`} />
        </dl>

        {a.shared ? (
          <section className="card mb-8 px-4 py-3" aria-label="Controls">
            <p className="text-footnote text-text-secondary">Run once for everyone on public pages, so it has no switch or ceiling of yours and costs your allowance nothing.</p>
            <p className="mt-2 text-caption text-text-tertiary">{a.budget}</p>
          </section>
        ) : a.status !== "planned" ? (
          <section className="card mb-8 px-4 py-3" aria-label="Controls">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              {RUNNABLE.has(a.id) ? (
                <ActionForm action={runAgentAction} label="Run now" pendingLabel="Running" doneLabel="Run" size="sm" note={RUN_NOTE[a.id] ?? "With the AI; a pass over five companies takes up to a minute."}>
                  <input type="hidden" name="agent" value={a.id} />
                </ActionForm>
              ) : null}
              <ActionForm action={switchAgentAction} label={off ? "Turn on" : "Turn off"} variant="secondary" size="sm" doneLabel={off ? "On" : "Off"}>
                <input type="hidden" name="agent" value={a.id} />
                <input type="hidden" name="on" value={off ? "1" : "0"} />
              </ActionForm>
              <ActionForm action={budgetAgentAction} label="Set ceiling" variant="ghost" size="sm" doneLabel="Set">
                <input type="hidden" name="agent" value={a.id} />
                <label className="mr-2 inline-flex items-center gap-2 text-footnote text-text-secondary">
                  Weekly ceiling, US$
                  <input name="usd" inputMode="decimal" defaultValue={ws.preferences.agentBudgets[a.id] ?? ""} placeholder={a.weeklyUsd !== null ? String(a.weeklyUsd) : ""} className="data h-8 w-20 rounded-[8px] bg-surface-2 px-2 text-footnote" />
                </label>
              </ActionForm>
            </div>
            {ceiling !== null ? <Spend used={spend.usd} ceiling={ceiling} /> : null}
            <p className="mt-2 text-caption text-text-tertiary">{a.budget}</p>
          </section>
        ) : null}

        {a.id === "planner" ? <PlanSection plan={research.file.plan} today={today} /> : null}
        {a.id === "lenses" ? <LensSection on={ws.preferences.lensAgents} research={research.file} demo={demo} /> : null}
        {a.id === "agent_builder" ? <BuilderSection agents={custom?.file.agents ?? []} demo={demo} /> : null}

        <section className="mb-8" aria-labelledby="contract">
          <h2 id="contract" className="section-header mb-2 px-1">
            How it is built
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Block title="What it reads">
              <ul className="list-disc space-y-0.5 pl-4">
                {a.inputs.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Block>
            <Block title="Where it looks">
              <ul className="list-disc space-y-0.5 pl-4">
                {a.sources.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Block>
            <Block title="Its brief">{a.brief}</Block>
            <Block title="When it runs">
              <ul className="space-y-0.5">
                {a.triggers.map((t) => (
                  <li key={t.words}>
                    <span className="text-text-tertiary">{TRIGGER_WORDS[t.kind]}:</span> {t.words}
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="Where its output lands">
              <ul className="space-y-0.5">
                {a.placement.map((p) => (
                  <li key={p.href + p.label}>
                    <Link href={p.href as Route} className="text-accent-text">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title="What a good answer is">
              <ul className="list-disc space-y-0.5 pl-4">
                {a.rubric.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Block>
          </div>
          {a.steps.length ? (
            <div className="mt-4">
              <h3 className="mb-2 px-1 text-subhead font-semibold">Its steps</h3>
              <StepLoop steps={a.steps} back={a.steps.some((s) => s.id === "gather")} />
            </div>
          ) : null}
          {a.next ? <p className="mt-3 px-1 text-footnote text-text-secondary">{a.next}</p> : null}
          <p className="mt-3 px-1 text-caption text-text-tertiary">
            Kept in your vault as {a.vault.join(", ") || "nothing of its own"}. Code: {a.code.join(", ")}.
          </p>
        </section>

        {findings.length ? (
          <section className="mb-8" aria-labelledby="findings">
            <h2 id="findings" className="section-header mb-2 px-1">
              Its latest findings · {findings.length}
            </h2>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {findings.map((f) => (
                <FindingCard key={f.id} f={f} agent="company_news" rating={ratingFor(feedback.file, "company_news", f.id)} editable showSymbol />
              ))}
            </ul>
          </section>
        ) : null}

        {finds.length ? (
          <section className="mb-8" aria-labelledby="finds">
            <h2 id="finds" className="section-header mb-2 px-1">
              Its latest finds · {finds.length}
            </h2>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {finds.map(({ key, f }) => (
                <li key={`${key}-${f.id}`} className="card min-w-0 px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="data text-footnote font-semibold">{key.replace(/^(stock|market):/, "")}</span>
                    <StatusPill tone={f.stance === "backs" ? "ok" : f.stance === "challenges" ? "warn" : "info"}>{STANCE_LABEL[f.stance]}</StatusPill>
                    {f.pillar ? <StatusPill tone="neutral">{f.pillar}</StatusPill> : null}
                    <span className="ml-auto text-caption text-text-tertiary">{longDate(f.found)}</span>
                  </p>
                  <p className="mt-2 text-subhead font-semibold">{f.title}</p>
                  <p className="mt-1 text-footnote text-text-secondary">{f.summary}</p>
                  <p className="mt-1 text-caption text-text-tertiary">{f.sourceUrl ? <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="text-accent-text">{f.source}</a> : f.source}</p>
                  <RateFinding agent="thesis_hunter" target={f.id} subject={key} title={f.title} rating={ratingFor(feedback.file, "thesis_hunter", f.id)} editable />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {a.id === "priced_in" ? (
          <section className="mb-8" aria-labelledby="readings">
            <h2 id="readings" className="section-header mb-2 px-1">
              Its readings
            </h2>
            {Object.values(research.file.pricedIn).length ? (
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {Object.values(research.file.pricedIn).map((p) => (
                  <li key={p.symbol} className="card px-4 py-3">
                    <p className="flex items-center gap-2">
                      <Link href={`/theses/${encodeURIComponent(p.symbol)}#priced-in` as Route} className="data font-semibold text-accent-text">
                        {p.symbol}
                      </Link>
                      <span className="ml-auto text-caption text-text-tertiary">{longDate(p.day)}</span>
                    </p>
                    <p className="mt-1 text-footnote text-text-secondary">{p.summary}</p>
                    <p className="mt-2 flex flex-wrap gap-2">
                      {p.pillars.map((x) => (
                        <StatusPill key={x.id} tone={x.verdict === "not_priced" ? "ok" : x.verdict === "bet_against" ? "warn" : "neutral"}>
                          {x.pillar}: {PRICED_LABEL[x.verdict].toLowerCase()}
                        </StatusPill>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card px-4 py-3 text-footnote text-text-secondary">Ask it on a stock thesis, under What the price assumes.</p>
            )}
          </section>
        ) : null}

        {a.rated ? (
          <section className="mb-8" aria-labelledby="learning">
            <h2 id="learning" className="section-header mb-2 px-1">
              How it is learning
            </h2>
            <LearningCurve curve={curve} wrong={wrong} empty="Rate its findings as useful or not, and say what was wrong; the curve starts with the first rating." />
            {aged.length ? (
              <div className="card mt-3 px-4 py-3">
                <p className="text-subhead font-semibold">How its calls aged</p>
                <p className="mt-1 text-caption text-text-tertiary">Each finding that backed or challenged a thesis, the stock&rsquo;s return from its day to the last close against SPY&rsquo;s. A backing call aged well when the stock beat SPY, a challenge when it lagged. Context for the agent, never a verdict on the thesis.</p>
                <ul className="mt-2 divide-y divide-hairline">
                  {aged.slice(0, 12).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-footnote">
                      <span className="data w-14 shrink-0 font-semibold">{c.symbol}</span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <span className="data text-text-secondary">
                        {pct(c.stockPct)} against SPY {pct(c.spyPct)}, {c.days} days
                      </span>
                      <StatusPill tone={AGED_TONE[c.aged]}>{AGED_WORDS[c.aged]}</StatusPill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {a.rated ? (
          <section className="mb-8" aria-labelledby="lessons">
            <h2 id="lessons" className="section-header mb-2 px-1">
              Lessons from your ratings
            </h2>
            <p className="mb-3 px-1 text-footnote text-text-secondary">A lesson is one instruction added to the agent&rsquo;s brief. It is proposed from the findings you rated not useful, and rides every later run only once you approve it.</p>
            <div className="card mb-3 flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3">
              <ActionForm action={proposeLessonAction} label="Propose a lesson" variant="secondary" size="sm" doneLabel="Proposed" note="From your ratings, with the AI when you have one.">
                <input type="hidden" name="agent" value={ratedAs} />
              </ActionForm>
              <span className="text-caption text-text-tertiary">{waiting ? `${waiting} rating${waiting === 1 ? "" : "s"} not behind a lesson yet.` : "Every rating not useful is behind a lesson already."}</span>
              <ActionForm action={addLessonAction} label="Add" variant="ghost" size="sm" doneLabel="Added" className="w-full">
                <input type="hidden" name="agent" value={ratedAs} />
                <label className="mb-2 block text-footnote text-text-secondary">
                  Or write one yourself
                  <input name="text" maxLength={400} placeholder="Leave out analysts' price targets." className="mt-1 h-9 w-full rounded-[10px] bg-surface-2 px-3 text-footnote" />
                </label>
              </ActionForm>
            </div>
            {lessons.length ? (
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {lessons.map((l) => (
                  <li key={l.id} className="card px-4 py-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={l.status === "approved" ? "ok" : l.status === "pending" ? "info" : "neutral"}>{l.status === "approved" ? "In the brief" : l.status === "pending" ? "Waiting for you" : "Denied"}</StatusPill>
                      <span className="text-caption text-text-tertiary">
                        {l.by === "model" ? "Proposed by the AI" : "Yours"}, {longDate(l.at.slice(0, 10))}
                        {l.from.length ? `, from ${l.from.length} rating${l.from.length === 1 ? "" : "s"}` : ""}
                      </span>
                    </p>
                    <p className="mt-2 text-footnote">{l.text}</p>
                    {l.status !== "denied" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {l.status === "pending" ? (
                          <ActionForm action={decideLessonAction} label="Approve" size="sm" doneLabel="Approved">
                            <input type="hidden" name="agent" value={ratedAs} />
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="status" value="approved" />
                          </ActionForm>
                        ) : null}
                        <ActionForm action={decideLessonAction} label={l.status === "approved" ? "Take out of the brief" : "Deny"} variant="ghost" size="sm" doneLabel="Done">
                          <input type="hidden" name="agent" value={ratedAs} />
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value="denied" />
                        </ActionForm>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {runs.length ? (
          <section className="mb-8" aria-labelledby="runs">
            <h2 id="runs" className="section-header mb-2 px-1">
              Its runs
            </h2>
            <ul className="flex flex-col gap-2">
              {runs.slice(0, RUNS_SHOWN).map((r) => (
                <li key={r.id}>
                  <details className="card px-4 py-2.5">
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 text-footnote">
                      <span className="data w-24 shrink-0 text-text-tertiary">{longDate(r.at.slice(0, 10))}</span>
                      <span className="data w-16 shrink-0 font-semibold">{r.subject.replace(/^(stock|market):/, "")}</span>
                      <span className="min-w-0 flex-1 text-text-secondary">{r.sentence}</span>
                      <StatusPill tone={r.status === "done" ? "ok" : r.status === "failed" ? "warn" : "neutral"}>{r.status === "done" ? "Done" : r.status === "failed" ? "Failed" : "Skipped"}</StatusPill>
                      <span className="data text-text-tertiary">{usd(r.costUsd)}</span>
                    </summary>
                    {r.steps.length ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-caption">
                          <thead className="text-text-tertiary">
                            <tr>
                              <th className="py-1 pr-3 text-left font-medium">Step</th>
                              <th className="py-1 pr-3 text-left font-medium">Model</th>
                              <th className="py-1 pr-3 text-right font-medium">Read</th>
                              <th className="py-1 pr-3 text-right font-medium">Kept</th>
                              <th className="py-1 pr-3 text-right font-medium">Tokens in, out</th>
                              <th className="py-1 pr-3 text-right font-medium">Cost</th>
                              <th className="py-1 text-left font-medium">Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.steps.map((s, i) => (
                              <tr key={`${s.id}-${i}`} className="border-t border-hairline">
                                <td className="py-1 pr-3 capitalize">{s.id}</td>
                                <td className="py-1 pr-3">{s.model ? <TierChip tier={/haiku/.test(s.model) ? "haiku" : /opus/.test(s.model) ? "opus" : /sonnet/.test(s.model) ? "sonnet" : "none"} /> : <span className="text-text-tertiary">App</span>}</td>
                                <td className="data py-1 pr-3 text-right">{s.read}</td>
                                <td className="data py-1 pr-3 text-right">{s.kept}</td>
                                <td className="data py-1 pr-3 text-right">{s.model ? `${s.tokensIn.toLocaleString("en-US")}, ${s.tokensOut.toLocaleString("en-US")}${s.searches ? `, ${s.searches} searches` : ""}` : ""}</td>
                                <td className="data py-1 pr-3 text-right">{s.model ? usd(s.costUsd) : ""}</td>
                                <td className="py-1 text-text-tertiary">{s.note ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-caption text-text-tertiary">Costs are estimates from the tokens the model service reports, at list prices.</p>
          </section>
        ) : null}
      </PageBody>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-subhead font-semibold">{title}</p>
      <div className="mt-1.5 text-footnote text-text-secondary">{children}</div>
    </div>
  );
}

/** Today's plan from the daily planner: what each agent does first and why, what it adds outside the schedule, and what the app dropped. */
function PlanSection({ plan, today }: { plan: DayPlan | null; today: string }) {
  const now = planFor(plan, today);
  return (
    <section className="mb-8" aria-labelledby="plan">
      <h2 id="plan" className="section-header mb-2 px-1">
        Today&rsquo;s plan
      </h2>
      {now ? (
        <>
          <p className="mb-3 px-1 text-footnote text-text-secondary">
            {now.sentence}
            {now.note ? ` ${now.note}` : ""}
          </p>
          {now.tasks.length ? (
            <ol className="card divide-y divide-hairline px-4">
              {now.tasks.map((t, i) => (
                <li key={`${t.agent}-${t.subject}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-footnote">
                  <span className="data w-6 shrink-0 text-text-tertiary">{i + 1}</span>
                  <span className="w-28 shrink-0 text-text-secondary">{PLAN_AGENT_LABEL[t.agent]}</span>
                  <span className="data w-24 shrink-0 font-semibold">{t.subject.replace(/^(stock|market):/, "")}</span>
                  <span className="min-w-0 flex-1 text-text-secondary">{t.why}</span>
                  {t.extra ? <StatusPill tone="info">Added today</StatusPill> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {now.dropped.length ? (
            <details className="card mt-3 px-4 py-2.5">
              <summary className="cursor-pointer text-footnote text-text-secondary">Left out by the app&rsquo;s check · {now.dropped.length}</summary>
              <ul className="mt-2 space-y-1 text-caption text-text-tertiary">
                {now.dropped.map((d, i) => (
                  <li key={`${d.agent}-${d.subject}-${i}`}>
                    <span className="data">{d.subject}</span>: {d.why}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <p className="card px-4 py-3 text-footnote text-text-secondary">{plan?.day === today && plan.failed ? plan.sentence : "Not planned yet today. It plans each morning before the Research Agent, or on Run now."}</p>
      )}
      <p className="mt-2 px-1 text-caption text-text-tertiary">The plan orders what is due and may add at most two runs per agent; the switches and ceilings above still decide whether each runs.</p>
    </section>
  );
}

/** The three lenses, each switched on or off, and what each read in today's findings. */
function LensSection({ on, research, demo }: { on: readonly string[]; research: ResearchCache; demo: boolean }) {
  const byId = new Map(Object.values(research.companies).flatMap((c) => allFindings(c)).map((f) => [f.id, f]));
  return (
    <section className="mb-8" aria-labelledby="lenses">
      <h2 id="lenses" className="section-header mb-2 px-1">
        The lenses
      </h2>
      <p className="mb-3 px-1 text-footnote text-text-secondary">Each reads the Research Agent&rsquo;s findings as one way of investing would, beside your own methodology. A second view, never a verdict.</p>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {LENS_IDS.map((lens: LensId) => {
          const isOn = on.includes(lens);
          const r = research.lenses[lens];
          return (
            <li key={lens} className="card min-w-0 px-4 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-subhead font-semibold">{LENS_LABEL[lens]}</span>
                <StatusPill tone={isOn ? "ok" : "neutral"}>{isOn ? "On" : "Off"}</StatusPill>
                {!demo ? (
                  <ActionForm action={switchLensAction} label={isOn ? "Turn off" : "Turn on"} variant={isOn ? "ghost" : "secondary"} size="sm" doneLabel={isOn ? "Off" : "On"} className="ml-auto">
                    <input type="hidden" name="lens" value={lens} />
                    <input type="hidden" name="on" value={isOn ? "0" : "1"} />
                  </ActionForm>
                ) : null}
              </p>
              <p className="mt-1.5 text-caption text-text-tertiary">{LENS_CREED[lens]}</p>
              {r ? (
                <>
                  <p className="mt-3 text-footnote text-text-secondary">
                    {longDate(r.day)}: {r.sentence}
                  </p>
                  <ul className="mt-2 divide-y divide-hairline">
                    {r.readings.map((x) => (
                      <li key={x.finding} className="py-2 text-footnote">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="data font-semibold">{x.symbol}</span>
                          <StatusPill tone={LEAN_TONE[x.leans]}>{LEAN_LABEL[x.leans]}</StatusPill>
                        </p>
                        {byId.get(x.finding) ? <p className="mt-1 text-caption text-text-tertiary">{byId.get(x.finding)!.headline}</p> : null}
                        <p className="mt-1 text-text-secondary">{x.reading}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-caption text-text-tertiary">{isOn ? "Reads the next morning\u2019s findings." : "Nothing read yet."}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The Agent Builder: words in, an agent out, tested on the past week before it is switched on. */
function BuilderSection({ agents, demo }: { agents: readonly CustomAgent[]; demo: boolean }) {
  return (
    <section className="mb-8" aria-labelledby="builder">
      <h2 id="builder" className="section-header mb-2 px-1">
        Your agents · {agents.length} of {MAX_CUSTOM_AGENTS}
      </h2>
      {!demo && agents.length < MAX_CUSTOM_AGENTS ? (
        <ActionForm action={buildAgentAction} label="Build it" pendingLabel="Building" doneLabel="Built" size="sm" note="The AI compiles your words; then test it on the past week." className="card mb-3 px-4 py-3">
          <label className="mb-2 block text-footnote text-text-secondary">
            Say what to look for, in your own words
            <textarea name="words" rows={3} maxLength={MAX_WORDS} required placeholder="Watch my holdings for any change in management or in the board, every morning." className="mt-1 block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body" />
          </label>
        </ActionForm>
      ) : demo ? (
        <p className="card mb-3 px-4 py-3 text-footnote text-text-secondary">In your own app you say what to look for in a line; the app compiles it into an agent, tests it on the past week and switches it on once you have read the result. The agents below are fictional; the demo builds and runs nothing.</p>
      ) : null}
      {agents.length ? (
        <ul className="flex flex-col gap-3">
          {agents.map((x) => (
            <li key={x.id} id={x.id} className="card min-w-0 scroll-mt-24 px-4 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-subhead font-semibold">{x.spec.name}</span>
                <StatusPill tone={CUSTOM_TONE[x.status]}>{CUSTOM_STATUS_LABEL[x.status]}</StatusPill>
                <span className="ml-auto text-caption text-text-tertiary">{x.lastRun ? `last run ${longDate(x.lastRun.slice(0, 10))}` : `built ${longDate(x.createdAt.slice(0, 10))}`}</span>
              </p>
              <p className="mt-1 text-footnote text-text-secondary">{specWords(x.spec)}</p>
              <p className="mt-1 text-caption text-text-tertiary">Your words: &ldquo;{x.words}&rdquo;</p>
              {x.notes.map((n) => (
                <p key={n} className="mt-1 text-caption text-text-tertiary">
                  {n}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionForm action={testAgentAction} label={x.status === "on" ? "Run now" : x.test ? "Test again" : "Test on the past week"} pendingLabel="Running" doneLabel="Done" size="sm" variant={x.status === "on" ? "secondary" : "primary"} note="With the AI; one pass per company it watches.">
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="mode" value={x.status === "on" ? "run" : "test"} />
                </ActionForm>
                {x.status !== "on" && x.test ? (
                  <ActionForm action={setAgentAction} label="Turn on" size="sm" doneLabel="On">
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="to" value="on" />
                  </ActionForm>
                ) : null}
                {x.status === "on" ? (
                  <ActionForm action={setAgentAction} label="Turn off" variant="ghost" size="sm" doneLabel="Off">
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="to" value="off" />
                  </ActionForm>
                ) : null}
                <ActionForm action={setAgentAction} label="Remove" variant="ghost" size="sm" doneLabel="Removed">
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="to" value="remove" />
                </ActionForm>
              </div>
              {x.status === "on" && x.findings.length ? (
                <div className="mt-3">
                  <p className="mb-2 text-footnote text-text-secondary">{x.sentence}</p>
                  <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {x.findings.slice(0, 8).map((f) => (
                      <FindingCard key={f.id} f={f} agent="agent_builder" rating={null} editable={false} showSymbol />
                    ))}
                  </ul>
                </div>
              ) : x.test ? (
                <div className="mt-3">
                  <p className="mb-2 text-footnote text-text-secondary">
                    Test, {longDate(x.test.at.slice(0, 10))}: {x.test.sentence}
                  </p>
                  {x.test.findings.length ? (
                    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {x.test.findings.slice(0, 8).map((f) => (
                        <FindingCard key={f.id} f={f} agent="agent_builder" rating={null} editable={false} showSymbol />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : x.sentence ? (
                <p className="mt-3 text-footnote text-text-secondary">{x.sentence}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !demo ? (
        <p className="px-1 text-caption text-text-tertiary">None yet. An agent reads the week&rsquo;s headlines, filings, the app&rsquo;s results reports and your newsletters and podcasts on the companies you hold or watch, and reports only what answers your question, each finding checked against what it cites.</p>
      ) : null}
    </section>
  );
}
