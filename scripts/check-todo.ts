/**
 * Holds the methodology to-do list (lib/todo.ts) to hand-worked answers: a
 * breach is a task now, a sale without a Decision Log entry is a task until
 * the entry exists, a manual rule that speaks of every holding is owed per
 * holding until its record exists, a waiting rule asks for its data once, and
 * every dated item is due by its date. Run: npm run check:todo
 */
import { readFileSync } from "node:fs";

import { EMPTY_DECISIONS, withDecision, type Decision, type DecisionsFile } from "../lib/decisions";
import { bookSchema, type Book } from "../lib/holdings";
import { adoptMethodology, libraryEntry } from "../lib/library";
import { methodologySchema, type Methodology, type Rule } from "../lib/methodology";
import { DEFAULT_PREFERENCES, EMPTY_RECORDS } from "../lib/preferences";
import { deriveScreens } from "../lib/screen-data";
import { shownWhen } from "../lib/screens";
import { CHECKED_DAYS, DECIDED_DAYS, dutyOf, PER_HOLDING, todoCounts, todoFor, withDecisions, type TodoItem } from "../lib/todo";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const read = (f: string) => JSON.parse(readFileSync(`data/samples/${f}`, "utf8"));
const dani = bookSchema.parse(read("dani.book.json"));
const mInd = methodologySchema.parse(read("methodology.individual.json"));
const hcmp = adoptMethodology(libraryEntry("hcmp")!);
const today = "2026-10-11";
const INPUTS = ["ibkr", "schwab"] as const;

function todo(m: Methodology, book: Book, decisions: DecisionsFile = EMPTY_DECISIONS): TodoItem[] {
  const shown = shownWhen(m, book, EMPTY_RECORDS, decisions);
  const data = deriveScreens({ book, methodology: m, inputs: INPUTS, shown, filings: null, decisions, preferences: DEFAULT_PREFERENCES }, today);
  return todoFor({ m, book, ctx: data.ctx, findings: data.findings, weights: data.weights, signals: data.signals, dated: data.dated, decisions, inputs: INPUTS, today });
}
const titles = (items: TodoItem[], group?: TodoItem["group"]) => items.filter((i) => !group || i.group === group).map((i) => i.title);
const rule = (text: string): Rule => ({ id: "r", section: "1", text, severity: "breach", test: null });

// --- Words ---------------------------------------------------------------------
check("a rule on every buy is owed per holding", PER_HOLDING.test("Every buy, sell or reclassification is a logged IC vote."));
check("a rule on a call is not", !PER_HOLDING.test("Never sell a call without the shares or a long call behind it."));
check("vote words", dutyOf(rule("Every buy, sell or reclassification is a logged IC vote.")) === "vote");
check("record words", dutyOf(rule("Each holding has a written thesis with two triggers.")) === "record");
check("valuation words", dutyOf(rule("Every holding needs your own DCF, refreshed each year.")) === "valuation");
check("no duty words", dutyOf(rule("Every position is reviewed each quarter.")) === null);

// --- The options sample: one breach, one manual rule, option expiries -----------
const ind = todo(mInd, dani);
check("AAPL over its 35% cap is the first task", titles(ind, "now")[0] === "Bring AAPL within its 35% cap", titles(ind, "now").join(" | "));
check("its why cites the section and the shares to sell", /\(1\.1\)/.test(ind[0].why) && /Selling about/.test(ind[0].why));
check("done looks like the cap met and the sale logged", /at or under 35%/.test(ind[0].done) && /Decision Log/.test(ind[0].done));
check("the rule on calls is yours to check, once", titles(ind, "later").filter((t) => /Yours to check: Never sell a call/.test(t)).length === 1);
check("option expiries are due by their date", ind.filter((i) => i.group === "due").every((i) => i.date !== null) && ind.some((i) => i.group === "due" && /expires/.test(i.title)));
check("now, then due by date, then later", ind.map((i) => i.group).join(",") === [...ind.filter((i) => i.group === "now"), ...ind.filter((i) => i.group === "due"), ...ind.filter((i) => i.group === "later")].map((i) => i.group).join(","));
const due = ind.filter((i) => i.group === "due").map((i) => i.date!);
check("due items are sorted soonest first", due.join(",") === [...due].sort().join(","));
check("counts add up", (() => { const c = todoCounts(ind); return c.now + c.due + c.later === ind.length; })());
check("no sale in the ledger, nothing to log", !titles(ind).some((t) => /^Log the sale/.test(t)));

// --- HCMP on a book without filings: classify, vote, supply ----------------------
const h = todo(hcmp, dani);
const classify = h.filter((i) => /^Classify /.test(i.title));
check("every listed symbol is a classify task, once each", classify.length === new Set(dani.holdings.filter((x) => x.assetClass !== "cash").map((x) => x.symbol.toUpperCase())).size && classify.every((i) => i.group === "now"));
check("it says what the classes read and where to get it", classify.every((i) => /no input supplies/.test(i.why) && /SEC contact is confirmed on Setup/.test(i.why) && i.href === "/setup"));
const votes = h.filter((i) => /^Record the vote on /.test(i.title));
check("the vote rule is owed for every listed holding", votes.length === classify.length && votes.every((i) => i.group === "later" && /D\.1\(b\)/.test(i.why) && /kind=vote/.test(i.href)));
const withVote = withDecision(EMPTY_DECISIONS, { id: "2026-10-01-01", date: "2026-10-01", kind: "vote", symbol: "AAPL", title: "AAPL confirmed", text: "", filedAt: "2026-10-01T00:00:00.000Z" }, "2026-10-01T00:00:00.000Z");
const h2 = todo(hcmp, dani, withVote);
check("a vote entry for AAPL closes its task and no other", !titles(h2).includes("Record the vote on AAPL") && titles(h2).includes("Record the vote on VOO"));
const supply = h.filter((i) => /^Supply /.test(i.title));
check("each field a rule waits for is asked for once", supply.length === new Set(supply.map((i) => i.key)).size && supply.some((i) => /return on invested capital/.test(i.title)) && supply.every((i) => /read from SEC filings on Setup/.test(i.why)));
check("the sale reasons and the probation rule are yours to check", titles(h, "later").some((t) => /Yours to check: A sale needs one of four reasons/.test(t)) && titles(h, "later").some((t) => /Probation Hold/.test(t)));
check("every item cites a section, or is an expiry, maturity or report, or says what is missing", h.every((i) => i.section !== null || i.group === "due" || /cannot measure|no input supplies|no class/i.test(i.why)));

// --- Sales without an entry --------------------------------------------------------
const sold: Book = { ...dani, transactions: [...dani.transactions, { date: "2026-09-01", account: "IBKR", kind: "sell", symbol: "AAPL", quantity: 10, price: 230, amount: 2300, currency: "USD" }, { date: "2025-06-01", account: "IBKR", kind: "sell", symbol: "VOO", quantity: 1, price: 500, amount: 500, currency: "USD" }] };
const s1 = todo(hcmp, sold);
check("a sale in the last year without an entry is a task now", s1.some((i) => i.group === "now" && i.title === "Log the sale of AAPL on 2026-09-01" && /\(3\.4\)/.test(i.why) && /kind=trade&symbol=AAPL/.test(i.href)));
check("a sale older than a year is left alone", !titles(s1).some((t) => /Log the sale of VOO/.test(t)));
const logged = withDecision(EMPTY_DECISIONS, { id: "2026-09-03-01", date: "2026-09-03", kind: "trade", symbol: "AAPL", title: "Sold AAPL", text: "Opportunity Cost.", filedAt: "2026-09-03T00:00:00.000Z" }, "2026-09-03T00:00:00.000Z");
check("an entry within a week of the sale closes it", !titles(todo(hcmp, sold, logged)).some((t) => /^Log the sale/.test(t)));

// --- Decisions answer items --------------------------------------------------------
const item = (over: Partial<TodoItem>): TodoItem => ({ key: "cap:AAPL", group: "now", title: "Bring AAPL within its 35% cap", why: "40% now.", done: "", section: "1.1", symbol: "AAPL", date: null, href: "/holdings/AAPL", act: "trim", reading: null, decision: null, ...over });
const decided = (date: string, action: Partial<NonNullable<Decision["action"]>>, kind: Decision["kind"] = "trade"): DecisionsFile =>
  withDecision(EMPTY_DECISIONS, { id: `${date}-01`, date, kind, symbol: "AAPL", title: "Decided", text: "", filedAt: `${date}T08:00:00.000Z`, action: { on: "cap:AAPL", outcome: "hold", targetPct: null, by: null, votedClass: null, reading: null, ...action } }, `${date}T08:00:00.000Z`);
const one = (i: TodoItem, d: DecisionsFile, day = today) => withDecisions([i], d, day)[0];
const trimDated = one(item({}), decided("2026-10-05", { outcome: "trim", targetPct: 30, by: "2026-11-07" }));
check("a dated trim moves the item to due on its date", trimDated.group === "due" && trimDated.date === "2026-11-07" && /^Trim to 30% by 2026-11-07/.test(trimDated.title) && trimDated.decision !== null);
const trimPast = one(item({}), decided("2026-10-05", { outcome: "trim", targetPct: 30, by: "2026-10-09" }));
check("past its date with the item still there, it is back to now", trimPast.group === "now" && /past its date/.test(trimPast.title));
const held = one(item({ act: "decide", key: "cap:AAPL" }), decided("2026-10-05", { outcome: "hold" }));
check("a hold is decided", held.group === "decided" && /^Hold, 2026-10-05/.test(held.title));
const stale = one(item({ act: "decide" }), decided("2026-06-01", { outcome: "hold" }));
check(`a hold older than ${DECIDED_DAYS} days asks again`, stale.group === "now" && /over a quarter ago/.test(stale.why));
const check1 = item({ key: "manual:r1", group: "later", act: "check", title: "Yours to check: Never sell a call" });
const checkedFile = decided("2026-10-08", { on: "manual:r1", outcome: "checked" }, "note");
check(`a rule checked lasts ${CHECKED_DAYS} days`, one(check1, checkedFile).group === "decided" && /^Checked 2026-10-08: Never sell a call/.test(one(check1, checkedFile).title) && one(check1, checkedFile, "2026-10-15").group === "later");
const clock = item({ key: "dated:clock:BIRK", group: "due", date: "2026-11-07", act: "decide", reading: "2026-11-07" });
check("a clock decided on its date is decided", one(clock, decided("2026-10-05", { on: "dated:clock:BIRK", reading: "2026-11-07" })).group === "decided");
const moved = one({ ...clock, reading: "2027-02-07" }, decided("2026-10-05", { on: "dated:clock:BIRK", reading: "2026-11-07" }));
check("a clock whose date moved asks again and says what was decided", moved.group === "due" && /Decided Hold on 2026-10-05 at 2026-11-07; it reads 2027-02-07 now/.test(moved.why));
check("a decision on another item answers nothing", one(item({}), decided("2026-10-05", { on: "cap:MSFT" })).group === "now");
check("a sale to log is answered only by its entry", one(item({ act: "log", key: "sale:AAPL:2026-09-01" }), decided("2026-10-05", { on: "sale:AAPL:2026-09-01" })).group === "now");
check("counts include the decided", todoCounts([held, trimDated]).decided === 1 && todoCounts([held, trimDated]).due === 1);

// --- A vote records its class and never applies it ----------------------------------
const voteClass = hcmp.classes[0];
const voted = withDecision(EMPTY_DECISIONS, { id: "2026-10-02-01", date: "2026-10-02", kind: "vote", symbol: "AAPL", title: "Vote on AAPL", text: "", filedAt: "2026-10-02T08:00:00.000Z", action: { on: "vote:x:AAPL", outcome: "hold", targetPct: null, by: null, votedClass: voteClass.id, reading: null } }, "2026-10-02T08:00:00.000Z");
const v = todo(hcmp, dani, voted);
const vItem = v.find((i) => i.key === `voted:AAPL:${voteClass.id}`);
check("a voted class the tests do not give is an item that says so", !!vItem && vItem.group === "later" && vItem.title.includes(voteClass.label) && /never applied/.test(vItem.why), vItem?.title);
check("the vote takes AAPL off the classify list, and no other", !titles(v).includes("Classify AAPL") && titles(v).includes("Classify VOO"));

// --- Triggers on a record ------------------------------------------------------------
const trig: Book = { ...dani, holdings: dani.holdings.map((x) => (x.symbol === "AAPL" && x.record ? { ...x, record: { ...x.record, triggers: [{ id: "k1", kind: "kill" as const, field: "price", is: "lte" as const, value: 240, note: "Below the thesis floor." }, { id: "t1", kind: "trigger" as const, field: "price", is: "gte" as const, value: 400, note: null }] } } : x)) };
const t = todo(hcmp, trig).filter((i) => i.key.startsWith("trigger:"));
check("a met kill signal is a decision now, an unmet trigger is nothing", t.length === 1 && t[0].key === "trigger:AAPL:k1" && t[0].group === "now" && t[0].act === "decide" && /kill signal met, price 230 at or below 240/.test(t[0].title), t.map((i) => i.title).join(" | "));

// --- Nothing owed ------------------------------------------------------------------
const bare: Methodology = { ...mInd, rules: [], classes: [] };
check("no rules, no classes: nothing but the dated items", todo(bare, dani).every((i) => i.group === "due"));

console.log(failed ? `\n${passed} passed, ${failed} failed` : `\ncheck:todo ok (${passed} passed): the to-do list is what the rules call for, read against the records, the Decision Log and the filings.`);
process.exit(failed ? 1 : 0);
