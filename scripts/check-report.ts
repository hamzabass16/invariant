/**
 * The scheduled report, held to its figures: built from the fictional sample,
 * the same every time, due once per slot, and rendered without a zero where
 * data is waiting. Run: npm run check:report
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { EMPTY_DECISIONS, withDecision } from "../lib/decisions";
import { bookSchema } from "../lib/holdings";
import { methodologySchema } from "../lib/methodology";
import { SCREENS, SLOTS } from "../lib/ontology";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { answerCut, buildReport, embedsItself, emptyAnswerWords, claimOutcome, handOutcome, handSlot, isDue, keepReports, partlyOutcome, reclaimable, sentKinds, lastOfKind, markSent, kindsDue, localClock, paragraphsOf, parseAnswerResponse, parseProseResponse, proseRequestBody, questionRequestBody, renderHtml, renderText, reportSchema, REPORTS_KEPT, scheduleSchema, scheduleWords, slotKey, staleClaim, withHunterFinds, withNews, withNewsletters, withQuestions, withWeekAhead, zoneValid, type Report, type Schedule } from "../lib/report";
import { reviewHtml, reviewPdfHref, reviewViewHref } from "../lib/review-html";
import { barChart, heat, heatChart, PDF_SERIES, pdfName, pdfOutline, PIE_HUES, pieChart, reviewPdfPlan } from "../lib/review-pdf";
import { newslettersFileSchema } from "../lib/newsletters";
import { marketsOver, NEWS_MAX_TOKENS, newsDate, newsRequestBody, newsSchema, newsUrl, parseNewsResponse, pathOver } from "../lib/review";
import { modulesFor, setupSchema } from "../lib/setup";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", file), "utf8"));
const book = bookSchema.parse(read("dani.book.json"));
const m = methodologySchema.parse(read("methodology.individual.json"));
const setup = setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr", "schwab"], tradesOptions: true, helperName: null, methodology: m, updated: "2026-10-01" });
const now = new Date("2026-10-11T07:00:00Z");
const today = "2026-10-11";
const modules = modulesFor(setup, book);

const r = buildReport({ setup, book, methodology: m, preferences: DEFAULT_PREFERENCES, today, now, modules });
check("the report validates against its schema", reportSchema.safeParse(r).success);
check("built twice, the same", JSON.stringify(r) === JSON.stringify(buildReport({ setup, book, methodology: m, preferences: DEFAULT_PREFERENCES, today, now, modules })));
check("a headline section leads", r.sections[0]?.heading === "Headline" && r.sections[0].lines.length === m.dashboard.headline.length, r.sections[0]?.heading);
check("the checks follow, worst first", r.sections[1]?.heading === "Methodology checks" && r.sections[1].lines[0].tone === "danger", r.sections[1]?.lines[0]?.value ?? "");
check("the summary counts the breaches", /2 breaches/.test(r.summary), r.summary);
check("every rule cites its section", r.sections[1].lines.every((l) => /^\S+ /.test(l.label)));
check("a panel section points at the app", r.sections.some((s) => s.lines.some((l) => l.value === "In the app")));
check("a rule label is section plus text, without the full stop", r.sections[1].lines.every((l) => !/\.$/.test(l.label)));
const lines = r.sections.flatMap((s) => s.lines);
check("a waiting figure says Waiting, with what it needs, never a zero", lines.filter((l) => l.value === "Waiting").every((l) => /Needs|supplies/.test(l.detail ?? "")));
check("the id carries the build time", r.id === "report-2026-10-11-0700", r.id);

const text = renderText(r);
check("text carries the title, the summary and the note", text.startsWith(r.title) && text.includes(r.summary) && text.includes("Not investment advice."));
const html = renderHtml(r);
check("html escapes and carries every line", html.includes("Not investment advice.") && r.sections.every((s) => html.includes(s.heading)) && !/<script/i.test(html));
check("html with a < in a label is escaped", renderHtml({ ...r, title: "a <b> title" }).includes("a &lt;b&gt; title"));

const withProse: Report = { ...r, prose: "Three sentences." };
check("prose renders in both", renderText(withProse).includes("Three sentences.") && renderHtml(withProse).includes("Three sentences."));
const noted: Report = { ...r, notes: ["Commentary skipped: no key."] };
check("a skipped commentary is said in both", renderText(noted).includes("Commentary skipped") && renderHtml(noted).includes("Commentary skipped"));
check("an old report file without notes still reads", reportSchema.safeParse({ ...r, notes: undefined }).success);

const body = proseRequestBody(r);
check("the commentary request forbids advice and carries the report", /not investment advice/i.test(String(body.system)) && JSON.stringify(body.messages).includes(r.summary));
check("an empty answer parses to null", parseProseResponse({ content: [] }) === null && parseProseResponse({ content: [{ type: "text", text: " ok " }] }) === "ok");
// Hamza, 18 Oct 2026: a weekly went out with "the commentary came back empty" and "the news did not fit its shape".
check("every text block of the commentary counts, an empty first one included; what an empty answer held is said without its content", parseProseResponse({ content: [{ type: "text", text: "" }, { type: "text", text: "Fine." }] }) === "Fine." && parseProseResponse({ content: [{ type: "text", text: "A." }, { type: "text", text: "B." }] }) === "A.\n\nB." && emptyAnswerWords({ content: [{ type: "text", text: "secret" }], stop_reason: "end_turn" }) === "the model stopped on end_turn with text block" && !emptyAnswerWords({ content: [{ type: "text", text: "secret" }], stop_reason: "end_turn" }).includes("secret") && emptyAnswerWords(null) === "the model stopped on no reason with no blocks");
// Hamza, 18 Oct 2026: a weekly's commentary stopped after nine words, cut by the 600 tokens it was given; it is now three paragraphs with room to spare, and a cut is named.
check("the commentary asks for three paragraphs and has room for a model that thinks first", /three plain paragraphs/i.test(String(body.system)) && (body as { max_tokens: number }).max_tokens >= 3000 && parseProseResponse({ content: [{ type: "text", text: "A. ".repeat(900) }] })!.length <= 2401);
check("an answer that ran out of room is known by its stop reason", answerCut({ stop_reason: "max_tokens", content: [] }) && !answerCut({ stop_reason: "end_turn", content: [] }) && !answerCut(null));
check("the commentary's paragraphs are kept apart in the email and on the screen", paragraphsOf("One.\n\nTwo.\n \nThree.").join("|") === "One.|Two.|Three." && (renderHtml({ ...r, prose: "One.\n\nTwo." }).match(/Georgia,serif/g) ?? []).length === 2);
// The person's own questions (Hamza, 18 Oct 2026): kept on Reviews, each answered from the review alone as a section before the calendar.
const qBody = questionRequestBody(r, "Which holding is over its cap?");
check("a question's request carries the question and the review, in text alone, and forbids advice", JSON.stringify(qBody.messages).includes("Which holding is over its cap?") && JSON.stringify(qBody.messages).includes(r.summary) && /not investment advice/i.test(String(qBody.system)) && (qBody as { max_tokens: number }).max_tokens >= 3000);
check("an answer parses like the commentary", parseAnswerResponse({ content: [{ type: "text", text: "Yes.\n\nMA." }] }) === "Yes.\n\nMA." && parseAnswerResponse({ content: [] }) === null);

// The schedule on its own clock.
const sun0900Athens = new Date("2026-10-11T06:00:00Z"); // EEST, UTC+3
const schedule: Schedule = { day: 0, hour: 9, zone: "Europe/Athens", prose: false, cadence: "both" };
check("Athens clock reads Sunday 09:00", JSON.stringify(localClock(sun0900Athens, "Europe/Athens")) === JSON.stringify({ day: 0, hour: 9, date: "2026-10-11" }), JSON.stringify(localClock(sun0900Athens, "Europe/Athens")));
check("due in its hour", slotKey(schedule, sun0900Athens) === "2026-10-11" && isDue(schedule, sun0900Athens, null));
check("still due an hour later, if not yet claimed (a missed cron, a skipped hour)", slotKey(schedule, new Date("2026-10-11T07:00:00Z")) === "2026-10-11" && !isDue(schedule, new Date("2026-10-11T07:00:00Z"), "2026-10-11"));
check("before its hour, the slot is last week's", slotKey(schedule, new Date("2026-10-11T05:30:00Z")) === "2026-10-04");
check("on a later day, the slot is still that Sunday (a daily cron sends the first pass after)", slotKey(schedule, new Date("2026-10-13T06:00:00Z")) === "2026-10-11");
check("not due twice in a slot", !isDue(schedule, new Date("2026-10-11T06:30:00Z"), "2026-10-11"));
check("due again the next week", isDue(schedule, new Date("2026-10-18T06:00:00Z"), "2026-10-11") && slotKey(schedule, new Date("2026-10-18T06:00:00Z")) === "2026-10-18");
{
  const t = new Date("2026-11-05T06:05:00Z");
  const both: Schedule = { day: 0, hour: 8, zone: "Europe/London", prose: false, cadence: "both" };
  check("a claim a killed run left is due again, a fresh one is not, a sent one never", staleClaim("running", t) && !staleClaim("running 2026-11-05T06:00:00.000Z", t) && staleClaim("running 2026-11-05T05:30:00.000Z", t) && !staleClaim("sent 2026-11-01T06:00:00.000Z", t) && !staleClaim(null, t));
  check("the slot a timed-out run claimed is due at the next run", isDue(schedule, t, slotKey(schedule, t), "running") && !isDue(schedule, t, slotKey(schedule, t), "sent 2026-11-05T05:00:00.000Z"));
  check("a claim keeps what it sent, and a killed run is taken back for the rest alone", sentKinds(claimOutcome(t, ["weekly"])).join() === "weekly" && sentKinds(claimOutcome(t, [])).length === 0 && staleClaim(claimOutcome(new Date("2026-11-05T05:30:00.000Z"), ["weekly"]), t) && !staleClaim(claimOutcome(t, ["weekly"]), t));
  check("a run that sent part and failed is due again for the rest, a sentence after it", sentKinds(partlyOutcome(t, ["weekly"], "The deck could not be made.")).join() === "weekly" && reclaimable(both, "2026-11-01", partlyOutcome(t, ["weekly"], "x"), t) && !reclaimable(both, "2026-11-01", partlyOutcome(t, ["weekly", "monthly"], "x"), t));
  check("a slot sent by hand is not sent again; one sent by hand in part is due for the rest", !reclaimable(both, "2026-11-08", handOutcome(t, ["weekly"]), t) && reclaimable(both, "2026-11-01", handOutcome(t, ["weekly"]), t) && !reclaimable(both, "2026-11-01", handOutcome(t, ["weekly", "monthly"]), t));
  // Sunday 08:00 London, both reviews. Sat 7 Nov: the 1 Nov slot is sent, so a weekly by hand (2 to 6 Nov) stands in for 8 Nov's.
  const sat = new Date("2026-11-07T12:00:00Z");
  const h1 = handSlot(both, sat, "2026-11-01", "sent 2026-11-02T06:00:00.000Z", "weekly", "2026-11-06");
  check("Send me one now on a Saturday marks the next day's slot", h1?.slot === "2026-11-08" && !isDue(both, new Date("2026-11-08T09:00:00Z"), h1.slot, h1.outcome));
  // Sun 25 Oct 09:06 London, after the 08:00 slot was due and not yet run (the 19 to 23 Oct weekly that came twice).
  const sun = new Date("2026-10-25T09:06:00Z");
  const h2 = handSlot(both, sun, "2026-10-18", "sent 2026-10-19T06:00:00.000Z", "weekly", "2026-10-23");
  check("Send me one now after the hour and before the run marks that slot", h2?.slot === "2026-10-25" && !isDue(both, new Date("2026-10-26T06:00:00Z"), h2.slot, h2.outcome));
  // Thu 5 Nov, 1 Nov's slot sent: a monthly by hand covers October, which the next slot (8 Nov) does not build, so nothing is marked.
  check("a monthly by hand outside the slot that builds it marks nothing", handSlot(both, new Date("2026-11-05T12:00:00Z"), "2026-11-01", "sent 2026-11-05T06:00:00.000Z", "monthly", "2026-10-31") === null);
  // Sat 31 Oct, a weekly by hand for 26 to 30 Oct: 1 Nov's slot builds both; it is marked and still sends the monthly.
  const h3 = handSlot(both, new Date("2026-10-31T12:00:00Z"), "2026-10-25", "sent 2026-10-26T06:00:00.000Z", "weekly", "2026-10-30");
  check("a weekly by hand on a first-week slot leaves its monthly to the schedule", h3?.slot === "2026-11-01" && isDue(both, new Date("2026-11-01T09:00:00Z"), h3.slot, h3.outcome));
  check("a slot whose run is going on is never marked", handSlot(both, sat, "2026-11-01", claimOutcome(sat, []), "weekly", "2026-11-06") === null);
}
check("winter time moves the UTC hour", slotKey(schedule, new Date("2026-11-08T07:00:00Z")) === "2026-11-08" && slotKey(schedule, new Date("2026-11-08T06:00:00Z")) === "2026-11-01");
check("a Saturday 23:00 schedule read on Sunday 02:00 is Saturday's", slotKey({ ...schedule, day: 6, hour: 23 }, new Date("2026-10-10T23:00:00Z")) === "2026-10-10");
check("midnight in New York", localClock(new Date("2026-10-11T04:30:00Z"), "America/New_York").hour === 0);
check("zones are checked", zoneValid("Europe/Athens") && !zoneValid("Mars/Olympus"));

// The vault file keeps the newest and drops the oldest.
let file = keepReports(null, r);
for (let i = 1; i <= REPORTS_KEPT + 2; i++) file = keepReports(file, { ...r, id: `report-${i}` });
check("the vault keeps the last twelve, newest first", file.reports.length === REPORTS_KEPT && file.reports[0].id === `report-${REPORTS_KEPT + 2}` && !file.reports.some((x) => x.id === r.id));
check("rebuilding the same id replaces it", keepReports(file, { ...r, id: file.reports[0].id, summary: "new" }).reports.filter((x) => x.id === file.reports[0].id).length === 1);

// Without a methodology: the starter dashboard, no checks.
const bare = buildReport({ setup: { ...setup, methodology: null }, book, methodology: null, preferences: DEFAULT_PREFERENCES, today, now, modules });
check("no methodology, no checks, still a headline", !bare.sections.some((s) => s.heading === "Methodology checks") && bare.sections[0].heading === "Headline" && bare.summary === "No rules to check yet.");


// ---------------------------------------------------------------------------
// The weekly and monthly reviews, on a fictional fixture: the sample book with
// closes per holding, one equity buy in the week and a Decision Log.

const weekClose = (start: number, step: number) => book.series!.nav.map((p, i) => ({ date: p.date, value: start + i * step }));
const reviewBook = {
  ...book,
  series: { ...book.series!, holdings: { AAPL: weekClose(180, 0.4), VOO: weekClose(400, 0.9) } },
  transactions: [...book.transactions, { date: "2026-10-06", account: "IBKR", kind: "buy" as const, symbol: "AAPL", quantity: 10, price: 221, amount: -2210, currency: "USD" as const }],
};
const filed = (id: string, date: string, kind: "trade" | "vote" | "note", symbol: string | null, title: string, filedAt = `${date}T12:00:00.000Z`) => ({ id, date, kind, symbol, title, text: "", filedAt });
let decisions = withDecision(EMPTY_DECISIONS, filed("d1", "2026-10-06", "trade", "AAPL", "AAPL, buy 10 sh", "2026-10-09T12:00:00.000Z"), "2026-10-09");
decisions = withDecision(decisions, filed("d2", "2026-10-09", "vote", "AAPL", "AAPL, keep as Core. Vote 1-0."), "2026-10-09");
decisions = withDecision(decisions, filed("d3", "2026-10-01", "vote", "VOO", "VOO, sell by 30 Nov 2026. Vote 1-0."), "2026-10-01");
decisions = withDecision(decisions, filed("d4", "2026-10-02", "vote", "NVDA", "NVDA, planned sale withdrawn."), "2026-10-02");

const weekly = buildReport({ setup, book: reviewBook, methodology: m, preferences: DEFAULT_PREFERENCES, today, now, modules, kind: "weekly", decisions, filings: null, nextReport: "2026-10-18" });
check("the weekly validates and is titled by its period", reportSchema.safeParse(weekly).success && weekly.kind === "weekly" && weekly.title === "Weekly review, 5 to 9 Oct 2026" && weekly.period?.from === "2026-10-02" && weekly.period.to === "2026-10-09", weekly.title);
check("the weekly's id carries its kind", weekly.id === "report-2026-10-11-0700-weekly", weekly.id);
const reviewSlots = SCREENS.reviews.slots;
const slotOf = (heading: string) => reviewSlots.find((s) => heading === SLOTS[s].label || heading.startsWith(`${SLOTS[s].label},`) || heading.startsWith(`${SLOTS[s].label}:`));
const order = weekly.sections.map((s) => slotOf(s.heading));
check("every review section is a slot of the Reviews screen", order.every(Boolean), weekly.sections.filter((s) => !slotOf(s.heading)).map((s) => s.heading).join("; "));
check("the sections keep the slots' order", order.every((s, i) => i === 0 || reviewSlots.indexOf(s!) >= reviewSlots.indexOf(order[i - 1]!)), order.join(","));
check("the cover carries a verdict and two pillars", weekly.verdict !== null && weekly.pillars.length === 2 && weekly.pillars[0].label === "Behaviour" && weekly.pillars[1].label === "Holdings and theses");
check("a buy of the holding over its cap is not followed, so the verdict is not backed", weekly.verdict?.label === "Not backed" && weekly.verdict.level === "danger", weekly.verdict?.label);
const rulebook = weekly.sections.find((s) => s.heading.startsWith("The rulebook"));
check("the rulebook names the buy while over the cap", !!rulebook && rulebook.lines.some((l) => /^1\.1 /.test(l.label) && l.value === "Not followed" && /AAPL bought 6 Oct/.test(l.detail ?? "")), rulebook?.lines.find((l) => /^1\.1 /.test(l.label))?.detail ?? "");
const tradesSection = weekly.sections.find((s) => s.heading.startsWith("Trades this period"));
check("the trade shows its back-filled entry and its later vote", !!tradesSection && tradesSection.lines.some((l) => /AAPL/.test(l.label) && /entry 3d after|Entry 3d after/i.test(l.detail ?? "") && /vote 3d after/i.test(l.detail ?? "")), tradesSection?.lines[0]?.detail ?? "");
const theses = weekly.sections.find((s) => s.heading === "Holdings and theses")!;
check("a decided sale stands on the thesis; a withdrawn one does not", theses.lines.some((l) => /^VOO/.test(l.label) && l.value === "Sale decided") && !theses.lines.some((l) => /^NVDA/.test(l.label) && l.value === "Sale decided"), theses.lines.map((l) => `${l.label}=${l.value}`).join(", "));
const moves = weekly.sections.find((s) => s.heading === "What moved the book")!;
check("contribution reads the closes per holding and names what is left out", moves.lines.some((l) => l.label === "AAPL" && /pp\)$/.test(l.value ?? "")) && moves.lines.some((l) => l.label === "Left out" && /NVDA/.test(l.value ?? "") && /No closes/.test(l.detail ?? "")), moves.lines.map((l) => l.label).join(" | "));
check("returns show the week and the year to date against the benchmark", weekly.returns.length === 2 && weekly.returns[0].account !== null && weekly.returns[0].benchmarks.SPY !== null);
check("the review text leads with the verdict", renderText(weekly).includes("VERDICT: NOT BACKED") && renderHtml(weekly).includes("Not backed"));

const monthly = buildReport({ setup, book: reviewBook, methodology: m, preferences: DEFAULT_PREFERENCES, today, now, modules, kind: "monthly", decisions, filings: null });
check("the monthly covers the previous calendar month and adds the month in numbers", monthly.title === "Monthly review, September 2026" && monthly.period?.from === "2026-08-31" && monthly.period.to === "2026-09-30" && monthly.sections.some((s) => s.heading.startsWith("The month in numbers")), monthly.title);
check("the month in numbers carries risk and trade quality", monthly.sections.find((s) => s.heading.startsWith("The month in numbers"))!.lines.some((l) => /Worst fall|capture|Trade quality/i.test(l.label)));

// The news, on the person's provider: inserted before the calendar, each item with its source.
const news = newsSchema.parse({ holdings: [{ symbol: "AAPL", date: "2026-10-07", text: "Results.", url: "https://example.com/a", read: "Nothing changes." }], markets: [{ head: "Rates", date: "2026-10-08", text: "Held.", url: "https://example.com/b" }, { head: "Chips", topic: "tech", date: "2026-10-08", text: "Fell.", url: "https://example.com/c" }], upcoming: [{ date: "2026-10-30", item: "AAPL Q4 results", url: null }] });
const withN = withNews(weekly, news);
const at = withN.sections.findIndex((s) => s.heading.startsWith("News"));
check("news sections sit before the calendar, with their sources as links", at > 0 && withN.sections.filter((s) => s.heading.startsWith("News")).length === 4 && withN.sections[at].lines[0].href === "https://example.com/a" && withN.sections.findIndex((s) => s.heading === "Coming up and open items") > at, String(at));
check("a market item kept before topics reads as macro; each topic is its own section, tagged", news.markets[0].topic === "macro" && withN.sections.filter((s) => s.slot === "review_news").map((s) => s.part).join(",") === "holdings,macro,tech,upcoming", withN.sections.map((s) => `${s.slot}:${s.part}`).join(","));
check("the news request files every market item under a topic", JSON.stringify(newsRequestBody([{ symbol: "AAPL", name: "Apple" }], { kind: "weekly", from: "2026-10-02", to: "2026-10-09", label: "5 to 9 Oct 2026", short: "5 to 9 Oct" }, today)).includes('"enum":["macro","tech","geopolitics"]'));
const loose = parseNewsResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "Here is the news." }, { type: "tool_use", name: "record_news", input: { holdings: [{ symbol: "aapl", date: "October 7, 2026", text: "Results. " + "x".repeat(500), url: " https://example.com/a ", read: "Nothing changes." }, { symbol: "MSFT", date: "last week", text: "No date.", url: "https://example.com/b", read: "" }, { symbol: "NVDA", date: "2026-10-08", text: "No page.", url: "the company's site", read: "" }], markets: [{ head: "Rates", topic: "rates", date: "2026-10-08T14:00:00Z", text: "Held.", url: "https://example.com/c" }, { topic: "tech", date: "2026-10-08", text: "Chips fell on the day.", url: "https://example.com/d" }], upcoming: [{ date: "2026-10-30", item: "AAPL Q4 results", url: null }, { date: "2026-10-30", item: "x", url: "not a page" }, { item: "No date" }] } }] });
check("the news is read item by item: a date in any shape, a long line clipped, a topic off the list read as macro, a missing headline taken from the text, a page's address trimmed; an item without a date or a page is dropped and counted", loose.ok && loose.news.holdings.length === 1 && loose.news.holdings[0].symbol === "AAPL" && loose.news.holdings[0].date === "2026-10-07" && loose.news.holdings[0].text.length <= 400 && loose.news.holdings[0].text.endsWith("…") && loose.news.holdings[0].url === "https://example.com/a" && loose.news.markets.length === 2 && loose.news.markets[0].topic === "macro" && loose.news.markets[0].date === "2026-10-08" && loose.news.markets[1].head === "Chips fell on the day." && loose.news.upcoming.length === 2 && loose.news.upcoming[1].url === null && loose.dropped === 3, JSON.stringify(loose));
check("an answer cut short, one in words and one with nothing usable each say so", !parseNewsResponse({ stop_reason: "max_tokens", content: [{ type: "text", text: "..." }] }).ok && (parseNewsResponse({ stop_reason: "max_tokens", content: [] }) as { why: string }).why.includes("ran out of room") && (parseNewsResponse({ content: [{ type: "text", text: "Nothing." }] }) as { why: string }).why.includes("in words") && (parseNewsResponse({ content: [{ type: "tool_use", name: "record_news", input: { holdings: [{ symbol: "A", text: "t", url: "https://e.com" }], markets: [], upcoming: [] } }] }) as { why: string }).why.includes("none with a date and a page") && (parseNewsResponse({ content: [{ type: "tool_use", name: "record_news", input: {} }] }) as { why: string }).why.includes("no news"));
check("the news request has room for every item, and asks for dates as YYYY-MM-DD", (newsRequestBody([{ symbol: "AAPL", name: "Apple" }], { kind: "weekly", from: "2026-10-02", to: "2026-10-09", label: "5 to 9 Oct 2026", short: "5 to 9 Oct" }, today) as { max_tokens: number; system: string }).max_tokens === NEWS_MAX_TOKENS && NEWS_MAX_TOKENS >= 12_000 && (newsRequestBody([], { kind: "weekly", from: "2026-10-02", to: "2026-10-09", label: "", short: "" }, today) as { system: string }).system.includes("YYYY-MM-DD") && newsDate("Oct 15, 2026") === "2026-10-15" && newsDate("2026-10-15T20:00:00Z") === "2026-10-15" && newsDate("soon") === null && newsUrl("ftp://x.example/a") === null && newsUrl("https://x.example/a?b=1") === "https://x.example/a?b=1");
check("a report with news still validates and keeps the slot order", reportSchema.safeParse(withN).success && withN.sections.map((s) => slotOf(s.heading)).every(Boolean));
check("empty news changes nothing", withNews(weekly, { holdings: [], markets: [], upcoming: [] }) === weekly);

// The cadence: the weekly every week, the monthly in the first week of a month.
check("both: weekly and monthly on the first Sunday of a month, weekly alone later", kindsDue(schedule, "2026-11-01").join(",") === "weekly,monthly" && kindsDue(schedule, "2026-10-11").join(",") === "weekly");
check("monthly alone: nothing outside the first week", kindsDue({ ...schedule, cadence: "monthly" }, "2026-10-18").length === 0 && kindsDue({ ...schedule, cadence: "monthly" }, "2026-11-01").join(",") === "monthly");
check("no review: nothing is built, the morning refresh alone runs", kindsDue({ ...schedule, cadence: "none" }, "2026-11-01").length === 0 && scheduleWords({ ...schedule, cadence: "none" }).startsWith("No review"));
// The questions as sections, and the PDF report (Hamza, 18 Oct 2026: on the HCMP YTD review's skeleton).
{
  const asked = withQuestions(withN, [{ question: "Is the book too concentrated?", answer: "Yes.\n\nThe top three hold 40%.", note: null }, { question: "What about cash?", answer: null, note: "The model refused your key." }]);
  const qs = asked.sections.filter((s) => s.slot === "review_questions");
  const calendarAt = asked.sections.findIndex((s) => s.slot === "review_calendar" || s.heading === SLOTS.review_calendar.label);
  check("each question is a section under the slot's label, its answer a paragraph a line, before the calendar", qs.length === 2 && qs[0].heading === "Your questions: Is the book too concentrated?" && qs[0].lines.map((l) => l.label).join("|") === "Yes.|The top three hold 40%." && asked.sections.indexOf(qs[1]) < calendarAt && qs.every((q) => slotOf(q.heading) === "review_questions"));
  check("a question that could not be answered is a section that says why, never left out", qs[1].lines.length === 1 && qs[1].lines[0].label === "Not answered" && qs[1].lines[0].tone === "warn" && /refused/.test(qs[1].lines[0].detail ?? ""));
  check("the questions are not added to a dashboard report, and none changes nothing", withQuestions(r, [{ question: "q", answer: "a", note: null }]).sections.length === r.sections.length && withQuestions(withN, []) === withN);
  check("the report gives the questions a chapter of their own, each titled by its question", (() => { const q = reviewPdfPlan(asked).chapters.find((c) => c.title === "Your questions"); return !!q && JSON.stringify(q.blocks).includes("Is the book too concentrated?") && JSON.stringify(q.blocks).includes("What about cash?"); })());
  const plan = reviewPdfPlan({ ...asked, prose: "First paragraph.\n\nSecond.\n\nThird." });
  check("the PDF report's chapters follow HCMP's order and are numbered in order, performance first and the appendix last", plan.chapters[0].title === "Performance" && plan.chapters[plan.chapters.length - 1].title === "Appendix" && plan.chapters.every((c, i) => c.number === String(i + 1).padStart(2, "0")) && plan.chapters.some((c) => c.title === "Your questions") && plan.chapters.some((c) => c.title === "Methodology adherence") && plan.chapters.some((c) => c.title === "Action plan"), pdfOutline(asked).join(","));
  check("the cover's tiles lead with the account's return and the gap, at most eight, and the bottom line is the commentary's paragraphs", plan.tiles.length <= 8 && /^Account/.test(plan.tiles[0].label) && plan.tiles.some((t) => /^Gap to SPY/.test(t.label)) && plan.tiles.some((t) => t.label.startsWith("Verdict")) && plan.bottomLine.length === 3 && plan.bottomLineFrom === "commentary" && reviewPdfPlan(asked).bottomLineFrom === "summary", plan.tiles.map((t) => t.label).join("|"));
  const perf = plan.chapters[0];
  const line = perf.blocks.find((b) => b.kind === "lines");
  check("the performance chapter draws the period's path as one line chart with a zero line, every point inside the plot and a colour per series in fixed order", !!line && line.kind === "lines" && line.chart.zeroY !== null && line.chart.lines[0].colour === PDF_SERIES[0] && line.chart.lines.every((l) => (l.d.match(/[ML](\d+\.?\d*) (\d+\.?\d*)/g) ?? []).every((pt) => { const [x, y] = pt.slice(1).split(" ").map(Number); return x >= line.chart.plot.x - 0.01 && x <= line.chart.plot.x + line.chart.plot.w + 0.01 && y >= line.chart.plot.y - 0.01 && y <= line.chart.plot.y + line.chart.plot.h + 0.01; })), perf.blocks.map((b) => b.kind).join(","));
  const bars = barChart([{ label: "A", value: 2, text: "+2" }, { label: "B", value: -1, text: "-1", mark: 1.5 }])!;
  check("bars grow from a zero line, a loss to its left, a cap mark on the same scale", bars.rows[0].x === bars.zeroX && bars.rows[1].x + bars.rows[1].w === bars.zeroX && bars.rows[1].mark! > bars.zeroX && bars.rows[0].w === 2 * (bars.rows[1].mark! - bars.zeroX) / 1.5);
  const pie = pieChart([{ label: "A", value: 50 }, { label: "B", value: 30 }, { label: "C", value: 20 }, { label: "D", value: 0 }])!;
  check("a pie's slices share the whole in fixed colours, the largest first, a zero left out", pie.slices.length === 3 && Math.abs(pie.slices.reduce((n, x) => n + x.share, 0) - 1) < 1e-9 && pie.slices[0].label === "A" && pie.slices[0].colour === PIE_HUES[0] && pie.slices.every((x) => /^M .* Z$/.test(x.d)) && pieChart([{ label: "A", value: 0 }]) === null);
  check("a pie past its room folds the rest into Other", pieChart(Array.from({ length: 14 }, (_, i) => ({ label: `H${i}`, value: 14 - i })), 170, 10)!.slices.slice(-1)[0].label === "Other");
  check("the heat map needs three holdings and colours by sign", heatChart({ symbols: ["A", "B"], pairs: [], average: 0, days: 21, to: "2026-10-09", book: {} }) === null && heat(1) === "#2a78d6" && heat(-1) === "#d03b3b" && heat(0) === "#f0eeec");
  const heatBlock = plan.chapters.find((c) => c.title === "Risk")?.blocks.find((b) => b.kind === "heat");
  check("the risk chapter draws the correlation matrix when the review has one", !asked.charts?.correlation || (!!heatBlock && heatBlock.kind === "heat" && heatBlock.chart.cells.length === heatBlock.chart.symbols.length ** 2));
  check("the report's file is named by the review", pdfName(asked) === "Weekly review, 5 to 9 Oct 2026.pdf");
  check("the email says the PDF is attached only when it is, links the kept one in Drive, and never names a deck or Slides", /attached as a PDF/.test(renderHtml(asked, true)) && !/attached/.test(renderHtml(asked)) && /attached as a PDF/.test(renderText(asked, true)) && renderHtml({ ...asked, pdf: { id: "1234567890abc", url: "https://drive.google.com/file/d/1234567890abc/view" } }, true).includes("Open it in Drive") && !/Slides|deck/i.test(renderHtml(asked, true) + renderText(asked, true)) && reportSchema.parse({ ...JSON.parse(JSON.stringify(asked)), pdf: undefined }).pdf === null);
  const page = reviewHtml(asked);
  check("the page in Reviews is the PDF report's own plan: a sheet for the cover and one per chapter, in the same order, with the same title", (page.match(/<section class="sheet/g) ?? []).length === plan.chapters.length + 1 && plan.chapters.every((c, i, a) => page.indexOf(`>${c.number} · `) > (i ? page.indexOf(`>${a[i - 1].number} · `) : 0)) && page.includes(`<h1>${asked.title}</h1>`));
  check("the page and the PDF are the app's own addresses", reviewViewHref("w 1") === "/api/reports/deck?id=w%201" && reviewPdfHref("w1") === "/api/reports/pdf?id=w1");
}

check("a schedule kept before cadences existed reads as weekly", scheduleSchema.parse({ day: 0, hour: 9, zone: "Europe/Athens", prose: false }).cadence === "weekly");
check("a report kept before the reviews existed reads as today's", reportSchema.parse({ ...r, kind: undefined, period: undefined, verdict: undefined, pillars: undefined, returns: undefined }).kind === "today");

// Sent, and the last of each kind: as it went out, else the newest built.
const sentFile = markSent(keepReports(keepReports(keepReports(null, { ...weekly, id: "w1" }), { ...monthly, id: "m1" }), { ...weekly, id: "w2" }), "w1", "2026-10-11T07:05:00.000Z");
check("a review marked sent keeps its time; the others stay unsent", sentFile.reports.find((x) => x.id === "w1")?.sentAt === "2026-10-11T07:05:00.000Z" && sentFile.reports.find((x) => x.id === "w2")?.sentAt === null);
check("the last weekly is the newest sent, the last monthly the newest built when none was sent", lastOfKind(sentFile, "weekly")?.id === "w1" && lastOfKind(sentFile, "monthly")?.id === "m1" && lastOfKind(null, "weekly") === null);
check("a report kept before decks existed reads as unsent, with no deck", (() => { const old = reportSchema.parse({ ...weekly, sentAt: undefined, deck: undefined }); return old.sentAt === null && old.deck === null; })());
const deck = { id: "1AbCdEfGhIjKlMnOp_qr-st", url: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp_qr-st/edit" };
check("a deck is kept only with a Drive id and a Google Slides address", reportSchema.safeParse({ ...weekly, deck }).success && !reportSchema.safeParse({ ...weekly, deck: { ...deck, url: "https://evil.example/x" } }).success && !reportSchema.safeParse({ ...weekly, deck: { ...deck, id: "../x" } }).success);
check("a deck kept before the reviews lost their PowerPoint is never linked again", !renderHtml({ ...weekly, deck }, true).includes(deck.url) && !renderText({ ...weekly, deck }, true).includes(deck.url));

// The charts, kept with the review so its report draws from the report alone.
const ch = weekly.charts;
check("the weekly keeps its charts; a dashboard report keeps none", !!ch && r.charts === null && reportSchema.parse({ ...weekly, charts: undefined }).charts === null);
check("every review section names the slot it fills", weekly.sections.every((s) => !!s.slot && reviewSlots.includes(s.slot as (typeof reviewSlots)[number])), weekly.sections.map((s) => s.slot).join(","));
check("the period's path starts at zero, the account first, then each benchmark", !!ch?.period && ch.period.series[0].label === "Account" && ch.period.series[0].values[0] === 0 && ch.period.series.length === 1 + Object.keys(weekly.returns[0].benchmarks).length && ch.period.dates[0] === weekly.period?.from, JSON.stringify(ch?.period?.series.map((x) => x.label)));
check("the path ends on the period's return", !!ch?.period && weekly.returns[0].account !== null && Math.abs((ch.period.series[0].values.at(-1) ?? 0) - weekly.returns[0].account) < 0.01, `${ch?.period?.series[0].values.at(-1)} vs ${weekly.returns[0].account}`);
check("the year's path steps by month end", !!ch?.ytd && ch.ytd.dates.slice(1, -1).every((d, i, a) => i === a.length - 1 || d.slice(0, 7) !== a[i + 1].slice(0, 7)), ch?.ytd?.dates.join(","));
check("contribution, caps and the class mix are the review's own", !!ch && ch.contribution.some((x) => x.label === "AAPL") && ch.caps.some((x) => x.cap !== null) && ch.mix.length > 0 && ch.cash !== null);
check("no series, no path", pathOver({ ...book, series: undefined }, ["SPY"], { from: "2026-10-02", to: "2026-10-09" }, "day") === null);
const mkBook = { ...book, markets: { asOf: "2026-10-09", source: "test", problems: [], rows: [], series: { GOLD: [{ date: "2026-10-02", value: 2000 }, { date: "2026-10-09", value: 2050 }], US10Y: [{ date: "2026-10-02", value: 4.1 }, { date: "2026-10-09", value: 4.25 }] } } };
const moved = marketsOver({ ...mkBook, markets: { ...mkBook.markets, rows: [{ symbol: "GOLD" }, { symbol: "US10Y" }] as never } }, null, { from: "2026-10-02", to: "2026-10-09" });
check("markets move a price in percent and a yield in points", moved.find((x) => x.symbol === "GOLD")?.change === 2.5 && moved.find((x) => x.symbol === "GOLD")?.unit === "pct" && moved.find((x) => x.symbol === "US10Y")?.change === 0.15 && moved.find((x) => x.symbol === "US10Y")?.unit === "pp", JSON.stringify(moved));
check("no market readings, no moves", marketsOver(book, m, { from: "2026-10-02", to: "2026-10-09" }).length === 0);

// The newsletters the person forwarded, laid on the review from their digests (the fictional sample).
const letters = newslettersFileSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples/newsletters.json"), "utf8")));
const withL = withNewsletters(withN, letters);
const lsec = withL.sections.filter((s) => s.slot === "review_newsletters");
check("the period's newsletters are counted by sender, then their points", lsec.map((s) => s.part).join(",") === "senders,points" && lsec[0].lines[0].label === "Closing Tape Recap" && lsec[0].lines[0].value === "5" && lsec[0].lines[1].label === "Harbour Rates Note" && lsec[0].lines[1].value === "3" && lsec[1].lines[0].detail?.includes("Touches GOOGL, AMZN, META") === true, JSON.stringify(lsec.map((s) => s.lines.map((l) => `${l.label}=${l.value}`))));
check("the newsletters sit after the news and before coming up", withL.sections.findIndex((s) => s.slot === "review_newsletters") > withL.sections.findIndex((s) => s.slot === "review_news") && withL.sections.findIndex((s) => s.slot === "review_newsletters") < withL.sections.findIndex((s) => s.slot === "review_calendar"));
// Newsletters on file but none dated in the period (Hamza, 18 Oct 2026: the deck said "None forwarded" of newsletters forwarded on the Sunday): no section is added and the method line says what is on file.
const outside = withNewsletters(withN, { ...letters, digests: letters.digests.map((d) => ({ ...d, receivedAt: "2026-09-01T07:00:00.000Z" })) });
const methodLine = outside.sections.find((s) => s.slot === "review_method")?.lines.find((l) => l.label === "Newsletters");
check("no newsletters in the period, nothing added, and the method line says how many are on file and the latest date; a dashboard report never carries them", outside.sections.length === withN.sections.length && methodLine?.value === "13 read, none dated 5 to 9 Oct 2026" && /dated 1 Sep 2026/.test(methodLine.detail ?? "") && withNewsletters(r, letters) === r && withNewsletters(withN, null) === withN, JSON.stringify(methodLine));
check("a newsletter is counted by its own date when it has one, not its arrival", withNewsletters(withN, { ...letters, digests: letters.digests.map((d) => ({ ...d, receivedAt: "2026-10-11T07:00:00.000Z", date: d.receivedAt })) }).sections.filter((s) => s.slot === "review_newsletters").length === 2);

// The report: HCMP's chapters, filled from the report.
const chapters = reviewPdfPlan(withL).chapters.map((c) => c.title);
const HCMP_CHAPTERS = ["Performance", "Attribution", "Trades", "Methodology adherence", "Risk", "News and newsletters", "Your questions", "Action plan", "Appendix"];
check("the report keeps HCMP's chapter order, performance first and the appendix last", chapters.every((t) => HCMP_CHAPTERS.includes(t)) && chapters.every((t, i) => i === 0 || HCMP_CHAPTERS.indexOf(t) > HCMP_CHAPTERS.indexOf(chapters[i - 1])) && chapters[0] === "Performance" && chapters.at(-1) === "Appendix", chapters.join(" | "));
// Next week on the calendar (Hamza, 27 Oct 2026): the week's events with their reach and history, after Coming up, a slide and a table in the report.
{
  const events = [
    { date: "2026-10-14", kind: "cpi" as const, area: "us" as const, name: "Consumer Price Index", time: "8:30 New York", about: "Prices.", source: "https://www.bls.gov/schedule/news_release/cpi.htm", indicator: null },
    { date: "2026-10-15", kind: "earnings" as const, area: "us" as const, symbol: "ASML", short: "ASML", name: "ASML results", time: "Before the open", about: "A holding.", source: "/company/ASML", indicator: null },
    { date: "2026-10-30", kind: "fomc" as const, area: "us" as const, name: "FOMC", time: "14:00 New York", about: "Rates.", source: "https://www.federalreserve.gov/", indicator: null },
  ];
  const sens = { "cpi:us": { title: "On past occurrences since 2019, at today's weights", rows: [{ outcome: "Inflation higher", n: 30, book: "-0.40% (-0.80% to -0.01%)", range: "-4.1% to +2.0%", spy: "-0.30%", fell: "60%" }], words: ["History."] } };
  const wk = withWeekAhead(withL, { events, reach: { "cpi:us": ["60% of your book is revenue in the United States."], "earnings:ASML": ["ASML is 8.5% of your book."] }, sensitivity: sens, notes: [] }, today);
  const sec = wk.sections.find((s) => s.slot === "review_week_ahead");
  check("week ahead: the seven days after the review, in date order, each with its reach and history; an event past the week is left out", sec?.lines.map((l) => l.label).join("|") === "Consumer Price Index|ASML results" && /60% of your book/.test(sec.lines[0].detail ?? "") && /Inflation higher, 30 times: your book -0\.40%/.test(sec.lines[0].detail ?? "") && /8\.5% of your book/.test(sec.lines[1].detail ?? "") && sec.lines[1].href === null, JSON.stringify(sec?.lines));
  check("week ahead: laid before the month in numbers and sources, once", wk.sections.findIndex((s) => s.slot === "review_week_ahead") < wk.sections.findIndex((s) => s.slot === "review_method") && withWeekAhead(wk, { events, reach: {}, sensitivity: {}, notes: [] }, today).sections.filter((s) => s.slot === "review_week_ahead").length === 1);
  check("week ahead: a calendar that could not be read says so; a dashboard report never carries it", /could not be read/.test(withWeekAhead(withL, null, today).sections.find((s) => s.slot === "review_week_ahead")?.lines[0].detail ?? "") && withWeekAhead({ ...withL, kind: "today", period: null }, { events, reach: {}, sensitivity: {}, notes: [] }, today).sections.every((s) => s.slot !== "review_week_ahead"));
  check("week ahead: the report's Action plan carries it as a table", JSON.stringify(reviewPdfPlan(wk)).includes(SLOTS.review_week_ahead.label));
  check("week ahead: Reviews carries the slot after Coming up, and the run lays it from the calendar", SCREENS.reviews.slots.indexOf("review_week_ahead") === SCREENS.reviews.slots.indexOf("review_calendar") + 1 && /withWeekAhead\(report, await calendarFromVault\(/.test(readFileSync(path.join(process.cwd(), "lib/report-run.ts"), "utf8")));
}
// What the Thesis Hunter found, in the review instead of an email for each find (Hamza, 4 Nov 2026).
{
  const f = (id: string, found: string, stance: "backs" | "challenges" | "update", title: string) => ({ id, found, date: null, title, summary: `${title}, in short.`, stance, pillar: stance === "challenges" ? "Demand tracks GDP" : null, from: "web" as const, source: "Example News", sourceUrl: "https://example.com/a", figure: null, dismissed: false });
  const hunter = { version: 1 as const, updated: "", subjects: { "stock:WATCH": { huntedAt: null, sentence: null, finds: [f("w1", "2026-10-07", "update", "Watched news")] }, "stock:AAPL": { huntedAt: null, sentence: null, finds: [f("a1", "2026-10-06", "backs", "Backing"), f("a2", "2026-10-08", "challenges", "Challenging"), { ...f("a3", "2026-10-08", "backs", "Dismissed"), dismissed: true }, f("a4", "2026-09-20", "backs", "Too old")] }, "market:rates": { huntedAt: null, sentence: null, finds: [f("m1", "2026-10-09", "update", "Rates move")] }, "stock:GONE": { huntedAt: null, sentence: null, finds: [f("g1", "2026-10-07", "update", "Not followed")] } } };
  const names = { held: ["AAPL"], watched: ["WATCH"], markets: { rates: "Rates fall in 2027" } };
  const hw = withHunterFinds(withL, hunter, names);
  const hs = hw.sections.find((x) => x.slot === "review_hunter");
  check("hunter: summarised a line a thesis, holdings first, then the watchlist, then the market theses; an old, dismissed or unfollowed find is left out", hs?.lines.map((l) => l.label).join("|") === "AAPL|WATCH|Rates fall in 2027" && hs.lines[0].value === "1 challenging, 1 backing" && hs.lines[0].tone === "warn" && /^Challenges it \(Demand tracks GDP\): Challenging\. Example News\. Also: Backing\.$/.test(hs.lines[0].detail ?? "") && hs.lines[0].href === "https://example.com/a" && /4 on 3 theses, 1 challenging/.test(hs.heading), JSON.stringify(hs?.lines));
  const many = { ...hunter, subjects: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`stock:H${i}`, { huntedAt: null, sentence: null, finds: Array.from({ length: 5 }, (_, j) => f(`h${i}-${j}`, "2026-10-07", j ? "backs" : "challenges", `Find ${j}`)) }])) };
  const ms = withHunterFinds(withL, many, { ...names, held: Array.from({ length: 12 }, (_, i) => `H${i}`) }).sections.find((x) => x.slot === "review_hunter");
  check("hunter: sixty finds on twelve theses stay a short table, the rest counted", ms?.lines.length === 8 && /the first 8 theses of 12/.test(ms.footer ?? "") && ms.lines.every((l) => (l.detail ?? "").length < 300 && /And 3 more on its page\.$/.test(l.detail ?? "")) && /60 on 12 theses/.test(ms.heading), JSON.stringify(ms?.lines[0]));
  check("hunter: laid right after holdings and theses, once; nothing found or a dashboard report adds nothing", hw.sections.findIndex((x) => x.slot === "review_hunter") === hw.sections.findIndex((x) => x.slot === "review_theses") + 1 && withHunterFinds(hw, hunter, names).sections.filter((x) => x.slot === "review_hunter").length === 1 && withHunterFinds(withL, null, names) === withL && withHunterFinds(withL, { ...hunter, subjects: {} }, names) === withL && withHunterFinds({ ...withL, kind: "today", period: null }, hunter, names).sections.every((x) => x.slot !== "review_hunter"));
  check("hunter: a table in the report", JSON.stringify(reviewPdfPlan(hw)).includes("What the Thesis Hunter found"));
  check("hunter: Reviews carries the slot after holdings and theses, and the run lays it on every review", SCREENS.reviews.slots.indexOf("review_hunter") === SCREENS.reviews.slots.indexOf("review_theses") + 1 && /report = withHunterFinds\(report, hunter,/.test(readFileSync(path.join(process.cwd(), "lib/report-run.ts"), "utf8")));
}
const oldKept = reportSchema.parse({ ...withN, charts: undefined, sections: withN.sections.map((s) => ({ ...s, slot: undefined, part: undefined })) });
check("a review kept before charts and slot tags still plans its chapters, by heading", reviewPdfPlan(oldKept).chapters.length >= 5, pdfOutline(oldKept).join(","));
check("every weekly and monthly is embedded as its own page, so no sections are drawn under it; a daily report still draws them (Hamza, 19 Oct 2026)", embedsItself({ ...weekly, deck: null, pdf: null }) && embedsItself({ ...weekly, kind: "monthly" }) && !embedsItself({ ...weekly, kind: "today" }));
{
  const page = readFileSync("app/(app)/reports/page.tsx", "utf8");
  const one = readFileSync("app/(app)/reports/[id]/page.tsx", "utf8");
  check("Reviews and a review's own page embed the review's page and leave the repeated sections out", /embedsItself\(latest\) \? null : <ReportView report=\{latest\} \/>/.test(page) && /embedsItself\(report\) \? null : <ReportView report=\{report\} \/>/.test(one) && /<ReviewEmbed report=\{latest\} \/>/.test(page) && /<ReviewEmbed report=\{report\} \/>/.test(one) && !/ReviewDeck|google\.com\/presentation/.test(page + one));
  check("no PowerPoint is made for a review any more, and the email carries the PDF report alone", !/pptx|reviewDeck|saveDeck/.test(readFileSync("lib/report-run.ts", "utf8") + readFileSync("lib/report-mail.ts", "utf8") + readFileSync("lib/vault.ts", "utf8")) && /renderReviewPdf\(report\)/.test(readFileSync("lib/report-run.ts", "utf8")));
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
