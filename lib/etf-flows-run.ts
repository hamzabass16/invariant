import "server-only";

import { fundTickers, nportFilings, nportStart, operatorContact } from "@/lib/edgar";
import {
  etfFlows,
  FLOW_FUNDS,
  FUND_INFO_END,
  fundFlowSchema,
  fundsDue,
  GEN_INFO_END,
  mergeMonths,
  nportSeriesOf,
  parseNportFlows,
  REPORT_LOOKBACK_DAYS,
  reportsFor,
  seriesIndexSchema,
  type EtfFlows,
  type FlowFund,
  type FundFlow,
  type NportFlows,
  type NportRef,
  type SeriesIndex,
} from "@/lib/etf-flows";
import { keepSharedFigures, registryAvailable, sharedFigures } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";
import { addDaysTo, localDay } from "@/lib/time";

/** The funds' reads kept for everyone, by ticker; a row that fails its schema is left out. Empty with no registry. */
export async function keptFundFlows(): Promise<Record<string, FundFlow>> {
  if (!registryAvailable()) return {};
  const out: Record<string, FundFlow> = {};
  for (const r of await sharedFigures("etf_flow")) {
    const k = fundFlowSchema.safeParse(r.entry);
    if (k.success) out[r.symbol] = k.data;
  }
  return out;
}

/** Where the money in the largest US ETFs went, from the reads kept for everyone (lib/etf-flows.ts). */
export async function etfFlowsNow(): Promise<EtfFlows> {
  return etfFlows(FLOW_FUNDS, await keptFundFlows());
}

export type FlowsRun = { read: number; failed: number; sentence: string };

/**
 * The ETFs' flows, read for everyone at the 05:00 UTC run with the
 * deployment's own SEC contact: the funds due (lib/etf-flows.ts fundsDue),
 * trust by trust, none started past `budgetMs`. A trust that files for many
 * series (iShares Trust files hundreds a quarter) is indexed once: each new
 * NPORT-P's general information is read for the series it reports, kept by
 * the trust's CIK, so a later run reads only what was filed since. Then each
 * fund's two latest reports, read only up to the end of its fund information.
 * Public filings alone; a failed read keeps the last good months.
 */
export async function readEtfFlows(now: Date, budgetMs: number): Promise<FlowsRun> {
  const started = Date.now();
  const over = () => Date.now() - started > budgetMs;
  if (!registryAvailable()) return { read: 0, failed: 0, sentence: "The registry is not set up, so the ETFs' flows are not read." };
  const contact = operatorContact();
  if (!contact) return { read: 0, failed: 0, sentence: "This deployment names no SEC contact (SEC_CONTACT), so the ETFs' flows are not read." };
  const kept = await keptFundFlows();
  const due = fundsDue(FLOW_FUNDS, kept, now);
  if (!due.length) return { read: 0, failed: 0, sentence: "Every ETF's flows are current." };
  const tickers = await fundTickers(contact);
  const indexes = new Map<number, SeriesIndex>();
  for (const r of await sharedFigures("nport_index")) {
    const ix = seriesIndexSchema.safeParse(r.entry);
    if (ix.success) indexes.set(ix.data.cik, ix.data);
  }
  const since = addDaysTo(localDay(now), -REPORT_LOOKBACK_DAYS);
  const readAt = () => new Date().toISOString();
  const fail = (x: FlowFund, sentence: string): FundFlow => ({ ...(kept[x.symbol] ?? { symbol: x.symbol, bucket: x.bucket, name: null, reports: [], months: [] }), bucket: x.bucket, readAt: readAt(), error: sentence });

  // The funds due, by trust: a trust's filings are listed once for all its funds.
  const where = new Map<number, { fund: FlowFund; seriesId: string | null }[]>();
  const rows: { symbol: string; entry: unknown; readAt: string }[] = [];
  for (const x of due) {
    const listed = tickers.get(x.symbol);
    const cik = listed?.cik ?? x.cik;
    if (!cik) {
      rows.push({ symbol: x.symbol, entry: fail(x, "The SEC's fund list does not name this ticker."), readAt: readAt() });
      continue;
    }
    const list = where.get(cik) ?? [];
    list.push({ fund: x, seriesId: listed?.seriesId ?? null });
    where.set(cik, list);
  }

  let read = 0;
  let failed = rows.length;
  const changed: SeriesIndex[] = [];
  for (const [cik, funds] of where) {
    if (over()) break;
    let filings: NportRef[];
    try {
      filings = await nportFilings(cik, contact, since);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[etf-flows] a trust's filings: ${e.logDetail ?? "failed"}`);
      for (const { fund } of funds) rows.push({ symbol: fund.symbol, entry: fail(fund, e.message), readAt: readAt() });
      failed += funds.length;
      continue;
    }
    const wanted = new Set(funds.map((f) => f.seriesId).filter((s): s is string => !!s));
    const index = indexes.get(cik) ?? { cik, bySeries: {}, readAt: readAt() };
    // Index the filings not yet placed, newest first, until every series wanted has its two reports or the budget is spent.
    const enough = () => [...wanted].every((s) => reportsFor(filings, index.bySeries, s).length >= 2);
    let indexed = false;
    if (wanted.size) {
      for (const ref of filings) {
        if (over() || enough()) break;
        if (index.bySeries[ref.accession]) continue;
        try {
          const head = nportSeriesOf(await nportStart(cik, ref, GEN_INFO_END, contact));
          index.bySeries[ref.accession] = head.seriesId ?? "none";
          indexed = true;
        } catch (e) {
          console.error(`[etf-flows] a filing's series: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "not an N-PORT"}`);
          index.bySeries[ref.accession] = "none";
          indexed = true;
        }
      }
    }
    if (indexed) changed.push({ ...index, readAt: readAt() });

    for (const { fund, seriesId } of funds) {
      if (over()) break;
      const refs = reportsFor(filings, index.bySeries, seriesId);
      if (!refs.length) {
        // A trust not yet indexed far enough is read again next run, not failed.
        if (seriesId && !enough() && filings.some((r) => !index.bySeries[r.accession])) continue;
        rows.push({ symbol: fund.symbol, entry: fail(fund, "SEC EDGAR lists no recent N-PORT report for this fund."), readAt: readAt() });
        failed += 1;
        continue;
      }
      try {
        const reports: NportFlows[] = [];
        for (const ref of refs) reports.push(parseNportFlows(await nportStart(cik, ref, FUND_INFO_END, contact)));
        if (fund.named && !reports.every((r) => (r.name ?? "").toUpperCase().includes(fund.named!.toUpperCase()))) {
          throw new SyncError("The filing found for this fund names another fund.", "etf flows name mismatch");
        }
        const entry: FundFlow = {
          symbol: fund.symbol,
          bucket: fund.bucket,
          name: reports[0].name,
          reports: refs.map((ref, i) => ({ accession: ref.accession, reportDate: reports[i].reportDate, netAssets: reports[i].netAssets })),
          months: mergeMonths(reports),
          readAt: readAt(),
          error: null,
        };
        rows.push({ symbol: fund.symbol, entry, readAt: entry.readAt });
        read += 1;
      } catch (e) {
        const sentence = e instanceof SyncError ? e.message : "The fund's N-PORT report carries no flows that could be read.";
        console.error(`[etf-flows] a fund's report: ${e instanceof SyncError ? (e.logDetail ?? "failed") : e instanceof Error ? e.message.slice(0, 80) : "unknown"}`);
        rows.push({ symbol: fund.symbol, entry: fail(fund, sentence), readAt: readAt() });
        failed += 1;
      }
    }
  }
  if (changed.length) await keepSharedFigures("nport_index", changed.map((ix) => ({ symbol: String(ix.cik), entry: ix, readAt: ix.readAt })));
  await keepSharedFigures("etf_flow", rows);
  return { read, failed, sentence: `${read} ETFs' flows read${failed ? `, ${failed} not` : ""}.` };
}
