import type * as React from "react";

import { StatTile } from "@/components/app/figures";
import { Columns } from "@/components/charts/columns";
import { Donut } from "@/components/charts/donut";
import type { Format } from "@/components/charts/frame";
import { LineChart } from "@/components/charts/line-chart";
import { ListRow, ListSection } from "@/components/ui/list";
import { RangeBar } from "@/components/dashboard/range-bar";
import { figureRangeOf, marketReadOf } from "@/lib/figure-range";
import { formatMarketFigure, type MarketRow } from "@/lib/markets";
import { inputLabel } from "@/lib/methodology";
import { SIGNAL_TONE, type Signal } from "@/lib/screens";
import { TIME_DIMENSIONS, type Unit } from "@/lib/ontology";
import { formatUnit, needsWords, type Figure, type Point, type Result } from "@/lib/recipes";

/**
 * One figure of a methodology, drawn the way its recipe asks: a tile for one
 * number; bars, a line, a donut or a table for a series. A figure whose
 * recipe reads a field the person's inputs cannot supply says what it needs
 * instead of showing a zero.
 */

const PALETTE = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)", "var(--series-spy)", "var(--viz-text)", "var(--arch-none)"];

function formatFor(unit: Unit, ccy: string): Format {
  switch (unit) {
    case "money":
      return `ccy:${ccy}`;
    case "pct":
      return "pct1";
    case "ratio":
      return "ratio";
    case "days":
      return "days";
    case "count":
      return "int";
    case "number":
      return "num2";
  }
}

/** A month, quarter or year key as a date the line chart can label. */
function dateOf(key: string, by: Figure["by"]): string {
  if (by === "date") return key;
  if (by === "year") return `${key}-01-01`;
  if (by === "quarter") return `${key.slice(0, 4)}-${String((Number(key.slice(-1)) - 1) * 3 + 1).padStart(2, "0")}-01`;
  return `${key}-01`;
}

function Needs({ result }: { result: Result }) {
  return (
    <ListSection>
      <ListRow wrap label={needsWords(result.needs, inputLabel)} detail="Shown once that data arrives; never a zero in the meantime." />
    </ListSection>
  );
}

export { marketReadOf };

/** A figure's value in its unit; a figure on one market indicator in the indicator's own (5.09%, $4,174 /oz, 104.20 pts). */
export function figureText(figure: Figure, value: number | null, ccy: string): string {
  const read = marketReadOf(figure);
  return (read && formatMarketFigure(read.symbol, read.field, value)) ?? formatUnit(value, figure.unit, ccy);
}

/**
 * `empty` says why a figure has nothing to measure when the screen knows
 * better than "yet" (one portfolio of a book whose value series spans
 * several). `badge` says how fresh it is. The reading is drawn on its range
 * (lib/figure-range.ts, `figureRangeOf`): a figure on one indicator on the
 * indicator's own with `markets`, a series statistic on its scale, and with
 * `signal` the rule on it colours the figure and ticks its limit (Hamza,
 * 19 Oct 2026).
 */
export function FigureTile({ figure, result, ccy, empty, badge, markets, signal }: { figure: Figure; result: Result; ccy: string; empty?: string; badge?: React.ReactNode; markets?: readonly MarketRow[] | null; signal?: Signal | null }) {
  if (result.kind !== "scalar") return <StatTile label={figure.label} value="n/a" detail="Not a single number" badge={badge} />;
  if (result.needs.length) return <StatTile label={figure.label} value="n/a" detail={needsWords(result.needs, inputLabel)} badge={badge} />;
  const test = signal?.rule.test?.figure === figure.id ? signal.rule.test : null;
  const range = figureRangeOf(figure, result.value, { markets, rule: test });
  const tone = signal && result.value !== null ? SIGNAL_TONE[signal.status] : "neutral";
  return <StatTile label={figure.label} value={figureText(figure, result.value, ccy)} tone={tone} extra={range ? <RangeBar range={range} format={(v) => figureText(figure, v, ccy)} limit={test?.limit ?? null} /> : undefined} detail={result.value === null ? (empty ?? "Nothing to measure yet") : figure.about} badge={badge} />;
}

export function FigureView({ figure, result, ccy, badge, markets, signal }: { figure: Figure; result: Result; ccy: string; badge?: React.ReactNode; markets?: readonly MarketRow[] | null; signal?: Signal | null }) {
  if (result.needs.length) return <Needs result={result} />;
  if (result.kind === "scalar") return <FigureTile figure={figure} result={result} ccy={ccy} badge={badge} markets={markets} signal={signal} />;
  const points = result.points;
  const format = formatFor(figure.unit, ccy);
  const isTime = !!figure.by && (TIME_DIMENSIONS.includes(figure.by) || figure.by === "date");
  if (!points.length) {
    return (
      <ListSection>
        <ListRow label="Nothing to show yet." detail={figure.about} />
      </ListSection>
    );
  }
  switch (figure.view) {
    case "line": {
      if (!isTime) return <Bars figure={figure} points={points} format={format} badge={badge} />;
      return (
        <LineChart
          title={figure.label}
          badge={badge}
          subtitle={figure.about}
          dates={points.map((p) => dateOf(p.key, figure.by))}
          series={[{ key: figure.id, label: figure.label, color: PALETTE[0], values: points.map((p) => p.value) }]}
          format={format}
          baseline={figure.expr.op === "series" && figure.expr.stat === "growth_of_100" ? 100 : 0}
          tableCaption={figure.label}
        />
      );
    }
    case "donut": {
      const positive = points.filter((p) => (p.value ?? 0) > 0);
      const total = positive.reduce((s, p) => s + (p.value ?? 0), 0) || 1;
      const top = positive.slice(0, 7);
      const rest = positive.slice(7);
      const slices = [
        ...top.map((p, i) => ({ key: p.key, label: p.label, value: ((p.value ?? 0) / total) * 100, color: PALETTE[i % PALETTE.length], group: membersText(p) ?? p.key, detail: formatUnit(p.value, figure.unit, ccy) })),
        ...(rest.length ? [{ key: "other", label: `${rest.length} more`, value: (rest.reduce((s, p) => s + (p.value ?? 0), 0) / total) * 100, color: "var(--arch-none)", group: "other", detail: formatUnit(rest.reduce((s, p) => s + (p.value ?? 0), 0), figure.unit, ccy) }] : []),
      ];
      return (
        <Donut
          title={figure.label}
          badge={badge}
          subtitle={figure.about}
          slices={slices}
          legend={slices.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))}
          centre={{ value: formatUnit(total, figure.unit, ccy), label: "total" }}
          tableCaption={figure.label}
          tableHead={["Group", "Share", points.some((p) => p.members) ? "Holdings" : "Group", "Value"]}
        />
      );
    }
    case "table":
      return (
        <ListSection header={figure.label} trailing={badge} footer={figure.about}>
          {points.slice(0, 20).map((p) => (
            <ListRow key={p.key} wrap label={p.label} detail={membersText(p)} value={formatUnit(p.value, figure.unit, ccy)} />
          ))}
          {points.length > 20 ? <ListRow label={`${points.length - 20} more`} /> : null}
        </ListSection>
      );
    default:
      return <Bars figure={figure} points={points} format={format} badge={badge} />;
  }
}

/** The holdings in a group, up to twelve, so a reader sees who sits where. */
function membersText(p: Point): string | undefined {
  if (!p.members?.length) return undefined;
  const shown = p.members.slice(0, 12).join(", ");
  return p.members.length > 12 ? `${shown} and ${p.members.length - 12} more` : shown;
}

function Bars({ figure, points, format, badge }: { figure: Figure; points: Point[]; format: Format; badge?: React.ReactNode }) {
  const shown = points.slice(0, 24);
  return <Columns title={figure.label} badge={badge} subtitle={figure.about} labels={shown.map((p) => p.label)} values={shown.map((p) => p.value)} color={PALETTE[0]} format={format} tableCaption={figure.label} />;
}
