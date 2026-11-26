import { refuseUnlessCron } from "@/lib/cron-auth";
import { runAsJobs } from "@/lib/jobs-run";
import { registryAvailable } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Enqueues one job per person whose review is due and waits for the workers, each its own function (lib/jobs-run.ts).
export const maxDuration = 800;

/**
 * The weekly and monthly reviews, called by Vercel's cron five minutes past
 * every hour (vercel.json; 4 Nov 2026: a Sunday 09:00 review had waited for
 * Monday's 06:00 UTC run). One job for each person whose own slot has come
 * (`isDue` in lib/report.ts, in their zone), built and sent once per
 * occurrence (`reportsFor` in lib/report-run.ts); a claim a killed run left
 * is taken back at the next hour (`staleClaim`). Guarded by CRON_SECRET.
 * The response carries counts, never an address or a report.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled reports." }, { status: 503 });
  try {
    const run = await runAsJobs("reviews", request);
    return Response.json({ status: run.failed ? "partial" : "ok", ...run }, { status: 200 });
  } catch (e) {
    console.error(`[report] reviews run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
