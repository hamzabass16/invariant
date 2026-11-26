import { badgeSvg } from "@/lib/badge";
import { storageMode } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The verified record badge (Hamza, 9 Nov 2026, the twenty further ways):
 * the picture of a card's shared record, found by the card's own link code,
 * so it works only while the person keeps the link on. Public, with no
 * amount; a code that is unknown answers 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const id = code.replace(/\.svg$/, "");
  if (storageMode() === "demo") return new Response("Not found", { status: 404 });
  const { registryAvailable, cardByLink } = await import("@/lib/registry");
  if (!registryAvailable()) return new Response("Not found", { status: 404 });
  const p = await cardByLink(id).catch(() => null);
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(badgeSvg(p), { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" } });
}
