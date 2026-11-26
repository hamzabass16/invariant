/**
 * Parsers for the public macro sources the market feed reads beside its
 * daily prices: the New York Fed's rates and balance sheet, Freddie Mac's
 * mortgage survey, the BLS, the University of Michigan's sentiment survey,
 * CNN's fear and greed index and the Treasury's monthly statement. Each takes
 * the text a source sent and returns dated points, oldest first; each throws
 * when the text is not what that source sends, so a changed or refused answer
 * is a sentence on the screen, never an empty series. Pure: the fetch lives
 * in lib/markets-feed.ts.
 */
import type { MarketPoint } from "@/lib/markets";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`not ${what}`);
  }
}

/** Points sorted by date, one per date (the last one given wins). */
function tidy(pts: MarketPoint[]): MarketPoint[] {
  const byDate = new Map<string, number>();
  for (const p of pts) if (DATE.test(p.date) && Number.isFinite(p.value)) byDate.set(p.date, p.value);
  return [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A New York Fed reference rate answer (EFFR, SOFR): refRates of effectiveDate and percentRate, newest first. */
export function parseNyFedRates(text: string): MarketPoint[] {
  const j = json(text, "a New York Fed rates answer");
  const rows = isObj(j) && Array.isArray(j.refRates) ? j.refRates : null;
  if (!rows) throw new Error("not a New York Fed rates answer");
  const pts = rows.flatMap((r) => (isObj(r) && typeof r.effectiveDate === "string" && typeof r.percentRate === "number" ? [{ date: r.effectiveDate, value: r.percentRate }] : []));
  if (!pts.length) throw new Error("the New York Fed sent no rates");
  return tidy(pts);
}

/** The New York Fed's System Open Market Account summary: each Wednesday's total holdings (dollars, as text), in billions of dollars. */
export function parseSoma(text: string): MarketPoint[] {
  const j = json(text, "a SOMA summary");
  const rows = isObj(j) && isObj(j.soma) && Array.isArray(j.soma.summary) ? j.soma.summary : null;
  if (!rows) throw new Error("not a SOMA summary");
  const pts = rows.flatMap((r) => {
    if (!isObj(r) || typeof r.asOfDate !== "string") return [];
    const total = Number(r.total);
    return typeof r.total === "string" && r.total !== "" && Number.isFinite(total) && total > 0 ? [{ date: r.asOfDate, value: Math.round(total / 1e7) / 100 }] : [];
  });
  if (!pts.length) throw new Error("the SOMA summary has no totals");
  return tidy(pts);
}

/** Freddie Mac's mortgage survey history: date (M/D/YYYY), pmms30, ...; the 30-year fixed rate, in percent. Blank weeks are skipped. */
export function parsePmms(text: string): MarketPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0]?.split(",").map((s) => s.trim().toLowerCase()) ?? [];
  const d = head.indexOf("date");
  const v = head.indexOf("pmms30");
  if (d < 0 || v < 0) throw new Error("not Freddie Mac's mortgage survey");
  const pts: MarketPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const m = cells[d]?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) ?? cells[d]?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const raw = cells[v]?.trim();
    if (!m || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    const date = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    pts.push({ date, value });
  }
  if (!pts.length) throw new Error("Freddie Mac's survey has no weeks");
  return tidy(pts);
}

/** A BLS public API answer for one series: data of year, period (M01 to M12; M13 is the annual average and skipped) and value, dated the first of the month. */
export function parseBls(text: string, series: string): MarketPoint[] {
  const j = json(text, "a BLS answer");
  if (!isObj(j) || j.status !== "REQUEST_SUCCEEDED" || !isObj(j.Results) || !Array.isArray(j.Results.series)) throw new Error("not a BLS answer");
  const s = j.Results.series.find((x) => isObj(x) && x.seriesID === series) ?? j.Results.series[0];
  const data = isObj(s) && Array.isArray(s.data) ? s.data : [];
  const pts = data.flatMap((r) => {
    if (!isObj(r)) return [];
    const m = typeof r.period === "string" ? r.period.match(/^M(0[1-9]|1[0-2])$/) : null;
    const value = Number(r.value);
    return m && typeof r.year === "string" && /^\d{4}$/.test(r.year) && Number.isFinite(value) ? [{ date: `${r.year}-${m[1]}-01`, value }] : [];
  });
  if (!pts.length) throw new Error("the BLS sent no months");
  return tidy(pts);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * The University of Michigan's monthly sentiment table (tbmics.csv): a row
 * per month with the month's name, the year and the index, under a title line
 * or two. Read by shape, not by column name: the first month name, the first
 * four-digit year and the first number after them.
 */
export function parseUmich(text: string): MarketPoint[] {
  const pts: MarketPoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(",").map((c) => c.replace(/"/g, "").trim());
    const mi = cells.findIndex((c) => MONTHS.some((m) => c.toLowerCase() === m || (c.length >= 3 && m.startsWith(c.toLowerCase()))));
    if (mi < 0) continue;
    const month = MONTHS.findIndex((m) => m.startsWith(cells[mi].toLowerCase())) + 1;
    const yi = cells.findIndex((c, i) => i !== mi && /^\d{4}$/.test(c));
    if (yi < 0) continue;
    const vi = cells.findIndex((c, i) => i > Math.max(mi, yi) && c !== "" && Number.isFinite(Number(c)));
    if (vi < 0) continue;
    pts.push({ date: `${cells[yi]}-${String(month).padStart(2, "0")}-01`, value: Number(cells[vi]) });
  }
  if (!pts.length) throw new Error("not the Michigan sentiment table");
  return tidy(pts);
}

/** CNN's fear and greed index: the year's history (x in epoch milliseconds, y the score) and today's headline score, 0 to 100. */
export function parseFearGreed(text: string): MarketPoint[] {
  const j = json(text, "CNN's fear and greed index");
  const hist = isObj(j) && isObj(j.fear_and_greed_historical) && Array.isArray(j.fear_and_greed_historical.data) ? j.fear_and_greed_historical.data : null;
  if (!hist) throw new Error("not CNN's fear and greed index");
  const pts = hist.flatMap((p) => (isObj(p) && typeof p.x === "number" && typeof p.y === "number" ? [{ date: new Date(p.x).toISOString().slice(0, 10), value: Math.round(p.y * 10) / 10 }] : []));
  const now = isObj(j) && isObj(j.fear_and_greed) ? j.fear_and_greed : null;
  if (now && typeof now.score === "number" && typeof now.timestamp === "string" && DATE.test(now.timestamp.slice(0, 10))) pts.push({ date: now.timestamp.slice(0, 10), value: Math.round(now.score * 10) / 10 });
  if (!pts.length) throw new Error("CNN's index has no days");
  return tidy(pts);
}

/** The Treasury's Monthly Statement, table 4, filtered to one line: each month's net receipts (dollars, as text; "null" when blank), in billions of dollars. */
export function parseMtsReceipts(text: string): MarketPoint[] {
  const j = json(text, "a Treasury statement answer");
  const rows = isObj(j) && Array.isArray(j.data) ? j.data : null;
  if (!rows) throw new Error("not a Treasury statement answer");
  const pts = rows.flatMap((r) => {
    if (!isObj(r) || typeof r.record_date !== "string") return [];
    const v = Number(r.current_month_net_rcpt_amt);
    return r.current_month_net_rcpt_amt !== "null" && Number.isFinite(v) ? [{ date: r.record_date, value: Math.round(v / 1e7) / 100 }] : [];
  });
  if (!pts.length) throw new Error("the Treasury statement has no months");
  return tidy(pts);
}

/** Year-on-year change of a monthly series, in percent: each month against the same month a year before; months without that base are left out. */
export function yearOnYear(pts: readonly MarketPoint[]): MarketPoint[] {
  const byMonth = new Map(pts.map((p) => [p.date.slice(0, 7), p.value]));
  return pts.flatMap((p) => {
    const base = byMonth.get(`${Number(p.date.slice(0, 4)) - 1}${p.date.slice(4, 7)}`);
    return base ? [{ date: p.date, value: Math.round(((p.value - base) / Math.abs(base)) * 1e4) / 100 }] : [];
  });
}

/** The sum of the twelve months to each month, for a seasonal monthly flow; a month whose year has a gap is left out. */
export function trailingYear(pts: readonly MarketPoint[]): MarketPoint[] {
  const byMonth = new Map(pts.map((p) => [p.date.slice(0, 7), p.value]));
  return pts.flatMap((p) => {
    let sum = 0;
    const [y, m] = [Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7))];
    for (let k = 0; k < 12; k++) {
      const mm = m - k;
      const key = `${mm > 0 ? y : y - 1}-${String(mm > 0 ? mm : mm + 12).padStart(2, "0")}`;
      const v = byMonth.get(key);
      if (v === undefined) return [];
      sum += v;
    }
    return [{ date: p.date, value: Math.round(sum * 100) / 100 }];
  });
}

/** The Treasury's daily par yield curve tenors the market feed reads, as the CSV names its columns. */
export const TREASURY_TENORS = ["3 Mo", "2 Yr", "5 Yr", "10 Yr", "30 Yr"] as const;
export type TreasuryTenor = (typeof TREASURY_TENORS)[number];

/** One CSV line split on commas outside quotes, each cell unquoted and trimmed. */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

/**
 * The US Treasury's daily par yield curve for one year
 * (home.treasury.gov ... daily-treasury-rates.csv/<year>/all?type=daily_treasury_yield_curve):
 * `Date,"1 Mo","1.5 Month",...,"10 Yr","20 Yr","30 Yr"`, dates MM/DD/YYYY,
 * newest first, a blank cell for a tenor not quoted that day. The tenor's
 * column, in percent. Throws when there is no Date column or no such tenor.
 */
export function parseTreasuryPar(text: string, tenor: string): MarketPoint[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error("not the Treasury's par yield curve");
  const head = csvCells(lines[0]);
  const di = head.findIndex((h) => h.toLowerCase() === "date");
  const ti = head.findIndex((h) => h === tenor);
  if (di < 0 || ti < 0) throw new Error("not the Treasury's par yield curve");
  const pts: MarketPoint[] = [];
  for (const line of lines.slice(1)) {
    const c = csvCells(line);
    const m = c[di]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const v = Number(c[ti]);
    if (!m || c[ti] === "" || !Number.isFinite(v)) continue;
    pts.push({ date: `${m[3]}-${m[1]}-${m[2]}`, value: v });
  }
  return tidy(pts);
}

/**
 * The ECB's euro reference rates of the day (eurofxref-daily.xml): the date
 * and units of each currency per euro, the euro itself as 1. Throws when the
 * text is not that file.
 */
export function parseEcbDaily(text: string): { date: string; perEuro: Record<string, number> } {
  const date = text.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) throw new Error("not the ECB's reference rates");
  const perEuro: Record<string, number> = { EUR: 1 };
  for (const m of text.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g)) {
    const v = Number(m[2]);
    if (Number.isFinite(v) && v > 0) perEuro[m[1]] = v;
  }
  if (Object.keys(perEuro).length < 2) throw new Error("not the ECB's reference rates");
  return { date, perEuro };
}

/** Units of `base` per one unit of `currency` through the euro, or null when either is not quoted. */
export function ecbCross(perEuro: Record<string, number>, currency: string, base: string): number | null {
  const c = perEuro[currency];
  const b = perEuro[base];
  if (!c || !b) return null;
  return b / c;
}
