import "server-only";

import { randomUUID } from "node:crypto";

import { etoroInstrumentIds, parseEtoroInstruments, parseEtoroPortfolio, type EtoroInstrument } from "@/lib/brokers";
import type { EtoroConnection } from "@/lib/connections";
import type { Holding } from "@/lib/holdings";
import { SyncError } from "@/lib/sync-error";

/**
 * eToro's public API with the person's own keys, made with Read permission
 * for the Real environment: the account's portfolio and P&L, and the names of
 * the instruments in it. GET requests only; nothing here opens, changes or
 * closes a position, and `npm run check:guard` holds that. The keys travel in
 * eToro's headers and never reach a log or an error.
 */

const API = "https://public-api.etoro.com/api/v1";
const TIMEOUT_MS = 30_000;

async function get(conn: EtoroConnection, path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "GET",
      headers: { "x-request-id": randomUUID(), "x-api-key": conn.apiKey, "x-user-key": conn.userKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncError("eToro could not be reached. The next refresh will try again.", "etoro unreachable");
  }
  if (response.status === 401) throw new SyncError("eToro refused the keys. Make a new key with Read permission for the Real environment and keep both keys again.", "etoro 401");
  if (response.status === 403) throw new SyncError("eToro refused the request: the key needs Read permission for the Real environment, and the account must be verified.", "etoro 403");
  if (response.status === 429) throw new SyncError("eToro asked the app to slow down. The next refresh will try again.", "etoro 429");
  if (!response.ok) throw new SyncError(`eToro answered HTTP ${response.status}. The next refresh will try again.`, `etoro ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new SyncError("eToro answered with something that is not data. The next refresh will try again.", "etoro: not json");
  }
}

/** The account's positions, the people it copies, and its cash, as holdings in US dollars. */
export async function fetchEtoro(conn: EtoroConnection, asOf: string): Promise<{ accounts: string[]; holdings: Holding[]; notes: string[] }> {
  const portfolio = await get(conn, "/trading/info/real/pnl");
  try {
    const ids = etoroInstrumentIds(portfolio);
    const instruments: EtoroInstrument[] = [];
    for (let i = 0; i < ids.length; i += 100) instruments.push(...parseEtoroInstruments(await get(conn, `/market-data/instruments?instrumentIds=${ids.slice(i, i + 100).join(",")}`)));
    return parseEtoroPortfolio(portfolio, instruments, asOf);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError(`eToro's portfolio could not be read: ${e instanceof Error ? e.message : "its shape has changed"}`.slice(0, 300), "etoro: shape");
  }
}
