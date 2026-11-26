import type { Route } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/app/action-form";
import { callIdFrom } from "@/lib/public-calls";
import { fingerprintOf, hasWords, type Words } from "@/lib/receipts";
import { storageMode } from "@/lib/storage";

import { publishCallAction } from "@/app/(app)/theses/actions";

/**
 * Publish as a public call (Hamza, 9 Nov 2026, the twenty further ways): the
 * thesis's words as they stand on a public page with their receipt. Shows
 * the page's link once published; words changed since make a new call, the
 * old one staying up until taken down. The demo publishes nothing.
 */
export async function PublishCall({ words, keyOf, email }: { words: Words; keyOf: string; email: string | null }) {
  if (storageMode() === "demo" || !hasWords(words) || !email) return null;
  let published: string[] = [];
  try {
    const { registryAvailable, publicCalls } = await import("@/lib/registry");
    if (!registryAvailable()) return null;
    published = (await publicCalls(email)).map((c) => c.id);
  } catch {
    return null;
  }
  const id = callIdFrom(words.subject, fingerprintOf(words));
  const live = published.includes(id);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
      {live ? (
        <>
          <Link href={`/calls/${id}` as Route} className="text-accent-text">Public call</Link>
          <ActionForm action={publishCallAction} label="Take down" pendingLabel="Taking down" variant="ghost" size="sm" doneLabel="Down" className="inline">
            <input type="hidden" name="key" value={keyOf} />
            <input type="hidden" name="unpublish" value={id} />
          </ActionForm>
        </>
      ) : (
        <ActionForm action={publishCallAction} label="Publish as a public call" pendingLabel="Publishing" variant="ghost" size="sm" doneLabel="Published" className="inline">
          <input type="hidden" name="key" value={keyOf} />
        </ActionForm>
      )}
    </span>
  );
}
