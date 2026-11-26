import { z } from "zod";

import { newsWorthy, type AlertItem } from "@/lib/alerts";
import { maskMoney } from "@/lib/stealth";

/**
 * Notifications on the person's phone and browser (Hamza, 20 Oct 2026: "send
 * one at market close recapping all the notifications under one notification
 * message"). A device is turned on from Notifications; the browser gives a
 * push address and its keys, kept in the vault's `push` file. After each US
 * close the evening run sends one notification to each device, recapping the
 * alerts that fired since the last one; nothing new, nothing sent. The text is
 * the alerts' titles with every amount of money masked, since it shows on a
 * lock screen. Pure: the file, the recap and when one is due;
 * lib/push-send.ts sends it.
 */

export const MAX_DEVICES = 8;
/** Alert ids remembered as told. */
export const MAX_SENT = 500;
/** An alert older than this is never recapped, so turning a device on does not bring up the past. */
export const RECAP_DAYS = 3;

/** A push address is the browser's own push service, https and nothing else. */
const pushEndpoint = z
  .string()
  .max(1000)
  .refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && !x.username && !x.password && x.hostname.includes(".");
    } catch {
      return false;
    }
  }, "a push service's https address");

export const deviceSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
  /** When it was turned on (ISO instant). */
  addedAt: z.string(),
  /** A few words naming the device: the browser and the system. */
  label: z.string().max(60).default("A browser"),
});
export type Device = z.infer<typeof deviceSchema>;

export const pushFileSchema = z.object({
  version: z.literal(1),
  devices: z.array(deviceSchema).max(MAX_DEVICES),
  /** The session the last recap was sent for, YYYY-MM-DD. */
  lastSession: z.string().nullable().default(null),
  /** When it went (ISO instant). */
  lastSentAt: z.string().nullable().default(null),
  /** The alerts already recapped, by id, so each is told once. */
  sentIds: z.array(z.string().max(260)).max(MAX_SENT).default([]),
  updated: z.string(),
});
export type PushFile = z.infer<typeof pushFileSchema>;
export const EMPTY_PUSH: PushFile = { version: 1, devices: [], lastSession: null, lastSentAt: null, sentIds: [], updated: "" };

/** The subscription a browser hands over, as its toJSON() gives it. */
export const subscriptionSchema = z.object({ endpoint: pushEndpoint, keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }) });

/** The file with this device turned on, replacing the same address; the oldest goes past MAX_DEVICES. */
export function withDevice(file: PushFile, sub: z.infer<typeof subscriptionSchema>, label: string, now: string): PushFile {
  const rest = file.devices.filter((d) => d.endpoint !== sub.endpoint);
  const devices = [...rest, { endpoint: sub.endpoint, keys: sub.keys, addedAt: now, label: label.slice(0, 60) || "A browser" }].slice(-MAX_DEVICES);
  return pushFileSchema.parse({ ...file, devices, updated: now });
}

/** The file without the devices at these addresses (turned off, or gone at the push service). */
export function withoutDevices(file: PushFile, endpoints: readonly string[], now: string): PushFile {
  const gone = new Set(endpoints);
  return pushFileSchema.parse({ ...file, devices: file.devices.filter((d) => !gone.has(d.endpoint)), updated: now });
}

/** A device's name from its browser's user agent, in a few words. */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const system = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  return system ? `${browser} on ${system}` : browser;
}

/** Whether the session's recap is still owed: devices to send to, and none sent for it. */
export const recapDue = (file: PushFile | null, session: string): boolean => !!file?.devices.length && file.lastSession !== session;

export type PushMessage = { title: string; body: string; url: string; tag: string };

/** The alerts the recap covers: not told before, fired in the last RECAP_DAYS, not dismissed, worth telling; the most pressing first. */
export function recapItems(items: readonly AlertItem[], file: PushFile, now: Date): AlertItem[] {
  const told = new Set(file.sentIds);
  const since = new Date(now.getTime() - RECAP_DAYS * 86_400_000).toISOString();
  return items.filter((i) => !told.has(i.id) && i.firedAt > since && i.dismissedAt === null && newsWorthy(i)).sort((a, b) => (a.tone === b.tone ? b.firedAt.localeCompare(a.firedAt) : ORDER[a.tone] - ORDER[b.tone]));
}

/** The file after a session's recap went (or was owed nothing): the session, the instant and the ids told. */
export function recapSent(file: PushFile, session: string, ids: readonly string[], now: string): PushFile {
  return pushFileSchema.parse({ ...file, lastSession: session, lastSentAt: now, sentIds: [...ids, ...file.sentIds.filter((x) => !ids.includes(x))].slice(0, MAX_SENT), updated: now });
}
const ORDER: Record<AlertItem["tone"], number> = { danger: 0, warn: 1, info: 2, ok: 3 };

const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One notification recapping the alerts: how many, the most pressing titles, every amount masked. Null with none. */
export function closeRecap(items: readonly AlertItem[], session: string): PushMessage | null {
  if (!items.length) return null;
  const shown = items.slice(0, 3).map((i) => maskMoney(i.title).replace(/\s+/g, " ").trim());
  const more = items.length - shown.length;
  return {
    title: `After the close, ${dayWords(session)}: ${items.length} new alert${items.length === 1 ? "" : "s"}`,
    body: `${shown.join("\n")}${more ? `\nAnd ${more} more on Notifications.` : ""}`.slice(0, 600),
    url: "/notifications",
    tag: `close-${session}`,
  };
}

/** The notification a device sends itself when it is turned on, so the person sees it works. */
export const TEST_MESSAGE: PushMessage = { title: "Invariant notifications are on", body: "After each US close, one notification recaps what fired that day.", url: "/notifications", tag: "test" };
