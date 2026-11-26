import "server-only";

import { unstable_cache } from "next/cache";

import { openStatementsInbox } from "@/lib/daily-sync";
import { inboxConfig } from "@/lib/inbox-mail";
import { readSharedIssues } from "@/lib/inbox-run";
import { RECAP_NEWSLETTERS } from "@/lib/market-recap";
import { sharedRecapFor, sharedRecapsSchema, type SharedIssue, type SharedRecaps } from "@/lib/newsletters";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";

/**
 * The recap newsletter the app itself subscribes to, read once (Hamza, 18 Oct
 * 2026), for the operator alone since 20 Oct 2026 (`sharedRecapOn`): one
 * subscription never stands for everyone's, so each other person subscribes
 * with their own newsletters address. The operator
 * subscribes the app's own inbox (INBOX_ADDRESS) to the newsletter once; the
 * evening run, the morning refresh and an open app read the inbox for the
 * issues the known recap senders sent to it, proven by the receiving server,
 * and keep the week's issues in the shared data cache under the session they
 * were read for, so every instance and the next deployment open them at
 * once. A read that does not yet hold the session's own issue is not kept
 * there (the newsletter arrives about two hours after the close), and is
 * tried again at most every TRY_AGAIN_MS per instance. Nothing of anyone is
 * in it; each person's vault gets a digest read on their own key
 * (`laySharedRecapsInto` in lib/inbox-run.ts).
 */

const SENDERS = RECAP_NEWSLETTERS.map((n) => n.sender);
/** A week of issues is kept once the session's own is in it. */
const KEEP_SECONDS = 7 * 86_400;
/** Between reads that found the session's issue not yet arrived, per instance. */
const TRY_AGAIN_MS = 3 * 60 * 1000;

/** The issue is not in the inbox yet: thrown so the read is not kept, carrying the earlier issues the read did find. */
class NotYet extends Error {
  constructor(public issues: SharedIssue[]) {
    super("not yet");
  }
}

const nyDay = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

async function readNow(): Promise<SharedIssue[]> {
  const { session, problem } = await openStatementsInbox();
  if (!session) throw new SyncError(problem ?? "The app's inbox could not be opened.", "shared recap: inbox");
  try {
    return await readSharedIssues(session, SENDERS);
  } finally {
    await session.close().catch(() => undefined);
  }
}

const stored = unstable_cache(
  async (session: string): Promise<SharedRecaps> => {
    const issues = await readNow();
    if (!issues.some((i) => nyDay(i.date) === session)) throw new NotYet(issues);
    return { version: 1, session, issues, readAt: new Date().toISOString() };
  },
  ["shared-recaps-v1"],
  { revalidate: KEEP_SECONDS },
);

let lastTry: { at: number; issues: SharedIssue[] } | null = null;

export type SharedRecapAnswer = { issues: SharedIssue[]; problem: string | null };

/**
 * Whether the shared recap is read for this person: an inbox is configured,
 * this is not the demo, and their address is in SHARED_RECAP_TO (Hamza,
 * 20 Oct 2026: one subscription stands for the operator alone).
 */
export function sharedRecapOn(email: string): boolean {
  return storageMode() !== "demo" && inboxConfig() !== null && sharedRecapFor(email, process.env.SHARED_RECAP_TO);
}

/**
 * The week's issues of the shared recap, for the session that last closed
 * (YYYY-MM-DD): the kept read when it holds that session's issue, else a
 * fresh read of the inbox (the earlier issues it finds come back too). The
 * demo and a deployment without an inbox have none, and say so. Never
 * throws; a problem is a sentence for the operator.
 */
export async function loadSharedRecaps(session: string | null): Promise<SharedRecapAnswer> {
  if (storageMode() === "demo") return { issues: [], problem: null };
  if (!inboxConfig()) return { issues: [], problem: "The app's inbox is not set up (INBOX_ADDRESS and INBOX_PASSWORD), so the shared recap cannot be read." };
  if (!session) return { issues: [], problem: null };
  // Not arrived at the last look: this instance's look stands for a while, so a page open does not open the inbox each time.
  if (lastTry && Date.now() - lastTry.at < TRY_AGAIN_MS) return { issues: lastTry.issues, problem: null };
  try {
    const issues = sharedRecapsSchema.parse(await stored(session)).issues;
    lastTry = null;
    return { issues, problem: null };
  } catch (e) {
    if (e instanceof NotYet) {
      lastTry = { at: Date.now(), issues: e.issues };
      return { issues: e.issues, problem: null };
    }
    console.error(`[shared-recap] ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return { issues: lastTry?.issues ?? [], problem: e instanceof SyncError ? e.message : "The shared recap could not be read; it is tried again on the next run." };
  }
}
