import type * as React from "react";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import { RangeBar } from "@/components/dashboard/range-bar";
import { InfoTip } from "@/components/ui/info-tip";
import type { RangeSpec } from "@/lib/markets";
import { EXTRA_INFO } from "@/lib/metric-info";
import { peText, type PortfolioPe } from "@/lib/portfolio-pe";
import { longDate } from "@/lib/time";

const W = 640;
const H = 190;
const PAD = { l: 8, r: 8, t: 14, b: 18 };

/** Where today's P/E sits on its year, coloured as the Markets cards are. */
const rangeOf = (pe: PortfolioPe, now: number): RangeSpec | null =>
  pe.range ? { low: pe.range.low, high: pe.range.high, better: null, note: `The portfolio's P/E from ${longDate(pe.range.from)} to today.`, source: "year", pct: pe.range.high > pe.range.low ? Math.max(0, Math.min(100, ((now - pe.range.low) / (pe.range.high - pe.range.low)) * 100)) : 50 } : null;

/** A word for where it sits: in the cheaper or dearer third of its year, or mid-range. */
const placeWords = (pct: number) => (pct <= 33 ? "in the cheaper third of its year" : pct >= 67 ? "in the dearer third of its year" : "mid-range for its year");

function Line({ pe }: { pe: PortfolioPe }) {
  const h = pe.history;
  const r = pe.range!;
  const lo = Math.min(r.low, ...h.map((p) => p.pe));
  const hi = Math.max(r.high, ...h.map((p) => p.pe));
  const pad = (hi - lo) * 0.12 || 1;
  const y = (v: number) => PAD.t + (1 - (v - (lo - pad)) / (hi + pad - (lo - pad))) * (H - PAD.t - PAD.b);
  const x = (i: number) => PAD.l + (i / Math.max(1, h.length - 1)) * (W - PAD.l - PAD.r);
  const path = h.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pe).toFixed(1)}`).join("");
  const area = `${path}L${x(h.length - 1).toFixed(1)},${H - PAD.b}L${x(0).toFixed(1)},${H - PAD.b}Z`;
  const iLow = h.findIndex((p) => p.date === r.lowOn);
  const iHigh = h.findIndex((p) => p.date === r.highOn);
  const mark = (i: number, label: string, above: boolean) =>
    i < 0 ? null : (
      <g>
        <circle cx={x(i)} cy={y(h[i].pe)} r={4} fill="var(--surface)" stroke="var(--viz-text)" strokeWidth={2} />
        <text x={Math.min(W - 40, Math.max(40, x(i)))} y={y(h[i].pe) + (above ? -9 : 17)} textAnchor="middle" className="data" fontSize={11} fill="var(--text-secondary)">
          {label} {peText(h[i].pe)}
        </text>
      </g>
    );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`The portfolio's P/E over the year, from ${peText(r.low)} to ${peText(r.high)}`}>
      <defs>
        <linearGradient id="pe-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--viz)" stopOpacity={0.45} />
          <stop offset="100%" stopColor="var(--viz)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(r.median)} y2={y(r.median)} stroke="var(--text-tertiary)" strokeDasharray="4 4" strokeWidth={1} />
      <text x={W - PAD.r} y={y(r.median) - 5} textAnchor="end" className="data" fontSize={11} fill="var(--text-tertiary)">
        median {peText(r.median)}
      </text>
      <path d={area} fill="url(#pe-area)" />
      <path d={path} fill="none" stroke="var(--viz-text)" strokeWidth={2} strokeLinejoin="round" />
      {mark(iHigh, "high", true)}
      {mark(iLow, "low", false)}
      <circle cx={x(h.length - 1)} cy={y(h.at(-1)!.pe)} r={5} fill="var(--viz-text)" stroke="var(--surface)" strokeWidth={2} />
      <text x={PAD.l} y={H - 4} className="data" fontSize={11} fill="var(--text-tertiary)">
        {longDate(r.from)}
      </text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" className="data" fontSize={11} fill="var(--text-tertiary)">
        {longDate(r.to)}
      </text>
    </svg>
  );
}

/**
 * The portfolio's P/E (Hamza, 19 Oct 2026: on Holdings, with a historical
 * range, coloured): today's figure large with its earnings yield, its place
 * on the year's low to high, the year as a line with the median, low and high
 * marked, the S&P 500's P/E beside it when the feed reads one, and each
 * holding's own P/E as a bar by weight. What it leaves out is named.
 */
export function PortfolioPeCard({ pe, spx, badge }: { pe: PortfolioPe; spx: number | null; badge?: React.ReactNode }) {
  const now = pe.pe;
  const range = now !== null ? rangeOf(pe, now) : null;
  const maxPe = Math.max(1, ...pe.included.map((i) => i.pe));
  const months = pe.history.filter((p, i, all) => i === all.length - 1 || p.date.slice(0, 7) !== all[i + 1].date.slice(0, 7));
  const table = (
    <div className="space-y-4">
      <ChartTable caption="Each holding's P/E and its weight in the portfolio's" head={["Holding", "P/E", "Weight"]} rows={pe.included.map((i) => [i.symbol, peText(i.pe), `${i.weight.toFixed(1)}%`])} />
      {months.length ? <ChartTable caption="The portfolio's P/E at each month's last session" head={["Session", "P/E"]} rows={months.map((m) => [longDate(m.date), peText(m.pe)])} /> : null}
    </div>
  );
  const leftWords = [...pe.left.map((l) => `${l.symbol} (${l.why})`)];
  return (
    <ChartFrame
      className="mb-8"
      title="Portfolio P/E"
      badge={badge}
      subtitle={
        <>
          What the book pays for each dollar of its companies&apos; trailing twelve months&apos; earnings: each holding&apos;s price over its diluted EPS from the filings, weighted by value (a harmonic mean, so earnings add up as the book owns them).{" "}
          <InfoTip id="portfolio-pe" label="the portfolio's P/E" text={EXTRA_INFO.portfolio_pe} side="below" align="start" />
        </>
      }
      table={table}
    >
      {now === null ? (
        <p className="text-subhead text-text-secondary">{pe.left.length ? `No listed holding has a P/E yet: ${leftWords.join(", ")}.` : "Needs listed holdings with filings read; the P/E comes from each company's trailing earnings."}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 rounded-[14px] bg-surface-2 p-4" style={{ backgroundImage: "radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--viz) 22%, transparent), transparent 70%)" }}>
            <p className="text-caption uppercase tracking-wide text-text-tertiary">Today</p>
            <p className="data mt-1 text-[2.6rem] font-semibold leading-none">{peText(now)}</p>
            <p className="mt-1.5 text-footnote text-text-secondary">
              An earnings yield of <span className="data text-text">{pe.earningsYield!.toFixed(2)}%</span>
              {spx ? (
                <>
                  ; the S&amp;P 500 is at <span className="data text-text">{peText(spx)}</span>
                </>
              ) : null}
              .
            </p>
            {range ? (
              <>
                <RangeBar range={range} format={peText} />
                <p className="mt-2 text-footnote text-text-secondary">Today it is {placeWords(range.pct)}.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["Low", pe.range!.low, pe.range!.lowOn],
                    ["Median", pe.range!.median, null],
                    ["High", pe.range!.high, pe.range!.highOn],
                  ].map(([label, v, on]) => (
                    <div key={label as string} className="min-w-0 rounded-[10px] bg-surface px-2.5 py-2">
                      <p className="text-caption text-text-tertiary">{label as string}</p>
                      <p className="data text-subhead font-semibold">{peText(v as number)}</p>
                      {on ? <p className="truncate text-caption text-text-tertiary">{longDate(on as string)}</p> : <p className="text-caption text-text-tertiary">of the year</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-footnote text-text-secondary">{pe.historyLeft.length && pe.historyLeft.every((l) => l.why.startsWith("no trailing EPS")) ? "The year's range appears after the next filings read, which keeps each quarter's trailing EPS." : `The year's range needs a year of closes and filings: ${pe.historyLeft.map((l) => `${l.symbol} (${l.why})`).join(", ") || "too few sessions read"}.`}</p>
            )}
          </div>
          <div className="min-w-0">
            {range ? <Line pe={pe} /> : null}
            <p className={`text-caption uppercase tracking-wide text-text-tertiary ${range ? "mt-3" : ""}`}>Each holding, by weight in the P/E</p>
            <ul className="mt-2 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
              {pe.included.map((i) => (
                <li key={i.symbol} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-footnote">
                    <span className="data font-semibold">{i.symbol}</span>
                    <span className="data text-text-secondary">
                      {peText(i.pe)} · {i.weight.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (i.pe / maxPe) * 100)}%`, background: i.pe <= now ? "color-mix(in oklab, var(--viz-text) 85%, transparent)" : "color-mix(in oklab, var(--viz-text) 40%, transparent)" }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-text-tertiary">A darker bar is at or under the portfolio&apos;s P/E.</p>
          </div>
        </div>
      )}
      {now !== null ? (
        <p className="mt-3 text-caption text-text-tertiary">
          Covers {pe.coveredPct.toFixed(0)}% of the listed holdings by value{leftWords.length ? `; left out: ${leftWords.join(", ")}` : ""}.
          {range ? ` The range reads each holding's closes against its trailing EPS as known then (a quarter counts from 45 days after it ends), at today's shares and exchange rates${pe.historyPct < 99.5 ? `, ${pe.historyPct.toFixed(0)}% of the P/E's value; ${pe.historyLeft.map((l) => `${l.symbol} (${l.why})`).join(", ")} left out` : ""}.` : ""}
        </p>
      ) : null}
    </ChartFrame>
  );
}
