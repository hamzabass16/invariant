import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { connectionProblem } from "@/lib/connection-string";
import { rankSignals, recordsSignals, OPS_SIGNALS, type Signal, type SignalKind, type SignalRow } from "@/lib/improvements";
import { meterKey } from "@/lib/model-meter";

/**
 * The signals, counted across everyone, in the operator's Postgres (Hamza,
 * 4 Nov 2026):
 *
 *   improvement_signals  one row per signal: its key, kind, words (a gap's,
 *                        masked; a rating's agent, step and reason), the
 *                        number of people who raised it, when first and last.
 *   improvement_votes    which keyed fingerprint raised which signal (the one
 *                        model_spend is kept under, never the address), so a
 *                        person is counted once and their votes go when they
 *                        switch it off.
 *
 * Recording never fails the action it rides on: a database that cannot be
 * reached logs a line and keeps nothing.
 */

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

function sql(): { q: Sql; ready: Promise<void> } | null {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url)) return null;
  const q: Sql = neon(url);
  ready ??= q`
    create table if not exists improvement_signals (
      key text primary key,
      kind text not null,
      words text not null,
      agent text,
      step text,
      reason text,
      people integer not null default 0,
      first_seen timestamptz not null default now(),
      last_seen timestamptz not null default now()
    )`
    .then(
      () => q`
        create table if not exists improvement_votes (
          key text not null,
          who text not null,
          seen_at timestamptz not null default now(),
          primary key (key, who)
        )`,
    )
    .then(() => q`create index if not exists improvement_votes_who on improvement_votes (who)`)
    .then(() => undefined);
  return { q, ready };
}

function unreachable(event: string): void {
  ready = null;
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event }));
}

export const improvementsAvailable = () => sql() !== null;

/** Counts one person's signals, once each: their vote kept, each signal's count of people set from the votes. Nothing when they switched it off or in the demo. */
export async function recordSignals(email: string, prefs: { improve?: boolean } | null, demo: boolean, signals: readonly Signal[], now: Date = new Date()): Promise<number> {
  if (!recordsSignals(prefs, demo) || !signals.length || !email) return 0;
  const db = sql();
  if (!db) return 0;
  const who = meterKey(email);
  const at = now.toISOString();
  const rows = JSON.stringify(signals.map((s) => ({ key: s.key, kind: s.kind, words: s.words, agent: s.agent, step: s.step, reason: s.reason })));
  const keys = signals.map((s) => s.key);
  try {
    await db.ready;
    await db.q`
      insert into improvement_signals (key, kind, words, agent, step, reason, people, first_seen, last_seen)
      select x.key, x.kind, x.words, x.agent, x.step, x.reason, 0, ${at}, ${at} from jsonb_to_recordset(${rows}::jsonb) as x(key text, kind text, words text, agent text, step text, reason text)
      on conflict (key) do update set last_seen = excluded.last_seen`;
    await db.q`
      insert into improvement_votes (key, who, seen_at) select k, ${who}, ${at} from unnest(${keys}::text[]) as k
      on conflict (key, who) do update set seen_at = excluded.seen_at`;
    await db.q`update improvement_signals s set people = (select count(*) from improvement_votes v where v.key = s.key) where s.key = any(${keys}::text[])`;
    return signals.length;
  } catch {
    unreachable("improvements_unreachable");
    return 0;
  }
}

/** Takes one person's votes out (switched off, or their account withdrawn): each signal they raised counted again, one nobody raises any more deleted. */
export async function forgetSignals(email: string): Promise<void> {
  const db = sql();
  if (!db || !email) return;
  const who = meterKey(email);
  try {
    await db.ready;
    const gone = (await db.q`delete from improvement_votes where who = ${who} returning key`) as { key: string }[];
    const keys = [...new Set(gone.map((g) => g.key))];
    if (!keys.length) return;
    await db.q`update improvement_signals s set people = (select count(*) from improvement_votes v where v.key = s.key) where s.key = any(${keys}::text[])`;
    await db.q`delete from improvement_signals where people = 0 and key = any(${keys}::text[])`;
  } catch {
    unreachable("improvements_unreachable");
  }
}

type Row = { key: string; kind: string; words: string; agent: string | null; step: string | null; reason: string | null; people: number; first_seen: string | Date; last_seen: string | Date };

/** The commonest signals, for /ops: most people first, then the most recent. Null when the database cannot be read. */
export async function topSignals(limit = OPS_SIGNALS): Promise<SignalRow[] | null> {
  const db = sql();
  if (!db) return null;
  try {
    await db.ready;
    const rows = (await db.q`select key, kind, words, agent, step, reason, people, first_seen, last_seen from improvement_signals where people > 0 order by people desc, last_seen desc limit ${limit}`) as Row[];
    return rankSignals(
      rows.map((r) => ({ key: r.key, kind: r.kind as SignalKind, words: r.words, agent: r.agent, step: r.step, reason: r.reason as SignalRow["reason"], people: Number(r.people), firstSeen: new Date(r.first_seen).toISOString(), lastSeen: new Date(r.last_seen).toISOString() })),
    );
  } catch {
    unreachable("improvements_unreachable");
    return null;
  }
}
