import "server-only";

import webpush from "web-push";

import { alertsFileSchema } from "@/lib/alerts";
import { closeRecap, EMPTY_PUSH, pushFileSchema, recapDue, recapItems, recapSent, withoutDevices, type Device, type PushFile, type PushMessage } from "@/lib/push";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";
import { contactAddress } from "@/lib/deployment";

/**
 * The one path that sends a notification to a person's device (lib/push.ts):
 * Web Push, signed with the deployment's VAPID key, the message encrypted for
 * the device so the browser's push service (Apple's, Google's, Mozilla's)
 * carries it without reading it. Sent only to the devices the person turned
 * on, kept in their own vault; a device the push service says is gone is
 * removed. Never logs an address or a message.
 */

/** The deployment's public key, for a browser to subscribe with; null when push is not set up. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

/** Why this deployment cannot send notifications, as a sentence; null when it can. */
export function pushProblem(): string | null {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return "Notifications on your devices are not set up on this deployment yet (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY).";
  return null;
}

/** Who the push services may write to about this deployment: VAPID_SUBJECT, else its contact address, else its own address. */
function pushSubject(): string {
  const own = process.env.VAPID_SUBJECT?.trim();
  if (own) return own;
  const contact = contactAddress();
  if (contact) return `mailto:${contact}`;
  const host = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "localhost").trim();
  return `https://${host}`;
}

let ready = false;
function configure(): void {
  if (ready) return;
  const problem = pushProblem();
  if (problem) throw new SyncError(problem, "push not configured");
  webpush.setVapidDetails(pushSubject(), process.env.VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim());
  ready = true;
}

/** Sends one message to each device; the ones the push service says are gone come back to be removed. */
export async function sendToDevices(devices: readonly Device[], message: PushMessage): Promise<{ sent: number; gone: string[]; failed: number }> {
  configure();
  const payload = JSON.stringify(message);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, payload, { TTL: 12 * 3600, urgency: "normal", topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined });
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0;
        if (status === 404 || status === 410) gone.push(d.endpoint);
        else {
          failed += 1;
          console.error(`[push] a device answered ${status || "with an error"}`);
        }
      }
    }),
  );
  return { sent, gone, failed };
}

/**
 * The recap after a close: the alerts that fired since the last one, in one
 * notification to each device the person turned on; nothing new, nothing
 * sent. Once per session. Null when there is no device or it already went.
 */
export async function sendCloseRecapInto(vault: Vault, session: string, now: Date): Promise<{ sent: number; alerts: number } | null> {
  if (pushProblem()) return null;
  const file: PushFile = (await vault.readJson("push", pushFileSchema).catch(() => null)) ?? EMPTY_PUSH;
  if (!recapDue(file, session)) return null;
  const alerts = await vault.readJson("alerts", alertsFileSchema).catch(() => null);
  const items = recapItems(alerts?.items ?? [], file, now);
  const message = closeRecap(items, session);
  const iso = now.toISOString();
  if (!message) {
    await vault.writeJson("push", recapSent(file, session, [], iso));
    return { sent: 0, alerts: 0 };
  }
  const r = await sendToDevices(file.devices, message);
  const latest = (await vault.readJson("push", pushFileSchema).catch(() => null)) ?? file;
  await vault.writeJson("push", recapSent(r.gone.length ? withoutDevices(latest, r.gone, iso) : latest, session, items.map((i) => i.id), iso));
  return { sent: r.sent, alerts: items.length };
}
