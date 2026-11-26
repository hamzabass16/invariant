import "server-only";

import { createHmac } from "node:crypto";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { connectionProblem } from "@/lib/connection-string";
import { SyncError } from "@/lib/sync-error";

/**
 * What each person's AI has cost this month on the Invariant key (Hamza,
 * 4 Nov 2026: every model call runs on the deployment's key, with a monthly
 * cap per person), in the operator's Postgres:
 *
 *   model_spend  one row per person and month: a keyed fingerprint of the
 *                sign-in (never the address), the month (YYYY-MM, UTC), the
 *                estimated cost in US dollars at list price and the number of
 *                calls. Never a prompt, an answer, a figure or a holding.
 *   agent_spend  one row per agent and month (Hamza, 9 Nov 2026: cost per
 *                agent on /ops): the agent the call was tagged with, the
 *                month, the estimated cost and the calls. No person at all.
 *
 * The cost is the agents' own estimate (`costOf` in lib/agents.ts) from the
 * usage the API reports. A call is refused once the month's spend reaches
 * the cap: the person's plan's (`capFor` in lib/beta-run.ts, PLAN_CAPS_USD),
 * else `MODEL_CAP_USD`, else `DEFAULT_CAP_USD`; the call in flight when
 * it is crossed finishes, so the cap can be passed by one call's cost. Where
 * the database cannot be reached the call goes through and the log says so,
 * since the reading a person asked for should not fail because a counter
 * could not be read.
 */

/** US dollars of AI a person may use a month, at list price, unless the deployment sets MODEL_CAP_USD. */
export const DEFAULT_CAP_USD = 15;

export function monthlyCap(): number {
  const set = Number(process.env.MODEL_CAP_USD);
  return Number.isFinite(set) && set >= 0 ? set : DEFAULT_CAP_USD;
}

/** The month a cost counts in, UTC: the cap resets on the 1st. */
export function monthOf(at: Date = new Date()): string {
  return at.toISOString().slice(0, 7);
}

/** The key one person is metered under: a fingerprint of the sign-in, keyed on AUTH_SECRET. */
export function meterKey(email: string): string {
  const secret = process.env.AUTH_SECRET ?? "portfolio-os";
  return createHmac("sha256", secret).update(`model\n${email.trim().toLowerCase()}`).digest("hex").slice(0, 24);
}

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

function sql(): { q: Sql; ready: Promise<void> } | null {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url)) return null;
  const q: Sql = neon(url);
  ready ??= q`
    create table if not exists model_spend (
      key text not null,
      month text not null,
      usd double precision not null default 0,
      calls integer not null default 0,
      primary key (key, month)
    )`
    .then(
      () => q`
        create table if not exists agent_spend (
          agent text not null,
          month text not null,
          usd double precision not null default 0,
          calls integer not null default 0,
          primary key (agent, month)
        )`,
    )
    .then(() => undefined);
  return { q, ready };
}

function unreachable(event: string): void {
  ready = null;
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event }));
}

/** This month's estimated spend for one meter, in US dollars; 0 when nothing is kept or the database cannot be read. */
export async function spentThisMonth(meter: string, at: Date = new Date()): Promise<number> {
  const db = sql();
  if (!db) return 0;
  try {
    await db.ready;
    const rows = (await db.q`select usd from model_spend where key = ${meter} and month = ${monthOf(at)}`) as { usd: number }[];
    return Number(rows[0]?.usd ?? 0);
  } catch {
    unreachable("model_meter.unreachable");
    return 0;
  }
}

/** The sentence a call past the cap is refused with. */
export const CAP_REACHED = "This month's AI allowance is used up. It resets on the 1st; everything that does not need the AI keeps running.";

/** Throws the cap's sentence when the meter has reached this month's cap: the person's own (their plan's), else the deployment's. */
export async function assertWithinCap(meter: string, cap: number | null | undefined = null, at: Date = new Date()): Promise<void> {
  const spent = await spentThisMonth(meter, at);
  if (spent >= (typeof cap === "number" && cap >= 0 ? cap : monthlyCap())) throw new SyncError(CAP_REACHED, "monthly model cap reached");
}

/** An agent's name as kept: the tag's, else "untagged". */
const agentName = (agent: string | null | undefined) => (agent && /^[a-z0-9_]{1,40}$/.test(agent) ? agent : "untagged");

/** Adds one call's estimated cost to the meter's month, and to its agent's month with no person. */
export async function addSpend(meter: string, usd: number, at: Date = new Date(), agent: string | null = null): Promise<void> {
  const db = sql();
  if (!db || !Number.isFinite(usd) || usd < 0) return;
  try {
    await db.ready;
    await db.q`
      insert into model_spend (key, month, usd, calls) values (${meter}, ${monthOf(at)}, ${usd}, 1)
      on conflict (key, month) do update set usd = model_spend.usd + ${usd}, calls = model_spend.calls + 1`;
    await db.q`
      insert into agent_spend (agent, month, usd, calls) values (${agentName(agent)}, ${monthOf(at)}, ${usd}, 1)
      on conflict (agent, month) do update set usd = agent_spend.usd + ${usd}, calls = agent_spend.calls + 1`;
  } catch {
    unreachable("model_meter.unreachable");
  }
}

export type SpendSummary = { month: string; people: number; usd: number; calls: number; agents: { agent: string; usd: number; calls: number }[] };

/** One month's spend for /ops: by agent, the total, and how many people it was spread over; never who. Null when the database cannot be read. */
export async function spendOfMonth(month: string): Promise<SpendSummary | null> {
  const db = sql();
  if (!db) return null;
  try {
    await db.ready;
    const [agentRows, peopleRows] = await Promise.all([db.q`select agent, usd, calls from agent_spend where month = ${month} order by usd desc`, db.q`select count(*)::int as n, coalesce(sum(usd), 0) as usd, coalesce(sum(calls), 0)::int as calls from model_spend where month = ${month}`]);
    const agents = agentRows as { agent: string; usd: number; calls: number }[];
    const people = peopleRows as { n: number; usd: number; calls: number }[];
    return { month, people: people[0]?.n ?? 0, usd: Number(people[0]?.usd ?? 0), calls: people[0]?.calls ?? 0, agents: agents.map((a) => ({ agent: a.agent, usd: Number(a.usd), calls: a.calls })) };
  } catch {
    unreachable("model_meter.unreachable");
    return null;
  }
}

/** Deletes one person's months (Delete my account). */
export async function forgetSpend(meter: string): Promise<void> {
  const db = sql();
  if (!db) return;
  await db.ready;
  await db.q`delete from model_spend where key = ${meter}`;
}

/** Deletes months over a year old; run by the morning cron. */
export async function pruneSpend(at: Date = new Date()): Promise<void> {
  const db = sql();
  if (!db) return;
  await db.ready;
  const yearAgo = monthOf(new Date(at.getTime() - 366 * 86_400_000));
  await db.q`delete from model_spend where month < ${yearAgo}`;
  await db.q`delete from agent_spend where month < ${yearAgo}`;
}
