"use client";

import * as React from "react";

import { ChartFrame, ChartTable, formatter, insideX, monoPx, niceTicks, useWidth, type Format } from "@/components/charts/frame";

export type Stack = { label: string; color: string; values: (number | null)[] };

/**
 * Columns stacked from zero, one part per line (revenue by segment, after
 * Qualtrim; Hamza, 4 Nov 2026): the largest line at the base, the same line
 * the same hue in every column, a 2px surface gap between parts and a 4px
 * rounded cap on the top part alone. Hovering or focusing a column shows each
 * part, its share of the whole column and, when `growth` gives it, its growth
 * on the same period a year before; the column's total is on its cap when it
 * fits. The table carries every value and share.
 */
export function StackedColumns({
  title,
  subtitle,
  badge,
  labels,
  stacks,
  growth,
  format: formatKind,
  tableCaption,
  labelHead = "",
  height = 220,
  after,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  labels: string[];
  stacks: Stack[];
  /** Each part's growth on a year in percent, by stack and column; null where the year before is not kept. */
  growth?: (number | null)[][];
  format: Format;
  tableCaption: string;
  labelHead?: string;
  height?: number;
  after?: React.ReactNode;
}) {
  const format = formatter(formatKind);
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => stacks.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const ticks = niceTicks(0, Math.max(0.0001, ...totals), 3);
  const widestLabel = Math.max(0, ...labels.map((l) => monoPx(l, 10)));
  const pad = { l: Math.max(44, Math.ceil(Math.max(0, ...ticks.map((t) => monoPx(format(t), 10))) + 10)), r: 8, t: 18, b: 22 };
  const w = Math.max(220, width);
  const iw = w - pad.l - pad.r;
  const h = height;
  const ih = h - pad.t - pad.b;
  const hi = Math.max(ticks[ticks.length - 1] ?? 0, ...totals, 0.0001);
  const y = (v: number) => pad.t + ((hi - v) / hi) * ih;
  const slot = n ? iw / n : iw;
  const bar = Math.min(36, Math.max(6, slot - 8));
  const x0 = (i: number) => pad.l + i * slot + (slot - bar) / 2;
  const every = Math.max(1, Math.ceil((widestLabel + 6) / Math.max(1, slot)));
  const capFits = totals.every((t) => monoPx(format(t), 10) <= slot - 2);
  const share = (v: number | null, i: number) => (v !== null && totals[i] > 0 ? (v / totals[i]) * 100 : null);
  const pctText = (p: number | null) => (p === null ? "n/a" : `${p.toFixed(1)}%`);
  const growthText = (g: number | null | undefined) => (g === null || g === undefined ? "n/a" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`);
  const hasGrowth = hover !== null && !!growth?.some((g) => g[hover] !== null && g[hover] !== undefined);

  // A part's rectangle, the top part with its rounded cap.
  const part = (xi: number, from: number, to: number, top: boolean) => {
    const yt = y(to);
    const yb = y(from);
    const hh = Math.max(0, yb - yt);
    if (!top) return `M${xi} ${yb} V${yt} h${bar} V${yb} Z`;
    const rr = Math.min(4, hh / 2, bar / 2);
    return `M${xi} ${yb} V${yt + rr} a${rr} ${rr} 0 0 1 ${rr} -${rr} h${bar - 2 * rr} a${rr} ${rr} 0 0 1 ${rr} ${rr} V${yb} Z`;
  };

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      badge={badge}
      after={after}
      legend={stacks.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))}
      table={
        <ChartTable
          caption={tableCaption}
          head={[labelHead, ...stacks.map((s) => s.label), "Total"]}
          rows={labels.map((l, i) => [l, ...stacks.map((s) => (s.values[i] === null ? "n/a" : `${format(s.values[i] as number)} (${pctText(share(s.values[i], i))})`)), format(totals[i])])}
        />
      }
    >
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${format(totals[i])}`).join(", ")}.`} className="block">
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
            const drawn = stacks.map((s, j) => ({ j, v: s.values[i] })).filter((p): p is { j: number; v: number } => p.v !== null && p.v > 0);
            let at = 0;
            return (
              <g
                key={`${l}-${i}`}
                tabIndex={0}
                role="img"
                aria-label={`${l}: ${drawn.map((p) => `${stacks[p.j].label} ${format(p.v)}, ${pctText(share(p.v, i))}`).join("; ")}; total ${format(totals[i])}`}
                className="outline-none"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                {drawn.map((p, k) => {
                  const from = at;
                  at += p.v;
                  return <path key={stacks[p.j].label} d={part(x0(i), from, at, k === drawn.length - 1)} fill={stacks[p.j].color} stroke="var(--surface)" strokeWidth={2} opacity={hover === null || hover === i ? 1 : 0.55} />;
                })}
                {capFits && totals[i] > 0 ? (
                  <text x={insideX(cx, monoPx(format(totals[i]), 10), w)} y={y(totals[i]) - 5} textAnchor="middle" className="data" fontSize={10} fill="var(--text-secondary)">
                    {format(totals[i])}
                  </text>
                ) : null}
                {i % every === 0 ? (
                  <text x={insideX(cx, monoPx(l, 10), w)} y={h - 6} textAnchor="middle" className="data" fontSize={10} fill="var(--text-tertiary)">
                    {l}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          // Each part in a row of its own, the top part first, as the column stacks: its revenue, its share of the column and its growth on a year.
          <div
            role="presentation"
            className="pointer-events-none absolute z-10 rounded-[8px] border border-hairline bg-surface-2 px-2.5 py-2 text-footnote shadow-lg"
            style={(() => {
              const cx = ((pad.l + hover * slot + slot / 2) / w) * width;
              const flip = cx > width * 0.55;
              const max = Math.min(352, width - 8);
              return { top: pad.t, maxWidth: max, left: flip ? undefined : Math.min(cx + 12, Math.max(4, width - max - 4)), right: flip ? Math.min(width - cx + 12, Math.max(4, width - max - 4)) : undefined };
            })()}
          >
            <p className="text-caption text-text-tertiary">
              {labels[hover]} · <span className="data text-text">{format(totals[hover])}</span>
            </p>
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr className="text-caption text-text-tertiary">
                  <th className="pr-3 text-left font-normal" />
                  <th className="whitespace-nowrap pl-2 text-right font-normal">Revenue</th>
                  <th className="whitespace-nowrap pl-2 text-right font-normal">Share</th>
                  {hasGrowth ? <th className="whitespace-nowrap pl-2 text-right font-normal">On a year</th> : null}
                </tr>
              </thead>
              <tbody>
                {stacks
                  .map((s, j) => ({ s, j }))
                  .reverse()
                  .filter(({ s }) => s.values[hover] !== null)
                  .map(({ s, j }) => {
                    const g = growth?.[j]?.[hover];
                    return (
                      <tr key={s.label}>
                        <td className="py-0.5 pr-3 text-text-secondary">
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                            <span className="leading-tight">{s.label}</span>
                          </span>
                        </td>
                        <td className="data whitespace-nowrap py-0.5 pl-2 text-right font-medium text-text">{format(s.values[hover] as number)}</td>
                        <td className="data whitespace-nowrap py-0.5 pl-2 text-right text-text">{pctText(share(s.values[hover], hover))}</td>
                        {hasGrowth ? <td className={`data whitespace-nowrap py-0.5 pl-2 text-right ${g === null || g === undefined ? "text-text-tertiary" : "text-text-secondary"}`}>{growthText(g)}</td> : null}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
