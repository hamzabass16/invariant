"use client";

import { useState } from "react";

import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { INSIDER_PERIODS, tradeWords, type InsiderPeriod, type InsiderView } from "@/lib/insiders";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const usd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}bn` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}m` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`;
  return n < 0 ? `-${s}` : s;
};

/** The trades shown before Show all; the rest under a fold. */
const SHOWN = 9;

export type InsiderWindow = { from: string; days: number; v: InsiderView };

/**
 * The insiders' open-market trades over the window chosen on the card (Hamza,
 * 23 Oct 2026): the past year, the year to date, six months or three, each
 * with its dates; the forms are read each morning, so no read date is shown.
 */
export function InsiderPeriods({ windows, today, symbol, footnote }: { windows: Record<InsiderPeriod, InsiderWindow>; today: string; symbol: string; footnote: React.ReactNode }) {
  const [period, setPeriod] = useState<InsiderPeriod>("1y");
  const { from, days, v } = windows[period];
  const label = INSIDER_PERIODS.find((p) => p.key === period)!.label.toLowerCase();
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-[10px] bg-surface-2 p-0.5" role="tablist" aria-label="Insider trades over">
          {INSIDER_PERIODS.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={p.key === period} onClick={() => setPeriod(p.key)} className={cn("h-8 rounded-[8px] px-3 text-footnote font-medium", p.key === period ? "bg-accent text-white" : "text-text-secondary")}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="data text-footnote text-text-tertiary">
          {longDate(from)} to {longDate(today)}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-footnote text-text-secondary">Bought</dt>
          <dd className="data text-title-3 text-ok">{usd(v.buys.value)}</dd>
          <dd className="text-caption text-text-tertiary">
            {v.buys.people} insider{v.buys.people === 1 ? "" : "s"}, {v.buys.trades} trade{v.buys.trades === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt className="text-footnote text-text-secondary">Sold</dt>
          <dd className="data text-title-3 text-danger">{usd(v.sales.value)}</dd>
          <dd className="text-caption text-text-tertiary">
            {v.sales.people} insider{v.sales.people === 1 ? "" : "s"}, {v.sales.trades} trade{v.sales.trades === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt className="text-footnote text-text-secondary">Net</dt>
          <dd className={`data text-title-3 ${v.net > 0 ? "text-ok" : v.net < 0 ? "text-danger" : ""}`}>{usd(v.net)}</dd>
          <dd className="text-caption text-text-tertiary">bought less sold</dd>
        </div>
        <div>
          <dt className="text-footnote text-text-secondary">Sales under a plan</dt>
          <dd className="data text-title-3">{v.plannedPct === null ? "n/a" : `${Math.round(v.plannedPct)}%`}</dd>
          <dd className="text-caption text-text-tertiary">10b5-1, set in advance</dd>
        </div>
      </dl>
      <p className="mt-3 text-caption text-text-tertiary">
        Open-market purchases and sales (Form 4 codes P and S) by directors, officers and holders of a tenth or more, over the {label}, {days} days. {footnote}
      </p>
      {v.trades.length ? (
        <div className="mt-5">
          <ListSection grid header={`${symbol} insider trades, ${label}`} footer={v.trades.length > SHOWN ? `The latest ${SHOWN} of ${v.trades.length}; the rest below.` : undefined}>
            {v.trades.slice(0, SHOWN).map((t) => (
              <TradeRow key={`${t.accession}-${t.date}-${t.shares}-${t.price}`} t={t} />
            ))}
          </ListSection>
          {v.trades.length > SHOWN ? (
            <details>
              <summary className="cursor-pointer px-4 text-subhead text-accent-text">Show all {v.trades.length}</summary>
              <div className="grid-cards pair-grid-sm trio-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {v.trades.slice(SHOWN).map((t) => (
                  <TradeRow key={`${t.accession}-${t.date}-${t.shares}-${t.price}`} t={t} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-footnote text-text-secondary">No open-market purchase or sale on a Form 4 over the {label}.</p>
      )}
    </>
  );
}

function TradeRow({ t }: { t: InsiderView["trades"][number] }) {
  return (
    <ListRow
      wrap
      label={
        <span className="flex flex-wrap items-center gap-2">
          {t.name} <StatusPill tone={t.code === "P" ? "ok" : "neutral"}>{t.code === "P" ? "Bought" : "Sold"}</StatusPill>
        </span>
      }
      detail={`${t.role}. ${tradeWords(t)}. Traded ${longDate(t.date)}, filed ${longDate(t.filed)}.`}
      value={t.value !== null ? usd(t.code === "P" ? t.value : -t.value) : null}
    />
  );
}
