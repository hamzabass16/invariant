import { refuseUnlessCron } from "@/lib/cron-auth";
import { CREEDS_PER_RUN } from "@/lib/fund-creeds";
import { readEtfFlows } from "@/lib/etf-flows-run";
import { readFlowSources } from "@/lib/flows-run";
import { readFundCreeds } from "@/lib/fund-creeds-run";
import { ECO_PER_RUN } from "@/lib/ecosystem";
import { readEcosystems } from "@/lib/ecosystem-run";
import { usageWords } from "@/lib/db-usage";
import { runAsJobs } from "@/lib/jobs-run";
import { logEvent } from "@/lib/log";
import { databaseUsage } from "@/lib/neon-usage";
import { registryAvailable } from "@/lib/registry";
import { SHARED_PER_RUN } from "@/lib/screener";
import { fillSharedCompanies } from "@/lib/screener-run";
import { SyncError } from "@/lib/sync-error";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** The deployment's own read for everyone, first, at most. */
const SHARED_BUDGET_MS = 120_000;
/** The funds' own words, read for everyone after it, at most. */
const CREEDS_BUDGET_MS = 150_000;
/** The ETFs' flows from their N-PORT reports, read for everyone after them, at most. */
const FLOWS_BUDGET_MS = 120_000;
/** The Flows screen's other sources (the CFTC, the Treasury's TIC, the OFR, the SEC's insider data set), at most. */
const SOURCES_BUDGET_MS = 90_000;
/** The companies' ecosystems from their annual reports, read for everyone after them, at most. */
const ECO_BUDGET_MS = 90_000;

/**
 * The screener's and the top funds' daily pass, called by Vercel's cron at
 * 05:00 UTC (vercel.json), before the morning refresh: for every enrolment
 * with a confirmed SEC contact, one job (lib/jobs-run.ts): the funds due a
 * look (lib/funds-run.ts), then, when their methodology sorts companies into
 * classes, the next share of the S&P 500 and the Nasdaq-100
 * (lib/screener-run.ts). First the
 * deployment reads its own share for everyone with its own SEC contact
 * (`fillSharedCompanies`, kept in the registry's company_figures), so each
 * person's run lays those reads on their file and reads only what is left;
 * then what the funds due a reading say they do, from their own pages
 * (`readFundCreeds`, lib/fund-creeds.ts), once a quarter for everyone; then
 * the largest ETFs' monthly flows from their N-PORT reports (`readEtfFlows`,
 * lib/etf-flows.ts), each fund once a week; then the Flows screen's other
 * sources, each when due (`readFlowSources`, lib/flows.ts); then the
 * companies' ecosystems from their annual reports, once per report
 * (`readEcosystems`, lib/ecosystem.ts).
 * Public filings alone; nothing of anyone's book is in the shared rows. Guarded by CRON_SECRET.
 * The response carries counts, never an address or a symbol.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  if (!registryAvailable()) return Response.json({ status: "not-configured", reason: "Set DATABASE_URL and REPORT_KEY to turn on scheduled runs." }, { status: 503 });
  const now = new Date();
  const started = Date.now();
  const summary = { shared: 0, creeds: 0, flows: 0, sources: 0, eco: 0, failed: [] as string[] };
  // The database's compute this month, one line a day, so the drop after 25 Nov 2026 can be checked in the logs.
  await databaseUsage()
    .then((u) => (u ? logEvent("info", "db.usage", { cuHours: Math.round(u.cuHours * 10) / 10, activeHours: Math.round(u.activeHours), plan: u.plan, words: usageWords(u, now) }) : undefined))
    .catch((err: unknown) => logEvent("warn", "db.usage_unread", { detail: err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error" }));
  try {
    try {
      summary.shared = (await fillSharedCompanies(now, SHARED_PER_RUN, SHARED_BUDGET_MS)).read;
    } catch (err) {
      console.error(`[screener] shared read failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
      summary.failed.push(err instanceof SyncError ? err.message : "The shared read could not finish.");
    }
    try {
      summary.creeds = (await readFundCreeds(now, CREEDS_PER_RUN, CREEDS_BUDGET_MS)).read;
    } catch (err) {
      console.error(`[screener] funds' words failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
      summary.failed.push(err instanceof SyncError ? err.message : "The funds' own words could not be read.");
    }
    try {
      summary.flows = (await readEtfFlows(now, FLOWS_BUDGET_MS)).read;
    } catch (err) {
      console.error(`[screener] etf flows failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
      summary.failed.push(err instanceof SyncError ? err.message : "The ETFs' flows could not be read.");
    }
    try {
      summary.sources = (await readFlowSources(now, SOURCES_BUDGET_MS)).read.length;
    } catch (err) {
      console.error(`[screener] flow sources failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
      summary.failed.push(err instanceof SyncError ? err.message : "The flow sources could not be read.");
    }
    try {
      summary.eco = (await readEcosystems(now, ECO_PER_RUN, ECO_BUDGET_MS)).read;
    } catch (err) {
      console.error(`[screener] ecosystems failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
      summary.failed.push(err instanceof SyncError ? err.message : "The companies' ecosystems could not be read.");
    }
    // Two workers at a time: each reads its companies three at a time, within the SEC's ten requests a second.
    const run = await runAsJobs("screener", request, now, 2, started);
    console.info(`[screener] shared ${summary.shared}, creeds ${summary.creeds}, flows ${summary.flows}, sources ${summary.sources}, eco ${summary.eco}, queued ${run.queued}, ran ${run.ran}, failed ${run.failed}`);
    return Response.json({ status: summary.failed.length || run.failed ? "partial" : "ok", ...summary, ...run, failed: summary.failed, jobsFailed: run.failed }, { status: 200 });
  } catch (e) {
    console.error(`[screener] run failed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return Response.json({ status: "failed", reason: e instanceof SyncError ? e.message : "The run could not start." }, { status: 500 });
  }
}
