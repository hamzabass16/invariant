import { Download, ExternalLink, FileText } from "lucide-react";

import { StableEmbed } from "@/components/ui/stable-embed";
import type { EarningsReport } from "@/lib/earnings";
import { deckHref, docViewHref, studyHref } from "@/lib/earnings-deck";

/**
 * The earnings report embedded as the app's own page (lib/report-html.ts),
 * with Open, the PDF and the study; until the report is whole, the sentence
 * that says what it waits for. The demo's fictional reports are always shown.
 */
export function DeckEmbed({ report, title, waiting, demo = false, studies }: { report: EarningsReport; title: string; waiting?: string | null; demo?: boolean; studies?: readonly string[] }) {
  const ready = demo || !!report.doc?.ready;
  // The study the report read is offered only while it is on Research, so the page never offers a study it says is not on file.
  const study = studyHref(report) && (!studies || studies.includes(report.detail!.study!.id)) ? studyHref(report) : null;
  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <p className="text-body font-semibold">{title}</p>
      </div>
      {ready ? (
        <StableEmbed className="relative h-[70vh] min-h-[420px] w-full border-t border-hairline">
          <iframe src={docViewHref(report)} title={title} className="absolute inset-0 h-full w-full border-0" loading="lazy" />
        </StableEmbed>
      ) : waiting ? (
        <p className="border-t border-hairline px-4 py-3 text-footnote text-text-secondary">{waiting}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {ready ? (
          <>
            <a href={docViewHref(report)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">
              <ExternalLink size={15} aria-hidden /> Open the report
            </a>
            <a href={deckHref(report)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text" download>
              <Download size={15} aria-hidden /> Download the PDF
            </a>
          </>
        ) : null}
        {study ? (
          <a href={study} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text" download>
            <FileText size={15} aria-hidden /> Download the study (PDF)
          </a>
        ) : null}
      </div>
    </div>
  );
}
