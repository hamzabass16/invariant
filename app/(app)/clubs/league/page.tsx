import type { Route } from "next";
import Link from "next/link";

import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { FINALISTS, LEAGUE_MIN_ENTRIES, signedPct } from "@/lib/clubs";
import { clubLeague } from "@/lib/clubs-run";
import { cn } from "@/lib/utils";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "League · Clubs · Invariant" };

const tone = (n: number | null) => (n === null ? "text-text-secondary" : n > 0 ? "text-ok" : n < 0 ? "text-danger" : "text-text-secondary");
const pts = (n: number | null) => (n === null ? "no SPY close" : `${n >= 0 ? "+" : ""}${n.toFixed(2)} pts`);

/**
 * The league (the business plan's moat list, 9 Nov 2026): every club that
 * chose to show, by its newest competition's median member against SPY. A
 * club's percent and counts alone, never a member's name or an amount.
 */
export default async function LeaguePage() {
  const ws = await screen("overview");
  const today = localDay();
  const { available, rows, season, error } = await clubLeague(today);
  return (
    <>
      <PageHeader title="Club league" subtitle="Clubs that chose to show, ranked by their newest competition: the median member's return against SPY over the same days. Virtual money." action={<Link href={"/clubs" as Route} className="text-subhead text-accent-text">Clubs</Link>} />
      <PageBody>
        {error ? <p className="mb-4 px-1 text-footnote text-danger">{error}</p> : null}
        {!available ? (
          <p className="px-1 text-body text-text-secondary">The league needs the deployment&apos;s registry, which this deployment does not have.</p>
        ) : (
          <>
          {season ? (
            <section aria-labelledby="season" className="mb-8">
              <h2 id="season" className="section-header mb-2 px-1">{`The ${season.season.id} season · ${season.stage === "regular" ? "regular season" : season.stage === "final" ? "final round" : "over"}`}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {([["Regular season", season.regular, `${longDate(season.season.starts)} to ${longDate(season.season.finalFrom)}`], ["Final round", season.final, `From ${longDate(season.season.finalFrom)} to ${longDate(season.season.ends)}, the top ${FINALISTS} alone`]] as const).map(([title, list, when]) => (
                  <div key={title} className="card px-4 py-4">
                    <p className="font-semibold">{title}</p>
                    <p className="mb-2 text-caption text-text-tertiary">{when}</p>
                    {list.length ? (
                      <ol className="space-y-1.5 text-footnote">
                        {list.map((r, i) => (
                          <li key={r.clubId} className="flex items-baseline justify-between gap-3">
                            <span>
                              <span className="data mr-2 text-text-tertiary">{i + 1}</span>
                              {r.club}
                              {title === "Regular season" && season.finalists.includes(r.clubId) ? <span className="ml-2 text-caption text-accent-text">finalist</span> : null}
                              <span className="block pl-5 text-caption text-text-tertiary">{`${r.competition} · ${r.entries} entries`}</span>
                            </span>
                            <span className={cn("data", tone(r.againstSpyPts))}>{pts(r.againstSpyPts)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-footnote text-text-secondary">{title === "Final round" && season.stage === "regular" ? `The top ${FINALISTS} of the regular season meet here from ${longDate(season.season.finalFrom)}.` : "No competition counted yet."}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 px-1 text-caption text-text-tertiary">The inter-university season runs September to June: each club&apos;s best competition started in the regular season by its median member against SPY, then the finalists&apos; competitions started in May and June. Clubs on the league alone; virtual money.</p>
            </section>
          ) : null}
          <section aria-labelledby="league" className="mb-8">
            <h2 id="league" className="section-header mb-2 px-1">The table</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-footnote">
                <thead>
                  <tr className="border-b border-hairline text-left text-caption text-text-tertiary">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Club</th>
                    <th className="px-3 py-2 font-medium">Competition</th>
                    <th className="px-3 py-2 text-right font-medium">Entries</th>
                    <th className="px-3 py-2 text-right font-medium">Median return</th>
                    <th className="px-3 py-2 text-right font-medium">Median against SPY</th>
                    <th className="px-3 py-2 text-right font-medium">Best</th>
                    <th className="px-3 py-2 text-right font-medium">As of</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.clubId} className="border-b border-hairline last:border-0">
                      <td className="data px-3 py-2 text-text-tertiary">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.club}</span>
                        {r.about ? <span className="block text-caption text-text-tertiary">{r.about}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        {r.competition}
                        <span className="ml-2 inline-block align-middle">
                          <StatusPill tone={r.summary.final ? "neutral" : "ok"}>{r.summary.final ? "Final" : "Running"}</StatusPill>
                        </span>
                      </td>
                      <td className="data px-3 py-2 text-right">{r.summary.entries}</td>
                      <td className={cn("data px-3 py-2 text-right", tone(r.summary.medianReturnPct))}>{r.summary.medianReturnPct === null ? "none" : signedPct(r.summary.medianReturnPct, 2)}</td>
                      <td className={cn("data px-3 py-2 text-right", tone(r.summary.medianAgainstSpyPts))}>{pts(r.summary.medianAgainstSpyPts)}</td>
                      <td className="data px-3 py-2 text-right">{r.summary.bestReturnPct === null ? "none" : signedPct(r.summary.bestReturnPct, 2)}</td>
                      <td className="data px-3 py-2 text-right">{longDate(r.summary.asOf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length ? <p className="mt-2 px-1 text-footnote text-text-secondary">No club is on the league yet. An owner or officer puts their club on it from the club&apos;s Competitions tab.</p> : null}
            <p className="mt-2 px-1 text-caption text-text-tertiary">
              Each club&apos;s newest competition with at least {LEAGUE_MIN_ENTRIES} entries, read whenever a member opens its board. The median member is used so no one book decides a club&apos;s place; members&apos; names and amounts are never shown here.{ws.mode === "demo" ? " The demo's clubs are fictional." : ""}
            </p>
          </section>
          </>
        )}
      </PageBody>
    </>
  );
}
