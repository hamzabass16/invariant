import type { Route } from "next";
import Link from "next/link";

import { checkNewslettersAction } from "@/app/(app)/newsletters/actions";
import { CopyButton } from "@/components/app/copy-button";
import { InboxCheck } from "@/components/statements/inbox-check";
import { recapNewslettersFor } from "@/lib/market-recap";

/**
 * Where the daily recap in "What happened" comes from. Each person
 * subscribes to the StockMKTNewz Daily Recap with their own Gmail, and the one
 * Gmail filter made on the Newsletters card, which always carries its
 * sender, forwards it to their newsletters address with the rest (Hamza,
 * 20 Oct 2026: the same forwarding, one subscription never standing for
 * everyone's). The app knows it by its sender and opens it under What
 * happened today, apart from the Newsletters. Subscribing with the
 * newsletters address itself works too. The operator's own copy comes from
 * the app's inbox (`sharedOn`).
 */
export function RecapGuide({ address, drive, compact = false, sharedOn = true, demo = false }: { address: string | null; drive: boolean; compact?: boolean; sharedOn?: boolean; demo?: boolean }) {
  const n = recapNewslettersFor(demo)[0];
  const site = n.signUp.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
  return (
    <ol className="list-decimal space-y-3 pl-5 text-subhead leading-relaxed">
      <li>
        {sharedOn ? (
          <>
            The free <b>{n.name}</b> ({n.by},{" "}
            <a href={n.signUp} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
              {site}
            </a>
            ) comes with the app: the app subscribes to it once, and each weekday evening, {n.arrives}, its screenshots of the day&rsquo;s stories open here for everyone, read with the AI. Nothing to set up. Its
            weekend issues carry no pictures, so a weekend shows Friday&rsquo;s.
          </>
        ) : (
          <>
            Subscribe to the free <b>{n.name}</b> ({n.by}) at{" "}
            <a href={n.signUp} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
              {site}
            </a>{" "}
            with your Gmail. The filter made in step 2 already carries its sender, <span className="data">{n.sender}</span>, so each weekday, {n.arrives}, it is forwarded to your newsletters address with the rest. The app
            knows it by its sender and opens its screenshots of the day&rsquo;s stories under What happened today on At the Close, read with the AI, apart from the Newsletters. Made your filter before? Open it in Gmail
            again from step 2 to add the sender.
          </>
        )}
      </li>
      <li>
        Another recap newsletter you read is shown the same way once your filter forwards it: add its sender to the filter on the{" "}
        <Link href={"/setup#newsletters" as Route} className="text-accent-text underline underline-offset-2">
          Newsletters card on Setup
        </Link>
        {compact ? ", in step 2" : " (steps 1 to 3)"}.
        {address ? (
          <span className="mt-2 flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
            <span className="data min-w-0 truncate">{address}</span>
            <CopyButton text={address} />
          </span>
        ) : null}
      </li>
      <li>
        Each weekday evening the app reads what arrived with the AI and puts the stories here; it looks again later, the next morning and when you open the app, in case one is late.
        {drive ? (
          <div className="mt-2">
            <InboxCheck action={checkNewslettersAction} wait="Reading what has arrived." />
          </div>
        ) : null}
      </li>
    </ol>
  );
}
