"use client";

import * as React from "react";

import { formatData } from "@/lib/custom-data";
import { cn } from "@/lib/utils";

export type LegendItem = { label: string; color: string; kind?: "line" | "rect" };

/**
 * How a chart prints a value. Named rather than passed as a function, since a
 * server component cannot hand a function to a client component.
 */
export type Format = "signedPct1" | "pct0" | "pct1" | "pct2" | "int" | "num2" | "ratio" | "days" | "money" | "usd" | `ccy:${string}` | `cents:${string}` | `unit:${string}` | `compact:${string}` | `perShare:${string}` | "compact";

export function formatter(kind: Format): (v: number) => string {
  if (kind.startsWith("unit:")) {
    // A person's own data, with the unit they gave it (lib/custom-data.ts).
    const unit = kind.slice(5);
    return (v) => formatData(v, unit);
  }
  if (kind.startsWith("compact:")) {
    // Whole units of a named currency, shortened: a company's revenue as "$143.3B".
    // The minimum is stated, since Node and the browser default it differently ("$7.0B" against "$7B").
    const ccy = kind.slice(8);
    return (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
  }
  if (kind.startsWith("perShare:")) {
    // A per-share figure in a named currency, with its cents.
    const ccy = kind.slice(9);
    return (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
  }
  if (kind.startsWith("cents:")) {
    // A named currency with its cents below a hundred, for small sums such as a month's dividends.
    const ccy = kind.slice(6);
    return (v) => {
      const d = Math.abs(v) < 100 && Math.abs(v - Math.round(v)) > 0.004 ? 2 : 0;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
    };
  }
  if (kind.startsWith("ccy:")) {
    // Whole units of a named currency, for figures a methodology defines.
    const ccy = kind.slice(4);
    return (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(v);
  }
  switch (kind) {
    case "compact":
      return (v) => new Intl.NumberFormat("en-US", { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
    case "pct1":
      return (v) => `${v.toFixed(1)}%`;
    case "pct2":
      return (v) => `${v.toFixed(2)}%`;
    case "ratio":
      return (v) => `${v.toFixed(2)}x`;
    case "days":
      return (v) => `${v.toFixed(0)}d`;
    case "signedPct1":
      return (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
    case "pct0":
      return (v) => `${v.toFixed(0)}%`;
    case "int":
      return (v) => v.toFixed(0);
    case "num2":
      return (v) => v.toFixed(2);
    case "money": {
      // "USD m" figures as "$1.2bn" or "$850m".
      return (v) => {
        const abs = Math.abs(v);
        const t = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}bn` : `$${abs.toFixed(0)}m`;
        return v < 0 ? `-${t}` : t;
      };
    }
    case "usd":
      return (v) => `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
    default:
      return (v) => String(v);
  }
}

/**
 * The chrome every chart shares: a title, the legend (always present for two
 * or more series), and a Chart / Table toggle so every value is reachable
 * without hovering or seeing colour. The chart itself is the child.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
  defaultView = "chart",
  badge,
  after,
  controls,
}: {
  title: string;
  /** How fresh the figures are (components/ui/freshness.tsx), beside the title. */
  badge?: React.ReactNode;
  subtitle?: React.ReactNode;
  legend?: LegendItem[];
  table: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultView?: "chart" | "table";
  /** Drawn under the chart or its table alike, inside the same card. */
  after?: React.ReactNode;
  /** Drawn over the chart or its table alike: a switch both views follow. */
  controls?: React.ReactNode;
}) {
  const [view, setView] = React.useState<"chart" | "table">(defaultView);
  const id = React.useId();
  return (
    <section className={cn("card px-4 py-3", className)} aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
            {title}
            {badge}
          </h3>
          {subtitle ? <p className="mt-0.5 text-footnote text-text-secondary">{subtitle}</p> : null}
        </div>
        <div className="inline-flex rounded-[8px] bg-surface-2 p-0.5" role="tablist" aria-label={`${title}: chart or table`}>
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 min-w-[3.5rem] rounded-[6px] px-2.5 text-caption font-medium capitalize",
                view === v ? "bg-surface text-text" : "text-text-secondary",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {legend && legend.length > 1 && view === "chart" ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-text-secondary" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={l.kind === "rect" ? "inline-block size-2.5 rounded-[2px]" : "inline-block h-0.5 w-4 rounded-full"}
                style={{ background: l.color }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      {controls ? <div className="mt-3">{controls}</div> : null}
      <div className="mt-3">{view === "chart" ? children : <div className="overflow-x-auto">{table}</div>}</div>
      {after}
    </section>
  );
}

/** A compact data table for a chart's table view. Figures are mono and right-aligned. */
export function ChartTable({ head, rows, caption }: { head: React.ReactNode[]; rows: React.ReactNode[][]; caption: string }) {
  return (
    <table className="w-full text-footnote">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-text-tertiary">
          {head.map((h, i) => (
            <th key={i} scope="col" className={cn("py-1.5 pr-3 font-medium", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-hairline">
            {r.map((c, j) => (
              <td key={j} className={cn("py-1.5 pr-3", j > 0 && "data text-right")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The hover readout. Values lead, labels follow; series are keyed by a short stroke of their colour. */
export function Tooltip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: { label: string; value: string; color?: string }[] }) {
  const flip = x > width * 0.6;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-[9rem] rounded-[8px] border border-hairline bg-surface-2 px-2.5 py-2 text-footnote shadow-lg"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 8) }}
    >
      <p className="text-caption text-text-tertiary">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="mt-0.5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-text-secondary">
            {r.color ? <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="data font-medium text-text">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** The width of a figure in Plex Mono (every character 0.6em), so a chart can make room for its labels before drawing them. */
export const monoPx = (text: string, fontSize: number) => text.length * fontSize * 0.6;

/** The x for a middle-anchored label of `textW` so the whole of it stays inside [0, w]. */
export const insideX = (x: number, textW: number, w: number) => Math.min(Math.max(x, textW / 2 + 1), w - textW / 2 - 1);

/** Keeps a measured width for a responsive SVG. */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width) || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return { ref, width };
}

/** Clean axis ticks: about `count` round numbers spanning [min, max], always including 0 when it is inside. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];
  const span = max - min;
  const rough = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  if (min < 0 && max > 0 && !ticks.some((t) => Math.abs(t) < 1e-9)) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}
