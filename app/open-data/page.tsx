import type { Route } from "next";
import Link from "next/link";

import { HOLDING_BANDS, OPEN_MIN_PEOPLE, openData } from "@/lib/open-data";
import { openWeek } from "@/lib/open-data-run";

export const metadata = { title: "Open data · Invariant", description: "How people who use Invariant keep their own investing rules, pooled and anonymous." };
export const dynamic = "force-dynamic";

const FAMILY_WORDS: Record<string, string> = { all: "Everyone", fundamentals: "Fundamentals", options: "Options", quant: "Quant", macro: "Macro" };
const n = (v: number | null, unit = "%") => (v === null ? "not read" : `${v}${unit}`);

/**
 * Open data (Hamza, 9 Nov 2026, the twenty more ways): the latest week of
 * what people chose to give (lib/open-data.ts), pooled, each row five people
 * or more. Public, read-only, no name and no amount.
 */
export default async function OpenDataPage() {
  const { week, donations, problem } = await openWeek();
  const pooled = openData(donations);
  const year = Number((week ?? new Date().toISOString()).slice(0, 4));
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Open data</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="mt-4 text-body text-text-secondary">
        How people keep the investing rules they wrote for themselves, given once a week by those who chose to, pooled. {week ? `The week ${week}.` : ""} A row is drawn only when {OPEN_MIN_PEOPLE} or more people gave it; never an amount, a holding or a name.
      </p>
      {problem ? <p className="mt-6 card px-4 py-4 text-subhead text-text-secondary">{problem}</p> : null}
      {!problem && !pooled.rows.length ? <p className="mt-6 card px-4 py-4 text-subhead text-text-secondary">Too few people have given open data yet to publish any of it.</p> : null}
      {pooled.rows.length ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-subhead">
            <thead className="text-footnote text-text-tertiary">
              <tr>
                <th className="py-2 pr-3 font-normal">Methodologies</th>
                <th className="py-2 pr-3 font-normal">People</th>
                <th className="py-2 pr-3 font-normal">Rules kept, median</th>
                <th className="py-2 pr-3 font-normal">A rule broken</th>
                <th className="py-2 pr-3 font-normal">Trades with a reason, median</th>
              </tr>
            </thead>
            <tbody>
              {pooled.rows.map((r) => (
                <tr key={r.family} className="border-t border-hairline">
                  <td className="py-2 pr-3">{FAMILY_WORDS[r.family]}</td>
                  <td className="data py-2 pr-3">{r.people}</td>
                  <td className="data py-2 pr-3">{n(r.medianRulesKeptPct)}</td>
                  <td className="data py-2 pr-3">{r.withBreachPct === null ? "not read" : `${r.withBreachPct}% of people`}</td>
                  <td className="data py-2 pr-3">{n(r.medianReasonedPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pooled.rows[0]?.family === "all" ? (
            <p className="mt-3 text-footnote text-text-secondary">
              Holdings, everyone: {HOLDING_BANDS.map((b) => `${b}: ${pooled.rows[0].bands[b] || `under ${OPEN_MIN_PEOPLE}`}`).join(" · ")}.
            </p>
          ) : null}
          {pooled.below ? <p className="mt-2 text-footnote text-text-tertiary">{`${pooled.below} ${pooled.below === 1 ? "group has" : "groups have"} fewer than ${OPEN_MIN_PEOPLE} people this week and ${pooled.below === 1 ? "is" : "are"} not shown.`}</p> : null}
        </div>
      ) : null}
      <h2 className="mt-8 text-title-3 font-semibold">What is given</h2>
      <p className="mt-2 text-body text-text-secondary">Each person who switches it on in Account settings gives, once a week: the family of their methodology, the share of its measurable rules they kept, how many they broke, the share of the past year&apos;s trades with a written reason, and how many holdings in a band. It is kept under a keyed fingerprint of their sign-in and the week, so it is counted once and never named, and switching it off deletes it. Not investment advice.</p>
      <nav aria-label="Invariant" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/open-data/research" as Route} className="underline-offset-4 hover:underline">
          For researchers: the CSV and its licence
        </Link>
        <Link href={`/annual/${year}` as Route} className="underline-offset-4 hover:underline">
          The {year} Invariant report
        </Link>
        <Link href={"/sign-in" as Route} className="underline-offset-4 hover:underline">
          Sign in
        </Link>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </nav>
    </main>
  );
}
