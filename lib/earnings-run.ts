import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { brokersFileSchema, withBrokers } from "@/lib/brokers";
import { composeBook } from "@/lib/compose-book";
import { unstable_cache } from "next/cache";
import { companyFacts, companySubmissions, filingLink, lookupCompany, operatorContact, releaseDocuments, segmentLines } from "@/lib/edgar";
import { licensedOnly } from "@/lib/licences";
import { releaseDays, type ReleaseDay } from "@/lib/reaction-history";
import { fundamentalsOf, latestBalance, ttmPerShareHistory, type FactsTable } from "@/lib/edgar-facts";
import { engineOf, withEngine, type SegmentRead } from "@/lib/edgar-segments";
import { buildDetail, COMMENTARY_MODEL, POST_FROM, PRE_FROM, upcomingOf, buildReport, deckReadiness, candidateReleases, checkReleaseRead, EARLIER_RELEASES_PER_RUN, EARNINGS_MODEL, earningsFileSchema, earningsSubjects, EMPTY_EARNINGS, entriesFor, filingsAround, keepReport, looksLikeResults, missingQuarters, parseCommentaryResponse, parseReleaseResponse, commentaryRequestBody, contentDue, parseReactionResponse, reactionDue, reactionMove, reactionRequestBody, REACTION_BENCHMARK, releaseCoverage, releaseQuarterKey, releaseRequestBody, releaseText, reportDue, reported, reportKey, sameReport, secCalendar, secResultsDue, symbolKey, MAX_FOLLOWED, EARNINGS_BACK_DAYS, type EarningsEntry, type EarningsFile, type EarningsReport, type FiledAround, type FilingRef, type ReleaseFigures } from "@/lib/earnings";
import { withBriefs, withCalls, withFlowNotes } from "@/lib/earnings-call-run";
import { decksBy } from "@/lib/earnings-deck";
import { earningsDoc } from "@/lib/earnings-doc";
import { docReviewRequestBody, docSig, parseDocReview, REVIEW_MODEL, reviewVerdict, type ReviewNote } from "@/lib/doc-review";
import { checkDoc } from "@/lib/report-doc";
import { filingsFileSchema, type FilingsFile } from "@/lib/filings";
import { bookSchema, type Book } from "@/lib/holdings";
import { newYorkClock } from "@/lib/market-day";
import { peerComparison } from "@/lib/peers";
import { screenerFileSchema, type ScreenerFile } from "@/lib/screener";
import { historyMetricFor, valuationHistory, type HistoryMetric } from "@/lib/valuation-history";
import { EMPTY_MARKETS } from "@/lib/markets";
import { listingRate, loadCloses, loadEarnings, loadExpectedMove } from "@/lib/markets-feed";
import { EXPECTED_DAYS, EXPECTED_FRESH_HOURS, EXPECTED_PER_RUN, expectedFor, keepExpected, stillBefore, type ExpectedMove } from "@/lib/expected-move";
import type { Methodology } from "@/lib/methodology";
import { callChecked, callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { evalCtx, ownerValueOf } from "@/lib/ontology";
import { readerSignals } from "@/lib/improvements";
import { DEFAULT_PREFERENCES, EMPTY_RECORDS, preferencesSchema, recordsSchema, type EdgarContact } from "@/lib/preferences";
import { classifier } from "@/lib/recipes";
import { checkCompany, familyOf, researchFileSchema, subjectBook, type Study } from "@/lib/research";
import { benchmarksOf, capOf, capsFor } from "@/lib/screens";
import { setupSchema } from "@/lib/setup";
import { statementsFileSchema, withStatements } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { addedReads, addedSince, thesesFileSchema, thesisDetail, thesisFor, withThesisReads, type ThesesFile } from "@/lib/theses";
import { addDays } from "@/lib/performance";
import { localDay, daysBetween } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/** Companies read in one run, so a long season never holds the morning refresh; the rest are read on the next. */
const PER_RUN = 10;

export type EarningsRun = { read: number; written: number; failed: number; sentence: string };

/**
 * The reports after the results, for one person: each company on their
 * calendar that has reported in the last weeks and has no complete report
 * yet. What the company filed is read from SEC EDGAR with the contact they
 * confirmed (the CIK alone in the URL); the figures from its XBRL facts; the
 * class test and the rules from their methodology; the triggers and the
 * valuation from their records. Before the quarterly filing (always, for a
 * 6-K filer) the quarter's figures are read from the release itself on the
 * person's own provider and checked against its text (lib/earnings.ts). On
 * a Claude key, their Claude reads the release and the call (a few web
 * searches, every point with its page).
 * Run by the evening read (a report the same day) and the morning refresh
 * (the 10-Q that came later), before the filings are read again, so the
 * class before the results is the one the last figures gave. Null when
 * nothing is due. The log gets counts, never a symbol.
 */
export async function readEarningsInto(vault: Vault, now: Date = new Date()): Promise<EarningsRun | null> {
  const [setup, fileBook, records, preferences, statements, brokers, filings, prev, hostedAi, research, theses, screener] = await Promise.all([
    vault.readJson("setup", setupSchema).catch(() => null),
    vault.readJson("book", bookSchema).catch(() => null),
    vault.readJson("records", recordsSchema).catch(() => null),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
    vault.readJson("statements", statementsFileSchema).catch(() => null),
    vault.readJson("brokers", brokersFileSchema).catch(() => null),
    vault.readJson("filings", filingsFileSchema).catch(() => null),
    vault.readJson("earnings", earningsFileSchema).catch(() => null),
    providerFor(vault),
    vault.readJson("research", researchFileSchema).catch(() => null),
    vault.readJson("theses", thesesFileSchema).catch(() => null),
    vault.readJson("screener", screenerFileSchema).catch(() => null),
  ]);
  const prefs = preferences ?? DEFAULT_PREFERENCES;
  const recs = records ?? EMPTY_RECORDS;
  const today = localDay(now);
  const base = setup?.baseCurrency ?? "USD";
  const raw = withBrokers(withStatements(fileBook, statements, base, today).book, brokers, base, today).book;
  const m = setup?.methodology ?? null;
  const book = composeBook(raw, { records: recs, filings, research: null, markets: EMPTY_MARKETS, methodology: m });

  const subjects = earningsSubjects(book, recs.bySymbol, prefs.earnings);
  if (!subjects.length) return null;
  const ny = newYorkClock(now);
  // Where no calendar may be read (SOURCES=licensed), the results the companies have filed with the SEC are the calendar.
  const licensed = licensedOnly();
  const calendar = licensed ? await secResultsCalendar(subjects.map((s) => s.symbol), operatorContact() ?? prefs.edgarContact, today, now) : (await loadEarnings(today, "full")).calendar;
  const followed = licensed ? subjects.map((s) => s.symbol.toUpperCase()).slice(0, MAX_FOLLOWED) : undefined;
  const followedChanged = licensed && JSON.stringify(prev?.followed ?? []) !== JSON.stringify(followed);
  const kept = new Map((prev?.reports ?? []).map((r) => [reportKey(r), r]));
  const entries = entriesFor(calendar, subjects);
  // Before each report, the move the options price for it, read again until the session that trades on the results opens (Hamza, 21 Oct 2026).
  const expected = await readExpected(entries, prev?.expected ?? [], ny, today, now);
  // The followed dates, kept for the results watch (Hamza, 4 Nov 2026: a report emailed as soon as it is out, the app closed).
  const upcoming = upcomingOf(entries, ny.date);
  const upcomingChanged = JSON.stringify(prev?.upcoming ?? []) !== JSON.stringify(upcoming) || followedChanged;
  const due = reported(entries, ny.date)
    .filter((e) => e.date < ny.date || ny.minutes >= (e.time === "post" ? POST_FROM : PRE_FROM))
    .filter((e) => reportDue(kept.get(reportKey(e)) ?? null, ny.date, now.toISOString()))
    .slice(0, PER_RUN);
  if (!due.length) {
    // Nothing new to read; what was added to a thesis since its results is laid on the report, a report whose deck is not kept yet (or is older than its reads) still gets one, and a new reading of the options is kept.
    const withMoves = prev && (expected.changed || upcomingChanged) ? { ...prev, expected: expected.list, upcoming, followed } : prev;
    const reads = withMoves ? withThesisReads(withMoves, theses, today) : null;
    // The call and the deck's words are laid on the recent reports, each read at most once a run on the person's model.
    const provider = hostedAi;
    const calls = reads ? await withCalls(reads.file, theses, provider, entries, today, now, prefs.edgarContact) : null;
    const noted = calls ? await withFlowNotes(calls.file, provider, today, now, prefs.edgarContact) : null;
    const briefs = noted ? await withBriefs(noted.file, research?.studies ?? [], theses, provider, today, now) : null;
    const moved = (reads?.changed ?? 0) + (calls?.changed ?? 0) + (noted?.changed ?? 0) + (briefs?.changed ?? 0);
    const decked = briefs ? await withDecks(briefs.file, m?.name ?? null, now, provider, !!provider && !!prefs.edgarContact, { email: vault.owner, prefs }) : null;
    if (decked) await vault.writeJson("earnings", earningsFileSchema.parse(decked));
    else if (moved && briefs) await vault.writeJson("earnings", earningsFileSchema.parse({ ...briefs.file, updated: now.toISOString() }));
    else if (expected.changed || upcomingChanged) await vault.writeJson("earnings", earningsFileSchema.parse({ ...(prev ?? EMPTY_EARNINGS), expected: expected.list, upcoming, followed, updated: now.toISOString() }));
    return null;
  }

  const contact = prefs.edgarContact;
  const provider = hostedAi;
  let file: EarningsFile = { ...(prev ?? EMPTY_EARNINGS), expected: expected.list, upcoming, followed };
  let written = 0;
  let failed = 0;
  for (const e of due) {
    const before = kept.get(reportKey(e)) ?? null;
    let report: EarningsReport;
    // A report whose filings are all in and owes only its reaction is not read from the SEC again.
    if (before && !contentDue(before, ny.date, now.toISOString())) report = before;
    else {
      try {
        report = await reportFor(e, before, { contact, m, book, filings, studies: research?.studies ?? [], theses, kept: prev?.reports ?? [], provider, today, now, screener });
      } catch (err) {
        if (!(err instanceof SyncError)) throw err;
        console.error(`[earnings] one company: ${err.logDetail ?? "failed"}`);
        // A refusal or an unreachable SEC is tried again next run; the last report stays.
        failed += 1;
        continue;
      }
      if (report.status !== "waiting" && !report.commentary) report = await withCommentary(report, before, provider);
    }
    report = await withReaction(report, provider, now);
    if (!report.expectedMove) report = { ...report, expectedMove: expectedFor(expected.list, e.symbol, e.date) };
    // A release read again before its filing lands says the same thing: it keeps its date and its deck, so neither is remade every day.
    if (before && sameReport(before, report)) report = { ...report, updatedAt: before.updatedAt, deck: before.deck, doc: before.doc };
    if (report.status === "release" || report.status === "complete") written += 1;
    file = keepReport(file, report, now.toISOString());
  }
  file = withThesisReads(file, theses, today).file;
  file = (await withCalls(file, theses, provider, entries, today, now, contact)).file;
  file = (await withFlowNotes(file, provider, today, now, contact)).file;
  file = (await withBriefs(file, research?.studies ?? [], theses, provider, today, now)).file;
  file = (await withDecks(file, m?.name ?? null, now, provider, !!provider && !!contact, { email: vault.owner, prefs })) ?? file;
  await vault.writeJson("earnings", earningsFileSchema.parse(file));
  console.info(`[earnings] read ${due.length}, written ${written}, failed ${failed}`);
  const sentence = `Results read for ${due.length} compan${due.length === 1 ? "y" : "ies"}: ${written} report${written === 1 ? "" : "s"} written${failed ? `, ${failed} could not be read and ${failed === 1 ? "is" : "are"} tried again next time` : ""}.`;
  return { read: due.length, written, failed, sentence };
}

/**
 * The moves the options price for the reports in the next EXPECTED_DAYS,
 * each read again when its reading is older than EXPECTED_FRESH_HOURS and
 * the session that trades on the results has not opened; a chain that cannot
 * be read keeps the reading before.
 */
async function readExpected(entries: readonly EarningsEntry[], list: ExpectedMove[], ny: { date: string; minutes: number }, today: string, now: Date): Promise<{ list: ExpectedMove[]; changed: boolean }> {
  const ahead = entries.filter((e) => e.date >= ny.date && daysBetween(ny.date, e.date) <= EXPECTED_DAYS && stillBefore(e.date, e.time, ny));
  let out = list;
  let changed = false;
  let asked = 0;
  for (const e of ahead) {
    if (asked >= EXPECTED_PER_RUN) break;
    const k = expectedFor(out, e.symbol, e.date);
    if (k && now.getTime() - Date.parse(k.readAt) < EXPECTED_FRESH_HOURS * 3_600_000) continue;
    asked += 1;
    const got = await loadExpectedMove(e.symbol, e.date, e.time, now);
    if (got.move) {
      out = keepExpected(out, got.move, today);
      changed = true;
    }
  }
  if (asked) console.info(`[earnings] options read for ${asked}`);
  return { list: out, changed };
}

/** Companies whose decks are kept in one run, so a first run over many companies never holds a page or a cron for long. */
const DECKS_PER_RUN = 3;

/**
 * Makes each company's latest earnings report whole before it is sent
 * (Hamza, 4 Nov 2026): once the figures, the call, the study and its words
 * are in (deckReadiness), the report is drawn as a document from the kept
 * report alone (lib/earnings-doc.ts), the app's own check reads it, and the
 * reviewer reads it as its reader would (lib/doc-review.ts, on the fast
 * model): the lines it says to drop are taken out, and a page it says is
 * missing what it promises holds it until a later read mends it, or until
 * the wait is over. Only a report whose words changed is read again. The
 * document is drawn on request from the report; nothing is kept but the
 * verdict. Null when nothing changed.
 */
type Who = { email: string | null | undefined; prefs: { improve?: boolean } | null };

async function withDecks(file: EarningsFile, methodology: string | null, now: Date, provider: ModelProvider | null, writes: boolean, who: Who): Promise<EarningsFile | null> {
  const { latest } = decksBy(file);
  const today = localDay(now);
  const due = latest
    .map((r) => ({ r, readiness: deckReadiness(r, writes, today) }))
    .filter(({ r, readiness }) => readiness.ready && (!r.doc || r.doc.sig !== docSig(earningsDoc(r, methodology)) || (!r.doc.ready && readiness.late)))
    .sort((a, b) => (a.r.doc?.at ?? "").localeCompare(b.r.doc?.at ?? ""))
    .slice(0, DECKS_PER_RUN);
  if (!due.length) return null;
  let reports = file.reports;
  for (const { r, readiness } of due) {
    const doc = earningsDoc(r, methodology);
    let notes: ReviewNote[] = [];
    if (provider) {
      try {
        notes = parseDocReview(await callModel(provider, docReviewRequestBody(doc, checkDoc(doc), modelFor(provider, REVIEW_MODEL)) as ModelRequest, { agent: "earnings_reaction", step: "review", subject: r.symbol }), doc) ?? [];
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        // The reviewer could not be asked (off, at its ceiling, the cap): the app's own check stands alone.
        console.error(`[earnings] review: ${e.logDetail ?? "not asked"}`);
      }
    }
    const v = reviewVerdict(doc, notes, readiness.late);
    const state = { at: now.toISOString(), sig: docSig(doc), ready: v.ready, drop: v.drop.slice(0, 40), held: v.held.slice(0, 40) };
    reports = reports.map((x) => (reportKey(x) === reportKey(r) ? { ...x, doc: state } : x));
  }
  console.info(`[earnings] reports read through ${due.length}`);
  // What the filings carry under a concept the reader does not read yet is counted for everyone, so the reader is taught it (Hamza, 4 Nov 2026).
  if (who.email) {
    const signals = readerSignals(due.flatMap(({ r }) => r.detail?.fundamentalsNotes ?? []));
    if (signals.length) {
      const { recordSignals } = await import("@/lib/improvements-run");
      await recordSignals(who.email, who.prefs, process.env.STORAGE === "demo", signals, now);
    }
  }
  return { ...file, reports };
}

/** The reports whose study or reads moved on since they were read through, read again; null when none was. */
export async function keepDecksInto(vault: Vault, file: EarningsFile, methodology: string | null, now: Date, writes = true): Promise<EarningsFile | null> {
  const [provider, prefs] = await Promise.all([writes ? providerFor(vault).catch(() => null) : null, vault.readJson("preferences", preferencesSchema).catch(() => null)]);
  return withDecks(file, methodology, now, provider, writes, { email: vault.owner, prefs });
}

type Context = { contact: EdgarContact | null; m: Methodology | null; book: Book | null; filings: FilingsFile | null; studies: readonly Study[]; theses: ThesesFile | null; kept: readonly EarningsReport[]; provider: ModelProvider | null; today: string; now: Date; screener?: ScreenerFile | null };

/** Daily closes the deep dive reads: five years, so the valuation history has each year's close. */
const DEEP_DIVE_DAYS = 1900;

async function reportFor(e: EarningsEntry, prev: EarningsReport | null, c: Context): Promise<EarningsReport> {
  const nowIso = c.now.toISOString();
  const h = c.book?.holdings.find((x) => symbolKey(x.symbol) === symbolKey(e.symbol)) ?? null;
  const record = h?.record ?? null;
  const held = h?.price ?? null;
  const total = c.book ? c.book.holdings.reduce((s, x) => s + ownerValueOf(x, c.book!), 0) : 0;
  const mine = c.book && h ? c.book.holdings.filter((x) => symbolKey(x.symbol) === symbolKey(e.symbol)).reduce((s, x) => s + ownerValueOf(x, c.book!), 0) : 0;
  const weight = total > 0 && mine ? Math.round((mine / total) * 10000) / 100 : null;
  // The class the last figures gave, read once, before the new ones arrive.
  let classBefore = prev?.classBefore ?? null;
  if (!prev && h && c.m && c.book) {
    const classOf = classifier(c.m.classes, evalCtx(c.book, c.today));
    const id = classOf(h);
    classBefore = id ? (c.m.classes.find((k) => k.id === id)?.label ?? id) : null;
  }
  const base = { entry: e, record, price: held, weight, prev, now: nowIso, classBefore, verdict: null, table: null as FactsTable | null, readings: { price: held } as Record<string, number | null>, detail: null };
  if (!c.contact) return buildReport({ ...base, status: "waiting", sentence: "Results are read from SEC filings only once you confirm the contact the SEC will see, on the Research screen.", release: null, filing: null });

  const found = await lookupCompany(e.symbol, c.contact);
  if (!found) return buildReport({ ...base, status: "failed", sentence: "The SEC lists no company under this symbol, so its filings cannot be read here.", release: null, filing: null });
  let around: FiledAround;
  const subs = await companySubmissions(found.cik, c.contact);
  try {
    around = filingsAround(subs, found.cik, e.date, filingLink);
  } catch (err) {
    if (err instanceof SyncError) throw err;
    throw new SyncError("SEC EDGAR's filing list could not be read.", "edgar submissions shape");
  }
  // A 6-K is the release only once its text reads as the quarter's results: a foreign filer files buybacks, dividends and AGM notices on 6-K too.
  const pick = around.release?.form === "6-K" ? await resultsSixK(found.cik, around, e, prev, c) : null;
  if (pick) around = { ...around, release: pick.release };
  if (!around.filing && !around.release) return buildReport({ ...base, status: "waiting", sentence: pick?.sentence ?? null, release: null, filing: null, earlierTried: pick?.tried });
  // The results are out. Before the quarterly filing the figures below are the last ones filed, and the deck is the whole deep dive
  // on them, never a skeleton (Hamza, 16 Oct 2026); the quarter's own lines and the re-test follow the 10-Q (the 20-F for a 6-K filer).
  const status = around.filing ? "complete" : "release";
  // The quarter's own figures from the release, read once per release and kept: before the 10-Q lands, and always for a 6-K filer, whose 20-F carries no quarters.
  let releaseFigures: ReleaseFigures | null = prev && around.release && prev.release?.url === around.release.url ? (prev.releaseFigures ?? null) : null;
  let releaseNote: string | null = releaseFigures ? null : (prev?.releaseNote ?? null);
  if (around.release && !releaseFigures && (status === "release" || around.foreign)) {
    const read = await readReleaseFigures(found.cik, around.release, e, c, pick?.docs ?? null);
    releaseFigures = read.figures;
    releaseNote = read.note;
  }
  // A 6-K filer's earlier quarters: the results 6-Ks before this one, read the same way, a few per run, until the series reaches eight quarters.
  const lineage = c.kept.filter((r) => symbolKey(r.symbol) === symbolKey(e.symbol) && r.date < e.date).sort((a, b) => b.date.localeCompare(a.date));
  const keptReleases = lineage.filter((r) => r.releaseFigures).map((r) => ({ key: releaseQuarterKey(r.releaseFigures!, r.quarter), read: r.releaseFigures! })).filter((x): x is { key: string; read: ReleaseFigures } => x.key !== null);
  let earlier: EarningsReport["earlierReleases"] = [];
  let earlierTried: string[] = pick?.tried ?? prev?.earlierTried ?? lineage[0]?.earlierTried ?? [];
  let earlierNote: string | null = prev?.earlierNote ?? null;
  for (const x of [...(prev?.earlierReleases ?? []), ...lineage.flatMap((r) => r.earlierReleases)]) if (!earlier.some((y) => y.key === x.key)) earlier = [...earlier, x];
  if (around.foreign && around.release) {
    const currentKey = releaseFigures ? releaseQuarterKey(releaseFigures, e.quarter) : releaseQuarterKey({ periodEnd: null }, e.quarter);
    const read = await readEarlierReleases(found.cik, subs, currentKey, { current: releaseFigures && currentKey ? { key: currentKey, read: releaseFigures } : null, kept: keptReleases, earlier, tried: earlierTried }, e, c);
    earlier = read.earlier;
    earlierTried = read.tried;
    earlierNote = read.note;
  }
  const waited = around.release?.form === "6-K" ? "20-F" : "10-Q";
  const sentence = around.filing
    ? null
    : around.foreign
      ? releaseFigures
        ? "Files its quarters on 6-K, which carries no XBRL figures: the quarter's figures are the release's own, checked against its text; the tests read the last 20-F until the next one."
        : "Files its quarters on 6-K, which carries no XBRL figures; the tests and the deck read the last 20-F until the next one."
      : releaseFigures
        ? `The quarter's figures are the release's own, checked against its text; the tests read the last filing until the ${waited} lands.`
        : `The quarter's own figures wait for the ${waited}; the tests and the deck read the last filing.`;
  const table = await companyFacts(found.cik, c.contact);
  // Five years of closes, read before the figures: a company not held is priced at its last close (Hamza, 27 Oct 2026: the deck's valuation was empty for one on the watchlist), in US dollars, the price feed's currency for a plain ticker.
  const benchmark = benchmarksOf(c.m)[0] ?? "SPY";
  let closes: Parameters<typeof buildDetail>[0]["closes"] = null;
  try {
    const read = await loadCloses(`${e.symbol},${benchmark}`, c.today, "full", DEEP_DIVE_DAYS);
    const holding = read.series[e.symbol] ?? [];
    const bench = read.series[benchmark] ?? [];
    closes = holding.length && bench.length ? { holding, bench, benchmark, note: read.problems.length ? read.problems.join(" ").slice(0, 300) : null } : { holding: [], bench: [], benchmark, note: `The price feed gave no closes for ${holding.length ? benchmark : e.symbol}.` };
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    closes = { holding: [], bench: [], benchmark, note: err.message.slice(0, 300) };
  }
  const lastClose = closes.holding.at(-1)?.value ?? null;
  const price = held ?? lastClose;
  const listing = h?.currency ?? (price !== null ? "USD" : null);
  const rate = await listingRate(listing, table.currency, c.today);
  let f = fundamentalsOf(table, price, listing, rate.fx);
  if (rate.fx === null && rate.note) f.notes.push(`pe_ratio, dividend_yield_pct: ${rate.note}`);
  let segments: SegmentRead | null = null;
  let engine;
  try {
    segments = await segmentLines(found.cik, c.contact);
    engine = engineOf(segments, f.values.revenue_growth_pct);
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    engine = engineOf(null, f.values.revenue_growth_pct, err.message.replace(/\.$/, ""));
  }
  f = withEngine(f, engine);
  const verdict = c.m ? checkCompany(c.m, familyOf(c.m).family, subjectBook(e.symbol, e.subjectName ?? found.title, f.values, price, table.currency ?? "USD", c.today), c.today) : null;
  const readings: Record<string, number | null> = { price };
  for (const [k, v] of Object.entries(f.values)) readings[k] = v ?? null;
  // The deck's detail: the position and its cap, the filings' geography, the latest finished study, and a year of weekly closes against the methodology's first benchmark.
  const cap = capOf(capsFor(c.m), verdict?.classId ?? null);
  const study = c.studies.filter((s) => s.status === "done" && s.ticker && symbolKey(s.ticker) === symbolKey(e.symbol)).sort((a, b) => (b.finishedAt ?? b.requestedAt).localeCompare(a.finishedAt ?? a.requestedAt))[0] ?? null;
  const geography = Object.entries(c.filings?.bySymbol ?? {}).find(([k]) => symbolKey(k) === symbolKey(e.symbol))?.[1]?.revenueGeography ?? null;
  // The thesis from the Theses screen, its pillars read on the new figures, its DCF at the report's price and the valuation by stage (the stage read from the filings even with no thesis); a record's note alone before one is written.
  const thesis = thesisFor(c.theses, e.symbol);
  const read = thesisDetail(thesis, readings, price, e.date);
  const before = c.kept.filter((r) => symbolKey(r.symbol) === symbolKey(e.symbol) && r.date < e.date && (r.status === "complete" || r.status === "release")).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const bal = (k: Parameters<typeof latestBalance>[1]) => latestBalance(table, k);
  const cashNow = bal("cash");
  const balance = cashNow
    ? { cash: cashNow.value, investments: (bal("marketableSecurities")?.value ?? 0) + (bal("longTermInvestments")?.value ?? 0) || null, debt: bal("debt")?.value ?? null, shares: table.ttm.dilutedShares ?? bal("sharesOutstanding")?.value ?? null, quarter: cashNow.quarter }
    : null;
  // The quarters the releases printed, this one's first, so the series has them where the facts have none.
  const releases = [releaseFigures ? { key: releaseQuarterKey(releaseFigures, e.quarter), read: releaseFigures } : null, ...keptReleases, ...earlier.map((x) => ({ key: x.key, read: x.figures }))].filter((x): x is { key: string; read: ReleaseFigures } => !!x && x.key !== null);
  // The multiple over five years on the method the thesis values by, else the P/E (the P/S for a company with no earnings), at the rate that carries the filings' per-share figures to the price (Hamza, 27 Oct 2026).
  const perShare = ttmPerShareHistory(table);
  const atRate = rate.fx ?? null;
  const historyOf = (metric: HistoryMetric) => (closes?.holding.length && perShare.length && atRate !== null ? valuationHistory(metric, closes.holding, perShare, c.today, atRate) : null);
  const chosen = read.valuation?.method ? historyMetricFor(read.valuation.method) : null;
  const history = (chosen ? historyOf(chosen) : null) ?? [historyOf("trailing_pe"), historyOf("ps")].find((x) => x?.now) ?? null;
  // The peers: the screener's companies in the same sub-industry, else the same SEC industry code, and the sector as a whole.
  const filed = Object.entries(c.filings?.bySymbol ?? {}).find(([k]) => symbolKey(k) === symbolKey(e.symbol))?.[1] ?? null;
  const listed = c.screener ? (Object.values(c.screener.bySymbol).find((x) => symbolKey(x.symbol) === symbolKey(e.symbol)) ?? null) : null;
  const peers = c.screener ? peerComparison({ symbol: e.symbol, sector: filed?.sector ?? listed?.sector ?? null, subIndustry: filed?.subIndustry ?? listed?.subIndustry ?? null, sic: filed?.sic ?? listed?.sic ?? null, values: { ...f.values, consensus_forward_pe: filed?.values.consensus_forward_pe ?? null } }, Object.values(c.screener.bySymbol)) : null;
  const detail = buildDetail({ holding: h, cap: cap ? { cap: cap.cap, section: cap.rule.section } : null, table, segments, geography, engine, fundamentals: f, verdict, study, closes, thesis: thesis ? read : { text: record?.note ?? null, valuation: read.valuation }, before, balance, releases, kpis: releaseFigures?.kpis ?? [], added: addedReads(addedSince(thesis, e.date)), history, peers, ownRelease: releaseFigures ? { key: releaseQuarterKey(releaseFigures, e.quarter), read: releaseFigures } : null, segmentHistory: filed?.segmentHistory ?? null, brief: prev?.detail?.brief && study && prev.detail.brief.studyId === study.id ? prev.detail.brief : null, flowNotes: prev?.detail?.flowNotes ?? null });
  return buildReport({ ...base, price, status, sentence, release: around.release, filing: around.filing, table, verdict, readings, detail, releaseFigures, releaseNote, earlierReleases: earlier, earlierTried, earlierNote });
}

/** At most this many 6-Ks are fetched in one run to find the one that carries the results. */
export const SIX_K_TESTS_PER_RUN = 4;

/**
 * The 6-K that carries the quarter's results, among those filed in the
 * release's window (Hamza, 5 Nov 2026: NVO's report was read from a share
 * buyback notice filed the day before its results). The one kept with
 * figures stays; else each, earliest first, is fetched and tested as text
 * (looksLikeResults on the report's quarter), a 6-K that is not results
 * remembered by its accession (`earlierTried`) and never fetched again. None
 * yet is no release, with a sentence; a quarter the report does not name
 * takes the earliest, as before. The log gets counts, never a figure.
 */
async function resultsSixK(cik: number, around: FiledAround, e: EarningsEntry, prev: EarningsReport | null, c: Context): Promise<{ release: FilingRef | null; docs: { name: string; text: string }[] | null; tried: string[]; sentence: string | null }> {
  const candidates = around.sixKs?.length ? around.sixKs : around.release ? [around.release] : [];
  const tried = new Set<string>([...(prev?.earlierTried ?? []), ...c.kept.filter((r) => symbolKey(r.symbol) === symbolKey(e.symbol)).flatMap((r) => r.earlierTried ?? [])]);
  const out = (release: FilingRef | null, docs: { name: string; text: string }[] | null, sentence: string | null) => ({ release, docs, tried: [...tried].slice(-60), sentence });
  const kept = prev?.releaseFigures && prev.release ? candidates.find((x) => x.url === prev.release!.url) : undefined;
  if (kept) return out(kept, null, null);
  const key = releaseQuarterKey({ periodEnd: null }, e.quarter);
  if (!key) return out(around.release, null, null);
  let tests = 0;
  for (const x of candidates) {
    if (!x.accession || tried.has(x.accession)) continue;
    if (tests >= SIX_K_TESTS_PER_RUN) break;
    tests++;
    let docs: { name: string; text: string }[];
    try {
      docs = await releaseDocuments(cik, x.accession, x.url.split("/").pop() || null, c.contact);
    } catch (err) {
      if (!(err instanceof SyncError)) throw err;
      console.error(`[earnings] results 6-K: ${err.logDetail ?? "failed"}`);
      return out(null, null, "A 6-K filed since the report date could not be read at the SEC; it is tried again next run.");
    }
    if (looksLikeResults(releaseText(docs), key)) {
      console.info(`[earnings] results 6-K: found after ${tests} read`);
      return out(x, docs, null);
    }
    tried.add(x.accession);
  }
  console.info(`[earnings] results 6-K: none of ${tests} read`);
  return out(null, null, "The 6-Ks filed since the report date are not the results (a buyback or a dividend notice, say); the results are read once their 6-K is filed.");
}

/**
 * The quarter's figures from the release itself: its documents from the SEC
 * as text, read on the person's own provider through one tool, every figure
 * then checked against the printed text (lib/earnings.ts checkReleaseRead).
 * A figure the text does not print is dropped and named; a read with no
 * revenue for the quarter is nothing. Every failure is a sentence, and the
 * next run tries again. The log gets a count, never a figure.
 */
async function readReleaseFigures(cik: number, release: FilingRef, e: EarningsEntry, c: Context, fetched: { name: string; text: string }[] | null = null): Promise<{ figures: ReleaseFigures | null; note: string | null }> {
  if (!c.provider) return { figures: null, note: "The AI is not set up on this deployment yet." };
  if (!release.accession) return { figures: null, note: "The release's filing could not be placed at the SEC, so its figures were not read." };
  let docs: { name: string; text: string }[];
  try {
    docs = fetched ?? (await releaseDocuments(cik, release.accession, release.url.split("/").pop() || null, c.contact));
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    console.error(`[earnings] release text: ${err.logDetail ?? "failed"}`);
    return { figures: null, note: err.message.slice(0, 300) };
  }
  const text = releaseText(docs);
  if (text.length < 500) return { figures: null, note: "The release's documents carry too little text to read the quarter's figures from." };
  return readReleaseText(text, docs, { symbol: e.symbol, name: e.subjectName ?? e.name, date: e.date, quarter: e.quarter, form: release.form }, c);
}

/** One release's text on the person's provider, then every figure checked against it: shared by this quarter's release and the earlier ones. */
async function readReleaseText(text: string, docs: readonly { name: string }[], input: { symbol: string; name: string | null; date: string; quarter: string | null; form: string }, c: Context): Promise<{ figures: ReleaseFigures | null; note: string | null; held: boolean }> {
  if (!c.provider) return { figures: null, note: "The AI is not set up on this deployment yet.", held: false };
  try {
    // A reading that does not hold together is asked once more on the tier above (Hamza, 4 Nov 2026).
    const parsed = await callChecked(c.provider, releaseRequestBody({ ...input, text }, modelFor(c.provider, process.env.ANTHROPIC_RECAP_MODEL || EARNINGS_MODEL)) as ModelRequest, { agent: "reader", step: "release", subject: input.symbol }, parseReleaseResponse, (p) => p.ok);
    if (!parsed.ok) {
      console.error(`[earnings] release figures: ${parsed.reason}`);
      return { figures: null, note: "The reading of the release's figures did not hold together; it is tried again next time.", held: false };
    }
    const { read, dropped } = checkReleaseRead(parsed.read, text);
    console.info(`[earnings] release figures: ${dropped.length} not printed`);
    if (read.lines.revenue.now === null) return { figures: null, note: `The quarter's revenue the model read is not printed in the release's text${dropped.length ? ` (${dropped.length} figure${dropped.length === 1 ? "" : "s"} not found)` : ""}; nothing was used.`, held: true };
    return { figures: { ...read, documents: docs.map((d) => d.name.slice(0, 120)).slice(0, 8), dropped, readAt: c.now.toISOString() }, note: null, held: true };
  } catch (err) {
    if (!(err instanceof SyncError)) throw err;
    console.error(`[earnings] release figures: ${err.logDetail ?? "failed"}`);
    return { figures: null, note: err.message.slice(0, 300), held: false };
  }
}

type EarlierState = { current: { key: string; read: ReleaseFigures } | null; kept: readonly { key: string; read: ReleaseFigures }[]; earlier: EarningsReport["earlierReleases"]; tried: readonly string[] };

/**
 * The earlier quarters of a 6-K filer, from their own releases: for each
 * quarter within QUARTERS_BACK that no release yet covers, newest first, the
 * 6-Ks filed in the results window after its end are fetched from the SEC and
 * tested as text (looksLikeResults); the first that reads as that quarter's
 * results is read on the person's provider and kept when the model's own
 * period is that quarter. A 6-K that is not results is remembered and never
 * fetched again; a quarter whose 6-K could not be read is tried next run. At
 * most EARLIER_RELEASES_PER_RUN reads per run, so one run never holds a page
 * or the cron for long. The log gets counts, never a figure.
 */
async function readEarlierReleases(cik: number, subs: unknown, currentKey: string | null, state: EarlierState, e: EarningsEntry, c: Context): Promise<{ earlier: EarningsReport["earlierReleases"]; tried: string[]; note: string | null }> {
  const earlier = [...state.earlier];
  const tried = [...state.tried];
  const covered = () => releaseCoverage([...(state.current ? [state.current] : []), ...state.kept, ...earlier.map((x) => ({ key: x.key, read: x.figures }))]);
  if (!currentKey) return { earlier, tried, note: "The earlier quarters wait for this quarter's release to be read first." };
  if (!c.provider) return { earlier, tried, note: missingQuarters(currentKey, covered()).length ? "The AI is not set up on this deployment yet." : null };
  let reads = 0;
  let fetches = 0;
  let stopped: string | null = null;
  const stillMissing = () => missingQuarters(currentKey, covered());
  for (const key of stillMissing()) {
    if (reads >= EARLIER_RELEASES_PER_RUN || stopped) break;
    if (covered().has(key)) continue;
    let candidates: FilingRef[];
    try {
      candidates = candidateReleases(subs, cik, key, filingLink, tried);
    } catch {
      stopped = "SEC EDGAR's filing list could not be read for the earlier quarters.";
      break;
    }
    for (const cand of candidates) {
      if (!cand.accession) continue;
      let docs: { name: string; text: string }[];
      try {
        docs = await releaseDocuments(cik, cand.accession, cand.url.split("/").pop() || null, c.contact);
        fetches += 1;
      } catch (err) {
        if (!(err instanceof SyncError)) throw err;
        console.error(`[earnings] earlier release text: ${err.logDetail ?? "failed"}`);
        stopped = err.message.slice(0, 200);
        break;
      }
      const text = releaseText(docs);
      if (!looksLikeResults(text, key)) {
        tried.push(cand.accession);
        continue;
      }
      const read = await readReleaseText(text, docs, { symbol: e.symbol, name: e.subjectName ?? e.name, date: cand.filed, quarter: null, form: cand.form }, c);
      reads += 1;
      if (read.figures && releaseQuarterKey(read.figures, null) === key) {
        earlier.push({ key, release: cand, figures: read.figures });
        break;
      }
      // Read to the end and not this quarter's results (another quarter's, or no revenue printed): never fetched again. A model failure is tried next run.
      if (read.held) tried.push(cand.accession);
      if (reads >= EARLIER_RELEASES_PER_RUN) break;
    }
  }
  const left = stillMissing();
  console.info(`[earnings] earlier releases: ${reads} read, ${fetches} fetched, ${left.length} quarter${left.length === 1 ? "" : "s"} still missing`);
  const have = earlier.length;
  const note = stopped
    ? `${stopped} The earlier quarters are tried again next run.`
    : left.length
      ? reads
        ? `${have} earlier release${have === 1 ? "" : "s"} read from their 6-Ks; ${left.length} quarter${left.length === 1 ? "" : "s"} still to read, a few each run.`
        : `${have} earlier release${have === 1 ? "" : "s"} read from their 6-Ks; no results 6-K was found for ${left.map((k) => `Q${k.slice(5)} ${k.slice(2, 4)}`).join(", ")}.`
      : have
        ? `${have} earlier release${have === 1 ? "" : "s"} read from their 6-Ks, so the series reaches eight quarters.`
        : null;
  return { earlier: earlier.slice(0, 12), tried: tried.slice(-80), note };
}

/**
 * How the stock took the results: the move to the close of the first session
 * that traded on them, from the closes, once that session has closed (16:20
 * New York, when the feed's bar is final), beside SPY's; then, on a Claude
 * key, why, from that day's pages. A feed that cannot be read is tried again
 * next run; a model that fails keeps the move with a sentence.
 */
async function withReaction(r: EarningsReport, provider: ModelProvider | null, now: Date): Promise<EarningsReport> {
  const ny = newYorkClock(now);
  if (!reactionDue(r, ny.date)) return r;
  const settled = ny.minutes >= 16 * 60 + 20 ? ny.date : addDays(ny.date, -1);
  const closes = await loadCloses(`${r.symbol},${REACTION_BENCHMARK}`, localDay(now), "full", 40).catch(() => null);
  const own = closes?.series[r.symbol] ?? closes?.series[r.symbol.toUpperCase()] ?? null;
  if (!own?.length) return r;
  const move = reactionMove(r, own, closes?.series[REACTION_BENCHMARK] ?? null, settled);
  if (!move) return r;
  const kept = (note: string) => ({ ...r, reaction: { ...move, why: null, points: [], note: note.slice(0, 300) } });
  if (!provider) return kept("The AI is not set up on this deployment yet.");
  const cannot = providerCannot(provider, "web_search");
  if (cannot) return kept(cannot);
  try {
    const parsed = await callChecked(provider, reactionRequestBody(r, move, modelFor(provider, COMMENTARY_MODEL)) as ModelRequest, { agent: "earnings_reaction", step: "why", subject: r.symbol }, parseReactionResponse, (p) => p.ok);
    if (!parsed.ok) {
      console.error(`[earnings] reaction: ${parsed.reason}`);
      return kept("The reading of why the shares moved did not hold together.");
    }
    return { ...r, reaction: { ...move, why: parsed.why, points: parsed.points, note: null } };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[earnings] reaction: ${e.logDetail ?? "failed"}`);
    return kept(e.message);
  }
}

/** The reading of the release and the call, on the person's Claude; any other provider, or none, leaves a sentence instead. One try per stage. */
async function withCommentary(r: EarningsReport, prev: EarningsReport | null, provider: ModelProvider | null): Promise<EarningsReport> {
  if (prev && prev.status === r.status && prev.commentaryNote) return r;
  if (!provider) return { ...r, commentaryNote: "The AI is not set up on this deployment yet." };
  const cannot = providerCannot(provider, "web_search");
  if (cannot) return { ...r, commentaryNote: cannot.slice(0, 300) };
  try {
    // Haiku first since the beta (Hamza, 9 Nov 2026); a reading the check refuses is asked once more on Sonnet.
    const parsed = await callChecked(provider, commentaryRequestBody(r, modelFor(provider, COMMENTARY_MODEL)) as ModelRequest, { agent: "earnings_reaction", step: "commentary", subject: r.symbol }, parseCommentaryResponse, (p) => p.ok);
    if (!parsed.ok) {
      console.error(`[earnings] commentary: ${parsed.reason}`);
      return { ...r, commentaryNote: "The reading of the release did not hold together; it is tried again once the figures are in." };
    }
    return { ...r, commentary: parsed.commentary, commentaryNote: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[earnings] commentary: ${e.logDetail ?? "failed"}`);
    return { ...r, commentaryNote: e.message.slice(0, 300) };
  }
}

/** Minutes a company's SEC filings list is shared for, so the quarter-hourly watch asks the SEC once per company, whoever follows it. */
const SEC_POLL_MINUTES = 10;
/** Companies asked of the SEC at a time. */
const SEC_POLL_BATCH = 5;

/** Each symbol's results releases as the SEC lists them since `since`, read under the deployment's contact and shared for SEC_POLL_MINUTES. */
async function secReleases(symbols: readonly string[], contact: EdgarContact | null, since: string, now: Date): Promise<{ found: { symbol: string; days: ReleaseDay[] }[]; problems: string[] }> {
  if (!contact) return { found: [], problems: ["Results are found in each company's SEC filings, which need a contact address on Setup's Company filings card."] };
  const slot = Math.floor(now.getTime() / (SEC_POLL_MINUTES * 60_000));
  const found: { symbol: string; days: ReleaseDay[] }[] = [];
  let failed = 0;
  for (let i = 0; i < symbols.length; i += SEC_POLL_BATCH) {
    const batch = await Promise.allSettled(
      symbols.slice(i, i + SEC_POLL_BATCH).map(async (symbol) => {
        const company = await lookupCompany(symbol, contact);
        if (!company) return null;
        const days = await unstable_cache(async () => releaseDays(await companySubmissions(company.cik, contact), company.cik, filingLink, since), ["sec-results", String(company.cik), since, String(slot)], { revalidate: SEC_POLL_MINUTES * 60 })();
        return { symbol, days };
      }),
    );
    for (const r of batch) {
      if (r.status === "fulfilled") {
        if (r.value) found.push(r.value);
      } else failed += 1;
    }
  }
  if (failed) console.error(`[earnings] SEC results: ${failed} companies not readable`);
  return { found, problems: failed ? [`SEC EDGAR's list of filings could not be read for ${failed} ${failed === 1 ? "company" : "companies"}; they are asked again at the next run.`] : [] };
}

/** The calendar where no calendar may be read: the results each followed company filed in the last EARNINGS_BACK_DAYS. */
async function secResultsCalendar(symbols: readonly string[], contact: EdgarContact | null, today: string, now: Date) {
  const since = addDays(today, -EARNINGS_BACK_DAYS);
  const { found, problems } = await secReleases(symbols.slice(0, MAX_FOLLOWED), contact, since, now);
  return secCalendar(found, since, today, problems, now.toISOString());
}

/**
 * For the results watch where no calendar is read (SOURCES=licensed):
 * whether a followed company has filed results today or yesterday that no
 * report has read yet, from the SEC's list, shared for SEC_POLL_MINUTES.
 */
export async function secResultsOut(file: EarningsFile | null, now: Date = new Date()): Promise<boolean> {
  const followed = file?.followed ?? [];
  if (!followed.length) return false;
  const ny = newYorkClock(now);
  const { found } = await secReleases(followed, operatorContact(), addDays(ny.date, -2), now);
  return secResultsDue(file, found, ny.date);
}
