import type { Route } from "next";
import Link from "next/link";

import { callsToShow } from "@/lib/public-calls-run";
import { longDate } from "@/lib/time";

export const metadata = { title: "Public calls · Invariant", description: "Investment theses published with a receipt: the words, and when they were first written, provably unchanged since." };
export const dynamic = "force-dynamic";

/**
 * Public sealed calls (Hamza, 9 Nov 2026, the twenty further ways): every
 * thesis people chose to publish, newest first, each with its receipt.
 * Public and indexable; never a weight, an amount or an address.
 */
export default async function CallsPage() {
  const { calls, problem } = await callsToShow();
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Public calls</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="mt-4 text-body text-text-secondary">Theses their authors chose to publish, each sealed: the fingerprint of its words was registered when the app first saw them, so anyone can check the call was written by then and not changed since. Not investment advice.</p>
      {problem ? <p className="mt-6 card px-4 py-4 text-subhead text-text-secondary">{problem}</p> : null}
      {!problem && !calls.length ? <p className="mt-6 card px-4 py-4 text-subhead text-text-secondary">No one has published a call yet.</p> : null}
      <ul className="mt-6 space-y-3">
        {calls.map((c) => (
          <li key={c.id} className="card px-4 py-3">
            <Link href={`/calls/${c.id}` as Route} className="text-headline text-accent-text">
              {c.subject.replace(/^market: /, "")}
            </Link>
            <p className="mt-1 text-subhead text-text-secondary">{c.text.split(/\n+/)[0].slice(0, 220)}</p>
            <p className="mt-1 text-caption text-text-tertiary">
              {c.name} · sealed {longDate(c.sealedAt.slice(0, 10))} · <span className="data">{c.hash.slice(0, 12)}</span>
            </p>
          </li>
        ))}
      </ul>
      <nav aria-label="Invariant" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/sign-in" as Route} className="underline-offset-4 hover:underline">Sign in or make your own</Link>
        <Link href={"/open-data" as Route} className="underline-offset-4 hover:underline">Open data</Link>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">Privacy</Link>
      </nav>
    </main>
  );
}
