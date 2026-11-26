import type { Route } from "next";
import Link from "next/link";

import { CSV_HEADER, HOLDING_BANDS, OPEN_LICENCE, OPEN_MIN_PEOPLE } from "@/lib/open-data";

export const metadata = { title: "Open data for researchers · Invariant", description: "The pooled, anonymous record of how people keep their own investing rules, to download and cite." };

const COLUMNS: Record<string, string> = {
  week: "The ISO week given, such as 2026-W45.",
  family: "The methodology family: all, fundamentals, options, quant or macro.",
  people: `How many people gave that week in that family; a row is published only at ${OPEN_MIN_PEOPLE} or more.`,
  median_rules_kept_pct: "The median share of their measurable rules kept that week, in percent.",
  with_breach_pct: "The share of people with at least one rule broken, in percent.",
  median_reasoned_pct: "The median share of the past year's trades with a written reason, in percent.",
};

/**
 * Open data for researchers (Hamza, 9 Nov 2026, the twenty further ways):
 * what the download holds, column by column, its licence and how to cite it.
 * Public; nothing here names a person.
 */
export default function OpenDataResearchPage() {
  const year = new Date().getUTCFullYear();
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Open data for researchers</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="mt-4 text-body text-text-secondary">
        Every week, people who chose to give it send how they kept the investing rules they wrote for themselves. The weeks are pooled by methodology family and published once {OPEN_MIN_PEOPLE} or more people stand behind a row. It is a record of behaviour against one&apos;s own rules, not of returns: no name, holding, amount or account is in it.
      </p>
      <div className="mt-6">
        <a href="/open-data/download" className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-subhead font-medium text-white">
          Download the CSV
        </a>
      </div>
      <h2 className="mt-8 text-title-3 font-semibold">Columns</h2>
      <dl className="mt-3 space-y-2 text-subhead">
        {CSV_HEADER.map((c) => (
          <div key={c} className="card px-4 py-3">
            <dt className="data font-semibold">{c}</dt>
            <dd className="mt-1 text-text-secondary">{COLUMNS[c] ?? `How many people held a number of stocks and funds in the band ${HOLDING_BANDS.find((b) => c.endsWith(b.replace("+", "_plus").replace("-", "_"))) ?? ""}; under ${OPEN_MIN_PEOPLE}, zero.`}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mt-8 text-title-3 font-semibold">Licence and citation</h2>
      <p className="mt-2 text-body text-text-secondary">
        Published under {OPEN_LICENCE}: use it, share it and build on it, with credit. Cite it as: Invariant open data, weekly pooled rule-keeping by methodology family, {year}, retrieved from this deployment&apos;s /open-data/download on the day you read it.
      </p>
      <h2 className="mt-8 text-title-3 font-semibold">What it cannot tell you</h2>
      <p className="mt-2 text-body text-text-secondary">
        Who gives is self-selected, so the pool leans to people who keep records. A rule kept is the app&apos;s reading of the person&apos;s own rule on the day, so rules differ from person to person. A week too small to publish is left out, not filled. Not investment advice.
      </p>
      <nav aria-label="Invariant" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/open-data" as Route} className="underline-offset-4 hover:underline">
          Open data
        </Link>
        <Link href={`/annual/${year}` as Route} className="underline-offset-4 hover:underline">
          The {year} Invariant report
        </Link>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </nav>
    </main>
  );
}
