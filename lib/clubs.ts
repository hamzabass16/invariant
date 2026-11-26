import { z } from "zod";

/**
 * Clubs (Hamza, 9 Nov 2026, a university investment club the first use case:
 * "... storing all the material there, making it easy for club members to view
 * the material synced to their club's google drive folder and to hold
 * virtual portfolio competitions among club members"). Pure: the shapes,
 * the Drive folder a club links, and the arithmetic of a competition.
 *
 * A club is a name, a line about it, the Google Drive folder its material
 * already lives in, and its members (an owner, officers, members). The app
 * never writes to that folder and never reads it: the material page embeds
 * Google's own view of the folder, which each member sees with their own
 * Google sign-in and the access the folder's owner gave them, so the club's
 * files stay where the club keeps them and are always in sync.
 *
 * A competition is virtual money, never the person's own: each member who
 * enters starts with the same cash, buys and sells listed tickers at the last
 * close, and is ranked by the return on that cash against SPY over the same
 * days. Nothing is ever traded at a broker.
 */

export const CLUB_ROLES = ["owner", "officer", "adviser", "member", "alumnus"] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];
export const ROLE_WORDS: Record<ClubRole, string> = { owner: "Owner", officer: "Officer", adviser: "Faculty adviser", member: "Member", alumnus: "Alumni mentor" };

/** A club's id, from its name: lower case, digits and dashes. */
export const CLUB_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** A competition's id: the club's, a dash and a short slug. */
export const COMPETITION_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
/** A Drive file or folder id as Google writes them. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;
/** A plain listed ticker: what the price feed can read (BRK.B, RDS-A). */
export const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** A member's display name as the club sees it: never their address. */
export const MEMBER_NAME_MAX = 60;
export const MAX_CLUBS_PER_PERSON = 12;
export const MAX_MEMBERS = 400;
export const MAX_COMPETITIONS = 40;
export const MAX_TRADES = 400;
/** Every entry starts with this much virtual cash unless the competition says otherwise. */
export const DEFAULT_CASH = 100_000;
/** The share of the virtual book one holding may reach on a buy unless the competition says otherwise. */
export const DEFAULT_MAX_WEIGHT_PCT = 25;
/** Join codes: unambiguous letters and digits. */
export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 10;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const clubSchema = z.object({
  id: z.string().regex(CLUB_ID),
  name: z.string().min(2).max(80),
  about: z.string().max(400).nullable(),
  /** The Google Drive folder the club's material lives in; null until an owner or officer links one. */
  folderId: z.string().regex(DRIVE_ID).nullable(),
  createdAt: z.string(),
});
export type Club = z.infer<typeof clubSchema>;

export const memberSchema = z.object({
  name: z.string().min(1).max(MEMBER_NAME_MAX),
  role: z.enum(CLUB_ROLES),
  joinedAt: z.string(),
  /** Read back to the owner and officers alone, so they can share the club's folder in Drive; null for everyone else. */
  email: z.string().nullable(),
  you: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const competitionSchema = z.object({
  id: z.string().regex(COMPETITION_ID),
  clubId: z.string().regex(CLUB_ID),
  name: z.string().min(2).max(80),
  starts: isoDate,
  ends: isoDate,
  /** Virtual cash each entry starts with, in US dollars. */
  cash: z.number().positive().max(100_000_000),
  /** The largest share of an entry's book one holding may reach on a buy, in percent; null for no limit. */
  maxWeightPct: z.number().positive().max(100).nullable(),
  /** A line of the competition's own rules, for the members; the app tests only the ones above. */
  note: z.string().max(400).nullable(),
  createdAt: z.string(),
  /** Set as coursework: each entry is graded on the rules kept and the reasons given, never on its return (`gradeOf`). */
  course: z.object({ minHoldings: z.number().int().min(1).max(30), reasons: z.boolean() }).nullable().default(null),
  /** The challenge between two clubs this competition is one side of, when it is. */
  challengeId: z.string().nullable().default(null),
});
export type Competition = z.infer<typeof competitionSchema>;

export const tradeSchema = z.object({
  /** The session whose close the trade filled at. */
  day: isoDate,
  symbol: z.string().regex(TICKER),
  side: z.enum(["buy", "sell"]),
  shares: z.number().positive(),
  price: z.number().positive(),
  /** Why, in the member's words, kept with the trade for the club to read. */
  reason: z.string().max(200).nullable().default(null),
});
export type Trade = z.infer<typeof tradeSchema>;

export const entrySchema = z.object({
  name: z.string().min(1).max(MEMBER_NAME_MAX),
  you: z.boolean(),
  trades: z.array(tradeSchema).max(MAX_TRADES),
  updatedAt: z.string(),
});
export type Entry = z.infer<typeof entrySchema>;

/** The demo's club: fictional people, a fictional folder, trades at the sample's closes. */
export const clubsSampleSchema = z.object({
  clubs: z.array(
    z.object({
      club: clubSchema,
      members: z.array(memberSchema),
      competitions: z.array(z.object({ competition: competitionSchema, entries: z.array(entrySchema) })),
      /** Whether the club shows on the league. */
      league: z.boolean().default(false),
      pitches: z.array(z.lazy(() => pitchSchema)).default([]),
      meetings: z.array(z.object({ meeting: z.lazy(() => meetingSchema), tallies: z.record(z.string(), z.object({ for: z.number(), against: z.number(), abstain: z.number(), mine: z.enum(["for", "against", "abstain"]).nullable() })), voters: z.number() })).default([]),
      bounties: z.array(z.lazy(() => bountySchema.extend({ pitches: z.array(z.object({ id: z.string(), title: z.string(), author: z.string(), votes: z.number() })), mine: z.string().nullable() }))).default([]),
      reviews: z.record(z.string(), z.object({ count: z.number(), average: z.number().nullable(), mine: z.number().nullable() })).default({}),
      watch: z.array(z.lazy(() => clubWatchSchema)).default([]),
      alumni: z.array(z.lazy(() => alumnusSchema)).default([]),
      challenges: z.array(z.lazy(() => challengeSchema.extend({ side: z.enum(["from", "to"]), mine: boardSummarySchema.nullable(), theirs: boardSummarySchema.nullable(), competitionId: z.string().nullable() }))).default([]),
      /** The club's treasury as published, fictional. */
      treasury: z.lazy(() => treasurySchema).nullable().default(null),
      /** Review notes on pitches, by pitch id. */
      notes: z.record(z.string(), z.array(z.object({ name: z.string(), alumnus: z.boolean(), score: z.number(), note: z.string() }))).default({}),
    }),
  ),
  /** Other fictional clubs on the demo's league, as their summaries. */
  league: z.array(z.object({ clubId: z.string(), club: z.string(), about: z.string().nullable(), competition: z.string(), starts: z.string(), ends: z.string(), summary: z.lazy(() => boardSummarySchema) })).default([]),
  /** The demo visitor's record from a club they were in before. */
  records: z.array(z.lazy(() => clubRecordSchema)).default([]),
});
export type ClubsSample = z.infer<typeof clubsSampleSchema>;

// ---------------------------------------------------------------------------
// Names, ids and the folder

export function clubIdFrom(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return CLUB_ID.test(s) ? s : `club-${s || "new"}`.slice(0, 40).replace(/-$/, "");
}

export function competitionIdFrom(clubId: string, name: string, starts: string): string {
  return `${clubId}-${clubIdFrom(name).slice(0, 24)}-${starts.replace(/-/g, "")}`.slice(0, 80);
}

/**
 * The folder id in what the person pasted: a folder's address
 * (drive.google.com/drive/folders/<id>, with /u/0/ or ?usp= around it), a
 * shared link (open?id=<id>) or the id alone. Null when it is none of them.
 */
export function driveFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (DRIVE_ID.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null;
  const m = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,100})/);
  if (m) return m[1];
  const id = url.searchParams.get("id");
  return id && DRIVE_ID.test(id) ? id : null;
}

/** The folder in Drive, where members add and open files. */
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
/** Google's own view of a folder, for an iframe: each member sees it with their own sign-in and access. */
export const folderEmbedUrl = (id: string, view: "grid" | "list" = "list") => `https://drive.google.com/embeddedfolderview?id=${id}#${view}`;

/** Can this role change the club: its folder, its members' roles, its competitions, its join code. */
export const runsClub = (role: ClubRole | null | undefined) => role === "owner" || role === "officer" || role === "adviser";

/** A fresh join code from random bytes (the caller supplies them, so this stays pure). */
export function inviteCodeFrom(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < INVITE_LENGTH; i++) out += INVITE_ALPHABET[bytes[i % bytes.length] % INVITE_ALPHABET.length];
  return out;
}

/** What a person types as a code: spaces and dashes dropped, upper case. */
export const normalInvite = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();

/** The addresses the owner pastes into Drive's Share box, the people without one left out. */
export function shareList(members: readonly Member[]): string {
  return members
    .map((m) => m.email)
    .filter((e): e is string => !!e)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Competitions

export type CompetitionStage = "upcoming" | "open" | "ended";

export function stageOf(c: Pick<Competition, "starts" | "ends">, today: string): CompetitionStage {
  if (today < c.starts) return "upcoming";
  if (today > c.ends) return "ended";
  return "open";
}

export type Position = { symbol: string; shares: number; cost: number };

/** What an entry holds after its trades: shares and the cost still in them by symbol, and the cash left. */
export function holdingsOf(trades: readonly Trade[], cash: number): { positions: Position[]; cash: number } {
  const by = new Map<string, Position>();
  let left = cash;
  for (const t of trades) {
    const p = by.get(t.symbol) ?? { symbol: t.symbol, shares: 0, cost: 0 };
    if (t.side === "buy") {
      p.shares += t.shares;
      p.cost += t.shares * t.price;
      left -= t.shares * t.price;
    } else {
      const avg = p.shares > 0 ? p.cost / p.shares : 0;
      p.cost -= avg * t.shares;
      p.shares -= t.shares;
      left += t.shares * t.price;
    }
    if (p.shares <= 1e-9) by.delete(t.symbol);
    else by.set(t.symbol, p);
  }
  return { positions: [...by.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), cash: left };
}

export type Valued = { value: number; cash: number; positions: (Position & { price: number | null; value: number; weightPct: number })[]; unpriced: string[] };

/** An entry at prices: each holding at its price (else at its cost, named as unpriced), its weight, the whole. */
export function valueOf(trades: readonly Trade[], cash: number, prices: ReadonlyMap<string, number>): Valued {
  const h = holdingsOf(trades, cash);
  const unpriced: string[] = [];
  const rows = h.positions.map((p) => {
    const price = prices.get(p.symbol) ?? null;
    if (price === null) unpriced.push(p.symbol);
    return { ...p, price, value: price === null ? p.cost : p.shares * price };
  });
  const value = h.cash + rows.reduce((s, r) => s + r.value, 0);
  return { value, cash: h.cash, positions: rows.map((r) => ({ ...r, weightPct: value > 0 ? (r.value / value) * 100 : 0 })).sort((a, b) => b.value - a.value), unpriced };
}

export type TradeAsk = { symbol: string; side: "buy" | "sell"; shares: number; reason: string | null };

/**
 * Adds one trade to an entry, or says why not, in a sentence: the
 * competition must be open; a buy fills at the last close and needs the
 * cash, and may not take the holding past the competition's weight limit at
 * the prices known; a sale needs the shares. No short, no margin, no
 * options. Pure: the caller gives the last close and the prices of what is
 * held.
 */
export function withTrade(c: Competition, trades: readonly Trade[], ask: TradeAsk, close: { day: string; price: number } | null, prices: ReadonlyMap<string, number>, today: string): { trades: Trade[] } | { error: string } {
  const stage = stageOf(c, today);
  if (stage === "upcoming") return { error: `The competition opens on ${c.starts}.` };
  if (stage === "ended") return { error: `The competition ended on ${c.ends}; its board is final.` };
  const symbol = ask.symbol.trim().toUpperCase();
  if (!TICKER.test(symbol)) return { error: "That is not a ticker the price feed can read." };
  if (!(ask.shares > 0) || !Number.isFinite(ask.shares)) return { error: "Say how many shares, more than none." };
  const shares = Math.round(ask.shares * 10_000) / 10_000;
  if (!close || !(close.price > 0)) return { error: `${symbol} has no close the price feed can read, so it cannot be traded here.` };
  if (trades.length >= MAX_TRADES) return { error: `An entry keeps at most ${MAX_TRADES} trades.` };
  const before = holdingsOf(trades, c.cash);
  const trade: Trade = { day: close.day, symbol, side: ask.side, shares, price: close.price, reason: ask.reason?.trim().slice(0, 200) || null };
  if (ask.side === "sell") {
    const held = before.positions.find((p) => p.symbol === symbol)?.shares ?? 0;
    if (held + 1e-9 < shares) return { error: held > 0 ? `You hold ${fmtShares(held)} ${symbol}; sell that many at most.` : `You hold no ${symbol}. No short selling here.` };
    return { trades: [...trades, trade] };
  }
  const cost = shares * close.price;
  if (cost > before.cash + 1e-6) return { error: `That costs ${usd(cost)} at the last close and ${usd(Math.max(0, before.cash))} is left. No margin here.` };
  if (c.maxWeightPct !== null) {
    const at = new Map(prices);
    at.set(symbol, close.price);
    const after = valueOf([...trades, trade], c.cash, at);
    const w = after.positions.find((p) => p.symbol === symbol)?.weightPct ?? 0;
    if (w > c.maxWeightPct + 1e-6) return { error: `That takes ${symbol} to ${w.toFixed(1)}% of your book; the competition's limit is ${c.maxWeightPct}% a holding.` };
  }
  return { trades: [...trades, trade] };
}

export type BoardRow = {
  name: string;
  you: boolean;
  value: number;
  returnPct: number;
  /** The entry's return less SPY's over the same days, in points; null without SPY's closes. */
  againstSpyPts: number | null;
  holdings: number;
  trades: number;
  largestWeightPct: number;
  /** Trades with a reason written, of all trades. */
  reasoned: number;
  unpriced: string[];
};

/**
 * The leaderboard: each entry at the prices given (the last close, or the
 * close on the last day for a competition that has ended), ranked by return
 * on the starting cash, SPY's return over the same days beside it. An entry
 * with no trade stands at the starting cash.
 */
export function leaderboard(c: Competition, entries: readonly Entry[], prices: ReadonlyMap<string, number>, spy: { start: number; now: number } | null): { rows: BoardRow[]; spyPct: number | null } {
  const spyPct = spy && spy.start > 0 ? (spy.now / spy.start - 1) * 100 : null;
  const rows = entries.map((e): BoardRow => {
    const v = valueOf(e.trades, c.cash, prices);
    const returnPct = (v.value / c.cash - 1) * 100;
    return {
      name: e.name,
      you: e.you,
      value: v.value,
      returnPct,
      againstSpyPts: spyPct === null ? null : returnPct - spyPct,
      holdings: v.positions.length,
      trades: e.trades.length,
      largestWeightPct: v.positions[0]?.weightPct ?? 0,
      reasoned: e.trades.filter((t) => t.reason).length,
      unpriced: v.unpriced,
    };
  });
  rows.sort((a, b) => b.returnPct - a.returnPct || a.name.localeCompare(b.name));
  return { rows, spyPct };
}

/** Every ticker a competition's entries hold now, for one price read. */
export function symbolsHeld(c: Competition, entries: readonly Entry[]): string[] {
  const out = new Set<string>();
  for (const e of entries) for (const p of holdingsOf(e.trades, c.cash).positions) out.add(p.symbol);
  return [...out].sort();
}

/** The close on or before a day in a series of closes (oldest first), else null. */
export function closeOn(points: readonly { date: string; value: number }[] | undefined, day: string): { day: string; price: number } | null {
  if (!points?.length) return null;
  for (let i = points.length - 1; i >= 0; i--) if (points[i].date <= day) return { day: points[i].date, price: points[i].value };
  return null;
}

/** The last close before a day, for SPY at a competition's start: what a trade on its first morning would fill against. */
export function closeBefore(points: readonly { date: string; value: number }[] | undefined, day: string): { day: string; price: number } | null {
  if (!points?.length) return null;
  for (let i = points.length - 1; i >= 0; i--) if (points[i].date < day) return { day: points[i].date, price: points[i].value };
  return points[0] ? { day: points[0].date, price: points[0].value } : null;
}

export const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const fmtShares = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ""));
export const signedPct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

// ---------------------------------------------------------------------------
// The club as a place to work (Hamza, 9 Nov 2026: "implement them", the
// business plan's moat list): its research library, its meetings, its record
// on the league and each member's record carried with them.

export const MAX_PITCHES = 500;
export const PITCH_BODY_MAX = 4000;
export const MAX_MEETINGS = 100;
export const MAX_AGENDA = 12;
/** A club's competition counts on the league only with this many entries, so no one member's book is told apart. */
export const LEAGUE_MIN_ENTRIES = 3;
export const LEAGUE_ROWS = 50;

/** A pitch or thesis a member keeps in the club's library, by ticker; the author's club name, never their address. */
export const pitchSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  symbol: z.string().regex(TICKER),
  title: z.string().min(2).max(120),
  body: z.string().min(1).max(PITCH_BODY_MAX),
  author: z.string().min(1).max(MEMBER_NAME_MAX),
  you: z.boolean(),
  createdAt: z.string(),
  /** The bounty it answers, when it was written for one. */
  bountyId: z.string().nullable().default(null),
  /** The author's bear, base and bull per share and the close on the day it was written, for the club's calibration board. */
  valuation: z.lazy(() => pitchValuationSchema).nullable().default(null),
});
export type Pitch = z.infer<typeof pitchSchema>;

export const VOTES = ["for", "against", "abstain"] as const;
export type Vote = (typeof VOTES)[number];
export const VOTE_WORDS: Record<Vote, string> = { for: "For", against: "Against", abstain: "Abstain" };

/** One item of a meeting's agenda: words, and the ticker or library pitch it is about when it is about one. */
export const agendaItemSchema = z.object({ id: z.string().regex(/^i[0-9]{1,2}$/), text: z.string().min(1).max(200), symbol: z.string().regex(TICKER).nullable(), pitchId: z.string().nullable() });
export type AgendaItem = z.infer<typeof agendaItemSchema>;

/** An investment committee meeting: the day, the agenda, and the minutes once written; the votes are kept beside it. */
export const meetingSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  clubId: z.string().regex(CLUB_ID),
  day: isoDate,
  title: z.string().min(2).max(120),
  items: z.array(agendaItemSchema).min(1).max(MAX_AGENDA),
  minutes: z.string().max(6000).nullable(),
  createdAt: z.string(),
  /** A committee meeting, or an earnings night: the club reads one company's results together and votes after. */
  kind: z.enum(["committee", "earnings"]).default("committee"),
  /** The company an earnings night reads. */
  symbol: z.string().regex(TICKER).nullable().default(null),
});
export type Meeting = z.infer<typeof meetingSchema>;

export type Tally = { for: number; against: number; abstain: number; mine: Vote | null };
export type MeetingView = Meeting & { tallies: Record<string, Tally>; voters: number };

/** What the votes on an item came to: carried when more voted for than against, at least one for. */
export function outcomeOf(t: Tally): "carried" | "not carried" | "no votes" {
  if (!t.for && !t.against && !t.abstain) return "no votes";
  return t.for > t.against ? "carried" : "not carried";
}

/** The agenda from the officer's lines, one item a line; "TICKER: words" ties a line to a ticker, and to the newest library pitch on it. */
export function agendaFrom(text: string, pitches: readonly (Pick<Pitch, "id" | "symbol"> & { createdAt?: string })[]): AgendaItem[] {
  const newest = [...pitches].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, MAX_AGENDA);
  return lines.map((l, i) => {
    const m = /^([A-Za-z][A-Za-z0-9.-]{0,9})\s*[:\-–]\s*(.+)$/.exec(l);
    const sym = m && TICKER.test(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
    const pitch = sym ? (newest.find((p) => p.symbol === sym) ?? null) : null;
    return agendaItemSchema.parse({ id: `i${i + 1}`, text: l.slice(0, 200), symbol: sym, pitchId: pitch?.id ?? null });
  });
}

/** The library by ticker, the newest pitch first within each and the tickers by their newest pitch. */
export function libraryByTicker(pitches: readonly Pitch[]): { symbol: string; pitches: Pitch[] }[] {
  const by = new Map<string, Pitch[]>();
  for (const p of [...pitches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) by.set(p.symbol, [...(by.get(p.symbol) ?? []), p]);
  return [...by.entries()].map(([symbol, ps]) => ({ symbol, pitches: ps }));
}

export const pitchIdFrom = (symbol: string, title: string, at: string) => `${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}-${clubIdFrom(title).replace(/^club-/, "").slice(0, 40) || "pitch"}-${at.replace(/\D/g, "").slice(0, 14)}`.slice(0, 80);
export const meetingIdFrom = (clubId: string, day: string, at: string) => `${clubId}-${day}-${at.replace(/\D/g, "").slice(8, 14)}`.slice(0, 80);

/** The figures of an entry kept for the league and the member's own record: percent and counts, never an amount. */
export const resultSchema = z.object({
  asOf: isoDate,
  returnPct: z.number(),
  againstSpyPts: z.number().nullable(),
  rank: z.number().int().min(1),
  of: z.number().int().min(1),
  trades: z.number().int().min(0),
  reasoned: z.number().int().min(0),
});
export type Result = z.infer<typeof resultSchema>;

/** A competition as the league reads it: its entries' median and best return and SPY's, in percent. */
export const boardSummarySchema = z.object({
  asOf: isoDate,
  entries: z.number().int().min(0),
  medianReturnPct: z.number().nullable(),
  bestReturnPct: z.number().nullable(),
  spyPct: z.number().nullable(),
  medianAgainstSpyPts: z.number().nullable(),
  final: z.boolean(),
});
export type BoardSummary = z.infer<typeof boardSummarySchema>;

const median = (xs: readonly number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The board read down to what the league keeps, and each entry's result by its name. */
export function boardRecords(c: Competition, board: { rows: readonly BoardRow[]; spyPct: number | null }, asOf: string, today: string): { summary: BoardSummary; results: { name: string; result: Result }[] } {
  const rows = board.rows;
  const summary = boardSummarySchema.parse({
    asOf,
    entries: rows.length,
    medianReturnPct: rows.length ? r2(median(rows.map((r) => r.returnPct))!) : null,
    bestReturnPct: rows.length ? r2(Math.max(...rows.map((r) => r.returnPct))) : null,
    spyPct: board.spyPct === null ? null : r2(board.spyPct),
    medianAgainstSpyPts: board.spyPct === null || !rows.length ? null : r2(median(rows.map((r) => r.returnPct))! - board.spyPct),
    final: c.ends < today,
  });
  const results = rows.map((r, i) => ({ name: r.name, result: resultSchema.parse({ asOf, returnPct: r2(r.returnPct), againstSpyPts: r.againstSpyPts === null ? null : r2(r.againstSpyPts), rank: i + 1, of: rows.length, trades: r.trades, reasoned: r.reasoned }) }));
  return { summary, results };
}

/** One club on the league: its newest competition with enough entries, by the median entry against SPY. */
export type LeagueRow = { clubId: string; club: string; about: string | null; competition: string; starts: string; ends: string; summary: BoardSummary };

/** The league table: clubs ranked by their median member against SPY, then by median return; a competition under `LEAGUE_MIN_ENTRIES` entries is not counted. */
export function leagueTable(rows: readonly LeagueRow[]): LeagueRow[] {
  const latest = new Map<string, LeagueRow>();
  for (const r of rows) {
    if (r.summary.entries < LEAGUE_MIN_ENTRIES) continue;
    const prev = latest.get(r.clubId);
    if (!prev || r.ends > prev.ends) latest.set(r.clubId, r);
  }
  const key = (r: LeagueRow) => r.summary.medianAgainstSpyPts ?? r.summary.medianReturnPct ?? -Infinity;
  return [...latest.values()].sort((a, b) => key(b) - key(a) || a.club.localeCompare(b.club)).slice(0, LEAGUE_ROWS);
}

/** A member's record in one competition, kept on their own sign-in when they leave or the club goes, so it graduates with them. */
export const clubRecordSchema = z.object({
  club: z.string().min(1).max(80),
  competition: z.string().min(1).max(80),
  competitionId: z.string().regex(COMPETITION_ID),
  starts: isoDate,
  ends: isoDate,
  result: resultSchema,
  /** Whether the club still counts them as a member; false once kept after they left or it was deleted. */
  current: z.boolean(),
});
export type ClubRecord = z.infer<typeof clubRecordSchema>;

/** A member's record across competitions: how many, the median against SPY, the share of trades with a reason, the best rank. */
export function recordSummary(records: readonly ClubRecord[]): { competitions: number; medianAgainstSpyPts: number | null; reasonedPct: number | null; podiums: number } {
  const vs = records.map((r) => r.result.againstSpyPts).filter((x): x is number => x !== null);
  const trades = records.reduce((n, r) => n + r.result.trades, 0);
  const reasoned = records.reduce((n, r) => n + r.result.reasoned, 0);
  return { competitions: records.length, medianAgainstSpyPts: vs.length ? r2(median(vs)!) : null, reasonedPct: trades ? Math.round((reasoned / trades) * 100) : null, podiums: records.filter((r) => r.result.rank <= 3 && r.result.of >= LEAGUE_MIN_ENTRIES).length };
}

// ---------------------------------------------------------------------------
// Twenty more ways (Hamza, 9 Nov 2026: "think of more, implement them"):
// course grades, reasoned trades judged, challenges between clubs, thesis
// bounties, peer review, a shared watchlist, how the library's picks did and
// the alumni.

/**
 * A coursework grade, out of 100, never on the return: the share of trades
 * with a reason (40), holdings against the course's minimum (30) and the
 * largest weight within the competition's limit (30). An entry with no trade
 * has nothing to grade.
 */
export function gradeOf(c: Pick<Competition, "course" | "maxWeightPct">, row: Pick<BoardRow, "trades" | "reasoned" | "holdings" | "largestWeightPct">): { score: number; parts: string[] } | null {
  if (!c.course || !row.trades) return null;
  const reasons = (row.reasoned / row.trades) * 40;
  const spread = Math.min(1, row.holdings / c.course.minHoldings) * 30;
  const within = c.maxWeightPct === null || row.largestWeightPct <= c.maxWeightPct + 0.05 ? 30 : Math.max(0, 30 - (row.largestWeightPct - c.maxWeightPct) * 3);
  const parts = [`${row.reasoned} of ${row.trades} trades with a reason`, `${row.holdings} of at least ${c.course.minHoldings} holdings`, c.maxWeightPct === null ? "no weight limit" : `largest ${row.largestWeightPct.toFixed(1)}% against a ${c.maxWeightPct}% limit`];
  return { score: Math.round(reasons + spread + within), parts };
}

/** A trade with a reason, judged once a session has passed: a buy is right when it beat SPY since, a sale when the stock then did worse than SPY. */
export type JudgedTrade = { trade: Trade; movePct: number; spyPct: number; right: boolean };

/**
 * Reasoned trades judged against what happened: each trade with a reason,
 * filled before the close read now, by its move from the fill to that close
 * against SPY's over the same days. The thinking is scored, not the luck of
 * the book's total; a trade with no reason or no price is not judged.
 */
export function judgedTrades(trades: readonly Trade[], now: ReadonlyMap<string, number>, spy: readonly { date: string; value: number }[] | undefined, asOf: string): { judged: JudgedTrade[]; right: number; share: number | null } {
  const spyNow = closeOn(spy, asOf);
  const judged: JudgedTrade[] = [];
  for (const t of trades) {
    if (!t.reason || t.day >= asOf) continue;
    const price = now.get(t.symbol);
    const spyThen = closeOn(spy, t.day);
    if (!price || !spyNow || !spyThen) continue;
    const movePct = (price / t.price - 1) * 100;
    const spyPct = (spyNow.price / spyThen.price - 1) * 100;
    judged.push({ trade: t, movePct, spyPct, right: t.side === "buy" ? movePct > spyPct : movePct < spyPct });
  }
  const right = judged.filter((j) => j.right).length;
  return { judged, right, share: judged.length ? Math.round((right / judged.length) * 100) : null };
}

/** One club challenging another to a term on the same rules; each club runs its own side as a competition. */
export const challengeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,90}$/),
  fromClub: z.string().regex(CLUB_ID),
  fromName: z.string().min(1).max(80),
  toClub: z.string().regex(CLUB_ID),
  toName: z.string().min(1).max(80),
  name: z.string().min(2).max(80),
  starts: isoDate,
  ends: isoDate,
  cash: z.number().positive().max(100_000_000),
  maxWeightPct: z.number().positive().max(100).nullable(),
  status: z.enum(["pending", "accepted", "declined"]),
  createdAt: z.string(),
});
export type Challenge = z.infer<typeof challengeSchema>;
/** A challenge as one of its two clubs sees it: its side, and what the league keeps of each side's competition once accepted. */
export type ChallengeView = Challenge & { side: "from" | "to"; mine: BoardSummary | null; theirs: BoardSummary | null; competitionId: string | null };
export const challengeIdFrom = (from: string, to: string, starts: string) => `${from}-v-${to}-${starts.replace(/-/g, "")}`.slice(0, 90);

/** The two sides of a challenge from what the league keeps of each: the club whose median member did better against SPY leads; none until both have three entries. */
export function challengeResult(a: BoardSummary | null, b: BoardSummary | null): { leader: "from" | "to" | "level" | null; gapPts: number | null } {
  const score = (s: BoardSummary | null) => (s && s.entries >= LEAGUE_MIN_ENTRIES ? (s.medianAgainstSpyPts ?? s.medianReturnPct) : null);
  const x = score(a);
  const y = score(b);
  if (x === null || y === null) return { leader: null, gapPts: null };
  const gap = Math.round((x - y) * 100) / 100;
  return { leader: Math.abs(gap) < 0.005 ? "level" : gap > 0 ? "from" : "to", gapPts: Math.abs(gap) };
}

/** A thesis bounty: the club asks for a pitch on one ticker by a day; members pitch into the library and vote the best. */
export const bountySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  clubId: z.string().regex(CLUB_ID),
  symbol: z.string().regex(TICKER),
  question: z.string().min(2).max(200),
  closes: isoDate,
  createdAt: z.string(),
  /** The pitch the votes chose, once an officer closed the bounty. */
  winner: z.string().nullable(),
});
export type Bounty = z.infer<typeof bountySchema>;
export type BountyView = Bounty & { pitches: { id: string; title: string; author: string; votes: number }[]; mine: string | null };

/** The bounty's pitch with the most votes, the earliest on a tie; none with no votes. */
export function bountyWinner(pitches: readonly { id: string; votes: number }[]): string | null {
  const best = [...pitches].filter((p) => p.votes > 0).sort((a, b) => b.votes - a.votes)[0];
  return best?.id ?? null;
}

/** Peer review of a pitch, on its evidence and never its outcome. */
export const REVIEW_WORDS = ["", "No evidence for its claims", "Thin evidence", "Some claims sourced", "Most claims sourced", "Every claim sourced and tested"] as const;
export type ReviewSummary = { count: number; average: number | null; mine: number | null };
export function reviewSummary(scores: readonly { score: number; you: boolean }[]): ReviewSummary {
  const ok = scores.filter((s) => s.score >= 1 && s.score <= 5);
  return { count: ok.length, average: ok.length ? Math.round((ok.reduce((n, s) => n + s.score, 0) / ok.length) * 10) / 10 : null, mine: ok.find((s) => s.you)?.score ?? null };
}

/** The club's shared watchlist: a ticker with a level below or above, which alerts every member when a close reaches it. */
export const MAX_CLUB_WATCH = 60;
export const clubWatchSchema = z.object({
  symbol: z.string().regex(TICKER),
  below: z.number().positive().nullable(),
  above: z.number().positive().nullable(),
  note: z.string().max(200).nullable(),
  addedBy: z.string().min(1).max(MEMBER_NAME_MAX),
  createdAt: z.string(),
});
export type ClubWatch = z.infer<typeof clubWatchSchema>;
export const CLUB_WATCH_PREFIX = "club-watch:";

/** A club watch level a close reached, for every member's Notifications; a ticker with no close is left as it was by the caller. */
export function clubWatchNotices(clubs: readonly { club: Pick<Club, "id" | "name">; items: readonly ClubWatch[] }[], prices: ReadonlyMap<string, number>, today: string): { key: string; date: string; tone: "warn" | "info"; title: string; detail: string; href: string }[] {
  const out: { key: string; date: string; tone: "warn" | "info"; title: string; detail: string; href: string }[] = [];
  for (const { club, items } of clubs) {
    for (const w of items) {
      const p = prices.get(w.symbol);
      if (p === undefined) continue;
      const href = `/clubs/${club.id}?tab=watchlist`;
      if (w.below !== null && p <= w.below) out.push({ key: `${CLUB_WATCH_PREFIX}${club.id}:${w.symbol}:below`, date: today, tone: "warn", title: `${club.name}: ${w.symbol} at or below ${w.below}`, detail: `Closed at ${p.toFixed(2)}, at or below the level the club set${w.note ? `: ${w.note}` : ""}.`, href });
      if (w.above !== null && p >= w.above) out.push({ key: `${CLUB_WATCH_PREFIX}${club.id}:${w.symbol}:above`, date: today, tone: "info", title: `${club.name}: ${w.symbol} at or above ${w.above}`, detail: `Closed at ${p.toFixed(2)}, at or above the level the club set${w.note ? `: ${w.note}` : ""}.`, href });
    }
  }
  return out;
}

/** How the library's picks did: each ticker's first pitch, from the close on its day to the last close, against SPY over the same days. */
export type PickRow = { symbol: string; title: string; author: string; since: string; movePct: number | null; spyPct: number | null; againstPts: number | null };
export function picksScorecard(pitches: readonly Pitch[], series: Readonly<Record<string, readonly { date: string; value: number }[] | undefined>>, asOf: string): { rows: PickRow[]; beat: number; judged: number } {
  const first = new Map<string, Pitch>();
  for (const p of [...pitches].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) if (!first.has(p.symbol)) first.set(p.symbol, p);
  const spyNow = closeOn(series.SPY, asOf);
  const rows = [...first.values()].map((p): PickRow => {
    const day = p.createdAt.slice(0, 10);
    const then = closeOn(series[p.symbol], day);
    const now = closeOn(series[p.symbol], asOf);
    const spyThen = closeOn(series.SPY, day);
    const movePct = then && now && now.day > then.day ? (now.price / then.price - 1) * 100 : null;
    const spyPct = spyThen && spyNow && spyNow.day > spyThen.day ? (spyNow.price / spyThen.price - 1) * 100 : null;
    return { symbol: p.symbol, title: p.title, author: p.author, since: day, movePct, spyPct, againstPts: movePct !== null && spyPct !== null ? movePct - spyPct : null };
  });
  rows.sort((a, b) => (b.againstPts ?? -Infinity) - (a.againstPts ?? -Infinity) || a.symbol.localeCompare(b.symbol));
  const judged = rows.filter((r) => r.againstPts !== null);
  return { rows, beat: judged.filter((r) => r.againstPts! > 0).length, judged: judged.length };
}

/** A past member who chose to be listed: their club name and the years they were in it, never an address. */
export const alumnusSchema = z.object({ name: z.string().min(1).max(MEMBER_NAME_MAX), joined: z.number().int(), left: z.number().int(), role: z.enum(CLUB_ROLES) });
export type Alumnus = z.infer<typeof alumnusSchema>;
/** The alumni by the year they left, the latest first. */
export function alumniByYear(alumni: readonly Alumnus[]): { year: number; people: Alumnus[] }[] {
  const by = new Map<number, Alumnus[]>();
  for (const a of alumni) by.set(a.left, [...(by.get(a.left) ?? []), a]);
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([year, people]) => ({ year, people: people.sort((x, y) => x.name.localeCompare(y.name)) }));
}

/**
 * The path from a club to one's own record (the graduation path): in a
 * club, a book of one's own on the app, a card shared, a methodology listed
 * for others. Each step says whether it is done.
 */
export function graduationSteps(p: { clubs: number; ownBook: boolean; sharing: boolean; listed: boolean }): { id: string; label: string; done: boolean; href: string }[] {
  return [
    { id: "club", label: "Learn in a club", done: p.clubs > 0, href: "/clubs" },
    { id: "own", label: "Run your own book", done: p.ownBook, href: "/setup" },
    { id: "card", label: "Share your card and record", done: p.sharing, href: "/community" },
    { id: "listed", label: "List your methodology for others", done: p.listed, href: "/methodology/market" },
  ];
}


// ---------------------------------------------------------------------------
// Twenty further ways (Hamza, 9 Nov 2026): the course pack, the season, the
// calibration board, the pick fund, alumni mentors and the treasury.

/** Can read the library and review pitches, but enters no competition and votes in no meeting: a past member who stays on to mentor. */
export const mentorsOnly = (role: ClubRole | null | undefined) => role === "alumnus";

/**
 * The course pack for a university: a term's syllabus, week by week, each
 * week a topic, what to read in the app and the task that is graded. The
 * instructor runs the competitions as coursework (`course`), and the grades
 * table (`courseGrades`) reads what each student did, never their return.
 */
export const COURSE_PACK: readonly { week: number; topic: string; read: string; task: string; href: string }[] = [
  { week: 1, topic: "What a methodology is", read: "A framework in the library, its classes and rules", task: "Write three rules you would invest by, each with the figure that tests it.", href: "/methodology/market" },
  { week: 2, topic: "Reading the filings", read: "A company page: key figures, segments and the engine", task: "Pick a company and name the two figures that matter most to its case.", href: "/companies" },
  { week: 3, topic: "Valuation by stage", read: "The valuation calculator and the DCF on a thesis", task: "Value one company at a bear, base and bull per share, and say what each assumes.", href: "/theses" },
  { week: 4, topic: "Writing a thesis", read: "A thesis with pillars, a pathway and kill signals", task: "Pitch a company to the club's library with a valuation.", href: "/clubs" },
  { week: 5, topic: "Sizing and limits", read: "The competition's weight limit and the concentration pack", task: "Open the course competition: at least the minimum holdings, every trade with its reason.", href: "/clubs" },
  { week: 6, topic: "The committee", read: "A meeting's agenda, votes and minutes", task: "Vote on the week's pitches and write one line of minutes.", href: "/clubs" },
  { week: 7, topic: "Earnings night", read: "An earnings report: beats, guidance and the call", task: "Read a holding's results with the club and say whether the thesis holds.", href: "/earnings" },
  { week: 8, topic: "Judging the thinking", read: "Reasoned trades judged against SPY, the calibration board", task: "Review two classmates' pitches on their evidence.", href: "/clubs" },
  { week: 9, topic: "Selling well", read: "Sale post-mortems and the sealed journal", task: "Sell one holding with a reason, and say what would prove the sale wrong.", href: "/trades" },
  { week: 10, topic: "The record", read: "A card's track record and the verified mark", task: "Hand in the competition: the grade reads the reasons, the holdings and the limit.", href: "/community" },
];

/** The instructor's table: each student's grade in each course competition, and their average; a competition with no trade from them is blank. */
export function courseGrades(competitions: readonly { competition: Pick<Competition, "id" | "name" | "course" | "maxWeightPct">; rows: readonly Pick<BoardRow, "name" | "trades" | "reasoned" | "holdings" | "largestWeightPct">[] }[]): { columns: { id: string; name: string }[]; students: { name: string; grades: (number | null)[]; average: number | null }[] } {
  const course = competitions.filter((c) => c.competition.course);
  const names = [...new Set(course.flatMap((c) => c.rows.map((r) => r.name)))].sort((a, b) => a.localeCompare(b));
  const students = names.map((name) => {
    const grades = course.map((c) => {
      const r = c.rows.find((x) => x.name === name);
      return r ? (gradeOf(c.competition, r)?.score ?? null) : null;
    });
    const read = grades.filter((g): g is number => g !== null);
    return { name, grades, average: read.length ? Math.round(read.reduce((a, b) => a + b, 0) / read.length) : null };
  });
  return { columns: course.map((c) => ({ id: c.competition.id, name: c.competition.name })), students };
}

/**
 * The inter-university season: the academic year, September to June. The
 * regular season runs to the end of April; the clubs placed highest by
 * their best competition (the median member against SPY) are the finalists,
 * and the final round is the competitions they start in May and June.
 */
export const FINALISTS = 4;
export const FINAL_FROM_MONTH = 5;
export function seasonOf(day: string): { id: string; starts: string; finalFrom: string; ends: string } {
  const y = Number(day.slice(0, 4));
  const first = Number(day.slice(5, 7)) >= 9 ? y : y - 1;
  return { id: `${first}–${String((first + 1) % 100).padStart(2, "0")}`, starts: `${first}-09-01`, finalFrom: `${first + 1}-0${FINAL_FROM_MONTH}-01`, ends: `${first + 1}-06-30` };
}

export type SeasonRow = { clubId: string; club: string; competition: string; againstSpyPts: number | null; entries: number };

/** The season's table: each club's best competition started in the window, by its median member against SPY. */
function bestPerClub(rows: readonly LeagueRow[], from: string, to: string): SeasonRow[] {
  const best = new Map<string, SeasonRow>();
  for (const r of rows) {
    if (r.starts < from || r.starts >= to || r.summary.entries < LEAGUE_MIN_ENTRIES) continue;
    const row: SeasonRow = { clubId: r.clubId, club: r.club, competition: r.competition, againstSpyPts: r.summary.medianAgainstSpyPts, entries: r.summary.entries };
    const had = best.get(r.clubId);
    if (!had || (row.againstSpyPts ?? -Infinity) > (had.againstSpyPts ?? -Infinity)) best.set(r.clubId, row);
  }
  return [...best.values()].sort((a, b) => (b.againstSpyPts ?? -Infinity) - (a.againstSpyPts ?? -Infinity) || a.club.localeCompare(b.club));
}

export function seasonTable(rows: readonly LeagueRow[], today: string): { season: ReturnType<typeof seasonOf>; regular: SeasonRow[]; finalists: string[]; final: SeasonRow[]; stage: "regular" | "final" | "over" } {
  const season = seasonOf(today);
  const regular = bestPerClub(rows, season.starts, season.finalFrom);
  const finalists = regular.filter((r) => r.againstSpyPts !== null).slice(0, FINALISTS).map((r) => r.clubId);
  const final = bestPerClub(rows.filter((r) => finalists.includes(r.clubId)), season.finalFrom, `${season.ends.slice(0, 4)}-07-01`);
  const stage = today < season.finalFrom ? "regular" : today <= season.ends ? "final" : "over";
  return { season, regular, finalists, final, stage };
}

/** The author's own valuation on a pitch: bear, base and bull per share, and the close on the day it was written. */
export const pitchValuationSchema = z.object({ bear: z.number().positive(), base: z.number().positive(), bull: z.number().positive(), price: z.number().positive().nullable() }).refine((v) => v.bear <= v.base && v.base <= v.bull, "Bear, base and bull go from lowest to highest.");
export type PitchValuation = z.infer<typeof pitchValuationSchema>;

/** A pitch's valuation is judged once this many days have passed. */
export const CLUB_CALIBRATION_DAYS = 90;

export type CalibrationRow = { author: string; judged: number; withinPct: number | null; medianBaseErrorPct: number | null; waiting: number };

/**
 * The club's calibration board: for each author, the pitches with a
 * valuation old enough to judge, the share whose price now sits between
 * their bear and bull, and how far the base was from the price, the median
 * in percent. The best calibrated first; it scores the judgement, not the
 * pick's return.
 */
export function clubCalibration(pitches: readonly Pitch[], prices: ReadonlyMap<string, number>, today: string): CalibrationRow[] {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - CLUB_CALIBRATION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const by = new Map<string, { within: number; judged: number; errors: number[]; waiting: number }>();
  for (const p of pitches) {
    if (!p.valuation) continue;
    const e = by.get(p.author) ?? { within: 0, judged: 0, errors: [], waiting: 0 };
    const now = prices.get(p.symbol);
    if (p.createdAt.slice(0, 10) > cutoff || now === undefined) e.waiting += 1;
    else {
      e.judged += 1;
      if (now >= p.valuation.bear && now <= p.valuation.bull) e.within += 1;
      e.errors.push(Math.abs(p.valuation.base / now - 1) * 100);
    }
    by.set(p.author, e);
  }
  const rows = [...by.entries()].map(([author, e]): CalibrationRow => ({ author, judged: e.judged, withinPct: e.judged ? Math.round((e.within / e.judged) * 100) : null, medianBaseErrorPct: median(e.errors) === null ? null : Math.round(median(e.errors)! * 10) / 10, waiting: e.waiting }));
  return rows.sort((a, b) => (b.withinPct ?? -1) - (a.withinPct ?? -1) || (a.medianBaseErrorPct ?? Infinity) - (b.medianBaseErrorPct ?? Infinity) || a.author.localeCompare(b.author));
}

/**
 * The club's pick fund: a dollar put in each ticker's first pitch at the
 * close on its day, held since, beside a dollar in SPY on the same days.
 * The line is the fund's and SPY's return on what was put in so far; virtual,
 * equal-weight, never anyone's money.
 */
export function pickFund(pitches: readonly Pitch[], series: Readonly<Record<string, readonly { date: string; value: number }[] | undefined>>, asOf: string): { points: { date: string; fundPct: number; spyPct: number }[]; picks: number; unpriced: string[]; fundPct: number | null; spyPct: number | null } {
  const first = new Map<string, Pitch>();
  for (const p of [...pitches].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) if (!first.has(p.symbol)) first.set(p.symbol, p);
  const spy = series.SPY ?? [];
  const legs: { symbol: string; day: string; buy: number; spyBuy: number }[] = [];
  const unpriced: string[] = [];
  for (const p of first.values()) {
    const day = p.createdAt.slice(0, 10);
    const buy = closeOn(series[p.symbol], day);
    const spyBuy = closeOn(spy, day);
    if (!buy || !spyBuy) unpriced.push(p.symbol);
    else legs.push({ symbol: p.symbol, day: buy.day, buy: buy.price, spyBuy: spyBuy.price });
  }
  if (!legs.length) return { points: [], picks: 0, unpriced, fundPct: null, spyPct: null };
  const start = legs.reduce((a, l) => (l.day < a ? l.day : a), legs[0].day);
  const days = spy.filter((p) => p.date >= start && p.date <= asOf);
  const points = days.flatMap((d) => {
    const live = legs.filter((l) => l.day <= d.date);
    if (!live.length) return [];
    let fund = 0;
    let spyVal = 0;
    for (const l of live) {
      const c = closeOn(series[l.symbol], d.date);
      fund += c ? c.price / l.buy : 1;
      spyVal += d.value / l.spyBuy;
    }
    return [{ date: d.date, fundPct: Math.round((fund / live.length - 1) * 1000) / 10, spyPct: Math.round((spyVal / live.length - 1) * 1000) / 10 }];
  });
  const last = points.at(-1) ?? null;
  return { points, picks: legs.length, unpriced, fundPct: last?.fundPct ?? null, spyPct: last?.spyPct ?? null };
}

/**
 * The club's treasury: when a club runs real money, its treasurer links
 * their own book as the club's and the app publishes, from it, only the
 * weights in percent and the trades by day, symbol and side, never an
 * amount, a price or a share count. Kept in the registry, refreshed when the
 * treasurer opens the app.
 */
export const TREASURY_TRADE_DAYS = 365;
export const treasurySchema = z.object({
  holder: z.string().min(1).max(MEMBER_NAME_MAX),
  asOf: isoDate,
  weights: z.array(z.object({ symbol: z.string().regex(TICKER), weightPct: z.number().min(0).max(100) })).max(200),
  trades: z.array(z.object({ day: isoDate, symbol: z.string().regex(TICKER), side: z.enum(["buy", "sell"]) })).max(1000),
});
export type Treasury = z.infer<typeof treasurySchema>;

/** The treasury as published from the treasurer's book: each listed holding's weight in percent, the year's trades by day, symbol and side; never an amount, a price or a count. */
export function treasuryFrom(holder: string, weights: readonly { symbol: string; weight: number }[], transactions: readonly { kind: string; symbol: string; date: string; quantity: number }[], today: string): Treasury {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - TREASURY_TRADE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const trades: Treasury["trades"] = [];
  for (const t of transactions) {
    const symbol = t.symbol.trim().toUpperCase();
    if ((t.kind !== "buy" && t.kind !== "sell") || !t.quantity || t.date < from || t.date > today || !TICKER.test(symbol)) continue;
    const key = `${t.date}:${symbol}:${t.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trades.push({ day: t.date, symbol, side: t.kind });
  }
  return treasurySchema.parse({
    holder: holder.slice(0, MEMBER_NAME_MAX),
    asOf: today,
    weights: weights.filter((w) => TICKER.test(w.symbol.toUpperCase()) && w.weight > 0).slice(0, 200).map((w) => ({ symbol: w.symbol.toUpperCase(), weightPct: Math.round(Math.min(100, w.weight) * 10) / 10 })),
    trades: trades.sort((a, b) => b.day.localeCompare(a.day)).slice(0, 1000),
  });
}

/** Days after a meeting within which a trade counts as acting on its vote. */
export const VOTE_ACT_DAYS = 30;

export type VoteAct = { meeting: string; day: string; item: string; symbol: string; side: "buy" | "sell"; outcome: "carried" | "not carried"; traded: string | null; verdict: "followed" | "not acted on" | "traded against the vote" | "kept to the vote" | "waiting" };

/** The side an agenda line asks for: a sale, a trim or an exit is a sale; anything else on a ticker a buy. */
export const itemSide = (text: string): "buy" | "sell" => (/\b(sell|sale|trim|exit|reduce|cut)\b/i.test(text) ? "sell" : "buy");

/**
 * The votes set against the treasury's trades: each item on a ticker with a
 * result, and the first trade on that ticker in its direction within
 * `VOTE_ACT_DAYS` after the meeting. A carried item traded is followed, a
 * carried one not traded once the window is over is not acted on, one voted
 * down but traded anyway is traded against the vote.
 */
export function votesAndTrades(meetings: readonly MeetingView[], trades: readonly Treasury["trades"][number][], today: string): VoteAct[] {
  const out: VoteAct[] = [];
  for (const m of meetings) {
    const until = new Date(Date.parse(`${m.day}T00:00:00Z`) + VOTE_ACT_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const it of m.items) {
      if (!it.symbol) continue;
      const t = m.tallies[it.id];
      const outcome = t ? outcomeOf(t) : "no votes";
      if (outcome === "no votes") continue;
      const side = itemSide(it.text);
      const traded = trades.filter((x) => x.symbol === it.symbol && x.side === side && x.day >= m.day && x.day <= until).sort((a, b) => a.day.localeCompare(b.day))[0]?.day ?? null;
      const open = today <= until;
      const verdict: VoteAct["verdict"] = outcome === "carried" ? (traded ? "followed" : open ? "waiting" : "not acted on") : traded ? "traded against the vote" : open ? "waiting" : "kept to the vote";
      out.push({ meeting: m.title, day: m.day, item: it.text, symbol: it.symbol, side, outcome, traded, verdict });
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
