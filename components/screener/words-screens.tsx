import { ActionForm } from "@/components/app/action-form";
import { removeScreenAction, askScreenAction } from "@/app/(app)/screener/actions";
import { MAX_WORD_SCREENS, screenFilterWords, type WordScreen } from "@/lib/screen-words";
import { longDate } from "@/lib/time";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/**
 * Ask in words (lib/screen-words.ts): the box, then each kept screen with
 * its filters in the app's words before its companies, drawn by the page.
 */
export function AskInWords({ editable, hasModel, count }: { editable: boolean; hasModel: boolean; count: number }) {
  if (!editable) return null;
  return (
    <ActionForm action={askScreenAction} label="Screen" pendingLabel="Compiling" doneLabel="Kept below" className="card mb-4 px-4 py-4">
      <label className="block text-subhead">
        Ask in words
        <input name="words" className={field} maxLength={300} placeholder="Cash-rich software with operating margins over 30%" required />
      </label>
      <p className="mt-1.5 mb-3 text-footnote text-text-tertiary">{hasModel ? `The AI turns the words into filters on the filings' figures once; the app runs them on the same companies as your classes. Up to ${MAX_WORD_SCREENS} kept${count ? `, ${count} now` : ""}.` : "The AI is not set up on this deployment yet."}</p>
    </ActionForm>
  );
}

export function WordScreenHead({ s, total, editable }: { s: WordScreen; total: number; editable: boolean }) {
  return (
    <div className="mb-2 px-4">
      <p className="text-subhead">&ldquo;{s.words}&rdquo;</p>
      <p className="mt-0.5 text-footnote text-text-secondary">
        Read as: {screenFilterWords(s).join("; ")}. {total} {total === 1 ? "company" : "companies"} on the screen.{s.cannot.length ? ` ${s.cannot.join(" ")}` : ""}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-caption text-text-tertiary">
        <span>Kept {longDate(s.at.slice(0, 10))}</span>
        {editable ? (
          <ActionForm action={removeScreenAction} label="Remove" variant="ghost" size="sm" doneLabel="Removed">
            <input type="hidden" name="id" value={s.id} />
          </ActionForm>
        ) : null}
      </div>
    </div>
  );
}
