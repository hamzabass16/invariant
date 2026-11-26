import { refuseUnlessCron } from "@/lib/cron-auth";
import { WORKER_START_MS } from "@/lib/jobs";
import { drain, jobsAvailable } from "@/lib/jobs-run";
import { logEvent } from "@/lib/log";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// A worker starts jobs for 600 seconds and lets the last one finish inside its 800 (Vercel Pro).
export const maxDuration = 800;

/**
 * One worker (lib/jobs-run.ts): takes due jobs one at a time until none is
 * due or its time to start new ones is up. Started by the crons with their
 * own secret; anything else is refused. The response carries counts alone.
 */
export async function POST(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!jobsAvailable()) return Response.json({ status: "not-configured" }, { status: 503 });
  try {
    // The cron says how long this worker may start jobs, so the last one ends before the cron does.
    const asked = Number(new URL(request.url).searchParams.get("start"));
    const ran = await drain(Number.isFinite(asked) && asked > 0 ? Math.min(asked, WORKER_START_MS) : WORKER_START_MS);
    return Response.json({ status: "ok", ...ran });
  } catch (e) {
    logEvent("error", "worker.failed", { detail: e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error" });
    return Response.json({ status: "failed", ran: 0, done: 0, failed: 0 }, { status: 500 });
  }
}
