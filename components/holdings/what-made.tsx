import { Info } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { companyHref } from "@/lib/company";
import { money } from "@/lib/holdings";
import { moveFillAt, moveInkAt } from "@/lib/market-day";
import { inViewSize, squarify } from "@/lib/treemap";
import { MADE_WINDOW_LABEL, MADE_WINDOWS, type HoldingMade, type MadeWindow, type WhatMade } from "@/lib/holding-made";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const signed = (v: number, ccy: string) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${money(Math.abs(v), ccy)}`;

/** Full colour at this return either way: thirty percent, a year's or a lifetime's move for one company. */
const FULL_AT = 30;
const LEGEND = [-30, -20, -10, 0, 10, 20, 30];
const SHAPES = [
  { key: "wide", w: 1200, h: 560, className: "hidden sm:block" },
  { key: "tall", w: 420, h: 620, className: "block sm:hidden" },
] as const;
const pctWords = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)}%`;

/**
 * The holdings still held as a heat map (Hamza, 19 Oct 2026): each a tile
 * sized by its value now and coloured by its return over the window, full
 * colour at FULL_AT either way, its ticker, return and money on the tile
 * where it has room.
 */
function MadeMap({ rows, ccy }: { rows: HoldingMade[]; ccy: string }) {
  return (
    <>
      {SHAPES.map((shape) => (
        <svg key={shape.key} viewBox={`0 0 ${shape.w} ${shape.h}`} className={`${shape.className} w-full`} role="img" aria-label={`Heat map of ${rows.length} holdings, sized by value and coloured by return`}>
          {squarify(rows, inViewSize(rows, (r) => r.value), { x: 0, y: 0, w: shape.w, h: shape.h }).map((t) => {
            const r = t.item;
            const pct = r.pct ?? 0;
            const fill = r.pct === null ? "var(--move-mid)" : moveFillAt(pct, FULL_AT);
            const ink = r.pct === null ? "var(--text)" : moveInkAt(pct, FULL_AT);
            const fs = Math.max(11, Math.min(38, t.w / 4.6, t.h / 3.4));
            const showTicker = t.w >= 34 && t.h >= 20;
            const showPct = showTicker && t.h >= fs * 2.3 && t.w >= fs * 3;
            const showMoney = showPct && t.h >= fs * 3.1 && t.w >= fs * 0.5 * 12;
            const offsets = [0, fs * 1.0, fs * 1.72].slice(0, showMoney ? 3 : showPct ? 2 : 1);
            const span = 0.8 * fs + offsets[offsets.length - 1] + 0.15 * fs;
            const top = t.y + t.h / 2 - span / 2 + 0.8 * fs;
            return (
              <a key={r.symbol} href={companyHref(r.symbol)} aria-label={`${r.symbol}: its company page`}>
                <rect x={t.x + 1.5} y={t.y + 1.5} width={Math.max(0, t.w - 3)} height={Math.max(0, t.h - 3)} rx={8} fill={fill}>
                  <title>{`${r.symbol} · ${r.pct === null ? "no return" : pctWords(r.pct)} · ${signed(r.made, ccy)}${Math.abs(r.dividends) >= 0.5 ? ` · ${money(r.dividends, ccy)} in dividends` : ""}`}</title>
                </rect>
                {showTicker ? (
                  <text x={t.x + t.w / 2} y={offsets.length === 1 ? t.y + t.h / 2 + fs * 0.35 : top} textAnchor="middle" className="data" fontSize={fs} fontWeight={600} fill={ink} pointerEvents="none">
                    {r.symbol}
                  </text>
                ) : null}
                {showPct ? (
                  <text x={t.x + t.w / 2} y={top + offsets[1]} textAnchor="middle" className="data" fontSize={fs * 0.6} fontWeight={600} fill={ink} pointerEvents="none">
                    {r.pct === null ? "–" : pctWords(r.pct)}
                  </text>
                ) : null}
                {showMoney ? (
                  <text x={t.x + t.w / 2} y={top + offsets[2]} textAnchor="middle" className="data" fontSize={fs * 0.5} fill={ink} opacity={0.85} pointerEvents="none">
                    {signed(r.made, ccy)}
                  </text>
                ) : null}
              </a>
            );
          })}
        </svg>
      ))}
    </>
  );
}

function Column({ title, rows, scale, ccy, up }: { title: string; rows: HoldingMade[]; scale: number; ccy: string; up: boolean }) {
  const tone = up ? "var(--move-up)" : "var(--move-down)";
  return (
    <div className="min-w-0">
      <p className="mb-2 text-subhead font-medium text-text-secondary">{title}</p>
      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.symbol} className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="data font-semibold">{r.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-footnote text-text-tertiary">
                  {[r.sold ? "sold" : null, Math.abs(r.dividends) >= 0.5 ? `${money(r.dividends, ccy)} in dividends` : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
                </span>
                <span className="data shrink-0 font-semibold" style={{ color: tone }}>
                  {signed(r.made, ccy)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="h-1.5 rounded-full" style={{ width: `${scale > 0 ? Math.max(2, (Math.abs(r.made) / scale) * 100) : 0}%`, background: tone }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-footnote text-text-secondary">{up ? "No holding made money in this time." : "No holding lost money in this time."}</p>
      )}
    </div>
  );
}

/**
 * What each holding made, past year or since you started (Hamza, 19 Oct
 * 2026): the total, then the holdings held as a heat map sized by value and
 * coloured by return, the ones sold in a line under it, and, folded, the
 * holdings that added most and the ones that held the book back as bars on
 * one scale with their dividends; interest and fees on a line of their own;
 * what could not be priced named.
 */
export function WhatEachMade({ made, ccy, hrefFor, badge }: { made: WhatMade; ccy: string; hrefFor: (w: MadeWindow) => string; badge?: React.ReactNode }) {
  const gains = made.rows.filter((r) => r.made > 0);
  const losses = made.rows.filter((r) => r.made < 0).reverse();
  const scale = Math.max(0, ...made.rows.map((r) => Math.abs(r.made)));
  const held = made.rows.filter((r) => !r.sold && r.value > 0);
  const sold = made.rows.filter((r) => r.sold);
  const about =
    made.window === "year"
      ? "Each holding's value now less its value a year ago (the shares then at that day's close, at today's exchange rate), less what was bought and plus what was sold this year, plus its dividends."
      : "Each holding's value now less its cost basis from the broker, plus what its sales realised and its dividends.";
  return (
    <section id="what-made" className="card mb-8 scroll-mt-20 px-4 py-4 sm:px-5" aria-label="What each holding made">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
            What each holding made
            <span title={about} className="text-text-tertiary">
              <Info className="size-4" aria-label={about} />
            </span>
            {badge}
          </h3>
          <p className="mt-1 text-subhead text-text-secondary">
            {made.from ? `Since ${longDate(made.from)}` : "Since you started"}: <span className="data text-text">{signed(made.total, ccy)}</span> in all.
          </p>
        </div>
        <nav className="inline-flex rounded-full border border-hairline p-0.5" aria-label="Over what time">
          {MADE_WINDOWS.map((w) => (
            <Link key={w} href={hrefFor(w) as Route} scroll={false} aria-current={w === made.window ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-footnote font-medium transition-colors", w === made.window ? "bg-text text-bg" : "text-text-secondary hover:text-text")}>
              {MADE_WINDOW_LABEL[w]}
            </Link>
          ))}
        </nav>
      </div>
      {made.rows.length ? (
        <>
          {held.length ? (
            <>
              <div className="mt-4 flex justify-end" aria-hidden>
                <div className="flex overflow-hidden rounded-[6px]">
                  {LEGEND.map((v) => (
                    <span key={v} className="data px-2 py-0.5 text-caption" style={{ background: moveFillAt(v, FULL_AT), color: moveInkAt(v, FULL_AT) }}>
                      {v > 0 ? `+${v}` : v}%
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-2">
                <MadeMap rows={held} ccy={ccy} />
              </div>
            </>
          ) : null}
          {sold.length ? (
            <p className="mt-3 text-footnote text-text-secondary">
              Sold in this time:{" "}
              {sold.map((r, i) => (
                <span key={r.symbol}>
                  {i ? ", " : ""}
                  <span className="data font-semibold text-text">{r.symbol}</span> <span className="data" style={{ color: r.made >= 0 ? "var(--move-up)" : "var(--move-down)" }}>{signed(r.made, ccy)}</span>
                </span>
              ))}
              .
            </p>
          ) : null}
          <details className="group mt-4 border-t border-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-subhead text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
              <span>Added the most and held you back</span>
              <span className="text-caption text-text-tertiary group-open:hidden">Open</span>
              <span className="hidden text-caption text-text-tertiary group-open:inline">Close</span>
            </summary>
            <div className="grid gap-6 pb-2 lg:grid-cols-2 lg:gap-10">
              <Column title="Added the most" rows={gains} scale={scale} ccy={ccy} up />
              <Column title="Held you back" rows={losses} scale={scale} ccy={ccy} up={false} />
            </div>
          </details>
        </>
      ) : (
        <p className="mt-4 text-subhead text-text-secondary">{made.window === "year" ? "Needs the year's fills and a close a year ago for each holding held then." : "Needs each holding's cost basis from the broker."}</p>
      )}
      {made.other !== null || made.left.length ? (
        <div className="mt-5 space-y-1 border-t border-hairline pt-3">
          {made.other !== null ? (
            <p className="text-subhead text-text-secondary">
              Interest and fees: <span className="data text-text">{signed(made.other, ccy)}</span>
            </p>
          ) : null}
          {made.left.length ? <p className="text-footnote text-text-tertiary">Not counted: {made.left.map((l) => `${l.symbol} (${l.why})`).join(", ")}.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
