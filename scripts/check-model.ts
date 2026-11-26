/**
 * The model provider (lib/model-provider.ts) and the property watch
 * (lib/property-watch.ts), pure and offline: the provider a secrets file
 * names, what looks usable, the translation of the app's one request shape to
 * and from an OpenAI-compatible endpoint, the key scrub, and the watch's
 * request and parser. No key, no network.
 *
 * Run: npm run check:model
 */
import { draftRepairBody, draftRequestBody, parseDraftResponse } from "../lib/draft-prompt";
import { bookSchema, type Holding } from "../lib/holdings";
import { completionsUrl, continuedRequest, fromOpenAIResponse, joinedResponses, pausedTurn, keyLooksValid, modelFor, modelProviderOf, providerCannot, providerLooksValid, providerProblem, scrubKey, secretsSchema, summarizeProvider, toOpenAIRequest, withPromptCache, type ModelProvider, type ModelRequest } from "../lib/model-provider";
import { mergeWatch, parseWatchResponse, unchecked, watchRequestBody } from "../lib/property-watch";
import { parseResearchResponse } from "../lib/research-prompt";
import { setupSchema } from "../lib/setup";
import { readFileSync } from "node:fs";
import { BETA_EVENTS, DEFAULT_PLAN_CAPS, INVITE_ALPHABET, INVITE_LENGTH, capOf, defaultPlan, funnel, inviteShapeOk, normalInviteCode, planCaps, shownInviteCode, signUpModeOf } from "../lib/plans";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}

// --- providers ---------------------------------------------------------------
const claude: ModelProvider = { kind: "anthropic", apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789", baseUrl: null, model: null };
const groq: ModelProvider = { kind: "openai_compatible", apiKey: "gsk_test_key_0123456789", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" };

check("an older secrets file with only a Claude key still names a provider", modelProviderOf(secretsSchema.parse({ anthropicKey: claude.apiKey }))?.kind === "anthropic");
check("a secrets file with a provider beside an old key uses the provider", modelProviderOf(secretsSchema.parse({ anthropicKey: claude.apiKey, provider: groq }))?.kind === "openai_compatible");
check("an empty secrets file names no provider", modelProviderOf(secretsSchema.parse({ anthropicKey: null })) === null && modelProviderOf(null) === null);
check("a Claude key must look like one", keyLooksValid(claude.apiKey!) && !keyLooksValid("sk-live-nope") && providerProblem({ ...claude, apiKey: "nope" }) !== null);
check("an endpoint needs https, a model and no localhost", providerLooksValid(groq) && !providerLooksValid({ ...groq, baseUrl: "http://x" }) && !providerLooksValid({ ...groq, model: "" }) && /own computer/.test(providerProblem({ ...groq, baseUrl: "https://localhost:11434/v1" }) ?? ""));
check("an endpoint may have no key", providerLooksValid({ ...groq, apiKey: null }) && providerProblem({ ...groq, apiKey: null }) === null);
check("the summary carries the host and the model, never the key", JSON.stringify(summarizeProvider(groq)).includes("api.groq.com") && !JSON.stringify(summarizeProvider(groq)).includes("gsk_") && summarizeProvider(claude)?.hasKey === true);
check("the provider's model wins over the app's default", modelFor(groq, "claude-sonnet-5-5") === "llama-3.3-70b-versatile" && modelFor(claude, "claude-sonnet-5-5") === "claude-sonnet-5-5");
check("only Claude reads PDFs and searches the web", providerCannot(claude, "pdf") === null && providerCannot(claude, "web_search") === null && /PDF/.test(providerCannot(groq, "pdf") ?? "") && /Claude/.test(providerCannot(groq, "web_search") ?? ""));
check("the scrub removes the key's value and anything key-shaped", !scrubKey(`refused gsk_test_key_0123456789 and sk-ant-abc123 Bearer tok`, groq).match(/gsk_test|sk-ant-abc|Bearer tok/));
check("the completions address works with or without /v1", completionsUrl("https://api.groq.com/openai/v1") === "https://api.groq.com/openai/v1/chat/completions" && completionsUrl("https://host/v1/chat/completions") === "https://host/v1/chat/completions");

// --- the one request shape, translated ---------------------------------------
const setup = setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr"], tradesOptions: false, helperName: null, methodology: null, updated: "2026-10-13T00:00:00.000Z" });
const body = draftRequestBody({ setup, today: "2026-10-13", document: { name: "m.md", mime: "text/markdown", bytes: new TextEncoder().encode("# Fictional method\nCap any holding at 10%.") } }) as ModelRequest;
const oa = toOpenAIRequest(body, "llama-3.3-70b-versatile") as { model: string; messages: { role: string; content: string }[]; tools: { type: string; function: { name: string; parameters: unknown } }[]; tool_choice: string; max_tokens: number };
check("the system prompt becomes the first message", oa.messages[0].role === "system" && oa.messages[0].content === body.system);
check("the user's text blocks become one user message", oa.messages[1].role === "user" && /Fictional method/.test(oa.messages[1].content) && /Record this methodology/.test(oa.messages[1].content));
check("the tool becomes a function with the same schema and auto choice", oa.tools[0].type === "function" && oa.tools[0].function.name === "record_methodology" && oa.tools[0].function.parameters === body.tools![0].input_schema && oa.tool_choice === "auto" && oa.model === "llama-3.3-70b-versatile");
check("max_tokens is kept", oa.max_tokens === body.max_tokens);
let pdfRefused = false;
try {
  toOpenAIRequest(draftRequestBody({ setup, today: "2026-10-13", document: { name: "m.pdf", mime: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) } }) as ModelRequest, "x");
} catch {
  pdfRefused = true;
}
check("a PDF block is refused for an endpoint, not dropped", pdfRefused);
const serverTool = toOpenAIRequest({ messages: [{ role: "user", content: "hi" }], tools: [{ type: "web_search_20250305", name: "web_search", input_schema: {} }, { name: "record", input_schema: { type: "object" } }] }, "m") as { tools: { function: { name: string } }[] };
check("a server tool (web search) is left out of an endpoint's tools", serverTool.tools.length === 1 && serverTool.tools[0].function.name === "record");

const back = fromOpenAIResponse({ model: "llama", choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call_1", function: { name: "record_methodology", arguments: JSON.stringify({ name: "X" }) } }] } }] });
check("a tool call comes back as a tool_use block with parsed input", back.content[0].type === "tool_use" && back.content[0].name === "record_methodology" && (back.content[0].input as { name: string }).name === "X" && back.stop_reason === "tool_use");
const words = fromOpenAIResponse({ choices: [{ finish_reason: "stop", message: { content: "I would rather explain." } }] });
check("words alone come back as a text block and the draft parser says no call", words.content[0].type === "text" && parseDraftResponse(words).ok === false && (parseDraftResponse(words) as { called: boolean }).called === false);
{
  // A record whose references do not hold is told what is wrong and asked once more (Hamza, 20 Nov 2026).
  const lib = { ...JSON.parse(readFileSync("data/library/graham.methodology.json", "utf8")), adopted: "2026-11-20" };
  const good = { content: [{ type: "tool_use", id: "tu_1", name: "record_methodology", input: lib }] };
  const okRead = parseDraftResponse(good);
  const bad = structuredClone(lib);
  bad.dashboard.headline = [...bad.dashboard.headline, "no_such_figure"];
  const badAnswer = { content: [{ type: "text", text: "Recording." }, { type: "tool_use", id: "tu_2", name: "record_methodology", input: bad }], stop_reason: "tool_use" };
  const badRead = parseDraftResponse(badAnswer);
  const body = draftRequestBody({ setup, today: "2026-11-20", document: { name: "m.txt", mime: "text/plain", bytes: new TextEncoder().encode("Rules.") } });
  const repair = draftRepairBody(body, badAnswer, badRead) as { messages: { role: string; content: { type: string; tool_use_id?: string; is_error?: boolean; content?: string }[] }[] } | null;
  const told = repair?.messages.at(-1)?.content[0];
  check("a library methodology reads as a draft", okRead.ok);
  check("a draft naming a figure it does not record is refused with the problem in words and its place as a code and path", !badRead.ok && badRead.called && badRead.callId === "tu_2" && badRead.problems.some((p) => p.includes("no_such_figure")) && badRead.where.every((w) => /^[a-z_]+@/.test(w) && !w.includes("no_such_figure")));
  check("the repair asks again in the same conversation: the model's record, then the problems as the tool's error", !!repair && repair.messages.length === 3 && repair.messages[1].role === "assistant" && told?.type === "tool_result" && told.tool_use_id === "tu_2" && told.is_error === true && !!told.content?.includes("no_such_figure"));
  check("words alone are not asked again", draftRepairBody(body, words, parseDraftResponse(words)) === null);
  check("the drafter asks once more before refusing, and pages that read a methodology may take 800 seconds", /draftRepairBody\(body, answer, parsed\)/.test(readFileSync("lib/methodology-draft.ts", "utf8")) && ["app/(app)/setup/page.tsx", "app/(app)/methodology/page.tsx", "app/welcome/page.tsx"].every((f) => /export const maxDuration = 800;/.test(readFileSync(f, "utf8"))));
}
const broken = fromOpenAIResponse({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "c", function: { name: "write_sections", arguments: "{not json" } }] } }] });
check("arguments that are not JSON become text, so the research parser refuses rather than half-reads", broken.content[0].type === "text" && parseResearchResponse(broken, ["summary"]).ok === false);
const research = fromOpenAIResponse({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "c", function: { name: "write_sections", arguments: JSON.stringify({ sections: [{ id: "summary", markdown: "Fine." }] }) } }] } }] });
check("a research answer from an endpoint parses like Claude's", parseResearchResponse(research, ["summary"]).ok === true);
const assistantTurn = toOpenAIRequest({ messages: [{ role: "user", content: "q" }, { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "f", input: { a: 1 } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "42" }] }] }, "m") as { messages: { role: string; tool_calls?: unknown[]; tool_call_id?: string }[] };
check("assistant tool calls and tool results round-trip for a multi-turn request", assistantTurn.messages[1].role === "assistant" && assistantTurn.messages[1].tool_calls?.length === 1 && assistantTurn.messages[2].role === "tool" && assistantTurn.messages[2].tool_call_id === "t1");

// --- the property watch --------------------------------------------------------
const dad = bookSchema.parse(JSON.parse(readFileSync("data/samples/dad.book.json", "utf8")));
const flat = dad.holdings.find((h) => h.assetClass === "real_estate" && h.property) as Holding;
const wb = watchRequestBody(flat, "2026-10-13") as { tools: { type?: string; name: string }[]; system: string; messages: { content: { text: string }[] }[]; tool_choice: { type: string } };
check("the watch request searches the web and records with one tool, asked for not forced", wb.tools.some((t) => t.type === "web_search_20250305") && wb.tools.some((t) => t.name === "record_watch") && wb.tool_choice.type === "auto" && /one call to record_watch/.test(wb.system));
check("the watch request names the property and never estimates", wb.messages[0].content[0].text.includes(flat.property!.address) && /Never estimate/.test(wb.system));
const sample = JSON.parse(readFileSync("data/samples/dad.property_watch.json", "utf8")).properties[0];
const parsedWatch = parseWatchResponse({ content: [{ type: "text", text: "Searching." }, { type: "tool_use", name: "record_watch", input: { ...sample, holdingId: "wrong" } }] }, flat.id);
check("the watch parser pins the entry to the property it asked about", parsedWatch.ok && parsedWatch.entry.holdingId === flat.id && parsedWatch.entry.longTerm?.medianRent === sample.longTerm.medianRent);
check("a watch answer in words is refused with a sentence", !parseWatchResponse({ content: [{ type: "text", text: "Nothing found." }] }, flat.id).ok);
const merged = mergeWatch([unchecked(flat.id, "the model is busy."), ...(parsedWatch.ok ? [parsedWatch.entry] : [])], "2026-10-13");
check("an unchecked property keeps a sentence, never an empty entry", merged.properties[0].whatChanged.startsWith("Not checked this time: the model is busy") && merged.updated === "2026-10-13" && merged.properties.length === 2);

// Prompt caching on a Claude key: the system prompt carries the breakpoint, a conversation the automatic one, a marked or bare request is sent as written.
const single = withPromptCache({ model: "m", system: "Rules.", tools: [{ name: "t", input_schema: {} }], messages: [{ role: "user", content: "Doc." }] });
const sys = single.system as { text: string; cache_control?: { type: string } }[];
check("a system prompt is sent as one block carrying the cache breakpoint", Array.isArray(sys) && sys.length === 1 && sys[0].text === "Rules." && sys[0].cache_control?.type === "ephemeral" && !("cache_control" in single));
const talk = withPromptCache({ system: [{ type: "text", text: "A" }, { type: "text", text: "B" }], messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }, { role: "user", content: "q2" }] } as unknown as ModelRequest);
const talkSys = talk.system as { cache_control?: unknown }[];
check("a conversation gains the automatic breakpoint and only the last system block is marked", (talk.cache_control as { type: string })?.type === "ephemeral" && !talkSys[0].cache_control && !!talkSys[1].cache_control);
const bare: ModelRequest = { messages: [{ role: "user", content: "Doc." }] };
const already: ModelRequest = { system: "S", cache_control: { type: "ephemeral", ttl: "1h" }, messages: [{ role: "user", content: "x" }] };
check("a bare one-message request and one already marked are sent as written", withPromptCache(bare) === bare && withPromptCache(already) === already);
check("the translation to an OpenAI-compatible endpoint is made from the unmarked request", !JSON.stringify(toOpenAIRequest({ system: "Rules.", messages: [{ role: "user", content: "x" }] }, "m")).includes("cache_control"));
check("every Claude call goes through the cache, and the analyst's loop too", /anthropic \? withPromptCache\(body\) : body/.test(readFileSync("lib/methodology-draft.ts", "utf8")) && /anthropicPromptCachingMiddleware\(\{[^}]*unsupportedModelBehavior: "ignore"/.test(readFileSync("lib/analyst-graph.ts", "utf8")));

// Hamza, 29 Oct 2026: a brief came back in words; a turn the API paused mid-search is carried on, not read as the answer.
const paused = { content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } }, { type: "web_search_tool_result", tool_use_id: "s1", content: [] }], stop_reason: "pause_turn", usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 3 } } };
const rest = { content: [{ type: "tool_use", id: "t1", name: "record_brief", input: { a: 1 } }], stop_reason: "tool_use", usage: { input_tokens: 120, output_tokens: 40, server_tool_use: { web_search_requests: 2 } } };
const on = continuedRequest({ model: "m", messages: [{ role: "user", content: "q" }] }, paused as never) as { messages: { role: string; content: unknown }[] };
const joined = joinedResponses(paused as never, rest as never) as { content: { type: string }[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number; server_tool_use: { web_search_requests: number } } };
check(
  "a paused turn is sent back as the assistant's own and the parts read as one answer, the usage added up",
  pausedTurn(paused as never) && !pausedTurn(rest as never) && on.messages.length === 2 && on.messages[1].role === "assistant" && on.messages[1].content === paused.content &&
    joined.content.length === 3 && joined.content[2].type === "tool_use" && joined.stop_reason === "tool_use" && joined.usage.input_tokens === 220 && joined.usage.output_tokens === 50 && joined.usage.server_tool_use.web_search_requests === 5 &&
    /pausedTurn\(answer\)/.test(readFileSync("lib/methodology-draft.ts", "utf8")),
);

// Hamza, 4 Nov 2026: every call runs on the deployment's key, metered per person under a fingerprint, capped each month.
async function hostedChecks() {
  const saved = { key: process.env.ANTHROPIC_API_KEY, storage: process.env.STORAGE, cap: process.env.MODEL_CAP_USD, db: process.env.DATABASE_URL };
  delete process.env.DATABASE_URL;
  const hosted = await import("../lib/hosted-model");
  const meter = await import("../lib/model-meter");
  process.env.ANTHROPIC_API_KEY = "sk-ant-" + "x".repeat(40);
  delete process.env.STORAGE;
  const p = hosted.hostedProvider("Someone@Example.com");
  const key = meter.meterKey("someone@example.com");
  process.env.STORAGE = "demo";
  const demo = hosted.hostedProvider("someone@example.com");
  delete process.env.STORAGE;
  const noOwner = hosted.hostedProvider(null);
  process.env.ANTHROPIC_API_KEY = "not-a-key";
  const badKey = hosted.hostedProvider("someone@example.com");
  delete process.env.MODEL_CAP_USD;
  const cap = meter.monthlyCap();
  process.env.MODEL_CAP_USD = "40";
  const set = meter.monthlyCap();
  const spent = await meter.spentThisMonth(key);
  await meter.assertWithinCap(key);
  check(
    "the hosted provider is Claude on the deployment's key, metered under a fingerprint of the sign-in that names no one; none in the demo, without a sign-in or without a key; the cap defaults and can be set",
    p?.kind === "anthropic" && p.meter === key && /^[0-9a-f]{24}$/.test(key) && !key.includes("example") && demo === null && noOwner === null && badKey === null &&
      cap === meter.DEFAULT_CAP_USD && set === 40 && spent === 0 && meter.monthOf(new Date("2026-11-30T23:59:00Z")) === "2026-11",
  );
  check("callModel and the analyst hold the cap and count each call", /assertWithinCap/.test(readFileSync("lib/methodology-draft.ts", "utf8")) && /addSpend/.test(readFileSync("lib/methodology-draft.ts", "utf8")) && /assertWithinCap/.test(readFileSync("lib/analyst-agent.ts", "utf8")) && /addSpend/.test(readFileSync("lib/analyst-agent.ts", "utf8")));
  for (const [k, v] of [["ANTHROPIC_API_KEY", saved.key], ["STORAGE", saved.storage], ["MODEL_CAP_USD", saved.cap], ["DATABASE_URL", saved.db]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// Hamza, 9 Nov 2026: the beta is invite-only, each plan has its own cap, and an account can be deleted whole.
function betaChecks() {
  const caps = planCaps("beta:2.5, pro:9 ; core:x founder:-1 nobody:4");
  check(
    "PLAN_CAPS_USD is read over the defaults, a pair that does not read left at its default; a plan's cap, else the deployment's",
    caps.beta === 2.5 && caps.pro === 9 && caps.core === DEFAULT_PLAN_CAPS.core && caps.founder === DEFAULT_PLAN_CAPS.founder &&
      planCaps(undefined).beta === DEFAULT_PLAN_CAPS.beta && capOf("pro", caps, 15) === 9 && capOf(null, caps, 15) === 15 &&
      defaultPlan(" Beta ") === "beta" && defaultPlan("gold") === null && defaultPlan(undefined) === null,
  );
  check(
    "SIGN_UP takes open or invite, and anything else closes sign-up",
    signUpModeOf("open") === "open" && signUpModeOf(" Invite ") === "invite" && signUpModeOf(undefined) === "closed" && signUpModeOf("yes") === "closed",
  );
  check(
    "an invitation is twelve letters and digits from an alphabet that cannot be misread, typed with or without dashes and shown in groups of four",
    normalInviteCode("abcd-efgh jkmn") === "ABCDEFGHJKMN" && inviteShapeOk("abcd-efgh-jkmn") && !inviteShapeOk("abcd-efgh") &&
      shownInviteCode("abcdefghjkmn") === "ABCD-EFGH-JKMN" && INVITE_LENGTH === 12 && !/[0O1IL]/.test(INVITE_ALPHABET),
  );
  const shares = funnel({ signed_up: 40, statement_read: 30, connector_added: 3 });
  check(
    "the five counts are people and shares of those who signed up, none when no one has",
    shares.length === BETA_EVENTS.length && shares[0].share === 100 && shares[1].share === 75 && shares.find((r) => r.event === "methodology_confirmed")?.people === 0 &&
      shares.find((r) => r.event === "connector_added")?.share === 8 && funnel({}).every((r) => r.share === null),
  );
  const users = readFileSync("lib/users.ts", "utf8");
  const auth = readFileSync("lib/auth.ts", "utf8");
  const draft = readFileSync("lib/methodology-draft.ts", "utf8");
  const beta = readFileSync("lib/beta-run.ts", "utf8");
  const mcp = readFileSync("lib/mcp-run.ts", "utf8");
  check(
    "an invitation is used up in one statement that cannot let in more than it allows, kept as a hash and a sealed copy, and checked at a Google or Microsoft sign-in too",
    /used < uses and expires_at > now\(\)/.test(users) && /inviteHash/.test(users) && /sealText/.test(users) && /INVITE_COOKIE/.test(auth) && /invite=needed/.test(auth),
  );
  check("each call is held to its person's plan's cap and counted by agent", /assertWithinCap\(meter, provider\.cap\)/.test(draft) && /tag\?\.agent/.test(draft) && /capFor\(/.test(readFileSync("lib/hosted-model.ts", "utf8")));
  check(
    "Delete my account deletes every row keyed on the person and refuses an operator",
    ["leaveClub", "forgetClubPerson", "leaveHousehold", "unlist", "forgetDonations", "stopSharing", "withdraw", "dropBucket", "forgetSpend", "forgetSignals", "deleteUser", "delete from beta_events"].every((s) => beta.includes(s)) && /runsDeployment\(e\)\) throw/.test(beta),
  );
  check("an account made here may add the connector, asked at every token and call", /export async function mayConnect/.test(mcp) && /withAccess\(\(allowed\)/.test(mcp) && /withAccess/.test(readFileSync("app/api/mcp/oauth/token/route.ts", "utf8")));
}
betaChecks();

void hostedChecks().then(() => {
  console.log(`\n${passed} ok, ${failed} missed`);
  if (failed) process.exit(1);
});
