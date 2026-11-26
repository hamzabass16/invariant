/**
 * Holds the library of ready-made methodologies (lib/library.ts): every entry
 * validates, carries nothing of its author's portfolio, adopts as a draft
 * credited to its source, and its template reads as the person's own.
 * Run: npm run check:library
 */
import { readFileSync } from "node:fs";

import { bookSchema } from "../lib/holdings";
import { adoptMethodology, adoptTemplate, isLibraryId, LIBRARY, LIBRARY_IDS, libraryCounts, libraryEntry } from "../lib/library";
import { contextFor, evaluate, methodologySchema } from "../lib/methodology";
import { templateFor, templateSchema } from "../lib/research";
import { capsFor, shownWhen } from "../lib/screens";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}

const dani = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
// Symbols and names that would mean a real portfolio leaked into the library.
const PERSONAL = /\b(AMZN|GOOGL|UBER|SHOP|META|BKNG|ASML|MELI|BIRK|NVO|SPGI|IBKR|Hamza|Bassatne)\b/;

check("HCMP and the four public frameworks, each credited after its author", LIBRARY_IDS.join(",") === "hcmp,graham,greenblatt,lynch,dividend-growth" && isLibraryId("graham") && !isLibraryId("individual") && LIBRARY.filter((e) => e.id !== "hcmp" && e.id !== "dividend-growth").every((e) => e.credit.startsWith("After ")));
check("each public framework says what the ontology cannot yet, as gaps", LIBRARY.filter((e) => e.id !== "hcmp").every((e) => e.methodology.gaps.length >= 2));
for (const e of LIBRARY) {
  const text = JSON.stringify({ ...e, credit: "", name: "" });
  check(`${e.id}: the methodology validates`, methodologySchema.safeParse(e.methodology).success);
  check(`${e.id}: nothing of the author's portfolio in it`, !PERSONAL.test(text), text.match(PERSONAL)?.[0]);
  check(`${e.id}: no class is a list of symbols`, e.methodology.classes.every((c) => c.criteria.every((f) => f.field !== "symbol")));
  check(`${e.id}: a summary in plain paragraphs and one line`, e.summary.length >= 3 && e.summary.every((p) => p.length > 80) && e.oneLine.length > 40 && e.oneLine.length <= 200);
  const m = adoptMethodology(e);
  check(`${e.id}: adopts as an unconfirmed draft credited to its source`, m.adopted === null && m.origin === "library" && m.source.title === e.name && m.source.fileId === null);
  check(`${e.id}: adopting twice gives the same draft`, JSON.stringify(adoptMethodology(e)) === JSON.stringify(m));
  const c = libraryCounts(e);
  check(`${e.id}: counts match`, c.classes === m.classes.length && c.rules === m.rules.length && c.figures === m.figures.length && c.tested === m.rules.filter((r) => r.test).length);
  const findings = evaluate(m, dani, "2026-10-11", ["ibkr", "schwab"]);
  check(`${e.id}: every rule is a finding on a sample book`, findings.length === m.rules.length);
  check(`${e.id}: a rule it cannot measure is the owner's, never passing`, findings.filter((f) => !f.rule.test).every((f) => f.status === "manual"));
  const t = adoptTemplate(e, "2026-10-12T00:00:00.000Z");
  if (e.template) {
    check(`${e.id}: the template validates and reads as adopted`, t !== null && templateSchema.safeParse(t).success && t.origin === "library" && t.updated === "2026-10-12T00:00:00.000Z");
    check(`${e.id}: the template keeps its sections in order`, t !== null && t.sections.map((s) => s.id).join(",") === e.template.sections.map((s) => s.id).join(","));
    const applied = templateFor(m, t, "USD");
    check(`${e.id}: a study follows the adopted template`, applied.template.title === e.template.title && applied.sections.length === e.template.sections.length);
  }
}

// HCMP in particular: the archetypes, caps and what the app says it cannot count.
const hcmp = libraryEntry("hcmp")!;
const m = adoptMethodology(hcmp);
check("HCMP: three archetypes with 10, 20 and 5% caps", capsFor(m).map((c) => `${c.classId}:${c.cap}`).sort().join(",") === "cm:10,dg:5,tr:20");
check("HCMP: sixteen template sections, classification and kill signals among them", hcmp.template!.sections.length === 16 && hcmp.template!.sections.some((s) => s.id === "classification" && s.tags.includes("classes")) && hcmp.template!.sections.some((s) => s.id === "kill-signals" && s.tags.includes("exit")));
check("HCMP: the sale reasons and the vote are rules the owner checks", m.rules.some((r) => !r.test && /Quality Erosion/.test(r.text)) && m.rules.some((r) => !r.test && /vote/i.test(r.text)));
const ctx = contextFor(dani, "2026-10-11", m);
check("HCMP on a book without filings: no holding is placed, nothing is guessed", dani.holdings.every((h) => ctx.classOf(h) === null));
const shown = shownWhen(m, dani, null, null);
check("HCMP switches on classes, caps, tests, series and a benchmark", shown.classes && shown.caps && shown.tests && shown.series && shown.benchmark);
check("HCMP's summary says what the app cannot count", hcmp.summary.some((p) => /cannot be measured|leaves that count to you/.test(p)));

console.log(failed ? `\n${passed} passed, ${failed} failed` : `\ncheck:library ok (${passed} passed): the library validates, carries no one's portfolio, and adopts as a draft the person confirms.`);
process.exit(failed ? 1 : 0);
