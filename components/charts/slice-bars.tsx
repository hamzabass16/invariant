import type { Route } from "next";
import Link from "next/link";

import type { Slice } from "@/components/charts/donut";

/**
 * A donut's slices as a list (Hamza, 19 Oct 2026, after Snowball's): the
 * colour dot, the name, the share and a bar on one scale from zero to the
 * whole, so the list reads without the ring and the legend is the list.
 */
export function SliceBars({ slices, value }: { slices: readonly Slice[]; value?: (s: Slice) => string | null }) {
  return (
    <ul className="space-y-2.5" aria-label="Each slice, with its share">
      {slices.map((s) => (
        <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)]">
          <span className="flex min-w-0 items-center gap-2 text-subhead">
            <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            {s.href ? (
              <Link href={s.href as Route} className="truncate text-accent-text hover:underline">
                {s.label}
              </Link>
            ) : (
              <span className="truncate">{s.label}</span>
            )}
          </span>
          <span className="data text-right text-subhead">
            {s.value.toFixed(s.value < 1 ? 2 : 1)}%{value?.(s) ? <span className="ml-1.5 text-footnote text-text-secondary">{value(s)}</span> : null}
          </span>
          <span className="col-span-2 block h-1.5 w-full rounded-full bg-surface-2 sm:col-span-1" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0.5, s.value))}%`, background: s.color }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
