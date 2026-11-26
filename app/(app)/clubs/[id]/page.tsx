import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { LineChart } from "@/components/charts/line-chart";
import { CLUB_CALIBRATION_DAYS, CLUB_ID, COURSE_PACK, DEFAULT_CASH, VOTE_ACT_DAYS, courseGrades, mentorsOnly, votesAndTrades, DEFAULT_MAX_WEIGHT_PCT, LEAGUE_MIN_ENTRIES, MAX_AGENDA, MAX_CLUB_WATCH, PITCH_BODY_MAX, REVIEW_WORDS, ROLE_WORDS, VOTES, VOTE_WORDS, alumniByYear, challengeResult, folderEmbedUrl, folderUrl, libraryByTicker, outcomeOf, runsClub, shareList, signedPct, stageOf, usd } from "@/lib/clubs";
import { clubCircle, clubCourse, clubPage, clubPicks, clubTreasuryView, clubWatchView, clubWork } from "@/lib/clubs-run";
import { companyHref } from "@/lib/company";
import { paragraphsOf } from "@/lib/theses";
import { cn } from "@/lib/utils";
import { localDay, longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

import { addBountyAction, addClubWatchAction, addPitchAction, answerChallengeAction, challengeAction, closeBountyAction, createCompetitionAction, createMeetingAction, deleteMeetingAction, deletePitchAction, dropClubWatchAction, leaveClubAction, minutesAction, removeMemberAction, renewInviteAction, reviewPitchAction, setLeagueAction, setRoleAction, treasuryAction, updateClubAction, voteAction, voteBountyAction } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${id} · Clubs · Invariant` };
}

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const TABS = [
  { id: "material", label: "Material" },
  { id: "competitions", label: "Competitions" },
  { id: "library", label: "Library" },
  { id: "meetings", label: "Meetings" },
  { id: "watchlist", label: "Watchlist" },
  { id: "treasury", label: "Treasury" },
  { id: "course", label: "Course" },
  { id: "members", label: "Members" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STAGE_WORDS = { upcoming: "Opens soon", open: "Open", ended: "Ended" } as const;
const STAGE_TONE = { upcoming: "info", open: "ok", ended: "neutral" } as const;

/**
 * One club (Hamza, 9 Nov 2026): its material from its own Google Drive
 * folder as Google draws it, its competitions, its members. The owner and
 * officers change the folder, start competitions, hand out the join code and
 * see the addresses to share the folder with.
 */
export default async function ClubPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!CLUB_ID.test(id)) notFound();
  const ws = await screen("overview");
  const page = await clubPage(ws.operator.email, id);
  if (!page) notFound();
  const demo = ws.mode === "demo";
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "material";
  const { club, role, members, competitions, invite } = page;
  const runs = runsClub(role);
  const today = localDay();
  const addresses = shareList(members);
  const work = tab === "library" || tab === "meetings" || tab === "treasury" ? await clubWork(ws.operator.email, id) : null;
  const picks = tab === "library" && work ? await clubPicks(work.pitches, today) : null;
  const treasury = tab === "treasury" ? await clubTreasuryView(ws.operator.email, id) : null;
  const acts = treasury?.treasury && work ? votesAndTrades(work.meetings, treasury.treasury.trades, today) : [];
  const course = tab === "course" && runs ? await clubCourse(ws.operator.email, id, competitions, today) : null;
  const circle = tab === "competitions" || tab === "members" ? await clubCircle(id) : null;
  const watch = tab === "watchlist" ? await clubWatchView(id, today) : null;
  const tone = (n: number | null) => (n === null ? "text-text-secondary" : n > 0 ? "text-ok" : n < 0 ? "text-danger" : "text-text-secondary");
  return (
    <>
      <PageHeader title={club.name} subtitle={`${ROLE_WORDS[role]} · ${members.length} ${members.length === 1 ? "member" : "members"}${club.about ? ` · ${club.about}` : ""}`} action={<Link href={"/clubs" as Route} className="text-subhead text-accent-text">All clubs</Link>} />
      <PageBody>
        <nav className="mb-5 flex w-fit max-w-full overflow-x-auto rounded-full border border-hairline p-0.5 [scrollbar-width:none]" aria-label="Club">
          {TABS.map((t) => (
            <a key={t.id} href={`/clubs/${id}${t.id === "material" ? "" : `?tab=${t.id}`}`} aria-current={t.id === tab ? "page" : undefined} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-footnote font-medium transition-colors", t.id === tab ? "bg-text text-bg" : "text-text-secondary hover:text-text")}>
              {t.id === "competitions" ? `${t.label} · ${competitions.length}` : t.id === "members" ? `${t.label} · ${members.length}` : t.label}
            </a>
          ))}
        </nav>

        {tab === "material" ? (
          <section aria-label="Club material" className="mb-8">
            {club.folderId ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
                  <a href={folderUrl(club.folderId)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">
                    Open in Drive
                  </a>
                  <p className="text-footnote text-text-secondary">Add a lecture, a deck or notes in Drive and it is here at once.</p>
                </div>
                {demo ? (
                  <ListSection footer="The demo's folder is fictional, so Google's view of it is not drawn. In your own copy this is the club's Drive folder, live.">
                    {["Lectures", "Guest Speakers", "Club Curriculum", "Agenda and Departments", "Club Charter"].map((f) => (
                      <ListRow key={f} label={f} detail={f.includes("Curriculum") || f.includes("Charter") ? "Document" : f.includes("Agenda") ? "Spreadsheet" : "Folder"} />
                    ))}
                  </ListSection>
                ) : (
                  <div className="card overflow-hidden">
                    <iframe src={folderEmbedUrl(club.folderId)} title={`${club.name}, the club's Drive folder`} className="block h-[70vh] min-h-[420px] w-full border-0 bg-white" loading="lazy" referrerPolicy="no-referrer" />
                  </div>
                )}
                <p className="mt-2 px-1 text-caption text-text-tertiary">Google draws the folder with your own Google sign-in; if it asks you to sign in or says you need access, ask the club&apos;s owner to share the folder with your address, or open it in Drive. The app never reads or changes the club&apos;s files.</p>
              </>
            ) : (
              <ListSection>
                <ListRow wrap label="No folder linked yet" detail={runs ? "Paste the address of the Drive folder the club keeps its material in, below." : "The club's owner or an officer links the Drive folder the club keeps its material in."} />
              </ListSection>
            )}
            {runs ? (
              <details className="card mt-4 px-4 py-3">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">{club.folderId ? "Change the club's details or folder" : "Link the club's Drive folder"}</summary>
                <ActionForm action={updateClubAction} label="Save" pendingLabel="Saving" doneLabel="Saved" className="pt-3 pb-1">
                  <input type="hidden" name="id" value={club.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-subhead">
                      Club name
                      <input name="club" className={field} maxLength={80} defaultValue={club.name} disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Google Drive folder
                      <input name="folder" className={`${field} data`} maxLength={300} defaultValue={club.folderId ? folderUrl(club.folderId) : ""} placeholder="https://drive.google.com/drive/folders/…" disabled={demo} />
                    </label>
                  </div>
                  <label className="mt-3 mb-3 block text-subhead">
                    A line about the club
                    <input name="about" className={field} maxLength={400} defaultValue={club.about ?? ""} disabled={demo} />
                  </label>
                </ActionForm>
              </details>
            ) : null}
          </section>
        ) : null}

        {tab === "competitions" ? (
          <>
            <ListSection header="Competitions" grid footer="Virtual money: each member who enters starts with the same cash, buys and sells listed tickers at the last close, and is ranked by return against SPY over the same days. Nothing is ever traded at a broker. Not investment advice.">
              {competitions.length ? (
                competitions.map((c) => {
                  const stage = stageOf(c, today);
                  return <ListLinkRow key={c.id} href={`/clubs/${id}/c/${c.id}` as Route} label={c.name} detail={`${longDate(c.starts)} to ${longDate(c.ends)} · ${usd(c.cash)} virtual${c.maxWeightPct ? ` · ${c.maxWeightPct}% a holding at most` : ""}${c.course ? " · coursework, graded on rules and reasons" : ""}${c.challengeId ? " · a challenge with another club" : ""}`} value={<StatusPill tone={STAGE_TONE[stage]}>{STAGE_WORDS[stage]}</StatusPill>} />;
                })
              ) : (
                <ListRow wrap label="No competition yet" detail={runs ? "Start one below." : "The club's owner or an officer starts one."} />
              )}
            </ListSection>
            {runs ? (
              <details className="card mb-8 px-4 py-3" open={!competitions.length}>
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Start a competition</summary>
                <ActionForm action={createCompetitionAction} label="Start" pendingLabel="Starting" doneLabel="Started" className="pt-3 pb-1">
                  <input type="hidden" name="id" value={club.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-subhead">
                      Name
                      <input name="name" className={field} maxLength={80} placeholder="Winter term challenge" required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Virtual cash each, in US dollars
                      <input name="cash" className={`${field} data`} inputMode="numeric" defaultValue={String(DEFAULT_CASH)} disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      First day
                      <input name="starts" type="date" className={`${field} data`} defaultValue={today} required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Last day
                      <input name="ends" type="date" className={`${field} data`} required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Largest holding, in percent (blank for no limit)
                      <input name="maxWeight" className={`${field} data`} inputMode="decimal" defaultValue={String(DEFAULT_MAX_WEIGHT_PCT)} disabled={demo} />
                    </label>
                  </div>
                  <label className="mt-3 block text-subhead">
                    The competition&apos;s own rules, for members (optional)
                    <input name="note" className={field} maxLength={400} placeholder="At least five holdings by the end; every trade needs a reason" disabled={demo} />
                  </label>
                  <div className="mt-3 mb-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-start gap-2 text-subhead">
                      <input type="checkbox" name="course" className="mt-1" disabled={demo} />
                      <span>Coursework: grade each entry out of 100 on its reasons (40), holdings against a minimum (30) and the weight limit kept (30), never on its return</span>
                    </label>
                    <label className="block text-subhead">
                      Fewest holdings, for the grade
                      <input name="minHoldings" className={`${field} data`} inputMode="numeric" defaultValue="5" disabled={demo} />
                    </label>
                  </div>
                </ActionForm>
              </details>
            ) : null}
          </>
        ) : null}

        {tab === "competitions" ? (
          <section className="card mb-8 px-4 py-4">
            <h2 className="section-header mb-1">The league</h2>
            <p className="text-subhead text-text-secondary">
              {page.league ? "The club is on the league: other clubs see its name, its line and its latest competition's median member against SPY, in percent." : "Put the club on the league and other clubs on this deployment see its name, its line and its latest competition's median member against SPY, in percent."} Never a member&apos;s name, trade or book; a competition counts once {LEAGUE_MIN_ENTRIES} members have entered.{" "}
              <Link href={"/clubs/league" as Route} className="text-accent-text">
                See the league
              </Link>
            </p>
            {runs ? (
              <ActionForm action={setLeagueAction} label={page.league ? "Take the club off the league" : "Put the club on the league"} variant="secondary" size="sm" doneLabel="Saved" className="mt-3">
                <input type="hidden" name="id" value={club.id} />
                {page.league ? null : <input type="hidden" name="league" value="on" />}
              </ActionForm>
            ) : null}
          </section>
        ) : null}

        {tab === "competitions" && circle ? (
          <>
            <ListSection header="Challenges with other clubs" grid footer={`Each club runs its own side as a competition on the same rules; the club whose median member does better against SPY leads, once both sides have ${LEAGUE_MIN_ENTRIES} entries. Only medians in percent cross between the clubs.`}>
              {circle.challenges.length ? (
                circle.challenges.map((ch) => {
                  const other = ch.side === "from" ? ch.toName : ch.fromName;
                  const r = challengeResult(ch.mine, ch.theirs);
                  const lead = r.leader === null ? "Waiting for three entries a side" : r.leader === "level" ? "Level" : (r.leader === "from") === (ch.side === "from") ? `You lead by ${r.gapPts!.toFixed(2)} pts` : `${other} leads by ${r.gapPts!.toFixed(2)} pts`;
                  return (
                    <div key={ch.id} className="block px-4 py-3">
                      <p className="font-medium">{ch.name}</p>
                      <p className="mt-0.5 text-footnote text-text-secondary">{`${ch.side === "from" ? "To" : "From"} ${other} · ${longDate(ch.starts)} to ${longDate(ch.ends)} · ${usd(ch.cash)} virtual${ch.maxWeightPct ? ` · ${ch.maxWeightPct}% a holding at most` : ""}`}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusPill tone={ch.status === "accepted" ? "ok" : ch.status === "declined" ? "neutral" : "info"}>{ch.status === "accepted" ? lead : ch.status === "declined" ? "Declined" : ch.side === "to" ? "Waiting for your answer" : "Waiting for their answer"}</StatusPill>
                        {ch.status === "accepted" && ch.competitionId ? <Link href={`/clubs/${id}/c/${ch.competitionId}` as Route} className="text-footnote text-accent-text">Your side</Link> : null}
                        {ch.status === "accepted" && ch.mine?.medianAgainstSpyPts != null ? <span className="data text-footnote text-text-secondary">You {ch.mine.medianAgainstSpyPts >= 0 ? "+" : ""}{ch.mine.medianAgainstSpyPts.toFixed(2)} pts{ch.theirs?.medianAgainstSpyPts != null ? `, them ${ch.theirs.medianAgainstSpyPts >= 0 ? "+" : ""}${ch.theirs.medianAgainstSpyPts.toFixed(2)} pts` : ""}</span> : null}
                      </div>
                      {runs && ch.side === "to" && ch.status === "pending" ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(["accept", "decline"] as const).map((a) => (
                            <ActionForm key={a} action={answerChallengeAction} label={a === "accept" ? "Accept" : "Decline"} variant={a === "accept" ? "primary" : "ghost"} size="sm" doneLabel={a === "accept" ? "Accepted" : "Declined"}>
                              <input type="hidden" name="id" value={club.id} />
                              <input type="hidden" name="challenge" value={ch.id} />
                              <input type="hidden" name="answer" value={a} />
                            </ActionForm>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <ListRow wrap label="No challenge yet" detail={runs ? "Challenge another club below, by the id its officers see here." : "The club's owner or an officer challenges another club."} />
              )}
            </ListSection>
            {runs ? (
              <details className="card mb-8 px-4 py-3">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Challenge another club</summary>
                <p className="pt-3 text-footnote text-text-secondary">
                  Your club&apos;s id, for another club to challenge you: <span className="data text-text">{club.id}</span>
                </p>
                <ActionForm action={challengeAction} label="Send the challenge" pendingLabel="Sending" doneLabel="Sent" className="pt-3 pb-1">
                  <input type="hidden" name="id" value={club.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-subhead">
                      The other club&apos;s id
                      <input name="to" className={`${field} data`} maxLength={40} placeholder="riverside-investment-club" required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Name (optional)
                      <input name="name" className={field} maxLength={80} placeholder="Spring term derby" disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      First day
                      <input name="starts" type="date" className={`${field} data`} defaultValue={today} required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Last day
                      <input name="ends" type="date" className={`${field} data`} required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Virtual cash each, in US dollars
                      <input name="cash" className={`${field} data`} inputMode="numeric" defaultValue={String(DEFAULT_CASH)} disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Largest holding, in percent
                      <input name="maxWeight" className={`${field} data`} inputMode="decimal" defaultValue={String(DEFAULT_MAX_WEIGHT_PCT)} disabled={demo} />
                    </label>
                  </div>
                  <div className="h-3" />
                </ActionForm>
              </details>
            ) : null}
          </>
        ) : null}

        {tab === "library" && work ? (
          <>
            <ListSection header="Thesis bounties" grid footer="An officer asks for the case on one ticker by a day; members write it into the library and vote the best, never their own.">
              {work.bounties.length ? (
                work.bounties.map((b) => (
                  <div key={b.id} className="block px-4 py-3">
                    <p className="font-medium">
                      <span className="data mr-2">{b.symbol}</span>
                      {b.question}
                    </p>
                    <p className="mt-0.5 text-footnote text-text-secondary">{b.winner ? `Closed · won by ${b.pitches.find((x) => x.id === b.winner)?.author ?? "a pitch since removed"}` : `Closes ${longDate(b.closes)} · ${b.pitches.length} ${b.pitches.length === 1 ? "pitch" : "pitches"}`}</p>
                    {b.pitches.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {b.pitches.map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-footnote">
                            <span>
                              {x.title} <span className="text-text-tertiary">· {x.author} · {x.votes} {x.votes === 1 ? "vote" : "votes"}</span>
                            </span>
                            {!b.winner ? (
                              <ActionForm action={voteBountyAction} label={b.mine === x.id ? "Your vote" : "Vote"} variant={b.mine === x.id ? "primary" : "secondary"} size="sm" doneLabel="Voted">
                                <input type="hidden" name="id" value={club.id} />
                                <input type="hidden" name="bounty" value={b.id} />
                                <input type="hidden" name="pitch" value={x.id} />
                              </ActionForm>
                            ) : x.id === b.winner ? (
                              <StatusPill tone="ok">Winner</StatusPill>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {runs && !b.winner && b.pitches.some((x) => x.votes > 0) ? (
                      <ActionForm action={closeBountyAction} label="Close and name the winner" variant="ghost" size="sm" doneLabel="Closed" className="mt-2">
                        <input type="hidden" name="id" value={club.id} />
                        <input type="hidden" name="bounty" value={b.id} />
                      </ActionForm>
                    ) : null}
                  </div>
                ))
              ) : (
                <ListRow wrap label="No bounty yet" detail={runs ? "Post one below." : "The club's owner or an officer posts one."} />
              )}
            </ListSection>
            {runs ? (
              <details className="card mb-8 px-4 py-3">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Post a bounty</summary>
                <ActionForm action={addBountyAction} label="Post" pendingLabel="Posting" doneLabel="Posted" className="pt-3 pb-1">
                  <input type="hidden" name="id" value={club.id} />
                  <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_180px]">
                    <label className="block text-subhead">
                      Ticker
                      <input name="symbol" className={`${field} data uppercase`} maxLength={10} placeholder="NVO" required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      The question
                      <input name="question" className={field} maxLength={200} placeholder="Is the GLP-1 price cut already in the price?" required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Closes
                      <input name="closes" type="date" className={`${field} data`} required disabled={demo} />
                    </label>
                  </div>
                  <div className="h-3" />
                </ActionForm>
              </details>
            ) : null}

            {picks && picks.rows.length ? (
              <section className="mb-8" aria-labelledby="picks">
                <h2 id="picks" className="section-header mb-2 px-1">How the library&apos;s picks did</h2>
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[520px] text-footnote">
                    <thead>
                      <tr className="border-b border-hairline text-left text-caption text-text-tertiary">
                        <th className="px-3 py-2 font-medium">Ticker</th>
                        <th className="px-3 py-2 font-medium">First pitched</th>
                        <th className="px-3 py-2 text-right font-medium">Since</th>
                        <th className="px-3 py-2 text-right font-medium">SPY</th>
                        <th className="px-3 py-2 text-right font-medium">Against SPY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {picks.rows.map((r) => (
                        <tr key={r.symbol} className="border-b border-hairline last:border-0">
                          <td className="data px-3 py-2 font-semibold">{r.symbol}</td>
                          <td className="px-3 py-2">{`${longDate(r.since)} · ${r.author}`}</td>
                          <td className={cn("data px-3 py-2 text-right", tone(r.movePct))}>{r.movePct === null ? "not read" : signedPct(r.movePct)}</td>
                          <td className="data px-3 py-2 text-right">{r.spyPct === null ? "not read" : signedPct(r.spyPct)}</td>
                          <td className={cn("data px-3 py-2 text-right", tone(r.againstPts))}>{r.againstPts === null ? "" : `${r.againstPts >= 0 ? "+" : ""}${r.againstPts.toFixed(1)} pts`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 px-1 text-caption text-text-tertiary">{`Each ticker's first pitch, from the close on its day to the close of ${picks.asOf ? longDate(picks.asOf) : "the last session"}, against SPY over the same days: ${picks.beat} of ${picks.judged} ahead. The club's record of judgement, not a recommendation.`}</p>
              </section>
            ) : null}

            {picks?.fund && picks.fund.points.length > 1 ? (
              <section className="mb-8" aria-label="The club's pick fund">
                <LineChart
                  title="The club's pick fund"
                  subtitle={`A virtual dollar in each ticker's first pitch at the close on its day, held since, beside a dollar in SPY on the same days: ${picks.fund.picks} picks, ${picks.fund.fundPct === null ? "not read" : signedPct(picks.fund.fundPct)} against SPY's ${picks.fund.spyPct === null ? "not read" : signedPct(picks.fund.spyPct)}.${picks.fund.unpriced.length ? ` Not priced: ${picks.fund.unpriced.join(", ")}.` : ""} Virtual and equal-weight, never anyone's money.`}
                  dates={picks.fund.points.map((x) => x.date)}
                  series={[
                    { key: "fund", label: "Pick fund", color: "var(--series-hcmp)", values: picks.fund.points.map((x) => x.fundPct) },
                    { key: "spy", label: "SPY", color: "var(--series-spy)", values: picks.fund.points.map((x) => x.spyPct) },
                  ]}
                  format="signedPct1"
                  baseline={0}
                  height={240}
                  tableCaption="The pick fund's and SPY's return on what was put in so far, by day"
                  tableEvery={10}
                />
              </section>
            ) : null}

            {picks && picks.calibration.length ? (
              <ListSection grid className="mb-8" header="Calibration board" footer={`Each author's pitches with a valuation at least ${CLUB_CALIBRATION_DAYS} days old: how often the price now sits between their bear and bull, and how far their base was from it at the median. It scores the judgement, never the pick's return.`}>
                {picks.calibration.map((r) => (
                  <ListRow key={r.author} wrap label={r.author} detail={`${r.judged} judged${r.waiting ? `, ${r.waiting} waiting` : ""}${r.medianBaseErrorPct === null ? "" : ` · base ${r.medianBaseErrorPct}% from the price at the median`}`} value={<span className="data">{r.withinPct === null ? "none judged yet" : `${r.withinPct}% within range`}</span>} />
                ))}
              </ListSection>
            ) : null}

            {work.pitches.length ? (
              libraryByTicker(work.pitches).map((g) => (
                <section key={g.symbol} className="mb-6" aria-label={g.symbol}>
                  <h2 className="section-header mb-2 px-1">
                    {demo ? g.symbol : (
                      <Link href={companyHref(g.symbol) as Route} className="hover:text-accent-text">
                        {g.symbol}
                      </Link>
                    )}{" "}
                    · {g.pitches.length} {g.pitches.length === 1 ? "pitch" : "pitches"}
                  </h2>
                  {g.pitches.map((p) => (
                    <article key={p.id} className="card mb-3 px-4 py-4">
                      <p className="font-semibold">{p.title}</p>
                      <p className="mt-0.5 text-caption text-text-tertiary">
                        {p.author}
                        {p.you ? " (you)" : ""} · {longDate(p.createdAt.slice(0, 10))}
                      </p>
                      {p.valuation ? <p className="data mt-1 text-footnote text-text-secondary">{`Bear ${usd(p.valuation.bear)} · base ${usd(p.valuation.base)} · bull ${usd(p.valuation.bull)} a share${p.valuation.price ? ` · ${usd(p.valuation.price)} on the day` : ""}`}</p> : null}
                      {paragraphsOf(p.body).map((x, i) => (
                        <p key={i} className="mt-2 text-body">
                          {x}
                        </p>
                      ))}
                      {(() => {
                        const rv = work.reviews[p.id];
                        return (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-2">
                            <span className="text-footnote text-text-secondary">{rv?.count ? `Evidence ${rv.average!.toFixed(1)} of 5 from ${rv.count} ${rv.count === 1 ? "review" : "reviews"}` : "Not reviewed yet"}{rv?.mine ? ` · yours ${rv.mine}` : ""}</span>
                            {(work.notes?.[p.id] ?? []).map((n, i) => (
                              <p key={i} className="w-full text-footnote text-text-secondary">{`${n.name}${n.alumnus ? ", alumni mentor" : ""} (${n.score} of 5): ${n.note}`}</p>
                            ))}
                            {!p.you ? (
                              <details className="text-footnote">
                                <summary className="cursor-pointer list-none text-accent-text">Review the evidence</summary>
                                <ActionForm action={reviewPitchAction} label="Keep the review" variant="secondary" size="sm" doneLabel="Kept" className="pt-2">
                                  <input type="hidden" name="id" value={club.id} />
                                  <input type="hidden" name="pitch" value={p.id} />
                                  <select name="score" className={field} defaultValue={String(rv?.mine ?? 3)} disabled={demo}>
                                    {[5, 4, 3, 2, 1].map((n) => (
                                      <option key={n} value={n}>{`${n}: ${REVIEW_WORDS[n]}`}</option>
                                    ))}
                                  </select>
                                  <textarea name="note" rows={2} maxLength={300} className={`${field} mt-2`} placeholder="A line on the evidence (optional), shown with your name" disabled={demo} />
                                  <p className="mt-1 mb-2 text-caption text-text-tertiary">Judge whether the claims are sourced and tested, never whether the stock went up.</p>
                                </ActionForm>
                              </details>
                            ) : null}
                          </div>
                        );
                      })()}
                      {p.you || runs ? (
                        <ActionForm action={deletePitchAction} label="Remove" variant="ghost" size="sm" doneLabel="Removed" className="mt-2">
                          <input type="hidden" name="id" value={club.id} />
                          <input type="hidden" name="pitch" value={p.id} />
                        </ActionForm>
                      ) : null}
                    </article>
                  ))}
                </section>
              ))
            ) : (
              <ListSection>
                <ListRow wrap label="No pitch yet" detail="Each member's case for a company is kept here by ticker, so the next cohort reads what this one argued." />
              </ListSection>
            )}
            <details className="card mb-8 px-4 py-3" open={!work.pitches.length}>
              <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Add a pitch</summary>
              <ActionForm action={addPitchAction} label="Add to the library" pendingLabel="Adding" doneLabel="Added" className="pt-3 pb-1">
                <input type="hidden" name="id" value={club.id} />
                <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <label className="block text-subhead">
                    Ticker
                    <input name="symbol" className={`${field} data uppercase`} maxLength={10} placeholder="MSFT" required disabled={demo} />
                  </label>
                  <label className="block text-subhead">
                    Title
                    <input name="title" className={field} maxLength={120} placeholder="Azure's margins are the case" required disabled={demo} />
                  </label>
                </div>
                {work.bounties.some((b) => !b.winner) ? (
                  <label className="mt-3 block text-subhead">
                    Written for a bounty (optional)
                    <select name="bounty" className={field} disabled={demo} defaultValue="">
                      <option value="">None</option>
                      {work.bounties.filter((b) => !b.winner).map((b) => (
                        <option key={b.id} value={b.id}>{`${b.symbol}: ${b.question}`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <fieldset className="mt-3 grid grid-cols-3 gap-3">
                  <legend className="mb-1 text-subhead">Your valuation a share, bear to bull (optional; judged on the calibration board after {CLUB_CALIBRATION_DAYS} days)</legend>
                  {(["bear", "base", "bull"] as const).map((k) => (
                    <label key={k} className="block text-footnote capitalize text-text-secondary">
                      {k}
                      <input name={k} inputMode="decimal" className={`${field} data`} maxLength={12} disabled={demo} />
                    </label>
                  ))}
                </fieldset>
                <label className="mt-3 mb-3 block text-subhead">
                  The case, in your words
                  <textarea name="body" className={`${field} min-h-36`} maxLength={PITCH_BODY_MAX} placeholder="What the company does, why now, what would prove you wrong" required disabled={demo} />
                </label>
              </ActionForm>
              <p className="mb-2 text-footnote text-text-tertiary">Shown to the club under your name in it. Not investment advice.</p>
            </details>
          </>
        ) : null}

        {tab === "meetings" && work ? (
          <>
            {work.meetings.length ? (
              work.meetings.map((m) => (
                <section key={m.id} className="card mb-4 px-4 py-4" aria-label={m.title}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-headline font-semibold">
                      {m.title}
                      {m.kind === "earnings" && m.symbol ? (
                        demo ? null : (
                          <Link href={companyHref(m.symbol) as Route} className="ml-2 text-footnote font-normal text-accent-text">
                            {m.symbol}&apos;s page and results
                          </Link>
                        )
                      ) : null}
                    </h2>
                    <span className="text-footnote text-text-secondary">
                      {longDate(m.day)} · {m.voters} {m.voters === 1 ? "member voted" : "members voted"}
                      {m.minutes ? " · minutes written, votes closed" : ""}
                    </span>
                  </div>
                  <ol className="mt-3 space-y-3">
                    {m.items.map((it, i) => {
                      const t = m.tallies[it.id] ?? { for: 0, against: 0, abstain: 0, mine: null };
                      const outcome = outcomeOf(t);
                      return (
                        <li key={it.id} className="rounded-control border border-hairline px-3 py-2.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-subhead">
                              <span className="data mr-2 text-text-tertiary">{i + 1}.</span>
                              {it.text}
                              {it.pitchId ? (
                                <a href={`/clubs/${id}?tab=library`} className="ml-2 text-footnote text-accent-text">
                                  The pitch
                                </a>
                              ) : null}
                            </p>
                            <StatusPill tone={outcome === "carried" ? "ok" : outcome === "not carried" ? "warn" : "neutral"}>
                              {outcome === "no votes" ? "No votes" : `${outcome === "carried" ? "Carried" : "Not carried"} · ${t.for} for, ${t.against} against${t.abstain ? `, ${t.abstain} abstain` : ""}`}
                            </StatusPill>
                          </div>
                          {!m.minutes ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {VOTES.map((v) => (
                                <ActionForm key={v} action={voteAction} label={t.mine === v ? `${VOTE_WORDS[v]} (your vote)` : VOTE_WORDS[v]} variant={t.mine === v ? "primary" : "secondary"} size="sm" doneLabel="Voted">
                                  <input type="hidden" name="id" value={club.id} />
                                  <input type="hidden" name="meeting" value={m.id} />
                                  <input type="hidden" name="item" value={it.id} />
                                  <input type="hidden" name="vote" value={v} />
                                </ActionForm>
                              ))}
                            </div>
                          ) : t.mine ? (
                            <p className="mt-1 text-caption text-text-tertiary">You voted {VOTE_WORDS[t.mine].toLowerCase()}.</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {m.minutes ? (
                    <div className="mt-4">
                      <h3 className="section-header mb-1">Minutes</h3>
                      {paragraphsOf(m.minutes).map((x, i) => (
                        <p key={i} className="mt-1 text-body">
                          {x}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {runs ? (
                    <details className="mt-4">
                      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-surface-2 px-3 text-subhead text-text-secondary">{m.minutes ? "Change the minutes" : "Write the minutes and close the votes"}</summary>
                      <ActionForm action={minutesAction} label="Keep the minutes" variant="secondary" size="sm" doneLabel="Kept" className="pt-3">
                        <input type="hidden" name="id" value={club.id} />
                        <input type="hidden" name="meeting" value={m.id} />
                        <label className="mb-3 block text-subhead">
                          Minutes
                          <textarea name="minutes" className={`${field} min-h-28`} maxLength={6000} defaultValue={m.minutes ?? ""} placeholder="Who presented, what was decided and why, what each officer does next" disabled={demo} />
                        </label>
                      </ActionForm>
                      <ActionForm action={deleteMeetingAction} label="Delete the meeting" variant="ghost" size="sm" doneLabel="Deleted" className="mt-2">
                        <input type="hidden" name="id" value={club.id} />
                        <input type="hidden" name="meeting" value={m.id} />
                      </ActionForm>
                    </details>
                  ) : null}
                </section>
              ))
            ) : (
              <ListSection>
                <ListRow wrap label="No meeting yet" detail={runs ? "Call one below: the agenda, then each member votes on each item and the minutes close it." : "The club's owner or an officer calls one; you vote on each item here."} />
              </ListSection>
            )}
            {runs ? (
              <details className="card mb-8 px-4 py-3" open={!work.meetings.length}>
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Call a meeting</summary>
                <ActionForm action={createMeetingAction} label="Call the meeting" pendingLabel="Calling" doneLabel="Called" className="pt-3 pb-1">
                  <input type="hidden" name="id" value={club.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-subhead">
                      Kind
                      <select name="kind" className={field} disabled={demo}>
                        <option value="committee">Investment committee</option>
                        <option value="earnings">Earnings night: read one company&apos;s results together, then vote</option>
                      </select>
                    </label>
                    <label className="block text-subhead">
                      Ticker, for an earnings night
                      <input name="symbol" className={`${field} data uppercase`} maxLength={10} placeholder="ASML" disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Title
                      <input name="title" className={field} maxLength={120} placeholder="Investment committee, week 6" disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Day
                      <input name="day" type="date" className={`${field} data`} defaultValue={today} required disabled={demo} />
                    </label>
                  </div>
                  <label className="mt-3 mb-3 block text-subhead">
                    {`The agenda, one item a line (at most ${MAX_AGENDA}); start a line with a ticker and a colon to tie it to the library's pitch`}
                    <textarea name="agenda" className={`${field} min-h-28`} maxLength={4000} placeholder={"MSFT: add to the club book\nNVO: sell, the thesis broke\nNext term's competition rules"} disabled={demo} />
                  </label>
                </ActionForm>
              </details>
            ) : null}
          </>
        ) : null}

        {tab === "watchlist" && watch ? (
          <>
            <ListSection header="The club's watchlist" grid footer={`Any member adds a ticker with a level below or above; when a close reaches it, every member is told on Notifications. At most ${MAX_CLUB_WATCH} tickers. Not investment advice.`}>
              {watch.items.length ? (
                watch.items.map((w) => (
                  <div key={w.symbol} className="block px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      {demo ? <span className="data font-semibold">{w.symbol}</span> : (
                        <Link href={companyHref(w.symbol) as Route} className="data font-semibold hover:text-accent-text">
                          {w.symbol}
                        </Link>
                      )}
                      <span className="data text-footnote text-text-secondary">{w.close === null ? "" : `$${w.close.toFixed(2)} at the close`}</span>
                    </div>
                    <p className="mt-0.5 text-footnote text-text-secondary">{[w.below !== null ? `below $${w.below}` : null, w.above !== null ? `above $${w.above}` : null].filter(Boolean).join(" · ") || "No level, watched only"}{` · added by ${w.addedBy}`}</p>
                    {w.note ? <p className="mt-1 text-footnote">{w.note}</p> : null}
                    {w.close !== null && ((w.below !== null && w.close <= w.below) || (w.above !== null && w.close >= w.above)) ? <StatusPill tone="warn">At its level</StatusPill> : null}
                    <ActionForm action={dropClubWatchAction} label="Take off" variant="ghost" size="sm" doneLabel="Taken off" className="mt-1">
                      <input type="hidden" name="id" value={club.id} />
                      <input type="hidden" name="symbol" value={w.symbol} />
                    </ActionForm>
                  </div>
                ))
              ) : (
                <ListRow wrap label="Nothing watched yet" detail="Add a ticker below; the club is told when its close reaches the level." />
              )}
            </ListSection>
            <details className="card mb-8 px-4 py-3" open={!watch.items.length}>
              <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">Add to the club&apos;s watchlist</summary>
              <ActionForm action={addClubWatchAction} label="Add" pendingLabel="Adding" doneLabel="Added" className="pt-3 pb-1">
                <input type="hidden" name="id" value={club.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-subhead">
                    Ticker
                    <input name="symbol" className={`${field} data uppercase`} maxLength={10} placeholder="SPOT" required disabled={demo} />
                  </label>
                  <label className="block text-subhead">
                    Tell us below, in US dollars
                    <input name="below" className={`${field} data`} inputMode="decimal" placeholder="445" disabled={demo} />
                  </label>
                  <label className="block text-subhead">
                    Tell us above, in US dollars
                    <input name="above" className={`${field} data`} inputMode="decimal" disabled={demo} />
                  </label>
                </div>
                <label className="mt-3 mb-3 block text-subhead">
                  Why it is watched (optional)
                  <input name="note" className={field} maxLength={200} placeholder="The pitch's entry range" disabled={demo} />
                </label>
              </ActionForm>
            </details>
          </>
        ) : null}

        {tab === "treasury" ? (
          <>
            {treasury?.treasury ? (
              <>
                <ListSection grid className="mb-8" header={`The club's book, held by ${treasury.treasury.holder} · ${longDate(treasury.treasury.asOf)}`} footer="Published from the treasurer's own book when they open the app: each holding's weight in percent and the trades by day and side, never an amount, a price or a share count.">
                  {treasury.treasury.weights.slice(0, 24).map((w) => (
                    <ListRow key={w.symbol} label={<span className="data">{w.symbol}</span>} value={<span className="data">{`${w.weightPct.toFixed(1)}%`}</span>} />
                  ))}
                  {!treasury.treasury.weights.length ? <ListRow wrap label="No listed holding" detail="The treasurer's book holds no stock or fund today." /> : null}
                </ListSection>
                <ListSection grid className="mb-8" header="Votes and trades" footer={`Each agenda item on a ticker with a result, against the treasury's trades in its direction within ${VOTE_ACT_DAYS} days of the meeting: followed, not acted on, traded against the vote or kept to it. The club's own discipline, read by the app.`}>
                  {acts.slice(0, 18).map((a) => (
                    <ListRow key={`${a.day}-${a.item}`} wrap label={<span><span className="data">{a.symbol}</span> · {a.item}</span>} detail={`${a.meeting}, ${longDate(a.day)} · ${a.outcome}${a.traded ? ` · ${a.side === "buy" ? "bought" : "sold"} ${longDate(a.traded)}` : ""}`} value={<StatusPill tone={a.verdict === "followed" || a.verdict === "kept to the vote" ? "ok" : a.verdict === "waiting" ? "info" : "warn"}>{a.verdict}</StatusPill>} />
                  ))}
                  {!acts.length ? <ListRow wrap label="No vote to set against a trade yet" detail="A meeting's item on a ticker, once voted, is read against the treasury's trades." /> : null}
                </ListSection>
                <ListSection grid className="mb-8" header="Trades this year">
                  {treasury.treasury.trades.slice(0, 12).map((t) => (
                    <ListRow key={`${t.day}-${t.symbol}-${t.side}`} label={<span>{t.side === "buy" ? "Bought" : "Sold"} <span className="data">{t.symbol}</span></span>} value={<span className="text-text-secondary">{longDate(t.day)}</span>} />
                  ))}
                  {!treasury.treasury.trades.length ? <ListRow wrap label="No trade in the past year" /> : null}
                </ListSection>
              </>
            ) : (
              <ListSection className="mb-8" header="Treasury">
                <ListRow wrap label={treasury?.linked ? "Linked; waiting for the treasurer to open the app" : "No treasury linked"} detail="When the club runs real money, the member whose own book holds it links it here. The club then sees its weights in percent and its trades by day, set against the meetings' votes; never an amount." />
              </ListSection>
            )}
            {!demo && !mentorsOnly(role) ? (
              <div className="mb-8 flex flex-wrap gap-3">
                {!treasury?.mine ? (
                  <ActionForm action={treasuryAction} label={treasury?.linked ? "Take over the treasury with my book" : "My book holds the club's money"} pendingLabel="Linking" doneLabel="Linked" variant="secondary" size="sm">
                    <input type="hidden" name="id" value={club.id} />
                  </ActionForm>
                ) : null}
                {treasury?.linked && (treasury.mine || runs) ? (
                  <ActionForm action={treasuryAction} label="Unlink the treasury" pendingLabel="Unlinking" doneLabel="Unlinked" variant="ghost" size="sm">
                    <input type="hidden" name="id" value={club.id} />
                    <input type="hidden" name="off" value="yes" />
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "course" ? (
          <>
            <ListSection grid className="mb-8" header="The course pack: a term, week by week" footer="For a university club or class: each week a topic, what to read in the app and the task that is graded. The instructor runs the competitions as coursework, and the grade reads the reasons, the holdings and the limit, never the return.">
              {COURSE_PACK.map((w) => (
                <ListLinkRow key={w.week} href={w.href as Route} label={`Week ${w.week}: ${w.topic}`} detail={`Read: ${w.read}. Task: ${w.task}`} />
              ))}
            </ListSection>
            {course ? (
              <section className="mb-8" aria-labelledby="grades">
                <h2 id="grades" className="section-header mb-2 px-1">Grades, for the instructor</h2>
                {course.columns.length ? (
                  <div className="card overflow-x-auto">
                    <table className="w-full min-w-[480px] text-footnote">
                      <thead>
                        <tr className="border-b border-hairline text-left text-caption text-text-tertiary">
                          <th className="px-3 py-2 font-medium">Student</th>
                          {course.columns.map((c) => (
                            <th key={c.id} className="px-3 py-2 text-right font-medium">{c.name}</th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium">Average</th>
                        </tr>
                      </thead>
                      <tbody>
                        {course.students.map((st) => (
                          <tr key={st.name} className="border-b border-hairline last:border-0">
                            <td className="px-3 py-2">{st.name}</td>
                            {st.grades.map((g, i) => (
                              <td key={i} className="data px-3 py-2 text-right">{g === null ? "" : g}</td>
                            ))}
                            <td className="data px-3 py-2 text-right font-semibold">{st.average ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="card px-4 py-4 text-subhead text-text-secondary">No competition is run as coursework yet: tick Course mode when you start one on Competitions.</p>
                )}
                <p className="mt-2 px-1 text-caption text-text-tertiary">Out of 100 per competition: reasons written, holdings held and the weight limit kept. Shown to the club&apos;s owner, officers and adviser alone.</p>
              </section>
            ) : null}
          </>
        ) : null}

        {tab === "members" ? (
          <>
            <ListSection header="Members" grid>
              {members.map((m) => (
                <ListRow key={`${m.name}-${m.joinedAt}`} wrap label={`${m.name}${m.you ? " (you)" : ""}`} detail={`${ROLE_WORDS[m.role]} · joined ${longDate(m.joinedAt.slice(0, 10))}${m.email ? ` · ${m.email}` : ""}`} />
              ))}
            </ListSection>

            {circle?.alumni.length ? (
              <section className="mb-8" aria-labelledby="alumni">
                <h2 id="alumni" className="section-header mb-2 px-1">Alumni</h2>
                <div className="card px-4 py-3">
                  {alumniByYear(circle.alumni).map((g) => (
                    <p key={g.year} className="py-1 text-subhead">
                      <span className="data mr-2 text-text-tertiary">{g.year}</span>
                      {g.people.map((a) => `${a.name}${a.role === "member" ? "" : ` (${ROLE_WORDS[a.role].toLowerCase()})`}`).join(", ")}
                    </p>
                  ))}
                </div>
                <p className="mt-2 px-1 text-caption text-text-tertiary">Past members who chose to be listed when they left, by the year they left.</p>
              </section>
            ) : null}

            {runs ? (
              <div className="mb-8 grid gap-4 lg:grid-cols-2">
                <section className="card px-4 py-4">
                  <h2 className="section-header mb-2">Bring members in</h2>
                  <p className="text-subhead text-text-secondary">Give this code to a member; they type it on Clubs. Anyone with it can join, so make a new one when it has gone further than the club.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="data rounded-control border border-hairline-strong bg-surface-2 px-3 py-1.5 text-title3 tracking-widest">{invite ?? "unreadable"}</span>
                    {invite ? <CopyButton text={invite} label="Copy the code" /> : null}
                  </div>
                  <ActionForm action={renewInviteAction} label="Make a new code" variant="secondary" size="sm" doneLabel="New code" className="mt-3">
                    <input type="hidden" name="id" value={club.id} />
                  </ActionForm>
                  {club.folderId ? (
                    <>
                      <p className="mt-4 text-subhead text-text-secondary">Then share the club&apos;s Drive folder with them: open it in Drive, press Share, and paste these addresses.</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <a href={folderUrl(club.folderId)} target="_blank" rel="noreferrer" className="text-subhead text-accent-text">Open the folder in Drive</a>
                        {addresses ? <CopyButton text={addresses} label={`Copy ${members.filter((m) => m.email).length} addresses`} /> : null}
                      </div>
                    </>
                  ) : null}
                </section>
                {role === "owner" ? (
                  <section className="card px-4 py-4">
                    <h2 className="section-header mb-2">Officers and members</h2>
                    <ActionForm action={setRoleAction} label="Save the role" variant="secondary" size="sm" doneLabel="Saved">
                      <input type="hidden" name="id" value={club.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-subhead">
                          Member
                          <select name="member" className={field} disabled={demo}>
                            {members.filter((m) => m.role !== "owner" && m.email).map((m) => (
                              <option key={m.email!} value={m.email!}>{m.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-subhead">
                          Role
                          <select name="role" className={field} disabled={demo}>
                            <option value="officer">Officer: links the folder, starts competitions, brings members in</option>
                            <option value="adviser">Faculty adviser: an officer&apos;s rights, shown as the club&apos;s adviser</option>
                            <option value="member">Member</option>
                            <option value="alumnus">Alumni mentor: reads the library and reviews pitches, never competes or votes</option>
                          </select>
                        </label>
                      </div>
                      <div className="h-3" />
                    </ActionForm>
                    <ActionForm action={removeMemberAction} label="Remove from the club" variant="ghost" size="sm" doneLabel="Removed" className="mt-4">
                      <input type="hidden" name="id" value={club.id} />
                      <label className="mb-3 block text-subhead">
                        Member to remove, with their entries
                        <select name="member" className={field} disabled={demo}>
                          {members.filter((m) => m.role !== "owner" && m.email).map((m) => (
                            <option key={m.email!} value={m.email!}>{m.name}</option>
                          ))}
                        </select>
                      </label>
                    </ActionForm>
                  </section>
                ) : null}
              </div>
            ) : null}

            <details className="card mb-8 px-4 py-3">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-surface-2 px-3 text-subhead text-text-secondary">{role === "owner" ? "Delete the club" : "Leave the club"}</summary>
              <ActionForm action={leaveClubAction} label={role === "owner" ? "Delete the club" : "Leave"} variant="danger" size="sm" doneLabel={role === "owner" ? "Deleted" : "Left"} doneHref="/clubs" className="pt-3 pb-1">
                <input type="hidden" name="id" value={club.id} />
                {role === "owner" ? (
                  <label className="mb-3 block text-subhead">
                    Type the club&apos;s name to delete it, its members&apos; places and every competition. The Drive folder is the club&apos;s and stays as it is.
                    <input name="confirm" className={field} maxLength={80} autoComplete="off" disabled={demo} />
                  </label>
                ) : (
                  <>
                    <p className="mb-3 text-subhead text-text-secondary">Your place and your entries in its competitions are deleted; your results are kept on your own record. Access to the Drive folder is the folder owner&apos;s to take away.</p>
                    {!mentorsOnly(role) ? (
                      <label className="mb-3 flex items-start gap-2 text-subhead">
                        <input type="checkbox" name="mentor" className="mt-1" disabled={demo} />
                        <span>Stay on as an alumni mentor instead: keep reading the library and reviewing pitches with a note, out of competitions and votes</span>
                      </label>
                    ) : null}
                    <label className="mb-3 flex items-start gap-2 text-subhead">
                      <input type="checkbox" name="alumni" className="mt-1" disabled={demo} />
                      <span>List me among the club&apos;s alumni: my name in the club and the years I was in it, never my address</span>
                    </label>
                  </>
                )}
              </ActionForm>
            </details>
          </>
        ) : null}
      </PageBody>
    </>
  );
}
