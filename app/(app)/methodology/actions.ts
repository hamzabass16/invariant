"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { assertHostedOnDemand } from "@/lib/ask-claude-run";
import { adoptMethodology, adoptTemplate, libraryEntry } from "@/lib/library";
import { methodologySchema, starter, without, type Methodology } from "@/lib/methodology";
import { modulesFor } from "@/lib/setup";
import { NO_HOSTED_AI, providerFor } from "@/lib/hosted-model";
import type { ModelProvider } from "@/lib/model-provider";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { withPortfolioMethodology } from "@/lib/portfolios";
import { demoRefSchema, getWorkspace, SAMPLE_IDS, saveDemoDraft, savePortfolios, saveSetup, type SampleId, type Workspace } from "@/lib/workspace";

export type MethodologyState = { error: string | null };

const done = () => {
  revalidatePath("/", "layout");
  return { error: null };
};

async function guarded(fn: () => Promise<void>): Promise<MethodologyState> {
  try {
    await fn();
    return done();
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[methodology] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

async function vault() {
  const { openVault } = await import("@/lib/vault");
  return openVault();
}

/** The Invariant provider for one drafting call, metered under the person's sign-in (lib/hosted-model.ts). */
async function ownProvider(v: Awaited<ReturnType<typeof vault>>): Promise<ModelProvider> {
  const provider = await providerFor(v);
  if (!provider) throw new SyncError(NO_HOSTED_AI, "no hosted provider");
  return provider;
}

// ---------------------------------------------------------------------------
// Starting a draft

/** Demo only: starts a draft from a fictional sample, for the builder to show. */
export async function sampleDraftAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  const sample = String(form.get("sample") ?? "");
  if (ws.mode !== "demo" || !ws.setup) return { error: "The sample methodologies are for the demo." };
  if (!(SAMPLE_IDS as readonly string[]).includes(sample)) return { error: "Unknown sample." };
  return guarded(() => saveDemoDraft({ sample: sample as SampleId, drop: [] }));
}

/**
 * Adopts a ready-made methodology from the library as a draft to confirm, and
 * in a vault its author's stock template too when asked. No key and no
 * reading: the file is the graph itself. In the demo it is a reference, like
 * a sample.
 */
export async function adoptLibraryAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (!ws.setup) return { error: "Finish Setup first." };
  const entry = libraryEntry(String(form.get("library") ?? ""));
  if (!entry) return { error: "That methodology is not in the library." };
  const withTemplate = form.get("template") === "yes";
  if (ws.mode === "demo") return guarded(() => saveDemoDraft({ sample: entry.id, drop: [] }));
  return guarded(async () => {
    const v = await vault();
    await v.writeJson("methodology_draft", adoptMethodology(entry));
    const t = withTemplate ? adoptTemplate(entry, new Date().toISOString()) : null;
    if (t) await v.writeJson("research_template", t);
  });
}

/**
 * Suggests a starting methodology from the profile, inputs and book, for the
 * owner to approve or trim. In the demo this is the sample for the profile.
 */
export async function suggestAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (!ws.setup) return { error: "Finish Setup first." };
  if (ws.mode === "demo") return guarded(() => saveDemoDraft({ sample: ws.setup!.profile, drop: [] }));
  return guarded(async () => {
    const v = await vault();
    const provider = await ownProvider(v);
    const { draftMethodology } = await import("@/lib/methodology-draft");
    const draft = await draftMethodology({ provider, setup: ws.setup!, today: localDay(), book: ws.book });
    await v.writeJson("methodology_draft", methodologySchema.parse({ ...draft, source: { title: "Suggested from your profile and portfolio", fileId: null }, origin: "suggested" }));
  });
}

/**
 * Drive mode: keeps the document in the person's folder, drafts the
 * methodology from it with their own key, and saves the draft for them to
 * confirm. Nothing on the dashboard changes until they do.
 */
export async function uploadAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (storageMode() !== "drive" || !ws.setup) return { error: "Attaching a document needs the app connected to your vault." };
  const file = form.get("document");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a document first." };
  // An Invariant methodology file (the graph itself) needs no reading: it becomes the draft as it is, for the person to confirm.
  if (file.name.toLowerCase().endsWith(".json") || file.type === "application/json") {
    if (file.size > 2 * 1024 * 1024) return { error: "That file is over 2 MB; a methodology file is far smaller." };
    return guarded(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new SyncError("That file is not valid JSON.", "methodology json parse failed");
      }
      const draft = methodologySchema.safeParse({ ...(typeof parsed === "object" && parsed ? parsed : {}), source: { title: file.name.slice(0, 120), fileId: null }, origin: "document" });
      if (!draft.success) {
        const first = draft.error.issues[0];
        throw new SyncError(`That file is not an Invariant methodology${first ? ` (${first.path.join(".") || "root"}: ${first.message})` : ""}.`, "methodology json failed schema");
      }
      const v = await vault();
      await v.writeJson("methodology_draft", draft.data);
    });
  }
  const { ACCEPTED, MAX_DOCUMENT_BYTES, draftMethodology } = await import("@/lib/methodology-draft");
  const mime = (file.type || (file.name.endsWith(".md") ? "text/markdown" : "")) as keyof typeof ACCEPTED;
  if (!(mime in ACCEPTED)) return { error: "Attach a PDF or a text file. A Word or Google Doc can be saved as PDF first." };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "That document is over 4 MB. Save it as a PDF without images, or as plain text." };
  return guarded(async () => {
    const v = await vault();
    const provider = await ownProvider(v);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileId = await v.saveDocument(file.name.slice(0, 120), mime, bytes);
    const draft = await draftMethodology({ provider, setup: ws.setup!, today: localDay(), document: { name: file.name, mime, bytes } });
    await v.writeJson("methodology_draft", methodologySchema.parse({ ...draft, source: { title: file.name.slice(0, 120), fileId }, origin: "document" }));
  });
}

/** The type a document is read as: the browser's, else Markdown by its name. */
const documentMime = (name: string, type: string) => type || (name.toLowerCase().endsWith(".md") ? "text/markdown" : "");

/**
 * A document over what a request to the app may carry goes from the browser
 * straight to the person's own Drive (Hamza, 19 Nov 2026: "do it for the
 * user's drive"): this opens the upload in their folder and hands the browser
 * the address to send it to. Only a Google Drive vault takes it.
 */
export async function startDocumentUploadAction(file: { name: string; type: string; size: number }): Promise<{ url: string } | { error: string }> {
  const ws = await getWorkspace();
  if (storageMode() !== "drive" || !ws.setup) return { error: "Attaching a document needs the app connected to your vault." };
  const { ACCEPTED, MAX_DRIVE_DOCUMENT_BYTES } = await import("@/lib/methodology-draft");
  const name = String(file.name ?? "").slice(0, 120) || "methodology";
  const mime = documentMime(name, String(file.type ?? ""));
  if (!(mime in ACCEPTED)) return { error: "Attach a PDF or a text file. A Word or Google Doc can be saved as PDF first." };
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return { error: "Choose a document first." };
  if (size > MAX_DRIVE_DOCUMENT_BYTES) return { error: "That document is over 20 MB. Save it as a PDF without images, or as plain text." };
  try {
    const v = await vault();
    if (!v.startDocumentUpload) return { error: "A document over 4 MB needs your vault in Google Drive. Save it as a PDF without images, or as plain text." };
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const origin = h.get("origin") ?? (host ? `https://${host}` : null);
    if (!origin) return { error: "The upload could not be opened from this page. Reload it and try again." };
    return { url: await v.startDocumentUpload(name, mime, size, origin) };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[methodology] ${e.logDetail ?? "upload start failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/** Drafts the methodology from the document the browser just sent to the person's Drive, read back from there. */
export async function draftFromDriveAction(fileId: string): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (storageMode() !== "drive" || !ws.setup) return { error: "Attaching a document needs the app connected to your vault." };
  const { ACCEPTED, MAX_DRIVE_DOCUMENT_BYTES, draftMethodology } = await import("@/lib/methodology-draft");
  return guarded(async () => {
    const v = await vault();
    if (!v.readDocument) throw new SyncError("A document over 4 MB needs your vault in Google Drive.", "direct upload outside drive");
    const provider = await ownProvider(v);
    const doc = await v.readDocument(String(fileId ?? ""));
    const mime = documentMime(doc.name, doc.mime) as keyof typeof ACCEPTED;
    if (!(mime in ACCEPTED)) throw new SyncError("Attach a PDF or a text file. A Word or Google Doc can be saved as PDF first.", "direct upload of another type");
    if (doc.bytes.length > MAX_DRIVE_DOCUMENT_BYTES) throw new SyncError("That document is over 20 MB. Save it as a PDF without images, or as plain text.", "direct upload too large");
    const draft = await draftMethodology({ provider, setup: ws.setup!, today: localDay(), document: { name: doc.name, mime, bytes: doc.bytes } });
    await v.writeJson("methodology_draft", methodologySchema.parse({ ...draft, source: { title: doc.name.slice(0, 120), fileId }, origin: "document" }));
  });
}

// ---------------------------------------------------------------------------
// The builder: trimming and revising a draft

/** Removes figures, classes or rules from the draft; what pointed at them follows (lib/methodology.ts without). */
export async function dropAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  const ids = form.getAll("id").map(String).filter((s) => /^[\w.-]{1,40}$/.test(s));
  if (!ws.draft || !ids.length) return { error: null };
  if (ws.mode === "demo") {
    const ref = ws.demo?.draft;
    if (!ref) return { error: null };
    return guarded(() => saveDemoDraft(demoRefSchema.parse({ ...ref, drop: [...new Set([...ref.drop, ...ids])].slice(0, 80) })));
  }
  return guarded(async () => {
    await (await vault()).writeJson("methodology_draft", without(ws.draft!, ids));
  });
}

/** Demo only: puts back everything removed from the draft. */
export async function restoreAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode !== "demo" || !ws.demo?.draft) return { error: null };
  return guarded(() => saveDemoDraft({ ...ws.demo!.draft!, drop: [] }));
}

/** Drive mode: asks for changes to the draft in words; the drafter rewrites it with the person's own key. */
export async function reviseAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  const instruction = String(form.get("instruction") ?? "").trim();
  if (ws.mode !== "drive" || !ws.setup || !ws.draft) return { error: "There is no draft to change." };
  if (instruction.length < 3) return { error: "Say what should change." };
  return guarded(async () => {
    const v = await vault();
    const provider = await ownProvider(v);
    const { draftMethodology } = await import("@/lib/methodology-draft");
    const draft = await draftMethodology({ provider, setup: ws.setup!, today: localDay(), book: ws.book, current: ws.draft, instruction });
    await v.writeJson("methodology_draft", methodologySchema.parse({ ...draft, source: ws.draft!.source, origin: ws.draft!.origin }));
  });
}

/** Where a methodology is kept for the lens the person is on: the setup's, or the portfolio's own when each keeps one. A sentence when it cannot be said. */
function keptFor(ws: Workspace): { portfolio: string | null } | { error: string } {
  if (ws.portfolios.mode !== "each") return { portfolio: null };
  if (!ws.lens || !ws.portfolios.items.some((p) => p.id === ws.lens!.id)) return { error: "Each portfolio keeps its own methodology: choose one portfolio at the top of the screen first." };
  return { portfolio: ws.lens.id };
}

/**
 * Seals the version just confirmed (Hamza, 9 Nov 2026, the twenty further
 * ways): its words' fingerprint registered with the time, and an entry in the
 * Decision Log naming what changed from the one before, so anyone can see
 * the rules were set before the results. A registry or log that cannot be
 * written costs the receipt, never the confirmation.
 */
async function keepVersion(ws: Workspace, m: Methodology, prev: Methodology | null): Promise<void> {
  try {
    const [{ versionEntry, methodologyFingerprint }, { withDecision, decisionId }, { saveDecisions }] = await Promise.all([import("@/lib/methodology-versions"), import("@/lib/decisions"), import("@/lib/workspace")]);
    const today = localDay();
    const now = new Date().toISOString();
    await saveDecisions(withDecision(ws.decisions, versionEntry({ id: decisionId(ws.decisions, today), m, prev, today, now }), now));
    const { registryAvailable, sealReceipts } = await import("@/lib/registry");
    if (registryAvailable()) await sealReceipts([methodologyFingerprint(m)]);
  } catch (e) {
    console.error(`[methodology] version not kept: ${e instanceof SyncError ? (e.logDetail ?? "failed") : "unexpected error"}`);
  }
}

export async function confirmDraftAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (!ws.baseSetup || !ws.draft) return { error: "There is no draft to confirm." };
  const confirmed: Methodology = { ...ws.draft, adopted: ws.draft.adopted ?? localDay() };
  if (ws.mode === "demo") return guarded(() => saveSetup({ ...ws.baseSetup!, methodology: confirmed, updated: new Date().toISOString() }, { methodology: ws.demo?.draft ?? null, draft: null }));
  const where = keptFor(ws);
  if ("error" in where) return where;
  return guarded(async () => {
    if (where.portfolio) await savePortfolios(withPortfolioMethodology(ws.portfolios, where.portfolio, confirmed));
    else await saveSetup({ ...ws.baseSetup!, methodology: confirmed, updated: new Date().toISOString() });
    await (await vault()).removeFile("methodology_draft");
    await keepVersion(ws, confirmed, where.portfolio ? (ws.portfolios.items.find((p) => p.id === where.portfolio)?.methodology ?? null) : ws.baseSetup!.methodology);
    // What the ontology cannot say yet, counted without a name so the app grows for everyone (lib/improvements.ts); never in the demo or once switched off.
    const [{ gapSignals }, { recordSignals }] = await Promise.all([import("@/lib/improvements"), import("@/lib/improvements-run")]);
    await recordSignals(ws.operator.email, ws.preferences, false, gapSignals(confirmed.gaps));
    await (await import("@/lib/beta-run")).recordEvent(ws.operator.email, "methodology_confirmed");
  });
}

export async function discardDraftAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return guarded(() => saveDemoDraft(null));
  return guarded(async () => (await vault()).removeFile("methodology_draft"));
}

/** Back to stage 1: the dashboard returns to the one built from the inputs. */
export async function removeMethodologyAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (!ws.baseSetup) return { error: null };
  const where = keptFor(ws);
  if ("error" in where) return where;
  if (where.portfolio) return guarded(() => savePortfolios(withPortfolioMethodology(ws.portfolios, where.portfolio!, null)));
  return guarded(() => saveSetup({ ...ws.baseSetup!, methodology: null, updated: new Date().toISOString() }, { methodology: null }));
}

// ---------------------------------------------------------------------------
// The person's own model key

// ---------------------------------------------------------------------------
// Evaluation: since when, and the tests the person's model proposes

async function evaluationFile(v: Awaited<ReturnType<typeof vault>>) {
  const { EMPTY_EVALUATION, evaluationFileSchema } = await import("@/lib/methodology-evaluation");
  return (await v.readJson("evaluation", evaluationFileSchema)) ?? EMPTY_EVALUATION;
}

const DEMO_EVALUATION = "The demo reads the app's own tests from where its figures begin; in your own app you set the day and ask the AI.";

/** The day the evaluation reads from; an empty day goes back to the methodology's adopted day or the start of the figures. */
export async function setEvaluationStartAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  if (storageMode() === "demo") return { error: DEMO_EVALUATION };
  const day = String(form.get("since") ?? "").trim();
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a day." };
  if (day && day > localDay()) return { error: "Pick a day that has passed." };
  return guarded(async () => {
    const v = await vault();
    const file = await evaluationFile(v);
    await v.writeJson("evaluation", { ...file, since: day || null, sinceWhy: null, updated: new Date().toISOString() });
  });
}

/** Asks the AI how their methodology should be judged; the proposal waits for them to confirm it. */
export async function suggestEvaluationAction(): Promise<MethodologyState> {
  if (storageMode() === "demo") return { error: DEMO_EVALUATION };
  return guarded(async () => {
    const ws = await getWorkspace();
    assertHostedOnDemand(ws);
    const m = ws.setup?.methodology;
    if (!m) throw new SyncError("Confirm a methodology first.", "evaluation no methodology");
    const v = await vault();
    const { proposeEvaluation } = await import("@/lib/methodology-evaluation-run");
    const { benchmarksOf } = await import("@/lib/screens");
    const got = await proposeEvaluation(v, m, ws.book, benchmarksOf(m));
    if (!got.ok) throw new SyncError(got.reason, "evaluation proposal refused");
    const file = await evaluationFile(v);
    const at = new Date().toISOString();
    await v.writeJson("evaluation", { ...file, proposal: { ...got.proposal, against: m.name.slice(0, 80), at }, updated: at });
  });
}

/** Keeps the proposal: its tests, its day and its advice become the person's own. */
export async function confirmEvaluationAction(): Promise<MethodologyState> {
  if (storageMode() === "demo") return { error: DEMO_EVALUATION };
  return guarded(async () => {
    const v = await vault();
    const { confirmProposal } = await import("@/lib/methodology-evaluation");
    await v.writeJson("evaluation", confirmProposal(await evaluationFile(v), new Date().toISOString()));
  });
}

export async function dismissEvaluationAction(): Promise<MethodologyState> {
  if (storageMode() === "demo") return { error: DEMO_EVALUATION };
  return guarded(async () => {
    const v = await vault();
    await v.writeJson("evaluation", { ...(await evaluationFile(v)), proposal: null, updated: new Date().toISOString() });
  });
}

/** Back to the app's own tests: the confirmed ones and their advice are dropped; the day stays. */
export async function resetEvaluationTestsAction(): Promise<MethodologyState> {
  if (storageMode() === "demo") return { error: DEMO_EVALUATION };
  return guarded(async () => {
    const v = await vault();
    await v.writeJson("evaluation", { ...(await evaluationFile(v)), tests: null, advice: null, updated: new Date().toISOString() });
  });
}

// ---------------------------------------------------------------------------
// Rule packs and the marketplace (Hamza, 9 Nov 2026, the twenty more ways)

/** Lays a rule pack (lib/rule-packs.ts) on the methodology in use, or on the draft, as a draft to confirm. */
export async function addRulePackAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  const { rulePack, withPack } = await import("@/lib/rule-packs");
  const pack = rulePack(String(form.get("pack") ?? ""));
  if (!pack) return { error: "That pack is not on the shelf." };
  if (ws.mode === "demo") return { error: "The demo's methodology stays as it is; packs are added in your own app." };
  const base = ws.draft ?? ws.setup?.methodology ?? null;
  if (!base) return { error: "Choose a methodology on Setup first." };
  const r = withPack(base, pack);
  if ("error" in r) return { error: r.error };
  return guarded(async () => {
    await (await vault()).writeJson("methodology_draft", r.draft);
  });
}

/** Lists the methodology in use on the marketplace under the name the person chooses, rules only; listing again replaces it. */
export async function listMethodologyAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo lists nothing." };
  const { listingFrom, listingIdFrom, listingProblem } = await import("@/lib/marketplace");
  const m = ws.setup?.methodology ?? null;
  const problem = listingProblem(m);
  if (problem) return { error: problem };
  const credit = String(form.get("credit") ?? "").trim();
  if (credit.length < 2) return { error: "Say how you want to be credited." };
  return guarded(async () => {
    const { myListing, keepListing } = await import("@/lib/registry");
    const prev = await myListing(ws.operator.email);
    const now = new Date().toISOString();
    await keepListing(ws.operator.email, listingFrom(m!, { id: prev?.id ?? listingIdFrom(m!.name, Math.random().toString(36).slice(2)), credit, now, listedAt: prev?.listedAt }));
  });
}

export async function unlistMethodologyAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo lists nothing." };
  return guarded(async () => {
    await (await import("@/lib/registry")).unlist(ws.operator.email);
  });
}

/** Adopts a listed methodology as a draft, credited to its author, and counts the adoption once a person. */
export async function adoptListingAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (!ws.setup) return { error: "Finish Setup first." };
  if (ws.mode === "demo") return { error: "In the demo the shelf is to look at; adopting is in your own app." };
  const id = String(form.get("listing") ?? "");
  return guarded(async () => {
    const { marketListing, countAdoption } = await import("@/lib/registry");
    const { adoptListing } = await import("@/lib/marketplace");
    const l = await marketListing(id, ws.operator.email);
    if (!l) throw new SyncError("That listing is no longer on the shelf.", "listing gone");
    await (await vault()).writeJson("methodology_draft", adoptListing(l));
    await countAdoption(l.id, ws.operator.email);
  });
}

/**
 * Adopts what a top fund says it does (lib/fund-creeds.ts) as a draft on the
 * person's own figures and dashboard, credited to the fund (Hamza, 9 Nov
 * 2026: the funds' methodologies on the marketplace). The creed is read
 * from where it is kept, never from the form.
 */
export async function adoptFundAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (!ws.setup) return { error: "Finish Setup first." };
  if (ws.mode === "demo") return { error: "In the demo the shelf is to look at; adopting is in your own app." };
  const setup = ws.setup;
  const id = String(form.get("fund") ?? "");
  return guarded(async () => {
    const { creedMethodology, fundNameOf } = await import("@/lib/fund-creeds");
    const { fundCreedsFor, fundsFor } = await import("@/lib/workspace");
    const [{ creeds, error }, { file }] = await Promise.all([fundCreedsFor(ws), fundsFor(ws)]);
    if (error) throw new SyncError(error, "fund creeds read");
    const fund = fundNameOf(id, file);
    const fresh = starter(setup.profile, modulesFor(setup, ws.book));
    // The person's own figures and dashboard stay, unless one names a class of theirs the fund's draft does not have; then the starter's.
    const m = fund ? ((setup.methodology ? creedMethodology(creeds[id], fund, { figures: setup.methodology.figures, dashboard: setup.methodology.dashboard }) : null) ?? creedMethodology(creeds[id], fund, fresh)) : null;
    if (!m) throw new SyncError("That fund's approach is not on the shelf now.", "fund creed gone");
    await (await vault()).writeJson("methodology_draft", m);
  });
}

// ---------------------------------------------------------------------------
// Shadow methodology and packs from verified analysts (Hamza, 9 Nov 2026, the twenty further ways)

/** Runs a library or listed methodology beside the person's own on the Shadow view, or stops. Nothing of theirs changes. */
export async function setShadowAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  const id = String(form.get("shadow") ?? "").trim();
  const { libraryEntry } = await import("@/lib/library");
  if (id && !libraryEntry(id) && !/^market:[a-z0-9-]{3,60}$/.test(id)) return { error: "That methodology is not on the shelf." };
  const { savePreferences } = await import("@/lib/workspace");
  return guarded(() => savePreferences({ ...ws.preferences, shadow: id || null }));
}

/** Lists some of the person's rules as a pack: a verified analyst only, rules the app tests, credited to their card. */
export async function listPackAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo lists nothing." };
  const ruleIds = form.getAll("rule").map(String);
  const name = String(form.get("name") ?? "").trim();
  const about = String(form.get("about") ?? "").trim();
  if (name.length < 2 || about.length < 2) return { error: "Name the pack and say in a line what it keeps." };
  return guarded(async () => {
    const { myProfile, keepPackListing, packListings } = await import("@/lib/registry");
    const { packListingProblem, packFrom, listingIdFrom } = await import("@/lib/marketplace");
    const card = await myProfile(ws.operator.email);
    const m = ws.setup?.methodology ?? null;
    const problem = packListingProblem(card, m, ruleIds);
    if (problem) throw new SyncError(problem, "pack refused");
    const prev = (await packListings(ws.operator.email)).find((p) => p.mine) ?? null;
    const now = new Date().toISOString();
    await keepPackListing(ws.operator.email, packFrom(m!, ruleIds, { id: prev?.id ?? listingIdFrom(name, Math.random().toString(36).slice(2)), name, about, credit: card!.name, handle: card!.handle, now, listedAt: prev?.listedAt }));
  });
}

export async function unlistPackAction(): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo lists nothing." };
  return guarded(async () => {
    await (await import("@/lib/registry")).unlistPack(ws.operator.email);
  });
}

/** Lays a listed pack on the methodology in use, or on the draft, as a draft to confirm; counted once a person. */
export async function adoptPackAction(_prev: MethodologyState, form: FormData): Promise<MethodologyState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "In the demo the shelf is to look at; packs are added in your own app." };
  const base = ws.draft ?? ws.setup?.methodology ?? null;
  if (!base) return { error: "Choose a methodology on Setup first." };
  return guarded(async () => {
    const { packListing, countPackAdoption } = await import("@/lib/registry");
    const [{ packOf }, { withPack }] = await Promise.all([import("@/lib/marketplace"), import("@/lib/rule-packs")]);
    const l = await packListing(String(form.get("pack") ?? ""), ws.operator.email);
    if (!l) throw new SyncError("That pack is no longer on the shelf.", "pack gone");
    const r = withPack(base, packOf(l));
    if ("error" in r) throw new SyncError(r.error, "pack does not fit");
    await (await vault()).writeJson("methodology_draft", r.draft);
    await countPackAdoption(l.id, ws.operator.email);
  });
}
