import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { annualReport } from "@/lib/open-data";
import { awardsFor, yearOf } from "@/lib/open-data-run";
import { localDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  return { title: `The ${year} Invariant report · Invariant`, description: `What people did with Invariant in ${year}, counted and never named.` };
}

/**
 * The annual Invariant report (Hamza, 9 Nov 2026, the twenty more ways):
 * the year's counts on the deployment and the year's last week of open data,
 * pooled (lib/open-data.ts). Public; a count under five is said as fewer
 * than five, so no one is named by elimination.
 */
export default async function AnnualPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: raw } = await params;
  const year = Number(raw);
  const today = localDay();
  if (!/^\d{4}$/.test(raw) || year < 2026 || year > Number(today.slice(0, 4))) notFound();
  const [{ counts, week, donations }, awards] = await Promise.all([yearOf(year), awardsFor(year)]);
  const r = counts ? annualReport({ year, through: today, counts, open: donations, openWeek: week }) : null;
  const done = year < Number(today.slice(0, 4));
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">The {year} Invariant report</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="mt-4 text-body text-text-secondary">{done ? `The year ${year}, as the deployment counted it.` : `The year so far, through ${today}; the full report is drawn when the year ends.`} People are counted, never named; what anyone holds or is worth is not in it.</p>
      {r ? (
        <ul className="mt-6 space-y-3 text-body">
          {r.lines.map((l) => (
            <li key={l} className="card px-4 py-3">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 card px-4 py-4 text-subhead text-text-secondary">This deployment keeps no counts to report.</p>
      )}
      {awards ? (
        <section aria-labelledby="awards" className="mt-10">
          <h2 id="awards" className="text-title-3 font-semibold">The {year} awards</h2>
          <p className="mt-2 text-subhead text-text-secondary">{done ? "" : "Standing so far; the awards are settled when the year ends. "}Read by the app from the cards people chose to list and the clubs on the league: how they decided, never what they made alone.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {awards.map((a) => (
              <li key={a.id} className="card px-4 py-3">
                <p className="text-footnote text-text-tertiary">{a.title}</p>
                <p className="mt-1 font-semibold">{a.winner ? a.href ? <Link href={a.href as Route} className="underline-offset-4 hover:underline">{a.winner}</Link> : a.winner : "Not awarded"}</p>
                <p className="mt-1 text-footnote text-text-secondary">{a.detail}</p>
                <p className="mt-1 text-caption text-text-tertiary">{a.about}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <nav aria-label="Invariant" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/open-data" as Route} className="underline-offset-4 hover:underline">
          Open data
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
