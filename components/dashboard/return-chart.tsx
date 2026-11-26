"use client";

import * as React from "react";

import { LineChart } from "@/components/charts/line-chart";
import { FreshBadge } from "@/components/ui/freshness";
import type { Fresh } from "@/lib/freshness";
import type { LiveQuote } from "@/lib/live";
import { CHART_MODES, CHART_PERIODS, chartSeries, MODE_LABEL, type ChartMode, type ChartPeriod, type CustomWindow, type ReturnChartData } from "@/lib/return-chart";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = { book: "var(--series-hcmp)", SPY: "var(--series-spy)", QQQ: "var(--series-qqq)" };
const OTHER = "var(--viz-text)";

const KEY = "pos:return-chart";

/**
 * The Dashboard's chart: the book's time-weighted return or its value
 * against SPY and QQQ, over YTD, 3M, 6M, 1Y, 2Y, 5Y or two dates, chosen on
 * the chart with no reload (Hamza, 15 Oct 2026). While the US market is
 * open the last point is today's prices, from the same read as the tiles
 * above it, and the badge says Live; after the bell the last point is the
 * session's close and the badge says the markets have closed, with the
 * session's date (`liveBadge` either way, from the Dashboard). The choice
 * is remembered on the device; nothing is sent.
 */
export function ReturnChart({ data, live, open, bookFresh, liveBadge }: { data: ReturnChartData; live: { bookRatio: number | null; quotes: readonly LiveQuote[]; at: Date | null } | null; open: boolean; bookFresh: Fresh | null; liveBadge: React.ReactNode }) {
  const [mode, setMode] = React.useState<ChartMode>("return");
  const [period, setPeriod] = React.useState<ChartPeriod>("YTD");
  const [custom, setCustom] = React.useState<CustomWindow>({ from: data.dates[0], to: data.asOf });
  React.useEffect(() => {
    // The device's last choice, applied a frame after the first draw so the server's and the client's first paint agree.
    const frame = window.requestAnimationFrame(() => {
      try {
        const kept = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { mode?: ChartMode; period?: ChartPeriod; custom?: CustomWindow } | null;
        if (kept?.mode && (CHART_MODES as readonly string[]).includes(kept.mode)) setMode(kept.mode);
        if (kept?.period && (CHART_PERIODS as readonly string[]).includes(kept.period)) setPeriod(kept.period);
        if (kept?.custom?.from && kept?.custom?.to) setCustom(kept.custom);
      } catch {
        // A private window or blocked storage: the defaults stand.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const remember = (next: { mode?: ChartMode; period?: ChartPeriod; custom?: CustomWindow }) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ mode, period, custom, ...next }));
    } catch {
      // Nothing to do: the choice still applies this session.
    }
  };
  const out = React.useMemo(() => chartSeries(data, mode, period, custom, live && live.at ? { bookRatio: live.bookRatio, quotes: live.quotes, now: live.at } : null), [data, mode, period, custom, live]);
  const format = mode === "return" ? "signedPct1" : (`ccy:${data.currency}` as const);
  const fmtEnd = (v: number | null) => (v === null ? "n/a" : mode === "return" ? `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%` : new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency, maximumFractionDigits: 0 }).format(v));
  const toggle = (label: string, options: readonly string[], current: string, pick: (v: string) => void, show: (v: string) => string = (v) => v) => (
    <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-surface-2 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === current} onClick={() => pick(o)} className={cn("inline-flex h-8 items-center rounded-[8px] px-2.5 text-footnote transition-colors", o === current ? "bg-surface text-text shadow-sm" : "text-text-secondary hover:text-text")}>
          {show(o)}
        </button>
      ))}
    </div>
  );
  const subtitle = out.dates.length ? `${longDate(out.from)} to ${longDate(out.to)}${out.live ? (open ? ", today at the prices now" : ", the last session at its close") : ""}. ${mode === "return" ? "Time-weighted: deposits and withdrawals taken out, so the line is what the picks did." : "Each benchmark is what the same starting money would be worth in it."} Your portfolio ends ${fmtEnd(out.end)}.` : "No points in this window yet.";
  return (
    <div className="mb-6" data-tour="return-chart" data-live={out.live ? "today" : "close"}>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        {toggle("Return or value", CHART_MODES, mode, (v) => { setMode(v as ChartMode); remember({ mode: v as ChartMode }); }, (v) => MODE_LABEL[v as ChartMode])}
        {toggle("Period", CHART_PERIODS, period, (v) => { setPeriod(v as ChartPeriod); remember({ period: v as ChartPeriod }); })}
        {period === "Custom" ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-footnote text-text-secondary">
            <input type="date" aria-label="From" value={custom.from} min={data.dates[0]} max={data.asOf} onChange={(e) => { const c = { ...custom, from: e.target.value }; setCustom(c); remember({ custom: c }); }} className="h-8 rounded-[8px] border border-hairline-strong bg-surface-2 px-2 text-footnote text-text" />
            to
            <input type="date" aria-label="To" value={custom.to} min={data.dates[0]} max={data.asOf} onChange={(e) => { const c = { ...custom, to: e.target.value }; setCustom(c); remember({ custom: c }); }} className="h-8 rounded-[8px] border border-hairline-strong bg-surface-2 px-2 text-footnote text-text" />
          </span>
        ) : null}
      </div>
      <LineChart
        title={mode === "return" ? `Your return against SPY and QQQ · ${period}` : `Your portfolio's value against SPY and QQQ · ${period}`}
        badge={out.live ? liveBadge : bookFresh ? <FreshBadge compact fresh={bookFresh} /> : null}
        subtitle={subtitle}
        dates={out.dates}
        series={out.lines.map((l) => ({ key: l.key, label: l.label, color: COLORS[l.key] ?? OTHER, values: l.values }))}
        format={format}
        height={260}
        baseline={mode === "return" ? 0 : null}
        wash
        tableCaption={`${mode === "return" ? "Return" : "Value"} over ${period}, your portfolio against SPY and QQQ`}
        tableEvery={out.dates.length > 90 ? 5 : 1}
      />
    </div>
  );
}
