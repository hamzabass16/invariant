/**
 * Look-through: the fundamentals the person's own methodology tests (ROIC,
 * revenue growth, engine growth, FCF per share growth...), read through the
 * book as a weighted average of each company's own figure, by class and for
 * the whole book, beside SPY and QQQ worked out the same way from the
 * companies each fund reported holding to the SEC. Which fields, and so which
 * rows, come from the methodology alone. A figure no company could supply is
 * no reading, never a zero; every average says how much of the book or the
 * fund it covers. Pure.
 */
import { z } from "zod";

import { classFilters, type ClassDef, type Criterion } from "@/lib/recipes";
import { fieldsRead, type Methodology } from "@/lib/methodology";
import { FIELDS, FUNDAMENTAL_FIELDS, type FieldId, type FundamentalField } from "@/lib/ontology";
import type { Weight } from "@/lib/screens";

// ---------------------------------------------------------------------------
// The benchmarks file: SPY's and QQQ's companies as filed, with their figures

/** The funds whose holdings the SEC carries in an N-PORT report, by their own CIK. */
export const BENCHMARK_FUNDS = { SPY: { cik: 884394, name: "SPDR S&P 500 ETF Trust" }, QQQ: { cik: 1067839, name: "Invesco QQQ Trust, Series 1" } } as const;
export type BenchmarkFund = keyof typeof BENCHMARK_FUNDS;
/** The funds every look-through is set against: the market's two references. */
export const LOOK_THROUGH_FUNDS: readonly BenchmarkFund[] = ["SPY", "QQQ"];
export const isBenchmarkFund = (s: string): s is BenchmarkFund => s in BENCHMARK_FUNDS;
/** How many companies a refresh reads across both funds, largest weight first: each is one SEC company-facts document. */
export const MAX_COMPANIES = 60;
/** The kept copy is read again once it is this old, in hours: each morning, so results filed in an earnings season count the next day (Hamza, 24 Oct 2026). */
export const REFRESH_HOURS = 20;

const constituentSchema = z.object({
  name: z.string().max(200),
  /** Percent of the fund's net assets, share classes of one company added. */
  pct: z.number(),
  ticker: z.string().max(12).nullable(),
  cik: z.number().nullable(),
  values: z.record(z.string(), z.number().nullable()),
  /** Why no figures, when there are none: not read this time (beyond the budget), or the SEC lists no such company. */
  error: z.string().max(300).nullable(),
});
export type Constituent = z.infer<typeof constituentSchema>;

export const fundLookSchema = z.object({
  symbol: z.string().max(8),
  cik: z.number(),
  accession: z.string().max(30),
  /** The date the fund's holdings are as of. */
  reportDate: z.string(),
  filed: z.string(),
  constituents: z.array(constituentSchema).max(600),
});
export type FundLook = z.infer<typeof fundLookSchema>;

export const benchmarksFileSchema = z.object({
  version: z.literal(1),
  funds: z.record(z.string(), fundLookSchema),
  /** A sentence per fund that could not be read this time; its last good copy stays. */
  problems: z.array(z.string().max(400)).max(10).default([]),
  updated: z.string(),
});
export type BenchmarksFile = z.infer<typeof benchmarksFileSchema>;
export const EMPTY_BENCHMARKS: BenchmarksFile = { version: 1, funds: {}, problems: [], updated: "" };

/**
 * The companies a refresh reads: the largest of each fund in turn, by weight,
 * until `max` distinct companies; a company both funds hold is read once.
 */
export function companiesToRead(funds: readonly { symbol: string; issuers: readonly { name: string; pct: number }[] }[], max = MAX_COMPANIES): string[] {
  const out: string[] = [];
  const queue = funds.flatMap((f) => f.issuers.map((i) => ({ name: i.name, pct: i.pct }))).sort((a, b) => b.pct - a.pct);
  for (const q of queue) {
    if (out.length >= max) break;
    const key = q.name.toUpperCase();
    if (!out.some((n) => n.toUpperCase() === key)) out.push(q.name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Which figures: the methodology's own

/** Units an average across companies means something in: percentages, ratios and plain numbers; never amounts of money. */
const AVERAGEABLE = new Set(["pct", "ratio", "number", "days"]);

function criterionFields(c: Criterion): FieldId[] {
  return [c.field as FieldId, ...(c.or ?? []).map((o) => o.field as FieldId)];
}

/**
 * The fundamentals the methodology tests, in the order it names them: the
 * fields its classes' criteria and required filters read, then those its
 * figures read. Amounts of money (invested capital, net debt) are left out:
 * an average of them across companies means nothing.
 */
export function lookThroughFields(m: Methodology | null): FundamentalField[] {
  if (!m) return [];
  const seen: FieldId[] = [];
  const add = (f: FieldId) => {
    if (!seen.includes(f)) seen.push(f);
  };
  for (const c of m.classes ?? []) for (const cr of [...(c.required ?? []), ...c.criteria]) criterionFields(cr).forEach(add);
  for (const f of m.figures) fieldsRead(f).forEach(add);
  return seen.filter((f): f is FundamentalField => (FUNDAMENTAL_FIELDS as readonly string[]).includes(f) && AVERAGEABLE.has(FIELDS[f].type));
}

// ---------------------------------------------------------------------------
// The averages

export type Reading = {
  /** Weighted average of the companies' own figures; null when none had one. */
  value: number | null;
  /** Percent of the group's weight whose companies had a figure. */
  coverage: number;
  /** Companies with a figure, of those in the group. */
  read: number;
  of: number;
};

/** The weighted average of `field` over items carrying a weight and their figures. */
export function weighted(items: readonly { weight: number; values: Record<string, number | null | undefined> }[], field: string): Reading {
  let sum = 0;
  let w = 0;
  let total = 0;
  let read = 0;
  for (const it of items) {
    if (!(it.weight > 0)) continue;
    total += it.weight;
    const v = it.values[field];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    sum += v * it.weight;
    w += it.weight;
    read += 1;
  }
  return { value: w > 0 ? sum / w : null, coverage: total > 0 ? (w / total) * 100 : 0, read, of: items.filter((i) => i.weight > 0).length };
}

export type LookGroup = { key: string; label: string; kind: "class" | "book" | "fund"; weight: number; readings: Record<string, Reading>; note: string | null };

export type LookThrough = {
  fields: FundamentalField[];
  /** The whole book's listed holdings, then each class, in the methodology's order. */
  book: LookGroup;
  classes: LookGroup[];
  funds: LookGroup[];
  /** Each listed holding with its own figures. */
  holdings: { symbol: string; classLabel: string; weight: number; values: Record<string, number | null> }[];
};

const fundNote = (f: FundLook, read: number, readPct: number) =>
  `${read} largest companies read, ${readPct.toFixed(0)}% of the fund, from its N-PORT report to the SEC for ${f.reportDate}`;

/**
 * The look-through of the book's listed holdings against the funds in the
 * benchmarks file that the comparison names. Cash, funds and options are not
 * companies and are left out of every average; a class with no listed
 * holding is not drawn.
 */
export function lookThrough(m: Methodology | null, weights: readonly Weight[], file: BenchmarksFile | null, funds: readonly string[]): LookThrough | null {
  const fields = lookThroughFields(m);
  if (!fields.length) return null;
  const listed = weights.filter((w) => w.holdings[0]?.assetClass === "equity");
  const items = listed.map((w) => ({ weight: w.weight, values: (w.holdings[0]?.fundamentals ?? {}) as Record<string, number | null>, classId: w.classId, classLabel: w.classLabel, symbol: w.symbol }));
  const readingsOf = (its: readonly { weight: number; values: Record<string, number | null | undefined> }[]) => Object.fromEntries(fields.map((f) => [f, weighted(its, f)]));
  const book: LookGroup = { key: "book", label: "Your book", kind: "book", weight: items.reduce((s, i) => s + i.weight, 0), readings: readingsOf(items), note: null };
  const order = (m?.classes ?? []).map((c) => c.id);
  const classIds = [...new Set(items.map((i) => i.classId))].sort((a, b) => (a === null ? 1 : b === null ? -1 : order.indexOf(a) - order.indexOf(b)));
  const classes: LookGroup[] = classIds.map((id) => {
    const its = items.filter((i) => i.classId === id);
    return { key: id ?? "none", label: its[0].classLabel, kind: "class", weight: its.reduce((s, i) => s + i.weight, 0), readings: readingsOf(its), note: null };
  });
  const fundGroups: LookGroup[] = [];
  for (const symbol of funds) {
    const f = file?.funds[symbol];
    if (!f) continue;
    const readOnes = f.constituents.filter((c) => !c.error);
    const its = readOnes.map((c) => ({ weight: c.pct, values: c.values }));
    const readPct = readOnes.reduce((s, c) => s + c.pct, 0);
    fundGroups.push({ key: symbol, label: symbol, kind: "fund", weight: readPct, readings: readingsOf(its), note: fundNote(f, readOnes.length, readPct) });
  }
  return {
    fields,
    book,
    classes,
    funds: fundGroups,
    holdings: items.sort((a, b) => b.weight - a.weight).map((i) => ({ symbol: i.symbol, classLabel: i.classLabel, weight: i.weight, values: Object.fromEntries(fields.map((f) => [f, i.values[f] ?? null])) })),
  };
}

/** A field's value in its unit, for the tables. */
export function formatField(field: FieldId, v: number | null): string {
  if (v === null) return "–";
  const t = FIELDS[field].type;
  if (t === "pct") return `${v.toFixed(1)}%`;
  if (t === "ratio") return `${v.toFixed(2)}x`;
  return v.toFixed(Math.abs(v) >= 100 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Against the market: the book beside SPY, judged by what the classes test

/** Which way the classes want a figure: every test on it upward, every one downward, or neither. */
export type Want = "higher" | "lower" | null;

export type FundGap = {
  field: FundamentalField;
  book: number | null;
  fund: number | null;
  /** The book less the fund, in the field's unit (points for a percentage). */
  gap: number | null;
  want: Want;
  /** Where the book sits against the fund, in the direction the classes want: none when they want neither. */
  stands: "ahead" | "level" | "behind" | null;
  /** Each class's test on the figure, with the class's own average and whether it meets it. */
  tests: { classId: string; classLabel: string; words: string; value: number | null; holds: boolean | null }[];
  /**
   * The holdings pulling the book's figure the wrong way against the fund,
   * most first: each one's share of the book's reading times its distance
   * from the fund, so every holding's pull adds up to the gap. Against the
   * classes' direction when they have one, else the gap's own.
   */
  pulls: { symbol: string; classLabel: string; weight: number; value: number; pull: number }[];
};

/** Holdings named as pulling a figure the wrong way. */
export const MAX_PULLS = 3;

const testWords = (field: FieldId, is: string, v: number) => (is === "gte" ? `${formatField(field, v)} or more` : is === "gt" ? `over ${formatField(field, v)}` : is === "lte" ? `${formatField(field, v)} or less` : `under ${formatField(field, v)}`);
const meets = (is: string, x: number, v: number) => (is === "gte" ? x >= v : is === "gt" ? x > v : is === "lte" ? x <= v : x < v);

/** Within this share of the fund's own figure the book is level with it (half a point at least for a percentage). */
const LEVEL_SHARE = 0.05;

/**
 * The look-through set against one fund, figure by figure (Hamza, 24 Oct
 * 2026: "the S&P has more ROIC, but your portfolio is based on compounding
 * machines that have a high ROIC; what are the biggest holdings pushing it
 * down"): the gap, which way the classes' own tests want the figure, where
 * the book stands, and the holdings pulling it the wrong way most. The app's
 * arithmetic; a figure with no reading on either side is left out.
 */
export function againstFund(look: LookThrough | null, classes: readonly ClassDef[], fund = "SPY"): { fund: string; rows: FundGap[] } | null {
  const f = look?.funds.find((g) => g.key === fund);
  if (!look || !f) return null;
  const rows: FundGap[] = [];
  for (const field of look.fields) {
    const book = look.book.readings[field]?.value ?? null;
    const fv = f.readings[field]?.value ?? null;
    if (book === null || fv === null) continue;
    const tests: FundGap["tests"] = [];
    for (const c of classes)
      for (const fl of classFilters(c)) {
        if (fl.field !== field || typeof fl.value !== "number" || !Number.isFinite(fl.value) || !["gt", "gte", "lt", "lte"].includes(fl.is)) continue;
        const words = testWords(field, fl.is, fl.value);
        if (tests.some((t) => t.classId === c.id && t.words === words)) continue;
        const value = look.classes.find((g) => g.key === c.id)?.readings[field]?.value ?? null;
        tests.push({ classId: c.id, classLabel: c.label, words, value, holds: value === null ? null : meets(fl.is, value, fl.value) });
      }
    const ups = tests.filter((t) => t.words.endsWith("or more") || t.words.startsWith("over")).length;
    const want: Want = !tests.length ? null : ups === tests.length ? "higher" : ups === 0 ? "lower" : null;
    const gap = book - fv;
    const level = Math.abs(gap) <= Math.max(Math.abs(fv) * LEVEL_SHARE, FIELDS[field].type === "pct" ? 0.5 : 0);
    const stands = want === null ? null : level ? "level" : (gap > 0) === (want === "higher") ? "ahead" : "behind";
    const read = look.holdings.filter((h) => h.weight > 0 && typeof h.values[field] === "number" && Number.isFinite(h.values[field]));
    const total = read.reduce((s, h) => s + h.weight, 0);
    const wrong = want === "higher" ? -1 : want === "lower" ? 1 : gap < 0 ? -1 : 1;
    const pulls = read
      .map((h) => ({ symbol: h.symbol, classLabel: h.classLabel, weight: h.weight, value: h.values[field] as number, pull: total > 0 ? (h.weight / total) * ((h.values[field] as number) - fv) : 0 }))
      .filter((p) => Math.sign(p.pull) === wrong)
      .sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull))
      .slice(0, MAX_PULLS);
    rows.push({ field, book, fund: fv, gap, want, stands, tests, pulls });
  }
  return rows.length ? { fund, rows } : null;
}

/**
 * The fund the book is set against: the first benchmark the methodology
 * names that the look-through reads, else SPY, else QQQ. Never a fixed
 * choice when the methodology names one.
 */
export function comparisonFund(look: LookThrough | null, benchmarks: readonly string[]): string | null {
  const read = new Set((look?.funds ?? []).map((g) => g.key));
  return [...benchmarks, ...LOOK_THROUGH_FUNDS].find((b) => read.has(b)) ?? null;
}

/** The look-through against the methodology's own fund (`comparisonFund`). */
export function againstBenchmark(look: LookThrough | null, classes: readonly ClassDef[], benchmarks: readonly string[]): { fund: string; rows: FundGap[] } | null {
  const fund = comparisonFund(look, benchmarks);
  return fund ? againstFund(look, classes, fund) : null;
}

/** A gap or a pull in the field's unit: points for a percentage. */
export function formatGap(field: FieldId, v: number): string {
  const t = FIELDS[field].type;
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  return t === "pct" ? `${s}${a.toFixed(1)} pts` : t === "ratio" ? `${s}${a.toFixed(2)}x` : `${s}${a.toFixed(a >= 100 ? 0 : 1)}`;
}
