import "server-only";

import { alertsFileSchema, reconcilePrefix, type AlertsFile } from "@/lib/alerts";
import { COMMUNITY_PREFIX, communityNotices, sharedRulesOf, profileFrom, refreshedCard, trackRecordFrom, weightInputsOf, withStreak, type CommunityProfile, type Judgement, type TrackRecord } from "@/lib/community";
import type { Methodology } from "@/lib/methodology";
import { cardFingerprints, withReceipts } from "@/lib/receipts";
import { familyOf } from "@/lib/research";
import { navIndex } from "@/lib/performance";
import { resonanceOf } from "@/lib/resonance";
import { deriveScreens } from "@/lib/screen-data";
import type { Notice } from "@/lib/screens";
import { SyncError } from "@/lib/sync-error";
import { EMPTY_THESES, thesesFileSchema, type ThesesFile } from "@/lib/theses";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";
import { vaultWorkspace, type Workspace } from "@/lib/workspace";

/**
 * The Community card kept in step (Hamza, 19 Oct 2026: "this for every user
 * should be updated in real time in sync"). A card is a copy of the person's
 * theses and weights at the moment it was shared; whenever either changes
 * (a thesis written on Theses or over the connector, a document folded in,
 * the morning or evening statement, a new methodology), `republishCard`
 * rebuilds it from the same files `shareAction` reads and replaces it in the
 * registry when it differs, carrying `changed` when the difference is one
 * followers are told of (lib/community.ts, `cardChanges`). Nothing is kept
 * that was not shared before: the handle, the name, the line and the choice
 * stay as the person set them, and a book that cannot be read keeps the
 * weights last shared rather than wiping them. Followers' alerts come from
 * the kept cards (`followedNotices`); on opening the app they are laid on the
 * alerts file at once (`catchUpCommunity`), and the twice-daily check emails
 * them. Server-only; the registry is the one thing read outside the vault.
 */

export type Republish = "not sharing" | "unchanged" | "updated";

/** The card as the person's files stand now, built as `shareAction` builds it; the kept card gives the handle, the name, the line and the choice. */
export function cardFor(ws: Workspace, theses: ThesesFile | null, prev: CommunityProfile, now: string, judgement: Judgement | null = prev.judgement): CommunityProfile {
  const book = ws.fullBook;
  const today = localDay(new Date(now));
  const data = book && ws.baseSetup ? deriveScreens({ book, methodology: ws.baseSetup.methodology, inputs: ws.baseSetup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today) : null;
  const recordRead = prev.sharing.record ? recordFor(ws, data) : null;
  const m = ws.baseSetup?.methodology ?? null;
  const record = prev.sharing.record ? (recordRead ? withStreak(recordRead, data && m ? breachesOf(ws, data) : null, prev.record, lastBreachEnd(ws.alerts, m, now), today) : prev.record) : null;
  const read = (data?.weights ?? []).map((w) => ({ symbol: w.symbol, name: w.name, weight: w.weight, classLabel: w.classId ? w.classLabel : null }));
  // A book that cannot be read today is not an empty book: the weights last shared stay.
  const weights = read.length ? read : weightInputsOf(prev);
  return profileFrom({ handle: prev.handle, name: prev.name, about: prev.about, methodology: m?.name ?? prev.methodology, methodologyFrom: m ? lineageWords(m) : prev.methodologyFrom, family: m ? familyOf(m).family : prev.family, theses: theses ?? EMPTY_THESES, weights, asOf: read.length ? (book?.asOf ?? prev.asOf) : prev.asOf, sharing: prev.sharing, now, changed: prev.changed, record, rules: m ? sharedRulesOf(m) : prev.rules, judgement });
}

/**
 * The recruiter view's figures (Hamza, 9 Nov 2026, the twenty further
 * ways): what the person's own records say of their judgement, read only
 * when they tick it on the card. The past year's trades with a reason and how
 * the reasoned ones fared against SPY, the share planned a day ahead, their
 * own valuations judged a year on, and their club competitions against SPY;
 * percent and counts alone. Closes are read for the symbols traded and
 * valued; a feed that cannot be read leaves those figures out.
 */
export async function judgementFor(ws: Workspace, email: string, today: string): Promise<Judgement | null> {
  const book = ws.fullBook;
  if (!book) return null;
  const [{ reasonedTrades, plannedTrades, calibrationOf, CALIBRATION_DAYS, REASONED_DAYS }, { loadCloses }, { addDaysTo }, { recordSummary }] = await Promise.all([import("@/lib/judgement"), import("@/lib/markets-feed"), import("@/lib/time"), import("@/lib/clubs")]);
  const first = reasonedTrades(book, ws.decisions, {}, today);
  const valuations = Object.fromEntries(Object.entries(ws.records.bySymbol).map(([s, r]) => [s.toUpperCase(), r.ownValuation ?? null]));
  const due = Object.entries(valuations).filter(([, v]) => v && addDaysTo(v.asOf, CALIBRATION_DAYS) <= today).map(([s]) => s);
  const symbols = [...new Set([...first.rows.map((r) => r.symbol), ...due])].slice(0, 60);
  const closes = symbols.length ? await loadCloses([...symbols, "SPY"].join(","), today, "budget", Math.max(REASONED_DAYS, CALIBRATION_DAYS * 2) + 30).catch(() => null) : null;
  const series = closes?.series ?? {};
  const reasoned = reasonedTrades(book, ws.decisions, series, today);
  const planned = plannedTrades(book, ws.decisions, series, today);
  const calibration = calibrationOf(valuations, series, today);
  let club: { competitions: number; medianAgainstSpyPts: number | null } = { competitions: 0, medianAgainstSpyPts: null };
  try {
    const { registryAvailable, clubRecordsOf } = await import("@/lib/registry");
    if (registryAvailable()) {
      const s = recordSummary(await clubRecordsOf(email));
      club = { competitions: s.competitions, medianAgainstSpyPts: s.medianAgainstSpyPts };
    }
  } catch {
    // The club record is left out when the registry cannot be read.
  }
  return { asOf: today, trades: reasoned.trades, reasonedPct: reasoned.reasonedPct, rightPct: reasoned.rightPct, plannedPct: planned.plannedPct, calibrationJudged: calibration.judged, calibrationPct: calibration.sharePct, clubCompetitions: club.competitions, clubMedianAgainstSpyPts: club.medianAgainstSpyPts };
}

/** "Its name, by its author": the methodology it was forked from, or null for one of the person's own. */
export function lineageWords(m: Methodology): string | null {
  if (m.lineage) return `${m.lineage.parent}${m.lineage.credit ? `, by ${m.lineage.credit}` : ""}`;
  return m.origin === "library" ? m.source.title : null;
}

function breachesOf(ws: Workspace, data: ReturnType<typeof deriveScreens>): number {
  return resonanceOf(data.findings, data.todo, data.notices).breaches;
}

/**
 * When the methodology's last breach closed, from the alerts file: an alert
 * on one of its rules (keyed by the rule's id) in the danger tone, open now
 * (the time now) or cleared. Null when the file shows none, so a streak
 * starts from the day the app first reads it and never before.
 */
export function lastBreachEnd(alerts: AlertsFile | null, m: Methodology | null, now: string): string | null {
  if (!alerts || !m) return null;
  const ids = m.rules.filter((r) => r.severity === "breach").map((r) => r.id);
  let last: string | null = null;
  for (const i of alerts.items) {
    if (i.tone !== "danger" || !ids.some((id) => i.key === id || i.key.startsWith(`${id}:`))) continue;
    const end = (i.clearedAt ?? now).slice(0, 10);
    if (!last || end > last) last = end;
  }
  return last;
}

/**
 * The track record the app reads from the whole book (lib/community.ts,
 * `trackRecordFrom`): the time-weighted index from the statement, SPY's
 * closes the book carries, and the rules kept today under the confirmed
 * methodology. Null when the book is too short or cannot be read.
 */
export function recordFor(ws: Workspace, data: ReturnType<typeof deriveScreens> | null): TrackRecord | null {
  const book = ws.fullBook;
  if (!book) return null;
  const rules = data && ws.baseSetup?.methodology ? resonanceOf(data.findings, data.todo, data.notices) : null;
  return trackRecordFrom(navIndex(book), book.series?.benchmarks?.SPY ?? null, rules);
}

/** Rebuilds one person's shared card from their vault and replaces it in the registry when it differs. Throws a `SyncError` sentence when a file or the registry cannot be read. */
export async function republishCard(vault: Vault, email: string, now: Date = new Date()): Promise<Republish> {
  const { registryAvailable, myProfile, shareProfile } = await import("@/lib/registry");
  if (!registryAvailable()) return "not sharing";
  const prev = await myProfile(email);
  if (!prev) return "not sharing";
  const [ws, theses] = await Promise.all([vaultWorkspace({ name: null, email, image: null }, vault), prev.sharing.theses ? vault.readJson("theses", thesesFileSchema) : Promise.resolve(null)]);
  const judgement = prev.sharing.judgement ? ((await judgementFor(ws, email, localDay(now)).catch(() => null)) ?? prev.judgement) : null;
  const next = refreshedCard(prev, await sealedCard(cardFor(ws, theses, prev, now.toISOString(), judgement)), now.toISOString());
  if (!next) return "unchanged";
  await shareProfile(email, next);
  return "updated";
}

/** The card with each shared thesis's receipt: its fingerprint registered (lib/receipts.ts) and the time the registry first saw it. A registry that cannot take them leaves the card as it was built. */
export async function sealedCard(p: CommunityProfile): Promise<CommunityProfile> {
  const hashes = cardFingerprints(p);
  if (!hashes.length) return p;
  try {
    const { sealReceipts } = await import("@/lib/registry");
    return withReceipts(p, await sealReceipts(hashes));
  } catch (e) {
    console.error(`[community] receipts not sealed: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return p;
  }
}

/** `republishCard` for a path that must not fail on it (a save, a refresh, a connector write): a failure is one log line with no name in it. */
export async function republishQuietly(vault: Vault, email: string, now: Date = new Date()): Promise<Republish | null> {
  try {
    return await republishCard(vault, email, now);
  } catch (e) {
    console.error(`[community] card not republished: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return null;
  }
}

/** The alerts the cards a person follows make today, read from the registry; null when it is not set up or cannot be read, so the alerts stay as the last check left them. */
export async function followedNotices(following: readonly string[], today: string): Promise<Notice[] | null> {
  if (!following.length) return [];
  try {
    const { registryAvailable, communityProfilesOf } = await import("@/lib/registry");
    if (!registryAvailable()) return null;
    return communityNotices(await communityProfilesOf(following), following, today);
  } catch (e) {
    console.error(`[community] followed cards not read: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    return null;
  }
}

/**
 * Lays the followed cards' changes on the person's alerts file, so the badge
 * shows them the moment the app is opened rather than at the next check; the
 * email waits for the check. Nothing else in the file moves.
 */
export async function catchUpCommunity(vault: Vault, following: readonly string[], now: Date = new Date()): Promise<number> {
  if (!following.length) return 0;
  const notices = await followedNotices(following, localDay(now));
  if (notices === null) return 0;
  const prev = await vault.readJson("alerts", alertsFileSchema).catch(() => null);
  const { file, fired } = reconcilePrefix(prev, COMMUNITY_PREFIX, notices, now.toISOString());
  if (fired.length || file.items.length !== (prev?.items.length ?? 0)) await vault.writeJson("alerts", alertsFileSchema.parse(file));
  return fired.length;
}

/**
 * This week's open data from one person who chose to give it (`donate` in
 * the preferences; lib/open-data.ts): the methodology's family, the rules
 * kept, the breaches, the share of the past year's trades with a reason and
 * the holdings in a band. Never an amount, a holding or the address. Quiet:
 * a book or registry that cannot be read gives nothing this time.
 */
export async function donateQuietly(vault: Vault, email: string, now: Date = new Date()): Promise<void> {
  try {
    const { registryAvailable, keepDonation } = await import("@/lib/registry");
    if (!registryAvailable()) return;
    const ws = await vaultWorkspace({ name: null, email, image: null }, vault);
    if (!ws.preferences.donate || !ws.fullBook || !ws.baseSetup?.methodology) return;
    const today = localDay(now);
    const book = ws.fullBook;
    const data = deriveScreens({ book, methodology: ws.baseSetup.methodology, inputs: ws.baseSetup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
    const r = resonanceOf(data.findings, data.todo, data.notices);
    const [{ donationFrom, isoWeek }, { reasonedTrades }] = await Promise.all([import("@/lib/open-data"), import("@/lib/judgement")]);
    const reasoned = reasonedTrades(book, ws.decisions, {}, today);
    const listed = book.holdings.filter((h) => h.assetClass === "equity" || h.assetClass === "etf").length;
    await keepDonation(email, isoWeek(today), donationFrom({ family: familyOf(ws.baseSetup.methodology).family, rules: { score: r.score, measured: r.measured, breaches: r.breaches }, reasonedPct: reasoned.reasonedPct, listedHoldings: listed }));
  } catch (e) {
    console.error(`[open-data] not given: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
  }
}

/**
 * The club treasuries and family rules this person feeds (Hamza, 9 Nov 2026,
 * the twenty further ways): for each club whose treasury is their book, the
 * weights in percent and the trades by day and side (`treasuryFrom`); for
 * each household with a rule pack, the pack read on their own book
 * (`familyRules`, a status and a percent or count, never an amount). Run on
 * opening the app; a failure is logged and the last copy stays.
 */
export async function publishClubAndFamily(ws: Workspace, email: string, today: string): Promise<void> {
  const book = ws.fullBook;
  if (!book) return;
  const { registryAvailable, treasuriesOf, keepTreasury, familyPacksOf, keepFamilyResult } = await import("@/lib/registry");
  if (!registryAvailable()) return;
  const [treasuries, packs] = await Promise.all([treasuriesOf(email).catch(() => []), familyPacksOf(email).catch(() => [])]);
  if (treasuries.length) {
    const { treasuryFrom } = await import("@/lib/clubs");
    const data = deriveScreens({ book, methodology: ws.baseSetup?.methodology ?? null, inputs: ws.baseSetup?.inputs ?? [], shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today);
    const listed = data.weights.filter((w) => w.holdings.some((h) => h.assetClass === "equity" || h.assetClass === "etf"));
    for (const t of treasuries) await keepTreasury(t.clubId, email, treasuryFrom(t.holder, listed, book.transactions, today)).catch(() => console.error("[clubs] treasury not kept"));
  }
  if (packs.length) {
    const [{ RULE_PACKS }, { familyRules }] = await Promise.all([import("@/lib/rule-packs"), import("@/lib/households")]);
    for (const p of packs) {
      const pack = RULE_PACKS.find((x) => x.id === p.pack);
      if (pack) await keepFamilyResult(p.id, email, familyRules(pack, book, today, ws.baseSetup?.inputs ?? [])).catch(() => console.error("[households] result not kept"));
    }
  }
}

/** `publishClubAndFamily` from the vault, as opening the app runs it. */
export async function clubAndFamilyQuietly(vault: Vault, email: string, now: Date = new Date()): Promise<void> {
  try {
    const ws = await vaultWorkspace({ name: null, email, image: null }, vault);
    await publishClubAndFamily(ws, email, localDay(now));
  } catch (e) {
    console.error(`[clubs] treasury and family: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
  }
}
