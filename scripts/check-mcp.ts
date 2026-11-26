/**
 * The MCP server a person adds to their own Claude (lib/mcp.ts,
 * lib/mcp-tools.ts, lib/mcp-auth.ts): the sign-in seals what it carries and
 * opens nothing it did not seal, codes go only to Claude or a loopback
 * address, PKCE and the allowlist are enforced at every step, the protocol
 * answers as Streamable HTTP asks, every tool is read-only and runs over the
 * showcase with figures from the app, and nothing reaches the vault before a
 * tool is called. Run: npm run check:mcp
 */
import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { openRulesDocument } from "../lib/open-rules";
import { SKILL_NAME, skillMarkdown } from "../lib/invariant-skill";
import { crc32, storedZip } from "../lib/zip-store";

import { EMPTY_ALERTS } from "../lib/alerts";
import { withForms } from "../lib/insiders";
import { composeBook } from "../lib/compose-book";
import { decisionsFileSchema } from "../lib/decisions";
import { filingsFileSchema } from "../lib/filings";
import { bookSchema } from "../lib/holdings";
import { EMPTY_MARKETS } from "../lib/markets";
import { demoEarnings, earningsFileSchema } from "../lib/earnings";
import { handleRpc, LATEST_PROTOCOL, toolList, type RpcReply } from "../lib/mcp";
import {
  accessGrant,
  authorizationServer,
  challenge,
  CLAUDE_CALLBACKS,
  clientOf,
  clientRedirects,
  issueCode,
  mcpKey,
  pkceOk,
  protectedResource,
  readAuthorize,
  redirectAllowed,
  redirectMatches,
  register,
  resourceOf,
  tokenReply,
} from "../lib/mcp-auth";
import { RESEARCH_INSTRUCTIONS, RESEARCH_TOOLS, type ResearchSource } from "../lib/mcp-research";
import { MCP_TOOLS, type McpSource } from "../lib/mcp-tools";
import { addedReads, resultsToRead, ROUTINE_DAILY_DAYS, routineSchedule, withThesisReads } from "../lib/theses";
import type { EarningsEntry } from "../lib/earnings";
import { EMPTY_SENDERS, proposeSenders, type ProposedSender } from "../lib/newsletters";
import { methodologySchema } from "../lib/methodology";
import { defaultPortfolios, type PortfoliosFile } from "../lib/portfolios";
import { DEFAULT_PREFERENCES, EMPTY_RECORDS } from "../lib/preferences";
import { researchFileSchema } from "../lib/research";
import { shownWhen } from "../lib/screens";
import { setupSchema } from "../lib/setup";
import { EMPTY_STATEMENTS } from "../lib/statements";
import { thesesFileSchema, writeThesis, type ThesisWrite } from "../lib/theses";
import { brokerNotices, unknownChecks, withBrokerChecks, BROKER_PREFIX } from "../lib/alerts";
import { decisionFromWrite, DecisionWriteProblem, EMPTY_DECISIONS } from "../lib/decisions";
import { chosenWrite, claudeWriteHref, evidenceOnly, partsOf, partViews, withoutPendingWrite, withPendingWrite } from "../lib/thesis-writes";
import { checkSections, unprintedFigures, writableStudies } from "../lib/study-writes";
import { studySchema } from "../lib/research";
import { recordFields } from "../lib/holdings";
import type { Decision } from "../lib/decisions";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

// --- Sealing and the sign-in ---------------------------------------------

const key = mcpKey("a-long-enough-test-secret-for-the-check")!;
const other = mcpKey("another-long-enough-test-secret-entirely")!;
check("no key from a missing or short AUTH_SECRET, so sign-in stays closed", mcpKey(undefined) === null && mcpKey("short") === null && key.length === 32);

const ORIGIN = "https://po.example.app";
const RESOURCE = resourceOf(ORIGIN);
const NOW = 1_760_400_000;
const EMAIL = "owner@example.com";
const allowed = (e: string): boolean => e === EMAIL;

check("the protected resource names the /api/mcp address and the app as its issuer", JSON.stringify(protectedResource(ORIGIN)) === JSON.stringify({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN], scopes_supported: ["portfolio.read"], bearer_methods_supported: ["header"], resource_name: "Invariant" }));
const as = authorizationServer(ORIGIN);
check("the authorization server offers S256, public clients, registration and Claude's published document", (as.code_challenge_methods_supported as string[]).join() === "S256" && (as.token_endpoint_auth_methods_supported as string[]).join() === "none" && as.client_id_metadata_document_supported === true && as.registration_endpoint === `${ORIGIN}/api/mcp/oauth/register` && as.issuer === ORIGIN);
check("the 401 points at the resource metadata", challenge(ORIGIN).includes(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`) && challenge(ORIGIN, "invalid_token").includes('error="invalid_token"'));

const reg = register(key, { redirect_uris: [CLAUDE_CALLBACKS[0]], client_name: "Claude", token_endpoint_auth_method: "none" });
check("Claude registers with its callback and gets a sealed client id", reg.ok && typeof reg.reply.client_id === "string" && (reg.reply.client_id as string).startsWith("pos1."));
check("a client that would send codes elsewhere is refused at registration", !register(key, { redirect_uris: ["https://evil.example/cb"] }).ok && !register(key, { redirect_uris: ["http://example.com/cb"] }).ok && !register(key, { redirect_uris: [] }).ok && !register(key, { redirect_uris: [CLAUDE_CALLBACKS[0], 7] }).ok);
check("a confidential client is refused: clients here are public", !register(key, { redirect_uris: [CLAUDE_CALLBACKS[0]], token_endpoint_auth_method: "client_secret_basic" }).ok);
const regLocal = register(key, { redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], client_name: "Claude Code" });
check("Claude Code registers its loopback addresses", regLocal.ok);

const clientId = (reg.reply as Record<string, unknown>).client_id as string;
const client = clientOf(key, clientId);
check("the client id opens to its own addresses and name", !!client && client.name === "Claude" && client.redirects?.[0] === CLAUDE_CALLBACKS[0] && !client.claude);
check("a client id sealed under another key, or tampered with, is unknown", clientOf(other, clientId) === null && clientOf(key, `${clientId.slice(0, -4)}AAAA`) === null && clientOf(key, "pos1.junk") === null && clientOf(key, "") === null);
check("Claude's published client documents are taken on claude.ai and claude.com only", clientOf(key, "https://claude.ai/oauth/claude-code-client-metadata")?.name === "Claude Code" && clientOf(key, "https://claude.com/x")?.claude === true && clientOf(key, "https://claude.ai.evil.example/x") === null && clientOf(key, "https://evil.example/claude") === null && clientOf(key, "https://claude.ai:8443/x") === null);
check("a loopback address matches on any port, and nothing else does", redirectMatches(["http://localhost/callback"], "http://localhost:3118/callback") && redirectMatches(["http://127.0.0.1/callback"], "http://127.0.0.1:50000/callback") && !redirectMatches(["http://localhost/callback"], "http://localhost:3118/other") && !redirectMatches([CLAUDE_CALLBACKS[0]], "https://claude.ai/api/mcp/auth_callback/x") && !redirectMatches(["https://evil.example/cb"], "https://evil.example/cb"));

const verifier = randomBytes(32).toString("base64url");
const challengeOf = (v: string) => createHash("sha256").update(v).digest("base64url");
const authParams = { client_id: clientId, redirect_uri: CLAUDE_CALLBACKS[0], response_type: "code", state: "st-1", code_challenge: challengeOf(verifier), code_challenge_method: "S256", resource: RESOURCE, scope: "portfolio.read offline_access" };
const read = readAuthorize(key, authParams, RESOURCE);
check("a well-formed request from Claude reads", read.ok && read.req.redirect === CLAUDE_CALLBACKS[0] && read.req.state === "st-1");
const shown = (p: Record<string, string | undefined>) => {
  const r = readAuthorize(key, p, RESOURCE);
  return !r.ok && "show" in r.problem;
};
const sentBack = (p: Record<string, string | undefined>, error: string) => {
  const r = readAuthorize(key, p, RESOURCE);
  return !r.ok && "redirect" in r.problem && r.problem.error === error && r.problem.redirect === CLAUDE_CALLBACKS[0];
};
check("an unknown client or a foreign address is shown on the page, never redirected to", shown({ ...authParams, client_id: "pos1.forged" }) && shown({ ...authParams, redirect_uri: "https://evil.example/cb" }) && shown({ ...authParams, redirect_uri: "http://localhost:9/cb" }));
check("no PKCE, plain PKCE, another resource or another scope goes back to Claude as an error", sentBack({ ...authParams, code_challenge: undefined }, "invalid_request") && sentBack({ ...authParams, code_challenge_method: "plain" }, "invalid_request") && sentBack({ ...authParams, resource: "https://other.example/api/mcp" }, "invalid_target") && sentBack({ ...authParams, scope: "portfolio.write" }, "invalid_scope") && sentBack({ ...authParams, response_type: "token" }, "unsupported_response_type"));

const GOOGLE_REFRESH = "1//google-refresh-token-for-the-check";
const code = read.ok ? issueCode(key, read.req, { email: EMAIL, provider: "google", refresh: GOOGLE_REFRESH }, NOW) : "";
const form = (o: Record<string, string>) => new URLSearchParams(o);
const exchange = (o: Record<string, string>, now = NOW + 10, isAllowed = allowed) => tokenReply(key, form({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: CLAUDE_CALLBACKS[0], code_verifier: verifier, resource: RESOURCE, ...o }), isAllowed, now);
const ok = exchange({});
check("the code exchanges for a bearer token and a refresh token, an hour and thirty days", ok.status === 200 && ok.body.token_type === "Bearer" && ok.body.expires_in === 3600 && typeof ok.body.refresh_token === "string");
check("nothing the client holds shows the sign-in's refresh token or the address", !JSON.stringify(ok.body).includes("google-refresh") && !JSON.stringify(ok.body).includes(EMAIL) && !code.includes("google-refresh"));
check("a wrong verifier, another client, another address or a late code is invalid_grant", exchange({ code_verifier: randomBytes(32).toString("base64url") }).body.error === "invalid_grant" && exchange({ client_id: "pos1.other" }).body.error === "invalid_grant" && exchange({ redirect_uri: "http://localhost:1/cb" }).body.error === "invalid_grant" && exchange({}, NOW + 301).body.error === "invalid_grant");
check("an address taken off the allowlist gets no token", exchange({}, NOW + 10, () => false).body.error === "invalid_grant");
check("the token endpoint names its grant types", tokenReply(key, form({ grant_type: "client_credentials" }), allowed, NOW).body.error === "unsupported_grant_type");

const access = ok.body.access_token as string;
const grant = accessGrant(key, `Bearer ${access}`, RESOURCE, allowed, NOW + 20);
check("the bearer token opens to the person, the provider and the sign-in's own refresh token", grant?.email === EMAIL && grant.provider === "google" && grant.refresh === GOOGLE_REFRESH && grant.resource === RESOURCE);
check("a token is refused when expired, for another server, off the allowlist, under another key, or not a bearer", accessGrant(key, `Bearer ${access}`, RESOURCE, allowed, NOW + 3700) === null && accessGrant(key, `Bearer ${access}`, "https://other.example/api/mcp", allowed, NOW + 20) === null && accessGrant(key, `Bearer ${access}`, RESOURCE, () => false, NOW + 20) === null && accessGrant(other, `Bearer ${access}`, RESOURCE, allowed, NOW + 20) === null && accessGrant(key, access, RESOURCE, allowed, NOW + 20) === null && accessGrant(key, null, RESOURCE, allowed, NOW + 20) === null);
check("a refresh token or a code is not a bearer token", accessGrant(key, `Bearer ${ok.body.refresh_token as string}`, RESOURCE, allowed, NOW + 20) === null && accessGrant(key, `Bearer ${code}`, RESOURCE, allowed, NOW + 20) === null);
const refreshed = tokenReply(key, form({ grant_type: "refresh_token", refresh_token: ok.body.refresh_token as string, client_id: clientId }), allowed, NOW + 4000);
check("the refresh token gives a new pair that reads", refreshed.status === 200 && refreshed.body.refresh_token !== ok.body.refresh_token && accessGrant(key, `Bearer ${refreshed.body.access_token as string}`, RESOURCE, allowed, NOW + 4010)?.email === EMAIL);
check("a refresh is refused for a bearer token, another client, after thirty days, or off the allowlist", tokenReply(key, form({ grant_type: "refresh_token", refresh_token: access }), allowed, NOW + 30).body.error === "invalid_grant" && tokenReply(key, form({ grant_type: "refresh_token", refresh_token: ok.body.refresh_token as string, client_id: "pos1.x" }), allowed, NOW + 30).body.error === "invalid_grant" && tokenReply(key, form({ grant_type: "refresh_token", refresh_token: ok.body.refresh_token as string }), allowed, NOW + 31 * 86400).body.error === "invalid_grant" && tokenReply(key, form({ grant_type: "refresh_token", refresh_token: ok.body.refresh_token as string }), () => false, NOW + 30).body.error === "invalid_grant");
check("PKCE needs a well-formed verifier", !pkceOk("short", challengeOf("short")) && !pkceOk(undefined, "x") && pkceOk(verifier, challengeOf(verifier)));

// --- The protocol ----------------------------------------------------------

const sample = <T>(file: string, parse: (x: unknown) => T): T => parse(JSON.parse(readFileSync(`data/samples/${file}`, "utf8")));
const m = sample("methodology.showcase.json", (x) => methodologySchema.parse(x));
const filings = sample("showcase.filings.json", (x) => filingsFileSchema.parse(x));
const research = sample("showcase.research.json", (x) => researchFileSchema.parse(x));
const decisions = sample("showcase.decisions.json", (x) => decisionsFileSchema.parse(x));
const book = composeBook(sample("showcase.book.json", (x) => bookSchema.parse(x)), { records: EMPTY_RECORDS, filings, research, markets: EMPTY_MARKETS, methodology: m })!;
const setup = setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr"], tradesOptions: false, helperName: null, methodology: m, updated: "2026-10-10T00:00:00.000Z" });
/** The demo's ASML and MA reports, at the days these checks were written for: ASML's release two weekdays before, MA's results the weekday before. */
function earningsFixture() {
  const raw = JSON.parse(readFileSync("data/samples/earnings.json", "utf8")) as { reports: { symbol: string; offset: number }[] };
  const at: Record<string, number> = { ASML: -2, MA: -1 };
  return { ...raw, reports: raw.reports.filter((r) => r.symbol in at).map((r) => ({ ...r, offset: at[r.symbol] })) };
}
const source = (portfolios: PortfoliosFile = defaultPortfolios(book)): McpSource => ({
  today: "2026-10-12",
  demo: true,
  setup,
  book,
  portfolios,
  shown: shownWhen(m, book, EMPTY_RECORDS, decisions),
  preferences: DEFAULT_PREFERENCES,
  records: EMPTY_RECORDS,
  decisions,
  alerts: EMPTY_ALERTS,
  research,
  reports: null,
  lessons: [],
  filings,
  statements: EMPTY_STATEMENTS,
  newslettersAddress: "statements+demo-news@example.com",
  propose: null,
  theses: sample("theses.json", (x) => thesesFileSchema.parse(x)),
  earnings: demoEarnings(earningsFixture(), "2026-10-12").file,
  calendar: [],
  watchlist: ["TEMX"],
  writeThesis: null,
  recordDecision: null,
  researchCache: null,
  hunter: null,
  feedback: null,
  rateFinding: null,
  studiesToWrite: null,
  writeStudy: null,
  reportChecks: null,
  notes: [],
  edgar: null,
});
const WRITING = ["propose_newsletter_senders", "write_thesis", "record_decision", "rate_finding", "get_studies_to_write", "write_study", "report_price_checks"];
let opened = 0;
const open = async () => {
  opened += 1;
  return source();
};
const problem = (e: unknown) => `problem: ${e instanceof Error ? e.message : "?"}`;
const rpc = async (msg: unknown) => handleRpc(msg, open, problem);
const result = (h: Awaited<ReturnType<typeof rpc>>) => ("body" in h && !Array.isArray(h.body) ? (h.body as RpcReply).result : undefined) as Record<string, unknown> | undefined;
const errorOf = (h: Awaited<ReturnType<typeof rpc>>) => ("body" in h && !Array.isArray(h.body) ? (h.body as RpcReply).error : undefined);

const run = async () => {
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } } });
  const ir = result(init)!;
  check("initialize answers in the client's version, with tools and instructions", init.status === 200 && ir.protocolVersion === "2025-06-18" && !!(ir.capabilities as { tools?: unknown }).tools && typeof ir.instructions === "string" && (ir.serverInfo as { name: string }).name === "portfolio-os");
  const withOrigin = result(await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }, open, problem, "https://portfolio.example"))!.serverInfo as { websiteUrl?: string; icons?: { src: string; mimeType: string }[] };
  check("initialize names the app's own icon and website when the origin is known, and neither without it", withOrigin.websiteUrl === "https://portfolio.example" && withOrigin.icons?.length === 2 && withOrigin.icons[0].src === "https://portfolio.example/icon-256.png" && withOrigin.icons[1].src === "https://portfolio.example/icon.svg" && !(ir.serverInfo as { icons?: unknown }).icons);
  check("an unknown version is answered with the latest", result(await rpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }))!.protocolVersion === LATEST_PROTOCOL);
  check("a notification and the client's own answer are accepted with 202 and no body", (await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status === 202 && (await rpc({ jsonrpc: "2.0", id: 9, result: {} })).status === 202);
  check("ping answers empty", JSON.stringify(result(await rpc({ jsonrpc: "2.0", id: 3, method: "ping" }))) === "{}");
  check("an unknown method, a message that is not JSON-RPC and an empty batch are errors", errorOf(await rpc({ jsonrpc: "2.0", id: 4, method: "sampling/createMessage" }))?.code === -32601 && errorOf(await rpc({ id: 5, method: "ping" }))?.code === -32600 && (await rpc([])).status === 400);
  const batch = await rpc([{ jsonrpc: "2.0", id: "a", method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: "b", method: "ping" }]);
  check("a batch answers each request in order and leaves notifications out", batch.status === 200 && Array.isArray(batch.body) && batch.body.map((r) => r.id).join() === "a,b");

  const listed = result(await rpc({ jsonrpc: "2.0", id: 6, method: "tools/list" }))!.tools as ReturnType<typeof toolList>;
  check("connecting and listing tools read nothing of the person", opened === 0);
  check("every tool is listed once, read-only but the ones that write to the person's own vault, and never destructive", listed.length === MCP_TOOLS.length && new Set(listed.map((t) => t.name)).size === listed.length && listed.every((t) => t.annotations.readOnlyHint === !WRITING.includes(t.name) && t.annotations.destructiveHint === false));
  const wt = listed.find((t) => t.name === "write_thesis")!.inputSchema as { properties?: Record<string, unknown> };
  check("write_thesis takes the record's part too: the triggers, the levels and the valuation calculator, and says a new symbol joins the watchlist (Hamza, 19 Oct 2026)", ["triggers", "levels", "valuation"].every((k) => k in (wt.properties ?? {})) && /watchlist/.test(listed.find((t) => t.name === "write_thesis")!.description ?? ""));
  check("every tool's input is a JSON Schema object, with optional arguments left optional", listed.every((t) => (t.inputSchema as { type?: string }).type === "object") && !((listed.find((t) => t.name === "search_vault")!.inputSchema as { required?: string[] }).required ?? []).includes("k"));
  check("no read-only tool is named as writing, filing, sending or trading, and the writing ones say what they write", listed.every((t) => WRITING.includes(t.name) || !/^(set|save|create|update|delete|place|send|file|write|keep|dismiss)_/.test(t.name)) && listed.filter((t) => WRITING.includes(t.name)).every((t) => /the person|they keep|review/.test(t.description)));

  const call = async (name: string, args: unknown = {}) => {
    const r = result(await rpc({ jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } }))!;
    return { text: (r.content as { text: string }[])[0].text, isError: r.isError as boolean };
  };
  const ov = await call("get_overview");
  check("the overview reads the showcase: net worth, weights, checks counted, read-only and not advice", !ov.isError && /Net worth: \$[\d,]+/.test(ov.text) && /Largest by weight: \w+ [\d.]+%/.test(ov.text) && /Checks: \d+ pass/.test(ov.text) && ov.text.includes("not investment advice"), ov.text.slice(0, 400));
  check("a tool call opens the person's data once", opened === 1);
  const rc = await call("run_checks");
  check("the checks cite each rule's section with its result", !rc.isError && m.rules.every((r) => rc.text.includes(r.section)) && /\[(pass|near|fail|yours to check)/.test(rc.text));
  const mt = await call("get_methodology");
  check("the methodology lists every rule, figure and class by id", !mt.isError && m.rules.every((r) => mt.text.includes(r.id)) && m.figures.every((f) => mt.text.includes(f.id)) && m.classes.every((k) => mt.text.includes(k.id)));
  const sym = book.holdings.find((h) => h.assetClass === "equity")!.symbol;
  const hd = await call("get_holdings", { symbols: [sym], fields: ["symbol", "value", "class", "not_a_field"] });
  check("holdings read as ontology fields, an unknown field named", !hd.isError && hd.text.includes(`symbol=${sym}`) && hd.text.includes("Not holdings fields in the ontology: not_a_field"));
  const cf = await call("compute_figures", { figures: [{ id: "weight-by-symbol", label: "Weight by holding", unit: "pct", view: "bars", by: "symbol", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "value" }, den: { measure: "sum", over: "holdings", field: "value", whole: true } } }, { id: "bad" }] });
  check("a recipe is computed by the app and an invalid one comes back with its issues", !cf.isError && /Weight by holding .*: \w+: [\d.]+%/.test(cf.text) && cf.text.includes("Recipe 2 is not valid"));
  check("the recipe language comes with the ontology", (await call("describe_recipes")).text.includes("The ontology:"));
  check("the alerts, the to-do and the Decision Log read", !(await call("get_alerts")).isError && !(await call("get_todo")).isError && (await call("get_decision_log", { limit: 2 })).text.split("\n- ").length <= 2 && !(await call("get_decision_log")).text.includes("empty"));
  check("the vault is searched for what it knows", /\[(rule|figure|class|study)\]/.test((await call("search_vault", { query: "cap weight" })).text));
  check("the demo keeps no reviews and reads no filings, and says so", (await call("get_latest_review")).text.includes("demo") && (await call("get_edgar_facts", { ticker: "MSFT" })).text.includes("demo"));
  const demoPropose = await call("propose_newsletter_senders", { senders: [{ address: "letters@example.com" }] });
  check("the demo keeps no proposed sender, and says so", demoPropose.isError && demoPropose.text.includes("demo"));
  const proposedCalls: ProposedSender[][] = [];
  const proposing: McpSource = {
    ...source(),
    demo: false,
    propose: async (found) => {
      proposedCalls.push([...found]);
      return proposeSenders({ ...EMPTY_SENDERS, senders: [{ address: "kept@example.com", name: null, cadence: null, from: "you", status: "kept", at: "2026-10-01T00:00:00.000Z" }] }, found, "2026-10-12T07:00:00.000Z");
    },
  };
  const pr = await handleRpc({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "propose_newsletter_senders", arguments: { senders: [{ address: "Harbour <note@harbour.example>", name: "Harbour Rates Note", cadence: "every weekday" }, { address: "kept@example.com" }] } } }, async () => proposing, problem);
  const prText = pr.status === 200 && !Array.isArray(pr.body) ? ((pr.body.result as { content: { text: string }[] }).content[0].text) : "";
  check("proposed senders are laid on the vault once, counted, and the person is sent to Newsletters to decide", proposedCalls.length === 1 && proposedCalls[0].length === 2 && prText.includes("1 new sender proposed, 1 already kept") && prText.includes("1 proposal now wait") && prText.includes("Newsletters") && prText.includes("statements+demo-news@example.com") && prText.includes("Do not create, change or send anything in Gmail"), prText);
  check("a proposal with no sender does not fit", (await call("propose_newsletter_senders", { senders: [] })).isError);
  const th = await call("get_theses");
  check("the theses list the market theses, the holdings and the watchlist, one line each", !th.isError && th.text.includes("# Market theses (1)") && th.text.includes('"Rates stay higher for longer" (id rates-stay-higher)') && /# Stock theses: holdings \(\d+\)/.test(th.text) && th.text.includes("TEMX, on the watchlist: no thesis yet"), th.text.slice(0, 600));
  const thOne = await call("get_theses", { symbol: "MA" });
  check("one stock thesis reads in full with its pillars read today and what was added", !thOne.isError && thOne.text.includes("## MA") && thOne.text.includes("Pillars, read today:") && thOne.text.includes("Added to the thesis (1") && /\[(price|[a-z_]+) (>=|<=) [\d.]+; (supported|mixed|risk|unread)/.test(thOne.text), thOne.text.slice(0, 600));
  // Results to read (Hamza, 26 Oct 2026): what the person's Claude reads after each results, on their schedule, and writes back with write_thesis.
  const rr = await call("get_results_to_read");
  check("results to read: the followed companies that reported lately, newest first, those with nothing added since marked to read", !rr.isError && rr.text.includes("of which 1 with the call not yet added") && rr.text.indexOf("- ASML") < rr.text.indexOf("Already read:") && rr.text.indexOf("Already read:") < rr.text.indexOf("- MA") && rr.text.includes("ASML (ASML Holding N.V.): results 2026-10-08") && rr.text.includes("filed figures not yet in") && !rr.text.toLowerCase().includes("quartr"), rr.text.slice(0, 500));
  const later = thesesFileSchema.parse(sample("theses.json", (x) => x));
  later.bySymbol.ASML = { ...later.bySymbol.ASML!, evidence: [...later.bySymbol.ASML!.evidence, { id: "2026-10-12-x", at: "2026-10-12", source: "Q3 2026 call", kind: "document", summary: "What management said.", changes: null, via: "claude", call: { guidance: [], qa: [], remarks: ["Orders held."], beats: [] } }] };
  const noCall = thesesFileSchema.parse(sample("theses.json", (x) => x));
  noCall.bySymbol.ASML = { ...noCall.bySymbol.ASML!, evidence: [...noCall.bySymbol.ASML!.evidence, { id: "2026-10-12-y", at: "2026-10-12", source: "A note", kind: "document", summary: "Written before the call was asked for.", changes: null, via: "claude" }] };
  const rrNoCall = await handleRpc({ jsonrpc: "2.0", id: 32, method: "tools/call", params: { name: "get_results_to_read", arguments: {} } }, async () => ({ ...source(), theses: noCall }), problem);
  const rrNoCallText = rrNoCall.status === 200 && !Array.isArray(rrNoCall.body) ? (rrNoCall.body.result as { content: { text: string }[] }).content[0].text : "";
  check("results to read: an entry since the results without the call leaves them to read once more, saying so (Hamza, 29 Oct 2026)", rrNoCallText.includes("of which 1 with the call not yet added") && rrNoCallText.includes("None of it carries the call"), rrNoCallText.slice(0, 600));
  const rrRead = await handleRpc({ jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "get_results_to_read", arguments: {} } }, async () => ({ ...source(), theses: later }), problem);
  const rrText = rrRead.status === 200 && !Array.isArray(rrRead.body) ? (rrRead.body.result as { content: { text: string }[] }).content[0].text : "";
  check("results to read: a thesis with something added since its results is already read, named with its source", rrText.includes("each of the 2 results of the last 21 days already has its call added to its thesis") && rrText.startsWith("Schedule: every week (no followed company has a results date on the calendar yet).") && rrText.includes("Q3 2026 call (2026-10-12)"), rrText.slice(0, 500));
  check("results to read: no followed company reporting lately says there is nothing to read", resultsToRead(null, null, "2026-10-12").length === 0);
  // The routine's own schedule (Hamza, 26 Oct 2026: a month with no results should barely cost anything): from the results calendar, never the model's guess.
  check("schedule: an older result not read yet keeps the routine daily, said on the first line", rr.text.startsWith("Schedule: every day (ASML still to read)."), rr.text.slice(0, 120));
  const entry = (symbol: string, date: string, time: EarningsEntry["time"] = "post"): EarningsEntry => ({ symbol, name: null, date, time, quarter: null, epsForecast: null, estimates: null, lastYearEps: null, kind: "holding", subjectName: null });
  const none = { version: 1 as const, bySymbol: {}, markets: [], updated: "" };
  const quiet = routineSchedule([], [entry("AMZN", "2026-11-20")], none, "2026-10-12");
  check("schedule: a month with no results runs once a week and names the next results", quiet.every === "every week" && quiet.why === "the next results are AMZN on 2026-11-20, after the close" && routineSchedule([], [], none, "2026-10-12").every === "every week");
  check("schedule: the week before a followed company's results it runs every day", routineSchedule([], [entry("AMZN", "2026-10-19", "pre")], none, "2026-10-12").every === "every day" && ROUTINE_DAILY_DAYS === 7 && routineSchedule([], [entry("AMZN", "2026-10-20")], none, "2026-10-12").every === "every week");
  const day = routineSchedule([], [entry("AMZN", "2026-10-12")], none, "2026-10-12");
  check("schedule: from the results day until the company is read it runs every 6 hours", day.every === "every 6 hours" && day.why === "AMZN reports today, after the close" && routineSchedule([], [entry("AMZN", "2026-10-13")], none, "2026-10-12").every === "every day" && routineSchedule([], [entry("AMZN", "2026-10-12", "pre")], none, "2026-10-12").why === "AMZN reports today, before the open" && routineSchedule([], [entry("AMZN", "2026-10-10")], none, "2026-10-12").every === "every 6 hours");
  const readAmzn = { ...none, bySymbol: { AMZN: { text: "t", pathway: null, pillars: [], watch: [], evidence: [{ id: "e", at: "2026-10-11", source: "Quartr: AMZN Q3", kind: "document" as const, summary: "s", changes: null, via: "claude" as const }] } } } as unknown as Parameters<typeof routineSchedule>[2];
  check("schedule: once read, the results no longer hold it at every 6 hours", routineSchedule([], [entry("AMZN", "2026-10-10")], readAmzn, "2026-10-12").every === "every week");
  check("schedule: a calendar that cannot be read keeps it daily", routineSchedule([], null, none, "2026-10-12").every === "every day");
  // The reads go into the reports themselves (Hamza, 26 Oct 2026): laid on the detail, the earnings deck made again, the report's date and alert left alone.
  const earn = demoEarnings(earningsFixture(), "2026-10-12").file;
  const laid = withThesisReads({ ...earn, reports: earn.reports.map((r) => ({ ...r, deck: { id: "deck-0000000001", url: "https://docs.google.com/presentation/d/x", at: "2026-10-11T00:00:00Z" } })) }, later, "2026-10-12");
  const asml = laid.file.reports.find((r) => r.symbol === "ASML");
  const was = earn.reports.find((r) => r.symbol === "ASML");
  check("reads on the report: what was added since the results is laid on its detail, its earnings deck marked to be made again, its date kept", laid.changed === 2 && asml?.detail?.added[0]?.source === "Q3 2026 call" && asml.deck?.at === "" && asml.deck.id === "deck-0000000001" && asml.updatedAt === was?.updatedAt && withThesisReads(earn, null, "2026-10-12").changed === 0, JSON.stringify(asml?.detail?.added ?? null));
  check("reads on the report: laid again with nothing new, nothing changes", withThesisReads(laid.file, later, "2026-10-12").changed === 0 && withThesisReads(laid.file, later, "2026-11-30").changed === 0);
  check("reads on the report: kept on the report's schema, at most four, clipped", earningsFileSchema.safeParse(laid.file).success && addedReads(Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, at: "2026-10-12", source: "s", kind: "document" as const, summary: "y".repeat(2000), changes: null, via: "claude" as const }))).every((a, _i, all) => all.length === 4 && a.summary.length === 600));
  const thMarket = await call("get_theses", { thesis: "Rates stay higher for longer" });
  check("one market thesis reads by title with its pillars on the indicators", !thMarket.isError && thMarket.text.includes("(id rates-stay-higher)") && thMarket.text.includes("US10Y >= 4"), thMarket.text.slice(0, 400));
  check("an unknown market thesis names the ones on file", (await call("get_theses", { thesis: "Nothing" })).text.includes("rates-stay-higher"));
  const demoWrite = await call("write_thesis", { kind: "stock", symbol: "MA", text: "A line." });
  check("the demo writes no thesis, and says so", demoWrite.isError && demoWrite.text.includes("demo"));
  const writes: ThesisWrite[] = [];
  let thesesFile = source().theses!;
  const writing: McpSource = {
    ...source(),
    demo: false,
    writeThesis: async (w) => {
      writes.push(w);
      const out = writeThesis(thesesFile, w, new Date("2026-10-18T10:00:00.000Z"), "2026-10-18");
      thesesFile = out.file;
      return { pending: false, subject: out.subject, changed: out.changed, created: out.created };
    },
  };
  const wcall = async (args: unknown) => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "write_thesis", arguments: args } }, async () => writing, problem);
    const res = r.status === 200 && !Array.isArray(r.body) ? (r.body.result as { content: { text: string }[]; isError?: boolean }) : null;
    return { text: res?.content[0].text ?? "", isError: !!res?.isError };
  };
  const w1 = await wcall({ kind: "stock", symbol: "ma", evidence: { source: "Q3 2026 call", summary: "Volume growth held at 10%.", changes: null, date: "2026-10-17" } });
  check("an evidence entry is added to a stock thesis through the vault, marked as Claude's, and the person is sent to Theses", !w1.isError && w1.text.includes("Changed the MA thesis: evidence.") && w1.text.includes("Theses screen") && writes.length === 1 && thesesFile.bySymbol.MA.evidence.at(-1)?.via === "claude" && thesesFile.bySymbol.MA.evidence.at(-1)?.at === "2026-10-17" && thesesFile.bySymbol.MA.text === source().theses!.bySymbol.MA.text, w1.text);
  const w2 = await wcall({ kind: "market", thesis: "Dollar weakens", text: "The dollar weakens as rates converge.", pillars: [{ name: "Ten-year", text: "The ten-year yield falls.", test: { field: "us10y", is: "lte", value: 4 } }] });
  check("a market thesis not on file is started by title, its pillar's indicator upper-cased", !w2.isError && w2.text.includes('Started the market thesis "Dollar weakens"') && thesesFile.markets.length === 2 && thesesFile.markets[1].id === "dollar-weakens" && thesesFile.markets[1].pillars[0].test?.field === "US10Y", w2.text);
  const w3 = await wcall({ kind: "stock", symbol: "MA", pillars: [{ name: "Growth", text: "", test: { field: "not_a_field", is: "gte", value: 1 } }] });
  check("a pillar on a field the ontology lacks is refused with the field named, and nothing is written", w3.isError && w3.text.includes("not_a_field") && thesesFile.bySymbol.MA.pillars.length === source().theses!.bySymbol.MA.pillars.length, w3.text);
  check("a write with nothing to write is refused", (await wcall({ kind: "stock", symbol: "MA" })).isError);
  const before = writes.length;
  check("a write that does not fit the shape is refused before anything runs", (await wcall({ kind: "stock" })).isError && (await wcall({ kind: "market", text: "No thesis named." })).isError && writes.length === before);
  await writeBackChecks();
  const bad = await call("get_holdings", { symbols: "MSFT" });
  check("arguments that do not fit come back as an error result, not a protocol error", bad.isError && bad.text.includes("do not fit get_holdings"));
  check("an unknown tool is a protocol error", errorOf(await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "place_order", arguments: {} } }))?.code === -32602);
  const nop = await call("get_overview", { portfolio: "Nowhere" });
  check("an unknown portfolio names the ones there are", nop.isError && nop.text.includes("The portfolios are"));

  // Several portfolios, one methodology each: together there is no verdict, one alone has its own.
  const accounts = [...new Set(book.holdings.map((h) => h.account))];
  const two: PortfoliosFile = { version: 1, mode: "each", items: [{ id: "core", name: "Core", accounts: accounts.slice(0, 1), methodology: m }, { id: "rest", name: "Rest", accounts: accounts.slice(1), methodology: null }], updated: "" } as PortfoliosFile;
  const each = await handleRpc({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "run_checks", arguments: {} } }, async () => source(two), problem);
  const eachText = ((result(each)!.content as { text: string }[])[0]).text;
  check("under one methodology per portfolio, all together carry no verdict and the tool says to name one", (result(each)!.isError as boolean) && eachText.includes("name one: Core, Rest"));
  const core = await handleRpc({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "run_checks", arguments: { portfolio: "core" } } }, async () => source(two), problem);
  check("one portfolio alone runs its own methodology", !(result(core)!.isError as boolean) && ((result(core)!.content as { text: string }[])[0]).text.includes("the Core portfolio"));

  const failing = await handleRpc({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "get_overview", arguments: {} } }, async () => {
    throw new Error("vault unreachable");
  }, problem);
  check("a vault that cannot be opened is a sentence in an error result", (result(failing)!.isError as boolean) && ((result(failing)!.content as { text: string }[])[0]).text === "problem: vault unreachable");
};


// ChatGPT signs in the same way (Hamza, 21 Oct 2026)
{
  check("chatgpt: its callbacks are taken, a look-alike is not", redirectAllowed("https://chatgpt.com/connector_platform_oauth_redirect") && redirectAllowed("https://chatgpt.com/connector/oauth/abc_123") && redirectAllowed("https://platform.openai.com/apps-manage/oauth") && !redirectAllowed("https://chatgpt.com.evil.example/connector_platform_oauth_redirect") && !redirectAllowed("https://chatgpt.com/connector/oauth/../x") && !redirectAllowed("https://evil.example/connector_platform_oauth_redirect"));
  const ckey = mcpKey("a-test-secret-of-enough-length")!;
  const reg = register(ckey, { redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], client_name: "Some name", token_endpoint_auth_method: "none" });
  const c = reg.ok ? clientOf(ckey, reg.reply.client_id as string) : null;
  check("chatgpt: it registers itself and is named ChatGPT on the consent page", reg.ok && c?.name === "ChatGPT" && !!c?.chatgpt && !c?.claude);
  const claudeDoc = clientOf(ckey, "https://claude.ai/oauth/mcp-oauth-client-metadata");
  check("chatgpt: Claude's published document can never send a code to ChatGPT", !!claudeDoc && !clientRedirects(claudeDoc, "https://chatgpt.com/connector_platform_oauth_redirect") && clientRedirects(claudeDoc, CLAUDE_CALLBACKS[0]));
  check("chatgpt: Setup guides it step by step", /CHATGPT_STEPS/.test(readFileSync("components/setup/input-cards.tsx", "utf8")) && /Developer mode/.test(readFileSync("components/setup/guides.tsx", "utf8")));
  // No Quartr in the app (Hamza, 4 Nov 2026): no card, prompt, address, key or tool names it.
  const quartrAnywhere = execSync("git grep -l -i -E 'quartr' -- 'app/*.tsx' 'components/*.tsx' 'components/*.ts' lib/mcp-tools.ts lib/mcp.ts || true", { encoding: "utf8" }).split("\n").filter(Boolean);
  const quartrCallers = execSync("git grep -l -i -E 'quartr\\.com|QUARTR_' -- lib app components || true", { encoding: "utf8" }).split("\n").filter(Boolean);
  check("quartr: no Setup card, prompt, address or tool names it, and no code calls it", quartrAnywhere.length === 0 && quartrCallers.length === 0, [...quartrAnywhere, ...quartrCallers].join(", "));
  check("the call written back on an evidence entry still lands on the report", /call: callReadingSchema/.test(readFileSync("lib/theses.ts", "utf8")));
}

// --- The public research server (Hamza, 23 Oct 2026) ------------------------

async function researchServer() {
  const today = "2026-10-23";
  const co = { ticker: "MA", name: "Mastercard Inc", cik: 1141391 };
  const src: ResearchSource = {
    today,
    ready: null,
    company: async (t) => (t === "MA" ? co : null),
    facts: async () => "| | FY2025 |\n| revenue | 28,000 |",
    insiders: async () => withForms(undefined, [], 0, `${today}T12:00:00Z`),
    short: async () => ({ row: { settlement: "2026-10-15", short: 5_000_000, previous: 4_000_000, averageVolume: 2_500_000, daysToCover: 2, market: null, pctOfShares: 0.55 }, settlement: "2026-10-15" }),
    releases: async () => [{ date: "2026-07-31", time: "pre", form: "8-K", url: "https://www.sec.gov/Archives/edgar/data/1141391/x/" }],
  };
  const kit = { tools: RESEARCH_TOOLS, instructions: RESEARCH_INSTRUCTIONS, info: { name: "portfolio-os-research", title: "Invariant research" } };
  const call = async (name: string, args: unknown, s: ResearchSource = src) => handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, async () => s, () => "failed", null, kit);
  const body = (h: Awaited<ReturnType<typeof call>>) => ("body" in h && !Array.isArray(h.body) ? (h.body as RpcReply) : null);
  const text = (out: Awaited<ReturnType<typeof call>>) => (body(out)?.result as { content: { text: string }[]; isError?: boolean } | undefined);
  const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL } }, async () => src, () => "failed", null, kit);
  const info = (body(init)?.result as { serverInfo: { name: string }; instructions: string } | undefined);
  check("research: initialize names the research server and its own instructions", info?.serverInfo.name === "portfolio-os-research" && /no sign-in/.test(info?.instructions ?? ""));
  const list = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, async () => src, () => "failed", null, kit);
  const tools = (body(list)?.result as { tools: { name: string; annotations: { readOnlyHint: boolean; openWorldHint: boolean } }[] } | undefined)?.tools ?? [];
  check("research: four tools, every one read-only and open-world, none of the person's", tools.length === 4 && tools.every((t) => t.annotations.readOnlyHint && t.annotations.openWorldHint) && !tools.some((t) => MCP_TOOLS.some((m) => m.name === t.name)));
  check("research: no tool writes or reads a price", RESEARCH_TOOLS.every((t) => !t.writes) && !/price feed|Yahoo/.test(RESEARCH_TOOLS.map((t) => t.description).join(" ")));
  const filings = text(await call("company_filings", { ticker: "ma" }));
  check("research: company_filings reads the ticker in any case and names the SEC", !filings?.isError && /Mastercard Inc \(MA\)/.test(filings?.content[0].text ?? "") && /SEC EDGAR/.test(filings?.content[0].text ?? ""));
  const short = text(await call("short_interest", { ticker: "MA" }));
  check("research: short interest from FINRA with its change and days to cover", /FINRA/.test(short?.content[0].text ?? "") && /\+25\.0%/.test(short?.content[0].text ?? "") && /Days to cover: 2\.0/.test(short?.content[0].text ?? ""));
  const rel = text(await call("results_dates", { ticker: "MA" }));
  check("research: results dates say before or after the close", /2026-07-31, before the close/.test(rel?.content[0].text ?? ""));
  const ins = text(await call("insider_trades", { ticker: "MA" }));
  check("research: insiders answer with the codes left out named", !ins?.isError && /Form 4|codes other than P and S/.test(ins?.content[0].text ?? ""));
  const none = text(await call("company_filings", { ticker: "ZZZZ" }));
  check("research: an unknown ticker is a sentence, not a throw", !!none?.isError && /lists no company/.test(none?.content[0].text ?? ""));
  const shut = text(await call("company_filings", { ticker: "MA" }, { ...src, ready: "This deployment names no contact for the SEC." }));
  check("research: a deployment with no SEC contact answers nothing but its sentence", !!shut?.isError && /no contact for the SEC/.test(shut?.content[0].text ?? ""));
  const route = readFileSync("app/api/mcp/research/route.ts", "utf8");
  check("research: the route asks for no sign-in and opens no vault", !/grantOf|authorization|vault/i.test(route.replace(/never a person's vault/, "")) && /researchSource/.test(route));
}

// --- The open rule language and the Invariant skill (Hamza, 9 Nov 2026, the moat) ---
function openRulesAndSkill() {
  const doc = openRulesDocument("https://example.test") as Record<string, unknown> & { properties?: Record<string, unknown>; "x-ontology": { fields: { id: string }[] } };
  const want = Object.keys(methodologySchema.shape ?? {});
  check("open rules: the methodology's own shape as a JSON Schema, every top-level key in it, with the ontology's fields", !!doc.properties && want.every((k) => k in doc.properties!) && doc["x-ontology"].fields.length > 50 && doc.$id === "https://example.test/api/methodology/schema");
  check("open rules: public and read-only: the route reads no vault, no registry and no session", !/from "@\/lib\/(vault|registry|session|workspace|auth)"/.test(readFileSync("app/api/methodology/schema/route.ts", "utf8") + readFileSync("app/api/skill/route.ts", "utf8") + readFileSync("lib/open-rules.ts", "utf8")));
  const md = skillMarkdown("https://example.test");
  check("skill: a SKILL.md with its name and when to use it, get_overview first, every number from a tool, rules cited, nothing traded or advised", md.startsWith(`---\nname: ${SKILL_NAME}\ndescription: `) && /get_overview/.test(md) && /run_checks/.test(md) && /Never estimate/.test(md) && /Never place, change or cancel an order/.test(md) && /Never advise/.test(md) && !/HCMP|Hamza/.test(md));
  const zip = storedZip([{ path: "invariant/SKILL.md", text: md }]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const nameLen = view.getUint16(26, true);
  const size = view.getUint32(18, true);
  const body = zip.slice(30 + nameLen, 30 + nameLen + size);
  check("skill: the zip holds the SKILL.md in its folder, stored whole, with its CRC", view.getUint32(0, true) === 0x04034b50 && new TextDecoder().decode(zip.slice(30, 30 + nameLen)) === "invariant/SKILL.md" && new TextDecoder().decode(body) === md && view.getUint32(14, true) === crc32(new TextEncoder().encode(md)) && view.getUint32(zip.length - 22, true) === 0x06054b50 && crc32(new TextEncoder().encode("123456789")) === 0xcbf43926);
  check("skill: Setup's connector card offers the skill and the schema", /href="\/api\/skill"/.test(readFileSync("components/setup/input-cards.tsx", "utf8")) && /href="\/api\/methodology\/schema"/.test(readFileSync("components/setup/input-cards.tsx", "utf8")));
}

run().then(researchServer).then(() => {
  openRulesAndSkill();
  if (failures.length) {
    console.error(`check:mcp FAILED (${passed} passed, ${failures.length} failed)\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`check:mcp ok (${passed} passed): a person's own Claude signs in with their own account and allows a read, codes go only to Claude or this machine, PKCE and the allowlist hold at every step, the protocol answers as Streamable HTTP asks, and every tool is read-only but those that lay something on the person's own vault for them to review (newsletter senders, a thesis proposal, a decision, a rating, a study, price-check verdicts), computed by the app and cites its rule; the public research server reads the SEC and FINRA alone, with no sign-in.`);
});

/** The beta's write-back (Hamza, 9 Nov 2026): what the person's own Claude sends back, each kept for the person, never decided for them. */
async function writeBackChecks() {
  const problem = (e: unknown) => `problem: ${e instanceof Error ? e.message : "unknown"}`;
  const callOn = async (src: McpSource, name: string, args: unknown) => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name, arguments: args } }, async () => src, problem);
    const res = r.status === 200 && !Array.isArray(r.body) ? (r.body.result as { content: { text: string }[]; isError?: boolean }) : null;
    return { text: res?.content[0].text ?? "", isError: !!res?.isError };
  };
  const now = new Date("2026-11-09T10:00:00.000Z");
  const theses = source().theses!;

  // write_thesis: a proposal, not a write.
  const pendingSrc: McpSource = { ...source(), demo: false, writeThesis: async () => ({ pending: true, subject: "MA", parts: ["The thesis", "Pillars"], isNew: false, replaced: true }) };
  const pr = await callOn(pendingSrc, "write_thesis", { kind: "stock", symbol: "MA", text: "A new thesis." });
  check("write-back: a thesis write that replaces the person's words is a proposal on the Theses screen, nothing changed yet, a newer one replacing the older", !pr.isError && pr.text.includes("Proposed to the MA thesis: The thesis, Pillars.") && pr.text.includes("Nothing has changed yet") && pr.text.includes("replaces the proposal"), pr.text);
  const evidence: ThesisWrite = { kind: "stock", symbol: "MA", evidence: { source: "Q3 call", kind: "note", summary: "Held.", changes: null, date: "2026-11-08" } };
  const textWrite: ThesisWrite = { kind: "stock", symbol: "ma", text: "Rewritten by Claude.", pathway: "A new pathway.", evidence: { source: "Q3 call", kind: "note", summary: "Held.", changes: null, date: "2026-11-08" } };
  check("write-back: an evidence entry alone is applied at once; any other part waits", evidenceOnly(evidence) && !evidenceOnly(textWrite) && partsOf(textWrite).join() === "text,pathway,evidence");
  const one = withPendingWrite(null, theses, textWrite, now);
  const two = withPendingWrite(one.file, theses, { ...textWrite, text: "Again." }, new Date("2026-11-09T11:00:00.000Z"));
  check("write-back: one pending write per thesis, the newer replacing the older, keyed by subject", one.entry.key === "stock:MA" && two.file.pending.length === 1 && two.file.pending[0].write.text === "Again." && claudeWriteHref(two.entry) === "/theses/MA" && !one.entry.isNew);
  const views = partViews(theses, one.entry);
  check("write-back: the card shows the thesis's words before and after, and a line for an evidence entry", views[0].part === "text" && views[0].before === theses.bySymbol.MA.text && views[0].after === "Rewritten by Claude." && views.find((v) => v.part === "evidence")?.line === "Q3 call: Held.");
  const kept = chosenWrite(one.entry, new Set(["text", "evidence"]), { text: "My own words." });
  check("write-back: only the ticked parts are kept, the text as amended, the symbol as Claude named it", kept?.kind === "stock" && kept.text === "My own words." && kept.pathway === undefined && kept.evidence?.source === "Q3 call" && kept.symbol === "ma");
  check("write-back: nothing ticked is nothing to write, and a kept or dismissed write leaves the list", chosenWrite(one.entry, new Set()) === null && withoutPendingWrite(one.file, one.entry.id, now.toISOString()).pending.length === 0);
  const amendedPath = chosenWrite(one.entry, new Set(["pathway"]), { pathway: null });
  check("write-back: an amended pathway left empty clears it", amendedPath?.kind === "stock" && amendedPath.pathway === null);

  // record_decision.
  const filed: Decision[] = [];
  const decisionSrc: McpSource = { ...source(), demo: false, recordDecision: async (w) => { const d = decisionFromWrite(EMPTY_DECISIONS, w, "2026-11-09", now.toISOString()); filed.push(d); return d; } };
  const dr = await callOn(decisionSrc, "record_decision", { kind: "trade", symbol: "ma", title: "Trimmed MA to its cap", text: "Over its 10% cap after the results." });
  check("write-back: a decision is filed today, marked as written by Claude, with no action and the symbol upper-cased", !dr.isError && filed[0]?.via === "claude" && filed[0].date === "2026-11-09" && filed[0].symbol === "MA" && filed[0].action === null && dr.text.includes("Decision Log"), dr.text);
  let future = false;
  try {
    decisionFromWrite(EMPTY_DECISIONS, { kind: "note", title: "Later", text: "x", date: "2026-11-10" }, "2026-11-09", now.toISOString());
  } catch (e) {
    future = e instanceof DecisionWriteProblem && e.message.includes("2026-11-10");
  }
  check("write-back: a decision dated after today is refused, since the log keeps what was decided", future);
  check("write-back: the demo files nothing, and says so", (await callOn(source(), "record_decision", { kind: "note", title: "x", text: "y" })).isError);

  // get_findings and rate_finding.
  const cache = { version: 1, companies: { MA: { symbol: "MA", findings: [{ id: "f1", symbol: "MA", day: "2026-11-08", headline: "Volumes held", lines: "Cross-border volume grew.", stance: "supports", bearsOn: null, sources: [{ source: "Reuters" }] }], earlier: [] } } } as unknown as McpSource["researchCache"];
  const ratings: unknown[] = [];
  const rateSrc: McpSource = { ...source(), demo: false, researchCache: cache, rateFinding: async (r) => void ratings.push(r) };
  const fr = await callOn(rateSrc, "get_findings", {});
  check("write-back: the agents' findings are listed with their agent and id to rate", !fr.isError && fr.text.includes("[company_news f1] MA, 2026-11-08: Volumes held.") && fr.text.includes("Not rated."), fr.text);
  const rr = await callOn(rateSrc, "rate_finding", { agent: "company_news", id: "f1", verdict: "not_useful", reasons: ["old"] });
  check("write-back: a rating is kept on the finding the app holds, with its subject and title from the app", !rr.isError && ratings.length === 1 && (ratings[0] as { subject: string; title: string }).subject === "MA" && (ratings[0] as { title: string }).title === "Volumes held", rr.text);
  check("write-back: a finding the app does not hold cannot be rated", (await callOn(rateSrc, "rate_finding", { agent: "company_news", id: "nope", verdict: "useful" })).isError && ratings.length === 1);

  // write_study's check: a figure must be printed in the brief or worked out from figures that are.
  const brief = "Revenue 134,360m. Cost of revenue 7,354m. Margin 38.2%.";
  check("write-back: a study's figure printed in the brief is kept; one worked out on its line from printed figures too; any other is named", unprintedFigures("Revenue was 134,360m at a 38.2% margin.", brief).length === 0 && unprintedFigures("Gross profit 127,006m = 134,360m less 7,354m.", brief).length === 0 && unprintedFigures("Revenue will reach 150,000m.", brief).join() === "150000");
  const done = JSON.parse(readFileSync("data/samples/showcase.studies.json", "utf8")).studies[0];
  const study = studySchema.parse({ ...done, status: "running", pending: ["core-business", "growth"] });
  const sc = checkSections(study, brief, [{ id: "core-business", markdown: "Revenue was 134,360m." }, { id: "growth", markdown: "It grew 99% a year." }, { id: "nope", markdown: "x" }]);
  check("write-back: sections are kept one by one; a section with an unprinted figure is sent back with it; one not pending is named", Object.keys(sc.kept).join() === "core-business" && sc.refused[0]?.id === "growth" && sc.refused[0].figures.join() === "99" && sc.unknown.join() === "nope");
  check("write-back: only studies with sections still to write are offered, a stopped one too", writableStudies([study, done, { ...study, status: "failed" }]).length === 2);

  // report_price_checks: a verdict on the person's own levels, never a price.
  const rec = { MA: recordFields.parse({ ownValuation: null, since: null, note: null, levels: { below: 480, above: null }, triggers: [{ id: "t1", kind: "kill", field: "price", is: "lte", value: 450, note: "Below the bear case" }] }) };
  const checks = [{ symbol: "ma", level: "below" as const, met: true }, { symbol: "MA", trigger: "t1", met: true }, { symbol: "MA", level: "above" as const, met: true }, { symbol: "ZZZ", level: "below" as const, met: true }];
  check("write-back: a check on a level not set or a symbol not on the records is named, not kept", unknownChecks(rec, checks).join("; ") === "MA: no level above; ZZZ: no record");
  const notices = brokerNotices(rec, new Set(["MA"]), checks, "2026-11-09", now.toISOString());
  check("write-back: a met level or price trigger is an alert in the person's own numbers, never a price, the kill signal as danger", notices.length === 2 && notices[0].key === `${BROKER_PREFIX}MA:below:480` && notices[0].title.includes("480") && notices[1].tone === "danger" && notices[1].key === `${BROKER_PREFIX}MA:trigger:t1` && notices.every((n) => n.href === "/holdings/MA"));
  const first = withBrokerChecks(EMPTY_ALERTS, rec, new Set(["MA"]), checks.slice(0, 2), "2026-11-09", now.toISOString());
  const second = withBrokerChecks(first.file, rec, new Set(["MA"]), [{ symbol: "MA", level: "below", met: false }], "2026-11-09", "2026-11-09T11:00:00.000Z");
  const openKeys = (f: typeof second.file) => f.items.filter((i) => i.clearedAt === null && i.key.startsWith(BROKER_PREFIX)).map((i) => i.key).sort();
  check("write-back: a check fires what is met; a later check clears what it says no longer holds and leaves what it did not look at", first.fired.length === 2 && openKeys(second.file).join() === `${BROKER_PREFIX}MA:trigger:t1` && second.fired.length === 0, JSON.stringify(openKeys(second.file)));
  const priceSrc: McpSource = { ...source(), demo: false, reportChecks: async () => ({ fired: 1, open: 2, unknown: ["ZZZ: no record"] }) };
  const pc = await callOn(priceSrc, "report_price_checks", { checks: [{ symbol: "MA", level: "below", met: true }, { symbol: "ZZZ", level: "below", met: true }] });
  check("write-back: the price checks tool takes verdicts alone and names what it could not keep", !pc.isError && pc.text.includes("1 new alert") && pc.text.includes("ZZZ: no record"), pc.text);
  const listedChecks = toolList().find((t) => t.name === "report_price_checks");
  check("write-back: the price checks tool has no field for a price", !!listedChecks && !JSON.stringify(listedChecks.inputSchema).includes('"price"'));
}
