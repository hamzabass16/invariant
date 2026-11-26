/**
 * Holds the skeleton to hand-worked answers on the fictional samples: which
 * screens and slots a methodology switches on (lib/ontology.ts SCREENS,
 * lib/screens.ts), the caps read out of its rules, the weights against them,
 * the signals, the clocks, what needs the person, and the trade check.
 * Run: npm run check:screens
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { groupNav, initialsOf, NAV, NAV_GROUPS, navFor, SETTINGS, settingsHrefsFor, tabsFor } from "../components/app/nav-items";
import { alertsEmail, alertsFileSchema, alertsView, dismiss, emailWorthy, levelNotices, newsWorthy, markEmailed, newTrades, NEW_TRADE_DAYS, readIds, reconcile, reconcilePrefix, statementNotices, toEmail, TRADE_PREFIX, tradeNotices, tradeWords, triggerNotices, unreadAlerts, WATCH_PREFIX } from "../lib/alerts";
import { COMMUNITY_PREFIX } from "../lib/community";
import { parseScreenWordsResponse, screenClass, screenFilterWords } from "../lib/screen-words";
import { screenWith } from "../lib/screener";
import { parseWatcherResponse, WATCHER_PREFIX, watcherNotices, watcherReadings, readsInSentence, watcherRequestBody, WEIGHT_FIELD } from "../lib/watchers";
import { BRIEF_DAYS, briefReport, companyCharts, companyHref, lastMove, latestReportOf, nextReport, statGroups } from "../lib/company";
const NAV_HREFS = () => NAV.map((n) => n.href as string);
import { EMPTY_DECISIONS, withDecision } from "../lib/decisions";
import { ABANDONED_SENTENCE, BACKOFF_MINUTES, dedupeKey, DISPATCH_CAP, expired, LOCK_MINUTES, MAX_ATTEMPTS, queueLag, resultsHours, retryAt, retryWait, runSlot, summarise, WORKER_START_MS, workersToStart, type JobRow } from "../lib/jobs";
import { FREE_CU_HOURS, onFreePlan, paceOf, parseNeonProject, usageWords } from "../lib/db-usage";
import { logLine, MAX_TEXT, who } from "../lib/log";
import { donutLayout, labelsFit, wrapLabel } from "../lib/donut-layout";
import { bookSchema, type HoldingRecord } from "../lib/holdings";
import { contextFor, evaluate, methodologySchema } from "../lib/methodology";
import { DEFAULT_PRACTICES, FIELD_IDS, FIELDS, PANEL_IDS, SCREEN_IDS, SCREENS, SHOWN_WHEN, SLOT_IDS, SLOTS, describeOntology } from "../lib/ontology";
import { ontologyDetails, ontologyGraph } from "../lib/ontology-graph";
import { closeChanges, positionsOf } from "../lib/positions";
import { cellOf, dayMovers, foldAllocation, gridFair, gridRows, GRID_COLUMNS, GRID_TABS } from "../lib/portfolio-grid";
import { EMPTY_RECORDS } from "../lib/preferences";
import { deriveScreens } from "../lib/screen-data";
import { benchmarkReturn, dashboardHeadline, HEADLINE_BENCHMARKS, headlineTiles, isBookTotal, marketSections, readsComposition, readsPrices, benchmarksOf, capOf, capsFor, capState, classMix, concentration, concentrationInsights, countdown, datedItems, needsYou, readsByHolding, readsSeriesOnly, noticesFor, practicesOf, dividendFocused, readsDividends, screensOn, shownWhen, signalsFor, slotsOn, unreadNotices, weightsFor , repeatsConcentration } from "../lib/screens";
import { modulesFor, setupSchema, type Setup } from "../lib/setup";
import { maskMoney, publicPath } from "../lib/stealth";
import { companiesSearchHref, paletteResults, ruleEntries, tickerEntries, type PaletteSources } from "../lib/palette";
import { decisionsOwed, RESONANCE_ABOUT, resonanceOf } from "../lib/resonance";
import { sectionMark } from "../lib/cite";
import type { Finding } from "../lib/methodology";
import type { TodoItem } from "../lib/todo";
import { mayReload, mendsOnReload, pageFailedWords, RELOAD_GUARD_MS, unreachedKind, unreachedSentence, DIRECT_UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES, uploadTooLarge } from "../lib/reach";
import { closeRecap, deviceLabel, EMPTY_PUSH, MAX_DEVICES, recapDue, recapItems, recapSent, subscriptionSchema, withDevice, withoutDevices } from "../lib/push";
import { HUNTER_PREFIX } from "../lib/alerts";
import { bookAfter, checkTrade } from "../lib/trade-check";
import { decisionsFileSchema } from "../lib/decisions";
import { filingsFileSchema } from "../lib/filings";
import { DEMO_RECAP_NEWSLETTERS, recapsFileSchema } from "../lib/market-recap";
import { researchFileSchema } from "../lib/research";
import { composeBook } from "../lib/compose-book";
import { EMPTY_MARKETS } from "../lib/markets";
import { TOUR, TOUR_APP } from "../lib/tour";
import { WELCOME_STEPS } from "../lib/welcome";
import { OPEN_PAGE_REFRESH_MINUTES } from "../lib/live";
import { AWAY_MS, GREETING_GAP_MS, greetingFor, isEarningsSeason, isLaunch, mergedShown, nextQuote, quoteKey, QUOTES, quoteOfDay, shouldGreet, timeGreeting, withShown } from "../lib/greeting";
import { livePositions, repriceHoldings, yearBase, yearReturn, yearStrip, type LiveQuote } from "../lib/live";
import { asClosed, bookFreshness, closedOn, freshness } from "../lib/freshness";
import { reorderNav, DEFAULT_PREFERENCES, preferencesSchema } from "../lib/preferences";
import type { Figure } from "../lib/recipes";
import { addPortfolio, defaultPortfolios, lensFor, lensIds, lensView, portfolioLabel, moveAccount, perPortfolio, portfoliosFileSchema, removePortfolio, renamePortfolio, scopeBook, withNewAccounts, withPortfolioMethodology } from "../lib/portfolios";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "MISS"} ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
}

/** A tour step's page, by its address. */
const pageOf = (href: string) => (href === "/" ? "app/(app)/page.tsx" : `app/(app)${href}/page.tsx`);
/** A page's own text and the app's components it draws (a list kept in the browser, like Notifications'), for the tour's targets. */
const drawn = (href: string) => {
  const page = readFileSync(pageOf(href), "utf8");
  const parts = [...page.matchAll(/from "@\/components\/([^"]+)"/g)].map((m) => `components/${m[1]}.tsx`).filter((f) => existsSync(f)).map((f) => readFileSync(f, "utf8"));
  return [page, ...parts].join("\n");
};
const read = (f: string) => JSON.parse(readFileSync(`data/samples/${f}`, "utf8"));
const near = (a: number | null, b: number, tol = 0.01) => a !== null && Math.abs(a - b) <= tol;

const dani = bookSchema.parse(read("dani.book.json"));
const dad = bookSchema.parse(read("dad.book.json"));
const mInd = methodologySchema.parse(read("methodology.individual.json"));
const mDiv = methodologySchema.parse(read("methodology.dividend_growth.json"));
const mFam = methodologySchema.parse(read("methodology.family_office.json"));
const today = "2026-10-11";
const BOTH = ["ibkr", "schwab"] as const;
const setup = (over: Partial<Setup>): Setup => setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: [...BOTH], tradesOptions: true, helperName: null, methodology: null, updated: today, ...over });

// --- The tables ---------------------------------------------------------------
check("every screen's slots exist", SCREEN_IDS.every((id) => SCREENS[id].slots.every((s) => (SLOT_IDS as readonly string[]).includes(s))));
check("every slot sits on exactly one screen", SLOT_IDS.every((s) => SCREEN_IDS.filter((id) => SCREENS[id].slots.includes(s)).length === 1));
check("the skeleton's first screen is Today at /", SCREEN_IDS[0] === "today" && SCREENS.today.href === "/");
check("six screens can be phone tabs: the Dashboard, At the Close, Holdings, Performance, Earnings and Dividends", SCREEN_IDS.filter((id) => SCREENS[id].tab).join(",") === "today,after_close,holdings,performance,earnings,dividends" && SCREENS.today.label === "Dashboard" && !(SCREEN_IDS as readonly string[]).includes("dashboard"));
check("the Dashboard is the first screen: the book now and the headline, the session, the book's day, fear and greed, on watch, the latest review, then the methodology's sections (Hamza, 15 Oct 2026: no class mix, no unclassified list, no duplicate index tiles, no rule checks and no weights against caps, which Methodology and Holdings carry; 18 Oct 2026: After the close and What happened on At the Close; 21 Nov 2026: the portfolio as one ruled grid at the top)", SCREENS.today.slots.join(",") === "live_book,portfolio_grid,headline,dividend_glance,return_chart,market_indices,market_heatmap,market_drivers,market_movers,book_day,todo,fear_greed,on_watch,latest_review,sections,your_data_today");
check("At the Close is the screen after Notifications in the sidebar (Hamza, 18 Oct 2026) with After the close and What happened, then the podcasts (20 Oct 2026), and the Dashboard no longer draws them", !SCREENS.after_close.under && SCREENS.after_close.href === "/after-close" && SCREENS.after_close.slots.join(",") === "close_brief,extended_hours,market_today,company_news,podcasts" && /<PodcastEpisodes/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")) && SCREEN_IDS.indexOf("after_close") === SCREEN_IDS.indexOf("notifications") + 1 && SCREENS.after_close.tab && !/CloseBrief|WhatHappened|session\.brief|session\.happened/.test(readFileSync("app/(app)/page.tsx", "utf8")) && !/brief:|happened:/.test(readFileSync("components/live/live.tsx", "utf8")) && /<CloseBrief/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")) && /<WhatHappened/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")) && !/after-close|underScreen/.test(readFileSync("app/(app)/notifications/page.tsx", "utf8")) && /redirect\("\/after-close" as Route\)/.test(readFileSync("app/(app)/markets-today/page.tsx", "utf8")));
check("Performance leads with the methodology's returns and risk", SCREENS.performance.slots[0] === "perf_sections");
{
  const mShow = methodologySchema.parse(read("methodology.showcase.json"));
  const byLabel = (l: string) => mShow.dashboard.sections.find((x) => x.kind === "figures" && x.label === l)!;
  check("a section of returns and risk alone goes to Performance; one that mixes in holdings or markets stays", readsSeriesOnly(mShow, byLabel("Concentration Principle")) && !readsSeriesOnly(mShow, byLabel("Diversification")) && !readsSeriesOnly(mShow, byLabel("Macroeconomic Analysis & Time-Horizon Framework")) && !readsSeriesOnly(null, byLabel("Concentration Principle")));
  check("a section of holding counts, top shares and weights by sector repeats Concentration and Sectors and is left out of Holdings; one of returns or markets is not (Hamza, 19 Oct 2026)", repeatsConcentration(mShow, byLabel("Diversification")) && !repeatsConcentration(mShow, byLabel("Concentration Principle")) && !repeatsConcentration(mShow, byLabel("Macroeconomic Analysis & Time-Horizon Framework")) && /!repeatsConcentration\(setup\.methodology, s\)/.test(readFileSync("app/(app)/holdings/page.tsx", "utf8")));
  const holdingsSrc = readFileSync("app/(app)/holdings/page.tsx", "utf8");
  const moneySrc = readFileSync("components/holdings/where-money-is.tsx", "utf8");
  check("Holdings: the book's look-through flow after what each holding made, and the company page and the earnings card draw the income flow (Hamza, 5 Nov 2026)", SCREENS.holdings.slots.indexOf("book_flow") === SCREENS.holdings.slots.indexOf("what_made") + 1 && /lookThroughFlow\(/.test(holdingsSrc) && /<IncomeFlowChart /.test(holdingsSrc) && /<IncomeFlowChart /.test(readFileSync("app/(app)/company/[symbol]/page.tsx", "utf8")) && /<IncomeFlowChart /.test(readFileSync("components/earnings/report.tsx", "utf8")));
  check("Holdings: the portfolio P/E, the value map (Hamza, 24 Oct 2026) and what each holding made after the positions, Sectors looking through funds, and Where the money is without the net worth tile, the asset-class list or the themes (Hamza, 19 Oct 2026)", SCREENS.holdings.slots.indexOf("fair_value") === SCREENS.holdings.slots.indexOf("positions") + 1 && SCREENS.holdings.slots.indexOf("portfolio_pe") === SCREENS.holdings.slots.indexOf("fair_value") + 1 && /<FairValueCard /.test(holdingsSrc) && SCREENS.holdings.slots.indexOf("value_map") === SCREENS.holdings.slots.indexOf("portfolio_pe") + 1 && SCREENS.holdings.slots.indexOf("what_made") === SCREENS.holdings.slots.indexOf("value_map") + 1 && /<PortfolioPeCard /.test(holdingsSrc) && /<ValueMapCard /.test(holdingsSrc) && /<WhatEachMade /.test(holdingsSrc) && /sectorsLookingThrough\(/.test(holdingsSrc) && !/label="Net worth"/.test(moneySrc) && !/header="By asset class"/.test(moneySrc) && !/Themes, looking through funds/.test(moneySrc) && !/<Donut/.test(moneySrc));
  // One donut card with a tab per view (Hamza, 19 Oct 2026): holding, class, asset class, sector, region, currency; no donut of its own anywhere else on Holdings.
  check("Holdings draws one donut card whose tabs are the views the slots switch on, in place of a card each (Hamza, 19 Oct 2026)", /<DonutTabs id="composition" views=\{views\}/.test(holdingsSrc) && !/<PortfolioDonuts|<RevenueGeography|<Donut\b/.test(holdingsSrc) && ["holdingView(", "classView(", "assetClassView(book)", "regionView(book)", "currencyView(book)", 'key: "sectors"'].every((x) => holdingsSrc.includes(x)) && /role="tablist"/.test(readFileSync("components/charts/donut-tabs.tsx", "utf8")) && /<SliceBars/.test(readFileSync("components/charts/donut-tabs.tsx", "utf8")));
  const holdingsPanel = mShow.dashboard.sections.find((x) => x.kind === "panel" && x.id === "holdings")!;
  const freshness = mShow.dashboard.sections.find((x) => x.kind === "panel" && x.id === "freshness")!;
  check("a section listing the holdings one by one or class by class is left to Holdings; the book's shape, markets and freshness stay on the Dashboard", readsByHolding(mShow, byLabel("Archetype caps")) && readsByHolding(mShow, byLabel("Classification Test inputs")) && readsByHolding(mShow, holdingsPanel) && !readsByHolding(mShow, byLabel("Diversification")) && !readsByHolding(mShow, byLabel("Macroeconomic Analysis & Time-Horizon Framework")) && !readsByHolding(mShow, byLabel("Long-term supply-side indicators")) && !readsByHolding(mShow, freshness));
  const dash = readFileSync("app/(app)/page.tsx", "utf8");
  check("the Dashboard draws no list of the holdings of its own", !/header="Your holdings"/.test(dash) && /readsByHolding\(m, s\)/.test(dash));
  check("the Dashboard carries no unread-notifications link; the top menu and tab bar badges carry the count (Hamza, 18 Oct 2026)", !/unread notification/.test(dash) && /unread/.test(readFileSync("components/app/top-bar.tsx", "utf8")));
  // Hamza, 18 Oct 2026: a section with a figure over the markets is Markets' own (the screen is named after the first), so the Dashboard leaves it out while Markets is on.
  check("a section with a market figure is drawn on Markets, not the Dashboard, while Markets is on", marketSections(mShow).map((s) => s.label).join("|") === "Macroeconomic Analysis & Time-Horizon Framework|Long-term supply-side indicators" && /ws\.screens\.includes\("markets"\) \? new Set\(marketSections\(m\)/.test(dash) && /onMarkets\.has\(s\.label\)/.test(dash), marketSections(mShow).map((s) => s.label).join("|"));
}
check("Trades, Trade check, Decision Log and the to-do each hang on a practice", SCREENS.trades.practice === "trade_log" && SCREENS.check.practice === "trade_check" && SCREENS.decisions.practice === "decision_log" && SCREENS.todo.practice === "todo_list" && SLOTS.todo.practice === "todo_list" && SLOTS.unlogged.practice === "decision_log");
check("the drafter reads the screens", /Screens \(the same skeleton/.test(describeOntology()) && /market_drivers \(markets\)/.test(describeOntology()) && /book_day \(always\)/.test(describeOntology()));

// --- What is on ---------------------------------------------------------------
const shownInd = shownWhen(mInd, dani, EMPTY_RECORDS, EMPTY_DECISIONS);
check("options income rules: classes, caps, tests, a watch, series, a benchmark, transactions", shownInd.classes && shownInd.caps && shownInd.tests && shownInd.watch && shownInd.series && shownInd.benchmark && shownInd.transactions, JSON.stringify(shownInd));
check("no fundamentals figure, no fundamentals slot", !shownInd.fundamentals && !slotsOn("holdings", shownInd).includes("holding_fundamentals"));
check("a VIX figure switches the Markets screen on; dividend growth has none", shownInd.markets && screensOn(shownInd).includes("markets") && !shownWhen(mDiv, dani, EMPTY_RECORDS, EMPTY_DECISIONS).markets);
check("an expiry in the book dates the calendar", shownInd.dates && screensOn(shownInd).includes("calendar"));
const shownDiv = shownWhen(mDiv, dani, EMPTY_RECORDS, EMPTY_DECISIONS);
check("dividend growth names no series figure: Performance stays off", !shownDiv.series && !screensOn(shownDiv).includes("performance"));
check("no decisions yet: the Decision Log check on Trades is off", !slotsOn("trades", shownDiv).includes("unlogged"));
check("one entry switches it on, once the Decision Log is kept", slotsOn("trades", shownWhen(mDiv, dani, EMPTY_RECORDS, withDecision(EMPTY_DECISIONS, { id: "2026-10-11-01", date: today, kind: "trade", symbol: "AAPL", title: "Trim", text: "", filedAt: "2026-10-11T00:00:00.000Z" }, "2026-10-11T00:00:00.000Z"), ["trade_log", "decision_log"])).includes("unlogged"));
const shownNone = shownWhen(null, dani, EMPTY_RECORDS, EMPTY_DECISIONS);
check("no methodology, a nav series: Performance on, Signals and caps off", shownNone.series && !shownNone.tests && !shownNone.caps && !screensOn(shownNone).includes("signals") && !slotsOn("holdings", shownNone).includes("by_class"));
check("Research and Analyst follow a confirmed methodology", !screensOn(shownNone).includes("research") && screensOn(shownInd).includes("analyst"));
const shownFam = shownWhen(mFam, dad, EMPTY_RECORDS, EMPTY_DECISIONS);
check("family office: no series, no Performance; maturities date the calendar", !shownFam.series && shownFam.dates);
check("modules follow: performance and trades on for the options sample", modulesFor(setup({ methodology: mInd }), dani).includes("performance") && modulesFor(setup({ methodology: mInd }), dani).includes("trades"));
check("modules follow: no performance module for dividend growth", !modulesFor(setup({ methodology: mDiv }), dani).includes("performance"));

// --- Nav ----------------------------------------------------------------------
const navInd = navFor(modulesFor(setup({ methodology: mInd }), dani), screensOn(shownInd));
check("the top menu starts with the Dashboard and ends with Settings", navInd[0].id === "today" && navInd.at(-1)!.id === "more", navInd.map((n) => n.id).join(","));
check("At the Close is the third screen in the top menu, right after Notifications (Hamza, 18 Oct 2026)", navInd.map((n) => n.id).slice(0, 3).join(",") === "today,notifications,after_close", navInd.map((n) => n.id).join(","));
check("the top menu keeps the skeleton's order", navInd.findIndex((n) => n.id === "holdings") < navInd.findIndex((n) => n.id === "performance") && navInd.findIndex((n) => n.id === "methodology") < navInd.findIndex((n) => n.id === "options"));
const tabs = tabsFor(navInd);
check("the phone tabs are the Dashboard, Holdings, Performance, At the Close, More (Hamza, 23 Oct 2026: At the Close in Earnings' place)", tabs.tabs.map((t) => t.id).join(",") === "today,holdings,performance,after_close,more", tabs.tabs.map((t) => t.id).join(","));
check("More lists the rest without itself", tabs.overflow.length === navInd.length - 5 && !tabs.overflow.some((n) => n.id === "more"));
const navDiv = navFor(modulesFor(setup({ methodology: mDiv }), dani), screensOn(shownDiv));
check("a dividend methodology puts Dividends right after Holdings, in the bar and the phone's tabs; without Performance, At the Close still closes the row (Hamza, 19 and 23 Oct 2026)", tabsFor(navDiv).tabs.map((t) => t.id).join(",") === "today,holdings,dividends,after_close,more" && navDiv[navDiv.findIndex((n) => n.id === "holdings") + 1]?.id === "dividends", tabsFor(navDiv).tabs.map((t) => t.id).join(","));
check("a methodology not for dividends keeps Dividends after Earnings and out of the tabs while four come first", navInd.findIndex((n) => n.id === "dividends") === navInd.findIndex((n) => n.id === "earnings") + 1 && !tabs.tabs.some((t) => t.id === "dividends"), navInd.map((n) => n.id).join(","));
check("the dividend sample is a dividend methodology, the options one and the family policy are not; Dividends is on for a book that pays one, and the Dashboard's dividend tiles only for a dividend methodology", dividendFocused(mDiv) && !dividendFocused(mInd) && shownInd.dividends && shownDiv.dividend_focus && !shownInd.dividend_focus && slotsOn("today", shownDiv).includes("dividend_glance") && !slotsOn("today", shownInd).includes("dividend_glance") && !shownWhen(null, { ...dani, transactions: [] }, null, null).dividends);
check("the Dashboard's dividend tiles stand aside when a headline figure already reads the dividends", mDiv.figures.some(readsDividends) && !mInd.figures.filter((f) => mInd.dashboard.headline.includes(f.id)).some(readsDividends));
{
  const divSrc = readFileSync("app/(app)/dividends/page.tsx", "utf8");
  check("the Dividends screen draws its slots, each on its own switch, and says what it needs when the ledger has no dividend", SCREENS.dividends.slots.every((sl) => divSrc.includes(`"${sl}"`)) && /<NoLedger \/>/.test(divSrc) && /ws\.screens\.includes\("dividends"\)/.test(divSrc) && NAV_GROUPS.find((g) => g.id === "book")!.screens.includes("dividends"));
  check("stealth mode: the eye sits beside Settings and in the phone's nav bar, the mask runs on every page from the root layout, the server sets it before the first paint, and the Cookies page names its cookie (Hamza, 19 Oct 2026)", /<StealthToggle \/>\s*<div className="group relative shrink-0">/.test(readFileSync("components/app/top-bar.tsx", "utf8")) && /<StealthToggle compact \/>/.test(readFileSync("components/ui/page-header.tsx", "utf8")) && /<StealthMask \/>/.test(readFileSync("app/layout.tsx", "utf8")) && /data-stealth=\{stealth\}/.test(readFileSync("app/layout.tsx", "utf8")) && /pos_stealth/.test(readFileSync("app/cookies/page.tsx", "utf8")));
  const masked = ["Net worth $56,012 · up 0.4%", "-$12.50", "€56k", "CA$3,000", "CHF 1,200", "$1.2bn", "+$310 (0.6%)"].map(maskMoney);
  check("stealth masks every amount with a currency sign or code and leaves percentages, counts, dates and a price written with its code after it", masked.join("|") === "Net worth ••••• · up 0.4%|•••••|•••••|•••••|•••••|•••••|••••• (0.6%)" && ["12.5%", "Q3 2026", "9 holdings", "123.45 USD", "FY2025"].every((t) => maskMoney(t) === t), masked.join("|"));
  check("stealth hides the person's own money only: a public screen keeps its amounts but a holding's value marked private; elsewhere the S&P 500's day, prices out of hours and company news are left (Hamza, 7 Nov 2026)", publicPath("/company/AAPL") && publicPath("/screener") && publicPath("/markets") && !publicPath("/markets-today") && !publicPath("/holdings") && !publicPath("/") && !publicPath("/companyx") && /data-private=""/.test(readFileSync("app/(app)/company/[symbol]/page.tsx", "utf8")) && /data-public=""/.test(readFileSync("components/markets/heat-map.tsx", "utf8")) && /data-public=""/.test(readFileSync("components/live/extended-hours.tsx", "utf8")) && /closest\("\[data-private\]"\)/.test(readFileSync("components/app/stealth.tsx", "utf8")));
}

// Hamza, 19 Oct 2026: Newsletters is no screen of its own: its setup is the Newsletters card on Setup, its newsletters are on At the Close, and /newsletters goes there.
const modsInd = modulesFor(setup({ methodology: mInd }), dani);
{
  const card = readFileSync("components/setup/input-cards.tsx", "utf8");
  const page = readFileSync("app/(app)/newsletters/page.tsx", "utf8");
  check("Newsletters is the card on Setup, with the forwarding check, the filter, the last week's prompt and where the recap comes from", !(SCREEN_IDS as readonly string[]).includes("newsletters") && /redirect\("\/setup#newsletters"\)/.test(page) && ["ForwardingWatch", "FilterBuilder", "InboxCheck", "RecapChoiceForm", "backfill"].every((x) => card.includes(x)), page.slice(0, 200));
  check("At the Close no longer folds a Where it comes from section", !/Where it comes from/.test(readFileSync("components/markets/what-happened.tsx", "utf8")));
}

// Hamza, 19 Oct 2026: a menu at the top of the page replaces the sidebar; Sources & settings is Settings, a hover menu of its tabs, and the IBKR source's freshness is on Setup.
{
  const top = readFileSync("components/app/top-bar.tsx", "utf8");
  const shell = readFileSync("components/app/app-shell.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  check("the laptop shell is a top menu, not a sidebar", /TopBar/.test(shell) && !/Sidebar/.test(shell) && !existsSync("components/app/sidebar.tsx") && /sticky top-0/.test(top) && /hidden lg:block/.test(top));
  // Hamza, 11 Nov 2026: one surface, no layers, so the top menu sits on the page's own ground with one hairline under it, never a tinted or blurred bar.
  check("the top menu sits on the page's ground with one hairline, no blur and no tint", /\.top-menu \{[^}]*background: var\(--shell\)[^}]*border-bottom: 1px solid var\(--hairline\)/.test(css) && !/\.top-menu \{[^}]*backdrop-filter/.test(css) && /--shell: #0a0a0b/.test(css));
  check("Settings is a menu opened on hover with Setup and Customise as its tabs (Newsletters and the SEC contact are cards on Setup)", SCREENS.more.label === "Settings" && SETTINGS.map((t) => t.href).join(",") === "/setup,/customise" && /group-hover:visible/.test(top) && /settingsFor\(settingsHrefs\)/.test(top));
  check("every person's Settings menu is Setup and Customise", settingsHrefsFor(["setup", "overview"], ["today", "more"]).join(",") === "/setup,/customise" && settingsHrefsFor(modsInd, ["today"]).join(",") === "/setup,/customise");
  // Hamza, 19 Oct 2026: every screen in the bar or under its category, no More; 4 Nov 2026: five places; 6 Nov 2026: Markets split from Research.
  const alone = ["more"];
  check("the top menu has six places: Today, Book, Research, Markets, Rules and Reviews", NAV_GROUPS.map((g) => g.label).join(",") === "Today,Book,Research,Markets,Rules,Reviews" && NAV_GROUPS.every((g) => g.screens.length <= 9) && ["today", "notifications", "after_close"].every((id) => NAV_GROUPS[0].screens.includes(id as (typeof SCREEN_IDS)[number])) && NAV_GROUPS.find((g) => g.id === "reviews")!.screens.join(",") === "reviews" && NAV_GROUPS.find((g) => g.id === "rules")!.extras?.some((x) => x.after === "methodology" && x.href.includes("view=evaluation")) === true);
  check("every screen but Settings has a category, and none has two", SCREEN_IDS.filter((id) => !alone.includes(id)).every((id) => NAV_GROUPS.filter((g) => g.screens.includes(id)).length === 1) && !NAV_GROUPS.some((g) => g.screens.some((id) => alone.includes(id))));
  const entries = groupNav(navInd);
  const drawn = entries.flatMap((e) => (e.kind === "screen" ? [e.item.id] : e.items.map((n) => n.id)));
  check("the top menu draws each screen once, alone or under its category, Today first, with no More", drawn.length === navInd.length && navInd.every((n) => drawn.includes(n.id)) && entries[0].kind === "group" && entries[0].group.id === "today" && entries.some((e) => e.kind === "group") && !/More screens|moreClass|IN_ROW/.test(top) && /groupNav\(items\)/.test(top), entries.map((e) => (e.kind === "screen" ? e.item.id : `${e.group.id}(${e.items.length})`)).join(","));
  const one = groupNav(NAV.filter((n) => ["today", "holdings", "research", "theses"].includes(n.id)));
  check("a category with one screen on draws that screen alone", one.map((e) => (e.kind === "screen" ? e.item.id : e.group.id)).join(",") === "today,holdings,research");
  const reordered = groupNav(["reviews", "methodology", "todo", "theses", "holdings", "today", "notifications", "more"].map((id) => NAV.find((n) => n.id === id)!));
  check("the five places keep their order whatever the screens' order, the person's order holding within each, a screen in none after them", reordered.map((e) => (e.kind === "screen" ? e.item.id : `${e.group.id}(${e.items.map((n) => n.id).join("+")})`)).join(",") === "today(today+notifications),holdings,theses,rules(methodology+todo),reviews,more", reordered.map((e) => (e.kind === "screen" ? e.item.id : `${e.group.id}(${e.items.map((n) => n.id).join("+")})`)).join(","));
  // The portfolio selector and the account menu at the top right.
  const menus = readFileSync("components/app/top-menus.tsx", "utf8");
  check("the top bar carries the portfolio selector before Settings and the account menu after it", top.indexOf("<PortfolioMenu") < top.indexOf("settingsOpen && \"top-item-current\"") && top.indexOf("<AccountMenu") > top.indexOf("settingsOpen && \"top-item-current\""));
  check("the account menu links account settings, profile, help, privacy, cookies and terms, switches the theme and signs out", ["/account", "/setup#group-5", "/help", "/privacy", "/cookies", "/terms"].every((h) => menus.includes(`"${h}"`)) && /setThemeAction/.test(menus) && /signOutAction/.test(menus) && existsSync("app/(app)/account/page.tsx") && existsSync("app/(app)/help/page.tsx") && existsSync("app/cookies/page.tsx"));
  check("the initials are the first and last name's, or the one name's first letter", initialsOf("Hamza Bassatne", "x@y.z") === "HB" && initialsOf("Hamza", "x@y.z") === "H" && initialsOf(null, "dani.n@x.com") === "DA");
  const pf = portfoliosFileSchema.parse({ version: 1, mode: "one", updated: "", items: [{ id: "ibkr", name: "U123", accounts: ["U123"] }, { id: "schwab", name: "Schwab", accounts: ["S9"] }, { id: "home", name: "Home", accounts: ["H1"] }] });
  check("a choice of portfolios is kept as one id, several joined, or none for all", lensFor(pf, []) === null && lensFor(pf, ["ibkr", "schwab", "home"]) === null && lensFor(pf, ["schwab"]) === "schwab" && lensFor(pf, ["home", "ibkr"]) === "ibkr,home" && lensFor(pf, ["gone"]) === null && lensIds(pf, "ibkr,home,gone").join(",") === "ibkr,home");
  const pfBook = bookSchema.parse({ asOf: "2026-10-09", holdings: [{ id: "a", account: "U123", source: "ibkr", symbol: "AAA", name: "A", assetClass: "equity", quantity: 1, price: 10, currency: "USD", value: 10, costBasis: null, asOf: "2026-10-09", valuation: "broker", country: null, sector: null, themes: [] }, { id: "b", account: "S9", source: "snaptrade", symbol: "BBB", name: "B", assetClass: "equity", quantity: 1, price: 5, currency: "USD", value: 5, costBasis: null, asOf: "2026-10-09", valuation: "broker", country: null, sector: null, themes: [] }, { id: "c", account: "H1", source: "manual", symbol: "CCC", name: "C", assetClass: "equity", quantity: 1, price: 1, currency: "USD", value: 1, costBasis: null, asOf: "2026-10-09", valuation: "broker", country: null, sector: null, themes: [] }], lookThrough: [], transactions: [], fx: { base: "USD", asOf: "2026-10-09", rates: {}, source: "t" } });
  const agg = lensView(pf, "ibkr,home", null, pfBook);
  check("several portfolios together are their accounts together, named by theirs, with no methodology of their own", agg.portfolio?.name === "U123 + Home" && agg.book?.holdings.map((h) => h.symbol).join(",") === "AAA,CCC" && agg.methodology === null && lensView(pf, "ibkr,schwab,home", null, pfBook).portfolio === null);
  check("a portfolio still named after its account reads as the owner's and the broker's; a name given is kept", portfolioLabel(pf.items[0], "Hamza Bassatne", pfBook) === "Hamza's IBKR" && portfolioLabel(pf.items[1], "Hamza", pfBook) === "Schwab" && portfolioLabel(pf.items[0], "Charles", pfBook) === "Charles' IBKR" && portfolioLabel(pf.items[0], null, pfBook) === "U123");
  const more = readFileSync("app/(app)/more/page.tsx", "utf8");
  check("the Settings page (the phone's More) lists the same tabs and no Sources section; the source's freshness is on Setup", /title="Settings"/.test(more) && !/header="Sources"/.test(more) && /settingsFor\(settingsHrefsFor/.test(more) && /stale \? "Stale" : held \? "Current"/.test(readFileSync("components/setup/input-cards.tsx", "utf8")));
}

// Hamza, 19 Oct 2026: every list of things is a grid of cards; settings rows, forms and label-and-value rows stay rows.
{
  const list = readFileSync("components/ui/list.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  check("ListSection draws a list of things as a grid of cards on `grid`, two to a row on `wide`", /grid \? cn\("grid-cards pair-grid-sm grid grid-cols-1 gap-3 sm:grid-cols-2", grid !== "wide" \? "trio-grid lg:grid-cols-3" : "pair-grid"\)/.test(list) && /\.grid-cards > \* \{/.test(css) && /\.grid-cards > \.flex > svg \{\s*display: none/.test(css));
  const grids = ["app/(app)/holdings/page.tsx", "app/(app)/watchlist/page.tsx", "app/(app)/trades/page.tsx", "components/earnings/decks.tsx", "app/(app)/research/page.tsx", "app/(app)/decisions/page.tsx", "components/notifications/notices.tsx", "app/(app)/reports/page.tsx"];
  // Community's people are cards in the rail beside its feed, after Blossom (Hamza, 6 Nov 2026).
  check("Community's people are cards beside the feed", /<PersonCard /.test(readFileSync("app/(app)/community/page.tsx", "utf8")));
  check("holdings, watchlist, trades, decks, studies, decisions, notices and reviews are grids", grids.every((f) => /<ListSection grid/.test(readFileSync(f, "utf8"))), grids.filter((f) => !/<ListSection grid/.test(readFileSync(f, "utf8"))).join(","));
  const forms = ["app/(app)/check/page.tsx", "app/(app)/customise/page.tsx", "app/(app)/more/page.tsx"];
  check("forms and settings rows stay rows", forms.every((f) => !/<ListSection grid/.test(readFileSync(f, "utf8"))));
  check("the Decision Log's entries sit in one grid", /<ListSection grid header=\{filtered \? `Entries naming \$\{filtered\}` : `Entries · \$\{entries\.length\}`\}>/.test(readFileSync("app/(app)/decisions/page.tsx", "utf8")));
}
{
  const happened = readFileSync("components/markets/what-happened.tsx", "utf8");
  const cards = readFileSync("components/markets/newsletter-cards.tsx", "utf8");
  check("the recap shown is the newest weekday issue, Friday's on a weekend (Hamza, 18 Oct 2026); the StockMKTNewz recap is each person's own subscription, forwarded by the same Gmail filter, whose list always carries its sender, and the shared copy is the operator's alone (Hamza, 20 Oct 2026), drawn with its writer and sign-up page however it came; the demo names an invented recap instead (4 Nov 2026)", /recapToShow\(/.test(happened) && /isWeekendDay\(today\)/.test(happened) && /sharedOn: boolean/.test(happened) && /sharedOn=\{sharedRecapOn\(ws\.operator\.email\)\}/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")) && /const known = recapNewslettersFor\(demo\)\.find\(/.test(cards) && /recapNewslettersFor\(demo\)/.test(happened) && /demo \? DEMO_RECAP_NEWSLETTERS : RECAP_NEWSLETTERS/.test(readFileSync("lib/market-recap.ts", "utf8")) && !/stockmktnewz|beehiiv/i.test(JSON.stringify(DEMO_RECAP_NEWSLETTERS)) && /known\.signUp/.test(cards) && /with your Gmail\. The filter made in step 2 already carries its sender/.test(readFileSync("components/newsletters/recap-guide.tsx", "utf8")) && /filterSenders\(/.test(readFileSync("components/newsletters/filter-builder.tsx", "utf8")) && /Always in the filter/.test(readFileSync("components/newsletters/filter-builder.tsx", "utf8")) && /const recapLetter = recapNewslettersFor\(demo\)\[0\]/.test(readFileSync("components/setup/input-cards.tsx", "utf8")) && /recap=\{recap\.newsletter \? recapLetter : null\}/.test(readFileSync("components/setup/input-cards.tsx", "utf8")) && /recapNewslettersFor\(demo\)\.map\(\(n\) => n\.sender\)/.test(readFileSync("components/setup/setup-data.ts", "utf8")) && /laySharedRecapsInto/.test(readFileSync("lib/market-recap-run.ts", "utf8")) && /sharedRecapOn\(/.test(readFileSync("lib/daily-sync.ts", "utf8")) && /sharedRecapOn\(email\)/.test(readFileSync("lib/catch-up.ts", "utf8")) && /SHARED_RECAP_TO/.test(readFileSync("lib/shared-recap-run.ts", "utf8")) && /unstable_cache\(/.test(readFileSync("lib/shared-recap-run.ts", "utf8")) && /sharedRecapSender\(/.test(readFileSync("lib/inbox-run.ts", "utf8")) && /subscribedRecapSender\(/.test(readFileSync("lib/inbox-run.ts", "utf8")) && /for the operator's own use/.test(readFileSync("app/privacy/page.tsx", "utf8")));
  check("What happened is two sections (Hamza, 18 Oct 2026): the day's recap newsletter open with its stories' pictures, then the week's newsletters by theme with a week or day switch, ranked by the theses and the book, closed until opened, unread until opened", /isRecapDigest\(/.test(happened) && /digestsOfWeek\(/.test(happened) && /<RecapNewsletter/.test(happened) && /<ThemedNewsletters/.test(happened) && /theses: readonly string\[\]/.test(happened) && /readIds: readonly string\[\]/.test(happened) && /byTheme\(/.test(cards) && /rankDigests\(/.test(cards) && /useState<NewsletterSpan>\("week"\)/.test(cards) && /role="tablist"/.test(cards) && /<NewsletterPictures[^>]*recap/.test(cards) && /markNewsletterReadAction\(/.test(cards) && /unreadOf\(/.test(cards) && /<details className="group border-t border-hairline" onToggle/.test(cards) && !/open=\{true\}/.test(cards) && /weights=\{/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")) && /thesesFor\(ws\)/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")) && /readIds=\{ws\.preferences\.newslettersRead\}/.test(readFileSync("app/(app)/after-close/page.tsx", "utf8")));
  check("opening a newsletter writes its id to the preferences, once, never in the demo", /newslettersRead: withRead\(/.test(readFileSync("app/(app)/newsletters/actions.ts", "utf8")) && /ws\.mode !== "drive"\) return \{ error: null \}/.test(readFileSync("app/(app)/newsletters/actions.ts", "utf8")) && preferencesSchema.parse({ ...EMPTY_PREFS(), newslettersRead: undefined }).newslettersRead.length === 0);
  const images = readFileSync("components/newsletters/newsletter-images.tsx", "utf8");
  {
    // Hamza, 23 Oct 2026: never a long card beside an empty column. A two-column page flows its sections through both columns, and a half column's grid keeps two to a row.
    const pages = ["holdings/[symbol]", "theses/[symbol]", "theses/market/[id]", "trades/[symbol]", "trades", "account", "more", "help", "check"].map((p) => readFileSync(`app/(app)/${p}/page.tsx`, "utf8"));
    const css = readFileSync("app/globals.css", "utf8");
    check("two-column pages flow their sections through both columns, so neither ends long before the other", pages.every((s) => s.includes('className="flow-cols"') && !s.includes('className="grid gap-8 lg:grid-cols-2"')) && /\.flow-cols \{ column-count: 2;/.test(css) && /\.flow-col \{ display: contents; \}/.test(css) && /\.flow-cols \.trio-grid \{ grid-template-columns: repeat\(4/.test(css));
    const holding = readFileSync("app/(app)/holdings/[symbol]/page.tsx", "utf8");
    check("a holding's triggers and rules are lists, its geography a donut, its amounts shortened", /<ListSection header=\{`Triggers and kill signals/.test(holding) && /<ListSection header=\{`Rules on this holding/.test(holding) && /<CompanyGeography geography=/.test(holding) && /fieldText\(k, v,/.test(holding) && readFileSync("app/(app)/community/page.tsx", "utf8").includes("<details className=\"card px-4 py-3\">"));
  }
  check("a recap from an earlier session dates its header and says the day's has not arrived, and its other story pictures follow its points (Hamza, 23 Oct 2026)", /const fresh = todayRecap \? recapFresh/.test(readFileSync("components/markets/what-happened.tsx", "utf8")) && /has not arrived yet; this is the last one/.test(readFileSync("components/markets/what-happened.tsx", "utf8")) && /<OtherStories images=\{unplacedStories\(pictures, reading\.points\)\}/.test(readFileSync("components/markets/newsletter-cards.tsx", "utf8")));
  check("a newsletter's pictures are drawn from its own host with no referrer, lazily, each under the point the person's model placed it (Hamza, 19 Oct 2026), the rest left out", /referrerPolicy="no-referrer"/.test(images) && /loading="lazy"/.test(images) && /reading\.placed/.test(readFileSync("components/markets/newsletter-cards.tsx", "utf8")) && /recapParts\(/.test(images) && /pictureGroups\(/.test(images) && /const images = newsletterImages\(content\.html\)/.test(readFileSync("lib/inbox-run.ts", "utf8")) && /const \{ date, from: dateFrom \} = newsletterDated\(content\.text, content\.date/.test(readFileSync("lib/inbox-run.ts", "utf8")));
  const stable = readFileSync("components/ui/stable-embed.tsx", "utf8");
  check("every embedded review and report sits in the stable embed, which puts the page back after a focus scroll (Hamza, 18 Oct 2026)", /document\.activeElement === frame/.test(stable) && /window\.scrollTo\(\{ top: last/.test(stable) && ["components/reports/review-embed.tsx", "components/theses/deck-embed.tsx", "components/earnings/decks.tsx"].every((f) => { const t = readFileSync(f, "utf8"); return /<StableEmbed/.test(t) && !/<div[^>]*>\s*<iframe/.test(t); }));
}

// --- Caps and weights ---------------------------------------------------------
const caps = capsFor(mInd);
check("the 35% single-company rule is read as a cap on every holding", caps.length === 1 && caps[0].classId === null && caps[0].cap === 35 && caps[0].rule.section === "1.1", JSON.stringify(caps.map((c) => [c.classId, c.cap, c.rule.id])));
check("a class without its own cap gets the blanket one, and none without either", capOf(caps, "core")?.cap === 35 && capOf([{ ...caps[0], classId: "x" }], "core") === null && capOf([{ ...caps[0], classId: "core", cap: 10 }, caps[0]], "core")?.cap === 10);
check("cap states", capState(36, 35) === "over" && capState(34.7, 35) === "near" && capState(20, 35) === "within" && capState(20, null) === "none");
const ctxInd = contextFor(dani, today, mInd);
const { weights, netWorth } = weightsFor(dani, mInd, ctxInd);
check("weights are of net worth and sum to at most 100", netWorth > 0 && weights.reduce((s, w) => s + w.weight, 0) <= 100.01, weights.reduce((s, w) => s + w.weight, 0).toFixed(2));
const aapl = weights.find((w) => w.symbol === "AAPL")!;
check("the same share at two brokers is one weight", aapl.holdings.length === 2 && near(aapl.weight, (aapl.value / netWorth) * 100));
check("AAPL is over the 35% cap with shares to sell", aapl.state === "over" && aapl.sharesToCap !== null && aapl.sharesToCap > 0, `${aapl.weight.toFixed(2)}% ${aapl.sharesToCap}`);
check("weights are largest first and carry the class", weights[0].symbol === "AAPL" && weights.every((w, i) => i === 0 || w.weight <= weights[i - 1].weight) && aapl.classId === "core");
const mix = classMix(dani, mInd, ctxInd);
check("the class mix follows the methodology's class order, cash included, and sums to 100", mix.map((c) => c.classId).join(",").startsWith("core,overlay,cash") && near(mix.reduce((s, c) => s + c.weight, 0), 100, 0.05), mix.map((c) => `${c.classId}:${c.weight.toFixed(1)}`).join(","));

// --- Signals, clocks, needs you ------------------------------------------------
const findings = evaluate(mInd, dani, today, BOTH);
const signals = signalsFor(findings);
check("every tested rule becomes at least one signal", signals.length >= findings.length, `${signals.length} signals from ${findings.length} findings`);
check("the breached cap is a red signal on AAPL", signals.some((s) => s.status === "red" && s.symbol === "AAPL" && s.rule.id === caps[0].rule.id), signals.filter((s) => s.status === "red").map((s) => `${s.rule.id}:${s.symbol}`).join(","));
check("signals sort red first", signals.every((s, i) => i === 0 || ["red", "amber", "grey", "info", "green"].indexOf(s.status) >= ["red", "amber", "grey", "info", "green"].indexOf(signals[i - 1].status)));
check("a rule the owner checks is information", signals.some((s) => s.status === "info" && s.symbol === null));
const dated = datedItems(dani, mInd, ctxInd, "2026-10-19");
check("expiries and the next report are dated, soonest first", dated.some((d) => d.kind === "expiry") && dated.some((d) => d.kind === "report") && dated.every((d, i) => i === 0 || d.date >= dated[i - 1].date));
check("countdown words", countdown(0) === "Today" && countdown(1) === "Tomorrow" && countdown(12) === "In 12d" && countdown(-3) === "3d overdue");
const actions = needsYou(weights, signals, dated, today);
check("needs you leads with the holding over its cap, once", actions[0].title === "AAPL over its 35% cap" && actions.filter((a) => a.key.startsWith("cap-")).length === 1 && !actions.some((a) => a.key === `${caps[0].rule.id}:AAPL`), actions.map((a) => a.title).join(" | "));
check("dated items within 35 days carry a countdown", actions.filter((a) => a.date).every((a) => /^(Today|Tomorrow|In \d+d)$/.test(a.when)));
const notices = noticesFor(signals, dated, null, today);
const studyBase = { id: "abc123def456", subject: "NWND", ticker: "NWND", question: "", family: "fundamentals" as const, templateTitle: "Business fundamentals study", sections: [{ id: "core-business", title: "Core business", guidance: "", tags: [], amendments: [] }], requestedAt: `${today}T08:00:00.000Z`, touchedAt: null, forResults: null, finishedAt: `${today}T08:05:00.000Z`, facts: null, factsNote: null, fundamentals: {}, fundamentalsNotes: [], verdict: null, holding: null, markets: [], table: null, written: { "core-business": "Text." }, pending: [], error: null };
const studyNotices = noticesFor([], [], null, today, { version: 1, updated: today, studies: [{ ...studyBase, status: "done" }, { ...studyBase, id: "abc123def457", status: "failed", error: "The reading service is busy.", written: {}, pending: ["core-business"] }, { ...studyBase, id: "abc123def458", status: "running", finishedAt: null }] });
check("a study written for a results report is no notice of its own: the report waits for it and is told once with it", noticesFor([], [], null, today, { version: 1, updated: today, studies: [{ ...studyBase, status: "done", forResults: today }] }).length === 0);
check("a finished or stopped study is a notice on its day, a running one is not", studyNotices.length === 2 && studyNotices.some((n) => n.key === "study:abc123def456" && n.tone === "ok" && n.title === "NWND: study ready" && n.href === "/research/abc123def456" && n.date === today) && studyNotices.some((n) => n.tone === "danger" && /study stopped/.test(n.title) && /busy/.test(n.detail)));
check("notices are dated today and unread until seen", notices.length > 0 && unreadNotices(notices, null).length === notices.length && unreadNotices(notices, "2026-10-11T12:00:00.000Z").length === 0 && unreadNotices(notices, "2026-10-10T12:00:00.000Z").length === notices.length);
check("the benchmark is read from the series figures", benchmarksOf(mInd).join(",") === "SPY" && benchmarksOf(mDiv).length === 0);

// --- deriveScreens ------------------------------------------------------------
const data = deriveScreens({ book: dani, methodology: mInd, inputs: BOTH, shown: shownInd, filings: null, decisions: EMPTY_DECISIONS, preferences: { ...EMPTY_PREFS(), notificationsSeen: null } }, today);
check("deriveScreens agrees with the parts", data.weights.length === weights.length && data.caps.length === 1 && data.scale === 35 && !(SLOT_IDS as readonly string[]).includes("live_caps") && !/LiveCaps/.test(readFileSync("app/(app)/page.tsx", "utf8")) && data.slots("holdings").includes("by_class"));
function EMPTY_PREFS() {
  return { version: 1 as const, theme: "system" as const, navOrder: [], hidden: [], headline: null, figures: [], edgarContact: null, notificationsSeen: null, notificationsRead: [], recap: { newsletter: true, claude: false }, practices: [], lens: null, earnings: [], newslettersRead: [], quotesShown: [], reviewQuestions: [], following: [], wordScreens: [], watchers: [], agentsOff: [], agentBudgets: {}, lensAgents: [], moveAlertPct: 2, welcomed: null, improve: true, donate: false, shadow: null, updated: "" };
}

// --- Trade check ----------------------------------------------------------------
const buy = checkTrade({ book: dani, methodology: mInd, inputs: BOTH, today, side: "buy", symbol: "MSFT", amount: 5000 });
check("a buy raises the weight by amount over net worth", near(buy.weightAfter - buy.weightBefore, (5000 / netWorth) * 100, 0.05), `${buy.weightBefore.toFixed(2)} → ${buy.weightAfter.toFixed(2)}`);
check("the buy reads its class and the blanket cap", buy.cap?.cap === 35 && buy.classLabel.length > 0);
check("cash moves the other way", near(bookAfter(dani, "buy", "MSFT", 5000).holdings.filter((h) => h.assetClass === "cash").reduce((s, h) => s + h.value, 0), dani.holdings.filter((h) => h.assetClass === "cash").reduce((s, h) => s + h.value, 0) - 5000, 1));
const sell = checkTrade({ book: dani, methodology: mInd, inputs: BOTH, today, side: "sell", symbol: "AAPL", amount: 1e9 });
check("selling more than the position is a full exit and says so", sell.weightAfter === 0 && sell.notes.some((n) => /full exit/.test(n)));
const trim = checkTrade({ book: dani, methodology: mInd, inputs: BOTH, today, side: "sell", symbol: "AAPL", amount: 1000 });
check("a trim that leaves AAPL over its cap moves no rule", trim.weightAfter < trim.weightBefore && !trim.moved.some((x) => x.finding.rule.id === caps[0].rule.id));
const draft = buy.draft.split("\n");
check("the draft names the trade, the weight, the cap and ends with a reason to fill", /^2026-10-11 · Buy MSFT · \$5,000/.test(draft[0]) && /Weight .* → .* against the 35% cap \(1.1\)/.test(draft[1]) && draft.at(-1) === "Reason: ");
const unknown = checkTrade({ book: dani, methodology: mInd, inputs: BOTH, today, side: "buy", symbol: "ZZZZ", amount: 1000 });
check("an unheld symbol without a price says so and still has a weight", unknown.price === null && unknown.notes.some((n) => /No price for ZZZZ/.test(n)) && unknown.weightAfter > 0);
const noM = checkTrade({ book: dani, methodology: null, inputs: BOTH, today, side: "buy", symbol: "AAPL", amount: 1000 });
check("without a methodology only the weights are shown", noM.moved.length === 0 && noM.cap === null && noM.notes.some((n) => /No methodology/.test(n)));


// --- the reviews' slots and the ontology's own graph -----------------------------
check("the Reviews screen carries the review slots in HCMP's order, the person's questions before the calendar (Hamza, 18 Oct 2026), the monthly letter after the trades (9 Nov 2026)", SCREENS.reviews.slots.join(",").startsWith("review_verdict,review_alarms,review_returns,review_moves,review_insights,review_capital,review_trades,review_letter,review_rulebook,review_theses,review_hunter,review_markets,review_news,review_newsletters,review_questions,review_calendar"), SCREENS.reviews.slots.join(","));
check("review slots follow the data: returns need a series, trades need transactions, the rulebook a methodology", SLOTS.review_returns.shown === "series" && SLOTS.review_trades.shown === "transactions" && SLOTS.review_rulebook.shown === "methodology" && SLOTS.review_insights.shown === "always");
const og = ontologyGraph();
const ids = new Set(og.nodes.map((n) => n.id));
check("the ontology graph has a node for every field, slot, screen, panel and condition", FIELD_IDS.every((f) => ids.has(`field:${f}`)) && SLOT_IDS.every((s) => ids.has(`slot:${s}`)) && SCREEN_IDS.every((s) => ids.has(`screen:${s}`)) && PANEL_IDS.every((p) => ids.has(`panel:${p}`)) && SHOWN_WHEN.every((c) => ids.has(`condition:${c}`)));
check("every ontology edge joins two nodes that exist", og.edges.every((e) => ids.has(e.from) && ids.has(e.to)), og.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to)).map((e) => `${e.from}->${e.to}`).slice(0, 3).join(", "));
check("every slot sits on its screen and names its condition", SLOT_IDS.every((s) => og.edges.some((e) => e.from === `slot:${s}` && e.kind === "sits_on") && og.edges.some((e) => e.from === `slot:${s}` && e.kind === "shown_when")));
const od = ontologyDetails();
check("every ontology node has its words", og.nodes.every((n) => od[n.id]?.lines.length), og.nodes.filter((n) => !od[n.id]).map((n) => n.id).slice(0, 5).join(", "));
check("a field with no connection says so, never a zero", /No connection supplies this yet/.test(od["field:roic_pct"]?.lines.join(" ") ?? "") || !FIELDS.roic_pct, od["field:roic_pct"]?.lines.join(" | ") ?? "no roic field");

// ---------------------------------------------------------------------------
// Holdings carries the allocation; every donut label is whole
check("the portfolio by holding and by class, the correlation and where the money is sit on Holdings", ["by_holding", "by_class", "correlation", "allocation"].every((sl) => (SCREENS.holdings.slots as readonly string[]).includes(sl)));
check("Performance shows only performance: no donuts", !(SCREENS.performance.slots as readonly string[]).some((sl) => sl === "by_holding" || sl === "by_class"));
check("there is no separate Allocation screen", !(SCREEN_IDS as readonly string[]).includes("allocation") && !NAV_HREFS().includes("/allocation"));
check("a long name wraps at a space, a word longer than the line is cut only then", JSON.stringify(wrapLabel("Compounding Machine", 12)) === JSON.stringify(["Compounding", "Machine"]) && JSON.stringify(wrapLabel("Supercalifragilistic", 8)) === JSON.stringify(["Supercal", "ifragili", "stic"]));
const labelSets: { name: string; slices: { label: string; share: number }[] }[] = [
  { name: "twelve holdings", slices: ["AMZN", "GOOGL", "META", "UBER", "SHOP", "BKNG", "MA", "ASML", "SPGI", "MELI", "BIRK", "NVO", "Cash"].map((label, i) => ({ label, share: [14, 12, 11, 10, 9, 8, 7, 7, 5, 5, 4, 1, 7][i] })) },
  { name: "classes with long names", slices: [{ label: "Compounding Machine", share: 46 }, { label: "Transitional", share: 32 }, { label: "Disruptive Growth", share: 6 }, { label: "Probation Hold", share: 4 }, { label: "No class yet", share: 5 }, { label: "Cash", share: 7 }] },
  { name: "many small slices together", slices: Array.from({ length: 24 }, (_, i) => ({ label: `HOLD${i}`, share: i < 2 ? 30 : 40 / 22 })) },
  { name: "one slice", slices: [{ label: "Equities, listed", share: 100 }] },
  { name: "asset classes", slices: [{ label: "Real estate", share: 52 }, { label: "Private funds", share: 18 }, { label: "Bonds", share: 12 }, { label: "Deposits", share: 9 }, { label: "Shares", share: 6 }, { label: "Cash", share: 3 }] },
];
for (const width of [240, 311, 343, 480, 560, 900]) {
  for (const set of labelSets) {
    const l = donutLayout(width, set.slices);
    check(`at ${width}px, ${set.name}: every slice labelled, whole, clear of the ring and of each other`, l.labels.length === set.slices.length && labelsFit(l) && l.R >= 52, `R ${l.R}, h ${l.height}`);
  }
}

// --- Alerts ------------------------------------------------------------------
{
  const t0 = `${today}T06:00:00.000Z`;
  const first = reconcile(null, notices, t0);
  check("a first check opens one alert per notice, fired on the notice's day", first.fired.length === new Set(notices.map((n) => n.key)).size && first.file.items.every((i) => i.clearedAt === null && i.firedAt === `${today}T00:00:00.000Z` && i.id === `${i.key}@${i.firedAt}`));
  const again = reconcile(first.file, notices, `${today}T18:00:00.000Z`);
  check("the same notices twelve hours later fire nothing and keep their instant", again.fired.length === 0 && again.file.items.length === first.file.items.length && again.file.items.every((i) => i.firedAt === `${today}T00:00:00.000Z`));
  const gone = notices[0];
  const later = reconcile(again.file, notices.slice(1), `${today}T19:00:00.000Z`);
  check("a notice that is gone clears its alert, which stays as Earlier", later.file.items.find((i) => i.key === gone.key)?.clearedAt === `${today}T19:00:00.000Z` && alertsView(later.file).earlier.some((i) => i.key === gone.key));
  const tomorrow = "2026-10-12";
  const back = reconcile(later.file, notices.map((n) => ({ ...n, date: tomorrow })), `${tomorrow}T06:00:00.000Z`);
  check("a condition that holds again after clearing fires again, once", back.fired.length === 1 && back.fired[0].key === gone.key && back.file.items.filter((i) => i.key === gone.key).length === 2);
  const ahead = notices.map((n) => ({ ...n, date: "2026-10-12" }));
  const a1 = reconcile(null, ahead, `${today}T21:30:00.000Z`).file.items.map((i) => i.id).join();
  const a2 = reconcile(null, ahead, `${today}T21:31:07.000Z`).file.items.map((i) => i.id).join();
  check("a notice dated ahead of now (the person's day begun east of UTC) keeps one id across requests, so Dismiss finds it", a1 === a2 && a1.includes(`@${today}T00:00:00.000Z`));
  const reworded = reconcile(first.file, notices.map((n, i) => (i === 0 ? { ...n, title: `${n.title} (now)` } : n)), `${today}T18:00:00.000Z`);
  check("an open alert takes its notice's current wording", reworded.fired.length === 0 && reworded.file.items.some((i) => i.key === notices[0].key && i.title.endsWith("(now)")));
  const kept = reconcile({ ...first.file, items: [...first.file.items, { ...first.file.items[0], id: "watch:NWND:below:10@x", key: "watch:NWND:below:10" }] }, notices, `${today}T18:00:00.000Z`, WATCH_PREFIX);
  check("a screen without prices keeps the watchlist's levels open", kept.file.items.some((i) => i.key === "watch:NWND:below:10" && i.clearedAt === null));
  const old = { ...first.file.items[0], id: "study:x@2026-09-01T00:00:00.000Z", key: "study:x", firedAt: "2026-09-01T00:00:00.000Z", tone: "ok" as const };
  const withOld = { ...first.file, items: [...first.file.items, old, { ...first.file.items[0], id: "filings@t", key: "filings", tone: "ok" as const }] };
  const mail = toEmail(withOld, t0);
  check("the email carries what fired today or yesterday, never an old firing or a routine filings read", mail.length === first.file.items.length && !mail.some((i) => i.key === "study:x" || i.key === "filings") && !emailWorthy({ key: "filings", tone: "ok" }) && emailWorthy({ key: "filings", tone: "warn" }));
  const sent = markEmailed(first.file, mail.map((i) => i.id), t0);
  check("an emailed alert is not emailed again", toEmail(sent, `${today}T18:00:00.000Z`).length === 0 && toEmail(reconcile(sent, notices, `${today}T18:00:00.000Z`).file, `${today}T18:00:00.000Z`).length === 0);
  const dismissed = dismiss(first.file, first.file.items[0].id, t0);
  check("a dismissed alert leaves the view, the unread count and the email, and stays dismissed while it holds", !alertsView(dismissed).now.some((i) => i.id === first.file.items[0].id) && alertsView(dismissed).dismissed === 1 && !unreadAlerts(dismissed, null).some((i) => i.id === first.file.items[0].id) && !toEmail(dismissed, t0).some((i) => i.id === first.file.items[0].id) && reconcile(dismissed, notices, `${today}T18:00:00.000Z`).file.items.find((i) => i.id === first.file.items[0].id)?.dismissedAt === t0);
  check("unread is what fired after the person last marked everything read", unreadAlerts(first.file, null).length === first.file.items.length && unreadAlerts(first.file, `${today}T09:00:00.000Z`).length === 0 && unreadAlerts(first.file, "2026-10-10T20:00:00.000Z").length === first.file.items.length);
  // Mark all read keeps each id (Hamza, 19 Oct 2026): an alert marked read stays read whatever the instant, one that fires later the same day is unread, and the list keeps only ids still in the file.
  const read = readIds(first.file, ["gone@2026-01-01T00:00:00.000Z"]);
  check("Mark all read keeps the ids in the file and drops ids no longer there; an alert marked read is read, a later one is not", read.length === first.file.items.length && !read.includes("gone@2026-01-01T00:00:00.000Z") && unreadAlerts(first.file, null, read).length === 0 && unreadAlerts({ ...first.file, items: [...first.file.items, { ...first.file.items[0], id: "later@x", key: "later", firedAt: `${today}T00:00:00.000Z` }] }, `${today}T09:00:00.000Z`, read).map((i) => i.id).join() === "later@x");
  // One source's alerts laid alone (the followed cards on opening the app): the rest of the file does not move.
  const card = { key: `${COMMUNITY_PREFIX}mara:${today}`, date: today, tone: "info" as const, title: "Mara changed their theses", detail: "Theses: ASML.", href: "/community/mara" };
  const laid = reconcilePrefix(first.file, COMMUNITY_PREFIX, [card], `${today}T12:00:00.000Z`);
  const relaid = reconcilePrefix(laid.file, COMMUNITY_PREFIX, [], `${today}T13:00:00.000Z`);
  check("reconcilePrefix fires one prefix's alerts and clears them, leaving every other alert as it was", laid.fired.length === 1 && laid.file.items.length === first.file.items.length + 1 && first.file.items.every((i) => laid.file.items.some((j) => j.id === i.id && j.clearedAt === i.clearedAt)) && relaid.file.items.find((i) => i.key === card.key)?.clearedAt === `${today}T13:00:00.000Z` && relaid.file.items.filter((i) => i.clearedAt === null).length === first.file.items.filter((i) => i.clearedAt === null).length && laid.file.checkedAt === first.file.checkedAt);
  const kept2 = deriveScreens({ book: dani, methodology: mInd, inputs: BOTH, shown: shownInd, filings: null, decisions: EMPTY_DECISIONS, preferences: EMPTY_PREFS(), alerts: laid.file, now: `${today}T14:00:00.000Z` }, today);
  const told = deriveScreens({ book: dani, methodology: mInd, inputs: BOTH, shown: shownInd, filings: null, decisions: EMPTY_DECISIONS, preferences: EMPTY_PREFS(), alerts: laid.file, now: `${today}T14:00:00.000Z`, community: [] }, today);
  check("a screen that did not read the followed cards keeps their alerts; one that read none clears them", kept2.alerts.items.find((i) => i.key === card.key)?.clearedAt === null && told.alerts.items.find((i) => i.key === card.key)?.clearedAt === `${today}T14:00:00.000Z`);
  check("the view puts breaches first", alertsView(first.file).now.every((a, i, all) => i === 0 || ["danger", "warn", "info", "ok"].indexOf(a.tone) >= ["danger", "warn", "info", "ok"].indexOf(all[i - 1].tone)));
  const viewed = deriveScreens({ book: dani, methodology: mInd, inputs: BOTH, shown: shownInd, filings: null, decisions: EMPTY_DECISIONS, preferences: { ...EMPTY_PREFS(), notificationsSeen: `${today}T09:00:00.000Z` }, alerts: first.file, now: `${today}T12:00:00.000Z` }, today);
  check("deriveScreens lays today's notices on the kept file and counts unread from it", viewed.alerts.items.length === first.file.items.length + tradeNotices(dani, EMPTY_DECISIONS).length && viewed.unread.length === 0);

  const rec = (r: Partial<HoldingRecord>): HoldingRecord => ({ ownValuation: null, since: null, note: null, sector: null, levels: null, triggers: [], revaluation: null, ...r });
  const levels = levelNotices(
    {
      SPOT: rec({ levels: { below: 490, above: null }, note: "Wait for 445 to 490." }),
      NWND: rec({ levels: { below: null, above: 30 } }),
      TEM: rec({ ownValuation: { low: 40, base: 55, high: 70, asOf: "2026-10-01", basis: "Own DCF" } }),
      GH: rec({ levels: { below: 10, above: null } }),
      AAPL: rec({ ownValuation: { low: 500, base: 600, high: null, asOf: "2026-10-01", basis: null } }),
      NOPRICE: rec({ levels: { below: 1000, above: null } }),
    },
    new Set(["AAPL"]),
    { SPOT: 480, NWND: 31, TEM: 39.5, GH: 12, AAPL: 200, NOPRICE: null },
    today,
  );
  const keys = levels.map((n) => n.key).sort().join(",");
  check("a level reached is an alert keyed by its level; a low valuation alerts a watched symbol only; no price tests nothing", keys === "watch:NWND:above:30,watch:SPOT:below:490,watch:TEM:value-low:40", keys);
  check("a level alert says the price and the level, and carries the note", levels.some((n) => n.key === "watch:SPOT:below:490" && n.title === "SPOT at 480, at or below your 490" && /445 to 490/.test(n.detail) && n.href === "/watchlist"));

  const aapl = dani.holdings.find((x) => x.symbol === "AAPL")!;
  const trigBook = { ...dani, holdings: [{ ...aapl, record: rec({ triggers: [
    { id: "k1", kind: "kill", field: "price", is: "lte", value: aapl.price! + 1, note: "Thesis floor." },
    { id: "t1", kind: "trigger", field: "price", is: "gte", value: aapl.price! + 100, note: null },
    { id: "f1", kind: "trigger", field: "roic_pct", is: "lte", value: 50, note: null },
  ] }) }] };
  const tn = triggerNotices(trigBook, today);
  check("a met kill signal is a breach alert, an unmet trigger and an unread figure are nothing", tn.length === 1 && tn[0].key === "trigger:AAPL:k1" && tn[0].tone === "danger" && /kill signal met/.test(tn[0].title) && /Thesis floor/.test(tn[0].detail) && tn[0].href === "/holdings/AAPL", tn.map((n) => n.key).join(","));
  const email = alertsEmail(mail, "https://portfolio-os.example.app", t0);
  check("the alert email leads with its count and the worst alert, links each into the app, and says it is sent once", email.subject.startsWith(`${mail.length} new alert`) && email.html.includes("https://portfolio-os.example.app/notifications") && email.text.includes("emailed once") && mail.every((i) => email.text.includes(i.title)) && !/<script/i.test(email.html));
  const evil = alertsEmail([{ ...mail[0], title: "<img src=x onerror=alert(1)>" }], "javascript:alert(1)", t0);
  check("the email escapes what it shows and links only to an https address", !evil.html.includes("<img") && !evil.html.includes("javascript:"));
  const docBase = { name: "Bank statement September", receivedAt: `${today}T05:00:00.000Z`, via: "inbox" as const, readFrom: "text" as const, extraction: null, unchecked: [], confirmedAt: null };
  const st = statementNotices({ version: 1, documents: [{ ...docBase, id: "0123456789abcdef", status: "review", sentence: "Two figures were not found in its text." }, { ...docBase, id: "0123456789abcdee", status: "failed", sentence: null }, { ...docBase, id: "0123456789abcded", status: "applied", sentence: null }], updated: today } as never);
  check("a statement that waits or could not be read is an alert on its day; one in use is not", st.length === 2 && st.some((n) => n.tone === "warn" && /waits for you/.test(n.title) && /Two figures/.test(n.detail) && n.href === "/statements" && n.date === today) && st.some((n) => n.tone === "danger" && /could not be read/.test(n.title)));
  check("the alerts file round-trips its schema, and a damaged one is refused", alertsFileSchema.safeParse(sent).success && !alertsFileSchema.safeParse({ ...sent, items: [{ id: 1 }] }).success);
}

{
  // The positions table on Holdings, on Dani's fictional book and hand-made closes.
  const aapl = [{ date: "2025-06-30", value: 180 }, { date: "2025-12-31", value: 200 }, { date: "2026-04-09", value: 220 }, { date: "2026-10-08", value: 250 }, { date: "2026-10-09", value: 255 }, { date: "2026-10-12", value: 300 }];
  const pos = positionsOf(dani, { AAPL: aapl });
  const a = pos.rows.find((r) => r.symbol === "AAPL");
  check("positions: one row per symbol across accounts, cash apart, largest first", pos.rows.length === 9 && a?.quantity === 350 && a.accounts === 2 && pos.rows[0].symbol === "AAPL" && pos.cash.length === 2 && pos.rows.every((r) => r.assetClass !== "cash"));
  check("positions: changes are read at the book's date, not the feed's later close", near(a?.dayPct ?? null, 2) && near(a?.ytdPct ?? null, 27.5) && near(a?.sixMonthPct ?? null, 15.909, 0.001), `${a?.dayPct} ${a?.ytdPct} ${a?.sixMonthPct}`);
  check("positions: cost, value, average price, since bought and both P&Ls add up", a?.cost === 63800 && a.value === 80500 && near(a.avgPrice, 182.2857, 0.001) && a.unrealizedPnl === 16700 && near(a.sinceBoughtPct, 26.175, 0.001) && near(a.dayPnl, 80500 - 80500 / 1.02), JSON.stringify(a));
  const call = pos.rows.find((r) => r.symbol === "AAPL 261120C00245000");
  check("positions: a short option's average price is the premium per share and its gain is the premium kept", near(call?.avgPrice ?? null, 4.5) && call?.unrealizedPnl === 280 && call.dayPct === null && call.ytdPct === null);
  const voo = pos.rows.find((r) => r.symbol === "VOO");
  check("positions: a listed holding with no closes shows no change, never a zero", voo?.dayPct === null && voo.ytdPct === null && voo.sixMonthPct === null && voo.dayPnl === null && voo.cost === 18500);
  const worth = dani.holdings.reduce((s, h) => s + h.value, 0);
  check("positions: the total is net worth with the cash in it", near(pos.total.value, worth) && pos.total.cash === 92000 && near(pos.total.unrealizedPnl, pos.rows.reduce((s, r) => s + (r.unrealizedPnl ?? 0), 0)) && near(pos.total.dayPnl, a?.dayPnl ?? 0));
  const ibkrOnly = positionsOf({ ...dani, holdings: dani.holdings.filter((h) => !(h.account === "Schwab" && h.symbol === "AAPL")) }, { AAPL: aapl });
  const b = ibkrOnly.rows.find((r) => r.symbol === "AAPL");
  check("positions: the broker's own change since the previous close wins over the feed's", near(b?.dayPct ?? null, (-414 / 69414) * 100, 0.0001) && b?.dayPnl === -414);
  const short = closeChanges([{ date: "2026-08-01", value: 10 }, { date: "2026-10-09", value: 11 }], "2026-10-09");
  check("positions: a series that starts this year has no year-to-date or six-month change", short.ytd === null && short.sixMonth === null && near(short.day, 10));
  check("positions: the table sits right under the two pie charts on Holdings", SCREENS.holdings.slots.indexOf("positions") === SCREENS.holdings.slots.indexOf("by_class") + 1);
}

// Concentration in sentences: the largest against an equal share, half of net worth, the spread lost, the tail, a cap.
{
  type W = Parameters<typeof concentrationInsights>[0][number];
  const w = (symbol: string, weight: number, over = false) => ({ symbol, name: symbol, holdings: [], value: weight, weight, classId: null, classLabel: "", cap: over ? { classId: null, cap: 10, rule: { section: "3.4" }, figure: {} } : null, state: over ? "over" : "none", sharesToCap: null }) as unknown as W;
  const said = concentrationInsights([w("AAA", 20, true), w("BBB", 15), w("CCC", 12), w("DDD", 10), w("EEE", 8), w("FFF", 5), w("GGG", 5), w("HHH", 5)]);
  check("the largest is set against an equal share", said[0] === "AAA alone is 20.0% of net worth, 2.0× an equal share of the listed book (10.0%).", said[0]);
  check("half of net worth sits in the largest four", said[1] === "Half of net worth sits in the largest 4 of 8.", said[1]);
  check("uneven weights cost spread", /^8 holdings behave like 6\.\d of equal size: uneven weights cost about 1\.\d positions of spread\.$/.test(said[2]), said[2]);
  check("the tail against the largest", said[3] === "The smallest 3 together are 15.0%, less than AAA alone.", said[3]);
  check("an over-cap holding names its section", said[4] === "Over the cap: AAA 20.0% against 10% (3.4).", said[4]);
  check("no weights, no sentences", concentrationInsights([]).length === 0);
  const even = concentration([w("AAA", 40), w("BBB", 40)]);
  check("cash never inflates the effective count: two equal holdings are two", even !== null && Math.abs(even.effective - 2) < 1e-9 && Math.abs(even.herfindahl - 0.5) < 1e-9, JSON.stringify(even));
}

// --- Practices: pages some investors keep and others never do ---------------
{
  const library = (f: string) => {
    const j = JSON.parse(readFileSync(f, "utf8"));
    return methodologySchema.parse({ gaps: [], source: { title: "x", fileId: null }, adopted: null, ...(j.methodology ?? j) });
  };
  check("an options trader's methodology names none of the four practices", practicesOf(mInd).length === 0 && practicesOf(mDiv).length === 0, practicesOf(mInd).join(","));
  check("a family office's names its votes and its duties", practicesOf(mFam).join(",") === "decision_log,todo_list", practicesOf(mFam).join(","));
  check("the HCMP methodology in the library names all four", practicesOf(library("data/library/hcmp.methodology.json")).length === 4);
  check("a methodology that records its practices is taken at its word", practicesOf({ ...mFam, practices: ["trade_check"] }).join(",") === "trade_check" && practicesOf({ ...mFam, practices: [] }).length === 0);
  const off = screensOn(shownInd);
  check("with nothing added, Trade check, Decision Log and the to-do are off", !["check", "decisions", "todo"].some((id) => off.includes(id as never)), off.join(","));
  check("Trades is on for everyone with transactions, added or not", screensOn(shownWhen(mInd, dani, EMPTY_RECORDS, EMPTY_DECISIONS)).includes("trades" as never) && DEFAULT_PRACTICES.join(",") === "trade_log");
  const hcmp = library("data/library/hcmp.methodology.json");
  const named = screensOn(shownWhen(hcmp, dani, EMPTY_RECORDS, EMPTY_DECISIONS));
  check("a methodology that names all four still leaves Trade check, Decision Log and the to-do off until the person adds them", !["check", "decisions", "todo"].some((id) => named.includes(id as never)), named.join(","));
  const customise = readFileSync("app/(app)/customise/page.tsx", "utf8");
  check("Customise offers Add or Remove for every practice, the methodology's own included", !/byMethodology \? undefined/.test(customise) && /Your methodology names it\./.test(customise));
  const added = screensOn(shownWhen(mInd, dani, EMPTY_RECORDS, EMPTY_DECISIONS, ["trade_check", "decision_log"]));
  check("adding a practice on Customise switches its page on, and only its page", added.includes("check") && added.includes("decisions") && !added.includes("todo"));
  check("a practice still needs its own condition: Trades needs transactions", !screensOn(shownWhen(mFam, { ...dad, transactions: [] }, EMPTY_RECORDS, EMPTY_DECISIONS, ["trade_log"])).includes("trades"));
  check("the to-do slot on the Dashboard follows the practice", !slotsOn("today", shownWhen(mInd, dani, EMPTY_RECORDS, EMPTY_DECISIONS)).includes("todo") && slotsOn("today", shownWhen(mInd, dani, EMPTY_RECORDS, EMPTY_DECISIONS, ["todo_list"])).includes("todo"));

  // New trades ask for their reason on Notifications.
  const asOf = "2026-10-12";
  const fill = (date: string, kind: "buy" | "sell", symbol: string, quantity: number) => ({ date, account: "IBKR", kind, symbol, quantity, price: 100, amount: kind === "buy" ? -100 * quantity : 100 * quantity, currency: "USD" as const });
  const traded = { ...dani, asOf, transactions: [fill("2026-10-10", "buy", "UBER", 2), fill("2026-10-10", "buy", "UBER", 0.5), fill("2026-10-08", "sell", "SPGI", 3), fill("2026-09-01", "buy", "MA", 1)] };
  const fresh = newTrades(traded, EMPTY_DECISIONS);
  check("a day's fills of one symbol on one side are one trade, and only the last fortnight's", fresh.length === 2 && fresh[0].symbol === "UBER" && fresh[0].quantity === 2.5 && fresh.every((t) => t.key.startsWith(TRADE_PREFIX)) && NEW_TRADE_DAYS === 14, JSON.stringify(fresh.map((t) => [t.key, t.quantity])));
  const tn = tradeNotices(traded, EMPTY_DECISIONS);
  check("each new trade is a notice asking for its reason, dated the day the ledger showed it", tn.length === 2 && tn[0].title === "New trade: bought 2.5 UBER" && /Is there a reason\?/.test(tn[0].detail) && tn.every((n) => n.date === asOf && n.tone === "info"), JSON.stringify(tn[0]));
  check("trade words read as the broker's side", tradeWords({ kind: "sell", quantity: 3, symbol: "SPGI" }) === "Sold 3 SPGI" && tradeWords({ kind: "option_open", quantity: -1, symbol: "TSLA 261120P00200000" }) === "Sold to open 1 contract of TSLA 261120P00200000");
  const answered = withDecision(EMPTY_DECISIONS, { id: "2026-10-10-01", date: "2026-10-10", kind: "trade", symbol: "UBER", title: "Bought 2.5 UBER", text: "Adding below my valuation.", filedAt: "2026-10-12T08:00:00.000Z", action: { on: fresh[0].key, outcome: "add", targetPct: null, by: null, votedClass: null, reading: null } }, "2026-10-12T08:00:00.000Z");
  check("a reason kept answers the question, which then clears", newTrades(traded, answered).map((t) => t.symbol).join(",") === "SPGI" && reconcile(reconcile(null, tn, "2026-10-12T08:00:00.000Z").file, tradeNotices(traded, answered), "2026-10-12T09:00:00.000Z").file.items.filter((i) => i.clearedAt === null).length === 1);
  const voted = withDecision(EMPTY_DECISIONS, { id: "2026-10-09-01", date: "2026-10-09", kind: "vote", symbol: "SPGI", title: "Vote", text: "", filedAt: "2026-10-09T08:00:00.000Z" }, "2026-10-09T08:00:00.000Z");
  const logged = withDecision(EMPTY_DECISIONS, { id: "2026-10-07-01", date: "2026-10-07", kind: "trade", symbol: "SPGI", title: "Sold SPGI", text: "Rotation.", filedAt: "2026-10-07T08:00:00.000Z" }, "2026-10-07T08:00:00.000Z");
  check("a trade entry naming the company within a week answers it; a vote does not", newTrades(traded, voted).some((t) => t.symbol === "SPGI") && !newTrades(traded, logged).some((t) => t.symbol === "SPGI"));
  check("a Thesis Hunter find is neither emailed nor pushed; the weekly review carries it (Hamza, 4 and 5 Nov 2026)", !emailWorthy({ key: "hunter:stock:MA:abc", tone: "warn" }) && !newsWorthy({ key: "hunter:stock:MA:abc", tone: "warn" }) && emailWorthy({ key: "watch:MA", tone: "warn" }));
  check("new trades are news for the email", tn.every((n) => emailWorthy({ key: n.key, tone: n.tone })));
}

// --- Portfolios: accounts in named groups, seen together or one at a time ---
{
  const file = defaultPortfolios(dani);
  check("with no file, each account is its own portfolio under one methodology", file.items.map((p) => p.name).join(",") === "IBKR,Schwab" && file.mode === "one" && portfoliosFileSchema.safeParse({ ...file, updated: "x" }).success, file.items.map((p) => p.name).join(","));
  const parts = file.items.map((p) => scopeBook(dani, p));
  check("every holding and transaction is in exactly one portfolio", parts.reduce((n, b) => n + b.holdings.length, 0) === dani.holdings.length && parts.reduce((n, b) => n + b.transactions.length, 0) === dani.transactions.length && parts.every((b, i) => b.holdings.every((h) => file.items[i].accounts.includes(h.account))));
  check("an account in two portfolios is refused", !portfoliosFileSchema.safeParse({ ...file, items: [file.items[0], { ...file.items[1], accounts: ["IBKR"] }], updated: "x" }).success);
  check("a sample's value series is no one portfolio's: it leaves a portfolio's view", parts.every((b) => (b.series?.nav.length ?? 0) === 0) && (dani.series?.nav.length ?? 0) > 0);
  const show = bookSchema.parse(read("showcase.book.json"));
  const ibkrOnly = defaultPortfolios(show);
  check("IBKR's own value series stays with the portfolio of exactly its accounts", ibkrOnly.items.length === 1 && (scopeBook(show, ibkrOnly.items[0]).series?.nav.length ?? 0) === (show.series?.nav.length ?? 0) && (show.series?.nav.length ?? 0) > 0);
  const mixed = { ...show, holdings: [...show.holdings, { ...show.holdings[0], id: "x-1", account: "Schwab", source: "snaptrade" as const }] };
  const mixedFile = { ...defaultPortfolios(mixed), items: [{ id: "all", name: "All", accounts: ["IBKR", "Schwab"], methodology: null }] };
  check("a portfolio that mixes IBKR with another broker does not borrow IBKR's series", (scopeBook(mixed, mixedFile.items[0]).series?.nav.length ?? 0) === 0);
  check("one methodology for all applies through every lens", lensView(file, "schwab", mInd, dani).methodology === mInd && lensView(file, null, mInd, dani).methodology === mInd && lensView(file, "schwab", mInd, dani).book!.holdings.every((h) => h.account === "Schwab"));
  const each = withPortfolioMethodology({ ...file, mode: "each" as const }, "ibkr", mDiv);
  check("one per portfolio: a portfolio takes its own, all together take none, one without its own takes none", lensView(each, "ibkr", mInd, dani).methodology?.name === mDiv.name && lensView(each, null, mInd, dani).methodology === null && lensView(each, "schwab", mInd, dani).methodology === null);
  check("an unknown lens is all portfolios together", lensView(file, "gone", mInd, dani).portfolio === null && lensView(file, "gone", mInd, dani).book === dani);
  check("per portfolio, each with its own book and methodology", perPortfolio(each, mInd, dani).map((p) => `${p.portfolio.id}:${p.methodology?.name ?? "none"}:${p.book.holdings.length}`).join(",") === `ibkr:${mDiv.name}:${parts[0].holdings.length},schwab:none:${parts[1].holdings.length}`);
  const fresh = withNewAccounts(file, { ...dani, holdings: [...dani.holdings, { ...dani.holdings[0], id: "n-1", account: "Wealthsimple" }] });
  check("a new account joins the first portfolio, never no portfolio", fresh.items[0].accounts.includes("Wealthsimple") && withNewAccounts(file, dani) === file);
  const moved = moveAccount(file, "Schwab", "ibkr");
  check("moving an account takes it out of where it was", moved.items[0].accounts.join(",") === "IBKR,Schwab" && moved.items[1].accounts.length === 0);
  const added = addPortfolio(file, "Private assets");
  check("adding, renaming and removing portfolios keeps every account somewhere", added.items.at(-1)!.id === "private-assets" && renamePortfolio(added, "private-assets", "Private").items.at(-1)!.name === "Private" && removePortfolio(file, "schwab").items[0].accounts.join(",") === "IBKR,Schwab" && removePortfolio(defaultPortfolios(null), "main").items.length === 1);
}

// --- The showcase: the owner's anonymized snapshot, opened by /try with the tour ---
{
  const files = ["showcase.book.json", "showcase.filings.json", "showcase.decisions.json", "showcase.research.json", "showcase.studies.json", "showcase.recaps.json", "methodology.showcase.json"];
  const text = files.map((f) => readFileSync(`data/samples/${f}`, "utf8")).join("\n");
  check("the showcase names no one: no owner, no fund name, no address, no Drive file", !/hamza|bassatne|hcmp|dani\b|@gmail|@[a-z0-9-]+\.[a-z]{2,}|docs\.google|drive\.google|"fileId":\s*"/i.test(text));
  const sm = methodologySchema.parse(JSON.parse(readFileSync("data/samples/methodology.showcase.json", "utf8")));
  const sb = bookSchema.parse(JSON.parse(readFileSync("data/samples/showcase.book.json", "utf8")));
  const sf = filingsFileSchema.parse(JSON.parse(readFileSync("data/samples/showcase.filings.json", "utf8")));
  const sd = decisionsFileSchema.parse(JSON.parse(readFileSync("data/samples/showcase.decisions.json", "utf8")));
  const sr = researchFileSchema.parse(JSON.parse(readFileSync("data/samples/showcase.research.json", "utf8")));
  const ss = researchFileSchema.parse(JSON.parse(readFileSync("data/samples/showcase.studies.json", "utf8")));
  const rc = recapsFileSchema.parse(JSON.parse(readFileSync("data/samples/showcase.recaps.json", "utf8")));
  check("the showcase's files read as the app's own shapes, dated and kept", sb.asOf === "2026-11-03" && Object.keys(sf.bySymbol).length >= 10 && sd.entries.length > 0 && sr.studies.length + ss.studies.length >= 3 && new Set([...sr.studies, ...ss.studies].map((x) => x.subject)).size === sr.studies.length + ss.studies.length && sm.classes.length > 0);
  const listed = sb.holdings.filter((h) => h.assetClass === "equity").map((h) => h.symbol);
  check("every listed holding of the showcase has its filings, so its class is tested", listed.every((s) => sf.bySymbol[s]?.values));
  const held = new Set(listed);
  check("the showcase's recap explains held symbols only, each move from the snapshot's own closes", rc.recaps[0].reading!.holdings.every((h) => held.has(h.symbol)) && rc.recaps[0].reading!.holdings.length === listed.length && rc.recaps[0].reading!.points.every((p) => p.source.url.startsWith("https://")));
  const composed = composeBook(sb, { records: EMPTY_RECORDS, filings: sf, research: sr, markets: EMPTY_MARKETS, methodology: sm })!;
  const sshown = shownWhen(sm, composed, null, sd);
  // Customise is on for everyone, outside the methodology's screens.
  const hrefs = new Set([...screensOn(sshown).map((id) => SCREENS[id].href), "/customise", "/setup"]);
  const missing = TOUR.filter((t) => !hrefs.has(t.href)).map((t) => t.href);
  check("every step of the tour opens a screen the showcase turns on", missing.length === 0, missing.join(", "));
  check("the tour starts and ends on Today and points at parts its screens draw", TOUR[0].href === "/" && TOUR.at(-1)!.href === "/" && TOUR.filter((t) => t.target).every((t) => drawn(t.href).includes(`data-tour="${t.target}"`)));
  const sign = readFileSync("app/sign-in/page.tsx", "utf8");
  check("the sign-in page offers the demo's tour", /Try the demo free/.test(sign) && /\/try`/.test(sign));
}

// --- The first visit: sign in, sign up or the demo; the first sign-in on Welcome, then the tour of the person's own app (Hamza, 16 Oct 2026) ---
{
  const sign = readFileSync("app/sign-in/page.tsx", "utf8");
  const signUp = readFileSync("app/sign-up/page.tsx", "utf8");
  const signUpActions = readFileSync("app/sign-up/actions.ts", "utf8");
  const users = readFileSync("lib/users.ts", "utf8");
  const auth = readFileSync("lib/auth.ts", "utf8");
  check("the first page offers sign-in by Google, by email and password, an account to create and the demo", /Continue with Google/.test(sign) && /<PasswordForm/.test(sign) && /href="\/sign-up"/.test(sign) && /Try the demo free/.test(sign));
  check("sign-up is by Google or by email with a code sent to the address, and lands on Welcome", /<SignUpForm/.test(signUp) && /redirectTo: "\/welcome"/.test(signUp) && /startSignUp\(/.test(signUpActions) && /sendSignUpCode\(/.test(signUpActions) && /verifySignUp\(/.test(signUpActions));
  check("the accounts store keeps a scrypt hash and the code's hash under the deployment's secret, limits the tries, and is closed unless SIGN_UP is open or by invitation", /scrypt/.test(users) && /createHmac\("sha256", secret\)/.test(users) && /CODE_ATTEMPTS/.test(users) && /signUpModeOf\(process\.env\.SIGN_UP\)/.test(users) && /signUpModeOf\("yes"\) === "closed"/.test(readFileSync("scripts/check-model.ts", "utf8")) && !/console\./.test(users));
  check("the allowlist admits as before; an account joins only through the store, re-read on every request", /allowedEmails\(\)\.includes\(email\)\) return true/.test(auth) && /isMember\(/.test(auth) && /signUpOpen\(\)/.test(auth) && /admitted/.test(readFileSync("lib/session.ts", "utf8")));
  check("an email sign-in links a Google Drive on Welcome with the drive.file scope alone, and the vault opens from it", /drive\.file/.test(readFileSync("lib/auth.ts", "utf8")) && /DRIVE_FILE_SCOPE/.test(readFileSync("app/api/vault/google/start/route.ts", "utf8")) && /chooseDrive\(/.test(readFileSync("app/api/vault/google/callback/route.ts", "utf8")) && /kind === "google_drive"/.test(readFileSync("lib/vault.ts", "utf8")));
  // The policy pages Google's consent screen links (Hamza, 17 Oct 2026): public, dated, the contact named, linked from the first pages.
  const privacy = readFileSync("app/privacy/page.tsx", "utf8");
  const terms = readFileSync("app/terms/page.tsx", "utf8");
  check("the privacy policy says where the money stays, what the deployment keeps, what goes out and how to remove it, and the terms say it is not advice and read-only", /drive\.file/.test(privacy) && /Google API Services User Data Policy/.test(privacy) && /Removing your data/.test(privacy) && /CONTACT_ADDRESS/.test(privacy) && /Not investment advice/.test(terms) && /never places, changes or cancels an order/.test(terms) && /CONTACT_ADDRESS/.test(terms));
  check("the sign-in and sign-up pages link the privacy policy and the terms", /"\/privacy"/.test(sign) && /"\/terms"/.test(sign) && /"\/privacy"/.test(signUp) && /"\/terms"/.test(signUp));
  const welcome = readFileSync("app/welcome/page.tsx", "utf8");
  const second = readFileSync("components/welcome/second-setup.tsx", "utf8");
  const setupPage = readFileSync("app/(app)/setup/page.tsx", "utf8");
  check("a screen with no setup goes to Welcome; a first build opens Welcome's second part, and finishing it opens the tour of the person's own app", /redirect\("\/welcome"\)/.test(readFileSync("lib/workspace.ts", "utf8")) && /\/welcome\?step=rules/.test(readFileSync("app/(app)/setup/actions.ts", "utf8")) && /<FirstSetup/.test(welcome) && /<SecondSetup/.test(welcome) && /\/setup\?built=1&tour=1/.test(readFileSync("app/welcome/actions.ts", "utf8")) && /welcomed: new Date/.test(readFileSync("app/welcome/actions.ts", "utf8")));
  check("Welcome's second part walks rules, money, each holding's thesis and valuation and what the app reads, in Setup's own cards, every step skippable (Hamza, 16 Oct 2026)", WELCOME_STEPS.map((x) => x.id).join(",") === "rules,money,holdings,reads,done" && /<MethodologyCard/.test(second) && /<ModelCard/.test(second) && /<IbkrCard/.test(second) && /<ThesesCard/.test(second) && /<NewslettersCard/.test(second) && /<FilingsCard/.test(second) && /Skip the rest/.test(second) && /setupData\(/.test(welcome) && /setupData\(/.test(setupPage));
  const cards = readFileSync("components/setup/input-cards.tsx", "utf8");
  check("Setup has a Theses and valuations card (a thesis and bear, base, bull per listed holding, kept on the thesis and the record) and a Newsletters card (the address, the Gmail steps, the recap)", /data-tour="setup-theses"/.test(setupPage) && /data-tour="setup-newsletters"/.test(setupPage) && /saveFirstThesisAction/.test(cards) && /newsletterSteps\(/.test(cards) && /<RecapGuide/.test(cards) && /ownValuation: \{ low, base, high/.test(readFileSync("app/(app)/theses/actions.ts", "utf8")));
  const base = new Set([...screensOn(shownWhen(null, null, null, null)).map((id) => SCREENS[id].href), "/customise", "/setup"]);
  const offApp = TOUR_APP.filter((t) => !base.has(t.href)).map((t) => t.href);
  check("every step of the own-app tour opens a screen that is on before any methodology", offApp.length === 0, offApp.join(", "));
  check("the own-app tour starts and ends on Setup and points at parts its screens draw", TOUR_APP[0].href === "/setup" && TOUR_APP.at(-1)!.href === "/setup" && TOUR_APP.filter((t) => t.target).every((t) => drawn(t.href).includes(`data-tour="${t.target}"`)));
}

{
  // The greeting greets the person back (Hamza, 4 Nov 2026): on an open or a return to view, never within a quarter hour of activity, at most hourly unless the app was quit.
  const t = Date.UTC(2026, 9, 15, 6);
  const g = (lastGreeted: number | null, lastActive: number | null, launch = false) => shouldGreet({ lastGreeted, lastActive, now: t, launch });
  check("the greeting shows on the first open and an hour after the last greeting, not sooner", GREETING_GAP_MS === 3_600_000 && g(null, null) && g(Number.NaN, null) && g(t - 3_600_000, t - AWAY_MS) && g(t - 24 * 3_600_000, null) && !g(t - 3_600_000 + 60_000, null) && !g(t - 1_800_000, null));
  check("activity in the last quarter hour never meets a greeting, a launch or a first open included", AWAY_MS === 900_000 && !g(null, t - 60_000) && !g(t - 24 * 3_600_000, t - AWAY_MS + 1_000) && !g(t - 24 * 3_600_000, t - 5_000, true) && g(t - 600_000, t - AWAY_MS, true));
  const greetSrc = readFileSync("components/app/greeting.tsx", "utf8");
  check("the greeting is asked on an open and a return to view alone, never on a timer, and every tap, key or scroll is noted", !/setInterval\(/.test(greetSrc) && /visibilitychange/.test(greetSrc) && /pos:last-greeted/.test(greetSrc) && /pos:last-active/.test(greetSrc) && /"pointerdown", "keydown", "wheel", "touchstart", "scroll"/.test(greetSrc) && isLaunch("navigate", false) && isLaunch(undefined, false) && !isLaunch("navigate", true) && !isLaunch("reload", false) && !isLaunch("back_forward", false));
  check("morning from 5, afternoon from 12, evening from 18 until 5", [4, 5, 11, 12, 17, 18, 23, 0].map(timeGreeting).join("|") === "Good evening|Good morning|Good morning|Good afternoon|Good afternoon|Good evening|Good evening|Good evening");
  check("earnings season runs from the 10th of the month after a quarter to the 20th of the next", isEarningsSeason(10, 10) && isEarningsSeason(10, 31) && isEarningsSeason(11, 20) && !isEarningsSeason(11, 21) && !isEarningsSeason(10, 9) && !isEarningsSeason(12, 5) && !isEarningsSeason(3, 30) && isEarningsSeason(1, 15) && isEarningsSeason(8, 1));
  const season = greetingFor({ y: 2026, m: 10, d: 15, hour: 8 }, "Sam Lee");
  const plain = greetingFor({ y: 2026, m: 12, d: 3, hour: 20 }, null);
  check("in earnings season the title says so and the time of day greets by first name above it", season.title === "Happy earnings season" && season.eyebrow === "Good morning, Sam", JSON.stringify(season));
  check("outside the season the time of day is the title, with no name when there is none", plain.title === "Good evening" && plain.eyebrow === null, JSON.stringify(plain));
  const days = Array.from({ length: QUOTES.length }, (_, i) => quoteOfDay(2026, 1, 1 + i));
  check("one quote a day, the same on every open that day, a different one the next, and every quote in turn", quoteOfDay(2026, 10, 15) === quoteOfDay(2026, 10, 15) && days.every((q, i) => i === 0 || q !== days[i - 1]) && new Set(days).size === QUOTES.length);
  check("a quote shows its words and who said it, never a source; a saying no one can be shown to have said shows its words alone", QUOTES.every((q) => q.text.trim().length > 0 && q.text.length <= 320 && (q.by === null || !/[,(]/.test(q.by))) && QUOTES.filter((q) => q.kind === "saying").every((q) => q.by === null));
  check("each satirical line carries the moment it came from", QUOTES.filter((q) => q.kind === "satire").every((q) => !!q.context) && QUOTES.filter((q) => q.kind !== "satire").every((q) => !q.context));
  check("the approved list holds the concentration line and the reworded Lynch", QUOTES.some((q) => /build wealth, concentrate/.test(q.text)) && QUOTES.some((q) => q.by === "Peter Lynch" && /key organ isn't the brain/.test(q.text)) && !QUOTES.some((q) => /^Stomach is the key organ/.test(q.text)));
  // The quotes come from the person's own record (Hamza, 4 Nov 2026): never shown first, else the one shown longest ago; one record for every device.
  let record: string[] = [];
  const seen: string[] = [];
  for (let i = 0; i < QUOTES.length * 2 + 1; i++) {
    const next = nextQuote(record);
    seen.push(quoteKey(next));
    record = withShown(record, quoteKey(next));
  }
  check("every quote once before any comes round again, in the same order the second time", new Set(seen.slice(0, QUOTES.length)).size === QUOTES.length && seen.slice(QUOTES.length, 2 * QUOTES.length).join() === seen.slice(0, QUOTES.length).join() && record.length === QUOTES.length);
  const lastShown = seen[QUOTES.length - 1];
  check("a repeat is always the quote shown longest ago, never the last one", quoteKey(nextQuote(withShown(seen.slice(0, QUOTES.length - 1), lastShown))) === seen[0] && quoteKey(nextQuote([lastShown])) !== lastShown);
  check("the record drops unknown keys and junk and keeps one entry a quote", withShown(["nope", 3, null, seen[0], seen[0]], seen[1]).join() === [seen[0], seen[1]].join() && withShown([], "nope").length === 0);
  check("the device's record is laid on the vault's, so a greeting not read back yet still counts", mergedShown([seen[0], seen[1]], [seen[0]]).join() === [seen[1], seen[0]].join() && quoteKey(nextQuote(mergedShown([seen[0]], [seen[1]]))) === seen[2]);
  check("the greeting takes its quote from the person's record and notes it in their preferences, never in the demo", /takeNext\(keptRef\.current\)/.test(greetSrc) && /noteQuoteShownAction/.test(greetSrc) && /quotesShown: withShown\(/.test(readFileSync("app/(app)/greeting-actions.ts", "utf8")) && /ws\.mode !== "drive" \|\| ws\.error/.test(readFileSync("app/(app)/greeting-actions.ts", "utf8")));
  const layout = readFileSync("app/(app)/layout.tsx", "utf8");
  check("every screen carries the greeting with the person's record, and the demo greets no one by name and keeps no record", /<Greeting name=\{ws\.mode === "demo" \? null/.test(layout) && /shown=\{ws\.mode === "drive" \? ws\.preferences\.quotesShown : null\}/.test(layout));
  check("every screen asks for itself again while it stays open", /<RefreshWhileOpen \/>/.test(layout) && OPEN_PAGE_REFRESH_MINUTES >= 1 && OPEN_PAGE_REFRESH_MINUTES <= 15);
}


{
  // The Dashboard's headline (Hamza, 15 Oct 2026): no book total, no class weights while Holdings is on, SPY's and QQQ's return beside the book's; no VIX and no largest holding (19 Oct 2026).
  const tile = (id: string, expr: Figure["expr"], by?: Figure["by"]): Figure => ({ id, label: id, unit: "pct", expr, view: "tile", ...(by ? { by } : {}) });
  const total = tile("net-worth", { op: "measure", of: { measure: "sum", over: "holdings", field: "owner_value", where: [] } });
  const tr = tile("transitional", { op: "ratio", num: { measure: "sum", over: "holdings", field: "owner_value", where: [{ field: "class", is: "eq", value: "transitional" }] }, den: { measure: "sum", over: "holdings", field: "owner_value", where: [] } } as Figure["expr"]);
  const ytd = tile("return-ytd", { op: "series", stat: "return", of: "nav", period: "ytd" });
  const spyOwn = tile("spy-own", { op: "series", stat: "return", of: "SPY", period: "ytd" });
  const largest = tile("largest", { op: "measure", of: { measure: "max", over: "holdings", field: "owner_value", where: [] } });
  const h = dashboardHeadline([total, tr, largest, ytd], true, [total, tr, largest, ytd, spyOwn], { series: true, markets: true });
  check("the headline drops the book's total and, while Holdings is on, the weights by class", isBookTotal(total) && !h.some((f) => f.id === "net-worth" || f.id === "transitional"), h.map((f) => f.id).join(","));
  check("beside the book's return this year: the methodology's own SPY figure, then QQQ's; no VIX tile (Hamza, 19 Oct 2026)", h.map((f) => f.id).join(",") === "largest,return-ytd,spy-own,qqq-return-ytd" && HEADLINE_BENCHMARKS.join(",") === "SPY,QQQ" && benchmarkReturn("QQQ", "ytd").label === "QQQ return this year", h.map((f) => f.id).join(","));
  const share = tile("largest-share", { op: "ratio", num: { measure: "max", over: "holdings", field: "owner_value", where: [] }, den: { measure: "sum", over: "holdings", field: "owner_value", where: [] } } as Figure["expr"]);
  const vixOwn = tile("vix-own", { op: "measure", of: { measure: "max", over: "markets", field: "market_level", where: [{ field: "market_symbol", is: "eq", value: "VIX" }] } } as Figure["expr"]);
  const dropped = dashboardHeadline([share, vixOwn, ytd], true, [share, vixOwn, ytd], { series: true, markets: true }).map((f) => f.id);
  check("the Dashboard drops the largest holding's share while Holdings is on, and the VIX always, the methodology's own included (Hamza, 19 Oct 2026)", !dropped.includes("largest-share") && !dropped.includes("vix-own") && dropped.includes("return-ytd") && dashboardHeadline([share], false, [share], { series: false, markets: false }).some((f) => f.id === "largest-share"), dropped.join(","));
  const noSeries = dashboardHeadline([largest], false, [largest], { series: false, markets: false });
  check("with no value series and no market feed the headline is the methodology's own", noSeries.map((f) => f.id).join(",") === "largest");
  const withSeries = dashboardHeadline([largest], false, [largest], { series: true, markets: false });
  check("with a value series and no return of its own, the headline leads with the return this year, SPY's and QQQ's", withSeries.map((f) => f.id).join(",") === "return-ytd,spy-return-ytd,qqq-return-ytd,largest", withSeries.map((f) => f.id).join(","));
  const comp = { label: "Book", kind: "figures" as const, figures: ["largest"] };
  const mComp = methodologySchema.parse({ ...JSON.parse(readFileSync("data/samples/methodology.individual.json", "utf8")) });
  check("a section that measures only the holdings is composition; one over the value series is not", readsComposition({ ...mComp, figures: [...mComp.figures, largest] }, comp) && !readsComposition({ ...mComp, figures: [...mComp.figures, ytd] }, { ...comp, figures: ["return-ytd"] }));

  // This year: SPY, the book, QQQ, live while the market is open.
  const pts = (xs: [string, number][]) => xs.map(([date, value]) => ({ date, value }));
  const spy = yearBase(pts([["2025-12-30", 99], ["2025-12-31", 100], ["2026-10-14", 110], ["2026-10-15", 111]]), "2026-10-15");
  const nav = yearBase(pts([["2025-12-31", 200], ["2026-10-15", 230]]), "2026-10-15", true);
  check("a year's base is last year's last close and the last close before today; the book's own series keeps today's statement", spy?.base === 100 && spy?.last === 110 && spy?.lastDate === "2026-10-14" && nav?.last === 230 && yearReturn(spy!) === 10 && yearBase(pts([["2026-01-02", 1], ["2026-10-14", 2]]), "2026-10-15") === null);
  const now = new Date("2026-10-15T15:00:00Z");
  const quote = (symbol: string, price: number, prevClose: number, at = now): LiveQuote => ({ symbol, price, prevClose, currency: "USD", time: Math.floor(at.getTime() / 1000) });
  const strip = yearStrip({ book: nav, SPY: spy, QQQ: null }, { bookRatio: 1.01, quotes: [quote("SPY", 101, 100), quote("QQQ", 500, 490)] }, now);
  check("the year strip lays today's move on each: SPY by its quote, the book by its net worth now, and gives the book's lead in points", strip.cells[0].pct === 11.1 && strip.cells[0].live && strip.cells[1].pct === 16.15 && strip.cells[1].live && strip.cells[2].pct === null && strip.spreads[0] === 5.05 && strip.spreads[1] === null, JSON.stringify(strip));
  const stale = yearStrip({ book: nav, SPY: spy, QQQ: spy }, { bookRatio: null, quotes: [quote("SPY", 101, 100, new Date("2026-10-14T15:00:00Z"))] }, now);
  check("a quote from before today is not used, and with no prices the strip is the last close and the statement", stale.cells[0].pct === 10 && !stale.cells[0].live && stale.cells[0].asOf === "2026-10-14" && stale.cells[1].pct === 15 && !stale.cells[1].live);
  // Saturday: Friday's quote (16:00 New York) is the last session's and moves a series that ends on Thursday, dated Friday; a series that already carries Friday is not moved twice (Hamza, 17 Oct 2026).
  const saturday = new Date("2026-10-17T15:00:00Z");
  const fridayClose = new Date("2026-10-16T20:00:00Z");
  const spyThu = yearBase(pts([["2025-12-31", 100], ["2026-10-15", 110]]), "2026-10-17");
  const spyFri = yearBase(pts([["2025-12-31", 100], ["2026-10-15", 110], ["2026-10-16", 111]]), "2026-10-17");
  const weekend = yearStrip({ book: nav, SPY: spyThu, QQQ: spyFri }, { bookRatio: 1.01, quotes: [quote("SPY", 111, 110, fridayClose), quote("QQQ", 111, 110, fridayClose)] }, saturday);
  check("after the bell the strip holds the last session: a quote dated that session moves a series that ends before it, to that day, and is not laid on a series that already carries it", weekend.cells[0].pct === 11 && weekend.cells[0].live && weekend.cells[0].asOf === "2026-10-16" && weekend.cells[2].pct === 11 && !weekend.cells[2].live && weekend.cells[2].asOf === "2026-10-16" && weekend.cells[1].live && weekend.cells[1].asOf === "2026-10-16", JSON.stringify(weekend));
  const page = readFileSync("app/(app)/page.tsx", "utf8");
  check("the Dashboard draws the year strip and leaves the same returns out of the tiles, through the one function the live route uses", /year=\{yearOn \? year : null\}/.test(page) && /headlineTiles\(figures, dashboard\.headline/.test(page) && /headline\.filter\(readsPrices\)/.test(page));

  // Everything that can be live is live (Hamza, 16 Oct 2026): the headline figures a price moves, the positions table, and a shut market keeps the Live badge with the reason beside it.
  const valueFig: Figure = { id: "largest", label: "Largest holding", unit: "pct", expr: { op: "measure", of: { over: "holdings", stat: "max", field: "value", where: [] } } } as unknown as Figure;
  const countFig: Figure = { id: "n", label: "Holdings", unit: "count", expr: { op: "measure", of: { over: "holdings", stat: "count", where: [] } } } as unknown as Figure;
  const overCap: Figure = { id: "over", label: "Over cap", unit: "count", expr: { op: "measure", of: { over: "holdings", stat: "count", where: [{ field: "day_change_pct", op: "gt", value: 2 }] } } } as unknown as Figure;
  check("a figure that measures or filters the holdings on a field a price moves is live; one that counts them is not", readsPrices(valueFig) && readsPrices(overCap) && !readsPrices(countFig));
  const tiles = headlineTiles([valueFig, countFig, ytd], ["largest", "return-ytd", "n"], { holdingsOn: false, series: false, markets: false, yearOn: true });
  check("the headline tiles follow the chosen order and leave the year's return to the strip when it is drawn", tiles.map((f) => f.id).join(",") === "largest,n" && headlineTiles([valueFig, ytd], ["largest", "return-ytd"], { holdingsOn: false, series: false, markets: false, yearOn: false }).some((f) => f.id === "return-ytd"), tiles.map((f) => f.id).join(","));
  const held: { symbol: string; assetClass: string; price: number | null; value: number; currency: string; dayChange?: number | null }[] = [
    { symbol: "AAPL", assetClass: "equity", price: 100, value: 1000, currency: "USD" },
    { symbol: "BND", assetClass: "bond", price: 50, value: 500, currency: "USD" },
    { symbol: "CASH", assetClass: "cash", price: null, value: 200, currency: "USD" },
  ];
  const repriced = repriceHoldings(held, [quote("AAPL", 110, 100), quote("BND", 55, 50)], now);
  check("repricing moves each share by its quote against the book's price, in price, value and the day, and leaves bonds and cash as the book has them", repriced.priced === 1 && repriced.holdings[0].value === 1100 && repriced.holdings[0].price === 110 && Math.round(repriced.holdings[0].dayChange! ) === 100 && repriced.holdings[1].value === 500 && repriced.holdings[2].value === 200, JSON.stringify(repriced));
  const positions = { rows: [{ symbol: "AAPL", assetClass: "equity", last: 100, currency: "USD", value: 1000, cost: 800, avgPrice: 80, dayPct: 0.5, ytdPct: 10, sixMonthPct: 5, sinceBoughtPct: 25, dayPnl: 5, unrealizedPnl: 200 }, { symbol: "BND", assetClass: "bond", last: 50, currency: "USD", value: 500, cost: 500, avgPrice: 50, dayPct: 0, ytdPct: 0, sixMonthPct: 0, sinceBoughtPct: 0, dayPnl: 0, unrealizedPnl: 0 }], cash: [{ value: 200 }], total: { value: 1700, cost: 1300, dayPnl: 5, unrealizedPnl: 200, cash: 200 } };
  const livePos = livePositions(positions, [quote("AAPL", 110, 100)], now);
  check("the positions table at today's prices moves a row's price, value, day, gain and the changes since the year's and six months' closes, and sums the totals again", livePos?.priced === 1 && livePos.rows[0].last === 110 && livePos.rows[0].value === 1100 && livePos.rows[0].dayPct === 10 && livePos.rows[0].unrealizedPnl === 300 && livePos.rows[0].sinceBoughtPct === 37.5 && livePos.rows[0].ytdPct === 21 && livePos.rows[0].sixMonthPct === 15.5 && livePos.total.value === 1800 && livePos.total.unrealizedPnl === 300 && livePositions(positions, [quote("AAPL", 110, 100, new Date("2026-10-14T15:00:00Z"))], now) === null, JSON.stringify(livePos));
  {
    // Hamza, 27 Oct 2026: a morning the IBKR fetch failed read "Uploaded" on every page; the book is still fetched, so it says Daily, amber, with why.
    const ok = bookFreshness({ mode: "drive", showcase: false, asOf: "2026-10-23", steps: [{ source: "ibkr_flex", outcome: "ok", sentence: "Fetched." }] }, "2026-10-26");
    const missed = bookFreshness({ mode: "drive", showcase: false, asOf: "2026-10-23", steps: [{ source: "ibkr_flex", outcome: "failed", sentence: "Interactive Brokers could not be reached." }, { source: "filings", outcome: "ok", sentence: "Read." }] }, "2026-10-27");
    const uploaded = bookFreshness({ mode: "drive", showcase: false, asOf: "2026-10-23", steps: [{ source: "filings", outcome: "ok", sentence: "Read." }] }, "2026-10-27");
    check("the book's badge is Daily while a broker fetches it, amber with the reason when the last fetch failed, Uploaded only with no fetch", ok?.label === "Daily" && !ok.stale && missed?.label === "Daily" && missed.stale && missed.rhythm.includes("could not be reached") && uploaded?.label === "Uploaded", JSON.stringify({ ok, missed, uploaded }));
  }
  const shut = asClosed(freshness("close", "2026-10-15", "2026-10-15"));
  check("a live card outside the session keeps its Live badge and says the markets have closed, with the date", shut.label === "Live" && shut.kind === "closed" && shut.when === "Markets have closed · 15 Oct", JSON.stringify(shut));
  const weekendPos = livePositions(positions, [quote("AAPL", 110, 100, fridayClose)], saturday);
  check("after the bell the positions table keeps the last session's closes, dated that session, and the badge names it (Hamza, 17 Oct 2026)", weekendPos?.priced === 1 && weekendPos.session === "2026-10-16" && weekendPos.rows[0].last === 110 && repriceHoldings(held, [quote("AAPL", 110, 100, fridayClose)], saturday).priced === 1 && closedOn(weekendPos!.session).when === "Markets have closed · 16 Oct", JSON.stringify(weekendPos && { s: weekendPos.session, p: weekendPos.priced }));
  const liveSrc = readFileSync("components/live/live.tsx", "utf8");
  const bookCardAt = liveSrc.indexOf("{dayOn ? bookCard : null}");
  check("the Dashboard draws the book's day right under the indices as a heat map, then the S&P 500 heat map with the drivers inside it (the drivers card alone only without the map), then the movers (Hamza, 16, 18 and 19 Oct 2026)", liveSrc.indexOf("<IndexCards") < bookCardAt && bookCardAt < liveSrc.indexOf("<HeatMap") && /<HeatMap [^>]*drivers=\{drivers\}/.test(liveSrc) && liveSrc.indexOf("<HeatMap") < liveSrc.indexOf("<IndexDriversCard") && liveSrc.indexOf("<IndexDriversCard") < liveSrc.indexOf("<Movers") && /<BookMap /.test(readFileSync("components/markets/drivers.tsx", "utf8")) && /after=\{drivers\.length \? <DriversUnderMap/.test(readFileSync("components/markets/heat-map.tsx", "utf8")));
  check("the headline tiles are recomputed in the browser on the repriced book, the positions table is live, and a page whose session read is still running asks again by itself", /repriceHoldings\(lf\.book\.holdings/.test(liveSrc) && /contextFor\(/.test(liveSrc) && !/from\s+["']@\/lib\/(vault|workspace)["']/.test(liveSrc) && /LivePositionsTable/.test(readFileSync("app/(app)/holdings/page.tsx", "utf8")) && /RefreshWhilePending/.test(page) && /lastClose/.test(page));
  // After the bell the page keeps the read (the last session's closes) and asks rarely, the routes answer out of hours, and every card drawn from the read is badged on the session's date (Hamza, 17 Oct 2026).
  const liveRoute = readFileSync("app/api/live/route.ts", "utf8");
  const sessionRoute = readFileSync("app/api/live/session/route.ts", "utf8");
  check("after the bell the page keeps the last read instead of dropping it, asks every ten minutes while shut, and the live routes answer the closes out of hours", !/answer: answer\.open \? answer : null/.test(liveSrc) && /LIVE_CLOSED_POLL_SECONDS/.test(liveSrc) && !/if \(!isTradingHours\(new Date\(\)\)\) return json\(\{ open: false/.test(liveRoute) && /open: isTradingHours\(new Date\(\)\)/.test(liveRoute) && !/return json\(\{ open: false, day: null/.test(sessionRoute) && /open: isTradingHours\(now\)/.test(sessionRoute));
  check("shut, the Dashboard's tiles, book card and chart and the Holdings table are badged on the session's date, with \"at the close\" wording; the session cards keep one title open or shut (Hamza, 18 Oct 2026)", /closedOn\(readSession/.test(liveSrc) && /open \? "Net worth now" : "Net worth"/.test(liveSrc) && /`Session of \$\{dayWords\(book\.session\)\}`/.test(liveSrc) && !/Your book at the close|The US indices now/.test(liveSrc) && /title = "How your book is doing"/.test(readFileSync("components/markets/drivers.tsx", "utf8")) && /What is driving the S&amp;P 500 and QQQ/.test(readFileSync("components/markets/drivers.tsx", "utf8")) && /in points \(pt\)/.test(readFileSync("components/markets/drivers.tsx", "utf8")) && /title = "How the US indices are doing"/.test(readFileSync("components/markets/session.tsx", "utf8")) && /closedOn\(now\.session\)/.test(readFileSync("components/holdings/live-positions.tsx", "utf8")) && /open \? ", today at the prices now" : ", the last session at its close"/.test(readFileSync("components/dashboard/return-chart.tsx", "utf8")));

  // The screen order is dragged on Customise (Hamza, 15 Oct 2026); a save is a permutation of what is shown, else refused.
  const hrefs = ["/", "/holdings", "/performance", "/signals", "/setup"];
  const moved = reorderNav(DEFAULT_PREFERENCES, hrefs, ["/holdings", "/", "/performance", "/signals", "/setup"]);
  check("a dragged order is saved as given; one that drops, repeats or adds a screen is refused", moved?.navOrder.join(",") === "/holdings,/,/performance,/signals,/setup" && reorderNav(DEFAULT_PREFERENCES, hrefs, ["/", "/holdings"]) === null && reorderNav(DEFAULT_PREFERENCES, hrefs, ["/", "/", "/performance", "/signals", "/setup"]) === null && reorderNav(DEFAULT_PREFERENCES, hrefs, ["/", "/holdings", "/performance", "/signals", "/x"]) === null);
  check("by default Triggers and kill signals sit last, right before Settings", SCREEN_IDS.indexOf("signals") === SCREEN_IDS.indexOf("more") - 1, SCREEN_IDS.join(","));
  const custom = readFileSync("components/customise/controls.tsx", "utf8");
  check("the screens on Customise are dragged by a grip, with the arrow keys as the keyboard's way", /setPointerCapture/.test(custom) && /ArrowUp/.test(custom) && /orderNavAction/.test(custom));
  check("a drag measures the rows once at the start and reorders only on the drop, so the row follows the pointer (Hamza, 16 Oct 2026)", /geo\.current = \{ y: e\.clientY, from, rects \}/.test(custom) && /const onUp = \(\) => \{[^}]*const \{ from, to \} = drag/.test(custom) && !/setOrder\(move\(origin/.test(custom));
}


// --- The Company page (Hamza, 20 Oct 2026, after Qualtrim) ---
{
  const rep = (date: string, extra: Record<string, unknown> = {}) => ({ symbol: "AAA", date, ...extra }) as unknown as Parameters<typeof briefReport>[0] & object;
  check("a company's page is at /company/SYMBOL", companyHref("aaa") === "/company/AAA" && companyHref("BRK.B") === "/company/BRK.B");
  check("the brief carries the report after the results for ten days, then not", briefReport(rep("2026-10-15"), "2026-10-20") !== null && briefReport(rep("2026-10-10"), "2026-10-20") !== null && BRIEF_DAYS === 10 && briefReport(rep("2026-10-09"), "2026-10-20") === null && briefReport(null, "2026-10-20") === null);
  const file = { version: 1 as const, updated: "", reports: [rep("2026-07-20"), rep("2026-10-15"), { ...rep("2026-10-16"), symbol: "BBB" }] } as unknown as Parameters<typeof latestReportOf>[0];
  check("the latest report is the company's own, the newest", latestReportOf(file, "aaa")?.date === "2026-10-15" && latestReportOf(file, "ZZZ") === null);
  const entries = [{ symbol: "AAA", date: "2026-10-10" }, { symbol: "AAA", date: "2027-01-28" }, { symbol: "AAA", date: "2026-10-21" }] as unknown as Parameters<typeof nextReport>[0];
  check("the next results are the first on the calendar from today", nextReport(entries, "AAA", "2026-10-20")?.date === "2026-10-21");
  check("the last close and its move", JSON.stringify(lastMove([{ date: "2026-10-19", value: 100 }, { date: "2026-10-16", value: 98 }])) === JSON.stringify({ date: "2026-10-19", price: 100, pct: 2.04 }) && lastMove([]) === null);
  const g = statGroups({ pe_ratio: 25.123, gross_margin_pct: 61.2, net_debt: -2.5e9, roic_pct: null }, "USD", 50, { end: "2026-06-30", revenue: 10, grossProfit: 6, eps: 2, fcf: -1 });
  const row = (t: string, l: string) => g.find((x) => x.title === t)?.rows.find((r) => r.label === l)?.value;
  check("key figures come from the filings' fields, a missing one left out, never a zero", row("Valuation", "Price to earnings") === "25.12x" && row("Margins and growth", "Gross margin") === "61.2%" && row("Balance", "Net debt") === "-$2.5B" && row("Margins and growth", "Return on invested capital") === undefined && g.find((x) => x.title === "Cash flow")!.rows.length === 0, JSON.stringify(g));
  check("today's multiples on the trailing per-share figures, none on a loss", row("Valuation", "Price to sales") === "5.0x" && row("Valuation", "Price to gross profit") === "8.3x" && row("Valuation", "Price to free cash flow") === undefined);
  const charts = companyCharts({ detail: { quarters: { cols: ["2026Q1", "2026Q2"], rows: [{ key: "revenue", label: "Revenue", unit: "money", values: [1e9, 1.2e9] }, { key: "sbc", label: "SBC", unit: "money", values: [null, null] }] }, years: null } } as unknown as Parameters<typeof companyCharts>[0], [{ end: "2026-06-30", revenue: 4, grossProfit: null, eps: 1, fcf: null }, { end: "2026-03-31", revenue: 3.8, grossProfit: null, eps: 0.9, fcf: null }]);
  check("the charts are the report's quarters and years and the filings' per-share figures, an empty line not drawn", charts.quarterly.map((c) => c.key).join() === "revenue" && charts.annual.length === 0 && charts.ttm.map((c) => c.key).join() === "ttm-revenue,ttm-eps" && charts.ttm[0].labels.join() === "Q1 26,Q2 26", JSON.stringify(charts.ttm.map((c) => c.labels)));
  {
    // With no report kept, or one without years, the filings' own years and quarters fill the Financials (Hamza, 23 Oct 2026).
    const years = { cols: ["FY24", "FY25", "TTM"], rows: [{ key: "revenue", label: "Revenue", unit: "money" as const, values: [1e9, 1.1e9, 1.2e9] }] };
    const quarters = { cols: ["Q1 26", "Q2 26"], rows: [{ key: "revenue", label: "Revenue", unit: "money" as const, values: [3e8, 3.1e8] }] };
    const own = companyCharts(null, [], { years, quarters });
    const mixed = companyCharts({ detail: { quarters: { cols: ["2026Q1"], rows: [{ key: "revenue", label: "Revenue", unit: "money", values: [9e8] }] }, years: null } } as unknown as Parameters<typeof companyCharts>[0], [], { years, quarters });
    check("the filings' own years and quarters fill the Financials before any report, and the report's win where it has them", own.annual[0]?.labels.join() === "FY24,FY25,TTM" && own.quarterly[0]?.values.join() === "300000000,310000000" && mixed.quarterly[0]?.values.join() === "900000000" && mixed.annual[0]?.labels.join() === "FY24,FY25,TTM");
  }
  const page = readFileSync("app/(app)/company/[symbol]/page.tsx", "utf8");
  check("the page leads with the brief in parts: the week's headlines, the next results and, for ten days, the report after the results with how the stock took it (Hamza, 20 Oct 2026: a part, never the whole)", /<ReactionBlock r=\{brief\}/.test(page) && /This week<\/p>/.test(page) && /Next results<\/dt>/.test(page) && /weekNews\.slice\(0, brief \? 4 : 5\)/.test(page) && /briefReport\(report, today\)/.test(page) && /CompanyCharts/.test(page) && /CompanyValuation/.test(page) && /CompanyNews/.test(page));
  const linked: [string, RegExp][] = [
    ["components/holdings/portfolio-donuts.tsx", /href: companyHref\(w\.symbol\)/],
    ["components/charts/slice-bars.tsx", /s\.href \?/],
    ["components/holdings/positions-table.tsx", /companyHref\(r\.symbol\)/],
    ["app/(app)/holdings/page.tsx", /href=\{companyHref\(w\.symbol\) as Route\}/],
    ["app/(app)/watchlist/page.tsx", /companyHref\(symbol\)/],
    ["lib/calendar-run.ts", /source: companyHref\(e\.symbol\)/],
    ["components/earnings/report.tsx", /companyHref\(r\.symbol\)/],
    ["components/markets/drivers.tsx", /href=\{companyHref\(r\.symbol\)\}/],
    ["components/holdings/what-made.tsx", /href=\{companyHref\(r\.symbol\)\}/],
    ["app/(app)/theses/[symbol]/page.tsx", /companyHref\(symbol\)/],
    ["app/(app)/trades/[symbol]/page.tsx", /companyHref\(symbol\)/],
  ];
  const missing = linked.filter(([f, re]) => !re.test(readFileSync(f, "utf8"))).map(([f]) => f);
  check("a ticker opens its company page from Holdings, the donut list, the positions, the watchlist, the Calendar's results, the heat maps, Theses and Trades", !missing.length, missing.join(", "));
}

// Notifications on the person's devices: one recap after each close (Hamza, 20 Oct 2026).
{
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } };
  check("push: a browser's subscription is an https push address with its keys", subscriptionSchema.safeParse(sub).success && !subscriptionSchema.safeParse({ ...sub, endpoint: "http://localhost/x" }).success);
  let file = withDevice(EMPTY_PUSH, sub, deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "2026-10-20T10:00:00.000Z");
  file = withDevice(file, sub, "Again", "2026-10-20T10:01:00.000Z");
  check("push: one device per address, named by its browser", file.devices.length === 1 && file.devices[0].label === "Again" && deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1") === "Safari on iPhone" && deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36") === "Chrome on Mac");
  let many = EMPTY_PUSH;
  for (let i = 0; i < MAX_DEVICES + 2; i++) many = withDevice(many, { ...sub, endpoint: `https://web.push.apple.com/d${i}` }, "x", `2026-10-20T10:0${i % 10}:00.000Z`);
  check("push: at most MAX_DEVICES, the oldest goes", many.devices.length === MAX_DEVICES && many.devices[0].endpoint.endsWith("/d2"));
  check("push: a recap is owed once per session, only with a device", recapDue(file, "2026-10-20") && !recapDue(EMPTY_PUSH, "2026-10-20") && !recapDue(recapSent(file, "2026-10-20", [], "2026-10-20T20:40:00.000Z"), "2026-10-20") && !recapDue(withoutDevices(file, [sub.endpoint], "x"), "2026-10-20"));
  const at = (h: number) => new Date(Date.parse("2026-10-20T20:40:00Z") - h * 3600_000).toISOString();
  const item = (id: string, tone: "danger" | "warn" | "info", hoursAgo: number, title: string, key = `watch:${id}`) => ({ id, key, firedAt: at(hoursAgo), clearedAt: null, tone, title, detail: "", href: "/", figures: [], emailedAt: null, dismissedAt: null });
  const items = [item("a", "info", 2, "Thesis Hunter on MA: volumes up", `${HUNTER_PREFIX}stock:MA:h1`), item("b", "danger", 5, "BIRK is over its cap at $4,210 held"), item("c", "warn", 1, "MA reports tomorrow"), item("d", "info", 100, "Old"), item("e", "info", 3, "Told", "watch:e"), { ...item("f", "warn", 1, "Dismissed"), dismissedAt: at(0) }];
  const told = recapSent(file, "2026-10-19", ["e"], at(24));
  const recap = recapItems(items, told, new Date("2026-10-20T20:40:00Z"));
  check("push: the recap covers what fired in the last days, not told, not dismissed, the most pressing first, never a Thesis Hunter find", recap.map((i) => i.id).join() === "b,c", recap.map((i) => i.id).join());
  const m = closeRecap(recap, "2026-10-20");
  check("push: one notification, its count, the top titles with every amount masked", !!m && m.title === "After the close, 20 Oct: 2 new alerts" && !/\$4,210/.test(m.body) && m.body.split("\n")[0] === maskMoney("BIRK is over its cap at $4,210 held") && m.url === "/notifications" && m.tag === "close-2026-10-20", JSON.stringify(m));
  const five = closeRecap([...recap, item("g", "info", 1, "G"), item("h", "info", 1, "H")], "2026-10-20");
  check("push: past three, the rest is counted; nothing new, nothing sent", !!five && /And 1 more on Notifications\.$/.test(five.body) && closeRecap([], "2026-10-20") === null);
  const sent = recapSent(file, "2026-10-20", recap.map((i) => i.id), "2026-10-20T20:40:00.000Z");
  check("push: what was told is not told again", recapItems(items, sent, new Date("2026-10-21T20:40:00Z")).every((i) => !["b", "c"].includes(i.id)));
  const wired = /sendCloseRecapInto\(vault, day\.session, now\)/.test(readFileSync("lib/market-recap-run.ts", "utf8")) && /closedBy\(now\) === day\.session/.test(readFileSync("lib/market-recap-run.ts", "utf8")) && /<PushCard/.test(readFileSync("app/(app)/notifications/page.tsx", "utf8")) && /\{push\}/.test(readFileSync("components/notifications/notices.tsx", "utf8")) && /showNotification/.test(readFileSync("public/sw.js", "utf8")) && /display: "standalone"/.test(readFileSync("app/manifest.ts", "utf8"));
  check("push: the evening run sends it after the close; Notifications turns a device on; the worker shows it; the manifest lets an iPhone add the app", wired);
  const noticesSrc = readFileSync("components/notifications/notices.tsx", "utf8");
  check("push: the Notifications empty state is centred, not a card in a grid", /<ListSection grid=\{unreadNow\.length > 0\} header="Now"/.test(noticesSrc));
  // Mark all read empties Now (Hamza, 4 Nov 2026): what is read and still holds folds into a closed Read row, still there to open or dismiss.
  check("Notifications: Now holds the unread alerts and the read ones fold under a closed Read row", /const unreadNow = shown\.filter\(\(a\) => unreadSet\.has\(a\.id\)\)/.test(noticesSrc) && /<details className="group mb-8">[\s\S]*?Read <span[\s\S]*?readNow\.map/.test(noticesSrc) && !/<details[^>]*\bopen\b/.test(noticesSrc));
  check("the Thesis Hunter's finds are no alerts: the weekly and monthly review carry them (Hamza, 5 Nov 2026)", !/hunter/i.test(readFileSync("lib/alerts-run.ts", "utf8").replace(/\/\/.*$/gm, "")) && !/hunter/i.test(readFileSync("lib/screen-data.ts", "utf8")));
}

{
  // Coming back to the app (Hamza, 23 Oct 2026): an action that missed the server threw Next's "This page couldn't load" over the whole page.
  const offline = new TypeError("Failed to fetch");
  const safari = new TypeError("Load failed");
  const skew = Object.assign(new Error('Server Action "00a9" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'), { name: "UnrecognizedActionError" });
  const chunk = Object.assign(new Error("Loading chunk 812 failed."), { name: "ChunkLoadError" });
  const page = new Error("An unexpected response was received from the server.");
  const server = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "4183" });
  check("reach: a failed trip is told apart: offline, a new version, an error page", unreachedKind(offline) === "offline" && unreachedKind(safari) === "offline" && unreachedKind(skew) === "updated" && unreachedKind(chunk) === "updated" && unreachedKind(page) === "answer" && unreachedKind(server) === null && unreachedKind("x") === null);
  check("reach: each says what happened, never a figure", /could not be reached/.test(unreachedSentence(offline)) && /updated since this page opened/.test(unreachedSentence(skew)) && /did not finish/.test(unreachedSentence(page)) && unreachedSentence(new Error("$1,234 boom")) === "That did not go through. Try again.");
  check("an upload too large for the host is refused in the browser with its size", uploadTooLarge([UPLOAD_MAX_BYTES]) === null && /is 5\.2 MB; the most the app takes at once is 4 MB/.test(uploadTooLarge([5.2 * 1024 * 1024]) ?? "") && /Those files come to/.test(uploadTooLarge([3 * 1024 * 1024, 2 * 1024 * 1024]) ?? "") && /uploadTooLarge\(/.test(readFileSync("components/app/file-action.tsx", "utf8")) && /sendDirect\(file, direct\)/.test(readFileSync("components/app/file-action.tsx", "utf8")) && /direct=\{\{ start: startDocumentUploadAction, finish: draftFromDriveAction \}\}/.test(readFileSync("components/setup/input-cards.tsx", "utf8")) && uploadTooLarge([12 * 1024 * 1024], DIRECT_UPLOAD_MAX_BYTES) === null);
  {
    const run = readFileSync("lib/notifications-run.ts", "utf8");
    const page = readFileSync("app/(app)/notifications/page.tsx", "utf8");
    check("Notifications: the page, Dismiss and Mark all read lay the same notices on the kept alerts, so a dismissed report or event alert is found and kept dismissed (Hamza, 5 Nov 2026)", /screenAlerts\(ws, today\)/.test(page) && !/deriveScreens\(/.test(page) && /export async function currentAlerts[\s\S]*screenAlerts\(ws\)/.test(run) && /earnings: earnings\.notices, community, calendar, macro/.test(run) && (run.match(/await currentAlerts\(ws\)/g) ?? []).length === 2);
  }
  check("reach: Turbopack's chunk the page's version does not know is a new version, and mends on a reload", unreachedKind(new Error("can't infer type of chunk from URL /_next/static/chunks/x")) === "updated" && unreachedKind(new Error("Failed to load chunk /_next/static/chunks/x.js")) === "updated" && mendsOnReload(new Error("can't infer type of chunk from URL x")));
  check("reach: offline and a new version mend on a reload, once a minute at most", mendsOnReload(offline) && mendsOnReload(chunk) && !mendsOnReload(page) && !mendsOnReload(server) && mayReload(null, 1) && !mayReload(1000, 1000 + RELOAD_GUARD_MS) && mayReload(1000, 1001 + RELOAD_GUARD_MS));
  check("reach: a screen that failed says so in the app's words", pageFailedWords(offline, true).title === "Waiting for the connection" && pageFailedWords(skew, true).title === "Loading the new version" && pageFailedWords(offline, false).title === "This screen could not be shown" && /server could not draw/.test(pageFailedWords(server, false).sentence) && /in the browser/.test(pageFailedWords(new Error("x"), false).sentence));
  const read = (f: string) => readFileSync(f, "utf8");
  const wired = ["components/app/action-form.tsx", "components/app/action-button.tsx", "components/app/file-action.tsx"].every((f) => /await reach\(/.test(read(f))) && /reach\(\(\) => action\(\.\.\.args\)\)/.test(read("components/app/done-mark.tsx")) && /quietly\(\(\) => watchForwardingAction/.test(read("components/statements/forwarding-watch.tsx")) && /quietly\(\(\) => markNewsletterReadAction/.test(read("components/markets/newsletter-cards.tsx")) && /unstable_rethrow\(e\)/.test(read("components/app/reach.ts"));
  check("reach: every action form, button, file and background look goes through it", wired);
  const bare = execSync("grep -rnE 'useActionState(<[^>]*>)?\\([a-zA-Z]+Action,' components app --include=*.tsx || true", { encoding: "utf8" }).trim();
  check(`reach: no useActionState takes a bare server action${bare ? `: ${bare.split("\n")[0]}` : ""}`, bare === "");
  check("reach: a screen and the frame fail into the app's own page, not Next's", existsSync("app/(app)/error.tsx") && /<PageFailed/.test(read("app/(app)/error.tsx")) && existsSync("app/global-error.tsx") && /<PageFailed/.test(read("app/global-error.tsx")) && /window\.location\.reload\(\)/.test(read("components/app/page-failed.tsx")));
  // Leaving Notifications after Dismiss waited for the vault (Hamza, 23 Oct 2026): React holds a navigation until a pending transition ends.
  const notices = read("components/notifications/notices.tsx");
  check("Dismiss and Mark all read are sent outside any transition, so another screen opens at once", !/useTransition|useActionState|startTransition/.test(notices) && /sendNotice\(\{ dismiss: \[id\] \}\)/.test(notices) && /sendNotice\(\{ read: true \}\)/.test(notices) && !/dismissAlertAction|markNotificationsReadAction/.test(read("app/(app)/notifications/actions.ts")));
  const send = read("components/notifications/send.ts");
  check("they go one at a time to the route, kept alive past leaving the page, and a failed trip is a sentence", /queue = next/.test(send) && /keepalive: true/.test(send) && /"\/api\/notifications"/.test(send) && /unreachedSentence\(e\)/.test(send) && existsSync("app/api/notifications/route.ts") && /dismissAlerts\(/.test(read("app/api/notifications/route.ts")) && /markAllRead\(/.test(read("app/api/notifications/route.ts")));
  check("the menu's unread badge follows what was pressed, since the layout is not drawn again", /announceUnread\(unreadCount\)/.test(notices) && /useBadges\(served\)/.test(read("components/app/top-bar.tsx")) && /useBadges\(served\)/.test(read("components/app/tab-bar.tsx")));
}

// --- Watchers and screens asked in words (Hamza, 23 Oct 2026) --------------
{
  const wb = bookSchema.parse({ asOf: "2026-10-22", holdings: [
    { id: "a", account: "U1", source: "ibkr", symbol: "AAA", name: "A", assetClass: "equity", quantity: 10, price: 30, currency: "USD", value: 300, costBasis: null, asOf: "2026-10-22", valuation: "broker", country: null, sector: null, themes: [], fundamentals: { operating_margin_pct: 45 } },
    { id: "b", account: "U1", source: "ibkr", symbol: "BBB", name: "B", assetClass: "equity", quantity: 1, price: 100, currency: "USD", value: 100, costBasis: null, asOf: "2026-10-22", valuation: "broker", country: null, sector: null, themes: [] },
  ], lookThrough: [], transactions: [], fx: { base: "USD", asOf: "2026-10-22", rates: {}, source: "t" } });
  const tool = (input: unknown, name = "record_watcher") => ({ content: [{ type: "tool_use", name, input }] });
  const margin = parseWatcherResponse(tool({ ok: true, subject: "company", symbol: "aaa", field: "operating_margin_pct", is: "lte", value: 50 }));
  check("watchers: words compile to one figure at one level, the ticker upper-cased and the test said back in the app's words", margin.ok && margin.watcher.subject.kind === "company" && (margin.watcher.subject as { symbol: string }).symbol === "AAA" && /at or below 50/.test(margin.watcher.reads), JSON.stringify(margin));
  check("watchers: a figure the app does not read, an indicator it does not know, or words with no level are refused in a sentence", !parseWatcherResponse(tool({ ok: true, subject: "company", symbol: "AAA", field: "sentiment", is: "gte", value: 1 })).ok && !parseWatcherResponse(tool({ ok: true, subject: "market", symbol: "NOPE", is: "gte", value: 1 })).ok && !parseWatcherResponse(tool({ ok: false, why: "a feeling" })).ok && !parseWatcherResponse({ content: [{ type: "text", text: "sure" }] }).ok);
  const ws1 = [{ id: "w1", words: "AAA's margin under 50%", at: "2026-10-22T00:00:00Z", ...(margin.ok ? margin.watcher : ({} as never)) }, { id: "w2", words: "any position over 50%", at: "2026-10-22T00:00:00Z", subject: { kind: "holdings" as const }, field: WEIGHT_FIELD, is: "gte" as const, value: 50, reads: "weight" }];
  const wn = watcherNotices(ws1, wb, null, "2026-10-22");
  check("watchers: one that holds is an alert per subject, keyed by the watcher, citing the person's own words", wn.map((n) => n.key).join(",") === `${WATCHER_PREFIX}w1:AAA,${WATCHER_PREFIX}w2:AAA` && wn.every((n) => /You asked/.test(n.detail ?? "")), wn.map((n) => n.key).join(","));
  check("watchers: the reading said back mid-sentence lowers a word, never a ticker or an indicator (MA's, VIX)", readsInSentence("Operating margin at or below 50") === "operating margin at or below 50" && readsInSentence("MA's revenue growth") === "MA's revenue growth" && readsInSentence("VIX at or above 30") === "VIX at or above 30");
  check("watchers: a figure not read is no reading, never a zero that holds", watcherReadings({ ...ws1[0], subject: { kind: "company", symbol: "BBB" } }, wb, null)[0].reading === null && !watcherReadings({ ...ws1[0], subject: { kind: "company", symbol: "BBB" } }, wb, null)[0].met);
  check("watchers: the prompt is the words, the fields and the tickers, and takes no figure of the book", JSON.stringify(watcherRequestBody("AAA's margin under 50%", ["AAA", "BBB"])).includes("operating_margin_pct") && watcherRequestBody.length <= 3);
  const screen = parseScreenWordsResponse(tool({ filters: [{ field: "operating_margin_pct", is: "gte", value: 30 }, { field: "sector", is: "in", value: ["information technology"] }, { field: "vibes", is: "gte", value: 1 }], cannot: ["Cloud customers"] }, "record_screen"));
  check("screen in words: filters on the ontology's fields, a sector matched to the list, an unknown field dropped and named", screen.ok && screen.filters.length === 2 && screen.dropped.length === 1 && screen.cannot[0] === "Cloud customers", JSON.stringify(screen));
  check("screen in words: nothing a field can read is a sentence, never an empty screen", !parseScreenWordsResponse(tool({ filters: [], cannot: ["AI winners"] }, "record_screen")).ok);
  if (screen.ok) {
    const ws2 = { id: "s1", words: "Software with margins over 30%", filters: screen.filters, cannot: [], at: "2026-10-22T00:00:00Z" };
    const c = (symbol: string, sector: string, m: number) => ({ symbol, name: symbol, cik: null, sector, cap: 1e9, price: 10, readAt: "2026-10-20", values: { operating_margin_pct: m }, shares: null, usd: true, error: null, subIndustry: null, sic: null });
    const file = { version: 1 as const, universe: ["XXX", "YYY", "ZZZ"], bySymbol: { XXX: c("XXX", "Information Technology", 40), YYY: c("YYY", "Information Technology", 20), ZZZ: c("ZZZ", "Financials", 50) }, updated: "2026-10-20" };
    const out = screenWith(screenClass(ws2), file, {}, new Set(["XXX"]), new Set(), "2026-10-22");
    check("screen in words: the app runs every filter itself on the screener's companies", out.total === 1 && out.rows[0].symbol === "XXX" && out.rows[0].held, JSON.stringify(out.rows.map((r) => r.symbol)));
    check("screen in words: each filter is shown in the app's words", screenFilterWords(ws2).length === 2);
  }
  check("watchers and word screens are slots of their screens", SCREENS.notifications.slots.includes("watchers") && SCREENS.screener.slots.includes("screen_words"));
}

// Opening the app catches up behind the page (lib/catch-up.ts, after()), within the page's own time: no screen under the app's layout cuts it short (27 Oct 2026: Notifications timed out at 60 seconds, then Calendar at 120).
{
  const pages = execSync("find 'app/(app)' -name page.tsx", { encoding: "utf8" }).trim().split("\n");
  const short = pages.filter((f) => {
    const m = /export const maxDuration = (\d+)/.exec(readFileSync(f, "utf8"));
    return m && Number(m[1]) < 300;
  });
  check("every screen gives the catch-up behind it five minutes", pages.length > 20 && short.length === 0, short.join(", "));
}

// Nothing about one person or one deployment is written in the code (29 Oct 2026).
{
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
  const files = ["lib", "components", "app"].flatMap(walk);
  const strings = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n").match(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  const naming = files.filter((f) => f !== "lib/library.ts" && strings(readFileSync(f, "utf8")).some((t) => /\bHCMP\b|\bHamza\b/.test(t)));
  check("no user-visible string names HCMP or Hamza outside the library's credit", naming.length === 0, naming.join(", "));
  const models = files.filter((f) => f !== "lib/models.ts" && /"claude-(haiku|sonnet|opus|fable)-[0-9-]+"/.test(readFileSync(f, "utf8")));
  check("a Claude model's name is written in lib/models.ts alone", models.length === 0, models.join(", "));
  const addresses = files.filter((f) => /portfolio\.os\.statements@gmail\.com|portfolio-os-demo\.vercel\.app/.test(readFileSync(f, "utf8")));
  check("the contact and demo addresses come from the deployment's settings", addresses.length === 0, addresses.join(", "));
}

{
  // Scheduled runs as jobs, one per person (docs/ARCHITECTURE.md §5.3; Hamza, 2 Nov 2026).
  const at = new Date("2026-11-02T06:00:30Z");
  check("jobs: one key per kind, person and run, so a second cron in the same run enqueues nothing; the evening's six runs are hours apart", runSlot("morning", at) === "2026-11-02" && runSlot("evening", at) === "2026-11-02T06" && dedupeKey("morning", who("a@b.co"), runSlot("morning", at)) === dedupeKey("morning", who("A@b.co "), runSlot("morning", new Date("2026-11-02T23:00:00Z"))) && dedupeKey("evening", "p", runSlot("evening", at)) !== dedupeKey("evening", "p", runSlot("evening", new Date("2026-11-02T07:00:00Z"))));
  const r1 = retryAt(1, at);
  const r2 = retryAt(2, at);
  check("jobs: a failure is tried again after 1 and then 4 minutes, and left as failed after the third", MAX_ATTEMPTS === 3 && BACKOFF_MINUTES[0] === 1 && !!r1 && r1.getTime() - at.getTime() >= 60_000 && r1.getTime() - at.getTime() < 91_000 && !!r2 && r2.getTime() - at.getTime() >= 240_000 && retryAt(3, at) === null);
  {
    // A job whose worker dies every time is not taken up again until it expires (the state machine audit, 11 Nov 2026).
    const runner = readFileSync("lib/jobs-run.ts", "utf8");
    const reclaims = [...runner.matchAll(/status = 'running' and locked_until < \$\{[^}]+\}::timestamptz( and attempts < \$\{MAX_ATTEMPTS\})?\)/g)];
    check("jobs: a job whose worker died is claimed again and counted as due only while it has attempts left, and one with none is failed with a sentence", reclaims.length === 2 && reclaims.every((m) => !!m[1]) && /attempts >= \$\{MAX_ATTEMPTS\}/.test(runner) && /await failAbandoned\(/.test(runner) && /three times/.test(ABANDONED_SENTENCE), String(reclaims.length));
    // Alert mail claims are given back whatever stopped the send, so the next check sends what this one did not.
    const alertsRun = readFileSync("lib/alerts-run.ts", "utf8");
    const caught = alertsRun.slice(alertsRun.indexOf("} catch (e) {", alertsRun.indexOf("claimMail(")));
    check("alerts: what was claimed and not sent is given back before any error is thrown on", caught.indexOf("releaseMail(") > 0 && caught.indexOf("releaseMail(") < caught.indexOf("if (!(e instanceof SyncError)) throw e;"));
  }
  check("jobs: a morning refresh not run by the evening is expired, not run at night", !expired("morning", at, new Date("2026-11-02T12:00:00Z")) && expired("morning", at, new Date("2026-11-02T21:00:00Z")));
  const rows: JobRow[] = [
    { kind: "morning", status: "done", runAt: "2026-11-02T06:00:00Z", startedAt: "2026-11-02T06:00:10Z", finishedAt: "2026-11-02T06:00:40Z", attempts: 1, error: null },
    { kind: "morning", status: "failed", runAt: "2026-11-02T06:00:00Z", startedAt: "2026-11-02T06:00:10Z", finishedAt: "2026-11-02T06:20:00Z", attempts: 3, error: "Your IBKR token has expired." },
    { kind: "morning", status: "queued", runAt: "2026-11-02T06:00:00Z", startedAt: null, finishedAt: null, attempts: 0, error: null },
  ];
  const sum = summarise(rows, new Date("2026-11-02T06:45:00Z")).find((k) => k.kind === "morning");
  check("jobs: the operator's summary counts each state, the slowest twentieth and the oldest waiting, and names no person", !!sum && sum.done === 1 && sum.failed === 1 && sum.queued === 1 && sum.retried === 1 && sum.p95Seconds === 30 && sum.oldestWaitingMinutes === 45 && queueLag(rows, new Date("2026-11-02T06:45:00Z")) === 45 && !JSON.stringify(sum).includes("@"), JSON.stringify(sum));
  const line = JSON.parse(logLine("info", "job.done", { kind: "morning", who: who("someone@example.com"), ms: 1200, detail: "x".repeat(400) }));
  check("logs: a line is JSON with the event and a fingerprint of the person, never the address, and a long field is cut", line.event === "job.done" && /^[0-9a-f]{12}$/.test(line.who) && !JSON.stringify(line).includes("someone") && line.detail.length === MAX_TEXT);
  const jobsRun = readFileSync("lib/jobs-run.ts", "utf8");
  check("jobs: every cron enqueues one job per person and starts workers in their own functions; the worker is guarded by the cron's secret", ["alerts", "evening", "results", "hunter", "reports", "screener"].every((c) => /runAsJobs\(/.test(readFileSync(`app/api/cron/${c}/route.ts`, "utf8"))) && /refuseUnlessCron\(request\)/.test(readFileSync("app/api/jobs/run/route.ts", "utf8")) && /for update skip locked/.test(jobsRun) && /on conflict \(dedupe_key\) do nothing/.test(jobsRun) && !/console\.\w+\([^)]*\.email/.test(jobsRun));
  check("dispatcher: nothing due starts no worker, and the busy ones count against the cap", workersToStart(0, 0) === 0 && workersToStart(3, 0) === 3 && workersToStart(50, 0) === DISPATCH_CAP && workersToStart(50, DISPATCH_CAP - 2) === 2 && workersToStart(5, DISPATCH_CAP + 3) === 0);
  check("a worker waits for its own retry inside its window, and leaves one past it to the hourly dispatcher", retryWait([], 1000, 5000) === null && retryWait([7000], 1000, 5000) === null && retryWait([3000, 2000], 1000, 5000) === 1000 && retryWait([500], 1000, 5000) === 0);
  {
    const record = { compute_time_seconds: 110.3 * 3600, active_time_seconds: 441 * 3600, consumption_period_start: "2026-11-01T00:00:00Z", consumption_period_end: "2026-12-01T00:00:00Z", owner: { subscription_type: "free_v3" }, compute_last_active_at: "2026-11-22T01:10:00Z" };
    const bare = parseNeonProject(record);
    const wrapped = parseNeonProject({ project: record });
    check("db usage: the project record reads alone or under project, and a record without its times is none", bare !== null && wrapped !== null && Math.abs(bare.cuHours - 110.3) < 1e-9 && bare.activeHours === 441 && wrapped.plan === "free_v3" && parseNeonProject({ project: { compute_time_seconds: 5 } }) === null && parseNeonProject(null) === null);
    const half = paceOf(bare!, new Date("2026-11-16T00:00:00Z"));
    check("db usage: the pace doubles a month half gone, and is none in its first hour", half !== null && Math.abs(half.projected - 220.6) < 1e-6 && Math.abs(half.share - 220.6 / FREE_CU_HOURS) < 1e-9 && paceOf(bare!, new Date("2026-11-01T00:30:00Z")) === null);
    const ended = paceOf(bare!, new Date("2026-12-03T00:00:00Z"));
    check("db usage: past the period's end the month is what was used", ended !== null && Math.abs(ended.projected - 110.3) < 1e-9);
    check("db usage: the free plan is named with its limit, a paid one by the month's end", onFreePlan(bare!) && usageWords(bare!, new Date("2026-11-16T00:00:00Z")).includes(`of the free plan's ${FREE_CU_HOURS}`) && !onFreePlan({ ...bare!, plan: "launch" }) && usageWords({ ...bare!, plan: "launch" }, new Date("2026-11-16T00:00:00Z")).endsWith("by the month's end."));
  }
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
  const routes = ["dispatch", "results", "alerts", "evening", "hunter", "reports", "screener"].map((c) => `app/api/cron/${c}/route.ts`).concat("app/api/jobs/run/route.ts");
  check("dispatcher: a cron once an hour, past the reviews' run so the database wakes once (Hamza, 25 Nov 2026), the crons and workers given 800 seconds, and a job's lock outlives any function", crons.some((c) => c.path === "/api/cron/dispatch" && c.schedule === "6 * * * *") && crons.some((c) => c.path === "/api/cron/reviews" && c.schedule.startsWith("5 ")) && routes.every((f) => /export const maxDuration = 800;/.test(readFileSync(f, "utf8"))) && LOCK_MINUTES * 60 > 800 && WORKER_START_MS < 800_000 && /refuseUnlessCron\(request\)/.test(readFileSync("app/api/cron/dispatch/route.ts", "utf8")));
  check("results watch: a cron every quarter hour, queuing anyone only in the results hours or after a calendar event (Hamza, 7 Nov 2026), each run its own quarter hour", crons.filter((c) => c.path === "/api/cron/results").map((c) => c.schedule).join("|") === "*/15 * * * *" && resultsHours(new Date("2026-11-04T12:44:59Z")) && !resultsHours(new Date("2026-11-04T16:00:00Z")) && !resultsHours(new Date("2026-11-07T12:00:00Z")) && /!resultsHours\(now\) && !eventWindowOpen\(ECON_EVENTS, now\)/.test(readFileSync("app/api/cron/results/route.ts", "utf8")) && runSlot("results", new Date("2026-11-04T12:44:59Z")) === "2026-11-04T12:30" && runSlot("results", new Date("2026-11-04T12:45:00Z")) === "2026-11-04T12:45" && expired("results", at, new Date("2026-11-02T07:30:00Z")));
  check("sign-up: codes are limited per address and per network across instances", /allow\(limitKey\("code-address", email\), CODES_PER_ADDRESS, 3600\)/.test(readFileSync("app/sign-up/actions.ts", "utf8")) && (readFileSync("app/sign-up/actions.ts", "utf8").match(/await codeLimit\(email\)/g) ?? []).length === 2);
}

// Resonance, the citation margin and the search palette (Hamza, 4 Nov 2026).
{
  const rule = (id: string, severity: "breach" | "guideline" | "watch", tested = true) => ({ id, section: id.toUpperCase(), text: `Rule ${id}`, severity, test: tested ? { figure: "f", is: "lte" as const, limit: 10 } : null });
  const finding = (id: string, severity: "breach" | "guideline" | "watch", status: "pass" | "near" | "fail" | "manual" | "n/a") => ({ rule: rule(id, severity, status !== "manual"), figure: null, status, actual: null, limit: null, detail: "", needs: [], offenders: [] }) as unknown as Finding;
  const fs = [finding("a", "breach", "pass"), finding("b", "breach", "fail"), finding("c", "guideline", "near"), finding("d", "guideline", "fail"), finding("e", "watch", "fail"), finding("f", "breach", "manual"), finding("g", "breach", "n/a")];
  const todoItem = (key: string, act: TodoItem["act"], group: TodoItem["group"] = "now") => ({ key, group, title: key, why: "", done: "", section: null, symbol: null, date: null, href: "/todo", act, reading: null, decision: null }) as TodoItem;
  const trade = (key: string) => ({ key, date: "2026-11-03", tone: "info" as const, title: key, detail: "", href: "/notifications" });
  const res = resonanceOf(fs, [todoItem("red:x", "decide"), todoItem("sale:AAA:2026-11-02", "log"), todoItem("manual:r", "check"), todoItem("dated:y", "decide", "due")], [trade(`${TRADE_PREFIX}AAA:2026-11-02:sell`), trade(`${TRADE_PREFIX}BBB:2026-11-03:buy`), { ...trade("study:1"), tone: "ok" as const }]);
  check("Resonance is the rules kept out of the rules the app can measure; a rule it cannot measure, one waiting for data and a watch are counted apart, never as kept", res.score === 50 && res.kept === 2 && res.measured === 4 && res.breaches === 1 && res.outside === 1 && res.tripped === 1 && res.manual === 1 && res.waiting === 1 && res.unkept.map((u) => u.section).join(",") === "B,D", JSON.stringify(res));
  check("Resonance with nothing measurable is no score, never a zero", resonanceOf([finding("f", "breach", "manual")], [], []).score === null && resonanceOf([], [], []).score === null);
  check("decisions owed are the to-do's decisions now and the new trades still asking for a reason, a sale the to-do already asks to log counted once", res.owed === 3 && decisionsOwed([], []) === 0, String(res.owed));
  const dash = readFileSync("app/(app)/page.tsx", "utf8");
  const line = readFileSync("components/dashboard/resonance-line.tsx", "utf8");
  check("the Dashboard opens with the Resonance line before the year strip, from the methodology's own findings, and says what it waits for without one", dash.indexOf("<ResonanceLine") > 0 && dash.indexOf("<ResonanceLine") < dash.indexOf("<BookNow") && /resonanceOf\(data\.findings, data\.todo, data\.notices\)/.test(dash) && /Waits for a confirmed methodology/.test(dash) && /RESONANCE_ABOUT/.test(line) && /view=checks/.test(line) && RESONANCE_ABOUT.includes("rules kept out of the rules the app can measure"));
  const views = readFileSync("components/methodology/views.tsx", "utf8");
  const cite = readFileSync("components/ui/cite.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  check("verdict cards cite their rule's section in a margin from 1024px, behind a gilt hairline, and inline below it", /<Cited cites=\{citeOf\(f\)\}/.test(views) && /className="cite-inline"/.test(views) && /<Cited/.test(readFileSync("app/(app)/holdings/page.tsx", "utf8")) && /<Cited/.test(line) && /sectionMark\(c\.section\)/.test(cite) && sectionMark("3.1") === "§3.1" && sectionMark("D.1(c)") === "§D.1(c)" && sectionMark("Section 2 summary") === "Section 2 summary" && /@media \(min-width: 1024px\)[\s\S]*\.cite-margin \{[^}]*border-left: 1px solid var\(--gilt-soft\)/.test(css));
  const src: PaletteSources = {
    screens: [{ kind: "screen", key: "screen:holdings", label: "Holdings", detail: "Book", href: "/holdings" }, { kind: "screen", key: "screen:methodology", label: "Methodology", detail: "Rules", href: "/methodology" }],
    rules: ruleEntries([{ id: "position-cap", section: "3.1", text: "No single position above 10%", tested: "Tested" }, { id: "thesis", section: "A.2", text: "Every holding has a written thesis", tested: null }], "checks"),
    tickers: tickerEntries(["NVDA", "US0378331005"], ["ASML", "nvda"], ["COST"], new Map([["NVDA", "NVIDIA Corp"]]), companyHref),
  };
  const hits = (q: string) => paletteResults(q, src).map((e) => e.key).join(",");
  check("the palette lists the screens with nothing typed, a ticker before the rest, and a ticker held, watched or traded once each, no ISIN", hits("") === "screen:holdings,screen:methodology" && hits("nvda") === "ticker:NVDA" && src.tickers.map((t) => t.label).join(",") === "NVDA,ASML,COST" && src.tickers[0].href === "/company/NVDA" && src.tickers[0].detail === "NVIDIA Corp · Held", hits("nvda"));
  check("the palette finds a rule by its words or its section and opens Methodology at it; anything else falls through to the Companies search", hits("3.1").includes("rule:position-cap") && hits("thesis").includes("rule:thesis") && src.rules[0].href === "/methodology?view=checks#rule-position-cap" && src.rules[1].detail === "§A.2 · Yours to check" && paletteResults("taiwan semi", src).at(-1)?.href === companiesSearchHref("taiwan semi") && companiesSearchHref("taiwan semi") === "/companies?q=taiwan%20semi");
  const pal = readFileSync("components/app/palette.tsx", "utf8");
  check("⌘K and Ctrl+K open the palette, the top bar and the phone's title bar each carry its button, and it sends nothing", /e\.metaKey \|\| e\.ctrlKey/.test(pal) && /ArrowDown/.test(pal) && /Escape/.test(pal) && !/fetch\(|sendBeacon|localStorage/.test(pal) && /<SearchButton \/>/.test(readFileSync("components/app/top-bar.tsx", "utf8")) && /<SearchButton compact \/>/.test(readFileSync("components/ui/page-header.tsx", "utf8")) && /<Palette /.test(readFileSync("components/app/app-shell.tsx", "utf8")));
}

{
  // The Dashboard as one ruled grid (Hamza, 21 Nov 2026): the positions as rows, the day and the gain as points of the book, the gap to the person's base, the movers and the allocation folded.
  const row = (symbol: string, value: number, last: number | null, dayPnl: number | null, unrealizedPnl: number | null) => ({ symbol, name: symbol, assetClass: "equity" as const, quantity: 1, last, currency: "USD", dayPct: dayPnl === null ? null : 1, ytdPct: null, sixMonthPct: null, sinceBoughtPct: 10, cost: null, value, avgPrice: null, dayPnl, unrealizedPnl, accounts: 1 });
  const p = { rows: [row("BBB", 300, 30, -6, 30), row("AAA", 600, 100, 12, -20), row("CCC", 100, null, null, null)], total: { value: 1000, cost: null, dayPnl: 6, unrealizedPnl: 10, cash: 0 } };
  const own = (base: number) => ({ low: null, base, high: null, asOf: "2026-11-01", basis: null });
  const rows = gridRows(p, { AAA: { classLabel: "Compounder", fields: { pfcf_ratio: 25, forward_pe: 30, consensus_forward_pe: 28, roic_pct: null }, own: own(120) }, BBB: { classLabel: null, fields: { pfcf_ratio: -4 }, own: null } });
  check("the grid's rows are the positions, largest first, each weight a share of net worth and the day and the gain points of the book", rows.map((r) => r.symbol).join(",") === "AAA,BBB,CCC" && rows[0].weight === 60 && rows[0].dayPts === 1.2 && rows[1].dayPts === -0.6 && rows[0].totalPts === -2 && rows[2].dayPts === null, rows.map((r) => `${r.symbol}:${r.weight}:${r.dayPts}`).join(" "));
  check("the move to the person's base is their own arithmetic on the price, null without a base or a price", rows[0].toFairPct === 20 && rows[0].toFairMoney === 120 && rows[1].toFairPct === null && rows[2].toFairPct === null);
  check("Fwd P/E reads the analysts' before the filings', FCF yield is the inverse of a positive P/FCF, and a figure not read is null, never zero", cellOf(rows[0], "fwd_pe") === 28 && cellOf(rows[0], "fcf_yield") === 4 && cellOf(rows[1], "fcf_yield") === null && cellOf(rows[0], "roic_pct") === null && cellOf(rows[2], "pe_ratio") === null);
  const mv = dayMovers(rows);
  check("contributors and detractors are the day's money each way, an unread day in neither", mv.up.map((r) => r.symbol).join() === "AAA" && mv.down.map((r) => r.symbol).join() === "BBB");
  const fair = gridFair(rows);
  check("the book against the person's bases counts only the holdings with one and says how much of the listed book that is", fair?.value === 600 && fair.fair === 720 && fair.toFairPct === 20 && fair.coveredPct === 60 && fair.count === 1 && gridFair(rows.slice(1)) === null);
  const slices = ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => ({ key: k, label: k, value: 14 - i, color: "x", group: "g" })).concat([{ key: "cash", label: "Cash", value: 5, color: "c", group: "Cash" }]);
  const fold = foldAllocation(slices, "o");
  check("the allocation names the five largest holdings, folds the rest into Other with its count and keeps cash apart", fold.slices.map((s) => s.label).join(",") === "A,B,C,D,E,Other (2),Cash" && fold.topShare === 60 && fold.count === 7 && fold.slices.find((s) => s.key === "other")?.value === 17, fold.slices.map((s) => `${s.label}:${s.value}`).join(" "));
  check("the grid has four tabs, each past Overview with six columns, and the Dashboard draws it as a slot", GRID_TABS.length === 4 && Object.values(GRID_COLUMNS).every((c) => c.length === 6) && SCREENS.today.slots.includes("portfolio_grid") && !!SLOTS.portfolio_grid);
  const pg = readFileSync("components/dashboard/portfolio-grid.tsx", "utf8");
  check("the grid is live from the Dashboard's own read, every chart has its table, and it sends or keeps nothing", /livePositions\(positions, quotes, at\)/.test(pg) && /<caption className="sr-only">Share of net worth/.test(pg) && !/fetch\(|usePoll|localStorage/.test(pg) && /grid=\{grid\}/.test(readFileSync("app/(app)/page.tsx", "utf8")));
}

if (failed) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\ncheck:screens ok (${passed} passed): the skeleton is one table, a slot is drawn only when the methodology asks, caps and signals come from the rules, the trade check runs every rule again, every ticker opens its company page, the devices turned on get one recap after each close with every amount masked, and a watcher or a screen in words is a test the app runs itself.`);
