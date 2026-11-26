"use client";

import { useState } from "react";

import { ActionForm } from "@/components/app/action-form";
import { LineChart, type ChartLevel } from "@/components/charts/line-chart";
import { Button } from "@/components/ui/button";
import type { WatchReference } from "@/lib/watch-reference";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });

type Values = { low: string; base: string; high: string; below: string; above: string; basis: string };
export type WatchInitial = Values & { thesis: string; asOf: string; since: string };

const n = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

/**
 * One watched company's thesis and valuation in one place (Hamza, 23 Oct
 * 2026: "not have to switch through pages"): the thesis, kept on the Theses
 * screen; a year of closes with the low, base, high and the alerts drawn on
 * it as they are typed; and the reference beside them (the company's own
 * range on the metric its thesis or stage reads, its peers and its sector),
 * which Use these lays into the fields for the person to shape. Nothing is
 * kept until Save.
 */
export function WatchEditor({
  symbol,
  action,
  initial,
  reference,
  closes,
  standing,
  demo,
}: {
  symbol: string;
  action: (prev: { error: string | null }, form: FormData) => Promise<{ error: string | null }>;
  initial: WatchInitial;
  reference: WatchReference | null;
  closes: { dates: string[]; values: number[] } | null;
  standing: string | null;
  demo: boolean;
}) {
  const [v, setV] = useState<Values>({ low: initial.low, base: initial.base, high: initial.high, below: initial.below, above: initial.above, basis: initial.basis });
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const s = reference?.suggestion ?? null;
  const use = () => {
    if (!s) return;
    const t = (x: number | null) => (x === null ? "" : String(x));
    setV({ low: t(s.low), base: String(s.base), high: t(s.high), below: t(s.below), above: t(s.above), basis: s.basis });
  };
  const levels: ChartLevel[] = [
    ...(["low", "base", "high"] as const).flatMap((k) => (n(v[k]) === null ? [] : [{ key: k, value: n(v[k])!, label: k === "low" ? "Low" : k === "base" ? "Base" : "High", tone: "case" as const }])),
    ...(["below", "above"] as const).flatMap((k) => (n(v[k]) === null ? [] : [{ key: k, value: n(v[k])!, label: k === "below" ? "Alert ≤" : "Alert ≥", tone: "alert" as const }])),
  ];
  const price = reference?.price ?? closes?.values.at(-1) ?? null;
  return (
    <div className="mt-3 space-y-3">
      {closes && closes.dates.length > 1 ? (
        <LineChart
          title={`${symbol} over a year`}
          subtitle="Daily closes, with your low, base and high dashed and the alerts dotted as you type them."
          dates={closes.dates}
          series={[{ key: "price", label: symbol, color: "var(--series-hcmp)", values: closes.values }]}
          format="num2"
          height={200}
          levels={levels}
          tableCaption={`${symbol}'s daily closes over the past year`}
          tableEvery={5}
        />
      ) : (
        <p className="text-footnote text-text-secondary">No closes for {symbol} yet; the chart is drawn once the price feed answers for it.</p>
      )}
      {reference ? (
        <div className="rounded-[10px] bg-surface-2 px-3 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-subhead font-semibold">Reference on {reference.label}</p>
            {reference.multiple !== null ? <p className="data text-caption text-text-secondary">today {reference.multiple.toFixed(1)}x{reference.perShare !== null ? ` on ${reference.perShare.toFixed(2)} a share` : ""}</p> : null}
          </div>
          <p className="mt-0.5 text-caption text-text-tertiary">{reference.why}</p>
          {reference.lines.length ? (
            <table className="mt-2 w-full border-collapse text-footnote">
              <caption className="sr-only">Prices {symbol} would trade at on each reference multiple</caption>
              <thead>
                <tr className="text-caption text-text-tertiary">
                  <th scope="col" className="py-1 pr-2 text-left font-medium">Reference</th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">Multiple</th>
                  <th scope="col" className="py-1 pl-2 text-right font-medium">Price</th>
                  <th scope="col" className="py-1 pl-2 text-right font-medium">vs today</th>
                </tr>
              </thead>
              <tbody>
                {reference.lines.map((l) => (
                  <tr key={l.key} className="border-t border-hairline">
                    <th scope="row" className="py-1 pr-2 text-left font-normal text-text-secondary">{l.label}</th>
                    <td className="data px-2 py-1 text-right">{l.multiple === null ? "—" : `${l.multiple.toFixed(1)}x`}</td>
                    <td className="data py-1 pl-2 text-right font-medium">{fmt(l.price)}</td>
                    <td className="data py-1 pl-2 text-right text-text-secondary">{price ? `${l.price >= price ? "+" : ""}${((l.price / price - 1) * 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="mt-2 text-caption text-text-secondary">{reference.words}</p>
          {s ? (
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={use}>
              Use these
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-footnote text-text-secondary">No reference yet: the filings&apos; quarterly figures for {symbol} are read with the next morning&apos;s refresh, after which its own range, its peers and its sector are shown here.</p>
      )}
      {standing ? <p className="text-footnote text-text-secondary">{standing}</p> : null}
      <ActionForm action={action} label="Save" pendingLabel="Saving" variant="secondary" size="sm">
        <input type="hidden" name="symbol" value={symbol} />
        <label className="block text-subhead">
          Thesis
          <textarea name="thesis" rows={4} maxLength={6000} className={field} defaultValue={initial.thesis} placeholder="Why it is watched, what it must become, and what would make it a buy" />
        </label>
        <p className="mt-1 text-caption text-text-tertiary">{demo ? "In the demo the thesis is kept as the record's note." : "Kept on the Theses screen, where its pillars, valuation and the Thesis Hunter follow it."}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["low", "base", "high"] as const).map((k) => (
            <label key={k} className="block text-subhead">
              {k === "low" ? "Low" : k === "base" ? "Base" : "High"}
              <input name={k} type="number" step="any" className={field} value={v[k]} onChange={set(k)} />
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-subhead">
            Alert at or below
            <input name="below" type="number" step="any" min="0" className={field} value={v.below} onChange={set("below")} />
          </label>
          <label className="block text-subhead">
            Alert at or above
            <input name="above" type="number" step="any" min="0" className={field} value={v.above} onChange={set("above")} />
          </label>
        </div>
        <div className="mt-3 mb-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-subhead">
            Basis
            <input name="basis" className={field} maxLength={80} value={v.basis} onChange={set("basis")} />
          </label>
          <label className="block text-subhead">
            Valued on
            <input name="asOf" type="date" className={field} defaultValue={initial.asOf} />
          </label>
          <label className="block text-subhead">
            Watched since
            <input name="since" type="date" className={field} defaultValue={initial.since} />
          </label>
        </div>
      </ActionForm>
    </div>
  );
}
