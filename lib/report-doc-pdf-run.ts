import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { ReportDocPdf } from "@/components/reports/report-doc-pdf";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import type { ReportDoc } from "@/lib/report-doc";

/** A report document as a PDF, from the same pages the web page draws. */
export async function renderReportDocPdf(doc: ReportDoc): Promise<Uint8Array> {
  registerPdfFonts();
  const buf = await renderToBuffer(createElement(ReportDocPdf, { doc }) as unknown as ReactElement<DocumentProps>);
  return new Uint8Array(buf);
}
