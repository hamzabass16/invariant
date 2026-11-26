/**
 * The Dashboard as one ruled grid (Hamza, 21 Nov 2026: "more of a bloomberg
 * terminal grid layout like that qualtrim portfolio page"). Pure: the
 * holdings table's rows under four tabs, the day's contributors and
 * detractors, and the allocation folded to its largest holdings, all from
 * the positions (lib/positions.ts), the filings' fields and the person's own
 * valuations, so the page at the close and the browser at today's prices
 * build the same grid. A figure not read is null, never a zero; nothing is
 * forecast, and the gap to a fair value is the person's own arithmetic.
 */
import type { OwnValuation } from "@/lib/fair-value";
import type { PositionRow, Positions } from "@/lib/positions";

export const GRID_TABS = ["overview", "performance", "valuation", "fundamentals"] as const;
export type GridTab = (typeof GRID_TABS)[number];
export const GRID_TAB_LABEL: Record<GridTab, string> = { overview: "Overview", performance: "Performance", valuation: "Valuation", fundamentals: "Fundamentals" };

/** How many holdings the allocation names before the rest fold into Other. */
export const ALLOCATION_TOP = 5;
/** How many contributors and detractors the day lists each way. */
export const MOVERS_SHOWN = 3;
/** Rows the table shows before Show all. */
export const GRID_ROWS_SHOWN = 12;

/** What the page knows of a holding beyond its position: its class, its filings' fields and the person's own valuation. */
export type GridExtra = { classLabel: string | null; fields: Record<string, number | null>; own: OwnValuation | null };

export type GridRow = {
  symbol: string;
  name: string;
  assetClass: PositionRow["assetClass"];
  classLabel: string | null;
  currency: string;
  price: number | null;
  value: number;
  /** Share of net worth, in percent. */
  weight: number;
  dayPct: number | null;
  dayPnl: number | null;
  /** The day's money as points of the book: what the holding added to or took from its move. */
  dayPts: number | null;
  ytdPct: number | null;
  sixMonthPct: number | null;
  totalPct: number | null;
  totalPnl: number | null;
  /** The unrealized gain as points of net worth. */
  totalPts: number | null;
  /** The move from the price to the person's base, in percent (+15 is 15% upside to it); null without both. */
  toFairPct: number | null;
  /** What the holding would be worth at that base, less what it is worth. */
  toFairMoney: number | null;
  /** Each of the filings' fields the tabs read, null where not read. */
  fields: Record<string, number | null>;
};

/** The columns of each tab past the company, in order: an id, a label, and how the figure reads. */
export type GridColumn = { id: string; label: string; kind: "pct" | "ratio" | "money" | "price" | "pts" };
export const GRID_COLUMNS: Record<Exclude<GridTab, "overview">, GridColumn[]> = {
  performance: [
    { id: "dayPct", label: "Today", kind: "pct" },
    { id: "ytdPct", label: "YTD", kind: "pct" },
    { id: "sixMonthPct", label: "6M", kind: "pct" },
    { id: "totalPct", label: "Since bought", kind: "pct" },
    { id: "totalPnl", label: "Unrealized", kind: "money" },
    { id: "totalPts", label: "Of the book", kind: "pts" },
  ],
  valuation: [
    { id: "pe_ratio", label: "P/E", kind: "ratio" },
    { id: "fwd_pe", label: "Fwd P/E", kind: "ratio" },
    { id: "ps_ratio", label: "P/S", kind: "ratio" },
    { id: "pfcf_ratio", label: "P/FCF", kind: "ratio" },
    { id: "fcf_yield", label: "FCF yield", kind: "pct" },
    { id: "toFairPct", label: "To your value", kind: "pct" },
  ],
  fundamentals: [
    { id: "revenue_growth_pct", label: "Revenue growth", kind: "pct" },
    { id: "eps_growth_pct", label: "EPS growth", kind: "pct" },
    { id: "operating_margin_pct", label: "Op. margin", kind: "pct" },
    { id: "roic_pct", label: "ROIC", kind: "pct" },
    { id: "dividend_yield_pct", label: "Div. yield", kind: "pct" },
    { id: "net_debt_to_ebitda", label: "Net debt / EBITDA", kind: "ratio" },
  ],
};

/** The filings' fields the tabs read; the page hands only these to the browser. */
export const GRID_FIELDS = ["pe_ratio", "forward_pe", "consensus_forward_pe", "ps_ratio", "pfcf_ratio", "revenue_growth_pct", "eps_growth_pct", "operating_margin_pct", "roic_pct", "dividend_yield_pct", "net_debt_to_ebitda"] as const;

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const finite = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A column's reading on a row, null where not read. */
export function cellOf(r: GridRow, id: string): number | null {
  switch (id) {
    case "dayPct":
    case "ytdPct":
    case "sixMonthPct":
    case "totalPct":
    case "totalPnl":
    case "totalPts":
    case "toFairPct":
      return r[id];
    // The analysts' forward P/E where read, else the filings' own (lib/forward.ts), as the value map reads it.
    case "fwd_pe":
      return finite(r.fields.consensus_forward_pe) ?? finite(r.fields.forward_pe);
    // Free cash flow over the price, the inverse of P/FCF; none for a negative or missing multiple.
    case "fcf_yield": {
      const m = finite(r.fields.pfcf_ratio);
      return m && m > 0 ? round(100 / m) : null;
    }
    default:
      return finite(r.fields[id]);
  }
}

/**
 * The positions as grid rows, the largest first: weights of net worth, the
 * day and the gain as points of the book, the gap to the person's base where
 * the price and the base are in one currency (the base is kept per share in
 * the price's own), and the filings' fields. A holding with no extra keeps
 * its position and reads nothing else.
 */
export function gridRows(p: Pick<Positions, "rows" | "total">, extras: Record<string, GridExtra>): GridRow[] {
  const worth = p.total.value;
  const pts = (v: number | null) => (v === null || worth <= 0 ? null : round((v / worth) * 100));
  return p.rows
    .map((r) => {
      const x = extras[r.symbol.toUpperCase()] ?? null;
      const base = x?.own?.base ?? null;
      const toFair = base && base > 0 && r.last && r.last > 0 ? round((base / r.last - 1) * 100) : null;
      return {
        symbol: r.symbol,
        name: r.name,
        assetClass: r.assetClass,
        classLabel: x?.classLabel ?? null,
        currency: r.currency,
        price: r.last,
        value: r.value,
        weight: worth > 0 ? round((r.value / worth) * 100) : 0,
        dayPct: r.dayPct,
        dayPnl: r.dayPnl,
        dayPts: pts(r.dayPnl),
        ytdPct: r.ytdPct,
        sixMonthPct: r.sixMonthPct,
        totalPct: r.sinceBoughtPct,
        totalPnl: r.unrealizedPnl,
        totalPts: pts(r.unrealizedPnl),
        toFairPct: toFair,
        toFairMoney: toFair === null ? null : round((r.value * toFair) / 100),
        fields: x?.fields ?? {},
      };
    })
    .sort((a, b) => b.value - a.value);
}

/** The day's largest contributors and detractors by money, each way at most `n`; a flat or unread day is in neither. */
export function dayMovers(rows: readonly GridRow[], n = MOVERS_SHOWN): { up: GridRow[]; down: GridRow[] } {
  const moved = rows.filter((r) => r.dayPnl !== null && r.dayPnl !== 0);
  return {
    up: moved.filter((r) => r.dayPnl! > 0).sort((a, b) => b.dayPnl! - a.dayPnl!).slice(0, n),
    down: moved.filter((r) => r.dayPnl! < 0).sort((a, b) => a.dayPnl! - b.dayPnl!).slice(0, n),
  };
}

/** The book against the person's bases, on the rows that carry one: worth, worth at the bases, the gap, and the share of the listed book covered. */
export function gridFair(rows: readonly GridRow[]): { value: number; fair: number; toFairPct: number; coveredPct: number; count: number } | null {
  const valued = rows.filter((r) => r.toFairMoney !== null);
  const listed = rows.filter((r) => r.assetClass === "equity" || r.assetClass === "etf").reduce((s, r) => s + r.value, 0);
  if (!valued.length) return null;
  const value = valued.reduce((s, r) => s + r.value, 0);
  const fair = value + valued.reduce((s, r) => s + r.toFairMoney!, 0);
  return { value: round(value), fair: round(fair), toFairPct: value > 0 ? round((fair / value - 1) * 100) : 0, coveredPct: listed > 0 ? round((value / listed) * 100, 1) : 0, count: valued.length };
}

export type AllocationSlice = { key: string; label: string; value: number; color: string; href?: string };

/**
 * The allocation's slices folded to the `top` largest holdings, then Other
 * and Cash, so the ring stays legible beside the grid; the top's share of
 * the whole is returned with it ("Top 5 = 60.5%").
 */
export function foldAllocation<S extends AllocationSlice>(slices: readonly S[], other: string, top = ALLOCATION_TOP): { slices: AllocationSlice[]; topShare: number; count: number } {
  const cash = slices.filter((s) => s.key === "cash" || s.key.endsWith("-cash"));
  const held = slices.filter((s) => !cash.includes(s)).sort((a, b) => b.value - a.value);
  const kept: AllocationSlice[] = held.slice(0, top).map(({ key, label, value, color, href }) => ({ key, label, value, color, ...(href ? { href } : {}) }));
  const rest = held.slice(top).reduce((s, x) => s + x.value, 0);
  const out = [...kept];
  if (rest > 0.05) out.push({ key: "other", label: `Other (${held.length - top})`, value: round(rest, 1), color: other });
  const cashShare = cash.reduce((s, x) => s + x.value, 0);
  if (cashShare > 0.05) out.push({ key: "cash", label: "Cash", value: round(cashShare, 1), color: "var(--text-tertiary)" });
  return { slices: out, topShare: round(kept.reduce((s, x) => s + x.value, 0), 1), count: held.length };
}
