/**
 * Family accounts (Hamza, 9 Nov 2026, the twenty more ways): a household is
 * a few people who see each other's shared cards side by side, each still
 * signing in to their own app with their own vault. Only what a member chose
 * to share on Community is shown (theses, weights in percent, the track
 * record in percent, the rules); never an amount, an account or anything a
 * card does not hold. Kept in the registry: the household's name, its join
 * code (hashed to find it, sealed to show it) and each member's sign-in and
 * chosen name. Pure.
 */
import { z } from "zod";

import type { CommunityProfile } from "@/lib/community";
import type { Book } from "@/lib/holdings";
import { evaluate, methodologySchema } from "@/lib/methodology";
import type { RulePack } from "@/lib/rule-packs";
import type { InputId } from "@/lib/setup";

export const MAX_HOUSEHOLD = 8;

export const householdSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{3,60}$/), name: z.string().min(1).max(60) });
export type Household = z.infer<typeof householdSchema>;

export const householdIdFrom = (name: string, salt: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "family"}-${salt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;

export type MemberCard = { name: string; you: boolean; card: CommunityProfile | null };

export type HouseholdRow = {
  name: string;
  you: boolean;
  sharing: boolean;
  handle: string | null;
  top: { symbol: string; weightPct: number }[];
  theses: number;
  againstSpyPts: number | null;
  rulesKeptPct: number | null;
  methodology: string | null;
};

/** Each member's card in a row: the five largest weights, the theses, the record against SPY and the rules kept, or that they share no card. */
export function householdView(members: readonly MemberCard[]): HouseholdRow[] {
  return members.map(({ name, you, card }) => {
    if (!card) return { name, you, sharing: false, handle: null, top: [], theses: 0, againstSpyPts: null, rulesKeptPct: null, methodology: null };
    const top = card.sharing.weights ? [...card.weights].sort((a, b) => b.weightPct - a.weightPct).slice(0, 5).map((w) => ({ symbol: w.symbol, weightPct: Math.round(w.weightPct * 10) / 10 })) : [];
    const r = card.sharing.record ? card.record : null;
    return {
      name,
      you,
      sharing: true,
      handle: card.handle,
      top,
      theses: card.sharing.theses ? card.stocks.length + card.markets.length : 0,
      againstSpyPts: r && r.spyPct !== null ? Math.round((r.twrPct - r.spyPct) * 10) / 10 : null,
      rulesKeptPct: r?.rulesKeptPct ?? null,
      methodology: card.methodology,
    };
  });
}

/** The holdings two or more members hold, with how many. */
export function heldInCommon(rows: readonly HouseholdRow[]): { symbol: string; members: number }[] {
  const n = new Map<string, number>();
  for (const r of rows) for (const s of new Set(r.top.map((t) => t.symbol))) n.set(s, (n.get(s) ?? 0) + 1);
  return [...n].filter(([, c]) => c >= 2).map(([symbol, members]) => ({ symbol, members })).sort((a, b) => b.members - a.members || a.symbol.localeCompare(b.symbol));
}

// ---------------------------------------------------------------------------
// Family rules (Hamza, 9 Nov 2026, the twenty further ways): a household
// agrees one ready-made pack (lib/rule-packs.ts), and each member's app tests
// it on their own book and publishes only whether each rule is kept, with the
// reading in percent or a count; never an amount. The family view lays the
// members side by side, rule by rule.

export const FAMILY_STATUS = ["kept", "near", "broken", "unread"] as const;
export type FamilyStatus = (typeof FAMILY_STATUS)[number];
export const FAMILY_STATUS_WORDS: Record<FamilyStatus, string> = { kept: "Kept", near: "Close to the limit", broken: "Broken", unread: "Not read" };

export const familyResultSchema = z.object({
  pack: z.string().min(1).max(40),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rules: z.array(z.object({ id: z.string(), text: z.string().max(200), status: z.enum(FAMILY_STATUS), actual: z.string().max(40).nullable() })).max(12),
});
export type FamilyResult = z.infer<typeof familyResultSchema>;

/** The pack's rules tested on one member's own book, through the same `evaluate` as their methodology; a reading in money is never published. */
export function familyRules(pack: RulePack, book: Book, today: string, inputs: readonly InputId[]): FamilyResult {
  const m = methodologySchema.parse({ name: pack.name.slice(0, 80), adopted: today, summary: pack.about.slice(0, 600), figures: pack.figures, classes: [], rules: pack.rules, dashboard: { headline: pack.figures.filter((f) => f.view === "tile").slice(0, 1).map((f) => f.id), sections: [{ kind: "panel", id: "allocation", view: "chart" }], themes: [] }, gaps: [], source: { title: pack.name.slice(0, 120), fileId: null }, origin: "library" });
  const findings = evaluate(m, book, today, inputs);
  return familyResultSchema.parse({
    pack: pack.id,
    asOf: today,
    rules: findings.map((f) => ({
      id: f.rule.id,
      text: f.rule.text.slice(0, 200),
      status: f.status === "pass" ? "kept" : f.status === "near" ? "near" : f.status === "fail" ? "broken" : "unread",
      actual: f.figure && f.figure.unit !== "money" && f.actual ? f.actual.slice(0, 40) : null,
    })),
  });
}

/** The family's grid: the pack's rules down the side, each member's status across, a member whose app has not tested it yet blank. */
export function familyGrid(pack: RulePack, members: readonly { name: string; you: boolean; result: FamilyResult | null }[]): { rules: { id: string; text: string }[]; rows: { name: string; you: boolean; asOf: string | null; cells: { status: FamilyStatus | null; actual: string | null }[] }[]; kept: number; tested: number } {
  const rules = pack.rules.map((r) => ({ id: r.id, text: r.text }));
  let kept = 0;
  let tested = 0;
  const rows = members.map((mb) => {
    const r = mb.result && mb.result.pack === pack.id ? mb.result : null;
    const cells = rules.map((rule) => {
      const c = r?.rules.find((x) => x.id === rule.id) ?? null;
      if (c && c.status !== "unread") {
        tested += 1;
        if (c.status !== "broken") kept += 1;
      }
      return { status: c?.status ?? null, actual: c?.actual ?? null };
    });
    return { name: mb.name, you: mb.you, asOf: r?.asOf ?? null, cells };
  });
  return { rules, rows, kept, tested };
}
