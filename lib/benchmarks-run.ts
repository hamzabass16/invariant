import "server-only";

import { companyFacts, latestFundHoldings, lookupCompany } from "@/lib/edgar";
import { fundamentalsOf } from "@/lib/edgar-facts";
import { filingsFileSchema } from "@/lib/filings";
import { BENCHMARK_FUNDS, benchmarksFileSchema, companiesToRead, EMPTY_BENCHMARKS, isBenchmarkFund, MAX_COMPANIES, type BenchmarksFile, type Constituent, type FundLook } from "@/lib/look-through";
import { issuersOf } from "@/lib/nport";
import type { EdgarContact } from "@/lib/preferences";
import { registryAvailable, sharedFigures } from "@/lib/registry";
import { screenCompanySchema } from "@/lib/screener";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/** The figures the app keeps for everyone, by the company's CIK: public, the same for every person; none when the registry is not set up or cannot be read. */
async function sharedByCik(): Promise<Map<number, Record<string, number | null>>> {
  const out = new Map<number, Record<string, number | null>>();
  if (!registryAvailable()) return out;
  try {
    for (const r of await sharedFigures("screen")) {
      const c = screenCompanySchema.safeParse(r.entry);
      if (c.success && !c.data.error && c.data.cik && Object.keys(c.data.values).length) out.set(c.data.cik, c.data.values);
    }
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[benchmarks] shared figures: ${e.logDetail ?? "failed"}`);
  }
  return out;
}

export type BenchmarksRun = { funds: string[]; companies: number; failed: number; problems: string[] };

/**
 * SPY's and QQQ's look-through, read from SEC EDGAR with the contact the
 * person confirmed, each morning (Hamza, 24 Oct 2026: daily, so a season's
 * results count as they are filed): each fund's latest N-PORT holdings
 * report, then every company in it, largest first: from the person's own
 * filings file, else from the figures the app keeps for everyone (the
 * screener's shared reads, lib/registry.ts company_figures), else from its
 * SEC company facts (MAX_COMPANIES at most a run), derived exactly as the
 * book's own (lib/edgar-facts.ts fundamentalsOf). Kept in the vault's benchmarks file;
 * a fund that cannot be read keeps its last good copy and a sentence. No
 * model, nothing of the person's book leaves the app.
 */
export async function readBenchmarksInto(vault: Vault, contact: EdgarContact, symbols: readonly string[], now: Date = new Date()): Promise<BenchmarksRun> {
  const prev = (await vault.readJson("benchmarks", benchmarksFileSchema).catch(() => null)) ?? EMPTY_BENCHMARKS;
  const own = await vault.readJson("filings", filingsFileSchema).catch(() => null);
  const ownByCik = new Map(Object.values(own?.bySymbol ?? {}).filter((e) => e.cik && !e.error).map((e) => [e.cik as number, e]));
  const problems: string[] = [];
  const reports: { symbol: string; cik: number; accession: string; filed: string; reportDate: string; issuers: { name: string; pct: number }[] }[] = [];
  for (const symbol of symbols.filter(isBenchmarkFund)) {
    const { cik, name } = BENCHMARK_FUNDS[symbol];
    try {
      const { filing, report } = await latestFundHoldings(cik, contact);
      reports.push({ symbol, cik, accession: filing.accession, filed: filing.filed, reportDate: report.reportDate, issuers: issuersOf(report) });
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[benchmarks] ${symbol}: ${e.logDetail ?? "failed"}`);
      problems.push(`${symbol} (${name}): ${e.message}${prev.funds[symbol] ? " The last copy stays." : ""}`);
    }
  }
  // Every company of both funds, largest first: the person's own filings, else the figures the app keeps for everyone (the screener's shared reads of the S&P 500 and the Nasdaq-100), else read from the SEC, MAX_COMPANIES at most.
  const wanted = companiesToRead(reports, Infinity);
  const shared = await sharedByCik();
  const read = new Map<string, Omit<Constituent, "name" | "pct">>();
  const queue: { name: string; cik: number; ticker: string }[] = [];
  for (const name of wanted) {
    const found = await lookupCompany(name, contact).catch((e) => {
      if (!(e instanceof SyncError)) throw e;
      return null;
    });
    if (!found) {
      read.set(name.toUpperCase(), { ticker: null, cik: null, values: {}, error: "the SEC lists no company under this name" });
      continue;
    }
    const mine = ownByCik.get(found.cik);
    const kept = mine?.values ?? shared.get(found.cik);
    if (kept) read.set(name.toUpperCase(), { ticker: found.ticker, cik: found.cik, values: kept, error: null });
    else if (queue.length < MAX_COMPANIES) queue.push({ name, cik: found.cik, ticker: found.ticker });
  }
  // A few at a time: the SEC asks for no more than ten requests a second.
  const worker = async () => {
    for (let q = queue.shift(); q; q = queue.shift()) {
      try {
        const f = fundamentalsOf(await companyFacts(q.cik, contact), null);
        read.set(q.name.toUpperCase(), { ticker: q.ticker, cik: q.cik, values: Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, v ?? null])), error: null });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[benchmarks] a company: ${e.logDetail ?? "failed"}`);
        read.set(q.name.toUpperCase(), { ticker: q.ticker, cik: q.cik, values: {}, error: e.message.slice(0, 300) });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const funds: Record<string, FundLook> = { ...prev.funds };
  for (const r of reports) {
    const constituents: Constituent[] = r.issuers.slice(0, 600).map((i) => {
      const got = read.get(i.name.toUpperCase());
      return got ? { name: i.name, pct: i.pct, ...got } : { name: i.name, pct: i.pct, ticker: null, cik: null, values: {}, error: "not read yet: beyond the companies read this morning" };
    });
    // A refresh that read none of the fund's companies (the SEC refusing, say) never replaces a good copy.
    if (!constituents.some((c) => !c.error) && prev.funds[r.symbol]?.constituents.some((c) => !c.error)) {
      problems.push(`${r.symbol}: none of its companies could be read this time. The last copy stays.`);
      continue;
    }
    funds[r.symbol] = { symbol: r.symbol, cik: r.cik, accession: r.accession, reportDate: r.reportDate, filed: r.filed, constituents };
  }
  const file: BenchmarksFile = benchmarksFileSchema.parse({ version: 1, funds, problems, updated: now.toISOString() });
  if (reports.length || problems.length) await vault.writeJson("benchmarks", file);
  const failed = [...read.values()].filter((c) => c.error).length;
  return { funds: reports.map((r) => r.symbol), companies: read.size - failed, failed, problems };
}
