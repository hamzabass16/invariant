/**
 * What happened in the last US session, written by the person's own Claude
 * from the web: the alternative to a recap newsletter, for anyone who would
 * rather not subscribe to one. One call per session, after the close, on the
 * person's own key (the Anthropic web search tool, a few searches); every
 * point names the page it came from, and the session's own figures (the
 * indices, the biggest movers, each holding's move) come from the app's read
 * of the close, never from the model. The same call explains why each of
 * the person's listed holdings moved; a move of their alert (MOVE_ALERT_PCT unless they set their own) or more is
 * explained from a page of that day, and becomes an alert (`moveNotices`). A recap that could not be written keeps a sentence. Pure:
 * the call is made in lib/market-recap-run.ts.
 *
 * Also the recap newsletters the app guides a person to: a known daily recap,
 * its free sign-up page and the address it is sent from, so the Gmail filter
 * can be written for them.
 */
import { z } from "zod";

import { MOVE_PREFIX } from "@/lib/alerts";
import type { Book } from "@/lib/holdings";
import { INVESTIGATIVE } from "@/lib/investigate";
import type { MarketDay } from "@/lib/market-day";
import { moveOn, movers } from "@/lib/market-day";
import type { MarketPoint } from "@/lib/markets";
import { LISTED_FOR_DAY } from "@/lib/ontology";
import { MODELS } from "@/lib/models";

/** Haiku first since the beta (Hamza, 9 Nov 2026), Sonnet when the check refuses the recap. */
export const RECAP_MODEL = MODELS.fast;
/** Web searches one recap may use; the person pays for them on their key. */
export const RECAP_MAX_SEARCHES = 5;
/** Recaps kept in the vault, newest first. */
export const KEEP_RECAPS = 30;
/** A holding that moved this much in a session, either way, is explained from a page of that day and alerted. */
export const MOVE_ALERT_PCT = 2;
/** The smallest move a person may set their own alert at (moveAlertPct in their preferences); there is no upper limit, and any move at or past it is an alert. */
export const MOVE_ALERT_MIN = 0.5;
/** Extra searches for the large moves, on top of the recap's own. */
const MOVE_SEARCHES = 5;
/** Holdings one recap explains, largest move first. */
const MAX_HOLDINGS = 40;

/** Where "What happened" comes from: the recap newsletters the person forwards, a recap their Claude writes, or both. */
export const recapChoiceSchema = z.object({ newsletter: z.boolean(), claude: z.boolean() });
export type RecapChoice = z.infer<typeof recapChoiceSchema>;
export const DEFAULT_RECAP: RecapChoice = { newsletter: true, claude: false };

/**
 * Daily recap newsletters the app knows how to guide a person to: free to
 * subscribe, sent each weekday after the close. `sender` is the From address
 * the Gmail filter catches.
 */
export const RECAP_NEWSLETTERS = [
  {
    id: "stockmktnewz",
    name: "StockMKTNewz Daily Recap",
    by: "Evan from StockMKTNewz",
    signUp: "https://www.stockmktnewz.com/",
    sender: "stockmktnewz@mail.beehiiv.com",
    arrives: "about two hours after the US close",
  },
] as const;

/** A daily recap newsletter the app guides a person to (one of RECAP_NEWSLETTERS, or the demo's own). */
export type RecapNewsletter = { readonly id: string; readonly name: string; readonly by: string; readonly signUp: string; readonly sender: string; readonly arrives: string };

/**
 * The demo's daily recap newsletter, invented (4 Nov 2026): the public demo
 * never names a real newsletter, its writer or its sender. Its issues are the
 * fictional "Closing Tape Recap" digests in data/samples/newsletters.json.
 */
export const DEMO_RECAP_NEWSLETTERS: readonly RecapNewsletter[] = [
  {
    id: "closing tape",
    name: "Closing Tape Daily Recap",
    by: "Rowan Vale of Closing Tape, a fictional writer",
    signUp: "https://example.com/closing-tape",
    sender: "recap@closing-tape.example.com",
    arrives: "about two hours after the US close",
  },
];

/** The recap newsletters a screen names: the real ones in a person's own app, the invented one in the demo. */
export const recapNewslettersFor = (demo: boolean): readonly RecapNewsletter[] => (demo ? DEMO_RECAP_NEWSLETTERS : RECAP_NEWSLETTERS);

const httpsUrl = z
  .string()
  .max(500)
  .refine((u) => /^https:\/\/[^\s/]+\.[^\s/]+/.test(u), "an https address");

const recapPointSchema = z.object({
  headline: z.string().min(1).max(120),
  line: z.string().min(1).max(400),
  /** Tickers the story is about, as the page names them. */
  symbols: z.array(z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/)).max(6).default([]),
  source: z.object({ title: z.string().min(1).max(160), url: httpsUrl }),
});
export type RecapPoint = z.infer<typeof recapPointSchema>;

const sourceSchema = z.object({ title: z.string().min(1).max(160), url: httpsUrl });

/** What the model records for one holding: why it moved, and the page that says so (none for a move that follows the market). */
const modelHoldingSchema = z.object({
  symbol: z.string().regex(/^[A-Z][A-Z0-9. -]{0,20}$/),
  why: z.string().min(1).max(400),
  source: sourceSchema.nullable(),
});

/** What the model records: a two-sentence summary, the session's stories, each with its page, and a line per holding. */
const modelReadingSchema = z.object({
  summary: z.string().min(1).max(600),
  points: z.array(recapPointSchema).min(1).max(8),
  holdings: z.array(modelHoldingSchema).max(MAX_HOLDINGS).default([]),
});

/** One holding's session as kept: the app's own move, and the model's reason. */
export const recapHoldingSchema = modelHoldingSchema.extend({ name: z.string().max(120), changePct: z.number() });
export type RecapHolding = z.infer<typeof recapHoldingSchema>;

/** A recap as kept: the summary, the stories and, since holdings were added, each holding's move and reason. */
export const recapReadingSchema = z.object({
  summary: z.string().min(1).max(600),
  points: z.array(recapPointSchema).min(1).max(8),
  holdings: z.array(recapHoldingSchema).max(MAX_HOLDINGS).default([]),
});
export type RecapReading = z.infer<typeof recapReadingSchema>;

/** A listed holding's move in the session, as the app read it at the close. */
export type HoldingMove = { symbol: string; name: string; changePct: number };

export const recapSchema = z.object({
  /** The session the recap is of (New York date). */
  session: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  writtenAt: z.string(),
  /** written: the reading below; failed: a sentence, and the next run tries again. */
  status: z.enum(["written", "failed"]),
  sentence: z.string().max(400).nullable(),
  reading: recapReadingSchema.nullable(),
});
export type Recap = z.infer<typeof recapSchema>;

export const recapsFileSchema = z.object({
  version: z.literal(1),
  recaps: z.array(recapSchema).max(KEEP_RECAPS),
  updated: z.string(),
});
export type RecapsFile = z.infer<typeof recapsFileSchema>;
export const EMPTY_RECAPS: RecapsFile = { version: 1, recaps: [], updated: "" };

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(2)}%`;

/**
 * Each listed holding's move in the session: the session's own read where it
 * carries the symbol, the holding's own closes otherwise. A holding neither
 * prices is left out, never shown as flat.
 */
export function holdingMoves(book: Book | null, day: MarketDay, closes: Record<string, readonly MarketPoint[]> = {}): HoldingMove[] {
  if (!book) return [];
  const known = new Map([...day.moves, ...(day.others ?? [])].map((m) => [m.symbol.toUpperCase(), m.changePct]));
  const out = new Map<string, HoldingMove>();
  for (const h of book.holdings) {
    if (!LISTED_FOR_DAY.has(h.assetClass)) continue;
    const key = h.symbol.toUpperCase();
    if (out.has(key)) continue;
    const series = closes[h.symbol] ?? closes[key];
    const changePct = known.get(key) ?? (series ? (moveOn(series, day.session)?.changePct ?? null) : null);
    if (changePct === null || changePct === undefined) continue;
    out.set(key, { symbol: h.symbol, name: h.name, changePct });
  }
  return [...out.values()];
}

/** The listed symbols a person holds, once each, for the closes read. */
export function listedSymbols(book: Book | null): string[] {
  const out = new Map<string, string>();
  for (const h of book?.holdings ?? []) if (LISTED_FOR_DAY.has(h.assetClass) && !out.has(h.symbol.toUpperCase())) out.set(h.symbol.toUpperCase(), h.symbol);
  return [...out.values()].sort();
}

/** The holdings to explain, largest move first, at most MAX_HOLDINGS. */
export function movesToExplain(moves: readonly HoldingMove[]): HoldingMove[] {
  const seen = new Set<string>();
  return [...moves]
    .filter((m) => Number.isFinite(m.changePct) && !seen.has(m.symbol.toUpperCase()) && seen.add(m.symbol.toUpperCase()))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_HOLDINGS);
}

/** The session's own figures, as the app read them at the close, for the prompt: indices, the biggest movers, the person's holdings. */
export function sessionFacts(day: MarketDay, moves: readonly HoldingMove[] = []): string {
  const { gainers, losers } = movers(day, 5);
  const lines = [
    `Session: ${day.session}.`,
    day.indices.length ? `Indices: ${day.indices.map((i) => `${i.name} ${pct(i.changePct)}`).join(", ")}.` : "",
    gainers.length ? `Biggest S&P 500 gainers: ${gainers.map((m) => `${m.symbol}${m.name ? ` (${m.name})` : ""} ${pct(m.changePct)}`).join(", ")}.` : "",
    losers.length ? `Biggest S&P 500 losers: ${losers.map((m) => `${m.symbol}${m.name ? ` (${m.name})` : ""} ${pct(m.changePct)}`).join(", ")}.` : "",
    moves.length ? `The person's holdings: ${movesToExplain(moves).map((m) => `${m.symbol}${m.name ? ` (${m.name})` : ""} ${pct(m.changePct)}`).join(", ")}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * One session's recap. The model searches the web for that day's market
 * news, then records it by calling record_recap once. The figures above are
 * the close as the app read it; the model explains them, it never restates
 * a level of its own.
 */
export function recapRequestBody(day: MarketDay, model = RECAP_MODEL, moves: readonly HoldingMove[] = [], alertPct = MOVE_ALERT_PCT): Record<string, unknown> {
  const schema = z.toJSONSchema(modelReadingSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const listed = movesToExplain(moves);
  const big = listed.filter((m) => Math.abs(m.changePct) >= alertPct);
  const searches = RECAP_MAX_SEARCHES + Math.min(MOVE_SEARCHES, big.length);
  const holdingRules = listed.length
    ? `
- holdings: one entry for each of the person's holdings listed below, by its symbol as given, in one or two plain sentences on why it rose, fell or held flat that day. A move of ${alertPct}% or more either way (${big.length ? big.map((m) => m.symbol).join(", ") : "none today"}) is explained from a page published that day or the evening after, named in source; if no page explains it, say that no news that day explains it and leave source null. A smaller move may follow the market or its sector, said as such, with source null when no page is about the company. Never invent a cause.`
    : "";
  return {
    model,
    max_tokens: listed.length ? 8000 : 4000,
    system: `You write the daily recap of the US stock market session of ${day.session} for one person's portfolio app, by searching the web. At most ${searches} searches, for news published on that date or the evening after: what moved the indices, earnings, economic data, the Fed, why the biggest movers moved${big.length ? ", and why the person's holdings that moved most moved" : ""}.

Rules:
- The session's figures are given below, as the app read them at the close. Use them; never state another level or percentage for the indices or those movers.
- summary: two sentences at most, in plain words, on what drove the session.
- points: up to eight stories, the most important first, each a short headline and one line. A figure in a line is one the page you cite prints. Each point names the one page it came from, with its real https URL and title.
- Nothing from before ${day.session} unless a page that day ties it to the session. No opinion, no advice, no exclamation marks.
- symbols on a point: the tickers it is about. None is fine.${holdingRules}
${INVESTIGATIVE}
- Your whole answer is one call to record_recap; write nothing outside it.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: searches },
      { name: "record_recap", description: "Record the session's recap.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${sessionFacts(day, listed)}\n\nWrite the recap of this session${listed.length ? ", and why each of the person's holdings moved" : ""}.` }] }],
  };
}

export type RecapParse = { ok: true; reading: RecapReading } | { ok: false; reason: string; called: boolean };

/**
 * Reads the answer: the one record_recap call, validated; a point without a
 * page is not kept. Each holding line keeps the app's own move and name,
 * never a figure of the model's; a line for a symbol the person does not
 * hold is dropped, and the lines run largest move first.
 */
export function parseRecapResponse(body: unknown, moves: readonly HoldingMove[] = []): RecapParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_recap");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the recap", called: false };
  const parsed = modelReadingSchema.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)`, called: true };
  const points = parsed.data.points.map((p) => ({ ...p, symbols: [...new Set(p.symbols)] }));
  const said = new Map(parsed.data.holdings.map((h) => [h.symbol.toUpperCase(), h]));
  const holdings: RecapHolding[] = [];
  for (const m of movesToExplain(moves)) {
    const h = said.get(m.symbol.toUpperCase());
    if (h) holdings.push({ symbol: m.symbol, name: m.name, changePct: m.changePct, why: h.why, source: h.source });
  }
  return { ok: true, reading: { summary: parsed.data.summary, points, holdings } };
}

/** The holdings of a recap that moved the person's alert (MOVE_ALERT_PCT unless they set their own) or more, either way. */
export function bigMoves(reading: RecapReading | null, alertPct = MOVE_ALERT_PCT): RecapHolding[] {
  return (reading?.holdings ?? []).filter((h) => Math.abs(h.changePct) >= alertPct);
}

type MoveNotice = { key: string; date: string; tone: "info"; title: string; detail: string; href: string };

const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * A notice for each holding that moved the person's alert or more in the latest
 * written recap's session, with the reason and its page. Keyed by symbol and
 * session, so each move fires once and clears when the next session's
 * recap is written. A move is context, never a breach.
 */
export function moveNotices(file: RecapsFile | null, alertPct = MOVE_ALERT_PCT): MoveNotice[] {
  const latest = (file?.recaps ?? []).find((r) => r.status === "written");
  if (!latest) return [];
  return bigMoves(latest.reading, alertPct).map((h) => ({
    key: `${MOVE_PREFIX}${h.symbol.toUpperCase()}:${latest.session}`,
    date: latest.session,
    tone: "info" as const,
    title: `${h.symbol} ${h.changePct > 0 ? "rose" : "fell"} ${Math.abs(h.changePct).toFixed(1)}% on ${dayWords(latest.session)}`,
    detail: `${h.why}${h.source ? ` Source: ${h.source.title}.` : ""}`.slice(0, 500),
    href: "/",
  }));
}

/** The recap a session gets when it could not be written: the sentence alone, so the screen says so rather than looking empty. */
export function unwritten(session: string, why: string, now: Date): Recap {
  return { session, writtenAt: now.toISOString(), status: "failed", sentence: `Not written: ${why.replace(/\.$/, "")}.`.slice(0, 400), reading: null };
}

/** The file with one session's recap first, replacing an earlier attempt at the same session. */
export function keepRecap(file: RecapsFile, recap: Recap, now: Date): RecapsFile {
  const rest = file.recaps.filter((r) => r.session !== recap.session);
  return recapsFileSchema.parse({ version: 1, recaps: [recap, ...rest].sort((a, b) => b.session.localeCompare(a.session)).slice(0, KEEP_RECAPS), updated: now.toISOString() });
}

/** True when the session has no written recap yet; a failed one is tried again. */
export function recapDue(file: RecapsFile | null, session: string): boolean {
  return !(file?.recaps ?? []).some((r) => r.session === session && r.status === "written");
}

/** The recap to show: the session's own, else the latest written one, so the morning before the close still shows the last. */
export function recapFor(file: RecapsFile | null, session: string | null): { since: "close" | "latest"; recap: Recap } | null {
  const all = file?.recaps ?? [];
  const own = session ? all.find((r) => r.session === session) : undefined;
  if (own) return { since: "close", recap: own };
  const latest = all.find((r) => r.status === "written");
  return latest ? { since: "latest", recap: latest } : null;
}

/** The Gmail search that finds the known recap newsletters, for the filter. */
export function recapFilter(): string {
  return `from:(${RECAP_NEWSLETTERS.map((n) => n.sender).join(" OR ")})`;
}
