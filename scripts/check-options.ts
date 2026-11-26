/**
 * Holds lib/options.ts and the IBKR and SnapTrade adapters to known answers:
 * Black-Scholes against textbook values, implied volatility round trips,
 * strategy grouping, exposure, premium income, alerts, and the Flex parser on
 * a fictional statement with options. Run: npm run check:options
 */
import { readFileSync } from "node:fs";

import { cashTransactionsOf, parseFlexBook } from "../lib/adapters/ibkr-flex";
import { parseSnapTradePositions } from "../lib/adapters/snaptrade";
import { bookSchema } from "../lib/holdings";
import {
  blackScholes,
  contractView,
  exposureByUnderlying,
  groupStrategies,
  impliedVol,
  optionAlerts,
  parseOcc,
  portfolioGreeks,
  premiumByMonth,
  realisedOptions,
} from "../lib/options";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const near = (a: number | null | undefined, b: number, tol: number) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

// Hull, Options, Futures and Other Derivatives, example 15.6: S=42, K=40, r=10%, vol=20%, T=0.5 → call 4.76, put 0.81.
const c = blackScholes({ spot: 42, strike: 40, years: 0.5, vol: 0.2, rate: 0.1, right: "C" });
const p = blackScholes({ spot: 42, strike: 40, years: 0.5, vol: 0.2, rate: 0.1, right: "P" });
check("BS call price (Hull 15.6)", near(c.price, 4.76, 0.01), c.price.toFixed(4));
check("BS put price (Hull 15.6)", near(p.price, 0.81, 0.01), p.price.toFixed(4));
check("BS call delta", near(c.delta, 0.7791, 0.001), c.delta.toFixed(4));
check("put-call parity", near(c.price - p.price, 42 - 40 * Math.exp(-0.05), 1e-6));
const iv = impliedVol(c.price, { spot: 42, strike: 40, years: 0.5, rate: 0.1, right: "C" });
check("implied vol round trip", near(iv, 0.2, 1e-4), String(iv));
check("implied vol is null below intrinsic", impliedVol(1, { spot: 42, strike: 40, years: 0.5, rate: 0.1, right: "C" }) === null);
check("OCC symbol parsed", JSON.stringify(parseOcc("AAPL  261120C00245000")) === JSON.stringify({ underlying: "AAPL", expiry: "2026-11-20", right: "C", strike: 245 }));

// Dani's fictional book.
const book = bookSchema.parse(JSON.parse(readFileSync("data/samples/dani.book.json", "utf8")));
const market = { today: "2026-10-11", rate: 0.04, spots: { AAPL: 230, MSFT: 420, NVDA: 140, SPY: 570, TSLA: 250 } };
const strategies = groupStrategies(book.holdings, { IBKR: 62000, Schwab: 30000 });
const kinds = strategies.map((s) => `${s.account}:${s.underlying}:${s.kind}`).sort();
check(
  "strategies grouped",
  JSON.stringify(kinds) ===
    JSON.stringify(["IBKR:AAPL:covered_call", "IBKR:MSFT:cash_secured_put", "IBKR:NVDA:bull_call_spread", "IBKR:SPY:long_put", "Schwab:TSLA:strangle"]),
  kinds.join(", "),
);
const spread = strategies.find((s) => s.kind === "bull_call_spread")!;
// Debit per share = (3800 - 1250) / 500 = 5.10; width 20 → max loss 2550, max profit 7450, breakeven 145.10.
check("bull call spread max loss", near(spread.maxLoss, 2550, 0.01), String(spread.maxLoss));
check("bull call spread max profit", near(spread.maxProfit, 7450, 0.01), String(spread.maxProfit));
check("bull call spread breakeven", spread.breakevens[0] === 145.1, String(spread.breakevens));
const csp = strategies.find((s) => s.kind === "cash_secured_put")!;
check("cash-secured put credit and breakeven", near(csp.netPremium, 6.1, 1e-6) && csp.breakevens[0] === 408.9, `${csp.netPremium} ${csp.breakevens}`);
const strangle = strategies.find((s) => s.kind === "strangle")!;
check("short strangle breakevens", strangle.breakevens.join(",") === "184.5,315.5", strangle.breakevens.join(","));
const unsecured = groupStrategies(book.holdings, { IBKR: 1000, Schwab: 30000 }).find((s) => s.underlying === "MSFT")!;
check("short put without the cash is not called cash-secured", unsecured.kind === "naked_put");

const views = book.holdings.map((h) => contractView(h, market)).filter((v) => v !== null);
check("every contract has computed Greeks", views.every((v) => v.greeks !== null), views.filter((v) => !v.greeks).map((v) => v.holding.symbol).join(", "));
const aapl = exposureByUnderlying(book.holdings, market).find((e) => e.underlying === "AAPL")!;
check("AAPL exposure counts both brokers' shares", aapl.shares === 350);
check("short calls reduce AAPL delta", aapl.optionDeltaShares < 0 && aapl.optionDeltaShares > -200, aapl.optionDeltaShares.toFixed(1));
const g = portfolioGreeks(views);
check("short premium book has positive theta", g.theta > 0, g.theta.toFixed(2));
const premium = premiumByMonth(book.transactions);
check("premium by month", premium.map((r) => `${r.month}:${r.collected.toFixed(2)}`).join(" ") === "2026-08:548.95 2026-09:2066.35 2026-10:1548.60", premium.map((r) => `${r.month}:${r.collected.toFixed(2)}`).join(" "));
const realised = realisedOptions(book.transactions);
check("realised options P&L", realised.map((r) => `${r.underlying}:${r.realised.toFixed(2)}`).join(" ") === "MSFT:548.95 AAPL:-262.60", realised.map((r) => `${r.underlying}:${r.realised.toFixed(2)}`).join(" "));
const alerts = optionAlerts(views);
check("MSFT short put expiring in 5 days is flagged", alerts.some((a) => a.kind === "expires_in_week" && a.text.includes("MSFT")));
const itm = optionAlerts(views.map((v) => (v.holding.symbol.startsWith("MSFT") ? { ...v, moneyness: "ITM" as const } : v)));
check("short option in the money is flagged", itm.some((a) => a.kind === "short_itm"));

// IBKR Flex with options.
const flex = parseFlexBook(readFileSync("data/samples/flex_options_sample.xml", "utf8"), "IBKR");
check("Flex keeps stocks, ETFs and options, drops lot rows", flex.holdings.length === 4 && flex.holdings.filter((h) => h.assetClass === "option").length === 2, String(flex.holdings.length));
check("Flex ETF classified", flex.holdings.find((h) => h.symbol === "QQQ")?.assetClass === "etf");
const fo = flex.holdings.find((h) => h.symbol.startsWith("MSFT"))!;
check("Flex option fields", fo.option?.right === "P" && fo.option.strike === 415 && fo.option.expiry === "2026-10-16" && fo.quantity === -1);
check("Flex option opens, closes and expiries", flex.transactions.map((t) => t.kind).join(",") === "option_open,buy,option_close,expiry", flex.transactions.map((t) => t.kind).join(","));
check("Flex cash", flex.cash?.base === 62000 && flex.cash.from === "Cash Report");
const cashXml = `<FlexQueryResponse><FlexStatements><FlexStatement toDate="20261009"><OpenPositions></OpenPositions><CashTransactions>
<CashTransaction levelOfDetail="DETAIL" type="Dividends" symbol="MA" amount="10.5" currency="USD" fxRateToBase="1" dateTime="20260809;202000" />
<CashTransaction levelOfDetail="DETAIL" type="Withholding Tax" symbol="MA" amount="-1.58" currency="USD" fxRateToBase="1" dateTime="20260809;202000" />
<CashTransaction levelOfDetail="DETAIL" type="Payment In Lieu Of Dividends" symbol="ASML" amount="20" currency="EUR" fxRateToBase="1.1" dateTime="2026-08-06" />
<CashTransaction levelOfDetail="DETAIL" type="Broker Interest Received" symbol="" amount="3" currency="USD" dateTime="20260903" />
<CashTransaction levelOfDetail="DETAIL" type="Deposits/Withdrawals" symbol="" amount="5000" currency="USD" dateTime="20260903" />
<CashTransaction levelOfDetail="DETAIL" type="Deposits/Withdrawals" symbol="" amount="-1200" currency="USD" dateTime="20260920" />
<CashTransaction levelOfDetail="SUMMARY" type="Dividends" symbol="MA" amount="10.5" currency="USD" dateTime="20260809" />
</CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>`;
const cashTx = parseFlexBook(cashXml, "IBKR").transactions;
check("Flex Cash Transactions: dividends, tax withheld as a negative dividend, a payment in lieu, interest, a deposit and a withdrawal by their sign; summary rows left out", cashTx.map((t) => `${t.kind}:${t.symbol}:${t.amount}`).join(",") === "dividend:MA:10.5,dividend:MA:-1.58,dividend:ASML:20,interest::3,deposit::5000,withdrawal::-1200" && Math.abs((cashTx[2].amountBase ?? 0) - 22) < 1e-9 && cashTx[0].date === "2026-08-09" && cashTx[4].date === "2026-09-03", cashTx.map((t) => `${t.kind}:${t.symbol}:${t.amount}`).join(","));
let threw = false;
try {
  parseFlexBook("<FlexQueryResponse><FlexStatements><FlexStatement toDate=\"20261009\"></FlexStatement></FlexStatements></FlexQueryResponse>", "IBKR");
} catch {
  threw = true;
}
check("a statement without positions throws, never reads as empty", threw);
const summaryOnly = cashTransactionsOf(`<CashTransaction levelOfDetail="DETAIL" type="Dividends" symbol="MA" amount="10.5" currency="USD" dateTime="20260809" />
<CashTransaction levelOfDetail="SUMMARY" type="Dividends" symbol="MA" amount="10.5" currency="USD" dateTime="20260809" />
<CashTransaction levelOfDetail="SUMMARY" type="Deposits/Withdrawals" symbol="" amount="2500" currency="USD" dateTime="20260701" />`, "IBKR");
check("Flex Cash Transactions: detail wins type by type, so a deposit given only in summary is still read", summaryOnly.map((t) => `${t.kind}:${t.amount}`).join(",") === "dividend:10.5,deposit:2500", summaryOnly.map((t) => `${t.kind}:${t.amount}`).join(","));

// SnapTrade all-positions shape.
const snap = parseSnapTradePositions(
  {
    results: [
      { instrument: { kind: "stock", id: "s1", symbol: "AAPL", description: "Apple", currency: "USD" }, units: 50, price: 230, average_purchase_price: 196, currency: "USD" },
      {
        instrument: { kind: "option", id: "o1", symbol: "TSLA  261120P00200000", option_type: "PUT", strike_price: "200", expiration_date: "2026-11-20T00:00:00.000Z", multiplier: "100", underlying: { symbol: "TSLA" } },
        units: -1,
        price: 3.9,
        average_purchase_price: 700,
        currency: "USD",
      },
    ],
  },
  "Schwab",
  "2026-10-09",
);
check("SnapTrade stock", snap[0].assetClass === "equity" && snap[0].value === 11500);
check("SnapTrade option", snap[1].option?.right === "P" && snap[1].value === -390 && snap[1].costBasis === -700 && snap[1].option.expiry === "2026-11-20");
threw = false;
try {
  parseSnapTradePositions({ error: "x" }, "Schwab", "2026-10-09");
} catch {
  threw = true;
}
check("an unexpected SnapTrade reply throws", threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
