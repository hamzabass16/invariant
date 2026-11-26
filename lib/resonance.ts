/**
 * Resonance (Hamza, 4 Nov 2026): the Dashboard's verdict first, in one line.
 * How closely the book keeps the person's own rules: the rules kept out of
 * the rules the app can measure, from the methodology's own checks
 * (`evaluate` in lib/methodology.ts, the same findings the Methodology
 * screen's Checks and the connector's run_checks read). A rule the app
 * cannot measure is counted apart as the person's to check, never as kept
 * (hard rule 3); a rule waiting for data is counted apart too; a watch is a
 * level the person asked to hear about, not a rule, so it is counted apart
 * as tripped and never decides the score. With nothing measurable there is
 * no score, never a zero. Decisions owed are the to-do's items that ask for
 * a decision now (a trim, a decision, a vote, an entry for a sale) and the
 * new trades on Notifications still asking for their reason. Pure.
 */

import type { Finding } from "@/lib/methodology";
import type { Notice } from "@/lib/screens";
import type { TodoAct, TodoItem } from "@/lib/todo";

/** The words behind the score, shown on hover and beside the (i). */
export const RESONANCE_ABOUT = "How closely the book keeps your own rules: rules kept out of the rules the app can measure. A rule it cannot measure is yours to check and never counts as kept; a watch is a level you asked to hear about and is counted apart.";

/** The to-do's actions that are a decision for the person (a check by hand or a date to settle is not). */
export const DECISION_ACTS: readonly TodoAct[] = ["trim", "decide", "vote", "log"];

/** The prefix of a new trade's notice (lib/alerts.ts TRADE_PREFIX), repeated here so this module stays free of the alerts module. */
const TRADE_KEY = "trade:";

/** A rule the book does not keep, for the line's citation margin: its section and its words. */
export type Unkept = { id: string; section: string; text: string; severity: "breach" | "guideline" };

export type Resonance = {
  /** Rules kept out of the rules the app can measure, in percent, rounded; null when it can measure none. */
  score: number | null;
  /** Within the limit or near it, watches aside. */
  kept: number;
  /** Tested on the book's figures today, watches aside. */
  measured: number;
  /** Hard limits broken. */
  breaches: number;
  /** Guidelines the book is outside of. */
  outside: number;
  /** Watches whose level was reached. */
  tripped: number;
  /** Rules the app cannot measure: the person's to check. */
  manual: number;
  /** Rules waiting for an input or a reading. */
  waiting: number;
  /** Decisions the to-do and the new trades ask for now. */
  owed: number;
  /** The rules not kept, breaches first, each with its section. */
  unkept: Unkept[];
};

/** The verdict line's figures from the methodology's findings, its to-do and today's notices. */
export function resonanceOf(findings: readonly Finding[], todo: readonly TodoItem[], notices: readonly Notice[]): Resonance {
  const rules = findings.filter((f) => f.rule.severity !== "watch");
  const kept = rules.filter((f) => f.status === "pass" || f.status === "near").length;
  const failing = rules.filter((f) => f.status === "fail");
  const measured = kept + failing.length;
  const unkept: Unkept[] = failing
    .map((f) => ({ id: f.rule.id, section: f.rule.section, text: f.rule.text, severity: f.rule.severity as "breach" | "guideline" }))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "breach" ? -1 : 1));
  return {
    score: measured ? Math.round((kept / measured) * 100) : null,
    kept,
    measured,
    breaches: failing.filter((f) => f.rule.severity === "breach").length,
    outside: failing.filter((f) => f.rule.severity === "guideline").length,
    tripped: findings.filter((f) => f.rule.severity === "watch" && f.status === "fail").length,
    manual: findings.filter((f) => f.status === "manual").length,
    waiting: findings.filter((f) => f.status === "n/a").length,
    owed: decisionsOwed(todo, notices),
    unkept,
  };
}

/**
 * What asks for a decision now: each to-do item in Now whose action is a
 * decision, and each new trade still asking for its reason, less a sale the
 * to-do already asks to log (the same sale, `sale:SYMBOL:DATE`).
 */
export function decisionsOwed(todo: readonly TodoItem[], notices: readonly Notice[]): number {
  const now = todo.filter((t) => t.group === "now" && DECISION_ACTS.includes(t.act));
  const sales = new Set(now.filter((t) => t.key.startsWith("sale:")).map((t) => t.key.slice("sale:".length)));
  const trades = notices.filter((n) => {
    if (!n.key.startsWith(TRADE_KEY)) return false;
    const [symbol, date, kind] = n.key.slice(TRADE_KEY.length).split(":");
    return !(kind === "sell" && sales.has(`${symbol}:${date}`));
  });
  return now.length + trades.length;
}

/** "1 breach", "2 breaches", "1,284 decisions": a count with its noun, the digits grouped. */
export function counted(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
