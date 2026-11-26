"use client";

import * as React from "react";

import { isTradingHours } from "@/lib/live";

/**
 * Draws `open` while the US market is open (09:30 to 16:00 New York on a
 * weekday) and `closed` otherwise, checked again every minute, so a tab left
 * open turns over at the bell without a reload. Both are rendered on the
 * server from the same clock, so the first paint matches.
 */
export function MarketHoursGate({ open, closed }: { open: React.ReactNode; closed: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(() => isTradingHours(new Date()));
  React.useEffect(() => {
    const tick = () => setOpen(isTradingHours(new Date()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{isOpen ? open : closed}</>;
}
