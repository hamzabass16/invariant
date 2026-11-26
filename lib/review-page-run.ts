import "server-only";

import { demoReview, DEMO_REVIEW_IDS } from "@/lib/demo-review";
import { reportsFileSchema, type Report } from "@/lib/report";
import { reviewHtml } from "@/lib/review-html";
import { pdfName } from "@/lib/review-pdf";
import { renderReviewPdf } from "@/lib/review-pdf-run";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace } from "@/lib/workspace";

/**
 * A weekly or monthly review as its page (lib/review-html.ts) or its PDF
 * (lib/review-pdf-run.ts), both from the one plan (lib/review-pdf.ts) of the
 * kept review itself, so they say what the email said. The
 * signed-in person's own reviews only; the demo makes its weekly and monthly
 * here, as its Reviews screen does, and keeps nothing.
 */
export async function reviewResponse(req: Request, format: "html" | "pdf"): Promise<Response> {
  const ws = await getWorkspace();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[\w-]{1,60}$/.test(id)) return new Response("No such review.", { status: 404 });
  let report: Report | null = null;
  if (ws.mode === "drive") {
    try {
      const { openVault } = await import("@/lib/vault");
      report = (await (await openVault()).readJson("reports", reportsFileSchema))?.reports.find((r) => r.id === id) ?? null;
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      return new Response(e.message, { status: 503 });
    }
  } else {
    // The demo's weekly and monthly, built as its Reviews screen builds them (lib/demo-review.ts).
    report = id === DEMO_REVIEW_IDS.weekly ? await demoReview(ws, "weekly") : id === DEMO_REVIEW_IDS.monthly ? await demoReview(ws, "monthly") : null;
  }
  if (!report || report.kind === "today") return new Response("No such review.", { status: 404 });
  if (format === "pdf") {
    const bytes = await renderReviewPdf(report);
    const name = pdfName(report).replace(/[^\w .,()-]/g, "");
    return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
  }
  return new Response(reviewHtml(report, ""), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors 'self'" },
  });
}
