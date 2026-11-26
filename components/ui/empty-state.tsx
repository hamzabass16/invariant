import type { LucideIcon } from "lucide-react";
import * as React from "react";

/**
 * Empty states instruct. They never apologise and never celebrate.
 *
 * `action` is required so every call site decides what can be done from here;
 * pass `null` only where there genuinely is nothing to do.
 */
export function EmptyState({
  icon: Icon,
  title,
  instruction,
  action,
}: {
  icon: LucideIcon;
  title: string;
  instruction: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <Icon className="size-7 text-text-tertiary" aria-hidden />
      <p className="mt-4 text-body font-medium">{title}</p>
      <p className="mt-1 max-w-[38ch] text-subhead text-text-secondary">
        {instruction}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
