import { FileText } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import Link from "next/link";
import type { Route } from "next";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { SampleNote } from "@/components/app/sample-note";
import { CHIP } from "@/components/earnings/calendar";
import { EarningsDecks } from "@/components/earnings/decks";
import { EarningsReportCard } from "@/components/earnings/report";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { latestReports, MONTH, monthOf, quarterWords, reportKey, undated } from "@/lib/earnings";
import { decksBy } from "@/lib/earnings-deck";
import { slotsOn } from "@/lib/screens";
import { SinceResults, type SinceSubject } from "@/components/live/extended-hours";
import { SINCE_RESULTS_DAYS } from "@/lib/extended-hours";
import { countdown, daysBetween, longDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { addedReads, addedSince, RESULTS_READ_DAYS, resultsToRead, thesisFor } from "@/lib/theses";
import { earningsView, screen, thesesFor } from "@/lib/workspace";

import { addEarningsAction, readResultsNowAction, removeEarningsAction } from "./actions";

export const metadata = { title: "Earnings · Invariant" };

/** The first page of a day reads about sixty days of the calendar; the read carries on after the response, within this. */
export const maxDuration = 300;

const field = "block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text uppercase placeholder:normal-case";

/**
 * Earnings: a month at a time, the day each holding, each watched symbol and
 * each company the person added reports, with the time of day; the next
 * reports in order, each an alert the day before; and the report after the
 * results, built from the filing, the methodology and the person's records
 * (lib/earnings.ts). New York dates.
 */
export default async function EarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ws = await screen("overview");
  const sp = await searchParams;
  const slots = slotsOn("earnings", ws.shown);
  const on = (id: (typeof slots)[number]) => slots.includes(id);
  const v = await earningsView(ws);
  const { today, entries, subjects } = v;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const month = pick("month") && MONTH.test(pick("month")!) ? pick("month")! : monthOf(today);
  const nextUp = entries.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))[0] ?? null;
  const missing = undated(subjects, entries, today);
  const reports = latestReports(v.file);
  const chosen = reports.find((r) => reportKey(r) === pick("report")) ?? reports.find((r) => r.status !== "waiting") ?? null;
  // The decks one company at a time, its latest embedded (Hamza, 15 Oct 2026).
  const decks = decksBy(v.file);
  const decksHref = (symbol: string) => `/earnings?month=${month}&deck=${encodeURIComponent(symbol)}#decks` as Route;
  const demo = ws.mode === "demo";
  // What the person's own Claude read after the results and wrote to the thesis (Hamza, 26 Oct 2026); the app reads no such source itself.
  const theses = on("earnings_reads") || on("earnings_reports") ? (await thesesFor(ws)).file : null;
  const toRead = on("earnings_reads") ? resultsToRead(v.file, theses, today) : [];
  const unread = toRead.filter((x) => !x.added.length).length;
  const sinceSubjects: SinceSubject[] = reports
    .filter((r) => (r.status === "release" || r.status === "complete") && r.release && daysBetween(r.date, today) <= SINCE_RESULTS_DAYS && (r.release.accepted || r.reaction))
    .map((r) => ({ symbol: r.symbol, name: r.name ?? r.symbol, date: r.date, href: `/earnings?month=${month}&report=${encodeURIComponent(reportKey(r))}#report`, accepted: r.release?.accepted ?? null, before: r.reaction ? { price: r.reaction.from.close, date: r.reaction.from.date } : null }));
  const chosenReads = chosen && theses && daysBetween(chosen.date, today) <= RESULTS_READ_DAYS ? addedReads(addedSince(thesisFor(theses, chosen.symbol), chosen.date)) : undefined;

  return (
    <>
      <PageHeader
        title="Earnings"
        fresh={<ScreenFreshness kind="daily" />}
        subtitle="When your holdings, your watchlist and the companies you add report, on New York dates, with an alert the day before; then a report after the results."
        action={!demo && on("earnings_reports") ? <ActionButton action={readResultsNowAction} label="Read results now" variant="secondary" /> : null}
      />
      <PageBody>
        {ws.book && ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={ws.book.asOf} /> : null}
        {v.pending ? <p className="mb-4 px-1 text-footnote text-text-secondary">{v.pending}</p> : null}
        {v.calendar?.problems.length ? <p className="mb-4 px-1 text-footnote text-warn">{v.calendar.problems.join(" ")}</p> : null}
        {v.calendar?.publishedTo && v.calendar.publishedTo < v.calendar.to ? <p className="mb-4 px-1 text-footnote text-text-tertiary">Nasdaq has published dates to {longDate(v.calendar.publishedTo)}; later ones appear as companies set them.</p> : null}
        {v.error ? <p className="mb-4 px-1 text-footnote text-danger">{v.error}</p> : null}

        {on("earnings_calendar") ? (
          <section className="mb-8" data-tour="earnings-calendar" id="day">
            <Link href={"/calendar#econ-calendar" as Route} className="card flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block text-body">{nextUp ? `Next: ${nextUp.symbol}, ${longDate(nextUp.date)} · ${countdown(daysBetween(today, nextUp.date))}` : "None of your companies has a date in the next ten weeks"}</span>
                <span className="mt-0.5 block text-footnote text-text-secondary">Every company&apos;s date is on the Calendar, in one calendar with the releases, central banks and elections, with how each took its past results.</span>
              </span>
              <span className="shrink-0 text-footnote text-accent-text">Calendar</span>
            </Link>
          </section>
        ) : null}

        {on("earnings_reports") ? (
          <section className="mb-8">
            <h2 className="section-header mb-2 px-1">After the results</h2>
            {/* The companies to choose from come first, the chosen report under them (Hamza, 19 Oct 2026). */}
            {reports.length > 1 || (reports.length && !chosen) ? (
              <nav className="mb-3 flex flex-wrap gap-2 px-1" aria-label="Results by company">
                {reports.map((r) => {
                  const shown = !!chosen && reportKey(chosen) === reportKey(r);
                  return (
                    <Link
                      key={reportKey(r)}
                      href={`/earnings?month=${month}&report=${encodeURIComponent(reportKey(r))}#report` as Route}
                      scroll={false}
                      aria-current={shown ? "page" : undefined}
                      title={`${r.headline} · ${longDate(r.date)}`}
                      className={cn("data inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-[10px] px-3 text-subhead font-medium transition-colors", shown ? "bg-accent text-white" : CHIP[r.kind], !shown && "hover:opacity-80")}
                    >
                      {r.symbol}
                      {r.quarter ? <span className={cn("ml-1.5 text-caption", shown ? "opacity-80" : "text-text-tertiary")}>{r.quarter.split("/")[0]}</span> : null}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
            {/* Beside the reports, how each has traded since its results came out, live before the open, in the session and after hours (Hamza, 4 Nov 2026). */}
            <SinceResults subjects={sinceSubjects} demo={demo} />
            {chosen ? <EarningsReportCard r={chosen} added={chosenReads} /> : null}
            {!reports.length ? (
              <div className="card">
                <EmptyState
                  icon={FileText}
                  title="No results yet"
                  instruction={
                    demo
                      ? "The demo's reports are fictional."
                      : "After a company on your calendar reports, the app reads its filing that evening and again each morning until the 10-Q is in: the figures, your methodology's tests and rules on them, your triggers and valuation, and, what the release and the call said."
                  }
                  action={null}
                />
              </div>
            ) : null}
            <p className="mt-2 px-1 text-caption text-text-tertiary">Figures from SEC filings, read with the SEC contact you confirmed on Setup; the verdicts from your methodology. Not investment advice.</p>
          </section>
        ) : null}

        {on("earnings_reads") ? (
          <ListSection
            grid
            id="reads"
            header="Read after the results"
            className="mb-8 scroll-mt-20"
            footer={
              <>
                {toRead.length ? `What was added to each thesis after its company's results in the past three weeks, by your own Claude or by you.${unread ? ` ${unread} with nothing added yet.` : ""} ` : "No followed company has released results in the past three weeks. "}
                The app reads each call itself and lays it on the report.
              </>
            }
          >
            {toRead.map((x) => {
              const last = x.added[0];
              return (
                <ListLinkRow
                  key={x.key}
                  href={`/earnings?month=${month}&report=${encodeURIComponent(x.key)}#report` as Route}
                  leading={<span className="data mt-0.5 inline-block min-w-[3.25rem] rounded-[6px] bg-surface-3 px-1.5 text-center text-footnote">{x.symbol}</span>}
                  label={x.name ?? x.symbol}
                  detail={last ? `${last.source}: ${last.summary.slice(0, 160)}${last.summary.length > 160 ? "…" : ""}` : `Reported ${longDate(x.date)}${x.quarter ? `, ${quarterWords(x.quarter)}` : ""}. Nothing read yet.`}
                  value={<span className={cn("data", x.added.length ? "text-accent-text" : "text-text-tertiary")}>{x.added.length ? `${x.added.length} read${x.added.length === 1 ? "" : "s"}` : "To read"}</span>}
                />
              );
            })}
          </ListSection>
        ) : null}

        {on("earnings_decks") ? <EarningsDecks groups={decks.all} chosen={pick("deck")?.toUpperCase() ?? null} hrefFor={decksHref} demo={ws.mode === "demo"} writes={ws.hasModelKey} today={today} /> : null}

        {on("earnings_add") ? (
          <ListSection header="Add a company" footer="Your listed holdings and your watchlist are on the calendar already. An added company has its dates and its reports, and nothing else.">
            <div className="px-4 py-3">
              <ActionForm action={addEarningsAction} label="Add" variant="secondary" className="flex items-start gap-2">
                <label className="sr-only" htmlFor="earnings-symbol">
                  Symbol
                </label>
                <input id="earnings-symbol" name="symbol" placeholder="Symbol, e.g. NVDA" autoComplete="off" autoCapitalize="characters" maxLength={15} className={cn(field, "min-w-0 flex-1")} />
              </ActionForm>
            </div>
            {ws.preferences.earnings.map((s) => (
              <ListRow
                key={s}
                label={<span className="data">{s}</span>}
                detail={entries.find((e) => e.symbol === s && e.date >= today) ? `Next: ${longDate(entries.find((e) => e.symbol === s && e.date >= today)!.date)}` : "No date in the next ten weeks"}
                value={
                  <ActionForm action={removeEarningsAction} label="Remove" variant="ghost" size="sm">
                    <input type="hidden" name="symbol" value={s} />
                  </ActionForm>
                }
              />
            ))}
          </ListSection>
        ) : null}

        {missing.length && v.calendar ? (
          <p className="mb-6 px-1 text-footnote text-text-tertiary">
            No date ahead in the next ten weeks for {missing.map((s) => s.symbol).join(", ")}. A company that has not set its next date, a listing outside the US, or a fund has none on the calendar.{" "}
            <Link href={"/watchlist" as Route} className="text-accent-text">
              Watchlist
            </Link>
          </p>
        ) : null}
        <p className="px-1 text-caption text-text-tertiary">Dates from the Nasdaq earnings calendar, read by date alone; nothing about you is sent. Not investment advice.</p>
      </PageBody>
    </>
  );
}
