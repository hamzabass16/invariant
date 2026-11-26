"use client";

import * as React from "react";

import { ChartFrame, ChartTable, Tooltip, niceTicks, useWidth, type LegendItem, formatter, type Format, insideX, monoPx } from "@/components/charts/frame";

export type BarGroup = { key: string; label: string; values: (number | null)[]; note?: string | null };
export type BarSeries = { label: string; color: string };

/**
 * Horizontal grouped bars, one group per row (a period), one bar per series.
 * Bars are at most 24px thick with a 4px rounded data-end and a 2px surface
 * gap; the first series (the portfolio) is labelled at its tip and the table
 * carries every value. A null value draws no bar and says why in the tooltip.
 */
export function GroupedBars({
  title,
  subtitle,
  badge,
  groups,
  series,
  format: formatKind,
  tableCaption,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  groups: BarGroup[];
  series: BarSeries[];
  format: Format;
  tableCaption: string;
}) {
  const format = formatter(formatKind);
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const bar = Math.min(16, Math.max(8, Math.floor(56 / series.length) - 2));
  const w = Math.max(240, width);
  // The names sit in a left column that fits the longest; where that column would take more than two fifths of a
  // narrow chart, each name goes on its own line above its bars instead, so the bars keep the width.
  const labelCol = Math.max(96, Math.ceil(Math.max(0, ...groups.map((g) => g.label.length * 7.2)) + 14));
  const stacked = labelCol > w * 0.4;
  const labelH = stacked ? 18 : 0;
  const groupH = series.length * (bar + 2) + 12 + labelH;
  // Room for the widest value at the bar's end.
  const pad = { l: stacked ? 12 : labelCol, r: Math.max(64, Math.ceil(Math.max(0, ...groups.flatMap((g) => g.values.filter((v): v is number => v !== null).map((v) => monoPx(format(v), 11)))) + 10)), t: 6, b: 22 };
  const iw = w - pad.l - pad.r;
  const height = pad.t + groups.length * groupH + pad.b;

  const all = groups.flatMap((g) => g.values.filter((v): v is number => v !== null));
  all.push(0);
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 4);
  const lo = Math.min(...all, ticks[0] ?? 0);
  const hi = Math.max(...all, ticks[ticks.length - 1] ?? 0);
  const x = (v: number) => pad.l + (hi === lo ? 0 : ((v - lo) / (hi - lo)) * iw);
  const x0 = x(0);
  // Axis values, those that would touch a kept neighbour left out (zero is always kept).
  const tickAt = (t: number) => {
    const tw = monoPx(format(t), 11);
    const c = insideX(x(t), tw, w);
    return [c - tw / 2, c + tw / 2];
  };
  const shownTicks: number[] = [];
  for (const t of [...ticks].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : 0))) {
    const [a, b] = tickAt(t);
    if (shownTicks.every((k) => b + 8 <= tickAt(k)[0] || a >= tickAt(k)[1] + 8)) shownTicks.push(t);
  }

  const legend: LegendItem[] = series.map((s) => ({ label: s.label, color: s.color, kind: "rect" }));
  const rows = groups.map((g) => [g.label, ...g.values.map((v) => (v === null ? g.note ?? "n/a" : format(v)))]);

  return (
    <ChartFrame title={title} subtitle={subtitle} badge={badge} legend={legend} table={<ChartTable caption={tableCaption} head={["Period", ...series.map((s) => s.label)]} rows={rows} />}>
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={`${title}, ${groups.length} periods.`} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={pad.t} y2={height - pad.b} stroke={t === 0 ? "var(--text-tertiary)" : "var(--hairline)"} strokeWidth={1} />
              {shownTicks.includes(t) ? (
                <text x={insideX(x(t), monoPx(format(t), 11), w)} y={height - 6} textAnchor="middle" className="data" fontSize={11} fill="var(--text-tertiary)">
                  {format(t)}
                </text>
              ) : null}
            </g>
          ))}
          {groups.map((g, gi) => {
            const top = pad.t + gi * groupH + 7 + labelH;
            return (
              <g
                key={g.key}
                tabIndex={0}
                role="img"
                aria-label={`${g.label}: ${series.map((s, si) => `${s.label} ${g.values[si] === null ? g.note ?? "n/a" : format(g.values[si] as number)}`).join(", ")}`}
                className="outline-none"
                onPointerEnter={() => setHover(gi)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(gi)}
                onBlur={() => setHover(null)}
              >
                <rect x={0} y={pad.t + gi * groupH} width={w} height={groupH} fill={hover === gi ? "var(--surface-2)" : "transparent"} />
                {stacked ? (
                  <text x={pad.l + 5} y={pad.t + gi * groupH + 7} dy="0.8em" fontSize={12} fill="var(--text-secondary)">
                    {g.label}
                  </text>
                ) : (
                  <text x={pad.l - 8} y={top + (series.length * (bar + 2)) / 2} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--text-secondary)">
                    {g.label}
                  </text>
                )}
                {series.map((s, si) => {
                  const v = g.values[si];
                  const yb = top + si * (bar + 2);
                  if (v === null) {
                    return si === 0 ? (
                      <text key={s.label} x={x0 + 6} y={yb + bar / 2} dy="0.32em" fontSize={11} fill="var(--text-tertiary)">
                        {g.note ?? "n/a"}
                      </text>
                    ) : null;
                  }
                  const left = Math.min(x0, x(v));
                  const len = Math.max(0, Math.abs(x(v) - x0));
                  const rr = Math.min(4, len / 2);
                  // Rounded at the data end only, square at the baseline.
                  const d =
                    v >= 0
                      ? `M${left} ${yb} h${Math.max(0, len - rr)} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${bar - 2 * rr} a${rr} ${rr} 0 0 1 -${rr} ${rr} h-${Math.max(0, len - rr)} Z`
                      : `M${x0} ${yb} h-${Math.max(0, len - rr)} a${rr} ${rr} 0 0 0 -${rr} ${rr} v${bar - 2 * rr} a${rr} ${rr} 0 0 0 ${rr} ${rr} h${Math.max(0, len - rr)} Z`;
                  return (
                    <g key={s.label}>
                      <path d={d} fill={s.color} stroke="var(--surface)" strokeWidth={2} opacity={hover === null || hover === gi ? 1 : 0.7} />
                      {si === 0
                        ? (() => {
                            // A loss's value sits left of its bar, or right of zero when the bar reaches too near the left edge to hold it.
                            const out = v >= 0 || x(v) - 6 - monoPx(format(v), 11) >= (stacked ? 0 : pad.l);
                            return (
                              <text x={v >= 0 ? x(v) + 6 : out ? x(v) - 6 : x0 + 6} y={yb + bar / 2} dy="0.32em" textAnchor={v >= 0 || !out ? "start" : "end"} className="data" fontSize={11} fill="var(--text-secondary)">
                                {format(v)}
                              </text>
                            );
                          })()
                        : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover !== null && groups[hover] ? (
          <Tooltip
            x={width * 0.5}
            y={((pad.t + hover * groupH) / height) * (height)}
            width={width}
            title={groups[hover].label}
            rows={series.map((s, si) => ({ label: s.label, color: s.color, value: groups[hover].values[si] === null ? groups[hover].note ?? "n/a" : format(groups[hover].values[si] as number) }))}
          />
        ) : null}
      </div>
    </ChartFrame>
  );
}
