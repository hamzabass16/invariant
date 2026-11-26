import type * as React from "react";

import { cellStrength, cellValue, ECONOMY_COLUMNS, type Economies } from "@/lib/economies";
import { longDate } from "@/lib/time";

/** A cell's colour: blue toward the strongest reading in its column, red toward the weakest, grey in the middle and where a column has no direction. */
const fill = (s: number) => (s === 0 ? "var(--move-mid)" : `color-mix(in oklab, ${s > 0 ? "var(--move-up)" : "var(--move-down)"} ${Math.round(Math.abs(s) * 85)}%, var(--move-mid))`);
const ink = (s: number) => (Math.abs(s) * 85 > 50 ? "var(--move-ink)" : "var(--text)");

/** A cell's figure: a policy rate to the quarter point it is set in, the rest to a tenth. */
const show = (v: number | null, unit: string, key: string) => (v === null ? "n/a" : `${v > 0 && unit === "pts" ? "+" : ""}${v.toFixed(key === "policyRate" ? 2 : 1)}${unit === "pts" ? "" : "%"}`);

/**
 * The major developed economies as a heat map: a row each, a column per
 * measure, every figure printed in its cell. Colour ranks each economy within
 * the column (blue the stronger reading, red the weaker), so it compares, it
 * does not judge; the policy rate and broad money have no stronger direction
 * and stay grey. Wide on a phone, the grid scrolls inside its card with the
 * names held in place.
 */
export function EconomiesMap({ data, badge }: { data: Economies; badge?: React.ReactNode }) {
  return (
    <section className="card mb-8 px-4 py-3" aria-label="Major economies">
      <h3 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
        Major economies
        {badge}
      </h3>
      <p className="mt-1 text-footnote text-text-secondary">
        Policy rates from the BIS, broad money from the OECD, the rest from {data.annualSource} for {data.year}, a projection. In each column blue is the stronger reading among these economies and red the weaker, by rank; grey columns have no better direction.
      </p>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1">
        <table className="w-full min-w-[760px] border-separate border-spacing-[2px] text-footnote">
          <caption className="sr-only">Major economies by policy rate, current account, government debt, growth, interest growth and broad money</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-semibold text-text-secondary">
                Economy
              </th>
              {ECONOMY_COLUMNS.map((c) => (
                <th key={c.key} scope="col" title={c.about} className="px-2 py-1.5 text-right align-bottom font-semibold text-text-secondary">
                  <span className="block leading-tight">{c.label}</span>
                  <span className="block text-caption font-normal text-text-tertiary">{c.unit}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.code}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-2 text-left font-medium">
                  {r.name}
                </th>
                {ECONOMY_COLUMNS.map((c) => {
                  const v = cellValue(r, c.key);
                  const s = cellStrength(data.rows, c.key, r);
                  const note = c.key === "policyRate" && r.policyRate ? `${r.policyArea}, ${r.policyRate.date}` : c.key === "money" && r.money ? `${r.moneyArea}, ${r.money.date}` : null;
                  return (
                    <td key={c.key} title={note ?? undefined} className="data rounded-[4px] px-2 py-2 text-right" style={{ background: v === null ? "var(--surface-2)" : fill(s), color: v === null ? "var(--text-tertiary)" : ink(s) }}>
                      {show(v, c.unit, c.key)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-text-tertiary">
        Nominal growth is GDP growth in money, real growth and inflation together. Interest growth is the growth of what the government pays in interest (gross), this year on last; where Growth less interest is below zero, the interest bill outgrows the economy. Germany, France and Italy share the euro area&apos;s rate and money. Read {longDate(data.readAt.slice(0, 10))}.
      </p>
      {data.problems.length ? (
        <ul className="mt-2 space-y-1 text-caption text-text-secondary">
          {data.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
