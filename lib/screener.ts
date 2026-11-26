/**
 * The methodology screener (Hamza, 21 Oct 2026, after Unusual Whales): the
 * person's own classes run on every company in the S&P 500 and the
 * Nasdaq-100, so the screen lists what their rules would own and what falls
 * one criterion short. The figures are the filings' own, derived exactly as
 * the book's (lib/edgar-facts.ts fundamentalsOf) at the session's close, and
 * read a share of the list each day (lib/screener-run.ts) into the vault's
 * `screener` file; the verdicts are the methodology's own recipes
 * (`classTest`), never a model's. A criterion on a field the screener does
 * not read (the insiders) has no reading and does not hold, and the screen
 * names it. The engine is read from each company's segment note; until a
 * company's is, company revenue growth stands in, as it does for a holding
 * whose filing has no segment line (`withEngineStandIn`).
 *
 * Pure: the file, the universe, what to read next and the screen.
 */
import { z } from "zod";

import { bookSchema, type Book, type Holding } from "@/lib/holdings";
import type { MarketDay } from "@/lib/market-day";
import type { Methodology } from "@/lib/methodology";
import { evalCtx, FIELDS, FUNDAMENTAL_FIELDS, type FieldId } from "@/lib/ontology";
import { classFilters, classTest, classWords, criterionLabel, type ClassDef } from "@/lib/recipes";
import { daysBetween } from "@/lib/time";

/** Companies read in one scheduled run, and on opening the app. */
export const SCREEN_PER_RUN = 90;
export const SCREEN_ON_OPEN = 12;
/** A company's figures are read again after this many days (the price-based ones move with it). */
export const SCREEN_REFRESH_DAYS = 7;
/** Companies the deployment reads for everyone at the 05:00 UTC run, before anyone's own share (`fillSharedCompanies`). */
export const SHARED_PER_RUN = 200;
/**
 * A read kept before this day lacks a field added since (the Altman Z-score,
 * 5 Nov 2026), so it is due again right after the companies never read, ahead
 * of the weekly refresh.
 */
export const SCREEN_FIELDS_SINCE = "2026-11-05";
/** A company whose read failed is tried again after this many days. */
export const SCREEN_RETRY_DAYS = 3;
/** The S&P 500 and the Nasdaq-100 together, with room. */
export const MAX_SCREEN = 700;

export const screenCompanySchema = z.object({
  symbol: z.string().max(12),
  name: z.string().max(120).nullable(),
  cik: z.number().nullable(),
  sector: z.string().max(40).nullable(),
  /** The GICS sub-industry from the S&P 500's list, and the SEC industry code, for comparing a company with its peers (lib/peers.ts); absent before the read that kept them. */
  subIndustry: z.string().max(80).nullable().default(null),
  sic: z.number().nullable().default(null),
  /** Market value in US dollars, from the session's read. */
  cap: z.number().nullable(),
  /** The close the price-based fields were read at. */
  price: z.number().nullable(),
  readAt: z.string(),
  /** The ontology's fundamentals the filings gave; a field not read is absent, never zero. */
  values: z.record(z.string(), z.number()).default({}),
  /** The shares the filings report and whether they file in dollars, for short interest. */
  shares: z.number().nullable().default(null),
  usd: z.boolean().default(true),
  error: z.string().max(300).nullable().default(null),
});
export type ScreenCompany = z.infer<typeof screenCompanySchema>;

export const screenerFileSchema = z.object({
  version: z.literal(1),
  /** The S&P 500 and Nasdaq-100 symbols at the last read, the largest first. */
  universe: z.array(z.string()).max(MAX_SCREEN).default([]),
  bySymbol: z.record(z.string(), screenCompanySchema).default({}),
  updated: z.string(),
});
export type ScreenerFile = z.infer<typeof screenerFileSchema>;
export const EMPTY_SCREENER: ScreenerFile = { version: 1, universe: [], bySymbol: {}, updated: "" };

export type UniverseCompany = { symbol: string; name: string | null; sector: string | null; subIndustry: string | null; cap: number | null; close: number };

/** The session's S&P 500 and the Nasdaq-100 companies outside it, the largest first; a class share (BRK.B) keeps its dot. */
export function universeOf(day: Pick<MarketDay, "moves" | "others">): UniverseCompany[] {
  const seen = new Set<string>();
  const out: UniverseCompany[] = [];
  for (const m of [...day.moves, ...day.others]) {
    const symbol = m.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, name: m.name, sector: m.sector ?? null, subIndustry: m.subIndustry ?? null, cap: m.cap, close: m.close });
  }
  return out.sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0)).slice(0, MAX_SCREEN);
}

/**
 * The companies to read next: those never read, the largest first, then
 * those read before SCREEN_FIELDS_SINCE, the oldest first, then those read
 * longest ago past SCREEN_REFRESH_DAYS (a failed read past
 * SCREEN_RETRY_DAYS). A company the person's own filings file already read is
 * left to that read.
 */
export function companiesToRead(universe: readonly UniverseCompany[], file: ScreenerFile | null, today: string, max: number, own: ReadonlySet<string> = new Set()): UniverseCompany[] {
  const kept = file?.bySymbol ?? {};
  const fresh = universe.filter((u) => !own.has(u.symbol));
  const never = fresh.filter((u) => !kept[u.symbol]);
  const older = fresh.filter((u) => today >= SCREEN_FIELDS_SINCE && kept[u.symbol] && !kept[u.symbol].error && kept[u.symbol].readAt.slice(0, 10) < SCREEN_FIELDS_SINCE).sort((a, b) => kept[a.symbol].readAt.localeCompare(kept[b.symbol].readAt));
  const before = new Set(older.map((u) => u.symbol));
  const stale = fresh
    .filter((u) => !before.has(u.symbol) && kept[u.symbol] && daysBetween(kept[u.symbol].readAt.slice(0, 10), today) >= (kept[u.symbol].error ? SCREEN_RETRY_DAYS : SCREEN_REFRESH_DAYS))
    .sort((a, b) => kept[a.symbol].readAt.localeCompare(kept[b.symbol].readAt));
  return [...never, ...older, ...stale].slice(0, Math.max(0, max));
}

/** A company's fundamentals as kept: numbers alone, the ontology's fields alone, four significant figures. */
export function keptValues(values: Record<string, number | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) if (typeof v === "number" && Number.isFinite(v) && (FUNDAMENTAL_FIELDS as readonly string[]).includes(k)) out[k] = Number(v.toPrecision(4));
  return out;
}

/**
 * A company's figures with the engine laid on when the screener has not read
 * its segment note yet: company revenue growth stands in, at a share of 100,
 * exactly as `engineOf` (lib/edgar-segments.ts) lays it for a holding whose
 * filing has no segment line. No revenue growth, no engine.
 */
export function withEngineStandIn<T extends Record<string, number | null | undefined>>(values: T): { values: T; standIn: boolean } {
  const has = (k: string) => typeof values[k] === "number" && Number.isFinite(values[k]);
  if (has("engine_growth_pct") || !has("revenue_growth_pct")) return { values, standIn: false };
  return { values: { ...values, engine_growth_pct: values.revenue_growth_pct, engine_share_pct: 100 }, standIn: true };
}

/** The companies with figures, the person's own read winning for one they hold or watch, the engine's stand-in laid on. */
function companiesOf(file: ScreenerFile | null, own: Readonly<Record<string, { values: Record<string, number | null>; name: string | null }>>) {
  return Object.values(file?.bySymbol ?? {})
    .filter((c) => !c.error && Object.keys(c.values).length)
    .map((c) => {
      const mine = own[c.symbol];
      const merged = mine ? { ...c, name: c.name ?? mine.name, values: { ...c.values, ...keptValues(mine.values) } } : c;
      const e = withEngineStandIn(merged.values);
      return { ...merged, values: e.values, standIn: e.standIn };
    });
}

/** The file after a run: the companies read replace their rows, a failed read keeps the last good one with its date, and companies gone from both lists leave. */
export function withCompanies(prev: ScreenerFile | null, universe: readonly UniverseCompany[], read: readonly ScreenCompany[], now: string): ScreenerFile {
  const bySymbol: Record<string, ScreenCompany> = {};
  const listed = new Set(universe.map((u) => u.symbol));
  // A kept company takes the list's sector and sub-industry at every run, so a read made before they were kept has them too.
  const byList = new Map(universe.map((u) => [u.symbol, u]));
  for (const [k, v] of Object.entries(prev?.bySymbol ?? {})) {
    const u = byList.get(k);
    if (u) bySymbol[k] = { ...v, sector: u.sector ?? v.sector, subIndustry: u.subIndustry ?? v.subIndustry ?? null };
  }
  for (const c of read) {
    const before = bySymbol[c.symbol];
    bySymbol[c.symbol] = c.error && before && !before.error ? { ...before, readAt: c.readAt, error: null } : c;
  }
  return { version: 1, universe: universe.map((u) => u.symbol), bySymbol, updated: now };
}

/**
 * The deployment's shared reads laid on a person's file before a run (Hamza,
 * 23 Oct 2026: each company read once for everyone): a listed company the
 * shared table read later than the file takes that read, so the run reads
 * only what nobody has; a failed shared read never replaces a good row, and a
 * company the person's own filings read is left to that read.
 */
export function withShared(file: ScreenerFile, shared: readonly ScreenCompany[], universe: readonly UniverseCompany[], own: ReadonlySet<string> = new Set()): { file: ScreenerFile; adopted: number } {
  const listed = new Set(universe.map((u) => u.symbol));
  const bySymbol = { ...file.bySymbol };
  let adopted = 0;
  for (const c of shared) {
    if (!listed.has(c.symbol) || own.has(c.symbol)) continue;
    const kept = bySymbol[c.symbol];
    if (kept && (c.readAt <= kept.readAt || (c.error && !kept.error))) continue;
    bySymbol[c.symbol] = c;
    adopted += 1;
  }
  return { file: { ...file, bySymbol }, adopted };
}

/** A company as a one-line holding, so the methodology's recipes run on it exactly as on a holding. */
function asHolding(c: ScreenCompany, today: string): Holding {
  return {
    id: `screen:${c.symbol}`,
    account: "Screener",
    source: "manual",
    assetClass: "equity",
    symbol: c.symbol,
    name: c.name ?? c.symbol,
    quantity: 1,
    price: c.price,
    value: c.cap ?? c.price ?? 0,
    costBasis: null,
    currency: "USD",
    asOf: c.readAt.slice(0, 10) || today,
    valuation: "estimate",
    country: null,
    sector: c.sector,
    themes: [],
    fundamentals: c.values,
  } as Holding;
}

export type ScreenRow = {
  symbol: string;
  name: string;
  sector: string | null;
  cap: number | null;
  readAt: string;
  held: boolean;
  watched: boolean;
  /** The class it passes, or the one it nearly passes. */
  classId: string;
  passes: number;
  needed: number;
  unread: number;
  /** The class's criteria in all. */
  of: number;
  /** For a near miss: the criteria that did not hold, in the class's words. */
  short: string[];
  /** Company revenue growth stands in for the engine: its segment note is not read yet. */
  standIn?: boolean;
};
export type ScreenClass = { id: string; label: string; words: string; rows: ScreenRow[] };
export type Screen = {
  classes: ScreenClass[];
  /** Companies no class takes that are one criterion short of one, with every required filter holding. */
  near: ScreenRow[];
  /** Companies with figures, out of the list. */
  read: number;
  universe: number;
  /** The fields the classes read that no company in the screen carries: the screener reads no figure for them. */
  unread: { field: FieldId; label: string }[];
  /** The oldest figures on the screen, a date. */
  oldest: string | null;
  /** Companies whose engine is company revenue growth standing in, their segment note not read yet. */
  standIn: number;
  /** Every company with figures and the class it is in, null for none: what the top funds' ranking reads. */
  placed: Record<string, string | null>;
};

/**
 * The person's classes on every company read: each company in the first class
 * whose test holds (the order the methodology gives, as on Holdings), the
 * largest first; and the near misses, one criterion short of a class. The
 * person's own filings win for a company they hold or watch, since that read
 * carries the engine and the insiders too.
 */
export function screenOf(m: Methodology | null, file: ScreenerFile | null, own: Readonly<Record<string, { values: Record<string, number | null>; name: string | null }>>, held: ReadonlySet<string>, watched: ReadonlySet<string>, today: string): Screen | null {
  if (!m?.classes.length) return null;
  const companies = companiesOf(file, own);
  const holdings = companies.map((c) => asHolding(c, today));
  const book: Book = bookSchema.parse({ asOf: today, holdings, lookThrough: [], transactions: [], fx: { base: "USD", asOf: today, rates: {}, source: "screener" } });
  const ctx = evalCtx(book, today);
  const classes: ScreenClass[] = m.classes.map((c) => ({ id: c.id, label: c.label, words: classWords(c), rows: [] }));
  const near: ScreenRow[] = [];
  const where: Record<string, string | null> = {};
  const byId = new Map(companies.map((c) => [`screen:${c.symbol}`, c]));
  for (const h of book.holdings) {
    const c = byId.get(h.id)!;
    const base = { symbol: c.symbol, name: c.name ?? c.symbol, sector: c.sector, cap: c.cap, readAt: c.readAt, held: held.has(c.symbol), watched: watched.has(c.symbol), standIn: c.standIn };
    let closest: ScreenRow | null = null;
    let placed = false;
    where[c.symbol] = null;
    for (const [i, cls] of m.classes.entries()) {
      const t = classTest(cls, h, ctx);
      const row: ScreenRow = { ...base, classId: cls.id, passes: t.passes, needed: t.needed, unread: t.unread, of: t.criteria.length, short: t.criteria.filter((x) => !x.pass).map((x) => criterionLabel(x.filter)) };
      if (t.holds) {
        classes[i].rows.push({ ...row, short: [] });
        where[c.symbol] = cls.id;
        placed = true;
        break;
      }
      // One short of a class that asks for two or more: a class of one criterion is a gate, not a near miss.
      if (t.needed >= 2 && t.required.every((x) => x.pass) && t.passes === t.needed - 1 && (!closest || t.passes > closest.passes)) closest = row;
    }
    if (!placed && closest) near.push(closest);
  }
  const bigFirst = (a: ScreenRow, b: ScreenRow) => (b.cap ?? 0) - (a.cap ?? 0) || a.symbol.localeCompare(b.symbol);
  for (const c of classes) c.rows.sort(bigFirst);
  near.sort(bigFirst);
  const read = new Set(companies.flatMap((c) => Object.keys(c.values)));
  const fields = [...new Set(m.classes.flatMap((c) => classFilters(c).map((f) => f.field)))].filter((f): f is FieldId => f in FIELDS && (FUNDAMENTAL_FIELDS as readonly string[]).includes(f));
  const oldest = companies.map((c) => c.readAt.slice(0, 10)).sort()[0] ?? null;
  // A class no filing figure decides (options, cash) takes no listed company; it is left off rather than shown empty.
  const onFilings = (id: string) => classFilters(m.classes.find((c) => c.id === id)!).some((f) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(f.field));
  return {
    classes: classes.filter((c) => c.rows.length || onFilings(c.id)),
    near,
    read: companies.length,
    universe: file?.universe.length ?? 0,
    unread: companies.length ? fields.filter((f) => !read.has(f)).map((f) => ({ field: f, label: FIELDS[f].label })) : [],
    oldest,
    standIn: companies.filter((c) => c.standIn && fields.includes("engine_growth_pct" as FieldId)).length,
    placed: where,
  };
}

/** At most this many companies a screen in words lists. */
export const WORDS_ROWS = 60;

/**
 * One class (a screen asked in words, lib/screen-words.ts) on the same
 * companies as the person's classes, the person's own filings winning for a
 * company they hold or watch: every company it takes, the largest first.
 */
export function screenWith(cls: ClassDef, file: ScreenerFile | null, own: Readonly<Record<string, { values: Record<string, number | null>; name: string | null }>>, held: ReadonlySet<string>, watched: ReadonlySet<string>, today: string): { rows: ScreenRow[]; total: number } {
  const companies = companiesOf(file, own);
  const book: Book = bookSchema.parse({ asOf: today, holdings: companies.map((c) => asHolding(c, today)), lookThrough: [], transactions: [], fx: { base: "USD", asOf: today, rates: {}, source: "screener" } });
  const ctx = evalCtx(book, today);
  const rows: ScreenRow[] = [];
  for (const [i, h] of book.holdings.entries()) {
    const c = companies[i];
    const t = classTest(cls, h, ctx);
    if (!t.holds) continue;
    rows.push({ symbol: c.symbol, name: c.name ?? c.symbol, sector: c.sector, cap: c.cap, readAt: c.readAt, held: held.has(c.symbol), watched: watched.has(c.symbol), standIn: c.standIn, classId: cls.id, passes: t.passes, needed: t.needed, unread: t.unread, of: t.criteria.length, short: [] });
  }
  rows.sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || a.symbol.localeCompare(b.symbol));
  return { rows: rows.slice(0, WORDS_ROWS), total: rows.length };
}

/** The screener's state in a sentence, for Setup's sync list and the screen. */
export function screenSentence(file: ScreenerFile | null): string {
  if (!file?.universe.length) return "Not read yet: the morning run reads the S&P 500 and the Nasdaq-100 a share at a time.";
  const read = Object.values(file.bySymbol).filter((c) => !c.error).length;
  const total = file.universe.length;
  return read >= total ? `All ${total} companies read; each is read again weekly, once for everyone on this app.` : `${read} of ${total} companies read; the rest follow over the next days, each read once for everyone on this app.`;
}
