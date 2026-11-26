"use client";

import { LineChart } from "@/components/charts/line-chart";
import { InfoTip } from "@/components/ui/info-tip";
import { StatusPill } from "@/components/ui/status";
import { EXTRA_INFO } from "@/lib/metric-info";
import { cn } from "@/lib/utils";
import { FORWARD_HISTORY, HISTORY_LABEL, HISTORY_METRICS, historyWords, type HistoryMetric, type ValuationHistory } from "@/lib/valuation-history";

const LINE = "var(--series-hcmp)";
const MEDIAN = "var(--text-tertiary)";

/** The analysts' consensus forward P/E beside the filings' line (Hamza, 23 Oct 2026: both): read now only, so a figure and its sentence, never a line. */
export type ConsensusNow = { pe: number | null; words: string; readAt: string };
export type Histories = { byMetric: Record<HistoryMetric, ValuationHistory | null>; note: string | null; consensus?: ConsensusNow | null; price?: number | null };

/**
 * The valuation metric over five years beside the calculator (Hamza, 20 Oct
 * 2026): the multiple at each week's close on the trailing figure known that
 * week, the five-year median as a flat line, and where today sits. The tab
 * follows the method chosen in the calculator until another is picked here;
 * the market size or a DCF shows its trailing twin. A forward multiple is
 * the filings' figure carried a year on; on Fwd P/E the analysts'
 * consensus stands beside it, labelled as theirs.
 */
export function ValuationHistoryCard({ histories, metric, onMetric, followed }: { histories: Histories | null; metric: HistoryMetric; onMetric: (m: HistoryMetric) => void; followed: string | null }) {
  const h = histories?.byMetric[metric] ?? null;
  const label = HISTORY_LABEL[metric];
  const consensus = metric === "forward_pe" ? (histories?.consensus ?? null) : null;
  const consensusLine = consensus ? (
    <p className="mt-2 px-1 text-footnote text-text-secondary">
      <span className="font-medium text-text">Analysts&apos; consensus{consensus.pe !== null ? <span className="data"> {consensus.pe.toFixed(1)}x</span> : null}.</span> <InfoTip id="history-consensus" label="the analysts' consensus" text={EXTRA_INFO.consensus_ntm} align="start" /> {consensus.words} Read {consensus.readAt.slice(0, 10)}; their estimate, not the app&apos;s.
    </p>
  ) : metric === "forward_pe" ? <p className="mt-2 px-1 text-caption text-text-tertiary">No analysts&apos; consensus is read for this company yet; it is read with the filings for the companies held, watched or opened.</p> : null;
  const tabs = (
    <span className="mt-2 inline-flex flex-wrap rounded-[8px] bg-surface-2 p-0.5" role="tablist" aria-label="Valuation metric">
      {HISTORY_METRICS.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={m === metric} onClick={() => onMetric(m)} className={cn("h-8 min-w-[3.25rem] rounded-[6px] px-2 text-caption font-medium", m === metric ? "bg-surface text-text" : "text-text-secondary")}>
          {HISTORY_LABEL[m]}
        </button>
      ))}
    </span>
  );
  if (!h || !h.now) {
    return (
      <div className="card px-4 py-3">
        <p className="section-header">{label} over five years</p>
        {tabs}
        <p className="mt-3 text-footnote text-text-secondary">{h ? historyWords(h) : (histories?.note ?? "The closes or the filings' quarterly figures are not read yet; the chart fills after the next filings read.")}</p>
        {consensusLine}
      </div>
    );
  }
  const dates = h.points.map((p) => p.date);
  return (
    <div>
      <LineChart
        title={`${label} over five years`}
        subtitle={
          <>
            <span className="block">{followed ?? (FORWARD_HISTORY.has(metric) ? "Each week's close over the trailing figure known that week, carried a year on at revenue growth; a week above 100x is left out." : "Each week's close over the trailing figure known that week.")}</span>
            {tabs}
          </>
        }
        dates={dates}
        series={[
          { key: "multiple", label, color: LINE, values: h.points.map((p) => p.value) },
          { key: "median", label: "Five-year median", color: MEDIAN, values: h.points.map(() => h.median) },
        ]}
        format="ratio"
        height={240}
        tableCaption={`${label} at each week's close`}
        tableEvery={4}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Now", v: h.now.value },
          { k: "Low", v: h.low?.value ?? null, d: h.low?.date },
          { k: "Median", v: h.median },
          { k: "High", v: h.high?.value ?? null, d: h.high?.date },
        ].map((x) => (
          <div key={x.k} className="rounded-[10px] bg-surface-2 px-3 py-2">
            <p className="section-header">{x.k}</p>
            <p className="data mt-0.5 text-subhead font-semibold">{x.v === null ? "n/a" : `${x.v.toFixed(1)}x`}</p>
            {x.d ? <p className="data text-caption text-text-tertiary">{x.d}</p> : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-2 px-1">
        {h.nearLow ? <StatusPill tone="info">Near its five-year low</StatusPill> : null}
        <p className="min-w-0 flex-1 text-footnote text-text-secondary">
          {historyWords(h)} <InfoTip id={`history-${metric}`} label={`${label} over five years`} text={EXTRA_INFO.history} align="end" />
        </p>
      </div>
      {consensusLine}
      {histories?.note ? <p className="mt-1 px-1 text-caption text-text-tertiary">{histories.note}</p> : null}
    </div>
  );
}
