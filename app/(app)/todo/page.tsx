import { ListChecks } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import type { Route } from "next";

import { Decide } from "@/components/actions/decide";
import { NoFigures } from "@/components/app/no-figures";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { deriveScreens } from "@/lib/screen-data";
import { countdown, daysBetween } from "@/lib/screens";
import { localDay, longDate } from "@/lib/time";
import { TODO_GROUP_ABOUT, TODO_GROUP_LABEL, TODO_GROUPS, todoCounts, type TodoGroup, type TodoItem } from "@/lib/todo";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Methodology to-do · Invariant" };

const SLOT: Record<TodoGroup, "todo_now" | "todo_due" | "todo_later" | "todo_decided"> = { now: "todo_now", due: "todo_due", later: "todo_later", decided: "todo_decided" };
const TONE: Record<TodoGroup, "danger" | "warn" | "neutral" | "ok"> = { now: "danger", due: "warn", later: "neutral", decided: "ok" };

/**
 * What the methodology requires that is not on file yet, holding by holding:
 * breaches and sales without an entry now, every clock by its date, and what
 * each rule asks for each holding and has no record of. Every item cites its
 * section and says what done looks like. Nothing here is a verdict on the
 * holdings; it is the paperwork the person's own rules call for.
 */
export default async function TodoPage() {
  const ws = await screen("methodology");
  const { setup, book } = ws;
  const m = setup.methodology;
  if (!book || !m)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Methodology to-do" />
        <PageBody>{!book ? <NoFigures what="The to-do list" /> : <EmptyState icon={ListChecks} title="No methodology yet" instruction="The list comes from your methodology's rules against what is on file. Choose, upload or ask for one on Setup." action={null} />}</PageBody>
      </>
    );
  const today = localDay();
  const data = deriveScreens({ book, methodology: m, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
  const slots = data.slots("todo");
  const counts = todoCounts(data.todo);
  const subtitle = data.todo.length ? `${counts.now} to do now, ${counts.due} due by a date, ${counts.later} owed with no date${counts.decided ? `, ${counts.decided} decided` : ""} · checked ${longDate(today)} against ${m.name}` : `Nothing owed under ${m.name} as of ${longDate(today)}.`;

  const row = (t: TodoItem) => {
    const days = t.date ? daysBetween(today, t.date) : null;
    const when = t.date && days !== null ? `${longDate(t.date)} · ${countdown(days)}` : null;
    const tone = days === null ? "" : days < 0 ? "text-text-tertiary" : days <= 7 ? "text-warn" : "text-text-secondary";
    return (
      <div key={t.key}>
        <ListLinkRow
          href={t.href as Route}
          label={<span className="block whitespace-normal">{t.title}</span>}
          detail={
            <>
              <span className="block">{t.why}</span>
              <span className="mt-0.5 block text-text-tertiary">Done looks like: {t.done}</span>
              {when ? <span className={`data mt-0.5 block lg:hidden ${tone}`}>{when}</span> : null}
            </>
          }
          value={when ? <span className={`hidden lg:inline ${tone}`}>{when}</span> : t.section ? <span className="data text-caption text-text-tertiary">{t.section}</span> : undefined}
        />
        {t.group === "decided" ? null : <Decide item={t} m={m} today={today} />}
      </div>
    );
  };

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Methodology to-do" subtitle={subtitle} />
      <PageBody>
        {TODO_GROUPS.filter((g) => slots.includes(SLOT[g])).map((g) => {
          const items = data.todo.filter((t) => t.group === g);
          return (
            <ListSection key={g} header={<span className="inline-flex items-center gap-2">{TODO_GROUP_LABEL[g]} <StatusPill tone={items.length ? TONE[g] : "ok"}>{items.length}</StatusPill></span>} footer={TODO_GROUP_ABOUT[g]} className="mb-6">
              {items.length ? items.map(row) : <ListLinkRow href={"/methodology" as Route} label={<span className="text-text-secondary">Nothing here</span>} detail={g === "now" ? "No breach, every listed holding placed by a class, every sale in the last year logged." : g === "due" ? "No clock, expiry, maturity or report is dated." : g === "decided" ? "Decide on an item above and it waits here, with what you decided, until the reading changes or its date comes." : "Every record the rules ask for is on file, and no rule waits for data."} />}
            </ListSection>
          );
        })}
        <p className="px-1 text-caption text-text-tertiary">The list is what your own rules call for, read against your records, your Decision Log and your filings. Not investment advice.</p>
      </PageBody>
    </>
  );
}
