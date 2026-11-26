/**
 * How good the person's judgement is, read from what they wrote before the
 * fact (Hamza, 9 Nov 2026, the twenty more ways): the calibration of their
 * own valuations (did the bear to bull range hold the price a year on?) and
 * the reasoned-trade score (how many trades carried a reason, and how those
 * reasons fared against SPY since). Both score the thinking, never the size
 * of a position or an amount. Pure.
 */
import type { Decision, DecisionsFile } from "@/lib/decisions";
import type { Book } from "@/lib/holdings";
import { addDaysTo, daysBetween } from "@/lib/time";

type Series = readonly { date: string; value: number }[] | undefined;

const closeOn = (s: Series, day: string): { day: string; price: number } | null => {
  if (!s?.length) return null;
  for (let i = s.length - 1; i >= 0; i--) if (s[i].date <= day) return { day: s[i].date, price: s[i].value };
  return null;
};

// ---------------------------------------------------------------------------
// Calibration

/** A valuation is judged this many days after the day it was set. */
export const CALIBRATION_DAYS = 365;

export type Valuation = { low: number | null; base: number; high: number | null; asOf: string };
export type CalibrationRow = { symbol: string; asOf: string; due: string; low: number | null; base: number; high: number | null; price: number | null; side: "below" | "inside" | "above" | null; baseGapPct: number | null };

/**
 * Each own valuation (the record's bear, base and bull per share) set at
 * least a year ago, against the close a year after it was set: inside the
 * range, below the bear or above the bull, and how far the base was from
 * the price. One set less than a year ago is waiting, with the day it is
 * judged; one without a bear and a bull has no range to judge.
 */
export function calibrationOf(valuations: Readonly<Record<string, Valuation | null | undefined>>, series: Readonly<Record<string, Series>>, today: string): { rows: CalibrationRow[]; waiting: { symbol: string; due: string }[]; judged: number; inside: number; sharePct: number | null; medianBaseGapPct: number | null } {
  const rows: CalibrationRow[] = [];
  const waiting: { symbol: string; due: string }[] = [];
  for (const [symbol, v] of Object.entries(valuations)) {
    if (!v || v.low === null || v.high === null || !(v.base > 0)) continue;
    const due = addDaysTo(v.asOf, CALIBRATION_DAYS);
    if (due > today) {
      waiting.push({ symbol, due });
      continue;
    }
    const c = closeOn(series[symbol], due);
    const fresh = c && daysBetween(c.day, due) <= 7 ? c : null;
    const price = fresh?.price ?? null;
    const side = price === null ? null : price < v.low ? "below" : price > v.high ? "above" : "inside";
    rows.push({ symbol, asOf: v.asOf, due, low: v.low, base: v.base, high: v.high, price, side, baseGapPct: price === null ? null : Math.round(((price - v.base) / v.base) * 1000) / 10 });
  }
  const judged = rows.filter((r) => r.side !== null);
  const inside = judged.filter((r) => r.side === "inside").length;
  const gaps = judged.map((r) => Math.abs(r.baseGapPct!)).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return {
    rows: rows.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    waiting: waiting.sort((a, b) => a.due.localeCompare(b.due)),
    judged: judged.length,
    inside,
    sharePct: judged.length ? Math.round((inside / judged.length) * 100) : null,
    medianBaseGapPct: gaps.length ? (gaps.length % 2 ? gaps[mid] : Math.round(((gaps[mid - 1] + gaps[mid]) / 2) * 10) / 10) : null,
  };
}

// ---------------------------------------------------------------------------
// The reasoned-trade score

/** The trades read: the past year of the broker's own ledger. */
export const REASONED_DAYS = 365;
/** A trade's reason is judged once this many days have passed. */
export const JUDGE_AFTER_DAYS = 30;

export type ReasonedRow = { symbol: string; date: string; side: "buy" | "sell"; reason: string | null; movePct: number | null; spyPct: number | null; right: boolean | null };

/**
 * Every share bought or sold in the past year, a day's fills of one symbol
 * on one side as one trade, with whether a Decision Log entry gives its
 * reason (an entry answering its question, or a trade entry naming the
 * company within a week either side). A reasoned trade at least
 * `JUDGE_AFTER_DAYS` old is judged against SPY since: a buy that beat SPY,
 * a sale that then did worse, was right. Options are left out.
 */
export function reasonedTrades(book: Pick<Book, "transactions" | "asOf">, decisions: DecisionsFile | null, series: Readonly<Record<string, Series>>, today: string): { rows: ReasonedRow[]; trades: number; reasoned: number; reasonedPct: number | null; judged: number; right: number; rightPct: number | null } {
  const from = addDaysTo(today, -REASONED_DAYS);
  const by = new Map<string, { symbol: string; date: string; side: "buy" | "sell" }>();
  for (const t of book.transactions) {
    if ((t.kind !== "buy" && t.kind !== "sell") || t.quantity === 0 || t.date < from || t.date > today) continue;
    const symbol = t.symbol.trim().toUpperCase();
    by.set(`${symbol}:${t.date}:${t.kind}`, { symbol, date: t.date, side: t.kind });
  }
  const entries = decisions?.entries ?? [];
  const reasonOf = (x: { symbol: string; date: string; side: string }) => {
    const d = entries.find((e) => e.action?.on === `trade:${x.symbol}:${x.date}:${x.side}`) ?? entries.find((e) => e.kind === "trade" && e.symbol?.toUpperCase() === x.symbol && Math.abs(daysBetween(e.date, x.date)) <= 7);
    return d ? (d.title || d.text).slice(0, 160) : null;
  };
  const spyNow = closeOn(series.SPY, today);
  const rows = [...by.values()].map((x): ReasonedRow => {
    const reason = reasonOf(x);
    if (!reason || daysBetween(x.date, today) < JUDGE_AFTER_DAYS) return { ...x, reason, movePct: null, spyPct: null, right: null };
    const then = closeOn(series[x.symbol], x.date);
    const now = closeOn(series[x.symbol], today);
    const spyThen = closeOn(series.SPY, x.date);
    if (!then || !now || !spyThen || !spyNow) return { ...x, reason, movePct: null, spyPct: null, right: null };
    const movePct = (now.price / then.price - 1) * 100;
    const spyPct = (spyNow.price / spyThen.price - 1) * 100;
    return { ...x, reason, movePct, spyPct, right: x.side === "buy" ? movePct > spyPct : movePct < spyPct };
  });
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
  const reasoned = rows.filter((r) => r.reason).length;
  const judged = rows.filter((r) => r.right !== null);
  const right = judged.filter((r) => r.right).length;
  return { rows, trades: rows.length, reasoned, reasonedPct: rows.length ? Math.round((reasoned / rows.length) * 100) : null, judged: judged.length, right, rightPct: judged.length ? Math.round((right / judged.length) * 100) : null };
}

// ---------------------------------------------------------------------------
// Cooling-off trades, sale post-mortems and the monthly letter (Hamza, 9 Nov
// 2026, the twenty further ways)

/** A plan counts for a trade only when it was written at least this many days before it, ... */
export const PLAN_MIN_DAYS = 1;
/** ... and no more than this many. */
export const PLAN_WINDOW_DAYS = 30;

/** The side a plan names: its action's outcome (add a buy; sell or trim a sale), else its title's first word. */
export function planSide(d: Pick<Decision, "kind" | "title" | "action">): "buy" | "sell" | null {
  if (d.kind !== "plan") return null;
  const o = d.action?.outcome;
  if (o === "add") return "buy";
  if (o === "sell" || o === "trim") return "sell";
  return /^\s*(sell|trim)/i.test(d.title) ? "sell" : /^\s*(buy|add)/i.test(d.title) ? "buy" : null;
}

/** The plan written before a trade: the same company, the same side (or a side not said), a day to a month before. */
export function planFor(decisions: DecisionsFile | null, t: { symbol: string; date: string; side: "buy" | "sell" }): Decision | null {
  return (
    (decisions?.entries ?? [])
      .filter((e) => e.kind === "plan" && e.symbol?.toUpperCase() === t.symbol && (planSide(e) ?? t.side) === t.side)
      .filter((e) => {
        const ahead = daysBetween(e.date, t.date);
        return ahead >= PLAN_MIN_DAYS && ahead <= PLAN_WINDOW_DAYS;
      })
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

export type PlannedRow = { symbol: string; date: string; side: "buy" | "sell"; planned: string | null; movePct: number | null; spyPct: number | null; right: boolean | null };
export type PlanGroup = { trades: number; judged: number; right: number; rightPct: number | null };

const groupOf = (rows: readonly PlannedRow[]): PlanGroup => {
  const judged = rows.filter((r) => r.right !== null);
  const right = judged.filter((r) => r.right).length;
  return { trades: rows.length, judged: judged.length, right, rightPct: judged.length ? Math.round((right / judged.length) * 100) : null };
};

/**
 * Cooling-off trades: each of the past year's trades (as `reasonedTrades`
 * reads them), planned when a plan in the Decision Log named it a day to a
 * month before, impulsive otherwise; every trade at least
 * `JUDGE_AFTER_DAYS` old judged against SPY since, so planned trades are set
 * against impulsive ones on the same test. The plan itself is the person's
 * words; the app only counts and measures.
 */
export function plannedTrades(book: Pick<Book, "transactions" | "asOf">, decisions: DecisionsFile | null, series: Readonly<Record<string, Series>>, today: string): { rows: PlannedRow[]; planned: PlanGroup; impulsive: PlanGroup; plannedPct: number | null; open: Decision[] } {
  const from = addDaysTo(today, -REASONED_DAYS);
  const by = new Map<string, { symbol: string; date: string; side: "buy" | "sell" }>();
  for (const t of book.transactions) {
    if ((t.kind !== "buy" && t.kind !== "sell") || t.quantity === 0 || t.date < from || t.date > today) continue;
    const symbol = t.symbol.trim().toUpperCase();
    by.set(`${symbol}:${t.date}:${t.kind}`, { symbol, date: t.date, side: t.kind });
  }
  const spyNow = closeOn(series.SPY, today);
  const rows = [...by.values()].map((x): PlannedRow => {
    const plan = planFor(decisions, x);
    const planned = plan ? plan.date : null;
    if (daysBetween(x.date, today) < JUDGE_AFTER_DAYS) return { ...x, planned, movePct: null, spyPct: null, right: null };
    const then = closeOn(series[x.symbol], x.date);
    const now = closeOn(series[x.symbol], today);
    const spyThen = closeOn(series.SPY, x.date);
    if (!then || !now || !spyThen || !spyNow) return { ...x, planned, movePct: null, spyPct: null, right: null };
    const movePct = (now.price / then.price - 1) * 100;
    const spyPct = (spyNow.price / spyThen.price - 1) * 100;
    return { ...x, planned, movePct, spyPct, right: x.side === "buy" ? movePct > spyPct : movePct < spyPct };
  });
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
  const planned = rows.filter((r) => r.planned);
  // The plans still open: written in the past month and not yet followed by a trade on that side.
  const open = (decisions?.entries ?? []).filter((e) => e.kind === "plan" && e.symbol && daysBetween(e.date, today) <= PLAN_WINDOW_DAYS && !rows.some((r) => r.symbol === e.symbol!.toUpperCase() && r.date > e.date && (planSide(e) ?? r.side) === r.side));
  return { rows, planned: groupOf(planned), impulsive: groupOf(rows.filter((r) => !r.planned)), plannedPct: rows.length ? Math.round((planned.length / rows.length) * 100) : null, open: open.sort((a, b) => b.date.localeCompare(a.date)) };
}

/** A sale is looked back on this many days after it was made. */
export const POSTMORTEM_DAYS = 365;
/** Sales up to this many days past their look-back are kept on the list. */
export const POSTMORTEM_KEEP_DAYS = 365;

export type PostMortem = { symbol: string; date: string; due: string; reason: string | null; movePct: number | null; spyPct: number | null; verdict: "sold well" | "sold early" | null };

/**
 * Sale post-mortems: each sale a year old or more (and less than two), with
 * the reason written then (an entry answering its question, or a trade entry
 * naming the company within a week) against what the stock did in the year
 * after against SPY's year: it did worse than SPY, so the sale was well
 * made; it did better, so it was early. Sales still inside their year wait,
 * with the day each is looked back on.
 */
export function postMortems(book: Pick<Book, "transactions">, decisions: DecisionsFile | null, series: Readonly<Record<string, Series>>, today: string): { rows: PostMortem[]; waiting: { symbol: string; date: string; due: string }[]; judged: number; well: number } {
  const seen = new Set<string>();
  const rows: PostMortem[] = [];
  const waiting: { symbol: string; date: string; due: string }[] = [];
  const entries = decisions?.entries ?? [];
  for (const t of book.transactions) {
    if (t.kind !== "sell" || t.quantity === 0) continue;
    const symbol = t.symbol.trim().toUpperCase();
    const key = `${symbol}:${t.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const due = addDaysTo(t.date, POSTMORTEM_DAYS);
    if (due > today) {
      waiting.push({ symbol, date: t.date, due });
      continue;
    }
    if (daysBetween(due, today) > POSTMORTEM_KEEP_DAYS) continue;
    const d = entries.find((e) => e.action?.on === `trade:${symbol}:${t.date}:sell`) ?? entries.find((e) => (e.kind === "trade" || e.kind === "plan") && e.symbol?.toUpperCase() === symbol && Math.abs(daysBetween(e.date, t.date)) <= 7);
    const reason = d ? (d.text.trim() || d.title).slice(0, 240) : null;
    const then = closeOn(series[symbol], t.date);
    const after = closeOn(series[symbol], due);
    const spyThen = closeOn(series.SPY, t.date);
    const spyAfter = closeOn(series.SPY, due);
    const fresh = after && daysBetween(after.day, due) <= 7 ? after : null;
    const movePct = then && fresh ? Math.round((fresh.price / then.price - 1) * 1000) / 10 : null;
    const spyPct = spyThen && spyAfter ? Math.round((spyAfter.price / spyThen.price - 1) * 1000) / 10 : null;
    rows.push({ symbol, date: t.date, due, reason, movePct, spyPct, verdict: movePct === null || spyPct === null ? null : movePct < spyPct ? "sold well" : "sold early" });
  }
  rows.sort((a, b) => b.due.localeCompare(a.due) || a.symbol.localeCompare(b.symbol));
  const judged = rows.filter((r) => r.verdict);
  return { rows, waiting: waiting.sort((a, b) => a.due.localeCompare(b.due)), judged: judged.length, well: judged.filter((r) => r.verdict === "sold well").length };
}

export type LetterLine = { label: string; value: string; detail: string; tone: "ok" | "warn" | "info" };

/**
 * The monthly letter on how the person decided: one page of the month's
 * reasons written, plans made before trading, valuations judged a year on,
 * rules kept today and sales looked back on. Built from what the app
 * already read; it scores the thinking, never the money, and says when a
 * part has nothing to say yet.
 */
export function decidingLetter(i: {
  month: string;
  entries: readonly Pick<Decision, "date" | "kind">[];
  reasoned: { trades: number; reasoned: number; reasonedPct: number | null; rightPct: number | null } | null;
  planned: { planned: PlanGroup; impulsive: PlanGroup; plannedPct: number | null } | null;
  calibration: { judged: number; sharePct: number | null; medianBaseGapPct: number | null } | null;
  rules: { score: number | null; measured: number; breaches: number } | null;
  postMortems: { rows: readonly PostMortem[] } | null;
}): { month: string; lines: LetterLine[]; summary: string } {
  const inMonth = i.entries.filter((e) => e.date.slice(0, 7) === i.month);
  const kinds = (k: Decision["kind"]) => inMonth.filter((e) => e.kind === k).length;
  const lines: LetterLine[] = [];
  lines.push({ label: "Written down", value: `${inMonth.length} ${inMonth.length === 1 ? "entry" : "entries"}`, detail: inMonth.length ? `${kinds("trade")} trades, ${kinds("plan")} plans, ${kinds("vote")} votes, ${kinds("methodology")} methodology changes, ${kinds("note")} notes in the Decision Log this month.` : "Nothing was written in the Decision Log this month.", tone: inMonth.length ? "ok" : "warn" });
  if (i.reasoned) lines.push({ label: "Trades with a reason", value: i.reasoned.trades ? `${i.reasoned.reasoned} of ${i.reasoned.trades}` : "no trades", detail: i.reasoned.trades ? `${i.reasoned.reasonedPct ?? 0}% of the past year's trades carry a reason${i.reasoned.rightPct === null ? "" : `; ${i.reasoned.rightPct}% of the judged ones fared better than SPY since`}.` : "No buy or sale in the past year to score.", tone: i.reasoned.reasonedPct === null ? "info" : i.reasoned.reasonedPct >= 80 ? "ok" : "warn" });
  if (i.planned) lines.push({ label: "Planned before trading", value: i.planned.plannedPct === null ? "no trades" : `${i.planned.plannedPct}%`, detail: i.planned.planned.trades || i.planned.impulsive.trades ? `${i.planned.planned.trades} trades planned a day or more ahead, ${i.planned.impulsive.trades} not${i.planned.planned.rightPct !== null && i.planned.impulsive.rightPct !== null ? `; planned ones fared better than SPY ${i.planned.planned.rightPct}% of the time, the rest ${i.planned.impulsive.rightPct}%` : ""}.` : "No trade in the past year to set against a plan.", tone: i.planned.plannedPct === null ? "info" : i.planned.plannedPct >= 50 ? "ok" : "warn" });
  if (i.calibration) lines.push({ label: "Valuations a year on", value: i.calibration.judged ? `${i.calibration.sharePct ?? 0}% inside` : "none due", detail: i.calibration.judged ? `${i.calibration.judged} valuations judged; the price a year on sat inside the bear to bull range ${i.calibration.sharePct ?? 0}% of the time${i.calibration.medianBaseGapPct === null ? "" : `, ${i.calibration.medianBaseGapPct}% from the base at the median`}.` : "No valuation of yours is a year old yet.", tone: i.calibration.sharePct === null ? "info" : i.calibration.sharePct >= 60 ? "ok" : "warn" });
  if (i.rules) lines.push({ label: "Rules kept today", value: i.rules.score === null ? "none measured" : `${i.rules.score}%`, detail: i.rules.measured ? `${i.rules.measured} rules the app can measure${i.rules.breaches ? `, ${i.rules.breaches} breached today` : ", none breached today"}.` : "The methodology has no rule the app can measure yet.", tone: i.rules.score === null ? "info" : i.rules.breaches ? "warn" : "ok" });
  const pm = (i.postMortems?.rows ?? []).filter((r) => r.due.slice(0, 7) === i.month);
  if (i.postMortems) lines.push({ label: "Sales a year on", value: pm.length ? `${pm.filter((r) => r.verdict === "sold well").length} of ${pm.length} well made` : "none this month", detail: pm.length ? pm.slice(0, 4).map((r) => `${r.symbol}, sold ${r.date}${r.movePct === null ? "" : `: ${r.movePct > 0 ? "+" : ""}${r.movePct}% since against SPY's ${r.spyPct ?? "n/a"}%`}`).join("; ") + "." : "No sale turned a year old this month.", tone: pm.some((r) => r.verdict === "sold early") ? "warn" : pm.length ? "ok" : "info" });
  const warn = lines.filter((l) => l.tone === "warn").map((l) => l.label.toLowerCase());
  const summary = warn.length ? `This month, look again at: ${warn.join(", ")}.` : "This month, every part of how you decide that the app can read held up.";
  return { month: i.month, lines, summary };
}
