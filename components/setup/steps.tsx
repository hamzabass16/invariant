import type * as React from "react";

export type Step = { title: string; detail: string };

/** Numbered steps on a rail: a circle per step, the title, then what to do. `extra` adds a list under a step by its index. */
export function Steps({ steps, note, extra }: { steps: readonly Step[]; note?: string; extra?: Record<number, React.ReactNode> }) {
  return (
    <>
      <ol className="mt-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 ? <span className="absolute top-7 bottom-1 left-[0.6875rem] w-px bg-hairline-strong" aria-hidden /> : null}
            <span className="data relative flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-text" aria-hidden>
              {i + 1}
            </span>
            <span className="block min-w-0 pt-0.5">
              <span className="block text-subhead font-medium">{s.title}</span>
              <span className="mt-0.5 block text-footnote text-text-secondary">{s.detail}</span>
              {extra?.[i] ?? null}
            </span>
          </li>
        ))}
      </ol>
      {note ? <p className="mt-3 text-footnote text-text-tertiary">{note}</p> : null}
    </>
  );
}
