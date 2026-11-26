/**
 * The screener as a table, a heat map and filters (Hamza, 23 Oct 2026, after
 * TradingView's stock screener): every company in the S&P 500 and the
 * Nasdaq-100 as one row, its price, move and market value from the last
 * closed session and its fundamentals from the filings the screener keeps
 * (lib/screener.ts), with the class the person's methodology puts it in.
 * Filters are pills of fixed choices (an index, a move, a market value,
 * P/E, growth, yield, ROIC, a sector, a class), and the fields and levels
 * the person's own classes test (`screenFilters`), one choice each, kept in the address so a screen can be opened again; the columns
 * sort. A company the screener has not read yet has a price and a move but
 * no fundamentals, and a filter on a fundamental leaves it out: it is never
 * counted as passing.
 *
 * Pure: rows, filters, sorting and the heat map's day.
 */
import { atPrice, forwardPeOf } from "@/lib/forward";
import type { DayMove, MarketDay } from "@/lib/market-day";
import { FIELDS, FUNDAMENTAL_FIELDS, type FieldId, type Unit } from "@/lib/ontology";
import { classFilters, formatUnit, type ClassDef } from "@/lib/recipes";
import type { ScreenerFile } from "@/lib/screener";

export type TableRow = {
  symbol: string;
  name: string;
  sector: string | null;
  subIndustry: string | null;
  /** The lists it is in that session: the S&P 500, the Nasdaq-100. */
  spx: boolean;
  ndx: boolean;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  cap: number | null;
  /** The filings' fundamentals, absent when the screener has not read the company. */
  pe: number | null;
  /** The forward P/E from the filings (lib/forward.ts). */
  forwardPe: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  divYield: number | null;
  grossMargin: number | null;
  roic: number | null;
  /** The revenue growth the price assumes (reverse DCF, `implied_growth_pct`), at the read. */
  impliedGrowth: number | null;
  /** Every filings figure read, at the session's close: what a filter from the methodology tests. */
  values: Readonly<Record<string, number>>;
  /** Whether the screener holds figures for it. */
  read: boolean;
  /** The class the methodology puts it in, null for none or not read. */
  classId: string | null;
  held: boolean;
  watched: boolean;
};

const num = (v: number | undefined | null) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One row per company: the session's S&P 500 and Nasdaq-100 moves first, then
 * any company the screener file holds that the session does not carry. The
 * person's own filings win for a company they hold or watch, as on the
 * class screen.
 */
export function tableRows(
  file: ScreenerFile | null,
  day: Pick<MarketDay, "moves" | "others" | "nasdaq100"> | null,
  placed: Readonly<Record<string, string | null>>,
  own: Readonly<Record<string, { values: Record<string, number | null>; name: string | null }>>,
  held: ReadonlySet<string>,
  watched: ReadonlySet<string>,
): TableRow[] {
  const ndx = new Set((day?.nasdaq100 ?? []).map((s) => s.toUpperCase()));
  const spx = new Set((day?.moves ?? []).map((m) => m.symbol.toUpperCase()));
  const moves = new Map<string, DayMove | (Omit<DayMove, "sector"> & { sector: string | null })>();
  for (const m of [...(day?.moves ?? []), ...(day?.others ?? [])]) if (!moves.has(m.symbol.toUpperCase())) moves.set(m.symbol.toUpperCase(), m);
  const kept = file?.bySymbol ?? {};
  const symbols = [...new Set([...moves.keys(), ...Object.keys(kept).map((s) => s.toUpperCase())])];
  return symbols.map((symbol) => {
    const m = moves.get(symbol);
    const c = kept[symbol] && !kept[symbol].error ? kept[symbol] : null;
    const mine = own[symbol];
    // A read from earlier in the week is laid at the session's close, so every multiple is today's.
    const values: Record<string, number | null | undefined> = { ...(c ? atPrice(c.values, c.price, m?.close) : {}), ...(mine?.values ?? {}) };
    const read = !!mine || (!!c && Object.keys(c.values).length > 0);
    return {
      symbol,
      name: m?.name ?? c?.name ?? mine?.name ?? symbol,
      sector: m?.sector ?? c?.sector ?? null,
      subIndustry: m?.subIndustry ?? null,
      spx: spx.has(symbol),
      ndx: ndx.has(symbol),
      price: m?.close ?? c?.price ?? null,
      prevClose: m?.prevClose ?? null,
      changePct: m ? m.changePct : null,
      cap: m?.cap ?? c?.cap ?? null,
      pe: num(values.pe_ratio),
      forwardPe: num(forwardPeOf(values)),
      epsGrowth: num(values.eps_growth_pct),
      revenueGrowth: num(values.revenue_growth_pct),
      divYield: num(values.dividend_yield_pct),
      grossMargin: num(values.gross_margin_pct),
      roic: num(values.roic_pct),
      impliedGrowth: num(values.implied_growth_pct),
      values: Object.fromEntries(Object.entries(values).filter((e): e is [string, number] => num(e[1]) !== null)),
      read,
      classId: placed[symbol] ?? null,
      held: held.has(symbol),
      watched: watched.has(symbol),
    };
  });
}

// ---------------------------------------------------------------------------
// Filters

export type FilterOption = { id: string; label: string; test: (r: TableRow) => boolean };
export type ScreenFilter = { id: string; label: string; options: FilterOption[]; /** Reads a filings figure: a company not read is left out. */ fundamental: boolean };

const between = (v: number | null, lo: number, hi: number) => v !== null && v >= lo && v < hi;
const band = (id: string, label: string, pick: (r: TableRow) => number | null, lo: number, hi: number): FilterOption => ({ id, label, test: (r) => between(pick(r), lo, hi) });
const B = 1e9;

/** The fixed filters, in the order of the pill row; no price band, which says nothing of a business (Hamza, 24 Oct 2026). Sector and class take their options from the rows and the methodology. */
export const SCREEN_FILTERS: readonly ScreenFilter[] = [
  {
    id: "index",
    label: "Index",
    fundamental: false,
    options: [
      { id: "spx", label: "S&P 500", test: (r) => r.spx },
      { id: "ndx", label: "Nasdaq-100", test: (r) => r.ndx },
      { id: "both", label: "In both", test: (r) => r.spx && r.ndx },
    ],
  },
  {
    id: "chg",
    label: "Chg %",
    fundamental: false,
    options: [band("up2", "Up 2% or more", (r) => r.changePct, 2, Infinity), band("up", "Up", (r) => r.changePct, 1e-9, Infinity), band("down", "Down", (r) => r.changePct, -Infinity, 0), band("down2", "Down 2% or more", (r) => r.changePct, -Infinity, -2 + 1e-9)],
  },
  {
    id: "cap",
    label: "Mkt cap",
    fundamental: false,
    options: [band("mega", "Mega, $200B and over", (r) => r.cap, 200 * B, Infinity), band("large", "Large, $10B to $200B", (r) => r.cap, 10 * B, 200 * B), band("mid", "Mid, $2B to $10B", (r) => r.cap, 2 * B, 10 * B), band("small", "Under $2B", (r) => r.cap, 0, 2 * B)],
  },
  {
    id: "pe",
    label: "P/E",
    fundamental: true,
    options: [band("u15", "Under 15", (r) => r.pe, 0, 15), band("15-25", "15 to 25", (r) => r.pe, 15, 25), band("25-50", "25 to 50", (r) => r.pe, 25, 50), band("o50", "Over 50", (r) => r.pe, 50, Infinity)],
  },
  {
    id: "fpe",
    label: "Fwd P/E",
    fundamental: true,
    options: [band("u15", "Under 15", (r) => r.forwardPe, 0, 15), band("15-25", "15 to 25", (r) => r.forwardPe, 15, 25), band("25-50", "25 to 50", (r) => r.forwardPe, 25, 50), band("o50", "Over 50", (r) => r.forwardPe, 50, Infinity)],
  },
  {
    id: "eps",
    label: "EPS growth",
    fundamental: true,
    options: [band("o25", "Over 25%", (r) => r.epsGrowth, 25, Infinity), band("10-25", "10% to 25%", (r) => r.epsGrowth, 10, 25), band("0-10", "0% to 10%", (r) => r.epsGrowth, 0, 10), band("neg", "Shrinking", (r) => r.epsGrowth, -Infinity, 0)],
  },
  {
    id: "rev",
    label: "Revenue growth",
    fundamental: true,
    options: [band("o20", "Over 20%", (r) => r.revenueGrowth, 20, Infinity), band("10-20", "10% to 20%", (r) => r.revenueGrowth, 10, 20), band("0-10", "0% to 10%", (r) => r.revenueGrowth, 0, 10), band("neg", "Shrinking", (r) => r.revenueGrowth, -Infinity, 0)],
  },
  {
    id: "div",
    label: "Div yield",
    fundamental: true,
    options: [band("o3", "Over 3%", (r) => r.divYield, 3, Infinity), band("1-3", "1% to 3%", (r) => r.divYield, 1, 3), band("u1", "Under 1%", (r) => r.divYield, 1e-9, 1), { id: "none", label: "Pays none", test: (r) => r.divYield === 0 }],
  },
  {
    id: "roic",
    label: "ROIC",
    fundamental: true,
    options: [band("o20", "Over 20%", (r) => r.roic, 20, Infinity), band("10-20", "10% to 20%", (r) => r.roic, 10, 20), band("u10", "Under 10%", (r) => r.roic, -Infinity, 10)],
  },
  {
    id: "priced",
    label: "Priced-in growth",
    fundamental: true,
    options: [band("u5", "Under 5%", (r) => r.impliedGrowth, -Infinity, 5), band("5-15", "5% to 15%", (r) => r.impliedGrowth, 5, 15), band("o15", "Over 15%", (r) => r.impliedGrowth, 15, Infinity), { id: "below", label: "Below what it grows", test: (r) => r.impliedGrowth !== null && r.revenueGrowth !== null && r.impliedGrowth < r.revenueGrowth }],
  },
];

/** The field each fixed filter on a filings figure reads, so the methodology's own levels join it rather than a second pill. */
const FILTER_FIELD: Readonly<Record<string, FieldId>> = { pe: "pe_ratio", fpe: "forward_pe", eps: "eps_growth_pct", rev: "revenue_growth_pct", div: "dividend_yield_pct", roic: "roic_pct", priced: "implied_growth_pct" };
/** The fixed filters that are the session's (where it trades), before the sector. */
const MARKET_FILTERS = ["index", "chg", "cap"];

const levelWords = (field: FieldId, v: number) => {
  const t = FIELDS[field].type;
  const unit: Unit = t === "money" || t === "pct" || t === "ratio" || t === "days" ? t : "number";
  return unit === "number" ? String(v) : formatUnit(v, unit, "USD").replace(/\.0+(?=%|x| |$)/, "");
};

/**
 * The levels the person's classes test on each filings figure (Hamza, 24 Oct
 * 2026: the screener offers what the methodology reads): for each field a
 * criterion, a required filter, a condition or an alternative compares with
 * a number, the level as two choices, at or past it and short of it, in the
 * comparison's own direction. A field the session carries (price, market
 * value) or a list (a sector, a symbol) is not a filings figure and adds none.
 */
export function methodologyLevels(classes: readonly ClassDef[]): Map<FieldId, FilterOption[]> {
  const out = new Map<FieldId, FilterOption[]>();
  for (const c of classes)
    for (const f of classFilters(c)) {
      const field = f.field as FieldId;
      if (typeof f.value !== "number" || !Number.isFinite(f.value) || !(FUNDAMENTAL_FIELDS as readonly string[]).includes(field) || !["gt", "gte", "lt", "lte"].includes(f.is)) continue;
      const v = f.value;
      const up = f.is === "gt" || f.is === "gte";
      const opts = out.get(field) ?? [];
      const id = `${up ? "ge" : "le"}-${v}`;
      if (opts.some((o) => o.id === id)) continue;
      const pick = (r: TableRow) => (typeof r.values[field] === "number" ? r.values[field] : null);
      const words = levelWords(field, v);
      opts.push(
        up ? { id, label: `${words} or more, your level`, test: (r) => { const x = pick(r); return x !== null && (f.is === "gt" ? x > v : x >= v); } } : { id, label: `${words} or less, your level`, test: (r) => { const x = pick(r); return x !== null && (f.is === "lt" ? x < v : x <= v); } },
        up ? { id: `under-${v}`, label: `Under ${words}`, test: (r) => { const x = pick(r); return x !== null && (f.is === "gt" ? x <= v : x < v); } } : { id: `over-${v}`, label: `Over ${words}`, test: (r) => { const x = pick(r); return x !== null && (f.is === "lt" ? x >= v : x > v); } },
      );
      out.set(field, opts);
    }
  return out;
}

/**
 * The pill row for a person: the session's filters, the sector, the filings'
 * figures, each with the levels their classes test laid after its own bands,
 * then a pill for every other figure their classes test, in the order the
 * classes name them, then their class.
 */
export function screenFilters(rows: readonly TableRow[], classes: readonly ClassDef[], placed: readonly { id: string; label: string }[] | null): ScreenFilter[] {
  const levels = methodologyLevels(classes);
  const fixed = SCREEN_FILTERS.map((f) => {
    const field = FILTER_FIELD[f.id];
    const extra = field ? (levels.get(field) ?? []).filter((o) => !f.options.some((x) => x.label === o.label)) : [];
    if (field) levels.delete(field);
    return extra.length ? { ...f, options: [...f.options, ...extra] } : f;
  });
  const own = [...levels.entries()].map(([field, options]): ScreenFilter => ({ id: `m-${field}`, label: FIELDS[field].label, fundamental: true, options }));
  return [...fixed.filter((f) => MARKET_FILTERS.includes(f.id)), sectorFilter(rows), ...fixed.filter((f) => !MARKET_FILTERS.includes(f.id)), ...own, ...(placed ? [classFilter(placed)] : [])];
}

/** The sector filter: each sector the rows name, in order of its companies' market value; the Nasdaq-100 companies outside the S&P 500 carry none. */
export function sectorFilter(rows: readonly TableRow[]): ScreenFilter {
  const weight = new Map<string, number>();
  for (const r of rows) weight.set(r.sector ?? NO_SECTOR, (weight.get(r.sector ?? NO_SECTOR) ?? 0) + (r.cap ?? 0));
  const sectors = [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
  return { id: "sector", label: "Sector", fundamental: false, options: sectors.map((s) => ({ id: slug(s), label: s, test: (r) => (r.sector ?? NO_SECTOR) === s })) };
}

/** The class filter: the methodology's classes, then no class (read, and placed in none). */
export function classFilter(classes: readonly { id: string; label: string }[]): ScreenFilter {
  return {
    id: "class",
    label: "Your class",
    fundamental: true,
    options: [...classes.map((c) => ({ id: c.id, label: c.label, test: (r: TableRow) => r.classId === c.id })), { id: "none", label: "No class", test: (r: TableRow) => r.read && r.classId === null }],
  };
}

export const NO_SECTOR = "Nasdaq-100, no GICS sector";
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The choices in force: one option per filter, read from the address; an unknown filter or option is ignored. */
export function chosenFilters(filters: readonly ScreenFilter[], params: Readonly<Record<string, string | string[] | undefined>>): { filter: ScreenFilter; option: FilterOption }[] {
  const out: { filter: ScreenFilter; option: FilterOption }[] = [];
  for (const f of filters) {
    const raw = params[f.id];
    const v = Array.isArray(raw) ? raw[0] : raw;
    const option = v ? f.options.find((o) => o.id === v) : undefined;
    if (option) out.push({ filter: f, option });
  }
  return out;
}

export function applyFilters(rows: readonly TableRow[], chosen: readonly { option: FilterOption }[]): TableRow[] {
  return rows.filter((r) => chosen.every((c) => c.option.test(r)));
}

// ---------------------------------------------------------------------------
// Columns and sorting

export const SORT_KEYS = ["symbol", "price", "changePct", "cap", "pe", "forwardPe", "epsGrowth", "revenueGrowth", "divYield", "roic", "impliedGrowth", "sector"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Sorted by a column, a company with no figure last whichever way; ties by market value. */
export function sortRows(rows: readonly TableRow[], key: SortKey, dir: "asc" | "desc"): TableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    const by = x === null || y === null ? 0 : typeof x === "string" ? sign * x.localeCompare(y as string) : sign * ((x as number) - (y as number));
    return by || (b.cap ?? 0) - (a.cap ?? 0) || a.symbol.localeCompare(b.symbol);
  });
}

export function sortOf(params: Readonly<Record<string, string | string[] | undefined>>): { key: SortKey; dir: "asc" | "desc" } {
  const raw = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const key = (SORT_KEYS as readonly string[]).includes(raw("sort") ?? "") ? (raw("sort") as SortKey) : "cap";
  const dir = raw("dir") === "asc" || raw("dir") === "desc" ? (raw("dir") as "asc" | "desc") : key === "symbol" || key === "sector" ? "asc" : "desc";
  return { key, dir };
}

/** The table's first rows before Show all. */
export const TABLE_SHOWN = 100;

/**
 * The heat map's day from the rows the filters leave: each company with a
 * move in its sector, a Nasdaq-100 company outside the S&P 500 under its own
 * heading, so the map draws exactly the screen.
 */
export function mapDay(day: MarketDay, rows: readonly TableRow[]): MarketDay {
  const keep = new Set(rows.map((r) => r.symbol));
  const moves = [...day.moves, ...day.others].filter((m) => keep.has(m.symbol.toUpperCase())).map((m) => ({ ...m, sector: (m.sector ?? NO_SECTOR) as DayMove["sector"] }));
  return { ...day, moves, others: [] };
}
