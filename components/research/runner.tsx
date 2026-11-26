"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 12_000;

/**
 * Follows a study while it is written: the run itself is on the server, in
 * the background of the request that queued it, so this only refreshes the
 * page every few seconds to show the sections as they land. Leaving the
 * page changes nothing; Notifications says when the study is ready.
 */
export function StudyRunner({ pending, total, status, stalled }: { pending: number; total: number; status: "queued" | "running" | "done" | "failed"; stalled: boolean }) {
  const router = useRouter();
  const active = (status === "queued" || status === "running") && !stalled;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [active, router]);

  if (status !== "queued" && status !== "running") return null;
  const written = total - pending;
  return (
    <div className={`mb-6 rounded-card border px-4 py-4 ${stalled ? "border-warn/40 bg-warn/10" : "border-accent bg-accent-subtle"}`}>
      <p className="text-body">
        {stalled ? `The run stopped with ${written} of ${total} sections written. Press Continue below to write the rest.` : pending === total && status === "queued" ? "Reading the filings and running the methodology's checks." : `Writing: ${written} of ${total} sections done.`}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-surface-2">
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round((written / Math.max(total, 1)) * 100)}%` }} />
      </div>
      {stalled ? null : <p className="mt-2 text-footnote text-text-secondary">Runs in the background with the AI, a few sections per call, side by side. You can leave this page; Notifications says when the study is ready.</p>}
    </div>
  );
}
