import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A small (i) beside a figure that says how it is calculated (Hamza, 27 Oct
 * 2026): shown on hover, and on focus, so a tap on a phone or the Tab key
 * opens it too; hidden, it takes no room, so it never widens a page. No script: the words are in the page for a screen reader,
 * tied to the button by aria-describedby. `side` puts the words above or
 * below; `align` keeps them inside the card at a row's start or end.
 */
export function InfoTip({ id, label, text, side = "above", align = "center", className }: { id: string; label: string; text: string; side?: "above" | "below"; align?: "start" | "center" | "end"; className?: string }) {
  const tipId = `tip-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  return (
    <span className={cn("group/tip relative inline-flex align-middle", className)}>
      <button type="button" aria-label={`How ${label} is calculated`} aria-describedby={tipId} className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-accent-text focus-visible:text-accent-text">
        <Info size={12} aria-hidden />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-40 hidden w-72 max-w-[calc(100vw-2rem)] rounded-[10px] border border-hairline bg-surface-3 px-3 py-2 text-left text-caption font-normal normal-case leading-snug tracking-normal whitespace-normal text-text shadow-float group-hover/tip:block group-focus-within/tip:block",
          side === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        {text}
      </span>
    </span>
  );
}
