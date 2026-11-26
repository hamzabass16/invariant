import * as React from "react";

import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-text-secondary",
};

export function toneText(tone: Tone) {
  return TONE_TEXT[tone];
}

/** One figure with its label: the stat tile. */
/** `badge` says how fresh the figure is (components/ui/freshness.tsx), under it. */
/** `extra` is drawn under the figure, before the detail: a range bar, a sparkline. */
export function StatTile({ label, value, detail, tone = "neutral", badge, extra, className, center = false }: { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: Tone; badge?: React.ReactNode; extra?: React.ReactNode; className?: string; /** Centres the figure, its range and its line in the height the row gives the tile, larger, so a tall tile has no empty block under them (Hamza, 20 Oct 2026). */ center?: boolean }) {
  const body = (
    <>
      <p className={cn("data figure-in mt-1 font-semibold tracking-[-0.01em]", center ? "text-large-title" : "text-title-2", tone !== "neutral" && TONE_TEXT[tone])}>{value}</p>
      {extra}
      {detail ? <p className={cn("text-footnote text-text-secondary", extra ? "mt-2" : "mt-0.5")}>{detail}</p> : null}
    </>
  );
  return (
    <div className={cn("card flex flex-col px-4 py-3.5", className)}>
      <p className="section-header">{label}</p>
      {center ? <div className="flex flex-1 flex-col justify-center py-2">{body}</div> : body}
      {badge ? <div className={cn(center ? "pt-1.5" : "mt-auto pt-1.5")}>{badge}</div> : null}
    </div>
  );
}

const TONE_BG: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-text-tertiary",
};

/**
 * Weight against cap. The track is drawn to one scale (the largest cap in the
 * methodology, 20 by default) so bars compare across holdings; the tick marks
 * the holding's own cap. Colour is the cap state: over, near, within, none.
 */
export function WeightBar({ weight, cap, scale = 20, tone = "neutral" }: { weight: number; cap: number | null; scale?: number; tone?: Tone }) {
  const width = Math.min(100, (Math.max(0, weight) / scale) * 100);
  const capAt = cap === null ? null : Math.min(100, (cap / scale) * 100);
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-2" aria-hidden>
      <div className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BG[tone])} style={{ width: `${width}%` }} />
      {capAt !== null ? <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-text" style={{ left: `calc(${capAt}% - 1px)` }} /> : null}
    </div>
  );
}

/** "x.xx% / cap%", in the cap state's colour. */
export function CapLabel({ weight, cap, tone = "neutral" }: { weight: number; cap: number | null; tone?: Tone }) {
  return (
    <span className={cn("data", toneText(tone))}>
      {weight.toFixed(2)}%<span className="whitespace-nowrap text-text-tertiary"> / {cap === null ? "no cap" : `${cap}%`}</span>
    </span>
  );
}

/** The class a methodology gives a holding, as a short pill; the initials of its label unless the label is short already. */
export function ClassTag({ label, full = false, tone = "info" }: { label: string | null; full?: boolean; tone?: Tone }) {
  if (!label) return <StatusPill tone="neutral" className="data">None</StatusPill>;
  const short = label.length <= 4 ? label : label.split(/[\s-]+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3);
  return (
    <StatusPill tone={tone} className="data">
      {full ? label : short}
    </StatusPill>
  );
}

/**
 * The owner's low, base and high with the price placed among them: a DCF
 * range, an appraisal band. Price above base is warn, below is ok.
 */
export function ValuationRange({ low, base, high, price }: { low: number | null; base: number; high: number | null; price: number }) {
  const lo0 = low ?? base;
  const hi0 = high ?? base;
  const lo = Math.min(lo0, price) * 0.95;
  const hi = Math.max(hi0, price) * 1.05;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });
  return (
    <div>
      <div className="relative h-8" aria-hidden>
        <div className="absolute top-3.5 h-1 rounded-full bg-surface-2" style={{ left: at(lo0), right: `calc(100% - ${at(hi0)})` }} />
        {[low, base, high].map((v, i) => (v === null ? null : <div key={i} className="absolute top-2 h-4 w-0.5 rounded bg-text-secondary" style={{ left: at(v) }} />))}
        <div className={cn("absolute top-1 size-3 -translate-x-1/2 translate-y-1 rounded-full ring-2 ring-bg", price > base ? "bg-warn" : "bg-ok")} style={{ left: at(price) }} />
      </div>
      <div className="data flex justify-between text-caption text-text-secondary">
        <span>{low === null ? "" : `Low ${fmt(low)}`}</span>
        <span>Base {fmt(base)}</span>
        <span>{high === null ? "" : `High ${fmt(high)}`}</span>
      </div>
    </div>
  );
}
