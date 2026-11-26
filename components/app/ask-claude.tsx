import { CircleAlert, CircleCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { CopyButton } from "@/components/app/copy-button";
import { Steps } from "@/components/setup/steps";
import { askCard, ASK_STEPS, type AskFeature } from "@/lib/ask-claude";

/**
 * An "Ask your Claude" card (the beta's hybrid AI, Hamza, 9 Nov 2026): what
 * the button did in the app, done by the person's own Claude through the
 * Invariant connector. The prompt to paste with Copy prompt, whether the
 * connector is added, and where the answer lands. Folded shut unless
 * `open`. `connected` is null when it cannot be told (the demo).
 */
export function AskClaudeCard({ feature, subject, connected, demo, open = false, id, className = "card mb-8" }: { feature: AskFeature; subject?: string; connected: boolean | null; demo: boolean; open?: boolean; id?: string; className?: string }) {
  const c = askCard(feature, subject);
  return (
    <details id={id} className={`${className} group scroll-mt-20 px-4 py-3`} open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 font-semibold [&::-webkit-details-marker]:hidden">
        <span>{c.title}</span>
        <span className="text-footnote font-normal text-text-tertiary group-open:hidden">Ask your Claude</span>
      </summary>
      <p className="mt-2 text-subhead text-text-secondary">{c.intro}</p>
      <ConnectorLine connected={connected} demo={demo} />
      <Steps steps={ASK_STEPS} />
      <div className="mt-3 flex items-start justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
        <p className="min-w-0 whitespace-pre-wrap text-footnote text-text-secondary">{c.prompt}</p>
        <CopyButton text={c.prompt} label="Copy prompt" />
      </div>
      <p className="mt-2 mb-1 text-footnote text-text-tertiary">{demo ? "The demo runs no AI; in your own copy your Claude reads your portfolio through the connector." : c.after}</p>
    </details>
  );
}

function ConnectorLine({ connected, demo }: { connected: boolean | null; demo: boolean }) {
  if (demo || connected === null) {
    return (
      <p className="mt-2 text-footnote text-text-tertiary">
        Needs the Invariant connector in Claude.{" "}
        <Link href={"/setup#claude" as Route} className="text-accent-text underline underline-offset-2">
          How to add it
        </Link>
      </p>
    );
  }
  return connected ? (
    <p className="mt-2 flex items-center gap-1.5 text-footnote text-text-secondary">
      <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
      The connector is added to your Claude.
    </p>
  ) : (
    <p className="mt-2 flex items-center gap-1.5 text-footnote text-text-secondary">
      <CircleAlert className="size-4 shrink-0 text-warn" aria-hidden />
      <span>
        The connector is not added yet.{" "}
        <Link href={"/setup#claude" as Route} className="text-accent-text underline underline-offset-2">
          Add it on Setup
        </Link>
      </span>
    </p>
  );
}
