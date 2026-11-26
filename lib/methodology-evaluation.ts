import { z } from "zod";

import { saleLogged, type DecisionsFile } from "@/lib/decisions";
import type { FilingsFile } from "@/lib/filings";
import type { Book } from "@/lib/holdings";
import { EVAL_TEST_ABOUT, EVAL_TESTS, evalTestSchema, type EvalTest, type EvalTestKind, type Finding, type Methodology } from "@/lib/methodology";
import { alphaOver, annualise, drawdownOver, navIndex, returnOver } from "@/lib/performance";
import { criterionLabel } from "@/lib/recipes";
import type { Weight } from "@/lib/screens";
import { returnSince } from "@/lib/thesis-scorecard";
import { daysBetween, longDate } from "@/lib/time";
import { MODELS } from "@/lib/models";

/**
 * Is the methodology any good? (Hamza, 23 Oct 2026: "not all methodologies
 * are right, and this should be a page that acts as a judgment on that,
 * relative to the benchmarks.") The Evaluation view on Methodology reads,
 * since the day the person has invested under it:
 *
 *   - whether they are: the share of the book its classes place, the rules
 *     broken today, the buys since the start that its classes place, and the
 *     sales with a Decision Log entry;
 *   - whether it works: the proofs the document itself gives (the
 *     methodology's `evaluation`), else the tests their own model proposed
 *     and they confirmed, else the app's defaults, each one of the fixed kinds
 *     in EVAL_TESTS, computed here on the book, the closes and the filings.
 *
 * The verdict on each test and on the whole is the app's arithmetic, never a
 * model's; the model only proposes which tests and since when, on the
 * person's own key (lib/methodology-evaluation-run.ts), and nothing it
 * proposes counts until they confirm it. A period under a year is read but
 * called too early; only holdings held today are counted, which the page
 * says. Not investment advice. Pure.
 */

type Close = { date: string; value: number };

export const EVAL_BENCHMARK = "SPY";
/** Below this many days the reading is shown but called too early to judge. */
export const EARLY_DAYS = 365;
/** The methodology's adopted day is the start only with at least this many days of figures after it; else the whole record is read. */
export const ADOPTED_MIN_DAYS = 90;
/** Points a year ahead of (or behind) the benchmark before a test reads as supporting (or against). */
export const EDGE_PTS = 1;
/** Points against the benchmark, since each was bought, that a class must lead (or trail) by. */
export const CLASS_EDGE_PTS = 2;
/** A holding's price growth within this many points a year of its EPS growth tracks it. */
export const TRACK_PTS = 5;
export const MIN_SPAN_YEARS = 1.5;
export const EVAL_MODEL = MODELS.standard;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The vault's `evaluation` file: the day the person measures from, the tests they confirmed from their model, and a proposal waiting. */
export const evaluationProposalSchema = z.object({
  since: isoDate.nullable(),
  sinceWhy: z.string().max(400).nullable(),
  tests: z.array(evalTestSchema).max(8),
  advice: z.string().max(800),
  /** The methodology the proposal was made against, by name. */
  against: z.string().max(80),
  at: z.string(),
});
export type EvaluationProposal = z.infer<typeof evaluationProposalSchema>;
export const evaluationFileSchema = z.object({
  version: z.literal(1),
  since: isoDate.nullable(),
  sinceWhy: z.string().max(400).nullable().default(null),
  tests: z.array(evalTestSchema).max(8).nullable(),
  advice: z.string().max(800).nullable().default(null),
  proposal: evaluationProposalSchema.nullable(),
  updated: z.string(),
});
export type EvaluationFile = z.infer<typeof evaluationFileSchema>;
export const EMPTY_EVALUATION: EvaluationFile = { version: 1, since: null, sinceWhy: null, tests: null, advice: null, proposal: null, updated: "" };

// ---------------------------------------------------------------------------
// Since when

export type StartBasis = "yours" | "adopted" | "series";
export type Start = { day: string; basis: StartBasis; words: string };

/**
 * The day the evaluation reads from: the day the person set (or confirmed
 * from their model), else the day the methodology was adopted when enough
 * figures follow it, else the first day of the account's value series. A day
 * before the series starts is read from the series' start, and said so.
 */
export function startOf(m: Pick<Methodology, "adopted">, file: EvaluationFile | null, seriesStart: string | null, asOf: string): Start {
  const first = seriesStart ?? asOf;
  const clamp = (d: string) => (d < first ? first : d);
  if (file?.since) {
    const day = clamp(file.since);
    const why = file.sinceWhy ? ` ${file.sinceWhy.replace(/\s+$/, "")}` : "";
    return { day, basis: "yours", words: day === file.since ? `From ${longDate(day)}, the day you set.${why}` : `From ${longDate(day)}, where your figures begin (you set ${longDate(file.since)}).` };
  }
  if (m.adopted && m.adopted >= first && daysBetween(m.adopted, asOf) >= ADOPTED_MIN_DAYS) return { day: m.adopted, basis: "adopted", words: `From ${longDate(m.adopted)}, the day this methodology was adopted.` };
  const adoptedNote = m.adopted ? ` It was adopted ${longDate(m.adopted)}, with too few figures since to judge it alone, so your whole record is read; set the day you began investing this way.` : " Set the day you began investing this way.";
  return { day: first, basis: "series", words: `From ${longDate(first)}, where your figures begin.${adoptedNote}` };
}

// ---------------------------------------------------------------------------
// Are you investing under it

export type AdherenceVerdict = "following" | "partly" | "drifting" | "unread";
export type Adherence = {
  verdict: AdherenceVerdict;
  /** Percent of the listed book by value that the classes place. */
  placedPct: number | null;
  placed: number;
  listed: number;
  breaches: number;
  tested: number;
  /** Buys since the start, by company: how many the classes place today, how many are held but not placed, how many were sold since. */
  buys: { companies: number; placed: number; unplaced: string[]; gone: number };
  sales: { count: number; logged: number } | null;
  reasons: string[];
};

const pct = (v: number) => `${v.toFixed(0)}%`;

/**
 * Whether the person invests under the methodology, as far as the app can
 * see: the classes' share of the book, today's breaches, what was bought
 * since the start and whether sales carry a reason. A company bought since and
 * sold since has no class today to read, and is counted as gone. The
 * reading is the app's, and the page says it is inferred from today's
 * classes.
 */
export function adherenceOf(input: { book: Book; weights: readonly Weight[]; findings: readonly Finding[] | null; decisions: DecisionsFile | null; start: string; logsDecisions: boolean }): Adherence {
  const { book, weights, findings, decisions, start } = input;
  const listed = weights.filter((w) => w.holdings.some((h) => h.assetClass === "equity" || h.assetClass === "etf"));
  const total = listed.reduce((s, w) => s + w.weight, 0);
  const placedW = listed.filter((w) => w.classId);
  // With no figures from the filings on any listed holding, no class can be read: that is a gap, not a drift, and no share is shown.
  const classesRead = listed.some((w) => w.holdings.some((h) => Object.values(h.fundamentals ?? {}).some((v) => v !== null)));
  const placedPct = total > 0 && (classesRead || placedW.length) ? (placedW.reduce((s, w) => s + w.weight, 0) / total) * 100 : null;
  const breaches = (findings ?? []).filter((f) => f.status === "fail" && f.rule.severity !== "watch").length;
  const tested = (findings ?? []).filter((f) => f.status !== "manual" && f.status !== "n/a").length;
  const bought = [...new Set(book.transactions.filter((t) => t.kind === "buy" && t.date > start).map((t) => t.symbol.toUpperCase()))];
  const bySym = new Map(weights.map((w) => [w.symbol, w]));
  const buys = { companies: bought.length, placed: 0, unplaced: [] as string[], gone: 0 };
  for (const s of bought) {
    const w = bySym.get(s);
    if (!w) buys.gone += 1;
    else if (w.classId) buys.placed += 1;
    else buys.unplaced.push(s);
  }
  const sells = book.transactions.filter((t) => t.kind === "sell" && t.date > start);
  const sales = input.logsDecisions || (decisions?.entries.length ?? 0) > 0 ? { count: sells.length, logged: sells.filter((t) => saleLogged(decisions, t.symbol, t.date)).length } : null;
  const reasons: string[] = [];
  if (placedPct !== null) reasons.push(`${pct(placedPct)} of the listed book sits in a class it names.`);
  if (findings) reasons.push(breaches ? `${breaches} ${breaches === 1 ? "rule is" : "rules are"} broken today.` : tested ? "No tested rule is broken today." : "No rule can be tested on today's figures.");
  const judged = buys.placed + buys.unplaced.length;
  if (judged) reasons.push(`${buys.placed} of ${judged} ${judged === 1 ? "company" : "companies"} bought since the start and still held ${judged === 1 ? "is" : "are"} placed by a class${buys.unplaced.length ? `; not ${buys.unplaced.slice(0, 4).join(", ")}${buys.unplaced.length > 4 ? "..." : ""}` : ""}.`);
  if (sales?.count) reasons.push(`${sales.logged} of ${sales.count} ${sales.count === 1 ? "sale has" : "sales have"} a Decision Log entry within a week.`);
  const buyShare = judged ? buys.placed / judged : null;
  if (!classesRead && listed.length) reasons.unshift("No listed holding has figures from the filings yet, so no class can be read; the filings are read each morning.");
  let verdict: AdherenceVerdict;
  if (placedPct === null) verdict = "unread";
  else if (placedPct < 50 || breaches >= 3 || (buyShare !== null && buyShare < 0.5)) verdict = "drifting";
  else if (placedPct >= 80 && breaches === 0 && (buyShare === null || buyShare >= 0.75)) verdict = "following";
  else verdict = "partly";
  return { verdict, placedPct, placed: placedW.length, listed: listed.length, breaches, tested, buys, sales, reasons };
}

export const ADHERENCE_WORDS: Record<AdherenceVerdict, string> = { following: "Following it", partly: "Partly", drifting: "Drifting from it", unread: "Nothing to read" };

// ---------------------------------------------------------------------------
// Which tests

export type TestSource = "methodology" | "confirmed" | "default";
export const SOURCE_WORDS: Record<TestSource, string> = { methodology: "Your methodology says", confirmed: "Suggested by the AI, confirmed by you", default: "The app's default" };

/**
 * The app's tests for a methodology that states no proof of its own: the
 * whole book against the benchmark and in a fall, each class (in its order,
 * the first being the one the methodology ranks first) against the
 * benchmark, and, when it has classes, earnings against price over five
 * years.
 */
export function defaultTests(m: Pick<Methodology, "classes">): EvalTest[] {
  const out: EvalTest[] = [
    { kind: "beats_benchmark", class: null, years: null, section: null, claim: "The book does better than the market over time." },
    { kind: "smaller_drawdown", class: null, years: null, section: null, claim: "The book falls less than the market at its worst." },
  ];
  for (const c of m.classes.slice(0, 3)) out.push({ kind: "class_beats_benchmark", class: c.id, years: null, section: null, claim: `${c.label} beat the market from when each was bought.` });
  if (m.classes.length) out.push({ kind: "earnings_track_price", class: null, years: 5, section: null, claim: "Share prices follow earnings growth over five years." });
  return out.slice(0, 8);
}

/** The methodology's own proofs, else the person's confirmed tests, else the defaults; a test naming a class the methodology no longer has is left out. */
export function testsFor(m: Pick<Methodology, "classes" | "evaluation">, file: EvaluationFile | null): { tests: EvalTest[]; source: TestSource } {
  const ids = new Set(m.classes.map((c) => c.id));
  const fits = (t: EvalTest) => (!t.class || ids.has(t.class)) && !((t.kind === "class_beats_benchmark" || t.kind === "class_ahead_of_rest") && !t.class);
  const own = (m.evaluation?.tests ?? []).filter(fits);
  if (own.length) return { tests: own, source: "methodology" };
  const confirmed = (file?.tests ?? []).filter(fits);
  if (confirmed.length) return { tests: confirmed, source: "confirmed" };
  return { tests: defaultTests(m), source: "default" };
}

// ---------------------------------------------------------------------------
// The tests

export type TestVerdict = "supports" | "mixed" | "against" | "no_data";
export const VERDICT_WORDS: Record<TestVerdict, string> = { supports: "Supports it", mixed: "Mixed", against: "Against it", no_data: "Not enough data" };
export type TestRow = { symbol: string; label: string; a: number | null; b: number | null; note: string | null };
export type TestResult = {
  test: EvalTest;
  title: string;
  verdict: TestVerdict;
  /** One sentence: what the figures say. */
  headline: string;
  figures: { label: string; value: string }[];
  /** Per holding, for the class and earnings tests: a and b are the two readings the chart sets side by side. */
  rows: TestRow[];
  /** What a and b are, for the chart's legend and the table's headers. */
  series: [string, string] | null;
  notes: string[];
};

export type EvalEnv = {
  book: Book;
  m: Pick<Methodology, "classes">;
  start: string;
  asOf: string;
  benchmark: string;
  weights: readonly Weight[];
  closes: Record<string, readonly Close[]>;
  filings: FilingsFile | null;
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const signed = (v: number, unit = "%") => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}${unit}`;
const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} pts`;
const classLabel = (m: EvalEnv["m"], id: string | null | undefined) => (id ? (m.classes.find((c) => c.id === id)?.label ?? id) : "All holdings");
const yearsWords = (days: number) => (days >= 365 ? `${(days / 365.25).toFixed(1)} years` : `${Math.round(days / 30.4)} months`);

function titleOf(t: EvalTest, m: EvalEnv["m"], benchmark: string): string {
  if (t.kind === "beats_benchmark") return `The book against ${benchmark}`;
  if (t.kind === "smaller_drawdown") return `The worst fall against ${benchmark}'s`;
  if (t.kind === "class_beats_benchmark") return `${classLabel(m, t.class)} against ${benchmark}`;
  if (t.kind === "class_ahead_of_rest") return `${classLabel(m, t.class)} against the rest of the book`;
  return `Price against earnings${t.class ? `: ${classLabel(m, t.class)}` : ""}`;
}

const noData = (t: EvalTest, title: string, headline: string, notes: string[] = []): TestResult => ({ test: t, title, verdict: "no_data", headline, figures: [], rows: [], series: null, notes });

/** The benchmark's closes from the book's own series, else the closes read. */
function benchSeries(env: EvalEnv): Close[] | null {
  const own = env.book.series?.benchmarks[env.benchmark];
  if (own && own.length > 1) return own;
  const read = env.closes[env.benchmark];
  return read && read.length > 1 ? [...read] : null;
}

function bookAgainst(t: EvalTest, env: EvalEnv): TestResult {
  const title = titleOf(t, env.m, env.benchmark);
  const idx = navIndex(env.book);
  if (!idx) return noData(t, title, "Needs the account's value series, which the broker's statement supplies.");
  const bench = benchSeries(env);
  if (!bench) return noData(t, title, `Needs ${env.benchmark}'s closes, which have not been read.`);
  const from = env.start < idx.dates[0] ? idx.dates[0] : env.start;
  const days = daysBetween(from, env.asOf);
  if (days < 7) return noData(t, title, "Too few days since the start to read a return.");
  const book = returnOver(idx.dates, idx.index, from, env.asOf);
  const b = returnSince(bench.filter((c) => c.date <= env.asOf), from);
  if (book === null || b === null) return noData(t, title, `The account's series or ${env.benchmark}'s does not reach back to ${longDate(from)}.`);
  const yearly = days >= 365;
  const bookY = yearly ? (annualise(book, days) ?? book) : book;
  const benchY = yearly ? (annualise(b, days) ?? b) : b;
  const diff = round1(bookY - benchY);
  const unit = yearly ? " a year" : "";
  const alpha = alphaOver(env.book, env.benchmark, { from, to: env.asOf });
  const figures = [
    { label: yearly ? "Your return a year" : "Your return", value: signed(bookY) },
    { label: yearly ? `${env.benchmark} a year` : env.benchmark, value: signed(benchY) },
    { label: "Difference", value: `${pts(diff)}${unit}` },
    ...(alpha ? [{ label: "Alpha a year", value: `${signed(alpha.alpha)} (p ${alpha.p < 0.001 ? "< 0.001" : alpha.p.toFixed(2)})` }] : []),
  ];
  const notes = alpha ? [alpha.p < 0.05 ? "The alpha is unlikely to be chance at the 5% level." : "The alpha could be chance: its p-value is above 0.05."] : [];
  const verdict: TestVerdict = diff >= EDGE_PTS ? "supports" : diff <= -EDGE_PTS ? "against" : "mixed";
  const headline = `${diff >= 0 ? "Ahead of" : "Behind"} ${env.benchmark} by ${Math.abs(diff).toFixed(1)} points${unit} over ${yearsWords(days)}, time-weighted, money added left out.`;
  return { test: t, title, verdict, headline, figures, rows: [], series: null, notes };
}

/** The deepest fall below a running high in a series of closes between two days, in percent (0 or negative). */
export function maxFall(closes: readonly Close[], from: string, to: string): number | null {
  const pts = closes.filter((c) => c.date >= from && c.date <= to && c.value > 0);
  if (pts.length < 2) return null;
  let high = pts[0].value;
  let worst = 0;
  for (const p of pts) {
    high = Math.max(high, p.value);
    worst = Math.min(worst, (p.value / high - 1) * 100);
  }
  return worst;
}

function drawdownAgainst(t: EvalTest, env: EvalEnv): TestResult {
  const title = titleOf(t, env.m, env.benchmark);
  const idx = navIndex(env.book);
  if (!idx) return noData(t, title, "Needs the account's value series, which the broker's statement supplies.");
  const bench = benchSeries(env);
  if (!bench) return noData(t, title, `Needs ${env.benchmark}'s closes, which have not been read.`);
  const from = env.start < idx.dates[0] ? idx.dates[0] : env.start;
  const dd = drawdownOver(env.book, { from, to: env.asOf });
  const bd = maxFall(bench, from, env.asOf);
  if (!dd || bd === null) return noData(t, title, "Too few days since the start to read a fall.");
  const gap = round1(dd.maxDrawdown - bd);
  const verdict: TestVerdict = gap >= EDGE_PTS ? "supports" : gap <= -EDGE_PTS ? "against" : "mixed";
  return {
    test: t,
    title,
    verdict,
    headline: `The book's worst fall was ${Math.abs(dd.maxDrawdown).toFixed(1)}% (to ${longDate(dd.troughDate)}), against ${Math.abs(bd).toFixed(1)}% for ${env.benchmark}: ${gap >= 0 ? "shallower" : "deeper"} by ${Math.abs(gap).toFixed(1)} points.`,
    figures: [
      { label: "Your worst fall", value: signed(dd.maxDrawdown) },
      { label: `${env.benchmark}'s worst fall`, value: signed(bd) },
      { label: "Difference", value: pts(gap) },
    ],
    rows: [],
    series: null,
    notes: [],
  };
}

type Excess = { symbol: string; weight: number; from: string; r: number; b: number; excess: number };

/** Each holding's return against the benchmark from the later of the start and its first buy, by today's weight. */
function excessOf(env: EvalEnv, ws: readonly Weight[]): { rows: Excess[]; missing: string[] } {
  const bench = benchSeries(env);
  const rows: Excess[] = [];
  const missing: string[] = [];
  for (const w of ws) {
    const closes = env.closes[w.symbol]?.filter((c) => c.date <= env.asOf);
    const firstBuy = env.book.transactions.filter((t) => t.kind === "buy" && t.symbol.toUpperCase() === w.symbol).map((t) => t.date).sort()[0] ?? null;
    const from = firstBuy && firstBuy > env.start ? firstBuy : env.start;
    const r = returnSince(closes, from);
    const b = bench ? returnSince(bench.filter((c) => c.date <= env.asOf), from) : null;
    if (r === null || b === null) missing.push(w.symbol);
    else rows.push({ symbol: w.symbol, weight: w.weight, from, r, b, excess: round1(r - b) });
  }
  return { rows, missing };
}

const weighted = (rows: readonly Excess[]) => {
  const w = rows.reduce((s, r) => s + r.weight, 0);
  return w > 0 ? round1(rows.reduce((s, r) => s + r.excess * r.weight, 0) / w) : null;
};

function classAgainst(t: EvalTest, env: EvalEnv): TestResult {
  const title = titleOf(t, env.m, env.benchmark);
  const label = classLabel(env.m, t.class);
  const members = env.weights.filter((w) => w.classId === t.class);
  if (!members.length) return noData(t, title, `No holding is in ${label} today.`);
  const { rows, missing } = excessOf(env, members);
  if (!rows.length) return noData(t, title, `Needs the closes of ${label}'s holdings, which have not been read.`, missing.length ? [`No closes for ${missing.join(", ")}.`] : []);
  const avg = weighted(rows)!;
  const ahead = rows.filter((r) => r.excess > 0).length;
  const verdict: TestVerdict = avg >= CLASS_EDGE_PTS && ahead * 2 >= rows.length ? "supports" : avg <= -CLASS_EDGE_PTS ? "against" : "mixed";
  return {
    test: t,
    title,
    verdict,
    headline: `${ahead} of ${rows.length} ${label} holdings are ahead of ${env.benchmark} since they were bought or the start; by today's weight, ${pts(avg)} on average.`,
    figures: [
      { label: "Ahead", value: `${ahead} of ${rows.length}` },
      { label: `Against ${env.benchmark}, by weight`, value: pts(avg) },
    ],
    rows: rows.sort((a, b) => b.excess - a.excess).map((r) => ({ symbol: r.symbol, label: `from ${longDate(r.from)}`, a: round1(r.r), b: round1(r.b), note: null })),
    series: [label, env.benchmark],
    notes: [
      "Only the holdings held today are counted: a holding of this class sold before today is not, which flatters the class when the losers were sold.",
      ...(missing.length ? [`No closes for ${missing.join(", ")}.`] : []),
    ],
  };
}

function classAgainstRest(t: EvalTest, env: EvalEnv): TestResult {
  const title = titleOf(t, env.m, env.benchmark);
  const label = classLabel(env.m, t.class);
  const inClass = env.weights.filter((w) => w.classId === t.class);
  const rest = env.weights.filter((w) => w.classId !== t.class && w.holdings.some((h) => h.assetClass === "equity" || h.assetClass === "etf"));
  if (!inClass.length) return noData(t, title, `No holding is in ${label} today.`);
  if (!rest.length) return noData(t, title, `Every listed holding is in ${label}; there is no rest to compare with.`);
  const a = excessOf(env, inClass);
  const b = excessOf(env, rest);
  const ca = weighted(a.rows);
  const cb = weighted(b.rows);
  if (ca === null || cb === null) return noData(t, title, "Needs the holdings' closes, which have not been read.");
  const gap = round1(ca - cb);
  const verdict: TestVerdict = gap >= CLASS_EDGE_PTS ? "supports" : gap <= -CLASS_EDGE_PTS ? "against" : "mixed";
  return {
    test: t,
    title,
    verdict,
    headline: `Against ${env.benchmark} since each was bought, ${label} ${gap >= 0 ? "leads" : "trails"} the rest of the book by ${Math.abs(gap).toFixed(1)} points by weight (${pts(ca)} against ${pts(cb)}).`,
    figures: [
      { label: `${label} against ${env.benchmark}`, value: pts(ca) },
      { label: `The rest against ${env.benchmark}`, value: pts(cb) },
      { label: "Difference", value: pts(gap) },
    ],
    rows: [],
    series: null,
    notes: ["Only the holdings held today are counted."],
  };
}

type EpsPoint = { end: string; eps: number };

/** The filings' trailing EPS by quarter end, the longer history first. */
function epsHistory(filings: FilingsFile | null, symbol: string): { points: EpsPoint[]; currency: string | null } {
  const e = filings?.bySymbol[symbol];
  const fromShare = (e?.perShareTtm ?? []).filter((p) => p.eps !== null).map((p) => ({ end: p.end, eps: p.eps as number }));
  const points = fromShare.length >= (e?.epsTtm?.length ?? 0) ? fromShare : [...(e?.epsTtm ?? [])];
  return { points: points.sort((a, b) => a.end.localeCompare(b.end)), currency: e?.perShareCurrency ?? null };
}

const closeOnOrBefore = (closes: readonly Close[], day: string) => [...closes].reverse().find((c) => c.date <= day) ?? null;

/** Pearson's correlation of two lists; null below three pairs or with no spread. */
export function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

const cagr = (a: number, b: number, years: number) => (Math.pow(b / a, 1 / years) - 1) * 100;

function earningsAgainstPrice(t: EvalTest, env: EvalEnv): TestResult {
  const title = titleOf(t, env.m, env.benchmark);
  const years = t.years ?? 5;
  const pool = env.weights.filter((w) => w.holdings.some((h) => h.assetClass === "equity") && (!t.class || w.classId === t.class));
  if (!pool.length) return noData(t, title, t.class ? `No holding is in ${classLabel(env.m, t.class)} today.` : "No listed company is held.");
  const rows: TestRow[] = [];
  const skipped: string[] = [];
  let spans = 0;
  for (const w of pool) {
    const { points, currency } = epsHistory(env.filings, w.symbol);
    const closes = env.closes[w.symbol];
    const last = points.at(-1);
    if (!last || !closes?.length) {
      skipped.push(w.symbol);
      continue;
    }
    const target = new Date(Date.parse(`${last.end}T00:00:00Z`) - years * 365.25 * 86_400_000).toISOString().slice(0, 10);
    // The quarter nearest the span asked for, else the oldest the filings keep.
    const near = points.filter((p) => Math.abs(daysBetween(p.end, target)) <= 200).sort((a, b) => Math.abs(daysBetween(a.end, target)) - Math.abs(daysBetween(b.end, target)))[0];
    const first = near ?? points[0];
    const span = daysBetween(first.end, last.end) / 365.25;
    const p0 = closeOnOrBefore(closes, first.end);
    const p1 = closeOnOrBefore(closes, last.end);
    if (span < MIN_SPAN_YEARS || !p0 || !p1 || daysBetween(p0.date, first.end) > 10) {
      skipped.push(w.symbol);
      continue;
    }
    if (!(first.eps > 0) || !(last.eps > 0)) {
      rows.push({ symbol: w.symbol, label: `${span.toFixed(1)} years`, a: round1(cagr(p0.value, p1.value, span)), b: null, note: "EPS not positive at both ends, so no growth rate." });
      continue;
    }
    spans += span;
    rows.push({ symbol: w.symbol, label: `${span.toFixed(1)} years`, a: round1(cagr(p0.value, p1.value, span)), b: round1(cagr(first.eps, last.eps, span)), note: currency && currency !== "USD" ? `EPS in ${currency}, price in the listing's currency.` : null });
  }
  const paired = rows.filter((r) => r.a !== null && r.b !== null) as (TestRow & { a: number; b: number })[];
  const notes = [
    ...(skipped.length ? [`Not read: ${skipped.join(", ")} (no EPS history from the filings, or no closes reaching back ${MIN_SPAN_YEARS} years).`] : []),
    "Price is the change in the share price over the same quarters as the EPS; a gap means the multiple changed.",
  ];
  if (paired.length < 2) return { ...noData(t, title, `Needs at least two holdings with ${MIN_SPAN_YEARS} years or more of EPS from the filings and closes over the same span.`, notes), rows, series: ["Price a year", "EPS a year"] };
  const tracking = paired.filter((r) => Math.abs(r.a - r.b) <= TRACK_PTS).length;
  const corr = correlation(paired.map((r) => r.b), paired.map((r) => r.a));
  const gap = round1(paired.reduce((s, r) => s + (r.a - r.b), 0) / paired.length);
  const share = tracking / paired.length;
  const verdict: TestVerdict = share >= 0.6 && (corr === null || corr >= 0.5) ? "supports" : share < 0.3 || (corr !== null && corr < 0) ? "against" : "mixed";
  const span = spans / paired.length;
  const headline = `Over about ${span.toFixed(1)} years, the price grew within ${TRACK_PTS} points a year of EPS for ${tracking} of ${paired.length} holdings${corr === null ? "" : `; the two move together at a correlation of ${corr.toFixed(2)}`}. On average the price ran ${gap >= 0 ? "ahead of" : "behind"} earnings by ${Math.abs(gap).toFixed(1)} points a year.`;
  return {
    test: t,
    title,
    verdict,
    headline,
    figures: [
      { label: "Tracking", value: `${tracking} of ${paired.length}` },
      ...(corr === null ? [] : [{ label: "Correlation", value: corr.toFixed(2) }]),
      { label: "Price less EPS a year", value: pts(gap) },
      ...(span < years - 0.5 ? [{ label: "Span read", value: `${span.toFixed(1)} of ${years} years` }] : []),
    ],
    rows: rows.sort((a, b) => (b.b ?? -Infinity) - (a.b ?? -Infinity)),
    series: ["Price a year", "EPS a year"],
    notes,
  };
}

export function runEvalTest(t: EvalTest, env: EvalEnv): TestResult {
  if (t.kind === "beats_benchmark") return bookAgainst(t, env);
  if (t.kind === "smaller_drawdown") return drawdownAgainst(t, env);
  if (t.kind === "class_beats_benchmark") return classAgainst(t, env);
  if (t.kind === "class_ahead_of_rest") return classAgainstRest(t, env);
  return earningsAgainstPrice(t, env);
}

// ---------------------------------------------------------------------------
// The whole

export type OverallVerdict = "holding_up" | "mixed" | "not_holding_up" | "no_data";
export const OVERALL_WORDS: Record<OverallVerdict, string> = { holding_up: "Holding up", mixed: "Mixed", not_holding_up: "Not holding up", no_data: "Not enough data" };

export type Evaluation = {
  start: Start;
  asOf: string;
  days: number;
  early: boolean;
  benchmark: string;
  source: TestSource;
  results: TestResult[];
  adherence: Adherence;
  verdict: OverallVerdict;
  headline: string;
  caveats: string[];
};

/** The benchmark to judge against: the methodology's first with prices, else SPY. */
export function benchmarkFor(named: readonly string[], book: Book, closes: Record<string, readonly Close[]>): string {
  return named.find((s) => (book.series?.benchmarks[s]?.length ?? 0) > 1 || (closes[s]?.length ?? 0) > 1) ?? EVAL_BENCHMARK;
}

/** Every symbol the evaluation reads closes for: the listed holdings and the benchmark. */
export function evaluationSymbols(weights: readonly Weight[], benchmark: string): string[] {
  return [...new Set([benchmark, EVAL_BENCHMARK, ...weights.filter((w) => w.holdings.some((h) => h.assetClass === "equity" || h.assetClass === "etf")).map((w) => w.symbol)])];
}

/**
 * The evaluation: since when, whether the person invests under it, each test
 * and the whole. The whole holds up when more tests with data support it
 * than go against it, and at least half do; it does not when the reverse is
 * true; else it is mixed. Under EARLY_DAYS it is read and called too early.
 */
export function evaluateMethodology(input: {
  m: Methodology;
  book: Book;
  file: EvaluationFile | null;
  weights: readonly Weight[];
  findings: readonly Finding[] | null;
  decisions: DecisionsFile | null;
  logsDecisions: boolean;
  benchmarks: readonly string[];
  closes: Record<string, readonly Close[]>;
  filings: FilingsFile | null;
}): Evaluation {
  const { m, book, file } = input;
  const asOf = book.asOf;
  const seriesStart = navIndex(book)?.dates[0] ?? null;
  const start = startOf(m, file, seriesStart, asOf);
  const benchmark = benchmarkFor(input.benchmarks, book, input.closes);
  const { tests, source } = testsFor(m, file);
  const env: EvalEnv = { book, m, start: start.day, asOf, benchmark, weights: input.weights, closes: input.closes, filings: input.filings };
  const results = tests.map((t) => runEvalTest(t, env));
  const adherence = adherenceOf({ book, weights: input.weights, findings: input.findings, decisions: input.decisions, start: start.day, logsDecisions: input.logsDecisions });
  const days = Math.max(0, daysBetween(start.day, asOf));
  const early = days < EARLY_DAYS;
  const read = results.filter((r) => r.verdict !== "no_data");
  const s = read.filter((r) => r.verdict === "supports").length;
  const a = read.filter((r) => r.verdict === "against").length;
  const verdict: OverallVerdict = !read.length ? "no_data" : s > a && s * 2 >= read.length ? "holding_up" : a > s && a * 2 >= read.length ? "not_holding_up" : "mixed";
  const span = `since ${longDate(start.day)} (${yearsWords(days)})`;
  const headline = !read.length
    ? `No test can be read ${span} yet; each says what it needs.`
    : `${s} of ${read.length} ${read.length === 1 ? "test supports" : "tests support"} the methodology ${span} and ${a} ${a === 1 ? "goes" : "go"} against it${early ? "; under a year is too early to judge" : ""}.`;
  const caveats = [
    ...(early ? [`Under a year of figures: the reading is shown, but a year or more is needed before it means much.`] : []),
    "Only what is held today is counted in the class and earnings tests; what was sold is not, which can flatter a class.",
    `Whether a holding was bought under the methodology is read from the class its tests give it today, not the day it was bought.`,
    "Past results do not prove a methodology will work. Not investment advice.",
  ];
  return { start, asOf, days, early, benchmark, source, results, adherence, verdict, headline, caveats };
}

// ---------------------------------------------------------------------------
// The model's proposal (on the person's own key; lib/methodology-evaluation-run.ts calls it)

/** What the model is shown: the methodology in words and the dates of the record, never an amount. */
export type EvaluationView = {
  name: string;
  summary: string;
  adopted: string | null;
  classes: { id: string; label: string; test: string }[];
  rules: { section: string; text: string }[];
  seriesStart: string | null;
  firstTrade: string | null;
  asOf: string;
  benchmarks: string[];
};

export function evaluationView(m: Methodology, book: Book | null, benchmarks: readonly string[]): EvaluationView {
  const trades = (book?.transactions ?? []).filter((t) => t.kind === "buy" || t.kind === "sell").map((t) => t.date).sort();
  return {
    name: m.name,
    summary: m.summary,
    adopted: m.adopted,
    classes: m.classes.map((c) => ({ id: c.id, label: c.label, test: [...(c.required ?? []), ...c.criteria].map(criterionLabel).slice(0, 10).join("; ") })),
    rules: m.rules.slice(0, 40).map((r) => ({ section: r.section, text: r.text })),
    seriesStart: book ? (navIndex(book)?.dates[0] ?? null) : null,
    firstTrade: trades[0] ?? null,
    asOf: book?.asOf ?? "",
    benchmarks: [...benchmarks],
  };
}

const proposalToolSchema = z.object({
  since: z.string().nullable().describe("YYYY-MM-DD: the day from which the owner's record should be read as investing under this methodology, between the first day of their figures and the last; null to keep the app's default."),
  since_why: z.string().max(300).nullable().describe("One sentence on why that day, from the dates given; null with since null."),
  tests: z.array(evalTestSchema).min(1).max(6).describe("The tests that would show whether this methodology works, most important first: the ones its own words imply (a class it ranks first should lead; earnings it says drive price should track it). class names a class id from the list."),
  advice: z.string().max(600).describe("Two or three plain sentences on how this methodology should be judged and why, for an owner whose document states no proof of its own. No advice to buy or sell."),
});

export function evaluationRequestBody(v: EvaluationView, model = EVAL_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(proposalToolSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const kinds = EVAL_TESTS.map((k) => `- ${k}: ${EVAL_TEST_ABOUT[k]}`).join("\n");
  const classes = v.classes.length ? v.classes.map((c) => `- ${c.id} (${c.label}): ${c.test || "no test in words"}`).join("\n") : "- none";
  const rules = v.rules.length ? v.rules.map((r) => `- ${r.section}: ${r.text}`).join("\n") : "- none";
  return {
    model,
    max_tokens: 1500,
    system: `You propose how an investor's own methodology should be judged: which tests, of the kinds a portfolio app can compute on their record, would show whether it works, and since which day their record should be read. The app computes every test and every verdict itself; you never compute, estimate or judge a figure, and you never advise buying or selling.

Test kinds:
${kinds}

Rules:
- Prefer the tests the methodology's own words imply. A class listed first is the one it ranks first. A methodology that says earnings drive returns gets earnings_track_price (years as it says, else 5).
- class names one of the class ids given, and class_beats_benchmark and class_ahead_of_rest always name one.
- section is the rule section that implies the test, else null. claim is what should hold if the methodology works, in plain words.
- since: only from the dates given (the adopted day, the first trade, the first day of figures). A methodology adopted recently is often a written version of how the owner already invested; say so in since_why when you choose an earlier day.
- Your whole answer is one call to propose_evaluation.`,
    tools: [{ name: "propose_evaluation", description: "Record how the methodology should be judged.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Methodology: ${v.name}\nSummary: ${v.summary}\nAdopted: ${v.adopted ?? "not given"}\nFirst day of figures: ${v.seriesStart ?? "none"}\nFirst trade in the ledger: ${v.firstTrade ?? "none"}\nLatest figures: ${v.asOf || "none"}\nBenchmarks it names: ${v.benchmarks.join(", ") || "none (the app uses SPY)"}\n\nClasses, in its order:\n${classes}\n\nRules:\n${rules}`,
          },
        ],
      },
    ],
  };
}

export type EvaluationParse = { ok: true; proposal: Omit<EvaluationProposal, "at" | "against"> } | { ok: false; reason: string };

/** The model's call, checked: a class it does not have, a test that needs a class without one, a section it lacks and a day outside the record are dropped, never guessed. */
export function parseEvaluationResponse(body: unknown, v: EvaluationView): EvaluationParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "propose_evaluation");
  if (!call) return { ok: false, reason: "The model answered in words instead of a proposal. Try again." };
  const p = proposalToolSchema.safeParse(call.input);
  if (!p.success) return { ok: false, reason: "What came back was not a proposal the app can read. Try again." };
  const ids = new Set(v.classes.map((c) => c.id));
  const sections = new Set(v.rules.map((r) => r.section));
  const tests: EvalTest[] = [];
  const seen = new Set<string>();
  for (const t of p.data.tests) {
    const cls = t.class && ids.has(t.class) ? t.class : null;
    if ((t.kind === "class_beats_benchmark" || t.kind === "class_ahead_of_rest") && !cls) continue;
    const key = `${t.kind}:${cls ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tests.push({ kind: t.kind as EvalTestKind, class: cls, years: t.kind === "earnings_track_price" ? (t.years ?? 5) : null, section: t.section && sections.has(t.section) ? t.section : null, claim: t.claim });
  }
  if (!tests.length) return { ok: false, reason: "None of the proposed tests could be read on this methodology. Try again." };
  const first = v.seriesStart ?? v.firstTrade;
  const s = p.data.since && /^\d{4}-\d{2}-\d{2}$/.test(p.data.since) && (!v.asOf || p.data.since <= v.asOf) && (!first || p.data.since >= first) ? p.data.since : null;
  return { ok: true, proposal: { since: s, sinceWhy: s ? (p.data.since_why ?? null) : null, tests, advice: p.data.advice.trim() } };
}

/** The file with a proposal confirmed: its tests, its day and its advice become the person's. */
export function confirmProposal(file: EvaluationFile, now: string): EvaluationFile {
  const p = file.proposal;
  if (!p) return file;
  return { ...file, since: p.since ?? file.since, sinceWhy: p.since ? p.sinceWhy : file.sinceWhy, tests: p.tests, advice: p.advice, proposal: null, updated: now };
}
