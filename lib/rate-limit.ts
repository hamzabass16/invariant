import "server-only";

import { createHmac } from "node:crypto";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { connectionProblem } from "@/lib/connection-string";

/**
 * Limits that hold across every instance (docs/ARCHITECTURE.md §5.6), in the
 * operator's Postgres:
 *
 *   rate_limits  one row per limit and subject: a keyed fingerprint of what
 *                is limited (an address, a network address, a person's
 *                catch-up), the window it counts in and how many it has
 *                counted. Never the address itself.
 *
 * A fixed window: the first use in a window starts it, each use counts, and
 * a use past the limit is refused until the window ends. Where the database
 * cannot be reached the limit lets the use through and says so in the log,
 * since a sign-up or a page should not fail because a counter could not be
 * read; what it guards (the sign-up's own table) needs the same database.
 */

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

function sql(): { q: Sql; ready: Promise<void> } | null {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url)) return null;
  const q: Sql = neon(url);
  ready ??= q`
    create table if not exists rate_limits (
      key text primary key,
      window_start timestamptz not null,
      count integer not null
    )`.then(() => undefined);
  return { q, ready };
}

/** The key a subject is counted under: what is limited, and a fingerprint of who, keyed on AUTH_SECRET. */
export function limitKey(what: string, subject: string): string {
  const secret = process.env.AUTH_SECRET ?? "portfolio-os";
  return `${what}:${createHmac("sha256", secret).update(`limit\n${what}\n${subject.trim().toLowerCase()}`).digest("hex").slice(0, 24)}`;
}

/**
 * Counts one use of `key` and says whether it is within `limit` uses per
 * `windowSeconds`. Atomic: two instances counting at once both count.
 */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = sql();
  if (!db) return true;
  try {
    await db.ready;
    const rows = (await db.q`
      insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
      on conflict (key) do update set
        window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end,
        count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end
      returning count`) as { count: number }[];
    return (rows[0]?.count ?? 1) <= limit;
  } catch {
    ready = null;
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "rate_limit.unreachable" }));
    return true;
  }
}

/** Deletes windows that ended over a day ago; run by the morning cron. */
export async function pruneLimits(): Promise<void> {
  const db = sql();
  if (!db) return;
  await db.ready;
  await db.q`delete from rate_limits where window_start < now() - interval '2 days'`;
}

/** The network address a request came from, as Vercel reports it, for a limit's subject alone; never kept or logged. */
export function requestIp(headers: Headers): string {
  return (headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}
