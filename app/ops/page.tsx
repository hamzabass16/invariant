import { notFound } from "next/navigation";

import { ActionForm } from "@/components/app/action-form";

import { auth } from "@/lib/auth";
import { operatorEmails } from "@/lib/deployment";
import { FREE_CU_HOURS, onFreePlan, paceOf, type DbUsage } from "@/lib/db-usage";
import { githubOpsConfig, pullsLink, selfFixPulls, type SelfFixPull } from "@/lib/github-ops";
import { type SignalRow } from "@/lib/improvements";
import { improvementsAvailable, topSignals } from "@/lib/improvements-run";
import { queueLag, summarise, type KindSummary } from "@/lib/jobs";
import { jobsAvailable, recentJobs } from "@/lib/jobs-run";
import { databaseUsage, neonUsageConfigured } from "@/lib/neon-usage";
import { registryProblem } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";

import { AGENTS } from "@/lib/agents";
import { eventCounts } from "@/lib/beta-run";
import { monthOf, spendOfMonth, type SpendSummary } from "@/lib/model-meter";
import { funnel, MAX_INVITE_DAYS, MAX_INVITE_USES, PLAN_WORDS, PLANS, shownInviteCode } from "@/lib/plans";
import { invites, signUpMode, usersAvailable, type Invite } from "@/lib/users";

import { closeSelfFixAction, endInviteAction, makeInviteAction, mergeSelfFixAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Invariant", robots: { index: false } };

/**
 * The operator's screen (docs/ARCHITECTURE.md §6): the last day's scheduled
 * jobs per kind, how many waited, ran, failed or were tried again, the
 * slowest twentieth and the commonest failures, and the queue's lag. Only
 * the addresses in OPERATOR_EMAILS (else SHARED_RECAP_TO) may open it;
 * anyone else gets the page that does not exist. It names no person and no
 * figure. Below the jobs (Hamza, 4 Nov 2026, the software fixes itself):
 * what the app learns from everyone, the commonest signals by the number of
 * people who raised them (lib/improvements.ts), and the self-fix pull
 * requests the weekly routine opened from them (docs/SELF_FIX.md), each
 * merged or closed here, or on GitHub when no token is set. Above them, the
 * beta (Hamza, 9 Nov 2026): who may sign up, the invitations, the five counts
 * as people and shares of those who signed up, and the AI's cost this month and last by agent, spread
 * over how many people, never who.
 */
export default async function OpsPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? "";
  if (!email || !operatorEmails().includes(email)) notFound();
  const now = new Date();
  let kinds: KindSummary[] = [];
  let lag = 0;
  let problem: string | null = registryProblem();
  if (!problem && jobsAvailable()) {
    try {
      const rows = await recentJobs(now);
      kinds = summarise(rows, now);
      lag = queueLag(rows, now);
    } catch (e) {
      problem = e instanceof SyncError ? e.message : "The job queue could not be read.";
    }
  }
  const lastMonth = monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
  const [spendNow, spendBefore, counts, inviteList] = await Promise.all([
    spendOfMonth(monthOf(now)),
    spendOfMonth(lastMonth),
    eventCounts(),
    usersAvailable() ? invites().catch(() => null) : Promise.resolve(null),
  ]);
  const mode = signUpMode();
  const signals: SignalRow[] | null = improvementsAvailable() ? await topSignals() : null;
  let usage: DbUsage | null = null;
  let usageProblem: string | null = null;
  try {
    usage = await databaseUsage();
  } catch (e) {
    usageProblem = e instanceof SyncError ? e.message : "The database's usage could not be read.";
  }
  const pace = usage ? paceOf(usage, now) : null;
  const gh = githubOpsConfig();
  let pulls: SelfFixPull[] = [];
  let pullsProblem: string | null = null;
  if (gh?.token) {
    try {
      pulls = await selfFixPulls(gh);
    } catch (e) {
      pullsProblem = e instanceof SyncError ? e.message : "GitHub could not be read.";
    }
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Operations</h1>
      <p className="mt-2 text-subhead text-text-secondary">The last 24 hours of scheduled jobs. No person and no figure is shown here.</p>
      {problem ? <p className="mt-6 text-body">{problem}</p> : null}
      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Tile label="Oldest waiting job" value={lag ? `${lag} min` : "None waiting"} warn={lag > 30} />
        <Tile label="Failed, last 24 hours" value={String(kinds.reduce((n, k) => n + k.failed, 0))} warn={kinds.some((k) => k.failed > 0)} />
        <Tile label="Done, last 24 hours" value={String(kinds.reduce((n, k) => n + k.done, 0))} />
      </section>
      <section className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-subhead">
          <thead className="text-footnote uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="py-2 pr-3 font-medium">Job</th>
              <th className="py-2 pr-3 font-medium">Waiting</th>
              <th className="py-2 pr-3 font-medium">Running</th>
              <th className="py-2 pr-3 font-medium">Done</th>
              <th className="py-2 pr-3 font-medium">Failed</th>
              <th className="py-2 pr-3 font-medium">Expired</th>
              <th className="py-2 pr-3 font-medium">Tried again</th>
              <th className="py-2 pr-3 font-medium">p95</th>
            </tr>
          </thead>
          <tbody className="data tabular-nums">
            {kinds.map((k) => (
              <tr key={k.kind} className="border-t border-hairline">
                <td className="py-2 pr-3 font-sans">{k.words}</td>
                <td className="py-2 pr-3">{k.queued}{k.oldestWaitingMinutes !== null ? ` (${k.oldestWaitingMinutes} min)` : ""}</td>
                <td className="py-2 pr-3">{k.running}</td>
                <td className="py-2 pr-3">{k.done}</td>
                <td className="py-2 pr-3">{k.failed}</td>
                <td className="py-2 pr-3">{k.expired}</td>
                <td className="py-2 pr-3">{k.retried}</td>
                <td className="py-2 pr-3">{k.p95Seconds === null ? "None" : `${k.p95Seconds} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-10">
        <h2 className="section-header">The database this month</h2>
        <p className="mt-1 text-subhead text-text-secondary">
          {usage
            ? `From Neon, since ${usage.periodStart.slice(0, 10)}. It sleeps after five idle minutes, so each scheduled run that wakes it costs at least that.`
            : usageProblem ?? (neonUsageConfigured() ? "Not read." : "Set NEON_API_KEY and NEON_PROJECT_ID in Vercel to show it here and in the daily log line db.usage.")}
        </p>
        {usage ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Tile label="Compute-hours used" value={usage.cuHours.toFixed(1)} warn={onFreePlan(usage) && usage.cuHours >= FREE_CU_HOURS * 0.8} />
            <Tile label="Hours awake" value={usage.activeHours.toFixed(0)} />
            <Tile label={onFreePlan(usage) ? `Heading for, of ${FREE_CU_HOURS} free` : "Heading for"} value={pace ? pace.projected.toFixed(0) : "Too early"} warn={!!pace && onFreePlan(usage) && pace.share >= 0.9} />
          </div>
        ) : null}
      </section>
      {kinds.some((k) => k.errors.length) ? (
        <section className="mt-8">
          <h2 className="section-header">Commonest failures</h2>
          <ul className="mt-3 space-y-2 text-subhead">
            {kinds.flatMap((k) => k.errors.map((e) => (
              <li key={`${k.kind}:${e.sentence}`}>
                <span className="text-text-secondary">{k.words}:</span> {e.sentence} <span className="data tabular-nums">({e.count})</span>
              </li>
            )))}
          </ul>
        </section>
      ) : null}
      <section className="mt-10">
        <h2 className="section-header">The beta</h2>
        <p className="mt-1 text-subhead text-text-secondary">{MODE_WORDS[mode]} Your own addresses are not counted.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Tile label="AI this month, estimated" value={spendNow ? `$${spendNow.usd.toFixed(2)}` : "Not read"} />
          <Tile label="Per person this month" value={spendNow && spendNow.people ? `$${(spendNow.usd / spendNow.people).toFixed(2)} over ${spendNow.people}` : "None yet"} />
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-subhead">
            <caption className="mb-2 text-left text-footnote uppercase tracking-wide text-text-secondary">People who did each, first time</caption>
            <thead className="text-footnote uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="py-2 pr-3 font-medium">Step</th>
                <th className="py-2 pr-3 font-medium">People</th>
                <th className="py-2 pr-3 font-medium">Of those signed up</th>
              </tr>
            </thead>
            <tbody>
              {counts === null ? (
                <tr className="border-t border-hairline">
                  <td colSpan={3} className="py-2 pr-3">The counts could not be read.</td>
                </tr>
              ) : (
                funnel(counts).map((f) => (
                  <tr key={f.event} className="border-t border-hairline">
                    <td className="py-2 pr-3">{f.words}</td>
                    <td className="data py-2 pr-3 tabular-nums">{f.people}</td>
                    <td className="data py-2 pr-3 tabular-nums">{f.share === null ? "None" : `${f.share}%`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <SpendTable title={`AI by agent, ${monthOf(now)}`} spend={spendNow} />
        <SpendTable title={`AI by agent, ${lastMonth}`} spend={spendBefore} />
        <h3 className="mt-8 text-headline">Invitations</h3>
        {mode !== "invite" ? <p className="mt-1 text-footnote text-text-secondary">Set SIGN_UP=invite for sign-up to ask for a code.</p> : null}
        {!usersAvailable() ? (
          <p className="mt-2 text-subhead">No database is set for this deployment.</p>
        ) : (
          <>
            <ActionForm action={makeInviteAction} label="Make an invitation" doneLabel="Made" size="sm" className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-hairline bg-surface p-4">
              <label className="text-footnote">
                <span className="mb-1 block text-text-secondary">People</span>
                <input name="uses" type="number" min={1} max={MAX_INVITE_USES} defaultValue={1} required className="data w-24 rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body" />
              </label>
              <label className="text-footnote">
                <span className="mb-1 block text-text-secondary">Days</span>
                <input name="days" type="number" min={1} max={MAX_INVITE_DAYS} defaultValue={30} required className="data w-24 rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body" />
              </label>
              <label className="text-footnote">
                <span className="mb-1 block text-text-secondary">Plan</span>
                <select name="plan" defaultValue="beta" className="rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body">
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {PLAN_WORDS[p]}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
            {inviteList === null ? (
              <p className="mt-3 text-subhead">The invitations could not be read.</p>
            ) : !inviteList.length ? (
              <p className="mt-3 text-subhead">None made yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {inviteList.map((i) => (
                  <InviteRow key={i.id} invite={i} now={now} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <section className="mt-10">
        <h2 className="section-header">What people raise</h2>
        <p className="mt-1 text-subhead text-text-secondary">Methodology gaps and the reasons findings were rated not useful, counted once per person who left Help improve on. The most people first, then the most recent.</p>
        {signals === null ? (
          <p className="mt-3 text-subhead">{improvementsAvailable() ? "The signals could not be read." : "No database is set for this deployment."}</p>
        ) : !signals.length ? (
          <p className="mt-3 text-subhead">Nothing raised yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-subhead">
              <thead className="text-footnote uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 font-medium">What</th>
                  <th className="py-2 pr-3 font-medium">People</th>
                  <th className="py-2 pr-3 font-medium">Last raised</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((x) => (
                  <tr key={x.key} className="border-t border-hairline align-top">
                    <td className="py-2 pr-3 text-text-secondary">{x.kind === "gap" ? "Gap" : x.kind === "reader" ? "Reader" : "Rating"}</td>
                    <td className="py-2 pr-3">{x.words}</td>
                    <td className="data py-2 pr-3 tabular-nums">{x.people}</td>
                    <td className="data py-2 pr-3 tabular-nums">{x.lastSeen.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="mt-10">
        <h2 className="section-header">Self-fix pull requests</h2>
        <p className="mt-1 text-subhead text-text-secondary">Opened by the weekly routine from the signals above, every check run. Nothing reaches the app until it is merged.</p>
        {!gh ? (
          <p className="mt-3 text-subhead">Set OPS_GITHUB_REPO (owner/name) to list them here.</p>
        ) : !gh.token ? (
          <p className="mt-3 text-subhead">
            No GitHub token is set, so they are merged or closed on GitHub:{" "}
            <a href={pullsLink(gh.repo)} target="_blank" rel="noreferrer noopener" className="text-accent-text">
              the open self-fix pull requests
            </a>
            .
          </p>
        ) : pullsProblem ? (
          <p className="mt-3 text-subhead">
            {pullsProblem}{" "}
            <a href={pullsLink(gh.repo)} target="_blank" rel="noreferrer noopener" className="text-accent-text">
              Open them on GitHub
            </a>
            .
          </p>
        ) : !pulls.length ? (
          <p className="mt-3 text-subhead">None open.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pulls.map((p) => (
              <li key={p.number} className="rounded-2xl border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a href={p.url} target="_blank" rel="noreferrer noopener" className="text-body font-semibold text-accent-text">
                    #{p.number} {p.title}
                  </a>
                  <span className={`text-footnote ${p.checks === "failing" ? "text-danger" : p.checks === "passing" ? "text-ok" : "text-text-secondary"}`}>{CHECKS[p.checks]}</span>
                  {p.draft ? <span className="text-footnote text-text-secondary">Draft</span> : null}
                  <span className="data ml-auto text-caption text-text-tertiary">{p.createdAt.slice(0, 10)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <ActionForm action={mergeSelfFixAction} label="Merge" doneLabel="Merged" size="sm" className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="number" value={p.number} />
                    <input type="hidden" name="sha" value={p.sha} />
                    <label className="flex items-center gap-2 text-footnote">
                      <input type="checkbox" name="confirm" value="yes" required className="size-4 accent-[var(--accent)]" />
                      I read the change; squash it into main at {p.sha.slice(0, 7)}
                    </label>
                  </ActionForm>
                  <ActionForm action={closeSelfFixAction} label="Close" doneLabel="Closed" size="sm" variant="secondary" className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="number" value={p.number} />
                    <label className="flex items-center gap-2 text-footnote">
                      <input type="checkbox" name="confirm" value="yes" required className="size-4 accent-[var(--accent)]" />
                      Close without merging
                    </label>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const MODE_WORDS = { open: "Anyone can make an account (SIGN_UP=open).", invite: "Only people with an invitation can make an account (SIGN_UP=invite).", closed: "No one can make an account (SIGN_UP is not set)." } as const;

const agentWords = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? (id === "untagged" ? "Not tagged" : id);

function SpendTable({ title, spend }: { title: string; spend: SpendSummary | null }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-subhead">
        <caption className="mb-2 text-left text-footnote uppercase tracking-wide text-text-secondary">{title}</caption>
        <thead className="text-footnote uppercase tracking-wide text-text-secondary">
          <tr>
            <th className="py-2 pr-3 font-medium">Agent</th>
            <th className="py-2 pr-3 font-medium">Calls</th>
            <th className="py-2 pr-3 font-medium">Estimated</th>
          </tr>
        </thead>
        <tbody>
          {spend === null ? (
            <tr className="border-t border-hairline">
              <td colSpan={3} className="py-2 pr-3">The spend could not be read.</td>
            </tr>
          ) : !spend.agents.length ? (
            <tr className="border-t border-hairline">
              <td colSpan={3} className="py-2 pr-3">No calls counted by agent this month.</td>
            </tr>
          ) : (
            spend.agents.map((a) => (
              <tr key={a.agent} className="border-t border-hairline">
                <td className="py-2 pr-3">{agentWords(a.agent)}</td>
                <td className="data py-2 pr-3 tabular-nums">{a.calls}</td>
                <td className="data py-2 pr-3 tabular-nums">${a.usd.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-1 text-caption text-text-tertiary">At list price, from the usage the API reports. Calls before 9 Nov 2026 were not kept by agent.</p>
    </div>
  );
}

function InviteRow({ invite, now }: { invite: Invite; now: Date }) {
  const ended = new Date(invite.expires).getTime() <= now.getTime();
  const full = invite.used >= invite.uses;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-hairline bg-surface px-4 py-3">
      <span className="data text-body tracking-[0.1em]">{invite.code ? shownInviteCode(invite.code) : "Code unreadable"}</span>
      <span className="text-footnote text-text-secondary">{invite.plan ? PLAN_WORDS[invite.plan] : "No plan"}</span>
      <span className="data text-footnote tabular-nums">
        {invite.used} of {invite.uses} used
      </span>
      <span className="text-footnote text-text-secondary">{ended ? "Ended" : full ? "Used up" : `Until ${invite.expires.slice(0, 10)}`}</span>
      {!ended && !full ? (
        <ActionForm action={endInviteAction} label="End it" doneLabel="Ended" size="sm" variant="secondary" className="ml-auto">
          <input type="hidden" name="id" value={invite.id} />
        </ActionForm>
      ) : null}
    </li>
  );
}

const CHECKS: Record<SelfFixPull["checks"], string> = { passing: "Checks passing", failing: "Checks failing", pending: "Checks running", none: "No checks" };

function Tile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <p className="text-footnote text-text-secondary">{label}</p>
      <p className={`mt-1 data text-title-2 tabular-nums ${warn ? "text-warn" : ""}`}>{value}</p>
    </div>
  );
}
