import "server-only";

import { allowedEmails } from "@/lib/auth";
import { factsText } from "@/lib/edgar-facts";
import { accessGrant, mcpKey, type Grant } from "@/lib/mcp-auth";
import type { McpSource } from "@/lib/mcp-tools";
import type { EdgarContact } from "@/lib/preferences";
import { reportsFileSchema, type ReportsFile } from "@/lib/report";
import { demoIsPublic, storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { vaultForMcp, type Vault } from "@/lib/vault";
import { proposeNewsletterSenders } from "@/lib/inbox-run";
import { proposeThesisWriteInto } from "@/lib/theses-run";
import { studiesToWrite, writeStudySectionsInto, type StudyContext } from "@/lib/study-run";
import { decisionFromWrite, decisionsFileSchema, DecisionWriteProblem, withDecision } from "@/lib/decisions";
import { alertsFileSchema, unknownChecks, withBrokerChecks } from "@/lib/alerts";
import { agentFeedbackSchema, EMPTY_FEEDBACK, withRating } from "@/lib/agents";
import { researchCacheSchema, type ResearchCache } from "@/lib/research-agent";
import { thesisHunterFileSchema, type ThesisHunterFile } from "@/lib/thesis-hunter";
import type { AgentFeedback } from "@/lib/agents";
import { EMPTY_THESES, thesesFileSchema, type ThesesFile } from "@/lib/theses";
import { earningsFor, newslettersAddress, showcaseWorkspace, thesesFor, vaultWorkspace, type Workspace } from "@/lib/workspace";
import { EMPTY_EARNINGS, earningsFileSchema, earningsSubjects, entriesFor, type EarningsEntry, type EarningsFile } from "@/lib/earnings";
import { loadEarnings } from "@/lib/markets-feed";

/**
 * The MCP server's way in to one person's data: the bearer token their own
 * Claude carries, opened with the deployment's key, checked against the
 * allowlist on every call, and the vault behind that sign-in read as the
 * screens read it. The demo serves the anonymized showcase with no sign-in,
 * and reads no Drive and calls no model.
 *
 * Nothing here writes but the tools that lay something on the person's own
 * vault for them to review (newsletter senders, a thesis proposal, a
 * Decision Log entry, a rating, a study's sections, the broker's verdicts on
 * their own levels), and nothing logs a token or anything of the person: a
 * failure is a sentence for the model to relay, and the log gets the
 * scrubbed detail only.
 */

/** The sealing key, or null when the deployment has no AUTH_SECRET, in which case sign-in is closed. */
export const serverKey = () => mcpKey(process.env.AUTH_SECRET);

export const isAllowed = (email: string) => allowedEmails().includes(email.trim().toLowerCase());

/**
 * Whether the address may connect its Claude now: on the allowlist, or an
 * account made here (Hamza, 9 Nov 2026: the beta's people use the connector
 * too). Read on every token and every call, so a deleted account loses it at
 * once; false, never a throw, when the store cannot be read.
 */
export async function mayConnect(email: string): Promise<boolean> {
  if (isAllowed(email)) return true;
  const { isMember, usersAvailable } = await import("@/lib/users");
  return usersAvailable() && (await isMember(email.trim().toLowerCase()));
}

/**
 * Runs a sealed-token check whose allow test must answer at once: first to
 * learn the address inside, then again with that address's answer.
 */
export async function withAccess<T>(check: (allowed: (email: string) => boolean) => T): Promise<T> {
  let inside: string | null = null;
  check((email) => {
    inside = email;
    return false;
  });
  const ok = inside !== null && (await mayConnect(inside));
  return check((email) => ok && email === inside);
}

/** The public demo's server needs no sign-in: it serves the anonymized showcase only. */
export const mcpOpen = () => demoIsPublic();

/** The app's own address as the request reached it, for the metadata, the resource and the redirects. */
export function originOf(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/** The grant behind a call's bearer token, or null. */
export async function grantOf(authorization: string | null, resource: string): Promise<Grant | null> {
  const key = serverKey();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  return withAccess((allowed) => accessGrant(key, authorization, resource, allowed, now));
}

function edgarFor(contact: EdgarContact | null): (ticker: string) => Promise<string> {
  return async (ticker) => {
    const { lookupCompany, companyFacts, NO_CONTACT } = await import("@/lib/edgar");
    if (!contact) return NO_CONTACT;
    const found = await lookupCompany(ticker, contact);
    if (!found) return `SEC EDGAR lists no company under ${ticker}, by ticker or by name; a foreign listing or a fund has no filings there.`;
    return `${found.title} (${found.ticker})\n${factsText(await companyFacts(found.cik, contact))}`;
  };
}

/** What the agents kept, read from the grant's vault (or the showcase's), each null when it cannot be read. */
type AgentFiles = { researchCache: ResearchCache | null; hunter: ThesisHunterFile | null; feedback: AgentFeedback | null };

function studyContextOf(ws: Workspace): StudyContext | null {
  const m = ws.baseSetup?.methodology;
  return m && ws.baseSetup ? { m, contact: ws.preferences.edgarContact ?? null, book: ws.fullBook, baseCurrency: ws.baseSetup.baseCurrency } : null;
}

function sourceOf(ws: Workspace, reports: ReportsFile | null, vault: Vault | null, theses: ThesesFile | null, earnings: EarningsFile | null, calendar: EarningsEntry[] | null, agents: AgentFiles): McpSource {
  const demo = vault === null;
  const held = new Set((ws.fullBook?.holdings ?? []).map((h) => h.symbol.toUpperCase()));
  const study = vault ? studyContextOf(ws) : null;
  return {
    today: localDay(),
    demo,
    setup: ws.baseSetup,
    book: ws.fullBook,
    portfolios: ws.portfolios,
    shown: ws.shown,
    preferences: ws.preferences,
    records: ws.records,
    decisions: ws.decisions,
    alerts: ws.alerts,
    research: ws.research,
    reports,
    lessons: ws.analyst.lessons,
    filings: ws.filings,
    statements: ws.statements,
    newslettersAddress: newslettersAddress(ws.operator.email),
    propose: vault ? (found) => proposeNewsletterSenders(vault, found, new Date()) : null,
    theses,
    earnings,
    calendar,
    watchlist: Object.keys(ws.records.bySymbol).filter((s) => !held.has(s.toUpperCase())),
    writeThesis: vault
      ? async (w) => {
          const r = await proposeThesisWriteInto(vault, w, new Date(), ws.fullBook?.holdings ?? [], ws.operator.email);
          return r.applied ? { pending: false, subject: r.outcome.subject, changed: r.outcome.changed, created: r.outcome.created } : { pending: true, subject: r.subject, parts: r.parts, isNew: r.isNew, replaced: r.replaced };
        }
      : null,
    recordDecision: vault
      ? async (w) => {
          const now = new Date().toISOString();
          const file = await vault.readJson("decisions", decisionsFileSchema);
          try {
            const entry = decisionFromWrite(file, w, localDay(), now);
            await vault.writeJson("decisions", withDecision(file, entry, now));
            return entry;
          } catch (e) {
            if (e instanceof DecisionWriteProblem) throw new SyncError(e.message, "decision refused");
            throw e;
          }
        }
      : null,
    researchCache: agents.researchCache,
    hunter: agents.hunter,
    feedback: agents.feedback,
    rateFinding: vault
      ? async (r) => {
          const file = (await vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null)) ?? EMPTY_FEEDBACK;
          await vault.writeJson("agent_feedback", withRating(file, { ...r, at: new Date().toISOString() }));
          // The agent, its step and the reasons alone, counted without a name, as the screen's rating is.
          const [{ ratingSignals }, { recordSignals }] = await Promise.all([import("@/lib/improvements"), import("@/lib/improvements-run")]);
          await recordSignals(ws.operator.email, ws.preferences, false, ratingSignals({ agent: r.agent, verdict: r.verdict, reasons: r.reasons }));
        }
      : null,
    studiesToWrite: vault && study ? (id) => studiesToWrite(study, vault, id) : null,
    writeStudy: vault && study ? (id, sections) => writeStudySectionsInto(study, vault, id, sections) : null,
    reportChecks: vault
      ? async (checks) => {
          const unknown = unknownChecks(ws.records.bySymbol, checks);
          const known = checks.filter((c) => unknownChecks(ws.records.bySymbol, [c]).length === 0);
          const prev = await vault.readJson("alerts", alertsFileSchema);
          const { file, fired } = withBrokerChecks(prev, ws.records.bySymbol, held, known, localDay(), new Date().toISOString());
          await vault.writeJson("alerts", alertsFileSchema.parse(file));
          return { fired: fired.length, open: file.items.filter((i) => i.key.startsWith("broker:") && i.clearedAt === null).length, unknown };
        }
      : null,
    notes: [ws.error, ...ws.statementNotes].filter((x): x is string => !!x),
    edgar: demo ? null : edgarFor(ws.preferences.edgarContact),
  };
}

/** The results calendar's dates for the person's followed companies (the feed's short budget, its shared copy), or null when it could not be read: the routine's schedule reads them. */
async function followedDates(ws: Workspace): Promise<EarningsEntry[] | null> {
  const { calendar } = await loadEarnings(localDay()).catch(() => ({ calendar: null }));
  return calendar ? entriesFor(calendar, earningsSubjects(ws.fullBook, ws.records.bySymbol, ws.preferences.earnings)) : null;
}

/** The person's data for one tools/call: the showcase in the demo, their own vault otherwise. */
export async function mcpSource(grant: Grant | null): Promise<McpSource> {
  if (storageMode() === "demo") {
    const ws = await showcaseWorkspace();
    const [theses, earnings, calendar] = await Promise.all([thesesFor(ws), earningsFor(ws), followedDates(ws)]);
    return sourceOf(ws, null, null, theses.file, earnings.file, calendar, { researchCache: null, hunter: null, feedback: null });
  }
  if (!grant) throw new SyncError("This connection is not signed in. Connect Invariant again in Claude.", "mcp call without grant");
  const vault = await vaultForMcp(grant);
  // The theses are read from the grant's own vault, like everything else here: a connector call carries no sign-in, so the screens' `thesesFor` (the session's vault) read nothing and get_theses said "no thesis yet" of theses write_thesis had just kept (Hamza, 19 Oct 2026).
  const [ws, reports, theses, earnings] = await Promise.all([
    vaultWorkspace({ name: null, email: grant.email, image: null }, vault),
    vault.readJson("reports", reportsFileSchema).catch(() => null),
    vault.readJson("theses", thesesFileSchema).then((f) => f ?? EMPTY_THESES, (e: unknown) => (e instanceof SyncError ? e.message : "The theses file could not be read just now.")),
    vault.readJson("earnings", earningsFileSchema).then((f) => f ?? EMPTY_EARNINGS, () => null),
  ]);
  const [researchCache, hunter, feedback] = await Promise.all([
    vault.readJson("research_cache", researchCacheSchema).catch(() => null),
    vault.readJson("thesis_hunter", thesisHunterFileSchema).catch(() => null),
    vault.readJson("agent_feedback", agentFeedbackSchema).catch(() => null),
  ]);
  const src = sourceOf(ws, reports, vault, typeof theses === "string" ? null : theses, earnings, await followedDates(ws), { researchCache, hunter, feedback });
  if (typeof theses === "string") src.notes.push(`The theses were not read: ${theses}`);
  return src;
}

/** A failure as the sentence the model relays: the app's own sentence, or a plain one. */
export function mcpProblem(e: unknown): string {
  if (e instanceof SyncError) {
    console.error(`[mcp] call failed: ${e.logDetail ?? "sync error"}`);
    const signIn = /^(ms )?refresh \d+ invalid_grant/.test(e.logDetail ?? "");
    return signIn ? `${e.message.replace(/ Sign out and sign in again\.?$/, "")} Reconnect Invariant in Claude (Customize, Connectors) to sign in again.` : e.message;
  }
  console.error("[mcp] call failed: unexpected error");
  return "Invariant could not read your data just now. Try again in a moment.";
}
