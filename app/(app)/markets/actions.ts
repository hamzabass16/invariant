"use server";

import { revalidatePath } from "next/cache";

import { providerFor } from "@/lib/hosted-model";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type RecapState = { error: string | null; message?: string | null };

/** Where "What happened" comes from: the recap newsletters forwarded, a recap the person's Claude writes, or both. One must stay on. */
export async function setRecapAction(_prev: RecapState, form: FormData): Promise<RecapState> {
  const ws = await getWorkspace();
  const newsletter = form.get("newsletter") === "on";
  const claude = form.get("claude") === "on";
  if (!newsletter && !claude) return { error: "Keep at least one: the newsletters, or the AI's recap." };
  try {
    await savePreferences({ ...ws.preferences, recap: { newsletter, claude } });
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/");
  revalidatePath("/setup");
  revalidatePath("/after-close");
  return { error: null };
}

/** Write it now: the last session's recap on the person's Claude, with why each holding moved, as the evening run would, replacing a failed one; a move past the person's alert is alerted. */
export async function writeRecapNowAction(): Promise<RecapState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo shows a fictional recap and calls no model." };
  if (ws.error && !ws.setup) return { error: ws.error };
  try {
    const { loadMarketDay } = await import("@/lib/markets-feed");
    const { day } = await loadMarketDay(new Date(), "full");
    if (!day) return { error: "The last session could not be read yet, so there is nothing to recap. Try again in a few minutes." };
    const { isTradingHours, lastSession } = await import("@/lib/live");
    if (!isTradingHours(new Date()) && day.session < lastSession(new Date())) return { error: "Today's close is read from 16:20 in New York; the recap can be written once it is in. Try again in a few minutes." };
    const { openVault } = await import("@/lib/vault");
    const { movesFor, writeRecapInto } = await import("@/lib/market-recap-run");
    const vault = await openVault();
    const provider = await providerFor(vault);
    const now = new Date();
    const recap = await writeRecapInto(vault, provider, day, now, await movesFor(vault, day, now), ws.preferences.moveAlertPct);
    if (recap.status === "written") {
      // A holding that moved the person's alert or more is an alert at once, as after the evening run.
      const { checkAlerts } = await import("@/lib/alerts-run");
      await checkAlerts(vault, ws.operator.email, now).catch((e: unknown) => {
        if (!(e instanceof SyncError)) throw e;
      });
    }
    revalidatePath("/");
    revalidatePath("/notifications");
    return recap.status === "written" ? { error: null, message: null } : { error: recap.sentence ?? "The recap could not be written." };
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
}
