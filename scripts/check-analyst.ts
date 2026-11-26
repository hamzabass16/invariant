/**
 * The analyst (lib/analyst.ts, lib/analyst-graph.ts): the vault's corpus is
 * searchable and finds the right element, a model's tasks compile to recipes
 * the app computes (and an invalid one comes back as issues, a starved one as
 * needs), the methodology's checks cite their sections, the prompt carries the
 * methodology and only approved lessons, and the agent loop over a fake
 * tool-calling model yields an answer with its trace, its figures and its
 * proposed lesson, with no key anywhere. Run: npm run check:analyst
 */
import { readFileSync } from "node:fs";

import { FakeToolCallingModel } from "langchain";

import {
  analystFileSchema,
  approveLesson,
  checksText,
  corpusOf,
  EMPTY_ANALYST,
  hitsText,
  holdingsText,
  MAX_MESSAGES,
  MAX_THREADS,
  newThread,
  proposeLesson,
  runTasks,
  searchCorpus,
  systemPrompt,
  tasksText,
  titleOf,
  withMessages,
  withoutLesson,
  withThread,
  type Lesson,
} from "../lib/analyst";
import { runAnalyst } from "../lib/analyst-graph";
import { bookSchema } from "../lib/holdings";
import { computeFigure, contextFor, methodologySchema } from "../lib/methodology";
import { setupSchema } from "../lib/setup";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}
const read = (f: string) => JSON.parse(readFileSync(`data/samples/${f}`, "utf8"));

const m = methodologySchema.parse(read("methodology.dividend_growth.json"));
const book = bookSchema.parse(read("dani.book.json"));
const setup = setupSchema.parse({ version: 1, ownerName: "Sample", helperName: null, profile: "individual", baseCurrency: "USD", inputs: ["ibkr", "schwab"], tradesOptions: true, methodology: m, updated: "2026-10-12T00:00:00.000Z" });
const today = "2026-10-12";
const now = "2026-10-12T10:00:00.000Z";
const inputs = setup.inputs;

// --- Corpus and search --------------------------------------------------------
const lessons: Lesson[] = [
  { id: "aaaaaaaaaaaa", text: "Treat a payout ratio above 70% as a watch, not a breach, for utilities.", reason: "The methodology sets one payout limit for every sector.", status: "approved", threadId: null, at: now },
  { id: "bbbbbbbbbbbb", text: "Count special dividends as income.", reason: "Not said.", status: "proposed", threadId: null, at: now },
];
const docs = corpusOf({ methodology: m, research: null, reports: null, records: null, book, lessons, ccy: "USD" });
check("corpus has a doc per rule, figure and class", docs.filter((d) => d.kind === "rule").length === m.rules.length && docs.filter((d) => d.kind === "figure").length === m.figures.length && docs.filter((d) => d.kind === "class").length === m.classes.length, `${docs.length} docs`);
check("only approved lessons enter the corpus", docs.filter((d) => d.kind === "lesson").length === 1 && docs.some((d) => d.kind === "lesson" && /utilities/.test(d.text)));
const hits = searchCorpus(docs, "payout ratio limit", 3);
check("search finds the payout rule or figure first", hits.length > 0 && /payout/i.test(hits[0].doc.title + hits[0].doc.text), hits.map((h) => h.doc.title).join(" | "));
check("search is deterministic", JSON.stringify(searchCorpus(docs, "payout ratio limit", 3)) === JSON.stringify(hits));
check("no match is a sentence, not an empty list", /Nothing in the vault matches/.test(hitsText(searchCorpus(docs, "zzqx", 3))));
check("hits text names the kind and title", /\[rule\]|\[figure\]/.test(hitsText(hits)));

// --- Tasks: the model's plan compiled to recipes and computed by the app ----------
const weight = { id: "weight-by-symbol", label: "Weight by holding", unit: "pct", view: "bars", by: "symbol", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "value" }, den: { measure: "sum", over: "holdings", field: "value", whole: true } } };
const total = { id: "total-value", label: "Total value", unit: "money", view: "tile", expr: { op: "measure", of: { measure: "sum", over: "holdings", field: "value" } } };
const broken = { id: "x", label: "Broken", unit: "pct", view: "tile", expr: { op: "measure", of: { measure: "sum", over: "holdings", field: "not_a_field" } } };
const starved = { id: "cover", label: "Average interest cover", unit: "ratio", view: "tile", expr: { op: "measure", of: { measure: "avg", over: "holdings", field: "interest_cover" } } };
const rows = runTasks([total, weight, broken, starved], { methodology: m, book, today, inputs, ccy: "USD" });
const direct = computeFigure(rows[0].figure!, contextFor(book, today, m), inputs);
check("a valid recipe computes to the same value as the Overview", rows[0].result?.kind === "scalar" && direct.kind === "scalar" && rows[0].result.value === direct.value && direct.value !== null, JSON.stringify(rows[0].result));
check("the task text carries the formatted figure", /Total value .*: \$?[\d,]+/.test(rows[0].text), rows[0].text);
check("a grouped recipe lists its points", rows[1].result?.kind === "series" && rows[1].result.points.length > 1 && /%/.test(rows[1].text), rows[1].text.slice(0, 120));
check("an invalid recipe returns its issues, never throws", rows[2].figure === null && rows[2].issue !== null && /not valid/.test(rows[2].text) && /not_a_field|field/i.test(rows[2].text), rows[2].text);
check("a recipe reading data no input supplies says what it needs, never a zero", rows[3].result?.kind === "scalar" && rows[3].result.value === null && /needs data/.test(rows[3].text), rows[3].text);
check("tasks text joins one line per recipe", tasksText(rows).split("\n").length === 4);

// --- Checks and holdings -------------------------------------------------------------
const checks = checksText(m, book, today, inputs);
check("every rule appears with its section", m.rules.every((r) => checks.includes(`${r.section} ${r.text}`)), checks.slice(0, 200));
check("a rule the app cannot measure is yours to check", /yours to check/.test(checks));
const some = checksText(m, book, today, inputs, ["position-cap"]);
check("ruleIds narrows the checks", some.split("\n").length === 1 && /position-cap/.test(some), some);
check("an unknown ruleId lists the real ids", /No rule has an id/.test(checksText(m, book, today, inputs, ["nope"])) && /position-cap/.test(checksText(m, book, today, inputs, ["nope"])));
const held = holdingsText(book, { methodology: m, today, ccy: "USD" });
check("holdings text has one line per holding with the default fields", held.split("\n").length === book.holdings.length && /symbol=/.test(held) && /class=/.test(held), held.split("\n")[0]);
const narrow = holdingsText(book, { methodology: m, today, ccy: "USD" }, [book.holdings[0].symbol, "ZZZZ"], ["value", "nope"]);
check("unknown symbols and fields are named, not dropped", /Not in the book: ZZZZ/.test(narrow) && /Not holdings fields.*nope/.test(narrow) && narrow.split("\n").filter((l) => /value=/.test(l)).length >= 1, narrow);

// --- Prompt ----------------------------------------------------------------------------
const prompt = systemPrompt({ methodology: m, setup, book, lessons, today, studies: 2, reports: 1 });
check("the prompt names the methodology, its rules by section and its figures by id", prompt.includes(m.name) && m.rules.every((r) => prompt.includes(`${r.section} · ${r.text}`)) && m.figures.every((f) => prompt.includes(`- ${f.id} ·`)));
check("the prompt carries approved lessons only", /utilities/.test(prompt) && !/special dividends/.test(prompt));
check("the prompt carries the ontology and the family's steps", /Fields:/.test(prompt) && /Business fundamentals/.test(prompt) && /Valuation: the person's own valuation/.test(prompt));
check("the prompt forbids arithmetic and advice", /never do arithmetic/.test(prompt) && /no advice to buy or sell/.test(prompt));
check("the prompt has no key and no secret", !/sk-ant-|anthropicKey/.test(prompt));

// --- File, threads and lessons ----------------------------------------------------------
check("the empty file parses", analystFileSchema.safeParse(EMPTY_ANALYST).success);
check("a title is trimmed to one line", titleOf("  Which   holdings\nare over cap?  ") === "Which holdings are over cap?" && titleOf("x".repeat(100)).length === 72);
let file = withThread(EMPTY_ANALYST, newThread("0123456789ab", "Over cap?", now), now);
file = withMessages(file, "0123456789ab", [{ role: "person", text: "Over cap?", at: now, trace: [], figures: [] }], now);
check("messages append to the thread", file.threads[0].messages.length === 1);
let capped = file;
try {
  for (let i = 0; i < MAX_MESSAGES; i += 1) capped = withMessages(capped, "0123456789ab", [{ role: "analyst", text: "x", at: now, trace: [], figures: [] }], now);
  check("the message cap throws a sentence", false);
} catch (e) {
  check("the message cap throws a sentence", e instanceof Error && /messages in one conversation/.test(e.message));
}
let many = EMPTY_ANALYST;
try {
  for (let i = 0; i <= MAX_THREADS; i += 1) many = withThread(many, newThread((i.toString(16).padStart(12, "0")).slice(0, 12), "q", now), now);
  check("the thread cap throws a sentence", false);
} catch (e) {
  check("the thread cap throws a sentence", e instanceof Error && /conversations at most/.test(e.message));
}
file = proposeLesson(file, { id: "cccccccccccc", text: "Count special dividends as income.", reason: "Not said.", threadId: "0123456789ab", at: now }, now);
const again = proposeLesson(file, { id: "dddddddddddd", text: "count special dividends as income.", reason: "Not said.", threadId: null, at: now }, now);
check("a lesson is proposed once, not in force", file.lessons.length === 1 && file.lessons[0].status === "proposed" && again.lessons.length === 1);
check("approving and withdrawing a lesson", approveLesson(file, "cccccccccccc", now).lessons[0].status === "approved" && withoutLesson(file, "cccccccccccc", now).lessons.length === 0);
check("an analyst file round-trips its schema", analystFileSchema.safeParse(JSON.parse(JSON.stringify(file))).success);

// --- The agent loop over a fake model --------------------------------------------------------
async function agent() {
  const model = new FakeToolCallingModel({
    toolStyle: "anthropic",
    toolCalls: [
      [{ id: "c1", name: "compute_figures", args: { figures: [total, broken] } }],
      [
        { id: "c2", name: "methodology_checks", args: { ruleIds: ["position-cap"] } },
        { id: "c3", name: "propose_lesson", args: { lesson: "Treat a holding within 0.5 points of its cap as near the limit.", reason: "The methodology has no near-limit band." } },
      ],
      [],
    ],
  });
  const out = await runAnalyst(model, { methodology: m, setup, book, corpus: { research: null, reports: null, records: null }, lessons, today, inputs, history: [{ role: "person", text: "Hello" }, { role: "analyst", text: "Ask about your holdings." }], question: "Which holdings are over cap?", edgar: null });
  check("the agent returns text", typeof out.text === "string" && out.text.length > 0, out.text.slice(0, 80));
  check("the trace has one step per tool call, in order", out.trace.map((t) => t.tool).join(",") === "compute_figures,methodology_checks,propose_lesson", out.trace.map((t) => t.tool).join(","));
  check("the compute step's result carries the figure and the invalid recipe's issues", /Total value/.test(out.trace[0].result) && /not valid/.test(out.trace[0].result), out.trace[0].result.slice(0, 200));
  check("the checks step cites the section", /1\.2/.test(out.trace[1].result), out.trace[1].result.slice(0, 120));
  check("only the valid recipe is offered to keep", out.figures.length === 1 && out.figures[0].id === "total-value");
  check("the proposed lesson comes back as a proposal, not applied", out.lessons.length === 1 && /near the limit/.test(out.lessons[0].text) && /not in force/.test(out.trace[2].result));
  check("three model rounds", out.rounds === 3, String(out.rounds));
  const noBook = await runAnalyst(new FakeToolCallingModel({ toolStyle: "anthropic", toolCalls: [[{ id: "d1", name: "methodology_checks", args: {} }], []] }), { methodology: m, setup, book: null, corpus: { research: null, reports: null, records: null }, lessons: [], today, inputs, history: [], question: "Anything?", edgar: null });
  check("with no book, checks say that no rule can be tested", /No figures have arrived yet/.test(noBook.trace[0].result), noBook.trace[0].result);
  const noEdgar = await runAnalyst(new FakeToolCallingModel({ toolStyle: "anthropic", toolCalls: [[{ id: "e1", name: "edgar_facts", args: { ticker: "ABC" } }], []] }), { methodology: m, setup, book, corpus: { research: null, reports: null, records: null }, lessons: [], today, inputs, history: [], question: "ABC filings?", edgar: null });
  check("without a filings reader the tool says so", /cannot be read here/.test(noEdgar.trace[0].result), noEdgar.trace[0].result);
}

agent()
  .catch((e) => check("the agent loop runs", false, e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
  .finally(() => {
    if (failures.length) {
      console.error(`check:analyst: ${failures.length} failed, ${passed} passed\n- ${failures.join("\n- ")}`);
      process.exit(1);
    }
    console.log(`check:analyst ok: ${passed} checks passed`);
  });
