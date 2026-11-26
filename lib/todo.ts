/**
 * The methodology to-do list: what the person's own methodology requires that
 * is not on file yet, holding by holding, each item citing its section and
 * saying what done looks like. Derived from the rules against the book, the
 * records, the Decision Log and the filings; nothing is invented, so a rule
 * the app cannot read stays "yours to check" rather than becoming a task it
 * made up. Pure; the To do screen and Today read it through lib/screen-data.
 *
 *   now    breaches, holdings no class places, sales without an entry
 *   due    every clock, expiry, maturity and report, by date
 *   later  what each manual rule asks per holding and lacks a record for,
 *          what a waiting rule needs, holdings near their cap, a voted
 *          class the methodology's tests do not give
 *   decided what the person decided in the app, until the reading it was
 *          taken on changes, the date it named comes, or (for a rule
 *          checked by hand) a week has passed
 *
 * Each item says which action answers it (`act`); the decision is a Decision
 * Log entry whose `action.on` is the item's key (lib/decisions.ts).
 */
import { triggerNotices } from "@/lib/alerts";
import { decisionOn, decisionsFor, outcomeWords, saleLogged, votedClassOf, type Decision, type DecisionsFile, type Outcome } from "@/lib/decisions";
import type { Book, Holding } from "@/lib/holdings";
import type { Finding, Methodology, Rule } from "@/lib/methodology";
import { FIELDS, type EvalCtx } from "@/lib/ontology";
import { classNeeds, needsWords, type Needs } from "@/lib/recipes";
import type { DatedItem, Signal, Weight } from "@/lib/screens";
import { INPUTS, type InputId } from "@/lib/setup";
import { fillsOf } from "@/lib/trades";

export type TodoGroup = "now" | "due" | "later" | "decided";
export const TODO_GROUPS: readonly TodoGroup[] = ["now", "due", "later", "decided"];
export const TODO_GROUP_LABEL: Record<TodoGroup, string> = { now: "Do now", due: "Due by a date", later: "Owed, no date", decided: "Decided" };
export const TODO_GROUP_ABOUT: Record<TodoGroup, string> = {
  now: "Breaches, holdings no class places, and sales with no Decision Log entry.",
  due: "Clocks, expiries, maturities and the next report, soonest first.",
  later: "What the methodology asks for each holding and has no record of yet, the data a rule waits for, holdings near their cap, and voted classes the tests do not give.",
  decided: "What you decided here, shown until the reading changes or the date it named comes; a rule you checked comes back after a week.",
};

/**
 * The action that answers an item: plan a trim; decide (hold, trim, sell,
 * probation); vote; mark a rule checked; settle an expiry or maturity
 * (rolled, closed, let go); log a sale. Null when the item is answered by
 * data alone (a figure to supply, a report that sends itself).
 */
export type TodoAct = "trim" | "decide" | "vote" | "check" | "settle" | "log" | null;

/** The outcomes each action offers, in the order the form lists them. */
export const OUTCOMES_FOR: Record<Exclude<TodoAct, "log" | null>, readonly Outcome[]> = {
  trim: ["trim", "hold", "sell"],
  decide: ["hold", "trim", "sell", "probation"],
  vote: ["hold", "add", "trim", "sell", "probation"],
  check: ["checked"],
  settle: ["rolled", "closed", "let_go"],
};

/** A rule checked by hand stays checked this many days, then comes back for the next review. */
export const CHECKED_DAYS = 7;
/** A decision with no date of its own (a hold, say) answers its item this many days, then the item asks again: once a quarter. */
export const DECIDED_DAYS = 90;

export type TodoItem = {
  key: string;
  group: TodoGroup;
  title: string;
  /** Why the methodology asks for it, with the section. */
  why: string;
  /** What done looks like. */
  done: string;
  section: string | null;
  symbol: string | null;
  date: string | null;
  href: string;
  act: TodoAct;
  /** The reading the item rests on, so a decision taken on it can tell when it changed. */
  reading: string | null;
  /** The decision that answers it, when there is one. */
  decision: Decision | null;
};

export type TodoSource = {
  m: Methodology;
  book: Book;
  ctx: EvalCtx;
  findings: readonly Finding[];
  weights: readonly Weight[];
  signals: readonly Signal[];
  dated: readonly DatedItem[];
  decisions: DecisionsFile | null;
  inputs: readonly InputId[];
  today: string;
};

const LISTED = new Set(["equity", "etf", "option", "bond", "private_fund", "real_estate", "other"]);
const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const holdingHref = (symbol: string) => `/holdings/${encodeURIComponent(symbol)}`;
const inputLabel = (id: InputId) => INPUTS[id].label;

/** A manual rule that speaks of every holding, trade or decision, so it is owed per holding. */
export const PER_HOLDING = /\b(every|each|per|any|all)\s+(holding|position|stock|company|business|buy|purchase|sale|sell|trade|decision|reclassification|investment)\b/i;
/** What a per-holding manual rule asks for, from its words. */
export type Duty = "vote" | "record" | "valuation" | null;
export function dutyOf(rule: Rule): Duty {
  const t = rule.text;
  if (/\b(vote|voted|committee|\bIC\b|logged|log\b|decision log)/i.test(t)) return "vote";
  if (/\b(thesis|record|pathway|trigger|kill signal|written|write|document)/i.test(t)) return "record";
  if (/\b(valuation|dcf|intrinsic|fair value)/i.test(t)) return "valuation";
  return null;
}

/** "a, b, c and 12 more": a long list of figures named in a line. */
const namedFew = (labels: readonly string[], n = 4) => (labels.length <= n ? labels.join(", ") : `${labels.slice(0, n).join(", ")} and ${labels.length - n} more`);

/** The symbols the book lists, once each, cash and deposits aside. */
function listedSymbols(book: Book): { symbol: string; holdings: Holding[] }[] {
  const by = new Map<string, Holding[]>();
  for (const h of book.holdings) {
    if (!LISTED.has(h.assetClass)) continue;
    const k = h.symbol.toUpperCase();
    by.set(k, [...(by.get(k) ?? []), h]);
  }
  return [...by.entries()].map(([symbol, holdings]) => ({ symbol, holdings }));
}

export function todoFor(src: TodoSource): TodoItem[] {
  const { m, book, ctx, findings, weights, signals, dated, decisions, inputs, today } = src;
  const out: TodoItem[] = [];
  const listed = listedSymbols(book);

  // Now: over a cap.
  const capRules = new Set<string>();
  for (const w of weights) {
    if (w.state !== "over" || !w.cap) continue;
    capRules.add(w.cap.rule.id);
    const sell = w.sharesToCap !== null ? ` Selling about ${w.sharesToCap.toFixed(2)} sh restores the cap.` : "";
    out.push({ key: `cap:${w.symbol}`, group: "now", title: `Bring ${w.symbol} within its ${w.cap.cap}% cap`, why: `${w.weight.toFixed(2)}% now against ${w.cap.cap}% (${w.cap.rule.section}).${sell}`, done: `${w.symbol} at or under ${w.cap.cap}%, with the sale and its reason in the Decision Log.`, section: w.cap.rule.section, symbol: w.symbol, date: null, href: holdingHref(w.symbol), act: "trim", reading: null, decision: null });
  }
  // Now: every other breach, per holding where the rule reads one.
  for (const s of signals) {
    if (s.status !== "red" || capRules.has(s.rule.id)) continue;
    const reading = s.reading ? `${s.reading} against ${s.limit ?? "the limit"}` : "the reading is outside the limit";
    out.push({ key: `red:${s.key}`, group: "now", title: s.symbol ? `${s.symbol}: ${s.rule.text}` : s.rule.text, why: `${reading} (${s.rule.section}).`, done: s.symbol ? `The reading back inside the limit, or ${s.symbol} sold with an entry naming the reason.` : "The reading back inside the limit.", section: s.rule.section, symbol: s.symbol, date: null, href: s.symbol ? holdingHref(s.symbol) : "/signals", act: "decide", reading: null, decision: null });
  }
  // Now: a trigger or kill signal on a holding's own record that its reading meets.
  for (const n of triggerNotices(book, today)) {
    const symbol = n.key.split(":")[1] ?? null;
    out.push({ key: n.key, group: "now", title: n.title, why: n.detail, done: "A decision on it: hold, trim, sell or probation.", section: null, symbol, date: null, href: n.href, act: "decide", reading: null, decision: null });
  }
  // Now: holdings no class places, when the methodology has classes.
  const classSection = m.rules.find((r) => /classif|archetype|class\b/i.test(r.text))?.section ?? null;
  if (m.classes.length) {
    for (const { symbol, holdings } of listed) {
      if (holdings.some((h) => ctx.classOf(h) !== null)) continue;
      // A vote on it is answered by the voted-class item below, never by placing it.
      if (votedClassOf(decisions, symbol)) continue;
      const needs = new Map<string, Needs>();
      for (const c of m.classes) for (const n of classNeeds(c, inputs)) if (!ctx.supplied.has(n.field)) needs.set(n.field, n);
      const waiting = [...needs.values()];
      const why = waiting.length
        ? `No class places it yet: its classes read ${namedFew(waiting.map((n) => n.label.toLowerCase()))}, which no input supplies.${waiting.every((n) => n.inputs === null) ? " Filings are read by themselves once the SEC contact is confirmed on Setup." : ` ${needsWords(waiting, inputLabel)}`}`
        : `It meets no class's criteria on the figures the app has${classSection ? ` (${classSection})` : ""}.`;
      out.push({ key: `class:${symbol}`, group: "now", title: `Classify ${symbol}`, why, done: waiting.length ? `${symbol} placed by a class once its figures are read.` : `A class whose criteria ${symbol} meets, or a decision on it in the Decision Log.`, section: classSection, symbol, date: null, href: waiting.length && waiting.every((n) => n.inputs === null) ? "/setup" : holdingHref(symbol), act: waiting.length ? null : "vote", reading: null, decision: null });
    }
  }
  // Now: sales in the last year with no Decision Log entry.
  const saleRule = m.rules.find((r) => !r.test && /\b(sale|sell|sold|exit)\b/i.test(r.text)) ?? null;
  const sales = new Map<string, { symbol: string; date: string }>();
  for (const f of fillsOf(book)) if (f.side === "sell") sales.set(`${f.symbol.toUpperCase()}:${f.date}`, { symbol: f.symbol.toUpperCase(), date: f.date });
  for (const sale of sales.values()) {
    if (daysBetween(sale.date, today) > 365 || saleLogged(decisions, sale.symbol, sale.date)) continue;
    out.push({ key: `sale:${sale.symbol}:${sale.date}`, group: "now", title: `Log the sale of ${sale.symbol} on ${sale.date}`, why: saleRule ? `${saleRule.text} (${saleRule.section}). No entry names ${sale.symbol} within a week of the sale.` : `No Decision Log entry names ${sale.symbol} within a week of the sale.`, done: "An entry dated within a week of the sale, with the reason and the vote.", section: saleRule?.section ?? null, symbol: sale.symbol, date: null, href: `/decisions?kind=trade&symbol=${encodeURIComponent(sale.symbol)}&title=${encodeURIComponent(`Sold ${sale.symbol}`)}`, act: "log", reading: null, decision: null });
  }

  // Due: everything dated, by date.
  for (const d of [...dated].sort((a, b) => a.date.localeCompare(b.date))) {
    out.push({ key: `dated:${d.key}`, group: "due", title: d.title, why: d.detail, done: d.kind === "clock" ? "Decided by the date, with an entry in the Decision Log." : d.kind === "report" ? "Nothing; it is sent on its own." : "Rolled, closed or let go by the date.", section: d.section, symbol: d.symbol, date: d.date, href: d.symbol ? holdingHref(d.symbol) : "/calendar", act: d.kind === "clock" ? "decide" : d.kind === "report" ? null : "settle", reading: d.date, decision: null });
  }

  // Later: what each manual rule asks per holding and has no record of.
  for (const rule of m.rules) {
    if (rule.test) continue;
    const duty = PER_HOLDING.test(rule.text) ? dutyOf(rule) : null;
    if (!duty) {
      out.push({ key: `manual:${rule.id}`, group: "later", title: `Yours to check: ${rule.text}`, why: `The app cannot measure it (${rule.section}).`, done: "Checked by you at each review; a note in the Decision Log when it bites.", section: rule.section, symbol: null, date: null, href: "/methodology", act: "check", reading: null, decision: null });
      continue;
    }
    for (const { symbol, holdings } of listed) {
      const h = holdings[0];
      if (duty === "vote" && decisionsFor(decisions, symbol).length) continue;
      if (duty === "record" && h.record?.note) continue;
      if (duty === "valuation" && h.record?.ownValuation) continue;
      const title = duty === "vote" ? `Record the vote on ${symbol}` : duty === "record" ? `Write ${symbol}'s record` : `Record your own valuation for ${symbol}`;
      const done = duty === "vote" ? `A vote entry naming ${symbol} in the Decision Log.` : duty === "record" ? `A note on ${symbol}'s record under Customise, Records, or a study of it on Research.` : `A base case, and a range if you have one, on ${symbol}'s record under Customise, Records.`;
      const href = duty === "vote" ? `/decisions?kind=vote&symbol=${encodeURIComponent(symbol)}&title=${encodeURIComponent(`Vote on ${symbol}`)}` : "/customise";
      out.push({ key: `${duty}:${rule.id}:${symbol}`, group: "later", title, why: `${rule.text} (${rule.section})`, done, section: rule.section, symbol, date: null, href, act: duty === "vote" ? "vote" : null, reading: null, decision: null });
    }
  }
  // Later: what a waiting rule needs, once per field.
  const needed = new Map<string, { n: Needs; rules: Rule[] }>();
  for (const f of findings) {
    if (f.status !== "n/a") continue;
    for (const n of f.needs) {
      const e = needed.get(n.field) ?? { n, rules: [] };
      e.rules.push(f.rule);
      needed.set(n.field, e);
    }
  }
  for (const { n, rules } of needed.values()) {
    const from = n.inputs ? `from ${n.inputs.map(inputLabel).join(" or ")}` : FIELDS[n.field].object === "holdings" && /_pct$|cover|conversion|leverage|ratio|growth|margin|roic|debt/.test(n.field) ? "read from SEC filings on Setup" : "which no connection supplies yet";
    out.push({ key: `needs:${n.field}`, group: "later", title: `Supply ${n.label.toLowerCase()}`, why: `${rules.length === 1 ? "One rule waits" : `${rules.length} rules wait`} for it (${[...new Set(rules.map((r) => r.section))].join(", ")}): ${n.label.toLowerCase()}, ${from}.`, done: `The rule${rules.length === 1 ? "" : "s"} reading on the Methodology screen.`, section: rules[0].section, symbol: null, date: null, href: "/setup", act: null, reading: null, decision: null });
  }
  // Later: near a cap.
  for (const w of weights) {
    if (w.state !== "near" || !w.cap) continue;
    out.push({ key: `near:${w.symbol}`, group: "later", title: `${w.symbol} is near its ${w.cap.cap}% cap`, why: `${w.weight.toFixed(2)}% now (${w.cap.rule.section}). No new money.`, done: `Room under the cap, or a plan to trim at the next review.`, section: w.cap.rule.section, symbol: w.symbol, date: null, href: holdingHref(w.symbol), act: "trim", reading: null, decision: null });
  }
  // Later: a class the person voted that the methodology's tests do not give. The vote is kept, never applied.
  for (const { symbol, holdings } of listed) {
    const vote = votedClassOf(decisions, symbol);
    if (!vote?.action?.votedClass) continue;
    const voted = vote.action.votedClass;
    const tested = holdings.map((h) => ctx.classOf(h)).find((c) => c !== null) ?? null;
    if (tested === voted) continue;
    const label = (id: string | null) => (id ? (m.classes.find((c) => c.id === id)?.label ?? id) : "no class");
    out.push({ key: `voted:${symbol}:${voted}`, group: "later", title: `The methodology does not yet give ${symbol} the class ${label(voted)}`, why: `You voted ${label(voted)} on ${vote.date}; the tests place it in ${label(tested)}${classSection ? ` (${classSection})` : ""}. A class comes from the tests alone, so the vote is kept beside it and never applied.`, done: `An amendment whose rules place ${symbol} in ${label(voted)}, or a new vote.`, section: classSection, symbol, date: null, href: "/methodology", act: null, reading: null, decision: vote });
  }

  const order: Record<TodoGroup, number> = { now: 0, due: 1, later: 2, decided: 3 };
  return withDecisions(out, decisions, today).sort((a, b) => order[a.group] - order[b.group] || (a.date ?? "").localeCompare(b.date ?? ""));
}

/**
 * Lays each item's decision on it. A hold, an add, a settled expiry, an
 * accepted or kept valuation: decided while the item holds, for at most a
 * quarter, and at once undone when the reading it was taken on (a clock's
 * date) changes. A trim, a sale or a probation with a date: due on that date, and
 * back to "now" once it has passed with the item still there. A rule checked
 * by hand: decided for a week. A decision whose reading has changed leaves
 * the item where it was, saying what was decided and on what.
 */
export function withDecisions(items: readonly TodoItem[], decisions: DecisionsFile | null, today: string): TodoItem[] {
  return items.map((item) => {
    if (item.act === null || item.act === "log") return item;
    const d = decisionOn(decisions, item.key);
    if (!d?.action) return item;
    const a = d.action;
    const words = outcomeWords(a);
    if (a.outcome === "checked") return daysBetween(d.date, today) < CHECKED_DAYS ? { ...item, group: "decided", title: `Checked ${d.date}: ${item.title.replace(/^Yours to check: /, "")}`, decision: d } : item;
    if (a.reading !== null && item.reading !== null && a.reading !== item.reading) return { ...item, why: `${item.why} Decided ${words} on ${d.date} at ${a.reading}; it reads ${item.reading} now.`, decision: d };
    if ((a.outcome === "trim" || a.outcome === "sell" || a.outcome === "probation") && a.by) {
      if (a.by < today) return { ...item, group: "now", title: `${item.title}: ${words}, past its date`, decision: d };
      return { ...item, group: "due", date: a.by, title: `${words}: ${item.title}`, why: `Decided ${d.date}. ${item.why}`, decision: d };
    }
    if (daysBetween(d.date, today) > DECIDED_DAYS) return { ...item, why: `${item.why} Last decided ${words} on ${d.date}, over a quarter ago.`, decision: d };
    return { ...item, group: "decided", title: `${words}, ${d.date}: ${item.title}`, decision: d };
  });
}

/** Counts per group, for the Today line and the subtitle. */
export function todoCounts(items: readonly TodoItem[]): Record<TodoGroup, number> {
  const n = (g: TodoGroup) => items.filter((i) => i.group === g).length;
  return { now: n("now"), due: n("due"), later: n("later"), decided: n("decided") };
}
