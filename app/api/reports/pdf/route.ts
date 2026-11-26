import { reviewResponse } from "@/lib/review-page-run";

export const runtime = "nodejs";
export const maxDuration = 300;

/** A review as its PDF, the address older emails and pages link (the same file as `/api/reports/deck?format=pdf`). */
export async function GET(req: Request) {
  return reviewResponse(req, "pdf");
}
