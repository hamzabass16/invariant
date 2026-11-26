"use client";

import * as React from "react";

import { agoText, CLOSED_AGO_MINUTES, countdownText, isTradingHours, marketCountdown, nextOpen, sinceClose, type MarketCountdown } from "@/lib/live";
import { cn } from "@/lib/utils";

type State = { kind: "live"; closes: MarketCountdown | null } | { kind: "countdown"; left: MarketCountdown } | { kind: "closed"; ago: number | null; opens: string } | null;

/** What the top right says at this instant: during the session, that the market is live (with the countdown to the close in its last two hours); a countdown to the open within two hours of it; the time since the close for two hours after it; then that the market has closed and when it opens. */
export function marketState(now: Date): State {
  const left = marketCountdown(now);
  if (isTradingHours(now)) return { kind: "live", closes: left && left.to === "close" ? left : null };
  if (left) return { kind: "countdown", left };
  const ago = sinceClose(now);
  const next = nextOpen(now);
  return { kind: "closed", ago: ago !== null && ago <= CLOSED_AGO_MINUTES * 60 ? ago : null, opens: `Opens ${next.when} 09:30 New York` };
}

/**
 * The top right of every page (Hamza, 19 Oct 2026), by the device's clock
 * against New York's: during the session "Market is live" in green with a
 * blinking dot, and the countdown to the close in its last two hours; a
 * countdown to the open within two hours of it; for two hours after the
 * close, how long ago it closed; then that the markets have closed and when
 * they open (Hamza, 15 Oct 2026). Nothing is fetched or kept.
 */
export function MarketCountdownBadge() {
  const [state, setState] = React.useState<State>(null);
  React.useEffect(() => {
    const tick = () => setState(marketState(new Date()));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  if (!state) return null;
  if (state.kind === "live") {
    const closes = state.closes;
    const detail = closes ? `${closes.early ? "Closes early in" : "Closes in"} ${countdownText(closes.seconds)}` : null;
    return (
      <div
        role="status"
        aria-label={`Market is live${detail ? `. ${detail}` : ""}`}
        data-countdown="live"
        className="market-live figure-in inline-flex items-center gap-2.5 rounded-full border border-ok/45 px-3.5 py-1.5"
      >
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          <span className="live-ping absolute inset-0 rounded-full bg-ok" />
          <span className="live-blink relative size-2.5 rounded-full bg-ok" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-subhead font-semibold tracking-[0.01em] text-ok">Market is live</span>
          {detail ? <span className="data text-caption tabular-nums text-text-secondary">{detail}</span> : null}
        </span>
      </div>
    );
  }
  if (state.kind === "closed") {
    const label = state.ago !== null ? "Market closed" : "Markets have closed";
    const detail = state.ago !== null ? agoText(state.ago) : state.opens;
    return (
      <div role="status" aria-label={`${label}. ${detail}`} data-countdown="closed" className="figure-in inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-surface-2 px-3 py-1.5">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="relative size-2 rounded-full bg-text-tertiary" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-caption text-text-secondary">{label}</span>
          <span className="data text-subhead font-semibold tabular-nums text-text-primary">{detail}</span>
        </span>
      </div>
    );
  }
  const left = state.left;
  const open = left.to === "open";
  const soon = left.seconds <= 15 * 60;
  const label = open ? "US market opens in" : left.early ? "US market closes early in" : "US market closes in";
  return (
    <div
      role="timer"
      aria-label={`${label} ${countdownText(left.seconds)}`}
      data-countdown={left.to}
      className={cn(
        "figure-in inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        open ? "border-accent/40 bg-accent-subtle" : soon ? "border-warn/40 bg-warn/10" : "border-ok/40 bg-ok/10",
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {open ? null : <span className={cn("live-ping absolute inset-0 rounded-full", soon ? "bg-warn" : "bg-ok")} />}
        <span className={cn("relative size-2 rounded-full", open ? "bg-accent" : soon ? "bg-warn" : "bg-ok")} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-caption text-text-secondary">{open ? "Market opens in" : left.early ? "Market closes early in" : "Market closes in"}</span>
        <span className={cn("data text-subhead font-semibold tabular-nums", open ? "text-accent-text" : soon ? "text-warn" : "text-ok")}>{countdownText(left.seconds)}</span>
      </span>
    </div>
  );
}
