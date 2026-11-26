import type { Route } from "next";
import { School } from "lucide-react";

import Link from "next/link";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { graduationSteps, ROLE_WORDS, recordSummary, signedPct } from "@/lib/clubs";
import { clubsList, myClubRecords } from "@/lib/clubs-run";
import { longDate } from "@/lib/time";
import { screen } from "@/lib/workspace";

import { createClubAction, forgetRecordsAction, joinClubAction } from "./actions";

export const metadata = { title: "Clubs · Invariant" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/**
 * Clubs (Hamza, 9 Nov 2026; a university club the first): the clubs the
 * person is in, a code to join one, and a form to start one from the Google
 * Drive folder its material already lives in.
 */
export default async function ClubsPage() {
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  const [{ available, error, clubs }, records] = await Promise.all([clubsList(ws.operator.email), myClubRecords(ws.operator.email)]);
  const summary = recordSummary(records);
  // The graduation path (Hamza, 9 Nov 2026): from a club to a book of one's own, shared and then taught.
  let sharing = demo;
  let listed = false;
  if (!demo && available) {
    try {
      const { myProfile, myListing } = await import("@/lib/registry");
      const [p, l] = await Promise.all([myProfile(ws.operator.email).catch(() => null), myListing(ws.operator.email).catch(() => null)]);
      sharing = !!p?.record;
      listed = !!l;
    } catch {
      sharing = false;
    }
  }
  const steps = graduationSteps({ clubs: clubs.length, ownBook: !!ws.book?.holdings.length, sharing, listed });
  return (
    <>
      <PageHeader title="Clubs" fresh={<ScreenFreshness />} subtitle="Your investment club's material from its own Google Drive folder, its members, and virtual portfolio competitions among them. Virtual money; nothing is traded." />
      <PageBody>
        {error ? <p className="mb-4 px-1 text-footnote text-danger">{error}</p> : null}
        {!available ? (
          <EmptyState icon={School} title="Not available on this deployment" instruction="Clubs need the deployment's registry (DATABASE_URL and REPORT_KEY); the operator sets it up. Everything else in the app works without it." action={null} />
        ) : (
          <>
            <ListSection header="Your clubs" grid footer={demo ? "The demo's club, its people and its folder are fictional. In your own copy the material page shows your club's real Drive folder." : undefined}>
              {clubs.length ? (
                clubs.map((c) => <ListLinkRow key={c.club.id} href={`/clubs/${c.club.id}` as Route} label={c.club.name} detail={`${ROLE_WORDS[c.role]} · ${c.members} ${c.members === 1 ? "member" : "members"}${c.club.about ? ` · ${c.club.about}` : ""}`} />)
              ) : (
                <ListRow wrap label="No club yet" detail="Join one with the code its owner or an officer gave you, or start one below." />
              )}
            </ListSection>

            <ListSection
              header="Your record"
              grid
              footer={
                records.length
                  ? `${summary.competitions} ${summary.competitions === 1 ? "competition" : "competitions"}${summary.medianAgainstSpyPts === null ? "" : `, the median ${summary.medianAgainstSpyPts >= 0 ? "+" : ""}${summary.medianAgainstSpyPts.toFixed(2)} pts against SPY`}${summary.reasonedPct === null ? "" : `, ${summary.reasonedPct}% of trades with a reason`}${summary.podiums ? `, ${summary.podiums} in the top three` : ""}. It stays yours when you leave a club or it closes; percent and ranks alone, never an amount.`
                  : "Each competition you enter is kept here in percent and rank, and stays yours when you leave a club or it closes."
              }
            >
              {records.length ? (
                records.map((r) => (
                  <ListRow
                    key={`${r.competitionId}`}
                    wrap
                    label={`${r.competition} · ${r.club}`}
                    detail={`${longDate(r.starts)} to ${longDate(r.ends)} · ${r.result.rank} of ${r.result.of} · ${r.result.reasoned} of ${r.result.trades} trades with a reason${r.current ? "" : " · kept after you left"}`}
                    value={<span className="data">{signedPct(r.result.returnPct, 2)}{r.result.againstSpyPts === null ? "" : ` (${r.result.againstSpyPts >= 0 ? "+" : ""}${r.result.againstSpyPts.toFixed(2)} pts)`}</span>}
                  />
                ))
              ) : (
                <ListRow wrap label="Nothing yet" detail="Enter a competition in one of your clubs." />
              )}
            </ListSection>
            <ListSection header="Your path" grid footer={`${steps.filter((s) => s.done).length} of ${steps.length} done. From learning in a club to running your own book, sharing the record it earns, and handing your rules on.`}>
              {steps.map((s, i) => (
                <ListLinkRow key={s.id} href={s.href as Route} label={`${i + 1}. ${s.label}`} detail={s.done ? "Done" : "Next"} />
              ))}
            </ListSection>
            <div className="mb-8 flex flex-wrap items-center gap-4 px-1">
              <Link href={"/clubs/league" as Route} className="text-subhead text-accent-text">
                The club league
              </Link>
              {records.some((r) => !r.current) && !demo ? <ActionButton action={forgetRecordsAction} label="Forget my kept record" variant="ghost" size="sm" doneLabel="Forgotten" /> : null}
            </div>

            <div className="mb-8 grid gap-4 lg:grid-cols-2">
              <section className="card px-4 py-4">
                <h2 className="section-header mb-2">Join a club</h2>
                <ActionForm action={joinClubAction} label="Join" pendingLabel="Joining" doneLabel="Joined">
                  <label className="block text-subhead">
                    The club&apos;s code
                    <input name="code" className={`${field} data uppercase`} maxLength={20} placeholder="K7Q2M9XW4T" autoComplete="off" required disabled={demo} />
                  </label>
                  <label className="mt-3 block text-subhead">
                    The name the club sees you as
                    <input name="name" className={field} maxLength={60} defaultValue={ws.operator.name ?? ""} required disabled={demo} />
                  </label>
                  <p className="mt-3 mb-3 text-footnote text-text-tertiary">The club&apos;s owner and officers see your sign-in address, so they can share the club&apos;s Drive folder with you; the other members see your name alone.</p>
                </ActionForm>
              </section>

              <section className="card px-4 py-4">
                <h2 className="section-header mb-2">Start a club</h2>
                <ActionForm action={createClubAction} label="Start the club" pendingLabel="Starting" doneLabel="Started">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-subhead">
                      Club name
                      <input name="club" className={field} maxLength={80} placeholder="Riverside Investment Club" required disabled={demo} />
                    </label>
                    <label className="block text-subhead">
                      Your name in it
                      <input name="name" className={field} maxLength={60} defaultValue={ws.operator.name ?? ""} required disabled={demo} />
                    </label>
                  </div>
                  <label className="mt-3 block text-subhead">
                    A line about the club (optional)
                    <input name="about" className={field} maxLength={400} placeholder="Student investment club: workshops, guest speakers and challenges" disabled={demo} />
                  </label>
                  <label className="mt-3 block text-subhead">
                    The club&apos;s Google Drive folder (optional)
                    <input name="folder" className={`${field} data`} maxLength={300} placeholder="https://drive.google.com/drive/folders/…" disabled={demo} />
                  </label>
                  <p className="mt-3 mb-3 text-footnote text-text-tertiary">Paste the address of the folder the club already keeps its lectures, decks and notes in. Members see it in the app with their own Google sign-in; the app never reads or changes it. Share the folder with members in Drive (the Members tab lists their addresses to paste).</p>
                </ActionForm>
              </section>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
