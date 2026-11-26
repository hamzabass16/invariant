import type { Route } from "next";
import Link from "next/link";

import { EconMonth } from "@/components/markets/econ-month";
import type { CalendarView } from "@/lib/calendar-run";
import { ECON_EVENTS, ECON_KIND, econTableNote } from "@/lib/econ-calendar";
import { eventReaches, reachWords } from "@/lib/econ-exposure";
import type { Book } from "@/lib/holdings";
import type { Methodology } from "@/lib/methodology";
import { formatLevel, type MarketRow } from "@/lib/markets";
import { countdown, daysBetween, longDate } from "@/lib/time";

/**
 * The US releases, the major central banks' decisions and the elections
 * (lib/econ-calendar.ts) as a month grid
 * (Hamza, 23 Oct 2026; components/markets/econ-month.tsx), each day's
 * releases with the time in New York, what each is, the last reading the app
 * holds when it reads that indicator, and the publisher's schedule. No
 * consensus and no forecast.
 */
export function EconCalendar({
  today,
  rows,
  book = null,
  methodology = null,
  view = null,
  header = "Economic calendar",
  className,
  progress,
}: {
  today: string;
  rows: readonly MarketRow[];
  book?: Book | null;
  methodology?: Methodology | null;
  /** The one calendar (lib/calendar-run.ts): the events with the results and what the Calendar agent found, their reach and their history. */ view?: CalendarView | null;
  header?: string;
  className?: string;
  /** Events whose report is on its way or not final, by betKey. */
  progress?: Readonly<Record<string, string>>;
}) {
  const note = econTableNote(today);
  const readings: Record<string, string> = {};
  for (const k of Object.values(ECON_KIND)) {
    const row = k.indicator ? rows.find((r) => r.symbol === k.indicator) : null;
    if (row && k.indicator) readings[k.indicator] = `${formatLevel(row.level, row.unit)} (${longDate(row.asOf)})`;
  }
  // What each event ahead touches in the book, read once per kind of event and economy.
  const reach =
    view?.reach ??
    Object.fromEntries(
      Object.entries(
        eventReaches(
          ECON_EVENTS.filter((e) => e.date >= today),
          book,
          methodology,
        ),
      ).map(([k, r]) => [k, reachWords(r)]),
    );
  return (
    <section id="econ-calendar" className={className ?? "mb-8"}>
      <div className="mb-2 px-4">
        <h2 className="section-header">{header}</h2>
      </div>
      <EconMonth today={today} readings={readings} reach={reach} events={view?.events} sensitivity={view?.sensitivity} bets={view?.bets} progress={progress} links={view?.links} />
      {view?.notes.length ? <p className="mt-2 px-4 text-footnote text-warn">{view.notes.join(" ")}</p> : null}
      <p className="mt-2 px-4 text-footnote text-text-secondary">
        {`${note ? `${note} ` : ""}The US releases and the major central banks' decisions on their publishers' own schedules, each in its own local time, the national elections, summits and deadlines whose dates are set${view ? ", your companies' results on New York dates" : ""}. Under each, what it touches in your book: revenue reported there, holdings in its currency and your methodology's rules on what it moves.${view ? " Then how your book, at today's weights, and SPY moved on the session that traded each past occurrence, by what was decided; history, never a promise of the next reaction." : ""} The last reading is the app's own where it reads the figure; nothing here is a forecast.`}
      </p>
    </section>
  );
}

/**
 * Macro's calendar (Hamza, 27 Oct 2026: one Calendar page): the events of
 * the next two weeks as a list, and the way to the Calendar, where each
 * carries its reach and its history.
 */
export function NextOnCalendar({ today, days = 14, className }: { today: string; days?: number; className?: string }) {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const ahead = ECON_EVENTS.filter((e) => e.date >= today && e.date <= until);
  return (
    <section id="econ-calendar" className={className ?? "mb-8"}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-4">
        <h2 className="section-header">Next on the calendar</h2>
        <Link href={"/calendar" as Route} className="text-footnote text-accent-text">
          Calendar
        </Link>
      </div>
      <div className="card divide-y divide-hairline">
        {ahead.length ? (
          ahead.map((e) => (
            <div key={`${e.date}-${e.kind}-${e.name}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 text-body">
                {e.name}
                <span className="data ml-2 text-footnote text-text-tertiary">{e.time}</span>
              </span>
              <span className="data shrink-0 text-footnote text-text-secondary">{`${longDate(e.date)} · ${countdown(daysBetween(today, e.date))}`}</span>
            </div>
          ))
        ) : (
          <p className="px-4 py-3 text-footnote text-text-secondary">Nothing on the calendar in the next two weeks.</p>
        )}
      </div>
      <p className="mt-2 px-4 text-footnote text-text-secondary">The Calendar holds these beside your companies&apos; results, each with what it touches in your book and how your book took the same kind of event before.</p>
    </section>
  );
}
