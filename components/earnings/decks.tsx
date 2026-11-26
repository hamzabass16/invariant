import { Download, ExternalLink, FileText, Presentation } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { CHIP } from "@/components/earnings/calendar";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListSection } from "@/components/ui/list";
import { StableEmbed } from "@/components/ui/stable-embed";
import { deckWaiting, reportKey, type EarningsReport } from "@/lib/earnings";
import { deckHref, docViewHref, studyHref } from "@/lib/earnings-deck";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

type Group = { symbol: string; name: string | null; reports: EarningsReport[] };

const quarter = (r: EarningsReport) => `${r.quarter ? `${r.quarter.replace("/", " ")} results` : "Results"}`;

/**
 * The earnings reports, one company at a time (Hamza, 15 Oct 2026): a chip
 * per company, holdings first; the chosen company's latest report embedded as
 * the app's own page once it is whole (Hamza, 4 Nov 2026: HTML, not a
 * PowerPoint), with Open and the PDF; then its earlier reports as PDFs.
 */
export function EarningsDecks({ groups, chosen, hrefFor, demo, writes, today }: { groups: Group[]; chosen: string | null; hrefFor: (symbol: string) => Route; demo: boolean; writes: boolean; today: string }) {
  if (!groups.length) {
    return (
      <ListSection id="decks" header="Earnings reports">
        <EmptyState icon={Presentation} title="No reports yet" instruction="A report is written for each company once its results, the call and the study are in." action={null} />
      </ListSection>
    );
  }
  const g = groups.find((x) => x.symbol === chosen) ?? groups[0];
  const [latest, ...earlier] = g.reports;
  const ready = demo || !!latest.doc?.ready;
  const waiting = demo ? null : deckWaiting(latest, writes, today);
  return (
    <section id="decks" className="mb-8 scroll-mt-20">
      <h2 className="section-header mb-2 px-4">Earnings reports</h2>
      <nav className="mb-3 flex flex-wrap gap-2 px-1" aria-label="Reports by company">
        {groups.map((x) => {
          const on = x.symbol === g.symbol;
          return (
            <Link
              key={x.symbol}
              href={hrefFor(x.symbol)}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn("data inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-[10px] px-3 text-subhead font-medium transition-colors", on ? "bg-accent text-white" : CHIP[x.reports[0].kind], !on && "hover:opacity-80")}
            >
              {x.symbol}
              <span className={cn("ml-1.5 text-caption", on ? "opacity-80" : "text-text-tertiary")}>{x.reports.length}</span>
            </Link>
          );
        })}
      </nav>
      <div className="card overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <p className="text-body font-semibold">
            {g.symbol} · {quarter(latest)}
          </p>
          <p className="text-footnote text-text-secondary">
            {latest.headline} {longDate(latest.date)}
            {latest.status === "release" ? (latest.figuresFrom === "release" ? " · figures from the release" : " · figures to come") : ""}
          </p>
        </div>
        {ready ? (
          <StableEmbed className="relative h-[75vh] min-h-[460px] w-full border-t border-hairline">
            <iframe src={docViewHref(latest)} title={`${g.symbol} ${quarter(latest)}, earnings report`} className="absolute inset-0 h-full w-full border-0" loading="lazy" />
          </StableEmbed>
        ) : null}
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {ready ? (
            <>
              <a href={docViewHref(latest)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">
                <ExternalLink size={15} aria-hidden /> Open the report
              </a>
              <a href={deckHref(latest)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text" download>
                <Download size={15} aria-hidden /> Download the PDF
              </a>
            </>
          ) : null}
          {studyHref(latest) ? (
            <a href={studyHref(latest)!} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text" download>
              <FileText size={15} aria-hidden /> Download the study (PDF)
            </a>
          ) : null}
          <Link href={`/theses/${encodeURIComponent(g.symbol)}` as Route} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-accent-text">
            Thesis and DCF
          </Link>
        </div>
      </div>
      {!ready && waiting ? <p className="mt-2 px-4 text-footnote text-text-tertiary">{waiting}</p> : null}
      {earlier.length ? (
        <ListSection grid header={`Earlier reports · ${g.symbol}`} className="mt-6">
          {earlier.filter((r) => demo || r.doc?.ready).map((r) => (
            <ListLinkRow key={reportKey(r)} href={deckHref(r) as Route} download label={quarter(r)} detail={`${longDate(r.date)} · earnings report`} value={<span className="text-footnote text-accent-text">PDF</span>} />
          ))}
        </ListSection>
      ) : null}
    </section>
  );
}
