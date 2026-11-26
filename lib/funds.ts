/**
 * What the top funds own, from their 13F filings (Hamza, 21 Oct 2026, after
 * Unusual Whales: "follow funds' 13Fs seeing what top institutional funds are
 * doing and rank them by closeness to user's methodology"). Every manager of
 * more than $100 million files a 13F with the SEC within 45 days of each
 * quarter's end, listing its US-listed long positions; the app reads the
 * latest and the one before for a fixed list of well-known long-term
 * managers (`FUNDS`), from SEC EDGAR alone (lib/edgar.ts), and keeps the
 * largest positions in the vault's `funds` file. Each position is matched to
 * its company by the issuer's name in the SEC's own list, so the person's
 * methodology can be run on it with the screener's figures: a fund is close
 * to the methodology by the share of its 13F in companies the person's
 * classes would own (`closenessOf`), beside the overlap with their own book.
 * A 13F shows long US positions only, at the quarter's end, filed weeks
 * later; the screen says so. Nothing is forecast and nothing is advice.
 *
 * Pure: the list, the parser, the moves and the ranking.
 */
import { z } from "zod";

import type { CompanyRow } from "@/lib/edgar-facts";

/** `before`: CIKs that filed the fund's 13F earlier, read for the quarters the current filer has not filed. */
export type FundDef = { id: string; name: string; manager: string; cik: number; before?: readonly number[] };

/** Long-term managers whose 13Fs people follow, each checked against its SEC record (21 Oct 2026). */
export const FUNDS: readonly FundDef[] = [
  { id: "berkshire", name: "Berkshire Hathaway", manager: "Warren Buffett, Greg Abel and team", cik: 1067983 },
  { id: "akre", name: "Akre Capital Management", manager: "Chuck Akre's team", cik: 1112520 },
  { id: "fundsmith", name: "Fundsmith", manager: "Terry Smith", cik: 1569205 },
  { id: "himalaya", name: "Himalaya Capital", manager: "Li Lu", cik: 1709323 },
  // Pershing Square Capital Management's holdings are in its public parent's 13F, Pershing Square Inc., from the quarter to 30 Jun 2026 (its 13F-NT of 14 Aug 2026; checked 6 Nov 2026).
  { id: "pershing", name: "Pershing Square", manager: "Bill Ackman", cik: 2026053, before: [1336528] },
  { id: "baupost", name: "Baupost Group", manager: "Seth Klarman", cik: 1061768 },
  { id: "ruane", name: "Ruane, Cunniff & Goldfarb", manager: "The Sequoia Fund's managers", cik: 1720792 },
  { id: "polen", name: "Polen Capital", manager: "Polen's growth team", cik: 1034524 },
  { id: "duquesne", name: "Duquesne Family Office", manager: "Stanley Druckenmiller", cik: 1536411 },
  { id: "appaloosa", name: "Appaloosa", manager: "David Tepper", cik: 1656456 },
  { id: "altimeter", name: "Altimeter Capital", manager: "Brad Gerstner", cik: 1541617 },
  { id: "coatue", name: "Coatue Management", manager: "Philippe Laffont", cik: 1135730 },
  { id: "lone_pine", name: "Lone Pine Capital", manager: "Stephen Mandel's firm", cik: 1061165 },
  { id: "tiger_global", name: "Tiger Global Management", manager: "Chase Coleman", cik: 1167483 },
  { id: "viking", name: "Viking Global Investors", manager: "Andreas Halvorsen", cik: 1103804 },
  { id: "third_point", name: "Third Point", manager: "Dan Loeb", cik: 1040273 },
  { id: "valueact", name: "ValueAct Capital", manager: "ValueAct's partners", cik: 1418814 },
  // Greenlight's 13F has been filed by its adviser, DME Capital Management, since the 2024 filings (checked 23 Oct 2026).
  { id: "greenlight", name: "Greenlight Capital", manager: "David Einhorn", cik: 1489933 },
  { id: "gates", name: "Gates Foundation Trust", manager: "The Gates Foundation's trust", cik: 1166559 },
];

/**
 * How a fund is read: a fund kept under an earlier reading is read again,
 * its tables and its matches (2: the 13F's abbreviations and cut names
 * matched to the SEC's list, a table in thousands put in dollars; 3: a
 * company list the SEC did not answer no longer leaves a fund with no
 * companies matched; 23 Oct 2026).
 */
export const FUNDS_READ = 3;
/** A fund is ranked only when this share of its 13F, in percent, is in companies the screener has figures for. */
export const MIN_JUDGED_PCT = 25;
/** A latest 13F for a quarter this many days gone is old: the manager has stopped filing, or files under another name. */
export const STALE_FILING_DAYS = 200;
/** Positions kept per filing, the largest first; the moves compare these. */
export const MAX_POSITIONS = 60;
/** Each fund's filing list is looked at again after this many days; a new 13F is read the run after it lands. */
export const FUNDS_REFRESH_DAYS = 7;
/** A position moved by this many points of the fund's 13F counts as added or trimmed. */
export const MOVE_PTS = 0.5;
/** Moves listed per kind. */
export const MAX_MOVES = 8;

export const positionSchema = z.object({
  name: z.string().max(120),
  cusip: z.string().max(12),
  /** In US dollars, as the 13F reports it. */
  value: z.number(),
  shares: z.number().nullable(),
  /** Of the filing's long equity value, in percent. */
  pct: z.number(),
  ticker: z.string().max(12).nullable().default(null),
});
export type Position = z.infer<typeof positionSchema>;

export const fundFilingSchema = z.object({
  accession: z.string().max(30),
  /** The quarter's end the 13F reports, and when it was filed. */
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The long equity value and the count of positions in the whole filing. */
  total: z.number(),
  count: z.number(),
  positions: z.array(positionSchema).max(MAX_POSITIONS),
});
export type FundFiling = z.infer<typeof fundFilingSchema>;

const moveSchema = z.object({ name: z.string().max(120), ticker: z.string().max(12).nullable(), pct: z.number(), before: z.number() });
export type FundMove = z.infer<typeof moveSchema>;
export const movesSchema = z.object({ bought: z.array(moveSchema).max(MAX_MOVES), added: z.array(moveSchema).max(MAX_MOVES), trimmed: z.array(moveSchema).max(MAX_MOVES), sold: z.array(moveSchema).max(MAX_MOVES) });
export type FundMoves = z.infer<typeof movesSchema>;

export const fundSchema = z.object({
  id: z.string().max(40),
  cik: z.number(),
  name: z.string().max(120),
  manager: z.string().max(120),
  checkedAt: z.string(),
  latest: fundFilingSchema.nullable(),
  /** The quarter before, by position, for the moves; its accession. */
  previous: z.object({ accession: z.string().max(30), period: z.string(), pct: z.record(z.string(), z.number()) }).nullable().default(null),
  moves: movesSchema.nullable().default(null),
  error: z.string().max(300).nullable().default(null),
  /** The reading it was kept under (FUNDS_READ); a fund kept before the field is 1. */
  read: z.number().default(1),
});
export type Fund = z.infer<typeof fundSchema>;

export const fundsFileSchema = z.object({ version: z.literal(1), byId: z.record(z.string(), fundSchema).default({}), updated: z.string() });
export type FundsFile = z.infer<typeof fundsFileSchema>;
export const EMPTY_FUNDS: FundsFile = { version: 1, byId: {}, updated: "" };

export type FilingRef = { accession: string; period: string; filed: string; document: string };

/**
 * A fund's 13Fs across the filers that have carried it, newest quarter first,
 * each with the CIK that filed it; a quarter two filers both filed keeps the
 * current filer's (the first list).
 */
export function fundFilings(lists: readonly { cik: number; refs: readonly FilingRef[] }[]): (FilingRef & { cik: number })[] {
  const out: (FilingRef & { cik: number })[] = [];
  for (const { cik, refs } of lists) for (const r of refs) if (!out.some((o) => o.period === r.period)) out.push({ ...r, cik });
  return out.sort((a, b) => b.period.localeCompare(a.period) || b.filed.localeCompare(a.filed));
}

/** The fund's 13F-HR filings in the submissions, newest first (an amendment is left out: it may add to or restate the original). */
export function thirteenFsOf(json: unknown): FilingRef[] {
  const r = (json as { filings?: { recent?: Record<string, unknown[]> } })?.filings?.recent;
  if (!r || !Array.isArray(r.form)) throw new Error("no filings list");
  const out: FilingRef[] = [];
  r.form.forEach((form, i) => {
    if (form !== "13F-HR") return;
    const period = String(r.reportDate?.[i] ?? "");
    const filed = String(r.filingDate?.[i] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !/^\d{4}-\d{2}-\d{2}$/.test(filed)) return;
    out.push({ accession: String(r.accessionNumber?.[i] ?? ""), period, filed, document: String(r.primaryDocument?.[i] ?? "") });
  });
  return out.filter((x) => x.accession).sort((a, b) => b.filed.localeCompare(a.filed));
}

/** The information table among a 13F's files: the XML whose name says so, else any XML but the cover page. */
export function infoTableName(index: unknown): string | null {
  const items = (index as { directory?: { item?: { name?: string }[] } })?.directory?.item;
  if (!Array.isArray(items)) throw new Error("no index items");
  const xml = items.map((i) => String(i.name ?? "")).filter((n) => /\.xml$/i.test(n) && !/^primary_doc\.xml$/i.test(n));
  return xml.find((n) => /info/i.test(n)) ?? xml[0] ?? null;
}

const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').trim() : null;
};

export type InfoRow = { name: string; cusip: string; value: number; shares: number | null };

/**
 * The information table's long positions, one row per security: rows of the
 * same CUSIP (several managers, several discretions) added up; a put or a
 * call left out, since it is an option on the stock, not the stock; the
 * largest first. The value is in dollars, as the SEC has asked since 2023;
 * a filer still writing thousands shows its shares at a median price under a
 * dollar, and its values are put in dollars (`inDollars`).
 */
export function parseInfoTable(xml: string): InfoRow[] {
  const blocks = xml.match(/<(?:\w+:)?infoTable\b[^>]*>[\s\S]*?<\/(?:\w+:)?infoTable>/gi) ?? [];
  if (!blocks.length) throw new Error("no infoTable entries");
  const by = new Map<string, InfoRow>();
  for (const b of blocks) {
    if (tag(b, "putCall")) continue;
    const cusip = (tag(b, "cusip") ?? "").toUpperCase();
    const value = Number((tag(b, "value") ?? "").replace(/,/g, ""));
    if (!cusip || !Number.isFinite(value) || value <= 0) continue;
    const kind = (tag(b, "sshPrnamtType") ?? "SH").toUpperCase();
    const shares = kind === "SH" ? Number((tag(b, "sshPrnamt") ?? "").replace(/,/g, "")) : NaN;
    const was = by.get(cusip);
    by.set(cusip, { name: was?.name ?? (tag(b, "nameOfIssuer") ?? cusip).slice(0, 120), cusip, value: (was?.value ?? 0) + value, shares: Number.isFinite(shares) ? (was?.shares ?? 0) + shares : (was?.shares ?? null) });
  }
  return inDollars([...by.values()]).sort((a, b) => b.value - a.value);
}

/** A table in thousands (the median position's value over its shares under a dollar) put in dollars; any other as it is. */
export function inDollars(rows: InfoRow[]): InfoRow[] {
  const prices = rows.filter((r) => r.shares && r.shares > 0).map((r) => r.value / r.shares!).sort((a, b) => a - b);
  if (!prices.length || prices[Math.floor(prices.length / 2)] >= 1) return rows;
  return rows.map((r) => ({ ...r, value: r.value * 1000 }));
}

/** A filing as kept: the total and count of the whole table, its largest positions with their share. */
export function filingOf(rows: readonly InfoRow[], ref: Pick<FilingRef, "accession" | "period" | "filed">): FundFiling {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return { ...ref, total, count: rows.length, positions: rows.slice(0, MAX_POSITIONS).map((r) => ({ ...r, pct: total > 0 ? (r.value / total) * 100 : 0, ticker: null })) };
}

/** Every position's share by CUSIP, for comparing with the next quarter. */
export function sharesByCusip(rows: readonly InfoRow[]): Record<string, number> {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return Object.fromEntries(rows.filter((r) => total > 0 && (r.value / total) * 100 >= 0.05).map((r) => [r.cusip, Number(((r.value / total) * 100).toFixed(3))]));
}

/** The 13F's abbreviations, written out as the SEC's list writes the names (BANK OF AMER CORP, APPLIED MATLS INC, ASML HLDG NV). */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  AIRLS: "AIRLINES", AMER: "AMERICA", AMERN: "AMERICAN", APT: "APARTMENT", BK: "BANK", CHEM: "CHEMICAL", CMNTYS: "COMMUNITIES", COMMNS: "COMMUNICATIONS",
  COS: "COMPANIES", CTZNS: "CITIZENS", ENTMT: "ENTERTAINMENT", FINL: "FINANCIAL", FMRS: "FARMERS", GRDN: "GARDEN", GRP: "GROUP", HLDG: "HOLDING",
  HLDGS: "HOLDINGS", HLDNGS: "HOLDINGS", INDS: "INDUSTRIES", INSTRS: "INSTRUMENTS", INTL: "INTERNATIONAL", INVT: "INVESTMENT", LABS: "LABORATORIES",
  MANUFAC: "MANUFACTURING", MATLS: "MATERIALS", MFG: "MANUFACTURING", MGMT: "MANAGEMENT", MKT: "MARKET", MKTS: "MARKETS", MTRS: "MOTORS",
  NATL: "NATIONAL", PETE: "PETROLEUM", PPTYS: "PROPERTIES", RLTY: "REALTY", RY: "RAILWAY", SOUTHN: "SOUTHERN", SPRT: "SPORTS", SVCS: "SERVICES",
  SVSC: "SERVICES", SYS: "SYSTEMS", TECHN: "TECHNOLOGIES",
};
/** Words that close a name without naming the company: legal forms, the state or country of incorporation, the class of share. */
const CLOSING = new Set([
  "CORP", "CORPORATION", "INC", "INCORPORATED", "LTD", "LIMITED", "PLC", "CO", "COMPANY", "HOLDING", "HOLDINGS", "COM", "SA", "NV", "AG", "SE", "LLC", "LP", "PUB", "PUBLIC",
  "DEL", "DE", "NEW", "MD", "PA", "NY", "NJ", "VA", "NV", "MN", "OH", "TX", "IND", "WIS", "UK", "IRELAND", "BERMUDA", "JERSEY", "CAYMAN",
  "CL", "CLASS", "A", "B", "C", "SHS", "ORD", "ADR", "ADS", "SPONSORED", "SPON", "REG", "CAP", "STK",
]);
const CLOSING_LIST = [...CLOSING];

/** A name as words to compare: punctuation and a state marker (/DE/) gone, runs of single letters joined (L P, N V), the 13F's abbreviations written out, "the" and closing words dropped. */
export function issuerWords(name: string): string[] {
  const words = name
    .toUpperCase()
    .replace(/\s+(FORMERLY|FKA)\b.*$/, "")
    .replace(/\/[A-Z]{2,3}\/?/g, " ")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const joined: string[] = [];
  let letters = false;
  for (const w of words) {
    if (w.length === 1 && letters) joined[joined.length - 1] += w;
    else joined.push(w);
    letters = w.length === 1 && /[A-Z]/.test(w);
  }
  const out = joined.map((w) => ABBREVIATIONS[w] ?? w);
  if (out[0] === "THE") out.shift();
  while (out.length > 1 && CLOSING.has(out[out.length - 1])) out.pop();
  return out;
}

const keyed = new WeakMap<readonly CompanyRow[], { row: CompanyRow; words: string[]; key: string; flat: string }[]>();
function keysOf(rows: readonly CompanyRow[]) {
  let k = keyed.get(rows);
  if (!k) {
    k = rows.map((row) => {
      const words = issuerWords(row.title);
      return { row, words, key: words.join(" "), flat: words.join("") };
    });
    keyed.set(rows, k);
  }
  return k;
}
/** The one company among the candidates, by CIK; none when they are several. */
const onlyOne = (hits: { row: CompanyRow }[]): CompanyRow | null => (hits.length && hits.every((h) => h.row.cik === hits[0].row.cik) ? hits[0].row : null);

/**
 * A 13F position's company in the SEC's list, by the issuer's name alone (a
 * 13F gives a CUSIP, which no free list maps to a ticker): the names equal
 * once written out (BANK OF AMER CORP is Bank of America Corp), or equal with
 * the spaces gone (SIRIUSXM, Sirius XM); else the name cut short by the 13F's
 * field (TAIWAN SEMICONDUCTOR MANUFAC, AUTOMATIC DATA PROCESSING IN) as the
 * start of exactly one company's, never a guess between several. Among equal
 * names the SEC's order wins, which lists the largest first, as does the
 * first ticker it lists for the company.
 */
export function issuerCompany(rows: readonly CompanyRow[], name: string): CompanyRow | null {
  let want = issuerWords(name);
  if (!want.length) return null;
  const all = keysOf(rows);
  const tries = [want];
  // A last word cut from a closing word (IN for INC, COR for CORP, D for DEL) leaves the name before it.
  const last = want[want.length - 1];
  if (want.length > 1 && CLOSING_LIST.some((c) => c !== last && c.startsWith(last))) {
    want = want.slice(0, -1);
    while (want.length > 1 && CLOSING.has(want[want.length - 1])) want.pop();
    tries.push(want);
  }
  for (const w of tries) {
    const key = w.join(" ");
    const equal = all.find((r) => r.key === key) ?? all.find((r) => r.flat === w.join(""));
    if (equal) return equal.row;
  }
  const cut = tries[0];
  if (cut.join(" ").length < 4 || cut.length < 2) return null;
  const end = cut.length - 1;
  return onlyOne(all.filter((r) => r.words.length >= cut.length && cut.every((x, i) => (i < end ? r.words[i] === x : r.words[i].startsWith(x)))));
}


/** What changed since the quarter before: new positions, positions grown or cut by MOVE_PTS, positions gone; the largest first. */
export function movesOf(latest: FundFiling, latestAll: Record<string, number>, previous: Fund["previous"], prevNames: Readonly<Record<string, { name: string; ticker: string | null }>> = {}): FundMoves | null {
  if (!previous) return null;
  const at = (c: string) => latest.positions.find((p) => p.cusip === c);
  const bought: FundMove[] = [];
  const added: FundMove[] = [];
  const trimmed: FundMove[] = [];
  for (const p of latest.positions) {
    const before = previous.pct[p.cusip] ?? 0;
    const move = { name: p.name, ticker: p.ticker, pct: p.pct, before };
    if (!before) bought.push(move);
    else if (p.pct - before >= MOVE_PTS) added.push(move);
    else if (before - p.pct >= MOVE_PTS) trimmed.push(move);
  }
  const sold: FundMove[] = Object.entries(previous.pct)
    .filter(([c, pct]) => !(c in latestAll) && pct >= MOVE_PTS && !at(c))
    .map(([c, pct]) => ({ name: prevNames[c]?.name ?? c, ticker: prevNames[c]?.ticker ?? null, pct: 0, before: pct }));
  const by = (f: (m: FundMove) => number) => (a: FundMove, b: FundMove) => f(b) - f(a);
  return {
    bought: bought.sort(by((m) => m.pct)).slice(0, MAX_MOVES),
    added: added.sort(by((m) => m.pct - m.before)).slice(0, MAX_MOVES),
    trimmed: trimmed.sort(by((m) => m.before - m.pct)).slice(0, MAX_MOVES),
    sold: sold.sort(by((m) => m.before)).slice(0, MAX_MOVES),
  };
}

export type Closeness = {
  /** The share of the fund's 13F in companies a class of the person's methodology takes, of the share the app could judge. */
  fit: number | null;
  /** The share of the 13F the app could judge: matched to a company with figures. */
  judged: number;
  /** The share in each class, of the whole 13F. */
  byClass: { id: string; label: string; pct: number }[];
  /** The fund's positions the person's classes take, the largest first. */
  fits: { ticker: string; name: string; pct: number; classId: string }[];
  /** The book's overlap with the fund: the sum of the smaller of the two weights over the companies both hold, in percent. */
  overlap: number;
  shared: string[];
};

/**
 * How close a fund is to the person's methodology: its kept positions run
 * through the person's classes (`classOf`: a class id, null when the
 * company's figures place it in none, undefined when the app has no figures
 * for it), and its overlap with the book's weights by symbol.
 */
export function closenessOf(fund: Fund, classOf: (ticker: string) => string | null | undefined, labels: ReadonlyMap<string, string>, weights: ReadonlyMap<string, number>): Closeness | null {
  const f = fund.latest;
  if (!f) return null;
  let judged = 0;
  let fits = 0;
  const byClass = new Map<string, number>();
  const fitting: Closeness["fits"] = [];
  let overlap = 0;
  const shared: string[] = [];
  for (const p of f.positions) {
    if (!p.ticker) continue;
    const w = weights.get(p.ticker);
    if (w) {
      overlap += Math.min(w, p.pct);
      shared.push(p.ticker);
    }
    const c = classOf(p.ticker);
    if (c === undefined) continue;
    judged += p.pct;
    if (c === null) continue;
    fits += p.pct;
    byClass.set(c, (byClass.get(c) ?? 0) + p.pct);
    fitting.push({ ticker: p.ticker, name: p.name, pct: p.pct, classId: c });
  }
  return {
    fit: judged >= 1 ? (fits / judged) * 100 : null,
    judged,
    byClass: [...byClass.entries()].map(([id, pct]) => ({ id, label: labels.get(id) ?? id, pct })).sort((a, b) => b.pct - a.pct),
    fits: fitting,
    overlap,
    shared,
  };
}

export type RankedFund = { fund: Fund; closeness: Closeness | null };

/** The funds, the closest to the methodology first (then the larger overlap, then the name); a fund the app could judge too little of goes after them. */
export function rankFunds(file: FundsFile | null, closeness: (f: Fund) => Closeness | null, today?: string): RankedFund[] {
  const rows = Object.values(file?.byId ?? {}).map((fund) => ({ fund, closeness: closeness(fund) }));
  const score = (r: RankedFund) => (today && staleFiling(r.fund, today) ? -2 : r.closeness?.fit !== null && r.closeness?.fit !== undefined && r.closeness.judged >= MIN_JUDGED_PCT ? r.closeness.fit : -1);
  return rows.sort((a, b) => score(b) - score(a) || (b.closeness?.overlap ?? 0) - (a.closeness?.overlap ?? 0) || a.fund.name.localeCompare(b.fund.name));
}

/** The fund's latest 13F is for a quarter STALE_FILING_DAYS gone or more: it is ranked last and says so. */
export function staleFiling(fund: Fund, today: string): boolean {
  return !!fund.latest && Date.parse(`${today}T00:00:00Z`) - Date.parse(`${fund.latest.period}T00:00:00Z`) >= STALE_FILING_DAYS * 86_400_000;
}

/** The funds due a look: never read, kept under an earlier reading, or looked at FUNDS_REFRESH_DAYS ago or more. */
export function fundsDue(file: FundsFile | null, now: Date): FundDef[] {
  return FUNDS.filter((d) => {
    const kept = file?.byId[d.id];
    return !kept || kept.read < FUNDS_READ || now.getTime() - Date.parse(kept.checkedAt) >= FUNDS_REFRESH_DAYS * 86_400_000 || kept.cik !== d.cik;
  });
}
