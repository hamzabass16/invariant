import { refuseUnlessCron } from "@/lib/cron-auth";
import { runAsJobs } from "@/lib/jobs-run";
import { registryAvailable } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Enqueues one job per person and waits for the workers, each its own function (lib/jobs-run.ts).
export const maxDuration = 800;

/**
 * The Thesis Hunter's daily pass (lib/thesis-hunter-run.ts), called by
 * Vercel's cron at 04:00 UTC (vercel.json), before the morning refresh and
 * the alert check that emails what it found. One job per enrolment
 * (lib/jobs-run.ts): the theses whose week is up (each is hunted once a
 * week) are hunted on that person's own model; a person with no model or no
 * thesis is skipped. Guarded by CRON_SECRET. The response carries counts,
 * never an address or a symbol.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled runs." }, { status: 503 });
  try {
    const run = await runAsJobs("hunter", request);
    return Response.json({ status: run.failed ? "partial" : "ok", ...run }, { status: 200 });
  } catch (e) {
    console.error(`[hunter] run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
