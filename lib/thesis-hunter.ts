import { z } from "zod";

import { INVESTIGATIVE } from "@/lib/investigate";
import { MODELS } from "@/lib/models";
import { digestDate, digestsOfWeek, type NewslettersFile } from "@/lib/newsletters";
import { episodesOfWeek, episodeUrl, type PodcastsFile } from "@/lib/podcasts";
import { figureWriteSchema, publicImageUrl, ThesisWriteProblem, withFigures, thesisFigureSchema, type FigureWrite, type MarketThesis, type Thesis, type ThesesFile } from "@/lib/theses";

/**
 * The Thesis Hunter (Hamza, 20 Oct 2026): every day the AI
 * hunts for what bears on each of their theses, on the web (a few searches,
 * Claude only), in the newsletters they forward and in the podcasts they
 * follow, and records what it found: what it says, whether it backs the
 * thesis, challenges it or is an update, the pillar it bears on, its source
 * with its page, and a chart from figures the page prints or a picture the
 * page or newsletter carries. A find never changes the thesis: it is kept in
 * the vault's `thesis_hunter` file and shown under "Added by Thesis Hunter"
 * on the thesis, for the person to read or dismiss. Pure: the subjects due,
 * the material, the request and the parse; lib/thesis-hunter-run.ts runs it.
 */

export const HUNTER_MODEL = MODELS.standard;
/** Theses hunted per morning run, the longest unhunted first; each is hunted at most once every HUNT_EVERY_DAYS. */
export const HUNTS_PER_RUN = 4;
/** Each thesis is hunted once a week, to keep the cost on the person's key down (Hamza, 20 Oct 2026); Hunt now runs one at any time. */
export const HUNT_EVERY_DAYS = 7;
/** Web searches per thesis. */
export const HUNTER_SEARCHES = 4;
/** What counts as new: sources from the last this many days. */
export const HUNTER_DAYS = 14;
/** Finds recorded per hunt, at most. */
export const FINDS_PER_HUNT = 4;
/** Finds kept per thesis, newest first. */
export const MAX_FINDS = 24;
/** Newsletter and podcast items given to the model per hunt, at most. */
export const MAX_ITEMS = 24;
/** The Research Agent's kept items handed to one hunt at most. */
export const MAX_FEED = 12;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const STANCES = ["backs", "challenges", "update"] as const;
export type Stance = (typeof STANCES)[number];
export const STANCE_LABEL: Record<Stance, string> = { backs: "Backs the thesis", challenges: "Challenges it", update: "Update" };
export const HUNT_FROM = ["web", "newsletter", "podcast", "feed"] as const;
export type HuntFrom = (typeof HUNT_FROM)[number];
export const FROM_LABEL: Record<HuntFrom, string> = { web: "Web", newsletter: "Newsletter", podcast: "Podcast", feed: "Research Agent" };

export const findSchema = z.object({
  id: z.string().min(1).max(24),
  /** The day the hunter found it. */
  found: z.string().regex(DAY),
  /** The source's own date, when it gives one. */
  date: z.string().regex(DAY).nullable().default(null),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(900),
  stance: z.enum(STANCES),
  /** The pillar it bears on, by name, when one. */
  pillar: z.string().max(80).nullable().default(null),
  from: z.enum(HUNT_FROM),
  source: z.string().min(1).max(200),
  sourceUrl: z.string().max(1000).nullable().default(null),
  /** A chart from figures the source prints, or a picture it carries. */
  figure: thesisFigureSchema.nullable().default(null),
  dismissed: z.boolean().default(false),
});
export type Find = z.infer<typeof findSchema>;

const huntSchema = z.object({
  /** When this thesis was last hunted (ISO instant). */
  huntedAt: z.string().nullable().default(null),
  /** What the last hunt said: what it found, or why nothing. */
  sentence: z.string().max(400).nullable().default(null),
  finds: z.array(findSchema).max(MAX_FINDS).default([]),
});
export type Hunt = z.infer<typeof huntSchema>;

export const thesisHunterFileSchema = z.object({
  version: z.literal(1),
  /** By subject: "stock:MA", "market:<id>". */
  subjects: z.record(z.string().max(60), huntSchema),
  updated: z.string(),
});
export type ThesisHunterFile = z.infer<typeof thesisHunterFileSchema>;
export const EMPTY_HUNTER: ThesisHunterFile = { version: 1, subjects: {}, updated: "" };

/** A thesis's key in the file. */
export const huntKey = (s: { kind: "stock"; symbol: string } | { kind: "market"; id: string }): string => (s.kind === "stock" ? `stock:${s.symbol.toUpperCase()}` : `market:${s.id}`);

/** One thesis's hunt, or an empty one. */
export const huntFor = (file: ThesisHunterFile | null, key: string): Hunt => file?.subjects[key] ?? { huntedAt: null, sentence: null, finds: [] };

/** The finds the person has not dismissed, newest first. */
export const shownFinds = (h: Hunt): Find[] => h.finds.filter((f) => !f.dismissed);

// ---------------------------------------------------------------------------
// What is hunted

export type HuntSubject = { key: string; kind: "stock" | "market"; id: string; title: string; name: string | null; text: string; pathway: string | null; pillars: { name: string; text: string }[]; watch: string[]; signals: string[] };

const stockSubject = (symbol: string, t: Thesis, name: string | null, signals: string[]): HuntSubject => ({ key: huntKey({ kind: "stock", symbol }), kind: "stock", id: symbol.toUpperCase(), title: symbol.toUpperCase(), name, text: t.text, pathway: t.pathway, pillars: t.pillars.map((p) => ({ name: p.name, text: p.text })), watch: t.watch, signals });
const marketSubject = (m: MarketThesis): HuntSubject => ({ key: huntKey({ kind: "market", id: m.id }), kind: "market", id: m.id, title: m.title, name: null, text: m.text, pathway: null, pillars: m.pillars.map((p) => ({ name: p.name, text: p.text })), watch: m.watch, signals: [] });

/** Every thesis with words to hunt for, stock theses then market theses. */
export function huntSubjects(theses: ThesesFile | null, names: Record<string, string | null> = {}, signals: Record<string, string[]> = {}): HuntSubject[] {
  const stocks = Object.entries(theses?.bySymbol ?? {})
    .filter(([, t]) => t.text.trim())
    .map(([s, t]) => stockSubject(s, t, names[s.toUpperCase()] ?? null, signals[s.toUpperCase()] ?? []));
  const markets = (theses?.markets ?? []).filter((m) => m.text.trim()).map(marketSubject);
  return [...stocks, ...markets];
}

/** The theses due today: never hunted first, then the longest since; at most `max`. A thesis hunted in the last HUNT_EVERY_DAYS waits its week out. */
export function subjectsDue(subjects: readonly HuntSubject[], file: ThesisHunterFile | null, today: string, max = HUNTS_PER_RUN): HuntSubject[] {
  const last = (s: HuntSubject) => file?.subjects[s.key]?.huntedAt ?? "";
  const before = new Date(Date.parse(`${today}T00:00:00Z`) - (HUNT_EVERY_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  return subjects
    .filter((s) => last(s).slice(0, 10) < before)
    .sort((a, b) => last(a).localeCompare(last(b)))
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// What the person's own newsletters and podcasts say

export type HuntItem = { ref: string; from: "newsletter" | "podcast" | "feed"; source: string; date: string; url: string | null; text: string; pictures: { ref: string; url: string; alt: string }[] };

const STOP = new Set(["the", "and", "for", "that", "with", "will", "this", "from", "into", "over", "more", "than", "their", "they", "have", "while", "rates", "market", "markets", "thesis", "would", "should", "about", "which"]);
/** The words a market thesis is about, to find the items that speak to it. */
export const themeWords = (s: HuntSubject): string[] => [...new Set(`${s.title} ${s.pillars.map((p) => p.name).join(" ")}`.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])].filter((w) => !STOP.has(w));

/** Whether a line of a newsletter or podcast speaks to the thesis: the symbol named or tagged for a stock, or one of a market thesis's words. */
function touches(s: HuntSubject, symbols: readonly string[], words: string): boolean {
  if (s.kind === "stock") {
    if (symbols.some((x) => x.toUpperCase() === s.id)) return true;
    const w = words.toLowerCase();
    const name = (s.name ?? "").toLowerCase().replace(/[,.]?\s+(inc|corp|corporation|plc|n\.v\.|nv|sa|ag|ltd|holdings?|group|co)\b\.?/g, "").trim();
    return new RegExp(`(^|[^a-z0-9])${s.id.toLowerCase().replace(/[.]/g, "\\.")}([^a-z0-9]|$)`).test(w) || (name.length > 3 && w.includes(name));
  }
  const w = words.toLowerCase();
  return themeWords(s).some((t) => w.includes(t));
}

/** An item the Research Agent kept for the company today (lib/research-agent.ts), handed to the hunter as material (the agents doc, §6). */
export type FeedItem = { title: string; source: string; url: string | null; at: string; text: string | null };

/** The past HUNTER_DAYS of the person's newsletters and podcasts that speak to the thesis, and for a stock the items the Research Agent kept, each with a ref the model cites (N1, P1, F1) and a newsletter point's pictures (N1.1). */
export function materialFor(s: HuntSubject, newsletters: NewslettersFile | null, podcasts: PodcastsFile | null, today: string, feed: readonly FeedItem[] = []): HuntItem[] {
  const items: HuntItem[] = [];
  for (const [i, f] of feed.slice(0, MAX_FEED).entries()) items.push({ ref: `F${i + 1}`, from: "feed", source: f.source.slice(0, 200), date: f.at.slice(0, 10), url: f.url, text: `${f.title}${f.text && f.text !== f.title ? `. ${f.text}` : ""}`.slice(0, 1200), pictures: [] });
  for (const d of digestsOfWeek(newsletters?.digests ?? [], today, HUNTER_DAYS)) {
    for (const p of d.reading!.points) {
      if (!touches(s, p.symbols, `${p.headline} ${p.line}`)) continue;
      const ref = `N${items.filter((i) => i.from === "newsletter").length + 1}`;
      const pictures = (p.images ?? [])
        .map((n) => d.images?.[n])
        .filter((im): im is NonNullable<typeof im> => !!im && publicImageUrl(im.url))
        .slice(0, 4)
        .map((im, k) => ({ ref: `${ref}.${k + 1}`, url: im.url, alt: im.alt ?? im.section ?? "" }));
      items.push({ ref, from: "newsletter", source: `${d.sender}: ${d.subject}`.slice(0, 200), date: digestDate(d).slice(0, 10), url: null, text: `${p.headline}. ${p.line}`, pictures });
    }
  }
  for (const e of episodesOfWeek(podcasts, today, HUNTER_DAYS)) {
    const r = e.reading!;
    const lines = [...r.points.filter((p) => touches(s, p.symbols, `${p.headline} ${p.line}`)).map((p) => `${p.headline}. ${p.line}`), ...(touches(s, r.perspective.symbols, r.perspective.text) ? [r.perspective.text] : [])];
    if (!lines.length) continue;
    const ref = `P${items.filter((i) => i.from === "podcast").length + 1}`;
    items.push({ ref, from: "podcast", source: e.title, date: e.date, url: episodeUrl(e.show, e.id.split("/").slice(1).join("/")), text: lines.join(" ").slice(0, 1200), pictures: [] });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ITEMS);
}

// ---------------------------------------------------------------------------
// The request

const chartSchema = figureWriteSchema.shape.chart.unwrap();
const modelFindSchema = z.object({
  title: z.string().min(1).max(160).describe("What it is, in a few words: the headline."),
  summary: z.string().min(1).max(900).describe("What it says that bears on the thesis, in two or three sentences; every figure as the source prints it, with its date."),
  stance: z.enum(STANCES).describe("backs: it supports the thesis or a pillar; challenges: it cuts against the thesis, a pillar or a kill signal; update: news that bears on it without taking a side."),
  pillar: z.string().max(80).nullable().default(null).describe("The one pillar it bears on, by its name as given; null when none."),
  from: z.enum(HUNT_FROM).describe("web: a page you found by searching; newsletter or podcast: one of the person's own items listed, by its ref; feed: one of the Research Agent's items listed, by its ref."),
  ref: z.string().min(1).max(1000).describe("For web: the page's real https URL. For a newsletter, podcast or feed item: the item's ref as listed (N1, P2, F3)."),
  source: z.string().min(1).max(200).describe("The page's or publication's title."),
  date: z.string().regex(DAY).nullable().default(null).describe("The source's own date, YYYY-MM-DD; null when it gives none."),
  chart: chartSchema.nullable().default(null).describe("A chart of figures the source itself prints (a series over dates, or values over years or quarters), in one unit; null when it prints none. Never a figure you estimate."),
  chartTitle: z.string().max(120).nullable().default(null).describe("The chart's title, when there is a chart."),
  picture: z.string().max(1000).nullable().default(null).describe("A picture that shows it: for a newsletter item, one of its pictures by ref (N1.1); for web, the https address of a chart or image on the page itself (PNG or JPEG). Null when none."),
});
const modelAnswerSchema = z.object({
  finds: z.array(modelFindSchema).max(FINDS_PER_HUNT),
  note: z.string().max(300).default("").describe("When nothing new was found, one sentence saying so."),
});

export type HuntInput = { subject: HuntSubject; today: string; items: readonly HuntItem[]; known: readonly { title: string; url: string | null }[]; web: boolean };

const subjectLines = (s: HuntSubject): string =>
  [
    s.kind === "stock" ? `Stock thesis on ${s.id}${s.name ? ` (${s.name})` : ""}:` : `Market thesis "${s.title}":`,
    s.text.trim(),
    s.pathway ? `Pathway: ${s.pathway}` : "",
    s.pillars.length ? `Pillars:\n${s.pillars.map((p) => `- ${p.name}${p.text ? `: ${p.text}` : ""}`).join("\n")}` : "",
    s.watch.length ? `Watch: ${s.watch.join("; ")}` : "",
    s.signals.length ? `Kill signals and triggers on the record: ${s.signals.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

/** The one call: the thesis, the person's own items that speak to it, what was already found, and the web search when the provider is Claude. */
export function hunterRequestBody(input: HuntInput, model = HUNTER_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelAnswerSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const since = new Date(Date.parse(`${input.today}T00:00:00Z`) - HUNTER_DAYS * 86_400_000).toISOString().slice(0, 10);
  const items = input.items.length
    ? input.items.map((i) => `${i.ref} [${i.from}, ${i.date}] ${i.source}: ${i.text}${i.pictures.length ? `\n   pictures: ${i.pictures.map((p) => `${p.ref}${p.alt ? ` (${p.alt.slice(0, 80)})` : ""}`).join(", ")}` : ""}`).join("\n")
    : "None in the period.";
  const known = input.known.length ? input.known.map((k) => `- ${k.title}${k.url ? ` (${k.url})` : ""}`).join("\n") : "None yet.";
  return {
    model,
    max_tokens: 6000,
    system: `You are the Thesis Hunter for one person's portfolio app. You hunt for what bears on one of their investment theses: research, data, news, charts and pictures published from ${since} to ${input.today}, ${input.web ? `on the web (at most ${HUNTER_SEARCHES} searches) and ` : ""}in the person's own newsletters and podcasts and the items the app's Research Agent kept for the company today, listed below.

Rules:
- Up to ${FINDS_PER_HUNT} finds, the most telling first. A find is something that backs the thesis, challenges it (a pillar weakening, a kill signal nearing) or updates it; leave out what merely repeats what is already found.
- Each find names its source: for web, the real https page you read; for the listed items, the ref as listed. Never a page you did not open, never a date outside the period.
- Every figure is one the source prints, with its date. A chart only from a series or a table the source prints, every value as printed, in one unit; nothing estimated, interpolated or computed.
- A picture only from the source: one of a newsletter item's pictures by its ref, or the https address of an image on the web page itself.
${input.web ? `${INVESTIGATIVE} A find about something the company did that nobody expected says why it did it.
` : ""}- Plain words, no opinion of your own, no advice to buy or sell, no exclamation marks. Whether the thesis holds is the person's call.
- When nothing new bears on it, record no finds and say so in note.
- Your whole answer is one call to record_finds; write nothing outside it.`,
    tools: [...(input.web ? [{ type: "web_search_20250305", name: "web_search", max_uses: HUNTER_SEARCHES }] : []), { name: "record_finds", description: "Record what was found that bears on the thesis.", input_schema: schema }],
    tool_choice: input.web ? { type: "auto" } : { type: "tool", name: "record_finds" },
    messages: [{ role: "user", content: [{ type: "text", text: `${subjectLines(input.subject)}\n\nAlready found (do not repeat):\n${known}\n\nThe person's own newsletters and podcasts that speak to it, and the Research Agent's items (F refs):\n${items}\n\nHunt for what bears on this thesis today, ${input.today}.` }] }],
  };
}

// ---------------------------------------------------------------------------
// The answer

export type HunterParse = { ok: true; finds: Find[]; note: string; dropped: number } | { ok: false; reason: string };

const findId = (iso: string, i: number, taken: ReadonlySet<string>): string => {
  const base = `h${iso.slice(2, 19).replace(/\D/g, "")}${i}`;
  let id = base;
  for (let k = 1; taken.has(id); k++) id = `${base}${k}`;
  return id.slice(0, 24);
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Reads the answer: the one record_finds call, validated. A web find needs a
 * real https page; a newsletter or podcast find a ref that was listed (its
 * source, date and page are the app's, never the model's); a find that
 * repeats one already kept is dropped. A chart that does not fit (a series
 * short of its labels, a line not on dates) or a picture that is not a
 * public https address costs the figure, never the find.
 */
export function parseHunterResponse(body: unknown, input: HuntInput, now: Date): HunterParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_finds");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording what it found" };
  // More finds than asked for are cut to the first FINDS_PER_HUNT, never the whole answer lost.
  const raw = call.input as { finds?: unknown } | null;
  const parsed = modelAnswerSchema.safeParse(raw && Array.isArray(raw.finds) ? { ...raw, finds: raw.finds.slice(0, FINDS_PER_HUNT) } : raw);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)` };
  const iso = now.toISOString();
  const refs = new Map(input.items.map((i) => [i.ref.toUpperCase(), i]));
  const pictures = new Map(input.items.flatMap((i) => i.pictures.map((p) => [p.ref.toUpperCase(), p] as const)));
  const pillars = new Map(input.subject.pillars.map((p) => [p.name.trim().toLowerCase(), p.name]));
  const taken = new Set<string>();
  const out: Find[] = [];
  let dropped = 0;
  for (const [i, f] of parsed.data.finds.entries()) {
    let source = f.source.trim();
    let sourceUrl: string | null = null;
    let date = f.date;
    if (f.from === "web") {
      if (!input.web || !publicImageUrl(f.ref.trim())) {
        dropped++;
        continue;
      }
      sourceUrl = f.ref.trim();
    } else {
      const item = refs.get(f.ref.trim().toUpperCase());
      if (!item || item.from !== f.from) {
        dropped++;
        continue;
      }
      source = item.source;
      sourceUrl = item.url;
      date = item.date;
    }
    if (input.known.some((k) => (sourceUrl && k.url === sourceUrl) || sameText(k.title, f.title)) || out.some((o) => (sourceUrl && o.sourceUrl === sourceUrl && f.from === "web") || sameText(o.title, f.title))) {
      dropped++;
      continue;
    }
    const pic = f.picture?.trim() ?? "";
    const picture = /^[NP]\d+\.\d+$/i.test(pic) ? (pictures.get(pic.toUpperCase()) ?? null) : f.from === "web" && publicImageUrl(pic) ? { url: pic, alt: "" } : null;
    const write: FigureWrite | null = f.chart ? { title: (f.chartTitle?.trim() || f.title).slice(0, 120), caption: null, source, sourceUrl, date: date ?? undefined, chart: f.chart } : picture ? { title: f.title.slice(0, 120), caption: picture.alt?.slice(0, 400) || null, source, sourceUrl, date: date ?? undefined, image: { url: picture.url, alt: (picture.alt ?? "").slice(0, 200) } } : null;
    let figure: Find["figure"] = null;
    if (write) {
      try {
        figure = withFigures([], [write], [], iso, iso.slice(0, 10), "hunter")[0] ?? null;
      } catch (e) {
        if (!(e instanceof ThesisWriteProblem)) throw e;
      }
    }
    const id = findId(iso, i, taken);
    taken.add(id);
    const pillar = f.pillar ? (pillars.get(f.pillar.trim().toLowerCase()) ?? null) : null;
    out.push(findSchema.parse({ id, found: iso.slice(0, 10), date: date && date <= input.today ? date : null, title: f.title.trim(), summary: f.summary.trim(), stance: f.stance, pillar, from: f.from, source: source.slice(0, 200), sourceUrl, figure, dismissed: false }));
  }
  return { ok: true, finds: out, note: parsed.data.note.trim(), dropped };
}

// ---------------------------------------------------------------------------
// The file

/** The file after one thesis's hunt: the new finds first, the kept ones after, MAX_FINDS at most (dismissed ones go first). */
export function withHunt(file: ThesisHunterFile, key: string, finds: readonly Find[], sentence: string, now: Date): ThesisHunterFile {
  const prev = huntFor(file, key);
  const all = [...finds, ...prev.finds];
  const over = all.length - MAX_FINDS;
  const kept = over > 0 ? [...all.filter((f) => !f.dismissed), ...all.filter((f) => f.dismissed)].slice(0, MAX_FINDS).sort((a, b) => b.found.localeCompare(a.found)) : all;
  return thesisHunterFileSchema.parse({ version: 1, subjects: { ...file.subjects, [key]: { huntedAt: now.toISOString(), sentence: sentence.slice(0, 400), finds: kept } }, updated: now.toISOString() });
}

/** The file with one find dismissed; it stays dismissed and is never found again. */
export function withDismissed(file: ThesisHunterFile, key: string, id: string, now: Date): ThesisHunterFile {
  const h = huntFor(file, key);
  return thesisHunterFileSchema.parse({ ...file, subjects: { ...file.subjects, [key]: { ...h, finds: h.finds.map((f) => (f.id === id ? { ...f, dismissed: true } : f)) } }, updated: now.toISOString() });
}

/** One thesis's hunt in a sentence for the page: what was found, or why nothing. */
export function huntSentence(found: number, dropped: number, note: string, web: boolean): string {
  const where = web ? "the web, your newsletters and your podcasts" : "your newsletters and podcasts (searching the web needs the Claude provider)";
  if (found) return `Found ${found} new in ${where}${dropped ? `; ${dropped} without a source the app could check left out` : ""}.`;
  return `${note || "Nothing new bears on it"}${/[.]$/.test(note) ? "" : "."} Searched ${where}.`.replace(/\.\./g, ".");
}

/** The morning line for the sync status. */
export function hunterRunSentence(r: { hunted: number; found: number; failed: number }): string {
  if (!r.hunted) return "No thesis was due a hunt.";
  return `Hunted ${r.hunted} thes${r.hunted === 1 ? "is" : "es"}: ${r.found} new find${r.found === 1 ? "" : "s"}${r.failed ? `, ${r.failed} could not be hunted and are tried again tomorrow` : ""}.`;
}

// ---------------------------------------------------------------------------
// Notifications

// A find is no alert (Hamza, 5 Nov 2026: "that should only show in the weekly
// report"): not on Notifications, in the push or in an email. The thesis page
// draws it and the weekly and monthly review carry it (`withHunterFinds`).
