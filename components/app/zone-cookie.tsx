"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { deviceZone, ZONE_COOKIE } from "@/lib/time";

/**
 * Tells the server the device's zone (Hamza, 28 Oct 2026: as websites do,
 * without asking). The zone is kept in the `pos_tz` cookie for a year; when
 * it differs from the one the page was drawn in (a first visit, or the
 * device moved to another zone) the page is drawn again in the device's.
 */
export function ZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = deviceZone();
    if (!zone) return;
    const kept = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${ZONE_COOKIE}=`))
      ?.slice(ZONE_COOKIE.length + 1);
    if (kept && decodeURIComponent(kept) === zone) return;
    document.cookie = `${ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    router.refresh();
  }, [router]);
  return null;
}
