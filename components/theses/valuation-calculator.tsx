"use client";

import { useCallback, useMemo, useState } from "react";

import { ActionForm } from "@/components/app/action-form";
import { DcfModel, field } from "@/components/theses/dcf-calculator";
import { ValuationHistoryCard, type Histories } from "@/components/theses/valuation-history";
import { StatusPill } from "@/components/ui/status";
import type { DcfBasis, DcfInputs, DcfResult } from "@/lib/dcf";
import { METRIC_USE_LABEL, STAGE, STAGES, VALUATION_METRIC, metricUse, type MetricUse, type StageId, type ValuationMetric } from "@/lib/ontology";
import { cn } from "@/lib/utils";
import { historyMetricFor, HISTORY_LABEL, type HistoryMetric } from "@/lib/valuation-history";
import { MULTIPLE_METRICS, runValuation, stageMetricsWords, valuationInputsSchema, type MultipleMetric, type ValuationInputs, type ValuationMethod } from "@/lib/valuation";

import type { ThesisState } from "@/app/(app)/theses/actions";

const n0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const n1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
const USE_TONE: Record<MetricUse, "ok" | "warn" | "neutral"> = { useful: "ok", somewhat: "warn", not: "neutral" };

type Cases = { bear: number; base: number; bull: number };
type Tam = NonNullable<ValuationInputs["tam"]>;

/** A blank set of inputs when the filings give no seed: the person types the per-share figures. */
const blank = (currency: string, price: number | null, priceCurrency: string | null, asOf: string): ValuationInputs =>
  valuationInputsSchema.parse({ stage: null, method: "ps", currency, priceCurrency: priceCurrency ?? currency, fx: 1, price: !priceCurrency || priceCurrency === currency ? price : null, perShare: { revenue: null, grossProfit: null, eps: null, fcf: null }, perShareLabel: null, forward: { eps: null, fcf: null }, multiples: { ps: { bear: 4, base: 5, bull: 6 }, pgp: { bear: 8, base: 10, bull: 12 }, forward_pe: { bear: 16, base: 20, bull: 24 }, forward_pfcf: { bear: 16, base: 20, bull: 24 }, trailing_pe: { bear: 18, base: 22, bull: 26 }, trailing_pfcf: { bear: 18, base: 22, bull: 26 } }, tam: null, asOf, note: null });

/**
 * The Valuation calculator (Hamza, 16 Oct 2026), after Brian Feroldi's
 * Valuation by Stage: the stage the filings place the company in, decided by
 * the ontology's tests with the rule and the figures named, and the person's
 * own stage when they set one; every metric in the order of its usefulness
 * at that stage, each valued in the browser on the person's bear, base and
 * bull estimate times the per-share figure the filings supply; the DCF model
 * among them; and Keep, which writes the inputs on the thesis and the chosen
 * method's cases as the holding's own valuation. Nothing here reads the vault.
 * The metrics are folded under one row and the chosen metric's five years sit
 * to the right (Hamza, 20 Oct 2026); the DCF runs the full width under both.
 */
export function ValuationCalculator({ symbol, kept, keptDcf, seed, dcfSeeds, readings, currency, price, priceCurrency, asOf, editable, action, histories = null }: { histories?: Histories | null; symbol: string; kept: ValuationInputs | null; keptDcf: DcfInputs | null; seed: ValuationInputs | null; dcfSeeds: Record<DcfBasis, DcfInputs | null>; readings: Record<string, number | null | undefined>; currency: string; price: number | null; priceCurrency: string | null; asOf: string; editable: boolean; action: (prev: ThesisState, form: FormData) => Promise<ThesisState> }) {
  const [v, setV] = useState<ValuationInputs>(() => kept ?? seed ?? blank(currency, price, priceCurrency, asOf));
  const [dcf, setDcf] = useState<{ inputs: DcfInputs | null; result: DcfResult | null }>({ inputs: null, result: null });
  const onDcf = useCallback((inputs: DcfInputs | null, result: DcfResult | null) => setDcf({ inputs, result }), []);
  const parsed = useMemo(() => valuationInputsSchema.safeParse(v), [v]);
  const result = useMemo(() => runValuation({ inputs: parsed.success ? parsed.data : null, dcf: dcf.result, readings, price, priceCurrency, asOf }), [parsed, dcf.result, readings, price, priceCurrency, asOf]);
  const stage = result.stage;
  const set = <K extends keyof ValuationInputs>(k: K, val: ValuationInputs[K]) => setV((d) => ({ ...d, [k]: val }));
  const setPer = (k: keyof ValuationInputs["perShare"], val: number | null) => setV((d) => ({ ...d, perShare: { ...d.perShare, [k]: val } }));
  const setFwd = (k: keyof ValuationInputs["forward"], val: number | null) => setV((d) => ({ ...d, forward: { ...d.forward, [k]: val } }));
  const setMult = (m: MultipleMetric, c: keyof Cases, val: number) => setV((d) => ({ ...d, multiples: { ...d.multiples, [m]: { ...(d.multiples[m] ?? { bear: 0, base: 0, bull: 0 }), [c]: val } } }));
  const setTam = (patch: Partial<Tam>) => setV((d) => ({ ...d, tam: { ...(d.tam ?? { market: 100000, sharePct: { bear: 2, base: 5, bull: 10 }, marginPct: 20, multiple: 20, shares: dcf.inputs?.shares ?? 100 }), ...patch } }));
  const numOf = (e: React.ChangeEvent<HTMLInputElement>) => (e.target.value === "" ? null : Number(e.target.value));
  const small = cn(field, "mt-0 w-20 px-2 py-1 text-footnote");
  const tiny = cn(field, "mt-0 w-16 px-1.5 py-1 text-footnote");
  const figureOf = (m: ValuationMetric) => (m === "ps" ? v.perShare.revenue : m === "pgp" ? v.perShare.grossProfit : m === "trailing_pe" ? v.perShare.eps : m === "trailing_pfcf" ? v.perShare.fcf : m === "forward_pe" ? v.forward.eps : m === "forward_pfcf" ? v.forward.fcf : null);
  const setFigure = (m: ValuationMetric, val: number | null) => (m === "ps" ? setPer("revenue", val) : m === "pgp" ? setPer("grossProfit", val) : m === "trailing_pe" ? setPer("eps", val) : m === "trailing_pfcf" ? setPer("fcf", val) : m === "forward_pe" ? setFwd("eps", val) : m === "forward_pfcf" ? setFwd("fcf", val) : undefined);
  const figureLabel = (m: ValuationMetric) => (m === "ps" ? "Sales / share" : m === "pgp" ? "Gross profit / share" : m === "trailing_pe" ? "EPS, trailing" : m === "trailing_pfcf" ? "FCF / share, trailing" : m === "forward_pe" ? "Your EPS, next 12 months" : "Your FCF / share, next 12 months");
  const ccy = priceCurrency ?? currency;
  // The chart follows the method chosen until a tab is picked on it.
  const [picked, setPicked] = useState<HistoryMetric | null>(null);
  const shown = picked ?? historyMetricFor(v.method);
  const twin = !picked && v.method && historyMetricFor(v.method) !== v.method ? `${VALUATION_METRIC[v.method].short} has no history; its trailing twin, ${HISTORY_LABEL[shown]}, is shown.` : null;
  const chosen = result.chosen;
  const keepDisabled = !chosen;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="card px-4 py-4">
          <div className="space-y-3">
            <div className="rounded-[12px] bg-surface-2 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="section-header">{result.own ? "Your stage" : "Stage from the filings"}</p>
                  <p className="data mt-1 text-title-3 font-semibold">{stage ? `${STAGE[stage].n} · ${STAGE[stage].label}` : "Undecided"}</p>
                  <p className="text-footnote text-text-secondary">{stage ? `Source of value: ${STAGE[stage].source.toLowerCase()}.` : null}</p>
                </div>
                {editable ? (
                  <label className="text-caption text-text-secondary">
                    Set the stage
                    <select className={cn(field, "mt-1 w-44 px-2 py-1 text-footnote")} value={v.stage ?? ""} onChange={(e) => set("stage", (e.target.value || null) as StageId | null)}>
                      <option value="">The filings&apos; stage</option>
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE[s].n} · {STAGE[s].label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <p className="mt-2 text-footnote text-text">{result.reading.words}</p>
              {result.own && result.reading.stage ? <p className="mt-1 text-caption text-text-tertiary">The filings read stage {STAGE[result.reading.stage].n}, {STAGE[result.reading.stage].label}; yours is in force.</p> : null}
              {result.reading.notes.map((x) => (
                <p key={x} className="mt-1 text-caption text-text-tertiary">
                  {x}
                </p>
              ))}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.reading.read.map((x) => (
                  <span key={x.field} className="data rounded-full bg-surface px-2 py-0.5 text-caption text-text-secondary">
                    {x.label} {x.value === null ? "n/a" : `${n1(x.value)}${/pct$/.test(x.field) ? "%" : ""}`}
                  </span>
                ))}
              </div>
              {stage ? <p className="mt-2 text-caption text-text-tertiary">{stageMetricsWords(stage)} After Brian Feroldi&apos;s Valuation by Stage.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["bear", "base", "bull"] as const).map((c) => (
                <div key={c} className="rounded-[10px] bg-surface-2 px-3 py-2">
                  <p className="section-header">{c}</p>
                  <p className={cn("data mt-0.5 text-headline font-semibold", c === "base" ? "text-accent-text" : "")}>{chosen ? n0(chosen.cases![c]) : "n/a"}</p>
                  <p className="text-caption text-text-tertiary">{chosen ? `${ccy} per share${chosen.vsPricePct ? ` · price ${Math.abs(chosen.vsPricePct[c]).toFixed(0)}% ${chosen.vsPricePct[c] >= 0 ? "below" : "above"}` : ""}` : "Pick a method"}</p>
                </div>
              ))}
              <div className="rounded-[10px] bg-surface-3 px-3 py-2">
                <p className="section-header">Price</p>
                <p className="data mt-0.5 text-headline font-semibold">{price === null ? "n/a" : price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
                <p className="text-caption text-text-tertiary">{chosen ? `${ccy} · by ${VALUATION_METRIC[chosen.metric].short}` : "No method yet"}</p>
              </div>
            </div>
          </div>

          <details className="mt-3 rounded-[12px] border border-hairline px-3 py-2">
            <summary className="cursor-pointer text-subhead text-accent-text">
              All valuation metrics · {result.metrics.length}
              <span className="text-text-tertiary">{chosen ? ` · by ${VALUATION_METRIC[chosen.metric].short}` : " · none chosen"}</span>
            </summary>
            <div className="mt-2 space-y-2">
              {result.metrics.map((m) => {
                const mult = (MULTIPLE_METRICS as readonly string[]).includes(m.metric) ? v.multiples[m.metric as MultipleMetric] : null;
                const chooseable = m.metric !== "reverse_dcf";
                const isMultiple = (MULTIPLE_METRICS as readonly string[]).includes(m.metric);
                return (
                  <div key={m.metric} className={cn("rounded-[12px] border border-hairline px-3 py-2.5", v.method === m.metric ? "border-accent/60" : "", m.use === "not" ? "opacity-70" : "")}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="text-subhead font-medium text-text">{m.label}</p>
                        {m.use ? <StatusPill tone={USE_TONE[m.use]}>{METRIC_USE_LABEL[m.use]}</StatusPill> : <StatusPill tone="neutral">No stage</StatusPill>}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="data text-footnote text-text">{m.cases ? `${n0(m.cases.bear)} / ${n0(m.cases.base)} / ${n0(m.cases.bull)} ${ccy}` : "n/a"}</p>
                        {chooseable ? (
                          <label className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
                            <input type="radio" name="method" checked={v.method === m.metric} onChange={() => {
                              set("method", m.metric as ValuationMethod);
                              setPicked(null);
                            }} disabled={!editable} aria-label={`Use ${m.label} as the valuation`} />
                            {v.method === m.metric ? "Chosen" : "Use"}
                          </label>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-0.5 text-caption text-text-tertiary">{VALUATION_METRIC[m.metric].estimate}</p>
                    {isMultiple ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="text-caption text-text-tertiary">
                          {figureLabel(m.metric)}, {currency}
                          <input type="number" step="any" inputMode="decimal" className={cn(small, "block w-28")} value={figureOf(m.metric) ?? ""} onChange={(e) => setFigure(m.metric, numOf(e))} disabled={!editable} />
                        </label>
                        {(["bear", "base", "bull"] as const).map((c) => (
                          <label key={c} className="text-caption text-text-tertiary">
                            {c} ×<input type="number" step="0.1" inputMode="decimal" className={cn(tiny, "block")} value={mult?.[c] ?? ""} onChange={(e) => setMult(m.metric as MultipleMetric, c, Number(e.target.value))} disabled={!editable} aria-label={`${m.label} ${c} multiple`} />
                          </label>
                        ))}
                      </div>
                    ) : m.metric === "tam" ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="text-caption text-text-tertiary">
                          Market, {currency} m<input type="number" step="1" inputMode="decimal" className={cn(small, "block w-28")} value={v.tam?.market ?? ""} onChange={(e) => setTam({ market: Number(e.target.value) })} disabled={!editable} />
                        </label>
                        {(["bear", "base", "bull"] as const).map((c) => (
                          <label key={c} className="text-caption text-text-tertiary">
                            {c} share %<input type="number" step="0.1" inputMode="decimal" className={cn(tiny, "block")} value={v.tam?.sharePct[c] ?? ""} onChange={(e) => setTam({ sharePct: { ...(v.tam?.sharePct ?? { bear: 2, base: 5, bull: 10 }), [c]: Number(e.target.value) } })} disabled={!editable} aria-label={`TAM ${c} share`} />
                          </label>
                        ))}
                        <label className="text-caption text-text-tertiary">
                          Margin %<input type="number" step="0.1" inputMode="decimal" className={cn(tiny, "block")} value={v.tam?.marginPct ?? ""} onChange={(e) => setTam({ marginPct: Number(e.target.value) })} disabled={!editable} />
                        </label>
                        <label className="text-caption text-text-tertiary">
                          Multiple ×<input type="number" step="0.1" inputMode="decimal" className={cn(tiny, "block")} value={v.tam?.multiple ?? ""} onChange={(e) => setTam({ multiple: Number(e.target.value) })} disabled={!editable} />
                        </label>
                        <label className="text-caption text-text-tertiary">
                          Shares, m<input type="number" step="0.01" inputMode="decimal" className={cn(small, "block")} value={v.tam?.shares ?? ""} onChange={(e) => setTam({ shares: Number(e.target.value) })} disabled={!editable} />
                        </label>
                      </div>
                    ) : null}
                    <p className="mt-1 text-caption text-text-secondary">{m.words}</p>
                  </div>
                );
              })}
            </div>
          </details>

          <label className="mt-4 block text-footnote text-text-secondary">
            Sources and what changed
            <textarea className={cn(field, "font-sans")} rows={2} maxLength={600} value={v.note ?? ""} onChange={(e) => set("note", e.target.value || null)} disabled={!editable} placeholder="Per-share figures from the latest 10-Q; forward EPS from the guide midpoint; multiples at the five-year median." />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {editable ? (
              <ActionForm action={action} label={chosen ? `Keep ${VALUATION_METRIC[chosen.metric].short} as your valuation` : "Keep as your valuation"} pendingLabel="Keeping" doneLabel="Kept" variant={keepDisabled ? "secondary" : "primary"}>
                <input type="hidden" name="symbol" value={symbol} />
                <input type="hidden" name="valuation" value={parsed.success ? JSON.stringify(parsed.data) : ""} />
                <input type="hidden" name="dcf" value={dcf.inputs ? JSON.stringify(dcf.inputs) : ""} />
              </ActionForm>
            ) : (
              <StatusPill tone="neutral">Read-only in the demo</StatusPill>
            )}
            <p className="text-footnote text-text-tertiary">{parsed.success ? "The chosen method's bear, base and bull become the holding's own valuation; every report and deck then reads the price against them. The stage is read from the filings at every result." : (parsed.error.issues[0]?.message ?? "The inputs do not hold together.")}</p>
          </div>
        </div>
        <ValuationHistoryCard histories={histories} metric={shown} onMetric={setPicked} followed={twin} />
      </div>
        <details className="card px-4 py-3" open={!stage || metricUse("dcf", stage) !== "not" || !!keptDcf}>
          <summary className="cursor-pointer text-subhead text-accent-text">Discounted cash flow model{stage ? ` · ${METRIC_USE_LABEL[metricUse("dcf", stage)].toLowerCase()} at this stage` : ""}</summary>
          <div className="mt-2">
            <DcfModel kept={keptDcf} seeds={dcfSeeds} currency={currency} price={price} asOf={asOf} editable={editable} onChange={onDcf} />
          </div>
        </details>
    </div>
  );
}
