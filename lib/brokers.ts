/**
 * The brokers read through a person's own keys (SnapTrade Personal for
 * Schwab, Wealthsimple and the others they connect to it; eToro's own read
 * key): what each fetch returned, kept in the vault's `brokers` file beside
 * the book, and laid on the book at read time the way statements are. The
 * IBKR Flex statement stays the book itself. Pure: the request signing
 * string, the parsers and the merge; the calls are in lib/snaptrade-api.ts and
 * lib/etoro-api.ts.
 *
 * A broker that cannot be fetched keeps its last good copy; a reply that does
 * not read as positions throws, never an empty account.
 */
import { z } from "zod";

import { parseSnapTradePositions } from "@/lib/adapters/snaptrade";
import { holdingSchema, type Book, type Fx, type Holding } from "@/lib/holdings";

export const BROKER_SOURCES = ["snaptrade", "etoro"] as const;
export type BrokerSource = (typeof BROKER_SOURCES)[number];
export const BROKER_LABEL: Record<BrokerSource, string> = { snaptrade: "SnapTrade", etoro: "eToro" };

const currency = z.string().regex(/^[A-Z]{3}$/);

export const brokerCopySchema = z.object({
  fetchedAt: z.string(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The accounts the fetch saw, by the name the holdings carry. */
  accounts: z.array(z.string().max(80)).max(40),
  holdings: z.array(holdingSchema).max(2000),
  /** Units of `base` per one unit of each currency the holdings are in, read from the market feed at the fetch. */
  base: currency,
  rates: z.record(currency, z.number().positive()),
  notes: z.array(z.string().max(300)).max(10),
});
export type BrokerCopy = z.infer<typeof brokerCopySchema>;

export const brokersFileSchema = z.object({
  version: z.literal(1),
  snaptrade: brokerCopySchema.nullable().default(null),
  etoro: brokerCopySchema.nullable().default(null),
});
export type BrokersFile = z.infer<typeof brokersFileSchema>;
export const EMPTY_BROKERS: BrokersFile = { version: 1, snaptrade: null, etoro: null };

/** The file with one broker's copy replaced: a fetch that succeeded. A failed fetch never calls this, so the last good copy stays. */
export function withCopy(file: BrokersFile | null, source: BrokerSource, copy: BrokerCopy | null): BrokersFile {
  return { ...(file ?? EMPTY_BROKERS), [source]: copy };
}

/** The currencies a copy's holdings are in, other than the base: what the fetch asks the market feed to convert. */
export function currenciesOf(holdings: readonly Holding[], base: string): string[] {
  return [...new Set(holdings.map((h) => h.currency).filter((c) => c !== base))].sort();
}

/** One line for Setup: "3 accounts, 24 positions, as of 14 Oct." */
export function describeCopy(copy: BrokerCopy): string {
  const positions = copy.holdings.filter((h) => h.assetClass !== "cash").length;
  const d = new Date(`${copy.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${copy.accounts.length} account${copy.accounts.length === 1 ? "" : "s"}, ${positions} position${positions === 1 ? "" : "s"}, as of ${d}.${copy.notes.length ? ` ${copy.notes.join(" ")}` : ""}`.slice(0, 400);
}

/**
 * Lays the brokers' copies on the book: their holdings beside the book's own,
 * a broker's copy taking the place of any holdings of the same source the
 * book carried before, and the copy's rates filling the ones the book has
 * not got. A holding in a currency nothing converts is left out and said so.
 */
export function withBrokers(book: Book | null, file: BrokersFile | null, base: string, today: string): { book: Book | null; notes: string[] } {
  const copies = BROKER_SOURCES.flatMap((s) => (file?.[s] ? [{ source: s, copy: file[s]! }] : []));
  if (!copies.length) return { book, notes: [] };
  const fx: Fx = book ? { ...book.fx, rates: { ...book.fx.rates } } : { base, asOf: today, rates: {}, source: "brokers" };
  const notes: string[] = [];
  const holdings: Holding[] = [];
  let asOf = book?.asOf ?? "1970-01-01";
  for (const { source, copy } of copies) {
    if (copy.base === fx.base) for (const [ccy, r] of Object.entries(copy.rates)) if (fx.rates[ccy] === undefined && ccy !== fx.base) fx.rates[ccy] = r;
    const left = new Set<string>();
    for (const h of copy.holdings) {
      if (h.currency !== fx.base && fx.rates[h.currency] === undefined) left.add(h.currency);
      else holdings.push(h);
    }
    if (left.size) notes.push(`${BROKER_LABEL[source]}: positions in ${[...left].join(", ")} left out; no rate to ${fx.base} could be read.`);
    if (copy.asOf > asOf) asOf = copy.asOf;
  }
  const replaced = new Set<string>(copies.map((c) => c.source));
  const kept = (book?.holdings ?? []).filter((h) => !replaced.has(h.source));
  return {
    book: {
      ...(book ?? { lookThrough: [], transactions: [] }),
      asOf,
      fx,
      holdings: [...kept, ...holdings],
      lookThrough: book?.lookThrough ?? [],
      transactions: book?.transactions ?? [],
    } as Book,
    notes,
  };
}

// ---------------------------------------------------------------------------
// SnapTrade

/** JSON with every object's keys in alphabetical order and no spaces: SnapTrade's signing form. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

/**
 * The string SnapTrade's request signature is the HMAC-SHA256 of, keyed with
 * the consumer key (docs.snaptrade.com, Request Signatures): the body (null
 * when there is none or it is empty), the path from /api/v1 without the
 * query, and the query exactly as sent.
 */
export function snapTradeSigContent(path: string, query: string, body: unknown): string {
  const empty = body === null || body === undefined || (typeof body === "object" && !Array.isArray(body) && Object.keys(body as object).length === 0);
  return canonicalJson({ content: empty ? null : body, path, query });
}

export type SnapTradeAccount = { id: string; label: string };

/**
 * The accounts SnapTrade lists, each named by its institution and the
 * account's own name ("Wealthsimple TFSA"), with the last four digits of its
 * number when two would read the same. The name is what the portfolios and
 * Holdings show; the id stays in the fetch.
 */
export function parseSnapTradeAccounts(reply: unknown): SnapTradeAccount[] {
  if (!Array.isArray(reply)) throw new Error("SnapTrade returned something that is not an accounts list.");
  const rows = reply.map((a) => {
    const r = a as { id?: unknown; name?: unknown; number?: unknown; institution_name?: unknown };
    if (typeof r.id !== "string" || !r.id) throw new Error("A SnapTrade account had no id; the reply shape has changed.");
    const inst = typeof r.institution_name === "string" && r.institution_name.trim() ? r.institution_name.trim() : "Broker";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const label = name && !name.toLowerCase().includes(inst.toLowerCase()) ? `${inst} ${name}` : name || inst;
    const digits = typeof r.number === "string" ? r.number.replace(/\D/g, "").slice(-4) : "";
    return { id: r.id, label: label.slice(0, 60), digits };
  });
  return rows.map((r) => ({ id: r.id, label: rows.filter((o) => o.label === r.label).length > 1 && r.digits ? `${r.label} ···${r.digits}` : r.label }));
}

/** An account's cash from SnapTrade's balances reply, one holding per currency; a currency with no cash figure is skipped. */
export function parseSnapTradeBalances(reply: unknown, account: SnapTradeAccount, asOf: string): Holding[] {
  if (!Array.isArray(reply)) throw new Error("SnapTrade returned something that is not a balances list.");
  const out: Holding[] = [];
  for (const raw of reply) {
    const b = raw as { currency?: { code?: unknown } | string | null; cash?: unknown };
    const code = (typeof b.currency === "string" ? b.currency : b.currency?.code) as unknown;
    const cash = typeof b.cash === "number" ? b.cash : typeof b.cash === "string" ? Number(b.cash) : NaN;
    if (typeof code !== "string" || !/^[A-Za-z]{3}$/.test(code) || !Number.isFinite(cash) || cash === 0) continue;
    const ccy = code.toUpperCase();
    out.push({ id: `snaptrade:${account.id}:cash:${ccy}`, account: account.label, source: "snaptrade", assetClass: "cash", symbol: ccy, name: `${ccy} cash`, quantity: cash, price: 1, value: cash, costBasis: null, currency: ccy, asOf, valuation: "broker", country: null, sector: null, themes: [] });
  }
  return out;
}

/** One account's positions and cash as holdings, named by the account's label and identified by its SnapTrade id. */
export function snapTradeAccountHoldings(account: SnapTradeAccount, positions: unknown, balances: unknown, asOf: string): Holding[] {
  const held = parseSnapTradePositions(positions, account.label, asOf).map((h) => ({ ...h, id: h.id.replace(`snaptrade:${account.label}:`, `snaptrade:${account.id}:`) }));
  return [...held, ...parseSnapTradeBalances(balances, account, asOf)];
}

// ---------------------------------------------------------------------------
// eToro

/** A field by name whatever its casing: eToro's schema says `instrumentID`, its examples `instrumentId`. */
function field(o: unknown, name: string): unknown {
  if (!o || typeof o !== "object") return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (k.toLowerCase() === want) return v;
  return undefined;
}
const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

/** eToro's instrument types the app tells apart (Stocks 5, ETF 6); anything else (crypto, commodities, currencies, indices) reads as other. */
const ETORO_TYPE: Record<number, Holding["assetClass"]> = { 5: "equity", 6: "etf" };

export type EtoroInstrument = { id: number; symbol: string; name: string; type: number | null };

/** The display data reply: each instrument's symbol and name. */
export function parseEtoroInstruments(reply: unknown): EtoroInstrument[] {
  const list = field(reply, "instrumentDisplayDatas");
  if (!Array.isArray(list)) throw new Error("eToro returned something that is not an instruments list.");
  return list.flatMap((r) => {
    const id = num(field(r, "instrumentID"));
    const symbol = field(r, "symbolFull");
    if (id === null || typeof symbol !== "string" || !symbol) return [];
    const name = field(r, "instrumentDisplayName");
    return [{ id, symbol: symbol.toUpperCase(), name: typeof name === "string" && name ? name : symbol, type: num(field(r, "instrumentTypeID")) }];
  });
}

/** The instrument ids an eToro portfolio reply holds, its own positions and those of the people it copies. */
export function etoroInstrumentIds(reply: unknown): number[] {
  const p = field(reply, "clientPortfolio");
  const own = (field(p, "positions") as unknown[] | undefined) ?? [];
  const mirrors = (field(p, "mirrors") as unknown[] | undefined) ?? [];
  const all = [...own, ...mirrors.flatMap((m) => (field(m, "positions") as unknown[] | undefined) ?? [])];
  return [...new Set(all.map((x) => num(field(x, "instrumentID"))).filter((x): x is number => x !== null))];
}

/**
 * eToro's account P&L and portfolio reply as holdings, in US dollars, the
 * account currency eToro reports in. Positions of one instrument and side are
 * summed; each is valued at what it is worth now (the amount put in plus its
 * unrealized P&L), so a leveraged or short position counts its equity, never
 * its exposure, and is named as such. Cash is the reply's credit; each copy
 * (a mirror) is its own account with its own cash.
 */
export function parseEtoroPortfolio(reply: unknown, instruments: readonly EtoroInstrument[], asOf: string): { accounts: string[]; holdings: Holding[]; notes: string[] } {
  const p = field(reply, "clientPortfolio");
  if (!p || typeof p !== "object") throw new Error("eToro returned something that is not a portfolio.");
  const own = field(p, "positions");
  if (!Array.isArray(own)) throw new Error("eToro's portfolio had no positions list; the reply shape has changed.");
  const ccy = num(field(p, "accountCurrencyId"));
  if (ccy !== null && ccy !== 1) throw new Error("eToro reported the account in a currency other than US dollars, which the app does not read yet.");
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const notes: string[] = [];
  const unknown = new Set<number>();
  const holdings: Holding[] = [];
  const accounts: string[] = [];

  const add = (account: string, key: string, positions: unknown[], cash: number | null) => {
    accounts.push(account);
    const groups = new Map<string, { inst: EtoroInstrument; buy: boolean; lev: number; units: number; amount: number; pnl: number }>();
    for (const x of positions) {
      const id = num(field(x, "instrumentID"));
      const units = num(field(x, "units"));
      const amount = num(field(x, "amount"));
      if (id === null || units === null || amount === null) throw new Error("An eToro position had no instrument, units or amount; the reply shape has changed.");
      const inst = byId.get(id);
      if (!inst) {
        unknown.add(id);
        continue;
      }
      const buy = field(x, "isBuy") !== false;
      const lev = num(field(x, "leverage")) ?? 1;
      const pnlObj = field(x, "unrealizedPnL");
      const pnl = num(field(pnlObj, "pnL")) ?? num(field(x, "pnL")) ?? 0;
      const k = `${id}:${buy ? "b" : "s"}:${lev}`;
      const g = groups.get(k) ?? { inst, buy, lev, units: 0, amount: 0, pnl: 0 };
      g.units += units;
      g.amount += amount;
      g.pnl += pnl;
      groups.set(k, g);
    }
    for (const [k, g] of groups) {
      const value = g.amount + g.pnl;
      const cfd = !g.buy || g.lev > 1;
      const quantity = g.buy ? g.units : -g.units;
      holdings.push({
        id: `etoro:${key}:${k}`,
        account,
        source: "etoro",
        assetClass: cfd ? "other" : (ETORO_TYPE[g.inst.type ?? -1] ?? "other"),
        symbol: g.inst.symbol.slice(0, 40),
        name: cfd ? `${g.inst.name} (${g.buy ? "" : "short, "}x${g.lev}, CFD)` : g.inst.name,
        quantity,
        price: quantity ? value / quantity : null,
        value,
        costBasis: g.amount,
        currency: "USD",
        asOf,
        valuation: "broker",
        country: null,
        sector: null,
        themes: [],
      });
    }
    if (cash !== null && cash !== 0) holdings.push({ id: `etoro:${key}:cash`, account, source: "etoro", assetClass: "cash", symbol: "USD", name: "USD cash", quantity: cash, price: 1, value: cash, costBasis: null, currency: "USD", asOf, valuation: "broker", country: null, sector: null, themes: [] });
  };

  add("eToro", "own", own, num(field(p, "credit")));
  const mirrors = field(p, "mirrors");
  for (const m of Array.isArray(mirrors) ? mirrors : []) {
    const id = num(field(m, "mirrorID"));
    const who = field(m, "parentUsername");
    const positions = field(m, "positions");
    if (id === null || !Array.isArray(positions)) throw new Error("An eToro copy had no id or positions; the reply shape has changed.");
    add(`eToro copying ${typeof who === "string" && who ? who : id}`.slice(0, 60), `mirror-${id}`, positions, num(field(m, "availableAmount")));
  }
  if (unknown.size) notes.push(`${unknown.size} eToro instrument${unknown.size === 1 ? "" : "s"} could not be named and ${unknown.size === 1 ? "is" : "are"} left out.`);
  return { accounts, holdings, notes };
}
