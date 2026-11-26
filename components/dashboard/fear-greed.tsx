import type * as React from "react";

import { ListRow, ListSection } from "@/components/ui/list";
import { FEAR_GREED_BANDS, fearGreedBand, fearGreedView, type FearGreedPoint, type MarketPoint } from "@/lib/markets";
import { longDate } from "@/lib/time";

/**
 * CNN's fear and greed index on a half-circle gauge, on the Dashboard
 * above On watch (Hamza, 16 Oct 2026, after CNN's own): five bands with
 * the one the score sits in tinted, the needle, the score in the centre,
 * then the previous close, a week, a month and a year ago, each with its
 * band. The figures come from the market feed's daily series (lib/markets.ts
 * fearGreedView); the words under it list the same readings as a table, so
 * nothing is said by colour alone.
 */

const CX = 160;
const CY = 168;
const R_OUT = 150;
const R_IN = 98;
const GAP_DEG = 1.2;

/** A score as an angle on the half circle: 0 at the left (180°), 100 at the right (0°). */
const rad = (value: number) => Math.PI * (1 - value / 100);
const pt = (r: number, value: number) => [CX + r * Math.cos(rad(value)), CY - r * Math.sin(rad(value))] as const;

/** The ring segment between two scores, clockwise along the outer edge and back along the inner. */
function arc(from: number, to: number): string {
  const [ox1, oy1] = pt(R_OUT, from);
  const [ox2, oy2] = pt(R_OUT, to);
  const [ix1, iy1] = pt(R_IN, to);
  const [ix2, iy2] = pt(R_IN, from);
  return `M${ox1.toFixed(2)} ${oy1.toFixed(2)} A${R_OUT} ${R_OUT} 0 0 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} A${R_IN} ${R_IN} 0 0 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)} Z`;
}

const SIDE_COLOR = { fear: "var(--move-down)", neutral: "var(--text-tertiary)", greed: "var(--move-up)" } as const;

function Gauge({ value }: { value: number }) {
  const band = fearGreedBand(value);
  const gap = GAP_DEG / 1.8; // degrees of the half circle as points of the score
  const [nx, ny] = pt(R_IN - 6, value);
  return (
    <svg viewBox="0 0 320 190" className="mx-auto block w-full max-w-[26rem]" role="img" aria-label={`Fear and greed ${value}, ${band.label}`}>
      {FEAR_GREED_BANDS.map((b, i) => {
        const start = i ? FEAR_GREED_BANDS[i - 1].to : 0;
        const active = b === band;
        const mid = (start + b.to) / 2;
        const [lx, ly] = pt((R_OUT + R_IN) / 2, mid);
        const angle = 90 - (rad(mid) * 180) / Math.PI;
        return (
          <g key={b.label}>
            <path d={arc(start + (start ? gap : 0), b.to - (b.to < 100 ? gap : 0))} fill={active ? `color-mix(in oklab, ${SIDE_COLOR[b.side]} 32%, var(--surface-2))` : "var(--surface-2)"} stroke={active ? SIDE_COLOR[b.side] : "var(--hairline)"} strokeWidth={active ? 1.5 : 1} />
            <text x={lx} y={ly} transform={`rotate(${angle.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`} textAnchor="middle" dominantBaseline="middle" className="font-display" fill={active ? "var(--text)" : "var(--text-secondary)"} style={{ fontSize: b.label.length > 6 ? 12 : 14, letterSpacing: "0.06em", fontWeight: 500, fontVariantCaps: "all-small-caps" }}>
              {b.label}
            </text>
          </g>
        );
      })}
      {[0, 25, 50, 75, 100].map((v) => {
        const [tx, ty] = pt(R_IN - 16, v);
        return (
          <text key={v} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" className="data" fill="var(--text-tertiary)" style={{ fontSize: 11 }}>
            {v}
          </text>
        );
      })}
      <line x1={CX} y1={CY} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="currentColor" strokeWidth={5} strokeLinecap="round" className="text-text" />
      <circle cx={CX} cy={CY} r={34} fill="var(--surface)" stroke="var(--hairline)" />
      <text x={CX} y={CY - 2} textAnchor="middle" dominantBaseline="middle" className="data" fill="var(--text)" style={{ fontSize: 30, fontWeight: 600 }}>
        {value}
      </text>
    </svg>
  );
}

function Reading({ when, point }: { when: string; point: FearGreedPoint | null }) {
  const side = point ? fearGreedBand(point.value).side : "neutral";
  return (
    <ListRow
      label={point ? point.label : "Not in the series yet"}
      detail={point ? `${when} · ${longDate(point.date)}` : when}
      value={point ? <span className="data inline-flex size-9 items-center justify-center rounded-full text-subhead font-semibold" style={{ background: `color-mix(in oklab, ${SIDE_COLOR[side]} 22%, var(--surface-2))`, color: "var(--text)" }}>{point.value}</span> : <span className="text-text-tertiary">–</span>}
    />
  );
}

export function FearGreedCard({ series, problem, badge }: { series: readonly MarketPoint[]; problem: string | null; badge?: React.ReactNode }) {
  const view = fearGreedView(series);
  const header = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      Fear and greed
      {badge}
    </span>
  );
  if (!view) {
    return (
      <ListSection header={header} className="mb-8" footer="CNN's fear and greed index, read with the market indicators.">
        <ListRow wrap label={problem ?? "CNN's fear and greed index has no reading yet."} detail="Shown once the feed carries it; never a guess in the meantime." />
      </ListSection>
    );
  }
  return (
    <ListSection header={header} className="mb-8" footer={`CNN's fear and greed index from seven market gauges, 0 (extreme fear) to 100 (extreme greed). Last reading ${longDate(view.now.date)}.`}>
      <div className="px-4 pb-2 pt-3">
        <p className="text-footnote text-text-secondary">What emotion is driving the market now?</p>
        <Gauge value={view.now.value} />
        <p className="-mt-1 text-center text-body font-semibold">{view.now.label}</p>
      </div>
      <Reading when="Previous close" point={view.previous} />
      <Reading when="1 week ago" point={view.weekAgo} />
      <Reading when="1 month ago" point={view.monthAgo} />
      <Reading when="1 year ago" point={view.yearAgo} />
    </ListSection>
  );
}
