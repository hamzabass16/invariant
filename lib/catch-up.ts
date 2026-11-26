import "server-only";

import { after } from "next/server";

import { withAgentLedger } from "@/lib/agent-ledger";
import { providerFor } from "@/lib/hosted-model";
import { filingsStale } from "@/lib/filings";
import { SyncError } from "@/lib/sync-error";
import type { Workspace } from "@/lib/workspace";
import { requestZone } from "@/lib/zone";

/** How often one person's open app looks again for results and filings, across every instance (`allow`, lib/rate-limit.ts). */
const EVERY_MS = 30 * 60 * 1000;
const lastLook = new Map<string, number>();
/** How often an open app looks in the inbox for the person's newsletters, per instance (Hamza, 23 Oct 2026: the recap should show within minutes of reaching their mail); the open page draws itself again every five minutes. */
const NEWS_EVERY_MS = 3 * 60 * 1000;
const lastNews = new Map<string, number>();

/**
 * The newsletters that reached the inbox since the last look, read on the
 * person's own key after the page is sent: the ones their Gmail forwarded,
 * and the shared recap's new issue for the operator. The page drawn after
 * it, by the five-minute refresh or the next screen, shows them.
 */
function newslettersOnOpen(ws: Workspace, now: number): void {
  const email = ws.operator.email;
  if (now - (lastNews.get(email) ?? 0) < NEWS_EVERY_MS) return;
  lastNews.set(email, now);
  const shared = ws.preferences.recap.newsletter;
  after(() => withAgentLedger(async () => (await import("@/lib/vault")).openVault(), async () => {
    const at = new Date();
    try {
      const { openVault } = await import("@/lib/vault");
      const vault = await openVault();
      if (shared) {
        const { loadSharedRecaps, sharedRecapOn } = await import("@/lib/shared-recap-run");
        if (sharedRecapOn(email)) {
          const { closedBy } = await import("@/lib/market-day");
          const read = await loadSharedRecaps(closedBy(at));
          if (read.issues.length) {
            const { laySharedRecapsInto } = await import("@/lib/inbox-run");
            await laySharedRecapsInto(vault, read.issues, at);
          }
        }
      }
      const { openStatementsInbox } = await import("@/lib/daily-sync");
      const { session } = await openStatementsInbox();
      if (!session) return;
      try {
        const { readNewslettersInto } = await import("@/lib/inbox-run");
        const run = await readNewslettersInto(vault, email, session, at);
        if (run?.read) console.info(`[catch-up] newsletters: ${run.read} read`);
      } finally {
        await session.close().catch(() => undefined);
      }
    } catch (e) {
      lastNews.delete(email);
      console.error(`[catch-up] newsletters: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
  }));
}

/** The refresh token last checked against the registry per person, on this instance, so a page load reads the registry only when the sign-in changed. */
const lastToken = new Map<string, string>();

/**
 * A fresh sign-in's token laid on the person's enrolment (Hamza, 22 Oct
 * 2026), so signing in again is enough to bring back the morning refresh,
 * the alerts, the screener and the reviews after Google ended the token they
 * ran on. Only when the session's token differs from the one last checked;
 * a failure is a log line and the next sign-in tries again.
 */
/** The zone each person's enrolment was last set to on this instance, so the registry is written only when it moves. */
const lastZone = new Map<string, string>();

/** Keeps the enrolment's schedule on the zone the browser reported (`pos_tz`), behind the page; the network's guess never moves it. */
function keepZoneOnOpen(email: string): void {
  const zone = requestZone();
  if (!zone || zone.from !== "browser" || lastZone.get(email) === zone.zone) return;
  lastZone.set(email, zone.zone);
  after(async () => {
    try {
      const { keepZone, registryAvailable } = await import("@/lib/registry");
      if (!registryAvailable()) return;
      if (await keepZone(email, zone.zone)) console.info("[catch-up] enrolment: zone kept");
    } catch (e) {
      lastZone.delete(email);
      console.error(`[catch-up] enrolment zone: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
  });
}

async function renewOnSignIn(email: string): Promise<void> {
  try {
    const { googleRefreshToken } = await import("@/lib/google-user");
    const { microsoftRefreshToken } = await import("@/lib/microsoft-user");
    const google = await googleRefreshToken();
    const refresh = google ?? (await microsoftRefreshToken());
    if (!refresh || lastToken.get(email) === refresh) return;
    const { registryAvailable, renewAccess } = await import("@/lib/registry");
    if (!registryAvailable()) return;
    lastToken.set(email, refresh);
    const renewed = await renewAccess(email, { provider: google ? "google" : "microsoft", refreshToken: refresh });
    if (renewed) console.info("[catch-up] enrolment: sign-in renewed");
  } catch (e) {
    lastToken.delete(email);
    console.error(`[catch-up] enrolment: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
  }
}

/**
 * What the scheduled runs read, caught up when the person opens the app, so
 * nothing waits on a button: the reports after any followed company's
 * results (lib/earnings-run.ts, which reads only what is due), the filings
 * when they are a day old or a new holding has none (lib/filings-run.ts),
 * the newsletters that reached the inbox, every three minutes at most
 * (`newslettersOnOpen`, above; Hamza, 23 Oct 2026), and, for someone who
 * chose the Claude recap, the last session's recap when none is written yet
 * (lib/market-recap-run.ts; after the close the session's read is waited
 * for, so After the close shows today's on the next open rather than at the
 * evening run; Hamza, 17 Oct 2026). It runs
 * after the page is sent, at most every half hour per person across every
 * instance, with the signed-in person's own vault; a report or recap
 * written is checked for alerts at once. The Community card the person
 * shares is rebuilt when their files moved since, and the changes to the
 * cards they follow are laid on their alerts at once (lib/community-run.ts;
 * Hamza, 19 Oct 2026), and one new episode of a podcast they follow is
 * written up (lib/podcasts-run.ts; Hamza, 20 Oct 2026), and one thesis due a
 * hunt is hunted (lib/thesis-hunter-run.ts; Hamza, 20 Oct 2026), a study
 * of the latest results is queued or written (lib/study-run.ts; Hamza,
 * 27 Oct 2026), the
 * Research Agent reads a few companies' news not read today
 * (lib/research-agent-run.ts; Hamza, 23 Oct 2026), and a few
 * of the screener's companies and the top funds due a look are read
 * (lib/screener-run.ts, lib/funds-run.ts; Hamza, 21 Oct 2026). A failure is a log line with no
 * symbol and never a page error; the next open tries again.
 */
export async function catchUpOnOpen(ws: Workspace): Promise<void> {
  if (ws.mode !== "drive" || !ws.setup) return;
  const book = ws.fullBook ?? ws.book;
  const key = ws.operator.email;
  await renewOnSignIn(key);
  keepZoneOnOpen(key);
  const now = Date.now();
  newslettersOnOpen(ws, now);
  if (now - (lastLook.get(key) ?? 0) < EVERY_MS) return;
  lastLook.set(key, now);
  // Once per half hour across every instance, not once per instance (docs/ARCHITECTURE.md §5.3): the instance's own note above spares the database on most pages.
  const { allow, limitKey } = await import("@/lib/rate-limit");
  if (!(await allow(limitKey("catch-up", key), 1, EVERY_MS / 1000))) return;
  const contact = ws.preferences.edgarContact ?? null;
  const filingsDue = !!book && !!contact && filingsStale(ws.filings, book, new Date(now));
  let vault;
  try {
    const { openVault } = await import("@/lib/vault");
    vault = await openVault();
  } catch {
    return;
  }
  const email = ws.operator.email;
  const recapDue = ws.preferences.recap.claude && ws.provider?.kind === "anthropic";
  const following = ws.preferences.following;
  const donate = ws.preferences.donate;
  const classes = !!ws.baseSetup?.methodology?.classes.length;
  const flexMissed = !!ws.sync?.steps.some((s) => s.source === "ibkr_flex" && s.outcome === "failed");
  // The companies read by the filings run, held first then watched: the ecosystem on opening takes the first with none.
  const ecoSymbols = Object.entries(ws.filings?.bySymbol ?? {}).filter(([, e]) => !e.error).map(([k]) => k);
  const opened = vault;
  // One ledger for the whole catch-up (lib/agent-ledger.ts): each agent's call gated and counted, the runs kept once at the end.
  after(() => withAgentLedger(async () => opened, async () => {
    const at = new Date();
    // A morning whose IBKR fetch failed is asked again on opening (Hamza, 27 Oct 2026), so the book does not wait for the evening run.
    if (flexMissed) {
      try {
        const { closedBy } = await import("@/lib/market-day");
        const { retryFlexOnOpen } = await import("@/lib/daily-sync");
        await retryFlexOnOpen(vault, at, closedBy(at));
      } catch (e) {
        console.error(`[catch-up] flex: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
      }
    }
    // The Community card kept in step, and the followed cards' changes as alerts (Hamza, 19 Oct 2026).
    try {
      const { catchUpCommunity, republishQuietly } = await import("@/lib/community-run");
      await republishQuietly(vault, email, at);
      await catchUpCommunity(vault, following, at);
      // Open data, for those who chose to give it (Hamza, 9 Nov 2026).
      if (donate) await (await import("@/lib/community-run")).donateQuietly(vault, email, at);
      // The club treasury and the family rules this person feeds (Hamza, 9 Nov 2026).
      await (await import("@/lib/community-run")).clubAndFamilyQuietly(vault, email, at);
    } catch (e) {
      console.error(`[catch-up] community: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    if (recapDue) {
      try {
        const { loadMarketDay } = await import("@/lib/markets-feed");
        const { recapsFileSchema, recapDue: due } = await import("@/lib/market-recap");
        const { day } = await loadMarketDay(at, "full");
        if (day && due(await vault.readJson("recaps", recapsFileSchema).catch(() => null), day.session)) {
          const { movesFor, writeRecapInto } = await import("@/lib/market-recap-run");
          const provider = await providerFor(vault);
          const recap = await writeRecapInto(vault, provider, day, at, await movesFor(vault, day, at), ws.preferences.moveAlertPct);
          if (recap.status === "written") {
            const { checkAlerts } = await import("@/lib/alerts-run");
            await checkAlerts(vault, email, at);
          }
        }
      } catch (e) {
        console.error(`[catch-up] recap: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
      }
    }
    // One new podcast episode written up per open, on the AI (Hamza, 20 Oct 2026); the morning refresh takes the rest.
    try {
      const { readPodcastsInto } = await import("@/lib/podcasts-run");
      await readPodcastsInto(vault, email, at, 1, ws);
    } catch (e) {
      console.error(`[catch-up] podcasts: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    // The Research Agent's company news for a few companies not read today (Hamza, 23 Oct 2026); the morning refresh takes the rest.
    try {
      const { companyNewsResearchInto, RESEARCH_ON_OPEN } = await import("@/lib/research-agent-run");
      await companyNewsResearchInto(vault, at, RESEARCH_ON_OPEN);
    } catch (e) {
      console.error(`[catch-up] research: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    // One thesis hunted per open when one's week is up, on the AI (Hamza, 20 Oct 2026); the daily run takes the rest.
    try {
      const { huntThesesInto } = await import("@/lib/thesis-hunter-run");
      await huntThesesInto(vault, at, 1);
    } catch (e) {
      console.error(`[catch-up] hunter: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    // The Calendar agent's monthly look three months ahead, on the person's own Claude key (Hamza, 27 Oct 2026); once a month, so an open in a month it has not looked at runs it.
    try {
      const { findCalendarEventsInto } = await import("@/lib/calendar-agent-run");
      await findCalendarEventsInto(vault, at);
    } catch (e) {
      console.error(`[catch-up] calendar agent: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    // The report after a macro event whose session has closed, written on opening when the evening and the morning missed it; emailed at once (Hamza, 27 Oct 2026).
    try {
      const { readMacroReportsInto } = await import("@/lib/macro-report-run");
      const run = await readMacroReportsInto(vault, at);
      if (run?.written) {
        const { checkAlerts } = await import("@/lib/alerts-run");
        await checkAlerts(vault, email, at);
      }
    } catch (e) {
      console.error(`[catch-up] event reports: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    try {
      const { readEarningsInto } = await import("@/lib/earnings-run");
      const run = await readEarningsInto(vault, at);
      if (run?.written) {
        const { checkAlerts } = await import("@/lib/alerts-run");
        await checkAlerts(vault, email, at);
      }
    } catch (e) {
      console.error(`[catch-up] earnings: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    // A study at every post-earnings report, one written per open on the AI, laid on the report's decks once done (Hamza, 27 Oct 2026).
    try {
      const { resultsStudiesInto } = await import("@/lib/study-run");
      await resultsStudiesInto(vault, at);
    } catch (e) {
      console.error(`[catch-up] results study: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
    // One held or watched company's ecosystem from its annual report, when it has none (Hamza, 21 Nov 2026); the 05:00 run reads the index for everyone.
    if (contact && ecoSymbols.length) {
      try {
        const { ecosystemOnOpen } = await import("@/lib/ecosystem-run");
        await ecosystemOnOpen(vault, ecoSymbols, contact, at);
      } catch (e) {
        console.error(`[catch-up] ecosystem: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
      }
    }
    // The screener's next few companies and the top funds due a look (Hamza, 21 Oct 2026); the 05:00 run takes the rest.
    if (contact) {
      try {
        const { readFundsInto } = await import("@/lib/funds-run");
        await readFundsInto(vault, contact, at, 8_000);
        if (classes) {
          const { SCREEN_ON_OPEN } = await import("@/lib/screener");
          const { readScreenerInto } = await import("@/lib/screener-run");
          await readScreenerInto(vault, contact, at, SCREEN_ON_OPEN, 15_000);
        }
      } catch (e) {
        console.error(`[catch-up] screener: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
      }
    }
    if (!filingsDue || !book || !contact) return;
    try {
      const { readFilingsInto } = await import("@/lib/filings-run");
      await readFilingsInto(vault, book, contact, at);
    } catch (e) {
      console.error(`[catch-up] filings: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
    }
  }));
}
