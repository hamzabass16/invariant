import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { addWatcherAction, removeWatcherAction } from "@/app/(app)/notifications/actions";
import { MAX_WATCHERS, readsInSentence, type Watcher } from "@/lib/watchers";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export type WatcherView = { w: Watcher; readings: { symbol: string; reading: number | null; met: boolean }[] };

/**
 * Watchers in the person's words (lib/watchers.ts): each with the test the
 * app runs, today's reading and whether it holds; the box to add one, which
 * compiles the words on their own model once.
 */
export function WatchersCard({ watchers, editable, hasModel }: { watchers: WatcherView[]; editable: boolean; hasModel: boolean }) {
  return (
    <ListSection
      header={`Watchers · ${watchers.length}`}
      footer={`Each is turned into one figure at one level by the AI, once, and read by the app at every check; one that holds is an alert above and in the email. Up to ${MAX_WATCHERS}.`}
    >
      {watchers.map(({ w, readings }) => {
        const met = readings.filter((r) => r.met);
        const read = readings.filter((r) => r.reading !== null);
        const now = w.subject.kind === "holdings" ? `${met.length} of ${read.length} holdings${met.length ? `: ${met.map((r) => r.symbol).join(", ")}` : ""}` : read.length ? `Now ${n(read[0].reading!)}` : "No reading yet";
        return (
          <ListRow
            key={w.id}
            wrap
            label={<span>&ldquo;{w.words}&rdquo;</span>}
            detail={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Read as {readsInSentence(w.reads)}. {now}.
                </span>
                {editable ? (
                  <ActionForm action={removeWatcherAction} label="Remove" variant="ghost" size="sm" doneLabel="Removed">
                    <input type="hidden" name="id" value={w.id} />
                  </ActionForm>
                ) : null}
              </span>
            }
            value={<StatusPill tone={met.length ? "warn" : read.length ? "ok" : "neutral"}>{met.length ? "Holds" : read.length ? "Quiet" : "Unread"}</StatusPill>}
          />
        );
      })}
      {editable ? (
        <div className="px-4 py-3">
          <ActionForm action={addWatcherAction} label="Watch for it" pendingLabel="Compiling" doneLabel="Watching">
            <label className="block text-subhead">
              Tell me when
              <input name="words" className={field} maxLength={300} placeholder="MA's operating margin falls below 50%" required />
            </label>
            <p className="mt-1.5 mb-3 text-footnote text-text-tertiary">{hasModel ? "A company's price, weight or a figure from its filings, any holding's, or a market indicator, at or beyond a level." : "The AI is not set up on this deployment yet."}</p>
          </ActionForm>
        </div>
      ) : !watchers.length ? (
        <ListRow wrap label="No watcher" detail="In your own app, write what to be told of in your words, and it is checked twice a day." />
      ) : null}
    </ListSection>
  );
}
