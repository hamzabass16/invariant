import { z } from "zod";

import type { Book } from "@/lib/holdings";
import { againstBenchmark, formatField, formatGap, type LookGroup, type LookThrough } from "@/lib/look-through";
import { FIELDS } from "@/lib/ontology";
import type { Methodology } from "@/lib/methodology";
import { alphaStats, annualise, benchmarkIndex, dayStats, drawdownSeries, moneyWeighted, navIndex, periodReturns, riskStats, windowOf, type WindowKey } from "@/lib/performance";
import { criterionLabel, type ClassDef } from "@/lib/recipes";
import { daysBetween } from "@/lib/time";
import { MODELS } from "@/lib/models";

/**
 * Performance read through the person's methodology (Hamza, 23 Oct 2026:
 * "each metric should be read through the investor's methodology"; "press AI
 * insight to get it", not cluttered). The app computes every figure on the
 * page; on request the AI is given those figures, card by
 * card, with the methodology in words (its summary, horizon, classes, rules
 * with their sections, benchmarks and the tests it is judged by), and writes
 * one short reading per card: whether the figure matters under this
 * methodology, which way it points and the section it bears on. A reading
 * that quotes a figure the app did not give it, or a section the methodology
 * lacks, loses it; a card the app did not send is dropped. Never a forecast,
 * never advice to buy or sell; kept in the vault's `perf_insights` file until
 * asked again. Pure.
 */

export const INSIGHT_MODEL = MODELS.standard;
export const INSIGHT_CARDS = ["returns", "irr", "alpha", "risk", "drawdown", "days", "look_through", "by_holding"] as const;
export type InsightCard = (typeof INSIGHT_CARDS)[number];
export const INSIGHT_TONES = ["in_line", "watch", "against", "noise"] as const;
export type InsightTone = (typeof INSIGHT_TONES)[number];
export const TONE_WORDS: Record<InsightTone, string> = { in_line: "In line", watch: "Worth watching", against: "Against it", noise: "Noise for now" };
export const CARD_WORDS: Record<InsightCard, string> = { returns: "Returns", irr: "Money-weighted return", alpha: "Alpha", risk: "Risk", drawdown: "Drawdown", days: "Good and bad days", look_through: "Look-through", by_holding: "By holding" };
/** A reading's length: two short sentences. */
export const READING_MAX = 320;

export type InsightFact = { card: InsightCard; lines: string[] };

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const f2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
const sgn = (v: number) => `${v > 0 ? "+" : ""}${f1(v)}%`;

/**
 * The page's figures as the model is given them, card by card, in words with
 * their numbers: the same functions the page draws from, at the windows the
 * person has chosen. A card the book cannot fill is not sent.
 */
export function perfFacts(book: Book, benchmarks: readonly string[], w: { window: WindowKey; irr: WindowKey; alpha: WindowKey }): InsightFact[] {
  const idx = navIndex(book);
  if (!idx) return [];
  const out: InsightFact[] = [];
  const present = benchmarks.filter((b) => benchmarkIndex(book, b) !== null);
  const versus = present[0] ?? (benchmarkIndex(book, "SPY") ? "SPY" : null);
  const periods = periodReturns(book, present.length ? present : versus ? [versus] : [], book.asOf).filter((p) => p.account !== null);
  if (periods.length) {
    const lines = periods.map((p) => {
      const days = daysBetween(p.from, p.to);
      const bench = Object.entries(p.benchmarks).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${sgn(v as number)}`);
      const a = p.key === "Since start" && days > 366 ? annualise(p.account as number, days) : null;
      const yearly = a !== null ? ` (${sgn(a)} a year over ${f1(days / 365.25)} years)` : "";
      return `${p.key}: the book ${sgn(p.account as number)}${yearly}${bench.length ? `; ${bench.join(", ")}` : ""}`;
    });
    out.push({ card: "returns", lines: [...lines, "Time-weighted: deposits and withdrawals taken out."] });
  }
  const mw = moneyWeighted(book, w.irr);
  if (mw) {
    out.push({
      card: "irr",
      lines: [
        `Over ${w.irr} (${mw.from} to ${mw.to}): money-weighted return ${sgn(mw.yearly ? mw.irr : mw.overPeriod)}${mw.yearly ? " a year" : " over the window"}; time-weighted ${mw.yearly ? (mw.twrYearly === null ? "n/a" : `${sgn(mw.twrYearly)} a year`) : mw.twr === null ? "n/a" : sgn(mw.twr)}.`,
        mw.flows ? `${mw.flows} deposits and withdrawals in the window.` : "No deposits or withdrawals in the window.",
        "Money-weighted counts the timing of money added and taken out; time-weighted does not.",
      ],
    });
  }
  const a = versus ? alphaStats(book, versus, w.alpha) : null;
  if (a) {
    out.push({
      card: "alpha",
      lines: [
        `Over ${w.alpha} (${a.from} to ${a.to}) against ${a.benchmark}: Jensen's alpha ${sgn(a.alpha)} a year, 95% interval ${sgn(a.low)} to ${sgn(a.high)}, p-value ${f2(a.p)}, beta ${f2(a.beta)}, R² ${f2(a.r2)}, ${a.n} paired returns.`,
        "A p-value above 0.05 means the alpha cannot be told from chance.",
      ],
    });
  }
  const r = riskStats(book, versus, w.window);
  if (r) {
    const bits = [
      r.volatility !== null ? `volatility ${f1(r.volatility)}% a year` : null,
      r.beta !== null && versus ? `beta ${f2(r.beta)} against ${versus}` : null,
      r.correlation !== null && versus ? `correlation ${f2(r.correlation)} with ${versus}` : null,
      r.sharpe !== null ? `Sharpe ${f2(r.sharpe)}` : null,
      r.calmar !== null ? `Calmar ${f2(r.calmar)}` : null,
    ].filter((x): x is string => !!x);
    if (bits.length) out.push({ card: "risk", lines: [`Over ${w.window} (${r.from} to ${r.to}): ${bits.join(", ")}.`] });
  }
  const dd = drawdownSeries(book, w.window);
  const ddAll = drawdownSeries(book, "Since start");
  if (dd && ddAll) {
    out.push({
      card: "drawdown",
      lines: [
        `Over ${w.window}: worst fall from a high ${f1(dd.maxDrawdown)}% to ${dd.troughDate}.`,
        `Since the start: worst fall ${f1(ddAll.maxDrawdown)}%; now ${ddAll.current === 0 ? "at a high" : `${f1(ddAll.current)}% below the high of ${ddAll.highDate}`}.`,
      ],
    });
  }
  const d = dayStats(book, versus, windowOf(w.window, book.asOf, idx.dates[0]));
  if (d) {
    const bits = [
      d.upShare !== null ? `${f1(d.upShare)}% of ${d.unit}s rose` : null,
      d.badLine !== null ? `one ${d.unit} in twenty lost ${f1(d.badLine)}% or more` : null,
      d.upCapture !== null && d.benchmark ? `up capture ${f1(d.upCapture)}% of ${d.benchmark}'s` : null,
      d.downCapture !== null && d.benchmark ? `down capture ${f1(d.downCapture)}%` : null,
      d.trackingError !== null ? `tracking error ${f1(d.trackingError)}% a year` : null,
    ].filter((x): x is string => !!x);
    if (bits.length) out.push({ card: "days", lines: [`Over ${w.window}: ${bits.join(", ")}.`] });
  }
  return out;
}

/** Holdings sent on the By holding card, the largest first. */
export const MAX_LOOK_HOLDINGS = 25;

/**
 * The look-through as the model is given it (Hamza, 24 Oct 2026: the
 * Look-through and By holding cards read through the methodology too): the
 * book, each class and SPY and QQQ on the figures the classes test, then each
 * listed holding with its class and its weight in percent. Figures and
 * weights in percent alone; never an amount of money.
 */
export function lookFacts(look: LookThrough | null, classes: readonly ClassDef[] = [], benchmarks: readonly string[] = []): InsightFact[] {
  if (!look || !look.fields.length) return [];
  const label = (f: string) => FIELDS[f as keyof typeof FIELDS]?.label ?? f;
  const group = (g: LookGroup) => {
    const bits = look.fields.flatMap((f) => {
      const r = g.readings[f];
      return r && r.value !== null ? [`${label(f)} ${formatField(f, r.value)}${r.coverage < 99.5 ? ` (${f1(r.coverage)}% of it read)` : ""}`] : [];
    });
    const share = g.kind === "fund" ? `, ${f1(g.weight)}% of the fund read` : `, ${f1(g.weight)}% of net worth`;
    return bits.length ? `${g.label}${share}: ${bits.join(", ")}.` : null;
  };
  const out: InsightFact[] = [];
  const groups = [look.book, ...(look.classes.length > 1 ? look.classes : []), ...look.funds].map(group).filter((x): x is string => !!x);
  if (groups.length) out.push({ card: "look_through", lines: [...groups, ...againstLines(look, classes, benchmarks), "Each figure is the weighted average of the listed companies' own figures from their filings: by position for the book, by the fund's weight for SPY and QQQ."] });
  const holdings = look.holdings.slice(0, MAX_LOOK_HOLDINGS).flatMap((h) => {
    const bits = look.fields.flatMap((f) => (h.values[f] === null || h.values[f] === undefined ? [] : [`${label(f)} ${formatField(f, h.values[f])}`]));
    return bits.length ? [`${h.symbol} (${h.classLabel}, ${f1(h.weight)}% of net worth): ${bits.join(", ")}.`] : [];
  });
  if (holdings.length) out.push({ card: "by_holding", lines: holdings });
  return out;
}

/**
 * The book against SPY figure by figure, as the app judged it (Hamza, 24 Oct
 * 2026: "are you actually following this methodology, what are the biggest
 * holdings pushing down your ROIC compared to the S&P"): the gap, which way
 * the classes' tests want the figure, where the book stands, each class's
 * own average against its test, and the holdings pulling it the wrong way.
 */
export function againstLines(look: LookThrough, classes: readonly ClassDef[], benchmarks: readonly string[] = []): string[] {
  const a = againstBenchmark(look, classes, benchmarks);
  if (!a) return [];
  const label = (f: string) => FIELDS[f as keyof typeof FIELDS]?.label ?? f;
  return a.rows.map((r) => {
    const gap = r.gap as number;
    const where = Math.abs(gap) < 1e-9 ? `level with ${a.fund}` : `${formatGap(r.field, Math.abs(gap)).replace(/^\+/, "")} ${gap > 0 ? "above" : "below"} ${a.fund}`;
    const want = r.want ? `your classes want it ${r.want} (${r.tests.map((t) => `${t.classLabel} ${t.words}${t.value === null ? "" : `, its holdings average ${formatField(r.field, t.value)}`}`).join("; ")}), so the book is ${r.stands === "ahead" ? "ahead of" : r.stands === "behind" ? "behind" : "level with"} ${a.fund} where its classes want it` : r.tests.length ? `your classes test it both ways (${r.tests.map((t) => `${t.classLabel} ${t.words}`).join("; ")})` : "no class tests it with a level";
    const pulls = r.pulls.length ? ` Pulling it ${r.want === "higher" ? "down" : r.want === "lower" ? "up" : gap < 0 ? "down" : "up"} against ${a.fund} most: ${r.pulls.map((p) => `${p.symbol} (${p.classLabel}, ${f1(p.weight)}% of net worth) at ${formatField(r.field, p.value)}, ${formatGap(r.field, p.pull)}`).join("; ")}.` : "";
    return `Against ${a.fund}, ${label(r.field)}: your book ${formatField(r.field, r.book)}, ${a.fund} ${formatField(r.field, r.fund)}, ${where}; ${want}.${pulls}`;
  });
}

export type MethodologyLens = {
  name: string;
  summary: string;
  benchmarks: string[];
  classes: { label: string; test: string }[];
  rules: { section: string; text: string }[];
  tests: string[];
};

/** The methodology in words, as the model reads it: never a holding, an amount or an account. */
export function methodologyLens(m: Methodology, benchmarks: readonly string[]): MethodologyLens {
  return {
    name: m.name,
    summary: m.summary,
    benchmarks: [...benchmarks],
    classes: m.classes.map((c) => ({ label: c.label, test: [...(c.required ?? []), ...c.criteria].map(criterionLabel).slice(0, 8).join("; ") })),
    rules: m.rules.slice(0, 40).map((r) => ({ section: r.section, text: r.text })),
    tests: (m.evaluation?.tests ?? []).map((t) => `${t.claim}${t.section ? ` (${t.section})` : ""}`),
  };
}

const itemSchema = z.object({
  card: z.enum(INSIGHT_CARDS),
  reading: z.string().describe("One or two short sentences: what this card's figures mean under this methodology, whether they matter at its horizon, which way they point. Only figures given for this card."),
  tone: z.enum(INSIGHT_TONES).describe("in_line: the figures fit what the methodology expects. watch: worth watching under it. against: they cut against what it expects. noise: too short a span or too uncertain to mean anything under it yet."),
  sections: z.array(z.string()).max(3).describe("The rule sections the reading bears on, exactly as given; empty when none."),
});
const insightsToolSchema = z.object({
  overall: z.string().describe("One or two sentences: what the page as a whole says about the book under this methodology."),
  items: z.array(itemSchema).max(INSIGHT_CARDS.length),
});

export function insightsRequestBody(facts: readonly InsightFact[], lens: MethodologyLens, model = INSIGHT_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(insightsToolSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const classes = lens.classes.length ? lens.classes.map((c) => `- ${c.label}: ${c.test || "no test in words"}`).join("\n") : "- none";
  const rules = lens.rules.length ? lens.rules.map((r) => `- ${r.section}: ${r.text}`).join("\n") : "- none";
  const tests = lens.tests.length ? lens.tests.map((t) => `- ${t}`).join("\n") : "- none stated";
  const cards = facts.map((f) => `[${f.card}] ${CARD_WORDS[f.card]}\n${f.lines.map((l) => `  ${l}`).join("\n")}`).join("\n\n");
  return {
    model,
    max_tokens: 4000,
    system: `You read an investor's performance figures through their own investment methodology. A portfolio app computed every figure; you explain what each card means under this methodology, so the investor knows whether a number matters to how they invest.

Rules:
- One reading per card given, one or two short sentences, in plain words. Say whether the figure matters at the methodology's horizon (a long-horizon methodology treats a short window or an alpha that cannot be told from chance as noise), which way it points against what the methodology expects, and why.
- Use only the figures given on that card, copied as written. Never compute, estimate or forecast a figure. Never advise buying or selling.
- Cite a rule section only when the reading bears on it, exactly as listed.
- Do not repeat the figure's definition; the card already shows it. Do not repeat the same point across cards.
- On the Look-through card, judge whether the book is built the way its classes say it should be, against the fund the card sets it against. Where the card says the book is behind that fund on a figure its classes want higher (or lower), say so plainly: the classes prize that figure, yet the market as a whole has more of it. Name the holdings the card says pull it the wrong way most, exactly as given. Where the book is ahead or level, say that in a few words.
- On the By holding card, name the holdings that sit furthest from the tests their own class sets, or say none does; name a holding only as it is given.
- Your whole answer is one call to record_insights.`,
    tools: [{ name: "record_insights", description: "Record one reading per performance card, read through the methodology.", input_schema: schema }],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Methodology: ${lens.name}\nSummary: ${lens.summary}\nBenchmarks it names: ${lens.benchmarks.join(", ") || "none"}\n\nClasses:\n${classes}\n\nRules:\n${rules}\n\nWhat it says shows it works:\n${tests}\n\nThe cards:\n\n${cards}`,
          },
        ],
      },
    ],
  };
}

export const perfInsightSchema = z.object({ card: z.enum(INSIGHT_CARDS), reading: z.string().max(READING_MAX + 40), tone: z.enum(INSIGHT_TONES), sections: z.array(z.string()).max(3) });
export type PerfInsight = z.infer<typeof perfInsightSchema>;
export const perfInsightsFileSchema = z.object({
  version: z.literal(1),
  /** When it was read, the figures' date, the windows chosen and the methodology it was read against. */
  at: z.string(),
  asOf: z.string(),
  windows: z.object({ window: z.string(), irr: z.string(), alpha: z.string() }),
  against: z.string(),
  overall: z.string().max(READING_MAX + 40),
  items: z.array(perfInsightSchema),
  /** What the app left out of the model's answer, and why. */
  dropped: z.array(z.string()).default([]),
});
export type PerfInsightsFile = z.infer<typeof perfInsightsFileSchema>;

/** The numbers a text quotes that carry a unit or a decimal (or are 13 and up), the years left out, as written. */
function quoted(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?=\s*(%|x|×|pts?|points?|\b))/g)) {
    const raw = m[0];
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (/^(19|20)\d\d$/.test(raw) && !m[1]) continue;
    if (!raw.includes(".") && !m[1] && Math.abs(n) <= 12) continue;
    out.push(raw);
  }
  return out;
}

/** The figures in a reading that the card it is about did not give, within rounding, as the reading wrote them. */
export function figuresNotGiven(reading: string, given: readonly string[]): string[] {
  const nums = given.flatMap((l) => [...l.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])));
  return quoted(reading).filter((raw) => {
    const n = Number(raw);
    return !nums.some((g) => Math.abs(Math.abs(g) - Math.abs(n)) <= (raw.includes(".") ? 0.051 : 0.5));
  });
}

export type InsightsParse = { ok: true; overall: string; items: PerfInsight[]; dropped: string[] } | { ok: false; reason: string; log: string };

/** A value the model sent as JSON text where the tool asks for the value itself, read back; anything else as it came. */
function unwrap(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * The model's call, checked: a card not sent, a section the methodology
 * lacks and a reading quoting a figure the card did not give are dropped and
 * said so. Read item by item, so one malformed reading costs that reading,
 * never the page's (24 Oct 2026: a strict read of the whole call failed it
 * all when one card came back with a fourth section); `log` names what went
 * wrong for the server log, never the text.
 */
export function parseInsights(body: unknown, facts: readonly InsightFact[], lens: MethodologyLens): InsightsParse {
  const b = body as { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string } | null;
  const cut = b?.stop_reason === "max_tokens";
  const call = b?.content?.find((c) => c.type === "tool_use" && c.name === "record_insights");
  if (!call) return cut ? { ok: false, reason: "The model ran out of room before it wrote the readings. Try again.", log: "insights cut, no call" } : { ok: false, reason: "The model answered in words instead of readings. Try again.", log: `insights no call, stop ${b?.stop_reason ?? "none"}` };
  const input = unwrap(call.input) as { overall?: unknown; items?: unknown } | null;
  const raw = unwrap(input?.items);
  const list: unknown[] = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const sections = new Set(lens.rules.map((r) => r.section));
  const byCard = new Map(facts.map((f) => [f.card, f.lines]));
  const dropped: string[] = [];
  const bad: string[] = [];
  const seen = new Set<InsightCard>();
  const items: PerfInsight[] = [];
  for (const [i, entry] of list.entries()) {
    const e = unwrap(entry) as Record<string, unknown> | null;
    const p = itemSchema.safeParse(e && typeof e === "object" ? { ...e, sections: Array.isArray(e.sections) ? e.sections.filter((x) => typeof x === "string").slice(0, 3) : typeof e.sections === "string" ? [e.sections] : [] } : e);
    if (!p.success) {
      bad.push(`${i}:${p.error.issues.map((x) => x.path.join(".") || x.code).join("|")}`);
      continue;
    }
    const it = p.data;
    const lines = byCard.get(it.card);
    if (!lines || seen.has(it.card)) {
      dropped.push(`${CARD_WORDS[it.card]}: ${lines ? "read twice; the first reading is kept" : "not a card the app sent"}.`);
      continue;
    }
    const off = figuresNotGiven(it.reading, lines);
    if (off.length) {
      dropped.push(`${CARD_WORDS[it.card]}: quoted ${off.join(", ")}, which the card does not show.`);
      continue;
    }
    seen.add(it.card);
    items.push({ card: it.card, reading: clip(it.reading), tone: it.tone, sections: it.sections.filter((s) => sections.has(s)) });
  }
  if (bad.length) dropped.push(`${bad.length} reading${bad.length === 1 ? " was" : "s were"} not in a shape the app reads and left out.`);
  const allLines = facts.flatMap((f) => f.lines);
  const said = typeof input?.overall === "string" ? input.overall : "";
  const overall = !said || figuresNotGiven(said, allLines).length ? "" : clip(said);
  const log = `insights items ${list.length}, kept ${items.length}, bad ${bad.slice(0, 8).join(",") || "none"}, stop ${b?.stop_reason ?? "none"}`;
  if (!items.length && !overall)
    return {
      ok: false,
      log,
      reason: cut ? "The model ran out of room before it finished the readings. Try again." : dropped.length && !bad.length ? `Every reading quoted a figure the page does not show, so none was kept. ${dropped.join(" ")}` : list.length ? "What came back was not a set of readings the app can read. Try again." : "No reading came back. Try again.",
    };
  if (cut) dropped.push("The model ran out of room, so the last cards may have no reading.");
  return { ok: true, overall, items, dropped };
}

function clip(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= READING_MAX) return t;
  const cut = t.slice(0, READING_MAX);
  const end = cut.lastIndexOf(". ");
  return end > READING_MAX / 2 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

/** Whether a kept reading was made on the figures and windows now shown. */
export function insightsCurrent(f: PerfInsightsFile | null, asOf: string, w: { window: WindowKey; irr: WindowKey; alpha: WindowKey }, against: string): boolean {
  return !!f && f.asOf === asOf && f.windows.window === w.window && f.windows.irr === w.irr && f.windows.alpha === w.alpha && f.against === against;
}
