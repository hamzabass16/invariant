import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's own size names. Unextended, it read
 * `text-body`, `text-subhead` and the rest of the iOS type scale in
 * globals.css as text colours, so `cn("text-body", "text-text-secondary")`
 * silently dropped the size — and a ghost button lost its accent colour to its
 * own size class. Declaring the scale once fixes every caller.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["large-title", "title-1", "title-2", "title-3", "body", "subhead", "footnote", "caption"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Short confirmation buzz on assignment, approval, and checklist completion.
 * Reinforcement only — never the sole feedback channel.
 */
export function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}
