import { Info } from "lucide-react";
import type * as React from "react";

import { RangeBar } from "@/components/dashboard/range-bar";
import type { DayStats } from "@/lib/performance";
import type { RangeSpec } from "@/lib/markets";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const UP = "var(--move-up)";
const DOWN = "var(--move-down)";
const signed = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(d)}%`;
const monthWords = (ym: string) => new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const place = (v: number, low: number, high: number) => Math.max(0, Math.min(100, ((v - low) / (high - low)) * 100));
const scale = (v: number, low: number, high: number, better: RangeSpec["better"], note: string): RangeSpec => ({ low, high, better, note, source: "scale", pct: place(v, low, high) });

function Card({ label, about, value, tone, children, wide }: { label: string; about: string; value: string; tone?: string; children?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-[16px] border border-hairline bg-surface px-4 py-4", wide && "col-span-2")}>
      <p className="flex items-center gap-1.5 text-subhead text-text-secondary">
        {label}
        <span title={about} className="text-text-tertiary">
          <Info className="size-3.5" aria-label={about} />
        </span>
      </p>
      <p className="data mt-2 text-title-1 font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {children}
    </div>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-footnote text-text-secondary">{children}</p>;

/**
 * Bad days and good days, and next to the benchmark (Hamza, 19 Oct 2026,
 * after Pebble's cards): the bad-day line and the average of those days,
 * the worst and best single day; up and down capture and the tracking error
 * on their scales, the share of days and months that rose, the best and
 * worst month. Every figure carries what it means on hover; losses and
 * gains take the move colours, with the sign printed so colour is never
 * alone.
 */
export function DayStatsCards({ s, badge }: { s: DayStats; badge?: React.ReactNode }) {
  const u = s.unit;
  const us = `${u}s`;
  return (
    <section className="mb-8" aria-label="Bad days and good days">
      <h2 className="section-header mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        Bad {us} and good {us}
        {badge}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={`Bad-${u} line`} about={`The loss that one ${u} in twenty reached or passed (the 5th percentile of the ${us} from ${longDate(s.from)}).`} value={s.badLine === null ? "–" : `${s.badLine.toFixed(1)}%`} tone={s.badLine ? DOWN : undefined}>
          <Note>{s.badLine === null ? `Needs twenty ${us}; there are ${s.n}.` : `1 ${u} in 20 was this bad or worse`}</Note>
        </Card>
        <Card label={`Average of bad ${us}`} about={`The average loss across those worst ${us}, one in twenty.`} value={s.badAverage === null ? "–" : `${s.badAverage.toFixed(1)}%`} tone={s.badAverage ? DOWN : undefined}>
          <Note>across those worst {us}</Note>
        </Card>
        <Card label={`Worst ${u}`} about={`The largest fall in one ${u}, time-weighted, so a withdrawal is not a fall.`} value={s.worst ? signed(s.worst.pct) : "–"} tone={s.worst && s.worst.pct < 0 ? DOWN : undefined}>
          <Note>{s.worst ? longDate(s.worst.date) : "No returns yet"}</Note>
        </Card>
        <Card label={`Best ${u}`} about={`The largest rise in one ${u}, time-weighted, so a deposit is not a gain.`} value={s.best ? signed(s.best.pct) : "–"} tone={s.best && s.best.pct > 0 ? UP : undefined}>
          <Note>{s.best ? longDate(s.best.date) : "No returns yet"}</Note>
        </Card>
      </div>

      <h2 className="section-header mt-7 mb-3 px-1">{s.benchmark ? `Next to ${s.benchmark === "SPY" ? "the S&P 500 (SPY)" : s.benchmark === "QQQ" ? "the Nasdaq-100 (QQQ)" : s.benchmark}` : "Up and down"}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {s.benchmark ? (
          <>
            <Card label="Up-market capture" about={`On the ${us} ${s.benchmark} rose, the account's average return over ${s.benchmark}'s. Over 100% means it gained more.`} value={s.upCapture === null ? "–" : `${s.upCapture.toFixed(0)}%`}>
              {s.upCapture !== null ? <RangeBar range={scale(s.upCapture, 50, 150, "high", "100% matches the benchmark's gains.")} format={(v) => `${v.toFixed(0)}%`} limit={100} /> : null}
              <Note>{s.upCapture === null ? `Needs five of its up ${us}.` : `of its gains on its up ${us}`}</Note>
            </Card>
            <Card label="Down-market capture" about={`On the ${us} ${s.benchmark} fell, the account's average return over ${s.benchmark}'s. Under 100% means it lost less.`} value={s.downCapture === null ? "–" : `${s.downCapture.toFixed(0)}%`}>
              {s.downCapture !== null ? <RangeBar range={scale(s.downCapture, 50, 150, "low", "100% matches the benchmark's losses.")} format={(v) => `${v.toFixed(0)}%`} limit={100} /> : null}
              <Note>{s.downCapture === null ? `Needs five of its down ${us}.` : `of its losses on its down ${us}`}</Note>
            </Card>
            <Card label="Tracking error" about={`How far the account's ${u} returns strayed from ${s.benchmark}'s, annualised: the spread of the difference. Neither high nor low is better; it says how different the book is.`} value={s.trackingError === null ? "–" : `${s.trackingError.toFixed(1)}%`}>
              {s.trackingError !== null ? <RangeBar range={scale(s.trackingError, 0, 30, null, "0% would be the benchmark itself.")} format={(v) => `${v.toFixed(0)}%`} /> : null}
              <Note>how far you strayed, a year</Note>
            </Card>
          </>
        ) : null}
        <Card label={`${u === "day" ? "Days" : u === "week" ? "Weeks" : "Months"} up`} about={`The share of ${us} the account rose, and of calendar months.`} value={s.upShare === null ? "–" : `${s.upShare.toFixed(0)}%`}>
          <Note>{s.monthsUp === null ? "months up: needs two months" : `months up: ${s.monthsUp.toFixed(0)}%`}</Note>
        </Card>
        <Card wide label="Best month" about="The calendar month the account rose most, time-weighted." value={s.bestMonth ? signed(s.bestMonth.pct) : "–"} tone={s.bestMonth && s.bestMonth.pct > 0 ? UP : undefined}>
          <Note>{s.bestMonth ? monthWords(s.bestMonth.ym) : "No whole month yet"}</Note>
        </Card>
        <Card wide label="Worst month" about="The calendar month the account fell most, time-weighted." value={s.worstMonth ? signed(s.worstMonth.pct) : "–"} tone={s.worstMonth && s.worstMonth.pct < 0 ? DOWN : undefined}>
          <Note>{s.worstMonth ? monthWords(s.worstMonth.ym) : "No whole month yet"}</Note>
        </Card>
      </div>
    </section>
  );
}
