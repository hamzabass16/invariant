import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";

import { ResonanceLine } from "@/components/dashboard/resonance-line";
import { PageBody } from "@/components/ui/page-body";
import type { Resonance, Unkept } from "@/lib/resonance";

/**
 * Dev only: the Resonance card and its rule band under worst-case data
 * (the break-ui pass, 11 Nov 2026), switched with ?data=. Never served in
 * production. It is the regression test for the next change to the card.
 */
const unkept = (n: number, breaches: number): Unkept[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    section: i % 3 === 0 ? `D.${i + 1}(c)` : `${Math.floor(i / 4) + 1}.${(i % 4) + 1}`,
    text: "No single Transitional Holding above 20% of net worth, and Transitional Holdings together below 35% of net worth and 40% of the book's risk",
    severity: i < breaches ? "breach" : "guideline",
  }));

const FIXTURES: Record<string, Resonance> = {
  demo: { score: 100, kept: 2, measured: 2, breaches: 0, outside: 0, tripped: 2, manual: 11, waiting: 1, owed: 4, unkept: [] },
  worst: { score: 8, kept: 3, measured: 40, breaches: 30, outside: 7, tripped: 12, manual: 25, waiting: 18, owed: 1284, unkept: unkept(37, 30) },
  "all-breached": { score: 0, kept: 0, measured: 5, breaches: 5, outside: 0, tripped: 0, manual: 0, waiting: 0, owed: 5, unkept: unkept(5, 5) },
  one: { score: 100, kept: 1, measured: 1, breaches: 0, outside: 0, tripped: 1, manual: 1, waiting: 1, owed: 1, unkept: [] },
  empty: { score: null, kept: 0, measured: 0, breaches: 0, outside: 0, tripped: 0, manual: 0, waiting: 0, owed: 0, unkept: [] },
};

export default async function BreakResonance({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const pick = (await searchParams).data ?? "demo";
  const r = FIXTURES[pick] ?? FIXTURES.demo;
  return (
    <PageBody>
      <ResonanceLine state={{ kind: "read", r, owedHref: "/todo" }} />
      <nav aria-label="Data" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full bg-neutral-200 p-1 font-sans text-xs text-neutral-900">
        {Object.keys(FIXTURES).map((k) => (
          <Link key={k} href={`/dev/break-resonance?data=${k}` as Route} className={k === pick ? "rounded-full bg-white px-3 py-1 shadow" : "px-3 py-1"}>
            {k}
          </Link>
        ))}
      </nav>
    </PageBody>
  );
}
