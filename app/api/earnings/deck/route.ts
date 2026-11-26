import { reviewedDoc } from "@/lib/doc-review";
import { reportKey } from "@/lib/earnings";
import { earningsDoc, earningsDocName } from "@/lib/earnings-doc";
import { renderReportDocPdf } from "@/lib/report-doc-pdf-run";
import { reportHtml } from "@/lib/report-html";
import { earningsFor, getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A post-earnings report as a document (Hamza, 4 Nov 2026: HTML in the app,
 * a PDF to keep), drawn from the kept report itself with the reviewer's
 * leave-outs applied, so it says what the Earnings screen says: `format=html`
 * (the default) for the page the app embeds, `format=pdf` for the file. Only
 * once the report is whole and read through; until then a sentence. The
 * signed-in person's own reports only; the demo draws its fictional samples.
 */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "html";
  if (!/^[A-Z0-9./-]{1,20}:\d{4}-\d{2}-\d{2}$/.test(key)) return new Response("No such report.", { status: 404 });
  const { file, error } = await earningsFor(ws);
  const report = file.reports.find((r) => reportKey(r) === key && (r.status === "release" || r.status === "complete"));
  if (!report) return new Response(error ?? "No such report.", { status: error ? 503 : 404 });
  const demo = ws.mode === "demo";
  if (!demo && !report.doc?.ready) return new Response("This earnings report is not ready yet: it is sent once its figures, the call and the study are in and it reads whole.", { status: 409, headers: { "cache-control": "private, no-store" } });
  const doc = reviewedDoc(earningsDoc(report, ws.setup?.methodology?.name ?? null), report.doc?.drop ?? []);
  const name = earningsDocName(report).replace(/[^\w .,()-]/g, "");
  if (format === "pdf") {
    const bytes = await renderReportDocPdf(doc);
    return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"`, "cache-control": "private, no-store" } });
  }
  return new Response(reportHtml(doc, ""), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors 'self'" },
  });
}
