"use client";

import * as React from "react";

import { reach } from "@/components/app/reach";
import { cn } from "@/lib/utils";

/** A server action's answer with the moment it came back, so a success can be told from the form's first render. */
export type Ran<S extends { error: string | null }> = S & { ran?: number };

/** Wraps a server action so its answer carries when it ran, and a trip that failed comes back as its sentence (`reach`), never thrown into the page. */
export function stamped<S extends { error: string | null }, A extends unknown[]>(action: (...args: A) => Promise<S>): (...args: A) => Promise<Ran<S>> {
  return async (...args: A) => ({ ...((await reach(() => action(...args))) as S), ran: Date.now() });
}

/**
 * True for a few seconds after an action succeeds: long enough to be seen,
 * gone before it is noise. `then` runs once the mark has been seen, for an
 * action whose result lives on another screen.
 */
export function useDone(state: { error: string | null; ran?: number }, ms = 2800, then?: () => void): boolean {
  const [expired, setExpired] = React.useState<number | null>(null);
  const thenRef = React.useRef(then);
  React.useEffect(() => {
    thenRef.current = then;
  });
  React.useEffect(() => {
    if (!state.ran || state.error) return;
    const ran = state.ran;
    const next = window.setTimeout(() => thenRef.current?.(), 900);
    const timer = window.setTimeout(() => setExpired(ran), ms);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(next);
    };
  }, [state.ran, state.error, ms]);
  return !!state.ran && !state.error && expired !== state.ran;
}

/** The check: a circle that draws, a check that strokes in, a word beside it. Announced to screen readers. */
export function DoneMark({ label = "Done", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 text-footnote font-medium text-ok", className)}>
      <svg viewBox="0 0 24 24" className="done-mark size-5 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M7.5 12.5l3 3 6-6.5" />
      </svg>
      <span className="done-label">{label}</span>
    </span>
  );
}
