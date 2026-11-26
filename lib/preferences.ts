/**
 * How one person has arranged the app for themselves: theme, the order and
 * visibility of screens, which figures lead the Overview, the figures they
 * built themselves over the ontology, and what they record about their own
 * holdings (their valuation, a date, a note). Kept in their vault as two
 * files, `preferences` and `records`, and in a cookie for the demo. Nothing
 * here changes a methodology: a custom figure is theirs, shown in its own
 * section, and a headline pick only reorders what exists. Pure.
 */
import { z } from "zod";

import { recordFields, type Book } from "@/lib/holdings";
import type { Dashboard } from "@/lib/methodology";
import { MAX_ADDED } from "@/lib/earnings";
import { DEFAULT_RECAP, MOVE_ALERT_MIN, MOVE_ALERT_PCT, recapChoiceSchema } from "@/lib/market-recap";
import { PRACTICES } from "@/lib/ontology";
import { figureSchema, type Figure } from "@/lib/recipes";
import { MAX_WORD_SCREENS, wordScreenSchema } from "@/lib/screen-words";
import { MAX_WATCHERS, watcherSchema } from "@/lib/watchers";

export const THEMES = ["system", "dark", "light"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = { system: "Match the device", dark: "Dark", light: "Light" };

/** A custom figure's id, so it can never collide with a methodology's. */
export const CUSTOM_PREFIX = "my-";
export const MAX_CUSTOM_FIGURES = 8;

/**
 * The contact the SEC sees. EDGAR asks every client to identify itself with
 * a name and a contact address in its User-Agent, so the app asks the person
 * for an address and their consent before the first filing is read; nothing
 * is sent before, and nothing else about them is sent after. Withdrawing
 * removes it and stops the filings.
 */
export const edgarContactSchema = z.object({
  /** The address the SEC may write to about this traffic. */
  address: z.string().trim().min(3).max(120),
  /** When the person agreed, so the screen can say so. */
  consentedAt: z.string(),
});
export type EdgarContact = z.infer<typeof edgarContactSchema>;

export const preferencesSchema = z.object({
  version: z.literal(1),
  theme: z.enum(THEMES),
  /** Screen hrefs in the order the person wants them; screens not listed follow in the app's order. */
  navOrder: z.array(z.string().max(40)).max(20),
  /** Screen hrefs taken out of the top menu and tab bar. The Dashboard and Settings never hide. */
  hidden: z.array(z.string().max(40)).max(20),
  /** Figure ids for the Overview's tiles, most important first; null keeps the methodology's own. */
  headline: z.array(z.string().max(40)).min(1).max(6).nullable(),
  /** Figures the person built in the app, each a recipe like any other. */
  figures: z.array(figureSchema).max(MAX_CUSTOM_FIGURES),
  /** The SEC EDGAR contact the person confirmed; null until they do, and again once they withdraw. Files written before it existed read as null. */
  edgarContact: edgarContactSchema.nullable().default(null),
  /** When the person last opened Notifications (ISO instant); notices dated after it count as unread. */
  notificationsSeen: z.string().nullable().default(null),
  /** The alerts marked read by id (Mark all read on Notifications; Hamza, 19 Oct 2026), the last 400; an alert not in it and fired after `notificationsSeen` is unread. Files written before it existed read as none marked. */
  notificationsRead: z.array(z.string().max(260)).max(400).default([]),
  /** Where Markets' "What happened" comes from: the recap newsletters forwarded, a recap the person's Claude writes from the web, or both. Files written before it existed read as the newsletters alone. */
  recap: recapChoiceSchema.default(DEFAULT_RECAP),
  /** Practices the person added on Customise (Trades, Trade check, Decision Log, the to-do), beside those their methodology asks for. Files written before it existed add none. */
  practices: z.array(z.enum(PRACTICES)).max(PRACTICES.length).default([]),
  /** The portfolio the screens look through (lib/portfolios.ts), or null for all of them together. */
  /** The portfolio, or the portfolios joined by commas (lib/portfolios.ts `lensFor`), the screens look through; null for all. */
  lens: z.string().max(520).nullable().default(null),
  /** Companies the person follows on the Earnings screen beside their holdings and watchlist. Files written before it existed add none. */
  earnings: z.array(z.string().max(20)).max(MAX_ADDED).default([]),
  /** The newsletters the person opened on At the Close, by digest id, so the rest show as unread (Hamza, 18 Oct 2026); the last 600. Files written before it existed show every newsletter as unread. */
  newslettersRead: z.array(z.string().max(16)).max(600).default([]),
  /** The greeting's quotes as shown, oldest first, one entry a quote (`withShown` in lib/greeting.ts): one record for every device the person uses, so a quote comes round only after every other (Hamza, 4 Nov 2026). */
  quotesShown: z.array(z.string().max(16)).max(200).default([]),
  /** The questions the person wants every review to answer (Hamza, 18 Oct 2026), each answered on their own key as a section of the report and a slide of the deck; at most six. */
  reviewQuestions: z.array(z.string().trim().min(3).max(300)).max(6).default([]),
  /** The community handles the person follows (lib/community.ts; Hamza, 18 Oct 2026), in the order followed, at most fifty. Files written before it existed follow no one. */
  following: z.array(z.string().max(24)).max(50).default([]),
  /** Screens asked in words on the Screener (lib/screen-words.ts; Hamza, 23 Oct 2026), compiled once into filters, newest first. Files written before it existed keep none. */
  wordScreens: z.array(wordScreenSchema).max(MAX_WORD_SCREENS).default([]),
  /** Watchers in the person's words (lib/watchers.ts; Hamza, 23 Oct 2026), each compiled once into a test the app runs at every check. Files written before it existed keep none. */
  watchers: z.array(watcherSchema).max(MAX_WATCHERS).default([]),
  /** The agents the person switched off on the Agents screen (lib/agents.ts; Hamza, 23 Oct 2026), by id. Files written before it existed run every agent. */
  agentsOff: z.array(z.string().max(40)).max(40).default([]),
  /** The weekly ceiling the person set for an agent, in US dollars on their own key, by agent id; an agent not named keeps its own (lib/agents.ts `ceilingOf`). */
  agentBudgets: z.record(z.string().max(40), z.number().min(0).max(1000)).default({}),
  /** The lens agents the person turned on (lib/lens-agents.ts, `LENS_IDS`; Hamza, 4 Nov 2026); none until they choose. */
  lensAgents: z.array(z.string().max(20)).max(3).default([]),
  /** How far a listed holding moves in a session, either way, before it is an alert and an email (MOVE_ALERT_PCT unless set). */
  moveAlertPct: z.number().min(MOVE_ALERT_MIN).default(MOVE_ALERT_PCT),
  /** When the person finished Welcome's second part, adding what the app reads (ISO instant); null until they do, so Welcome offers it again. Files written before it existed read as null. */
  welcomed: z.string().nullable().default(null),
  /** Whether the person's methodology gaps and their reasons for a finding rated not useful are counted, without their name, to improve the app for everyone (lib/improvements.ts; Hamza, 4 Nov 2026); on until they switch it off on Account settings. */
  improve: z.boolean().default(true),
  /** Whether the person gives open data once a week (lib/open-data.ts; Hamza, 9 Nov 2026): rules kept, breaches, reasoned trades and a holdings band, pooled and never an amount; off until they switch it on. */
  donate: z.boolean().default(false),
  /** The methodology run beside the person's own on Methodology's Shadow view (lib/shadow.ts; Hamza, 9 Nov 2026): a library entry's id, or "market:" and a listing's id; null for none. It never changes their verdicts. */
  shadow: z.string().max(80).nullable().default(null),
  updated: z.string(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = { version: 1, theme: "system", navOrder: [], hidden: [], headline: null, figures: [], edgarContact: null, notificationsSeen: null, notificationsRead: [], recap: DEFAULT_RECAP, practices: [], lens: null, earnings: [], newslettersRead: [], quotesShown: [], reviewQuestions: [], following: [], wordScreens: [], watchers: [], agentsOff: [], agentBudgets: {}, lensAgents: [], moveAlertPct: MOVE_ALERT_PCT, welcomed: null, improve: true, donate: false, shadow: null, updated: "" };

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether an address can go in the User-Agent: one email address, no spaces, under 120 characters. */
export function edgarAddressValid(address: string): boolean {
  const a = address.trim();
  return a.length >= 3 && a.length <= 120 && ADDRESS.test(a);
}

/** The User-Agent the SEC sees: the product name and the address the person confirmed, nothing else. */
export function edgarUserAgent(contact: EdgarContact): string {
  return `Invariant (${contact.address.trim()})`;
}

export const NEVER_HIDDEN = ["/", "/more"] as const;

/**
 * Screens in the person's order, without the ones they hid. `items` are the
 * screens their setup switched on, in the skeleton's order. A screen the saved
 * order does not name (one added to the app, or switched on, after the order
 * was saved) sits right after the screen the skeleton puts before it, so a new
 * screen lands where the skeleton means it to, never at the bottom (At the
 * Close after Notifications; Hamza, 18 Oct 2026).
 */
export function orderNav<T extends { href: string }>(items: readonly T[], prefs: Preferences): T[] {
  const rank = new Map(prefs.navOrder.map((h, i) => [h, i]));
  const hidden = new Set(prefs.hidden.filter((h) => !(NEVER_HIDDEN as readonly string[]).includes(h)));
  let last = -1;
  let after = 0;
  return items
    .filter((n) => !hidden.has(n.href))
    .map((n) => {
      if (rank.has(n.href)) {
        last = rank.get(n.href)!;
        after = 0;
        return { n, key: last };
      }
      after += 1;
      return { n, key: last + after / 1000 };
    })
    .sort((a, b) => a.key - b.key)
    .map((x) => x.n);
}

/**
 * Puts the visible screens in the order the person dragged them to. Null
 * unless `order` is exactly the screens they see, each once, so a stale page
 * never drops or invents a screen.
 */
export function reorderNav(prefs: Preferences, hrefs: readonly string[], order: readonly string[]): Preferences | null {
  const visible = orderNav(hrefs.map((h) => ({ href: h })), prefs).map((x) => x.href);
  if (order.length !== visible.length || new Set(order).size !== order.length || !order.every((h) => visible.includes(h))) return null;
  return { ...prefs, navOrder: [...order] };
}

/** Moves a screen one place, or hides or shows it, returning the new preferences. */
export function moveNav(prefs: Preferences, hrefs: readonly string[], href: string, how: "up" | "down" | "hide" | "show"): Preferences {
  const visible = orderNav(hrefs.map((h) => ({ href: h })), prefs).map((x) => x.href);
  if (how === "hide") return (NEVER_HIDDEN as readonly string[]).includes(href) ? prefs : { ...prefs, hidden: [...new Set([...prefs.hidden, href])] };
  if (how === "show") return { ...prefs, hidden: prefs.hidden.filter((h) => h !== href) };
  const i = visible.indexOf(href);
  const j = how === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= visible.length) return prefs;
  const order = [...visible];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...prefs, navOrder: order };
}

/**
 * The Overview with the person's picks laid over the methodology's dashboard:
 * their custom figures appended as a section of their own, and their headline
 * when they chose one (only tiles that exist; the methodology's when none
 * survive).
 */
export function dashboardWith(figures: Figure[], dashboard: Dashboard, prefs: Preferences): { figures: Figure[]; dashboard: Dashboard; custom: Figure[] } {
  const custom = prefs.figures.filter((f) => !figures.some((g) => g.id === f.id));
  const all = [...figures, ...custom];
  const tiles = new Set(all.filter((f) => f.view === "tile").map((f) => f.id));
  const picked = prefs.headline?.filter((id) => tiles.has(id)) ?? [];
  const headline = picked.length ? picked : dashboard.headline;
  const sections = custom.length ? [{ kind: "figures" as const, label: "Your figures", figures: custom.map((f) => f.id) }, ...dashboard.sections] : dashboard.sections;
  return { figures: all, dashboard: { ...dashboard, headline, sections }, custom };
}

// ---------------------------------------------------------------------------
// Records: what the owner says about their own holdings

export const recordsSchema = z.object({
  version: z.literal(1),
  /** By symbol, so a record follows the holding across accounts and brokers. */
  bySymbol: z.record(z.string().max(40), recordFields),
  updated: z.string(),
});
export type Records = z.infer<typeof recordsSchema>;
export const EMPTY_RECORDS: Records = { version: 1, bySymbol: {}, updated: "" };

/** The book with the owner's records laid on its holdings, a recorded sector over the source's. A record never comes from a broker, so the owner's always wins. */
export function applyRecords(book: Book, records: Records | null): Book {
  if (!records || !Object.keys(records.bySymbol).length) return book;
  return { ...book, holdings: book.holdings.map((h) => (records.bySymbol[h.symbol] ? revalued({ ...h, record: records.bySymbol[h.symbol], sector: records.bySymbol[h.symbol].sector ?? h.sector }) : h)) };
}

/** A property's accepted revaluation, laid on when it is newer than the value the book carries; a later statement or upload wins again. */
function revalued(h: Book["holdings"][number]): Book["holdings"][number] {
  const r = h.record?.revaluation;
  if (!r || h.assetClass !== "real_estate" || !h.property) return h;
  if (h.property.valuationDate && h.property.valuationDate >= r.asOf) return h;
  return { ...h, value: r.value, price: h.quantity ? r.value / h.quantity : h.price, property: { ...h.property, valuationDate: r.asOf, valuationSource: r.source } };
}
