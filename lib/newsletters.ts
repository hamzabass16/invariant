import { z } from "zod";
import { MODELS } from "@/lib/models";

/**
 * Newsletters, read as data. A person forwards the newsletters they
 * subscribe to (a Gmail filter does it as each one arrives) to their own
 * newsletters address: the statements inbox's address with the person's tag
 * and "-news" (statements+1a2b3c4d-news@...), so the address names nobody.
 * Each one is read on the person's own provider, as text, into a short
 * digest: what it is about, a two-line summary, and up to six points, each
 * with the person's holdings it touches. Only the digest is kept, in the
 * vault's `newsletters` file, never the email. The weekly and monthly review
 * count what arrived in the period by sender and carry the points that touch
 * the book most. Pure: lib/inbox-run.ts reads the inbox, lib/report.ts lays
 * the digests on a review.
 */

export const NEWSLETTER_MODEL = MODELS.fast;

/** What a newsletter is mostly about; holdings when it is about the person's own companies. */
export const NEWSLETTER_TOPICS = ["holdings", "macro", "tech", "geopolitics", "other"] as const;
export type NewsletterTopic = (typeof NEWSLETTER_TOPICS)[number];
/** Each theme's name on the screens. */
export const TOPIC_LABEL: Record<NewsletterTopic, string> = { holdings: "Your holdings", macro: "Markets and macro", tech: "Tech and AI", geopolitics: "Geopolitics", other: "Other" };

/** The longest newsletter text sent to the model; the rest is cut and the model is told so. */
export const MAX_NEWSLETTER_CHARS = 40_000;
/** Digests are kept this many days; a review reads at most a month back. */
export const KEEP_DAYS = 120;

/** Pictures drawn under one point, at most: a recap's market-day point carries the heat map, the indices and the movers. */
const MAX_POINT_IMAGES = 24;
const MAX_POINTS = 6;

const pointSchema = z.object({
  headline: z.string().min(1).max(100),
  line: z.string().max(320),
  symbols: z.array(z.string().max(24)).max(8).default([]),
  /** The newsletter's pictures that show this point, by their number in the digest's `images`, in the order they are drawn (Hamza, 19 Oct 2026: the person's model places them, ads left out). */
  images: z.array(z.number().int().min(0).max(99)).max(MAX_POINT_IMAGES).optional(),
});
export type NewsletterPoint = z.infer<typeof pointSchema>;

/** What the model records for one newsletter. */
const modelReadingSchema = z.object({
  topic: z.enum(NEWSLETTER_TOPICS),
  summary: z.string().min(1).max(420),
  points: z.array(pointSchema).max(MAX_POINTS),
});
/** The reading as kept: the model's, and whether it was given the pictures to place (`placed`), so the screens draw each under its point and leave the rest out. */
export const readingSchema = modelReadingSchema.extend({ placed: z.boolean().optional() });
export type NewsletterReading = z.infer<typeof readingSchema>;

const hex16 = z.string().regex(/^[0-9a-f]{16}$/);

/** An https address, or one of the app's own files (the demo's fictional samples); nothing else is ever drawn. */
const imageUrl = z.string().max(2000).refine((u) => /^https:\/\/[^\s"'<>]+$/.test(u) || /^\/[^\s"'<>/][^\s"'<>]*$/.test(u), "an https address");
/** A picture the newsletter carried: its address on the newsletter's own host and its alt text. The email is never kept; the picture is drawn from where the newsletter serves it. */
export const newsletterImageSchema = z.object({
  url: imageUrl,
  alt: z.string().max(200).nullable(),
  /** The newsletter's own words right before the picture (its heading or caption), so the screens can group the pictures and tell the day's performance from the day's stories. Missing on digests kept before 18 Oct 2026. */
  section: z.string().max(160).nullable().optional(),
});
export type NewsletterImage = z.infer<typeof newsletterImageSchema>;
/** Pictures kept per newsletter, at most: a daily recap is twenty or thirty screenshots (Hamza, 18 Oct 2026). */
export const MAX_IMAGES = 40;

/** Where a newsletter's date was read from, best first. */
export const DATE_FROM = ["forward", "printed", "header", "arrival"] as const;
export type DateFrom = (typeof DATE_FROM)[number];
const dateFromSchema = z.enum(DATE_FROM);

export const digestSchema = z.object({
  /** The email's lasting key (lib/inbox-run.ts), so a newsletter is read once. */
  id: hex16,
  sender: z.string().max(80),
  subject: z.string().max(200),
  /** When the inbox received it (ISO instant). */
  receivedAt: z.string(),
  /** The newsletter's own moment (ISO instant): the date in the forwarded header when the person forwarded it by hand, else the email's own Date; the screens and the reviews date a newsletter by it. Missing on digests kept before 18 Oct 2026, which are dated by their arrival. */
  date: z.string().optional(),
  /** Where that date came from (`newsletterDated`): the forwarded header's Date, the date the newsletter prints, the email's own Date, or its arrival alone. Missing on digests kept before 18 Oct 2026; one dated by its arrival alone is dated again once from the email (lib/inbox-run.ts). */
  dateFrom: dateFromSchema.optional(),
  /** read: the digest below; failed: a sentence saying why, and the email is tried again on the next run; set_aside: not the person's own forward, never read. */
  status: z.enum(["read", "failed", "set_aside"]),
  sentence: z.string().max(400).nullable(),
  reading: readingSchema.nullable(),
  /** How it came: Gmail's filter forwarded it as it arrived, the person forwarded it by hand (From is their own address), or the app's own subscription brought it for everyone (`shared`; Hamza, 18 Oct 2026). Missing on digests kept before 18 Oct 2026. */
  via: z.enum(["filter", "hand", "shared", "subscribed"]).optional(),
  /** How many reads have failed (`withTries`); at NEWSLETTER_MAX_TRIES it is not tried again. Missing on digests kept before 11 Nov 2026, read as one. */
  tries: z.number().int().min(0).optional(),
  /** When the last failed read was made (ISO instant); the next waits NEWSLETTER_RETRY_MINUTES. */
  triedAt: z.string().optional(),
  /** The newsletter's own pictures (charts, screenshots of the day's headlines), read from its HTML when it arrived, trackers and icons left out; missing on digests kept before 18 Oct 2026. */
  images: z.array(newsletterImageSchema).max(MAX_IMAGES).optional(),
});
export type Digest = z.infer<typeof digestSchema>;

export const newslettersFileSchema = z.object({
  version: z.literal(1),
  digests: z.array(digestSchema).max(600),
  updated: z.string(),
});
export type NewslettersFile = z.infer<typeof newslettersFileSchema>;
export const EMPTY_NEWSLETTERS: NewslettersFile = { version: 1, digests: [], updated: "" };

// ---------------------------------------------------------------------------
// The address

/** The person's newsletters address on the deployment's inbox: "statements@x.com" and tag "1a2b3c4d" give "statements+1a2b3c4d-news@x.com". */
export function newslettersAddressFor(inbox: string, tag: string): string | null {
  if (!/^[^@\s+]+@[^@\s]+$/.test(inbox) || !/^[0-9a-f]{8}$/.test(tag)) return null;
  const [local, domain] = inbox.split("@");
  return `${local}+${tag}-news@${domain}`;
}

// ---------------------------------------------------------------------------
// The text and the sender

/** A newsletter's text as the model reads it: links and tracking runs dropped, blank lines folded, cut to the limit. */
export function newsletterText(raw: string): { text: string; cut: boolean } {
  const t = raw
    .replace(/\r\n/g, "\n")
    .replace(/\[?https?:\/\/\S+\]?/g, "")
    .replace(/[​-‍﻿͏­]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return { text: t.slice(0, MAX_NEWSLETTER_CHARS), cut: t.length > MAX_NEWSLETTER_CHARS };
}

/**
 * The pictures a newsletter carried (Hamza, 18 Oct 2026: StockMKTNewz is
 * its screenshots of the day's headlines, and a digest without them misses
 * the point), read from its HTML as it arrived: every img with an https
 * address, in order, each once, at most MAX_IMAGES. A tracking pixel (one
 * or two pixels wide, or an address naming an open, a pixel or a beacon),
 * an icon or a logo (under 80 pixels, or so named) and a data: image are
 * left out. Only the address and the alt text are kept; the picture is
 * drawn from the newsletter's own host, with no referrer. Pure.
 */
export function newsletterImages(html: string): NewsletterImage[] {
  const out: NewsletterImage[] = [];
  const seen = new Set<string>();
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"))?.slice(1).find((v) => v !== undefined) ?? null;
  const size = (v: string | null) => (v && /^\s*\d+(\.\d+)?\s*(px)?\s*$/i.test(v) ? parseFloat(v) : null);
  // The words before each picture: text runs joined until a block ends, kept when they read as a heading or a caption.
  let section: string | null = null;
  let run = "";
  const flush = () => {
    const words = decodeEntities(run).replace(/\s+/g, " ").trim();
    run = "";
    if (words.length >= 3 && words.length <= 160 && !/https?:\/\//i.test(words) && !/^(read online|view in browser|unsubscribe|update your (email )?preferences)/i.test(words)) section = words.slice(0, 160);
  };
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  for (const m of body.matchAll(/<img\b[^>]*>|<\/?(?:p|div|td|th|tr|li|h[1-6]|br|hr|table|blockquote|section|article|header|footer)\b[^>]*>|<[^>]*>|[^<]+/gi)) {
    const token = m[0];
    if (token[0] !== "<") {
      run += token;
      continue;
    }
    if (!/^<img\b/i.test(token)) {
      // A block's edge ends the run; an inline tag (a, b, span, strong) does not.
      if (/^<\/?(?:p|div|td|th|tr|li|h[1-6]|br|hr|table|blockquote|section|article|header|footer)\b/i.test(token)) flush();
      continue;
    }
    if (run.trim()) flush();
    const tag = token;
    const src = decodeEntities(attr(tag, "src") ?? "").trim();
    if (!/^https:\/\/[^\s"'<>]+$/.test(src) || seen.has(src)) continue;
    let path: string;
    try {
      path = new URL(src).pathname;
    } catch {
      continue;
    }
    // A tracker's address names what it does and ends in no picture; a picture's ends in its kind, or sits on an image host.
    if (/\/(o|open|opens|track|tracking|pixel|beacon|impression|imp|wf\/open)(\/|$)/i.test(path) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(path)) continue;
    if (/\/(logos?|icons?|avatars?|social|spacer|divider)\//i.test(path) || /(youtube|video|play)[-_]?(icon|button|btn)/i.test(path)) continue;
    const style = attr(tag, "style") ?? "";
    const w = size(attr(tag, "width")) ?? size(style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i)?.[1] ?? null);
    const h = size(attr(tag, "height")) ?? size(style.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i)?.[1] ?? null);
    if ((w !== null && w < 80) || (h !== null && h < 80)) continue;
    const alt = decodeEntities(attr(tag, "alt") ?? "").replace(/\s+/g, " ").trim();
    if (/\b(logo|icon|avatar|twitter|linkedin|facebook|instagram|youtube|tiktok|spacer|divider)\b/i.test(alt)) continue;
    seen.add(src);
    out.push({ url: src.slice(0, 2000), alt: alt ? alt.slice(0, 200) : null, section });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

/** A run of pictures under the same words, in the newsletter's order. */
export type PictureGroup = { section: string | null; images: NewsletterImage[] };

export function pictureGroups(images: readonly NewsletterImage[]): PictureGroup[] {
  const out: PictureGroup[] = [];
  for (const im of images) {
    const last = out[out.length - 1];
    if (last && (last.section ?? null) === (im.section ?? null)) last.images.push(im);
    else out.push({ section: im.section ?? null, images: [im] });
  }
  return out;
}

/** The words that open a daily recap's stories ("Here are the biggest news stories from the stock market today"), and those of its opening performance pictures, which the Dashboard already shows. */
const STORIES_MARK = /news stories|biggest news|biggest stories|headlines|top stories|what happened/i;
const PERFORMANCE_MARK = /performed|heat ?map|indices|best and worst|performing|how the (stock )?market/i;
/** The words that open the recap's own videos ("Some new YouTube videos you need to watch"), which close the newsletter and are left out (Hamza, 19 Oct 2026). */
const VIDEOS_MARK = /\byou ?tube\b|\bvideos?\b.*\b(watch|need)\b|\bwatch\b.*\bvideos?\b|\bpodcasts?\b|\bepisodes?\b/i;

/**
 * A daily recap's pictures in two parts (Hamza, 18 Oct 2026: the StockMKTNewz
 * recap opens with the heat map, the indices and the movers, which the
 * Dashboard draws itself, then the day's stories as screenshots, which are
 * the point): `lead` is every picture before the stories begin, `stories`
 * the rest, up to the recap's own videos: the pictures from the first
 * whose words name them ("Some new YouTube videos you need to watch") to the
 * end are left out, since that part closes the newsletter (Hamza, 19 Oct
 * 2026). A newsletter whose words never mark where the stories begin (or
 * kept before the sections were read) is all stories.
 */
export function recapParts(images: readonly NewsletterImage[] | undefined): { lead: NewsletterImage[]; stories: NewsletterImage[] } {
  const all = images ?? [];
  const at = all.findIndex((im) => im.section && STORIES_MARK.test(im.section) && !PERFORMANCE_MARK.test(im.section));
  const lead = at < 0 ? [] : all.slice(0, at);
  const rest = at < 0 ? [...all] : all.slice(at);
  const videos = rest.findIndex((im) => im.section && VIDEOS_MARK.test(im.section));
  return { lead, stories: videos < 0 ? rest : rest.slice(0, videos) };
}

/**
 * A recap's story pictures no point carries (Hamza, 23 Oct 2026: every
 * relevant picture shown): the stories part of the issue (recapParts, the
 * opening performance and the closing videos left out) less the ones its
 * reading placed under a point, in the issue's order.
 */
export function unplacedStories(images: readonly NewsletterImage[] | undefined, points: readonly { images?: number[] }[]): NewsletterImage[] {
  const all = images ?? [];
  const placed = new Set(points.flatMap((p) => (p.images ?? []).map((n) => all[n]).filter(Boolean)));
  return recapParts(all).stories.filter((im) => !placed.has(im));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m));
}

/**
 * Who sent it, as a short name: the From header's display name, else its
 * domain without the mail host. A forwarded email's From is the newsletter's
 * own when Gmail's filter forwards it.
 */
export function senderOf(from: string): string {
  const name = from
    .replace(/<[^>]*>/g, "")
    .replace(/^"|"$/g, "")
    .replace(/"/g, "")
    .trim();
  if (name && !name.includes("@")) return name.slice(0, 80);
  const address = from.match(/[^\s<>"]+@([^\s<>"]+)/)?.[1]?.toLowerCase() ?? "";
  const parts = address.split(".").filter((p) => !["www", "mail", "email", "news", "newsletter", "send", "e", "m"].includes(p));
  const base = parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? "";
  return base ? (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 80) : "Unknown sender";
}

/**
 * The newsletter's own moment: the Date line of the forwarded header when the
 * person (or their Claude) forwarded it by hand, else the email's own Date
 * header, else when the inbox received it. A date that does not read, lies
 * in the future or is older than the digests are kept falls back to the
 * next. Gmail writes "Fri, Oct 17, 2026 at 8:05 AM" in the forwarded header,
 * with no zone: it is read as UTC, which places it on the right day.
 */
export function newsletterDate(text: string, headerDate: string | null, receivedAt: string): string {
  return newsletterDated(text, headerDate, receivedAt).date;
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";

/**
 * The date a newsletter prints near its top ("October 15, 2026", "15 Oct
 * 2026", "Wednesday, 15 October 2026"), read from its first lines, as
 * milliseconds at noon UTC; null when none is printed there. A forward made
 * by a program (Hamza, 18 Oct 2026: their Claude forwarded the last week's
 * issues on the Sunday, with no Date line the app could read) still carries
 * the newsletter's own masthead date, so the review can place it.
 */
export function printedDate(text: string, within = 1500): number | null {
  const head = text.replace(/\r\n/g, "\n").slice(0, within);
  const m1 = head.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"));
  const m2 = head.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\s*,?\\s+(\\d{4})\\b`, "i"));
  const pick = (mon: string, day: string, year: string) => {
    const month = MONTH_NAMES.findIndex((n) => n.startsWith(mon.toLowerCase().replace(/\./g, "").slice(0, 3)));
    const d = Number(day);
    if (month < 0 || d < 1 || d > 31) return null;
    const ms = Date.UTC(Number(year), month, d, 12);
    return Number.isFinite(ms) ? ms : null;
  };
  const a = m1 ? { at: m1.index ?? 0, ms: pick(m1[1], m1[2], m1[3]) } : null;
  const b = m2 ? { at: m2.index ?? 0, ms: pick(m2[2], m2[1], m2[3]) } : null;
  const first = [a, b].filter((x): x is { at: number; ms: number } => x !== null && x.ms !== null).sort((x, y) => x.at - y.at)[0];
  return first?.ms ?? null;
}

/**
 * The newsletter's own moment and where it was read from, best first: the
 * Date line of a forwarded header (the person forwarded it by hand), the
 * date the newsletter prints at its top when the email is a forward (a
 * program's forward carries no Date line), the email's own Date header
 * (Gmail's filter forwards within minutes, so it is the newsletter's day),
 * else its arrival. A date that does not fit (after the arrival, or older
 * than the file keeps) is passed over.
 */
export function newsletterDated(text: string, headerDate: string | null, receivedAt: string): { date: string; from: DateFrom } {
  const received = Date.parse(receivedAt);
  const fits = (ms: number) => Number.isFinite(ms) && (!Number.isFinite(received) || (ms <= received + 86_400_000 && ms >= received - KEEP_DAYS * 86_400_000));
  const forwarded = /Forwarded message|^\s*From:\s.+\n\s*(Date|Sent):\s/im.test(text);
  const quoted = text.match(/Forwarded message[\s\S]{0,600}?\n\s*Date:\s*([^\n]+)/i)?.[1]?.trim();
  if (quoted) {
    const ms = Date.parse(quoted.replace(/\s+at\s+/i, " ").replace(/^[A-Za-z]{3},\s*/, ""));
    if (fits(ms)) return { date: new Date(ms).toISOString(), from: "forward" };
  }
  if (forwarded) {
    const ms = printedDate(text);
    if (ms !== null && fits(ms)) return { date: new Date(ms).toISOString(), from: "printed" };
  }
  if (headerDate) {
    const ms = Date.parse(headerDate);
    if (fits(ms)) return { date: new Date(ms).toISOString(), from: "header" };
  }
  if (!forwarded) {
    const ms = printedDate(text);
    if (ms !== null && fits(ms)) return { date: new Date(ms).toISOString(), from: "printed" };
  }
  return { date: receivedAt, from: "arrival" };
}

/** The digests dated by their arrival alone, or kept before the date was read: each is dated again once from its email (Hamza, 18 Oct 2026: 55 digests forwarded on a Sunday all read as that Sunday's, so the weekly found none in its week). */
export function undatedDigests(file: NewslettersFile): Digest[] {
  return file.digests.filter((d) => d.dateFrom === undefined && (d.date === undefined || d.date === d.receivedAt));
}

/** A digest dated again from its email's text and Date header; `dateFrom` is set either way, so it is not read again. */
export function redateDigest(d: Digest, text: string | null, headerDate: string | null): Digest {
  if (text === null) return { ...d, date: d.date ?? d.receivedAt, dateFrom: "arrival" };
  const dated = newsletterDated(text, headerDate, d.receivedAt);
  return { ...d, date: dated.date, dateFrom: dated.from };
}

/** When a digest's newsletter is dated: its own date, else its arrival (digests kept before 18 Oct 2026). */
export const digestDate = (d: { date?: string; receivedAt: string }): string => d.date ?? d.receivedAt;

/** The day of a date-time, in UTC. */
const dayOf = (iso: string) => iso.slice(0, 10);
const daysBefore = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// The model call

export type NewsletterInput = { sender: string; subject: string; date: string; text: string; cut: boolean; symbols: string[]; /** The newsletter's pictures, in order, for the model to place: each one's alt text and the words before it. */ images?: readonly { alt: string | null; section?: string | null }[] };

/** The pictures as the model is shown them: a number, the alt text and the newsletter's words before each. */
function pictureList(images: readonly { alt: string | null; section?: string | null }[]): string {
  return images.map((im, i) => `${i}: ${(im.alt ?? "").replace(/\s+/g, " ").trim().slice(0, 140) || "(no alt text)"}${im.section ? ` | after: ${im.section.replace(/\s+/g, " ").trim().slice(0, 140)}` : ""}`).join("\n");
}

/** The Messages request that reads one newsletter: one call to record_newsletter, text only, so any provider can make it. */
export function newsletterRequestBody(input: NewsletterInput, model = NEWSLETTER_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelReadingSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  const pictures = input.images ?? [];
  delete schema.$schema;
  const symbols = input.symbols.length ? input.symbols.join(", ") : "none listed";
  return {
    model,
    max_tokens: 4000,
    system: `You read one investment newsletter a person subscribes to, for their own portfolio app, and record what it says.

Rules:
- topic: holdings when it is mostly about the companies the person holds; else macro (rates, inflation, central banks, markets), tech (technology and AI), geopolitics (wars, elections, trade and sanctions with market relevance), or other.
- summary: two sentences at most, in plain words, saying what the newsletter argues. No praise, no advice.
- points: up to six of its arguments or stories that bear on investing (for a daily market recap, its main stories of the day), each a short headline and one line. A figure in a line is copied as the newsletter prints it, with the newsletter as its source; never compute or add one.
- symbols on a point: only from the person's holdings, ${symbols}, and only when the point is about that company or plainly moves it. None is fine.
- An advertisement, a sponsor's section, the newsletter's own videos or podcasts to watch, or a welcome email is not a point.
- images on a point: ${pictures.length ? `the numbers of the newsletter's pictures (listed after its text) that show that point's story, such as its chart, table or the post it quotes, in the order they should be drawn under it. Each picture under one point at most. Leave out advertisements, sponsors, logos, banners, the newsletter's own promotions, videos and podcasts, and any picture none of your points is about; not every picture needs a place. A picture of the whole market's day (the indices, a heat map, the biggest movers) goes under the point about the market's day, when there is one.` : "none; this newsletter carries no pictures."}
- Your whole answer is one call to record_newsletter; write nothing outside it.`,
    tools: [{ name: "record_newsletter", description: "Record what the newsletter says.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `Newsletter from ${input.sender}, "${input.subject}", ${input.date}${input.cut ? " (first part; the rest was cut for length)" : ""}.\n\n${input.text}${pictures.length ? `\n\nIts pictures, in order (number: alt text | the newsletter's words before it):\n${pictureList(pictures)}` : ""}\n\nRecord this newsletter.` }],
      },
    ],
  };
}

const clip = (v: unknown, n: number) => (typeof v === "string" && v.length > n ? `${v.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : v);

/** The model's reading cut to the schema's limits: strings clipped at a word, lists cut, a topic it misnamed as other. What is missing stays missing. */
export function fitReading(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const r = input as Record<string, unknown>;
  const points = Array.isArray(r.points) ? r.points.slice(0, MAX_POINTS) : r.points;
  return {
    ...r,
    topic: typeof r.topic === "string" && !(NEWSLETTER_TOPICS as readonly string[]).includes(r.topic) ? "other" : r.topic,
    summary: clip(r.summary, 420),
    points: Array.isArray(points)
      ? points.map((p) => {
          if (!p || typeof p !== "object") return p;
          const q = p as Record<string, unknown>;
          return {
            ...q,
            headline: clip(q.headline, 100),
            line: clip(q.line ?? "", 320),
            symbols: Array.isArray(q.symbols) ? q.symbols.filter((x) => typeof x === "string" && x.length <= 24).slice(0, 8) : (q.symbols ?? []),
            ...(Array.isArray(q.images) ? { images: q.images.filter((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) <= 99).slice(0, MAX_POINT_IMAGES) } : {}),
          };
        })
      : points,
  };
}

export type NewsletterParse = { ok: true; reading: NewsletterReading } | { ok: false; reason: string; called: boolean };

/**
 * Reads the answer: the one record_newsletter call, validated; a symbol
 * outside the person's holdings is dropped, never kept, and so is a picture
 * number the newsletter does not have or that an earlier point already took.
 * With `pictures` given, the reading is marked placed.
 */
export function parseNewsletterResponse(body: unknown, symbols: string[], pictures = 0): NewsletterParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_newsletter");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the newsletter", called: false };
  // A reading a little over a limit (a headline a few words long, a seventh point, more pictures under one point) is clipped to fit, never thrown away (Hamza, 23 Oct 2026: the day's recap missed the evening for one such field).
  const parsed = readingSchema.safeParse(fitReading(call.input));
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.map((i) => i.path.join(".") || "root").slice(0, 3).join(", ")})`, called: true };
  const known = new Set(symbols.map((s) => s.toUpperCase()));
  const taken = new Set<number>();
  const points = parsed.data.points.map((p) => ({
    ...p,
    symbols: [...new Set(p.symbols.map((s) => s.trim().toUpperCase()))].filter((s) => known.has(s)),
    images: (p.images ?? []).filter((i) => i < pictures && !taken.has(i) && (taken.add(i), true)),
  }));
  return { ok: true, reading: { ...parsed.data, points, ...(pictures ? { placed: true } : {}) } };
}

// ---------------------------------------------------------------------------
// Keeping

/** The file with new digests first: one per email (a re-read replaces the failed one), none older than KEEP_DAYS. */
export function keepDigests(file: NewslettersFile, digests: Digest[], now: Date): NewslettersFile {
  if (!digests.length) return file;
  const fresh = new Set(digests.map((d) => d.id));
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  const all = [...digests, ...file.digests.filter((d) => !fresh.has(d.id))].filter((d) => d.receivedAt >= cutoff).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { version: 1, digests: all.slice(0, 600), updated: now.toISOString() };
}

/** Failed reads of one newsletter before it is left as failed, so a newsletter the model cannot read is not paid for on every run. */
export const NEWSLETTER_MAX_TRIES = 3;
/** Minutes a failed read waits before the next, so the three tries are not spent within minutes of each other while the app is open. */
export const NEWSLETTER_RETRY_MINUTES = 60;
/** The sentence of a read that could not be made because no model is set up; it calls nothing, so it is not counted as a try. */
export const NEWSLETTER_NO_AI = "Not read: the AI is not set up on this deployment yet.";

/** The emails not to read this run: read, set aside, failed NEWSLETTER_MAX_TRIES times, or failed within NEWSLETTER_RETRY_MINUTES. */
export function readKeys(file: NewslettersFile, now: Date = new Date()): Set<string> {
  const waiting = (d: Digest) => d.triedAt !== undefined && now.getTime() - Date.parse(d.triedAt) < NEWSLETTER_RETRY_MINUTES * 60_000;
  return new Set(file.digests.filter((d) => d.status !== "failed" || (d.tries ?? 1) >= NEWSLETTER_MAX_TRIES || waiting(d)).map((d) => d.id));
}

/** Counts each failed read on the digest it replaces; the last one says it is not tried again. A read with no model set up is not counted. */
export function withTries(digests: Digest[], file: NewslettersFile, now: Date): Digest[] {
  const before = new Map(file.digests.map((d) => [d.id, d]));
  return digests.map((d) => {
    if (d.status !== "failed" || d.sentence === NEWSLETTER_NO_AI) return d;
    const prev = before.get(d.id);
    const tries = prev?.status === "failed" && prev.sentence !== NEWSLETTER_NO_AI ? (prev.tries ?? 1) + 1 : 1;
    const last = tries >= NEWSLETTER_MAX_TRIES;
    const sentence = last && d.sentence ? `${d.sentence.replace(/;? it is tried again on the next run\.?$/, ".")} Not read after ${tries} tries, so it is not tried again.`.slice(0, 400) : d.sentence;
    return { ...d, sentence, tries, triedAt: now.toISOString() };
  });
}

/** One line for the sync status: what the newsletters inbox gave this run. */
export function newslettersSentence(r: { emails: number; read: number; failed: number; setAside: number }): string {
  if (!r.emails) return "No new newsletters.";
  const parts = [`${r.read} read`, r.failed ? `${r.failed} not read` : null, r.setAside ? `${r.setAside} set aside` : null].filter(Boolean);
  return `${r.emails} new newsletter${r.emails === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}

/**
 * The proof that the chain works, read off the digests themselves (Hamza,
 * 18 Oct 2026: after confirming the address and making the filter, nothing
 * showed until the next newsletter came). A newsletter Gmail's filter
 * forwarded shows the address is verified and the filter is on; one the
 * person forwarded by hand shows the address and the reading work. A
 * stranger's mail counts for nothing. A digest kept before `via` is taken
 * as the filter's.
 */
export type ForwardingProof = { byFilter: number; byHand: number; firstFilterAt: string | null; lastFilterAt: string | null; lastHandAt: string | null; read: number; failed: number };

export function forwardingProof(file: NewslettersFile | null): ForwardingProof {
  const own = (file?.digests ?? []).filter((d) => d.status !== "set_aside" && d.via !== "shared");
  const filter = own.filter((d) => (d.via ?? "filter") === "filter").map((d) => d.receivedAt).sort();
  const hand = own.filter((d) => d.via === "hand").map((d) => d.receivedAt).sort();
  return {
    byFilter: filter.length,
    byHand: hand.length,
    firstFilterAt: filter[0] ?? null,
    lastFilterAt: filter[filter.length - 1] ?? null,
    lastHandAt: hand[hand.length - 1] ?? null,
    read: own.filter((d) => d.status === "read").length,
    failed: own.filter((d) => d.status === "failed").length,
  };
}

/**
 * Who sees the copy of the recap the app's own inbox subscribes to (Hamza,
 * 20 Oct 2026: one subscription must not stand for everyone's). Only the
 * addresses in SHARED_RECAP_TO, the operator's own, get it; everyone else
 * subscribes the newsletter with their own newsletters address, and an issue
 * the recap's own sender sends there, proven by the receiving server, is read
 * as theirs (`subscribedRecapSender` in lib/inbox.ts).
 */
export function sharedRecapFor(email: string, list: string | undefined): boolean {
  const want = email.trim().toLowerCase();
  return !!want && (list ?? "").split(",").some((a) => a.trim().toLowerCase() === want);
}

export const NEWSLETTER_NOT_OWNER = "Set aside unread: it was not forwarded from your own email account. Forward newsletters from the account you sign in with.";

// ---------------------------------------------------------------------------
// A review's view

export type SenderCount = { sender: string; count: number };
export type RankedPoint = NewsletterPoint & { sender: string; date: string };

/** The digests read in a period: the newsletter dated after `from` and on or before `to` (dates, YYYY-MM-DD, compared on its own day in UTC). */
export function digestsIn(file: NewslettersFile | null, from: string, to: string): Digest[] {
  return (file?.digests ?? []).filter((d) => d.status === "read" && d.reading && dayOf(digestDate(d)) > from && dayOf(digestDate(d)) <= to);
}

/** The read digests dated in the last `days` days up to `today` (YYYY-MM-DD), the newest first: the Dashboard's week. */
export function digestsOfWeek(digests: readonly Digest[], today: string, days = 7): Digest[] {
  const from = daysBefore(today, days);
  return digests.filter((d) => d.status === "read" && d.reading && dayOf(digestDate(d)) > from).sort((a, b) => digestDate(b).localeCompare(digestDate(a)));
}

/**
 * A daily market recap newsletter (the StockMKTNewz Daily Recap the app
 * guides people to, or any newsletter that calls itself a recap): the
 * Dashboard's "What happened today" is the newest of them; the rest of the
 * week's newsletters are read by theme.
 */
export function isRecapDigest(d: { sender: string; subject: string }): boolean {
  return /stockmktnewz/i.test(`${d.sender} ${d.subject}`) || /\brecap\b/i.test(d.sender) || /\b(daily|market|closing)\b.*\brecap\b/i.test(d.subject);
}

// ---------------------------------------------------------------------------
// The recap to show (Hamza, 18 Oct 2026: on a weekend, Friday's)

const NY_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The weekday, 0 Sunday to 6 Saturday, of a moment in New York, where the US recaps are written; a moment that does not read counts as a weekday. */
export function newYorkWeekday(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 1;
  return WEEKDAYS.indexOf(NY_WEEKDAY.format(new Date(ms)));
}

/** A recap issue written on a Saturday or Sunday in New York: a weekend issue, with no session and none of the day's pictures in it. */
export function isWeekendIssue(d: { date?: string; receivedAt: string }): boolean {
  const w = newYorkWeekday(digestDate(d));
  return w === 0 || w === 6;
}

/**
 * The recap the Dashboard opens with, from the week's recaps newest first:
 * the newest written on a trading weekday, so a weekend and a Monday show
 * Friday's until Monday's arrives (Hamza, 18 Oct 2026: the weekend issues
 * carry no pictures and are skipped). The rest, weekend issues included, go
 * under it as the week's earlier recaps.
 */
export function recapToShow<D extends { date?: string; receivedAt: string }>(recaps: readonly D[]): { lead: D | null; earlier: D[] } {
  const lead = recaps.find((d) => !isWeekendIssue(d)) ?? null;
  return { lead, earlier: recaps.filter((d) => d !== lead) };
}

/** Whether a day (YYYY-MM-DD, the person's own) is a Saturday or Sunday. */
export function isWeekendDay(day: string): boolean {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w === 0 || w === 6;
}

// ---------------------------------------------------------------------------
// The shared recap (Hamza, 18 Oct 2026)

/**
 * One issue of the recap newsletter the app itself subscribes to, read once
 * from the app's own inbox for everyone (Hamza, 18 Oct 2026: nobody has to
 * subscribe or make a filter for the StockMKTNewz pictures). What the
 * screens draw and the model reads, nothing of anyone: the newsletter's own
 * words, cut as the model reads them, and its pictures with their sections.
 * Kept in the shared data cache, never in a vault; each person's vault gets
 * a digest of it, read on their own key (`sharedDigest`).
 */
export const sharedIssueSchema = z.object({
  /** The email's lasting key, the same hash a forward of it would not share. */
  id: hex16,
  sender: z.string().max(80),
  subject: z.string().max(200),
  /** The newsletter's own moment (ISO instant), and where it was read from. */
  date: z.string(),
  dateFrom: dateFromSchema.optional(),
  receivedAt: z.string(),
  text: z.string().max(MAX_NEWSLETTER_CHARS),
  cut: z.boolean(),
  images: z.array(newsletterImageSchema).max(MAX_IMAGES),
});
export type SharedIssue = z.infer<typeof sharedIssueSchema>;

/** The shared read: the issues of the last week in the app's inbox, newest first, and the session they were read for. */
export const sharedRecapsSchema = z.object({ version: z.literal(1), session: z.string(), issues: z.array(sharedIssueSchema).max(20), readAt: z.string() });
export type SharedRecaps = z.infer<typeof sharedRecapsSchema>;

/** The sentence on a shared digest read without a model: its pictures and words show; the points on the person's holdings wait for their key. */
export const SHARED_NO_MODEL = "Shown as the newsletter's own pictures; once the AI is set up here, its points on your holdings are read too.";

const sameSubject = (s: string) => s.toLowerCase().replace(/^\s*(fwd?|fw|re)\s*:\s*/i, "").replace(/\s+/g, " ").trim();
/** The New York day of a moment (YYYY-MM-DD). */
const nyDay = (iso: string) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

/** The same issue of a newsletter, however it came: the same subject on the same New York day. A person's own forward and the shared copy are one issue. */
export function sameIssue(a: { subject: string; date?: string; receivedAt: string }, b: { subject: string; date?: string; receivedAt: string }): boolean {
  return sameSubject(a.subject) === sameSubject(b.subject) && nyDay(digestDate(a)) === nyDay(digestDate(b));
}

/**
 * The shared issues a person's vault still lacks: not laid already by id,
 * not the same issue as one they forwarded themselves, and a shared digest
 * read without a model is read again once they have one.
 */
export function issuesToLay(issues: readonly SharedIssue[], digests: readonly Digest[], hasModel: boolean): SharedIssue[] {
  return issues.filter((i) => {
    const kept = digests.find((d) => d.id === i.id);
    // Read again once a model is added, and once more when its pictures were never placed (Hamza, 19 Oct 2026).
    if (kept) return hasModel && kept.via === "shared" && (kept.sentence === SHARED_NO_MODEL || (!kept.reading?.placed && i.images.length > 0));
    return !digests.some((d) => d.status === "read" && d.via !== "shared" && sameIssue(d, i));
  });
}

/** A shared issue as a digest in one person's vault: the model's reading on their key, or, with no model, the pictures alone and a sentence saying so. */
export function sharedDigest(issue: SharedIssue, reading: NewsletterReading | null): Digest {
  const base = { id: issue.id, sender: issue.sender, subject: issue.subject, receivedAt: issue.receivedAt, date: issue.date, dateFrom: issue.dateFrom ?? "header", via: "shared" as const, images: issue.images };
  if (reading) return { ...base, status: "read", sentence: null, reading };
  return { ...base, status: "read", sentence: SHARED_NO_MODEL, reading: { topic: "macro", summary: `${issue.sender}'s recap of the day, as its own pictures and words.`, points: [] } };
}

/** The digests a run read, less any recap that is the same issue as a shared digest already kept: the shared copy stands for everyone. */
export function withoutSharedTwins(digests: readonly Digest[], kept: readonly Digest[]): Digest[] {
  const shared = kept.filter((d) => d.via === "shared");
  return digests.filter((d) => !(d.status === "read" && shared.some((s) => sameIssue(s, d))));
}

/** The newsletters a person has not opened yet, by the ids they opened. */
export function unreadOf<D extends { id: string }>(digests: readonly D[], readIds: readonly string[]): D[] {
  const seen = new Set(readIds);
  return digests.filter((d) => !seen.has(d.id));
}

/** The ids opened, with one more, the oldest dropped past the limit the preferences keep. */
export function withRead(readIds: readonly string[], id: string, limit = 600): string[] {
  if (readIds.includes(id)) return [...readIds];
  return [...readIds, id].slice(-limit);
}

/** How many arrived from each sender, most first. */
export function bySender(digests: Digest[]): SenderCount[] {
  const n = new Map<string, number>();
  for (const d of digests) n.set(d.sender, (n.get(d.sender) ?? 0) + 1);
  return [...n.entries()].map(([sender, count]) => ({ sender, count })).sort((a, b) => b.count - a.count || a.sender.localeCompare(b.sender));
}

/**
 * The points worth a review's slide: those that touch the most of the
 * person's holdings first, then the newest; one per headline.
 */
export function topPoints(digests: Digest[], limit = 4): RankedPoint[] {
  const all = digests.flatMap((d) => (d.reading?.points ?? []).map((p) => ({ ...p, sender: d.sender, date: dayOf(digestDate(d)) })));
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.symbols.length - a.symbols.length || b.date.localeCompare(a.date))
    .filter((p) => {
      const k = p.headline.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// The Dashboard's view: themes, ranked by what they touch

/**
 * One digest with what it touches in the person's book (Hamza, 18 Oct
 * 2026: What happened ranked by how much each newsletter bears on their
 * theses, not every newsletter open at once). `touched` is every holding
 * its points name, once; `share` the weight of those holdings in the book
 * (percent); `theses` how many of them have a thesis on file. A newsletter
 * that touches a holding with a thesis ranks first, then by the share of
 * the book it touches (to the percent), then the newest (Hamza, 18 Oct
 * 2026: closest to the theses first, then recency), then by points on
 * holdings.
 */
export type RankedDigest = { digest: Digest; touched: string[]; share: number; theses: number; onHoldings: number; score: number };

export function rankDigests(digests: readonly Digest[], weights: Readonly<Record<string, number>>, withThesis: ReadonlySet<string>): RankedDigest[] {
  const w = new Map(Object.entries(weights).map(([k, v]) => [k.toUpperCase(), v]));
  const t = new Set([...withThesis].map((s) => s.toUpperCase()));
  return digests
    .filter((d) => d.status === "read" && d.reading)
    .map((digest) => {
      const points = digest.reading!.points;
      const touched = [...new Set(points.flatMap((p) => p.symbols.map((s) => s.toUpperCase())))].sort((a, b) => (w.get(b) ?? 0) - (w.get(a) ?? 0) || a.localeCompare(b));
      const share = touched.reduce((sum, s) => sum + (w.get(s) ?? 0), 0);
      const theses = touched.filter((s) => t.has(s)).length;
      const onHoldings = points.filter((p) => p.symbols.length).length;
      return { digest, touched, share, theses, onHoldings, score: theses * 1000 + Math.round(share) * 10 };
    })
    .sort((a, b) => b.score - a.score || digestDate(b.digest).localeCompare(digestDate(a.digest)) || b.onHoldings - a.onHoldings);
}

/** A theme on At the Close: its newsletters in rank order, what they touch together, and the best rank among them, which orders the themes. */
export type Theme = { topic: NewsletterTopic; label: string; digests: RankedDigest[]; touched: string[]; share: number; theses: number; images: number };

/** The ranked digests by theme, a theme with none left out; the theme whose best newsletter ranks highest first, then the one with more newsletters. The theme's share and theses count its holdings once. */
export function byTheme(ranked: readonly RankedDigest[], weights: Readonly<Record<string, number>>, withThesis: ReadonlySet<string>): Theme[] {
  const w = new Map(Object.entries(weights).map(([k, v]) => [k.toUpperCase(), v]));
  const t = new Set([...withThesis].map((s) => s.toUpperCase()));
  const themes: Theme[] = [];
  for (const topic of NEWSLETTER_TOPICS) {
    const digests = ranked.filter((r) => r.digest.reading?.topic === topic);
    if (!digests.length) continue;
    const touched = [...new Set(digests.flatMap((r) => r.touched))].sort((a, b) => (w.get(b) ?? 0) - (w.get(a) ?? 0) || a.localeCompare(b));
    themes.push({
      topic,
      label: TOPIC_LABEL[topic],
      digests,
      touched,
      share: touched.reduce((sum, x) => sum + (w.get(x) ?? 0), 0),
      theses: touched.filter((x) => t.has(x)).length,
      images: digests.reduce((n, r) => n + (r.digest.images?.length ?? 0), 0),
    });
  }
  return themes.sort((a, b) => b.digests[0].score - a.digests[0].score || b.digests.length - a.digests.length);
}

// ---------------------------------------------------------------------------
// The Gmail filter, written for the person

/** How far back the person's Claude looks for recurring newsletters. */
export const FINDER_DAYS = 30;
/** Enough senders for one filter; Gmail's From line takes many more, the page stays readable. */
export const MAX_FILTER_SENDERS = 40;

/**
 * The email addresses in what a person pasted: From lines ("Name <a@b.com>"),
 * a list separated by commas, spaces or new lines, or an email's header.
 * Each once, lower-cased, in the order given, never more than the filter
 * takes.
 */
export function sendersIn(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const address = m[0].toLowerCase().replace(/^[._%+-]+/, "");
    if (seen.has(address)) continue;
    seen.add(address);
    out.push(address);
    if (out.length >= MAX_FILTER_SENDERS) break;
  }
  return out;
}

/** The Gmail search that catches mail from these senders, in Gmail's own syntax: from:(a OR b). */
export function gmailFilter(senders: readonly string[]): string | null {
  const list = sendersIn(senders.join(" "));
  return list.length ? `from:(${list.join(" OR ")})` : null;
}

/**
 * The senders the one Gmail filter forwards: the ones the app always wants
 * first (the daily recap newsletter, whose issues open What happened today on
 * At the Close apart from the Newsletters; Hamza, 20 Oct 2026), then the ones
 * the person kept, each once.
 */
export function filterSenders(kept: readonly string[], always: readonly string[]): string[] {
  return sendersIn([...always, ...kept].join(" "));
}

/** Gmail's own address for a search; `+` is a space in a Gmail fragment. */
const gmailQuery = (q: string) => encodeURIComponent(q).replace(/%20/g, "+");

/**
 * Opens Gmail (on a computer, in the browser the person is signed in to) on
 * its Create filter box with the From line already filled in. Nothing is
 * created until the person clicks Create filter there, and the Forward it
 * to tick is theirs. Null with no senders.
 */
export function gmailFilterUrl(senders: readonly string[]): string | null {
  const list = sendersIn(senders.join(" "));
  return list.length ? `https://mail.google.com/mail/u/0/#create-filter/from=${gmailQuery(list.join(" OR "))}` : null;
}

/** Opens Gmail on the search itself, to see what the filter would catch. */
export function gmailSearchUrl(filter: string): string {
  return `https://mail.google.com/mail/u/0/#search/${gmailQuery(filter)}`;
}

// The senders: proposed by the person's Claude, kept or removed by the person

export const SENDER_STATUSES = ["proposed", "kept", "removed"] as const;
export type SenderStatus = (typeof SENDER_STATUSES)[number];

const senderSchema = z.object({
  address: z.string().min(3).max(200),
  /** The newsletter's name, as Claude or the From line gave it. */
  name: z.string().max(120).nullable(),
  /** How often it came, in Claude's words ("every weekday", "4 in 30 days"). */
  cadence: z.string().max(80).nullable(),
  /** Who put it here: the person's Claude through the connector, or the person. */
  from: z.enum(["claude", "you"]),
  status: z.enum(SENDER_STATUSES),
  at: z.string(),
});
export type Sender = z.infer<typeof senderSchema>;

/** The vault's `newsletter_senders` file: every sender ever proposed or added, with what the person decided. */
export const newsletterSendersSchema = z.object({ version: z.literal(1), senders: z.array(senderSchema), proposedAt: z.string().nullable(), updated: z.string() });
export type NewsletterSendersFile = z.infer<typeof newsletterSendersSchema>;
export const EMPTY_SENDERS: NewsletterSendersFile = { version: 1, senders: [], proposedAt: null, updated: "" };

/** What Claude hands over for each newsletter it found. */
export const proposedSenderSchema = z.object({
  address: z.string().min(3).max(200).describe("The sender's email address."),
  name: z.string().max(120).optional().describe("The newsletter's name."),
  cadence: z.string().max(80).optional().describe("How often it came in the period, in a few words."),
});
export type ProposedSender = z.infer<typeof proposedSenderSchema>;

/**
 * Claude's findings laid on the file: a new address is proposed; one the
 * person already kept stays kept, one they removed stays removed (Claude
 * does not ask again), each with the newer name and cadence. Returns the
 * file and how many were new, kept before and removed before. Pure.
 */
export function proposeSenders(file: NewsletterSendersFile, found: readonly ProposedSender[], now: string): { file: NewsletterSendersFile; added: number; keptBefore: number; removedBefore: number } {
  const senders = file.senders.map((x) => ({ ...x }));
  let added = 0;
  let keptBefore = 0;
  let removedBefore = 0;
  for (const f of found) {
    const [address] = sendersIn(f.address);
    if (!address) continue;
    const name = f.name?.trim() || null;
    const cadence = f.cadence?.trim() || null;
    const have = senders.find((x) => x.address === address);
    if (have) {
      if (have.status === "kept") keptBefore += 1;
      else if (have.status === "removed") removedBefore += 1;
      if (name) have.name = name;
      if (cadence) have.cadence = cadence;
      if (have.status === "proposed") have.at = now;
      continue;
    }
    senders.push({ address, name, cadence, from: "claude", status: "proposed", at: now });
    added += 1;
  }
  return { file: { version: 1, senders, proposedAt: now, updated: now }, added, keptBefore, removedBefore };
}

/**
 * The person keeps or removes one sender, proposed or not, now or long
 * after the first filter was made: a kept one can be removed, a removed one
 * kept again. An unknown address is left alone.
 */
export function decideSender(file: NewsletterSendersFile, address: string, status: Exclude<SenderStatus, "proposed">, now: string): NewsletterSendersFile {
  const [a] = sendersIn(address);
  return { ...file, version: 1, senders: file.senders.map((x) => (x.address === a ? { ...x, status, at: now } : x)), updated: now };
}

/** The person adds senders of their own, pasted as a list or From lines; each is kept at once, a known one is kept again. */
export function addSenders(file: NewsletterSendersFile, text: string, now: string): { file: NewsletterSendersFile; added: number } {
  const senders = file.senders.map((x) => ({ ...x }));
  let added = 0;
  for (const address of sendersIn(text)) {
    const have = senders.find((x) => x.address === address);
    if (have) {
      if (have.status !== "kept") have.status = "kept";
      have.at = now;
    } else {
      const name = text.match(new RegExp(`"?([^"<\\n,]{2,80}?)"?\\s*<${address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "i"))?.[1]?.trim() ?? null;
      senders.push({ address, name, cadence: null, from: "you", status: "kept", at: now });
    }
    added += 1;
  }
  return { file: { ...file, version: 1, senders, updated: now }, added };
}

/** The senders the filter is made of. */
export const keptSenders = (file: NewsletterSendersFile): Sender[] => file.senders.filter((x) => x.status === "kept");
/** What Claude proposed and the person has not decided. */
export const proposedSenders = (file: NewsletterSendersFile): Sender[] => file.senders.filter((x) => x.status === "proposed");
/** What the person removed; each can be kept again. */
export const removedSenders = (file: NewsletterSendersFile): Sender[] => file.senders.filter((x) => x.status === "removed");

/**
 * What the person pastes into their own Claude: with the Gmail connector it
 * reads the last month for newsletters that arrive again and again about
 * markets, companies or investing, and hands them to Invariant through
 * `propose_newsletter_senders`. The person keeps or removes each one on the
 * Newsletters card on Setup; Claude reads, and makes nothing in Gmail.
 */
export function finderPrompt(address: string | null = null): string {
  return [
    `Using my Gmail connector, search my mail of the last ${FINDER_DAYS} days for newsletters about investing, markets, companies or the economy: emails that arrive again and again from the same sender, usually with an unsubscribe line. Leave out shops, services, banks, brokers and anything personal.`,
    "Then call the propose_newsletter_senders tool of my Invariant connector once, with every newsletter you found: its sender address, its name and how often it came. Tell me what it answered. I will keep or remove each one on the Newsletters card on Setup in Invariant.",
    ...(address ? [backfillLine(address, null)] : []),
    `Do not create or change anything in Gmail yourself: no filter, no label, nothing deleted${address ? ", and send nothing but those forwards" : ", and send nothing"}.`,
  ].join("\n");
}

/** How far back the person's Claude forwards at setup, so the screen has something to show at once. */
export const BACKFILL_DAYS = 7;

function backfillLine(address: string, senders: string[] | null): string {
  const from = senders?.length ? `from ${senders.join(", ")}` : "from those senders";
  return `Then forward each newsletter of the last ${BACKFILL_DAYS} days ${from}, once each, to ${address} with Gmail's forward, so Invariant reads them at once. Tell me how many you forwarded.`;
}

/**
 * The prompt that fills the last week at setup (Hamza, 18 Oct 2026: a
 * Gmail filter forwards only what arrives from then on, and the app never
 * reads anyone's Gmail; the person's own Claude, with its Gmail connector,
 * forwards the last days' newsletters from the kept senders to the
 * address, and the screen reads them as they land). Null with no address
 * or no kept sender.
 */
export function backfillPrompt(address: string | null, senders: readonly string[]): string | null {
  if (!address || !senders.length) return null;
  return [`Using my Gmail connector: ${backfillLine(address, [...senders]).replace(/^Then forward/, "forward")}`, "Do not create or change anything in Gmail: no filter, no label, nothing deleted, and send nothing but those forwards."].join("\n");
}

/** The steps that finish the filter in Gmail, in Gmail's own words; for the tool and the page alike. */
export function filterSteps(address: string | null): string[] {
  return [
    "Open the link on a computer, in the browser you read Gmail in. Gmail opens its filter box with the senders in the From line.",
    "Click Create filter.",
    address ? `Tick Forward it to and choose ${address}. If the address is not in the list, add it first under Settings, Forwarding and POP/IMAP (the Newsletters card on Setup walks through it).` : "Tick Forward it to and choose your newsletters address from the Newsletters card on Setup.",
    "Click Create filter. The newsletters stay in your inbox as before; a copy of each new one goes to Invariant, which reads it with the AI.",
    "To change the list later, keep, remove or add senders on Setup's Newsletters card at any time, then Open in Gmail again. Gmail keeps the earlier filter: delete it, or edit it, under Settings, Filters and Blocked Addresses.",
  ];
}
