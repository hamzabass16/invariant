import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Grouped inset list: the iOS Settings shape, and the right shape for most
 *  of this app's content. */
export function ListSection({
  header,
  footer,
  children,
  className,
  trailing,
  id,
  grid = false,
}: {
  /** An anchor, so a link can bring the section into view. */
  id?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** A small control beside the header (a copy button). */
  trailing?: React.ReactNode;
  /** A list of things (holdings, trades, people, decks, studies, entries,
   *  notices) is drawn as a grid of cards, one row per card: one to a row
   *  on a phone, two from 640px, three from 1024px (Hamza, 19 Oct 2026).
   *  Settings rows, forms and label-and-value rows stay a list. The rows
   *  keep their markup; `.grid-cards` in globals.css lays each out as a
   *  card. "wide" keeps two to a row from 640px, for cards that carry a
   *  chart and a form (the watchlist; Hamza, 19 Oct 2026). */
  grid?: boolean | "wide";
}) {
  return (
    <section id={id} className={cn("mb-8", id && "scroll-mt-20", className)}>
      {header ? (
        <div className="mb-2 flex items-center justify-between gap-3 px-4">
          <h2 className="section-header">{header}</h2>
          {trailing}
        </div>
      ) : null}
      <div className={grid ? cn("grid-cards pair-grid-sm grid grid-cols-1 gap-3 sm:grid-cols-2", grid !== "wide" ? "trio-grid lg:grid-cols-3" : "pair-grid") : "list-card overflow-hidden card"}>
        {children}
      </div>
      {footer ? (
        <p className="mt-2 px-4 text-footnote text-text-secondary">{footer}</p>
      ) : null}
    </section>
  );
}

const rowBase =
  "flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-3 text-left text-body";

export function ListRow({
  label,
  detail,
  value,
  leading,
  trailing,
  className,
  wrap = false,
}: {
  label: React.ReactNode;
  detail?: React.ReactNode;
  value?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  /** Let a long label wrap instead of truncating (headlines, sentences). */
  wrap?: boolean;
}) {
  return (
    <div className={cn(rowBase, className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <div className={wrap ? "break-words" : "truncate"}>{label}</div>
        {detail ? (
          <div className="mt-0.5 text-footnote text-text-secondary">
            {detail}
          </div>
        ) : null}
      </div>
      {value ? (
        <div className="data shrink-0 text-subhead text-text-secondary">
          {value}
        </div>
      ) : null}
      {trailing}
    </div>
  );
}

export function ListLinkRow({
  href,
  label,
  detail,
  value,
  leading,
  download,
}: {
  href: Route;
  label: React.ReactNode;
  detail?: React.ReactNode;
  value?: React.ReactNode;
  leading?: React.ReactNode;
  /** A file to save (a deck), fetched as a plain link rather than a page. */
  download?: boolean;
}) {
  const className = cn(rowBase, "transition-colors duration-100 active:bg-surface-2");
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate">{label}</div>
        {detail ? (
          <div className="mt-0.5 text-footnote text-text-secondary">
            {detail}
          </div>
        ) : null}
      </div>
      {value ? (
        <span className="data shrink-0 text-subhead text-text-secondary">
          {value}
        </span>
      ) : null}
      <ChevronRight
        className="size-4 shrink-0 text-text-tertiary"
        aria-hidden
      />
    </>
  );
  return download ? (
    <a href={href} download className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export function ListButtonRow({
  label,
  detail,
  value,
  leading,
  selected,
  onClick,
  type = "button",
  className,
}: {
  label: React.ReactNode;
  detail?: React.ReactNode;
  value?: React.ReactNode;
  leading?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        rowBase,
        "transition-colors duration-100 active:bg-surface-2",
        selected && "bg-accent-subtle",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate">{label}</div>
        {detail ? (
          <div className="mt-0.5 text-footnote text-text-secondary">
            {detail}
          </div>
        ) : null}
      </div>
      {value ? (
        <span className="data shrink-0 text-subhead text-text-secondary">
          {value}
        </span>
      ) : null}
    </button>
  );
}
