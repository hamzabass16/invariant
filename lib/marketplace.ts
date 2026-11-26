/**
 * The methodology marketplace (Hamza, 9 Nov 2026, the twenty more ways;
 * "Listing now, royalties later"): anyone may list their confirmed
 * methodology, rules only, under a name they choose, and anyone may adopt a
 * listed one as a draft they check and confirm, credited to its author and
 * counted. No money changes hands yet. A listing carries figures, classes
 * and rules, never a holding, an amount or anything of the author's book.
 * Pure.
 */
import { z } from "zod";

import { badgeOf, type CommunityProfile } from "@/lib/community";
import { methodologySchema, ruleSchema, type Methodology } from "@/lib/methodology";
import { figureSchema } from "@/lib/recipes";
import type { RulePack } from "@/lib/rule-packs";
import { termsOf } from "@/lib/methodology";
import { familyOf, FAMILIES } from "@/lib/research";

export const MAX_LISTINGS_SHOWN = 60;
/** Fields that would name a holding or an account: a listing never filters on them. */
const PERSONAL_FIELDS = new Set(["symbol", "name", "account", "isin", "cusip"]);

export const listingSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  name: z.string().min(1).max(80),
  summary: z.string().max(600),
  /** The author's name as they chose to be credited. */
  credit: z.string().min(1).max(60),
  family: z.enum(FAMILIES).nullable(),
  methodology: methodologySchema,
  listedAt: z.string(),
  updatedAt: z.string(),
});
export type Listing = z.infer<typeof listingSchema>;
export type ListingView = Listing & { adopters: number; mine: boolean };

export const listingIdFrom = (name: string, salt: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 44) || "methodology"}-${salt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;

/** Why a methodology cannot be listed, or null: it must be confirmed, and no class or figure may pick out a holding or an account. */
export function listingProblem(m: Methodology | null): string | null {
  if (!m) return "Confirm a methodology first.";
  if (!m.adopted) return "Confirm the draft first; only a methodology in use can be listed.";
  if (m.classes.some((c) => [...c.criteria, ...(c.required ?? [])].some((f) => PERSONAL_FIELDS.has(f.field)))) return "A class tests a ticker or a name; a listing carries rules, never a holding.";
  if (m.figures.some((f) => termsOf(f).some((t) => t.where.some((w) => PERSONAL_FIELDS.has(w.field))))) return "A figure picks out a ticker, a name or an account; a listing carries rules, never a holding.";
  return null;
}

/** The listing for a confirmed methodology: its rules, figures and classes, its source document dropped, its lineage kept so the chain of credit holds. */
export function listingFrom(m: Methodology, i: { id: string; credit: string; now: string; listedAt?: string }): Listing {
  const methodology = methodologySchema.parse({ ...m, adopted: null, source: { title: m.name, fileId: null } });
  return listingSchema.parse({ id: i.id, name: m.name.slice(0, 80), summary: m.summary.slice(0, 600), credit: i.credit.trim().slice(0, 60) || "Anonymous", family: familyOf(m).family, methodology, listedAt: i.listedAt ?? i.now, updatedAt: i.now });
}

/** A listed methodology adopted as a draft: credited to its author through `lineage`, to check and confirm like any other. */
export function adoptListing(l: Listing): Methodology {
  return methodologySchema.parse({ ...l.methodology, adopted: null, origin: "library", source: { title: `${l.name}, by ${l.credit}`, fileId: null }, lineage: { parent: l.name, credit: l.credit, source: "market" } });
}

/** The shelf: the most adopted first, then the most recently updated. */
export function marketOrder<T extends Pick<ListingView, "adopters" | "updatedAt" | "name">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.adopters - a.adopters || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)).slice(0, MAX_LISTINGS_SHOWN);
}

/** What a listing holds, in a line. */
export const listingWords = (l: Pick<Listing, "methodology">) => `${l.methodology.classes.length} ${l.methodology.classes.length === 1 ? "class" : "classes"}, ${l.methodology.rules.length} rules (${l.methodology.rules.filter((r) => r.test).length} the app tests), ${l.methodology.figures.length} figures`;

// ---------------------------------------------------------------------------
// Packs from verified analysts (Hamza, 9 Nov 2026, the twenty further ways):
// a verified analyst lists a few of their own rules, with the figures they
// test, as a pack anyone can lay on their methodology like the ready-made
// ones (lib/rule-packs.ts, `withPack`). Free now, credited and counted.

export const PACK_MAX_RULES = 8;

export const packListingSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  name: z.string().min(2).max(60),
  about: z.string().min(2).max(300),
  credit: z.string().min(1).max(60),
  /** The analyst's card handle, so the pack links their record. */
  handle: z.string().min(2).max(24),
  figures: z.array(figureSchema).min(1).max(PACK_MAX_RULES * 2),
  rules: z.array(ruleSchema).min(1).max(PACK_MAX_RULES),
  listedAt: z.string(),
  updatedAt: z.string(),
});
export type PackListing = z.infer<typeof packListingSchema>;
export type PackListingView = PackListing & { adopters: number; mine: boolean };

/** Why these rules cannot be listed as a pack, or null: the author must carry the verified mark, and each rule must be one the app tests on a figure that picks out no holding. */
export function packListingProblem(card: Pick<CommunityProfile, "record" | "sharing"> | null, m: Methodology | null, ruleIds: readonly string[]): string | null {
  if (!card) return "Share a card on Community first; a pack is credited to it.";
  if (!badgeOf(card.sharing.record ? card.record : null).verified) return "Only a verified analyst can list a pack; your card shows what the mark still needs.";
  if (!m?.adopted) return "Confirm a methodology first.";
  if (!ruleIds.length) return "Pick at least one rule.";
  if (ruleIds.length > PACK_MAX_RULES) return `A pack holds ${PACK_MAX_RULES} rules at most.`;
  for (const id of ruleIds) {
    const r = m.rules.find((x) => x.id === id);
    if (!r) return "A rule picked is not in your methodology.";
    if (!r.test) return `"${r.text.slice(0, 60)}" is yours to check; a pack carries only rules the app tests.`;
    const f = m.figures.find((x) => x.id === r.test!.figure);
    if (!f || termsOf(f).some((t) => t.where.some((w) => PERSONAL_FIELDS.has(w.field)))) return `"${r.text.slice(0, 60)}" tests a figure on a ticker, a name or an account.`;
  }
  return null;
}

/** The pack from the chosen rules and the figures they test. */
export function packFrom(m: Methodology, ruleIds: readonly string[], i: { id: string; name: string; about: string; credit: string; handle: string; now: string; listedAt?: string }): PackListing {
  const rules = m.rules.filter((r) => ruleIds.includes(r.id) && r.test);
  const figs = new Set(rules.map((r) => r.test!.figure));
  return packListingSchema.parse({ id: i.id, name: i.name.trim().slice(0, 60), about: i.about.trim().slice(0, 300), credit: i.credit.trim().slice(0, 60) || "Anonymous", handle: i.handle, figures: m.figures.filter((f) => figs.has(f.id)), rules, listedAt: i.listedAt ?? i.now, updatedAt: i.now });
}

/** A listed pack as one `withPack` lays on a methodology: the analyst's rules and figures, credited in the pack's name, which becomes the dashboard section. */
export function packOf(l: PackListing): RulePack {
  return { id: `market-${l.id}`, name: `${l.name}, by ${l.credit}`.slice(0, 80), about: l.about, figures: l.figures, rules: l.rules };
}
