/**
 * The deck's own words for the slides a study answers (Hamza, 29 Oct 2026:
 * "integrate the content from the study in the slide, dont just lazily point
 * the user to the study"): competition with the rivals by name, what
 * customers and staff say, the moats pillar by pillar, the SWOT, the five
 * investment questions answered, capital allocation, the valuation and the
 * outlook, and the review note on what this quarter adds to the study
 * (Hamza, 4 Nov 2026), each with a title that says what the slide found. Written once per
 * study and call on the person's model from the study in full, the quarter's
 * release, the call and the thesis; it searches the web for
 * what the filings cannot say (rivals, share, customers, staff), every such
 * point with its page. The deck draws it as given, whole sentences, never
 * cut. Pure: no network, no key.
 */
import { z } from "zod";

import { sentenceCut } from "@/lib/earnings-call";
import { INVESTIGATIVE } from "@/lib/investigate";

/** Searches the brief may make. */
export const BRIEF_SEARCHES = 6;
const LINE = 260;
const HEAD = 140;

const page = z.object({ title: z.string().min(1).max(160), url: z.string().regex(/^https:\/\/[^\s/]+\.[^\s]+$/).max(800) });
const lines = (n: number, about: string) => z.array(z.string().min(1).max(LINE)).max(n).default([]).describe(about);
const headline = (about: string) => z.string().max(HEAD).nullable().default(null).describe(about);

export const MOAT_STRENGTHS = ["strong", "moderate", "weak", "none"] as const;

const briefBody = z.object({
  competition: z
    .object({
      headline: headline("What the slide found about competition, in one sentence."),
      rivals: z.array(z.object({ name: z.string().min(1).max(60), competesOn: z.string().min(1).max(160).describe("Where it competes with the company."), position: z.string().min(1).max(200).describe("How the company stands against it, with a figure or a page where one exists.") })).max(6).default([]),
      points: lines(4, "What decides the competition and how it moved this quarter."),
    })
    .nullable()
    .default(null),
  voices: z.object({ headline: headline("What customers and staff say, in one sentence."), customers: lines(4, "What customers say and do: retention, pricing, wins and losses, each with its page."), staff: lines(4, "What staff say: ratings, hiring, departures, each with its page.") }).nullable().default(null),
  moats: z
    .object({
      headline: headline("What the moat is and how it held, in one sentence."),
      pillars: z.array(z.object({ name: z.string().min(1).max(60).describe("Switching costs, network effects, scale, intangibles, cost advantage."), strength: z.enum(MOAT_STRENGTHS), evidence: z.string().min(1).max(LINE) })).max(5).default([]),
    })
    .nullable()
    .default(null),
  swot: z.object({ strengths: lines(4, ""), weaknesses: lines(4, ""), opportunities: lines(4, ""), threats: lines(4, "") }).nullable().default(null),
  questions: z
    .object({
      business: z.string().max(400).nullable().default(null).describe("Why this business."),
      now: z.string().max(400).nullable().default(null).describe("Why now, after these results."),
      misses: z.string().max(400).nullable().default(null).describe("What the market misses, or prices already."),
      change: z.string().max(400).nullable().default(null).describe("What would change the mind."),
      downside: z.string().max(400).nullable().default(null).describe("The downside if the thesis is wrong."),
    })
    .nullable()
    .default(null),
  capital: z.object({ headline: headline("How the cash was used, in one sentence."), points: lines(4, "Where the cash went this quarter and over the year: capex, buybacks, dividends, debt, equity raised, deals.") }).nullable().default(null),
  valuation: z.object({ headline: headline("What the price asks of the business, in one sentence."), points: lines(4, "The valuation against its history, its peers and the owner's range.") }).nullable().default(null),
  outlook: z.object({ headline: headline("What comes next, in one sentence."), points: lines(4, "What the guidance, the call and the thesis say comes next.") }).nullable().default(null),
  review: z
    .object({
      headline: headline("What this quarter brought that the study did not have, in one sentence."),
      news: lines(5, "What is new this quarter against the study: a figure, a change in guidance, a product, a customer, a risk, each with what it means for the thesis."),
      held: lines(3, "What the study said that this quarter bore out."),
      changed: lines(3, "What this quarter changed in the study's view, or put in doubt."),
    })
    .nullable()
    .default(null),
  sources: z.array(page).max(12).default([]),
});

/** The brief as the report keeps it: the study and the call it was written from, so either moving on writes it again. */
export const deckBriefSchema = briefBody.extend({ studyId: z.string().max(12), callKey: z.string().max(400).nullable(), at: z.string(), note: z.string().max(300).nullable().default(null), v: z.number().int().default(1) });
export type DeckBrief = z.infer<typeof deckBriefSchema>;

/** The brief's shape: one written on an older shape (before the review note, 4 Nov 2026) is written again. */
export const BRIEF_VERSION = 2;

/** Hours after which a brief that could not be written is tried again. */
export const BRIEF_RETRY_HOURS = 24;

/** Whether the brief holds any slide's words. */
export const briefHolds = (b: DeckBrief | null | undefined): boolean => !!b && !!(b.competition || b.moats || b.swot || b.questions || b.capital || b.outlook || b.voices || b.valuation || b.review);

/** Whether a report's brief is owed: a study is on it, and the brief is missing, was written from another study or call, or could not be written a day ago. */
export function briefDue(d: { study: { id: string } | null; brief?: DeckBrief | null } | null, callKey: string | null, now: string): boolean {
  if (!d?.study) return false;
  if (!d.brief || d.brief.studyId !== d.study.id || (d.brief.callKey ?? null) !== callKey || (briefHolds(d.brief) && (d.brief.v ?? 1) < BRIEF_VERSION)) return true;
  return !briefHolds(d.brief) && Date.parse(now) - Date.parse(d.brief.at) > BRIEF_RETRY_HOURS * 3_600_000;
}

/** A brief that could not be written: the reason, so the deck says so and it is tried again after a day. */
export const briefFailed = (studyId: string, callKey: string | null, at: string, note: string): DeckBrief => deckBriefSchema.parse({ studyId, callKey, at, note: note.slice(0, 300), v: BRIEF_VERSION });

export function briefRequestBody(input: { symbol: string; name: string | null; quarter: string | null; date: string }, material: string, model: string, web: boolean): Record<string, unknown> {
  const schema = z.toJSONSchema(briefBody, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 9000,
    system: `You write the words of a post-earnings deck on ${input.name ?? input.symbol} (${input.symbol}) for a private investor: the slides on competition, what customers and staff say, the moats, the SWOT, the investment questions, capital allocation, the valuation, the outlook and the review note on what is new this quarter. The material below is the study written on these results, the quarter's release and the call as read, the thesis and the app's figures.${web ? ` Where the material cannot say it (the rivals by name, market share, what customers and staff say), search the web, at most ${BRIEF_SEARCHES} searches, and list every page you use under sources.` : " You have no web search: write from the material alone and leave out what it cannot say."}

Rules:
- Every figure comes from the material or a page you list; never one from memory, never an estimate.
- Each line one or two whole sentences, at most ${LINE} characters; each headline one sentence that says what the slide found, at most ${HEAD} characters. Never cut a sentence, never an ellipsis.
- Write about the business, not about the study or the filings: never "the study says", "the filings supplied", "is not in the figures". When something is unknown, leave it out.
- The latest quarter is the one reported on ${input.date}; use its figures from the release and the call where they are given, not the quarter before.
- The questions are answered in the investor's own terms, from the thesis and the results.
- review is the review note: read the study through this quarter and say only what the quarter adds, bears out or changes. Never repeat the study's own words or restate what it already said; when the study was written after these results, still say what is new against the quarter before.
${INVESTIGATIVE}
- No opinion beyond what the material supports, no advice to buy or sell, no exclamation marks.
- Your whole answer is one call to record_brief; write nothing outside it.`,
    tools: [...(web ? [{ type: "web_search_20250305", name: "web_search", max_uses: BRIEF_SEARCHES }] : []), { name: "record_brief", description: "Record the deck's words.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${material.slice(0, 60000)}\n\nWrite the deck's words.` }] }],
  };
}

export type BriefParse = { ok: true; brief: z.infer<typeof briefBody> } | { ok: false; reason: string };

/** Read item by item: a line over its length cut at a sentence, an item that does not hold left out, a part with nothing in it null. */
export function parseBriefResponse(body: unknown): BriefParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_brief");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the brief" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : typeof v === "string" && v.trim().startsWith("{") ? (safeJson(v) as Record<string, unknown> | null) : null);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === "string" && v.trim().startsWith("[") ? ((safeJson(v) as unknown[]) ?? []) : []);
  const ls = (v: unknown, n: number) => arr(v).map((x) => sentenceCut(x, LINE)).filter(Boolean).slice(0, n);
  const head = (v: unknown) => sentenceCut(v, HEAD) || null;
  const any = (o: Record<string, unknown>) => Object.values(o).some((x) => (Array.isArray(x) ? x.length : x));
  const part = <T extends Record<string, unknown>>(o: T): T | null => (any(o) ? o : null);

  const c = obj(raw.competition);
  const competition = c
    ? part({
        headline: head(c.headline),
        rivals: arr(c.rivals)
          .map((x) => {
            const y = obj(x) ?? {};
            const name = sentenceCut(y.name, 60);
            const competesOn = sentenceCut(y.competesOn, 160);
            const position = sentenceCut(y.position, 200);
            return name && competesOn && position ? { name, competesOn, position } : null;
          })
          .filter((x): x is { name: string; competesOn: string; position: string } => !!x)
          .slice(0, 6),
        points: ls(c.points, 4),
      })
    : null;
  const v = obj(raw.voices);
  const voices = v ? part({ headline: head(v.headline), customers: ls(v.customers, 4), staff: ls(v.staff, 4) }) : null;
  const m = obj(raw.moats);
  const moats = m
    ? part({
        headline: head(m.headline),
        pillars: arr(m.pillars)
          .map((x) => {
            const y = obj(x) ?? {};
            const name = sentenceCut(y.name, 60);
            const evidence = sentenceCut(y.evidence, LINE);
            const strength = (MOAT_STRENGTHS as readonly string[]).includes(String(y.strength)) ? (y.strength as (typeof MOAT_STRENGTHS)[number]) : "moderate";
            return name && evidence ? { name, strength, evidence } : null;
          })
          .filter((x): x is { name: string; strength: (typeof MOAT_STRENGTHS)[number]; evidence: string } => !!x)
          .slice(0, 5),
      })
    : null;
  const s = obj(raw.swot);
  const swot = s ? part({ strengths: ls(s.strengths, 4), weaknesses: ls(s.weaknesses, 4), opportunities: ls(s.opportunities, 4), threats: ls(s.threats, 4) }) : null;
  const q = obj(raw.questions);
  const questions = q ? part({ business: sentenceCut(q.business, 400) || null, now: sentenceCut(q.now, 400) || null, misses: sentenceCut(q.misses, 400) || null, change: sentenceCut(q.change, 400) || null, downside: sentenceCut(q.downside, 400) || null }) : null;
  const pts = (k: string) => {
    const o = obj(raw[k]);
    return o ? part({ headline: head(o.headline), points: ls(o.points, 4) }) : null;
  };
  const sources = arr(raw.sources)
    .map((x) => {
      const y = obj(x) ?? {};
      const url = typeof y.url === "string" ? y.url.trim() : "";
      const r = page.safeParse({ title: sentenceCut(y.title, 160) || url.slice(0, 160), url });
      return r.success ? r.data : null;
    })
    .filter((x): x is z.infer<typeof page> => !!x)
    .slice(0, 12);
  const rv = obj(raw.review);
  const review = rv ? part({ headline: head(rv.headline), news: ls(rv.news, 5), held: ls(rv.held, 3), changed: ls(rv.changed, 3) }) : null;
  const brief = { competition, voices, moats, swot, questions, capital: pts("capital"), valuation: pts("valuation"), outlook: pts("outlook"), review, sources };
  if (!competition && !moats && !swot && !questions && !brief.capital && !brief.outlook && !review) return { ok: false, reason: "the brief held none of the slides' words" };
  return { ok: true, brief };
}

function safeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
