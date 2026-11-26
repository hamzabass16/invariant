"use client";

import { Briefcase, ChevronDown } from "lucide-react";

import { pickLabel, PortfolioChoices, type PortfolioPick } from "@/components/app/top-menus";

/**
 * The portfolio choice on a phone, where the top menu is not drawn: the
 * portfolio in view, opening the same choices as the top menu's selector
 * (all together, one, or the ones ticked put together). Drawn only when the
 * person has more than one portfolio.
 */
export function LensBar({ pick }: { pick: PortfolioPick }) {
  return (
    <details className="group border-b border-hairline px-4 py-2 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-subhead [&::-webkit-details-marker]:hidden">
        <Briefcase className="size-4 shrink-0 text-text-secondary" aria-hidden />
        <span className="section-header shrink-0">Portfolio</span>
        <span className="min-w-0 flex-1 truncate">{pickLabel(pick)}</span>
        <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul role="menu" aria-label="Portfolio" className="mt-2 space-y-0.5 pb-1">
        <PortfolioChoices pick={pick} compact />
      </ul>
    </details>
  );
}
