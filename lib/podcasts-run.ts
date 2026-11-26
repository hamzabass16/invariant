import "server-only";

import { providerFor } from "@/lib/hosted-model";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { loadShow, loadTranscript } from "@/lib/podcast-feed";
import { EMPTY_PODCASTS, EPISODES_PER_RUN, episodesToRead, keepEpisodes, listingNotes, parsePodcastResponse, PODCAST_MODEL, podcastRequestBody, podcastsFileSchema, podcastsSentence, transcriptText, type Episode, type Listed, type PodcastContext, type PodcastsFile } from "@/lib/podcasts";
import { deriveScreens } from "@/lib/screen-data";
import { SyncError } from "@/lib/sync-error";
import { thesesFileSchema, type ThesesFile } from "@/lib/theses";
import { methodologyView } from "@/lib/thesis-review";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";
import { vaultWorkspace, type Workspace } from "@/lib/workspace";

/**
 * The podcasts a person follows, read on their own model (Hamza, 20 Oct
 * 2026): each show's page on podscripts.co is read for its episodes, and
 * each new one within PODCAST_DAYS is written up from its transcript, a few
 * per run, with a perspective against the person's own holdings and their
 * weights and classes, watchlist, theses and methodology. Only the write-up
 * is kept, in the vault's `podcasts` file; the transcript is never kept, and
 * no amount of money goes to the model. Runs in the morning refresh and on
 * opening the app; a failure is a sentence on the episode, tried again on
 * the next run.
 */

/** What the model is told about the person: the book's weights and classes, the watchlist, the theses' words and the methodology's classes and rules; never an amount. */
export function contextFor(ws: Workspace, theses: ThesesFile | null): PodcastContext {
  const book = ws.fullBook ?? ws.book;
  const setup = ws.baseSetup ?? ws.setup;
  const today = localDay();
  const data = book && setup ? deriveScreens({ book, methodology: setup.methodology, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today) : null;
  const holdings = (data?.weights ?? []).map((w) => ({ symbol: w.symbol, name: w.name ?? null, weight: w.weight, classLabel: w.classId ? w.classLabel : null }));
  const held = new Set(holdings.map((h) => h.symbol.toUpperCase()));
  const watchlist = Object.keys(ws.records.bySymbol)
    .map((s) => s.toUpperCase())
    .filter((s) => !held.has(s))
    .sort();
  const stock = Object.entries(theses?.bySymbol ?? {})
    .filter(([, t]) => t.text.trim())
    .map(([s, t]) => ({ subject: s.toUpperCase(), text: [t.text, t.pillars.length ? `Pillars: ${t.pillars.map((p) => p.name).join(", ")}.` : ""].join(" ") }));
  const markets = (theses?.markets ?? []).filter((m) => m.text.trim()).map((m) => ({ subject: `Market thesis "${m.title}"`, text: m.text }));
  const m = setup?.methodology ?? null;
  const view = m ? methodologyView(m, setup?.baseCurrency ?? "USD", null) : null;
  return {
    holdings,
    watchlist,
    theses: [...stock, ...markets].slice(0, 30),
    methodology: view ? { name: view.name, summary: view.summary, classes: view.classes.map((c) => ({ label: c.label, test: c.test })), rules: view.rules.map((r) => ({ section: r.section, text: r.text })) } : null,
  };
}

export type PodcastRun = { read: number; failed: number; problems: string[]; sentence: string };

/** One episode written up on the person's provider; a failed read is kept as a sentence and tried again. */
async function writeUp(provider: ModelProvider, show: string, ep: { show: string; slug: string; title: string; date: string }, context: PodcastContext, now: string): Promise<Episode> {
  const base = { id: `${ep.show}/${ep.slug}`, show: ep.show, title: ep.title.slice(0, 300), date: ep.date, readAt: now };
  const got = await loadTranscript(ep.show, ep.slug);
  if ("problem" in got) return { ...base, status: "failed", reading: null, cut: false, error: `${got.problem}; tried again on the next run.` };
  const { text, cut } = transcriptText(got.text);
  try {
    const body = podcastRequestBody({ show, title: got.title ?? ep.title, date: got.date ?? ep.date, text, cut, context }, modelFor(provider, process.env.ANTHROPIC_NEWSLETTER_MODEL || PODCAST_MODEL));
    const parsed = parsePodcastResponse(await callModel(provider, body as ModelRequest, { agent: "newsletter_reader", step: "podcast", subject: ep.show }), context);
    if (!parsed.ok) return { ...base, status: "failed", reading: null, cut, error: `Not written up: ${parsed.reason}; tried again on the next run.` };
    return { ...base, status: "read", reading: parsed.reading, cut, error: null };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[podcasts] episode: ${e.logDetail ?? "read failed"}`);
    return { ...base, status: "failed", reading: null, cut, error: `${e.message.slice(0, 300)} Tried again on the next run.` };
  }
}

/**
 * Reads the shows the person follows and writes up what is new, at most
 * `max` episodes. Null when there is nothing to do (no show, nothing new), so
 * a quiet morning adds no line to the sync status.
 */
export async function readPodcastsInto(vault: Vault, email: string, now: Date, max = EPISODES_PER_RUN, ws?: Workspace): Promise<PodcastRun | null> {
  const file = (await vault.readJson("podcasts", podcastsFileSchema)) ?? EMPTY_PODCASTS;
  if (!file.shows.length) return null;
  const problems: string[] = [];
  const listed: { show: string; episodes: Listed[] }[] = [];
  for (const s of file.shows) {
    const got = await loadShow(s.slug);
    if ("problem" in got) problems.push(`${s.title}: ${got.problem}`);
    else listed.push({ show: s.slug, episodes: got.episodes });
  }
  const today = localDay(now);
  const todo = episodesToRead(file, listed, today).slice(0, max);
  if (!todo.length) {
    // Nothing to read: say why when a show's page carries no date or has gone quiet, so a stall at the source shows on Setup.
    const titles = new Map(file.shows.map((s) => [s.slug, s.title]));
    problems.push(...listingNotes(listed.map((l) => ({ ...l, title: titles.get(l.show) ?? l.show })), today));
    return problems.length ? { read: 0, failed: 0, problems, sentence: podcastsSentence({ read: 0, failed: 0, problems }) } : null;
  }
  const provider = await providerFor(vault);
  if (!provider) {
    const p = [...problems, `${todo.length} new episode${todo.length === 1 ? "" : "s"} waiting: the AI is not set up on this deployment yet`];
    return { read: 0, failed: 0, problems: p, sentence: podcastsSentence({ read: 0, failed: 0, problems: p }) };
  }
  const workspace = ws ?? (await vaultWorkspace({ name: null, email, image: null }, vault));
  const theses = await vault.readJson("theses", thesesFileSchema).catch(() => null);
  const context = contextFor(workspace, theses);
  const iso = now.toISOString();
  const titles = new Map(file.shows.map((s) => [s.slug, s.title]));
  const episodes: Episode[] = [];
  for (const ep of todo) episodes.push(await writeUp(provider, titles.get(ep.show) ?? ep.show, ep, context, iso));
  // Read again just before writing, so a show added or removed meanwhile on Setup is kept.
  const latest: PodcastsFile = (await vault.readJson("podcasts", podcastsFileSchema)) ?? file;
  const following = new Set(latest.shows.map((s) => s.slug));
  await vault.writeJson("podcasts", keepEpisodes(latest, episodes.filter((e) => following.has(e.show)), iso));
  const read = episodes.filter((e) => e.status === "read").length;
  const failed = episodes.length - read;
  return { read, failed, problems, sentence: podcastsSentence({ read, failed, problems }) };
}
