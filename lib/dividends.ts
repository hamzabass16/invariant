/**
 * Dividends, pure (Hamza, 19 Oct 2026: a Dividends screen after Snowball's).
 * What the book is set to pay, from the filings (each company's trailing
 * dividend per share over its price, `dividend_yield_pct`, times what is held
 * of it), else, for a holding the filings do not cover (a fund), what it paid
 * over the past twelve months while held; what it did pay, from the ledger's
 * dividends (net of the tax withheld on them); and how safe each payer's
 * dividend reads on four named tests from its filings. Every amount is in the
 * base currency. A holding nothing can price or read is named, never zero.
 */
import { baseAmountOf, rateOf, type Book } from "@/lib/holdings";
import { LISTED_FOR_DAY } from "@/lib/ontology";

const DAY = 86_400_000;
const daysBefore = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The safety tests: each worth the same, read from the filings; a test with no figure is unread and leaves the count. */
export const SAFETY_TESTS = [
  { id: "payout", label: "Payout ratio", field: "payout_ratio_pct", words: "Full marks at 60% of earnings or less, half up to 80%, none above or on a loss." },
  { id: "raised", label: "Years raised", field: "dividend_years_raised", words: "A tenth of the marks for each consecutive year the dividend per share rose, full at ten." },
  { id: "growth", label: "Five-year growth", field: "dividend_growth_5y_pct", words: "Full marks at 5% a year or more, scaled down to none at no growth." },
  { id: "yield", label: "Yield not stretched", field: "dividend_yield_pct", words: "Full marks at 6% or less, half up to 10%, none above: a yield that high often prices a cut." },
] as const;
/** Fewer tests read than this and no score is given. */
export const SAFETY_MIN_TESTS = 3;
export const SAFETY_BANDS = [
  { band: "Reliable", from: 80 },
  { band: "Safe", from: 60 },
  { band: "Uncertain", from: 40 },
  { band: "At risk", from: 0 },
] as const;
export type SafetyBand = (typeof SAFETY_BANDS)[number]["band"];

export type Safety = { score: number; band: SafetyBand; tests: { id: string; label: string; points: number | null }[] };

export type DividendHolding = {
  symbol: string;
  name: string;
  /** Value in base currency today. */
  value: number;
  /** What it cost, in base currency; null when the broker gave no cost. */
  cost: number | null;
  /** Dividend yield, percent: the filings', else what it paid over the past year over its value. */
  yieldPct: number | null;
  yieldOnCostPct: number | null;
  payoutPct: number | null;
  growth5yPct: number | null;
  yearsRaised: number | null;
  /** What it is set to pay over a year at today's holding, base currency. */
  annual: number;
  /** Where `annual` comes from. */
  source: "filings" | "received";
  /** Received over the past twelve months, net of tax withheld. */
  received12: number;
  safety: Safety | null;
  /** Why it has no score, when it has none. */
  safetyWhy: string | null;
};

export type MonthAmount = { month: string; amount: number };

export type Dividends = {
  /** Payers, largest annual dividend first. */
  holdings: DividendHolding[];
  annual: number;
  monthly: number;
  /** Over the listed holdings' value, percent; null with none. */
  yieldPct: number | null;
  /** Over the cost of the listed holdings the broker gave a cost for, percent. */
  yieldOnCostPct: number | null;
  /** Whether the ledger carries any dividend. */
  ledger: boolean;
  /** Received over the past twelve months and the twelve before; null without a ledger. */
  received12: number | null;
  receivedPrior12: number | null;
  /** The past twelve months against the twelve before, percent; null when the twelve before had none. */
  growthPct: number | null;
  /** The past twelve months, oldest first, each "YYYY-MM". */
  byMonth: MonthAmount[];
  /** The last three calendar years with a dividend, each month January to December. */
  byYear: { year: number; months: number[] }[];
  /** The next twelve months from next month, each payer placed in the months it paid in over the past year, its year's dividend shared by what it paid then. */
  upcoming: (MonthAmount & { parts: { symbol: string; amount: number }[] })[];
  /** Payers the ledger shows no payment of over the past year, so no month can be given; with what each is set to pay. */
  undated: { symbol: string; annual: number }[];
  /** Everything the ledger shows received, by company, largest first. */
  receivedBySymbol: { symbol: string; amount: number }[];
  /** The first dividend in the ledger. */
  since: string | null;
  left: { symbol: string; why: string }[];
};

/** The four tests on a payer's filings; null below SAFETY_MIN_TESTS read. */
export function safetyOf(f: { payoutPct: number | null; yearsRaised: number | null; growth5yPct: number | null; yieldPct: number | null }): Safety | null {
  const marks: Record<(typeof SAFETY_TESTS)[number]["id"], number | null> = {
    payout: f.payoutPct === null ? null : f.payoutPct < 0 ? 0 : f.payoutPct <= 60 ? 1 : f.payoutPct <= 80 ? 0.5 : 0,
    raised: f.yearsRaised === null ? null : Math.min(10, Math.max(0, f.yearsRaised)) / 10,
    growth: f.growth5yPct === null ? null : Math.min(1, Math.max(0, f.growth5yPct / 5)),
    yield: f.yieldPct === null ? null : f.yieldPct <= 6 ? 1 : f.yieldPct <= 10 ? 0.5 : 0,
  };
  const tests = SAFETY_TESTS.map((t) => ({ id: t.id, label: t.label, points: marks[t.id] === null ? null : Math.round(marks[t.id]! * 25 * 10) / 10 }));
  const read = tests.filter((t) => t.points !== null);
  if (read.length < SAFETY_MIN_TESTS) return null;
  const score = Math.round((read.reduce((s, t) => s + t.points!, 0) / (read.length * 25)) * 100);
  return { score, band: SAFETY_BANDS.find((b) => score >= b.from)!.band, tests };
}

const monthOf = (d: string) => d.slice(0, 7);
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export function dividendsOf(book: Book, today: string): Dividends {
  const key = (s: string) => s.toUpperCase();
  const yearAgo = daysBefore(today, 365);
  const twoYearsAgo = daysBefore(today, 730);
  const paid = book.transactions.filter((t) => t.kind === "dividend" && t.symbol && t.date <= today);
  const left: { symbol: string; why: string }[] = [];
  const baseOf = new Map<string, number>();
  const amounts = paid.map((t) => ({ t, base: baseAmountOf(t, book.fx) }));
  const unpriced = new Set(amounts.filter((a) => a.base === null).map((a) => key(a.t.symbol)));
  for (const s of unpriced) left.push({ symbol: s, why: "a dividend in a currency nothing converts" });
  const priced = amounts.filter((a): a is { t: (typeof paid)[number]; base: number } => a.base !== null);
  for (const a of priced) if (a.t.date > yearAgo) baseOf.set(key(a.t.symbol), (baseOf.get(key(a.t.symbol)) ?? 0) + a.base);

  // The listed holdings by symbol, across accounts.
  const bySymbol = new Map<string, { symbol: string; name: string; value: number; cost: number | null; f: Record<string, number | null> }>();
  for (const h of book.holdings) {
    if (!LISTED_FOR_DAY.has(h.assetClass)) continue;
    const rate = rateOf(h.currency, book.fx);
    if (rate === null) {
      left.push({ symbol: h.symbol, why: `no ${h.currency} rate` });
      continue;
    }
    const k = key(h.symbol);
    const cur = bySymbol.get(k) ?? { symbol: h.symbol, name: h.name, value: 0, cost: 0, f: h.fundamentals ?? {} };
    cur.value += h.value * rate;
    cur.cost = cur.cost === null || h.costBasis === null ? null : cur.cost + h.costBasis * rate;
    bySymbol.set(k, cur);
  }
  const listedValue = [...bySymbol.values()].reduce((s, h) => s + h.value, 0);

  const holdings: DividendHolding[] = [];
  for (const [k, h] of bySymbol) {
    const fy = h.f.dividend_yield_pct ?? null;
    const received12 = baseOf.get(k) ?? 0;
    let annual: number;
    let source: DividendHolding["source"];
    if (fy !== null && fy > 0) {
      annual = (h.value * fy) / 100;
      source = "filings";
    } else if (received12 > 0) {
      annual = received12;
      source = "received";
    } else continue;
    const yieldPct = h.value > 0 ? (annual / h.value) * 100 : null;
    const payoutPct = h.f.payout_ratio_pct ?? null;
    const growth5yPct = h.f.dividend_growth_5y_pct ?? null;
    const yearsRaised = h.f.dividend_years_raised ?? null;
    const safety = source === "filings" ? safetyOf({ payoutPct, yearsRaised, growth5yPct, yieldPct: fy }) : null;
    holdings.push({
      symbol: h.symbol,
      name: h.name,
      value: r2(h.value),
      cost: h.cost === null ? null : r2(h.cost),
      yieldPct: yieldPct === null ? null : Math.round(yieldPct * 100) / 100,
      yieldOnCostPct: h.cost && h.cost > 0 ? Math.round((annual / h.cost) * 1e4) / 100 : null,
      payoutPct,
      growth5yPct,
      yearsRaised,
      annual: r2(annual),
      source,
      received12: r2(received12),
      safety,
      safetyWhy: safety ? null : source === "received" ? "no filings: a fund, or a company the filings do not cover" : `fewer than ${SAFETY_MIN_TESTS} of the four tests could be read from the filings`,
    });
  }
  holdings.sort((a, b) => b.annual - a.annual || a.symbol.localeCompare(b.symbol));
  const annual = holdings.reduce((s, h) => s + h.annual, 0);
  const costed = [...bySymbol.values()].filter((h) => h.cost !== null && h.cost > 0);
  const costTotal = costed.reduce((s, h) => s + h.cost!, 0);
  const costedAnnual = holdings.filter((h) => h.cost !== null && h.cost > 0).reduce((s, h) => s + h.annual, 0);

  const ledger = priced.length > 0;
  const received12 = ledger ? priced.filter((a) => a.t.date > yearAgo).reduce((s, a) => s + a.base, 0) : null;
  const receivedPrior12 = ledger ? priced.filter((a) => a.t.date > twoYearsAgo && a.t.date <= yearAgo).reduce((s, a) => s + a.base, 0) : null;
  const thisMonth = monthOf(today);
  const byMonth = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11)).map((month) => ({ month, amount: r2(priced.filter((a) => monthOf(a.t.date) === month).reduce((s, a) => s + a.base, 0)) }));
  const years = [...new Set(priced.map((a) => Number(a.t.date.slice(0, 4))))].sort((a, b) => a - b).slice(-3);
  const byYear = years.map((year) => ({ year, months: Array.from({ length: 12 }, (_, m) => r2(priced.filter((a) => a.t.date.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`)).reduce((s, a) => s + a.base, 0))) }));

  // The next twelve months: each payer's year shared over the months it paid in over the past year.
  const slots = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i + 1));
  const upcoming = slots.map((month) => ({ month, amount: 0, parts: [] as { symbol: string; amount: number }[] }));
  const undated: { symbol: string; annual: number }[] = [];
  for (const h of holdings) {
    const byMonthOfYear = new Map<number, number>();
    for (const a of priced) if (key(a.t.symbol) === key(h.symbol) && a.t.date > yearAgo) byMonthOfYear.set(Number(a.t.date.slice(5, 7)), (byMonthOfYear.get(Number(a.t.date.slice(5, 7))) ?? 0) + a.base);
    const positive = [...byMonthOfYear.entries()].filter(([, v]) => v > 0);
    const sum = positive.reduce((s, [, v]) => s + v, 0);
    if (!positive.length || sum <= 0) {
      undated.push({ symbol: h.symbol, annual: h.annual });
      continue;
    }
    for (const [m, v] of positive) {
      const slot = upcoming.find((u) => Number(u.month.slice(5, 7)) === m)!;
      const amount = (h.annual * v) / sum;
      slot.amount += amount;
      slot.parts.push({ symbol: h.symbol, amount: r2(amount) });
    }
  }
  for (const u of upcoming) {
    u.amount = r2(u.amount);
    u.parts.sort((a, b) => b.amount - a.amount);
  }

  const all = new Map<string, number>();
  for (const a of priced) all.set(a.t.symbol, (all.get(a.t.symbol) ?? 0) + a.base);
  const receivedBySymbol = [...all.entries()].map(([symbol, amount]) => ({ symbol, amount: r2(amount) })).filter((r) => Math.abs(r.amount) >= 0.005).sort((a, b) => b.amount - a.amount || a.symbol.localeCompare(b.symbol));

  return {
    holdings,
    annual: r2(annual),
    monthly: r2(annual / 12),
    yieldPct: listedValue > 0 && holdings.length ? Math.round((annual / listedValue) * 1e4) / 100 : null,
    yieldOnCostPct: costTotal > 0 && holdings.length ? Math.round((costedAnnual / costTotal) * 1e4) / 100 : null,
    ledger,
    received12: received12 === null ? null : r2(received12),
    receivedPrior12: receivedPrior12 === null ? null : r2(receivedPrior12),
    growthPct: received12 !== null && receivedPrior12 !== null && receivedPrior12 > 0 ? Math.round((received12 / receivedPrior12 - 1) * 1e3) / 10 : null,
    byMonth,
    byYear,
    upcoming,
    undated,
    receivedBySymbol,
    since: priced.length ? priced.map((a) => a.t.date).sort()[0] : null,
    left,
  };
}

/** Whether the book pays anything: a dividend in the ledger, or a listed holding the filings give a yield. */
export function paysDividends(book: Book | null): boolean {
  if (!book) return false;
  return book.transactions.some((t) => t.kind === "dividend") || book.holdings.some((h) => LISTED_FOR_DAY.has(h.assetClass) && (h.fundamentals?.dividend_yield_pct ?? 0) > 0);
}
