import type { SubjectKind } from "@/lib/earnings";

/**
 * A chip's look by why the company is on the calendar: held in the accent,
 * watched on a raised surface, added in outline. The month itself is the
 * Calendar's (Hamza, 27 Oct 2026: one calendar), components/markets/econ-month.tsx.
 */
export const CHIP: Record<SubjectKind, string> = {
  holding: "bg-accent-subtle text-accent-text",
  watch: "bg-surface-3 text-text",
  added: "border border-hairline-strong text-text-secondary",
};
