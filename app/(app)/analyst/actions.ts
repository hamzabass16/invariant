"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ASK_CLAUDE_SENTENCE } from "@/lib/ask-claude";
import {
  analystFileSchema,
  approveLesson,
  EMPTY_ANALYST,
  HISTORY_TURNS,
  MAX_QUESTION_CHARS,
  newThread,
  proposeLesson,
  withMessages,
  withoutLesson,
  withoutThread,
  withThread,
  type AnalystFile,
  type Message,
} from "@/lib/analyst";
import { providerFor } from "@/lib/hosted-model";
import { CUSTOM_PREFIX, MAX_CUSTOM_FIGURES } from "@/lib/preferences";
import { figureSchema } from "@/lib/recipes";
import { reportsFileSchema } from "@/lib/report";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";

import { getWorkspace, savePreferences } from "@/lib/workspace";

export type AnalystState = { error: string | null };

const THREAD_ID = /^[a-f0-9]{12}$/;
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

async function vault() {
  const { openVault } = await import("@/lib/vault");
  return openVault();
}

async function guarded(fn: () => Promise<void>, path = "/analyst"): Promise<AnalystState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[analyst] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
  revalidatePath(path);
  revalidatePath("/analyst");
  return { error: null };
}

/** A cap or a missing thread is a sentence for the screen, never a crash. */
const asSync = (e: unknown, detail: string) => new SyncError(e instanceof Error ? e.message : "The conversation could not be kept.", detail);

/**
 * Asks the analyst one question, in a new conversation or an existing one.
 * The question and the answer, with its trace, go into the vault together;
 * lessons the analyst proposed are recorded as proposals. The call runs on
 * the person's own key, read here and dropped.
 */
export async function askAction(_prev: AnalystState, form: FormData): Promise<AnalystState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo runs no analyst. Sign in and it runs with the AI." };
  if (ws.askClaude) return { error: ASK_CLAUDE_SENTENCE };
  const m = ws.setup?.methodology;
  if (!ws.setup || !m) return { error: "Confirm a methodology first; the analyst answers from it." };
  if (!ws.hasModelKey) return { error: "The AI is not set up on this deployment yet." };
  const question = String(form.get("question") ?? "").trim();
  const threadId = String(form.get("thread") ?? "");
  if (question.length < 3) return { error: "Ask a question." };
  if (question.length > MAX_QUESTION_CHARS) return { error: `Keep the question under ${MAX_QUESTION_CHARS} characters.` };
  if (threadId && !THREAD_ID.test(threadId)) return { error: "Unknown conversation." };
  const setup = ws.setup;
  let id = threadId;
  const state = await guarded(async () => {
    const v = await vault();
    const now = new Date().toISOString();
    let file = (await v.readJson("analyst", analystFileSchema)) ?? EMPTY_ANALYST;
    let thread = id ? file.threads.find((t) => t.id === id) : undefined;
    if (id && !thread) throw new SyncError("That conversation is no longer in your vault.", "thread not found");
    if (!thread) {
      id = newId();
      thread = newThread(id, question, now);
      try {
        file = withThread(file, thread, now);
      } catch (e) {
        throw asSync(e, "thread cap");
      }
    }
    const provider = await providerFor(v);
    if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "no provider");
    const reports = await v.readJson("reports", reportsFileSchema);
    const history = thread.messages.slice(-HISTORY_TURNS * 2).map((x) => ({ role: x.role, text: x.text }));
    const { askAnalyst } = await import("@/lib/analyst-agent");
    const out = await askAnalyst(provider, {
      methodology: m,
      setup,
      book: ws.book,
      corpus: { research: ws.research, reports, records: ws.records },
      lessons: file.lessons,
      today: localDay(),
      inputs: setup.inputs,
      history,
      question,
    }, ws.preferences.edgarContact);
    const done = new Date().toISOString();
    const messages: Message[] = [
      { role: "person", text: question, at: now, trace: [], figures: [] },
      { role: "analyst", text: out.text.slice(0, 16000), at: done, trace: out.trace, figures: out.figures },
    ];
    let next: AnalystFile;
    try {
      next = withMessages(file, id, messages, done);
      for (const l of out.lessons) next = proposeLesson(next, { id: newId(), text: l.text.slice(0, 600), reason: l.reason.slice(0, 600), threadId: id, at: done }, done);
    } catch (e) {
      throw asSync(e, "message or lesson cap");
    }
    await v.writeJson("analyst", next);
  }, id ? `/analyst/${id}` : "/analyst");
  if (state.error) return state;
  if (!threadId) redirect(`/analyst/${id}`);
  return state;
}

export async function removeThreadAction(_prev: AnalystState, form: FormData): Promise<AnalystState> {
  const ws = await getWorkspace();
  const id = String(form.get("id") ?? "");
  if (ws.mode !== "drive") return { error: "The demo has no conversations." };
  if (!THREAD_ID.test(id)) return { error: "Unknown conversation." };
  const state = await guarded(async () => {
    const v = await vault();
    const file = (await v.readJson("analyst", analystFileSchema)) ?? EMPTY_ANALYST;
    await v.writeJson("analyst", withoutThread(file, id, new Date().toISOString()));
  });
  if (state.error) return state;
  redirect("/analyst");
}

/** Keeps a figure the analyst computed as one of the person's own (lib/preferences.ts), so it shows on the Dashboard from now on. */
export async function keepFigureAction(_prev: AnalystState, form: FormData): Promise<AnalystState> {
  const ws = await getWorkspace();
  const threadId = String(form.get("thread") ?? "");
  const index = Number(form.get("message") ?? -1);
  const figureId = String(form.get("figure") ?? "");
  if (ws.mode !== "drive") return { error: "The demo keeps nothing." };
  if (!THREAD_ID.test(threadId) || !Number.isInteger(index) || index < 0) return { error: "Unknown message." };
  const thread = ws.analyst.threads.find((t) => t.id === threadId);
  const figure = thread?.messages[index]?.figures.find((f) => f.id === figureId);
  if (!figure) return { error: "That figure is not in the conversation." };
  if (ws.preferences.figures.length >= MAX_CUSTOM_FIGURES) return { error: `${MAX_CUSTOM_FIGURES} figures of your own at most. Remove one on Customise first.` };
  const taken = new Set([...ws.preferences.figures.map((f) => f.id), ...(ws.setup?.methodology?.figures.map((f) => f.id) ?? [])]);
  let id = `${CUSTOM_PREFIX}${figure.id.replace(new RegExp(`^${CUSTOM_PREFIX}`), "")}`.slice(0, 36);
  for (let n = 2; taken.has(id); n += 1) id = `${id.replace(/-\d+$/, "")}-${n}`;
  const kept = figureSchema.parse({ ...figure, id });
  return guarded(() => savePreferences({ ...ws.preferences, figures: [...ws.preferences.figures, kept] }), `/analyst/${threadId}`);
}

export async function approveLessonAction(_prev: AnalystState, form: FormData): Promise<AnalystState> {
  const ws = await getWorkspace();
  const id = String(form.get("id") ?? "");
  if (ws.mode !== "drive") return { error: "The demo has no lessons." };
  if (!THREAD_ID.test(id)) return { error: "Unknown lesson." };
  return guarded(async () => {
    const v = await vault();
    const file = (await v.readJson("analyst", analystFileSchema)) ?? EMPTY_ANALYST;
    if (!file.lessons.some((l) => l.id === id)) throw new SyncError("That lesson is no longer in your vault.", "lesson not found");
    await v.writeJson("analyst", approveLesson(file, id, new Date().toISOString()));
  });
}

export async function discardLessonAction(_prev: AnalystState, form: FormData): Promise<AnalystState> {
  const ws = await getWorkspace();
  const id = String(form.get("id") ?? "");
  if (ws.mode !== "drive") return { error: "The demo has no lessons." };
  if (!THREAD_ID.test(id)) return { error: "Unknown lesson." };
  return guarded(async () => {
    const v = await vault();
    const file = (await v.readJson("analyst", analystFileSchema)) ?? EMPTY_ANALYST;
    await v.writeJson("analyst", withoutLesson(file, id, new Date().toISOString()));
  });
}
