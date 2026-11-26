import type * as React from "react";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import type { MarketPoint } from "@/lib/markets";
import { longDate } from "@/lib/time";

/** The Treasury maturities the feed reads, shortest first. */
export const CURVE = [
  { symbol: "US3M", label: "3m", years: 0.25 },
  { symbol: "US2Y", label: "2y", years: 2 },
  { symbol: "US5Y", label: "5y", years: 5 },
  { symbol: "US10Y", label: "10y", years: 10 },
  { symbol: "US30Y", label: "30y", years: 30 },
] as const;

const WHEN = [
  { key: "now", label: "Latest", back: 0, color: "var(--series-hcmp)" },
  { key: "1m", label: "A month ago", back: 21, color: "var(--series-qqq)" },
  { key: "1y", label: "A year ago", back: 252, color: "var(--series-spy)" },
] as const;

type Curve = { key: string; label: string; color: string; date: string; yields: (number | null)[] };

/** Each curve's yields on the latest common session, 21 sessions before it and 252 before it; a maturity with no reading that day is a gap. */
export function curvesFrom(series: Record<string, MarketPoint[]>): Curve[] {
  const ten = series.US10Y ?? [];
  return WHEN.flatMap((w) => {
    const at = ten[ten.length - 1 - w.back];
    if (!at) return [];
    const yields = CURVE.map((c) => {
      const pts = series[c.symbol] ?? [];
      // The close on that day, else the last before it.
      let v: number | null = null;
      for (const p of pts) if (p.date <= at.date) v = p.value;
      return v;
    });
    return yields.some((y) => y !== null) ? [{ key: w.key, label: w.label, color: w.color, date: at.date, yields }] : [];
  });
}

/** One drawing of the curves at a given size: a wide one for a laptop, a narrower one for a phone, so the type stays the same size on both. */
function Drawing({ curves, w, h, className }: { curves: Curve[]; w: number; h: number; className: string }) {
  const pad = { l: 44, r: 96, t: 12, b: 28 };
  const all = curves.flatMap((c) => c.yields.filter((y): y is number => y !== null));
  const lo = Math.floor(Math.min(...all) * 4) / 4 - 0.25;
  const hi = Math.ceil(Math.max(...all) * 4) / 4 + 0.25;
  const x = (i: number) => pad.l + (i / (CURVE.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  // The end labels, nudged apart where the curves end close together.
  const short = (label: string) => (label === "Latest" ? "now" : label === "A month ago" ? "1m" : "1y");
  const ends = curves
    .map((c) => {
      const i = c.yields.map((v, k) => (v === null ? -1 : k)).filter((k) => k >= 0).pop();
      return i === undefined ? null : { key: c.key, x: x(i), y: y(c.yields[i] as number), text: `${short(c.label)} ${(c.yields[i] as number).toFixed(2)}%` };
    })
    .filter((e): e is { key: string; x: number; y: number; text: string } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 14);
  const over = ends.length ? ends[ends.length - 1].y - (h - pad.b) : 0;
  if (over > 0) for (const e of ends) e.y -= over;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((lo + ((hi - lo) * i) / 4) * 100) / 100);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label="US Treasury yield curve now, a month ago and a year ago">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="data" fontSize={11} fill="var(--text-tertiary)">
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      {CURVE.map((m, i) => (
        <text key={m.symbol} x={x(i)} y={h - 8} textAnchor="middle" className="data" fontSize={11} fill="var(--text-secondary)">
          {m.label}
        </text>
      ))}
      {[...curves].reverse().map((c) => {
        const pts = c.yields.map((v, i) => (v === null ? null : { x: x(i), y: y(v) })).filter((p): p is { x: number; y: number } => p !== null);
        return (
          <g key={c.key}>
            <path d={pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={c.color} strokeWidth={2} strokeLinejoin="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill={c.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        );
      })}
      {ends.map((e) => (
        <text key={e.key} x={e.x + 10} y={e.y + 4} className="data" fontSize={11} fill="var(--text-secondary)">
          {e.text}
        </text>
      ))}
    </svg>
  );
}

/**
 * The US Treasury curve from three months to thirty years, now against a
 * month and a year ago: one axis in percent, the maturities spaced as their
 * labels (not by years, so the short end is legible), a dot at every
 * reading, a direct label at the long end and a table view.
 */
export function CurveChart({ series, badge }: { series: Record<string, MarketPoint[]>; badge?: React.ReactNode }) {
  const curves = curvesFrom(series);
  if (!curves.length) return null;
  return (
    <ChartFrame
      title="US Treasury yield curve"
      badge={badge}
      subtitle={`Three months to thirty years on ${longDate(curves[0].date)}, against a month and a year before. A curve that slopes down (short yields above long) is inverted.`}
      legend={curves.map((c) => ({ label: `${c.label} (${longDate(c.date)})`, color: c.color }))}
      table={<ChartTable caption="Treasury yields by maturity" head={["Maturity", ...curves.map((c) => c.label)]} rows={CURVE.map((m, i) => [m.label, ...curves.map((c) => (c.yields[i] === null ? "n/a" : `${(c.yields[i] as number).toFixed(2)}%`))])} />}
    >
      <Drawing curves={curves} w={1100} h={300} className="hidden w-full sm:block" />
      <Drawing curves={curves} w={360} h={240} className="block w-full sm:hidden" />
    </ChartFrame>
  );
}
