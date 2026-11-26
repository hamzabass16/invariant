import { SLOTS } from "@/lib/ontology";
import { paragraphsOf, type Charts, type Report, type ReportLine, type ReportSection } from "@/lib/report";

/**
 * The review as a PDF report, planned from the kept report alone (Hamza,
 * 18 Oct 2026: the HCMP YTD review is the model): a cover with the headline
 * tiles and the bottom line, then numbered chapters in HCMP's order
 * (performance, attribution, trades, methodology adherence, risk, news and
 * newsletters, the person's questions, the action plan, the appendix), each
 * made of blocks (tables, charts, paragraphs) that
 * components/reports/review-pdf.tsx draws. A chapter whose slots are off or
 * whose data is missing is left out, and the numbering closes up; a slot the
 * data could not fill keeps its own line saying what it needs. Pure: the
 * chart geometry is computed here, in points, so the checks hold it without
 * rendering. Returns are context, never the verdict.
 */

export type Tone = ReportLine["tone"];

export type PdfTable = { kind: "table"; head: string[] | null; rows: { cells: string[]; tone?: Tone; href?: string | null }[]; widths?: number[]; toneCol?: number | null };
export type PdfBlock =
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string; muted?: boolean }
  | PdfTable
  | { kind: "lines"; title: string; chart: LineChart }
  | { kind: "bars"; title: string; chart: BarChart }
  | { kind: "heat"; title: string; chart: HeatChart }
  | { kind: "pie"; title: string; chart: PieChart }
  | { kind: "callout"; title: string; text: string; tone: Tone }
  | { kind: "numbered"; items: { lead: string; text: string; tone: Tone }[] }
  | { kind: "links"; items: { label: string; href: string }[] };
export type PdfChapter = { number: string; title: string; kicker: string; blocks: PdfBlock[] };
export type PdfTile = { value: string; label: string; tone: "ok" | "warn" | "danger" | "neutral" };
export type PdfPlan = {
  kicker: string;
  title: string;
  meta: string;
  verdict: Report["verdict"];
  pillars: Report["pillars"];
  tiles: PdfTile[];
  bottomLine: string[];
  bottomLineFrom: "commentary" | "summary";
  chapters: PdfChapter[];
  footer: string;
  notes: string[];
  disclaimer: string;
};

/** The chart face, the HCMP review's own (the deck's palette): blue for the account, orange, green and purple for the benchmarks in fixed order, red only for a loss. Status colours are never a series. */
export const PDF_SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#8e6cc9", "#c9a227"] as const;
export const PDF_LOSS = "#e34948";
/** Slice hues for a share of the book, in fixed order. */
export const PIE_HUES = ["#2a78d6", "#eb6834", "#1baf7a", "#8e6cc9", "#c9a227", "#6e9fe0", "#ec835a", "#5fd0a3", "#b3a1e0", "#e0c66d", "#9dbeea", "#b3cff0"] as const;
export const PDF_STATUS = { ok: "#0ca30c", warn: "#d99400", danger: "#e34948", info: "#2a78d6", neutral: "#606060" } as const;
/** The charts' width in points, the page's text column. */
export const CHART_W = 515;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const signed = (v: number, digits = 2, suffix = "%") => `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`;
const pct = (v: number | null, digits = 2) => (v === null ? "Waiting" : signed(v, digits));
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const span = (r: Report) => (r.kind === "monthly" ? "the month" : "the week");
const kindLabel = (r: Report) => (r.kind === "monthly" ? "Monthly review" : r.kind === "weekly" ? "Weekly review" : "Portfolio report");
const methodologyName = (r: Report) => r.shapedBy.replace(/^Shaped by /, "");

/** The report's file name: the review's title, safe for any file system. */
export function pdfName(r: Report): string {
  return `${r.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.pdf`;
}

/** The slot a kept section fills: its own tag, else read from its heading, so a review kept before the tags still plans its chapters. */
export function slotOfSection(s: ReportSection): string | null {
  if (s.slot) return s.slot;
  for (const [id, slot] of Object.entries(SLOTS)) {
    if (!id.startsWith("review_")) continue;
    if (s.heading === slot.label || s.heading.startsWith(`${slot.label},`) || s.heading.startsWith(`${slot.label}:`)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Chart geometry, in points

export type LineChart = {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  ticks: { y: number; label: string }[];
  cols: { x: number; label: string }[];
  lines: { label: string; colour: string; d: string; end: { x: number; y: number; text: string } | null }[];
  zeroY: number | null;
  /** The figures behind the lines, a row a date, for the page's table view (the PDF draws the lines alone). */
  table: { head: string[]; rows: string[][] };
};

function ticks(lo: number, hi: number): number[] {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}
const tickLabel = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;

/** A cumulative-return path as a line chart: one y-axis in percent, a zero line, a column label every few dates, a colour per series in fixed order and its last value at the line's end. Null when no series has a value. */
export function lineChart(path: NonNullable<Charts["period"]>, monthly: boolean, width = CHART_W, height = 165): LineChart | null {
  const vals = path.series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const t = ticks(Math.min(0, ...vals), Math.max(0, ...vals));
  const plot = { x: 44, y: 8, w: width - 44 - 54, h: height - 8 - 26 };
  const yOf = (v: number) => plot.y + plot.h - ((v - t[0]) / (t[t.length - 1] - t[0])) * plot.h;
  const xOf = (i: number) => plot.x + (path.dates.length === 1 ? 0 : (i / (path.dates.length - 1)) * plot.w);
  const every = Math.max(1, Math.ceil(path.dates.length / 8));
  const cols = path.dates.map((d, i) => ({ i, d })).filter(({ i }) => !(i % every) || i === path.dates.length - 1).map(({ i, d }) => ({ x: xOf(i), label: i === 0 || !monthly ? dayMonth(d) : MONTHS[Number(d.slice(5, 7)) - 1] }));
  const lines = path.series.map((ser, k) => {
    const parts: string[] = [];
    let pen = false;
    let end: LineChart["lines"][number]["end"] = null;
    ser.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      parts.push(`${pen ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`);
      pen = true;
      end = { x: xOf(i), y: yOf(v), text: signed(v, 1) };
    });
    return { label: ser.label, colour: PDF_SERIES[k % PDF_SERIES.length], d: parts.join(" "), end };
  });
  const table = { head: ["Date", ...path.series.map((x) => x.label)], rows: path.dates.map((d, i) => [d, ...path.series.map((x) => (x.values[i] === null || x.values[i] === undefined ? "" : signed(x.values[i]!, 2)))]) };
  return { width, height, plot, ticks: t.map((v) => ({ y: yOf(v), label: tickLabel(v) })), cols, lines, zeroY: t[0] <= 0 && t[t.length - 1] >= 0 ? yOf(0) : null, table };
}

export type BarChart = {
  width: number;
  height: number;
  zeroX: number;
  rows: { label: string; text: string; x: number; y: number; w: number; h: number; colour: string; mark: number | null }[];
};

export type BarRow = { label: string; value: number; text: string; colour?: string; mark?: number | null };

/** Horizontal bars from a zero line (negatives to the left), a label column, the figure beside the bar's end and an optional mark (a cap) on the same scale. Null without rows. */
export function barChart(rows: readonly BarRow[], width = CHART_W, rowH = 16, labelW = 112): BarChart | null {
  if (!rows.length) return null;
  const values = rows.flatMap((r) => [r.value, r.mark ?? 0]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const left = labelW + 6;
  const right = 64;
  const scale = (width - left - right) / span;
  const zeroX = left + (0 - lo) * scale;
  const out = rows.map((r, i) => {
    const x0 = zeroX + Math.min(0, r.value) * scale;
    const w = Math.abs(r.value) * scale;
    return { label: r.label, text: r.text, x: x0, y: 4 + i * (rowH + 4), w, h: rowH, colour: r.colour ?? PDF_SERIES[0], mark: r.mark === null || r.mark === undefined ? null : zeroX + r.mark * scale };
  });
  return { width, height: 8 + rows.length * (rowH + 4), zeroX, rows: out };
}

export type HeatChart = { size: number; cell: number; symbols: string[]; cells: { x: number; y: number; colour: string; text: string; dark: boolean }[]; labelW: number };

/** The matrix's colour: pale through blue for a positive correlation, through red for a negative one; the same reading as the deck's. */
export function heat(r: number): string {
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const pale = [240, 238, 236];
  const rgb = r >= 0 ? mix(pale, [42, 120, 214], Math.min(1, r)) : mix(pale, [208, 59, 59], Math.min(1, -r));
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The correlation matrix as a grid of coloured cells with their figures, symbols on the top and the left. Null under three symbols. */
export function heatChart(c: NonNullable<Charts["correlation"]>, width = CHART_W, maxCell = 30): HeatChart | null {
  const symbols = c.symbols.slice(0, 16);
  if (symbols.length < 3) return null;
  const labelW = 44;
  const cell = Math.min(maxCell, Math.floor((width - labelW) / symbols.length));
  const of = new Map<string, number>();
  for (const p of c.pairs) {
    of.set(`${p.a}|${p.b}`, p.r);
    of.set(`${p.b}|${p.a}`, p.r);
  }
  const cells: HeatChart["cells"] = [];
  symbols.forEach((a, i) =>
    symbols.forEach((b, j) => {
      const r = a === b ? 1 : (of.get(`${a}|${b}`) ?? 0);
      cells.push({ x: labelW + j * cell, y: labelW + i * cell, colour: heat(r), text: a === b ? "" : r.toFixed(2).replace(/^(-?)0\./, "$1."), dark: Math.abs(r) > 0.6 });
    }),
  );
  return { size: labelW + symbols.length * cell, cell, symbols, cells, labelW };
}

export type PieChart = { size: number; cx: number; cy: number; r: number; hole: number; slices: { label: string; value: number; share: number; colour: string; d: string; lx: number; ly: number; text: string }[] };

/** A share of the whole as a donut: slices in the order given (an "Other" slice last), each with its path, its colour in fixed order and the figure's place; a share under 3% keeps its legend entry and no label on the ring. Null without a positive value. */
export function pieChart(rows: readonly { label: string; value: number }[], size = 170, max = 10): PieChart | null {
  const positive = rows.filter((r) => r.value > 0);
  const total = positive.reduce((n, r) => n + r.value, 0);
  if (!total) return null;
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const kept = sorted.length > max ? [...sorted.slice(0, max - 1), { label: "Other", value: sorted.slice(max - 1).reduce((n, r) => n + r.value, 0) }] : sorted;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const hole = r * 0.55;
  let angle = -Math.PI / 2;
  const slices = kept.map((row, i) => {
    const share = row.value / total;
    const a0 = angle;
    const a1 = angle + share * 2 * Math.PI - 1e-6;
    angle += share * 2 * Math.PI;
    const p = (a: number, rad: number) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const large = share > 0.5 ? 1 : 0;
    const d = share >= 0.999 ? `M ${p(a0, r)} A ${r} ${r} 0 1 1 ${p(a0 + Math.PI, r)} A ${r} ${r} 0 1 1 ${p(a0, r)} Z` : `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, hole)} A ${hole} ${hole} 0 ${large} 0 ${p(a0, hole)} Z`;
    const mid = (a0 + a1) / 2;
    const lr = (r + hole) / 2;
    return { label: row.label, value: row.value, share, colour: PIE_HUES[i % PIE_HUES.length], d, lx: cx + lr * Math.cos(mid), ly: cy + lr * Math.sin(mid), text: share >= 0.03 ? `${(share * 100).toFixed(0)}%` : "" };
  });
  return { size, cx, cy, r, hole, slices };
}

// ---------------------------------------------------------------------------
// The plan

const tableOf = (lines: readonly ReportLine[], head: string[] | null, widths?: number[], toneCol: number | null = 1): PdfTable => ({
  kind: "table",
  head,
  rows: lines.map((l) => ({ cells: [l.label, l.value ?? "", l.detail ?? ""], tone: l.tone, href: l.href ?? null })),
  widths,
  toneCol,
});

/** The question a question section is headed by, without the slot's label. */
export const questionOf = (s: ReportSection): string => s.heading.replace(new RegExp(`^${SLOTS.review_questions.label}:\\s*`), "");

/** How many rules the rulebook counts as followed of those judged, from its lines; null without a rulebook. */
export function rulesFollowed(rulebook: ReportSection | null): { followed: number; judged: number } | null {
  if (!rulebook) return null;
  const judged = rulebook.lines.filter((l) => l.value && /^(Followed|Partly|Not followed)$/.test(l.value));
  if (!judged.length) return null;
  return { followed: judged.filter((l) => l.value === "Followed").length, judged: judged.length };
}

/** The cover's eight tiles: the period's returns and the gap, the year to date, the verdict, the rules followed, the trades and the alarms. Returns are context, never the verdict. */
export function coverTiles(r: Report, by: Map<string, ReportSection[]>): PdfTile[] {
  const period = r.returns[0];
  const ytd = r.returns[1];
  const bench = period ? Object.entries(period.benchmarks)[0] : undefined;
  const tiles: PdfTile[] = [];
  const toneOf = (v: number | null) => (v === null ? "neutral" : v >= 0 ? "ok" : "danger");
  tiles.push({ value: pct(period?.account ?? null), label: `Account, ${span(r)}, time-weighted`, tone: toneOf(period?.account ?? null) });
  if (bench) tiles.push({ value: pct(bench[1]), label: `${bench[0]}, ${span(r)}`, tone: toneOf(bench[1]) });
  if (bench && period?.account !== null && period?.account !== undefined && bench[1] !== null) tiles.push({ value: signed(period.account - bench[1], 2, " pp"), label: `Gap to ${bench[0]}, ${span(r)}`, tone: toneOf(period.account - bench[1]) });
  if (ytd) tiles.push({ value: pct(ytd.account), label: "Account, year to date", tone: toneOf(ytd.account) });
  if (r.verdict) tiles.push({ value: r.verdict.label, label: "Verdict, behaviour and holdings", tone: r.verdict.level });
  const rules = rulesFollowed(by.get("review_rulebook")?.[0] ?? null);
  if (rules) tiles.push({ value: `${rules.followed} of ${rules.judged}`, label: "Rules followed, of those judged", tone: rules.followed === rules.judged ? "ok" : rules.followed === 0 ? "danger" : "warn" });
  const trades = by.get("review_trades")?.[0];
  if (trades) {
    const n = trades.lines.filter((l) => l.tone !== "neutral" || /\b(buy|sell|bought|sold)\b/i.test(l.detail ?? "") || /\d/.test(l.value ?? "")).length;
    tiles.push({ value: n ? String(n) : "None", label: `Trades, ${span(r)}`, tone: "neutral" });
  }
  const alarms = by.get("review_alarms")?.[0];
  const red = alarms?.lines.filter((l) => l.tone === "danger").length ?? 0;
  tiles.push({ value: red ? String(red) : "None", label: red ? "Alarms: decisions owed" : "Alarms", tone: red ? "danger" : "ok" });
  return tiles.slice(0, 8);
}

function barsOf(ch: Charts | null): PdfBlock[] {
  if (!ch?.contribution.length) return [];
  const sorted = [...ch.contribution].sort((a, b) => b.value - a.value);
  const rows = sorted.slice(0, 24).map((x) => ({ label: x.label, value: x.value, text: signed(x.value, 2, " pp"), colour: x.value >= 0 ? PDF_SERIES[0] : PDF_LOSS }));
  const chart = barChart(rows);
  return chart ? [{ kind: "bars", title: `Contribution by holding, in percentage points of the book${sorted.length > 24 ? ` (the ${24} largest moves)` : ""}`, chart }] : [];
}

function capsOf(ch: Charts | null): PdfBlock[] {
  if (!ch?.caps.length) return [];
  const rows = ch.caps.slice(0, 30).map((x) => ({ label: x.label, value: x.weight, text: `${x.weight.toFixed(1)}%${x.cap !== null ? ` of ${x.cap}%` : ""}`, colour: x.state === "over" ? PDF_LOSS : x.state === "near" ? "#fab219" : PDF_SERIES[0], mark: x.cap }));
  const chart = barChart(rows);
  return chart ? [{ kind: "bars", title: "Weight by holding against its cap (the mark is the cap)", chart }] : [];
}

/** The report, planned. */
export function reviewPdfPlan(r: Report): PdfPlan {
  const ch = r.charts;
  const by = new Map<string, ReportSection[]>();
  for (const s of r.sections) {
    const slot = slotOfSection(s) ?? `other:${s.heading}`;
    by.set(slot, [...(by.get(slot) ?? []), s]);
  }
  const one = (slot: string) => by.get(slot)?.[0] ?? null;
  const chapters: Omit<PdfChapter, "number">[] = [];

  // 01 Performance
  {
    const blocks: PdfBlock[] = [];
    const returns = one("review_returns");
    if (r.returns.length) {
      const benches = [...new Set(r.returns.flatMap((x) => Object.keys(x.benchmarks)))];
      const first = benches[0];
      blocks.push({
        kind: "table",
        head: ["Return", "Account", ...benches, ...(first ? [`Gap to ${first}`] : [])],
        rows: r.returns.map((x) => ({ cells: [x.label, pct(x.account), ...benches.map((b) => pct(x.benchmarks[b] ?? null)), ...(first ? [x.account !== null && x.benchmarks[first] !== null && x.benchmarks[first] !== undefined ? signed(x.account - x.benchmarks[first]!, 2, " pp") : "Waiting"] : [])] })),
        toneCol: null,
      });
      const note = r.returns.find((x) => x.note)?.note;
      if (note) blocks.push({ kind: "p", text: note, muted: true });
    } else if (returns) blocks.push(tableOf(returns.lines, ["Return", "Reading", "Detail"]));
    if (ch?.period) {
      const chart = lineChart(ch.period, false);
      if (chart) blocks.push({ kind: "lines", title: `${r.period?.label ?? "The period"}: cumulative return, account against ${ch.period.series.slice(1).map((s) => s.label).join(" and ") || "the benchmarks"}`, chart });
    }
    if (ch?.ytd) {
      const chart = lineChart(ch.ytd, true);
      if (chart) blocks.push({ kind: "lines", title: `Year to date: cumulative return, account against ${ch.ytd.series.slice(1).map((s) => s.label).join(" and ") || "the benchmarks"}`, chart });
    }
    const insights = one("review_insights");
    if (insights?.lines.length) {
      blocks.push({ kind: "h3", text: SLOTS.review_insights.label });
      for (const l of insights.lines) blocks.push({ kind: "callout", title: l.label, text: l.detail ?? l.value ?? "", tone: "neutral" });
    }
    const month = one("review_month");
    if (month?.lines.length) {
      blocks.push({ kind: "h3", text: month.heading });
      blocks.push(tableOf(month.lines, ["Measure", "Reading", "Detail"], [34, 22, 44], null));
      if (month.footer) blocks.push({ kind: "p", text: month.footer, muted: true });
    }
    if (blocks.length) chapters.push({ title: "Performance", kicker: `Returns against the benchmarks the methodology names, over ${span(r)} and the year to date. Context for the verdict, never the verdict.`, blocks });
  }

  // 02 Attribution
  {
    const blocks: PdfBlock[] = [];
    const moves = one("review_moves");
    blocks.push(...barsOf(ch));
    if (ch?.byClass.length) blocks.push({ kind: "table", head: ["Class", "Contribution", "Weight at the end"], rows: ch.byClass.map((x) => ({ cells: [x.label, signed(x.contrib, 2, " pp"), `${x.weight.toFixed(1)}%`] })), widths: [50, 25, 25], toneCol: null });
    if (moves?.lines.length) {
      blocks.push({ kind: "h3", text: "By holding" });
      blocks.push(tableOf(moves.lines.filter((l) => !/^(Correlation|Book against|Highest pairs|Lowest pairs)/.test(l.label)), ["Holding", "Return (contribution)", "Class and weight at the start"], [22, 30, 48]));
      if (moves.footer) blocks.push({ kind: "p", text: moves.footer, muted: true });
    }
    if (blocks.length) chapters.push({ title: "Attribution", kicker: `What moved the book over ${span(r)}: each holding's return times its weight at the start, and the classes together.`, blocks });
  }

  // 03 Trades
  {
    const trades = one("review_trades");
    if (trades) {
      const blocks: PdfBlock[] = trades.lines.length ? [tableOf(trades.lines, ["Trade", "Standing", "Class, cap, Decision Log entry and vote"], [30, 20, 50])] : [{ kind: "p", text: `No trades ${span(r)}.` }];
      if (trades.footer) blocks.push({ kind: "p", text: trades.footer, muted: true });
      const letter = one("review_letter");
      if (letter?.lines.length) {
        blocks.push({ kind: "h3", text: letter.heading });
        blocks.push(tableOf(letter.lines, ["Part", "Reading", "What it rests on"], [24, 18, 58]));
        if (letter.footer) blocks.push({ kind: "p", text: letter.footer, muted: true });
      }
      chapters.push({ title: "Trades", kicker: `Every fill of ${span(r)} with its class, its cap, its Decision Log entry and its vote; a trade without an entry is a behaviour finding, not a return.`, blocks });
    }
  }

  // 04 Methodology adherence
  {
    const blocks: PdfBlock[] = [];
    if (r.pillars.length) blocks.push({ kind: "table", head: ["Pillar", "Standing", "Why"], rows: r.pillars.map((p) => ({ cells: [p.label, p.status, p.note], tone: p.level })), widths: [24, 20, 56], toneCol: 1 });
    const rulebook = one("review_rulebook");
    if (rulebook?.lines.length) {
      blocks.push({ kind: "h3", text: rulebook.heading });
      blocks.push(tableOf(rulebook.lines, ["Rule", "Status", "Evidence"], [44, 16, 40]));
      if (rulebook.footer) blocks.push({ kind: "p", text: rulebook.footer, muted: true });
    }
    if (ch?.mix.length) {
      const pie = pieChart(ch.mix.map((x) => ({ label: x.label, value: x.weight })));
      if (pie) blocks.push({ kind: "pie", title: "The book by class", chart: pie });
    }
    if (ch?.caps.length) {
      const pie = pieChart(ch.caps.map((x) => ({ label: x.label, value: x.weight })), 170, 12);
      if (pie) blocks.push({ kind: "pie", title: "The book by holding", chart: pie });
    }
    blocks.push(...capsOf(ch));
    if (ch?.mix.length) blocks.push({ kind: "table", head: ["Class", "Weight", "Cap"], rows: ch.mix.map((x) => ({ cells: [x.label, `${x.weight.toFixed(1)}%`, x.cap === null ? "No cap" : `${x.cap}%`], tone: x.cap !== null && x.weight > x.cap ? "danger" : "neutral" })), widths: [50, 25, 25], toneCol: null });
    if (ch?.cash !== null && ch?.cash !== undefined) blocks.push({ kind: "p", text: `Cash is ${ch.cash.toFixed(1)}% of the book.`, muted: true });
    const capital = one("review_capital");
    if (capital && !ch?.caps.length && capital.lines.length) blocks.push(tableOf(capital.lines, ["Item", "Reading", "Detail"]));
    const theses = one("review_theses");
    if (theses?.lines.length) {
      blocks.push({ kind: "h3", text: theses.heading });
      blocks.push(tableOf(theses.lines, ["Holding", "Standing", "Class, test and the period's evidence"], [20, 18, 62]));
      if (theses.footer) blocks.push({ kind: "p", text: theses.footer, muted: true });
    }
    const hunter = one("review_hunter");
    if (hunter?.lines.length) {
      blocks.push({ kind: "h3", text: hunter.heading });
      blocks.push(tableOf(hunter.lines, ["Thesis", "Finds", "The one to read first, and its source"], [22, 22, 56], null));
      if (hunter.footer) blocks.push({ kind: "p", text: hunter.footer, muted: true });
    }
    if (blocks.length) chapters.push({ title: "Methodology adherence", kicker: `Every rule of ${methodologyName(r)} as followed, partly, not followed or yours to check; the weights against their caps; each holding's class and thesis.`, blocks });
  }

  // 05 Risk
  {
    const blocks: PdfBlock[] = [];
    const moves = one("review_moves");
    if (ch?.correlation) {
      const c = ch.correlation;
      const chart = heatChart(c);
      if (chart) blocks.push({ kind: "heat", title: `Holdings moved together at ${c.average.toFixed(2)} on average over ${c.days} sessions to ${dayMonth(c.to)}`, chart });
      const pairs = moves?.lines.filter((l) => /^(Correlation|Book against|Highest pairs|Lowest pairs)/.test(l.label)) ?? [];
      if (pairs.length) blocks.push(tableOf(pairs, ["Measure", "Reading", "Detail"], [30, 14, 56], null));
    }
    if (ch?.markets.length) {
      const rows = ch.markets.slice(0, 20).map((x) => ({ label: x.symbol, value: x.change, text: x.unit === "pct" ? signed(x.change, 1) : signed(x.change, 2, " pp"), colour: x.change >= 0 ? PDF_SERIES[0] : PDF_LOSS }));
      const chart = barChart(rows);
      if (chart) {
        blocks.push({ kind: "h3", text: `Markets ${span(r)}` });
        blocks.push({ kind: "bars", title: "Each indicator the methodology reads, and its benchmarks: a price in percent, a yield or spread in points", chart });
        blocks.push({ kind: "table", head: ["Symbol", "Name", "Move"], rows: ch.markets.map((x) => ({ cells: [x.symbol, x.name, x.unit === "pct" ? signed(x.change, 2) : signed(x.change, 2, " pp")] })), widths: [18, 58, 24], toneCol: null });
      }
    } else {
      const markets = one("review_markets");
      if (markets?.lines.length) blocks.push(tableOf(markets.lines, ["Indicator", "Move", "Detail"]));
    }
    if (blocks.length) chapters.push({ title: "Risk", kicker: "How the holdings move together, the book against its benchmarks, and the markets the methodology reads.", blocks });
  }

  // 06 News and newsletters
  {
    const blocks: PdfBlock[] = [];
    for (const s of by.get("review_news") ?? []) {
      if (!s.lines.length) continue;
      blocks.push({ kind: "h3", text: s.heading });
      blocks.push({ kind: "table", head: null, rows: s.lines.map((l) => ({ cells: [l.label, l.value ?? "", l.detail ?? ""], href: l.href ?? null })), widths: [36, 16, 48], toneCol: null });
      if (s.footer) blocks.push({ kind: "p", text: s.footer, muted: true });
    }
    for (const s of by.get("review_newsletters") ?? []) {
      if (!s.lines.length) continue;
      blocks.push({ kind: "h3", text: s.heading });
      blocks.push(tableOf(s.lines, null, undefined, null));
      if (s.footer) blocks.push({ kind: "p", text: s.footer, muted: true });
    }
    if (blocks.length) chapters.push({ title: "News and newsletters", kicker: "What was reported about the holdings, the markets and the world this period, each item with its page, and what your newsletters argued.", blocks });
  }

  // 07 Your questions
  {
    const blocks: PdfBlock[] = [];
    for (const s of by.get("review_questions") ?? []) {
      blocks.push({ kind: "h3", text: questionOf(s) });
      for (const l of s.lines) blocks.push(l.tone === "warn" ? { kind: "callout", title: l.label, text: l.detail ?? "", tone: "warn" } : { kind: "p", text: l.label });
      if (s.footer) blocks.push({ kind: "p", text: s.footer, muted: true });
    }
    if (blocks.length) chapters.push({ title: SLOTS.review_questions.label, kicker: "The questions you keep on Reviews, each answered from this review's figures alone, with the AI. Not advice.", blocks });
  }

  // 08 Action plan
  {
    const blocks: PdfBlock[] = [];
    const alarms = one("review_alarms");
    if (alarms?.lines.length) {
      const ranked = [...alarms.lines].sort((a, b) => ["danger", "warn", "info", "neutral", "ok"].indexOf(a.tone) - ["danger", "warn", "info", "neutral", "ok"].indexOf(b.tone));
      blocks.push({ kind: "numbered", items: ranked.map((l) => ({ lead: l.label, text: [l.value ? `${l.value}.` : null, l.detail].filter(Boolean).join(" "), tone: l.tone })) });
      if (alarms.footer) blocks.push({ kind: "p", text: alarms.footer, muted: true });
    }
    const coming = [...(one("review_calendar")?.lines ?? []), ...(by.get("review_news") ?? []).filter((s) => (s.part ?? "") === "upcoming" || /coming up/i.test(s.heading)).flatMap((s) => s.lines)];
    if (coming.length) {
      blocks.push({ kind: "h3", text: SLOTS.review_calendar.label });
      blocks.push({ kind: "table", head: ["When", "Item", "Detail"], rows: coming.map((l) => ({ cells: [l.value ?? "", l.label, l.detail ?? ""], tone: l.tone, href: l.href ?? null })), widths: [14, 36, 50], toneCol: null });
    }
    const week = one("review_week_ahead");
    if (week?.lines.length) {
      blocks.push({ kind: "h3", text: SLOTS.review_week_ahead.label });
      blocks.push({ kind: "table", head: ["When", "Event", "In your book, and how it took the same before"], rows: week.lines.map((l) => ({ cells: [l.value ?? "", l.label, l.detail ?? ""], tone: l.tone, href: l.href ?? null })), widths: [12, 26, 62], toneCol: null });
      if (week.footer) blocks.push({ kind: "p", text: week.footer, muted: true });
    }
    if (blocks.length) chapters.push({ title: "Action plan", kicker: "The decisions owed, most urgent first, then what is coming up and still open, and next week on the calendar. Each names the section it comes from.", blocks });
  }

  // 09 Appendix
  {
    const blocks: PdfBlock[] = [];
    const method = one("review_method");
    if (method?.lines.length) {
      blocks.push(tableOf(method.lines, ["Item", "Reading", "Detail"], [22, 26, 52], null));
      if (method.footer) blocks.push({ kind: "p", text: method.footer, muted: true });
    }
    const links = [...new Map(r.sections.flatMap((s) => s.lines.filter((l) => l.href && /^https?:\/\//i.test(l.href)).map((l) => [l.href as string, l.label] as const))).entries()].slice(0, 40);
    if (links.length) {
      blocks.push({ kind: "h3", text: "Pages this review read" });
      blocks.push({ kind: "links", items: links.map(([href, label]) => ({ label: clip(label.split(" · ")[0], 90), href })) });
    }
    if (r.notes.length) {
      blocks.push({ kind: "h3", text: "How this review was built" });
      for (const n of r.notes) blocks.push({ kind: "p", text: n, muted: true });
    }
    chapters.push({ title: "Appendix", kicker: "Where each figure came from, the pages read, and how the review was built.", blocks });
  }

  const prose = r.prose ? paragraphsOf(r.prose) : [];
  return {
    kicker: `Invariant · ${kindLabel(r)}`,
    title: r.title,
    meta: [r.period?.label ?? r.asOf, `figures as of ${dayMonth(r.asOf)} ${r.asOf.slice(0, 4)}`, r.verdict ? `judged against ${methodologyName(r)}` : methodologyName(r)].join("  ·  "),
    verdict: r.verdict,
    pillars: r.pillars,
    tiles: coverTiles(r, by),
    bottomLine: prose.length ? prose : [r.summary, ...(r.verdict ? [r.verdict.reason] : [])],
    bottomLineFrom: prose.length ? "commentary" : "summary",
    chapters: chapters.map((c, i) => ({ ...c, number: String(i + 1).padStart(2, "0") })),
    footer: `Invariant · ${r.title}`,
    notes: r.notes,
    disclaimer: "Figures from your own connections, judged against your own methodology. Returns are context for the Behaviour pillar, never the verdict. Not investment advice.",
  };
}

/** The chapters' titles in order, for the checks and the screen. */
export const pdfOutline = (r: Report): string[] => reviewPdfPlan(r).chapters.map((c) => `${c.number} · ${c.title}`);
