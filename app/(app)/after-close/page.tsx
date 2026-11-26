import { Sunset } from "lucide-react";
import Link from "next/link";

import { SampleNote } from "@/components/app/sample-note";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { RefreshWhilePending } from "@/components/live/refresh";
import { WhatHappened } from "@/components/markets/what-happened";
import { CompanyNews } from "@/components/markets/company-news";
import { PodcastEpisodes } from "@/components/markets/podcast-episodes";
import { ExtendedHours } from "@/components/live/extended-hours";
import { extendedSubjects } from "@/lib/extended-hours";
import { episodesOfWeek, failedOfWeek } from "@/lib/podcasts";
import { companyNewsFor } from "@/lib/company-news-run";
import { freshness } from "@/lib/freshness";
import { CloseBrief } from "@/components/today/close-brief";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { isTradingHours, lastSession } from "@/lib/live";
import { closedBy } from "@/lib/market-day";
import { recapFor } from "@/lib/market-recap";
import { loadMarketDay } from "@/lib/markets-feed";
import { LISTED_FOR_DAY, ownerValueOf } from "@/lib/ontology";
import { deriveScreens } from "@/lib/screen-data";
import { sharedRecapOn } from "@/lib/shared-recap-run";
import { localDay, longDate } from "@/lib/time";
import { agentFeedbackFor, earningsFor, newslettersFor, podcastsFor, recapsFor, researchFor, screen, thesesFor } from "@/lib/workspace";
import { earningsSubjects } from "@/lib/earnings";

export const metadata = { title: "At the Close · Invariant" };

/** The first page after a close may start the session's read; the read carries on after the response, within this. */
export const maxDuration = 300;

/**
 * At the Close (Hamza, 18 Oct 2026), reached from Notifications:
 * the three cards that were on the Dashboard under the session. After the
 * close: what drove the last US session and why each listed holding rose,
 * fell or held flat, written by the person's own Claude after the close, a
 * move of 2% or more alerted. Company news and reports: the week's
 * headlines, filings and results reports for the holdings and the watchlist,
 * the newest first (Hamza, 19 Oct 2026). What happened today: the day's recap
 * newsletter with its pictures, then the Claude recap and its sources.
 * Newsletters: the week's other digests by theme, ranked by the theses and
 * the book. Podcasts: the episodes of the shows the person follows, written
 * up from their transcripts with a perspective on the book (Hamza, 20 Oct
 * 2026). Each is read on the person's own key; nothing of the book is
 * kept or logged. Before the open and after the close: each holding's and
 * watchlist company's pre-market or after-hours move, live while those
 * sessions trade (Hamza, 4 Nov 2026).
 */
export default async function AfterClosePage() {
  const ws = await screen("overview");
  const book = ws.book;
  const m = ws.setup.methodology;
  const today = localDay();
  const data = book ? deriveScreens({ book, methodology: m, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences, research: ws.research, alerts: ws.alerts, statements: ws.statements }, today) : null;
  const slots = data ? data.slots("after_close") : [];
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  // The demo shows its fictional recap whatever the choice; a person's own shows once they turn it on.
  const recapChoice = ws.mode === "demo" ? { ...ws.preferences.recap, claude: true } : ws.preferences.recap;

  // The listed holdings' share of the book, which ranks the newsletters by what they touch; nothing of it is kept or logged.
  const listed = new Map<string, { symbol: string; value: number }>();
  for (const h of book?.holdings ?? []) {
    if (!LISTED_FOR_DAY.has(h.assetClass)) continue;
    const got = listed.get(h.symbol.toUpperCase()) ?? { symbol: h.symbol, value: 0 };
    got.value += ownerValueOf(h, book!);
    listed.set(h.symbol.toUpperCase(), got);
  }
  const [session, recaps, letters, theses, news, podcasts, research, feedback, earningsFile] = await Promise.all([
    on("market_today") ? loadMarketDay() : null,
    (on("close_brief") && recapChoice.claude) || (on("market_today") && ws.preferences.recap.claude) ? recapsFor(ws) : null,
    on("market_today") && ws.preferences.recap.newsletter ? newslettersFor(ws) : null,
    // The theses on file rank What happened (lib/newsletters.ts rankDigests); a theses file that cannot be read ranks by the book alone.
    on("market_today") && ws.preferences.recap.newsletter ? thesesFor(ws).then((t) => Object.keys(t.file.bySymbol)).catch(() => [] as string[]) : ([] as string[]),
    // The week's news and reports for the holdings and the watchlist (Hamza, 19 Oct 2026); the results reports come from the earnings file, which cannot fail the section.
    on("company_news") && book ? earningsFor(ws).then((e) => e.file, () => null).then((file) => companyNewsFor(ws, file, today)) : null,
    on("podcasts") ? podcastsFor(ws) : null,
    // The Research Agent's findings on the same feed and the person's ratings of them (Hamza, 23 Oct 2026).
    on("company_news") && book ? researchFor(ws).then((r) => r.file, () => null) : null,
    on("company_news") && book ? agentFeedbackFor(ws).then((r) => r.file, () => null) : null,
    // Who reported or reports today, so their pre-market or after-hours move leads (Hamza, 4 Nov 2026); a file that cannot be read only loses the mark.
    on("extended_hours") && book ? earningsFor(ws).then((e) => e.file, () => null) : null,
  ]);
  const day = session?.day ?? null;
  const held = new Set((book?.holdings ?? []).map((h) => h.symbol.toUpperCase()));
  // The session the brief is about: the last closed one during the session, today's from the bell (its read lands at 16:20 New York and the recap follows), so the card never shows yesterday's as today's (Hamza, 17 Oct 2026).
  const briefSession = isTradingHours(new Date()) ? closedBy(new Date()) : lastSession(new Date());
  // The page's badge names that session, not the statement's date: the page is about the close (Hamza, 19 Oct 2026: it said 16 Oct after the 19 Oct close).
  const briefRecap = recaps ? recapFor(recaps.file, briefSession) : null;
  // Until the person's Claude has written the session's recap, the title says so, so a page still showing the close before is never taken for today's (Hamza, 19 Oct 2026).
  const writing = on("close_brief") && recapChoice.claude && ws.mode !== "demo" && ws.provider?.kind === "anthropic" && briefRecap?.since !== "close" && !recaps?.error;
  const subtitle = writing ? `Last close ${longDate(briefSession)} · The AI is writing its recap, which takes a few minutes after 16:35 in New York; the page shows it when done` : day ? `Last close ${longDate(briefSession)} · Written after the close with the AI` : "Read once a session has closed, 16:20 in New York";

  return (
    <>
      <PageHeader fresh={<ScreenFreshness kind="close" asOf={briefSession} />} title="At the Close" subtitle={subtitle} />
      <PageBody>
        {ws.error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{ws.error}</p> : null}
        {book && ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={book.asOf} /> : null}
        {!book || !data ? (
          <EmptyState
            icon={Sunset}
            title="No session to read yet"
            instruction="After the close and What happened appear here once the book is in and a US session has closed."
            action={
              <Link href="/setup" className={buttonStyles({ variant: "secondary" })}>
                See what to connect
              </Link>
            }
          />
        ) : (
          <>
            {on("close_brief") ? (
              <div data-tour="close-brief">
                <CloseBrief
                  choice={recapChoice}
                  lastClose={briefSession}
                  recap={briefRecap}
                  error={recaps?.error ?? null}
                  held={held}
                  claudeReady={ws.provider?.kind === "anthropic"}
                  demo={ws.mode === "demo"}
                  showcase={ws.showcase}
                  alertPct={ws.preferences.moveAlertPct}
                />
              </div>
            ) : null}
            {on("extended_hours") ? <ExtendedHours subjects={extendedSubjects(book, Object.keys(ws.records.bySymbol), earningsFile, today)} demo={ws.mode === "demo"} /> : null}
            {on("market_today") ? (
              <WhatHappened
                choice={ws.preferences.recap}
                session={day?.session ?? null}
                today={today}
                digests={letters?.file.digests ?? []}
                lettersError={letters?.error ?? null}
                recap={recaps ? recapFor(recaps.file, day?.session ?? null) : null}
                demo={ws.mode === "demo"}
                weights={data.netWorth > 0 ? Object.fromEntries([...listed.values()].map((l) => [l.symbol.toUpperCase(), (100 * l.value) / data.netWorth])) : {}}
                theses={theses}
                readIds={ws.preferences.newslettersRead}
                sharedOn={sharedRecapOn(ws.operator.email)}
              />
            ) : null}
            {news ? <CompanyNews items={news.items} problems={news.problems} today={today} held={held} companies={news.companies} fresh={ws.mode === "demo" ? null : freshness("hourly", today, today)} demo={ws.mode === "demo"} research={research ? { file: research, feedback, editable: true, symbols: earningsSubjects(book, ws.records.bySymbol, []).map((x) => x.symbol.toUpperCase()) } : undefined} /> : null}
            {podcasts ? (
              <PodcastEpisodes
                shows={podcasts.file.shows}
                episodes={episodesOfWeek(podcasts.file, today)}
                failed={failedOfWeek(podcasts.file, today)}
                hasModel={ws.mode === "demo" || ws.hasModelKey}
                demo={ws.mode === "demo"}
                error={podcasts.error}
              />
            ) : null}
            {session?.pending ? <RefreshWhilePending /> : null}
          </>
        )}
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
