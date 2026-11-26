"use client";

import * as React from "react";

import { ChartFrame, ChartTable, Tooltip, formatter, insideX, monoPx, niceTicks, useWidth, type Format } from "@/components/charts/frame";

export type ColumnSeries = { label: string; color: string; values: (number | null)[] };

/**
 * Columns along a row of categories (months, companies), one or a few series
 * side by side in each, on one axis from zero. Each column is at most 24px
 * thick with a 4px rounded cap, a square base and a 2px surface gap; a single
 * series carries its value on the cap when every value fits its slot. The
 * category names are shown every few slots when they would touch, turned
 * when `slanted`; the legend names two or more series; the table carries
 * every value.
 */
export function ColumnGroups({
  title,
  subtitle,
  badge,
  labels,
  series,
  format: formatKind,
  tableCaption,
  labelHead = "",
  height = 200,
  slanted = false,
  after,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  labels: string[];
  series: ColumnSeries[];
  format: Format;
  tableCaption: string;
  labelHead?: string;
  height?: number;
  slanted?: boolean;
  after?: React.ReactNode;
}) {
  const format = formatter(formatKind);
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const n = labels.length;
  const k = Math.max(1, series.length);
  const present = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const ticks = niceTicks(Math.min(0, ...present), Math.max(0, ...present, 0.0001), 3);
  const widestLabel = Math.max(0, ...labels.map((l) => monoPx(l, 10)));
  const bottom = slanted ? Math.min(64, Math.ceil(widestLabel * 0.72) + 14) : 22;
  const pad = { l: Math.max(40, Math.ceil(Math.max(0, ...ticks.map((t) => monoPx(format(t), 10))) + 10)), r: 8, t: 18, b: bottom };
  const w = Math.max(200, width);
  const iw = w - pad.l - pad.r;
  const h = height + bottom - 22;
  const ih = h - pad.t - pad.b;
  const lo = Math.min(0, ...present, ticks[0] ?? 0);
  const hi = Math.max(0, ...present, ticks[ticks.length - 1] ?? 0);
  const y = (v: number) => pad.t + (hi === lo ? ih : ((hi - v) / (hi - lo)) * ih);
  const slot = n ? iw / n : iw;
  const bar = Math.min(24, Math.max(3, (slot - 6) / k - 2));
  const groupW = k * bar + (k - 1) * 2;
  const x = (i: number, j: number) => pad.l + i * slot + (slot - groupW) / 2 + j * (bar + 2);
  const capLabels = k === 1 && present.length > 0 && series[0].values.every((v) => v === null || monoPx(format(v), 10) <= slot - 2);
  const every = slanted ? Math.max(1, Math.ceil(13 / Math.max(1, slot))) : Math.max(1, Math.ceil((widestLabel + 6) / Math.max(1, slot)));

  const path = (xi: number, v: number) => {
    const top = Math.min(y(v), y(0));
    const hh = Math.abs(y(v) - y(0));
    const rr = Math.min(4, hh / 2, bar / 2);
    return v >= 0
      ? `M${xi} ${y(0)} v-${Math.max(0, hh - rr)} a${rr} ${rr} 0 0 1 ${rr} -${rr} h${bar - 2 * rr} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${Math.max(0, hh - rr)} Z`
      : `M${xi} ${top} v${Math.max(0, hh - rr)} a${rr} ${rr} 0 0 0 ${rr} ${rr} h${bar - 2 * rr} a${rr} ${rr} 0 0 0 ${rr} -${rr} v-${Math.max(0, hh - rr)} Z`;
  };

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      badge={badge}
      after={after}
      legend={series.length > 1 ? series.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const })) : undefined}
      table={<ChartTable caption={tableCaption} head={[labelHead, ...series.map((s) => s.label)]} rows={labels.map((l, i) => [l, ...series.map((s) => (s.values[i] === null ? "n/a" : format(s.values[i] as number)))])} />}
    >
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${series.map((s) => (s.values[i] === null ? "n/a" : format(s.values[i] as number))).join(" / ")}`).join(", ")}.`} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--text-tertiary)" : "var(--hairline)"} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="data" fontSize={10} fill="var(--text-tertiary)">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = pad.l + i * slot + slot / 2;
            return (
              <g key={`${l}-${i}`} tabIndex={0} role="img" aria-label={`${l}: ${series.map((s) => `${s.label} ${s.values[i] === null ? "n/a" : format(s.values[i] as number)}`).join(", ")}`} className="outline-none" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                {series.map((s, j) => {
                  const v = s.values[i];
                  if (v === null || v === 0) return null;
                  return <path key={s.label} d={path(x(i, j), v)} fill={s.color} stroke="var(--surface)" strokeWidth={1} />;
                })}
                {capLabels && series[0].values[i] ? (
                  <text x={insideX(cx, monoPx(format(series[0].values[i] as number), 10), w)} y={(series[0].values[i] as number) >= 0 ? y(series[0].values[i] as number) - 5 : y(0) - 5} textAnchor="middle" className="data" fontSize={10} fill="var(--text-secondary)">
                    {format(series[0].values[i] as number)}
                  </text>
                ) : null}
                {i % every === 0 ? (
                  slanted ? (
                    <text x={cx} y={h - pad.b + 12} textAnchor="end" transform={`rotate(-45 ${cx} ${h - pad.b + 12})`} className="data" fontSize={10} fill="var(--text-tertiary)">
                      {l}
                    </text>
                  ) : (
                    <text x={insideX(cx, monoPx(l, 10), w)} y={h - 6} textAnchor="middle" className="data" fontSize={10} fill="var(--text-tertiary)">
                      {l}
                    </text>
                  )
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? <Tooltip x={((pad.l + hover * slot + slot / 2) / w) * width} y={pad.t} width={width} title={labels[hover]} rows={series.map((s) => ({ label: s.label, color: s.color, value: s.values[hover] === null ? "n/a" : format(s.values[hover] as number) }))} /> : null}
      </div>
    </ChartFrame>
  );
}
