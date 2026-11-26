/**
 * The scheduled report: one person's review at a time they chose, kept in
 * their vault and sent to their own sign-in address. Three kinds:
 *
 *   weekly    the week that ended on the most recent Friday, in HCMP's deck
 *             order (lib/review.ts): verdict and pillars, alarms, returns,
 *             what moved the book, what the numbers mean, caps and capital,
 *             trades and the rulebook, holdings and theses, news, coming up,
 *             sources and method;
 *   monthly   the previous calendar month, the same plus the month in
 *             numbers; built on the first scheduled day of each month;
 *   today     the dashboard as it stands (headline, checks, sections), the
 *             shape every report had before the reviews.
 *
 * Everything here is pure: what goes in a report, when a schedule is due,
 * how it reads as text and as HTML for the email, and the request for the
 * optional commentary written on the person's own provider. The reading of
 * the vault, the model calls and the sending live in server-only modules
 * (lib/report-run.ts, lib/methodology-draft.ts, lib/report-mail.ts).
 *
 * The report never scores returns and never advises. The verdict judges
 * behaviour and theses; returns are context.
 */
import { z } from "zod";

import type { DecisionsFile } from "@/lib/decisions";
import { reachKey, type EconEvent } from "@/lib/econ-calendar";
import type { SensitivityView } from "@/lib/event-sensitivity";
import type { FilingsFile } from "@/lib/filings";
import type { Book } from "@/lib/holdings";
import { bySender, digestDate, digestsIn, topPoints, type NewslettersFile } from "@/lib/newsletters";
import { computeFigure, contextFor, dashboardFor, evaluate, findingCounts, inputLabel, type Finding, type Methodology } from "@/lib/methodology";
import { PANELS, SLOTS, type SlotId } from "@/lib/ontology";
import { dashboardWith, type Preferences } from "@/lib/preferences";
import { formatUnit, needsWords, type Figure } from "@/lib/recipes";
import { deriveReview, logWords, NEWS_TOPIC_LABEL, NEWS_TOPICS, periodFor, REVIEW_LABEL, RULE_STATUS_LABEL, signedPct, signedPp, THESIS_LABEL, THESIS_TONE, type News, type Period, type Review, type ReviewKind, type RuleStatus } from "@/lib/review";
import { capTone, countdown, daysBetween, isShown, shownWhen, SIGNAL_LABEL } from "@/lib/screens";
import { INPUTS, inputsWithoutData, PROFILES, type Module, type Setup } from "@/lib/setup";
import { addDaysTo, currentZone, longDate, shortDate, zonePlace } from "@/lib/time";
import { shownFinds, STANCE_LABEL, type ThesisHunterFile } from "@/lib/thesis-hunter";
import { TODO_GROUP_LABEL } from "@/lib/todo";
import { MODELS } from "@/lib/models";
import type { LetterLine } from "@/lib/judgement";

// ---------------------------------------------------------------------------
// The schedule

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const CADENCES = ["weekly", "monthly", "both", "none"] as const;
export type Cadence = (typeof CADENCES)[number];
export const CADENCE_LABEL: Record<Cadence, string> = { weekly: "Weekly review", monthly: "Monthly review", both: "Weekly, and the monthly on the first week of each month", none: "No review; the figures are refreshed every morning" };

export const scheduleSchema = z.object({
  /** 0 is Sunday, as Date.getDay() counts. */
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  /** An IANA zone, the one the person's browser reports (kept in step on each visit); the hour is read on that clock. */
  zone: z.string().min(1).max(64),
  /** Add the commentary and the news, written and searched on the person's own provider. */
  prose: z.boolean(),
  /** Which reviews the schedule builds; a schedule kept before the reviews existed is weekly. */
  cadence: z.enum(CADENCES).default("weekly"),
});
export type Schedule = z.infer<typeof scheduleSchema>;

/** Sundays at 08:00 on the person's own clock: the zone the browser reports, never one written here. */
export function defaultSchedule(zone: string = currentZone()): Schedule {
  return { day: 0, hour: 8, zone, prose: false, cadence: "both" };
}

export { zoneValid } from "@/lib/time";

/** Day, hour and date on the schedule's own clock. */
export function localClock(now: Date, zone: string): { day: number; hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, weekday: "short", hour: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday").slice(0, 3));
  // Some engines format midnight as "24".
  const hour = Number(get("hour")) % 24;
  return { day, hour, date: `${get("year")}-${get("month")}-${get("day")}` };
}

/**
 * The most recent scheduled occurrence at or before this moment, named by its
 * local date. A report is due while that occurrence has not been claimed, so
 * the cron can run at any cadence: hourly sends in the hour, daily sends at
 * the first pass after the hour, a pass that failed is retried at the next,
 * and a clock change that skips the hour changes nothing. A slot is claimed
 * once, so two passes in one hour send one report.
 */
export function slotKey(schedule: Schedule, now: Date): string {
  const c = localClock(now, schedule.zone);
  let back = (c.day - schedule.day + 7) % 7;
  if (back === 0 && c.hour < schedule.hour) back = 7;
  return shiftDate(c.date, -back);
}

function shiftDate(date: string, days: number): string {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** A claim with no outcome after this long is a run whose function was killed (a timeout); its slot is due again (4 Nov 2026: the 1 Nov review was claimed, then cut off, and never sent). */
export const STALE_CLAIM_MINUTES = 20;

/** Whether a kept outcome is a claim left behind: "running" from before the claim carried its time, or "running <iso>" past STALE_CLAIM_MINUTES. */
export function staleClaim(outcome: string | null, now: Date): boolean {
  if (outcome === null || !outcome.startsWith("running")) return false;
  const at = Date.parse(outcome.slice("running ".length).split(" ")[0] ?? "");
  return Number.isNaN(at) || now.getTime() - at > STALE_CLAIM_MINUTES * 60_000;
}

const SENT_MARK = " sent:";

/** The reviews a slot's outcome says already went out ("running <iso> sent:weekly", "by hand <iso> sent:monthly"), so a claim taken back sends only the rest and a review is never sent twice (4 Nov 2026). */
export function sentKinds(outcome: string | null): ReviewKind[] {
  const m = outcome ? [...outcome.matchAll(/ sent:((?:weekly|monthly)(?:,(?:weekly|monthly))*)/g)].at(-1) : undefined;
  return m ? [...new Set(m[1].split(",") as ReviewKind[])] : [];
}

/** A claim's outcome while it runs: its time, then what it has sent so far. */
export function claimOutcome(at: Date, sent: readonly ReviewKind[]): string {
  return `running ${at.toISOString()}${sent.length ? `${SENT_MARK}${sent.join(",")}` : ""}`;
}

/** The outcome of a slot a review sent by hand stands in for (Send me one now). */
export function handOutcome(at: Date, sent: readonly ReviewKind[]): string {
  return `by hand ${at.toISOString()}${SENT_MARK}${sent.join(",")}`;
}

/** A slot whose run sent part of what it owed and then failed: what went out, then why it stopped. */
export function partlyOutcome(at: Date, sent: readonly ReviewKind[], why: string): string {
  return `partly sent ${at.toISOString()}${SENT_MARK}${sent.join(",")}. ${why}`.slice(0, 200);
}

/** Whether a claimed slot is to be taken back: a claim a killed run left, or a slot sent only in part, by hand or by a run that then failed (the weekly sent, the first week's monthly still owed). */
export function reclaimable(schedule: Schedule, slot: string, outcome: string | null, now: Date): boolean {
  if (staleClaim(outcome, now)) return true;
  if (!outcome?.startsWith("by hand") && !outcome?.startsWith("partly sent")) return false;
  const sent = sentKinds(outcome);
  return kindsDue(schedule, slot).some((k) => !sent.includes(k));
}

export function isDue(schedule: Schedule, now: Date, lastSlot: string | null, lastOutcome: string | null = null): boolean {
  const slot = slotKey(schedule, now);
  return slot !== lastSlot || reclaimable(schedule, slot, lastOutcome, now);
}

/**
 * The slot a review sent by hand stands in for, so the schedule does not send
 * the same review again (4 Nov 2026: the 19 to 23 Oct weekly came twice, by
 * hand on Sunday and by the schedule on Monday). The slot due now when it is
 * not yet claimed, else the next one once this one is settled; either only
 * when it builds this kind over the same period. Null when neither does.
 */
export function handSlot(schedule: Schedule, now: Date, lastSlot: string | null, lastOutcome: string | null, kind: ReviewKind, periodTo: string): { slot: string; outcome: string } | null {
  if (schedule.cadence === "none") return null;
  const current = slotKey(schedule, now);
  const covers = (slot: string) => kindsDue(schedule, slot).includes(kind) && periodFor(kind, slot).to === periodTo;
  const outcome = handOutcome(now, [kind]);
  if (current !== lastSlot) return covers(current) ? { slot: current, outcome } : null;
  // The slot due now is claimed: the next is taken only once this one is settled, never over a run going on or a slot owed again.
  if (lastOutcome?.startsWith("running") || reclaimable(schedule, current, lastOutcome, now)) return null;
  const next = shiftDate(current, 7);
  return covers(next) ? { slot: next, outcome } : null;
}

/** The reviews a slot on `date` builds: the weekly every week, the monthly on the first scheduled day of a month (the 1st to the 7th). */
export function kindsDue(schedule: Schedule, date: string): ReviewKind[] {
  const firstWeek = Number(date.slice(8, 10)) <= 7;
  if (schedule.cadence === "none") return [];
  if (schedule.cadence === "weekly") return ["weekly"];
  if (schedule.cadence === "monthly") return firstWeek ? ["monthly"] : [];
  return firstWeek ? ["weekly", "monthly"] : ["weekly"];
}

export function scheduleWords(s: Schedule): string {
  if (s.cadence === "none") return CADENCE_LABEL.none;
  return `${DAYS[s.day]}s at ${String(s.hour).padStart(2, "0")}:00 ${zonePlace(s.zone)} time, ${CADENCE_LABEL[s.cadence].toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// The report

export const REPORTS_KEPT = 12;

export const REPORT_KINDS = ["today", "weekly", "monthly"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

const lineSchema = z.object({
  label: z.string(),
  value: z.string().nullable(),
  detail: z.string().nullable(),
  tone: z.enum(["ok", "warn", "danger", "info", "neutral"]),
  /** A page the line came from (a news item's source), shown as a link. */
  href: z.string().nullable().optional(),
});
export type ReportLine = z.infer<typeof lineSchema>;

const sectionSchema = z.object({
  heading: z.string(),
  lines: z.array(lineSchema),
  footer: z.string().nullable(),
  /** The review slot it fills (lib/ontology.ts), so the deck draws it in its own shape; null on a report kept before, or a dashboard report. */
  slot: z.string().nullable().optional(),
  /** Which part of a slot: the news by topic. */
  part: z.string().nullable().optional(),
});
export type ReportSection = z.infer<typeof sectionSchema>;

const levelSchema = z.enum(["ok", "warn", "danger"]);
const pillarSchema = z.object({ label: z.string(), level: levelSchema, status: z.string(), note: z.string() });
const returnSchema = z.object({ label: z.string(), account: z.number().nullable(), benchmarks: z.record(z.string(), z.number().nullable()), note: z.string().nullable() });

const pathSchema = z.object({ dates: z.array(z.string()).max(400), series: z.array(z.object({ label: z.string(), values: z.array(z.number().nullable()).max(400) })).max(8) });

/**
 * The figures behind the review's charts, kept with the report so the deck
 * draws them from the report alone: the period's and the year's paths, the
 * contribution, the weights against their caps, the class mix, the matrix of
 * pairs and the markets. Each is empty where its slot is off or the data is
 * missing; the section's own lines say what it needs.
 */
export const chartsSchema = z.object({
  period: pathSchema.nullable(),
  ytd: pathSchema.nullable(),
  contribution: z.array(z.object({ label: z.string(), value: z.number() })).max(80),
  byClass: z.array(z.object({ label: z.string(), contrib: z.number(), weight: z.number() })).max(20),
  caps: z.array(z.object({ label: z.string(), weight: z.number(), cap: z.number().nullable(), state: z.enum(["over", "near", "within", "none"]) })).max(80),
  mix: z.array(z.object({ label: z.string(), weight: z.number(), cap: z.number().nullable() })).max(20),
  cash: z.number().nullable(),
  correlation: z
    .object({ symbols: z.array(z.string()).max(40), pairs: z.array(z.object({ a: z.string(), b: z.string(), r: z.number() })).max(800), average: z.number(), days: z.number(), to: z.string(), book: z.record(z.string(), z.number().nullable()) })
    .nullable(),
  markets: z.array(z.object({ symbol: z.string(), name: z.string(), change: z.number(), unit: z.enum(["pct", "pp"]) })).max(20),
});
export type Charts = z.infer<typeof chartsSchema>;

export const reportSchema = z.object({
  id: z.string(),
  /** When it was built, ISO. */
  builtAt: z.string(),
  /** The figures' date: the book's as-of. */
  asOf: z.string(),
  title: z.string(),
  /** One line under the title: what shaped it. */
  shapedBy: z.string(),
  summary: z.string(),
  sections: z.array(sectionSchema),
  /** Commentary written on the person's own key, or null. */
  prose: z.string().nullable(),
  /** Sentences about the build itself: a commentary that was skipped and why. */
  notes: z.array(z.string()).default([]),
  /** What the report covers; a report kept before the reviews existed is "today". */
  kind: z.enum(REPORT_KINDS).default("today"),
  period: z.object({ from: z.string(), to: z.string(), label: z.string() }).nullable().default(null),
  /** The cover: the verdict, its two pillars, and the returns as context. */
  verdict: z.object({ label: z.string(), level: levelSchema, reason: z.string() }).nullable().default(null),
  pillars: z.array(pillarSchema).default([]),
  returns: z.array(returnSchema).default([]),
  /** When the email went out, ISO; null for a review built and never sent. */
  sentAt: z.string().nullable().default(null),
  /** The deck a review kept as Google Slides before the reviews became a page and a PDF (4 Nov 2026); read so old reviews still parse, never written. */
  deck: z.object({ id: z.string().regex(/^[\w-]{10,100}$/), url: z.string().regex(/^https:\/\/docs\.google\.com\//) }).nullable().default(null),
  /** The review as a PDF report (lib/review-pdf.ts), kept in the vault; null where the vault keeps none or it could not be kept. */
  pdf: z.object({ id: z.string().regex(/^[\w-]{10,100}$/), url: z.string().regex(/^https:\/\/drive\.google\.com\//) }).nullable().default(null),
  /** The figures the review's charts draw; null on a dashboard report or one kept before charts. */
  charts: chartsSchema.nullable().default(null),
});
export type Report = z.infer<typeof reportSchema>;

export const reportsFileSchema = z.object({ version: z.literal(1), reports: z.array(reportSchema).max(REPORTS_KEPT) });
export type ReportsFile = z.infer<typeof reportsFileSchema>;
export const EMPTY_REPORTS: ReportsFile = { version: 1, reports: [] };

/** The newest first, the oldest dropped past the cap. */
export function keepReports(file: ReportsFile | null, report: Report): ReportsFile {
  const rest = (file?.reports ?? []).filter((r) => r.id !== report.id);
  return { version: 1, reports: [report, ...rest].slice(0, REPORTS_KEPT) };
}

/** Marks one kept report as sent at a time, so the screen can show it as it went out. */
export function markSent(file: ReportsFile, id: string, at: string): ReportsFile {
  return { ...file, reports: file.reports.map((r) => (r.id === id ? { ...r, sentAt: at } : r)) };
}

/** The newest review of a kind that went out by email, else the newest built; the screen says which. */
export function lastOfKind(file: ReportsFile | null, kind: Exclude<ReportKind, "today">): Report | null {
  const of = (file?.reports ?? []).filter((r) => r.kind === kind);
  return of.find((r) => r.sentAt !== null) ?? of[0] ?? null;
}

/**
 * Whether the review's own page is embedded above it (lib/review-html.ts,
 * every weekly and monthly). The sections drawn below would only repeat it,
 * so the screen leaves them out (Hamza, 19 Oct 2026); a daily report draws
 * its sections.
 */
export function embedsItself(report: Report) {
  return report.kind !== "today";
}

/** The commentary's paragraphs: the model writes them a blank line apart. */
export const paragraphsOf = (text: string): string[] => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const TONE_OF: Record<Finding["status"], ReportLine["tone"]> = { pass: "ok", near: "warn", fail: "danger", manual: "info", "n/a": "neutral" };
const ORDER: Record<Finding["status"], number> = { fail: 0, near: 1, manual: 2, "n/a": 3, pass: 4 };

function findingLine(f: Finding): ReportLine {
  const label = `${f.rule.section} ${f.rule.text.replace(/\.$/, "")}`;
  if (f.status === "manual") return { label, value: "Yours to check", detail: null, tone: "info" };
  if (f.status === "n/a") return { label, value: "Waiting", detail: f.detail || null, tone: "neutral" };
  const state = f.status === "pass" ? "Within" : f.status === "near" ? "Near the limit" : f.rule.severity === "breach" ? "Breach" : f.rule.severity === "watch" ? "Tripped" : "Outside guideline";
  const tone = f.status === "fail" && f.rule.severity === "watch" ? "info" : TONE_OF[f.status];
  return { label, value: state, detail: [f.actual ? `now ${f.actual}` : null, f.limit ? `limit ${f.limit}` : null, f.detail || null].filter(Boolean).join(" · ") || null, tone };
}

function figureLine(f: Figure, ctx: ReturnType<typeof contextFor>, setup: Setup, ccy: string): ReportLine {
  const r = computeFigure(f, ctx, setup.inputs);
  if (r.needs.length) return { label: f.label, value: "Waiting", detail: needsWords(r.needs, inputLabel), tone: "neutral" };
  if (r.kind === "scalar") return { label: f.label, value: r.value === null ? "Nothing to measure yet" : formatUnit(r.value, f.unit, ccy), detail: f.about ?? null, tone: "neutral" };
  const shown = r.points.slice(0, 5);
  if (!shown.length) return { label: f.label, value: "Nothing to show yet", detail: f.about ?? null, tone: "neutral" };
  const latest = f.by && ["date", "month", "quarter", "year"].includes(f.by) ? r.points[r.points.length - 1] : null;
  return {
    label: f.label,
    value: latest ? `${formatUnit(latest.value, f.unit, ccy)} (${latest.label})` : `${r.points.length} row${r.points.length === 1 ? "" : "s"}`,
    detail: latest ? null : shown.map((p) => `${p.label} ${formatUnit(p.value, f.unit, ccy)}`).join(", ") + (r.points.length > 5 ? `, and ${r.points.length - 5} more` : ""),
    tone: "neutral",
  };
}

export function summaryWords(counts: ReturnType<typeof findingCounts>, total: number): string {
  if (!total) return "No rules to check yet.";
  const parts: string[] = [];
  if (counts.breaches) parts.push(`${counts.breaches} breach${counts.breaches > 1 ? "es" : ""}`);
  if (counts.outside) parts.push(`${counts.outside} outside guideline`);
  if (counts.tripped) parts.push(`${counts.tripped} watch${counts.tripped > 1 ? "es" : ""} tripped`);
  if (counts.near) parts.push(`${counts.near} near a limit`);
  parts.push(`${counts.pass} within`);
  if (counts.manual) parts.push(`${counts.manual} yours to check`);
  if (counts.waiting) parts.push(`${counts.waiting} waiting for data`);
  return parts.join(", ") + ".";
}

export type ReportInput = {
  setup: Setup;
  book: Book;
  methodology: Methodology | null;
  preferences: Preferences;
  today: string;
  now: Date;
  modules: readonly Module[];
  /** "today" when left out: the dashboard as it stands. */
  kind?: ReportKind;
  decisions?: DecisionsFile | null;
  filings?: FilingsFile | null;
  nextReport?: string | null;
};

/** The report: a weekly or monthly review, or the dashboard as it stands today. */
export function buildReport(input: ReportInput): Report {
  const { setup, book, methodology: m, preferences, today, now, modules } = input;
  const kind = input.kind ?? "today";
  const stamp = now.toISOString();
  const base = {
    notes: [] as string[],
    sentAt: null,
    deck: null,
    pdf: null,
    charts: null,
    id: `report-${stamp.slice(0, 10)}-${stamp.slice(11, 16).replace(":", "")}${kind === "today" ? "" : `-${kind}`}`,
    builtAt: stamp,
    asOf: book.asOf,
    shapedBy: m ? `Shaped by ${m.name}` : `${PROFILES[setup.profile].label}, built from your inputs`,
    prose: null,
    kind,
    period: null,
    verdict: null,
    pillars: [],
    returns: [],
  };
  if (kind !== "today") {
    const period = periodFor(kind, today);
    const review = deriveReview({ m, book, inputs: setup.inputs, decisions: input.decisions ?? null, filings: input.filings ?? null, period, today, nextReport: input.nextReport ?? null });
    const shown = shownWhen(m, book, null, input.decisions ?? null, preferences.practices);
    const on = (slot: SlotId) => isShown(SLOTS[slot], shown);
    const sections = reviewSections(review, book, m, on, today);
    const followed = review.rules.filter((r) => r.status === "followed").length;
    const judged = review.rules.filter((r) => r.status !== "check" && r.status !== "waiting").length;
    const summary = review.verdict
      ? `${review.verdict.label}. ${review.pillars.map((p) => `${p.label}: ${p.status.toLowerCase()}`).join("; ")}. ${followed} of ${judged} rules followed.`
      : "No methodology yet, so no verdict: the figures of the period, with nothing judged.";
    return {
      ...base,
      title: `${REVIEW_LABEL[kind]}, ${period.label}`,
      summary,
      sections,
      period: { from: period.from, to: period.to, label: period.label },
      verdict: review.verdict,
      pillars: review.pillars,
      returns: review.returns.map((r) => ({ label: r.label, account: r.account, benchmarks: r.benchmarks, note: r.note })),
      charts: chartsOf(review, on),
    };
  }

  const ccy = book.fx.base;
  const dash = dashboardFor(setup.profile, [...modules], m);
  const { figures, dashboard } = dashboardWith(dash.figures, dash.dashboard, preferences);
  const ctx = contextFor(book, today, m);
  const findings = m ? evaluate(m, book, today, setup.inputs) : [];
  const counts = findingCounts(findings);
  const byId = new Map(figures.map((f) => [f.id, f]));
  const sections: ReportSection[] = [];

  const headline = dashboard.headline.map((id) => byId.get(id)).filter((f): f is Figure => !!f);
  if (headline.length) sections.push({ heading: "Headline", lines: headline.map((f) => figureLine(f, ctx, setup, ccy)), footer: null });

  if (findings.length) {
    const sorted = [...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    sections.push({ heading: "Methodology checks", lines: sorted.map(findingLine), footer: "Worst first. Each rule cites its section in your methodology." });
  }

  for (const s of dashboard.sections) {
    if (s.kind !== "figures") {
      sections.push({ heading: PANELS[s.id].label, lines: [{ label: PANELS[s.id].about, value: "In the app", detail: null, tone: "neutral" }], footer: null });
      continue;
    }
    const fs = s.figures.map((id) => byId.get(id)).filter((f): f is Figure => !!f && !headline.includes(f));
    if (fs.length) sections.push({ heading: s.label, lines: fs.map((f) => figureLine(f, ctx, setup, ccy)), footer: null });
  }

  const waiting = inputsWithoutData(setup, book);
  const missing = dash.missing.map((id) => PANELS[id].label);
  if (waiting.length || missing.length) {
    sections.push({
      heading: "Still waiting",
      lines: [
        ...waiting.map((i) => ({ label: INPUTS[i].label, value: "Not connected", detail: null, tone: "neutral" as const })),
        ...missing.map((label) => ({ label, value: "Asked for by the methodology", detail: "Add the input in Setup to fill it.", tone: "neutral" as const })),
      ],
      footer: null,
    });
  }

  return { ...base, title: `Portfolio report, ${today}`, summary: summaryWords(counts, findings.length), sections };
}

// ---------------------------------------------------------------------------
// The review's sections, in HCMP's order

const RULE_TONE: Record<RuleStatus, ReportLine["tone"]> = { followed: "ok", partly: "warn", not: "danger", check: "info", waiting: "neutral" };
const money = (n: number, ccy: string) => `${n < 0 ? "-" : ""}${ccy} ${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const pct1 = (n: number) => `${n.toFixed(1)}%`;
const num = (n: number | null, digits = 2, suffix = "") => (n === null ? "Not computed" : `${n.toFixed(digits)}${suffix}`);

function reviewSections(r: Review, book: Book, m: Methodology | null, on: (slot: SlotId) => boolean, today: string): ReportSection[] {
  const ccy = book.fx.base;
  const out: ReportSection[] = [];
  const period = r.period;
  const label = (slot: SlotId) => SLOTS[slot].label;

  if (on("review_alarms") && r.alarms.length) {
    out.push({ slot: "review_alarms", part: null, heading: label("review_alarms"), lines: r.alarms.map((a) => ({ label: a.title, value: a.when || (a.tone === "danger" ? "Act" : a.tone === "warn" ? "Watch" : "Note"), detail: a.detail, tone: a.tone })), footer: "Most urgent first. Each names the section it comes from." });
  }

  if (on("review_returns")) {
    const lines: ReportLine[] = [];
    for (const row of r.returns) {
      const prefix = row.label === "Year to date" ? "Year to date, " : "";
      if (row.account === null) lines.push({ label: `${prefix}account`, value: "Waiting", detail: row.note, tone: "neutral" });
      else lines.push({ label: `${prefix}account (time-weighted)`, value: signedPct(row.account), detail: `${longDate(row.from)} close to ${longDate(row.to)} close`, tone: "neutral" });
      for (const [symbol, v] of Object.entries(row.benchmarks)) {
        if (v === null) lines.push({ label: `${prefix}${symbol}`, value: "Waiting", detail: row.note, tone: "neutral" });
        else lines.push({ label: `${prefix}${symbol}`, value: signedPct(v), detail: row.account === null ? null : `account minus ${symbol}: ${signedPp(row.account - v)}`, tone: "neutral" });
      }
    }
    if (lines.length) out.push({ slot: "review_returns", part: null, heading: `${label("review_returns")}, ${period.label}`, lines, footer: "Context only; the verdict never reads it. The account's return takes deposits and withdrawals out." });
  }

  if (on("review_moves")) {
    const lines: ReportLine[] = [];
    if (r.moves) {
      for (const c of r.moves.byClass) lines.push({ label: c.label, value: signedPp(c.contrib), detail: `${pct1(c.weightEnd)} of the book at the end`, tone: "neutral" });
      const best = r.moves.rows.slice(0, 3);
      const worst = r.moves.rows.slice(-3).reverse().filter((x) => !best.includes(x));
      for (const h of [...best, ...worst]) lines.push({ label: `${h.symbol}`, value: `${signedPct(h.ret, 1)} (${signedPp(h.contrib)})`, detail: `${h.classLabel}, ${pct1(h.weightStart)} of the book at the start`, tone: h.contrib >= 0 ? "ok" : "danger" });
      if (r.moves.missing.length) lines.push({ label: "Left out", value: r.moves.missing.join(", "), detail: "No closes for these over the period.", tone: "neutral" });
    } else {
      lines.push({ label: "Contribution by holding", value: "Waiting", detail: "Needs daily closes per holding; no input supplies them yet.", tone: "neutral" });
    }
    if (r.correlation) {
      const c = r.correlation;
      lines.push({ label: `Correlation, ${c.days} sessions to ${shortDate(c.to)}`, value: c.average.toFixed(2), detail: `Average of every pair over ${c.symbols.length} holdings.${c.tight.length ? ` Above 0.8: ${c.tight.map((p) => `${p.a} and ${p.b}`).join(", ")}.` : " No pair above 0.8."}`, tone: c.tight.length ? "warn" : "neutral" });
      for (const [s, v] of Object.entries(c.book)) if (v !== null) lines.push({ label: `Book against ${s}`, value: v.toFixed(2), detail: null, tone: "neutral" });
      lines.push({ label: "Highest pairs", value: null, detail: c.highest.map((p) => `${p.a} and ${p.b} ${p.r.toFixed(2)}`).join(", "), tone: "neutral" });
      lines.push({ label: "Lowest pairs", value: null, detail: c.lowest.map((p) => `${p.a} and ${p.b} ${p.r.toFixed(2)}`).join(", "), tone: "neutral" });
    } else if (r.moves) {
      lines.push({ label: "Correlation", value: "Waiting", detail: "Needs 21 sessions of closes for at least three holdings.", tone: "neutral" });
    }
    out.push({ slot: "review_moves", part: null, heading: label("review_moves"), lines, footer: r.moves ? `Contribution is each holding's return times its weight at the start (${r.moves.navStartSource === "series" ? "the account's value on the series" : "the positions at the start close"}).` : null });
  }

  if (on("review_insights") && r.insights.length) {
    out.push({ slot: "review_insights", part: null, heading: label("review_insights"), lines: r.insights.map((i) => ({ label: i.head, value: null, detail: i.text, tone: "neutral" })), footer: null });
  }

  if (on("review_capital") && r.weights.length) {
    const lines: ReportLine[] = [];
    if (m?.classes.length) for (const c of r.mix) lines.push({ label: c.label, value: pct1(c.weight), detail: `${c.count} holding${c.count === 1 ? "" : "s"}${c.cap ? `, ${c.cap.cap}% cap each (${c.cap.rule.section})` : ""}`, tone: "neutral" });
    for (const w of r.weights) {
      const room = w.cap ? ((w.cap.cap - w.weight) / 100) * r.netWorth : null;
      const detail = w.cap ? (room !== null && room < 0 ? `${money(room, ccy)} over its ${w.cap.cap}% cap (${w.cap.rule.section})${w.sharesToCap !== null ? `; about ${w.sharesToCap.toFixed(2)} sh to the cap` : ""}` : `${money(room ?? 0, ccy)} to its ${w.cap.cap}% cap`) : m?.classes.length ? "No cap" : null;
      lines.push({ label: `${w.symbol} · ${w.classLabel}`, value: `${w.weight.toFixed(2)}%`, detail, tone: capTone(w.state) });
    }
    lines.push({ label: "Cash", value: pct1(r.cash), detail: `Net worth ${money(r.netWorth, ccy)}`, tone: "neutral" });
    out.push({ slot: "review_capital", part: null, heading: label("review_capital"), lines, footer: `Weights at the ${shortDate(book.asOf)} close, by value to the owner.` });
  }

  if (on("review_trades")) {
    const lines: ReportLine[] = r.trades.map((t) => {
      const clean = t.logged.state !== "none" && t.logged.state !== "after" && t.voted.state !== "after" && !(t.side === "buy" && t.overCap);
      const late = t.logged.state === "after" || t.voted.state === "after";
      return {
        label: `${t.side === "buy" ? "Buy" : "Sell"} ${t.symbol} ${Math.abs(t.quantity).toFixed(2)} sh, ${money(t.amount, ccy)}`,
        value: shortDate(t.date),
        detail: `${t.classLabel}${t.cap !== null ? `, ${t.cap}% cap, ${t.weightNow.toFixed(2)}% now${t.overCap ? " (over)" : ""}` : ""}. ${logWords(t.logged, "entry")}; ${logWords(t.voted, "vote").toLowerCase()}.`,
        tone: clean ? "ok" : late ? "warn" : "danger",
      };
    });
    out.push({ slot: "review_trades", part: null, heading: `${label("review_trades")}, ${period.short}`, lines: lines.length ? lines : [{ label: "No trades this period", value: null, detail: null, tone: "neutral" }], footer: lines.length ? "An entry or a vote after the trade is partly followed; none within a week is not followed." : null });
  }

  if (on("review_rulebook") && r.rules.length) {
    const followed = r.rules.filter((x) => x.status === "followed").length;
    const judged = r.rules.filter((x) => x.status !== "check" && x.status !== "waiting").length;
    out.push({
      slot: "review_rulebook",
      heading: `${label("review_rulebook")}: ${followed} of ${judged} followed`,
      lines: r.rules.map((x) => ({ label: `${x.rule.section} ${x.rule.text.replace(/\.$/, "")}`, value: RULE_STATUS_LABEL[x.status], detail: x.note, tone: RULE_TONE[x.status] })),
      footer: "A cap over by price alone is partly followed; bought into, not followed. Rules the app cannot read are yours to check and are not counted.",
    });
  }

  if (on("review_theses") && r.theses.length) {
    out.push({
      slot: "review_theses",
      heading: label("review_theses"),
      lines: r.theses.map((t) => ({ label: `${t.symbol} · ${t.classLabel}${t.test ? `, ${t.test}` : ""}`, value: THESIS_LABEL[t.status], detail: `${t.onFile}. ${t.evidence}`, tone: THESIS_TONE[t.status] })),
      footer: "A standing comes from the holding's own figures, the clocks and the Decision Log; price alone never changes it.",
    });
  }

  if (on("review_markets")) {
    const lines: ReportLine[] = r.markets.map((x) => ({ label: x.name, value: x.unit === "pp" ? signedPp(x.change) : signedPct(x.change, 1), detail: x.unit === "pp" ? `${x.level.toFixed(2)}% at the close` : null, tone: "neutral" }));
    out.push({
      slot: "review_markets",
      part: null,
      heading: `${label("review_markets")}, ${period.short}`,
      lines: lines.length ? lines : [{ label: "Market readings", value: "Waiting", detail: "The market feed has no readings over the period yet.", tone: "neutral" }],
      footer: lines.length ? "From the market feed: a price in percent, a yield or spread in points, close to close." : null,
    });
  }

  if (on("review_month") && r.month) {
    const s = r.month;
    const lines: ReportLine[] = [];
    if (s.risk) {
      lines.push({ label: "Time-weighted return", value: num(s.risk.twr, 2, "%"), detail: `${longDate(s.risk.from)} to ${longDate(s.risk.to)}`, tone: "neutral" });
      lines.push({ label: "Worst day", value: num(s.risk.worstFall, 2, "%"), detail: null, tone: "neutral" });
      lines.push({ label: "Worst fall inside the month", value: num(s.risk.maxDrawdown, 2, "%"), detail: "Peak to trough", tone: "neutral" });
      lines.push({ label: "Volatility, annualised", value: num(s.risk.volatility, 1, "%"), detail: `${s.risk.n} daily returns`, tone: "neutral" });
      if (s.benchmark) lines.push({ label: `Beta and correlation to ${s.benchmark}`, value: s.risk.beta === null ? "Not computed" : `${s.risk.beta.toFixed(2)} / ${num(s.risk.correlation, 2)}`, detail: null, tone: "neutral" });
    } else lines.push({ label: "Return and risk", value: "Waiting", detail: "Needs the account's daily value series over the month.", tone: "neutral" });
    if (s.capture && s.benchmark) lines.push({ label: `Up and down capture of ${s.benchmark}`, value: `${num(s.capture.up, 0, "%")} / ${num(s.capture.down, 0, "%")}`, detail: `${s.capture.upDays} up days, ${s.capture.downDays} down days`, tone: s.capture.up !== null && s.capture.down !== null && s.capture.down > s.capture.up ? "warn" : "neutral" });
    if (s.tracking && s.benchmark) lines.push({ label: `Tracking error and information ratio to ${s.benchmark}`, value: `${num(s.tracking.trackingError, 1, "%")} / ${num(s.tracking.informationRatio, 2)}`, detail: "Annualised, over the month's days", tone: "neutral" });
    if (s.sinceStart) lines.push({ label: "Since the series began", value: `Sharpe ${num(s.sinceStart.sharpe, 2)}, Calmar ${num(s.sinceStart.calmar, 2)}`, detail: `${longDate(s.sinceStart.from)} to ${longDate(s.sinceStart.to)}, rate ${(s.sinceStart.rate * 100).toFixed(2)}%${s.sinceStart.calmar === null ? "; Calmar needs a year" : ""}`, tone: "neutral" });
    if (s.trades) {
      const t = (x: typeof s.trades.period) => (x.sales ? `${x.wonPct === null ? "" : `${x.wonPct.toFixed(0)}% won, `}profit factor ${num(x.profitFactor, 2)}, average win ${x.avgWin === null ? "none" : money(x.avgWin, ccy)} against loss ${x.avgLoss === null ? "none" : money(x.avgLoss, ccy)}, winners held ${num(x.avgDaysWinners, 0, "d")} and losers ${num(x.avgDaysLosers, 0, "d")}` : "No sales");
      lines.push({ label: `Trade quality, ${period.short}`, value: `${s.trades.period.sales} sale${s.trades.period.sales === 1 ? "" : "s"}`, detail: t(s.trades.period), tone: "neutral" });
      lines.push({ label: "Trade quality, year to date", value: `${s.trades.ytd.sales} sale${s.trades.ytd.sales === 1 ? "" : "s"}`, detail: t(s.trades.ytd), tone: "neutral" });
    }
    for (const h of s.hindsight) {
      const words = h.changePct === null ? (h.laterDate ? "No closes to score it" : `Scored 30 days after, on ${shortDate(h.scoreOn)}`) : h.changePct > 0 ? `Kept rising: ${signedPct(h.changePct, 1)} by ${shortDate(h.laterDate!)}` : `Fell ${signedPct(h.changePct, 1)} by ${shortDate(h.laterDate!)}`;
      lines.push({ label: `Sold ${h.symbol} ${shortDate(h.date)}`, value: `${h.pnl >= 0 ? "+" : "-"}${money(Math.abs(h.pnl), ccy)}`, detail: `Realised on the lots sold. ${words}.`, tone: h.changePct !== null && h.changePct > 0 ? "warn" : "neutral" });
    }
    for (const w of s.warnings) lines.push({ label: "Ledger", value: null, detail: w, tone: "warn" });
    out.push({ slot: "review_month", part: null, heading: `${label("review_month")}, ${period.label}`, lines, footer: "Returns and risk from the account's own series; trade quality from the ledger's closed lots, first in first out." });
  }

  if (on("review_calendar")) {
    const lines: ReportLine[] = [];
    for (const d of r.coming) lines.push({ label: d.title, value: countdown(daysBetween(today, d.date)), detail: `${longDate(d.date)}. ${d.detail}`, tone: d.kind === "clock" ? "warn" : "info" });
    const seen = new Set(r.alarms.map((a) => a.title));
    for (const t of r.todo.filter((x) => !seen.has(x.title)).slice(0, 8)) lines.push({ label: t.title, value: TODO_GROUP_LABEL[t.group], detail: t.why, tone: t.group === "now" ? "danger" : t.group === "due" ? "warn" : "info" });
    if (lines.length) out.push({ slot: "review_calendar", part: null, heading: label("review_calendar"), lines, footer: "Clocks, expiries and the methodology's to-do list; the next 35 days first." });
  }

  if (on("review_method")) {
    const lines: ReportLine[] = [
      { label: "Account series", value: book.series?.nav.length ? "In the book" : "None", detail: book.series?.source ?? "No daily value series; returns wait for one.", tone: "neutral" },
      { label: "Benchmarks", value: r.benchmarks.length ? r.benchmarks.join(", ") : "None named", detail: r.benchmarks.length ? "Price series the methodology names, lent by the market feed when the book has none." : "A series figure naming a symbol adds one.", tone: "neutral" },
      { label: "Closes per holding", value: r.moves ? "In the book" : "Not supplied", detail: r.moves ? "Contribution and correlation read them." : "No input supplies them yet; contribution and correlation wait.", tone: "neutral" },
      { label: "Rules", value: m ? m.name : "No methodology", detail: m ? `${m.rules.length} rules, ${m.classes.length} classes.` : "Choose one on Setup.", tone: "neutral" },
      { label: "Newsletters", value: "None forwarded", detail: "Forward newsletters to your address, set up on Setup's Newsletters card; each is read into a short digest for the review.", tone: "neutral" },
    ];
    out.push({ slot: "review_method", part: null, heading: label("review_method"), lines, footer: "Figures as of the date shown, from your own connections. Not investment advice." });
  }
  return out;
}

/** The figures behind the deck's charts, each where its slot is on. */
function chartsOf(r: Review, on: (slot: SlotId) => boolean): Charts {
  const moves = on("review_moves") ? r.moves : null;
  const capital = on("review_capital");
  const c = on("review_moves") ? r.correlation : null;
  return {
    period: on("review_returns") ? r.paths.period : null,
    ytd: on("review_returns") ? r.paths.ytd : null,
    contribution: moves ? moves.rows.map((x) => ({ label: x.symbol, value: Math.round(x.contrib * 100) / 100 })) : [],
    byClass: moves ? moves.byClass.map((x) => ({ label: x.label, contrib: Math.round(x.contrib * 100) / 100, weight: Math.round(x.weightEnd * 10) / 10 })) : [],
    caps: capital ? r.weights.map((w) => ({ label: w.symbol, weight: Math.round(w.weight * 100) / 100, cap: w.cap?.cap ?? null, state: w.state })) : [],
    mix: capital ? r.mix.map((x) => ({ label: x.label, weight: Math.round(x.weight * 10) / 10, cap: x.cap?.cap ?? null })) : [],
    cash: capital ? Math.round(r.cash * 10) / 10 : null,
    correlation: c ? { symbols: c.symbols, pairs: c.pairs.map((p) => ({ ...p, r: Math.round(p.r * 100) / 100 })), average: Math.round(c.average * 100) / 100, days: c.days, to: c.to, book: Object.fromEntries(Object.entries(c.book).map(([k, v]) => [k, v === null ? null : Math.round(v * 100) / 100])) } : null,
    markets: on("review_markets") ? r.markets.map((x) => ({ symbol: x.symbol, name: x.name, change: x.change, unit: x.unit })) : [],
  };
}

/** The report with the news sections added before the calendar, each item carrying its source. */
export function withNews(report: Report, news: News): Report {
  const sections: ReportSection[] = [];
  if (news.holdings.length) sections.push({ slot: "review_news", part: "holdings", heading: `${SLOTS.review_news.label}: holdings`, lines: news.holdings.map((n) => ({ label: `${n.symbol.toUpperCase()}: ${n.text}`, value: shortDate(n.date), detail: n.read, tone: "neutral", href: n.url })), footer: "Each item links to the page it came from." });
  for (const topic of NEWS_TOPICS) {
    const items = news.markets.filter((n) => n.topic === topic);
    if (items.length) sections.push({ slot: "review_news", part: topic, heading: `${SLOTS.review_news.label}: ${NEWS_TOPIC_LABEL[topic].toLowerCase()}`, lines: items.map((n) => ({ label: n.head, value: shortDate(n.date), detail: n.text, tone: "neutral", href: n.url })), footer: null });
  }
  if (news.upcoming.length) sections.push({ slot: "review_news", part: "upcoming", heading: `${SLOTS.review_news.label}: coming up, from the web`, lines: news.upcoming.map((n) => ({ label: n.item, value: shortDate(n.date), detail: null, tone: "info", href: n.url })), footer: null });
  if (!sections.length) return report;
  const at = report.sections.findIndex((s) => s.heading === SLOTS.review_calendar.label || s.heading === SLOTS.review_method.label);
  const out = [...report.sections];
  out.splice(at < 0 ? out.length : at, 0, ...sections);
  return { ...report, sections: out };
}

/**
 * The newsletters the person forwarded in the review's period: how many from
 * each sender, then the points that touch their holdings most. Read into
 * digests with the AI when they arrived (lib/inbox-run.ts); the
 * review makes no call of its own. A period with none adds nothing.
 */
export function withNewsletters(report: Report, file: NewslettersFile | null): Report {
  if (!report.period || report.kind === "today") return report;
  const digests = digestsIn(file, report.period.from, report.period.to);
  if (!digests.length) {
    // Newsletters on file but none dated in the period (Hamza, 18 Oct 2026: forwarded on the Sunday, the deck said "None forwarded"): the method line says so, and nothing else is added.
    const read = (file?.digests ?? []).filter((d) => d.status === "read" && d.reading);
    if (!read.length) return report;
    const latest = read.map((d) => digestDate(d).slice(0, 10)).sort().pop()!;
    const line = { label: "Newsletters", value: `${read.length} read, none dated ${report.period.label}`, detail: `The latest is dated ${longDate(latest)}; a review counts the newsletters dated in its period, by each one's own date.`, tone: "neutral" as const };
    return { ...report, sections: report.sections.map((s) => (s.slot === "review_method" || s.heading === SLOTS.review_method.label ? { ...s, lines: s.lines.map((l) => (l.label === "Newsletters" ? line : l)) } : s)) };
  }
  const label = SLOTS.review_newsletters.label;
  const senders = bySender(digests);
  const points = topPoints(digests, 6);
  const sections: ReportSection[] = [
    { slot: "review_newsletters", part: "senders", heading: `${label}: by sender`, lines: senders.slice(0, 12).map((x) => ({ label: x.sender, value: String(x.count), detail: null, tone: "neutral" })), footer: `${digests.length} newsletter${digests.length === 1 ? "" : "s"} read in the period, each with the AI; only a short digest of each is kept.` },
  ];
  if (points.length)
    sections.push({ slot: "review_newsletters", part: "points", heading: `${label}: what they argued`, lines: points.map((p) => ({ label: p.headline, value: `${p.sender}, ${shortDate(p.date)}`, detail: `${p.line}${p.symbols.length ? ` Touches ${p.symbols.join(", ")}.` : ""}`, tone: "neutral" })), footer: "The points that touch your holdings most, then the newest. Each is the newsletter's argument, not a verdict." });
  const at = report.sections.findIndex((s) => s.slot === "review_calendar" || s.slot === "review_month" || s.slot === "review_method" || s.heading === SLOTS.review_calendar.label || s.heading === SLOTS.review_method.label);
  const read = { label: "Newsletters", value: `${digests.length} read`, detail: "Each read with the AI when it arrived; only a short digest of each is kept.", tone: "neutral" as const };
  const out = report.sections.map((s) => (s.slot === "review_method" || s.heading === SLOTS.review_method.label ? { ...s, lines: s.lines.map((l) => (l.label === "Newsletters" ? read : l)) } : s));
  out.splice(at < 0 ? out.length : at, 0, ...sections);
  return { ...report, sections: out };
}

/** Theses a review summarises at most, a line each, so the Hunter's part stays a short table (Hamza, 5 Nov 2026: summarised, never pages of finds). */
export const MAX_HUNTER_LINES = 8;

const STANCE_COUNT: Record<"challenges" | "backs" | "update", [string, string]> = { challenges: ["challenging", "challenging"], backs: ["backing", "backing"], update: ["update", "updates"] };

/**
 * What the Thesis Hunter found in the review's period (Hamza, 4 Nov 2026:
 * one email a find was too many; the weekly review carries them instead),
 * summarised a line a thesis (Hamza, 5 Nov 2026: "ensuring its summarized
 * and not 3 pages"): how many finds back it, challenge it or update it, and
 * the one to read first (a challenge before the rest, the newest first) with
 * its source, and the next one's title when there is more. The finds not
 * dismissed and found within the period, the holdings first, then the
 * watchlist, then the market theses; at most `MAX_HUNTER_LINES` theses, the
 * rest counted. `names` gives a market thesis its title and a symbol its
 * group; a subject with no name is left out (a thesis since removed). Laid
 * right after Holdings and theses; a period with no find adds nothing.
 */
export function withHunterFinds(report: Report, file: ThesisHunterFile | null, names: { held: readonly string[]; watched: readonly string[]; markets: Readonly<Record<string, string>> }): Report {
  if (!report.period || report.kind === "today" || !file) return report;
  const { from, to } = report.period;
  const held = new Set(names.held.map((x) => x.toUpperCase()));
  const watched = new Set(names.watched.map((x) => x.toUpperCase()));
  const rank = { backs: 1, challenges: 0, update: 2 } as const;
  const found: { group: number; subject: string; find: ReturnType<typeof shownFinds>[number] }[] = [];
  for (const [key, h] of Object.entries(file.subjects)) {
    const cut = key.indexOf(":");
    const kind = key.slice(0, cut);
    const id = key.slice(cut + 1);
    const subject = kind === "market" ? names.markets[id] : id.toUpperCase();
    if (!subject) continue;
    const group = kind === "market" ? 2 : held.has(subject) ? 0 : watched.has(subject) ? 1 : -1;
    if (group < 0) continue;
    for (const f of shownFinds(h)) if (f.found >= from && f.found <= to) found.push({ group, subject, find: f });
  }
  if (!found.length) return report;
  found.sort((a, b) => a.group - b.group || a.subject.localeCompare(b.subject) || rank[a.find.stance] - rank[b.find.stance] || b.find.found.localeCompare(a.find.found));
  const bySubject = new Map<string, (typeof found)[number]["find"][]>();
  for (const x of found) bySubject.set(x.subject, [...(bySubject.get(x.subject) ?? []), x.find]);
  const theses = [...bySubject.entries()];
  const shown = theses.slice(0, MAX_HUNTER_LINES);
  const challenges = found.filter((x) => x.find.stance === "challenges").length;
  const counts = (finds: (typeof found)[number]["find"][]) =>
    (["challenges", "backs", "update"] as const)
      .map((k) => [k, finds.filter((f) => f.stance === k).length] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${STANCE_COUNT[k][n === 1 ? 0 : 1]}`)
      .join(", ");
  const section: ReportSection = {
    slot: "review_hunter",
    part: null,
    heading: `${SLOTS.review_hunter.label}: ${found.length} on ${theses.length} thes${theses.length === 1 ? "is" : "es"}${challenges ? `, ${challenges} challenging` : ""}`,
    lines: shown.map(([subject, finds]) => {
      const top = finds[0];
      const next = finds[1];
      const more = finds.length > 2 ? ` And ${finds.length - 2} more on its page.` : "";
      return {
        label: subject,
        value: counts(finds),
        detail: `${STANCE_LABEL[top.stance]}${top.pillar ? ` (${top.pillar})` : ""}: ${top.title.replace(/[.\s]+$/, "")}. ${top.source}${top.date ? `, ${shortDate(top.date)}` : ""}.${next ? ` Also: ${next.title.replace(/[.\s]+$/, "")}.` : ""}${more}`,
        tone: finds.some((f) => f.stance === "challenges") ? "warn" : finds.some((f) => f.stance === "backs") ? "ok" : "info",
        href: top.sourceUrl && top.sourceUrl.startsWith("https://") ? top.sourceUrl : null,
      };
    }),
    footer: `Found by the Thesis Hunter with the AI, from the web, your newsletters and your podcasts${theses.length > shown.length ? `; the first ${shown.length} theses of ${theses.length}, the rest on each thesis's page` : ""}. A line a thesis, the one to read first named; every find is on the thesis's page. Each is what the source says, never a verdict; nothing is written on a thesis by it.`,
  };
  const out = report.sections.filter((x) => x.slot !== "review_hunter");
  const at = out.findIndex((x) => x.slot === "review_theses");
  const before = out.findIndex((x) => x.slot === "review_markets" || x.slot === "review_news" || x.slot === "review_newsletters" || x.slot === "review_questions" || x.slot === "review_calendar" || x.slot === "review_week_ahead" || x.slot === "review_month" || x.slot === "review_method");
  out.splice(at >= 0 ? at + 1 : before < 0 ? out.length : before, 0, section);
  return { ...report, sections: out };
}

/**
 * The monthly letter on how the person decided (Hamza, 9 Nov 2026, the
 * twenty further ways; `decidingLetter` in lib/judgement.ts): laid on a
 * monthly review alone, right after the trades, a line a part of how they
 * decide. It scores the thinking, never the money.
 */
export function withDecidingLetter(report: Report, letter: { month: string; lines: readonly LetterLine[]; summary: string } | null): Report {
  if (report.kind !== "monthly" || !letter || !letter.lines.length) return report;
  const section: ReportSection = {
    slot: "review_letter",
    part: null,
    heading: `${SLOTS.review_letter.label}: ${letter.summary}`,
    lines: letter.lines.map((l) => ({ label: l.label, value: l.value, detail: l.detail, tone: l.tone, href: null })),
    footer: "Read from the Decision Log, your valuations, your rules and the prices since, by the app. It scores how you decided, never the money made; past trades, not a forecast or advice.",
  };
  const out = report.sections.filter((x) => x.slot !== "review_letter");
  const at = out.findIndex((x) => x.slot === "review_trades");
  const before = out.findIndex((x) => x.slot === "review_rulebook" || x.slot === "review_theses" || x.slot === "review_method");
  out.splice(at >= 0 ? at + 1 : before < 0 ? out.length : before, 0, section);
  return { ...report, sections: out };
}

/** The days after a review that its calendar slide covers. */
export const WEEK_AHEAD_DAYS = 7;

/** What the calendar hands a review (lib/calendar-run.ts): the events, their reach in the book and their history, by reachKey. */
export type WeekAheadInput = { events: readonly EconEvent[]; reach: Readonly<Record<string, readonly string[]>>; sensitivity: Readonly<Record<string, SensitivityView>>; notes: readonly string[] };

/** One event's history in a line: each outcome's mean for the book and SPY, then the sentences. */
export function historyWords(v: SensitivityView | undefined): string {
  if (!v) return "";
  const rows = v.rows.map((r) => `${r.outcome}, ${r.n} times: your book ${r.book}, SPY ${r.spy}, fell ${r.fell} of the time`).join("; ");
  return [rows ? `${v.title}: ${rows}.` : "", ...v.words].filter(Boolean).join(" ");
}

/**
 * Next week on the calendar (Hamza, 27 Oct 2026): each event of the seven
 * days after `today`, the results of the followed companies among them, with
 * what it touches in the book and how the book took the same kind of event
 * before. Laid after Coming up and open items; a week with nothing on the
 * calendar says so.
 */
export function withWeekAhead(report: Report, input: WeekAheadInput | null, today: string): Report {
  if (!report.period || report.kind === "today") return report;
  const until = addDaysTo(today, WEEK_AHEAD_DAYS);
  const events = (input?.events ?? []).filter((e) => e.date > today && e.date <= until).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const lines: ReportLine[] = events.map((e) => {
    const k = reachKey(e);
    const reach = (input?.reach[k] ?? []).join(" ");
    return { label: e.name, value: shortDate(e.date), detail: [`${DAYS[new Date(`${e.date}T00:00:00Z`).getUTCDay()]}, ${e.time}.`, reach, historyWords(input?.sensitivity[k])].filter(Boolean).join(" "), tone: e.kind === "earnings" ? "neutral" : "info", href: e.source.startsWith("https://") ? e.source : null };
  });
  const section: ReportSection = {
    slot: "review_week_ahead",
    part: null,
    heading: SLOTS.review_week_ahead.label,
    lines: lines.length ? lines : [{ label: "Nothing on the calendar", value: null, detail: input ? `No release, decision, election, summit, deadline or result of yours from ${shortDate(addDaysTo(today, 1))} to ${shortDate(until)}.` : "The calendar could not be read for this review.", tone: "neutral" }],
    footer: `What each touches in your book under your methodology, then how your book at today's weights and SPY moved on the session that traded each past occurrence, by what was decided. History, never a promise of the next reaction.${input?.notes.length ? ` ${input.notes.join(" ")}` : ""}`,
  };
  const out = report.sections.filter((s) => s.slot !== "review_week_ahead");
  const at = out.findIndex((s) => s.slot === "review_month" || s.slot === "review_method" || s.heading === SLOTS.review_method.label);
  out.splice(at < 0 ? out.length : at, 0, section);
  return { ...report, sections: out };
}

/** The symbols a review's news search is about: every listed holding. */
export function newsSubjects(book: Book): { symbol: string; name: string }[] {
  const seen = new Set<string>();
  const out: { symbol: string; name: string }[] = [];
  for (const h of book.holdings) {
    if (!["equity", "etf"].includes(h.assetClass)) continue;
    const s = h.symbol.toUpperCase();
    if (seen.has(s)) continue;
    seen.add(s);
    out.push({ symbol: s, name: h.name });
  }
  return out;
}

export { SIGNAL_LABEL };

// ---------------------------------------------------------------------------
// Rendering, for the email

const NOTE = "Figures as of the date shown, from your own connections. Not investment advice.";


export function renderText(r: Report, attached = false): string {
  const out: string[] = [r.title, r.shapedBy, `Figures as of ${r.asOf}.`, ""];
  if (r.verdict) {
    out.push(`VERDICT: ${r.verdict.label.toUpperCase()}`);
    for (const p of r.pillars) out.push(`- ${p.label}: ${p.status}. ${p.note}`);
    out.push(r.verdict.reason, "");
  }
  out.push(r.summary, "");
  if (attached) out.push(`The review is attached as a PDF, its pages as the Reviews screen draws them.${r.pdf ? ` It is also in your Drive: ${r.pdf.url}` : ""}`, "");
  if (r.prose) out.push(r.prose, "");
  for (const n of r.notes) out.push(n, "");
  for (const s of r.sections) {
    out.push(s.heading.toUpperCase());
    for (const l of s.lines) out.push(`- ${l.label}${l.value ? `: ${l.value}` : ""}${l.detail ? ` (${l.detail})` : ""}${l.href ? ` ${l.href}` : ""}`);
    if (s.footer) out.push(`  ${s.footer}`);
    out.push("");
  }
  out.push(NOTE);
  return out.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TONE_COLOUR: Record<ReportLine["tone"], string> = { ok: "#357550", warn: "#93681b", danger: "#a53e2b", info: "#385c78", neutral: "#5a5e68" };
const LEVEL_COLOUR: Record<"ok" | "warn" | "danger", string> = { ok: "#357550", warn: "#93681b", danger: "#a53e2b" };
const safeHref = (href: string) => (/^https?:\/\//i.test(href) ? href : null);

/** A plain, light email: vellum paper, ink text, one teal rule. Inline styles only, so every mail client draws it. */
export function renderHtml(r: Report, attached = false): string {
  const section = (s: ReportSection) =>
    `<h2 style="margin:28px 0 8px;font:600 12px/16px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#5a5e68">${esc(s.heading)}</h2>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px">` +
    s.lines
      .map((l) => {
        const href = l.href ? safeHref(l.href) : null;
        const labelHtml = href ? `<a href="${esc(href)}" style="color:#15171d;text-decoration:underline">${esc(l.label)}</a>` : esc(l.label);
        return (
          `<tr><td style="padding:10px 14px;border-bottom:1px solid #ece9e0;font:15px/20px Arial,sans-serif;color:#15171d">${labelHtml}${l.detail ? `<div style="font:13px/18px Arial,sans-serif;color:#5a5e68">${esc(l.detail)}</div>` : ""}</td>` +
          `<td style="padding:10px 14px;border-bottom:1px solid #ece9e0;text-align:right;white-space:nowrap;font:600 14px/20px Menlo,Consolas,monospace;color:${TONE_COLOUR[l.tone]}">${l.value ? esc(l.value) : ""}</td></tr>`
        );
      })
      .join("") +
    `</table>` +
    (s.footer ? `<p style="margin:6px 14px 0;font:13px/18px Arial,sans-serif;color:#5a5e68">${esc(s.footer)}</p>` : "");
  const cover = r.verdict
    ? `<div style="margin:16px 0 0;padding:14px;background:#fff;border-radius:12px">` +
      `<p style="margin:0;font:700 18px/24px Arial,sans-serif;color:${LEVEL_COLOUR[r.verdict.level]}">${esc(r.verdict.label)}</p>` +
      r.pillars.map((p) => `<p style="margin:8px 0 0;font:14px/20px Arial,sans-serif;color:#15171d"><strong style="color:${LEVEL_COLOUR[p.level]}">${esc(p.label)}: ${esc(p.status)}.</strong> ${esc(p.note)}</p>`).join("") +
      `<p style="margin:8px 0 0;font:13px/18px Arial,sans-serif;color:#5a5e68">${esc(r.verdict.reason)}</p>` +
      (r.returns.length
        ? `<p style="margin:10px 0 0;font:13px/18px Menlo,Consolas,monospace;color:#5a5e68">${r.returns
            .map((x) => `${esc(x.label)}: account ${x.account === null ? "waiting" : esc(signedPct(x.account))}${Object.entries(x.benchmarks)
              .map(([s, v]) => `, ${esc(s)} ${v === null ? "waiting" : esc(signedPct(v))}`)
              .join("")}`)
            .join("<br>")}<br>Context only.</p>`
        : "") +
      `</div>`
    : "";
  return (
    `<!doctype html><html><body style="margin:0;background:#f3f1ea;padding:24px 12px"><div style="max-width:640px;margin:0 auto">` +
    `<p style="margin:0;font:600 12px/16px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#5a5e68">Invariant</p>` +
    `<h1 style="margin:6px 0 0;font:700 26px/32px Arial,sans-serif;color:#15171d">${esc(r.title)}</h1>` +
    `<div style="width:24px;height:1px;background:#a8853f;margin:12px 0"></div>` +
    `<p style="margin:0;font:15px/20px Arial,sans-serif;color:#5a5e68">${esc(r.shapedBy)}. Figures as of ${esc(r.asOf)}.</p>` +
    cover +
    `<p style="margin:16px 0 0;font:15px/22px Arial,sans-serif;color:#15171d">${esc(r.summary)}</p>` +
    (attached ? `<p style="margin:12px 0 0;font:13px/18px Arial,sans-serif;color:#5a5e68">The review is attached as a PDF, its pages as the Reviews screen draws them.</p>${r.pdf ? `<p style="margin:8px 0 0"><a href="${esc(r.pdf.url)}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#15171d;color:#fff;font:600 14px/18px Arial,sans-serif;text-decoration:none">Open it in Drive</a></p>` : ""}` : "") +
    (r.prose ? `<div style="margin:16px 0 0;padding:4px 14px;border-left:2px solid #2a7a7e">${paragraphsOf(r.prose).map((p) => `<p style="margin:10px 0;font:15px/22px Georgia,serif;color:#15171d">${esc(p)}</p>`).join("")}</div>` : "") +
    r.notes.map((n) => `<p style="margin:12px 0 0;font:13px/18px Arial,sans-serif;color:#5a5e68">${esc(n)}</p>`).join("") +
    r.sections.map(section).join("") +
    `<p style="margin:28px 0 0;font:13px/18px Arial,sans-serif;color:#8a8e98">${NOTE}</p></div></body></html>`
  );
}

// ---------------------------------------------------------------------------
// Commentary on the person's own provider

/** Haiku first since the beta (Hamza, 9 Nov 2026), Sonnet when the answer comes back empty. */
export const PROSE_MODEL = MODELS.fast;
/** The commentary's room, in characters: three paragraphs and a little over (Hamza, 18 Oct 2026: a weekly's commentary stopped after nine words, cut by the room it was given). */
const MAX_PROSE = 2400;
/** The answer's room in tokens, well past the words asked for, so a model that thinks before it writes is never cut. */
export const PROSE_MAX_TOKENS = 4000;

/** The request body for the commentary: what the period showed and what the checks say, in the report's own figures, three paragraphs. No advice, no predictions. */
export function proseRequestBody(r: Report, model = PROSE_MODEL): Record<string, unknown> {
  return {
    model,
    max_tokens: PROSE_MAX_TOKENS,
    system:
      "You write the commentary at the top of a person's own portfolio review. Use only the figures in the report; never invent one. " +
      "Write three plain paragraphs, 180 to 260 words in all, a blank line between them, no heading over them. The first: what the verdict rests on, naming the two pillars and the rules or trades that decided them. " +
      "The second: what moved the book over the period and what the methodology says about it (caps, classes, correlation, the trades and their entries). " +
      "The third: which rules or holdings need the person's attention and why, and what is still waiting for data. Returns are context, never the judgement. " +
      "No recommendations, no predictions, no encouragement, no exclamation marks, no headings, no lists. This is not investment advice and must not read as any.",
    messages: [{ role: "user", content: renderText(r) }],
  };
}

/** Every text block of the answer, joined (Hamza, 18 Oct 2026: an answer whose first text block was empty read as no commentary); null when there is no text. */
export function parseProseResponse(body: unknown, max = MAX_PROSE): string | null {
  const content = (body as { content?: { type?: string; text?: string }[] } | null)?.content;
  const text = (content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "") + "…" : text;
}

/** Whether the model stopped because it ran out of room, so what came back is cut mid-sentence and the review says so. */
export function answerCut(body: unknown): boolean {
  return (body as { stop_reason?: string | null } | null)?.stop_reason === "max_tokens";
}

// ---------------------------------------------------------------------------
// The person's own questions (Hamza, 18 Oct 2026): each a section of the review

/** Questions kept on Reviews, at most. */
export const MAX_QUESTIONS = 6;
/** An answer's room in characters. */
const MAX_ANSWER = 2400;
export const QUESTION_MAX_TOKENS = 4000;

/** The request body that answers one of the person's questions from the review alone: the report's text is the only source, and what it does not hold is said. Text only, so any provider can answer. */
export function questionRequestBody(r: Report, question: string, model = PROSE_MODEL): Record<string, unknown> {
  return {
    model,
    max_tokens: QUESTION_MAX_TOKENS,
    system:
      "You answer one question a person keeps asking of their own portfolio review, using only the review's figures below; never invent a figure, a price or an event. " +
      "Two or three plain paragraphs, 120 to 220 words in all, a blank line between them. Lead with the answer, then the figures it rests on, naming the methodology section where one applies. " +
      "Where the review does not hold what the question needs, say so in one sentence and what would supply it. " +
      "No recommendations to buy or sell, no predictions, no encouragement, no exclamation marks, no headings, no lists. This is not investment advice and must not read as any.",
    messages: [{ role: "user", content: `The question: ${question.trim()}\n\nThe review:\n\n${renderText(r)}` }],
  };
}

/** One answer, parsed like the commentary. */
export const parseAnswerResponse = (body: unknown): string | null => parseProseResponse(body, MAX_ANSWER);

export type Answered = { question: string; answer: string | null; note: string | null };

/**
 * The person's questions as sections of the review, each headed by its
 * question under the slot's label and its answer a paragraph a line, before
 * the calendar; a question that could not be answered is a section with the
 * sentence saying why, never left out silently.
 */
export function withQuestions(report: Report, answered: readonly Answered[]): Report {
  if (!answered.length || report.kind === "today") return report;
  const label = SLOTS.review_questions.label;
  const sections: ReportSection[] = answered.map((a) => ({
    slot: "review_questions",
    part: null,
    heading: `${label}: ${a.question.trim().replace(/\s+/g, " ")}`,
    lines: a.answer ? paragraphsOf(a.answer).map((p) => ({ label: p, value: null, detail: null, tone: "neutral" as const })) : [{ label: "Not answered", value: null, detail: a.note ?? "The model gave no answer.", tone: "warn" as const }],
    footer: a.answer ? (a.note ? `${a.note} Answered with the AI from this review's figures alone; not advice.` : "Answered with the AI from this review's figures alone; not advice.") : null,
  }));
  const at = report.sections.findIndex((s) => s.slot === "review_calendar" || s.slot === "review_month" || s.slot === "review_method" || s.heading === SLOTS.review_calendar.label || s.heading === SLOTS.review_method.label);
  const out = [...report.sections];
  out.splice(at < 0 ? out.length : at, 0, ...sections);
  return { ...report, sections: out };
}

/** What an empty answer was made of, for the note and the log: its stop reason and the kinds of block it held, never their content. */
export function emptyAnswerWords(body: unknown): string {
  const b = body as { content?: { type?: string }[]; stop_reason?: string | null } | null;
  const kinds = [...new Set((b?.content ?? []).map((c) => c.type ?? "unknown"))];
  return `the model stopped on ${b?.stop_reason ?? "no reason"} with ${kinds.length ? kinds.join(", ") : "no"} block${kinds.length === 1 ? "" : "s"}`;
}

export type { Period, ReviewKind };
