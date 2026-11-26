import { readFileSync } from "node:fs";
import path from "node:path";

import type { Route } from "next";
import Link from "next/link";

import { JOURNAL_VERSION, RECEIPT_VERSION } from "@/lib/receipts";
import { storageMode } from "@/lib/storage";
import { longDate } from "@/lib/time";

export const metadata = { title: "Receipt · Invariant", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A thesis receipt (lib/receipts.ts): when the deployment first saw the
 * words with this fingerprint. Public and read-only; it holds no words and
 * no name, only the fingerprint and the time, and says how to compute the
 * fingerprint from the words.
 */
/** The demo's receipts are on its fictional cards; it seals nothing. */
function demoReceipt(hash: string): string | null {
  try {
    const text = readFileSync(path.join(process.cwd(), "data/samples", "community.json"), "utf8");
    const at = new RegExp(`"hash": "${hash}",\\s*"sealedAt": "([^"]+)"`).exec(text);
    return at ? at[1] : null;
  } catch {
    return null;
  }
}

export default async function ReceiptPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash: raw } = await params;
  const hash = raw.toLowerCase();
  const valid = /^[a-f0-9]{64}$/.test(hash);
  let sealedAt: string | null = null;
  if (valid && storageMode() === "demo") sealedAt = demoReceipt(hash);
  else if (valid) {
    const { registryAvailable, receiptOf } = await import("@/lib/registry");
    if (registryAvailable()) sealedAt = await receiptOf(hash).catch(() => null);
  }
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Receipt</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="data mt-4 break-all text-footnote text-text-secondary">{valid ? hash : "Not a fingerprint"}</p>
      <p className="mt-4 text-body">{sealedAt ? `First seen on ${longDate(sealedAt.slice(0, 10))} at ${sealedAt.slice(11, 16)} UTC. The thesis or decision journal whose words give this fingerprint existed by then, unchanged.` : valid ? "This deployment has not seen this fingerprint." : "A fingerprint is 64 letters and digits."}</p>
      <h2 className="mt-8 text-title-3 font-semibold">How to check it</h2>
      <p className="mt-2 text-body text-text-secondary">The fingerprint is SHA-256 of the line &ldquo;{RECEIPT_VERSION}&rdquo;, a new line, then the thesis written as lines: &ldquo;subject: &rdquo; and the ticker (or &ldquo;market: &rdquo; and the title), &ldquo;thesis: &rdquo; and its text, &ldquo;pathway: &rdquo; and its pathway, &ldquo;pillar: &rdquo; with each pillar&apos;s name, &ldquo; | &rdquo; and its words, and &ldquo;watch: &rdquo; with each item, each trimmed. A decision journal is SHA-256 of &ldquo;{JOURNAL_VERSION}&rdquo;, a new line, then each entry oldest first as one line: its date, kind, ticker, title, outcome and words (spaces run together), joined by &ldquo; | &rdquo;, with every amount already masked. Change one character and the fingerprint changes. The deployment keeps only the fingerprint and the time, never the words or whose they are.</p>
      <nav aria-label="Invariant" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
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
