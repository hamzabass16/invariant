import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { CLUB_ID, COMPETITION_ID, fmtShares, gradeOf, signedPct, stageOf, usd } from "@/lib/clubs";
import { competitionPage } from "@/lib/clubs-run";
import { cn } from "@/lib/utils";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

import { enterCompetitionAction, tradeAction } from "../../../actions";

export const metadata = { title: "Competition · Clubs · Invariant" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const tone = (n: number | null) => (n === null ? "text-text-secondary" : n > 0 ? "text-ok" : n < 0 ? "text-danger" : "text-text-secondary");

/**
 * A club's virtual portfolio competition (Hamza, 9 Nov 2026): the
 * leaderboard against SPY, the member's own virtual book and the form to
 * trade at the last close. Virtual money; amounts here are the
 * competition's, marked public so stealth mode leaves them.
 */
export default async function CompetitionPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  if (!CLUB_ID.test(id) || !COMPETITION_ID.test(cid)) notFound();
  const ws = await screen("overview");
  const today = localDay();
  const view = await competitionPage(ws.operator.email, id, cid, today);
  if (!view) notFound();
  const demo = ws.mode === "demo";
  const { page, competition: c, board, judged, mine, asOf, problems } = view;
  const stage = stageOf(c, today);
  return (
    <>
      <PageHeader title={c.name} subtitle={`${page.club.name} · ${longDate(c.starts)} to ${longDate(c.ends)} · ${usd(c.cash)} virtual each${c.maxWeightPct ? ` · ${c.maxWeightPct}% a holding at most` : ""}`} action={<Link href={`/clubs/${id}?tab=competitions` as Route} className="text-subhead text-accent-text">The club</Link>} />
      <PageBody>
        <div data-public="">
          <div className="mb-4 flex flex-wrap items-center gap-3 px-1">
            <StatusPill tone={stage === "open" ? "ok" : stage === "upcoming" ? "info" : "neutral"}>{stage === "open" ? "Open" : stage === "upcoming" ? `Opens ${longDate(c.starts)}` : "Ended, the board is final"}</StatusPill>
            {asOf ? <span className="text-footnote text-text-secondary">At the close of {longDate(asOf)}</span> : <span className="text-footnote text-warn">Prices are not available on this deployment, so every holding is counted at its cost and no trade can fill.</span>}
            {c.note ? <span className="text-footnote text-text-secondary">Club rules: {c.note}</span> : null}
          </div>

          <section aria-labelledby="board" className="mb-8">
            <h2 id="board" className="section-header mb-2 px-1">Leaderboard</h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[620px] text-footnote">
                <thead>
                  <tr className="border-b border-hairline text-left text-caption text-text-tertiary">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Member</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="px-3 py-2 text-right font-medium">Return</th>
                    <th className="px-3 py-2 text-right font-medium">Against SPY</th>
                    <th className="px-3 py-2 text-right font-medium">Holdings</th>
                    <th className="px-3 py-2 text-right font-medium">Largest</th>
                    <th className="px-3 py-2 text-right font-medium">Trades with a reason</th>
                    {c.course ? <th className="px-3 py-2 text-right font-medium">Grade</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r, i) => (
                    <tr key={r.name} className={cn("border-b border-hairline last:border-0", r.you && "bg-accent-subtle")}>
                      <td className="data px-3 py-2 text-text-tertiary">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.name}{r.you ? " (you)" : ""}</td>
                      <td className="data px-3 py-2 text-right">{usd(r.value)}</td>
                      <td className={cn("data px-3 py-2 text-right", tone(r.returnPct))}>{signedPct(r.returnPct, 2)}</td>
                      <td className={cn("data px-3 py-2 text-right", tone(r.againstSpyPts))}>{r.againstSpyPts === null ? "no SPY close" : `${r.againstSpyPts >= 0 ? "+" : ""}${r.againstSpyPts.toFixed(2)} pts`}</td>
                      <td className="data px-3 py-2 text-right">{r.holdings}</td>
                      <td className="data px-3 py-2 text-right">{r.largestWeightPct.toFixed(1)}%</td>
                      <td className="data px-3 py-2 text-right">{r.reasoned} of {r.trades}</td>
                      {c.course ? (
                        <td className="data px-3 py-2 text-right" title={gradeOf(c, r)?.parts.join("; ")}>
                          {gradeOf(c, r)?.score ?? "no trades"}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  <tr className="text-text-secondary">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">SPY over the same days</td>
                    <td className="px-3 py-2" />
                    <td className={cn("data px-3 py-2 text-right", tone(board.spyPct))}>{board.spyPct === null ? "not read" : signedPct(board.spyPct, 2)}</td>
                    <td colSpan={c.course ? 5 : 4} />
                  </tr>
                </tbody>
              </table>
            </div>
            {!board.rows.length ? <p className="mt-2 px-1 text-footnote text-text-secondary">Nobody has entered yet.</p> : null}
            {c.course ? <p className="mt-2 px-1 text-footnote text-text-secondary">{`Coursework: each entry is graded out of 100 on the share of its trades with a reason (40), its holdings against the course's ${c.course.minHoldings} at least (30) and its largest holding within the limit (30), never on its return.`}</p> : null}
            {judged.count ? <p className="mt-2 px-1 text-footnote text-text-secondary">{`The reasons, judged: of ${judged.count} trades with a reason made before the last close, ${judged.right} were right against SPY since (${judged.share}%): a buy that beat SPY, a sale that then did worse. The thinking is scored, not one book's luck.`}</p> : null}
            <p className="mt-2 px-1 text-caption text-text-tertiary">Each virtual book at the last close (the close on the last day once it has ended), ranked by return on the starting cash; SPY from the close before the first day. A holding the price feed has no close for is counted at its cost and named.{board.rows.some((r) => r.unpriced.length) ? ` Unpriced: ${[...new Set(board.rows.flatMap((r) => r.unpriced))].join(", ")}.` : ""}{problems.length ? ` ${problems.slice(0, 3).join(" ")}` : ""}</p>
          </section>

          <section aria-labelledby="mine" className="mb-8">
            <h2 id="mine" className="section-header mb-2 px-1">Your virtual book</h2>
            {mine ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  <ListSection footer={`${usd(mine.value)} in all: ${usd(mine.cash)} cash and ${mine.positions.length} ${mine.positions.length === 1 ? "holding" : "holdings"}.`}>
                    {mine.positions.length ? (
                      mine.positions.map((p) => <ListRow key={p.symbol} label={<span className="data font-semibold">{p.symbol}</span>} detail={`${fmtShares(p.shares)} shares · cost ${usd(p.cost)}${p.price === null ? " · no close read" : ` · ${usd(p.shares * p.price)} at $${p.price.toFixed(2)}`}`} value={<span className="data">{p.weightPct.toFixed(1)}%</span>} />)
                    ) : (
                      <ListRow wrap label="All cash" detail="Buy below; every trade fills at the last close." />
                    )}
                  </ListSection>
                  <ListSection header="Your trades">
                    {mine.trades.length ? (
                      [...mine.trades].reverse().map((t, i) => <ListRow key={`${t.day}-${t.symbol}-${i}`} wrap label={`${t.side === "buy" ? "Bought" : "Sold"} ${fmtShares(t.shares)} ${t.symbol} at $${t.price.toFixed(2)}`} detail={`${longDate(t.day)} close${t.reason ? ` · ${t.reason}` : " · no reason given"}`} />)
                    ) : (
                      <ListRow label="No trades yet" />
                    )}
                  </ListSection>
                </div>
                <div className="card h-fit px-4 py-4">
                  <h3 className="section-header mb-2">Trade at the last close</h3>
                  <ActionForm action={tradeAction} label="Place the virtual trade" pendingLabel="Reading the close" doneLabel="Traded">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="competition" value={c.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-subhead">
                        Ticker
                        <input name="symbol" className={`${field} data uppercase`} maxLength={10} placeholder="MSFT" required disabled={demo || stage !== "open"} />
                      </label>
                      <label className="block text-subhead">
                        Buy or sell
                        <select name="side" className={field} disabled={demo || stage !== "open"}>
                          <option value="buy">Buy</option>
                          <option value="sell">Sell</option>
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block text-subhead">
                      Shares
                      <input name="shares" className={`${field} data`} inputMode="decimal" required disabled={demo || stage !== "open"} />
                    </label>
                    <label className="mt-3 block text-subhead">
                      Why, for the club to read
                      <input name="reason" className={field} maxLength={200} placeholder="Margins widening; under my 10% cap" disabled={demo || stage !== "open"} />
                    </label>
                    <p className="mt-3 mb-3 text-footnote text-text-tertiary">{demo ? "The demo's competition is fictional and read-only." : stage === "open" ? "Fills at the last close. No short selling, no margin" + (c.maxWeightPct ? `, and no holding past ${c.maxWeightPct}% of your book.` : ".") : "Trading is closed."}</p>
                  </ActionForm>
                </div>
              </div>
            ) : (
              <div className="card px-4 py-4">
                <p className="mb-3 text-subhead text-text-secondary">Enter with {usd(c.cash)} of virtual cash. Your name, your trades and their reasons are shown to the club; your own money is never part of it.</p>
                {stage === "ended" ? <p className="text-footnote text-text-tertiary">The competition has ended.</p> : (
                  <ActionForm action={enterCompetitionAction} label="Enter" doneLabel="Entered">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="competition" value={c.id} />
                  </ActionForm>
                )}
              </div>
            )}
          </section>
          <p className="mb-8 px-1 text-caption text-text-tertiary">Virtual money for learning; nothing is traded at a broker. Not investment advice.</p>
        </div>
      </PageBody>
    </>
  );
}
