import "server-only";
import { flowFromFacts } from "@/lib/income-flow";

import { unstable_cache } from "next/cache";
import { z } from "zod";

import type { Histories } from "@/components/theses/valuation-history";
import { companyFacts, companyProfile, companySubmissions, filingLink, insiderForms, lookupCompany } from "@/lib/edgar";
import { quartersOf } from "@/lib/earnings";
import { fundamentalsOf, latestBalance, studyTable, ttmEpsHistory, ttmPerShareHistory } from "@/lib/edgar-facts";
import { filingEntrySchema, type FilingEntry } from "@/lib/filings";
import { atPrice, consensusPe } from "@/lib/forward";
import { insiderFields, INSIDER_READ_DAYS, withForms, type Insiders } from "@/lib/insiders";
import type { Closes } from "@/lib/markets";
import { listingRate, loadCloses, loadConsensus, loadShortInterest } from "@/lib/markets-feed";
import type { EdgarContact } from "@/lib/preferences";
import { keepSharedFigures, registryAvailable, sharedFigures } from "@/lib/registry";
import { sectorOfSic, SIC_BASIS } from "@/lib/sectors";
import { shortFields, withShareCount } from "@/lib/short-interest";
import { SyncError } from "@/lib/sync-error";
import { addDaysTo, daysBetween } from "@/lib/time";
import { releaseDays, REACTION_HISTORY, type ReleaseDay } from "@/lib/reaction-history";
import { HISTORY_DAYS, HISTORY_METRICS, valuationHistory, type HistoryMetric, type ValuationHistory } from "@/lib/valuation-history";

/**
 * Five years of each trailing multiple: the weekly closes over the per-share
 * figures the filings kept, carried to the listing's currency at the day's
 * rate (an unread rate leaves the filings' own and says so; the low and the
 * percentile do not depend on it).
 */
export async function historiesFor(symbol: string, entry: Pick<FilingEntry, "perShareTtm" | "perShareCurrency" | "consensus"> | null, priceCurrency: string, demo: boolean, today: string, read?: Closes): Promise<Histories> {
  const rows = entry?.perShareTtm ?? [];
  const c = entry?.consensus ?? null;
  const consensusAt = (price: number | null) => (c ? { pe: consensusPe(price, priceCurrency, c), words: c.words, readAt: c.readAt } : null);
  const none = Object.fromEntries(HISTORY_METRICS.map((m) => [m, null])) as Record<HistoryMetric, ValuationHistory | null>;
  if (!rows.length) return { byMetric: none, consensus: consensusAt(null), note: demo ? "The demo keeps no quarterly history." : "The filings read has not kept the quarterly per-share figures yet; the chart fills after the next morning's read." };
  const [closes, rate] = await Promise.all([read ?? loadCloses(symbol, today, "budget", HISTORY_DAYS), demo ? Promise.resolve(demoRate(priceCurrency, entry?.perShareCurrency ?? null)) : listingRate(priceCurrency, entry?.perShareCurrency ?? null, today)]);
  const points = closes.series[symbol] ?? [];
  const note = !points.length ? (closes.problems[0] ?? "No closes came back.") : rate.fx === null ? `Per-share figures in ${entry?.perShareCurrency} against a price in ${priceCurrency}; ${rate.note ?? "no rate could be read"}.` : null;
  const byMetric = Object.fromEntries(HISTORY_METRICS.map((m) => [m, points.length ? valuationHistory(m, points, rows, today, rate.fx ?? 1) : null])) as Record<HistoryMetric, ValuationHistory | null>;
  return { byMetric, note, consensus: consensusAt(points.at(-1)?.value ?? null), price: points.at(-1)?.value ?? null };
}

/** The demo reads no rate: the showcase's own, 3 Nov 2026, in US dollars per unit (the krone through its peg to the euro). */
const DEMO_USD_PER: Readonly<Record<string, number>> = { USD: 1, EUR: 1.1358, DKK: 0.15225 };

function demoRate(priceCurrency: string, filingsCurrency: string | null): { fx: number | null; note: string | null } {
  const from = DEMO_USD_PER[(filingsCurrency ?? priceCurrency).toUpperCase()];
  const to = DEMO_USD_PER[priceCurrency.toUpperCase()];
  return from && to ? { fx: from / to, note: null } : { fx: 1, note: null };
}

/** How long a company's on-demand read is shared from the data cache. */
const PUBLIC_READ_SECONDS = 12 * 60 * 60;

/**
 * The filings of a company the person neither holds nor watches, read when
 * its page is opened (Hamza, 21 Oct 2026: a company page for any public
 * company): the company behind the ticker in the SEC's list, its facts and
 * the ontology's fundamentals at the last close, the profile's sector and
 * country, the insiders' Form 4s and FINRA's short interest. Kept for the
 * week in the registry for everyone (`sharedPage`) and for the day in the
 * data cache under the ticker alone, so the next person opening it reads
 * nothing; nothing is kept in a vault. The segment note and the
 * geography, which read the whole XBRL instance, are left to the morning
 * read of a holding or watchlist company. Null when the SEC lists no company
 * under the ticker; a read that fails is an entry with its sentence.
 */
export async function publicCompanyEntry(symbol: string, price: number | null, contact: EdgarContact, today: string): Promise<FilingEntry | null> {
  return unstable_cache(
    async () => {
      const kept = await sharedPage(symbol, today);
      if (kept) return { ...kept.entry, values: atPrice(kept.entry.values, kept.price, price) };
      const entry = await readPublicCompany(symbol, price, contact, today);
      if (entry && !entry.error) await keepPage(symbol, entry, price);
      return entry;
    },
    ["company-entry-2", symbol, today],
    { revalidate: PUBLIC_READ_SECONDS },
  )();
}

/** How long a company page's read is kept for everyone in the registry before the next opening reads the SEC again. */
const PAGE_KEEP_DAYS = 7;

const sharedPageSchema = z.object({ entry: filingEntrySchema, price: z.number().nullable() });

/**
 * A company page's read kept for everyone (Hamza, 23 Oct 2026: a company
 * outside the lists read on search, then cached for all): the public read
 * and the price it was made at, so the next person, any day that week, opens
 * it at once with every multiple laid at their close (`atPrice`). None when
 * the registry is not set up, cannot be read, or the read is older than
 * PAGE_KEEP_DAYS.
 */
async function sharedPage(symbol: string, today: string): Promise<z.infer<typeof sharedPageSchema> | null> {
  if (!registryAvailable()) return null;
  try {
    const [row] = await sharedFigures("page", [symbol]);
    if (!row || daysBetween(row.readAt.slice(0, 10), today) >= PAGE_KEEP_DAYS) return null;
    const parsed = sharedPageSchema.safeParse(row.entry);
    return parsed.success && !parsed.data.entry.error ? parsed.data : null;
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return null;
  }
}

async function keepPage(symbol: string, entry: FilingEntry, price: number | null): Promise<void> {
  if (!registryAvailable()) return;
  await keepSharedFigures("page", [{ symbol, entry: { entry, price }, readAt: entry.readAt }]).catch((e) => {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[company] sharing a page: ${e.logDetail ?? "failed"}`);
  });
}

async function readPublicCompany(symbol: string, price: number | null, contact: EdgarContact, today: string): Promise<FilingEntry | null> {
  const readAt = new Date().toISOString();
  try {
    // The SEC lists a class share with a dash (BRK-B) where a listing carries a dot.
    const dashed = symbol.replace(".", "-");
    const hit = await lookupCompany(symbol, contact);
    const found = hit && (hit.ticker === symbol || hit.ticker === dashed) ? hit : dashed !== symbol ? await lookupCompany(dashed, contact) : null;
    if (!found || (found.ticker !== symbol && found.ticker !== dashed)) return null;
    const table = await companyFacts(found.cik, contact);
    const rate = await listingRate("USD", table.currency, today);
    const f = fundamentalsOf(table, price, "USD", rate.fx);
    if (rate.fx === null && rate.note) f.notes.push(`pe_ratio, dividend_yield_pct: ${rate.note}`);
    f.notes.push("engine and geography: read each morning for a holding or watchlist company");
    let profile: { sic: number | null; industry: string | null; country: string | null } = { sic: null, industry: null, country: null };
    try {
      profile = await companyProfile(found.cik, contact);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
    }
    let insiders: Insiders | undefined;
    try {
      const got = await insiderForms(found.cik, contact, addDaysTo(today, -INSIDER_READ_DAYS), []);
      insiders = withForms(undefined, got.forms, got.waiting, readAt);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      f.notes.push(`insiders: ${e.message.replace(/\.$/, "")}`.slice(0, 300));
    }
    Object.assign(f.values, insiderFields(insiders, today));
    const short = await loadShortInterest([found.ticker], today);
    const row = short.rows.get(found.ticker);
    const si = row && short.settlement ? withShareCount(row, short.settlement, latestBalance(table, "sharesOutstanding")?.value ?? table.ttm.dilutedShares ?? null, table.currency === "USD") : null;
    Object.assign(f.values, shortFields(si));
    const sector = sectorOfSic(profile.sic);
    const analysts = await loadConsensus(found.ticker, today);
    f.values.consensus_forward_pe = consensusPe(price, "USD", analysts.consensus);
    if (analysts.problem) f.notes.push(`consensus: ${analysts.problem}`.slice(0, 300));
    return {
      consensus: analysts.consensus,
      symbol,
      ticker: found.ticker,
      cik: found.cik,
      name: found.title,
      readAt,
      latestQuarter: table.latestQuarter,
      period: table.period,
      sic: profile.sic,
      industry: profile.industry,
      country: profile.country,
      sector,
      sectorBasis: sector ? SIC_BASIS : null,
      epsTtm: ttmEpsHistory(table),
      perShareTtm: ttmPerShareHistory(table),
      perShareCurrency: table.currency,
      years: studyTable(table),
      quarters: quartersOf(table, [])?.table ?? null,
      flows: { quarter: flowFromFacts(table, "quarter"), ttm: flowFromFacts(table, "ttm") },
      insiders,
      shortInterest: si,
      values: Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, v ?? null])),
      notes: f.notes.slice(0, 30),
      error: null,
    };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[company] on-demand read failed: ${e.logDetail ?? "failed"}`);
    return { symbol, ticker: null, cik: null, name: null, readAt, latestQuarter: null, values: {}, notes: [], error: e.message };
  }
}

/**
 * The company's results releases over the past few years, from its SEC
 * submissions (lib/reaction-history.ts): shared for the day in the data cache
 * under the CIK alone, kept nowhere. A read that fails is a sentence, never
 * an empty history.
 */
export async function releaseDaysFor(cik: number, contact: EdgarContact, today: string): Promise<{ days: ReleaseDay[]; problem: string | null }> {
  const since = addDaysTo(today, -Math.ceil((REACTION_HISTORY + 2) * 92));
  try {
    const days = await unstable_cache(async () => releaseDays(await companySubmissions(cik, contact), cik, filingLink, since), ["release-days", String(cik), today], { revalidate: PUBLIC_READ_SECONDS })();
    return { days, problem: null };
  } catch (e) {
    if (e instanceof SyncError) return { days: [], problem: e.message };
    console.error("[company] release days: submissions not readable");
    return { days: [], problem: "SEC EDGAR's list of filings could not be read." };
  }
}
