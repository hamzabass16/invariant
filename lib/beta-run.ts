import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { connectionProblem } from "@/lib/connection-string";
import { operatorEmails } from "@/lib/deployment";
import { meterKey, monthlyCap } from "@/lib/model-meter";
import { BETA_EVENTS, capOf, planCaps, type BetaEvent } from "@/lib/plans";
import { SyncError } from "@/lib/sync-error";

/**
 * The beta's server side (Hamza, 9 Nov 2026): each person's monthly cap from
 * their plan, the five counts on /ops and leaving for good. In the operator's
 * Postgres:
 *
 *   beta_events  one row per kind and person, the first time it happens: the
 *                kind (`BETA_EVENTS` in lib/plans.ts), the keyed fingerprint
 *                the meter uses (never the address) and when. No figure, no
 *                file, nothing of what was read or confirmed.
 *
 * The operator's own addresses (OPERATOR_EMAILS and ALLOWED_EMAILS) are not
 * counted and keep the deployment's own cap. Counting never fails the action
 * it rides on: a database that cannot be reached logs a line and keeps
 * nothing. The demo counts nothing.
 */

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

function sql(): { q: Sql; ready: Promise<void> } | null {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url) || process.env.STORAGE === "demo") return null;
  const q: Sql = neon(url);
  ready ??= q`
    create table if not exists beta_events (
      kind text not null,
      who text not null,
      at timestamptz not null default now(),
      primary key (kind, who)
    )`
    .then(() => q`create index if not exists beta_events_who on beta_events (who)`)
    .then(() => undefined);
  return { q, ready };
}

function unreachable(): void {
  ready = null;
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "beta_events.unreachable" }));
}

const lower = (e: string) => e.trim().toLowerCase();

/** Whether the address runs the deployment: an operator or on the allowlist. */
export function runsDeployment(email: string): boolean {
  const e = lower(email);
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map(lower).filter(Boolean);
  return operatorEmails().includes(e) || allowed.includes(e);
}

// ---------------------------------------------------------------------------
// The cap

const capsSeen = new Map<string, { cap: number | null; at: number }>();
const CAP_KEEP_MS = 5 * 60_000;

/**
 * One person's monthly AI cap in US dollars: their plan's (PLAN_CAPS_USD),
 * else null for the deployment's own (MODEL_CAP_USD). Kept five minutes per
 * instance, so a run over many calls reads the account once.
 */
export async function capFor(email: string): Promise<number | null> {
  const e = lower(email);
  if (runsDeployment(e)) return null;
  const seen = capsSeen.get(e);
  if (seen && Date.now() - seen.at < CAP_KEEP_MS) return seen.cap;
  const { planOf } = await import("@/lib/users");
  const plan = await planOf(e);
  const cap = plan ? capOf(plan, planCaps(process.env.PLAN_CAPS_USD), monthlyCap()) : null;
  capsSeen.set(e, { cap, at: Date.now() });
  return cap;
}

// ---------------------------------------------------------------------------
// The five counts

/** Counts the first time a person does one of the five; never throws. */
export async function recordEvent(email: string | null | undefined, kind: BetaEvent): Promise<void> {
  if (!email || runsDeployment(email)) return;
  const db = sql();
  if (!db) return;
  try {
    await db.ready;
    await db.q`insert into beta_events (kind, who) values (${kind}, ${meterKey(email)}) on conflict (kind, who) do nothing`;
  } catch {
    unreachable();
  }
}

/** How many people did each of the five, for /ops; null when the database cannot be read. */
export async function eventCounts(): Promise<Partial<Record<BetaEvent, number>> | null> {
  const db = sql();
  if (!db) return null;
  try {
    await db.ready;
    const rows = (await db.q`select kind, count(*)::int as n from beta_events group by kind`) as { kind: string; n: number }[];
    const out: Partial<Record<BetaEvent, number>> = {};
    for (const r of rows) if ((BETA_EVENTS as readonly string[]).includes(r.kind)) out[r.kind as BetaEvent] = r.n;
    return out;
  } catch {
    unreachable();
    return null;
  }
}

/** Takes one count back (a commitment withdrawn). */
export async function unrecordEvent(email: string, kind: BetaEvent): Promise<void> {
  const db = sql();
  if (!db) return;
  try {
    await db.ready;
    await db.q`delete from beta_events where kind = ${kind} and who = ${meterKey(email)}`;
  } catch {
    unreachable();
  }
}

// ---------------------------------------------------------------------------
// Delete my account

/**
 * Deletes everything the deployment keeps about one person (the beta's
 * outside users, GDPR): their account, plan and commitment, their report
 * schedule and sealed token, their scheduled jobs, the Drive linked on
 * Welcome, their Community card, their clubs' memberships, entries, votes,
 * reviews and alumni line, their households, their marketplace listing and
 * the open data they gave, their AI spend, what they raised to improve the app and their five counts. Their
 * vault stays where it is, in their own Drive. An address on the allowlist
 * runs the deployment and is refused; so is the owner of a club, who
 * deletes the club first. A mail claim, a rate limit or an agent's monthly
 * total names no one and ends on its own.
 */
export async function deleteAccount(email: string): Promise<void> {
  const e = lower(email);
  if (runsDeployment(e)) throw new SyncError("This address runs the deployment (it is on the allowlist), so it cannot be deleted here.", "delete operator");
  const registry = await import("@/lib/registry");
  if (registry.registryAvailable()) {
    const clubs = await registry.clubsOf(e);
    if (clubs.some((c) => c.role === "owner")) throw new SyncError("You own a club. Delete it on Clubs first, then delete your account.", "delete club owner");
    for (const c of clubs) await registry.leaveClub(c.club.id, e);
    await registry.forgetClubPerson(e);
    for (const h of await registry.myHouseholds(e)) await registry.leaveHousehold(h.id, e);
    await registry.unlist(e);
    await registry.forgetDonations(e);
    await registry.stopSharing(e);
    await registry.withdraw(e);
    await registry.dropBucket(e);
  }
  const [{ forgetSpend }, { forgetSignals }, { deleteUser }] = await Promise.all([import("@/lib/model-meter"), import("@/lib/improvements-run"), import("@/lib/users")]);
  await forgetSpend(meterKey(e));
  await forgetSignals(e);
  const db = sql();
  if (db) {
    await db.ready;
    await db.q`delete from beta_events where who = ${meterKey(e)}`;
  }
  await deleteUser(e);
  capsSeen.delete(e);
}

// ---------------------------------------------------------------------------
// The AI on demand (the beta's hybrid AI)

/** Whether the person has added the connector to Claude, from the beta's count; null when it cannot be read or is not counted (the operator). */
export async function connectorAdded(email: string | null | undefined): Promise<boolean | null> {
  if (!email || runsDeployment(email)) return null;
  const db = sql();
  if (!db) return null;
  try {
    await db.ready;
    const rows = (await db.q`select 1 from beta_events where kind = 'connector_added' and who = ${meterKey(email)} limit 1`) as unknown[];
    return rows.length > 0;
  } catch {
    unreachable();
    return null;
  }
}
