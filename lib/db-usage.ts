/**
 * How much of the database's compute this month has used (Hamza, 25 Nov
 * 2026: the free plan ran out on 22 Nov and the app could not be opened;
 * "log the usage so we can check"). Pure: reads the Neon project record
 * that lib/neon-usage.ts fetches and says where the month is heading.
 * Never a person, never a figure of anyone's money.
 */

/** Compute-hours a Neon project gets a month on the free plan (https://neon.com/docs/introduction/plans). */
export const FREE_CU_HOURS = 100;

export type DbUsage = {
  /** Compute-hours used since the period began: active time times the compute's size. */
  cuHours: number;
  /** Hours the compute was awake. */
  activeHours: number;
  periodStart: string;
  periodEnd: string;
  /** The plan Neon names, such as free_v3; null when it does not say. */
  plan: string | null;
  lastActive: string | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Reads GET /api/v2/projects/{id}, the record alone or under `project`; null when it is not one. */
export function parseNeonProject(json: unknown): DbUsage | null {
  const outer = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const p = outer && outer.project && typeof outer.project === "object" ? (outer.project as Record<string, unknown>) : outer;
  if (!p) return null;
  const compute = num(p.compute_time_seconds);
  const active = num(p.active_time_seconds);
  const start = str(p.consumption_period_start);
  const end = str(p.consumption_period_end);
  if (compute === null || active === null || !start || !end) return null;
  const owner = p.owner && typeof p.owner === "object" ? (p.owner as Record<string, unknown>) : null;
  return {
    cuHours: compute / 3600,
    activeHours: active / 3600,
    periodStart: start,
    periodEnd: end,
    plan: str(owner?.subscription_type),
    lastActive: str(p.compute_last_active_at),
  };
}

/** The compute-hours the month reaches at the pace so far, and the share of the free plan's that is; null in the period's first hour. */
export function paceOf(u: DbUsage, now: Date): { projected: number; share: number } | null {
  const start = Date.parse(u.periodStart);
  const end = Date.parse(u.periodEnd);
  const gone = now.getTime() - start;
  if (!(gone >= 3_600_000) || !(end > start)) return null;
  // Past the period's end the month is what was used.
  const projected = u.cuHours * Math.max(1, (end - start) / gone);
  return { projected, share: projected / FREE_CU_HOURS };
}

/** Whether the plan is Neon's free one, whose compute stops at FREE_CU_HOURS. */
export const onFreePlan = (u: DbUsage) => (u.plan ?? "").startsWith("free");

/** One line for the operator and the log: used, the pace, and the free plan's limit when it applies. */
export function usageWords(u: DbUsage, now: Date): string {
  const used = `${u.cuHours.toFixed(1)} compute-hours used this month, awake ${u.activeHours.toFixed(0)} hours`;
  const pace = paceOf(u, now);
  if (!pace) return `${used}.`;
  const heading = `heading for ${pace.projected.toFixed(0)}`;
  return onFreePlan(u) ? `${used}; ${heading} of the free plan's ${FREE_CU_HOURS}.` : `${used}; ${heading} by the month's end.`;
}
