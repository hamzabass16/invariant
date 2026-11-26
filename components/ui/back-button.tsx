"use client";

import { ChevronLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { backFallback, isDetailPath } from "@/lib/back";
import { cn } from "@/lib/utils";

/** Pages opened since this tab opened the app, kept for the tab alone. */
const OPENED_KEY = "pos:pages-opened";

/**
 * Back (Hamza, 11 Nov 2026: "every appropriate page has a go back button to
 * go back to the page before it was opened"): drawn on a page opened from
 * another, a company, a holding, a thesis, a trade, an agent; it goes back
 * to the page it was opened from, and when the page was opened straight from
 * a link or a new tab, to the screen it sits under (`backFallback`).
 */
export function BackButton({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  // Read on the click alone, so it is kept in a ref rather than drawn.
  const inApp = React.useRef(false);

  // Drawn in every page's header, so every page opened counts, whether or not it shows Back.
  React.useEffect(() => {
    // A page opened before this one in the same tab means the browser's back stays inside the app.
    let opened = 0;
    try {
      opened = Number(window.sessionStorage.getItem(OPENED_KEY) ?? "0") || 0;
      window.sessionStorage.setItem(OPENED_KEY, String(opened + 1));
    } catch {}
    inApp.current = opened > 0 && window.history.length > 1;
  }, [pathname]);

  if (!isDetailPath(pathname)) return null;
  const fallback = backFallback(pathname);
  return (
    <a
      href={fallback}
      onClick={(e) => {
        if (!inApp.current) return;
        e.preventDefault();
        router.back();
      }}
      className={cn("back-button inline-flex h-8 items-center gap-1 rounded-full pr-3 pl-2 text-footnote font-medium text-text transition-colors", className)}
    >
      <ChevronLeft className="size-4" aria-hidden />
      Back
    </a>
  );
}
