import "server-only";

import { brokerCopySchema, brokersFileSchema, currenciesOf, describeCopy, withBrokers, withCopy, type BrokerSource, type BrokersFile } from "@/lib/brokers";
import { connectionsSchema, flexEveningDue, mergeSync, syncDue, syncStatusSchema, type SyncStatus, type SyncStep } from "@/lib/connections";
import { readableSymbols } from "@/lib/filings";
import { benchmarksFileSchema, LOOK_THROUGH_FUNDS, lookThroughFields, REFRESH_HOURS } from "@/lib/look-through";
import { bookSchema, keepHistory, type Book } from "@/lib/holdings";
import { bookFromFlex, describeBook } from "@/lib/import-book";
import { preferencesSchema } from "@/lib/preferences";
import type { InboxSession } from "@/lib/inbox-mail";
import { enrolments, type ScheduledEnrolment } from "@/lib/registry";
import { INPUTS, setupSchema } from "@/lib/setup";
import { SyncError } from "@/lib/sync-error";
import { vaultForEnrolment, type Vault } from "@/lib/vault";
import { enterZone } from "@/lib/zone";

/**
 * The morning refresh: for each person, the IBKR Flex statement through the
 * Flex Web Service with their own token, then the brokers they connected with
 * their own SnapTrade and eToro keys, then the statements they forwarded
 * to the statements inbox (read on their own model key), then the reports
 * after the results of the companies on their Earnings calendar, then every
 * listed holding's SEC filings with the contact they confirmed. Read-only toward
 * IBKR, the inbox and the SEC; the only writes are to their own vault.
 *
 * A source that fails keeps its last good copy: a statement that cannot be
 * fetched or read never replaces the book, and a filing that cannot be read
 * never replaces the last good one; the data the person added themselves is
 * read on its own schedule (lib/custom-data-run.ts). Each source's outcome is a sentence in
 * the vault's sync file, which Setup shows.
 */

const KEPT = " The figures from the last fetch or upload stay.";

/** The statements inbox for one person: the session the run opened (null when the inbox is not set up), or why it could not be opened. */
export type InboxAccess = { email: string; session: InboxSession | null; problem: string | null };

/** Refreshes one vault. `how` is "morning" for the cron and "by hand" for Fetch now on Setup. Returns null when the person has nothing to refresh. */
export async function syncVault(vault: Vault, now: Date, how: SyncStatus["how"], inbox: InboxAccess | null = null, brokersOnly = false): Promise<SyncStatus | null> {
  const [connections, rawBook, preferences, prev, setup] = await Promise.all([
    vault.readJson("connections", connectionsSchema),
    vault.readJson("book", bookSchema),
    vault.readJson("preferences", preferencesSchema),
    vault.readJson("sync", syncStatusSchema).catch(() => null),
    vault.readJson("setup", setupSchema).catch(() => null),
  ]);
  const steps: SyncStep[] = [];
  let book: Book | null = rawBook;
  const at = () => new Date().toISOString();

  if (connections?.ibkrFlex) {
    try {
      const { fetchFlexXml } = await import("@/lib/ibkr-flex");
      const imported = bookFromFlex(await fetchFlexXml(connections.ibkrFlex), "IBKR");
      const kept = keepHistory(rawBook, imported.book);
      await vault.writeJson("book", bookSchema.parse(kept));
      await vault.writeJson("book_notes", { notes: imported.notes.slice(0, 10).map((n) => n.slice(0, 300)), updated: at() });
      book = kept;
      steps.push({ source: "ibkr_flex", outcome: "ok", sentence: `Fetched: ${describeBook(imported.book)}`, at: at() });
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[sync] flex: ${e.logDetail ?? "failed"}`);
      steps.push({ source: "ibkr_flex", outcome: "failed", sentence: `${e.message}${KEPT}`.slice(0, 400), at: at() });
    }
  }

  // The brokers read through the person's own keys: each fetch that succeeds replaces that broker's copy; one that fails keeps it.
  const keyed: { source: BrokerSource; run: () => Promise<{ accounts: string[]; holdings: Book["holdings"]; notes: string[] }> }[] = [];
  const today = now.toISOString().slice(0, 10);
  if (connections?.snaptrade) {
    const conn = connections.snaptrade;
    keyed.push({ source: "snaptrade", run: async () => (await import("@/lib/snaptrade-api")).fetchSnapTrade(conn, today) });
  }
  if (connections?.etoro) {
    const conn = connections.etoro;
    keyed.push({ source: "etoro", run: async () => (await import("@/lib/etoro-api")).fetchEtoro(conn, today) });
  }
  let brokers: BrokersFile | null = await vault.readJson("brokers", brokersFileSchema).catch(() => null);
  const base = setup?.baseCurrency ?? book?.fx.base ?? "USD";
  if (keyed.length) {
    let file = brokers;
    let changed = false;
    for (const k of keyed) {
      try {
        const got = await k.run();
        const { loadFxRates } = await import("@/lib/markets-feed");
        const fx = await loadFxRates(currenciesOf(got.holdings, base), base, today);
        const copy = brokerCopySchema.parse({ fetchedAt: at(), asOf: today, accounts: got.accounts, holdings: got.holdings, base, rates: fx.rates, notes: [...got.notes, ...fx.problems].slice(0, 10).map((n) => n.slice(0, 300)) });
        file = withCopy(file, k.source, copy);
        changed = true;
        steps.push({ source: k.source, outcome: got.notes.length ? "failed" : "ok", sentence: `Fetched: ${describeCopy(copy)}`, at: at() });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[sync] ${k.source}: ${e.logDetail ?? "failed"}`);
        steps.push({ source: k.source, outcome: "failed", sentence: `${e.message}${KEPT}`.slice(0, 400), at: at() });
      }
    }
    if (changed && file) await vault.writeJson("brokers", brokersFileSchema.parse(file));
    brokers = file;
  }
  // Fetch now reads the money alone (Hamza, 7 Nov 2026: the whole refresh ran past the button's five minutes); the rest is the morning's and opening the app's.
  if (brokersOnly) {
    if (!steps.length) return null;
    const status = mergeSync(prev, steps, now, how);
    await vault.writeJson("sync", status);
    return status;
  }

  // The filings below are read for the brokers' listed holdings too.
  book = withBrokers(book, brokers, base, today).book;

  // Only someone who sends statements by email is read from the inbox, so a closed inbox never shows on anyone else's Setup.
  const byEmail = setup?.inputs.some((i) => INPUTS[i].group === "email") ?? false;
  if (inbox && byEmail && (inbox.session || inbox.problem)) {
    if (!inbox.session) steps.push({ source: "statements_inbox", outcome: "failed", sentence: (inbox.problem ?? "The statements inbox could not be opened.").slice(0, 400), at: at() });
    else {
      try {
        const { readInboxInto } = await import("@/lib/inbox-run");
        const run = await readInboxInto(vault, inbox.email, inbox.session, now);
        if (run) steps.push({ source: "statements_inbox", outcome: run.failed ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[sync] inbox: ${e.logDetail ?? "failed"}`);
        steps.push({ source: "statements_inbox", outcome: "failed", sentence: e.message.slice(0, 400), at: at() });
      }
    }
  }

  // Gmail's forwarding request, when one came in the last days, confirmed by itself (Hamza, 17 Oct 2026): the person added their address in Gmail and has nothing to type.
  if (inbox?.session) {
    try {
      const { confirmForwardingInto } = await import("@/lib/inbox-run");
      await confirmForwardingInto(vault, inbox.email, inbox.session, new Date(now.getTime() - 3 * 86_400_000).toISOString(), now);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[sync] forwarding: ${e.logDetail ?? "failed"}`);
    }
  }

  // The recap newsletter the app itself subscribes to, for anyone who shows it (Hamza, 18 Oct 2026): read once from the app's inbox, laid into this vault on their key.
  // The operator's alone since 20 Oct 2026: everyone else subscribes with their own newsletters address.
  if (inbox?.session && (preferences?.recap.newsletter ?? true) && (await import("@/lib/shared-recap-run")).sharedRecapOn(inbox.email)) {
    try {
      const { loadSharedRecaps } = await import("@/lib/shared-recap-run");
      const { closedBy } = await import("@/lib/market-day");
      const shared = await loadSharedRecaps(closedBy(now));
      if (shared.issues.length) {
        const { laySharedRecapsInto } = await import("@/lib/inbox-run");
        const lay = await laySharedRecapsInto(vault, shared.issues, now);
        if (lay.laid || lay.failed) steps.push({ source: "newsletters_inbox", outcome: lay.failed ? "failed" : "ok", sentence: `${lay.laid} issue${lay.laid === 1 ? "" : "s"} of the shared recap laid on your newsletters${lay.failed ? `, ${lay.failed} not read with the AI` : ""}.`, at: at() });
      } else if (shared.problem) steps.push({ source: "newsletters_inbox", outcome: "failed", sentence: shared.problem.slice(0, 400), at: at() });
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[sync] shared recap: ${e.logDetail ?? "failed"}`);
    }
  }

  // Newsletters, for anyone who forwards them: a run that finds none for this person adds no line to their Setup.
  if (inbox?.session) {
    try {
      const { readNewslettersInto } = await import("@/lib/inbox-run");
      const run = await readNewslettersInto(vault, inbox.email, inbox.session, now);
      if (run) steps.push({ source: "newsletters_inbox", outcome: run.failed ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[sync] newsletters: ${e.logDetail ?? "failed"}`);
      steps.push({ source: "newsletters_inbox", outcome: "failed", sentence: e.message.slice(0, 400), at: at() });
    }
  }

  // The reports after the results, before the filings are read again, so each report's class before the results is the one the last figures gave.
  try {
    const { readEarningsInto } = await import("@/lib/earnings-run");
    const run = await readEarningsInto(vault, now);
    if (run) steps.push({ source: "earnings", outcome: run.failed ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] earnings: ${e.logDetail ?? "failed"}`);
    steps.push({ source: "earnings", outcome: "failed", sentence: `${e.message} The last reports stay.`.slice(0, 400), at: at() });
  }

  // A study at every post-earnings report, on the AI, laid on the report's decks once written (Hamza, 27 Oct 2026).
  try {
    const { resultsStudiesInto } = await import("@/lib/study-run");
    const run = await resultsStudiesInto(vault, now);
    if (run?.sentence) {
      // One line per source on Setup: the study's sentence joins the results' own.
      const i = steps.findIndex((x) => x.source === "earnings");
      if (i >= 0) steps[i] = { ...steps[i], sentence: `${steps[i].sentence} ${run.sentence}`.slice(0, 400) };
      else steps.push({ source: "earnings", outcome: "ok", sentence: run.sentence.slice(0, 400), at: at() });
    }
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] results study: ${e.logDetail ?? "failed"}`);
  }

  // The daily planner on Opus first (Hamza, 4 Nov 2026): the order the Research Agent reads in, and a few runs outside the schedule. Without a plan the agents run as scheduled.
  try {
    const { planDayInto } = await import("@/lib/agents-run");
    await planDayInto(vault, now);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] planner: ${e.logDetail ?? "failed"}`);
  }

  // The Research Agent's company news, every company not read today, on the AI (Hamza, 23 Oct 2026).
  try {
    const { companyNewsResearchInto, RESEARCH_PER_MORNING } = await import("@/lib/research-agent-run");
    const run = await companyNewsResearchInto(vault, now, RESEARCH_PER_MORNING);
    if (run) steps.push({ source: "research", outcome: run.problem ? "skipped" : run.failed ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] research: ${e.logDetail ?? "failed"}`);
    steps.push({ source: "research", outcome: "failed", sentence: `${e.message} The last findings stay.`.slice(0, 400), at: at() });
  }

  // Then the lens agents on the day's findings, the agents the person built that are due, and the plan's runs outside the schedule (Hamza, 4 Nov 2026).
  try {
    const { lensReadingsInto, runCustomAgentsInto, runPlanExtrasInto } = await import("@/lib/agents-run");
    for (const run of [await lensReadingsInto(vault, now), await runCustomAgentsInto(vault, now), await runPlanExtrasInto(vault, now)]) {
      if (!run?.sentence) continue;
      const i = steps.findIndex((x) => x.source === "research");
      if (i >= 0) steps[i] = { ...steps[i], sentence: `${steps[i].sentence} ${run.sentence}`.slice(0, 400) };
      else steps.push({ source: "research", outcome: run.problem ? "skipped" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
    }
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] agents: ${e.logDetail ?? "failed"}`);
  }

  const contact = preferences?.edgarContact ?? null;
  if (book && readableSymbols(book).length) {
    if (!contact) steps.push({ source: "filings", outcome: "skipped", sentence: "Not read: confirm the contact the SEC will see on the Research screen.", at: at() });
    else {
      try {
        const { readFilingsInto } = await import("@/lib/filings-run");
        const run = await readFilingsInto(vault, book, contact, now);
        if (run.listError) steps.push({ source: "filings", outcome: "failed", sentence: `${run.listError} The last filings read stay.`.slice(0, 400), at: at() });
        else steps.push({ source: "filings", outcome: run.failed ? "failed" : "ok", sentence: run.failed ? `Read for ${run.read} holding${run.read === 1 ? "" : "s"}; ${run.failed} could not be read and keep their last good copy.` : `Read for ${run.read} holding${run.read === 1 ? "" : "s"}.`, at: at() });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[sync] filings: ${e.logDetail ?? "failed"}`);
        steps.push({ source: "filings", outcome: "failed", sentence: `${e.message} The last filings read stay.`.slice(0, 400), at: at() });
      }
    }
  }

  // SPY's and QQQ's companies, read again each morning for anyone whose methodology tests fundamentals the look-through can average; the shared figures make most of it a lookup.
  if (contact && lookThroughFields(setup?.methodology ?? null).length) {
    const kept = await vault.readJson("benchmarks", benchmarksFileSchema).catch(() => null);
    const age = kept?.updated ? (now.getTime() - Date.parse(kept.updated)) / 3_600_000 : Infinity;
    if (!(age < REFRESH_HOURS)) {
      try {
        const { readBenchmarksInto } = await import("@/lib/benchmarks-run");
        const run = await readBenchmarksInto(vault, contact, LOOK_THROUGH_FUNDS, now);
        const ok = run.funds.length > 0 && !run.problems.length;
        steps.push({ source: "benchmarks", outcome: ok ? "ok" : "failed", sentence: `${run.funds.length ? `Read ${run.funds.join(" and ")}: ${run.companies} companies${run.failed ? `, ${run.failed} not read` : ""}.` : "Neither fund could be read."}${run.problems.length ? ` ${run.problems.join(" ")}` : ""}`.slice(0, 400), at: at() });
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(`[sync] benchmarks: ${e.logDetail ?? "failed"}`);
        steps.push({ source: "benchmarks", outcome: "failed", sentence: `${e.message} The last copy stays.`.slice(0, 400), at: at() });
      }
    }
  }

  // The podcasts the person follows, new episodes written up on their own model (Hamza, 20 Oct 2026): a morning with nothing new adds no line.
  try {
    const { readPodcastsInto } = await import("@/lib/podcasts-run");
    const run = await readPodcastsInto(vault, inbox?.email ?? "", now);
    if (run) steps.push({ source: "podcasts", outcome: run.failed || run.problems.length ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] podcasts: ${e.logDetail ?? "failed"}`);
    steps.push({ source: "podcasts", outcome: "failed", sentence: `${e.message} The last write-ups stay.`.slice(0, 400), at: at() });
  }

  // The Calendar agent, the first morning of each month (a failed run tries again the next): a morning it is not due adds no line.
  try {
    const { findCalendarEventsInto } = await import("@/lib/calendar-agent-run");
    const run = await findCalendarEventsInto(vault, now);
    if (run) steps.push({ source: "calendar_agent", outcome: run.problem ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] calendar agent: ${e.logDetail ?? "failed"}`);
    steps.push({ source: "calendar_agent", outcome: "failed", sentence: `${e.message} The events found before stay.`.slice(0, 400), at: at() });
  }

  // The reports after the macro events the evening run missed (Hamza, 27 Oct 2026): a morning with nothing due adds no line.
  try {
    const { readMacroReportsInto } = await import("@/lib/macro-report-run");
    const run = await readMacroReportsInto(vault, now);
    if (run) steps.push({ source: "macro_reports", outcome: run.problem ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] event reports: ${e.logDetail ?? "failed"}`);
    steps.push({ source: "macro_reports", outcome: "failed", sentence: `${e.message} The reports kept before stay.`.slice(0, 400), at: at() });
  }

  // The data the person added themselves, each on its own schedule: a morning with nothing due adds no line.
  try {
    const { refreshData } = await import("@/lib/custom-data-run");
    const run = await refreshData(vault, now);
    if (run) steps.push({ source: "custom_data", outcome: run.failed ? "failed" : "ok", sentence: run.sentence.slice(0, 400), at: at() });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] custom data: ${e.logDetail ?? "failed"}`);
    steps.push({ source: "custom_data", outcome: "failed", sentence: `${e.message} The last readings stay.`.slice(0, 400), at: at() });
  }

  if (!steps.length) return null;
  const status = mergeSync(prev, steps, now, how);
  await vault.writeJson("sync", status);
  return status;
}

export type EveningFlex = "replaced" | "same" | "not-due" | "failed";

/**
 * The evening Flex fetch (Hamza, 17 Oct 2026): when the book on file is
 * older than the session that just closed, the statement is asked for
 * again with the person's own token, and replaces the book only when it is
 * newer than the one kept; the morning refresh still runs. A statement
 * IBKR has not made yet comes back as the one already on file and changes
 * nothing, so Setup keeps the morning's line. A fetch that fails keeps the
 * book and says so on Setup, as the morning's does.
 */
export async function fetchFlexEvening(vault: Vault, now: Date, session: string | null): Promise<{ outcome: EveningFlex; sentence: string | null }> {
  const [connections, book] = await Promise.all([vault.readJson("connections", connectionsSchema).catch(() => null), vault.readJson("book", bookSchema).catch(() => null)]);
  if (!connections?.ibkrFlex || !flexEveningDue(connections, book?.asOf ?? null, session)) return { outcome: "not-due", sentence: null };
  const at = new Date().toISOString();
  try {
    const { fetchFlexXml } = await import("@/lib/ibkr-flex");
    const imported = bookFromFlex(await fetchFlexXml(connections.ibkrFlex), "IBKR");
    if (book && !(imported.book.asOf > book.asOf)) return { outcome: "same", sentence: null };
    await vault.writeJson("book", bookSchema.parse(keepHistory(book, imported.book)));
    await vault.writeJson("book_notes", { notes: imported.notes.slice(0, 10).map((n) => n.slice(0, 300)), updated: at });
    const prev = await vault.readJson("sync", syncStatusSchema).catch(() => null);
    await vault.writeJson("sync", mergeSync(prev, [{ source: "ibkr_flex", outcome: "ok", sentence: `Fetched after the close: ${describeBook(imported.book)}`, at }], now, "evening"));
    return { outcome: "replaced", sentence: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[evening] flex: ${e.logDetail ?? "failed"}`);
    const prev = await vault.readJson("sync", syncStatusSchema).catch(() => null);
    await vault.writeJson("sync", mergeSync(prev, [{ source: "ibkr_flex", outcome: "failed", sentence: `${e.message}${KEPT}`.slice(0, 400), at }], now, "evening"));
    return { outcome: "failed", sentence: e.message };
  }
}

/**
 * Opening the app after a morning whose IBKR fetch failed asks again
 * (Hamza, 27 Oct 2026), rather than waiting for the evening run: the
 * evening's own fetch when the book is behind the last closed session, and
 * when IBKR has nothing newer yet, a line on Setup saying the fetch came back
 * so the next open does not ask again.
 */
export async function retryFlexOnOpen(vault: Vault, now: Date, session: string | null): Promise<EveningFlex> {
  const done = await fetchFlexEvening(vault, now, session);
  if (done.outcome === "same" || done.outcome === "not-due") {
    const prev = await vault.readJson("sync", syncStatusSchema).catch(() => null);
    if (prev?.steps.some((x) => x.source === "ibkr_flex" && x.outcome === "failed")) {
      await vault.writeJson("sync", mergeSync(prev, [{ source: "ibkr_flex", outcome: "ok", sentence: "Fetched again: Interactive Brokers has no newer statement yet.", at: new Date().toISOString() }], now, prev.how));
    }
  }
  return done.outcome;
}

export type SyncSummary = { checked: number; refreshed: number; failed: string[] };

/** One enrolment's morning refresh, when it has not had one today; the sentences of the steps that failed, or null when nothing was due. */
export async function morningSyncFor(e: ScheduledEnrolment, now: Date, inboxFor: (email: string) => Promise<InboxAccess>): Promise<{ refreshed: boolean; failed: string[] }> {
  const vault = await vaultForEnrolment(e);
  const prev = await vault.readJson("sync", syncStatusSchema).catch(() => null);
  if (!syncDue(prev, now)) return { refreshed: false, failed: [] };
  const status = await syncVault(vault, now, "morning", await inboxFor(e.email));
  if (!status) return { refreshed: false, failed: [] };
  // The Community card, when the person shares one, carries the morning's weights (Hamza, 19 Oct 2026).
  await (await import("@/lib/community-run")).republishQuietly(vault, e.email, now);
  return { refreshed: true, failed: status.steps.filter((s) => s.outcome === "failed" && s.at >= now.toISOString()).map((s) => s.sentence) };
}

/**
 * Every enrolled person whose vault has not had its morning refresh today,
 * one after another in this function (the scheduled run enqueues one job per
 * person instead, lib/jobs-run.ts). One person's failure never stops the
 * others; the log gets the scrubbed detail, never an address.
 */
export async function runMorningSync(now: Date = new Date()): Promise<SyncSummary> {
  const { rows } = await enrolments();
  const summary: SyncSummary = { checked: rows.length, refreshed: 0, failed: [] };
  // One inbox session for the whole run, opened only when someone is due.
  let opened: { session: InboxSession | null; problem: string | null } | null = null;
  const inboxFor = async (email: string): Promise<InboxAccess> => {
    if (!opened) opened = await openStatementsInbox();
    return { email, ...opened };
  };
  try {
    for (const e of rows) {
      enterZone(e.schedule.zone);
      try {
        const run = await morningSyncFor(e, now, inboxFor);
        if (run.refreshed) summary.refreshed += 1;
        summary.failed.push(...run.failed);
      } catch (err) {
        console.error(`[sync] one enrolment failed: ${err instanceof SyncError ? (err.logDetail ?? "failed") : "unexpected error"}`);
        summary.failed.push(err instanceof SyncError ? err.message : "A refresh could not run.");
      }
    }
  } finally {
    const o = opened as { session: InboxSession | null } | null;
    await o?.session?.close();
  }
  return summary;
}

/** Opens the statements inbox when the operator has set it up: a session, or the sentence saying why it could not be opened. */
export async function openStatementsInbox(): Promise<{ session: InboxSession | null; problem: string | null }> {
  const { inboxConfig, openInbox } = await import("@/lib/inbox-mail");
  const cfg = inboxConfig();
  if (!cfg) return { session: null, problem: null };
  try {
    return { session: await openInbox(cfg), problem: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[sync] inbox: ${e.logDetail ?? "failed"}`);
    return { session: null, problem: e.message };
  }
}
