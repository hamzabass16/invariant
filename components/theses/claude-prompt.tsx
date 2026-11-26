import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { CopyButton } from "@/components/app/copy-button";
import { Steps, type Step } from "@/components/setup/steps";

/**
 * A prompt the person pastes into their own Claude, with the Invariant
 * connector on: the steps around it, the prompt in a box, Copy prompt. The
 * app reads nothing of theirs here; their Claude writes through the
 * connector's write_thesis, and they review the result on this screen.
 * Folded shut by default, the title and the arrow alone showing; the arrow
 * opens it (Hamza, 19 Oct 2026).
 */
export function ClaudePromptCard({ title, intro, steps, prompt, demo, id, open = false }: { title: string; intro: string; steps: readonly Step[]; prompt: string; demo: boolean; id?: string; open?: boolean }) {
  return (
    <details id={id} className="card group mb-8 scroll-mt-20 px-4 py-3" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 font-semibold [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown className="size-5 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <p className="mt-2 text-subhead text-text-secondary">
        {intro} The{" "}
        <Link href={"/setup#claude" as Route} className="text-accent-text underline underline-offset-2">
          Setup
        </Link>{" "}
        screen shows how to add Invariant to Claude.
      </p>
      <Steps steps={steps} />
      <div className="mt-3 flex items-start justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
        <p className="min-w-0 whitespace-pre-wrap text-footnote text-text-secondary">{prompt}</p>
        <CopyButton text={prompt} label="Copy prompt" />
      </div>
      <p className="mt-2 mb-1 text-footnote text-text-tertiary">{demo ? "The demo's theses are fictional and read-only; in your own copy what your Claude writes lands here for you to review." : "What your Claude writes lands here, marked as added by Claude, for you to keep or change. It cannot touch a valuation, a record, a class or an order."}</p>
    </details>
  );
}

/** The steps around the Fill in prompt. */
export const FILL_STEPS: readonly Step[] = [
  { title: "Open Claude", detail: "A chat in Claude with the Invariant connector on." },
  { title: "Paste the prompt", detail: "Claude reads each holding's figures, filings, class and rules through the connector and writes a thesis for each, with pillars the app can test." },
  { title: "Review each one here", detail: "Every thesis it wrote is marked as added by Claude; keep it, change it, or write your own over it." },
];
