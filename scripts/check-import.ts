/**
 * The statement import (lib/import-book.ts): the Flex sample becomes a book
 * the schema accepts, a book file round-trips, and every refusal is a
 * sentence. Run: npm run check:import
 */
import { flexHistoryRuns, flexHistorySteps } from "../components/setup/flex-guide";
import { readFileSync } from "node:fs";

import { createHmac } from "node:crypto";

import { brokerCopySchema, brokersFileSchema, canonicalJson, currenciesOf, describeCopy, EMPTY_BROKERS, etoroInstrumentIds, parseEtoroInstruments, parseEtoroPortfolio, parseSnapTradeAccounts, snapTradeAccountHoldings, snapTradeSigContent, withBrokers, withCopy, type BrokerCopy } from "../lib/brokers";
import { connectionsSchema, describeSync, etoroCredentialsProblem, flexCredentialsProblem, flexEveningDue, mergeSync, snapTradeCredentialsProblem, summarizeFlex, summarizeKeys, syncDue, type SyncStep } from "../lib/connections";
import { describeFlexError, parseFlexResponse } from "../lib/flex";
import { bookSchema, type Book } from "../lib/holdings";
import { EMPTY_FILINGS, filingsStale, type FilingsFile } from "../lib/filings";
import { bookFromJson, describeBook, importBook, sniff } from "../lib/import-book";
import { SyncError } from "../lib/sync-error";
import { fillsLeftOut, fillsOf } from "../lib/trades";
import { setZoneSource } from "../lib/time";

// The checks read days and clocks in one zone, as a person in Athens would see them.
setZoneSource(() => "Europe/Athens");

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}
function refuses(name: string, fn: () => unknown, part: string) {
  try {
    fn();
    check(name, false, "did not throw");
  } catch (e) {
    check(name, e instanceof SyncError && e.message.includes(part), e instanceof Error ? e.message : String(e));
  }
}

const xml = readFileSync("data/samples/flex_options_sample.xml", "utf8");
check("a Flex statement is recognised", sniff(xml) === "flex");
check("a book file is recognised", sniff('  {"asOf": "2026-01-01"}') === "book");
check("a BOM does not hide the kind", sniff("﻿<FlexQueryResponse/>") === "flex");
check("other text is neither", sniff("Date,Symbol\n2026-01-01,AAPL") === null);

const flex = importBook(xml, "IBKR");
check("the Flex sample becomes a book", flex.kind === "flex" && flex.book.holdings.length > 0);
check("the book passes its schema", bookSchema.safeParse(flex.book).success);
check("the base currency has rate 1", flex.book.fx.rates[flex.book.fx.base] === 1);
check("every holding's currency has a rate", flex.book.holdings.every((h) => h.currency in flex.book.fx.rates));
check("the source names the statement", flex.book.fx.source.includes("Flex"));
check("the description is a sentence", /holdings? in \d+ account/.test(describeBook(flex.book)), describeBook(flex.book));
// Hamza, 6 Nov 2026: a sale left $2.28k in cash and the app showed none; the statement's cash is a holding.
const cashH = flex.book.holdings.filter((h) => h.assetClass === "cash");
check("the Cash Report's ending cash is a holding in the base currency", cashH.length === 1 && cashH[0].value === 62000 && cashH[0].currency === flex.book.fx.base && cashH[0].source === "ibkr", JSON.stringify(cashH));
const perCcy = importBook(xml.replace('<CashReportCurrency currency="BASE_SUMMARY" endingCash="62000" />', '<CashReportCurrency accountId="U1" currency="BASE_SUMMARY" endingCash="2280.5" /><CashReportCurrency accountId="U1" currency="USD" endingCash="2280.5" /><CashReportCurrency accountId="U1" currency="EUR" endingCash="0" />'), "IBKR");
const perCash = perCcy.book.holdings.filter((h) => h.assetClass === "cash");
check("each currency the Cash Report holds is its own cash line, a zero left out", perCash.length === 1 && perCash[0].symbol === "USD" && perCash[0].value === 2280.5, JSON.stringify(perCash));
const twoAcc = importBook(xml.replace('<CashReportCurrency currency="BASE_SUMMARY" endingCash="62000" />', '<CashReportCurrency accountId="U1" currency="BASE_SUMMARY" endingCash="100" /><CashReportCurrency accountId="U2" currency="BASE_SUMMARY" endingCash="50" />'), "IBKR");
check("two accounts' cash add up", twoAcc.book.holdings.filter((h) => h.assetClass === "cash").reduce((a, h) => a + h.value, 0) === 150);
const noReport = xml.replace('<CashReportCurrency currency="BASE_SUMMARY" endingCash="62000" />', "");
const fromEquity = importBook(noReport.replace("</FlexStatement>", '<EquitySummaryInBase><EquitySummaryByReportDateInBase accountId="U1" reportDate="20261105" cash="10" total="100" /><EquitySummaryByReportDateInBase accountId="U1" reportDate="20261106" cash="2280" total="2400" /></EquitySummaryInBase></FlexStatement>'), "IBKR");
check("without a Cash Report the Equity Summary's last day gives the cash, said so", fromEquity.book.holdings.some((h) => h.assetClass === "cash" && h.value === 2280) && fromEquity.notes.some((n) => /Equity Summary/.test(n)));
const noCash = importBook(noReport, "IBKR");
check("a statement with no cash says to tick the Cash Report, never a zero holding", !noCash.book.holdings.some((h) => h.assetClass === "cash") && noCash.notes.some((n) => /Cash Report/.test(n)));

check("without a daily section the notes ask for Net Asset Value (NAV) in Base", flex.notes.some((n) => /Net Asset Value \(NAV\) in Base/.test(n)));
const navXml = xml.replace("</FlexStatement>", '<NetAssetValues><NetAssetValue accountId="U1" reportDate="2026-10-08" cash="100" stock="900" total="1000" /><NetAssetValue accountId="U1" reportDate="2026-10-09" total="1010.5" /><NetAssetValue accountId="U1" reportDate="2026-10-07" total="990" /><NetAssetValue accountId="U1" reportDate="2026-10-09" total="abc" /></NetAssetValues><ChangeInNAV startingValue="990" endingValue="1010.5" /></FlexStatement>');
const withNav = importBook(navXml, "IBKR");
check("the Net Asset Value (NAV) in Base section becomes the account's value by day, oldest first, bad rows skipped", withNav.kind === "flex" && withNav.book.series?.nav.map((p) => `${p.date}:${p.value}`).join(",") === "2026-10-07:990,2026-10-08:1000,2026-10-09:1010.5", JSON.stringify(withNav.book.series?.nav));
check("with the series the note about it goes", !withNav.notes.some((n) => /Net Asset Value/.test(n)));

const asJson = JSON.stringify(flex.book);
const back = bookFromJson(asJson);
check("a book file round-trips", back.kind === "book" && back.book.holdings.length === flex.book.holdings.length && back.book.asOf === flex.book.asOf);
check("importBook takes the JSON too", importBook(asJson).kind === "book");

refuses("an empty statement is refused", () => importBook('<FlexQueryResponse><FlexStatements><FlexStatement toDate="20261009"><OpenPositions></OpenPositions></FlexStatement></FlexStatements></FlexQueryResponse>'), "no open positions");
refuses("a statement without the positions section is refused", () => importBook("<FlexQueryResponse><FlexStatements><FlexStatement toDate=\"20261009\"></FlexStatement></FlexStatements></FlexQueryResponse>"), "Open Positions");
refuses("a non-Flex XML is refused", () => importBook("<html><body>statement</body></html>"), "Upload an IBKR Flex statement");
refuses("a CSV is refused with where it belongs", () => importBook("Date,Symbol\n2026-01-01,AAPL"), "Statements screen");
refuses("broken JSON is refused", () => importBook("{not json"), "not valid JSON");
refuses("JSON of another shape is refused", () => importBook('{"positions": []}'), "not an Invariant book");
refuses("a book with no holdings is refused", () => importBook(JSON.stringify({ ...flex.book, holdings: [], lookThrough: [], transactions: [] })), "no holdings");

const foreign = xml.replace(/(<OpenPosition [^>]*?)currency="USD"/, '$1currency="EUR"');
refuses("a currency without a rate is refused", () => importBook(foreign), "no exchange rate");
const withRate = xml.replace(/(<OpenPosition [^>]*?)currency="USD"/, '$1currency="EUR" fxRateToBase="1.08"');
const rated = importBook(withRate);
check("a rate in the statement is used", rated.book.fx.rates.EUR === 1.08);

// A trade in a currency no open position carries (a market left since): never a refusal, never a crash.
const eurTrade = xml.replace(/(<Trade [^>]*assetCategory="STK"[^>]*?)currency="USD"/, '$1currency="EUR"');
const orphan = importBook(eurTrade);
check("a trade without a rate is imported", orphan.kind === "flex" && orphan.book.transactions.some((t) => t.currency === "EUR"));
check("and noted as left out, naming the columns", orphan.notes.some((n) => /1 trades in EUR left out/.test(n) && /FX Rate to Base/.test(n) && /Net Cash in Base/.test(n)), orphan.notes.join(" | "));
check("the Trades screen's fills skip it rather than throw", fillsOf(orphan.book).every((f) => f.currency !== "EUR") && fillsLeftOut(orphan.book).some((g) => g.currency === "EUR" && g.count === 1));
check("the to-do list still derives", Array.isArray(fillsOf(orphan.book)));
const eurTradeRated = xml.replace(/(<Trade [^>]*assetCategory="STK"[^>]*?)currency="USD"/, '$1currency="EUR" fxRateToBase="1.1"');
const tradeRated = importBook(eurTradeRated);
check("a trade's own FX Rate to Base fills the table", tradeRated.book.fx.rates.EUR === 1.1 && tradeRated.notes.every((n) => !/left out/.test(n)));
const eurTradeBase = xml.replace(/(<Trade [^>]*assetCategory="STK"[^>]*?)currency="USD"/, '$1currency="EUR" netCashInBase="-2509.1"');
const tradeBase = importBook(eurTradeBase);
const eurFill = fillsOf(tradeBase.book).find((f) => f.currency === "EUR");
check("Net Cash in Base prices the fill without a rate", eurFill !== undefined && Math.abs(eurFill.amount - 2509.1) < 1e-6 && tradeBase.notes.every((n) => !/left out/.test(n)), eurFill ? String(eurFill.amount) : "no fill");

// IBKR's FIFO realised P&L on a sale is kept, so a sale of shares bought before the statement still counts.
const realisedSell = xml.replace(/(<Trade [^>]*assetCategory="STK"[^>]*?)buySell="BUY"/, '$1buySell="SELL" fifoPnlRealized="312.5"');
const sold = importBook(realisedSell).book.transactions.find((t) => t.kind === "sell");
check("a sale keeps the broker's realised P&L", sold?.realized === 312.5, JSON.stringify(sold));
check("a buy carries none", importBook(xml).book.transactions.every((t) => t.realized === undefined));

// The morning refresh (lib/connections.ts, lib/flex.ts): the token is checked by shape and never echoed,
// IBKR's replies become sentences, and one source's failure never hides the other's last line.
const TOKEN = "123456789012345678901234";
check("a token and query id of the right shape are kept", flexCredentialsProblem(TOKEN, "987654") === null);
check("a token with spaces or symbols is refused", (flexCredentialsProblem("abc 123!", "987654") ?? "").includes("letters and digits"));
check("a query id that is not a number is refused", (flexCredentialsProblem(TOKEN, "Invariant") ?? "").includes("number"));
check("a refusal never echoes the token", !(flexCredentialsProblem(`${TOKEN}!`, "1") ?? "").includes(TOKEN));
const kept = connectionsSchema.parse({ version: 1, ibkrFlex: { token: TOKEN, queryId: "987654", savedAt: "2026-10-13T08:00:00.000Z" } });
check("the summary for the screens carries no token", !JSON.stringify(summarizeFlex(kept)).includes(TOKEN) && summarizeFlex(kept)?.queryId === "987654");
check("no connection summarises as none, and a file kept before the brokers still reads", summarizeFlex(connectionsSchema.parse({ version: 1, ibkrFlex: null })) === null);
check("a reference code reads", JSON.stringify(parseFlexResponse("<FlexStatementResponse><Status>Success</Status><ReferenceCode>1234567890</ReferenceCode></FlexStatementResponse>")) === JSON.stringify({ status: "success", referenceCode: "1234567890" }));
const generating = parseFlexResponse("<FlexStatementResponse><Status>Warn</Status><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress.</ErrorMessage></FlexStatementResponse>");
check("a statement still being made is a warning", generating?.status === "warn" && generating.code === "1019");
check("a statement is not a Flex reply", parseFlexResponse(xml) === null);
check("an expired token says to keep a new one on Setup", describeFlexError("1015", "").includes("Setup"));
check("a refused address says to leave the IP box empty", describeFlexError("1013", "").includes("IP address box empty"));
check("no sentence names a deployment variable", ["1003", "1012", "1013", "1014", "1015", "1018", "1019", "1020", "9"].every((c) => !/IBKR_FLEX|Vercel/.test(describeFlexError(c, "x"))));
const at = "2026-10-13T06:00:05.000Z";
const morning = new Date("2026-10-13T06:00:00.000Z");
const okFlex: SyncStep = { source: "ibkr_flex", outcome: "ok", sentence: "Fetched: 9 holdings.", at };
const badFilings: SyncStep = { source: "filings", outcome: "failed", sentence: "The SEC could not be reached. The last filings read stay.", at };
const first = mergeSync(null, [okFlex, badFilings], morning, "morning");
check("a morning refresh is dated to its UTC day", first.day === "2026-10-13" && first.how === "morning");
check("the morning refresh is not due twice in a day", !syncDue(first, new Date("2026-10-13T18:00:00.000Z")) && syncDue(first, new Date("2026-10-14T06:00:00.000Z")));
const byHand = mergeSync(first, [{ source: "filings", outcome: "ok", sentence: "Read for 9 holdings.", at }], new Date("2026-10-13T09:00:00.000Z"), "by hand");
check("a source not tried keeps its last line", byHand.steps.find((s) => s.source === "ibkr_flex")?.sentence === okFlex.sentence && byHand.steps.find((s) => s.source === "filings")?.outcome === "ok");
check("a refresh by hand leaves the morning one due", syncDue(byHand, new Date("2026-10-13T10:00:00.000Z")));
const evening = mergeSync(first, [{ source: "ibkr_flex", outcome: "ok", sentence: "Fetched after the close: 9 holdings.", at: "2026-10-13T22:40:00.000Z" }], new Date("2026-10-13T22:40:00.000Z"), "evening");
check("the evening Flex fetch replaces the Flex line, keeps the others and leaves the next morning due", evening.steps.find((s) => s.source === "ibkr_flex")?.sentence.startsWith("Fetched after the close") === true && evening.steps.find((s) => s.source === "filings")?.outcome === "failed" && evening.day === "2026-10-13" && syncDue(evening, new Date("2026-10-14T06:00:00.000Z")));
check("the evening fetch is due only with a token and a book older than the session that closed", flexEveningDue(kept, "2026-10-15", "2026-10-16") && flexEveningDue(kept, null, "2026-10-16") && !flexEveningDue(kept, "2026-10-16", "2026-10-16") && !flexEveningDue(kept, "2026-10-15", null) && !flexEveningDue(connectionsSchema.parse({ version: 1, ibkrFlex: null }), "2026-10-15", "2026-10-16") && !flexEveningDue(null, "2026-10-15", "2026-10-16"));
check("nothing on file is due", syncDue(null, morning));
const lines = describeSync(first);
check("each source is one line for Setup, in order", lines.length === 2 && lines[0].label === "IBKR Flex" && lines[1].label === "SEC filings" && lines[0].line.startsWith("13 Oct, 09:00."));

// The brokers through a person's own keys (lib/brokers.ts): SnapTrade's signature matches its own Python sample
// (docs.snaptrade.com, Request Signatures), its replies and eToro's become holdings, and a copy is laid on the book.
const Q = "clientId=PERS-TEST&timestamp=1760400000";
const sign = (path: string, body: unknown) => createHmac("sha256", "test-consumer-key").update(snapTradeSigContent(path, Q, body)).digest("base64");
check("a GET is signed as SnapTrade's sample signs it", sign("/api/v1/accounts", null) === "UTQ1CffhnlzR6Rv8FRGu/fSkaWt4UyAFLGYlzNkxEr8=", sign("/api/v1/accounts", null));
check("an empty body signs as none", sign("/api/v1/accounts", {}) === sign("/api/v1/accounts", null));
const loginBody = { immediateRedirect: true, connectionType: "read", customRedirect: "https://example.org/setup?connected=snaptrade" };
check("a body is signed with its keys in order", sign("/api/v1/snapTrade/login", loginBody) === "O1Dn5uaoWMYyLWPocxkBmU9p/5UQG+yvVufLfkbVcB8=", snapTradeSigContent("/api/v1/snapTrade/login", Q, loginBody));
check("the body sent is the body signed", canonicalJson(loginBody) === '{"connectionType":"read","customRedirect":"https://example.org/setup?connected=snaptrade","immediateRedirect":true}');

const accts = parseSnapTradeAccounts([
  { id: "a-1", name: "TFSA", number: "HQ12341111", institution_name: "Wealthsimple" },
  { id: "a-2", name: "Individual", number: "5555-2222", institution_name: "Schwab" },
  { id: "a-3", name: "Individual", number: "5555-3333", institution_name: "Schwab" },
  { id: "a-4", name: "Wealthsimple RRSP", number: null, institution_name: "Wealthsimple" },
]);
check("an account is named by its institution and its own name", accts[0].label === "Wealthsimple TFSA" && accts[3].label === "Wealthsimple RRSP", JSON.stringify(accts));
check("two accounts that would read the same carry their last four digits", accts[1].label === "Schwab Individual ···2222" && accts[2].label === "Schwab Individual ···3333", JSON.stringify(accts));
let threw = false;
try {
  parseSnapTradeAccounts({ error: "x" });
} catch {
  threw = true;
}
check("an accounts reply that is not a list throws, never reads as no accounts", threw);
const stPositions = {
  results: [
    { instrument: { kind: "stock", id: "i-1", symbol: "VFV.TO", description: "Vanguard S&P 500", currency: "CAD" }, units: "10", price: "150.5", cost_basis: "120", currency: "CAD" },
    { instrument: { kind: "option", id: "i-2", symbol: "AAPL 261218C00250000", option_type: "CALL", strike_price: "250", expiration_date: "2026-12-18", multiplier: "100", underlying: { symbol: "AAPL" } }, units: 2, price: 3.1, cost_basis: 2.5, currency: "USD" },
    { instrument: { kind: "etf", id: "i-3", symbol: "ZERO" }, units: 0, price: 1, currency: "CAD" },
  ],
};
const stBalances = [{ currency: { code: "CAD" }, cash: 812.4 }, { currency: { code: "USD" }, cash: 0 }];
const stHeld = snapTradeAccountHoldings(accts[0], stPositions, stBalances, "2026-10-14");
const vfv = stHeld.find((h) => h.symbol === "VFV.TO");
const call = stHeld.find((h) => h.assetClass === "option");
check("a SnapTrade position becomes a holding at its price, its cost per share", vfv?.value === 1505 && vfv.costBasis === 1200 && vfv.account === "Wealthsimple TFSA" && vfv.source === "snaptrade", JSON.stringify(vfv));
check("an option's cost per share is times its multiplier", call?.costBasis === 500 && call.value === 620 && call.option?.underlying === "AAPL", JSON.stringify(call));
check("a closed position and an empty currency are left out", !stHeld.some((h) => h.symbol === "ZERO") && stHeld.filter((h) => h.assetClass === "cash").length === 1);
check("cash is a holding per currency", stHeld.find((h) => h.assetClass === "cash")?.value === 812.4);
check("holdings are keyed by the account's SnapTrade id, so a renamed account is the same", stHeld.every((h) => h.id.startsWith("snaptrade:a-1:")));

const etoroReply = {
  clientPortfolio: {
    accountCurrencyId: 1,
    credit: 250.5,
    positions: [
      { positionID: 1, instrumentID: 1001, isBuy: true, leverage: 1, units: 2, amount: 300, unrealizedPnL: { pnL: 40 } },
      { positionId: 2, instrumentId: 1001, isBuy: true, leverage: 1, units: 1, amount: 160, unrealizedPnL: { pnL: 10 } },
      { positionID: 3, instrumentID: 2002, isBuy: false, leverage: 2, units: 5, amount: 100, unrealizedPnL: { pnL: -20 } },
      { positionID: 4, instrumentID: 9999, isBuy: true, leverage: 1, units: 1, amount: 10, unrealizedPnL: { pnL: 0 } },
    ],
    mirrors: [{ mirrorID: 77, parentUsername: "someone", availableAmount: 40, positions: [{ positionID: 5, instrumentID: 3003, isBuy: true, leverage: 1, units: 4, amount: 200, unrealizedPnL: { pnL: 8 } }] }],
  },
};
check("eToro's instruments are read from its own positions and the copies'", JSON.stringify(etoroInstrumentIds(etoroReply).sort()) === JSON.stringify([1001, 2002, 3003, 9999]));
const inst = parseEtoroInstruments({ instrumentDisplayDatas: [{ instrumentID: 1001, symbolFull: "aapl", instrumentDisplayName: "Apple", instrumentTypeID: 5 }, { instrumentID: 2002, symbolFull: "BTC", instrumentDisplayName: "Bitcoin", instrumentTypeID: 10 }, { instrumentID: 3003, symbolFull: "SPY", instrumentDisplayName: "SPDR S&P 500", instrumentTypeID: 6 }] });
const et = parseEtoroPortfolio(etoroReply, inst, "2026-10-14");
const aapl = et.holdings.find((h) => h.symbol === "AAPL");
check("positions of one instrument and side are summed, at what they are worth now", aapl?.quantity === 3 && aapl.value === 510 && aapl.costBasis === 460 && aapl.assetClass === "equity", JSON.stringify(aapl));
check("either casing of eToro's field names reads", aapl?.quantity === 3);
const btc = et.holdings.find((h) => h.symbol === "BTC");
check("a short or leveraged position counts its equity and says it is a CFD", btc?.value === 80 && btc.quantity === -5 && btc.assetClass === "other" && /short, x2, CFD/.test(btc.name), JSON.stringify(btc));
check("cash and each copy's cash are holdings", et.holdings.filter((h) => h.assetClass === "cash").map((h) => h.value).join(",") === "250.5,40");
check("a copied trader is an account of its own", et.accounts.join("|") === "eToro|eToro copying someone" && et.holdings.find((h) => h.symbol === "SPY")?.account === "eToro copying someone");
check("an instrument that cannot be named is left out and said so", !et.holdings.some((h) => h.symbol.includes("9999")) && et.notes.length === 1);
threw = false;
try {
  parseEtoroPortfolio({ clientPortfolio: { accountCurrencyId: 2, positions: [] } }, inst, "2026-10-14");
} catch (e) {
  threw = e instanceof Error && e.message.includes("US dollars");
}
check("an account in another currency is refused with a sentence, never misread", threw);
threw = false;
try {
  parseEtoroPortfolio({ clientPortfolio: {} }, inst, "2026-10-14");
} catch {
  threw = true;
}
check("a portfolio with no positions list throws, never reads as empty", threw);

const copyOf = (holdings: BrokerCopy["holdings"], rates: Record<string, number>): BrokerCopy => brokerCopySchema.parse({ fetchedAt: "2026-10-14T06:00:00.000Z", asOf: "2026-10-14", accounts: [...new Set(holdings.map((h) => h.account))], holdings, base: "USD", rates, notes: [] });
const stCopy = copyOf(stHeld, { CAD: 0.72 });
const usdBook = bookSchema.parse({ ...flex.book, fx: { ...flex.book.fx, base: "USD", rates: { USD: 1 } } });
const laid = withBrokers(usdBook, withCopy(EMPTY_BROKERS, "snaptrade", stCopy), "USD", "2026-10-14");
check("a broker's copy is laid beside the book's own holdings", laid.book!.holdings.length === usdBook.holdings.length + stHeld.length && laid.book!.holdings.some((h) => h.source === "ibkr"));
check("the copy's rates fill the ones the book has not got", laid.book!.fx.rates.CAD === 0.72 && laid.notes.length === 0);
const noRate = withBrokers(usdBook, withCopy(EMPTY_BROKERS, "snaptrade", copyOf(stHeld, {})), "USD", "2026-10-14");
check("a holding in a currency nothing converts is left out and said so", noRate.book!.holdings.every((h) => h.currency !== "CAD") && /CAD left out/.test(noRate.notes[0] ?? ""), noRate.notes.join(" "));
const alone = withBrokers(null, withCopy(EMPTY_BROKERS, "etoro", copyOf(et.holdings, {})), "USD", "2026-10-14");
check("with no book, a broker's copy is the book", alone.book?.holdings.length === et.holdings.length && alone.book.fx.base === "USD" && bookSchema.safeParse(alone.book).success);
const stale = { ...usdBook, holdings: [...usdBook.holdings, { ...stHeld[0], id: "snaptrade:old:x", symbol: "OLD" }] };
check("a fresh copy takes the place of the same source's older holdings", !withBrokers(stale, withCopy(EMPTY_BROKERS, "snaptrade", stCopy), "USD", "2026-10-14").book!.holdings.some((h) => h.symbol === "OLD"));
check("no copies leave the book as it was", withBrokers(usdBook, EMPTY_BROKERS, "USD", "2026-10-14").book === usdBook);
const both = withCopy(withCopy(EMPTY_BROKERS, "snaptrade", stCopy), "etoro", copyOf(et.holdings, {}));
check("one broker's fetch leaves the other's copy", both.snaptrade === stCopy && both.etoro !== null && brokersFileSchema.safeParse(both).success);
check("a file kept before eToro still reads", brokersFileSchema.parse({ version: 1, snaptrade: null }).etoro === null);
check("only foreign currencies are converted", currenciesOf(stHeld, "USD").join(",") === "CAD" && currenciesOf(stHeld, "CAD").join(",") === "USD");
check("a copy is one line for Setup", /^1 account, 2 positions, as of 14 Oct\.$/.test(describeCopy(stCopy)), describeCopy(stCopy));

const CK = "ck_9f8e7d6c5b4a39281706";
check("a SnapTrade key of the right shape is kept", snapTradeCredentialsProblem("PERS-ABC123", CK) === null);
check("a key with a space is refused, without echoing it", (snapTradeCredentialsProblem("PERS-ABC123", `${CK} x`) ?? "").length > 0 && !(snapTradeCredentialsProblem("PERS-ABC123", `${CK} x`) ?? "").includes(CK));
check("eToro's two keys must differ", (etoroCredentialsProblem(CK, CK) ?? "").includes("different"));
check("eToro keys of the right shape are kept", etoroCredentialsProblem("pub_1234567890abcdef", "usr_eyJhbGciOiJIUzI1NiJ9.abc") === null);
const keptKeys = connectionsSchema.parse({ version: 1, ibkrFlex: null, snaptrade: { clientId: "PERS-ABC123", consumerKey: CK, savedAt: "2026-10-14T08:00:00.000Z" }, etoro: { apiKey: "pub_1234567890abcdef", userKey: "usr_secret_value_1", savedAt: "2026-10-14T08:00:00.000Z" } });
const keySummary = JSON.stringify(summarizeKeys(keptKeys));
check("the summary for the screens carries no key", !keySummary.includes(CK) && !keySummary.includes("usr_secret") && !keySummary.includes("PERS-ABC123") && summarizeKeys(keptKeys).etoro?.savedAt === "2026-10-14T08:00:00.000Z");

{
  // Opening the app reads the filings again when the morning refresh did not.
  const now = new Date("2026-10-15T10:00:00.000Z");
  // Only each holding's symbol and asset class are read.
  const book = { holdings: [{ symbol: "AAPL", assetClass: "equity" }, { symbol: "MSFT", assetClass: "equity" }] } as unknown as Book;
  // Only whether a symbol has an entry matters here.
  const entry = { symbol: "AAPL", error: null, years: null } as unknown as FilingsFile["bySymbol"][string];
  const fresh: FilingsFile = { version: 1, bySymbol: { AAPL: entry, MSFT: entry }, updated: "2026-10-15T06:01:00.000Z" };
  check("filings never read are due on open", filingsStale(null, book, now) && filingsStale(EMPTY_FILINGS, book, now));
  check("filings read this morning are not due again", !filingsStale(fresh, book, now));
  check("filings a day old are due", filingsStale({ ...fresh, updated: "2026-10-14T06:01:00.000Z" }, book, now));
  check("a holding bought since the last read makes them due", filingsStale({ ...fresh, bySymbol: { AAPL: entry } }, book, now));
  check("a read kept before the filings' years were kept is read again once", filingsStale({ ...fresh, bySymbol: { AAPL: entry, MSFT: { ...entry, years: undefined } } }, book, now) && !filingsStale({ ...fresh, bySymbol: { AAPL: entry, MSFT: { ...entry, error: "No such company", years: undefined } } }, book, now));
  check("a book with no listed equity has nothing due", !filingsStale(null, { ...book, holdings: [] }, now));
}

// Hamza, 20 Oct 2026: the earlier-year guide gives the dates to type, worked out from the first day held.
{
  const runs = flexHistoryRuns("2024-09-04");
  check("the first earlier run ends the day before the first day held and spans 365 days counting both ends; the next ends the day before it", runs[0].to === "2024-09-03" && runs[0].from === "2023-09-05" && runs[1].to === "2023-09-04" && runs[1].from === "2022-09-05", JSON.stringify(runs));
  check("with no first day the guide still says how to work the dates out", flexHistorySteps(null)[1].detail.includes("Custom Date Range") && flexHistorySteps("2024-09-04")[1].detail.includes("4 Sep 2024"));
}

if (failures.length) {
  console.error(`check:import FAILED (${passed} passed, ${failures.length} failed)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`check:import ok (${passed} passed): a Flex statement or a book file becomes the book, every refusal is a sentence, the brokers through a person's own keys sign, read and lay on the book, and the morning refresh keeps every key to itself.`);
