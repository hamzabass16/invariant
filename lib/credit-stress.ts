/**
 * Credit stress on Macro (Hamza, 5 Nov 2026: "show the highest CDSs of nasdaq
 * and SPY companies, especially the user's holdings and watchlists"; then
 * "Both": no free market spread may be shown to everyone, so everyone gets a
 * reading from the filings and the operator the market's own CDS beside it).
 *
 * The filings' reading is the Altman Z-score (`altman_z`, derived in
 * `fundamentalsOf`), with interest cover and net debt to EBITDA beside it:
 * the companies held and watched first, then the S&P 500 and Nasdaq-100
 * companies with the lowest scores. A bank, an insurer or a real estate trust
 * is not judged, since the score was made for companies with a working
 * capital. Altman's zones, never the app's forecast.
 *
 * DTCC's public CDS tape was read for the operator and left out: a corporate
 * name trades on a fixed coupon with an upfront payment whose direction the
 * tape does not show, a large trade's size is capped, and the ticker holds
 * only the latest prints, so no spread could be read from it that the app
 * could stand behind.
 *
 * Pure.
 */
import type { ScreenerFile } from "@/lib/screener";

/** Altman's 1968 zones. */
export const Z_DISTRESS = 1.81;
export const Z_SAFE = 2.99;
export type CreditZone = "distress" | "grey" | "safe";
export const ZONE_LABEL: Record<CreditZone, string> = { distress: "Distress", grey: "Grey", safe: "Safe" };
export const zoneOf = (z: number): CreditZone => (z < Z_DISTRESS ? "distress" : z <= Z_SAFE ? "grey" : "safe");
/** The S&P 500 and Nasdaq-100 companies listed, the lowest scores first. */
export const CREDIT_SHOWN = 12;
/**
 * The lowest scores are drawn only once this share of the companies the
 * score judges is scored: until then the few scored would be mostly the
 * person's own, read first (Hamza, 6 Nov 2026: "too much of a coincidence").
 */
export const CREDIT_READY_SHARE = 0.5;
/** Sectors the score does not judge: their balance sheets carry no working capital. */
export const NOT_JUDGED_SECTORS = ["Financials", "Real Estate"] as const;

export type CreditRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  z: number | null;
  zone: CreditZone | null;
  interestCover: number | null;
  netDebtToEbitda: number | null;
  /** Held or on the watchlist. */
  own: "held" | "watched" | null;
};

export type CreditStress = {
  /** The companies held and watched with a score, the lowest first; one without a score is left out (Hamza, 6 Nov 2026). */
  yours: CreditRow[];
  /** The S&P 500 and Nasdaq-100 companies with the lowest scores; empty until `ready`. */
  lowest: CreditRow[];
  /** Enough of the S&P 500 and Nasdaq-100 is scored for the lowest to mean anything (`CREDIT_READY_SHARE`). */
  ready: boolean;
  /** Of the S&P 500 and Nasdaq-100: scored, in sectors not judged, not read yet. */
  scored: number;
  notJudged: number;
  unread: number;
  /** In distress among those scored. */
  distress: number;
};

type Own = Record<string, { values: Record<string, number | null | undefined>; name: string | null; sector?: string | null }>;

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const notJudged = (sector: string | null) => !!sector && (NOT_JUDGED_SECTORS as readonly string[]).includes(sector);
const byScore = (a: CreditRow, b: CreditRow) => (a.z === null ? 1 : 0) - (b.z === null ? 1 : 0) || (a.z ?? 0) - (b.z ?? 0) || a.symbol.localeCompare(b.symbol);

/**
 * The credit stress the filings show: `own` is the person's filings read
 * (their holdings and watchlist, at their own prices), which wins over the
 * screener's.
 */
export function creditStress(file: ScreenerFile, own: Own, held: ReadonlySet<string>, watched: ReadonlySet<string>): CreditStress {
  const rowOf = (symbol: string): CreditRow => {
    const mine = own[symbol];
    const c = file.bySymbol[symbol];
    const values = mine?.values ?? c?.values ?? {};
    const sector = c?.sector ?? mine?.sector ?? null;
    const z = notJudged(sector) ? null : num(values.altman_z);
    return {
      symbol,
      name: mine?.name ?? c?.name ?? null,
      sector,
      z,
      zone: z === null ? null : zoneOf(z),
      interestCover: num(values.interest_cover),
      netDebtToEbitda: num(values.net_debt_to_ebitda),
      own: held.has(symbol) ? "held" : watched.has(symbol) ? "watched" : null,
    };
  };
  const yours = [...new Set([...held, ...watched].map((s) => s.toUpperCase()))].map(rowOf).filter((r) => r.z !== null).sort(byScore);
  const universe = file.universe.length ? file.universe : Object.keys(file.bySymbol);
  const all = universe.map(rowOf);
  const scoredRows = all.filter((r) => r.z !== null);
  const judged = all.filter((r) => !notJudged(r.sector));
  const ready = judged.length > 0 && scoredRows.length >= judged.length * CREDIT_READY_SHARE;
  return {
    yours,
    lowest: ready ? scoredRows.sort(byScore).slice(0, CREDIT_SHOWN) : [],
    ready,
    scored: scoredRows.length,
    notJudged: all.length - judged.length,
    unread: judged.length - scoredRows.length,
    distress: scoredRows.filter((r) => r.zone === "distress").length,
  };
}

/** The chart's axes: net debt to EBITDA across, the score up; a point past an edge is drawn on it with an arrow. */
// Wide enough that every company the screen reads sits inside the plot (Hamza, 11 Nov 2026: "zoom out ... every company dot"); only an extreme past these is drawn on the edge.
export const CREDIT_X = { min: -8, max: 16 } as const;
export const CREDIT_Y = { min: -6, max: 30 } as const;

export type CreditPoint = { row: CreditRow; set: "held" | "watched" | "lowest"; x: number; y: number; clipX: -1 | 0 | 1; clipY: -1 | 0 | 1 };

/**
 * The companies the chart places (Hamza, 6 Nov 2026: "more like a chart like
 * the Value map"): the person's own, then the lowest scores not already
 * theirs, each at its net debt to EBITDA and its score. A company with no
 * EBITDA reading is named under the chart, never placed at zero.
 */
export function creditPoints(stress: Pick<CreditStress, "yours" | "lowest">): { points: CreditPoint[]; unplaced: CreditRow[]; axes: { xMin: number; xMax: number; yMin: number; yMax: number } } {
  const mine = new Set(stress.yours.map((r) => r.symbol));
  const rows: { row: CreditRow; set: CreditPoint["set"] }[] = [...stress.yours.map((row) => ({ row, set: (row.own === "held" ? "held" : "watched") as CreditPoint["set"] })), ...stress.lowest.filter((r) => !mine.has(r.symbol)).map((row) => ({ row, set: "lowest" as const }))];
  const placed = rows.filter((r) => r.row.z !== null && r.row.netDebtToEbitda !== null);
  const unplaced = rows.filter((r) => r.row.z !== null && r.row.netDebtToEbitda === null).map((r) => r.row);
  const xs = placed.map((p) => p.row.netDebtToEbitda!);
  const ys = placed.map((p) => p.row.z!);
  // A step of room beyond the furthest company on every side, so no dot sits on the frame.
  const xMin = Math.max(CREDIT_X.min, Math.min(-1, Math.floor(Math.min(0, ...xs)) - 1));
  const xMax = Math.min(CREDIT_X.max, Math.max(4, Math.ceil(Math.max(0, ...xs)) + 1));
  const yMin = Math.max(CREDIT_Y.min, Math.min(0, Math.floor(Math.min(0, ...ys)) - 1));
  const yMax = Math.min(CREDIT_Y.max, Math.max(6, Math.ceil(Math.max(0, ...ys)) + 1));
  const clip = (v: number, lo: number, hi: number): [number, -1 | 0 | 1] => (v < lo ? [lo, -1] : v > hi ? [hi, 1] : [v, 0]);
  const points = placed.map(({ row, set }) => {
    const [x, clipX] = clip(row.netDebtToEbitda!, xMin, xMax);
    const [y, clipY] = clip(row.z!, yMin, yMax);
    return { row, set, x, y, clipX, clipY };
  });
  return { points, unplaced, axes: { xMin, xMax, yMin, yMax } };
}

