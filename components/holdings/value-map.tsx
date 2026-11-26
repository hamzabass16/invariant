import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { companyHref } from "@/lib/company";
import { BASIS_WORDS, growthOn, mapAxes, mapWords, peg, placeLabels, VALUE_MAP_BASES, type ValueMap, type ValueMapBasis } from "@/lib/value-map";
import { cn } from "@/lib/utils";

const SHAPES = [
  { key: "wide", w: 1000, h: 560, className: "hidden sm:block" },
  { key: "tall", w: 340, h: 440, className: "block sm:hidden" },
] as const;
const PAD = { left: 44, right: 14, top: 14, bottom: 40 };
const HELD = "var(--series-hcmp)";
const WATCHED = "var(--series-qqq)";

/**
 * One shape of the map: the grid, the PEG 1 line from the origin, a dot for
 * each company (held and watched in their own hues), its ticker beside it
 * where there is room, and a dot past the top drawn on the edge with an
 * arrow, so no company falls off the chart.
 */
function Plot({ map, basis, w, h, className }: { map: ValueMap; basis: ValueMapBasis; w: number; h: number; className: string }) {
  const pts = map.points.filter((p) => growthOn(p, basis));
  const { xMin, xMax, yMax } = mapAxes(pts, basis);
  const plot = { left: PAD.left, right: w - PAD.right, top: PAD.top, bottom: h - PAD.bottom };
  const sx = (v: number) => plot.left + ((v - xMin) / (xMax - xMin)) * (plot.right - plot.left);
  const sy = (v: number) => plot.bottom - (Math.min(v, yMax) / yMax) * (plot.bottom - plot.top);
  const xTicks = Array.from({ length: Math.round((xMax - xMin) / 10) + 1 }, (_, i) => xMin + i * 10);
  const yTicks = Array.from({ length: Math.round(yMax / 10) + 1 }, (_, i) => i * 10);
  const dots = pts.map((p) => ({ p, x: sx(growthOn(p, basis)!.pct), y: sy(p.fwdPe), text: p.symbol }));
  const labels = placeLabels(dots, plot, w < 600 ? 6.8 : 7.4);
  // "PEG > 1" sits at the top left unless a company or its label is there; then where the region above the line is clear.
  const charW = w < 600 ? 6.8 : 7.4;
  const clear = (x: number, y: number, wide: number) =>
    !dots.some((d, i) => {
      const l = labels[i];
      const lw = d.text.length * charW;
      const ll = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - lw : l.x - lw / 2;
      return (d.x > x - 8 && d.x < x + wide + 8 && d.y > y - 22 && d.y < y + 8) || (ll < x + wide && ll + lw > x && l.y + l.dy > y - 18 && l.y + l.dy - 14 < y + 4);
    });
  const aboveW = 62;
  const aboveAt = [
    { x: plot.left + 10, y: plot.top + 18 },
    { x: sx(Math.max(0, xMin)) + 10, y: plot.top + 18 },
    { x: plot.left + 10, y: (plot.top + plot.bottom) / 2 },
    { x: sx(Math.max(0, xMin)) + 10, y: plot.top + 48 },
  ].find((c) => clear(c.x, c.y, aboveW)) ?? { x: sx(Math.max(0, xMin)) + 10, y: plot.top + 18 };
  // The PEG 1 line, y = x, clipped to the plot.
  const lineEnd = Math.min(xMax, yMax);
  const small = w < 600;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)} role="img" aria-label={`Forward P/E against ${BASIS_WORDS[basis].toLowerCase()} EPS growth for ${pts.length} companies, with the line where they are equal`}>
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={plot.left} x2={plot.right} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" strokeWidth={1} />
          <text x={plot.left - 8} y={sy(t) + 4} textAnchor="end" className="data" fontSize={small ? 11 : 12} fill="var(--text-tertiary)">
            {t}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={sx(t)} x2={sx(t)} y1={plot.top} y2={plot.bottom} stroke="var(--hairline)" strokeWidth={1} />
          {small && t % 20 !== 0 ? null : (
            <text x={sx(t)} y={plot.bottom + 16} textAnchor={t === xMin ? "start" : t === xMax ? "end" : "middle"} className="data" fontSize={small ? 11 : 12} fill="var(--text-tertiary)">
              {t}%
            </text>
          )}
        </g>
      ))}
      {xMin < 0 ? <line x1={sx(0)} x2={sx(0)} y1={plot.top} y2={plot.bottom} stroke="var(--hairline-strong)" strokeWidth={1} /> : null}
      <line x1={sx(0)} y1={sy(0)} x2={sx(lineEnd)} y2={sy(lineEnd)} stroke="var(--text-tertiary)" strokeWidth={2} strokeDasharray="6 5" />
      <text x={sx(lineEnd) - 6} y={sy(lineEnd) + (lineEnd === yMax ? 16 : -8)} textAnchor="end" fontSize={small ? 11 : 13} fontWeight={600} fill="var(--text-secondary)">
        PEG = 1
      </text>
      <text x={aboveAt.x} y={aboveAt.y} fontSize={small ? 12 : 14} fontWeight={600} fill="var(--text-tertiary)">
        PEG &gt; 1
      </text>
      <text x={plot.right - 10} y={plot.bottom - 10} textAnchor="end" fontSize={small ? 12 : 14} fontWeight={600} fill="var(--text-tertiary)">
        PEG &lt; 1
      </text>
      <text x={(plot.left + plot.right) / 2} y={h - 6} textAnchor="middle" fontSize={small ? 11 : 12} fill="var(--text-secondary)">
        {BASIS_WORDS[basis]} EPS growth a year
      </text>
      <text x={12} y={(plot.top + plot.bottom) / 2} textAnchor="middle" fontSize={small ? 11 : 12} fill="var(--text-secondary)" transform={`rotate(-90 12 ${(plot.top + plot.bottom) / 2})`}>
        Forward P/E
      </text>
      {dots.map(({ p, x, y }, i) => {
        const g = growthOn(p, basis)!;
        const over = p.fwdPe > yMax;
        const color = p.held ? HELD : WATCHED;
        const l = labels[i];
        const pg = peg(p, basis);
        return (
          <a key={p.symbol} href={companyHref(p.symbol)} aria-label={`${p.symbol}: its company page`}>
            <circle cx={x} cy={y} r={14} fill="transparent">
              <title>{`${p.symbol} · forward P/E ${p.fwdPe.toFixed(1)} (${p.peBasis === "analysts" ? "analysts'" : "filings'"}) · ${BASIS_WORDS[basis].toLowerCase()} EPS growth ${g.pct.toFixed(1)}% a year over ${g.years} years · PEG ${pg === null ? "none" : pg.toFixed(2)}${p.held ? "" : " · watchlist"}`}</title>
            </circle>
            <circle cx={x} cy={y} r={p.held ? 6 : 5} fill={p.held ? color : "var(--surface)"} stroke={over ? "var(--text)" : p.held ? "var(--surface)" : color} strokeWidth={2} pointerEvents="none" />
            {over ? <path d={`M ${x - 5} ${y + 12} L ${x} ${y + 7} L ${x + 5} ${y + 12}`} stroke="var(--text)" strokeWidth={1.5} fill="none" pointerEvents="none" /> : null}
            <text x={l.x} y={l.y + l.dy} textAnchor={l.anchor} className="data" fontSize={small ? 11 : 12.5} fontWeight={600} fill="var(--text)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">
              {p.symbol}
            </text>
          </a>
        );
      })}
    </svg>
  );
}

/**
 * The value map (Hamza, 24 Oct 2026): forward P/E against EPS growth a
 * year for the holdings and the watchlist, the PEG 1 line between them, on
 * the analysts' projected growth or the growth the filings show was
 * delivered, with a table of the same figures folded under it.
 */
export function ValueMapCard({ map, basis, hrefFor, badge }: { map: ValueMap; basis: ValueMapBasis; hrefFor: (b: ValueMapBasis) => string; badge?: React.ReactNode }) {
  const placed = map.points.filter((p) => growthOn(p, basis));
  const unplaced = map.points.filter((p) => !growthOn(p, basis));
  const watched = placed.some((p) => !p.held);
  const about =
    "PEG is forward P/E over EPS growth a year. On the line a company asks one point of P/E for each point of growth. The analysts' growth runs from the fiscal year in progress to the furthest year Nasdaq lists; delivered growth is the filings' trailing EPS over the last five years, or at least three. The forward P/E is the analysts' where Nasdaq has one, else the filings' carried a year at revenue growth. One lens on valuation; estimates change.";
  return (
    <section id="value-map" className="card mb-8 scroll-mt-20 px-4 py-4 sm:px-5" aria-label="Value map">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
            Value map
            <InfoTip id="value-map" label="the value map" text={about} side="below" align="start" />
            {badge}
          </h3>
          <p className="mt-1 max-w-[70ch] text-subhead text-text-secondary">{mapWords(map.points, basis)}</p>
        </div>
        <nav className="inline-flex rounded-full border border-hairline p-0.5" aria-label="Which growth">
          {VALUE_MAP_BASES.map((b) => (
            <Link key={b} href={hrefFor(b) as Route} scroll={false} aria-current={b === basis ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-footnote font-medium transition-colors", b === basis ? "bg-text text-bg" : "text-text-secondary hover:text-text")}>
              {BASIS_WORDS[b]}
            </Link>
          ))}
        </nav>
      </div>
      {placed.length ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: HELD }} aria-hidden /> Held
            </span>
            {watched ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-2" style={{ borderColor: WATCHED }} aria-hidden /> Watchlist
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-text-tertiary" aria-hidden /> PEG = 1
            </span>
          </div>
          <div className="mt-2">
            {SHAPES.map((s) => (
              <Plot key={s.key} map={map} basis={basis} w={s.w} h={s.h} className={s.className} />
            ))}
          </div>
          <details className="group mt-3 border-t border-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-subhead text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
              <span>Table</span>
              <span className="text-caption text-text-tertiary group-open:hidden">Open</span>
              <span className="hidden text-caption text-text-tertiary group-open:inline">Close</span>
            </summary>
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[520px] text-footnote">
                <thead>
                  <tr className="text-left text-caption text-text-tertiary">
                    <th className="py-1.5 font-normal">Company</th>
                    <th className="py-1.5 text-right font-normal">Fwd P/E</th>
                    <th className="py-1.5 text-right font-normal">Projected growth</th>
                    <th className="py-1.5 text-right font-normal">Delivered growth</th>
                    <th className="py-1.5 text-right font-normal">PEG</th>
                  </tr>
                </thead>
                <tbody>
                  {[...map.points].sort((a, b) => (peg(a, basis) ?? Infinity) - (peg(b, basis) ?? Infinity)).map((p) => {
                    const pg = peg(p, basis);
                    return (
                      <tr key={p.symbol} className="border-t border-hairline">
                        <td className="py-1.5">
                          <Link href={companyHref(p.symbol) as Route} className="data font-semibold hover:text-accent-text">
                            {p.symbol}
                          </Link>
                          <span className="text-text-tertiary">{p.held ? (p.weight !== null ? ` · ${p.weight.toFixed(1)}%` : "") : " · watchlist"}</span>
                        </td>
                        <td className="data py-1.5 text-right">
                          {p.fwdPe.toFixed(1)}
                          <span className="text-caption text-text-tertiary">{p.peBasis === "analysts" ? " A" : " F"}</span>
                        </td>
                        <td className="data py-1.5 text-right">{p.projected ? `${p.projected.pct.toFixed(1)}% · ${p.projected.years}y` : "–"}</td>
                        <td className="data py-1.5 text-right">{p.delivered ? `${p.delivered.pct.toFixed(1)}% · ${p.delivered.years.toFixed(0)}y` : "–"}</td>
                        <td className="data py-1.5 text-right">{pg === null ? "–" : pg.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-caption text-text-tertiary">A: the analysts&apos; forward P/E, on Nasdaq&apos;s consensus. F: the filings&apos; own, carried a year at revenue growth.</p>
            </div>
          </details>
        </>
      ) : null}
      {unplaced.length || map.missing.length ? (
        <p className="mt-3 text-footnote text-text-tertiary">
          {unplaced.length ? `Not placed on ${BASIS_WORDS[basis].toLowerCase()} growth: ${unplaced.map((p) => p.symbol).join(", ")} (${basis === "projected" ? "Nasdaq lists fewer than two years ahead, or EPS not positive" : "under three years of positive EPS in the filings"}). ` : ""}
          {map.missing.map((m) => `${m.symbol}: ${m.why}.`).join(" ")}
        </p>
      ) : null}
      <p className="mt-2 text-caption text-text-tertiary">{basis === "projected" ? "Growth from the analysts' consensus on Nasdaq, never the app's forecast. " : ""}One lens on valuation, not a verdict. Not investment advice.</p>
    </section>
  );
}
