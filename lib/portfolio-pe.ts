/**
 * The portfolio's price to earnings, pure (Hamza, 19 Oct 2026). Today's is
 * the harmonic mean of the listed holdings' own P/E by value (what the book
 * pays for a dollar of the companies' trailing earnings, its share of each),
 * from the filings' pe_ratio; a holding with no P/E (no filings, a loss, a
 * fund) is left out and named. The year's range reads each holding's daily
 * closes against its trailing EPS as it was known then (the filings'
 * epsTtm, a quarter taken as known EPS_KNOWN_AFTER_DAYS after it ended), at
 * today's shares and today's exchange rate; a holding without a year of
 * both is left out of the range and named, never guessed.
 */

export type PeHolding = {
  symbol: string;
  /** Its value in the base currency today. */
  value: number;
  /** The price its P/E was read at, in its own currency. */
  price: number | null;
  pe: number | null;
  /** Trailing EPS by the day each quarter ended, oldest first. */
  epsTtm: readonly { end: string; eps: number }[] | null;
  /** Daily closes in its own currency, oldest first. */
  closes: readonly { date: string; value: number }[] | null;
};

export type PortfolioPe = {
  pe: number | null;
  /** Earnings over price, in percent. */
  earningsYield: number | null;
  /** The share of the listed holdings' value the P/E covers, in percent. */
  coveredPct: number;
  /** Each holding in today's P/E, largest weight first; weight is its share of the covered value, in percent. */
  included: { symbol: string; pe: number; weight: number }[];
  left: { symbol: string; why: string }[];
  /** The portfolio's P/E each session of the year, oldest first. */
  history: { date: string; pe: number }[];
  /** The range of the history and today's P/E together; null without enough history. */
  range: { low: number; high: number; median: number; lowOn: string; highOn: string; from: string; to: string } | null;
  /** Holdings in today's P/E that the range leaves out, and why. */
  historyLeft: { symbol: string; why: string }[];
  /** The share of today's covered value the range reads, in percent. */
  historyPct: number;
};

/** The quarterly report is due 40 to 45 days after the quarter: until then the quarter before is what was known. */
export const EPS_KNOWN_AFTER_DAYS = 45;
/** A P/E below this is a misread (a split the filings have not restated, or earnings in another currency), so it is named rather than let pull the harmonic mean down. */
export const MIN_PLAUSIBLE_PE = 3;
/** Fewer sessions than this make no range. */
export const MIN_HISTORY_POINTS = 20;
/** A close this many days old still stands for a session the holding did not trade. */
const STALE_CLOSE_DAYS = 7;

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(at(d) + n * DAY).toISOString().slice(0, 10);

/** Value over earnings, summed: the book's P/E on what it holds. */
const harmonic = (rows: readonly { value: number; pe: number }[]) => {
  const v = rows.reduce((s, r) => s + r.value, 0);
  const e = rows.reduce((s, r) => s + r.value / r.pe, 0);
  return v > 0 && e > 0 ? v / e : null;
};

/** The last close on or before the day, within STALE_CLOSE_DAYS; null otherwise. */
function closeOn(closes: readonly { date: string; value: number }[], day: string, from = 0): { value: number; i: number } | null {
  let i = from;
  while (i + 1 < closes.length && closes[i + 1].date <= day) i++;
  const c = closes[i];
  if (!c || c.date > day || at(day) - at(c.date) > STALE_CLOSE_DAYS * DAY) return null;
  return { value: c.value, i };
}

/** The trailing EPS known on the day: the latest quarter ended EPS_KNOWN_AFTER_DAYS or more before it. */
function epsKnown(eps: readonly { end: string; eps: number }[], day: string): number | null {
  const cut = addDays(day, -EPS_KNOWN_AFTER_DAYS);
  let out: number | null = null;
  for (const e of eps) if (e.end <= cut) out = e.eps;
  return out;
}

export function portfolioPe(rows: readonly PeHolding[], today: string, days = 365): PortfolioPe {
  const listedValue = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  const left: PortfolioPe["left"] = [];
  const priced: (PeHolding & { pe: number })[] = [];
  for (const r of rows) {
    if (r.value <= 0) continue;
    if (r.pe === null) left.push({ symbol: r.symbol, why: "no P/E in its filings" });
    else if (r.pe <= 0) left.push({ symbol: r.symbol, why: "trailing earnings are not positive" });
    else if (r.pe < MIN_PLAUSIBLE_PE) left.push({ symbol: r.symbol, why: `a P/E under ${MIN_PLAUSIBLE_PE}× reads as a split or a currency its filings do not match yet` });
    else priced.push({ ...r, pe: r.pe });
  }
  const pe = harmonic(priced);
  const covered = priced.reduce((s, r) => s + r.value, 0);
  const included = priced.map((r) => ({ symbol: r.symbol, pe: r.pe, weight: covered ? (r.value / covered) * 100 : 0 })).sort((a, b) => b.weight - a.weight);
  const empty = { pe, earningsYield: pe ? 100 / pe : null, coveredPct: listedValue ? (covered / listedValue) * 100 : 0, included, left, history: [], range: null, historyPct: 0 };

  // The range: each holding with a year of closes and the EPS known across it, at today's shares and rate.
  const from = addDays(today, -days);
  const historyLeft: PortfolioPe["historyLeft"] = [];
  const traced: { symbol: string; value: number; k: number; last: number; closes: readonly { date: string; value: number }[]; eps: readonly { end: string; eps: number }[] }[] = [];
  for (const r of priced) {
    const closes = (r.closes ?? []).filter((c) => c.date >= addDays(from, -STALE_CLOSE_DAYS) && c.date <= today && c.value > 0);
    const eps = r.epsTtm ?? [];
    const epsNow = eps.at(-1)?.eps ?? null;
    if (!eps.length || epsNow === null) historyLeft.push({ symbol: r.symbol, why: "no trailing EPS by quarter in its filings yet" });
    else if (closes.length < MIN_HISTORY_POINTS || closes[0].date > addDays(from, STALE_CLOSE_DAYS)) historyLeft.push({ symbol: r.symbol, why: "no year of daily closes" });
    else if (epsKnown(eps, from) === null) historyLeft.push({ symbol: r.symbol, why: "its filings do not reach back a year" });
    else if (eps.some((e) => e.end >= addDays(from, -EPS_KNOWN_AFTER_DAYS - 92) && e.eps <= 0)) historyLeft.push({ symbol: r.symbol, why: "earnings were not positive for part of the year" });
    else if (!r.price || r.price <= 0) historyLeft.push({ symbol: r.symbol, why: "no price" });
    // k carries the price into the filings' currency at today's rate: today's P/E times today's EPS over today's price.
    else traced.push({ symbol: r.symbol, value: r.value, k: (r.pe * epsNow) / r.price, last: closes.at(-1)!.value, closes, eps });
  }
  if (!traced.length) return { ...empty, historyLeft };
  const lead = traced.reduce((a, b) => (b.closes.length > a.closes.length ? b : a));
  const cursor = traced.map(() => 0);
  const history: PortfolioPe["history"] = [];
  for (const c of lead.closes) {
    if (c.date < from) continue;
    const day: { value: number; pe: number }[] = [];
    let ok = true;
    for (let j = 0; j < traced.length && ok; j++) {
      const t = traced[j];
      const close = closeOn(t.closes, c.date, cursor[j]);
      const eps = epsKnown(t.eps, c.date);
      if (!close || eps === null || eps <= 0) ok = false;
      else {
        cursor[j] = close.i;
        day.push({ value: (t.value * close.value) / t.last, pe: (t.k * close.value) / eps });
      }
    }
    const v = ok ? harmonic(day) : null;
    if (v !== null) history.push({ date: c.date, pe: Math.round(v * 100) / 100 });
  }
  const tracedValue = traced.reduce((s, t) => s + t.value, 0);
  const historyPct = covered ? (tracedValue / covered) * 100 : 0;
  if (history.length < MIN_HISTORY_POINTS) return { ...empty, history, historyLeft, historyPct };
  const all = pe !== null ? [...history, { date: today, pe }] : history;
  const lowP = all.reduce((a, b) => (b.pe < a.pe ? b : a));
  const highP = all.reduce((a, b) => (b.pe > a.pe ? b : a));
  const sorted = history.map((h) => h.pe).sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { ...empty, history, historyLeft, historyPct, range: { low: lowP.pe, high: highP.pe, median, lowOn: lowP.date, highOn: highP.date, from: history[0].date, to: history.at(-1)!.date } };
}

/** A P/E as the card writes it: 24.3×. */
export const peText = (v: number) => `${v.toFixed(1)}×`;
