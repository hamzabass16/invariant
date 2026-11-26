/**
 * The skeleton, filled. The ontology names the screens and their slots
 * (lib/ontology.ts SCREENS, SLOTS) and what switches each on; this module
 * reads a methodology and a book and says which are on, and derives what the
 * HCMP OS screens showed from the methodology's own elements:
 *
 *   - caps: a rule that caps the weight of a holding or a class;
 *   - weights: every listed holding's weight against the cap its class gets;
 *   - signals: every tested rule as a reading per holding, red to clear;
 *   - needs you: breaches with their holding, watches tripped, dated items;
 *   - clocks and dates: rules on days in a standing, expiries, maturities;
 *   - notices: what changed, by day, for the Notifications screen.
 *
 * Nothing here is specific to one investing style: a cap is any rule of the
 * cap shape, a benchmark is whatever symbol a series figure names. Pure.
 */
import type { DecisionsFile } from "@/lib/decisions";
import type { FilingsFile } from "@/lib/filings";
import { paysDividends } from "@/lib/dividends";
import type { Book, Holding } from "@/lib/holdings";
import { marketSymbolsIn } from "@/lib/markets";
import type { Finding, Methodology, Rule, Section } from "@/lib/methodology";
import { DEFAULT_PRACTICES, FIELDS, PERIOD_WORDS, FUNDAMENTAL_FIELDS, ownerValueOf, PRACTICES, SCREEN_IDS, SCREENS, SLOTS, type EvalCtx, type FieldId, type Period, type Practice, type ScreenId, type ShownWhen, type SlotId } from "@/lib/ontology";
import type { Records } from "@/lib/preferences";
import type { ResearchFile } from "@/lib/research";
import type { Figure, MeasureSpec } from "@/lib/recipes";

// ---------------------------------------------------------------------------
// What is on

/** The conditions, then the practices: a screen or slot tied to a practice needs both. */
export type Shown = Record<ShownWhen | Practice, boolean>;

/**
 * How a document that names a practice says it, for a methodology recorded
 * before the drafter wrote `practices` down: its rules, summary and section
 * labels are read for these words. A methodology that carries `practices` is
 * taken at its word.
 */
const PRACTICE_WORDS: Record<Practice, RegExp> = {
  decision_log: /decision log|\bjournal|\blogged\b|\blog (each|every|the)\b|\bvotes?\b|\bvoted\b|\bIC\b|investment committee|written (reason|rationale|thesis)|\bwaiver/i,
  trade_log: /trade (log|journal)|trading (log|journal)|win rate|hit rate|profit factor|holding period|days held|buy dollars|every (buy|sell|trade)|each (buy|sell|trade)|turnover/i,
  trade_check: /new money|pre-?trade|before (any|each|every|a|the)? ?(new )?(purchase|buy|trade|order|investment)|no investment (after|until|before)|purchase must|a new [\w ]{0,40}purchase|trade check/i,
  todo_list: /within \d+ days|probation|\bfiled\b|re-?test|\bvotes?\b|refreshed|by the next|at the next quarterly|to-?do/i,
};

/** The practices a methodology asks for: what it recorded, or else what its own words name. Customise suggests them; only the person turns one on. */
export function practicesOf(m: Methodology | null): Practice[] {
  if (!m) return [];
  if (m.practices) return PRACTICES.filter((p) => m.practices!.includes(p));
  const text = [m.summary, ...m.rules.map((r) => `${r.section} ${r.text}`), ...m.dashboard.sections.map((s) => (s.kind === "figures" ? s.label : "")), ...m.gaps.map((g) => g.asks)].join("\n");
  return PRACTICES.filter((p) => PRACTICE_WORDS[p].test(text));
}

const termsOf = (f: Figure): MeasureSpec[] => {
  const e = f.expr;
  if (e.op === "series") return [];
  return e.op === "measure" || e.op === "scaled" ? [e.of] : e.op === "ratio" ? [e.num, e.den] : e.op === "growth" ? [e.now, e.before] : [e.a, e.b];
};

const CLOCK_FIELDS: readonly FieldId[] = ["record_days", "own_valuation_age_days", "age_days", "option_days_to_expiry"];

function reads(f: Figure, fields: readonly FieldId[]): boolean {
  return termsOf(f).some((t) => (t.field && fields.includes(t.field)) || t.where.some((w) => fields.includes(w.field)));
}

/** Which conditions hold for this person: the switches every screen and slot is read against. */
export function shownWhen(m: Methodology | null, book: Book | null, records: Records | null, decisions: DecisionsFile | null, added: readonly Practice[] = []): Shown {
  // A practice's page is on only once the person adds it on Customise; the methodology naming it is a suggestion there, never a switch.
  const asked = new Set<Practice>([...DEFAULT_PRACTICES, ...added]);
  const figs = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  const tested = (m?.rules ?? []).filter((r) => r.test && figs.has(r.test.figure));
  const series = (m?.figures ?? []).filter((f) => f.expr.op === "series");
  const hasNav = (book?.series?.nav.length ?? 0) > 1;
  const dated = (book?.holdings ?? []).some((h) => h.option?.expiry || h.bond?.maturity || h.deposit?.maturity);
  const clocks = tested.some((r) => reads(figs.get(r.test!.figure)!, CLOCK_FIELDS));
  const valued = Object.values(records?.bySymbol ?? {}).some((r) => r.ownValuation) || (m?.figures ?? []).some((f) => reads(f, ["own_valuation", "own_valuation_low", "own_valuation_high", "price_to_own_valuation_pct"]));
  return {
    always: true,
    classes: (m?.classes.length ?? 0) > 0,
    caps: capsFor(m).length > 0,
    tests: tested.length > 0,
    watch: tested.some((r) => r.severity === "watch"),
    series: series.length > 0 || (!m && hasNav),
    benchmark: benchmarksOf(m).length > 0,
    transactions: (book?.transactions.length ?? 0) > 0,
    valuation: valued,
    clocks,
    dates: clocks || dated,
    // A figure or a class criterion that reads a company fundamental: a methodology that classes on ROIC asks for the filings as surely as one that charts it.
    fundamentals: (m?.figures ?? []).some((f) => reads(f, FUNDAMENTAL_FIELDS as readonly FieldId[])) || (m?.classes ?? []).some((c) => [...(c.required ?? []), ...c.criteria].some((cr) => [cr.field, ...(cr.or ?? []).map((o) => o.field)].some((x) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(x)))),
    sectors: (book?.holdings ?? []).some((h) => !!h.sector),
    markets: marketFigures(m).length > 0,
    decisions: (decisions?.entries.length ?? 0) > 0,
    methodology: !!m,
    dividends: paysDividends(book) || dividendFocused(m),
    dividend_focus: dividendFocused(m),
    trade_log: asked.has("trade_log"),
    trade_check: asked.has("trade_check"),
    decision_log: asked.has("decision_log"),
    todo_list: asked.has("todo_list"),
  };
}

/** The ontology's dividend fields. */
export const DIVIDEND_FIELDS: readonly FieldId[] = ["dividend_yield_pct", "payout_ratio_pct", "dividend_growth_5y_pct", "dividend_years_raised"];
const DIVIDEND_WORDS = /\bdividends?\b|income investing|passive income|yield on cost/i;

/** Whether a figure reads a dividend field or the ledger's dividends; the Dashboard's dividend tiles stay off when a headline figure already does. */
export const readsDividends = (f: Figure): boolean => reads(f, DIVIDEND_FIELDS) || termsOf(f).some((t) => t.where.some((w) => w.field === "kind" && (w.value === "dividend" || (Array.isArray(w.value) && (w.value as unknown[]).includes("dividend")))));

/**
 * Whether a methodology invests for dividends (Hamza, 19 Oct 2026: the
 * Dividends screen first for a dividend methodology): a figure, a class
 * criterion or a tested rule reads a dividend field or the ledger's
 * dividends, or its summary speaks of dividends or income.
 */
export function dividendFocused(m: Methodology | null): boolean {
  if (!m) return false;
  if (m.figures.some(readsDividends)) return true;
  if (m.classes.some((c) => [...(c.required ?? []), ...c.criteria].some((cr) => [cr.field, ...(cr.or ?? []).map((o) => o.field)].some((x) => (DIVIDEND_FIELDS as readonly string[]).includes(x))))) return true;
  return DIVIDEND_WORDS.test(`${m.name ?? ""}\n${m.summary}`);
}

/** Whether a screen or a slot is drawn: its condition holds and, when it is tied to a practice, the practice is on. */
export const isShown = (def: { shown: ShownWhen; practice?: Practice }, shown: Shown): boolean => shown[def.shown] && (!def.practice || shown[def.practice]);

/** The screens on for this person, in the skeleton's order. Input screens still need their module (lib/setup.ts). */
export function screensOn(shown: Shown): ScreenId[] {
  const on: ScreenId[] = SCREEN_IDS.filter((id) => isShown(SCREENS[id], shown));
  // A dividend methodology puts Dividends right after Holdings (Hamza, 19 Oct 2026), so it is in the bar and the phone's tabs.
  if (!shown.dividend_focus || !on.includes("dividends") || !on.includes("holdings")) return on;
  const rest: ScreenId[] = on.filter((id) => id !== "dividends");
  rest.splice(rest.indexOf("holdings") + 1, 0, "dividends");
  return rest;
}

/** The slots of a screen that are on. */
export function slotsOn(screen: ScreenId, shown: Shown): SlotId[] {
  return SCREENS[screen].slots.filter((s) => isShown(SLOTS[s], shown));
}

export const slotOn = (slots: readonly SlotId[], id: SlotId) => slots.includes(id);

/** The benchmark symbols the methodology's series figures name, in order of first use. */
export function benchmarksOf(m: Methodology | null): string[] {
  const out: string[] = [];
  for (const f of m?.figures ?? []) {
    if (f.expr.op !== "series") continue;
    for (const s of [f.expr.of, f.expr.vs]) if (s && s !== "nav" && !out.includes(s)) out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markets

/** Whether a figure measures over the market indicators. */
export const readsMarkets = (f: Figure): boolean => termsOf(f).some((t) => t.over === "markets");

/** The methodology's figures over the market indicators. */
export function marketFigures(m: Methodology | null): Figure[] {
  return (m?.figures ?? []).filter(readsMarkets);
}

/** The dashboard sections with at least one market figure, in the dashboard's order; the first names the Markets screen. */
export function marketSections(m: Methodology | null): Extract<Section, { kind: "figures" }>[] {
  if (!m) return [];
  const market = new Set(marketFigures(m).map((f) => f.id));
  return m.dashboard.sections.filter((s): s is Extract<Section, { kind: "figures" }> => s.kind === "figures" && s.figures.some((id) => market.has(id)));
}

/** Whether a dashboard section is the methodology's returns and risk: every figure in it reads the account's value series. Such a section is drawn on Performance when that screen is on. */
export function readsSeriesOnly(m: Methodology | null, s: Section): boolean {
  if (s.kind !== "figures" || !s.figures.length) return false;
  const byId = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  return s.figures.every((id) => byId.get(id)?.expr.op === "series");
}

/**
 * Whether a methodology section lists the holdings one by one or class by
 * class: the holdings panel, or a section with a figure grouped by holding,
 * symbol or class (weights against a cap per holding, the class test's
 * readings per holding, weight by class). Holdings draws these in its own
 * views (the positions, the class donuts, the Classification Register), so
 * the Dashboard leaves them out while Holdings is on (Hamza, 15 Oct 2026).
 */
export function readsByHolding(m: Methodology | null, s: Section): boolean {
  if (s.kind === "panel") return s.id === "holdings";
  const byId = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  return s.figures.some((id) => {
    const by = byId.get(id)?.by;
    return by === "holding" || by === "symbol" || by === "class";
  });
}

/**
 * Whether a figure is the book's plain total, every holding's value with no
 * filter: the Dashboard's net worth tile already says it, live in market hours.
 */
export function isBookTotal(f: Figure): boolean {
  const e = f.expr;
  return e.op === "measure" && e.of.measure === "sum" && e.of.over === "holdings" && e.of.field === "owner_value" && !e.of.where.length && !f.by;
}

/** Whether a figure weighs or counts by the methodology's classes: Holdings' class donut and register show those. */
export function filtersOnClass(f: Figure): boolean {
  return f.by === "class" || termsOf(f).some((t) => t.where.some((w) => w.field === "class"));
}

/** The benchmarks the Dashboard sets beside the book's return whatever the methodology names (Hamza, 15 Oct 2026): their series come from the market feed. */
export const HEADLINE_BENCHMARKS = ["SPY", "QQQ"] as const;

/** Whether a figure is a return of `of` (nav or a benchmark) over `period`. */
export const isReturnOf = (f: Figure, of: string, period: string) => f.expr.op === "series" && f.expr.stat === "return" && f.expr.of.toUpperCase() === of.toUpperCase() && f.expr.period === period;

/** A benchmark's return over a period, as the Dashboard's own default tile when the methodology has none. */
export function benchmarkReturn(symbol: string, period: Period): Figure {
  return { id: `${symbol.toLowerCase()}-return-${period}`, label: `${symbol} return ${PERIOD_WORDS[period]}`, unit: "pct", expr: { op: "series", stat: "return", of: symbol, period }, view: "tile" };
}

const BOOK_RETURN_YTD: Figure = { id: "return-ytd", label: "Return this year", unit: "pct", expr: { op: "series", stat: "return", of: "nav", period: "ytd" }, view: "tile" };

/** Whether a figure reads the VIX, which Markets draws on its range. */
const readsVix = (f: Figure) => termsOf(f).some((t) => t.over === "markets" && marketSymbolsIn(t.where).includes("VIX"));

/** Whether a figure is the largest single holding's share, which Holdings' concentration draws. */
export const isLargestHolding = (f: Figure) => f.expr.op === "ratio" && f.expr.num.measure === "max" && f.expr.num.over === "holdings" && !f.by;

/**
 * The Dashboard's headline tiles: the methodology's, less the book's total
 * (the net worth tile beside them says it, live in market hours) and, while
 * Holdings is on, the weights by class, which its donut and register draw.
 * Beside the book's return over a period come the same return of each
 * benchmark the methodology names for it, then SPY's and QQQ's; the book's
 * return this year when the book has a value series and the headline has no
 * return of its own (Hamza, 15 Oct 2026: net worth, the return this year,
 * SPY's and QQQ's this year, then whatever the methodology has). A default is
 * the methodology's own figure when it has one. No VIX and, while Holdings is
 * on, no largest holding: Markets and Holdings draw them (Hamza, 19 Oct 2026).
 */
export function dashboardHeadline(headline: readonly Figure[], holdingsOn: boolean, all: readonly Figure[] = [], defaults: { series: boolean; markets: boolean } = { series: false, markets: false }): Figure[] {
  const out: Figure[] = [];
  const has = (f: Figure) => out.some((g) => g.id === f.id) || headline.some((g) => g.id === f.id);
  const kept = headline.filter((f) => !isBookTotal(f) && !(holdingsOn && (filtersOnClass(f) || isLargestHolding(f))) && !readsVix(f));
  const isNavReturn = (f: Figure) => f.expr.op === "series" && f.expr.stat === "return" && f.expr.of === "nav";
  const list = !defaults.series || kept.some(isNavReturn) ? kept : [all.find((f) => isReturnOf(f, "nav", "ytd")) ?? BOOK_RETURN_YTD, ...kept];
  for (const f of list) {
    if (out.some((g) => g.id === f.id)) continue;
    out.push(f);
    const e = f.expr;
    if (e.op !== "series" || e.stat !== "return" || e.of !== "nav") continue;
    const named = all.filter((g) => g.expr.op === "series" && g.expr.stat === "return" && g.expr.of !== "nav" && g.expr.period === e.period).map((g) => (g.expr.op === "series" ? g.expr.of.toUpperCase() : ""));
    const symbols = [...new Set([...named, ...(defaults.series ? HEADLINE_BENCHMARKS : [])])];
    for (const s of symbols) {
      if (kept.some((g) => isReturnOf(g, s, e.period))) continue;
      const twin = all.find((g) => isReturnOf(g, s, e.period)) ?? benchmarkReturn(s, e.period);
      if (!has(twin)) out.push(twin);
    }
  }
  return out;
}

/**
 * Whether a methodology section is about what the book is made of: every
 * figure measures the holdings themselves (how many, the largest, the top
 * five, by sector), none reads the value series or the markets. Holdings
 * draws these while it is on, so the Dashboard keeps to the day, the checks
 * and the markets (Hamza, 15 Oct 2026).
 */
export function readsComposition(m: Methodology | null, s: Section): boolean {
  if (s.kind !== "figures" || !s.figures.length) return false;
  const byId = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  return s.figures.every((id) => {
    const f = byId.get(id);
    if (!f || f.expr.op === "series") return false;
    const terms = termsOf(f);
    return terms.length > 0 && terms.every((t) => t.over === "holdings");
  });
}

const CONCENTRATION_BY = new Set(["sector", "holding", "symbol"]);
/** Whether a figure only measures how concentrated the holdings are: their count, the largest or top few's share, or weight by holding or sector. */
function measuresConcentration(f: Figure): boolean {
  const terms = termsOf(f);
  if (!terms.length || !terms.every((t) => t.over === "holdings")) return false;
  if (f.by && CONCENTRATION_BY.has(f.by)) return true;
  const e = f.expr;
  if (e.op === "measure") return e.of.measure === "count";
  if (e.op === "ratio") return e.num.measure === "max" || (typeof e.num.top === "number" && e.num.top > 0);
  return false;
}

/**
 * Whether a section repeats what Holdings' Concentration card and Sectors
 * donut draw (Hamza, 19 Oct 2026: Diversification repeated Concentration):
 * every figure in it counts the holdings, takes the largest or top few's
 * share, or weighs them by holding or sector.
 */
export function repeatsConcentration(m: Methodology | null, s: Section): boolean {
  if (s.kind !== "figures" || !s.figures.length) return false;
  const byId = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  return s.figures.every((id) => {
    const f = byId.get(id);
    return !!f && measuresConcentration(f);
  });
}

/** The name of the methodology's own section on the Macro screen, else Macro. */
export function marketsTitle(m: Methodology | null): string {
  return marketSections(m)[0]?.label ?? "Macro";
}

/** The indicator symbols the methodology's market figures name, in order of first use. */
export function marketSymbolsOf(m: Methodology | null): string[] {
  const out: string[] = [];
  for (const f of marketFigures(m)) for (const t of termsOf(f)) for (const s of marketSymbolsIn(t.where)) if (!out.includes(s)) out.push(s);
  return out;
}

// ---------------------------------------------------------------------------
// Caps

export type Cap = {
  /** The class the cap applies to; null when it applies to every listed holding. */
  classId: string | null;
  /** In percent of the figure's denominator (net worth, or what the figure divides by). */
  cap: number;
  rule: Rule;
  figure: Figure;
};

const WEIGHT_FIELDS: readonly FieldId[] = ["owner_value", "value"];

/**
 * The cap rules: a rule testing, at most, a percentage figure grouped by
 * holding or symbol whose numerator sums a value field over holdings. A class
 * filter on the numerator makes it that class's cap; none makes it a cap on
 * every listed holding. One rule can cap several classes (a filter `in`).
 */
export function capsFor(m: Methodology | null): Cap[] {
  if (!m) return [];
  const figs = new Map(m.figures.map((f) => [f.id, f]));
  const out: Cap[] = [];
  for (const rule of m.rules) {
    if (!rule.test || (rule.test.is !== "lte" && rule.test.is !== "lt")) continue;
    const figure = figs.get(rule.test.figure);
    if (!figure || figure.unit !== "pct" || (figure.by !== "symbol" && figure.by !== "holding")) continue;
    const e = figure.expr;
    const num = e.op === "ratio" ? e.num : e.op === "measure" ? e.of : null;
    if (!num || num.over !== "holdings" || num.measure !== "sum" || !num.field || !WEIGHT_FIELDS.includes(num.field)) continue;
    const classFilters = num.where.filter((w) => w.field === "class" && (w.is === "eq" || w.is === "in"));
    if (!classFilters.length) {
      out.push({ classId: null, cap: rule.test.limit, rule, figure });
      continue;
    }
    for (const w of classFilters) for (const id of Array.isArray(w.value) ? w.value : [String(w.value)]) out.push({ classId: id, cap: rule.test.limit, rule, figure });
  }
  return out;
}

/** The cap a class gets: its own, else the cap on every holding, else none. */
export function capOf(caps: readonly Cap[], classId: string | null): Cap | null {
  return (classId && caps.find((c) => c.classId === classId)) || caps.find((c) => c.classId === null) || null;
}

export type CapState = "over" | "near" | "within" | "none";
export const capState = (weight: number, cap: number | null): CapState => (cap === null ? "none" : weight > cap ? "over" : weight >= cap - 0.5 ? "near" : "within");
export const capTone = (s: CapState): "danger" | "warn" | "ok" | "neutral" => (s === "over" ? "danger" : s === "near" ? "warn" : s === "within" ? "ok" : "neutral");

// ---------------------------------------------------------------------------
// Weights

export type Weight = {
  symbol: string;
  name: string;
  /** The holdings behind the symbol, largest first: the same share at two brokers is one weight. */
  holdings: Holding[];
  /** Value to the owner, base currency. */
  value: number;
  /** Percent of net worth. */
  weight: number;
  classId: string | null;
  classLabel: string;
  cap: Cap | null;
  state: CapState;
  /** Shares to sell to restore the cap, at the holding's price; null when within or without a price. */
  sharesToCap: number | null;
};

const LISTED = new Set(["equity", "etf", "option", "bond", "private_fund", "real_estate", "other"]);

/**
 * Every holding outside cash by weight of net worth, merged by symbol, with
 * the class the methodology gives it and the cap that class gets. Largest
 * first. Net worth is the sum of every holding's value to the owner.
 */
export function weightsFor(book: Book, m: Methodology | null, ctx: EvalCtx): { weights: Weight[]; netWorth: number } {
  const netWorth = book.holdings.reduce((s, h) => s + ownerValueOf(h, book), 0);
  const caps = capsFor(m);
  const label = (id: string | null) => (id ? (m?.classes.find((c) => c.id === id)?.label ?? id) : "No class yet");
  const bySymbol = new Map<string, { holdings: Holding[]; value: number }>();
  for (const h of book.holdings) {
    if (!LISTED.has(h.assetClass)) continue;
    const key = h.symbol.toUpperCase();
    const got = bySymbol.get(key) ?? { holdings: [], value: 0 };
    got.holdings.push(h);
    got.value += ownerValueOf(h, book);
    bySymbol.set(key, got);
  }
  const weights: Weight[] = [];
  for (const [symbol, g] of bySymbol) {
    g.holdings.sort((a, b) => ownerValueOf(b, book) - ownerValueOf(a, book));
    const lead = g.holdings[0];
    const classId = ctx.classOf(lead);
    const cap = capOf(caps, classId);
    const weight = netWorth > 0 ? (g.value / netWorth) * 100 : 0;
    const state = capState(weight, cap?.cap ?? null);
    const price = lead.price;
    const sharesToCap = state === "over" && cap && price ? ((weight - cap.cap) / 100) * netWorth / price : null;
    weights.push({ symbol, name: lead.name, holdings: g.holdings, value: g.value, weight, classId, classLabel: label(classId), cap, state, sharesToCap });
  }
  weights.sort((a, b) => b.weight - a.weight);
  return { weights, netWorth };
}

export type ClassMix = {
  classId: string | null;
  /** "class" for one of the methodology's; "cash" for cash and deposits no class places; "none" for listed holdings no class places. */
  kind: "class" | "cash" | "none";
  label: string;
  weight: number;
  count: number;
  cap: Cap | null;
};

/**
 * Weight of net worth by class over every holding, cash included (a
 * methodology may class cash), in the methodology's class order, with the
 * unclassified last when any holding is unclassified.
 */
export function classMix(book: Book, m: Methodology | null, ctx: EvalCtx): ClassMix[] {
  const caps = capsFor(m);
  const netWorth = book.holdings.reduce((s, h) => s + ownerValueOf(h, book), 0);
  const entry = (id: string | null, kind: ClassMix["kind"], label: string, rows: Holding[]): ClassMix => {
    const value = rows.reduce((s, h) => s + ownerValueOf(h, book), 0);
    return { classId: id, kind, label, weight: netWorth > 0 ? (value / netWorth) * 100 : 0, count: rows.length, cap: capOf(caps, id) };
  };
  const classes = (m?.classes ?? []).map((c) => entry(c.id, "class", c.label, book.holdings.filter((h) => ctx.classOf(h) === c.id)));
  const unplaced = book.holdings.filter((h) => ctx.classOf(h) === null);
  const cash = unplaced.filter((h) => !LISTED.has(h.assetClass));
  const listed = unplaced.filter((h) => LISTED.has(h.assetClass));
  return [...classes, ...(cash.length ? [entry(null, "cash", "Cash", cash)] : []), ...(listed.length ? [entry(null, "none", "No class yet", listed)] : [])];
}

// ---------------------------------------------------------------------------
// Signals: every tested rule, per holding

export type SignalStatus = "red" | "amber" | "grey" | "info" | "green";
export const SIGNAL_LABEL: Record<SignalStatus, string> = { red: "Red", amber: "Amber", grey: "No reading", info: "Information", green: "Clear" };
export const SIGNAL_TONE: Record<SignalStatus, "danger" | "warn" | "neutral" | "info" | "ok"> = { red: "danger", amber: "warn", grey: "neutral", info: "info", green: "ok" };
export const SIGNAL_ORDER: readonly SignalStatus[] = ["red", "amber", "grey", "info", "green"];
export const SIGNAL_GROUP: Record<SignalStatus, string> = { red: "Red: act now", amber: "Amber: near the limit, or a watch tripped", grey: "No reading yet", info: "Information: yours to check", green: "Clear" };

export type Signal = {
  key: string;
  status: SignalStatus;
  rule: Rule;
  /** The holding the reading is for; null for a rule on the whole or one the owner checks. */
  symbol: string | null;
  label: string;
  /** The reading, formatted, and the limit. */
  reading: string | null;
  limit: string | null;
  detail: string;
};

/**
 * One signal per finding, or per offending holding when the rule is grouped:
 * a breach or guideline failing is red, a watch tripped or a rule near its
 * limit is amber, a rule waiting for data is grey, one the owner checks is
 * information, the rest clear.
 */
export function signalsFor(findings: readonly Finding[]): Signal[] {
  const out: Signal[] = [];
  for (const f of findings) {
    const base = { rule: f.rule, limit: f.limit, detail: f.detail };
    if (f.status === "manual") {
      out.push({ ...base, key: f.rule.id, status: "info", symbol: null, label: f.rule.text, reading: null });
      continue;
    }
    if (f.status === "n/a") {
      out.push({ ...base, key: f.rule.id, status: "grey", symbol: null, label: f.rule.text, reading: null });
      continue;
    }
    const status: SignalStatus = f.status === "pass" ? "green" : f.status === "near" ? "amber" : f.rule.severity === "watch" ? "amber" : "red";
    const perHolding = f.figure?.by === "symbol" || f.figure?.by === "holding";
    if (perHolding && f.offenders.length) {
      for (const p of f.offenders) out.push({ ...base, key: `${f.rule.id}:${p.key}`, status, symbol: p.symbol, label: p.label, reading: p.value });
      continue;
    }
    out.push({ ...base, key: f.rule.id, status, symbol: null, label: f.rule.text, reading: f.actual });
  }
  return out.sort((a, b) => SIGNAL_ORDER.indexOf(a.status) - SIGNAL_ORDER.indexOf(b.status));
}

/** The worst signal on a symbol, or null when none reads it. */
export function worstSignal(signals: readonly Signal[], symbol: string): Signal | null {
  const s = symbol.toUpperCase();
  return signals.find((x) => x.symbol?.toUpperCase() === s) ?? null;
}

// ---------------------------------------------------------------------------
// Dates and clocks

export type DatedItem = {
  key: string;
  date: string;
  kind: "clock" | "expiry" | "maturity" | "report";
  title: string;
  detail: string;
  symbol: string | null;
  /** The methodology section behind a clock. */
  section: string | null;
};

const DAY = 86_400_000;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

function passesWhere(h: Holding, where: MeasureSpec["where"], ctx: EvalCtx): boolean {
  for (const w of where) {
    const v = w.field === "class" ? ctx.classOf(h) : w.field === "symbol" ? h.symbol : w.field === "asset_class" ? h.assetClass : undefined;
    if (v === undefined) continue;
    const want = Array.isArray(w.value) ? w.value.map(String) : [String(w.value ?? "")];
    const has = v !== null && want.includes(String(v));
    if ((w.is === "eq" || w.is === "in") && !has) return false;
    if ((w.is === "ne" || w.is === "not_in") && has) return false;
  }
  return true;
}

/**
 * The clocks: every rule testing days (in a standing, since a valuation,
 * since a mark, to expiry) at most, read per holding the rule's filters
 * admit, as the date the clock runs out. Plus expiries and maturities the
 * book carries, and the next report when its date is known.
 */
export function datedItems(book: Book, m: Methodology | null, ctx: EvalCtx, nextReport: string | null): DatedItem[] {
  const out: DatedItem[] = [];
  const figs = new Map((m?.figures ?? []).map((f) => [f.id, f]));
  for (const rule of m?.rules ?? []) {
    if (!rule.test || (rule.test.is !== "lte" && rule.test.is !== "lt")) continue;
    const figure = figs.get(rule.test.figure);
    if (!figure) continue;
    for (const t of termsOf(figure)) {
      if (!t.field || !CLOCK_FIELDS.includes(t.field) || t.over !== "holdings") continue;
      for (const h of book.holdings) {
        if (!passesWhere(h, t.where, ctx)) continue;
        const start = t.field === "record_days" ? h.record?.since : t.field === "own_valuation_age_days" ? h.record?.ownValuation?.asOf : t.field === "age_days" ? h.asOf : null;
        if (!start) continue;
        out.push({ key: `${rule.id}:${h.id}`, date: addDays(start, rule.test.limit), kind: "clock", title: `${h.symbol}: ${rule.text}`, detail: `${FIELDS[t.field].label} reaches ${rule.test.limit} (${rule.section}).`, symbol: h.symbol, section: rule.section });
      }
    }
  }
  for (const h of book.holdings) {
    if (h.option?.expiry) out.push({ key: `expiry:${h.id}`, date: h.option.expiry, kind: "expiry", title: `${h.symbol} expires`, detail: `${h.quantity} contract${Math.abs(h.quantity) === 1 ? "" : "s"} in ${h.account}.`, symbol: h.symbol, section: null });
    const maturity = h.bond?.maturity ?? h.deposit?.maturity;
    if (maturity) out.push({ key: `maturity:${h.id}`, date: maturity, kind: "maturity", title: `${h.name} matures`, detail: `${h.assetClass === "bond" ? "Bond" : "Deposit"} in ${h.account}.`, symbol: h.symbol, section: null });
  }
  if (nextReport) out.push({ key: "report", date: nextReport, kind: "report", title: "Scheduled report", detail: "Built and sent to your sign-in address.", symbol: null, section: null });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** "Today", "Tomorrow", "In 12d", "3d overdue". */
export function countdown(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return days < 0 ? `${-days}d overdue` : `In ${days}d`;
}

// ---------------------------------------------------------------------------
// Needs you

export type ActionItem = { key: string; tone: "danger" | "warn" | "info"; title: string; detail: string; when: string; href: string; date: string | null };

/**
 * What needs a decision, most urgent first: every holding over its cap, every
 * other breach (with its worst holding), every watch tripped, and every dated
 * item from today to 35 days out.
 */
export function needsYou(weights: readonly Weight[], signals: readonly Signal[], dated: readonly DatedItem[], today: string): ActionItem[] {
  const out: ActionItem[] = [];
  const capRules = new Set<string>();
  for (const w of weights) {
    if (w.state !== "over" || !w.cap) continue;
    capRules.add(w.cap.rule.id);
    const sell = w.sharesToCap !== null ? ` Selling about ${w.sharesToCap.toFixed(2)} sh restores the cap` : "";
    out.push({ key: `cap-${w.symbol}`, tone: "danger", title: `${w.symbol} over its ${w.cap.cap}% cap`, detail: `${w.weight.toFixed(2)}% now.${sell} (${w.cap.rule.section}).`, when: "", href: `/holdings/${encodeURIComponent(w.symbol)}`, date: null });
  }
  for (const s of signals) {
    if (s.status !== "red" && !(s.status === "amber" && s.rule.severity === "watch")) continue;
    if (capRules.has(s.rule.id)) continue;
    const reading = s.reading ? ` ${s.reading} against ${s.limit ?? "the limit"}.` : "";
    out.push({ key: s.key, tone: s.status === "red" ? "danger" : "warn", title: s.symbol ? `${s.symbol}: ${s.rule.text}` : s.rule.text, detail: `${reading} (${s.rule.section})`.trim(), when: "", href: s.symbol ? `/holdings/${encodeURIComponent(s.symbol)}` : "/signals", date: null });
  }
  for (const d of dated) {
    const days = daysBetween(today, d.date);
    if (days < 0 || days > 35) continue;
    out.push({ key: d.key, tone: d.kind === "clock" ? (days <= 7 ? "danger" : "warn") : "info", title: d.title, detail: d.detail, when: countdown(days), href: d.symbol ? `/holdings/${encodeURIComponent(d.symbol)}` : "/calendar", date: d.date });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Notices

/** A figure a notice carries as a chip: a market's or the book's move after an event, say. Its tone is the move's direction, never a verdict. */
export type NoticeFigure = { label: string; value: string; tone: "up" | "down" | "flat" };
export type Notice = { key: string; date: string; tone: "danger" | "warn" | "info" | "ok"; title: string; detail: string; href: string; figures?: NoticeFigure[] };

/**
 * What the Notifications screen lists: today's breaches, watches and near
 * misses, dated items within a week, and the day the filings were read. Each
 * is dated so "since you last looked" is a comparison with one timestamp.
 */
export function noticesFor(signals: readonly Signal[], dated: readonly DatedItem[], filings: FilingsFile | null, today: string, research: ResearchFile | null = null): Notice[] {
  const out: Notice[] = [];
  // A study that finished or stopped, on the day it did: the run is in the background, so this is how the person hears of it.
  // A study written for a results report is part of that report, which waits for it and is told once with it (Hamza, 5 Nov 2026).
  for (const s of research?.studies ?? []) {
    if (!s.finishedAt || (s.status !== "done" && s.status !== "failed") || s.forResults) continue;
    const written = Object.keys(s.written).length;
    out.push({
      key: `study:${s.id}`,
      date: s.finishedAt.slice(0, 10),
      tone: s.status === "done" ? "ok" : "danger",
      title: s.status === "done" ? `${s.subject}: study ready` : `${s.subject}: study stopped`,
      detail: s.status === "done" ? `${s.templateTitle}, ${written} section${written === 1 ? "" : "s"}${s.verdict?.classLabel ? `, ${s.verdict.classLabel}` : ""}.` : s.error ?? `${written} of ${s.sections.length} sections written.`,
      href: `/research/${s.id}`,
    });
  }
  for (const s of signals) {
    if (s.status !== "red" && s.status !== "amber") continue;
    out.push({ key: s.key, date: today, tone: s.status === "red" ? "danger" : "warn", title: s.symbol ? `${s.symbol}: ${s.rule.text}` : s.rule.text, detail: `${s.reading ? `${s.reading} against ${s.limit ?? "the limit"}. ` : ""}(${s.rule.section})`, href: s.symbol ? `/holdings/${encodeURIComponent(s.symbol)}` : "/signals" });
  }
  for (const d of dated) {
    const days = daysBetween(today, d.date);
    if (days < 0 || days > 7) continue;
    out.push({ key: d.key, date: today, tone: "info", title: `${d.title} ${countdown(days).toLowerCase()}`, detail: d.detail, href: d.symbol ? `/holdings/${encodeURIComponent(d.symbol)}` : "/calendar" });
  }
  if (filings?.updated) {
    const read = Object.values(filings.bySymbol).filter((e) => !e.error).length;
    const failed = Object.values(filings.bySymbol).filter((e) => e.error).length;
    out.push({ key: "filings", date: filings.updated.slice(0, 10), tone: failed ? "warn" : "ok", title: `Filings read for ${read} compan${read === 1 ? "y" : "ies"}`, detail: failed ? `${failed} could not be read; Setup says which.` : "Every listed holding's and watchlist company's latest filing is in.", href: "/setup" });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Notices dated after the person last looked. */
export function unreadNotices(notices: readonly Notice[], seen: string | null): Notice[] {
  return seen ? notices.filter((n) => n.date > seen.slice(0, 10)) : [...notices];
}

// ---------------------------------------------------------------------------
// Concentration

export type Concentration = { top1: number; top3: number; top5: number; effective: number; herfindahl: number };

/**
 * Top one, three and five by weight of net worth; the Herfindahl index and
 * effective holdings (1/HHI) over the listed holdings' shares of their own
 * total, so cash never makes a book look more spread than its holdings are.
 */
export function concentration(weights: readonly Weight[]): Concentration | null {
  // A short position (a written option) is an obligation, not a holding the book is spread across.
  const w = weights.filter((x) => x.weight > 0).map((x) => x.weight / 100);
  if (!w.length) return null;
  const top = (n: number) => w.slice(0, n).reduce((s, v) => s + v, 0) * 100;
  const listed = w.reduce((s, v) => s + v, 0);
  const hhi = listed > 0 ? w.reduce((s, v) => s + (v / listed) ** 2, 0) : 0;
  return { top1: top(1), top3: top(3), top5: top(5), effective: hhi > 0 ? 1 / hhi : 0, herfindahl: hhi };
}

/**
 * What the concentration figures say, in plain sentences over the same
 * weights (largest first): the largest against an equal share, how many
 * holdings hold half of net worth, what uneven weights cost in spread, the
 * tail against the largest, and any holding over its cap with the rule's
 * section. Short positions are left out, as in `concentration`. Context,
 * never a verdict.
 */
export function concentrationInsights(all: readonly Weight[]): string[] {
  const weights = all.filter((w) => w.weight > 0);
  const c = concentration(weights);
  if (!c) return [];
  const n = weights.length;
  const listed = weights.reduce((s, w) => s + w.weight, 0);
  const out: string[] = [];
  const first = weights[0];
  if (n > 1 && listed > 0) {
    const equal = listed / n;
    out.push(`${first.symbol} alone is ${first.weight.toFixed(1)}% of net worth, ${(first.weight / equal).toFixed(1)}× an equal share of the listed book (${equal.toFixed(1)}%).`);
  }
  let run = 0;
  const half = weights.findIndex((w) => (run += w.weight) >= 50);
  out.push(half >= 0 ? `Half of net worth sits in the largest ${half + 1 === 1 ? "holding" : `${half + 1}`}${half + 1 === n ? ", which is every holding" : ` of ${n}`}.` : `The listed holdings are ${listed.toFixed(1)}% of net worth; the rest is cash and what is not listed.`);
  if (n > 1) {
    const lost = n - c.effective;
    out.push(lost >= 0.5 ? `${n} holdings behave like ${c.effective.toFixed(1)} of equal size: uneven weights cost about ${lost.toFixed(1)} positions of spread.` : `${n} holdings behave like ${c.effective.toFixed(1)} of equal size: the weights are close to even.`);
  }
  const tail = weights.slice(5).reduce((s, w) => s + w.weight, 0);
  if (n > 5 && tail > 0) {
    out.push(`The smallest ${n - 5} together are ${tail.toFixed(1)}%${tail < first.weight ? `, less than ${first.symbol} alone` : ""}.`);
  }
  const over = weights.filter((w) => w.state === "over" && w.cap);
  if (over.length) out.push(`Over the cap: ${over.map((w) => `${w.symbol} ${w.weight.toFixed(1)}% against ${w.cap!.cap}% (${w.cap!.rule.section})`).join(", ")}.`);
  return out;
}

/** The holdings fields a price moves: a figure that reads one of them is live while the US market is open (Hamza, 16 Oct 2026). */
const PRICE_FIELDS: ReadonlySet<string> = new Set(["value", "owner_value", "gain_pct", "day_change", "day_change_pct", "price", "price_to_own_valuation_pct"]);

/** Whether a figure moves with today's prices: it measures the holdings on a field a price moves, or filters on one. */
export function readsPrices(f: Figure): boolean {
  return termsOf(f).some((t) => t.over === "holdings" && ((t.field !== undefined && t.field !== null && PRICE_FIELDS.has(t.field)) || t.where.some((w) => PRICE_FIELDS.has(w.field))));
}

/**
 * The Dashboard's headline tiles as the page draws them: the methodology's
 * chosen headline through `dashboardHeadline`, less the returns this year the
 * year strip already shows when it is drawn (`yearOn`). One function, so the
 * page and the live route that recomputes the tiles at today's prices agree.
 */
export function headlineTiles(all: readonly Figure[], headlineIds: readonly string[], o: { holdingsOn: boolean; series: boolean; markets: boolean; yearOn: boolean }): Figure[] {
  const chosen = headlineIds.map((id) => all.find((f) => f.id === id)).filter((f): f is Figure => !!f);
  return dashboardHeadline(chosen, o.holdingsOn, all, { series: o.series, markets: o.markets }).filter((f) => !(o.yearOn && ["nav", "SPY", "QQQ"].some((s) => isReturnOf(f, s, "ytd"))));
}
