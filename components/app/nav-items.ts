import { ArrowLeftRight, HandCoins, BriefcaseBusiness, Gavel, LayoutDashboard, Palette, SlidersHorizontal, Bell, CandlestickChart, BookOpenCheck, Bot, Building, Building2, Filter, CalendarClock, ClipboardCheck, Ellipsis, Eye, FlaskConical, Gauge, Globe, Inbox, Landmark, Layers, Lightbulb, LineChart, ListChecks, MessageSquareText, Presentation, Rocket, Scale, ScrollText, Search, Shuffle, Siren, Sun, Sunset, School, Users, type LucideIcon } from "lucide-react";
import type { Route } from "next";

import { SCREEN_IDS, SCREENS, type ScreenId } from "@/lib/ontology";
import type { Module } from "@/lib/setup";

export type NavItem = { id: ScreenId; href: Route; label: string; short: string; icon: LucideIcon; module: Module; tab: boolean; under?: "more" };

export type NavBadges = Partial<Record<string, number>>;

export function badgeFor(badges: NavBadges, href: string) {
  const n = badges[href];
  return n && n > 0 ? (n > 99 ? "99+" : String(n)) : null;
}

/** The icon for each screen; the rest of a screen's definition lives in the ontology (lib/ontology.ts SCREENS). */
const ICONS: Record<ScreenId, LucideIcon> = {
  today: LayoutDashboard,
  notifications: Bell,
  after_close: Sunset,
  holdings: Layers,
  performance: LineChart,
  markets: Globe,
  flows: Shuffle,
  earnings: CandlestickChart,
  dividends: HandCoins,
  trades: ArrowLeftRight,
  signals: Siren,
  watchlist: Eye,
  research: FlaskConical,
  companies: Search,
  screener: Filter,
  top_funds: Building,
  agents: Bot,
  theses: Lightbulb,
  community: Users,
  clubs: School,
  analyst: MessageSquareText,
  check: ClipboardCheck,
  decisions: ScrollText,
  todo: ListChecks,
  calendar: CalendarClock,
  reviews: Presentation,
  methodology: BookOpenCheck,
  options: Gauge,
  fixed_income: Landmark,
  funds: Rocket,
  properties: Building2,
  statements: Inbox,
  more: Ellipsis,
};

/** Every screen, in the skeleton's order. A person sees the ones their methodology and inputs switch on. */
export const NAV: NavItem[] = SCREEN_IDS.map((id) => ({ id, href: SCREENS[id].href as Route, label: SCREENS[id].label, short: SCREENS[id].short, icon: ICONS[id], module: SCREENS[id].module, tab: SCREENS[id].tab, under: SCREENS[id].under }));

export const MORE: NavItem = NAV.find((n) => n.id === "more")!;

/**
 * The screens a person sees: those on for their methodology and book
 * (lib/screens.ts screensOn) whose module their inputs switched on. The top
 * menu lists them; Settings (the phone's More) closes the list.
 */
export function navFor(modules: readonly string[], screens: readonly ScreenId[]) {
  // In the order screensOn gives, which a dividend methodology changes (Dividends after Holdings).
  return screens.flatMap((id) => NAV.filter((n) => n.id === id && modules.includes(n.module) && !n.under));
}

/** The screens the Settings menu lists instead of the top menu (Newsletters, since 18 Oct 2026): on for the person, reached from there alone. */
export function underMore(modules: readonly string[], screens: readonly ScreenId[]) {
  return NAV.filter((n) => n.under === "more" && screens.includes(n.id) && modules.includes(n.module));
}

/**
 * The phone tab bar: the screens marked as tabs in the ontology, in the
 * person's order, with At the Close last, right before More (Hamza, 23 Oct
 * 2026: in Earnings' place): Dashboard, Holdings, Performance, At the Close,
 * then More for the rest. Without At the Close the fourth is the next tab
 * screen (Earnings). Fewer than five screens in all means no More.
 */
export const LAST_TAB: ScreenId = "after_close";

export function tabsFor(items: readonly NavItem[]) {
  if (items.length <= 5) return { tabs: [...items], overflow: [] as NavItem[] };
  const last = items.find((n) => n.id === LAST_TAB && n.tab);
  const tabs = [...items.filter((n) => n.tab && n !== last).slice(0, last ? 3 : 4), ...(last ? [last] : [])];
  const overflow = items.filter((n) => !tabs.includes(n) && n.id !== "more");
  return { tabs: [...tabs, MORE], overflow };
}

export type NavGroupId = "today" | "book" | "research" | "markets" | "rules" | "reviews";
/** A link a category's menu carries beside a screen: a view of that screen (Methodology's Evaluation), shown only while the screen is. */
export type NavExtra = { after: ScreenId; href: Route; label: string; icon: LucideIcon };
export type NavGroup = { id: NavGroupId; label: string; icon: LucideIcon; screens: readonly ScreenId[]; extras?: readonly NavExtra[] };

/**
 * The top menu's six places (Hamza, 4 Nov 2026, after the 19 Oct ruling of
 * every screen in the bar or under its category, no More; Markets split
 * from Research on 6 Nov 2026, "too many pages to choose from"): Today (what
 * happened and what needs you), Book (what you own and how it did),
 * Research (companies, theses, results and the agents), Markets (the
 * economy, the calendar, the screener, the funds and Community), Rules (the methodology and
 * what it asks of you) and Reviews, always in that order. Within a place
 * the person's own order holds (Customise); a screen in no place stands
 * alone after them; a place with one screen on draws that screen alone, so
 * Reviews is a link of its own.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: "today", label: "Today", icon: Sun, screens: ["today", "notifications", "after_close"] },
  { id: "book", label: "Book", icon: BriefcaseBusiness, screens: ["holdings", "performance", "dividends", "trades", "options", "fixed_income", "funds", "properties", "statements"] },
  { id: "research", label: "Research", icon: FlaskConical, screens: ["companies", "watchlist", "theses", "earnings", "research", "analyst", "agents"] },
  { id: "markets", label: "Markets", icon: CandlestickChart, screens: ["markets", "flows", "calendar", "screener", "top_funds", "community", "clubs"] },
  { id: "rules", label: "Rules", icon: Gavel, screens: ["methodology", "signals", "check", "decisions", "todo"], extras: [{ after: "methodology", href: "/methodology?view=evaluation" as Route, label: "Evaluation", icon: Scale }] },
  { id: "reviews", label: "Reviews", icon: Presentation, screens: ["reviews"] },
];

export type NavEntry = { kind: "screen"; item: NavItem } | { kind: "group"; group: NavGroup; items: NavItem[] };

/**
 * The person's screens as the top menu draws them: the five places in their
 * own order (Today, Book, Research, Markets, Rules, Reviews), each with the person's
 * screens in the person's order, then any screen no place names, alone. A
 * place with one screen on draws that screen alone; one with none is not
 * drawn.
 */
export function groupNav(items: readonly NavItem[]): NavEntry[] {
  const out: NavEntry[] = [];
  for (const group of NAV_GROUPS) {
    const members = items.filter((n) => group.screens.includes(n.id));
    if (!members.length) continue;
    out.push(members.length === 1 ? { kind: "screen", item: members[0] } : { kind: "group", group, items: members });
  }
  for (const item of items) if (!NAV_GROUPS.some((g) => g.screens.includes(item.id))) out.push({ kind: "screen", item });
  return out;
}

export type SettingsItem = { href: Route; label: string; detail: string; icon: LucideIcon };

/**
 * The Settings menu's tabs (Hamza, 19 Oct 2026: Sources & settings became
 * Settings, a menu opened on hover at the top of the page, no page of its
 * own): Setup, Customise and any screen set up once (`under: "more"`; none
 * since Newsletters and the SEC contact moved onto Setup, Hamza, 19 Oct 2026).
 * On the phone, the More tab lists the same rows.
 */
export const SETTINGS: readonly SettingsItem[] = [
  { href: "/setup" as Route, label: "Setup", detail: "Inputs, statements, the book, filings, your account.", icon: SlidersHorizontal },
  { href: "/customise" as Route, label: "Customise", detail: "Theme, screen order, headline tiles, your own figures, records.", icon: Palette },
  ...NAV.filter((n) => n.under === "more").map((n) => ({ href: n.href, label: n.label, detail: SCREENS[n.id].about, icon: n.icon })),
];

/** The Settings menu for a person: every tab, less a screen their inputs or methodology leave off. */
export function settingsHrefsFor(modules: readonly string[], screens: readonly ScreenId[]) {
  const kept = new Set(underMore(modules, screens).map((n) => n.href));
  return SETTINGS.filter((s) => !NAV.some((n) => n.under === "more" && n.href === s.href) || kept.has(s.href)).map((s) => s.href as string);
}

/** The Settings tabs behind an ordered list of hrefs, resolved on the client like `itemsFor`. */
export function settingsFor(hrefs: readonly string[]) {
  return hrefs.map((h) => SETTINGS.find((s) => s.href === h)).filter((s): s is SettingsItem => !!s);
}

/** The screens behind an ordered list of hrefs. Server code passes hrefs across the client boundary (an icon component cannot cross it) and the shell resolves them here. */
export function itemsFor(hrefs: readonly string[]) {
  return hrefs.map((h) => NAV.find((n) => n.href === h)).filter((n): n is NavItem => !!n);
}

export function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Up to two initials from a name, else from the address before the @. */
export function initialsOf(name: string | null, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  return (email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?").toUpperCase();
}
