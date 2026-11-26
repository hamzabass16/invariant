import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { companyHref } from "@/lib/company";

import { money } from "@/lib/holdings";
import type { Positions } from "@/lib/positions";
import { cn } from "@/lib/utils";

const DASH = <span className="text-text-tertiary">–</span>;

const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "");
const price = (n: number | null, ccy: string, base: string) => (n === null ? DASH : `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ccy === base ? "" : ` ${ccy}`}`);
const units = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** How far a figure must go to reach the full tint: a day's move is large at 3%, a year's at 30%. */
const SCALE = { day: 3, period: 30 } as const;

/**
 * A signed figure on a tint of the move scale: blue for a gain, red for a
 * loss, stronger the larger it is, the sign always printed so the colour is
 * never alone. The tint stays light enough for ink in both themes.
 */
function Tinted({ value, scale, children }: { value: number | null; scale: number; children: React.ReactNode }) {
  if (value === null) return DASH;
  const strength = value === 0 ? 0 : 10 + Math.min(1, Math.abs(value) / scale) * 30;
  return (
    <span className="inline-block min-w-[4rem] rounded-[6px] px-1.5 py-0.5 text-right" style={{ background: strength ? `color-mix(in oklab, ${value > 0 ? "var(--move-up)" : "var(--move-down)"} ${strength.toFixed(0)}%, transparent)` : undefined }}>
      {children}
    </span>
  );
}

const pct = (n: number | null, scale: number) => (
  <Tinted value={n} scale={scale}>
    {n === null ? null : `${signed(n)}${Math.abs(n).toFixed(2)}%`}
  </Tinted>
);
const pnl = (n: number | null, ccy: string, against: number) => (
  <Tinted value={n} scale={against}>
    {n === null ? null : `${signed(n)}${money(Math.abs(n), ccy)}`}
  </Tinted>
);

const KIND: Partial<Record<string, string>> = { etf: "ETF", option: "Option", bond: "Bond", private_fund: "Fund", real_estate: "Property", other: "Other" };

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-surface-2 px-3 py-2.5">
      <p className="text-caption text-text-secondary">{label}</p>
      <div className="data mt-1 truncate text-body font-semibold">{children}</div>
    </div>
  );
}

/**
 * Every position as a broker lists it, largest first, then the cash and the
 * totals, under four tiles of the whole. Gains and losses are tinted on the
 * move scale; each market value carries a bar of its weight in net worth.
 * Fits a laptop without sideways scroll (Hamza, 15 Oct 2026); scrolls sideways
 * inside its card on a phone, the stock column held in place.
 */
export function PositionsTable({ positions, ccy, badge }: { positions: Positions; ccy: string; badge?: React.ReactNode }) {
  const { rows, cash, total } = positions;
  const worth = total.value;
  const share = (v: number) => (worth > 0 ? (v / worth) * 100 : 0);
  // A money gain is tinted against a twentieth of the book, so a small position's swing reads small.
  const against = Math.max(1, Math.abs(worth) / 20);
  const cell = (j: number) => cn("py-2 pr-3 align-middle", j === 0 ? "sticky left-0 z-10 bg-surface pl-3" : "data whitespace-nowrap text-right");
  const cost = total.cost;
  const gainPct = cost && total.unrealizedPnl !== null ? (total.unrealizedPnl / Math.abs(cost)) * 100 : null;
  const dayPct = total.dayPnl !== null && worth - total.dayPnl !== 0 ? (total.dayPnl / Math.abs(worth - total.dayPnl)) * 100 : null;
  return (
    <section className="mb-6" aria-label="Positions">
      <h3 className="section-header mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        Positions
        {badge}
      </h3>
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Market value">{money(worth, ccy)}</Tile>
        <Tile label="Daily P&L">
          {total.dayPnl === null ? DASH : (
            <>
              {pnl(total.dayPnl, ccy, against)}
              {dayPct !== null ? <span className="ml-1.5 text-caption font-normal text-text-secondary">{`${signed(dayPct)}${Math.abs(dayPct).toFixed(2)}%`}</span> : null}
            </>
          )}
        </Tile>
        <Tile label="Unrealized P&L">
          {total.unrealizedPnl === null ? DASH : (
            <>
              {pnl(total.unrealizedPnl, ccy, against)}
              {gainPct !== null ? <span className="ml-1.5 text-caption font-normal text-text-secondary">{`${signed(gainPct)}${Math.abs(gainPct).toFixed(1)}%`}</span> : null}
            </>
          )}
        </Tile>
        <Tile label="Cash">
          {money(total.cash, ccy)}
          <span className="ml-1.5 text-caption font-normal text-text-secondary">{share(total.cash).toFixed(1)}%</span>
        </Tile>
      </div>
      <div className="card overflow-x-auto py-1">
        <table className="w-full text-caption">
          <caption className="sr-only">Every position with its last price, changes, cost, market value and profit and loss, then the cash and the totals, in {ccy} unless a price says otherwise.</caption>
          <thead>
            <tr className="text-caption uppercase tracking-wide text-text-tertiary">
              <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-surface py-2 pl-3 pr-3 text-left align-bottom font-medium">
                Stock
              </th>
              <th scope="col" rowSpan={2} className="py-2 pr-3 text-right align-bottom font-medium">
                Position
              </th>
              <th scope="col" rowSpan={2} className="py-2 pr-3 text-right align-bottom font-medium">
                Last
              </th>
              <th scope="colgroup" colSpan={4} className="border-b border-hairline py-1.5 pr-3 text-center font-medium">
                Change
              </th>
              {["Cost basis", "Market value", "Avg price", "Daily P&L", "Unrealized P&L"].map((h) => (
                <th key={h} scope="col" rowSpan={2} className="whitespace-nowrap py-2 pr-3 text-right align-bottom font-medium">
                  {h}
                </th>
              ))}
            </tr>
            <tr className="text-caption text-text-tertiary">
              {["Day", "YTD", "6 months", "Since bought"].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap pb-2 pr-3 pt-1.5 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.symbol}|${r.currency}`} className="group border-t border-hairline transition-colors hover:bg-surface-2">
                <th scope="row" className={cn(cell(0), "text-left font-normal group-hover:bg-surface-2")}>
                  <span className="flex items-center gap-1.5">
                    {r.assetClass === "cash" ? (
                      <span className="data block max-w-[7.5rem] truncate font-semibold sm:max-w-[10rem]">{r.symbol}</span>
                    ) : (
                      <Link href={companyHref(r.symbol) as Route} className="data block max-w-[7.5rem] truncate font-semibold text-accent-text hover:underline sm:max-w-[10rem]">
                        {r.symbol}
                      </Link>
                    )}
                    {KIND[r.assetClass] ? <span className="shrink-0 rounded-[4px] bg-surface-3 px-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">{KIND[r.assetClass]}</span> : null}
                  </span>
                  <span className="block max-w-[7.5rem] truncate text-caption text-text-secondary sm:max-w-[10rem]">
                    {r.name}
                    {r.accounts > 1 ? ` · ${r.accounts} accounts` : ""}
                  </span>
                </th>
                <td className={cell(1)}>{units(r.quantity)}</td>
                <td className={cell(2)}>{price(r.last, r.currency, ccy)}</td>
                <td className={cell(3)}>{pct(r.dayPct, SCALE.day)}</td>
                <td className={cell(4)}>{pct(r.ytdPct, SCALE.period)}</td>
                <td className={cell(5)}>{pct(r.sixMonthPct, SCALE.period)}</td>
                <td className={cell(6)}>{pct(r.sinceBoughtPct, SCALE.period)}</td>
                <td className={cn(cell(7), "text-text-secondary")}>{r.cost === null ? DASH : money(r.cost, ccy)}</td>
                <td className={cell(8)}>
                  <span className="block font-semibold">{money(r.value, ccy)}</span>
                  <span className="mt-1 ml-auto flex w-16 items-center gap-1.5">
                    <span className="block h-1 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-1 rounded-full bg-accent" style={{ width: `${Math.min(100, Math.abs(share(r.value)))}%` }} />
                    </span>
                    <span className="text-[10px] text-text-tertiary">{share(r.value).toFixed(1)}%</span>
                  </span>
                </td>
                <td className={cn(cell(9), "text-text-secondary")}>{price(r.avgPrice, r.currency, ccy)}</td>
                <td className={cell(10)}>{pnl(r.dayPnl, ccy, against)}</td>
                <td className={cell(11)}>{pnl(r.unrealizedPnl, ccy, against)}</td>
              </tr>
            ))}
            {cash.map((c, i) => (
              <tr key={c.id} className={cn("group border-hairline transition-colors hover:bg-surface-2", i === 0 ? "border-t-2" : "border-t")}>
                <th scope="row" className={cn(cell(0), "text-left font-normal group-hover:bg-surface-2")}>
                  <span className="flex items-center gap-1.5">
                    <span className="block max-w-[7.5rem] truncate font-semibold sm:max-w-[10rem]">{c.label}</span>
                    <span className="shrink-0 rounded-[4px] bg-accent-subtle px-1 text-[10px] font-medium uppercase tracking-wide text-accent-text">Cash</span>
                  </span>
                  <span className="block max-w-[7.5rem] truncate text-caption text-text-secondary sm:max-w-[10rem]">{c.account}</span>
                </th>
                <td className={cell(1)}>{c.currency === ccy ? DASH : money(c.amount, c.currency)}</td>
                {Array.from({ length: 6 }, (_, k) => (
                  <td key={k} className={cell(2 + k)}>
                    {DASH}
                  </td>
                ))}
                <td className={cell(8)}>
                  <span className="block font-semibold">{money(c.value, ccy)}</span>
                  <span className="mt-1 ml-auto flex w-16 items-center gap-1.5">
                    <span className="block h-1 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-1 rounded-full bg-text-tertiary" style={{ width: `${Math.min(100, Math.abs(share(c.value)))}%` }} />
                    </span>
                    <span className="text-[10px] text-text-tertiary">{share(c.value).toFixed(1)}%</span>
                  </span>
                </td>
                {Array.from({ length: 3 }, (_, k) => (
                  <td key={k} className={cell(9 + k)}>
                    {DASH}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-hairline bg-surface-2 font-semibold">
              <th scope="row" className={cn(cell(0), "bg-surface-2 text-left")}>
                Total
                <span className="block text-caption font-normal text-text-secondary">Net worth</span>
              </th>
              {Array.from({ length: 6 }, (_, k) => (
                <td key={k} className={cell(1 + k)} />
              ))}
              <td className={cell(7)}>{cost === null ? DASH : money(cost, ccy)}</td>
              <td className={cell(8)}>{money(worth, ccy)}</td>
              <td className={cell(9)} />
              <td className={cell(10)}>{pnl(total.dayPnl, ccy, against)}</td>
              <td className={cell(11)}>{pnl(total.unrealizedPnl, ccy, against)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-footnote text-text-tertiary">
        Blue is a gain and red a loss, stronger the larger it is; the bar is the weight in net worth. Money in {ccy}; last and average price in the holding&apos;s own currency, per share for options. The day&apos;s change is the broker&apos;s where it reports one, else the price feed&apos;s last two closes; year to date runs from the last close of the year before. Cost basis and the totals cover the positions with a known cost.
      </p>
    </section>
  );
}
