/**
 * The shadow methodology (Hamza, 9 Nov 2026, the twenty further ways): a
 * second methodology, from the library or the marketplace, run on the same
 * book beside the person's own, without switching. Each is read the same
 * way the app reads the one in use (`evaluate`, `resonanceOf`, the classes'
 * tests); the page sets side by side the rules each keeps today, the
 * holdings each would place in a class and how those holdings have done on
 * their cost. Today's reading of the book as it stands, never a backtest or
 * a forecast. Pure.
 */
import { toBase, type Book, type Holding } from "@/lib/holdings";
import { contextFor, evaluate, type Finding, type Methodology } from "@/lib/methodology";
import type { InputId } from "@/lib/setup";
import { resonanceOf } from "@/lib/resonance";

const toBaseValue = (h: Holding, book: Book) => toBase(h.value, h.currency, book.fx);
const gainPctOf = (h: Holding): number | null => (h.costBasis && h.costBasis > 0 ? (h.value / h.costBasis - 1) * 100 : null);
function holdingWeights(listed: readonly Holding[], book: Book): { total: number; of: Map<string, number> } {
  const total = listed.reduce((n, h) => n + toBaseValue(h, book), 0);
  return { total, of: new Map(listed.map((h) => [h.id, total ? (toBaseValue(h, book) / total) * 100 : 0])) };
}

export type ShadowSide = {
  name: string;
  score: number | null;
  measured: number;
  breaches: number;
  outside: number;
  manual: number;
  unkept: { section: string; text: string; severity: "breach" | "guideline" }[];
  /** The listed holdings its classes take, their share of the listed book and their gain on cost, value-weighted; null when no cost is known. */
  placed: { count: number; weightPct: number; gainPct: number | null };
};
export type ShadowRow = { symbol: string; weightPct: number; own: string | null; shadow: string | null; gainPct: number | null };

const sideOf = (m: Methodology, findings: readonly Finding[], placed: ShadowSide["placed"]): ShadowSide => {
  const r = resonanceOf(findings, [], []);
  return { name: m.name, score: r.score, measured: r.measured, breaches: r.breaches, outside: r.outside, manual: r.manual, unkept: r.unkept.map((u) => ({ section: u.section, text: u.text, severity: u.severity })), placed };
};

/** The two methodologies on the same book: each side's reading and every listed holding with the class each gives it, the ones they disagree on first. */
export function shadowCompare(own: Methodology | null, shadow: Methodology, book: Book, today: string, inputs: readonly InputId[]): { own: ShadowSide | null; shadow: ShadowSide; rows: ShadowRow[]; disagree: number } {
  const listed = book.holdings.filter((h) => h.assetClass === "equity" || h.assetClass === "etf");
  const weights = holdingWeights(listed, book);
  const classesOf = (m: Methodology | null) => {
    if (!m) return new Map<string, string | null>();
    const ctx = contextFor(book, today, m);
    const label = new Map(m.classes.map((c) => [c.id, c.label]));
    return new Map(listed.map((h) => {
      const id = ctx.classOf(h);
      return [h.id, id ? (label.get(id) ?? id) : null] as const;
    }));
  };
  const ownClasses = classesOf(own);
  const shadowClasses = classesOf(shadow);
  const placedOf = (classes: Map<string, string | null>): ShadowSide["placed"] => {
    const taken = listed.filter((h) => classes.get(h.id));
    const value = taken.reduce((n, h) => n + toBaseValue(h, book), 0);
    const costed = taken.filter((h) => gainPctOf(h) !== null);
    const costedValue = costed.reduce((n, h) => n + toBaseValue(h, book), 0);
    const gain = costedValue > 0 ? costed.reduce((n, h) => n + gainPctOf(h)! * toBaseValue(h, book), 0) / costedValue : null;
    return { count: taken.length, weightPct: Math.round((weights.total ? (value / weights.total) * 100 : 0) * 10) / 10, gainPct: gain === null ? null : Math.round(gain * 10) / 10 };
  };
  const rows: ShadowRow[] = listed.map((h) => ({ symbol: h.symbol.toUpperCase(), weightPct: Math.round((weights.of.get(h.id) ?? 0) * 10) / 10, own: ownClasses.get(h.id) ?? null, shadow: shadowClasses.get(h.id) ?? null, gainPct: gainPctOf(h) === null ? null : Math.round(gainPctOf(h)! * 10) / 10 }));
  const differ = (r: ShadowRow) => (own ? (r.own === null) !== (r.shadow === null) : false);
  rows.sort((a, b) => Number(differ(b)) - Number(differ(a)) || b.weightPct - a.weightPct || a.symbol.localeCompare(b.symbol));
  return {
    own: own ? sideOf(own, evaluate(own, book, today, inputs), placedOf(ownClasses)) : null,
    shadow: sideOf(shadow, evaluate(shadow, book, today, inputs), placedOf(shadowClasses)),
    rows,
    disagree: rows.filter(differ).length,
  };
}
