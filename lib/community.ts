import { z } from "zod";

import { sentenceCut } from "@/lib/earnings-call";
import type { Notice } from "@/lib/screens";
import { MAX_PILLARS, MAX_WATCH, type ThesesFile } from "@/lib/theses";
import { daysBetween } from "@/lib/time";

/**
 * Community (Hamza, 18 Oct 2026): a person may share their theses and their
 * book's weights with the other people on the same deployment, under a
 * handle, and follow others' profiles. What is shared is this file's
 * `communityProfileSchema` and nothing else: the theses in their words (the
 * text, the pillars with their tests, the pathway, the watch items) and each
 * listed holding's share of the book in percent. Never an amount, an
 * account, a net worth, a valuation, a DCF, a decision, an alert, a
 * statement or anything of the evidence folded into a thesis. The profile is
 * kept in the deployment's registry (lib/registry.ts) while the person
 * shares, and deleted when they stop, and kept in step with their theses and
 * weights by lib/community-run.ts whenever they change (Hamza, 19 Oct 2026);
 * a change worth telling of (`cardChanges`) is an alert for each follower
 * (`communityNotices`). Pure: the screens and the checks read it.
 */

export const MAX_FOLLOWING = 50;
export const MAX_SHARED_WEIGHTS = 80;
export const MAX_SHARED_THESES = 60;
export const HANDLE = /^[a-z0-9][a-z0-9-]{1,23}$/;

/** A pillar as shared: the words and the test, no reading. */
const sharedPillarSchema = z.object({ name: z.string().min(1).max(80), text: z.string().max(600), test: z.object({ field: z.string().min(1).max(40), is: z.enum(["gte", "lte"]), value: z.number() }).nullable() });

/** When the thesis's words were first seen by the deployment (lib/receipts.ts): their fingerprint and that time, so a call can be checked later and never backdated. */
export const receiptSchema = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), sealedAt: z.string() });
export type Receipt = z.infer<typeof receiptSchema>;

export const sharedStockThesisSchema = z.object({
  symbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
  text: z.string().max(6000),
  pathway: z.string().max(1500).nullable(),
  pillars: z.array(sharedPillarSchema).max(MAX_PILLARS),
  watch: z.array(z.string().max(200)).max(MAX_WATCH),
  updatedAt: z.string(),
  receipt: receiptSchema.nullable().default(null),
});
export type SharedStockThesis = z.infer<typeof sharedStockThesisSchema>;

export const sharedMarketThesisSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  title: z.string().min(1).max(120),
  text: z.string().max(6000),
  pillars: z.array(sharedPillarSchema).max(MAX_PILLARS),
  watch: z.array(z.string().max(200)).max(MAX_WATCH),
  updatedAt: z.string(),
  receipt: receiptSchema.nullable().default(null),
});
export type SharedMarketThesis = z.infer<typeof sharedMarketThesisSchema>;

/** One listed holding's share of the book, in percent, with the class the methodology gives it; never a value. */
export const sharedWeightSchema = z.object({ symbol: z.string().min(1).max(20), name: z.string().max(120).nullable(), weightPct: z.number().min(0).max(100), classLabel: z.string().max(80).nullable() });
export type SharedWeight = z.infer<typeof sharedWeightSchema>;

/** A weight that moved, in percent of the book before and after; null where the holding came or went. The two weights were each shared in their turn; never an amount. */
export const weightMoveSchema = z.object({ symbol: z.string().min(1).max(20), from: z.number().min(0).max(100).nullable(), to: z.number().min(0).max(100).nullable() });
export type WeightMove = z.infer<typeof weightMoveSchema>;

/** The change a card's followers are told of (lib/community-run.ts): when, the stock symbols and market thesis titles whose shared thesis changed, whether a weight moved by `WEIGHT_CHANGE_PTS` or a holding came or went, and from 7 Nov 2026 which, in percent (`moves`). Never an amount. */
export const cardChangeSchema = z.object({ at: z.string(), theses: z.array(z.string().max(120)).max(30), weights: z.boolean(), moves: z.array(weightMoveSchema).max(30).default([]) });
export type CardChange = z.infer<typeof cardChangeSchema>;

/**
 * A track record the app read itself (Hamza, 9 Nov 2026, the moat's
 * "verified track records"): the book's time-weighted return since its
 * statement's first day with money in it, SPY's over the same days, and the
 * share of the methodology's measurable rules kept today, all in percent and
 * never an amount, computed from the broker's statement and the methodology
 * the person confirmed, never typed. Shared only when they tick it.
 */
export const trackRecordSchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  twrPct: z.number().min(-100).max(100_000),
  spyPct: z.number().min(-100).max(100_000).nullable(),
  /** Rules kept of those the app can measure today, in percent; null when it can measure none. */
  rulesKeptPct: z.number().min(0).max(100).nullable(),
  rulesMeasured: z.number().int().min(0),
  /** The methodology's breaches today, and the day since which none has been open (Hamza, 9 Nov 2026: rules-kept streaks); null on records kept before it existed. */
  breaches: z.number().int().min(0).nullable().default(null),
  cleanSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});
export type TrackRecord = z.infer<typeof trackRecordSchema>;
/** A record shorter than this many days says too little to share. */
export const RECORD_MIN_DAYS = 30;

/**
 * The record from the book's index (`navIndex` in lib/performance.ts: 100 at
 * the first day with money, flows taken out), SPY's closes and the rules kept
 * (`resonanceOf` in lib/resonance.ts). Null below `RECORD_MIN_DAYS`.
 */
export function trackRecordFrom(index: { dates: string[]; index: number[] } | null, spy: readonly { date: string; value: number }[] | null | undefined, rules: { score: number | null; measured: number } | null): TrackRecord | null {
  if (!index || index.dates.length < 2) return null;
  const since = index.dates[0];
  const through = index.dates[index.dates.length - 1];
  if (daysBetween(since, through) < RECORD_MIN_DAYS) return null;
  const at = (day: string) => {
    let v: number | null = null;
    for (const p of spy ?? []) if (p.date <= day) v = p.value;
    return v;
  };
  const s0 = at(since);
  const s1 = at(through);
  const round = (n: number) => Math.round(n * 100) / 100;
  return trackRecordSchema.parse({
    since,
    through,
    twrPct: round((index.index[index.index.length - 1] / index.index[0] - 1) * 100),
    spyPct: s0 && s1 ? round((s1 / s0 - 1) * 100) : null,
    rulesKeptPct: rules?.score ?? null,
    rulesMeasured: rules?.measured ?? 0,
  });
}

/** One of the methodology's rules as an adviser reads it on the card (Hamza, 9 Nov 2026, the adviser handoff): its section, its words and its kind, never a figure of the book. */
export const sharedRuleSchema = z.object({ section: z.string().min(1).max(20), text: z.string().min(1).max(300), severity: z.enum(["breach", "guideline", "watch"]) });
export type SharedRule = z.infer<typeof sharedRuleSchema>;
export const MAX_SHARED_RULES = 40;

/**
 * How the person decides, as a card carries it (the recruiter view): the
 * share of the past year's trades with a reason and of those planned a day
 * ahead, the share of reasoned trades that fared better than SPY, the
 * calibration of their valuations a year on, and their club record. Percent
 * and counts, never an amount; null where there is nothing to read yet.
 */
export const judgementSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trades: z.number().int().min(0),
  reasonedPct: z.number().min(0).max(100).nullable(),
  rightPct: z.number().min(0).max(100).nullable(),
  plannedPct: z.number().min(0).max(100).nullable(),
  calibrationJudged: z.number().int().min(0),
  calibrationPct: z.number().min(0).max(100).nullable(),
  clubCompetitions: z.number().int().min(0),
  clubMedianAgainstSpyPts: z.number().nullable(),
});
export type Judgement = z.infer<typeof judgementSchema>;

export const communityProfileSchema = z.object({
  version: z.literal(1),
  /** The person's handle: letters, digits and dashes, lower-case, 2 to 24 long; the one thing another person is shown instead of an address. */
  handle: z.string().regex(HANDLE),
  /** How they want to be shown; a name or a pen name, their choice. */
  name: z.string().min(1).max(60),
  /** A line about how they invest, or null. */
  about: z.string().max(300).nullable(),
  /** The methodology's name as they confirmed it, or null; never its rules. */
  methodology: z.string().max(120).nullable(),
  /** The methodology it was forked from, when it began as someone else's (lib/methodology.ts, `lineage`); null otherwise. */
  methodologyFrom: z.string().max(120).nullable().default(null),
  /** The methodology's family (lib/research.ts, `familyOf`), for the pooled benchmarks; null when there is none. */
  family: z.enum(["fundamentals", "options", "quant", "macro"]).nullable().default(null),
  /** Their theses, when they share them; empty arrays when they share the weights alone. */
  stocks: z.array(sharedStockThesisSchema).max(MAX_SHARED_THESES),
  markets: z.array(sharedMarketThesisSchema).max(MAX_SHARED_THESES),
  /** Each listed holding's weight, when they share them; empty when they share the theses alone. */
  weights: z.array(sharedWeightSchema).max(MAX_SHARED_WEIGHTS),
  /** What they chose to share, so the screen says what is left out. */
  sharing: z.object({
    theses: z.boolean(),
    weights: z.boolean(),
    record: z.boolean().default(false),
    /** Whether the card is listed on Community; false keeps it to those who have its link (a mentor's view). */
    listed: z.boolean().default(true),
    /** Whether the methodology's rules are on the card, for an adviser or a mentor to read (the adviser handoff). */
    rules: z.boolean().default(false),
    /** Whether how the person decides is on the card (the recruiter view): reasons, plans, calibration and club record, in percent. */
    judgement: z.boolean().default(false),
  }),
  /** How the person decides, when shared (Hamza, 9 Nov 2026, the twenty further ways: the recruiter view); null otherwise. */
  judgement: z.lazy(() => judgementSchema).nullable().default(null),
  /** The methodology's rules in its own words, when shared; empty otherwise. */
  rules: z.array(sharedRuleSchema).max(MAX_SHARED_RULES).default([]),
  /** The track record the app read, when they share it; null otherwise and on cards kept before it existed. */
  record: trackRecordSchema.nullable().default(null),
  /** The book's as-of day the weights were read at, or null. */
  asOf: z.string().nullable(),
  updatedAt: z.string(),
  /** The last change worth telling followers (Hamza, 19 Oct 2026); null until the card changed once after it was shared. Cards kept before it existed read as null. */
  changed: cardChangeSchema.nullable().default(null),
});
export type CommunityProfile = z.infer<typeof communityProfileSchema>;

/** A profile in a list: who, what they share, how much, when. */
export type ProfileSummary = { handle: string; name: string; about: string | null; methodology: string | null; stocks: number; markets: number; weights: number; updatedAt: string };

export const summaryOf = (p: CommunityProfile): ProfileSummary => ({ handle: p.handle, name: p.name, about: p.about, methodology: p.methodology, stocks: p.stocks.length, markets: p.markets.length, weights: p.weights.length, updatedAt: p.updatedAt });

/** A handle from what the person typed: lower-case, dashes for anything else, trimmed to 24. */
export function handleFrom(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "");
}

/** Why a handle does not fit, or null. */
export function handleProblem(handle: string): string | null {
  if (!HANDLE.test(handle)) return "A handle is 2 to 24 lower-case letters, digits and dashes, starting with a letter or a digit.";
  if (/^(admin|portfolioos|portfolio-os|demo|support|help|me|all)$/.test(handle)) return "That handle is kept by the app.";
  return null;
}

/** The weights a profile shares: each listed holding's share in percent, by weight, never a value. */
export type WeightInput = { symbol: string; name: string | null; weight: number; classLabel: string | null };

/** The theses as shared: words and tests alone; the evidence, the valuation and the DCF stay private. */
export function sharedTheses(file: ThesesFile | null): { stocks: SharedStockThesis[]; markets: SharedMarketThesis[] } {
  const stocks = Object.entries(file?.bySymbol ?? {})
    .filter(([, t]) => t.text.trim() || t.pillars.length)
    .map(([symbol, t]) => ({ symbol: symbol.toUpperCase(), text: t.text, pathway: t.pathway, pillars: t.pillars.map((p) => ({ name: p.name, text: p.text, test: p.test })), watch: t.watch, updatedAt: t.updatedAt, receipt: null }))
    .filter((t) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(t.symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_SHARED_THESES);
  const markets = (file?.markets ?? []).map((m) => ({ id: m.id, title: m.title, text: m.text, pillars: m.pillars.map((p) => ({ name: p.name, text: p.text, test: p.test })), watch: m.watch, updatedAt: m.updatedAt, receipt: null })).slice(0, MAX_SHARED_THESES);
  return { stocks, markets };
}

/**
 * The profile a person shares, built from their handle and name, their
 * theses file and the book's weights, each part only when they chose it.
 * The weights are rounded to a hundredth of a percent; nothing of an amount
 * passes through. Throws a plain sentence when the handle does not fit.
 */
export function profileFrom(i: { handle: string; name: string; about: string | null; methodology: string | null; methodologyFrom?: string | null; family?: CommunityProfile["family"]; theses: ThesesFile | null; weights: readonly WeightInput[]; asOf: string | null; sharing: { theses: boolean; weights: boolean; record?: boolean; listed?: boolean; rules?: boolean; judgement?: boolean }; now: string; changed?: CardChange | null; record?: TrackRecord | null; rules?: readonly SharedRule[]; judgement?: Judgement | null }): CommunityProfile {
  const problem = handleProblem(i.handle);
  if (problem) throw new Error(problem);
  if (!i.sharing.theses && !i.sharing.weights && !i.sharing.record) throw new Error("Choose what to share: your theses, your weights, your track record, or any of them.");
  const t = i.sharing.theses ? sharedTheses(i.theses) : { stocks: [], markets: [] };
  const weights = i.sharing.weights
    ? [...i.weights]
        .filter((w) => Number.isFinite(w.weight) && w.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, MAX_SHARED_WEIGHTS)
        .map((w) => ({ symbol: w.symbol.toUpperCase().slice(0, 20), name: w.name?.slice(0, 120) ?? null, weightPct: Math.round(Math.min(100, w.weight) * 100) / 100, classLabel: w.classLabel?.slice(0, 80) ?? null }))
    : [];
  return communityProfileSchema.parse({ version: 1, handle: i.handle, name: i.name.trim().slice(0, 60) || i.handle, about: i.about?.trim().slice(0, 300) || null, methodology: i.methodology?.trim().slice(0, 120) || null, methodologyFrom: i.methodologyFrom?.trim().slice(0, 120) || null, family: i.family ?? null, stocks: t.stocks, markets: t.markets, weights, sharing: { theses: i.sharing.theses, weights: i.sharing.weights, record: !!i.sharing.record, listed: i.sharing.listed ?? true, rules: !!i.sharing.rules, judgement: !!i.sharing.judgement }, judgement: i.sharing.judgement ? (i.judgement ?? null) : null, rules: i.sharing.rules ? (i.rules ?? []).slice(0, MAX_SHARED_RULES).map((r) => ({ section: r.section.slice(0, 20), text: r.text.slice(0, 300), severity: r.severity })) : [], record: i.sharing.record ? (i.record ?? null) : null, asOf: i.sharing.weights ? i.asOf : null, updatedAt: i.now, changed: i.changed ?? null });
}

/** The weights a kept card carries, as the input `profileFrom` takes, so a card can be rebuilt when the book cannot be read. */
export const weightInputsOf = (p: CommunityProfile): WeightInput[] => p.weights.map((w) => ({ symbol: w.symbol, name: w.name, weight: w.weightPct, classLabel: w.classLabel }));

/** A weight that moved by this many percentage points, or a holding that came or went, is a change followers are told of; a day's drift is not. */
export const WEIGHT_CHANGE_PTS = 1;
/** Followers are told of a change for this many days. */
export const CHANGE_NOTICE_DAYS = 7;
/** The keys of the alerts a followed card's change makes (`communityNotices`). */
export const COMMUNITY_PREFIX = "community:";

const thesisWords = (t: SharedStockThesis | SharedMarketThesis) => JSON.stringify([t.text, "pathway" in t ? t.pathway : (t as SharedMarketThesis).title, t.pillars.map((p) => [p.name, p.text, p.test]), t.watch]);

/** Whether two cards share the same words and weights; `updatedAt` and `changed` are left out, since they are what a refresh sets. */
export function sameCard(a: CommunityProfile, b: CommunityProfile): boolean {
  const body = (p: CommunityProfile) => JSON.stringify([p.handle, p.name, p.about, p.methodology, p.sharing, p.asOf, p.stocks.map((t) => [t.symbol, thesisWords(t)]), p.markets.map((t) => [t.id, thesisWords(t)]), p.weights, p.record, p.judgement]);
  return body(a) === body(b);
}

/**
 * What changed between the card as kept and the card as rebuilt, worth
 * telling followers: each stock thesis (by symbol) and market thesis (by
 * title) added, removed or reworded, and the weights when a holding came or
 * went or one moved by `WEIGHT_CHANGE_PTS` or more. Null when nothing did; a
 * day's drift in the weights is a refresh, not a change.
 */
export function cardChanges(prev: CommunityProfile, next: CommunityProfile): { theses: string[]; weights: boolean; moves: WeightMove[] } | null {
  const theses: string[] = [];
  const stocks = new Map(prev.stocks.map((t) => [t.symbol, thesisWords(t)]));
  for (const t of next.stocks) if (stocks.get(t.symbol) !== thesisWords(t)) theses.push(t.symbol);
  for (const t of prev.stocks) if (!next.stocks.some((n) => n.symbol === t.symbol)) theses.push(t.symbol);
  const markets = new Map(prev.markets.map((t) => [t.id, thesisWords(t)]));
  for (const t of next.markets) if (markets.get(t.id) !== thesisWords(t)) theses.push(t.title);
  for (const t of prev.markets) if (!next.markets.some((n) => n.id === t.id)) theses.push(t.title);
  const before = new Map(prev.weights.map((w) => [w.symbol, w.weightPct]));
  const after = new Map(next.weights.map((w) => [w.symbol, w.weightPct]));
  const moves: WeightMove[] = [...new Set([...before.keys(), ...after.keys()])]
    .filter((s) => {
      const a = before.get(s);
      const b = after.get(s);
      return a === undefined || b === undefined || Math.abs(a - b) >= WEIGHT_CHANGE_PTS;
    })
    .map((symbol) => ({ symbol, from: before.get(symbol) ?? null, to: after.get(symbol) ?? null }))
    .sort((a, b) => Math.abs((b.to ?? 0) - (b.from ?? 0)) - Math.abs((a.to ?? 0) - (a.from ?? 0)) || a.symbol.localeCompare(b.symbol));
  const weights = moves.length > 0;
  if (!theses.length && !weights) return null;
  return { theses: [...new Set(theses)].slice(0, 30), weights, moves: moves.slice(0, 30) };
}

/**
 * The card to keep after a rebuild: null when nothing differs from the card
 * kept, else the rebuilt card dated now, carrying a new `changed` when the
 * difference is one followers are told of and the kept one otherwise.
 */
export function refreshedCard(prev: CommunityProfile, next: CommunityProfile, now: string): CommunityProfile | null {
  if (sameCard(prev, next)) return null;
  const changes = cardChanges(prev, next);
  return { ...next, updatedAt: now, changed: changes ? { at: now, ...changes } : prev.changed };
}

/**
 * The alerts a person gets about the cards they follow (Hamza, 19 Oct 2026):
 * one per card that changed within `CHANGE_NOTICE_DAYS`, keyed by handle and
 * the day of the change, so a later change fires again; it names the theses
 * by symbol or title and says when the weights moved. A card the person does
 * not follow, or one that has not changed since it was shared, makes none.
 */
export function communityNotices(profiles: readonly CommunityProfile[], following: readonly string[], today: string): Notice[] {
  const set = new Set(following);
  const out: Notice[] = [];
  for (const p of profiles) {
    if (!set.has(p.handle) || !p.changed) continue;
    const day = p.changed.at.slice(0, 10);
    if (day > today || daysBetween(day, today) >= CHANGE_NOTICE_DAYS) continue;
    const what = [p.changed.theses.length ? (p.changed.theses.length === 1 ? "a thesis" : "theses") : null, p.changed.weights ? "weights" : null].filter(Boolean).join(" and ");
    if (!what) continue;
    const detail = [p.changed.theses.length ? `Theses: ${p.changed.theses.slice(0, 8).join(", ")}${p.changed.theses.length > 8 ? ` and ${p.changed.theses.length - 8} more` : ""}.` : null, p.changed.weights ? `A holding came or went, or a weight moved by ${WEIGHT_CHANGE_PTS} point${WEIGHT_CHANGE_PTS === 1 ? "" : "s"} or more.` : null, `Open @${p.handle} to read it.`].filter(Boolean).join(" ");
    out.push({ key: `${COMMUNITY_PREFIX}${p.handle}:${day}`, date: day, tone: "info", title: `${p.name} changed their ${what}`, detail, href: `/community/${encodeURIComponent(p.handle)}` });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

/** The keys a profile must never carry, whatever is added to it: an amount, an account, a token, a price (a pillar test's `value` is a level, never money). Held by the check. */
export const FORBIDDEN_KEYS = /^(values|amount|cost|quantity|units|shares|netWorth|net_worth|cash|account|accountId|email|token|refresh|key|price|evidence|dcf|valuation|ownValuation)$/;

/** Every key in a profile, at any depth. */
export function keysOf(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => keysOf(v, out));
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

/** The profiles the person follows, in the order followed, then the rest; a followed handle no longer shared is named. */
export function splitFollowing(profiles: readonly ProfileSummary[], following: readonly string[]): { followed: ProfileSummary[]; others: ProfileSummary[]; gone: string[] } {
  const by = new Map(profiles.map((p) => [p.handle, p]));
  const followed = following.map((h) => by.get(h)).filter((p): p is ProfileSummary => !!p);
  const gone = following.filter((h) => !by.has(h));
  const set = new Set(following);
  const others = profiles.filter((p) => !set.has(p.handle)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { followed, others, gone };
}

/** The following list with a handle added or removed, within the limit; unchanged when the handle does not fit. */
export function withFollowing(following: readonly string[], handle: string, follow: boolean): string[] {
  if (!HANDLE.test(handle)) return [...following];
  const rest = following.filter((h) => h !== handle);
  return follow ? [...rest, handle].slice(-MAX_FOLLOWING) : rest;
}

export const communityFileSchema = z.object({ version: z.literal(1), profiles: z.array(communityProfileSchema).max(200) });
export type CommunityFile = z.infer<typeof communityFileSchema>;

// ---------------------------------------------------------------------------
// The community index (Hamza, 23 Oct 2026, after Rallies.AI)

/** A company is in the index only when this many people sharing their weights hold it, so no one's weight can be read back from it. */
export const INDEX_MIN_HOLDERS = 5;
/** Companies the index lists. */
export const INDEX_ROWS = 25;

export type IndexRow = { symbol: string; name: string | null; holders: number; holdersPct: number; avgWeightPct: number; indexWeightPct: number };

/**
 * What the people sharing their weights hold together, from the shared cards
 * alone: each company held by at least INDEX_MIN_HOLDERS of them, with how
 * many hold it, its average weight among them and its weight in an index
 * that gives each person an equal part. Never a handle, an amount or an
 * account; the companies below the floor are only counted.
 */
export function communityIndex(profiles: readonly Pick<CommunityProfile, "weights" | "sharing">[]): { rows: IndexRow[]; people: number; below: number } {
  const people = profiles.filter((p) => p.sharing.weights && p.weights.length);
  const by = new Map<string, { name: string | null; weights: number[] }>();
  for (const p of people) {
    const seen = new Set<string>();
    for (const w of p.weights) {
      const s = w.symbol.toUpperCase();
      if (seen.has(s)) continue;
      seen.add(s);
      const e = by.get(s) ?? { name: w.name, weights: [] };
      e.weights.push(w.weightPct);
      by.set(s, e);
    }
  }
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const all = [...by.entries()].map(([symbol, e]) => ({ symbol, name: e.name, holders: e.weights.length, holdersPct: people.length ? round2((e.weights.length / people.length) * 100) : 0, avgWeightPct: round2(e.weights.reduce((a, b) => a + b, 0) / e.weights.length), indexWeightPct: people.length ? round2(e.weights.reduce((a, b) => a + b, 0) / people.length) : 0 }));
  const rows = all.filter((r) => r.holders >= INDEX_MIN_HOLDERS).sort((a, b) => b.holders - a.holders || b.indexWeightPct - a.indexWeightPct || a.symbol.localeCompare(b.symbol));
  return { rows: rows.slice(0, INDEX_ROWS), people: people.length, below: all.length - rows.length };
}

// ---------------------------------------------------------------------------
// The feed (Hamza, 6 Nov 2026: "make the Community page look much more like
// Blossom and have some of its features"): what the people sharing wrote and
// moved, newest first, from the shared cards alone. No post, like or comment
// is kept: each item is a thesis as shared, a change a card already records,
// or the card itself.

/** Items the feed lists. */
export const FEED_ITEMS = 40;
/** A thesis's opening words in the feed, cut at a whole sentence. */
export const FEED_EXCERPT = 280;
/** Holdings a person's card shows as chips. */
export const TOP_HOLDINGS = 4;

export type FeedChip = { symbol: string; weightPct: number | null };
export type FeedItem =
  | { kind: "thesis"; id: string; handle: string; name: string; at: string; symbol: string | null; title: string; excerpt: string; pillars: number; chips: FeedChip[]; href: string }
  | { kind: "moves"; id: string; handle: string; name: string; at: string; moves: WeightMove[]; theses: string[]; chips: FeedChip[]; href: string }
  | { kind: "card"; id: string; handle: string; name: string; at: string; about: string | null; methodology: string | null; chips: FeedChip[]; href: string };

const profileHref = (handle: string, anchor?: string) => `/community/${encodeURIComponent(handle)}${anchor ? `#${anchor}` : ""}`;

/** A person's largest holdings as chips, in percent. */
export function topHoldings(p: Pick<CommunityProfile, "weights">, n = TOP_HOLDINGS): FeedChip[] {
  return [...p.weights].sort((a, b) => b.weightPct - a.weightPct || a.symbol.localeCompare(b.symbol)).slice(0, n).map((w) => ({ symbol: w.symbol, weightPct: w.weightPct }));
}

/** Whether a card answers a search: its handle, name, line or methodology, or a symbol it holds or writes about. */
export function matchesSearch(p: CommunityProfile, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const words = [p.handle, p.name, p.about ?? "", p.methodology ?? "", ...p.markets.map((m) => m.title)].join(" ").toLowerCase();
  const symbols = new Set([...p.weights.map((w) => w.symbol), ...p.stocks.map((s) => s.symbol)].map((s) => s.toLowerCase()));
  return words.includes(t) || symbols.has(t.replace(/^\$/, ""));
}

/**
 * The feed: each shared thesis at the day it was last written, each card's
 * latest weight moves, and each card that has neither as the card itself,
 * newest first. A search on a symbol keeps the items about it; on words, the
 * people it names.
 */
export function communityFeed(profiles: readonly CommunityProfile[], q = "", max = FEED_ITEMS): FeedItem[] {
  const t = q.trim().toLowerCase().replace(/^\$/, "");
  const out: FeedItem[] = [];
  for (const p of profiles) {
    if (!matchesSearch(p, q)) continue;
    const weightOf = (s: string) => p.weights.find((w) => w.symbol === s)?.weightPct ?? null;
    const symbolSearch = !!t && [...p.weights.map((w) => w.symbol), ...p.stocks.map((s) => s.symbol)].some((s) => s.toLowerCase() === t);
    const before = out.length;
    for (const s of p.stocks) {
      if (symbolSearch && s.symbol.toLowerCase() !== t) continue;
      out.push({ kind: "thesis", id: `t:${p.handle}:${s.symbol}`, handle: p.handle, name: p.name, at: s.updatedAt, symbol: s.symbol, title: s.symbol, excerpt: sentenceCut(s.text, FEED_EXCERPT), pillars: s.pillars.length, chips: [{ symbol: s.symbol, weightPct: weightOf(s.symbol) }], href: profileHref(p.handle, `thesis-${s.symbol}`) });
    }
    if (!symbolSearch)
      for (const m of p.markets) out.push({ kind: "thesis", id: `m:${p.handle}:${m.id}`, handle: p.handle, name: p.name, at: m.updatedAt, symbol: null, title: m.title, excerpt: sentenceCut(m.text, FEED_EXCERPT), pillars: m.pillars.length, chips: [], href: profileHref(p.handle, `market-${m.id}`) });
    const c = p.changed;
    if (c && c.weights && (!symbolSearch || c.moves.some((m) => m.symbol.toLowerCase() === t))) {
      const moves = symbolSearch ? c.moves.filter((m) => m.symbol.toLowerCase() === t) : c.moves;
      out.push({ kind: "moves", id: `w:${p.handle}:${c.at}`, handle: p.handle, name: p.name, at: c.at, moves, theses: c.theses, chips: moves.length ? [] : topHoldings(p), href: profileHref(p.handle, "portfolio") });
    }
    if (out.length === before && !symbolSearch) out.push({ kind: "card", id: `c:${p.handle}`, handle: p.handle, name: p.name, at: p.updatedAt, about: p.about, methodology: p.methodology, chips: topHoldings(p), href: profileHref(p.handle) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, max);
}

/** How long ago, as a feed says it: today, 1d, 12d, then the date. */
export function ageWords(at: string, today: string): string {
  const day = at.slice(0, 10);
  const d = daysBetween(day, today);
  if (d <= 0) return "Today";
  if (d < 30) return `${d}d`;
  return day;
}

/** A person's initials for their avatar, from the name they chose, else the handle. */
export function initialsOf(name: string, handle: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? handle).slice(0, 2);
  return s.toUpperCase();
}

/** One of `n` hues for a handle, the same everywhere it is drawn. */
export function hueOf(handle: string, n: number): number {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}

// ---------------------------------------------------------------------------
// Streaks and pooled benchmarks (Hamza, 9 Nov 2026, the moat list)

/**
 * The record with its streak carried: no breach open today keeps the day the
 * last one closed (the kept record's, else the last breach the alerts file
 * shows, else today, so a streak is never claimed for days the app did not
 * see); a breach open today ends it.
 */
export function withStreak(record: TrackRecord, breaches: number | null, prev: TrackRecord | null, lastBreachEnd: string | null, today: string): TrackRecord {
  if (breaches === null) return { ...record, breaches: null, cleanSince: prev?.cleanSince ?? null };
  if (breaches > 0) return { ...record, breaches, cleanSince: null };
  const since = prev?.cleanSince ?? (lastBreachEnd && lastBreachEnd <= today ? lastBreachEnd : today);
  return { ...record, breaches, cleanSince: since };
}

/** Whole weeks with no breach open, through the record's last day; null with no streak read. */
export function streakWeeks(r: Pick<TrackRecord, "cleanSince" | "through" | "breaches"> | null): number | null {
  if (!r || r.breaches === null || r.breaches === undefined) return null;
  if (r.breaches > 0 || !r.cleanSince) return 0;
  return Math.max(0, Math.floor(daysBetween(r.cleanSince, r.through) / 7));
}

/** A family's pooled figures count only with this many people sharing a record under it, so no one person's record is told apart. */
export const POOL_MIN_PEOPLE = 3;

export type PoolRow = { family: NonNullable<CommunityProfile["family"]>; people: number; medianTwrPct: number; medianAgainstSpyPts: number | null; medianRulesKeptPct: number | null; medianDays: number };

const med = (xs: readonly number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * How each family of methodologies did on this deployment: the median
 * time-weighted return of the people who share a record under it, the median
 * against SPY over each one's own days, the median rules kept and the median
 * length of record, in percent and days; a family under `POOL_MIN_PEOPLE` is
 * left out. Records cover different days, which the screen says.
 */
export function pooledBenchmarks(profiles: readonly Pick<CommunityProfile, "family" | "record" | "sharing">[]): { rows: PoolRow[]; below: number } {
  const by = new Map<NonNullable<CommunityProfile["family"]>, TrackRecord[]>();
  for (const p of profiles) {
    if (!p.family || !p.record || !p.sharing.record) continue;
    by.set(p.family, [...(by.get(p.family) ?? []), p.record]);
  }
  const rows: PoolRow[] = [];
  let below = 0;
  for (const [family, rs] of by) {
    if (rs.length < POOL_MIN_PEOPLE) {
      below += 1;
      continue;
    }
    const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
    rows.push({
      family,
      people: rs.length,
      medianTwrPct: round(med(rs.map((r) => r.twrPct)))!,
      medianAgainstSpyPts: round(med(rs.flatMap((r) => (r.spyPct === null ? [] : [r.twrPct - r.spyPct])))),
      medianRulesKeptPct: round(med(rs.flatMap((r) => (r.rulesKeptPct === null ? [] : [r.rulesKeptPct])))),
      medianDays: Math.round(med(rs.map((r) => daysBetween(r.since, r.through)))!),
    });
  }
  return { rows: rows.sort((a, b) => b.people - a.people || a.family.localeCompare(b.family)), below };
}

// ---------------------------------------------------------------------------
// The verified analyst badge (Hamza, 9 Nov 2026, the twenty more ways)

/** A record earns the badge after this many days, ... */
export const BADGE_MIN_DAYS = 365;
/** ... this many weeks without a breach open, ... */
export const BADGE_MIN_WEEKS = 12;
/** ... and this share of the measurable rules kept today. */
export const BADGE_MIN_RULES_PCT = 80;

/**
 * The verified analyst badge: a record the app read itself, a year long or
 * more, with a streak of weeks without a breach and most rules kept. It says
 * the person invests by their own rules, read from their statement, never
 * that they beat anything; the return is not one of its tests.
 */
export function badgeOf(r: TrackRecord | null): { verified: boolean; missing: string[] } {
  if (!r) return { verified: false, missing: ["a shared track record"] };
  const missing: string[] = [];
  const days = daysBetween(r.since, r.through);
  if (days < BADGE_MIN_DAYS) missing.push(`${BADGE_MIN_DAYS - days} more days of record`);
  const weeks = streakWeeks(r);
  if (weeks === null || weeks < BADGE_MIN_WEEKS) missing.push(`${BADGE_MIN_WEEKS} weeks without a breach (${weeks ?? 0} now)`);
  if (r.rulesKeptPct === null || r.rulesKeptPct < BADGE_MIN_RULES_PCT) missing.push(`${BADGE_MIN_RULES_PCT}% of rules kept (${r.rulesKeptPct ?? "none measured"}${r.rulesKeptPct === null ? "" : "%"} now)`);
  return { verified: !missing.length, missing };
}

/** The methodology's rules as the card carries them. */
export function sharedRulesOf(m: { rules: readonly { section: string; text: string; severity: "breach" | "guideline" | "watch" }[] } | null): SharedRule[] {
  return (m?.rules ?? []).slice(0, MAX_SHARED_RULES).map((r) => ({ section: r.section, text: r.text, severity: r.severity }));
}
