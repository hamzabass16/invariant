import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import { StatusPill } from "@/components/ui/status";
import { AT_VALUE_PCT, BAND_LABEL, fairSentence, STALE_VALUATION_DAYS, ZONE_LABEL, type FairBand, type FairBook, type FairCase, type FairRow } from "@/lib/fair-value";
import { money } from "@/lib/holdings";
import { longDate } from "@/lib/time";

const TONE: Record<FairBand, "ok" | "neutral" | "warn"> = { under: "ok", at: "neutral", over: "warn" };
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;
const per = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });

/** One holding's move to its base as a bar from zero: right is upside to the base, left is how far the price stands over it. */
function GapBar({ pct, reach }: { pct: number; reach: number }) {
  const w = Math.min(50, (Math.abs(pct) / reach) * 50);
  return (
    <div className="relative h-2 rounded-full bg-surface-2" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-text-tertiary" />
      <div className={`absolute inset-y-0 rounded-full ${pct >= 0 ? "bg-ok" : "bg-warn"}`} style={pct >= 0 ? { left: "50%", width: `${Math.max(1, w)}%` } : { right: "50%", width: `${Math.max(1, w)}%` }} />
    </div>
  );
}

function CaseTile({ label, c, words }: { label: string; c: FairCase | null; words: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-surface px-2.5 py-2">
      <p className="text-caption text-text-tertiary">{label}</p>
      <p className="data text-subhead font-semibold">{c ? signed(c.toFairPct) : "n/a"}</p>
      <p className="truncate text-caption text-text-tertiary">{c && c.atBase ? `${c.atBase} at base` : words}</p>
    </div>
  );
}

function Row({ r, reach }: { r: FairRow; reach: number }) {
  return (
    <li className="min-w-0 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-footnote">
        <Link href={`/company/${encodeURIComponent(r.symbol)}#your-value` as Route} className="data font-semibold text-accent-text">
          {r.symbol}
        </Link>
        <span className="data text-text-secondary">
          {per(r.price)} against {per(r.own.base)}
        </span>
        <span className="data ml-auto font-semibold">{signed(r.toBasePct)}</span>
      </div>
      <div className="mt-1.5">
        <GapBar pct={r.toBasePct} reach={reach} />
      </div>
      <p className="mt-1 text-caption text-text-tertiary">
        {r.pctOfBase.toFixed(0)}% of your base{r.zone ? `, ${ZONE_LABEL[r.zone]}` : ""} · {r.weightPct.toFixed(1)}% of the valued book · set {longDate(r.own.asOf)}
        {r.stale ? ", over a year ago" : ""}
      </p>
    </li>
  );
}

/**
 * The book against the person's own fair values (Hamza, 4 Nov 2026): the
 * value-weighted move from today's prices to their base cases, with the bear
 * and the bull, then each holding's price against its base as a bar from
 * zero, the most upside first; the holdings with no valuation named, each a
 * link to its thesis's Valuation calculator.
 */
export function FairValueCard({ book, ccy, badge }: { book: FairBook; ccy: string; badge?: React.ReactNode }) {
  const reach = Math.max(10, ...book.rows.map((r) => Math.abs(r.toBasePct)));
  const table = (
    <ChartTable
      caption="Each holding's price against your own valuation"
      head={["Holding", "Price", "Bear", "Base", "Bull", "To base", "Weight", "Set"]}
      rows={book.rows.map((r) => [r.symbol, per(r.price), r.own.low === null ? "–" : per(r.own.low), per(r.own.base), r.own.high === null ? "–" : per(r.own.high), signed(r.toBasePct), `${r.weightPct.toFixed(1)}%`, longDate(r.own.asOf)])}
    />
  );
  return (
    <ChartFrame
      className="mb-8"
      title="Against your fair value"
      badge={badge}
      subtitle={`Each listed holding's price against the base case of the valuation you set on its thesis, and the book over all of them, each weighted by what it is worth today. Within ${AT_VALUE_PCT}% of the base is at value. Your own arithmetic, never a forecast.`}
      table={book.rows.length ? table : <p className="text-footnote text-text-secondary">{fairSentence(book)}</p>}
    >
      <div id="fair-value" className="scroll-mt-20" />
      {book.rows.length && book.band && book.toFairPct !== null ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div className="min-w-0 rounded-[14px] bg-surface-2 p-4" style={{ backgroundImage: "radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--viz) 22%, transparent), transparent 70%)" }}>
            <p className="flex items-center gap-2 text-caption uppercase tracking-wide text-text-tertiary">
              Your valued book <StatusPill tone={TONE[book.band]}>{BAND_LABEL[book.band]}</StatusPill>
            </p>
            <p className="data mt-2 text-[2.6rem] font-semibold leading-none">{signed(book.toFairPct)}</p>
            <p className="mt-1.5 text-footnote text-text-secondary">to reach your base cases, by value, over the {book.rows.length} holding{book.rows.length === 1 ? "" : "s"} you have valued.</p>
            <p className="mt-2 text-footnote text-text-secondary">
              Worth <span className="data text-text">{money(book.value, ccy)}</span> today, <span className="data text-text">{money(book.fair, ccy)}</span> at your bases: priced at <span className="data text-text">{book.pctOfFair!.toFixed(0)}%</span> of your fair value.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <CaseTile label="To your bears" c={book.bear} words="all set" />
              <CaseTile label="To your bases" c={{ fair: book.fair, toFairPct: book.toFairPct, band: book.band, atBase: 0 }} words={`${book.rows.length} valued`} />
              <CaseTile label="To your bulls" c={book.bull} words="all set" />
            </div>
            <p className="mt-3 text-caption text-text-tertiary">
              {book.counts.under} below, {book.counts.at} at, {book.counts.over} above your value. Covers {book.coveredPct.toFixed(0)}% of the listed holdings by value.
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-caption uppercase tracking-wide text-text-tertiary">Each holding, price against your base</p>
            <ul className="mt-1 grid grid-cols-1 gap-x-5 divide-y divide-hairline sm:grid-cols-2 sm:divide-y-0">
              {book.rows.map((r) => (
                <Row key={r.symbol} r={r} reach={reach} />
              ))}
            </ul>
            <p className="mt-2 text-caption text-text-tertiary">A green bar to the right is the rise to your base; an amber bar to the left is how far the price stands over it.{book.rows.some((r) => r.stale) ? ` A valuation set over ${STALE_VALUATION_DAYS} days ago says so.` : ""}</p>
          </div>
        </div>
      ) : (
        <p className="text-subhead text-text-secondary">{fairSentence(book)} Set a bear, base and bull per share in the Valuation calculator on a holding&apos;s thesis and press Keep; it is read here at once.</p>
      )}
      {book.missing.length ? (
        <p className="mt-3 text-caption text-text-tertiary">
          Not valued:{" "}
          {book.missing.slice(0, 20).map((m, i) => (
            <span key={m.symbol}>
              {i ? ", " : ""}
              <Link href={`/theses/${encodeURIComponent(m.symbol)}#valuation` as Route} className="text-accent-text">
                {m.symbol}
              </Link>
              {m.why === "no valuation of yours yet" ? "" : ` (${m.why})`}
            </span>
          ))}
          {book.missing.length > 20 ? ` and ${book.missing.length - 20} more` : ""}.
        </p>
      ) : null}
    </ChartFrame>
  );
}
