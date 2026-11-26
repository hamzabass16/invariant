/**
 * Where the money is: net worth, look-through into funds, themes, overlap,
 * revenue by geography, fixed income and commitments. Pure: the screens and `npm run check:exposure`
 * share it. Every figure is in the instance's base currency.
 *
 * A private fund's look-through uses the fair values its report gives. When a
 * report lists companies without values, each company gets an equal share and
 * the result is marked as an estimate; it is never presented as reported.
 */
import { type Book, type Holding, type LookThroughRow, toBase } from "@/lib/holdings";

const ILLIQUID = new Set(["private_fund", "real_estate"]);

/** A holding's value to its owner in base currency: real estate net of the mortgage and at the ownership share. */
export function ownerValue(h: Holding, book: Book): number {
  if (h.assetClass === "real_estate" && h.property) {
    return toBase((h.value - h.property.mortgage) * (h.property.ownershipPct / 100), h.currency, book.fx);
  }
  return toBase(h.value, h.currency, book.fx);
}

type Slice = { key: string; value: number; share: number };

function slices(rows: { key: string; value: number }[], total: number): Slice[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.key, (map.get(r.key) ?? 0) + r.value);
  return [...map.entries()].map(([key, value]) => ({ key, value, share: total ? value / total : 0 })).sort((a, b) => b.value - a.value);
}

export function netWorth(book: Book) {
  const rows = book.holdings.map((h) => ({ h, v: ownerValue(h, book) }));
  const total = rows.reduce((s, r) => s + r.v, 0);
  const illiquid = rows.filter((r) => ILLIQUID.has(r.h.assetClass)).reduce((s, r) => s + r.v, 0);
  return {
    total,
    liquid: total - illiquid,
    illiquid,
    byAssetClass: slices(rows.map((r) => ({ key: r.h.assetClass, value: r.v })), total),
    byCurrency: slices(rows.map((r) => ({ key: r.h.currency, value: r.v })), total),
    byAccount: slices(rows.map((r) => ({ key: r.h.account, value: r.v })), total),
    /** The oldest valuation behind the total, so the screen can say how stale the figure is. */
    oldestAsOf: rows.reduce((m, r) => (r.h.asOf < m ? r.h.asOf : m), book.asOf),
  };
}

/** The remainder's name: never a country. */
export const NO_SPLIT = "Cash and holdings with no geographic split";
/** What a company's own lines do not place, when its filing places only part of revenue. */
export const NOT_PLACED = "Revenue its filing does not place";

export type RevenuePlace = { name: string; grain: "country" | "region"; value: number; share: number; symbols: string[] };
export type RevenueCompany = { symbol: string; name: string; value: number; share: number; geography: NonNullable<Holding["revenueGeography"]> };

/**
 * Revenue by geography, weighted by what is held: each holding with a split
 * from its company's filing (lib/edgar-segments.ts) counts toward each of its
 * lines at the line's share of company revenue, and the lines are summed
 * across the book by name. Companies report at different grains, so a
 * country and a region sit side by side; a region is never split into
 * countries. What a partial filing does not place, and every holding with no
 * split (cash, funds, bonds, a company whose filing gives none), are their own
 * named remainders, never a country. Shares are of net worth. Pure.
 */
export function revenueByGeography(book: Book) {
  const rows = book.holdings.map((h) => ({ h, v: ownerValue(h, book) }));
  const total = rows.reduce((s, r) => s + r.v, 0);
  const places = new Map<string, RevenuePlace>();
  const companies = new Map<string, RevenueCompany>();
  const unplaced = { value: 0, symbols: [] as string[] };
  const rest = new Map<string, { label: string; value: number }>();
  for (const { h, v } of rows) {
    const g = h.revenueGeography;
    if (!g || !g.lines.length) {
      const key = `${h.assetClass}:${h.symbol.toUpperCase()}`;
      const r = rest.get(key) ?? { label: h.assetClass === "cash" ? `${h.symbol} cash` : h.symbol, value: 0 };
      r.value += v;
      rest.set(key, r);
      continue;
    }
    const symbol = h.symbol.toUpperCase();
    const c = companies.get(symbol) ?? { symbol, name: h.name, value: 0, share: 0, geography: g };
    c.value += v;
    companies.set(symbol, c);
    for (const l of g.lines) {
      const p = places.get(l.name) ?? { name: l.name, grain: l.grain, value: 0, share: 0, symbols: [] };
      p.value += (v * l.sharePct) / 100;
      if (!p.symbols.includes(symbol)) p.symbols.push(symbol);
      places.set(l.name, p);
    }
    if (g.placedPct < 99.95) {
      unplaced.value += (v * (100 - g.placedPct)) / 100;
      if (!unplaced.symbols.includes(symbol)) unplaced.symbols.push(symbol);
    }
  }
  const share = (x: number) => (total ? x / total : 0);
  const restValue = [...rest.values()].reduce((s, r) => s + r.value, 0);
  return {
    total,
    places: [...places.values()].map((p) => ({ ...p, share: share(p.value) })).sort((a, b) => b.value - a.value),
    companies: [...companies.values()].map((c) => ({ ...c, share: share(c.value) })).sort((a, b) => b.value - a.value),
    unplaced: { ...unplaced, share: share(unplaced.value) },
    /** Every holding no split covers, by symbol: how many and what weight. */
    rest: { value: restValue, share: share(restValue), count: rest.size, labels: [...rest.values()].sort((a, b) => b.value - a.value).map((r) => r.label) },
  };
}

/** Regions that never overlap: every reported line falls in exactly one, so the shares add up (Hamza, 15 Oct 2026). */
export const REVENUE_REGIONS = ["Americas", "Europe, Middle East and Africa", "Asia-Pacific", "Rest of world, not split"] as const;
export type RevenueRegion = (typeof REVENUE_REGIONS)[number];

/**
 * The one region a reported revenue line falls in. Companies report at
 * their own grain (a country, "United States and Canada", "Americas",
 * "Europe and Canada", "Rest of world"), so a line is placed by what it names:
 * a line outside the company's home with no region ("Rest of world",
 * "International markets", "Outside the US") is its own region, never guessed
 * into one; a line naming Europe goes to Europe even when it adds Canada.
 */
export function revenueRegionOf(line: string): RevenueRegion {
  const n = line.toLowerCase();
  if (/rest of (the )?world|outside|international|emerging|other countries|^other$|^foreign|non-us|non-u\.s\./.test(n)) return "Rest of world, not split";
  if (/europe|emea|middle east|africa|germany|united kingdom|^uk$|britain|france|netherlands|ireland|switzerland|spain|italy|sweden|norway|denmark|finland|belgium|austria|poland|israel|saudi|emirates|turkey|russia|luxembourg/.test(n)) return "Europe, Middle East and Africa";
  if (/asia|pacific|apac|china|japan|taiwan|korea|singapore|india|australia|hong kong|indonesia|vietnam|thailand|malaysia|philippines|new zealand/.test(n)) return "Asia-Pacific";
  if (/america|united states|^u\.?s\.?a?$|^us\b|canada|mexico|brazil|argentina|chile|colombia|peru|latin|caribbean/.test(n)) return "Americas";
  return "Rest of world, not split";
}

export type RegionShare = { region: RevenueRegion; value: number; share: number; symbols: string[]; lines: string[] };

/**
 * Revenue by region, weighted by what is held: revenueByGeography's lines,
 * each in the one region it names (revenueRegionOf), summed. Every line is in
 * exactly one region, so nothing is counted twice; what a filing does not
 * place and the holdings with no split stay their own named remainders.
 */
export function revenueByRegion(book: Book) {
  const g = revenueByGeography(book);
  const by = new Map<RevenueRegion, RegionShare>();
  for (const p of g.places) {
    const region = revenueRegionOf(p.name);
    const r = by.get(region) ?? { region, value: 0, share: 0, symbols: [], lines: [] };
    r.value += p.value;
    r.share += p.share;
    for (const s of p.symbols) if (!r.symbols.includes(s)) r.symbols.push(s);
    r.lines.push(p.name);
    by.set(region, r);
  }
  return { ...g, regions: REVENUE_REGIONS.map((r) => by.get(r)).filter((r): r is RegionShare => !!r) };
}

export type LookThroughExposure =LookThroughRow & { parentName: string; weight: number; value: number; estimated: boolean };

/** Each fund's companies, valued at the owner's share of the fund. */
export function fundLookThrough(book: Book): LookThroughExposure[] {
  const out: LookThroughExposure[] = [];
  for (const h of book.holdings) {
    const rows = book.lookThrough.filter((r) => r.parentId === h.id);
    if (!rows.length) continue;
    const reported = rows.every((r) => r.fairValue !== null && r.fairValue > 0);
    const sum = reported ? rows.reduce((s, r) => s + (r.fairValue ?? 0), 0) : rows.length;
    const holdingValue = ownerValue(h, book);
    for (const r of rows) {
      const weight = reported ? (r.fairValue ?? 0) / sum : 1 / sum;
      out.push({ ...r, parentName: h.name, weight, value: holdingValue * weight, estimated: !reported });
    }
  }
  return out;
}

export type SectorShare = { sector: string; weight: number; direct: number; throughFunds: number; estimated: number; symbols: string[]; funds: string[] };

/**
 * The holdings' weight by sector, looking through funds (Hamza, 19 Oct 2026:
 * Sectors takes in what the Themes list did): a holding counts toward its own
 * sector; a fund whose report lists its companies counts toward theirs, at
 * its weight times each company's share of the fund (equal shares when the
 * report gives no values, counted as estimated). A fund no report opens
 * counts toward its own sector, or "No sector yet". Weights are in the rows'
 * own unit (percent of net worth on Holdings).
 */
export function sectorsLookingThrough(rows: readonly { symbol: string; weight: number; sector: string | null; ids: readonly string[] }[], lookThrough: readonly LookThroughExposure[]): SectorShare[] {
  const by = new Map<string, SectorShare>();
  const add = (sector: string | null, weight: number, symbol: string, fund: boolean, estimated: boolean) => {
    const key = sector ?? "No sector yet";
    const row = by.get(key) ?? { sector: key, weight: 0, direct: 0, throughFunds: 0, estimated: 0, symbols: [], funds: [] };
    row.weight += weight;
    if (fund) {
      row.throughFunds += weight;
      if (estimated) row.estimated += weight;
      if (!row.funds.includes(symbol)) row.funds.push(symbol);
    } else {
      row.direct += weight;
      if (!row.symbols.includes(symbol)) row.symbols.push(symbol);
    }
    by.set(key, row);
  };
  for (const r of rows) {
    const ids = new Set(r.ids);
    const inside = lookThrough.filter((x) => ids.has(x.parentId));
    const parents = new Set(inside.map((x) => x.parentId)).size;
    if (!inside.length) add(r.sector, r.weight, r.symbol, false, false);
    else for (const x of inside) add(x.sector, (r.weight * x.weight) / parents, r.symbol, true, x.estimated);
  }
  return [...by.values()].sort((a, b) => (a.sector === "No sector yet" ? 1 : b.sector === "No sector yet" ? -1 : b.weight - a.weight));
}

/**
 * Exposure by theme as a share of net worth, looking through funds. A holding
 * tagged with two themes counts toward both, so shares can add up to more than
 * 100%; a holding with no tag counts toward its sector (GICS-style, from the
 * SEC industry code once filings are read), and with neither toward
 * "Untagged".
 */
export function themeExposure(book: Book) {
  const total = netWorth(book).total;
  const lt = fundLookThrough(book);
  const covered = new Set(lt.map((r) => r.parentId));
  const map = new Map<string, { theme: string; value: number; direct: number; lookThrough: number; estimated: number }>();
  const add = (theme: string, value: number, via: "direct" | "lookThrough", estimated: boolean) => {
    const row = map.get(theme) ?? { theme, value: 0, direct: 0, lookThrough: 0, estimated: 0 };
    row.value += value;
    row[via] += value;
    if (estimated) row.estimated += value;
    map.set(theme, row);
  };
  for (const h of book.holdings) {
    if (covered.has(h.id)) continue;
    const v = ownerValue(h, book);
    const themes = h.themes.length ? h.themes : [h.sector ?? "Untagged"];
    for (const t of themes) add(t, v, "direct", false);
  }
  for (const r of lt) {
    const themes = r.themes.length ? r.themes : [r.sector ?? "Untagged"];
    for (const t of themes) add(t, r.value, "lookThrough", r.estimated);
  }
  return [...map.values()].map((r) => ({ ...r, share: total ? r.value / total : 0 })).sort((a, b) => b.value - a.value);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[,.]/g, "")
    .replace(/\b(inc|corp|corporation|ltd|limited|plc|sa|ag|nv|llc|holdings|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type OverlapRow = { company: string; ticker: string | null; places: { via: string; value: number; estimated: boolean }[]; total: number; share: number };

/**
 * Companies reached in more than one place: through two funds, through a fund
 * and directly, through shares and options, or in two brokerage accounts.
 * Matched on ticker when both sides have one, otherwise on the normalised name.
 */
export function overlap(book: Book): OverlapRow[] {
  const total = netWorth(book).total;
  const map = new Map<string, OverlapRow>();
  const keyOf = (ticker: string | null, name: string) => (ticker ? `t:${ticker.toUpperCase()}` : `n:${norm(name)}`);
  const add = (ticker: string | null, name: string, via: string, value: number, estimated: boolean) => {
    // A named company that also has a ticker elsewhere joins that ticker's row.
    let k = keyOf(ticker, name);
    if (!ticker) {
      const byName = [...map.entries()].find(([, r]) => norm(r.company) === norm(name));
      if (byName) k = byName[0];
    }
    const row = map.get(k) ?? { company: name, ticker, places: [], total: 0, share: 0 };
    if (ticker && !row.ticker) row.ticker = ticker;
    row.places.push({ via, value, estimated });
    row.total += value;
    map.set(k, row);
  };
  for (const h of book.holdings) {
    if (h.assetClass === "equity" || h.assetClass === "etf") add(h.symbol, h.name, `${h.account}: shares`, ownerValue(h, book), false);
    if (h.assetClass === "option" && h.option) add(h.option.underlying, h.option.underlying, `${h.account}: options`, ownerValue(h, book), false);
  }
  for (const r of fundLookThrough(book)) add(r.ticker, r.name, r.parentName, r.value, r.estimated);
  return [...map.values()]
    .filter((r) => new Set(r.places.map((p) => p.via)).size > 1)
    .map((r) => ({ ...r, share: total ? r.total / total : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Fund-to-fund overlap: companies two funds share, and the owner's value in those companies through both. */
export function fundOverlapMatrix(book: Book) {
  const lt = fundLookThrough(book);
  const funds = [...new Set(lt.map((r) => r.parentId))];
  const names = new Map(lt.map((r) => [r.parentId, r.parentName]));
  const keys = (id: string) => new Map(lt.filter((r) => r.parentId === id).map((r) => [r.ticker ? `t:${r.ticker}` : `n:${norm(r.name)}`, r]));
  const pairs: { a: string; b: string; shared: string[]; value: number }[] = [];
  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const A = keys(funds[i]);
      const B = keys(funds[j]);
      const shared = [...A.keys()].filter((k) => B.has(k));
      if (!shared.length) continue;
      pairs.push({ a: names.get(funds[i])!, b: names.get(funds[j])!, shared: shared.map((k) => A.get(k)!.name), value: shared.reduce((s, k) => s + A.get(k)!.value + B.get(k)!.value, 0) });
    }
  }
  return pairs.sort((x, y) => y.value - x.value);
}

/** Bonds and deposits: maturity ladder by year, value-weighted stated yield, issuer and currency concentration, what matures soon. */
export function fixedIncome(book: Book, today: string) {
  const rows = book.holdings
    .filter((h) => h.assetClass === "bond" || h.assetClass === "deposit")
    .map((h) => ({
      h,
      value: ownerValue(h, book),
      maturity: h.bond?.maturity ?? h.deposit?.maturity ?? null,
      yieldPct: h.bond?.yieldPct ?? h.deposit?.ratePct ?? null,
      issuer: h.bond?.issuer ?? h.account,
    }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const withYield = rows.filter((r) => r.yieldPct !== null);
  const yieldBase = withYield.reduce((s, r) => s + r.value, 0);
  const in90 = new Date(Date.parse(`${today}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
  return {
    total,
    ladder: slices(rows.map((r) => ({ key: r.maturity ? r.maturity.slice(0, 4) : "No maturity", value: r.value })), total).sort((a, b) => a.key.localeCompare(b.key)),
    weightedYieldPct: yieldBase ? withYield.reduce((s, r) => s + r.value * (r.yieldPct ?? 0), 0) / yieldBase : null,
    /** Share of fixed income whose statement gives a yield or rate. */
    yieldCoverage: total ? yieldBase / total : 0,
    byIssuer: slices(rows.map((r) => ({ key: r.issuer, value: r.value })), total),
    byCurrency: slices(rows.map((r) => ({ key: r.h.currency, value: r.value })), total),
    maturingSoon: rows.filter((r) => r.maturity && r.maturity >= today && r.maturity <= in90).map((r) => ({ name: r.h.name, maturity: r.maturity!, value: r.value })).sort((a, b) => a.maturity.localeCompare(b.maturity)),
  };
}

/** Unfunded commitments against cash and deposits: can the owner meet the capital calls still to come? */
export function commitments(book: Book) {
  const funds = book.holdings.filter((h) => h.assetClass === "private_fund" && h.fund);
  const unfunded = funds.map((h) => ({ name: h.name, unfunded: toBase(Math.max(h.fund!.commitment - h.fund!.called, 0), h.currency, book.fx) }));
  const totalUnfunded = unfunded.reduce((s, r) => s + r.unfunded, 0);
  const cash = book.holdings.filter((h) => h.assetClass === "cash").reduce((s, h) => s + ownerValue(h, book), 0);
  const deposits = book.holdings.filter((h) => h.assetClass === "deposit").reduce((s, h) => s + ownerValue(h, book), 0);
  return { funds: unfunded.sort((a, b) => b.unfunded - a.unfunded), totalUnfunded, cash, deposits, coverage: totalUnfunded ? (cash + deposits) / totalUnfunded : null };
}
