import { measuredFrom, thesisFor, type MarketThesis, type ThesesFile } from "@/lib/theses";

/**
 * The thesis scorecard (Hamza, 23 Oct 2026, after Rallies.AI): each stock
 * thesis, held or watched, and each market thesis with a basket, measured
 * against SPY from the day it was written. A stock thesis is its company's
 * price from the close on or before that day; a basket is its companies in
 * equal parts, each from its own close. It keeps score of the ideas, not of
 * the book: what was bought and when is Performance's. Pure.
 */

type Close = { date: string; value: number };

export const SCORE_BENCHMARK = "SPY";

export type ScoreRow = {
  key: string;
  kind: "stock" | "market";
  title: string;
  href: string;
  /** The day measured from, and whether it is only the thesis's last change (written before the day was kept). */
  since: string;
  approx: boolean;
  /** For a stock, held or only watched; for a market thesis, neither. */
  held: boolean | null;
  /** The companies measured: the symbol, or the basket's members that have closes. */
  members: string[];
  /** Members with no close on or after the day, named. */
  missing: string[];
  returnPct: number | null;
  benchmarkPct: number | null;
  againstPct: number | null;
};

export type Scorecard = { rows: ScoreRow[]; summary: { measured: number; ahead: number; avgAgainstPct: number | null } };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The move from the close on or before `since` (else the first close after it) to the last close; null without two closes. */
export function returnSince(closes: readonly Close[] | null | undefined, since: string): number | null {
  if (!closes?.length) return null;
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const base = [...sorted].reverse().find((c) => c.date <= since) ?? sorted.find((c) => c.date > since);
  const last = sorted.at(-1)!;
  if (!base || base.date >= last.date || !(base.value > 0)) return null;
  return round2((last.value / base.value - 1) * 100);
}

/** Every symbol the scorecard reads closes for, SPY included. */
export function scorecardSymbols(file: ThesesFile | null, subjects: readonly { symbol: string }[]): string[] {
  const out = new Set<string>([SCORE_BENCHMARK]);
  for (const s of subjects) if (thesisFor(file, s.symbol)?.text.trim()) out.add(s.symbol.toUpperCase());
  for (const m of file?.markets ?? []) for (const b of m.basket) out.add(b);
  return [...out];
}

/** The earliest day any thesis is measured from, for how many days of closes to read. */
export function earliestSince(file: ThesesFile | null): string | null {
  const days = [...Object.values(file?.bySymbol ?? {}).filter((t) => t.text.trim()), ...(file?.markets ?? []).filter((m) => m.basket.length)].map((t) => measuredFrom(t).day);
  return days.sort()[0] ?? null;
}

const basketReturn = (m: MarketThesis, series: Record<string, readonly Close[]>, since: string) => {
  const each = m.basket.map((s) => ({ s, r: returnSince(series[s], since) }));
  const got = each.filter((x) => x.r !== null);
  return { members: got.map((x) => x.s), missing: each.filter((x) => x.r === null).map((x) => x.s), r: got.length ? round2(got.reduce((a, x) => a + x.r!, 0) / got.length) : null };
};

/**
 * The scorecard: the stock theses with words (the subjects the Theses screen
 * lists, held first), then the market theses with a basket, each against SPY
 * over the same days, the best against SPY first among those measured.
 */
export function thesisScorecard(file: ThesesFile | null, subjects: readonly { symbol: string; held: boolean }[], series: Record<string, readonly Close[]>): Scorecard {
  const rows: ScoreRow[] = [];
  const spy = series[SCORE_BENCHMARK] ?? null;
  const against = (r: number | null, b: number | null) => (r === null || b === null ? null : round2(r - b));
  for (const s of subjects) {
    const t = thesisFor(file, s.symbol);
    if (!t?.text.trim()) continue;
    const { day, approx } = measuredFrom(t);
    const r = returnSince(series[s.symbol.toUpperCase()], day);
    const b = returnSince(spy, day);
    rows.push({ key: `stock:${s.symbol}`, kind: "stock", title: s.symbol.toUpperCase(), href: `/theses/${encodeURIComponent(s.symbol.toUpperCase())}`, since: day, approx, held: s.held, members: r === null ? [] : [s.symbol.toUpperCase()], missing: r === null ? [s.symbol.toUpperCase()] : [], returnPct: r, benchmarkPct: b, againstPct: against(r, b) });
  }
  for (const m of file?.markets ?? []) {
    if (!m.basket.length) continue;
    const { day, approx } = measuredFrom(m);
    const x = basketReturn(m, series, day);
    const b = returnSince(spy, day);
    rows.push({ key: `market:${m.id}`, kind: "market", title: m.title, href: `/theses/market/${encodeURIComponent(m.id)}`, since: day, approx, held: null, members: x.members, missing: x.missing, returnPct: x.r, benchmarkPct: b, againstPct: against(x.r, b) });
  }
  const measured = rows.filter((r) => r.againstPct !== null);
  rows.sort((a, b) => (b.againstPct ?? -Infinity) - (a.againstPct ?? -Infinity));
  return { rows, summary: { measured: measured.length, ahead: measured.filter((r) => r.againstPct! > 0).length, avgAgainstPct: measured.length ? round2(measured.reduce((a, r) => a + r.againstPct!, 0) / measured.length) : null } };
}

/** "6 of 9 theses are ahead of SPY since they were written, by 3.4 points on average." */
export function scorecardWords(s: Scorecard["summary"]): string {
  if (!s.measured) return "No thesis has a close to measure from yet.";
  const avg = s.avgAgainstPct === null ? "" : `; on average ${Math.abs(s.avgAgainstPct).toFixed(1)} points ${s.avgAgainstPct >= 0 ? "ahead of" : "behind"} it`;
  return `${s.ahead} of ${s.measured} ${s.measured === 1 ? "thesis is" : "theses are"} ahead of ${SCORE_BENCHMARK} since ${s.measured === 1 ? "it was" : "they were"} written${avg}.`;
}
