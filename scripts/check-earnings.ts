/**
 * check:earnings — the Earnings screen: the Nasdaq calendar parses and a
 * broken day never reads as a quiet one; the companies are the holdings, the
 * watchlist and the ones added; the alert fires the day before and holds
 * through the day; what a company filed around its date is read from its SEC
 * submissions; the report's figures come from the filing, or at the release
 * stage from the release itself, read by the person's model and checked
 * against its text (16 Oct 2026); its headline from the rules, its commentary
 * only with pages; the demo's sample keeps its days around today; and the
 * feed, the run and the screen stay where the guard and the alerts expect
 * them.
 */
import { againstPriced, expectedFor, expectedMove, keepExpected, parseCboeChain, sessionOnResults, stillBefore } from "../lib/expected-move";
import { historyWords, reactionHistory, releaseDays, releaseTime } from "../lib/reaction-history";
import { existsSync, readFileSync } from "node:fs";
import { deckLinks, earningsReportEmail } from "../lib/earnings-email";
import { INVESTIGATE_SEARCHES, INVESTIGATIVE, MAX_UNEXPECTED } from "../lib/investigate";

import { decksBy, deckHref, docViewHref, studyHref, deckTone } from "../lib/earnings-deck";
import { earningsDoc, earningsDocName, EARNINGS_DOC_PAGES } from "../lib/earnings-doc";
import { docText, pageTexts } from "../lib/report-doc";
import { emailWorthy } from "../lib/alerts";
import { DECK_NEEDS, DECK_WAIT_DAYS, EARNINGS_DOC } from "../lib/ontology";
import { beatsOf, callDue, callFromNotes, callKeyOf, callReadRequestBody, CALL_DOCUMENT_CHARS, CALL_FETCHES, guidanceLine, lensOf, notesOf, parseCallResponse, sentenceCut } from "../lib/earnings-call";
import { BRIEF_VERSION, briefDue, briefFailed, briefHolds, parseBriefResponse } from "../lib/deck-brief";
import { EMPTY_EARNINGS, figureChange, deckReadiness, deckWaiting, deckWaitWords, resultsWatchDue, upcomingOf } from "../lib/earnings";

import { factsTable, studyTable } from "../lib/edgar-facts";
import { flowAsks, flowKey, flowNotesDue, flowNotesFailed, flowNotesRequestBody, flowNotesSchema, parseFlowNotes, MAX_FLOW_NOTES } from "../lib/flow-notes";
import { buildFlow, flowFromSeries, flowLayout, flowLines, flowSources, lookThroughFlow, segmentSources, FLOW_COMPACT_WIDTH, FLOW_MIN_WIDTH } from "../lib/income-flow";
import { withoutRepeatedYear } from "../lib/earnings-deck";
import {
  addDays,
  buildDetail,
  buildReport,
  checkReleaseRead,
  commentaryRequestBody,
  contentDue,
  parseReactionResponse,
  reactionDue,
  reactionMove,
  reactionRequestBody,
  reactionWaits,
  reactionWords,
  demoEarnings,
  EARNINGS_PREFIX,
  earningsFileSchema,
  earningsNotices,
  earningsSubjects,
  entriesFor,
  filingsAround,
  htmlToText,
  keepReport,
  monthGrid,
  nasdaqMoney,
  parseCommentaryResponse,
  parseNasdaqEarnings,
  calendarReach,
  candidateReleases,
  EARLIER_RELEASES_PER_RUN,
  looksLikeResults,
  MAX_RELEASE_CHARS,
  missingQuarters,
  QUARTERS_BACK,
  quarterEnd,
  releaseCoverage,
  parseReleaseResponse,
  quarterFigures,
  quartersOf,
  releaseDocumentsOf,
  releaseLines,
  releaseQuarterKey,
  releaseRequestBody,
  releaseText,
  REPORT_PREFIX,
  reportDue,
  sameReport,
  reported,
  reportHeadline,
  reportNotices,
  shiftMonth,
  symbolKey,
  undated,
  weekdayFrom,
  weekdaysBetween,
  type EarningsCalendar,
  type EarningsEntry,
  type EarningsFile,
  type ReleaseRead,
  deckHistory,
  deckPeers,
  resultsStudyDue,
  resultsStudyQuestion,
  withStudiesOnReports,
} from "../lib/earnings";
import { bookSchema, type Book, type HoldingRecord } from "../lib/holdings";
import type { Study } from "../lib/research";
import { SCREENS } from "../lib/ontology";
import { DEFAULT_PREFERENCES, preferencesSchema } from "../lib/preferences";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}
const throws = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};
const read = (f: string) => readFileSync(f, "utf8");

// --- The calendar ------------------------------------------------------------------
const day = JSON.stringify({
  data: {
    asOf: "Thu, Oct 15, 2026",
    rows: [
      { lastYearRptDt: "10/16/2025", lastYearEPS: "$0.45", time: "time-after-hours", symbol: "IBKR", name: "Interactive Brokers Group, Inc.", marketCap: "$1", fiscalQuarterEnding: "Sep/2026", epsForecast: "$0.52", noOfEsts: "5" },
      { lastYearRptDt: "", lastYearEPS: "($0.12)", time: "time-pre-market", symbol: "abc", name: "Abc Corp", fiscalQuarterEnding: "Sep/2026", epsForecast: "", noOfEsts: "N/A" },
      { time: "time-not-supplied", symbol: "BRK/B", name: "Berkshire", fiscalQuarterEnding: "Sep/2026", epsForecast: "$4.10", noOfEsts: "2" },
      { time: "time-pre-market", symbol: "", name: "No symbol" },
    ],
  },
  message: null,
  status: { rCode: 200 },
});
const rows = parseNasdaqEarnings(day, "2026-10-15") ?? [];
check("a day of the Nasdaq calendar reads symbol, time, quarter and estimate; a row with no symbol is left out", rows.length === 3 && rows[0].symbol === "IBKR" && rows[0].time === "post" && rows[0].quarter === "Sep/2026" && rows[0].epsForecast === 0.52 && rows[0].estimates === 5 && rows[1].symbol === "ABC" && rows[1].time === "pre" && rows[2].time === "unknown", JSON.stringify(rows));
check("money in the calendar's words: $, parentheses for a loss, blank and N/A are none", nasdaqMoney("$1,234.50") === 1234.5 && nasdaqMoney("($0.12)") === -0.12 && nasdaqMoney("") === null && nasdaqMoney("N/A") === null && rows[1].lastYearEps === -0.12 && rows[1].epsForecast === null && rows[1].estimates === null);
check("a day with no reports is an empty list", parseNasdaqEarnings(JSON.stringify({ data: { rows: null }, status: { rCode: 200 } }), "2026-10-17")?.length === 0);
check("a broken page throws, never a quiet day", throws(() => parseNasdaqEarnings("<html>blocked</html>", "2026-10-15")) && throws(() => parseNasdaqEarnings(JSON.stringify({ rows: [] }), "2026-10-15")));
check("a day Nasdaq has not published answers with no data, which is neither a quiet day nor a broken page", parseNasdaqEarnings(JSON.stringify({ data: null, status: { rCode: 200 } }), "2026-12-21") === null);
{
  const reach = calendarReach(["2026-10-14", "2026-12-08", "2026-11-03"], ["2026-12-09", "2026-12-24", "2026-11-26"]);
  check("days past the last one published are not gaps; a day with no data inside the published range is", reach.publishedTo === "2026-12-08" && reach.gaps.join(",") === "2026-11-26", JSON.stringify(reach));
  const none = calendarReach([], ["2026-10-15"]);
  check("with nothing published every day is a gap", none.publishedTo === null && none.gaps.join(",") === "2026-10-15");
}
const days = weekdaysBetween("2026-10-09", "2026-10-13");
check("the calendar is read on weekdays only", days.join(",") === "2026-10-09,2026-10-12,2026-10-13", days.join(","));

// --- How the stock took its past results (Hamza, 23 Oct 2026) ---------------
{
  const subs = { filings: { recent: {
    accessionNumber: ["0001-26-000003", "0001-26-000002", "0001-26-000001", "0001-25-000009", "0001-25-000008"],
    form: ["8-K", "8-K", "8-K", "10-Q", "8-K"],
    filingDate: ["2026-07-31", "2026-07-30", "2026-05-01", "2026-05-02", "2023-01-30"],
    acceptanceDateTime: ["2026-07-31T08:05:12.000Z", "2026-07-30T16:30:00.000Z", "2026-04-30T16:10:00.000Z", "2026-05-02T09:00:00.000Z", "2023-01-30T07:00:00.000Z"],
    primaryDocument: ["a.htm", "b.htm", "c.htm", "q.htm", "d.htm"],
    items: ["2.02,9.01", "2.02", "2.02,9.01", "", "2.02"],
  } } };
  const rd = releaseDays(subs, 1, (_c, a, d) => `https://sec.example/${a}/${d}`, "2024-01-01");
  check("history: results releases are the 8-Ks with item 2.02 since the window, one per release, newest first", rd.map((d) => d.date).join(",") === "2026-07-30,2026-04-30", rd.map((d) => `${d.date}:${d.time}`).join(","));
  check("history: the SEC's acceptance clock is New York's: 16:00 or later is after the close, before it the session that day trades on it", releaseTime("2026-07-30T16:30:00.000Z") === "post" && releaseTime("2026-07-31T08:05:00.000Z") === "pre" && releaseTime("2026-07-31T15:59:00.000Z") === "pre" && releaseTime(undefined) === null);
  check("history: an acceptance after 17:30 is dated by the day it was accepted, not the next filing day", rd[1].date === "2026-04-30" && rd[1].time === "post");
  const closes = [{ date: "2026-04-30", value: 100 }, { date: "2026-05-01", value: 108 }, { date: "2026-07-30", value: 120 }, { date: "2026-07-31", value: 114 }];
  const bench = [{ date: "2026-04-30", value: 500 }, { date: "2026-05-01", value: 505 }, { date: "2026-07-30", value: 520 }, { date: "2026-07-31", value: 520 }];
  const h = reactionHistory({ releases: rd, reports: [], closes, bench, settled: "2026-10-23", symbol: "ZZZ", expected: [{ symbol: "ZZZ", date: "2026-07-30", pct: 4 } as never] });
  check("history: each move is from the close before to the first session on the results, beside SPY's over the same sessions", h.rows.length === 2 && h.rows[0].movePct === -5 && h.rows[0].benchmarkPct === 0 && h.rows[1].movePct === 8 && h.rows[1].benchmarkPct === 1, JSON.stringify(h.rows.map((r) => [r.movePct, r.benchmarkPct])));
  check("history: the summary counts the rises, the average size and the moves past what the options priced", h.summary?.up === 1 && h.summary.avgAbsPct === 6.5 && h.summary.avgAgainstPct === 1 && h.summary.priced === 1 && h.summary.beyondPriced === 1, JSON.stringify(h.summary));
  check("history: said in a sentence with SPY named", /Rose after 1 of the last 2 results/.test(historyWords(h.summary!)) && /SPY/.test(historyWords(h.summary!)));
  const unsettled = reactionHistory({ releases: rd, reports: [], closes, bench, settled: "2026-07-30", symbol: "ZZZ" });
  check("history: a release whose session has not closed is left out, never guessed", unsettled.rows.length === 1 && unsettled.rows[0].date === "2026-04-30");
  const kept = reactionHistory({ releases: rd, reports: [{ symbol: "ZZZ", date: "2026-07-31", time: "unknown", quarter: "Q2 2026", reaction: null }], closes, bench, settled: "2026-10-23", symbol: "zzz" });
  check("history: a kept report and the SEC's release a day apart are one result, timed by the SEC's clock", kept.rows.length === 2 && kept.rows[0].quarter === "Q2 2026" && kept.rows[0].time === "post");
  check("history: no closes, no rows and no summary", reactionHistory({ releases: rd, reports: [], closes: [], bench: null, settled: "2026-10-23", symbol: "ZZZ", note: "No closes." }).summary === null);
}

// --- Whose reports -----------------------------------------------------------------
const book = bookSchema.parse({
  asOf: "2026-10-14",
  holdings: [
    { id: "a", account: "U1", source: "ibkr", assetClass: "equity", symbol: "IBKR", name: "Interactive Brokers", quantity: 10, price: 60, value: 600, costBasis: null, currency: "USD", asOf: "2026-10-14", valuation: "broker", country: null, sector: null, themes: [] },
    { id: "b", account: "U1", source: "ibkr", assetClass: "etf", symbol: "VOO", name: "Vanguard S&P 500", quantity: 1, price: 600, value: 600, costBasis: null, currency: "USD", asOf: "2026-10-14", valuation: "broker", country: null, sector: null, themes: [] },
    { id: "c", account: "S1", source: "snaptrade", assetClass: "equity", symbol: "BRK.B", name: "Berkshire Hathaway", quantity: 1, price: 480, value: 480, costBasis: null, currency: "USD", asOf: "2026-10-14", valuation: "broker", country: null, sector: null, themes: [] },
  ],
  lookThrough: [],
  transactions: [],
  fx: { base: "USD", asOf: "2026-10-14", rates: {}, source: "test" },
}) as Book;
const records = { ABC: {} as HoldingRecord, ibkr: {} as HoldingRecord };
const subjects = earningsSubjects(book, records, ["MSFT", "abc", "brk-b"]);
check("the companies are the listed equities held, the watchlist and the ones added, each once, the first reason winning; a fund reports nothing", subjects.map((s) => `${s.symbol}:${s.kind}`).join(",") === "IBKR:holding,BRK.B:holding,ABC:watch,MSFT:added", subjects.map((s) => `${s.symbol}:${s.kind}`).join(","));
check("one spelling per listing: BRK.B, BRK/B and BRK-B", symbolKey("BRK/B") === symbolKey("brk-b") && symbolKey("BRK.B") === "BRK.B");
const calendar: EarningsCalendar = { from: "2026-09-24", to: "2026-12-24", rows: [...rows, { symbol: "ZZZ", name: null, date: "2026-10-15", time: "pre", quarter: null, epsForecast: null, estimates: null, lastYearEps: null }, { ...rows[0], date: "2026-10-15" }], missed: [], problems: [], readAt: "" };
const entries = entriesFor(calendar, subjects);
check("the calendar keeps only the person's companies, once a day, before the open first", entries.map((e) => `${e.symbol}:${e.time}`).join(",") === "ABC:pre,BRK.B:unknown,IBKR:post", entries.map((e) => `${e.symbol}:${e.time}`).join(","));
check("a company with no date in the window is named, never left out quietly", undated(subjects, entries, "2026-10-15").map((s) => s.symbol).join(",") === "MSFT");

// --- The month on screen -----------------------------------------------------------
const oct = monthGrid("2026-10");
check("October 2026 starts on a Thursday and runs to Friday the 30th, weekdays only", oct[0].join(",") === ",,,2026-10-01,2026-10-02" && oct.at(-1)!.join(",") === "2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30" && oct.flat().filter(Boolean).length === 22, JSON.stringify(oct[0]));
check("the month moves across a year", shiftMonth("2026-12", 1) === "2027-01" && shiftMonth("2026-01", -1) === "2025-12");

// --- The alert the day before ------------------------------------------------------
const entry = (date: string, extra: Partial<EarningsEntry> = {}): EarningsEntry => ({ symbol: "IBKR", name: "Interactive Brokers", date, time: "post", quarter: "Sep/2026", epsForecast: 0.52, estimates: 5, lastYearEps: 0.45, kind: "holding", subjectName: "Interactive Brokers", ...extra });
const before = earningsNotices([entry("2026-10-16")], "2026-10-15");
const onDay = earningsNotices([entry("2026-10-16")], "2026-10-16");
check("a report tomorrow is an alert the day before, with its time, quarter and estimate", before.length === 1 && before[0].key === `${EARNINGS_PREFIX}IBKR:2026-10-16` && before[0].date === "2026-10-15" && /reports tomorrow, after the close/.test(before[0].title) && /Consensus EPS \$0\.52 from 5 estimates/.test(before[0].detail), JSON.stringify(before[0]));
check("the alert holds through the day itself under the same key, and is gone after", onDay.length === 1 && onDay[0].key === before[0].key && /reports today/.test(onDay[0].title) && earningsNotices([entry("2026-10-16")], "2026-10-17").length === 0 && earningsNotices([entry("2026-10-19")], "2026-10-15").length === 0);

// --- What the company filed --------------------------------------------------------
const link = (cik: number, acc: string, doc: string | undefined) => `https://example.test/${cik}/${acc.replace(/-/g, "")}/${doc ?? ""}`;
const subs = { filings: { recent: { accessionNumber: ["0001-26-000009", "0001-26-000008", "0001-26-000007", "0001-26-000006", "0001-26-000005"], form: ["10-Q", "8-K", "8-K", "4", "10-Q"], filingDate: ["2026-11-06", "2026-10-16", "2026-10-15", "2026-10-15", "2026-08-07"], reportDate: ["2026-09-30", "", "2026-10-15", "", "2026-06-30"], primaryDocument: ["q3.htm", "ex.htm", "pr.htm", "f4.xml", "q2.htm"], items: ["", "8.01", "2.02,9.01", "", ""] } } };
const around = filingsAround(subs, 1381197, "2026-10-15", link);
check("the results release is the 8-K with item 2.02, the figures the first 10-Q after the date", around.release?.form === "8-K" && around.release.filed === "2026-10-15" && around.release.url.endsWith("/pr.htm") && around.filing?.form === "10-Q" && around.filing.filed === "2026-11-06" && !around.foreign, JSON.stringify(around));
const early = filingsAround({ filings: { recent: { ...subs.filings.recent, form: ["4", "8-K", "8-K", "4", "10-Q"] } } }, 1, "2026-10-15", link);
check("before the 10-Q, only the release", early.release?.filed === "2026-10-15" && early.filing === null);
check("the release keeps the SEC's acceptance time for the since-the-results tile, none when the list has none", around.release?.accepted == null && filingsAround({ filings: { recent: { ...subs.filings.recent, acceptanceDateTime: ["2026-11-06T16:30:00.000Z", "2026-10-16T08:00:00.000Z", "2026-10-15T16:05:12.000Z", "2026-10-15T18:00:00.000Z", "2026-08-07T16:00:00.000Z"] } } }, 1, "2026-10-15", link).release?.accepted === "2026-10-15T16:05:12.000Z");
const foreign = filingsAround({ filings: { recent: { accessionNumber: ["a", "b"], form: ["6-K", "20-F"], filingDate: ["2026-10-14", "2026-02-11"] } } }, 937966, "2026-10-14", link);
check("a 20-F filer's 6-K is its release, and it is known to have no 10-Q", foreign.release?.form === "6-K" && foreign.filing === null && foreign.foreign);
const buyback = filingsAround({ filings: { recent: { accessionNumber: ["c", "b", "a"], form: ["6-K", "6-K", "20-F"], filingDate: ["2026-11-05", "2026-11-03", "2026-02-11"] } } }, 353278, "2026-11-04", link);
check("every 6-K in the release's window is kept, earliest first, so the run can test each as results before taking one (a buyback notice filed the day before is not the release)", buyback.sixKs?.map((x) => x.accession).join(",") === "b,c" && buyback.release?.accession === "b", JSON.stringify(buyback.sixKs?.map((x) => x.accession)));
check("the run takes a 6-K as the release only once its text reads as the quarter's results, remembering the ones that are not", /resultsSixK\(found\.cik, around, e, prev, c\)/.test(read("lib/earnings-run.ts")) && /looksLikeResults\(releaseText\(docs\), key\)/.test(read("lib/earnings-run.ts")) && /tried\.add\(x\.accession\)/.test(read("lib/earnings-run.ts")) && /SIX_K_TESTS_PER_RUN/.test(read("lib/earnings-run.ts")) && !looksLikeResults("Novo Nordisk A/S - Share repurchase programme. On 3 November 2026 the company bought 240,000 B shares at an average price of 267.29, DKK 64,148,584. ".repeat(12), "2026Q3"));
check("a document that is not a submissions list throws", throws(() => filingsAround({ nope: 1 }, 1, "2026-10-15", link)));

// --- The figures of the quarter ----------------------------------------------------
const t = factsTable(JSON.parse(read("data/samples/edgar_companyfacts_sample.json")));
const q = quarterFigures(t);
check("the quarter's figures come from the filing, against the same quarter a year before", q.period !== null && q.lines.some((l) => l.label === "Revenue" && l.before !== null) && q.lines.every((l) => typeof l.now === "string"), `${q.period}: ${q.lines.map((l) => `${l.label} ${l.now}/${l.before}/${l.changePct}`).join("; ")}`);

// --- The release, read by the model and checked by the app ------------------------
// A 6-K filer has no quarterly facts, and a 10-Q filer none at the release stage, so
// the quarter is read from the release's own documents (16 Oct 2026).
const html = `<html><head><title>ASML Q3</title><style>td{color:red}</style></head><body><ix:header>hidden facts</ix:header><script>var a = 1;</script>
<p>ASML reports &euro;11.7 billion total net sales in Q3 2026.</p>
<table><tr><th>&nbsp;</th><th>Q3 2025</th><th>Q2 2026</th><th>Q3 2026</th></tr>
<tr><td>Total net sales</td><td>7,742</td><td>10,160</td><td>11,662</td></tr>
<tr><td>Gross profit</td><td>3,987</td><td>5,486</td><td>6,706</td></tr>
<tr><td>Income from operations</td><td>2,500</td><td>3,400</td><td>4,320</td></tr>
<tr><td>Net income</td><td>2,125</td><td>3,150</td><td>5,000</td></tr>
<tr><td>Diluted EPS (&euro;)</td><td>5.42</td><td>8.08</td><td>12.95</td></tr>
<tr><td>Net cash from operating activities</td><td>1,100</td><td>2,900</td><td></td></tr>
<tr><td>Purchases of property, plant and equipment</td><td>(400)</td><td>(600)</td><td></td></tr></table>
<p>Net bookings were &euro;5,400 million.</p></body></html>`;
const text = htmlToText(html);
check("an HTML document reads as text: entities decoded, cells kept apart, scripts, styles and the inline-XBRL header dropped", /€11\.7 billion/.test(text) && /Total net sales \| 7,742 \| 10,160 \| 11,662/.test(text) && !/hidden facts|var a|color:red|ASML Q3/.test(text), text.split("\n")[1]);
const index = { directory: { name: "/Archives/edgar/data/937966/000093796626000012", item: [{ name: "0000937966-26-000012-index.htm" }, { name: "R1.htm" }, { name: "FilingSummary.xml" }, { name: "other.htm" }, { name: "asml-20260930xex99d2.htm" }, { name: "asml-20260930x6k.htm" }, { name: "asml-20260930xex99d1.htm" }, { name: "logo.jpg" }] } };
check("a release's documents are its primary document, then the exhibits, then the rest, HTML only; a page that is not a filing index throws", releaseDocumentsOf(index, "asml-20260930x6k.htm").join(",") === "asml-20260930x6k.htm,asml-20260930xex99d1.htm,asml-20260930xex99d2.htm,other.htm" && throws(() => releaseDocumentsOf({ nope: 1 }, null)), releaseDocumentsOf(index, "asml-20260930x6k.htm").join(","));
const longText = releaseText([{ name: "a.htm", text: "x".repeat(MAX_RELEASE_CHARS) }, { name: "b.htm", text: "never read" }]);
check("the text the model is given is each document under its name, cut at the cap so the press release is never the part lost", longText.length === MAX_RELEASE_CHARS && longText.startsWith("=== a.htm ===") && !/b\.htm/.test(longText) && /=== b\.htm ===\nbee/.test(releaseText([{ name: "a.htm", text: "" }, { name: "b.htm", text: "bee" }])));
const rbody = releaseRequestBody({ symbol: "ASML", name: "ASML Holding", date: "2026-10-14", quarter: "Sep/2026", form: "6-K", text }) as { tools: { name: string }[]; system: string; messages: { content: { text: string }[] }[]; tool_choice: { type: string } };
check("the release is read through one tool on any provider, every figure as printed and null when it is not", rbody.tools.length === 1 && rbody.tools[0].name === "record_quarter" && /Never compute, estimate/.test(rbody.system) && /record null/.test(rbody.system) && /never the year to date/.test(rbody.system) && /Total net sales \| 7,742/.test(rbody.messages[0].content[0].text) && rbody.tool_choice.type === "auto");
const modelRead: ReleaseRead = {
  period: "Q3 2026",
  periodEnd: "2026-09-28",
  currency: "EUR",
  unit: "millions",
  lines: {
    revenue: { now: 11662, quarterBefore: 10160, yearBefore: 7742 },
    grossProfit: { now: 6706, quarterBefore: 5486, yearBefore: 3987 },
    costOfRevenue: { now: null, quarterBefore: null, yearBefore: null },
    rnd: { now: null, quarterBefore: null, yearBefore: null },
    sellingMarketing: { now: null, quarterBefore: null, yearBefore: null },
    generalAdmin: { now: null, quarterBefore: null, yearBefore: null },
    sga: { now: null, quarterBefore: null, yearBefore: null },
    taxExpense: { now: null, quarterBefore: null, yearBefore: null },
    operatingIncome: { now: 4320, quarterBefore: 3400, yearBefore: 2500 },
    netIncome: { now: 5000, quarterBefore: 3150, yearBefore: 2125 },
    epsDiluted: { now: 12.95, quarterBefore: 8.08, yearBefore: 5.42 },
    cfo: { now: 4420, quarterBefore: 2900, yearBefore: 1100 },
    capex: { now: 700, quarterBefore: 600, yearBefore: 400 },
    fcf: { now: null, quarterBefore: null, yearBefore: null },
  },
  kpis: [{ name: "Net bookings", unit: "€ million", now: 5400, quarterBefore: 5600, yearBefore: 2600 }],
};
const goodRelease = parseReleaseResponse({ content: [{ type: "tool_use", name: "record_quarter", input: modelRead }] });
check("the answer is the one record_quarter call, validated; words or a unit the schema does not know are refused", goodRelease.ok && !parseReleaseResponse({ content: [{ type: "text", text: "Revenue was 11,662" }] }).ok && !parseReleaseResponse({ content: [{ type: "tool_use", name: "record_quarter", input: { ...modelRead, unit: "lakhs" } }] }).ok);
const checked = checkReleaseRead(modelRead, text);
check("a figure the text does not print is dropped and named, never used; the rest stay", checked.dropped.join(",") === "Cash from operations (quarter),Capital expenditure (quarter),Net bookings (quarter before),Net bookings (a year before)" && checked.read.lines.cfo.now === null && checked.read.lines.cfo.quarterBefore === 2900 && checked.read.lines.revenue.now === 11662 && checked.read.kpis[0].now === 5400 && checked.read.kpis[0].quarterBefore === null, checked.dropped.join(","));
const rlines = releaseLines(checked.read);
const rshape = rlines.map((l) => `${l.label} ${l.now}/${l.prior}/${l.before}/${l.changePct}`).join("; ");
check("the release's lines take the filing's shape, with the quarter before beside and margins from the printed figures", /^Revenue 11\.66bn\/10\.16bn\/7\.74bn\/50\.6; Gross margin 57\.5%\/54\.0%\/51\.5%\/null; Operating income 4\.32bn\/3\.40bn\/2\.50bn\/72\.8; Operating margin 37\.0%\/33\.5%\/32\.3%\/null; Net income 5\.00bn\/3\.15bn\/2\.13bn\/135\.3; EPS, diluted 12\.95\/8\.08\/5\.42\/138\.9$/.test(rshape), rshape);
check("free cash flow is cash from operations less capital expenditure where both are printed, else absent for that column", rlines.find((l) => l.label === "Free cash flow")?.now === undefined && releaseLines({ ...checked.read, lines: { ...checked.read.lines, cfo: { ...checked.read.lines.cfo, now: 4420 }, capex: { ...checked.read.lines.capex, now: 700 } } }).find((l) => l.label === "Free cash flow")?.now === "3.72bn" && releaseLines({ ...checked.read, lines: { ...checked.read.lines, cfo: { ...checked.read.lines.cfo, now: 4420 }, capex: { ...checked.read.lines.capex, now: 700 } } }).find((l) => l.label === "Free cash flow")?.prior === "2.30bn");
{
  // Gross margin from the cost of revenue (Hamza, 4 Nov 2026: "always NA for gross margins"): a release that prints cost of sales and no gross profit line.
  const noGross = { ...checked.read, lines: { ...checked.read.lines, grossProfit: { now: null, quarterBefore: null, yearBefore: null }, costOfRevenue: { now: -4956, quarterBefore: 4674, yearBefore: null } } };
  const gm = releaseLines(noGross).find((l) => l.label === "Gross margin");
  const gq = quartersOf(null, [{ key: "2026Q3", read: noGross }])?.table.rows.find((r) => r.key === "grossMarginPct")?.values ?? [];
  check("with no gross profit printed, the gross margin is revenue less the cost of revenue, either sign, and a column without both stays empty", gm?.now === "57.5%" && gm.prior === "54.0%" && gm.before === null && gq.at(-1) !== null && Math.abs(gq.at(-1)! - 57.5) < 0.1 && /costOfRevenue/.test(read("lib/earnings.ts")), JSON.stringify(gm));
}
check("a release's quarter is keyed from its period end, else the calendar's fiscal quarter, else not at all", releaseQuarterKey(modelRead, null) === "2026Q3" && releaseQuarterKey({ periodEnd: null }, "Sep/2026") === "2026Q3" && releaseQuarterKey({ periodEnd: null }, "Jan/2027") === "2027Q1" && releaseQuarterKey({ periodEnd: null }, null) === null && releaseQuarterKey({ periodEnd: "2026-12-31" }, null) === "2026Q4");
const alone = quartersOf(null, [{ key: "2026Q3", read: checked.read }]);
check("with no quarterly facts the series is the release's three quarters, oldest first, and says so", alone?.table.cols.join(",") === "Q3 25,Q2 26,Q3 26" && alone.table.rows.find((r) => r.key === "revenue")?.values.join(",") === "7742000000,10160000000,11662000000" && alone.table.rows.find((r) => r.key === "grossMarginPct")?.values.map((v) => v?.toFixed(1)).join(",") === "51.5,54.0,57.5" && /Every quarter from the releases/.test(alone.note ?? ""), `${alone?.table.cols.join(",")} · ${alone?.note}`);
const merged = quartersOf(t, [{ key: "2026Q3", read: checked.read }]);
const factsRev = quartersOf(t, [])!.table.rows.find((r) => r.key === "revenue")!.values;
check("laid on the filings' facts the release adds the newest quarter at the right, the facts win where both have a figure, and the note names the release's column", merged?.table.cols.length === 8 && merged.table.cols.at(-1) === "Q3 26" && merged.table.cols.at(-2) === "Q2 26" && merged.table.rows.find((r) => r.key === "revenue")!.values.at(-1) === 11662e6 && merged.table.rows.find((r) => r.key === "revenue")!.values.at(-2) === factsRev.at(-1) && merged.note === "Q3 26 from the release, as printed and checked against the text; the rest from the filings' facts.", `${merged?.table.cols.join(",")} · ${merged?.note}`);
check("no facts and no release give no series, never an empty table", quartersOf(null, []) === null && quartersOf(null, [{ key: "nope", read: checked.read }]) === null);

// --- The earlier quarters of a 6-K filer, from their own releases (16 Oct 2026) ---
const cov = releaseCoverage([{ key: "2026Q3", read: checked.read }]);
check("a release covers its quarter, the quarter before and the same quarter a year before, where it prints revenue", [...cov].sort().join(",") === "2025Q3,2026Q2,2026Q3" && releaseCoverage([{ key: "2026Q3", read: { ...checked.read, lines: { ...checked.read.lines, revenue: { now: 11662, quarterBefore: null, yearBefore: 7742 } } } }]).size === 2 && releaseCoverage([{ key: "nope", read: checked.read }]).size === 0, [...cov].join(","));
const missing = missingQuarters("2026Q3", cov);
check("the quarters still missing are the rest of the eight, newest first, the latest itself left out", QUARTERS_BACK === 8 && missing.join(",") === "2026Q1,2025Q4,2025Q2,2025Q1,2024Q4" && missingQuarters("2026Q3", new Set(["2026Q2", "2026Q1", "2025Q4", "2025Q3", "2025Q2", "2025Q1", "2024Q4"])).length === 0 && missingQuarters("nope", cov).length === 0, missing.join(","));
check("a quarter ends on the calendar's day", quarterEnd("2026Q3") === "2026-09-30" && quarterEnd("2025Q4") === "2025-12-31" && quarterEnd("2026Q1") === "2026-03-31");
const fsubs = { filings: { recent: { accessionNumber: ["0000937966-26-000012", "0000937966-26-000011", "0000937966-26-000009", "0000937966-26-000008", "0000937966-26-000007", "0000937966-26-000005", "0000937966-26-000004"], form: ["6-K", "6-K", "6-K", "6-K", "6-K", "20-F", "6-K"], filingDate: ["2026-10-14", "2026-08-05", "2026-07-15", "2026-04-15", "2026-04-02", "2026-02-11", "2026-01-28"], reportDate: ["2026-10-14", "", "2026-07-15", "", "", "2025-12-31", ""], primaryDocument: ["asml-20260930x6k.htm", "buyback.htm", "asml-20260630x6k.htm", "asml-20260331x6k.htm", "dividend.htm", "asml-20251231x20f.htm", "asml-20251231x6k.htm"] } } };
const q2 = candidateReleases(fsubs, 937966, "2026Q2", link);
check("the 6-Ks that could be a quarter's release are those filed a week to two months after its end, oldest first, a 20-F or a 6-K before the week never", q2.map((f) => f.filed).join(",") === "2026-07-15,2026-08-05" && q2[0].accession === "0000937966-26-000009" && q2[0].url.endsWith("/asml-20260630x6k.htm") && candidateReleases(fsubs, 937966, "2025Q4", link).map((f) => f.filed).join(",") === "2026-01-28" && candidateReleases(fsubs, 937966, "2026Q1", link).map((f) => f.filed).join(",") === "2026-04-15", q2.map((f) => f.filed).join(","));
check("a 6-K already found not to be results is left out; a page that is not a submissions list throws", candidateReleases(fsubs, 937966, "2026Q2", link, ["0000937966-26-000009"]).map((f) => f.filed).join(",") === "2026-08-05" && throws(() => candidateReleases({ nope: 1 }, 1, "2026Q2", link)));
// A release runs to tens of thousands of characters; the fixture's table twice over stands in for one.
const longRelease = `${text}\n${text}`;
const q2text = longRelease.replace(/Q3 2026/g, "Q2 2026").replace(/Q3 2025/g, "Q2 2025");
check("a text reads as a quarter's results when it names the quarter and its year more than the next one, carries a sales line and prints a table of figures; a short notice never does", looksLikeResults(q2text, "2026Q2") && !looksLikeResults(q2text, "2026Q1") && !looksLikeResults(longRelease, "2026Q2") && looksLikeResults(q2text.replace(/Q2 2026/g, "second quarter of 2026"), "2026Q2") && looksLikeResults(longRelease.replace(/Q3 2026/g, "three months ended September 30, 2026"), "2026Q3") && !looksLikeResults("ASML announces a dividend of €1.52 per share for the third quarter 2026. ".repeat(20), "2026Q3") && !looksLikeResults(longRelease.replace(/net sales/gi, "shipments"), "2026Q3") && !looksLikeResults(text, "2026Q3"), `${looksLikeResults(q2text, "2026Q2")} ${looksLikeResults(q2text, "2026Q1")}`);
check("a few earlier releases are read per run", EARLIER_RELEASES_PER_RUN >= 2 && EARLIER_RELEASES_PER_RUN <= 6);
const q2read: ReleaseRead = { ...checked.read, period: "Q2 2026", periodEnd: "2026-06-28", lines: { ...checked.read.lines, revenue: { now: 10160, quarterBefore: 9100, yearBefore: 7200 }, netIncome: { now: 3150, quarterBefore: 2800, yearBefore: 1900 } } };
const withEarlier = quartersOf(null, [{ key: "2026Q3", read: checked.read }, { key: "2026Q2", read: q2read }]);
check("an earlier release's quarters join the series where this one's left gaps, this one's figures winning where both print a quarter", withEarlier?.table.cols.join(",") === "Q2 25,Q3 25,Q1 26,Q2 26,Q3 26" && withEarlier.table.rows.find((r) => r.key === "revenue")?.values.join(",") === "7200000000,7742000000,9100000000,10160000000,11662000000" && /Every quarter from the releases/.test(withEarlier.note ?? ""), `${withEarlier?.table.cols.join(",")} · ${withEarlier?.table.rows.find((r) => r.key === "revenue")?.values.join(",")}`);
const releaseFigures = { ...checked.read, documents: ["asml-20260930x6k.htm", "asml-20260930xex99d1.htm"], dropped: checked.dropped, readAt: "2026-10-14T20:10:00.000Z" };

// --- The headline, written by the app ----------------------------------------------
const head = (p: Partial<Parameters<typeof reportHeadline>[0]>) => reportHeadline({ symbol: "MA", kind: "holding", status: "complete", classBefore: "Compounding Machine", classNow: "Compounding Machine", testsOfClass: { passes: 7, of: 7 }, killsMet: 0, kills: 2, triggersMet: 0, rulesFailing: 0, releaseForm: "8-K", sentence: null, tested: true, ...p });
check("HCMP's line: no kill signal met; stays a class with its count; no decision owed", head({}) === "No kill signal met; MA stays a Compounding Machine (7 of 7); no decision owed.", head({}));
check("a class that changes or a kill signal met owes a decision", /moves from Compounding Machine to Transitional Holding/.test(head({ classNow: "Transitional Holding" })) && /a decision is owed/.test(head({ classNow: "Transitional Holding" })) && /^1 kill signal met; .*a decision is owed\.$/.test(head({ killsMet: 1 })));
check("a company not held tests as a class and owes nothing", head({ kind: "watch", classBefore: null }) === "No kill signal met; MA tests as a Compounding Machine (7 of 7); not held, so nothing is owed.");
check("before the 10-Q, the headline says what was filed and what is waited for", /reported on 8-K; .* re-tested when the 10-Q lands/.test(head({ status: "release", tested: false })) && /annual 20-F/.test(head({ status: "release", releaseForm: "6-K", tested: false })));
check("at the release stage with the release's own figures, the headline says they are the release's, checked against its text, and that the tests read the last filing until the filing lands", /Reported on 6-K; the quarter's figures are the release's own, checked against its text; the tests read the last filing until the 20-F lands\.$/.test(head({ status: "release", releaseForm: "6-K", figuresFrom: "release" })) && /until the 10-Q lands\.$/.test(head({ status: "release", figuresFrom: "release" })), head({ status: "release", releaseForm: "6-K", figuresFrom: "release" }));
check("before the 10-Q, with the last filing read, the headline carries the class and the decision on those figures and says the quarter's own wait", /No kill signal met; MA stays a Compounding Machine \(7 of 7\); no decision owed\. Reported on 8-K; the quarter's own figures wait for the 10-Q/.test(head({ status: "release" })) && /wait for the 20-F/.test(head({ status: "release", releaseForm: "6-K" })), head({ status: "release" }));

// --- A report ----------------------------------------------------------------------
const rec: HoldingRecord = { ownValuation: { low: 430, base: 560, high: 720, asOf: "2026-10-01", basis: null }, since: null, note: null, levels: null, triggers: [{ id: "K1", kind: "kill", field: "revenue_growth_pct", is: "lte", value: 8, note: "Growth stalls" }, { id: "T1", kind: "trigger", field: "price", is: "gte", value: 700, note: null }], revaluation: null, sector: null } as HoldingRecord;
const report = buildReport({ entry: entry("2026-10-15"), status: "complete", sentence: null, release: around.release, filing: around.filing, table: t, verdict: null, classBefore: null, record: rec, readings: { price: 585, revenue_growth_pct: 6 }, price: 585, weight: 10.4, prev: null, now: "2026-11-07T06:00:00.000Z", detail: null });
check("a report reads the record's kill signal on the new figures and says it is met", report.triggers[0].met === true && report.triggers[1].met === false && /^1 kill signal met/.test(report.headline) && report.valuation?.base === 560 && report.figures.length === q.lines.length, report.headline);
const waiting = buildReport({ ...{ entry: entry("2026-10-15"), status: "waiting" as const, sentence: null, release: null, filing: null, table: t, verdict: null, classBefore: null, record: null, readings: {}, price: null, weight: null, prev: null, now: "2026-10-15T23:00:00.000Z", detail: null } });
check("a report waiting for its filing carries no figures", waiting.figures.length === 0 && waiting.classNow === null && /nothing filed/.test(waiting.headline));
check("a complete report's figures are the filing's, a report with neither has none", report.figuresFrom === "filing" && waiting.figuresFrom === null && waiting.period === null);
const relEntry = { ...entry("2026-10-14"), symbol: "ASML", name: "ASML Holding", quarter: "Sep/2026" };
const relAround = { release: { form: "6-K", filed: "2026-10-14", url: "https://www.sec.gov/Archives/edgar/data/937966/000093796626000012/asml-20260930x6k.htm", accession: "0000937966-26-000012", period: "2026-09-27" }, filing: null, foreign: true };
const relDetail = buildDetail({ holding: null, cap: null, table: null, segments: null, geography: null, engine: null, fundamentals: null, verdict: null, study: null, closes: null, thesis: null, before: null, balance: null, releases: [{ key: "2026Q3", read: checked.read }], kpis: checked.read.kpis });
const atRelease = buildReport({ entry: relEntry, status: "release", sentence: null, release: relAround.release, filing: null, table: null, verdict: null, classBefore: null, record: null, readings: {}, price: null, weight: null, prev: null, now: "2026-10-14T20:10:00.000Z", detail: relDetail, releaseFigures, releaseNote: null });
check("at the release stage the report's figures are the release's: its period and currency, the quarter before beside, and the headline says so", atRelease.figuresFrom === "release" && atRelease.period === "Q3 2026, from the release" && atRelease.currency === "EUR" && atRelease.figures.length === rlines.length && atRelease.figures[0].prior === "10.16bn" && /the quarter's figures are the release's own/.test(atRelease.headline) && atRelease.releaseFigures?.documents.length === 2, `${atRelease.period} · ${atRelease.headline}`);
check("the detail's quarters are the release's, with its note and the KPIs it printed", atRelease.detail?.quarters?.cols.join(",") === "Q3 25,Q2 26,Q3 26" && /Every quarter from the releases/.test(atRelease.detail?.quartersNote ?? "") && atRelease.detail?.kpis[0].name === "Net bookings" && atRelease.detail?.kpis[0].now === 5400);
const keptRelease = earningsFileSchema.safeParse(keepReport(null, atRelease, "2026-10-14T20:10:00.000Z"));
const withEarlierKept = earningsFileSchema.safeParse(keepReport(null, buildReport({ entry: relEntry, status: "release", sentence: null, release: relAround.release, filing: null, table: null, verdict: null, classBefore: null, record: null, readings: {}, price: null, weight: null, prev: null, now: "2026-10-14T20:10:00.000Z", detail: null, releaseFigures, releaseNote: null, earlierReleases: [{ key: "2026Q2", release: { ...relAround.release, filed: "2026-07-15", accession: "0000937966-26-000009" }, figures: { ...releaseFigures, ...q2read } }], earlierTried: ["0000937966-26-000011"], earlierNote: "1 earlier release read from their 6-Ks; 4 quarters still to read, a few each run." }), "2026-10-14T20:10:00.000Z"));
check("a report keeps its earlier releases, the 6-Ks that were not results and where that stands; a report kept before has none", withEarlierKept.success && withEarlierKept.data.reports[0].earlierReleases[0].key === "2026Q2" && withEarlierKept.data.reports[0].earlierTried.length === 1 && earningsFileSchema.parse({ ...keptRelease.data!, reports: keptRelease.data!.reports.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("earlier")))) }).reports[0].earlierReleases.length === 0, withEarlierKept.success ? "" : JSON.stringify(withEarlierKept.error.issues.slice(0, 3)));
check("a release the model could not read keeps a sentence and no figures; a report with the release's figures keeps to the schema", keptRelease.success && buildReport({ entry: relEntry, status: "release", sentence: null, release: relAround.release, filing: null, table: null, verdict: null, classBefore: null, record: null, readings: {}, price: null, weight: null, prev: null, now: "2026-10-14T20:10:00.000Z", detail: null, releaseFigures: null, releaseNote: "The release could not be read: the model answered in words instead of recording the quarter." }).figuresFrom === null, keptRelease.success ? "" : JSON.stringify(keptRelease.error.issues.slice(0, 3)));
let file: EarningsFile = keepReport(null, waiting, "2026-10-15T23:00:00.000Z");
file = keepReport(file, report, "2026-11-07T06:00:00.000Z");
check("one report per company and date, the later replacing the earlier", file.reports.length === 1 && file.reports[0].status === "complete" && earningsFileSchema.safeParse(file).success);
// A study at every post-earnings report (Hamza, 27 Oct 2026): queued once per results, one at a time, laid on the newest report so its decks are made again.
{
  const rel = { ...atRelease, detail: relDetail, kind: "holding" as const };
  const study = (id: string, over: Partial<Study>): Study => ({ id, subject: "ASML", ticker: "ASML", question: "", family: "fundamentals", templateTitle: "Business fundamentals study", sections: [{ id: "competition", title: "Competition and position", guidance: "", tags: [], amendments: [] }, { id: "swot", title: "SWOT", guidance: "", tags: [], amendments: [] }], status: "done", requestedAt: "2026-10-15T06:00:00.000Z", touchedAt: null, finishedAt: "2026-10-15T06:04:00.000Z", facts: null, factsNote: null, fundamentals: {}, fundamentalsNotes: [], verdict: null, holding: null, markets: [], table: null, written: { competition: "Lam Research and Tokyo Electron compete in deposition; no one ships EUV.", swot: "Strengths: sole EUV supplier." }, pending: [], error: null, forResults: "2026-10-14", ...over });
  check("a report with its results read and no study since is owed one; a study since, or one in flight, or an old report, is not", resultsStudyDue([rel], [], "2026-10-15")?.symbol === "ASML" && resultsStudyDue([rel], [study("aaaaaaaaaaa1", {})], "2026-10-15") === null && resultsStudyDue([rel, { ...rel, symbol: "MA", date: "2026-10-14" }], [study("aaaaaaaaaaa2", { ticker: "NVO", subject: "NVO", status: "running" })], "2026-10-15") === null && resultsStudyDue([rel], [], "2026-11-30") === null && resultsStudyDue([{ ...rel, status: "waiting" }], [], "2026-10-15") === null);
  check("an older study of the company, asked for before the results, does not count", resultsStudyDue([rel], [study("aaaaaaaaaaa3", { requestedAt: "2026-07-20T06:00:00.000Z", forResults: null })], "2026-10-15")?.symbol === "ASML" && /reported 14 Oct 2026/.test(resultsStudyQuestion(rel)) && /peers/.test(resultsStudyQuestion(rel)));
  const laid = withStudiesOnReports({ version: 1, updated: "", reports: [rel], expected: [] } as never, [study("aaaaaaaaaaa4", {})], "2026-10-15T07:00:00.000Z");
  check("a finished study is laid on the company's newest report, which moves on so its decks are made again; laid once", laid.laid === 1 && laid.file.reports[0].detail?.study?.id === "aaaaaaaaaaa4" && laid.file.reports[0].detail?.study?.sections.some((x) => x.id === "swot") === true && laid.file.reports[0].updatedAt === "2026-10-15T07:00:00.000Z" && withStudiesOnReports(laid.file, [study("aaaaaaaaaaa4", {})], "2026-10-16T07:00:00.000Z").laid === 0);
  const studyRun = read("lib/study-run.ts");
  check("the morning refresh and opening the app queue and write the results study, one per run, and remake the decks", /resultsStudiesInto/.test(read("lib/daily-sync.ts")) && /resultsStudiesInto/.test(read("lib/catch-up.ts")) && /keepDecksInto\(/.test(studyRun) && /studyToTakeUp\(file\.studies, iso\(\)\)/.test(studyRun) && /stalled\(x, nowIso\)/.test(read("lib/research.ts")) && /queueStudy\(c, vault, due\.symbol/.test(studyRun) && /from "@\/lib\/study-run"/.test(read("app/(app)/research/actions.ts")));
}
{
  // The results watch (Hamza, 4 Nov 2026): one file says whether a followed company's results are out and unread.
  const up = upcomingOf([{ symbol: "MA", date: "2026-10-15", time: "pre" }, { symbol: "NVO", date: "2026-10-15", time: "post" }, { symbol: "OLD", date: "2026-10-01", time: "pre" }, { symbol: "FAR", date: "2026-11-30", time: "pre" }], "2026-10-15");
  const file = { ...EMPTY_EARNINGS, upcoming: up };
  check("results watch: today's and yesterday's followed results are kept, the long past and the far ahead are not", up.map((u) => u.symbol).join(",") === "MA,NVO");
  check("results watch: before the open from 07:00 New York, after the close from 16:30, and quiet once the release is read", !resultsWatchDue(file, { date: "2026-10-15", minutes: 6 * 60 }) && resultsWatchDue(file, { date: "2026-10-15", minutes: 7 * 60 + 5 }) && !resultsWatchDue({ ...file, upcoming: up.filter((u) => u.symbol === "NVO") }, { date: "2026-10-15", minutes: 15 * 60 }) && resultsWatchDue({ ...file, upcoming: up.filter((u) => u.symbol === "NVO") }, { date: "2026-10-15", minutes: 16 * 60 + 40 }) && resultsWatchDue({ ...file, upcoming: up.filter((u) => u.symbol === "MA"), reports: [{ ...report, symbol: "MA", date: "2026-10-15", status: "waiting" }] }, { date: "2026-10-15", minutes: 9 * 60 }) && !resultsWatchDue({ ...file, upcoming: up.filter((u) => u.symbol === "MA"), reports: [{ ...report, symbol: "MA", date: "2026-10-15", status: "release" }] }, { date: "2026-10-15", minutes: 9 * 60 }) && !resultsWatchDue(null, { date: "2026-10-15", minutes: 9 * 60 }));
}
check("a report is read again until complete, within the wait for the 10-Q; a complete one kept before the deck's detail is read once more", reportDue(null, "2026-10-15") && reportDue(waiting, "2026-11-20") && !reportDue(waiting, "2026-12-30") && reportDue(report, "2026-11-08") && !reportDue({ ...report, detail: {} as never }, "2026-11-08"));
const readBack = earningsFileSchema.parse(JSON.parse(JSON.stringify(keepReport(null, atRelease, "2026-10-14T20:10:00.000Z")))).reports[0];
check("a release read again matches the one read back from the vault, whatever order the file keeps its keys in, so its deck is not remade", sameReport(readBack, atRelease) && JSON.stringify(readBack.figures) !== JSON.stringify(atRelease.figures) && !sameReport(readBack, { ...atRelease, headline: `${atRelease.headline} Again.` }));
check("a release read in the last few hours waits before the SEC is asked again; a report still waiting on its release does not", atRelease.checkedAt === "2026-10-14T20:10:00.000Z" && !contentDue(atRelease, "2026-10-15", "2026-10-14T23:00:00.000Z") && contentDue(atRelease, "2026-10-15", "2026-10-15T03:00:00.000Z") && contentDue(atRelease, "2026-10-15") && contentDue({ ...waiting, checkedAt: "2026-10-14T23:00:00.000Z" }, "2026-10-15", "2026-10-14T23:30:00.000Z"));
check("a report not read through yet is reviewed before one read again, so none waits on another", /\.sort\(\(a, b\) => \(a\.r\.doc\?\.at \?\? ""\)\.localeCompare\(b\.r\.doc\?\.at \?\? ""\)\)/.test(read("lib/earnings-run.ts")) && /reportDue\(kept\.get\(reportKey\(e\)\) \?\? null, ny\.date, now\.toISOString\(\)\)/.test(read("lib/earnings-run.ts")));
check("only reports on or before today are due, an after-the-close one on its own day too", reported([entry("2026-10-15"), entry("2026-10-16")], "2026-10-15").length === 1);
const rn = reportNotices(file, "2026-11-08");
check("the report is an alert keyed by its stage, red when a kill signal is met, and clears after a week", rn.length === 1 && rn[0].key === `${REPORT_PREFIX}IBKR:2026-10-15:figures` && rn[0].tone === "danger" && /Revenue/.test(rn[0].detail) && reportNotices(file, "2026-11-20").length === 0, JSON.stringify(rn[0]));
{
  // Each report as its own email (Hamza, 23 Oct 2026: META and SPOT came as one-line alerts), once, whole, with its PDF (4 Nov 2026).
  const r0 = file.reports[0];
  const whole = { ...r0, doc: { at: r0.updatedAt, sig: "abcd1234", ready: true, drop: [], held: [] } };
  const mail = earningsReportEmail(whole, "https://example.app", ["report.pdf"], { deck: true });
  check("a report's email carries the headline, the figures, the signals, the report's page in the app and what is attached", mail.subject.startsWith(r0.symbol) && mail.subject.includes(r0.headline.slice(0, 20)) && /Revenue/.test(mail.text) && mail.html.includes("https://example.app/api/earnings/deck?key=") && mail.html.includes("https://example.app/earnings?report=") && /Attached: report\.pdf/.test(mail.text) && /Kill signals/.test(mail.text) && !/<script/i.test(mail.html) && !/docs\.google\.com\/presentation/.test(mail.html), mail.text);
  check("before the report is whole no page link is offered, and a PDF that could not be made is said so", deckLinks(r0, "https://example.app").length === 0 && /comes in its own email/.test(earningsReportEmail(r0, null, []).text) && /could not be attached/.test(earningsReportEmail(r0, null, [], { deck: true }).text));
  const run = readFileSync("lib/alerts-run.ts", "utf8");
  check("a report alert goes as its own email, the earnings report attached as a PDF once it is whole, the rest as one digest, each claimed in the registry before it is sent", /sendEarningsReport\(/.test(run) && /renderReportDocPdf\(/.test(run) && !/reactionDeck/.test(run) && /\(release\|figures\|deck\)/.test(run) && /claimMail\(/.test(run) && /releaseMail\(/.test(run) && /on conflict \(fingerprint\) do nothing/.test(readFileSync("lib/registry.ts", "utf8")));
}

// --- The commentary ----------------------------------------------------------------
const body = commentaryRequestBody(report) as { tools: { type?: string; name: string; max_uses?: number }[]; system: string; messages: { content: { text: string }[] }[] };
check("the commentary asks for the release and the call with a few searches, given the app's own figures", body.tools.some((x) => x.type === "web_search_20250305" && (x.max_uses ?? 99) <= 4 + INVESTIGATE_SEARCHES) && body.tools.some((x) => x.name === "record_results") && /never state another figure/.test(body.system) && /Revenue/.test(body.messages[0].content[0].text));
const good = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: { summary: "Growth held.", guidance: null, points: [{ line: "Cross-border rose.", source: { title: "Release", url: "https://investor.example.com/q3" } }] } }] });
const bare = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: { summary: "Growth held.", guidance: null, points: [{ line: "Cross-border rose.", source: { title: "Release", url: "not a page" } }] } }] });
check("a point is kept only with its page, the reading without it; words outside the tool are refused", good.ok && bare.ok && bare.commentary.points.length === 0 && !parseCommentaryResponse({ content: [{ type: "text", text: "Here you go" }] }).ok);
{
  // 27 Oct 2026: a commentary one character over a limit was thrown away whole ("did not fit").
  const long = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: { summary: `${"Revenue grew on cloud demand. ".repeat(40)}`, guidance: "g".repeat(900), points: JSON.stringify([{ line: "Backlog rose. ".repeat(60), source: { title: "T".repeat(300), url: "https://investor.example.com/q3" } }]), unexpected: [{ what: "Cut the dividend.", why: "To fund the buyback.", sources: [{ title: "Release", url: "https://investor.example.com/q3" }] }] } }], stop_reason: "end_turn" });
  check("an answer past a length is cut at a sentence, a list sent as text is read, and nothing is thrown away", long.ok && long.commentary.summary.length <= 700 && /\.$/.test(long.commentary.summary) && (long.commentary.guidance ?? "").length <= 500 && long.commentary.points.length === 1 && long.commentary.points[0].line.length <= 400 && long.commentary.points[0].source.title.length <= 160 && long.commentary.unexpected.length === 1);
  const cut = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: {} }], stop_reason: "max_tokens" });
  check("an answer cut before its summary says so", !cut.ok && /ran past its length/.test(cut.reason));
}
// Investigative (Hamza, 23 Oct 2026): what investors did not expect, and why the company did it.
check("investigate: the commentary carries the rule, asks why the company did what investors did not expect, and searches more for it", body.system.includes(INVESTIGATIVE) && /did not expect/.test(body.system) && /Netflix/.test(body.system) && body.tools.some((x) => x.type === "web_search_20250305" && x.max_uses === 4 + INVESTIGATE_SEARCHES));
{
  const src = { title: "Hiring record", url: "https://news.example.com/hires" };
  const surprise = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: { summary: "Growth held.", guidance: null, points: [], unexpected: [{ what: "Announced layoffs.", why: "Cut licensing staff and hired showrunners: more original content.", sources: [src] }] } }] });
  const unsourced = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: { summary: "Growth held.", guidance: null, points: [], unexpected: [{ what: "Announced layoffs.", why: "To save money.", sources: [] }] } }] });
  const many = parseCommentaryResponse({ content: [{ type: "tool_use", name: "record_results", input: { summary: "Growth held.", guidance: null, points: [], unexpected: Array.from({ length: MAX_UNEXPECTED + 1 }, () => ({ what: "x", why: "y", sources: [src] })) } }] });
  check("investigate: a finding is kept with why and its pages, left out without a page and cut at the limit; a reading kept before reads none", surprise.ok && surprise.commentary.unexpected[0].why.includes("original content") && unsourced.ok && unsourced.commentary.unexpected.length === 0 && many.ok && many.commentary.unexpected.length === MAX_UNEXPECTED && good.ok && good.commentary.unexpected.length === 0);
}


// --- How the stock took it (Hamza, 20 Oct 2026) -------------------------------------
{
  const days = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"];
  const px = [100, 101, 102, 94.86, 95];
  const closes = days.map((date, i) => ({ date, value: px[i] }));
  const spy = days.map((date, i) => ({ date, value: 500 + i }));
  const post = reactionMove({ date: "2026-10-15", time: "post" }, closes, spy, "2026-10-19")!;
  check("after the close: the report day's close to the next session's", post.from.date === "2026-10-15" && post.session === "2026-10-16" && post.movePct === -7 && post.benchmark === "SPY" && post.benchmarkPct === 0.2, JSON.stringify(post));
  const pre = reactionMove({ date: "2026-10-15", time: "pre" }, closes, null, "2026-10-19")!;
  check("before the open: the close before to the report day's own", pre.from.date === "2026-10-14" && pre.session === "2026-10-15" && pre.movePct === 0.99 && pre.benchmarkPct === null, JSON.stringify(pre));
  const unknown = reactionMove({ date: "2026-10-15", time: "unknown" }, closes, spy, "2026-10-19")!;
  check("a time not given spans both sessions", unknown.from.date === "2026-10-14" && unknown.session === "2026-10-16");
  check("nothing until that session's close is final", reactionMove({ date: "2026-10-15", time: "post" }, closes, spy, "2026-10-15") === null && reactionMove({ date: "2026-10-19", time: "post" }, closes, spy, "2026-10-19") === null);
  check("the move in words, against SPY", reactionWords(post) === "Fell 7.0% to 94.86 on 16 Oct 2026, the first session on the results; SPY +0.2% over the same sessions." && /after the close of the session after 15 Oct 2026/.test(reactionWaits({ date: "2026-10-15", time: "post" })), reactionWords(post));
  const withMove = { ...report, reaction: null };
  check("a read report is owed its reaction for a week, then not; the filings are not read again for it", reactionDue(withMove, "2026-10-20") && !reactionDue(withMove, "2026-10-30") && !reactionDue({ ...withMove, reaction: { ...post, why: null, points: [], note: null } }, "2026-10-20") && !reactionDue({ ...withMove, status: "failed" }, "2026-10-20") && contentDue(report, "2026-10-20") === !report.detail && reportDue(withMove, "2026-10-20"));
  const rb = reactionRequestBody(report, post) as { tools: { type?: string; name: string; max_uses?: number }[]; system: string; messages: { content: { text: string }[] }[] };
  check("investigate: why the shares moved asks why the company did what investors reacted to", rb.system.includes(INVESTIGATIVE));
  check("why asks that day's pages, given the app's own move", rb.tools.some((x) => x.type === "web_search_20250305" && (x.max_uses ?? 99) <= 4) && rb.tools.some((x) => x.name === "record_reaction") && /never state another move/.test(rb.system) && /Fell 7\.0%/.test(rb.messages[0].content[0].text));
  const why = parseReactionResponse({ content: [{ type: "tool_use", name: "record_reaction", input: { why: "Management would not confirm next year's growth.", points: [{ line: "Guidance withheld.", source: { title: "Report", url: "https://news.example.com/a" } }] } }] });
  {
    const nope = parseReactionResponse({ content: [{ type: "tool_use", name: "record_reaction", input: { why: "x", points: [{ line: "y", source: { title: "t", url: "nope" } }] } }] });
    const long = parseReactionResponse({ content: [{ type: "tool_use", name: "record_reaction", input: { why: "Guidance disappointed. ".repeat(60), points: [] } }] });
    check("a point is kept only with its page, the why without it, cut to its length; words outside the tool are refused", why.ok && nope.ok && nope.points.length === 0 && long.ok && long.why.length <= 700 && !parseReactionResponse({ content: [{ type: "text", text: "It fell." }] }).ok);
  }
  const ui = read("components/earnings/report.tsx");
  const run = read("lib/earnings-run.ts");
  check("the report shows how the stock took it right after what was filed, and the run reads it after the session closes", /<ReactionBlock r=\{r\} className="mt-5" \/>/.test(ui) && /withReaction\(report, provider, now\)/.test(run) && /16 \* 60 \+ 20/.test(run) && /if \(before && !contentDue\(before, ny\.date, now\.toISOString\(\)\)\) report = before;/.test(run));
}

// --- The demo ----------------------------------------------------------------------
const demo = demoEarnings(JSON.parse(read("data/samples/earnings.json")), "2026-10-15");
check("the demo's sample validates and keeps its days around today, on weekdays", demo.calendar.rows.length > 10 && demo.calendar.rows.every((r) => ![0, 6].includes(new Date(`${r.date}T00:00:00Z`).getUTCDay())) && demo.file.reports.length === 13 && demo.calendar.rows.some((r) => r.date === "2026-10-16"));
check("weekdays from today skip the weekend", weekdayFrom("2026-10-16", 1) === "2026-10-19" && weekdayFrom("2026-10-19", -1) === "2026-10-16" && weekdayFrom("2026-10-17", 0) === "2026-10-19" && addDays("2026-12-31", 1) === "2027-01-01");
check(
  "the demo's reports say they are fictional, every reading on them says so too, and a reaction is to the session that traded on the report",
  demo.file.reports.every((r) => /fictional/i.test(r.sentence ?? "") && (r.commentary === null || /fictional/i.test(r.commentary.summary)) && (!r.reaction?.why || /fictional/i.test(r.reaction.why)) && (!r.call || /fictional/i.test(`${r.call.from} ${r.call.note ?? ""}`))) &&
    demo.file.reports.some((r) => r.time === "pre" && r.reaction?.session === r.date) &&
    demo.file.reports.some((r) => r.time === "post" && r.reaction?.session === weekdayFrom(r.date, 1) && r.reaction.from.date === r.date),
);

// --- Where it lives ----------------------------------------------------------------
check("Earnings lists what the person's own Claude read after each results and lays it on the report and its thesis page (Hamza, 26 Oct 2026)", /resultsToRead\(v\.file, theses, today\)/.test(read("app/(app)/earnings/page.tsx")) && /added=\{chosenReads\}/.test(read("app/(app)/earnings/page.tsx")) && /Added to the thesis since the results/.test(read("components/earnings/report.tsx")) && /d\?\.added/.test(read("lib/earnings-doc.ts")) && /withThesisReads\(file, theses, today\)/.test(read("lib/earnings-run.ts")) && /added: addedReads\(addedSince\(thesis, e\.date\)\)/.test(read("lib/earnings-run.ts")));
check("the Earnings screen has the way to the calendar, the reports after the results, what was read after them, their decks and the form; no Coming up list, and the month is the Calendar's, one for every date (Hamza, 19, 26 and 27 Oct 2026)", SCREENS.earnings.href === "/earnings" && SCREENS.earnings.slots.join(",") === "earnings_calendar,earnings_reports,earnings_reads,earnings_decks,earnings_add" && !/Coming up/.test(read("app/(app)/earnings/page.tsx")) && /\/calendar#econ-calendar/.test(read("app/(app)/earnings/page.tsx")) && !/EarningsMonth/.test(read("app/(app)/earnings/page.tsx")));
check("a person's added companies are kept in their preferences, files from before reading as none", preferencesSchema.parse({ ...DEFAULT_PREFERENCES, earnings: undefined }).earnings.length === 0);
const feed = read("lib/markets-feed.ts");
check("the calendar is read from the market feed, the date alone in the address", /api\.nasdaq\.com\/api\/calendar\/earnings\?date=\$\{date\}`/.test(feed) && !/api\.nasdaq\.com/.test(read("lib/earnings.ts")));
const alertsRun = read("lib/alerts-run.ts");
check("the twice-daily check lays the day-before alerts and the reports on the alerts, and keeps them when the calendar could not be read", /earningsNotices\(entries, today\)/.test(alertsRun) && /reportNotices\(kept, today\)/.test(alertsRun) && /calendar \? \[\] : licensed \? \[EARNINGS_PREFIX\] : \[EARNINGS_PREFIX, REPORT_PREFIX\]/.test(alertsRun));
check("a screen that did not read the calendar keeps those alerts as they were", /src\.earnings \? \[\] : \[EARNINGS_PREFIX, REPORT_PREFIX\]/.test(read("lib/screen-data.ts")));
const sync = read("lib/daily-sync.ts");
check("the morning refresh reads the results before the filings, so the class before is the last figures'", sync.indexOf("readEarningsInto") > 0 && sync.indexOf("readEarningsInto") < sync.indexOf("readFilingsInto"));
check("the evening read writes the day's reports and alerts at once", /readEarningsInto\(vault, now\)/.test(read("lib/market-recap-run.ts")));
const run = read("lib/earnings-run.ts");
check("the commentary is refused with a sentence on a provider that cannot search the web", /providerCannot\(provider, "web_search"\)/.test(run));
check("the run reads the release once per filing on the person's own provider, at the release stage or for a 6-K filer, checks it against the text, and reuses the read for the same release", /readReleaseFigures\(/.test(run) && /releaseDocuments\(/.test(run) && /checkReleaseRead\(/.test(run) && /prev\.release\?\.url === around\.release\.url/.test(run) && /status === "release" \|\| around\.foreign/.test(run) && /releaseRequestBody\(/.test(run));
check("the run reads a 6-K filer's earlier quarters from their own releases, a few per run, a 6-K that is not results remembered, and the series is part of what makes a report the same", /readEarlierReleases\(/.test(run) && /looksLikeResults\(text, key\)/.test(run) && /reads >= EARLIER_RELEASES_PER_RUN/.test(run) && /tried\.push\(cand\.accession\)/.test(run) && /around\.foreign && around\.release/.test(run) && /r\.detail\?\.quarters \?\? null/.test(read("lib/earnings.ts")) && /earlierNote/.test(read("components/earnings/report.tsx")));
check("the release's documents are fetched in lib/edgar.ts alone, the CIK and the accession alone in the address", /export async function releaseDocuments\(/.test(read("lib/edgar.ts")) && !/Archives\/edgar/.test(read("lib/earnings.ts")));
check("the screen names where the figures came from and shows the quarter before", /figuresFrom === "release"/.test(read("components/earnings/report.tsx")) && /Quarter before/.test(read("components/earnings/report.tsx")) && /figures from the release/.test(read("components/earnings/decks.tsx")));

// Post-earnings decks: each holding's latest, every earlier one by company, made from the kept report alone.

// The income flow (Hamza, 5 Nov 2026): one model and one layout for the report, the company page and the book's look-through.
function flowChecks() {
  const meta = { label: "Q3 2026", basis: "quarter" as const, currency: "USD", from: "filing" as const };
  const ms = buildFlow({ revenue: 100e9, costOfRevenue: 30e9, rnd: 15e9, sellingMarketing: 10e9, generalAdmin: 5e9, operatingIncome: 40e9, taxExpense: 6e9, netIncome: 33e9 }, { revenue: 80e9, grossProfit: 54e9, operatingIncome: 30e9, netIncome: 25e9 }, meta, { kind: "segment", lines: [{ name: "Cloud", value: 50e9 }, { name: "Productivity", value: 30e9 }, { name: "Personal computing", value: 20e9 }] })!;
  check("flow: gross profit from the cost of revenue, the operating expenses in their filed parts, tax and the rest below operating income", ms.grossProfit === 70e9 && ms.opex.map((x) => x.name).join(",") === "Research and development,Sales and marketing,General and administrative" && ms.taxExpense === 6e9 && ms.otherCosts === 1e9 && ms.revenueGrowthPct === 25 && ms.sources.length === 3 && ms.sourcesKind === "segment", JSON.stringify({ o: ms.opex, oc: ms.otherCosts, g: ms.revenueGrowthPct }));
  check("flow: margins against a year before in points", flowLines(ms).some((l) => l.label === "Gross profit" && /70\.0% margin, \+2\.5 pts y\/y/.test(l.detail ?? "")), JSON.stringify(flowLines(ms).find((l) => l.label === "Gross profit")));
  const parts = buildFlow({ revenue: 100, grossProfit: 60, rnd: 10, sga: 20, operatingIncome: 20, netIncome: 15 }, null, meta)!;
  check("flow: parts that do not fill the operating expenses leave the rest named", parts.opex.map((x) => `${x.name}:${x.value}`).join(",") === "Research and development:10,Selling, general and administrative:20,Other operating:10", JSON.stringify(parts.opex));
  const noGross = buildFlow({ revenue: 100, operatingIncome: 30, netIncome: 22 }, null, meta)!;
  check("flow: a filer with no gross profit line reaches operating income straight from revenue", noGross.grossProfit === null && noGross.directCosts === 70 && noGross.directOperating === 30, JSON.stringify(noGross));
  const loss = buildFlow({ revenue: 100, grossProfit: 40, operatingIncome: -12, netIncome: -15 }, null, meta)!;
  check("flow: a loss ends the flow where it occurs, said in words", flowLayout(loss).words.some((w) => /Operating loss of/.test(w)) && !flowLayout(loss).nodes.some((n) => n.name === "Net income"), flowLayout(loss).words.join(" "));
  check("flow: no revenue, no flow; sources that do not add up to revenue are not drawn", buildFlow({ revenue: 0 }, null, meta) === null && flowSources(100, [{ name: "A", value: 30 }, { name: "B", value: 20 }]).length === 0 && flowSources(100, [{ name: "A", value: 60 }, { name: "B", value: 40 }]).length === 2);
  check("flow: past six sources the rest are one Other", flowSources(100, Array.from({ length: 9 }, (_, i) => ({ name: `S${i}`, value: i < 8 ? 12 : 4 }))).at(-1)?.name === "Other" && flowSources(100, Array.from({ length: 9 }, (_, i) => ({ name: `S${i}`, value: i < 8 ? 12 : 4 }))).length === 7);
  // Segments: a quarter, a year, or four quarters summed for the twelve months.
  const q = (end: string, a: number, b: number) => ({ end, total: a + b, derived: false, lines: [{ name: "Cloud", value: a }, { name: "Ads", value: b }] });
  const history = { segment: { quarters: [q("2025-09-30", 8, 10), q("2025-12-31", 9, 10), q("2026-03-31", 9, 11), q("2026-06-30", 10, 11), q("2026-09-30", 11, 12)], years: [] }, product: null, accessions: [], currency: "USD", readAt: "2026-11-01", note: null } as unknown as Parameters<typeof segmentSources>[0];
  const ttm = segmentSources(history, "2026-09-30", "ttm");
  const one = segmentSources(history, "2026-09-30", "quarter");
  check("flow: the twelve months' segments sum four quarters; a quarter's grow on the same quarter a year before", ttm?.lines.find((l) => l.name === "Cloud")?.value === 39 && ttm?.lines.find((l) => l.name === "Ads")?.value === 44 && one?.lines.find((l) => l.name === "Cloud")?.growthPct === 37.5, JSON.stringify({ ttm, one }));
  check("flow: a twelve months with a quarter missing has no segments", segmentSources(history, "2026-12-31", "ttm") === null);
  // From the series a filings entry keeps (an entry read before the flows were kept, and the demo).
  const table = { cols: ["Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"], rows: [{ key: "revenue", values: [80, 85, 88, 92, 100] }, { key: "grossMarginPct", values: [60, 61, 62, 63, 65] }, { key: "operatingIncome", values: [20, 21, 22, 24, 28] }, { key: "netIncome", values: [15, 16, 17, 18, 21] }] };
  const fs = flowFromSeries(table, "quarter", "USD", { ...history!, segment: { quarters: [q("2026-09-30", 60, 40)], years: [] } } as typeof history)!;
  check("flow: from the kept quarters, gross profit from the margin, growth on the same quarter a year before, segments by the quarter's end", fs.label === "Q3 2026" && fs.grossProfit === 65 && fs.revenueGrowthPct === 25 && fs.sources.length === 2, JSON.stringify({ l: fs.label, g: fs.grossProfit, r: fs.revenueGrowthPct, s: fs.sources }));
  const years = { cols: ["2024", "2025", "TTM to 2026Q3"], rows: [{ key: "revenue", values: [300, 340, 360] }, { key: "netIncome", values: [40, 50, 60] }] };
  const net = flowFromSeries(years, "ttm", "USD")!;
  const netLay = flowLayout(net);
  check("flow: from the years table, the twelve months; a filer with only net income draws revenue to net income and the rest", net.label === "Twelve months to Q3 2026" && netLay.nodes.some((n) => n.name === "Net income") && netLay.nodes.some((n) => n.name === "Costs, tax and other"), netLay.nodes.map((n) => n.name).join(","));
  check("flow: an annual filer's last year against the year before", flowFromSeries({ cols: ["2024", "2025"], rows: years.rows }, "ttm", "EUR")?.label === "Fiscal 2025" && flowFromSeries({ cols: ["2024", "2025"], rows: years.rows }, "ttm", "EUR")?.revenueGrowthPct === 13.3);
  // The book's look-through: each holding's share of its company, sized by value over price to sales.
  const a = buildFlow({ revenue: 1000, grossProfit: 600, operatingIncome: 300, netIncome: 200, taxExpense: 50 }, null, { ...meta, basis: "ttm" })!;
  const b = buildFlow({ revenue: 500, operatingIncome: 100, netIncome: 80 }, null, { ...meta, basis: "ttm" })!;
  const look = lookThroughFlow([{ symbol: "AAA", value: 100, psRatio: 2, flow: a }, { symbol: "BBB", value: 50, psRatio: 5, flow: b }, { symbol: "CCC", value: 30, psRatio: null, flow: a }])!;
  check("flow: the look-through is each holding's revenue share, value over price to sales, its lines scaled and summed, the holdings as sources", Math.abs(look.revenue - 60) < 1e-9 && look.sources.map((x) => `${x.name}:${x.value}`).join(",") === "AAA:50,BBB:10" && Math.abs((look.operatingIncome ?? 0) - 17) < 1e-9 && Math.abs((look.netIncome ?? 0) - 11.6) < 1e-9 && look.notes.some((n) => /CCC/.test(n)) && look.notes.some((n) => /BBB/.test(n) && /gross profit/.test(n)), JSON.stringify({ r: look.revenue, s: look.sources, o: look.operatingIncome, n: look.netIncome, notes: look.notes }));
  check("flow: a book with no flow to read has none", lookThroughFlow([{ symbol: "AAA", value: 100, psRatio: null, flow: a }]) === null);
  // The layout: no two words meet, at the narrowest width and the report's.
  const overlaps = (f: typeof ms, w: number) => {
    const g = flowLayout(f, w);
    const box = g.texts.map((t) => {
      const wd = t.text.length * t.size * 0.6;
      const x0 = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - wd : t.x - wd / 2;
      return { x0, x1: x0 + wd, y0: t.y - t.size, y1: t.y, t: t.text };
    });
    const hit: string[] = [];
    for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) if (box[i].x0 < box[j].x1 - 1 && box[j].x0 < box[i].x1 - 1 && box[i].y0 < box[j].y1 - 1 && box[j].y0 < box[i].y1 - 1) hit.push(`${box[i].t} / ${box[j].t}`);
    return { hit, g };
  };
  // The showcase's AMZN, with three segments, other income and the operating expenses in one line.
  const amzn = JSON.parse(readFileSync("data/samples/showcase.filings.json", "utf8")).bySymbol.AMZN;
  const amznFlow = (amzn.flows?.quarter ?? flowFromSeries(amzn.quarters, "quarter", amzn.currency ?? "USD", amzn.segmentHistory)) as typeof ms;
  for (const [name, f] of [["company", ms], ["look-through", look], ["no gross", noGross], ["showcase AMZN", amznFlow]] as const) {
    for (const w of [FLOW_COMPACT_WIDTH, 340, FLOW_MIN_WIDTH, 760]) {
      const { hit, g } = overlaps(f, w);
      const out = g.texts.filter((t) => {
        const wd = t.text.length * t.size * 0.6;
        const x0 = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - wd : t.x - wd / 2;
        return x0 < -1 || x0 + wd > g.width + 1 || t.y - t.size < -1 || t.y > g.height + 2;
      });
      check(`flow layout (${name}, ${w}px): no two words meet and every word is inside the picture`, g.width === w && hit.length === 0 && out.length === 0, [...hit.slice(0, 3), ...out.slice(0, 3).map((t) => `out: ${t.text}`)].join(" · "));
    }
  }
  const phone = flowLayout(ms, 330);
  const full = flowLayout(ms, 760);
  check("flow layout: narrower than the full flow it is drawn compact, each node's name and value alone, the margins and growth left to the table view", phone.width === 330 && !phone.texts.some((t) => /margin|y\/y|of revenue/.test(t.text)) && full.texts.some((t) => /margin/.test(t.text)) && phone.nodes.length === full.nodes.length);
  const lay = flowLayout(ms, 760);
  const rev = lay.nodes.find((n) => n.id === "rev")!;
  const gross = lay.nodes.find((n) => n.id === "gross")!;
  check("flow layout: each node as tall as its value at one scale", Math.abs(gross.h / rev.h - 0.7) < 0.02, `${gross.h}/${rev.h}`);
  return ms;
}
const flowSample = flowChecks();

// What lies behind the flow's lines (Hamza, 5 Nov 2026: "justify anything that needs justification ... for the expenses showing what the company said about why they are spending this much and where is it all going").
const notedFlow = (() => {
  const meta = { label: "Q3 2026", basis: "quarter" as const, currency: "USD", from: "filing" as const };
  const f = buildFlow({ revenue: 100e9, costOfRevenue: 40e9, rnd: 18e9, sellingMarketing: 8e9, generalAdmin: 4e9, operatingIncome: 30e9, taxExpense: 1e9, netIncome: 25e9 }, { revenue: 80e9, costOfRevenue: 30e9, rnd: 12e9, sellingMarketing: 7e9, generalAdmin: 4e9, operatingIncome: 27e9, netIncome: 22e9 }, meta, { kind: "segment", lines: [{ name: "Cloud", value: 60e9, growthPct: 50 }, { name: "Ads", value: 40e9, growthPct: 22 }] })!;
  const asks = flowAsks(f);
  const lines = asks.map((a) => a.line);
  check("flow notes: every expense the flow draws is asked about first, the fastest-growing named so, then the cost of revenue, a segment apart from the whole, the tax rate and the operating margin", f.opex.find((p) => p.name === "Research and development")?.growthPct === 50 && lines.slice(0, 3).join(",") === "Research and development,Sales and marketing,General and administrative" && lines.includes("Cost of revenue") && lines.includes("Cloud") && !lines.includes("Ads") && lines.length <= MAX_FLOW_NOTES && /faster than revenue/.test(asks[0].asks) && /\+50\.0% on a year against revenue \+25\.0%/.test(asks[0].figures) && /narrowed/.test(asks.find((a) => a.line === "Cost of revenue")!.asks), JSON.stringify(asks));
  const tax = flowAsks({ ...f, sources: [], opex: [] }).find((a) => a.line === "Tax");
  check("flow notes: a tax rate out of the ordinary is asked about; a look-through is many companies and is not asked about", !!tax && /low/.test(tax.asks) && flowAsks({ ...f, from: "lookthrough" }).length === 0, JSON.stringify(tax));
  const key = flowKey(f, "call-1");
  const kept = flowNotesSchema.parse({ key, at: "2026-11-05T10:00:00.000Z", notes: [{ line: "Research and development", why: "Hiring for the AI models.", from: "call" }] });
  check("flow notes: owed when missing, written from another flow or call, or failed a day ago; not owed again for the same flow and call", flowNotesDue(f, null, "call-1", "2026-11-05T11:00:00Z") && !flowNotesDue(f, kept, "call-1", "2026-11-05T11:00:00Z") && flowNotesDue(f, kept, "call-2", "2026-11-05T11:00:00Z") && flowNotesDue({ ...f, from: "release" }, kept, "call-1", "2026-11-05T11:00:00Z") && !flowNotesDue(f, flowNotesFailed(key, "2026-11-05T10:00:00.000Z", "No."), "call-1", "2026-11-05T20:00:00Z") && flowNotesDue(f, flowNotesFailed(key, "2026-11-05T10:00:00.000Z", "No."), "call-1", "2026-11-06T11:00:00Z") && !flowNotesDue(null, null, null, "2026-11-05T11:00:00Z"));
  const material = { facts: "Company: Example (EX).", release: "Research and development expenses were $18.0 billion, up 50%, driven by headcount growth in AI and higher compute costs for training models. We expect capital expenditures of $40 billion this year.", call: "Our CFO said we added 3,000 engineers this quarter, mostly in model training.", reading: null };
  const body = flowNotesRequestBody({ symbol: "EX", name: "Example", quarter: "Q3", date: "2026-10-29" }, f, asks, material, "claude-sonnet", true) as { system: string; tools: { name?: string; type?: string; max_uses?: number }[]; tool_choice?: { type: string }; messages: { content: { text: string }[] }[] };
  check("flow notes: one call with the lines and the app's figures, the release and the call, a few searches, investigative, never a forced tool", body.tools.some((t) => t.name === "record_flow_notes") && body.tools.some((t) => t.type?.startsWith("web_search") && t.max_uses === 4) && body.tool_choice?.type === "auto" && body.system.includes(INVESTIGATIVE) && /Never quote the call/.test(body.system) && body.messages[0].content[0].text.includes("1. Research and development") && body.messages[0].content[0].text.includes("headcount growth in AI"));
  const answer = (notes: unknown[]) => ({ content: [{ type: "tool_use", name: "record_flow_notes", input: { notes } }] });
  const parsed = parseFlowNotes(answer([
    { line: "research and development", why: "Spending rose 50% as the company hired for AI and paid more for compute to train its models.", where: "Engineers in model training, about 3,000 added this quarter.", said: "driven by headcount growth in AI and higher compute costs for training models", from: "release" },
    { line: "Sales and marketing", why: "Campaigns ran in 12 new markets.", where: null, said: null, from: "web", url: "https://example.com/news", title: "Example's campaign" },
    { line: "General and administrative", why: "Legal costs rose.", where: null, said: "We fought a case.", from: "call" },
    { line: "Cost of revenue", why: "Data centres.", where: null, said: null, from: "web", url: "http://example.com/x", title: "x" },
    { line: "Payroll", why: "Not asked.", from: "release" },
    { line: "Research and development", why: "A repeat.", from: "release" },
  ]), asks, material, "https://www.sec.gov/Archives/edgar/data/1/000/ex99.htm");
  const n = parsed.ok ? parsed.notes : [];
  check("flow notes: read item by item; a line not asked, a repeat, a web note without an https page and a figure no source prints are dropped and counted", parsed.ok && n.length === 2 && parsed.dropped === 4 && n[0].line === "Research and development" && n[1].line === "General and administrative", JSON.stringify(parsed));
  check("flow notes: a quote is kept only when the release prints it word for word; the call is never quoted; a release note links the release", n[0].said === "driven by headcount growth in AI and higher compute costs for training models" && n[0].source?.url.includes("sec.gov") === true && n[1].said === null && n[1].source === null, JSON.stringify(n));
  check("flow notes: an answer in words, or one whose notes all fail, is a reason and no notes", !parseFlowNotes({ content: [{ type: "text", text: "Here." }] }, asks, material, null).ok && !parseFlowNotes(answer([{ line: "Payroll", why: "x", from: "release" }]), asks, material, null).ok);
  return { flow: f, notes: flowNotesSchema.parse({ key, at: "2026-11-05T10:00:00.000Z", notes: n }) };
})();

// Every row a year before can be set against has its change (Hamza, 5 Nov 2026, TIC's and IMAX's emails): a margin in points, a figure over a loss a year before in its own units.
{
  const c = (now: string, before: string | null, changePct: number | null = null) => figureChange({ now, before, changePct });
  check("a figure's change: percent on a positive base, points for a margin, the move in its own units over a loss, nothing without a year before",
    c("639.6m", "473.9m", 35)?.text === "+35.0%" && c("639.6m", "473.9m", 35)?.up === true &&
    c("35.4%", "32.2%")?.text === "+3.2 pts" && c("2.5%", "-1.4%")?.text === "+3.9 pts" && c("27.2%", "42.9%")?.up === false &&
    c("16.0m", "-6.5m")?.text === "+22.5m" && c("-11.1m", "-13.9m")?.text === "+2.8m" && c("-11.1m", "-13.9m")?.up === true &&
    c("-0.12", "-0.40")?.text === "+0.28" && c("1.20bn", "-300.0m")?.text === "+1.50bn" &&
    c("16.0m", null) === null && c("35.4%", "16.0m") === null && c("40.0%", "40.0%")?.up === null,
    JSON.stringify([c("16.0m", "-6.5m"), c("35.4%", "32.2%"), c("1.20bn", "-300.0m")]));
  const html = earningsReportEmail({ ...file.reports[0], figures: [{ label: "Gross margin", now: "35.4%", before: "32.2%", changePct: null, prior: null }, { label: "Operating income", now: "16.0m", before: "-6.5m", changePct: null, prior: null }] }, null, []).html;
  check("the email's Change column carries those changes", /\+3\.2 pts/.test(html) && /\+22\.5m/.test(html));
}

async function deckChecks() {
  const ma = demo.file.reports.find((r) => r.symbol === "MA")!;
  const asml = demo.file.reports.find((r) => r.symbol === "ASML")!;
  const older = { ...ma, date: "2026-07-30", quarter: "Jun/2026", headline: "No kill signal met; no decision owed." };
  const waiting = { ...ma, symbol: "NVO", date: "2026-11-05", status: "waiting" as const };
  const watched = { ...asml, symbol: "SPOT", kind: "watch" as const };
  const d = decksBy({ ...demo.file, reports: [ma, older, asml, waiting, watched] });
  const dates = d.latest.map((r) => r.date);
  check("every company's latest deck, the watchlist's too, newest results first; a report still waiting has none", d.latest.map((r) => r.symbol).sort().join(",") === "ASML,MA,SPOT" && dates.every((x, i) => i === 0 || x <= dates[i - 1]) && !d.all.some((g) => g.symbol === "NVO"), JSON.stringify(d.latest.map((r) => `${r.symbol}:${r.date}`)));
  const late = decksBy({ ...demo.file, reports: [ma, { ...asml, symbol: "META", date: "2099-01-02" }, { ...asml, symbol: "SPOT", kind: "watch" as const, date: "2099-01-03" }] });
  check("the chips run newest first: a later report sits left of an earlier one, held or watched", late.all.map((g) => g.symbol).join(",") === "SPOT,META,MA" && late.latest.map((r) => r.symbol).join(",") === "SPOT,META,MA", late.all.map((g) => g.symbol).join(","));
  check("All decks keeps every earlier deck per company, newest first within it", d.all.find((g) => g.symbol === "MA")!.reports.map((r) => r.date).join(",") === `${ma.date},2026-07-30`);
  // The earnings report (Hamza, 4 Nov 2026): pages of blocks, drawn as a page in the app and as a PDF, never a page of "n/a".
  type R = typeof ma;
  const docOf = (r: R) => earningsDoc(r, "Sample methodology");
  const keysOf = (r: R) => docOf(r).pages.map((p) => p.key as string);
  const pageOf = (r: R, k: string) => {
    const p = docOf(r).pages.find((x) => x.key === k);
    return p ? pageTexts(p).join(" | ") : "";
  };
  const doc = docOf(ma);
  const keys = doc.pages.map((p) => p.key as string);
  const order = EARNINGS_DOC_PAGES as readonly string[];
  check("the earnings report opens on the headline and ends on its sources, its pages in the ontology's order, drawing only what the report has", keys[0] === "cover" && keys.at(-1) === "sources" && keys.every((k, i) => i === 0 || order.indexOf(k) > order.indexOf(keys[i - 1])) && keys.length >= 6 && EARNINGS_DOC.every((x) => x.what.length > 3 && x.reads.length > 0) && order.length === EARNINGS_DOC.length, keys.join(","));
  check("no page shows n/a, a blank figure or a word for a missing one", ![doc, docOf(asml)].some((x) => /\bn\/a\b|not read|to come|\bundefined\b/i.test(docText(x)) || /\bNaN\b/.test(docText(x))), docText(doc).match(/.{0,40}(\bn\/a\b|not read|to come|\bundefined\b).{0,40}/i)?.[0] ?? "");
  check("a release with no figures yet and no detail draws no results page", !keysOf({ ...asml, figures: [], detail: null, releaseFigures: null }).includes("results"));
  // The quarter from the release (16 Oct 2026): the demo's ASML report is at the release stage with the release's own figures.
  check("the demo's ASML report is at the release stage with the release's figures, its quarters and KPIs built", asml.status === "release" && asml.figuresFrom === "release" && asml.releaseFigures !== null && asml.figures.some((l) => l.label === "Revenue" && l.prior !== null) && (asml.detail?.quarters?.cols.length ?? 0) >= 3 && (asml.detail?.kpis.length ?? 0) >= 1, `${asml.period} · ${asml.detail?.quarters?.cols.join(",")}`);
  check("at the release stage the report draws the quarter against the quarter before and its KPIs by quarter, naming the release", keysOf(asml).includes("kpis") && /quarter before/.test(pageOf(asml, "results")) && /release/.test(docOf(asml).pages.find((p) => p.key === "results")?.ref ?? ""), pageOf(asml, "results"));
  check("a margin that did not move reads as held, never as widened 0.0 pts", !/(widened|narrowed) 0\.0/.test(docText(doc)) && /operating margin (held|widened|narrowed)/.test(pageOf(ma, "results")), pageOf(ma, "results").slice(0, 200));
  {
    const withFlow = { ...ma, detail: { ...ma.detail!, flow: flowSample } };
    const fk = keysOf(withFlow);
    check("the earnings report draws the quarter's flow after its results, as a flow block, and the results page leaves the flow's own figures to it", EARNINGS_DOC.length === 26 && fk.indexOf("flow") === fk.indexOf("results") + 1 && docOf(withFlow).pages.find((p) => p.key === "flow")!.blocks.some((b) => b.kind === "flow") && !/\bGross margin\b/.test(pageOf(withFlow, "results").split("|").slice(0, 3).join("|")) && /operating income/.test(docOf(withFlow).pages.find((p) => p.key === "flow")!.title), `${fk.join(",")} · ${docOf(withFlow).pages.find((p) => p.key === "flow")?.title}`);
    check("a report with no flow draws no flow page", !keysOf(ma).includes("flow"));
    const noted = { ...ma, detail: { ...ma.detail!, flow: notedFlow.flow, flowNotes: notedFlow.notes } };
    const nk = keysOf(noted);
    const np = docOf(noted).pages.find((p) => p.key === "flow_notes");
    check("the notes behind the flow are their own page after it, a card per line with where it came from, and their pages among the sources", nk.indexOf("flow_notes") === nk.indexOf("flow") + 1 && np!.blocks[0].kind === "cards" && /Research and development/.test(pageOf(noted, "flow_notes")) && np!.blocks[0].kind === "cards" && np!.blocks[0].cards[0].tag === "The release" && /hired for AI/.test(pageOf(noted, "flow_notes")) && /sec\.gov/.test(JSON.stringify(docOf(noted).pages.find((p) => p.key === "sources"))) && !keysOf(withFlow).includes("flow_notes"), `${nk.join(",")} · ${pageOf(noted, "flow_notes").slice(0, 200)}`);
  }
  // The valuation's history and peers as charts (Hamza, 27 Oct 2026).
  {
    const weeks = Array.from({ length: 260 }, (_, i) => ({ date: addDays("2021-10-25", i * 7), value: i === 40 ? null : 20 + 10 * Math.sin(i / 30) }));
    const hist = deckHistory({ metric: "trailing_pe", points: weeks, now: { date: weeks.at(-1)!.date, value: weeks.at(-1)!.value! }, low: { date: weeks[141].date, value: 10.01 }, high: { date: weeks[47].date, value: 29.99 }, median: 20.4, percentile: 38, years: 5, nearLow: false, notMeaningful: 1 });
    const peers = deckPeers({ basis: { kind: "gics", label: "Semiconductor Materials & Equipment" }, words: "Peers: the 4 other companies of the S&P 500 and the Nasdaq-100 in GICS Semiconductor Materials & Equipment.", sector: "Information Technology", peers: [{ symbol: "AMAT", name: "Applied Materials", cap: 1, values: {} }], peerCount: 4, sectorCount: 70, rows: [{ field: "pe_ratio", label: "P/E", company: 31.2, peersMedian: 24.5, peersN: 4, vsPeersPct: 27, sectorWhole: 33.1, sectorMedian: 28, sectorN: 70, vsSectorPct: -6 }, { field: "ps_ratio", label: "P/S", company: 9.1, peersMedian: 6.2, peersN: 4, vsPeersPct: 46, sectorWhole: 8.4, sectorMedian: 5, sectorN: 70, vsSectorPct: 8 }], notes: [] });
    const withCharts = { ...asml, detail: { ...asml.detail!, history: hist, peers } };
    const v = docOf(withCharts).pages.find((p) => p.key === "valuation");
    const kinds = v?.blocks.map((b) => b.kind) ?? [];
    check("the valuation page draws the five-year multiple as a line and the peers beside it, from the charts' data", hist !== null && hist.points.length <= 270 && peers !== null && kinds.includes("line") && /24\.5x|peers/i.test(pageTexts(v!).join(" | ")), `${kinds.join(",")} · ${v ? pageTexts(v).join(" | ").slice(0, 240) : "no page"}`);
    check("a company not held is priced at its last close and its multiples carried to the filings' currency", /const price = held \?\? lastClose/.test(read("lib/earnings-run.ts")));
    check("the study on a report downloads as a PDF beside the embedded report, on Earnings and Theses", studyHref({ ...asml, detail: { ...asml.detail!, study: { id: "abcdefabcdef", finishedAt: "2026-10-21T06:00:00.000Z", question: "", sections: [] } } }) === "/research/abcdefabcdef/pdf" && studyHref({ ...asml, detail: { ...asml.detail!, study: null } }) === null && /studyHref\(latest\)/.test(read("components/earnings/decks.tsx")) && /studyHref\(report\)/.test(read("components/theses/deck-embed.tsx")) && /study\.forResults/.test(read("app/(app)/research/[id]/pdf/route.ts")));
    check("no peers read leaves the history beside today's multiples, never an empty chart", deckPeers({ ...peers!, rows: [{ field: "pe_ratio", label: "P/E", company: 31, peersMedian: null, peersN: 0, vsPeersPct: null, sectorWhole: null, sectorMedian: null, sectorN: 0, vsSectorPct: null }] } as never) === null);
  }
  const found = { summary: "Growth held.", guidance: null, points: [], unexpected: [{ what: "Announced layoffs", why: "It let licensing staff go and hired showrunners, to make more original content.", sources: [{ title: "Hiring record", url: "https://news.example.com/hires" }] }] };
  const hl = pageOf({ ...asml, commentary: found }, "highlights");
  check("investigate: the report draws what investors did not expect and why", /Announced layoffs/.test(hl) && /showrunners/.test(hl), hl);
  const fy = (name: string, vals: Record<string, number>, unit = "EUR") => ({ [name]: { units: { [unit]: Object.entries(vals).map(([y, val]) => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, fy: Number(y), fp: "FY", form: "20-F", filed: `${Number(y) + 1}-02-10` })) } } });
  const annual = factsTable({ cik: 2, entityName: "Nordlicht NV (fictional)", facts: { "ifrs-full": { ...fy("Revenue", { 2023: 20e9, 2024: 24e9, 2025: 30e9 }), ...fy("ProfitLoss", { 2024: 6e9, 2025: 8e9 }) } } });
  const annualYears = studyTable(annual);
  check("an annual filer's years table carries its years alone, never the last year again as the trailing period", annual.basis === "annual" && annualYears.cols.join(",") === "2023,2024,2025" && annualYears.rows.every((r) => r.values.length === 3) && annualYears.rows.find((r) => r.key === "revenue")?.values.join(",") === "20000000000,24000000000,30000000000" && studyTable(t).cols.length === t.years.length + 1, annualYears.cols.join(","));
  const keptYears = { cols: ["2023", "2024", "2025", "FY2025"], rows: [{ key: "revenue", label: "Revenue", unit: "money" as const, values: [20e9, 24e9, 30e9, 30e9] }] };
  const trimmed = withoutRepeatedYear(keptYears);
  check("a report kept with the repeated column drops it, and leaves a trailing twelve months alone", trimmed?.cols.join(",") === "2023,2024,2025" && trimmed.rows[0].values.length === 3 && withoutRepeatedYear({ ...keptYears, cols: ["2023", "2024", "2025", "TTM to 2026Q2"] })?.cols.length === 4 && withoutRepeatedYear(null) === null && /withoutRepeatedYear\(r\.detail\.years\)/.test(read("lib/earnings-doc.ts")));
  const noYears = { ...asml, detail: { ...asml.detail!, years: null } };
  check("with no annual facts the report draws the quarters the release printed and no years page", !keysOf(noYears).includes("record") && keysOf(noYears).includes("kpis") && keysOf(asml).includes("record"));
  // The thesis page scores the pillars from Theses and the valuation page draws your DCF beside your cases.
  const withThesis = { ...ma, detail: { ...ma.detail!, pillars: [{ name: "Network growth", text: "Revenue compounds.", tag: "supported" as const, words: "12.1% against 10%." }, { name: "Cash conversion", text: "FCF matches net income.", tag: "risk" as const, words: "0.7 against 0.9." }], dcf: { basis: "cash_flow" as const, asOf: "2026-10-09", currency: "USD", priceCurrency: "USD", price: 585, perShare: { bear: 420, base: 610, bull: 820 }, vsPricePct: { bear: -28.2, base: 4.3, bull: 40.2 }, sensitivity: { waccs: [8, 9, 10, 11], terminals: [2.5, 3, 3.5], values: [[700, 740, 790], [580, 610, 640], [490, 510, 530], [420, 440, 455]] }, assumptions: ["Revenue 30,500m; base growth 12% fading to 5% over 9 years.", "FCF margin 46% now, settling at 47%.", "WACC 9%, terminal growth 3%.", "Cash 9,000m, debt 24,600m; 883m shares."], implied: { firstYearGrowthPct: 10.8, cagrPct: 7.9, marginPct: 45.1 }, terminalSharePct: 68 } } };
  const th = pageOf(withThesis, "thesis");
  const val = pageOf(withThesis, "valuation");
  check("the thesis page reads the pillars supported and at risk, and the valuation page names your DCF's three cases", /Network growth/.test(th) && /Cash conversion/.test(th) && /DCF.*610.*bear \$420.*bull \$820/.test(val), `${th.slice(0, 200)} || ${val.slice(0, 200)}`);
  check("without a thesis the report draws no empty thesis page", !keysOf(ma).includes("thesis") || /\w/.test(pageOf(ma, "thesis")));
  check("the results, the reaction and the sources are pages of one report under one download address", keys.includes("results") && keys.includes("reaction") && /earnings/.test(earningsDocName(ma)) && !/deck|reaction|\.pptx/.test(earningsDocName(ma)) && !/kind=reaction/.test(read("app/api/earnings/deck/route.ts")));
  // Before the filing the report is still drawn on the last filed figures (Hamza, 16 Oct 2026).
  const early = keysOf({ ...ma, status: "release", figures: [], period: null });
  check("a release with its detail draws the report on the last filed figures, never an empty skeleton", early.length >= 6 && early.includes("record") && early.at(-1) === "sources", early.join(","));
  check("the detail keeps the benchmark's weeks beside the holding's, so the scatter draws real pairs", (ma.detail?.prices?.benchCloses.length ?? 0) > 40 && ma.detail?.prices?.beta?.benchmark === "SPY");
  check("the cover's tone is the alert's: red on a kill signal met, amber when a decision is owed", deckTone({ ...ma, triggers: [{ kind: "kill", label: "x", met: true, reading: null }] }) === "danger" && deckTone({ ...ma, triggers: [], headline: "No kill signal met; the class holds." }) === "ok" && deckTone({ ...ma, triggers: [], headline: "MA fails 3.4; a decision is owed." }) === "warn");
  check("the report is a page to embed and a PDF to download, from the report's key alone", deckHref(ma) === `/api/earnings/deck?key=${encodeURIComponent(`MA:${ma.date}`)}&format=pdf` && docViewHref(ma) === `/api/earnings/deck?key=${encodeURIComponent(`MA:${ma.date}`)}`);
}

// The move the options priced before the results (Hamza, 21 Oct 2026)
{
  const chain = parseCboeChain({ data: { current_price: 101.2, options: [
    { option: "MA261023C00100000", bid: 4.1, ask: 4.3 },
    { option: "MA261023P00100000", bid: 3.0, ask: 3.2 },
    { option: "MA261023C00105000", bid: 2.0, ask: 2.2 },
    { option: "MA261016C00100000", bid: 1.5, ask: 1.7 },
    { option: "MA261016P00100000", bid: 1.0, ask: 1.2 },
    { option: "MA261030C00100000", bid: 0, ask: 0, last_trade_price: 5.5 },
    { option: "MA261030P00100000", bid: 4.0, ask: 4.4 },
  ] } });
  const x = expectedMove(chain, "MA", "2026-10-22", "post", "2026-10-21T19:00:00Z");
  check("expected move: the straddle at the strike nearest the price, in the first expiry that trades on the results, over the price", x !== null && x.expiry === "2026-10-23" && x.strike === 100 && x.straddle === 7.3 && x.pct === 7.2, JSON.stringify(x));
  check("expected move: a report after the close trades the next session, one before the open the same day", sessionOnResults("2026-10-23", "post") === "2026-10-26" && sessionOnResults("2026-10-23", "pre") === "2026-10-23" && stillBefore("2026-10-22", "post", { date: "2026-10-22", minutes: 17 * 60 }) && !stillBefore("2026-10-22", "pre", { date: "2026-10-22", minutes: 10 * 60 }));
  check("expected move: an expiry before the session is never used, and a chain with no expiry after it is no reading", expectedMove(chain, "MA", "2026-10-31", "pre", "") === null && expectedMove(chain, "MA", "2026-10-26", "pre", "")?.expiry === "2026-10-30");
  check("expected move: set against the move made, in words", /more than priced/.test(againstPriced(x!, -9.5)) && /less than priced/.test(againstPriced(x!, 2)) && /about what was priced/.test(againstPriced(x!, 7)));
  const kept = keepExpected(keepExpected([], x!, "2026-10-21"), { ...x!, pct: 8 }, "2026-10-21");
  check("expected move: one reading per report, the newest kept", kept.length === 1 && kept[0].pct === 8 && expectedFor(kept, "ma", "2026-10-22")?.pct === 8);
  const demo = demoEarnings(JSON.parse(readFileSync("data/samples/earnings.json", "utf8")), "2026-10-21");
  check("expected move: the demo's sample carries readings, and its report after the results its own", demo.file.expected.length === 3 && demo.file.reports.find((r) => r.symbol === "MA")?.expectedMove?.pct === 4.2);
  const run = readFileSync("lib/earnings-run.ts", "utf8");
  check("expected move: the run reads it in the days before each report and lays it on the report after", /readExpected\(entries/.test(run) && /expectedMove: expectedFor\(expected\.list/.test(run) && /againstPriced/.test(readFileSync("components/earnings/report.tsx", "utf8")));
}

// The call, the beats and the deck's own words (Hamza, 29 Oct 2026: guidance tested against the thesis, the call's Q&A, every beat and miss, no "...", the study's content on the slides).
async function callChecks() {
  const ma = demo.file.reports.find((r) => r.symbol === "MA")!;
  const page = { title: "Q3 call", url: "https://example.com/q3-call" };
  const lens = lensOf({ text: "Payments keep compounding.", pillars: [{ name: "Network growth", text: "Volumes grow." }], watch: ["Cross-border volume"], pathway: null }, [{ kind: "kill", label: "Revenue shrinks" }]);
  // The call without Quartr (Hamza, 4 Nov 2026): the release's own exhibits from the SEC, and on a Claude key the transcript's page read whole.
  {
    const rel = { ...ma, release: { form: "8-K", filed: ma.date, url: "https://www.sec.gov/Archives/edgar/data/1141391/000114139126000050/ma-8k.htm", period: null, accession: "0001141391-26-000050" } };
    type Body = { tools: { type?: string; name: string; max_uses?: number }[]; system: string; messages: { content: { text: string }[] }[] };
    const full = callReadRequestBody(rel, "facts", lens, [], "claude-sonnet-5-5", true, { documents: "=== ex99-2.htm ===\nCFO commentary: we expect net revenue growth at the high end of low-teens. " + "x".repeat(CALL_DOCUMENT_CHARS), fetch: true }) as Body;
    const open = callReadRequestBody(rel, "facts", lens, [], "llama-4", false, { documents: "=== ex99-1.htm ===\nOutlook unchanged.", fetch: true }) as Body;
    const bare = callReadRequestBody(rel, "facts", lens, [], "claude-sonnet-5-5", true) as Body;
    check("the call read is given the release's exhibits from the SEC under the filing's page, and on a Claude key fetches the transcript's page whole after a search", full.tools.some((t) => t.type === "web_fetch_20260209" && t.max_uses === CALL_FETCHES) && full.tools.some((t) => t.type === "web_search_20250305") && /fetch that page and read it whole/.test(full.system) && /CFO commentary: we expect/.test(full.messages[0].content[0].text) && full.messages[0].content[0].text.length < CALL_DOCUMENT_CHARS + 5000 && full.system.includes(rel.release.url) && !bare.tools.some((t) => t.type === "web_fetch_20260209") && !/documents as filed/.test(bare.messages[0].content[0].text), full.system.slice(0, 200));
    check("an open model with no web reads the release's documents alone, never fetches", !open.tools.some((t) => t.type) && /read the release's documents and the notes/.test(open.system) && /Outlook unchanged/.test(open.messages[0].content[0].text));
    check("the run reads the release's documents for the call with the person's SEC contact, and the call no longer needs Quartr to be read", /releaseMaterial\(r, contact\)/.test(read("lib/earnings-call-run.ts")) && /withCalls\(file, theses, provider, entries, today, now, contact\)/.test(read("lib/earnings-run.ts")));
  }
  const body = {
    content: [
      {
        type: "tool_use",
        name: "record_call",
        input: {
          guidance: [
            { metric: "Net revenue growth", period: "FY2026", said: "High-teens growth.", before: "Low-teens growth, July.", change: "raised", where: "call", bearsOn: "network growth", reading: "supports", why: "Growth above the pillar's level.", source: page },
            { metric: "Opex", said: "Up mid-teens.", source: null },
          ],
          qa: [{ analyst: "Jane Doe, Example Securities", asked: "Is cross-border slowing?", answered: "No, it grew 15%.", bearsOn: "Cross-border volume", reading: "supports", source: page }],
          remarks: ["Volumes grew 9%."],
          beats: [
            { line: "Net revenue", actual: "$8.6bn", expected: "$8.5bn", against: "consensus", result: "beat", by: "+1.2%", source: page },
            { line: "Adjusted EPS", actual: "$4.30", expected: "$4.31", against: "consensus", result: "inline", source: page },
            { line: "Operating margin", actual: "58%", expected: "60%", against: "guidance", result: "maybe", source: page },
          ],
        },
      },
    ],
  };
  const parsed = parseCallResponse(body, ["Network growth", "Cross-border volume"]);
  check(
    "the call is read item by item: guidance with its change and the pillar it bears on, the analysts' Q&A, every beat and miss; an item without its page or a result outside beat, miss or in line is dropped",
    parsed.ok && parsed.reading.guidance.length === 1 && parsed.reading.guidance[0].bearsOn === "Network growth" && parsed.reading.guidance[0].change === "raised" && parsed.reading.qa.length === 1 && parsed.reading.beats.length === 2 && parsed.dropped === 2,
    JSON.stringify(parsed),
  );
  const reading = parsed.ok ? parsed.reading : { guidance: [], qa: [], remarks: [], beats: [] };
  const notes = notesOf([
    { id: "e1", at: "2026-10-30T10:00:00Z", source: "Quartr transcript", summary: "Guidance raised.", changes: null, call: reading },
    { id: "e0", at: "2026-10-29T10:00:00Z", source: "Note", summary: "Old.", changes: null },
  ]);
  const fromNotes = callFromNotes(notes, lens, "2026-10-30T11:00:00Z");
  check("the call your Claude wrote through write_thesis is laid on the report as it is, beats and all, its pillars checked against the thesis", fromNotes?.from === "notes" && fromNotes.source === "Quartr transcript" && fromNotes.beats.length === 2 && fromNotes.qa[0].bearsOn === "Cross-border volume" && callKeyOf(fromNotes) === "notes:2026-10-30T11:00:00Z");
  check("the guidance reads in a line with its change", guidanceLine(reading) === "Net revenue growth (FY2026): High-teens growth, raised.", String(guidanceLine(reading)));
  const empty = { ...fromNotes!, guidance: [], qa: [], remarks: [], beats: [], from: "read" as const, at: "2026-10-30T00:00:00Z", key: "none" };
  check("a call read that came back empty is asked again after a day, and one read from the same notes is not", !callDue({ ...ma, call: empty }, "none", "2026-10-30T12:00:00Z") && callDue({ ...ma, call: empty }, "none", "2026-10-31T01:00:00Z") && callDue({ ...ma, call: empty }, "e1", "2026-10-30T12:00:00Z") && !callDue({ ...ma, call: fromNotes }, fromNotes!.key, "2026-11-30T00:00:00Z"));
  const noQa = { ...reading, from: "read" as const, source: "The AI", at: "2026-10-30T00:00:00Z", key: "none", note: null, qa: [] };
  const withQa = { ...noQa, qa: reading.qa.length ? reading.qa : [{ analyst: "A", firm: null, asked: "Q", answer: "A", bearsOn: null }] };
  const dated = { ...ma, date: "2026-10-29" };
  check("a call read with no analysts' Q&A is read again every six hours until three days after the results, and one with Q&A is not", !callDue({ ...dated, call: noQa }, "none", "2026-10-30T05:00:00Z") && callDue({ ...dated, call: noQa }, "none", "2026-10-30T07:00:00Z") && !callDue({ ...dated, call: noQa }, "none", "2026-11-02T07:00:00Z") && !callDue({ ...dated, call: withQa as typeof noQa }, "none", "2026-10-30T07:00:00Z"));
  check("no transcript service is read: API Ninjas is gone (Hamza, 9 Nov 2026)", !existsSync("lib/transcripts-feed.ts") && !existsSync("lib/transcripts.ts") && !/API_NINJAS|api-ninjas/.test(read("lib/earnings-call-run.ts")));
  const figs = [{ label: "EPS, diluted", now: "$4.38" }];
  const app = beatsOf({ figures: figs, currency: "USD", consensusEps: 4.2, estimates: 30, call: null });
  check("the app's own beat: the filed diluted EPS against Nasdaq's consensus, labelled as the analysts', a miss and in line within 1%", app.length === 1 && app[0].app && app[0].result === "beat" && /30 estimates/.test(app[0].expected) && beatsOf({ figures: figs, currency: "USD", consensusEps: 4.4, call: null })[0].result === "inline" && beatsOf({ figures: figs, currency: "USD", consensusEps: 4.6, call: null })[0].result === "miss", JSON.stringify(app));
  check("no app row when the reading has its own EPS against the consensus, or the figures are not in dollars", beatsOf({ figures: figs, currency: "USD", consensusEps: 4.2, call: { beats: reading.beats } }).every((b) => !b.app) && beatsOf({ figures: figs, currency: "EUR", consensusEps: 4.2, call: null }).length === 0);
  // No ellipsis anywhere: a cut ends at a whole sentence.
  const long = "Revenue grew 12% on volumes. Margins widened as costs fell. Cash rose. ".repeat(12);
  check("a cut ends at a sentence and never in an ellipsis", /\.$/.test(sentenceCut(long, 90)) && !/…/.test(sentenceCut(long, 90)));
  // The brief: the study's content written into the slides on the person's model.
  const bb = parseBriefResponse({ content: [{ type: "tool_use", name: "record_brief", input: { competition: { headline: "Visa is the one rival at scale.", rivals: [{ name: "Visa", competesOn: "Card networks.", position: "Larger by volume." }, { name: "", competesOn: "x", position: "y" }], points: [] }, moats: { headline: "Network effects held.", pillars: [{ name: "Network effects", strength: "strong", evidence: "Cards and acceptance grew together." }] }, swot: { strengths: ["Scale."], weaknesses: [], opportunities: ["Value-added services."], threats: ["Regulation of interchange."] }, questions: { business: "A toll on spending.", now: "Growth was raised." }, sources: [{ title: "x", url: "not a page" }] } }] });
  check("the brief keeps the rivals by name, the moat's pillars, the SWOT and the answers, and drops a rival without its name and a source without its page", bb.ok && bb.brief.competition?.rivals.length === 1 && bb.brief.moats?.pillars[0].strength === "strong" && bb.brief.swot?.threats.length === 1 && bb.brief.questions?.now === "Growth was raised." && bb.brief.sources.length === 0, JSON.stringify(bb));
  const brief = bb.ok ? { ...bb.brief, studyId: "abcdefabcdef", callKey: callKeyOf(fromNotes), at: "2026-10-30T12:00:00Z", note: null, v: BRIEF_VERSION } : null;
  const withStudy = { study: { id: "abcdefabcdef" }, brief };
  check("the brief is owed when a study is on the report and it was written from another study or call, or failed a day ago", !briefDue(withStudy, callKeyOf(fromNotes), "2026-10-31T00:00:00Z") && briefDue(withStudy, null, "2026-10-31T00:00:00Z") && briefDue({ study: { id: "bbbbbbbbbbbb" }, brief }, callKeyOf(fromNotes), "2026-10-31T00:00:00Z") && !briefDue({ study: null, brief: null }, null, "2026-10-31T00:00:00Z") && !briefHolds(briefFailed("abcdefabcdef", null, "2026-10-30T00:00:00Z", "No model.")) && briefDue({ study: { id: "abcdefabcdef" }, brief: briefFailed("abcdefabcdef", null, "2026-10-30T00:00:00Z", "No model.") }, null, "2026-10-31T01:00:00Z"));
  // The decks draw it all.
  const full = { ...ma, consensusEps: 4.2, estimates: 30, call: fromNotes, detail: { ...ma.detail!, brief: brief as never, thesis: "Payments keep compounding.", pillars: [{ name: "Network growth", text: "Volumes grow.", tag: "supported" as const, words: "12% against 10%." }] } };
  const fdoc = earningsDoc(full, "Sample methodology");
  const at = (k: string) => {
    const p = fdoc.pages.find((x) => x.key === k);
    return p ? pageTexts(p).join(" | ") : "";
  };
  check("the report draws the beats and misses, the guidance against the thesis and the call's Q&A, in its own words", /beat/i.test(at("beats")) && /guid|raised/i.test(at("guidance")) && /Example Securities/.test(at("call")), [at("beats"), at("guidance"), at("call")].map((x) => x.slice(0, 160)).join(" || "));
  check("the study's pages carry the brief's own words, never a pointer to the study", /Visa is the one rival at scale/.test(at("competition")) && /Network effects held/.test(at("moats")) && !/as the study on file reads it|study on file/i.test(docText(fdoc)), [at("competition"), at("moats")].join(" || "));
  // The reviewer gate (Hamza, 4 Nov 2026: no deck posted with "study not yet done"): the deck waits for the figures, the call, the study and its review note.
  {
    const study = { id: "abcdefabcdef", finishedAt: `${full.date}T09:00:00.000Z`, question: "", sections: [] };
    const ready = { ...full, detail: { ...full.detail!, study } };
    const day = (n: number) => addDays(full.date, n);
    const noCall = deckReadiness({ ...ready, call: null }, true, day(1));
    const noStudy = deckReadiness({ ...full, detail: { ...full.detail!, study: null } }, true, day(1));
    const oldStudy = deckReadiness({ ...full, detail: { ...full.detail!, study: { ...study, finishedAt: "2026-01-02T00:00:00.000Z" } } }, true, day(1));
    const noBrief = deckReadiness({ ...ready, detail: { ...ready.detail, brief: null } }, true, day(1));
    check("the deck is made once the figures, the call, a study since the results and its review note are in", deckReadiness(ready, true, day(1)).ready && !noCall.ready && noCall.waiting.join(",") === "call" && !noStudy.ready && noStudy.waiting.join(",") === "study" && !oldStudy.ready && !noBrief.ready && noBrief.waiting.join(",") === "brief" && !deckReadiness({ ...ready, figures: [] }, true, day(1)).waiting.includes("call"), JSON.stringify([noCall, noStudy, noBrief]));
    const flowed = { ...ready, detail: { ...ready.detail, flow: notedFlow.flow, flowNotes: null } };
    check("a report whose flow has lines to explain waits for the notes behind them; written, or with nothing to ask, it does not", deckReadiness(flowed, true, day(1)).waiting.join(",") === "flow" && deckReadiness({ ...flowed, detail: { ...flowed.detail, flowNotes: notedFlow.notes } }, true, day(1)).ready && deckReadiness({ ...flowed, detail: { ...flowed.detail, flow: { ...notedFlow.flow, from: "lookthrough" as const } } }, true, day(1)).ready && deckReadiness(flowed, false, day(1)).ready);
    check("with no model to write them, the call, the study and the note are not waited for; the figures always are", deckReadiness({ ...full, call: null, detail: { ...full.detail!, study: null, brief: null } }, false, day(1)).ready && deckReadiness({ ...full, figures: [] }, false, day(1)).waiting.join(",") === "figures");
    check(`after ${DECK_WAIT_DAYS} days the deck is made with what is on file, and a study not written within the study window is not waited for`, DECK_WAIT_DAYS === 5 && deckReadiness({ ...ready, call: null }, true, day(DECK_WAIT_DAYS)).ready && deckReadiness({ ...ready, call: null }, true, day(DECK_WAIT_DAYS)).late && !deckReadiness({ ...ready, call: null }, true, day(DECK_WAIT_DAYS - 1)).ready);
    const words = deckWaitWords(["call", "brief"]);
    const readyDoc = { at: day(1), sig: "abcd1234", ready: true, drop: [], held: [] };
    check("the screen says what the report waits for in one sentence, and nothing once it reads whole", /^The earnings report is made once .+ and .+ are in, and emailed then; after 5 days/.test(words) && DECK_NEEDS.length === 5 && deckWaiting({ ...full, status: "complete", doc: null, call: null }, true, day(1)) !== null && deckWaiting({ ...ready, status: "complete", doc: readyDoc }, true, day(1)) === null && /read through before it is sent/.test(deckWaiting({ ...ready, status: "complete", doc: { ...readyDoc, ready: false, held: ["x"] } }, true, day(1)) ?? ""), words);
    const kept = { ...ready, status: "complete" as const, date: "2026-11-05", updatedAt: "2026-11-05T22:00:00.000Z", doc: { ...readyDoc, at: "2026-11-07T08:00:00.000Z" } };
    const notes = reportNotices({ ...EMPTY_EARNINGS, reports: [kept] }, "2026-11-07");
    const docNote = notes.find((n) => n.key.endsWith(":deck"));
    const before = reportNotices({ ...EMPTY_EARNINGS, reports: [{ ...kept, date: "2026-10-28" }] }, "2026-10-30");
    const held = reportNotices({ ...EMPTY_EARNINGS, reports: [{ ...kept, doc: { ...kept.doc, ready: false, held: ["x"] } }] }, "2026-11-07");
    check("a report that reads whole is an alert of its own, never for a report read before the gate, and none while the reviewer holds it", !!docNote && /earnings report is ready/.test(docNote.detail ?? docNote.title) && !before.some((n) => n.key.endsWith(":deck")) && !held.some((n) => n.key.endsWith(":deck")), notes.map((n) => `${n.key}: ${n.title}`).join(" || "));
    const stages = held.filter((n) => /:(release|figures)$/.test(n.key));
    // Hamza, 6 Nov 2026: "why is there two notifications of the same event": the whole report takes the stage's place.
    check("once the report reads whole it is the results' one alert, carrying the revenue and the reading; until then the stage stands", notes.length === 1 && !!docNote && /^The earnings report is ready\. Revenue/.test(docNote.detail ?? "") && stages.length === 1, notes.map((n) => n.key).join(","));
    check("from 4 Nov 2026 the release and figures stages stay on Notifications but are never emailed; only the whole report is", stages.length > 0 && stages.every((n) => !emailWorthy(n)) && !!docNote && emailWorthy(docNote) && reportNotices({ ...EMPTY_EARNINGS, reports: [{ ...kept, date: "2026-10-28" }] }, "2026-10-29").filter((n) => /:(release|figures)$/.test(n.key)).every((n) => emailWorthy(n)), stages.map((n) => n.key).join(","));
    const pdfName = `${earningsDocName(kept)}.pdf`;
    const since = { pct: 4.2, basis: "release" as const, session: "post" as const, at: "5 Nov, 17:40", benchmarkPct: 0.6 };
    const docMail = earningsReportEmail(kept, "https://example.app", [pdfName], { deck: true, since });
    const noPdf = earningsReportEmail(kept, "https://example.app", [], { deck: true });
    check("one email once the report is whole: the summary, the PDF attached and the move since the results as it was sent", /earnings report/i.test(docMail.subject) && docMail.text.includes(`Attached: ${pdfName}.`) && /MA \+4\.2(0)?% since the results came out, after hours as this was sent \(5 Nov, 17:40 New York\); SPY \+0\.6(0)?% over the same time/.test(docMail.text) && /\+4\.2/.test(docMail.html) && /could not be attached/.test(noPdf.text), docMail.text.split("\n").find((l) => /since/.test(l)) ?? "");
    check("no email line reads n/a or not read: a rule or signal with no figure is named once at the end", !/n\/a|not read/.test(docMail.text + docMail.html) && !/n\/a|not read/.test(earningsReportEmail({ ...kept, triggers: [{ kind: "kill", label: "Engine growth below 15%", met: null, reading: null }] }, "https://example.app", [], { deck: true }).text) && /Not tested this quarter, since the filings give no figure for it: Engine growth below 15%/.test(earningsReportEmail({ ...kept, triggers: [{ kind: "kill", label: "Engine growth below 15%", met: null, reading: null }] }, "https://example.app", [], { deck: true }).text));
  }
  // The review note: the study read through this quarter, on the report's second page.
  {
    const rv = parseBriefResponse({ content: [{ type: "tool_use", name: "record_brief", input: { review: { headline: "The quarter bore out the network case.", news: ["Cross-border volumes grew 15%."], held: ["Margins held at the study's level."], changed: [] } } }] });
    const withReview = rv.ok ? { ...full, detail: { ...full.detail!, brief: { ...rv.brief, studyId: "abcdefabcdef", callKey: null, at: "2026-10-30T12:00:00Z", note: null, v: BRIEF_VERSION } } } : full;
    const rdoc = earningsDoc(withReview, "Sample methodology");
    const rp = rdoc.pages[1];
    check("the review note is parsed from the brief and leads the report after the cover, in its own words", rv.ok && rv.brief.review?.news.length === 1 && rp?.key === "review" && /The quarter bore out the network case/.test(rp.title), rp ? pageTexts(rp).join(" | ") : "");
    check("a brief written before the review note is written again once", briefDue({ study: { id: "abcdefabcdef" }, brief: { ...(brief as NonNullable<typeof brief>), v: 1 } }, callKeyOf(fromNotes), "2026-10-31T00:00:00Z") && BRIEF_VERSION === 2);
  }
  check("no line in the report ends in an ellipsis", !/…|\.\.\.(\s|$)/.test(docText(fdoc)), docText(fdoc).match(/.{0,60}(…|\.\.\.)/)?.[0] ?? "");
}

deckChecks().then(callChecks).then(() => {
  // A holding's decks open on the screen, embedded as Google Slides like the reviews (Hamza, 15 Oct 2026).
  const run = read("lib/earnings-run.ts");
  const decksUi = read("components/earnings/decks.tsx");
  check("the report is reviewed once it is due and kept as the reviewer's verdict alone, never the pages", /withDecks\(/.test(run) && /reviewVerdict\(/.test(run) && /parseDocReview\(/.test(run) && /doc: reportDocStateSchema\.nullable/.test(read("lib/earnings.ts")) && !/saveEarningsDeck/.test(run + read("lib/vault.ts")));
  check("no PowerPoint deck is made for a report any more, and the run reads the thesis, the pillars and the DCF from the theses file", !/reactionDeck\(|earningsDeck\(|pptxgenjs/.test(run + read("lib/earnings-deck.ts") + read("lib/alerts-run.ts")) && /thesisDetail\(/.test(run) && /readJson\("theses"/.test(run));
  check("Earnings embeds the latest report as a page, with the earlier ones as PDFs under it, and Theses the same", /<iframe/.test(decksUi) && /docViewHref\(/.test(decksUi) && /EarningsDecks/.test(read("app/(app)/earnings/page.tsx")) && /docViewHref\(/.test(read("components/theses/deck-embed.tsx")));
  check("the route draws the report as the page or the PDF, refuses one not yet whole with a sentence, and may be framed by the app alone", /format/.test(read("app/api/earnings/deck/route.ts")) && /renderReportDocPdf/.test(read("app/api/earnings/deck/route.ts")) && /409/.test(read("app/api/earnings/deck/route.ts")) && /frame-ancestors 'self'/.test(read("app/api/earnings/deck/route.ts")) && /SAMEORIGIN/.test(read("next.config.ts")));
  if (failed) {
    console.error(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  console.log(`\ncheck:earnings ok (${passed} passed): the calendar parses and a broken day is named, the companies are the person's, the alert fires the day before, the report's figures come from the filing or the release checked against its text, its headline from the rules, the commentary keeps only points with their pages, how the stock took the results is the app's move with your Claude's why, and its past results' moves come from the SEC's release days and the closes; the income flow adds up from the sources to net income, for a company and for the book, and its words never meet.`);
});
