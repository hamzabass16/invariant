"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, savePreferences } from "@/lib/workspace";

/**
 * Finishes Welcome: notes the day in the person's preferences, so Welcome
 * sends them to the Dashboard from then on, and opens Setup with the tour of
 * their own app (lib/tour.ts TOUR_APP); the demo opens Setup alone.
 */
export async function finishWelcomeAction(): Promise<void> {
  const ws = await getWorkspace();
  if (ws.setup) {
    try {
      await savePreferences({ ...ws.preferences, welcomed: new Date().toISOString() });
    } catch (e) {
      // A vault that cannot be written still opens the app; Welcome offers the second part again next time.
      if (!(e instanceof SyncError)) throw e;
    }
  }
  revalidatePath("/", "layout");
  redirect(storageMode() === "drive" ? "/setup?built=1&tour=1" : "/setup?built=1");
}
