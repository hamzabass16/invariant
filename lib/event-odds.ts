/**
 * What the prediction markets bet on each calendar event (Hamza, 28 Oct
 * 2026: "the polymarket/kalshi integration for all fed, economic, election,
 * political events given there is sufficient liquidity and a relevant
 * appropriate question"). For each event the app asks Polymarket's search
 * and, where Kalshi lists the question, Kalshi, by the event's own words; it
 * keeps a market only when its question is the event's own (its title names
 * the bank and the month, the release and its month, the country's election,
 * the summit) and it settles with the event, and only when at least
 * MIN_TRADED dollars have traded on it. Of two, the deeper one wins
 * (lib/odds.ts, `deeperFed`, for the Fed). Nothing of the person is in any
 * request.
 *
 *   Polymarket  https://gamma-api.polymarket.com/public-search?q=bank%20of%20japan%20decision%20in%20october
 *               events: title, slug, endDate, closed, volume, openInterest, markets
 *               (groupItemTitle, outcomes, outcomePrices); verified 28 Oct 2026.
 *   Kalshi      https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXU3-26OCT
 *               markets: floor_strike, strike_type, yes_bid_dollars, yes_ask_dollars,
 *               last_price_dollars, volume_fp, open_interest_fp, close_time.
 *
 * Where the outcomes line up with the history the Calendar measures (a cut,
 * a hold or a hike; inflation higher or not than the reading before;
 * unemployment up or not), the prices are kept as `prices` under the
 * history's own labels, so the history at today's weights gives an expected
 * move. Any other question (who wins an election, GDP above a level) is
 * shown as what the markets bet on, beside the history, never weighed into
 * it. The markets' prices, never the app's forecast.
 *
 * Pure: the queries, the parsers and the choice. lib/markets-feed.ts fetches.
 */
import type { EconArea, EconEvent, EconKind } from "@/lib/econ-calendar";
import { CPI_HISTORY, JOBS_HISTORY } from "@/lib/event-history";
import type { FedOdds } from "@/lib/odds";
import { POLYMARKET_EVENT } from "@/lib/odds";

/** The money that must have traded on a market before its prices are used: below it a price says little. */
export const MIN_TRADED = 25_000;
/** The outcomes shown for a question that is not weighed into the history. */
export const MAX_SHOWN = 5;
/** The events looked up ahead: the calendar's next fortnight. */
export const ODDS_DAYS = 14;
/** How long a page waits for the markets before drawing without them. */
export const ODDS_BUDGET_MS = 8000;

/** An event's key for its bet on a screen: its day and name. */
export const betKey = (e: Pick<EconEvent, "date" | "name">) => `${e.date}:${e.name}`;

export type BetSource = "Kalshi" | "Polymarket";

export type EventBet = {
  source: BetSource;
  /** The market's own question. */
  title: string;
  url: string;
  /** Dollars traded on it, and still open; null when the market does not say. */
  traded: number | null;
  open: number | null;
  /** Its outcomes as chances, 0 to 1, the likeliest first. */
  outcomes: { label: string; p: number }[];
  /** The same chances under the history's own outcomes, adding to one; null when the question does not line up with them. */
  prices: Record<string, number> | null;
  /** The other market's depth on the same event, when it was read. */
  other: { source: BetSource; traded: number | null; open: number | null } | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthOf = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
/** The month a release reports on: the month before it comes out. */
const refMonth = (d: string) => {
  const m = Number(d.slice(5, 7)) - 1;
  const y = Number(d.slice(0, 4));
  return m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BANKS: Partial<Record<EconKind, { query: string; title: (month: string) => RegExp }>> = {
  ecb: { query: "ecb decision in", title: (m) => new RegExp(`^\\s*ECB (interest rates?:? ${m}\\b|(rate )?decision in ${m}\\b)`, "i") },
  boe: { query: "bank of england decision in", title: (m) => new RegExp(`^\\s*Bank of England (rate )?decision in ${m}\\b`, "i") },
  boj: { query: "bank of japan decision in", title: (m) => new RegExp(`^\\s*Bank of Japan (rate )?decision in ${m}\\b`, "i") },
  boc: { query: "bank of canada decision in", title: (m) => new RegExp(`^\\s*Bank of Canada (rate )?decision in ${m}\\b`, "i") },
  snb: { query: "swiss national bank decision in", title: (m) => new RegExp(`^\\s*Swiss National Bank (rate )?decision in ${m}\\b`, "i") },
};

const countryOf = (area: EconArea) => ({ us: "US", euro: "Euro area", uk: "UK", japan: "Japan", canada: "Canada", switzerland: "Switzerland", france: "France", mexico: "Mexico", israel: "Israel", argentina: "Argentina", china: "China", world: "" })[area];

/** Kalshi's question for an election, where it lists one: its series, the event ticker carrying the election day. */
export const KALSHI_ELECTIONS: Partial<Record<EconArea, string>> = { israel: "KXISRAELPM" };

/** What to ask each market for an event, or null for a question neither lists. */
export type OddsQuery = { polymarket: string | null; kalshi: string | null };

const PM = (q: string) => `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=20`;
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2/markets";
const kalshiDay = (d: string) => `${d.slice(2, 4)}${MON[Number(d.slice(5, 7)) - 1]}${d.slice(8, 10)}`;
const kalshiMonth = (y: number, m: number) => `${String(y).slice(2)}${MON[m]}`;

export function oddsQuery(e: Pick<EconEvent, "kind" | "area" | "date" | "short" | "name">): OddsQuery | null {
  const bank = BANKS[e.kind];
  if (bank) return { polymarket: PM(`${bank.query} ${monthOf(e.date).toLowerCase()}`), kalshi: null };
  const ref = refMonth(e.date);
  switch (e.kind) {
    case "cpi":
      return e.area === "us" ? { polymarket: PM(`${MONTHS[ref.m].toLowerCase()} inflation us annual`), kalshi: `${KALSHI}?event_ticker=KXCPIYOY-${kalshiMonth(ref.y, ref.m)}&limit=100` } : null;
    case "jobs":
      return e.area === "us" ? { polymarket: null, kalshi: `${KALSHI}?event_ticker=KXU3-${kalshiMonth(ref.y, ref.m)}&limit=100` } : null;
    case "pce":
      return e.area === "us" ? { polymarket: PM(`core pce yoy ${MONTHS[ref.m].toLowerCase()} ${ref.y}`), kalshi: null } : null;
    case "gdp":
      return e.area === "us" ? { polymarket: null, kalshi: `${KALSHI}?series_ticker=KXGDP&status=open&limit=100` } : null;
    case "election": {
      const series = KALSHI_ELECTIONS[e.area];
      return { polymarket: PM(`${countryOf(e.area)} election`), kalshi: series ? `${KALSHI}?event_ticker=${series}-${kalshiDay(e.date)}&limit=100` : null };
    }
    case "summit":
    case "opec":
    case "deadline": {
      const words = e.kind === "opec" ? "OPEC" : e.short;
      return words ? { polymarket: PM(words), kalshi: null } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Polymarket

type PmMarket = { label: string; p: number };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);

const yesOf = (m: Record<string, unknown>): number | null => {
  try {
    const outcomes = JSON.parse(typeof m.outcomes === "string" ? m.outcomes : '["Yes","No"]') as string[];
    const prices = (JSON.parse(m.outcomePrices as string) as string[]).map(Number);
    const yes = prices[Math.max(0, outcomes.findIndex((o) => /^yes$/i.test(o)))];
    return Number.isFinite(yes) ? Math.min(1, Math.max(0, yes)) : null;
  } catch {
    return null;
  }
};

/** The event the search holds for this one: its title the event's own question, open, ending in the window. */
function pmEvent(json: unknown, test: (title: string) => boolean, from: string, to: string): { title: string; url: string; traded: number | null; open: number | null; markets: PmMarket[] } | null {
  const events = (json as { events?: unknown } | null)?.events ?? json;
  if (!Array.isArray(events)) throw new Error("no events");
  const found = (events as Record<string, unknown>[])
    .filter((x) => typeof x.title === "string" && test(x.title) && x.closed !== true && typeof x.slug === "string" && typeof x.endDate === "string" && x.endDate.slice(0, 10) >= from && x.endDate.slice(0, 10) <= to)
    .sort((a, b) => num(b.volume) - num(a.volume))[0];
  if (!found) return null;
  const markets: PmMarket[] = [];
  for (const m of Array.isArray(found.markets) ? (found.markets as Record<string, unknown>[]) : []) {
    if (m.closed === true) continue;
    const p = yesOf(m);
    const label = typeof m.groupItemTitle === "string" && m.groupItemTitle.trim() ? m.groupItemTitle.trim() : typeof m.question === "string" ? m.question.trim() : "";
    if (p === null || !label) continue;
    markets.push({ label: label.slice(0, 80), p });
  }
  if (!markets.length) return null;
  return { title: (found.title as string).slice(0, 200), url: POLYMARKET_EVENT(found.slug as string), traded: num(found.volume) || null, open: num(found.openInterest) || null, markets };
}

/** A bucket's level for "higher than" ("≤3.2%", "3.3%", "≥3.9%", "0.7% to 0.8%"): the lowest value it holds, and whether the bucket is open below. */
function bucketOf(label: string): { low: number; below: boolean } | null {
  const nums = [...label.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return null;
  return { low: nums[0], below: /[≤<]|or less|or below/i.test(label) };
}

/** The chance the reading comes out above `before`, from buckets of the reading. */
const higherFromBuckets = (markets: readonly PmMarket[], before: number): number | null => {
  let up = 0;
  let sum = 0;
  for (const m of markets) {
    const b = bucketOf(m.label);
    if (!b) return null;
    sum += m.p;
    if (!b.below && b.low > before + 1e-9) up += m.p;
  }
  return sum > 0 ? up / sum : null;
};

const shares = (r: Record<string, number>): Record<string, number> | null => {
  const sum = Object.values(r).reduce((s, x) => s + x, 0);
  return sum > 0 ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v / sum])) : null;
};

/** Cut, hold or hike from a decision event's outcome labels. */
export function decisionPrices(markets: readonly PmMarket[]): Record<string, number> | null {
  const r = { Cut: 0, Hold: 0, Hike: 0 };
  let read = 0;
  for (const m of markets) {
    if (/no change|hold|unchanged/i.test(m.label)) r.Hold += m.p;
    else if (/decrease|cut|lower/i.test(m.label)) r.Cut += m.p;
    else if (/increase|hike|raise/i.test(m.label)) r.Hike += m.p;
    else continue;
    read += 1;
  }
  return read ? shares(r) : null;
}

/** The last reading the history holds for a kind, the one the next is compared with. */
export function lastReading(kind: EconKind): number | null {
  if (kind === "cpi") return CPI_HISTORY.at(-1)?.[1] ?? null;
  if (kind === "jobs") return JOBS_HISTORY.at(-1)?.[2] ?? null;
  return null;
}

const outcomesOf = (markets: readonly PmMarket[]) => [...markets].sort((a, b) => b.p - a.p).slice(0, MAX_SHOWN);

/** Polymarket's market on an event, or null when the search holds none that is its own question. */
export function polymarketBet(json: unknown, e: Pick<EconEvent, "kind" | "area" | "date" | "short" | "name">): EventBet | null {
  const bank = BANKS[e.kind];
  const month = monthOf(e.date);
  const ref = refMonth(e.date);
  let found: ReturnType<typeof pmEvent> = null;
  let prices: Record<string, number> | null = null;
  if (bank) {
    found = pmEvent(json, (t) => bank.title(month).test(t), e.date, addDays(e.date, 3));
    prices = found ? decisionPrices(found.markets) : null;
  } else if (e.kind === "cpi") {
    found = pmEvent(json, (t) => new RegExp(`^\\s*${MONTHS[ref.m]} inflation US\\s*-\\s*annual`, "i").test(t), e.date, addDays(e.date, 3));
    const before = lastReading("cpi");
    const up = found && before !== null ? higherFromBuckets(found.markets, before) : null;
    prices = up === null ? null : { "Inflation higher": up, "Inflation not higher": 1 - up };
  } else if (e.kind === "pce") {
    found = pmEvent(json, (t) => new RegExp(`^\\s*core pce yoy\\s*-\\s*${MONTHS[ref.m]} ${ref.y}`, "i").test(t), e.date, addDays(e.date, 3));
  } else if (e.kind === "election") {
    const country = countryOf(e.area);
    if (!country) return null;
    found = pmEvent(json, (t) => new RegExp(`\\b${esc(country)}\\b`, "i").test(t) && /election|prime minister|president|parliament|knesset|winner/i.test(t), e.date, addDays(e.date, 400));
  } else if (e.kind === "summit" || e.kind === "opec" || e.kind === "deadline") {
    const words = e.kind === "opec" ? "OPEC" : e.short;
    if (!words) return null;
    found = pmEvent(json, (t) => new RegExp(`\\b${esc(words)}\\b`, "i").test(t), e.date, addDays(e.date, 7));
  }
  if (!found) return null;
  return { source: "Polymarket", title: found.title, url: found.url, traded: found.traded, open: found.open, outcomes: outcomesOf(found.markets), prices, other: null };
}

// ---------------------------------------------------------------------------
// Kalshi

type KMarket = { label: string; question: string | null; strike: number | null; p: number; volume: number; open: number; closes: string; event: string };

const price = (v: unknown): number | null => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : typeof v === "number" && Number.isFinite(v) ? v : null);

/** Kalshi's markets in a list: each one's label, level, yes price (the bid and ask's middle, else the last trade), money traded and open. */
export function kalshiMarkets(json: unknown): KMarket[] {
  const markets = (json as { markets?: unknown } | null)?.markets;
  if (!Array.isArray(markets)) throw new Error("no markets");
  const out: KMarket[] = [];
  for (const m of markets as Record<string, unknown>[]) {
    if (m.status && !["active", "open", "initialized"].includes(String(m.status))) continue;
    const bid = price(m.yes_bid_dollars) ?? (typeof m.yes_bid === "number" ? m.yes_bid / 100 : null);
    const ask = price(m.yes_ask_dollars) ?? (typeof m.yes_ask === "number" ? m.yes_ask / 100 : null);
    const last = price(m.last_price_dollars) ?? (typeof m.last_price === "number" ? m.last_price / 100 : null);
    const p = bid !== null && ask !== null && ask > 0 && ask >= bid ? (bid + ask) / 2 : last;
    const closes = typeof m.close_time === "string" ? m.close_time : null;
    if (p === null || !closes || typeof m.event_ticker !== "string") continue;
    const strike = m.strike_type === "greater" || m.strike_type === undefined ? (price(m.floor_strike) ?? null) : null;
    const label = [m.yes_sub_title, m.subtitle, m.title].find((x): x is string => typeof x === "string" && x.trim() !== "")?.trim() ?? String(m.ticker ?? "");
    out.push({ label: label.slice(0, 80), question: typeof m.title === "string" && m.title.trim() ? m.title.trim().slice(0, 200) : null, strike, p: Math.min(1, Math.max(0, p)), volume: num(m.volume_fp ?? m.volume), open: num(m.open_interest_fp ?? m.open_interest), closes, event: m.event_ticker });
  }
  return out;
}

/** Kalshi's market on an event, or null when it lists none for it. */
export function kalshiBet(json: unknown, e: Pick<EconEvent, "kind" | "area" | "date">): EventBet | null {
  let ms = kalshiMarkets(json);
  if (e.kind === "gdp") {
    // The series lists every release ahead; the one settled with this one closes within days of it.
    const ev = [...new Set(ms.filter((m) => m.closes.slice(0, 10) >= e.date && m.closes.slice(0, 10) <= addDays(e.date, 3)).map((m) => m.event))][0];
    ms = ev ? ms.filter((m) => m.event === ev) : [];
  }
  if (!ms.length) return null;
  const traded = ms.reduce((s, m) => s + m.volume, 0);
  const open = ms.reduce((s, m) => s + m.open, 0);
  const strikes = ms.filter((m) => m.strike !== null).sort((a, b) => a.strike! - b.strike!);
  let prices: Record<string, number> | null = null;
  let outcomes: { label: string; p: number }[];
  if (strikes.length && (e.kind === "cpi" || e.kind === "jobs" || e.kind === "gdp")) {
    // "Above a level" falls as the level rises: each held at or below the one before.
    for (let i = 1; i < strikes.length; i++) strikes[i] = { ...strikes[i], p: Math.min(strikes[i].p, strikes[i - 1].p) };
    const before = lastReading(e.kind);
    const at = before === null ? undefined : strikes.find((m) => Math.abs(m.strike! - before) < 1e-6);
    if (at) prices = e.kind === "cpi" ? { "Inflation higher": at.p, "Inflation not higher": 1 - at.p } : e.kind === "jobs" ? { "Unemployment up": at.p, "Unemployment not up": 1 - at.p } : null;
    const unit = "%";
    outcomes = [...strikes].sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)).slice(0, MAX_SHOWN).sort((a, b) => a.strike! - b.strike!).map((m) => ({ label: `Above ${m.strike!.toFixed(1)}${unit}`, p: m.p }));
  } else outcomes = [...ms].sort((a, b) => b.p - a.p).slice(0, MAX_SHOWN).map((m) => ({ label: m.label, p: m.p }));
  const title = { cpi: "CPI, 12 months", jobs: "Unemployment rate", gdp: "Real GDP growth, annualised" }[e.kind as "cpi" | "jobs" | "gdp"] ?? ms[0].question ?? "Kalshi's market on the event";
  const page = `https://kalshi.com/markets/${ms[0].event.split("-")[0].toLowerCase()}`;
  return { source: "Kalshi", title, url: page, traded, open, outcomes, prices, other: null };
}

// ---------------------------------------------------------------------------
// The choice, and the words

/** The Fed's reading (lib/odds.ts) as an event's bet. */
export function fedBet(f: FedOdds): EventBet {
  const prices = { Cut: f.cut / 100, Hold: f.hold / 100, Hike: f.hike / 100 };
  return {
    source: f.source,
    title: f.source === "Polymarket" ? "The Fed's decision" : "Federal funds rate after the meeting",
    url: f.url,
    traded: f.traded,
    open: f.open,
    outcomes: Object.entries(prices).map(([label, p]) => ({ label, p })).sort((a, b) => b.p - a.p),
    prices: shares(prices),
    other: f.other,
  };
}

const deep = (b: EventBet) => (b.traded ?? 0) >= MIN_TRADED;

/**
 * The bet used for an event: of the markets read, those with MIN_TRADED or
 * more traded, the one whose outcomes line up with the history first, then
 * the deeper by money traded, then open; the other's depth kept beside it.
 */
export function chooseBet(bets: readonly (EventBet | null)[]): EventBet | null {
  const read = bets.filter((b): b is EventBet => b !== null);
  const ok = read.filter(deep).sort((a, b) => Number(!!b.prices) - Number(!!a.prices) || (b.traded ?? 0) - (a.traded ?? 0) || (b.open ?? 0) - (a.open ?? 0));
  const win = ok[0];
  if (!win) return null;
  const lose = read.find((b) => b !== win) ?? null;
  return { ...win, other: lose ? { source: lose.source, traded: lose.traded, open: lose.open } : win.other };
}

const dollars = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);

/** Whose market and how deep, in a sentence. */
export function betSourceWords(b: Pick<EventBet, "source" | "traded" | "open" | "other">): string {
  const depth = (t: number | null, o: number | null) => [t !== null ? `${dollars(t)} traded` : null, o !== null ? `${dollars(o)} open` : null].filter(Boolean).join(" and ");
  const own = depth(b.traded, b.open);
  if (!b.other) return `${b.source}'s market${own ? `, with ${own}` : ""}.`;
  const other = depth(b.other.traded, b.other.open).replace(/ traded| open/g, "");
  return `${b.source}'s market, the deeper on this event${own ? `: ${own}` : ""}${other ? `, against ${other} on ${b.other.source}` : ""}.`;
}

/** Why an event has no bet shown, when it was asked for one. */
export const noBetWords = (read: readonly (EventBet | null)[]) => {
  const thin = read.filter((b): b is EventBet => b !== null);
  return thin.length ? `The markets on it have under ${dollars(MIN_TRADED)} traded (${thin.map((b) => `${b.source} ${dollars(b.traded ?? 0)}`).join(", ")}), too little to read as a chance.` : "Neither Kalshi nor Polymarket lists a question that is this event's own.";
};

/** What a screen draws for an event's bet. */
export type BetView = { source: BetSource; title: string; url: string; outcomes: { label: string; pct: string }[]; words: string; weighed: boolean };

export function betView(b: EventBet): BetView {
  return {
    source: b.source,
    title: b.title,
    url: b.url,
    outcomes: b.outcomes.map((o) => ({ label: o.label, pct: `${(o.p * 100).toFixed(o.p < 0.1 ? 1 : 0)}%` })),
    words: betSourceWords(b),
    weighed: !!b.prices,
  };
}

/** The outcomes kept on a report: the history's labels where they line up, else the market's own. */
export const pricedOf = (b: EventBet): Record<string, number> => b.prices ?? Object.fromEntries(b.outcomes.map((o) => [o.label, o.p]));
