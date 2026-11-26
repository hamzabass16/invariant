/**
 * The book against the person's own fair values (Hamza, 4 Nov 2026: "for each
 * holding of mine the current market price relative to the fair value that
 * I've set ... then aggregate all of these: am I undervalued, overvalued, at
 * value?"). Pure. The fair value is the base case of the record's own
 * valuation (`ownValuation`, kept by the Valuation calculator's Keep on a
 * thesis, by write_thesis or by hand on Records), per share in the price's
 * own currency; the low and high are the bear and bull. The book's reading
 * weighs each holding by what it is worth today: its fair value is each
 * holding's value times its base over its price, so the gap is the
 * value-weighted upside to the person's own bases. The person's arithmetic,
 * never the app's forecast and never a verdict.
 */

/** Within this many percent of the base either way, a price is at value. */
export const AT_VALUE_PCT = 5;
/** A valuation set longer ago than this is marked as old. */
export const STALE_VALUATION_DAYS = 365;

export type FairBand = "under" | "at" | "over";
export const BAND_LABEL: Record<FairBand, string> = { under: "Below your value", at: "At your value", over: "Above your value" };
/** Where the price sits among the bear, base and bull. */
export type FairZone = "below_low" | "low_base" | "base_high" | "above_high";
export const ZONE_LABEL: Record<FairZone, string> = { below_low: "under your bear case", low_base: "between your bear and base", base_high: "between your base and bull", above_high: "over your bull case" };

export type OwnValuation = { low: number | null; base: number; high: number | null; asOf: string; basis: string | null };

export type FairInput = { symbol: string; name: string; value: number; price: number | null; currency: string | null; own: OwnValuation | null };

export type FairRow = {
  symbol: string;
  name: string;
  value: number;
  /** Share of the valued holdings' worth, in percent. */
  weightPct: number;
  price: number;
  currency: string | null;
  own: OwnValuation;
  /** The price as a share of the base, in percent (87 is 13% below it). */
  pctOfBase: number;
  /** The move from the price to the base, in percent (+15 is 15% upside to the base). */
  toBasePct: number;
  band: FairBand;
  zone: FairZone | null;
  stale: boolean;
};

export type FairCase = { fair: number; toFairPct: number; band: FairBand; atBase: number };

export type FairBook = {
  rows: FairRow[];
  /** Listed holdings with no valuation of the person's own, or no price to set against it. */
  missing: { symbol: string; name: string; value: number; why: string }[];
  /** What the valued holdings are worth today, and what they would be at the bases. */
  value: number;
  fair: number;
  /** The valued holdings' worth as a share of the base values, in percent. */
  pctOfFair: number | null;
  /** The value-weighted move to the bases, in percent. */
  toFairPct: number | null;
  band: FairBand | null;
  /** The same on the bear and the bull, a holding with no bear or bull counted at its base (`atBase`). */
  bear: FairCase | null;
  bull: FairCase | null;
  /** Share of the listed holdings' worth that has a valuation, in percent. */
  coveredPct: number;
  counts: Record<FairBand, number>;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** Below, at or above value from the move to the base. */
export function bandOf(toPct: number): FairBand {
  if (toPct > AT_VALUE_PCT) return "under";
  if (toPct < -AT_VALUE_PCT) return "over";
  return "at";
}

/** One holding's price against its own valuation; null without a price or a base above zero. */
export function fairRow(i: FairInput, today: string): Omit<FairRow, "weightPct"> | null {
  if (!i.own || !(i.own.base > 0) || i.price === null || !(i.price > 0)) return null;
  const { low, base, high } = i.own;
  const toBasePct = (base / i.price - 1) * 100;
  const zone: FairZone | null = low !== null && i.price < low ? "below_low" : high !== null && i.price > high ? "above_high" : i.price <= base ? (low !== null ? "low_base" : null) : high !== null ? "base_high" : null;
  return { symbol: i.symbol, name: i.name, value: i.value, price: i.price, currency: i.currency, own: i.own, pctOfBase: (i.price / base) * 100, toBasePct, band: bandOf(toBasePct), zone, stale: daysBetween(i.own.asOf, today) > STALE_VALUATION_DAYS };
}

function caseOf(rows: readonly FairRow[], value: number, pick: (r: FairRow) => number | null): FairCase | null {
  if (!rows.length || value <= 0) return null;
  let atBase = 0;
  const fair = rows.reduce((t, r) => {
    const v = pick(r);
    if (v === null || !(v > 0)) atBase += 1;
    return t + (r.value * (v !== null && v > 0 ? v : r.own.base)) / r.price;
  }, 0);
  const toFairPct = (fair / value - 1) * 100;
  return { fair, toFairPct, band: bandOf(toFairPct), atBase };
}

/** Every listed holding against its own fair value, and the book's reading over those valued, by value. */
export function fairValueBook(inputs: readonly FairInput[], today: string): FairBook {
  const listed = inputs.filter((i) => i.value > 0);
  const valued = listed.map((i) => ({ i, r: fairRow(i, today) }));
  const kept = valued.filter((x): x is { i: FairInput; r: Omit<FairRow, "weightPct"> } => x.r !== null);
  const value = kept.reduce((t, x) => t + x.r.value, 0);
  const rows: FairRow[] = kept.map((x) => ({ ...x.r, weightPct: value > 0 ? (x.r.value / value) * 100 : 0 })).sort((a, b) => b.toBasePct - a.toBasePct);
  const missing = valued
    .filter((x) => x.r === null)
    .map((x) => ({ symbol: x.i.symbol, name: x.i.name, value: x.i.value, why: !x.i.own ? "no valuation of yours yet" : !(x.i.own.base > 0) ? "a base of zero" : "no price to set against it" }))
    .sort((a, b) => b.value - a.value);
  const fair = rows.reduce((t, r) => t + (r.value * r.own.base) / r.price, 0);
  const listedValue = listed.reduce((t, i) => t + i.value, 0);
  const toFairPct = rows.length && value > 0 ? (fair / value - 1) * 100 : null;
  const counts: Record<FairBand, number> = { under: 0, at: 0, over: 0 };
  for (const r of rows) counts[r.band] += 1;
  return {
    rows,
    missing,
    value,
    fair,
    pctOfFair: rows.length && fair > 0 ? (value / fair) * 100 : null,
    toFairPct,
    band: toFairPct === null ? null : bandOf(toFairPct),
    bear: caseOf(rows, value, (r) => r.own.low),
    bull: caseOf(rows, value, (r) => r.own.high),
    coveredPct: listedValue > 0 ? (value / listedValue) * 100 : 0,
    counts,
  };
}

/** The book's reading in a sentence. */
export function fairSentence(b: FairBook): string {
  if (b.toFairPct === null || !b.band) return "None of your listed holdings has a valuation of yours with a price to set against it yet.";
  const pct = Math.abs(b.toFairPct).toFixed(1);
  const of = `${b.rows.length} holding${b.rows.length === 1 ? "" : "s"} you have valued (${b.coveredPct.toFixed(0)}% of the listed book by value)`;
  if (b.band === "at") return `At your value: the ${of} trade within ${AT_VALUE_PCT}% of your base cases by value, ${b.toFairPct >= 0 ? "+" : "−"}${pct}% to reach them.`;
  return b.band === "under" ? `Below your value: the ${of} would rise ${pct}% by value to reach your base cases.` : `Above your value: the ${of} would fall ${pct}% by value to reach your base cases.`;
}
