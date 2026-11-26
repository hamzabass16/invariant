import { Download, ExternalLink } from "lucide-react";

import { StableEmbed } from "@/components/ui/stable-embed";
import type { Report } from "@/lib/report";
import { reviewPdfHref, reviewViewHref } from "@/lib/review-html";

/**
 * A weekly or monthly review on the Reviews screen as its own page, drawn
 * from the same plan as its PDF (lib/review-html.ts; Hamza, 5 Nov 2026: the
 * page looks like the PDF report, no deck), with Open and the PDF the email
 * carries, both made from the kept review.
 */
export function ReviewEmbed({ report }: { report: Report }) {
  if (report.kind === "today") return null;
  const view = reviewViewHref(report.id);
  return (
    <div className="card mb-6 overflow-hidden">
      <StableEmbed className="relative h-[75vh] min-h-[460px] w-full">
        <iframe src={view} title={report.title} className="absolute inset-0 h-full w-full border-0" loading="lazy" />
      </StableEmbed>
      <div className="flex flex-wrap gap-2 border-t border-hairline px-4 py-3">
        <a href={view} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">
          <ExternalLink size={15} aria-hidden /> Open the review
        </a>
        <a href={reviewPdfHref(report.id)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text" download>
          <Download size={15} aria-hidden /> Download the PDF
        </a>
      </div>
    </div>
  );
}
