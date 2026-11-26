import { ClipboardCheck } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import Link from "next/link";
import type { Route } from "next";

import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { CapLabel, ClassTag, WeightBar } from "@/components/app/figures";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { money } from "@/lib/holdings";
import { deriveScreens } from "@/lib/screen-data";
import { capTone } from "@/lib/screens";
import { localDay } from "@/lib/time";
import { checkTrade, type TradeSide } from "@/lib/trade-check";
import { screen } from "@/lib/workspace";

import { planTradeAction } from "../decisions/actions";

export const metadata = { title: "Trade check · Invariant" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const label = "block text-footnote text-text-secondary";

const STATUS = { fail: "danger", near: "warn", pass: "ok", manual: "neutral", "n/a": "neutral" } as const;
const WORD = { fail: "fails", near: "near its limit", pass: "within", manual: "yours", "n/a": "no reading" } as const;

/**
 * Trade check: a buy or a sale laid on a copy of the book, every rule run
 * again, the weight against the cap, and a Decision Log entry drafted. The
 * form is a plain GET so a check is a link that can be shared with oneself;
 * nothing is sent to a broker.
 */
export default async function CheckPage({ searchParams }: { searchParams: Promise<{ side?: string; symbol?: string; amount?: string }> }) {
  const ws = await screen("overview");
  const { setup, book } = ws;
  const sp = await searchParams;
  const today = localDay();
  const ccy = setup.baseCurrency;
  if (!book) {
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Trade check" />
        <PageBody>
          <EmptyState icon={ClipboardCheck} title="Nothing to check against yet" instruction="A trade is checked against your holdings and your methodology once an input is connected." action={<Link href="/setup" className={buttonStyles({ variant: "secondary" })}>See what to connect</Link>} />
        </PageBody>
      </>
    );
  }
  const m = setup.methodology;
  const data = deriveScreens({ book, methodology: m, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("check");
  const held = data.weights.map((w) => w.symbol);
  const watched = Object.keys(ws.records.bySymbol).map((s) => s.toUpperCase()).filter((s) => !held.includes(s)).sort();
  const side: TradeSide = sp.side === "sell" ? "sell" : "buy";
  const symbol = (sp.symbol ?? "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 40);
  const amount = Number(sp.amount ?? "");
  const asked = symbol.length > 0 && Number.isFinite(amount) && amount > 0;
  const result = asked ? checkTrade({ book, methodology: m, inputs: setup.inputs, today, side, symbol, amount }) : null;
  const draftHref = result ? (`/decisions?kind=trade&symbol=${encodeURIComponent(result.symbol)}&title=${encodeURIComponent(`${side === "buy" ? "Buy" : "Sell"} ${result.symbol} ${money(amount, ccy)}`)}&text=${encodeURIComponent(result.draft)}` as Route) : null;

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Trade check" subtitle={m ? `Before any order: the weight after the trade against its cap, and every rule of ${m.name} run again.` : "Before any order: the weight after the trade. Rules come once a methodology is confirmed."} />
      <PageBody>
        <div className="flow-cols">
          <div className="flow-col">
            {slots.includes("trade_form") ? (
              <ListSection header="Trade" className="mb-8">
                <form method="get" className="space-y-4 px-4 py-4">
                  <fieldset>
                    <legend className={label}>Side</legend>
                    <div className="mt-1 inline-flex rounded-[10px] bg-surface-2 p-1">
                      {(["buy", "sell"] as const).map((s) => (
                        <label key={s} className={`inline-flex h-9 cursor-pointer items-center rounded-[8px] px-4 text-subhead ${side === s ? "bg-surface text-text" : "text-text-secondary"}`}>
                          <input type="radio" name="side" value={s} defaultChecked={side === s} className="sr-only" />
                          {s === "buy" ? "Buy" : "Sell"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className={label}>
                    Holding or watched symbol
                    <select name="symbol" defaultValue={symbol} className={field} required>
                      <option value="">Choose</option>
                      <optgroup label="Holdings">
                        {held.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </optgroup>
                      {watched.length ? (
                        <optgroup label="Watchlist">
                          {watched.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>
                  <label className={label}>
                    Amount in {ccy}
                    <input name="amount" type="number" min={1} step="any" defaultValue={asked ? amount : ""} className={field} required inputMode="decimal" />
                  </label>
                  <button type="submit" className={buttonStyles({ variant: "primary" })}>
                    Check
                  </button>
                  <p className="text-footnote text-text-tertiary">A symbol not listed is added on the Watchlist first. Nothing here places an order.</p>
                </form>
              </ListSection>
            ) : null}
          </div>

          <div className="flow-col">
            {result ? (
              <>
                <ListSection
                  header="Result"
                  footer={result.notes.length ? result.notes.join(" ") : `Net worth ${money(result.netWorth, ccy)}, cash ${money(result.cash, ccy)}.`}
                  className="mb-8"
                >
                  <div className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="data font-semibold">{result.symbol}</span>
                      {ws.shown.classes ? <ClassTag label={result.classId ? result.classLabel : null} /> : null}
                      {m ? <StatusPill tone={result.clear ? "ok" : "danger"}>{result.clear ? "No rule newly broken" : "Breaks or nears a rule"}</StatusPill> : null}
                      <span className="ml-auto">{result.cap ? <CapLabel weight={result.weightAfter} cap={result.cap.cap} tone={capTone(result.capAfter)} /> : <span className="data">{result.weightAfter.toFixed(2)}%</span>}</span>
                    </div>
                    {result.cap ? (
                      <div className="mt-2">
                        <WeightBar weight={result.weightAfter} cap={result.cap.cap} scale={data.scale} tone={capTone(result.capAfter)} />
                      </div>
                    ) : null}
                    <p className="data mt-2 text-caption text-text-secondary">
                      Now {result.weightBefore.toFixed(2)}% → after {result.weightAfter.toFixed(2)}%{result.cap ? ` · cap ${result.cap.cap}% (${result.cap.rule.section})` : " · no cap"}
                      {result.shares !== null ? ` · ${result.shares.toFixed(2)} sh` : ""}
                    </p>
                  </div>
                  {slots.includes("trade_result")
                    ? result.moved.map((x) => (
                        <ListRow
                          key={x.finding.rule.id}
                          wrap
                          label={<><span className="data mr-2 text-text-tertiary">{x.finding.rule.section}</span>{x.finding.rule.text}</>}
                          detail={`${WORD[x.before]} → ${WORD[x.after]}${x.finding.actual ? ` · after ${x.finding.actual}` : ""}${x.finding.limit ? ` against ${x.finding.limit}` : ""}${x.finding.detail ? ` · ${x.finding.detail}` : ""}`}
                          value={<StatusPill tone={STATUS[x.after]}>{x.after === "fail" ? (x.finding.rule.severity === "breach" ? "Breach" : x.finding.rule.severity === "watch" ? "Watch" : "Outside guideline") : "Near limit"}</StatusPill>}
                        />
                      ))
                    : null}
                  {slots.includes("trade_result") && m && !result.moved.length ? <ListRow label="No rule moves" detail="Every tested rule reads the same after the trade as before." /> : null}
                  {result.reminders.map((f) => (
                    <ListRow key={f.rule.id} wrap label={<><span className="data mr-2 text-text-tertiary">{f.rule.section}</span>{f.rule.text}</>} detail="Yours to check before the order." value={<StatusPill tone="neutral">Yours</StatusPill>} />
                  ))}
                </ListSection>

                {slots.includes("trade_plan") ? (
                  <ListSection header="Plan it, trade tomorrow" className="mb-8" footer="Cooling off: the plan is kept in the Decision Log today, and the trade made a day or more later counts as planned on Trades, where planned trades are set against the rest. Nothing is sent to a broker.">
                    <div className="px-4 py-3">
                      <ActionForm action={planTradeAction} label="Keep the plan" pendingLabel="Keeping" doneLabel="Planned" variant="secondary" size="sm">
                        <input type="hidden" name="side" value={side} />
                        <input type="hidden" name="symbol" value={result.symbol} />
                        <label className={label}>
                          Why {side === "buy" ? "buy" : "sell"} {result.symbol}, in your words
                          <textarea name="text" rows={3} maxLength={4000} className={field} />
                        </label>
                      </ActionForm>
                    </div>
                  </ListSection>
                ) : null}

                {slots.includes("trade_draft") ? (
                  <ListSection header="Decision Log draft" footer="File it on the Decision Log with the reason filled in.">
                    <div className="px-4 py-3">
                      <pre className="data whitespace-pre-wrap text-caption text-text-secondary">{result.draft}</pre>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <CopyButton text={result.draft} label="Copy" />
                        {draftHref ? (
                          <Link href={draftHref} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                            File on the Decision Log
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </ListSection>
                ) : null}
              </>
            ) : (
              <ListSection header="Result">
                <ListRow label="Choose a side, a symbol and an amount." detail="The result shows the weight after the trade against its cap and every rule that moves." />
              </ListSection>
            )}
          </div>
        </div>
        <p className="mt-8 px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
