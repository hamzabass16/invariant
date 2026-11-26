import { reportKey, type EarningsFile, type EarningsReport, type SeriesTable } from "@/lib/earnings";

/**
 * Where a post-earnings report is opened and listed. The report itself is a
 * document (lib/earnings-doc.ts), drawn as a page (lib/report-html.ts) and as
 * a PDF (components/reports/report-doc-pdf.tsx) from the same blocks; the
 * PowerPoint deck it replaced is no longer made (Hamza, 4 Nov 2026: "HTML
 * embedded in the app, and a PDF"). Pure.
 */

/** The report's standing, as the alert reads it: red when a kill signal is met, amber when a decision is owed. */
export function deckTone(r: EarningsReport): "ok" | "warn" | "danger" {
  if (r.triggers.some((t) => t.kind === "kill" && t.met)) return "danger";
  if (/decision is owed/.test(r.headline)) return "warn";
  return "ok";
}

/** The fiscal year a column is, from "2025" or "FY2025"; null for a trailing period. */
const yearOf = (c: string): string | null => /^(?:FY)?(\d{4})$/.exec(c)?.[1] ?? null;

/** A years table whose trailing column repeats the last fiscal year (an annual filer's report kept before 16 Oct 2026) loses that column, so no page shows FY25 twice. */
export function withoutRepeatedYear(t: SeriesTable | null | undefined): SeriesTable | null {
  if (!t) return null;
  const n = t.cols.length;
  const lastYear = yearOf(t.cols[n - 1]);
  if (n < 2 || lastYear === null || lastYear !== yearOf(t.cols[n - 2])) return t;
  return { cols: t.cols.slice(0, n - 1), rows: t.rows.map((r) => ({ ...r, values: r.values.slice(0, n - 1) })) };
}

/** The reports that make an earnings report: the results are out. */
const hasDeck = (r: EarningsReport) => r.status === "release" || r.status === "complete";

/**
 * The reports on the Earnings screen, newest results first (Hamza, 23 Oct
 * 2026: the newer report sits to the left): every report by company, the
 * company whose latest results came last first, a holding before the
 * watchlist on the same day; and each company's latest report, in that order.
 */
export function decksBy(file: EarningsFile | null): { latest: EarningsReport[]; all: { symbol: string; name: string | null; reports: EarningsReport[] }[] } {
  const rank = { holding: 0, watch: 1, added: 2 } as const;
  const bySymbol = new Map<string, EarningsReport[]>();
  for (const r of (file?.reports ?? []).filter(hasDeck)) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), r]);
  const all = [...bySymbol.entries()]
    .map(([symbol, reports]) => {
      const sorted = reports.slice().sort((a, b) => b.date.localeCompare(a.date));
      return { symbol, name: sorted[0].name, kind: sorted[0].kind, reports: sorted };
    })
    .sort((a, b) => b.reports[0].date.localeCompare(a.reports[0].date) || rank[a.kind] - rank[b.kind] || a.symbol.localeCompare(b.symbol))
    .map(({ symbol, name, reports }) => ({ symbol, name, reports }));
  return { latest: all.map((g) => g.reports[0]), all };
}

/** The earnings report as a PDF to download: the report's key alone in the address. */
export const deckHref = (r: EarningsReport) => `/api/earnings/deck?key=${encodeURIComponent(reportKey(r))}&format=pdf`;
/** The earnings report as the page the app embeds. */
export const docViewHref = (r: EarningsReport) => `/api/earnings/deck?key=${encodeURIComponent(reportKey(r))}`;

/** The study on the report, as a PDF in the stock template's face (Hamza, 27 Oct 2026: the study is a download beside the report); null before one is written. */
export const studyHref = (r: EarningsReport): string | null => (r.detail?.study ? `/research/${r.detail.study.id}/pdf` : null);
