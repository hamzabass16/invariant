/**
 * Company news and reports (Hamza, 19 Oct 2026: on At the Close, a grid of
 * the past week's news and reports for the holdings and the watchlist, the
 * newest first, each opening the article or the report). Headlines come from
 * the public Yahoo Finance feed per ticker (Google News behind it), read by
 * lib/markets-feed.ts alone; reports are the filings the SEC lists for each
 * company that week and the app's own post-earnings reports. Nothing here is
 * a verdict: a headline is a writer's, a filing the company's.
 *
 * Pure: imports nothing server-only.
 */
import { z } from "zod";

import { addDays } from "@/lib/performance";
import { localDay, localTime } from "@/lib/time";

/** How far back the section reaches, in days. */
export const NEWS_DAYS = 7;
/** Cards shown before Show all: twelve fill every row of the grid at two, three or four across (Hamza, 19 and 20 Oct 2026). */
export const NEWS_SHOWN = 12;
/** At most this many cards, the newest first. */
export const MAX_NEWS_ITEMS = 36;
/** At most this many headlines per company, so one busy name does not fill the grid. */
export const MAX_PER_COMPANY = 4;

export const NEWS_KINDS = ["news", "report"] as const;

const httpsUrl = z.string().max(600).refine((u) => /^https:\/\/[^\s]+$/.test(u) || /^\/[^\s/][^\s]*$/.test(u), "an https address or a path in the app");

export const newsItemSchema = z.object({
  symbol: z.string().max(20),
  kind: z.enum(NEWS_KINDS),
  title: z.string().min(1).max(300),
  /** The article, the filing at the SEC, or the app's own report (a path in the app). */
  url: httpsUrl,
  /** Who published it: the news site, "SEC EDGAR", or "Invariant". */
  source: z.string().max(80),
  /** When it was published, ISO date or date and time. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  /** The SEC form, for a filing. */
  form: z.string().max(12).nullable().default(null),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

/** The SEC forms worth a card, in words. Anything else (insider forms, prospectus supplements) is left out. */
export const REPORT_FORMS: Record<string, string> = {
  "10-K": "Annual report",
  "10-Q": "Quarterly report",
  "8-K": "Current report",
  "6-K": "Report from a foreign issuer",
  "20-F": "Annual report",
  "40-F": "Annual report",
  "DEF 14A": "Proxy statement",
  "SC 13D": "Ownership report",
  "S-1": "Registration statement",
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
};

/** An RSS date (RFC 822) as ISO date and time in UTC; null when it cannot be read. */
export function rssDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16) : null;
}

const hostName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * The headlines in an RSS feed for one symbol: title, link, date and the
 * publisher (the item's own source, else the link's site). An item without
 * an https link, a title or a readable date is left out, never guessed. A
 * document that is not RSS throws, so a feed that changed never looks quiet.
 */
export function parseRss(xml: string, symbol: string): NewsItem[] {
  if (!/<rss[\s>]|<channel[\s>]/i.test(xml)) throw new Error("not an RSS feed");
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    const at = rssDate(tag(block, "pubDate"));
    if (!title || !link || !at || !link.startsWith("https://")) continue;
    // Google News titles end in " - Publisher"; the publisher is also its <source>.
    const source = tag(block, "source") ?? hostName(link) ?? "News";
    const clean = title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title;
    const parsed = newsItemSchema.safeParse({ symbol: symbol.toUpperCase(), kind: "news", title: clean.slice(0, 300), url: link, source: source.slice(0, 80), at, form: null });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

const recentSchema = z.object({
  filings: z.object({
    recent: z.object({
      form: z.array(z.string()),
      filingDate: z.array(z.string()),
      accessionNumber: z.array(z.string()),
      primaryDocument: z.array(z.string()).optional(),
      primaryDocDescription: z.array(z.string()).optional(),
      acceptanceDateTime: z.array(z.string()).optional(),
    }),
  }),
});

/**
 * The filings the SEC lists for a company from `from` on, of the forms worth
 * a card, each linked to its document at the SEC by `link`. A document that
 * is not a submissions list throws.
 */
export function reportsFrom(json: unknown, symbol: string, from: string, link: (accession: string, doc: string | undefined) => string): NewsItem[] {
  const r = recentSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document with recent filings");
  const f = r.data.filings.recent;
  const out: NewsItem[] = [];
  for (let i = 0; i < f.form.length; i++) {
    const form = f.form[i];
    const filed = f.filingDate[i];
    if (!REPORT_FORMS[form] || !filed || filed < from) continue;
    const accepted = f.acceptanceDateTime?.[i];
    const at = accepted && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(accepted) ? accepted.slice(0, 16) : filed;
    const what = f.primaryDocDescription?.[i]?.trim();
    const title = `${REPORT_FORMS[form]}${what && what.toUpperCase() !== form ? `: ${what}` : ""}`;
    const parsed = newsItemSchema.safeParse({ symbol: symbol.toUpperCase(), kind: "report", title: title.slice(0, 300), url: link(f.accessionNumber[i], f.primaryDocument?.[i] || undefined), source: "SEC EDGAR", at, form });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** The first day inside the window that ends `today`. */
export const newsFrom = (today: string, days = NEWS_DAYS) => addDays(today, -(days - 1));

/**
 * The section's cards: the week's items, one card per link and per headline
 * for a company, at most MAX_PER_COMPANY headlines each (every report kept),
 * the newest first, at most MAX_NEWS_ITEMS.
 */
export function companyFeed(items: readonly NewsItem[], today: string, days = NEWS_DAYS): NewsItem[] {
  const from = newsFrom(today, days);
  const seen = new Set<string>();
  const perCompany = new Map<string, number>();
  const sorted = items.filter((i) => i.at.slice(0, 10) >= from && i.at.slice(0, 10) <= today).sort((a, b) => b.at.localeCompare(a.at) || a.symbol.localeCompare(b.symbol));
  const out: NewsItem[] = [];
  for (const i of sorted) {
    const key = i.url;
    const titleKey = `${i.symbol}|${i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    if (seen.has(key) || seen.has(titleKey)) continue;
    if (i.kind === "news") {
      const n = perCompany.get(i.symbol) ?? 0;
      if (n >= MAX_PER_COMPANY) continue;
      perCompany.set(i.symbol, n + 1);
    }
    seen.add(key);
    seen.add(titleKey);
    out.push(i);
    if (out.length >= MAX_NEWS_ITEMS) break;
  }
  return out;
}

/** What the section was given: the cards and a sentence for each source that could not be read. */
export const companyNewsSchema = z.object({ items: z.array(newsItemSchema), problems: z.array(z.string().max(300)) });
export type CompanyNews = z.infer<typeof companyNewsSchema>;

/** The demo's fictional sample: each item a number of days before today, so the week stays around today. */
export const demoNewsSchema = z.object({ _note: z.string().optional(), items: z.array(newsItemSchema.omit({ at: true }).extend({ daysAgo: z.number().int().min(0).max(6), time: z.string().regex(/^\d{2}:\d{2}$/) })) });

/** The demo's sample laid on this week. */
export function demoNews(sample: z.infer<typeof demoNewsSchema>, today: string): NewsItem[] {
  return sample.items.map(({ daysAgo, time, ...i }) => ({ ...i, at: `${addDays(today, -daysAgo)}T${time}` }));
}

/** When an item was published, as the card says it: "Today 14:05", "Yesterday", or the weekday and date. */
export function whenWords(at: string, today: string): string {
  // A moment is told on the person's clock; a bare date stays the date it names.
  const moment = at.length >= 16 ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at.slice(16)) ? at : `${at}Z`) : null;
  const timed = moment && !Number.isNaN(moment.getTime()) ? moment : null;
  const day = timed ? localDay(timed) : at.slice(0, 10);
  const time = timed ? localTime(timed) : null;
  if (day === today) return time ? `Today ${time}` : "Today";
  if (day === addDays(today, -1)) return time ? `Yesterday ${time}` : "Yesterday";
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
