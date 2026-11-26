/**
 * What a failed trip to the server was, read from the error the browser
 * gives (Hamza, 23 Oct 2026: coming back to the app showed Next's "This page
 * couldn't load"). A Mac waking from sleep fires the page's first requests
 * before the network is back, a deployment since the page opened leaves its
 * actions and chunks unknown to the server, and a function past its time
 * answers with a page instead of the action's answer; each of these threw
 * into the whole page. Pure: no network, no window.
 */
export type Unreached = "offline" | "updated" | "answer";

const OFFLINE = /failed to fetch|load failed|networkerror|network request failed|network connection was lost|internet connection appears to be offline/i;
// Turbopack's own words for a chunk the page's version does not know ("can't infer type of chunk from URL", Hamza, 5 Nov 2026: a tile opened a company page right after a deployment) are a new version too.
const UPDATED = /was not found on the server|chunkloaderror|loading chunk|loading css chunk|dynamically imported module|importing a module script failed|infer type of chunk|failed to load chunk/i;
const ANSWER = /unexpected response was received from the server/i;

export function unreachedKind(e: unknown): Unreached | null {
  if (!e || typeof e !== "object") return null;
  const name = "name" in e && typeof e.name === "string" ? e.name : "";
  const message = "message" in e && typeof e.message === "string" ? e.message : "";
  const text = `${name} ${message}`;
  if (UPDATED.test(text) || name === "UnrecognizedActionError") return "updated";
  if (OFFLINE.test(text)) return "offline";
  if (ANSWER.test(text)) return "answer";
  return null;
}

/** The sentence beside a button whose action did not go through; nothing of the person's figures is in it. */
export function unreachedSentence(e: unknown): string {
  switch (unreachedKind(e)) {
    case "offline":
      return "The app could not be reached, so nothing was changed. Check the connection and try again.";
    case "updated":
      return "The app was updated since this page opened. Reload the page and try again.";
    case "answer":
      return "The server did not finish this one, so it may not have been kept. Try again.";
    default:
      return "That did not go through. Try again.";
  }
}

/** Whether a page that failed this way mends itself on a reload: the network back, or the new deployment's own page. */
export const mendsOnReload = (e: unknown): boolean => {
  const kind = unreachedKind(e);
  return kind === "offline" || kind === "updated";
};

/** How long after one automatic reload a second failure shows its card instead of reloading again. */
export const RELOAD_GUARD_MS = 60_000;

/** Whether the page may reload by itself now, given when it last did so (null: never in this tab). */
export function mayReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || !Number.isFinite(lastReloadAt) || now - lastReloadAt > RELOAD_GUARD_MS;
}

/** What a screen that failed says in place of Next's own page: whether it mends by itself (`mends`, a reload not yet tried this minute) or what failed. */
export function pageFailedWords(e: unknown, mends: boolean): { title: string; sentence: string } {
  const digest = e && typeof e === "object" && "digest" in e && typeof e.digest === "string" ? e.digest : null;
  const kind = unreachedKind(e);
  if (mends && kind === "offline") return { title: "Waiting for the connection", sentence: "The app could not be reached, as often happens right after the computer wakes. The screen loads again by itself once the connection is back." };
  if (mends && kind === "updated") return { title: "Loading the new version", sentence: "The app was updated since this page opened, so it is loading the new version." };
  const title = "This screen could not be shown";
  if (kind === "offline") return { title, sentence: "The app still could not be reached. Check the connection, then reload." };
  if (kind === "updated") return { title, sentence: "The new version did not load. Reload to try again." };
  if (kind === "answer") return { title, sentence: "The server did not finish in time. Reload to try again." };
  if (digest) return { title, sentence: "The server could not draw it just now. Reload to try again." };
  return { title, sentence: "Something on it failed in the browser. Reload to try again." };
}

/**
 * The most one upload may carry (Hamza, 19 Nov 2026: a new methodology PDF
 * came back as "The server did not finish this one"). The host refuses a
 * request over about 4.5 MB before the app sees it, with a page and not the
 * action's answer, so the browser checks first and says what to do.
 */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * The most a document sent straight from the browser to the person's own
 * Google Drive may weigh (Hamza, 19 Nov 2026: "do it for the user's drive"):
 * the host's limit does not apply there, and a PDF this size still fits the
 * model's request once encoded.
 */
export const DIRECT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** The sentence for files too large to send, else null. */
export function uploadTooLarge(sizes: readonly number[], max: number = UPLOAD_MAX_BYTES): string | null {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= max) return null;
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
  const what = sizes.length > 1 ? "Those files come to" : "That file is";
  return `${what} ${mb(total)} MB; the most the app takes at once is ${mb(max)} MB. Save it as a PDF without images, or as plain text, and upload that.`;
}
