"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { ASK_CLAUDE_SENTENCE } from "@/lib/ask-claude";
import { adoptTemplate, libraryEntry } from "@/lib/library";
import { edgarAddressValid } from "@/lib/preferences";
import {
  canonicalTemplate,
  EMPTY_RESEARCH,
  FAMILIES,
  replaceStudy,
  researchFileSchema,
  templateFor,
  templateFromText,
  templateSchema,
  templateSectionSchema,
  tickerOf,
  withoutStudy,
  type Family,
} from "@/lib/research";
import { SyncError } from "@/lib/sync-error";
import { NEEDS_CONTACT, queueStudy, runStudy, type StudyContext } from "@/lib/study-run";
import { getWorkspace, savePreferences } from "@/lib/workspace";

export type ResearchState = { error: string | null };

async function vault() {
  const { openVault } = await import("@/lib/vault");
  return openVault();
}

async function guarded(fn: () => Promise<void>, path = "/research"): Promise<ResearchState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[research] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
  revalidatePath(path);
  revalidatePath("/research");
  return { error: null };
}

const MAX_TEMPLATE_BYTES = 512 * 1024;


// ---------------------------------------------------------------------------
// The SEC contact

/** Keeps the address the SEC will see, once the person has read what is sent and agreed. */
export async function confirmEdgarContactAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo reads no filings." };
  const address = String(form.get("address") ?? "").trim();
  if (!edgarAddressValid(address)) return { error: "Enter one email address the SEC may write to about this traffic." };
  if (form.get("consent") !== "yes") return { error: "Tick the box to confirm the SEC may see this address with each filing request you make." };
  return guarded(() => savePreferences({ ...ws.preferences, edgarContact: { address, consentedAt: new Date().toISOString() } }));
}

/** Removes the address; no filing is read until another is confirmed. */
export async function withdrawEdgarContactAction(): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo reads no filings." };
  return guarded(() => savePreferences({ ...ws.preferences, edgarContact: null }));
}

// ---------------------------------------------------------------------------
// Templates

/** Keeps the person's own template, split by headings, in their vault. */
export async function uploadTemplateAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive" || !ws.setup?.methodology) return { error: "A template needs a confirmed methodology and the app connected to your vault." };
  const file = form.get("template");
  const family = String(form.get("family") ?? "");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a text or Markdown file first." };
  if (file.size > MAX_TEMPLATE_BYTES) return { error: "That file is over 512 KB; a template is a short document." };
  if (!/\.(md|txt|markdown)$/i.test(file.name) && !/^text\//.test(file.type)) return { error: "Attach a text or Markdown file (.md or .txt). A Google Doc can be downloaded as Markdown or plain text." };
  if (!(FAMILIES as readonly string[]).includes(family)) return { error: "Choose the family the template is for." };
  return guarded(async () => {
    let t;
    try {
      t = templateFromText(await file.text(), file.name.replace(/\.(md|txt|markdown)$/i, "").slice(0, 120), family as Family, new Date().toISOString());
    } catch (e) {
      throw new SyncError(e instanceof Error ? e.message : "The template could not be read.", "template parse failed");
    }
    await (await vault()).writeJson("research_template", t);
  });
}

/** Changes one section's guidance in the person's template (the canonical one becomes theirs on first edit). */
export async function editSectionAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive" || !ws.setup?.methodology) return { error: "Editing the template needs the app connected to your vault." };
  const id = String(form.get("id") ?? "");
  const guidance = String(form.get("guidance") ?? "").trim();
  const family = String(form.get("family") ?? "");
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return { error: "Unknown section." };
  if (guidance.length > 2000) return { error: "Keep the guidance under 2000 characters." };
  return guarded(async () => {
    const v = await vault();
    const own = await v.readJson("research_template", templateSchema);
    const base = own ?? canonicalTemplate((FAMILIES as readonly string[]).includes(family) ? (family as Family) : templateFor(ws.setup!.methodology!, null, ws.setup!.baseCurrency).family.family, new Date().toISOString());
    if (!base.sections.some((s) => s.id === id)) throw new SyncError("That section is not in your template.", "section not found");
    const sections = base.sections.map((s) => (s.id === id ? templateSectionSchema.parse({ ...s, guidance }) : s));
    await v.writeJson("research_template", templateSchema.parse({ ...base, sections, origin: "edited", updated: new Date().toISOString() }));
  });
}

/** Chooses another family's canonical template (kept as the person's own, so it sticks). */
export async function chooseFamilyAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive" || !ws.setup?.methodology) return { error: "Choosing a template needs the app connected to your vault." };
  const family = String(form.get("family") ?? "");
  if (!(FAMILIES as readonly string[]).includes(family)) return { error: "Unknown family." };
  return guarded(async () => {
    await (await vault()).writeJson("research_template", canonicalTemplate(family as Family, new Date().toISOString()));
  });
}

/** Keeps a ready-made methodology's own stock template as the person's. */
export async function useLibraryTemplateAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive" || !ws.setup?.methodology) return { error: "Choosing a template needs the app connected to your vault." };
  const entry = libraryEntry(String(form.get("library") ?? ""));
  const t = entry ? adoptTemplate(entry, new Date().toISOString()) : null;
  if (!t) return { error: "That methodology has no template of its own." };
  return guarded(async () => {
    await (await vault()).writeJson("research_template", t);
  });
}

/** Back to the canonical template for the methodology's family. */
export async function resetTemplateAction(): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo shows the canonical template." };
  return guarded(async () => {
    await (await vault()).removeFile("research_template");
  });
}

// ---------------------------------------------------------------------------
// Studies

/**
 * Queues a study and starts its run: the template as it stands today is
 * frozen into it, the screen goes to the study, and the run carries on in
 * the background (`after`) with the vault this request opened. The person
 * can leave; Notifications says when the study is ready.
 */
export async function queueStudyAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo runs no research. Sign in and it runs with the AI." };
  const m = ws.setup?.methodology;
  if (!m) return { error: "Confirm a methodology first; the study follows its template." };
  if (!ws.askClaude && !ws.hasModelKey) return { error: "The AI is not set up on this deployment yet." };
  const subject = String(form.get("subject") ?? "").trim();
  const question = String(form.get("question") ?? "").trim();
  if (!subject || subject.length > 60) return { error: "Name a ticker or a subject, up to 60 characters." };
  if (question.length > 600) return { error: "Keep the question under 600 characters." };
  if (tickerOf(subject) && !ws.preferences.edgarContact) return { error: NEEDS_CONTACT };
  let id = "";
  let v: Awaited<ReturnType<typeof vault>> | null = null;
  const c = studyContextOf(ws);
  const state = await guarded(async () => {
    v = await vault();
    id = await queueStudy(c!, v, subject, question, new Date().toISOString());
  });
  if (state.error) return state;
  const opened = v!;
  // The beta: a study on request is written by the person's own Claude (get_studies_to_write, write_study); the study's page carries the prompt.
  if (!ws.askClaude) after(() => runStudy(c!, opened, id));
  redirect(`/research/${id}`);
}

/** Puts a stopped study (failed, or a run cut short) back to work, keeping what was written, and starts the run again. */
export async function retryStudyAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  const id = String(form.get("id") ?? "");
  if (ws.mode !== "drive") return { error: "The demo runs no research." };
  if (ws.askClaude) return { error: ASK_CLAUDE_SENTENCE };
  if (!/^[a-f0-9]{12}$/.test(id)) return { error: "Unknown study." };
  let v: Awaited<ReturnType<typeof vault>> | null = null;
  let pending = 0;
  const state = await guarded(async () => {
    v = await vault();
    const file = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
    const study = file.studies.find((s) => s.id === id);
    if (!study) throw new SyncError("That study is no longer in your vault.", "study not found");
    pending = study.pending.length;
    const now = new Date().toISOString();
    await v.writeJson("research", replaceStudy(file, { ...study, status: pending ? "running" : "done", touchedAt: now, finishedAt: pending ? null : now, error: null }, now));
  }, `/research/${id}`);
  if (state.error) return state;
  const c = studyContextOf(ws);
  if (pending && c) {
    const opened = v!;
    after(() => runStudy(c, opened, id));
  }
  return state;
}

export async function removeStudyAction(_prev: ResearchState, form: FormData): Promise<ResearchState> {
  const ws = await getWorkspace();
  const id = String(form.get("id") ?? "");
  if (ws.mode !== "drive") return { error: "The demo has no studies." };
  if (!/^[a-f0-9]{12}$/.test(id)) return { error: "Unknown study." };
  const state = await guarded(async () => {
    const v = await vault();
    const file = (await v.readJson("research", researchFileSchema)) ?? EMPTY_RESEARCH;
    await v.writeJson("research", withoutStudy(file, id, new Date().toISOString()));
  });
  if (state.error) return state;
  redirect("/research");
}

/** What a study's run reads, from the signed-in workspace; null without a methodology. */
function studyContextOf(ws: Awaited<ReturnType<typeof getWorkspace>>): StudyContext | null {
  const m = ws.mode === "drive" ? ws.setup?.methodology : null;
  return m ? { m, contact: ws.preferences.edgarContact ?? null, book: ws.book, baseCurrency: ws.setup!.baseCurrency } : null;
}
