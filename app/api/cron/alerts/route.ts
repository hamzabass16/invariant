import { refuseUnlessCron } from "@/lib/cron-auth";
import { runAsJobs } from "@/lib/jobs-run";
import { registryAvailable } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Enqueues one job per person and waits for the workers, each its own function (lib/jobs-run.ts).
export const maxDuration = 800;

/**
 * The evening alert check, called by Vercel's cron at 18:00 UTC (vercel.json);
 * the morning one runs at 06:00 after the refresh and the reports, so alerts
 * are checked every twelve hours. This one also reads again the outcome of
 * an event not out yet (`alertsFor(e, now, true)` in each job). One job per
 * person (lib/jobs-run.ts), run by workers in their own functions, so the
 * run no longer stops at the people one function can reach. Guarded by
 * CRON_SECRET. The response carries counts, never an address or a symbol.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled checks." }, { status: 503 });
  try {
    const run = await runAsJobs("alerts", request);
    return Response.json({ status: run.failed ? "partial" : "ok", ...run }, { status: 200 });
  } catch (e) {
    console.error(`[alerts] run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
