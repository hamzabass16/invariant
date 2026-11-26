import { ExternalLink } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { ValuationRange } from "@/components/app/figures";
import { IncomeFlowChart } from "@/components/charts/income-flow";
import { CallBlock } from "@/components/earnings/call-block";
import { StatusPill } from "@/components/ui/status";
import { companyHref } from "@/lib/company";
import { againstPriced } from "@/lib/expected-move";
import { figureChange, KIND_LABEL, quarterWords, REACTION_DAYS, reactionWaits, reactionWords, TIME_LABEL, type AddedRead, type EarningsReport, type FilingRef } from "@/lib/earnings";
import { localDay, daysBetween, longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS: Record<EarningsReport["status"], { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = {
  complete: { label: "Figures in", tone: "ok" },
  release: { label: "Results out, figures to come", tone: "info" },
  waiting: { label: "Waiting for the filing", tone: "neutral" },
  failed: { label: "Could not be read", tone: "warn" },
};

function Filed({ f, what }: { f: FilingRef; what: string }) {
  return (
    <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-footnote text-accent-text">
      {what}: {f.form}, {longDate(f.filed)}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

/**
 * How the stock took the results (Hamza, 20 Oct 2026): the move to the close
 * of the first session that traded on them, the app's from the closes, and
 * why, as that day's pages reported it, read by the person's own Claude.
 * Until that session has closed, a sentence saying when it is read.
 */
export function ReactionBlock({ r, className }: { r: EarningsReport; className?: string }) {
  const x = r.reaction;
  // A report kept before reactions were read, or one whose closes never came, says nothing rather than waiting for ever.
  if (!x && daysBetween(r.date, localDay()) > REACTION_DAYS) return null;
  return (
    <div className={className}>
      <h3 className="section-header mb-2">How the stock took it</h3>
      {x ? (
        <>
          <p className="text-subhead">
            <span className={cn("data font-semibold", x.movePct > 0.05 ? "text-ok" : x.movePct < -0.05 ? "text-danger" : "text-text")}>
              {x.movePct > 0 ? "+" : ""}
              {x.movePct.toFixed(1)}%
            </span>{" "}
            <span className="text-text-secondary">{reactionWords(x)}</span>
          </p>
          {x.why ? <p className="mt-2 text-subhead">{x.why}</p> : null}
          {x.points.length ? (
            <ul className="mt-2 space-y-1.5">
              {x.points.map((p, i) => (
                <li key={i} className="text-footnote">
                  {p.line}{" "}
                  <a href={p.source.url} target="_blank" rel="noreferrer" className="text-accent-text">
                    {p.source.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {r.expectedMove ? <p className="mt-2 text-footnote text-text-secondary">{againstPriced(r.expectedMove, x.movePct)}</p> : null}
          <p className="mt-2 text-caption text-text-tertiary">{x.why ? "The move is the app's, from the closes; why is your own Claude's reading of that day's pages, each named." : (x.note ?? "The move is the app's, from the closes.")}</p>
        </>
      ) : (
        <>
          <p className="text-footnote text-text-secondary">{reactionWaits(r)}</p>
          {r.expectedMove ? <p className="mt-2 text-footnote text-text-secondary">{againstPriced(r.expectedMove, null)}</p> : null}
        </>
      )}
    </div>
  );
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });

/**
 * One report after the results, in HCMP's order: the headline the app wrote
 * from the rules, what was filed, the quarter against a year before, the
 * class test and the rules on the new figures, the person's own triggers
 * and valuation, then their Claude's reading of the release with its pages.
 * How the stock took the results comes right after what was filed.
 */
/**
 * What was added to a thesis since the results: what the person's own Claude
 * wrote back with write_thesis, or a note of theirs, newest first.
 */
export function AddedReads({ reads, className }: { reads: readonly AddedRead[]; className?: string }) {
  if (!reads.length) return null;
  return (
    <ul className={cn("space-y-3", className)}>
      {reads.map((a, i) => (
        <li key={i}>
          <p className="text-caption text-text-tertiary">
            <span className="data">{longDate(a.at)}</span> · {a.source}
          </p>
          <p className="mt-0.5 text-subhead">{a.summary}</p>
          {a.changes ? <p className="mt-0.5 text-footnote text-text-secondary">Changed: {a.changes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** The figures the flow draws, left out of the table beside it. */
const FLOW_SHOWS = /^(Revenue|Cost of revenue|Gross (profit|margin)|Operating (income|margin)|Net (income|margin))$/;

export function EarningsReportCard({ r, added }: { r: EarningsReport; added?: readonly AddedRead[] }) {
  // Read from the thesis as the page opens, else as the report last laid it.
  const reads = added ?? r.detail?.added ?? [];
  const s = r.status === "release" && r.figuresFrom === "release" ? { label: "Results out, figures from the release", tone: "info" as const } : STATUS[r.status];
  // The flow carries revenue, the margins and the profits; the table keeps the rest (Hamza, 5 Nov 2026: the flow wherever it can replace a table of these).
  const flow = r.detail?.flow ?? null;
  const figures = flow ? r.figures.filter((f) => !FLOW_SHOWS.test(f.label)) : r.figures;
  const prior = figures.some((f) => f.prior);
  const killed = r.triggers.some((t) => t.kind === "kill" && t.met);
  return (
    <article id="report" className="card mb-8 scroll-mt-20 px-4 py-4 lg:px-6 lg:py-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={companyHref(r.symbol) as Route} className="data text-title-3 font-semibold text-accent-text hover:underline">
          {r.symbol}
        </Link>
        {r.name ? <span className="min-w-0 truncate text-subhead text-text-secondary">{r.name}</span> : null}
        <StatusPill tone={s.tone}>{s.label}</StatusPill>
        <StatusPill tone="neutral">{KIND_LABEL[r.kind]}</StatusPill>
      </div>
      <p className="mt-1 text-footnote text-text-secondary">
        Reported {longDate(r.date)}
        {r.time !== "unknown" ? `, ${TIME_LABEL[r.time].toLowerCase()}` : ""}
        {r.quarter ? `, ${quarterWords(r.quarter)}` : ""}
        {r.weight !== null ? ` · ${r.weight.toFixed(2)}% of the portfolio` : ""}
      </p>
      <p className={cn("mt-3 text-body", killed && "text-danger")}>{r.headline}</p>
      {r.sentence ? <p className="mt-1 text-footnote text-text-secondary">{r.sentence}</p> : null}
      {!r.figures.length && r.releaseNote ? <p className="mt-1 text-footnote text-text-secondary">{r.releaseNote}</p> : null}
      {r.earlierNote ? <p className="mt-1 text-footnote text-text-secondary">{r.earlierNote}</p> : null}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {r.release ? <Filed f={r.release} what="Results" /> : null}
        {r.filing ? <Filed f={r.filing} what="Figures" /> : null}
      </div>

      {r.status !== "failed" ? <ReactionBlock r={r} className="mt-5" /> : null}

      {flow ? (
        <div className="mt-5">
          <IncomeFlowChart title="Where the revenue went" subtitle={`${flow.from === "release" ? "From the release as printed" : "From the filings"}, against the same ${flow.basis === "quarter" ? "quarter" : "period"} a year before.`} views={[{ key: "q", word: "Quarter", flow, notes: r.detail?.flowNotes?.notes ?? [], notesNote: r.detail?.flowNotes?.note ?? null }]} />
        </div>
      ) : null}

      {figures.length ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">{flow ? "The rest of the quarter" : "The quarter"}{r.period ? ` · ${r.period}` : ""}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-footnote lg:text-subhead">
              <thead>
                <tr className="text-left text-caption text-text-tertiary">
                  <th className="py-1 pr-2 lg:pr-3 font-normal">{r.currency ? `In ${r.currency}` : "Figure"}</th>
                  <th className="py-1 pr-2 lg:pr-3 text-right font-normal">Quarter</th>
                  {prior ? <th className="py-1 pr-2 lg:pr-3 text-right font-normal">Quarter before</th> : null}
                  <th className="py-1 pr-2 lg:pr-3 text-right font-normal">Year ago</th>
                  <th className="py-1 text-right font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {figures.map((f) => (
                  <tr key={f.label} className="border-t border-hairline">
                    <td className="py-1.5 pr-2 lg:pr-3">{f.label}</td>
                    <td className="data py-1.5 pr-2 lg:pr-3 text-right">{f.now}</td>
                    {prior ? <td className="data py-1.5 pr-2 lg:pr-3 text-right text-text-secondary">{f.prior ?? "–"}</td> : null}
                    <td className="data py-1.5 pr-2 lg:pr-3 text-right text-text-secondary">{f.before ?? "–"}</td>
                    <td className="data py-1.5 text-right text-text-secondary">{figureChange(f)?.text ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-caption text-text-tertiary">
            {r.figuresFrom === "release"
              ? `From the release itself, each figure found printed in its text${r.releaseFigures?.dropped.length ? ` (${r.releaseFigures.dropped.length} the text does not print ${r.releaseFigures.dropped.length === 1 ? "was" : "were"} dropped)` : ""}; the ${r.release?.form === "6-K" ? "20-F" : "10-Q"}'s XBRL facts replace them when it lands.`
              : "From the company\u2019s XBRL facts at the SEC; nothing estimated."}
          </p>
        </div>
      ) : null}

      {r.tests.length ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">The Classification Test on the new figures</h3>
          <ul className="flex flex-wrap gap-2">
            {r.tests.map((t) => (
              <li key={t.label} className={cn("rounded-[10px] px-2.5 py-1 text-footnote", t.label === r.classNow ? "bg-accent-subtle text-accent-text" : "bg-surface-2 text-text-secondary")}>
                {t.label} <span className="data">{t.passes} of {t.of}</span>
                {t.holds ? " · holds" : ""}
              </li>
            ))}
          </ul>
          {r.classBefore && r.classBefore !== r.classNow ? <p className="mt-2 text-footnote text-warn">Before the results the tests gave {r.classBefore}.</p> : null}
        </div>
      ) : null}

      {r.rules.length ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">Rules on the new figures</h3>
          <ul className="space-y-1.5">
            {r.rules.map((x) => (
              <li key={`${x.section}${x.text}`} className="text-footnote">
                <StatusPill tone={x.status === "fail" ? "danger" : "warn"} className="mr-2">{x.status === "fail" ? "Fails" : "Near"}</StatusPill>
                {x.text} <span className="data text-text-secondary">{x.actual ?? "–"} against {x.limit}</span> <span className="text-text-tertiary">({x.section})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.triggers.length ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">Your triggers and kill signals</h3>
          <ul className="space-y-1.5">
            {r.triggers.map((t, i) => (
              <li key={i} className="text-footnote">
                <StatusPill tone={t.met === null ? "neutral" : t.met ? (t.kind === "kill" ? "danger" : "warn") : "ok"} className="mr-2">
                  {t.met === null ? "No reading" : t.met ? "Met" : "Not met"}
                </StatusPill>
                <span className="text-text-secondary">{t.kind === "kill" ? "Kill signal" : "Trigger"}:</span> {t.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.valuation ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">Your valuation</h3>
          {r.valuation.price !== null ? (
            <>
              <ValuationRange low={r.valuation.low} base={r.valuation.base} high={r.valuation.high} price={r.valuation.price} />
              <p className="data mt-1 text-caption text-text-secondary">
                Base {fmt(r.valuation.base)}
                {r.valuation.low !== null ? `, bear ${fmt(r.valuation.low)}` : ""}
                {r.valuation.high !== null ? `, bull ${fmt(r.valuation.high)}` : ""}, against {fmt(r.valuation.price)}.
              </p>
            </>
          ) : (
            <p className="data text-footnote text-text-secondary">Base {fmt(r.valuation.base)}; no price to set it against.</p>
          )}
        </div>
      ) : null}

      {r.commentary ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">What the release and the call said</h3>
          <p className="text-subhead">{r.commentary.summary}</p>
          {r.commentary.guidance && !r.call?.guidance.length ? (
            <p className="mt-2 text-subhead">
              <span className="text-text-secondary">Guidance: </span>
              {r.commentary.guidance}
            </p>
          ) : null}
          {r.commentary.points.length ? (
            <ul className="mt-2 space-y-1.5">
              {r.commentary.points.map((p, i) => (
                <li key={i} className="text-footnote">
                  {p.line}{" "}
                  <a href={p.source.url} target="_blank" rel="noreferrer" className="text-accent-text">
                    {p.source.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {r.commentary.unexpected.length ? (
            <div className="mt-4">
              <h3 className="section-header mb-2">What investors did not expect, and why</h3>
              <ul className="space-y-3">
                {r.commentary.unexpected.map((u, i) => (
                  <li key={i}>
                    <p className="text-subhead">{u.what}</p>
                    <p className="mt-1 text-footnote text-text-secondary">{u.why}</p>
                    <p className="mt-1 text-caption">
                      {u.sources.map((x, j) => (
                        <span key={j}>
                          {j ? " · " : ""}
                          <a href={x.url} target="_blank" rel="noreferrer" className="text-accent-text">
                            {x.title}
                          </a>
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-2 text-caption text-text-tertiary">Read by your own Claude from the web; every point names its page. The figures above are the filing&rsquo;s.</p>
        </div>
      ) : r.commentaryNote ? (
        <p className="mt-5 text-footnote text-text-secondary">{r.commentaryNote}</p>
      ) : null}
      <CallBlock r={r} />
      {reads.length ? (
        <div className="mt-5">
          <h3 className="section-header mb-2">Added to the thesis since the results</h3>
          <AddedReads reads={reads} />
          <p className="mt-2 text-caption text-text-tertiary">
            Written to{" "}
            <Link href={`/theses/${encodeURIComponent(r.symbol)}` as Route} className="text-accent-text">
              the thesis
            </Link>{" "}
            by your own Claude or by you; the figures above are the filing&rsquo;s.
          </p>
        </div>
      ) : null}
      <p className="mt-4 text-caption text-text-tertiary">Updated {longDate(r.updatedAt.slice(0, 10))}. Not investment advice.</p>
    </article>
  );
}
