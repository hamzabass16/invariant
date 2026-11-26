/**
 * IBKR Flex statement into the shared holdings model, options included.
 * Pure: the sync and `npm run check:options` share it.
 *
 * The Flex Query needs these sections: Open Positions (stocks, ETFs and
 * options), Trades (executions), Cash Report, and for options "Option
 * Exercises, Assignments and Expirations" (element OptionEAE). With "Change
 * in NAV", "Net Asset Value (NAV) in Base" or "Equity Summary by Report Date
 * in Base" included, the account's value by day comes through as the book's
 * series (returns, drawdowns). With "Cash Transactions" included, the
 * dividends, the tax withheld on them, interest and fees come through
 * (cashTransactionsOf), for the Dividends screen and What each holding made.
 * A Flex token can return reports and nothing else.
 */
import { elements, flexDate } from "@/lib/flex";
import type { Holding, Transaction } from "@/lib/holdings";

const num = (v: string | undefined) => {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : 0;
};

const optionOf = (a: Record<string, string>) => ({
  underlying: (a.underlyingSymbol ?? "").trim().toUpperCase(),
  right: (a.putCall ?? "").toUpperCase().startsWith("P") ? ("P" as const) : ("C" as const),
  strike: num(a.strike),
  expiry: flexDate(a.expiry),
  multiplier: num(a.multiplier) || 100,
});

const isOption = (a: Record<string, string>) => a.assetCategory === "OPT";
const isShare = (a: Record<string, string>) => (a.assetCategory ?? "STK") === "STK";

const regions = new Intl.DisplayNames(["en"], { type: "region" });
/** The issuer's country when the Flex query carries IBKR's issuerCountryCode (ISO 3166, two letters); null when it does not. */
export function countryOfIso(code: string | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  try {
    const name = regions.of(c);
    return name && name !== c ? name : null;
  } catch {
    return null;
  }
}

/**
 * The Cash Transactions section, in the ledger's kinds (Hamza, 19 Oct 2026:
 * the Dividends screen): a dividend or a payment in lieu of one is a
 * dividend; tax withheld on a company's dividend is a dividend of its own,
 * negative, so what was received is net of it; interest received or paid is
 * interest; other fees are fees. A deposit or withdrawal is the money the
 * person put in or took out, by its sign (Hamza, 19 Oct 2026: the IRR and
 * the time-weighted return take it out of the account's change, so money
 * added is never read as a gain). A query set to both detail and summary
 * rows counts the detail alone, type by type, so nothing is counted twice and
 * a type IBKR gives only in summary is still read.
 */
export function cashTransactionsOf(xml: string, accountLabel: string): Transaction[] {
  const rows = elements(xml, "CashTransaction");
  const typeOf = (r: Record<string, string>) => (r.type ?? "").trim().toLowerCase();
  const detailed = new Set(rows.filter((r) => (r.levelOfDetail ?? "").toUpperCase() === "DETAIL").map(typeOf));
  const out: Transaction[] = [];
  for (const r of rows) {
    if (detailed.has(typeOf(r)) && (r.levelOfDetail ?? "").toUpperCase() !== "DETAIL") continue;
    const type = typeOf(r);
    const symbol = (r.symbol ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    const date = flexDate(r.dateTime || r.settleDate || r.reportDate);
    const amount = num(r.amount);
    if (!date || !amount) continue;
    const flow = /deposit|withdrawal/.test(type);
    const kind = flow ? (amount > 0 ? "deposit" : "withdrawal") : /dividend/.test(type) ? "dividend" : /withholding/.test(type) ? (symbol ? "dividend" : "fee") : /interest/.test(type) ? "interest" : /fee|commission adj/.test(type) ? "fee" : null;
    if (!kind) continue;
    if (kind === "dividend" && !symbol) continue;
    const rate = r.fxRateToBase !== undefined && r.fxRateToBase !== "" && Number.isFinite(Number(r.fxRateToBase)) ? Number(r.fxRateToBase) : undefined;
    // Tax withheld is kept as a cost too, so Trades can show what tax took without reading the dividends again.
    const withheld = /withholding/.test(type) ? { tax: -amount } : {};
    out.push({ date, account: accountLabel, kind, symbol, quantity: 0, price: null, amount, currency: (r.currency ?? "USD").toUpperCase(), ...(rate !== undefined && rate > 0 ? { amountBase: amount * rate } : {}), ...withheld });
  }
  return out;
}

/**
 * Money and shares moved in or out by transfer (the Flex query's Transfers
 * section, Hamza, 19 Oct 2026: an account funded partly by transfers from
 * another IBKR account and a broker read a +72% day): each is a deposit or a
 * withdrawal at its value in base, so the returns take it out like any other
 * flow. Cash moved by transfer is `cashTransfer`; shares are priced at
 * `positionAmountInBase`, else `positionAmount` at the row's rate.
 */
export function transfersOf(xml: string, accountLabel: string): Transaction[] {
  const rows = elements(xml, "Transfer");
  const detailed = rows.some((r) => (r.levelOfDetail ?? "").toUpperCase() !== "SUMMARY" && r.levelOfDetail !== undefined);
  const out: Transaction[] = [];
  for (const r of rows) {
    if (detailed && (r.levelOfDetail ?? "").toUpperCase() === "SUMMARY") continue;
    const date = flexDate(r.date || r.dateTime || r.settleDate || r.reportDate);
    if (!date) continue;
    const rate = Number(r.fxRateToBase);
    const ok = Number.isFinite(rate) && rate > 0;
    const cash = num(r.cashTransfer);
    const position = r.positionAmountInBase !== undefined && r.positionAmountInBase !== "" ? num(r.positionAmountInBase) : ok ? num(r.positionAmount) * rate : 0;
    const base = (ok ? cash * rate : cash) + position;
    if (!base) continue;
    // IN adds to the account and OUT takes from it, whatever sign the row's figures carry.
    const direction = (r.direction ?? "").toUpperCase();
    const signed = direction === "IN" ? Math.abs(base) : direction === "OUT" ? -Math.abs(base) : base;
    const symbol = (r.symbol ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    out.push({ date, account: accountLabel, kind: signed > 0 ? "deposit" : "withdrawal", symbol: cash && !position ? "" : symbol, quantity: 0, price: null, amount: signed, currency: (r.currency ?? "USD").toUpperCase(), amountBase: signed });
  }
  return out;
}

/** What the statement's own Change in NAV says came in or went out over its period that its rows do not list, in base. */
export type UnlistedFlow = { from: string; to: string; amount: number };

/**
 * The statement's own total of deposits, withdrawals and transfers (its
 * Change in NAV) against the flows its rows list: a difference is money that
 * moved on days the app cannot know, so the returns over those dates count it
 * as a gain or a loss, and the screens say so. Null when the statement has no
 * Change in NAV or the two agree within a dollar or half a percent.
 */
export function unlistedFlowOf(xml: string, listed: readonly Transaction[]): UnlistedFlow | null {
  const c = elements(xml, "ChangeInNAV")[0];
  if (!c) return null;
  const from = flexDate(c.fromDate);
  const to = flexDate(c.toDate);
  if (!from || !to) return null;
  const expected = ["depositsWithdrawals", "assetTransfers", "internalCashTransfers"].reduce((a, k) => a + num(c[k]), 0);
  const inside = listed.filter((t) => (t.kind === "deposit" || t.kind === "withdrawal") && t.date >= from && t.date <= to).reduce((a, t) => a + (t.amountBase ?? t.amount), 0);
  const gap = expected - inside;
  return Math.abs(gap) > Math.max(1, Math.abs(expected) * 0.005) ? { from, to, amount: gap } : null;
}

/**
 * The account's cash at the statement's end (Hamza, 6 Nov 2026: a sale left
 * $2.28k in cash and the app showed none). From the Cash Report's ending
 * cash, each currency apart and the base summary, one account at a time;
 * else the Equity Summary in Base's cash on its last day, in base alone.
 * None when the query carries neither, said so; never a zero.
 */
export type FlexCash = { base: number; currencies: { currency: string; amount: number }[]; from: "Cash Report" | "Equity Summary" };

export type FlexBook = { asOf: string; account: string; currency: string; cash: FlexCash | null; holdings: Holding[]; transactions: Transaction[]; nav: { date: string; value: number }[]; unlisted: UnlistedFlow | null };

/** Throws when the XML has no Open Positions section: an unreadable statement never looks like an empty account. */
export function parseFlexBook(xml: string, accountLabel: string): FlexBook {
  const statement = elements(xml, "FlexStatement")[0];
  if (!statement) throw new Error("The reply from IBKR is not a Flex statement.");
  if (!/<OpenPositions\b/.test(xml)) throw new Error("The Flex query has no Open Positions section. Add it in Client Portal → Reports → Flex Queries.");
  const asOf = flexDate(statement.toDate) || flexDate(statement.whenGenerated);

  const holdings: Holding[] = [];
  for (const p of elements(xml, "OpenPosition")) {
    if ((p.levelOfDetail ?? "SUMMARY") !== "SUMMARY") continue;
    const quantity = num(p.position);
    if (quantity === 0) continue;
    const symbol = (p.symbol ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    const price = num(p.markPrice);
    const base = {
      account: accountLabel,
      source: "ibkr" as const,
      symbol,
      name: p.description ?? symbol,
      quantity,
      price,
      costBasis: p.costBasisMoney !== undefined ? num(p.costBasisMoney) : null,
      currency: (p.currency ?? "USD").toUpperCase(),
      asOf,
      valuation: "broker" as const,
      country: countryOfIso(p.issuerCountryCode),
      sector: null,
      themes: [],
    };
    if (isOption(p)) {
      const option = optionOf(p);
      holdings.push({ ...base, id: `ibkr:${accountLabel}:${p.conid ?? symbol}`, assetClass: "option", value: p.positionValue ? num(p.positionValue) : quantity * price * option.multiplier, option });
    } else if (isShare(p)) {
      const etf = (p.subCategory ?? "").toUpperCase() === "ETF";
      holdings.push({ ...base, id: `ibkr:${accountLabel}:${p.conid ?? symbol}`, assetClass: etf ? "etf" : "equity", value: p.positionValue ? num(p.positionValue) : quantity * price });
    }
  }

  const transactions: Transaction[] = [];
  for (const t of elements(xml, "Trade")) {
    if ((t.levelOfDetail ?? "EXECUTION") !== "EXECUTION") continue;
    const date = flexDate(t.tradeDate ?? t.dateTime);
    const symbol = (t.symbol ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!date || !symbol) continue;
    const quantity = num(t.quantity);
    // "Net Cash in Base" is the statement's own conversion of the trade; it prices a currency no open position carries.
    const amountBase = t.netCashInBase !== undefined && Number.isFinite(Number(t.netCashInBase)) ? num(t.netCashInBase) : undefined;
    // IBKR gives the commission and the tax as cash out, negative; the ledger keeps them as costs. A query without those fields leaves them unread, never zero.
    const cost = (v: string | undefined) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? { value: -Number(v) } : null);
    const commission = cost(t.ibCommission);
    const tax = cost(t.taxes);
    const common = { date, account: accountLabel, symbol, quantity, price: num(t.tradePrice), amount: num(t.netCash), currency: (t.currency ?? "USD").toUpperCase(), ...(amountBase !== undefined ? { amountBase } : {}), ...(commission ? { commission: commission.value } : {}), ...(tax ? { tax: tax.value } : {}) };
    if (isOption(t)) {
      const closing = (t.openCloseIndicator ?? "").toUpperCase().includes("C");
      transactions.push({ ...common, kind: closing ? "option_close" : "option_open", option: optionOf(t) });
    } else if (isShare(t)) {
      const sell = (t.buySell ?? "").toUpperCase() === "SELL";
      // IBKR's FIFO realised P&L runs over every lot the account ever held, not only the statement's period.
      const realized = sell && t.fifoPnlRealized !== undefined && t.fifoPnlRealized !== "" && Number.isFinite(Number(t.fifoPnlRealized)) ? num(t.fifoPnlRealized) : undefined;
      transactions.push({ ...common, kind: sell ? "sell" : "buy", ...(realized !== undefined ? { realized } : {}) });
    }
  }

  // Assignments, exercises and expiries close the option at no cash; the share leg arrives as its own trade.
  for (const e of elements(xml, "OptionEAE")) {
    const kindText = (e.transactionType ?? "").toLowerCase();
    const kind = kindText.startsWith("assign") ? "assignment" : kindText.startsWith("exer") ? "exercise" : kindText.startsWith("expir") ? "expiry" : null;
    if (!kind || !isOption(e)) continue;
    const date = flexDate(e.date);
    const symbol = (e.symbol ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!date || !symbol) continue;
    transactions.push({ date, account: accountLabel, kind, symbol, quantity: num(e.quantity), price: null, amount: 0, currency: (e.currency ?? "USD").toUpperCase(), option: optionOf(e) });
  }

  transactions.push(...cashTransactionsOf(xml, accountLabel), ...transfersOf(xml, accountLabel));

  const cash = cashOf(xml);
  const currency = (elements(xml, "AccountInformation")[0]?.currency ?? "USD").toUpperCase();

  // The account's value by day, from whichever daily section the query carries: "Net Asset Value (NAV) in
  // Base" (NetAssetValue) or "Equity Summary by Report Date in Base"; one point per date, the last wins.
  const byDate = new Map<string, number>();
  for (const name of ["EquitySummaryByReportDateInBase", "NetAssetValue"]) {
    for (const e of elements(xml, name)) {
      const date = flexDate(e.reportDate);
      if (date && e.total !== undefined && Number.isFinite(Number(e.total))) byDate.set(date, num(e.total));
    }
  }
  const all = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
  // The days before the account held anything are not its history: a zero there has no return.
  const nav = all.slice(Math.max(0, all.findIndex((p) => p.value > 0)));
  return { asOf, account: accountLabel, currency, cash, holdings, transactions, nav: all.some((p) => p.value > 0) ? nav : all, unlisted: unlistedFlowOf(xml, transactions) };
}

/** Each account's last row wins, the accounts summed; a row without its ending cash is not read. */
function lastByAccount(rows: Record<string, string>[], key: (r: Record<string, string>) => string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const r of rows) if (r.endingCash !== undefined && Number.isFinite(Number(r.endingCash))) out.set(`${r.accountId ?? ""}|${key(r)}`, r);
  return out;
}

export function cashOf(xml: string): FlexCash | null {
  const rows = elements(xml, "CashReportCurrency");
  const summary = [...lastByAccount(rows.filter((r) => r.currency === "BASE_SUMMARY"), () => "").values()];
  if (summary.length) {
    const byCcy = new Map<string, number>();
    for (const r of lastByAccount(rows.filter((r) => r.currency && r.currency !== "BASE_SUMMARY"), (r) => r.currency.toUpperCase()).values()) {
      const ccy = r.currency.toUpperCase();
      byCcy.set(ccy, (byCcy.get(ccy) ?? 0) + num(r.endingCash));
    }
    const currencies = [...byCcy].filter(([, amount]) => amount !== 0).map(([currency, amount]) => ({ currency, amount }));
    return { base: summary.reduce((a, r) => a + num(r.endingCash), 0), currencies, from: "Cash Report" };
  }
  // Equity Summary by Report Date in Base: each account's cash on its last day.
  const last = new Map<string, Record<string, string>>();
  for (const e of elements(xml, "EquitySummaryByReportDateInBase")) {
    const date = flexDate(e.reportDate);
    if (!date || e.cash === undefined || !Number.isFinite(Number(e.cash))) continue;
    const k = e.accountId ?? "";
    const was = last.get(k);
    if (!was || flexDate(was.reportDate) <= date) last.set(k, e);
  }
  if (last.size) return { base: [...last.values()].reduce((a, e) => a + num(e.cash), 0), currencies: [], from: "Equity Summary" };
  return null;
}
