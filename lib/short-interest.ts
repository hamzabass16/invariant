/**
 * Short interest from FINRA (Hamza, 21 Oct 2026, after Unusual Whales): the
 * shares sold short in each company the person holds or watches, as brokers
 * report them to FINRA twice a month, at the settlement dates in the middle
 * and at the end of each month. FINRA publishes each file about a week and a
 * half later, free and with no key:
 *
 *   https://cdn.finra.org/equity/otcmarket/biweekly/shrtYYYYMMDD.csv
 *
 * The file lists every security; only the person's symbols are kept, on the
 * filings file beside the filings read. Two fields of the ontology come
 * from it: `short_interest_pct` (the shares short over the shares
 * outstanding the filings report; none for a listing whose filings count
 * other shares, an ADR) and `days_to_cover` (the shares short over the
 * average daily volume, as FINRA computes it).
 *
 * Pure: the settlement dates, the parser and the fields. lib/markets-feed.ts
 * fetches.
 */
import { z } from "zod";

import { MARKET_HOLIDAYS } from "@/lib/live";
import { addDaysTo } from "@/lib/time";

export const FINRA_FILE = (settlement: string) => `https://cdn.finra.org/equity/otcmarket/biweekly/shrt${settlement.replace(/-/g, "")}.csv`;
export const FINRA_PAGE = "https://www.finra.org/finra-data/browse-catalog/equity-short-interest/files";

/** Settlement dates tried, newest first, before the read says none was published. */
export const SETTLEMENTS_TRIED = 4;

export const shortInterestSchema = z.object({
  settlement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Shares sold short at the settlement date, and at the one before. */
  short: z.number(),
  previous: z.number().nullable(),
  /** The average daily volume over the period, and the days it would take to cover, as FINRA gives them. */
  averageVolume: z.number().nullable(),
  daysToCover: z.number().nullable(),
  /** The shares short over the shares outstanding the filings report, in percent; null for an ADR or without a share count. */
  pctOfShares: z.number().nullable(),
  /** The market FINRA files it under (NYSE, Nasdaq, Other OTC). */
  market: z.string().max(40).nullable(),
});
export type ShortInterest = z.infer<typeof shortInterestSchema>;

const isBusinessDay = (d: string) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6 && !MARKET_HOLIDAYS.includes(d);
};
const backToBusinessDay = (d: string) => {
  let x = d;
  while (!isBusinessDay(x)) x = addDaysTo(x, -1);
  return x;
};

/**
 * FINRA's settlement dates on or before `today`, newest first: the 15th and
 * the last day of each month, each moved back to the business day before
 * when it falls on a weekend or a market holiday (30 Oct 2026 for the 31st, a
 * Saturday; 13 Nov for the 15th, a Sunday).
 */
export function settlementDates(today: string, count = SETTLEMENTS_TRIED): string[] {
  const out: string[] = [];
  let y = +today.slice(0, 4);
  let m = +today.slice(5, 7);
  while (out.length < count) {
    const mm = String(m).padStart(2, "0");
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    for (const d of [backToBusinessDay(last), backToBusinessDay(`${y}-${mm}-15`)]) if (d <= today && out.length < count && !out.includes(d)) out.push(d);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** A file published by FINRA is about a week and a half after its date; until then it is not asked for. */
export const PUBLISHED_AFTER_DAYS = 7;

const ALIASES: Record<"symbol" | "short" | "previous" | "volume" | "days" | "settlement" | "market", string[]> = {
  symbol: ["symbolcode", "issuesymbolidentifier", "symbol"],
  short: ["currentshortpositionquantity", "currentshortsharenumber", "currentshortposition"],
  previous: ["previousshortpositionquantity", "previousshortsharenumber", "previousshortposition"],
  volume: ["averagedailyvolumequantity", "averageshortsharenumber", "averagedailyvolume"],
  days: ["daystocoverquantity", "daystocovernumber", "daystocover"],
  settlement: ["settlementdate"],
  market: ["marketclasscode", "marketcategorydescription", "marketcategorycode"],
};

const num = (v: string | undefined) => {
  if (v === undefined) return null;
  const n = Number(v.replace(/[",\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** One line's cells: a quoted cell may hold the delimiter ("9,000,000"). */
function cellsOf(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * The rows of FINRA's file for the symbols asked, by symbol. The file is
 * pipe-delimited (comma in some downloads), its header named either way
 * FINRA has named it; the delimiter and the columns are read from the header.
 * Throws when the header names no symbol or short position.
 */
export function parseShortFile(text: string, symbols: readonly string[]): Map<string, Omit<ShortInterest, "pctOfShares">> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error("empty file");
  const head = lines[0];
  const delim = (head.match(/\|/g)?.length ?? 0) >= (head.match(/,/g)?.length ?? 0) ? "|" : ",";
  const cols = cellsOf(head, delim).map((c) => c.toLowerCase());
  // The first of a field's names the header carries, in the order the aliases give them.
  const at = (k: keyof typeof ALIASES) => ALIASES[k].map((a) => cols.indexOf(a)).find((i) => i >= 0) ?? -1;
  const ix = { symbol: at("symbol"), short: at("short"), previous: at("previous"), volume: at("volume"), days: at("days"), settlement: at("settlement"), market: at("market") };
  if (ix.symbol < 0 || ix.short < 0) throw new Error("no symbol or short position column");
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const out = new Map<string, Omit<ShortInterest, "pctOfShares">>();
  for (const line of lines.slice(1)) {
    const cells = cellsOf(line, delim);
    const symbol = cells[ix.symbol]?.toUpperCase();
    if (!symbol || !want.has(symbol)) continue;
    const short = num(cells[ix.short]);
    if (short === null) continue;
    const s = ix.settlement >= 0 ? cells[ix.settlement] : "";
    const settlement = /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
    const days = ix.days >= 0 ? num(cells[ix.days]) : null;
    out.set(symbol, {
      settlement,
      short,
      previous: ix.previous >= 0 ? num(cells[ix.previous]) : null,
      averageVolume: ix.volume >= 0 ? num(cells[ix.volume]) : null,
      daysToCover: days,
      market: ix.market >= 0 ? cells[ix.market]?.slice(0, 40) || null : null,
    });
  }
  return out;
}

/** The row with its share of the shares outstanding: none for a filer in another currency (its filed shares are not the listed ones) or without a count. */
export function withShareCount(row: Omit<ShortInterest, "pctOfShares">, settlement: string, shares: number | null, filedInUsd: boolean): ShortInterest {
  return { ...row, settlement: row.settlement || settlement, pctOfShares: shares && shares > 0 && filedInUsd ? (row.short / shares) * 100 : null };
}

/** The two ontology fields from a row. */
export function shortFields(s: ShortInterest | null | undefined): { short_interest_pct: number | null; days_to_cover: number | null } {
  return { short_interest_pct: s?.pctOfShares ?? null, days_to_cover: s?.daysToCover ?? null };
}

/** The change since the settlement before, in percent; null without the earlier figure. */
export function shortChangePct(s: ShortInterest): number | null {
  return s.previous && s.previous > 0 ? ((s.short - s.previous) / s.previous) * 100 : null;
}
