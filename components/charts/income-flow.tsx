"use client";

import { useState } from "react";

import { ChartFrame, ChartTable, useWidth } from "@/components/charts/frame";
import {
  flowFill,
  flowLayout,
  flowLines,
  flowMoney,
  type FlowPalette,
  type IncomeFlow,
} from "@/lib/income-flow";
import { NOTE_FROM_WORDS, type FlowNote } from "@/lib/flow-notes";
import { cn } from "@/lib/utils";

// The app's own tokens (globals.css), so the flow follows the theme: the sources in the segment chart's hues, then grey.
const PALETTE: FlowPalette = {
  sources: [
    "var(--arch-tr)",
    "var(--arch-dg)",
    "var(--arch-ph)",
    "var(--arch-cm)",
    "var(--arch-none)",
  ],
  revenue: "var(--flow-revenue)",
  profit: "var(--flow-profit)",
  cost: "var(--flow-cost)",
  surface: "var(--surface)",
  text: {
    name: "var(--text)",
    value: "var(--text)",
    sub: "var(--text-secondary)",
    profit: "var(--flow-profit-ink)",
    cost: "var(--flow-cost-ink)",
  },
};

/** A view of the flow; `notes` are what lies behind its lines (lib/flow-notes.ts), drawn under it. */
export type FlowView = { key: string; word: string; flow: IncomeFlow; notes?: readonly FlowNote[]; notesNote?: string | null };

/**
 * How revenue became profit, drawn from `flowLayout` (lib/income-flow.ts),
 * the same geometry as the report's page and PDF: the sources, revenue,
 * gross profit and the cost of revenue, operating income and the expenses,
 * net income and the rest. A switch between the views given (a quarter, the
 * twelve months); narrower than the full layout (a phone), it is drawn
 * compact, names and values alone, and the table view carries every figure.
 */
export function IncomeFlowChart({
  title,
  subtitle,
  views,
  after,
  badge,
}: {
  title: string;
  subtitle?: React.ReactNode;
  views: readonly FlowView[];
  after?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [key, setKey] = useState(views[0]?.key ?? "");
  const { ref, width } = useWidth<HTMLDivElement>(720);
  const view = views.find((v) => v.key === key) ?? views[0];
  if (!view) return null;
  const f = view.flow;
  const fmt = (v: number) => flowMoney(v, f.currency);
  const g = flowLayout(f, width, fmt);
  const lines = flowLines(f, fmt);
  return (
    <ChartFrame
      title={title}
      badge={badge}
      subtitle={subtitle}
      table={
        <ChartTable
          caption={`${title}, ${f.label}`}
          head={["Line", "Amount", "Share and change"]}
          rows={lines.map((l) => [l.label, l.value, l.detail ?? ""])}
        />
      }
      controls={
        <>
          {views.length > 1 ? (
            <div className="mb-2 flex justify-center">
              <div
                className="inline-flex rounded-[10px] bg-surface-2 p-0.5"
                role="tablist"
                aria-label="Period"
              >
                {views.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    role="tab"
                    aria-selected={v.key === view.key}
                    onClick={() => setKey(v.key)}
                    className={cn(
                      "h-8 rounded-[8px] px-3 text-footnote font-medium",
                      v.key === view.key
                        ? "bg-accent text-white"
                        : "text-text-secondary",
                    )}
                  >
                    {v.word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-center text-footnote text-text-secondary">
            {f.label}
          </p>
        </>
      }
      after={
        <>
          {g.words.length || f.notes.length ? (
            <ul className="mt-2 space-y-0.5 text-caption text-text-tertiary">
              {[...g.words, ...f.notes].map((w) => (
                <li key={w}>{w.endsWith(".") ? w : `${w}.`}</li>
              ))}
            </ul>
          ) : null}
          {view.notes?.length ? <FlowNotesList notes={view.notes} note={view.notesNote ?? null} /> : null}
          {after}
        </>
      }
    >
      <div ref={ref} className="w-full">
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <svg
            viewBox={`0 0 ${g.width} ${g.height}`}
            width={g.width}
            height={g.height}
            role="img"
            aria-label={`${title}, ${f.label}`}
            className="data mx-auto block max-w-none"
          >
            {g.bands.map((b, i) => (
              <path
                key={i}
                d={b.d}
                style={{ fill: flowFill(b.role, PALETTE) }}
                fillOpacity={0.38}
              >
                <title>{b.title}</title>
              </path>
            ))}
            {g.nodes.map((n) => (
              <rect
                key={n.id}
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={2}
                style={{ fill: flowFill(n.role, PALETTE) }}
              >
                <title>{`${n.name}: ${fmt(n.value)}`}</title>
              </rect>
            ))}
            {g.texts.map((t, i) => (
              <text
                key={i}
                x={t.x}
                y={t.y}
                textAnchor={t.anchor}
                fontSize={t.size}
                fontWeight={t.bold ? 600 : undefined}
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
                style={{ fill: PALETTE.text[t.tone], stroke: PALETTE.surface }}
              >
                {t.text}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </ChartFrame>
  );
}

/**
 * What lies behind the lines (Hamza, 5 Nov 2026): one card per line the
 * results reader explained, why the company spends what it does and where
 * the money goes, the company's own words when the release prints them, and
 * where the note came from.
 */
function FlowNotesList({ notes, note }: { notes: readonly FlowNote[]; note: string | null }) {
  return (
    <div className="mt-4">
      <h4 className="section-header mb-2">Behind the lines</h4>
      <ul className="grid gap-2 sm:grid-cols-2 pair-grid-sm pair-grid-md">
        {notes.map((n) => (
          <li key={n.line} className="rounded-[10px] border border-hairline bg-surface-2 px-3 py-2.5">
            <p className="text-subhead font-semibold">{n.line}</p>
            <p className="mt-1 text-footnote">{n.why}</p>
            {n.where ? <p className="mt-1 text-footnote text-text-secondary">Where it goes: {n.where}</p> : null}
            {n.said ? <blockquote className="mt-1.5 border-l-2 border-hairline pl-2 text-footnote italic text-text-secondary">“{n.said}”</blockquote> : null}
            <p className="mt-1.5 text-caption text-text-tertiary">
              {n.source ? (
                <a href={n.source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-2 hover:text-text-secondary">
                  {NOTE_FROM_WORDS[n.from]}: {n.source.title}
                </a>
              ) : (
                NOTE_FROM_WORDS[n.from]
              )}
            </p>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-1.5 text-caption text-text-tertiary">{note}</p> : null}
    </div>
  );
}
