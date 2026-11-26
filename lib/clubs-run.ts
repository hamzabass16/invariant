import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { boardRecords, clubCalibration, courseGrades, seasonTable, type Treasury, clubWatchNotices, pickFund, type CalibrationRow, closeBefore, closeOn, clubsSampleSchema, judgedTrades, leaderboard, leagueTable, picksScorecard, runsClub, symbolsHeld, valueOf, type Alumnus, type BoardRow, type BountyView, type ChallengeView, type Club, type ClubRecord, type ClubRole, type ClubsSample, type ClubWatch, type Competition, type Entry, type LeagueRow, type Member, type MeetingView, type Pitch, type PickRow, type ReviewSummary, type Valued } from "@/lib/clubs";
import { loadCloses } from "@/lib/markets-feed";
import type { Notice } from "@/lib/screens";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";

/**
 * Clubs as a screen reads them (lib/clubs.ts): the registry's rows for the
 * person signed in, or the demo's fictional club. Prices come from the one
 * price feed (`loadCloses`), the last close for a trade and for the board.
 */

let sample: ClubsSample | null = null;
function demoClubs(): ClubsSample {
  sample ??= clubsSampleSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "clubs.json"), "utf8")));
  return sample;
}

export type ClubsList = { available: boolean; error: string | null; clubs: { club: Club; role: ClubRole; members: number }[] };

export async function clubsList(email: string): Promise<ClubsList> {
  if (storageMode() === "demo") return { available: true, error: null, clubs: demoClubs().clubs.map((c) => ({ club: c.club, role: c.members.find((m) => m.you)?.role ?? "member", members: c.members.length })) };
  const { registryAvailable, registryProblem, clubsOf } = await import("@/lib/registry");
  if (!registryAvailable()) return { available: false, error: registryProblem(), clubs: [] };
  try {
    return { available: true, error: null, clubs: await clubsOf(email) };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { available: true, error: e.message, clubs: [] };
  }
}

export type ClubPage = { club: Club; role: ClubRole; members: Member[]; competitions: Competition[]; invite: string | null; league: boolean };

/** One club for one of its members; null when there is none or they are not in it. */
export async function clubPage(email: string, id: string): Promise<ClubPage | null> {
  if (storageMode() === "demo") {
    const c = demoClubs().clubs.find((x) => x.club.id === id);
    if (!c) return null;
    const role = c.members.find((m) => m.you)?.role ?? "member";
    return { club: c.club, role, members: c.members.map((m) => ({ ...m, email: runsClub(role) ? m.email : null })), competitions: c.competitions.map((x) => x.competition), invite: runsClub(role) ? "K7Q2M9XW4T" : null, league: c.league };
  }
  const { registryAvailable, clubFor, clubMembers, clubCompetitions, clubInvite, clubOnLeague } = await import("@/lib/registry");
  if (!registryAvailable()) return null;
  const mine = await clubFor(email, id);
  if (!mine) return null;
  const runs = runsClub(mine.role);
  const [members, competitions, invite, league] = await Promise.all([clubMembers(id, email, runs), clubCompetitions(id), runs ? clubInvite(id) : Promise.resolve(null), clubOnLeague(id)]);
  return { ...mine, members, competitions, invite, league };
}

export type CompetitionPage = {
  page: ClubPage;
  competition: Competition;
  entries: Entry[];
  board: { rows: BoardRow[]; spyPct: number | null };
  /** Reasoned trades judged against SPY since each was made, every entry's. */
  judged: { right: number; share: number | null; count: number };
  mine: (Valued & { trades: Entry["trades"] }) | null;
  /** The close the board is read at. */
  asOf: string | null;
  problems: string[];
};

/**
 * A competition's board: every entry at the last close, or at the close on
 * its last day once it has ended, and SPY over the same days, from the close
 * before the first day.
 */
export async function competitionPage(email: string, clubId: string, competitionId: string, today: string): Promise<CompetitionPage | null> {
  const page = await clubPage(email, clubId);
  const competition = page?.competitions.find((c) => c.id === competitionId);
  if (!page || !competition) return null;
  let entries: Entry[];
  if (storageMode() === "demo") entries = demoClubs().clubs.find((c) => c.club.id === clubId)?.competitions.find((x) => x.competition.id === competitionId)?.entries ?? [];
  else entries = await (await import("@/lib/registry")).competitionEntries(competitionId, email);
  const upTo = competition.ends < today ? competition.ends : today;
  const days = Math.max(14, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${competition.starts}T00:00:00Z`)) / 86_400_000) + 14);
  const symbols = [...new Set([...symbolsHeld(competition, entries), ...entries.flatMap((e) => e.trades.filter((t) => t.reason).map((t) => t.symbol)), "SPY"])].slice(0, 80);
  const closes = await loadCloses(symbols.join(","), today, "budget", days);
  const prices = new Map<string, number>();
  let asOf: string | null = null;
  for (const s of symbols) {
    const c = closeOn(closes.series[s], upTo);
    if (!c) continue;
    prices.set(s, c.price);
    if (s === "SPY" || !asOf) asOf = c.day;
  }
  const spyStart = closeBefore(closes.series.SPY, competition.starts);
  const spyNow = prices.get("SPY");
  const board = leaderboard(competition, entries, prices, spyStart && spyNow ? { start: spyStart.price, now: spyNow } : null);
  // The board as the league and each member's record read it, kept whenever it is read (percent and counts, never an amount); a failure here never fails the page.
  if (storageMode() !== "demo" && asOf) {
    const { summary, results } = boardRecords(competition, board, asOf, today);
    await (await import("@/lib/registry")).keepBoard(competitionId, summary, results).catch(() => console.error("[clubs] board not kept"));
  }
  const own = entries.find((e) => e.you);
  const mine = own ? { ...valueOf(own.trades, competition.cash, prices), trades: own.trades } : null;
  const j = judgedOf(entries, prices, closes.series.SPY, asOf);
  return { page, competition, entries, board, judged: { right: j.right, share: j.share, count: j.judged.length }, mine, asOf, problems: closes.problems };
}

/** The last close of one ticker, for a trade to fill at; null when the feed has none. */
export async function lastClose(symbol: string, today: string): Promise<{ day: string; price: number } | null> {
  const closes = await loadCloses(symbol, today, "full", 14);
  return closeOn(closes.series[symbol], today);
}

/** The last closes of what an entry holds, for the weight limit on a buy. */
export async function heldPrices(symbols: readonly string[], today: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!symbols.length) return out;
  const closes = await loadCloses(symbols.join(","), today, "full", 14);
  for (const s of symbols) {
    const c = closeOn(closes.series[s], today);
    if (c) out.set(s, c.price);
  }
  return out;
}

export type PitchNote = { name: string; alumnus: boolean; score: number; note: string };
export type ClubWork = { pitches: Pitch[]; meetings: MeetingView[]; bounties: BountyView[]; reviews: Record<string, ReviewSummary>; notes: Record<string, PitchNote[]> };

/** The club's research library, bounties, reviews and meetings for one of its members; the demo's are fictional. */
export async function clubWork(email: string, id: string): Promise<ClubWork> {
  if (storageMode() === "demo") {
    const c = demoClubs().clubs.find((x) => x.club.id === id);
    return { pitches: c?.pitches ?? [], meetings: (c?.meetings ?? []).map((m) => ({ ...m.meeting, tallies: m.tallies, voters: m.voters })), bounties: c?.bounties ?? [], reviews: c?.reviews ?? {}, notes: c?.notes ?? {} };
  }
  const { clubPitches, clubMeetings, clubBounties, pitchReviews, pitchNotes } = await import("@/lib/registry");
  const [pitches, meetings, bounties, reviews, notes] = await Promise.all([clubPitches(id, email), clubMeetings(id, email), clubBounties(id, email).catch(() => []), pitchReviews(id, email).catch(() => ({})), pitchNotes(id).catch(() => ({}))]);
  return { pitches, meetings, bounties, reviews, notes };
}

/** How the library's picks did since each ticker's first pitch, against SPY (`picksScorecard`), from the one price feed. */
export type ClubPicks = { rows: PickRow[]; beat: number; judged: number; asOf: string | null; fund: ReturnType<typeof pickFund> | null; calibration: CalibrationRow[] };
export async function clubPicks(pitches: readonly Pitch[], today: string): Promise<ClubPicks> {
  if (!pitches.length) return { rows: [], beat: 0, judged: 0, asOf: null, fund: null, calibration: [] };
  const first = pitches.reduce((d, p) => (p.createdAt < d ? p.createdAt : d), today).slice(0, 10);
  const days = Math.min(1900, Math.max(30, Math.ceil((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 14));
  const symbols = [...new Set([...pitches.map((p) => p.symbol), "SPY"])].slice(0, 60);
  const closes = await loadCloses(symbols.join(","), today, "budget", days).catch(() => null);
  if (!closes) return { rows: [], beat: 0, judged: 0, asOf: null, fund: null, calibration: clubCalibration(pitches, new Map(), today) };
  const asOf = closeOn(closes.series.SPY, today)?.day ?? today;
  // The pick fund and the calibration board (Hamza, 9 Nov 2026, the twenty further ways): a dollar in each first pitch against SPY, and each author's valuations against the price now.
  const prices = new Map<string, number>();
  for (const sym of symbols) {
    const c = closeOn(closes.series[sym], today);
    if (c) prices.set(sym, c.price);
  }
  return { ...picksScorecard(pitches, closes.series, asOf), asOf, fund: pickFund(pitches, closes.series, asOf), calibration: clubCalibration(pitches, prices, today) };
}

/** The club's shared watchlist with each ticker's last close; the demo's is fictional. */
export async function clubWatchView(id: string, today: string): Promise<{ items: (ClubWatch & { close: number | null })[] }> {
  let items: ClubWatch[];
  if (storageMode() === "demo") items = demoClubs().clubs.find((x) => x.club.id === id)?.watch ?? [];
  else items = await (await import("@/lib/registry")).clubWatch(id).catch(() => []);
  if (!items.length) return { items: [] };
  const prices = storageMode() === "demo" ? new Map<string, number>() : await heldPrices(items.map((w) => w.symbol), today).catch(() => new Map<string, number>());
  return { items: items.map((w) => ({ ...w, close: prices.get(w.symbol) ?? null })) };
}

/** The club's alumni and its challenges; the demo's are fictional. */
export async function clubCircle(id: string): Promise<{ alumni: Alumnus[]; challenges: ChallengeView[] }> {
  if (storageMode() === "demo") {
    const c = demoClubs().clubs.find((x) => x.club.id === id);
    return { alumni: c?.alumni ?? [], challenges: c?.challenges ?? [] };
  }
  const { clubAlumni, clubChallenges } = await import("@/lib/registry");
  const [alumni, challenges] = await Promise.all([clubAlumni(id).catch(() => []), clubChallenges(id).catch(() => [])]);
  return { alumni, challenges };
}

/** A competition's reasoned trades judged against SPY since each was made (`judgedTrades`), every entry's together. */
export function judgedOf(entries: readonly Entry[], prices: ReadonlyMap<string, number>, spy: readonly { date: string; value: number }[] | undefined, asOf: string | null) {
  if (!asOf) return { judged: [], right: 0, share: null };
  return judgedTrades(entries.flatMap((e) => e.trades), prices, spy, asOf);
}

/** The league: every club that chose to show, ranked (`leagueTable`); the demo's are fictional. */
export async function clubLeague(today: string): Promise<{ available: boolean; rows: LeagueRow[]; season: ReturnType<typeof seasonTable> | null; error: string | null }> {
  if (storageMode() === "demo") {
    const s = demoClubs();
    return { available: true, rows: leagueTable(s.league), season: seasonTable(s.league, today), error: null };
  }
  const { registryAvailable, leagueRows } = await import("@/lib/registry");
  if (!registryAvailable()) return { available: false, rows: [], season: null, error: null };
  try {
    const all = await leagueRows();
    return { available: true, rows: leagueTable(all), season: seasonTable(all, today), error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return { available: true, rows: [], season: null, error: e.message };
  }
}

/** A person's own record across clubs, the ones they left included; the demo visitor's is fictional. */
export async function myClubRecords(email: string): Promise<ClubRecord[]> {
  if (storageMode() === "demo") return demoClubs().records;
  const { registryAvailable, clubRecordsOf } = await import("@/lib/registry");
  if (!registryAvailable()) return [];
  return clubRecordsOf(email).catch(() => []);
}

/**
 * The levels the person's clubs watch that a close reached, for their
 * Notifications and the twice-daily check (`clubWatchNotices`); null when
 * the registry cannot be read, so the alerts stay as they were. A ticker the
 * feed cannot price is left out, its alert kept as it was by the caller.
 */
export async function clubWatchAlerts(email: string | null, today: string): Promise<Notice[] | null> {
  if (!email || storageMode() === "demo") return [];
  try {
    const { registryAvailable, clubWatchesOf } = await import("@/lib/registry");
    if (!registryAvailable()) return null;
    const clubs = await clubWatchesOf(email);
    const symbols = [...new Set(clubs.flatMap((c) => c.items.filter((w) => w.below !== null || w.above !== null).map((w) => w.symbol)))];
    if (!symbols.length) return [];
    const prices = await heldPrices(symbols, today);
    return clubWatchNotices(clubs, prices, today);
  } catch (e) {
    console.error(`[clubs] watch alerts not read: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return null;
  }
}

/** The club's treasury as published by its treasurer (`treasuryFrom`), and whether the one asking holds it; the demo's is fictional. */
export async function clubTreasuryView(email: string, id: string): Promise<{ treasury: Treasury | null; mine: boolean; linked: boolean }> {
  if (storageMode() === "demo") {
    const t = demoClubs().clubs.find((x) => x.club.id === id)?.treasury ?? null;
    return { treasury: t, mine: false, linked: !!t };
  }
  const got = await (await import("@/lib/registry")).clubTreasury(id, email).catch(() => null);
  return got ?? { treasury: null, mine: false, linked: false };
}

/** The instructor's grades table: each course competition's board read as its page reads it, then `courseGrades`; at most six competitions, the newest first. */
export async function clubCourse(email: string, id: string, competitions: readonly Competition[], today: string): Promise<ReturnType<typeof courseGrades>> {
  const course = competitions.filter((c) => c.course).sort((a, b) => b.starts.localeCompare(a.starts)).slice(0, 6);
  const boards = await Promise.all(course.map((c) => competitionPage(email, id, c.id, today).catch(() => null)));
  return courseGrades(boards.flatMap((b) => (b ? [{ competition: b.competition, rows: b.board.rows }] : [])));
}
