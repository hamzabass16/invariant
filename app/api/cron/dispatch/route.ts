import { refuseUnlessCron } from "@/lib/cron-auth";
import { dispatch, jobsAvailable } from "@/lib/jobs-run";
import { logEvent } from "@/lib/log";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Waits for the workers it starts, each its own function of 800 seconds on Vercel Pro.
export const maxDuration = 800;

/**
 * The dispatcher, called by Vercel's cron at six past every hour
 * (vercel.json): the safety net for a job a cron's workers did not reach or
 * whose worker died. A retry is taken by the worker that set it (`drain`),
 * so the dispatcher no longer wakes the database every minute; once an
 * hour, right after the reviews' run has woken it, it costs next to
 * nothing (Hamza, 25 Nov 2026: the free database ran out of compute). One
 * query when nothing is due; otherwise it starts workers for the jobs due
 * and not being run, up to DISPATCH_CAP busy at once. Guarded by
 * CRON_SECRET. The response carries counts alone.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!jobsAvailable()) return Response.json({ status: "not-configured" }, { status: 503 });
  try {
    const out = await dispatch(request);
    return Response.json({ status: out.failed ? "partial" : "ok", ...out });
  } catch (e) {
    logEvent("error", "dispatch.failed", { detail: e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error" });
    return Response.json({ status: "failed" }, { status: 500 });
  }
}
