/**
 * Mentor sessions (Hamza, 9 Nov 2026, the twenty further ways): a verified
 * analyst (lib/community.ts, `badgeOf`) may offer to review members' theses
 * and records; a member asks one for a review, which opens their card to
 * the mentor through its private link, and the mentor writes the review
 * back. Free while payments wait, like the marketplace ("listing now,
 * royalties later"); the offer can carry the price it will have. Kept in the
 * registry: the offer (a handle, a name, a line, the focus), each request
 * (whose card, the note, the review) and nothing of anyone's money. Pure.
 */
import { z } from "zod";

import { badgeOf, type CommunityProfile } from "@/lib/community";

export const MAX_OPEN_ASKS = 3;
export const MAX_REVIEW_CHARS = 4000;

export const mentorOfferSchema = z.object({
  handle: z.string().min(2).max(24),
  name: z.string().min(1).max(60),
  line: z.string().min(2).max(300),
  focus: z.string().max(120).nullable(),
  /** What a session will cost once payments are on, in US dollars; free until then. */
  laterPriceUsd: z.number().int().min(0).max(5000).nullable(),
  open: z.boolean(),
  updatedAt: z.string(),
});
export type MentorOffer = z.infer<typeof mentorOfferSchema>;

export const ASK_STATUS = ["asked", "reviewed", "declined"] as const;
export const mentorAskSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{6,80}$/),
  mentor: z.string().min(2).max(24),
  mentorName: z.string().min(1).max(60),
  member: z.string().min(1).max(60),
  note: z.string().max(1000),
  status: z.enum(ASK_STATUS),
  review: z.string().max(MAX_REVIEW_CHARS).nullable(),
  askedAt: z.string(),
  answeredAt: z.string().nullable(),
});
export type MentorAsk = z.infer<typeof mentorAskSchema>;
/** A request as one side sees it: the mentor also gets the member's card link, read when the page is drawn. */
export type MentorAskView = MentorAsk & { side: "member" | "mentor"; cardHref: string | null };

/** Why the person cannot offer reviews, or null: a shared card with the verified mark. */
export function offerProblem(card: Pick<CommunityProfile, "record" | "sharing"> | null): string | null {
  if (!card) return "Share a card on Community first.";
  if (!card.sharing.record || !card.record) return "Share your track record on your card first; mentors are verified on it.";
  const b = badgeOf(card.record);
  return b.verified ? null : `Mentors carry the verified mark: ${b.missing.join(", ")} still to go.`;
}

/** Why a member cannot ask, or null: a card with its private link, and fewer than `MAX_OPEN_ASKS` asks waiting. */
export function askProblem(i: { card: boolean; link: boolean; open: number; self: boolean }): string | null {
  if (i.self) return "That is your own offer.";
  if (!i.card) return "Share a card on Community first; the mentor reads it.";
  if (!i.link) return "Make your card's private link on Community first; the mentor opens your card through it.";
  if (i.open >= MAX_OPEN_ASKS) return `You have ${MAX_OPEN_ASKS} requests waiting; wait for an answer first.`;
  return null;
}

export const askIdFrom = (mentor: string, at: string, salt: string) => `${mentor}-${at.replace(/\D/g, "").slice(0, 14)}-${salt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`.slice(0, 80);

/** The shelf of mentors: open offers, the newest first. */
export const openOffers = (offers: readonly MentorOffer[]) => offers.filter((o) => o.open).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/** The demo's fictional mentors and requests. */
export const mentorsSampleSchema = z.object({ offers: z.array(mentorOfferSchema), asks: z.array(mentorAskSchema.extend({ side: z.enum(["member", "mentor"]), cardHref: z.string().nullable() })) });
