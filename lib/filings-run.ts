import "server-only";

import { fundamentalsOf, latestBalance, studyTable, ttmEpsHistory, ttmPerShareHistory } from "@/lib/edgar-facts";
import { quartersOf } from "@/lib/earnings";
import { flowFromFacts } from "@/lib/income-flow";
import { companyFacts, companyProfile, insiderForms, lookupCompany, revenueGeography, segmentHistory, segmentLines } from "@/lib/edgar";
import { insiderFields, INSIDER_READ_DAYS, withForms, type Insiders } from "@/lib/insiders";
import { shortFields, withShareCount } from "@/lib/short-interest";
import { listingRate, loadConsensus, loadShortInterest } from "@/lib/markets-feed";
import { addDaysTo, localDay } from "@/lib/time";
import { engineOf, withEngine, type SegmentHistory } from "@/lib/edgar-segments";
import { EMPTY_FILINGS, filingsFileSchema, readableSymbols, type FilingEntry } from "@/lib/filings";
import { consensusPe } from "@/lib/forward";
import type { Book, RevenueGeography } from "@/lib/holdings";
import { recordsSchema, type EdgarContact } from "@/lib/preferences";
import { sectorOfSic, SIC_BASIS } from "@/lib/sectors";
import { loadGics } from "@/lib/sectors-feed";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/** Watchlist companies read beside the holdings, at most. */
const MAX_WATCHED = 25;

export type FilingsRun = { read: number; failed: number; listError: string | null };

/**
 * Reads every listed holding's filings from SEC EDGAR in one pass, with the
 * contact the person confirmed on the Research screen: the company behind
 * each symbol, its XBRL facts, the ontology's fundamentals derived the same
 * way the studies derive them, and its revenue by geography from its latest
 * annual filing. Kept in the vault's filings file; a holding the
 * SEC does not list keeps a sentence, never a zero. No model is involved.
 * Opening the app (lib/catch-up.ts) and the morning refresh share it.
 *
 * When every read failed for a reason that is not the holding's (no contact,
 * the SEC's company list), nothing is written and `listError` says why.
 */
export async function readFilingsInto(vault: Vault, book: Book, contact: EdgarContact, now: Date = new Date()): Promise<FilingsRun> {
  // The watchlist too (Hamza, 20 Oct 2026: its five-year valuation lows are alerts), a record's symbol the book does not hold.
  const records = await vault.readJson("records", recordsSchema).catch(() => null);
  const held = readableSymbols(book);
  const watched = Object.keys(records?.bySymbol ?? {})
    .map((x) => x.toUpperCase())
    .filter((x) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(x) && !held.includes(x))
    .slice(0, MAX_WATCHED);
  const symbols = [...held, ...watched];
  const readAt = now.toISOString();
  // The index lists give the official GICS sector for most large US listings; a list that cannot be read costs nothing but the fallback to the SEC's code.
  const gics = await loadGics();
  for (const p of gics.problems) console.warn(`[filings] ${p}`);
  const entries: FilingEntry[] = [];
  let listError: string | null = null;
  const prev = (await vault.readJson("filings", filingsFileSchema)) ?? EMPTY_FILINGS;
  const shares = new Map<string, { count: number | null; usd: boolean }>();
  // A few at a time: the SEC asks for no more than ten requests a second.
  const queue = [...symbols];
  const worker = async () => {
    for (let symbol = queue.shift(); symbol; symbol = queue.shift()) {
      const h = book.holdings.find((x) => x.symbol.toUpperCase() === symbol);
      try {
        const found = await lookupCompany(symbol, contact);
        if (!found) {
          entries.push({ symbol, ticker: null, cik: null, name: null, readAt, latestQuarter: null, values: {}, notes: [], error: "the SEC lists no company under this symbol" });
          continue;
        }
        const table = await companyFacts(found.cik, contact);
        // A listing priced in another currency than the filings' (an ADR) is carried over at the day's rate.
        const rate = await listingRate(h?.currency ?? null, table.currency, localDay(now));
        let f = fundamentalsOf(table, h?.price ?? null, h?.currency ?? null, rate.fx);
        if (rate.fx === null && rate.note) f.notes.push(`pe_ratio, dividend_yield_pct: ${rate.note}`);
        // The engine comes from the filing's own segment note; a filing that cannot be read costs the segment lines, never the figures.
        try {
          f = withEngine(f, engineOf(await segmentLines(found.cik, contact), f.values.revenue_growth_pct));
        } catch (e) {
          if (!(e instanceof SyncError)) throw e;
          f = withEngine(f, engineOf(null, f.values.revenue_growth_pct, e.message.replace(/\.$/, "")));
        }
        // Revenue by geography from the latest annual filing; a filing that cannot be read keeps the last good split, never an empty one.
        let geography: RevenueGeography | null = null;
        try {
          geography = await revenueGeography(found.cik, contact);
          if (!geography) f.notes.push("geography: the latest annual filing gives no revenue by geography");
          else if (geography.note) f.notes.push(`geography: ${geography.note}`.slice(0, 300));
        } catch (e) {
          if (!(e instanceof SyncError)) throw e;
          geography = prev.bySymbol[symbol]?.revenueGeography ?? null;
          f.notes.push(`geography: ${e.message.replace(/\.$/, "")}${geography ? `; the split is from the ${geography.form} read before` : ""}`.slice(0, 300));
        }
        // Revenue by segment over the last quarters and years, read again only when a new filing is in; a filing that cannot be read keeps the history read before.
        const keptHistory = prev.bySymbol[symbol]?.cik === found.cik ? (prev.bySymbol[symbol]?.segmentHistory ?? null) : null;
        let history: SegmentHistory | null = keptHistory;
        try {
          history = await segmentHistory(found.cik, contact, keptHistory, now);
          if (history?.note) f.notes.push(`segment history: ${history.note}`.slice(0, 300));
        } catch (e) {
          if (!(e instanceof SyncError)) throw e;
          f.notes.push(`segment history: ${e.message.replace(/\.$/, "")}${keptHistory ? "; the history read before stays" : ""}`.slice(0, 300));
        }
        // The profile is a second, smaller document; its absence costs the sector, never the figures.
        let profile: { sic: number | null; industry: string | null; country: string | null } = { sic: null, industry: null, country: null };
        try {
          profile = await companyProfile(found.cik, contact);
        } catch (e) {
          if (!(e instanceof SyncError)) throw e;
          f.notes.push("sector: the SEC's company profile could not be read");
        }
        // The insiders' Form 4s, the new ones since the last read; a list that cannot be read keeps the trades read before.
        const before = prev.bySymbol[symbol]?.cik === found.cik ? prev.bySymbol[symbol]?.insiders : undefined;
        let insiders: Insiders | undefined = before;
        try {
          const got = await insiderForms(found.cik, contact, addDaysTo(localDay(now), -INSIDER_READ_DAYS), before?.read ?? []);
          insiders = withForms(before, got.forms, got.waiting, readAt);
          const unread = got.forms.filter((x) => !x.form).length;
          if (unread) f.notes.push(`insiders: ${unread} Form 4${unread === 1 ? "" : "s"} could not be read; tried again next read`);
          if (got.waiting) f.notes.push(`insiders: ${got.waiting} older Form 4s are read over the next runs`);
        } catch (e) {
          if (!(e instanceof SyncError)) throw e;
          f.notes.push(`insiders: ${e.message.replace(/\.$/, "")}`.slice(0, 300));
        }
        Object.assign(f.values, insiderFields(insiders, localDay(now)));
        shares.set(symbol, { count: latestBalance(table, "sharesOutstanding")?.value ?? table.ttm.dilutedShares ?? null, usd: table.currency === "USD" });
        const listed = gics.by.get(found.ticker) ?? gics.by.get(symbol) ?? null;
        const sector = listed?.sector ?? sectorOfSic(profile.sic);
        if (!listed && sector && gics.problems.length) f.notes.push(`sector: from the SEC industry code; ${gics.problems.join(" ")}`);
        entries.push({ symbol, ticker: found.ticker, cik: found.cik, name: found.title, readAt, latestQuarter: table.latestQuarter, period: table.period, sic: profile.sic, industry: profile.industry, country: profile.country, sector, subIndustry: listed?.subIndustry ?? null, sectorBasis: listed ? `GICS, ${listed.list} list` : sector ? SIC_BASIS : null, revenueGeography: geography, segmentHistory: history, flows: { quarter: flowFromFacts(table, "quarter", history), ttm: flowFromFacts(table, "ttm", history) }, epsTtm: ttmEpsHistory(table), perShareTtm: ttmPerShareHistory(table), perShareCurrency: table.currency, years: studyTable(table), quarters: quartersOf(table, [])?.table ?? null, insiders, values: Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, v ?? null])), notes: f.notes.slice(0, 30), error: null });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        // The reason alone, never the symbol: a ticker belongs to the person and stays out of the logs.
        console.error(`[filings] ${e.logDetail ?? "failed"}`);
        if (/no contact|company list/.test(e.logDetail ?? "")) listError = e.message;
        entries.push({ symbol, ticker: null, cik: null, name: null, readAt, latestQuarter: null, values: {}, notes: [], error: e.message });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  // Short interest from FINRA's latest published file, one file for every symbol; a file that cannot be read keeps the figures read before.
  const short = await loadShortInterest(entries.filter((e) => !e.error).map((e) => e.ticker ?? e.symbol), localDay(now));
  for (const e of entries) {
    if (e.error) continue;
    const row = short.rows.get((e.ticker ?? e.symbol).toUpperCase());
    const s = shares.get(e.symbol);
    const si = row && short.settlement ? withShareCount(row, short.settlement, s?.count ?? null, s?.usd ?? false) : short.settlement ? null : (prev.bySymbol[e.symbol]?.shortInterest ?? null);
    e.shortInterest = si;
    Object.assign(e.values, shortFields(si));
    if (short.problem) e.notes = [...e.notes.slice(0, 29), `short interest: ${short.problem}`];
    else if (!row && short.settlement) e.notes = [...e.notes.slice(0, 29), `short interest: FINRA's file for ${short.settlement} does not list ${e.ticker ?? e.symbol}`];
    else if (si && si.pctOfShares === null) e.notes = [...e.notes.slice(0, 29), "short_interest_pct: the filings count other shares than the listing's (an ADR), or give no share count"];
  }
  // The analysts' consensus from Nasdaq's public estimates, a few at a time; a page that cannot be read keeps the consensus read before.
  const today = localDay(now);
  const cq = entries.filter((e) => !e.error);
  const consensusWorker = async () => {
    for (let e = cq.shift(); e; e = cq.shift()) {
      const got = await loadConsensus(e.ticker ?? e.symbol, today);
      const before = prev.bySymbol[e.symbol]?.consensus ?? null;
      e.consensus = got.problem ? before : got.consensus;
      if (got.problem) e.notes = [...e.notes.slice(0, 29), `consensus: ${got.problem}${before ? "; the estimates read before are kept" : ""}`.slice(0, 300)];
      const h = book.holdings.find((x) => x.symbol.toUpperCase() === e.symbol);
      const pe = consensusPe(h?.price ?? null, h?.currency ?? null, e.consensus);
      e.values.consensus_forward_pe = pe;
      if (pe === null) e.notes = [...e.notes.slice(0, 29), `consensus_forward_pe: ${!e.consensus ? "Nasdaq lists no analysts' estimates" : e.consensus.ntmEps === null ? e.consensus.words : !h?.price ? "no price: the company is not in the book" : "the price is not in US dollars"}`.slice(0, 300)];
    }
  };
  await Promise.all([consensusWorker(), consensusWorker(), consensusWorker()]);
  if (listError && entries.every((e) => e.error)) return { read: 0, failed: entries.length, listError };
  const bySymbol = { ...prev.bySymbol };
  // A failed read never replaces a good one: the last good copy stays, with the failure beside it.
  for (const e of entries) bySymbol[e.symbol] = e.error && prev.bySymbol[e.symbol] && !prev.bySymbol[e.symbol].error ? { ...prev.bySymbol[e.symbol], notes: [...prev.bySymbol[e.symbol].notes.slice(0, 29), `Last read failed: ${e.error}`] } : e;
  await vault.writeJson("filings", filingsFileSchema.parse({ version: 1, bySymbol, updated: readAt }));
  const failed = entries.filter((e) => e.error).length;
  return { read: entries.length - failed, failed, listError };
}
