"use server";

import { revalidatePath } from "next/cache";

import { assertHostedOnDemand } from "@/lib/ask-claude-run";
import { providerFor } from "@/lib/hosted-model";
import { dcfInputsSchema, runDcf } from "@/lib/dcf";
import { applyFilings } from "@/lib/filings";
import { recordFields, type HoldingRecord } from "@/lib/holdings";

import { checkCompany, familyOf, subjectBook } from "@/lib/research";
import { deriveScreens } from "@/lib/screen-data";
import { SyncError } from "@/lib/sync-error";
import { basketFrom, EMPTY_THESIS, MARKET_THESIS_LIMIT_WORDS, marketThesisFor, marketThesisId, marketThesisSchema, MAX_MARKET_THESES, MAX_PILLARS, MAX_WATCH, pillarFieldOk, thesisFor, thesisSchema, withEvidence, withMarketThesis, withThesis, type MarketThesis, type Thesis } from "@/lib/theses";
import { applyProposal, decisionsFrom, methodologyView, proposalFor, proposalKey, standingOf, withoutProposal, type MethodologyView, type Standing, type Subject } from "@/lib/thesis-review";
import { localDay } from "@/lib/time";
import { ownValuationFrom, runValuation, valuationInputsSchema } from "@/lib/valuation";
import { huntKey, withDismissed } from "@/lib/thesis-hunter";
import { chosenWrite, claudeWriteHref, withoutPendingWrite, WRITE_PARTS, type PendingWrite, type ThesisWritesFile, type WritePart } from "@/lib/thesis-writes";
import type { Vault } from "@/lib/vault";
import { getWorkspace, saveRecords, saveTheses, saveThesisHunter, saveThesisProposals, thesesFor, thesisHunterFor, thesisProposalsFor, thesisWritesFor } from "@/lib/workspace";

export type ThesisState = { error: string | null };

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const num = (form: FormData, key: string) => {
  const v = str(form, key).replace(/,/g, "");
  return v === "" ? null : Number(v);
};

const EMPTY_RECORD: HoldingRecord = recordFields.parse({ ownValuation: null, since: null, note: null });

async function guarded(symbol: string, fn: () => Promise<void>): Promise<ThesisState> {
  try {
    await fn();
    revalidatePath(`/theses/${encodeURIComponent(symbol)}`);
    revalidatePath("/theses");
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[theses] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

const symbolOf = (form: FormData) => {
  const s = str(form, "symbol").toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)) throw new SyncError("That is not a symbol.", "theses symbol");
  return s;
};

/**
 * Saves a holding's thesis: the text, the pathway, the watch items (one per
 * line) and up to six pillars, each with the field and level that tests it.
 * The valuation and the DCF kept on the thesis stay as they were.
 */
export async function saveThesisAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const symbol = symbolOf(form);
  return guarded(symbol, async () => {
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    const prev = thesisFor(file, symbol);
    const pillars = pillarsFrom(form, prev?.pillars ?? [], "stock");
    const watch = watchFrom(form);
    const parsed = thesisSchema.safeParse({ text: str(form, "text"), pillars, pathway: str(form, "pathway") || null, watch, dcf: prev?.dcf ?? null, valuation: prev?.valuation ?? null, evidence: prev?.evidence ?? [], updatedAt: new Date().toISOString() });
    if (!parsed.success) throw new SyncError(parsed.error.issues[0]?.message ?? "The thesis could not be read.", "thesis parse");
    await saveTheses(withThesis(file, symbol, parsed.data, new Date().toISOString()));
  });
}

/**
 * Saves what the Valuation calculator ran, on the thesis: the DCF's inputs
 * and the valuation's (the stage when the person set one, the method, the
 * estimates), each as the calculator's JSON, validated here again; then
 * writes the chosen method's bear, base and bull as the holding's own
 * valuation on the record, so every report and deck reads the price against
 * them. The stage itself is read from the filings at every run, never kept
 * as a fact.
 */
export async function saveValuationAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const symbol = symbolOf(form);
  return guarded(symbol, async () => {
    const json = (key: string): unknown => {
      const raw = str(form, key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        throw new SyncError("The calculator's inputs could not be read.", `${key} json`);
      }
    };
    const today = localDay();
    const dcfRaw = json("dcf");
    const dcfParsed = dcfRaw === null ? null : dcfInputsSchema.safeParse(dcfRaw);
    if (dcfParsed && !dcfParsed.success) throw new SyncError(dcfParsed.error.issues[0]?.message ?? "The DCF inputs could not be read.", "dcf parse");
    const dcf = dcfParsed ? { ...dcfParsed.data, asOf: today } : null;
    const vRaw = json("valuation");
    const vParsed = vRaw === null ? null : valuationInputsSchema.safeParse(vRaw);
    if (vParsed && !vParsed.success) throw new SyncError(vParsed.error.issues[0]?.message ?? "The valuation inputs could not be read.", "valuation parse");
    const valuation = vParsed ? { ...vParsed.data, asOf: today } : null;
    if (!dcf && !valuation) throw new SyncError("Nothing to keep: enter the estimates or run the DCF first.", "valuation empty");
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    const prev = thesisFor(file, symbol);
    const now = new Date().toISOString();
    const thesis: Thesis = prev ? { ...prev, dcf: dcf ?? prev.dcf, valuation: valuation ?? prev.valuation, updatedAt: now } : { ...EMPTY_THESIS, dcf, valuation, updatedAt: now };
    await saveTheses(withThesis(file, symbol, thesis, now));
    // The chosen method's cases become the record's own valuation; the record keeps its other fields.
    const holding = ws.book?.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
    const readings: Record<string, number | null | undefined> = { price: holding?.price ?? null, ...(holding?.fundamentals ?? {}) };
    const result = runValuation({ inputs: thesis.valuation, dcf: thesis.dcf ? runDcf(thesis.dcf) : null, readings, price: holding?.price ?? null, priceCurrency: holding?.currency ?? null, asOf: today });
    const ov = ownValuationFrom(result);
    if (!ov) return;
    const key = Object.keys(ws.records.bySymbol).find((k) => k.toUpperCase() === symbol) ?? holding?.symbol ?? symbol;
    const rec = ws.records.bySymbol[key] ?? EMPTY_RECORD;
    await saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [key]: { ...rec, ownValuation: { low: ov.low, base: ov.base, high: ov.high, asOf: ov.asOf, basis: ov.basis } } } });
  });
}

/**
 * The first telling, on Welcome and on Setup's Theses card: the thesis in a
 * few lines and the person's own bear, base and bull per share. The text
 * goes on the thesis (its pillars, pathway, watch items, DCF and calculator
 * inputs stay as they are); the three figures become the record's own
 * valuation, as the Valuation calculator's chosen cases would. Either part
 * may be left out; both empty is nothing to keep.
 */
export async function saveFirstThesisAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const symbol = symbolOf(form);
  return guarded(symbol, async () => {
    const text = str(form, "text").slice(0, 6000);
    const low = num(form, "low");
    const base = num(form, "base");
    const high = num(form, "high");
    for (const [k, v] of [["bear", low], ["base", base], ["bull", high]] as const) if (v !== null && !(Number.isFinite(v) && v > 0)) throw new SyncError(`The ${k} case is not a price.`, "first valuation number");
    if (base === null && (low !== null || high !== null)) throw new SyncError("Give the base case too.", "first valuation base");
    if (low !== null && base !== null && low > base) throw new SyncError("The bear case is above the base case.", "first valuation order");
    if (high !== null && base !== null && high < base) throw new SyncError("The bull case is below the base case.", "first valuation order");
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    const prev = thesisFor(file, symbol);
    const now = new Date().toISOString();
    if (!text && base === null) {
      if (!prev?.text) throw new SyncError("Nothing to keep: write a line of the thesis, or a base case.", "first thesis empty");
    } else if (text !== (prev?.text ?? "")) {
      const parsed = thesisSchema.safeParse({ ...(prev ?? EMPTY_THESIS), text, updatedAt: now });
      if (!parsed.success) throw new SyncError(parsed.error.issues[0]?.message ?? "The thesis could not be read.", "thesis parse");
      await saveTheses(withThesis(file, symbol, parsed.data, now));
    }
    if (base === null) return;
    const holding = ws.book?.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
    const key = Object.keys(ws.records.bySymbol).find((k) => k.toUpperCase() === symbol) ?? holding?.symbol ?? symbol;
    const rec = ws.records.bySymbol[key] ?? EMPTY_RECORD;
    await saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [key]: { ...rec, ownValuation: { low, base, high, asOf: localDay(), basis: `Your estimate, per share${holding?.currency ? ` in ${holding.currency}` : ""}` } } } });
  });
}

/** Removes a holding's thesis; the record's valuation stays as it is. */
export async function removeThesisAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const symbol = symbolOf(form);
  return guarded(symbol, async () => {
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    await saveTheses(withThesis(file, symbol, null, new Date().toISOString()));
  });
}

async function guardedMarket(id: string | null, fn: () => Promise<void>): Promise<ThesisState> {
  try {
    await fn();
    if (id) revalidatePath(`/theses/market/${encodeURIComponent(id)}`);
    revalidatePath("/theses");
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[theses] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** The pillars a form carries, each test checked against what the subject can read. */
function pillarsFrom(form: FormData, prev: readonly Thesis["pillars"][number][], subject: "stock" | "market"): Thesis["pillars"] {
  const pillars: Thesis["pillars"] = [];
  for (let i = 0; i < MAX_PILLARS; i++) {
    const name = str(form, `pillar_${i}_name`);
    const text = str(form, `pillar_${i}_text`);
    if (!name && !text) continue;
    const field = str(form, `pillar_${i}_field`);
    const value = num(form, `pillar_${i}_value`);
    const is = str(form, `pillar_${i}_is`) === "lte" ? "lte" : "gte";
    const tested = field && value !== null && Number.isFinite(value);
    if (tested && !pillarFieldOk(field, subject)) throw new SyncError(`Pillar ${i + 1} tests ${subject === "market" ? "an indicator the app does not read" : "a field the ontology does not have"}.`, "pillar field");
    pillars.push({ id: prev[i]?.id ?? `p${Date.now().toString(36)}${i}`, name: name || `Pillar ${i + 1}`, text, test: tested ? { field: subject === "market" ? field.toUpperCase() : field, is, value } : null });
  }
  return pillars;
}

const watchFrom = (form: FormData) =>
  str(form, "watch")
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, MAX_WATCH);

/**
 * Saves a market thesis: the title, the text, the watch items and up to six
 * pillars, each tested on a market indicator's level. A new one takes its
 * id from its title; an id already on file is refused, and so is a file
 * already at the limit. The evidence kept on it stays.
 */
export async function saveMarketThesisAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const given = str(form, "id") || null;
  const title = str(form, "title");
  const id = given ?? marketThesisId(title);
  return guardedMarket(id, async () => {
    if (!title) throw new SyncError("Give the thesis a title.", "market thesis title");
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    const prev = given ? marketThesisFor(file, given) : null;
    if (given && !prev) throw new SyncError("That market thesis is no longer on file.", "market thesis missing");
    if (!prev && file.markets.some((m) => m.id === id)) throw new SyncError("A market thesis already reads as that title.", "market thesis duplicate");
    if (!prev && file.markets.length >= MAX_MARKET_THESES) throw new SyncError(MARKET_THESIS_LIMIT_WORDS, "market thesis limit");
    const now = new Date().toISOString();
    const parsed = marketThesisSchema.safeParse({ id, title, text: str(form, "text"), pillars: pillarsFrom(form, prev?.pillars ?? [], "market"), watch: watchFrom(form), evidence: prev?.evidence ?? [], figures: prev?.figures ?? [], basket: basketFrom(str(form, "basket")), since: prev?.since ?? null, updatedAt: now } satisfies MarketThesis);
    if (!parsed.success) throw new SyncError(parsed.error.issues[0]?.message ?? "The market thesis could not be read.", "market thesis parse");
    await saveTheses(withMarketThesis(file, id, parsed.data, now));
  });
}

/** Removes a market thesis. */
export async function removeMarketThesisAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const id = str(form, "id");
  return guardedMarket(id, async () => {
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    if (!marketThesisFor(file, id)) throw new SyncError("That market thesis is no longer on file.", "market thesis missing");
    await saveTheses(withMarketThesis(file, id, null, new Date().toISOString()));
  });
}

/**
 * Adds a note of the person's own to a thesis's evidence: what it is, what it
 * says that bears on the thesis, what it changes. The thesis's words are the
 * person's to change in the form above it.
 */
export async function addNoteAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const kind = str(form, "kind") === "market" ? "market" : "stock";
  const subject = str(form, "subject");
  const run = async () => {
    const source = str(form, "source").slice(0, 200);
    const summary = str(form, "summary").slice(0, 1500);
    const changes = str(form, "changes").slice(0, 800) || null;
    if (!source || !summary) throw new SyncError("Say what the note is and what it says.", "note empty");
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    const now = new Date();
    const entry = { at: localDay(now), source, kind: "note" as const, summary, changes, via: "you" as const };
    if (kind === "stock") {
      const prev = thesisFor(file, subject);
      const thesis: Thesis = prev ?? { ...EMPTY_THESIS, updatedAt: now.toISOString() };
      await saveTheses(withThesis(file, subject, withEvidence(thesis, entry, now.toISOString()), now.toISOString()));
      return;
    }
    const prev = marketThesisFor(file, subject);
    if (!prev) throw new SyncError("That market thesis is no longer on file.", "market thesis missing");
    await saveTheses(withMarketThesis(file, prev.id, withEvidence(prev, entry, now.toISOString()), now.toISOString()));
  };
  if (kind === "stock") {
    const symbol = subject.toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return { error: "That is not a symbol." };
    return guarded(symbol, run);
  }
  return guardedMarket(subject, run);
}

/** Takes one chart or picture off a stock or market thesis (Hamza, 20 Oct 2026: Claude adds them through the connector; the person keeps or removes them here). */
export async function removeFigureAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const kind = str(form, "kind") === "market" ? "market" : "stock";
  const subject = str(form, "subject");
  const id = str(form, "figure");
  const run = async () => {
    const ws = await getWorkspace();
    const { file } = await thesesFor(ws);
    const now = new Date().toISOString();
    if (kind === "stock") {
      const prev = thesisFor(file, subject);
      if (!prev) throw new SyncError("That thesis is no longer on file.", "thesis missing");
      await saveTheses(withThesis(file, subject, { ...prev, figures: prev.figures.filter((f) => f.id !== id), updatedAt: now }, now));
      return;
    }
    const prev = marketThesisFor(file, subject);
    if (!prev) throw new SyncError("That market thesis is no longer on file.", "market thesis missing");
    await saveTheses(withMarketThesis(file, prev.id, { ...prev, figures: prev.figures.filter((f) => f.id !== id), updatedAt: now }, now));
  };
  if (kind === "stock") {
    const symbol = subject.toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return { error: "That is not a symbol." };
    return guarded(symbol, run);
  }
  return guardedMarket(subject, run);
}

// ---------------------------------------------------------------------------
// Add to thesis, in the app (Hamza, 19 Oct 2026)

/** The subject a review form names, checked; a stock symbol is upper-cased. */
function subjectOf(form: FormData): Subject {
  const kind = str(form, "kind") === "market" ? "market" : "stock";
  const subject = str(form, "subject");
  if (kind === "stock") {
    const symbol = subject.toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new SyncError("That is not a symbol.", "theses symbol");
    return { kind: "stock", symbol };
  }
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(subject)) throw new SyncError("That market thesis is no longer on file.", "market thesis id");
  return { kind: "market", id: subject };
}

const guardedSubject = (s: Subject, fn: () => Promise<void>): Promise<ThesisState> => (s.kind === "stock" ? guarded(s.symbol, fn) : guardedMarket(s.id, fn));

/**
 * Reads the document or data the person chose with the AI against
 * this thesis, and keeps the proposed changes pending for them to approve,
 * deny or amend on the page. The document is read once and never kept.
 */
/**
 * The methodology the document is read against beside the thesis (Hamza,
 * 19 Oct 2026), with where a stock stands under it today: the class its
 * tests give it, the rules its filings' figures can test, the figures and
 * its weight against the cap. Null when no methodology is confirmed; a stock
 * with no holding and no filings has no standing, and the request says so.
 */
function methodologyFor(ws: Awaited<ReturnType<typeof getWorkspace>>, subject: Subject): MethodologyView | null {
  const m = ws.setup?.methodology ?? null;
  if (!m || !ws.setup) return null;
  let standing: Standing | null = null;
  if (subject.kind === "stock") {
    const today = localDay();
    const book = ws.book ? applyFilings(ws.book, ws.filings) : null;
    const held = book?.holdings.find((h) => h.symbol.toUpperCase() === subject.symbol) ?? null;
    const filed = ws.filings?.bySymbol[subject.symbol] ?? null;
    const values = held?.fundamentals && Object.keys(held.fundamentals).length ? held.fundamentals : filed?.values ?? null;
    if (values && Object.keys(values).length) {
      const verdict = checkCompany(m, familyOf(m).family, subjectBook(subject.symbol, held?.name ?? filed?.name ?? subject.symbol, values, held?.price ?? null, held?.currency ?? ws.setup.baseCurrency, today), today);
      const weight = held && ws.book ? (deriveScreens({ book: ws.book, methodology: m, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today).weights.find((w) => w.symbol === subject.symbol) ?? null) : null;
      standing = standingOf(verdict, weight);
    }
  }
  return methodologyView(m, ws.setup.baseCurrency, standing);
}

export async function proposeFromDocumentAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  let subject: Subject;
  try {
    subject = subjectOf(form);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  return guardedSubject(subject, async () => {
    const ws = await getWorkspace();
    if (ws.mode !== "drive") throw new SyncError("The demo's theses are fictional and read-only.", "thesis upload in demo");
    assertHostedOnDemand(ws);
    const file = form.get("document");
    if (!(file instanceof File) || file.size === 0) throw new SyncError("Choose a document or a table first.", "thesis upload none");
    const { openVault } = await import("@/lib/vault");
    const { proposeFromDocument } = await import("@/lib/thesis-review-run");
    const vault = await openVault();
    const provider = await providerFor(vault);
    if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "thesis upload no provider");
    const label = subject.kind === "stock" ? `${subject.symbol}${ws.book?.holdings.find((h) => h.symbol.toUpperCase() === subject.symbol)?.name ? ` (${ws.book.holdings.find((h) => h.symbol.toUpperCase() === subject.symbol)!.name})` : ""}` : (marketThesisFor((await thesesFor(ws)).file, subject.id)?.title ?? subject.id);
    await proposeFromDocument(vault, provider, subject, label, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, new Date(), methodologyFor(ws, subject));
  });
}

/**
 * Applies what the person approved or amended on the pending proposal, adds
 * the document as evidence (with what changed, or that nothing did), and
 * clears the proposal.
 */
export async function applyProposalAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  let subject: Subject;
  try {
    subject = subjectOf(form);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  return guardedSubject(subject, async () => {
    const ws = await getWorkspace();
    if (ws.mode !== "drive") throw new SyncError("The demo's theses are fictional and read-only.", "thesis apply in demo");
    const [{ file }, proposals] = await Promise.all([thesesFor(ws), thesisProposalsFor(ws)]);
    if (proposals.error) throw new SyncError(proposals.error, "thesis proposals read");
    const proposal = proposalFor(proposals.file, subject);
    if (!proposal) throw new SyncError("That proposal is no longer pending; the page may be out of date.", "thesis proposal missing");
    const now = new Date();
    const today = localDay(now);
    const decisions = decisionsFrom(form, proposal.changes);
    if (subject.kind === "stock") {
      const prev = thesisFor(file, subject.symbol) ?? { ...EMPTY_THESIS, updatedAt: now.toISOString() };
      const applied = applyProposal(prev, proposal, decisions, now, today);
      const parsed = thesisSchema.safeParse(applied.thesis);
      if (!parsed.success) throw new SyncError(`The thesis would not fit: ${parsed.error.issues[0]?.message ?? "unknown"}.`, "thesis apply parse");
      await saveTheses(withThesis(file, subject.symbol, parsed.data, now.toISOString()));
    } else {
      const prev = marketThesisFor(file, subject.id);
      if (!prev) throw new SyncError("That market thesis is no longer on file.", "market thesis missing");
      const applied = applyProposal(prev, proposal, decisions, now, today);
      const parsed = marketThesisSchema.safeParse(applied.thesis);
      if (!parsed.success) throw new SyncError(`The market thesis would not fit: ${parsed.error.issues[0]?.message ?? "unknown"}.`, "market thesis apply parse");
      await saveTheses(withMarketThesis(file, prev.id, parsed.data, now.toISOString()));
    }
    await saveThesisProposals(withoutProposal(proposals.file, proposalKey(subject), now.toISOString()));
  });
}

/** Drops the pending proposal; the thesis stays as it is. */
export async function dismissProposalAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  let subject: Subject;
  try {
    subject = subjectOf(form);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  return guardedSubject(subject, async () => {
    const ws = await getWorkspace();
    if (ws.mode !== "drive") throw new SyncError("The demo's theses are fictional and read-only.", "thesis dismiss in demo");
    const proposals = await thesisProposalsFor(ws);
    if (proposals.error) throw new SyncError(proposals.error, "thesis proposals read");
    if (!proposalFor(proposals.file, subject)) return;
    await saveThesisProposals(withoutProposal(proposals.file, proposalKey(subject), new Date().toISOString()));
  });
}

// ---------------------------------------------------------------------------
// The Thesis Hunter (Hamza, 20 Oct 2026)

/** The thesis a hunter form names, as its key and the page to refresh. */
function huntTarget(form: FormData): { key: string; path: string } {
  if (str(form, "kind") === "market") {
    const id = str(form, "subject");
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) throw new SyncError("That market thesis is not on file.", "hunter market id");
    return { key: huntKey({ kind: "market", id }), path: `/theses/market/${encodeURIComponent(id)}` };
  }
  const symbol = str(form, "subject").toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new SyncError("That is not a symbol.", "hunter symbol");
  return { key: huntKey({ kind: "stock", symbol }), path: `/theses/${encodeURIComponent(symbol)}` };
}

async function huntGuarded(form: FormData, fn: (key: string) => Promise<void>): Promise<ThesisState> {
  try {
    const t = huntTarget(form);
    await fn(t.key);
    revalidatePath(t.path);
    revalidatePath("/notifications");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[hunter] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** Hunts one thesis now, on the AI, whether or not it was hunted today. */
export async function huntNowAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  return huntGuarded(form, async (key) => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo runs no model; in your own copy the hunter runs once a week with the AI, and here on request.", "hunter in demo");
    const { openVault } = await import("@/lib/vault");
    const { huntThesesInto } = await import("@/lib/thesis-hunter-run");
    const run = await huntThesesInto(await openVault(), new Date(), 1, key);
    if (!run) throw new SyncError("That thesis has no words to hunt for yet; write it first.", "hunter nothing to hunt");
    if (run.problem) throw new SyncError(run.sentence, "hunter no model");
  });
}

/** Dismisses one find; it stays dismissed and leaves Notifications. */
export async function dismissFindAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const id = str(form, "find");
  return huntGuarded(form, async (key) => {
    const ws = await getWorkspace();
    const { file } = await thesisHunterFor(ws);
    await saveThesisHunter(withDismissed(file, key, id, new Date()));
  });
}

/**
 * Publishes a thesis as a public sealed call (Hamza, 9 Nov 2026, the twenty
 * further ways): its words as they stand, its fingerprint registered and the
 * time the deployment first saw it, on a public page under the name the
 * person shares their card with, else their sign-in name. Nothing else of
 * theirs goes with it. `unpublish` takes it down.
 */
export async function publishCallAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const key = str(form, "key");
  const down = str(form, "unpublish");
  return guarded(key.startsWith("market:") ? "" : key, async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo publishes nothing.", "call in demo");
    const { registryAvailable, publishCall, unpublishCall, sealReceipts, myProfile } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("Publishing needs the deployment's registry, which is not set up.", "call no registry");
    if (down) {
      await unpublishCall(ws.operator.email, down);
      revalidatePath("/calls");
      return;
    }
    const { file } = await thesesFor(ws);
    const [{ stockWords, marketWords, fingerprintOf, hasWords }, { callFrom }] = await Promise.all([import("@/lib/receipts"), import("@/lib/public-calls")]);
    const market = key.startsWith("market:") ? (file?.markets ?? []).find((m) => m.id === key.slice(7)) : null;
    const stock = !market && /^[A-Z][A-Z0-9.-]{0,9}$/.test(key) ? (file?.bySymbol[key] ?? null) : null;
    const words = market ? marketWords(market) : stock ? stockWords(key, stock) : null;
    if (!words || !hasWords(words)) throw new SyncError("Write the thesis first; an empty one has nothing to publish.", "call empty");
    const hash = fingerprintOf(words);
    const at = (await sealReceipts([hash])).get(hash) ?? new Date().toISOString();
    const card = await myProfile(ws.operator.email).catch(() => null);
    await publishCall(ws.operator.email, callFrom(words, { name: card?.name ?? ws.operator.name ?? "An Invariant member", handle: card?.sharing.listed ? card.handle : null, sealedAt: at, now: new Date().toISOString() }));
    revalidatePath("/calls");
    if (market) revalidatePath(`/theses/market/${market.id}`);
  });
}

// ---------------------------------------------------------------------------
// What the person's own Claude proposed through write_thesis (Hamza, 9 Nov 2026)

/** Keeps the parts of a write the person ticked, the thesis and the pathway as they amended them, then drops it from the pending list. */
export async function approveClaudeWriteAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  return guardedClaudeWrite(form, async (pending, rest, vault, ws) => {
    const keep = new Set(form.getAll("keep").map(String).filter((p): p is WritePart => (WRITE_PARTS as readonly string[]).includes(p)));
    const amendedText = form.has("amend_text") ? str(form, "amend_text") : undefined;
    const amendedPathway = form.has("amend_pathway") ? str(form, "amend_pathway") || null : undefined;
    const w = chosenWrite(pending, keep, { text: amendedText, pathway: amendedPathway });
    if (w) {
      const { writeThesisInto } = await import("@/lib/theses-run");
      await writeThesisInto(vault, w, new Date(), ws.fullBook?.holdings ?? [], ws.operator.email);
    }
    await vault.writeJson("thesis_writes", rest);
  });
}

/** Drops what Claude proposed; the thesis stays as it is. */
export async function denyClaudeWriteAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  return guardedClaudeWrite(form, async (_pending, rest, vault) => {
    await vault.writeJson("thesis_writes", rest);
  });
}

async function guardedClaudeWrite(form: FormData, fn: (pending: PendingWrite, rest: ThesisWritesFile, vault: Vault, ws: Awaited<ReturnType<typeof getWorkspace>>) => Promise<void>): Promise<ThesisState> {
  try {
    const ws = await getWorkspace();
    if (ws.mode !== "drive") throw new SyncError("The demo's theses are fictional and read-only.", "claude write in demo");
    const { file, error } = await thesisWritesFor(ws);
    if (error) throw new SyncError(error, "thesis writes read");
    const pending = file.pending.find((p) => p.id === str(form, "id"));
    if (!pending) throw new SyncError("That proposal is no longer pending; the page may be out of date.", "claude write missing");
    const { openVault } = await import("@/lib/vault");
    await fn(pending, withoutPendingWrite(file, pending.id, new Date().toISOString()), await openVault(), ws);
    revalidatePath(claudeWriteHref(pending));
    revalidatePath("/theses");
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[theses] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/**
 * Takes a top fund's stated thesis into the person's theses (Hamza, 9 Nov
 * 2026: the funds' theses on the marketplace): on a company, its folder,
 * started with the fund's words when it has none, and a company neither held
 * nor watched joins the watchlist; on a theme, a market thesis. Each leaves an
 * entry naming the fund and its page. The thesis is read from where the
 * creeds are kept, never from the form.
 */
export async function takeFundThesisAction(_prev: ThesisState, form: FormData): Promise<ThesisState> {
  const fundId = str(form, "fund");
  const index = Number(str(form, "thesis"));
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "In the demo the theses are to look at; taking one in is in your own app." };
  if (!Number.isInteger(index) || index < 0) return { error: "That thesis is not on the shelf now." };
  return guarded("", async () => {
    const { creedThesis, fundNameOf, takeFundThesis } = await import("@/lib/fund-creeds");
    const { fundCreedsFor, fundsFor } = await import("@/lib/workspace");
    const [{ creeds, error: creedError }, { file: funds }, { file, error }] = await Promise.all([fundCreedsFor(ws), fundsFor(ws), thesesFor(ws)]);
    if (creedError) throw new SyncError(creedError, "fund creeds read");
    // A theses file that cannot be read is never written over.
    if (error) throw new SyncError(`The thesis was not kept: ${error}`, "fund thesis read");
    const t = creedThesis(creeds, fundId, index);
    const fund = fundNameOf(fundId, funds);
    if (!t || !fund) throw new SyncError("That thesis is not on the shelf now.", "fund thesis gone");
    let taken;
    try {
      taken = takeFundThesis(file, t, fund, new Date(), localDay());
    } catch (e) {
      throw new SyncError(e instanceof Error ? e.message : MARKET_THESIS_LIMIT_WORDS, "fund thesis limit");
    }
    await saveTheses(taken.file);
    if (taken.kind === "stock") {
      const held = ws.book?.holdings.some((h) => h.symbol.toUpperCase() === taken.key) ?? false;
      const recorded = Object.keys(ws.records.bySymbol).some((k) => k.toUpperCase() === taken.key);
      if (!held && !recorded) await saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [taken.key]: { ...EMPTY_RECORD, since: localDay() } } });
      revalidatePath(`/theses/${encodeURIComponent(taken.key)}`);
    } else revalidatePath(`/theses/market/${encodeURIComponent(taken.key)}`);
    revalidatePath("/methodology/market");
  });
}
