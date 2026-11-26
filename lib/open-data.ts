/**
 * Open data donations and the annual Invariant report (Hamza, 9 Nov 2026,
 * the twenty more ways). A person who opts in (`donate` in the preferences,
 * off by default) gives, once a week, a few figures about how they keep
 * their own rules: the methodology's family, the share of measurable rules
 * kept, the breaches, the share of the past year's trades with a written
 * reason, and how many holdings in a band; never an amount, a holding, a
 * name or an address. Each is kept under a keyed fingerprint of the sign-in
 * and the week, and published only pooled, a family at a time, once
 * `OPEN_MIN_PEOPLE` have given that week. The annual report lays the year's
 * pooled figures beside the deployment's counts. Pure.
 */
import { z } from "zod";

import { streakWeeks, type CommunityProfile } from "@/lib/community";
import { FAMILIES } from "@/lib/research";

export const OPEN_MIN_PEOPLE = 5;
export const HOLDING_BANDS = ["1-9", "10-19", "20-39", "40+"] as const;

export const donationSchema = z.object({
  family: z.enum(FAMILIES).nullable(),
  rulesKeptPct: z.number().min(0).max(100).nullable(),
  rulesMeasured: z.number().int().min(0),
  breaches: z.number().int().min(0).nullable(),
  reasonedPct: z.number().min(0).max(100).nullable(),
  holdings: z.enum(HOLDING_BANDS).nullable(),
});
export type Donation = z.infer<typeof donationSchema>;

export const holdingBand = (n: number): Donation["holdings"] => (n <= 0 ? null : n < 10 ? "1-9" : n < 20 ? "10-19" : n < 40 ? "20-39" : "40+");

export function donationFrom(i: { family: Donation["family"]; rules: { score: number | null; measured: number; breaches: number } | null; reasonedPct: number | null; listedHoldings: number }): Donation {
  return donationSchema.parse({ family: i.family, rulesKeptPct: i.rules?.score ?? null, rulesMeasured: i.rules?.measured ?? 0, breaches: i.rules ? i.rules.breaches : null, reasonedPct: i.reasonedPct, holdings: holdingBand(i.listedHoldings) });
}

/** The ISO week a day falls in, as 2026-W45. */
export function isoWeek(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(y, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const w = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${y}-W${String(w).padStart(2, "0")}`;
}

const med = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};

export type OpenRow = { family: NonNullable<Donation["family"]> | "all"; people: number; medianRulesKeptPct: number | null; withBreachPct: number | null; medianReasonedPct: number | null; bands: Record<(typeof HOLDING_BANDS)[number], number> };

/**
 * One week's donations pooled: everyone together, then each family, each row
 * only with `OPEN_MIN_PEOPLE` or more people (the rest counted in `below`),
 * so no row is one person. A band count under the floor shows as zero.
 */
export function openData(donations: readonly Donation[]): { rows: OpenRow[]; people: number; below: number } {
  const row = (family: OpenRow["family"], ds: readonly Donation[]): OpenRow => {
    const breachRead = ds.filter((d) => d.breaches !== null);
    const bands = Object.fromEntries(HOLDING_BANDS.map((b) => [b, ds.filter((d) => d.holdings === b).length])) as OpenRow["bands"];
    for (const b of HOLDING_BANDS) if (bands[b] < OPEN_MIN_PEOPLE) bands[b] = 0;
    return {
      family,
      people: ds.length,
      medianRulesKeptPct: med(ds.flatMap((d) => (d.rulesKeptPct === null ? [] : [d.rulesKeptPct]))),
      withBreachPct: breachRead.length ? Math.round((breachRead.filter((d) => d.breaches! > 0).length / breachRead.length) * 100) : null,
      medianReasonedPct: med(ds.flatMap((d) => (d.reasonedPct === null ? [] : [d.reasonedPct]))),
      bands,
    };
  };
  const rows: OpenRow[] = [];
  let below = 0;
  if (donations.length >= OPEN_MIN_PEOPLE) rows.push(row("all", donations));
  else if (donations.length) below += 1;
  for (const f of FAMILIES) {
    const ds = donations.filter((d) => d.family === f);
    if (!ds.length) continue;
    if (ds.length >= OPEN_MIN_PEOPLE) rows.push(row(f, ds));
    else below += 1;
  }
  return { rows, people: donations.length >= OPEN_MIN_PEOPLE ? donations.length : 0, below };
}

// ---------------------------------------------------------------------------
// The annual Invariant report

export type YearCounts = { cardsShared: number; recordsShared: number; receipts: number; clubs: number; competitions: number; listings: number; adoptions: number; donors: number };

export type AnnualReport = { year: number; through: string; counts: YearCounts; open: ReturnType<typeof openData> | null; openWeek: string | null; lines: string[] };

/**
 * The year in a page: what people did on the deployment, counted (never who),
 * the latest week of open data pooled, and a few plain lines. A count under
 * `OPEN_MIN_PEOPLE` is said as "fewer than five", so a small deployment
 * names no one by elimination.
 */
export function annualReport(i: { year: number; through: string; counts: YearCounts; open: readonly Donation[]; openWeek: string | null }): AnnualReport {
  const few = (n: number, one: string, many: string) => (n === 0 ? `no ${many}` : n < OPEN_MIN_PEOPLE ? `fewer than ${OPEN_MIN_PEOPLE} ${many}` : `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`);
  const c = i.counts;
  const open = i.open.length ? openData(i.open) : null;
  const all = open?.rows.find((r) => r.family === "all") ?? null;
  const lines = [
    `${cap(few(c.cardsShared, "person shared a card", "people shared a card"))}${c.recordsShared >= OPEN_MIN_PEOPLE ? `, ${c.recordsShared.toLocaleString("en-US")} of them with a track record` : ""}.`,
    `${cap(few(c.receipts, "thesis or journal was sealed", "theses and journals were sealed"))}, each provably unchanged since.`,
    `${cap(few(c.clubs, "club was started", "clubs were started"))}${c.competitions ? `, running ${few(c.competitions, "competition", "competitions")}` : ""}.`,
    `${cap(few(c.listings, "methodology was listed", "methodologies were listed"))} on the marketplace${c.adoptions ? `, adopted ${few(c.adoptions, "time", "times")}` : ""}.`,
    all ? `Among the ${all.people} who gave open data in ${i.openWeek}, the median kept ${all.medianRulesKeptPct ?? "an unmeasured share of"}% of their measurable rules, and ${all.withBreachPct ?? 0}% had a rule broken that week.` : "Too few people gave open data this year to publish any of it.",
  ];
  return { year: i.year, through: i.through, counts: c, open, openWeek: i.openWeek, lines };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Open data for researchers (Hamza, 9 Nov 2026, the twenty further ways): the
// pooled weeks as one CSV under an open licence, each row a family's week
// with `OPEN_MIN_PEOPLE` or more people, never one person's donation.

export const OPEN_LICENCE = "CC BY 4.0";
export const CSV_HEADER = ["week", "family", "people", "median_rules_kept_pct", "with_breach_pct", "median_reasoned_pct", ...HOLDING_BANDS.map((b) => `holdings_${b.replace("+", "_plus").replace("-", "_")}`)];

const cell = (v: string | number | null) => (v === null ? "" : typeof v === "number" ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Every pooled week as CSV rows, the oldest first; a week too small to publish gives no row. */
export function openDataCsv(weeks: readonly { week: string; donations: readonly Donation[] }[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const w of [...weeks].sort((a, b) => a.week.localeCompare(b.week))) {
    for (const r of openData(w.donations).rows) lines.push([w.week, r.family, r.people, r.medianRulesKeptPct, r.withBreachPct, r.medianReasonedPct, ...HOLDING_BANDS.map((b) => r.bands[b])].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Annual awards (Hamza, 9 Nov 2026, the twenty further ways): read from the
// cards people chose to list and the clubs on the league, by the app's
// arithmetic alone. Never a return on its own: the judgement, the rules kept
// and the reasons.

export const AWARD_MIN_JUDGED = 5;
export const AWARD_MIN_TRADES = 10;

export type AwardCard = { handle: string; name: string; listed: boolean; streakWeeks: number | null; rulesKeptPct: number | null; calibrationPct: number | null; calibrationJudged: number; reasonedPct: number | null; trades: number };
export type AwardClub = { club: string; starts: string; medianAgainstSpyPts: number | null; entries: number; reviewedPitches: number; averageReview: number | null };
export type Award = { id: string; title: string; about: string; winner: string | null; href: string | null; detail: string };

/** A shared card as the awards read it: its record and its judgement only where the person shares them. */
export function awardCardOf(p: CommunityProfile): AwardCard {
  const rec = p.sharing.record ? (p.record ?? null) : null;
  const j = p.sharing.judgement ? (p.judgement ?? null) : null;
  return { handle: p.handle, name: p.name, listed: p.sharing.listed, streakWeeks: streakWeeks(rec), rulesKeptPct: rec?.rulesKeptPct ?? null, calibrationPct: j?.calibrationPct ?? null, calibrationJudged: j?.calibrationJudged ?? 0, reasonedPct: j?.reasonedPct ?? null, trades: j?.trades ?? 0 };
}

/** The year's awards; one with no one qualifying says so. */
export function awardsOf(i: { year: number; cards: readonly AwardCard[]; clubs: readonly AwardClub[] }): Award[] {
  const listed = i.cards.filter((c) => c.listed);
  const pick = <T>(xs: readonly T[], score: (x: T) => number | null): T | null => {
    let best: T | null = null;
    let bs = -Infinity;
    for (const x of xs) {
      const s = score(x);
      if (s !== null && s > bs) [best, bs] = [x, s];
    }
    return best;
  };
  const calibrated = pick(listed.filter((c) => c.calibrationJudged >= AWARD_MIN_JUDGED), (c) => c.calibrationPct);
  const disciplined = pick(listed, (c) => (c.streakWeeks === null || c.rulesKeptPct === null ? null : c.streakWeeks * 1000 + c.rulesKeptPct));
  const reasoned = pick(listed.filter((c) => c.trades >= AWARD_MIN_TRADES), (c) => c.reasonedPct);
  const yearClubs = i.clubs.filter((c) => c.starts.startsWith(String(i.year)));
  const club = pick(yearClubs, (c) => c.medianAgainstSpyPts);
  const library = pick(yearClubs.filter((c) => c.reviewedPitches >= AWARD_MIN_JUDGED), (c) => c.averageReview);
  const none = "No one qualified this year.";
  return [
    { id: "calibrated", title: "Best calibrated", about: `The listed card whose valuations held the price between their bear and bull most often, with at least ${AWARD_MIN_JUDGED} judged.`, winner: calibrated?.name ?? null, href: calibrated ? `/community/${calibrated.handle}` : null, detail: calibrated ? `${calibrated.calibrationPct}% of ${calibrated.calibrationJudged} valuations held` : none },
    { id: "disciplined", title: "Most disciplined", about: "The listed card with the longest run of weeks without a breach, then the most rules kept.", winner: disciplined?.name ?? null, href: disciplined ? `/community/${disciplined.handle}` : null, detail: disciplined ? `${disciplined.streakWeeks} weeks without a breach, ${disciplined.rulesKeptPct}% of rules kept` : none },
    { id: "reasoned", title: "Every trade reasoned", about: `The listed card with the largest share of trades carrying a written reason, with at least ${AWARD_MIN_TRADES} trades.`, winner: reasoned?.name ?? null, href: reasoned ? `/community/${reasoned.handle}` : null, detail: reasoned ? `${reasoned.reasonedPct}% of ${reasoned.trades} trades` : none },
    { id: "club", title: "Club of the year", about: `The club on the league whose median member did best against SPY in a competition started in ${i.year}.`, winner: club?.club ?? null, href: club ? "/clubs/league" : null, detail: club ? `median member ${club.medianAgainstSpyPts! >= 0 ? "+" : ""}${club.medianAgainstSpyPts!.toFixed(1)} points against SPY, ${club.entries} entries` : none },
    { id: "library", title: "Best research library", about: `The club on the league whose pitches its members scored highest on their evidence, with at least ${AWARD_MIN_JUDGED} reviewed.`, winner: library?.club ?? null, href: library ? "/clubs/league" : null, detail: library ? `${library.averageReview!.toFixed(1)} out of 5 over ${library.reviewedPitches} pitches` : none },
  ];
}
