"use client";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import { ColumnGroups } from "@/components/charts/column-groups";
import { LineChart } from "@/components/charts/line-chart";
import { flowDollars } from "@/lib/etf-flows";
import { cashNow, COT_GROUP_LABEL, foreignYear, positionRows, quarterWords, rankWords, type Cash, type Foreign, type Insiders, type Positioning } from "@/lib/flows";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWord = (ym: string, year = false) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}${year ? ` ${ym.slice(0, 4)}` : ` ${ym.slice(2, 4)}`}`;
const dayWord = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const signedPts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

/** A figure over its card, in large type. */
function Figure({ label, value, ink = "var(--text)" }: { label: string; value: string; ink?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="data text-headline font-semibold" style={{ color: ink }}>
        {value}
      </p>
    </div>
  );
}

/**
 * How the big traders are positioned (the CFTC's Commitments of Traders):
 * each market's net futures as a share of open interest, on a track from its
 * three years' low to its high, with zero marked where it falls inside.
 */
export function PositioningCard({ positioning, badge }: { positioning: Positioning; badge?: React.ReactNode }) {
  const rows = positionRows(positioning);
  const title = "How the big traders are positioned";
  const date = rows[0]?.date;
  return (
    <ChartFrame
      title={title}
      badge={badge}
      subtitle={`Net futures as a share of open interest${date ? `, the week to ${dayWord(date)}` : ""}, against each market's own three years. Above zero is net long.`}
      table={<ChartTable caption={title} head={["Market", "Who", "Net of open interest", "Week's change", "Three-year low", "Three-year high"]} rows={rows.map((r) => [r.label, COT_GROUP_LABEL[r.group], `${signedPts(r.pct)}%`, r.change === null ? "" : `${signedPts(r.change)} pts`, `${signedPts(r.low)}%`, `${signedPts(r.high)}%`])} />}
      after={<p className="mt-3 text-caption text-text-tertiary">{`US Commodity Futures Trading Commission, Commitments of Traders: futures only, positions on Tuesday, published the Friday after.${positioning.problems.length ? ` ${positioning.problems.join(" ")}` : ""}`}</p>}
    >
      <ul className="divide-y divide-hairline">
        {rows.map((r) => {
          const span = r.high - r.low || 1;
          const at = (v: number) => `${((v - r.low) / span) * 100}%`;
          return (
            <li key={`${r.market}-${r.group}`} className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem] sm:items-center">
              <div className="min-w-0">
                <p className="text-subhead font-medium">{r.label}</p>
                <p className="text-caption text-text-secondary">{COT_GROUP_LABEL[r.group]}</p>
              </div>
              <div className="min-w-0" title={`${r.label}, ${COT_GROUP_LABEL[r.group]}: ${signedPts(r.pct)}% of open interest, ${rankWords(r.rank)}`}>
                <div className="relative h-2 rounded-full bg-surface-2">
                  {r.low < 0 && r.high > 0 ? <span aria-hidden className="absolute top-[-3px] h-[14px] w-px bg-text-tertiary" style={{ left: at(0) }} /> : null}
                  <span aria-hidden className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-text" style={{ left: at(r.pct) }} />
                </div>
                <div className="data mt-1 flex justify-between text-caption text-text-tertiary">
                  <span>{signedPts(r.low)}%</span>
                  <span className="text-text-secondary">{rankWords(r.rank)}</span>
                  <span>{signedPts(r.high)}%</span>
                </div>
              </div>
              <div className="data text-left sm:text-right">
                <p className="text-subhead font-semibold">{signedPts(r.pct)}%</p>
                {r.change !== null ? <p className="text-caption text-text-secondary">{signedPts(r.change)} pts on the week</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

/** What foreigners bought and sold (the Treasury's TIC table 1): stocks and bonds by month, the year's sums by kind under it. */
export function ForeignCard({ foreign, badge }: { foreign: Foreign; badge?: React.ReactNode }) {
  const months = foreign.months.slice(-12);
  const year = foreignYear(foreign.months);
  const last = months[months.length - 1];
  const tone = (v: number) => (v >= 0 ? "var(--flow-profit-ink)" : "var(--flow-cost-ink)");
  return (
    <ColumnGroups
      title="What foreigners bought and sold"
      badge={badge}
      subtitle={`Net purchases of US long-term securities by foreign investors, by month${last ? ` to ${monthWord(last.month, true)}` : ""}. Below zero, they sold more than they bought.`}
      labels={months.map((m) => monthWord(m.month))}
      series={[
        { label: "US stocks", color: "var(--series-hcmp)", values: months.map((m) => m.equities) },
        { label: "US bonds", color: "var(--series-qqq)", values: months.map((m) => m.treasuries + m.agencies + m.corporates) },
      ]}
      format="compact:USD"
      tableCaption="Foreign net purchases of US securities by month"
      labelHead="Month"
      after={
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label={`Treasuries, ${year.months} months`} value={flowDollars(year.treasuries, true)} ink={tone(year.treasuries)} />
            <Figure label="Agency bonds" value={flowDollars(year.agencies, true)} ink={tone(year.agencies)} />
            <Figure label="Corporate bonds" value={flowDollars(year.corporates, true)} ink={tone(year.corporates)} />
            <Figure label="Stocks" value={flowDollars(year.equities, true)} ink={tone(year.equities)} />
          </div>
          <p className="mt-3 text-caption text-text-tertiary">US Department of the Treasury, Treasury International Capital, table 1: all countries, published about seven weeks after the month.</p>
        </>
      }
    />
  );
}

/** Cash on the sidelines (the OFR's money market fund monitor): what the funds hold in all over five years, and in what. */
export function CashCard({ cash, badge }: { cash: Cash; badge?: React.ReactNode }) {
  const total = cash.series.total ?? [];
  const now = cashNow(cash);
  return (
    <LineChart
      title="Cash on the sidelines"
      badge={badge}
      subtitle={`What US money market funds hold, at each month's end${now ? ` to ${dayWord(now.date)}` : ""}.`}
      dates={total.map((p) => p.date)}
      series={[{ key: "total", label: "Money market funds", color: "var(--series-hcmp)", values: total.map((p) => p.value) }]}
      format="compact:USD"
      area
      tableCaption="Money market fund holdings by month"
      tableEvery={1}
      after={
        now ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Figure label="Held now" value={flowDollars(now.total)} />
              {now.yearChange !== null ? <Figure label="On a year" value={`${now.yearChange >= 0 ? "+" : "−"}${Math.abs(now.yearChange).toFixed(1)}%`} /> : null}
            </div>
            {now.parts.length ? (
              <ul className="mt-4 space-y-1.5">
                {now.parts.map((p) => (
                  <li key={p.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem] items-center gap-x-3 text-footnote">
                    <span className="truncate text-text-secondary">{p.label}</span>
                    <span className="block h-1.5 rounded-full bg-surface-2">
                      <span className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(2, p.share))}%`, background: "var(--series-hcmp)" }} />
                    </span>
                    <span className="data text-right">{Math.max(0, p.share).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-caption text-text-tertiary">Office of Financial Research, Money Market Fund Monitor, from the funds&rsquo; monthly reports to the SEC.</p>
          </>
        ) : null
      }
    />
  );
}

/** Insiders across the S&P 500 and the Nasdaq-100 (the SEC's insider data set): open-market purchases and sales by sector, and the largest purchases. */
export function InsidersCard({ insiders, badge }: { insiders: Insiders; badge?: React.ReactNode }) {
  const title = "Insiders across the S&P 500 and Nasdaq-100";
  const top = Math.max(1, ...insiders.sectors.flatMap((s) => [s.bought, s.sold]));
  const bought = insiders.sectors.reduce((s, x) => s + x.bought, 0);
  const sold = insiders.sectors.reduce((s, x) => s + x.sold, 0);
  return (
    <ChartFrame
      title={title}
      badge={badge}
      subtitle={`Open-market purchases and sales by officers, directors and large holders, ${quarterWords(insiders.quarter)}, by sector. Sales include those made under a set plan; awards, exercises and gifts are left out.`}
      table={<ChartTable caption={`${title}, ${quarterWords(insiders.quarter)}`} head={["Sector", "Bought", "Sold", "Companies buying", "Companies selling"]} rows={insiders.sectors.map((s) => [s.sector, flowDollars(s.bought), flowDollars(s.sold), String(s.buyers), String(s.sellers)])} />}
      controls={
        <div className="grid grid-cols-3 gap-3">
          <Figure label="Bought" value={flowDollars(bought)} ink="var(--flow-profit-ink)" />
          <Figure label="Sold" value={flowDollars(sold)} ink="var(--flow-cost-ink)" />
          <Figure label="Companies" value={String(insiders.companies)} />
        </div>
      }
      after={<p className="mt-3 text-caption text-text-tertiary">SEC EDGAR, insider transactions data set (Form 4, codes P and S), published after each quarter.</p>}
    >
      <ul className="space-y-3">
        {insiders.sectors.map((s) => (
          <li key={s.sector} className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-center" title={`${s.sector}: bought ${flowDollars(s.bought)}, sold ${flowDollars(s.sold)}`}>
            <span className="truncate text-footnote">{s.sector}</span>
            <span className="space-y-1">
              {(
                [
                  ["Bought", s.bought, "var(--flow-profit)", "var(--flow-profit-ink)"],
                  ["Sold", s.sold, "var(--flow-cost)", "var(--flow-cost-ink)"],
                ] as const
              ).map(([word, v, fill, ink]) => (
                <span key={word} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3">
                  <span className="block h-1.5 rounded-full bg-surface-2">
                    <span className="block h-1.5 rounded-full" style={{ width: `${v > 0 ? Math.max(1, (v / top) * 100) : 0}%`, background: fill }} />
                  </span>
                  <span className="data text-right text-caption" style={{ color: ink }}>
                    {flowDollars(v)}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {insiders.topBuys.length ? (
        <>
          <p className="mb-1 mt-5 text-footnote font-medium text-text-secondary">The largest purchases</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-footnote sm:grid-cols-4">
            {insiders.topBuys.map((b) => (
              <li key={b.symbol} className="flex items-baseline justify-between gap-2">
                <span className="data font-semibold">{b.symbol}</span>
                <span className="data" style={{ color: "var(--flow-profit-ink)" }}>
                  {flowDollars(b.value)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </ChartFrame>
  );
}
