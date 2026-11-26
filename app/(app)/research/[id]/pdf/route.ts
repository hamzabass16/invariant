import { Font, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { PDF_STYLE, StudyPdf } from "@/components/research/study-pdf";
import { studyCharts } from "@/lib/study-charts";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let fontsReady = false;
/** Space Grotesk from public/fonts, by path, once per process: the template's face, nothing fetched. */
function registerFonts() {
  if (fontsReady) return;
  const dir = `${process.cwd()}/public/fonts`;
  Font.register({ family: PDF_STYLE.font, fonts: [400, 500, 700].map((w) => ({ src: `${dir}/SpaceGrotesk-${w}.ttf`, fontWeight: w })) });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

/** The currency the facts text names, so the charts and the table say it; null when the study has no filings. */
export function currencyOf(facts: string | null): string | null {
  return facts?.match(/in millions of ([A-Z]{3})/)?.[1] ?? null;
}

/** The study as a PDF in the stock template's style, from the signed-in person's own vault. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ws = await getWorkspace();
  const study = ws.research.studies.find((s) => s.id === id);
  // A study written after the results downloads from Earnings and Theses even with the Research screen off.
  if (!study || (!ws.modules.includes("research") && !study.forResults)) return new Response("Not found", { status: 404 });
  registerFonts();
  const currency = currencyOf(study.facts);
  const pdf = await renderToBuffer(createElement(StudyPdf, { study, charts: studyCharts(study.table, currency), currency }) as unknown as ReactElement<DocumentProps>);
  const name = `${study.subject.replace(/[^A-Za-z0-9-]+/g, "-")}-study-${study.requestedAt.slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
