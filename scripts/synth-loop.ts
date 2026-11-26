/**
 * The model half of the synthetic persona loop. For each persona in
 * data/synthetic/<id>/ it:
 *
 *   1. drafts a methodology from the persona's document with the same request
 *      the app sends (lib/draft-prompt.ts), on a provider read from .env.local
 *      (Claude on ANTHROPIC_API_KEY, or an open model at an OpenAI-compatible
 *      endpoint via MODEL_PROVIDER, MODEL_BASE_URL, MODEL_NAME, MODEL_API_KEY);
 *   2. scores the draft against the persona's target next to the hand-written
 *      methodology, so a drafter that misses a rule shows as a gap against a
 *      methodology that proves the ontology could say it;
 *   3. renders the dashboard the draft would give (lib/synthetic.ts) and asks a
 *      judge what this investor would find missing or wrong, with the cause of
 *      each gap: the ontology cannot say it, the recipe language cannot say it,
 *      the drafter missed it, no input supplies the data, or the target is
 *      wrong;
 *   4. writes a report per persona and one proposals file to
 *      synthetic-runs/<date>/ (gitignored).
 *
 * The app learns from a run only through a reviewed change to the ontology,
 * the recipe language, the drafting prompt or an adapter: proposals are read
 * by a person, never applied by this script. The key is read for the calls
 * and never printed. Nothing here runs in the deployment.
 *
 *   npm run synth:loop -- [--persona <id>] [--dry-run] [--skip-draft]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { DEFAULT_MODEL, draftRequestBody, parseDraftResponse } from "../lib/draft-prompt";
import { methodologySchema, type Methodology } from "../lib/methodology";
import { completionsUrl, fromOpenAIResponse, providerLooksValid, toOpenAIRequest, type ModelProvider, type ModelRequest } from "../lib/model-provider";
import { describeOntology } from "../lib/ontology";
import { parityReport, scoreParity, targetSchema, type Parity } from "../lib/parity";
import { dashboardText, generateBook, personaSchema, setupOf } from "../lib/synthetic";
import { localDay } from "../lib/time";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ROOT = "data/synthetic";
const args = process.argv.slice(2);
const only = args.includes("--persona") ? args[args.indexOf("--persona") + 1] : null;
const dryRun = args.includes("--dry-run");
const skipDraft = args.includes("--skip-draft");
const today = localDay();
const outDir = path.join("synthetic-runs", today);

/** A value from the environment or .env.local; a key's value never reaches a log line. */
function setting(name: string): string | null {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv.trim();
  if (!existsSync(".env.local")) return null;
  const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || null : null;
}

/**
 * The provider the loop runs on, the same two kinds the app offers a person:
 * MODEL_PROVIDER=openai_compatible with MODEL_BASE_URL, MODEL_NAME and
 * MODEL_API_KEY (an open model such as Kimi or Llama on a host's free tier,
 * to score it against Claude on the same personas), or the default, Claude on
 * ANTHROPIC_API_KEY with ANTHROPIC_MODEL.
 */
function readProvider(): ModelProvider | null {
  if (setting("MODEL_PROVIDER") === "openai_compatible") return { kind: "openai_compatible", apiKey: setting("MODEL_API_KEY"), baseUrl: setting("MODEL_BASE_URL"), model: setting("MODEL_NAME") };
  const key = setting("ANTHROPIC_API_KEY");
  return key ? { kind: "anthropic", apiKey: key, baseUrl: null, model: setting("ANTHROPIC_MODEL") } : null;
}
const provider = dryRun ? null : readProvider();
if (!dryRun && (!provider || !providerLooksValid(provider))) {
  console.error("No usable provider. Put ANTHROPIC_API_KEY=sk-ant-... in .env.local (never committed), or MODEL_PROVIDER=openai_compatible with MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY; or run with --dry-run to write the requests without sending them.");
  process.exit(2);
}
const model = provider?.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

async function call(body: Record<string, unknown>): Promise<unknown> {
  const p = provider!;
  const anthropic = p.kind === "anthropic";
  const res = await fetch(anthropic ? ANTHROPIC_API : completionsUrl(p.baseUrl!), {
    method: "POST",
    headers: anthropic ? { "content-type": "application/json", "x-api-key": p.apiKey!, "anthropic-version": "2023-06-01" } : { "content-type": "application/json", ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
    body: JSON.stringify(anthropic ? body : toOpenAIRequest(body as ModelRequest, model)),
  });
  if (!res.ok) throw new Error(`The model endpoint answered ${res.status}.`);
  const json = await res.json();
  return anthropic ? json : fromOpenAIResponse(json);
}

const judgementSchema = z.object({
  score: z.number().min(0).max(10).describe("How well the dashboard serves this investor's document: 10 when nothing they asked for is missing or wrong."),
  verdict: z.string().max(600).describe("Two or three sentences in plain words."),
  strengths: z.array(z.string().max(200)).max(8),
  gaps: z
    .array(
      z.object({
        item: z.string().max(120).describe("What is missing or wrong, in the investor's words."),
        cause: z.enum(["ontology", "recipe_language", "drafter", "data_source", "target", "app"]).describe("ontology: no field or statistic can say it; recipe_language: the fields exist but the arithmetic or grouping cannot be written; drafter: the ontology could say it and the drafter did not; data_source: expressed, but no input supplies the data; target: the target expects something the document does not ask for; app: a figure computes wrongly or the words mislead."),
        detail: z.string().max(400),
        proposal: z.string().max(400).describe("The smallest change that would close it: a field to add, a wording for the drafting instructions, an adapter to write, a target line to drop."),
      }),
    )
    .max(12),
});
type Judgement = z.infer<typeof judgementSchema>;

function judgeBody(p: { name: string; about: string }, doc: string, targetText: string, dashboard: string, parity: Parity): Record<string, unknown> {
  const schema = z.toJSONSchema(judgementSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 6000,
    system: `You judge the dashboard a portfolio app built for an investor from their own methodology document. You see the document, what the investor expects the dashboard to show (the target), the dashboard as rendered in words, and the app's own parity scoring of the target. You know the app's ontology, below, so you can say for each gap whether the ontology cannot express it, the recipe language cannot, the drafter missed it although the ontology could say it, no connected input supplies the data, the target is asking for something the document does not, or the app computed or worded something wrongly. Think as this investor would on a Monday morning: what is missing, what is wrong, what would mislead. Prefer few, precise gaps over many vague ones. Never praise. Call record_judgement once.

Ontology:
${describeOntology()}`,
    tools: [{ name: "record_judgement", description: "Record the judgement of this dashboard.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `Investor: ${p.name}. ${p.about}\n\n--- Document ---\n${doc}\n\n--- Target ---\n${targetText}\n\n--- Dashboard ---\n${dashboard}\n\n--- Parity scoring ---\n${parityReport(parity, "Parity")}` }] }],
  };
}

type Run = { id: string; name: string; hand: Parity; draft: Parity | null; draftError: string | null; judgement: Judgement | null };

async function runPersona(id: string): Promise<Run> {
  const dir = path.join(ROOT, id);
  const p = personaSchema.parse(JSON.parse(readFileSync(path.join(dir, "persona.json"), "utf8")));
  const target = targetSchema.parse(JSON.parse(readFileSync(path.join(dir, "target.json"), "utf8")));
  const hand = methodologySchema.parse(JSON.parse(readFileSync(path.join(dir, "methodology.json"), "utf8")));
  const doc = readFileSync(path.join(dir, "methodology.md"), "utf8");
  const book = generateBook(p);
  const handParity = scoreParity(target, hand, book, p.setup.inputs, p.asOf);
  const lines: string[] = [`# ${p.name}: synthetic loop run, ${today}`, "", p.about, "", `Model: ${model}. Hand-written methodology "${hand.name}" scores ${handParity.score}% against the target (floor ${target.floor}%).`, ""];

  // 1. Draft from the document, as the app would.
  let drafted: Methodology | null = null;
  let draftError: string | null = null;
  const draftBody = draftRequestBody({ setup: setupOf(p, null, p.asOf), today: p.asOf, document: { name: `${id}.md`, mime: "text/markdown", bytes: new TextEncoder().encode(doc) } }, model);
  if (dryRun) {
    writeFileSync(path.join(outDir, `${id}.draft-request.json`), JSON.stringify(draftBody, null, 2));
    lines.push("Dry run: the draft request was written next to this report and not sent.", "");
  } else if (!skipDraft) {
    try {
      const parsed = parseDraftResponse(await call(draftBody));
      if (!parsed.ok) throw new Error(`The draft did not fit the schema (${parsed.issues} issues).`);
      drafted = methodologySchema.parse({ ...parsed.draft, source: { title: `${id}.md`, fileId: null }, origin: "document" });
      writeFileSync(path.join(outDir, `${id}.drafted.json`), JSON.stringify(drafted, null, 2));
    } catch (e) {
      draftError = e instanceof Error ? e.message : String(e);
    }
  }

  // 2. Score the draft next to the hand-written methodology.
  const shown = drafted ?? hand;
  const draftParity = drafted ? scoreParity(target, drafted, book, p.setup.inputs, p.asOf) : null;
  lines.push("## Parity", "", "```", parityReport(handParity, `Hand-written: ${hand.name}`), "```", "");
  if (draftParity && drafted) {
    lines.push("```", parityReport(draftParity, `Drafted from the document: ${drafted.name}`), "```", "");
    const missedByDrafter = draftParity.rows.filter((r) => r.status === "missing" && handParity.rows.find((h) => h.id === r.id)?.status !== "missing");
    if (missedByDrafter.length) lines.push("The drafter missed what the ontology can say:", ...missedByDrafter.map((r) => `- ${r.label}`), "");
    // The drafter's own ids rarely match the target's; list what it wrote so a reader can map them.
    lines.push("Figures the drafter wrote: " + drafted.figures.map((f) => `${f.id} (${f.label})`).join(", "), "", "Rules the drafter wrote: " + drafted.rules.map((r) => `${r.id} [${r.severity}] §${r.section}`).join(", "), "");
  } else if (draftError) lines.push(`Drafting failed: ${draftError}`, "");

  // 3. The dashboard in words, and the judge.
  const setup = setupOf(p, shown, p.asOf);
  const dashboard = dashboardText(shown, book, setup, p.asOf);
  lines.push(`## Dashboard (${drafted ? "from the draft" : "from the hand-written methodology"})`, "", "```", dashboard, "```", "");
  const targetText = [...target.figures.map((f) => `figure: ${f.label}${f.note ? ` (${f.note})` : ""}`), ...target.rules.map((r) => `rule: ${r.label}${r.testable ? "" : " (the owner's to check)"}${r.note ? ` (${r.note})` : ""}`), ...target.panels.map((x) => `panel: ${x}`)].join("\n");
  let judgement: Judgement | null = null;
  const jb = judgeBody(p, doc, targetText, dashboard, draftParity ?? handParity);
  if (dryRun) {
    writeFileSync(path.join(outDir, `${id}.judge-request.json`), JSON.stringify(jb, null, 2));
  } else {
    try {
      const body = (await call(jb)) as { content?: { type: string; name?: string; input?: unknown }[] };
      const tool = body.content?.find((c) => c.type === "tool_use" && c.name === "record_judgement");
      judgement = judgementSchema.parse(tool?.input);
      lines.push("## Judgement", "", `Score ${judgement.score}/10. ${judgement.verdict}`, "");
      if (judgement.strengths.length) lines.push("Holds up:", ...judgement.strengths.map((s) => `- ${s}`), "");
      lines.push("Gaps:", ...judgement.gaps.map((g) => `- **${g.item}** (${g.cause}): ${g.detail} Proposal: ${g.proposal}`), "");
    } catch (e) {
      lines.push("## Judgement", "", `The judge's answer could not be read: ${e instanceof Error ? e.message : String(e)}`, "");
    }
  }
  writeFileSync(path.join(outDir, `${id}.md`), lines.join("\n"));
  return { id, name: p.name, hand: handParity, draft: draftParity, draftError, judgement };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const ids = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().filter((id) => !only || id === only);
  if (!ids.length) {
    console.error(`No persona ${only ?? ""} in ${ROOT}.`);
    process.exit(2);
  }
  const runs: Run[] = [];
  for (const id of ids) {
    console.log(`${id}: drafting${skipDraft || dryRun ? " skipped" : ""}, scoring, judging${dryRun ? " (dry run)" : ""}...`);
    runs.push(await runPersona(id));
  }
  const proposals = runs.flatMap((r) => (r.judgement?.gaps ?? []).map((g) => ({ persona: r.id, ...g })));
  writeFileSync(
    path.join(outDir, "proposals.json"),
    JSON.stringify({ date: today, model, runs: runs.map((r) => ({ persona: r.id, hand: r.hand.score, draft: r.draft?.score ?? null, draftError: r.draftError, judge: r.judgement?.score ?? null })), proposals }, null, 2),
  );
  console.log(`\nPersona                              Hand   Draft  Judge`);
  for (const r of runs) console.log(`${r.name.padEnd(36)} ${`${r.hand.score}%`.padEnd(6)} ${(r.draft ? `${r.draft.score}%` : r.draftError ? "failed" : "-").padEnd(6)} ${r.judgement ? `${r.judgement.score}/10` : "-"}`);
  const byCause = new Map<string, number>();
  for (const g of proposals) byCause.set(g.cause, (byCause.get(g.cause) ?? 0) + 1);
  if (byCause.size) console.log(`\nGaps by cause: ${[...byCause.entries()].map(([c, n]) => `${c} ${n}`).join(", ")}.`);
  console.log(`\nReports and proposals in ${outDir}/. Read them; change the ontology, the recipe language, the drafting instructions or an adapter by hand; run again.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
