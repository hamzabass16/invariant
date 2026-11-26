"use client";

import { useState } from "react";

/**
 * Gmail's forwarding request that Google would not confirm from the app:
 * the sentence saying why, a Confirm in Google button that opens Google's
 * page in a new tab (one click there finishes it; Hamza, 18 Oct 2026), and
 * the code when Gmail printed one.
 */
export function ForwardingFallback({ forAddress, sentence, code, link, next }: { forAddress: string; sentence: string | null; code: string | null; link: string | null; next: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-3">
      <p className="text-subhead text-text">Gmail&rsquo;s forwarding request from {forAddress} is here.</p>
      {sentence ? <p className="mt-1 text-footnote text-text-secondary">{sentence}</p> : null}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className="mt-3 inline-flex h-9 items-center rounded-[8px] bg-accent px-3 text-subhead text-text">
          Confirm in Google
        </a>
      ) : null}
      {link ? (
        <p className="mt-2 text-footnote text-text-secondary">
          {opened ? "Google's page is open in a new tab: press Confirm there. " : "One press on Google's page, nothing to type. "}
          Then reload Gmail&rsquo;s Forwarding settings, where the address shows as verified. {next}
        </p>
      ) : null}
      {code ? (
        <>
          <p className="data mt-2 text-title-2 tracking-wider">{code}</p>
          <p className="mt-1 text-footnote text-text-secondary">Or type this code into the box Gmail shows under Forwarding, then click Verify.</p>
        </>
      ) : null}
    </div>
  );
}
