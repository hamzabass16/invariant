import "server-only";

import { createHmac } from "node:crypto";

import { canonicalJson, parseSnapTradeAccounts, snapTradeAccountHoldings, snapTradeSigContent } from "@/lib/brokers";
import type { SnapTradeConnection } from "@/lib/connections";
import type { Holding } from "@/lib/holdings";
import { SyncError } from "@/lib/sync-error";

/**
 * SnapTrade with the person's own Personal key (free, for their own
 * brokerage accounts only): the accounts list, each account's positions and
 * balances, and the link to SnapTrade's own page where they connect a broker,
 * read-only. Nothing else: no order, trade or connection change is named
 * here, and `npm run check:guard` holds that.
 *
 * Every request is signed with the consumer key (lib/brokers.ts builds the
 * string); the key never leaves this file and no URL from here reaches a log
 * or an error. Every failure becomes a sentence.
 */

const ORIGIN = "https://api.snaptrade.com";
const PREFIX = "/api/v1";
const TIMEOUT_MS = 30_000;

async function call(conn: SnapTradeConnection, method: "GET" | "POST", path: string, body: Record<string, unknown> | null = null): Promise<unknown> {
  const query = new URLSearchParams({ clientId: conn.clientId, timestamp: String(Math.floor(Date.now() / 1000)) }).toString();
  const signature = createHmac("sha256", conn.consumerKey).update(snapTradeSigContent(`${PREFIX}${path}`, query, body)).digest("base64");
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}${PREFIX}${path}?${query}`, {
      method,
      headers: { Signature: signature, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? canonicalJson(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncError("SnapTrade could not be reached. The next refresh will try again.", `snaptrade ${method} unreachable`);
  }
  if (response.status === 401 || response.status === 403) throw new SyncError("SnapTrade refused the key. Check the client id and consumer key on SnapTrade's API Key page and keep them again.", `snaptrade ${response.status}`);
  if (response.status === 429) throw new SyncError("SnapTrade asked the app to slow down. The next refresh will try again.", "snaptrade 429");
  if (!response.ok) throw new SyncError(`SnapTrade answered HTTP ${response.status}. The next refresh will try again.`, `snaptrade ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new SyncError("SnapTrade answered with something that is not data. The next refresh will try again.", "snaptrade: not json");
  }
}

/** Every connected account's positions and cash, named by institution and account. An account that cannot be read costs that account and says so. */
export async function fetchSnapTrade(conn: SnapTradeConnection, asOf: string): Promise<{ accounts: string[]; holdings: Holding[]; notes: string[] }> {
  let accounts;
  try {
    accounts = parseSnapTradeAccounts(await call(conn, "GET", "/accounts"));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SnapTrade's accounts list could not be read. The next refresh will try again.", "snaptrade accounts: shape");
  }
  if (!accounts.length) throw new SyncError("SnapTrade has no broker connected to this key yet. Press Connect a broker on Setup, or connect one on SnapTrade's own site.", "snaptrade: no accounts");
  const holdings: Holding[] = [];
  const notes: string[] = [];
  const read: string[] = [];
  for (const a of accounts) {
    try {
      const [positions, balances] = await Promise.all([call(conn, "GET", `/accounts/${encodeURIComponent(a.id)}/positions/all`), call(conn, "GET", `/accounts/${encodeURIComponent(a.id)}/balances`)]);
      holdings.push(...snapTradeAccountHoldings(a, positions, balances, asOf));
      read.push(a.label);
    } catch (e) {
      const why = e instanceof SyncError ? e.message : "its reply did not read as positions";
      console.error(`[snaptrade] one account not read: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "shape"}`);
      notes.push(`${a.label} not read: ${why}`.slice(0, 300));
    }
  }
  if (!read.length) throw new SyncError(notes[0] ?? "No SnapTrade account could be read. The next refresh will try again.", "snaptrade: no account read");
  return { accounts: read, holdings, notes };
}

/** SnapTrade's own page for connecting a broker to the person's key, read-only; the link lasts five minutes. */
export async function snapTradeConnectUrl(conn: SnapTradeConnection, returnTo: string): Promise<string> {
  const reply = (await call(conn, "POST", "/snapTrade/login", { connectionType: "read", customRedirect: returnTo, immediateRedirect: true })) as { redirectURI?: unknown };
  if (typeof reply?.redirectURI !== "string" || !reply.redirectURI.startsWith("https://")) throw new SyncError("SnapTrade did not return a page to connect a broker. Try again in a minute.", "snaptrade login: no link");
  return reply.redirectURI;
}
