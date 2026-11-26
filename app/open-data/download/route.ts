import { openDataCsv } from "@/lib/open-data";
import { allWeeks } from "@/lib/open-data-run";

export const dynamic = "force-dynamic";

/**
 * The open data as one CSV for researchers (Hamza, 9 Nov 2026, the twenty
 * further ways): every pooled week, a row a methodology family with five
 * people or more (`openDataCsv`), under CC BY 4.0. Public; no name, holding
 * or amount is in it.
 */
export async function GET() {
  const { weeks, problem } = await allWeeks();
  if (problem) return new Response(problem, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(openDataCsv(weeks), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="invariant-open-data.csv"',
      "cache-control": "public, max-age=3600",
    },
  });
}
