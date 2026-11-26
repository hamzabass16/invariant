import { maskMoney } from "@/lib/stealth";
import type { Evidence, FigureChart, PillarTag, ThesisFigure } from "@/lib/theses";
import type { Find } from "@/lib/thesis-hunter";

/**
 * A thesis as a PDF to keep or send to a friend (Hamza, 20 Oct 2026):
 * everything on the thesis page in one document marked Invariant, the
 * thesis, its pillars read today, what to watch, the kill signals and
 * triggers, the valuation per share, the latest results, the charts and
 * pictures, what was added to it and what the Thesis Hunter found. Made to be
 * shared, so it carries no amount of money: a weight in percent, a price and
 * a valuation per share, never what is held. Pure: the data the route
 * gathers and the charts' geometry; components/theses/thesis-pdf.tsx draws it.
 */

export type ThesisPdfFact = { label: string; value: string; detail: string | null; tone: "ok" | "warn" | "danger" | "neutral" };

export type ThesisPdfData = {
  kind: "stock" | "market";
  /** The symbol, or the market thesis's title. */
  title: string;
  /** The company's name, or "Market thesis". */
  subtitle: string;
  /** The day it was exported, YYYY-MM-DD. */
  exportedOn: string;
  /** The day the thesis was last changed, YYYY-MM-DD. */
  updatedOn: string | null;
  methodology: string | null;
  facts: ThesisPdfFact[];
  paragraphs: string[];
  pathway: string | null;
  pillars: { name: string; text: string; tag: PillarTag; words: string }[];
  watch: string[];
  signals: { label: string; kind: "kill" | "trigger"; reading: string; met: boolean | null }[];
  valuation: { low: number | null; base: number; high: number | null; price: number | null; currency: string; basis: string | null; asOf: string } | null;
  results: { date: string; quarter: string | null; headline: string } | null;
  figures: ThesisFigure[];
  evidence: Evidence[];
  hunted: Find[];
  /** Where the reader can try the app themselves. */
  tryUrl: string | null;
};

/** A picture read for the PDF, by its address; one that could not be read is named with its page instead. */
export type PdfPictures = Record<string, { data: Buffer; format: "png" | "jpg" }>;

/** The file's name: the thesis and the day, safe for any file system. */
export function thesisPdfName(d: Pick<ThesisPdfData, "title" | "exportedOn">): string {
  return `${d.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()} thesis ${d.exportedOn}.pdf`;
}

/** Every picture on the thesis and its finds, each address once. */
export const picturesOf = (d: Pick<ThesisPdfData, "figures" | "hunted">): string[] => [...new Set([...d.figures, ...d.hunted.map((f) => f.figure).filter((f): f is ThesisFigure => !!f)].map((f) => f.image?.url).filter((u): u is string => !!u))];

/** Whether the facts carry an amount of money (a currency sign or code before a number, as stealth mode reads it); a shared PDF must hold none of the person's. */
export const factsHoldMoney = (facts: readonly ThesisPdfFact[]): boolean => facts.some((f) => [f.value, f.detail ?? ""].some((x) => maskMoney(x) !== x));

// ---------------------------------------------------------------------------
// Chart geometry, in points

/** The figures' hues in fixed order, the review report's own; never a status colour. */
export const FIGURE_HUES = ["#2a78d6", "#eb6834", "#1baf7a", "#8e6cc9"] as const;

export type FigureGeometry = {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  ticks: { y: number; label: string }[];
  cols: { x: number; label: string }[];
  zeroY: number | null;
  lines: { label: string; colour: string; d: string }[];
  bars: { x: number; y: number; w: number; h: number; colour: string }[];
  legend: { label: string; colour: string }[];
};

function niceTicks(lo: number, hi: number): number[] {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

const tickText = (v: number, unit: string) => `${Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : Number.isInteger(v) ? v : v.toFixed(1)}${unit === "%" ? "%" : unit === "x" ? "x" : ""}`;

/** A thesis chart as geometry: one y-axis in its unit with a zero line when it spans zero, a label every few columns, a line per series or grouped bars, a hue per series in fixed order. Null without a value. */
export function figureGeometry(c: FigureChart, width = 515, height = 150): FigureGeometry | null {
  const vals = c.series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!vals.length) return null;
  const t = niceTicks(c.type === "bar" ? Math.min(0, ...vals) : Math.min(...vals), c.type === "bar" ? Math.max(0, ...vals) : Math.max(...vals));
  const plot = { x: 42, y: 6, w: width - 42 - 26, h: height - 6 - 22 };
  const lo = t[0];
  const hi = t[t.length - 1];
  const yOf = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
  const n = c.labels.length;
  const legend = c.series.map((s, k) => ({ label: s.name, colour: FIGURE_HUES[k % FIGURE_HUES.length] }));
  const every = Math.max(1, Math.ceil(n / 8));
  const ticks = t.map((v) => ({ y: yOf(v), label: tickText(v, c.unit) }));
  const zeroY = lo <= 0 && hi >= 0 ? yOf(0) : null;
  if (c.type === "line") {
    const xOf = (i: number) => plot.x + (n === 1 ? 0 : (i / (n - 1)) * plot.w);
    const lines = c.series.map((s, k) => {
      const parts: string[] = [];
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) {
          pen = false;
          return;
        }
        parts.push(`${pen ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`);
        pen = true;
      });
      return { label: s.name, colour: legend[k].colour, d: parts.join(" ") };
    });
    const cols = c.labels.map((l, i) => ({ i, l })).filter(({ i }) => !(i % every) || i === n - 1).map(({ i, l }) => ({ x: xOf(i), label: l }));
    return { width, height, plot, ticks, cols, zeroY, lines, bars: [], legend };
  }
  const group = plot.w / n;
  const gap = Math.min(8, group * 0.25);
  const barW = Math.max(1, (group - gap) / c.series.length - 1);
  const base = zeroY ?? yOf(lo);
  const bars = c.series.flatMap((s, k) =>
    s.values.flatMap((v, i) => {
      if (v === null || !Number.isFinite(v)) return [];
      const y = yOf(v);
      return [{ x: plot.x + i * group + gap / 2 + k * (barW + 1), y: Math.min(y, base), w: barW, h: Math.max(0.5, Math.abs(base - y)), colour: legend[k].colour }];
    }),
  );
  const cols = c.labels.map((l, i) => ({ i, l })).filter(({ i }) => !(i % every) || i === n - 1).map(({ i, l }) => ({ x: plot.x + i * group + group / 2, label: l }));
  return { width, height, plot, ticks, cols, zeroY, lines: [], bars, legend };
}
