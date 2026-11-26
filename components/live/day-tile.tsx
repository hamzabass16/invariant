import * as React from "react";

import { money } from "@/lib/holdings";
import { moveFill, moveInk, MOVE_FULL_AT, signedPct, signedPts, type BookDay } from "@/lib/market-day";
import { MoveMark } from "@/components/ui/move-mark";
import { cn } from "@/lib/utils";

type Row = Pick<BookDay["rows"][number], "symbol" | "weight" | "changePct" | "contribution">;

/** How far a move leans the card's wash toward its colour: 20% flat, 45% at a full move of the book. */
const washOf = (pct: number) => Math.round(20 + 25 * Math.min(1, Math.abs(pct) / (MOVE_FULL_AT / 2)));

/**
 * The book's day as the Dashboard's lead tile (Hamza, 19 Oct 2026: "colorize
 * the Today so far card and make it pop out more, fill the space"): a wash in
 * the heat map's colour for the day's move, the move large with the money
 * beside it, the share of the book up and down as a split bar, and the
 * holdings that made and cost the most as chips in the map's colours.
 */
export function DayTile({ label, pct, change, ccy, rows, badge, className }: { label: string; pct: number; change: number; ccy: string; rows: readonly Row[]; badge?: React.ReactNode; className?: string }) {
  const side = pct > 0 ? "var(--move-up)" : pct < 0 ? "var(--move-down)" : "var(--move-mid)";
  const wash = washOf(pct);
  const upW = rows.filter((r) => r.changePct > 0).reduce((s, r) => s + r.weight, 0);
  const downW = rows.filter((r) => r.changePct < 0).reduce((s, r) => s + r.weight, 0);
  const flatW = rows.filter((r) => r.changePct === 0).reduce((s, r) => s + r.weight, 0);
  const all = upW + downW + flatW;
  const up = rows.filter((r) => r.changePct > 0).length;
  const down = rows.filter((r) => r.changePct < 0).length;
  const sorted = [...rows].sort((a, b) => b.contribution - a.contribution || a.symbol.localeCompare(b.symbol));
  const made = sorted.filter((r) => r.contribution > 0).slice(0, 3);
  const cost = sorted.filter((r) => r.contribution < 0).reverse().slice(0, 3);
  // The day's move in the gain and loss colours (Hamza, 20 Oct 2026: red when down, green when up).
  // An up move prints in the move blue, lifted toward the text so it reads on the ground; green is a status, never a move.
  const tone = pct > 0 ? "text-[color-mix(in_oklab,var(--move-up)_60%,var(--text))]" : pct < 0 ? "text-danger" : "text-text-secondary";
  const signedMoney = `${change > 0 ? "+" : change < 0 ? "-" : ""}${money(Math.abs(change), ccy)}`;
  return (
    <div
      className={cn("card relative flex flex-col overflow-hidden px-4 py-3.5", className)}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${side} ${wash}%, var(--surface-1)) 0%, color-mix(in oklab, ${side} ${Math.round(wash / 3)}%, var(--surface-1)) 70%)`,
        borderColor: `color-mix(in oklab, ${side} 45%, var(--hairline))`,
      }}
      data-day-tile
    >
      <p className="section-header">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <p className={cn("data figure-in text-large-title font-bold tracking-[-0.02em]", tone)}>
          <MoveMark pct={pct} className="mr-1.5 inline align-[0.05em]" />
          {signedPct(pct)}
        </p>
        <p className={cn("data text-title-3 font-semibold", tone)}>{signedMoney}</p>
      </div>
      {all > 0 ? (
        <div className="mt-3">
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${up} up, ${down} down, by weight ${((upW / all) * 100).toFixed(0)}% up and ${((downW / all) * 100).toFixed(0)}% down`}>
            {upW > 0 ? <span className="h-full rounded-l-full" style={{ width: `${(upW / all) * 100}%`, background: "var(--move-up)" }} /> : null}
            {flatW > 0 ? <span className="h-full" style={{ width: `${(flatW / all) * 100}%`, background: "var(--move-mid)" }} /> : null}
            {downW > 0 ? <span className="h-full rounded-r-full" style={{ width: `${(downW / all) * 100}%`, background: "var(--move-down)" }} /> : null}
          </div>
          <p className="mt-1 flex justify-between text-caption text-text-secondary">
            <span className="data">{up} up · {((upW / all) * 100).toFixed(0)}% of the book</span>
            <span className="data">{down} down · {((downW / all) * 100).toFixed(0)}%</span>
          </p>
        </div>
      ) : null}
      {made.length || cost.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Chips title="Made the most" rows={made} />
          <Chips title="Cost the most" rows={cost} />
        </div>
      ) : null}
      {badge ? <div className="mt-auto pt-2">{badge}</div> : null}
    </div>
  );
}

function Chips({ title, rows }: { title: string; rows: readonly Row[] }) {
  if (!rows.length) return null;
  return (
    <div className="min-w-0">
      <p className="text-caption text-text-tertiary">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <li key={r.symbol} className="data inline-flex items-baseline gap-1.5 rounded-lg px-2 py-1 text-footnote" style={{ background: moveFill(r.changePct), color: moveInk(r.changePct) }} title={`${r.symbol} ${signedPct(r.changePct)}, ${signedPts(r.contribution)} of the book's move`}>
            <span className="font-semibold">{r.symbol}</span>
            <span>{signedPct(r.changePct)}</span>
            <span className="hidden opacity-80 sm:inline">{signedPts(r.contribution)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
