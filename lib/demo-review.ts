import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { foundEvents } from "@/lib/calendar-agent";
import { calendarView } from "@/lib/calendar-run";
import { listedTickers } from "@/lib/compose-book";
import { buildReport, withHunterFinds, withNews, withNewsletters, withQuestions, withWeekAhead, type Report } from "@/lib/report";
import { newsSchema, type ReviewKind } from "@/lib/review";
import type { ThesisHunterFile } from "@/lib/thesis-hunter";
import { localDay } from "@/lib/time";
import { calendarFoundFor, earningsView, newslettersFor, thesesFor, thesisHunterFor, type Workspace } from "@/lib/workspace";

/**
 * The demo's reviews (Hamza, 4 Nov 2026: every screen filled). The showcase's
 * book stops on its snapshot's day, so the weekly and the monthly are built
 * for the last full week and month on that day, never for weeks after it, where
 * every return would read zero. Each is built on each visit from the same
 * samples the screens read: the newsletters, the Thesis Hunter's finds moved
 * into the period, the week ahead on the calendar; and the commentary, the
 * news and the answers a review's model would write come from a fictional
 * sample (data/samples/showcase.reviews.json). Nothing is kept or sent.
 */

export const DEMO_REVIEW_IDS = { weekly: "demo-weekly", monthly: "demo-monthly" } as const satisfies Record<ReviewKind, string>;

const partSchema = z.object({
  prose: z.string().nullable(),
  news: newsSchema,
  questions: z.array(z.object({ question: z.string().max(300), answer: z.string().max(4000) })).max(6),
});
const sampleSchema = z.object({ weekly: partSchema, monthly: partSchema });

function sample(): z.infer<typeof sampleSchema> | null {
  try {
    return sampleSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "showcase.reviews.json"), "utf8")));
  } catch {
    return null;
  }
}

/** The day the demo's reviews are built on: today, or the snapshot's own day once today is past it. */
export function demoReviewDay(ws: Workspace, now = new Date()): string {
  const today = localDay(now);
  const asOf = ws.book?.asOf.slice(0, 10) ?? today;
  return asOf < today ? asOf : today;
}

/** The finds moved so the newest lands on the period's last day: the sample's finds sit around today, after the snapshot's last full week. */
function huntedIn(file: ThesisHunterFile, to: string): ThesisHunterFile {
  const days = Object.values(file.subjects).flatMap((h) => h.finds.map((f) => f.found)).sort();
  const latest = days[days.length - 1];
  if (!latest) return file;
  const shift = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`);
  const move = (d: string) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + shift).toISOString().slice(0, 10);
  return { ...file, subjects: Object.fromEntries(Object.entries(file.subjects).map(([k, h]) => [k, { ...h, finds: h.finds.map((f) => ({ ...f, found: move(f.found), date: f.date ? move(f.date) : null })) }])) };
}

/** The demo's weekly or monthly review, as the scheduled run would have built it; null outside the demo or without a book. */
export async function demoReview(ws: Workspace, kind: ReviewKind, now = new Date()): Promise<Report | null> {
  if (ws.mode !== "demo" || !ws.setup || !ws.book) return null;
  const { setup, book } = ws;
  const day = demoReviewDay(ws, now);
  let report: Report = { ...buildReport({ setup, book, methodology: setup.methodology, preferences: ws.preferences, today: day, now, modules: ws.modules, kind, decisions: ws.decisions, filings: ws.filings }), id: DEMO_REVIEW_IDS[kind] };
  const [newsletters, hunter, theses, earnings, found] = await Promise.all([newslettersFor(ws), thesisHunterFor(ws), thesesFor(ws), earningsView(ws), calendarFoundFor(ws)]);
  report = withNewsletters(report, newsletters.file);
  if (report.period) {
    const held = listedTickers(book).map((x) => x.toUpperCase());
    const watched = [...Object.keys(theses.file.bySymbol), ...Object.keys(ws.records.bySymbol)].map((x) => x.toUpperCase()).filter((x) => !held.includes(x));
    report = withHunterFinds(report, huntedIn(hunter.file, report.period.to), { held, watched, markets: Object.fromEntries(theses.file.markets.map((m) => [m.id, m.title])) });
  }
  const view = await calendarView({ book, methodology: setup.methodology, entries: earnings.entries, reports: earnings.file.reports, expected: earnings.file.expected, filings: ws.filings, contact: null, today: day, wait: "budget", found: foundEvents(found.file) }).catch(() => null);
  report = withWeekAhead(report, view, day);
  const part = ws.showcase ? sample()?.[kind] : null;
  if (part) {
    report = withNews(report, part.news);
    report = { ...report, prose: part.prose };
    report = withQuestions(report, part.questions.map((q) => ({ question: q.question, answer: q.answer, note: null })));
  }
  return report;
}
