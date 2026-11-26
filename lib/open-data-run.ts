import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { communityFileSchema } from "@/lib/community";
import { clubsSampleSchema } from "@/lib/clubs";
import { awardCardOf, awardsOf, donationSchema, type Award, type AwardClub, type Donation, type YearCounts } from "@/lib/open-data";
import { storageMode } from "@/lib/storage";

/**
 * Reads the open data and the year's counts for the public pages
 * (app/open-data, app/annual): the registry's on a deployment, the demo's
 * fictional sample in demo mode. Nothing here names a person.
 */
const sampleSchema = z.object({ week: z.string(), donations: z.array(donationSchema), counts: z.object({ cardsShared: z.number(), recordsShared: z.number(), receipts: z.number(), clubs: z.number(), competitions: z.number(), listings: z.number(), adoptions: z.number(), donors: z.number() }) });

function sample() {
  return sampleSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "open-data.json"), "utf8")));
}

export async function openWeek(): Promise<{ week: string | null; donations: Donation[]; problem: string | null }> {
  if (storageMode() === "demo") {
    const s = sample();
    return { week: s.week, donations: s.donations, problem: null };
  }
  try {
    const { registryAvailable, donationsOf } = await import("@/lib/registry");
    if (!registryAvailable()) return { week: null, donations: [], problem: "This deployment keeps no open data." };
    return { ...(await donationsOf(null)), problem: null };
  } catch {
    return { week: null, donations: [], problem: "The open data could not be read just now." };
  }
}

export async function yearOf(year: number): Promise<{ counts: YearCounts | null; week: string | null; donations: Donation[] }> {
  if (storageMode() === "demo") {
    const s = sample();
    return { counts: s.counts, week: s.week, donations: s.donations };
  }
  try {
    const { registryAvailable, yearCounts, lastDonationWeek, donationsOf } = await import("@/lib/registry");
    if (!registryAvailable()) return { counts: null, week: null, donations: [] };
    const [counts, week] = await Promise.all([yearCounts(year), lastDonationWeek(year)]);
    const d = week ? await donationsOf(week) : { week: null, donations: [] };
    return { counts, week: d.week, donations: d.donations };
  } catch {
    return { counts: null, week: null, donations: [] };
  }
}

/** Every pooled week for the download (`openDataCsv`); the demo's one fictional week. */
export async function allWeeks(): Promise<{ weeks: { week: string; donations: Donation[] }[]; problem: string | null }> {
  if (storageMode() === "demo") {
    const s = sample();
    return { weeks: [{ week: s.week, donations: s.donations }], problem: null };
  }
  try {
    const { registryAvailable, allDonations } = await import("@/lib/registry");
    if (!registryAvailable()) return { weeks: [], problem: "This deployment keeps no open data." };
    return { weeks: await allDonations(), problem: null };
  } catch {
    return { weeks: [], problem: "The open data could not be read just now." };
  }
}

/**
 * The year's awards (`awardsOf`): from the listed cards, each read only where
 * its person shares it, and the clubs on the league; the demo's from its
 * fictional cards and league.
 */
export async function awardsFor(year: number): Promise<Award[] | null> {
  const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", file), "utf8"));
  if (storageMode() === "demo") {
    const cards = communityFileSchema.parse(read("community.json")).profiles.map(awardCardOf);
    const league = clubsSampleSchema.parse(read("clubs.json")).league;
    const clubs: AwardClub[] = league.map((r, i) => ({ club: r.club, starts: r.starts, medianAgainstSpyPts: r.summary.medianAgainstSpyPts, entries: r.summary.entries, reviewedPitches: 6 + i, averageReview: Math.round((4.2 - i * 0.3) * 10) / 10 }));
    return awardsOf({ year, cards, clubs });
  }
  try {
    const { registryAvailable, communityProfiles, leagueRows, leagueLibraryStats } = await import("@/lib/registry");
    if (!registryAvailable()) return null;
    const [{ profiles }, rows, library] = await Promise.all([communityProfiles(), leagueRows(), leagueLibraryStats(year)]);
    const clubs: AwardClub[] = rows.map((r) => ({ club: r.club, starts: r.starts, medianAgainstSpyPts: r.summary.medianAgainstSpyPts, entries: r.summary.entries, reviewedPitches: library[r.clubId]?.reviewed ?? 0, averageReview: library[r.clubId]?.average ?? null }));
    return awardsOf({ year, cards: profiles.map(awardCardOf), clubs });
  } catch {
    return null;
  }
}
