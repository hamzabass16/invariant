/**
 * Synthetic personas: fictional investors the app is tested against before a
 * real one ever signs in. Each persona in data/synthetic/<id>/ is a profile
 * and inputs, the methodology document they invest by, a target (what their
 * dashboard must show, in their words), a hand-written methodology in recipes,
 * and the spec of a book this module generates from a seed, the same way on
 * every run.
 *
 * The generator writes the one holdings model (lib/holdings.ts): holdings from
 * the spec, option contracts with OCC symbols and expiries counted from the
 * as-of date, transactions the spec implies (dividends by quarter, premium by
 * month, coupons, calls and distributions) and an account value series as a
 * seeded random walk. Nothing here is a real person's; every figure is made
 * up. Pure.
 */
import { z } from "zod";

import { ASSET_CLASSES, bookSchema, bondFields, depositFields, fundFields, lookThroughSchema, propertyFields, recordFields, type Book, type Holding, type Transaction } from "@/lib/holdings";
import { computeFigure, contextFor, dashboardFor, evaluate, inputLabel, type Methodology } from "@/lib/methodology";
import { PANELS } from "@/lib/ontology";
import { formatUnit, needsWords } from "@/lib/recipes";
import { INPUT_IDS, PROFILE_IDS, modulesFor, type Setup } from "@/lib/setup";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const equitySpec = z.object({
  symbol: z.string(),
  name: z.string(),
  account: z.string(),
  assetClass: z.enum(["equity", "etf"]).default("equity"),
  quantity: z.number(),
  price: z.number().positive(),
  /** Cost per unit; null when the broker gives none. */
  costPerUnit: z.number().positive().nullable().default(null),
  /** Change since the previous close, per unit; null for a source without a previous close. */
  dayChangePerUnit: z.number().nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  country: z.string().nullable().default("US"),
  sector: z.string().nullable().default(null),
  themes: z.array(z.string()).default([]),
  /** Quarterly dividend per share today; the generator pays it for the last eight quarters, smaller going back by the growth rate. */
  dividendPerShare: z.number().nonnegative().default(0),
  dividendGrowthPct: z.number().default(0),
  record: recordFields.optional(),
});

const optionSpec = z.object({
  underlying: z.string(),
  right: z.enum(["C", "P"]),
  strike: z.number().positive(),
  daysToExpiry: z.number().int().min(1),
  /** Contracts; negative when sold. */
  contracts: z.number().int(),
  /** Today's mark per share. */
  mark: z.number().nonnegative(),
  /** Premium per share when opened, and how many days ago. */
  openedAt: z.number().nonnegative(),
  openedDaysAgo: z.number().int().min(0),
  account: z.string(),
  multiplier: z.number().positive().default(100),
});

const otherSpec = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  account: z.string(),
  source: z.enum(["ibkr", "snaptrade", "etoro", "statements", "manual"]),
  assetClass: z.enum(ASSET_CLASSES),
  quantity: z.number().default(1),
  price: z.number().nullable().default(null),
  value: z.number(),
  costBasis: z.number().nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  valuation: z.enum(["broker", "bank_statement", "fund_report", "manual", "estimate"]),
  /** Days before the as-of date the value was set. */
  agedDays: z.number().int().min(0).default(0),
  country: z.string().nullable().default(null),
  sector: z.string().nullable().default(null),
  themes: z.array(z.string()).default([]),
  bond: bondFields.optional(),
  deposit: depositFields.optional(),
  fund: fundFields.optional(),
  property: propertyFields.optional(),
  record: recordFields.optional(),
  lookThrough: z.array(lookThroughSchema.omit({ parentId: true, asOf: true })).default([]),
});

const walkSpec = z.object({ start: z.number().positive(), driftPct: z.number(), volPct: z.number().nonnegative() });

export const personaSchema = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  /** Who this is, in two or three sentences; shown in reports, never used by the generator. */
  about: z.string(),
  setup: z.object({
    ownerName: z.string(),
    profile: z.enum(PROFILE_IDS),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    inputs: z.array(z.enum(INPUT_IDS)).min(1),
    tradesOptions: z.boolean(),
  }),
  seed: z.number().int(),
  asOf: isoDate,
  book: z.object({
    accounts: z.array(z.object({ name: z.string(), source: z.enum(["ibkr", "snaptrade", "etoro", "statements", "manual"]), cash: z.number().default(0), cashCurrency: z.string().regex(/^[A-Z]{3}$/).default("USD") })).min(1),
    equities: z.array(equitySpec).default([]),
    options: z.array(optionSpec).default([]),
    others: z.array(otherSpec).default([]),
    fx: z.record(z.string(), z.number().positive()).default({}),
    rate: z.number().default(0.04),
    /** Underlying prices the Greeks need for symbols the book holds no shares of. */
    spots: z.record(z.string(), z.number().positive()).default({}),
    /** Option premium sold to open per month, over the last N months, with noise; closes and expiries follow. */
    premium: z.object({ monthly: z.number().nonnegative(), months: z.number().int().min(1).max(36), account: z.string(), underlyings: z.array(z.string()).min(1) }).optional(),
    /** The account value by week, as a seeded walk, with benchmark walks beside it. */
    series: z.object({ weeks: z.number().int().min(8).max(520), nav: walkSpec, benchmarks: z.record(z.string(), walkSpec).default({}) }).optional(),
    /** Cash moves and fund events the spec names outright. */
    transactions: z.array(z.object({ daysAgo: z.number().int().min(0), account: z.string(), kind: z.enum(["deposit", "withdrawal", "capital_call", "distribution", "fee", "buy", "sell", "interest"]), symbol: z.string(), amount: z.number(), quantity: z.number().default(0), price: z.number().nullable().default(null), currency: z.string().regex(/^[A-Z]{3}$/).default("USD") })).default([]),
  }),
});
export type Persona = z.infer<typeof personaSchema>;

// ---------------------------------------------------------------------------
// Deterministic randomness and dates

/** mulberry32: the same seed gives the same book on every run, on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal from two uniforms (Box-Muller). */
function normal(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** AAPL, 2026-11-20, C, 245 -> "AAPL 261120C00245000", the OCC form brokers report. */
export function occSymbol(underlying: string, expiry: string, right: "C" | "P", strike: number): string {
  return `${underlying} ${expiry.slice(2).replaceAll("-", "")}${right}${String(Math.round(strike * 1000)).padStart(8, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function optionName(underlying: string, expiry: string, right: "C" | "P", strike: number): string {
  const [y, m, d] = expiry.split("-");
  return `${underlying} ${Number(d)} ${MONTHS[Number(m) - 1]} ${y} ${strike} ${right}`;
}

// ---------------------------------------------------------------------------
// The book

export function generateBook(p: Persona): Book {
  const r = rng(p.seed);
  const asOf = p.asOf;
  const sourceOf = new Map(p.book.accounts.map((a) => [a.name, a.source]));
  const source = (account: string) => {
    const s = sourceOf.get(account);
    if (!s) throw new Error(`Persona ${p.id}: account ${account} is not in the accounts list.`);
    return s;
  };
  const holdings: Holding[] = [];
  const transactions: Transaction[] = [];
  const lookThrough: Book["lookThrough"] = [];

  for (const a of p.book.accounts) {
    if (a.cash === 0) continue;
    holdings.push({ id: `${a.name}:cash:${a.cashCurrency}`, account: a.name, source: a.source, assetClass: "cash", symbol: a.cashCurrency, name: `Cash (${a.cashCurrency})`, quantity: a.cash, price: 1, value: a.cash, costBasis: null, currency: a.cashCurrency, asOf, valuation: a.source === "statements" ? "bank_statement" : "broker", country: null, sector: null, themes: ["Cash"] });
  }

  for (const e of p.book.equities) {
    const value = round(e.quantity * e.price);
    holdings.push({
      id: `${e.account}:${e.symbol}`,
      account: e.account,
      source: source(e.account),
      assetClass: e.assetClass,
      symbol: e.symbol,
      name: e.name,
      quantity: e.quantity,
      price: e.price,
      value,
      costBasis: e.costPerUnit === null ? null : round(e.quantity * e.costPerUnit),
      dayChange: e.dayChangePerUnit === null ? null : round(e.quantity * e.dayChangePerUnit),
      currency: e.currency,
      asOf,
      valuation: "broker",
      country: e.country,
      sector: e.sector,
      themes: e.themes,
      ...(e.record ? { record: e.record } : {}),
    });
    if (e.dividendPerShare > 0) {
      // Eight quarters of dividends, each a year's growth smaller going back; paid around the same day each quarter.
      const offset = Math.floor(r() * 60);
      for (let q = 0; q < 8; q += 1) {
        const date = addDays(asOf, -(offset + q * 91));
        const perShare = e.dividendPerShare / (1 + e.dividendGrowthPct / 100) ** (q / 4);
        transactions.push({ date, account: e.account, kind: "dividend", symbol: e.symbol, quantity: 0, price: null, amount: round(perShare * e.quantity), currency: e.currency });
      }
    }
  }

  for (const o of p.book.options) {
    const expiry = addDays(asOf, o.daysToExpiry);
    const symbol = occSymbol(o.underlying, expiry, o.right, o.strike);
    const value = round(o.contracts * o.mark * o.multiplier);
    const cost = round(o.contracts * o.openedAt * o.multiplier);
    holdings.push({
      id: `${o.account}:${symbol}`,
      account: o.account,
      source: source(o.account),
      assetClass: "option",
      symbol,
      name: optionName(o.underlying, expiry, o.right, o.strike),
      quantity: o.contracts,
      price: o.mark,
      value,
      costBasis: cost,
      currency: "USD",
      asOf,
      valuation: "broker",
      country: "US",
      sector: null,
      themes: [],
      option: { underlying: o.underlying, right: o.right, strike: o.strike, expiry, multiplier: o.multiplier },
    });
    // Opening the contract: cash in when sold, out when bought.
    transactions.push({ date: addDays(asOf, -o.openedDaysAgo), account: o.account, kind: "option_open", symbol, quantity: o.contracts, price: o.openedAt, amount: -cost, currency: "USD", option: { underlying: o.underlying, right: o.right, strike: o.strike, expiry, multiplier: o.multiplier } });
  }

  for (const x of p.book.others) {
    const h: Holding = {
      id: x.id,
      account: x.account,
      source: x.source,
      assetClass: x.assetClass,
      symbol: x.symbol,
      name: x.name,
      quantity: x.quantity,
      price: x.price,
      value: x.value,
      costBasis: x.costBasis,
      currency: x.currency,
      asOf: addDays(asOf, -x.agedDays),
      valuation: x.valuation,
      country: x.country,
      sector: x.sector,
      themes: x.themes,
      ...(x.bond ? { bond: x.bond } : {}),
      ...(x.deposit ? { deposit: x.deposit } : {}),
      ...(x.fund ? { fund: x.fund } : {}),
      ...(x.property ? { property: x.property } : {}),
      ...(x.record ? { record: x.record } : {}),
    };
    holdings.push(h);
    for (const row of x.lookThrough) lookThrough.push({ ...row, parentId: x.id, asOf: h.asOf });
    if (x.bond && x.bond.coupon) {
      // Two coupons a year on the face value.
      for (let k = 0; k < 4; k += 1) transactions.push({ date: addDays(asOf, -(45 + k * 182)), account: x.account, kind: "coupon", symbol: x.symbol, quantity: 0, price: null, amount: round((x.value * x.bond.coupon) / 100 / 2), currency: x.currency });
    }
  }

  if (p.book.premium) {
    const pr = p.book.premium;
    for (let mo = 1; mo <= pr.months; mo += 1) {
      const u = pr.underlyings[Math.floor(r() * pr.underlyings.length)];
      const premium = round(pr.monthly * (0.8 + 0.4 * r()));
      const opened = addDays(asOf, -(mo * 30 + Math.floor(r() * 10)));
      const expiry = addDays(opened, 35);
      const spot = p.book.spots[u] ?? p.book.equities.find((e) => e.symbol === u)?.price ?? 100;
      const right: "C" | "P" = r() < 0.5 ? "P" : "C";
      const strike = round(spot * (right === "P" ? 0.93 : 1.07), 0);
      const sym = occSymbol(u, expiry, right, strike);
      const option = { underlying: u, right, strike, expiry, multiplier: 100 };
      transactions.push({ date: opened, account: pr.account, kind: "option_open", symbol: sym, quantity: -1, price: round(premium / 100), amount: premium, currency: "USD", option });
      // Two in three expire worthless; the rest are bought back for a third of the premium.
      if (r() < 0.66) transactions.push({ date: expiry, account: pr.account, kind: "expiry", symbol: sym, quantity: 1, price: 0, amount: 0, currency: "USD", option });
      else transactions.push({ date: addDays(expiry, -7), account: pr.account, kind: "option_close", symbol: sym, quantity: 1, price: round(premium / 300), amount: -round(premium / 3), currency: "USD", option });
    }
  }

  for (const t of p.book.transactions) transactions.push({ date: addDays(asOf, -t.daysAgo), account: t.account, kind: t.kind, symbol: t.symbol, quantity: t.quantity, price: t.price, amount: t.amount, currency: t.currency });
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const walk = (spec: z.infer<typeof walkSpec>, weeks: number) => {
    const out: { date: string; value: number }[] = [];
    let v = spec.start;
    const mu = spec.driftPct / 100 / 52;
    const sigma = spec.volPct / 100 / Math.sqrt(52);
    for (let w = weeks; w >= 0; w -= 1) {
      out.push({ date: addDays(asOf, -7 * w), value: round(v) });
      v *= Math.exp(mu - (sigma * sigma) / 2 + sigma * normal(r));
    }
    return out;
  };
  const series = p.book.series
    ? {
        nav: walk(p.book.series.nav, p.book.series.weeks),
        benchmarks: Object.fromEntries(Object.entries(p.book.series.benchmarks).map(([k, s]) => [k, walk(s, p.book.series!.weeks)])),
        source: `Seeded walk for the ${p.name} persona; fictional.`,
      }
    : undefined;

  const spots = { ...p.book.spots };
  return bookSchema.parse({
    asOf,
    holdings,
    lookThrough,
    transactions,
    fx: { base: p.setup.baseCurrency, asOf, rates: p.book.fx, source: `Fictional rates for the ${p.name} persona.` },
    market: { asOf, rate: p.book.rate, spots, source: `Fictional marks for the ${p.name} persona.` },
    ...(series ? { series } : {}),
  });
}

/** The persona's setup record, as the app would hold it after stage 1. */
export function setupOf(p: Persona, methodology: Methodology | null, today: string): Setup {
  return { version: 1, ownerName: p.setup.ownerName, profile: p.setup.profile, baseCurrency: p.setup.baseCurrency, inputs: p.setup.inputs, tradesOptions: p.setup.tradesOptions, helperName: null, methodology, updated: today };
}

// ---------------------------------------------------------------------------
// The dashboard in words, for a judge that cannot see the screen

/**
 * What the Overview would show this persona under `m` on `book`, as text:
 * every headline tile and section with its computed value or what it is
 * waiting for, every finding with its status, and the panels the inputs
 * cannot fill. The judge reads this; so can a person.
 */
export function dashboardText(m: Methodology, book: Book, setup: Setup, today: string): string {
  const modules = modulesFor(setup, book);
  const { figures, dashboard, missing } = dashboardFor(setup.profile, modules, m);
  const ctx = contextFor(book, today, m);
  const ccy = book.fx.base;
  const show = (id: string) => {
    const f = figures.find((x) => x.id === id);
    if (!f) return `  - ${id}: (no such figure)`;
    const res = computeFigure(f, ctx, setup.inputs);
    if (res.needs.length) return `  - ${f.label} [${f.view}]: waiting; ${needsWords(res.needs, inputLabel)}`;
    if (res.kind === "scalar") return `  - ${f.label} [tile]: ${res.value === null ? "nothing to measure yet" : formatUnit(res.value, f.unit, ccy)}`;
    const pts = res.points.slice(0, 8).map((pt) => `${pt.label} ${formatUnit(pt.value, f.unit, ccy)}`);
    return `  - ${f.label} [${f.view} by ${f.by}]: ${pts.length ? pts.join("; ") : "nothing to show yet"}${res.points.length > 8 ? `; and ${res.points.length - 8} more` : ""}`;
  };
  const lines: string[] = [`Overview for ${setup.ownerName}, shaped by "${m.name}" (${today}).`, "", "Headline:"];
  for (const id of dashboard.headline) lines.push(show(id));
  const findings = evaluate(m, book, today, setup.inputs);
  lines.push("", "Methodology checks:");
  for (const f of findings) {
    const where = f.rule.section ? `§${f.rule.section}` : "";
    const how = f.status === "manual" ? "yours to check" : f.status === "n/a" ? `waiting: ${f.detail || "no figure yet"}` : `${f.status}${f.actual ? ` at ${f.actual}` : ""}${f.limit ? ` (limit ${f.limit})` : ""}${f.detail ? `; ${f.detail}` : ""}`;
    lines.push(`  - [${f.rule.severity}] ${where} ${f.rule.text}: ${how}`);
  }
  for (const s of dashboard.sections) {
    if (s.kind === "figures") {
      lines.push("", `Section "${s.label}"${s.from ? ` (from §${s.from})` : ""}:`);
      for (const id of s.figures) lines.push(show(id));
    } else lines.push("", `Panel: ${PANELS[s.id].label} (${s.view}). ${PANELS[s.id].about}`);
  }
  if (missing.length) lines.push("", `Panels the methodology asks for that no input fills: ${missing.map((id) => PANELS[id].label).join(", ")}.`);
  if (m.classes.length) {
    lines.push("", "Classes:");
    for (const c of m.classes) lines.push(`  - ${c.label}: ${book.holdings.filter((h) => ctx.classOf(h) === c.id).map((h) => h.symbol).join(", ") || "no holding"}`);
  }
  return lines.join("\n");
}
