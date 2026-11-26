import { cn } from "@/lib/utils";

/** A move's direction as a drawn mark: a triangle up or down, a short bar for no move. The figure beside it carries the sign. */
export function MoveMark({ pct, className }: { pct: number; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={cn("size-[0.7em] shrink-0", className)} fill="currentColor">
      {pct > 0 ? <path d="M6 1.5 11 10H1z" /> : pct < 0 ? <path d="M6 10.5 1 2h10z" /> : <rect x="1.5" y="5" width="9" height="2" rx="1" />}
    </svg>
  );
}
