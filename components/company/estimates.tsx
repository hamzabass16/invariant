"use client";

import * as React from "react";

import { ChartFrame, ChartTable, insideX, monoPx, niceTicks, useWidth } from "@/components/charts/frame";
import type { EstimateBar } from "@/lib/forward";

const usd = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const growthText = (g: number | null) => (g === null ? "–" : `${g > 0 ? "+" : g < 0 ? "-" : ""}${Math.abs(g).toFixed(1)}%`);

/**
 * EPS by fiscal year, the filed years solid and the analysts' years hatched
 * with their lowest and highest estimate as a whisker (Hamza, 21 Nov 2026,
 * after Qualtrim's analyst estimates). One axis; each bar carries its figure
 * and its growth on the year before; the table holds every figure and the
 * number of estimates. The analysts' figures are theirs, never the app's.
 */
export function EstimatesCard({ bars, words, readAt }: { bars: EstimateBar[]; words: string; readAt: string | null }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const height = 220;
  const values = bars.flatMap((b) => [b.eps, b.low ?? b.eps, b.high ?? b.eps]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const pad = { l: Math.max(40, Math.ceil(Math.max(0, ...ticks.map((t) => monoPx(usd(t), 10))) + 10)), r: 8, t: 24, b: 38 };
  const w = Math.max(240, width);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const lo = Math.min(0, ...values, ticks[0] ?? 0);
  const hi = Math.max(0, ...values, ticks.at(-1) ?? 0);
  const y = (v: number) => pad.t + (hi === lo ? ih : ((hi - v) / (hi - lo)) * ih);
  const slot = bars.length ? iw / bars.length : iw;
  const bar = Math.max(6, Math.min(28, slot - 10));
  const x = (i: number) => pad.l + i * slot + (slot - bar) / 2;
  const id = React.useId().replace(/:/g, "");
  const filed = bars.filter((b) => b.kind === "filed").length;

  const table = (
    <ChartTable
      caption="Diluted EPS by fiscal year: filed, then the analysts' consensus with its low and high"
      head={["Year", "EPS", "Growth", "Low", "High", "Estimates"]}
      rows={bars.map((b) => [b.label, usd(b.eps), growthText(b.growth), b.low === null ? "–" : usd(b.low), b.high === null ? "–" : usd(b.high), b.kind === "filed" ? "Filed" : b.estimates === null ? "–" : String(b.estimates)])}
    />
  );
  return (
    <ChartFrame
      title="EPS, filed and the analysts'"
      subtitle={`Diluted EPS in US dollars. ${filed ? "A is filed with the SEC; " : ""}E is the analysts' consensus on Nasdaq${readAt ? `, read ${readAt}` : ""}, with the lowest and highest estimate. Theirs, not the app's.`}
      legend={[
        { label: "Filed", color: "var(--series-hcmp)", kind: "rect" },
        { label: "Analysts' consensus", color: "var(--series-qqq)", kind: "rect" },
      ]}
      table={table}
      after={<p className="mt-2 text-caption text-text-tertiary">{words}</p>}
    >
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={`EPS by year: ${bars.map((b) => `${b.label} ${usd(b.eps)}`).join(", ")}.`} className="block">
          <defs>
            <pattern id={`hatch-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--series-qqq)" opacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-qqq)" strokeWidth="2.5" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--text-tertiary)" : "var(--hairline)"} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="data" fontSize={10} fill="var(--text-tertiary)">
                {usd(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const top = Math.min(y(b.eps), y(0));
            const h = Math.max(1, Math.abs(y(b.eps) - y(0)));
            const cx = x(i) + bar / 2;
            const label = usd(b.eps);
            const above = b.high !== null ? Math.min(y(b.high), top) : top;
            return (
              <g key={b.label} tabIndex={0} role="img" aria-label={`${b.label}: ${label}${b.growth === null ? "" : `, ${growthText(b.growth)}`}${b.low !== null && b.high !== null ? `, from ${usd(b.low)} to ${usd(b.high)}` : ""}`} className="outline-none" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                <rect x={x(i)} y={top} width={bar} height={h} rx={Math.min(4, bar / 2)} fill={b.kind === "filed" ? "var(--series-hcmp)" : `url(#hatch-${id})`} stroke="var(--bg)" strokeWidth={2} />
                {b.low !== null && b.high !== null ? (
                  <g stroke="var(--text-secondary)" strokeWidth={1.5}>
                    <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} />
                    <line x1={cx - 5} x2={cx + 5} y1={y(b.high)} y2={y(b.high)} />
                    <line x1={cx - 5} x2={cx + 5} y1={y(b.low)} y2={y(b.low)} />
                  </g>
                ) : null}
                <text x={insideX(cx, monoPx(label, 10), w)} y={above - 6} textAnchor="middle" className="data" fontSize={10} fill="var(--text-secondary)">
                  {label}
                </text>
                <text x={insideX(cx, monoPx(b.label, 10), w)} y={height - pad.b + 14} textAnchor="middle" className="data" fontSize={10} fill="var(--text-tertiary)">
                  {b.label}
                </text>
                <text x={insideX(cx, monoPx(growthText(b.growth), 10), w)} y={height - pad.b + 28} textAnchor="middle" className="data" fontSize={10} fill={b.growth === null || b.growth === 0 ? "var(--text-tertiary)" : b.growth > 0 ? "var(--move-up)" : "var(--move-down)"}>
                  {growthText(b.growth)}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && bars[hover] ? (
          <div role="tooltip" className="pointer-events-none absolute top-0 rounded-[8px] border border-hairline bg-[var(--surface)] px-2 py-1 text-caption shadow-sm" style={{ left: Math.min(Math.max(0, x(hover) - 40), Math.max(0, w - 170)) }}>
            <span className="data font-semibold">{bars[hover].label}</span>
            <span className="data ml-2">{usd(bars[hover].eps)}</span>
            {bars[hover].low !== null && bars[hover].high !== null ? <span className="data ml-2 text-text-secondary">{`${usd(bars[hover].low!)} to ${usd(bars[hover].high!)}`}</span> : null}
            {bars[hover].estimates !== null ? <span className="ml-2 text-text-secondary">{`${bars[hover].estimates} estimates`}</span> : null}
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
