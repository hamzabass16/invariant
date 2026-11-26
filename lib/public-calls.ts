/**
 * Public sealed calls (Hamza, 9 Nov 2026, the twenty further ways): a person
 * may publish one of their theses as a public page, findable by search, with
 * its receipt: the fingerprint of its words and the time the deployment first
 * saw them. Anyone can compute the fingerprint again from the words on the
 * page, so the call is shown to have been written by then. Opt-in, one
 * thesis at a time, taken down at any time; the page carries the thesis's
 * words and the name the person chose, never a weight, an amount or an
 * address. Pure.
 */
import { z } from "zod";

import { fingerprintOf, type Words } from "@/lib/receipts";

export const MAX_PUBLIC_CALLS = 30;
export const CALL_ID = /^[a-z0-9][a-z0-9-]{5,80}$/;

export const publicCallSchema = z.object({
  id: z.string().regex(CALL_ID),
  /** The ticker, or "market: " and the title. */
  subject: z.string().min(1).max(140),
  name: z.string().min(1).max(60),
  /** The person's Community handle, when they share a card; null otherwise. */
  handle: z.string().nullable(),
  text: z.string().max(8000),
  pathway: z.string().max(4000).nullable(),
  pillars: z.array(z.object({ name: z.string().max(120), text: z.string().max(1000) })).max(20),
  watch: z.array(z.string().max(300)).max(20),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  sealedAt: z.string(),
  publishedAt: z.string(),
});
export type PublicCall = z.infer<typeof publicCallSchema>;

const slug = (s: string) => s.toLowerCase().replace(/^market:\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "call";

/** A call's id: the subject and the fingerprint's first characters, so the same words keep the same page. */
export const callIdFrom = (subject: string, hash: string) => `${slug(subject)}-${hash.slice(0, 12)}`;

/** The page for a thesis's words as they stand, sealed at `sealedAt`. */
export function callFrom(w: Words, i: { name: string; handle: string | null; sealedAt: string; now: string }): PublicCall {
  const hash = fingerprintOf(w);
  return publicCallSchema.parse({
    id: callIdFrom(w.subject, hash),
    subject: w.subject.trim().slice(0, 140),
    name: i.name.trim().slice(0, 60) || "An Invariant member",
    handle: i.handle,
    text: w.text.trim().slice(0, 8000),
    pathway: w.pathway?.trim() ? w.pathway.trim().slice(0, 4000) : null,
    pillars: w.pillars.slice(0, 20).map((p) => ({ name: p.name.trim().slice(0, 120), text: p.text.trim().slice(0, 1000) })),
    watch: w.watch.slice(0, 20).map((x) => x.trim().slice(0, 300)),
    hash,
    sealedAt: i.sealedAt,
    publishedAt: i.now,
  });
}

/** Whether a page's words still give its fingerprint: the check anyone can make. */
export const callHolds = (c: PublicCall) => fingerprintOf({ subject: c.subject, text: c.text, pathway: c.pathway, pillars: c.pillars, watch: c.watch }) === c.hash;
