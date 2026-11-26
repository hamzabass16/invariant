import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { ReviewPdf } from "@/components/reports/review-pdf";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import type { Report } from "@/lib/report";
import { reviewPdfPlan } from "@/lib/review-pdf";

/** The review as a PDF report (lib/review-pdf.ts plans it, components/reports/review-pdf.tsx draws it), from the kept report alone. */
export async function renderReviewPdf(report: Report): Promise<Uint8Array> {
  registerPdfFonts();
  const buf = await renderToBuffer(createElement(ReviewPdf, { plan: reviewPdfPlan(report) }) as unknown as ReactElement<DocumentProps>);
  return new Uint8Array(buf);
}
