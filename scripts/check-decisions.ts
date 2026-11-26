/**
 * Holds the Decision Log (lib/decisions.ts) to hand-worked answers: order,
 * the symbol filter, replace-by-id and the cap, removal, ids per day, and
 * whether a sale has an entry within a week.
 * Run: npm run check:decisions
 */
import { decisionId, decisionOn, decisionSchema, decisionsFor, EMPTY_DECISIONS, MAX_DECISIONS, outcomeWords, saleLogged, sortedDecisions, votedClassOf, withDecision, withoutDecision, type Decision, type DecisionsFile } from "../lib/decisions";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const now = "2026-10-12T09:00:00.000Z";
const entry = (over: Partial<Decision>): Decision => ({ id: "x", date: "2026-10-01", kind: "note", symbol: null, title: "Entry", text: "", filedAt: "2026-10-01T08:00:00.000Z", ...over });

const a = entry({ id: "2026-10-01-01", date: "2026-10-01", kind: "trade", symbol: "aapl", title: "Trimmed Apple", filedAt: "2026-10-01T08:00:00.000Z" });
const b = entry({ id: "2026-10-05-01", date: "2026-10-05", kind: "vote", symbol: "MSFT", title: "Voted against the pay plan", filedAt: "2026-10-05T08:00:00.000Z" });
const c = entry({ id: "2026-10-05-02", date: "2026-10-05", kind: "note", symbol: null, title: "Later the same day", filedAt: "2026-10-05T17:00:00.000Z" });
const d = entry({ id: "2026-10-12-01", date: "2026-10-12", kind: "methodology", symbol: "AAPL", title: "Cap to 10%", filedAt: "2026-10-12T08:00:00.000Z" });
const file: DecisionsFile = { version: 1, entries: [a, c, d, b], updated: now };

// ── Order ────────────────────────────────────────────────────────────────────
check("newest first, then latest filed first within a day", same(sortedDecisions(file).map((e) => e.id), [d.id, c.id, b.id, a.id]));
check("an empty file sorts to nothing", sortedDecisions(null).length === 0 && sortedDecisions(EMPTY_DECISIONS).length === 0);

// ── Filter by symbol ─────────────────────────────────────────────────────────
check("decisionsFor matches the symbol regardless of case", same(decisionsFor(file, "AAPL").map((e) => e.id), [d.id, a.id]) && same(decisionsFor(file, "aapl").map((e) => e.id), [d.id, a.id]));
check("decisionsFor leaves out entries about the whole", !decisionsFor(file, "MSFT").some((e) => e.symbol === null) && decisionsFor(file, "MSFT").length === 1);
check("decisionsFor on an unknown symbol is empty", decisionsFor(file, "NVDA").length === 0);

// ── Add and replace ──────────────────────────────────────────────────────────
const added = withDecision(file, entry({ id: "2026-10-12-02", date: "2026-10-12", title: "Second today", filedAt: "2026-10-12T09:00:00.000Z" }), now);
check("withDecision adds an entry and keeps the order", added.entries.length === 5 && added.entries[0].id === "2026-10-12-02" && added.updated === now);
const replaced = withDecision(file, { ...b, title: "Voted for the pay plan" }, now);
check("withDecision replaces an entry with the same id", replaced.entries.length === 4 && replaced.entries.find((e) => e.id === b.id)?.title === "Voted for the pay plan");
check("withDecision on nothing starts a file", withDecision(null, a, now).entries.length === 1 && withDecision(null, a, now).version === 1);
const full: DecisionsFile = { version: 1, entries: Array.from({ length: MAX_DECISIONS }, (_, i) => entry({ id: `old-${i}`, date: "2020-01-01", filedAt: `2020-01-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z` })), updated: now };
const capped = withDecision(full, d, now);
check("withDecision caps at MAX_DECISIONS and keeps the newest", capped.entries.length === MAX_DECISIONS && capped.entries[0].id === d.id && !capped.entries.some((e) => e.id === "old-0"));

// ── Remove ───────────────────────────────────────────────────────────────────
const removed = withoutDecision(file, c.id, now);
check("withoutDecision takes one entry out", removed.entries.length === 3 && !removed.entries.some((e) => e.id === c.id) && removed.updated === now);
check("withoutDecision with an unknown id changes nothing but the date", withoutDecision(file, "nope", now).entries.length === 4);
check("withoutDecision on nothing is an empty file", withoutDecision(null, "x", now).entries.length === 0);

// ── Ids ──────────────────────────────────────────────────────────────────────
check("decisionId counts per day", decisionId(file, "2026-10-12") === "2026-10-12-02" && decisionId(file, "2026-10-05") === "2026-10-05-03");
check("decisionId starts at 01 on a fresh day", decisionId(file, "2026-10-13") === "2026-10-13-01" && decisionId(null, "2026-10-13") === "2026-10-13-01");

// ── Sales logged ─────────────────────────────────────────────────────────────
check("saleLogged within seven days before", saleLogged(file, "AAPL", "2026-10-08") && saleLogged(file, "aapl", "2026-09-24"));
check("saleLogged within seven days after", saleLogged(file, "MSFT", "2026-10-12") && saleLogged(file, "MSFT", "2026-09-28"));
check("saleLogged on the day itself", saleLogged(file, "AAPL", "2026-10-01"));
check("saleLogged not at eight days", !saleLogged(file, "MSFT", "2026-10-13") && !saleLogged(file, "MSFT", "2026-09-27"));
check("saleLogged false for a symbol with no entry", !saleLogged(file, "NVDA", "2026-10-05") && !saleLogged(null, "AAPL", "2026-10-01"));

// ── Actions ──────────────────────────────────────────────────────────────────
check("an entry filed before actions existed still reads", decisionSchema.safeParse({ id: "2026-09-01-01", date: "2026-09-01", kind: "note", symbol: null, title: "Old", text: "", filedAt: "2026-09-01T08:00:00.000Z" }).success);
const act = (over: Partial<NonNullable<Decision["action"]>>) => ({ on: "cap:AAPL", outcome: "trim" as const, targetPct: 30, by: "2026-11-07", votedClass: null, reading: null, ...over });
check("an action parses with its terms", decisionSchema.safeParse(entry({ id: "y", action: act({}) })).success);
check("an action with an unknown outcome is refused", !decisionSchema.safeParse(entry({ id: "y", action: { ...act({}), outcome: "buy_more" } as never })).success);
check("an action with a malformed date is refused", !decisionSchema.safeParse(entry({ id: "y", action: act({ by: "7 Nov" }) })).success);
check("outcomeWords says the terms", outcomeWords(act({})) === "Trim to 30% by 2026-11-07" && outcomeWords(act({ outcome: "probation", targetPct: null, by: "2027-08-01" })) === "Probation until 2027-08-01" && outcomeWords(act({ outcome: "hold", targetPct: null, by: null })) === "Hold");
const acted: DecisionsFile = {
  version: 1,
  entries: [
    entry({ id: "2026-10-02-01", date: "2026-10-02", symbol: "AAPL", title: "Trim", action: act({}), filedAt: "2026-10-02T08:00:00.000Z" }),
    entry({ id: "2026-10-03-01", date: "2026-10-03", symbol: "AAPL", title: "Hold", action: act({ outcome: "hold", targetPct: null, by: null }), filedAt: "2026-10-03T08:00:00.000Z" }),
    entry({ id: "2026-10-04-01", date: "2026-10-04", kind: "vote", symbol: "AAPL", title: "Vote", action: act({ on: "vote:r:AAPL", outcome: "hold", targetPct: null, by: null, votedClass: "machine" }), filedAt: "2026-10-04T08:00:00.000Z" }),
    entry({ id: "2026-10-05-01", date: "2026-10-05", kind: "vote", symbol: "AAPL", title: "Vote, no class", action: act({ on: "vote:r:AAPL", outcome: "hold", targetPct: null, by: null }), filedAt: "2026-10-05T08:00:00.000Z" }),
  ],
  updated: now,
};
check("decisionOn takes the newest entry on an item", decisionOn(acted, "cap:AAPL")?.id === "2026-10-03-01" && decisionOn(acted, "cap:MSFT") === null && decisionOn(null, "cap:AAPL") === null);
check("votedClassOf takes the newest vote that names a class", votedClassOf(acted, "aapl")?.action?.votedClass === "machine" && votedClassOf(acted, "MSFT") === null);

console.log(`\n${passed} ok, ${failed} missed`);
if (failed) process.exit(1);
