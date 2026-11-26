"use client";

import { useEffect, useMemo, useState } from "react";

import { DCF_BASES, DCF_BASIS_ABOUT, DCF_BASIS_LABEL, DCF_CASE_LABEL, DCF_CASES, DCF_MAX_YEARS, DCF_MIN_YEARS, dcfInputsSchema, fade, runDcf, type DcfBasis, type DcfInputs, type DcfResult } from "@/lib/dcf";
import { cn } from "@/lib/utils";

export const field = "data mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-2.5 py-1.5 text-body text-text";
const n0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const n1 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Draft = Omit<DcfInputs, "cases"> & { cases: Record<(typeof DCF_CASES)[number], { growth: string; marginEndPct: number }> };

const toDraft = (i: DcfInputs): Draft => ({ ...i, cases: { bear: { growth: i.cases.bear.growthPct.join(", "), marginEndPct: i.cases.bear.marginEndPct }, base: { growth: i.cases.base.growthPct.join(", "), marginEndPct: i.cases.base.marginEndPct }, bull: { growth: i.cases.bull.growthPct.join(", "), marginEndPct: i.cases.bull.marginEndPct } } });
const growthOf = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map(Number);
const fromDraft = (d: Draft) => dcfInputsSchema.safeParse({ ...d, cases: { bear: { growthPct: growthOf(d.cases.bear.growth), marginEndPct: d.cases.bear.marginEndPct }, base: { growthPct: growthOf(d.cases.base.growth), marginEndPct: d.cases.base.marginEndPct }, bull: { growthPct: growthOf(d.cases.bull.growth), marginEndPct: d.cases.bull.marginEndPct } } });

/** A blank model when the filings give no seed: the person types every figure. */
const blank = (basis: DcfBasis, currency: string, price: number | null, asOf: string): DcfInputs => ({ basis, currency, revenue: 1000, revenueLabel: null, marginNowPct: 20, sbcPct: 0, waccPct: 9, terminalGrowthPct: 3, cash: 0, investments: 0, debt: 0, balanceLabel: null, shares: 100, price, priceCurrency: currency, fx: 1, cases: { bear: { growthPct: fade(4, 2, 9), marginEndPct: 18 }, base: { growthPct: fade(8, 4, 9), marginEndPct: 20 }, bull: { growthPct: fade(12, 5, 9), marginEndPct: 22 } }, asOf, note: null });

/**
 * The DCF model inside the Valuation calculator, by free cash flow or by
 * earnings (Hamza, 16 Oct 2026): the inputs the filings suggest, every one
 * editable, the value computed in the browser as they change (lib/dcf.ts,
 * the same function the decks use). It reports its inputs and result up to
 * the calculator (`onChange`), which keeps them with the valuation and
 * reads the DCF and the reverse DCF as two of its metrics. Nothing here
 * reads the vault.
 */
export function DcfModel({ kept, seeds, currency, price, asOf, editable, onChange }: { kept: DcfInputs | null; seeds: Record<DcfBasis, DcfInputs | null>; currency: string; price: number | null; asOf: string; editable: boolean; onChange: (inputs: DcfInputs | null, result: DcfResult | null) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(kept ?? seeds.cash_flow ?? seeds.earnings ?? blank("cash_flow", currency, price, asOf)));
  const seeded = !!(seeds.cash_flow ?? seeds.earnings);
  const parsed = useMemo(() => fromDraft(draft), [draft]);
  const result = useMemo(() => (parsed.success ? runDcf(parsed.data) : null), [parsed]);
  useEffect(() => {
    onChange(parsed.success ? parsed.data : null, result);
  }, [parsed, result, onChange]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setCase = (c: (typeof DCF_CASES)[number], k: "growth" | "marginEndPct", v: string | number) => setDraft((d) => ({ ...d, cases: { ...d.cases, [c]: { ...d.cases[c], [k]: v } } }));
  const switchBasis = (basis: DcfBasis) => {
    const seed = kept?.basis === basis ? kept : seeds[basis];
    setDraft((d) => (seed ? toDraft(seed) : { ...d, basis }));
  };
  const numField = (label: string, k: keyof Draft, step = "any", hint?: string) => (
    <label className="block text-footnote text-text-secondary">
      {label}
      <input type="number" step={step} inputMode="decimal" className={field} value={typeof draft[k] === "number" ? (draft[k] as number) : ""} onChange={(e) => set(k, (e.target.value === "" ? null : Number(e.target.value)) as Draft[typeof k])} disabled={!editable} />
      {hint ? <span className="mt-0.5 block text-caption text-text-tertiary">{hint}</span> : null}
    </label>
  );
  const years = parsed.success ? parsed.data.cases.base.growthPct.length : growthOf(draft.cases.base.growth).length;
  const gap = result?.cases.base.vsPricePct ?? null;
  return (
    <div className="rounded-[12px] border border-hairline px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Basis" className="inline-flex rounded-[10px] bg-surface-2 p-0.5">
          {DCF_BASES.map((b) => (
            <button key={b} type="button" role="tab" aria-selected={draft.basis === b} onClick={() => switchBasis(b)} className={cn("h-8 rounded-[8px] px-3 text-subhead transition-colors", draft.basis === b ? "bg-surface text-text shadow-sm" : "text-text-secondary")}>
              By {DCF_BASIS_LABEL[b].toLowerCase()}
            </button>
          ))}
        </div>
        <p className="text-footnote text-text-tertiary">{kept ? `Kept ${kept.asOf}` : seeded ? "Seeded from the filings; nothing kept yet" : "No filings read yet; type the figures"}</p>
      </div>
      <p className="mt-2 text-footnote text-text-secondary">{DCF_BASIS_ABOUT[draft.basis]}</p>

      {result ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DCF_CASES.map((c) => {
            const x = result.cases[c];
            return (
              <div key={c} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
                <p className="section-header">{DCF_CASE_LABEL[c]}</p>
                <p className={cn("data mt-1 text-title-2 font-semibold", c === "base" ? "text-accent-text" : "")}>{n0(x.perShare)}</p>
                <p className="text-caption text-text-tertiary">
                  {result.priceCurrency ?? result.currency} per share{x.vsPricePct !== null ? ` · price ${Math.abs(x.vsPricePct).toFixed(0)}% ${x.vsPricePct >= 0 ? "below" : "above"}` : ""}
                </p>
              </div>
            );
          })}
          <div className="rounded-[12px] bg-surface-3 px-3 py-2.5 text-text">
            <p className="section-header">Price</p>
            <p className="data mt-1 text-title-2 font-semibold">{result.price === null ? "n/a" : n2(result.price)}</p>
            <p className="text-caption text-text-tertiary">{result.price === null ? "No price to compare" : `${result.priceCurrency ?? result.currency} · ${gap !== null && gap < 0 ? "above the base case" : "at or below the base case"}`}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-footnote text-danger">{parsed.success ? "" : (parsed.error.issues[0]?.message ?? "The inputs do not hold together.")}</p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {numField(`Revenue, ${draft.currency} m`, "revenue", "1", draft.revenueLabel ?? "Starting year")}
        {numField(`${DCF_BASIS_LABEL[draft.basis]} margin now, %`, "marginNowPct", "0.1")}
        {draft.basis === "cash_flow" ? numField("Stock comp, % of revenue", "sbcPct", "0.1", "Taken off the flow") : <div />}
        {numField("Discount rate (WACC), %", "waccPct", "0.1")}
        {numField("Terminal growth, %", "terminalGrowthPct", "0.1")}
        {numField(`Cash, ${draft.currency} m`, "cash", "1", draft.balanceLabel ?? undefined)}
        {numField(`Investments, ${draft.currency} m`, "investments", "1")}
        {numField(`Debt, ${draft.currency} m`, "debt", "1")}
        {numField("Diluted shares, m", "shares", "0.01")}
        {numField(`Price, ${draft.priceCurrency ?? draft.currency}`, "price", "0.01", draft.priceCurrency && draft.priceCurrency !== draft.currency ? `fx ${draft.fx} ${draft.priceCurrency} per ${draft.currency}` : undefined)}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-footnote">
          <thead>
            <tr className="text-left text-caption text-text-tertiary">
              <th className="py-1 pr-3 font-medium">Case</th>
              <th className="py-1 pr-3 font-medium">Revenue growth by year, % ({years} years, {DCF_MIN_YEARS} to {DCF_MAX_YEARS})</th>
              <th className="py-1 pr-3 font-medium">End margin, %</th>
              <th className="py-1 text-right font-medium">Per share</th>
            </tr>
          </thead>
          <tbody>
            {DCF_CASES.map((c) => (
              <tr key={c} className="border-t border-hairline">
                <td className="py-1.5 pr-3 font-medium">{DCF_CASE_LABEL[c]}</td>
                <td className="py-1.5 pr-3">
                  <input className={cn(field, "mt-0")} value={draft.cases[c].growth} onChange={(e) => setCase(c, "growth", e.target.value)} disabled={!editable} aria-label={`${DCF_CASE_LABEL[c]} growth by year`} />
                </td>
                <td className="py-1.5 pr-3">
                  <input type="number" step="0.1" className={cn(field, "mt-0 w-24")} value={draft.cases[c].marginEndPct} onChange={(e) => setCase(c, "marginEndPct", Number(e.target.value))} disabled={!editable} aria-label={`${DCF_CASE_LABEL[c]} end margin`} />
                </td>
                <td className="data py-1.5 text-right">{result ? n0(result.cases[c].perShare) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="section-header mb-1">Base case per share by WACC and terminal growth</p>
            <table className="data w-full text-footnote">
              <thead>
                <tr className="text-caption text-text-tertiary">
                  <th className="py-1 text-left font-medium">WACC \ g</th>
                  {result.sensitivity.terminals.map((t) => (
                    <th key={t} className="py-1 text-right font-medium">
                      {t}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.sensitivity.waccs.map((w, i) => (
                  <tr key={w} className="border-t border-hairline">
                    <td className="py-1">{w}%</td>
                    {result.sensitivity.values[i].map((v, j) => (
                      <td key={j} className={cn("py-1 text-right", w === parsed.data?.waccPct && result.sensitivity.terminals[j] === parsed.data?.terminalGrowthPct ? "text-accent-text font-semibold" : "")}>
                        {n0(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-footnote text-text-secondary">
            <p className="section-header mb-1 text-text">Assumptions</p>
            <ul className="space-y-1">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
              <li>Terminal value is {result.cases.base.terminalSharePct.toFixed(0)}% of the base case.</li>
              <li>
                {result.implied
                  ? `Reverse DCF: the price needs ${result.implied.cagrPct === null || !Number.isFinite(result.implied.cagrPct) ? "a growth no path reaches" : `${n1(result.implied.cagrPct)}% a year`}${result.implied.firstYearGrowthPct !== null && Number.isFinite(result.implied.firstYearGrowthPct) ? ` (${n1(result.implied.firstYearGrowthPct)}% in year one)` : ""} at ${result.implied.marginPct === null ? "the base margin" : `a ${n1(result.implied.marginPct)}% margin`}.`
                  : "Reverse DCF needs a price."}
              </li>
            </ul>
            <details className="mt-2">
              <summary className="cursor-pointer text-text">Base case, year by year</summary>
              <table className="data mt-1 w-full">
                <thead>
                  <tr className="text-caption text-text-tertiary">
                    <th className="py-0.5 text-left font-medium">Year</th>
                    <th className="py-0.5 text-right font-medium">Revenue</th>
                    <th className="py-0.5 text-right font-medium">Margin</th>
                    <th className="py-0.5 text-right font-medium">{DCF_BASIS_LABEL[result.basis]}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.cases.base.rows.map((r) => (
                    <tr key={r.year} className="border-t border-hairline">
                      <td className="py-0.5">{r.year}</td>
                      <td className="py-0.5 text-right">{n0(r.revenue)}</td>
                      <td className="py-0.5 text-right">{n1(r.marginPct)}%</td>
                      <td className="py-0.5 text-right">{n0(r.flow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      ) : null}

      <label className="mt-4 block text-footnote text-text-secondary">
        Sources and what changed
        <textarea className={cn(field, "font-sans")} rows={2} maxLength={600} value={draft.note ?? ""} onChange={(e) => set("note", e.target.value || null)} disabled={!editable} placeholder="Revenue from the Q3 10-Q; guide midpoint for the year; shares from the cover page." />
      </label>

    </div>
  );
}
