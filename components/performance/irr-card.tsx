import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { signedPct } from "@/lib/format";
import { money } from "@/lib/holdings";
import { timingWords, type MoneyWeighted } from "@/lib/performance";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/** One return as a bar out from zero, on a scale shared with the other, so the two compare at a glance. */
function Bar({ label, value, scale, color, strong }: { label: string; value: number | null; scale: number; color: string; strong?: boolean }) {
  const width = value === null ? 0 : Math.min(50, (Math.abs(value) / scale) * 50);
  return (
    <div className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-3">
      <span className={cn("text-footnote", strong ? "text-text" : "text-text-secondary")}>{label}</span>
      <div className="relative h-2.5 rounded-full bg-surface-2" aria-hidden>
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-hairline" />
        {value !== null ? <span className="absolute inset-y-0 rounded-full" style={{ background: color, width: `${width}%`, left: value >= 0 ? "50%" : `${50 - width}%` }} /> : null}
      </div>
      <span className={cn("data text-right text-footnote", strong ? "font-semibold text-text" : "text-text-secondary")}>{value === null ? "n/a" : signedPct(value, 1)}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-surface px-3 py-2">
      <p className="truncate text-caption text-text-tertiary">{label}</p>
      <p className="data truncate text-subhead font-semibold">{value}</p>
    </div>
  );
}

/**
 * The money-weighted return (Hamza, 19 Oct 2026: an IRR card on Performance,
 * explained briefly): the IRR since the series began, beside the
 * time-weighted return on the same basis, both as bars out from zero; a line
 * on what the gap says about the person's timing; and what IRR means, with
 * the start value, the money moved and the value now it is computed from.
 */
export function IrrCard({ mw, ccy, badge, flowsNote, noFlows, windows }: { mw: MoneyWeighted; ccy: string; badge?: React.ReactNode; flowsNote?: string | null; noFlows?: string | null; windows?: { key: string; href: string; current: boolean }[] }) {
  const irr = mw.yearly ? mw.irr : mw.overPeriod;
  const twr = mw.yearly ? mw.twrYearly : mw.twr;
  const scale = Math.max(5, Math.abs(irr), Math.abs(twr ?? 0)) * 1.15;
  const basis = mw.yearly ? "a year" : "over the period";
  const net = mw.deposits - mw.withdrawals;
  return (
    <section className="card mb-8 overflow-hidden" aria-labelledby="irr-title">
      <div className="grid gap-px bg-hairline lg:grid-cols-[1.15fr_1fr]">
        <div className="bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="irr-title" className="section-header">IRR · money-weighted</h2>
            {badge}
          </div>
          <p className={cn("data figure-in mt-2 text-large-title font-semibold tracking-[-0.02em]", irr > 0 ? "text-ok" : irr < 0 ? "text-danger" : "text-text")}>
            {signedPct(irr, 1)}
            <span className="ml-2 align-middle text-subhead font-normal text-text-secondary">{basis}</span>
          </p>
          <p className="mt-0.5 text-footnote text-text-secondary">
            {longDate(mw.from)} to {longDate(mw.to)}
          </p>
          {windows?.length ? (
            <div className="mt-3 inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1" role="group" aria-label="Period for the IRR">
              {windows.map((w) => (
                <Link key={w.key} href={w.href as Route} scroll={false} aria-current={w.current ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-[8px] px-2.5 text-footnote", w.current ? "bg-surface text-text" : "text-text-secondary")}>
                  {w.key}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="mt-4 space-y-2.5">
            <Bar label="IRR" value={irr} scale={scale} color="var(--viz)" strong />
            <Bar label="Time-weighted" value={twr} scale={scale} color="color-mix(in oklab, var(--text-tertiary) 70%, transparent)" />
          </div>
          <p className="mt-3 text-footnote text-text">{timingWords(mw)}</p>
        </div>
        <div className="bg-surface-2/60 px-5 py-4">
          <p className="section-header">What it means</p>
          <p className="mt-2 text-subhead text-text">
            The IRR is the one yearly rate that turns what the account held at the start, and every deposit and withdrawal on its own date, into what it is worth now. It is your return on your money, timing included.
          </p>
          <p className="mt-2 text-footnote text-text-secondary">
            The time-weighted return leaves timing out and measures the holdings alone, which is why it is the one compared with a benchmark.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Fact label="At the start" value={money(mw.startValue, ccy)} />
            <Fact label={net >= 0 ? "Put in, net" : "Taken out, net"} value={money(Math.abs(net), ccy)} />
            <Fact label="Worth now" value={money(mw.endValue, ccy)} />
          </div>
          <p className="mt-2 text-caption text-text-tertiary">
            {mw.flows ? `${mw.flows} ${mw.flows === 1 ? "deposit or withdrawal" : "deposits and withdrawals"}, dated as the broker reports them.` : noFlows ?? "No deposits or withdrawals in the broker's ledger in this time. With Interactive Brokers they come from the Flex query's Cash Transactions section, Deposits & Withdrawals ticked."}
            {flowsNote ? ` ${flowsNote}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
