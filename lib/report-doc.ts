import { flowLines, type IncomeFlow } from "@/lib/income-flow";

/**
 * A report as pages of blocks (Hamza, 4 Nov 2026: "instead of a PowerPoint,
 * just make it an HTML ... and then convert that HTML to a PDF"): the earnings
 * deck, a Calendar event's report and the reviews are built as one
 * `ReportDoc`, which `lib/report-html.ts` draws as a web page (in the app and
 * as a file) and `components/reports/report-doc-pdf.tsx` draws as a PDF from
 * the same geometry (`lib/report-charts.ts`), so the two never disagree.
 *
 * Nothing is drawn for a figure that is not there (Hamza, 4 Nov 2026: "there
 * should not be any NA ... if it is an NA, then just don't include it"): a
 * tile, a bullet, a row or a series without a value is left out by
 * `cleanDoc`, a chart with too little to draw goes, and a page left with
 * nothing goes. What was left out and why is said once, at the end
 * (`omitted`): the company does not report it, it is not meaningful (a
 * multiple on a loss), or the filings carry it in a form the app does not
 * read yet, so a gap of the app's never looks like the company's.
 *
 * `checkDoc` is the reviewer's first pass, with no model: it reads every
 * word as a person would and names what is unfinished (a placeholder, a
 * reading still to come), cut (a sentence ending on "the."), a blob (a
 * paragraph too long to read on a slide) or repeated. Pure.
 */

export type Tone = "accent" | "up" | "down" | "warn" | "muted" | "gilt";
export type Unit = "money" | "pct" | "x" | "plain";

export type Tile = { label: string; value: string; detail?: string; tone?: Tone };
export type Bullet = { text: string; tone?: Tone; tag?: string; /** A page the line opens: https alone. */ url?: string };
export type Card = { head: string; big?: string; lines: string[]; tone?: Tone; tag?: string };
export type Series = { name: string; values: (number | null)[] };
export type LinePoint = { date: string; value: number | null };
export type Row = { cells: string[]; tone?: Tone; status?: number };

export type Block =
  | { kind: "tiles"; tiles: Tile[] }
  | { kind: "bullets"; title?: string; items: Bullet[] }
  | { kind: "cards"; title?: string; cards: Card[] }
  | { kind: "bars"; title: string; cats: string[]; series: Series[]; unit: Unit; currency?: string | null; stacked?: boolean; labels?: boolean }
  | { kind: "line"; title: string; series: { name: string; points: LinePoint[] }[]; unit: Unit; prefix?: string; refs?: { value: number; label: string }[]; marks?: { date: string; value: number; label: string }[] }
  | { kind: "donut"; title: string; parts: { name: string; value: number; text?: string }[]; center?: { value: string; label: string } }
  | { kind: "scatter"; title: string; points: [number, number][]; fit?: { slope: number; intercept: number }; xLabel: string; yLabel: string }
  | { kind: "table"; title?: string; head: string[]; rows: Row[] }
  | { kind: "meters"; title?: string; items: { label: string; now: number; target: number; nowText: string; targetText: string; note?: string; higherIsBetter?: boolean }[] }
  | { kind: "quad"; quads: { head: string; items: string[]; tone: Tone }[] }
  | { kind: "callout"; text: string; tone?: Tone }
  /** How a period's revenue became profit (lib/income-flow.ts), drawn by `flowLayout` on every surface. */
  | { kind: "flow"; title: string; flow: IncomeFlow };

export type Page = {
  key: string;
  /** The small label over the title, e.g. "Growth". */
  kicker: string;
  /** What the page found, in one sentence. */
  title: string;
  /** Where its figures came from. */
  ref?: string;
  /** Two columns from a laptop's width, else one. */
  split?: boolean;
  /** The cover and the verdict. */
  hero?: boolean;
  blocks: Block[];
};

export type OmitReason = "not_reported" | "not_meaningful" | "not_read";
export type Omitted = { what: string; why: OmitReason; note: string };

export type ReportDoc = {
  kind: "earnings" | "event" | "review";
  title: string;
  subtitle: string;
  /** The day it was made, YYYY-MM-DD. */
  date: string;
  tone: "ok" | "warn" | "danger";
  pages: Page[];
  omitted: Omitted[];
};

export const OMIT_WORDS: Record<OmitReason, string> = {
  not_reported: "Not reported by the company",
  not_meaningful: "Not meaningful",
  not_read: "Not in the filings in a form the app reads yet",
};

// ---------------------------------------------------------------------------
// What a page may not say

/** A value that stands for nothing: never drawn. */
export const EMPTY_VALUE = /^\s*(?:n\/?a|na|none|null|undefined|nan|-|—|–|\?|tbd|not available|unknown)\s*$/i;
/** Words for a figure missing, inside a sentence. */
const MISSING_WORDS = /\bn\/a\b|\bN\/A\b|\bNaN\b|\bundefined\b|\[object Object\]/;
/** Words that say the page is unfinished: it waits for something still to come. */
const UNFINISHED = /\b(?:not written yet|is written after the results|are answered after the results|still being read|being read now|no study on file|none on file|not on file|waits? for (?:the|its)|has no close after|no reading of the release|not read yet|to be written|placeholder|lorem ipsum)\b/i;
/** A sentence cut in the middle: ending on a word that cannot end one. */
const CUT_END = /\b(?:the|a|an|of|and|or|its|their|than)\s*[.:]?\s*$/i;
/** Longer than a slide line is read in one go. */
export const BLOB_CHARS = 240;

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** A value worth drawing. */
export const shown = (s: string | null | undefined): s is string => typeof s === "string" && s.trim() !== "" && !EMPTY_VALUE.test(s) && !MISSING_WORDS.test(s);

/**
 * A long paragraph as bullets: split at sentences, then at semicolons, each
 * whole; never cut with an ellipsis.
 */
export function splitBlob(text: string, max = BLOB_CHARS): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return [t];
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) out.push(s);
    else
      for (const part of s.split(/;\s+/)) {
        const p = part.trim().replace(/[;,]$/, "");
        if (p) out.push(/[.!?]$/.test(p) ? p : `${p}.`);
      }
  }
  return out.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

// ---------------------------------------------------------------------------
// Cleaning: what is not there is not drawn

const cleanTiles = (ts: Tile[]): Tile[] => ts.filter((t) => shown(t.value) && shown(t.label)).map((t) => ({ ...t, detail: shown(t.detail) ? t.detail : undefined }));
const cleanBullets = (bs: Bullet[]): Bullet[] => bs.flatMap((b) => (shown(b.text) ? splitBlob(b.text).map((text, i) => ({ ...b, text, tag: i === 0 ? b.tag : undefined })) : []));
const cleanLines = (ls: string[]): string[] => ls.filter(shown).flatMap((l) => splitBlob(l, BLOB_CHARS));

function cleanBlock(b: Block): Block | null {
  switch (b.kind) {
    case "tiles": {
      const tiles = cleanTiles(b.tiles);
      return tiles.length ? { ...b, tiles } : null;
    }
    case "bullets": {
      const items = cleanBullets(b.items);
      return items.length ? { ...b, items } : null;
    }
    case "cards": {
      const cards = b.cards.filter((c) => shown(c.head)).map((c) => ({ ...c, big: shown(c.big) ? c.big : undefined, lines: cleanLines(c.lines) })).filter((c) => c.big || c.lines.length);
      return cards.length ? { ...b, cards } : null;
    }
    case "bars": {
      const series = b.series.filter((s) => s.values.some(isNum));
      // A category with no value in any series is not drawn; the chart needs two values at least.
      const keep = b.cats.map((_, i) => series.some((s) => isNum(s.values[i])));
      const cats = b.cats.filter((_, i) => keep[i]);
      const out = series.map((s) => ({ ...s, values: s.values.filter((_, i) => keep[i]) }));
      const values = out.reduce((a, s) => a + s.values.filter(isNum).length, 0);
      return values >= 2 && cats.length ? { ...b, cats, series: out } : null;
    }
    case "line": {
      const series = b.series.filter((s) => s.points.filter((p) => isNum(p.value)).length >= 2);
      return series.length ? { ...b, series } : null;
    }
    case "flow":
      return b.flow.revenue > 0 && (b.flow.grossProfit !== null || b.flow.operatingIncome !== null || b.flow.sources.length >= 2) ? b : null;
    case "donut": {
      const parts = b.parts.filter((p) => isNum(p.value) && p.value > 0 && shown(p.name));
      return parts.length >= 2 ? { ...b, parts } : null;
    }
    case "scatter":
      return b.points.length >= 8 ? b : null;
    case "table": {
      // A row whose figures are all missing goes; a cell missing in a row that has others is left blank, never "n/a".
      const rows = b.rows
        .map((r) => ({ ...r, cells: r.cells.map((c, i) => (i === 0 ? c : shown(c) ? c : "")) }))
        .filter((r) => shown(r.cells[0]) && r.cells.slice(1).some((c) => c !== ""));
      if (!rows.length) return null;
      // A column empty in every row goes too.
      const keepCol = b.head.map((_, i) => i === 0 || rows.some((r) => r.cells[i] !== ""));
      return { ...b, head: b.head.filter((_, i) => keepCol[i]), rows: rows.map((r) => ({ ...r, status: r.status === undefined ? undefined : keepCol.slice(0, r.status).filter(Boolean).length, cells: r.cells.filter((_, i) => keepCol[i]) })) };
    }
    case "meters": {
      const items = b.items.filter((m) => isNum(m.now) && isNum(m.target) && shown(m.nowText));
      return items.length ? { ...b, items } : null;
    }
    case "quad": {
      const quads = b.quads.map((q) => ({ ...q, items: cleanLines(q.items) })).filter((q) => q.items.length);
      return quads.length >= 2 ? { ...b, quads } : null;
    }
    case "callout":
      return shown(b.text) ? b : null;
  }
}

/** The doc with nothing missing drawn: empty tiles, rows, series, charts and pages left out, long paragraphs split into bullets. */
export function cleanDoc(doc: ReportDoc): ReportDoc {
  const pages = doc.pages
    .map((p) => ({ ...p, blocks: p.blocks.map(cleanBlock).filter((b): b is Block => b !== null) }))
    .filter((p) => p.hero || p.blocks.length);
  // Each reason said once per figure.
  const seen = new Set<string>();
  const omitted = doc.omitted.filter((o) => {
    const k = `${o.what}|${o.why}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { ...doc, pages, omitted };
}

// ---------------------------------------------------------------------------
// The reviewer's first pass

export type DocFinding = {
  page: string;
  /** hold: the doc waits; fix: it was mended or left out. */
  kind: "hold" | "fix";
  problem: "missing" | "unfinished" | "cut" | "blob" | "repeat" | "empty";
  text: string;
};

/** Every string a page carries, with where it sits. */
export function pageTexts(p: Page): string[] {
  const out: string[] = [p.title];
  for (const b of p.blocks) {
    if (b.kind === "tiles") for (const t of b.tiles) out.push(`${t.label}: ${t.value}${t.detail ? ` (${t.detail})` : ""}`);
    else if (b.kind === "bullets") out.push(...(b.title ? [b.title] : []), ...b.items.map((i) => i.text));
    else if (b.kind === "cards") for (const c of b.cards) out.push(c.head, ...(c.big ? [c.big] : []), ...c.lines);
    else if (b.kind === "table") out.push(...b.rows.map((r) => r.cells.filter(Boolean).join(" | ")));
    else if (b.kind === "quad") for (const q of b.quads) out.push(...q.items);
    else if (b.kind === "callout") out.push(b.text);
    else if (b.kind === "flow") out.push(...flowLines(b.flow).map((l) => `${l.label}: ${l.value}${l.detail ? ` (${l.detail})` : ""}`));
    else if (b.kind === "meters") for (const m of b.items) out.push(`${m.label}: ${m.nowText} against ${m.targetText}${m.note ? `. ${m.note}` : ""}`);
    else if ("title" in b && b.title) out.push(b.title);
  }
  return out;
}

/** What a careful reader would stop at, page by page. The doc is cleaned first. */
export function checkDoc(doc: ReportDoc): DocFinding[] {
  const out: DocFinding[] = [];
  const count = new Map<string, number>();
  for (const p of doc.pages) {
    for (const t of pageTexts(p)) {
      if (MISSING_WORDS.test(t)) out.push({ page: p.key, kind: "fix", problem: "missing", text: t });
      if (UNFINISHED.test(t)) out.push({ page: p.key, kind: "hold", problem: "unfinished", text: t });
      if (t.length > 30 && CUT_END.test(t)) out.push({ page: p.key, kind: "fix", problem: "cut", text: t });
      if (t.length > BLOB_CHARS + 40) out.push({ page: p.key, kind: "fix", problem: "blob", text: t.slice(0, 120) });
      if (t.length > 40) count.set(t, (count.get(t) ?? 0) + 1);
    }
    for (const b of p.blocks) {
      if (b.kind === "bars" && !b.series.some((s) => s.values.some(isNum))) out.push({ page: p.key, kind: "fix", problem: "empty", text: b.title });
      if (b.kind === "line" && !b.series.length) out.push({ page: p.key, kind: "fix", problem: "empty", text: b.title });
    }
  }
  for (const [t, n] of count) if (n > 2) out.push({ page: "*", kind: "fix", problem: "repeat", text: t.slice(0, 120) });
  return out;
}

/**
 * The doc with the reviewer's leave-outs applied: every bullet, line, tile,
 * card or row whose words a finding quotes is taken out, then the doc is
 * cleaned again so an emptied block or page goes too.
 */
export function withoutTexts(doc: ReportDoc, quotes: readonly string[]): ReportDoc {
  const qs = quotes.map((q) => q.trim().toLowerCase()).filter((q) => q.length >= 12);
  if (!qs.length) return doc;
  const hit = (s: string | undefined) => !!s && qs.some((q) => s.toLowerCase().includes(q));
  const pages = doc.pages.map((p) => ({
    ...p,
    blocks: p.blocks.map((b): Block => {
      switch (b.kind) {
        case "bullets":
          return { ...b, items: b.items.filter((i) => !hit(i.text)) };
        case "cards":
          return { ...b, cards: b.cards.map((c) => ({ ...c, lines: c.lines.filter((l) => !hit(l)) })).filter((c) => !hit(c.head)) };
        case "tiles":
          return { ...b, tiles: b.tiles.filter((t) => !hit(t.value) && !hit(t.detail)) };
        case "table":
          return { ...b, rows: b.rows.filter((r) => !r.cells.some(hit)) };
        case "quad":
          return { ...b, quads: b.quads.map((q) => ({ ...q, items: q.items.filter((i) => !hit(i)) })) };
        case "callout":
          return hit(b.text) ? { ...b, text: "" } : b;
        default:
          return b;
      }
    }),
  }));
  return cleanDoc({ ...doc, pages });
}

/** The doc as plain text, page by page, for the model reviewer and for search. */
export function docText(doc: ReportDoc): string {
  return doc.pages.map((p, i) => [`--- Page ${i + 1} (${p.key}): ${p.kicker}`, ...pageTexts(p)].join("\n")).join("\n\n");
}
