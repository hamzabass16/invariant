import { isTradingHours, type LiveSessionAnswer } from "@/lib/live";
import { loadLiveSession } from "@/lib/markets-feed";
import { operatorOrNull } from "@/lib/session";
import { storageMode } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });

/**
 * The session so far, for the Dashboard while the US market is open: every
 * company of the last session's read at its price now, the indices and QQQ.
 * Public prices only; nothing of the person's book is asked or sent. Out of
 * hours it says the market is shut and answers the session's closes: the
 * prices so far until the kept read of that session lands, then that read
 * itself (`loadLiveSession` reads nothing more once it has); the demo has no
 * live prices.
 */
export async function POST() {
  if (storageMode() !== "drive") return json({ error: "The demo has no live prices." }, 404);
  if (!(await operatorOrNull())) return json({ error: "Sign in again." }, 401);
  const now = new Date();
  const live = await loadLiveSession(now);
  return json({ open: isTradingHours(now), ...live } satisfies LiveSessionAnswer);
}
