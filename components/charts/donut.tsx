"use client";

import * as React from "react";

import { ChartFrame, ChartTable, Tooltip, useWidth, type LegendItem } from "@/components/charts/frame";
import { donutLayout, LABEL_LINE_PX } from "@/lib/donut-layout";
import { pct } from "@/lib/format";

export type Slice = {
  key: string;
  label: string;
  /** Percent of the whole. */
  value: number;
  /** The CSS colour, by the slice's group: identity comes from the group, lightness steps within it. */
  color: string;
  group: string;
  detail?: string;
  /** Where the slice's name opens, such as a company's page. */
  href?: string;
};

/**
 * Weight as a donut. Colour follows the group (an asset class), so a glance says
 * how the portfolio splits by the methodology's classes; slices within a group
 * step in lightness and are labelled directly, in two columns joined to their
 * slice by a leader (lib/donut-layout.ts): a long name wraps, the ring shrinks
 * and the drawing grows taller before any label is cut or overlaps. Slices
 * under `labelFrom` percent are named in the legend, the tooltip and the table.
 */
export function Donut({
  title,
  subtitle,
  badge,
  slices,
  legend,
  centre,
  labelFrom = 0,
  tableCaption,
  tableHead = ["Holding", "Weight", "Archetype", "Note"],
  aside,
  before,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  slices: Slice[];
  legend: LegendItem[];
  centre: { value: string; label: string };
  labelFrom?: number;
  tableCaption: string;
  tableHead?: string[];
  /** Beside the ring from 1024px, under it on a phone: the slices as a list with bars (components/charts/slice-bars.tsx). */
  aside?: React.ReactNode;
  /** Above the ring, inside the card: a switch between views (components/charts/donut-tabs.tsx). */
  before?: React.ReactNode;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const layout = donutLayout(width, slices.map((s) => ({ label: s.label, share: s.value })), labelFrom);
  const { cx, cy, R, r } = layout;
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  const labelOf = new Map(layout.labels.map((l) => [l.i, l]));

  const starts: number[] = [];
  for (let i = 0, a = -Math.PI / 2; i < slices.length; i++) {
    starts.push(a);
    a += (Math.max(0, slices[i].value) / total) * Math.PI * 2;
  }
  const arcs = slices.map((s, i) => {
    const span = (Math.max(0, s.value) / total) * Math.PI * 2;
    const a0 = starts[i];
    const a1 = a0 + span;
    const mid = (a0 + a1) / 2;
    const large = span > Math.PI ? 1 : 0;
    // Rounded to a thousandth: the server's and the browser's sine can differ in the last digit, which breaks hydration.
    const p = (a: number, rad: number) => [Math.round((cx + rad * Math.cos(a)) * 1000) / 1000, Math.round((cy + rad * Math.sin(a)) * 1000) / 1000];
    const [x0, y0] = p(a0, R);
    const [x1, y1] = p(a1, R);
    const [x2, y2] = p(a1, r);
    const [x3, y3] = p(a0, r);
    const d = span >= Math.PI * 2 - 1e-6
      ? `M${cx + R} ${cy} A${R} ${R} 0 1 1 ${cx - R} ${cy} A${R} ${R} 0 1 1 ${cx + R} ${cy} M${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy}`
      : `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
    const label = labelOf.get(i) ?? null;
    const [tx, ty] = label ? [label.x, label.top] : p(mid, R);
    return { s, i, d, label, tx, ty };
  });

  const rows = slices.map((s) => [s.label, pct(s.value, 2), s.group, s.detail ?? ""]);
  const big = R >= 90;

  return (
    <ChartFrame title={title} subtitle={subtitle} badge={badge} legend={aside ? undefined : legend} table={<ChartTable caption={tableCaption} head={tableHead} rows={rows} />}>
      {before}
      <div className={aside ? "grid items-center gap-x-8 gap-y-4 lg:grid-cols-2" : undefined}>
      <div ref={ref} className="relative min-w-0">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height={layout.height} role="img" aria-label={`${title}. ${slices.map((s) => `${s.label} ${pct(s.value, 1)}`).join(", ")}.`} className="block">
          {arcs.map((a) => (
            <g
              key={a.s.key}
              tabIndex={0}
              role="img"
              aria-label={`${a.s.label} ${pct(a.s.value, 2)}, ${a.s.group}`}
              className="outline-none"
              onPointerEnter={() => setHover(a.i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(a.i)}
              onBlur={() => setHover(null)}
            >
              <path
                d={a.d}
                fill={a.s.color}
                stroke="var(--surface)"
                strokeWidth={2}
                opacity={hover === null || hover === a.i ? 1 : 0.55}
                className="motion-safe:transition-opacity"
              />
              {a.label ? (
                <>
                  <polyline points={a.label.leader.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--hairline-strong)" strokeWidth={1} />
                  <text x={a.label.x} y={a.label.top} textAnchor={a.label.side === "right" ? "start" : "end"} className="data" fontSize={11} fill={hover === a.i ? "var(--text)" : "var(--text-secondary)"}>
                    {a.label.lines.map((line, k) => (
                      <tspan key={k} x={a.label!.x} dy={k === 0 ? LABEL_LINE_PX - 3 : LABEL_LINE_PX}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </>
              ) : null}
            </g>
          ))}
          <text x={cx} y={cy - (big ? 4 : 2)} textAnchor="middle" className="data" fontSize={big ? 22 : 15} fontWeight={600} fill="var(--text)">
            {centre.value}
          </text>
          <text x={cx} y={cy + (big ? 16 : 12)} textAnchor="middle" fontSize={big ? 11 : 10} fill="var(--text-secondary)">
            {centre.label}
          </text>
        </svg>
        {hover !== null && arcs[hover] ? (
          <Tooltip
            x={(arcs[hover].tx / layout.width) * width}
            y={arcs[hover].ty}
            width={width}
            title={arcs[hover].s.group}
            rows={[
              { label: arcs[hover].s.label, color: arcs[hover].s.color, value: pct(arcs[hover].s.value, 2) },
              ...(arcs[hover].s.detail ? [{ label: "Note", value: arcs[hover].s.detail as string }] : []),
            ]}
          />
        ) : null}
      </div>
      {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </ChartFrame>
  );
}
