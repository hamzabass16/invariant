import { z } from "zod";

import { reactionMove, REACTION_BENCHMARK, type EarningsReport } from "@/lib/earnings";
import type { ExpectedMove } from "@/lib/expected-move";
import { daysBetween } from "@/lib/time";

/**
 * How the stock took each of its last results (Hamza, 23 Oct 2026, after
 * Rallies.AI): the release days from the company's own SEC submissions (an
 * 8-K with item 2.02, timed by the SEC's acceptance clock, before the open
 * or after the close), the reports the app kept, and the move on each from
 * the closes the app already reads, beside SPY's over the same sessions and
 * the move the options priced when one was read. Nothing is forecast and no
 * estimate is read: the history is the closes. Pure.
 */

/** Results shown, newest first: two years of quarters. */
export const REACTION_HISTORY = 8;
/** Two filings with results within this many days are one release (an amended 8-K, a second exhibit). */
const SAME_RELEASE_DAYS = 20;

export type ReleaseDay = { date: string; time: "pre" | "post"; form: string; url: string | null };

const submissionsSchema = z
  .object({
    filings: z
      .object({
        recent: z
          .object({
            accessionNumber: z.array(z.string()),
            form: z.array(z.string()),
            filingDate: z.array(z.string()),
            acceptanceDateTime: z.array(z.string()).optional(),
            primaryDocument: z.array(z.string()).optional(),
            items: z.array(z.string()).optional(),
          })
          .loose(),
      })
      .loose(),
  })
  .loose();

/**
 * When the SEC accepted a filing, on its own clock. The submissions write the
 * acceptance time with a Z, but it is New York's wall clock (the SEC's
 * filer manual), so 16:05 is five past the close. Before 16:00 the session
 * that day trades on it ("pre", the move from the close before); from 16:00
 * the next session does.
 */
export function releaseTime(accepted: string | undefined): "pre" | "post" | null {
  const m = accepted?.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) >= 16 * 60 ? "post" : "pre";
}

/**
 * The results releases in a company's SEC submissions: each 8-K that carries
 * item 2.02 (Results of Operations), the earliest of any filed within
 * SAME_RELEASE_DAYS of each other, newest first. A 6-K filer's releases are
 * not marked by an item, so they come from the reports the app kept instead.
 * Throws when the document is not a submissions list.
 */
export function releaseDays(json: unknown, cik: number, link: (cik: number, accession: string, doc: string | undefined) => string, since: string): ReleaseDay[] {
  const r = submissionsSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document with recent filings");
  const f = r.data.filings.recent;
  const found: ReleaseDay[] = [];
  for (let i = 0; i < f.form.length; i++) {
    if (f.form[i] !== "8-K") continue;
    const filed = f.filingDate[i];
    if (!filed || filed < since || !/^\d{4}-\d{2}-\d{2}$/.test(filed)) continue;
    if (!(f.items?.[i] ?? "").split(",").map((x) => x.trim()).includes("2.02")) continue;
    const accepted = f.acceptanceDateTime?.[i];
    // A filing accepted after 17:30 is dated the next business day; the acceptance day is when it was out.
    const day = accepted && /^\d{4}-\d{2}-\d{2}T/.test(accepted) ? accepted.slice(0, 10) : filed;
    found.push({ date: day, time: releaseTime(accepted) ?? "post", form: "8-K", url: f.accessionNumber[i] ? link(cik, f.accessionNumber[i], f.primaryDocument?.[i] || undefined) : null });
  }
  found.sort((a, b) => a.date.localeCompare(b.date));
  const out: ReleaseDay[] = [];
  for (const d of found) {
    const last = out.at(-1);
    if (last && daysBetween(last.date, d.date) <= SAME_RELEASE_DAYS) continue;
    out.push(d);
  }
  return out.reverse();
}

type Close = { date: string; value: number };

export type ReactionRow = {
  /** The day the results were out, and when. */
  date: string;
  time: "pre" | "post" | "unknown";
  quarter: string | null;
  session: string;
  movePct: number;
  benchmarkPct: number | null;
  /** The move less SPY's over the same sessions. */
  againstPct: number | null;
  /** The move the options priced, when one was read before the results. */
  pricedPct: number | null;
  /** The filing or the report kept, to open. */
  href: string | null;
  /** Why, when the report after the results carries it. */
  why: string | null;
};

export type ReactionHistory = {
  rows: ReactionRow[];
  /** Over the rows: how many rose, the average size of the move either way, the average against SPY, how often the move beat the priced one. */
  summary: { count: number; up: number; avgAbsPct: number; avgAgainstPct: number | null; beyondPriced: number; priced: number } | null;
  /** What the history could not read, in a sentence. */
  note: string | null;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The last REACTION_HISTORY results and the move on each: the reports kept
 * (their own reaction when read, else the closes), then the SEC's release
 * days for the quarters no report covers (a release within five days of a
 * report is that report). A release whose session has not closed, or with no
 * close on either side, is left out.
 */
export function reactionHistory(i: {
  releases: readonly ReleaseDay[];
  reports: readonly Pick<EarningsReport, "symbol" | "date" | "time" | "quarter" | "reaction">[];
  closes: readonly Close[];
  bench: readonly Close[] | null;
  settled: string;
  expected?: readonly ExpectedMove[];
  symbol: string;
  reportHref?: (r: Pick<EarningsReport, "symbol" | "date">) => string;
  note?: string | null;
}): ReactionHistory {
  const sym = i.symbol.toUpperCase();
  const reports = i.reports.filter((r) => r.symbol.toUpperCase() === sym);
  type Day = { date: string; time: "pre" | "post" | "unknown"; quarter: string | null; href: string | null; kept: (typeof reports)[number] | null };
  const days: Day[] = reports.map((r) => ({ date: r.date, time: r.time, quarter: r.quarter, href: i.reportHref?.(r) ?? null, kept: r }));
  for (const d of i.releases) {
    const twin = days.find((x) => Math.abs(daysBetween(x.date, d.date)) <= 5);
    if (twin) {
      // The SEC's clock beats a calendar that gave no time: its day and its time together, since a release after the close is dated the day before the session that trades on it.
      if (twin.time === "unknown" && !twin.kept?.reaction) {
        twin.date = d.date;
        twin.time = d.time;
      }
      continue;
    }
    days.push({ date: d.date, time: d.time, quarter: null, href: d.url, kept: null });
  }
  const rows: ReactionRow[] = [];
  for (const d of days.sort((a, b) => b.date.localeCompare(a.date))) {
    if (rows.length >= REACTION_HISTORY) break;
    const kept = d.kept?.reaction ?? null;
    const move = kept ?? reactionMove({ date: d.date, time: d.time }, i.closes, i.bench, i.settled);
    if (!move) continue;
    const priced = i.expected?.find((e) => e.symbol.toUpperCase() === sym && e.date === d.date)?.pct ?? null;
    const bench = move.benchmark === REACTION_BENCHMARK ? move.benchmarkPct : null;
    rows.push({
      date: d.date,
      time: d.time,
      quarter: d.quarter,
      session: move.session,
      movePct: move.movePct,
      benchmarkPct: bench,
      againstPct: bench === null ? null : round2(move.movePct - bench),
      pricedPct: priced,
      href: d.href,
      why: kept?.why ?? null,
    });
  }
  if (!rows.length) return { rows, summary: null, note: i.note ?? null };
  const against = rows.filter((r) => r.againstPct !== null);
  const priced = rows.filter((r) => r.pricedPct !== null);
  return {
    rows,
    summary: {
      count: rows.length,
      up: rows.filter((r) => r.movePct > 0).length,
      avgAbsPct: round2(rows.reduce((a, r) => a + Math.abs(r.movePct), 0) / rows.length),
      avgAgainstPct: against.length ? round2(against.reduce((a, r) => a + r.againstPct!, 0) / against.length) : null,
      beyondPriced: priced.filter((r) => Math.abs(r.movePct) > r.pricedPct!).length,
      priced: priced.length,
    },
    note: i.note ?? null,
  };
}

/** The summary in a sentence: "Rose after 5 of the last 8 results; the move averaged 6.1% either way, 0.8 points ahead of SPY." */
export function historyWords(s: NonNullable<ReactionHistory["summary"]>): string {
  const rose = `Rose after ${s.up} of the last ${s.count} results`;
  const size = `the move averaged ${s.avgAbsPct.toFixed(1)}% either way`;
  const vs = s.avgAgainstPct === null ? "" : `, ${Math.abs(s.avgAgainstPct).toFixed(1)} points ${s.avgAgainstPct >= 0 ? "ahead of" : "behind"} ${REACTION_BENCHMARK} on the same sessions`;
  const priced = s.priced ? `; it moved more than the options priced ${s.beyondPriced} of ${s.priced} times` : "";
  return `${rose}; ${size}${vs}${priced}.`;
}
