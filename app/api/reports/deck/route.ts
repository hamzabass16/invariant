import { reviewResponse } from "@/lib/review-page-run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A weekly or monthly review as a document (Hamza, 4 Nov 2026: a page in the
 * app and a PDF to keep, no PowerPoint): `format=html` (the default) for the
 * page Reviews embeds, `format=pdf` for the file the email carries.
 */
export async function GET(req: Request) {
  return reviewResponse(req, new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "html");
}
