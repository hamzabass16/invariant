"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { OPEN_PAGE_REFRESH_MINUTES } from "@/lib/live";

/**
 * While a page says a read is still running behind it (the last session's
 * five hundred companies after a close), asks the server for the page again
 * every `every` seconds until it comes back without this component, so the
 * cards appear by themselves instead of on the next visit (Hamza, 16 Oct
 * 2026). Gives up after `times` tries; nothing is read from the browser.
 */
export function RefreshWhilePending({ every = 15, times = 20 }: { every?: number; times?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    let n = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      n += 1;
      if (n > times) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, every * 1000);
    return () => window.clearInterval(timer);
  }, [router, every, times]);
  return null;
}

/**
 * A page left open keeps up by itself: every `OPEN_PAGE_REFRESH_MINUTES`
 * while it is in view, and the moment it comes back into view after at
 * least that long away, it asks the server for the page again, so the
 * evening statement, a recap written after the close, a new alert or a
 * report read in the background appear without a reload (Hamza, 17 Oct
 * 2026). The refresh re-renders the server's part and keeps what the
 * person is doing on the page; the live prices keep their own rhythm.
 */
export function RefreshWhileOpen() {
  const router = useRouter();
  React.useEffect(() => {
    let last = Date.now();
    const gap = OPEN_PAGE_REFRESH_MINUTES * 60 * 1000;
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last >= gap) refresh();
    };
    const timer = window.setInterval(tick, 30 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}
