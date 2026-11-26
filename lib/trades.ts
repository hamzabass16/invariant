/**
 * Trade statistics over the book's own ledger: first-in first-out lot
 * matching per symbol, sales won, profit factor, average win and loss, days
 * held, realised by holding, bought and sold per month, and the fills list.
 *
 * Fills are the transactions of kind buy and sell; an assignment or exercise
 * counts as a buy or a sell by the sign of its quantity. Cost and proceeds
 * are the transactions' own cash effects in base currency, so a lot's P&L is
 * what the account actually paid and received. Where the broker reports its
 * own realised P&L on a sale (matched over every lot the account ever held),
 * that figure is the sale's P&L, so shares bought before the ledger began
 * still count. A sale with neither is one line in the warning, never a throw. A fill in a currency the book cannot convert is
 * left out and counted by `fillsLeftOut`, never a throw.
 *
 * Pure: imports nothing server-only. Every function is total on an empty
 * ledger. Money is in base currency; percents are plain numbers.
 * Context, never the verdict.
 */
import { baseAmountOf, rateOf, type Book, type Transaction } from "@/lib/holdings";
import { daysBetween } from "@/lib/time";

export type Side = "buy" | "sell";

export type Fill = {
  date: string;
  symbol: string;
  side: Side;
  /** Units, always positive. */
  quantity: number;
  /** Per unit, in the transaction's currency; null when the statement gave none. */
  price: number | null;
  /** Cash moved, base currency, positive. */
  amount: number;
  account: string;
  currency: string;
  /** The broker's realised P&L on a sale, base currency, when it reports one. */
  realized?: number;
  /** Commission and tax paid on the fill, base currency, as costs; absent when the statement did not carry them. */
  commission?: number;
  tax?: number;
};

const EPS = 1e-6;

function sideOf(t: Transaction): Side | null {
  if (t.kind === "buy") return "buy";
  if (t.kind === "sell") return "sell";
  if (t.kind === "assignment" || t.kind === "exercise") return t.quantity > 0 ? "buy" : t.quantity < 0 ? "sell" : null;
  return null;
}

/** A fill's cash moved in base currency, or null when nothing in the book can convert it. */
function fillAmount(t: Transaction, book: Book): number | null {
  if (t.amount !== 0) {
    const base = baseAmountOf(t, book.fx);
    return base === null ? null : Math.abs(base);
  }
  if (t.price === null) return 0;
  const rate = rateOf(t.currency, book.fx);
  return rate === null ? null : Math.abs(t.quantity) * t.price * rate;
}

/** An amount in the fill's currency in base, at the fill's own rate (its base cash over its cash), else the book's. */
function atFillRate(v: number, t: Transaction, amount: number, book: Book): number | null {
  if (t.amount !== 0) return v * (amount / Math.abs(t.amount));
  const rate = rateOf(t.currency, book.fx);
  return rate === null ? null : v * rate;
}

/** The broker's realised P&L in base currency. */
function realizedBase(t: Transaction, amount: number, book: Book): number | null {
  return t.realized === undefined ? null : atFillRate(t.realized, t, amount, book);
}

/** The ledger's fills in date order (ties keep the statement's order); fills nothing can convert are left out. */
export function fillsOf(book: Book): Fill[] {
  const out: { fill: Fill; i: number }[] = [];
  book.transactions.forEach((t, i) => {
    const side = sideOf(t);
    if (!side) return;
    const quantity = Math.abs(t.quantity);
    if (quantity <= EPS) return;
    const amount = fillAmount(t, book);
    if (amount === null) return;
    const realized = side === "sell" && t.realized !== undefined ? realizedBase(t, amount, book) : null;
    const commission = t.commission === undefined ? null : atFillRate(t.commission, t, amount, book);
    const tax = t.tax === undefined ? null : atFillRate(t.tax, t, amount, book);
    out.push({ i, fill: { date: t.date, symbol: t.symbol, side, quantity, price: t.price, amount, account: t.account, currency: t.currency, ...(realized !== null ? { realized } : {}), ...(commission !== null ? { commission } : {}), ...(tax !== null ? { tax } : {}) } });
  });
  return out.sort((a, b) => a.fill.date.localeCompare(b.fill.date) || a.i - b.i).map((x) => x.fill);
}

/** Fills left out of `fillsOf` because nothing converts their currency, counted per currency. */
export function fillsLeftOut(book: Book): { currency: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of book.transactions) {
    if (!sideOf(t) || Math.abs(t.quantity) <= EPS) continue;
    if (fillAmount(t, book) === null) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  }
  return [...counts.entries()].map(([currency, count]) => ({ currency, count })).sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

export type ClosedLot = {
  symbol: string;
  /** Null for units bought before the ledger began, which only the broker's realised P&L prices. */
  opened: string | null;
  closed: string;
  quantity: number;
  /** Base currency. */
  cost: number;
  proceeds: number;
  pnl: number;
  daysHeld: number | null;
};

export type OpenLot = { symbol: string; opened: string; quantity: number; cost: number };

/** Units sold that no lot in the ledger covers and the broker gave no realised P&L for. */
export type Unmatched = { symbol: string; date: string; quantity: number };

export type LotMatch = { closed: ClosedLot[]; open: OpenLot[]; unmatched: Unmatched[]; warnings: string[] };

/**
 * First-in first-out lot matching per symbol. A sale takes from the oldest
 * open lot first; cost and proceeds are shared across the pieces by quantity.
 * A sale the broker priced takes its P&L from the broker, shared across the
 * pieces by quantity, the units no lot covers as one piece opened before the
 * ledger. A sale with neither is left unmatched, and the warnings say so in
 * one sentence.
 */
export function matchLots(book: Book): LotMatch {
  const fills = fillsOf(book);
  type Queued = { symbol: string; opened: string; quantity: number; unitCost: number };
  const queues = new Map<string, Queued[]>();
  const closed: ClosedLot[] = [];
  const unmatched: Unmatched[] = [];
  for (const f of fills) {
    const key = f.symbol.toUpperCase();
    const queue = queues.get(key) ?? [];
    queues.set(key, queue);
    if (f.side === "buy") {
      queue.push({ symbol: f.symbol, opened: f.date, quantity: f.quantity, unitCost: f.amount / f.quantity });
      continue;
    }
    const unitProceeds = f.amount / f.quantity;
    const pieces: ClosedLot[] = [];
    let need = f.quantity;
    while (need > EPS && queue.length) {
      const lot = queue[0];
      const take = Math.min(need, lot.quantity);
      const cost = take * lot.unitCost;
      const proceeds = take * unitProceeds;
      pieces.push({ symbol: f.symbol, opened: lot.opened, closed: f.date, quantity: take, cost, proceeds, pnl: proceeds - cost, daysHeld: daysBetween(lot.opened, f.date) });
      lot.quantity -= take;
      need -= take;
      if (lot.quantity <= EPS) queue.shift();
    }
    if (f.realized !== undefined) {
      if (need > 1e-4) pieces.push({ symbol: f.symbol, opened: null, closed: f.date, quantity: need, cost: 0, proceeds: need * unitProceeds, pnl: 0, daysHeld: null });
      for (const p of pieces) {
        p.pnl = f.realized * (p.quantity / f.quantity);
        p.cost = p.proceeds - p.pnl;
      }
    } else if (need > 1e-4) unmatched.push({ symbol: f.symbol, date: f.date, quantity: need });
    closed.push(...pieces);
  }
  const open: OpenLot[] = [];
  for (const queue of queues.values()) for (const lot of queue) if (lot.quantity > EPS) open.push({ symbol: lot.symbol, opened: lot.opened, quantity: lot.quantity, cost: lot.quantity * lot.unitCost });
  return { closed, open, unmatched, warnings: unmatchedWarning(unmatched) };
}

/** One sentence for every sale no lot covers: how many, which holdings, and what would price them. */
export function unmatchedWarning(unmatched: readonly Unmatched[]): string[] {
  if (!unmatched.length) return [];
  const sales = new Set(unmatched.map((u) => `${u.date}|${u.symbol.toUpperCase()}`)).size;
  const symbols = [...new Set(unmatched.map((u) => u.symbol.toUpperCase()))];
  const named = symbols.length > 6 ? `${symbols.slice(0, 6).join(", ")} and ${symbols.length - 6} more` : symbols.join(", ");
  return [
    `${sales} sale${sales === 1 ? "" : "s"} (${named}) sold shares bought before the ledger begins, or transferred in, so ${sales === 1 ? "its" : "their"} gain is left out of the figures. A statement that carries the broker's realised P&L prices ${sales === 1 ? "it" : "them"}.`,
  ];
}

/** One symbol sold on one day: the unit the statistics count. */
export type Sale = { symbol: string; date: string; quantity: number; cost: number; proceeds: number; pnl: number; lots: ClosedLot[] };

export function salesOf(closed: readonly ClosedLot[]): Sale[] {
  const map = new Map<string, Sale>();
  for (const l of closed) {
    const key = `${l.closed}|${l.symbol.toUpperCase()}`;
    const s = map.get(key) ?? { symbol: l.symbol, date: l.closed, quantity: 0, cost: 0, proceeds: 0, pnl: 0, lots: [] };
    s.quantity += l.quantity;
    s.cost += l.cost;
    s.proceeds += l.proceeds;
    s.pnl += l.pnl;
    s.lots.push(l);
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export type TradeStats = {
  sales: number;
  won: number;
  /** Percent of sales with a gain; null without a sale. */
  wonPct: number | null;
  /** Gross gains over gross losses; null without a loss. */
  profitFactor: number | null;
  avgWin: number | null;
  /** The average loss as a positive size. */
  avgLoss: number | null;
  /** Quantity-weighted days held of the lots behind winning (losing) sales. */
  avgDaysWinners: number | null;
  avgDaysLosers: number | null;
  grossProfit: number;
  grossLoss: number;
  total: number;
};

const mean = (x: readonly number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);

/** Sales won, profit factor, average win and loss, days held, over the closed lots given. */
export function tradeStats(closed: readonly ClosedLot[]): TradeStats {
  const sales = salesOf(closed);
  const win = sales.filter((s) => s.pnl > 0);
  const los = sales.filter((s) => s.pnl < 0);
  const gw = win.reduce((a, s) => a + s.pnl, 0);
  const gl = -los.reduce((a, s) => a + s.pnl, 0);
  const held = (group: Sale[]) => {
    let num = 0;
    let den = 0;
    for (const s of group) for (const l of s.lots) {
      if (l.daysHeld === null) continue;
      num += l.daysHeld * l.quantity;
      den += l.quantity;
    }
    return den > 0 ? num / den : null;
  };
  return {
    sales: sales.length,
    won: win.length,
    wonPct: sales.length ? (win.length / sales.length) * 100 : null,
    profitFactor: gl > 0 ? gw / gl : null,
    avgWin: win.length ? mean(win.map((s) => s.pnl)) : null,
    avgLoss: los.length ? -mean(los.map((s) => s.pnl)) : null,
    avgDaysWinners: held(win),
    avgDaysLosers: held(los),
    grossProfit: gw,
    grossLoss: gl,
    total: gw - gl,
  };
}

/** `pct` is the realised P&L over the cost of the lots that carry one, so a lot only the broker's P&L prices never inflates it; null when none does. */
export type RealisedBySymbol = { symbol: string; pnl: number; sales: number; cost: number; pct: number | null };

/** Realised P&L by symbol over the closed lots given, largest gain first. */
export function realisedBySymbol(closed: readonly ClosedLot[]): RealisedBySymbol[] {
  const map = new Map<string, Omit<RealisedBySymbol, "pct"> & { costedPnl: number }>();
  for (const s of salesOf(closed)) {
    const key = s.symbol.toUpperCase();
    const r = map.get(key) ?? { symbol: s.symbol, pnl: 0, sales: 0, cost: 0, costedPnl: 0 };
    r.pnl += s.pnl;
    r.sales += 1;
    for (const l of s.lots) {
      if (l.cost > 0) {
        r.cost += l.cost;
        r.costedPnl += l.pnl;
      }
    }
    map.set(key, r);
  }
  return [...map.values()].map(({ costedPnl, ...r }) => ({ ...r, pct: r.cost > 0 ? (costedPnl / r.cost) * 100 : null })).sort((a, b) => b.pnl - a.pnl);
}

export type MonthActivity = { ym: string; bought: number; sold: number; buys: number; sells: number };

/** Money bought and sold per month in base currency, with the number of fills, oldest first. */
export function monthlyActivity(book: Book): MonthActivity[] {
  const map = new Map<string, MonthActivity>();
  for (const f of fillsOf(book)) {
    const ym = f.date.slice(0, 7);
    const m = map.get(ym) ?? { ym, bought: 0, sold: 0, buys: 0, sells: 0 };
    if (f.side === "buy") {
      m.bought += f.amount;
      m.buys += 1;
    } else {
      m.sold += f.amount;
      m.sells += 1;
    }
    map.set(ym, m);
  }
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

/** Every fill, newest first. */
export function fillsNewestFirst(book: Book): Fill[] {
  return fillsOf(book).reverse();
}

/** Items dated in [from, to], by the field `dateOf` reads (the fill's or sale's date by default). */
export function inWindow<T>(items: readonly T[], from: string, to: string, dateOf: (item: T) => string = (item) => (item as { date: string }).date): T[] {
  return items.filter((x) => {
    const d = dateOf(x);
    return d >= from && d <= to;
  });
}

// ---------------------------------------------------------------- wins and losses

/**
 * What trading cost over a window (Hamza, 20 Oct 2026: "show fees and
 * taxes"): the commission and tax the broker charged on each fill, the tax
 * withheld on dividends and the account's other fees (an ADR's custody fee, a
 * data fee), in base currency as costs, and the fills' costs as a share of the
 * money traded. `read` is false when no fill in the ledger carries a
 * commission, so the screen says what to tick rather than showing a zero.
 */
export type TradeCosts = {
  read: boolean;
  /** Whether the ledger carries the cash rows (dividends, fees) at all, and the tax withheld on dividends as such. */
  cashRead: boolean;
  withheldRead: boolean;
  commission: number;
  tradeTax: number;
  dividendTax: number;
  fees: number;
  total: number;
  /** Fills in the window, and how many carry a commission or tax. */
  fills: number;
  costed: number;
  traded: number;
  /** Commission and trade tax over the money traded, in percent; null with nothing traded. */
  pctOfTraded: number | null;
  /** The symbols that cost most in commission and tax, largest first. */
  bySymbol: { symbol: string; cost: number; fills: number }[];
};

export function tradeCosts(book: Book, from: string, to: string): TradeCosts {
  const all = fillsOf(book);
  const read = all.some((f) => f.commission !== undefined || f.tax !== undefined);
  const fills = inWindow(all, from, to);
  const costed = fills.filter((f) => f.commission !== undefined || f.tax !== undefined);
  const commission = costed.reduce((a, f) => a + (f.commission ?? 0), 0);
  const tradeTax = costed.reduce((a, f) => a + (f.tax ?? 0), 0);
  let dividendTax = 0;
  let fees = 0;
  for (const t of book.transactions) {
    if (t.date < from || t.date > to) continue;
    if (t.kind === "dividend" && t.tax !== undefined) {
      const base = baseAmountOf(t, book.fx);
      // The withheld tax at the row's own rate: its base cash over its cash.
      if (base !== null && t.amount !== 0) dividendTax += t.tax * (base / t.amount);
    } else if (t.kind === "fee") {
      const base = baseAmountOf(t, book.fx);
      if (base !== null) fees -= base;
    }
  }
  const traded = fills.reduce((a, f) => a + f.amount, 0);
  const cashRead = book.transactions.some((t) => t.kind === "dividend" || t.kind === "fee" || t.kind === "interest" || t.kind === "deposit" || t.kind === "withdrawal");
  // A statement read before the tax was kept on its own carries the withholding only as a negative dividend: unread, never a zero.
  const withheldRead = book.transactions.some((t) => t.kind === "dividend" && t.tax !== undefined) || !book.transactions.some((t) => t.kind === "dividend" && t.amount < 0);
  const by = new Map<string, { cost: number; fills: number }>();
  for (const f of costed) {
    const c = by.get(f.symbol) ?? { cost: 0, fills: 0 };
    c.cost += (f.commission ?? 0) + (f.tax ?? 0);
    c.fills += 1;
    by.set(f.symbol, c);
  }
  const bySymbol = [...by.entries()].map(([symbol, c]) => ({ symbol, ...c })).sort((a, b) => b.cost - a.cost || a.symbol.localeCompare(b.symbol));
  return {
    read,
    cashRead,
    withheldRead,
    commission,
    tradeTax,
    dividendTax,
    fees,
    total: commission + tradeTax + (withheldRead ? dividendTax : 0) + fees,
    fills: fills.length,
    costed: costed.length,
    traded,
    pctOfTraded: traded > 0 && costed.length ? ((commission + tradeTax) / traded) * 100 : null,
    bySymbol,
  };
}

/**
 * Where the profit over a window came from (Hamza, 20 Oct 2026: a bar chart
 * from capital gain, realised P&L, dividends, taxes, fees and other
 * transactions to the total, each figure shown). The total is the account's
 * own change: its value at the window's end less its value at the close
 * before, less the money put in or taken out (and any flow the statement's
 * totals count but its rows do not list, `series.unlisted`), so the steps
 * always add up to what the account made. Dividends are gross; the tax
 * withheld on them and the tax on fills are taxes; the commission on fills and
 * the cash ledger's fees are fees; interest is other. Realised is the sales'
 * P&L with the sale's own commission and tax put back, since those are shown
 * as costs; capital gain is what is left: the change in what is still held,
 * options, currency on cash and anything else no row names. Null without a
 * value series over the window.
 */
export type ProfitStepKey = "capital" | "realised" | "dividends" | "taxes" | "fees" | "other";
export type ProfitSources = {
  /** A step the ledger has no rows for (no Cash Transactions, no commission field) is unread: its figure is zero, sits inside capital gain, and is shown as n/a. */
  steps: { key: ProfitStepKey; label: string; value: number; read: boolean }[];
  total: number;
  start: { date: string; value: number };
  end: { date: string; value: number };
  flows: number;
  /** Flows the statement's totals count but its rows do not list, inside the window. */
  unlisted: number;
};

export const PROFIT_LABELS: Record<ProfitStepKey, string> = {
  capital: "Capital gain",
  realised: "Realised P&L",
  dividends: "Dividends received",
  taxes: "Taxes",
  fees: "Fees paid",
  other: "Other transactions",
};

export function profitSources(book: Book, from: string, to: string, realisedNet: number): ProfitSources | null {
  const nav = [...(book.series?.nav ?? [])].filter((p) => p.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const start = [...nav].reverse().find((p) => p.date < from) ?? nav[0];
  const end = nav.at(-1);
  if (!start || !end || start.date >= end.date) return null;
  const inside = (d: string) => d > start.date && d <= end.date;
  let flows = 0;
  let dividends = 0;
  let withheld = 0;
  let otherFees = 0;
  let other = 0;
  for (const t of book.transactions) {
    if (!inside(t.date)) continue;
    const base = baseAmountOf(t, book.fx);
    if (base === null) continue;
    if (t.kind === "deposit" || t.kind === "withdrawal") flows += base;
    else if (t.kind === "dividend") {
      if (base >= 0) dividends += base;
      else withheld -= base;
    } else if (t.kind === "fee") otherFees -= base;
    else if (t.kind === "interest") other += base;
  }
  const unlisted = (book.series?.unlisted ?? []).filter((g) => g.to > start.date && g.from <= end.date).reduce((a, g) => a + g.amount, 0);
  const fills = fillsOf(book).filter((f) => inside(f.date));
  const commission = fills.reduce((a, f) => a + (f.commission ?? 0), 0);
  const tradeTax = fills.reduce((a, f) => a + (f.tax ?? 0), 0);
  const saleCosts = fills.filter((f) => f.side === "sell").reduce((a, f) => a + (f.commission ?? 0) + (f.tax ?? 0), 0);
  const total = end.value - start.value - flows - unlisted;
  const realised = realisedNet + saleCosts;
  const taxes = -(withheld + tradeTax);
  const fees = -(commission + otherFees);
  const capital = total - (realised + dividends + taxes + fees + other);
  const values: Record<ProfitStepKey, number> = { capital, realised, dividends, taxes, fees, other };
  const cashRead = book.transactions.some((t) => t.kind === "dividend" || t.kind === "fee" || t.kind === "interest" || t.kind === "deposit" || t.kind === "withdrawal");
  const costsRead = fillsOf(book).some((f) => f.commission !== undefined || f.tax !== undefined);
  const read: Record<ProfitStepKey, boolean> = { capital: true, realised: true, dividends: cashRead, taxes: cashRead || costsRead, fees: cashRead || costsRead, other: cashRead };
  const steps = (Object.keys(PROFIT_LABELS) as ProfitStepKey[]).map((key) => ({ key, label: PROFIT_LABELS[key], value: values[key], read: read[key] }));
  return { steps, total, start, end, flows, unlisted };
}

export type WinLoss = {
  sales: number;
  won: number;
  lost: number;
  wonPct: number | null;
  /** The average gain of a winning sale and the average loss of a losing one, in base currency and as a percent of the lots' cost. */
  avgWin: number | null;
  avgLoss: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  /** Average win over average loss: how much is made when right against what is lost when wrong; null without both. */
  winLossRatio: number | null;
  profitFactor: number | null;
  /** What a sale earns on average: win rate times the average win less the loss rate times the average loss. */
  expectancy: number | null;
  best: Sale | null;
  worst: Sale | null;
  avgDaysWinners: number | null;
  avgDaysLosers: number | null;
  /** Every sale in date order with its gain as a percent of cost, for the chart. */
  bars: { date: string; symbol: string; pnl: number; pct: number | null }[];
};

/** How much is won when a sale wins against how much is lost when it loses, over the closed lots given (Hamza, 15 Oct 2026). */
export function winLoss(closed: readonly ClosedLot[]): WinLoss {
  const sales = salesOf(closed);
  const t = tradeStats(closed);
  const win = sales.filter((s) => s.pnl > 0);
  const los = sales.filter((s) => s.pnl < 0);
  const pctOf = (s: Sale) => (s.cost > 0 ? (s.pnl / s.cost) * 100 : null);
  const avgPct = (group: Sale[]) => {
    const p = group.map(pctOf).filter((v): v is number => v !== null);
    return p.length ? mean(p) : null;
  };
  const avgWinPct = avgPct(win);
  const avgLossPct = avgPct(los);
  const wonShare = sales.length ? win.length / sales.length : null;
  return {
    sales: sales.length,
    won: win.length,
    lost: los.length,
    wonPct: t.wonPct,
    avgWin: t.avgWin,
    avgLoss: t.avgLoss,
    avgWinPct,
    avgLossPct: avgLossPct === null ? null : -avgLossPct,
    winLossRatio: t.avgWin !== null && t.avgLoss !== null && t.avgLoss > 0 ? t.avgWin / t.avgLoss : null,
    profitFactor: t.profitFactor,
    expectancy: wonShare === null ? null : wonShare * (t.avgWin ?? 0) - (1 - wonShare) * (t.avgLoss ?? 0),
    best: win.length ? win.reduce((a, s) => (s.pnl > a.pnl ? s : a)) : null,
    worst: los.length ? los.reduce((a, s) => (s.pnl < a.pnl ? s : a)) : null,
    avgDaysWinners: t.avgDaysWinners,
    avgDaysLosers: t.avgDaysLosers,
    bars: sales.map((s) => ({ date: s.date, symbol: s.symbol, pnl: s.pnl, pct: pctOf(s) })),
  };
}

// ---------------------------------------------------------------- rotations

/** How many days after a sale a buy still counts as funded by it. */
export const ROTATION_DAYS = 10;

export type Rotation = {
  /** The sale's date. */
  date: string;
  sold: string;
  bought: string;
  /** The buy's date. */
  boughtOn: string;
  /** The money that moved, base currency. */
  amount: number;
  /** Each side's price return from the sale's date to `to`, in percent; null when the closes do not cover it. */
  soldSince: number | null;
  boughtSince: number | null;
  /** The bought side's return less the sold side's: positive when the money did better where it went. */
  spreadPts: number | null;
  to: string | null;
};

/**
 * Each sale paired with the buys of other symbols in the days after it, the
 * proceeds shared out in date order: a buy funded by two sales makes two
 * rotations, a sale that funded nothing makes none. The fills of one symbol
 * on one day are one sale or one buy first. Pure on the fills.
 */
export function rotationsOf(fills: readonly Fill[], days: number = ROTATION_DAYS): Rotation[] {
  // One symbol on one day is one buy or one sale, however many fills the broker split it into.
  const merged = new Map<string, Fill>();
  for (const f of fills) {
    const key = `${f.date}:${f.symbol.toUpperCase()}:${f.side}`;
    const m = merged.get(key);
    if (m) merged.set(key, { ...m, quantity: m.quantity + f.quantity, amount: m.amount + f.amount });
    else merged.set(key, { ...f, symbol: f.symbol.toUpperCase() });
  }
  const sorted = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  const buys = sorted.filter((f) => f.side === "buy").map((f) => ({ f, left: f.amount }));
  const out: Rotation[] = [];
  for (const sale of sorted.filter((f) => f.side === "sell")) {
    let left = sale.amount;
    for (const b of buys) {
      if (left <= EPS) break;
      if (b.left <= EPS || b.f.date < sale.date || b.f.symbol.toUpperCase() === sale.symbol.toUpperCase()) continue;
      if (daysBetween(sale.date, b.f.date) > days) break;
      const amount = Math.min(left, b.left);
      left -= amount;
      b.left -= amount;
      out.push({ date: sale.date, sold: sale.symbol, bought: b.f.symbol, boughtOn: b.f.date, amount, soldSince: null, boughtSince: null, spreadPts: null, to: null });
    }
  }
  return out;
}

/** The close on or before a date; null before the series starts. */
function closeOn(points: readonly { date: string; value: number }[] | undefined, date: string): number | null {
  if (!points?.length) return null;
  let v: number | null = null;
  for (const p of points) {
    if (p.date > date) break;
    v = p.value;
  }
  return v;
}

/**
 * Each rotation judged by the closes: what the sold symbol did from the
 * sale's date to `asOf`, what the bought symbol did, and the spread between
 * them. A side the closes do not cover stays null, so the rotation is listed
 * and not judged.
 */
export function rotationOutcomes(rotations: readonly Rotation[], closes: Readonly<Record<string, readonly { date: string; value: number }[]>>, asOf: string): Rotation[] {
  const series = (symbol: string) => closes[symbol] ?? closes[symbol.toUpperCase()];
  return rotations.map((r) => {
    const since = (symbol: string) => {
      const pts = series(symbol);
      const a = closeOn(pts, r.date);
      const b = closeOn(pts, asOf);
      // A start before the series by more than a few days is not the symbol's price that day.
      const first = pts?.[0]?.date;
      if (a === null || b === null || a <= 0 || !first || daysBetween(first, r.date) < -5) return null;
      return (b / a - 1) * 100;
    };
    const soldSince = since(r.sold);
    const boughtSince = since(r.bought);
    return { ...r, soldSince, boughtSince, spreadPts: soldSince !== null && boughtSince !== null ? boughtSince - soldSince : null, to: asOf };
  });
}

export type RotationSummary = {
  rotations: number;
  judged: number;
  /** Rotations where the money did better where it went. */
  better: number;
  betterPct: number | null;
  avgSpreadPts: number | null;
  /** The spread weighted by the money that moved. */
  weightedSpreadPts: number | null;
  /** What the moved money gained (or lost) against staying put, base currency, over the judged rotations. */
  gain: number | null;
};

/** How well the money moved from one holding to another did against staying where it was (Hamza, 15 Oct 2026). */
export function rotationSummary(rotations: readonly Rotation[]): RotationSummary {
  const judged = rotations.filter((r) => r.spreadPts !== null);
  const amount = judged.reduce((a, r) => a + r.amount, 0);
  const better = judged.filter((r) => (r.spreadPts ?? 0) > 0).length;
  return {
    rotations: rotations.length,
    judged: judged.length,
    better,
    betterPct: judged.length ? (better / judged.length) * 100 : null,
    avgSpreadPts: judged.length ? mean(judged.map((r) => r.spreadPts as number)) : null,
    weightedSpreadPts: amount > 0 ? judged.reduce((a, r) => a + (r.spreadPts as number) * r.amount, 0) / amount : null,
    gain: judged.length ? judged.reduce((a, r) => a + ((r.spreadPts as number) / 100) * r.amount, 0) : null,
  };
}

/** Every symbol with a fill: how many buys and sells, the money in and out, in alphabetical order. */
export type TradedSymbol = { symbol: string; buys: number; sells: number; bought: number; sold: number; first: string; last: string };
export function tradedSymbols(fills: readonly Fill[]): TradedSymbol[] {
  const map = new Map<string, TradedSymbol>();
  for (const f of fills) {
    const key = f.symbol.toUpperCase();
    const t = map.get(key) ?? { symbol: key, buys: 0, sells: 0, bought: 0, sold: 0, first: f.date, last: f.date };
    if (f.side === "buy") {
      t.buys += 1;
      t.bought += f.amount;
    } else {
      t.sells += 1;
      t.sold += f.amount;
    }
    if (f.date < t.first) t.first = f.date;
    if (f.date > t.last) t.last = f.date;
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last) || a.symbol.localeCompare(b.symbol));
}

/** How far back a company's trade chart reads closes, by the span picked on it (calendar days). */
export const TRADE_SPANS = { "6M": 200, "1Y": 400, "5Y": 1900 } as const;
export type TradeSpan = keyof typeof TRADE_SPANS;
export const TRADE_SPAN_KEYS = Object.keys(TRADE_SPANS) as TradeSpan[];
