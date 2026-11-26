import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { composeBook, listedTickers } from "@/lib/compose-book";
import { decisionsFileSchema } from "@/lib/decisions";
import { filingsFileSchema } from "@/lib/filings";
import { answerQuestion, callChecked, callModel, narrateReport } from "@/lib/methodology-draft";
import { DEFAULT_PREFERENCES, EMPTY_RECORDS, preferencesSchema, recordsSchema } from "@/lib/preferences";
import { sendReport, type ReviewPdf } from "@/lib/report-mail";
import { type Answered, buildReport, claimOutcome, isDue, keepReports, kindsDue, localClock, markSent, MAX_QUESTIONS, newsSubjects, partlyOutcome, reportsFileSchema, sentKinds, slotKey, withDecidingLetter, withHunterFinds, withNews, withNewsletters, withQuestions, withWeekAhead, type Report, type ReportKind, type ReportsFile } from "@/lib/report";
import { pdfName } from "@/lib/review-pdf";
import { renderReviewPdf } from "@/lib/review-pdf-run";
import { researchFileSchema } from "@/lib/research";
import { newsRequestBody, parseNewsResponse, periodFor, NEWS_MODEL } from "@/lib/review";
import { claimSlot, enrolments, recordOutcome, releaseSlot, type ScheduledEnrolment } from "@/lib/registry";
import { bookSchema } from "@/lib/holdings";
import { EMPTY_CLOSES, EMPTY_MARKETS, type Closes, type Markets } from "@/lib/markets";
import { loadCloses, loadMarkets } from "@/lib/markets-feed";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { newslettersFileSchema } from "@/lib/newsletters";
import { thesisHunterFileSchema } from "@/lib/thesis-hunter";
import { thesesFileSchema } from "@/lib/theses";
import { modulesFor, setupSchema } from "@/lib/setup";
import { portfoliosFileSchema } from "@/lib/portfolios";
import { brokersFileSchema, withBrokers } from "@/lib/brokers";
import { statementsFileSchema, withStatements } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { vaultForEnrolment, type Vault } from "@/lib/vault";
import { enterZone } from "@/lib/zone";

/**
 * Builds one person's report from their vault and keeps it there; the cron
 * then sends it. The same code runs for "Build the weekly" on the Reports
 * screen (with the session's vault) and for the schedule (with a vault opened
 * from what the person enrolled with: a refresh token, or their chosen
 * bucket). A weekly or monthly review reads the Decision Log and the filings
 * too; with the commentary on, the news is gathered on the person's own
 * provider, and skipped with a sentence when the provider cannot search.
 */

export type BuildOutcome = { report: Report; file: ReportsFile; pdf: ReviewPdf | null };

/** `zone` is the person's own clock: the report's date and every "today" figure are read on it. */
export async function buildFromVault(vault: Vault, now: Date, prose: boolean, zone: string, kind: ReportKind = "today", nextReport: string | null = null): Promise<BuildOutcome> {
  const setup = await vault.readJson("setup", setupSchema);
  if (!setup) throw new SyncError("Finish Setup before building a report.", "no setup in vault");
  const review = kind !== "today";
  const today = localClock(now, zone).date;
  // The feed is started with the vault reads, as on the screens; a feed that fails leaves the indicators to say so.
  const feed = loadMarkets(today).catch((): Markets => ({ ...EMPTY_MARKETS, problems: ["The market feed could not be read."] }));
  // The files a screen can do without are read softly here too: one that cannot be read leaves the rest.
  const [fileBook, preferences, records, hostedAi, file, decisions, filings, statements, research, portfolios, brokers] = await Promise.all([
    vault.readJson("book", bookSchema),
    vault.readJson("preferences", preferencesSchema),
    vault.readJson("records", recordsSchema),
    prose ? providerFor(vault) : Promise.resolve(null),
    vault.readJson("reports", reportsFileSchema),
    review ? vault.readJson("decisions", decisionsFileSchema) : Promise.resolve(null),
    vault.readJson("filings", filingsFileSchema).catch(() => null),
    vault.readJson("statements", statementsFileSchema).catch(() => null),
    vault.readJson("research", researchFileSchema).catch(() => null),
    vault.readJson("portfolios", portfoliosFileSchema).catch(() => null),
    vault.readJson("brokers", brokersFileSchema).catch(() => null),
  ]);
  const rawBook = withBrokers(withStatements(fileBook, statements, setup.baseCurrency, today).book, brokers, setup.baseCurrency, today).book;
  if (!rawBook) throw new SyncError("No figures have arrived yet, so there is nothing to report.", "no book in vault");
  // The review is of all portfolios together: under one methodology per portfolio it carries no verdict of its own (lib/portfolios.ts lensView).
  const methodology = portfolios?.mode === "each" ? null : setup.methodology;
  // The closes per listed holding, waited for in full: contribution and the correlation read them. A review that cannot have them says so.
  const closes = review ? await loadCloses(listedTickers(rawBook).join(","), today, "full").catch((): Closes => ({ ...EMPTY_CLOSES, problems: ["The price feed could not be read."] })) : null;
  // The same book the screens show: records, the filings' fundamentals and sectors, research, the market feed for SPY and QQQ, and the closes.
  const book = composeBook(rawBook, { records: records ?? EMPTY_RECORDS, filings, research, markets: await feed, methodology: setup.methodology, closes })!;
  let report = buildReport({ setup: { ...setup, methodology }, book, methodology, preferences: preferences ?? DEFAULT_PREFERENCES, today, now, modules: modulesFor(setup, book), kind, decisions, filings, nextReport });
  // The newsletters were read as they arrived; a file that cannot be read leaves them out of this review. They come before the commentary, which reads the whole review.
  if (review) report = withNewsletters(report, await vault.readJson("newsletters", newslettersFileSchema).catch(() => null));
  // What the Thesis Hunter found this period, in place of an email for each find (Hamza, 4 Nov 2026); a file that cannot be read leaves them out.
  if (review) {
    const [hunter, theses] = await Promise.all([vault.readJson("thesis_hunter", thesisHunterFileSchema).catch(() => null), vault.readJson("theses", thesesFileSchema).catch(() => null)]);
    const held = listedTickers(book).map((x) => x.toUpperCase());
    const watched = [...Object.keys(theses?.bySymbol ?? {}), ...Object.keys((records ?? EMPTY_RECORDS).bySymbol)].map((x) => x.toUpperCase()).filter((x) => !held.includes(x));
    report = withHunterFinds(report, hunter, { held, watched, markets: Object.fromEntries((theses?.markets ?? []).map((m) => [m.id, m.title])) });
  }
  // The monthly letter on how the person decided (Hamza, 9 Nov 2026): reasons, plans, valuations a year on, rules kept and sales looked back on; a feed that cannot be read leaves the parts it needs unjudged.
  if (kind === "monthly") report = withDecidingLetter(report, await (await import("@/lib/judgement-run")).letterFor(book, methodology, setup.inputs, decisions, records ?? EMPTY_RECORDS, today).catch(() => null));
  // Next week on the calendar, with each event's reach in the book and its history (Hamza, 27 Oct 2026); a calendar that cannot be read says so on its slide.
  if (review) {
    const { calendarFromVault } = await import("@/lib/calendar-run");
    report = withWeekAhead(report, await calendarFromVault(vault, book, methodology, filings, preferences ?? DEFAULT_PREFERENCES, records ?? EMPTY_RECORDS, today).catch((e) => {
      console.error(`[report] calendar: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
      return null;
    }), today);
  }
  const questions = review ? (preferences ?? DEFAULT_PREFERENCES).reviewQuestions.slice(0, MAX_QUESTIONS) : [];
  if (prose) {
    const provider = hostedAi;
    if (!provider) report = { ...report, notes: [...report.notes, `Commentary${questions.length ? ", your questions" : ""} and news skipped: no model kept on Setup.`] };
    else {
      if (review) report = await addNews(provider, report, book, kind, today);
      // A commentary that fails leaves the report without one, and says so; the figures still go out.
      try {
        const { text, cut } = await narrateReport(provider, report);
        report = { ...report, prose: text, notes: cut ? [...report.notes, "The commentary was cut short by the model; what came back is kept."] : report.notes };
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[report] commentary skipped: ${e.logDetail ?? "failed"}`);
        report = { ...report, notes: [...report.notes, `Commentary skipped: ${e.message}`] };
      }
      // The person's own questions, each answered from the review as it stands (Hamza, 18 Oct 2026); one that fails is a section saying so.
      if (questions.length) report = withQuestions(report, await answerAll(provider, report, questions));
    }
  } else if (questions.length) report = { ...report, notes: [...report.notes, `Your ${questions.length === 1 ? "question was" : `${questions.length} questions were`} not answered: the commentary is off on your schedule, and the answers are written with it.`] };
  let pdf: ReviewPdf | null = null;
  if (kind === "weekly" || kind === "monthly") ({ report, pdf } = await withPdf(vault, report, kind));
  const kept = keepReports(file, report);
  await vault.writeJson("reports", kept);
  return { report, file: kept, pdf };
}

/** Every question answered in turn on the person's provider; a failure is the sentence that explains it, never a missing section. */
async function answerAll(provider: ModelProvider, report: Report, questions: readonly string[]): Promise<Answered[]> {
  const out: Answered[] = [];
  for (const question of questions) {
    try {
      const { text, cut } = await answerQuestion(provider, report, question);
      out.push({ question, answer: text, note: cut ? "The answer was cut short by the model; what came back is kept." : null });
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[report] question skipped: ${e.logDetail ?? "failed"}`);
      out.push({ question, answer: null, note: e.message });
    }
  }
  return out;
}

/**
 * The review as a PDF report on the HCMP skeleton (lib/review-pdf.ts; Hamza,
 * 4 Nov 2026: the reviews as a page and a PDF, no PowerPoint), the plan the
 * page Reviews embeds is drawn from too, kept in the vault where the vault
 * can (the one before to the bin) and handed back for the email. A PDF that cannot be made or
 * kept is a sentence on the review; the review still goes out.
 */
async function withPdf(vault: Vault, report: Report, kind: "weekly" | "monthly"): Promise<{ report: Report; pdf: ReviewPdf | null }> {
  let bytes: Uint8Array;
  try {
    bytes = await renderReviewPdf(report);
  } catch (e) {
    console.error(`[report] pdf could not be made: ${e instanceof Error ? e.name : "error"}`);
    return { report: { ...report, notes: [...report.notes, "The PDF could not be made this time; the review is on the Reviews screen."] }, pdf: null };
  }
  const name = pdfName(report);
  const pdf = { name, pdf: bytes };
  try {
    const kept = await vault.saveReportPdf(kind, name, bytes);
    return { report: kept ? { ...report, pdf: kept } : report, pdf };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[report] pdf not kept: ${e.logDetail ?? "failed"}`);
    return { report: { ...report, notes: [...report.notes, `The PDF was not kept in your vault: ${e.message}`] }, pdf };
  }
}

/** Marks a review sent in the vault. A mark that cannot be written never sends it again: the email has gone, so it is logged and left. */
export async function keepSent(vault: Vault, file: ReportsFile, id: string, at: Date): Promise<void> {
  try {
    await vault.writeJson("reports", markSent(file, id, at.toISOString()));
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[report] sent mark not kept: ${e.logDetail ?? "failed"}`);
  }
}

/** The news sections, on a provider that can search the web; otherwise a sentence saying why they are missing. */
async function addNews(provider: ModelProvider, report: Report, book: Parameters<typeof newsSubjects>[0], kind: ReportKind, today: string): Promise<Report> {
  const cannot = providerCannot(provider, "web_search");
  if (cannot) return { ...report, notes: [...report.notes, `News skipped: ${cannot}`] };
  const subjects = newsSubjects(book);
  if (!subjects.length) return { ...report, notes: [...report.notes, "News skipped: no listed holding to search for."] };
  try {
    const body = newsRequestBody(subjects, periodFor(kind === "monthly" ? "monthly" : "weekly", today), today, modelFor(provider, NEWS_MODEL)) as ModelRequest;
    // Haiku first since the beta (Hamza, 9 Nov 2026); a week's news with no item that holds is asked once more on Sonnet.
    const parsed = await callChecked(provider, body, { agent: "review_news", step: "news", subject: kind }, parseNewsResponse, (p) => p.ok);
    if (!parsed.ok) return { ...report, notes: [...report.notes, `News skipped: ${parsed.why}`] };
    const out = withNews(report, parsed.news);
    return parsed.dropped ? { ...out, notes: [...out.notes, `News: ${parsed.dropped} item${parsed.dropped === 1 ? "" : "s"} without a date or a page ${parsed.dropped === 1 ? "was" : "were"} left out.`] } : out;
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[report] news skipped: ${e.logDetail ?? "failed"}`);
    return { ...report, notes: [...report.notes, `News skipped: ${e.message}`] };
  }
}

export type RunSummary = { checked: number; due: number; sent: number; failed: string[] };

/**
 * The cron's pass: every enrolment whose slot has come and has not been
 * claimed is built, kept and sent, once per review the slot calls for (the
 * weekly, and the monthly in the first week of a month). A failure gives the
 * slot back, so the next hour's pass tries again that day; the outcome is a
 * sentence on the person's Reports screen. A row that cannot be read is
 * skipped with its own sentence and never stops the others.
 */
export async function runDueReports(now: Date = new Date()): Promise<RunSummary> {
  const { rows, unreadable } = await enrolments();
  const summary: RunSummary = { checked: rows.length + unreadable, due: 0, sent: 0, failed: [] };
  if (unreadable) summary.failed.push(`${unreadable} stored schedule${unreadable > 1 ? "s" : ""} could not be read.`);
  for (const e of rows) {
    enterZone(e.schedule.zone);
    const run = await reportsFor(e, now);
    if (run.due) summary.due += 1;
    if (run.sent) summary.sent += 1;
    if (run.failed) summary.failed.push(run.failed);
  }
  return summary;
}

/**
 * One enrolment's reviews when its slot has come and is not claimed: built,
 * kept and sent, once per review the slot calls for. A failure gives the slot
 * back with a sentence for the person's Reports screen and is returned, never
 * thrown, so the rest of a morning job still runs.
 */
export async function reportsFor(e: ScheduledEnrolment, now: Date): Promise<{ due: boolean; sent: boolean; failed: string | null }> {
  if (!isDue(e.schedule, now, e.lastSlot, e.lastOutcome)) return { due: false, sent: false, failed: null };
  const slot = slotKey(e.schedule, now);
  // The same slot again means a claim a killed run left behind (staleClaim) or a review sent by hand covered part of it; it is taken back from exactly that outcome, and what that outcome says went out is not sent again.
  const stale = e.lastSlot === slot ? e.lastOutcome : null;
  const done = sentKinds(stale);
  const kinds = kindsDue(e.schedule, slot).filter((k) => !done.includes(k));
  if (!kinds.length) {
    // A monthly-only schedule outside the first week, or nothing left to send: the slot is claimed so the hour is not retried, nothing is built.
    if (await claimSlot(e.email, slot, now, stale)) await recordOutcome(e.email, `nothing due ${now.toISOString()}`).catch(() => undefined);
    return { due: false, sent: false, failed: null };
  }
  if (!(await claimSlot(e.email, slot, now, stale, claimOutcome(now, done)))) return { due: true, sent: false, failed: null };
  const sent = [...done];
  try {
    const vault = await vaultForEnrolment(e);
    for (const kind of kinds) {
      const { report, file, pdf } = await buildFromVault(vault, now, e.schedule.prose, e.schedule.zone, kind, nextSlot(slot));
      await sendReport(e.email, report, pdf);
      // Kept on the claim at once, so a run killed before the next kind is taken back for that kind alone.
      sent.push(kind);
      await recordOutcome(e.email, claimOutcome(now, sent)).catch(() => undefined);
      await keepSent(vault, file, report.id, new Date());
    }
    await recordOutcome(e.email, `sent ${now.toISOString()}`);
    return { due: true, sent: true, failed: null };
  } catch (err) {
    // The outcome is a sentence for the person's Reports screen; the log gets the scrubbed detail, never an address.
    const message = err instanceof SyncError ? err.message : "The report could not be built.";
    console.error(`[report] one enrolment failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
    if (sent.length) {
      // Part went out: the slot stays claimed with what was sent, marked to be taken back for the rest at the next run.
      await recordOutcome(e.email, partlyOutcome(now, sent, message)).catch(() => undefined);
      return { due: true, sent: true, failed: message };
    }
    // On a claim taken back the slot before is not known; none makes the slot due at the next run, as a fresh failure would.
    await releaseSlot(e.email, stale !== null ? null : e.lastSlot, `failed ${now.toISOString()}: ${message}`).catch(() => undefined);
    return { due: true, sent: false, failed: message };
  }
}

/** The slot a week after this one, for the "next review" line. */
function nextSlot(slot: string): string {
  const d = new Date(Date.parse(`${slot}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

