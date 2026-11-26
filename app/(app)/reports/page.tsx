import { FileText } from "lucide-react";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import type { Route } from "next";
import Link from "next/link";
import { after } from "next/server";

import { ActionButton } from "@/components/app/action-button";
import { ScheduleForm } from "@/components/reports/controls";
import { ReviewEmbed } from "@/components/reports/review-embed";
import { ReviewQuestions } from "@/components/reports/questions";
import { embedsItself, ReportView } from "@/components/reports/report-view";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { demoReview } from "@/lib/demo-review";
import { defaultSchedule, lastOfKind, MAX_QUESTIONS, reportsFileSchema, scheduleWords, type Report, type ReportsFile, type Schedule } from "@/lib/report";
import { REVIEW_LABEL } from "@/lib/review";
import { SyncError } from "@/lib/sync-error";
import { currentZone, localDay, localTime } from "@/lib/time";
import { screen } from "@/lib/workspace";

import { buildNowAction, sendMonthlyNowAction, sendNowAction, withdrawAction } from "./actions";

export const metadata = { title: "Reviews · Invariant" };

/**
 * The weekly and monthly reviews: the sections the methodology asks for
 * (lib/review.ts, slots in lib/ontology.ts), built from the vault at a chosen
 * day and hour and sent to the person's own sign-in address. Past reports are
 * kept in the vault. The demo builds its weekly here on each visit and keeps
 * nothing.
 */
const buildWeekly = buildNowAction.bind(null, "weekly");
const buildMonthly = buildNowAction.bind(null, "monthly");

export default async function ReportsPage() {
  const ws = await screen("overview");
  const { book } = ws;
  const now = new Date();

  let latest: Report | null = null;
  let past: ReportsFile = { version: 1, reports: [] };
  /** A reports file that could not be read: shown in place of the list, never an empty list. */
  let reportsError: string | null = null;
  let schedule: Schedule = defaultSchedule();
  let enrolled: { words: string; outcome: string | null } | null = null;
  let registry: "available" | "not-configured" | "unreachable" = "not-configured";
  let registryError: string | null = null;
  let mailOk = false;
  let hasRefresh = true;
  let lastWeekly: Report | null = null;
  let lastMonthly: Report | null = null;

  if (ws.mode === "drive") {
    const [{ openVault }, { enrolment, registryAvailable }, { mailConfigured }, { enrolmentAccess }] = await Promise.all([import("@/lib/vault"), import("@/lib/registry"), import("@/lib/report-mail"), import("@/lib/vault-access")]);
    registry = registryAvailable() ? "available" : "not-configured";
    mailOk = mailConfigured();
    try {
      hasRefresh = !!(await enrolmentAccess());
      past = (await (await openVault()).readJson("reports", reportsFileSchema)) ?? past;
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      reportsError = e.message;
    }
    latest = past.reports[0] ?? null;
    lastWeekly = lastOfKind(past, "weekly");
    lastMonthly = lastOfKind(past, "monthly");
    // The beta's count of people who opened a weekly verdict (lib/beta-run.ts), after the page is sent.
    if (lastWeekly) {
      const who = ws.operator.email;
      after(async () => (await import("@/lib/beta-run")).recordEvent(who, "verdict_viewed"));
    }
    if (registry === "available") {
      try {
        const e = await enrolment(ws.operator.email);
        if (e) {
          schedule = e.schedule;
          enrolled = { words: scheduleWords(e.schedule), outcome: e.lastOutcome };
        }
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        registry = "unreachable";
        registryError = e.message;
      }
    }
  } else if (book) {
    // The snapshot's last full week and month, built on each visit (lib/demo-review.ts).
    [latest, lastMonthly] = await Promise.all([demoReview(ws, "weekly", now), demoReview(ws, "monthly", now)]);
    lastWeekly = latest;
  }


  const when = (iso: string) => `${localDay(new Date(iso))} at ${localTime(iso)}`;

  return (
    <>
      <PageHeader
        title="Reviews"
        fresh={<ScreenFreshness kind="weekly" />}
        subtitle={ws.mode === "demo" ? "The weekly and the monthly, built here on each visit from the snapshot\u2019s last full week and month. Nothing is kept or sent." : `Weekly and monthly reviews, built from your vault and sent to ${ws.operator.email}.`}
        action={
          ws.mode === "drive" && book && !reportsError ? (
            <span className="flex flex-wrap gap-2">
              <ActionButton action={buildWeekly} label="Build the weekly" variant="secondary" />
              <ActionButton action={buildMonthly} label="Build the monthly" variant="ghost" />
            </span>
          ) : undefined
        }
      />
      <PageBody>
        {ws.error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{ws.error}</p> : null}

        {ws.mode === "drive" ? (
          <section className="mb-8">
            <h2 className="section-header mb-2 px-1">Schedule</h2>
            {registry === "not-configured" ? (
              <ListSection footer="Reports can still be built here. Scheduling needs the deployment's registry and mail account; see .env.example.">
                <ListRow wrap label="Not available on this deployment" detail="The operator has not set up scheduled reports." />
              </ListSection>
            ) : registry === "unreachable" ? (
              <ListSection footer="Your schedule, if you have one, still stands; it could not be read just now.">
                <ListRow wrap label="The schedule could not be read" detail={registryError ?? undefined} />
              </ListSection>
            ) : (
              <>
                <ListSection
                  footer={
                    hasRefresh
                      ? "The report reads your vault at that hour with the permission you gave at sign-in, and sends to your sign-in address only."
                      : "To run while you are away the report needs the folder permission with a refresh token. Sign out and sign in again, leaving the folder permission ticked."
                  }
                >
                  {enrolled ? (
                    <ListRow wrap label={enrolled.words} detail={enrolled.outcome ? `Last run: ${enrolled.outcome}` : "Not run yet."} trailing={<ActionButton action={withdrawAction} label="Stop" variant="ghost" />} />
                  ) : (
                    <ListRow wrap label="No schedule yet" detail="Pick a day and an hour below." />
                  )}
                  {!mailOk ? <ListRow wrap label="Email is not set up on this deployment" detail="A schedule can be kept now; reports go out once the operator adds the mail account." /> : null}
                </ListSection>
                {/* A kept schedule shows as it stands; its form opens only from Replace (Hamza, 19 Oct 2026). */}
                {enrolled ? (
                  <details className="group">
                    <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3.5 text-subhead text-accent-text marker:hidden group-open:mb-3 [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Replace</span>
                      <span className="hidden group-open:inline">Keep the schedule as it is</span>
                    </summary>
                    <ScheduleForm current={schedule} hasKey={ws.hasModelKey} zone={currentZone()} />
                  </details>
                ) : (
                  <ScheduleForm current={schedule} hasKey={ws.hasModelKey} zone={currentZone()} />
                )}
                {mailOk && book ? (
                  <div className="mt-3 px-1">
                    <div className="flex flex-wrap gap-2">
                      <ActionButton action={sendNowAction} label="Send me one now" variant="ghost" />
                      <ActionButton action={sendMonthlyNowAction} label="Send the monthly now" variant="ghost" />
                    </div>
                    <p className="mt-2 text-caption text-text-tertiary">A review sent here is not sent again by the schedule.</p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {ws.mode === "drive" ? <ReviewQuestions questions={ws.preferences.reviewQuestions} max={MAX_QUESTIONS} hasKey={ws.hasModelKey} /> : null}

        {!reportsError && (lastWeekly || lastMonthly) ? (
          <ListSection grid header={ws.mode === "demo" ? "The demo's reviews" : "As sent"} footer={ws.mode === "demo" ? "Each opens on its own page, with its PDF report. In your app they go out by email on your schedule." : "Each opens exactly as it went out, with its PDF report."}>
            {([["Last weekly", lastWeekly], ["Last monthly", lastMonthly]] as const).map(([label, r]) =>
              r ? (
                <ListLinkRow key={label} href={`/reports/${r.id}` as Route} label={label} detail={ws.mode === "demo" ? `${r.title}. ${r.summary}` : `${r.title}. ${r.sentAt ? `Sent ${when(r.sentAt)}` : `Built ${when(r.builtAt)}, not sent`}.`} />
              ) : (
                <ListRow key={label} wrap label={label} detail="None yet." />
              ),
            )}
          </ListSection>
        ) : null}

        {reportsError ? (
          <ListSection grid header="Past reports">
            <ListRow wrap label="Your reports file could not be read" detail={`${reportsError} Building now would replace it.`} />
          </ListSection>
        ) : !book ? (
          <EmptyState icon={FileText} title="Nothing to report yet" instruction="A report needs figures. It appears here once the first statements or broker figures arrive." action={<Link href="/setup" className="text-accent-text">See what to connect</Link>} />
        ) : latest ? (
          <section className="mb-8">
            <h2 className="section-header mb-2 px-1">{ws.mode === "demo" ? "This week" : "Latest"}</h2>
            {ws.mode === "drive" ? (
              <p className="mb-3 px-1 text-footnote text-text-secondary">
                As built on <span className="data">{localDay(new Date(latest.builtAt))}</span> at <span className="data">{localTime(latest.builtAt)}</span>, and kept. Build it again for today&rsquo;s figures.
              </p>
            ) : null}
            <ReviewEmbed report={latest} />
            {embedsItself(latest) ? null : <ReportView report={latest} />}
          </section>
        ) : (
          <EmptyState icon={FileText} title="No review yet" instruction="Build the weekly now, or keep a schedule and the first arrives at that hour." action={<ActionButton action={buildWeekly} label="Build the weekly" />} />
        )}

        {latest
          ? ([lastWeekly, lastMonthly] as const)
              .filter((r): r is Report => !!r && r.id !== latest!.id)
              .map((r) => (
                <section key={r.id} className="mb-8">
                  <h2 className="section-header mb-2 px-1">{r.kind === "monthly" ? (ws.mode === "demo" ? "Last month" : "Last monthly") : "Last weekly"}</h2>
                  <p className="mb-3 px-1 text-footnote text-text-secondary">
                    {r.title}. {ws.mode === "demo" ? r.summary : `${r.sentAt ? `Sent ${when(r.sentAt)}` : `Built ${when(r.builtAt)}, not sent`}.`}{" "}
                    <Link href={`/reports/${r.id}` as Route} className="text-accent-text">
                      Open the review
                    </Link>
                  </p>
                  <ReviewEmbed report={r} />
                </section>
              ))
          : null}

        {past.reports.length > 1 ? (
          <ListSection grid header="Past reports" footer={`The last ${past.reports.length} are kept in your vault.`}>
            {past.reports.slice(1).map((r) => (
              <ListLinkRow key={r.id} href={`/reports/${r.id}` as Route} label={r.title} detail={r.kind === "today" ? r.summary : `${REVIEW_LABEL[r.kind]}. ${r.summary}`} value={localDay(new Date(r.builtAt))} />
            ))}
          </ListSection>
        ) : null}
      </PageBody>
    </>
  );
}
