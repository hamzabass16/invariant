/**
 * The Classification Test laid out as a register: one row per holding, one
 * column per criterion the methodology's classes read, each cell the
 * holding's own reading and whether it passes. It says why each holding has
 * the class it has: the count against what the class needs, and for every
 * class ahead of it in the methodology's order, what kept the holding out.
 *
 * Nothing here is filed or kept. Every cell is `classTest` (lib/recipes.ts)
 * on the holding's figures today, so the register changes when the figures
 * or the methodology change, and a class is never set by hand. Pure.
 */
import { FIELDS, type EvalCtx, type FieldValue } from "@/lib/ontology";
import { classTest, criterionLabel, filterLabel, passWords, type ClassDef, type Criterion, type CriterionRead } from "@/lib/recipes";
import type { Holding } from "@/lib/holdings";

export type RegisterColumn = {
  key: string;
  /** Short heading: the criterion's own filter ("ROIC at least 20"). */
  label: string;
  /** The whole test, alternatives and conditions included. */
  test: string;
  /** The classes that read this criterion, by label, and those for which it is a required filter (a gate) rather than counted. */
  classes: string[];
  requiredIn: string[];
};

export type CellStatus = "pass" | "fail" | "unread" | "not_measured";
export type RegisterCell = { status: CellStatus; value: string | null; note: string | null };

export type RegisterRow = {
  symbol: string;
  name: string;
  weight: number;
  classId: string | null;
  classLabel: string | null;
  /** The placing class's count in words ("5 of 7 hold (5 needed)"), or the nearest class's when none places it. */
  count: string;
  passes: number;
  measurable: number;
  needed: number;
  cells: Record<string, RegisterCell>;
  /** One line per class ahead of the placing one (every class when none places it): why it does not hold. */
  why: string[];
};

/** `left` counts the holdings no criterion could read, which the register leaves out (options, cash, a holding with no filings yet). */
export type Register = { columns: RegisterColumn[]; rows: RegisterRow[]; left: string[] };

const colKey = (cr: Criterion) => criterionLabel(cr);

/** A reading in the field's own unit; text as it is. */
export function readingText(field: CriterionRead["field"], value: FieldValue): string | null {
  if (value === null) return null;
  if (typeof value !== "number") return Array.isArray(value) ? value.join(", ") : String(value);
  const type = FIELDS[field]?.type;
  if (type === "pct") return `${value.toFixed(1)}%`;
  if (type === "ratio") return `${value.toFixed(2)}x`;
  if (type === "money") return Math.abs(value) >= 1e9 ? `${(value / 1e9).toFixed(1)}bn` : Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(0)}m` : value.toFixed(0);
  if (type === "days") return `${value.toFixed(0)} days`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function cellOf(x: CriterionRead): RegisterCell {
  const status: CellStatus = x.pass ? "pass" : x.read ? "fail" : x.note?.startsWith("not measured") ? "not_measured" : "unread";
  return { status, value: x.read ? readingText(x.field, x.value) : null, note: x.note };
}

/** Why a class does not hold for a holding, in one line. */
function whyNot(c: ClassDef, t: ReturnType<typeof classTest>): string {
  const req = t.required.find((x) => !x.pass);
  if (req) return `${c.label}: required ${criterionLabel(req.filter)} ${req.read ? `does not hold (${readingText(req.field, req.value)})` : "has no reading"}`;
  const measurable = t.criteria.length - t.unread;
  if (!measurable) return `${c.label}: no criterion could be read`;
  return `${c.label}: ${passWords(t)}, short of ${t.needed}`;
}

/**
 * The register for the methodology's classes over the given holdings (one
 * per symbol, the largest lot), in the order given. The columns are every
 * criterion any class reads, each once, gates (required filters) first, in
 * the classes' order. A cell is the criterion read against the holding: the
 * same figure and the same test whichever class reads it. A holding no
 * criterion can read and no class places is left out and named in `left`.
 */
export function classRegister(classes: readonly ClassDef[], holdings: readonly { symbol: string; name: string; weight: number; holding: Holding }[], ctx: EvalCtx): Register {
  const columns: RegisterColumn[] = [];
  for (const c of classes) {
    for (const [list, required] of [[c.required ?? [], true], [c.criteria, false]] as const) {
      for (const cr of list) {
        const key = colKey(cr);
        let col = columns.find((x) => x.key === key);
        if (!col) columns.push((col = { key, label: filterLabel(cr), test: criterionLabel(cr), classes: [], requiredIn: [] }));
        if (!col.classes.includes(c.label)) col.classes.push(c.label);
        if (required && !col.requiredIn.includes(c.label)) col.requiredIn.push(c.label);
      }
    }
  }
  // Gates first, in the classes' order, then the counted criteria.
  columns.sort((a, b) => Number(b.requiredIn.length > 0) - Number(a.requiredIn.length > 0));
  const all = holdings.map(({ symbol, name, weight, holding }) => {
    const tests = classes.map((c) => ({ c, t: classTest(c, holding, ctx) }));
    const at = tests.findIndex((x) => x.t.holds);
    const placed = at >= 0 ? tests[at] : null;
    // With no class placing it, the count shown is the class it came nearest to: the most passes against what it needs.
    const shown = placed ?? [...tests].sort((a, b) => b.t.passes - b.t.needed - (a.t.passes - a.t.needed))[0] ?? null;
    const cells: Record<string, RegisterCell> = {};
    for (const col of columns) {
      // The same criterion reads the same figure in every class; the placing class's reading is preferred for its note.
      for (const x of [placed, ...tests]) {
        const read = x ? [...x.t.required, ...x.t.criteria].find((r) => colKey(r.filter) === col.key) : undefined;
        if (read) {
          cells[col.key] = cellOf(read);
          break;
        }
      }
    }
    const ahead = placed ? tests.slice(0, at) : tests;
    return {
      symbol,
      name,
      weight,
      classId: placed?.c.id ?? null,
      classLabel: placed?.c.label ?? null,
      count: shown ? `${placed ? "" : `nearest, ${shown.c.label}: `}${passWords(shown.t)}` : "no class to test",
      passes: shown?.t.passes ?? 0,
      measurable: shown ? shown.t.criteria.length - shown.t.unread : 0,
      needed: shown?.t.needed ?? 0,
      cells,
      why: ahead.map(({ c, t }) => whyNot(c, t)),
    };
  });
  // A holding is in the register when a class places it or a criterion reads it; the rest are named in one line.
  const rows = all.filter((r) => r.classId !== null || Object.values(r.cells).some((c) => c.status === "pass" || c.status === "fail"));
  return { columns, rows, left: all.filter((r) => !rows.includes(r)).map((r) => r.symbol) };
}
