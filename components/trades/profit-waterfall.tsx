"use client";

import { ChartFrame, ChartTable, formatter } from "@/components/charts/frame";
import type { ProfitSources } from "@/lib/trades";

const GAIN = "var(--series-hcmp)";
const COST = "var(--series-spy)";
const TOTAL = "var(--text-secondary)";

/**
 * Where the profit came from, as a waterfall laid on its side (Hamza, 20 Oct
 * 2026): one row a source, each bar starting where the one above it ended,
 * so the last row, the total, is where they all arrive. A row on its side
 * keeps every label whole on a phone. Each row carries its figure; the table
 * view holds the same figures and the running total.
 */
export function ProfitWaterfall({ profit, ccy, title, subtitle, footer }: { profit: ProfitSources; ccy: string; title: string; subtitle: string; footer: string }) {
  const fmt = formatter(`cents:${ccy}`);
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmt(Math.abs(v))}`;
  const rows: { label: string; from: number; to: number; value: number; total?: boolean; read: boolean }[] = [];
  let run = 0;
  for (const s of profit.steps) {
    rows.push({ label: s.label, from: run, to: run + s.value, value: s.value, read: s.read });
    run += s.value;
  }
  rows.push({ label: "Total profit", from: 0, to: profit.total, value: profit.total, total: true, read: true });
  const lo = Math.min(0, ...rows.flatMap((r) => [r.from, r.to]));
  const hi = Math.max(0, ...rows.flatMap((r) => [r.from, r.to]));
  const span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;
  const zero = at(0);
  return (
    <ChartFrame
      className="mb-3"
      title={title}
      subtitle={subtitle}
      legend={[
        { label: "Adds to the profit", color: GAIN, kind: "rect" },
        { label: "Takes from it", color: COST, kind: "rect" },
        { label: "Total", color: TOTAL, kind: "rect" },
      ]}
      table={
        <ChartTable
          caption={`${title}: each source of profit and the running total`}
          head={["Source", "Amount", "Running total"]}
          rows={rows.map((r) => [r.label, <span key="v" className="data">{r.read ? signed(r.value) : "n/a"}</span>, <span key="t" className="data">{signed(r.to)}</span>])}
        />
      }
      after={<p className="mt-3 text-footnote text-text-tertiary">{footer}</p>}
    >
      <ol className="space-y-1.5" aria-label={`${title}, row by row`}>
        {rows.map((r) => {
          const left = at(Math.min(r.from, r.to));
          // Nothing is drawn for a zero or an unread source.
          const width = r.read && r.value !== 0 ? Math.max(0.6, Math.abs(at(r.to) - at(r.from))) : 0;
          const color = r.total ? TOTAL : r.value >= 0 ? GAIN : COST;
          return (
            <li key={r.label} className={`grid grid-cols-[minmax(0,6.75rem)_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_7rem] ${r.total ? "mt-2 border-t border-hairline pt-2" : ""}`}>
              <span className={`text-footnote leading-tight ${r.total ? "font-medium text-text" : "text-text-secondary"}`}>{r.label}</span>
              <span className="relative block h-6" aria-hidden>
                <span className="absolute inset-y-0 w-px bg-hairline" style={{ left: `${zero}%` }} />
                {width ? <span className="absolute inset-y-0.5 rounded-[4px]" style={{ left: `${left}%`, width: `${width}%`, background: color }} /> : null}
              </span>
              <span className={`data text-right text-footnote ${r.total ? "font-medium text-text" : r.read ? "text-text-secondary" : "text-text-tertiary"}`}>{r.read ? signed(r.value) : "n/a"}</span>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
