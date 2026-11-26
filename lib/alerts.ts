/**
 * Alerts: every notice the app derives (a breach, a watch, a clock or date
 * within a week, a study finished or stopped, a filings read) and every
 * watchlist level a price has reached, kept in the vault's alerts file so
 * Notifications shows what fired and when, a dismissed one stays dismissed,
 * and the twice-daily check emails each firing once. An alert fires when its
 * condition starts to hold and clears when it stops; it fires again only
 * after it has cleared. Nothing here decides anything: the notices come from
 * the methodology's rules (lib/screens.ts), the levels from the person's own
 * records. Pure.
 */
import { z } from "zod";

import type { DecisionsFile } from "@/lib/decisions";
import type { Book, HoldingRecord, Transaction } from "@/lib/holdings";
import { FIELDS, type FieldId } from "@/lib/ontology";
import type { Notice } from "@/lib/screens";
import type { StatementsFile } from "@/lib/statements";
import { daysBetween, localMoment, longDate } from "@/lib/time";
import { HISTORY_LABEL, historyWords, type ValuationHistory } from "@/lib/valuation-history";

export const ALERT_TONES = ["danger", "warn", "info", "ok"] as const;

/** At most this many figures on one alert. */
export const MAX_NOTICE_FIGURES = 6;

export const alertItemSchema = z.object({
  /** The notice's key and the instant it fired: one firing of one condition. */
  id: z.string().max(260),
  key: z.string().max(200),
  firedAt: z.string(),
  /** When the condition stopped holding; null while it holds. */
  clearedAt: z.string().nullable(),
  tone: z.enum(ALERT_TONES),
  title: z.string().max(300),
  detail: z.string().max(500),
  href: z.string().max(200),
  /** The figures drawn as chips under the alert (an event's moves); none for most. */
  figures: z.array(z.object({ label: z.string().max(40), value: z.string().max(24), tone: z.enum(["up", "down", "flat"]) })).max(MAX_NOTICE_FIGURES).default([]),
  emailedAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
});
export type AlertItem = z.infer<typeof alertItemSchema>;

export const alertsFileSchema = z.object({
  version: z.literal(1),
  items: z.array(alertItemSchema).max(400),
  /** The last twice-daily (or by-hand) check. */
  checkedAt: z.string().nullable().default(null),
  /** Why the last check could not email, as a sentence; null when it could or had nothing to send. */
  emailProblem: z.string().max(300).nullable().default(null),
  updated: z.string(),
});
export type AlertsFile = z.infer<typeof alertsFileSchema>;
export const EMPTY_ALERTS: AlertsFile = { version: 1, items: [], checkedAt: null, emailProblem: null, updated: "" };

/** Cleared alerts are kept this many days, then dropped. */
export const KEEP_CLEARED_DAYS = 30;
/** The keys of watchlist levels: only a check with prices can say they cleared. */
export const WATCH_PREFIX = "watch:";
/** The keys of a holding's 2% move in a session: only a check with the recaps can say they cleared. */
export const MOVE_PREFIX = "move:";
/**
 * What the Thesis Hunter found (lib/thesis-hunter.ts): no alert at all since
 * 5 Nov 2026 (Hamza: "that should only show in the weekly report"), so not on
 * Notifications, the push or an email; the weekly and monthly review carry the
 * finds (`withHunterFinds`). The key stays only so a file kept before is cleaned.
 */
export const HUNTER_PREFIX = "hunter:";
/** A kept alert of a kind that is no longer an alert, dropped at every read and check. */
export const retiredAlert = (key: string) => key.startsWith(HUNTER_PREFIX);
/** What an agent the person built found (lib/custom-agents.ts): on Notifications and in the push, never an email of its own. */
export const CUSTOM_AGENT_PREFIX = "agent:";
/** The keys of a company near its five-year low on the valuation metric chosen: only a check that read its closes can say they cleared. */
export const VALUATION_LOW_PREFIX = "valuation-low:";

/** A notice that is news: everything but the routine "filings read" line when every filing was read. The close's one push counts these. */
export function newsWorthy(item: Pick<AlertItem, "key" | "tone">): boolean {
  return !(item.key === "filings" && item.tone === "ok") && !retiredAlert(item.key);
}

/** A notice worth an email of its own: news, less what the person's own agents found, which Agents and Notifications carry. */
export function emailWorthy(item: Pick<AlertItem, "key" | "tone">): boolean {
  return newsWorthy(item) && !item.key.startsWith(CUSTOM_AGENT_PREFIX) && !stageOfOneEmailReport(item.key);
}

/**
 * A results report's release or figures alert from 4 Nov 2026 on: kept on
 * Notifications, never emailed, since the report goes out once, whole, as its
 * own email (Hamza, 4 Nov 2026: "one email per report, when complete").
 */
const stageOfOneEmailReport = (key: string) => {
  const m = /^earnings-report:[^:]+:(\d{4}-\d{2}-\d{2}):(release|figures)$/.exec(key);
  return !!m && m[1] >= "2026-11-04";
};

/**
 * When a condition first held: the notice's own day, never later than now, so
 * "since you last looked" means what it did before alerts were kept. A notice
 * dated after now (a date ahead, or the person's day already begun east of
 * UTC) fires at the start of now's own day, so its id holds still from one
 * request to the next and Dismiss can find it.
 */
export const firedAtOf = (n: Pick<Notice, "date">, now: string) => {
  const day = `${n.date}T00:00:00.000Z`;
  return day < now ? day : `${now.slice(0, 10)}T00:00:00.000Z`;
};

/**
 * The file after a check: a notice with no open alert opens one; an open
 * alert whose notice is still there takes its current wording; one whose
 * notice is gone is cleared. `keepPrefix` keeps open the alerts of the
 * prefixes the caller could not test (a screen without prices keeps the
 * watchlist's and the moves'). Returns the alerts that fired now.
 */
const figuresOf = (n: Notice): AlertItem["figures"] => (n.figures ?? []).slice(0, MAX_NOTICE_FIGURES).map((f) => ({ label: f.label.slice(0, 40), value: f.value.slice(0, 24), tone: f.tone }));

export function reconcile(prev: AlertsFile | null, current: readonly Notice[], now: string, keepPrefix: string | readonly string[] | null = null): { file: AlertsFile; fired: AlertItem[] } {
  const keep = keepPrefix === null ? [] : typeof keepPrefix === "string" ? [keepPrefix] : keepPrefix;
  const items = (prev?.items ?? []).filter((i) => !retiredAlert(i.key)).map((i) => ({ ...i }));
  const open = new Map(items.filter((i) => i.clearedAt === null).map((i) => [i.key, i]));
  const seen = new Set<string>();
  const fired: AlertItem[] = [];
  for (const n of current) {
    if (seen.has(n.key) || retiredAlert(n.key)) continue;
    seen.add(n.key);
    const got = open.get(n.key);
    if (got) {
      got.tone = n.tone;
      got.title = n.title.slice(0, 300);
      got.detail = n.detail.slice(0, 500);
      got.href = n.href.slice(0, 200);
      got.figures = figuresOf(n);
      continue;
    }
    const firedAt = firedAtOf(n, now);
    const item: AlertItem = { id: `${n.key}@${firedAt}`.slice(0, 260), key: n.key.slice(0, 200), firedAt, clearedAt: null, tone: n.tone, title: n.title.slice(0, 300), detail: n.detail.slice(0, 500), href: n.href.slice(0, 200), figures: figuresOf(n), emailedAt: null, dismissedAt: null };
    // A condition that cleared and holds again the same day is the same firing, reopened.
    const again = items.find((i) => i.id === item.id);
    if (again) {
      Object.assign(again, { ...item, emailedAt: again.emailedAt, dismissedAt: again.dismissedAt });
      continue;
    }
    items.push(item);
    fired.push(item);
  }
  for (const i of items) {
    if (i.clearedAt !== null || seen.has(i.key)) continue;
    if (keep.some((k) => i.key.startsWith(k))) continue;
    i.clearedAt = now;
  }
  const cutoff = new Date(Date.parse(now) - KEEP_CLEARED_DAYS * 86_400_000).toISOString();
  const kept = items.filter((i) => i.clearedAt === null || i.clearedAt >= cutoff).sort((a, b) => b.firedAt.localeCompare(a.firedAt) || a.key.localeCompare(b.key));
  return { file: { version: 1, items: kept.slice(0, 400), checkedAt: prev?.checkedAt ?? null, emailProblem: prev?.emailProblem ?? null, updated: now }, fired };
}

/**
 * The alerts an email should carry: open, not dismissed, not yet emailed,
 * news, and fired today or yesterday. A condition that began earlier and was
 * never emailed (a study finished last month, the first check after mail was
 * set up) is on Notifications but is not news, so it is not sent.
 */
export function toEmail(file: AlertsFile, now: string): AlertItem[] {
  const since = new Date(Date.parse(`${now.slice(0, 10)}T00:00:00.000Z`) - 86_400_000).toISOString();
  return file.items.filter((i) => i.clearedAt === null && i.dismissedAt === null && i.emailedAt === null && i.firedAt >= since && emailWorthy(i));
}

/** Marks alerts emailed, so the next check does not send them again. */
export function markEmailed(file: AlertsFile, ids: readonly string[], now: string): AlertsFile {
  const set = new Set(ids);
  return { ...file, items: file.items.map((i) => (set.has(i.id) ? { ...i, emailedAt: now } : i)), updated: now };
}

/** Dismisses one alert, or every open one when `id` is null. A dismissed alert stays out of sight until it clears and fires again. */
export function dismiss(file: AlertsFile, id: string | null, now: string): AlertsFile {
  return { ...file, items: file.items.map((i) => ((id === null ? i.clearedAt === null : i.id === id) && i.dismissedAt === null ? { ...i, dismissedAt: now } : i)), updated: now };
}

/**
 * Unread: open, not dismissed and not marked read. Once Mark all read has
 * kept ids (`read`), they decide alone, so an alert that fires later the same
 * day is unread although it is dated the day's start; a file marked before
 * the ids existed reads by the instant (`seen`), as it did.
 */
export function unreadAlerts(file: AlertsFile, seen: string | null, read: readonly string[] = []): AlertItem[] {
  const marked = new Set(read);
  return file.items.filter((i) => i.clearedAt === null && i.dismissedAt === null && !retiredAlert(i.key) && !marked.has(i.id) && (marked.size ? true : !seen || i.firedAt > seen));
}

/** The ids to keep as read after Mark all read: every alert in the file now (the rest can no longer be unread), within the preference's room. */
export function readIds(file: AlertsFile, before: readonly string[] = []): string[] {
  const now = new Set(file.items.map((i) => i.id));
  return [...new Set([...before.filter((id) => now.has(id)), ...file.items.map((i) => i.id)])].slice(-400);
}

/**
 * Reconciles one prefix's alerts alone: the notices are laid on the items of
 * that prefix as `reconcile` does, and every other item is kept as it was.
 * For a run that could read one source and nothing else (the followed cards
 * on opening the app).
 */
export function reconcilePrefix(prev: AlertsFile | null, prefix: string, current: readonly Notice[], now: string): { file: AlertsFile; fired: AlertItem[] } {
  const mine = (prev?.items ?? []).filter((i) => i.key.startsWith(prefix));
  const rest = (prev?.items ?? []).filter((i) => !i.key.startsWith(prefix) && !retiredAlert(i.key));
  const { file, fired } = reconcile(prev ? { ...prev, items: mine } : null, current.filter((n) => n.key.startsWith(prefix)), now);
  const items = [...rest, ...file.items].sort((a, b) => b.firedAt.localeCompare(a.firedAt) || a.key.localeCompare(b.key)).slice(0, 400);
  return { file: { ...file, items, checkedAt: prev?.checkedAt ?? null, emailProblem: prev?.emailProblem ?? null }, fired };
}

/** What Notifications draws: what holds now, then what fired and cleared lately; dismissed ones are left out. */
export function alertsView(file: AlertsFile): { now: AlertItem[]; earlier: AlertItem[]; dismissed: number } {
  const order = (t: AlertItem["tone"]) => ALERT_TONES.indexOf(t);
  const live = file.items.filter((i) => i.dismissedAt === null && !retiredAlert(i.key));
  return {
    now: live.filter((i) => i.clearedAt === null).sort((a, b) => order(a.tone) - order(b.tone) || b.firedAt.localeCompare(a.firedAt)),
    earlier: live.filter((i) => i.clearedAt !== null).sort((a, b) => (b.clearedAt ?? "").localeCompare(a.clearedAt ?? "")),
    dismissed: file.items.filter((i) => i.dismissedAt !== null && i.clearedAt === null && !retiredAlert(i.key)).length,
  };
}

// ---------------------------------------------------------------------------
// Statements

/** A statement or fund report that waits for the person to confirm it, or could not be read: on its day, until they act on Statements. */
export function statementNotices(file: StatementsFile | null): Notice[] {
  const out: Notice[] = [];
  for (const d of file?.documents ?? []) {
    if (d.status === "review") out.push({ key: `statement:${d.id}`, date: d.receivedAt.slice(0, 10), tone: "warn", title: `${d.name} waits for you`, detail: d.sentence ?? "Some figures could not be found in its text; confirm them or remove it on Statements.", href: "/statements" });
    if (d.status === "failed") out.push({ key: `statement:${d.id}`, date: d.receivedAt.slice(0, 10), tone: "danger", title: `${d.name} could not be read`, detail: d.sentence ?? "Remove it on Statements, or send it again.", href: "/statements" });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Watchlist levels

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 2 : 4 });
/** A figure from the filings, as a person reads it: two decimals at most. */
const fmtFigure = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * The levels a price has reached: for every record with a level, the price
 * at or below its "below" level or at or above its "above" level; and for a
 * watched symbol (one not held) with a valuation, the price at or below the
 * valuation's low. The level is in the key, so a changed level is a new
 * alert. A symbol with no price is not tested.
 */
export function levelNotices(records: Record<string, HoldingRecord>, held: ReadonlySet<string>, prices: Readonly<Record<string, number | null>>, today: string): Notice[] {
  const out: Notice[] = [];
  for (const [symbol, r] of Object.entries(records)) {
    const sym = symbol.toUpperCase();
    const price = prices[sym] ?? null;
    if (price === null || !Number.isFinite(price)) continue;
    const watched = !held.has(sym);
    const href = watched ? "/watchlist" : `/holdings/${encodeURIComponent(sym)}`;
    const below = r.levels?.below ?? null;
    const above = r.levels?.above ?? null;
    if (below !== null && price <= below) out.push({ key: `${WATCH_PREFIX}${sym}:below:${below}`, date: today, tone: "warn", title: `${sym} at ${fmt(price)}, at or below your ${fmt(below)}`, detail: r.note ? `Your note: ${r.note}` : "The level you set on the watchlist.", href });
    if (above !== null && price >= above) out.push({ key: `${WATCH_PREFIX}${sym}:above:${above}`, date: today, tone: "warn", title: `${sym} at ${fmt(price)}, at or above your ${fmt(above)}`, detail: r.note ? `Your note: ${r.note}` : "The level you set on the watchlist.", href });
    const low = r.ownValuation?.low ?? null;
    if (watched && low !== null && price <= low && below === null)
      out.push({ key: `${WATCH_PREFIX}${sym}:value-low:${low}`, date: today, tone: "info", title: `${sym} at ${fmt(price)}, at or below your low valuation of ${fmt(low)}`, detail: `Valued ${r.ownValuation!.asOf}${r.ownValuation!.basis ? ` (${r.ownValuation!.basis})` : ""}; base ${fmt(r.ownValuation!.base)}.`, href });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A holding's own triggers and kill signals

/** A trigger's figure in words: "Price", or the ontology's label for the field. */
export function triggerFieldLabel(field: string): string {
  return field === "price" ? "Price" : (FIELDS[field as FieldId]?.label ?? field);
}

/** The reading a trigger tests on a holding: its price, or the fundamental from its filings or research; null when there is none. */
export function triggerReading(h: Book["holdings"][number], field: string): number | null {
  if (field === "price") return h.price;
  const v = (h.fundamentals as Record<string, number | null | undefined> | undefined)?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Every trigger and kill signal on a holding's record that its reading now
 * meets: a kill signal is a breach, a trigger a watch. One alert per trigger,
 * keyed by its id and level. A trigger with no reading is not met.
 */
export function triggerNotices(book: Book, today: string): Notice[] {
  const out: Notice[] = [];
  const seen = new Set<string>();
  for (const h of book.holdings) {
    const sym = h.symbol.toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    for (const t of h.record?.triggers ?? []) {
      const v = triggerReading(h, t.field);
      if (v === null || !(t.is === "lte" ? v <= t.value : v >= t.value)) continue;
      const label = triggerFieldLabel(t.field);
      out.push({
        key: `trigger:${sym}:${t.id}`,
        date: today,
        tone: t.kind === "kill" ? "danger" : "warn",
        title: `${sym}: ${t.kind === "kill" ? "kill signal" : "trigger"} met, ${label.toLowerCase()} ${t.field === "price" ? fmt(v) : fmtFigure(v)} ${t.is === "lte" ? "at or below" : "at or above"} ${fmt(t.value)}`,
        detail: t.note ? `Your ${t.kind === "kill" ? "kill signal" : "trigger"}: ${t.note}` : `The ${t.kind === "kill" ? "kill signal" : "trigger"} on ${sym}'s record.`,
        href: `/holdings/${encodeURIComponent(sym)}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Checked by the person's own Claude against their broker (Hamza, 9 Nov 2026)

/**
 * The person's own Claude reads their broker's prices (through its own
 * connector, on its own schedule) and says which of their price levels and
 * price triggers are met now; the app keeps the verdict, never a price
 * (report_price_checks). Each met one is an alert keyed `broker:`, cleared
 * when a later check says it no longer holds.
 */
export const BROKER_PREFIX = "broker:";

export type BrokerCheck = { symbol: string; level?: "below" | "above"; trigger?: string; met: boolean };

/** What one check names that the records do not hold: a symbol with no record, a level not set, a trigger not on file or not on the price. */
export function unknownChecks(records: Record<string, HoldingRecord>, checks: readonly BrokerCheck[]): string[] {
  const bySym = new Map(Object.entries(records).map(([k, r]) => [k.toUpperCase(), r]));
  const out: string[] = [];
  for (const c of checks) {
    const sym = c.symbol.toUpperCase();
    const r = bySym.get(sym);
    if (!r) out.push(`${sym}: no record`);
    else if (c.level && (r.levels?.[c.level] ?? null) === null) out.push(`${sym}: no level ${c.level === "below" ? "below" : "above"}`);
    else if (c.trigger && !r.triggers.some((t) => t.id === c.trigger && t.field === "price")) out.push(`${sym}: no price trigger ${c.trigger}`);
    else if (!c.level && !c.trigger) out.push(`${sym}: names no level or trigger`);
  }
  return out;
}

/** The notices one check makes: each level or price trigger it says is met, in the person's own numbers, with no price. */
export function brokerNotices(records: Record<string, HoldingRecord>, held: ReadonlySet<string>, checks: readonly BrokerCheck[], today: string, at: string): Notice[] {
  const bySym = new Map(Object.entries(records).map(([k, r]) => [k.toUpperCase(), r]));
  const when = at.slice(11, 16);
  const out: Notice[] = [];
  for (const c of checks) {
    if (!c.met) continue;
    const sym = c.symbol.toUpperCase();
    const r = bySym.get(sym);
    if (!r) continue;
    const href = held.has(sym) ? `/holdings/${encodeURIComponent(sym)}` : "/watchlist";
    if (c.level) {
      const level = r.levels?.[c.level] ?? null;
      if (level === null) continue;
      out.push({ key: `${BROKER_PREFIX}${sym}:${c.level}:${level}`, date: today, tone: "warn", title: `${sym} at or ${c.level} your ${fmt(level)}, as your broker showed it`, detail: `Your Claude checked it against your broker at ${when} UTC.${r.note ? ` Your note: ${r.note}` : ""}`, href });
    } else if (c.trigger) {
      const t = r.triggers.find((x) => x.id === c.trigger && x.field === "price");
      if (!t) continue;
      out.push({ key: `${BROKER_PREFIX}${sym}:trigger:${t.id}`, date: today, tone: t.kind === "kill" ? "danger" : "warn", title: `${sym}: ${t.kind === "kill" ? "kill signal" : "trigger"} met, price ${t.is === "lte" ? "at or below" : "at or above"} ${fmt(t.value)}, as your broker showed it`, detail: `${t.note ? `Your ${t.kind === "kill" ? "kill signal" : "trigger"}: ${t.note}. ` : ""}Your Claude checked it against your broker at ${when} UTC.`, href });
    }
  }
  return out;
}

/** The alerts file after one check: what it says is met fires or holds, what it says is not met clears, and what it did not look at stays as it was. */
export function withBrokerChecks(prev: AlertsFile | null, records: Record<string, HoldingRecord>, held: ReadonlySet<string>, checks: readonly BrokerCheck[], today: string, now: string): { file: AlertsFile; fired: AlertItem[] } {
  const base = (c: BrokerCheck) => `${BROKER_PREFIX}${c.symbol.toUpperCase()}:${c.level ?? `trigger:${c.trigger}`}`;
  const looked = checks.map(base);
  const untouched: Notice[] = (prev?.items ?? [])
    .filter((i) => i.key.startsWith(BROKER_PREFIX) && i.clearedAt === null && !looked.some((b) => i.key === b || i.key.startsWith(`${b}:`)))
    .map((i) => ({ key: i.key, date: i.firedAt.slice(0, 10), tone: i.tone, title: i.title, detail: i.detail, href: i.href }));
  return reconcilePrefix(prev, BROKER_PREFIX, [...brokerNotices(records, held, checks, today, now), ...untouched], now);
}

// ---------------------------------------------------------------------------
// New trades

/** The keys of a new trade's question: only the person's answer or the window closing clears one. */
export const TRADE_PREFIX = "trade:";
/** A trade is new for this many days after its date, counted to the day the book was read. */
export const NEW_TRADE_DAYS = 14;
const TRADE_KINDS: readonly Transaction["kind"][] = ["buy", "sell", "option_open", "option_close"];

export type NewTrade = {
  key: string;
  date: string;
  kind: Transaction["kind"];
  /** As the broker names it; an option's full contract. */
  symbol: string;
  /** The company: the symbol, or an option's underlying. A Decision Log entry names this. */
  underlying: string;
  /** Summed over the day's fills; signed as the broker gives it. */
  quantity: number;
  account: string;
};

const tradeVerb = (t: Pick<NewTrade, "kind" | "quantity">) =>
  t.kind === "buy" ? "bought" : t.kind === "sell" ? "sold" : t.kind === "option_open" ? (t.quantity < 0 ? "sold to open" : "bought to open") : t.quantity < 0 ? "sold to close" : "bought to close";
const qty = (n: number) => String(Number(Math.abs(n).toFixed(4)));

/** "Bought 2.54 UBER": what a trade did, in words. */
export function tradeWords(t: Pick<NewTrade, "kind" | "quantity" | "symbol">): string {
  const v = tradeVerb(t);
  const unit = t.kind === "option_open" || t.kind === "option_close" ? ` contract${Math.abs(t.quantity) === 1 ? "" : "s"} of` : "";
  return `${v[0].toUpperCase()}${v.slice(1)} ${qty(t.quantity)}${unit} ${t.symbol}`;
}

/**
 * The trades of the last fortnight the person has given no reason for: each
 * day's fills of one symbol on one side, from the broker's own ledger, within
 * NEW_TRADE_DAYS of the day the book was read. A trade has its reason when a
 * Decision Log entry answers it (`action.on` is its key) or a trade entry
 * names its company within a week either side. Nothing here judges the trade.
 */
export function newTrades(book: Book, decisions: DecisionsFile | null): NewTrade[] {
  const by = new Map<string, NewTrade>();
  for (const t of book.transactions) {
    if (!TRADE_KINDS.includes(t.kind) || t.quantity === 0) continue;
    const age = daysBetween(t.date, book.asOf);
    if (age < 0 || age > NEW_TRADE_DAYS) continue;
    const symbol = t.symbol.trim();
    const key = `${TRADE_PREFIX}${symbol.toUpperCase()}:${t.date}:${t.kind}`;
    const got = by.get(key);
    if (got) {
      got.quantity += t.quantity;
      continue;
    }
    by.set(key, { key, date: t.date, kind: t.kind, symbol, underlying: (t.option?.underlying ?? symbol.split(/\s+/)[0]).toUpperCase(), quantity: t.quantity, account: t.account });
  }
  const entries = decisions?.entries ?? [];
  const answered = (n: NewTrade) =>
    entries.some((d) => d.action?.on === n.key || (d.kind === "trade" && d.symbol?.toUpperCase() === n.underlying && Math.abs(daysBetween(d.date, n.date)) <= 7));
  return [...by.values()].filter((n) => !answered(n)).sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol));
}

/** Each new trade as a question on Notifications: the trade, and whether there was a reason. */
export function tradeNotices(book: Book, decisions: DecisionsFile | null): Notice[] {
  return newTrades(book, decisions).map((t) => ({
    key: t.key,
    // Dated the day the broker's ledger showed it, so a Friday trade read on Monday is still news for the email.
    date: book.asOf > t.date ? book.asOf : t.date,
    tone: "info" as const,
    title: `New trade: ${tradeWords(t).replace(/^./, (c) => c.toLowerCase())}`,
    detail: `On ${longDate(t.date)} in ${t.account}. Is there a reason? Write it on Notifications and it is kept with ${t.underlying}.`,
    href: "/notifications",
  }));
}

// ---------------------------------------------------------------------------
// The email

const TONE_WORD: Record<AlertItem["tone"], string> = { danger: "Breach", warn: "Watch", info: "Note", ok: "Done" };
const TONE_COLOUR: Record<AlertItem["tone"], string> = { danger: "#b4232c", warn: "#a86200", info: "#1f5f8b", ok: "#1d7a4f" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type AlertsEmail = { subject: string; text: string; html: string };

/**
 * One email for the alerts a check found new: worst first, each with its
 * detail (which names the methodology's section) and a link into the app
 * when the deployment's address is known. Plain, inline-styled, like the
 * reports.
 */
export function alertsEmail(items: readonly AlertItem[], appUrl: string | null, checkedAt: string): AlertsEmail {
  const sorted = [...items].sort((a, b) => ALERT_TONES.indexOf(a.tone) - ALERT_TONES.indexOf(b.tone));
  const n = sorted.length;
  const subject = `${n} new alert${n === 1 ? "" : "s"}: ${sorted[0]?.title ?? ""}`.slice(0, 160);
  const base = appUrl && /^https:\/\/[^/\s]+$/.test(appUrl.replace(/\/$/, "")) ? appUrl.replace(/\/$/, "") : null;
  const link = (href: string) => (base && href.startsWith("/") ? `${base}${href}` : null);
  const when = `${localMoment(checkedAt)} your time`;
  const text = [
    `${n} new alert${n === 1 ? "" : "s"} at the check of ${when}.`,
    "",
    ...sorted.flatMap((i) => [`${TONE_WORD[i.tone]}: ${i.title}`, `  ${i.detail}`, ...(link(i.href) ? [`  ${link(i.href)}`] : []), ""]),
    base ? `Every alert: ${base}/notifications` : "Every alert is on the Notifications screen.",
    "Each alert is emailed once, when it fires. Not investment advice.",
  ].join("\n");
  const rows = sorted
    .map((i) => {
      const href = link(i.href);
      const title = href ? `<a href="${esc(href)}" style="color:#15171d;text-decoration:underline">${esc(i.title)}</a>` : esc(i.title);
      return (
        `<tr><td style="padding:10px 14px;border-bottom:1px solid #ece9e0;vertical-align:top;white-space:nowrap;font:600 12px/20px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${TONE_COLOUR[i.tone]}">${TONE_WORD[i.tone]}</td>` +
        `<td style="padding:10px 14px;border-bottom:1px solid #ece9e0;font:15px/20px Arial,sans-serif;color:#15171d">${title}<div style="font:13px/18px Arial,sans-serif;color:#5a5e68">${esc(i.detail)}</div></td></tr>`
      );
    })
    .join("");
  const html =
    `<div style="background:#f4f1ea;padding:24px 16px"><div style="max-width:640px;margin:0 auto">` +
    `<p style="margin:0 0 4px;font:600 12px/16px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#0f7b75">Invariant · Alerts</p>` +
    `<h1 style="margin:0 0 16px;font:700 22px/28px Arial,sans-serif;color:#15171d">${n} new alert${n === 1 ? "" : "s"}</h1>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px">${rows}</table>` +
    `<p style="margin:16px 0 0;font:13px/18px Arial,sans-serif;color:#5a5e68">Checked ${esc(when)}. ${base ? `<a href="${esc(`${base}/notifications`)}" style="color:#0f7b75">Every alert</a> is on Notifications.` : "Every alert is on the Notifications screen."} Each alert is emailed once, when it fires. Not investment advice.</p>` +
    `</div></div>`;
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Five-year valuation lows

/**
 * A holding or watchlist company whose multiple on the valuation metric the
 * person chose (its trailing twin for the market size or a DCF) is within
 * NEAR_LOW_PCT of its five-year low, with two years of history at least
 * (Hamza, 20 Oct 2026), and its forward P/E from the filings beside it
 * (`beside`; Hamza, 23 Oct 2026). The metric is in the key, so choosing
 * another is a new alert; it clears when the multiple rises off the low.
 */
export function valuationLowNotices(subjects: readonly { symbol: string; held: boolean; chosen: boolean; beside?: boolean; history: ValuationHistory | null }[], today: string): Notice[] {
  const out: Notice[] = [];
  for (const { symbol, held, chosen, beside, history: h } of subjects) {
    if (!h?.nearLow || !h.now || !h.low) continue;
    const label = HISTORY_LABEL[h.metric];
    out.push({
      key: `${VALUATION_LOW_PREFIX}${symbol}:${h.metric}`,
      date: today,
      tone: "info",
      title: `${symbol} near its five-year low ${label}: ${h.now.value.toFixed(1)}x`,
      detail: `${held ? "Held" : "On the watchlist"}. ${historyWords(h)} ${beside ? "The forward P/E is watched beside the method chosen in the Valuation calculator." : chosen ? "The metric follows the method chosen in the Valuation calculator." : `No method is chosen in the Valuation calculator, so ${label}.`}`,
      href: `/theses/${encodeURIComponent(symbol)}#valuation`,
    });
  }
  return out;
}
