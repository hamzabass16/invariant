import { Info } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type * as React from "react";

import { ColumnGroups } from "@/components/charts/column-groups";
import { Donut } from "@/components/charts/donut";
import { CATEGORY_HUES } from "@/lib/asset-classes";
import { SAFETY_BANDS, SAFETY_MIN_TESTS, SAFETY_TESTS, type Dividends, type SafetyBand } from "@/lib/dividends";
import { money } from "@/lib/holdings";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const pctText = (v: number | null, d = 2) => (v === null ? "–" : `${v.toFixed(d)}%`);
/** A band is a state, so it takes the status colours, always with its word beside it. */
export const BAND_COLOR: Record<SafetyBand, string> = { Reliable: "var(--ok)", Safe: "var(--viz-text)", Uncertain: "var(--warn)", "At risk": "var(--danger)" };
const YEAR_HUES = ["var(--series-spy)", "var(--series-qqq)", "var(--series-hcmp)"];

function Tile({ label, about, value, children, className }: { label: string; about: string; value: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card flex min-w-0 flex-col px-4 py-4", className)}>
      <p className="flex items-center gap-1.5 text-subhead text-text-secondary">
        {label}
        <span title={about} className="text-text-tertiary">
          <Info className="size-3.5" aria-label={about} />
        </span>
      </p>
      <p className="data mt-2 text-title-1 font-semibold leading-none">{value}</p>
      {children}
    </div>
  );
}

/** The yield and the year's dividends, as two tiles (Snowball's first cards). */
export function DividendTiles({ d, ccy, link = false }: { d: Dividends; ccy: string; link?: boolean }) {
  const next = d.upcoming.find((u) => u.amount > 0) ?? null;
  return (
    <>
      <Tile label="Yield" about="What the payers are set to pay over a year, over the value of every listed holding today; and over what the holdings cost, where the broker gave a cost." value={pctText(d.yieldPct)}>
        <p className="mt-2 text-footnote text-text-secondary">
          <span className="data">{pctText(d.yieldOnCostPct)}</span> yield on cost
        </p>
      </Tile>
      <Tile label="Dividends" about="Each payer's trailing dividend per share from its filings times the shares held today, in your base currency; a fund the filings do not cover counts what it paid over the past year." value={<>{money(d.annual, ccy, d.annual < 1000 ? 2 : 0)} <span className="text-subhead font-normal text-text-secondary">a year</span></>}>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-text-secondary">
          <span>
            <span className="data">{money(d.monthly, ccy, 2)}</span> a month
          </span>
          {d.growthPct !== null ? (
            <span className="data rounded-full px-2 py-0.5 text-caption font-semibold" style={{ color: d.growthPct >= 0 ? "var(--move-up)" : "var(--move-down)", background: "var(--surface-2)" }} title="Received over the past twelve months against the twelve before">
              {d.growthPct >= 0 ? "▲" : "▼"} {Math.abs(d.growthPct).toFixed(1)}% on the year before
            </span>
          ) : null}
        </p>
      </Tile>
      {link ? (
        <Tile label="Next month" about="The payments the next month should bring, from the months each payer paid in over the past year." value={next ? money(next.amount, ccy, 2) : "–"}>
          <p className="mt-2 text-footnote text-text-secondary">
            {next ? `${monthLabel(next.month)} · ${next.parts.map((p) => p.symbol).join(", ")}` : "No payment dated yet."}{" "}
            <Link href={"/dividends" as Route} className="text-accent-text">
              Dividends
            </Link>
          </p>
        </Tile>
      ) : null}
    </>
  );
}

/** Where the year's dividends come from: each payer's share as a donut and as bars. */
export function IncomeMix({ d, ccy, badge }: { d: Dividends; ccy: string; badge?: React.ReactNode }) {
  const total = d.annual || 1;
  const top = d.holdings.slice(0, CATEGORY_HUES.length);
  const rest = d.holdings.slice(CATEGORY_HUES.length);
  const slices = [
    ...top.map((h, i) => ({ key: h.symbol, label: h.symbol, value: (h.annual / total) * 100, color: CATEGORY_HUES[i], group: h.name, detail: money(h.annual, ccy, 2) })),
    ...(rest.length ? [{ key: "more", label: `${rest.length} more`, value: (rest.reduce((s, h) => s + h.annual, 0) / total) * 100, color: "var(--text-tertiary)", group: rest.map((h) => h.symbol).join(", "), detail: money(rest.reduce((s, h) => s + h.annual, 0), ccy, 2) }] : []),
  ];
  return (
    <div className="pair-grid grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Donut title="Passive income diversification" badge={badge} subtitle="Each payer's share of what the book is set to pay over a year." slices={slices} legend={slices.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))} centre={{ value: String(d.holdings.length), label: d.holdings.length === 1 ? "payer" : "payers" }} tableCaption="Each payer's share of the year's dividends" tableHead={["Company", "Share", "Name", "A year"]} />
      <section className="card px-4 py-3" aria-label="Each payer's share of the year's dividends">
        <h3 className="section-header">By company</h3>
        <ul className="mt-3 space-y-3">
          {d.holdings.map((h, i) => {
            const share = (h.annual / total) * 100;
            return (
              <li key={h.symbol} className="min-w-0">
                <p className="flex items-baseline justify-between gap-3 text-subhead">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: i < CATEGORY_HUES.length ? CATEGORY_HUES[i] : "var(--text-tertiary)" }} />
                    <span className="data font-semibold">{h.symbol}</span>
                    <span className="truncate text-text-secondary">{h.name}</span>
                  </span>
                  <span className="data shrink-0">
                    {share.toFixed(1)}% <span className="text-text-secondary">({money(h.annual, ccy, 2)})</span>
                  </span>
                </p>
                <span className="mt-1.5 block h-1.5 w-full rounded-full bg-surface-2" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(1, share)}%`, background: i < CATEGORY_HUES.length ? CATEGORY_HUES[i] : "var(--text-tertiary)" }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Each payer's dividend on four tests from its filings, and the share of the year's dividends in each band. */
export function SafetyCard({ d, ccy, badge }: { d: Dividends; ccy: string; badge?: React.ReactNode }) {
  const scored = d.holdings.filter((h) => h.safety);
  const total = scored.reduce((s, h) => s + h.annual, 0) || 1;
  const bands = SAFETY_BANDS.map((b) => ({ band: b.band, share: (scored.filter((h) => h.safety!.band === b.band).reduce((s, h) => s + h.annual, 0) / total) * 100 })).filter((b) => b.share > 0);
  const how = `${SAFETY_TESTS.map((t) => `${t.label}: ${t.words}`).join(" ")} The score is the marks over those the filings could read, at least ${SAFETY_MIN_TESTS} of the four; 80 and up reads Reliable, 60 Safe, 40 Uncertain, below that At risk. The app's own reading of the filings, not a rating agency's and not advice.`;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {bands.length ? (
        <Donut title="Dividend safety" badge={badge} subtitle="The share of the year's dividends in each band." slices={bands.map((b) => ({ key: b.band, label: b.band, value: b.share, color: BAND_COLOR[b.band], group: b.band }))} legend={bands.map((b) => ({ label: b.band, color: BAND_COLOR[b.band], kind: "rect" as const }))} centre={{ value: String(scored.length), label: "scored" }} tableCaption="The share of the year's dividends in each safety band" tableHead={["Band", "Share", "Band", ""]} />
      ) : (
        <section className="card px-4 py-3">
          <h3 className="section-header">Dividend safety</h3>
          <p className="mt-2 text-footnote text-text-secondary">No payer has enough figures in its filings for a score yet. They arrive with the next filings read.</p>
        </section>
      )}
      <section className="card min-w-0 px-4 py-3 lg:col-span-2" aria-label="Each payer's dividend safety">
        <h3 className="section-header flex items-center gap-1.5">
          Each payer
          <span title={how} className="text-text-tertiary">
            <Info className="size-3.5" aria-label={how} />
          </span>
        </h3>
        <p className="mt-0.5 text-footnote text-text-secondary">Four tests from the filings, each a quarter of the score: payout ratio, years raised, five-year growth, a yield not stretched.</p>
        <ul className="mt-3 divide-y divide-hairline">
          {d.holdings.map((h) => (
            <li key={h.symbol} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_12rem]">
              <span className="min-w-0">
                <span className="data block text-subhead font-semibold">{h.symbol}</span>
                <span className="block truncate text-caption text-text-secondary">{h.name}</span>
              </span>
              {/* Fixed columns, every row on the same grid, figures to the right, so the rows line up (Hamza, 19 Oct 2026). */}
              <span className="data hidden text-right text-footnote tabular-nums sm:block">
                {money(h.value, ccy)}
                <span className="block text-caption text-text-tertiary">{h.cost === null ? "cost not given" : `${money(h.cost, ccy)} invested`}</span>
              </span>
              <span className="data hidden text-right text-footnote tabular-nums sm:block">
                {money(h.annual, ccy, 2)}
                <span className="block text-caption text-text-tertiary">a year</span>
              </span>
              {h.safety ? (
                <span className="flex items-center justify-end gap-1.5" title={h.safety.tests.map((t) => `${t.label}: ${t.points === null ? "unread" : `${t.points} of 25`}`).join(" · ")}>
                  <span className="data inline-flex h-7 w-10 items-center justify-center rounded-[6px] text-footnote font-semibold text-[var(--bg)]" style={{ background: BAND_COLOR[h.safety.band] }}>
                    {h.safety.score}
                  </span>
                  <span className="w-[5.5rem] text-footnote" style={{ color: BAND_COLOR[h.safety.band] }}>
                    {h.safety.band}
                  </span>
                </span>
              ) : (
                <span className="text-right text-caption text-text-tertiary">{h.safetyWhy}</span>
              )}
              <span className="data col-span-2 text-caption text-text-tertiary sm:hidden">
                {money(h.value, ccy)} · {money(h.annual, ccy, 2)} a year
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function GrowthCard({ d, badge }: { d: Dividends; badge?: React.ReactNode }) {
  const rows = d.holdings.filter((h) => h.growth5yPct !== null).sort((a, b) => (b.growth5yPct ?? 0) - (a.growth5yPct ?? 0));
  if (!rows.length)
    return (
      <section className="card px-4 py-3">
        <h3 className="section-header">Average annual growth</h3>
        <p className="mt-2 text-footnote text-text-secondary">Needs six years of dividends per share in a payer&apos;s filings; none has them yet.</p>
      </section>
    );
  return <ColumnGroups title="Average annual growth" badge={badge} subtitle="Each payer's dividend per share, its growth a year over five years, from its filings." labels={rows.map((h) => h.symbol)} series={[{ label: "Growth a year", color: "var(--series-hcmp)", values: rows.map((h) => h.growth5yPct) }]} format="signedPct1" labelHead="Company" tableCaption="Each payer's dividend growth a year over five years" slanted={rows.length > 8} />;
}

export function UpcomingCard({ d, ccy, badge }: { d: Dividends; ccy: string; badge?: React.ReactNode }) {
  const dated = d.upcoming.reduce((s, u) => s + u.amount, 0);
  return (
    <ColumnGroups
      title="Future payments"
      badge={badge}
      subtitle={
        <>
          <span className="data">{money(d.annual, ccy, 2)}</span> over the next twelve months, <span className="data">{money(d.monthly, ccy, 2)}</span> a month. Each payer is placed in the months it paid in over the past year, its year shared by what it paid then.
        </>
      }
      labels={d.upcoming.map((u) => monthLabel(u.month))}
      series={[{ label: "Expected", color: "var(--series-hcmp)", values: d.upcoming.map((u) => u.amount) }]}
      format={`cents:${ccy}`}
      labelHead="Month"
      tableCaption="The payments expected each month over the next twelve"
      after={
        d.undated.length ? (
          <p className="mt-3 text-footnote text-text-secondary">
            Not placed in a month, since the broker&apos;s ledger shows no payment of theirs over the past year: {d.undated.map((u) => `${u.symbol} (${money(u.annual, ccy, 2)})`).join(", ")}
            {dated > 0 ? "" : ". The months fill in once the IBKR Flex query includes Cash Transactions (the guide on Setup shows where)"}.
          </p>
        ) : null
      }
    />
  );
}

export function NoLedger() {
  return (
    <section className="card px-4 py-3">
      <h3 className="section-header">Dividends received</h3>
      <p className="mt-2 text-footnote text-text-secondary">Needs the broker&apos;s ledger of dividends. For IBKR, tick Cash Transactions in the Flex query (the guide on Setup lists it) and the next statement brings every dividend, the tax withheld on it, interest and fees.</p>
    </section>
  );
}

export function ReceivedCard({ d, ccy, badge }: { d: Dividends; ccy: string; badge?: React.ReactNode }) {
  return (
    <ColumnGroups
      title="Dividends received"
      badge={badge}
      subtitle={
        <>
          The past twelve months, net of the tax withheld: <span className="data">{money(d.received12 ?? 0, ccy, 2)}</span> in all.
        </>
      }
      labels={d.byMonth.map((m) => monthLabel(m.month))}
      series={[{ label: "Received", color: "var(--series-hcmp)", values: d.byMonth.map((m) => m.amount) }]}
      format={`cents:${ccy}`}
      labelHead="Month"
      tableCaption="Dividends received each month over the past twelve, net of tax withheld"
    />
  );
}

export function ByCompanyCard({ d, ccy, badge }: { d: Dividends; ccy: string; badge?: React.ReactNode }) {
  return <ColumnGroups title="Dividends received by company" badge={badge} subtitle={`Everything the ledger shows received${d.since ? `, since ${d.since}` : ""}, net of the tax withheld, largest first.`} labels={d.receivedBySymbol.map((r) => r.symbol)} series={[{ label: "Received", color: "var(--series-hcmp)", values: d.receivedBySymbol.map((r) => r.amount) }]} format={`cents:${ccy}`} labelHead="Company" tableCaption="Dividends received by company" slanted={d.receivedBySymbol.length > 6} />;
}

export function YearsCard({ d, ccy, badge }: { d: Dividends; ccy: string; badge?: React.ReactNode }) {
  return <ColumnGroups title="Dividend growth by month" badge={badge} subtitle="Each month's dividends in the last three years side by side, net of the tax withheld." labels={MONTHS} series={d.byYear.map((y, i) => ({ label: String(y.year), color: YEAR_HUES[(YEAR_HUES.length - d.byYear.length + i) % YEAR_HUES.length], values: y.months }))} format={`cents:${ccy}`} labelHead="Month" tableCaption="Dividends received each month, by year" />;
}
