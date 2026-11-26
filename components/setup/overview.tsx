import { Check, Circle, CircleAlert, Minus } from "lucide-react";

import type { CardState } from "@/components/setup/setup-card";
import { cn } from "@/lib/utils";

export type OverviewItem = { id: string; label: string; state: CardState; note: string };

const ICON: Record<CardState, { Icon: typeof Check; tone: string }> = {
  in_use: { Icon: Check, tone: "bg-ok/15 text-ok" },
  attention: { Icon: CircleAlert, tone: "bg-warn/15 text-warn" },
  missing: { Icon: Circle, tone: "bg-surface-3 text-text-tertiary" },
  optional: { Icon: Minus, tone: "bg-surface-3 text-text-tertiary" },
  demo: { Icon: Check, tone: "bg-accent-subtle text-accent-text" },
};

/**
 * The top of Setup: every input at a glance, what the app holds for each,
 * and a bar of how many are in use. Each tile opens its card below.
 */
export function SetupOverview({ items, demo }: { items: OverviewItem[]; demo: boolean }) {
  const counted = items.filter((i) => i.state !== "optional");
  const inUse = counted.filter((i) => i.state === "in_use" || i.state === "demo").length;
  const pct = counted.length ? Math.round((inUse / counted.length) * 100) : 100;
  const attention = items.filter((i) => i.state === "attention").length;
  return (
    <section className="reveal mb-10 card px-4 py-4 lg:px-5" aria-label="Your setup at a glance">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-title-3 font-semibold">
            <span className="data">{inUse}</span> of <span className="data">{counted.length}</span> in use
            {attention ? <span className="ml-2 text-subhead font-normal text-warn">· {attention} need{attention === 1 ? "s" : ""} you</span> : null}
          </h2>
        </div>
        <p className="text-footnote text-text-tertiary">{demo ? "What the demo's snapshot holds; your own app shows yours." : "Tap one to open its card."}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(({ id, label, state, note }) => {
          const { Icon, tone } = ICON[state];
          return (
            <li key={id}>
              <a href={`#${id}`} className="flex h-full items-start gap-2.5 rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 transition-colors hover:border-hairline-strong hover:bg-surface-3">
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", tone)} aria-hidden>
                  <Icon className="size-3" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-subhead font-medium">{label}</span>
                  <span className="block truncate text-caption text-text-tertiary">{note}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
