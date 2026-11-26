import { ScreenFreshness } from "@/components/app/screen-freshness";
import { NoFigures } from "@/components/app/no-figures";
import { Notices } from "@/components/notifications/notices";
import { MoveAlertCard } from "@/components/notifications/move-alert";
import { PushCard } from "@/components/notifications/push-card";
import { WatchersCard } from "@/components/notifications/watchers";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { alertsView } from "@/lib/alerts";
import { pushFileSchema } from "@/lib/push";
import { localDay } from "@/lib/time";
import { watcherReadings } from "@/lib/watchers";
import { screenAlerts } from "@/lib/notifications-run";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Notifications · Invariant" };
// Check now reads the vault, the price feed for the watchlist and sends one email; and opening the app here
// catches up behind the page (lib/catch-up.ts: a report's commentary, a study), which a minute cut short (27 Oct 2026).
export const maxDuration = 300;

/**
 * Every alert the app produces, kept: what holds now (breaches, watches, clocks
 * and dates within a week, new trades asking for their reason, studies,
 * filings reads, the watchlist's levels, the cards the person follows on
 * Community that changed),
 * then what fired and cleared in the last thirty days. Checked at 06:00 and
 * 18:00 UTC for everyone enrolled, each new alert emailed once; a visit lays
 * today's notices on the kept file, and Dismiss hides one until it clears and
 * fires again. The list is kept in the browser as it is worked
 * (components/notifications/notices.tsx), so Dismiss and Mark all read show
 * at once (Hamza, 19 Oct 2026).
 */
export default async function NotificationsPage() {
  const ws = await screen("overview");
  if (!ws.book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Notifications" />
        <PageBody>
          <NoFigures what="Notices" />
        </PageBody>
      </>
    );
  const today = localDay();
  // The devices turned on for the recap after the close: none in the demo.
  const pushFile = async () => (ws.mode === "demo" ? null : (await import("@/lib/vault")).openVault().then((v) => v.readJson("push", pushFileSchema)).catch(() => null));
  // Every notice laid on the kept alerts, read the same way Dismiss and Mark all read read it (lib/notifications-run.ts).
  const [screened, kept] = await Promise.all([screenAlerts(ws, today), pushFile()]);
  const data = screened!;
  const { pushProblem, vapidPublicKey } = await import("@/lib/push-send");
  const view = alertsView(data.alerts);
  const watchers = ws.preferences.watchers.map((w) => ({ w, readings: watcherReadings(w, ws.book, ws.filings) }));

  return (
    <Notices
      fresh={<ScreenFreshness />} now={view.now} earlier={view.earlier} unread={data.unread.map((n) => n.id)} dismissed={view.dismissed} demo={ws.mode === "demo"} checked={ws.alerts.checkedAt} emailProblem={ws.alerts.emailProblem} noticesOn={data.slots("notifications").includes("notices")}
      watchers={data.slots("notifications").includes("watchers") ? <WatchersCard watchers={watchers} editable={ws.mode === "drive"} hasModel={ws.hasModelKey} /> : null}
      moveAlert={<MoveAlertCard pct={ws.preferences.moveAlertPct} editable={ws.mode === "drive"} />}
      push={<PushCard publicKey={vapidPublicKey()} problem={pushProblem()} devices={(kept?.devices ?? []).map((d) => ({ endpoint: d.endpoint, label: d.label, addedAt: d.addedAt }))} lastSentAt={kept?.lastSentAt ?? null} demo={ws.mode === "demo"} />}
    />
  );
}
