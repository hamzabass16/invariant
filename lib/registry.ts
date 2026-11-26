import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { z } from "zod";

import { CLUB_ROLES, MAX_CLUB_WATCH, MAX_CLUBS_PER_PERSON, alumnusSchema, bountySchema, bountyWinner, challengeSchema, clubWatchSchema, reviewSummary, type Alumnus, type Bounty, type BountyView, type Challenge, type ChallengeView, type ClubWatch, type ReviewSummary, MAX_COMPETITIONS, MAX_MEETINGS, MAX_MEMBERS, MAX_PITCHES, VOTES, boardSummarySchema, clubRecordSchema, clubSchema, competitionSchema, meetingSchema, normalInvite, pitchSchema, resultSchema, tradeSchema, type BoardSummary, type Club, type ClubRecord, type ClubRole, type Competition, type Entry, type LeagueRow, type Meeting, type MeetingView, type Member, type Pitch, type Result, type Tally, type Trade, type Vote, treasurySchema, type Treasury } from "@/lib/clubs";
import { communityProfileSchema, type CommunityProfile } from "@/lib/community";
import { familyResultSchema, householdSchema, MAX_HOUSEHOLD, type FamilyResult, type Household, type MemberCard } from "@/lib/households";
import { listingSchema, packListingSchema, type Listing, type ListingView, type PackListing, type PackListingView } from "@/lib/marketplace";
import { MAX_OPEN_ASKS, mentorAskSchema, mentorOfferSchema, type MentorAsk, type MentorAskView, type MentorOffer } from "@/lib/mentors";
import { MAX_PUBLIC_CALLS, publicCallSchema, type PublicCall } from "@/lib/public-calls";
import { donationSchema, type Donation, type YearCounts } from "@/lib/open-data";
import { connectionProblem } from "@/lib/connection-string";
import { scheduleSchema, slotKey, type Schedule } from "@/lib/report";
import { logEvent, who } from "@/lib/log";
import { SyncError } from "@/lib/sync-error";
import { bucketConfigSchema, type BucketConfig } from "@/lib/user-bucket";

/**
 * The registry: the two things the deployment keeps about a person, because
 * nothing else can act on their behalf when they are away.
 *
 *   report_enrolments  who asked for a scheduled report, when, which sign-in
 *                      their vault is behind, and the refresh token that lets
 *                      the report read it at 09:00 on a Sunday.
 *   vault_choices      the bucket a person pasted as their vault
 *                      (lib/user-bucket.ts), since the server reads it with
 *                      that credential on every request; or, for someone who
 *                      signed in by email and password, the refresh token of
 *                      the Google Drive they linked on Welcome, since their
 *                      session carries no folder token of its own.
 *   community_profiles the profile a person chose to share with the other
 *                      people on this deployment (lib/community.ts; Hamza,
 *                      18 Oct 2026): a handle, a name, their theses in their
 *                      words and each holding's weight in percent; never an
 *                      amount, an account or a token. Kept while they share,
 *                      deleted when they stop.
 *   jobs               one row per person and scheduled run, its state and
 *                      the sentence it failed with (lib/jobs-run.ts), kept
 *                      30 days; never a figure or a token.
 *   clubs, club_members, club_competitions, club_entries
 *                      the clubs a person started or joined (lib/clubs.ts;
 *                      Hamza, 9 Nov 2026): a club's name, a line, the Drive
 *                      folder its material is in, its join code (hashed to
 *                      find it, sealed to show it to the owner and officers),
 *                      each member's sign-in, the name they chose and their
 *                      role, the club's competitions, and each member's
 *                      trades in a competition, in virtual money, never their
 *                      own. Leaving a club deletes the member's row and their
 *                      entries; deleting a club deletes all of it.
 *   company_figures    public company figures read from the SEC, one row per
 *                      company and kind (the screener's row, a company page's
 *                      read; Hamza, 23 Oct 2026: "Shared figures only"), so
 *                      each company is read once for everyone. Nothing in it
 *                      names a person or who asked; a failed read never
 *                      replaces a good one.
 *
 *   - One row per sign-in address, in the operator's Postgres (DATABASE_URL).
 *   - Tokens and credentials are encrypted at rest with REPORT_KEY
 *     (AES-256-GCM, a 32-byte key the operator generates), decrypted only
 *     to open the vault, and never read back to a screen, a log or a
 *     response.
 *   - Withdrawing deletes the row. Nothing else is kept about a person: no figures of their money, no
 *     setup, no methodology.
 *
 * With DATABASE_URL or REPORT_KEY unset the registry is "not available" and
 * the screens say so; the folder vaults and building a report in the app
 * still work.
 */

/** What a schedule opens the vault with: a sign-in's refresh token, or the chosen bucket. */
export type EnrolmentProvider = "google" | "microsoft" | "bucket";
export type EnrolmentAccess = { provider: "google" | "microsoft"; refreshToken: string } | { provider: "bucket" };

export type Enrolment = { email: string; provider: EnrolmentProvider; schedule: Schedule; lastSlot: string | null; lastOutcome: string | null; enrolledAt: string };
/** An enrolment as a scheduled run holds it: with the function that yields its refresh token, which stays out of any list. */
export type ScheduledEnrolment = Enrolment & { refreshToken: () => string | null };

export function registryAvailable(): boolean {
  return !connectionProblem(process.env.DATABASE_URL) && keyBytes() !== null;
}

/** Why the registry is unavailable, for the operator's health check; never a value. */
export function registryProblem(): string | null {
  const conn = connectionProblem(process.env.DATABASE_URL);
  if (conn) return conn;
  if (!keyBytes()) return "REPORT_KEY is not a 32-byte base64 value.";
  return null;
}

function keyBytes(name: "REPORT_KEY" | "REPORT_KEY_PREVIOUS" = "REPORT_KEY"): Buffer | null {
  const raw = process.env[name];
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

function seal(plain: string): string {
  const key = keyBytes();
  if (!key) throw new SyncError("Scheduled reports are not set up on this deployment.", "no REPORT_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${body.toString("base64")}`;
}

/**
 * Opens a sealed value with REPORT_KEY, else with REPORT_KEY_PREVIOUS, so the
 * key can be rotated without orphaning every enrolment (docs/ARCHITECTURE.md
 * §5.6): set the new key and the old one as previous; each value is sealed
 * under the new key when it is next written (a schedule kept again, a new
 * sign-in's token), and the previous key is dropped once none is left.
 */
function open(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  const unreadable = new SyncError("Your enrolment could not be read (the deployment's key may have changed). Stop the schedule and keep it again.", "sealed token unreadable");
  const keys = [keyBytes(), keyBytes("REPORT_KEY_PREVIOUS")].filter((k): k is Buffer => k !== null);
  if (!keys.length || v !== "v1" || !iv || !tag || !body) throw unreadable;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
    } catch {
      // The next key, if there is one.
    }
  }
  throw unreadable;
}

/** Seals and opens a short value under REPORT_KEY for another store (an invitation on /ops, lib/users.ts). */
export const sealText = (plain: string) => seal(plain);
export const openText = (sealed: string) => open(sealed);

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url)) throw new SyncError("Scheduled reports are not set up on this deployment.", "no DATABASE_URL");
  const q: Sql = neon(url);
  // The two tables, made on first use so the operator sets no migration up; a
  // table from before the vault choices gains its provider column the same way.
  ready ??= q`
    create table if not exists report_enrolments (
      email text primary key,
      schedule jsonb not null,
      refresh_sealed text,
      provider text not null default 'google',
      last_slot text,
      last_outcome text,
      enrolled_at timestamptz not null default now()
    )`
    .then(() => q`alter table report_enrolments add column if not exists provider text not null default 'google'`)
    .then(() => q`alter table report_enrolments alter column refresh_sealed drop not null`)
    .then(
      () => q`
        create table if not exists vault_choices (
          email text primary key,
          kind text not null,
          config_sealed text not null,
          chosen_at timestamptz not null default now()
        )`,
    )
    .then(
      () => q`
        create table if not exists community_profiles (
          email text primary key,
          handle text not null unique,
          profile jsonb not null,
          published_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )`,
    )
    .then(
      () => q`
        create table if not exists mail_claims (
          fingerprint text primary key,
          claimed_at timestamptz not null default now()
        )`,
    )
    // claimMail deletes the claims older than MAIL_CLAIM_DAYS on every send; an index keeps that a range read.
    .then(() => q`create index if not exists mail_claims_claimed on mail_claims (claimed_at)`)
    .then(
      () => q`
        create table if not exists company_figures (
          symbol text not null,
          kind text not null,
          entry jsonb not null,
          read_at timestamptz not null,
          primary key (symbol, kind)
        )`,
    )
    // Clubs (lib/clubs.ts; Hamza, 9 Nov 2026): a club, its members by sign-in, its competitions and each member's virtual entry.
    .then(
      () => q`
        create table if not exists clubs (
          id text primary key,
          name text not null,
          about text,
          folder_id text,
          invite_hash text not null unique,
          invite_sealed text not null,
          created_at timestamptz not null default now()
        )`,
    )
    .then(
      () => q`
        create table if not exists club_members (
          club_id text not null references clubs(id) on delete cascade,
          email text not null,
          name text not null,
          role text not null,
          joined_at timestamptz not null default now(),
          primary key (club_id, email)
        )`,
    )
    .then(() => q`create index if not exists club_members_email on club_members (email)`)
    .then(
      () => q`
        create table if not exists club_competitions (
          id text primary key,
          club_id text not null references clubs(id) on delete cascade,
          competition jsonb not null,
          created_at timestamptz not null default now()
        )`,
    )
    .then(
      () => q`
        create table if not exists club_entries (
          competition_id text not null references club_competitions(id) on delete cascade,
          email text not null,
          trades jsonb not null,
          updated_at timestamptz not null default now(),
          primary key (competition_id, email)
        )`,
    )
    // The club as a place to work (Hamza, 9 Nov 2026, the moat list): the league, each entry's result, the research library, meetings and votes, and records kept on a member's own sign-in.
    .then(() => q`alter table clubs add column if not exists league boolean not null default false`)
    .then(() => q`alter table club_competitions add column if not exists summary jsonb`)
    .then(() => q`alter table club_entries add column if not exists result jsonb`)
    .then(
      () => q`
        create table if not exists club_pitches (
          id text primary key,
          club_id text not null references clubs(id) on delete cascade,
          email text not null,
          symbol text not null,
          title text not null,
          body text not null,
          created_at timestamptz not null default now()
        )`,
    )
    .then(() => q`create index if not exists club_pitches_club on club_pitches (club_id, created_at desc)`)
    .then(
      () => q`
        create table if not exists club_meetings (
          id text primary key,
          club_id text not null references clubs(id) on delete cascade,
          meeting jsonb not null,
          created_at timestamptz not null default now()
        )`,
    )
    .then(
      () => q`
        create table if not exists club_votes (
          meeting_id text not null references club_meetings(id) on delete cascade,
          item_id text not null,
          email text not null,
          vote text not null,
          primary key (meeting_id, item_id, email)
        )`,
    )
    .then(
      () => q`
        create table if not exists club_records (
          email text not null,
          competition_id text not null,
          record jsonb not null,
          kept_at timestamptz not null default now(),
          primary key (email, competition_id)
        )`,
    )
    // A Community card shown only through a link (a mentor's), and the fingerprints of theses with the time each was first seen.
    .then(() => q`alter table community_profiles add column if not exists link_hash text unique`)
    .then(() => q`alter table community_profiles add column if not exists link_sealed text`)
    .then(
      () => q`
        create table if not exists thesis_receipts (
          hash text primary key,
          sealed_at timestamptz not null default now()
        )`,
    )
    // Twenty more ways (Hamza, 9 Nov 2026): challenges between clubs, thesis bounties, peer review, a club's watchlist, its alumni; the methodology marketplace, open data donations and households.
    .then(() => q`create table if not exists club_challenges (id text primary key, from_club text not null references clubs(id) on delete cascade, to_club text not null references clubs(id) on delete cascade, challenge jsonb not null, from_competition text, to_competition text, created_at timestamptz not null default now())`)
    .then(() => q`create table if not exists club_bounties (id text primary key, club_id text not null references clubs(id) on delete cascade, bounty jsonb not null, created_at timestamptz not null default now())`)
    .then(() => q`create table if not exists bounty_votes (bounty_id text not null references club_bounties(id) on delete cascade, email text not null, pitch_id text not null, primary key (bounty_id, email))`)
    .then(() => q`alter table club_pitches add column if not exists bounty_id text`)
    .then(() => q`create table if not exists pitch_reviews (pitch_id text not null references club_pitches(id) on delete cascade, email text not null, score int not null, primary key (pitch_id, email))`)
    .then(() => q`create table if not exists club_watch (club_id text not null references clubs(id) on delete cascade, symbol text not null, item jsonb not null, primary key (club_id, symbol))`)
    .then(() => q`create table if not exists club_alumni (club_id text not null references clubs(id) on delete cascade, email text not null, alumnus jsonb not null, primary key (club_id, email))`)
    .then(() => q`create table if not exists methodology_listings (id text primary key, email text not null unique, listing jsonb not null, adopters int not null default 0, listed_at timestamptz not null default now(), updated_at timestamptz not null default now())`)
    .then(() => q`create table if not exists listing_adopters (listing_id text not null references methodology_listings(id) on delete cascade, who text not null, primary key (listing_id, who))`)
    .then(() => q`create table if not exists research_donations (who text not null, week text not null, donation jsonb not null, primary key (who, week))`)
    .then(() => q`create table if not exists households (id text primary key, name text not null, invite_hash text not null unique, invite_sealed text not null, created_at timestamptz not null default now())`)
    .then(() => q`create table if not exists household_members (household_id text not null references households(id) on delete cascade, email text not null, name text not null, primary key (household_id, email))`)
    // Twenty further ways (Hamza, 9 Nov 2026): public sealed calls, mentor sessions, packs from verified analysts, a club's treasury, pitch valuations, reviewers' notes and family rules.
    .then(() => q`create table if not exists public_calls (id text primary key, email text not null, call jsonb not null, published_at timestamptz not null default now())`)
    .then(() => q`create table if not exists mentor_offers (email text primary key, handle text not null unique, offer jsonb not null, updated_at timestamptz not null default now())`)
    .then(() => q`create table if not exists mentor_asks (id text primary key, mentor_email text not null, member_email text not null, ask jsonb not null, asked_at timestamptz not null default now())`)
    .then(() => q`create table if not exists pack_listings (id text primary key, email text not null unique, listing jsonb not null, adopters int not null default 0, listed_at timestamptz not null default now(), updated_at timestamptz not null default now())`)
    .then(() => q`create table if not exists pack_adopters (listing_id text not null references pack_listings(id) on delete cascade, who text not null, primary key (listing_id, who))`)
    .then(() => q`create table if not exists club_treasury (club_id text primary key references clubs(id) on delete cascade, email text not null, treasury jsonb, updated_at timestamptz not null default now())`)
    .then(() => q`alter table club_pitches add column if not exists valuation jsonb`)
    .then(() => q`alter table pitch_reviews add column if not exists note text`)
    .then(() => q`alter table households add column if not exists pack text`)
    .then(() => q`alter table household_members add column if not exists result jsonb`)
    .then(() => undefined);
  return { q, ready };
}

type Row = { email: string; schedule: unknown; refresh_sealed: string | null; provider: string; last_slot: string | null; last_outcome: string | null; enrolled_at: string | Date };

const PROVIDERS: EnrolmentProvider[] = ["google", "microsoft", "bucket"];

function toEnrolment(r: Row): Enrolment {
  const schedule = scheduleSchema.safeParse(r.schedule);
  if (!schedule.success) throw new SyncError("A stored schedule has an unexpected shape.", "enrolment schedule failed schema");
  if (!PROVIDERS.includes(r.provider as EnrolmentProvider)) throw new SyncError("A stored schedule names a vault this version does not know.", "enrolment provider unknown");
  return { email: r.email, provider: r.provider as EnrolmentProvider, schedule: schedule.data, lastSlot: r.last_slot, lastOutcome: r.last_outcome, enrolledAt: new Date(r.enrolled_at).toISOString() };
}

async function run<T>(fn: (q: Sql) => Promise<T>): Promise<T> {
  const { q, ready: table } = sql();
  try {
    await table;
    return await fn(q);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    ready = null;
    throw new SyncError("The registry could not be reached. Try again in a moment.", "registry query failed");
  }
}

/**
 * Enrols or re-schedules one person. The token is sealed before it is stored.
 * The last occurrence is marked as done, so the first report comes at the
 * next scheduled hour, not at the next cron pass.
 */
export async function enrol(email: string, schedule: Schedule, access: EnrolmentAccess, now: Date = new Date()): Promise<void> {
  const sealed = access.provider === "bucket" ? null : seal(access.refreshToken);
  const json = JSON.stringify(schedule);
  const slot = slotKey(schedule, now);
  await run((q) => q`
    insert into report_enrolments (email, schedule, refresh_sealed, provider, last_slot, last_outcome)
    values (${email}, ${json}::jsonb, ${sealed}, ${access.provider}, ${slot}, null)
    on conflict (email) do update set
      schedule = excluded.schedule,
      refresh_sealed = excluded.refresh_sealed,
      provider = excluded.provider,
      last_outcome = null,
      last_slot = excluded.last_slot`);
}

/**
 * Puts the token of a fresh sign-in in place of the one kept, the schedule
 * left as it is (Hamza, 22 Oct 2026): a token Google ended (a consent screen
 * still in Testing ends it after seven days) would otherwise stop every
 * scheduled run until the schedule was kept again on Reviews. False when
 * there is no enrolment, the vault is a bucket, or the token is the one kept.
 */
export async function renewAccess(email: string, access: EnrolmentAccess): Promise<boolean> {
  if (access.provider === "bucket") return false;
  const rows = (await run((q) => q`select refresh_sealed, provider from report_enrolments where email = ${email}`)) as Pick<Row, "refresh_sealed" | "provider">[];
  const row = rows[0];
  if (!row || row.provider === "bucket") return false;
  let kept: string | null = null;
  try {
    kept = row.refresh_sealed ? open(row.refresh_sealed) : null;
  } catch {
    kept = null;
  }
  if (row.provider === access.provider && kept === access.refreshToken) return false;
  const sealed = seal(access.refreshToken);
  await run((q) => q`update report_enrolments set refresh_sealed = ${sealed}, provider = ${access.provider}, last_outcome = null where email = ${email}`);
  return true;
}

/**
 * Keeps an enrolment's schedule on the zone the person's browser reports
 * (Hamza, 28 Oct 2026: never a city written in), so a review chosen for
 * Sundays at 09:00 goes at 09:00 where they are, and their scheduled alerts
 * and emails count their own days. True when the zone changed.
 */
export async function keepZone(email: string, zone: string): Promise<boolean> {
  const rows = (await run((q) => q`update report_enrolments set schedule = jsonb_set(schedule, '{zone}', to_jsonb(${zone}::text)) where email = ${email} and schedule->>'zone' is distinct from ${zone} returning email`)) as { email: string }[];
  return rows.length > 0;
}

export async function withdraw(email: string): Promise<void> {
  await run((q) => q`delete from report_enrolments where email = ${email}`);
  // The person's scheduled jobs go with the enrolment (lib/jobs-run.ts).
  const { forgetJobs } = await import("@/lib/jobs-run");
  await forgetJobs(email).catch(() => undefined);
}

/** One person's enrolment, without the token. */
export async function enrolment(email: string): Promise<Enrolment | null> {
  const rows = (await run((q) => q`select email, schedule, refresh_sealed, provider, last_slot, last_outcome, enrolled_at from report_enrolments where email = ${email}`)) as Row[];
  return rows[0] ? toEnrolment(rows[0]) : null;
}

/**
 * Every enrolment, each with the function that yields its refresh token; the
 * token itself stays out of any list. A row whose schedule cannot be read is
 * counted, given a sentence as its outcome, and left out, so it never stops
 * the others.
 */
export async function enrolments(): Promise<{ rows: ScheduledEnrolment[]; unreadable: number }> {
  const raw = (await run((q) => q`select email, schedule, refresh_sealed, provider, last_slot, last_outcome, enrolled_at from report_enrolments`)) as Row[];
  const rows: ScheduledEnrolment[] = [];
  let unreadable = 0;
  for (const r of raw) {
    try {
      rows.push({ ...toEnrolment(r), refreshToken: () => (r.refresh_sealed ? open(r.refresh_sealed) : null) });
    } catch {
      unreadable += 1;
      await recordOutcome(r.email, "failed: the stored schedule could not be read. Stop the schedule and keep it again.").catch(() => undefined);
    }
  }
  return { rows, unreadable };
}

/** One enrolment as a scheduled run holds it, for the job that runs it (lib/jobs-run.ts); null when the person withdrew since the job was queued. */
export async function scheduledEnrolment(email: string): Promise<ScheduledEnrolment | null> {
  const raw = (await run((q) => q`select email, schedule, refresh_sealed, provider, last_slot, last_outcome, enrolled_at from report_enrolments where email = ${email}`)) as Row[];
  const r = raw[0];
  return r ? { ...toEnrolment(r), refreshToken: () => (r.refresh_sealed ? open(r.refresh_sealed) : null) } : null;
}

/** Claims the slot before the send, so a second run in the same hour sends nothing; `stale` (the outcome read) takes back a claim a killed run left, once, from exactly that outcome. */
export async function claimSlot(email: string, slot: string, now: Date = new Date(), stale: string | null = null, running: string = `running ${now.toISOString()}`): Promise<boolean> {
  const rows = (await run((q) => q`update report_enrolments set last_slot = ${slot}, last_outcome = ${running} where email = ${email} and (last_slot is distinct from ${slot} or (${stale}::text is not null and last_outcome = ${stale})) returning email`)) as { email: string }[];
  return rows.length > 0;
}

/** Days a sent mail's fingerprint is kept: longer than any alert stays new. */
export const MAIL_CLAIM_DAYS = 14;

/**
 * Claims each mail before it is sent, once across every instance (Hamza,
 * 23 Oct 2026: the same alert email arrived two and three times within
 * seconds, from checks running side by side). Each id is kept only as a
 * keyed fingerprint (HMAC under REPORT_KEY of the address and the id), never
 * the id or what it names; the ids returned are the ones this caller won.
 * With no registry, every id is the caller's, as before.
 */
export async function claimMail(email: string, ids: readonly string[]): Promise<string[]> {
  const key = keyBytes();
  if (!ids.length || !key || !registryAvailable()) return [...ids];
  const print = (id: string) => createHmac("sha256", key).update(`${email.toLowerCase()}\n${id}`).digest("base64url");
  const prints = ids.map(print);
  const rows = (await run(async (q) => {
    await q`delete from mail_claims where claimed_at < now() - make_interval(days => ${MAIL_CLAIM_DAYS})`;
    return q`insert into mail_claims (fingerprint) select unnest(${prints}::text[]) on conflict (fingerprint) do nothing returning fingerprint`;
  })) as { fingerprint: string }[];
  const won = new Set(rows.map((r) => r.fingerprint));
  return ids.filter((_, i) => won.has(prints[i]));
}

/** Gives claimed mails back after a send failed, so the next check sends them. */
export async function releaseMail(email: string, ids: readonly string[]): Promise<void> {
  const key = keyBytes();
  if (!ids.length || !key || !registryAvailable()) return;
  const prints = ids.map((id) => createHmac("sha256", key).update(`${email.toLowerCase()}\n${id}`).digest("base64url"));
  await run((q) => q`delete from mail_claims where fingerprint = any(${prints}::text[])`);
}

/** Marks the slot a review sent by hand stands in for, only while the slot and its outcome are still as read, so a run that claimed it meanwhile is left alone. */
export async function markHandSent(email: string, slot: string, outcome: string, lastSlot: string | null, lastOutcome: string | null): Promise<boolean> {
  const rows = (await run((q) => q`update report_enrolments set last_slot = ${slot}, last_outcome = ${outcome.slice(0, 200)} where email = ${email} and last_slot is not distinct from ${lastSlot} and last_outcome is not distinct from ${lastOutcome} returning email`)) as { email: string }[];
  return rows.length > 0;
}

/** Gives a claimed slot back after a failure, so the next pass that day tries again, and records why. */
export async function releaseSlot(email: string, previous: string | null, outcome: string): Promise<void> {
  await run((q) => q`update report_enrolments set last_slot = ${previous}, last_outcome = ${outcome.slice(0, 200)} where email = ${email}`);
}

export async function recordOutcome(email: string, outcome: string): Promise<void> {
  await run((q) => q`update report_enrolments set last_outcome = ${outcome.slice(0, 200)} where email = ${email}`);
}

// ---------------------------------------------------------------------------
// Vault choices

/** What a person chose as their vault: a pasted bucket, or the Google Drive they linked after an email sign-in. */
export type VaultChoice = { kind: "bucket"; config: BucketConfig } | { kind: "google_drive"; refresh: string };

const driveLinkSchema = z.object({ refresh: z.string().min(1) });

/** The vault the person chose, or null for the folder behind their sign-in. The credential is opened here and goes to the adapter only. */
export async function vaultChoice(email: string): Promise<VaultChoice | null> {
  const rows = (await run((q) => q`select kind, config_sealed from vault_choices where email = ${email}`)) as { kind: string; config_sealed: string }[];
  const row = rows[0];
  if (!row) return null;
  if (row.kind !== "bucket" && row.kind !== "google_drive") throw new SyncError("Your vault choice names a kind this version does not know.", "vault choice kind unknown");
  const where = row.kind === "bucket" ? "Paste the bucket again on Setup." : "Connect your Google Drive again on Welcome.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(open(row.config_sealed));
  } catch (e) {
    if (e instanceof SyncError) throw new SyncError(`Your vault choice could not be read (the deployment's key may have changed). ${where}`, "sealed vault choice unreadable");
    throw new SyncError(`Your vault choice could not be read. ${where}`, "vault choice not JSON");
  }
  if (row.kind === "google_drive") {
    const ok = driveLinkSchema.safeParse(parsed);
    if (!ok.success) throw new SyncError(`Your Drive link has an unexpected shape. ${where}`, "drive link failed schema");
    return { kind: "google_drive", refresh: ok.data.refresh };
  }
  const ok = bucketConfigSchema.safeParse(parsed);
  if (!ok.success) throw new SyncError(`Your bucket choice has an unexpected shape. ${where}`, "bucket config failed schema");
  return { kind: "bucket", config: ok.data };
}

/** The kind of vault a person chose, without opening its sealed config; null when they chose none. */
export async function vaultChoiceKind(email: string): Promise<"bucket" | "google_drive" | null> {
  const rows = (await run((q) => q`select kind from vault_choices where email = ${email}`)) as { kind: string }[];
  const kind = rows[0]?.kind;
  if (!kind) return null;
  if (kind !== "bucket" && kind !== "google_drive") throw new SyncError("Your vault choice names a kind this version does not know.", "vault choice kind unknown");
  return kind;
}

/** The data cache's tag for a person's vault kind (lib/vault.ts), by the log's fingerprint, never the address. */
export const vaultKindTag = (email: string) => `vault-kind:${who(email)}`;

/** Clears the kept vault kind once a choice changes, so the next page asks the registry again. */
async function forgetVaultKind(email: string): Promise<void> {
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag(vaultKindTag(email), { expire: 0 });
  } catch {
    // Outside a request (a script or a check) there is no cache to clear.
    logEvent("warn", "vault.kind_not_cleared", { who: who(email) });
  }
}

/** Keeps the refresh token of the Google Drive a person linked on Welcome, sealed, as their vault. The caller has checked the drive.file scope was granted. */
export async function chooseDrive(email: string, refresh: string): Promise<void> {
  const sealed = seal(JSON.stringify(driveLinkSchema.parse({ refresh })));
  await run((q) => q`
    insert into vault_choices (email, kind, config_sealed)
    values (${email}, 'google_drive', ${sealed})
    on conflict (email) do update set kind = excluded.kind, config_sealed = excluded.config_sealed, chosen_at = now()`);
  await forgetVaultKind(email);
}

/** Keeps a pasted bucket as the person's vault, sealed. The caller has already probed it (lib/user-bucket.ts). */
export async function chooseBucket(email: string, config: BucketConfig): Promise<void> {
  const sealed = seal(JSON.stringify(bucketConfigSchema.parse(config)));
  await run((q) => q`
    insert into vault_choices (email, kind, config_sealed)
    values (${email}, 'bucket', ${sealed})
    on conflict (email) do update set kind = excluded.kind, config_sealed = excluded.config_sealed, chosen_at = now()`);
  await forgetVaultKind(email);
}

/** Back to the folder behind the sign-in. The files stay in the bucket; nothing is moved or deleted. */
export async function dropBucket(email: string): Promise<void> {
  await run((q) => q`delete from vault_choices where email = ${email}`);
  await forgetVaultKind(email);
}

// ---------------------------------------------------------------------------
// Community profiles (Hamza, 18 Oct 2026)

type ProfileRow = { email?: string; handle: string; profile: unknown; published_at: string | Date; updated_at: string | Date };

function toProfile(r: ProfileRow): CommunityProfile {
  const parsed = communityProfileSchema.safeParse(r.profile);
  if (!parsed.success) throw new SyncError("A shared profile has an unexpected shape.", "community profile failed schema");
  return parsed.data;
}

/** Shares, or replaces, one person's profile; the handle is theirs while they share. A handle another person holds is refused with a sentence. */
export async function shareProfile(email: string, profile: CommunityProfile): Promise<void> {
  const valid = communityProfileSchema.parse(profile);
  const taken = (await run((q) => q`select email from community_profiles where handle = ${valid.handle} and email <> ${email}`)) as { email: string }[];
  if (taken.length) throw new SyncError("That handle is taken; choose another.", "community handle taken");
  await run(
    (q) => q`
    insert into community_profiles (email, handle, profile, published_at, updated_at)
    values (${email}, ${valid.handle}, ${JSON.stringify(valid)}::jsonb, now(), now())
    on conflict (email) do update set
      handle = excluded.handle,
      profile = excluded.profile,
      updated_at = now()`,
  );
}

/** Stops sharing: the row is deleted, and the handle is free. */
export async function stopSharing(email: string): Promise<void> {
  await run((q) => q`delete from community_profiles where email = ${email}`);
}

/** The profile one person shares, or null. */
export async function myProfile(email: string): Promise<CommunityProfile | null> {
  const rows = (await run((q) => q`select handle, profile, published_at, updated_at from community_profiles where email = ${email}`)) as ProfileRow[];
  return rows[0] ? toProfile(rows[0]) : null;
}

/** A shared profile by handle, or null; the address behind it is never read. */
export async function communityProfile(handle: string): Promise<CommunityProfile | null> {
  const rows = (await run((q) => q`select handle, profile, published_at, updated_at from community_profiles where handle = ${handle} and coalesce((profile->'sharing'->>'listed')::boolean, true)`)) as ProfileRow[];
  return rows[0] ? toProfile(rows[0]) : null;
}

/** The shared profiles of some handles (the cards a person follows), in no order; one that cannot be read is left out. */
export async function communityProfilesOf(handles: readonly string[]): Promise<CommunityProfile[]> {
  const wanted = [...new Set(handles)].filter((h) => /^[a-z0-9][a-z0-9-]{1,23}$/.test(h));
  if (!wanted.length) return [];
  const rows = (await run((q) => q`select handle, profile, published_at, updated_at from community_profiles where handle = any(${wanted}::text[]) and coalesce((profile->'sharing'->>'listed')::boolean, true)`)) as ProfileRow[];
  const out: CommunityProfile[] = [];
  for (const r of rows) {
    try {
      out.push(toProfile(r));
    } catch {
      // Left out; the list shows what can be read.
    }
  }
  return out;
}

/** Every shared profile, newest first; one that cannot be read is counted and left out, never shown half. */
export async function communityProfiles(): Promise<{ profiles: CommunityProfile[]; unreadable: number }> {
  const rows = (await run((q) => q`select handle, profile, published_at, updated_at from community_profiles where coalesce((profile->'sharing'->>'listed')::boolean, true) order by updated_at desc limit 200`)) as ProfileRow[];
  const profiles: CommunityProfile[] = [];
  let unreadable = 0;
  for (const r of rows) {
    try {
      profiles.push(toProfile(r));
    } catch {
      unreadable += 1;
    }
  }
  return { profiles, unreadable };
}

/** What a shared row is: the screener's row (lib/screener.ts), a company page's read (lib/filings.ts), what a top fund says it does, by the fund's id (lib/fund-creeds.ts), an ETF's monthly flows by its ticker, or a trust's N-PORT filings by series, by its CIK (lib/etf-flows.ts). */
export type SharedKind = "screen" | "page" | "fund" | "etf_flow" | "nport_index" | "flow" | "eco";

export type SharedFigures = { symbol: string; entry: unknown; readAt: string };

/**
 * The shared company rows of one kind, every company or those named, as kept;
 * the caller parses each with its own schema and leaves out one that fails.
 */
export async function sharedFigures(kind: SharedKind, symbols?: readonly string[]): Promise<SharedFigures[]> {
  const rows = (await run((q) => (symbols ? q`select symbol, entry, read_at from company_figures where kind = ${kind} and symbol = any(${[...symbols]}::text[])` : q`select symbol, entry, read_at from company_figures where kind = ${kind}`))) as { symbol: string; entry: unknown; read_at: string | Date }[];
  return rows.map((r) => ({ symbol: r.symbol, entry: r.entry, readAt: new Date(r.read_at).toISOString() }));
}

/**
 * Keeps company rows for everyone: a newer read replaces the row, except that
 * a read that failed (an entry whose `error` is set) never replaces a good one.
 * Public figures alone; the caller passes nothing of a person.
 */
export async function keepSharedFigures(kind: SharedKind, rows: readonly SharedFigures[]): Promise<void> {
  if (!rows.length) return;
  const body = JSON.stringify(rows.map((r) => ({ symbol: r.symbol, entry: r.entry, read_at: r.readAt })));
  await run(
    (q) => q`
      insert into company_figures (symbol, kind, entry, read_at)
      select x.symbol, ${kind}, x.entry, x.read_at from jsonb_to_recordset(${body}::jsonb) as x(symbol text, entry jsonb, read_at timestamptz)
      on conflict (symbol, kind) do update set entry = excluded.entry, read_at = excluded.read_at
      where excluded.read_at >= company_figures.read_at and ((excluded.entry->>'error') is null or (company_figures.entry->>'error') is not null)`,
  );
}


// ---------------------------------------------------------------------------
// Clubs (lib/clubs.ts; Hamza, 9 Nov 2026). A member's address is read back
// only to the club's owner and officers, so they can share the club's Drive
// folder; everyone else sees the name a member chose.

const inviteHash = (code: string) => createHash("sha256").update(`club-invite\n${normalInvite(code)}`).digest("hex");

type ClubRow = { id: string; name: string; about: string | null; folder_id: string | null; created_at: string | Date };
const toClub = (r: ClubRow): Club => clubSchema.parse({ id: r.id, name: r.name, about: r.about, folderId: r.folder_id, createdAt: new Date(r.created_at).toISOString() });
const asRole = (r: string): ClubRole => ((CLUB_ROLES as readonly string[]).includes(r) ? (r as ClubRole) : "member");

/** The clubs one person is in, with their role in each. */
export async function clubsOf(email: string): Promise<{ club: Club; role: ClubRole; members: number }[]> {
  const rows = (await run(
    (q) => q`
    select c.id, c.name, c.about, c.folder_id, c.created_at, m.role,
      (select count(*)::int from club_members x where x.club_id = c.id) as members
    from club_members m join clubs c on c.id = m.club_id
    where m.email = ${email} order by c.name`,
  )) as (ClubRow & { role: string; members: number })[];
  return rows.map((r) => ({ club: toClub(r), role: asRole(r.role), members: r.members }));
}

/** One club as a member sees it, with their role; null when there is no such club or they are not in it. */
export async function clubFor(email: string, id: string): Promise<{ club: Club; role: ClubRole } | null> {
  const rows = (await run((q) => q`select c.id, c.name, c.about, c.folder_id, c.created_at, m.role from clubs c join club_members m on m.club_id = c.id where c.id = ${id} and m.email = ${email}`)) as (ClubRow & { role: string })[];
  return rows[0] ? { club: toClub(rows[0]), role: asRole(rows[0].role) } : null;
}

/** Starts a club with its first member, its owner. The id is the name's, numbered when taken. */
export async function createClub(email: string, ownerName: string, club: Club, inviteCode: string): Promise<string> {
  const mine = (await run((q) => q`select count(*)::int as n from club_members where email = ${email}`)) as { n: number }[];
  if ((mine[0]?.n ?? 0) >= MAX_CLUBS_PER_PERSON) throw new SyncError(`You are in ${MAX_CLUBS_PER_PERSON} clubs, the most one person can be in.`, "clubs per person");
  const valid = clubSchema.parse(club);
  for (let n = 1; n <= 20; n++) {
    const id = n === 1 ? valid.id : `${valid.id.slice(0, 36)}-${n}`;
    const made = (await run(
      (q) => q`
      insert into clubs (id, name, about, folder_id, invite_hash, invite_sealed)
      values (${id}, ${valid.name}, ${valid.about}, ${valid.folderId}, ${inviteHash(inviteCode)}, ${seal(normalInvite(inviteCode))})
      on conflict (id) do nothing returning id`,
    )) as { id: string }[];
    if (made.length) {
      await run((q) => q`insert into club_members (club_id, email, name, role) values (${id}, ${email}, ${ownerName}, 'owner')`);
      return id;
    }
  }
  throw new SyncError("A club with that name already exists; choose another name.", "club id taken");
}

/** Joins the club a code opens, under the name the person chose; a member already in it keeps their role and takes the new name. */
export async function joinClub(email: string, name: string, code: string): Promise<string> {
  const rows = (await run((q) => q`select id from clubs where invite_hash = ${inviteHash(code)}`)) as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new SyncError("No club has that code. Check it with whoever gave it to you.", "club code unknown");
  const counts = (await run((q) => q`select (select count(*)::int from club_members where club_id = ${id}) as members, (select count(*)::int from club_members where email = ${email}) as mine`)) as { members: number; mine: number }[];
  if ((counts[0]?.members ?? 0) >= MAX_MEMBERS) throw new SyncError(`The club has ${MAX_MEMBERS} members, the most it can have.`, "club full");
  if ((counts[0]?.mine ?? 0) >= MAX_CLUBS_PER_PERSON) throw new SyncError(`You are in ${MAX_CLUBS_PER_PERSON} clubs, the most one person can be in.`, "clubs per person");
  const sameName = (await run((q) => q`select 1 from club_members where club_id = ${id} and lower(name) = lower(${name}) and email <> ${email}`)) as unknown[];
  if (sameName.length) throw new SyncError("Someone in the club already goes by that name; choose another.", "club name taken");
  await run((q) => q`insert into club_members (club_id, email, name, role) values (${id}, ${email}, ${name}, 'member') on conflict (club_id, email) do update set name = excluded.name`);
  return id;
}

/** The members, owners first; each address only when the one asking runs the club. */
export async function clubMembers(id: string, asking: string, showAddresses: boolean): Promise<Member[]> {
  const rows = (await run((q) => q`select email, name, role, joined_at from club_members where club_id = ${id} order by case role when 'owner' then 0 when 'adviser' then 1 when 'officer' then 2 else 3 end, joined_at`)) as { email: string; name: string; role: string; joined_at: string | Date }[];
  return rows.map((r) => ({ name: r.name, role: asRole(r.role), joinedAt: new Date(r.joined_at).toISOString(), email: showAddresses ? r.email : null, you: r.email === asking }));
}

/** The join code, for the owner and officers to hand out. */
export async function clubInvite(id: string): Promise<string | null> {
  const rows = (await run((q) => q`select invite_sealed from clubs where id = ${id}`)) as { invite_sealed: string }[];
  return rows[0] ? open(rows[0].invite_sealed) : null;
}

/** A new join code; the old one stops working. */
export async function renewInvite(id: string, code: string): Promise<void> {
  await run((q) => q`update clubs set invite_hash = ${inviteHash(code)}, invite_sealed = ${seal(normalInvite(code))} where id = ${id}`);
}

/** The club's name, line and folder. */
export async function updateClub(id: string, patch: { name: string; about: string | null; folderId: string | null }): Promise<void> {
  const v = clubSchema.pick({ name: true, about: true, folderId: true }).parse(patch);
  await run((q) => q`update clubs set name = ${v.name}, about = ${v.about}, folder_id = ${v.folderId} where id = ${id}`);
}

/** A member's role, set by the owner; the owner's own role never changes here. */
export async function setMemberRole(id: string, memberEmail: string, role: "officer" | "adviser" | "member" | "alumnus"): Promise<void> {
  const rows = (await run((q) => q`update club_members set role = ${role} where club_id = ${id} and email = ${memberEmail} and role <> 'owner' returning email`)) as { email: string }[];
  if (!rows.length) throw new SyncError("That member could not be found.", "club member unknown");
}

/** Removes a member (never the owner) and their entries. */
export async function removeMember(id: string, memberEmail: string): Promise<void> {
  const rows = (await run((q) => q`delete from club_members where club_id = ${id} and email = ${memberEmail} and role <> 'owner' returning email`)) as { email: string }[];
  if (!rows.length) throw new SyncError("That member could not be found.", "club member unknown");
  await keepRecords(id, rows[0].email);
  await run((q) => q`delete from club_entries where email = ${rows[0].email} and competition_id in (select id from club_competitions where club_id = ${id})`);
}

/** Leaves a club: the member's row and their entries go. An owner deletes the club instead. */
export async function leaveClub(id: string, email: string, listMe = false): Promise<void> {
  await keepRecords(id, email);
  if (listMe) {
    const m = (await run((q) => q`select name, role, joined_at from club_members where club_id = ${id} and email = ${email}`)) as { name: string; role: string; joined_at: string | Date }[];
    if (m[0]) {
      const a = alumnusSchema.parse({ name: m[0].name, role: asRole(m[0].role), joined: new Date(m[0].joined_at).getUTCFullYear(), left: new Date().getUTCFullYear() });
      await run((q) => q`insert into club_alumni (club_id, email, alumnus) values (${id}, ${email}, ${JSON.stringify(a)}::jsonb) on conflict (club_id, email) do update set alumnus = excluded.alumnus`);
    }
  }
  await run((q) => q`delete from bounty_votes where email = ${email} and bounty_id in (select id from club_bounties where club_id = ${id})`);
  await run((q) => q`delete from club_entries where email = ${email} and competition_id in (select id from club_competitions where club_id = ${id})`);
  await run((q) => q`delete from club_members where club_id = ${id} and email = ${email} and role <> 'owner'`);
}

/** Deletes a club and everything kept for it. */
export async function deleteClub(id: string): Promise<void> {
  await keepRecords(id, null);
  await run((q) => q`delete from clubs where id = ${id}`);
}

/**
 * Keeps each result a member has in the club's competitions on their own
 * sign-in (`club_records`), before their entries go: the club's and the
 * competition's names, the days, and the result in percent and counts,
 * never an amount or a trade. One member, or all of them when the club goes.
 */
async function keepRecords(id: string, email: string | null): Promise<void> {
  await run((q) =>
    email
      ? q`
    insert into club_records (email, competition_id, record)
    select e.email, e.competition_id, jsonb_build_object('club', cl.name, 'competition', c.competition->>'name', 'competitionId', e.competition_id, 'starts', c.competition->>'starts', 'ends', c.competition->>'ends', 'result', e.result, 'current', false)
    from club_entries e join club_competitions c on c.id = e.competition_id join clubs cl on cl.id = c.club_id
    where c.club_id = ${id} and e.email = ${email} and e.result is not null
    on conflict (email, competition_id) do update set record = excluded.record, kept_at = now()`
      : q`
    insert into club_records (email, competition_id, record)
    select e.email, e.competition_id, jsonb_build_object('club', cl.name, 'competition', c.competition->>'name', 'competitionId', e.competition_id, 'starts', c.competition->>'starts', 'ends', c.competition->>'ends', 'result', e.result, 'current', false)
    from club_entries e join club_competitions c on c.id = e.competition_id join clubs cl on cl.id = c.club_id
    where c.club_id = ${id} and e.result is not null
    on conflict (email, competition_id) do update set record = excluded.record, kept_at = now()`,
  );
}

/** A person's record across clubs: their results in the competitions they are in now, then the ones kept after they left or a club went. */
export async function clubRecordsOf(email: string): Promise<ClubRecord[]> {
  const current = (await run(
    (q) => q`
    select cl.name as club, c.competition, e.result from club_entries e
    join club_competitions c on c.id = e.competition_id join clubs cl on cl.id = c.club_id
    where e.email = ${email} and e.result is not null`,
  )) as { club: string; competition: unknown; result: unknown }[];
  const kept = (await run((q) => q`select record from club_records where email = ${email} order by kept_at desc limit 200`)) as { record: unknown }[];
  const out: ClubRecord[] = [];
  const seen = new Set<string>();
  for (const r of current) {
    const c = competitionSchema.safeParse(r.competition);
    const result = resultSchema.safeParse(r.result);
    if (!c.success || !result.success) continue;
    seen.add(c.data.id);
    out.push({ club: r.club, competition: c.data.name, competitionId: c.data.id, starts: c.data.starts, ends: c.data.ends, result: result.data, current: true });
  }
  for (const r of kept) {
    const p = clubRecordSchema.safeParse(r.record);
    if (p.success && !seen.has(p.data.competitionId)) out.push(p.data);
  }
  return out.sort((a, b) => b.ends.localeCompare(a.ends));
}

/** Deletes the records kept on a person's sign-in after they left clubs; their current entries stay with the clubs. */
export async function forgetClubRecords(email: string): Promise<void> {
  await run((q) => q`delete from club_records where email = ${email}`);
}

/** Deletes everything a club keeps under a person's sign-in that leaving does not (their pitches, their votes, their kept records), for Delete my account. */
export async function forgetClubPerson(email: string): Promise<void> {
  await run((q) => q`delete from club_votes where email = ${email}`);
  await run((q) => q`delete from club_pitches where email = ${email}`);
  await run((q) => q`delete from club_records where email = ${email}`);
  await run((q) => q`delete from bounty_votes where email = ${email}`);
  await run((q) => q`delete from pitch_reviews where email = ${email}`);
  await run((q) => q`delete from club_alumni where email = ${email}`);
}

/** Keeps a competition's board as the league reads it and each entry's result, matched by the member's name in the club. */
export async function keepBoard(competitionId: string, summary: BoardSummary, results: readonly { name: string; result: Result }[]): Promise<void> {
  const s = boardSummarySchema.parse(summary);
  const rows = results.map((r) => ({ name: r.name, result: resultSchema.parse(r.result) }));
  await run((q) => q`update club_competitions set summary = ${JSON.stringify(s)}::jsonb where id = ${competitionId}`);
  if (!rows.length) return;
  await run(
    (q) => q`
    update club_entries e set result = r.result
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(name text, result jsonb), club_competitions c, club_members m
    where e.competition_id = ${competitionId} and c.id = e.competition_id and m.club_id = c.club_id and m.email = e.email and m.name = r.name`,
  );
}

/** Shows the club on the league, or takes it off. */
export async function setLeague(id: string, on: boolean): Promise<void> {
  await run((q) => q`update clubs set league = ${on} where id = ${id}`);
}

/** Whether the club shows on the league. */
export async function clubOnLeague(id: string): Promise<boolean> {
  const rows = (await run((q) => q`select league from clubs where id = ${id}`)) as { league: boolean }[];
  return !!rows[0]?.league;
}

/** The league's rows: every club that chose to show, each competition with a board kept; the table is `leagueTable`'s. */
export async function leagueRows(): Promise<LeagueRow[]> {
  const rows = (await run(
    (q) => q`
    select cl.id, cl.name, cl.about, c.competition, c.summary from clubs cl
    join club_competitions c on c.club_id = cl.id
    where cl.league and c.summary is not null
    order by c.created_at desc limit 1000`,
  )) as { id: string; name: string; about: string | null; competition: unknown; summary: unknown }[];
  const out: LeagueRow[] = [];
  for (const r of rows) {
    const c = competitionSchema.safeParse(r.competition);
    const summary = boardSummarySchema.safeParse(r.summary);
    if (c.success && summary.success) out.push({ clubId: r.id, club: r.name, about: r.about, competition: c.data.name, starts: c.data.starts, ends: c.data.ends, summary: summary.data });
  }
  return out;
}

/** The club's library, newest first, under each author's name in the club; a pitch by someone who left keeps "A former member". */
export async function clubPitches(id: string, asking: string): Promise<Pitch[]> {
  const rows = (await run(
    (q) => q`
    select p.id, p.symbol, p.title, p.body, p.email, p.created_at, p.bounty_id, p.valuation, m.name from club_pitches p
    left join club_members m on m.club_id = p.club_id and m.email = p.email
    where p.club_id = ${id} order by p.created_at desc limit ${MAX_PITCHES}`,
  )) as { id: string; symbol: string; title: string; body: string; email: string; created_at: string | Date; bounty_id: string | null; valuation: unknown; name: string | null }[];
  return rows.flatMap((r) => {
    const p = pitchSchema.safeParse({ id: r.id, symbol: r.symbol, title: r.title, body: r.body, author: r.name ?? "A former member", you: r.email === asking, createdAt: new Date(r.created_at).toISOString(), bountyId: r.bounty_id, valuation: r.valuation ?? null });
    return p.success ? [p.data] : [];
  });
}

/** Adds a pitch to the club's library. */
export async function addPitch(id: string, email: string, pitch: Pick<Pitch, "id" | "symbol" | "title" | "body"> & { valuation?: Pitch["valuation"] }, bountyId: string | null = null): Promise<void> {
  const n = (await run((q) => q`select count(*)::int as n from club_pitches where club_id = ${id}`)) as { n: number }[];
  if ((n[0]?.n ?? 0) >= MAX_PITCHES) throw new SyncError(`The library keeps ${MAX_PITCHES} pitches; an officer removes old ones first.`, "club library full");
  const valuation = pitch.valuation ? JSON.stringify(pitch.valuation) : null;
  await run((q) => q`insert into club_pitches (id, club_id, email, symbol, title, body, bounty_id, valuation) values (${pitch.id}, ${id}, ${email}, ${pitch.symbol}, ${pitch.title}, ${pitch.body}, ${bountyId}, ${valuation}::jsonb) on conflict (id) do nothing`);
}

/** Removes a pitch: its author, or the owner and officers. */
export async function deletePitch(id: string, pitchId: string, email: string, runs: boolean): Promise<void> {
  const rows = (await run((q) => (runs ? q`delete from club_pitches where club_id = ${id} and id = ${pitchId} returning id` : q`delete from club_pitches where club_id = ${id} and id = ${pitchId} and email = ${email} returning id`))) as { id: string }[];
  if (!rows.length) throw new SyncError("That pitch is not yours to remove, or it is gone.", "club pitch not removed");
}

/** The club's meetings, the newest first, with each item's votes counted and the asker's own vote. */
export async function clubMeetings(id: string, asking: string): Promise<MeetingView[]> {
  const rows = (await run((q) => q`select meeting from club_meetings where club_id = ${id} order by created_at desc limit ${MAX_MEETINGS}`)) as { meeting: unknown }[];
  const meetings = rows.flatMap((r) => {
    const p = meetingSchema.safeParse(r.meeting);
    return p.success ? [p.data] : [];
  });
  if (!meetings.length) return [];
  const votes = (await run((q) => q`select meeting_id, item_id, email, vote from club_votes where meeting_id = any(${meetings.map((m) => m.id)}::text[])`)) as { meeting_id: string; item_id: string; email: string; vote: string }[];
  return meetings.map((m) => {
    const tallies: Record<string, Tally> = {};
    for (const it of m.items) tallies[it.id] = { for: 0, against: 0, abstain: 0, mine: null };
    const voters = new Set<string>();
    for (const v of votes) {
      if (v.meeting_id !== m.id || !tallies[v.item_id] || !(VOTES as readonly string[]).includes(v.vote)) continue;
      const vote = v.vote as Vote;
      tallies[v.item_id][vote] += 1;
      voters.add(v.email);
      if (v.email === asking) tallies[v.item_id].mine = vote;
    }
    return { ...m, tallies, voters: voters.size };
  });
}

/** Calls a meeting. */
export async function createMeeting(m: Meeting): Promise<void> {
  const v = meetingSchema.parse(m);
  const n = (await run((q) => q`select count(*)::int as n from club_meetings where club_id = ${v.clubId}`)) as { n: number }[];
  if ((n[0]?.n ?? 0) >= MAX_MEETINGS) throw new SyncError(`A club keeps ${MAX_MEETINGS} meetings; delete an old one first.`, "club meetings full");
  await run((q) => q`insert into club_meetings (id, club_id, meeting) values (${v.id}, ${v.clubId}, ${JSON.stringify(v)}::jsonb) on conflict (id) do nothing`);
}

/** One member's vote on one item of a meeting of their club; a second vote replaces the first. */
export async function castVote(clubId: string, meetingId: string, itemId: string, email: string, vote: Vote): Promise<void> {
  const rows = (await run((q) => q`select meeting from club_meetings where id = ${meetingId} and club_id = ${clubId}`)) as { meeting: unknown }[];
  const m = rows[0] ? meetingSchema.safeParse(rows[0].meeting) : null;
  if (!m?.success || !m.data.items.some((i) => i.id === itemId)) throw new SyncError("That item is not on the meeting's agenda.", "club vote item unknown");
  if (m.data.minutes) throw new SyncError("The minutes are written; the vote is closed.", "club vote closed");
  await run((q) => q`insert into club_votes (meeting_id, item_id, email, vote) values (${meetingId}, ${itemId}, ${email}, ${vote}) on conflict (meeting_id, item_id, email) do update set vote = excluded.vote`);
}

/** Writes a meeting's minutes, which closes its votes. */
export async function keepMinutes(clubId: string, meetingId: string, minutes: string | null): Promise<void> {
  const rows = (await run((q) => q`select meeting from club_meetings where id = ${meetingId} and club_id = ${clubId}`)) as { meeting: unknown }[];
  const m = rows[0] ? meetingSchema.safeParse(rows[0].meeting) : null;
  if (!m?.success) throw new SyncError("That meeting is gone.", "club meeting gone");
  const next = meetingSchema.parse({ ...m.data, minutes });
  await run((q) => q`update club_meetings set meeting = ${JSON.stringify(next)}::jsonb where id = ${meetingId}`);
}

export async function deleteMeeting(clubId: string, meetingId: string): Promise<void> {
  await run((q) => q`delete from club_meetings where id = ${meetingId} and club_id = ${clubId}`);
}

// A Community card shown only through a link (lib/community.ts, `listed`): for a mentor, an adviser or a club's officer. The link's code is hashed to find the card and sealed to show it again to its owner.
const linkHash = (code: string) => createHash("sha256").update(`card-link\n${code.trim()}`).digest("hex");

/** The person's card link code, or null when they have none. */
export async function cardLinkOf(email: string): Promise<string | null> {
  const rows = (await run((q) => q`select link_sealed from community_profiles where email = ${email}`)) as { link_sealed: string | null }[];
  return rows[0]?.link_sealed ? open(rows[0].link_sealed) : null;
}

/** Sets or clears the person's card link; the old link stops working. */
export async function setCardLink(email: string, code: string | null): Promise<void> {
  await run((q) => q`update community_profiles set link_hash = ${code ? linkHash(code) : null}, link_sealed = ${code ? seal(code) : null} where email = ${email}`);
}

/** The card a link opens, listed or not; null when the link is unknown. */
export async function cardByLink(code: string): Promise<CommunityProfile | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const rows = (await run((q) => q`select handle, profile, published_at, updated_at from community_profiles where link_hash = ${linkHash(code)}`)) as ProfileRow[];
  return rows[0] ? toProfile(rows[0]) : null;
}

/** Registers the fingerprints of theses' words; each keeps the time it was first seen, so a thesis can be shown to have been written by then. Returns each fingerprint's time. */
export async function sealReceipts(hashes: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(hashes)].filter((h) => /^[a-f0-9]{64}$/.test(h)).slice(0, 200);
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  await run((q) => q`insert into thesis_receipts (hash) select unnest(${wanted}::text[]) on conflict (hash) do nothing`);
  const rows = (await run((q) => q`select hash, sealed_at from thesis_receipts where hash = any(${wanted}::text[])`)) as { hash: string; sealed_at: string | Date }[];
  for (const r of rows) out.set(r.hash, new Date(r.sealed_at).toISOString());
  return out;
}

/** When a fingerprint was first seen, or null. */
export async function receiptOf(hash: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const rows = (await run((q) => q`select sealed_at from thesis_receipts where hash = ${hash}`)) as { sealed_at: string | Date }[];
  return rows[0] ? new Date(rows[0].sealed_at).toISOString() : null;
}

/** The club's competitions, newest first. */
export async function clubCompetitions(id: string): Promise<Competition[]> {
  const rows = (await run((q) => q`select competition from club_competitions where club_id = ${id} order by created_at desc limit ${MAX_COMPETITIONS}`)) as { competition: unknown }[];
  return rows.flatMap((r) => {
    const p = competitionSchema.safeParse(r.competition);
    return p.success ? [p.data] : [];
  });
}

export async function createCompetition(c: Competition): Promise<void> {
  const v = competitionSchema.parse(c);
  const n = (await run((q) => q`select count(*)::int as n from club_competitions where club_id = ${v.clubId}`)) as { n: number }[];
  if ((n[0]?.n ?? 0) >= MAX_COMPETITIONS) throw new SyncError(`A club keeps at most ${MAX_COMPETITIONS} competitions; delete an old one first.`, "competitions full");
  const made = (await run((q) => q`insert into club_competitions (id, club_id, competition) values (${v.id}, ${v.clubId}, ${JSON.stringify(v)}::jsonb) on conflict (id) do nothing returning id`)) as { id: string }[];
  if (!made.length) throw new SyncError("A competition with that name already starts that day.", "competition id taken");
}

export async function deleteCompetition(clubId: string, competitionId: string): Promise<void> {
  await run((q) => q`delete from club_competitions where id = ${competitionId} and club_id = ${clubId}`);
}

/** The entries in a competition under each member's chosen name; whose is the asker's is marked, no address is read back. */
export async function competitionEntries(competitionId: string, asking: string): Promise<Entry[]> {
  const rows = (await run(
    (q) => q`
    select e.email, e.trades, e.updated_at, m.name from club_entries e
    join club_competitions c on c.id = e.competition_id
    join club_members m on m.club_id = c.club_id and m.email = e.email
    where e.competition_id = ${competitionId}`,
  )) as { email: string; trades: unknown; updated_at: string | Date; name: string }[];
  return rows.map((r) => {
    const trades = (Array.isArray(r.trades) ? r.trades : []).flatMap((t) => {
      const p = tradeSchema.safeParse(t);
      return p.success ? [p.data] : [];
    });
    return { name: r.name, you: r.email === asking, trades, updatedAt: new Date(r.updated_at).toISOString() };
  });
}

/** Keeps a member's trades in a competition (an empty list enters them). */
export async function keepEntry(competitionId: string, email: string, trades: readonly Trade[]): Promise<void> {
  const valid = trades.map((t) => tradeSchema.parse(t));
  await run(
    (q) => q`
    insert into club_entries (competition_id, email, trades, updated_at) values (${competitionId}, ${email}, ${JSON.stringify(valid)}::jsonb, now())
    on conflict (competition_id, email) do update set trades = excluded.trades, updated_at = now()`,
  );
}


// ---------------------------------------------------------------------------
// Twenty more ways (Hamza, 9 Nov 2026): challenges between clubs, thesis
// bounties, peer review, a club's shared watchlist and its alumni.

/** A club's name by its id, for a challenge typed by id; null when there is none. */
export async function clubName(id: string): Promise<string | null> {
  const rows = (await run((q) => q`select name from clubs where id = ${id}`)) as { name: string }[];
  return rows[0]?.name ?? null;
}

/** The challenges a club sent or received, newest first, with what the league keeps of each side's competition once accepted. */
export async function clubChallenges(id: string): Promise<ChallengeView[]> {
  const rows = (await run(
    (q) => q`
    select ch.challenge, ch.from_club, ch.from_competition, ch.to_competition, fc.summary as from_summary, tc.summary as to_summary from club_challenges ch
    left join club_competitions fc on fc.id = ch.from_competition left join club_competitions tc on tc.id = ch.to_competition
    where ch.from_club = ${id} or ch.to_club = ${id} order by ch.created_at desc limit 40`,
  )) as { challenge: unknown; from_club: string; from_competition: string | null; to_competition: string | null; from_summary: unknown; to_summary: unknown }[];
  return rows.flatMap((r) => {
    const c = challengeSchema.safeParse(r.challenge);
    if (!c.success) return [];
    const side = r.from_club === id ? "from" : "to";
    const sum = (x: unknown) => {
      const p = boardSummarySchema.safeParse(x);
      return p.success ? p.data : null;
    };
    const fromS = sum(r.from_summary);
    const toS = sum(r.to_summary);
    return [{ ...c.data, side, mine: side === "from" ? fromS : toS, theirs: side === "from" ? toS : fromS, competitionId: side === "from" ? r.from_competition : r.to_competition }];
  });
}

/** Sends a challenge to another club, pending until its owner or an officer accepts. */
export async function createChallenge(c: Challenge): Promise<void> {
  const v = challengeSchema.parse(c);
  const open = (await run((q) => q`select count(*)::int as n from club_challenges where from_club = ${v.fromClub} and challenge->>'status' = 'pending'`)) as { n: number }[];
  if ((open[0]?.n ?? 0) >= 5) throw new SyncError("The club has five challenges waiting for an answer; wait for one first.", "club challenges pending");
  const made = (await run((q) => q`insert into club_challenges (id, from_club, to_club, challenge) values (${v.id}, ${v.fromClub}, ${v.toClub}, ${JSON.stringify(v)}::jsonb) on conflict (id) do nothing returning id`)) as { id: string }[];
  if (!made.length) throw new SyncError("That club already has a challenge from yours starting that day.", "club challenge taken");
}

/** Accepts or declines a challenge the club received; accepting starts the same competition in both clubs. */
export async function answerChallenge(toClub: string, challengeId: string, accept: boolean): Promise<void> {
  const rows = (await run((q) => q`select challenge from club_challenges where id = ${challengeId} and to_club = ${toClub}`)) as { challenge: unknown }[];
  const c = rows[0] ? challengeSchema.safeParse(rows[0].challenge) : null;
  if (!c?.success) throw new SyncError("That challenge is gone.", "club challenge gone");
  if (c.data.status !== "pending") throw new SyncError("That challenge has been answered.", "club challenge answered");
  const next = challengeSchema.parse({ ...c.data, status: accept ? "accepted" : "declined" });
  if (!accept) {
    await run((q) => q`update club_challenges set challenge = ${JSON.stringify(next)}::jsonb where id = ${challengeId}`);
    return;
  }
  const side = (club: string, other: string): Competition => competitionSchema.parse({ id: `${club}-v-${other}-${c.data.starts.replace(/-/g, "")}`.slice(0, 80), clubId: club, name: `${c.data.name}: against ${club === c.data.fromClub ? c.data.toName : c.data.fromName}`.slice(0, 80), starts: c.data.starts, ends: c.data.ends, cash: c.data.cash, maxWeightPct: c.data.maxWeightPct, note: "A challenge between two clubs: each club's median member against SPY, set beside the other's.", createdAt: new Date().toISOString(), course: null, challengeId: c.data.id });
  const from = side(c.data.fromClub, c.data.toClub);
  const to = side(c.data.toClub, c.data.fromClub);
  for (const x of [from, to]) await run((q) => q`insert into club_competitions (id, club_id, competition) values (${x.id}, ${x.clubId}, ${JSON.stringify(x)}::jsonb) on conflict (id) do nothing`);
  await run((q) => q`update club_challenges set challenge = ${JSON.stringify(next)}::jsonb, from_competition = ${from.id}, to_competition = ${to.id} where id = ${challengeId}`);
}

/** The club's bounties, newest first, each with the pitches written for it, their votes and the asker's own vote. */
export async function clubBounties(id: string, asking: string): Promise<BountyView[]> {
  const rows = (await run((q) => q`select bounty from club_bounties where club_id = ${id} order by created_at desc limit 40`)) as { bounty: unknown }[];
  const bounties = rows.flatMap((r) => {
    const p = bountySchema.safeParse(r.bounty);
    return p.success ? [p.data] : [];
  });
  if (!bounties.length) return [];
  const ids = bounties.map((b) => b.id);
  const pitches = (await run((q) => q`select p.id, p.title, p.bounty_id, m.name from club_pitches p left join club_members m on m.club_id = p.club_id and m.email = p.email where p.club_id = ${id} and p.bounty_id = any(${ids}::text[])`)) as { id: string; title: string; bounty_id: string; name: string | null }[];
  const votes = (await run((q) => q`select bounty_id, email, pitch_id from bounty_votes where bounty_id = any(${ids}::text[])`)) as { bounty_id: string; email: string; pitch_id: string }[];
  return bounties.map((b) => ({
    ...b,
    pitches: pitches.filter((p) => p.bounty_id === b.id).map((p) => ({ id: p.id, title: p.title, author: p.name ?? "A former member", votes: votes.filter((v) => v.bounty_id === b.id && v.pitch_id === p.id).length })),
    mine: votes.find((v) => v.bounty_id === b.id && v.email === asking)?.pitch_id ?? null,
  }));
}

export async function addBounty(b: Bounty): Promise<void> {
  const v = bountySchema.parse(b);
  const n = (await run((q) => q`select count(*)::int as n from club_bounties where club_id = ${v.clubId} and bounty->>'winner' is null`)) as { n: number }[];
  if ((n[0]?.n ?? 0) >= 10) throw new SyncError("The club has ten open bounties; close one first.", "club bounties full");
  await run((q) => q`insert into club_bounties (id, club_id, bounty) values (${v.id}, ${v.clubId}, ${JSON.stringify(v)}::jsonb) on conflict (id) do nothing`);
}

/** One member's vote for a pitch written for a bounty, not their own; a second vote replaces the first. */
export async function voteBounty(clubId: string, bountyId: string, email: string, pitchId: string): Promise<void> {
  const p = (await run((q) => q`select p.email, b.bounty from club_pitches p join club_bounties b on b.id = p.bounty_id where p.id = ${pitchId} and p.bounty_id = ${bountyId} and b.club_id = ${clubId}`)) as { email: string; bounty: unknown }[];
  if (!p[0]) throw new SyncError("That pitch was not written for this bounty.", "club bounty pitch");
  if (p[0].email === email) throw new SyncError("Vote for someone else's pitch.", "club bounty own");
  const b = bountySchema.safeParse(p[0].bounty);
  if (b.success && b.data.winner) throw new SyncError("The bounty is closed.", "club bounty closed");
  await run((q) => q`insert into bounty_votes (bounty_id, email, pitch_id) values (${bountyId}, ${email}, ${pitchId}) on conflict (bounty_id, email) do update set pitch_id = excluded.pitch_id`);
}

/** Closes a bounty: the pitch with the most votes wins. */
export async function closeBounty(clubId: string, bountyId: string): Promise<void> {
  const rows = (await run((q) => q`select bounty from club_bounties where id = ${bountyId} and club_id = ${clubId}`)) as { bounty: unknown }[];
  const b = rows[0] ? bountySchema.safeParse(rows[0].bounty) : null;
  if (!b?.success) throw new SyncError("That bounty is gone.", "club bounty gone");
  const votes = (await run((q) => q`select pitch_id as id, count(*)::int as votes from bounty_votes where bounty_id = ${bountyId} group by pitch_id`)) as { id: string; votes: number }[];
  const winner = bountyWinner(votes);
  if (!winner) throw new SyncError("No pitch has a vote yet.", "club bounty no votes");
  await run((q) => q`update club_bounties set bounty = ${JSON.stringify({ ...b.data, winner })}::jsonb where id = ${bountyId}`);
}

/** The peer reviews of the club's pitches, by pitch: how many, the average and the asker's own. */
export async function pitchReviews(clubId: string, asking: string): Promise<Record<string, ReviewSummary>> {
  const rows = (await run((q) => q`select r.pitch_id, r.email, r.score from pitch_reviews r join club_pitches p on p.id = r.pitch_id where p.club_id = ${clubId}`)) as { pitch_id: string; email: string; score: number }[];
  const by = new Map<string, { score: number; you: boolean }[]>();
  for (const r of rows) by.set(r.pitch_id, [...(by.get(r.pitch_id) ?? []), { score: r.score, you: r.email === asking }]);
  return Object.fromEntries([...by.entries()].map(([k, v]) => [k, reviewSummary(v)]));
}

/** One member's review of another's pitch, 1 to 5 on its evidence; a second replaces the first. */
export async function reviewPitch(clubId: string, pitchId: string, email: string, score: number, note: string | null = null): Promise<void> {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new SyncError("Score the evidence from 1 to 5.", "club review score");
  const p = (await run((q) => q`select email from club_pitches where id = ${pitchId} and club_id = ${clubId}`)) as { email: string }[];
  if (!p[0]) throw new SyncError("That pitch is gone.", "club review pitch");
  if (p[0].email === email) throw new SyncError("Review someone else's pitch; your own is theirs to judge.", "club review own");
  const words = note?.trim().slice(0, 600) || null;
  await run((q) => q`insert into pitch_reviews (pitch_id, email, score, note) values (${pitchId}, ${email}, ${score}, ${words}) on conflict (pitch_id, email) do update set score = excluded.score, note = excluded.note`);
}

/** The club's shared watchlist, by ticker. */
export async function clubWatch(id: string): Promise<ClubWatch[]> {
  const rows = (await run((q) => q`select item from club_watch where club_id = ${id} order by symbol`)) as { item: unknown }[];
  return rows.flatMap((r) => {
    const p = clubWatchSchema.safeParse(r.item);
    return p.success ? [p.data] : [];
  });
}

export async function keepClubWatch(id: string, item: ClubWatch): Promise<void> {
  const v = clubWatchSchema.parse(item);
  const n = (await run((q) => q`select count(*)::int as n from club_watch where club_id = ${id}`)) as { n: number }[];
  const had = (await run((q) => q`select 1 from club_watch where club_id = ${id} and symbol = ${v.symbol}`)) as unknown[];
  if (!had.length && (n[0]?.n ?? 0) >= MAX_CLUB_WATCH) throw new SyncError(`The club's watchlist keeps ${MAX_CLUB_WATCH} tickers.`, "club watch full");
  await run((q) => q`insert into club_watch (club_id, symbol, item) values (${id}, ${v.symbol}, ${JSON.stringify(v)}::jsonb) on conflict (club_id, symbol) do update set item = excluded.item`);
}

export async function dropClubWatch(id: string, symbol: string): Promise<void> {
  await run((q) => q`delete from club_watch where club_id = ${id} and symbol = ${symbol}`);
}

/** Every club watchlist one person's clubs keep, for their alerts. */
export async function clubWatchesOf(email: string): Promise<{ club: { id: string; name: string }; items: ClubWatch[] }[]> {
  const rows = (await run((q) => q`select c.id, c.name, w.item from club_members m join clubs c on c.id = m.club_id join club_watch w on w.club_id = c.id where m.email = ${email}`)) as { id: string; name: string; item: unknown }[];
  const by = new Map<string, { club: { id: string; name: string }; items: ClubWatch[] }>();
  for (const r of rows) {
    const p = clubWatchSchema.safeParse(r.item);
    if (!p.success) continue;
    const e = by.get(r.id) ?? { club: { id: r.id, name: r.name }, items: [] };
    e.items.push(p.data);
    by.set(r.id, e);
  }
  return [...by.values()];
}

/** The club's alumni who chose to be listed. */
export async function clubAlumni(id: string): Promise<Alumnus[]> {
  const rows = (await run((q) => q`select alumnus from club_alumni where club_id = ${id} limit 1000`)) as { alumnus: unknown }[];
  return rows.flatMap((r) => {
    const p = alumnusSchema.safeParse(r.alumnus);
    return p.success ? [p.data] : [];
  });
}

/** Takes a person off every club's alumni list. */
export async function forgetAlumni(email: string): Promise<void> {
  await run((q) => q`delete from club_alumni where email = ${email}`);
}

// ---------------------------------------------------------------------------
// The methodology marketplace, open data donations, households and the year's
// counts (Hamza, 9 Nov 2026, the twenty more ways).

const adopterKey = (email: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "portfolio-os").update(`adopter\n${email.trim().toLowerCase()}`).digest("hex").slice(0, 24);
const donorKey = (email: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "portfolio-os").update(`donor\n${email.trim().toLowerCase()}`).digest("hex").slice(0, 24);

type ListingRow = { id: string; email: string; listing: unknown; adopters: number };

function toListing(r: ListingRow, me: string | null): ListingView | null {
  const p = listingSchema.safeParse(r.listing);
  return p.success ? { ...p.data, adopters: Number(r.adopters) || 0, mine: !!me && r.email === me } : null;
}

/** Every listing on the shelf, most adopted first. */
export async function marketListings(me: string | null): Promise<ListingView[]> {
  const rows = (await run((q) => q`select id, email, listing, adopters from methodology_listings order by adopters desc, updated_at desc limit 200`)) as ListingRow[];
  return rows.flatMap((r) => toListing(r, me) ?? []);
}

export async function marketListing(id: string, me: string | null): Promise<ListingView | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(id)) return null;
  const rows = (await run((q) => q`select id, email, listing, adopters from methodology_listings where id = ${id}`)) as ListingRow[];
  return rows[0] ? toListing(rows[0], me) : null;
}

/** The person's own listing, or null; one listing a person, replaced when they list again. */
export async function myListing(email: string): Promise<ListingView | null> {
  const rows = (await run((q) => q`select id, email, listing, adopters from methodology_listings where email = ${email}`)) as ListingRow[];
  return rows[0] ? toListing(rows[0], email) : null;
}

export async function keepListing(email: string, l: Listing): Promise<void> {
  const v = listingSchema.parse(l);
  await run((q) => q`insert into methodology_listings (id, email, listing) values (${v.id}, ${email}, ${JSON.stringify(v)}::jsonb) on conflict (email) do update set listing = excluded.listing, updated_at = now()`);
}

export async function unlist(email: string): Promise<void> {
  await run((q) => q`delete from methodology_listings where email = ${email}`);
}

/** Counts one adoption a person, under a keyed fingerprint of their sign-in, never the address; the author's own does not count. */
export async function countAdoption(id: string, email: string): Promise<void> {
  const rows = (await run((q) => q`insert into listing_adopters (listing_id, who) select id, ${adopterKey(email)} from methodology_listings where id = ${id} and email <> ${email} on conflict do nothing returning listing_id`)) as { listing_id: string }[];
  if (rows.length) await run((q) => q`update methodology_listings set adopters = adopters + 1 where id = ${id}`);
}

/** This week's open data from one person, kept under a keyed fingerprint and the week; replaced within the week. */
export async function keepDonation(email: string, week: string, d: Donation): Promise<void> {
  const v = donationSchema.parse(d);
  await run((q) => q`insert into research_donations (who, week, donation) values (${donorKey(email)}, ${week}, ${JSON.stringify(v)}::jsonb) on conflict (who, week) do update set donation = excluded.donation`);
}

/** Switching donations off deletes every week the person gave. */
export async function forgetDonations(email: string): Promise<void> {
  await run((q) => q`delete from research_donations where who = ${donorKey(email)}`);
}

/** One week's donations, newest week when none is named. */
export async function donationsOf(week: string | null): Promise<{ week: string | null; donations: Donation[] }> {
  const w = week ?? (((await run((q) => q`select max(week) as week from research_donations`)) as { week: string | null }[])[0]?.week ?? null);
  if (!w) return { week: null, donations: [] };
  const rows = (await run((q) => q`select donation from research_donations where week = ${w}`)) as { donation: unknown }[];
  return { week: w, donations: rows.flatMap((r) => { const p = donationSchema.safeParse(r.donation); return p.success ? [p.data] : []; }) };
}

/** The latest week of a year that has donations, or null. */
export async function lastDonationWeek(year: number): Promise<string | null> {
  const rows = (await run((q) => q`select max(week) as week from research_donations where week like ${`${year}-W%`}`)) as { week: string | null }[];
  return rows[0]?.week ?? null;
}

/** What people did on the deployment in a year, counted and never named. */
export async function yearCounts(year: number): Promise<YearCounts> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const one = async (p: Promise<unknown>) => Number(((await p) as { n: string | number }[])[0]?.n ?? 0);
  const [cardsShared, recordsShared, receipts, clubs, competitions, listings, adoptions, donors] = await Promise.all([
    one(run((q) => q`select count(*) as n from community_profiles where published_at < ${to}`)),
    one(run((q) => q`select count(*) as n from community_profiles where published_at < ${to} and coalesce((profile->'sharing'->>'record')::boolean, false)`)),
    one(run((q) => q`select count(*) as n from thesis_receipts where sealed_at >= ${from} and sealed_at < ${to}`)),
    one(run((q) => q`select count(*) as n from clubs where created_at >= ${from} and created_at < ${to}`)),
    one(run((q) => q`select count(*) as n from club_competitions where created_at >= ${from} and created_at < ${to}`)),
    one(run((q) => q`select count(*) as n from methodology_listings where listed_at < ${to}`)),
    one(run((q) => q`select coalesce(sum(adopters), 0) as n from methodology_listings`)),
    one(run((q) => q`select count(distinct who) as n from research_donations where week like ${`${year}-W%`}`)),
  ]);
  return { cardsShared, recordsShared, receipts, clubs, competitions, listings, adoptions, donors };
}

const householdInviteHash = (code: string) => createHash("sha256").update(`household-invite\n${normalInvite(code)}`).digest("hex");

/** Starts a household with its first member; returns its id. */
export async function createHousehold(email: string, memberName: string, h: Household, code: string): Promise<string> {
  const v = householdSchema.parse(h);
  const mine = (await run((q) => q`select count(*) as n from household_members where email = ${email}`)) as { n: string | number }[];
  if (Number(mine[0]?.n ?? 0) >= 3) throw new SyncError("You are in three households already.", "household limit");
  await run((q) => q`insert into households (id, name, invite_hash, invite_sealed) values (${v.id}, ${v.name}, ${householdInviteHash(code)}, ${seal(normalInvite(code))})`);
  await run((q) => q`insert into household_members (household_id, email, name) values (${v.id}, ${email}, ${memberName.trim().slice(0, 60) || "Me"})`);
  return v.id;
}

/** Joins a household by its code; the household's id, or a sentence when the code is unknown or it is full. */
export async function joinHousehold(email: string, name: string, code: string): Promise<string> {
  const rows = (await run((q) => q`select id from households where invite_hash = ${householdInviteHash(code)}`)) as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new SyncError("No household has that code.", "household code unknown");
  const n = (await run((q) => q`select count(*) as n from household_members where household_id = ${id}`)) as { n: string | number }[];
  if (Number(n[0]?.n ?? 0) >= MAX_HOUSEHOLD) throw new SyncError(`A household has ${MAX_HOUSEHOLD} people at most.`, "household full");
  await run((q) => q`insert into household_members (household_id, email, name) values (${id}, ${email}, ${name.trim().slice(0, 60) || "Member"}) on conflict (household_id, email) do update set name = excluded.name`);
  return id;
}

/** The households a person is in. */
export async function myHouseholds(email: string): Promise<Household[]> {
  const rows = (await run((q) => q`select h.id, h.name from households h join household_members m on m.household_id = h.id where m.email = ${email} order by h.created_at`)) as Household[];
  return rows;
}

/** A household's members with their shared cards, read only by a member; null for anyone else. The card is the one they share on Community, listed or not. */
export async function householdCards(id: string, email: string): Promise<{ household: Household; code: string | null; pack: string | null; members: (MemberCard & { result: FamilyResult | null })[] } | null> {
  const h = (await run((q) => q`select h.id, h.name, h.invite_sealed, h.pack from households h join household_members m on m.household_id = h.id where h.id = ${id} and m.email = ${email}`)) as (Household & { invite_sealed: string; pack: string | null })[];
  if (!h[0]) return null;
  const rows = (await run((q) => q`select m.email, m.name, m.result, p.handle, p.profile, p.published_at, p.updated_at from household_members m left join community_profiles p on p.email = m.email where m.household_id = ${id} order by m.name`)) as { email: string; name: string; result: unknown; handle: string | null; profile: unknown; published_at: string | Date | null; updated_at: string | Date | null }[];
  let code: string | null = null;
  try {
    code = open(h[0].invite_sealed);
  } catch {
    code = null;
  }
  return {
    household: { id: h[0].id, name: h[0].name },
    code,
    pack: h[0].pack,
    members: rows.map((r) => {
      const p = r.profile ? communityProfileSchema.safeParse(r.profile) : null;
      const res = r.result ? familyResultSchema.safeParse(r.result) : null;
      return { name: r.name, you: r.email === email, card: p?.success ? p.data : null, result: res?.success ? res.data : null };
    }),
  };
}

/** Leaves a household; the last to leave takes it with them. */
export async function leaveHousehold(id: string, email: string): Promise<void> {
  await run((q) => q`delete from household_members where household_id = ${id} and email = ${email}`);
  await run((q) => q`delete from households where id = ${id} and not exists (select 1 from household_members where household_id = ${id})`);
}

// ---------------------------------------------------------------------------
// Twenty further ways (Hamza, 9 Nov 2026).

/** The pack a household agreed, set or cleared by any member; each member's own result is cleared with it, to be tested again. */
export async function setHouseholdPack(id: string, email: string, pack: string | null): Promise<void> {
  const rows = (await run((q) => q`update households set pack = ${pack} where id = ${id} and exists (select 1 from household_members where household_id = ${id} and email = ${email}) returning id`)) as { id: string }[];
  if (!rows.length) throw new SyncError("That household is not yours.", "household pack");
  await run((q) => q`update household_members set result = null where household_id = ${id}`);
}

/** The packs agreed in each household the person is in, so their app can test them. */
export async function familyPacksOf(email: string): Promise<{ id: string; pack: string }[]> {
  return (await run((q) => q`select h.id, h.pack from households h join household_members m on m.household_id = h.id where m.email = ${email} and h.pack is not null`)) as { id: string; pack: string }[];
}

/** One member's result on their household's pack: which rules are kept, in percent or counts, never an amount. */
export async function keepFamilyResult(id: string, email: string, result: FamilyResult): Promise<void> {
  const v = familyResultSchema.parse(result);
  await run((q) => q`update household_members set result = ${JSON.stringify(v)}::jsonb where household_id = ${id} and email = ${email}`);
}

/** A call published for anyone to read, unchanged since its receipt; a person keeps `MAX_PUBLIC_CALLS` at most. */
export async function publishCall(email: string, c: PublicCall): Promise<void> {
  const v = publicCallSchema.parse(c);
  const n = (await run((q) => q`select count(*)::int as n from public_calls where email = ${email} and id <> ${v.id}`)) as { n: number }[];
  if ((n[0]?.n ?? 0) >= MAX_PUBLIC_CALLS) throw new SyncError(`You can publish ${MAX_PUBLIC_CALLS} calls at most; take one down first.`, "public calls full");
  await run((q) => q`insert into public_calls (id, email, call) values (${v.id}, ${email}, ${JSON.stringify(v)}::jsonb) on conflict (id) do nothing`);
}

export async function unpublishCall(email: string, id: string): Promise<void> {
  await run((q) => q`delete from public_calls where id = ${id} and email = ${email}`);
}

export async function publicCall(id: string): Promise<PublicCall | null> {
  if (!/^[a-z0-9-]{6,80}$/.test(id)) return null;
  const rows = (await run((q) => q`select call from public_calls where id = ${id}`)) as { call: unknown }[];
  const p = rows[0] ? publicCallSchema.safeParse(rows[0].call) : null;
  return p?.success ? p.data : null;
}

/** The published calls, newest first; with an address, only that person's. */
export async function publicCalls(email: string | null = null, limit = 100): Promise<PublicCall[]> {
  const rows = (await run((q) => (email ? q`select call from public_calls where email = ${email} order by published_at desc limit ${limit}` : q`select call from public_calls order by published_at desc limit ${limit}`))) as { call: unknown }[];
  return rows.flatMap((r) => {
    const p = publicCallSchema.safeParse(r.call);
    return p.success ? [p.data] : [];
  });
}

/** A mentor's offer, one a person, under their card's handle. */
export async function keepMentorOffer(email: string, offer: MentorOffer): Promise<void> {
  const v = mentorOfferSchema.parse(offer);
  await run((q) => q`insert into mentor_offers (email, handle, offer) values (${email}, ${v.handle}, ${JSON.stringify(v)}::jsonb) on conflict (email) do update set handle = excluded.handle, offer = excluded.offer, updated_at = now()`);
}

export async function dropMentorOffer(email: string): Promise<void> {
  await run((q) => q`delete from mentor_offers where email = ${email}`);
}

/** Every open offer, the most recently updated first, and the asker's own. */
export async function mentorOffers(me: string | null): Promise<{ offers: MentorOffer[]; mine: MentorOffer | null }> {
  const rows = (await run((q) => q`select email, offer from mentor_offers order by updated_at desc limit 200`)) as { email: string; offer: unknown }[];
  let mine: MentorOffer | null = null;
  const offers = rows.flatMap((r) => {
    const p = mentorOfferSchema.safeParse(r.offer);
    if (!p.success) return [];
    if (me && r.email === me) mine = p.data;
    return p.data.open ? [p.data] : [];
  });
  return { offers, mine };
}

/** A member asks a mentor for a review; at most `MAX_OPEN_ASKS` open at once, and never of themselves. */
export async function askMentor(memberEmail: string, ask: MentorAsk): Promise<void> {
  const v = mentorAskSchema.parse(ask);
  const m = (await run((q) => q`select email, offer from mentor_offers where handle = ${v.mentor}`)) as { email: string; offer: unknown }[];
  const offer = m[0] ? mentorOfferSchema.safeParse(m[0].offer) : null;
  if (!m[0] || !offer?.success || !offer.data.open) throw new SyncError("That mentor is not taking requests.", "mentor closed");
  if (m[0].email === memberEmail) throw new SyncError("You cannot ask yourself.", "mentor self");
  const open = (await run((q) => q`select count(*)::int as n from mentor_asks where member_email = ${memberEmail} and ask->>'status' = 'asked'`)) as { n: number }[];
  if ((open[0]?.n ?? 0) >= MAX_OPEN_ASKS) throw new SyncError(`You have ${MAX_OPEN_ASKS} requests waiting; wait for an answer first.`, "mentor asks full");
  await run((q) => q`insert into mentor_asks (id, mentor_email, member_email, ask) values (${v.id}, ${m[0].email}, ${memberEmail}, ${JSON.stringify(v)}::jsonb) on conflict (id) do nothing`);
}

/** The requests a person made and the ones made of them; a mentor sees each member's card through its private link while the request is open. */
export async function mentorAsksOf(email: string): Promise<MentorAskView[]> {
  const rows = (await run((q) => q`select a.ask, a.mentor_email, a.member_email, p.link_sealed from mentor_asks a left join community_profiles p on p.email = a.member_email where a.mentor_email = ${email} or a.member_email = ${email} order by a.asked_at desc limit 100`)) as { ask: unknown; mentor_email: string; member_email: string; link_sealed: string | null }[];
  return rows.flatMap((r) => {
    const p = mentorAskSchema.safeParse(r.ask);
    if (!p.success) return [];
    const side = r.mentor_email === email ? ("mentor" as const) : ("member" as const);
    let code: string | null = null;
    if (side === "mentor" && p.data.status === "asked" && r.link_sealed) {
      try {
        code = open(r.link_sealed);
      } catch {
        code = null;
      }
    }
    return [{ ...p.data, side, cardHref: code ? `/card/${code}` : null }];
  });
}

/** The mentor's answer: a review written, or the request declined. */
export async function answerMentorAsk(mentorEmail: string, id: string, review: string | null): Promise<void> {
  const rows = (await run((q) => q`select ask from mentor_asks where id = ${id} and mentor_email = ${mentorEmail}`)) as { ask: unknown }[];
  const p = rows[0] ? mentorAskSchema.safeParse(rows[0].ask) : null;
  if (!p?.success) throw new SyncError("That request is gone.", "mentor ask unknown");
  const next = mentorAskSchema.parse({ ...p.data, status: review ? "reviewed" : "declined", review, answeredAt: new Date().toISOString() });
  await run((q) => q`update mentor_asks set ask = ${JSON.stringify(next)}::jsonb where id = ${id}`);
}

/** Deletes every request a person made or was asked, and their offer: for Stop sharing. */
export async function forgetMentoring(email: string): Promise<void> {
  await run((q) => q`delete from mentor_asks where mentor_email = ${email} or member_email = ${email}`);
  await run((q) => q`delete from mentor_offers where email = ${email}`);
}

type PackRow = { id: string; email: string; listing: unknown; adopters: number };
const toPack = (r: PackRow, me: string | null): PackListingView | null => {
  const p = packListingSchema.safeParse(r.listing);
  return p.success ? { ...p.data, adopters: Number(r.adopters) || 0, mine: !!me && r.email === me } : null;
};

export async function packListings(me: string | null): Promise<PackListingView[]> {
  const rows = (await run((q) => q`select id, email, listing, adopters from pack_listings order by adopters desc, updated_at desc limit 200`)) as PackRow[];
  return rows.flatMap((r) => toPack(r, me) ?? []);
}

export async function packListing(id: string, me: string | null): Promise<PackListingView | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(id)) return null;
  const rows = (await run((q) => q`select id, email, listing, adopters from pack_listings where id = ${id}`)) as PackRow[];
  return rows[0] ? toPack(rows[0], me) : null;
}

export async function keepPackListing(email: string, l: PackListing): Promise<void> {
  const v = packListingSchema.parse(l);
  await run((q) => q`insert into pack_listings (id, email, listing) values (${v.id}, ${email}, ${JSON.stringify(v)}::jsonb) on conflict (email) do update set listing = excluded.listing, updated_at = now()`);
}

export async function unlistPack(email: string): Promise<void> {
  await run((q) => q`delete from pack_listings where email = ${email}`);
}

export async function countPackAdoption(id: string, email: string): Promise<void> {
  const rows = (await run((q) => q`insert into pack_adopters (listing_id, who) select id, ${adopterKey(email)} from pack_listings where id = ${id} and email <> ${email} on conflict do nothing returning listing_id`)) as { listing_id: string }[];
  if (rows.length) await run((q) => q`update pack_listings set adopters = adopters + 1 where id = ${id}`);
}

/** The club's treasury as its treasurer last published it, with the treasurer's club name; null when none is linked. */
export async function clubTreasury(clubId: string, asking: string): Promise<{ treasury: Treasury | null; mine: boolean; linked: boolean } | null> {
  const rows = (await run((q) => q`select email, treasury from club_treasury where club_id = ${clubId}`)) as { email: string; treasury: unknown }[];
  if (!rows[0]) return null;
  const p = rows[0].treasury ? treasurySchema.safeParse(rows[0].treasury) : null;
  return { treasury: p?.success ? p.data : null, mine: rows[0].email === asking, linked: true };
}

/** Links the treasurer's own book as the club's treasury, or unlinks it; only the treasurer's app writes it after. */
export async function linkTreasury(clubId: string, email: string, on: boolean): Promise<void> {
  if (on) await run((q) => q`insert into club_treasury (club_id, email) values (${clubId}, ${email}) on conflict (club_id) do update set email = excluded.email, treasury = null, updated_at = now()`);
  else await run((q) => q`delete from club_treasury where club_id = ${clubId}`);
}

/** The clubs whose treasury this person holds, for their app to publish. */
export async function treasuriesOf(email: string): Promise<{ clubId: string; holder: string }[]> {
  return (await run((q) => q`select t.club_id as "clubId", m.name as holder from club_treasury t join club_members m on m.club_id = t.club_id and m.email = t.email where t.email = ${email}`)) as { clubId: string; holder: string }[];
}

export async function keepTreasury(clubId: string, email: string, t: Treasury): Promise<void> {
  const v = treasurySchema.parse(t);
  await run((q) => q`update club_treasury set treasury = ${JSON.stringify(v)}::jsonb, updated_at = now() where club_id = ${clubId} and email = ${email}`);
}

/** The reviewers' notes on the club's pitches, credited by club name; a reviewer who left is "A former member". */
export async function pitchNotes(clubId: string): Promise<Record<string, { name: string; alumnus: boolean; score: number; note: string }[]>> {
  const rows = (await run((q) => q`select r.pitch_id, r.score, r.note, m.name, m.role from pitch_reviews r join club_pitches p on p.id = r.pitch_id left join club_members m on m.club_id = p.club_id and m.email = r.email where p.club_id = ${clubId} and r.note is not null`)) as { pitch_id: string; score: number; note: string; name: string | null; role: string | null }[];
  const out: Record<string, { name: string; alumnus: boolean; score: number; note: string }[]> = {};
  for (const r of rows) (out[r.pitch_id] ??= []).push({ name: r.name ?? "A former member", alumnus: r.role === "alumnus", score: r.score, note: r.note });
  return out;
}

/** Every week of open data, for the researchers' download. */
export async function allDonations(): Promise<{ week: string; donations: Donation[] }[]> {
  const rows = (await run((q) => q`select week, donation from research_donations order by week limit 200000`)) as { week: string; donation: unknown }[];
  const by = new Map<string, Donation[]>();
  for (const r of rows) {
    const p = donationSchema.safeParse(r.donation);
    if (p.success) by.set(r.week, [...(by.get(r.week) ?? []), p.data]);
  }
  return [...by.entries()].map(([week, donations]) => ({ week, donations }));
}

/** For the awards: each league club's peer-reviewed pitches written in a year, counted with their average score. */
export async function leagueLibraryStats(year: number): Promise<Record<string, { reviewed: number; average: number | null }>> {
  const rows = (await run((q) => q`select p.club_id, count(distinct p.id)::int as reviewed, avg(r.score)::float as average from club_pitches p join pitch_reviews r on r.pitch_id = p.id join clubs c on c.id = p.club_id where c.league = true and p.created_at >= ${`${year}-01-01`} and p.created_at < ${`${year + 1}-01-01`} group by p.club_id`)) as { club_id: string; reviewed: number; average: number | null }[];
  return Object.fromEntries(rows.map((r) => [r.club_id, { reviewed: r.reviewed, average: r.average === null ? null : Math.round(r.average * 10) / 10 }]));
}
