import type * as React from "react";

import { ActionForm } from "@/components/app/action-form";
import { ColumnGroups } from "@/components/charts/column-groups";
import { LineChart } from "@/components/charts/line-chart";
import { StatusPill } from "@/components/ui/status";
import { type ThesisFigure } from "@/lib/theses";
import { longDate } from "@/lib/time";

import { removeFigureAction } from "@/app/(app)/theses/actions";

/** Who added a figure, as its pill says. */
export const FIGURE_BY: Record<ThesisFigure["via"], string> = { claude: "Added by Claude", you: "Yours", hunter: "Thesis Hunter" };

/** One hue per series, in a fixed order, the benchmarks' own; never a status colour. */
const SERIES_HUES = ["var(--series-hcmp)", "var(--series-spy)", "var(--series-qqq)", "var(--arch-cm)"] as const;

/**
 * A thesis's charts and pictures (Hamza, 20 Oct 2026), each a card: a chart
 * the app draws from the figures Claude gave (one axis, a legend for two or
 * more series, a table view), or a picture drawn from its own host with no
 * referrer; the caption, the source with its page, who added it, and a
 * Remove for the person.
 */
export function FigureGrid({ figures, subject, editable }: { figures: readonly ThesisFigure[]; subject: { kind: "stock" | "market"; id: string }; editable: boolean }) {
  if (!figures.length) return null;
  return (
    <section id="figures" className="mb-8 scroll-mt-20">
      <h2 className="section-header mb-2 px-4">Charts and pictures · {figures.length}</h2>
      <div className={`grid grid-cols-1 gap-4 ${figures.length > 1 ? "pair-grid lg:grid-cols-2" : ""}`}>
        {figures.map((f) =>
          f.chart ? (
            <FigureChartView key={f.id} f={f} after={<FigureMeta f={f} subject={subject} editable={editable} />} />
          ) : (
            <figure key={f.id} className="card flex min-w-0 flex-col px-4 py-3">
              <p className="section-header mb-2">{f.title}</p>
              {f.image ? (
                <a href={f.image.url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-[10px] bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a picture from its own public host, at whatever size it is */}
                  <img src={f.image.url} alt={f.image.alt || f.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block h-auto w-full" />
                </a>
              ) : null}
              <figcaption className="mt-auto pt-3">
                {f.caption ? <p className="text-footnote text-text-secondary">{f.caption}</p> : null}
                <FigureMeta f={f} subject={subject} editable={editable} />
              </figcaption>
            </figure>
          ),
        )}
      </div>
      <p className="mt-2 px-4 text-footnote text-text-tertiary">Added by your own Claude through the connector (write_thesis), each with its source. A chart is drawn by the app from the figures Claude gave; a picture is shown from its own page.</p>
    </section>
  );
}

/** The source with its page, the date, who added it, and Remove. */
function FigureMeta({ f, subject, editable }: { f: ThesisFigure; subject: { kind: "stock" | "market"; id: string }; editable: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
      <span>
        Source:{" "}
        {f.sourceUrl ? (
          <a href={f.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-accent-text">
            {f.source}
          </a>
        ) : (
          f.source
        )}
      </span>
      <span className="data">{longDate(f.at)}</span>
      <StatusPill tone={f.via === "you" ? "neutral" : "info"}>{FIGURE_BY[f.via]}</StatusPill>
      {editable ? (
        <ActionForm action={removeFigureAction} label="Remove" variant="ghost" size="sm" className="ml-auto">
          <input type="hidden" name="kind" value={subject.kind} />
          <input type="hidden" name="subject" value={subject.id} />
          <input type="hidden" name="figure" value={f.id} />
        </ActionForm>
      ) : null}
    </div>
  );
}

export function FigureChartView({ f, after }: { f: ThesisFigure; after: React.ReactNode }) {
  const c = f.chart!;
  const format = `unit:${c.unit}` as const;
  if (c.type === "line") {
    return <LineChart title={f.title} dates={c.labels} series={c.series.map((s, i) => ({ key: `s${i}`, label: s.name, color: SERIES_HUES[i % SERIES_HUES.length], values: s.values }))} subtitle={f.caption ?? undefined} after={after} format={format} tableCaption={`${f.title}, from ${f.source}`} tableEvery={c.labels.length > 40 ? Math.ceil(c.labels.length / 40) : 1} />;
  }
  return <ColumnGroups title={f.title} labels={c.labels} series={c.series.map((s, i) => ({ label: s.name, color: SERIES_HUES[i % SERIES_HUES.length], values: s.values }))} subtitle={f.caption ?? undefined} after={after} format={format} tableCaption={`${f.title}, from ${f.source}`} slanted={c.labels.length > 8} />;
}
