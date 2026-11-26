import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

import { setZoneSource, zoneValid, ZONE_COOKIE } from "@/lib/time";

/**
 * Where the server reads the person's zone (Hamza, 28 Oct 2026: as a
 * website does, without asking). A scheduled run holds the person's zone
 * for its own work (`withZone`); a request reads the zone the browser
 * reported in the `pos_tz` cookie (`ZoneCookie`), else the one Vercel's
 * network places the request in (`x-vercel-ip-timezone`). Read
 * synchronously from the request Next is serving, so every `localDay()`
 * on a page, an action or an `after` task is the person's day.
 */

const HELD_KEY = "__portfolioOsHeldZone";
const held: AsyncLocalStorage<string> =
  ((globalThis as Record<string, unknown>)[HELD_KEY] as AsyncLocalStorage<string> | undefined) ??
  ((globalThis as Record<string, unknown>)[HELD_KEY] = new AsyncLocalStorage<string>());

/** The header Vercel sets to the zone the request's network is in. */
export const NETWORK_ZONE_HEADER = "x-vercel-ip-timezone";

/** Runs one person's scheduled work in their zone. */
export function withZone<T>(zone: string | null | undefined, run: () => T): T {
  return zone && zoneValid(zone) ? held.run(zone, run) : run();
}

/**
 * Holds one person's zone for the rest of a loop's turn and what it awaits:
 * a scheduled run calls it first in each person's turn, so their alerts,
 * days and emails are read on their own clock.
 */
export function enterZone(zone: string | null | undefined): void {
  held.enterWith(zone && zoneValid(zone) ? zone : (undefined as unknown as string));
}

/** The zone the request being served names, the browser's before the network's. */
export function requestZone(): { zone: string; from: "browser" | "network" } | null {
  try {
    const store = workUnitAsyncStorage.getStore();
    if (!store || (store.type !== "request" && store.type !== "private-cache")) return null;
    const cookie = store.cookies.get(ZONE_COOKIE)?.value;
    if (cookie && zoneValid(cookie)) return { zone: cookie, from: "browser" };
    const header = store.headers.get(NETWORK_ZONE_HEADER);
    if (header && zoneValid(header)) return { zone: header, from: "network" };
  } catch {
    // Outside a request Next serves.
  }
  return null;
}

setZoneSource(() => held.getStore() ?? requestZone()?.zone ?? null);
