"use client";

import * as React from "react";

import { ChartFrame, ChartTable, Tooltip, monoPx, niceTicks, useWidth, type LegendItem, formatter, type Format } from "@/components/charts/frame";
import { longDate, monthYear, shortDate } from "@/lib/time";

export type LineSeries = { key: string; label: string; color: string; values: (number | null)[] };

/** An event on the first series at index `i`: a buy (a triangle pointing up, under the line) or a sale (pointing down, over it), with the rows the readout shows. */
export type LineMarker = { i: number; side: "buy" | "sell"; label: string; rows: { label: string; value: string }[] };
export type ChartLevel = { key: string; value: number; label: string; tone: "case" | "alert" };
export const MARKER_COLOR: Record<LineMarker["side"], string> = { buy: "var(--viz-text)", sell: "var(--series-spy)" };

/**
 * Lines over time, one y-axis, every series in one hover readout. The
 * crosshair snaps to the nearest date; arrow keys move it when the chart has
 * focus. Direct labels at the right edge name the series; a legend is shown
 * for two or more. `area` draws a single series as a wash, for drawdowns.
 * `markers` draw buys and sales on the first series, named in the legend by
 * shape as well as colour, and the readout lists them on their day.
 */
export function LineChart({
  title,
  subtitle,
  badge,
  dates,
  series,
  format: formatKind,
  height = 220,
  area = false,
  baseline = null,
  tableCaption,
  tableEvery = 1,
  markers = [],
  wash = false,
  levels = [],
  after,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  dates: string[];
  series: LineSeries[];
  format: Format;
  height?: number;
  area?: boolean;
  /** A horizontal reference line, such as 0 or 100. */
  baseline?: number | null;
  tableCaption: string;
  /** Show every nth row in the table view, so a daily series does not run to hundreds of rows. */
  tableEvery?: number;
  markers?: LineMarker[];
  /** A faint wash under the first series alone, for the book against its benchmarks. */
  wash?: boolean;
  /** Dashed horizontal levels, each labelled on the line: a valuation's cases, an alert's price. */
  levels?: ChartLevel[];
  /** Drawn under the chart or its table, inside the same card. */
  after?: React.ReactNode;
}) {
  const format = formatter(formatKind);
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const n = dates.length;
  // A chart over more than about a year names the month and year on its axis, and the full date in its table and readout.
  const years = n > 1 && Date.parse(dates[n - 1]) - Date.parse(dates[0]) > 400 * 86_400_000;
  const tick = years ? monthYear : shortDate;
  const day = years ? longDate : shortDate;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (baseline !== null) all.push(baseline);
  for (const l of levels) if (Number.isFinite(l.value)) all.push(l.value);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const ticks = niceTicks(min, max, 4);
  const w = Math.max(160, width);
  const endWith = (named: boolean) => (s: LineSeries) => {
    for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return `${named && series.length > 1 ? `${s.label} ` : ""}${format(s.values[i] as number)}`;
    return "";
  };
  const widest = (f: (s: LineSeries) => string) => Math.max(0, ...series.map((s) => monoPx(f(s), 11)));
  // End labels name their series when that leaves the plot most of the width; on a phone they carry the value alone and the legend names them.
  const endText = endWith(widest(endWith(true)) <= w * 0.3);
  // Room for the widest tick on the left and the widest end label on the right, so neither is cut.
  const pad = { l: Math.max(44, Math.ceil(Math.max(0, ...ticks.map((t) => monoPx(format(t), 11))) + 10)), r: Math.max(56, Math.ceil(widest(endText) + 14)), t: 8, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const lo = Math.min(min, ticks[0] ?? min);
  const hi = Math.max(max, ticks[ticks.length - 1] ?? max);
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + (hi === lo ? ih / 2 : ((hi - v) / (hi - lo)) * ih);

  function pathFor(values: (number | null)[]) {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function nearest(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - pad.l) / iw) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  }

  const legend: LegendItem[] = [
    ...series.map((s) => ({ label: s.label, color: s.color })),
    ...(markers.some((m) => m.side === "buy") ? [{ label: "Bought ▲", color: MARKER_COLOR.buy, kind: "rect" as const }] : []),
    ...(markers.some((m) => m.side === "sell") ? [{ label: "Sold ▼", color: MARKER_COLOR.sell, kind: "rect" as const }] : []),
  ];
  const markersAt = (i: number) => markers.filter((m) => m.i === i);
  const first = series[0];
  const last = (s: LineSeries) => {
    for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return { i, v: s.values[i] as number };
    return null;
  };
  // End labels, nudged apart by at least 14px so converging lines stay readable.
  const ends = series
    .map((s) => ({ s, e: last(s) }))
    .filter((p): p is { s: LineSeries; e: { i: number; v: number } } => p.e !== null)
    .sort((a, b) => y(a.e.v) - y(b.e.v));
  const endLabels: { s: LineSeries; e: { i: number; v: number }; ly: number }[] = [];
  for (const p of ends) {
    const prev = endLabels.length ? endLabels[endLabels.length - 1].ly : -Infinity;
    endLabels.push({ ...p, ly: Math.max(y(p.e.v), prev + 14) });
  }

  // Level labels sit on their lines at the left, nudged at least 13px apart.
  const levelLabels: (ChartLevel & { ly: number })[] = [];
  for (const l of [...levels].filter((l) => Number.isFinite(l.value)).sort((a, b) => y(a.value) - y(b.value))) {
    const prev = levelLabels.length ? levelLabels[levelLabels.length - 1].ly : pad.t - 2;
    levelLabels.push({ ...l, ly: Math.max(y(l.value) - 4, prev + 13) });
  }

  const rows: React.ReactNode[][] = [];
  const markerCol = markers.length ? [(i: number) => markersAt(i).map((m) => `${m.label}: ${m.rows.map((r) => `${r.label} ${r.value}`).join(", ")}`).join("; ") || ""] : [];
  const rowAt = (i: number) => [day(dates[i]), ...series.map((s) => (s.values[i] === null ? "n/a" : format(s.values[i] as number))), ...markerCol.map((f) => f(i))];
  for (let i = 0; i < n; i += tableEvery) rows.push(rowAt(i));
  if ((n - 1) % tableEvery !== 0 && n > 0) rows.push(rowAt(n - 1));
  // A day with a fill is always in the table, whatever the stride.
  for (const m of markers) if (m.i % tableEvery !== 0 && m.i !== n - 1 && m.i >= 0 && m.i < n) rows.push(rowAt(m.i));

  // Date labels at the ends and the quarters, the middle ones dropped when they would touch a neighbour.
  const xTicks = (() => {
    const at = Array.from(new Set([0, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n - 1].filter((i) => i >= 0 && i < n)));
    const span = (i: number) => {
      const tw = monoPx(tick(dates[i]), 11);
      return i === 0 ? [x(i), x(i) + tw] : i === n - 1 ? [x(i) - tw, x(i)] : [x(i) - tw / 2, x(i) + tw / 2];
    };
    const kept = at.filter((i) => i === 0 || i === n - 1);
    if (kept.length === 2 && span(kept[0])[1] + 8 > span(kept[1])[0]) kept.shift();
    for (const i of at) {
      if (kept.includes(i)) continue;
      const [a, b] = span(i);
      if (kept.every((k) => b + 8 <= span(k)[0] || a >= span(k)[1] + 8)) kept.push(i);
    }
    return kept.sort((a, b) => a - b);
  })();

  return (
    <ChartFrame title={title} subtitle={subtitle} badge={badge} legend={legend} after={after} table={<ChartTable caption={tableCaption} head={["Date", ...series.map((s) => s.label), ...(markers.length ? ["Fills"] : [])]} rows={rows} />}>
      <div ref={ref} className="relative">
        {n === 0 ? (
          <p className="py-8 text-center text-footnote text-text-secondary">No points in this window yet.</p>
        ) : (
          <svg
            viewBox={`0 0 ${w} ${height}`}
            width="100%"
            height={height}
            role="img"
            aria-label={`${title}. ${series.map((s) => `${s.label} ends at ${last(s) ? format(last(s)!.v) : "n/a"}`).join("; ")}.`}
            tabIndex={0}
            className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
            onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget))}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(n - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? n - 1) + 1));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="data" fontSize={11} fill="var(--text-tertiary)">
                  {format(t)}
                </text>
              </g>
            ))}
            {baseline !== null ? <line x1={pad.l} x2={w - pad.r} y1={y(baseline)} y2={y(baseline)} stroke="var(--text-tertiary)" strokeWidth={1} /> : null}
            {levelLabels.map((l) => (
              <g key={l.key}>
                <line x1={pad.l} x2={w - pad.r} y1={y(l.value)} y2={y(l.value)} stroke={l.tone === "alert" ? "var(--viz-text)" : "var(--text-secondary)"} strokeWidth={1} strokeDasharray={l.tone === "alert" ? "2 3" : "5 4"} />
                <text x={pad.l + 4} y={l.ly} className="data" fontSize={10} fill={l.tone === "alert" ? "var(--viz-text)" : "var(--text-secondary)"} paintOrder="stroke" stroke="var(--surface)" strokeWidth={3}>
                  {l.label} {format(l.value)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="data" fontSize={11} fill="var(--text-tertiary)">
                {tick(dates[i])}
              </text>
            ))}
            {wash && first ? <path d={`${pathFor(first.values)} L${x(n - 1).toFixed(1)} ${y(lo).toFixed(1)} L${x(0).toFixed(1)} ${y(lo).toFixed(1)} Z`} fill={first.color} fillOpacity={0.08} stroke="none" /> : null}
            {series.map((s) => (
              <g key={s.key}>
                {area ? (
                  <path
                    d={`${pathFor(s.values)} L${x(n - 1).toFixed(1)} ${y(baseline ?? lo).toFixed(1)} L${x(0).toFixed(1)} ${y(baseline ?? lo).toFixed(1)} Z`}
                    fill={s.color}
                    fillOpacity={0.12}
                    stroke="none"
                  />
                ) : null}
                <path d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
            {first
              ? markers.map((m, k) => {
                  const v = first.values[m.i];
                  if (v === null || v === undefined) return null;
                  const cx = x(m.i);
                  const cy = y(v);
                  const d = m.side === "buy" ? `M${cx} ${cy + 6} l-6 10 h12 Z` : `M${cx} ${cy - 6} l-6 -10 h12 Z`;
                  return <path key={`${m.i}-${k}`} d={d} fill={MARKER_COLOR[m.side]} stroke="var(--surface)" strokeWidth={1.5} />;
                })
              : null}
            {endLabels.map((p) => (
              <g key={p.s.key}>
                <circle cx={x(p.e.i)} cy={y(p.e.v)} r={4} fill={p.s.color} stroke="var(--surface)" strokeWidth={2} />
                <text x={w - pad.r + 8} y={p.ly} dy="0.32em" className="data" fontSize={11} fill="var(--text-secondary)">
                  {endText(p.s)}
                </text>
              </g>
            ))}
            {hover !== null ? (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--text-secondary)" strokeWidth={1} />
                {series.map((s) =>
                  s.values[hover] === null ? null : <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />,
                )}
              </g>
            ) : null}
          </svg>
        )}
        {hover !== null && n > 0 ? (
          <Tooltip
            x={(x(hover) / w) * width}
            y={pad.t}
            width={width}
            title={day(dates[hover])}
            rows={[
              ...series.map((s) => ({ label: s.label, color: s.color, value: s.values[hover] === null ? "n/a" : format(s.values[hover] as number) })),
              ...markersAt(hover).flatMap((m) => m.rows.map((r) => ({ label: `${m.label} · ${r.label}`, color: MARKER_COLOR[m.side], value: r.value }))),
            ]}
          />
        ) : null}
      </div>
    </ChartFrame>
  );
}
