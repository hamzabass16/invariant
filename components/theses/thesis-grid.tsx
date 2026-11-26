import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The Theses screen's grid (Hamza, 19 Oct 2026: a grid, not a list): a
 * section header and footer as the grouped lists have, and cards two to a
 * row on a phone, three on a laptop. Each card opens its thesis.
 */
export function GridSection({ id, header, footer, children, className }: { id?: string; header: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mb-8", id && "scroll-mt-20", className)}>
      <h2 className="section-header mb-2 px-4">{header}</h2>
      <div className="pair-grid-sm trio-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {footer ? <p className="mt-2 px-4 text-footnote text-text-secondary">{footer}</p> : null}
    </section>
  );
}

export type Fact = { label: string; value: React.ReactNode };

/**
 * One thesis as a card: the symbol or title with the weight beside it, the
 * name, the tags, a few facts as label and value, and the verdict pill at
 * the foot. Figures wear the data face; status colour only in the pill.
 */
export function ThesisCard({ href, title, aside, subtitle, tags, facts, pill, note }: { href: Route; title: React.ReactNode; aside?: React.ReactNode; subtitle?: React.ReactNode; tags?: React.ReactNode; facts: readonly Fact[]; pill: React.ReactNode; note?: React.ReactNode }) {
  return (
    <Link href={href} className="card flex min-h-[11rem] flex-col gap-2 px-4 py-3.5 text-body transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-title-3 font-semibold break-words">{title}</span>
        {aside ? <span className="data shrink-0 pt-0.5 text-subhead text-text-secondary">{aside}</span> : null}
      </div>
      {subtitle ? <span className="-mt-1 line-clamp-1 text-footnote text-text-secondary">{subtitle}</span> : null}
      {tags ? <span className="flex flex-wrap items-center gap-1.5">{tags}</span> : null}
      {note ? <span className="line-clamp-2 text-footnote text-text-secondary">{note}</span> : null}
      <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-footnote">
        {facts.map((f) => (
          <React.Fragment key={f.label}>
            <dt className="text-text-tertiary">{f.label}</dt>
            <dd className="data truncate text-right text-text-secondary">{f.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-2 pt-1">{pill}</div>
    </Link>
  );
}
