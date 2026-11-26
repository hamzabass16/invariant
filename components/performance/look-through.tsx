import type * as React from "react";

import { ListRow, ListSection } from "@/components/ui/list";
import { againstBenchmark, formatField, formatGap, type FundGap, type LookGroup, type LookThrough } from "@/lib/look-through";
import { FIELDS } from "@/lib/ontology";
import { classColor } from "@/components/holdings/portfolio-donuts";
import type { Methodology } from "@/lib/methodology";
import { InsightNote } from "@/components/performance/insights";
import type { PerfInsight } from "@/lib/perf-insights";

const SERIES: Record<string, string> = { book: "var(--series-hcmp)", SPY: "var(--series-spy)", QQQ: "var(--series-qqq)" };

/**
 * A cell's tint: the accent, stronger the higher the value within its row
 * (By class) or column (By holding). Magnitude, never good or bad, since a
 * higher figure is better for some fields and worse for others; the figure
 * itself stays in ink.
 */
function tint(v: number | null | undefined, lo: number, hi: number): React.CSSProperties | undefined {
  if (v === null || v === undefined || !Number.isFinite(v)) return undefined;
  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  return { background: `color-mix(in oklab, var(--viz) ${Math.round(8 + t * 40)}%, var(--surface))` };
}

const span = (vs: readonly (number | null | undefined)[]) => {
  const xs = vs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return xs.length ? { lo: Math.min(...xs), hi: Math.max(...xs) } : { lo: 0, hi: 0 };
};

/** A reading in its cell: the value, and how much of the group it covers when that is under four fifths. */
function Cell({ g, field }: { g: LookGroup; field: string }) {
  const r = g.readings[field];
  if (!r || r.value === null) return <span className="text-text-tertiary">–</span>;
  return (
    <>
      {formatField(field as never, r.value)}
      {r.coverage < 80 ? <span className="block text-caption text-text-secondary">{r.coverage.toFixed(0)}% read</span> : null}
    </>
  );
}

type Col = { head: React.ReactNode; dot?: string };
type Row = { head: React.ReactNode; cells: { node: React.ReactNode; style?: React.CSSProperties }[] };

function Table({ caption, corner, cols, rows, badge, note }: { caption: string; corner: string; cols: Col[]; rows: Row[]; badge?: React.ReactNode; note: string }) {
  return (
    <div className="card overflow-x-auto px-4 py-3">
      {badge ? <div className="mb-2 flex justify-end">{badge}</div> : null}
      <table className="w-full min-w-max border-separate border-spacing-[3px] text-footnote">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-text-tertiary">
            <th scope="col" className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pr-3 font-medium">
              {corner}
            </th>
            {cols.map((c, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {c.dot ? <span className="inline-block size-2.5 rounded-[3px]" style={{ background: c.dot }} aria-hidden /> : null}
                  {c.head}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pr-3 text-left font-normal">
                {r.head}
              </th>
              {r.cells.map((c, j) => (
                <td key={j} className="data whitespace-nowrap rounded-[6px] px-2 py-1.5 text-right align-top" style={c.style}>
                  {c.node}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-text-tertiary">{note}</p>
    </div>
  );
}

const STANDS: Record<NonNullable<FundGap["stands"]>, { words: string; ink: string; dot: string }> = {
  ahead: { words: "Ahead, as your classes want", ink: "text-ok", dot: "bg-ok" },
  level: { words: "Level", ink: "text-text-secondary", dot: "bg-text-tertiary" },
  behind: { words: "Behind, against your classes", ink: "text-warn", dot: "bg-warn" },
};

/**
 * The book against SPY on each figure, judged by the classes' own tests
 * (Hamza, 24 Oct 2026: "the S&P has more ROIC, but your portfolio is based
 * on compounding machines; what are the biggest holdings pushing it
 * down"): the gap, which way the classes want it, where the book stands and
 * the holdings pulling it the wrong way most, each with its pull in the
 * figure's unit. The app's arithmetic, drawn whether or not a model read it.
 */
function AgainstFund({ a, m, classKey, badge }: { a: { fund: string; rows: FundGap[] }; m: Methodology | null; classKey: Map<string, string | null>; badge?: React.ReactNode }) {
  const label = (f: string) => FIELDS[f as keyof typeof FIELDS].label;
  return (
    <>
      <h3 className="section-header mb-2 mt-6 px-4">Against {a.fund}, by your classes</h3>
      <Table
        caption={`Your book against ${a.fund} on each figure your methodology tests, judged by the levels your classes test`}
        corner="Figure"
        badge={badge}
        cols={[{ head: "Your book", dot: SERIES.book }, { head: a.fund, dot: SERIES[a.fund] }, { head: "Gap" }, { head: "Your classes test" }, { head: "Where it stands" }, { head: "Pulling it the wrong way most" }]}
        rows={a.rows.map((r) => ({
          head: label(r.field),
          cells: [
            { node: formatField(r.field, r.book) },
            { node: formatField(r.field, r.fund) },
            { node: formatGap(r.field, r.gap as number) },
            {
              node: r.tests.length ? (
                <span className="inline-flex flex-col items-end gap-0.5 whitespace-normal text-left">
                  {r.tests.map((t) => (
                    <span key={`${t.classId}-${t.words}`} className="inline-flex items-center gap-1.5">
                      <span className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: classColor(m, t.classId) }} aria-hidden />
                      <span>
                        {t.words}
                        {t.value !== null ? <span className="text-text-tertiary">{` · ${formatField(r.field, t.value)}${t.holds === false ? ", short" : ""}`}</span> : null}
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-text-tertiary">No level</span>
              ),
            },
            {
              node: r.stands ? (
                <span className={`inline-flex items-center gap-1.5 font-sans ${STANDS[r.stands].ink}`}>
                  <span className={`size-1.5 rounded-full ${STANDS[r.stands].dot}`} aria-hidden />
                  {STANDS[r.stands].words}
                </span>
              ) : (
                <span className="font-sans text-text-tertiary">{r.tests.length ? "Tested both ways" : "Not tested"}</span>
              ),
            },
            {
              node: r.pulls.length ? (
                <span className="inline-flex flex-col items-end gap-0.5">
                  {r.pulls.map((p) => (
                    <span key={p.symbol} className="inline-flex items-center gap-1.5">
                      <span className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: classColor(m, classKey.get(p.classLabel) ?? null) }} aria-hidden />
                      <span className="font-semibold">{p.symbol}</span>
                      <span className="text-text-secondary">{formatField(r.field, p.value)}</span>
                      <span className="text-text-tertiary">{formatGap(r.field, p.pull)}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-text-tertiary">None</span>
              ),
            },
          ],
        }))}
        note={`Which way your classes want a figure comes from their own tests: all at a level or more, higher; all at a level or less, lower. Beside each test, the class's holdings' average. A holding's pull is its share of your book's figure times its distance from ${a.fund}'s, so the pulls add up to the gap.`}
      />
    </>
  );
}

/**
 * The look-through on Performance: every figure the methodology tests by
 * class, for the book and for SPY and QQQ, as one table (Hamza, 20 Oct 2026:
 * no repeated cards; a chart of the book against the funds repeated its last
 * columns); every holding's own, as a table. The fields are
 * the methodology's; the averages are weighted by position (by the fund's
 * weight for SPY and QQQ).
 */
export function LookThroughSection({ look, demo, m = null, benchmarks = [], badge, insights = null }: { look: LookThrough; demo: boolean; m?: Methodology | null; benchmarks?: readonly string[]; badge?: React.ReactNode; insights?: readonly PerfInsight[] | null }) {
  const bookRead = look.fields.some((f) => (look.book.readings[f]?.read ?? 0) > 0);
  const label = (f: string) => FIELDS[f as keyof typeof FIELDS].label;
  const missingFunds = ["SPY", "QQQ"].filter((s) => !look.funds.some((g) => g.key === s));
  const columns = [...look.classes, look.book, ...look.funds];
  const classKey = new Map(look.classes.map((c) => [c.label, c.key === "none" ? null : c.key]));
  const spans = Object.fromEntries(look.fields.map((f) => [f, span(look.holdings.map((h) => h.values[f]))])) as Record<string, { lo: number; hi: number }>;
  const maxWeight = Math.max(1, ...look.holdings.map((h) => h.weight));
  const against = againstBenchmark(look, m?.classes ?? [], benchmarks);
  return (
    <section className="mb-8">
      <div className="mb-2 px-4">
        <h2 className="section-header">Look-through</h2>
      </div>
      <p className="mb-3 px-4 text-footnote text-text-secondary">
        The figures your methodology tests, as the weighted average of each listed company&apos;s own figure from its filings: by position for your book, by the fund&apos;s weight for SPY and QQQ. Funds, options and cash are not companies and are left out.
      </p>
      {!bookRead ? (
        <ListSection className="mb-4">
          <ListRow
            wrap
            label="No figures for your holdings yet"
            detail={demo ? "The demo's holdings carry no filings figures. With your own book, each holding's are read from its SEC filings." : "Each holding's figures come from its SEC filings: read by themselves each morning and when you open the app, once the SEC contact is confirmed on Setup."}
          />
        </ListSection>
      ) : null}
      <h3 className="section-header mb-2 mt-2 px-4">By class, against SPY and QQQ</h3>
      <Table
        caption="Look-through figures by class, for the book and for SPY and QQQ"
        corner="Figure"
        badge={badge}
        cols={columns.map((g) => ({ head: g.label, dot: g.kind === "class" ? classColor(m, g.key === "none" ? null : g.key) : SERIES[g.key] }))}
        rows={look.fields.map((f) => {
          const r = span(columns.map((g) => g.readings[f]?.value));
          return { head: label(f), cells: columns.map((g) => ({ node: <Cell g={g} field={f} />, style: tint(g.readings[f]?.value, r.lo, r.hi) })) };
        })}
        note="The deeper the shade, the higher the figure within its row. Shade is size, not good or bad."
      />
      <p className="mt-2 px-4 text-footnote text-text-secondary">
        Listed companies are {look.book.weight.toFixed(1)}% of net worth{look.classes.length > 1 ? `: ${look.classes.map((g) => `${g.label} ${g.weight.toFixed(1)}%`).join(", ")}` : ""}.{" "}
        {look.funds.map((g) => `${g.label}: ${g.note}.`).join(" ")} Read again each morning, so a company&rsquo;s new results count once its filing is read.
        {missingFunds.length ? ` ${missingFunds.join(" and ")} not read yet: ${demo ? "the demo carries a fictional sample of both" : "they are read from the SEC by themselves each morning, with the companies' figures shared across the app"}.` : ""}
      </p>
      {against ? <AgainstFund a={against} m={m} classKey={classKey} badge={badge} /> : null}
      <div className="mt-8">
        <InsightNote insights={insights} card="look_through" />
      </div>
      <h3 className="section-header mb-2 mt-6 px-4">By holding</h3>
      <Table
        caption="Each listed holding's own figures"
        corner="Holding"
        badge={badge}
        cols={[{ head: "Weight" }, ...look.fields.map((f) => ({ head: label(f) }))]}
        rows={look.holdings.map((h) => ({
          head: (
            <span className="flex items-center gap-2">
              <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: classColor(m, classKey.get(h.classLabel) ?? null) }} aria-hidden />
              <span>
                <span className="data font-semibold">{h.symbol}</span>
                <span className="block text-caption text-text-tertiary">{h.classLabel}</span>
              </span>
            </span>
          ),
          cells: [
            {
              node: (
                <span className="inline-flex flex-col items-end gap-1">
                  {`${h.weight.toFixed(1)}%`}
                  <span className="block h-1 w-14 rounded-full bg-surface-3" aria-hidden>
                    <span className="block h-1 rounded-full bg-viz" style={{ width: `${Math.min(100, (h.weight / maxWeight) * 100)}%` }} />
                  </span>
                </span>
              ),
            },
            ...look.fields.map((f) => ({ node: <span className={h.values[f] === null ? "text-text-tertiary" : undefined}>{formatField(f, h.values[f])}</span>, style: tint(h.values[f], spans[f].lo, spans[f].hi) })),
          ],
        }))}
        note="The deeper the shade, the higher the figure among your holdings in that column. Shade is size, not good or bad; the swatch is the holding's class."
      />
      <div className="mt-8">
        <InsightNote insights={insights} card="by_holding" />
      </div>
    </section>
  );
}
