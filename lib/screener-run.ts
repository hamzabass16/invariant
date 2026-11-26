import "server-only";

import { unstable_cache } from "next/cache";

import { companyFacts, companyProfile, lookupCompany, operatorContact, segmentLines } from "@/lib/edgar";
import { fundamentalsOf, latestBalance } from "@/lib/edgar-facts";
import { engineOf } from "@/lib/edgar-segments";
import { filingsFileSchema } from "@/lib/filings";
import { listingRate, loadMarketDay, loadShortInterest } from "@/lib/markets-feed";
import type { EdgarContact } from "@/lib/preferences";
import { keepSharedFigures, registryAvailable, sharedFigures } from "@/lib/registry";
import { companiesToRead, EMPTY_SCREENER, keptValues, screenCompanySchema, screenerFileSchema, universeOf, withCompanies, withShared, type ScreenCompany, type ScreenerFile, type UniverseCompany } from "@/lib/screener";
import { sectorOfSic } from "@/lib/sectors";
import { shortFields, withShareCount } from "@/lib/short-interest";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

export type ScreenerRun = { read: number; failed: number; total: number; sentence: string; shared?: number };

/** How long one company's derived figures are kept for everyone: public, the same for every person who reads it that week. */
const SHARED_SECONDS = 6 * 24 * 60 * 60;

/** The Monday of the session's week: one company is derived once a week for everyone. */
function weekOf(session: string): string {
  const d = new Date(`${session}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

type Derived = { cik: number; name: string; sic: number | null; values: Record<string, number>; shares: number | null; usd: boolean };

/**
 * One company's fundamentals from its SEC facts at the session's close, kept in
 * the shared data cache for the week (the company and the session's week alone
 * in the key), so a second person's screener reads it at once. Nothing of
 * anyone's book is in it.
 */
function derived(u: UniverseCompany, session: string, contact: EdgarContact): Promise<Derived | null> {
  return unstable_cache(
    async (): Promise<Derived | null> => {
      const found = await lookupCompany(u.symbol.replace(".", "-"), contact) ?? (await lookupCompany(u.symbol, contact));
      if (!found) return null;
      const table = await companyFacts(found.cik, contact);
      const rate = await listingRate("USD", table.currency, session);
      const f = fundamentalsOf(table, u.close, "USD", rate.fx);
      // The SEC industry code places a company the S&P 500's list does not among its peers; a profile that cannot be read costs the code alone.
      const sic = await companyProfile(found.cik, contact).then((p) => p.sic).catch((e) => {
        if (!(e instanceof SyncError)) throw e;
        return null;
      });
      // The engine from the filing's own segment note, as for a holding; a note that cannot be read leaves company revenue growth standing in.
      const segments = await segmentLines(found.cik, contact).catch((e) => {
        if (!(e instanceof SyncError)) throw e;
        return null;
      });
      const engine = engineOf(segments, f.values.revenue_growth_pct);
      return { cik: found.cik, name: found.title, sic, values: keptValues({ ...f.values, ...engine.values }), shares: latestBalance(table, "sharesOutstanding")?.value ?? table.ttm.dilutedShares ?? null, usd: table.currency === "USD" };
    },
    ["screener-company-4", u.symbol, weekOf(session)],
    { revalidate: SHARED_SECONDS },
  )();
}

/**
 * The companies picked, read three at a time (the SEC asks for no more than
 * ten requests a second), none started past `budgetMs` from `started`: each
 * one's row, or its sentence when the SEC lists no company under the symbol
 * or its facts cannot be read.
 */
async function readCompanies(picks: readonly UniverseCompany[], session: string, contact: EdgarContact, readAt: string, started: number, budgetMs: number): Promise<ScreenCompany[]> {
  const read: ScreenCompany[] = [];
  const queue = [...picks];
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      if (Date.now() - started > budgetMs) return;
      const base = { symbol: u.symbol, name: u.name, sector: u.sector, subIndustry: u.subIndustry, cap: u.cap, price: u.close, readAt };
      try {
        const d = await derived(u, session, contact);
        read.push(d ? { ...base, name: u.name ?? d.name, cik: d.cik, sic: d.sic, sector: u.sector ?? sectorOfSic(d.sic), values: d.values, shares: d.shares, usd: d.usd, error: null } : { ...base, cik: null, sic: null, values: {}, shares: null, usd: true, error: "the SEC lists no company under this symbol" });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[screener] a company: ${e.logDetail ?? "failed"}`);
        read.push({ ...base, cik: null, sic: null, values: {}, shares: null, usd: true, error: e.message.slice(0, 300) });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return read;
}

/** The deployment's shared rows, parsed; none when the registry is not set up or cannot be read, and the run reads as before. */
async function sharedRows(): Promise<ScreenCompany[] | null> {
  if (!registryAvailable()) return null;
  try {
    const rows = await sharedFigures("screen");
    return rows.flatMap((r) => {
      const c = screenCompanySchema.safeParse(r.entry);
      return c.success ? [c.data] : [];
    });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[screener] shared rows: ${e.logDetail ?? "failed"}`);
    return null;
  }
}

/** Keeps a run's reads for everyone; a registry that cannot be written costs the sharing, never the run. */
async function share(read: readonly ScreenCompany[]): Promise<void> {
  if (!read.length || !registryAvailable()) return;
  await keepSharedFigures("screen", read.map((c) => ({ symbol: c.symbol, entry: c, readAt: c.readAt }))).catch((e) => {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[screener] sharing: ${e.logDetail ?? "failed"}`);
  });
}

/**
 * The deployment's own pass over the S&P 500 and the Nasdaq-100, at the
 * 05:00 UTC run before anyone's share (Hamza, 23 Oct 2026: each company's
 * figures read once for everyone): the companies the shared table has never
 * read first, the largest first, then the ones read longest ago, `max` in
 * all, with the deployment's own SEC contact (SEC_CONTACT, else the inbox).
 * Public figures alone, kept in the registry's company_figures; no vault is
 * opened and nothing of anyone's book is read. No model.
 */
export async function fillSharedCompanies(now: Date, max: number, budgetMs: number): Promise<ScreenerRun> {
  const started = Date.now();
  const contact = operatorContact();
  if (!contact) return { read: 0, failed: 0, total: 0, sentence: "This deployment names no contact for the SEC (SEC_CONTACT), so each person's run reads its own share." };
  const shared = await sharedRows();
  if (!shared) return { read: 0, failed: 0, total: 0, sentence: "The registry is not set up, so each person's run reads its own share." };
  const { day } = await loadMarketDay(now, "full");
  if (!day?.moves.length) return { read: 0, failed: 0, total: 0, sentence: "The S&P 500's list could not be read, so the shared read waits for the next run." };
  const universe = universeOf(day);
  const file: ScreenerFile = { ...EMPTY_SCREENER, universe: universe.map((u) => u.symbol), bySymbol: Object.fromEntries(shared.map((c) => [c.symbol, c])) };
  const picks = companiesToRead(universe, file, localDay(now), max);
  const read = await readCompanies(picks, day.session, contact, now.toISOString(), started, budgetMs);
  await share(read);
  const failed = read.filter((r) => r.error).length;
  const have = new Set([...shared.filter((c) => !c.error).map((c) => c.symbol), ...read.filter((c) => !c.error).map((c) => c.symbol)]);
  const listedHave = universe.filter((u) => have.has(u.symbol)).length;
  return { read: read.length - failed, failed, total: universe.length, shared: listedHave, sentence: `Shared: ${read.length - failed} companies read${failed ? `, ${failed} not` : ""}; ${listedHave} of ${universe.length} on file for everyone.` };
}

/**
 * Lays the next share of the S&P 500 and the Nasdaq-100 on the vault's
 * screener file, with the contact the person confirmed: first every company
 * the deployment has read for everyone since (`withShared`, no SEC call),
 * then, of what is still due, the companies never read first, the largest
 * first, then the ones read longest ago, `max` in all and none started past
 * `budgetMs`; what this run reads is kept for everyone too. The figures are
 * the filings' own at the session's close (lib/edgar-facts.ts, as for a
 * holding); short interest from FINRA's latest file, one file for all. A
 * company the SEC lists under no symbol, or whose facts cannot be read,
 * keeps a sentence, and its last good figures when it had them. No model.
 */
export async function readScreenerInto(vault: Vault, contact: EdgarContact, now: Date, max: number, budgetMs: number): Promise<ScreenerRun> {
  const started = Date.now();
  const today = localDay(now);
  const { day } = await loadMarketDay(now, "full");
  if (!day?.moves.length) return { read: 0, failed: 0, total: 0, sentence: "The S&P 500's list could not be read, so the screener waits for the next run." };
  const universe = universeOf(day);
  const kept = (await vault.readJson("screener", screenerFileSchema).catch(() => null)) ?? EMPTY_SCREENER;
  const own = await vault.readJson("filings", filingsFileSchema).catch(() => null);
  const ownSymbols = new Set(Object.entries(own?.bySymbol ?? {}).filter(([, e]) => !e.error).map(([k]) => k.toUpperCase()));
  const shared = await sharedRows();
  const { file: prev, adopted } = shared ? withShared(kept, shared, universe, ownSymbols) : { file: kept, adopted: 0 };
  const picks = companiesToRead(universe, prev, today, max, ownSymbols);
  const readAt = now.toISOString();
  const fresh = await readCompanies(picks, day.session, contact, readAt, started, budgetMs);
  await share(fresh);
  const read = [...fresh];
  // The companies held or watched carry their own read; the list keeps their place with the session's price and market value.
  for (const u of universe) {
    const e = own?.bySymbol[u.symbol];
    if (e && !e.error && !read.some((r) => r.symbol === u.symbol)) read.push({ symbol: u.symbol, name: u.name ?? e.name, cik: e.cik, sector: u.sector ?? e.sector ?? null, subIndustry: u.subIndustry ?? e.subIndustry ?? null, sic: e.sic ?? null, cap: u.cap, price: u.close, readAt: e.readAt, values: keptValues(e.values), shares: null, usd: true, error: null });
  }
  const file = withCompanies(prev, universe, read, readAt);
  // Short interest for every company with figures, from FINRA's one file; a file that cannot be read keeps what was laid before.
  const short = await loadShortInterest(Object.keys(file.bySymbol), today);
  if (short.settlement) {
    for (const c of Object.values(file.bySymbol)) {
      if (c.error) continue;
      const row = short.rows.get(c.symbol.replace(".", "").toUpperCase()) ?? short.rows.get(c.symbol);
      const s = shortFields(row ? withShareCount(row, short.settlement, c.shares, c.usd) : null);
      for (const [k, v] of Object.entries(s)) {
        if (v === null) delete c.values[k];
        else c.values[k] = Number(v.toPrecision(4));
      }
    }
  }
  await vault.writeJson("screener", screenerFileSchema.parse(file));
  const failed = fresh.filter((r) => r.error).length;
  const have = Object.values(file.bySymbol).filter((c) => !c.error).length;
  return { read: fresh.length - failed, failed, total: universe.length, shared: adopted, sentence: `Screener: ${fresh.length - failed} companies read${failed ? `, ${failed} not` : ""}${adopted ? `, ${adopted} from the shared read` : ""}; ${have} of ${universe.length} on file.` };
}
