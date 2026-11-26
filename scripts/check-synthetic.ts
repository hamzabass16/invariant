/**
 * The deterministic half of the synthetic persona loop. For every persona in
 * data/synthetic/<id>/ it generates the book from its seed, checks the book
 * against the holdings model, scores the hand-written methodology against the
 * persona's target (lib/parity.ts), renders the dashboard in words, and holds
 * the score to the target's floor. No key, no network: it runs in every build.
 *
 * The other half, drafting the methodology from the document and judging the
 * dashboard with a model on a local key, is scripts/synth-loop.ts.
 *
 * Run: npm run check:synthetic
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { draftRequestBody } from "../lib/draft-prompt";
import { fieldsRead, methodologySchema } from "../lib/methodology";
import { parityReport, scoreParity, targetSchema, type Parity } from "../lib/parity";
import { dashboardText, generateBook, personaSchema, setupOf } from "../lib/synthetic";

const ROOT = "data/synthetic";
let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const verbose = process.argv.includes("--verbose");
const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

const ids = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
check("personas exist", ids.length >= 5, ids.join(", "));

const matrix: { id: string; name: string; parity: Parity; floor: number }[] = [];
for (const id of ids) {
  const dir = path.join(ROOT, id);
  for (const file of ["persona.json", "methodology.md", "target.json", "methodology.json"]) check(`${id}: ${file} present`, existsSync(path.join(dir, file)));
  const p = personaSchema.parse(JSON.parse(readFileSync(path.join(dir, "persona.json"), "utf8")));
  check(`${id}: folder name matches the persona id`, p.id === id);
  const target = targetSchema.parse(JSON.parse(readFileSync(path.join(dir, "target.json"), "utf8")));
  const m = methodologySchema.parse(JSON.parse(readFileSync(path.join(dir, "methodology.json"), "utf8")));
  const doc = readFileSync(path.join(dir, "methodology.md"), "utf8");
  check(`${id}: the document says something`, doc.trim().length > 400 && doc.includes("#"));
  check(`${id}: the document and the methodology are fictional`, /fictional/i.test(doc) && /fictional/i.test(p.about));

  const book = generateBook(p);
  const again = generateBook(p);
  check(`${id}: the same seed gives the same book`, JSON.stringify(book) === JSON.stringify(again));
  check(`${id}: the book has holdings in the base currency`, book.holdings.length > 0 && book.fx.base === p.setup.baseCurrency);
  check(`${id}: every holding's account is a known account`, book.holdings.every((h) => p.book.accounts.some((a) => a.name === h.account)));
  check(`${id}: no NaN in the book`, !JSON.stringify(book).includes("null,null") && !/NaN/.test(JSON.stringify(book)));

  const setup = setupOf(p, m, p.asOf);
  const parity = scoreParity(target, m, book, p.setup.inputs, p.asOf);
  matrix.push({ id, name: p.name, parity, floor: target.floor });
  check(`${id}: score ${parity.score}% reaches the floor ${target.floor}%`, parity.score >= target.floor);
  check(`${id}: nothing the target asks for is missing`, parity.counts.missing === 0, parity.rows.filter((r) => r.status === "missing").map((r) => r.label).join("; "));
  const text = dashboardText(m, book, setup, p.asOf);
  check(`${id}: the dashboard renders in words`, text.includes("Headline:") && text.includes("Methodology checks:") && !text.includes("undefined") && !text.includes("NaN"));
  const body = draftRequestBody({ setup: setupOf(p, null, p.asOf), today: p.asOf, document: { name: `${id}.md`, mime: "text/markdown", bytes: new TextEncoder().encode(doc) } });
  check(`${id}: a draft request builds from the document`, typeof body.system === "string" && Array.isArray(body.messages));
  check(`${id}: the draft request asks for the tool call instead of forcing it`, (body.tool_choice as { type: string }).type === "auto" && /one call to record_methodology; write nothing outside it/.test(String(body.system)));
  if (verbose) console.log(parityReport(parity, `${p.name}: ${m.name} against the target`), "\n", text, "\n");
}

// What the loop is for: a methodology written in a style's own words yields that style's monitors.
const options = matrix.find((x) => x.id === "options_trader");
if (options) {
  const m = methodologySchema.parse(JSON.parse(readFileSync(path.join(ROOT, "options_trader/methodology.json"), "utf8")));
  const read = new Set(m.figures.flatMap((f) => fieldsRead(f)));
  check("an options methodology yields implied volatility monitors", read.has("option_iv_pct") && read.has("option_iv_rank") && read.has("option_expected_move"));
  check("an options methodology yields watches, not just rules", m.rules.filter((r) => r.severity === "watch").length >= 4);
  check("implied volatility waits for a data source rather than showing a zero", options.parity.rows.some((r) => r.id === "iv-by-underlying" && r.status === "waiting"));
}
const dividend = matrix.find((x) => x.id === "dividend_growth");
if (dividend) check("a dividend methodology computes income and its growth from transactions", dividend.parity.rows.filter((r) => ["income-ttm", "income-growth", "income-by-month"].includes(r.id)).every((r) => r.status === "computes"));
const family = matrix.find((x) => x.id === "family_office");
if (family) check("a family office methodology tests concentration through funds", family.parity.rows.some((r) => r.id === "company-cap" && r.status === "computes"));
const compounder = matrix.find((x) => x.id === "quality_compounder");
if (compounder) check("a compounder methodology sorts holdings into its own classes and caps each", compounder.parity.rows.filter((r) => r.kind === "class").every((r) => r.status === "computes") && compounder.parity.rows.some((r) => r.id === "cap-compounder" && r.status === "computes"));

console.log("\nPersona                              Score  Floor  Compute  Waiting  Expressed  Missing");
for (const row of matrix) console.log(`${pad(row.name, 36)} ${pad(`${row.parity.score}%`, 6)} ${pad(`${row.floor}%`, 6)} ${pad(String(row.parity.counts.computes), 8)} ${pad(String(row.parity.counts.waiting), 8)} ${pad(String(row.parity.counts.expressed), 10)} ${row.parity.counts.missing}`);
const waiting = new Map<string, number>();
for (const row of matrix) for (const r of row.parity.rows) if (r.status === "waiting") waiting.set(r.note.replace(/^needs /, ""), (waiting.get(r.note.replace(/^needs /, "")) ?? 0) + 1);
if (waiting.size) {
  console.log("\nData no input supplies yet, by how many target items wait for it:");
  for (const [what, n] of [...waiting.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${pad(String(n), 3)} ${what}`);
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
