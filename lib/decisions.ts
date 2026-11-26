/**
 * The Decision Log: the person's own record of what they decided and why. A
 * trade, a vote, a change to the methodology, a note. Kept in their vault as
 * the `decisions` file; the Trade check drafts an entry and the Decision Log
 * screen files it. Nothing here comes from a broker. Pure.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A plan is a trade written down before it is made (Hamza, 9 Nov 2026, the twenty further ways: cooling-off trades); the reasoned-trade score sets planned trades against the rest. */
export const DECISION_KINDS = ["trade", "vote", "methodology", "note", "plan"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const DECISION_LABEL: Record<DecisionKind, string> = { trade: "Trade", vote: "Vote", methodology: "Methodology", note: "Note", plan: "Plan" };

/**
 * What an in-app action decided, when the entry was filed from one: the task
 * or signal it answers (`on`, the to-do item's key), the outcome, and its
 * terms. A vote may name the class voted; it is recorded beside the class
 * the methodology's tests give and never replaces it.
 */
export const OUTCOMES = ["hold", "add", "trim", "sell", "probation", "rolled", "closed", "let_go", "checked", "accepted", "kept"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = { hold: "Hold", add: "Add", trim: "Trim", sell: "Sell", probation: "Probation", rolled: "Rolled", closed: "Closed", let_go: "Let go", checked: "Checked", accepted: "Accepted", kept: "Kept mine" };
export const actionSchema = z.object({
  on: z.string().min(1).max(200),
  outcome: z.enum(OUTCOMES),
  /** Trim to this weight, in percent of net worth. */
  targetPct: z.number().min(0).max(100).nullable(),
  /** Trim or sell by, or probation until. */
  by: isoDate.nullable(),
  /** The class the vote names (its id in the methodology); never applied. */
  votedClass: z.string().max(60).nullable(),
  /** The reading the decision was taken on, so a changed reading asks again. */
  reading: z.string().max(80).nullable(),
});
export type DecisionAction = z.infer<typeof actionSchema>;

export const decisionSchema = z.object({
  id: z.string().min(1).max(40),
  date: isoDate,
  kind: z.enum(DECISION_KINDS),
  /** The holding or watched symbol it concerns; null for a decision about the whole. */
  symbol: z.string().max(40).nullable(),
  title: z.string().min(1).max(120),
  text: z.string().max(4000),
  /** When it was filed, so an edited entry keeps its place. */
  filedAt: z.string(),
  /** Set when the entry was filed from an action on a task, a signal or a clock. */
  action: actionSchema.nullable().optional(),
  /** Who wrote it: the person, or their own Claude through the connector (record_decision, Hamza, 9 Nov 2026); an edit makes it theirs. */
  via: z.enum(["you", "claude"]).optional(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const MAX_DECISIONS = 2000;

export const decisionsFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(decisionSchema).max(MAX_DECISIONS),
  updated: z.string(),
});
export type DecisionsFile = z.infer<typeof decisionsFileSchema>;
export const EMPTY_DECISIONS: DecisionsFile = { version: 1, entries: [], updated: "" };

/** Entries newest first, by date then by when they were filed. */
export function sortedDecisions(file: DecisionsFile | null): Decision[] {
  return [...(file?.entries ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.filedAt.localeCompare(a.filedAt));
}

/** The entries naming a symbol, newest first. */
export function decisionsFor(file: DecisionsFile | null, symbol: string): Decision[] {
  const s = symbol.toUpperCase();
  return sortedDecisions(file).filter((d) => d.symbol?.toUpperCase() === s);
}

/** The file with one entry added or replaced (same id). Oldest entries fall off past the limit. */
export function withDecision(file: DecisionsFile | null, entry: Decision, now: string): DecisionsFile {
  const rest = (file?.entries ?? []).filter((d) => d.id !== entry.id);
  const entries = sortedDecisions({ version: 1, entries: [...rest, entry], updated: now }).slice(0, MAX_DECISIONS);
  return { version: 1, entries, updated: now };
}

export function withoutDecision(file: DecisionsFile | null, id: string, now: string): DecisionsFile {
  return { version: 1, entries: (file?.entries ?? []).filter((d) => d.id !== id), updated: now };
}

/** A stable id from the date and a counter, so two entries filed the same second stay apart. */
export function decisionId(file: DecisionsFile | null, date: string): string {
  const n = (file?.entries ?? []).filter((d) => d.id.startsWith(date)).length + 1;
  return `${date}-${String(n).padStart(2, "0")}`;
}

/**
 * Whether a sale on `date` has an entry naming its symbol within a week either
 * side: the Decision Log check the Trades screen runs when the log has entries.
 */
export function saleLogged(file: DecisionsFile | null, symbol: string, date: string): boolean {
  const s = symbol.toUpperCase();
  const t = Date.parse(`${date}T00:00:00Z`);
  return (file?.entries ?? []).some((d) => d.symbol?.toUpperCase() === s && Math.abs(Date.parse(`${d.date}T00:00:00Z`) - t) <= 7 * 86_400_000);
}

/** The newest entry that answers the task or signal `on`, or null. */
export function decisionOn(file: DecisionsFile | null, on: string): Decision | null {
  return sortedDecisions(file).find((d) => d.action?.on === on) ?? null;
}

/** The newest vote naming a class for a symbol, or null. */
export function votedClassOf(file: DecisionsFile | null, symbol: string): Decision | null {
  return decisionsFor(file, symbol).find((d) => d.kind === "vote" && d.action?.votedClass) ?? null;
}

// ---------------------------------------------------------------------------
// Written by the person's own Claude (record_decision, Hamza, 9 Nov 2026)

/** What the person's Claude may file: an entry in their words, never an action's terms, which only the app's own forms set. */
export const decisionWriteSchema = z.object({
  kind: z.enum(DECISION_KINDS).describe("trade: a purchase or sale and why; vote: a vote on a class or a rule; methodology: a change to the methodology; note: anything else worth keeping."),
  symbol: z.string().regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/).optional().describe("The holding or watched symbol it concerns; leave it out for a decision about the whole."),
  title: z.string().min(1).max(120).describe("One line: what was decided."),
  text: z.string().max(4000).describe("Why, in the person's own words as they gave them; what was weighed, and what would change it."),
  date: isoDate.optional().describe("The day it was decided (YYYY-MM-DD); today when left out. Never a day to come."),
});
export type DecisionWrite = z.infer<typeof decisionWriteSchema>;

/** A sentence the tool relays when an entry cannot be filed. */
export class DecisionWriteProblem extends Error {}

/** The entry the person's Claude files, marked as its own; a day to come is refused. */
export function decisionFromWrite(file: DecisionsFile | null, w: DecisionWrite, today: string, now: string): Decision {
  const date = w.date ?? today;
  if (date > today) throw new DecisionWriteProblem(`The Decision Log keeps what was decided, so ${date} cannot be its day; today is ${today}.`);
  return decisionSchema.parse({ id: decisionId(file, date), date, kind: w.kind, symbol: w.symbol ? w.symbol.toUpperCase() : null, title: w.title.trim(), text: w.text.trim(), filedAt: now, action: null, via: "claude" });
}

/** "Hold", "Trim to 30% by 7 Nov 2026", "Probation until 1 Aug 2027": the terms of an action in words. */
export function outcomeWords(a: DecisionAction): string {
  const by = a.by ? ` ${a.outcome === "probation" ? "until" : "by"} ${a.by}` : "";
  if (a.outcome === "trim") return `Trim${a.targetPct !== null ? ` to ${a.targetPct}%` : ""}${by}`;
  return `${OUTCOME_LABEL[a.outcome]}${by}`;
}
