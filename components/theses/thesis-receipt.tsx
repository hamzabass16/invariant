import { fingerprintOf, hasWords } from "@/lib/receipts";
import { storageMode } from "@/lib/storage";
import { longDate } from "@/lib/time";

type Words = Parameters<typeof fingerprintOf>[0];

/**
 * The thesis's receipt (lib/receipts.ts; Hamza, 9 Nov 2026): its words'
 * fingerprint, registered the first time the deployment sees them, and when.
 * Drawn on the thesis's own page; the demo seals nothing. A registry that
 * cannot be read draws nothing.
 */
async function sealed(words: Words): Promise<{ hash: string; at: string } | null> {
  try {
    const { registryAvailable, sealReceipts } = await import("@/lib/registry");
    if (!registryAvailable()) return null;
    const hash = fingerprintOf(words);
    const at = (await sealReceipts([hash])).get(hash);
    return at ? { hash, at } : null;
  } catch {
    return null;
  }
}

export async function ThesisReceipt({ words }: { words: Words }) {
  if (storageMode() === "demo" || !hasWords(words)) return null;
  const r = await sealed(words);
  if (!r) return null;
  return (
    <span className="text-caption text-text-tertiary">
      Words sealed{" "}
      <a href={`/receipt/${r.hash}`} className="data underline-offset-4 hover:underline">
        {longDate(r.at.slice(0, 10))} · {r.hash.slice(0, 12)}
      </a>
    </span>
  );
}
