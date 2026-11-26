import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { callHolds } from "@/lib/public-calls";
import { callToShow } from "@/lib/public-calls-run";
import { longDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await callToShow(id);
  if (!c) return { title: "A call · Invariant" };
  const subject = c.subject.replace(/^market: /, "");
  return { title: `${subject}, a sealed call by ${c.name} · Invariant`, description: c.text.split(/\n+/)[0].slice(0, 200) };
}

/**
 * One public sealed call (Hamza, 9 Nov 2026, the twenty further ways): the
 * thesis's words as published, its fingerprint and when the deployment first
 * saw it, and whether the words on the page still give that fingerprint.
 */
export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await callToShow(id);
  if (!c) notFound();
  const holds = callHolds(c);
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">{c.subject.replace(/^market: /, "")}</h1>
      <p className="mt-1 text-subhead text-text-secondary">
        A call by {c.handle ? <Link href={`/community/${c.handle}` as Route} className="text-accent-text">{c.name}</Link> : c.name}, written by {longDate(c.sealedAt.slice(0, 10))}.
      </p>
      <span className="gilt-rule mt-3" aria-hidden />
      <article className="mt-6 space-y-3 text-body">
        {c.text.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {c.pathway ? (
          <>
            <h2 className="section-header pt-3">Pathway</h2>
            <p>{c.pathway}</p>
          </>
        ) : null}
        {c.pillars.length ? (
          <>
            <h2 className="section-header pt-3">Pillars</h2>
            <ul className="space-y-2">
              {c.pillars.map((p) => (
                <li key={p.name}>
                  <span className="font-semibold">{p.name}.</span> {p.text}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {c.watch.length ? (
          <>
            <h2 className="section-header pt-3">What to watch</h2>
            <ul className="list-disc space-y-1 pl-5">
              {c.watch.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        ) : null}
      </article>
      <section className="mt-8 card px-4 py-4 text-subhead">
        <h2 className="section-header mb-1">The receipt</h2>
        <p className="text-text-secondary">
          Fingerprint <span className="data break-all">{c.hash}</span>, first seen {longDate(c.sealedAt.slice(0, 10))}. {holds ? "The words above still give it: unchanged since." : "The words above no longer give it."}{" "}
          <Link href={`/receipt/${c.hash}` as Route} className="text-accent-text">Check the receipt</Link>
        </p>
      </section>
      <p className="mt-6 text-footnote text-text-tertiary">Published {longDate(c.publishedAt.slice(0, 10))}. The author&apos;s view, not investment advice.</p>
      <nav aria-label="Invariant" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/calls" as Route} className="underline-offset-4 hover:underline">All public calls</Link>
        <Link href={"/sign-in" as Route} className="underline-offset-4 hover:underline">Sign in or make your own</Link>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">Privacy</Link>
      </nav>
    </main>
  );
}
