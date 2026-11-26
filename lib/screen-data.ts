/**
 * Everything the skeleton's screens read, derived once per request from the
 * workspace: the methodology's findings, the caps and weights, the signals,
 * the clocks and dates, what needs the person, and which slots are on. Pure;
 * screens call it with the workspace they loaded.
 */
import { watcherNotices } from "@/lib/watchers";
import { EARNINGS_PREFIX, REPORT_PREFIX } from "@/lib/earnings";
import { FOUND_PREFIX } from "@/lib/calendar-agent";
import { MACRO_PREFIX } from "@/lib/macro-report";
import { ECON_EVENTS, econNotices } from "@/lib/econ-calendar";
import { econReachWords } from "@/lib/econ-exposure";
import { BROKER_PREFIX, CUSTOM_AGENT_PREFIX, MOVE_PREFIX, reconcile, statementNotices, tradeNotices, triggerNotices, unreadAlerts, VALUATION_LOW_PREFIX, WATCH_PREFIX, type AlertItem, type AlertsFile } from "@/lib/alerts";
import { CLUB_WATCH_PREFIX } from "@/lib/clubs";
import { COMMUNITY_PREFIX } from "@/lib/community";
import type { DecisionsFile } from "@/lib/decisions";
import type { FilingsFile } from "@/lib/filings";
import type { Book } from "@/lib/holdings";
import { contextFor, evaluate, type Finding, type Methodology } from "@/lib/methodology";
import type { EvalCtx, ScreenId, SlotId } from "@/lib/ontology";
import type { Preferences } from "@/lib/preferences";
import type { ResearchFile } from "@/lib/research";
import { insiderNotices } from "@/lib/insiders";
import { capsFor, classMix, datedItems, needsYou, noticesFor, signalsFor, slotsOn, weightsFor, type ActionItem, type Cap, type ClassMix, type DatedItem, type Notice, type Shown, type Signal, type Weight } from "@/lib/screens";
import type { InputId } from "@/lib/setup";
import type { StatementsFile } from "@/lib/statements";
import { todoFor, type TodoItem } from "@/lib/todo";

export type ScreenData = {
  m: Methodology | null;
  ctx: EvalCtx;
  findings: Finding[];
  caps: Cap[];
  /** The largest cap, for the weight bars' common scale; 20 when there is none. */
  scale: number;
  weights: Weight[];
  netWorth: number;
  mix: ClassMix[];
  signals: Signal[];
  dated: DatedItem[];
  actions: ActionItem[];
  notices: Notice[];
  /** The alerts file with today's notices laid on (opened, reworded, cleared), not written; the watchlist's levels and the holdings' moves stay as the last check left them. */
  alerts: AlertsFile;
  /** Open alerts not dismissed that fired since the person last marked everything read. */
  unread: AlertItem[];
  /** The methodology to-do list; empty without a methodology. */
  todo: TodoItem[];
  slots: (screen: ScreenId) => SlotId[];
};

export type ScreenSource = {
  book: Book;
  methodology: Methodology | null;
  inputs: readonly InputId[];
  shown: Shown;
  filings: FilingsFile | null;
  decisions: DecisionsFile | null;
  preferences: Preferences;
  /** The studies, for the Notifications screen and the unread count; the other screens leave it out. */
  research?: ResearchFile | null;
  /** The statements, so one waiting for the person or one that could not be read is a notice. */
  statements?: StatementsFile | null;
  /** The kept alerts (lib/alerts.ts), for Notifications and the unread count. */
  alerts?: AlertsFile | null;
  /** The instant the view is for; now when left out. */
  now?: string;
  /** The reports tomorrow and the reports after the results (lib/earnings.ts), when the caller read the calendar; left out, their alerts stay as the last check left them. */
  earnings?: Notice[] | null;
  /** The changes to the cards the person follows (lib/community.ts, `communityNotices`), when the caller read them; left out, their alerts stay as the last check left them. */
  community?: Notice[] | null;
  /** The days of the events the Calendar agent found (lib/calendar-agent.ts, under FOUND_PREFIX), when the caller read them; left out, their alerts stay as the last check left them. */
  calendar?: Notice[] | null;
  /** The reports after the macro events (lib/macro-report.ts, under MACRO_PREFIX), when the caller read them; left out, their alerts stay as the last check left them. */
  macro?: Notice[] | null;
};

export function deriveScreens(src: ScreenSource, today: string, nextReport: string | null = null): ScreenData {
  const m = src.methodology;
  const ctx = contextFor(src.book, today, m);
  const findings = m ? evaluate(m, src.book, today, src.inputs) : [];
  const caps = capsFor(m);
  const { weights, netWorth } = weightsFor(src.book, m, ctx);
  const signals = signalsFor(findings);
  const dated = datedItems(src.book, m, ctx, nextReport);
  const notices = [...noticesFor(signals, dated, src.filings, today, src.research ?? null), ...statementNotices(src.statements ?? null), ...triggerNotices(src.book, today), ...watcherNotices(src.preferences.watchers ?? [], src.book, src.filings, today), ...tradeNotices(src.book, src.decisions), ...insiderNotices(src.filings, today), ...econNotices(today, ECON_EVENTS, econReachWords(today, src.book, m)), ...(src.earnings ?? []), ...(src.community ?? []), ...(src.calendar ?? []), ...(src.macro ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const alerts = reconcile(src.alerts ?? null, notices, src.now ?? new Date().toISOString(), [WATCH_PREFIX, MOVE_PREFIX, CUSTOM_AGENT_PREFIX, VALUATION_LOW_PREFIX, CLUB_WATCH_PREFIX, BROKER_PREFIX, ...(src.earnings ? [] : [EARNINGS_PREFIX, REPORT_PREFIX]), ...(src.community ? [] : [COMMUNITY_PREFIX]), ...(src.calendar ? [] : [FOUND_PREFIX]), ...(src.macro ? [] : [MACRO_PREFIX])]).file;
  return {
    m,
    ctx,
    findings,
    caps,
    scale: Math.max(20, ...caps.map((c) => c.cap)),
    weights,
    netWorth,
    mix: classMix(src.book, m, ctx),
    signals,
    dated,
    actions: needsYou(weights, signals, dated, today),
    notices,
    alerts,
    unread: unreadAlerts(alerts, src.preferences.notificationsSeen, src.preferences.notificationsRead),
    todo: m ? todoFor({ m, book: src.book, ctx, findings, weights, signals, dated, decisions: src.decisions, inputs: src.inputs, today }) : [],
    slots: (screen) => slotsOn(screen, src.shown),
  };
}

/** The class label a methodology gives an id; the id itself when the methodology no longer has it. */
export function classLabel(m: Methodology | null, id: string | null): string {
  return id ? (m?.classes.find((c) => c.id === id)?.label ?? id) : "No class yet";
}
