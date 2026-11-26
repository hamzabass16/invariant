/**
 * check:community: the Community screen (Hamza, 18 Oct 2026) shares only
 * what lib/community.ts says, follows are a preference, the registry keeps
 * the card and nothing else, the legal pages say so, and the demo's people
 * are fictional.
 */
import { readFileSync } from "node:fs";

import { RECORD_MIN_DAYS, trackRecordFrom, ageWords, cardChanges, cardChangeSchema, CHANGE_NOTICE_DAYS, communityFeed, hueOf, initialsOf, matchesSearch, topHoldings, COMMUNITY_PREFIX, communityFileSchema, communityIndex, INDEX_MIN_HOLDERS, communityNotices, communityProfileSchema, FORBIDDEN_KEYS, handleFrom, handleProblem, keysOf, MAX_FOLLOWING, profileFrom, refreshedCard, sameCard, sharedTheses, splitFollowing, summaryOf, WEIGHT_CHANGE_PTS, weightInputsOf, withFollowing } from "../lib/community";
import { POOL_MIN_PEOPLE, pooledBenchmarks, streakWeeks, withStreak, type TrackRecord } from "../lib/community";
import { agendaFrom, boardRecords, LEAGUE_MIN_ENTRIES, leagueTable, libraryByTicker, outcomeOf, recordSummary, type ClubRecord, type LeagueRow, type Pitch } from "../lib/clubs";
import { canonicalThesis, fingerprintOf, JOURNAL_VERSION, journalFingerprint, RECEIPT_VERSION, withReceipts, type JournalEntry } from "../lib/receipts";
import { alumniByYear, bountyWinner, challengeIdFrom, challengeResult, CLUB_ROLES, CLUB_WATCH_PREFIX, clubWatchNotices, gradeOf, graduationSteps, judgedTrades, picksScorecard, reviewSummary } from "../lib/clubs";
import { BADGE_MIN_DAYS, badgeOf, sharedRulesOf } from "../lib/community";
import { heldInCommon, householdView, MAX_HOUSEHOLD } from "../lib/households";
import { adoptListing, listingFrom, listingProblem, marketOrder } from "../lib/marketplace";
import { annualReport, donationFrom, holdingBand, isoWeek, OPEN_MIN_PEOPLE, openData, type Donation } from "../lib/open-data";
import { adoptMethodology, LIBRARY } from "../lib/library";
import { closeBefore, closeOn, clubIdFrom, clubsSampleSchema, driveFolderId, folderEmbedUrl, holdingsOf, inviteCodeFrom, INVITE_LENGTH, leaderboard, normalInvite, runsClub, shareList, stageOf, valueOf, withTrade, type Competition, type Trade } from "../lib/clubs";
import { methodologyDiff, methodologyFingerprint, versionEntry, versionsOf, diffText } from "../lib/methodology-versions";
import { shadowCompare } from "../lib/shadow";
import { callFrom, callHolds } from "../lib/public-calls";
import { badgeSvg, badgeSnippets } from "../lib/badge";
import { askProblem, offerProblem } from "../lib/mentors";
import { packFrom, packListingProblem, packOf, PACK_MAX_RULES } from "../lib/marketplace";
import { CLUB_CALIBRATION_DAYS, COURSE_PACK, courseGrades, clubCalibration, FINALISTS, itemSide, mentorsOnly, pickFund, pitchValuationSchema, seasonOf, seasonTable, treasuryFrom, votesAndTrades } from "../lib/clubs";
import { awardCardOf, awardsOf, CSV_HEADER, openDataCsv } from "../lib/open-data";
import { familyGrid, familyRules } from "../lib/households";
import { RULE_PACKS, withPack } from "../lib/rule-packs";
import { bookSchema } from "../lib/holdings";
import { libraryEntry } from "../lib/library";
import { SCREEN_IDS, SCREENS, SLOTS } from "../lib/ontology";
import { DEFAULT_PREFERENCES, preferencesSchema } from "../lib/preferences";
import { EMPTY_THESES, type ThesesFile } from "../lib/theses";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? `\n     ${detail}` : ""}`);
}
const read = (f: string) => readFileSync(f, "utf8");

// --- Handles ---------------------------------------------------------------
check("a handle is made from what was typed: lower-case, dashes, 24 at most", handleFrom("Quiet Compounder!") === "quiet-compounder" && handleFrom("  Théo 2 ") === "th-o-2" && handleFrom("x".repeat(40)).length === 24 && handleFrom("---") === "");
check("a handle problem is a sentence; a kept word is refused", handleProblem("a") !== null && handleProblem("Quiet") !== null && handleProblem("admin") !== null && handleProblem("quiet-compounder") === null);

// --- The profile ------------------------------------------------------------
const theses: ThesesFile = {
  ...EMPTY_THESES,
  bySymbol: {
    MA: { text: "A toll on every card payment.", pillars: [{ id: "p1", name: "Volume", text: "Grows 10%.", test: { field: "revenue_growth_pct", is: "gte", value: 10 } }], pathway: null, watch: ["Regulation"], dcf: { basis: "cash_flow" } as never, valuation: { method: "pe" } as never, evidence: [{ id: "e1", at: "2026-10-01", source: "Secret note", kind: "note", summary: "Private.", changes: null, via: "you" }], figures: [], since: null, updatedAt: "2026-10-01T00:00:00.000Z" },
    EMPTY: { text: "", pillars: [], pathway: null, watch: [], dcf: null, valuation: null, evidence: [], figures: [], since: null, updatedAt: "2026-10-01T00:00:00.000Z" },
  },
  markets: [{ id: "rates", title: "Rates", text: "Higher.", pillars: [{ id: "m1", name: "Ten-year", text: "", test: { field: "US10Y", is: "gte", value: 4 } }], watch: [], evidence: [{ id: "e2", at: "2026-10-01", source: "Private", kind: "document", summary: "x", changes: null, via: "claude" }], figures: [], basket: [], since: null, updatedAt: "2026-10-02T00:00:00.000Z" }],
};
const weights = [
  { symbol: "MA", name: "Mastercard", weight: 12.3456, classLabel: "Compounder" },
  { symbol: "ASML", name: "ASML", weight: 11, classLabel: null },
  { symbol: "ZERO", name: "Nothing", weight: 0, classLabel: null },
];
const p = profileFrom({ handle: "quiet-compounder", name: "Ines", about: " Ten businesses. ", methodology: "Compounders", theses, weights, asOf: "2026-10-09", sharing: { theses: true, weights: true }, now: "2026-10-10T07:30:00.000Z" });
check("the profile carries the theses' words and tests and the weights in percent, rounded, by weight, zero weights left out, the empty thesis left out", p.stocks.length === 1 && p.stocks[0].symbol === "MA" && p.stocks[0].pillars[0].test?.field === "revenue_growth_pct" && p.markets.length === 1 && p.weights.map((w) => `${w.symbol}:${w.weightPct}`).join(",") === "MA:12.35,ASML:11" && p.about === "Ten businesses." && p.asOf === "2026-10-09" && p.weights[0].classLabel === "Compounder" && p.weights[1].classLabel === null);
check("nothing private passes: no evidence, DCF, valuation, value, amount or account anywhere in the profile", ![...keysOf(p)].some((k) => FORBIDDEN_KEYS.test(k)) && !JSON.stringify(p).includes("Secret") && !JSON.stringify(p).includes("Private"));
check("the schema itself has no key for an amount, an account or a token", ![...keysOf(communityProfileSchema.parse(p))].some((k) => FORBIDDEN_KEYS.test(k)) && !/value:|amount|account|email|token/.test(read("lib/community.ts").split("export const communityProfileSchema")[1].split("export type CommunityProfile")[0].replace(/weightPct|\/\*\*[^*]*\*\//g, "")));
const onlyWeights = profileFrom({ handle: "mara", name: "", about: null, methodology: null, theses, weights, asOf: "2026-10-09", sharing: { theses: false, weights: true }, now: "2026-10-10T07:30:00.000Z" });
check("sharing the weights alone leaves the theses out, and a blank name falls back to the handle; the theses alone leave the weights and the as-of out", onlyWeights.stocks.length === 0 && onlyWeights.markets.length === 0 && onlyWeights.name === "mara" && profileFrom({ handle: "theo", name: "Theo", about: null, methodology: null, theses, weights, asOf: "2026-10-09", sharing: { theses: true, weights: false }, now: "2026-10-10T07:30:00.000Z" }).weights.length === 0 && profileFrom({ handle: "theo", name: "Theo", about: null, methodology: null, theses, weights, asOf: "2026-10-09", sharing: { theses: true, weights: false }, now: "2026-10-10T07:30:00.000Z" }).asOf === null);
const refused = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "other";
  }
};
check("a bad handle and sharing nothing are refused with a sentence", /handle/.test(refused(() => profileFrom({ handle: "A", name: "x", about: null, methodology: null, theses, weights, asOf: null, sharing: { theses: true, weights: true }, now: "" })) ?? "") && /Choose what to share/.test(refused(() => profileFrom({ handle: "ok-handle", name: "x", about: null, methodology: null, theses, weights, asOf: null, sharing: { theses: false, weights: false }, now: "" })) ?? ""));
check("the shared theses are sorted by symbol and keep the words alone", sharedTheses(theses).stocks.every((t) => !("evidence" in t) && !("dcf" in t)) && sharedTheses(null).stocks.length === 0 && sharedTheses(null).markets.length === 0);
const sum = summaryOf(p);
check("a summary counts what is shared", sum.stocks === 1 && sum.markets === 1 && sum.weights === 2 && sum.handle === "quiet-compounder");

// --- The card kept in step (Hamza, 19 Oct 2026) ----------------------------------
const later = "2026-10-19T09:00:00.000Z";
check("a card rebuilt from the same files is the same card, whatever its dates, and is not written", sameCard(p, { ...p, updatedAt: later, changed: { at: later, theses: [], weights: true, moves: [] } }) && refreshedCard(p, { ...p, updatedAt: later }, later) === null);
const drift = profileFrom({ handle: "quiet-compounder", name: "Ines", about: " Ten businesses. ", methodology: "Compounders", theses, weights: weights.map((w) => (w.symbol === "MA" ? { ...w, weight: 12.9 } : w)), asOf: "2026-10-18", sharing: { theses: true, weights: true }, now: later });
const drifted = refreshedCard(p, drift, later);
check("a day's drift under a point refreshes the weights and the as-of but tells no follower", drifted !== null && drifted.weights[0].weightPct === 12.9 && drifted.asOf === "2026-10-18" && drifted.updatedAt === later && drifted.changed === null && cardChanges(p, drift) === null);
const reworded: ThesesFile = { ...theses, bySymbol: { ...theses.bySymbol, MA: { ...theses.bySymbol.MA, text: "A toll on every card payment, and a growing one.", updatedAt: later }, ASML: { ...theses.bySymbol.MA, text: "The only EUV.", pillars: [], watch: [] } } };
const moved = profileFrom({ handle: "quiet-compounder", name: "Ines", about: "Ten businesses.", methodology: "Compounders", theses: reworded, weights: [...weights.filter((w) => w.symbol !== "ASML"), { symbol: "ASML", name: "ASML", weight: 11 + WEIGHT_CHANGE_PTS, classLabel: null }], asOf: "2026-10-18", sharing: { theses: true, weights: true }, now: later });
const change = cardChanges(p, moved);
check("a reworded thesis, a new one and a weight that moved a point are the change followers are told of, by symbol", change !== null && change.theses.join() === "ASML,MA" && change.weights === true && refreshedCard(p, moved, later)?.changed?.at === later);
const noteOnly = profileFrom({ handle: "quiet-compounder", name: "Ines", about: "Ten businesses.", methodology: "Compounders", theses: { ...theses, bySymbol: { ...theses.bySymbol, MA: { ...theses.bySymbol.MA, evidence: [], updatedAt: later } } }, weights, asOf: "2026-10-09", sharing: { theses: true, weights: true }, now: later });
check("a note added to a thesis, or a holding removed and the rest unchanged, counts as it should: the note is no change, the holding gone is", cardChanges(p, noteOnly) === null && cardChanges(p, { ...p, weights: p.weights.slice(1) })?.weights === true && cardChanges(p, { ...p, markets: [] })?.theses.join() === "Rates");
const withChange = refreshedCard(p, moved, later)!;
check("the change record carries symbols, titles, a flag and the weights that moved in percent before and after (Hamza, 6 Nov 2026), never an amount, and the schema reads a card kept before it as unchanged", ![...keysOf(withChange)].some((k) => FORBIDDEN_KEYS.test(k)) && !/\d\.\d/.test(JSON.stringify({ ...withChange.changed, at: "", moves: [] })) && JSON.stringify(withChange.changed?.moves) === JSON.stringify([{ symbol: "ASML", from: 11, to: 12 }]) && cardChangeSchema.parse({ at: "x", theses: [], weights: true }).moves.length === 0 && communityProfileSchema.parse({ ...p, changed: undefined }).changed === null && weightInputsOf(p).map((w) => `${w.symbol}:${w.weight}`).join() === "MA:12.35,ASML:11");
const notices = communityNotices([withChange, { ...withChange, handle: "theo", changed: { at: "2026-10-01T00:00:00.000Z", theses: ["X"], weights: false, moves: [] } }, { ...withChange, handle: "mara" }], ["quiet-compounder", "theo"], "2026-10-19");
check("a follower is told once per card and day, within the week, of the theses by symbol and of the weights; an old change and a card not followed make none", notices.length === 1 && notices[0].key === `${COMMUNITY_PREFIX}quiet-compounder:2026-10-19` && /Ines changed their theses and weights/.test(notices[0].title) && /ASML, MA/.test(notices[0].detail) && notices[0].href === "/community/quiet-compounder" && !/\d\.\d/.test(notices[0].detail) && communityNotices([withChange], ["quiet-compounder"], `2026-10-${19 + CHANGE_NOTICE_DAYS}`).length === 0 && communityNotices([withChange], ["quiet-compounder"], "2026-10-25").length === 1);
const run = read("lib/community-run.ts");
check("the card is rebuilt from the vault through profileFrom and replaced only when it differs, kept weights standing in for a book that cannot be read; every save that can change it, the connector's write, the morning and evening runs and opening the app call it", /refreshedCard\(prev, (await sealedCard\()?cardFor/.test(run) && /weightInputsOf\(prev\)/.test(run) && /if \(!next\) return "unchanged"/.test(run) && /republishAfter\(v, await requireOperator\(\)\)/.test(read("lib/workspace.ts").split("export async function saveTheses")[1]) && /republishAfter\(v, (await requireOperator\(\)|operator)\)/.test(read("lib/workspace.ts").split("export async function saveBook")[1].split("export async function saveRecords")[0]) && /republishQuietly\(vault, email, now\)/.test(read("lib/theses-run.ts")) && /republishQuietly\(vault, e\.email, now\)/.test(read("lib/daily-sync.ts")) && /republishQuietly\(vault, e\.email, now\)/.test(read("lib/market-recap-run.ts")) && /catchUpCommunity\(vault, following, at\)/.test(read("lib/catch-up.ts")));
check("the followed cards' changes are alerts: laid on Notifications when the page is read, into the file on opening the app and at the twice-daily check, which emails them; a registry that cannot be read keeps them as they were", /followedNotices\(/.test(read("lib/notifications-run.ts")) && /screenAlerts\(ws, today\)/.test(read("app/(app)/notifications/page.tsx")) && /community \? \[\] : \[COMMUNITY_PREFIX\]/.test(read("lib/screen-data.ts")) && /followedNotices\(preferences\?\.following/.test(read("lib/alerts-run.ts")) && /reconcilePrefix\(prev, COMMUNITY_PREFIX/.test(run) && /return null;/.test(run.split("export async function followedNotices")[1]));

// --- The feed, after Blossom (Hamza, 6 Nov 2026) -----------------------------
{
  const quiet = { ...withChange, handle: "quiet-two", name: "Quiet Two", stocks: [], markets: [], changed: null, updatedAt: "2026-10-01T00:00:00.000Z" };
  const feed = communityFeed([withChange, quiet]);
  check("the feed lists each shared thesis, a card's weight moves and a card with neither as itself, newest first, each opening the person's page", feed.some((i) => i.kind === "thesis" && i.symbol === "ASML" && i.href === "/community/quiet-compounder#thesis-ASML") && feed.some((i) => i.kind === "moves" && i.moves[0]?.symbol === "ASML") && feed.some((i) => i.kind === "card" && i.handle === "quiet-two") && !feed.some((i) => i.kind === "card" && i.handle === "quiet-compounder") && feed.every((x, k) => k === 0 || feed[k - 1].at >= x.at), JSON.stringify(feed.map((i) => [i.kind, i.handle, i.at])));
  const ma = communityFeed([withChange, quiet], "MA");
  check("a search on a ticker keeps the items about it, a search on words the people it names", ma.length > 0 && ma.every((i) => i.kind !== "thesis" || i.symbol === "MA") && matchesSearch(withChange, "ines") && matchesSearch(withChange, "$asml") && !matchesSearch(withChange, "nobody"), JSON.stringify(ma.map((i) => [i.kind, i.handle])));
  check("a feed item's chips are tickers with their share of the book in percent, never an amount", feed.every((i) => i.chips.every((c) => Object.keys(c).join() === "symbol,weightPct")) && ![...keysOf(feed)].some((k) => FORBIDDEN_KEYS.test(k)) && topHoldings(withChange, 1)[0].symbol === withChange.weights.slice().sort((a, b) => b.weightPct - a.weightPct)[0].symbol);
  check("a feed says when as Blossom does, and each person keeps one avatar", ageWords("2026-11-06T10:00:00Z", "2026-11-06") === "Today" && ageWords("2026-11-04T10:00:00Z", "2026-11-06") === "2d" && ageWords("2026-09-01T10:00:00Z", "2026-11-06") === "2026-09-01" && initialsOf("Ines Duarte", "x") === "ID" && initialsOf("", "quiet") === "QU" && hueOf("quiet", 7) === hueOf("quiet", 7));
  const page = read("app/(app)/community/page.tsx");
  check("Community lays the feed beside Most held and People, with a search and For you or Following", /communityFeed\(/.test(page) && /Most held/.test(page) && /PersonCard/.test(page) && /role="search"/.test(page) && /For you/.test(page));
}

// --- Following ---------------------------------------------------------------
const split = splitFollowing([sum, { ...sum, handle: "theo", updatedAt: "2026-10-11T00:00:00.000Z" }, { ...sum, handle: "mara", updatedAt: "2026-10-12T00:00:00.000Z" }], ["theo", "gone-one"]);
check("the followed come first in the order followed, the rest newest first, a handle no longer shared is named", split.followed.map((x) => x.handle).join() === "theo" && split.others.map((x) => x.handle).join() === "mara,quiet-compounder" && split.gone.join() === "gone-one");
check("following adds once, unfollowing removes, a bad handle changes nothing, the list stays within the limit", withFollowing(["a1"], "theo", true).join() === "a1,theo" && withFollowing(["a1", "theo"], "theo", true).join() === "a1,theo" && withFollowing(["a1", "theo"], "theo", false).join() === "a1" && withFollowing(["a1"], "Bad Handle", true).join() === "a1" && withFollowing(Array.from({ length: MAX_FOLLOWING }, (_, i) => `h${i}`), "new", true).length === MAX_FOLLOWING);
check("the following list is a preference that files written before it read as empty", preferencesSchema.parse({ ...DEFAULT_PREFERENCES, following: undefined }).following.length === 0 && DEFAULT_PREFERENCES.following.length === 0);

// --- The screen, the registry, the pages, the legal pages, the demo ----------
check("Community is a screen after Theses with its slots, the index and the pooled figures among them, a nav icon and the two pages", SCREEN_IDS.indexOf("community") === SCREEN_IDS.indexOf("theses") + 1 && SCREENS.community.href === "/community" && SCREENS.community.slots.join() === "community_share,community_card_link,community_judgement,community_badge,community_mentors,public_calls,community_family,family_rules,open_research,annual_awards,community_index,community_pooled,community_following,community_people,community_profile" && SCREENS.community.slots.every((s) => s in SLOTS) && /community: Users/.test(read("components/app/nav-items.ts")) && /communityFor\(ws\)/.test(read("app/(app)/community/page.tsx")) && /<Donut/.test(read("components/community/profile-body.tsx")) && /<ProfileBody/.test(read("app/(app)/community/[handle]/page.tsx")) && /<FollowButton/.test(read("app/(app)/community/[handle]/page.tsx")));
const registry = read("lib/registry.ts");
check("the registry keeps the card in community_profiles under the sign-in with the handle unique, reads it back through the schema, and deletes it on stop; the address behind a handle is never selected", /create table if not exists community_profiles/.test(registry) && /handle text not null unique/.test(registry) && /export async function shareProfile/.test(registry) && /export async function stopSharing/.test(registry) && /delete from community_profiles where email/.test(registry) && /communityProfileSchema\.safeParse/.test(registry) && !/select email, handle, profile/.test(registry) && /select handle, profile, published_at, updated_at from community_profiles where handle/.test(registry));
const actions = read("app/(app)/community/actions.ts");
check("sharing builds the card from the person's own files through profileFrom, refuses in the demo, and following is a preference saved through savePreferences", /profileFrom\(/.test(actions) && /shareProfile\(ws\.operator\.email, (await sealedCard\()?profile\)/.test(actions) && /ws\.mode === "demo"\) throw/.test(actions) && /withFollowing\(/.test(actions) && /savePreferences\(/.test(actions) && !/value:/.test(actions.split("const weights")[1].split(";")[0]));
check("the privacy and terms pages say what the community keeps and shows, that the card follows the files and tells followers, and that stopping deletes it", /share with the community/.test(read("app/privacy/page.tsx")) && /Stop sharing deletes it at once/.test(read("app/privacy/page.tsx")) && /Stop sharing on Community deletes/.test(read("app/privacy/page.tsx")) && /kept in step/.test(read("app/privacy/page.tsx")) && /people who follow you/.test(read("app/privacy/page.tsx")) && /title: "The community"/.test(read("app/terms/page.tsx")) && /follows your theses and weights/.test(read("app/terms/page.tsx")));
const sample = communityFileSchema.parse(JSON.parse(read("data/samples/community.json")));
check("the demo's people are fictional and say so, share nothing private, and the demo shares nothing of its own", sample.profiles.length >= 2 && sample.profiles.every((x) => /fictional/i.test(x.about ?? "") && ![...keysOf(x)].some((k) => FORBIDDEN_KEYS.test(k))) && /readSample\("community.json"/.test(read("lib/workspace.ts")) && /mine: null/.test(read("lib/workspace.ts")));
check("lib/community.ts imports nothing server-only", !/server-only|@\/lib\/(vault|workspace|registry)|next\//.test(read("lib/community.ts")));

// --- The community index (Hamza, 23 Oct 2026) --------------------------------
{
  const card = (weights: [string, number][], share = true) => ({ sharing: { theses: true, weights: share }, weights: weights.map(([symbol, weightPct]) => ({ symbol, name: symbol, weightPct, className: null })) }) as never;
  const five = [card([["AAA", 10], ["BBB", 5]]), card([["AAA", 20]]), card([["aaa", 30], ["BBB", 5]]), card([["AAA", 10]]), card([["AAA", 30], ["CCC", 50]]), card([["AAA", 90]], false), card([])];
  const ix = communityIndex(five);
  check("index: only the people sharing their weights count, and only companies at least five of them hold are listed", ix.people === 5 && ix.rows.length === 1 && ix.rows[0].symbol === "AAA" && ix.below === 2, JSON.stringify(ix));
  check("index: how many hold it, its average weight among them, and its weight with each person an equal part", ix.rows[0].holders === 5 && ix.rows[0].avgWeightPct === 20 && ix.rows[0].indexWeightPct === 20 && ix.rows[0].holdersPct === 100);
  check("index: a row carries no handle, name of a person or amount", ix.rows.every((r) => Object.keys(r).sort().join(",") === "avgWeightPct,holders,holdersPct,indexWeightPct,name,symbol"));
  check("index: with fewer than five holders of anything, nothing is listed", communityIndex(five.slice(0, 4)).rows.length === 0 && INDEX_MIN_HOLDERS === 5);
  const sample = communityFileSchema.safeParse(JSON.parse(readFileSync("data/samples/community.json", "utf8")));
  check("index: the demo's fictional people hold enough in common to draw it", sample.success && communityIndex(sample.data.profiles).rows.length >= 3);
  check("index: a slot of Community", SCREENS.community.slots.includes("community_index") && !!SLOTS.community_index);
}


// --- Track record (Hamza, 9 Nov 2026: the moat's verified track records) -----
{
  const idx = { dates: ["2026-01-02", "2026-03-31", "2026-06-30"], index: [100, 104, 112] };
  const spy = [{ date: "2026-01-02", value: 500 }, { date: "2026-06-29", value: 540 }];
  const r = trackRecordFrom(idx, spy, { score: 83, measured: 12 });
  check("record: the book's time-weighted return since its first day, SPY's over the same days (the close on or before each end), the rules kept", !!r && r.twrPct === 12 && r.spyPct === 8 && r.since === "2026-01-02" && r.through === "2026-06-30" && r.rulesKeptPct === 83 && r.rulesMeasured === 12, JSON.stringify(r));
  check("record: under a month says too little and is not made; no SPY closes leave SPY unread, never zero", trackRecordFrom({ dates: ["2026-06-01", "2026-06-20"], index: [100, 101] }, spy, null) === null && RECORD_MIN_DAYS === 30 && trackRecordFrom(idx, null, null)?.spyPct === null);
  const withRecord = profileFrom({ handle: "quiet-compounder", name: "Q", about: null, methodology: null, theses: null, weights: [], asOf: null, sharing: { theses: false, weights: false, record: true }, now: "2026-11-09T00:00:00.000Z", record: r });
  const without = profileFrom({ handle: "quiet-compounder", name: "Q", about: null, methodology: null, theses: null, weights: [{ symbol: "MA", name: null, weight: 10, classLabel: null }], asOf: null, sharing: { theses: false, weights: true }, now: "2026-11-09T00:00:00.000Z", record: r });
  check("record: shared only when ticked, and a card holding it carries no amount", withRecord.record?.twrPct === 12 && without.record === null && without.sharing.record === false && ![...keysOf(withRecord)].some((k) => FORBIDDEN_KEYS.test(k)));
  check("record: a card kept before it existed reads as sharing none", communityProfileSchema.parse({ ...without, sharing: { theses: false, weights: true }, record: undefined }).record === null);
  check("record: built by the app from the statement's index and the methodology's checks, on sharing and on every refresh", /recordFor\(ws, data\)/.test(read("app/(app)/community/actions.ts")) && /recordFor\(ws, data\)/.test(read("lib/community-run.ts")) && /navIndex\(book\)/.test(read("lib/community-run.ts")) && /resonanceOf\(/.test(read("lib/community-run.ts")));
}

// --- Clubs (Hamza, 9 Nov 2026: a university club the first) ------------------
{
  check("clubs: a club's id comes from its name", clubIdFrom("1901 Student Fund") === "1901-student-fund" && clubIdFrom("!!") === "club-new");
  const fid = "1ExampleFolderIdForTheChecks0000";
  check("clubs: a Drive folder is read from its address, a /u/0/ address, a shared link or the id alone; anything else is refused", driveFolderId(`https://drive.google.com/drive/folders/${fid}?usp=sharing`) === fid && driveFolderId(`https://drive.google.com/drive/u/0/folders/${fid}`) === fid && driveFolderId(`https://drive.google.com/open?id=${fid}`) === fid && driveFolderId(fid) === fid && driveFolderId(`https://evil.example.com/drive/folders/${fid}`) === null && driveFolderId(`http://drive.google.com/drive/folders/${fid}`) === null && driveFolderId("not a folder") === null);
  check("clubs: the material is Google's own view of the folder, never read by the app", folderEmbedUrl(fid).startsWith("https://drive.google.com/embeddedfolderview?id=") && !/googleapis|drive\/v3/.test(read("lib/clubs-run.ts")) && !/googleapis|drive\/v3/.test(read("app/(app)/clubs/[id]/page.tsx")));
  check("clubs: a join code is ten unambiguous letters and digits; what is typed is read without spaces or dashes", inviteCodeFrom(new Uint8Array(16).map((_, i) => i * 37)).length === INVITE_LENGTH && !/[01IO]/.test(inviteCodeFrom(new Uint8Array(16).map((_, i) => i * 37))) && normalInvite(" k7q2-m9xw ") === "K7Q2M9XW");
  check("clubs: only the owner and officers run a club", runsClub("owner") && runsClub("officer") && !runsClub("member") && !runsClub(null));
  check("clubs: the share list is the addresses the owner can see, nobody else's", shareList([{ name: "A", role: "owner", joinedAt: "", email: "a@x.com", you: true }, { name: "B", role: "member", joinedAt: "", email: null, you: false }, { name: "C", role: "member", joinedAt: "", email: "c@x.com", you: false }]) === "a@x.com, c@x.com");

  const comp: Competition = { id: "c-test-20261001", clubId: "c", name: "Test", starts: "2026-10-01", ends: "2026-12-18", cash: 10_000, maxWeightPct: 25, note: null, createdAt: "", course: null, challengeId: null };
  check("competitions: upcoming before the first day, open through the last, ended after", stageOf(comp, "2026-09-30") === "upcoming" && stageOf(comp, "2026-10-01") === "open" && stageOf(comp, "2026-12-18") === "open" && stageOf(comp, "2026-12-19") === "ended");
  const prices = new Map([["AAA", 100], ["BBB", 50]]);
  const b1 = withTrade(comp, [], { symbol: "aaa", side: "buy", shares: 20, reason: "Cheap" }, { day: "2026-10-02", price: 100 }, prices, "2026-10-03");
  check("competitions: a buy fills at the last close, upper-cased, with its reason", "trades" in b1 && b1.trades[0].symbol === "AAA" && b1.trades[0].price === 100 && b1.trades[0].day === "2026-10-02" && b1.trades[0].reason === "Cheap");
  const t1 = "trades" in b1 ? b1.trades : [];
  const over = withTrade(comp, t1, { symbol: "AAA", side: "buy", shares: 10, reason: null }, { day: "2026-10-02", price: 100 }, prices, "2026-10-03");
  check("competitions: a buy past the weight limit is refused with the weight it would reach", "error" in over && /30\.0%/.test(over.error) && /25%/.test(over.error), JSON.stringify(over));
  const noCash = withTrade({ ...comp, maxWeightPct: null }, t1, { symbol: "BBB", side: "buy", shares: 1000, reason: null }, { day: "2026-10-02", price: 50 }, prices, "2026-10-03");
  check("competitions: no margin: a buy past the cash left is refused", "error" in noCash && /No margin/.test(noCash.error));
  const short = withTrade(comp, t1, { symbol: "BBB", side: "sell", shares: 1, reason: null }, { day: "2026-10-02", price: 50 }, prices, "2026-10-03");
  check("competitions: no short: a sale of what is not held is refused", "error" in short && /No short/.test(short.error));
  const closed = withTrade(comp, t1, { symbol: "AAA", side: "sell", shares: 1, reason: null }, { day: "2026-12-18", price: 100 }, prices, "2026-12-20");
  const unread = withTrade(comp, t1, { symbol: "ZZZ", side: "buy", shares: 1, reason: null }, null, prices, "2026-10-03");
  check("competitions: no trade once it has ended, nor in a ticker with no close", "error" in closed && /ended/.test(closed.error) && "error" in unread && /no close/.test(unread.error));
  const sold = withTrade(comp, t1, { symbol: "AAA", side: "sell", shares: 5, reason: "Trim" }, { day: "2026-10-05", price: 120 }, prices, "2026-10-06");
  const after = "trades" in sold ? holdingsOf(sold.trades, comp.cash) : null;
  check("competitions: a sale returns cash at the close and keeps the average cost of what is left", !!after && after.positions[0].shares === 15 && after.positions[0].cost === 1500 && after.cash === 10_000 - 2000 + 600);
  const v = valueOf(t1, comp.cash, new Map([["AAA", 110]]));
  check("competitions: an entry at prices, its weights adding to the invested share", v.value === 8000 + 2200 && Math.abs(v.positions[0].weightPct - (2200 / 10200) * 100) < 1e-9 && valueOf(t1, comp.cash, new Map()).unpriced.join() === "AAA");
  const entries = [
    { name: "Up", you: false, trades: t1, updatedAt: "" },
    { name: "Cash", you: true, trades: [] as Trade[], updatedAt: "" },
  ];
  const board = leaderboard(comp, entries, new Map([["AAA", 150]]), { start: 500, now: 510 });
  check("competitions: the board ranks by return on the cash, SPY beside it in points", board.rows[0].name === "Up" && Math.abs(board.rows[0].returnPct - 10) < 1e-9 && board.spyPct !== null && Math.abs(board.spyPct - 2) < 1e-9 && Math.abs((board.rows[0].againstSpyPts ?? 0) - 8) < 1e-9 && board.rows[1].returnPct === 0 && board.rows[0].reasoned === 1);
  check("competitions: a board row names a member's chosen name, never an address", board.rows.every((r) => !Object.keys(r).some((k) => /mail|address/i.test(k))));
  const pts = [{ date: "2026-09-29", value: 1 }, { date: "2026-09-30", value: 2 }, { date: "2026-10-02", value: 3 }];
  check("competitions: the close on or before a day; SPY's start is the close before the first day", closeOn(pts, "2026-10-01")?.price === 2 && closeOn(pts, "2026-10-02")?.price === 3 && closeBefore(pts, "2026-10-01")?.price === 2 && closeOn([], "2026-10-01") === null);

  const sample = clubsSampleSchema.safeParse(JSON.parse(read("data/samples/clubs.json")));
  check("clubs: the demo's club is fictional: example.com addresses, a folder that is not a real one", sample.success && sample.data.clubs.every((c) => c.members.every((m) => !m.email || m.email.endsWith("@example.com")) && c.club.folderId?.startsWith("1Example")));
  if (sample.success) {
    const c = sample.data.clubs[0].competitions[0];
    const legal = c.entries.every((e) => {
      let kept: Trade[] = [];
      for (const t of e.trades) {
        const known = new Map<string, number>();
        for (const k of kept) known.set(k.symbol, t.symbol === k.symbol ? t.price : k.price);
        const out = withTrade(c.competition, kept, { symbol: t.symbol, side: t.side, shares: t.shares, reason: t.reason }, { day: t.day, price: t.price }, known, t.day);
        if ("error" in out) return false;
        kept = out.trades;
      }
      return true;
    });
    check("clubs: every trade in the demo's competition keeps its own rules", legal);
  }
  check("clubs: a screen of its own, with its slots, under Markets beside Community", SCREEN_IDS.indexOf("clubs") === SCREEN_IDS.indexOf("community") + 1 && SCREENS.clubs.href === "/clubs" && SCREENS.clubs.slots.every((s) => !!SLOTS[s]) && /"community", "clubs"/.test(read("components/app/nav-items.ts")));
  const reg = read("lib/registry.ts");
  check("clubs: the registry keeps the club, its members, its competitions and virtual entries, and deletes them with the club; a code is kept hashed to find and sealed to show", /create table if not exists clubs/.test(reg) && /club_members[\s\S]*on delete cascade/.test(reg) && /club_entries[\s\S]*on delete cascade/.test(reg) && /invite_hash/.test(reg) && /seal\(normalInvite/.test(reg));
  check("clubs: an address is read back only to whoever runs the club", /email: showAddresses \? r\.email : null/.test(reg) && /runs \? m\.email : null|email: runsClub\(role\) \? m\.email : null/.test(read("lib/clubs-run.ts")));
  check("clubs: joining is limited per person, so a code cannot be guessed", /allow\(limitKey\("club-join"/.test(read("app/(app)/clubs/actions.ts")));
  check("clubs: the privacy page says what a club keeps", /club/i.test(read("app/privacy/page.tsx")) && /virtual/i.test(read("app/privacy/page.tsx")));
}

// --- The moat, more of it (9 Nov 2026) ---------------------------------------
{
  const pitches: Pitch[] = [
    { id: "tsm-a-20261001", symbol: "TSM", title: "Nodes", body: "x", author: "A", you: false, createdAt: "2026-10-01T00:00:00Z" , bountyId: null, valuation: null },
    { id: "tsm-b-20261005", symbol: "TSM", title: "Counter", body: "y", author: "B", you: true, createdAt: "2026-10-05T00:00:00Z" , bountyId: null, valuation: null },
    { id: "ko-a-20261003", symbol: "KO", title: "Price", body: "z", author: "C", you: false, createdAt: "2026-10-03T00:00:00Z" , bountyId: null, valuation: null },
  ];
  const lib = libraryByTicker(pitches);
  check("library: by ticker, the newest pitch first and the tickers by their newest", lib[0].symbol === "TSM" && lib[0].pitches[0].id === "tsm-b-20261005" && lib[1].symbol === "KO");
  const agenda = agendaFrom("TSM: add at 8%\n\nElect officers\nko - keep watching", pitches);
  check("meetings: one item a line; a ticker line ties to the newest pitch on it", agenda.length === 3 && agenda[0].symbol === "TSM" && agenda[0].pitchId === "tsm-b-20261005" && agenda[1].symbol === null && agenda[1].pitchId === null && agenda[2].symbol === "KO" && agenda[2].pitchId === "ko-a-20261003");
  check("meetings: carried only with more for than against; none cast is no votes", outcomeOf({ for: 2, against: 1, abstain: 0, mine: null }) === "carried" && outcomeOf({ for: 1, against: 1, abstain: 3, mine: null }) === "not carried" && outcomeOf({ for: 0, against: 0, abstain: 0, mine: null }) === "no votes");
  const reg = read("lib/registry.ts");
  check("meetings: the votes are tallied for everyone and never read back by name", /club_votes/.test(reg) && !/select[^;]*voter[^;]*name/i.test(reg));

  const comp = { id: "c-1", clubId: "club-a", name: "Term", starts: "2026-10-01", ends: "2026-10-31", cash: 100000, maxWeightPct: 25, note: null, createdAt: "" } as unknown as Competition;
  const rows = [
    { name: "A", you: false, value: 110000, returnPct: 10, againstSpyPts: 8, holdings: 4, largestWeightPct: 25, trades: 4, reasoned: 4, unpriced: [] },
    { name: "B", you: true, value: 102000, returnPct: 2, againstSpyPts: 0, holdings: 3, largestWeightPct: 30, trades: 3, reasoned: 2, unpriced: [] },
    { name: "C", you: false, value: 99000, returnPct: -1, againstSpyPts: -3, holdings: 2, largestWeightPct: 50, trades: 2, reasoned: 0, unpriced: [] },
  ] as unknown as Parameters<typeof boardRecords>[1]["rows"];
  const kept = boardRecords(comp, { rows, spyPct: 2 }, "2026-10-31", "2026-11-05");
  check("league: a board is kept as the median and best in percent, final once ended, never a value", kept.summary.entries === 3 && kept.summary.medianReturnPct === 2 && kept.summary.bestReturnPct === 10 && kept.summary.medianAgainstSpyPts === 0 && kept.summary.final && !JSON.stringify(kept).includes("110000"));
  check("records: each entry's rank of how many and trades with a reason, by its club name", kept.results[0].name === "A" && kept.results[0].result.rank === 1 && kept.results[2].result.of === 3 && kept.results[1].result.reasoned === 2);
  const lr = (clubId: string, ends: string, entries: number, vs: number | null): LeagueRow => ({ clubId, club: clubId, about: null, competition: "x", starts: "2026-09-01", ends, summary: { asOf: ends, entries, medianReturnPct: 1, bestReturnPct: 2, spyPct: 1, medianAgainstSpyPts: vs, final: true } });
  const table = leagueTable([lr("a", "2026-10-01", 5, 1), lr("a", "2026-11-01", 4, -1), lr("b", "2026-11-01", 9, 2), lr("c", "2026-11-01", LEAGUE_MIN_ENTRIES - 1, 9)]);
  check("league: a club's newest competition with enough entries, by the median against SPY; too few entries is left off", table.length === 2 && table[0].clubId === "b" && table[1].clubId === "a" && table[1].summary.medianAgainstSpyPts === -1);
  const recs: ClubRecord[] = [
    { club: "A", competition: "x", competitionId: "c-1", starts: "2026-01-01", ends: "2026-02-01", result: { asOf: "2026-02-01", returnPct: 3, againstSpyPts: 1, rank: 1, of: 5, trades: 4, reasoned: 3 }, current: false },
    { club: "B", competition: "y", competitionId: "c-2", starts: "2026-03-01", ends: "2026-04-01", result: { asOf: "2026-04-01", returnPct: 1, againstSpyPts: -1, rank: 2, of: 2, trades: 6, reasoned: 6 }, current: true },
  ];
  const rs = recordSummary(recs);
  check("records: summed across clubs in percent and ranks; a podium counts only in a field of three or more", rs.competitions === 2 && rs.medianAgainstSpyPts === 0 && rs.reasonedPct === 90 && rs.podiums === 1);
  check("records: kept on leaving or a club's deletion, and forgotten on request", /keepRecords\(/.test(reg) && /delete from club_records where email/.test(reg));
  const sample = clubsSampleSchema.parse(JSON.parse(read("data/samples/clubs.json")));
  check("clubs: the demo carries a library, meetings, a league of fictional clubs and the visitor's record", sample.clubs[0].pitches.length > 0 && sample.clubs[0].meetings.length > 0 && leagueTable(sample.league).length >= 3 && sample.records.some((r) => !r.current));

  const rec = (o: Partial<TrackRecord>): TrackRecord => ({ since: "2026-01-01", through: "2026-03-01", twrPct: 5, spyPct: 4, rulesKeptPct: 90, rulesMeasured: 10, breaches: null, cleanSince: null, ...o });
  const s1 = withStreak(rec({}), 0, null, "2026-01-10", "2026-03-01");
  const s2 = withStreak(rec({}), 0, s1, null, "2026-03-08");
  const s3 = withStreak(rec({}), 2, s2, null, "2026-03-15");
  check("streak: clean since the last breach ended, carried forward, ended by a breach", s1.cleanSince === "2026-01-10" && s2.cleanSince === "2026-01-10" && s3.cleanSince === null && s3.breaches === 2 && streakWeeks(s1) === 7 && streakWeeks(s3) === 0 && streakWeeks(rec({})) === null);

  const pr = (family: "fundamentals" | "macro" | null, twr: number, record = true) => ({ family, record: rec({ twrPct: twr }), sharing: { theses: true, weights: true, record, listed: true, rules: false, judgement: false } });
  const pool = pooledBenchmarks([pr("fundamentals", 1), pr("fundamentals", 5), pr("fundamentals", 9), pr("macro", 2), pr("macro", 4), pr(null, 50), pr("fundamentals", 100, false)]);
  check(`pooled: a family counts only with ${POOL_MIN_PEOPLE} or more records shared, never one person`, pool.rows.length === 1 && pool.rows[0].family === "fundamentals" && pool.rows[0].people === 3 && pool.rows[0].medianTwrPct === 5 && pool.below === 1);

  const w = { subject: "MA", text: "A toll.", pathway: null, pillars: [{ name: "Volume", text: "Grows." }], watch: ["Regulation"] };
  const f = fingerprintOf(w);
  check("receipts: the fingerprint is SHA-256 of the version and the canonical words, the same each time", /^[a-f0-9]{64}$/.test(f) && f === fingerprintOf({ ...w, text: " A toll. " }) && canonicalThesis(w).startsWith("subject: MA\nthesis: A toll.") && RECEIPT_VERSION.length > 0);
  check("receipts: one character changed is another fingerprint", f !== fingerprintOf({ ...w, text: "A toll!" }) && f !== fingerprintOf({ ...w, watch: ["Regulators"] }));
  const card = communityProfileSchema.parse(JSON.parse(read("data/samples/community.json")).profiles[0]);
  const laid = withReceipts(card, new Map(card.stocks.map((t) => [fingerprintOf({ subject: t.symbol, ...t }), "2026-10-01T00:00:00.000Z"])));
  check("receipts: laid on each shared thesis from the registry's times; the registry keeps no words and no owner", laid.stocks.every((t) => t.receipt?.sealedAt === "2026-10-01T00:00:00.000Z") && /create table if not exists thesis_receipts \(\s*hash text primary key,\s*sealed_at/.test(reg));
  const demoCards = communityFileSchema.parse(JSON.parse(read("data/samples/community.json"))).profiles;
  check("receipts: the demo's receipts are the real fingerprints of its fictional words", demoCards.every((p) => p.stocks.every((t) => !t.receipt || t.receipt.hash === fingerprintOf({ subject: t.symbol, ...t }))) && demoCards.some((p) => p.stocks.some((t) => t.receipt)));
  check("pooled: the demo shows a family and leaves one under the floor", (() => { const p = pooledBenchmarks(demoCards); return p.rows.length >= 1 && p.below >= 1; })());

  const entry = LIBRARY[0];
  const adopted = adoptMethodology(entry);
  check("forks: a methodology adopted from the library names where it came from and who wrote it", adopted.lineage?.parent === entry.name && adopted.lineage?.source === "library");
  check("mentor view: a card can stay off the lists and still be read by its private link, hashed to find", /coalesce\(\(profile->'sharing'->>'listed'\)::boolean, true\)/.test(reg) && /link_hash/.test(reg) && /noindex|index: false/.test(read("app/card/[code]/page.tsx")));
  check("the moat's new slots are in the ontology", ["club_library", "club_meetings", "club_league", "club_records", "community_pooled", "community_card_link"].every((s) => !!SLOTS[s as keyof typeof SLOTS]) && ["club_library", "club_meetings", "club_league", "club_records"].every((s) => (SCREENS.clubs.slots as readonly string[]).includes(s)));
  check("the privacy page says what the new pieces keep", /receipt/i.test(read("app/privacy/page.tsx")) && /meeting/i.test(read("app/privacy/page.tsx")) && /league/i.test(read("app/privacy/page.tsx")));
}

// --- The twenty more ways (9 Nov 2026) ----------------------------------------
{
  const course: Competition = { id: "c-course-20261001", clubId: "c", name: "Course", starts: "2026-10-01", ends: "2026-12-18", cash: 10_000, maxWeightPct: 20, note: null, createdAt: "", course: { minHoldings: 5, reasons: true }, challengeId: null };
  const g = gradeOf(course, { trades: 4, reasoned: 4, holdings: 5, largestWeightPct: 19 });
  const g2 = gradeOf(course, { trades: 4, reasoned: 2, holdings: 2, largestWeightPct: 30 });
  check("course mode: a grade out of 100 from reasons, spread and the weight limit; none outside course mode", g?.score === 100 && g2 !== null && g2.score === 20 + 12 + 0 && gradeOf({ ...course, course: null }, { trades: 4, reasoned: 4, holdings: 5, largestWeightPct: 19 }) === null);
  const spy = [{ date: "2026-10-01", value: 100 }, { date: "2026-11-02", value: 105 }];
  const jt = judgedTrades([{ day: "2026-10-01", symbol: "AAA", side: "buy", shares: 1, price: 50, reason: "Cheap" }, { day: "2026-10-01", symbol: "BBB", side: "sell", shares: 1, price: 50, reason: "Dear" }, { day: "2026-10-01", symbol: "CCC", side: "buy", shares: 1, price: 50, reason: null }], new Map([["AAA", 60], ["BBB", 55]]), spy, "2026-11-02");
  check("competitions: a reasoned trade is judged against SPY since, a trade without a reason is not", jt.judged.length === 2 && jt.right === 1 && jt.share === 50);
  const sum = (m: number | null, entries = 3) => ({ asOf: "2026-11-02", entries, medianReturnPct: m, bestReturnPct: m, spyPct: 1, medianAgainstSpyPts: m === null ? null : m - 1, final: false });
  check("challenges: the club whose median member did better against SPY leads; none until both sides have three entries", challengeResult(sum(5), sum(3)).leader === "from" && challengeResult(sum(5), sum(3)).gapPts === 2 && challengeResult(sum(3), sum(3)).leader === "level" && challengeResult(sum(5, 2), sum(3)).leader === null && challengeIdFrom("a", "b", "2026-10-01") === "a-v-b-20261001");
  check("bounties: the most voted pitch wins, none without a vote", bountyWinner([{ id: "x", votes: 1 }, { id: "y", votes: 3 }]) === "y" && bountyWinner([{ id: "x", votes: 0 }]) === null);
  check("peer review: the average of 1 to 5 on the evidence, with the reader's own score", JSON.stringify(reviewSummary([{ score: 4, you: false }, { score: 5, you: true }, { score: 9, you: false }])) === JSON.stringify({ count: 2, average: 4.5, mine: 5 }));
  const watch = clubWatchNotices([{ club: { id: "c", name: "Club" }, items: [{ symbol: "AAA", below: 50, above: null, note: null, addedBy: "A", createdAt: "" }, { symbol: "BBB", below: null, above: 100, note: null, addedBy: "A", createdAt: "" }] }], new Map([["AAA", 49], ["BBB", 99]]), "2026-11-02");
  check("the club's watchlist: a close past a level is an alert for every member, keyed under its prefix", watch.length === 1 && watch[0].key === `${CLUB_WATCH_PREFIX}c:AAA:below` && watch[0].href === "/clubs/c?tab=watchlist");
  const picks = picksScorecard([{ id: "aaa-1", symbol: "AAA", title: "T", body: "", author: "A", you: false, createdAt: "2026-10-01T00:00:00Z", bountyId: null, valuation: null }], { AAA: [{ date: "2026-10-01", value: 50 }, { date: "2026-11-02", value: 60 }], SPY: spy }, "2026-11-02");
  check("how the picks did: each ticker's first pitch against SPY since the day it was written", Math.round(picks.rows[0]?.againstPts ?? 0) === 15 && picks.beat === 1 && picks.judged === 1);
  check("alumni: listed by the year they left, the latest first", alumniByYear([{ name: "B", joined: 2024, left: 2025, role: "member" }, { name: "A", joined: 2025, left: 2026, role: "officer" }]).map((y) => y.year).join() === "2026,2025");
  const steps = graduationSteps({ clubs: 1, ownBook: true, sharing: false, listed: false });
  check("the graduation path: club, own book, card, listing, each done or next", steps.length === 4 && steps.filter((x) => x.done).length === 2 && steps[3].href === "/methodology/market");
  check("the adviser: a faculty adviser runs the club alongside the owner and officers", runsClub("adviser") && (CLUB_ROLES as readonly string[]).includes("adviser"));

  const recB = (o: Partial<TrackRecord>): TrackRecord => ({ since: "2025-01-01", through: "2026-03-01", twrPct: 5, spyPct: 4, rulesKeptPct: 90, rulesMeasured: 10, breaches: 0, cleanSince: "2025-06-01", ...o });
  check("verified analyst: a year of record, twelve clean weeks and 80% of rules kept, else what is missing", badgeOf(recB({})).verified && !badgeOf(recB({ since: "2026-01-01" })).verified && badgeOf(recB({ rulesKeptPct: 70 })).missing.length === 1 && !badgeOf(null).verified && BADGE_MIN_DAYS === 365);
  check("the adviser handoff: a card shares the rules' words only when ticked", sharedRulesOf({ rules: [{ section: "3.1", text: "Cap", severity: "breach" }] }).length === 1 && communityProfileSchema.parse({ ...JSON.parse(read("data/samples/community.json")).profiles[0] }).sharing.rules === false);

  const entries: JournalEntry[] = [{ date: "2026-10-01", kind: "Trade", symbol: "AAA", title: "Bought", text: "Because  it is cheap.", outcome: null }];
  const jf = journalFingerprint(entries);
  check("the sealed journal: SHA-256 of the version and the entries, spaces run together, one word changed is another fingerprint", /^[a-f0-9]{64}$/.test(jf) && jf === journalFingerprint([{ ...entries[0], text: "Because it is cheap." }]) && jf !== journalFingerprint([{ ...entries[0], text: "Because it is dear." }]) && JOURNAL_VERSION.length > 0 && /maskMoney/.test(read("app/(app)/decisions/pdf/route.ts")) && /sealReceipts/.test(read("app/(app)/decisions/pdf/route.ts")));

  const lib = adoptMethodology(LIBRARY[0]);
  const m = { ...lib, adopted: "2026-10-01" };
  const listing = listingFrom(m, { id: "hcmp-test1234", credit: "A. Author", now: "2026-11-09T00:00:00.000Z" });
  const adoptedL = adoptListing(listing);
  check("marketplace: a confirmed methodology lists rules only, its document dropped; adopting it is a draft credited to its author", listingProblem(m) === null && listingProblem(lib) !== null && listingProblem(null) !== null && listing.methodology.source.fileId === null && adoptedL.adopted === null && adoptedL.lineage?.source === "market" && adoptedL.lineage?.credit === "A. Author");
  const byName = { ...m, classes: [{ ...m.classes[0], criteria: [{ field: "symbol" as const, is: "eq" as const, value: "AAA" }] }] };
  check("marketplace: a class that names a ticker cannot be listed", listingProblem(byName as typeof m) !== null);
  check("marketplace: the most adopted first", marketOrder([{ name: "a", adopters: 1, updatedAt: "2026-01-01" }, { name: "b", adopters: 5, updatedAt: "2025-01-01" }])[0].name === "b");
  check("marketplace: adoptions are counted under a keyed fingerprint, never the author's own", /insert into listing_adopters \(listing_id, who\) select id, \$\{adopterKey\(email\)\} from methodology_listings where id = \$\{id\} and email <> \$\{email\}/.test(registry));

  const card = communityProfileSchema.parse(JSON.parse(read("data/samples/community.json")).profiles[0]);
  const rows = householdView([{ name: "Me", you: true, card }, { name: "Sam", you: false, card }, { name: "Gran", you: false, card: null }]);
  check("family: each member's shared card in a row, the holdings two or more hold, a member with no card said so", rows.length === 3 && !rows[2].sharing && rows[0].top.length <= 5 && heldInCommon(rows).every((c) => c.members === 2) && MAX_HOUSEHOLD === 8);
  check("family: a household's cards are read only by a member", /join household_members m on m.household_id = h.id where h.id = \$\{id\} and m.email = \$\{email\}/.test(registry));

  const d = (family: Donation["family"], kept: number, breaches: number) => donationFrom({ family, rules: { score: kept, measured: 10, breaches }, reasonedPct: 80, listedHoldings: 12 });
  const five = [d("fundamentals", 80, 0), d("fundamentals", 90, 1), d("fundamentals", 100, 0), d("fundamentals", 70, 0), d("fundamentals", 60, 2), d("macro", 50, 0)];
  const od = openData(five);
  check(`open data: pooled, each row ${OPEN_MIN_PEOPLE} people or more, a smaller family not shown`, od.rows.length === 2 && od.rows[0].family === "all" && od.rows[0].people === 6 && od.rows[1].family === "fundamentals" && od.rows[1].medianRulesKeptPct === 80 && od.rows[1].withBreachPct === 40 && od.below === 1 && openData(five.slice(0, 4)).rows.length === 0);
  check("open data: no amount and no holding is given, and the week is ISO", !("amount" in d("macro", 1, 0)) && holdingBand(12) === "10-19" && isoWeek("2026-11-09") === "2026-W46" && isoWeek("2026-01-01") === "2026-W01" && DEFAULT_PREFERENCES.donate === false);
  const ar = annualReport({ year: 2026, through: "2026-11-09", counts: { cardsShared: 3, recordsShared: 2, receipts: 120, clubs: 6, competitions: 0, listings: 0, adoptions: 0, donors: 0 }, open: [], openWeek: null });
  check("the annual report: a count under five is said as fewer than five, and too little open data is said so", /^Fewer than 5 people shared a card\.$/.test(ar.lines[0]) && /120 theses and journals/.test(ar.lines[1]) && /Too few/.test(ar.lines[4]));
  // --- The twenty further ways (Hamza, 9 Nov 2026) ---------------------------
  {
    const graham = adoptMethodology(libraryEntry("graham")!);
    const v1 = { ...graham, adopted: "2026-11-01" };
    const v2 = { ...v1, rules: v1.rules.map((r, i) => (i === 0 ? { ...r, text: `${r.text} Read again.` } : r)) };
    const diff = methodologyDiff(v1, v2);
    check("versions: a fingerprint follows the words, the first version is all added, a reworded rule is one change with its words before and after", methodologyFingerprint(v1) === methodologyFingerprint({ ...v1 }) && methodologyFingerprint(v1) !== methodologyFingerprint(v2) && methodologyDiff(null, v1).every((c) => c.kind === "added") && diff.length === 1 && diff[0].kind === "changed" && /Read again/.test(diff[0].after ?? "") && diffText([]).length > 0);
    const entry = versionEntry({ id: "2026-11-02-a", m: v2, prev: v1, today: "2026-11-02", now: "2026-11-02T10:00:00.000Z" });
    check("versions: kept as a methodology entry in the Decision Log carrying the sha256, listed newest first", entry.kind === "methodology" && entry.action?.reading === `sha256:${methodologyFingerprint(v2)}` && versionsOf([entry, { ...entry, id: "x", kind: "note" }]).length === 1);

    const dani = bookSchema.parse(JSON.parse(read("data/samples/dani.book.json")));
    const cmp = shadowCompare(null, adoptMethodology(libraryEntry("lynch")!), dani, "2026-10-11", ["ibkr", "schwab"]);
    check("shadow: another methodology is read on the same book beside one's own, a holding row each, nothing changed", cmp.own === null && cmp.shadow.name.length > 0 && cmp.rows.length > 0 && cmp.rows.every((r) => r.weightPct >= 0));

    const words = { subject: "COST", text: "Membership fees compound.", pathway: null, pillars: [{ name: "Renewals", text: "Above 90%." }], watch: ["Fee rise"] };
    const call = callFrom(words, { name: "Ines", handle: "ines", sealedAt: "2026-11-01T00:00:00.000Z", now: "2026-11-02T00:00:00.000Z" });
    check("public calls: a call carries its words and their fingerprint, which anyone can check, and a changed word breaks it", callHolds(call) && !callHolds({ ...call, text: `${call.text} Edited.` }));

    const profiles = communityProfileSchema.array().parse(JSON.parse(read("data/samples/community.json")).profiles);
    const verified = profiles.find((p) => badgeOf(p.sharing.record ? p.record : null).verified) ?? null;
    const plain = { ...profiles[0], sharing: { ...profiles[0].sharing, record: false } };
    check("record badge: an SVG with the name escaped and no fetch, the snippets link the private card", /^<svg[^>]+>/.test(badgeSvg({ ...plain, name: "A <b>" })) && !/<b>/.test(badgeSvg({ ...plain, name: "A <b>" })) && !/https?:\/\/(?!www\.w3\.org)/.test(badgeSvg(plain)) && badgeSnippets("https://x.test", "abc", "N").link === "https://x.test/card/abc");
    check("mentors: only a verified card offers, an ask needs a card and its private link and never one's own", offerProblem(null) !== null && offerProblem(plain) !== null && (verified ? offerProblem(verified) === null : true) && askProblem({ card: true, link: true, open: 0, self: false }) === null && askProblem({ card: true, link: false, open: 0, self: false }) !== null && askProblem({ card: true, link: true, open: 0, self: true }) !== null);

    const tested = v1.rules.filter((r) => r.test).map((r) => r.id).slice(0, 2);
    check("packs: only a verified analyst lists one, of tested rules, at most the limit", packListingProblem(plain, v1, tested) !== null && (verified ? packListingProblem(verified, v1, tested) === null && packListingProblem(verified, v1, []) !== null && packListingProblem(verified, v1, Array.from({ length: PACK_MAX_RULES + 1 }, (_, i) => `r${i}`)) !== null : true));
    const pack = packFrom(v1, tested, { id: "pack-one", name: "Graham's floor", about: "Two of the rules.", credit: "R. Haddad", handle: "rh", now: "2026-11-09T00:00:00.000Z" });
    const laid = withPack(adoptMethodology(libraryEntry("hcmp")!), packOf(pack));
    check("packs: a listed pack carries its rules and the figures they test, credited, and lays on a methodology as a draft", pack.rules.length === tested.length && pack.figures.length >= 1 && /R\. Haddad/.test(packOf(pack).name) && "draft" in laid && laid.draft.adopted === null);

    check("course: a ten-week pack, and grades read the reasons, holdings and limit of course competitions alone", COURSE_PACK.length === 10 && courseGrades([{ competition: { id: "c1", name: "Term", course: { minHoldings: 5, reasons: true }, maxWeightPct: 20 }, rows: [{ name: "Ana", trades: 6, reasoned: 6, holdings: 6, largestWeightPct: 15 }] }, { competition: { id: "c2", name: "Fun", course: null, maxWeightPct: 20 }, rows: [] }]).columns.length === 1 && mentorsOnly("alumnus") && !runsClub("alumnus"));
    const sum = (m: number | null, n: number) => ({ asOf: "2026-12-01", entries: n, medianReturnPct: m, medianAgainstSpyPts: m, bestReturnPct: m, spyPct: 0, final: true });
    const lr = (clubId: string, starts: string, m: number | null): LeagueRow => ({ clubId, club: clubId.toUpperCase(), about: null, competition: `${clubId}-${starts}`, starts, ends: starts, summary: sum(m, LEAGUE_MIN_ENTRIES) as LeagueRow["summary"] });
    const st = seasonTable([lr("a", "2026-10-01", 3), lr("a", "2026-11-01", 5), lr("b", "2026-10-01", 1), lr("c", "2026-10-01", 2), lr("d", "2026-10-01", -1), lr("e", "2026-10-01", 4), lr("a", "2027-05-10", 2), lr("d", "2027-05-10", 9)], "2026-12-01");
    check(`season: September to June, each club's best regular competition, the top ${FINALISTS} finalists alone in the final`, seasonOf("2026-12-01").id === "2026–27" && seasonOf("2027-03-01").starts === "2026-09-01" && st.regular[0].clubId === "a" && st.regular[0].againstSpyPts === 5 && st.finalists.length === FINALISTS && !st.finalists.includes("d") && st.final.map((r) => r.clubId).join() === "a" && st.stage === "regular");

    const pv = (author: string, symbol: string, created: string, bear: number, base: number, bull: number): Pitch => ({ id: `${symbol}-${author}`, symbol, title: "t", body: "b", author, you: false, createdAt: created, bountyId: null, valuation: { bear, base, bull, price: null } } as Pitch);
    const cal = clubCalibration([pv("Ana", "AAA", "2026-01-01T00:00:00Z", 80, 100, 120), pv("Ana", "BBB", "2026-01-01T00:00:00Z", 10, 20, 30), pv("Ben", "AAA", "2026-11-01T00:00:00Z", 50, 60, 70)], new Map([["AAA", 110], ["BBB", 50]]), "2026-11-09");
    check(`calibration: a valuation judged after ${CLUB_CALIBRATION_DAYS} days, inside bear to bull or not, the base's distance at the median; bear above bull refused`, cal[0].author === "Ana" && cal[0].judged === 2 && cal[0].withinPct === 50 && cal.find((r) => r.author === "Ben")?.waiting === 1 && !pitchValuationSchema.safeParse({ bear: 30, base: 20, bull: 10, price: null }).success);
    const ser = (a: number, b: number) => [{ date: "2026-01-02", value: a }, { date: "2026-06-01", value: b }];
    const fund = pickFund([pv("Ana", "AAA", "2026-01-02T00:00:00Z", 1, 2, 3), pv("Ben", "AAA", "2026-03-01T00:00:00Z", 1, 2, 3), pv("Ana", "ZZZ", "2026-01-02T00:00:00Z", 1, 2, 3)], { AAA: ser(100, 120), SPY: ser(500, 550) }, "2026-06-01");
    check("pick fund: a dollar in each ticker's first pitch against a dollar in SPY, a ticker with no closes named", fund.picks === 1 && fund.fundPct === 20 && fund.spyPct === 10 && fund.unpriced.join() === "ZZZ");

    const tr = treasuryFrom("Treasurer", [{ symbol: "aaa", weight: 42.345 }, { symbol: "CASH ACCT", weight: 10 }], [{ kind: "buy", symbol: "AAA", date: "2026-10-01", quantity: 3 }, { kind: "buy", symbol: "AAA", date: "2026-10-01", quantity: 2 }, { kind: "dividend", symbol: "AAA", date: "2026-10-02", quantity: 0 }], "2026-11-09");
    check("treasury: weights in percent and trades by day and side alone, never an amount or a count", tr.weights.length === 1 && tr.weights[0].weightPct === 42.3 && tr.trades.length === 1 && !JSON.stringify(tr).includes("quantity") && Object.keys(tr.trades[0]).sort().join() === "day,side,symbol");
    const mtg = { id: "m1", title: "October IC", day: "2026-10-01", items: [{ id: "1", text: "AAA: buy a starter position", symbol: "AAA" }, { id: "2", text: "BBB: trim to 5%", symbol: "BBB" }], minutes: null, kind: "meeting", symbol: null, tallies: { "1": { for: 3, against: 0, abstain: 0, mine: null }, "2": { for: 0, against: 3, abstain: 0, mine: null } }, voters: 3 };
    const acts = votesAndTrades([mtg as never], [{ day: "2026-10-05", symbol: "AAA", side: "buy" }, { day: "2026-10-06", symbol: "BBB", side: "sell" }], "2026-12-01");
    check("votes and trades: a carried item traded is followed, one voted down but traded is traded against the vote", itemSide("BBB: trim to 5%") === "sell" && acts.find((a) => a.symbol === "AAA")?.verdict === "followed" && acts.find((a) => a.symbol === "BBB")?.verdict === "traded against the vote");

    const cards = profiles.map(awardCardOf);
    const awards = awardsOf({ year: 2026, cards, clubs: [{ club: "Harbour", starts: "2026-03-01", medianAgainstSpyPts: 2.5, entries: 6, reviewedPitches: 7, averageReview: 4.1 }] });
    check("awards: five awards from listed cards and league clubs, a card's record and judgement read only where shared, one with no one says so", awards.length === 5 && awards.find((a) => a.id === "club")?.winner === "Harbour" && awards.every((a) => a.winner !== null || /No one/.test(a.detail)) && awardCardOf({ ...profiles[0], sharing: { ...profiles[0].sharing, judgement: false, record: false } }).calibrationPct === null);
    const csv = openDataCsv([{ week: "2026-W45", donations: five }, { week: "2026-W44", donations: five.slice(0, 2) }]);
    check("open data download: a header, the oldest week first, a week too small gives no row, no name", csv.split("\n")[0] === CSV_HEADER.join(",") && csv.trim().split("\n").length === 3 && csv.split("\n")[1].startsWith("2026-W45,all,6"));

    const fr = familyRules(RULE_PACKS[0], dani, "2026-10-11", ["ibkr", "schwab"]);
    const grid = familyGrid(RULE_PACKS[0], [{ name: "Me", you: true, result: fr }, { name: "Gran", you: false, result: null }]);
    check("family rules: a pack read on each member's own book as a status and a percent, never an amount, the grid by member", fr.rules.length === RULE_PACKS[0].rules.length && fr.rules.every((r) => r.actual === null || !/[$€£]/.test(r.actual)) && grid.rows.length === 2 && grid.rows[1].cells.every((c) => c.status === null));
  }
  check("the twenty further ways' slots are in the ontology", ["club_course", "club_season", "club_calibration", "club_fund", "club_treasury", "club_mentors", "methodology_shadow", "methodology_versions", "methodology_frameworks", "pack_listings", "community_judgement", "community_badge", "community_mentors", "public_calls", "open_research", "annual_awards", "family_rules", "trades_planned", "trades_postmortems", "trade_plan", "review_letter", "decision_letter"].every((x) => !!SLOTS[x as keyof typeof SLOTS]));
  check("the privacy page says what the further pieces keep", ["public call", "mentor", "pack", "treasury", "family rules", "badge"].every((w) => new RegExp(w, "i").test(read("app/privacy/page.tsx"))));
  check("the twenty more ways' slots are in the ontology", ["club_graduation", "club_challenges", "club_bounties", "club_picks", "club_watch", "club_alumni", "community_family", "methodology_packs", "methodology_market", "market_funds", "market_fund_theses", "decision_journal", "trades_reasoned", "thesis_calibration"].every((x) => !!SLOTS[x as keyof typeof SLOTS]));
  check("the privacy page says what the new pieces keep", ["open data", "household", "marketplace", "journal"].every((w) => new RegExp(w, "i").test(read("app/privacy/page.tsx"))));
}

if (failed) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\ncheck:community ok (${passed} passed): a shared card is the theses' words and the weights in percent and nothing else, following is the person's own preference, the registry keeps the card while they share and deletes it when they stop, the demo's people are fictional, and the community index lists only what five or more people hold, in percent; clubs show their own Drive folder through Google, keep virtual competitions that follow their rules, and read an address back only to whoever runs the club.`);
