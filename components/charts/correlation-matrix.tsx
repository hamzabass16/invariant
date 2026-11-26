"use client";

import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import { describeR, type CorrelationMatrix } from "@/lib/correlation";
import { cn } from "@/lib/utils";

/**
 * How the holdings moved together, as a diverging heat map: teal where two
 * series moved together, gilt where they moved apart, the surface at zero;
 * the coefficient in every cell, so colour is never the only carrier. The
 * benchmarks close the rows and columns behind a rule. Wide books scroll
 * inside the card, never the page. The table view lists every pair.
 */
export function CorrelationMatrixChart({
  matrix,
  windows,
  subtitle,
  badge,
}: {
  matrix: CorrelationMatrix;
  windows: { key: string; href: string; current: boolean }[];
  subtitle: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [hover, setHover] = React.useState<[number, number] | null>(null);
  const n = matrix.rows.length;
  const firstBench = matrix.rows.findIndex((r) => r.kind === "benchmark");
  const pairs: { a: string; b: string; r: number }[] = [];
  matrix.rows.forEach((a, i) =>
    matrix.rows.forEach((b, j) => {
      if (j > i && matrix.r[i][j] !== null) pairs.push({ a: a.symbol, b: b.symbol, r: matrix.r[i][j] as number });
    }),
  );
  pairs.sort((x, y) => y.r - x.r);
  const fill = (r: number) => `color-mix(in oklab, ${r >= 0 ? "var(--viz)" : "var(--viz-2)"} ${Math.round(Math.min(1, Math.abs(r)) * 72)}%, var(--surface-2))`;
  const ruled = (k: number) => firstBench > 0 && k === firstBench;
  const lit = (i: number, j: number) => hover !== null && (hover[0] === i || hover[1] === j);

  return (
    <ChartFrame
      title="How the holdings move together"
      subtitle={subtitle}
      badge={badge}
      table={<ChartTable caption="Correlation of daily returns for every pair" head={["Pair", "Correlation", "Reads as"]} rows={pairs.map((p) => [`${p.a} and ${p.b}`, p.r.toFixed(2), describeR(p.r)])} />}
    >
      <div className="mb-3 flex justify-center"><div className="inline-flex gap-1 rounded-[10px] bg-surface-2 p-1" role="group" aria-label="Window for the correlation">
        {windows.map((w) => (
          <Link
            key={w.key}
            href={w.href as Route}
            scroll={false}
            aria-current={w.current ? "page" : undefined}
            className={cn("inline-flex h-8 items-center rounded-[8px] px-3 text-subhead", w.current ? "bg-surface text-text" : "text-text-secondary")}
          >
            {w.key}
          </Link>
        ))}
      </div></div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="mx-auto border-separate border-spacing-[3px]" onPointerLeave={() => setHover(null)}>
          <caption className="sr-only">Correlation of daily returns, from {matrix.from} to {matrix.to}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface" />
              {matrix.rows.map((c, j) => (
                <th
                  key={c.symbol}
                  scope="col"
                  className={cn("data h-8 min-w-[3.25rem] px-1 text-center text-caption font-medium", c.kind === "benchmark" ? "text-text-tertiary" : "text-text-secondary", lit(-1, j) && "text-text", ruled(j) && "border-l border-hairline-strong")}
                >
                  {c.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, i) => (
              <tr key={row.symbol}>
                <th
                  scope="row"
                  className={cn("data sticky left-0 z-10 bg-surface pr-2 text-right text-caption font-medium", row.kind === "benchmark" ? "text-text-tertiary" : "text-text-secondary", lit(i, -1) && "text-text", ruled(i) && "border-t border-hairline-strong")}
                >
                  {row.symbol}
                </th>
                {matrix.rows.map((col, j) => {
                  const r = matrix.r[i][j];
                  const diag = i === j;
                  const label = diag ? `${row.symbol} with itself` : r === null ? `${row.symbol} and ${col.symbol}: too few common sessions` : `${row.symbol} and ${col.symbol}: ${r.toFixed(2)}, ${describeR(r)}`;
                  return (
                    <td
                      key={col.symbol}
                      title={label}
                      aria-label={label}
                      onPointerEnter={() => setHover([i, j])}
                      className={cn(
                        "data h-9 min-w-[3.25rem] rounded-[6px] text-center text-caption motion-safe:transition-[outline-color]",
                        diag ? "text-text-tertiary" : "text-text",
                        hover && hover[0] === i && hover[1] === j ? "outline outline-1 outline-text" : "outline outline-1 outline-transparent",
                        ruled(j) && "border-l border-hairline-strong",
                        ruled(i) && "border-t border-hairline-strong",
                      )}
                      style={{ background: diag ? "var(--surface-3)" : r === null ? "transparent" : fill(r) }}
                    >
                      {diag ? "1" : r === null ? "–" : r.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mx-auto mt-3 flex max-w-md items-center gap-3 text-caption text-text-secondary" aria-hidden>
        <span className="data">−1</span>
        <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--viz-2) 72%, var(--surface-2)), var(--surface-2), color-mix(in oklab, var(--viz) 72%, var(--surface-2)))" }} />
        <span className="data">+1</span>
      </div>
      <p className="mx-auto mt-1 flex max-w-md justify-between text-caption text-text-tertiary" aria-hidden>
        <span>moved apart</span>
        <span>moved together</span>
      </p>
      <span className="sr-only">{n} series</span>
    </ChartFrame>
  );
}
