import type { Block, Unit } from "@/lib/report-doc";

/**
 * The charts of a `ReportDoc` as geometry, once, for both faces: the web page
 * (`lib/report-html.ts`) and the PDF (`components/reports/report-doc-pdf.tsx`)
 * draw these rectangles, paths and labels, so a chart reads the same in
 * both. Colours are the deck's palette, validated with the dataviz palette
 * checker on the dark surface (all six slots pass the band, chroma, CVD and
 * normal-vision floors), in fixed order and never cycled past six: a seventh
 * series is folded into Other by the builder. Pure.
 */

export const DOC_COLOURS = {
  bg: "#0b0d12",
  surface: "#12151c",
  surface2: "#1a1e27",
  hairline: "#262b36",
  hairlineStrong: "#343a48",
  text: "#f4f1ea",
  text2: "#a3a7b3",
  text3: "#6e7382",
  accent: "#2f8488",
  accentText: "#8fd0d3",
  gilt: "#c9a96a",
  up: "#4f9470",
  down: "#c5563f",
  warn: "#c9952f",
} as const;

/** The categorical slots, in order. */
export const DOC_SERIES = ["#14a0a5", "#d95926", "#3987e5", "#c98500", "#9085e9", "#d55181"] as const;
const DOC_SERIES_LIST: readonly string[] = [...DOC_SERIES, "#6e7382"];

/** The income statement flow's colours on the report's surface (lib/income-flow.ts; validated against it, 5 Nov 2026). */
export const DOC_FLOW = { sources: DOC_SERIES_LIST, revenue: "#6e7382", profit: "#2f9e8f", cost: "#c26a5a", surface: "#12151c", text: { name: "#f4f1ea", value: "#f4f1ea", sub: "#a3a7b3", profit: "#7fd1c3", cost: "#e09a8c" } } as const;

export type Rect = { x: number; y: number; w: number; h: number; colour: string; title: string };
export type Label = { x: number; y: number; text: string; anchor: "start" | "middle" | "end"; colour: string; size: number; bold?: boolean };
export type Stroke = { d: string; colour: string; width: number; dash?: boolean };
export type Dot = { x: number; y: number; r: number; colour: string; title: string };
export type Legend = { name: string; colour: string }[];
export type Geometry = { width: number; height: number; rects: Rect[]; strokes: Stroke[]; dots: Dot[]; labels: Label[]; grid: Stroke[]; legend: Legend };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Ticks for a value axis: a round step, about five lines, zero among them when the range crosses it. */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

/** A figure in its unit, short enough for an axis or a bar. */
export function fmtUnit(v: number, unit: Unit, prefix = ""): string {
  const a = Math.abs(v);
  if (unit === "money") {
    const s = a >= 1e12 ? `${(v / 1e12).toFixed(1)}tn` : a >= 1e9 ? `${(v / 1e9).toFixed(a >= 1e11 ? 0 : 1)}bn` : a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m` : a >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(a >= 100 ? 0 : 2);
    return `${prefix}${s.replace(/\.0(?=[a-z]|$)/, "")}`;
  }
  if (unit === "pct") return `${a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(1)}%`;
  if (unit === "x") return `${v.toFixed(a >= 100 ? 0 : 1)}x`;
  return `${prefix}${a >= 1000 ? Math.round(v).toLocaleString("en-US") : a >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOf = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${d.slice(2, 4) ? `'${d.slice(2, 4)}` : ""}`.trim();
const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

const PAD = { l: 46, r: 12, t: 14, b: 30 };
const empty = (width: number, height: number): Geometry => ({ width, height, rects: [], strokes: [], dots: [], labels: [], grid: [], legend: [] });

/** Bars, grouped or stacked, from zero, with 2px gaps and a value over each bar when asked. */
export function barsGeometry(b: Extract<Block, { kind: "bars" }>, width: number, height: number): Geometry {
  const g = empty(width, height);
  const n = b.cats.length;
  const k = b.series.length;
  const prefix = "";
  const tops = b.cats.map((_, i) => (b.stacked ? b.series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0) : Math.max(0, ...b.series.map((s) => s.values[i] ?? 0))));
  const lows = b.cats.map((_, i) => (b.stacked ? b.series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0) : Math.min(0, ...b.series.map((s) => s.values[i] ?? 0))));
  const t = niceTicks(Math.min(0, ...lows), Math.max(0, ...tops));
  const lo = t[0];
  const hi = t[t.length - 1];
  const top = PAD.t + (b.labels ? 10 : 0);
  const bottom = height - PAD.b;
  const left = PAD.l;
  const right = width - PAD.r;
  const y = (v: number) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);
  for (const v of t) {
    g.grid.push({ d: `M${left} ${r1(y(v))}H${right}`, colour: v === 0 ? DOC_COLOURS.hairlineStrong : DOC_COLOURS.hairline, width: 1 });
    g.labels.push({ x: left - 6, y: y(v) + 3.5, text: fmtUnit(v, b.unit, prefix), anchor: "end", colour: DOC_COLOURS.text3, size: 10 });
  }
  const slot = (right - left) / Math.max(1, n);
  const groupW = Math.min(slot * 0.72, b.stacked ? 44 : 22 * k + 8);
  const barW = b.stacked ? groupW : Math.max(4, (groupW - 2 * (k - 1)) / k);
  b.cats.forEach((cat, i) => {
    const x0 = left + i * slot + (slot - groupW) / 2;
    g.labels.push({ x: left + i * slot + slot / 2, y: bottom + 16, text: cat, anchor: "middle", colour: DOC_COLOURS.text2, size: n > 10 ? 9 : 10 });
    let up = 0;
    let down = 0;
    b.series.forEach((s, j) => {
      const v = s.values[i];
      if (!isNum(v)) return;
      const colour = k === 1 ? DOC_SERIES[0] : DOC_SERIES[j % DOC_SERIES.length];
      const x = b.stacked ? x0 : x0 + j * (barW + 2);
      const from = b.stacked ? (v >= 0 ? up : down) : 0;
      const to = from + v;
      if (b.stacked) {
        if (v >= 0) up = to;
        else down = to;
      }
      const yy = Math.min(y(from), y(to));
      const hh = Math.max(1, Math.abs(y(to) - y(from)) - (b.stacked ? 2 : 0));
      g.rects.push({ x: r1(x), y: r1(yy), w: r1(barW), h: r1(hh), colour, title: `${s.name}, ${cat}: ${fmtUnit(v, b.unit)}` });
      if (b.labels && !b.stacked) g.labels.push({ x: x + barW / 2, y: v >= 0 ? yy - 4 : yy + hh + 11, text: fmtUnit(v, b.unit), anchor: "middle", colour: DOC_COLOURS.text, size: 9 });
    });
  });
  if (k > 1) g.legend = b.series.map((s, j) => ({ name: s.name, colour: DOC_SERIES[j % DOC_SERIES.length] }));
  return g;
}

/** Lines over dates on one axis, each series its own slot, with reference levels dashed and marked points. */
export function lineGeometry(b: Extract<Block, { kind: "line" }>, width: number, height: number): Geometry {
  const g = empty(width, height);
  const dates = [...new Set(b.series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const vals = [...b.series.flatMap((s) => s.points.map((p) => p.value).filter(isNum)), ...(b.refs ?? []).map((r) => r.value)];
  if (dates.length < 2 || !vals.length) return g;
  const span = Math.max(...vals) - Math.min(...vals) || Math.abs(vals[0]) || 1;
  const t = niceTicks(Math.min(...vals) - span * 0.06, Math.max(...vals) + span * 0.06);
  const lo = t[0];
  const hi = t[t.length - 1];
  const left = PAD.l + 4;
  const right = width - PAD.r - 4;
  const top = PAD.t;
  const bottom = height - PAD.b;
  const index = new Map(dates.map((d, i) => [d, i]));
  const x = (d: string) => left + ((index.get(d) ?? 0) / (dates.length - 1)) * (right - left);
  const y = (v: number) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);
  for (const v of t) {
    g.grid.push({ d: `M${left} ${r1(y(v))}H${right}`, colour: DOC_COLOURS.hairline, width: 1 });
    g.labels.push({ x: left - 6, y: y(v) + 3.5, text: fmtUnit(v, b.unit, b.prefix), anchor: "end", colour: DOC_COLOURS.text3, size: 10 });
  }
  // A few month labels along the foot.
  const step = Math.max(1, Math.ceil(dates.length / 5));
  dates.forEach((d, i) => {
    if (i % step === 0 || i === dates.length - 1) g.labels.push({ x: x(d), y: bottom + 16, text: monthOf(d), anchor: i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle", colour: DOC_COLOURS.text3, size: 10 });
  });
  b.series.forEach((s, j) => {
    const colour = DOC_SERIES[j % DOC_SERIES.length];
    let d = "";
    let pen = false;
    for (const p of s.points) {
      if (!isNum(p.value)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${r1(x(p.date))} ${r1(y(p.value))}`;
      pen = true;
    }
    g.strokes.push({ d, colour, width: 2 });
    const lastP = [...s.points].reverse().find((p) => isNum(p.value));
    if (lastP) g.dots.push({ x: r1(x(lastP.date)), y: r1(y(lastP.value!)), r: 4, colour, title: `${s.name}: ${fmtUnit(lastP.value!, b.unit, b.prefix)} on ${lastP.date}` });
  });
  for (const ref of b.refs ?? []) {
    g.strokes.push({ d: `M${left} ${r1(y(ref.value))}H${right}`, colour: DOC_COLOURS.gilt, width: 1.25, dash: true });
    g.labels.push({ x: left + 4, y: y(ref.value) - 5, text: `${ref.label} ${fmtUnit(ref.value, b.unit, b.prefix)}`, anchor: "start", colour: DOC_COLOURS.gilt, size: 10, bold: true });
  }
  for (const m of b.marks ?? []) {
    if (!index.has(m.date)) continue;
    const mx = x(m.date);
    const my = y(m.value);
    g.dots.push({ x: r1(mx), y: r1(my), r: 4, colour: DOC_COLOURS.text, title: `${m.label}: ${fmtUnit(m.value, b.unit, b.prefix)}` });
    const atRight = mx > right - 90;
    g.labels.push({ x: atRight ? mx - 8 : mx + 8, y: my < top + 14 ? my + 14 : my - 7, text: `${m.label} ${fmtUnit(m.value, b.unit, b.prefix)}`, anchor: atRight ? "end" : "start", colour: DOC_COLOURS.text, size: 10, bold: true });
  }
  if (b.series.length > 1 || (b.refs ?? []).length) g.legend = [...b.series.map((s, j) => ({ name: s.name, colour: DOC_SERIES[j % DOC_SERIES.length] }))];
  return g;
}

/** A donut of shares: arcs with 2px gaps, the largest first, a label on each arc of a tenth or more. */
export function donutGeometry(b: Extract<Block, { kind: "donut" }>, size: number): Geometry & { arcs: { d: string; colour: string; title: string }[]; total: number } {
  const g = empty(size, size);
  const parts = b.parts.slice(0, 6);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 2;
  const r = R * 0.62;
  const gap = parts.length > 1 ? 0.02 : 0;
  let a0 = -Math.PI / 2;
  const arcs = parts.map((p, i) => {
    const sweep = (p.value / total) * Math.PI * 2;
    const s = a0 + gap / 2;
    const e = a0 + sweep - gap / 2;
    a0 += sweep;
    const large = e - s > Math.PI ? 1 : 0;
    const pt = (rad: number, a: number) => `${r1(cx + rad * Math.cos(a))} ${r1(cy + rad * Math.sin(a))}`;
    const d = parts.length === 1 ? `M${cx - R} ${cy}A${R} ${R} 0 1 1 ${cx + R} ${cy}A${R} ${R} 0 1 1 ${cx - R} ${cy}M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z` : `M${pt(R, s)}A${R} ${R} 0 ${large} 1 ${pt(R, e)}L${pt(r, e)}A${r} ${r} 0 ${large} 0 ${pt(r, s)}Z`;
    return { d, colour: DOC_SERIES[i % DOC_SERIES.length], title: `${p.name}: ${((p.value / total) * 100).toFixed(0)}%` };
  });
  g.legend = parts.map((p, i) => ({ name: p.name, colour: DOC_SERIES[i % DOC_SERIES.length] }));
  return { ...g, arcs, total };
}

/** Points with the fitted line, both axes symmetric about zero. */
export function scatterGeometry(b: Extract<Block, { kind: "scatter" }>, width: number, height: number): Geometry {
  const g = empty(width, height);
  const lim = Math.max(0.01, ...b.points.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)])) * 1.08;
  const left = PAD.l;
  const right = width - PAD.r;
  const top = PAD.t;
  const bottom = height - PAD.b;
  const x = (v: number) => left + ((v + lim) / (2 * lim)) * (right - left);
  const y = (v: number) => bottom - ((v + lim) / (2 * lim)) * (bottom - top);
  g.grid.push({ d: `M${left} ${r1(y(0))}H${right}`, colour: DOC_COLOURS.hairlineStrong, width: 1 }, { d: `M${r1(x(0))} ${top}V${bottom}`, colour: DOC_COLOURS.hairlineStrong, width: 1 });
  for (const [px, py] of b.points) g.dots.push({ x: r1(x(px)), y: r1(y(py)), r: 2.5, colour: DOC_SERIES[0], title: `${(px * 100).toFixed(1)}%, ${(py * 100).toFixed(1)}%` });
  if (b.fit) {
    const ya = Math.max(-lim, Math.min(lim, b.fit.intercept - b.fit.slope * lim));
    const yb = Math.max(-lim, Math.min(lim, b.fit.intercept + b.fit.slope * lim));
    g.strokes.push({ d: `M${r1(x(-lim))} ${r1(y(ya))}L${r1(x(lim))} ${r1(y(yb))}`, colour: DOC_SERIES[1], width: 2 });
  }
  g.labels.push(
    { x: left - 6, y: top + 4, text: `${(lim * 100).toFixed(0)}%`, anchor: "end", colour: DOC_COLOURS.text3, size: 10 },
    { x: left - 6, y: bottom, text: `-${(lim * 100).toFixed(0)}%`, anchor: "end", colour: DOC_COLOURS.text3, size: 10 },
    { x: (left + right) / 2, y: bottom + 18, text: b.xLabel, anchor: "middle", colour: DOC_COLOURS.text2, size: 10 },
  );
  return g;
}
