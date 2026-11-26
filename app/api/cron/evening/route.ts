import { refuseUnlessCron } from "@/lib/cron-auth";
import { runAsJobs } from "@/lib/jobs-run";
import { loadMarketDay } from "@/lib/markets-feed";
import { registryAvailable } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
// Enqueues one job per person and waits for the workers, each its own function (lib/jobs-run.ts). Per person: the Flex fetch when the statement is due (IBKR can take half a minute), the newsletters that arrived, read on their key four at a time, at most one recap with a few web searches, and the alert check after it.
export const maxDuration = 800;

/**
 * "What happened" after the close, called by Vercel's cron on weekdays at
 * 20:35 and 21:35 UTC (16:35 New York in summer and in winter: the close's
 * read lands at 16:20 and the Claude recap is written right after it; Hamza,
 * 17 Oct 2026), then at 22:30 and 23:45 UTC, when the recap newsletters
 * arrive, and again for the ones that come late, then at 00:30 and 01:30
 * UTC, since the StockMKTNewz recap often lands after midnight UTC (Hamza,
 * 23 Oct 2026; vercel.json). On Vercel Pro each schedule runs at its
 * minute (on Hobby it ran anywhere within its hour); a run that lands
 * before the close's read finds the session unchanged and writes nothing,
 * and the next one writes it (Hamza, 17 Oct 2026). Each run also
 * asks IBKR for the Flex statement of anyone whose book is older than the
 * session, and keeps it when it is newer (a trade made today shows tonight;
 * Hamza, 17 Oct 2026). Reads each
 * person's forwarded newsletters and writes the Claude recap for those who
 * chose it when the session has none yet, with why each holding moved; a
 * move of 2% or more is alerted and emailed. One job per person
 * (lib/jobs-run.ts, `eveningFor`). Guarded by CRON_SECRET. The
 * response carries counts and sentences, never an address.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled reads." }, { status: 503 });
  try {
    const now = new Date();
    // The session read once here, whole, so every person's job finds it kept.
    await loadMarketDay(now, "full").catch(() => null);
    const run = await runAsJobs("evening", request, new Date(), undefined, now.getTime());
    return Response.json({ status: run.failed ? "partial" : "ok", ...run }, { status: 200 });
  } catch (e) {
    console.error(`[evening] run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
