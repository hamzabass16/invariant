import { flowLayout } from "@/lib/income-flow";
import { businessLines } from "@/lib/edgar-segments";
import { DCF_BASIS_LABEL } from "@/lib/dcf";
import type { DeckBrief } from "@/lib/deck-brief";
import { NOTE_FROM_WORDS } from "@/lib/flow-notes";
import { beatsOf, BEARING_WORD, CHANGE_WORD, RESULT_WORD, type GuidanceItem } from "@/lib/earnings-call";
import { figureChange, quarterWords, TIME_LABEL, type EarningsDetail, type EarningsReport, type SeriesTable } from "@/lib/earnings";
import { withoutRepeatedYear } from "@/lib/earnings-deck";
import { EARNINGS_DOC, FIELDS, STAGE } from "@/lib/ontology";
import { cleanDoc, type Block, type Bullet, type Card, type Omitted, type OmitReason, type Page, type ReportDoc, type Row, type Tile, type Tone } from "@/lib/report-doc";
import { longDate } from "@/lib/time";

/**
 * The earnings deck as a `ReportDoc` (Hamza, 4 Nov 2026: an HTML page and a
 * PDF in place of the PowerPoint, "more colourful ... minimalist ... concise",
 * no "n/a"): built from the kept report alone, every page a finding in one
 * sentence over charts, tiles and short bullets. A figure the report does not
 * hold is left out, never written as missing; what the filings left out is
 * said once at the end (`omittedOf`), with why: the company does not file it,
 * it means nothing (a multiple on a loss), or the filings carry it under a
 * name the app does not read yet, so a gap of the app's is never passed off
 * as the company's. The headline, the class and the kill signals are the
 * app's; the words on competition, the moats and the questions are the
 * brief's, written from the study. Pure.
 */

// ---------------------------------------------------------------------------
// Words and numbers

const compact = <T,>(xs: (T | null | undefined | false)[]): T[] => xs.filter((x): x is T => !!x);
const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const pts = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`;
const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
const times = (v: number) => `${v.toFixed(v >= 100 ? 0 : 1)}x`;
const num = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const prefixOf = (cur: string | null | undefined) => (!cur || cur.toUpperCase() === "USD" ? "$" : `${cur.toUpperCase()} `);
function money(v: number, cur: string | null | undefined): string {
  const a = Math.abs(v);
  const s = a >= 1e12 ? `${(a / 1e12).toFixed(2)}tn` : a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e11 ? 0 : 1)}bn` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(2);
  return `${v < 0 ? "-" : ""}${prefixOf(cur)}${s.replace(/\.0(?=[a-z])/, "")}`;
}
const perShare = (v: number, cur: string | null | undefined) => `${prefixOf(cur)}${num(v)}`;
/** A part of the thesis named short: a long watch item by its first clause ("K2: net debt above 1.0x AFF"). */
const targetLabel = (t: string) => {
  if (t === "pathway") return "The pathway";
  if (t.length <= 48) return t;
  const first = t.split(/;\s*/)[0].trim();
  return first.length <= 60 ? first : first.split(/,\s|\s\(/)[0].trim();
};
/** Text kept cut at a length, ended at its last whole sentence. */
const wholeSentences = (s: string) => {
  const t = s.trim();
  if (/[.!?)"”]$/.test(t)) return t;
  const end = Math.max(t.lastIndexOf(". "), t.lastIndexOf("; "));
  return end > 40 ? `${t.slice(0, end)}.` : t;
};
const sentence = (s: string) => {
  const t = s.trim();
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}` : t;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** The calendar quarter the results are for, "Q3 2026", from the quarter's last month ("Sep/2026"). */
function quarterOf(r: EarningsReport): string {
  const m = r.quarter ? /^([A-Za-z]{3})\/(\d{4})$/.exec(r.quarter) : null;
  const mon = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (m && mon >= 0) return `Q${Math.floor(mon / 3) + 1} ${m[2]}`;
  return r.quarter ? (quarterWords(r.quarter) ?? r.quarter) : "Results";
}
const killsOf = (r: EarningsReport) => r.triggers.filter((t) => t.kind === "kill");
const killsMet = (r: EarningsReport) => killsOf(r).filter((t) => t.met).length;
const owed = (r: EarningsReport) => /decision is owed/.test(r.headline);
const row = (t: SeriesTable | null | undefined, key: string) => t?.rows.find((x) => x.key === key) ?? null;
const fundamental = (d: EarningsDetail | null, k: string): number | null => (isNum(d?.fundamentals[k]) ? d!.fundamentals[k]! : null);
const colLabel = (c: string) => (/^\d{4}$/.test(c) ? `FY${c.slice(2)}` : /^FY\d{4}$/.test(c) ? `FY${c.slice(4)}` : /^TTM/.test(c) ? "TTM" : c);
const toneOf = (v: number | null, goodUp = true): Tone | undefined => (v === null ? undefined : v === 0 ? "muted" : (v > 0) === goodUp ? "up" : "down");
const figureTone = (f: EarningsReport["figures"][number]): Tone | undefined => {
  const c = figureChange(f);
  return !c ? undefined : c.up === null ? "muted" : c.up ? "up" : "down";
};

/** The report's standing: red when a kill signal is met, amber when a decision is owed. */
export function docTone(r: EarningsReport): ReportDoc["tone"] {
  if (killsMet(r)) return "danger";
  if (owed(r)) return "warn";
  return "ok";
}

const briefOf = (d: EarningsDetail | null): DeckBrief | null => d?.brief ?? null;
const figure = (r: EarningsReport, re: RegExp) => r.figures.find((f) => re.test(f.label)) ?? null;

// ---------------------------------------------------------------------------
// What the filings left out, and why

/** A field's name as the person reads it. */
const fieldLabel = (id: string): string => (FIELDS as Record<string, { label: string } | undefined>)[id]?.label ?? id.replace(/_pct$/, "").replace(/_/g, " ");

/** Why a figure was not drawn, from the reader's own note: the app's gap when the filings carry a concept it does not read. */
export function omitReasonOf(note: string): OmitReason {
  if (/does not read yet|not read by the app|under a name the app/i.test(note)) return "not_read";
  if (/not positive|unbounded|too close to zero|is zero|no price|net interest is income|debt is zero|another currency|no rate|no path|not meaningful/i.test(note)) return "not_meaningful";
  return "not_reported";
}

/** The fields the deck draws, so the note names only what a reader would miss. */
const DRAWN_FIELDS = ["revenue_growth_pct", "gross_margin_pct", "operating_margin_pct", "operating_margin_change_pts", "fcf_margin_pct", "fcf_conversion", "roic_pct", "net_debt", "net_debt_to_ebitda", "interest_cover", "eps_growth_pct", "fcf_per_share_growth_pct", "pe_ratio", "forward_pe", "implied_growth_pct", "dividend_yield_pct", "payout_ratio_pct", "capital_returned_pct"];

/** The end note's lines: each figure the deck would draw that the filings did not give, once, with its reason in a few words. */
export function omittedOf(d: EarningsDetail | null): Omitted[] {
  const out: Omitted[] = [];
  for (const n of d?.fundamentalsNotes ?? []) {
    const m = /^([a-z0-9_]+):\s*(.+)$/.exec(n.trim());
    if (!m || !DRAWN_FIELDS.includes(m[1]) || isNum(d?.fundamentals[m[1]])) continue;
    if (out.some((o) => o.what === fieldLabel(m[1]))) continue;
    out.push({ what: fieldLabel(m[1]), why: omitReasonOf(m[2]), note: sentence(m[2].replace(/\s*;\s*see [a-z_]+$/, "")) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pages

type Ctx = { r: EarningsReport; d: EarningsDetail | null; methodology: string | null };

const refFiling = (r: EarningsReport) => [r.filing ? `${r.filing.form} filed ${longDate(r.filing.filed)}` : null, r.release ? `${r.release.form} filed ${longDate(r.release.filed)}` : null].filter(Boolean).join(", ") || "SEC filings";

function cover({ r, d, methodology }: Ctx): Page {
  const rev = figure(r, /^Revenue/);
  const eps = figure(r, /EPS/);
  const crit = d?.criteria;
  const v = r.valuation;
  const gap = v && isNum(v.price) ? ((v.price - v.base) / v.base) * 100 : null;
  const move = r.reaction?.movePct ?? null;
  const tiles: Tile[] = compact<Tile>([
    rev ? { label: "Revenue", value: rev.now, detail: figureChange(rev) ? `${figureChange(rev)!.text} on a year` : undefined, tone: figureTone(rev) } : null,
    eps ? { label: eps.label, value: eps.now, detail: figureChange(eps) ? `${figureChange(eps)!.text} on a year` : undefined, tone: figureTone(eps) } : null,
    isNum(move) ? { label: "Stock on the results", value: signed(move), detail: r.reaction?.benchmark && isNum(r.reaction.benchmarkPct) ? `${r.reaction.benchmark} ${signed(r.reaction.benchmarkPct)}` : undefined, tone: toneOf(move) } : null,
    { label: "Class", value: r.classNow ?? "None holds", detail: crit ? `${crit.passes} of ${crit.of} criteria` : undefined, tone: r.classNow ? "accent" : "warn" },
    killsOf(r).length ? { label: "Kill signals", value: killsMet(r) ? `${killsMet(r)} met` : "None met", detail: `of ${killsOf(r).length} on the record`, tone: killsMet(r) ? "down" : "up" } : null,
    gap !== null ? { label: "Price against your base", value: signed(gap, 0), detail: `${perShare(v!.price!, r.currency)} against ${perShare(v!.base, r.currency)}`, tone: gap > 0 ? "warn" : "up" } : null,
  ]);
  const from = [refFiling(r), methodology ? `${methodology}'s tests` : null, r.call ? "the call" : null, d?.study ? "the study on Research" : null].filter(Boolean).join(" · ");
  return { key: "cover", kicker: `${r.symbol} · ${quarterOf(r)} · reported ${longDate(r.date)}, ${TIME_LABEL[r.time].toLowerCase()}`, title: sentence(r.headline), ref: from, hero: true, blocks: [{ kind: "tiles", tiles: tiles.slice(0, 6) }] };
}

function review({ d }: Ctx): Page | null {
  const b = briefOf(d)?.review;
  if (!b || !(b.news.length || b.held.length || b.changed.length)) return null;
  const cards: Card[] = [
    { head: "New this quarter", lines: b.news, tone: "accent" },
    { head: "What it bore out", lines: b.held, tone: "up" },
    { head: "What it changes", lines: b.changed, tone: b.changed.length ? "warn" : "muted" },
  ];
  return { key: "review", kicker: "Against the study", title: sentence(b.headline ?? b.news[0] ?? "What the quarter adds to the study."), ref: d?.study ? `the study of ${longDate(d.study.finishedAt.slice(0, 10))}, read through this quarter` : undefined, blocks: [{ kind: "cards", cards }] };
}

function results({ r, d }: Ctx): Page | null {
  const q = d?.quarters;
  const blocks: Block[] = [];
  // The lines the flow carries are drawn there (Hamza, 5 Nov 2026); the rest stay as tiles.
  const inFlow = d?.flow ? /^(Revenue|Gross margin|Gross profit|Operating income|Operating margin|Net income)$/ : null;
  const tiles: Tile[] = r.figures.filter((f) => !inFlow?.test(f.label)).slice(0, 6).map((f) => ({ label: f.label, value: f.now, detail: [figureChange(f) ? `${figureChange(f)!.text} on a year` : null, f.prior ? `${f.prior} the quarter before` : null].filter(Boolean).join(" · ") || (f.before ? `${f.before} a year before` : undefined), tone: figureTone(f) }));
  if (tiles.length) blocks.push({ kind: "tiles", tiles });
  if (q) {
    const cats = q.cols.slice(-8);
    const take = (k: string) => (row(q, k)?.values ?? []).slice(-8);
    blocks.push({ kind: "bars", title: `Revenue by quarter${r.currency ? `, ${r.currency}` : ""}`, cats, series: [{ name: "Revenue", values: take("revenue") }], unit: "money", currency: r.currency, labels: true });
    const margins = [{ name: "Gross margin", values: take("grossMarginPct") }, { name: "Operating margin", values: take("operatingMarginPct") }];
    blocks.push({ kind: "bars", title: "Margins by quarter", cats, series: margins, unit: "pct" });
  }
  if (!blocks.length) return null;
  const rev = figure(r, /^Revenue/);
  const om = (row(q, "operatingMarginPct")?.values ?? []).filter(isNum);
  const title = rev
    ? `Revenue ${rev.now}${isNum(rev.changePct) ? `, ${signed(rev.changePct)} on a year` : ""}${om.length >= 2 ? `; operating margin ${marginMove(om.at(-1)! - om.at(-2)!)} on the quarter before` : ""}.`
    : "The quarter in the filings' figures.";
  return { key: "results", kicker: "The quarter", title, ref: `${refFiling(r)}${r.figuresFrom === "release" ? ", figures as the release printed them" : ""}`, split: blocks.length > 2, blocks };
}

/** The quarter's income statement as a flow (Hamza, 5 Nov 2026): the segments, revenue, gross profit, operating income and net income, with every cost on its way. */
function flowPage({ r, d }: Ctx): Page | null {
  const f = d?.flow;
  if (!f) return null;
  const pctOf = (v: number | null) => (v !== null ? `${((v / f.revenue) * 100).toFixed(1)}%` : null);
  const om = f.operatingIncome !== null && f.operatingIncome > 0 ? pctOf(f.operatingIncome) : null;
  const nm = f.netIncome !== null && f.netIncome > 0 ? pctOf(f.netIncome) : null;
  const title = om ? `${om} of revenue was left as operating income${nm ? ` and ${nm} as net income` : ""}.` : "Where the quarter's revenue went.";
  const words = flowLayout(f, 760).words;
  const blocks: Block[] = [{ kind: "flow", title: `${f.label}${f.currency ? `, ${f.currency}` : ""}`, flow: f }];
  if (words.length) blocks.push({ kind: "callout", text: words.join(" "), tone: "warn" });
  return { key: "flow", kicker: "Where the revenue went", title, ref: f.from === "release" ? "the results release, as printed" : refFiling(r), blocks };
}

/** What lies behind the flow's lines (lib/flow-notes.ts; Hamza, 5 Nov 2026): why the company spends what it does and where the money goes, each with where it came from. */
function flowNotesPage({ d }: Ctx): Page | null {
  const n = d?.flowNotes;
  if (!d?.flow || !n?.notes.length) return null;
  // Their pages are listed with the report's sources; the tag says where each came from.
  const cards: Card[] = n.notes.map((x) => ({ head: x.line, tag: NOTE_FROM_WORDS[x.from], lines: [x.why, x.where ? `Where it goes: ${x.where}` : null, x.said ? `\u201c${x.said}\u201d` : null].filter((l): l is string => !!l) }));
  const froms = [...new Set(n.notes.map((x) => x.from))].map((f) => ({ release: "the release", call: "the call", web: "the web" })[f]);
  return { key: "flow_notes", kicker: "Behind the lines", title: `Why the company spends what it does, from ${froms.length > 1 ? `${froms.slice(0, -1).join(", ")} and ${froms.at(-1)}` : froms[0]}.`, ref: "the release, the call and the pages in Sources", blocks: [{ kind: "cards", cards }] };
}

function kpis({ r, d }: Ctx): Page | null {
  const blocks: Block[] = [];
  const kpis = d?.kpis ?? [];
  if (kpis.length) {
    const fmt = (v: number | null) => (isNum(v) ? num(v, Math.abs(v) >= 100 ? 0 : 2) : "");
    blocks.push({
      kind: "table",
      head: ["Measure", quarterOf(r), "Quarter before", "Year before", "On a year"],
      rows: kpis.map((k) => {
        const chg = isNum(k.now) && isNum(k.yearBefore) && k.yearBefore > 0 ? ((k.now - k.yearBefore) / k.yearBefore) * 100 : null;
        return { cells: [`${k.name}${k.unit ? ` (${k.unit})` : ""}`, fmt(k.now), fmt(k.quarterBefore), fmt(k.yearBefore), chg === null ? "" : signed(chg)], tone: toneOf(chg), status: 4 };
      }),
    });
  }
  if (!blocks.length) return null;
  const k = (d?.kpis ?? []).find((x) => isNum(x.now) && isNum(x.yearBefore) && x.yearBefore! > 0);
  const chg = k ? ((k.now! - k.yearBefore!) / k.yearBefore!) * 100 : null;
  return { key: "kpis", kicker: "The company's own measures", title: k && isNum(chg) ? `${k.name} ${num(k.now!, Math.abs(k.now!) >= 100 ? 0 : 2)}${k.unit ? ` ${k.unit}` : ""}, ${signed(chg)} on a year.` : "The measures the company reports itself.", ref: "the results release, as printed", blocks };
}

function beats({ r }: Ctx): Page | null {
  const bs = beatsOf(r);
  if (!bs.length) return null;
  const n = (k: "beat" | "miss" | "inline") => bs.filter((b) => b.result === k).length;
  const rows: Row[] = bs.map((b) => ({ cells: [b.line, b.actual, b.expected, b.against === "consensus" ? "Analysts" : "Guidance", RESULT_WORD[b.result], b.by ?? ""], tone: b.result === "beat" ? "up" : b.result === "miss" ? "down" : "muted", status: 4 }));
  return {
    key: "beats",
    kicker: "Against what was expected",
    title: `${plural(n("beat"), "beat")}, ${plural(n("miss"), "miss", "misses")} and ${n("inline")} in line.`,
    ref: bs.some((b) => b.app) ? "the call as read; Nasdaq's consensus EPS against the filed diluted EPS" : "the call as read",
    blocks: [
      { kind: "tiles", tiles: [{ label: "Beat", value: String(n("beat")), tone: "up" }, { label: "Missed", value: String(n("miss")), tone: n("miss") ? "down" : "muted" }, { label: "In line", value: String(n("inline")), tone: "muted" }] },
      { kind: "table", head: ["Line", "Reported", "Expected", "Against", "Result", "By"], rows },
    ],
  };
}

function reaction({ r }: Ctx): Page | null {
  const x = r.reaction;
  if (!x) return null;
  const tiles: Tile[] = compact<Tile>([
    { label: r.symbol, value: signed(x.movePct), detail: `${num(x.from.close)} to ${num(x.to.close)}`, tone: toneOf(x.movePct) },
    x.benchmark && isNum(x.benchmarkPct) ? { label: x.benchmark, value: signed(x.benchmarkPct), detail: "the same session", tone: toneOf(x.benchmarkPct) } : null,
    x.benchmark && isNum(x.benchmarkPct) ? { label: "Against the market", value: pts(x.movePct - x.benchmarkPct), tone: toneOf(x.movePct - x.benchmarkPct) } : null,
    r.expectedMove ? { label: "Options priced", value: `±${pct(r.expectedMove.pct)}`, detail: Math.abs(x.movePct) > r.expectedMove.pct ? "moved more than priced" : "moved less than priced", tone: "gilt" } : null,
  ]);
  const why: Bullet[] = [...(x.why ? [{ text: x.why }] : []), ...x.points.map((p) => ({ text: p.line, tag: p.source.title }))];
  return {
    key: "reaction",
    kicker: "How the stock took it",
    title: `${r.symbol} ${x.movePct >= 0 ? "rose" : "fell"} ${Math.abs(x.movePct).toFixed(1)}% on ${longDate(x.session)}, the first session to trade on the results${x.benchmark && isNum(x.benchmarkPct) ? `, against ${signed(x.benchmarkPct)} for ${x.benchmark}` : ""}.`,
    ref: `closes ${longDate(x.from.date)} and ${longDate(x.to.date)}${x.points.length ? "; the day's pages" : ""}`,
    blocks: [{ kind: "tiles", tiles }, { kind: "bullets", title: "Why, from the day's pages", items: why }],
  };
}

function highlights({ r }: Ctx): Page | null {
  const c = r.commentary;
  if (!c) return null;
  const blocks: Block[] = [{ kind: "bullets", items: [{ text: c.summary }, ...c.points.map((p) => ({ text: p.line, tag: p.source.title }))] }];
  if (c.unexpected.length) blocks.push({ kind: "cards", title: "What investors did not expect, and why", cards: c.unexpected.map((u) => ({ head: u.what, lines: [u.why], tone: "gilt" as Tone })) });
  return { key: "highlights", kicker: "What the release and the call said", title: sentence(c.points[0]?.line ?? c.summary), ref: "the release and the call, each point with its page", split: c.unexpected.length > 0, blocks };
}

const changeTone = (g: GuidanceItem): Tone | undefined => (g.change === "raised" ? "up" : g.change === "lowered" || g.change === "withdrawn" ? "down" : g.change === "new" ? "accent" : undefined);

function guidance({ r }: Ctx): Page | null {
  const g = r.call?.guidance ?? [];
  if (!g.length) return null;
  // A "before" that only says the earlier figure is not known is no figure.
  const beforeOf = (x: GuidanceItem) => (x.before && !/not on file|not given|not known|unknown/i.test(x.before) ? x.before : null);
  const rows: Row[] = g.map((x) => ({ cells: [x.metric, x.period ?? "", x.said, beforeOf(x) ?? "", x.change ? CHANGE_WORD[x.change] : ""], tone: changeTone(x), status: 4 }));
  const against = g.filter((x) => x.bearsOn && x.reading && x.reading !== "neutral");
  const long = g.some((x) => x.said.length > 90 || (x.before ?? "").length > 90);
  const blocks: Block[] = [
    long
      ? { kind: "cards", cards: g.map((x) => ({ head: x.metric, tag: [x.period, x.change ? CHANGE_WORD[x.change] : null].filter(Boolean).join(" · ") || undefined, lines: [x.said, ...(beforeOf(x) ? [`Before: ${beforeOf(x)}`] : [])], tone: changeTone(x) })) }
      : { kind: "table", head: ["What", "For", "Guided", "Before", "Change"], rows },
  ];
  // One card per part of the thesis and the way it bears, so a watch item several lines touch is named once (CVE, 4 Nov 2026).
  const groups = new Map<string, typeof against>();
  for (const x of against) groups.set(`${x.bearsOn}|${x.reading}`, [...(groups.get(`${x.bearsOn}|${x.reading}`) ?? []), x]);
  if (against.length) blocks.push({ kind: "cards", title: "Against the thesis", cards: [...groups.values()].map((xs) => ({ head: targetLabel(xs[0].bearsOn!), tag: BEARING_WORD[xs[0].reading!], lines: [...xs.slice(0, 3).map((x) => `${x.metric}: ${sentence(x.said)}`), ...(xs.length === 1 && xs[0].why ? [xs[0].why] : [])], tone: xs[0].reading === "supports" ? ("up" as Tone) : ("down" as Tone) })) });
  const raised = g.filter((x) => x.change === "raised").length;
  const lowered = g.filter((x) => x.change === "lowered" || x.change === "withdrawn").length;
  const head = g[0];
  return {
    key: "guidance",
    kicker: "Guidance",
    title: head.said.length <= 70 ? `${raised || lowered ? `${plural(raised, "item")} raised and ${lowered} lowered; ` : ""}${raised || lowered ? head.metric.toLowerCase() : head.metric} ${head.period ? `for ${head.period} ` : ""}guided at ${head.said.replace(/\.$/, "")}.` : `${plural(g.length, "item")} guided${raised || lowered ? `, ${raised} raised and ${lowered} lowered` : ""}; ${head.metric.toLowerCase()} first.`,
    ref: "the release, the slides and the call",
    blocks,
  };
}

function call({ r }: Ctx): Page | null {
  const c = r.call;
  if (!c || !(c.remarks.length || c.qa.length)) return null;
  const blocks: Block[] = [];
  if (c.remarks.length) blocks.push({ kind: "bullets", title: "Prepared remarks", items: c.remarks.map((t) => ({ text: t })) });
  if (c.qa.length)
    blocks.push({
      kind: "cards",
      title: "The analysts' questions",
      cards: c.qa.slice(0, 6).map((q) => ({ head: q.analyst, tag: q.reading && q.reading !== "neutral" ? BEARING_WORD[q.reading] : undefined, lines: [`Q: ${q.asked}`, `A: ${q.answered}`], tone: q.reading === "challenges" ? ("down" as Tone) : q.reading === "supports" ? ("up" as Tone) : ("muted" as Tone) })),
    });
  const challenged = c.qa.filter((q) => q.reading === "challenges").length;
  return {
    key: "call",
    kicker: "The call",
    title: c.qa.length ? `${plural(c.qa.length, "analyst question")}${challenged ? `, ${challenged} bearing against the thesis` : ""}.` : sentence(c.remarks[0]),
    ref: c.source || "the call",
    split: !!(c.remarks.length && c.qa.length),
    blocks,
  };
}

function business({ r, d }: Ctx): Page | null {
  // One split of what it sells, never places beside it: the geography has its own donut (Hamza, 5 Nov 2026).
  const split = businessLines(d?.segments?.lines ?? []);
  const seg = (split?.lines ?? []).filter((l) => !l.excluded && l.value > 0).sort((a, b) => b.value - a.value);
  const geo = (d?.geography?.lines ?? []).filter((l) => l.sharePct > 0).sort((a, b) => b.sharePct - a.sharePct);
  const blocks: Block[] = [];
  if (seg.length >= 2)
    blocks.push({ kind: "table", title: `Revenue by ${split!.kind === "segment" ? "segment" : split!.kind === "product" ? "product" : "line"}, ${d!.segments!.period}`, head: ["Line", "Revenue", "Share", "On a year"], rows: seg.slice(0, 10).map((l) => ({ cells: [l.name, money(l.value, r.currency), isNum(l.sharePct) ? pct(l.sharePct, 0) : "", isNum(l.growthPct) ? signed(l.growthPct) : ""], tone: toneOf(l.growthPct), status: 3 })) });
  if (geo.length >= 2) {
    const top = geo.slice(0, 5);
    const rest = geo.slice(5).reduce((s, l) => s + l.sharePct, 0);
    blocks.push({ kind: "donut", title: `Revenue by region, ${d!.geography!.period}`, parts: [...top.map((l) => ({ name: l.name, value: l.sharePct, text: pct(l.sharePct, 0) })), ...(rest > 0 ? [{ name: "Other", value: rest, text: pct(rest, 0) }] : [])] });
  }
  const e = d?.engine;
  if (e?.line && (isNum(e.growthPct) || isNum(e.sharePct)))
    blocks.unshift({ kind: "tiles", tiles: [{ label: "The engine", value: e.line, tone: "accent" }, ...(isNum(e.growthPct) ? [{ label: "Its growth", value: signed(e.growthPct), tone: toneOf(e.growthPct) }] : []), ...(isNum(e.sharePct) ? [{ label: "Its share of revenue", value: pct(e.sharePct, 0) }] : [])] });
  if (!blocks.length) return null;
  const lead = seg[0];
  return {
    key: "business",
    kicker: "How it makes money",
    title: e?.line && isNum(e.growthPct) ? `${e.line} is the engine, growing ${signed(e.growthPct)}${isNum(e.sharePct) ? ` at ${pct(e.sharePct, 0)} of revenue` : ""}.` : lead && isNum(lead.sharePct) ? `${lead.name} is ${pct(lead.sharePct, 0)} of revenue${geo[0] ? `; ${geo[0].name} the largest region at ${pct(geo[0].sharePct, 0)}` : ""}.` : geo[0] ? `${geo[0].name} is the largest region at ${pct(geo[0].sharePct, 0)} of revenue.` : "How the revenue splits.",
    ref: [d?.segments ? `${d.segments.form} segment note` : null, d?.geography ? `${d.geography.form} revenue by geography` : null].filter(Boolean).join("; "),
    split: blocks.length > 2,
    blocks,
  };
}

function record({ r, d }: Ctx): Page | null {
  const t = d?.years;
  if (!t || t.cols.length < 2) return null;
  const cats = t.cols.map(colLabel);
  const series = (["revenue", "operatingIncome", "fcf"] as const).map((k) => ({ name: row(t, k)?.label.replace(/ \(.*\)$/, "") ?? k, values: row(t, k)?.values ?? [] })).filter((s) => s.values.some(isNum));
  const blocks: Block[] = [];
  if (series.length) blocks.push({ kind: "bars", title: `Revenue, operating income and free cash flow${r.currency ? `, ${r.currency}` : ""}`, cats, series, unit: "money", currency: r.currency });
  const eps = row(t, "epsDiluted");
  if (eps && eps.values.filter(isNum).length >= 2) blocks.push({ kind: "bars", title: "Diluted EPS", cats, series: [{ name: "EPS", values: eps.values }], unit: "plain", labels: true });
  const growth = fundamental(d, "revenue_growth_pct");
  const epsG = fundamental(d, "eps_growth_pct");
  const fpsG = fundamental(d, "fcf_per_share_growth_pct");
  const revs = (row(t, "revenue")?.values ?? []).map((v, i) => [v, i] as const).filter(([v]) => isNum(v) && v! > 0);
  const cagr = revs.length >= 3 ? (Math.pow(revs.at(-1)![0]! / revs[0][0]!, 1 / (revs.at(-1)![1] - revs[0][1])) - 1) * 100 : null;
  const tiles: Tile[] = compact<Tile>([
    isNum(cagr) ? { label: `Revenue a year, ${colLabel(t.cols[revs[0][1]])} on`, value: signed(cagr), tone: toneOf(cagr) } : null,
    isNum(growth) ? { label: "Revenue, trailing year", value: signed(growth), tone: toneOf(growth) } : null,
    isNum(epsG) ? { label: "EPS, trailing year", value: signed(epsG), tone: toneOf(epsG) } : null,
    isNum(fpsG) && Math.abs(fpsG) <= 300 ? { label: "FCF per share, trailing year", value: signed(fpsG), tone: toneOf(fpsG) } : null,
  ]);
  if (tiles.length) blocks.unshift({ kind: "tiles", tiles });
  if (!series.length) return null;
  return { key: "record", kicker: "The record", split: blocks.length > 2, title: isNum(cagr) ? `Revenue grew ${signed(cagr)} a year over the filed years${isNum(growth) ? `, ${signed(growth)} over the trailing year` : ""}.` : "The filed years.", ref: "SEC company facts, fiscal years and the trailing twelve months", blocks };
}

function profit({ d }: Ctx): Page | null {
  const t = d?.years;
  const blocks: Block[] = [];
  const tiles: Tile[] = compact<Tile>(
    [
      ["gross_margin_pct", "Gross margin"],
      ["operating_margin_pct", "Operating margin"],
      ["fcf_margin_pct", "FCF margin"],
      ["roic_pct", "Return on invested capital"],
    ].map(([k, label]) => (isNum(fundamental(d, k)) ? { label, value: pct(fundamental(d, k)!), tone: "accent" as Tone } : null)),
  );
  const conv = fundamental(d, "fcf_conversion");
  if (isNum(conv)) tiles.push({ label: "Cash conversion", value: times(conv), detail: "free cash flow over net income", tone: conv >= 0.9 ? "up" : "warn" });
  const omChg = fundamental(d, "operating_margin_change_pts");
  if (isNum(omChg)) tiles.push({ label: "Operating margin on a year", value: pts(omChg), tone: toneOf(omChg) });
  if (tiles.length) blocks.push({ kind: "tiles", tiles: tiles.slice(0, 6) });
  if (t && t.cols.length >= 2) {
    const cats = t.cols.map(colLabel);
    const margins = (["grossMarginPct", "operatingMarginPct", "fcfMarginPct"] as const).map((k) => ({ name: row(t, k)?.label.replace(/ \(.*\)$/, "") ?? k, values: row(t, k)?.values ?? [] })).filter((s) => s.values.filter(isNum).length >= 2);
    if (margins.length) blocks.push({ kind: "bars", title: "Margins by year", cats, series: margins, unit: "pct" });
    const sbc = row(t, "sbc");
    const rev = row(t, "revenue");
    if (sbc && rev) {
      const share = sbc.values.map((v, i) => (isNum(v) && isNum(rev.values[i]) && rev.values[i]! > 0 ? (v / rev.values[i]!) * 100 : null));
      if (share.filter(isNum).length >= 2) blocks.push({ kind: "bars", title: "Share-based pay, % of revenue", cats, series: [{ name: "Share-based pay", values: share }], unit: "pct", labels: true });
    }
  }
  if (!blocks.length) return null;
  const om = fundamental(d, "operating_margin_pct");
  const roic = fundamental(d, "roic_pct");
  const title = isNum(om) || isNum(roic) ? `${isNum(om) ? `Operating margin ${pct(om)}` : ""}${isNum(om) && isNum(roic) ? " and " : ""}${isNum(roic) ? `ROIC ${pct(roic)}` : ""} over the trailing year${isNum(omChg) ? `, the margin ${omChg >= 0 ? "up" : "down"} ${Math.abs(omChg).toFixed(1)} pts` : ""}.` : "Profit and cash by year.";
  return { key: "profit", kicker: "Profit and cash", title: sentence(title), ref: "SEC company facts; ROIC is operating income after a 21% tax over equity and debt less cash", split: blocks.length > 2, blocks };

}

function competition({ d }: Ctx): Page | null {
  const c = briefOf(d)?.competition;
  const v = briefOf(d)?.voices;
  const blocks: Block[] = [];
  if (c?.rivals.length) blocks.push({ kind: "cards", cards: c.rivals.map((x) => ({ head: x.name, lines: [x.competesOn, x.position] })) });
  if (c?.points.length) blocks.push({ kind: "bullets", title: "What decides it", items: c.points.map((t) => ({ text: t })) });
  if (v && (v.customers.length || v.staff.length)) blocks.push({ kind: "quad", quads: [{ head: "Customers", items: v.customers, tone: "accent" }, { head: "Staff", items: v.staff, tone: "gilt" }].filter((q) => q.items.length) as { head: string; items: string[]; tone: Tone }[] });
  if (!blocks.length) return null;
  return { key: "competition", kicker: "Competition", title: sentence(c?.headline ?? v?.headline ?? "Who it competes with, and how it stands."), ref: "the study and the pages it read", blocks };
}

function moats({ d }: Ctx): Page | null {
  const m = briefOf(d)?.moats;
  if (!m?.pillars.length) return null;
  const level = { strong: 3, moderate: 2, weak: 1, none: 0 } as const;
  return {
    key: "moats",
    kicker: "The moats",
    title: sentence(m.headline ?? `${m.pillars[0].name} is the strongest moat.`),
    ref: "the study",
    blocks: [{ kind: "cards", cards: m.pillars.map((p) => ({ head: p.name, tag: p.strength.charAt(0).toUpperCase() + p.strength.slice(1), lines: [p.evidence], tone: (["muted", "warn", "accent", "up"] as const)[level[p.strength]] })) }],
  };
}

function swot({ d }: Ctx): Page | null {
  const s = briefOf(d)?.swot;
  if (!s || !(s.strengths.length + s.weaknesses.length + s.opportunities.length + s.threats.length)) return null;
  return {
    key: "swot",
    kicker: "Strengths, weaknesses, opportunities, threats",
    title: sentence(s.strengths[0] ?? s.opportunities[0] ?? "The SWOT."),
    ref: "the study, read through this quarter",
    blocks: [{ kind: "quad", quads: [{ head: "Strengths", items: s.strengths, tone: "up" }, { head: "Weaknesses", items: s.weaknesses, tone: "warn" }, { head: "Opportunities", items: s.opportunities, tone: "accent" }, { head: "Threats", items: s.threats, tone: "down" }] }],
  };
}

function capital({ r, d }: Ctx): Page | null {
  const b = briefOf(d)?.capital;
  const t = d?.years;
  const blocks: Block[] = [];
  if (t && t.cols.length >= 2) {
    const cats = t.cols.map(colLabel);
    const series = (["capex", "buybacks", "dividendsPaid", "acquisitions"] as const).map((k) => ({ name: row(t, k)?.label ?? k, values: (row(t, k)?.values ?? []).map((v) => (isNum(v) ? Math.abs(v) : null)) })).filter((s) => s.values.filter(isNum).some((v) => v > 0));
    if (series.length) blocks.push({ kind: "bars", title: `Where the cash went${r.currency ? `, ${r.currency}` : ""}`, cats, series, unit: "money", currency: r.currency, stacked: true });
  }
  const nd = fundamental(d, "net_debt");
  const ret = fundamental(d, "capital_returned_pct");
  const lev = fundamental(d, "net_debt_to_ebitda");
  const tiles: Tile[] = compact<Tile>([
    isNum(nd) ? { label: nd <= 0 ? "Net cash" : "Net debt", value: money(Math.abs(nd), r.currency), tone: nd <= 0 ? ("up" as Tone) : ("muted" as Tone) } : null,
    isNum(lev) && isNum(nd) && nd > 0 ? { label: "Net debt to EBITDA", value: times(lev), tone: lev > 3 ? ("down" as Tone) : ("muted" as Tone) } : null,
    isNum(ret) ? { label: "Free cash flow returned", value: pct(ret, 0), detail: "buybacks and dividends", tone: "accent" as Tone } : null,
  ]);
  if (tiles.length) blocks.unshift({ kind: "tiles", tiles });
  if (b?.points.length) blocks.push({ kind: "bullets", items: b.points.map((text) => ({ text })) });
  if (!blocks.length) return null;
  return { key: "capital", kicker: "Capital allocation", title: sentence(b?.headline ?? (isNum(ret) ? `${pct(ret, 0)} of free cash flow went back to shareholders over the trailing year.` : "Where the cash went.")), ref: "SEC company facts; the study", split: !!b?.points.length && blocks.length > 2, blocks };
}

function valuation({ r, d }: Ctx): Page | null {
  const blocks: Block[] = [];
  const h = d?.history;
  if (h && h.points.filter((p) => isNum(p.value)).length >= 8)
    blocks.push({ kind: "line", title: `${h.label} over five years`, series: [{ name: h.label, points: h.points }], unit: "x", refs: isNum(h.median) ? [{ value: h.median, label: `Median ${times(h.median)}` }] : [] });
  const peers = d?.peers;
  if (peers?.rows.length) {
    const fmt = (v: number | null) => (isNum(v) ? times(v) : "");
    blocks.push({ kind: "table", title: `Against its peers${peers.sector ? ` and ${peers.sector}` : ""}`, head: ["Multiple", r.symbol, "Peers' median", "Sector"], rows: peers.rows.map((x) => ({ cells: [x.label, fmt(x.company), fmt(x.peersMedian), fmt(x.sectorWhole)], tone: isNum(x.company) && isNum(x.peersMedian) ? (x.company > x.peersMedian ? "warn" : "up") : undefined })) });
  }
  const v = r.valuation;
  const tiles: Tile[] = [];
  if (v && isNum(v.price)) {
    tiles.push({ label: "Price", value: perShare(v.price, r.currency) });
    if (isNum(v.low)) tiles.push({ label: "Your bear", value: perShare(v.low, r.currency), tone: "down" });
    tiles.push({ label: "Your base", value: perShare(v.base, r.currency), detail: `the price ${Math.abs(((v.price - v.base) / v.base) * 100).toFixed(0)}% ${v.price >= v.base ? "above" : "below"} it`, tone: "accent" });
    if (isNum(v.high)) tiles.push({ label: "Your bull", value: perShare(v.high, r.currency), tone: "up" });
  }
  const dcf = d?.dcf;
  if (dcf) tiles.push({ label: `DCF, ${DCF_BASIS_LABEL[dcf.basis].toLowerCase()}`, value: perShare(dcf.perShare.base, dcf.currency), detail: [isNum(dcf.perShare.bear) && isNum(dcf.perShare.bull) ? `bear ${perShare(dcf.perShare.bear, dcf.currency)}, bull ${perShare(dcf.perShare.bull, dcf.currency)}` : null, isNum(dcf.vsPricePct.base) ? `${signed(dcf.vsPricePct.base, 0)} against the price` : null].filter(Boolean).join("; ") || undefined, tone: "gilt" });
  const ig = fundamental(d, "implied_growth_pct");
  if (isNum(ig)) tiles.push({ label: "Growth the price assumes", value: `${pct(ig)} a year`, detail: "reverse DCF on free cash flow", tone: "gilt" });
  if (tiles.length) blocks.unshift({ kind: "tiles", tiles: tiles.slice(0, 6) });
  const st = d?.valuation;
  if (st?.stage) blocks.push({ kind: "callout", text: `${STAGE[st.stage].label}: ${st.stageWords}${st.methodLabel ? ` ${st.methodLabel} is the measure that fits it.` : ""}`, tone: "accent" });
  const words = briefOf(d)?.valuation;
  if (words?.points.length) blocks.push({ kind: "bullets", items: words.points.map((text) => ({ text })) });
  if (!blocks.length) return null;
  const title = words?.headline ?? (h && isNum(h.now?.value) && isNum(h.median) ? `${h.label} ${times(h.now!.value)} against a five-year median of ${times(h.median)}.` : v && isNum(v.price) ? `The price is ${Math.abs(((v.price - v.base) / v.base) * 100).toFixed(0)}% ${v.price >= v.base ? "above" : "below"} your base value.` : "The valuation.");
  return { key: "valuation", kicker: "Valuation", title: sentence(title), ref: "weekly closes over the filings' per-share figures; the screener's peers; your record", split: blocks.length > 2, blocks };
}

function test({ r, d, methodology }: Ctx): Page | null {
  const c = d?.criteria;
  if (!c && !r.tests.length) return null;
  const blocks: Block[] = [];
  if (r.tests.length) blocks.push({ kind: "meters", title: "Every class on the new figures", items: r.tests.map((x) => ({ label: x.label, now: x.passes, target: x.needed, nowText: `${x.passes} of ${x.of}`, targetText: `${x.needed} needed`, note: x.holds ? "Holds" : undefined })) });
  if (c) {
    const lines = [...c.required.map((x) => ({ ...x, req: true })), ...c.lines.map((x) => ({ ...x, req: false }))].filter((x) => x.read);
    if (lines.length) blocks.push({ kind: "table", title: `${c.classLabel}, criterion by criterion`, head: ["Criterion", "Reading", "Result"], rows: lines.map((x) => ({ cells: [`${x.req ? "Required: " : ""}${x.label}`, x.value ?? "", x.pass ? "Holds" : "Fails"], tone: x.pass ? "up" : "down", status: 2 })) });
  }
  const rules = (d?.checks ?? []).filter((x) => x.status === "fail" || x.status === "near");
  if (rules.length) blocks.push({ kind: "bullets", title: "Rules not met or near", items: rules.map((x) => ({ text: `${x.text}${x.actual ? ` Reads ${x.actual} against ${x.limit}.` : ""}`, tag: `§${x.section}`, tone: x.status === "fail" ? ("down" as Tone) : ("warn" as Tone) })) });
  return {
    key: "test",
    kicker: `${methodology ?? "Your methodology"}'s test`,
    title: c ? `${c.classLabel}: ${c.passes} of ${c.of} criteria hold, ${c.needed} needed${r.classBefore && r.classBefore !== r.classNow ? `; the class moved from ${r.classBefore}` : ""}.` : r.classNow ? `${r.classNow} on the new figures.` : "No class holds on the new figures.",
    ref: "your methodology on the filings' figures",
    split: blocks.length > 1,
    blocks,
  };
}

const PILLAR_TONE = { supported: "up", mixed: "warn", risk: "down", unread: "muted" } as const;
const PILLAR_WORD = { supported: "Supported", mixed: "Mixed", risk: "At risk", unread: "Unread" } as const;

function thesis({ r, d }: Ctx): Page | null {
  const pillars = (d?.pillars ?? []).filter((p) => p.tag !== "unread");
  const blocks: Block[] = [];
  if (pillars.length) blocks.push({ kind: "cards", title: "The pillars on the new figures", cards: pillars.map((p) => ({ head: p.name, tag: PILLAR_WORD[p.tag], lines: [p.words], tone: PILLAR_TONE[p.tag] as Tone })) });
  const b = d?.before;
  const changed: Bullet[] = [
    ...(d?.added ?? []).slice(0, 2).map((a) => ({ text: wholeSentences(a.changes ?? a.summary), tag: `${longDate(a.at)}, ${a.source}` })),
    ...(b && b.classNow !== r.classNow ? [{ text: `Class moved from ${b.classNow ?? "none"} to ${r.classNow ?? "none"}.`, tone: "warn" as Tone }] : []),
    ...(b && b.killsMet !== killsMet(r) ? [{ text: `Kill signals met went from ${b.killsMet} to ${killsMet(r)}.`, tone: killsMet(r) > b.killsMet ? ("down" as Tone) : ("up" as Tone) }] : []),
  ];
  if (changed.length) blocks.push({ kind: "bullets", title: "What changed", items: changed });
  if (d?.watch.length) blocks.push({ kind: "bullets", title: "What to watch", items: d.watch.map((w) => ({ text: w })) });
  if (d?.pathway) blocks.push({ kind: "bullets", title: "The pathway", items: [{ text: d.pathway, tone: "gilt" }] });
  if (!blocks.length) return null;
  const risk = pillars.filter((p) => p.tag === "risk");
  return {
    key: "thesis",
    kicker: "The thesis",
    title: pillars.length ? (risk.length ? `${risk.map((p) => p.name).join(" and ")} ${risk.length === 1 ? "is" : "are"} at risk on the new figures.` : `${plural(pillars.filter((p) => p.tag === "supported").length, "pillar")} of ${pillars.length} supported on the new figures.`) : "What the quarter changed in the thesis.",
    ref: `${r.symbol} on Theses`,
    split: blocks.length > 1,
    blocks,
  };
}

function signals({ r }: Ctx): Page | null {
  const ts = r.triggers.filter((t) => t.met !== null || t.reading);
  if (!ts.length) return null;
  const item = (t: (typeof ts)[number]): Bullet => ({ text: `${t.label}${t.reading ? `. Today: ${t.reading}` : ""}`, tag: t.met === null ? undefined : t.met ? "Met" : "Not met", tone: t.met ? (t.kind === "kill" ? "down" : "warn") : t.met === false ? "up" : "muted" });
  const blocks: Block[] = [
    { kind: "bullets", title: "Kill signals", items: ts.filter((t) => t.kind === "kill").map(item) },
    { kind: "bullets", title: "Triggers", items: ts.filter((t) => t.kind === "trigger").map(item) },
  ];
  const kills = killsOf(r).length;
  return {
    key: "signals",
    kicker: "Triggers and kill signals",
    title: kills ? `${killsMet(r) ? `${plural(killsMet(r), "kill signal")} met` : "No kill signal met"} of ${kills} on the record${r.triggers.some((t) => t.kind === "trigger" && t.met) ? "; a trigger is met" : ""}.` : r.triggers.some((t) => t.kind === "trigger" && t.met) ? "A trigger is met." : "No trigger met.",
    ref: `the ${r.symbol} record, read on the new figures`,
    split: ts.some((t) => t.kind === "kill") && ts.some((t) => t.kind === "trigger"),
    blocks,
  };
}

function questions({ d }: Ctx): Page | null {
  const q = briefOf(d)?.questions;
  const o = briefOf(d)?.outlook;
  const cards: Card[] = q
    ? ([
        ["Why this business", q.business],
        ["Why now", q.now],
        ["What the market misses", q.misses],
        ["What would change the mind", q.change],
        ["The downside", q.downside],
      ] as [string, string | null][])
        .filter(([, v]) => !!v)
        .map(([head, v]) => ({ head, lines: [v!], tone: head === "The downside" ? ("down" as Tone) : ("accent" as Tone) }))
    : [];
  const blocks: Block[] = [];
  if (cards.length) blocks.push({ kind: "cards", cards });
  if (o?.points.length) blocks.push({ kind: "bullets", title: "What comes next", items: o.points.map((text) => ({ text })) });
  if (!blocks.length) return null;
  return { key: "questions", kicker: "The investment questions", title: sentence(o?.headline ?? q?.now ?? "The questions, answered on these results."), ref: "the study, the call and the thesis", blocks };
}

function position({ r, d }: Ctx): Page | null {
  const p = d?.position;
  const pr = d?.prices;
  const blocks: Block[] = [];
  const tiles: Tile[] = [];
  if (p) {
    if (isNum(r.weight)) tiles.push({ label: "Weight", value: pct(r.weight, 2), detail: isNum(p.cap) ? `cap ${p.cap}%${p.capSection ? `, ${p.capSection}` : ""}` : undefined, tone: isNum(p.cap) && r.weight > p.cap ? "warn" : "accent" });
    if (isNum(p.gainPct)) tiles.push({ label: "Gain on cost", value: signed(p.gainPct), tone: toneOf(p.gainPct) });
  }
  const b = pr?.beta;
  if (b) {
    tiles.push({ label: `Beta to ${b.benchmark}`, value: b.beta.toFixed(2), detail: `${b.weeks} weeks, R² ${b.r2.toFixed(2)}` });
    tiles.push({ label: "Volatility a year", value: pct(b.volatility, 0), detail: `${b.benchmark} ${pct(b.benchVolatility, 0)}` });
    tiles.push({ label: "Worst fall", value: pct(b.worstFall, 0), detail: `${b.benchmark} ${pct(b.benchWorstFall, 0)}`, tone: "down" });
  }
  if (tiles.length) blocks.push({ kind: "tiles", tiles });
  if (pr && pr.closes.length >= 8) {
    const base = pr.closes[0].close;
    const series = [{ name: r.symbol, points: pr.closes.map((c) => ({ date: c.date, value: (c.close / base - 1) * 100 })) }];
    const bench = pr.benchCloses;
    if (bench.length >= 8 && b) series.push({ name: b.benchmark, points: bench.map((c) => ({ date: c.date, value: (c.close / bench[0].close - 1) * 100 })) });
    const at = pr.closes.find((c) => c.date >= r.date);
    blocks.push({ kind: "line", title: "A year of weekly closes, change since the start", series, unit: "pct", marks: at ? [{ date: at.date, value: (at.close / base - 1) * 100, label: "Results" }] : [] });
  }
  if (!blocks.length) return null;
  const ret = pr && pr.closes.length >= 2 ? (pr.closes.at(-1)!.close / pr.closes[0].close - 1) * 100 : null;
  return {
    key: "position",
    kicker: r.kind === "holding" ? "The position" : "The price",
    title: isNum(ret) ? `${r.symbol} ${ret >= 0 ? "up" : "down"} ${Math.abs(ret).toFixed(0)}% over the year${b ? `, at a beta of ${b.beta.toFixed(2)} to ${b.benchmark}` : ""}.` : b ? `Beta ${b.beta.toFixed(2)} to ${b.benchmark}.` : "The position.",
    ref: [p ? `the book as of ${longDate(p.asOf)}` : null, pr ? "weekly closes from the price feed" : null].filter(Boolean).join("; "),
    blocks,
  };
}

function verdict({ r, d }: Ctx): Page {
  const verb = r.kind !== "holding" ? "Watch" : killsMet(r) ? "Review the sale" : owed(r) ? "Decide" : "Hold";
  const crit = d?.criteria;
  const why = [crit ? `${crit.passes} of ${crit.of} criteria on the ${crit.classLabel} test.` : r.classNow ? `Tests as ${r.classNow}.` : "No class holds on the new figures.", killsOf(r).length ? `${killsMet(r)} of ${killsOf(r).length} kill signals met.` : null].filter((x): x is string => !!x);
  const change = killsOf(r).filter((t) => !t.met).slice(0, 3).map((t) => t.label);
  const next = [owed(r) ? "File the decision on the Decision Log." : null, r.triggers.some((t) => t.kind === "trigger" && t.met) ? "Look at the met trigger." : null, "Re-test at the next results."].filter((x): x is string => !!x);
  return {
    key: "verdict",
    kicker: `Verdict · ${verb}${r.classNow ? ` · ${r.classNow}` : ""}`,
    title: `${verb}${r.classNow ? ` as ${r.classNow}` : ""}${owed(r) ? ", with a decision owed" : ""}${killsOf(r).length ? `; ${killsMet(r) ? `${plural(killsMet(r), "kill signal")} met` : "no kill signal met"}` : ""}.`,
    ref: "your methodology and record; not investment advice",
    hero: true,
    blocks: [{ kind: "cards", cards: [{ head: "Why", lines: why, tone: "accent" }, { head: "What would change it", lines: change, tone: "warn" }, { head: "Next", lines: next, tone: "gilt" }] }],
  };
}

function sources({ r, d, methodology }: Ctx): Page {
  const links = [
    r.release ? { text: `${r.release.form} filed ${longDate(r.release.filed)}: the results release`, url: r.release.url } : null,
    r.filing ? { text: `${r.filing.form} filed ${longDate(r.filing.filed)}: the quarter's figures`, url: r.filing.url } : null,
    ...(r.commentary?.points ?? []).map((p) => ({ text: p.source.title, url: p.source.url })),
    ...(r.commentary?.unexpected ?? []).flatMap((u) => u.sources.map((x) => ({ text: x.title, url: x.url }))),
    ...(r.reaction?.points ?? []).map((p) => ({ text: p.source.title, url: p.source.url })),
    ...[...(r.call?.beats ?? []), ...(r.call?.guidance ?? []), ...(r.call?.qa ?? [])].map((x) => (x.source ? { text: x.source.title, url: x.source.url } : null)),
    ...(briefOf(d)?.sources ?? []).map((x) => ({ text: x.title, url: x.url })),
    ...(d?.flowNotes?.notes ?? []).map((x) => (x.source ? { text: x.source.title, url: x.source.url } : null)),
  ].filter((x): x is { text: string; url: string } => !!x && /^https:\/\//.test(x.url));
  const unique = links.filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i).slice(0, 14);
  const plain: Bullet[] = [
    { text: `${methodology ?? "Your methodology"}: the class test, the rules and the caps.` },
    { text: `The ${r.symbol} record: triggers, kill signals, the valuation and the thesis.` },
    ...(d?.study ? [{ text: `The study of ${r.symbol} on Research, ${longDate(d.study.finishedAt.slice(0, 10))}.` }] : []),
    ...(r.call ? [{ text: `The call: ${r.call.source}.` }] : []),
  ];
  return { key: "sources", kicker: "Sources", title: "Figures from SEC filings; the class, rules and headline from your methodology; every reading with its page.", blocks: [{ kind: "bullets", items: [...unique.map((x) => ({ text: x.text, url: x.url })), ...plain] }] };
}

/** The pages in order, each drawn only when it holds something; the cover, the verdict and the sources always. */
const BUILDERS: ((c: Ctx) => Page | null)[] = [cover, review, results, flowPage, flowNotesPage, kpis, beats, reaction, highlights, guidance, call, business, record, profit, competition, moats, swot, capital, valuation, test, thesis, signals, questions, position, verdict, sources];

/** A margin's move in words: held when it moved less than a twentieth of a point. */
const marginMove = (d: number) => (Math.abs(d) < 0.05 ? "held" : `${d > 0 ? "widened" : "narrowed"} ${Math.abs(d).toFixed(1)} pts`);

/** The page keys the deck can carry, in order. */
export const EARNINGS_DOC_PAGES = EARNINGS_DOC.map((x) => x.key);

/** The earnings deck as pages, cleaned of every figure it does not hold, with what the filings left out at the end. */
export function earningsDoc(r: EarningsReport, methodology: string | null): ReportDoc {
  const c: Ctx = { r, d: r.detail ? { ...r.detail, years: withoutRepeatedYear(r.detail.years) } : null, methodology };
  const pages = BUILDERS.map((b) => b(c)).filter((p): p is Page => !!p);
  // The cover's few lines: what the pages after it found, so the deck reads in one glance.
  const brief = ["results", "reaction", "guidance", "thesis", "valuation"].map((k) => pages.find((p) => p.key === k)).filter((p): p is Page => !!p).map((p) => ({ text: p.title, tag: p.kicker }));
  if (brief.length) pages[0].blocks.push({ kind: "bullets", title: "In brief", items: brief.slice(0, 4) });
  return cleanDoc({
    kind: "earnings",
    title: `${r.name ?? r.symbol} (${r.symbol}) ${quarterOf(r)} results`,
    subtitle: `Reported ${longDate(r.date)}${r.classNow ? ` · ${r.classNow}` : ""}`,
    date: (r.updatedAt || r.builtAt || `${r.date}T00:00:00Z`).slice(0, 10),
    tone: docTone(r),
    pages,
    omitted: omittedOf(c.d),
  });
}

/** The deck's file name, without its extension. */
export const earningsDocName = (r: EarningsReport) => `${r.symbol} ${quarterOf(r)} earnings ${r.date}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();


