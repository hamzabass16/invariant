/**
 * The weekly and monthly review, pure: HCMP's Sunday deck rebuilt from the
 * methodology and the book for anyone. The sections come in HCMP's fixed
 * order and each is drawn when the methodology or the data calls for it (the
 * reviews screen's slots in lib/ontology.ts); a section with nothing to show
 * drops out, and one the data cannot fill yet says what it needs.
 *
 *   verdict        the worse of two pillars: Behaviour (the period's trades
 *                  against the rules, the caps, the Decision Log) and Holdings
 *                  and theses (every holding's standing); returns against the
 *                  benchmarks are context and never decide it
 *   alarms         what needs a decision, most urgent first (lib/screens.ts)
 *   returns        the period and the year to date, account against each
 *                  benchmark the methodology names (lib/performance.ts)
 *   moves          contribution by holding and by class, from the closes per
 *                  holding the book carries; correlation over 21 sessions
 *   insights       what the numbers mean, rule-based sentences
 *   capital        class mix against caps, every weight with its headroom
 *   trades         every fill of the period with its Decision Log entry and
 *                  vote, then the rulebook: each rule followed, partly or not
 *   theses         every holding: class and test, what is on file, the
 *                  evidence of the period, a standing price alone never changes
 *   news           on the person's own Claude provider, with a source per item
 *   calendar       coming up and open items
 *   method         where each figure came from
 *
 * Monthly adds the month in numbers: time-weighted return, worst fall, up and
 * down capture, tracking error, trade quality, realised P&L and the sale
 * hindsight. Nothing here advises; no figure is estimated.
 */
import { z } from "zod";

import { decisionsFor, type Decision, type DecisionsFile } from "@/lib/decisions";
import type { FilingsFile } from "@/lib/filings";
import { rateOf, type Book, type Holding } from "@/lib/holdings";
import { marketDef } from "@/lib/markets";
import { contextFor, evaluate, type Finding, type Methodology, type Rule } from "@/lib/methodology";
import { type EvalCtx } from "@/lib/ontology";
import { addDays, benchmarkIndex, cashShare, monthEnd, navIndex, returnOver, riskOver, riskStats, valueOnOrBefore, type RiskStats, type Window } from "@/lib/performance";
import { classFilters, classTest } from "@/lib/recipes";
import { benchmarksOf, capsFor, classMix, concentration, datedItems, daysBetween, marketSymbolsOf, needsYou, signalsFor, weightsFor, type ActionItem, type Cap, type ClassMix, type DatedItem, type Signal, type Weight } from "@/lib/screens";
import type { InputId } from "@/lib/setup";
import { longDate, shortDate } from "@/lib/time";
import { dutyOf, todoFor, type TodoItem } from "@/lib/todo";
import { fillsOf, matchLots, salesOf, tradeStats, type Fill, type Sale, type TradeStats } from "@/lib/trades";
import { MODELS } from "@/lib/models";
import { READ_BEHIND } from "@/lib/investigate";

// ---------------------------------------------------------------------------
// Periods

export const REVIEW_KINDS = ["weekly", "monthly"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_LABEL: Record<ReviewKind, string> = { weekly: "Weekly review", monthly: "Monthly review" };

/** A review's period as (from, to]: `from` is the close before the period's first day. */
export type Period = { kind: ReviewKind; from: string; to: string; label: string; short: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayOfWeek = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`).valueOf()).getUTCDay();

/** The most recent Friday on or before `today`. */
export function lastFriday(today: string): string {
  return addDays(today, -((dayOfWeek(today) - 5 + 7) % 7));
}

/** "5 to 9 Oct 2026", "28 Sep to 2 Oct 2026", "29 Dec 2025 to 2 Jan 2026". */
export function rangeLabel(first: string, last: string, year = true): string {
  const y = year ? ` ${last.slice(0, 4)}` : "";
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8, 10))} to ${shortDate(last)}${y}`;
  if (first.slice(0, 4) === last.slice(0, 4)) return `${shortDate(first)} to ${shortDate(last)}${y}`;
  return `${longDate(first)} to ${longDate(last)}`;
}

/** The week that ended on the most recent Friday: Monday to Friday, measured from the Friday before. */
export function weekPeriod(today: string): Period {
  const to = lastFriday(today);
  const from = addDays(to, -7);
  return { kind: "weekly", from, to, label: rangeLabel(addDays(to, -4), to), short: rangeLabel(addDays(to, -4), to, false) };
}

/** The previous calendar month, measured from the last day of the month before it. */
export function monthPeriod(today: string): Period {
  const ym = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const to = monthEnd(ym);
  const from = addDays(`${ym}-01`, -1);
  const label = `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  return { kind: "monthly", from, to, label, short: label };
}

export const periodFor = (kind: ReviewKind, today: string): Period => (kind === "weekly" ? weekPeriod(today) : monthPeriod(today));

/** The year to date as a window ending at `to`. */
export const ytdWindow = (to: string): Window => ({ from: `${Number(to.slice(0, 4)) - 1}-12-31`, to });

const inPeriod = (date: string, p: { from: string; to: string }) => date > p.from && date <= p.to;

// ---------------------------------------------------------------------------
// Returns

export type ReturnRow = { label: string; from: string; to: string; account: number | null; benchmarks: Record<string, number | null>; note: string | null };

/** The period and the year to date, account against each benchmark; null with a note where a series does not reach. */
export function returnRows(book: Book, benchmarks: readonly string[], period: Period): ReturnRow[] {
  const idx = navIndex(book);
  const bench = benchmarks.map((s) => [s, benchmarkIndex(book, s)] as const);
  const row = (label: string, w: Window): ReturnRow => {
    const notes: string[] = [];
    const account = idx ? returnOver(idx.dates, idx.index, w.from, w.to) : null;
    if (!idx) notes.push("Needs the account's daily value series.");
    else if (account === null) notes.push(`Account series begins ${longDate(idx.dates[0])}.`);
    const out: Record<string, number | null> = {};
    for (const [symbol, bi] of bench) {
      const v = bi ? returnOver(bi.dates, bi.index, w.from, w.to) : null;
      if (!bi) notes.push(`No ${symbol} prices in the book yet.`);
      else if (v === null) notes.push(`${symbol} prices begin ${longDate(bi.dates[0])}.`);
      out[symbol] = v;
    }
    return { label, from: w.from, to: w.to, account, benchmarks: out, note: notes.length ? notes.join(" ") : null };
  };
  return [row(period.kind === "weekly" ? "Week" : "Month", { from: period.from, to: period.to }), row("Year to date", ytdWindow(period.to))];
}

export const signedPct = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
export const signedPp = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)} pp`;

/** A cumulative return path: the account first, then each benchmark, in percent from the window's start. */
export type Path = { dates: string[]; series: { label: string; values: (number | null)[] }[] };

/**
 * The account and each benchmark as cumulative returns from the window's
 * start, for the review's line charts: every session of the window ("day") or
 * every month end ("month"), the start itself first at 0. The sessions are the
 * account's own, else the first benchmark's. Null when nothing reaches.
 */
export function pathOver(book: Book, benchmarks: readonly string[], w: Window, step: "day" | "month"): Path | null {
  const idx = navIndex(book);
  const bench = benchmarks.map((s) => [s, benchmarkIndex(book, s)] as const);
  const calendar = idx?.dates ?? bench.find(([, b]) => b)?.[1]?.dates ?? [];
  let dates = calendar.filter((d) => d > w.from && d <= w.to);
  if (!dates.length) return null;
  if (step === "month") dates = dates.filter((d, i) => i === dates.length - 1 || dates[i + 1].slice(0, 7) !== d.slice(0, 7));
  dates = [w.from, ...dates];
  const cumulative = (src: { dates: string[]; index: number[] } | null) => {
    const base = src ? valueOnOrBefore(src.dates, src.index, w.from) : null;
    return dates.map((d) => {
      const v = src && base ? valueOnOrBefore(src.dates, src.index, d) : null;
      return v === null || !base ? null : Math.round((v / base - 1) * 10000) / 100;
    });
  };
  const series = [{ label: "Account", values: idx ? cumulative(idx) : dates.map(() => null) }, ...bench.map(([s, b]) => ({ label: s, values: cumulative(b) }))];
  if (series.every((x) => x.values.every((v) => v === null))) return null;
  return { dates, series };
}

/** A market indicator over the period: a price's change in percent, a yield's or spread's in points. */
export type MarketMove = { symbol: string; name: string; change: number; unit: "pct" | "pp"; level: number };

/**
 * The market indicators the methodology reads (and its benchmarks), each
 * moved over the period from the feed's own series; every indicator the feed
 * carries when the methodology names none. An indicator without a reading on
 * both ends is left out.
 */
export function marketsOver(book: Book, m: Methodology | null, period: { from: string; to: string }): MarketMove[] {
  const mk = book.markets;
  if (!mk?.rows.length) return [];
  const named = [...marketSymbolsOf(m), ...benchmarksOf(m).map((s) => s.toUpperCase())];
  const symbols = named.length ? [...new Set(named)] : mk.rows.map((r) => r.symbol);
  const out: MarketMove[] = [];
  for (const symbol of symbols) {
    const def = marketDef(symbol);
    const pts = mk.series[symbol];
    if (!def || !pts?.length) continue;
    const dates = pts.map((p) => p.date);
    const values = pts.map((p) => p.value);
    const v0 = valueOnOrBefore(dates, values, period.from);
    const v1 = valueOnOrBefore(dates, values, period.to);
    if (v0 === null || v1 === null) continue;
    if (def.unit === "pct") out.push({ symbol, name: def.name, change: Math.round((v1 - v0) * 100) / 100, unit: "pp", level: v1 });
    else if (v0 > 0) out.push({ symbol, name: def.name, change: Math.round((v1 / v0 - 1) * 10000) / 100, unit: "pct", level: v1 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// What moved the book

export type Mover = { symbol: string; name: string; classId: string | null; classLabel: string; ret: number; contrib: number; weightStart: number; weightEnd: number };
export type Moves = {
  rows: Mover[];
  byClass: { classId: string | null; label: string; weightEnd: number; contrib: number }[];
  /** Listed symbols with no closes, left out of the sum. */
  missing: string[];
  /** The account value the start weights divide by: the series' value at the start, else the sum of the positions. */
  navStart: number;
  navStartSource: "series" | "positions";
};

const closesOf = (book: Book, symbol: string) => {
  const pts = book.series?.holdings?.[symbol] ?? book.series?.holdings?.[symbol.toUpperCase()];
  if (!pts?.length) return null;
  const dates = pts.map((p) => p.date);
  return { dates, values: pts.map((p) => p.value) };
};

/**
 * Contribution by holding over the period: each listed holding's return from
 * its closes, times its weight at the start (today's quantity at the start
 * close, over the account's value at the start). Null when the book carries no
 * closes per holding; a holding without closes is named in `missing`.
 */
export function movesOver(book: Book, weights: readonly Weight[], period: Period): Moves | null {
  if (!book.series?.holdings || !Object.keys(book.series.holdings).length) return null;
  const idx = navIndex(book);
  const navSeries = idx ? valueOnOrBefore(idx.dates, idx.nav, period.from) : null;
  const rows: Mover[] = [];
  const missing: string[] = [];
  const starts: number[] = [];
  const parts: { w: Weight; ret: number; valueStart: number }[] = [];
  for (const w of weights) {
    const c = closesOf(book, w.symbol);
    const p0 = c ? valueOnOrBefore(c.dates, c.values, period.from) : null;
    const p1 = c ? valueOnOrBefore(c.dates, c.values, period.to) : null;
    const lead = w.holdings[0];
    const rate = rateOf(lead.currency, book.fx);
    if (p0 === null || p1 === null || p0 <= 0 || rate === null) {
      missing.push(w.symbol);
      continue;
    }
    const qty = w.holdings.reduce((s, h) => s + h.quantity, 0);
    const valueStart = qty * p0 * rate;
    starts.push(valueStart);
    parts.push({ w, ret: (p1 / p0 - 1) * 100, valueStart });
  }
  if (!parts.length) return null;
  const navStart = navSeries && navSeries > 0 ? navSeries : starts.reduce((a, b) => a + b, 0);
  for (const p of parts) {
    const weightStart = navStart > 0 ? (p.valueStart / navStart) * 100 : 0;
    rows.push({ symbol: p.w.symbol, name: p.w.name, classId: p.w.classId, classLabel: p.w.classLabel, ret: p.ret, contrib: (weightStart * p.ret) / 100, weightStart, weightEnd: p.w.weight });
  }
  rows.sort((a, b) => b.contrib - a.contrib);
  const byClass = new Map<string, { classId: string | null; label: string; weightEnd: number; contrib: number }>();
  for (const r of rows) {
    const key = r.classId ?? "";
    const g = byClass.get(key) ?? { classId: r.classId, label: r.classLabel, weightEnd: 0, contrib: 0 };
    g.weightEnd += r.weightEnd;
    g.contrib += r.contrib;
    byClass.set(key, g);
  }
  return { rows, byClass: [...byClass.values()].sort((a, b) => b.weightEnd - a.weightEnd), missing, navStart, navStartSource: navSeries && navSeries > 0 ? "series" : "positions" };
}

// ---------------------------------------------------------------------------
// Correlation

export type Pair = { a: string; b: string; r: number };
export type Correlation = {
  /** Trading days in the window. */
  days: number;
  from: string;
  to: string;
  symbols: string[];
  /** The average of every pair. */
  average: number;
  highest: Pair[];
  lowest: Pair[];
  /** The account's correlation with each benchmark over the same days. */
  book: Record<string, number | null>;
  /** The pairs above 0.8, if any. */
  tight: Pair[];
  /** Every pair, for the matrix. */
  pairs: Pair[];
};

/** Holdings under this weight (a residual after an exit) are left out of the pair figures. */
export const CORRELATION_MIN_WEIGHT = 1;
export const CORRELATION_DAYS = 21;

function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length < 3 || a.length !== b.length) return null;
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i += 1) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null;
}

/** Daily returns of a series on the given dates, each read on or before the date. */
function returnsOn(dates: readonly string[], series: { dates: string[]; values: number[] }): number[] | null {
  const path = dates.map((d) => valueOnOrBefore(series.dates, series.values, d));
  if (path.some((v) => v === null || v <= 0)) return null;
  const out: number[] = [];
  for (let i = 1; i < path.length; i += 1) out.push((path[i] as number) / (path[i - 1] as number) - 1);
  return out;
}

/**
 * How the holdings moved together over the last `days` sessions to the
 * period's end, from the closes per holding: the average pair, the highest
 * and lowest pairs, and the account against each benchmark. Null below three
 * holdings with closes.
 */
export function correlationOver(book: Book, symbols: readonly string[], benchmarks: readonly string[], to: string, days = CORRELATION_DAYS): Correlation | null {
  const idx = navIndex(book);
  const calendar = idx ? idx.dates.filter((d) => d <= to) : (closesOf(book, symbols[0] ?? "")?.dates.filter((d) => d <= to) ?? []);
  const dates = calendar.slice(-(days + 1));
  if (dates.length < 4) return null;
  const series: { symbol: string; r: number[] }[] = [];
  for (const s of symbols) {
    const c = closesOf(book, s);
    const r = c ? returnsOn(dates, c) : null;
    if (r) series.push({ symbol: s, r });
  }
  if (series.length < 3) return null;
  const pairs: Pair[] = [];
  for (let i = 0; i < series.length; i += 1)
    for (let j = i + 1; j < series.length; j += 1) {
      const r = pearson(series[i].r, series[j].r);
      if (r !== null) pairs.push({ a: series[i].symbol, b: series[j].symbol, r });
    }
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((x, y) => y.r - x.r);
  const bookReturns = idx ? returnsOn(dates, { dates: idx.dates, values: idx.index }) : null;
  const bookVs: Record<string, number | null> = {};
  for (const b of benchmarks) {
    const bi = benchmarkIndex(book, b);
    const br = bi ? returnsOn(dates, { dates: bi.dates, values: bi.index }) : null;
    bookVs[b] = bookReturns && br ? pearson(bookReturns, br) : null;
  }
  return {
    days: dates.length - 1,
    from: dates[0],
    to: dates[dates.length - 1],
    symbols: series.map((s) => s.symbol),
    average: pairs.reduce((s, p) => s + p.r, 0) / pairs.length,
    highest: sorted.slice(0, 3),
    lowest: sorted.slice(-3).reverse(),
    book: bookVs,
    tight: sorted.filter((p) => p.r > 0.8),
    pairs,
  };
}

// ---------------------------------------------------------------------------
// Trades of the period, against the Decision Log

export type LogState = { state: "before" | "same" | "after" | "none"; date: string | null; days: number | null };

export type ReviewTrade = {
  date: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  /** Base currency. */
  amount: number;
  price: number | null;
  classId: string | null;
  classLabel: string;
  cap: number | null;
  /** The weight now, at the period's end. */
  weightNow: number;
  overCap: boolean;
  /** A Decision Log entry naming the symbol within a week (a trade entry first, else any). */
  logged: LogState;
  /** A vote naming the symbol within a week. */
  voted: LogState;
};

const WEEK = 7;

/** The nearest entry naming the trade within a week: before or on the day first, else after. */
/** The day an entry counts from: its own date, or its filing day when that came later (a back-dated entry is read as filed when it was filed). */
const effectiveDate = (d: Decision) => (d.filedAt.slice(0, 10) > d.date && /^\d{4}-\d{2}-\d{2}/.test(d.filedAt) ? d.filedAt.slice(0, 10) : d.date);

function logState(entries: readonly Decision[], date: string): LogState {
  // The nearest entry within a week, a tie going to the one written first: a rotation logged five days before does not stand in for an entry filed three days after.
  const near = entries
    .map((d) => ({ d, delta: daysBetween(date, effectiveDate(d)) }))
    .filter((x) => Math.abs(x.delta) <= WEEK)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.delta - b.delta);
  const hit = near[0];
  if (!hit) return { state: "none", date: null, days: null };
  if (hit.delta <= 0) return { state: hit.delta === 0 ? "same" : "before", date: effectiveDate(hit.d), days: -hit.delta };
  return { state: "after", date: effectiveDate(hit.d), days: hit.delta };
}

/** The period's fills grouped by day, symbol and side, each with its class, cap and Decision Log standing. */
export function tradesOver(book: Book, weights: readonly Weight[], decisions: DecisionsFile | null, period: Period): ReviewTrade[] {
  const groups = new Map<string, ReviewTrade & { priced: number }>();
  for (const f of fillsOf(book)) {
    if (!inPeriod(f.date, period)) continue;
    const key = `${f.date}|${f.symbol.toUpperCase()}|${f.side}`;
    const w = weights.find((x) => x.symbol === f.symbol.toUpperCase());
    const g = groups.get(key) ?? {
      date: f.date,
      symbol: f.symbol.toUpperCase(),
      side: f.side,
      quantity: 0,
      amount: 0,
      price: null,
      priced: 0,
      classId: w?.classId ?? null,
      classLabel: w?.classLabel ?? "No class yet",
      cap: w?.cap?.cap ?? null,
      weightNow: w?.weight ?? 0,
      overCap: w?.state === "over",
      logged: { state: "none", date: null, days: null },
      voted: { state: "none", date: null, days: null },
    };
    g.quantity += f.quantity;
    g.amount += f.amount;
    if (f.price !== null) g.priced += f.quantity;
    groups.set(key, g);
  }
  const out: ReviewTrade[] = [];
  for (const g of groups.values()) {
    const named = decisionsFor(decisions, g.symbol);
    const trades = named.filter((d) => d.kind === "trade");
    const logged = logState(trades.length ? trades : named, g.date);
    const voted = logState(
      named.filter((d) => d.kind === "vote"),
      g.date,
    );
    const { priced, ...rest } = g;
    out.push({ ...rest, price: priced > 0 ? g.amount / g.quantity : null, logged, voted });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export function logWords(s: LogState, what: "entry" | "vote"): string {
  if (s.state === "none") return `No ${what} within a week`;
  if (s.state === "same") return `${what === "entry" ? "Entry" : "Vote"} the same day`;
  if (s.state === "before") return `${what === "entry" ? "Entry" : "Vote"} ${s.days}d before`;
  return `${what === "entry" ? "Entry" : "Vote"} ${s.days}d after the trade`;
}

// ---------------------------------------------------------------------------
// The rulebook

export type RuleStatus = "followed" | "partly" | "not" | "check" | "waiting";
export const RULE_STATUS_LABEL: Record<RuleStatus, string> = { followed: "Followed", partly: "Partly", not: "Not followed", check: "Yours to check", waiting: "Waiting for data" };
export type RuleRow = { rule: Rule; status: RuleStatus; note: string };

const NEW_MONEY = /\bnew money\b|\bpurchase|\bbuy\b|\bbuys\b|\bbought\b|\badd(s|ed|ing)?\b/i;
const SALE = /\bsale\b|\bsales\b|\bsell\b|\bsells\b|\bsold\b|\bexit\b/i;

/**
 * Every rule of the methodology over the period: a tested rule by its
 * finding (a cap over by price alone is partly, bought into is not followed;
 * watches are alarms, not behaviour, and are left out), a per-trade duty by
 * the period's trades against the Decision Log, a sale rule by the period's
 * sales, a new-money rule by the period's buys. A rule the app cannot read
 * stays the person's to check and is not counted.
 */
export function rulebook(m: Methodology, findings: readonly Finding[], trades: readonly ReviewTrade[], caps: readonly Cap[], ccyTrades = true): RuleRow[] {
  const out: RuleRow[] = [];
  const buys = trades.filter((t) => t.side === "buy");
  const sells = trades.filter((t) => t.side === "sell");
  const none = ccyTrades && !trades.length;
  const dutyRow = (rule: Rule, states: LogState[], what: "entry" | "vote"): RuleRow => {
    if (!trades.length) return { rule, status: "followed", note: "No trades this period." };
    const missing = trades.filter((_, i) => states[i].state === "none");
    const late = trades.filter((_, i) => states[i].state === "after");
    if (missing.length) return { rule, status: "not", note: `${missing.map((t) => `${t.symbol} ${shortDate(t.date)}`).join(", ")}: no ${what} within a week.` };
    if (late.length) return { rule, status: "partly", note: `${late.map((t) => `${t.symbol} ${t.side} of ${shortDate(t.date)}: ${logWords(states[trades.indexOf(t)], what).toLowerCase()}`).join("; ")}.` };
    return { rule, status: "followed", note: `${trades.length} trade${trades.length === 1 ? "" : "s"}, each with its ${what} on or before the day.` };
  };
  for (const rule of m.rules) {
    if (rule.test) {
      if (rule.severity === "watch") continue;
      const f = findings.find((x) => x.rule.id === rule.id);
      if (!f || f.status === "n/a") {
        out.push({ rule, status: "waiting", note: f?.detail || "No reading." });
        continue;
      }
      if (f.status === "pass") {
        out.push({ rule, status: "followed", note: f.actual ? `${f.actual} against ${f.limit}.` : "Within." });
        continue;
      }
      if (f.status === "near") {
        out.push({ rule, status: "followed", note: `Near the limit: ${f.actual} against ${f.limit}.` });
        continue;
      }
      const isCap = caps.some((c) => c.rule.id === rule.id);
      const offenders = f.offenders.map((o) => o.symbol ?? o.label);
      const bought = buys.filter((b) => offenders.includes(b.symbol));
      if (isCap && !bought.length) {
        out.push({ rule, status: "partly", note: `Over by price alone: ${f.offenders.map((o) => `${o.symbol ?? o.label} ${o.value}`).join(", ")} against ${f.limit}. No purchase of ${offenders.length === 1 ? "it" : "them"} this period.` });
        continue;
      }
      if (isCap) {
        out.push({ rule, status: "not", note: `${bought.map((b) => `${b.symbol} bought ${shortDate(b.date)}`).join(", ")} while over ${f.limit}: now ${f.offenders.map((o) => `${o.symbol ?? o.label} ${o.value}`).join(", ")}.` });
        continue;
      }
      out.push({ rule, status: rule.severity === "breach" ? "not" : "partly", note: f.detail ? `${f.actual ?? ""} against ${f.limit}: ${f.detail}.`.trim() : `${f.actual ?? "Outside"} against ${f.limit}.` });
      continue;
    }
    const duty = dutyOf(rule);
    if (duty === "vote") {
      out.push(dutyRow(rule, trades.map((t) => t.voted), "vote"));
      continue;
    }
    if (duty === "record" && /\b(every|each|per|any|all)\b/i.test(rule.text) && /\b(trade|buy|purchase|sale|sell|decision)\b/i.test(rule.text)) {
      out.push(dutyRow(rule, trades.map((t) => t.logged), "entry"));
      continue;
    }
    // The first clause decides: "No new money into a Probation Hold; sell if still failing" is a new-money rule, its tail a reminder.
    const head = rule.text.split(/;|\bunless\b|\bexcept\b/i)[0];
    const namedClass = m.classes.find((c) => new RegExp(`\\b${c.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(head));
    if (NEW_MONEY.test(head) && (namedClass || /\bcap\b|\bwithin\b|\bpassing\b|\bqualif/i.test(head)) && !SALE.test(head.replace(NEW_MONEY, ""))) {
      if (!buys.length) {
        out.push({ rule, status: "followed", note: none ? "No trades this period." : "No purchases this period." });
        continue;
      }
      const hit = namedClass ? buys.filter((b) => b.classId === namedClass.id) : buys.filter((b) => b.overCap);
      if (hit.length) out.push({ rule, status: "not", note: `${hit.map((b) => `${b.symbol} ${shortDate(b.date)}`).join(", ")}: ${namedClass ? `a purchase of a ${namedClass.label}` : "bought while over its cap"}.` });
      else out.push({ rule, status: "followed", note: `${buys.length} purchase${buys.length === 1 ? "" : "s"}, ${namedClass ? `none a ${namedClass.label}` : "each within its cap now"}.` });
      continue;
    }
    if (SALE.test(rule.text) && !NEW_MONEY.test(rule.text)) {
      if (!sells.length) {
        out.push({ rule, status: "followed", note: "No sales this period." });
        continue;
      }
      const unlogged = sells.filter((s) => s.logged.state === "none");
      if (unlogged.length) out.push({ rule, status: "not", note: `${unlogged.map((s) => `${s.symbol} ${shortDate(s.date)}`).join(", ")}: no Decision Log entry names the reason.` });
      else out.push({ rule, status: "followed", note: `${sells.length} sale${sells.length === 1 ? "" : "s"}, each with an entry; the reason is in the entry.` });
      continue;
    }
    out.push({ rule, status: "check", note: "The app cannot read this one." });
  }
  return out;
}

export function rulebookCounts(rows: readonly RuleRow[]): { followed: number; judged: number } {
  const judged = rows.filter((r) => r.status !== "check" && r.status !== "waiting");
  return { followed: judged.filter((r) => r.status === "followed").length, judged: judged.length };
}

// ---------------------------------------------------------------------------
// Holdings and theses

export type ThesisStatus = "intact" | "watch" | "at_risk" | "sale_decided" | "none" | "residual";
export const THESIS_LABEL: Record<ThesisStatus, string> = { intact: "Intact", watch: "Watch", at_risk: "At risk", sale_decided: "Sale decided", none: "No class", residual: "Residual" };
export const THESIS_TONE: Record<ThesisStatus, "ok" | "warn" | "danger" | "info" | "neutral"> = { intact: "ok", watch: "warn", at_risk: "danger", sale_decided: "info", none: "warn", residual: "neutral" };

export type ThesisRow = {
  symbol: string;
  name: string;
  classId: string | null;
  classLabel: string;
  /** "4/6" when the class tests criteria on the holding's own figures; null for a class by name. */
  test: string | null;
  onFile: string;
  evidence: string;
  status: ThesisStatus;
};

const RESIDUAL_PCT = 0.5;
/** A decision to sell, still owed: not "sold", which records one made. */
const SALE_DECIDED = /\bsell\b|\bsale\b|\bexit\b/i;
const SALE_DECIDED_DAYS = 90;
const WATCH_DAYS = 35;

/** Signals on a symbol that are not a weight cap: a cap over is price, and price alone never changes a standing. */
const fundamental = (signals: readonly Signal[], caps: readonly Cap[], symbol: string) =>
  signals.filter((s) => s.symbol?.toUpperCase() === symbol && !caps.some((c) => c.rule.id === s.rule.id));

/**
 * Every listed holding's standing at the period's end. A red signal on its
 * own figures puts it at risk; an amber one, or a clock within 35 days, on
 * watch; a Decision Log entry deciding its sale within 90 days says so; a
 * holding no class places, or a residual under half a percent, is named as
 * such. Price alone never changes a standing.
 */
export function thesesOver(m: Methodology | null, weights: readonly Weight[], ctx: EvalCtx, signals: readonly Signal[], caps: readonly Cap[], dated: readonly DatedItem[], filings: FilingsFile | null, decisions: DecisionsFile | null, period: Period): ThesisRow[] {
  return weights.map((w) => {
    const lead = w.holdings[0];
    const cls = w.classId ? m?.classes.find((c) => c.id === w.classId) : null;
    let test: string | null = null;
    if (cls && classFilters(cls).some((f) => f.field !== "symbol" && f.field !== "asset_class")) {
      const t = classTest(cls, lead, ctx);
      test = `${t.passes}/${t.criteria.length}${t.unread ? `, ${t.unread} unread` : ""}`;
    }
    const named = decisionsFor(decisions, w.symbol);
    const vote = named.find((d) => d.kind === "vote");
    const onFile = [
      lead.record?.since ? `Standing since ${longDate(lead.record.since)}` : null,
      lead.record?.ownValuation ? `own valuation ${lead.record.ownValuation.base} (${shortDate(lead.record.ownValuation.asOf)})` : null,
      vote ? `vote ${longDate(vote.date)}` : null,
    ].filter(Boolean);
    const entry = filings?.bySymbol[w.symbol] ?? filings?.bySymbol[lead.symbol];
    const own = fundamental(signals, caps, w.symbol);
    const worst = own[0];
    const evidence = [
      entry && !entry.error ? (inPeriod(entry.readAt.slice(0, 10), period) ? `Filings read ${shortDate(entry.readAt.slice(0, 10))}${entry.period ? ` (${entry.period})` : ""}` : `Filings last read ${longDate(entry.readAt.slice(0, 10))}`) : entry?.error ? "Filings could not be read" : "No filings read",
      worst && (worst.status === "red" || worst.status === "amber") ? `${worst.rule.text.replace(/\.$/, "")}: ${worst.reading ?? "outside"} against ${worst.limit ?? "the limit"} (${worst.rule.section})` : null,
    ].filter(Boolean);
    // A decided sale is a vote or a note that says sell; a trade entry records a sale already made and is not a decision still owed.
    const saleDecided = named.some((d) => d.kind !== "trade" && daysBetween(d.date, period.to) >= 0 && daysBetween(d.date, period.to) <= SALE_DECIDED_DAYS && SALE_DECIDED.test(d.title) && !/withdrawn|cancel/i.test(d.title));
    const clockSoon = dated.some((d) => d.kind === "clock" && d.symbol?.toUpperCase() === w.symbol && daysBetween(period.to, d.date) >= 0 && daysBetween(period.to, d.date) <= WATCH_DAYS);
    let status: ThesisStatus = "intact";
    if (!w.cap && w.weight < RESIDUAL_PCT) status = "residual";
    else if (saleDecided) status = "sale_decided";
    else if (m?.classes.length && w.classId === null) status = "none";
    else if (own.some((s) => s.status === "red")) status = "at_risk";
    else if (own.some((s) => s.status === "amber") || clockSoon) status = "watch";
    return { symbol: w.symbol, name: w.name, classId: w.classId, classLabel: w.classLabel, test, onFile: onFile.length ? onFile.join(", ") : "Nothing on file", evidence: evidence.join(". "), status };
  });
}

// ---------------------------------------------------------------------------
// Pillars and verdict

export type Level = "ok" | "warn" | "danger";
export type Pillar = { label: string; level: Level; status: string; note: string };
export type Verdict = { label: string; level: Level; reason: string };

export const VERDICT_REASON = "The verdict is the worse of two checks, behaviour and holdings; returns against the benchmarks are context only and never decide it.";

export function behaviourPillar(rows: readonly RuleRow[], trades: readonly ReviewTrade[]): Pillar {
  const not = rows.filter((r) => r.status === "not");
  const partly = rows.filter((r) => r.status === "partly");
  const { followed, judged } = rulebookCounts(rows);
  const level: Level = not.length ? "danger" : partly.length ? "warn" : "ok";
  const status = not.length ? "Not followed" : partly.length ? "Partly followed" : "Followed";
  const tradesNote = trades.length ? `${trades.length} trade${trades.length === 1 ? "" : "s"} this period.` : "No trades this period.";
  const detail = [...not, ...partly].map((r) => `${r.rule.section}: ${r.note.replace(/\.$/, "")}`).join("; ");
  return { label: "Behaviour", level, status, note: judged ? `${followed} of ${judged} rules followed. ${tradesNote}${detail ? ` ${detail}.` : ""}` : `No rule the app can judge yet. ${tradesNote}` };
}

export function holdingsPillar(rows: readonly ThesisRow[]): Pillar {
  const by = (s: ThesisStatus) => rows.filter((r) => r.status === s).map((r) => r.symbol);
  const atRisk = by("at_risk");
  const exits = by("sale_decided");
  const none = by("none");
  const watch = by("watch");
  const level: Level = atRisk.length ? "danger" : exits.length || none.length || watch.length ? "warn" : "ok";
  const status = atRisk.length ? "At risk" : exits.length ? `Intact, ${exits.length} exit${exits.length === 1 ? "" : "s"} owed` : none.length || watch.length ? "Partly" : "Intact";
  const parts = [
    atRisk.length ? `At risk: ${atRisk.join(", ")}` : null,
    exits.length ? `Sale decided: ${exits.join(", ")}` : null,
    none.length ? `No class places ${none.join(", ")}` : null,
    watch.length ? `On watch: ${watch.join(", ")}` : null,
  ].filter(Boolean);
  return { label: "Holdings and theses", level, status, note: parts.length ? `${parts.join(". ")}.` : rows.length ? "Every thesis intact on the figures the app reads." : "No listed holdings." };
}

export function verdictOf(pillars: readonly Pillar[]): Verdict {
  const rank: Record<Level, number> = { ok: 0, warn: 1, danger: 2 };
  const worst = pillars.reduce<Level>((w, p) => (rank[p.level] > rank[w] ? p.level : w), "ok");
  return { label: worst === "ok" ? "Backed" : worst === "warn" ? "Partly backed" : "Not backed", level: worst, reason: VERDICT_REASON };
}

// ---------------------------------------------------------------------------
// Insights

/** What the numbers mean: rule-based sentences from the period's own figures, two to six of them. */
export function insights(ccy: string, period: Period, returns: readonly ReturnRow[], moves: Moves | null, weights: readonly Weight[], netWorth: number, trades: readonly ReviewTrade[], corr: Correlation | null, cash: number): { head: string; text: string }[] {
  const out: { head: string; text: string }[] = [];
  const money = (n: number) => `${ccy} ${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
  const r0 = returns[0];
  const ytd = returns[1];
  if (r0?.account !== null && r0?.account !== undefined) {
    const vs = Object.entries(r0.benchmarks).filter(([, v]) => v !== null).map(([s, v]) => `${s} ${signedPct(v as number)}`);
    const y = ytd?.account !== null && ytd?.account !== undefined ? ` Year to date ${signedPct(ytd.account, 1)}${Object.entries(ytd.benchmarks).filter(([, v]) => v !== null).map(([s, v]) => ` against ${s} ${signedPct(v as number, 1)}`).join(",")}.` : "";
    out.push({ head: `The ${period.kind === "weekly" ? "week" : "month"} in one line`, text: `${signedPct(r0.account)}${vs.length ? ` against ${vs.join(" and ")}` : ""}.${y} One ${period.kind === "weekly" ? "week" : "month"} is noise; the verdict does not read it.` });
  }
  if (moves && moves.rows.length >= 2) {
    const best = moves.rows[0];
    const worst = moves.rows[moves.rows.length - 1];
    const top = moves.byClass[0];
    out.push({ head: "What moved the book", text: `${best.symbol} ${signedPct(best.ret, 1)} (${signedPp(best.contrib)}) led; ${worst.symbol} ${signedPct(worst.ret, 1)} (${signedPp(worst.contrib)}) weighed most.${top ? ` ${top.label} added ${signedPp(top.contrib)} on ${top.weightEnd.toFixed(1)}% of the book.` : ""}` });
  }
  const over = weights.filter((w) => w.state === "over" && w.cap);
  const near = weights.filter((w) => w.state === "near" && w.cap);
  if (over.length || near.length) {
    const words = [
      ...over.map((w) => `${w.symbol} ${w.weight.toFixed(2)}% is ${money(((w.weight - w.cap!.cap) / 100) * netWorth)} over its ${w.cap!.cap}% cap (${w.cap!.rule.section})`),
      ...near.map((w) => `${w.symbol} ${w.weight.toFixed(2)}% is within half a point of its ${w.cap!.cap}% cap`),
    ];
    out.push({ head: over.length ? "Caps drifted" : "Near a cap", text: `${words.join("; ")}.` });
  }
  const c = concentration(weights);
  if (c && weights.length >= 3) {
    const top3 = weights.slice(0, 3).map((w) => w.symbol).join(", ");
    out.push({ head: "Concentration and cash", text: `${top3} hold ${c.top3.toFixed(1)}% of the book; the top five ${c.top5.toFixed(1)}%. Cash is ${cash.toFixed(1)}%${cash < 1 ? ", so any new buy is funded by a sale" : ""}.` });
  }
  if (corr) {
    out.push({ head: "Diversification", text: `Holdings moved together at ${corr.average.toFixed(2)} on average over ${corr.days} sessions${Object.entries(corr.book).filter(([, v]) => v !== null).map(([s, v]) => `; the book's correlation to ${s} is ${(v as number).toFixed(2)}`).join("")}. ${corr.tight.length ? `Pairs above 0.8: ${corr.tight.map((p) => `${p.a} and ${p.b} ${p.r.toFixed(2)}`).join(", ")}.` : `Tightest pair: ${corr.highest[0].a} and ${corr.highest[0].b} at ${corr.highest[0].r.toFixed(2)}.`}` });
  }
  if (trades.length) {
    const clean = trades.filter((t) => t.logged.state !== "none" && t.logged.state !== "after" && t.voted.state !== "after" && !(t.side === "buy" && t.overCap));
    const late = trades.filter((t) => t.logged.state === "after" || t.voted.state === "after");
    out.push({ head: trades.length === 1 ? "The one trade" : `${trades.length} trades`, text: `${trades.map((t) => `${t.side === "buy" ? "Bought" : "Sold"} ${t.symbol} ${money(t.amount)} on ${shortDate(t.date)}`).join("; ")}. ${clean.length === trades.length ? "Each had its entry and vote on or before the day." : late.length ? `${late.map((t) => t.symbol).join(", ")}: the entry or the vote came after the trade. Decide first, then trade.` : "Not every trade has its entry; see the rulebook."}` });
  }
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// The month in numbers

export type Capture = { up: number | null; down: number | null; upDays: number; downDays: number };
export type Tracking = { trackingError: number | null; informationRatio: number | null; n: number };

/** Paired daily returns of the account and a benchmark over (from, to], on the account's own dates. */
function paired(book: Book, benchmark: string, w: Window): { a: number[]; b: number[]; perYear: number } | null {
  const idx = navIndex(book);
  const bi = benchmarkIndex(book, benchmark);
  if (!idx || !bi) return null;
  const s0 = w.from < idx.dates[0] ? idx.dates[0] : w.from;
  const dates = [s0, ...idx.dates.filter((d) => d > s0 && d <= w.to)];
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const p0 = valueOnOrBefore(idx.dates, idx.index, dates[i - 1]);
    const p1 = valueOnOrBefore(idx.dates, idx.index, dates[i]);
    const q0 = valueOnOrBefore(bi.dates, bi.index, dates[i - 1]);
    const q1 = valueOnOrBefore(bi.dates, bi.index, dates[i]);
    if (p0 === null || p1 === null || q0 === null || q1 === null || p0 <= 0 || q0 <= 0) continue;
    a.push(p1 / p0 - 1);
    b.push(q1 / q0 - 1);
  }
  if (a.length < 3) return null;
  const gap = daysBetween(dates[0], dates[dates.length - 1]) / Math.max(1, dates.length - 1);
  return { a, b, perYear: gap <= 2 ? 252 : gap <= 8 ? 52 : 12 };
}

/** Up and down capture: the account's return on the benchmark's up (down) days over the benchmark's, in percent. */
export function captureOver(book: Book, benchmark: string, w: Window): Capture | null {
  const p = paired(book, benchmark, w);
  if (!p) return null;
  let au = 0;
  let bu = 0;
  let ad = 0;
  let bd = 0;
  let upDays = 0;
  let downDays = 0;
  for (let i = 0; i < p.a.length; i += 1) {
    if (p.b[i] > 0) {
      au += p.a[i];
      bu += p.b[i];
      upDays += 1;
    } else if (p.b[i] < 0) {
      ad += p.a[i];
      bd += p.b[i];
      downDays += 1;
    }
  }
  return { up: bu > 0 ? (au / bu) * 100 : null, down: bd < 0 ? (ad / bd) * 100 : null, upDays, downDays };
}

/** Tracking error (annualised, percent) and information ratio against the benchmark over (from, to]. */
export function trackingOver(book: Book, benchmark: string, w: Window): Tracking | null {
  const p = paired(book, benchmark, w);
  if (!p) return null;
  const d = p.a.map((v, i) => v - p.b[i]);
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / (d.length - 1));
  return { trackingError: sd > 0 ? sd * Math.sqrt(p.perYear) * 100 : null, informationRatio: sd > 0 ? (mean * p.perYear) / (sd * Math.sqrt(p.perYear)) : null, n: d.length };
}

export type Hindsight = { symbol: string; date: string; price: number; scoreOn: string; laterDate: string | null; later: number | null; changePct: number | null; pnl: number };

/** Each sale of the period scored 30 days after at the closes per holding; a sale not yet 30 days old says when it will be scored. */
export function hindsightOver(book: Book, sales: readonly Sale[]): Hindsight[] {
  return sales.map((s) => {
    const price = s.quantity > 0 ? s.proceeds / s.quantity : 0;
    const c = closesOf(book, s.symbol.toUpperCase());
    const scoreOn = addDays(s.date, 30);
    const later = c && scoreOn <= book.asOf ? valueOnOrBefore(c.dates, c.values, scoreOn) : null;
    const lead = book.holdings.find((h) => h.symbol.toUpperCase() === s.symbol.toUpperCase());
    const rate = lead ? (rateOf(lead.currency, book.fx) ?? 1) : 1;
    const laterBase = later === null ? null : later * rate;
    return { symbol: s.symbol.toUpperCase(), date: s.date, price, scoreOn, laterDate: scoreOn <= book.asOf ? scoreOn : null, later: laterBase, changePct: laterBase !== null && price > 0 ? (laterBase / price - 1) * 100 : null, pnl: s.pnl };
  });
}

export type MonthStats = {
  risk: RiskStats | null;
  benchmark: string | null;
  capture: Capture | null;
  tracking: Tracking | null;
  sinceStart: RiskStats | null;
  trades: { period: TradeStats; ytd: TradeStats } | null;
  sales: Sale[];
  hindsight: Hindsight[];
  warnings: string[];
};

/** The month in numbers, from the account's own series and ledger. */
export function monthStats(book: Book, benchmarks: readonly string[], period: Period): MonthStats {
  const w: Window = { from: period.from, to: period.to };
  const benchmark = benchmarks[0] ?? null;
  const lots = matchLots(book);
  const closedIn = lots.closed.filter((l) => inPeriod(l.closed, period));
  const ytd = ytdWindow(period.to);
  const closedYtd = lots.closed.filter((l) => l.closed > ytd.from && l.closed <= ytd.to);
  const sales = salesOf(closedIn);
  return {
    risk: riskOver(book, benchmark, w),
    benchmark,
    capture: benchmark ? captureOver(book, benchmark, w) : null,
    tracking: benchmark ? trackingOver(book, benchmark, w) : null,
    sinceStart: riskStats(book, benchmark, "Since start"),
    trades: book.transactions.length ? { period: tradeStats(closedIn), ytd: tradeStats(closedYtd) } : null,
    sales,
    hindsight: hindsightOver(book, sales),
    warnings: lots.warnings,
  };
}

// ---------------------------------------------------------------------------
// News, on the person's own Claude provider

/** Haiku first since the beta (Hamza, 9 Nov 2026), Sonnet when no item holds. */
export const NEWS_MODEL = MODELS.fast;
export const NEWS_MAX_SEARCHES = 12;

const newsItem = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), text: z.string().min(1).max(400), url: z.string().url() });
/** The topics a market item is filed under, each its own slide in HCMP's order. */
export const NEWS_TOPICS = ["macro", "tech", "geopolitics"] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number];
export const NEWS_TOPIC_LABEL: Record<NewsTopic, string> = { macro: "Markets and macro", tech: "Tech and AI", geopolitics: "Geopolitics with market relevance" };

export const newsSchema = z.object({
  holdings: z.array(newsItem.extend({ symbol: z.string().max(20), read: z.string().max(300) })).max(30),
  /** A news file kept before topics reads as macro. */
  markets: z.array(newsItem.extend({ head: z.string().max(120), topic: z.enum(NEWS_TOPICS).default("macro") })).max(16),
  upcoming: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), item: z.string().max(200), url: z.string().url().nullable() })).max(16),
});
export type News = z.infer<typeof newsSchema>;

/**
 * One request: the model searches the web for the period's news on each
 * holding, the markets and macro, and the next four weeks of dated events,
 * and records what it found with the page each item came from. Nothing
 * without a source; no advice; terse.
 */
export function newsRequestBody(subjects: readonly { symbol: string; name: string }[], period: Period, today: string, model = NEWS_MODEL): Record<string, unknown> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["holdings", "markets", "upcoming"],
    properties: {
      holdings: { type: "array", items: { type: "object", additionalProperties: false, required: ["symbol", "date", "text", "url", "read"], properties: { symbol: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, text: { type: "string", description: "What happened, with its figures, under 300 characters." }, url: { type: "string" }, read: { type: "string", description: "What it means for the holding's business, under 200 characters; 'Nothing changes' when nothing does." } } } },
      markets: { type: "array", items: { type: "object", additionalProperties: false, required: ["head", "topic", "date", "text", "url"], properties: { head: { type: "string" }, topic: { type: "string", enum: [...NEWS_TOPICS], description: "macro: rates, inflation, central banks, the dollar, oil. tech: technology and AI that bears on the holdings. geopolitics: conflicts, elections, sanctions and trade measures that move markets." }, date: { type: "string" }, text: { type: "string" }, url: { type: "string" } } } },
      upcoming: { type: "array", items: { type: "object", additionalProperties: false, required: ["date", "item", "url"], properties: { date: { type: "string" }, item: { type: "string" }, url: { type: ["string", "null"] } } } },
    },
  };
  return {
    model,
    max_tokens: NEWS_MAX_TOKENS,
    system:
      `You gather the news for a person's own ${period.kind} portfolio review, period ${period.label} (today is ${today}). Use web_search, at most ${NEWS_MAX_SEARCHES} searches. ` +
      "For each holding, one item at most: a filing, a results release, a product or regulatory event from the period, with the figures the source gives. Then up to twelve items beyond the holdings that bear on them, each filed under one topic: macro (rates, inflation prints, central banks, the dollar, oil), tech (technology and AI), geopolitics (conflicts, elections, sanctions and trade measures with market relevance); up to six a topic. Then the dated events of the next four weeks (results dates, central bank decisions, data releases) with a source each. " +
      "Every item carries the URL of the page it came from and its date as YYYY-MM-DD; an item without a page is left out. Never estimate a figure. Say 'Nothing changes' for the read when the news changes nothing. No recommendations, no predictions, no encouragement. Not investment advice; terse. " +
      `${READ_BEHIND.replace(/^- /, "")} Put what is behind an item in its read, with the page that shows it. ` +
      "Your whole answer is one call to record_news; write nothing outside it.",
    messages: [{ role: "user", content: [{ type: "text", text: `Holdings: ${subjects.map((s) => `${s.symbol} (${s.name})`).join(", ")}.\nPeriod: ${period.from} (close) to ${period.to}.` }] }],
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: NEWS_MAX_SEARCHES },
      { name: "record_news", description: "Record the period's news, each item with its source.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
  };
}

export type NewsParse = { ok: true; news: News; dropped: number } | { ok: false; why: string };

/** Room for the whole record_news call: thirty holding items, sixteen market items and sixteen dates, each with its page, run past 4,000 tokens for a book of a dozen holdings (Hamza, 18 Oct 2026: the news came back cut and none was kept). */
export const NEWS_MAX_TOKENS = 16_000;

/** A date as the model wrote it, as YYYY-MM-DD: the first such run in it, else what the clock makes of it ("October 15, 2026"), else null. */
export function newsDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const iso = v.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** A page's address as the model wrote it, trimmed, http(s) alone; else null. */
export function newsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim();
  try {
    return /^https?:$/.test(new URL(u).protocol) ? u : null;
  } catch {
    return null;
  }
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? (v.trim().length > max ? v.trim().slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : v.trim()) : "");

/**
 * The one record_news call, item by item (Hamza, 18 Oct 2026: one item with
 * a date written "October 15" or a line over the limit threw the whole
 * week's news away). A date is read in any shape, a line too long is
 * clipped, an item without a date or a page is dropped and counted; an
 * answer in words, or one with nothing usable, is refused with a sentence.
 */
export function parseNewsResponse(body: unknown): NewsParse {
  const content = (body as { content?: { type?: string; name?: string; input?: unknown }[]; stop_reason?: string } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_news");
  if (!call) return { ok: false, why: (body as { stop_reason?: string } | null)?.stop_reason === "max_tokens" ? "The model ran out of room before recording the news." : "The model answered in words instead of recording the news." };
  const input = (call.input ?? {}) as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(input[k]) ? (input[k] as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);
  let dropped = 0;
  const holdings: News["holdings"] = [];
  for (const x of list("holdings")) {
    const date = newsDate(x.date);
    const url = newsUrl(x.url);
    const text = clip(x.text, 400);
    if (!date || !url || !text) {
      dropped += 1;
      continue;
    }
    holdings.push({ symbol: clip(x.symbol, 20).toUpperCase(), date, text, url, read: clip(x.read, 300) });
  }
  const markets: News["markets"] = [];
  for (const x of list("markets")) {
    const date = newsDate(x.date);
    const url = newsUrl(x.url);
    const text = clip(x.text, 400);
    if (!date || !url || !text) {
      dropped += 1;
      continue;
    }
    const topic = (NEWS_TOPICS as readonly string[]).includes(String(x.topic)) ? (x.topic as NewsTopic) : "macro";
    markets.push({ head: clip(x.head, 120) || clip(text, 120), topic, date, text, url });
  }
  const upcoming: News["upcoming"] = [];
  for (const x of list("upcoming")) {
    const date = newsDate(x.date);
    const item = clip(x.item, 200);
    if (!date || !item) {
      dropped += 1;
      continue;
    }
    upcoming.push({ date, item, url: newsUrl(x.url) });
  }
  const parsed = newsSchema.safeParse({ holdings: holdings.slice(0, 30), markets: markets.slice(0, 16), upcoming: upcoming.slice(0, 16) });
  if (!parsed.success) return { ok: false, why: "The news did not fit its shape, so none was kept." };
  if (!holdings.length && !markets.length && !upcoming.length) return { ok: false, why: dropped ? `The model recorded ${dropped} item${dropped === 1 ? "" : "s"}, none with a date and a page, so none was kept.` : "The model recorded no news for the period." };
  return { ok: true, news: parsed.data, dropped };
}

// ---------------------------------------------------------------------------
// Everything a review derives, in one pass

export type ReviewInput = {
  m: Methodology | null;
  book: Book;
  inputs: readonly InputId[];
  decisions: DecisionsFile | null;
  filings: FilingsFile | null;
  period: Period;
  /** Today on the person's clock: clocks and countdowns are read from it. */
  today: string;
  /** The next scheduled report, when known. */
  nextReport?: string | null;
};

export type Review = {
  period: Period;
  benchmarks: string[];
  ctx: EvalCtx;
  findings: Finding[];
  caps: Cap[];
  weights: Weight[];
  netWorth: number;
  mix: ClassMix[];
  signals: Signal[];
  dated: DatedItem[];
  alarms: ActionItem[];
  returns: ReturnRow[];
  /** The period's and the year's cumulative paths, for the charts. */
  paths: { period: Path | null; ytd: Path | null };
  markets: MarketMove[];
  moves: Moves | null;
  correlation: Correlation | null;
  trades: ReviewTrade[];
  rules: RuleRow[];
  theses: ThesisRow[];
  pillars: Pillar[];
  verdict: Verdict | null;
  insights: { head: string; text: string }[];
  todo: TodoItem[];
  coming: DatedItem[];
  cash: number;
  month: MonthStats | null;
  fills: Fill[];
};

export function deriveReview(src: ReviewInput): Review {
  const { m, book, inputs, decisions, filings, period, today } = src;
  const ctx = contextFor(book, today, m);
  const findings = m ? evaluate(m, book, today, inputs) : [];
  const caps = capsFor(m);
  const { weights, netWorth } = weightsFor(book, m, ctx);
  const signals = signalsFor(findings);
  const dated = datedItems(book, m, ctx, src.nextReport ?? null);
  const benchmarks = benchmarksOf(m);
  const returns = returnRows(book, benchmarks, period);
  const moves = movesOver(book, weights, period);
  const correlation = correlationOver(
    book,
    weights.filter((w) => w.weight >= CORRELATION_MIN_WEIGHT).map((w) => w.symbol),
    benchmarks,
    period.to,
  );
  const trades = tradesOver(book, weights, decisions, period);
  const rules = m ? rulebook(m, findings, trades, caps) : [];
  const theses = thesesOver(m, weights, ctx, signals, caps, dated, filings, decisions, period);
  const pillars = m ? [behaviourPillar(rules, trades), holdingsPillar(theses)] : [];
  const cash = cashShare(book);
  const todo = m ? todoFor({ m, book, ctx, findings, weights, signals, dated, decisions, inputs, today }) : [];
  return {
    period,
    benchmarks,
    ctx,
    findings,
    caps,
    weights,
    netWorth,
    mix: classMix(book, m, ctx),
    signals,
    dated,
    alarms: needsYou(weights, signals, dated, today),
    returns,
    paths: { period: pathOver(book, benchmarks, period, "day"), ytd: pathOver(book, benchmarks, ytdWindow(period.to), "month") },
    markets: marketsOver(book, m, period),
    moves,
    correlation,
    trades,
    rules,
    theses,
    pillars,
    verdict: m ? verdictOf(pillars) : null,
    insights: insights(book.fx.base, period, returns, moves, weights, netWorth, trades, correlation, cash),
    todo,
    coming: dated.filter((d) => daysBetween(period.to, d.date) >= 0 && daysBetween(period.to, d.date) <= WATCH_DAYS),
    cash,
    month: period.kind === "monthly" ? monthStats(book, benchmarks, period) : null,
    fills: fillsOf(book).filter((f) => inPeriod(f.date, period)),
  };
}

/** The holding a signal or a trade is about, for links. */
export const holdingOf = (book: Book, symbol: string): Holding | null => book.holdings.find((h) => h.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
