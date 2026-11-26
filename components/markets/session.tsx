import type * as React from "react";

import { movers, signedPct, type DayMove, type IndexDay, type MarketDay } from "@/lib/market-day";
import { cn } from "@/lib/utils";

const poleOf = (pct: number) => (pct > 0 ? "var(--move-up)" : pct < 0 ? "var(--move-down)" : "var(--text-tertiary)");

/** A move as a pill: the pole's colour behind the figure, the figure itself in ink, so the sign is never colour alone. */
export function MovePill({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={cn("data inline-flex min-w-[4.5rem] justify-center rounded-[6px] px-2 py-0.5 text-footnote font-medium", className)} style={{ background: pct === 0 ? "var(--surface-3)" : poleOf(pct), color: pct === 0 ? "var(--text)" : "var(--move-ink)" }}>
      {signedPct(pct)}
    </span>
  );
}

/** One index through the session: a line of its five-minute prices against a dashed rule at the close before. */
function Spark({ index }: { index: IndexDay }) {
  const w = 120;
  const h = 36;
  const vs = index.points.map((p) => p.v);
  const lo = Math.min(index.prevClose, ...vs);
  const hi = Math.max(index.prevClose, ...vs);
  const t0 = index.points[0]?.t ?? 0;
  const t1 = index.points[index.points.length - 1]?.t ?? 1;
  const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * w);
  const y = (v: number) => (hi === lo ? h / 2 : 2 + (1 - (v - lo) / (hi - lo)) * (h - 4));
  const d = index.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-20 shrink-0 sm:w-[7.5rem]" preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={w} y1={y(index.prevClose)} y2={y(index.prevClose)} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={poleOf(index.changePct)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The four US indices through a session, as the recap shows them: name, the day's line, the level and the move. The last closed session by default; the live layer passes the session so far. The title holds open or shut, since the badge beside it says which (Hamza, 18 Oct 2026). */
export function IndexCards({ day, indices = day?.indices ?? [], title = "How the US indices are doing", label = `US indices in the session of ${day?.session ?? ""}`, note = "Five-minute prices through the session; the dashed line is the close before.", badge }: { day?: MarketDay; indices?: readonly IndexDay[]; title?: string; label?: string; note?: string; badge?: React.ReactNode }) {
  return (
    <section className="card mb-8 px-4 py-3" aria-label={label}>
      <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
        {title}
        {badge}
      </h3>
      <ul className="mt-2">
        {indices.map((i) => (
          <li key={i.symbol} className="flex items-center gap-3 border-t border-hairline py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{i.name}</p>
              <p className="truncate text-footnote text-text-secondary">{i.about}</p>
            </div>
            <Spark index={i} />
            <div className="flex w-[6.5rem] shrink-0 flex-col items-end gap-1">
              <span className="data text-body">{i.symbol === "IWM" ? `$${i.close.toFixed(2)}` : i.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <MovePill pct={i.changePct} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-caption text-text-tertiary">{note}</p>
    </section>
  );
}

function MoverList({ title, list, held }: { title: string; list: DayMove[]; held: Set<string> }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-secondary">{title}</p>
      <ol>
        {list.map((m) => (
          <li key={m.symbol} className="flex items-center gap-2 border-t border-hairline py-2 first:border-t-0">
            <span className="data w-14 shrink-0 font-semibold">{m.symbol}</span>
            <span className="min-w-0 flex-1 truncate text-footnote text-text-secondary">
              {m.name ?? m.subIndustry ?? m.sector}
              {held.has(m.symbol) ? <span className="ml-1.5 text-accent-text">· held</span> : null}
            </span>
            <MovePill pct={m.changePct} />
          </li>
        ))}
        {!list.length ? <li className="py-2 text-footnote text-text-secondary">None moved this way.</li> : null}
      </ol>
    </div>
  );
}

/** The ten S&P 500 companies that rose most and the ten that fell most in the session, side by side on a wide screen. */
export function Movers({ day, held, badge }: { day: MarketDay; held: string[]; badge?: React.ReactNode }) {
  const { gainers, losers } = movers(day);
  const mine = new Set(held.map((s) => s.toUpperCase()));
  return (
    <section className="card mb-8 px-4 py-3" aria-label={`S&P 500 top movers in the session of ${day.session}`}>
      <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
        S&amp;P 500 top movers
        {badge}
      </h3>
      <div className="mt-2 flex flex-col gap-6 lg:flex-row">
        <MoverList title="Gainers · top 10" list={gainers} held={mine} />
        <MoverList title="Losers · top 10" list={losers} held={mine} />
      </div>
    </section>
  );
}
