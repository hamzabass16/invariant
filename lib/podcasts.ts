import { z } from "zod";

import { htmlToText } from "@/lib/earnings";
import { NEWSLETTER_MODEL } from "@/lib/newsletters";
import { READ_BEHIND } from "@/lib/investigate";

/**
 * Podcasts (Hamza, 20 Oct 2026): like the newsletters, the shows a person
 * follows, each new episode read from its transcript on podscripts.co and
 * written up on the AI: what was said, and a perspective on
 * it in the light of their holdings, watchlist, theses and methodology. Only
 * the write-up is kept, in the vault's `podcasts` file, never the transcript.
 * The pages are read by lib/podcast-feed.ts alone; everything here is pure.
 */

export const PODSCRIPTS = "https://podscripts.co";
export const PODCAST_MODEL = NEWSLETTER_MODEL;

/** All-In, the first show every person follows until they remove it (Hamza, 20 Oct 2026). */
export const DEFAULT_SHOWS: readonly PodcastShow[] = [{ slug: "all-in-with-chamath-jason-sacks-friedberg", title: "All-In with Chamath, Jason, Sacks & Friedberg", addedAt: "2026-10-20" }];

/** Shows a person can follow at once. */
export const MAX_SHOWS = 12;
/** Episodes newer than this many days are written up; older ones are left alone. */
export const PODCAST_DAYS = 14;
/** Episodes written up per run, across the shows, newest first: each is one long call on the person's key. */
export const EPISODES_PER_RUN = 3;
/** The longest transcript sent to the model; the rest is cut and the model told so. */
export const PODCAST_MAX_CHARS = 120_000;
/** Episodes kept, newest first. */
export const MAX_EPISODES = 200;

const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const podcastShowSchema = z.object({
  slug: z.string().regex(SLUG),
  title: z.string().min(1).max(200),
  /** The day it was followed, YYYY-MM-DD. */
  addedAt: z.string().regex(DAY),
});
export type PodcastShow = z.infer<typeof podcastShowSchema>;

const pointSchema = z.object({
  headline: z.string().min(1).max(100),
  line: z.string().max(320),
  symbols: z.array(z.string().max(24)).max(8).default([]),
});

/** What the model records: the episode in a few lines, and what it means for this person. */
const modelReadingSchema = z.object({
  summary: z.string().min(1).max(600),
  points: z.array(pointSchema).max(8),
  perspective: z.object({
    text: z.string().min(1).max(1200),
    symbols: z.array(z.string().max(24)).max(12).default([]),
    sections: z.array(z.string().max(24)).max(8).default([]),
  }),
});
export type PodcastReading = z.infer<typeof modelReadingSchema>;

export const episodeSchema = z.object({
  /** The show's slug and the episode's, joined by a slash: podscripts.co's own path. */
  id: z.string().min(3).max(330),
  show: z.string().regex(SLUG),
  title: z.string().min(1).max(300),
  /** The episode's own date, YYYY-MM-DD. */
  date: z.string().regex(DAY),
  status: z.enum(["read", "failed"]),
  reading: modelReadingSchema.nullable().default(null),
  /** Whether the transcript was longer than the model was sent. */
  cut: z.boolean().default(false),
  /** Why it could not be read, as a sentence; tried again on the next run. */
  error: z.string().max(400).nullable().default(null),
  readAt: z.string(),
});
export type Episode = z.infer<typeof episodeSchema>;

export const podcastsFileSchema = z.object({
  version: z.literal(1),
  shows: z.array(podcastShowSchema).max(MAX_SHOWS),
  episodes: z.array(episodeSchema).max(MAX_EPISODES).default([]),
  updated: z.string(),
});
export type PodcastsFile = z.infer<typeof podcastsFileSchema>;

/** A person who never chose follows All-In; one who removed every show follows none. */
export const EMPTY_PODCASTS: PodcastsFile = { version: 1, shows: [...DEFAULT_SHOWS], episodes: [], updated: "" };

/** The show's page on podscripts.co. */
export const showUrl = (slug: string) => `${PODSCRIPTS}/podcasts/${slug}`;
/** An episode's page on podscripts.co. */
export const episodeUrl = (show: string, slug: string) => `${PODSCRIPTS}/podcasts/${show}/${slug}`;

/**
 * The show's slug from what the person typed: its podscripts.co address (a
 * show's or an episode's), or the slug itself. Null when it is neither.
 */
export function showSlugOf(input: string): string | null {
  const s = input.trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?podscripts\.co\/podcasts\/([a-z0-9][a-z0-9-]*)/i);
  const slug = (m ? m[1] : s).toLowerCase().replace(/\/+$/, "");
  return SLUG.test(slug) ? slug : null;
}

/** The person's shows with one added at the end (once, by slug), at most MAX_SHOWS. */
export function withShow(file: PodcastsFile, show: PodcastShow, now: string): PodcastsFile {
  if (file.shows.some((s) => s.slug === show.slug)) return file;
  if (file.shows.length >= MAX_SHOWS) throw new Error(`You follow ${MAX_SHOWS} shows already; remove one first.`);
  return { ...file, shows: [...file.shows, show], updated: now };
}

/** The person's shows without one, and that show's episodes with it. */
export function withoutShow(file: PodcastsFile, slug: string, now: string): PodcastsFile {
  return { ...file, shows: file.shows.filter((s) => s.slug !== slug), episodes: file.episodes.filter((e) => e.show !== slug), updated: now };
}

// ---------------------------------------------------------------------------
// podscripts.co's pages

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 15, 2026" as 2026-10-15; null when it is not such a date. */
export function episodeDay(words: string): string | null {
  const m = words.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (month < 0) return null;
  const d = Number(m[2]);
  if (d < 1 || d > 31) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const tagless = (html: string) => htmlToText(html).replace(/\s+/g, " ").trim();

export type Listed = { slug: string; title: string; date: string | null };

/**
 * The episodes a show's page lists, newest first as the page has them: each
 * link to `/podcasts/<show>/<episode>` with its title (a link reading only
 * "N comments" names none), and the "Episode Date:" printed after it before
 * the next episode. Throws when the page lists none, so a page that changed
 * its shape is a sentence, never a quiet week.
 */
export function parseShowPage(html: string, show: string): Listed[] {
  const link = new RegExp(`<a\\b[^>]*href=["'](?:https?://(?:www\\.)?podscripts\\.co)?/podcasts/${show.replace(/[-]/g, "\\-")}/([a-z0-9][a-z0-9-]*)/?["'][^>]*>([\\s\\S]*?)</a>`, "gi");
  // Each episode carries several links: its comments, a category badge ("Technology") and its title, the one inside a heading (27 Oct 2026).
  const found: { slug: string; title: string; heading: boolean; at: number }[] = [];
  for (const m of html.matchAll(link)) {
    const title = tagless(m[2]);
    const at = m.index ?? 0;
    found.push({ slug: m[1].toLowerCase(), title: /^\d+\s+comments?$/i.test(title) ? "" : title, heading: /<h[1-6]\b[^>]*>\s*$/i.test(html.slice(Math.max(0, at - 200), at)), at });
  }
  const dates = [...html.matchAll(/Episode\s+Date:?\s*(?:<[^>]*>\s*)*([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/gi)].map((m) => ({ day: episodeDay(m[1]), at: m.index ?? 0 }));
  const order: string[] = [];
  const bySlug = new Map<string, { title: string; heading: boolean; at: number }>();
  for (const f of found) {
    const prev = bySlug.get(f.slug);
    if (!prev) {
      order.push(f.slug);
      bySlug.set(f.slug, { title: f.title, heading: f.heading && !!f.title, at: f.at });
    } else if (f.title && !prev.heading && (f.heading || f.title.length > prev.title.length)) bySlug.set(f.slug, { ...prev, title: f.title, heading: f.heading });
  }
  const starts = order.map((s) => bySlug.get(s)!.at);
  const out = order.map((slug, i) => {
    const from = starts[i];
    const to = starts[i + 1] ?? Infinity;
    const date = dates.find((d) => d.at > from && d.at < to)?.day ?? null;
    return { slug, title: bySlug.get(slug)!.title, date };
  });
  const listed = out.filter((e) => e.title);
  if (!listed.length) throw new Error("the show's page lists no episodes");
  return listed;
}

/** The show's title on its page: the first heading, else the page title before " - ", else null. */
export function showTitleOf(html: string): string | null {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const t = h1 ? tagless(h1) : tagless(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").split(/\s+[-|]\s+/)[0];
  return t ? t.replace(/\s*transcripts?$/i, "").slice(0, 200) : null;
}

export type Transcript = { title: string | null; date: string | null; text: string };

/**
 * An episode's page as text: its title, its date and the transcript between
 * the "Transcript" heading and the discussion, with podscripts' "Starting
 * point is hh:mm:ss" markers dropped. Throws when no transcript is found.
 */
export function parseEpisodePage(html: string): Transcript {
  const title = (() => {
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    return h1 ? tagless(h1) || null : null;
  })();
  const text = htmlToText(html);
  const date = episodeDay(text.match(/Episode\s+Date:?\s*([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i)?.[1] ?? "");
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^transcript$/i.test(l.trim()));
  // The transcript opens at its first "Starting point is" marker; the page may set "Discussion (0)" between the heading and it (27 Oct 2026), so a discussion line ends it only once it has begun.
  const marker = start >= 0 ? lines.findIndex((l, i) => i > start && /Starting point is \d{1,2}:\d{2}:\d{2}/i.test(l)) : -1;
  const discussion = (l: string) => /^Discussion\s*\(\d+\)|^There aren't comments yet/i.test(l.trim());
  let from = marker >= 0 ? marker : start + 1;
  while (marker < 0 && start >= 0 && from < lines.length && (discussion(lines[from]) || !lines[from].trim())) from++;
  const endRel = start >= 0 ? lines.slice(from).findIndex(discussion) : -1;
  const body = start >= 0 ? lines.slice(from, endRel >= 0 ? from + endRel : undefined) : [];
  const words = body
    .map((l) => l.replace(/Starting point is \d{1,2}:\d{2}:\d{2}/gi, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (words.length < 1500) throw new Error("the episode's page carries no transcript");
  return { title, date, text: words };
}

/**
 * The listed episodes still to write up, newest first: dated within
 * PODCAST_DAYS of today, not read already (a failed read is tried again), at
 * most EPISODES_PER_RUN across the shows, the newest of each show first so
 * one busy show does not crowd the rest out.
 */
export function episodesToRead(file: PodcastsFile, listed: readonly { show: string; episodes: readonly Listed[] }[], today: string): { show: string; slug: string; title: string; date: string }[] {
  const done = new Set(file.episodes.filter((e) => e.status === "read").map((e) => e.id));
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - PODCAST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const queues = listed.map((l) => l.episodes.filter((e) => e.date && e.date >= since && e.date <= today && !done.has(`${l.show}/${e.slug}`)).map((e) => ({ show: l.show, slug: e.slug, title: e.title, date: e.date! })));
  const out: { show: string; slug: string; title: string; date: string }[] = [];
  for (let round = 0; out.length < EPISODES_PER_RUN && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && out.length < EPISODES_PER_RUN) out.push(q[round]);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Days without a new episode on a show's page before the run says so; a weekly show that goes this long has likely stalled at the source. */
export const STALE_SHOW_DAYS = 10;

/**
 * What a show's listing says when it brings nothing to read (Hamza, 4 Nov
 * 2026: the app showed 23 Oct on 4 Nov and said nothing): a page whose
 * episodes carry no date the app can read, or whose newest dated episode is
 * STALE_SHOW_DAYS old or more, is a sentence naming the newest it found, so
 * a stall at the source or a page that changed is seen on Setup, never a
 * quiet fortnight.
 */
export function listingNotes(listed: readonly { show: string; title: string; episodes: readonly Listed[] }[], today: string): string[] {
  const notes: string[] = [];
  for (const l of listed) {
    const dated = l.episodes.filter((e) => e.date).sort((a, b) => (b.date as string).localeCompare(a.date as string));
    if (!dated.length) {
      notes.push(`${l.title}: podscripts.co lists ${l.episodes.length} episode${l.episodes.length === 1 ? "" : "s"} but no date the app can read, so none is written up`);
      continue;
    }
    const newest = dated[0];
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${newest.date}T00:00:00Z`)) / 86_400_000);
    if (days >= STALE_SHOW_DAYS) notes.push(`${l.title}: the newest episode podscripts.co lists is "${newest.title.slice(0, 120)}", dated ${newest.date}, ${days} days ago`);
  }
  return notes;
}

/** The file with new episodes in: one per id (a re-read replaces the failed one), newest first, at most MAX_EPISODES. */
export function keepEpisodes(file: PodcastsFile, episodes: readonly Episode[], now: string): PodcastsFile {
  if (!episodes.length) return file;
  const fresh = new Set(episodes.map((e) => e.id));
  const all = [...episodes, ...file.episodes.filter((e) => !fresh.has(e.id))].sort((a, b) => b.date.localeCompare(a.date) || b.readAt.localeCompare(a.readAt));
  return { ...file, episodes: all.slice(0, MAX_EPISODES), updated: now };
}

/** Episodes written up within `days` of `today`, newest first, read ones only. */
export function episodesOfWeek(file: PodcastsFile | null, today: string, days = PODCAST_DAYS): Episode[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  return (file?.episodes ?? []).filter((e) => e.status === "read" && e.reading && e.date >= since);
}

/** The episodes of the fortnight still not written up, newest first: the ones a run tries again. One older than that is never tried again, so it is not counted (27 Oct 2026). */
export function failedOfWeek(file: PodcastsFile | null, today: string, days = PODCAST_DAYS): Episode[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  return (file?.episodes ?? []).filter((e) => e.status === "failed" && e.date >= since);
}

/** One line for the sync status: what this run read. */
export function podcastsSentence(r: { read: number; failed: number; problems: string[] }): string {
  if (!r.read && !r.failed && !r.problems.length) return "No new podcast episodes.";
  return [r.read ? `${r.read} episode${r.read === 1 ? "" : "s"} written up` : null, r.failed ? `${r.failed} not read` : null, ...r.problems].filter(Boolean).join("; ") + ".";
}

// ---------------------------------------------------------------------------
// The model call

/** What the model is told about the person, so its perspective is theirs: no amount, only weights, classes, theses and rules. */
export type PodcastContext = {
  holdings: { symbol: string; name: string | null; weight: number; classLabel: string | null }[];
  watchlist: string[];
  theses: { subject: string; text: string }[];
  methodology: { name: string; summary: string; classes: { label: string; test: string }[]; rules: { section: string; text: string }[] } | null;
};

export type PodcastInput = { show: string; title: string; date: string; text: string; cut: boolean; context: PodcastContext };

/** The transcript as sent: at most PODCAST_MAX_CHARS, cut at a line, with whether it was cut. */
export function transcriptText(text: string): { text: string; cut: boolean } {
  if (text.length <= PODCAST_MAX_CHARS) return { text, cut: false };
  const head = text.slice(0, PODCAST_MAX_CHARS);
  const at = head.lastIndexOf("\n");
  return { text: at > PODCAST_MAX_CHARS * 0.8 ? head.slice(0, at) : head, cut: true };
}

function contextWords(c: PodcastContext): string {
  const lines: string[] = [];
  lines.push(c.holdings.length ? `Holdings, by weight of the book: ${c.holdings.map((h) => `${h.symbol}${h.name && h.name !== h.symbol ? ` (${h.name})` : ""} ${h.weight.toFixed(1)}%${h.classLabel ? `, ${h.classLabel}` : ""}`).join("; ")}.` : "Holdings: none listed.");
  lines.push(c.watchlist.length ? `Watchlist: ${c.watchlist.join(", ")}.` : "Watchlist: none.");
  if (c.theses.length) lines.push("Their theses, in their words:", ...c.theses.map((t) => `- ${t.subject}: ${t.text.replace(/\s+/g, " ").slice(0, 400)}`));
  if (c.methodology) {
    const m = c.methodology;
    lines.push(`Their methodology, "${m.name}": ${m.summary.replace(/\s+/g, " ").slice(0, 600)}`);
    if (m.classes.length) lines.push("Its classes:", ...m.classes.map((x) => `- ${x.label}: ${x.test.slice(0, 300)}`));
    if (m.rules.length) lines.push("Its rules:", ...m.rules.slice(0, 40).map((r) => `- ${r.section}: ${r.text.replace(/\s+/g, " ").slice(0, 240)}`));
  } else lines.push("Methodology: none confirmed yet.");
  return lines.join("\n");
}

/** The Messages request that writes up one episode: one call to record_episode, text only, so any provider can make it. */
export function podcastRequestBody(input: PodcastInput, model = PODCAST_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelReadingSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const symbols = [...input.context.holdings.map((h) => h.symbol), ...input.context.watchlist];
  const sections = input.context.methodology?.rules.map((r) => r.section) ?? [];
  return {
    model,
    max_tokens: 3000,
    system: `You read the transcript of one podcast episode a person follows, for their own portfolio app, and record what was said and what it means for them.

Rules:
- summary: three sentences at most, in plain words: what the episode was about and what its hosts argued. No praise.
- points: up to eight of its arguments or stories that bear on investing, markets, companies or the economy, each a short headline and one line, in the order they came. A figure is copied as it was said, with the speaker's words as its source; never compute or add one. Banter, ads, sponsors and personal stories are not points.
- symbols on a point: only from the person's holdings and watchlist (${symbols.length ? symbols.join(", ") : "none listed"}), and only when the point is about that company or plainly moves it.
- perspective.text: two to five sentences on what the episode means for this person, read against their holdings, watchlist, theses and methodology below: which holdings or theses it bears on and how (supports, challenges, a risk to watch), and which of their methodology's rules or classes a point touches, naming its section. Say plainly when it bears on none of them. No advice to buy, sell or hold; the person decides, and the verdict on a holding is their methodology's, not yours.
- perspective.symbols: the holdings and watchlist symbols the perspective names. perspective.sections: the methodology's rule sections it names${sections.length ? ` (from ${sections.join(", ")})` : " (none: no methodology yet)"}.
${READ_BEHIND} In the perspective, say what is behind what the hosts argued (who is speaking, what they hold or sell, what changed since they last said it) only where the transcript shows it.
- Your whole answer is one call to record_episode; write nothing outside it.

The person:
${contextWords(input.context)}`,
    tools: [{ name: "record_episode", description: "Record what the episode says and what it means for the person.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${input.show}, "${input.title}", ${input.date}${input.cut ? " (the first part of the transcript; the rest was cut for length)" : ""}. The transcript, machine-made, with no speaker names:\n\n${input.text}\n\nRecord this episode.` }] }],
  };
}

export type PodcastParse = { ok: true; reading: PodcastReading } | { ok: false; reason: string };

/** Reads the answer: the one record_episode call, validated; a symbol outside the person's holdings and watchlist and a section the methodology lacks are dropped. */
export function parsePodcastResponse(body: unknown, context: PodcastContext): PodcastParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_episode");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the episode" };
  const parsed = modelReadingSchema.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)` };
  const known = new Set([...context.holdings.map((h) => h.symbol.toUpperCase()), ...context.watchlist.map((s) => s.toUpperCase())]);
  const rules = new Set((context.methodology?.rules ?? []).map((r) => r.section.trim().toLowerCase()));
  const keep = (xs: readonly string[]) => [...new Set(xs.map((s) => s.trim().toUpperCase()))].filter((s) => known.has(s));
  const r = parsed.data;
  return {
    ok: true,
    reading: {
      summary: r.summary,
      points: r.points.map((p) => ({ ...p, symbols: keep(p.symbols) })),
      perspective: { text: r.perspective.text, symbols: keep(r.perspective.symbols), sections: [...new Set(r.perspective.sections.map((s) => s.trim()))].filter((s) => rules.has(s.toLowerCase())) },
    },
  };
}
