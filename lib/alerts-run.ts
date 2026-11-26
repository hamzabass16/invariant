import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { calendarFoundSchema, foundEvents, FOUND_PREFIX } from "@/lib/calendar-agent";
import { econNotices } from "@/lib/econ-calendar";
import { licensedOnly } from "@/lib/licences";
import { econReachWords } from "@/lib/econ-exposure";
import { alertsEmail, alertsFileSchema, BROKER_PREFIX, CUSTOM_AGENT_PREFIX, levelNotices, markEmailed, reconcile, toEmail, VALUATION_LOW_PREFIX, valuationLowNotices, type AlertItem, type AlertsEmail, type AlertsFile } from "@/lib/alerts";
import { composeBook } from "@/lib/compose-book";
import { decisionsFileSchema } from "@/lib/decisions";
import { filingsFileSchema, type FilingsFile } from "@/lib/filings";
import { bookSchema } from "@/lib/holdings";
import { moveNotices, recapsFileSchema } from "@/lib/market-recap";
import { perPortfolio, portfoliosFileSchema } from "@/lib/portfolios";
import { EMPTY_CLOSES, EMPTY_MARKETS, type Closes, type Markets } from "@/lib/markets";
import { loadCloses, loadEarnings, loadExtended, loadMarkets } from "@/lib/markets-feed";
import { EARNINGS_PREFIX, earningsFileSchema, earningsNotices, earningsSubjects, entriesFor, REPORT_PREFIX, deckWaiting, reportKey, reportNotices, type EarningsFile, type EarningsReport } from "@/lib/earnings";

import { earningsDoc, earningsDocName } from "@/lib/earnings-doc";
import { earningsReportEmail, type SinceRelease } from "@/lib/earnings-email";
import { reviewedDoc } from "@/lib/doc-review";
import { renderReportDocPdf } from "@/lib/report-doc-pdf-run";
import { DEFAULT_PREFERENCES, EMPTY_RECORDS, preferencesSchema, recordsSchema } from "@/lib/preferences";
import { claimMail, enrolments, releaseMail, type ScheduledEnrolment } from "@/lib/registry";
import { mailProblem, sendAlerts, sendEarningsReport, type ReportFile } from "@/lib/report-mail";
import { researchFileSchema } from "@/lib/research";
import { deriveScreens } from "@/lib/screen-data";
import { shownWhen } from "@/lib/screens";
import { setupSchema } from "@/lib/setup";
import { brokersFileSchema, withBrokers } from "@/lib/brokers";
import { statementsFileSchema, withStatements } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { vaultForEnrolment, type Vault } from "@/lib/vault";
import { COMMUNITY_PREFIX } from "@/lib/community";
import { CLUB_WATCH_PREFIX } from "@/lib/clubs";
import { clubWatchAlerts } from "@/lib/clubs-run";
import { thesesFileSchema, thesisFor } from "@/lib/theses";
import { HISTORY_DAYS, historyMetricFor, valuationHistory } from "@/lib/valuation-history";
import { followedNotices } from "@/lib/community-run";
import { customAgentNotices, customAgentsFileSchema } from "@/lib/custom-agents";
import { MACRO_PREFIX, macroNotices, macroOfAlert, macroReportEmail, macroReportsFileSchema, type MacroReport } from "@/lib/macro-report";
import { enterZone } from "@/lib/zone";

/** The deployment's own address, for the links in an alert email: APP_URL when set, else the production address Vercel gives every deployment. */
export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : null;
}

export type AlertCheck = { fired: number; emailed: number; open: number; problem: string | null };

/**
 * One person's check: the same book and notices their screens derive (the
 * methodology's breaches, watches, clocks and dates, studies, filings), plus
 * the watchlist's levels against the latest closes from the market feed, and
 * each holding that moved 2% or more in the last recap's session, with the
 * reason Claude found, and each company on the Earnings calendar that reports
 * tomorrow or has a new report after its results, and each card they follow
 * on Community that changed its theses or weights (Hamza, 19 Oct 2026).
 * The alerts file is reconciled with them and kept; what fired today or
 * yesterday and was not yet emailed goes out in one email to the person's
 * own address. Mail that cannot go keeps the alerts unemailed, so the next
 * check tries again, and says so on Notifications. Read-only everywhere but
 * the vault; the log gets counts, never a symbol or an address.
 */
export async function checkAlerts(vault: Vault, email: string | null, now: Date = new Date()): Promise<AlertCheck> {
  const setup = await vault.readJson("setup", setupSchema);
  if (!setup) throw new SyncError("Finish Setup before alerts can be checked.", "no setup in vault");
  const today = localDay(now);
  const nowIso = now.toISOString();
  const feed = loadMarkets(today).catch((): Markets => ({ ...EMPTY_MARKETS, problems: ["The market feed could not be read."] }));
  const [fileBook, preferences, records, decisions, filings, statements, research, recaps, prev, portfolios, brokers] = await Promise.all([
    vault.readJson("book", bookSchema),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
    vault.readJson("records", recordsSchema).catch(() => null),
    vault.readJson("decisions", decisionsFileSchema).catch(() => null),
    vault.readJson("filings", filingsFileSchema).catch(() => null),
    vault.readJson("statements", statementsFileSchema).catch(() => null),
    vault.readJson("research", researchFileSchema).catch(() => null),
    vault.readJson("recaps", recapsFileSchema).catch(() => null),
    vault.readJson("alerts", alertsFileSchema),
    vault.readJson("portfolios", portfoliosFileSchema).catch(() => null),
    vault.readJson("brokers", brokersFileSchema).catch(() => null),
  ]);
  // Whether the person's model reads the call and writes the study, which the earnings deck then waits for (deckReadiness).
  const writes = !!(await providerFor(vault)) && !!preferences?.edgarContact;
  const rawBook = withBrokers(withStatements(fileBook, statements, setup.baseCurrency, today).book, brokers, setup.baseCurrency, today).book;
  if (!rawBook) throw new SyncError("No figures have arrived yet, so there is nothing to check.", "no book in vault");
  const book = composeBook(rawBook, { records: records ?? EMPTY_RECORDS, filings, research, markets: await feed, methodology: setup.methodology })!;
  // One methodology per portfolio: the whole book is read with none, and each portfolio's own rules add their notices under its name.
  const each = portfolios?.mode === "each" ? portfolios : null;
  const m = each ? null : setup.methodology;
  const derive = (b: typeof book, mm: typeof m) => deriveScreens({ book: b, methodology: mm, inputs: setup.inputs, shown: shownWhen(mm, b, records, decisions, preferences?.practices ?? []), filings, decisions, preferences: preferences ?? DEFAULT_PREFERENCES, research, statements, now: nowIso }, today);
  const data = derive(book, m);
  const whole = new Set(data.notices.map((n) => n.key));
  const own = each ? perPortfolio(each, null, book).filter((p) => p.methodology).flatMap((p) => derive(p.book, p.methodology).notices.filter((n) => !whole.has(n.key)).map((n) => ({ ...n, key: `${p.portfolio.id}|${n.key}`, title: `${p.portfolio.name}: ${n.title}` }))) : [];

  // Prices for the levels: a held symbol's own price, a watched one's latest close from the feed.
  const bySymbol = records?.bySymbol ?? {};
  const held = new Set(book.holdings.map((h) => h.symbol.toUpperCase()));
  const prices: Record<string, number | null> = {};
  for (const h of book.holdings) if (h.price !== null) prices[h.symbol.toUpperCase()] = h.price;
  const watched = Object.entries(bySymbol)
    .filter(([s, r]) => !held.has(s.toUpperCase()) && (r.levels || r.ownValuation?.low != null))
    .map(([s]) => s.toUpperCase());
  let closes: Closes = EMPTY_CLOSES;
  if (watched.length) closes = await loadCloses(watched.sort().join(","), today, "full").catch((): Closes => ({ ...EMPTY_CLOSES, problems: ["The price feed could not be read."] }));
  for (const s of watched) {
    const points = closes.series[s];
    prices[s] = points?.length ? points[points.length - 1].value : null;
  }
  // A watched symbol the feed could not price keeps its alerts as they were: no price is not a cleared level.
  const unpriced = watched.filter((s) => prices[s] === null);
  const levels = levelNotices(bySymbol, held, prices, today);
  // Near a five-year low on the metric each thesis's valuation chose: the holdings and the watchlist whose filings kept the quarterly figures; a company whose closes could not be read keeps its alert as it was.
  const lows = await valuationLows(vault, filings, [...held, ...Object.keys(bySymbol).map((s) => s.toUpperCase())], held, today);
  // Reports tomorrow and the reports after the results; a calendar that could not be read keeps their alerts as they were.
  // Where no calendar may be read (SOURCES=licensed), no date ahead is known, so there is no alert the day before; the reports after the results still are.
  const licensed = licensedOnly();
  const [{ calendar }, kept] = await Promise.all([licensed ? Promise.resolve({ calendar: null }) : loadEarnings(today, "full"), vault.readJson("earnings", earningsFileSchema).catch(() => null)]);
  const entries = entriesFor(calendar, earningsSubjects(book, bySymbol, preferences?.earnings ?? []));
  const earnings = calendar ? [...earningsNotices(entries, today), ...reportNotices(kept, today)] : licensed ? reportNotices(kept, today) : [];
  // The cards the person follows; a registry that cannot be read keeps their alerts as they were.
  const community = await followedNotices(preferences?.following ?? [], today);
  // The levels the person's clubs watch (Hamza, 9 Nov 2026); a registry that cannot be read keeps their alerts as they were.
  const clubWatch = await clubWatchAlerts(email, today);
  // The Thesis Hunter's finds are no alerts: the weekly and monthly review carry them (Hamza, 5 Nov 2026).
  // The days of what the Calendar agent found, with their reach in the book (Hamza, 27 Oct 2026).
  const foundList = foundEvents(await vault.readJson("calendar_events", calendarFoundSchema).catch(() => null));
  const found = econNotices(today, foundList, econReachWords(today, book, m, foundList), FOUND_PREFIX);
  // The reports after each macro event (Hamza, 27 Oct 2026); a file that cannot be read keeps their alerts as they were.
  const macro = await vault.readJson("macro_reports", macroReportsFileSchema).catch(() => undefined);
  // What the agents the person built found (Hamza, 4 Nov 2026); a file that cannot be read keeps their alerts as they were.
  const custom = await vault.readJson("custom_agents", customAgentsFileSchema).catch(() => undefined);
  const { file: reconciled, fired } = reconcile(prev, [...data.notices, ...own, ...levels, ...moveNotices(recaps, preferences?.moveAlertPct), ...earnings, ...(community ?? []), ...(clubWatch ?? []), ...lows.notices, ...found, ...macroNotices(macro ?? null, today), ...customAgentNotices(custom ?? null, today)], nowIso, [BROKER_PREFIX, ...(calendar ? [] : licensed ? [EARNINGS_PREFIX] : [EARNINGS_PREFIX, REPORT_PREFIX]), ...(community ? [] : [COMMUNITY_PREFIX]), ...(clubWatch ? [] : [CLUB_WATCH_PREFIX]), ...(macro === undefined ? [MACRO_PREFIX] : []), ...(custom === undefined ? [CUSTOM_AGENT_PREFIX] : [])]);
  const keep = (key: string) => unpriced.some((s) => key.startsWith(`watch:${s}:`)) || lows.unread.some((s) => key.startsWith(`${VALUATION_LOW_PREFIX}${s}:`));
  let file: AlertsFile = unpriced.length || lows.unread.length ? { ...reconciled, items: reconciled.items.map((i) => (i.clearedAt === nowIso && keep(i.key) ? { ...i, clearedAt: null } : i)) } : reconciled;

  const send = toEmail(file, nowIso);
  let emailed = 0;
  let problem: string | null = null;
  if (send.length) {
    const cannot = email ? mailProblem() : "No address to send to.";
    if (cannot) problem = email ? "This deployment cannot send email yet, so alerts are only on Notifications." : cannot;
    else {
      // Each alert is claimed in the registry before the send, so a check running beside this one on another instance sends nothing twice.
      let mine: string[] = [];
      try {
        const won = new Set(await claimMail(email!, send.map((i) => i.id)));
        const ours = send.filter((i) => won.has(i.id));
        mine = ours.map((i) => i.id);
        // What another check claimed is its to send; it is marked here too, so this file does not offer it again.
        file = markEmailed(file, send.filter((i) => !won.has(i.id)).map((i) => i.id), nowIso);
        // A report after a company's results goes as its own email, with its decks; the rest as one digest (Hamza, 23 Oct 2026).
        const reports = ours.map((i) => ({ item: i, report: reportOfAlert(kept, i.key) })).filter((x): x is { item: AlertItem; report: EarningsReport } => x.report !== null);
        // A report after a macro event goes the same way, as its own email with the moves first; no deck (Hamza, 29 Oct 2026).
        const events = ours.map((i) => ({ item: i, report: macroOfAlert(macro ?? null, i.key) })).filter((x): x is { item: AlertItem; report: MacroReport } => x.report !== null);
        const digest = ours.filter((i) => !reports.some((x) => x.item === i) && !events.some((x) => x.item === i));
        for (const { item, report } of reports) {
          await sendEarningsReport(email!, ...(await reportMail(report, setup.methodology?.name ?? null, item.key.endsWith(":deck"), writes, today)));
          file = markEmailed(file, [item.id], nowIso);
          emailed += 1;
        }
        for (const { item, report } of events) {
          await sendEarningsReport(email!, ...(await macroMail(report)));
          file = markEmailed(file, [item.id], nowIso);
          emailed += 1;
        }
        if (digest.length) {
          await sendAlerts(email!, alertsEmail(digest, appUrl(), nowIso));
          file = markEmailed(file, digest.map((i) => i.id), nowIso);
          emailed += digest.length;
        }
      } catch (e) {
        // What was claimed and not sent is given back, so the next check sends it, whatever stopped this one; what was sent keeps its claim.
        const sent = new Set(file.items.filter((i) => i.emailedAt === nowIso).map((i) => i.id));
        await releaseMail(email!, mine.filter((id) => !sent.has(id))).catch(() => undefined);
        if (!(e instanceof SyncError)) throw e;
        console.error(`[alerts] mail: ${e.logDetail ?? "failed"}`);
        problem = e.message;
      }
    }
  }
  file = { ...file, checkedAt: nowIso, emailProblem: problem, updated: nowIso };
  await vault.writeJson("alerts", alertsFileSchema.parse(file));
  return { fired: fired.length, emailed, open: file.items.filter((i) => i.clearedAt === null && i.dismissedAt === null).length, problem };
}

/** The kept report an alert keyed `earnings-report:<report key>:<stage>` stands for; null for any other alert. */
function reportOfAlert(kept: EarningsFile | null, key: string): EarningsReport | null {
  if (!key.startsWith(REPORT_PREFIX)) return null;
  const k = key.slice(REPORT_PREFIX.length).replace(/:(release|figures|deck)$/, "");
  return kept?.reports.find((r) => reportKey(r) === k) ?? null;
}

/**
 * The report's email, made from the kept report. Before the earnings report
 * is whole (the figures, the call, the study, read through by the reviewer)
 * nothing is sent from 4 Nov 2026 on (`emailWorthy`); once it is, one email
 * carries the summary, the report as a PDF and the stock's move since the
 * results at the moment it is sent (Hamza, 4 Nov 2026). A PDF that cannot be
 * made is left out and the email says so.
 */
async function reportMail(r: EarningsReport, methodology: string | null, deck: boolean, writes: boolean, today: string): Promise<[AlertsEmail, ReportFile[]]> {
  if (!deck) return [earningsReportEmail(r, appUrl(), [], { waiting: deckWaiting(r, writes, today) }), []];
  const files: ReportFile[] = [];
  try {
    files.push({ name: `${earningsDocName(r)}.pdf`, bytes: await renderReportDocPdf(reviewedDoc(earningsDoc(r, methodology), r.doc?.drop ?? [])), type: "application/pdf" });
  } catch {
    console.error("[alerts] a report's PDF could not be made for its email");
  }
  const since = await sinceRelease(r).catch(() => null);
  return [earningsReportEmail(r, appUrl(), files.map((f) => f.name), { deck: true, since }), files];
}

/** The stock's move since its results came out, read now, with SPY's over the same time when the release's time is known. */
async function sinceRelease(r: EarningsReport): Promise<SinceRelease | null> {
  const accepted = r.release?.accepted ?? null;
  const before = r.reaction ? { price: r.reaction.from.close, date: r.reaction.from.date } : null;
  const asks = [{ symbol: r.symbol, accepted, before }, ...(accepted && r.symbol !== "SPY" ? [{ symbol: "SPY", accepted, before: null }] : [])];
  const a = await loadExtended([], asks);
  const own = a.since.find((x) => x.symbol === r.symbol);
  if (!own) return null;
  const spy = a.since.find((x) => x.symbol === "SPY" && x.base.basis === own.base.basis);
  const at = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(own.now.at * 1000));
  return { pct: own.pct, basis: own.base.basis, session: own.now.session, at, benchmarkPct: spy && own.base.basis === "release" ? spy.pct : null };
}

/** A macro event's report as its email: the summary alone, no attachment. */
async function macroMail(r: MacroReport): Promise<[AlertsEmail, ReportFile[]]> {
  return [macroReportEmail(r, appUrl()), []];
}

/** The five-year valuation lows of the symbols given that have per-share history, and those whose closes could not be read. */
async function valuationLows(vault: Vault, filings: FilingsFile | null, symbols: readonly string[], held: ReadonlySet<string>, today: string): Promise<{ notices: ReturnType<typeof valuationLowNotices>; unread: string[] }> {
  const subjects = [...new Set(symbols)].filter((s) => filings?.bySymbol[s]?.perShareTtm?.length);
  if (!subjects.length) return { notices: [], unread: [] };
  const theses = await vault.readJson("theses", thesesFileSchema).catch(() => null);
  const closes = await loadCloses(subjects.sort().join(","), today, "full", HISTORY_DAYS).catch((): Closes => ({ ...EMPTY_CLOSES, problems: ["The price feed could not be read."] }));
  const unread = subjects.filter((s) => !closes.series[s]?.length);
  const read = subjects
    .filter((s) => closes.series[s]?.length)
    .flatMap((s) => {
      const method = thesisFor(theses, s)?.valuation?.method ?? null;
      const metric = historyMetricFor(method);
      const rows = filings!.bySymbol[s].perShareTtm!;
      const chosen = { symbol: s, held: held.has(s), chosen: method !== null, history: valuationHistory(metric, closes.series[s], rows, today) };
      // The forward P/E from the filings is watched beside the method chosen (Hamza, 23 Oct 2026).
      return metric === "forward_pe" ? [chosen] : [chosen, { symbol: s, held: held.has(s), chosen: false, beside: true, history: valuationHistory("forward_pe", closes.series[s], rows, today) }];
    });
  return { notices: valuationLowNotices(read, today), unread };
}

export type AlertRunSummary = { checked: number; fired: number; emailed: number; failed: string[] };

/**
 * The cron's pass at 06:00 and 18:00 UTC: every enrolment (anyone with a
 * report schedule, or none, for the morning refresh) is checked and emailed.
 * One that fails is a sentence and never stops the others.
 */
export async function runAlertChecks(now: Date = new Date(), macro = false): Promise<AlertRunSummary> {
  const { rows, unreadable } = await enrolments();
  const summary: AlertRunSummary = { checked: 0, fired: 0, emailed: 0, failed: [] };
  if (unreadable) summary.failed.push(`${unreadable} stored enrolment${unreadable > 1 ? "s" : ""} could not be read.`);
  for (const e of rows) {
    enterZone(e.schedule.zone);
    try {
      const r = await alertsFor(e, now, macro);
      summary.checked += 1;
      summary.fired += r.fired;
      summary.emailed += r.emailed;
      if (r.problem) summary.failed.push(r.problem);
    } catch (err) {
      console.error(`[alerts] one enrolment failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
      summary.failed.push(err instanceof SyncError ? err.message : "An alert check could not run.");
    }
  }
  console.info(`[alerts] checked ${summary.checked}, fired ${summary.fired}, emailed ${summary.emailed}, failed ${summary.failed.length}`);
  return summary;
}

/** One enrolment's alert check and email; with `macro`, an event whose outcome was not out yet is read again first (Hamza, 28 Oct 2026). */
export async function alertsFor(e: ScheduledEnrolment, now: Date, macro = false): Promise<AlertCheck> {
  const vault = await vaultForEnrolment(e);
  if (macro) await readPendingMacro(vault, now);
  return checkAlerts(vault, e.email, now);
}

async function readPendingMacro(vault: Vault, now: Date): Promise<void> {
  try {
    const { readMacroReportsInto } = await import("@/lib/macro-report-run");
    await readMacroReportsInto(vault, now);
  } catch (err) {
    console.error(`[alerts] event reports: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
  }
}
