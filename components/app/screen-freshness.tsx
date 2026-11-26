import { PageFreshness } from "@/components/ui/freshness";
import { freshness, type FreshKind } from "@/lib/freshness";
import { localDay } from "@/lib/time";
import { getWorkspace } from "@/lib/workspace";

/**
 * A screen's freshness badge, read from the same workspace the screen read:
 * the book's own (a snapshot or sample in the demo, daily when a source
 * fetches it, as uploaded otherwise), or a kind of its own (hourly markets,
 * the daily calendar, the weekly review) with the day it is as of. Prices
 * now are badged on the cards that lay them, never here.
 */
export async function ScreenFreshness({ kind, asOf = null }: { kind?: FreshKind; asOf?: string | null }) {
  const ws = await getWorkspace();
  if (ws.mode === "demo" || !kind) return <PageFreshness fresh={ws.fresh} />;
  return <PageFreshness fresh={freshness(kind, asOf, localDay())} />;
}
