"use client";

import { useState } from "react";

import { Columns } from "@/components/charts/columns";
import type { Format } from "@/components/charts/frame";
import { ValuationHistoryCard, type Histories } from "@/components/theses/valuation-history";
import { formatter } from "@/components/charts/frame";
import { CHART_PERIOD_LABEL, CHART_PERIODS, chartHeadline, type ChartFormat, type ChartPeriod, type ChartSpec } from "@/lib/company";
import { cn } from "@/lib/utils";
import type { HistoryMetric } from "@/lib/valuation-history";

const COLOR: Record<ChartFormat, string> = { money: "var(--series-hcmp)", perShare: "var(--series-hcmp)", pct: "var(--series-qqq)", shares: "var(--text-secondary)" };

function formatOf(f: ChartFormat, ccy: string): Format {
  if (f === "money") return `compact:${ccy}`;
  if (f === "perShare") return `perShare:${ccy}`;
  if (f === "pct") return "pct1";
  return "compact";
}

/** A chart's headline: the latest figure large, its change on a year before in the move colour, with its sign. */
function Headline({ c, period, ccy }: { c: ChartSpec; period: ChartPeriod; ccy: string }) {
  const h = chartHeadline(c, period);
  if (h.latest === null) return null;
  const f = formatter(formatOf(c.format, ccy));
  const ch = h.change;
  const tone = ch === null || ch === 0 ? "text-text-secondary" : ch > 0 ? "text-[color:var(--move-up)]" : "text-[color:var(--move-down)]";
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="data text-headline font-semibold text-text-primary">{f(h.latest)}</span>
      <span className="data text-caption text-text-tertiary">{h.label}</span>
      {ch !== null ? <span className={cn("data text-footnote", tone)} title={`${h.unit === "pts" ? "Points" : "Change"} ${h.words}`}>{`${ch > 0 ? "+" : ch < 0 ? "-" : ""}${Math.abs(ch).toFixed(1)}${h.unit === "pts" ? " pts" : "%"} ${period === "annual" ? "YoY" : "on a year"}`}</span> : null}
    </span>
  );
}

/**
 * The company's figures as a ruled grid of small charts (Hamza, 20 Oct 2026,
 * after Qualtrim; a grid of its own, 21 Nov 2026): quarterly and annual from
 * the report kept after its results, per share over the trailing twelve
 * months from the filings read, a switch between them; each chart with its
 * latest figure and its change on a year before. A period with nothing kept
 * says what would fill it.
 */
export function CompanyCharts({ charts, ccy, empty }: { charts: Record<ChartPeriod, ChartSpec[]>; ccy: string; empty: Record<ChartPeriod, string> }) {
  const first = CHART_PERIODS.find((p) => charts[p].length) ?? "quarterly";
  const [period, setPeriod] = useState<ChartPeriod>(first);
  const shown = charts[period];
  return (
    <div>
      <div className="mb-3 flex justify-center">
        <div className="inline-flex rounded-[10px] bg-surface-2 p-0.5" role="tablist" aria-label="Period">
          {CHART_PERIODS.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={p === period} onClick={() => setPeriod(p)} className={cn("h-9 rounded-[8px] px-3 text-footnote font-medium", p === period ? "bg-accent text-white" : "text-text-secondary")}>
              {CHART_PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <div className="term-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((c) => (
            <div key={c.key} className="term-cell">
              <Columns title={c.title} subtitle={<Headline c={c} period={period} ccy={ccy} />} labels={c.labels} values={c.values} color={COLOR[c.format]} format={formatOf(c.format, ccy)} tableCaption={`${c.title}, ${CHART_PERIOD_LABEL[period].toLowerCase()}`} height={140} />
            </div>
          ))}
        </div>
      ) : (
        <p className="card px-4 py-3 text-footnote text-text-secondary">{empty[period]}</p>
      )}
    </div>
  );
}

/** The five-year valuation chart with its own tabs, for a page with no calculator beside it. */
export function CompanyValuation({ histories, initial }: { histories: Histories | null; initial: HistoryMetric }) {
  const [metric, setMetric] = useState<HistoryMetric>(initial);
  return <ValuationHistoryCard histories={histories} metric={metric} onMetric={setMetric} followed={null} />;
}
