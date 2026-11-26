import type * as React from "react";

import { ChartFrame } from "@/components/charts/frame";
import { concentration, concentrationInsights, type Weight } from "@/lib/screens";

/** One hue, three steps: the three largest strongest, the fourth and fifth lighter, the rest lightest. */
const TIER = ["var(--viz)", "color-mix(in oklab, var(--viz) 62%, var(--surface-3))", "color-mix(in oklab, var(--viz) 34%, var(--surface-3))"] as const;
const tierOf = (i: number) => (i < 3 ? 0 : i < 5 ? 1 : 2);
/** Cash and what is not listed: neutral and hatched, so it never reads as the lightest step of the hue. */
const NOT_LISTED = "repeating-linear-gradient(135deg, var(--surface-3) 0 4px, var(--surface-2) 4px 7px)";

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />;
}

/** One dot per holding held; the effective count is filled, its fraction partly. */
function EffectiveDots({ held, effective }: { held: number; effective: number }) {
  if (held > 60) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
      {Array.from({ length: held }, (_, i) => {
        const fill = Math.max(0, Math.min(1, effective - i)) * 100;
        return <span key={i} className="block h-3 w-3 rounded-full" style={{ background: `linear-gradient(90deg, var(--viz) ${fill}%, var(--surface-3) ${fill}%)` }} />;
      })}
    </div>
  );
}

/**
 * Concentration as a picture: net worth as one strip, each holding a segment
 * by weight, the three largest strongest; the effective number of holdings
 * against the number held; and what the figures say in plain sentences.
 * The table view lists every weight with its running total.
 */
export function ConcentrationCard({ weights: all, badge }: { weights: readonly Weight[]; badge?: React.ReactNode }) {
  const weights = all.filter((w) => w.weight > 0);
  const c = concentration(weights);
  if (!c) return null;
  const n = weights.length;
  const listed = weights.reduce((s, w) => s + w.weight, 0);
  const rest = Math.max(0, 100 - listed);
  const insights = concentrationInsights(weights);
  const rows = weights.map((w, i) => ({ w, cumulative: weights.slice(0, i + 1).reduce((s, x) => s + x.weight, 0) }));
  const table = (
    <table className="mt-3 w-full text-footnote">
      <caption className="sr-only">Every listed holding by weight of net worth, largest first, with the running total.</caption>
      <thead>
        <tr className="text-caption text-text-tertiary">
          <th scope="col" className="py-1.5 text-left font-medium">
            Holding
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Weight
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Running total
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ w, cumulative }, i) => (
          <tr key={w.symbol} className="border-t border-hairline">
            <th scope="row" className="py-1.5 text-left font-normal">
              <span className="data">{w.symbol}</span>
              <span className="ml-2 text-text-tertiary">{i < 3 ? "top three" : i < 5 ? "top five" : ""}</span>
            </th>
            <td className="data py-1.5 text-right">{w.weight.toFixed(1)}%</td>
            <td className="data py-1.5 text-right text-text-secondary">{cumulative.toFixed(1)}%</td>
          </tr>
        ))}
        {rest > 0.05 ? (
          <tr className="border-t border-hairline">
            <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">
              Cash and not listed
            </th>
            <td className="data py-1.5 text-right">{rest.toFixed(1)}%</td>
            <td className="data py-1.5 text-right text-text-secondary">100.0%</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
  const legend = [
    { label: "Three largest", color: TIER[0], kind: "rect" as const },
    ...(n > 3 ? [{ label: "Fourth and fifth", color: TIER[1], kind: "rect" as const }] : []),
    ...(n > 5 ? [{ label: "The rest", color: TIER[2], kind: "rect" as const }] : []),
    ...(rest > 0.05 ? [{ label: "Cash and not listed", color: NOT_LISTED, kind: "rect" as const }] : []),
  ];
  const first = weights[0];
  return (
    <ChartFrame className="mb-8" title="Concentration" badge={badge} subtitle="Net worth as one strip, each listed holding by weight, largest first" legend={legend} table={table}>
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Largest", sub: first.symbol, value: c.top1, color: TIER[0] },
              { label: "Top three", sub: weights.slice(0, 3).map((w) => w.symbol).join(", "), value: c.top3, color: TIER[0] },
              { label: "Top five", sub: n > 3 ? `with ${weights.slice(3, 5).map((w) => w.symbol).join(", ")}` : null, value: c.top5, color: TIER[1] },
            ].map((t) => (
              <div key={t.label} className="min-w-0 rounded-[10px] bg-surface-2 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-caption text-text-secondary">
                  <Swatch color={t.color} />
                  <span className="truncate">{t.label}</span>
                </p>
                <p className="data mt-1 text-title-3 font-semibold">{t.value.toFixed(1)}%</p>
                {t.sub ? <p className="data mt-0.5 truncate text-caption text-text-tertiary">{t.sub}</p> : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex h-9 w-full gap-[2px] overflow-hidden rounded-[8px]" role="img" aria-label={`Net worth by holding: ${weights.slice(0, 5).map((w) => `${w.symbol} ${w.weight.toFixed(1)}%`).join(", ")}${n > 5 ? `, and ${n - 5} more` : ""}.`}>
            {weights.map((w, i) => (
              <span key={w.symbol} title={`${w.symbol} ${w.weight.toFixed(1)}%`} className="block min-w-[2px] transition-opacity hover:opacity-80" style={{ flexGrow: w.weight, flexBasis: 0, background: TIER[tierOf(i)] }} />
            ))}
            {rest > 0.05 ? <span title={`Cash and not listed ${rest.toFixed(1)}%`} className="block min-w-[2px]" style={{ flexGrow: rest, flexBasis: 0, backgroundImage: NOT_LISTED }} /> : null}
          </div>
          <div className="mt-1.5 flex w-full gap-[2px]" aria-hidden>
            {weights.map((w) => (
              <span key={w.symbol} className="min-w-[2px] overflow-hidden text-center" style={{ flexGrow: w.weight, flexBasis: 0 }}>
                {w.weight >= 6 ? <span className="data block truncate text-[10px] text-text-secondary">{w.symbol}</span> : w.weight >= 4 ? <span className="data hidden truncate text-[10px] text-text-tertiary sm:block">{w.symbol}</span> : null}
              </span>
            ))}
            {rest > 0.05 ? <span className="min-w-[2px] overflow-hidden text-center" style={{ flexGrow: rest, flexBasis: 0 }}>{rest >= 6 ? <span className="block truncate text-[10px] text-text-tertiary">Cash</span> : null}</span> : null}
          </div>
        </div>

        <div className="rounded-[10px] bg-surface-2 px-4 py-3">
          <p className="text-caption text-text-secondary">Behaves like</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="data text-[2.5rem] font-semibold leading-none tracking-[-0.02em]">{c.effective.toFixed(1)}</span>
            <span className="text-footnote text-text-secondary">equal holdings of {n} held</span>
          </p>
          <EffectiveDots held={n} effective={c.effective} />
          <p className="data mt-3 text-caption text-text-tertiary">Herfindahl {c.herfindahl.toFixed(3)}</p>
        </div>
      </div>

      {insights.length ? (
        <ul className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-footnote">
          {insights.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="mt-[0.45rem] block h-1 w-1 shrink-0 rounded-full bg-viz" aria-hidden />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-caption text-text-tertiary">Weights of net worth over the listed holdings. The effective number is how many equal positions the book behaves like, one over the Herfindahl, the sum of squared weights.</p>
    </ChartFrame>
  );
}
