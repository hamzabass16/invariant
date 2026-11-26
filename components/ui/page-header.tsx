"use client";

import * as React from "react";

import { SearchButton } from "@/components/app/palette";
import { StealthToggle } from "@/components/app/stealth";
import { BackButton } from "@/components/ui/back-button";
import { MarketCountdownBadge } from "@/components/live/countdown";
import { cn } from "@/lib/utils";

/**
 * Phone: iOS large title, 34px, collapsing into the 17px nav bar on scroll. A
 * sentinel drives the swap so there is no scroll maths on the main thread.
 * Laptop: a static macOS-style page title. The collapsing nav bar is an iOS
 * idiom and does not belong on a desktop window.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  help,
  navAction,
  fresh,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Page-level action, shown beside the title. */
  action?: React.ReactNode;
  /** The ? that opens this page's section of the guide. */
  help?: React.ReactNode;
  /** Phone-only nav bar slot. */
  navAction?: React.ReactNode;
  /** How fresh the screen's figures are: live, at the close, daily, uploaded (components/ui/freshness.tsx). */
  fresh?: React.ReactNode;
}) {
  const sentinel = React.useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-44px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        className={cn(
          "safe-top sticky top-0 z-30 backdrop-blur-xl transition-[background-color,border-color] duration-200 lg:hidden",
          collapsed
            ? "border-b border-hairline bg-[var(--nav-blur)]"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto flex h-11 max-w-2xl items-center justify-between gap-3 px-4">
          <span
            className={cn(
              "truncate text-body font-semibold transition-opacity duration-200",
              collapsed ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={!collapsed}
          >
            {title}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {navAction}
            <SearchButton compact />
            <StealthToggle compact />
          </div>
        </div>
      </div>

      <header className="reveal mx-auto w-full max-w-2xl px-4 pt-2 pb-3 lg:max-w-content lg:px-8 lg:pt-6 lg:pb-4">
        {/* Phone: the action sits under the title, so a wide one (the market countdown) never squeezes it. Laptop: beside it. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <BackButton className="-ml-1 mb-2" />
            <h1 className="font-display text-large-title font-medium tracking-[-0.01em] text-balance lg:text-[2.25rem] lg:leading-[2.625rem]">
              {title}
            </h1>
            <span className="gilt-rule mt-3" aria-hidden />
            {subtitle ? (
              <p className="mt-2 text-subhead text-text-secondary">{subtitle}</p>
            ) : null}
            {fresh ? <div className="mt-2.5 flex flex-wrap gap-2">{fresh}</div> : null}
          </div>
          {/* The market clock sits top right on every page (Hamza, 19 Oct 2026); a page's own action beside it. */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 empty:hidden lg:justify-end">
            {action}
            {help}
            <MarketCountdownBadge />
          </div>
        </div>
      </header>
      <div ref={sentinel} aria-hidden />
    </>
  );
}
