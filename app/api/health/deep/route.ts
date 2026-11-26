import { queueLag } from "@/lib/jobs";
import { jobsAvailable, recentJobs } from "@/lib/jobs-run";
import { registryProblem } from "@/lib/registry";

export const dynamic = "force-dynamic";

/**
 * The deeper check an uptime monitor reads (docs/ARCHITECTURE.md §6): the
 * database answers, and the oldest due job has waited under 30 minutes.
 * 503 when either fails. Counts and minutes alone, never a person.
 */
export async function GET() {
  const problem = registryProblem();
  if (problem || !jobsAvailable()) return Response.json({ status: "not-configured" }, { status: 503 });
  const now = new Date();
  try {
    const rows = await recentJobs(now);
    const lag = queueLag(rows, now);
    const failed = rows.filter((r) => r.status === "failed").length;
    const ok = lag <= 30;
    return Response.json({ status: ok ? "ok" : "lagging", database: "ok", queueLagMinutes: lag, failedLastDay: failed }, { status: ok ? 200 : 503 });
  } catch {
    return Response.json({ status: "failed", database: "unreachable" }, { status: 503 });
  }
}
