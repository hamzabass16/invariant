import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Desaturated by design. This app reports broken rules and missed
 *  deadlines; it must not look like a trading game. */
const status = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption font-medium",
  {
    variants: {
      tone: {
        ok: "bg-ok/15 text-ok",
        warn: "bg-warn/15 text-warn",
        danger: "bg-danger/15 text-danger",
        info: "bg-info/15 text-info",
        neutral: "bg-surface-2 text-text-secondary",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function StatusPill({
  tone,
  children,
  className,
}: VariantProps<typeof status> & {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn(status({ tone }), className)}>{children}</span>;
}
