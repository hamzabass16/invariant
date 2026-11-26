import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { fundamentalsOf, factsText, studyTable, type StudyTable } from "@/lib/edgar-facts";
import { engineOf, segmentText, withEngine } from "@/lib/edgar-segments";
import type { Book, Holding } from "@/lib/holdings";
import { contextFor, type Methodology } from "@/lib/methodology";

import type { EdgarContact } from "@/lib/preferences";
import { formatUnit } from "@/lib/recipes";
import {
  afterStep,
  checkCompany,
  EMPTY_RESEARCH,
  failStudy,
  newStudy,
  replaceStudy,
  researchFileSchema,
  stepGroups,
  studySchema,
  studyToTakeUp,
  subjectBook,
  templateFor,
  templateSchema,
  withStudy,
  type Study,
} from "@/lib/research";
import { parseResearchResponse, RESEARCH_MODEL, researchRequestBody } from "@/lib/research-prompt";
import { capOf, capsFor, weightsFor } from "@/lib/screens";
import { checkSections, studyBrief, writableStudies, type SectionCheck } from "@/lib/study-writes";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/** What a study's run reads besides the vault: the methodology, the SEC contact, the book as every screen reads it, the base currency. */
export type StudyContext = { m: Methodology; contact: EdgarContact | null; book: Book | null; baseCurrency: string };

export const NEEDS_CONTACT = "Confirm the contact the SEC will see under Company filings on Setup first. The SEC asks every reader to name one.";

/**
 * Queues a study with the template as it stands today frozen into it, and
 * returns its id; the run is `runStudy`. Throws a SyncError a screen can show.
 */
export async function queueStudy(c: StudyContext, v: Vault, subject: string, question: string, now: string, forResults: string | null = null): Promise<string> {
  const own = await v.readJson("research_template", templateSchema);
  const applied = templateFor(c.m, own, c.baseCurrency);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const study = newStudy(id, subject, question, applied, now, forResults);
  const file = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
  let next: ReturnType<typeof withStudy>;
  try {
    next = withStudy(file, study, now);
  } catch (e) {
    throw new SyncError(e instanceof Error ? e.message : "Too many studies.", "research cap");
  }
  await v.writeJson("research", next);
  return id;
}

/**
 * The run: the filings are read and the methodology's checks run, then every
 * pending section is written on the person's key, a few sections per call,
 * the calls side by side. Each group is kept as it arrives, so a run cut
 * short keeps what was written and Continue picks up the rest. Every failure
 * is a sentence on the study, never a silent stop; nothing here reaches a
 * response, so the log line carries the scrubbed detail.
 */
export async function runStudy(c: StudyContext, v: Vault, id: string): Promise<void> {
  const m = c.m;
  const now = () => new Date().toISOString();
  let file = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
  let study = file.studies.find((s) => s.id === id);
  if (!study || study.status === "done" || study.status === "failed") return;
  // Saves are serialised: the file is read, changed and written as one copy, and the groups finish in any order.
  let chain: Promise<void> = Promise.resolve();
  const save = (change: (s: Study) => Study) => {
    chain = chain.then(async () => {
      study = change(study!);
      file = replaceStudy(file, study, now());
      await v.writeJson("research", file);
    });
    return chain;
  };
  try {
    if (study.verdict === null) {
      const judged = await verdictOf(c, m, study);
      await save(() => judged);
    }
    const groups = stepGroups(study);
    if (!groups.length) {
      await save((s) => afterStep(s, {}, now()));
      return;
    }
    const provider = await providerFor(v);
    if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "no provider");
    const { writeStudy } = await import("@/lib/methodology-draft");
    const model = process.env.ANTHROPIC_RESEARCH_MODEL || RESEARCH_MODEL;
    const base = study;
    const titles = (ids: string[]) => ids.map((id) => base.sections.find((s) => s.id === id)?.title ?? id).join(", ");
    // Each group is written in one call; an answer that cannot be kept is asked again by itself, in halves (a cut one at once, any other after one more try), and what came back is kept either way.
    const writeGroup = async (sections: typeof groups[number], again = true): Promise<void> => {
      const parsed = parseResearchResponse(await writeStudy(provider, researchRequestBody(m, base, sections, model), base.subject), sections.map((s) => s.id));
      if (!parsed.ok && (parsed.cut || !again) && sections.length > 1) {
        const half = Math.ceil(sections.length / 2);
        return settleAll([sections.slice(0, half), sections.slice(half)].map((g) => writeGroup(g, false)));
      }
      if (!parsed.ok && again) return writeGroup(sections, false);
      if (!parsed.ok) throw new SyncError(`The writer's answer for ${titles(sections.map((s) => s.id))} could not be kept: ${parsed.reason}. Press Continue to write the rest.`, "research parse failed");
      await save((s) => afterStep(s, parsed.written, now()));
      if (parsed.missing.length) throw new SyncError(`${titles(parsed.missing)} came back unwritten; the rest was kept. Press Continue to write ${parsed.missing.length > 1 ? "them" : "it"}.`, "research sections missing");
    };
    await settleAll(groups.map((g) => writeGroup(g)));
  } catch (e) {
    if (!(e instanceof SyncError)) {
      console.error(`[research] run failed: ${e instanceof Error ? e.name : "unexpected error"}`);
      await save((s) => failStudy(s, "The study stopped on an error in the app. Press Continue to write the rest.", now())).catch(() => undefined);
      return;
    }
    console.error(`[research] ${e.logDetail ?? "failed"}`);
    await save((s) => failStudy(s, e.message, now())).catch(() => undefined);
  }
}

/** Waits for every write, so one failing never stops the others being kept, then throws the first failure. */
async function settleAll(runs: Promise<void>[]): Promise<void> {
  const first = (await Promise.allSettled(runs)).find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (first) throw first.reason;
}

/** The first step of a run: the figures and the verdict, before any prose. Throws a SyncError when the subject cannot be read. */
async function verdictOf(c: StudyContext, m: Methodology, study: Study): Promise<Study> {
  const today = localDay();
  const contact = c.contact;
  let held: Holding | null = null;
  let facts: string | null = null;
  let factsNote: string | null = null;
  let fundamentals: Record<string, number | null> = {};
  let notes: string[] = [];
  let table: StudyTable | null = null;
  let name = study.subject;
  let ticker = study.ticker;
  if (contact) {
    // Every subject is tried against the SEC's list, by ticker and by name; a theme matches nothing and runs free.
    const { lookupCompany, companyFacts, segmentLines } = await import("@/lib/edgar");
    const found = await lookupCompany(study.subject, contact);
    if (found) {
      name = found.title;
      ticker = found.ticker;
      held = c.book?.holdings.find((h) => h.symbol.toUpperCase() === found.ticker) ?? null;
      const facts0 = await companyFacts(found.cik, contact);
      table = studyTable(facts0);
      const { listingRate } = await import("@/lib/markets-feed");
      const rate = await listingRate(held?.currency ?? null, facts0.currency, today);
      let f = fundamentalsOf(facts0, held?.price ?? null, held?.currency ?? null, rate.fx);
      if (rate.fx === null && rate.note) f.notes.push(`pe_ratio, dividend_yield_pct: ${rate.note}`);
      // The segment note from the filing itself: the engine for the Classification Test and the lines for the writer.
      let segments = "";
      try {
        const read = await segmentLines(found.cik, contact);
        f = withEngine(f, engineOf(read, f.values.revenue_growth_pct));
        segments = segmentText(read, facts0.currency);
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        f = withEngine(f, engineOf(null, f.values.revenue_growth_pct, e.message.replace(/\.$/, "")));
        segments = `Segment and revenue lines: not read (${e.message})`;
      }
      facts = `${factsText(facts0)}\n\n${segments}`.slice(0, 20000);
      fundamentals = Object.fromEntries(Object.entries(f.values).map(([k, val]) => [k, val ?? null]));
      notes = f.notes;
      if (facts0.basis === "annual") factsNote = `The company files no quarterly reports with the SEC; the figures are for ${facts0.period} against the year before.`;
      else if (facts0.basis === "none") factsNote = "The filings carry no dated revenue or net income; no trailing figures were read.";
    } else if (study.ticker) {
      throw new SyncError(`SEC EDGAR lists no company under ${study.subject}, by ticker or by name. Enter the ticker the SEC uses or the company's full name; a theme or a market runs without filings when written as a phrase.`, "edgar no company");
    } else factsNote = "The subject names no company the SEC lists, so no filings were read; the study works from the methodology and the question alone.";
  } else if (study.ticker) throw new SyncError(NEEDS_CONTACT, "edgar no contact");
  else factsNote = "The subject is not a ticker, so no filings were read; the study works from the methodology and the question alone.";
  const book = subjectBook(ticker ?? "SUBJECT", name, fundamentals, held?.price ?? null, c.baseCurrency, today);
  const verdict = checkCompany(m, study.family, book, today);
  // The subject as held: its price, weight and cap from the book as every screen reads it, and the owner's own valuation.
  let holding: Study["holding"] = null;
  if (held && held.price !== null && c.book) {
    const w = weightsFor(c.book, m, contextFor(c.book, today, m)).weights.find((x) => x.symbol === held!.symbol.toUpperCase());
    const cap = w?.cap ?? capOf(capsFor(m), w?.classId ?? null);
    holding = { price: held.price, currency: held.currency, quantity: w ? w.holdings.reduce((s, x) => s + x.quantity, 0) : held.quantity, weightPct: w?.weight ?? 0, capPct: cap?.cap ?? null, classLabel: w?.classId ? w.classLabel : null, ownValuation: held.record?.ownValuation ?? null };
  }
  const markets = (c.book?.markets?.rows ?? []).map((r) => ({ name: r.name.slice(0, 60), value: formatUnit(r.level, r.unit === "pct" ? "pct" : r.unit === "ratio" ? "ratio" : "number", c.baseCurrency).slice(0, 40), asOf: r.asOf }));
  return studySchema.parse({
    ...study,
    ticker,
    status: "running",
    touchedAt: new Date().toISOString(),
    facts,
    factsNote,
    fundamentals,
    fundamentalsNotes: notes.slice(0, 30),
    holding,
    markets: markets.slice(0, 20),
    table,
    verdict: {
      classId: verdict.classId,
      classLabel: verdict.classLabel,
      checks: verdict.checks.map((c) => ({ ruleId: c.rule.id, section: c.rule.section, text: c.rule.text, severity: c.rule.severity, status: c.status, actual: c.actual, limit: c.limit, detail: c.detail, figure: c.figure })),
      classTests: verdict.classTests,
    },
  });
}

export type ResultsStudyRun = { queued: number; ran: number; laid: number; sentence: string | null };

/**
 * A study at every post-earnings report (Hamza, 27 Oct 2026): the report
 * owed one gets a study on the person's template and key
 * (`resultsStudyDue`), the study queued for results that is waiting or was
 * cut short is written (one per run, so a run never holds a page or a cron
 * for long), and a finished study is laid on the company's newest report,
 * whose decks are then made again with its sections: competition, what
 * customers and staff say, moats, valuation, SWOT and the questions. Run by
 * the morning refresh and on opening the app, after the results are read.
 * Nothing happens without a methodology, a model and the SEC contact. The log
 * gets counts, never a symbol.
 */
export async function resultsStudiesInto(vault: Vault, now: Date = new Date()): Promise<ResultsStudyRun | null> {
  const { setupSchema } = await import("@/lib/setup");
  const { DEFAULT_PREFERENCES, preferencesSchema } = await import("@/lib/preferences");
  const { earningsFileSchema, resultsStudyDue, resultsStudyQuestion, withStudiesOnReports } = await import("@/lib/earnings");
  const [setup, earnings, research, hostedAi, preferences] = await Promise.all([
    vault.readJson("setup", setupSchema).catch(() => null),
    vault.readJson("earnings", earningsFileSchema).catch(() => null),
    vault.readJson("research", researchFileSchema).catch(() => null),
    providerFor(vault),
    vault.readJson("preferences", preferencesSchema).catch(() => null),
  ]);
  const m = setup?.methodology ?? null;
  const contact = (preferences ?? DEFAULT_PREFERENCES).edgarContact ?? null;
  if (!m || !earnings?.reports.length || !hostedAi || !contact) return null;
  const iso = () => new Date().toISOString();
  let file = research ?? EMPTY_RESEARCH;
  const due = resultsStudyDue(earnings.reports, file.studies, localDay(now));
  const c: StudyContext = { m, contact, book: await studyBook(vault, setup!.baseCurrency, m, now), baseCurrency: setup!.baseCurrency };
  let queued = 0;
  if (due) {
    await queueStudy(c, vault, due.symbol, resultsStudyQuestion(due), iso(), due.date);
    queued = 1;
    file = (await vault.readJson("research", researchFileSchema)) ?? file;
  }
  // The study queued for results that has not started, whose run ended before it finished, or that stopped on a failure some hours ago, within RETRY_DAYS of being asked.
  const next = studyToTakeUp(file.studies, iso());
  let ran = 0;
  if (next) {
    // Touched first, so a second instance opening the app at the same moment leaves it alone.
    await vault.writeJson("research", replaceStudy(file, studySchema.parse({ ...next, status: "running", error: null, touchedAt: iso(), finishedAt: null }), iso()));
    await runStudy(c, vault, next.id);
    ran = 1;
    file = (await vault.readJson("research", researchFileSchema)) ?? file;
  }
  const laid = withStudiesOnReports(earnings, file.studies, iso());
  if (laid.laid) {
    // The study's words written into the deck's own (lib/deck-brief.ts) before the decks are made again.
    const { keepDecksInto } = await import("@/lib/earnings-run");
    const { withBriefs } = await import("@/lib/earnings-call-run");
    const { thesesFileSchema } = await import("@/lib/theses");
    const theses = await vault.readJson("theses", thesesFileSchema).catch(() => null);
    const briefed = (await withBriefs(laid.file, file.studies, theses, hostedAi, localDay(now), now)).file;
    await vault.writeJson("earnings", earningsFileSchema.parse((await keepDecksInto(vault, briefed, m.name, now)) ?? briefed));
  }
  if (!queued && !ran && !laid.laid) return null;
  console.info(`[research] results studies: queued ${queued}, written ${ran}, laid ${laid.laid}`);
  const sentence = [queued ? "A study was queued for the latest results." : null, ran ? "A results study was written with the AI." : null, laid.laid ? `${laid.laid} report${laid.laid === 1 ? "" : "s"} now carr${laid.laid === 1 ? "ies" : "y"} its study, and the decks are made again.` : null].filter(Boolean).join(" ");
  return { queued, ran, laid: laid.laid, sentence: sentence || null };
}

/** The book as the earnings run composes it, so a study of a holding knows its price, weight and cap. */
async function studyBook(vault: Vault, base: string, m: Methodology, now: Date): Promise<Book | null> {
  const [{ bookSchema }, { statementsFileSchema, withStatements }, { brokersFileSchema, withBrokers }, { composeBook }, { filingsFileSchema }, { EMPTY_MARKETS }, prefs] = await Promise.all([import("@/lib/holdings"), import("@/lib/statements"), import("@/lib/brokers"), import("@/lib/compose-book"), import("@/lib/filings"), import("@/lib/markets"), import("@/lib/preferences")]);
  const today = localDay(now);
  const [fileBook, records, statements, brokers, filings] = await Promise.all([
    vault.readJson("book", bookSchema).catch(() => null),
    vault.readJson("records", prefs.recordsSchema).catch(() => null),
    vault.readJson("statements", statementsFileSchema).catch(() => null),
    vault.readJson("brokers", brokersFileSchema).catch(() => null),
    vault.readJson("filings", filingsFileSchema).catch(() => null),
  ]);
  const raw = withBrokers(withStatements(fileBook, statements, base, today).book, brokers, base, today).book;
  return composeBook(raw, { records: records ?? prefs.EMPTY_RECORDS, filings, research: null, markets: EMPTY_MARKETS, methodology: m });
}

// ---------------------------------------------------------------------------
// Written by the person's own Claude (write_study, Hamza, 9 Nov 2026)

/**
 * The studies the person's Claude may write, each with its brief: a queued
 * one first has its figures read and its checks run here, as the app's own
 * run does before any prose, so the brief carries them. Nothing is written
 * on the deployment's model.
 */
export async function studiesToWrite(c: StudyContext, v: Vault, id: string | null): Promise<{ study: Study; brief: string }[]> {
  const file = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
  const out: { study: Study; brief: string }[] = [];
  for (const s of writableStudies(file.studies).filter((x) => !id || x.id === id).slice(0, id ? 1 : 3)) {
    let study = s;
    if (study.verdict === null) {
      study = await verdictOf(c, c.m, study);
      const now = new Date().toISOString();
      const latest = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
      await v.writeJson("research", replaceStudy(latest, study, now));
    }
    out.push({ study, brief: studyBrief(c.m, study) });
  }
  return out;
}

/** Keeps the sections Claude wrote that pass the figures check; the study is done once none is left to write. */
export async function writeStudySectionsInto(c: StudyContext, v: Vault, id: string, written: readonly { id: string; markdown: string }[]): Promise<{ study: Study; check: SectionCheck }> {
  const file = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
  const study = file.studies.find((s) => s.id === id);
  if (!study) throw new SyncError(`There is no study ${id}. get_studies_to_write lists the ones waiting.`, "study write unknown");
  if (study.verdict === null) throw new SyncError("The app has not read this study's figures yet. Call get_studies_to_write with its id first; it reads them.", "study write before verdict");
  if (!study.pending.length || study.status === "done") throw new SyncError("That study is already written.", "study write done");
  const check = checkSections(study, studyBrief(c.m, study), written);
  const now = new Date().toISOString();
  const next = Object.keys(check.kept).length ? afterStep(study, check.kept, now) : study;
  if (next !== study) await v.writeJson("research", replaceStudy(file, next, now));
  return { study: next, check };
}
