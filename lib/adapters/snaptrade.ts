/**
 * SnapTrade "all positions" reply (GET /accounts/{accountId}/positions/all)
 * into the shared holdings model. Pure. Used for Schwab, read-only: the
 * adapter calls position, balance and activity endpoints only, and
 * `npm run check:guard` fails on any order endpoint.
 *
 * Instrument fields follow SnapTrade's published schema (kind, symbol,
 * option_type, strike_price, expiration_date, multiplier, underlying). The
 * position fields are its "all positions" schema (units, price, cost_basis
 * per share, options included, and currency); `average_purchase_price`, per
 * contract for options, is the older endpoint's and is read only when
 * `cost_basis` is absent. A reply that does not match throws, it never reads
 * as an empty account.
 */
import type { AssetClass, Holding } from "@/lib/holdings";

type Instrument = {
  kind?: string;
  id?: string;
  symbol?: string;
  description?: string | null;
  currency?: string | null;
  option_type?: "CALL" | "PUT";
  strike_price?: string;
  expiration_date?: string | null;
  multiplier?: string | null;
  underlying?: { symbol?: string } | null;
};

type Position = {
  instrument?: Instrument;
  units?: number | string | null;
  price?: number | string | null;
  cost_basis?: number | string | null;
  average_purchase_price?: number | string | null;
  currency?: string | { code?: string } | null;
};

const KIND: Record<string, AssetClass> = { stock: "equity", adr: "equity", etf: "etf", mutualfund: "other", cef: "other", bond: "bond", crypto: "other", other: "other", option: "option" };

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

export function parseSnapTradePositions(reply: unknown, accountLabel: string, asOf: string): Holding[] {
  const results = (reply as { results?: unknown })?.results;
  if (!Array.isArray(results)) throw new Error("SnapTrade returned something that is not a positions list.");
  const out: Holding[] = [];
  for (const raw of results as Position[]) {
    const ins = raw.instrument;
    const units = n(raw.units);
    if (!ins?.symbol || !ins.kind || units === null) throw new Error("A SnapTrade position had no instrument or units; the reply shape has changed.");
    if (units === 0) continue;
    const assetClass = KIND[ins.kind] ?? "other";
    const price = n(raw.price);
    // Per share, options included; the older field is per contract for options.
    const perShare = n(raw.cost_basis);
    const perContract = perShare === null ? n(raw.average_purchase_price) : null;
    const ccy = (typeof raw.currency === "string" ? raw.currency : raw.currency?.code) ?? ins.currency ?? "USD";
    const base = {
      id: `snaptrade:${accountLabel}:${ins.id ?? ins.symbol}`,
      account: accountLabel,
      source: "snaptrade" as const,
      symbol: ins.symbol.replace(/\s+/g, " ").trim(),
      name: ins.description ?? ins.symbol,
      quantity: units,
      price,
      currency: ccy.toUpperCase(),
      asOf,
      valuation: "broker" as const,
      country: null,
      sector: null,
      themes: [],
    };
    if (assetClass === "option") {
      const multiplier = n(ins.multiplier) ?? 100;
      const strike = n(ins.strike_price);
      if (strike === null || !ins.expiration_date || !ins.underlying?.symbol) throw new Error(`SnapTrade option ${ins.symbol} is missing its strike, expiry or underlying.`);
      out.push({
        ...base,
        assetClass,
        value: (price ?? 0) * units * multiplier,
        // Signed like value.
        costBasis: perShare !== null ? perShare * units * multiplier : perContract !== null ? perContract * units : null,
        option: { underlying: ins.underlying.symbol.toUpperCase(), right: ins.option_type === "PUT" ? "P" : "C", strike, expiry: ins.expiration_date.slice(0, 10), multiplier },
      });
    } else {
      const avg = perShare ?? perContract;
      out.push({ ...base, assetClass, value: (price ?? 0) * units, costBasis: avg === null ? null : avg * units });
    }
  }
  return out;
}
