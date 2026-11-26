"use client";

import * as React from "react";

import { ChartFrame, ChartTable, Tooltip, niceTicks, useWidth, formatter, type Format, insideX, monoPx } from "@/components/charts/frame";

/**
 * A few columns, one series: a fiscal-year figure per column. Columns are at
 * most 24px thick with a 4px rounded cap and a square base, grow from the zero
 * line, and carry their value on the cap when there are six or fewer (a
 * column below zero carries it just above the zero line, clear of the axis's
 * labels). A null year draws nothing and says "n/a" in the table.
 */
export function Columns({
  title,
  subtitle,
  badge,
  labels,
  values,
  color,
  format: formatKind,
  tableCaption,
  height = 160,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  labels: string[];
  values: (number | null)[];
  color: string;
  format: Format;
  tableCaption: string;
  height?: number;
}) {
  const format = formatter(formatKind);
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const n = labels.length;
  const present = values.filter((v): v is number => v !== null);
  const ticks = niceTicks(Math.min(0, ...present), Math.max(0, ...present), 3);
  // Room for the widest tick, so "$150bn" is never cut at the left edge.
  const pad = { l: Math.max(40, Math.ceil(Math.max(0, ...ticks.map((t) => monoPx(format(t), 10))) + 10)), r: 8, t: 18, b: 22 };
  const w = Math.max(160, width);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const lo = Math.min(0, ...present, ticks[0] ?? 0);
  const hi = Math.max(0, ...present, ticks[ticks.length - 1] ?? 0);
  const y = (v: number) => pad.t + (hi === lo ? ih : ((hi - v) / (hi - lo)) * ih);
  const slot = n ? iw / n : iw;
  // Never wider than its slot, so a long run of columns (sixty rotations, say) stays one column a slot.
  const bar = Math.max(1, Math.min(24, slot >= 10 ? slot - 4 : slot * 0.7));
  const x = (i: number) => pad.l + i * slot + (slot - bar) / 2;
  const labelAll = n <= 6;
  // Axis labels too wide for their slot are shown every few slots, each kept inside the drawing.
  const widest = Math.max(0, ...labels.map((l) => monoPx(l, 10)));
  const every = Math.max(1, Math.ceil((widest + 6) / Math.max(1, slot)));
  // The last label too, when it clears the one before it once both are kept inside the drawing.
  const labelX = (i: number) => insideX(x(i) + bar / 2, monoPx(labels[i] ?? "", 10), w);
  const lastRegular = Math.floor((n - 1) / every) * every;
  const showLast = n > 1 && n - 1 !== lastRegular && labelX(n - 1) - labelX(lastRegular) >= widest + 6;

  return (
    <ChartFrame title={title} subtitle={subtitle} badge={badge} table={<ChartTable caption={tableCaption} head={["Year", title]} rows={labels.map((l, i) => [l, values[i] === null ? "n/a" : format(values[i] as number)])} />}>
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${values[i] === null ? "n/a" : format(values[i] as number)}`).join(", ")}.`} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--text-tertiary)" : "var(--hairline)"} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="data" fontSize={10} fill="var(--text-tertiary)">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const v = values[i];
            const cx = x(i) + bar / 2;
            return (
              <g key={`${i}-${l}`} tabIndex={0} role="img" aria-label={`${l}: ${v === null ? "n/a" : format(v)}`} className="outline-none" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                {v !== null ? (
                  (() => {
                    const top = Math.min(y(v), y(0));
                    const h = Math.abs(y(v) - y(0));
                    const rr = Math.min(4, h / 2, bar / 2);
                    const d =
                      v >= 0
                        ? `M${x(i)} ${y(0)} v-${Math.max(0, h - rr)} a${rr} ${rr} 0 0 1 ${rr} -${rr} h${bar - 2 * rr} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${Math.max(0, h - rr)} Z`
                        : `M${x(i)} ${y(0)} v${Math.max(0, h - rr)} a${rr} ${rr} 0 0 0 ${rr} ${rr} h${bar - 2 * rr} a${rr} ${rr} 0 0 0 ${rr} -${rr} v-${Math.max(0, h - rr)} Z`;
                    return (
                      <>
                        <path d={d} fill={color} stroke="var(--surface)" strokeWidth={2} />
                        {labelAll ? (
                          <text x={insideX(cx, monoPx(format(v), 10), w)} y={v >= 0 ? top - 5 : y(0) - 5} textAnchor="middle" className="data" fontSize={10} fill="var(--text-secondary)">
                            {format(v)}
                          </text>
                        ) : null}
                      </>
                    );
                  })()
                ) : (
                  <text x={cx} y={y(0) - 5} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">
                    n/a
                  </text>
                )}
                {i % every === 0 || (i === n - 1 && showLast) ? (
                  <text x={insideX(cx, monoPx(l, 10), w)} y={height - 6} textAnchor="middle" className="data" fontSize={10} fill="var(--text-tertiary)">
                    {l}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? <Tooltip x={(x(hover) / w) * width} y={pad.t} width={width} title={labels[hover]} rows={[{ label: title, color, value: values[hover] === null ? "n/a" : format(values[hover] as number) }]} /> : null}
      </div>
    </ChartFrame>
  );
}
