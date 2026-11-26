"use client";

import * as React from "react";

/** Copies a short text (an email address) and says so, for people who should not have to select text on a phone. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
      className="inline-flex h-9 shrink-0 items-center rounded-[8px] bg-surface-2 px-3 text-subhead text-accent-text"
    >
      {done ? "Copied" : label}
    </button>
  );
}
