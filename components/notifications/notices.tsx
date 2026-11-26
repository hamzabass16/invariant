"use client";

import { ArrowLeftRight, Bell, CalendarClock, ChevronDown, CircleAlert, CircleCheck, Mail, TriangleAlert } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { DoneMark, useDone, type Ran } from "@/components/app/done-mark";
import { announceUnread } from "@/components/app/unread";
import { sendNotice } from "@/components/notifications/send";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { TRADE_PREFIX, type AlertItem } from "@/lib/alerts";
import { atUtcHour, localDay, localMoment, shortDate } from "@/lib/time";

import { checkAlertsNowAction, tradeReasonAction } from "@/app/(app)/notifications/actions";

function Lead({ tone, muted, trade }: { tone: AlertItem["tone"]; muted?: boolean; trade?: boolean }) {
  const cls = `size-5 shrink-0 ${muted ? "opacity-50" : ""}`;
  if (trade) return <ArrowLeftRight className={`${cls} text-info`} aria-hidden />;
  if (tone === "danger") return <CircleAlert className={`${cls} text-danger`} aria-hidden />;
  if (tone === "warn") return <TriangleAlert className={`${cls} text-warn`} aria-hidden />;
  if (tone === "ok") return <CircleCheck className={`${cls} text-ok`} aria-hidden />;
  return <CalendarClock className={`${cls} text-info`} aria-hidden />;
}

const clock = (iso: string) => localMoment(iso);

/**
 * Dismiss, at once: the row goes the moment it is pressed and the vault is
 * written behind it; a refusal brings the row back with the sentence beside
 * the button (Hamza, 19 Oct 2026: "it takes a while to dismiss"). It is sent
 * outside any transition, so another screen opens at once after it (Hamza,
 * 23 Oct 2026).
 */
function Dismiss({ id, onHide, onFail, className }: { id: string; onHide: (id: string) => void; onFail: (id: string, error: string) => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      onClick={() => {
        onHide(id);
        void sendNotice({ dismiss: [id] }).then((r) => {
          if (r.error) onFail(id, r.error);
        });
      }}
    >
      Dismiss
    </Button>
  );
}

const MOVE_INK = { up: "var(--ok)", down: "var(--danger)", flat: "var(--text-tertiary)" } as const;

/** An alert's figures as chips under its title: each move in the direction's colour beside its name, so an event's summary reads at a glance. */
function Figures({ figures }: { figures: AlertItem["figures"] }) {
  return (
    <span className="mt-1.5 mb-0.5 flex flex-wrap gap-1.5">
      {figures.map((f) => (
        <span key={f.label} className="inline-flex items-baseline gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 py-0.5 text-caption">
          <span className="text-text-secondary">{f.label}</span>
          <span className="data font-semibold" style={{ color: MOVE_INK[f.tone] }}>
            {f.value}
          </span>
        </span>
      ))}
    </span>
  );
}

/** One alert: a link to where it is decided, when it fired, whether it was emailed, and Dismiss. A new trade asks for its reason in place. A read alert is drawn quiet; an unread one carries the dot. */
function AlertRow({ a, unread, earlier, error, onHide, onFail }: { a: AlertItem; unread: boolean; earlier?: boolean; error?: string; onHide: (id: string) => void; onFail: (id: string, error: string) => void }) {
  const since = earlier ? `${shortDate(localDay(new Date(a.firedAt)))} to ${shortDate(localDay(new Date(a.clearedAt ?? a.firedAt)))}` : `Since ${shortDate(localDay(new Date(a.firedAt)))}`;
  const trade = a.key.startsWith(TRADE_PREFIX);
  const quiet = earlier || !unread;
  const title = (
    <span className={`block break-words ${unread ? "font-medium" : "text-text-secondary"}`}>
      {unread ? <span className="mr-2 inline-block size-2 rounded-full bg-accent align-middle" aria-label="unread" /> : null}
      {a.title}
    </span>
  );
  const problem = error ? <p className="mt-1 text-footnote text-danger">{error}</p> : null;
  if (trade && !earlier)
    return (
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="notice-mark shrink-0">
            <Lead tone={a.tone} trade muted={quiet} />
          </span>
          <span className="min-w-0 flex-1">
            {title}
            <span className="mt-0.5 block text-footnote text-text-secondary">{a.detail.replace(/ Write it on Notifications.*$/, "")}</span>
            {problem}
          </span>
        </div>
        <ActionForm action={tradeReasonAction} label="Keep the reason" variant="secondary" size="sm" className="mt-2 pl-11">
          <input type="hidden" name="key" value={a.key} />
          <label className="sr-only" htmlFor={`reason-${a.id}`}>
            Why you made this trade
          </label>
          <textarea id={`reason-${a.id}`} name="reason" rows={2} maxLength={4000} placeholder="Why you made it, in a line or two." className="mb-2 block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body" />
        </ActionForm>
        {/* Dismiss at the foot on the right, as on every other notice (Hamza, 11 Nov 2026). */}
        <div className="mt-2 flex justify-end">
          <Dismiss id={a.id} onHide={onHide} onFail={onFail} className="shrink-0" />
        </div>
      </div>
    );
  return (
    <div className="flex items-start gap-1 pr-2">
      <Link href={a.href as Route} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left text-body transition-colors duration-100 active:bg-surface-2">
        <span className="notice-mark shrink-0">
          <Lead tone={a.tone} muted={quiet} trade={trade} />
        </span>
        <span className="min-w-0 flex-1">
          {title}
          {a.figures?.length ? <Figures figures={a.figures} /> : null}
          <span className="mt-0.5 block text-footnote text-text-secondary">{a.detail}</span>
          <span className="data mt-1 flex items-center gap-1.5 text-caption text-text-tertiary">
            {since}
            {a.emailedAt ? (
              <>
                {" · "}
                <Mail className="size-3" aria-hidden /> emailed
              </>
            ) : null}
          </span>
          {problem}
        </span>
      </Link>
      {earlier ? null : <Dismiss id={a.id} onHide={onHide} onFail={onFail} className="shrink-0" />}
    </div>
  );
}

/** Mark all read: the dots go as it is pressed; the check shows once the vault has it. Shown while anything is unread, and while its check is on. Sent outside any transition, like Dismiss. */
function MarkAllRead({ onPress, onFail, show }: { onPress: () => void; onFail: (error: string) => void; show: boolean }) {
  const [state, setState] = React.useState<Ran<{ error: string | null }>>({ error: null });
  const [pending, setPending] = React.useState(false);
  const done = useDone(state);
  if (!show && !done && !pending) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        disabled={!show && !pending}
        onClick={() => {
          onPress();
          setPending(true);
          void sendNotice({ read: true }).then((r) => {
            if (r.error) onFail(r.error);
            setState({ ...r, ran: Date.now() });
            setPending(false);
          });
        }}
      >
        Mark all read
      </Button>
      {done ? <DoneMark label="All read" /> : null}
      {state.error ? <p className="mt-1 w-full text-footnote text-danger">{state.error}</p> : null}
    </span>
  );
}

const dismissedWords = (n: number) => `${n} dismissed; each comes back if it clears and fires again.`;

/**
 * The Notifications screen's body, kept in the browser as the person works
 * it: a dismissed alert leaves the list at once and every alert reads as
 * read the moment Mark all read is pressed, while the vault is written behind
 * them; the server's next render then agrees. What holds now and is unread,
 * then, folded, what holds and was read, then what fired
 * and cleared in the last thirty days, then the checks and the email.
 */
export function Notices({ fresh, now, earlier, unread, dismissed, demo, checked, emailProblem, noticesOn, push, watchers, moveAlert }: { fresh: React.ReactNode; now: AlertItem[]; earlier: AlertItem[]; unread: string[]; dismissed: number; demo: boolean; checked: string | null; emailProblem: string | null; noticesOn: boolean; push?: React.ReactNode; watchers?: React.ReactNode; moveAlert?: React.ReactNode }) {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [readAll, setReadAll] = React.useState(false);
  const onHide = (id: string) => {
    setHidden((h) => new Set([...h, id]));
    setErrors((e) => (id in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)) : e));
  };
  const onFail = (id: string, error: string) => {
    setHidden((h) => new Set([...h].filter((x) => x !== id)));
    setErrors((e) => ({ ...e, [id]: error }));
  };
  const shown = now.filter((a) => !hidden.has(a.id));
  const unreadSet = new Set(readAll ? [] : unread.filter((id) => !hidden.has(id)));
  // Now holds what is unread; what is read and still holds folds away under it (Hamza, 4 Nov 2026).
  const unreadNow = shown.filter((a) => unreadSet.has(a.id));
  const readNow = shown.filter((a) => !unreadSet.has(a.id));
  const unreadCount = unreadNow.length;
  // The menu's badge follows what is pressed here, since the layout is not drawn again.
  const told = React.useRef(unreadCount);
  React.useEffect(() => {
    if (told.current === unreadCount) return;
    told.current = unreadCount;
    announceUnread(unreadCount);
  }, [unreadCount]);
  const [readError, setReadError] = React.useState<string | null>(null);
  // Dismissed here and not yet gone from the server's list, plus what the server counts.
  const dismissedCount = dismissed + [...hidden].filter((id) => now.some((a) => a.id === id)).length;

  return (
    <>
      <PageHeader
        fresh={fresh}
        title="Notifications"
        subtitle={readError ?? (unreadCount === 0 ? "Nothing unread" : `${unreadCount} unread`)}
        action={
          <MarkAllRead
            show={unreadCount > 0}
            onPress={() => {
              setReadAll(true);
              setReadError(null);
            }}
            onFail={(error) => {
              setReadAll(false);
              setReadError(error);
            }}
          />
        }
      />
      <PageBody>
        {!noticesOn ? null : (
          <div data-tour="notifications">
            {shown.length === 0 || unreadNow.length > 0 ? (
              <ListSection grid={unreadNow.length > 0} header="Now" footer={dismissedCount && !readNow.length ? dismissedWords(dismissedCount) : undefined}>
                {unreadNow.length === 0 ? (
                  <EmptyState icon={Bell} title="Nothing to tell you" instruction="Breaches, watches, dates within a week, new trades, reports tomorrow and after the results, studies, filings reads, watchlist levels and changes to the cards you follow appear here." action={null} />
                ) : (
                  unreadNow.map((a) => <AlertRow key={a.id} a={a} unread error={errors[a.id]} onHide={onHide} onFail={onFail} />)
                )}
              </ListSection>
            ) : null}
            {readNow.length ? (
              <details className="group mb-8">
                <summary className="mb-2 flex cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
                  <h2 className="section-header">
                    Read <span className="data text-text-tertiary">{readNow.length}</span>
                  </h2>
                  <ChevronDown className="size-5 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </summary>
                <ListSection grid className="mb-0" footer={`Still holding, already read; each stays until it clears or you dismiss it.${dismissedCount ? ` ${dismissedWords(dismissedCount)}` : ""}`}>
                  {readNow.map((a) => (
                    <AlertRow key={a.id} a={a} unread={false} error={errors[a.id]} onHide={onHide} onFail={onFail} />
                  ))}
                </ListSection>
              </details>
            ) : null}
            {earlier.length ? (
              <ListSection grid header="Earlier" footer="Fired and cleared in the last 30 days.">
                {earlier.map((a) => (
                  <AlertRow key={a.id} a={a} unread={false} earlier onHide={onHide} onFail={onFail} />
                ))}
              </ListSection>
            ) : null}
            <ListSection header="Checks and email">
              <ListRow
                wrap
                label={demo ? "Checked on each visit" : checked ? `Last checked ${clock(checked)}` : "Not checked yet"}
                detail={
                  demo
                    ? `With your own book, alerts are checked at ${atUtcHour(6)} and ${atUtcHour(18)} your time, each new one is emailed to your sign-in address, and the devices you turn on get one recap after each close. The demo sends nothing.`
                    : `Checked at ${atUtcHour(6)} and ${atUtcHour(18)} your time for everyone enrolled on Reports (any schedule, or none). Each new alert is emailed once, when it fires, to your sign-in address; a routine filings read is not, and the Thesis Hunter's finds go in your weekly review instead. The devices you turn on below get one recap after each US close.`
                }
              />
              {emailProblem && !demo ? <ListRow wrap label="Email" detail={emailProblem} /> : null}
              {demo ? null : (
                <div className="px-4 py-3">
                  <ActionButton action={checkAlertsNowAction} label="Check now" variant="secondary" />
                </div>
              )}
            </ListSection>
            {watchers}
            {moveAlert}
            {push}
          </div>
        )}
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
