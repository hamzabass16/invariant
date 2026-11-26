import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileBody } from "@/components/community/profile-body";
import { storageMode } from "@/lib/storage";

export const metadata = { title: "A shared card · Invariant", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A card opened by its link (Hamza, 9 Nov 2026, the moat's "mentor view"):
 * a mentor, an adviser or a club's officer reads the person's theses, their
 * weights in percent and their track record with its streak, as the person
 * chose to share them, without signing in. Read-only and with no amount,
 * since a card holds none; the person turns the link off or makes a new one
 * on Community.
 */
export default async function CardByLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (storageMode() === "demo") notFound();
  const { registryAvailable, cardByLink } = await import("@/lib/registry");
  if (!registryAvailable()) notFound();
  const p = await cardByLink(code).catch(() => null);
  if (!p) notFound();
  return (
    <main className="reveal-stack mx-auto min-h-dvh max-w-4xl px-4 py-10 sm:px-6">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">{p.name}</h1>
      <p className="mt-1 mb-6 text-footnote text-text-tertiary">A card {p.name} shared with you by its link: read-only, in percent, never an amount. Not investment advice.</p>
      <ProfileBody p={p} link />
      <nav aria-label="Invariant" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/sign-in" as Route} className="underline-offset-4 hover:underline">
          Sign in or make your own
        </Link>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </nav>
    </main>
  );
}
