/**
 * Invariant reads brokers and banks; it never trades. This fails if any
 * source file:
 *
 *   - names an order, alert or trade path of the Interactive Brokers or
 *     SnapTrade APIs;
 *   - writes to a person's vault anywhere but its adapter: Google Drive in
 *     lib/user-drive.ts, OneDrive (Microsoft Graph) in lib/user-onedrive.ts,
 *     an S3-style bucket in lib/user-bucket.ts, with the request signing in
 *     lib/s3-sign.ts alone;
 *   - asks Google or Microsoft for more of a person's drive than the files
 *     the app made (any Drive scope but drive.file; any Graph files scope but
 *     Files.ReadWrite.AppFolder);
 *   - calls a model anywhere but lib/methodology-draft.ts (the Claude API
 *     and any OpenAI-compatible chat completions endpoint), or the analyst's
 *     model client (LangChain's ChatAnthropic and ChatOpenAI) anywhere but
 *     lib/analyst-agent.ts, with the agent loop itself confined to
 *     lib/analyst-graph.ts; the deployment's one model key,
 *     ANTHROPIC_API_KEY, is read in lib/hosted-model.ts alone (no
 *     MODEL_API_KEY or OPENAI_API_KEY anywhere), and every call is metered
 *     per person (lib/model-meter.ts);
 *   - reads SEC EDGAR anywhere but lib/edgar.ts (read-only, the ticker alone
 *     in the URL), or gives the SEC a contact the person did not confirm (an
 *     EDGAR_USER_AGENT setting or a literal address in the User-Agent);
 *   - reads the market feed (FRED, stooq, Yahoo Finance, multpl, the Nasdaq screener, the New York Fed, Freddie Mac, the BLS, Michigan, CNN, the Treasury, the IMF, the BIS, the OECD, FINRA's short interest, Cboe's options quotes, Kalshi, Polymarket, the CFTC, the Treasury's TIC data and the OFR) anywhere but lib/markets-feed.ts
 *     (read-only, the indicator and a date range alone in the URL), or the
 *     index lists that carry GICS sectors anywhere but lib/sectors-feed.ts
 *     (two public pages, nothing of the person in the request);
 *   - reads podscripts.co anywhere but lib/podcast-feed.ts (a show's page and
 *     an episode's page, the show's and the episode's names alone in the URL);
 *   - calls the IBKR Flex Web Service anywhere but lib/ibkr-flex.ts (reports
 *     only, on the person's own token), or names their Flex connection in a log;
 *   - logs or echoes a person's model key (anthropicKey or a provider's
 *     apiKey never reaches a log line, a response or a client component);
 *   - sends mail anywhere but lib/report-mail.ts, the one path, which sends
 *     a person's own report to their own sign-in address;
 *   - reads the statements inbox (IMAP) anywhere but lib/inbox-mail.ts, or
 *     changes it at all: opened read-only, never a flag, move or delete;
 *   - reads an address a person gave (Add data) anywhere but
 *     lib/custom-data-run.ts, or there by anything but one GET through a
 *     lookup that refuses private addresses, with redirects never followed;
 *     or names the address or the key in a log line;
 *   - logs a password, a sign-up code, an address or a token on the sign-in,
 *     sign-up, accounts or Drive-link paths (lib/users.ts, app/sign-in,
 *     app/sign-up, app/api/vault, lib/drive-link.ts);
 *   - lets the MCP server a person adds to their own Claude (lib/mcp*.ts,
 *     app/api/mcp, app/mcp, app/.well-known) write, file, send or call a
 *     model, list a tool as anything but read-only, or log a token, a grant
 *     or an address.
 *
 * Run: npm run check:guard
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components", "lib"];
const ORDERS = [
  /create_order|place_?order|order_instruction|\/iserver\/account\/[^"'`]*\/orders?/i,
  /create_alert|\/iserver\/account\/[^"'`]*\/alert/i,
  /\/trade\/(place|impact)|\/orders?\/(place|cancel|replace)|placeOrder|placeForceOrder|cancelOrder|replaceOrder|trading\/place|\/trade\/[^"'`]*impact/i,
  // eToro's order and position paths, and SnapTrade's trading and connection-changing ones.
  /trading\/execution|\/positions\/close|\/orders\/[^"'`]*cancel|\/trade\/(?!s\b)|\/authorizations\/[^"'`]*\/(refresh|disable)|connectionType:\s*["'`]trade/i,
  /documents\.batchUpdate|spreadsheets\.values\.(update|append)|gmail\/v1\/users\/[^"'`]*\/(send|messages\/send)/i,
];
const ONLY_IN: { pattern: RegExp; file: string; what: string; also?: string[] }[] = [
  { pattern: /upload\/drive\/v3|googleapis\.com\/drive\/v3\/files/, file: "lib/user-drive.ts", what: "Drive file calls" },
  { pattern: /graph\.microsoft\.com|\/special\/approot/, file: "lib/user-onedrive.ts", what: "Microsoft Graph file calls" },
  { pattern: /AWS4-HMAC-SHA256|aws4_request/, file: "lib/s3-sign.ts", what: "S3 request signing" },
  { pattern: /x-amz-copy-source|list-type=2|from\s+["']@\/lib\/s3-sign["']/, file: "lib/user-bucket.ts", what: "bucket calls" },
  // lib/model-provider.ts is pure: it builds the endpoint's address and translates the request, and never fetches.
  { pattern: /api\.anthropic\.com|chat\/completions|completionsUrl\(/, file: "lib/methodology-draft.ts", what: "model calls", also: ["lib/model-provider.ts", "lib/model-catalog.ts"] }, // model-catalog lists the models on the key (GET /v1/models), never a call
  { pattern: /@langchain\/anthropic|ChatAnthropic|@langchain\/openai|ChatOpenAI/, file: "lib/analyst-agent.ts", what: "the analyst's model client" },
  { pattern: /from\s+["']langchain["']|@langchain\/core|@langchain\/langgraph|createAgent\(/, file: "lib/analyst-graph.ts", what: "the LangChain agent loop" },
  { pattern: /data\.sec\.gov|sec\.gov\/files|sec\.gov\/Archives/, file: "lib/edgar.ts", what: "SEC EDGAR calls", also: ["lib/licences.ts"] },
  { pattern: /stooq\.com|stlouisfed\.org|finance\.yahoo\.com|multpl\.com|api\.nasdaq\.com|newyorkfed\.org|freddiemac\.com|api\.bls\.gov|sca\.isr\.umich\.edu|dataviz\.cnn\.io|fiscaldata\.treasury\.gov|datamapper\/api|stats\.bis\.org|sdmx\.oecd\.org|publicreporting\.cftc\.gov|ticdata\.treasury\.gov|financialresearch\.gov/, file: "lib/markets-feed.ts", what: "market feed calls", also: ["lib/licences.ts", "lib/flows.ts"] },
  { pattern: /wikipedia\.org/, file: "lib/sectors-feed.ts", what: "index list (GICS sector) calls", also: ["lib/licences.ts"] },
  // FINRA's short interest files, Cboe's delayed options quotes, Kalshi's and Polymarket's public prices: read in lib/markets-feed.ts alone; the pure modules build the addresses and parse, and never fetch.
  { pattern: /cdn\.finra\.org|cboe\.com\/api|api\.elections\.kalshi\.com|gamma-api\.polymarket\.com/, file: "lib/markets-feed.ts", what: "short interest, options and prediction-market calls", also: ["lib/licences.ts", "lib/short-interest.ts", "lib/expected-move.ts", "lib/odds.ts", "lib/event-odds.ts"] },
  // lib/podcasts.ts is pure: it builds the show's and the episode's addresses and parses the pages, and never fetches.
  { pattern: /https?:\/\/(?:www\.)?podscripts\.co/, file: "lib/podcast-feed.ts", what: "podscripts.co calls", also: ["lib/licences.ts", "lib/podcasts.ts"] },
  { pattern: /from\s+["']@\/lib\/podcast-feed["']/, file: "lib/podcasts-run.ts", what: "the podcast feed", also: ["app/(app)/setup/podcast-actions.ts"] },
  { pattern: /interactivebrokers\.com|FlexWebService/, file: "lib/ibkr-flex.ts", what: "IBKR Flex Web Service calls" },
  { pattern: /api\.snaptrade\.com/, file: "lib/snaptrade-api.ts", what: "SnapTrade calls" },
  { pattern: /public-api\.etoro\.com/, file: "lib/etoro-api.ts", what: "eToro calls" },
  // smtp.mailfrom is a field of a received email's Authentication-Results line, which lib/inbox.ts reads; it sends nothing.
  { pattern: /from\s+["']nodemailer["']|require\(["']nodemailer["']\)|sendMail\(|smtp\.(?!mailfrom)/i, file: "lib/report-mail.ts", what: "mail calls" },
  { pattern: /from\s+["']web-push["']|require\(["']web-push["']\)|\bsendNotification\(|\bsetVapidDetails\(/, file: "lib/push-send.ts", what: "push notifications to a person's devices" },
  { pattern: /from\s+["']node:https?["']|from\s+["']node:dns(\/promises)?["']|https\.(get|request)\(/, file: "lib/custom-data-run.ts", what: "reads of an address a person gave" },
  { pattern: /from\s+["']imapflow["']|from\s+["']mailparser["']|new ImapFlow\(|simpleParser\(/, file: "lib/inbox-mail.ts", what: "statements inbox (IMAP) calls" },
  // The self-fix pull requests (Hamza, 4 Nov 2026: "you merge"): GitHub is called from lib/github-ops.ts alone, on the operator's token, and only /ops uses it.
  { pattern: /api\.github\.com|OPS_GITHUB_TOKEN/, file: "lib/github-ops.ts", what: "GitHub calls (the self-fix pull requests on /ops)" },
  { pattern: /from\s+["']@\/lib\/github-ops["']/, file: "app/ops/page.tsx", what: "the self-fix pull requests", also: ["app/ops/actions.ts"] },
  // The database's usage (Hamza, 25 Nov 2026): Neon's API is called from lib/neon-usage.ts alone, a read of the project, for /ops and the daily log line.
  { pattern: /console\.neon\.tech|process\.env\.NEON_API_KEY/, file: "lib/neon-usage.ts", what: "Neon API calls (the database's usage)" },
  { pattern: /from\s+["']@\/lib\/neon-usage["']/, file: "app/ops/page.tsx", what: "the database's usage", also: ["app/api/cron/screener/route.ts"] },
];
const WIDE_DRIVE_SCOPE = /auth\/drive(?![.\w]*file\b)(\.readonly|\.metadata|\.appdata|\.scripts|["'`\s])/;
const WIDE_GRAPH_SCOPE = /Files\.Read(?:Write)?(?:\.All)?(?![.\w]*AppFolder)(?=["'`\s])|Files\.ReadWrite\.All|Sites\.(?:Read|ReadWrite|Manage|FullControl)/;
const EDGAR_OPERATOR_CONTACT = /EDGAR_USER_AGENT|["'`]user-agent["'`]\s*:\s*["'`][^"'`]*@/i;
const KEY_LEAK = /console\.\w+\([^)]*(anthropicKey|apiKey|ibkrFlex|consumerKey|userKey|clientId|redirectURI|conn\b)|(anthropicKey|\.apiKey|consumerKey|userKey)[^;\n]*(logDetail|NextResponse|revalidate)/;
// The statements inbox is read and never changed: no flag, move, copy, delete, append or expunge, and the mailbox is opened read-only.
const INBOX_WRITE = /\.(messageFlagsAdd|messageFlagsSet|messageFlagsRemove|messageMove|messageCopy|messageDelete|append|mailboxCreate|mailboxDelete|mailboxRename|expunge|setFlagColor)\(/;
const DEPLOYMENT_KEY = /process\.env\.(ANTHROPIC_API_KEY|MODEL_API_KEY|OPENAI_API_KEY)/;
// The MCP server only reads: no vault write, no Decision Log or alert change, no mail, no model.
const MCP_WRITERS = ["write_thesis", "propose_newsletter_senders", "record_decision", "rate_finding", "get_studies_to_write", "write_study", "report_price_checks"];
const MCP_FILE = /^(lib\/mcp[\w-]*\.ts|app\/api\/mcp\/|app\/mcp\/|app\/\.well-known\/)/;
const MCP_WRITE = /\.(writeJson|saveDocument|removeFile)\(|\bsave[A-Z]\w*\(|\b(sendReport|sendAlerts|callModel|askAnalyst|runAnalyst|withDecision|withoutDecision|markEmailed|dismiss)\(|from\s+["']@\/lib\/(report-mail|methodology-draft|analyst-agent|user-drive|user-onedrive|user-bucket)["']/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const hits: string[] = [];
for (const file of ROOTS.flatMap(walk)) {
  const text = readFileSync(file, "utf8");
  for (const pattern of ORDERS) {
    const m = text.match(pattern);
    if (m) hits.push(`${file}: ${m[0]}`);
  }
  for (const rule of ONLY_IN) {
    const m = text.match(rule.pattern);
    if (m && file !== rule.file && !(rule.also ?? []).includes(file)) hits.push(`${file}: ${m[0]} (${rule.what} belong in ${rule.file} only)`);
  }
  const wide = text.match(WIDE_DRIVE_SCOPE);
  if (wide) hits.push(`${file}: ${wide[0].trim()} (only the drive.file scope is allowed)`);
  const wideGraph = text.match(WIDE_GRAPH_SCOPE);
  if (wideGraph) hits.push(`${file}: ${wideGraph[0].trim()} (only the Files.ReadWrite.AppFolder scope is allowed)`);
  const edgarContact = text.match(EDGAR_OPERATOR_CONTACT);
  if (edgarContact) hits.push(`${file}: ${edgarContact[0]} (the SEC sees only the contact the person confirmed)`);
  const leak = text.match(KEY_LEAK);
  if (leak) hits.push(`${file}: ${leak[0]} (a person's key never reaches a log or a response)`);
  if (/anthropicKey|\.apiKey/.test(text) && /^"use client"/.test(text)) hits.push(`${file}: a model key named in a client component`);
  // The licence list names hosts and asks nothing (Hamza, 9 Nov 2026: lawful sources only); every feed asks it before it fetches.
  if (file === path.join("lib", "licences.ts") && /\bfetch\(|import\s+["']server-only/.test(text)) hits.push(`${file}: the licence list fetches nothing and imports nothing server-only`);
  if ((file === path.join("lib", "podcast-feed.ts") || file === path.join("lib", "sectors-feed.ts")) && /\bfetch\(/.test(text) && !/feedShut\(/.test(text)) hits.push(`${file}: a feed that fetches must ask feedShut first`);
  const inboxWrite = text.match(INBOX_WRITE);
  if (inboxWrite && /imapflow|ImapFlow|InboxSession/.test(text)) hits.push(`${file}: ${inboxWrite[0]} (the statements inbox is only read)`);
  if (file === path.join("lib", "inbox-mail.ts") && !/mailboxOpen\([^)]*readOnly:\s*true/.test(text)) hits.push(`${file}: the inbox must be opened read-only`);
  if (/console\.\w+\([^)]*(INBOX_PASSWORD|cfg\.password|\.address)/.test(text)) hits.push(`${file}: the inbox address or password in a log line`);
  if (file === path.join("lib", "custom-data-run.ts")) {
    if (!/checkAddress\(/.test(text) || !/lookup:\s*publicLookup/.test(text) || !/isPrivateIp\(/.test(text)) hits.push(`${file}: an address a person gave must be checked and resolved to public addresses only`);
    if (/method:\s*["'`](?!GET)|https\.request\(|\bfetch\(/.test(text)) hits.push(`${file}: an address a person gave is only read, with one GET`);
    if (/console\.\w+\([^)]*\b(url|key|src|keyName|source)\b/.test(text)) hits.push(`${file}: an address or a key in a log line`);
  }
  // SnapTrade connects a broker read-only and is otherwise only read; eToro is only read.
  if (file === path.join("lib", "snaptrade-api.ts")) {
    if (!/connectionType:\s*"read"/.test(text)) hits.push(`${file}: SnapTrade's connection page must be asked for read access`);
    const paths = [...text.matchAll(/call\(conn, "(GET|POST)", `?"?([^"`,]+)/g)].map((m) => `${m[1]} ${m[2]}`);
    for (const p of paths) if (!/^GET \/accounts(\/\$\{encodeURIComponent\(a\.id\)\}\/(positions\/all|balances))?$|^POST \/snapTrade\/login$/.test(p)) hits.push(`${file}: ${p} (SnapTrade is asked only for accounts, positions, balances and the read-only connection page)`);
  }
  if (file === path.join("lib", "etoro-api.ts") && /method:\s*["'`](?!GET)/.test(text)) hits.push(`${file}: eToro is only read, with GET`);
  const rel = file.split(path.sep).join("/");
  if (MCP_FILE.test(rel)) {
    // The beta's write-back (Hamza, 9 Nov 2026): lib/mcp-run.ts also files a Decision Log entry, keeps a rating and the broker's verdicts on the person's own levels, each once, in their own vault.
    const OWN_WRITES = [/vault\.writeJson\("decisions", /, /vault\.writeJson\("agent_feedback", /, /vault\.writeJson\("alerts", /, /withDecision\(file, entry, now\)/];
    const allowedHere = rel === "lib/mcp-run.ts" ? OWN_WRITES.reduce((t, re) => t.replace(re, ""), text) : text;
    if (rel === "lib/mcp-run.ts" && !OWN_WRITES.every((re) => (text.match(new RegExp(re.source, "g")) ?? []).length === 1)) hits.push(`${file}: the connector's own writes (a decision, a rating, the broker's verdicts) are each made once`);
    const w = allowedHere.match(MCP_WRITE);
    if (w) hits.push(`${file}: ${w[0]} (the MCP server only reads)`);
    // The writes, all to the person's own vault for them to review: lib/mcp-run.ts hands the tools proposeNewsletterSenders (proposals on Newsletters), proposeThesisWriteInto (a proposal on Theses) and a study's sections (studiesToWrite, writeStudySectionsInto) alone.
    const fromInboxRun = text.match(/import \{([^}]*)\} from ["']@\/lib\/inbox-run["']/);
    if (fromInboxRun && (rel !== "lib/mcp-run.ts" || fromInboxRun[1].trim() !== "proposeNewsletterSenders")) hits.push(`${file}: imports ${fromInboxRun[1].trim()} from lib/inbox-run (the MCP server's writes are proposeNewsletterSenders and proposeThesisWriteInto, in lib/mcp-run.ts)`);
    const fromThesesRun = text.match(/import \{([^}]*)\} from ["']@\/lib\/theses-run["']/);
    if (fromThesesRun && (rel !== "lib/mcp-run.ts" || fromThesesRun[1].trim() !== "proposeThesisWriteInto")) hits.push(`${file}: imports ${fromThesesRun[1].trim()} from lib/theses-run (write_thesis proposes, through proposeThesisWriteInto in lib/mcp-run.ts)`);
    const fromStudyRun = text.match(/import \{([^}]*)\} from ["']@\/lib\/study-run["']/);
    if (fromStudyRun && (rel !== "lib/mcp-run.ts" || fromStudyRun[1].trim() !== "studiesToWrite, writeStudySectionsInto, type StudyContext")) hits.push(`${file}: imports ${fromStudyRun[1].trim()} from lib/study-run (a study's sections only, in lib/mcp-run.ts)`);
    // A connector call carries no sign-in: the person's files are read from the grant's vault (vaultForMcp), never the session's (openVault, or a workspace reader that opens it, such as thesesFor outside the demo branch) (Hamza, 19 Oct 2026: get_theses read nothing of what write_thesis had kept).
    if (rel === "lib/mcp-run.ts" && (/\bopenVault\b/.test(text) || (text.match(/\bthesesFor\(/g) ?? []).length !== 1 || !/storageMode\(\) === "demo"[\s\S]{0,200}thesesFor\(/.test(text))) hits.push(`${file}: an MCP call reads the grant's vault (vaultForMcp), never the session's (openVault or thesesFor outside the demo branch)`);
    if (rel === "lib/mcp-tools.ts" && ((text.match(/writes: true/g) ?? []).length !== MCP_WRITERS.length || !MCP_WRITERS.every((n) => new RegExp(`name: "${n}"[\\s\\S]{0,2400}writes: true`).test(text)))) hits.push(`${file}: exactly these tools write, to the person's own vault: ${MCP_WRITERS.join(", ")}`);
    if (/console\.\w+\([^)]*\b(token|refresh|grant|authorization|header|email|code)\b/i.test(text)) hits.push(`${file}: a token, a grant or an address in a log line`);
    // The public research server (Hamza, 23 Oct 2026): no sign-in, so it opens no vault, calls no model, writes nothing and reads SEC EDGAR and FINRA alone, never a price feed.
    if (/^(lib\/mcp-research[\w-]*\.ts|app\/api\/mcp\/research\/)/.test(rel)) {
      const opens = text.match(/from\s+["']@\/lib\/(vault|workspace|registry|user-drive|methodology-draft|analyst-agent|model-provider|theses-run|inbox-run|catch-up|auth)["']/);
      if (opens) hits.push(`${file}: ${opens[0]} (the public research server opens no vault and calls no model)`);
      const run = text.match(/import \{([^}]*)\} from ["']@\/lib\/mcp-run["']/);
      if (run && run[1].trim() !== "originOf") hits.push(`${file}: imports ${run[1].trim()} from lib/mcp-run (the public research server takes originOf alone)`);
      const feed = text.match(/import \{([^}]*)\} from ["']@\/lib\/markets-feed["']/);
      if (feed && feed[1].trim() !== "loadShortInterest") hits.push(`${file}: imports ${feed[1].trim()} from lib/markets-feed (the public research server reads FINRA's short interest alone, never a price)`);
      if (/writes: true|\bloadCloses\b|\bloadLive\b|\blistingRate\b|\bpublicCompanyEntry\b/.test(text)) hits.push(`${file}: a write or a price read on the public research server`);
    }
  }
  // Prices while the market is open: public prices in, the page's own book laid on them; nothing kept, read from the vault or logged.
  if (/^(lib\/live\.ts|components\/live\/|app\/api\/live\/)/.test(rel)) {
    const w = text.match(MCP_WRITE) ?? text.match(/from\s+["']@\/lib\/(vault|workspace|registry)["']/);
    if (w) hits.push(`${file}: ${w[0]} (live prices only read public prices and keep nothing)`);
    if (/console\.\w+\(/.test(text)) hits.push(`${file}: a log line (a holding's symbol never reaches a log)`);
  }
  // Accounts, sign-in, sign-up and the Drive link: a password, a code, an address or a token never reaches a log line.
  if (/^(lib\/users\.ts|lib\/drive-link\.ts|app\/sign-(in|up)\/|app\/api\/vault\/)/.test(rel) && /console\.\w+\([^)]*\b(password|code|email|refresh|token|nonce|state)\b/i.test(text)) hits.push(`${file}: a password, a code, an address or a token in a log line`);
  if (rel === "lib/mcp.ts" && (!/readOnlyHint: !t\.writes/.test(text) || /readOnlyHint: (true|false)|destructiveHint: true/.test(text))) hits.push(`${file}: every MCP tool is listed read-only but the one that writes, and none destructive`);
  const deploymentKey = text.match(DEPLOYMENT_KEY);
  if (deploymentKey && !(rel === "lib/hosted-model.ts" && deploymentKey[1] === "ANTHROPIC_API_KEY")) hits.push(`${file}: ${deploymentKey[0]} (the deployment's model key is read in lib/hosted-model.ts alone)`);
  if (rel === "lib/hosted-model.ts" && /console\.\w+\(/.test(text)) hits.push(`${file}: a log line (the model key never reaches a log)`);
  // GitHub on /ops: the token never reaches a log, a response or a page; merge and close only for an operator, each confirmed.
  if (rel === "lib/github-ops.ts" && (/console\.\w+\(|logEvent\(/.test(text) || !/merge_method: "squash", sha/.test(text) || /method: "DELETE"/.test(text))) hits.push(`${file}: GitHub is asked for the self-fix pull requests, a squash merge at the head shown and a close alone, with nothing logged`);
  if (rel === "app/ops/actions.ts" && ((text.match(/await isOperator\(\)/g) ?? []).length !== (text.match(/export async function/g) ?? []).length || (text.match(/form\.get\("confirm"\) !== "yes"/g) ?? []).length !== 2 || /\btoken\b[^;\n]*(logEvent|console)|(logEvent|console)[^;\n]*\btoken\b/.test(text))) hits.push(`${file}: merge and close each check the operator and the confirm box, and never log the token`);
  // What the app learns from everyone: a signal is never a figure, a finding or an address; the votes go under the keyed fingerprint alone.
  if (rel === "lib/improvements-run.ts" && (!/meterKey\(email\)/.test(text) || /\$\{email\}/.test(text) || /console\.\w+\([^)]*\b(email|who|words)\b/.test(text))) hits.push(`${file}: improvement votes are kept under the keyed fingerprint, never the address, and nothing of a signal is logged`);
}
if (hits.length) {
  console.error("Invariant must stay read-only outside the person's own folder:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("guard ok: no order or alert paths; vault writes only in their adapters (Drive, OneDrive, bucket); drive.file and AppFolder scopes only; model calls only in the drafter and, through LangChain, in the analyst, on the deployment's one key read in lib/hosted-model.ts alone and metered per person; EDGAR only in lib/edgar.ts and only with the person's confirmed contact; the market feed only in lib/markets-feed.ts and the GICS lists only in lib/sectors-feed.ts; podcast transcripts only in lib/podcast-feed.ts; the IBKR Flex Web Service only in lib/ibkr-flex.ts, with the person's own token; SnapTrade only in lib/snaptrade-api.ts (accounts, positions, balances, a read-only connection page) and eToro only in lib/etoro-api.ts (GET), each on the person's own key; no key in a log; mail only in lib/report-mail.ts; notifications to a person's own devices only in lib/push-send.ts; the statements inbox only in lib/inbox-mail.ts, read-only; a person's own data addresses only in lib/custom-data-run.ts, public and read-only; the MCP server for a person's own Claude only reads but for the tools that write to the person's own vault for them to review (a newsletter proposal, a thesis proposal, a Decision Log entry, a rating, a study's sections, the broker's verdicts on their own levels, never a price), every other tool listed read-only, no token in a log; no password, code, address or token in a log on the sign-in, sign-up, accounts or Drive-link paths; live prices only read public prices, keep nothing and log nothing; the public research server opens no vault, calls no model and reads the SEC and FINRA alone; GitHub only in lib/github-ops.ts for /ops, merge and close confirmed and for operators alone; improvement votes only under the keyed fingerprint");
