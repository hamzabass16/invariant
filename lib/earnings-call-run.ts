import "server-only";

import { briefDue, briefFailed, briefRequestBody, BRIEF_VERSION, deckBriefSchema, parseBriefResponse } from "@/lib/deck-brief";
import { EARNINGS_MODEL, releaseText, reportFacts, reportKey, symbolKey, type EarningsEntry, type EarningsFile, type EarningsReport } from "@/lib/earnings";
import { releaseDocuments } from "@/lib/edgar";
import type { EdgarContact } from "@/lib/preferences";
import { MODELS } from "@/lib/models";
import { callDue, callFromNotes, callKeyOf, callReadRequestBody, callWords, lensOf, lensTargets, lensWords, notesKey, notesOf, parseCallResponse, reportCallSchema, type ReportCall } from "@/lib/earnings-call";
import { flowAsks, flowKey, flowNotesDue, flowNotesFailed, flowNotesRequestBody, flowNotesSchema, FLOW_NOTES_VERSION, parseFlowNotes } from "@/lib/flow-notes";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import type { Study } from "@/lib/research";
import { SyncError } from "@/lib/sync-error";
import { addedSince, RESULTS_READ_DAYS, thesisFor, type ThesesFile } from "@/lib/theses";
import { daysBetween } from "@/lib/time";

/** Calls read on the person's model in one run, and briefs written; the rest follow on the next. */
const CALL_READS_PER_RUN = 1;
const BRIEFS_PER_RUN = 1;
const FLOW_NOTES_PER_RUN = 1;

/** The newest report per company with its results read, within RESULTS_READ_DAYS. */
function recent(file: EarningsFile, today: string): EarningsReport[] {
  const newest = new Map<string, EarningsReport>();
  for (const r of file.reports) {
    if (r.status !== "release" && r.status !== "complete") continue;
    const age = daysBetween(r.date, today);
    if (age < 0 || age > RESULTS_READ_DAYS) continue;
    const k = symbolKey(r.symbol);
    if (!newest.has(k) || newest.get(k)!.date < r.date) newest.set(k, r);
  }
  return [...newest.values()];
}

/** The report with its deck marked to be made again, its date left alone so its alert does not fire again. */
const remade = (r: EarningsReport): EarningsReport => ({ ...r, deck: r.deck ? { ...r.deck, at: "" } : null });

const put = (file: EarningsFile, r: EarningsReport): EarningsFile => ({ ...file, reports: file.reports.map((x) => (reportKey(x) === reportKey(r) ? r : x)) });

/**
 * The results call on each recent report (lib/earnings-call.ts): the
 * person's own Claude's reading when a note added to the thesis since the
 * results carries one, laid as written; else, once per set of notes, read on
 * the person's model from the notes and, the web. A new
 * reading marks the decks to be made again. The consensus EPS the calendar
 * gives is laid on a report kept before it was. The log gets counts, never a
 * symbol.
 */
export async function withCalls(file: EarningsFile, theses: ThesesFile | null, provider: ModelProvider | null, entries: readonly EarningsEntry[], today: string, now: Date, contact: EdgarContact | null = null): Promise<{ file: EarningsFile; changed: number }> {
  const at = now.toISOString();
  let out = file;
  let changed = 0;
  let reads = 0;
  for (const r0 of recent(file, today)) {
    let r = r0;
    if (r.consensusEps === null) {
      const e = entries.find((x) => symbolKey(x.symbol) === symbolKey(r.symbol) && x.date === r.date);
      if (e?.epsForecast !== null && e?.epsForecast !== undefined) r = { ...r, consensusEps: e.epsForecast, estimates: e.estimates };
    }
    const thesis = thesisFor(theses, r.symbol);
    const lens = lensOf(thesis, r.triggers);
    const notes = notesOf(addedSince(thesis, r.date));
    const key = notesKey(notes);
    let call: ReportCall | null | undefined;
    const written = callFromNotes(notes, lens, at);
    if (written) {
      if (r.call?.from !== "notes" || r.call.key !== key) call = written;
    } else if (callDue(r, key, at) && reads < CALL_READS_PER_RUN) {
      call = await readCall(r, lens, notes, key, provider, at, contact);
      if (call !== undefined) reads += 1;
      // A read again for its transcript that still finds no Q&A keeps the reading it had, with the time it looked.
      if (call && !call.qa.length && r.call?.from === "read" && r.call.key === key && callKeyOf(r.call)) call = { ...r.call, at };
    }
    if (call !== undefined) r = remade({ ...r, call });
    if (r !== r0) {
      out = put(out, r);
      changed += 1;
    }
  }
  if (reads || changed) console.info(`[earnings] calls: read ${reads}, laid ${changed}`);
  return { file: out, changed };
}

/** The call read on the person's model; undefined when the provider could not be reached, so it is asked again next run. */
async function readCall(r: EarningsReport, lens: ReturnType<typeof lensOf>, notes: ReturnType<typeof notesOf>, key: string, provider: ModelProvider | null, at: string, contact: EdgarContact | null): Promise<ReportCall | null | undefined> {
  const empty = (note: string) => reportCallSchema.parse({ guidance: [], qa: [], remarks: [], beats: [], from: "read", source: "", at, key, note: note.slice(0, 300) });
  if (!provider) return empty("The AI is not set up on this deployment yet, so the call is not read.");
  const web = !providerCannot(provider, "web_search");
  // From the SEC first (Hamza, 4 Nov 2026): the release's own exhibits from the SEC (the CFO commentary, prepared remarks or letter many companies file), and the transcript's page read whole.
  const documents = await releaseMaterial(r, contact);
  if (!web && !notes.length && !documents) return empty("The AI cannot search the web, and the company filed no remarks with its release, so the call is not read.");
  try {
    const model = modelFor(provider, EARNINGS_MODEL);
    const body = callReadRequestBody(r, reportFacts(r), lens, notes, model, web, { documents, fetch: (Object.values(MODELS) as string[]).includes(model) });
    const parsed = parseCallResponse(await callModel(provider, body as ModelRequest, { agent: "earnings_reaction", step: "call", subject: r.symbol }), lensTargets(lens));
    if (!parsed.ok) {
      console.error(`[earnings] call: ${parsed.reason}`);
      return empty("The reading of the call did not hold together; it is asked again tomorrow.");
    }
    const from = [notes.length ? "your notes" : null, documents ? "the release's filing" : null, web ? "the web" : null].filter(Boolean) as string[];
    const source = `The AI, from ${from.length > 1 ? `${from.slice(0, -1).join(", ")} and ${from.at(-1)}` : from[0]}`;
    return reportCallSchema.parse({ ...parsed.reading, from: "read", source, at, key, note: parsed.dropped ? `${parsed.dropped} item${parsed.dropped === 1 ? " was" : "s were"} left out for lacking a page.` : null });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[earnings] call: ${e.logDetail ?? "failed"}`);
    return undefined;
  }
}

/** The release's documents at the SEC as text (the press release, then its exhibits), or null when they cannot be read; the call is read without them. */
async function releaseMaterial(r: EarningsReport, contact: EdgarContact | null): Promise<string | null> {
  const rel = r.release;
  const cik = rel ? Number(/\/data\/(\d+)\//.exec(rel.url)?.[1] ?? NaN) : NaN;
  if (!rel?.accession || !contact || !Number.isFinite(cik)) return null;
  try {
    const text = releaseText(await releaseDocuments(cik, rel.accession, rel.url.split("/").pop() || null, contact));
    return text.trim() ? text : null;
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[earnings] call documents: ${e.logDetail ?? "failed"}`);
    return null;
  }
}

/**
 * What lies behind the lines of each recent report's flow (lib/flow-notes.ts;
 * Hamza, 5 Nov 2026): the lines the app asks about, read on the results
 * reader against the release's own documents at the SEC, the call's
 * transcript and the call as read, with a few searches for the rest. Written
 * once per flow and call; new notes mark the report to be made again. The
 * transcript is read for the notes and never kept.
 */
export async function withFlowNotes(file: EarningsFile, provider: ModelProvider | null, today: string, now: Date, contact: EdgarContact | null = null): Promise<{ file: EarningsFile; changed: number }> {
  if (!provider) return { file, changed: 0 };
  const at = now.toISOString();
  let out = file;
  let changed = 0;
  for (const r of recent(file, today)) {
    if (changed >= FLOW_NOTES_PER_RUN) break;
    const flow = r.detail?.flow;
    const ck = callKeyOf(r.call);
    if (!r.detail || !flow || !flowNotesDue(flow, r.detail.flowNotes, ck, at)) continue;
    const key = flowKey(flow, ck);
    const asks = flowAsks(flow);
    const web = !providerCannot(provider, "web_search");
    const release = await releaseMaterial(r, contact);
    const texts = { facts: reportFacts(r), release, call: null, reading: callWords(r.call) || null };
    let notes;
    try {
      const body = flowNotesRequestBody({ symbol: r.symbol, name: r.name, quarter: r.quarter, date: r.date }, flow, asks, texts, modelFor(provider, EARNINGS_MODEL), web);
      const parsed = parseFlowNotes(await callModel(provider, body as ModelRequest, { agent: "earnings_reaction", step: "flow", subject: r.symbol }), asks, texts, r.release?.url ?? null);
      if (!parsed.ok) console.error(`[earnings] flow notes: ${parsed.reason}`);
      notes = parsed.ok
        ? flowNotesSchema.parse({ key, at, notes: parsed.notes, v: FLOW_NOTES_VERSION, note: parsed.dropped ? `${parsed.dropped} note${parsed.dropped === 1 ? " was" : "s were"} left out for a figure no source prints or a page missing.` : null })
        : flowNotesFailed(key, at, "What lies behind the lines could not be read from the release and the call; it is read again tomorrow.");
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[earnings] flow notes: ${e.logDetail ?? "failed"}`);
      continue;
    }
    out = put(out, remade({ ...r, detail: { ...r.detail, flowNotes: notes } }));
    changed += 1;
  }
  if (changed) console.info(`[earnings] flow notes written ${changed}`);
  return { file: out, changed };
}

/** The study in full, as the brief is given it: each written section under its title. */
function studyText(s: Study): string {
  return [`Study: ${s.question}`, ...s.sections.filter((x) => s.written[x.id]).map((x) => `## ${x.title}\n${s.written[x.id]}`)].join("\n\n").slice(0, 40000);
}

/**
 * The deck's own words (lib/deck-brief.ts) on each recent report whose study
 * or call moved on since: written once on the person's model from the study
 * in full, the quarter's figures, the reading of the release, the call and
 * the thesis; with a few searches for what no filing says. A
 * new brief marks the decks to be made again.
 */
export async function withBriefs(file: EarningsFile, studies: readonly Study[], theses: ThesesFile | null, provider: ModelProvider | null, today: string, now: Date): Promise<{ file: EarningsFile; changed: number }> {
  if (!provider) return { file, changed: 0 };
  const at = now.toISOString();
  let out = file;
  let changed = 0;
  for (const r of recent(file, today)) {
    if (changed >= BRIEFS_PER_RUN) break;
    const ck = callKeyOf(r.call);
    if (!r.detail || !briefDue(r.detail, ck, at)) continue;
    const study = studies.find((s) => s.id === r.detail!.study!.id);
    const written = study ? studyText(study) : r.detail.study!.sections.map((x) => `## ${x.title}\n${x.text}`).join("\n\n");
    const thesis = thesisFor(theses, r.symbol);
    const material = [
      reportFacts(r),
      r.commentary ? `Reading of the release and the call:\n${r.commentary.summary}${r.commentary.guidance ? `\nGuidance: ${r.commentary.guidance}` : ""}\n${r.commentary.points.map((p) => `- ${p.line} (${p.source.url})`).join("\n")}` : null,
      callWords(r.call),
      lensWords(lensOf(thesis, r.triggers)),
      written,
    ]
      .filter(Boolean)
      .join("\n\n");
    const web = !providerCannot(provider, "web_search");
    let brief;
    try {
      const parsed = parseBriefResponse(await callModel(provider, briefRequestBody({ symbol: r.symbol, name: r.name, quarter: r.quarter, date: r.date }, material, modelFor(provider, EARNINGS_MODEL), web) as ModelRequest, { agent: "writer", step: "brief", subject: r.symbol }));
      if (!parsed.ok) console.error(`[earnings] brief: ${parsed.reason}`);
      brief = parsed.ok ? deckBriefSchema.parse({ ...parsed.brief, studyId: r.detail.study!.id, callKey: ck, at, v: BRIEF_VERSION, note: web ? null : `Written without the web.` }) : briefFailed(r.detail.study!.id, ck, at, "The deck's words did not hold together; they are written again tomorrow.");
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[earnings] brief: ${e.logDetail ?? "failed"}`);
      continue;
    }
    out = put(out, remade({ ...r, detail: { ...r.detail, brief } }));
    changed += 1;
  }
  if (changed) console.info(`[earnings] briefs written ${changed}`);
  return { file: out, changed };
}
