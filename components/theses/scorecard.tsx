import type { Route } from "next";

import { StatTile } from "@/components/app/figures";
import { GroupedBars } from "@/components/charts/grouped-bars";
import { ListLinkRow, ListSection } from "@/components/ui/list";
import { longDate } from "@/lib/time";
import { SCORE_BENCHMARK, scorecardWords, type Scorecard } from "@/lib/thesis-scorecard";

const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const pts = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pts`;

/**
 * The scorecard on Theses (lib/thesis-scorecard.ts): how each thesis has done
 * against SPY since it was written, as tiles, bars and cards, the best first.
 */
export function ThesisScorecard({ card, problems }: { card: Scorecard; problems: readonly string[] }) {
  const measured = card.rows.filter((r) => r.returnPct !== null);
  if (!card.rows.length) return null;
  const best = measured[0] ?? null;
  const worst = measured.length > 1 ? measured.at(-1)! : null;
  return (
    <section id="scorecard" className="scroll-mt-20" aria-labelledby="scorecard-h">
      <h2 id="scorecard-h" className="section-header mb-2 px-4">
        Scorecard · against {SCORE_BENCHMARK} since written
      </h2>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Ahead of SPY" value={card.summary.measured ? `${card.summary.ahead} of ${card.summary.measured}` : "n/a"} detail="theses measured" tone={card.summary.measured ? (card.summary.ahead * 2 >= card.summary.measured ? "ok" : "warn") : "neutral"} />
        <StatTile label="On average" value={card.summary.avgAgainstPct === null ? "n/a" : pts(card.summary.avgAgainstPct)} detail={`against ${SCORE_BENCHMARK} over each one's days`} tone={card.summary.avgAgainstPct === null ? "neutral" : card.summary.avgAgainstPct >= 0 ? "ok" : "danger"} />
        <StatTile label="Best" value={best?.againstPct != null ? pts(best.againstPct) : "n/a"} detail={best ? `${best.title}, since ${longDate(best.since)}` : "nothing measured yet"} />
        <StatTile label="Worst" value={worst?.againstPct != null ? pts(worst.againstPct) : "n/a"} detail={worst ? `${worst.title}, since ${longDate(worst.since)}` : "one thesis or none measured"} />
      </div>
      {measured.length ? (
        <GroupedBars
          title={scorecardWords(card.summary)}
          subtitle={`Each thesis's company, or its basket in equal parts, from the close on the day it was written; ${SCORE_BENCHMARK} over the same days.`}
          groups={measured.map((r) => ({ key: r.key, label: r.title, values: [r.returnPct, r.benchmarkPct] }))}
          series={[
            { label: "The thesis", color: "var(--series-hcmp)" },
            { label: SCORE_BENCHMARK, color: "var(--series-spy)" },
          ]}
          format="signedPct1"
          tableCaption={`Each thesis against ${SCORE_BENCHMARK} since it was written`}
        />
      ) : null}
      <ListSection grid className="mt-3" footer={`It scores the ideas, not the trades: what was bought and when is on Performance and Trades. ${card.rows.some((r) => r.approx) ? "A thesis written before the app kept the day is measured from its first evidence or its last change, and says so. " : ""}${problems.length ? problems.slice(0, 2).join(" ") : ""}`.trim()}>
        {card.rows.map((r) => (
          <ListLinkRow
            key={r.key}
            href={r.href as Route}
            label={
              <span>
                <span className={r.kind === "stock" ? "data" : undefined}>{r.title}</span>
                <span className="text-text-secondary"> · {r.kind === "market" ? `basket of ${r.members.length + r.missing.length}` : r.held ? "held" : "watched"}</span>
              </span>
            }
            detail={[`${r.approx ? "Measured from" : "Written"} ${longDate(r.since)}`, r.benchmarkPct !== null ? `${SCORE_BENCHMARK} ${signed(r.benchmarkPct)}` : null, r.againstPct !== null ? `${pts(r.againstPct)} against it` : null, r.kind === "market" && r.members.length ? r.members.join(", ") : null, r.missing.length ? `no closes yet for ${r.missing.join(", ")}` : null].filter(Boolean).join(" · ")}
            value={r.returnPct === null ? "n/a" : <span className={r.againstPct === null ? "" : r.againstPct >= 0 ? "text-ok" : "text-danger"}>{signed(r.returnPct)}</span>}
          />
        ))}
      </ListSection>
    </section>
  );
}
