/**
 * What lies behind the lines of a quarter's revenue flow (Hamza, 5 Nov 2026:
 * "have the research agent or some agent view the flow chart and then
 * justify anything that needs justification, this is the investigative
 * work, like for the expenses showing what the company said about why they
 * are spending this much and where is it all going").
 *
 * The app picks the lines a reader would ask about (`flowAsks`): every
 * expense the flow draws, a cost of revenue whose margin moved, a segment
 * growing apart from the whole, a tax rate out of the ordinary, interest
 * and other items of size, an operating margin that moved. One call on the
 * results reader reads them against the release's own documents, the call
 * and, for what those do not say, a few pages of the web: why the company
 * spends this much or why the line moved, and where the money goes. Every
 * note names where it came from; a quote is kept only when the release
 * prints it word for word, the call is never quoted (its transcript is not
 * shown), and a note stating a figure no source prints is dropped. The
 * figures are the app's; the words the company's, read investigatively.
 * Pure: no network, no key.
 */
import { z } from "zod";

import { sentenceCut } from "@/lib/earnings-call";
import { flowLines, flowMoney, type IncomeFlow } from "@/lib/income-flow";
import { INVESTIGATIVE } from "@/lib/investigate";
import { figuresIn, printedIn } from "@/lib/printed-figures";

/** At most this many lines are explained. */
export const MAX_FLOW_NOTES = 6;
/** Searches the reading may make, for what the release and the call do not say. */
export const FLOW_SEARCHES = 4;
/** Hours after which notes that could not be written are tried again. */
export const FLOW_NOTES_RETRY_HOURS = 24;
/** The notes' shape: notes written on an older shape are written again. */
export const FLOW_NOTES_VERSION = 1;
/** A segment growing this many points apart from revenue is asked about. */
export const SOURCE_GAP_PTS = 10;
/** A margin that moved this many points on a year is asked about. */
export const MARGIN_MOVE_PTS = 1;
/** Interest and other items of at least this share of revenue are asked about. */
export const OTHER_SHARE_PCT = 2;
/** A tax rate on profit before tax outside this range is asked about. */
export const TAX_RANGE: readonly [number, number] = [10, 30];

const WHY = 260;
const SAID = 220;

const page = z.object({ title: z.string().min(1).max(160), url: z.string().regex(/^https:\/\/[^\s/]+\.[^\s]+$/).max(800) });

/** Where a note came from: the release's own documents, the call (never quoted), or a page of the web. */
export const NOTE_FROM = ["release", "call", "web"] as const;
export type NoteFrom = (typeof NOTE_FROM)[number];

export const flowNoteSchema = z.object({
  /** The flow's line it explains, as the flow names it. */
  line: z.string().max(80),
  /** Why the company spends this much on it, or why it moved, as the company or the pages explain it. */
  why: z.string().min(1).max(WHY),
  /** Where the money goes: people, data centres, campaigns, a deal, a charge; null when the sources do not say. */
  where: z.string().max(WHY).nullable().default(null),
  /** The company's own words, as its release prints them; never the call's. */
  said: z.string().max(SAID).nullable().default(null),
  from: z.enum(NOTE_FROM),
  /** The page it came from; the release's own for a release note, none for the call. */
  source: page.nullable().default(null),
});
export type FlowNote = z.infer<typeof flowNoteSchema>;

export const flowNotesSchema = z.object({
  /** The flow and the call they were written from, so either moving on writes them again. */
  key: z.string().max(500),
  at: z.string(),
  notes: z.array(flowNoteSchema).max(MAX_FLOW_NOTES).default([]),
  /** Why there are none, or what was left out. */
  note: z.string().max(300).nullable().default(null),
  v: z.number().int().default(FLOW_NOTES_VERSION),
});
export type FlowNotes = z.infer<typeof flowNotesSchema>;

/** A line the app asks about: its name on the flow, the figures in words, and why it is asked. */
export type FlowAsk = { line: string; figures: string; asks: string };

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const pctOf = (v: number, r: number) => (v / r) * 100;
const signed = (v: number, unit = "%") => `${v >= 0 ? "+" : ""}${v.toFixed(1)}${unit}`;

/**
 * The lines worth explaining, the expenses first (what Hamza asked for),
 * then what moved: the cost of revenue, segments apart from the whole,
 * interest and other items, the tax and the operating margin. At most
 * MAX_FLOW_NOTES; a look-through is not asked about, since it is many
 * companies at once.
 */
export function flowAsks(f: IncomeFlow): FlowAsk[] {
  if (f.from === "lookthrough" || f.revenue <= 0) return [];
  const r = f.revenue;
  const m = (v: number) => flowMoney(v, f.currency);
  const out: FlowAsk[] = [];
  const opex = f.opex.filter((p) => pctOf(p.value, r) >= 1).sort((a, b) => b.value - a.value);
  for (const p of opex) {
    const g = p.growthPct ?? null;
    const faster = isNum(g) && isNum(f.revenueGrowthPct) && g > f.revenueGrowthPct;
    out.push({
      line: p.name,
      figures: `${m(p.value)}, ${pctOf(p.value, r).toFixed(1)}% of revenue${isNum(g) ? `, ${signed(g)} on a year` : ""}${isNum(f.revenueGrowthPct) ? ` against revenue ${signed(f.revenueGrowthPct)}` : ""}`,
      asks: faster ? "Why this grew faster than revenue, and where the money goes." : "Why the company spends this much here, and where the money goes.",
    });
  }
  if (!opex.length && isNum(f.directCosts) && f.directCosts > 0) out.push({ line: "Costs and expenses", figures: `${m(f.directCosts)}, ${pctOf(f.directCosts, r).toFixed(1)}% of revenue`, asks: "What the costs are, and where the money goes." });
  const gm = isNum(f.grossProfit) ? pctOf(f.grossProfit, r) : null;
  const gmMove = isNum(gm) && isNum(f.before?.grossMarginPct) ? gm - f.before!.grossMarginPct : null;
  if (isNum(f.costOfRevenue) && f.costOfRevenue > 0) out.push({ line: "Cost of revenue", figures: `${m(f.costOfRevenue)}, ${pctOf(f.costOfRevenue, r).toFixed(1)}% of revenue${isNum(gmMove) ? `; gross margin ${gm!.toFixed(1)}%, ${signed(gmMove, " points")} on a year` : ""}`, asks: isNum(gmMove) && Math.abs(gmMove) >= MARGIN_MOVE_PTS ? `Why the gross margin ${gmMove > 0 ? "widened" : "narrowed"}, and what the cost of revenue is made of.` : "What the cost of revenue is made of." });
  for (const s of f.sources) {
    if (s.name === "Other" || !isNum(s.growthPct) || !isNum(f.revenueGrowthPct) || Math.abs(s.growthPct - f.revenueGrowthPct) < SOURCE_GAP_PTS) continue;
    out.push({ line: s.name, figures: `${m(s.value)}, ${pctOf(s.value, r).toFixed(1)}% of revenue, ${signed(s.growthPct)} on a year against revenue ${signed(f.revenueGrowthPct)}`, asks: `Why this part of the business grew ${s.growthPct > f.revenueGrowthPct ? "faster" : "slower"} than the whole.` });
  }
  const other = f.otherCosts ?? f.otherIncome;
  if (isNum(other) && pctOf(other, r) >= OTHER_SHARE_PCT) {
    const line = f.otherCosts !== null ? (f.taxExpense === null ? "Tax, interest and other" : "Interest and other") : "Other income";
    out.push({ line, figures: `${m(other)}, ${pctOf(other, r).toFixed(1)}% of revenue`, asks: f.otherCosts !== null ? "What lies between operating income and net income here: interest, a charge, a loss on an investment." : "Where this income came from, and whether it recurs." });
  }
  const op = f.operatingIncome;
  if (isNum(f.taxExpense) && isNum(op) && op > 0) {
    const pretax = op - (f.otherCosts ?? 0) + (f.otherIncome ?? 0);
    const rate = pretax > 0 ? pctOf(f.taxExpense, pretax) : null;
    if (isNum(rate) && (rate < TAX_RANGE[0] || rate > TAX_RANGE[1])) out.push({ line: "Tax", figures: `${m(f.taxExpense)}, ${rate.toFixed(1)}% of profit before tax`, asks: `Why the tax rate was ${rate < TAX_RANGE[0] ? "this low" : "this high"}.` });
  }
  const om = isNum(op) ? pctOf(op, r) : null;
  const omMove = isNum(om) && isNum(f.before?.operatingMarginPct) ? om - f.before!.operatingMarginPct : null;
  if (isNum(omMove) && Math.abs(omMove) >= MARGIN_MOVE_PTS) out.push({ line: "Operating income", figures: `operating margin ${om!.toFixed(1)}%, ${signed(omMove, " points")} on a year`, asks: `Why the operating margin ${omMove > 0 ? "widened" : "narrowed"}.` });
  return out.slice(0, MAX_FLOW_NOTES);
}

/** The flow's signature: the period, where it came from and its lines, so a flow read again from the 10-Q writes the notes again. */
export function flowKey(f: IncomeFlow, callKey: string | null): string {
  const lines = [f.revenue, f.operatingIncome, f.netIncome, ...f.opex.map((p) => p.value)].map((v) => (isNum(v) ? Math.round(v / 1e5) : "-")).join(",");
  return `${f.from}|${f.label}|${lines}|${callKey ?? "none"}`.slice(0, 500);
}

/** Whether a report's notes are owed: it has a flow worth asking about, and the notes are missing, were written from another flow or call, or could not be written a day ago. */
export function flowNotesDue(flow: IncomeFlow | null | undefined, kept: FlowNotes | null | undefined, callKey: string | null, now: string): boolean {
  if (!flow || !flowAsks(flow).length) return false;
  if (!kept || kept.key !== flowKey(flow, callKey) || (kept.notes.length && (kept.v ?? 1) < FLOW_NOTES_VERSION)) return true;
  return !kept.notes.length && !!kept.note && Date.parse(now) - Date.parse(kept.at) > FLOW_NOTES_RETRY_HOURS * 3_600_000;
}

/** Notes that could not be written: the reason, so the page shows the flow alone and it is tried again after a day. */
export const flowNotesFailed = (key: string, at: string, note: string): FlowNotes => flowNotesSchema.parse({ key, at, notes: [], note: note.slice(0, 300) });

const answerSchema = z.object({
  notes: z
    .array(
      z.object({
        line: z.string().describe("The line, exactly as it is asked about."),
        why: z.string().describe(`Why the company spends this much on it, or why it moved: one or two whole sentences, at most ${WHY} characters.`),
        where: z.string().nullable().describe(`Where the money goes (people, data centres, campaigns, a deal, a charge), at most ${WHY} characters; null when the sources do not say.`),
        said: z.string().nullable().describe("The company's own words on it, copied exactly from the release's documents, at most a sentence or two; null for anything said on the call or found on the web."),
        from: z.enum(NOTE_FROM).describe("release: the release's documents given below; call: the call given below; web: a page you found."),
        url: z.string().nullable().describe("For a web note, the page's https address; else null."),
        title: z.string().nullable().describe("For a web note, the page's title; else null."),
      }),
    )
    .max(MAX_FLOW_NOTES),
});

/**
 * The request: the lines asked about with the app's figures, the release's
 * documents and the call as given, and a few searches for the rest. The
 * whole answer is one call to record_flow_notes.
 */
export function flowNotesRequestBody(input: { symbol: string; name: string | null; quarter: string | null; date: string }, f: IncomeFlow, asks: readonly FlowAsk[], material: { facts: string; release: string | null; call: string | null; reading: string | null }, model: string, web: boolean): Record<string, unknown> {
  const schema = z.toJSONSchema(answerSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const who = `${input.name ?? input.symbol} (${input.symbol})`;
  const flow = flowLines(f).map((l) => `- ${l.label}: ${l.value}${l.detail ? ` (${l.detail})` : ""}`).join("\n");
  const text = [
    material.facts,
    `The quarter's revenue flow, ${f.label}${f.currency ? `, in ${f.currency}` : ""}, as the app drew it from the ${f.from === "release" ? "release as printed" : "filings"}:\n${flow}`,
    `The lines to explain:\n${asks.map((a, i) => `${i + 1}. ${a.line}: ${a.figures}. ${a.asks}`).join("\n")}`,
    material.reading ? `The call and the release as read:\n${material.reading}` : null,
    material.release ? `The release's documents at the SEC:\n${material.release.slice(0, 50000)}` : "The release's documents could not be read.",
    material.call ? `The call:\n${material.call.slice(0, 40000)}` : "No call is given.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    model,
    max_tokens: 4000,
    system: `You explain the lines of ${who}'s revenue flow for the quarter reported on ${input.date}${input.quarter ? ` (${input.quarter})` : ""}, for a private investor who sees the flow and asks of each expense why the company spends this much and where it all goes. The app chose the lines to explain and computed every figure; you find what the company said about them, in its release and on its call, and read it.${web ? ` Where the release and the call say nothing about a line, search the web, at most ${FLOW_SEARCHES} searches: the quarterly filing's discussion of results, the company's own pages, reporting from that week.` : " You have no web search: explain from the release and the call alone and leave out a line they say nothing about."}

Rules:
- One note per line asked, at most ${MAX_FLOW_NOTES}, the line named exactly as asked. Leave a line out when no source says anything about it; never fill it from memory.
- why: what drives the line's size or its move, as the company explains it: hiring, pay and stock awards, data centres and chips, depreciation, marketing campaigns, a deal and its amortisation, a restructuring or legal charge, a one-off. Name a one-off as a one-off.
- where: where the money goes, as concretely as the sources allow: which teams, which projects, which assets, which markets.
- said: the company's own words on it, copied exactly from the release's documents, when they say it plainly. Never quote the call; say what was said on it in your own words.
- from: release, call or web, for where the note's substance came from; a web note gives its page's real https address and title.
- Every figure comes from the app's figures or the sources given; never one from memory, never an estimate. Write about the business, not about the filings or this request.
${INVESTIGATIVE}
- No opinion beyond what the sources support, no advice to buy or sell, no exclamation marks.
- Your whole answer is one call to record_flow_notes; write nothing outside it.`,
    tools: [...(web ? [{ type: "web_search_20250305", name: "web_search", max_uses: FLOW_SEARCHES }] : []), { name: "record_flow_notes", description: "Record the notes on the flow's lines.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${text}\n\nExplain the lines.` }] }],
  };
}

export type FlowNotesParse = { ok: true; notes: FlowNote[]; dropped: number } | { ok: false; reason: string };

const squash = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Read item by item: a line not asked about, a repeat, a note with no why, a
 * web note with no https page, or one stating a figure no source prints is
 * dropped and counted; a quote the release does not print word for word,
 * and any quote of the call, is let go and the note kept.
 */
export function parseFlowNotes(body: unknown, asks: readonly FlowAsk[], texts: { facts: string; release: string | null; call: string | null; reading: string | null }, releaseUrl: string | null): FlowNotesParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_flow_notes");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the notes" };
  const raw = (call.input ?? {}) as { notes?: unknown };
  const items = Array.isArray(raw.notes) ? raw.notes : typeof raw.notes === "string" ? (safeJson(raw.notes) as unknown[] | null) ?? [] : [];
  const asked = new Map(asks.map((a) => [a.line.toLowerCase(), a.line]));
  const sources = [texts.facts, texts.release, texts.call, texts.reading, ...asks.map((a) => a.figures)].filter((t): t is string => !!t);
  const release = texts.release ? squash(texts.release) : null;
  const seen = new Set<string>();
  const notes: FlowNote[] = [];
  let dropped = 0;
  for (const x of items) {
    const y = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const line = asked.get(String(y.line ?? "").trim().toLowerCase());
    const why = sentenceCut(y.why, WHY);
    const where = sentenceCut(y.where, WHY) || null;
    const from = (NOTE_FROM as readonly string[]).includes(String(y.from)) ? (y.from as NoteFrom) : null;
    if (!line || seen.has(line) || !why || !from) {
      dropped += 1;
      continue;
    }
    const url = typeof y.url === "string" ? y.url.trim() : "";
    const webPage = from === "web" ? page.safeParse({ title: sentenceCut(y.title, 160) || url.slice(0, 160), url }) : null;
    if (webPage && !webPage.success) {
      dropped += 1;
      continue;
    }
    if (from === "release" && !texts.release) {
      dropped += 1;
      continue;
    }
    if (from === "call" && !texts.call && !texts.reading) {
      dropped += 1;
      continue;
    }
    if ([...figuresIn(why), ...figuresIn(where ?? "")].some((fig) => !printedIn(fig, sources))) {
      dropped += 1;
      continue;
    }
    const quote = sentenceCut(y.said, SAID).replace(/^["“]|["”]$/g, "");
    const said = from === "release" && quote && release?.includes(squash(quote)) ? quote : null;
    const source = webPage?.success ? webPage.data : from === "release" && releaseUrl ? page.safeParse({ title: "The results release", url: releaseUrl }).data ?? null : null;
    seen.add(line);
    notes.push(flowNoteSchema.parse({ line, why, where, said, from, source }));
  }
  if (!notes.length) return { ok: false, reason: dropped ? `every note was left out (${dropped}) for a line not asked, a page missing or a figure no source prints` : "the reading held no note" };
  const order = asks.map((a) => a.line);
  notes.sort((a, b) => order.indexOf(a.line) - order.indexOf(b.line));
  return { ok: true, notes, dropped };
}

/** Where a note came from, in words. */
export const NOTE_FROM_WORDS: Record<NoteFrom, string> = { release: "The release", call: "Said on the call", web: "From the web" };

function safeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
