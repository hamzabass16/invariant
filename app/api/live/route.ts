import { z } from "zod";

import { isTradingHours, LIVE_MAX_SYMBOLS, type LiveAnswer } from "@/lib/live";
import { loadLive } from "@/lib/markets-feed";
import { operatorOrNull } from "@/lib/session";
import { storageMode } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ symbols: z.array(z.string().regex(/^[A-Za-z0-9.\- ]{1,12}$/)).max(LIVE_MAX_SYMBOLS) });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });

/**
 * Prices now, for a signed-in page while the US market is open: the symbols
 * the page names come in the body, never the URL, and only public prices go
 * back; the page lays them on the book it already has (lib/live.ts). Out of
 * hours it answers the same prices, which are then the last session's
 * closes, and says the market is shut, so a page keeps them instead of
 * falling back to the statement (Hamza, 17 Oct 2026); the page asks rarely
 * then. The demo is a frozen snapshot and has no live prices.
 */
export async function POST(req: Request) {
  if (storageMode() !== "drive") return json({ error: "The demo has no live prices." }, 404);
  if (!(await operatorOrNull())) return json({ error: "Sign in again." }, 401);
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: "Name up to 60 listed symbols." }, 400);
  }
  const live = await loadLive(body.symbols);
  return json({ open: isTradingHours(new Date()), ...live } satisfies LiveAnswer);
}
