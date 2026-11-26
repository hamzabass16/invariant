import { headers } from "next/headers";

import { brokersState, filingsState, ibkrState, methodologyState, modelState, morningState, newslettersState, podcastsState, statementsState, thesesState, bookLine, type BrokersProps, type FilingsProps, type IbkrProps, type Line, type MethodologyProps, type ModelProps, type MorningProps, type NewslettersProps, type PodcastsProps, type StatementsProps, type ThesesProps } from "@/components/setup/input-cards";
import type { OverviewItem } from "@/components/setup/overview";
import { connectionsSchema, describeSync, summarizeFlex, summarizeKeys } from "@/lib/connections";
import { filingsSummary, readableSymbols } from "@/lib/filings";
import { MCP_PATH } from "@/lib/mcp-auth";
import { originOf } from "@/lib/mcp-run";
import { enrolment, registryAvailable } from "@/lib/registry";
import type { InputId } from "@/lib/setup";
import { thesesSubjects, thesisFor } from "@/lib/theses";
import { localDay, daysBetween, shortDate } from "@/lib/time";
import { confirmationOf } from "@/lib/inbox";
import { recapNewslettersFor } from "@/lib/market-recap";
import { backfillPrompt, filterSenders, forwardingProof, keptSenders } from "@/lib/newsletters";
import { sharedRecapOn } from "@/lib/shared-recap-run";
import { forwardingFor, newsletterSendersFor, newslettersAddress, newslettersFor, podcastsFor, SAMPLE_LABEL, statementsAddress, thesesFor, type Workspace } from "@/lib/workspace";

/** The kept connections (never a token or key), and the enrolment that runs the morning refresh. */
async function connectionState(ws: Workspace) {
  if (ws.mode !== "drive" || !ws.setup || ws.error) return { flex: null, keys: { snaptrade: null, etoro: null }, scheduled: null };
  const { openVault } = await import("@/lib/vault");
  const v = await openVault();
  const [connections, enrolled] = await Promise.all([v.readJson("connections", connectionsSchema).catch(() => null), registryAvailable() ? enrolment(ws.operator.email).catch(() => null) : Promise.resolve(null)]);
  return { flex: summarizeFlex(connections), keys: summarizeKeys(connections), scheduled: enrolled ? (enrolled.schedule.cadence === "none" ? ("none" as const) : ("reviews" as const)) : null };
}

/** This month's AI use against the person's cap (their plan's, else the deployment's), from the meter (lib/model-meter.ts); null spent when it cannot be read. */
async function aiUse(ws: Workspace): Promise<{ spent: number | null; cap: number }> {
  const { meterKey, monthlyCap, spentThisMonth } = await import("@/lib/model-meter");
  if (ws.mode !== "drive" || !ws.provider) return { spent: null, cap: monthlyCap() };
  const own = await (await import("@/lib/beta-run")).capFor(ws.operator.email).catch(() => null);
  return { spent: await spentThisMonth(meterKey(ws.operator.email)).catch(() => null), cap: own ?? monthlyCap() };
}

const note = (s: string | null | undefined, fallback: string) => (s ? s.replace(/\.$/, "") : fallback);

export type SetupData = Awaited<ReturnType<typeof setupData>>;

/**
 * Everything Setup's cards say, read once: what the app holds for each
 * input, since when, and the row at the top. Welcome's second part draws
 * the same cards from the same reading, so the first telling and the place
 * it is changed later never disagree.
 */
export async function setupData(ws: Workspace & { setup: NonNullable<Workspace["setup"]> }, sp: { connected?: string } = {}) {
  const setup = ws.setup;
  const demo = ws.mode === "demo";
  const book = ws.fullBook ?? ws.book;
  const [conn, theses, newsletters, senders, forwarding, podcasts] = await Promise.all([connectionState(ws), thesesFor(ws), newslettersFor(ws), newsletterSendersFor(ws), forwardingFor(ws), podcastsFor(ws)]);
  const lines: Line[] = describeSync(ws.sync);
  const registry = registryAvailable();
  const has = (i: InputId) => setup.inputs.includes(i);
  const flexStep = ws.sync?.steps.find((s) => s.source === "ibkr_flex");
  const helper = setup.helperName ?? "The person who runs Invariant";
  const docs = ws.statements.documents;
  const equities = book ? readableSymbols(book).length : 0;
  const url = `${originOf(await headers())}${MCP_PATH}`;
  const today = localDay();

  const methodology: MethodologyProps = { m: setup.methodology, draft: ws.draft, demo, hasModel: ws.hasModelKey, mode: ws.portfolios.mode, profile: setup.profile, sampleLabel: SAMPLE_LABEL[setup.profile] };
  const model: ModelProps = { provider: ws.provider, demo, ownClaude: ws.askClaude, ...(await aiUse(ws)) };
  const showIbkr = has("ibkr") || !!conn.flex || !!bookLine(book, "ibkr");
  const ibkr: IbkrProps = { book, flex: conn.flex, lines, notes: ws.bookNotes, updated: ws.bookUpdated, fetched: !!flexStep && flexStep.outcome === "ok" && !!ws.bookUpdated && Math.abs(Date.parse(flexStep.at) - Date.parse(ws.bookUpdated)) < 10 * 60_000, demo, registry };
  const brokers: BrokersProps = { book, snaptrade: conn.keys.snaptrade, etoro: conn.keys.etoro, showSnapTrade: demo || !!conn.keys.snaptrade || has("schwab") || has("other_broker"), showEtoro: demo || !!conn.keys.etoro || has("etoro"), connected: sp.connected === "snaptrade", lines, demo };
  // The demo shows every way in, so the tour can point at each.
  const showStatements = demo || has("bank_statements") || has("fund_reports");
  const statements: StatementsProps = { inbox: statementsAddress(ws.operator.email), helper, applied: docs.filter((d) => d.status === "applied").length, waiting: docs.filter((d) => d.status === "review").length, line: lines.find((l) => l.source === "statements_inbox") ?? null, banks: demo || has("bank_statements"), funds: demo || has("fund_reports"), demo };
  const filings: FilingsProps = { summary: filingsSummary(ws.filings), equities, contact: ws.preferences.edgarContact?.address ?? null, demo, defaultAddress: ws.operator.email, line: lines.find((l) => l.source === "filings") ?? null };
  const morning: MorningProps = { lines, scheduled: conn.scheduled, registry, demo };
  const realEstate = book?.holdings.filter((h) => h.assetClass === "real_estate").length ?? 0;
  const otherAssets = book?.holdings.filter((h) => h.assetClass === "other").length ?? 0;

  // Each listed holding's folder: the thesis in the person's words and their own bear, base and bull.
  const folders: ThesesProps["folders"] = thesesSubjects(book?.holdings ?? [], theses.file)
    .filter((s) => s.held)
    .map((s) => {
      const holding = book?.holdings.find((h) => h.symbol.toUpperCase() === s.symbol) ?? null;
      const key = Object.keys(ws.records.bySymbol).find((k) => k.toUpperCase() === s.symbol);
      const own = key ? ws.records.bySymbol[key]?.ownValuation ?? null : null;
      const t = thesisFor(theses.file, s.symbol);
      return { symbol: s.symbol, name: s.name, text: t?.text ?? "", written: t ? t.updatedAt.slice(0, 10) : null, valuation: own ? { low: own.low, base: own.base, high: own.high, asOf: own.asOf } : null, price: holding?.price ?? null, currency: holding?.currency ?? null };
    });
  const thesesProps: ThesesProps = { folders, error: theses.error, demo };

  const read = newsletters.file.digests.filter((d) => d.status === "read");
  // The Newsletters page's setup, folded into Setup's card (Hamza, 19 Oct 2026: At the Close already shows the newsletters).
  const lettersAddress = newslettersAddress(ws.operator.email);
  const confirmation = confirmationOf(forwarding, "newsletters");
  const newslettersProps: NewslettersProps = {
    address: lettersAddress,
    proof: forwardingProof(newsletters.file),
    kept: confirmation ? { confirmedAt: confirmation.confirmedAt, how: confirmation.how } : null,
    senders,
    // The recap comes through the same filter, so its last week is forwarded with the rest (Hamza, 20 Oct 2026).
    backfill: backfillPrompt(
      lettersAddress,
      filterSenders(
        keptSenders(senders.file).map((k) => k.address),
        ws.preferences.recap.newsletter ? recapNewslettersFor(demo).map((n) => n.sender) : [],
      ),
    ),
    sharedOn: sharedRecapOn(ws.operator.email) || demo,
    helper,
    month: read.filter((d) => daysBetween(d.receivedAt.slice(0, 10), today) < 30).length,
    lastRead: read[0]?.receivedAt.slice(0, 10) ?? null,
    recap: ws.preferences.recap,
    hasModel: ws.hasModelKey,
    error: newsletters.error,
    demo,
  };

  // The shows followed on podscripts.co and what was written up (Hamza, 20 Oct 2026).
  const followed = new Set(podcasts.file.shows.map((s) => s.slug));
  const episodes = podcasts.file.episodes.filter((e) => followed.has(e.show));
  const written = episodes.filter((e) => e.status === "read" && daysBetween(e.date, today) < 30);
  const podcastsProps: PodcastsProps = {
    shows: podcasts.file.shows,
    month: written.length,
    lastDate: written.reduce<string | null>((m, e) => (!m || e.date > m ? e.date : m), null),
    failed: episodes.filter((e) => e.status === "failed").length,
    hasModel: ws.hasModelKey,
    error: podcasts.error,
    demo,
  };

  const overview: OverviewItem[] = [
    { id: "methodology", label: "Methodology", state: methodologyState(methodology), note: ws.draft ? "Draft to confirm" : note(setup.methodology?.name, "Not chosen") },
    { id: "model", label: "AI", state: modelState(model), note: demo ? "Not used in the demo" : ws.provider ? (model.spent !== null ? `$${model.spent.toFixed(2)} of $${model.cap} this month` : "Run by Invariant") : "Not set up here" },
    { id: "theses", label: "Theses", state: thesesState(thesesProps), note: folders.length ? `${folders.filter((f) => f.text.trim()).length} of ${folders.length} written` : "No listed equity" },
    ...(showIbkr ? [{ id: "ibkr", label: "Interactive Brokers", state: ibkrState(ibkr), note: book && bookLine(book, "ibkr") ? `As of ${shortDate(book.asOf)}${conn.flex ? " · daily" : ""}` : "No statement" }] : []),
    ...(brokers.showSnapTrade || brokers.showEtoro ? [{ id: "brokers", label: "Other brokers", state: brokersState(brokers), note: demo ? "Your own free keys" : conn.keys.snaptrade || conn.keys.etoro ? "Key kept" : "No key yet" }] : []),
    ...(showStatements ? [{ id: "statements", label: "Statements by email", state: statementsState(statements), note: demo ? "Forwarded PDFs" : statements.applied ? `${statements.applied} in use` : "None yet" }] : []),
    ...(has("property") ? [{ id: "property", label: "Real estate", state: (realEstate ? "in_use" : "missing") as OverviewItem["state"], note: realEstate ? `${realEstate} on file` : "None yet" }] : []),
    ...(has("other_assets") ? [{ id: "other-assets", label: "Other assets", state: (otherAssets ? "in_use" : "missing") as OverviewItem["state"], note: otherAssets ? `${otherAssets} on file` : "None yet" }] : []),
    { id: "filings", label: "Company filings", state: filingsState(filings), note: ws.filings ? `Read ${shortDate(ws.filings.updated.slice(0, 10))}` : equities ? "Not read yet" : "No listed equity" },
    { id: "refresh", label: "Every morning", state: morningState(morning), note: demo ? "Not in the demo" : conn.scheduled ? "On, 06:00 UTC" : registry ? "Off" : "No schedule store" },
    { id: "newsletters", label: "Newsletters", state: newslettersState(newslettersProps), note: demo ? "Forwarded, read with the AI" : newslettersProps.month ? `${newslettersProps.month} this month` : newslettersProps.address ? "None yet" : "No inbox yet" },
    { id: "podcasts", label: "Podcasts", state: podcastsState(podcastsProps), note: podcastsProps.shows.length ? `${podcastsProps.shows.length === 1 ? "1 show" : `${podcastsProps.shows.length} shows`}${podcastsProps.month ? `, ${podcastsProps.month} this month` : ""}` : "No show" },
    { id: "portfolios", label: "Portfolios", state: ws.portfolios.items.length > 1 ? "in_use" : "optional", note: ws.portfolios.items.length > 1 ? `${ws.portfolios.items.length} portfolios` : "One for everything" },
    { id: "claude", label: "Your own Claude", state: "optional", note: "Optional connector" },
  ];

  return { setup, demo, book, conn, lines, registry, has, helper, url, methodology, model, showIbkr, ibkr, brokers, showStatements, statements, filings, morning, realEstate, otherAssets, theses: thesesProps, newsletters: newslettersProps, podcasts: podcastsProps, overview };
}
