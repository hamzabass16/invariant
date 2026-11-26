/**
 * Stage 2 of setup: a person's methodology, as the app reads it. It is the
 * context graph laid over the ontology (lib/ontology.ts): a set of recipes
 * (lib/recipes.ts) that are data, never code, and that the app computes the
 * same way on every open.
 *
 *   - figures: what to measure, in the ontology's vocabulary, and how to show it;
 *   - classes: how the methodology sorts holdings, by criteria on their fields;
 *   - rules: each rule of the document, with the section it sits in and, when
 *     the app can test it, the figure it tests and the limit;
 *   - dashboard: what leads, which sections follow, each a group of figures or
 *     one of the app's built-in panels.
 *
 * Every element points at what it depends on, so a finding can be traced from
 * its rule to its figure, to the fields it reads, to the input that supplies
 * them (graph()). A methodology is drafted from a document or suggested from
 * the profile and the book (lib/methodology-draft.ts), shown, and takes effect
 * only once the person confirms it. A rule the app cannot test is kept as
 * "yours to check", never dropped and never shown as passing. Pure.
 */
import { z } from "zod";

import type { Book } from "@/lib/holdings";
import { COMPARATORS, DIMENSION_FIELD, FIELDS, FUNDAMENTAL_FIELDS, PANEL_IDS, PANELS, PRACTICES, evalCtx, fieldAvailable, inputsFor, type EvalCtx, type FieldId, type PanelId } from "@/lib/ontology";
import { classFilters, classifier, classNeeds, classSchema, computeExpr, figureSchema, formatUnit, needsWords, runTest, testWords, type ClassDef, type Figure, type MeasureSpec, type Needs, type Point, type Result, type TestOutcome } from "@/lib/recipes";
import { INPUTS, type InputId, type Module, type ProfileId } from "@/lib/setup";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(40);

export const ruleSchema = z.object({
  id: id.describe("Short stable id, e.g. position-cap."),
  section: z.string().min(1).max(20).describe("Where the rule sits in the owner's document, e.g. 3.1 or D.1(c)."),
  text: z.string().min(1).max(300).describe("The rule in the document's own words, shortened if needed."),
  severity: z.enum(["breach", "guideline", "watch"]).describe("breach when the document makes it a hard limit; guideline when it is a preference; watch when it is a level the owner wants to be told about (an alert), not a rule broken."),
  test: z
    .object({
      figure: id.describe("The figure this rule tests. A grouped figure is tested for every group; a tile for the whole."),
      is: z.enum(COMPARATORS),
      limit: z.number().describe("In the figure's unit: 10 for 10% when the unit is pct."),
    })
    .nullable()
    .describe("Null when the app cannot measure the rule: it is then the owner's to check."),
});
export type Rule = z.infer<typeof ruleSchema>;

export const sectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("figures"),
    label: z.string().min(1).max(60),
    figures: z.array(id).min(1).max(8).describe("Figure ids shown together, in order."),
    from: z.string().max(20).optional().describe("The document section that asks for them, when one does."),
  }),
  z.object({
    kind: z.literal("panel"),
    id: z.enum(PANEL_IDS),
    view: z.enum(["chart", "table"]),
    from: z.string().max(20).optional(),
  }),
]);
export type Section = z.infer<typeof sectionSchema>;

export const dashboardSchema = z.object({
  headline: z.array(id).min(1).max(6).describe("Figure ids for the tiles at the top, most important first. Tiles only."),
  sections: z.array(sectionSchema).min(1).max(12).describe("In the order the methodology cares about them."),
  themes: z.array(z.string().min(1).max(40)).max(8).describe("Themes the methodology tracks by name, e.g. AI."),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const gapSchema = z.object({
  section: z.string().min(1).max(40).describe("The document section that asks for it."),
  asks: z.string().min(1).max(300).describe("What the document asks for, in its own words, shortened: a figure, a rule, a view."),
  missing: z.string().min(1).max(300).describe("What the ontology would need to express it: a field, an object, a measure, a window, a grouping. Never a figure of the owner's portfolio."),
});
export type Gap = z.infer<typeof gapSchema>;

/**
 * How the methodology is to be judged (Hamza, 23 Oct 2026): the proofs the
 * document itself gives that it works, each one of the kinds the app can
 * test on the book (lib/methodology-evaluation.ts computes them; the verdict
 * is always the app's).
 */
export const EVAL_TESTS = ["beats_benchmark", "smaller_drawdown", "class_beats_benchmark", "class_ahead_of_rest", "earnings_track_price"] as const;
export type EvalTestKind = (typeof EVAL_TESTS)[number];
export const EVAL_TEST_ABOUT: Record<EvalTestKind, string> = {
  beats_benchmark: "The book's time-weighted return beats the benchmark over the period, with Jensen's alpha.",
  smaller_drawdown: "The book's worst fall over the period is shallower than the benchmark's.",
  class_beats_benchmark: "The holdings of one class beat the benchmark from when each was bought (or the period's start).",
  class_ahead_of_rest: "The holdings of one class do better against the benchmark than the other holdings.",
  earnings_track_price: "Each holding's price grows in line with its earnings per share over a span of years (the filings' trailing EPS).",
};
export const evalTestSchema = z.object({
  kind: z.enum(EVAL_TESTS).describe(`One of: ${EVAL_TESTS.map((k) => `${k} (${EVAL_TEST_ABOUT[k]})`).join("; ")}.`),
  class: id.nullable().optional().describe("class_beats_benchmark and class_ahead_of_rest: the class id. earnings_track_price: a class id to read only that class, else null."),
  years: z.number().int().min(1).max(10).nullable().optional().describe("earnings_track_price: the span in years the document names (5 when it names none). Otherwise null."),
  section: z.string().max(40).nullable().optional().describe("The document section that states this proof; null when none does."),
  claim: z.string().min(1).max(300).describe("What should hold if the methodology works, in the document's own words shortened."),
});
export type EvalTest = z.infer<typeof evalTestSchema>;
export const evaluationSchema = z.object({ tests: z.array(evalTestSchema).max(8) });


const body = {
  name: z.string().min(1).max(80),
  adopted: isoDate.nullable(),
  summary: z.string().max(600).describe("Two or three sentences on how the owner invests, in plain words."),
  figures: z.array(figureSchema).min(1).max(40),
  classes: z.array(classSchema).max(8),
  rules: z.array(ruleSchema).max(40),
  dashboard: dashboardSchema,
  gaps: z.array(gapSchema).max(12).default([]).describe("What the document asks for that the ontology cannot say yet, so the app can grow for everyone. Empty when everything landed."),
  practices: z
    .array(z.enum(PRACTICES))
    .max(PRACTICES.length)
    .optional()
    .describe("The practices the document names, each of which keeps a screen: decision_log when it asks for a written record or a vote behind trades or decisions; trade_log when it reviews the trades themselves (a journal, win rate, holding periods); trade_check when it asks for a check before a trade (where new money may go, what a purchase must meet first); todo_list when it sets duties per holding with a date or a clock (a vote, a record, a review within so many days). Empty when it names none; those screens then stay off unless the owner adds them."),
  evaluation: evaluationSchema
    .optional()
    .describe("How the document says its own success should be proved (a return against an index, a class that should lead, earnings that price should follow over five years), as tests of the kinds listed. Only what the document states; omit when it states none, and the app then proposes how to judge it."),
};

/** The whole graph must hold together: ids unique, every reference to a figure or class resolved. */
function refine(m: { figures: Figure[]; classes: ClassDef[]; rules: Rule[]; dashboard: Dashboard; evaluation?: { tests: EvalTest[] } }, ctx: z.RefinementCtx) {
  const dup = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const x of ids) {
      if (seen.has(x)) ctx.addIssue({ code: "custom", message: `Two ${what} share the id ${x}.` });
      seen.add(x);
    }
  };
  dup(m.figures.map((f) => f.id), "figures");
  dup(m.classes.map((c) => c.id), "classes");
  dup(m.rules.map((r) => r.id), "rules");
  const figs = new Map(m.figures.map((f) => [f.id, f]));
  for (const r of m.rules) if (r.test && !figs.has(r.test.figure)) ctx.addIssue({ code: "custom", message: `Rule ${r.id} tests a figure that does not exist: ${r.test.figure}.` });
  for (const h of m.dashboard.headline) {
    const f = figs.get(h);
    if (!f) ctx.addIssue({ code: "custom", message: `Headline names a figure that does not exist: ${h}.` });
    else if (f.view !== "tile") ctx.addIssue({ code: "custom", message: `Headline figure ${h} must be a tile.` });
  }
  for (const s of m.dashboard.sections) if (s.kind === "figures") for (const f of s.figures) if (!figs.has(f)) ctx.addIssue({ code: "custom", message: `A section names a figure that does not exist: ${f}.` });
  for (const f of m.figures) {
    if ((f.view === "tile") === !!f.by) ctx.addIssue({ code: "custom", message: `Figure ${f.id}: a tile has no grouping; a chart or table needs one.` });
  }
  const classIds = new Set(m.classes.map((c) => c.id));
  for (const t of m.evaluation?.tests ?? []) {
    if (t.class && !classIds.has(t.class)) ctx.addIssue({ code: "custom", message: `An evaluation test names a class that does not exist: ${t.class}.` });
    if ((t.kind === "class_beats_benchmark" || t.kind === "class_ahead_of_rest") && !t.class) ctx.addIssue({ code: "custom", message: `The evaluation test ${t.kind} needs a class.` });
  }
  const usesClass = (ms: MeasureSpec) => ms.where.filter((w) => w.field === "class");
  for (const f of m.figures) for (const t of termsOf(f)) for (const w of usesClass(t)) {
    const want = Array.isArray(w.value) ? w.value : [String(w.value ?? "")];
    if (["eq", "ne", "in", "not_in"].includes(w.is)) for (const v of want) if (!classIds.has(v)) ctx.addIssue({ code: "custom", message: `Figure ${f.id} filters on a class that does not exist: ${v}.` });
  }
}

/** What the drafter fills in; the app adds the source. */
export const draftSchema = z.object(body).superRefine(refine);

export const methodologySchema = z
  .object({
    ...body,
    /** The attached document. A Drive file id when stored there; null for the demo or a suggestion. */
    source: z.object({ title: z.string().max(120), fileId: z.string().nullable() }),
    /** Where it came from: read from a document, suggested from the profile and book, adopted from the library of ready-made methodologies, or the demo's sample. */
    origin: z.enum(["document", "suggested", "library", "sample"]).default("document"),
    /** The methodology it was forked from (Hamza, 9 Nov 2026, the moat's "forks with lineage"): its name and its author's credit, kept through every change the person makes; null for one of their own. */
    lineage: z.object({ parent: z.string().min(1).max(120), credit: z.string().max(120).nullable(), source: z.enum(["library", "market"]) }).nullable().default(null),
  })
  .superRefine(refine);
export type Methodology = z.infer<typeof methodologySchema>;

/** The measures a figure's expression is made of; none for a series statistic. */
export function termsOf(f: Figure): MeasureSpec[] {
  const e = f.expr;
  if (e.op === "series") return [];
  return e.op === "measure" || e.op === "scaled" ? [e.of] : e.op === "ratio" ? [e.num, e.den] : e.op === "growth" ? [e.now, e.before] : [e.a, e.b];
}

/** The fields a figure reads, including its grouping. */
export function fieldsRead(f: Figure): FieldId[] {
  const out = new Set<FieldId>();
  if (f.expr.op === "series") {
    out.add(f.expr.of === "nav" ? "nav_series" : "benchmark_series");
    if (f.expr.vs) out.add(f.expr.vs === "nav" ? "nav_series" : "benchmark_series");
    return [...out];
  }
  for (const t of termsOf(f)) {
    if (t.field) out.add(t.field);
    for (const w of t.where) out.add(w.field);
    const df = f.by && !t.whole ? DIMENSION_FIELD[f.by][t.over] : undefined;
    if (df) out.add(df);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Removing elements (the builder): references follow

/**
 * Drops figures, classes and rules by id and repairs what pointed at them: a
 * rule whose figure is gone becomes the owner's to check, a section loses the
 * figure, an empty section goes, a class filter on a removed class goes.
 * The result always validates.
 */
export function without(m: Methodology, drop: readonly string[]): Methodology {
  const gone = new Set(drop);
  const figures = m.figures.filter((f) => !gone.has(f.id));
  const figIds = new Set(figures.map((f) => f.id));
  const classes = m.classes.filter((c) => !gone.has(c.id));
  const classIds = new Set(classes.map((c) => c.id));
  const keepFilter = (w: MeasureSpec["where"][number]) => w.field !== "class" || !["eq", "ne", "in", "not_in"].includes(w.is) || (Array.isArray(w.value) ? w.value.every((v) => classIds.has(v)) : classIds.has(String(w.value)));
  const fixTerm = (t: MeasureSpec): MeasureSpec => ({ ...t, where: t.where.filter(keepFilter) });
  const fixed = figures.map((f): Figure => {
    const e = f.expr;
    const expr: Figure["expr"] =
      e.op === "series" ? e : e.op === "measure" ? { ...e, of: fixTerm(e.of) } : e.op === "scaled" ? { ...e, of: fixTerm(e.of) } : e.op === "ratio" ? { ...e, num: fixTerm(e.num), den: fixTerm(e.den) } : e.op === "growth" ? { ...e, now: fixTerm(e.now), before: fixTerm(e.before) } : { ...e, a: fixTerm(e.a), b: fixTerm(e.b) };
    return { ...f, expr };
  });
  const rules = m.rules.filter((r) => !gone.has(r.id)).map((r) => (r.test && !figIds.has(r.test.figure) ? { ...r, test: null } : r));
  const sections = m.dashboard.sections
    .map((s) => (s.kind === "figures" ? { ...s, figures: s.figures.filter((f) => figIds.has(f)) } : s))
    .filter((s) => s.kind !== "figures" || s.figures.length > 0);
  let headline = m.dashboard.headline.filter((f) => figIds.has(f));
  if (!headline.length) headline = fixed.filter((f) => f.view === "tile").slice(0, 1).map((f) => f.id);
  if (!fixed.length || !headline.length) throw new Error("A methodology needs at least one figure to lead with.");
  const evaluation = m.evaluation ? { tests: m.evaluation.tests.filter((t) => !t.class || classIds.has(t.class)) } : undefined;
  return methodologySchema.parse({ ...m, figures: fixed, classes, rules, ...(evaluation ? { evaluation } : {}), dashboard: { ...m.dashboard, headline, sections: sections.length ? sections : [{ kind: "panel", id: "allocation", view: "chart" }] } });
}

// ---------------------------------------------------------------------------
// Stage 1: the starter, built from the profile and inputs alone

const sum = (field: FieldId, where: MeasureSpec["where"] = [], extra: Partial<MeasureSpec> = {}): MeasureSpec => ({ measure: "sum", over: "holdings", field, where, ...extra });
const tile = (fid: string, label: string, about: string, unit: Figure["unit"], expr: Figure["expr"]): Figure => ({ id: fid, label, about, unit, expr, view: "tile" });

/** Figures any book can show, named here once so the starter dashboard and the drafter's examples agree. */
export const STARTER_FIGURES: Record<string, Figure & { needs?: Module }> = {
  "net-worth": tile("net-worth", "Net worth", "Everything at the owner's share, real estate net of its mortgage.", "money", { op: "measure", of: sum("owner_value") }),
  "liquid-share": tile("liquid-share", "Liquid", "Share of net worth outside private funds and real estate.", "pct", { op: "ratio", num: sum("owner_value", [{ field: "liquid", is: "eq", value: true }]), den: sum("owner_value") }),
  "cash-share": tile("cash-share", "Cash and deposits", "Share of net worth in cash and bank deposits.", "pct", { op: "ratio", num: sum("owner_value", [{ field: "asset_class", is: "in", value: ["cash", "deposit"] }]), den: sum("owner_value") }),
  "largest-holding": tile("largest-holding", "Largest holding", "The biggest single holding outside cash and options, as a share of net worth.", "pct", {
    op: "ratio",
    num: { measure: "max", over: "holdings", field: "owner_value", where: [{ field: "asset_class", is: "not_in", value: ["cash", "deposit", "option"] }] },
    den: sum("owner_value"),
  }),
  "options-delta": { ...tile("options-delta", "Options delta value", "Share-equivalent exposure of every open contract, in money.", "money", { op: "measure", of: sum("option_delta_value") }), needs: "options" },
  "premium-month": {
    ...tile("premium-month", "Premium, last month", "Option premium collected on contracts sold to open in the last month.", "money", {
      op: "measure",
      of: { measure: "sum", over: "transactions", field: "amount", where: [{ field: "kind", is: "eq", value: "option_open" }, { field: "amount", is: "gt", value: 0 }], window: { kind: "last_months", months: 1 } },
    }),
    needs: "options",
  },
  "unfunded": { ...tile("unfunded", "Unfunded commitments", "Capital the private funds can still call.", "money", { op: "measure", of: sum("fund_unfunded") }), needs: "funds" },
  "call-cover": {
    ...tile("call-cover", "Calls covered by cash", "Cash and deposits against capital still to be called.", "ratio", { op: "ratio", num: sum("owner_value", [{ field: "asset_class", is: "in", value: ["cash", "deposit"] }]), den: sum("fund_unfunded") }),
    needs: "funds",
  },
  "stated-yield": { ...tile("stated-yield", "Average stated yield", "The yield bonds state on their statements, averaged.", "pct", { op: "measure", of: { measure: "avg", over: "holdings", field: "bond_yield_pct", where: [] } }), needs: "fixed_income" },
  "property-equity": { ...tile("property-equity", "Property equity", "Real estate at the owner's share, net of mortgages.", "money", { op: "measure", of: sum("owner_value", [{ field: "asset_class", is: "eq", value: "real_estate" }]) }), needs: "properties" },
  "oldest-valuation": tile("oldest-valuation", "Oldest valuation", "Days since the stalest figure behind net worth was set.", "days", { op: "measure", of: { measure: "max", over: "holdings", field: "age_days", where: [] } }),
};

const HEADLINE: Record<ProfileId, string[]> = {
  individual: ["net-worth", "largest-holding", "options-delta", "premium-month", "cash-share", "oldest-valuation"],
  family_office: ["net-worth", "liquid-share", "call-cover", "stated-yield", "property-equity", "oldest-valuation"],
};
const PANEL_ORDER: Record<ProfileId, PanelId[]> = {
  individual: ["allocation", "options", "themes", "overlap", "income", "funds", "properties", "freshness"],
  family_office: ["allocation", "themes", "overlap", "funds", "income", "properties", "options", "freshness"],
};

/** Stage 1: the dashboard from the profile and the screens their inputs switched on, as recipes like any other. */
export function starter(profile: ProfileId, modules: Module[]): { figures: Figure[]; dashboard: Dashboard } {
  const picks = HEADLINE[profile].map((k) => STARTER_FIGURES[k]).filter((f) => !f.needs || modules.includes(f.needs)).slice(0, 4);
  return {
    figures: picks.map((f) => {
      const { needs, ...rest } = f;
      void needs;
      return rest;
    }),
    dashboard: { headline: picks.map((f) => f.id), sections: PANEL_ORDER[profile].filter((p) => modules.includes(PANELS[p].module)).map((p) => ({ kind: "panel" as const, id: p, view: "chart" as const })), themes: [] },
  };
}

/**
 * What the Overview renders: the figures and sections, from the methodology
 * when there is one, and the panels it asks for that the inputs cannot fill
 * yet (shown as "needs an input", not hidden).
 */
export function dashboardFor(profile: ProfileId, modules: Module[], methodology: Methodology | null) {
  if (!methodology) {
    const s = starter(profile, modules);
    return { figures: s.figures, dashboard: s.dashboard, missing: [] as PanelId[], fromMethodology: false };
  }
  const d = methodology.dashboard;
  const missing = d.sections.filter((s) => s.kind === "panel" && !modules.includes(PANELS[s.id].module)).map((s) => (s as { id: PanelId }).id);
  return { figures: methodology.figures, dashboard: { ...d, sections: d.sections.filter((s) => s.kind !== "panel" || !missing.includes(s.id)) }, missing, fromMethodology: true };
}

// ---------------------------------------------------------------------------
// Computing

/** The evaluation context for a book under a methodology: its classes applied to every holding by their tests alone. */
export function contextFor(book: Book, today: string, m: Methodology | null): EvalCtx {
  const base = evalCtx(book, today);
  return m && m.classes.length ? evalCtx(book, today, classifier(m.classes, base)) : base;
}

export function computeFigure(f: Figure, ctx: EvalCtx, inputs: readonly InputId[]): Result {
  return computeExpr(f.expr, f.unit, ctx, inputs, f.by);
}

export const inputLabel = (i: InputId) => INPUTS[i].label;

export type FindingStatus = "pass" | "near" | "fail" | "manual" | "n/a";
/** A holding (or group) on the wrong side of a grouped rule: its key, label, the symbol when the group is a holding, and the reading formatted. */
export type Offender = { key: string; label: string; symbol: string | null; value: string };
export type Finding = { rule: Rule; figure: Figure | null; status: FindingStatus; actual: string | null; limit: string | null; detail: string; needs: Needs[]; offenders: Offender[] };

export function evaluate(m: Methodology, book: Book, today: string, inputs: readonly InputId[]): Finding[] {
  const ctx = contextFor(book, today, m);
  const ccy = book.fx.base;
  const figs = new Map(m.figures.map((f) => [f.id, f]));
  return m.rules.map((rule) => {
    if (!rule.test) return { rule, figure: null, status: "manual" as const, actual: null, limit: null, detail: "", needs: [], offenders: [] };
    const figure = figs.get(rule.test.figure)!;
    const out: TestOutcome = runTest({ expr: figure.expr, unit: figure.unit, is: rule.test.is, limit: rule.test.limit, each: figure.by }, ctx, inputs);
    const limit = formatUnit(rule.test.limit, figure.unit, ccy);
    if (out.needs.length) return { rule, figure, status: "n/a" as const, actual: null, limit, detail: needsWords(out.needs, inputLabel), needs: out.needs, offenders: [] };
    if (out.status === "n/a") {
      // A market figure with no reading is waiting on the feed, not on the person.
      const overMarkets = termsOf(figure).some((t) => t.over === "markets");
      return { rule, figure, status: "n/a" as const, actual: null, limit, detail: overMarkets ? "Needs a reading from the market feed; none has arrived for this indicator." : figure.by ? "Nothing to test yet." : "No figure yet.", needs: [], offenders: [] };
    }
    const detail = out.worst.length ? out.worst.slice(0, 3).map((p) => `${p.label} ${formatUnit(p.value, figure.unit, ccy)}`).join(", ") + (out.worst.length > 3 ? ` and ${out.worst.length - 3} more` : "") : figure.by ? `${out.tested} tested` : "";
    const symbolOf = (p: Point): string | null => (figure.by === "symbol" ? p.key : figure.by === "holding" ? (book.holdings.find((h) => h.id === p.key)?.symbol ?? null) : null);
    const offenders: Offender[] = out.worst.map((p) => ({ key: p.key, label: p.label, symbol: symbolOf(p), value: formatUnit(p.value, figure.unit, ccy) }));
    return { rule, figure, status: out.status, actual: formatUnit(out.actual, figure.unit, ccy), limit, detail, needs: [], offenders };
  });
}

/** Counts for the dashboard header: how many rules fail, are near, need the owner, and how many watches have tripped. */
export function findingCounts(findings: Finding[]) {
  return {
    breaches: findings.filter((f) => f.status === "fail" && f.rule.severity === "breach").length,
    outside: findings.filter((f) => f.status === "fail" && f.rule.severity === "guideline").length,
    tripped: findings.filter((f) => f.status === "fail" && f.rule.severity === "watch").length,
    near: findings.filter((f) => f.status === "near").length,
    manual: findings.filter((f) => f.status === "manual").length,
    pass: findings.filter((f) => f.status === "pass").length,
    waiting: findings.filter((f) => f.status === "n/a").length,
  };
}

/** How the app tests a rule, in a few words: shown under the owner's own wording. */
export function testedAs(rule: Rule, m: Pick<Methodology, "figures">, ccy: string): string {
  if (!rule.test) return "Checked by you";
  const f = m.figures.find((x) => x.id === rule.test!.figure);
  if (!f) return "Checked by you";
  const t = testWords({ expr: f.expr, unit: f.unit, is: rule.test.is, limit: rule.test.limit, each: f.by }, ccy);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The fields a class needs that the inputs cannot supply, in words; empty
 * when it can be applied. The company figures (ROIC, margins, growth, the
 * engine...) come from the SEC filings read on Setup, not from a connection:
 * once the filings have given any holding a figure, a field one holding lacks
 * is that holding's unread criterion, never the class's wait; before they
 * have, they are one line naming the filings, never one line a field.
 */
export function classWaiting(c: ClassDef, inputs: readonly InputId[], supplied: ReadonlySet<FieldId> = new Set()): string {
  const fundamental = (id: FieldId) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(id);
  const n = classNeeds(c, inputs).filter((x) => !supplied.has(x.field));
  const filingsRead = [...supplied].some(fundamental);
  const other = n.filter((x) => !fundamental(x.field));
  const parts = [n.some((x) => fundamental(x.field)) && !filingsRead ? "company figures from SEC filings (Company filings on Setup)" : null, ...(other.length ? [needsWords(other, inputLabel).replace(/^Needs /, "").replace(/\.$/, "")] : [])].filter(Boolean);
  return parts.length ? `Needs ${parts.join("; ")}.` : "";
}

// ---------------------------------------------------------------------------
// The graph, explicitly

export type GraphNode = { id: string; kind: "section" | "rule" | "figure" | "class" | "field" | "input" | "panel" | "dashboard"; label: string };
export type GraphEdge = { from: string; to: string; kind: "sits_in" | "tests" | "reads" | "supplied_by" | "shows" | "filters_on" | "asked_by" };

/**
 * The methodology as nodes and edges: document sections, rules, figures,
 * classes, the fields they read and the inputs that supply those fields. The
 * Methodology screen shows each element's edges as its "why"; the whole can be
 * exported as JSON and loaded into any graph tool.
 */
export function graph(m: Methodology): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const node = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return n.id;
  };
  const sectionId = (s: string) => node({ id: `section:${s}`, kind: "section", label: `Section ${s}` });
  const fieldId = (f: FieldId) => {
    const nid = node({ id: `field:${f}`, kind: "field", label: FIELDS[f].label });
    const by = FIELDS[f].suppliedBy;
    if (by === "feed") edges.push({ from: nid, to: node({ id: "input:feed", kind: "input", label: "Market feed" }), kind: "supplied_by" });
    else if (by !== "none") for (const i of by) edges.push({ from: nid, to: node({ id: `input:${i}`, kind: "input", label: INPUTS[i].label }), kind: "supplied_by" });
    return nid;
  };
  for (const f of m.figures) {
    const fid = node({ id: `figure:${f.id}`, kind: "figure", label: f.label });
    for (const field of fieldsRead(f)) edges.push({ from: fid, to: fieldId(field), kind: "reads" });
    for (const t of termsOf(f)) for (const w of t.where) if (w.field === "class") for (const v of Array.isArray(w.value) ? w.value : [String(w.value ?? "")]) if (m.classes.some((c) => c.id === v)) edges.push({ from: fid, to: `class:${v}`, kind: "filters_on" });
    if (f.by === "class") for (const c of m.classes) edges.push({ from: fid, to: `class:${c.id}`, kind: "filters_on" });
  }
  for (const c of m.classes) {
    const cid = node({ id: `class:${c.id}`, kind: "class", label: c.label });
    for (const w of classFilters(c)) edges.push({ from: cid, to: fieldId(w.field), kind: "reads" });
  }
  for (const r of m.rules) {
    const rid = node({ id: `rule:${r.id}`, kind: "rule", label: r.text });
    edges.push({ from: rid, to: sectionId(r.section), kind: "sits_in" });
    if (r.test) edges.push({ from: rid, to: `figure:${r.test.figure}`, kind: "tests" });
  }
  const dash = node({ id: "dashboard", kind: "dashboard", label: "Dashboard" });
  for (const h of m.dashboard.headline) edges.push({ from: dash, to: `figure:${h}`, kind: "shows" });
  for (const s of m.dashboard.sections) {
    if (s.kind === "figures") for (const f of s.figures) edges.push({ from: dash, to: `figure:${f}`, kind: "shows" });
    else edges.push({ from: dash, to: node({ id: `panel:${s.id}`, kind: "panel", label: PANELS[s.id].label }), kind: "shows" });
    if (s.from) edges.push({ from: dash, to: sectionId(s.from), kind: "asked_by" });
  }
  // Every edge must point at a node that exists; the schema guarantees it, this guards the export.
  const known = [...edges].filter((e) => nodes.has(e.from) && nodes.has(e.to));
  return { nodes: [...nodes.values()], edges: known };
}

/** One element's place in the graph, in words: what it reads, what tests it, where it shows. */
/** A figure's place in the graph, piece by piece: the fields it reads, what it waits for, the rules that test it, where it shows. */
export function figureLinks(m: Methodology, figure: Figure, inputs: readonly InputId[]): { reads: string[]; waits: string | null; testedBy: string[]; shownIn: string[] } {
  const fields = fieldsRead(figure);
  const missing = fields.filter((f) => !fieldAvailable(f, inputs));
  const shownIn = m.dashboard.headline.includes(figure.id) ? ["the headline"] : [];
  for (const s of m.dashboard.sections) if (s.kind === "figures" && s.figures.includes(figure.id)) shownIn.push(s.label);
  return {
    reads: fields.map((f) => FIELDS[f].label.toLowerCase()),
    waits: missing.length ? needsWords(missing.map((f) => ({ field: f, label: FIELDS[f].label, inputs: inputsFor(f) })), inputLabel) : null,
    testedBy: m.rules.filter((r) => r.test?.figure === figure.id).map((r) => r.section),
    shownIn,
  };
}

export function why(m: Methodology, figure: Figure, inputs: readonly InputId[]): string[] {
  const l = figureLinks(m, figure, inputs);
  const out: string[] = [];
  if (l.reads.length) out.push(`Reads ${l.reads.join(", ")}.`);
  if (l.waits) out.push(l.waits);
  if (l.testedBy.length) out.push(`Tested by ${l.testedBy.map((sec) => `section ${sec}`).join(", ")}.`);
  out.push(l.shownIn.length ? `Shown in ${l.shownIn.join(", ")}.` : "Computed for its rules; not on the dashboard.");
  return out;
}
