"use client";

import * as React from "react";

import { Donut, type Slice } from "@/components/charts/donut";
import type { LegendItem } from "@/components/charts/frame";
import { SliceBars } from "@/components/charts/slice-bars";
import { cn } from "@/lib/utils";

export type DonutView = {
  key: string;
  tab: string;
  title: string;
  subtitle: string;
  slices: Slice[];
  legend: LegendItem[];
  centre: { value: string; label: string };
  labelFrom?: number;
  tableCaption: string;
  tableHead: string[];
  /** A short figure beside each slice's share in the list: its value, its count. */
  values?: Record<string, string>;
};

/**
 * One large donut card with a switch between its views (Hamza, 19 Oct 2026,
 * after Snowball's Diversification: Sectors, Classes, Currencies, Regions):
 * the ring on the left, the slices as a list with bars on the right, the
 * table view for whichever view is on. Each view is a slot the methodology
 * switches on (lib/ontology.ts); one alone draws no switch.
 */
export function DonutTabs({ views, badge, id }: { views: DonutView[]; badge?: React.ReactNode; id?: string }) {
  const [key, setKey] = React.useState(views[0]?.key ?? "");
  const v = views.find((x) => x.key === key) ?? views[0];
  if (!v) return null;
  const tabs =
    views.length > 1 ? (
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="What the donut shows">
        {views.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={x.key === v.key} onClick={() => setKey(x.key)} className={cn("h-9 rounded-full px-4 text-subhead font-medium motion-safe:transition-colors", x.key === v.key ? "bg-text text-[var(--bg)]" : "bg-surface-2 text-text-secondary hover:text-text")}>
            {x.tab}
          </button>
        ))}
      </div>
    ) : null;
  return (
    <div id={id} className="mb-8 scroll-mt-20">
      <Donut
        key={v.key}
        title={v.title}
        badge={badge}
        subtitle={v.subtitle}
        slices={v.slices}
        legend={v.legend}
        centre={v.centre}
        labelFrom={v.labelFrom ?? 2}
        tableCaption={v.tableCaption}
        tableHead={v.tableHead}
        before={tabs}
        aside={<SliceBars slices={v.slices} value={v.values ? (s) => v.values![s.key] ?? null : undefined} />}
      />
    </div>
  );
}
