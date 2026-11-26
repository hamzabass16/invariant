/**
 * How fresh the figures on a screen are, said the same way everywhere: live
 * while the US market is open, the last close, every morning, every hour, a
 * statement as it was uploaded, a frozen snapshot or a fictional sample.
 * Pure, so the badge (components/ui/freshness.tsx) and the checks read one
 * table. A figure older than its rhythm allows is marked stale, never hidden.
 */
import { daysBetween, shortDate } from "@/lib/time";

export const FRESH_KINDS = ["live", "closed", "close", "daily", "hourly", "weekly", "upload", "snapshot", "sample"] as const;
export type FreshKind = (typeof FRESH_KINDS)[number];

/** What each kind says, and how many days may pass before a dated figure is stale (null: never stale). */
export const FRESH: Record<FreshKind, { label: string; rhythm: string; staleAfterDays: number | null }> = {
  live: { label: "Live", rhythm: "Prices every 30 seconds while the US market is open.", staleAfterDays: null },
  closed: { label: "Live", rhythm: "A live card. The US market is closed, so the last close is shown; prices move again at the open.", staleAfterDays: 4 },
  close: { label: "At the close", rhythm: "Read after the US market closes, kept until the next close.", staleAfterDays: 4 },
  daily: { label: "Daily", rhythm: "Fetched every morning, at the morning refresh.", staleAfterDays: 4 },
  hourly: { label: "Hourly", rhythm: "Read again at most an hour after the last read.", staleAfterDays: 4 },
  weekly: { label: "Weekly", rhythm: "Built on the schedule you keep on Reviews.", staleAfterDays: 10 },
  upload: { label: "Uploaded", rhythm: "As uploaded. Keep a Flex token or a broker key on Setup and it is fetched every morning.", staleAfterDays: 7 },
  snapshot: { label: "Snapshot", rhythm: "A frozen snapshot. It never updates.", staleAfterDays: null },
  sample: { label: "Sample", rhythm: "Fictional figures for the demo.", staleAfterDays: null },
};

export type Fresh = {
  kind: FreshKind;
  /** The short word on the badge. */
  label: string;
  /** The date or time beside it ("14 Oct"), or null. */
  when: string | null;
  /** The sentence behind it, for the badge's title and screen readers. */
  rhythm: string;
  stale: boolean;
};

/** The badge for a kind and the day its figures are as of (yyyy-mm-dd), judged on `today` (the person's day). */
export function freshness(kind: FreshKind, asOf: string | null, today: string): Fresh {
  const f = FRESH[kind];
  const age = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? daysBetween(asOf, today) : null;
  const stale = f.staleAfterDays !== null && age !== null && age > f.staleAfterDays;
  return { kind, label: f.label, when: asOf && /^\d{4}-\d{2}-\d{2}/.test(asOf) ? shortDate(asOf.slice(0, 10)) : null, rhythm: stale ? `${f.rhythm} Older than that rhythm allows: check Setup.` : f.rhythm, stale };
}

/** What a live card's badge says beside "Live" while the market is shut. */
export const CLOSED_REASON = "Markets have closed";

/**
 * A live card outside the session: the same figures and date, still badged
 * Live, with why it is not moving beside it ("Markets have closed") rather
 * than "At the close" or "Daily", which read as a change of source when the
 * only change was the bell (Hamza, 15 and 16 Oct 2026: a card's freshness
 * never changes kind; shut, it says the reason).
 */
export function asClosed(f: Fresh): Fresh {
  return { ...f, kind: "closed", label: FRESH.closed.label, when: f.when ? `${CLOSED_REASON} · ${f.when}` : CLOSED_REASON, rhythm: f.stale ? `${FRESH.closed.rhythm} Older than that rhythm allows: check Setup.` : FRESH.closed.rhythm };
}

/**
 * The badge on a live card that holds the last session's prices while the
 * market is shut: "Live · Markets have closed · 16 Oct", on the session's
 * own date, never the statement's (Hamza, 17 Oct 2026: on Saturday the cards
 * said 15 Oct, the statement's date, when Friday's close was the last).
 */
export function closedOn(session: string): Fresh {
  return asClosed(freshness("close", session, session));
}

/** The sources that refresh the book by themselves, as the morning refresh names them. */
const FETCHED = new Set(["ibkr_flex", "snaptrade", "etoro", "statements_inbox"]);

/**
 * The book's own freshness: a frozen snapshot or a fictional sample in the
 * demo; daily when a source fetches it every morning; otherwise as uploaded.
 * `steps` is the last refresh's line per source. A fetched source whose last
 * try failed still fetches the book (Hamza, 27 Oct 2026: a missed morning
 * read "Uploaded"), so the badge stays Daily, turns amber and says why.
 */
export function bookFreshness(input: { mode: "demo" | "drive"; showcase: boolean; asOf: string | null; steps: readonly { source: string; outcome: string; sentence: string }[] }, today: string): Fresh | null {
  if (input.mode === "demo") return freshness(input.showcase ? "snapshot" : "sample", input.showcase ? input.asOf : null, today);
  if (!input.asOf) return null;
  const fetched = input.steps.filter((s) => FETCHED.has(s.source));
  if (fetched.some((s) => s.outcome === "ok")) return freshness("daily", input.asOf, today);
  const missed = fetched.find((s) => s.outcome === "failed");
  if (!missed) return freshness("upload", input.asOf, today);
  const f = freshness("daily", input.asOf, today);
  return { ...f, stale: true, rhythm: `${FRESH.daily.rhythm} The last fetch failed: ${missed.sentence}` };
}
