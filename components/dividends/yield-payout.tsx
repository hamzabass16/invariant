"use client";

import * as React from "react";

import { ColumnGroups } from "@/components/charts/column-groups";
import { cn } from "@/lib/utils";

type Row = { symbol: string; yieldPct: number | null; yieldOnCostPct: number | null; payoutPct: number | null };

/**
 * Each payer's yield beside its yield on cost, or its payout ratio, switched
 * on the card (Hamza, 19 Oct 2026, after Snowball's Yield/Payout). One axis
 * either way: two measures of different kinds are never drawn together.
 */
export function YieldPayout({ rows, badge }: { rows: Row[]; badge?: React.ReactNode }) {
  const [view, setView] = React.useState<"yield" | "payout">("yield");
  const shown = view === "yield" ? rows : rows.filter((r) => r.payoutPct !== null);
  const toggle = (
    <span className="mt-2 inline-flex rounded-[8px] bg-surface-2 p-0.5" role="group" aria-label="Yield or payout ratio">
      {(["yield", "payout"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-7 rounded-[6px] px-2.5 text-caption font-medium", view === v ? "bg-surface text-text" : "text-text-secondary")}>
          {v === "yield" ? "Yield" : "Payout ratio"}
        </button>
      ))}
    </span>
  );
  return (
    <ColumnGroups
      title={view === "yield" ? "Yield and yield on cost" : "Payout ratio"}
      badge={badge}
      subtitle={
        <>
          {view === "yield" ? "Each payer's dividend over its price today, beside its dividend over what you paid for it." : "Each payer's dividends over its earnings, from its filings; above 100% it pays out more than it earns."}
          <br />
          {toggle}
        </>
      }
      labels={shown.map((r) => r.symbol)}
      series={view === "yield" ? [{ label: "Yield", color: "var(--series-hcmp)", values: rows.map((r) => r.yieldPct) }, { label: "Yield on cost", color: "var(--series-qqq)", values: rows.map((r) => r.yieldOnCostPct) }] : [{ label: "Payout ratio", color: "var(--series-hcmp)", values: shown.map((r) => r.payoutPct) }]}
      format={view === "yield" ? "pct2" : "pct0"}
      labelHead="Company"
      tableCaption={view === "yield" ? "Each payer's yield and yield on cost" : "Each payer's payout ratio"}
      slanted={shown.length > 8}
    />
  );
}
