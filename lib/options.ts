/**
 * Options: Greeks, strategies, exposure, premium income and expiry alerts.
 * Pure: the screens and `npm run check:options` share it.
 *
 * Brokers' Flex and SnapTrade feeds give each contract's mark but not its
 * Greeks, so the Greeks here are computed (Black-Scholes, implied volatility
 * backed out from the mark) and every screen labels them as computed. American
 * early exercise is ignored, which is close enough for exposure, not for pricing.
 */
import { DEFAULT_RATE, spotsFor, type Book, type Holding, type OptionFields, type Transaction } from "@/lib/holdings";

// ---------------------------------------------------------------------------
// Black-Scholes

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

export type BsInput = { spot: number; strike: number; years: number; vol: number; rate: number; right: "C" | "P"; dividendYield?: number };

export type Greeks = {
  price: number;
  /** Per share: +1 is one share long. */
  delta: number;
  gamma: number;
  /** Per calendar day, per share. */
  theta: number;
  /** Per one volatility point (1%), per share. */
  vega: number;
};

export function blackScholes({ spot, strike, years, vol, rate, right, dividendYield = 0 }: BsInput): Greeks {
  if (years <= 0 || vol <= 0) {
    const intrinsic = right === "C" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    const itm = intrinsic > 0;
    return { price: intrinsic, delta: itm ? (right === "C" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sq = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate - dividendYield + 0.5 * vol * vol) * years) / (vol * sq);
  const d2 = d1 - vol * sq;
  const dfq = Math.exp(-dividendYield * years);
  const dfr = Math.exp(-rate * years);
  const gamma = (dfq * normPdf(d1)) / (spot * vol * sq);
  const vega = (spot * dfq * normPdf(d1) * sq) / 100;
  if (right === "C") {
    const price = spot * dfq * normCdf(d1) - strike * dfr * normCdf(d2);
    const theta = (-(spot * dfq * normPdf(d1) * vol) / (2 * sq) - rate * strike * dfr * normCdf(d2) + dividendYield * spot * dfq * normCdf(d1)) / 365;
    return { price, delta: dfq * normCdf(d1), gamma, theta, vega };
  }
  const price = strike * dfr * normCdf(-d2) - spot * dfq * normCdf(-d1);
  const theta = (-(spot * dfq * normPdf(d1) * vol) / (2 * sq) + rate * strike * dfr * normCdf(-d2) - dividendYield * spot * dfq * normCdf(-d1)) / 365;
  return { price, delta: -dfq * normCdf(-d1), gamma, theta, vega };
}

/**
 * The volatility that reproduces the mark, by bisection between 1% and 500%.
 * Null when the mark sits below intrinsic value or above what any volatility
 * gives (a stale or crossed quote), so a screen can say so instead of
 * showing a made-up Greek.
 */
export function impliedVol(mark: number, input: Omit<BsInput, "vol">): number | null {
  if (!(mark > 0) || input.years <= 0) return null;
  let lo = 0.01;
  let hi = 5;
  const f = (v: number) => blackScholes({ ...input, vol: v }).price - mark;
  if (f(lo) > 0 || f(hi) < 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Contracts

/** Calendar days from `today` to expiry (both YYYY-MM-DD). Expiry day itself is 0. */
export function daysToExpiry(expiry: string, today: string): number {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * An OCC option symbol ("AAPL  261120C00200000" or without the padding) into
 * its parts. Null when it is not one.
 */
export function parseOcc(symbol: string): Omit<OptionFields, "multiplier"> | null {
  const m = symbol.replace(/\s+/g, " ").trim().match(/^([A-Z.]{1,6})\s?(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return { underlying: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, right: m[5] as "C" | "P", strike: Number(m[6]) / 1000 };
}

export type Moneyness = "ITM" | "ATM" | "OTM";

/** At the money within 1% of the strike. */
export function moneyness(right: "C" | "P", strike: number, spot: number): Moneyness {
  if (Math.abs(spot - strike) / strike <= 0.01) return "ATM";
  const itm = right === "C" ? spot > strike : spot < strike;
  return itm ? "ITM" : "OTM";
}

export type ContractView = {
  holding: Holding;
  option: OptionFields;
  /** Signed contracts: negative is short. */
  contracts: number;
  dte: number;
  spot: number | null;
  moneyness: Moneyness | null;
  iv: number | null;
  /** Position Greeks: per-share Greek times contracts times multiplier. Null without a spot or an IV. */
  greeks: Omit<Greeks, "price"> | null;
  /** Delta-adjusted shares of the underlying this position behaves like. */
  deltaShares: number | null;
  unrealizedPnl: number | null;
  /** A short option in the money with a week or less to run: assignment is likely. */
  assignmentRisk: boolean;
};

export type MarketInputs = { today: string; spots: Record<string, number>; rate: number };

export function contractView(h: Holding, m: MarketInputs): ContractView | null {
  if (h.assetClass !== "option" || !h.option) return null;
  const o = h.option;
  const contracts = h.quantity;
  const dte = daysToExpiry(o.expiry, m.today);
  const spot = m.spots[o.underlying] ?? null;
  const mark = h.price;
  let iv: number | null = null;
  let greeks: ContractView["greeks"] = null;
  if (spot !== null && mark !== null) {
    const base = { spot, strike: o.strike, years: Math.max(dte, 0) / 365, rate: m.rate, right: o.right };
    iv = impliedVol(mark, base);
    if (iv !== null) {
      const g = blackScholes({ ...base, vol: iv });
      const k = contracts * o.multiplier;
      greeks = { delta: g.delta * k, gamma: g.gamma * k, theta: g.theta * k, vega: g.vega * k };
    } else if (dte <= 0) {
      const g = blackScholes({ ...base, vol: 0 });
      greeks = { delta: g.delta * contracts * o.multiplier, gamma: 0, theta: 0, vega: 0 };
    }
  }
  const mny = spot === null ? null : moneyness(o.right, o.strike, spot);
  return {
    holding: h,
    option: o,
    contracts,
    dte,
    spot,
    moneyness: mny,
    iv,
    greeks,
    deltaShares: greeks ? greeks.delta : null,
    unrealizedPnl: h.costBasis === null ? null : h.value - h.costBasis,
    assignmentRisk: contracts < 0 && mny === "ITM" && dte <= 7,
  };
}

// ---------------------------------------------------------------------------
// Strategies

export type StrategyKind =
  | "covered_call"
  | "cash_secured_put"
  | "naked_put"
  | "naked_call"
  | "long_call"
  | "long_put"
  | "bull_call_spread"
  | "bear_call_spread"
  | "bull_put_spread"
  | "bear_put_spread"
  | "straddle"
  | "strangle";

export const STRATEGY_LABEL: Record<StrategyKind, string> = {
  covered_call: "Covered call",
  cash_secured_put: "Cash-secured put",
  naked_put: "Short put (not fully cash-secured)",
  naked_call: "Short call (uncovered)",
  long_call: "Long call",
  long_put: "Long put",
  bull_call_spread: "Bull call spread",
  bear_call_spread: "Bear call spread",
  bull_put_spread: "Bull put spread",
  bear_put_spread: "Bear put spread",
  straddle: "Straddle",
  strangle: "Strangle",
};

export type Strategy = {
  kind: StrategyKind;
  account: string;
  underlying: string;
  expiry: string;
  legs: { right: "C" | "P"; strike: number; contracts: number; holdingId: string }[];
  /** Units of the strategy (contracts per leg). */
  units: number;
  /** In currency for the whole position; null when unlimited. */
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  /** Net premium per share at entry, from cost basis: positive = credit received. */
  netPremium: number | null;
};

type Leg = { h: Holding; o: OptionFields; left: number };

/** Premium per share at entry: positive for a credit (short), negative for a debit (long). */
function entryPremium(legs: { h: Holding; o: OptionFields; take: number }[]): number | null {
  let total = 0;
  for (const { h, o, take } of legs) {
    if (h.costBasis === null || h.quantity === 0) return null;
    // costBasis is signed like value: negative for a short (credit received).
    const perShare = h.costBasis / (h.quantity * o.multiplier);
    total += -perShare * take;
  }
  return total;
}

/**
 * Groups one account's option legs (and shares) into named strategies. Greedy,
 * in this order: verticals, straddles and strangles, covered calls, then
 * single legs. Contract counts are matched unit by unit, so 3 short calls
 * against 200 shares become 2 covered calls and 1 uncovered call.
 */
export function groupStrategies(holdings: Holding[], cashByAccount: Record<string, number> = {}): Strategy[] {
  const out: Strategy[] = [];
  const byKey = new Map<string, Holding[]>();
  for (const h of holdings) {
    const u = h.assetClass === "option" ? h.option?.underlying : h.assetClass === "equity" || h.assetClass === "etf" ? h.symbol : null;
    if (!u) continue;
    const k = `${h.account}|${u}`;
    byKey.set(k, [...(byKey.get(k) ?? []), h]);
  }
  const cashLeft = { ...cashByAccount };

  for (const [key, group] of [...byKey.entries()].sort()) {
    const [account, underlying] = key.split("|");
    let shares = group.filter((h) => h.assetClass !== "option").reduce((s, h) => s + h.quantity, 0);
    const legs: Leg[] = group.filter((h) => h.option).map((h) => ({ h, o: h.option!, left: h.quantity }));
    const add = (kind: StrategyKind, parts: { leg: Leg; take: number }[], units: number) => {
      for (const p of parts) p.leg.left -= p.take;
      const s = describe(kind, account, underlying, parts.map((p) => ({ h: p.leg.h, o: p.leg.o, take: p.take })), units);
      out.push(s);
    };

    // Verticals: same expiry and right, one long and one short at different strikes.
    for (const a of legs) {
      for (const b of legs) {
        if (a === b || a.o.right !== b.o.right || a.o.expiry !== b.o.expiry || a.o.strike === b.o.strike) continue;
        if (!(a.left > 0 && b.left < 0)) continue;
        const units = Math.min(a.left, -b.left);
        if (units <= 0) continue;
        const call = a.o.right === "C";
        const longLower = a.o.strike < b.o.strike;
        const kind: StrategyKind = call ? (longLower ? "bull_call_spread" : "bear_call_spread") : longLower ? "bull_put_spread" : "bear_put_spread";
        add(kind, [{ leg: a, take: units }, { leg: b, take: -units }], units);
      }
    }
    // Straddles and strangles: a call and a put, same expiry, same sign.
    for (const c of legs) {
      for (const p of legs) {
        if (c.o.right !== "C" || p.o.right !== "P" || c.o.expiry !== p.o.expiry) continue;
        if (c.left === 0 || p.left === 0 || Math.sign(c.left) !== Math.sign(p.left)) continue;
        const units = Math.min(Math.abs(c.left), Math.abs(p.left)) * Math.sign(c.left);
        add(c.o.strike === p.o.strike ? "straddle" : "strangle", [{ leg: c, take: units }, { leg: p, take: units }], Math.abs(units));
      }
    }
    // Covered calls against shares held in the same account.
    for (const c of legs) {
      if (c.o.right !== "C" || c.left >= 0 || shares <= 0) continue;
      const units = Math.min(-c.left, Math.floor(shares / c.o.multiplier));
      if (units <= 0) continue;
      shares -= units * c.o.multiplier;
      add("covered_call", [{ leg: c, take: -units }], units);
    }
    // What is left, leg by leg.
    for (const l of legs) {
      if (l.left === 0) continue;
      const units = Math.abs(l.left);
      if (l.left > 0) {
        add(l.o.right === "C" ? "long_call" : "long_put", [{ leg: l, take: l.left }], units);
      } else if (l.o.right === "C") {
        add("naked_call", [{ leg: l, take: l.left }], units);
      } else {
        const need = l.o.strike * l.o.multiplier * units;
        const have = cashLeft[account] ?? 0;
        const secured = have >= need;
        if (secured) cashLeft[account] = have - need;
        add(secured ? "cash_secured_put" : "naked_put", [{ leg: l, take: l.left }], units);
      }
    }
  }
  return out;
}

function describe(kind: StrategyKind, account: string, underlying: string, parts: { h: Holding; o: OptionFields; take: number }[], units: number): Strategy {
  const m = parts[0].o.multiplier;
  const total = entryPremium(parts);
  // Per share, per unit of the strategy.
  const prem = total === null ? null : total / units;
  const n = units * m;
  const strikes = parts.map((p) => p.o.strike).sort((a, b) => a - b);
  const width = strikes.length === 2 ? strikes[1] - strikes[0] : 0;
  let maxProfit: number | null = null;
  let maxLoss: number | null = null;
  let breakevens: number[] = [];
  const k = parts[0].o.strike;
  if (prem !== null) {
    switch (kind) {
      case "long_call":
        maxLoss = -prem * n;
        breakevens = [k - prem];
        break;
      case "long_put":
        maxLoss = -prem * n;
        maxProfit = (k + prem) * n;
        breakevens = [k + prem];
        break;
      case "naked_call":
        maxProfit = prem * n;
        breakevens = [k + prem];
        break;
      case "naked_put":
      case "cash_secured_put":
        maxProfit = prem * n;
        maxLoss = (k - prem) * n;
        breakevens = [k - prem];
        break;
      case "covered_call":
        // The call leg alone: the premium is the most it adds; the shares carry the downside.
        maxProfit = prem * n;
        breakevens = [];
        break;
      case "bull_call_spread":
      case "bear_put_spread": // debit spreads
        maxLoss = -prem * n;
        maxProfit = (width + prem) * n;
        breakevens = [kind === "bull_call_spread" ? strikes[0] - prem : strikes[1] + prem];
        break;
      case "bear_call_spread":
      case "bull_put_spread": // credit spreads
        maxProfit = prem * n;
        maxLoss = (width - prem) * n;
        breakevens = [kind === "bear_call_spread" ? strikes[0] + prem : strikes[1] - prem];
        break;
      case "straddle":
      case "strangle": {
        const lo = strikes[0];
        const hi = strikes[strikes.length - 1];
        if (prem < 0) {
          maxLoss = -prem * n;
          breakevens = [lo + prem, hi - prem];
        } else {
          maxProfit = prem * n;
          breakevens = [lo - prem, hi + prem];
        }
        break;
      }
    }
  }
  return {
    kind,
    account,
    underlying,
    expiry: parts[0].o.expiry,
    legs: parts.map((p) => ({ right: p.o.right, strike: p.o.strike, contracts: p.take, holdingId: p.h.id })),
    units,
    maxProfit,
    maxLoss,
    breakevens: breakevens.map((b) => Math.round(b * 100) / 100),
    netPremium: prem === null ? null : Math.round(prem * 10000) / 10000,
  };
}

// ---------------------------------------------------------------------------
// Exposure, income, alerts

export type UnderlyingExposure = {
  underlying: string;
  shares: number;
  optionDeltaShares: number;
  /** Shares plus option delta, valued at spot. Null without a spot. */
  deltaAdjustedValue: number | null;
  /** Whether any option leg lacked a Greek, so the figure is partial. */
  partial: boolean;
};

/** Delta-adjusted exposure per underlying, across every account. */
export function exposureByUnderlying(holdings: Holding[], m: MarketInputs): UnderlyingExposure[] {
  const map = new Map<string, UnderlyingExposure>();
  const get = (u: string) => {
    if (!map.has(u)) map.set(u, { underlying: u, shares: 0, optionDeltaShares: 0, deltaAdjustedValue: null, partial: false });
    return map.get(u)!;
  };
  for (const h of holdings) {
    if (h.assetClass === "equity" || h.assetClass === "etf") get(h.symbol).shares += h.quantity;
    if (h.assetClass === "option" && h.option) {
      const e = get(h.option.underlying);
      const v = contractView(h, m);
      if (v?.deltaShares === null || v === null) e.partial = true;
      else e.optionDeltaShares += v.deltaShares;
    }
  }
  for (const e of map.values()) {
    const spot = m.spots[e.underlying];
    e.deltaAdjustedValue = spot === undefined ? null : (e.shares + e.optionDeltaShares) * spot;
  }
  return [...map.values()].sort((a, b) => Math.abs(b.deltaAdjustedValue ?? 0) - Math.abs(a.deltaAdjustedValue ?? 0));
}

/** Portfolio Greeks: the sum of every contract's position Greeks. */
/** Every open contract's view, with the book's own market inputs. */
export function optionViews(book: Book, today: string): ContractView[] {
  const m: MarketInputs = { today, rate: book.market?.rate ?? DEFAULT_RATE, spots: spotsFor(book) };
  return book.holdings.map((h) => contractView(h, m)).filter((v): v is ContractView => v !== null);
}

export function portfolioGreeks(views: ContractView[]) {
  const sum = { delta: 0, gamma: 0, theta: 0, vega: 0, missing: 0 };
  for (const v of views) {
    if (!v.greeks) {
      sum.missing += 1;
      continue;
    }
    sum.delta += v.greeks.delta;
    sum.gamma += v.greeks.gamma;
    sum.theta += v.greeks.theta;
    sum.vega += v.greeks.vega;
  }
  return sum;
}

/** Premium collected (sold to open) and paid (bought to open), by month. */
export function premiumByMonth(transactions: Transaction[]) {
  const map = new Map<string, { month: string; collected: number; paid: number }>();
  for (const t of transactions) {
    if (t.kind !== "option_open") continue;
    const month = t.date.slice(0, 7);
    const row = map.get(month) ?? { month, collected: 0, paid: 0 };
    if (t.amount > 0) row.collected += t.amount;
    else row.paid += -t.amount;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type OptionAlert = { holdingId: string; kind: "expires_today" | "expires_tomorrow" | "expires_in_week" | "short_itm"; text: string };

/** Notices for short options: seven days and one day before expiry, and whenever one is in the money. */
export function optionAlerts(views: ContractView[]): OptionAlert[] {
  const out: OptionAlert[] = [];
  for (const v of views) {
    if (v.contracts >= 0) continue;
    const name = `${v.option.underlying} ${v.option.strike}${v.option.right} ${v.option.expiry}`;
    if (v.dte === 0) out.push({ holdingId: v.holding.id, kind: "expires_today", text: `Short ${name} expires today.` });
    else if (v.dte === 1) out.push({ holdingId: v.holding.id, kind: "expires_tomorrow", text: `Short ${name} expires tomorrow.` });
    else if (v.dte > 1 && v.dte <= 7) out.push({ holdingId: v.holding.id, kind: "expires_in_week", text: `Short ${name} expires in ${v.dte} days.` });
    if (v.moneyness === "ITM") out.push({ holdingId: v.holding.id, kind: "short_itm", text: `Short ${name} is in the money${v.spot !== null ? ` (spot ${v.spot})` : ""}; assignment is possible.` });
  }
  return out;
}

/**
 * Realised options results from closing trades, assignments and expiries:
 * by underlying, with wins and losses counted per closed position. A position
 * is its opening transactions' amounts plus its closing amounts.
 */
export function realisedOptions(transactions: Transaction[]) {
  const key = (t: Transaction) => `${t.account}|${t.symbol}`;
  const open = new Map<string, number>();
  const rows = new Map<string, { underlying: string; realised: number; wins: number; losses: number; closed: number }>();
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!t.option) continue;
    if (t.kind === "option_open") {
      open.set(key(t), (open.get(key(t)) ?? 0) + t.amount);
      continue;
    }
    if (t.kind !== "option_close" && t.kind !== "expiry" && t.kind !== "assignment" && t.kind !== "exercise") continue;
    const opened = open.get(key(t));
    if (opened === undefined) continue;
    const pnl = opened + t.amount;
    open.delete(key(t));
    const u = t.option.underlying;
    const r = rows.get(u) ?? { underlying: u, realised: 0, wins: 0, losses: 0, closed: 0 };
    r.realised += pnl;
    r.closed += 1;
    if (pnl > 0) r.wins += 1;
    else if (pnl < 0) r.losses += 1;
    rows.set(u, r);
  }
  return [...rows.values()].sort((a, b) => b.realised - a.realised);
}
