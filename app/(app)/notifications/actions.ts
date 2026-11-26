"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { newTrades, tradeWords } from "@/lib/alerts";
import { decisionId, decisionSchema, withDecision, type Outcome } from "@/lib/decisions";
import { MOVE_ALERT_MIN } from "@/lib/market-recap";
import { SyncError } from "@/lib/sync-error";
import { MAX_WATCHERS, watcherId, watcherSchema } from "@/lib/watchers";
import { getWorkspace, saveDecisions, savePreferences } from "@/lib/workspace";

export type NotificationsState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<NotificationsState> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[notifications] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** Runs the twice-daily check now for the signed-in person, emailing what is new to their own address. */
export async function checkAlertsNowAction(): Promise<NotificationsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo is checked on each visit; its figures are fictional and nothing is emailed." };
  return guarded(async () => {
    const [{ openVault }, { checkAlerts }] = await Promise.all([import("@/lib/vault"), import("@/lib/alerts-run")]);
    await checkAlerts(await openVault(), ws.operator.email);
  });
}

const OUTCOME_OF: Record<string, Outcome> = { buy: "add", sell: "sell", option_open: "add", option_close: "closed" };

/**
 * Keeps the reason for a new trade: one Decision Log entry for the trade,
 * dated the trade's day, naming its company, answering its question. The
 * question then clears. The trade is found again from the book by its key,
 * never taken from the form.
 */
export async function tradeReasonAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const ws = await getWorkspace();
  if (!ws.book) return { error: "No figures yet." };
  const key = String(form.get("key") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { error: "Write the reason, or Dismiss the question." };
  const trade = newTrades(ws.book, ws.decisions).find((t) => t.key === key);
  if (!trade) return { error: "That trade has its reason already, or is no longer new." };
  const words = tradeWords(trade);
  const entry = decisionSchema.safeParse({
    id: decisionId(ws.decisions, trade.date),
    date: trade.date,
    kind: "trade",
    symbol: /^[A-Z0-9.\-]{1,40}$/.test(trade.underlying) ? trade.underlying : null,
    title: words.slice(0, 120),
    text: reason,
    filedAt: new Date().toISOString(),
    action: { on: trade.key, outcome: OUTCOME_OF[trade.kind] ?? "add", targetPct: null, by: null, votedClass: null, reading: null },
  });
  if (!entry.success) return { error: "A reason is 4,000 characters at most." };
  return guarded(() => saveDecisions(withDecision(ws.decisions, entry.data, new Date().toISOString())));
}

/** A push action on the signed-in person's own vault; the demo keeps no device. */
async function pushGuarded(fn: (vault: import("@/lib/vault").Vault) => Promise<void>): Promise<NotificationsState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo sends no notification; in your own copy this device gets one after each close." };
  const { openVault } = await import("@/lib/vault");
  return guarded(async () => fn(await openVault()));
}

/** Turns notifications on for this device: the browser's push address and keys, kept in the vault's push file. */
export async function savePushDeviceAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const { EMPTY_PUSH, deviceLabel, pushFileSchema, subscriptionSchema, withDevice } = await import("@/lib/push");
  let sub;
  try {
    sub = subscriptionSchema.parse(JSON.parse(String(form.get("subscription") ?? "")));
  } catch {
    return { error: "This browser handed over no push address the app can use." };
  }
  const ua = (await headers()).get("user-agent") ?? "";
  return pushGuarded(async (vault) => {
    const file = (await vault.readJson("push", pushFileSchema).catch(() => null)) ?? EMPTY_PUSH;
    await vault.writeJson("push", withDevice(file, sub, deviceLabel(ua), new Date().toISOString()));
  });
}

/** Turns notifications off for this device. */
export async function removePushDeviceAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const { EMPTY_PUSH, pushFileSchema, withoutDevices } = await import("@/lib/push");
  const endpoint = String(form.get("endpoint") ?? "");
  return pushGuarded(async (vault) => {
    const file = (await vault.readJson("push", pushFileSchema).catch(() => null)) ?? EMPTY_PUSH;
    await vault.writeJson("push", withoutDevices(file, [endpoint], new Date().toISOString()));
  });
}

/** Sends this device the test notification, so the person sees it arrive. */
export async function testPushAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const { EMPTY_PUSH, TEST_MESSAGE, pushFileSchema } = await import("@/lib/push");
  const { sendToDevices } = await import("@/lib/push-send");
  const endpoint = String(form.get("endpoint") ?? "");
  return pushGuarded(async (vault) => {
    const file = (await vault.readJson("push", pushFileSchema).catch(() => null)) ?? EMPTY_PUSH;
    const device = file.devices.find((d) => d.endpoint === endpoint);
    if (!device) throw new SyncError("This device is not turned on; turn it on first.", "push test no device");
    const r = await sendToDevices([device], TEST_MESSAGE);
    if (r.gone.length) throw new SyncError("The browser's push service no longer knows this device; turn it off and on again.", "push test gone");
    if (!r.sent) throw new SyncError("The push service did not take the notification; try again in a minute.", "push test failed");
  });
}

/**
 * Keeps a watcher in the person's words (lib/watchers.ts; Hamza, 23 Oct
 * 2026): compiled once on their own model into a test the app runs at every
 * check; words no test reads are refused with a sentence, never kept.
 */
export async function addWatcherAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo keeps no watchers; your own app compiles them with the AI." };
  const words = String(form.get("words") ?? "").replace(/\s+/g, " ").trim();
  if (words.length < 3) return { error: "Write what to watch for first." };
  if (words.length > 300) return { error: "Keep it under 300 characters." };
  const kept = ws.preferences.watchers;
  if (kept.length >= MAX_WATCHERS) return { error: `Up to ${MAX_WATCHERS} watchers; remove one first.` };
  return guarded(async () => {
    const { openVault } = await import("@/lib/vault");
    const { compileWatcher } = await import("@/lib/words-run");
    const known = [...new Set([...(ws.fullBook ?? ws.book)?.holdings.map((h) => h.symbol.toUpperCase()) ?? [], ...Object.keys(ws.records.bySymbol).map((s) => s.toUpperCase())])];
    const got = await compileWatcher(await openVault(), words, known);
    if (!got.ok) throw new SyncError(got.reason, "watcher not compiled");
    const w = watcherSchema.parse({ ...got.watcher, id: watcherId(kept.map((x) => x.id)), words, at: new Date().toISOString() });
    await savePreferences({ ...ws.preferences, watchers: [w, ...kept].slice(0, MAX_WATCHERS) });
  });
}

/** Removes a watcher; its alert clears at the next check. */
export async function removeWatcherAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo keeps no watchers." };
  const id = String(form.get("id") ?? "");
  if (!ws.preferences.watchers.some((w) => w.id === id)) return { error: "That watcher is no longer kept." };
  return guarded(() => savePreferences({ ...ws.preferences, watchers: ws.preferences.watchers.filter((w) => w.id !== id) }));
}

/** How far a listed holding moves in a session, either way, before it is an alert and an email: the person's own, kept in their preferences. */
export async function setMoveAlertAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo keeps the default; nothing is saved." };
  const pct = Number(String(form.get("pct") ?? "").replace(",", ".").replace("%", "").trim());
  if (!Number.isFinite(pct) || pct < MOVE_ALERT_MIN) return { error: `Give a move of ${MOVE_ALERT_MIN}% or more.` };
  return guarded(async () => {
    await savePreferences({ ...ws.preferences, moveAlertPct: Math.round(pct * 10) / 10 });
  });
}
