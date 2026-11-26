import { refuseUnlessCron } from "@/lib/cron-auth";
import { runAsJobs } from "@/lib/jobs-run";
import { registryAvailable } from "@/lib/registry";
import { loadEconomies, loadMarketDay } from "@/lib/markets-feed";
import { localDay } from "@/lib/time";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Reads what is the same for everyone, then enqueues one job per person and waits for the workers, each its own function (lib/jobs-run.ts).
export const maxDuration = 800;

/**
 * The morning run, called by Vercel's cron at 06:00 UTC (vercel.json). First
 * what is the same for everyone: the last session and the economies map.
 * Then one job per enrolled person (lib/jobs-run.ts), each the morning
 * refresh (lib/daily-sync.ts: the IBKR Flex statement, the brokers, the
 * statements inbox, the filings), then the morning alert check (the evening
 * one is /api/cron/alerts). The reviews go out from /api/cron/reviews, every
 * hour at the person's own hour. A refresh that fails keeps the last good
 * figures.
 * Guarded by CRON_SECRET. The response carries counts, never an address, a
 * token or a report.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled reports." }, { status: 503 });
  try {
    const now = new Date();
    // The last session for the Markets today screen, read once here after the close so the morning's first page has it.
    const session = await loadMarketDay(now, "full").catch(() => ({ day: null, pending: null }));
    // And the economies map, which changes at most daily, read in full here so no page waits on the publishers.
    const economies = await loadEconomies(localDay(), "full").catch(() => null);
    const run = await runAsJobs("morning", request, now, undefined, now.getTime());
    return Response.json({ status: run.failed ? "partial" : "ok", ...run, session: session.day ? { session: session.day.session, companies: session.day.moves.length } : null, economies: economies ? { year: economies.year, problems: economies.problems.length } : null }, { status: 200 });
  } catch (e) {
    console.error(`[report] run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
