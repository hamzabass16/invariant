"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { StatusPill } from "@/components/ui/status";
import { ECON_EVENTS, ECON_FURTHEST, linkKey, reachKey, type EconArea, type EconEvent, type EconKind, type EventLink } from "@/lib/econ-calendar";
import { betKey, type BetView } from "@/lib/event-odds";
import type { SensitivityView } from "@/lib/event-sensitivity";
import { addDaysTo, countdown, daysBetween, longDate, mondayOf, monthGrid, shiftMonth, shortDate, weekDays } from "@/lib/time";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A release's short name on its chip; an election names its country. */
const SHORT: Record<Exclude<EconKind, "election" | "summit" | "deadline" | "earnings">, string> = {
  opec: "OPEC+",
  fomc: "Fed",
  jobs: "Jobs",
  cpi: "CPI",
  ppi: "PPI",
  jolts: "JOLTS",
  gdp: "GDP",
  pce: "PCE",
  ecb: "ECB",
  boe: "BoE",
  boj: "BoJ",
  boc: "BoC",
  snb: "SNB",
};
const VOTE: Record<EconArea, string> = {
  us: "US vote",
  euro: "EU vote",
  uk: "UK vote",
  japan: "JP vote",
  canada: "CA vote",
  switzerland: "CH vote",
  france: "FR vote",
  mexico: "MX vote",
  israel: "IL vote",
  argentina: "AR vote",
  china: "CN vote",
  world: "Vote",
};
const shortOf = (e: EconEvent) => (e.kind === "election" ? VOTE[e.area] : e.kind === "summit" || e.kind === "deadline" || e.kind === "earnings" ? (e.short ?? e.name) : SHORT[e.kind]);
/** Five groups, one look each: the Fed in the accent, the other central banks outlined in it, prices on a raised surface, jobs and growth in outline, elections and summits in gilt. */
type Group = "fed" | "banks" | "prices" | "growth" | "votes" | "results";
const GROUP: Record<EconKind, Group> = {
  fomc: "fed",
  ecb: "banks",
  boe: "banks",
  boj: "banks",
  boc: "banks",
  snb: "banks",
  cpi: "prices",
  ppi: "prices",
  pce: "prices",
  jobs: "growth",
  jolts: "growth",
  gdp: "growth",
  election: "votes",
  summit: "votes",
  deadline: "votes",
  opec: "prices",
  earnings: "results",
};
// Each kind of date in its own hue (Hamza, 11 Nov 2026: "colorize the calendar"), a tint with the hue's ring and ink, so the kind reads at a glance; the legend below names them.
const CHIP: Record<Group, string> = {
  fed: "bg-[color-mix(in_oklab,var(--cat-1)_20%,transparent)] text-[var(--cat-1)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--cat-1)_50%,transparent)]",
  banks: "bg-[color-mix(in_oklab,var(--cat-2)_20%,transparent)] text-[var(--cat-2)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--cat-2)_50%,transparent)]",
  prices: "bg-[color-mix(in_oklab,var(--cat-3)_20%,transparent)] text-[var(--cat-3)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--cat-3)_50%,transparent)]",
  growth: "bg-[color-mix(in_oklab,var(--cat-4)_20%,transparent)] text-[var(--cat-4)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--cat-4)_50%,transparent)]",
  votes: "bg-[color-mix(in_oklab,var(--cat-5)_20%,transparent)] text-[var(--cat-5)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--cat-5)_50%,transparent)]",
  results: "bg-[color-mix(in_oklab,var(--cat-6)_20%,transparent)] text-[var(--cat-6)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--cat-6)_50%,transparent)]",
};
const GROUP_LABEL: Record<Group, string> = {
  fed: "The Fed",
  banks: "Other central banks",
  prices: "Prices",
  growth: "Jobs and growth",
  votes: "Elections, summits and deadlines",
  results: "Results",
};

const key = (e: EconEvent) => `${e.date}-${e.kind}-${e.name}`;

/**
 * The calendar as a month (Hamza, 23 Oct 2026: a calendar grid; 27 Oct 2026:
 * one calendar for the releases, the central banks, the elections, summits
 * and deadlines and the followed companies' results): Monday to Friday, the
 * whole week in a month with a weekend event, each day with its events as
 * chips; a day opens its events under the grid with the time, what each is,
 * the last reading the app holds, its page, what it touches in the book and
 * how the book took the same kind of event before. A week by default, the
 * month on the switch (Hamza, 6 Nov 2026); back to the earliest event with a
 * report, whose chip opens it, on to the last the events reach. Nothing here
 * is a forecast.
 */
export function EconMonth({
  today,
  readings,
  reach = {},
  events = ECON_EVENTS,
  sensitivity = {},
  bets = {},
  progress = {},
  links = {},
}: {
  today: string;
  readings: Readonly<Record<string, string>>;
  /** What each kind of event in each economy touches in the book, as sentences, by reachKey. */
  reach?: Readonly<Record<string, readonly string[]>>;
  /** The events drawn; the fixed table when none are given. */
  events?: readonly EconEvent[];
  /** How the book took the same kind of event before, by reachKey. */
  sensitivity?: Readonly<Record<string, SensitivityView>>;
  /** What the prediction markets bet on each event, by betKey, or why none is shown. */
  bets?: Readonly<Record<string, { bet: BetView | null; note: string }>>;
  /** An event whose report is on its way or not final yet, by betKey: what is happening (Hamza, 28 Oct 2026). */
  progress?: Readonly<Record<string, string>>;
  /** What an event opens once it has a report, by linkKey (Hamza, 6 Nov 2026). */
  links?: Readonly<Record<string, EventLink>>;
}) {
  const first = today.slice(0, 7);
  const last = [ECON_FURTHEST, ...events.map((e) => e.date)].reduce((a, b) => (b > a ? b : a));
  // Back as far as the earliest event with a report to open (Hamza, 6 Nov 2026: a past result opens its report).
  const earliest = [today, ...events.filter((e) => links[linkKey(e)]).map((e) => e.date)].reduce((a, b) => (b < a ? b : a));
  const next = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
  // A week by default (Hamza, 6 Nov 2026), the month on the switch.
  const [view, setView] = React.useState<"week" | "month">("week");
  const [month, setMonth] = React.useState(first);
  const [monday, setMonday] = React.useState(mondayOf(today));
  const [day, setDay] = React.useState<string | null>(next && mondayOf(next) === mondayOf(today) ? next : today);
  const byDay = React.useMemo(() => {
    const m = new Map<string, EconEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);
  const groups = new Set(events.map((e) => GROUP[e.kind]));
  const onWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  // A month or week with something on a Saturday or Sunday (an election) shows the whole week.
  const weekends = view === "month" ? events.some((e) => e.date.startsWith(month) && onWeekend(e.date)) : weekDays(monday, true).some((d) => onWeekend(d) && byDay.has(d));
  const weeks = view === "month" ? monthGrid(month, weekends) : [weekDays(monday, weekends)];
  const cols = weekends ? "grid-cols-7" : "grid-cols-5";
  const days = weekDays(monday, weekends);
  const label = view === "month" ? `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : `${shortDate(days[0])} to ${shortDate(days[days.length - 1])} ${days[days.length - 1].slice(0, 4)}`;
  const atStart = view === "month" ? month <= earliest.slice(0, 7) : monday <= mondayOf(earliest);
  const atEnd = view === "month" ? month >= last.slice(0, 7) : addDaysTo(monday, 7) > last;
  const firstIn = (from: string, to: string) => events.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
  const go = (n: number) => {
    if (view === "month") {
      const m = shiftMonth(month, n);
      setMonth(m);
      // The first event day of the month opened, or the next one when it is this month.
      setDay(firstIn(m === first ? today : `${m}-01`, `${m}-31`));
    } else {
      const w = addDaysTo(monday, 7 * n);
      setMonday(w);
      setDay(w === mondayOf(today) ? today : firstIn(w, addDaysTo(w, 6)));
    }
  };
  const switchTo = (v: "week" | "month") => {
    setView(v);
    const at = day ?? today;
    if (v === "month") setMonth(at.slice(0, 7));
    else setMonday(mondayOf(at));
  };
  const chosen = day ? (byDay.get(day) ?? []) : [];
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-2 py-2">
        <button type="button" onClick={() => go(-1)} disabled={atStart} className="inline-flex size-9 items-center justify-center rounded-[10px] text-accent-text hover:bg-surface-2 disabled:opacity-30" aria-label={view === "month" ? "The month before" : "The week before"}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-3">
          <h3 className="section-header text-center">{label}</h3>
          <div role="group" aria-label="Calendar view" className="inline-flex rounded-[10px] bg-surface-2 p-0.5">
            {(["week", "month"] as const).map((v) => (
              <button key={v} type="button" onClick={() => switchTo(v)} aria-pressed={view === v} className={cn("h-7 rounded-[8px] px-3 text-footnote font-medium transition-colors", view === v ? "bg-accent text-white" : "text-text-secondary hover:text-text")}>
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => go(1)} disabled={atEnd} className="inline-flex size-9 items-center justify-center rounded-[10px] text-accent-text hover:bg-surface-2 disabled:opacity-30" aria-label={view === "month" ? "The month after" : "The week after"}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div role="grid" aria-label={`The calendar, ${label}`}>
        <div role="row" className={cn("grid border-b border-hairline", cols)}>
          {WEEKDAYS.slice(0, weekends ? 7 : 5).map((w, i) => (
            <div key={w} role="columnheader" className="px-1 py-1.5 text-center text-caption text-text-tertiary">
              {w}
              {view === "week" ? <span className="data ml-1">{Number(days[i].slice(8, 10))}</span> : null}
            </div>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div key={i} role="row" className={cn("grid border-b border-hairline last:border-b-0", cols)}>
            {week.map((d, j) => {
              if (!d) return <div key={`x${j}`} role="gridcell" aria-hidden className="border-r border-hairline bg-surface/40 last:border-r-0" />;
              const evs = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  role="gridcell"
                  onClick={() => setDay(d)}
                  aria-current={d === today ? "date" : undefined}
                  aria-selected={d === day}
                  className={cn("min-w-0 cursor-pointer border-r border-hairline px-1 py-1 text-left transition-colors last:border-r-0 hover:bg-[color-mix(in_oklab,var(--viz)_8%,transparent)] lg:px-1.5", view === "week" ? "min-h-[9rem] lg:min-h-[11rem]" : "min-h-[4.25rem] lg:min-h-[5.5rem]", d === day && "bg-[color-mix(in_oklab,var(--viz)_14%,transparent)] shadow-[inset_0_0_0_1px_var(--viz-line)]", d < today && "opacity-75")}
                >
                  <button type="button" onClick={() => setDay(d)} aria-label={`${longDate(d)}: ${evs.map((e) => e.name).join(", ") || "nothing"}`} className={cn("data inline-flex size-6 items-center justify-center rounded-full text-caption", d === today ? "bg-accent font-semibold text-white" : "text-text-secondary")}>
                    {Number(d.slice(8, 10))}
                  </button>
                  <span className="mt-0.5 flex flex-col gap-0.5">
                    {evs.map((e) => {
                      const link = links[linkKey(e)];
                      const chip = cn("data block truncate rounded-[6px] px-1 text-[11px] leading-[18px]", CHIP[GROUP[e.kind]], link && "underline decoration-1 underline-offset-2");
                      const text = (
                        <>
                          {view === "week" && e.kind !== "earnings" && e.kind !== "election" ? e.name : shortOf(e)}
                          {e.projections ? <span className="ml-1 opacity-70">dots</span> : null}
                        </>
                      );
                      return link ? (
                        <Link key={key(e)} href={link.href as Route} title={`${e.name}: ${link.label}`} onClick={(ev) => ev.stopPropagation()} className={chip}>
                          {text}
                        </Link>
                      ) : (
                        <span key={key(e)} title={`${e.name}, ${e.time}`} className={chip}>
                          {text}
                        </span>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-3 py-2 text-caption text-text-secondary">
        {(Object.keys(CHIP) as Group[])
          .filter((g) => groups.has(g))
          .map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-block h-3 w-5 rounded-[4px]", CHIP[g])} aria-hidden />
              {GROUP_LABEL[g]}
            </span>
          ))}
      </div>
      <div className="border-t border-hairline px-4 py-3" aria-live="polite">
        {day ? (
          <>
            <p className="text-subhead font-semibold">
              {longDate(day)} <span className="data ml-1 font-normal text-text-tertiary">{countdown(daysBetween(today, day))}</span>
            </p>
            {chosen.length ? (
              <ul className="mt-2 flex flex-col gap-3">
                {chosen.map((e) => (
                  <li key={key(e)}>
                    <p className="flex flex-wrap items-center gap-2 text-body">
                      {e.name}
                      <span className="data text-footnote text-text-tertiary">{e.time}</span>
                      {e.projections ? <StatusPill tone="neutral">Dot plot</StatusPill> : null}
                    </p>
                    <p className="mt-0.5 text-footnote text-text-secondary">
                      {e.about}
                      {e.indicator && readings[e.indicator] ? ` Last reading: ${readings[e.indicator]}.` : ""}{" "}
                      {e.source.startsWith("/") ? (
                        <a href={e.source} className="text-accent-text">
                          Company page
                        </a>
                      ) : (
                        <a href={e.source} target="_blank" rel="noreferrer" className="text-accent-text">
                          {e.kind === "election" || e.kind === "summit" || e.kind === "deadline" ? "Source" : "Schedule"}
                        </a>
                      )}
                    </p>
                    {links[linkKey(e)] ? (
                      <Link href={links[linkKey(e)].href as Route} className="mt-1.5 inline-flex h-9 items-center rounded-[10px] bg-surface-2 px-3 text-subhead font-medium text-accent-text">
                        {links[linkKey(e)].label}
                      </Link>
                    ) : null}
                    {reach[reachKey(e)]?.length ? (
                      <div className="mt-2 rounded-[10px] bg-surface-2 px-3 py-2">
                        <p className="text-caption font-semibold text-text-secondary">Your book, under your methodology</p>
                        <ul className="mt-1 flex flex-col gap-1 text-footnote text-text-secondary">
                          {reach[reachKey(e)].map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {progress[betKey(e)] ? (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-footnote text-text-secondary">
                        <StatusPill tone="info">Being read</StatusPill>
                        {progress[betKey(e)]}
                      </p>
                    ) : null}
                    {bets[betKey(e)] ? <Bet b={bets[betKey(e)]} history={!!sensitivity[reachKey(e)]?.rows.length} /> : null}
                    {sensitivity[reachKey(e)] ? <History s={sensitivity[reachKey(e)]} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-footnote text-text-secondary">Nothing on the calendar this day.</p>
            )}
          </>
        ) : (
          <p className="text-footnote text-text-secondary">Nothing on the calendar here. The arrows open the next.</p>
        )}
      </div>
    </div>
  );
}

/** What the prediction markets bet on the event: the market's own question and its chances, never the app's forecast. */
function Bet({ b, history }: { b: { bet: BetView | null; note: string }; history: boolean }) {
  if (!b.bet) return <p className="mt-2 text-caption text-text-tertiary">What the markets bet on: {b.note}</p>;
  const x = b.bet;
  return (
    <div className="mt-2 rounded-[10px] border border-hairline px-3 py-2">
      <p className="text-caption font-semibold text-text-secondary">What the markets bet on</p>
      <p className="mt-0.5 text-footnote">{x.title}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-footnote">
        {x.outcomes.map((o) => (
          <li key={o.label}>
            <span className="text-text-secondary">{o.label}</span> <span className="data">{o.pct}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-caption text-text-tertiary">
        {x.words} {!history ? "" : x.weighed ? "Its chances weigh the history below. " : "Its question is not one the history splits by, so it is shown beside it. "}
        <a href={x.url} target="_blank" rel="noreferrer" className="text-accent-text">
          {x.source}
        </a>
      </p>
    </div>
  );
}

/** How the book and SPY took the same kind of event before, by outcome: history at today's weights, never a forecast. */
function History({ s }: { s: SensitivityView }) {
  return (
    <div className="mt-2 rounded-[10px] border border-hairline px-3 py-2">
      <p className="text-caption font-semibold text-text-secondary">{s.title}</p>
      {s.rows.length ? (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-footnote">
            <thead>
              <tr className="text-left text-caption text-text-tertiary">
                <th className="py-1 pr-2 font-normal">Outcome</th>
                <th className="py-1 pr-2 text-right font-normal">Times</th>
                <th className="py-1 pr-2 text-right font-normal">Your book, mean (95% interval)</th>
                <th className="py-1 pr-2 text-right font-normal">Range</th>
                <th className="py-1 pr-2 text-right font-normal">SPY</th>
                <th className="py-1 text-right font-normal">Fell</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.outcome} className="border-t border-hairline">
                  <td className="py-1 pr-2">{r.outcome}</td>
                  <td className="data py-1 pr-2 text-right">{r.n}</td>
                  <td className="data py-1 pr-2 text-right">{r.book}</td>
                  <td className="data py-1 pr-2 text-right text-text-secondary">{r.range}</td>
                  <td className="data py-1 pr-2 text-right">{r.spy}</td>
                  <td className="data py-1 text-right">{r.fell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ul className="mt-1 flex flex-col gap-1 text-footnote text-text-secondary">
        {s.words.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
