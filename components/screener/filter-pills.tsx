"use client";

import { Check, ChevronDown, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

export type PillOption = { id: string; label: string; href: string; on: boolean };
export type Pill = { id: string; label: string; options: PillOption[]; chosen: string | null; clearHref: string };

/**
 * The screener's filters as a row of pills, after TradingView's (Hamza,
 * 23 Oct 2026): each opens its choices under it, a chosen pill fills with the
 * accent and names its choice, and its cross clears it. The choices are links,
 * so a screen lives in the address; one pill is open at a time, and a click
 * outside or Escape shuts it.
 */
export function FilterPills({ pills, resetHref }: { pills: Pill[]; resetHref: string | null }) {
  const row = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const shut = (except?: Element | null) => row.current?.querySelectorAll("details[open]").forEach((d) => d !== except && d.removeAttribute("open"));
    const onDown = (e: PointerEvent) => {
      const inside = (e.target as Element | null)?.closest("details");
      shut(inside && row.current?.contains(inside) ? inside : null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && shut();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div ref={row} className="relative z-30 mb-4 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filters">
      {pills.map((p) => (
        <details key={p.id} className="group relative">
          <summary className={`flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-footnote font-medium [&::-webkit-details-marker]:hidden ${p.chosen ? "border-accent bg-accent/15 text-accent-text" : "border-hairline bg-surface text-text hover:bg-surface-3"}`}>
            <span>{p.label}</span>
            {p.chosen ? <span className="data max-w-[11rem] truncate">· {p.chosen}</span> : null}
            <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70 transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute left-0 z-30 mt-1.5 max-h-80 min-w-[13rem] overflow-y-auto rounded-card border border-hairline bg-surface-2 p-1 shadow-lg">
            {p.options.map((o) => (
              <Link key={o.id} href={o.href as Route} scroll={false} className={`flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-footnote hover:bg-surface-3 ${o.on ? "text-accent-text" : "text-text"}`}>
                <span>{o.label}</span>
                {o.on ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}
              </Link>
            ))}
            {p.chosen ? (
              <Link href={p.clearHref as Route} scroll={false} className="mt-1 flex items-center gap-2 border-t border-hairline px-3 py-2 text-footnote text-text-secondary hover:bg-surface-3">
                <X aria-hidden className="h-3.5 w-3.5" /> Any {p.label.toLowerCase()}
              </Link>
            ) : null}
          </div>
        </details>
      ))}
      {resetHref ? (
        <Link href={resetHref as Route} scroll={false} className="px-2 py-1.5 text-footnote text-accent-text">
          Clear all
        </Link>
      ) : null}
    </div>
  );
}
