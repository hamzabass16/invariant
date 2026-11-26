"use client";

import { useState } from "react";

import { ChartFrame, ChartTable, useWidth } from "@/components/charts/frame";
import { flowDollars, flowsNote, fundsMoved, sankeyLayout, sankeySides, windowWords, type EtfFlows, type SankeyNode } from "@/lib/etf-flows";

// The app's own tokens (globals.css): money out in the cost hue, money in in the profit hue, new money in grey.
const FILL: Record<SankeyNode["kind"], string> = { out: "var(--flow-cost)", in: "var(--flow-profit)", new: "var(--flow-revenue)", left: "var(--flow-revenue)" };
const INK: Record<SankeyNode["kind"], string> = { out: "var(--flow-cost-ink)", in: "var(--flow-profit-ink)", new: "var(--text-secondary)", left: "var(--text-secondary)" };

/** A total over the chart, in large figures. */
function Total({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="data text-title3 font-semibold" style={{ color: ink }}>
        {value}
      </p>
    </div>
  );
}

/**
 * Where the money in the largest US ETFs went over the window (lib/etf-flows.ts):
 * the buckets that lost money and the new money on the left, the buckets
 * that gained it on the right, each ribbon a source's share spread in
 * proportion. Hovering a ribbon or a bucket names it; the table view lists
 * every bucket with its funds. Narrow, the labels lose their tickers.
 */
export function EtfFlowsCard({ flows, badge }: { flows: EtfFlows; badge?: React.ReactNode }) {
  const { ref, width } = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<string | null>(null);
  const title = "Where the money in ETFs went";
  if (!flows.months.length || !flows.buckets.length) {
    return (
      <section className="card px-4 py-3">
        <h3 className="section-header flex flex-wrap items-center gap-x-2">
          {title}
          {badge}
        </h3>
        <p className="mt-1 text-footnote text-text-secondary">
          {flows.counted || flows.followed - flows.unread.length
            ? "The funds read so far do not yet share three months of filings. The rest are read at the next morning runs."
            : "The funds' N-PORT reports are read at the next morning run, a share at a time."}
        </p>
      </section>
    );
  }
  const sides = sankeySides(flows);
  const g = sankeyLayout(sides, Math.max(300, width));
  const span = windowWords(flows.months);
  const lit = (id: string) => hover === null || hover === id;
  const label = (n: (typeof g.left)[number], side: "left" | "right") => {
    const x = side === "left" ? n.x - 8 : n.x + g.bar + 8;
    const anchor = side === "left" ? "end" : "start";
    const value = `${n.kind === "out" ? "−" : n.kind === "in" || n.kind === "new" ? "+" : "−"}${flowDollars(n.value)}`;
    const sub = !g.compact && n.tickers.length ? `${value} · ${n.tickers.join(", ")}` : value;
    return (
      <g key={`l-${n.id}`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
        <text x={x} y={n.labelY - 3} textAnchor={anchor} fontSize={g.compact ? 11 : 13} fill="var(--text)">
          {g.compact ? (n.short ?? n.label) : n.label}
        </text>
        <text x={x} y={n.labelY + (g.compact ? 10 : 12)} textAnchor={anchor} fontSize={g.compact ? 10.5 : 12} fill={INK[n.kind]} className="data">
          {sub}
        </text>
      </g>
    );
  };
  const rows = [...flows.buckets].sort((a, b) => b.net - a.net);
  return (
    <ChartFrame
      title={title}
      badge={badge}
      subtitle={`${span}, by bucket. Money is not labelled, so what left each bucket is spread over where money landed, in proportion.`}
      table={
        <ChartTable
          caption={`${title}, ${span}`}
          head={["Bucket", "Net flow", "Funds"]}
          rows={rows.map((b) => [b.label, flowDollars(b.net, true), b.funds.map((x) => `${x.symbol} ${flowDollars(x.net, true)}`).join(", ")])}
        />
      }
      controls={
        <div className="grid grid-cols-3 gap-3">
          <Total label="Pulled out of funds" value={flowDollars(-flows.pulled, true)} ink="var(--flow-cost-ink)" />
          <Total label={flows.newMoney >= 0 ? "New money" : "Left the funds"} value={flowDollars(flows.newMoney, true)} ink="var(--text)" />
          <Total label="Landed in funds" value={flowDollars(flows.landed)} ink="var(--flow-profit-ink)" />
        </div>
      }
      after={<p className="mt-2 text-caption text-text-tertiary">{flowsNote(flows)}</p>}
    >
      <div ref={ref} className="w-full">
        <svg viewBox={`0 0 ${g.width} ${g.height}`} width="100%" height={g.height} role="img" aria-label={`${title}, ${span}`} className="block">
          {g.links.map((l) => (
            <path key={`${l.from}-${l.to}`} d={l.path} fill={FILL[l.kind]} opacity={lit(l.from) || lit(l.to) ? (hover ? 0.6 : l.kind === "out" ? 0.45 : 0.3) : 0.08} onMouseEnter={() => setHover(l.from)} onMouseLeave={() => setHover(null)}>
              <title>{`${sides.left.find((n) => n.id === l.from)?.label} to ${sides.right.find((n) => n.id === l.to)?.label}: about ${flowDollars(l.value)}`}</title>
            </path>
          ))}
          {[...g.left, ...g.right].map((n) => (
            <rect key={`b-${n.id}`} x={n.x} y={n.y} width={g.bar} height={n.h} rx={2} fill={FILL[n.kind]} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
              <title>{`${n.label}: ${flowDollars(n.value)}`}</title>
            </rect>
          ))}
          {g.left.map((n) => label(n, "left"))}
          {g.right.map((n) => label(n, "right"))}
        </svg>
      </div>
    </ChartFrame>
  );
}

/** One side of the fund-by-fund card: each ETF with its bucket and a bar on the side's own largest. */
function MovedList({ title, list, top, ink, fill }: { title: string; list: { symbol: string; bucket: string; net: number }[]; top: number; ink: string; fill: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-footnote font-medium text-text-secondary">{title}</p>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((f) => (
            <li key={f.symbol} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3" title={`${f.symbol}, ${f.bucket}: ${flowDollars(f.net, true)}`}>
              <span className="data text-subhead font-semibold">{f.symbol}</span>
              <span className="min-w-0">
                <span className="block truncate text-caption text-text-secondary">{f.bucket}</span>
                <span className="mt-1 block h-1.5 rounded-full bg-surface-2">
                  <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(3, (Math.abs(f.net) / top) * 100)}%`, background: fill }} />
                </span>
              </span>
              <span className="data text-footnote" style={{ color: ink }}>
                {flowDollars(f.net, true)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-footnote text-text-secondary">None over these months.</p>
      )}
    </div>
  );
}

/** The same window fund by fund (lib/etf-flows.ts fundsMoved): the ETFs that took in the most and those that lost the most. */
export function FundsMovedCard({ flows, badge }: { flows: EtfFlows; badge?: React.ReactNode }) {
  const title = "The ETFs money moved most";
  if (!flows.months.length || !flows.buckets.length) return null;
  const { inflows, outflows } = fundsMoved(flows);
  const top = Math.max(1, ...inflows.map((f) => f.net), ...outflows.map((f) => -f.net));
  const span = windowWords(flows.months);
  return (
    <ChartFrame
      title={title}
      badge={badge}
      subtitle={`${span}: shares sold and reinvested less those redeemed, fund by fund.`}
      table={<ChartTable caption={`${title}, ${span}`} head={["Fund", "Bucket", "Net flow"]} rows={[...inflows, ...outflows].map((f) => [f.symbol, f.bucket, flowDollars(f.net, true)])} />}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <MovedList title="Took in the most" list={inflows} top={top} ink="var(--flow-profit-ink)" fill="var(--flow-profit)" />
        <MovedList title="Lost the most" list={outflows} top={top} ink="var(--flow-cost-ink)" fill="var(--flow-cost)" />
      </div>
    </ChartFrame>
  );
}
