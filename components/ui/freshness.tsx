"use client";

import type { Fresh } from "@/lib/freshness";
import { cn } from "@/lib/utils";

const TONE: Record<Fresh["kind"], { dot: string; text: string; ring: string }> = {
  live: { dot: "bg-ok", text: "text-ok", ring: "border-ok/40 bg-ok/10" },
  closed: { dot: "bg-text-secondary", text: "text-text-secondary", ring: "border-hairline-strong bg-surface-2" },
  close: { dot: "bg-accent", text: "text-accent-text", ring: "border-accent/40 bg-accent-subtle" },
  daily: { dot: "bg-accent", text: "text-accent-text", ring: "border-accent/40 bg-accent-subtle" },
  hourly: { dot: "bg-accent", text: "text-accent-text", ring: "border-accent/40 bg-accent-subtle" },
  weekly: { dot: "bg-text-secondary", text: "text-text-secondary", ring: "border-hairline-strong bg-surface-2" },
  upload: { dot: "bg-text-secondary", text: "text-text-secondary", ring: "border-hairline-strong bg-surface-2" },
  snapshot: { dot: "bg-text-tertiary", text: "text-text-secondary", ring: "border-hairline-strong bg-surface-2" },
  sample: { dot: "bg-text-tertiary", text: "text-text-secondary", ring: "border-hairline-strong bg-surface-2" },
};

/**
 * How fresh what is on screen is, as a small pill: Live in green with a
 * spreading ring, Markets have closed in grey on a live card outside the
 * session, At the close, Daily or Hourly in the accent, Uploaded,
 * Snapshot or Sample in grey, and amber when a dated figure is older than
 * its rhythm allows. The sentence behind it is its title.
 */
export function FreshBadge({ fresh, detail, className, compact = false }: { fresh: Fresh; detail?: string | null; className?: string; compact?: boolean }) {
  const t = fresh.stale ? { dot: "bg-warn", text: "text-warn", ring: "border-warn/40 bg-warn/10" } : TONE[fresh.kind];
  const when = detail ?? fresh.when;
  return (
    <span title={fresh.rhythm} aria-label={`${fresh.label}${when ? `, ${when}` : ""}. ${fresh.rhythm}`} className={cn("inline-flex shrink-0 items-center gap-1.5 align-middle text-caption font-medium normal-case tracking-normal", compact ? "h-5" : cn("h-6 rounded-full border px-2.5", t.ring), className)} data-fresh={fresh.kind}>
      <span className="relative flex size-2" aria-hidden>
        {fresh.kind === "live" ? <span className={cn("live-ping absolute inline-flex size-full rounded-full", t.dot)} /> : null}
        <span className={cn("relative inline-flex size-2 rounded-full", t.dot)} />
      </span>
      <span className={t.text}>{fresh.label}</span>
      {when ? <span className="data font-normal text-text-tertiary">{when}</span> : null}
    </span>
  );
}

/**
 * The page's badge: where the book comes from and the day it is as of. It
 * never says Live: prices now are badged on the cards that lay them, so the
 * page never claims more than its figures are (Hamza, 15 Oct 2026).
 */
export function PageFreshness({ fresh }: { fresh: Fresh | null }) {
  if (!fresh) return null;
  return <FreshBadge fresh={fresh} detail={fresh.when ? `${fresh.kind === "upload" || fresh.kind === "snapshot" ? "as of" : "statement"} ${fresh.when}` : null} />;
}
