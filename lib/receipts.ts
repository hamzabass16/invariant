import { createHash } from "node:crypto";

import type { CommunityProfile, Receipt } from "@/lib/community";
import type { MarketThesis, Thesis as StockThesis } from "@/lib/theses";

/**
 * Thesis receipts (Hamza, 9 Nov 2026, the moat's "timestamped thesis
 * receipts"): the fingerprint of a thesis's words, which the deployment
 * keeps with the time it first saw them (`thesis_receipts` in
 * lib/registry.ts: the fingerprint and the time, never the words or whose
 * they are). Anyone holding the words can compute the fingerprint again and
 * see that they existed by then, so a call can be checked later and never
 * backdated. Pure.
 *
 * The fingerprint is SHA-256 over `RECEIPT_VERSION`, a new line, then the
 * canonical text: the subject (the ticker, or "market:" and the title) and
 * the thesis, the pathway, each pillar's name and words, and each watch item,
 * one a line, each trimmed.
 */

export const RECEIPT_VERSION = "invariant-thesis-receipt-1";

export type Words = { subject: string; text: string; pathway?: string | null; pillars: readonly { name: string; text: string }[]; watch: readonly string[] };

export function canonicalThesis(w: Words): string {
  const lines = [`subject: ${w.subject.trim()}`, `thesis: ${w.text.trim()}`, `pathway: ${(w.pathway ?? "").trim()}`, ...w.pillars.map((p) => `pillar: ${p.name.trim()} | ${p.text.trim()}`), ...w.watch.map((x) => `watch: ${x.trim()}`)];
  return lines.join("\n");
}

export function fingerprintOf(w: Words): string {
  return createHash("sha256").update(`${RECEIPT_VERSION}\n${canonicalThesis(w)}`).digest("hex");
}

export const stockWords = (symbol: string, t: Pick<StockThesis, "text" | "pathway" | "pillars" | "watch">): Words => ({ subject: symbol.toUpperCase(), text: t.text, pathway: t.pathway, pillars: t.pillars, watch: t.watch });
export const marketWords = (m: Pick<MarketThesis, "title" | "text" | "pillars" | "watch">): Words => ({ subject: `market: ${m.title}`, text: m.text, pathway: null, pillars: m.pillars, watch: m.watch });

/** Whether a thesis has words worth a receipt. */
export const hasWords = (w: Words) => !!(w.text.trim() || w.pillars.length);

/** The fingerprints of a card's shared theses, to register. */
export function cardFingerprints(p: Pick<CommunityProfile, "stocks" | "markets">): string[] {
  return [...p.stocks.map((t) => fingerprintOf({ subject: t.symbol, ...t })), ...p.markets.map((m) => fingerprintOf({ subject: `market: ${m.title}`, text: m.text, pathway: null, pillars: m.pillars, watch: m.watch }))];
}

/** The card with each shared thesis's receipt laid on it from the times the registry gave; a thesis not yet registered carries none. */
export function withReceipts(p: CommunityProfile, sealed: ReadonlyMap<string, string>): CommunityProfile {
  const at = (hash: string): Receipt | null => (sealed.has(hash) ? { hash, sealedAt: sealed.get(hash)! } : null);
  return {
    ...p,
    stocks: p.stocks.map((t) => ({ ...t, receipt: at(fingerprintOf({ subject: t.symbol, ...t })) })),
    markets: p.markets.map((m) => ({ ...m, receipt: at(fingerprintOf({ subject: `market: ${m.title}`, text: m.text, pathway: null, pillars: m.pillars, watch: m.watch })) })),
  };
}

// ---------------------------------------------------------------------------
// The decision journal (Hamza, 9 Nov 2026, the twenty more ways): the
// Decision Log exported as a PDF whose entries' fingerprint is sealed like a
// thesis's, so the journal can be shown later to have existed, unchanged, by
// the day it was exported. Amounts are masked before the words are hashed.

export const JOURNAL_VERSION = "invariant-journal-1";

export type JournalEntry = { date: string; kind: string; symbol: string | null; title: string; text: string; outcome: string | null };

export function canonicalJournal(entries: readonly JournalEntry[]): string {
  return entries.map((e) => [e.date, e.kind, e.symbol ?? "", e.title.trim(), e.outcome ?? "", e.text.trim().replace(/\s+/g, " ")].join(" | ")).join("\n");
}

export function journalFingerprint(entries: readonly JournalEntry[]): string {
  return createHash("sha256").update(`${JOURNAL_VERSION}\n${canonicalJournal(entries)}`).digest("hex");
}
