import { ChevronDown, type LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Where an input stands: in use, waiting on the person, needing attention, optional, or shown for the demo. */
export type CardState = "in_use" | "missing" | "attention" | "optional" | "demo";

const STATE: Record<CardState, { label: string; tone: string; dot: string }> = {
  in_use: { label: "In use", tone: "border-hairline-strong text-text", dot: "bg-ok" },
  missing: { label: "Not added", tone: "border-hairline-strong bg-surface-2 text-text-secondary", dot: "bg-text-tertiary" },
  attention: { label: "Needs you", tone: "border-warn/40 bg-warn/10 text-warn", dot: "bg-warn" },
  optional: { label: "Optional", tone: "border-hairline-strong bg-surface-2 text-text-tertiary", dot: "bg-text-tertiary" },
  demo: { label: "Demo", tone: "border-accent/40 bg-accent-subtle text-accent-text", dot: "bg-accent" },
};

export function StatePill({ state, label }: { state: CardState; label?: string }) {
  const s = STATE[state];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-caption font-medium", s.tone)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

/** One fact the app holds: what it is and the value, with a date when it has one. */
export type Fact = { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "muted" };

/**
 * An input on Setup, always the same shape: what it is for, whether it is in
 * use, what the app holds now and since when, the actions, and the guide
 * folded away until it is wanted.
 */
export function SetupCard({
  id,
  icon: Icon,
  title,
  about,
  state,
  stateLabel,
  facts,
  actions,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  about: string;
  state: CardState;
  stateLabel?: string;
  facts?: Fact[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="reveal mb-4 scroll-mt-24 overflow-hidden card">
      <header className="flex items-start gap-3 px-4 pt-4 pb-3 lg:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-text" aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="text-body font-semibold">{title}</h3>
            <StatePill state={state} label={stateLabel} />
          </div>
          <p className="mt-0.5 text-footnote text-text-secondary">{about}</p>
        </div>
      </header>
      {facts?.length ? (
        <dl className="mx-4 mb-3 grid gap-px overflow-hidden rounded-xl bg-hairline lg:mx-5">
          {facts.map((f) => (
            <div key={f.label} className="grid gap-0.5 bg-surface-2 px-3 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
              <dt className="text-caption text-text-tertiary sm:pt-0.5">{f.label}</dt>
              <dd className={cn("text-subhead", f.tone === "ok" ? "text-ok" : f.tone === "warn" ? "text-warn" : f.tone === "muted" ? "text-text-secondary" : "text-text")}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="flex flex-wrap items-center gap-2 px-4 pb-4 lg:px-5">{actions}</div> : null}
      {children ? <div className="border-t border-hairline">{children}</div> : null}
    </section>
  );
}

/** A part of a card folded away: a replace form, a guide. Opens in place; nothing else moves. */
export function Fold({ title, icon: Icon, children, open = false }: { title: string; icon?: LucideIcon; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group border-b border-hairline last:border-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-subhead text-accent-text select-none lg:px-5 [&::-webkit-details-marker]:hidden">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4 lg:px-5">{children}</div>
    </details>
  );
}

/** A group of cards under a numbered heading: your rules, your money, what the app reads for you, how you see it, your account. */
export function SetupGroup({ n, title, about, children }: { n: number; title: string; about: string; children: React.ReactNode }) {
  return (
    <section className="mb-10" aria-labelledby={`group-${n}`}>
      <div className="mb-3 flex items-baseline gap-3 px-1">
        <span className="data text-title-3 font-semibold text-accent-text" aria-hidden>
          {String(n).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h2 id={`group-${n}`} className="section-header">
            {title}
          </h2>
          <p className="text-footnote text-text-tertiary">{about}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
