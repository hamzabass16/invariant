/**
 * Recipes: how a methodology's figures, classes and rule tests are written in
 * the ontology's vocabulary (lib/ontology.ts), and how the app computes them.
 *
 * A recipe is data, never code. It names a measure over an object, filtered,
 * windowed and grouped, and combines two of them at most (a ratio, a growth
 * rate, a difference, a scaling). The same recipe gives the same figure on
 * every open, and a recipe that reads a field the person's inputs cannot
 * supply returns what it needs instead of a value. Pure.
 */
import { z } from "zod";

import { fundLookThrough } from "@/lib/exposure";
import type { Holding } from "@/lib/holdings";
import {
  COMPARATORS,
  COMPARATOR_WORDS,
  DIMENSION_FIELD,
  DIMENSIONS,
  FIELD_IDS,
  FIELDS,
  FILTER_OPS,
  MEASURABLE,
  MEASURES,
  PERIOD_WORDS,
  PERIODS,
  SERIES_STATS,
  TIME_DIMENSIONS,
  UNITS,
  WINDOWS,
  fieldAvailable,
  fieldValue,
  inputsFor,
  type Comparator,
  type Dimension,
  type EvalCtx,
  type FieldId,
  type FieldValue,
  type ObjectId,
  type Period,
  type Row,
  type SeriesStat,
  type Unit,
} from "@/lib/ontology";
import { navIndex } from "@/lib/performance";
import type { InputId } from "@/lib/setup";

// ---------------------------------------------------------------------------
// Schemas

const fieldId = z.string().refine((s): s is FieldId => (FIELD_IDS as string[]).includes(s), "Not a field in the ontology.");

export const filterSchema = z.object({
  field: fieldId.describe("A field of the object being measured."),
  is: z.enum(FILTER_OPS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()).max(20)]).optional().describe("Omit for is_null and not_null; a list for in and not_in."),
});
export type Filter = z.infer<typeof filterSchema>;

/**
 * A class criterion: a filter that may apply only under conditions ("FCF
 * conversion at least 0.9, when loans receivable are at most equity") and
 * may be met by an alternative instead ("ROIC at least 20, or invested
 * capital at most 0 when operating margin is above 0"). An alternative whose
 * conditions do not hold is not read; a criterion whose conditions do not
 * hold is not measured and does not count.
 */
const alternativeSchema = filterSchema.extend({
  given: z.array(filterSchema).max(3).optional().describe("Conditions, all of which must hold for this to be read; when one does not, it is not measured."),
});
export const criterionSchema = alternativeSchema.extend({
  or: z.array(alternativeSchema).max(3).optional().describe("Alternatives: the criterion holds when it holds itself or any alternative holds (each read only when its own given hold)."),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const windowSchema = z.object({
  kind: z.enum(WINDOWS),
  months: z.number().int().min(1).max(120).optional().describe("Only for last_months."),
});

export const measureSchema = z
  .object({
    measure: z.enum(MEASURES),
    over: z.enum(MEASURABLE),
    field: fieldId.optional().describe("The field to measure; omit for count."),
    where: z.array(filterSchema).max(6).default([]).describe("Rows to keep. All must hold."),
    window: windowSchema.optional().describe("Transactions only: which dates to keep."),
    whole: z.boolean().optional().describe("Ignore the figure's grouping for this term: measure over everything. For a share of the total per group, set it on the denominator."),
    top: z.number().int().min(1).max(50).optional().describe("Keep only the N rows with the largest field value before measuring: top: 5 with sum gives the five largest together."),
    abs: z.boolean().optional().describe("Measure the field's size regardless of sign: fees, withdrawals and short options are recorded negative."),
  })
  .superRefine((m, ctx) => {
    if (m.top && m.measure === "count") ctx.addIssue({ code: "custom", message: "top needs a field to rank by; count has none." });
    // A field outside the ontology already has its issue from fieldId; the checks below only read fields that exist.
    const known = (id: string | undefined): id is FieldId => !!id && id in FIELDS;
    const ok = (id: string | undefined) => !id || !known(id) || FIELDS[id].object === m.over;
    if (m.measure !== "count" && !m.field) ctx.addIssue({ code: "custom", message: `${m.measure} needs a field.` });
    if (known(m.field) && m.measure !== "count" && !["money", "number", "pct", "days", "ratio"].includes(FIELDS[m.field].type)) ctx.addIssue({ code: "custom", message: `${m.field} is not a number.` });
    if (!ok(m.field)) ctx.addIssue({ code: "custom", message: `${m.field} is not a field of ${m.over}.` });
    for (const w of m.where) if (!ok(w.field)) ctx.addIssue({ code: "custom", message: `${w.field} is not a field of ${m.over}.` });
    if (m.window && m.over !== "transactions") ctx.addIssue({ code: "custom", message: "A window applies to transactions only." });
  });
export type MeasureSpec = z.infer<typeof measureSchema>;

export const seriesExprSchema = z.object({
  op: z.literal("series"),
  stat: z.enum(SERIES_STATS),
  of: z.string().min(1).max(20).default("nav").describe("nav for the account's own value, or a benchmark symbol such as SPY."),
  vs: z.string().min(1).max(20).optional().describe("The benchmark for beta."),
  period: z.enum(PERIODS).default("1y"),
});
export type SeriesExpr = z.infer<typeof seriesExprSchema>;
export const SERIES_BY_DATE: readonly SeriesStat[] = ["growth_of_100", "drawdown"];

/** A figure's arithmetic: one measure, two combined, or a statistic of a time series. */
export const exprSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("measure"), of: measureSchema }),
  z.object({ op: z.literal("ratio"), num: measureSchema, den: measureSchema }).describe("num divided by den; with unit pct, as a percentage."),
  z.object({ op: z.literal("growth"), now: measureSchema, before: measureSchema }).describe("(now - before) / before; with unit pct, as a percentage."),
  z.object({ op: z.literal("difference"), a: measureSchema, b: measureSchema }),
  z.object({ op: z.literal("scaled"), of: measureSchema, by: z.number() }).describe("The measure times a constant."),
  seriesExprSchema.describe("A statistic of the account's value series or a benchmark's: return, drawdown, beta, growth of 100."),
]);
export type Expr = z.infer<typeof exprSchema>;

export const VIEWS = ["tile", "bars", "line", "donut", "table"] as const;
export type View = (typeof VIEWS)[number];

export const figureSchema = z
  .object({
    id: z.string().min(1).max(40).describe("Short stable id, e.g. dividend-income-month."),
    label: z.string().min(1).max(60),
    about: z.string().max(200).optional().describe("One line on what it measures, in the owner's words."),
    unit: z.enum(UNITS),
    expr: exprSchema,
    by: z.enum(DIMENSIONS).optional().describe("Group into a series; omit for one number. date only with a series statistic by day."),
    view: z.enum(VIEWS).describe("tile for one number; bars, line, donut or table for a series."),
  })
  .superRefine((f, ctx) => {
    const byDate = f.expr.op === "series" && SERIES_BY_DATE.includes(f.expr.stat);
    if (f.expr.op === "series" && f.expr.stat === "beta" && !f.expr.vs) ctx.addIssue({ code: "custom", message: "beta needs vs: a benchmark symbol." });
    if (byDate && f.by !== "date") ctx.addIssue({ code: "custom", message: `${f.expr.op === "series" ? f.expr.stat : ""} is a series by day: set by to date.` });
    if (!byDate && f.by === "date") ctx.addIssue({ code: "custom", message: "by: date only goes with growth_of_100 or drawdown." });
  });
export type Figure = z.infer<typeof figureSchema>;

export const classSchema = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    about: z.string().max(200).optional(),
    required: z.array(criterionSchema).max(6).optional().describe("Holding fields that must all hold for the class, whatever the count below: a growth gate, an asset class."),
    criteria: z.array(criterionSchema).min(1).max(8).describe("Holding fields; a holding is in the first class whose required filters all hold and whose criteria hold in at least the minimum number, all of them when no minimum is given."),
    minimum: z.number().int().min(1).max(8).optional().describe("How many of the criteria must hold: 5 for 'five of seven thresholds'. Omit when all must. A criterion with no reading does not hold."),
    minimumShare: z.number().min(1).max(100).optional().describe("Instead of minimum: the share, in percent, of the criteria that could be measured which must hold, e.g. 71 for 'at least 71% of the measurable thresholds'. A criterion with no reading is left out of the count; with nothing measurable the class does not hold."),
  })
  .superRefine((c, ctx) => {
    if (c.minimum !== undefined && c.minimum > c.criteria.length) ctx.addIssue({ code: "custom", message: `Class ${c.id} asks for ${c.minimum} of ${c.criteria.length} criteria.` });
    if (c.minimum !== undefined && c.minimumShare !== undefined) ctx.addIssue({ code: "custom", message: `Class ${c.id} gives both a minimum and a minimum share; one or the other.` });
  });
export type ClassDef = z.infer<typeof classSchema>;

export const testSchema = z.object({
  expr: exprSchema,
  unit: z.enum(UNITS),
  is: z.enum(COMPARATORS),
  limit: z.number().describe("In the unit: 10 for 10% when unit is pct."),
  each: z.enum(DIMENSIONS).optional().describe("Apply the limit to every group (e.g. each holding) rather than the whole."),
});
export type Test = z.infer<typeof testSchema>;

// ---------------------------------------------------------------------------
// Evaluation

/** A group's members are the symbols of the holdings in it, so a table can say which. */
export type Point = { key: string; label: string; value: number | null; members?: string[] };
export type Needs = { field: FieldId; label: string; inputs: InputId[] | null };
export type Result = { kind: "scalar"; value: number | null; needs: Needs[] } | { kind: "series"; points: Point[]; needs: Needs[] };

function rowsOf(object: ObjectId, ctx: EvalCtx): Row[] {
  if (object === "holdings") return ctx.book.holdings.map((row) => ({ object, row }));
  if (object === "transactions") return ctx.book.transactions.map((row) => ({ object, row }));
  if (object === "lookthrough") return fundLookThrough(ctx.book).map((row) => ({ object, row }));
  if (object === "markets") return (ctx.book.markets?.rows ?? []).map((row) => ({ object, row }));
  return [];
}

const asNumber = (v: FieldValue) => (typeof v === "number" ? v : v === null ? null : typeof v === "boolean" ? (v ? 1 : 0) : Number.isNaN(Number(v)) ? null : Number(v));

export function matches(fl: Filter, v: FieldValue): boolean {
  const want = fl.value;
  switch (fl.is) {
    case "is_null":
      return v === null || (Array.isArray(v) && v.length === 0);
    case "not_null":
      return !(v === null || (Array.isArray(v) && v.length === 0));
    case "eq":
      return Array.isArray(v) ? v.some((x) => same(x, want)) : same(v, want);
    case "ne":
      return Array.isArray(v) ? !v.some((x) => same(x, want)) : !same(v, want);
    case "in":
      return Array.isArray(want) && (Array.isArray(v) ? v.some((x) => want.some((w) => same(x, w))) : want.some((w) => same(v, w)));
    case "not_in":
      return Array.isArray(want) && !(Array.isArray(v) ? v.some((x) => want.some((w) => same(x, w))) : want.some((w) => same(v, w)));
    case "contains": {
      const needle = String(want ?? "").toLowerCase();
      return Array.isArray(v) ? v.some((x) => x.toLowerCase().includes(needle)) : typeof v === "string" && v.toLowerCase().includes(needle);
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = typeof v === "string" && typeof want === "string" ? v : asNumber(v);
      const b = typeof v === "string" && typeof want === "string" ? want : asNumber(typeof want === "boolean" || typeof want === "string" || typeof want === "number" ? want : null);
      if (a === null || b === null) return false;
      return fl.is === "gt" ? a > b : fl.is === "gte" ? a >= b : fl.is === "lt" ? a < b : a <= b;
    }
  }
}

function same(v: FieldValue, want: Filter["value"]): boolean {
  if (v === null || want === undefined || Array.isArray(want)) return false;
  if (typeof v === "string" && typeof want === "string") return v.toLowerCase() === want.toLowerCase();
  return v === want || String(v) === String(want);
}

function shift(today: string, months: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function inWindow(date: string, w: MeasureSpec["window"], today: string): boolean {
  if (!w || w.kind === "all") return true;
  if (w.kind === "ttm") return date > shift(today, 12) && date <= today;
  if (w.kind === "prior_ttm") return date > shift(today, 24) && date <= shift(today, 12);
  if (w.kind === "ytd") return date >= `${today.slice(0, 4)}-01-01` && date <= today;
  return date > shift(today, w.months ?? 12) && date <= today;
}

function timeKey(date: string, dim: Dimension): string {
  if (dim === "year") return date.slice(0, 4);
  if (dim === "quarter") return `${date.slice(0, 4)} Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
  return date.slice(0, 7);
}

/** The groups a row falls in under a dimension: usually one; several for a list field; "Untagged" when none. */
function groupKeys(r: Row, dim: Dimension, ctx: EvalCtx): { key: string; label: string }[] {
  const field = DIMENSION_FIELD[dim][r.object];
  if (!field) return [{ key: "all", label: "All" }];
  const v = fieldValue(field, r, ctx);
  if (TIME_DIMENSIONS.includes(dim) && typeof v === "string") {
    const k = timeKey(v, dim);
    return [{ key: k, label: k }];
  }
  if (dim === "holding" && r.object === "holdings") return [{ key: r.row.id, label: r.row.name }];
  if (Array.isArray(v)) return v.length ? v.map((x) => ({ key: x, label: x })) : [{ key: "Untagged", label: "Untagged" }];
  if (v === null) return dim === "class" ? [{ key: "none", label: "No class yet" }] : [{ key: "Unknown", label: "Unknown" }];
  return [{ key: String(v), label: String(v) }];
}

function needsOf(m: MeasureSpec, inputs: readonly InputId[], supplied: ReadonlySet<FieldId>, dim?: Dimension): Needs[] {
  const fields = new Set<FieldId>();
  if (m.field) fields.add(m.field);
  for (const w of m.where) fields.add(w.field);
  const df = dim ? DIMENSION_FIELD[dim][m.over] : undefined;
  if (df) fields.add(df);
  const out: Needs[] = [];
  for (const id of fields) {
    if (id === "class") continue;
    if (!fieldAvailable(id, inputs, supplied)) out.push({ field: id, label: FIELDS[id].label, inputs: inputsFor(id) });
  }
  return out;
}

function aggregate(m: MeasureSpec, rows: Row[], ctx: EvalCtx): number | null {
  if (m.measure === "count") return rows.length;
  let vals = rows.map((r) => asNumber(fieldValue(m.field!, r, ctx))).filter((v): v is number => v !== null);
  if (m.abs) vals = vals.map((v) => Math.abs(v));
  if (m.top) vals = [...vals].sort((a, b) => b - a).slice(0, m.top);
  // No rows at all sums to zero; rows that carry nothing in the field are "nothing to measure yet", never a zero.
  if (!vals.length) return m.measure === "sum" && rows.length === 0 ? 0 : null;
  switch (m.measure) {
    case "sum":
      return vals.reduce((s, v) => s + v, 0);
    case "avg":
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    case "min":
      return Math.min(...vals);
    case "max":
      return Math.max(...vals);
  }
}

/** One measure, as a number or, under a grouping its object supports, a map of groups. */
function computeMeasure(m: MeasureSpec, ctx: EvalCtx, inputs: readonly InputId[], dim?: Dimension): { scalar?: number | null; groups?: Map<string, { label: string; value: number | null; members?: string[] }>; needs: Needs[] } {
  const by = m.whole ? undefined : dim;
  const needs = needsOf(m, inputs, ctx.supplied, by);
  if (needs.length) return { scalar: null, needs };
  // A book with no transactions at all has nothing to measure over them: the statement carried none, which is not a zero.
  if (m.over === "transactions" && !ctx.book.transactions.length) return { scalar: null, needs };
  const rows = rowsOf(m.over, ctx).filter((r) => m.where.every((fl) => matches(fl, fieldValue(fl.field, r, ctx))) && (r.object !== "transactions" || inWindow(r.row.date, m.window, ctx.today)));
  // An indicator the feed did not return has no reading; a sum over no market rows is not a zero.
  if (m.over === "markets" && !rows.length) return { scalar: null, needs };
  if (!by || !DIMENSION_FIELD[by][m.over]) return { scalar: aggregate(m, rows, ctx), needs };
  const buckets = new Map<string, { label: string; rows: Row[] }>();
  for (const r of rows) {
    for (const g of groupKeys(r, by, ctx)) {
      const b = buckets.get(g.key) ?? { label: g.label, rows: [] };
      b.rows.push(r);
      buckets.set(g.key, b);
    }
  }
  const groups = new Map<string, { label: string; value: number | null; members?: string[] }>();
  for (const [key, b] of buckets) groups.set(key, { label: b.label, value: aggregate(m, b.rows, ctx), members: m.over === "holdings" ? b.rows.map((r) => (r.row as Holding).symbol) : undefined });
  return { groups, needs };
}

const unitScale = (unit: Unit, op: Expr["op"]) => (unit === "pct" && (op === "ratio" || op === "growth") ? 100 : 1);

function combine(op: Expr["op"], a: number | null, b: number | null, k: number): number | null {
  if (a === null || b === null) return null;
  switch (op) {
    case "ratio":
      return b === 0 ? null : (a / b) * k;
    case "growth":
      return b === 0 ? null : ((a - b) / Math.abs(b)) * k;
    case "difference":
      return a - b;
    default:
      return a;
  }
}

/** Fills in the months, quarters or years a time series skipped, so a gap reads as zero. */
function fillTime(points: Point[], dim: Dimension): Point[] {
  if (!TIME_DIMENSIONS.includes(dim) || points.length < 2) return points;
  const keys = points.map((p) => p.key).sort();
  const out = new Map(points.map((p) => [p.key, p]));
  const step = (k: string): string => {
    if (dim === "year") return String(Number(k) + 1);
    if (dim === "quarter") {
      const [y, q] = [Number(k.slice(0, 4)), Number(k.slice(-1))];
      return q === 4 ? `${y + 1} Q1` : `${y} Q${q + 1}`;
    }
    const [y, m] = [Number(k.slice(0, 4)), Number(k.slice(5, 7))];
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  };
  for (let k = keys[0]; k < keys[keys.length - 1] && out.size < 400; k = step(k)) if (!out.has(k)) out.set(k, { key: k, label: k, value: 0 });
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Series statistics

type SeriesPoint = { date: string; value: number };

function periodStart(period: Period, today: string, first: string): string {
  if (period === "inception") return first;
  if (period === "ytd") return `${today.slice(0, 4)}-01-01`;
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "3y": 36 }[period];
  return shift(today, months);
}

/** The points of a series inside the period, the last point before the start kept as the base. */
function slice(points: SeriesPoint[], period: Period, today: string): SeriesPoint[] {
  const sorted = [...points].filter((p) => p.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!sorted.length) return [];
  const start = periodStart(period, today, sorted[0].date);
  const before = sorted.filter((p) => p.date <= start);
  const base = before.length ? before[before.length - 1] : sorted[0];
  return [base, ...sorted.filter((p) => p.date > base.date)];
}

function returns(points: SeriesPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) if (points[i - 1].value !== 0) out.push(points[i].value / points[i - 1].value - 1);
  return out;
}

/** Observations a year from the points' spacing: daily, weekly or monthly. */
function perYear(points: SeriesPoint[]): number {
  if (points.length < 3) return 252;
  const gap = (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) / 86_400_000 / (points.length - 1);
  return gap <= 2 ? 252 : gap <= 8 ? 52 : 12;
}

function seriesStat(expr: SeriesExpr, ctx: EvalCtx, inputs: readonly InputId[]): Result {
  const needs: Needs[] = [];
  // A series the book already carries counts as supplied, whatever the input catalogue says: a
  // benchmark that arrived with the broker's own file is read; one that did not is asked for.
  const carried = (name: string) => (name === "nav" ? (ctx.book.series?.nav.length ?? 0) > 0 : (ctx.book.series?.benchmarks[name]?.length ?? 0) > 0);
  const need = (name: string) => {
    const id: FieldId = name === "nav" ? "nav_series" : "benchmark_series";
    if (!carried(name) && !fieldAvailable(id, inputs)) needs.push({ field: id, label: name === "nav" ? FIELDS[id].label : `${FIELDS[id].label} (${name})`, inputs: inputsFor(id) });
  };
  need(expr.of);
  if (expr.stat === "beta" && expr.vs) need(expr.vs);
  const byDate = SERIES_BY_DATE.includes(expr.stat);
  if (needs.length) return byDate ? { kind: "series", points: [], needs } : { kind: "scalar", value: null, needs };
  // The account's series is read as its time-weighted index, deposits and withdrawals taken out, so money added is never a return, a swing or a drawdown (Hamza, 19 Oct 2026).
  const source = (name: string): SeriesPoint[] => {
    if (name !== "nav") return ctx.book.series?.benchmarks[name] ?? [];
    const idx = navIndex(ctx.book);
    return idx ? idx.dates.map((date, i) => ({ date, value: idx.index[i] })) : (ctx.book.series?.nav ?? []);
  };
  const pts = slice(source(expr.of), expr.period, ctx.today);
  if (pts.length < 2) return byDate ? { kind: "series", points: [], needs } : { kind: "scalar", value: null, needs };
  const first = pts[0].value;
  const last = pts[pts.length - 1].value;
  switch (expr.stat) {
    case "return":
      return { kind: "scalar", value: first === 0 ? null : (last / first - 1) * 100, needs };
    case "max_drawdown": {
      let peak = -Infinity;
      let worst = 0;
      for (const p of pts) {
        peak = Math.max(peak, p.value);
        if (peak > 0) worst = Math.min(worst, p.value / peak - 1);
      }
      return { kind: "scalar", value: worst * 100, needs };
    }
    case "high_water_gap": {
      const peak = Math.max(...pts.map((p) => p.value));
      return { kind: "scalar", value: peak > 0 ? (last / peak - 1) * 100 : null, needs };
    }
    case "volatility": {
      const r = returns(pts);
      if (r.length < 2) return { kind: "scalar", value: null, needs };
      const mean = r.reduce((s, v) => s + v, 0) / r.length;
      const sd = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / (r.length - 1));
      return { kind: "scalar", value: sd * Math.sqrt(perYear(pts)) * 100, needs };
    }
    case "beta": {
      const bench = slice(source(expr.vs!), expr.period, ctx.today);
      const byDay = new Map(bench.map((p) => [p.date, p.value]));
      const paired = pts.filter((p) => byDay.has(p.date));
      const a = returns(paired);
      const b = returns(paired.map((p) => ({ date: p.date, value: byDay.get(p.date)! })));
      if (a.length < 3) return { kind: "scalar", value: null, needs };
      const ma = a.reduce((s, v) => s + v, 0) / a.length;
      const mb = b.reduce((s, v) => s + v, 0) / b.length;
      let cov = 0;
      let vb = 0;
      for (let i = 0; i < a.length; i++) {
        cov += (a[i] - ma) * (b[i] - mb);
        vb += (b[i] - mb) ** 2;
      }
      return { kind: "scalar", value: vb === 0 ? null : cov / vb, needs };
    }
    case "sortino": {
      // Mean return over the root mean square of the falls, both a year (Sortino and Price, 1994; the target 0).
      const r = returns(pts);
      if (r.length < 2) return { kind: "scalar", value: null, needs };
      const down = Math.sqrt(r.reduce((s, v) => s + Math.min(0, v) ** 2, 0) / r.length);
      const mean = r.reduce((s, v) => s + v, 0) / r.length;
      return { kind: "scalar", value: down === 0 ? null : (mean / down) * Math.sqrt(perYear(pts)), needs };
    }
    case "growth_of_100":
      return { kind: "series", points: first === 0 ? [] : pts.map((p) => ({ key: p.date, label: p.date, value: (p.value / first) * 100 })), needs };
    case "drawdown": {
      let peak = -Infinity;
      return {
        kind: "series",
        points: pts.map((p) => {
          peak = Math.max(peak, p.value);
          return { key: p.date, label: p.date, value: peak > 0 ? (p.value / peak - 1) * 100 : null };
        }),
        needs,
      };
    }
  }
}

export function computeExpr(expr: Expr, unit: Unit, ctx: EvalCtx, inputs: readonly InputId[], by?: Dimension): Result {
  if (expr.op === "series") return seriesStat(expr, ctx, inputs);
  const terms: MeasureSpec[] = expr.op === "measure" || expr.op === "scaled" ? [expr.of] : expr.op === "ratio" ? [expr.num, expr.den] : expr.op === "growth" ? [expr.now, expr.before] : [expr.a, expr.b];
  const k = expr.op === "scaled" ? expr.by : unitScale(unit, expr.op);
  const parts = terms.map((t) => computeMeasure(t, ctx, inputs, by));
  const needs = parts.flatMap((p) => p.needs).filter((n, i, arr) => arr.findIndex((x) => x.field === n.field) === i);
  const finish = (a: number | null, b: number | null) => (expr.op === "measure" ? a : expr.op === "scaled" ? (a === null ? null : a * k) : combine(expr.op, a, b, k));
  if (needs.length) return by ? { kind: "series", points: [], needs } : { kind: "scalar", value: null, needs };
  const [p1, p2] = parts;
  if (!by || (!p1.groups && !p2?.groups)) return { kind: "scalar", value: finish(p1.scalar ?? null, p2?.scalar ?? null), needs };
  const keys = new Map<string, { label: string; members?: string[] }>();
  for (const p of parts) for (const [key, g] of p.groups ?? []) keys.set(key, { label: g.label, members: keys.get(key)?.members ?? g.members });
  const at = (p: typeof p1, key: string) => (p.groups ? (p.groups.get(key)?.value ?? (terms[0].measure === "sum" || terms[0].measure === "count" ? 0 : null)) : (p.scalar ?? null));
  let points: Point[] = [...keys.entries()].map(([key, g]) => ({ key, label: g.label, value: finish(at(p1, key), p2 ? at(p2, key) : null), ...(g.members ? { members: g.members } : {}) }));
  points = TIME_DIMENSIONS.includes(by) ? fillTime(points, by) : points.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return { kind: "series", points, needs };
}

/** One criterion read against a holding: its value, whether it holds, and whether there was a reading at all. */
export type CriterionRead = { filter: Criterion; /** The field the value belongs to: the criterion's own, or the alternative that was read. */ field: FieldId; value: FieldValue; pass: boolean; read: boolean; /** Why it was not measured, or which alternative met it. */ note: string | null };

/** A class test's count in words: "5 of 7 hold (5 needed); 1 without a reading; a required filter fails". */
export function passWords(t: { passes: number; needed: number; unread: number; criteria: readonly unknown[]; required: readonly { pass: boolean }[] }): string {
  const measurable = t.criteria.length - t.unread;
  return `${t.passes} of ${measurable} hold${t.needed < measurable ? ` (${t.needed} needed)` : ""}${t.unread ? `; ${t.unread} of ${t.criteria.length} without a reading` : ""}${t.required.length && !t.required.every((x) => x.pass) ? "; a required filter fails" : ""}`;
}

/**
 * A class's test on one holding: every required filter read, every criterion
 * read, the count that hold against the count the class asks for. A criterion
 * whose field has no value does not hold and is counted as unread, so the
 * screen can say "passes 4 of 7, 2 not measurable" rather than a bare fail.
 */
export function classTest(c: ClassDef, h: Holding, ctx: EvalCtx): { required: CriterionRead[]; criteria: CriterionRead[]; passes: number; needed: number; unread: number; holds: boolean } {
  const r: Row = { object: "holdings", row: h };
  const readOne = (fl: Filter): { value: FieldValue; pass: boolean; read: boolean } => {
    if (fl.field === "class") return { value: null, pass: false, read: false };
    const value = fieldValue(fl.field, r, ctx);
    return { value, pass: matches(fl, value), read: !(value === null || (Array.isArray(value) && !value.length)) };
  };
  // The conditions of a criterion or an alternative: null when they all hold, else the first that does not (unread counts as not holding).
  const unmet = (given: Filter[] | undefined): Filter | null => given?.find((g) => !readOne(g).pass) ?? null;
  const read = (cr: Criterion): CriterionRead => {
    const g = unmet(cr.given);
    const main = g ? { value: null, pass: false, read: false } : readOne(cr);
    let out: CriterionRead = { filter: cr, field: cr.field, ...main, note: g ? `not measured: ${filterLabel(g)} does not hold` : null };
    if (!out.pass) {
      for (const alt of cr.or ?? []) {
        if (unmet(alt.given)) continue;
        const a = readOne(alt);
        if (a.pass) return { filter: cr, field: alt.field, value: a.value, pass: true, read: true, note: `met by ${alternativeLabel(alt)}` };
        if (a.read && !out.read) out = { ...out, field: alt.field, value: a.value, read: true, note: `read as ${alternativeLabel(alt)}` };
      }
    }
    return out;
  };
  const required = (c.required ?? []).map(read);
  const criteria = c.criteria.map(read);
  const passes = criteria.filter((x) => x.pass).length;
  const measurable = criteria.filter((x) => x.read).length;
  const needed = c.minimum ?? (c.minimumShare !== undefined ? Math.max(1, Math.ceil((c.minimumShare / 100) * measurable - 1e-9)) : c.criteria.length);
  return { required, criteria, passes, needed, unread: criteria.length - measurable, holds: required.every((x) => x.pass) && measurable > 0 && passes >= needed };
}

/** The class a methodology gives each holding: the first whose required filters hold and whose criteria hold in number. */
export function classifier(classes: ClassDef[], ctx: EvalCtx): (h: Holding) => string | null {
  const cache = new Map<string, string | null>();
  return (h) => {
    if (cache.has(h.id)) return cache.get(h.id)!;
    const hit = classes.find((c) => classTest(c, h, ctx).holds);
    const id = hit?.id ?? null;
    cache.set(h.id, id);
    return id;
  };
}

/** Every filter a class reads, conditions and alternatives included: the required ones first, then the counted criteria. */
export const classFilters = (c: ClassDef): Filter[] => [...(c.required ?? []), ...c.criteria].flatMap((cr) => [cr, ...(cr.given ?? []), ...(cr.or ?? []).flatMap((a) => [a, ...(a.given ?? [])])]);

/** Fields a class reads that the person's inputs cannot supply, so the class is named as needing data. */
export function classNeeds(c: ClassDef, inputs: readonly InputId[]): Needs[] {
  const out: Needs[] = [];
  for (const fl of classFilters(c)) if (fl.field !== "class" && !fieldAvailable(fl.field, inputs) && !out.some((n) => n.field === fl.field)) out.push({ field: fl.field, label: FIELDS[fl.field].label, inputs: inputsFor(fl.field) });
  return out;
}

const CLASS_OP_WORDS: Record<string, string> = { eq: "is", ne: "is not", in: "in", not_in: "not in", gt: "above", gte: "at least", lt: "below", lte: "at most", contains: "includes", is_null: "is empty", not_null: "is set" };

/** One class filter in words: "ROIC at least 20". */
export function filterLabel(fl: Filter): string {
  return `${FIELDS[fl.field].label} ${CLASS_OP_WORDS[fl.is] ?? fl.is}${fl.value === undefined ? "" : ` ${Array.isArray(fl.value) ? fl.value.join(", ") : String(fl.value)}`}`;
}

/** A criterion in words, its conditions and alternatives included: "ROIC at least 20, or invested capital at most 0 (when operating margin above 0)". */
export function criterionLabel(cr: Criterion): string {
  return `${alternativeLabel(cr)}${cr.or?.length ? `, or ${cr.or.map(alternativeLabel).join(", or ")}` : ""}`;
}

/** One filter with its conditions: "Net interest expense at most 0 (when Net debt at most 0)". */
function alternativeLabel(a: Filter & { given?: Filter[] }): string {
  return `${filterLabel(a)}${a.given?.length ? ` (when ${a.given.map(filterLabel).join(" and ")})` : ""}`;
}

/** A class's test in words: "growth at most 20; at least 5 of 7: ROIC at least 20, ...". */
export function classWords(c: ClassDef): string {
  const req = (c.required ?? []).map(criterionLabel).join("; ");
  const crit = c.criteria.map(criterionLabel).join("; ");
  const count = c.minimum !== undefined && c.minimum < c.criteria.length ? `at least ${c.minimum} of ${c.criteria.length}: ` : c.minimumShare !== undefined ? `at least ${c.minimumShare}% of those measurable among ${c.criteria.length}: ` : "";
  return `${req ? `${req}; then ` : ""}${count}${crit}`;
}

// ---------------------------------------------------------------------------
// Tests

export type TestStatus = "pass" | "near" | "fail" | "n/a";
export type TestOutcome = { status: TestStatus; actual: number | null; worst: Point[]; needs: Needs[]; tested: number };

function judge(actual: number | null, t: Test): TestStatus {
  if (actual === null) return "n/a";
  const { is, limit } = t;
  const inside = is === "lte" ? actual <= limit : is === "gte" ? actual >= limit : is === "lt" ? actual < limit : actual > limit;
  if (!inside) return "fail";
  const margin = Math.abs(limit) * 0.1;
  const near = is === "lte" || is === "lt" ? actual >= limit - margin : actual <= limit + margin;
  return near ? "near" : "pass";
}

const RANK: Record<TestStatus, number> = { fail: 0, near: 1, pass: 2, "n/a": 3 };

export function runTest(t: Test, ctx: EvalCtx, inputs: readonly InputId[]): TestOutcome {
  const r = computeExpr(t.expr, t.unit, ctx, inputs, t.each);
  if (r.kind === "scalar") return { status: judge(r.value, t), actual: r.value, worst: [], needs: r.needs, tested: 1 };
  if (!r.points.length) return { status: "n/a", actual: null, worst: [], needs: r.needs, tested: 0 };
  const judged = r.points.map((p) => ({ p, s: judge(p.value, t) })).filter((x) => x.s !== "n/a");
  if (!judged.length) return { status: "n/a", actual: null, worst: [], needs: r.needs, tested: 0 };
  judged.sort((a, b) => RANK[a.s] - RANK[b.s] || (t.is === "lte" || t.is === "lt" ? (b.p.value ?? 0) - (a.p.value ?? 0) : (a.p.value ?? 0) - (b.p.value ?? 0)));
  const status = judged[0].s;
  return { status, actual: judged[0].p.value, worst: judged.filter((x) => x.s === status && status !== "pass").map((x) => x.p), needs: r.needs, tested: judged.length };
}

// ---------------------------------------------------------------------------
// Words and formats

export function formatUnit(value: number | null, unit: Unit, ccy: string): string {
  if (value === null) return "n/a";
  switch (unit) {
    case "money":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(value);
    case "pct":
      return `${value.toFixed(1)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "count":
      return value.toFixed(0);
    case "days":
      return `${value.toFixed(0)} days`;
    case "number":
      return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  }
}

const WINDOW_WORDS: Record<string, string> = { all: "", ttm: " in the last twelve months", prior_ttm: " in the twelve months before", ytd: " this year" };

function filterWords(fl: Filter): string {
  const label = FIELDS[fl.field].label.toLowerCase();
  const v = Array.isArray(fl.value) ? fl.value.join(" or ") : String(fl.value ?? "");
  switch (fl.is) {
    case "eq":
      return `${label} is ${v}`;
    case "ne":
      return `${label} is not ${v}`;
    case "in":
      return `${label} is ${v}`;
    case "not_in":
      return `${label} is not ${v}`;
    case "contains":
      return `${label} includes ${v}`;
    case "is_null":
      return `no ${label}`;
    case "not_null":
      return `has ${label}`;
    default:
      return `${label} ${COMPARATOR_WORDS[fl.is as Comparator] ?? fl.is} ${v}`;
  }
}

export function measureWords(m: MeasureSpec): string {
  const what = m.measure === "count" ? `number of ${m.over === "lookthrough" ? "companies inside funds" : m.over === "markets" ? "market indicators" : m.over}` : `${m.measure === "avg" ? "average" : m.measure === "sum" ? "total" : m.measure} ${FIELDS[m.field!].label.toLowerCase()}`;
  const where = m.where.length ? ` where ${m.where.map(filterWords).join(" and ")}` : "";
  const over = m.measure === "count" ? "" : m.over === "holdings" ? "" : m.over === "transactions" ? " of transactions" : m.over === "markets" ? " of market indicators" : " of companies inside funds";
  const win = m.window ? (m.window.kind === "last_months" ? ` in the last ${m.window.months} months` : WINDOW_WORDS[m.window.kind]) : "";
  const top = m.top ? ` of the ${m.top} largest` : "";
  const size = m.abs ? " (size, sign ignored)" : "";
  return `${what}${size}${top}${over}${where}${win}${m.whole ? " (of everything)" : ""}`;
}

export function exprWords(e: Expr): string {
  switch (e.op) {
    case "measure":
      return measureWords(e.of);
    case "ratio":
      return `${measureWords(e.num)}, as a share of ${measureWords(e.den)}`;
    case "growth":
      return `change in ${measureWords(e.now)} against ${measureWords(e.before)}`;
    case "difference":
      return `${measureWords(e.a)} less ${measureWords(e.b)}`;
    case "scaled":
      return `${measureWords(e.of)} times ${e.by}`;
    case "series": {
      const what = e.of === "nav" ? "the account's value" : e.of;
      const words: Record<SeriesStat, string> = {
        return: `return of ${what}`,
        max_drawdown: `worst fall of ${what}`,
        high_water_gap: `${what} below its high`,
        volatility: `volatility of ${what}`,
        beta: `beta of ${what} against ${e.vs}`,
        sortino: `Sortino ratio of ${what}`,
        growth_of_100: `growth of 100 in ${what}`,
        drawdown: `drawdown of ${what}`,
      };
      return `${words[e.stat]} over ${PERIOD_WORDS[e.period]}`;
    }
  }
}

export function testWords(t: Test, ccy: string): string {
  const each = t.each ? `for each ${t.each.replace("_", " ")}, ` : "";
  return `${each}${exprWords(t.expr)} ${COMPARATOR_WORDS[t.is]} ${formatUnit(t.limit, t.unit, ccy)}`;
}

export function needsWords(needs: Needs[], inputLabel: (id: InputId) => string): string {
  const parts = needs.map((n) => (n.inputs ? `${n.label.toLowerCase()} (from ${n.inputs.map(inputLabel).join(" or ")})` : `${n.label.toLowerCase()}, which no connection supplies yet`));
  return `Needs ${parts.join("; ")}.`;
}
