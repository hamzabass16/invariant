import "server-only";

import { dismiss, readIds } from "@/lib/alerts";
import { foundEvents, FOUND_PREFIX } from "@/lib/calendar-agent";
import { communityNotices } from "@/lib/community";
import { econNotices } from "@/lib/econ-calendar";
import { econReachWords } from "@/lib/econ-exposure";
import { macroNotices } from "@/lib/macro-report";
import { deriveScreens } from "@/lib/screen-data";
import { localDay } from "@/lib/time";
import { calendarFoundFor, communityFor, earningsView, getWorkspace, macroReportsFor, saveAlerts, savePreferences, type Workspace } from "@/lib/workspace";

/**
 * Everything Notifications lays on the kept alerts: the screens' own
 * notices and the ones read from other files (the reports after results,
 * the followed cards, the days the Calendar agent found, the reports after
 * the macro events). The page, Dismiss and Mark all read read the same, so
 * an alert the page shows is always one they can find (Hamza, 5 Nov 2026:
 * a dismissed alert came back, then "That alert is no longer there").
 */
export async function screenAlerts(ws: Workspace, today = localDay()) {
  if (!ws.setup || !ws.book) return null;
  const book = ws.book;
  const m = ws.setup.methodology;
  // The followed cards and the levels the person's clubs watch (Hamza, 9 Nov 2026), laid on together.
  const followed = async () => {
    const [c, w] = await Promise.all([cards(), ws.mode === "demo" ? Promise.resolve([]) : import("@/lib/clubs-run").then((r) => r.clubWatchAlerts(ws.operator.email, today))]);
    return c === null ? null : [...c, ...(w ?? [])];
  };
  const cards = async () => {
    if (!ws.preferences.following.length) return [];
    if (ws.mode === "demo") return communityNotices((await communityFor(ws)).profiles, ws.preferences.following, today);
    return (await import("@/lib/community-run")).followedNotices(ws.preferences.following, today);
  };
  const found = async () => {
    const events = foundEvents((await calendarFoundFor(ws)).file);
    return econNotices(today, events, econReachWords(today, book, m, events), FOUND_PREFIX);
  };
  const events = async () => macroNotices((await macroReportsFor(ws)).file, today);
  const [earnings, community, calendar, macro] = await Promise.all([earningsView(ws), followed(), found(), events()]);
  return deriveScreens({ book, methodology: m, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences, research: ws.research, alerts: ws.alerts, statements: ws.statements, earnings: earnings.notices, community, calendar, macro }, today);
}

/** The alerts file as the screen shows it: the kept file with every notice the page lays on. */
export async function currentAlerts(ws: Workspace) {
  return (await screenAlerts(ws))?.alerts ?? ws.alerts;
}

/**
 * Dismisses alerts; each stays out of sight until its condition clears and
 * holds again. Alerts already in the kept file are dismissed there without
 * deriving the screen again; one a visit laid on (not yet checked) is found
 * by deriving it (Hamza, 19 Oct 2026: Dismiss took a while). Null when done,
 * else a sentence.
 */
export async function dismissAlerts(ids: readonly string[]): Promise<string | null> {
  const ws = await getWorkspace();
  const file = ids.every((id) => ws.alerts.items.some((i) => i.id === id)) ? ws.alerts : await currentAlerts(ws);
  const there = ids.filter((id) => file.items.some((i) => i.id === id));
  if (!there.length) return ids.length > 1 ? "Those alerts are no longer there." : "That alert is no longer there.";
  const at = new Date().toISOString();
  await saveAlerts(there.reduce((f, id) => dismiss(f, id, at), file));
  return null;
}

/**
 * Marks every alert read: what the screen shows is kept, the preferences
 * keep each alert's id as read and the instant, and an alert that fires
 * later is unread. A read alert stays on the list, drawn as read, until it
 * clears or is dismissed (Hamza, 19 Oct 2026).
 */
export async function markAllRead(): Promise<null> {
  const ws = await getWorkspace();
  const file = await currentAlerts(ws);
  await saveAlerts(file);
  await savePreferences({ ...ws.preferences, notificationsSeen: new Date().toISOString(), notificationsRead: readIds(file, ws.preferences.notificationsRead) });
  return null;
}
