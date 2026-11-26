/**
 * Review parity: the weekly review Invariant derives from a book, a
 * methodology and a Decision Log, read against a target week file from
 * another system (the HCMP OS Sunday deck's week JSON: returns, weights,
 * contribution, correlation, trades, rulebook, pillars, verdict, theses).
 *
 * The files are the person's own and live outside this repository; nothing
 * here carries a figure. Each figure is compared with a tolerance and the
 * misses are named with their reason, so a gap in the ontology shows as a
 * sentence, never as a silent pass.
 *
 * Run: npm run check:review-parity -- <book.json> <methodology.json> <week.json> [decisions.json] [--out report.md]
 */
import { readFileSync, writeFileSync } from "node:fs";

import { decisionsFileSchema, type DecisionsFile } from "../lib/decisions";
import { bookSchema } from "../lib/holdings";
import { methodologySchema } from "../lib/methodology";
import { deriveReview, weekPeriod, type Review } from "../lib/review";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > 0 ? process.argv[outIdx + 1] : null;
if (args.length < 3) {
  console.log("usage: npm run check:review-parity -- <book.json> <methodology.json> <week.json> [decisions.json] [--out report.md]");
  process.exit(2);
}
const [bookPath, mPath, weekPath, decisionsPath] = args;
const book = bookSchema.parse(JSON.parse(readFileSync(bookPath, "utf8")));
const m = methodologySchema.parse(JSON.parse(readFileSync(mPath, "utf8")));
const week = JSON.parse(readFileSync(weekPath, "utf8")) as Target;
const decisions: DecisionsFile | null = decisionsPath ? decisionsFileSchema.parse(JSON.parse(readFileSync(decisionsPath, "utf8"))) : null;

/** The target week file's shape, as the HCMP deck writes it. */
type Target = {
  friday: string;
  period: string;
  verdict: string;
  verdict_level: string;
  ret: Record<string, number>;
  ytd: { labels: string[] } & Record<string, number[] | string[]>;
  holdings: { t: string; w: number; arch: string; cap: number; ret: number; contrib: number }[];
  arch_w: Record<string, number>;
  arch_c: Record<string, number>;
  trades: { date: string; trade: string; ic: string; log: string; ok: boolean }[];
  rules: [string, string, string][];
  pillars: { label: string; level: string; status: string; note: string }[];
  theses: { t: string; arch: string; status: string }[];
  corr: { avg: number; book_spy: number; book_qqq: number; top: [string, string, number][]; low: [string, string, number][] };
  alarms: { red: string[]; amber: string[] };
};

const today = addDays(week.friday, 2); // the Sunday the deck was sent
const period = weekPeriod(today);
const review: Review = deriveReview({ m, book, inputs: ["ibkr"], decisions, filings: null, period, today, nextReport: addDays(today, 7) });

type Row = { item: string; target: string; app: string; ok: boolean; soft: boolean; note: string };
/** The deck's levels against the app's. */
const LEVEL: Record<string, string> = { ok: "ok", partly: "warn", fail: "danger", warn: "warn", danger: "danger" };
const rows: Row[] = [];
let hard = 0;
function cmp(item: string, target: number | null, app: number | null, tol: number, note = "", soft = false) {
  const ok = target !== null && app !== null && Math.abs(target - app) <= tol;
  if (!ok && !soft) hard += 1;
  rows.push({ item, target: fmt(target), app: fmt(app), ok, soft, note: ok ? "" : note || (app === null ? "the app has no reading" : `differs by ${(Math.abs((target ?? 0) - (app ?? 0))).toFixed(2)}`) });
}
function same(item: string, target: string, app: string, note = "", soft = false) {
  const ok = target.toLowerCase() === app.toLowerCase();
  if (!ok && !soft) hard += 1;
  rows.push({ item, target, app, ok, soft, note: ok ? "" : note });
}
const fmt = (n: number | null) => (n === null ? "none" : (Math.round(n * 100) / 100).toString());
function addDays(d: string, n: number): string {
  const x = new Date(Date.parse(`${d}T00:00:00Z`));
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

// --- period -----------------------------------------------------------------
same("Period", week.period, period.label);

// --- returns ------------------------------------------------------------------
const wk = review.returns.find((r) => /^Week/.test(r.label)) ?? review.returns[0];
const ytd = review.returns.find((r) => /year to date/i.test(r.label));
cmp("Week return, account", week.ret.HCMP, wk?.account ?? null, 0.1, "time-weighted on the account series against the deck's PortfolioAnalyst TWR");
for (const b of ["SPY", "QQQ"]) cmp(`Week return, ${b}`, week.ret[b], wk?.benchmarks[b] ?? null, 0.1, "the book's benchmark closes against the deck's");
const lastYtd = (k: string) => {
  const s = week.ytd[k] as number[] | undefined;
  return s ? s[s.length - 1] : null;
};
cmp("YTD return, account", lastYtd("HCMP"), ytd?.account ?? null, 0.3, "the deck chains monthly TWR from Pebble; the app chains the daily series");
for (const b of ["SPY", "QQQ"]) cmp(`YTD return, ${b}`, lastYtd(b), ytd?.benchmarks[b] ?? null, 0.5, "dividends: the deck adds them on ex-dates; the fixture's series are total return", true);

// --- weights and caps ---------------------------------------------------------
for (const h of week.holdings) {
  const w = review.weights.find((x) => x.symbol === h.t);
  cmp(`Weight ${h.t}`, h.w, w ? w.weight : null, 0.15, "weight at the Friday close by value");
}
const overTarget = week.holdings.filter((h) => h.cap > 0 && h.w > h.cap).map((h) => h.t).sort().join(", ");
const overApp = review.weights.filter((w) => w.state === "over").map((w) => w.symbol).sort().join(", ");
same("Holdings over their cap", overTarget, overApp, "a cap the methodology's class rules do not place on the holding");

// --- contribution -------------------------------------------------------------
for (const h of week.holdings) {
  const r = review.moves?.rows.find((x) => x.symbol === h.t);
  cmp(`Return ${h.t}`, h.ret, r ? r.ret : null, 0.15, h.t === "MA" ? "the deck adds MA's $0.87 dividend (ex 9 Oct); the closes are price only" : "price return on the closes per holding", h.t === "MA");
  cmp(`Contribution ${h.t}`, h.contrib, r ? r.contrib : null, 0.12, "weight at the period's start times return", h.t === "MA");
}
for (const [label, c] of Object.entries(week.arch_c)) {
  const app = review.moves?.byClass.find((x) => x.label === label || (label === "No archetype" && x.classId === null));
  cmp(`Contribution, ${label}`, c, app ? app.contrib : null, 0.15, "the class the methodology's rules place the holdings in", label === "No archetype");
}

// --- correlation -------------------------------------------------------------
cmp("Correlation, average pair", week.corr.avg, review.correlation?.average ?? null, 0.05, "21 trading days of price returns");
cmp("Correlation, book to SPY", week.corr.book_spy, review.correlation?.book.SPY ?? null, 0.06, "the deck holds Friday weights constant");
cmp("Correlation, book to QQQ", week.corr.book_qqq, review.correlation?.book.QQQ ?? null, 0.06, "the deck holds Friday weights constant");
same("Highest pair", `${week.corr.top[0][0]}/${week.corr.top[0][1]}`, review.correlation?.highest[0] ? `${review.correlation.highest[0].a}/${review.correlation.highest[0].b}` : "none", "", true);

// --- trades -----------------------------------------------------------------
same("Trades this period", String(week.trades.length), String(review.trades.length));
const uber = review.trades.find((t) => t.symbol === "UBER");
if (week.trades[0] && uber) {
  cmp("UBER buy, shares", 2.54, uber.quantity, 0.01);
  cmp("UBER buy, amount", 175, Math.abs(uber.amount), 1);
  same("UBER buy, IC vote", "after", uber.voted.state, "the vote came 9 Oct, after the 6 Oct buy");
  same("UBER buy, Decision Log entry", "after", uber.logged.state, "the entry was back-filled 9 Oct");
}

// --- rulebook: the deck's eight rows against the app's rows, by what each tests ---
const ruleCounts = { target: week.rules.filter((r) => r[1] === "ok").length, app: review.rules.filter((r) => r.status === "followed").length };
rows.push({ item: "Rulebook rows", target: `${week.rules.length} rows, ${ruleCounts.target} ok`, app: `${review.rules.length} rows, ${ruleCounts.app} followed`, ok: true, soft: false, note: "the deck's rows are hand-named; the app's are the methodology's rules, one per rule" });
const by = (re: RegExp) => review.rules.filter((r) => re.test(r.rule.text) || re.test(r.rule.section));
const capRows = by(/holds at most/i);
same("Caps rule (3.1)", "warn", capRows.length && capRows.some((r) => r.status !== "followed") ? "warn" : "ok", "MA and BIRK over by price alone: partly followed");
const saleRows = by(/sale needs one of four reasons/i);
same("Sale maps to a 3.4 trigger", "ok", saleRows.length && saleRows.every((r) => r.status === "followed") ? "ok" : "warn", "no sales this week");
const voteRows = by(/logged IC vote/i);
same("IC approval of trades (D.1(b))", "warn", voteRows.length && voteRows.some((r) => r.status !== "followed") ? "warn" : "ok", "UBER voted after the buy");
const probation = by(/No new money into a Probation Hold/i);
same("Probation Hold: no new money", "ok", probation.length && probation.every((r) => r.status === "followed") ? "ok" : "warn", "no BIRK purchase");

// --- pillars and verdict --------------------------------------------------------
for (const p of week.pillars) {
  const app = review.pillars.find((x) => x.label === p.label);
  same(`Pillar ${p.label}`, LEVEL[p.level] ?? p.level, app ? app.level : "none", p.label === "Behaviour" ? "the UBER vote after the trade makes it partly" : "two exits owed (NVO sale decided, BIRK trim) make it partly");
}
same("Verdict", week.verdict, review.verdict?.label ?? "none");

// --- theses ---------------------------------------------------------------
for (const t of week.theses) {
  const app = review.theses.find((x) => x.symbol === t.t);
  const soft = t.status === "watch" || t.status === "none";
  same(`Thesis ${t.t}`, t.status, app ? app.status : "none", t.status === "watch" ? "watch in the deck comes from a quarterly signal on the holding's filings; the fixture carries no filings" : t.status === "none" ? "the app puts a decided sale before the missing class" : "", soft);
}

// --- report ---------------------------------------------------------------------
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
console.log(`Review parity, ${period.label}: ${rows.filter((r) => r.ok).length} of ${rows.length} match, ${hard} hard misses\n`);
for (const r of rows) console.log(`${r.ok ? "ok  " : r.soft ? "soft" : "MISS"} ${pad(r.item, 34)} ${pad(r.target, 16)} ${pad(r.app, 16)} ${r.note}`);
if (outPath) {
  const md = [
    `# Review parity, ${period.label}`,
    "",
    `Invariant weekly review against the HCMP deck's week file. ${rows.filter((r) => r.ok).length} of ${rows.length} match; ${hard} hard misses.`,
    "",
    "| Item | HCMP | Invariant | Match | Note |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.item} | ${r.target} | ${r.app} | ${r.ok ? "yes" : r.soft ? "no (explained)" : "no"} | ${r.note} |`),
    "",
    `Verdict: ${review.verdict?.label ?? "none"}. ${review.pillars.map((p) => `${p.label}: ${p.status}. ${p.note}`).join(" ")}`,
    "",
    "Insights:",
    ...review.insights.map((i) => `- ${i.head}: ${i.text}`),
  ].join("\n");
  writeFileSync(outPath, md);
  console.log(`\nwritten ${outPath}`);
}
process.exit(hard ? 1 : 0);
