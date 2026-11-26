"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { CLUB_ID, COMPETITION_ID, DEFAULT_CASH, MEMBER_NAME_MAX, PITCH_BODY_MAX, TICKER, VOTES, agendaFrom, challengeIdFrom, clubIdFrom, competitionIdFrom, driveFolderId, holdingsOf, inviteCodeFrom, meetingIdFrom, mentorsOnly, pitchIdFrom, pitchValuationSchema, runsClub, withTrade, type Competition, type Vote } from "@/lib/clubs";
import { requireOperator } from "@/lib/session";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";

export type ClubState = { error: string | null };

const str = (form: FormData, key: string, max = 400) => String(form.get(key) ?? "").trim().slice(0, max);
const freshInvite = () => inviteCodeFrom(randomBytes(16));

/** Runs one club change: the demo changes nothing, the registry must be there, every failure is a sentence. */
async function guarded(fn: (email: string, name: string | null) => Promise<void>, paths: string[] = ["/clubs"]): Promise<ClubState> {
  try {
    if (storageMode() === "demo") throw new SyncError("The demo's club is fictional and read-only. In your own copy you start or join a club here.", "clubs in demo");
    const { registryAvailable } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("Clubs need the deployment's registry, which is not set up.", "clubs no registry");
    const op = await requireOperator();
    await fn(op.email, op.name);
    for (const p of paths) revalidatePath(p);
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[clubs] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** The club, checked: the one asking is in it, and, when `runs`, its owner or an officer. */
async function myClub(email: string, id: string, runs: boolean) {
  if (!CLUB_ID.test(id)) throw new SyncError("That is not a club.", "club id");
  const { clubFor } = await import("@/lib/registry");
  const mine = await clubFor(email, id);
  if (!mine) throw new SyncError("You are not in that club.", "club not member");
  if (runs && !runsClub(mine.role)) throw new SyncError("Only the club's owner and officers can change that.", "club not officer");
  return mine;
}

function memberName(form: FormData, fallback: string | null): string {
  const name = str(form, "name", MEMBER_NAME_MAX) || (fallback ?? "").slice(0, MEMBER_NAME_MAX);
  if (!name) throw new SyncError("Say the name the club will see you as.", "club name missing");
  return name;
}

function folderFrom(form: FormData): string | null {
  const raw = str(form, "folder", 300);
  if (!raw) return null;
  const id = driveFolderId(raw);
  if (!id) throw new SyncError("That is not a Google Drive folder's address. Open the folder in Drive and copy the address from the bar.", "club folder");
  return id;
}

/** Starts a club: its name, a line, the Drive folder its material is in, and the person as its owner. */
export async function createClubAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  return guarded(async (email, opName) => {
    const name = str(form, "club", 80);
    if (name.length < 2) throw new SyncError("Give the club a name.", "club name");
    const { createClub } = await import("@/lib/registry");
    await createClub(email, memberName(form, opName), { id: clubIdFrom(name), name, about: str(form, "about") || null, folderId: folderFrom(form), createdAt: new Date().toISOString() }, freshInvite());
  });
}

/** Joins the club a code opens. Ten tries an hour per person, so a code cannot be guessed. */
export async function joinClubAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  return guarded(async (email, opName) => {
    const { allow, limitKey } = await import("@/lib/rate-limit");
    if (!(await allow(limitKey("club-join", email), 10, 3600))) throw new SyncError("Too many codes tried in the last hour. Try again later.", "club join limit");
    const code = str(form, "code", 40);
    if (!code) throw new SyncError("Type the club's code.", "club code missing");
    const { joinClub } = await import("@/lib/registry");
    await joinClub(email, memberName(form, opName), code);
  });
}

/** The club's name, line and Drive folder; the owner and officers alone. */
export async function updateClubAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    const mine = await myClub(email, id, true);
    const name = str(form, "club", 80) || mine.club.name;
    const { updateClub } = await import("@/lib/registry");
    await updateClub(id, { name, about: str(form, "about") || null, folderId: form.has("folder") ? folderFrom(form) : mine.club.folderId });
  }, ["/clubs", `/clubs/${id}`]);
}

/** A new join code; the old one stops working. */
export async function renewInviteAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const { renewInvite } = await import("@/lib/registry");
    await renewInvite(id, freshInvite());
  }, [`/clubs/${id}`]);
}

/** Makes a member an officer or a member again; the owner alone. */
export async function setRoleAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    const mine = await myClub(email, id, true);
    if (mine.role !== "owner") throw new SyncError("Only the club's owner names officers.", "club not owner");
    const asked = str(form, "role");
    const role = asked === "officer" || asked === "adviser" || asked === "alumnus" ? asked : "member";
    const { setMemberRole } = await import("@/lib/registry");
    await setMemberRole(id, str(form, "member", 320), role);
  }, [`/clubs/${id}`]);
}

/** Removes a member and their entries; the owner and officers, never the owner. */
export async function removeMemberAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const member = str(form, "member", 320);
    if (member === email) throw new SyncError("Leave the club instead.", "club remove self");
    const { removeMember } = await import("@/lib/registry");
    await removeMember(id, member);
  }, [`/clubs/${id}`]);
}

/** Leaves a club, or, for its owner, deletes it with everything kept for it. */
export async function leaveClubAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    const mine = await myClub(email, id, false);
    const reg = await import("@/lib/registry");
    if (mine.role === "owner") {
      if (str(form, "confirm", 80) !== mine.club.name) throw new SyncError(`Type the club's name, ${mine.club.name}, to delete it.`, "club delete unconfirmed");
      await reg.deleteClub(id);
    } else if (str(form, "mentor") === "on") {
      // Stays on as an alumni mentor (Hamza, 9 Nov 2026): reads the library and reviews pitches with a note, never competes or votes.
      await reg.setMemberRole(id, email, "alumnus");
    } else await reg.leaveClub(id, email, str(form, "alumni") === "on");
  });
}

/** Starts a competition: virtual cash, a first and last day, a weight limit; the owner and officers. */
export async function createCompetitionAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const name = str(form, "name", 80);
    const starts = str(form, "starts", 10);
    const ends = str(form, "ends", 10);
    if (name.length < 2) throw new SyncError("Give the competition a name.", "competition name");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends < starts) throw new SyncError("Give a first day and a last day after it.", "competition dates");
    if (ends < localDay()) throw new SyncError("The last day has passed.", "competition past");
    const cash = Number(str(form, "cash", 20).replace(/[,$\s]/g, "")) || DEFAULT_CASH;
    const cap = str(form, "maxWeight", 6);
    const maxWeightPct = cap ? Number(cap) : null;
    if (maxWeightPct !== null && !(maxWeightPct > 0 && maxWeightPct <= 100)) throw new SyncError("A weight limit is a percent between 1 and 100, or none.", "competition cap");
    const minHoldings = Math.round(Number(str(form, "minHoldings", 3)) || 5);
    const course = str(form, "course") === "on" ? { minHoldings: Math.min(30, Math.max(1, minHoldings)), reasons: true } : null;
    const c: Competition = { id: competitionIdFrom(id, name, starts), clubId: id, name, starts, ends, cash, maxWeightPct, note: str(form, "note") || null, createdAt: new Date().toISOString(), course, challengeId: null };
    const { createCompetition } = await import("@/lib/registry");
    await createCompetition(c);
  }, [`/clubs/${id}`]);
}

export async function deleteCompetitionAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const cid = str(form, "competition", 80);
    if (!COMPETITION_ID.test(cid)) throw new SyncError("That is not a competition.", "competition id");
    const { deleteCompetition } = await import("@/lib/registry");
    await deleteCompetition(id, cid);
  }, [`/clubs/${id}`]);
}

async function competitionOf(email: string, id: string, cid: string) {
  const club = await myClub(email, id, false);
  if (mentorsOnly(club.role)) throw new SyncError("Alumni mentors read and review; competitions are for the club's members.", "club alumnus competes");
  if (!COMPETITION_ID.test(cid)) throw new SyncError("That is not a competition.", "competition id");
  const { clubCompetitions, competitionEntries } = await import("@/lib/registry");
  const c = (await clubCompetitions(id)).find((x) => x.id === cid);
  if (!c) throw new SyncError("That competition is gone.", "competition gone");
  const mine = (await competitionEntries(cid, email)).find((e) => e.you) ?? null;
  return { c, mine };
}

/** Enters the competition with the starting cash and no trades. */
export async function enterCompetitionAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  const cid = str(form, "competition", 80);
  return guarded(async (email) => {
    const { mine } = await competitionOf(email, id, cid);
    if (mine) return;
    const { keepEntry } = await import("@/lib/registry");
    await keepEntry(cid, email, []);
  }, [`/clubs/${id}`, `/clubs/${id}/c/${cid}`]);
}

/** One virtual trade at the last close, tested against the competition's rules (`withTrade`). */
export async function tradeAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  const cid = str(form, "competition", 80);
  return guarded(async (email) => {
    const { c, mine } = await competitionOf(email, id, cid);
    const today = localDay();
    const symbol = str(form, "symbol", 12).toUpperCase();
    const { lastClose, heldPrices } = await import("@/lib/clubs-run");
    const trades = mine?.trades ?? [];
    const held = holdingsOf(trades, c.cash).positions.map((p) => p.symbol);
    const [close, prices] = await Promise.all([lastClose(symbol, today), heldPrices(held, today)]);
    const out = withTrade(c, trades, { symbol, side: str(form, "side") === "sell" ? "sell" : "buy", shares: Number(str(form, "shares", 20).replace(/,/g, "")), reason: str(form, "reason", 200) || null }, close, prices, today);
    if ("error" in out) throw new SyncError(out.error, "competition trade refused");
    const { keepEntry } = await import("@/lib/registry");
    await keepEntry(cid, email, out.trades);
  }, [`/clubs/${id}/c/${cid}`]);
}

/** Shows the club on the league, or takes it off; the owner and officers. The league shows the club's name, its line and its competitions' medians in percent, never a member. */
export async function setLeagueAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const { setLeague } = await import("@/lib/registry");
    await setLeague(id, str(form, "league") === "on");
  }, [`/clubs/${id}`, "/clubs/league"]);
}

/** Adds a pitch to the club's library: a ticker, a title and the case, under the member's club name. */
export async function addPitchAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, false);
    const symbol = str(form, "symbol", 12).toUpperCase();
    if (!TICKER.test(symbol)) throw new SyncError("Type a ticker, such as MSFT.", "club pitch ticker");
    const title = str(form, "title", 120);
    if (title.length < 2) throw new SyncError("Give the pitch a title.", "club pitch title");
    const body = str(form, "body", PITCH_BODY_MAX);
    if (body.length < 20) throw new SyncError("Write the case: a few lines at least.", "club pitch body");
    const bounty = str(form, "bounty", 90) || null;
    // The author's own valuation, bear to bull per share, judged on the calibration board (Hamza, 9 Nov 2026); the close of the day is kept beside it.
    const num = (k: string) => Number(str(form, k, 20).replace(/[$,\s]/g, ""));
    let valuation = null;
    if (str(form, "base", 20)) {
      const close = await (await import("@/lib/clubs-run")).lastClose(symbol, localDay()).catch(() => null);
      const v = pitchValuationSchema.safeParse({ bear: num("bear"), base: num("base"), bull: num("bull"), price: close?.price ?? null });
      if (!v.success) throw new SyncError("Give the bear, base and bull per share, lowest to highest, or leave all three empty.", "club pitch valuation");
      valuation = v.data;
    }
    const { addPitch } = await import("@/lib/registry");
    await addPitch(id, email, { id: pitchIdFrom(symbol, title, new Date().toISOString()), symbol, title, body, valuation }, bounty);
  }, [`/clubs/${id}`]);
}

/** Removes a pitch: its author, or the owner and officers. */
export async function deletePitchAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    const mine = await myClub(email, id, false);
    const { deletePitch } = await import("@/lib/registry");
    await deletePitch(id, str(form, "pitch", 90), email, runsClub(mine.role));
  }, [`/clubs/${id}`]);
}

/** Calls an investment committee meeting: a day, a title and the agenda, a line an item ("MSFT: buy for the club book" ties it to the library's pitch on MSFT); the owner and officers. */
export async function createMeetingAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const day = str(form, "day", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new SyncError("Give the meeting's day.", "club meeting day");
    const kind = str(form, "kind") === "earnings" ? "earnings" : "committee";
    const symbol = str(form, "symbol", 12).toUpperCase() || null;
    if (kind === "earnings" && (!symbol || !TICKER.test(symbol))) throw new SyncError("An earnings night reads one company's results: type its ticker.", "club earnings ticker");
    const title = str(form, "title", 120) || (kind === "earnings" ? `Earnings night: ${symbol}` : "Investment committee");
    const { clubPitches, createMeeting } = await import("@/lib/registry");
    const agenda = str(form, "agenda", 4000) || (kind === "earnings" ? `${symbol}: what the results change for the case\n${symbol}: hold, add or trim in the club book` : "");
    const items = agendaFrom(agenda, await clubPitches(id, email));
    if (!items.length) throw new SyncError("Write the agenda: one item a line.", "club meeting agenda");
    const now = new Date().toISOString();
    await createMeeting({ id: meetingIdFrom(id, day, now), clubId: id, day, title, items, minutes: null, createdAt: now, kind, symbol: kind === "earnings" ? symbol : null });
  }, [`/clubs/${id}`]);
}

/** One member's vote on an item; any member of the club, until the minutes are written. */
export async function voteAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    if (mentorsOnly((await myClub(email, id, false)).role)) throw new SyncError("Alumni mentors read and review; the club's members vote.", "club alumnus votes");
    const vote = str(form, "vote", 10);
    if (!(VOTES as readonly string[]).includes(vote)) throw new SyncError("Choose for, against or abstain.", "club vote");
    const { castVote } = await import("@/lib/registry");
    await castVote(id, str(form, "meeting", 90), str(form, "item", 4), email, vote as Vote);
  }, [`/clubs/${id}`]);
}

/** Writes a meeting's minutes, which closes its votes; the owner and officers. */
export async function minutesAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const { keepMinutes } = await import("@/lib/registry");
    await keepMinutes(id, str(form, "meeting", 90), str(form, "minutes", 6000) || null);
  }, [`/clubs/${id}`]);
}

export async function deleteMeetingAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const { deleteMeeting } = await import("@/lib/registry");
    await deleteMeeting(id, str(form, "meeting", 90));
  }, [`/clubs/${id}`]);
}

/** Deletes the records kept on the person's sign-in from clubs they left; their current entries stay with their clubs. */
export async function forgetRecordsAction(): Promise<ClubState> {
  return guarded(async (email) => {
    const { forgetClubRecords } = await import("@/lib/registry");
    await forgetClubRecords(email);
  });
}

// ---------------------------------------------------------------------------
// Twenty more ways (Hamza, 9 Nov 2026)

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Challenges another club, by its id, to a term on the same rules; the owner and officers. */
export async function challengeAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    const mine = await myClub(email, id, true);
    const to = str(form, "to", 40).toLowerCase();
    if (!CLUB_ID.test(to) || to === id) throw new SyncError("Type the other club's id, as its officers see it on their Competitions tab.", "club challenge to");
    const { clubName, createChallenge } = await import("@/lib/registry");
    const toName = await clubName(to);
    if (!toName) throw new SyncError("No club has that id.", "club challenge unknown");
    const name = str(form, "name", 80) || `${mine.club.name} against ${toName}`.slice(0, 80);
    const starts = str(form, "starts", 10);
    const ends = str(form, "ends", 10);
    if (!ISO.test(starts) || !ISO.test(ends) || ends < starts || ends < localDay()) throw new SyncError("Give a first day and a last day after it, still to come.", "club challenge dates");
    const cap = str(form, "maxWeight", 6);
    const maxWeightPct = cap ? Number(cap) : null;
    if (maxWeightPct !== null && !(maxWeightPct > 0 && maxWeightPct <= 100)) throw new SyncError("A weight limit is a percent between 1 and 100, or none.", "club challenge cap");
    await createChallenge({ id: challengeIdFrom(id, to, starts), fromClub: id, fromName: mine.club.name, toClub: to, toName, name, starts, ends, cash: Number(str(form, "cash", 20).replace(/[,$\s]/g, "")) || DEFAULT_CASH, maxWeightPct, status: "pending", createdAt: new Date().toISOString() });
  }, [`/clubs/${id}`]);
}

/** Accepts or declines a challenge the club received; the owner and officers. */
export async function answerChallengeAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const { answerChallenge } = await import("@/lib/registry");
    await answerChallenge(id, str(form, "challenge", 90), str(form, "answer") === "accept");
  }, [`/clubs/${id}`]);
}

/** Posts a thesis bounty: a ticker, a question, a closing day; the owner and officers. */
export async function addBountyAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const symbol = str(form, "symbol", 12).toUpperCase();
    if (!TICKER.test(symbol)) throw new SyncError("Type a ticker, such as MSFT.", "club bounty ticker");
    const question = str(form, "question", 200);
    if (question.length < 2) throw new SyncError("Ask the question the pitch should answer.", "club bounty question");
    const closes = str(form, "closes", 10);
    if (!ISO.test(closes) || closes < localDay()) throw new SyncError("Give a closing day still to come.", "club bounty closes");
    const now = new Date().toISOString();
    const { addBounty } = await import("@/lib/registry");
    await addBounty({ id: pitchIdFrom(symbol, `bounty ${question}`, now), clubId: id, symbol, question, closes, createdAt: now, winner: null });
  }, [`/clubs/${id}`]);
}

export async function voteBountyAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    if (mentorsOnly((await myClub(email, id, false)).role)) throw new SyncError("Alumni mentors read and review; the club's members vote.", "club alumnus votes");
    const { voteBounty } = await import("@/lib/registry");
    await voteBounty(id, str(form, "bounty", 90), email, str(form, "pitch", 90));
  }, [`/clubs/${id}`]);
}

export async function closeBountyAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, true);
    const { closeBounty } = await import("@/lib/registry");
    await closeBounty(id, str(form, "bounty", 90));
  }, [`/clubs/${id}`]);
}

/** Reviews another member's pitch on its evidence, 1 to 5. */
export async function reviewPitchAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, false);
    const { reviewPitch } = await import("@/lib/registry");
    await reviewPitch(id, str(form, "pitch", 90), email, Number(str(form, "score", 2)), str(form, "note", 300) || null);
  }, [`/clubs/${id}`]);
}

/** Adds a ticker to the club's watchlist, with a level below or above that alerts every member; any member. */
export async function addClubWatchAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, false);
    const symbol = str(form, "symbol", 12).toUpperCase();
    if (!TICKER.test(symbol)) throw new SyncError("Type a ticker, such as MSFT.", "club watch ticker");
    const level = (k: string) => {
      const raw = str(form, k, 20).replace(/[,$\s]/g, "");
      if (!raw) return null;
      const n = Number(raw);
      if (!(n > 0)) throw new SyncError("A level is a price above zero, or blank.", "club watch level");
      return n;
    };
    const { clubMembers, keepClubWatch } = await import("@/lib/registry");
    const me = (await clubMembers(id, email, false)).find((m) => m.you);
    await keepClubWatch(id, { symbol, below: level("below"), above: level("above"), note: str(form, "note", 200) || null, addedBy: me?.name ?? "A member", createdAt: new Date().toISOString() });
  }, [`/clubs/${id}`]);
}

export async function dropClubWatchAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    await myClub(email, id, false);
    const { dropClubWatch } = await import("@/lib/registry");
    await dropClubWatch(id, str(form, "symbol", 12).toUpperCase());
  }, [`/clubs/${id}`]);
}

/** Takes the person off every club's alumni list. */
export async function forgetAlumniAction(): Promise<ClubState> {
  return guarded(async (email) => {
    const { forgetAlumni } = await import("@/lib/registry");
    await forgetAlumni(email);
  });
}

/**
 * The club's treasury (Hamza, 9 Nov 2026, the twenty further ways): the
 * member whose own book holds the club's money links it (an officer may
 * take it over from another); from it the app publishes the weights in
 * percent and the trades by day and side alone, refreshed when they open
 * the app. `off` unlinks it.
 */
export async function treasuryAction(_prev: ClubState, form: FormData): Promise<ClubState> {
  const id = str(form, "id", 40);
  return guarded(async (email) => {
    const mine = await myClub(email, id, false);
    const { linkTreasury, clubTreasury } = await import("@/lib/registry");
    if (str(form, "off") === "yes") {
      const t = await clubTreasury(id, email);
      if (!runsClub(mine.role) && !t?.mine) throw new SyncError("Only the treasurer or an officer can unlink the treasury.", "club treasury unlink");
      await linkTreasury(id, email, false);
      return;
    }
    if (mentorsOnly(mine.role)) throw new SyncError("An alumni mentor cannot hold the club's treasury.", "club treasury alumnus");
    const had = await clubTreasury(id, email);
    if (had && !had.mine && !runsClub(mine.role)) throw new SyncError("Another member holds the treasury; an officer can hand it to you.", "club treasury taken");
    await linkTreasury(id, email, true);
    const [{ getWorkspace }, { publishClubAndFamily }] = await Promise.all([import("@/lib/workspace"), import("@/lib/community-run")]);
    await publishClubAndFamily(await getWorkspace(), email, localDay()).catch(() => console.error("[clubs] treasury not published"));
  }, [`/clubs/${id}`]);
}
