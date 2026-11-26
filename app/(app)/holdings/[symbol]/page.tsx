import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { Decide } from "@/components/actions/decide";
import { ActionForm } from "@/components/app/action-form";
import { CapLabel, ClassTag, StatTile, ValuationRange, WeightBar } from "@/components/app/figures";
import { CompanyGeography } from "@/components/holdings/company-geography";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { triggerFieldLabel, triggerReading } from "@/lib/alerts";
import { fieldText } from "@/lib/company";
import { decisionsFor, DECISION_LABEL } from "@/lib/decisions";
import { money } from "@/lib/holdings";
import { FIELDS, FUNDAMENTAL_FIELDS, type FieldId } from "@/lib/ontology";
import { classTest, criterionLabel, passWords, type CriterionRead } from "@/lib/recipes";
import { SECTOR_BASIS } from "@/lib/sectors";
import { deriveScreens } from "@/lib/screen-data";
import { capTone, countdown, daysBetween, SIGNAL_LABEL, SIGNAL_TONE } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

import { addTriggerAction, removeTriggerAction } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} · Invariant` };
}

type ClassRead = ReturnType<typeof classTest>;
const passWordsOf = (t: ClassRead) => passWords(t);

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v === null || v === undefined ? "n/a" : Array.isArray(v) ? v.join(", ") : String(v));

/**
 * One holding: its position against its cap, the owner's own valuation, the
 * class criteria as they read for it, the clocks on it, every rule's reading
 * for it, its fundamentals from filings or research, and the decisions that
 * name it. Each slot is on only when the methodology asks for it.
 */
export default async function HoldingPage({ params }: { params: Promise<{ symbol: string }> }) {
  const ws = await screen("overview");
  const { setup, book } = ws;
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!book) notFound();
  const today = localDay();
  const ccy = setup.baseCurrency;
  const m = setup.methodology;
  const data = deriveScreens({ book, methodology: m, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const w = data.weights.find((x) => x.symbol === symbol);
  if (!w) notFound();
  const slots = data.slots("holdings");
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  const h = w.holdings[0];
  const quantity = w.holdings.reduce((s, x) => s + x.quantity, 0);
  const cost = w.holdings.every((x) => x.costBasis !== null) ? w.holdings.reduce((s, x) => s + (x.costBasis ?? 0), 0) : null;
  const gain = cost && cost > 0 ? (w.value / cost - 1) * 100 : null;
  const room = w.cap ? ((w.cap.cap - w.weight) / 100) * data.netWorth : null;
  const cls = w.classId ? m?.classes.find((c) => c.id === w.classId) : null;
  // Every class's test on this holding: the one that places it in full, the others in a line each.
  const tests = (m?.classes ?? []).map((c) => ({ c, t: classTest(c, h, data.ctx) }));
  const test = cls ? (tests.find((x) => x.c.id === cls.id)?.t ?? null) : null;
  const testHeader = cls && test ? `${cls.label}: ${passWordsOf(test)}` : "Class criteria";
  const passWords = passWordsOf;
  const criterionRow = (x: CriterionRead, i: number, required: boolean) => (
    <ListRow key={`${required ? "r" : "c"}${i}`} wrap label={`${criterionLabel(x.filter)}${required ? " (required)" : ""}`} detail={`${x.read ? `now ${fmt(x.value)}` : "no reading"}${x.note ? `; ${x.note}` : ""}`} value={<StatusPill tone={x.pass ? "ok" : x.read ? "danger" : "neutral"}>{x.pass ? "Pass" : x.read ? "Fail" : "No reading"}</StatusPill>} />
  );
  const dated = data.dated.filter((d) => d.symbol?.toUpperCase() === symbol);
  const signals = data.signals.filter((s) => s.symbol?.toUpperCase() === symbol);
  const facts = Object.entries(h.fundamentals ?? {}).filter(([k, v]) => v !== null && k in FIELDS) as [FieldId, number][];
  const filing = ws.filings?.bySymbol[symbol] ?? null;
  const decisions = decisionsFor(ws.decisions, symbol);
  const rec = h.record;
  // What the methodology asks of this holding now, each with the action that answers it.
  const todo = data.todo.filter((t) => t.symbol?.toUpperCase() === symbol && t.group !== "decided");
  const decided = data.todo.filter((t) => t.symbol?.toUpperCase() === symbol && t.group === "decided");
  const triggers = rec?.triggers ?? [];
  const edgar = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(filing?.cik ? String(filing.cik) : symbol)}&type=10-K&dateb=&owner=include&count=10`;

  return (
    <>
      <PageHeader title={symbol} subtitle={w.name !== symbol ? w.name : h.account} />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2 px-1 text-subhead text-text-secondary">
          {ws.shown.classes ? <ClassTag label={w.classId ? w.classLabel : null} full /> : null}
          <span>{w.holdings.map((x) => x.account).join(", ")}</span>
          {w.cap ? <span>· {w.cap.cap}% cap ({w.cap.rule.section})</span> : null}
        </div>
        {rec?.note ? <p className="mb-6 px-1 text-body">{rec.note}</p> : null}

        {on("holding_tiles") ? (
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card px-4 py-3.5">
              <p className="section-header">{w.cap ? "Weight / cap" : "Weight"}</p>
              <p className="data mt-1 text-title-2 font-semibold">{w.cap ? <CapLabel weight={w.weight} cap={w.cap.cap} tone={capTone(w.state)} /> : `${w.weight.toFixed(2)}%`}</p>
              {w.cap ? (
                <div className="mt-2">
                  <WeightBar weight={w.weight} cap={w.cap.cap} scale={data.scale} tone={capTone(w.state)} />
                </div>
              ) : (
                <p className="mt-0.5 text-footnote text-text-secondary">of net worth</p>
              )}
            </div>
            {w.cap ? (
              <StatTile label={w.state === "over" ? "Over cap by" : "Room to cap"} value={money(Math.abs(room ?? 0), ccy)} detail={w.state === "over" && w.sharesToCap !== null ? `about ${w.sharesToCap.toFixed(2)} sh to sell` : `${w.state === "over" ? "" : "before the cap; "}${w.cap.rule.section}`} tone={capTone(w.state)} />
            ) : (
              <StatTile label="Value" value={money(w.value, ccy)} detail={`${w.holdings.length} account${w.holdings.length === 1 ? "" : "s"}`} />
            )}
            <StatTile label="Price" value={h.price !== null ? `${h.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${h.currency}` : "n/a"} detail={`${quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} units${cost && quantity ? ` · avg ${(cost / quantity).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ""}`} />
            <StatTile label="Gain on cost" value={gain !== null ? `${gain > 0 ? "+" : ""}${gain.toFixed(1)}%` : "n/a"} detail={cost !== null ? `cost ${money(cost, ccy)}` : "no cost on the statement"} tone={gain === null ? "neutral" : gain >= 0 ? "ok" : "danger"} />
          </div>
        ) : null}

        {on("holding_todo") && (todo.length || decided.length) ? (
          <ListSection header={`To do on ${symbol} · ${todo.length}`} footer="Each decision is filed in the Decision Log and answers the item until its reading changes or its date comes. Nothing is sent to a broker." className="mb-8">
            {todo.map((t) => (
              <div key={t.key}>
                <ListRow wrap label={t.title} detail={`${t.why} Done looks like: ${t.done}`} value={t.date ? <span className="data">{longDate(t.date)}</span> : t.section ? <span className="data text-caption text-text-tertiary">{t.section}</span> : undefined} />
                <Decide item={t} m={m} today={today} />
              </div>
            ))}
            {decided.map((t) => (
              <ListRow key={t.key} wrap label={<span className="text-text-secondary">{t.title}</span>} detail={t.decision?.text ? t.decision.text.slice(0, 200) : undefined} value={<StatusPill tone="ok">Decided</StatusPill>} />
            ))}
          </ListSection>
        ) : null}

        <div className="flow-cols">
          <div className="flow-col">
            {on("holding_valuation") ? (
              <ListSection header="Own valuation" footer={rec?.ownValuation ? `Set ${longDate(rec.ownValuation.asOf)}${rec.ownValuation.basis ? ` · ${rec.ownValuation.basis}` : ""}${h.price ? ` · price is ${((h.price / rec.ownValuation.base) * 100).toFixed(0)}% of base` : ""}` : undefined} className="mb-8">
                {rec?.ownValuation && h.price !== null ? (
                  <div className="px-4 py-3">
                    <ValuationRange low={rec.ownValuation.low} base={rec.ownValuation.base} high={rec.ownValuation.high} price={h.price} />
                  </div>
                ) : (
                  <ListLinkRow href="/customise" label={rec?.ownValuation ? "No price to place against the valuation" : "No valuation recorded yet"} detail={rec?.ownValuation ? "A price arrives with the broker's statement." : "Record your low, base and high under Customise → Records."} />
                )}
              </ListSection>
            ) : null}

            {on("class_test") ? (
              <ListSection header={testHeader} footer={(cls?.about ?? "A holding belongs to the first class whose test holds: every required filter, and the criteria in at least the number or share the class asks for. A criterion with no reading does not hold; one whose condition fails is not measured and leaves the count.")} className="mb-8">
                {cls && test ? (
                  [...test.required.map((x, i) => criterionRow(x, i, true)), ...test.criteria.map((x, i) => criterionRow(x, i, false))]
                ) : tests.length ? (
                  tests.map(({ c, t }) => <ListRow key={c.id} wrap label={c.label} detail={passWords(t)} value={<StatusPill tone="neutral">Not placed</StatusPill>} />)
                ) : (
                  <ListRow wrap label="No class places this holding" detail="The methodology has no classes." />
                )}
              </ListSection>
            ) : null}

            {on("holding_dates") ? (
              <ListSection header="Dates" className="mb-8">
                {dated.length ? (
                  dated.map((d) => {
                    const days = daysBetween(today, d.date);
                    return <ListRow key={d.key} wrap label={d.title} detail={d.detail} value={<span className={`data ${days < 0 ? "text-text-tertiary" : days <= 7 ? "text-warn" : ""}`}>{longDate(d.date)} · {countdown(days)}</span>} />;
                  })
                ) : (
                  <ListRow label="Nothing dated" detail={rec?.since ? `In its standing since ${longDate(rec.since)}.` : "No clock, expiry or maturity on this holding."} />
                )}
                {rec?.since && dated.length ? <ListRow label="In its standing since" value={<span className="data">{longDate(rec.since)}</span>} /> : null}
              </ListSection>
            ) : null}
          </div>

          <div className="flow-col">
            {on("holding_rules") ? (
              <ListSection header={`Rules on this holding · ${signals.length}`} footer={signals.length ? "Each reading against its limit, citing the section." : undefined} className="mb-8">
                {signals.length ? (
                  signals.map((s) => (
                    <ListRow key={s.key} wrap label={<><span className="data mr-2 text-text-tertiary">{s.rule.section}</span>{s.rule.text}</>} detail={[s.reading ? `Reading ${s.reading}` : null, s.limit ? `limit ${s.limit}` : null, s.detail || null].filter(Boolean).join(" · ")} value={<StatusPill tone={SIGNAL_TONE[s.status]}>{SIGNAL_LABEL[s.status]}</StatusPill>} />
                  ))
                ) : (
                  <ListRow label="No grouped rule reads this holding" detail="Rules on the whole portfolio are on the Methodology screen." />
                )}
              </ListSection>
            ) : null}

            {on("holding_triggers") ? (
              <ListSection header={`Triggers and kill signals · ${triggers.length}`} footer="Yours, for this holding: met, each is an alert by email and on Notifications, and an item to decide here. A trigger never changes the class the tests give." className="mb-8">
                {triggers.map((t) => {
                  const v = triggerReading(h, t.field);
                  const met = v !== null && (t.is === "lte" ? v <= t.value : v >= t.value);
                  return (
                    <ListRow
                      key={t.id}
                      wrap
                      label={`${t.kind === "kill" ? "Kill signal" : "Trigger"}: ${triggerFieldLabel(t.field)} ${t.is === "lte" ? "at or below" : "at or above"} ${fmt(t.value)}`} detail={[v === null ? "No reading yet" : `Now ${fmt(v)}`, t.note].filter(Boolean).join(" · ")} value={<StatusPill tone={met ? (t.kind === "kill" ? "danger" : "warn") : v === null ? "neutral" : "ok"}>{met ? "Met" : v === null ? "No reading" : "Not met"}</StatusPill>}
                      trailing={
                        <ActionForm action={removeTriggerAction} label="Remove" variant="ghost" size="sm" className="shrink-0">
                          <input type="hidden" name="symbol" value={symbol} />
                          <input type="hidden" name="id" value={t.id} />
                        </ActionForm>
                      }
                    />
                  );
                })}
                <details className="px-4 py-3">
                  <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Add a trigger or kill signal</summary>
                  <ActionForm action={addTriggerAction} label="Add" pendingLabel="Saving" variant="secondary" size="sm" className="mt-3">
                    <input type="hidden" name="symbol" value={symbol} />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-subhead">
                        Kind
                        <select name="kind" className={field} defaultValue="trigger">
                          <option value="trigger">Trigger</option>
                          <option value="kill">Kill signal</option>
                        </select>
                      </label>
                      <label className="block text-subhead">
                        Figure
                        <select name="field" className={field} defaultValue="price">
                          <option value="price">Price</option>
                          {FUNDAMENTAL_FIELDS.filter((f) => FIELDS[f].type !== "money").map((f) => (
                            <option key={f} value={f}>
                              {FIELDS[f].label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-subhead">
                        When it is
                        <select name="is" className={field} defaultValue="lte">
                          <option value="lte">At or below</option>
                          <option value="gte">At or above</option>
                        </select>
                      </label>
                      <label className="block text-subhead">
                        Level
                        <input name="value" type="number" step="any" className={`${field} data`} required />
                      </label>
                    </div>
                    <label className="mt-2 mb-3 block text-subhead">
                      Note
                      <input name="note" maxLength={200} className={field} placeholder="What it would mean, and what you would do" />
                    </label>
                  </ActionForm>
                </details>
              </ListSection>
            ) : null}

            {on("holding_fundamentals") ? (
              <ListSection header="Fundamentals" footer={filing && !filing.error ? `From SEC filings${filing.period ? `, ${filing.period}` : filing.latestQuarter ? `, latest ${filing.latestQuarter}` : ""}, read ${longDate(filing.readAt.slice(0, 10))}.${filing.notes.length ? ` ${filing.notes.join(" ")}` : ""}` : filing?.error ? `Filings: ${filing.error}` : facts.length ? "From a research study." : undefined} className="mb-8">
                {h.sector ? <ListRow wrap label="Sector" detail={rec?.sector ? "Set by you under Customise, Records" : [filing?.subIndustry, filing?.sectorBasis ?? SECTOR_BASIS, filing?.industry ? `SEC code: ${filing.industry}${filing.sic ? ` (${filing.sic})` : ""}` : null].filter(Boolean).join(" · ")} value={h.sector} /> : null}
                {facts.length ? (
                  facts.map(([k, v]) => <ListRow key={k} label={FIELDS[k].label} value={<span className="data">{fieldText(k, v, filing?.perShareCurrency ?? "USD")}</span>} />)
                ) : (
                  <ListLinkRow href="/setup" label="No figures yet" detail="Read every holding's filings in one pass on Setup, or run a study on Research." />
                )}
              </ListSection>
            ) : null}

            {on("holding_fundamentals") && h.revenueGeography?.lines.length ? (
              <div>
              <div className="mb-3">
                <CompanyGeography geography={h.revenueGeography} />
              </div>
              <ListSection
                header="Revenue by line"
                footer={`From the ${h.revenueGeography.form}, ${h.revenueGeography.period}${h.revenueGeography.accession ? `, accession ${h.revenueGeography.accession}` : ""}: the company's own lines, at its own grain.${h.revenueGeography.partial ? ` Partial: the lines place ${h.revenueGeography.placedPct.toFixed(1)}% of revenue.` : ""}${h.revenueGeography.note ? ` ${h.revenueGeography.note[0].toUpperCase()}${h.revenueGeography.note.slice(1)}.` : ""}`}
                className="mb-8"
              >
                {h.revenueGeography.lines.map((l) => (
                  <ListRow key={l.name} label={l.name} detail={l.grain === "country" ? "Country" : "Region"} value={<span className="data">{l.sharePct.toFixed(1)}%</span>} />
                ))}
              </ListSection>
              </div>
            ) : null}

            {on("holding_decisions") && ws.screens.includes("decisions") ? (
              <ListSection grid header={`Decision Log · ${decisions.length}`} className="mb-8">
                {decisions.length ? (
                  decisions.slice(0, 8).map((d) => <ListLinkRow key={d.id} href={`/decisions?symbol=${encodeURIComponent(symbol)}` as Route} label={d.title} detail={`${DECISION_LABEL[d.kind]} · ${longDate(d.date)}`} />)
                ) : (
                  <ListLinkRow href={`/decisions?symbol=${encodeURIComponent(symbol)}` as Route} label="No entry names this holding" detail="File one on the Decision Log." />
                )}
              </ListSection>
            ) : null}
            {/* Without the Decision Log page, the reasons given for new trades still sit with the holding. */}
            {on("holding_decisions") && !ws.screens.includes("decisions") && decisions.length ? (
              <ListSection header="Your reasons" className="mb-8">
                {decisions.slice(0, 8).map((d) => (
                  <ListRow key={d.id} wrap label={d.title} detail={`${longDate(d.date)}${d.text ? ` · ${d.text}` : ""}`} />
                ))}
              </ListSection>
            ) : null}

            {h.assetClass === "equity" || h.assetClass === "etf" ? (
              <a href={edgar} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text transition-colors active:bg-hairline">
                SEC EDGAR filings
                <ExternalLink className="size-3.5 text-text-tertiary" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
        <p className="mt-8 px-1 text-footnote text-text-tertiary">
          Not investment advice. Records are yours to edit under <Link href="/customise" className="text-accent-text">Customise</Link>.
        </p>
      </PageBody>
    </>
  );
}
