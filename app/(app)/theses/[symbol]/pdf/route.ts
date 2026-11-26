import { thesisPdfName } from "@/lib/thesis-pdf";
import { pdfResponse, renderThesisPdf, stockThesisPdf } from "@/lib/thesis-pdf-run";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
// The pictures are read once each, ten seconds at most, in parallel.
export const maxDuration = 60;

/** A stock thesis as a PDF to keep or send, marked Invariant, from the signed-in person's own vault (Hamza, 20 Oct 2026). */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await ctx.params).symbol).toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return new Response("Not found", { status: 404 });
  const ws = await getWorkspace();
  if (!ws.setup || !ws.modules.includes("overview")) return new Response("Not found", { status: 404 });
  const d = await stockThesisPdf(ws, symbol);
  if (!d) return new Response("Not found", { status: 404 });
  return pdfResponse(await renderThesisPdf(d, ws.mode === "demo"), thesisPdfName(d));
}
