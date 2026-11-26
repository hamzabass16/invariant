"use client";

import { useState } from "react";

import { StackedColumns } from "@/components/charts/stacked-columns";
import { segmentChart } from "@/lib/company";
import { segmentFamilies, separateHistory, type SegmentFamily, type SegmentHistory } from "@/lib/edgar-segments";
import { cn } from "@/lib/utils";

// The segment donut's fixed order: four hues, then the rest as one grey part.
const HUES = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)"] as const;
const OTHER = "var(--arch-none)";

const FAMILY_WORDS = { segment: "By segment", product: "By product", geography: "By geography" } as const;
const TITLE_WORDS = { segment: "by segment", product: "by product", geography: "by geography" } as const;
const PART_WORDS = { segment: "segments", product: "products and services", geography: "places" } as const;
type Family = SegmentFamily;
const PERIOD_WORDS = { quarterly: "Quarterly", annual: "Annually" } as const;

function Switch<T extends string>({ value, options, words, onChange, label }: { value: T; options: readonly T[]; words: Record<T, string>; onChange: (v: T) => void; label: string }) {
  if (options.length < 2) return null;
  return (
    <div className="inline-flex rounded-[10px] bg-surface-2 p-0.5" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="tab" aria-selected={o === value} onClick={() => onChange(o)} className={cn("h-8 rounded-[8px] px-3 text-footnote font-medium", o === value ? "bg-accent text-white" : "text-text-secondary")}>
          {words[o]}
        </button>
      ))}
    </div>
  );
}

/**
 * Revenue by segment, by product or by geography, stacked (Hamza, 4 Nov 2026, after Qualtrim: "each
 * segment of revenue, and I can hover between them and see how much that is,
 * as a percentage of the whole bar"): the reported segments or the products
 * the revenue note breaks out, by quarter or by year, from the company's own
 * 10-Qs and annual report. A fourth quarter is the year less its first three,
 * and the note says which columns are.
 */
export function SegmentRevenue({ history: kept, ccy, only }: { history: SegmentHistory; ccy: string; only?: readonly Family[] }) {
  // Never places beside businesses in one column: segments, products and geography each their own (Hamza, 5 Nov 2026).
  const history = separateHistory(kept);
  const families = segmentFamilies(history).filter((f) => !only || only.includes(f));
  const [chosen, setFamily] = useState<Family>(families[0] ?? "segment");
  const family = families.includes(chosen) ? chosen : (families[0] ?? "segment");
  const series = history[family];
  const periods = (["quarterly", "annual"] as const).filter((p) => ((p === "quarterly" ? series?.quarters.length : series?.years.length) ?? 0) >= 2);
  const [period, setPeriod] = useState<"quarterly" | "annual">(periods.includes("quarterly") ? "quarterly" : "annual");
  const shownPeriod = periods.includes(period) ? period : (periods[0] ?? "annual");
  const chart = series ? segmentChart(shownPeriod === "quarterly" ? series.quarters : series.years, shownPeriod) : null;
  if (!families.length || !chart) return null;
  const money = /^[A-Z]{3}$/.test(history.currency ?? "") ? history.currency! : ccy;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
        {<Switch value={family} options={families} words={FAMILY_WORDS} onChange={setFamily} label="Lines" />}
        <Switch value={shownPeriod} options={periods} words={PERIOD_WORDS} onChange={setPeriod} label="Period" />
      </div>
      <StackedColumns
        title={`Revenue ${TITLE_WORDS[family]}`}
        subtitle={`Each column is the ${shownPeriod === "quarterly" ? "quarter" : "year"}'s revenue in its reported ${PART_WORDS[family]}; hover a column for each part's share of it and its growth on a year.`}
        labels={chart.labels}
        stacks={chart.parts.map((p, i) => ({ label: p.label, color: p.other ? OTHER : (HUES[i] ?? OTHER), values: p.values }))}
        growth={chart.growth}
        format={`compact:${money}`}
        tableCaption={`Revenue ${TITLE_WORDS[family]}, ${PERIOD_WORDS[shownPeriod].toLowerCase()}`}
        labelHead={shownPeriod === "quarterly" ? "Quarter" : "Year"}
        after={
          <p className="mt-2 text-caption text-text-tertiary">
            From the company&apos;s own 10-Qs and annual report, as filed{chart.derived.length ? `; ${chart.derived.join(", ")} ${chart.derived.length === 1 ? "is" : "are"} the year less its first three quarters, which no filing prints by itself` : ""}.{history.note ? ` ${history.note}` : ""}
          </p>
        }
      />
    </div>
  );
}
