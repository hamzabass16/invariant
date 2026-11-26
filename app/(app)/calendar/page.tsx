import { CalendarDays } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import type { Route } from "next";
import Link from "next/link";

import { NoFigures } from "@/components/app/no-figures";
import { EconCalendar } from "@/components/markets/econ-calendar";
import { BeingRead, EventReports } from "@/components/markets/event-reports";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { deriveScreens } from "@/lib/screen-data";
import { countdown, daysBetween, type DatedItem } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { calendarView } from "@/lib/calendar-run";
import { foundEvents } from "@/lib/calendar-agent";
import { ECON_EVENTS } from "@/lib/econ-calendar";
import { eventOf, macroInProgress } from "@/lib/macro-report";
import { calendarFoundFor, earningsView, macroReportsFor, screen } from "@/lib/workspace";

export const metadata = { title: "Calendar · Invariant" };

/** The closes behind the history are read on a short budget; the read carries on after the response, within this. */
export const maxDuration = 300;

const KIND: Record<DatedItem["kind"], { label: string; tone: "info" | "warn" | "neutral" }> = {
  clock: { label: "Clock", tone: "info" },
  expiry: { label: "Expiry", tone: "warn" },
  maturity: { label: "Maturity", tone: "neutral" },
  report: { label: "Report", tone: "neutral" },
};

/**
 * Every date the methodology and the book carry: a clock from a rule on days
 * in a standing, since a valuation or to expiry; an option's expiry; a bond's
 * or a deposit's maturity; the next scheduled report. Then the one calendar
 * (Hamza, 27 Oct 2026): the releases, the central banks, the elections,
 * summits and deadlines and the followed companies' results in one calendar,
 * each with what it touches in the book and how the book took the same kind
 * of event before (lib/calendar-run.ts), and after each event a report of
 * how investors took it, from the day's reporting (lib/macro-report.ts).
 * Below them, the rules the person
 * checks themselves, which have no date. The person's own time.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const ws = await screen("overview");
  if (!ws.book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Calendar" />
        <PageBody>
          <NoFigures what="Dates" />
        </PageBody>
      </>
    );
  const today = localDay();
  const data = deriveScreens(
    {
      book: ws.book,
      methodology: ws.setup.methodology,
      inputs: ws.setup.inputs,
      shown: ws.shown,
      filings: ws.filings,
      decisions: ws.decisions,
      preferences: ws.preferences,
    },
    today,
  );
  const slots = data.slots("calendar");
  const [v, found] = slots.includes("economic_calendar") ? await Promise.all([earningsView(ws), calendarFoundFor(ws)]) : [null, null];
  const [macro, { event }] = await Promise.all([slots.includes("event_reports") ? macroReportsFor(ws) : null, searchParams]);
  const cal = v
    ? await calendarView({
        book: ws.book,
        methodology: ws.setup?.methodology ?? null,
        entries: v.entries,
        reports: v.file?.reports ?? [],
        expected: v.file?.expected,
        filings: ws.filings,
        contact: ws.mode === "demo" ? null : (ws.preferences.edgarContact ?? null),
        today,
        wait: "budget",
        found: foundEvents(found?.file ?? null),
        macroReports: macro?.file.reports ?? [],
      })
    : null;

  // What is being read now (Hamza, 28 Oct 2026): on the day in the month and as its own list above the reports.
  // The demo reads its own sample reports as of the moment the sample was read, since its days are moved to stay recent.
  const progress = !macro ? [] : ws.mode === "demo" ? macroInProgress(macro.file.reports.map((r) => eventOf(r)), macro.file, new Date(macro.file.updated)) : macroInProgress([...ECON_EVENTS, ...foundEvents(found?.file ?? null)], macro.file, new Date());
  const progressByDay = Object.fromEntries(progress.map((x) => [`${x.date}:${x.name}`, x.words]));

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Calendar" subtitle="Clocks from the rules, expiries and maturities on your own time; then the releases, central banks, elections, summits and your companies' results a week at a time, each with what it touches in your book and, once past, its report." />
      <PageBody>
        <BeingRead items={progress} />
        {slots.includes("economic_calendar") ? (
          <>
            <EconCalendar today={today} rows={ws.book.markets?.rows ?? []} book={ws.book} methodology={ws.setup?.methodology ?? null} view={cal} header="Events and results" className="mb-2" progress={progressByDay} />
            <p className="mb-8 px-4 text-footnote text-text-secondary">
              {found?.file.sentence ? `Calendar agent, ${found.file.ranAt ? longDate(found.file.ranAt.slice(0, 10)) : "last run"}: ${found.file.sentence} ` : "The Calendar agent looks three months ahead at the start of each month, with the AI, for the elections, summits and deadlines the table does not hold. "}
              <Link href={"/agents/calendar_agent" as Route} className="text-accent-text">
                Calendar agent
              </Link>
            </p>
          </>
        ) : null}
        {macro ? <EventReports reports={macro.file.reports} chosen={event ?? null} note={macro.error} demo={ws.mode === "demo"} /> : null}
        {slots.includes("dated") ? (
          <ListSection grid header="Dated" footer={data.dated.length ? "A clock is the day a rule's count of days reaches its limit for one holding; the rule's section is in parentheses." : undefined}>
            {data.dated.length ? (
              data.dated.map((d) => {
                const days = daysBetween(today, d.date);
                const when = `${longDate(d.date)} · ${countdown(days)}`;
                const tone = days < 0 ? "text-text-tertiary" : days <= 7 ? "text-warn" : "text-text-secondary";
                const value = <span className={`hidden lg:inline ${tone}`}>{when}</span>;
                const label = <span className="block whitespace-normal">{d.title}</span>;
                const detail = (
                  <>
                    {`${d.detail}${d.section && !d.detail.includes(`(${d.section})`) ? ` (${d.section})` : ""}`}
                    <span className={`data mt-0.5 block lg:hidden ${tone}`}>{when}</span>
                  </>
                );
                const leading = <StatusPill tone={KIND[d.kind].tone}>{KIND[d.kind].label}</StatusPill>;
                return d.symbol ? <ListLinkRow key={d.key} href={`/holdings/${encodeURIComponent(d.symbol)}` as Route} leading={leading} label={label} detail={detail} value={value} /> : <ListRow key={d.key} leading={leading} label={label} detail={detail} value={value} />;
              })
            ) : (
              <EmptyState icon={CalendarDays} title="Nothing dated yet" instruction="A rule on days in a standing, an option expiry, a bond or deposit maturity, or a scheduled report puts a date here." action={null} />
            )}
          </ListSection>
        ) : null}
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
