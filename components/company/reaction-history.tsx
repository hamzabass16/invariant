import { GroupedBars } from "@/components/charts/grouped-bars";
import { ListRow, ListSection } from "@/components/ui/list";
import { TIME_LABEL } from "@/lib/earnings";
import { historyWords, REACTION_HISTORY, type ReactionHistory } from "@/lib/reaction-history";
import { longDate, shortDate } from "@/lib/time";

const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/**
 * How the stock took each of its last results (lib/reaction-history.ts): the
 * move on the first session that traded on them beside SPY's, as bars and as
 * cards, and the summary in a sentence. The history is the closes; nothing is
 * forecast.
 */
export function ReactionHistorySection({ symbol, history, demo }: { symbol: string; history: ReactionHistory; demo: boolean }) {
  const rows = history.rows;
  const against = history.summary?.avgAgainstPct ?? null;
  return (
    <section className="mb-8" aria-labelledby="reactions">
      <h2 id="reactions" className="section-header mb-2 px-1">
        How the stock took its results
      </h2>
      {rows.length ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            <GroupedBars
              title={`The last ${rows.length} results`}
              subtitle="From the close before each release to the close of the first session that traded on it."
              groups={rows.map((r) => ({ key: r.date, label: r.quarter ? `${r.quarter} · ${shortDate(r.date)}` : shortDate(r.date), values: [r.movePct, r.benchmarkPct] }))}
              series={[
                { label: symbol, color: "var(--series-hcmp)" },
                { label: "SPY", color: "var(--series-spy)" },
              ]}
              format="signedPct1"
              tableCaption={`${symbol} and SPY on the session after each of the last ${rows.length} results`}
            />
            <div className="card px-4 py-4 lg:px-6">
              {history.summary ? <p className="text-body">{historyWords(history.summary)}</p> : null}
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-footnote text-text-secondary">Rose</dt>
                  <dd className="data text-title-3">{history.summary ? `${history.summary.up} of ${history.summary.count}` : "n/a"}</dd>
                </div>
                <div>
                  <dt className="text-footnote text-text-secondary">Average move</dt>
                  <dd className="data text-title-3">{history.summary ? `±${history.summary.avgAbsPct.toFixed(1)}%` : "n/a"}</dd>
                </div>
                <div>
                  <dt className="text-footnote text-text-secondary">Against SPY</dt>
                  <dd className={`data text-title-3 ${against ? (against > 0 ? "text-ok" : "text-danger") : ""}`}>{against === null ? "n/a" : `${against > 0 ? "+" : ""}${against.toFixed(1)} pts`}</dd>
                </div>
                <div>
                  <dt className="text-footnote text-text-secondary">Beyond the options&rsquo; price</dt>
                  <dd className="data text-title-3">{history.summary?.priced ? `${history.summary.beyondPriced} of ${history.summary.priced}` : "n/a"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-caption text-text-tertiary">Release days from the company&rsquo;s 8-Ks with results (item 2.02) and the reports kept after them; the moves from the daily closes. The options&rsquo; price is shown for the results it was read before.</p>
            </div>
          </div>
          <ListSection grid header={`${symbol}, result by result`} footer={history.note ?? undefined}>
            {rows.map((r) => (
              <ListRow
                key={r.date}
                wrap
                label={
                  <span>
                    {r.href ? (
                      <a href={r.href} target={r.href.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="hover:underline">
                        {r.quarter ? `${r.quarter}, ` : ""}
                        {longDate(r.date)}
                      </a>
                    ) : (
                      <>
                        {r.quarter ? `${r.quarter}, ` : ""}
                        {longDate(r.date)}
                      </>
                    )}
                    {r.time !== "unknown" ? <span className="text-text-secondary"> · {TIME_LABEL[r.time].toLowerCase()}</span> : null}
                  </span>
                }
                detail={[
                  r.benchmarkPct !== null ? `SPY ${signed(r.benchmarkPct)}, ${r.againstPct! >= 0 ? "+" : ""}${r.againstPct!.toFixed(1)} pts against it` : null,
                  r.pricedPct !== null ? `options priced ±${r.pricedPct.toFixed(1)}%` : null,
                  `first session ${longDate(r.session)}`,
                  r.why,
                ]
                  .filter(Boolean)
                  .join(". ")}
                value={<span className={r.movePct > 0 ? "text-ok" : r.movePct < 0 ? "text-danger" : ""}>{signed(r.movePct)}</span>}
              />
            ))}
          </ListSection>
        </>
      ) : (
        <p className="card px-4 py-3 text-footnote text-text-secondary">{history.note ?? (demo ? "The demo keeps no earlier results for this company." : `The last ${REACTION_HISTORY} results come from the company's 8-Ks with results and the daily closes; none could be set against the closes yet.`)}</p>
      )}
    </section>
  );
}
