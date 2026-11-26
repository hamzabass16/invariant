import { z } from "zod";
import { localMoment } from "@/lib/time";

/**
 * The connections a person keeps in their vault so the app can fetch their
 * figures while they are away, and the record of the last morning refresh.
 * Pure, so the screens, the sync and the checks share one reading.
 *
 *   connections   the IBKR Flex Web Service token and query id; the person's
 *                 own SnapTrade Personal key (Schwab, Wealthsimple and the
 *                 other brokers they connected to it, read-only); their own
 *                 eToro keys with Read permission. Each is read for the
 *                 fetch, never shown again, never logged. A Flex token
 *                 returns reports and nothing else; the SnapTrade fetch asks
 *                 only for accounts, positions and balances, and connects
 *                 brokers read-only; the eToro fetch only reads.
 *   sync          what the last refresh did, source by source, as sentences.
 */

export const ibkrFlexSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9]{6,128}$/),
  queryId: z.string().regex(/^\d{1,16}$/),
  savedAt: z.string(),
});
export type IbkrFlexConnection = z.infer<typeof ibkrFlexSchema>;

/** A SnapTrade Personal key: free, for the key owner's own brokerage accounts only (docs.snaptrade.com, Personal vs Commercial). */
export const snapTradeSchema = z.object({
  clientId: z.string().regex(/^[\x21-\x7e]{4,120}$/),
  consumerKey: z.string().regex(/^[\x21-\x7e]{8,400}$/),
  savedAt: z.string(),
});
export type SnapTradeConnection = z.infer<typeof snapTradeSchema>;

/** eToro's two keys from Settings, Trading, API Key Management, made with Read permission for the Real environment. */
export const etoroSchema = z.object({
  apiKey: z.string().regex(/^[\x21-\x7e]{8,2000}$/),
  userKey: z.string().regex(/^[\x21-\x7e]{8,4000}$/),
  savedAt: z.string(),
});
export type EtoroConnection = z.infer<typeof etoroSchema>;

export const connectionsSchema = z.object({
  version: z.literal(1),
  ibkrFlex: ibkrFlexSchema.nullable(),
  snaptrade: snapTradeSchema.nullable().default(null),
  etoro: etoroSchema.nullable().default(null),
});
export type Connections = z.infer<typeof connectionsSchema>;
export const EMPTY_CONNECTIONS: Connections = { version: 1, ibkrFlex: null, snaptrade: null, etoro: null };

/** Why a pasted token and query id cannot be kept, or null; never echoes either value. */
export function flexCredentialsProblem(token: string, queryId: string): string | null {
  if (!token || !queryId) return "Paste both the token and the query id.";
  if (!/^[A-Za-z0-9]{6,128}$/.test(token)) return "The token is letters and digits only, as Client Portal shows it under Flex Web Service Configuration.";
  if (!/^\d{1,16}$/.test(queryId)) return "The query id is a number, shown beside the query on the Flex Queries list.";
  return null;
}

/** Why a pasted SnapTrade client id and consumer key cannot be kept, or null; never echoes either value. */
export function snapTradeCredentialsProblem(clientId: string, consumerKey: string): string | null {
  if (!clientId || !consumerKey) return "Paste both the client id and the consumer key.";
  if (!/^[\x21-\x7e]{4,120}$/.test(clientId)) return "The client id is one word with no spaces, as SnapTrade's API Key page shows it.";
  if (!/^[\x21-\x7e]{8,400}$/.test(consumerKey)) return "The consumer key is one long word, as SnapTrade's API Key page shows it once. Copy it again without spaces.";
  return null;
}

/** Why pasted eToro keys cannot be kept, or null; never echoes either value. */
export function etoroCredentialsProblem(apiKey: string, userKey: string): string | null {
  if (!apiKey || !userKey) return "Paste both the Public API Key and the User Key.";
  if (!/^[\x21-\x7e]{8,2000}$/.test(apiKey)) return "The Public API Key is one long word, as eToro shows it under Generated Keys. Copy it again without spaces.";
  if (!/^[\x21-\x7e]{8,4000}$/.test(userKey)) return "The User Key is one long word, shown once when the key is made. Copy it again without spaces.";
  if (apiKey === userKey) return "The two keys are different: the Public API Key and the User Key each have their own Copy button.";
  return null;
}

/** What the screens may know about the other connections: that each exists, and when it was kept. Never a key. */
export type KeySummary = { savedAt: string } | null;
export function summarizeKeys(c: Connections | null): { snaptrade: KeySummary; etoro: KeySummary } {
  return { snaptrade: c?.snaptrade ? { savedAt: c.snaptrade.savedAt } : null, etoro: c?.etoro ? { savedAt: c.etoro.savedAt } : null };
}

/** What the screens may know about the connection: that it exists, and when it was kept. Never the token. */
export type FlexSummary = { queryId: string; savedAt: string } | null;
export function summarizeFlex(c: Connections | null): FlexSummary {
  return c?.ibkrFlex ? { queryId: c.ibkrFlex.queryId, savedAt: c.ibkrFlex.savedAt } : null;
}

export const SYNC_SOURCES = ["ibkr_flex", "snaptrade", "etoro", "statements_inbox", "newsletters_inbox", "earnings", "filings", "benchmarks", "custom_data", "podcasts", "research", "calendar_agent", "macro_reports"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];
export const SYNC_SOURCE_LABEL: Record<SyncSource, string> = { ibkr_flex: "IBKR Flex", snaptrade: "SnapTrade", etoro: "eToro", statements_inbox: "Statements by email", newsletters_inbox: "Newsletters by email", earnings: "Results after earnings", filings: "SEC filings", benchmarks: "SPY and QQQ look-through", custom_data: "Your data", podcasts: "Podcasts", research: "Research Agent", calendar_agent: "Calendar agent", macro_reports: "Event reports" };

export const syncStepSchema = z.object({
  source: z.enum(SYNC_SOURCES),
  outcome: z.enum(["ok", "failed", "skipped"]),
  sentence: z.string().max(400),
  at: z.string(),
});
export type SyncStep = z.infer<typeof syncStepSchema>;

export const syncStatusSchema = z.object({
  version: z.literal(1),
  /** The UTC day of the last scheduled refresh, so an hourly cron refreshes once a day. */
  day: z.string(),
  at: z.string(),
  how: z.enum(["morning", "by hand", "evening"]),
  steps: z.array(syncStepSchema).max(SYNC_SOURCES.length),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;

/** True when the morning refresh has not run yet on this UTC day. A refresh by hand or the evening Flex fetch does not count: the morning one still runs. */
export function syncDue(status: SyncStatus | null, now: Date): boolean {
  return !status || status.how !== "morning" || status.day !== now.toISOString().slice(0, 10);
}

/**
 * True when the evening run should ask IBKR for the statement: the person
 * keeps a Flex token and the book on file is older than the last closed
 * session, so a statement of that session would be new. IBKR makes the
 * day's statement overnight, so most evenings the fetch comes back with
 * the statement the morning already has and nothing is written; after a
 * weekend, or once the morning has it, nothing is asked (Hamza, 17 Oct 2026).
 */
export function flexEveningDue(connections: Connections | null, bookAsOf: string | null, session: string | null): boolean {
  if (!connections?.ibkrFlex || !session) return false;
  return !bookAsOf || bookAsOf < session;
}

/**
 * The status after a refresh: a source that was not tried this time keeps
 * its last line, so a filings failure today never hides yesterday's good
 * Flex fetch, and the reverse.
 */
export function mergeSync(prev: SyncStatus | null, steps: SyncStep[], now: Date, how: SyncStatus["how"]): SyncStatus {
  const kept = (prev?.steps ?? []).filter((s) => !steps.some((n) => n.source === s.source));
  const all = [...steps, ...kept].sort((a, b) => SYNC_SOURCES.indexOf(a.source) - SYNC_SOURCES.indexOf(b.source));
  return { version: 1, day: how === "morning" ? now.toISOString().slice(0, 10) : (prev?.day ?? ""), at: now.toISOString(), how, steps: all };
}

/** One line per source for Setup: "IBKR Flex: fetched 13 Oct, 08:01 (the person's time). 12 holdings." */
export function describeSync(status: SyncStatus | null): { source: SyncSource; label: string; line: string; outcome: SyncStep["outcome"] }[] {
  if (!status) return [];
  return status.steps.map((s) => ({ source: s.source, label: SYNC_SOURCE_LABEL[s.source], line: `${whenText(s.at)}. ${s.sentence}`, outcome: s.outcome }));
}

export function whenText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "At an unknown time";
  return localMoment(d);
}
