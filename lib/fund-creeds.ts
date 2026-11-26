/**
 * What each top fund says it does (Hamza, 9 Nov 2026: "for the Top funds
 * page, fetch each fund's methodology and theses and use that to rank
 * similarity to the user"). Beside its 13F (lib/funds.ts), each fund's
 * approach and its stated theses are read once a quarter for everyone from
 * its own pages: its letters, its site, its filings and its manager's own
 * published words, every point with its page. The reading is laid on fixed
 * words the app can compare: the styles (`STYLES`), the figures it says it
 * looks for and which way (`CREED_FIELDS`, the ontology's own), and the
 * themes of its theses (`THEMES`). The person's side is read with no model:
 * the tests their classes set, the styles those tests imply, their stock
 * theses and the themes of their market theses. How close a fund is, is the
 * share of the person's approach it says it shares, less what it says the
 * other way, beside the theses both hold; never a model's verdict, never a
 * forecast and never advice.
 *
 * Pure: the vocabulary, the request, the parser, what is due, the person's
 * lens and the comparison.
 */
import { z } from "zod";

import { FUNDS, type FundDef, type FundsFile } from "@/lib/funds";
import { FIELDS, type FieldId } from "@/lib/ontology";
import { classFilters } from "@/lib/recipes";
import { methodologySchema, type Dashboard, type Methodology } from "@/lib/methodology";
import { MODELS } from "@/lib/models";
import { EMPTY_THESIS, MAX_MARKET_THESES, marketThesisFor, marketThesisId, thesisFor, withEvidence, withMarketThesis, withThesis, type Evidence, type ThesesFile } from "@/lib/theses";
import type { Figure } from "@/lib/recipes";

/** A creed is read again after this many days: once a quarter, when the letters come out. */
export const CREED_REFRESH_DAYS = 91;
/** The reading's shape: a creed kept under an earlier one is read again at the next run (2: the levels it states, 9 Nov 2026). */
export const CREED_VERSION = 2;
/** A read that failed is tried again after this many days. */
export const CREED_RETRY_DAYS = 7;
/** Funds read a run, the longest unread first. */
export const CREEDS_PER_RUN = 3;
/** Web searches a fund's reading may make. */
export const CREED_SEARCHES = 6;
export const CREED_MAX_TOKENS = 6000;
export const CREED_MODEL = MODELS.standard;
export const MAX_CREED_TESTS = 8;
export const MAX_CREED_THESES = 8;
export const MAX_CREED_SOURCES = 8;

/** How a manager invests, in words both sides can be laid on. */
export const STYLES = [
  { id: "quality", label: "Quality", words: "high returns on capital, wide margins, durable advantages" },
  { id: "value", label: "Value", words: "buys below what a business is worth, at low multiples" },
  { id: "growth", label: "Growth", words: "fast-growing revenue and earnings" },
  { id: "income", label: "Income", words: "dividends and cash returned to owners" },
  { id: "balance_sheet", label: "Strong balance sheet", words: "little debt, interest well covered" },
  { id: "long_term", label: "Long holding", words: "holds for years, little turnover" },
  { id: "concentrated", label: "Concentrated", words: "a few large positions" },
  { id: "contrarian", label: "Contrarian", words: "buys what others are selling" },
  { id: "activist", label: "Activist", words: "presses companies to change" },
  { id: "macro", label: "Macro", words: "top-down calls on rates, currencies and cycles" },
  { id: "special_situations", label: "Special situations", words: "spin-offs, restructurings, mergers" },
] as const;
export type StyleId = (typeof STYLES)[number]["id"];
const STYLE_IDS = STYLES.map((s) => s.id) as readonly string[];
export const styleLabel = (id: string): string => STYLES.find((s) => s.id === id)?.label ?? id;

/**
 * The figures a creed may say it looks for, by group: fields that measure
 * the same thing (the P/E on the filings, forward or the analysts') compare
 * as one, and each group says which style wanting it more, or less, implies.
 */
export const CREED_FIELDS: readonly { group: string; label: string; fields: readonly FieldId[]; style: StyleId; want: "higher" | "lower" }[] = [
  { group: "roic", label: "Return on invested capital", fields: ["roic_pct", "roic_ex_goodwill_pct"], style: "quality", want: "higher" },
  { group: "gross_margin", label: "Gross margin", fields: ["gross_margin_pct"], style: "quality", want: "higher" },
  { group: "operating_margin", label: "Operating margin", fields: ["operating_margin_pct", "operating_margin_change_pts"], style: "quality", want: "higher" },
  { group: "fcf_margin", label: "Free cash flow margin", fields: ["fcf_margin_pct"], style: "quality", want: "higher" },
  { group: "fcf_conversion", label: "Free cash flow conversion", fields: ["fcf_conversion", "fcf_conversion_operating"], style: "quality", want: "higher" },
  { group: "revenue_growth", label: "Revenue growth", fields: ["revenue_growth_pct", "engine_growth_pct"], style: "growth", want: "higher" },
  { group: "eps_growth", label: "Earnings growth", fields: ["eps_growth_pct"], style: "growth", want: "higher" },
  { group: "fcf_ps_growth", label: "Free cash flow per share growth", fields: ["fcf_per_share_growth_pct"], style: "growth", want: "higher" },
  { group: "pe", label: "Price to earnings", fields: ["pe_ratio", "forward_pe", "consensus_forward_pe"], style: "value", want: "lower" },
  { group: "pfcf", label: "Price to free cash flow", fields: ["pfcf_ratio", "forward_pfcf"], style: "value", want: "lower" },
  { group: "ps", label: "Price to sales", fields: ["ps_ratio", "forward_ps"], style: "value", want: "lower" },
  { group: "dividend", label: "Dividend yield", fields: ["dividend_yield_pct", "dividend_growth_5y_pct", "dividend_years_raised"], style: "income", want: "higher" },
  { group: "capital_returned", label: "Capital returned", fields: ["capital_returned_pct"], style: "income", want: "higher" },
  { group: "leverage", label: "Net debt to EBITDA", fields: ["net_debt_to_ebitda"], style: "balance_sheet", want: "lower" },
  { group: "interest_cover", label: "Interest cover", fields: ["interest_cover", "interest_cover_net", "cash_to_debt_pct"], style: "balance_sheet", want: "higher" },
];
const groupOfField = (f: string) => CREED_FIELDS.find((g) => (g.fields as readonly string[]).includes(f)) ?? null;
export const groupLabel = (g: string): string => CREED_FIELDS.find((x) => x.group === g)?.label ?? g;

/** What a thesis is about, for one that names no company; the person's market theses are matched on these words. */
export const THEMES = [
  { id: "ai", label: "AI", words: /\b(ai|a\.i\.|artificial intelligence|machine learning|gpus?|data cent(?:er|re)s?|llms?|inference)\b/i },
  { id: "rates", label: "Interest rates", words: /\b(interest rates?|rate cuts?|rate hikes?|the fed|federal reserve|central banks?|bond yields?|treasur(?:y|ies)|yield curve)\b/i },
  { id: "inflation", label: "Inflation", words: /\b(inflation|disinflation|deflation|cpi|prices rising)\b/i },
  { id: "cycle", label: "Recession and the cycle", words: /\b(recession|downturn|slowdown|soft landing|hard landing|business cycle|credit cycle)\b/i },
  { id: "energy", label: "Energy", words: /\b(oil|natural gas|lng|energy|opec|crude|nuclear|power demand|utilities)\b/i },
  { id: "china", label: "China", words: /\b(china|chinese|hong kong|beijing)\b/i },
  { id: "consumer", label: "The consumer", words: /\b(consumer|consumers|consumer spending|retail|household spending)\b/i },
  { id: "health", label: "Health care", words: /\b(health ?care|pharma|biotech|drugs?|glp-?1|obesity|medtech)\b/i },
  { id: "financials", label: "Banks and insurance", words: /\b(banks?|banking|insurers?|insurance|private credit|lending)\b/i },
  { id: "dollar", label: "The dollar and currencies", words: /\b(dollar|currenc(?:y|ies)|fx|yen|euro|gold)\b/i },
  { id: "housing", label: "Housing", words: /\b(housing|homebuild\w*|mortgages?|real estate)\b/i },
  { id: "trade", label: "Trade and tariffs", words: /\b(tariffs?|trade war|reshoring|onshoring|supply chains?|deglobali[sz]ation)\b/i },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
const THEME_IDS = THEMES.map((t) => t.id) as readonly string[];
export const themeLabel = (id: string): string => THEMES.find((t) => t.id === id)?.label ?? id;

/** The themes a text speaks to, by their words. */
export function themesOf(text: string): ThemeId[] {
  return THEMES.filter((t) => t.words.test(text)).map((t) => t.id);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const httpsPage = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !!url.hostname && !/^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname);
  } catch {
    return false;
  }
};

const sourceSchema = z.object({ title: z.string().max(160), url: z.string().max(1000).refine(httpsPage, "an https page"), date: z.string().regex(DAY).nullable().default(null) });
export type CreedSource = z.infer<typeof sourceSchema>;

export const creedSchema = z.object({
  id: z.string().max(40),
  /** How it says it invests, in two or three plain sentences, the app's own words. */
  summary: z.string().max(600),
  styles: z.array(z.enum(STYLES.map((s) => s.id) as [StyleId, ...StyleId[]])).max(STYLES.length),
  /** The figures it says it looks for, each with which way and its words. */
  tests: z
    .array(
      z.object({
        group: z.string().max(40),
        want: z.enum(["higher", "lower"]),
        words: z.string().max(200),
        /** The field it named, and the level it states for it in the field's unit, kept only when the number is printed in its words. */
        field: z.string().max(60).nullable().optional(),
        level: z.number().nullable().optional(),
      }),
    )
    .max(MAX_CREED_TESTS),
  /** Its stated theses: on a company (a ticker) or a theme, each with its page. */
  theses: z
    .array(
      z.object({
        ticker: z.string().regex(TICKER).nullable(),
        theme: z.enum(THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]]).nullable(),
        title: z.string().max(120),
        words: z.string().max(400),
        source: sourceSchema,
      }),
    )
    .max(MAX_CREED_THESES),
  sources: z.array(sourceSchema).max(MAX_CREED_SOURCES),
  readAt: z.string(),
  model: z.string().max(80).nullable().default(null),
  /** Why the reading failed when there was no good one before; a creed with an error is never kept over a good one. */
  error: z.string().max(300).nullable().default(null),
  /** When a reading again failed while this good one stayed: tried again a week on. */
  failedAt: z.string().nullable().default(null),
  note: z.string().max(300).nullable().default(null),
  version: z.number().int().optional(),
});
export type FundCreed = z.infer<typeof creedSchema>;

/** The creeds kept, by fund id. */
export type Creeds = Record<string, FundCreed>;

/** The funds whose creed is due: never read first, then the longest unread; read again a quarter on, a failed read a week on. */
export function creedsDue(funds: readonly FundDef[], kept: Creeds, now: Date): FundDef[] {
  const days = (at: string, n: number) => now.getTime() - Date.parse(at) >= n * 86_400_000;
  return funds
    .filter((d) => {
      const c = kept[d.id];
      if (!c) return true;
      if (c.error) return days(c.readAt, CREED_RETRY_DAYS);
      if ((c.version ?? 1) < CREED_VERSION) return !c.failedAt || days(c.failedAt, CREED_RETRY_DAYS);
      return days(c.readAt, CREED_REFRESH_DAYS) && (!c.failedAt || days(c.failedAt, CREED_RETRY_DAYS));
    })
    .sort((a, b) => (kept[a.id] ? Date.parse(kept[a.id].readAt) : 0) - (kept[b.id] ? Date.parse(kept[b.id].readAt) : 0));
}

const modelSourceSchema = z.object({ title: z.string(), url: z.string(), date: z.string().optional() });
const modelAnswerSchema = z.object({
  summary: z.string(),
  styles: z.array(z.string()),
  tests: z.array(z.object({ field: z.string(), want: z.string(), words: z.string(), level: z.number().optional() })),
  theses: z.array(z.object({ ticker: z.string().optional(), theme: z.string().optional(), title: z.string(), words: z.string(), source: modelSourceSchema })),
  sources: z.array(modelSourceSchema),
  note: z.string().optional(),
});

/** The one call: the fund, the fixed words to lay its approach on; the web search does the finding. */
export function creedRequestBody(fund: Pick<FundDef, "name" | "manager">, today: string, model = CREED_MODEL): Record<string, unknown> {
  const schema = z.toJSONSchema(modelAnswerSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const fields = CREED_FIELDS.map((g) => `${g.fields[0]} (${FIELDS[g.fields[0]].label})`).join(", ");
  return {
    model,
    max_tokens: CREED_MAX_TOKENS,
    system: `You read how an investment manager says it invests, for an app that compares managers with a person's own written rules. Today is ${today}. Search the web (at most ${CREED_SEARCHES} searches) for ${fund.name} (${fund.manager}).

Read only the manager's own words: its letters to shareholders or partners, its own website, its regulatory filings, and talks or interviews where the manager speaks in person. Never a third party's summary, a fan site or a stock-picking article. The newest letters first; a view the manager has since dropped is left out.

Record:
- summary: two or three plain sentences in your own words on how it says it invests. No praise, no opinion, no prediction, no advice. Quote nothing longer than a few words.
- styles: those it says it follows, each one of: ${STYLES.map((s) => `${s.id} (${s.words})`).join("; ")}.
- tests: the figures it says it looks for, each one of these fields: ${fields}; want is higher or lower; words is its criterion in a few plain words. Only what it states, at most ${MAX_CREED_TESTS}. level only when the manager itself states a number for it, in the field's unit (a percentage as 15 for 15%, a multiple as 20 for 20 times), with that number written in words; otherwise leave level out.
- theses: at most ${MAX_CREED_THESES} views it states in its newest letters or talks, each on one company (its US ticker) or one theme (${THEMES.map((t) => t.id).join(", ")}), with a title, one or two sentences in your own words, and the https page it is on with its date.
- sources: the pages you read, each with its title, https address and date.
- When its own pages say little, record what they say and say so in note.
Your whole answer is one call to record_creed; write nothing outside it.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: CREED_SEARCHES },
      { name: "record_creed", description: "Record how the manager says it invests and its stated theses.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `Read how ${fund.name} says it invests, and its newest stated theses.` }] }],
  };
}

export type CreedParse = { ok: true; creed: FundCreed; dropped: number } | { ok: false; reason: string };

const cleanSource = (s: z.infer<typeof modelSourceSchema>) => {
  const date = (s.date ?? "").trim().slice(0, 10);
  const r = sourceSchema.safeParse({ title: s.title.trim().slice(0, 160), url: s.url.trim(), date: DAY.test(date) ? date : null });
  return r.success ? r.data : null;
};

/**
 * Reads the answer item by item: a style, a figure or a theme outside the
 * fixed words, a thesis without an https page, a ticker that is not one, is
 * dropped and counted; one bad item never costs the rest. A reading with no
 * summary is no reading.
 */
export function parseCreedResponse(body: unknown, id: string, readAt: string, model: string | null): CreedParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_creed");
  if (!call) return { ok: false, reason: (body as { stop_reason?: string } | null)?.stop_reason === "max_tokens" ? "the answer ran past its length before it recorded the reading" : "the model answered in words instead of recording the reading" };
  const raw = (call.input ?? {}) as Record<string, unknown>;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) return { ok: false, reason: "the reading had no summary" };
  let dropped = 0;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const styles: StyleId[] = [];
  for (const s of list(raw.styles)) {
    const v = String(s).trim().toLowerCase();
    if (STYLE_IDS.includes(v) && !styles.includes(v as StyleId)) styles.push(v as StyleId);
    else dropped++;
  }
  const tests: FundCreed["tests"] = [];
  for (const t of list(raw.tests)) {
    const m = modelAnswerSchema.shape.tests.element.safeParse(t);
    const g = m.success ? groupOfField(m.data.field.trim()) : null;
    const want = m.success ? m.data.want.trim().toLowerCase() : "";
    if (!m.success || !g || (want !== "higher" && want !== "lower") || tests.some((x) => x.group === g.group) || tests.length >= MAX_CREED_TESTS) {
      dropped++;
      continue;
    }
    const words = m.data.words.trim().slice(0, 200);
    const level = typeof m.data.level === "number" && Number.isFinite(m.data.level) && printedIn(words, m.data.level) ? m.data.level : null;
    tests.push({ group: g.group, want: want as "higher" | "lower", words, field: m.data.field.trim(), level });
  }
  const theses: FundCreed["theses"] = [];
  for (const t of list(raw.theses)) {
    const m = modelAnswerSchema.shape.theses.element.safeParse(t);
    const source = m.success ? cleanSource(m.data.source) : null;
    const ticker = m.success ? (m.data.ticker ?? "").trim().toUpperCase() : "";
    const theme = m.success ? (m.data.theme ?? "").trim().toLowerCase() : "";
    const okTicker = TICKER.test(ticker);
    const okTheme = THEME_IDS.includes(theme);
    if (!m.success || !source || (!okTicker && !okTheme) || theses.length >= MAX_CREED_THESES) {
      dropped++;
      continue;
    }
    theses.push({ ticker: okTicker ? ticker : null, theme: okTheme ? (theme as ThemeId) : null, title: m.data.title.trim().slice(0, 120), words: m.data.words.trim().slice(0, 400), source });
  }
  const sources: CreedSource[] = [];
  for (const s of list(raw.sources)) {
    const m = modelSourceSchema.safeParse(s);
    const c = m.success ? cleanSource(m.data) : null;
    if (!c || sources.some((x) => x.url === c.url) || sources.length >= MAX_CREED_SOURCES) {
      if (!c) dropped++;
      continue;
    }
    sources.push(c);
  }
  if (!sources.length && !theses.length) return { ok: false, reason: "the reading named no page it came from" };
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 300) : null;
  return { ok: true, dropped, creed: creedSchema.parse({ id, summary: summary.slice(0, 600), styles, tests, theses, sources, readAt, model, error: null, note, version: CREED_VERSION }) };
}

/** The number is written in the words, as a whole number or with its decimals: "above 15%" carries 15; a level the words do not show is never kept. */
export function printedIn(words: string, n: number): boolean {
  const forms = new Set([String(n), n.toFixed(1), n.toFixed(2)].map((f) => f.replace(/^(-?\d+)\.0+$/, "$1").replace(/(\.\d*?)0+$/, "$1")));
  return [...forms].some((f) => new RegExp(`(^|[^0-9.])${f.replace(".", "\\.")}(?![0-9])`).test(words));
}

/** A read that did not come back: the last good creed stays, marked so it is tried again a week on; with none, a sentence. */
export function failedCreed(kept: FundCreed | undefined, id: string, at: string, reason: string): FundCreed {
  if (kept && !kept.error) return { ...kept, failedAt: at };
  return creedSchema.parse({ id, summary: "", styles: [], tests: [], theses: [], sources: [], readAt: at, model: null, error: reason.slice(0, 300), note: null });
}

// ---------------------------------------------------------------------------
// The person's side, with no model

export type Lens = {
  /** Each figure group the classes test, and which way; a group tested both ways is left out. */
  tests: Map<string, "higher" | "lower">;
  styles: Set<StyleId>;
  /** The companies the person holds a thesis on: the stock theses with words and the market theses' baskets. */
  tickers: Set<string>;
  themes: Set<ThemeId>;
};

/** The person's approach read from their methodology's classes, and their theses' companies and themes. */
export function lensOf(m: Pick<Methodology, "classes"> | null, theses: Pick<ThesesFile, "bySymbol" | "markets"> | null): Lens {
  const seen = new Map<string, Set<"higher" | "lower">>();
  for (const c of m?.classes ?? [])
    for (const f of classFilters(c)) {
      const g = groupOfField(f.field);
      if (!g || typeof f.value !== "number") continue;
      const want = f.is === "gt" || f.is === "gte" ? "higher" : f.is === "lt" || f.is === "lte" ? "lower" : null;
      if (!want) continue;
      seen.set(g.group, (seen.get(g.group) ?? new Set()).add(want));
    }
  const tests = new Map<string, "higher" | "lower">();
  for (const [g, ws] of seen) if (ws.size === 1) tests.set(g, [...ws][0]);
  const styles = new Set<StyleId>();
  for (const [g, want] of tests) {
    const def = CREED_FIELDS.find((x) => x.group === g)!;
    if (def.want === want) styles.add(def.style);
  }
  const tickers = new Set<string>();
  for (const [sym, t] of Object.entries(theses?.bySymbol ?? {})) if (t.text.trim()) tickers.add(sym.toUpperCase());
  const themes = new Set<ThemeId>();
  for (const mt of theses?.markets ?? []) {
    for (const s of mt.basket) tickers.add(s.toUpperCase());
    for (const th of themesOf(`${mt.title}\n${mt.text}`)) themes.add(th);
  }
  return { tests, styles, tickers, themes };
}

/** The styles a creed carries: those it names and those its figures imply. */
export function creedStyles(c: FundCreed): Set<StyleId> {
  const out = new Set<StyleId>(c.styles);
  for (const t of c.tests) {
    const def = CREED_FIELDS.find((x) => x.group === t.group);
    if (def && def.want === t.want) out.add(def.style);
  }
  return out;
}

export type CreedMatch = {
  /** The share of the person's approach the fund says it shares, less what it says the other way, 0 to 100; null when the classes test nothing it can be laid on. */
  approach: number | null;
  agree: string[];
  against: string[];
  styles: StyleId[];
  /** The companies both hold a thesis on, and the themes both write about. */
  tickers: string[];
  themes: ThemeId[];
};

/**
 * How close a fund's creed is to the person: each figure the person's classes
 * test counts twice and each style once; a figure the fund says it wants the
 * same way counts in full, one it wants the other way counts against, and
 * each style it carries counts. The theses both hold are listed apart.
 */
export function creedMatch(c: FundCreed | null | undefined, lens: Lens): CreedMatch | null {
  if (!c || c.error) return null;
  const agree: string[] = [];
  const against: string[] = [];
  for (const t of c.tests) {
    const mine = lens.tests.get(t.group);
    if (!mine) continue;
    (mine === t.want ? agree : against).push(t.group);
  }
  const theirs = creedStyles(c);
  const styles = [...lens.styles].filter((s) => theirs.has(s));
  const of = lens.tests.size * 2 + lens.styles.size;
  const approach = of ? Math.max(0, Math.min(100, ((agree.length * 2 + styles.length - against.length * 2) / of) * 100)) : null;
  const tickers = [...new Set(c.theses.map((t) => t.ticker).filter((t): t is string => !!t && lens.tickers.has(t)))];
  const themes = [...new Set(c.theses.flatMap((t) => [t.theme, ...themesOf(`${t.title} ${t.words}`)]).filter((t): t is ThemeId => !!t && lens.themes.has(t)))];
  return { approach, agree, against, styles, tickers, themes };
}

export type CreedRank = { id: string; match: CreedMatch | null };

/** The funds by how close they say they are: approach, then the theses both hold, then the name; a fund with no reading last. */
export function rankByCreed(ids: readonly { id: string; name: string }[], creeds: Creeds, lens: Lens): CreedRank[] {
  const rows = ids.map((f) => ({ ...f, match: creedMatch(creeds[f.id], lens) }));
  const score = (r: (typeof rows)[number]) => (r.match ? (r.match.approach ?? 0) : -1);
  const shared = (r: (typeof rows)[number]) => (r.match ? r.match.tickers.length + r.match.themes.length : 0);
  return rows.sort((a, b) => score(b) - score(a) || shared(b) - shared(a) || a.name.localeCompare(b.name)).map(({ id, match }) => ({ id, match }));
}

/** A label inside a sentence: lower case, but an acronym (AI) as it is. */
const inSentence = (label: string) => (/^[A-Z]{2}/.test(label) ? label : `${label[0].toLowerCase()}${label.slice(1)}`);

/** The match in a sentence: what the fund shares with the person's approach, what it says the other way, and the theses both hold. */
export function matchWords(m: CreedMatch, lens: Lens): string {
  const parts: string[] = [];
  if (m.agree.length) parts.push(`looks for ${m.agree.map((g) => `${lens.tests.get(g)} ${groupLabel(g).toLowerCase()}`).join(", ")} as your classes do`);
  if (m.against.length) parts.push(`wants ${m.against.map((g) => groupLabel(g).toLowerCase()).join(", ")} the other way`);
  if (m.styles.length) parts.push(`${m.styles.map((s) => styleLabel(s).toLowerCase()).join(", ")}, like yours`);
  if (m.tickers.length) parts.push(`a thesis on ${m.tickers.join(", ")}, as you have`);
  if (m.themes.length) parts.push(`writes on ${m.themes.map((t) => inSentence(themeLabel(t))).join(", ")}, as your market theses do`);
  const words = parts.join("; ");
  return words ? `${words[0].toUpperCase()}${words.slice(1)}.` : "Says nothing your classes or theses test.";
}


// ---------------------------------------------------------------------------
// On the marketplace (Hamza, 9 Nov 2026: "add the top fund's methodologies
// and theses to the methodology and theses marketplace")

export type FundName = { id: string; name: string; manager: string };

/** A fund's name and manager: as its 13F reading keeps them, else as the list of funds names them; null for an id neither knows. */
export function fundNameOf(id: string, file: FundsFile | null): FundName | null {
  const f = file?.byId[id] ?? FUNDS.find((d) => d.id === id);
  return f ? { id, name: f.name, manager: f.manager } : null;
}

/** The section a rule taken from a fund's own words cites: what it states, never a section of a document the person has. */
export const STATED_SECTION = "Stated";

/**
 * A fund's creed as a methodology to adopt as a draft: its summary, each
 * figure it says it looks for as a guideline the person checks, and, when it
 * states levels, one class whose criteria are those levels on the ontology's
 * fields; the person's own figures and dashboard stay. Credited to the fund
 * through `lineage`. No level is made up: a figure stated without a number
 * is a rule to check, never a criterion. Null for a creed with no reading.
 */
export function creedMethodology(c: FundCreed | null | undefined, fund: FundName, base: { figures: Figure[]; dashboard: Dashboard }): Methodology | null {
  if (!c || c.error || !c.summary) return null;
  const levelled = c.tests.filter((t) => typeof t.level === "number" && t.field && (FIELDS as Record<string, unknown>)[t.field]);
  const classes = levelled.length
    ? [{ id: "fund-fit", label: `As ${fund.name} says it buys`.slice(0, 60), about: "The levels it states on its own pages, each on a figure the filings read.".slice(0, 200), criteria: levelled.slice(0, 8).map((t) => ({ field: t.field as FieldId, is: (t.want === "higher" ? "gte" : "lte") as "gte" | "lte", value: t.level as number })) }]
    : [];
  const rules = c.tests.map((t) => ({ id: `stated-${t.group}`.slice(0, 40), section: STATED_SECTION, text: `${groupLabel(t.group)}, ${t.want === "higher" ? "the higher the better" : "the lower the better"}: ${t.words}`.slice(0, 300), severity: "guideline" as const, test: null }));
  const r = methodologySchema.safeParse({
    name: `${fund.name}'s approach`.slice(0, 80),
    adopted: null,
    summary: c.summary.slice(0, 600),
    figures: base.figures,
    classes,
    rules,
    dashboard: base.dashboard,
    gaps: [],
    source: { title: `${fund.name}, from its own letters and pages`.slice(0, 120), fileId: null },
    origin: "library",
    lineage: { parent: fund.name.slice(0, 120), credit: fund.manager.slice(0, 120), source: "market" },
  });
  return r.success ? r.data : null;
}

/** What a fund's approach brings, in a line. */
export function creedMethodWords(c: FundCreed): string {
  const levelled = c.tests.filter((t) => typeof t.level === "number").length;
  const styles = [...creedStyles(c)].map((s) => styleLabel(s).toLowerCase());
  return [`${c.tests.length} ${c.tests.length === 1 ? "figure" : "figures"} it looks for`, levelled ? `${levelled} with a stated level, as a class` : "no level stated, so no class", styles.length ? styles.join(", ") : null].filter(Boolean).join(" · ");
}

/** A stated thesis, found again by its fund and place on the shelf; the words are always the kept reading's, never a form's. */
export function creedThesis(creeds: Creeds, fundId: string, index: number): FundCreed["theses"][number] | null {
  const c = creeds[fundId];
  return c && !c.error ? (c.theses[index] ?? null) : null;
}

/** The evidence entry a fund's stated thesis leaves: the fund and its page as the source, its words as the summary, added by the person. */
export function fundThesisEntry(t: FundCreed["theses"][number], fund: Pick<FundName, "name">, today: string): Omit<Evidence, "id" | "call"> {
  return { at: today, source: `${fund.name}: ${t.source.title}`.slice(0, 200), kind: "document", summary: `${t.title}. ${t.words} ${t.source.url}`.slice(0, 1500), changes: null, via: "you" };
}

/** Whether the person already took this thesis in: an entry on file carries its page. */
export function fundThesisTaken(theses: Pick<ThesesFile, "bySymbol" | "markets"> | null, t: FundCreed["theses"][number]): boolean {
  const all = [...Object.values(theses?.bySymbol ?? {}), ...(theses?.markets ?? [])];
  return all.some((x) => x.evidence.some((e) => e.summary.includes(t.source.url)));
}

export type ThesisTaken = { file: ThesesFile; kind: "stock" | "market"; key: string; started: boolean };

/**
 * A fund's stated thesis taken into the person's theses: on a company, its
 * folder (started with the fund's words, credited, when it has none yet) and
 * an evidence entry; on a theme, a market thesis under its title (started
 * the same way) or, when one by that title is on file, an entry on it. The
 * person's own words are never replaced. Throws a sentence at the market
 * theses' limit.
 */
export function takeFundThesis(file: ThesesFile, t: FundCreed["theses"][number], fund: Pick<FundName, "name">, now: Date, today: string): ThesisTaken {
  const iso = now.toISOString();
  const entry = fundThesisEntry(t, fund, today);
  const opening = `${t.title}. ${t.words}\n\nAs ${fund.name} states it: ${t.source.url}`.slice(0, 6000);
  if (t.ticker) {
    const prev = thesisFor(file, t.ticker);
    const started = !prev?.text.trim();
    const base = prev ?? { ...EMPTY_THESIS, updatedAt: iso };
    const thesis = withEvidence(started ? { ...base, text: opening } : base, entry, iso);
    return { file: withThesis(file, t.ticker, thesis, iso), kind: "stock", key: t.ticker, started };
  }
  const prev = marketThesisFor(file, t.title);
  if (prev) return { file: withMarketThesis(file, prev.id, withEvidence(prev, entry, iso), iso), kind: "market", key: prev.id, started: false };
  if (file.markets.length >= MAX_MARKET_THESES) throw new Error(`There are already ${MAX_MARKET_THESES} market theses; remove one before adding another.`);
  let id = marketThesisId(t.title);
  for (let n = 2; file.markets.some((m) => m.id === id); n++) id = `${marketThesisId(t.title).slice(0, 36)}-${n}`;
  const thesis = withEvidence({ id, title: t.title.slice(0, 120), text: opening, pillars: [], watch: [], evidence: [], figures: [], basket: [], since: null, updatedAt: iso }, entry, iso);
  return { file: withMarketThesis(file, id, thesis, iso), kind: "market", key: id, started: true };
}
