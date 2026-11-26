import "server-only";

import type { IbkrFlexConnection } from "@/lib/connections";
import { describeFlexError, parseFlexResponse } from "@/lib/flex";
import { SyncError } from "@/lib/sync-error";

/**
 * The IBKR Flex Web Service, two GET requests: SendRequest returns a
 * reference code, GetStatement returns the statement once IBKR has made it.
 * A Flex token returns reports and nothing else: it cannot place, change or
 * cancel an order, or create an alert. The token and query id are the
 * person's own, from their vault.
 *
 * **The token is a query parameter, so no URL from here reaches a log or an
 * error.** Every failure becomes a sentence naming what went wrong, without
 * the request that went wrong.
 */

const FLEX = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const POLL_DELAYS_MS = [3000, 5000, 8000, 10000, 15000];
const TIMEOUT_MS = 30_000;
/** Waits before asking again when IBKR cannot be reached or answers 5xx (27 Oct 2026: one dropped connection cost the morning's statement). */
const RETRY_DELAYS_MS = [2000, 6000];

async function call(path: string, params: Record<string, string>): Promise<string> {
  const url = `${FLEX}/${path}?${new URLSearchParams({ ...params, v: "3" })}`;
  for (let attempt = 0; ; attempt++) {
    const retry = RETRY_DELAYS_MS[attempt];
    let response: Response;
    try {
      // IBKR refuses requests without a user agent.
      response = await fetch(url, { headers: { "user-agent": "Portfolio-OS/1.0" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      if (retry !== undefined) {
        await sleep(retry);
        continue;
      }
      throw new SyncError("Interactive Brokers could not be reached. The next refresh will try again.", `flex ${path} unreachable`);
    }
    if (response.status >= 500 && retry !== undefined) {
      await sleep(retry);
      continue;
    }
    if (!response.ok) throw new SyncError(`Interactive Brokers answered HTTP ${response.status}. The next refresh will try again.`, `flex ${path} ${response.status}`);
    return response.text();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Asks for the statement and waits for IBKR to make it; returns the statement's XML, unread. */
export async function fetchFlexXml(connection: IbkrFlexConnection): Promise<string> {
  const sent = parseFlexResponse(await call("SendRequest", { t: connection.token, q: connection.queryId }));
  if (!sent) throw new SyncError("Interactive Brokers answered with something that is not a Flex reply. The next refresh will try again.", "flex SendRequest: unexpected body");
  if (sent.status !== "success") throw new SyncError(describeFlexError(sent.code, sent.message), `flex SendRequest ${sent.code}`);
  for (let attempt = 0; ; attempt++) {
    const xml = await call("GetStatement", { t: connection.token, q: sent.referenceCode });
    const pending = parseFlexResponse(xml);
    if (!pending) return xml;
    if (pending.status === "success") throw new SyncError("Interactive Brokers sent a reference instead of the statement. The next refresh will try again.", "flex GetStatement: success without statement");
    const generating = pending.status === "warn" && (pending.code === "1019" || pending.code === "1021");
    const delay = POLL_DELAYS_MS[attempt];
    if (!generating || delay === undefined) throw new SyncError(describeFlexError(pending.code, pending.message), `flex GetStatement ${pending.code}`);
    await sleep(delay);
  }
}
