import { CalendarCheck, ExternalLink } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status";
import { againstExpected, type InProgress, type MacroReport } from "@/lib/macro-report";
import { localMoment } from "@/lib/time";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * After each event (Hamza, 27 Oct 2026; shortened 4 Nov 2026): the report
 * after each macro event, the newest first, one open at a time by its chip,
 * in three parts: what happened, the outcome against what was expected, and
 * how investors took it from the day's reporting (rotations, which groups
 * were bought and sold, and why), then the pages it came from. No index's
 * move and no line on the book: a day's index move cannot be told apart
 * from the rest of the day's news.
 */
export function EventReports({ reports, chosen, note, demo }: { reports: MacroReport[]; chosen: string | null; note: string | null; demo: boolean }) {
  if (!reports.length)
    return (
      <section id="event-reports" className="mb-8 scroll-mt-20">
        <h2 className="section-header mb-2 px-4">After each event</h2>
        <div className="card">
          <EmptyState icon={CalendarCheck} title="No event reports yet" instruction={note ?? "Half an hour after an event on the calendar comes out, its outcome and how investors took it land here, as an alert and an email."} action={null} />
        </div>
      </section>
    );
  const r = reports.find((x) => x.key === chosen) ?? reports[0];
  const o = r.outcome;
  const against = o ? againstExpected(o) : "";
  const reaction = o?.markets ?? null;
  const pages = [...new Map((o?.points ?? []).map((p) => [p.source.url, p.source])).values()];
  return (
    <section id="event-reports" className="mb-8 scroll-mt-20">
      <h2 className="section-header mb-2 px-4">After each event</h2>
      <nav className="mb-3 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Event reports">
        {reports.slice(0, 12).map((x) => {
          const on = x.key === r.key;
          return (
            <Link key={x.key} href={`/calendar?event=${encodeURIComponent(x.key)}#event-reports` as Route} scroll={false} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-subhead font-medium transition-colors", on ? "bg-accent text-white" : "bg-surface-2 text-text hover:opacity-80")}>
              <span className="max-w-[12rem] truncate">{x.name}</span>
              <span className={cn("data text-caption", on ? "opacity-80" : "text-text-tertiary")}>{x.session.slice(5)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="card overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            {o && !o.final ? <StatusPill tone="warn">Not final yet</StatusPill> : o?.label ? <StatusPill tone="info">{o.label}</StatusPill> : null}
            <p className="text-body font-semibold">{r.name}</p>
            <span className="data ml-auto text-caption text-text-tertiary">
              {longDate(r.date)} · traded {longDate(r.session)}
            </span>
          </div>
        </div>
        {o && !o.final ? <Readings readings={r.readings} /> : null}
        <div className="space-y-4 border-t border-hairline px-4 py-3">
          <Part title="What happened">{o ? o.decided : (r.outcomeNote ?? (demo ? "The demo reads no outcome." : "Read with the AI."))}</Part>
          {o && (against || (o.final && o.label)) ? <Part title="The outcome">{[o.final && o.label ? `${o.label}.` : "", against].filter(Boolean).join(" ")}</Part> : null}
          {o && !o.final && r.outcomeNote ? <p className="text-subhead text-text-tertiary">{r.outcomeNote}</p> : null}
          {reaction ? <Part title="How investors took it">{reaction}</Part> : null}
        </div>
        {pages.length || r.source.startsWith("https://") ? (
          <div className="flex flex-wrap gap-2 border-t border-hairline px-4 py-3">
            {r.source.startsWith("https://") ? <PageLink href={r.source} label="Official page" /> : null}
            {pages.map((x) => (
              <PageLink key={x.url} href={x.url} label={x.title} />
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-2 px-4 text-footnote text-text-tertiary">{note ?? "Read from the official page and the day's reporting. Each report is an alert and its own email."}</p>
    </section>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-footnote font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
      <p className="text-subhead">{children}</p>
    </div>
  );
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-subhead text-text">
      <ExternalLink size={15} aria-hidden className="shrink-0" /> <span className="truncate">{label}</span>
    </a>
  );
}

const STATE: Record<InProgress["state"], { label: string; tone: "info" | "warn" | "neutral" }> = {
  waiting: { label: "After the close", tone: "neutral" },
  due: { label: "Being read", tone: "info" },
  pending: { label: "Not final yet", tone: "warn" },
};

/**
 * Being read (Hamza, 28 Oct 2026): every event whose report is on its way or
 * whose outcome is not out yet, so a read in progress never looks skipped;
 * each with what happens next and the readings so far.
 */
export function BeingRead({ items }: { items: InProgress[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-8" aria-labelledby="being-read">
      <h2 id="being-read" className="section-header mb-2 px-4">
        Being read now
      </h2>
      <ul className="card divide-y divide-hairline overflow-hidden">
        {items.map((x) => (
          <li key={x.key} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={STATE[x.state].tone}>{STATE[x.state].label}</StatusPill>
              <Link href={`/calendar?event=${encodeURIComponent(x.key)}#event-reports` as Route} scroll={false} className="text-body font-semibold">
                {x.name}
              </Link>
              <span className="data ml-auto text-caption text-text-tertiary">
                {longDate(x.date)}
                {x.session !== x.date ? ` · traded ${longDate(x.session)}` : ""}
              </span>
            </div>
            <p className="mt-1 text-subhead text-text-secondary">{x.words}</p>
            {x.readings.length ? <Readings readings={x.readings} flush /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Each reading of an outcome not out yet, the newest first. */
function Readings({ readings, flush }: { readings: MacroReport["readings"]; flush?: boolean }) {
  if (!readings.length) return null;
  return (
    <ol className={cn("space-y-1.5", flush ? "mt-2" : "border-t border-hairline px-4 py-3")}>
      {[...readings].reverse().map((x) => (
        <li key={x.at} className="flex gap-3 text-subhead">
          <span className="data w-28 shrink-0 text-caption text-text-tertiary">{localMoment(x.at)}</span>
          <span className="min-w-0 flex-1 text-text-secondary">
            {x.final ? "Final. " : ""}
            {x.decided}
          </span>
        </li>
      ))}
    </ol>
  );
}
