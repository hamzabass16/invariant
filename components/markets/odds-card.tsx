import type { ReactNode } from "react";

import { nextFomc } from "@/lib/econ-calendar";
import { fedSourceWords, type Odds } from "@/lib/odds";
import { localMoment, longDate } from "@/lib/time";

const bar = (label: string, pct: number, color: string) => (
  <div key={label} className="flex items-center gap-3 text-footnote">
    <span className="w-14 shrink-0 text-text-secondary">{label}</span>
    <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
    <span className="data w-12 shrink-0 text-right">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
  </div>
);

/**
 * What the prediction markets price (lib/odds.ts; Hamza, 21 Oct 2026): the
 * Fed's next decision from the deeper of Kalshi and Polymarket on that
 * meeting (Hamza, 28 Oct 2026), and a US recession from Polymarket, each
 * with its own page. The prices are the markets', read as chances; nothing
 * here is the app's forecast.
 */
export function OddsCard({ odds, today, badge, demo }: { odds: Odds; today: string; badge?: ReactNode; demo: boolean }) {
  const meeting = nextFomc(today);
  return (
    <section className="mb-8" aria-labelledby="odds">
      <div className="mb-2 flex items-center justify-between gap-3 px-4">
        <h2 id="odds" className="section-header">
          What the markets bet on
        </h2>
        {badge}
      </div>
      <div className="pair-grid grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card px-4 py-4">
          <p className="text-subhead font-semibold">The Fed{odds.fed ? `, ${longDate(odds.fed.meeting)}` : meeting ? `, ${longDate(meeting.date)}` : ""}</p>
          {odds.fed ? (
            <>
              {odds.fed.upper !== null ? <p className="mt-0.5 text-footnote text-text-secondary">The range today tops out at {odds.fed.upper.toFixed(2)}%.</p> : null}
              <div className="mt-3 space-y-2">
                {bar("Cut", odds.fed.cut, "var(--series-hcmp)")}
                {bar("Hold", odds.fed.hold, "var(--series-qqq)")}
                {bar("Hike", odds.fed.hike, "var(--series-spy)")}
              </div>
              {odds.fed.bigCut !== null && odds.fed.bigCut >= 1 ? <p className="mt-2 text-caption text-text-tertiary">Half a point or more: {odds.fed.bigCut.toFixed(1)}%.</p> : null}
              <p className="mt-2 text-caption text-text-tertiary">{fedSourceWords(odds.fed)}</p>
              <a href={odds.fed.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-footnote text-accent-text">
                {odds.fed.source === "Polymarket" ? "Polymarket\u2019s market on the decision" : "Kalshi\u2019s federal funds markets"}
              </a>
            </>
          ) : (
            <p className="mt-2 text-footnote text-text-secondary">{odds.problems.find((p) => /Fed|Kalshi/.test(p)) ?? "Neither Kalshi's nor Polymarket's markets on the meeting could be read."}</p>
          )}
        </div>
        <div className="card px-4 py-4">
          <p className="text-subhead font-semibold">A US recession</p>
          {odds.recession ? (
            <>
              <p className="data mt-2 text-large-title font-semibold">{odds.recession.yes.toFixed(odds.recession.yes < 10 ? 1 : 0)}%</p>
              <p className="text-footnote text-text-secondary">
                {odds.recession.title}
                {odds.recession.ends ? ` Settles ${longDate(odds.recession.ends)}.` : ""}
              </p>
              <a href={odds.recession.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-footnote text-accent-text">
                Polymarket
              </a>
            </>
          ) : (
            <p className="mt-2 text-footnote text-text-secondary">{odds.problems.find((p) => /recession|Polymarket/.test(p)) ?? "Polymarket's markets could not be read."}</p>
          )}
        </div>
      </div>
      <p className="mt-2 px-4 text-footnote text-text-secondary">
        {demo ? "A fictional sample in the demo. " : `Read ${localMoment(odds.readAt)}. `}What traders pay for a yes, read as a chance; the markets&rsquo; prices, not the app&rsquo;s forecast. Beside it, the New York Fed&rsquo;s yield-curve model under Cycle signals. Not investment advice.
      </p>
    </section>
  );
}
