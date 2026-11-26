import type { Route } from "next";
import Link from "next/link";

import { CASE_FROM_LABEL, type BullBear, type CaseLine } from "@/lib/bull-bear";
import { longDate } from "@/lib/time";

/**
 * Bull and bear, side by side (lib/bull-bear.ts): the person's own cases, the
 * pillars and kill signals as today's figures read them, and the Thesis
 * Hunter's finds. Nothing here is the app's opinion or a model's; each line
 * names where it is from.
 */
export function BullBearSection({ symbol, cases }: { symbol: string; cases: BullBear }) {
  const thesis = `/theses/${encodeURIComponent(symbol)}` as Route;
  return (
    <section className="mb-8" aria-labelledby="bull-bear">
      <h2 id="bull-bear" className="section-header mb-2 px-1">
        Bull and bear
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Side title="The bull case" tone="ok" lines={cases.bull} empty="Nothing on file argues for it yet." />
        <Side title="The bear case" tone="danger" lines={cases.bear} empty="Nothing on file argues against it yet." />
      </div>
      <p className="mt-2 px-1 text-caption text-text-tertiary">
        From your valuation, your thesis&rsquo;s pillars and kill signals as today&rsquo;s figures read them, and what the Thesis Hunter found.{" "}
        {cases.owed.length ? `${cases.owed.join(" ")} ` : ""}
        <Link href={thesis} className="text-accent-text">
          The thesis
        </Link>
      </p>
    </section>
  );
}

function Side({ title, tone, lines, empty }: { title: string; tone: "ok" | "danger"; lines: CaseLine[]; empty: string }) {
  return (
    <div className={`card border-l-2 px-4 py-4 lg:px-6 ${tone === "ok" ? "border-l-ok" : "border-l-danger"}`}>
      <h3 className={`section-header mb-2 ${tone === "ok" ? "text-ok" : "text-danger"}`}>{title}</h3>
      {lines.length ? (
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={`${l.from}-${i}`} className="text-subhead">
              <p className="text-caption text-text-tertiary">
                {CASE_FROM_LABEL[l.from]}
                {l.date && l.from === "hunter" ? `, ${longDate(l.date)}` : ""}
              </p>
              {l.href ? (
                <a href={l.href} target="_blank" rel="noreferrer" className="hover:underline">
                  {l.text}
                </a>
              ) : (
                <p>{l.text}</p>
              )}
              {l.detail ? <p className="mt-0.5 text-footnote text-text-secondary">{l.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-footnote text-text-secondary">{empty}</p>
      )}
    </div>
  );
}
