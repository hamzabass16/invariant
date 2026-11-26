"use client";

import * as React from "react";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import { MovePill } from "@/components/markets/session";
import { capWords, MOVE_FULL_AT, moveFill, moveInk, sectorsOf, signedPct, signedPts, topDrivers, type DayMove, type Driver, type IndexDrivers, type MarketDay } from "@/lib/market-day";
import { squarify } from "@/lib/treemap";

/** A wide drawing for a laptop, a tall one for a phone, so the map fits the card's width and never scrolls. */
const SHAPES = [
  { key: "wide", w: 1200, h: 700, className: "hidden sm:block" },
  { key: "tall", w: 420, h: 760, className: "block sm:hidden" },
] as const;
const FULL_AT = MOVE_FULL_AT;
const HEADER = 18;
const fill = moveFill;
/** A sector's header: its name and move when both fit, else the name alone, cut short when even that does not; never a number cut in half. */
const headerText = (sector: string, pct: number, w: number) => {
  const room = Math.floor((w - 8) / 6.8);
  const name = sector.toUpperCase();
  const full = `${name} ${signedPct(pct)}`;
  return full.length <= room ? full : name.length <= room ? name : `${name.slice(0, Math.max(3, room - 1))}…`;
};
const ink = moveInk;

/** One driver as a tile in the map's own colours: its ticker, its part in points, its weight and move; a ring when it is held. */
function DriverTile({ d, held }: { d: Driver; held: boolean }) {
  return (
    <li className={`flex min-w-0 flex-col rounded-[10px] px-2.5 py-2 ${held ? "ring-2 ring-[var(--text)]" : ""}`} style={{ background: fill(d.changePct), color: ink(d.changePct) }} title={`${d.symbol}${d.name ? ` · ${d.name}` : ""}${held ? " · held" : ""}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="data truncate text-subhead font-semibold">{d.symbol}</span>
        <span className="data shrink-0 text-footnote font-semibold">{signedPts(d.contribution)}</span>
      </span>
      <span className="data truncate text-caption opacity-80">
        {d.weight.toFixed(2)}% · {signedPct(d.changePct)}
      </span>
    </li>
  );
}

function DriverTiles({ title, list, held }: { title: string; list: Driver[]; held: Set<string> }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-secondary">{title}</p>
      {list.length ? (
        <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => (
            <DriverTile key={d.symbol} d={d} held={held.has(d.symbol.toUpperCase())} />
          ))}
        </ol>
      ) : (
        <p className="text-footnote text-text-secondary">None moved it this way.</p>
      )}
    </div>
  );
}

/**
 * What drove the S&P 500 and QQQ, drawn under the map in its own colours
 * (Hamza, 19 Oct 2026: the map first, the drivers merged into it): for each
 * index its move, then the companies that added most and took most away as
 * tiles, each with its part in points.
 */
function DriversUnderMap({ list, held }: { list: IndexDrivers[]; held: Set<string> }) {
  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <h4 className="section-header text-[1.05rem]">What is driving the S&amp;P 500 and QQQ</h4>
      <p className="mt-1 text-footnote text-text-secondary">Each company&apos;s part is in points (pt): its weight in the index times its own move, so the points say how much of the index&apos;s move that company made or cost.</p>
      {list.map((ix) => {
        const { up, down } = topDrivers(ix.drivers);
        return (
          <div key={ix.name} className="mt-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-body font-semibold">{ix.name}</p>
              {ix.actualPct !== null ? <MovePill pct={ix.actualPct} /> : null}
              <p className="text-footnote text-text-secondary">
                Its companies add up to <span className="data">{signedPct(ix.impliedPct)}</span>
                {ix.priced < ix.members ? ` (${ix.priced} of ${ix.members} priced)` : ""}.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:gap-5">
              <DriverTiles title="Added most" list={up} held={held} />
              <DriverTiles title="Took most away" list={down} held={held} />
            </div>
          </div>
        );
      })}
      <p className="mt-3 text-caption text-text-tertiary">A company&apos;s part is its weight at the close before times its move, in percentage points of the index. Weights are market values from the Nasdaq screener, not the index&apos;s own float-adjusted (S&amp;P) or capped (Nasdaq-100) weights, so their sum can differ from the index&apos;s own move.</p>
    </div>
  );
}

/**
 * Every S&P 500 company in its GICS sector, sized by market value (or alike
 * when no value could be read) and coloured by its move in the last closed
 * session: blue up, red down, grey at no move, full colour at three percent.
 * The ticker and the move are printed on every tile with room for them;
 * hovering any tile names it, and the table view lists all of them. A phone gets
 * a taller drawing of the same map, so it fits the card. Given the index
 * drivers, it carries them under the map as tiles in the same colours.
 */
export function HeatMap({ day, held, badge, live = false, drivers = [], title = "Heat map of the S&P 500", subject = "S&P 500 companies", footer }: { day: MarketDay; held: string[]; badge?: React.ReactNode; live?: boolean; drivers?: IndexDrivers[]; title?: string; subject?: string; footer?: React.ReactNode }) {
  const [hover, setHover] = React.useState<DayMove | null>(null);
  const mine = React.useMemo(() => new Set(held.map((s) => s.toUpperCase())), [held]);
  const sectors = React.useMemo(() => sectorsOf(day), [day]);
  const size = React.useCallback((m: DayMove) => (day.sizeBy === "cap" && m.cap ? m.cap : 1), [day.sizeBy]);
  const layouts = React.useMemo(
    () =>
      SHAPES.map((shape) => ({
        ...shape,
        sectors: squarify(sectors, (s) => s.weight, { x: 0, y: 0, w: shape.w, h: shape.h }).map((s) => {
          const showHeader = s.h > 46 && s.w > 70;
          const inner = { x: s.x + 1, y: s.y + (showHeader ? HEADER : 1), w: s.w - 2, h: s.h - (showHeader ? HEADER : 1) - 1 };
          return { ...s, showHeader, tiles: squarify(s.item.moves, size, inner) };
        }),
      })),
    [sectors, size],
  );
  const rows = sectors.flatMap((s) => s.moves.map((m) => [m.symbol, m.name ?? "", s.sector, signedPct(m.changePct), m.close.toFixed(2), capWords(m.cap)]));

  // The S&P 500's own day, public: stealth leaves its market values and closes (Hamza, 7 Nov 2026).
  return (
    <div data-public="">
      <ChartFrame
        title={title}
      badge={badge}
      subtitle={`Each company in its sector, ${day.sizeBy === "cap" ? "sized by market value" : "all the same size (no market values could be read)"}, coloured by its move ${live ? "so far today" : "in the session"}. Blue rose, red fell; full colour at ${FULL_AT}% either way.${held.length ? " A ring marks a company you hold." : ""}`}
      after={drivers.length ? <DriversUnderMap list={drivers} held={mine} /> : footer ?? null}
      table={<ChartTable caption={`Every one of the ${subject}' moves in the session of ${day.session}`} head={["Company", "Name", "Sector", "Move", "Close", "Market value"]} rows={rows} />}
    >
      <p className="data mb-2 min-h-[1.25rem] truncate text-footnote text-text-secondary" aria-live="polite">
        {hover ? `${hover.symbol} · ${hover.name ?? ""} · ${hover.subIndustry ?? hover.sector} · ${signedPct(hover.changePct)} · close ${hover.close.toFixed(2)}, before ${hover.prevClose.toFixed(2)} · ${capWords(hover.cap)}` : "Point at a company for its move, close and market value."}
      </p>
      {layouts.map((shape) => (
        <svg key={shape.key} viewBox={`0 0 ${shape.w} ${shape.h}`} className={`${shape.className} w-full`} role="img" aria-label={`Heat map of ${day.moves.length} ${subject} by sector for the session of ${day.session}`} onPointerLeave={() => setHover(null)}>
          {shape.sectors.map((s) => (
            <g key={s.item.sector}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="var(--surface)" />
              {s.showHeader ? (
                <text x={s.x + 4} y={s.y + 13} className="data" fontSize={11} fontWeight={600} fill="var(--text-secondary)">
                  {headerText(s.item.sector, s.item.changePct, s.w)}
                </text>
              ) : null}
              {s.tiles.map((t) => {
                const m = t.item;
                const fs = Math.max(9, Math.min(26, t.w / 4.4, t.h / 2.6));
                const showTicker = t.w >= 30 && t.h >= 16;
                const showMove = showTicker && t.h >= fs * 2.4 && t.w >= fs * 3.4;
                const isHeld = mine.has(m.symbol);
                return (
                  <g key={m.symbol} onPointerEnter={() => setHover(m)}>
                    <rect x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx={2} fill={fill(m.changePct)} stroke={isHeld ? "var(--text)" : "none"} strokeWidth={isHeld ? 2 : 0}>
                      <title>{`${m.symbol} ${signedPct(m.changePct)}`}</title>
                    </rect>
                    {showTicker ? (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2 + (showMove ? -fs * 0.15 : fs * 0.35)} textAnchor="middle" className="data" fontSize={fs} fontWeight={600} fill={ink(m.changePct)} pointerEvents="none">
                        {m.symbol}
                      </text>
                    ) : null}
                    {showMove ? (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2 + fs * 0.85} textAnchor="middle" className="data" fontSize={fs * 0.62} fill={ink(m.changePct)} pointerEvents="none">
                        {signedPct(m.changePct)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      ))}
      <div className="mt-3 flex items-center gap-3 text-caption text-text-secondary" aria-hidden>
        <span className="data">-{FULL_AT}%</span>
        <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, var(--move-down), var(--move-mid), var(--move-up))" }} />
        <span className="data">+{FULL_AT}%</span>
      </div>
      </ChartFrame>
    </div>
  );
}
