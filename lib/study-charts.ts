/**
 * The geometry of a study's charts, pure, so the PDF (react-pdf's Svg) and
 * any screen draw the same picture from the same numbers: grouped bars for
 * the money rows by year, lines for the margins. Nothing is estimated; a
 * missing value leaves a gap. Colours are the stock template's navy and two
 * tints of it, never the status colours.
 */
import type { StudyTable } from "@/lib/edgar-facts";

export const CHART_COLOURS = ["#1d325c", "#4f6d9a", "#9fb3d1"] as const;

export type Bar = { x: number; y: number; w: number; h: number; colour: string; series: string; col: string; value: number };
export type LinePath = { points: { x: number; y: number; value: number; col: string }[]; colour: string; series: string };
export type Tick = { y: number; label: string };
export type Chart = { kind: "bars" | "lines"; title: string; width: number; height: number; plot: { x: number; y: number; w: number; h: number }; bars: Bar[]; lines: LinePath[]; ticks: Tick[]; cols: { x: number; label: string }[]; legend: { colour: string; label: string }[]; zeroY: number | null; note: string | null };

const pickRows = (table: StudyTable, keys: string[]) => keys.map((k) => table.rows.find((r) => r.key === k)).filter((r): r is StudyTable["rows"][number] => !!r && r.values.some((v) => v !== null));

/** Round axis bounds: zero included, the top (or bottom) at a tidy step. */
function bounds(values: number[]): { lo: number; hi: number; step: number } {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(max - min, 1e-9);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step || step, step };
}

const fmtMoney = (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(Math.abs(v) >= 1e10 ? 0 : 1)}bn` : Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6).toLocaleString("en-US")}m` : v.toFixed(0));

function frame(kind: Chart["kind"], title: string, table: StudyTable, rows: StudyTable["rows"], width: number, height: number, unit: "money" | "pct"): Chart {
  const plot = { x: 56, y: 28, w: width - 56 - 12, h: height - 28 - 44 };
  const values = rows.flatMap((r) => r.values.filter((v): v is number => v !== null));
  const b = bounds(values);
  const yOf = (v: number) => plot.y + plot.h - ((v - b.lo) / (b.hi - b.lo)) * plot.h;
  const ticks: Tick[] = [];
  for (let v = b.lo; v <= b.hi + 1e-9; v += b.step) ticks.push({ y: yOf(v), label: unit === "pct" ? `${Math.round(v)}%` : fmtMoney(v) });
  const n = table.cols.length;
  const slot = plot.w / n;
  const cols = table.cols.map((label, i) => ({ x: plot.x + slot * (i + 0.5), label }));
  const legend = rows.map((r, i) => ({ colour: CHART_COLOURS[i % CHART_COLOURS.length], label: r.label }));
  const bars: Bar[] = [];
  const lines: LinePath[] = [];
  if (kind === "bars") {
    const bw = (slot * 0.7) / rows.length;
    rows.forEach((r, ri) => {
      r.values.forEach((v, ci) => {
        if (v === null) return;
        const x = plot.x + slot * ci + slot * 0.15 + bw * ri;
        const y0 = yOf(0);
        const y1 = yOf(v);
        bars.push({ x, y: Math.min(y0, y1), w: bw, h: Math.abs(y1 - y0), colour: CHART_COLOURS[ri % CHART_COLOURS.length], series: r.label, col: table.cols[ci], value: v });
      });
    });
  } else {
    rows.forEach((r, ri) => {
      lines.push({ series: r.label, colour: CHART_COLOURS[ri % CHART_COLOURS.length], points: r.values.flatMap((v, ci) => (v === null ? [] : [{ x: cols[ci].x, y: yOf(v), value: v, col: table.cols[ci] }])) });
    });
  }
  return { kind, title, width, height, plot, bars, lines, ticks, cols, legend, zeroY: b.lo < 0 ? yOf(0) : null, note: null };
}

/** The study's charts: the money rows as grouped bars, the margins as lines; none when the table lacks the rows. */
export function studyCharts(table: StudyTable | null, currency: string | null, width = 515, height = 220): Chart[] {
  if (!table) return [];
  const out: Chart[] = [];
  const money = pickRows(table, ["revenue", "operatingIncome", "fcf"]);
  if (money.length) out.push(frame("bars", `Revenue, operating income and free cash flow, millions${currency ? ` of ${currency}` : ""}`, table, money, width, height, "money"));
  const margins = pickRows(table, ["grossMarginPct", "operatingMarginPct", "fcfMarginPct"]);
  if (margins.length) out.push(frame("lines", "Margins, percent of revenue", table, margins, width, height, "pct"));
  return out;
}
