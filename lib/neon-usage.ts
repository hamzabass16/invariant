import "server-only";

import { parseNeonProject, type DbUsage } from "@/lib/db-usage";
import { SyncError } from "@/lib/sync-error";

/**
 * The database's compute this month, from Neon's own API (Hamza, 25 Nov
 * 2026: "log the usage so we can check"), for /ops and the daily log line.
 * The one file that calls Neon's API, on the deployment's `NEON_API_KEY`
 * (a read of the project, made in Neon's console under API keys) and
 * `NEON_PROJECT_ID`; the guard holds both here. It reads the project's
 * record alone, which wakes no database, and changes nothing. The key is
 * never logged, echoed or shown; a failure is a sentence and the status.
 */

const API = "https://console.neon.tech/api/v2/projects/";
const BUDGET_MS = 8_000;
const PROJECT = /^[a-z0-9-]{1,60}$/;

/** Whether this deployment can read its database's usage. */
export function neonUsageConfigured(): boolean {
  return !!(process.env.NEON_API_KEY ?? "").trim() && PROJECT.test((process.env.NEON_PROJECT_ID ?? "").trim());
}

/** The project's compute this month, or null when no key or project is set. */
export async function databaseUsage(): Promise<DbUsage | null> {
  if (!neonUsageConfigured()) return null;
  const key = (process.env.NEON_API_KEY ?? "").trim();
  const id = (process.env.NEON_PROJECT_ID ?? "").trim();
  let res: Response;
  try {
    res = await fetch(`${API}${id}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(BUDGET_MS) });
  } catch {
    throw new SyncError("Neon could not be reached for the database's usage.", "neon usage unreachable");
  }
  if (!res.ok) throw new SyncError(`Neon answered ${res.status} for the database's usage.`, `neon usage ${res.status}`);
  const usage = parseNeonProject(await res.json().catch(() => null));
  if (!usage) throw new SyncError("Neon's answer did not carry the database's usage.", "neon usage shape");
  return usage;
}
