import type { RangeSpec } from "@/lib/markets";

/**
 * Where a reading sits on its range (Hamza, 19 Oct 2026, after Pebble's
 * risk cards): a track coloured from the worse end to the better one when
 * there is one, else in the accent, a mark at the reading, the ends labelled,
 * and a line saying which way is better and what the scale is. A rule's limit
 * is a thin tick. Status colour here is the scale's own state, never a
 * series.
 */
export function RangeBar({ range, format, limit }: { range: RangeSpec; format: (v: number) => string; limit?: number | null }) {
  const worse = "color-mix(in oklab, var(--danger) 70%, transparent)";
  const better = "color-mix(in oklab, var(--ok) 70%, transparent)";
  const mid = "color-mix(in oklab, var(--text-tertiary) 30%, transparent)";
  const track = range.better === "high" ? `linear-gradient(90deg, ${worse}, ${mid} 50%, ${better})` : range.better === "low" ? `linear-gradient(90deg, ${better}, ${mid} 50%, ${worse})` : "linear-gradient(90deg, color-mix(in oklab, var(--accent) 25%, transparent), color-mix(in oklab, var(--accent) 75%, transparent))";
  const limitPct = limit === null || limit === undefined || range.high <= range.low ? null : Math.max(0, Math.min(100, ((limit - range.low) / (range.high - range.low)) * 100));
  const way = range.better === "high" ? "Higher is better →" : range.better === "low" ? "← Lower is better" : range.source === "year" ? "One-year range" : "Where it sits";
  const title = `Where this sits on a scale from ${format(range.low)} to ${format(range.high)}${range.better ? `: ${range.better === "high" ? "higher" : "lower"} is better` : ""}. ${range.note}${limitPct !== null ? ` The tick is the rule's limit, ${format(limit!)}.` : ""}`;
  return (
    <div className="mt-2.5" title={title}>
      <div className="relative h-1.5 rounded-full" style={{ background: track }}>
        {limitPct !== null ? <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-text-tertiary" style={{ left: `${limitPct}%` }} aria-hidden /> : null}
        <span className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-[0_0_0_1.5px_var(--surface)]" style={{ left: `${range.pct}%` }} aria-hidden />
      </div>
      <div className="data mt-1 flex items-center justify-between gap-2 text-caption text-text-tertiary">
        <span>{format(range.low)}</span>
        <span className="truncate text-center">{way}</span>
        <span>{format(range.high)}</span>
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}
