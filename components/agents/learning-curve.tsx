import { Columns } from "@/components/charts/columns";
import { LineChart } from "@/components/charts/line-chart";
import type { CurvePoint, WrongReason } from "@/lib/agents";
import { shortDate } from "@/lib/time";

/**
 * How an agent is learning (the agents doc, §12, with Hamza's ratings of 23
 * Oct 2026): the share of findings rated useful week by week, with each
 * week's approved lessons as the points the brief changed; how many were
 * rated each week; and what was wrong most often. Each chart has its table.
 */
export function LearningCurve({ curve, wrong, empty }: { curve: readonly CurvePoint[]; wrong: readonly { reason: WrongReason; label: string; n: number }[]; empty: string }) {
  if (!curve.length) return <p className="card px-4 py-3 text-footnote text-text-secondary">{empty}</p>;
  const lessons = curve.filter((p) => p.lessons > 0);
  const first = curve.find((p) => p.share !== null)?.share ?? null;
  const last = [...curve].reverse().find((p) => p.share !== null)?.share ?? null;
  const most = wrong[0]?.n ?? 0;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <LineChart
          title="Found useful, by week"
          subtitle={first !== null && last !== null ? `From ${Math.round(first)}% in the first week rated to ${Math.round(last)}% in the latest.${lessons.length ? ` Lessons approved in the weeks of ${lessons.map((p) => shortDate(p.week)).join(", ")}.` : ""}` : undefined}
          dates={curve.map((p) => p.week)}
          series={[{ key: "useful", label: "Found useful", color: "var(--series-hcmp)", values: curve.map((p) => (p.share === null ? null : Math.round(p.share * 10) / 10)) }]}
          format="pct0"
          height={180}
          baseline={50}
          markers={lessons.map((p) => ({ i: curve.indexOf(p), side: "buy" as const, label: `${p.lessons} lesson${p.lessons === 1 ? "" : "s"} approved`, rows: [{ label: "Week of", value: shortDate(p.week) }] }))}
          tableCaption="The share of rated findings found useful, each week"
        />
      </div>
      <div className="flex flex-col gap-3">
        <Columns title="Rated, by week" labels={curve.map((p) => shortDate(p.week))} values={curve.map((p) => p.rated)} color="var(--series-hcmp)" format="int" tableCaption="Findings rated each week" height={120} />
        <div className="card px-4 py-3">
          <p className="text-subhead font-semibold">What was wrong</p>
          {wrong.length ? (
            <ul className="mt-2 space-y-1.5">
              {wrong.map((w) => (
                <li key={w.reason} className="text-footnote">
                  <span className="flex items-baseline justify-between gap-2">
                    <span>{w.label}</span>
                    <span className="data text-text-secondary">{w.n}</span>
                  </span>
                  <span className="mt-0.5 block h-1 rounded-full bg-surface-2">
                    <span className="block h-1 rounded-full bg-text-tertiary" style={{ width: `${(w.n / most) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-footnote text-text-secondary">Nothing rated not useful yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
