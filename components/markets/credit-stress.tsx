import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { StatusPill } from "@/components/ui/status";
import { companyHref } from "@/lib/company";
import { creditPoints, ZONE_LABEL, Z_DISTRESS, Z_SAFE, type CreditPoint, type CreditRow, type CreditStress, type CreditZone } from "@/lib/credit-stress";
import { cn } from "@/lib/utils";
import { placeLabels } from "@/lib/value-map";

const TONE: Record<CreditZone, "danger" | "warn" | "ok"> = { distress: "danger", grey: "warn", safe: "ok" };
const ABOUT = `Altman's Z-score from the latest filings: working capital, retained earnings, operating income and revenue over total assets, and the market value over total liabilities, weighted as Altman set them in 1968. Below ${Z_DISTRESS} he called distress, ${Z_DISTRESS} to ${Z_SAFE} grey, above ${Z_SAFE} safe. Across, net debt over EBITDA: left of zero the company holds more cash than debt. A reading of the balance sheet, not the market's price of default and not a forecast.`;
const COLOR: Record<CreditPoint["set"], string> = { held: "var(--series-hcmp)", watched: "var(--series-qqq)", lowest: "var(--series-spy)" };
const SET_WORDS: Record<CreditPoint["set"], string> = { held: "held", watched: "on your watchlist", lowest: "among the lowest in the S&P 500 and Nasdaq-100" };

const SHAPES = [
  { key: "wide", w: 1000, h: 640, className: "hidden sm:block" },
  { key: "tall", w: 340, h: 520, className: "block sm:hidden" },
] as const;
const PAD = { left: 40, right: 14, top: 14, bottom: 40 };

/**
 * One shape of the chart: the score up, net debt to EBITDA across, Altman's
 * two lines as dashes with the zones named at the right, a dot for each
 * company in its set's hue, its ticker beside it where there is room, and a
 * dot past an edge drawn on it with an arrow.
 */
function Plot({ points, axes, w, h, className }: ReturnType<typeof creditPoints> & { w: number; h: number; className: string }) {
  const { xMin, xMax, yMin, yMax } = axes;
  const plot = { left: PAD.left, right: w - PAD.right, top: PAD.top, bottom: h - PAD.bottom };
  const sx = (v: number) => plot.left + ((v - xMin) / (xMax - xMin)) * (plot.right - plot.left);
  const sy = (v: number) => plot.bottom - ((v - yMin) / (yMax - yMin)) * (plot.bottom - plot.top);
  const small = w < 600;
  const xTicks = Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i);
  const yStep = yMax - yMin > 8 ? 2 : 1;
  const yTicks = Array.from({ length: Math.floor((yMax - yMin) / yStep) + 1 }, (_, i) => yMin + i * yStep);
  const charW = small ? 6.8 : 7.4;
  const dots = points.map((p) => ({ p, x: sx(p.x), y: sy(p.y), text: p.row.symbol }));
  const zoneFont = small ? 11 : 13;
  const zones: [string, number][] = [
    ["Safe", sy(Z_SAFE) - 8],
    ["Grey", (sy(Z_SAFE) + sy(Z_DISTRESS)) / 2 + 4],
    ["Distress", sy(Z_DISTRESS) + 18],
  ];
  // The zones' names are drawn first, so no ticker is placed over one.
  const zoneBoxes = zones.map(([text, y]) => ({ l: plot.right - 8 - text.length * zoneFont * 0.62, r: plot.right - 4, t: y - zoneFont, b: y + 4 }));
  const labels = placeLabels(dots, plot, charW, 14, zoneBoxes, (i) => dots[i].p.set === "lowest");
  const zone = (text: string, y: number) => (
    <text x={plot.right - 8} y={y} textAnchor="end" fontSize={zoneFont} fontWeight={600} fill="var(--text-tertiary)">
      {text}
    </text>
  );
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)} role="img" aria-label={`Altman Z-score against net debt to EBITDA for ${points.length} companies, with the distress and safe lines`}>
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
          <line x1={sx(t)} x2={sx(t)} y1={plot.top} y2={plot.bottom} stroke={t === 0 ? "var(--hairline-strong)" : "var(--hairline)"} strokeWidth={1} />
          {small && t % 2 !== 0 ? null : (
            <text x={sx(t)} y={plot.bottom + 16} textAnchor={t === xMin ? "start" : t === xMax ? "end" : "middle"} className="data" fontSize={small ? 11 : 12} fill="var(--text-tertiary)">
              {t}x
            </text>
          )}
        </g>
      ))}
      {[Z_DISTRESS, Z_SAFE].map((z) => (
        <line key={z} x1={plot.left} x2={plot.right} y1={sy(z)} y2={sy(z)} stroke="var(--text-tertiary)" strokeWidth={2} strokeDasharray="6 5" />
      ))}
      {zones.map(([text, y]) => (
        <g key={text}>{zone(text, y)}</g>
      ))}
      <text x={(plot.left + plot.right) / 2} y={h - 6} textAnchor="middle" fontSize={small ? 11 : 12} fill="var(--text-secondary)">
        Net debt to EBITDA (left of 0: more cash than debt)
      </text>
      <text x={12} y={(plot.top + plot.bottom) / 2} textAnchor="middle" fontSize={small ? 11 : 12} fill="var(--text-secondary)" transform={`rotate(-90 12 ${(plot.top + plot.bottom) / 2})`}>
        Altman Z-score
      </text>
      {dots.map(({ p, x, y }, i) => {
        const r = p.row;
        const color = COLOR[p.set];
        const l = labels[i];
        const filled = p.set !== "watched";
        const arrow = p.clipY === 1 ? `M ${x - 5} ${y + 12} L ${x} ${y + 7} L ${x + 5} ${y + 12}` : p.clipY === -1 ? `M ${x - 5} ${y - 12} L ${x} ${y - 7} L ${x + 5} ${y - 12}` : p.clipX === 1 ? `M ${x - 12} ${y - 5} L ${x - 7} ${y} L ${x - 12} ${y + 5}` : p.clipX === -1 ? `M ${x + 12} ${y - 5} L ${x + 7} ${y} L ${x + 12} ${y + 5}` : null;
        return (
          <a key={`${p.set}-${r.symbol}`} href={companyHref(r.symbol)} aria-label={`${r.symbol}: its company page`}>
            <circle cx={x} cy={y} r={14} fill="transparent">
              <title>{`${r.symbol}${r.name ? ` · ${r.name}` : ""} · Z ${r.z!.toFixed(2)} (${ZONE_LABEL[r.zone!].toLowerCase()}) · net debt ${r.netDebtToEbitda!.toFixed(1)}x EBITDA${r.interestCover !== null ? ` · interest cover ${r.interestCover.toFixed(1)}x` : ""} · ${SET_WORDS[p.set]}`}</title>
            </circle>
            <circle cx={x} cy={y} r={p.set === "lowest" ? 4.5 : p.set === "held" ? 6 : 5} fill={filled ? color : "var(--surface)"} stroke={arrow ? "var(--text)" : filled ? "var(--surface)" : color} strokeWidth={2} pointerEvents="none" />
            {arrow ? <path d={arrow} stroke="var(--text)" strokeWidth={1.5} fill="none" pointerEvents="none" /> : null}
            {l.hidden ? null : (
            <text x={l.x} y={l.y + l.dy} textAnchor={l.anchor} className="data" fontSize={small ? 11 : 12.5} fontWeight={p.set === "lowest" ? 500 : 600} fill={p.set === "lowest" ? "var(--text-secondary)" : "var(--text)"} stroke="var(--surface)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">
              {r.symbol}
            </text>
            )}
          </a>
        );
      })}
    </svg>
  );
}

function TableRow({ r, set }: { r: CreditRow; set: CreditPoint["set"] }) {
  return (
    <tr className="border-t border-hairline">
      <td className="py-1.5">
        <Link href={companyHref(r.symbol) as Route} className="data font-semibold hover:text-accent-text">
          {r.symbol}
        </Link>
        <span className="text-text-tertiary">{r.name ? ` · ${r.name}` : ""}{set === "held" ? " · held" : set === "watched" ? " · watchlist" : ""}</span>
      </td>
      <td className="data py-1.5 text-right">{r.z!.toFixed(2)}</td>
      <td className="py-1.5 text-right">
        <StatusPill tone={TONE[r.zone!]}>{ZONE_LABEL[r.zone!]}</StatusPill>
      </td>
      <td className="data py-1.5 text-right">{r.interestCover !== null ? `${r.interestCover.toFixed(1)}x` : "–"}</td>
      <td className="data py-1.5 text-right">{r.netDebtToEbitda === null ? "–" : r.netDebtToEbitda <= 0 ? "Net cash" : `${r.netDebtToEbitda.toFixed(1)}x`}</td>
    </tr>
  );
}

/**
 * Credit stress (lib/credit-stress.ts; Hamza, 5 and 6 Nov 2026): the Altman
 * Z-score of the companies held and watched and of the S&P 500 and
 * Nasdaq-100 companies with the lowest scores, drawn like the value map
 * against net debt to EBITDA, each dot opening its company page, the same
 * figures in a table folded under it. A company with no score is left out.
 */
export function CreditStressCard({ stress, badge }: { stress: CreditStress; badge?: ReactNode }) {
  const chart = creditPoints(stress);
  const mine = new Set(stress.yours.map((r) => r.symbol));
  const lowest = stress.lowest.filter((r) => !mine.has(r.symbol));
  const sets = (["held", "watched", "lowest"] as const).filter((s) => chart.points.some((p) => p.set === s));
  const counts = `${stress.scored} of the S&P 500 and Nasdaq-100 scored, ${stress.distress} in distress${stress.notJudged ? `; ${stress.notJudged} banks, insurers and real estate trusts not judged` : ""}${stress.unread ? `; ${stress.unread} not read yet` : ""}.`;
  const distressYours = stress.yours.filter((r) => r.zone === "distress");
  const lead = stress.yours.length
    ? distressYours.length
      ? `${distressYours.map((r) => r.symbol).join(", ")} ${distressYours.length === 1 ? "scores" : "score"} below ${Z_DISTRESS}, in Altman's distress zone; ${stress.yours.length - distressYours.length} of yours above it.`
      : `None of the ${stress.yours.length} companies you hold or watch with a score is in Altman's distress zone; the lowest is ${stress.yours[0].symbol} at ${stress.yours[0].z!.toFixed(2)}.`
    : "None of the companies you hold or watch has a score yet.";
  return (
    <section id="credit-stress" className="card mb-8 scroll-mt-20 px-4 py-4 sm:px-5" aria-labelledby="credit-stress-title">
      <div className="min-w-0">
        <h3 id="credit-stress-title" className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
          Credit stress
          <InfoTip id="credit-stress-about" label="How the Z-score is calculated" text={ABOUT} side="below" align="start" />
          {badge}
        </h3>
        <p className="mt-1 max-w-[70ch] text-subhead text-text-secondary">{lead}</p>
      </div>
      {chart.points.length ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
            {sets.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", s === "watched" && "border-2")} style={s === "watched" ? { borderColor: COLOR[s] } : { background: COLOR[s] }} aria-hidden />
                {s === "held" ? "Held" : s === "watched" ? "Watchlist" : "Lowest in the S&P 500 and Nasdaq-100"}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-text-tertiary" aria-hidden /> {Z_DISTRESS} and {Z_SAFE}
            </span>
          </div>
          <div className="mt-2">
            {SHAPES.map((s) => (
              <Plot key={s.key} {...chart} w={s.w} h={s.h} className={s.className} />
            ))}
          </div>
          <details className="group mt-3 border-t border-hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-subhead text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
              <span>Table</span>
              <span className="text-caption text-text-tertiary group-open:hidden">Open</span>
              <span className="hidden text-caption text-text-tertiary group-open:inline">Close</span>
            </summary>
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[560px] text-footnote">
                <thead>
                  <tr className="text-left text-caption text-text-tertiary">
                    <th className="py-1.5 font-normal">Company</th>
                    <th className="py-1.5 text-right font-normal">Z-score</th>
                    <th className="py-1.5 text-right font-normal">Zone</th>
                    <th className="py-1.5 text-right font-normal">Interest cover</th>
                    <th className="py-1.5 text-right font-normal">Net debt / EBITDA</th>
                  </tr>
                </thead>
                <tbody>
                  {stress.yours.map((r) => (
                    <TableRow key={`y-${r.symbol}`} r={r} set={r.own === "held" ? "held" : "watched"} />
                  ))}
                  {lowest.map((r) => (
                    <TableRow key={`l-${r.symbol}`} r={r} set="lowest" />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}
      {chart.unplaced.length ? <p className="mt-3 text-footnote text-text-tertiary">Not placed, with no EBITDA read: {chart.unplaced.map((r) => `${r.symbol} (Z ${r.z!.toFixed(2)})`).join(", ")}.</p> : null}
      <p className="mt-2 text-caption text-text-tertiary">
        {stress.ready ? "" : `The lowest in the S&P 500 and Nasdaq-100 are drawn once most of them are scored; the screener reads their filings a share at a time each morning. `}
        {counts} No free source lets the market&apos;s own CDS or bond spreads be shown here; the score is read from the filings alone. Not a forecast.
      </p>
    </section>
  );
}
