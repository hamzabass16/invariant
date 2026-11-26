import "server-only";

import { Font } from "@react-pdf/renderer";

import { PDF_STYLE } from "@/components/research/study-pdf";
import { REVIEW_FONT } from "@/components/reports/review-pdf";
import { DOC_FONTS } from "@/components/reports/report-doc-pdf";

let ready = false;

/**
 * The faces the PDFs are set in, from public/fonts by path, once per process
 * and nothing fetched: Space Grotesk for the study (the stock template's
 * face) and Inter for the review report (the HCMP review's face; Hamza,
 * 18 Oct 2026). Words are never hyphenated.
 */
export function registerPdfFonts(): void {
  if (ready) return;
  const dir = `${process.cwd()}/public/fonts`;
  Font.register({ family: PDF_STYLE.font, fonts: [400, 500, 700].map((w) => ({ src: `${dir}/SpaceGrotesk-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: REVIEW_FONT, fonts: [400, 500, 600, 700].map((w) => ({ src: `${dir}/Inter-${w}.ttf`, fontWeight: w })) });
  // The report documents (the earnings report, and the reviews after it) in the app's own faces, as the web page draws them.
  Font.register({ family: DOC_FONTS.sans, fonts: [400, 600].map((w) => ({ src: `${dir}/Inter-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: DOC_FONTS.mono, fonts: [400, 500, 600].map((w) => ({ src: `${dir}/ibm-plex-mono-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: DOC_FONTS.head, fonts: [500, 600].map((w) => ({ src: `${dir}/barlow-condensed-${w}.ttf`, fontWeight: w })) });
  Font.registerHyphenationCallback((word) => [word]);
  ready = true;
}
