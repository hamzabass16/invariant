import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { signedPct } from "@/lib/format";
import { alphaWords, type AlphaStats } from "@/lib/performance";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-surface px-3 py-2">
      <p className="truncate text-caption text-text-tertiary">{label}</p>
      <p className="data truncate text-subhead font-semibold">{value}</p>
      {detail ? <p className="truncate text-caption text-text-tertiary">{detail}</p> : null}
    </div>
  );
}

/** The 95% interval as a band on a scale through zero, alpha marked: a band that crosses zero is an alpha the sample cannot tell from none. */
function Interval({ a }: { a: AlphaStats }) {
  const span = Math.max(5, Math.abs(a.low), Math.abs(a.high)) * 1.1;
  const at = (v: number) => `${50 + (Math.max(-span, Math.min(span, v)) / span) * 50}%`;
  return (
    <div className="mt-4">
      <div className="relative h-3 rounded-full bg-surface-2" aria-hidden>
        <span className="absolute inset-y-[-4px] left-1/2 w-px bg-hairline" />
        <span className="absolute inset-y-0 rounded-full" style={{ left: at(a.low), right: `calc(100% - ${at(a.high)})`, background: "color-mix(in oklab, var(--viz) 35%, transparent)" }} />
        <span className="absolute inset-y-[-3px] w-1 -translate-x-1/2 rounded-full bg-viz" style={{ left: at(a.alpha) }} />
      </div>
      <div className="mt-1 flex justify-between text-caption text-text-tertiary">
        <span className="data">{signedPct(-span, 0)}</span>
        <span>95% interval {signedPct(a.low, 1)} to {signedPct(a.high, 1)}</span>
        <span className="data">{signedPct(span, 0)}</span>
      </div>
    </div>
  );
}

/** Each pair of excess returns as a dot, the fitted line through them: its height at zero is alpha, its slope beta. */
function Scatter({ a }: { a: AlphaStats }) {
  const W = 320;
  const H = 220;
  const pad = 28;
  const xs = a.points.map((p) => p.x);
  const ys = a.points.map((p) => p.y);
  const lim = Math.max(0.5, ...xs.map(Math.abs), ...ys.map(Math.abs)) * 1.05;
  const sx = (v: number) => pad + ((v + lim) / (2 * lim)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v + lim) / (2 * lim)) * (H - 2 * pad);
  // Alpha a year back to one return's worth, in percent, for the line's height at zero.
  const daily = a.alpha / a.perYear;
  const line = (x: number) => daily + a.beta * x;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`Each ${a.perYear === 252 ? "day" : a.perYear === 52 ? "week" : "month"}'s excess return of the book against ${a.benchmark}'s, with the fitted line: alpha ${signedPct(a.alpha, 1)} a year, beta ${a.beta.toFixed(2)}.`}>
      <line x1={sx(-lim)} x2={sx(lim)} y1={sy(0)} y2={sy(0)} stroke="var(--hairline)" />
      <line x1={sx(0)} x2={sx(0)} y1={sy(-lim)} y2={sy(lim)} stroke="var(--hairline)" />
      {a.points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.2} fill="var(--series-hcmp)" fillOpacity={0.45} />
      ))}
      <line x1={sx(-lim)} x2={sx(lim)} y1={sy(line(-lim))} y2={sy(line(lim))} stroke="var(--viz)" strokeWidth={2} />
      <text x={W - pad} y={H - 8} textAnchor="end" className="fill-[var(--text-tertiary)] text-[10px]">
        {a.benchmark}, %
      </text>
      <text x={pad - 4} y={pad - 10} className="fill-[var(--text-tertiary)] text-[10px]">
        Your book, %
      </text>
    </svg>
  );
}

/**
 * Alpha with how it was found (Hamza, 19 Oct 2026: its own card like the
 * IRR's, the p-test shown): Jensen's alpha a year with its 95% interval and
 * what the p-value says, then the regression it comes from: the equation
 * with this window's numbers, beta, the t statistic, the p-value, R² and the
 * count, and the returns as dots under the fitted line.
 */
export function AlphaCard({ a, badge, windows, needs }: { a: AlphaStats | null; badge?: React.ReactNode; windows?: { key: string; href: string; current: boolean }[]; needs?: string | null }) {
  const unit = a ? (a.perYear === 252 ? "daily" : a.perYear === 52 ? "weekly" : "monthly") : "daily";
  return (
    <section className="card mb-8 overflow-hidden" aria-labelledby="alpha-title" id="alpha">
      <div className="grid gap-px bg-hairline lg:grid-cols-[1.15fr_1fr]">
        <div className="bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="alpha-title" className="section-header">Alpha · against {a?.benchmark ?? "the benchmark"}</h2>
            {badge}
          </div>
          {a ? (
            <>
              <p className={cn("data figure-in mt-2 text-large-title font-semibold tracking-[-0.02em]", a.p < 0.05 ? (a.alpha > 0 ? "text-ok" : "text-danger") : "text-text")}>
                {signedPct(a.alpha, 1)}
                <span className="ml-2 align-middle text-subhead font-normal text-text-secondary">a year · p = {a.p < 0.001 ? "<0.001" : a.p.toFixed(a.p < 0.1 ? 3 : 2)}</span>
              </p>
              <p className="mt-0.5 text-footnote text-text-secondary">
                {longDate(a.from)} to {longDate(a.to)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-subhead text-text-secondary">{needs ?? "Not enough returns in this window."}</p>
          )}
          {windows?.length ? (
            <div className="mt-3 inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1" role="group" aria-label="Period for alpha">
              {windows.map((w) => (
                <Link key={w.key} href={w.href as Route} scroll={false} aria-current={w.current ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-[8px] px-2.5 text-footnote", w.current ? "bg-surface text-text" : "text-text-secondary")}>
                  {w.key}
                </Link>
              ))}
            </div>
          ) : null}
          {a ? (
            <>
              <Interval a={a} />
              <p className="mt-3 text-footnote text-text">{alphaWords(a)}</p>
            </>
          ) : null}
        </div>
        <div className="bg-surface-2/60 px-5 py-4">
          <p className="section-header">How it is found</p>
          <p className="mt-2 text-subhead text-text">
            Each {unit} return of the book and of {a?.benchmark ?? "the benchmark"}, less the risk-free rate, are set against each other and a straight line is fitted through them. Its slope is beta; where it crosses zero is alpha, the return the benchmark&apos;s moves do not explain.
          </p>
          {a ? (
            <>
              <p className="data mt-3 rounded-[10px] bg-surface px-3 py-2 text-footnote">
                {signedPct(a.bookExcess, 1)} = {signedPct(a.alpha, 1)} + {a.beta.toFixed(2)} × {signedPct(a.benchExcess, 1)}
                <span className="mt-0.5 block font-sans text-caption text-text-tertiary">your excess return a year = alpha + beta × {a.benchmark}&apos;s excess return a year</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Fact label="Beta" value={a.beta.toFixed(2)} detail={`± ${a.betaSe.toFixed(2)}`} />
                <Fact label="t statistic" value={a.t.toFixed(2)} detail={`${a.df} degrees of freedom`} />
                <Fact label="p-value" value={a.p < 0.001 ? "<0.001" : a.p.toFixed(3)} detail="two-sided, alpha = 0" />
                <Fact label="Standard error" value={`${a.alphaSe.toFixed(1)}%`} detail="of alpha, a year" />
                <Fact label="R²" value={a.r2.toFixed(2)} detail={`explained by ${a.benchmark}`} />
                <Fact label="Returns" value={`${a.n}`} detail={`${a.perYear} a year`} />
              </div>
              <Scatter a={a} />
              <p className="mt-2 text-caption text-text-tertiary">
                Time-weighted, so deposits and withdrawals are taken out. Risk-free rate {(a.rate * 100).toFixed(1)}% a year{a.rate ? " from the book's market inputs" : ", none in the book"}. A p-value under 0.05 is the usual line for an alpha that is unlikely to be luck; a short window rarely clears it.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
