"use server";

import { revalidatePath } from "next/cache";

import { loadShow } from "@/lib/podcast-feed";
import { showSlugOf, withoutShow, withShow } from "@/lib/podcasts";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { getWorkspace, podcastsFor, savePodcasts } from "@/lib/workspace";

export type PodcastState = { error: string | null };

/**
 * Follows a show (Hamza, 20 Oct 2026): its podscripts.co address or slug,
 * checked by reading the show's page once, so a show podscripts.co does not
 * carry is a sentence, never a show that reads nothing.
 */
export async function addPodcastAction(_prev: PodcastState, form: FormData): Promise<PodcastState> {
  const slug = showSlugOf(String(form.get("show") ?? ""));
  if (!slug) return { error: "Paste the show's address on podscripts.co, such as podscripts.co/podcasts/all-in-with-chamath-jason-sacks-friedberg." };
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo's podcasts are fictional. In your own app, the shows you follow are kept in your vault." };
  const kept = await podcastsFor(ws);
  if (kept.error) return { error: kept.error };
  if (kept.file.shows.some((s) => s.slug === slug)) return { error: "You follow that show already." };
  const got = await loadShow(slug);
  if ("problem" in got) return { error: `${got.problem[0]!.toUpperCase()}${got.problem.slice(1)}. Check the address on podscripts.co.` };
  try {
    await savePodcasts(withShow(kept.file, { slug, title: (got.title ?? slug).slice(0, 200), addedAt: localDay() }, new Date().toISOString()));
  } catch (e) {
    if (e instanceof SyncError || e instanceof Error) return { error: e.message };
    throw e;
  }
  revalidatePath("/setup");
  revalidatePath("/after-close");
  return { error: null };
}

/** Stops following a show; its write-ups go with it. */
export async function removePodcastAction(_prev: PodcastState, form: FormData): Promise<PodcastState> {
  const slug = String(form.get("show") ?? "");
  const ws = await getWorkspace();
  const kept = await podcastsFor(ws);
  if (kept.error) return { error: kept.error };
  if (!kept.file.shows.some((s) => s.slug === slug)) return { error: "That show is not followed." };
  try {
    await savePodcasts(withoutShow(kept.file, slug, new Date().toISOString()));
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/setup");
  revalidatePath("/after-close");
  return { error: null };
}
