import type { Route } from "next";
import Link from "next/link";

import { RecapNewsletter, ThemedNewsletters } from "@/components/markets/newsletter-cards";
import { ListSection } from "@/components/ui/list";
import { newslettersSince } from "@/lib/market-day";
import { recapNewslettersFor, type RecapChoice, type Recap } from "@/lib/market-recap";
import { digestDate, digestsOfWeek, isRecapDigest, isWeekendDay, recapToShow, type Digest } from "@/lib/newsletters";
import { longDate, shortDate } from "@/lib/time";

/**
 * "What happened" after the last session, in two sections (Hamza, 18 Oct
 * 2026). First the day's recap newsletter: the StockMKTNewz Daily Recap the
 * app guides people to (or any recap they forward), open from the start with
 * its screenshots of the day's stories, the opening performance pictures
 * folded away since the Dashboard draws the session itself; the week's
 * earlier recaps under a row; then the sources under a last row. The recap
 * their own Claude writes from the web opens After the close instead (Hamza,
 * 19 Oct 2026). Second, the week's other
 * newsletters by theme (the day's on a switch), each theme ranked by how
 * close it is to the theses, then the newest, with the ones not opened yet
 * marked unread. A newsletter is dated by its own date, so one forwarded on
 * Sunday is still Friday's. The recap shown is the newest written on a
 * trading weekday: on a weekend, Friday's, the weekend issues under it
 * (Hamza, 18 Oct 2026). The StockMKTNewz recap comes with the app: the
 * app's own inbox subscribes once and every person's Dashboard opens with
 * it, read on their own key (lib/shared-recap-run.ts), drawn with its
 * writer's name and sign-up page.
 */
export function WhatHappened({
  choice,
  session,
  today,
  digests,
  lettersError,
  recap,
  demo,
  weights,
  theses,
  readIds,
  sharedOn,
}: {
  choice: RecapChoice;
  session: string | null;
  /** Today on the person's clock (YYYY-MM-DD). */
  today: string;
  /** Every digest on file; the sections pick the week's and the day's. */
  digests: Digest[];
  lettersError: string | null;
  /** The recap their Claude wrote, drawn in After the close (Hamza, 19 Oct 2026); here it dates the section. */
  recap: { since: "close" | "latest"; recap: Recap } | null;
  demo: boolean;
  /** Each listed holding's weight in the book, percent, by symbol. */
  weights: Record<string, number>;
  /** The symbols with a thesis on file. */
  theses: readonly string[];
  /** The digests the person opened already. */
  readIds: readonly string[];
  /** Whether the app's own inbox is set up, so the shared recap can arrive at all. */
  sharedOn: boolean;
}) {
  const week = digestsOfWeek(digests, today);
  const since = newslettersSince(week, session);
  const recaps = week.filter(isRecapDigest);
  const { lead: todayRecap, earlier: earlierRecaps } = recapToShow(recaps);
  const weekend = isWeekendDay(today);
  const recapFresh = !weekend && todayRecap !== null && since.since === "close" && since.digests.some((d) => d.id === todayRecap.id);
  const others = week.filter((d) => !isRecapDigest(d));
  const dayOthers = since.digests.filter((d) => !isRecapDigest(d));
  const known = recapNewslettersFor(demo)[0];
  const recapName = known.name.replace(/ Daily Recap$/, "");
  const recapDay = todayRecap ? digestDate(todayRecap).slice(0, 10) : recap?.recap.session ?? null;
  // A recap newsletter shown from an earlier session dates the header by its own day, never "today" (Hamza, 23 Oct 2026).
  const fresh = todayRecap ? recapFresh : !weekend && recap?.since === "close";
  const header = fresh || !recapDay ? "What happened today" : `What happened · ${shortDate(recapDay)}`;
  const headerMeta = todayRecap ? `${todayRecap.sender}${recapFresh ? "" : `, ${longDate(recapDay!)}`}` : choice.newsletter ? recapName : null;

  return (
    <>
      <ListSection header={header} trailing={headerMeta ? <span className="data hidden text-footnote text-text-tertiary sm:inline">{headerMeta}</span> : undefined} footer="A recap newsletter is its writer's account of the day, not a verdict on your holdings. Not investment advice." className="mb-8">
        {headerMeta ? <p className="data px-4 pt-3 pb-1 text-footnote text-text-tertiary sm:hidden">{headerMeta}</p> : null}
        {choice.newsletter ? (
          todayRecap ? (
            <>
            {!recapFresh && !weekend && session && recapDay && recapDay < session ? <p className="px-4 pt-3 text-footnote text-text-secondary">The recap of {longDate(session)} has not arrived yet; this is the last one, {longDate(recapDay)}.</p> : null}
            <RecapNewsletter today={todayRecap} earlier={earlierRecaps} weights={weights} theses={theses} readIds={readIds} demo={demo} />
            </>
          ) : (
            <div className="px-4 py-3">
              {lettersError ? <p className="mb-1 text-footnote text-danger">{lettersError}</p> : null}
              <p className="text-subhead">{recaps.length && session ? `Only a weekend issue has arrived since the close of ${longDate(session)}; the next weekday's recap opens here.` : session ? `No recap newsletter has arrived since the close of ${longDate(session)}.` : "No recap newsletter has arrived yet."}</p>
              <p className="mt-1 text-footnote text-text-secondary">
                {sharedOn || demo
                  ? `The ${known.name} comes with the app: it arrives ${known.arrives} and its screenshots of the day's stories open here each weekday evening, read with the AI.`
                  : `Subscribe to the ${known.name} with your Gmail; the filter on the Newsletters card on Setup carries its sender and forwards it to your newsletters address. It arrives ${known.arrives} and its screenshots of the day's stories open here each weekday evening, read with the AI, apart from the Newsletters below.`}
              </p>
            </div>
          )
        ) : null}

        {choice.newsletter ? null : (
          <p className="px-4 py-3 text-footnote text-text-secondary">
            The recap newsletter is off. Where the recap comes from is chosen on{" "}
            <Link href={"/setup#newsletters" as Route} className="text-accent-text underline underline-offset-2">
              Setup, under Newsletters
            </Link>
            .
          </p>
        )}
      </ListSection>

      {choice.newsletter ? (
        <ListSection header="Newsletters" footer="The newsletters you forward, read with the AI into a few lines and their pictures each, by theme: the theme closest to your theses first, then the newest. A newsletter is its writer's argument, not a verdict on your holdings." className="mb-8">
          <ThemedNewsletters week={others} day={dayOthers} weights={weights} theses={theses} readIds={readIds} demo={demo} session={session} since={since.since} />
        </ListSection>
      ) : null}
    </>
  );
}
