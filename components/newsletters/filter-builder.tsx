import type { Route } from "next";
import Link from "next/link";

import { addSendersAction } from "@/app/(app)/newsletters/actions";
import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { SenderRow } from "@/components/newsletters/sender-row";
import { ListRow, ListSection } from "@/components/ui/list";
import { BACKFILL_DAYS, filterSenders, FINDER_DAYS, finderPrompt, gmailFilter, gmailFilterUrl, gmailSearchUrl, keptSenders, proposedSenders, removedSenders, type NewsletterSendersFile } from "@/lib/newsletters";

/**
 * The Gmail filter, written for the person instead of typed into Gmail's
 * search bar (Hamza, 18 Oct 2026). Their own Claude finds the recurring
 * investing newsletters of the last month through its Gmail connector and
 * hands them to Invariant through the connector (the prompt is here to
 * copy); they land below as proposals the person keeps or removes, and
 * anyone can add senders by hand, now or after the first filter was made
 * (a removed sender can be kept again). The kept senders make the filter, and
 * Gmail's own Create filter box opens with the From line filled in; the
 * person ticks Forward it to and clicks Create filter. Nothing is created
 * from here. While the recap newsletter is on, its sender is always in the
 * filter (Hamza, 20 Oct 2026: the recap comes through the same forward), and
 * its issues open What happened today on At the Close, apart from the
 * Newsletters.
 */
export function FilterBuilder({ address, file, error, recap = null }: { address: string | null; file: NewsletterSendersFile; error: string | null; recap?: { name: string; sender: string } | null }) {
  const proposed = proposedSenders(file);
  const kept = keptSenders(file);
  const removed = removedSenders(file);
  const addresses = filterSenders(
    kept.map((k) => k.address),
    recap ? [recap.sender] : [],
  );
  const recapRow = recap && !kept.some((k) => k.address === recap.sender.toLowerCase()) ? recap : null;
  const inFilter = kept.length + (recapRow ? 1 : 0);
  const filter = gmailFilter(addresses);
  const open = gmailFilterUrl(addresses);
  const prompt = finderPrompt(address);
  return (
    <div>
      <div className="mb-8">
        <p className="mb-2 font-semibold">Let your Claude find them</p>
        <p className="mb-2 text-subhead text-text-secondary">
          With the Gmail connector and the Invariant connector on in Claude (the{" "}
          <Link href={"/setup" as Route} className="text-accent-text underline underline-offset-2">
            Setup
          </Link>{" "}
          screen shows how to add Invariant), paste this into a chat. Claude reads your last {FINDER_DAYS} days of mail for newsletters that keep coming about investing, hands them to this screen, and
          forwards the last {BACKFILL_DAYS} days&rsquo; worth to your address so the screen fills at once. It makes nothing in Gmail; you decide below, and the filter is made by you in Gmail.
        </p>
        <div className="flex items-start justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
          <p className="min-w-0 whitespace-pre-wrap text-footnote text-text-secondary">{prompt}</p>
          <CopyButton text={prompt} label="Copy prompt" />
        </div>
      </div>

      {error ? <p className="mb-6 text-footnote text-danger">{error}</p> : null}

      {proposed.length ? (
        <ListSection grid header={`Found by your Claude, ${proposed.length} to decide`} footer="Keep the ones you read as newsletters; a removed sender is not proposed again.">
          {proposed.map((s) => (
            <SenderRow key={s.address} sender={s} />
          ))}
        </ListSection>
      ) : null}

      <ListSection
        grid
        header={inFilter ? `In the filter, ${inFilter}` : "In the filter"}
        footer={kept.length ? "Remove any at any time, before or after the filter is made in Gmail." : recapRow ? "The recap alone so far. Let your Claude find your other newsletters, or add them below." : "No sender yet. Let your Claude find them, or add them below."}
      >
        {recapRow ? <ListRow wrap label={recapRow.name} detail={<><span className="data">{recapRow.sender}</span> · Always in the filter. Its issues open What happened today on At the Close, apart from the Newsletters.</>} /> : null}
        {kept.map((s) => (
          <SenderRow key={s.address} sender={s} />
        ))}
      </ListSection>

      {removed.length ? (
        <details className="mb-8">
          <summary className="cursor-pointer px-4 text-footnote text-text-secondary">
            Removed, {removed.length}: not proposed again. Show
          </summary>
          <ListSection className="mt-3 mb-0">
            {removed.map((s) => (
              <SenderRow key={s.address} sender={s} />
            ))}
          </ListSection>
        </details>
      ) : null}

      <ActionForm action={addSendersAction} label="Add" variant="secondary" size="sm" doneLabel="Added" className="mb-8">
        <label className="block text-subhead text-text-secondary" htmlFor="newsletter-senders">
          Add senders of your own: their addresses, or whole From lines copied from the emails, as many as you like.
        </label>
        <textarea
          id="newsletter-senders"
          name="senders"
          rows={2}
          spellCheck={false}
          placeholder={"letters@substack.com\nStratechery <email@stratechery.com>"}
          className="data my-2 w-full rounded-[10px] bg-surface-2 px-3 py-2 text-subhead outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-accent"
        />
      </ActionForm>

      {filter && open ? (
        <div>
          <p className="mb-2 font-semibold">Make the filter in Gmail</p>
          <div className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
            <span className="data min-w-0 truncate text-subhead">{filter}</span>
            <CopyButton text={filter} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={open} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-[8px] bg-accent px-3 text-subhead text-text">
              Open in Gmail
            </a>
            <a href={gmailSearchUrl(filter)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-[8px] bg-surface-2 px-3 text-subhead text-accent-text">
              See what it catches
            </a>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-subhead">
            <li>
              Open in Gmail, on a computer, opens Gmail&rsquo;s filter box with these senders in the From line. Click <b>Create filter</b>.
            </li>
            <li>
              Tick <b>Forward it to</b> and choose {address ? <span className="data">{address}</span> : "your newsletters address"}. Click <b>Create filter</b>. They stay in your inbox as before.
            </li>
            <li>Should Gmail open on your inbox instead, paste the filter above into its search bar, press Enter, click the sliders icon at the right of the search bar, then <b>Create filter</b>.</li>
            <li>
              Changed the list after the filter was made, or made it before the recap was in it? Keep, remove or add senders here at any time, then Open in Gmail again. Gmail keeps the earlier filter: delete it, or edit it, under Settings, <b>Filters and Blocked
              Addresses</b>.
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
