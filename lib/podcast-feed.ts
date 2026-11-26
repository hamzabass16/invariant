import "server-only";

import { feedShut } from "@/lib/licences";
import { episodeUrl, parseEpisodePage, parseShowPage, showTitleOf, showUrl, type Listed, type Transcript } from "@/lib/podcasts";

/**
 * podscripts.co, read-only (Hamza, 20 Oct 2026): a show's page for its
 * episodes and an episode's page for its transcript, the show's and the
 * episode's names alone in the address, kept an hour in the shared data
 * cache so a show many people follow is read once. The only file that names
 * the site; the guard holds that. A page that cannot be read is a sentence,
 * never an empty list.
 */

const TIMEOUT_MS = 15_000;
const REVALIDATE_SECONDS = 3600;

async function page(url: string, what: string): Promise<{ html: string } | { problem: string }> {
  // Shut on a deployment that shows licensed sources alone (lib/licences.ts).
  const shut = feedShut(url);
  if (shut) return { problem: shut };
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "text/html", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; Invariant podcasts)" } });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(`[podcasts] ${what} ${timedOut ? "timed out" : "failed"}`);
    return { problem: timedOut ? `podscripts.co did not answer within ${TIMEOUT_MS / 1000} seconds` : "podscripts.co could not be reached" };
  }
  if (!res.ok) return { problem: res.status === 404 ? "podscripts.co has no such page" : `podscripts.co answered ${res.status}` };
  try {
    return { html: await res.text() };
  } catch {
    return { problem: "podscripts.co's answer could not be read" };
  }
}

/** A show's episodes as its page lists them, newest first, with its title; a sentence when the page cannot be read or lists none. */
export async function loadShow(slug: string): Promise<{ title: string | null; episodes: Listed[] } | { problem: string }> {
  const got = await page(showUrl(slug), "show page");
  if ("problem" in got) return got;
  try {
    return { title: showTitleOf(got.html), episodes: parseShowPage(got.html, slug) };
  } catch {
    return { problem: "podscripts.co's page for the show lists no episodes the app can read" };
  }
}

/** One episode's transcript; a sentence when the page cannot be read or carries none. */
export async function loadTranscript(show: string, slug: string): Promise<Transcript | { problem: string }> {
  const got = await page(episodeUrl(show, slug), "episode page");
  if ("problem" in got) return got;
  try {
    return parseEpisodePage(got.html);
  } catch {
    return { problem: "the episode's page on podscripts.co carries no transcript yet" };
  }
}
