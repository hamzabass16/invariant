"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the page where it stands while a person pages through an embedded
 * Google Slides deck (Hamza, 18 Oct 2026: every Next slid the Reviews page
 * up to the top of the section). A browser scrolls a frame into view
 * whenever something inside it takes focus, and the embed focuses itself on
 * each slide change, so the page jumped to centre the frame. Nothing inside
 * the frame can be told otherwise, so this remembers where the page stood
 * and, when a jump made while the frame has focus lands it exactly centred
 * or on a viewport edge (the shapes a focus scroll takes), puts the page
 * back. A person's own scrolling is left alone.
 */
export function StableEmbed({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = window.scrollY;
    let restoring = false;
    const landed = (frame: Element) => {
      const r = frame.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.abs((r.top + r.bottom) / 2 - vh / 2) < 3 || Math.abs(r.top) < 3 || Math.abs(r.bottom - vh) < 3;
    };
    const onScroll = () => {
      const y = window.scrollY;
      if (restoring) {
        restoring = false;
        last = y;
        return;
      }
      const frame = ref.current?.querySelector("iframe");
      if (frame && document.activeElement === frame && Math.abs(y - last) > 24 && landed(frame)) {
        restoring = true;
        window.scrollTo({ top: last, behavior: "instant" });
        return;
      }
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
