"use client";

import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { RangeBar } from "@/components/dashboard/range-bar";
import { companyHref } from "@/lib/company";
import { movedTo } from "@/lib/figure-range";
import type { RangeSpec } from "@/lib/markets";
import { money } from "@/lib/holdings";
import { livePositions, type LiveQuote } from "@/lib/live";
import { ALLOCATION_TOP, cellOf, dayMovers, foldAllocation, GRID_COLUMNS, GRID_ROWS_SHOWN, GRID_TAB_LABEL, GRID_TABS, gridFair, gridRows, type AllocationSlice, type GridColumn, type GridExtra, type GridRow, type GridTab } from "@/lib/portfolio-grid";
import type { Positions } from "@/lib/positions";
import { cn } from "@/lib/utils";

const DASH = <span className="text-text-tertiary">–</span>;
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "");
// The sign and the colour follow the figure as printed, so a move that rounds to nothing reads 0.0%, never -0.0%.
const signedMoney = (n: number, ccy: string) => `${sign(Math.round(n))}${money(Math.abs(n), ccy)}`;
const signedPct = (n: number, d = 2) => `${sign(Number(n.toFixed(d)))}${Math.abs(n).toFixed(d)}%`;
const tone = (n: number | null, d = 2) => (n === null || Number(n.toFixed(d)) === 0 ? "text-text-secondary" : n > 0 ? "text-[color:var(--move-up)]" : "text-[color:var(--move-down)]");
const priceText = (n: number | null, ccy: string, base: string) => (n === null ? DASH : `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ccy === base ? "" : ` ${ccy}`}`);

/** A grid cell's heading: a small caps label with whatever sits at its right (a badge, a link). */
function CellHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
      <h3 className="term-label truncate">{label}</h3>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** A signed reading in the move colour with its sign, so colour is never alone. */
function Move({ value, kind, ccy }: { value: number | null; kind: GridColumn["kind"]; ccy: string }) {
  if (value === null) return DASH;
  const d = kind === "money" ? 0 : kind === "pts" ? 2 : Math.abs(value) >= 100 ? 0 : 1;
  const text = kind === "money" ? signedMoney(value, ccy) : kind === "pts" ? `${sign(Number(value.toFixed(2)))}${Math.abs(value).toFixed(2)} pp` : kind === "ratio" ? `${value.toFixed(1)}x` : signedPct(value, d);
  return <span className={kind === "ratio" ? "text-text-primary" : tone(value, d)}>{text}</span>;
}

/** The ring of the allocation, drawn small; its slices are listed beside it as a table, so nothing is told by colour alone. */
function Ring({ slices, centre }: { slices: AllocationSlice[]; centre: { value: string; label: string } }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const R = 52;
  const r = 36;
  const spans = slices.map((s) => (Math.max(0, s.value) / total) * Math.PI * 2);
  const arcs = slices.map((s, i) => {
    const span = spans[i];
    const a0 = -Math.PI / 2 + spans.slice(0, i).reduce((x, y) => x + y, 0);
    const a1 = a0 + span;
    // A 2px gap of the surface between slices: each arc is cut short by a little.
    const gap = slices.length > 1 ? Math.min(span / 4, 0.025) : 0;
    const p = (rad: number, ang: number) => `${(60 + rad * Math.cos(ang)).toFixed(3)} ${(60 + rad * Math.sin(ang)).toFixed(3)}`;
    const b0 = a0 + gap;
    const b1 = a1 - gap;
    const large = b1 - b0 > Math.PI ? 1 : 0;
    const d = span >= Math.PI * 2 - 0.001 ? null : `M ${p(R, b0)} A ${R} ${R} 0 ${large} 1 ${p(R, b1)} L ${p(r, b1)} A ${r} ${r} 0 ${large} 0 ${p(r, b0)} Z`;
    return { s, d };
  });
  return (
    <svg viewBox="0 0 120 120" className="size-32 shrink-0" role="img" aria-label="Allocation by holding">
      {arcs.map(({ s, d }) => (d ? <path key={s.key} d={d} fill={s.color} /> : <circle key={s.key} cx={60} cy={60} r={(R + r) / 2} fill="none" stroke={s.color} strokeWidth={R - r} />))}
      <text x={60} y={58} textAnchor="middle" fontSize={15} fontWeight={600} style={{ fill: "var(--text)", fontFamily: "var(--font-mono)" }}>
        {centre.value}
      </text>
      <text x={60} y={74} textAnchor="middle" fontSize={9} style={{ fill: "var(--text-secondary)" }}>
        {centre.label}
      </text>
    </svg>
  );
}

export type PortfolioGridProps = {
  positions: Positions;
  extras: Record<string, GridExtra>;
  /** The allocation by holding, as Holdings' donut draws it (components/holdings/portfolio-donuts.tsx holdingView), folded here. */
  allocation: AllocationSlice[];
  ccy: string;
  worthRange: RangeSpec | null;
  /** The book's net worth as the statement has it, for what today's prices moved it by. */
  bookWorth: number;
  /** Where the fair values are kept and read in full. */
  fairHref: string | null;
};

/**
 * The top of the Dashboard as a ruled grid (Hamza, 21 Nov 2026, after
 * Qualtrim's portfolio page): net worth with the day and the gain beside the
 * allocation, then every holding in one table under Overview, Performance,
 * Valuation and Fundamentals beside the day's contributors and detractors
 * and the book against the person's own fair values. Live with the quotes
 * the Dashboard already reads (`quotes`, `at`; lib/live.ts livePositions),
 * at the close otherwise. Nothing is kept or sent.
 */
export function PortfolioGrid({ positions, extras, allocation, ccy, worthRange, bookWorth, fairHref, quotes, at, open, badge }: PortfolioGridProps & { quotes: readonly LiveQuote[]; at: Date | null; open: boolean; badge: React.ReactNode }) {
  const now = React.useMemo(() => (at && quotes.length ? livePositions(positions, quotes, at) : null), [positions, quotes, at]);
  const p = now ?? positions;
  const rows = React.useMemo(() => gridRows(p, extras), [p, extras]);
  const movers = React.useMemo(() => dayMovers(rows), [rows]);
  const fair = React.useMemo(() => gridFair(rows), [rows]);
  const folded = React.useMemo(() => foldAllocation(allocation, "var(--arch-none)"), [allocation]);
  const [tab, setTab] = React.useState<GridTab>("overview");
  const [all, setAll] = React.useState(false);
  const shown = all ? rows : rows.slice(0, GRID_ROWS_SHOWN);

  const worth = p.total.value;
  const day = p.total.dayPnl;
  const dayBase = day === null ? null : worth - day;
  const dayPct = day === null || !dayBase ? null : (day / dayBase) * 100;
  const gain = p.total.unrealizedPnl;
  const cost = p.total.cost;
  const gainPct = gain === null || !cost ? null : (gain / cost) * 100;
  const cashPct = worth > 0 ? (p.total.cash / worth) * 100 : 0;
  const moved = Math.round((worth - bookWorth) * 100) / 100;

  return (
    <section aria-label="Your portfolio" className="term-grid mb-8 grid grid-cols-1 lg:grid-cols-12">
      {/* Net worth, the day and the gain. */}
      <div className="term-cell lg:col-span-8">
        <CellHead label={open ? "Portfolio value now" : "Portfolio value"} right={badge} />
        <p className="data figure-in text-large-title font-semibold tracking-[-0.01em]">{money(worth, ccy)}</p>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="term-label">{open ? "Today so far" : "Last session"}</p>
            <p className={cn("data text-headline font-semibold", tone(day))}>{day === null ? "–" : `${signedMoney(day, ccy)}${dayPct === null ? "" : ` (${signedPct(dayPct)})`}`}</p>
          </div>
          <div>
            <p className="term-label">Unrealized gain</p>
            <p className={cn("data text-headline font-semibold", tone(gain))}>{gain === null ? "–" : `${signedMoney(gain, ccy)}${gainPct === null ? "" : ` (${signedPct(gainPct)})`}`}</p>
          </div>
          <div>
            <p className="term-label">Cash</p>
            <p className="data text-headline font-semibold">{`${cashPct.toFixed(1)}%`}</p>
          </div>
        </div>
        {worthRange ? (
          <div className="mt-3 max-w-xl">
            <RangeBar range={movedTo(worthRange, worth)} format={(v) => money(v, ccy)} />
          </div>
        ) : null}
        <p className="mt-2 text-footnote text-text-tertiary">{now ? `${signedMoney(moved, ccy)} against the statement at today's prices; ${now.priced} of ${positions.rows.length} positions priced.` : "At the book's own prices. Cost and gain are on the positions that carry a cost."}</p>
      </div>

      {/* The allocation, folded to the largest holdings. */}
      <div className="term-cell lg:col-span-4">
        <CellHead label="Allocation" right={<span className="data text-footnote text-text-secondary">{`Top ${Math.min(ALLOCATION_TOP, folded.count)} = ${folded.topShare.toFixed(1)}%`}</span>} />
        <div className="flex items-center gap-4">
          <Ring slices={folded.slices} centre={{ value: String(folded.count), label: folded.count === 1 ? "holding" : "holdings" }} />
          <div className="min-w-0 flex-1">
            <table className="w-full table-fixed text-footnote">
              <caption className="sr-only">Share of net worth by holding, the rest as Other and Cash</caption>
              <tbody>
                {folded.slices.map((s) => (
                  <tr key={s.key}>
                    <th scope="row" className="overflow-hidden py-0.5 pr-2 text-left font-normal">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                        {s.href ? (
                          <Link href={s.href as Route} className="data truncate hover:underline">
                            {s.label}
                          </Link>
                        ) : (
                          <span className="truncate">{s.label}</span>
                        )}
                      </span>
                    </th>
                    <td className="data w-14 py-0.5 text-right text-text-secondary">{`${s.value.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Every holding, under four tabs. */}
      <div className="term-cell min-w-0 lg:col-span-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="term-label">{`Holdings · ${rows.length}`}</h3>
          <div role="tablist" aria-label="Holdings view" className="flex flex-wrap gap-1">
            {GRID_TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-full px-2.5 py-1 text-footnote", tab === t ? "bg-surface-2 text-text-primary" : "text-text-secondary hover:text-text-primary")}>
                {GRID_TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[600px] text-footnote">
            <caption className="sr-only">{`Your holdings, ${GRID_TAB_LABEL[tab]}`}</caption>
            <thead>
              <tr className="border-b border-hairline text-text-secondary">
                <th scope="col" className="sticky left-0 z-[1] bg-[var(--bg)] px-1 py-1.5 text-left font-normal">Company</th>
                {tab === "overview" ? (
                  <>
                    <th scope="col" className="px-1 py-1.5 text-right font-normal">Value · weight</th>
                    <th scope="col" className="px-1 py-1.5 text-right font-normal">Price</th>
                    <th scope="col" className="px-1 py-1.5 text-right font-normal">Today</th>
                    <th scope="col" className="px-1 py-1.5 text-right font-normal">Total return</th>
                    <th scope="col" className="px-1 py-1.5 text-right font-normal">To your value</th>
                  </>
                ) : (
                  GRID_COLUMNS[tab].map((c) => (
                    <th key={c.id} scope="col" className="px-1 py-1.5 text-right font-normal">
                      {c.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.symbol}|${r.currency}`} className="border-b border-hairline last:border-b-0">
                  <th scope="row" className="sticky left-0 z-[1] max-w-[7.5rem] bg-[var(--bg)] px-1 py-1.5 text-left font-normal sm:max-w-[14rem]">
                    <Link href={companyHref(r.symbol) as Route} className="data font-semibold hover:underline">
                      {r.symbol}
                    </Link>
                    <span className="block truncate text-caption text-text-tertiary">{r.classLabel ? `${r.name} · ${r.classLabel}` : r.name}</span>
                  </th>
                  {tab === "overview" ? (
                    <>
                      <td className="data px-1 py-1.5 text-right">
                        {money(r.value, ccy)}
                        <span className="block text-caption text-text-tertiary">{`${r.weight.toFixed(1)}%`}</span>
                      </td>
                      <td className="data px-1 py-1.5 text-right">{priceText(r.price, r.currency, ccy)}</td>
                      <td className="data px-1 py-1.5 text-right">
                        <Move value={r.dayPct} kind="pct" ccy={ccy} />
                        <span className="block text-caption">{r.dayPnl === null ? DASH : <Move value={r.dayPnl} kind="money" ccy={ccy} />}</span>
                      </td>
                      <td className="data px-1 py-1.5 text-right">
                        <Move value={r.totalPct} kind="pct" ccy={ccy} />
                        <span className="block text-caption">{r.totalPnl === null ? DASH : <Move value={r.totalPnl} kind="money" ccy={ccy} />}</span>
                      </td>
                      <td className="data px-1 py-1.5 text-right">
                        <Move value={r.toFairPct} kind="pct" ccy={ccy} />
                        <span className="block text-caption">{r.toFairMoney === null ? DASH : <Move value={r.toFairMoney} kind="money" ccy={ccy} />}</span>
                      </td>
                    </>
                  ) : (
                    GRID_COLUMNS[tab].map((c) => (
                      <td key={c.id} className="data px-1 py-1.5 text-right">
                        <Move value={cellOf(r, c.id)} kind={c.kind} ccy={ccy} />
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-footnote">
          <span className="text-text-tertiary">{tab === "valuation" || tab === "fundamentals" ? "From the filings; Fwd P/E is the analysts' where read, else the filings' carried a year. A dash is a figure not read." : "To your value is the move from the price to the base of your own valuation."}</span>
          <span className="flex gap-3">
            {rows.length > GRID_ROWS_SHOWN ? (
              <button type="button" onClick={() => setAll((v) => !v)} className="text-accent-text">
                {all ? "Show fewer" : `Show all ${rows.length}`}
              </button>
            ) : null}
            <Link href="/holdings" className="text-accent-text">
              Holdings
            </Link>
          </span>
        </div>
      </div>

      {/* The day's contributors and detractors, then the book against the person's own values. */}
      <div className="term-cell lg:col-span-4">
        <CellHead label={open ? "Today's contributors" : "Contributors, last session"} />
        <MoverList rows={movers.up} ccy={ccy} empty="None rose." />
        <h3 className="term-label mb-3 mt-5">{open ? "Today's detractors" : "Detractors, last session"}</h3>
        <MoverList rows={movers.down} ccy={ccy} empty="None fell." />
        <div className="mt-5 border-t border-hairline pt-4">
          <CellHead label="Against your fair values" right={fairHref ? <Link href={fairHref as Route} className="text-footnote text-accent-text">Detail</Link> : null} />
          {fair ? (
            <>
              <p className={cn("data text-title-2 font-semibold", tone(fair.toFairPct))}>{signedPct(fair.toFairPct, 1)}</p>
              <p className="text-footnote text-text-secondary">{`To your bases: ${money(fair.fair, ccy)} against ${money(fair.value, ccy)} today, on ${fair.count} holding${fair.count === 1 ? "" : "s"}, ${fair.coveredPct.toFixed(0)}% of the listed book.`}</p>
            </>
          ) : (
            <p className="text-footnote text-text-secondary">No holding carries a valuation of your own yet. Set a bear, base and bull on a thesis and the book is read against them here.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function MoverList({ rows, ccy, empty }: { rows: GridRow[]; ccy: string; empty: string }) {
  if (!rows.length) return <p className="text-footnote text-text-tertiary">{empty}</p>;
  return (
    <table className="w-full text-footnote">
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol}>
            <th scope="row" className="py-0.5 text-left font-normal">
              <Link href={companyHref(r.symbol) as Route} className="data font-semibold hover:underline">
                {r.symbol}
              </Link>
            </th>
            <td className="data py-0.5 text-right">
              <Move value={r.dayPnl} kind="money" ccy={ccy} />
            </td>
            <td className="data w-20 py-0.5 text-right">
              <Move value={r.dayPts} kind="pts" ccy={ccy} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
