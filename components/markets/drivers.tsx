import type * as React from "react";

import { MovePill } from "@/components/markets/session";
import { companyHref } from "@/lib/company";
import { money } from "@/lib/holdings";
import { MOVE_FULL_AT, moveFill, moveInk, signedPct, signedPts, topDrivers, type BookDay, type Driver, type IndexDrivers } from "@/lib/market-day";
import { inViewSize, squarify } from "@/lib/treemap";

const poleOf = (v: number) => (v > 0 ? "var(--move-up)" : v < 0 ? "var(--move-down)" : "var(--text-tertiary)");

/** A contribution as a thin bar against the largest in its list, beside the figure, so its sign is never colour alone. */
function Part({ value, scale }: { value: number; scale: number }) {
  const width = scale > 0 ? Math.max(2, (Math.abs(value) / scale) * 100) : 0;
  return (
    <div className="flex w-[4.5rem] shrink-0 flex-col items-end gap-1 sm:w-28">
      <span className="data text-footnote font-medium">{signedPts(value)}</span>
      <span className="block h-1 w-full rounded-full bg-surface-3" aria-hidden>
        <span className="block h-1 rounded-full" style={{ width: `${width}%`, marginLeft: value < 0 ? "auto" : undefined, background: poleOf(value) }} />
      </span>
    </div>
  );
}

function DriverList({ title, list, scale, held }: { title: string; list: Driver[]; scale: number; held: Set<string> }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-secondary">{title}</p>
      <ol>
        {list.map((d) => (
          <li key={d.symbol} className="flex items-center gap-2 border-t border-hairline py-2 first:border-t-0">
            <span className="data w-14 shrink-0 font-semibold">{d.symbol}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-footnote text-text-secondary">
                {d.name ?? d.symbol}
                {held.has(d.symbol.toUpperCase()) ? <span className="ml-1.5 text-accent-text">· held</span> : null}
              </span>
              <span className="data block text-caption text-text-tertiary">
                {d.weight.toFixed(2)}% weight · {signedPct(d.changePct)}
              </span>
            </span>
            <Part value={d.contribution} scale={scale} />
          </li>
        ))}
        {!list.length ? <li className="py-2 text-footnote text-text-secondary">None moved it this way.</li> : null}
      </ol>
    </div>
  );
}

/**
 * What is moving the S&P 500 and QQQ in the session: the companies that added
 * most and took most away, each with its weight at the close before, its
 * move and its part in percentage points, under the index's own move. The
 * title holds open or shut (the badge says which) and a line under it says
 * what a point is (Hamza, 18 Oct 2026).
 */
export function IndexDriversCard({ list, held, session, badge, live = false }: { list: IndexDrivers[]; held: string[]; session: string; badge?: React.ReactNode; live?: boolean }) {
  const mine = new Set(held.map((s) => s.toUpperCase()));
  return (
    <section className="card mb-8 px-4 py-3" aria-label={`What drove the S&P 500 and QQQ ${live ? "so far today" : `in the session of ${session}`}`}>
      <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
        What is driving the S&amp;P 500 and QQQ
        {badge}
      </h3>
      <p className="mt-1 text-footnote text-text-secondary">Each company&apos;s part is in points (pt): its weight in the index times its own move, so the points say how much of the index&apos;s move that company made or cost.</p>
      {list.map((ix) => {
        const { up, down } = topDrivers(ix.drivers);
        const scale = Math.max(0, ...[...up, ...down].map((d) => Math.abs(d.contribution)));
        return (
          <div key={ix.name} className="mt-3 border-t border-hairline pt-3 first-of-type:border-t-0">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-body font-semibold">{ix.name}</p>
              {ix.actualPct !== null ? <MovePill pct={ix.actualPct} /> : null}
              <p className="text-footnote text-text-secondary">
                Its companies add up to <span className="data">{signedPct(ix.impliedPct)}</span>
                {ix.priced < ix.members ? ` (${ix.priced} of ${ix.members} priced)` : ""}.
              </p>
            </div>
            <div className="flex flex-col gap-6 lg:flex-row">
              <DriverList title="Added most" list={up} scale={scale} held={mine} />
              <DriverList title="Took most away" list={down} scale={scale} held={mine} />
            </div>
          </div>
        );
      })}
      <p className="mt-2 text-caption text-text-tertiary">A company&apos;s part is its weight at the close before times its move, in percentage points of the index. Weights are market values from the Nasdaq screener, not the index&apos;s own float-adjusted (S&amp;P) or capped (Nasdaq-100) weights, so their sum can differ from the index&apos;s own move.</p>
    </section>
  );
}

/** A price now, where the live layer gives one ("182.40 USD"). */
const priceOf = (r: object) => ("price" in r && typeof r.price === "number" && "currency" in r ? `${r.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${String(r.currency)}` : null);

/** A wide drawing for a laptop, a tall one for a phone, so the book's map fits the card and never scrolls. */
const BOOK_SHAPES = [
  { key: "wide", w: 1200, h: 460, className: "hidden sm:block" },
  { key: "tall", w: 420, h: 560, className: "block sm:hidden" },
] as const;

/**
 * The book's holdings as a heat map: each a tile sized by its weight of net
 * worth and coloured by its move, as the S&P 500's map is (Hamza, 19 Oct
 * 2026). Its ticker, move, part in points and what it made or lost are
 * printed where the tile has room; every tile names itself on hover.
 */
function BookMap({ day, ccy }: { day: BookDay; ccy: string }) {
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${money(Math.abs(v), ccy)}`;
  const size = inViewSize(day.rows, (r) => r.weight);
  return (
    <>
      {BOOK_SHAPES.map((shape) => (
        <svg key={shape.key} viewBox={`0 0 ${shape.w} ${shape.h}`} className={`${shape.className} mt-3 w-full`} role="img" aria-label={`Heat map of ${day.rows.length} holdings for the session of ${day.session}, sized by weight and coloured by move`}>
          {squarify(day.rows, size, { x: 0, y: 0, w: shape.w, h: shape.h }).map((t) => {
            const r = t.item;
            const fs = Math.max(11, Math.min(40, t.w / 4.6, t.h / 3.4));
            const small = fs * 0.5;
            const showTicker = t.w >= 34 && t.h >= 20;
            const showMove = showTicker && t.h >= fs * 2.3 && t.w >= fs * 3.2;
            const showMore = showMove && t.h >= fs * 3.1 && t.w >= small * 17;
            const lines = showMore ? 3 : showMove ? 2 : 1;
            // Baselines below the ticker's, spaced so no two lines' boxes meet; the block is centred on the tile.
            const offsets = [0, fs * 1.0, fs * 1.72].slice(0, lines);
            const span = 0.8 * fs + offsets[offsets.length - 1] + 0.15 * fs;
            const top = t.y + t.h / 2 - span / 2 + 0.8 * fs;
            return (
              <a key={r.symbol} href={companyHref(r.symbol)} aria-label={`${r.symbol}: its company page`}>
                <rect x={t.x + 1.5} y={t.y + 1.5} width={Math.max(0, t.w - 3)} height={Math.max(0, t.h - 3)} rx={8} fill={moveFill(r.changePct)}>
                  <title>{`${r.symbol}${r.name ? ` · ${r.name}` : ""} · ${r.weight.toFixed(1)}% of book · ${signedPct(r.changePct)} · ${signedPts(r.contribution)} · ${signed(r.change)}`}</title>
                </rect>
                {showTicker ? (
                  <text x={t.x + t.w / 2} y={lines === 1 ? t.y + t.h / 2 + fs * 0.35 : top} textAnchor="middle" className="data" fontSize={fs} fontWeight={600} fill={moveInk(r.changePct)} pointerEvents="none">
                    {r.symbol}
                  </text>
                ) : null}
                {showMove ? (
                  <text x={t.x + t.w / 2} y={top + offsets[1]} textAnchor="middle" className="data" fontSize={fs * 0.6} fill={moveInk(r.changePct)} pointerEvents="none">
                    {signedPct(r.changePct)}
                  </text>
                ) : null}
                {showMore ? (
                  <text x={t.x + t.w / 2} y={top + offsets[2]} textAnchor="middle" className="data" fontSize={small} fill={moveInk(r.changePct)} opacity={0.85} pointerEvents="none">
                    {`${r.weight.toFixed(1)}% · ${signedPts(r.contribution)} · ${signed(r.change)}`}
                  </text>
                ) : null}
              </a>
            );
          })}
        </svg>
      ))}
      <div className="mt-2 flex items-center gap-3 text-caption text-text-secondary" aria-hidden>
        <span className="data">-{MOVE_FULL_AT}%</span>
        <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, var(--move-down), var(--move-mid), var(--move-up))" }} />
        <span className="data">+{MOVE_FULL_AT}%</span>
      </div>
    </>
  );
}

/**
 * The person's book in the session: its move in percent and in money, then
 * a heat map of the priced holdings sized by weight and coloured by move
 * (Hamza, 19 Oct 2026), with every holding's weight, move, part in
 * percentage points and what it made or lost in the list under it. The
 * title holds open or shut (the badge says which) and a line under it says
 * what a point is (Hamza, 18 Oct 2026).
 */
export function BookDayCard({ day, ccy, title = "How your book is doing", label = `Your book in the session of ${day.session}`, badge, unpricedNote, note = "Weights are of net worth at the close before. Cash, deposits, funds, bonds and options are counted at no change." }: { day: BookDay; ccy: string; title?: string; label?: string; badge?: React.ReactNode; unpricedNote?: string | null; note?: string }) {
  const scale = Math.max(0, ...day.rows.map((r) => Math.abs(r.contribution)));
  const rest = Math.max(0, 100 - day.pricedPct);
  const unpricedLine = unpricedNote !== undefined ? unpricedNote : day.unpriced.length ? `No close this session for ${day.unpriced.join(", ")}; counted at no change.` : null;
  return (
    <section className="card mb-8 px-4 py-3" aria-label={label}>
      <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
        {title}
        {badge}
      </h3>
      <p className="mt-1 text-footnote text-text-secondary">Each holding&apos;s part is in points (pt): its weight of your net worth times its own move, so the points add up to the book&apos;s move and say which holdings made or cost it.</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <MovePill pct={day.changePct} />
        <span className="data text-body">{`${day.change > 0 ? "+" : day.change < 0 ? "-" : ""}${money(Math.abs(day.change), ccy)}`}</span>
        <span className="text-footnote text-text-secondary">
          from {day.rows.length} holding{day.rows.length === 1 ? "" : "s"} priced, {day.pricedPct.toFixed(1)}% of net worth{rest >= 0.05 ? `; the other ${rest.toFixed(1)}% is held at no change` : ""}.
        </span>
      </div>
      <BookMap day={day} ccy={ccy} />
      <details className="group mt-3 border-t border-hairline">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-subhead text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
          <span>Holding by holding</span>
          <span className="text-caption text-text-tertiary group-open:hidden">Open</span>
          <span className="hidden text-caption text-text-tertiary group-open:inline">Close</span>
        </summary>
      <ol>
        {day.rows.map((r) => (
          <li key={r.symbol} className="flex items-center gap-2 border-t border-hairline py-2 first:border-t-0">
            <span className="data w-14 shrink-0 font-semibold">{r.symbol}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-footnote text-text-secondary">{r.name ?? r.symbol}</span>
              <span className="data block truncate text-caption text-text-tertiary">
                {r.weight.toFixed(1)}%<span className="hidden sm:inline"> of book</span>
                <span className="sm:hidden"> · {signedPct(r.changePct)}</span> · {`${r.change > 0 ? "+" : r.change < 0 ? "-" : ""}${money(Math.abs(r.change), ccy)}`}
                {priceOf(r) ? <span className="hidden sm:inline"> · {priceOf(r)} · {money(r.value, ccy)}</span> : null}
              </span>
            </span>
            <Part value={r.contribution} scale={scale} />
            <MovePill pct={r.changePct} className="hidden sm:inline-flex" />
          </li>
        ))}
      </ol>
      </details>
      {unpricedLine ? <p className="mt-1 text-footnote text-text-secondary">{unpricedLine}</p> : null}
      <p className="mt-1 text-caption text-text-tertiary">{note}</p>
    </section>
  );
}
