import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { sampleExtendedAnswer, sampleExtendedSchema } from "@/lib/demo-markets";

import { EXTENDED_MAX_SYMBOLS, sessionAt, sinceAskSchema, type ExtendedAnswer } from "@/lib/extended-hours";
import { loadCloses, loadExtended } from "@/lib/markets-feed";
import { operatorOrNull } from "@/lib/session";
import { storageMode } from "@/lib/storage";
import { localDay } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  symbols: z.array(z.string().regex(/^[A-Za-z0-9.\-]{1,12}$/)).max(EXTENDED_MAX_SYMBOLS),
  since: z.array(sinceAskSchema).max(EXTENDED_MAX_SYMBOLS).default([]),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });

/**
 * Pre-market and after-hours prices, and the move since a company's results
 * came out (Hamza, 4 Nov 2026), for a signed-in page: the symbols and the
 * release times come in the body, never the URL, and only public prices go
 * back; nothing is kept or logged. The demo answers from a fictional sample of
 * the prints after its snapshot's last close, read from no feed.
 */
export async function POST(req: Request) {
  const demo = storageMode() === "demo";
  if (!demo && storageMode() !== "drive") return json({ error: "No live prices here." }, 404);
  if (!demo && !(await operatorOrNull())) return json({ error: "Sign in again." }, 401);
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: `Name up to ${EXTENDED_MAX_SYMBOLS} listed symbols.` }, 400);
  }
  if (demo) {
    const sample = sampleExtendedSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "extended-hours.json"), "utf8")));
    const asked = [...new Set(body.since.map((s) => s.symbol.toUpperCase()))];
    const closes = asked.length ? (await loadCloses(asked.join(","), localDay(), "budget", 120)).series : {};
    return json(sampleExtendedAnswer(sample, body.symbols, body.since, closes) satisfies ExtendedAnswer);
  }
  const got = await loadExtended(body.symbols, body.since);
  return json({ session: sessionAt(Math.floor(Date.now() / 1000)), ...got } satisfies ExtendedAnswer);
}
