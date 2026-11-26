import { refuseUnlessCron } from "@/lib/cron-auth";
import { ECON_EVENTS } from "@/lib/econ-calendar";
import { eventWindowOpen } from "@/lib/macro-report";
import { resultsHours } from "@/lib/jobs";
import { runAsJobs } from "@/lib/jobs-run";
import { registryAvailable } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Enqueues one job per person and waits for the workers, each its own function (lib/jobs-run.ts).
export const maxDuration = 800;

/**
 * The results watch, called by Vercel's cron every quarter of an hour
 * (vercel.json; Vercel Pro). In the results hours it always runs; outside
 * them only within three hours after an event on the calendar, so a macro
 * event's report is read half an hour after it, outcome and reaction in one
 * go (Hamza, 7 Nov 2026), and no one is queued in a quiet hour.
 * One job per person: it reads the person's earnings file alone and, when a
 * followed company's results are out and no release has been read for them
 * (`resultsWatchDue` in lib/earnings.ts), reads them and emails the report
 * at once, the app closed (Hamza, 4 Nov 2026). Guarded by CRON_SECRET. The
 * response carries counts, never an address or a symbol.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled runs." }, { status: 503 });
  const now = new Date();
  if (!resultsHours(now) && !eventWindowOpen(ECON_EVENTS, now)) return Response.json({ status: "ok", skipped: "No results hours and no event in the last three hours." }, { status: 200 });
  try {
    const run = await runAsJobs("results", request);
    return Response.json({ status: run.failed ? "partial" : "ok", ...run }, { status: 200 });
  } catch (e) {
    console.error(`[results] run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
