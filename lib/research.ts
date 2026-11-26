/**
 * Research: a written study of one company, instrument or theme, in the
 * shape the person's methodology asks for.
 *
 * Every methodology belongs to a family (fundamentals, options, quant, macro),
 * read off what its recipes measure, and each family has one canonical
 * template: the sections a study has and what each should establish. The
 * person's methodology then amends the template: its classes become the
 * classification section's test, its rules on the family's fields become the
 * checks, its own-valuation rules the valuation section. A person can keep
 * their own template in their vault (uploaded or edited) and it replaces the
 * canonical one; the methodology amends it the same way.
 *
 * Figures come from filings (lib/edgar-facts.ts), verdicts from the
 * methodology's own recipes (checkCompany), and the model writes prose on the
 * person's key (lib/research-prompt.ts); it never computes a figure or a
 * verdict. Pure: the screen, the actions and the checks share it.
 */
import { z } from "zod";

import type { Fundamentals } from "@/lib/edgar-facts";
import { bookSchema, type Book, type Holding } from "@/lib/holdings";
import { fieldsRead, inputLabel, type Methodology, type Rule } from "@/lib/methodology";
import { evalCtx, FIELDS, FUNDAMENTAL_FIELDS, type FieldId } from "@/lib/ontology";
import { classFilters, classifier, classTest, classWords, criterionLabel, formatUnit, needsWords, passWords, runTest, testWords, type ClassDef, type CriterionRead } from "@/lib/recipes";
import { INPUT_IDS } from "@/lib/setup";

// ---------------------------------------------------------------------------
// Families

export const FAMILIES = ["fundamentals", "options", "quant", "macro"] as const;
export type Family = (typeof FAMILIES)[number];
export const FAMILY_LABEL: Record<Family, string> = { fundamentals: "Business fundamentals", options: "Options income", quant: "Systematic", macro: "Macro and allocation" };
export const FAMILY_ABOUT: Record<Family, string> = {
  fundamentals: "Picks companies on their business: growth, returns on capital, cash generation, valuation against an own estimate of worth.",
  options: "Earns premium on contracts over an underlying: volatility, strike and expiry, assignment and the capital at risk.",
  quant: "Follows a measurable signal over a universe: evidence, factor exposure, risk, capacity, regimes.",
  macro: "Allocates across asset classes, countries and currencies on a view of the cycle, rates and policy.",
};

const OPTION_FIELDS: readonly FieldId[] = ["option_underlying", "option_right", "option_strike", "option_expiry", "option_days_to_expiry", "option_delta_value", "assignment_cash", "option_iv_pct", "option_iv_rank", "option_expected_move"];
const MACRO_FIELDS: readonly FieldId[] = ["country", "currency", "asset_class", "bond_yield_pct", "bond_maturity", "bond_coupon_pct", "deposit_rate_pct", "fund_manager", "fund_vintage", "lt_country", "lt_sector"];

/** The fields a methodology reads anywhere: figures, class criteria, and through them its rules. */
export function fieldsOfMethodology(m: Methodology): FieldId[] {
  const out = new Set<FieldId>();
  for (const f of m.figures) for (const id of fieldsRead(f)) out.add(id);
  for (const c of m.classes) for (const w of classFilters(c)) out.add(w.field);
  return [...out];
}

export type FamilyRead = { family: Family; scores: Record<Family, number>; reasons: string[] };

/**
 * Which family a methodology belongs to, from what it reads: fundamentals
 * fields, option fields, series statistics (returns, volatility, beta,
 * drawdowns) or allocation fields. Ties go to fundamentals, then options, then
 * quant. A methodology reading none of them is treated as fundamentals and
 * the person is told so; they can choose another family on the screen.
 */
export function familyOf(m: Methodology): FamilyRead {
  const fields = fieldsOfMethodology(m);
  const scores: Record<Family, number> = { fundamentals: 0, options: 0, quant: 0, macro: 0 };
  const reasons: string[] = [];
  const fund = fields.filter((f) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(f) || f === "own_valuation" || f === "price_to_own_valuation_pct");
  const opt = fields.filter((f) => OPTION_FIELDS.includes(f));
  const macro = fields.filter((f) => MACRO_FIELDS.includes(f));
  const series = m.figures.filter((f) => f.expr.op === "series");
  scores.fundamentals = fund.length;
  scores.options = opt.length + (m.dashboard.sections.some((s) => s.kind === "panel" && s.id === "options") ? 1 : 0);
  // Returns and drawdowns appear in most methodologies; they mark a systematic one only when little else does.
  scores.quant = series.length * 0.5;
  scores.macro = macro.length;
  if (fund.length) reasons.push(`reads ${fund.length} fundamentals field${fund.length > 1 ? "s" : ""} (${fund.slice(0, 4).map((f) => FIELDS[f].label.toLowerCase()).join(", ")}${fund.length > 4 ? "…" : ""})`);
  if (opt.length) reasons.push(`reads ${opt.length} option field${opt.length > 1 ? "s" : ""}`);
  if (series.length) reasons.push(`has ${series.length} series statistic${series.length > 1 ? "s" : ""} (returns, volatility, drawdowns)`);
  if (macro.length) reasons.push(`reads ${macro.length} allocation field${macro.length > 1 ? "s" : ""} (${macro.slice(0, 3).map((f) => FIELDS[f].label.toLowerCase()).join(", ")})`);
  const order: Family[] = ["fundamentals", "options", "quant", "macro"];
  const best = order.reduce((a, b) => (scores[b] > scores[a] ? b : a), "fundamentals" as Family);
  if (!reasons.length) reasons.push("reads no field that points to a family; business fundamentals is assumed");
  return { family: best, scores, reasons };
}

// ---------------------------------------------------------------------------
// Templates

/** What a section is for, so the methodology knows where its elements belong. */
export const TAGS = ["classes", "rules", "valuation", "exit", "sizing"] as const;
export type Tag = (typeof TAGS)[number];

export const templateSectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(80),
  /** What the section must establish, in the person's words or the canonical ones. */
  guidance: z.string().max(2000),
  tags: z.array(z.enum(TAGS)).max(3).default([]),
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

export const templateSchema = z.object({
  version: z.literal(1),
  family: z.enum(FAMILIES),
  title: z.string().max(120),
  sections: z.array(templateSectionSchema).min(1).max(30),
  /** canonical: the app's; uploaded: the person's own document, split by headings; edited: changed on the screen; library: a ready-made methodology's own template, adopted. */
  origin: z.enum(["canonical", "uploaded", "edited", "library"]),
  updated: z.string(),
});
export type Template = z.infer<typeof templateSchema>;

const sec = (id: string, title: string, guidance: string, tags: Tag[] = []): TemplateSection => ({ id, title, guidance, tags });

const CANON: Record<Family, TemplateSection[]> = {
  fundamentals: [
    sec("core-business", "Core business", "What the company sells, to whom, how it is paid, and what it must do well to keep being paid. Name the segments and the share of revenue each brings."),
    sec("growth", "Growth", "Revenue, operating income, free cash flow and per-share figures over the last five years and the trailing twelve months, from the filings. Say what grew, what did not, and what drove it. Figures only from the facts given."),
    sec("profitability", "Profitability and returns on capital", "Gross and operating margins, free cash flow margin and conversion, return on invested capital, and their direction. Separate the structural from the cyclical."),
    sec("segments", "Segments and unit economics", "Where the money is made and where it is lost, by segment or product, and what the marginal unit earns. What it sells and where it sells it are two splits: a region or a country is never a segment of what it sells, and the two are never added together."),
    sec("competition", "Competition and position", "Who else does this, how the company wins or loses against them, and whether its share is rising or falling."),
    sec("moats", "Moats", "The sources of durable advantage (switching costs, network effects, cost position, intangibles, scale) with evidence for each, and how each could erode."),
    sec("valuation", "Valuation", "Multiples against history and peers, what the price implies about growth and margins, and the gap to the owner's own valuation when one is recorded.", ["valuation"]),
    sec("earnings", "Latest earnings", "What the latest quarter changed: the figures that moved, the guidance, and what management said it would do."),
    sec("capital-allocation", "Capital allocation", "Buybacks, dividends, acquisitions, debt and reinvestment: what the company did with its cash, at what prices, and whether it compounded value per share."),
    sec("dcf", "Owner's valuation", "A discounted cash flow or equivalent in the owner's own terms: the drivers, the range, and what has to be true for each end of it. The owner records the base case; the study states the assumptions.", ["valuation"]),
    sec("swot", "Strengths, weaknesses, opportunities, threats", "Four short lists, each item tied to a figure or a fact above."),
    sec("key-question", "Key research question", "The one question the thesis turns on, how it can be tested with data, and what the data says so far."),
    sec("investment-questions", "Investment questions", "Why this business, why now, what the market misses, what would change the mind, and what is the downside if wrong."),
    sec("classification", "Classification", "Where the company sits in the methodology's classes, test by test, with the threshold, the figure and pass or fail. The app's checks below are the verdict; the prose explains them.", ["classes", "rules"]),
    sec("kill-signals", "Kill signals and sell discipline", "The measurable conditions under which the position is sold or trimmed, from the methodology, and how far each is from tripping.", ["exit"]),
    sec("conclusion", "Conclusion", "What is good, what is acceptable, what is bad, and the action the methodology calls for. Not investment advice."),
  ],
  options: [
    sec("underlying", "Underlying and thesis", "What the underlying is, why the owner is willing to hold or be assigned it, and the price range they are content with."),
    sec("volatility", "Volatility", "Implied against realised volatility, the implied volatility rank, and what the market prices for the event window. Where the app has no market data source, say which figures are missing rather than estimating them."),
    sec("liquidity", "Liquidity and chain", "Open interest, spreads and the strikes and expiries that trade enough to enter and exit."),
    sec("strategy-fit", "Strategy fit", "Which of the methodology's strategies this is (a covered call, a cash-secured put, a spread), and why that one here.", ["rules"]),
    sec("strike-expiry", "Strike and expiry", "The delta, the distance from the price, the days to expiry and the premium per day of risk, against the methodology's limits.", ["rules", "sizing"]),
    sec("assignment", "Assignment and capital at risk", "What assignment would cost, how it fits the book's cash, and the position cap it falls under.", ["sizing"]),
    sec("greeks", "Exposure after the trade", "Delta-adjusted exposure, theta and vega of the book with the trade in it, and concentration in one underlying."),
    sec("events", "Earnings and events", "The dates inside the expiry window and how the methodology treats them."),
    sec("exit", "Exit and roll plan", "At what profit the position is closed, when it is rolled, and when it is let expire or assigned, from the methodology.", ["exit"]),
    sec("checks", "Rules check", "Each rule of the methodology that applies to this trade, with its limit and where the trade stands.", ["rules", "classes"]),
    sec("conclusion", "Conclusion", "Take the trade, wait, or pass, in the methodology's own terms. Not investment advice."),
  ],
  quant: [
    sec("universe", "Universe and data", "What is traded, over what history, with which data, and how survivorship and look-ahead are handled."),
    sec("signal", "Signal", "The exact definition of the signal, its lookback and rebalance, and the economic reason it should work."),
    sec("evidence", "Evidence", "Backtest results as given (returns, drawdowns, hit rate, turnover), with the periods they cover. Nothing is invented; missing evidence is named as missing."),
    sec("factors", "Factor exposures", "What the strategy loads on (market, size, value, momentum, quality) and how much of its return those explain."),
    sec("risk", "Risk", "Volatility, worst drawdown, beta and tail behaviour against the methodology's limits.", ["rules"]),
    sec("capacity", "Capacity and costs", "Trading costs, slippage and the size at which the edge fades."),
    sec("regimes", "Regime sensitivity", "When it worked and when it did not, and what the current regime looks like on those terms."),
    sec("correlation", "Fit with the book", "Correlation with what the book already holds and the diversification it adds or fails to add."),
    sec("checks", "Rules check", "Each rule of the methodology that applies, with its limit and the current figure.", ["rules", "classes", "sizing"]),
    sec("conclusion", "Conclusion", "Deploy, paper-trade, or drop, in the methodology's terms. Not investment advice."),
  ],
  macro: [
    sec("thesis", "Thesis", "The view in one paragraph: what is expected to happen, over what horizon, and why the market does not price it."),
    sec("regime", "Regime", "Growth, inflation, policy and liquidity: where the cycle is and what would mark a turn."),
    sec("rates", "Rates and curve", "Policy rates, the curve, real yields and what they imply for the instruments under consideration."),
    sec("currency", "Currency", "The currency exposure the position brings and whether it is hedged, against the methodology's limits.", ["rules"]),
    sec("instrument", "Instrument choice", "Which instrument expresses the view best (bonds, deposits, funds, equities, property) and what each costs and risks."),
    sec("positioning", "Positioning and sizing", "How large the position is against the asset-class, country and liquidity limits of the methodology.", ["sizing", "rules"]),
    sec("scenarios", "Scenarios", "The base case, the upside, the downside, and the evidence that would prove the view wrong."),
    sec("hedges", "Hedges", "What offsets the main risk and what it costs."),
    sec("checks", "Rules check", "Each rule of the methodology that applies, with its limit and the current figure.", ["rules", "classes"]),
    sec("conclusion", "Conclusion", "Act, wait, or pass, in the methodology's terms. Not investment advice."),
  ],
};

export function canonicalTemplate(family: Family, now = "1970-01-01T00:00:00.000Z"): Template {
  return { version: 1, family, title: `${FAMILY_LABEL[family]} study`, sections: CANON[family].map((s) => ({ ...s })), origin: "canonical", updated: now };
}

/**
 * A person's own template, from a text or Markdown document: each heading
 * (`#`, `##`, a numbered line such as "3. Profitability", or a line in capitals)
 * starts a section and the text under it is its guidance. Throws when no
 * heading is found, so a document that cannot be read never looks empty.
 */
export function templateFromText(text: string, title: string, family: Family, now: string): Template {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: { title: string; body: string[] }[] = [];
  const heading = (l: string) => {
    const t = l.trim();
    const m = t.match(/^#{1,3}\s+(.+?)\s*#*$/) ?? t.match(/^(?:\d{1,2}[.)]|[IVX]{1,4}[.)])\s+([A-Z].{2,78})$/) ?? (t.length >= 4 && t.length <= 80 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/[.:]$/.test(t) ? [t, t] : null);
    return m ? m[1].trim() : null;
  };
  for (const l of lines) {
    const h = heading(l);
    if (h) sections.push({ title: h, body: [] });
    else if (sections.length && l.trim()) sections[sections.length - 1].body.push(l.trim());
  }
  if (!sections.length) throw new Error("No headings found. Start each section with a heading (# Title, ## Title, or 1. Title).");
  const used = new Set<string>();
  const out = sections.slice(0, 30).map((s) => {
    let id = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "section";
    while (used.has(id)) id = `${id.slice(0, 34)}-${used.size}`;
    used.add(id);
    const lower = s.title.toLowerCase();
    const tags: Tag[] = [];
    if (/classif|categor|archetype|class\b/.test(lower)) tags.push("classes", "rules");
    if (/kill|sell|exit|stop/.test(lower)) tags.push("exit");
    if (/valuation|dcf|worth|price target/.test(lower)) tags.push("valuation");
    if (/sizing|position size|cap\b/.test(lower)) tags.push("sizing");
    return templateSectionSchema.parse({ id, title: s.title.slice(0, 80), guidance: s.body.join(" ").slice(0, 2000), tags: [...new Set(tags)].slice(0, 3) });
  });
  return templateSchema.parse({ version: 1, family, title: title.slice(0, 120), sections: out, origin: "uploaded", updated: now });
}

// ---------------------------------------------------------------------------
// Amending a template with the methodology

const FAMILY_FIELDS: Record<Family, (f: FieldId) => boolean> = {
  fundamentals: (f) => (FUNDAMENTAL_FIELDS as readonly string[]).includes(f) || f === "own_valuation" || f === "price_to_own_valuation_pct" || f === "own_valuation_age_days",
  options: (f) => OPTION_FIELDS.includes(f),
  quant: () => false,
  macro: (f) => MACRO_FIELDS.includes(f),
};

/** The rules that bear on a study in this family: those testing a figure that reads the family's fields (any series figure, for quant), or any rule with a test of a per-holding figure for sizing. */
export function relevantRules(m: Methodology, family: Family): Rule[] {
  const figs = new Map(m.figures.map((f) => [f.id, f]));
  return m.rules.filter((r) => {
    if (!r.test) return false;
    const f = figs.get(r.test.figure);
    if (!f) return false;
    if (family === "quant") return f.expr.op === "series";
    return fieldsRead(f).some(FAMILY_FIELDS[family]);
  });
}

/** A class's test in words, required gate and count included (lib/recipes.ts classWords). */
export function criteriaWords(c: ClassDef): string {
  return classWords(c);
}

export type AppliedSection = TemplateSection & {
  /** Lines the methodology adds to the section, each naming the element (a class id, a rule's section). */
  amendments: string[];
};
export type AppliedTemplate = { template: Template; family: FamilyRead; sections: AppliedSection[]; notes: string[] };

/**
 * The template a study follows: the person's own when they kept one, else the
 * canonical one for the methodology's family, each section amended with what
 * the methodology says about it. A section with nothing to add keeps the
 * canonical guidance alone.
 */
export function templateFor(m: Methodology, own: Template | null, ccy: string): AppliedTemplate {
  const family = familyOf(m);
  const template = own ?? canonicalTemplate(family.family);
  const rules = relevantRules(m, template.family);
  const sizing = m.rules.filter((r) => r.test && m.figures.find((f) => f.id === r.test!.figure)?.by && ["symbol", "holding", "class", "asset_class", "country", "currency"].includes(m.figures.find((f) => f.id === r.test!.figure)!.by!));
  const exits = m.rules.filter((r) => r.severity === "watch" || /sell|exit|kill|trim|stop/i.test(r.text));
  const valuation = m.rules.filter((r) => r.test && fieldsRead(m.figures.find((f) => f.id === r.test!.figure)!).some((f) => f.startsWith("own_valuation") || f === "price_to_own_valuation_pct"));
  const ruleLine = (r: Rule) => {
    const f = m.figures.find((x) => x.id === r.test!.figure)!;
    return `${r.section}: ${r.text} (tested as ${testWords({ expr: f.expr, unit: f.unit, is: r.test!.is, limit: r.test!.limit, each: f.by }, ccy)}; ${r.severity === "breach" ? "hard limit" : r.severity === "watch" ? "watch" : "guideline"})`;
  };
  const notes: string[] = [];
  const sections = template.sections.map((s): AppliedSection => {
    const amendments: string[] = [];
    if (s.tags.includes("classes") && m.classes.length) for (const c of m.classes) amendments.push(`Class ${c.label}: ${criteriaWords(c)}${c.about ? `. ${c.about}` : ""}`);
    if (s.tags.includes("rules")) for (const r of rules) amendments.push(ruleLine(r));
    if (s.tags.includes("sizing")) for (const r of sizing) if (!rules.includes(r)) amendments.push(ruleLine(r));
    if (s.tags.includes("exit")) for (const r of exits) amendments.push(r.test ? ruleLine(r) : `${r.section}: ${r.text} (yours to check)`);
    if (s.tags.includes("valuation")) for (const r of valuation) amendments.push(ruleLine(r));
    return { ...s, amendments: [...new Set(amendments)] };
  });
  if (!m.classes.length && template.sections.some((s) => s.tags.includes("classes"))) notes.push("The methodology sorts holdings into no classes, so the classification section explains which rules the subject meets rather than naming a class.");
  if (!rules.length) notes.push(`The methodology has no rule the app can test on a ${FAMILY_LABEL[template.family].toLowerCase()} study; the checks will say so.`);
  if (own && own.family !== family.family) notes.push(`Your template is for ${FAMILY_LABEL[own.family].toLowerCase()} studies; the methodology reads as ${FAMILY_LABEL[family.family].toLowerCase()}.`);
  return { template, family, sections, notes };
}

// ---------------------------------------------------------------------------
// Checking the subject against the methodology

export type CompanyCheck = { rule: Rule; status: "pass" | "near" | "fail" | "n/a"; actual: string | null; limit: string; detail: string; /** The figure the rule tests, by its label. */ figure: string };
/** One class's test on the subject, criterion by criterion, so the writer and the reader see which held. */
export type ClassTestRead = { classId: string; label: string; holds: boolean; passes: number; needed: number; unread: number; required: CriterionLine[]; criteria: CriterionLine[] };
export type CriterionLine = { label: string; value: string | null; pass: boolean; read: boolean; /** Why it was not measured, or which alternative met it. */ note: string | null };
export type CompanyVerdict = { classId: string | null; classLabel: string | null; checks: CompanyCheck[]; classTests: ClassTestRead[]; fields: { field: FieldId; label: string; value: string }[] };

const num = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

/** A one-holding book for the subject, so the methodology's recipes can run on it exactly as on a holding. */
export function subjectBook(ticker: string, name: string, fundamentals: Fundamentals["values"], price: number | null, ccy: string, today: string): Book {
  const h: Holding = {
    id: `research:${ticker}`,
    account: "Research",
    source: "manual",
    assetClass: "equity",
    symbol: ticker,
    name,
    quantity: 1,
    price,
    value: price ?? 0,
    costBasis: null,
    currency: ccy,
    asOf: today,
    valuation: "estimate",
    country: null,
    sector: null,
    themes: [],
    fundamentals: Object.fromEntries(Object.entries(fundamentals).map(([k, v]) => [k, num(v)])),
  };
  return bookSchema.parse({ asOf: today, holdings: [h], lookThrough: [], transactions: [], fx: { base: ccy, asOf: today, rates: {}, source: "research" } });
}

/**
 * The methodology's verdict on the subject: the class it falls in and every
 * relevant rule run on the subject's figures with the methodology's own
 * recipes. A rule whose figure needs a field the filings do not give is
 * "n/a" with the reason, never passing.
 */
export function checkCompany(m: Methodology, family: Family, book: Book, today: string): CompanyVerdict {
  const classOf = classifier(m.classes, evalCtx(book, today));
  const ctx = evalCtx(book, today, classOf);
  const h = book.holdings[0];
  const classId = h ? classOf(h) : null;
  const ccy = book.fx.base;
  const checks: CompanyCheck[] = relevantRules(m, family).map((rule) => {
    const f = m.figures.find((x) => x.id === rule.test!.figure)!;
    // The subject book is the app's own, so every holding field counts as supplied; only the fundamentals the filings lack are needs.
    const out = runTest({ expr: f.expr, unit: f.unit, is: rule.test!.is, limit: rule.test!.limit, each: f.by }, ctx, INPUT_IDS);
    const limit = formatUnit(rule.test!.limit, f.unit, ccy);
    if (out.needs.length) return { rule, status: "n/a", actual: null, limit, detail: needsWords(out.needs, inputLabel), figure: f.label };
    if (out.status === "n/a") return { rule, status: "n/a", actual: null, limit, detail: "The filings give no figure for this.", figure: f.label };
    return { rule, status: out.status, actual: formatUnit(out.actual, f.unit, ccy), limit, detail: "", figure: f.label };
  });
  const line = (x: CriterionRead): CriterionLine => ({ label: criterionLabel(x.filter), value: x.read ? (typeof x.value === "number" ? formatUnit(x.value, FIELDS[x.field].type === "pct" ? "pct" : FIELDS[x.field].type === "ratio" ? "ratio" : "number", ccy) : String(x.value)) : null, pass: x.pass, read: x.read, note: x.note });
  const classTests: ClassTestRead[] = h
    ? m.classes.map((c) => {
        const t = classTest(c, h, ctx);
        return { classId: c.id, label: c.label, holds: t.holds, passes: t.passes, needed: t.needed, unread: t.unread, required: t.required.map(line), criteria: t.criteria.map(line) };
      })
    : [];
  const fields = Object.entries(h?.fundamentals ?? {})
    .filter((e): e is [FieldId, number] => e[1] !== null && e[0] in FIELDS)
    .map(([field, value]) => ({ field, label: FIELDS[field].label, value: formatUnit(value, FIELDS[field].type === "pct" ? "pct" : FIELDS[field].type === "ratio" ? "ratio" : "number", ccy) }));
  return { classId, classLabel: classId ? (m.classes.find((c) => c.id === classId)?.label ?? classId) : null, checks, classTests, fields };
}

// ---------------------------------------------------------------------------
// The research file

export const MAX_STUDIES = 12;
/** What a section may hold: the words the writer is asked for, and the characters kept, with room for a table's markup. */
export const SECTION_WORDS = 1500;
export const SECTION_CHARS = 12000;
/** Sections written per model call, so one call fits a serverless function's time. */
export const SECTIONS_PER_STEP = 4;
/** A running study with no progress for this long was cut short (the function ended); the screen offers Continue. */
export const STALL_MINUTES = 8;

const criterionLineSchema = z.object({ label: z.string().max(400), value: z.string().max(40).nullable(), pass: z.boolean(), read: z.boolean(), note: z.string().max(200).nullable().default(null) });
export const classTestReadSchema = z.object({ classId: z.string().max(40), label: z.string().max(80), holds: z.boolean(), passes: z.number(), needed: z.number(), unread: z.number(), required: z.array(criterionLineSchema).max(12), criteria: z.array(criterionLineSchema).max(20) });

export const studySchema = z.object({
  id: z.string().regex(/^[a-f0-9]{12}$/),
  /** A ticker (uppercase) or a free subject for macro and quant studies. */
  subject: z.string().min(1).max(60),
  /** The ticker when the subject is one, so filings can be read. */
  ticker: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/).nullable(),
  question: z.string().max(600),
  family: z.enum(FAMILIES),
  templateTitle: z.string().max(120),
  /** The sections, in order, and what each must establish, frozen when the study was queued. */
  sections: z.array(templateSectionSchema.extend({ amendments: z.array(z.string().max(600)).max(40) })).min(1).max(30),
  status: z.enum(["queued", "running", "done", "failed"]),
  requestedAt: z.string(),
  /** When the run last made progress (queued, the verdict, a group of sections); a running study untouched for STALL_MINUTES was cut short. */
  touchedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable(),
  /** The facts table as text, the writer's only source of figures; null when the subject has no filings. */
  facts: z.string().max(20000).nullable(),
  factsNote: z.string().max(400).nullable(),
  fundamentals: z.record(z.string(), z.number().nullable()),
  fundamentalsNotes: z.array(z.string().max(300)).max(30),
  verdict: z
    .object({
      classId: z.string().nullable(),
      classLabel: z.string().nullable(),
      checks: z.array(z.object({ ruleId: z.string(), section: z.string(), text: z.string(), severity: z.string(), status: z.enum(["pass", "near", "fail", "n/a"]), actual: z.string().nullable(), limit: z.string(), detail: z.string(), figure: z.string().max(80).default("") })).max(40),
      /** Every class's test, criterion by criterion; empty in studies written before it was kept. */
      classTests: z.array(classTestReadSchema).max(20).default([]),
    })
    .nullable(),
  /** The subject as held in the book when it is: price, weight, cap, the owner's valuation; null when not held. Studies written before it was kept read as null. */
  holding: z.object({ price: z.number(), currency: z.string().max(3), quantity: z.number(), weightPct: z.number(), capPct: z.number().nullable(), classLabel: z.string().max(80).nullable(), ownValuation: z.object({ low: z.number().nullable(), base: z.number(), high: z.number().nullable(), asOf: z.string(), basis: z.string().nullable() }).nullable() }).nullable().default(null),
  /** The market indicators as read when the study started, one line each; empty when the feed gave none. */
  markets: z.array(z.object({ name: z.string().max(60), value: z.string().max(40), asOf: z.string().max(10) })).max(20).default([]),
  /** The figures as numbers, for the charts and the PDF's tables; null without filings. */
  table: z.object({ cols: z.array(z.string().max(20)).max(8), rows: z.array(z.object({ key: z.string().max(40), label: z.string().max(80), unit: z.enum(["money", "perShare", "shares", "pct", "ratio"]), values: z.array(z.number().nullable()).max(8) })).max(40) }).nullable().default(null),
  /** Written prose by section id, Markdown. */
  written: z.record(z.string(), z.string().max(SECTION_CHARS)),
  /** Section ids still to write, in order. */
  pending: z.array(z.string()).max(30),
  error: z.string().max(400).nullable(),
  /** The results day a study was queued for by the earnings run (Hamza, 27 Oct 2026: a study at every post-earnings report); null for one the person asked for. */
  forResults: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});
export type Study = z.infer<typeof studySchema>;

export const researchFileSchema = z.object({ version: z.literal(1), studies: z.array(studySchema).max(MAX_STUDIES), updated: z.string() });
export type ResearchFile = z.infer<typeof researchFileSchema>;
export const EMPTY_RESEARCH: ResearchFile = { version: 1, studies: [], updated: "" };

export const TICKER = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/;
/** A subject that reads as a ticker is one; anything else (a theme, a country, a strategy) is a free subject. */
export function tickerOf(subject: string): string | null {
  const s = subject.trim();
  return TICKER.test(s) && !/\s/.test(s) ? s.toUpperCase() : null;
}

/** A new study, queued with the template frozen as it stands today. */
export function newStudy(id: string, subject: string, question: string, applied: AppliedTemplate, now: string, forResults: string | null = null): Study {
  const ticker = tickerOf(subject);
  return studySchema.parse({
    id,
    subject: ticker ?? subject.trim().slice(0, 60),
    ticker,
    question: question.trim().slice(0, 600),
    family: applied.template.family,
    templateTitle: applied.template.title,
    sections: applied.sections.map((s) => ({ ...s, amendments: s.amendments.map((a) => a.slice(0, 600)).slice(0, 40) })),
    status: "queued",
    requestedAt: now,
    touchedAt: now,
    finishedAt: null,
    facts: null,
    factsNote: null,
    fundamentals: {},
    fundamentalsNotes: [],
    verdict: null,
    holding: null,
    markets: [],
    table: null,
    written: {},
    pending: applied.sections.map((s) => s.id),
    error: null,
    forResults,
  });
}

/** Adds a study, dropping the oldest finished ones past the cap; a running study is never dropped. */
export function withStudy(file: ResearchFile, study: Study, now: string): ResearchFile {
  const studies = [study, ...file.studies.filter((s) => s.id !== study.id)];
  while (studies.length > MAX_STUDIES) {
    const i = studies.map((s, idx) => ({ s, idx })).reverse().find((x) => x.s.status === "done" || x.s.status === "failed")?.idx;
    if (i === undefined) throw new Error(`At most ${MAX_STUDIES} studies are kept; finish or remove one first.`);
    studies.splice(i, 1);
  }
  return researchFileSchema.parse({ version: 1, studies, updated: now });
}

export function replaceStudy(file: ResearchFile, study: Study, now: string): ResearchFile {
  return researchFileSchema.parse({ version: 1, studies: file.studies.map((s) => (s.id === study.id ? study : s)), updated: now });
}

export function withoutStudy(file: ResearchFile, id: string, now: string): ResearchFile {
  return researchFileSchema.parse({ version: 1, studies: file.studies.filter((s) => s.id !== id), updated: now });
}

/** The next sections to write: the first few still pending. */
export function nextStep(study: Study): TemplateSection[] {
  const ids = new Set(study.pending.slice(0, SECTIONS_PER_STEP));
  return study.sections.filter((s) => ids.has(s.id));
}

/** Every pending section, in groups of SECTIONS_PER_STEP in template order: the groups a background run writes side by side. */
export function stepGroups(study: Study): TemplateSection[][] {
  const out: TemplateSection[][] = [];
  for (let i = 0; i < study.pending.length; i += SECTIONS_PER_STEP) {
    const ids = new Set(study.pending.slice(i, i + SECTIONS_PER_STEP));
    out.push(study.sections.filter((s) => ids.has(s.id)));
  }
  return out;
}

/** True when a queued or running study has made no progress for STALL_MINUTES: its run ended before it finished. */
export function stalled(study: Study, nowIso: string): boolean {
  if (study.status !== "queued" && study.status !== "running") return false;
  const last = Date.parse(study.touchedAt ?? study.requestedAt);
  return Number.isFinite(last) && Date.parse(nowIso) - last > STALL_MINUTES * 60_000;
}

/** A results study that stopped is taken up again by itself this long after it stopped, for this many days after it was asked. */
export const RETRY_HOURS = 6;
export const RETRY_DAYS = 3;

/** Whether a study written for results, which stopped on a failure, is due to be taken up again without anyone pressing Continue. */
export function retryDue(study: Study, nowIso: string): boolean {
  if (!study.forResults || study.status !== "failed" || !study.pending.length) return false;
  const stopped = Date.parse(study.finishedAt ?? study.touchedAt ?? study.requestedAt);
  const now = Date.parse(nowIso);
  return now - stopped >= RETRY_HOURS * 3_600_000 && now - Date.parse(study.requestedAt) <= RETRY_DAYS * 86_400_000;
}

/**
 * The results study to take up by itself: one queued, one whose run ended
 * before it finished, or one that stopped on a failure some hours ago, each
 * only within RETRY_DAYS of being asked, so a study whose run is cut short
 * every time is not taken up again on every run for good.
 */
export function studyToTakeUp(studies: readonly Study[], nowIso: string): Study | undefined {
  const recent = (x: Study) => Date.parse(nowIso) - Date.parse(x.requestedAt) <= RETRY_DAYS * 86_400_000;
  return studies.find((x) => x.forResults && recent(x) && (x.status === "queued" || (x.status === "running" && stalled(x, nowIso)) || retryDue(x, nowIso)));
}

/** The study after a step's sections came back: written text kept, pending shrunk, done when nothing remains. */
export function afterStep(study: Study, written: Record<string, string>, now: string): Study {
  const ids = new Set(study.sections.map((s) => s.id));
  const kept = Object.fromEntries(Object.entries(written).filter(([k]) => ids.has(k)).map(([k, v]) => [k, v.slice(0, SECTION_CHARS)]));
  const pending = study.pending.filter((id) => !(id in kept));
  return studySchema.parse({ ...study, written: { ...study.written, ...kept }, pending, status: pending.length ? "running" : "done", touchedAt: now, finishedAt: pending.length ? null : now, error: null });
}

export function failStudy(study: Study, message: string, now: string): Study {
  return studySchema.parse({ ...study, status: "failed", error: message.slice(0, 400), touchedAt: now, finishedAt: now });
}

/** The study as one Markdown document, for reading and for download. */
export function studyMarkdown(study: Study): string {
  const head = [`# ${study.subject}${study.ticker && study.ticker !== study.subject ? ` (${study.ticker})` : ""}`, "", `${study.templateTitle} · ${FAMILY_LABEL[study.family]} · requested ${study.requestedAt.slice(0, 10)}${study.finishedAt ? `, finished ${study.finishedAt.slice(0, 10)}` : ""}`, "", study.question ? `**Question.** ${study.question}` : "", ""];
  const verdict = study.verdict
    ? [
        "## Methodology checks",
        "",
        study.verdict.classLabel ? `Class: **${study.verdict.classLabel}**.` : "No class of the methodology fits the subject.",
        "",
        ...(study.verdict.checks.length ? ["| Section | Rule | Figure | Limit | Now | Result |", "| :-- | :-- | :-- | :-- | :-- | :-- |", ...study.verdict.checks.map((c) => `| ${c.section} | ${c.text.replace(/\|/g, "/")} | ${c.figure} | ${c.limit} | ${c.actual ?? (c.detail || "")} | ${c.status === "n/a" ? "not testable" : c.status} |`)] : ["The methodology has no rule the app can test on this subject."]),
        "",
        ...classTestsMarkdown(study),
      ]
    : [];
  const context = [
    ...(study.holding ? [`**In the book.** ${study.holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} units at ${study.holding.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${study.holding.currency}, ${study.holding.weightPct.toFixed(2)}% of net worth${study.holding.capPct !== null ? ` against a ${study.holding.capPct}% cap` : ""}${study.holding.classLabel ? `, ${study.holding.classLabel}` : ""}${study.holding.ownValuation ? `; own valuation ${study.holding.ownValuation.low ?? "–"} / ${study.holding.ownValuation.base} / ${study.holding.ownValuation.high ?? "–"} as of ${study.holding.ownValuation.asOf}` : "; no own valuation recorded"}.`, ""] : []),
    ...(study.markets.length ? [`**Markets when the study started.** ${study.markets.map((r) => `${r.name} ${r.value}`).join(" · ")} (as of ${study.markets[0].asOf}).`, ""] : []),
  ];
  const body = study.sections.flatMap((s) => [`## ${s.title}`, "", study.written[s.id] ?? (study.pending.includes(s.id) ? "_Not written yet._" : ""), ""]);
  return [...head, ...context, ...verdict, ...body, ...factsBlock(study), "_Written from the figures above and the methodology's own checks. Not investment advice._"].join("\n");
}

/** A criterion's reading with its note: "0.6x", "no reading (not measured: Loans receivable to equity at most 1 does not hold)", "-120m (met by Net interest expense at most 0 (when Net debt at most 0))". */
export const readingWords = (x: CriterionLine): string => `${x.value ?? "no reading"}${x.note ? ` (${x.note})` : ""}`;

/** The class tests as Markdown tables, one per class, the one that holds first. */
export function classTestsMarkdown(study: Study): string[] {
  const tests = study.verdict?.classTests ?? [];
  if (!tests.length) return [];
  const out: string[] = ["### Classification Test", ""];
  for (const t of [...tests].sort((a, b) => Number(b.holds) - Number(a.holds))) {
    out.push(`**${t.label}**: ${t.holds ? "holds" : "does not hold"}; ${passWords(t)}.`, "", "| Criterion | Reading | Result |", "| :-- | :-- | :-- |");
    for (const x of t.required) out.push(`| ${x.label} (required) | ${readingWords(x)} | ${x.pass ? "pass" : x.read ? "fail" : "no reading"} |`);
    for (const x of t.criteria) out.push(`| ${x.label} | ${readingWords(x)} | ${x.pass ? "pass" : x.read ? "fail" : "no reading"} |`);
    out.push("");
  }
  return out;
}

function factsBlock(study: Study): string[] {
  return study.facts ? ["## Figures from the filings", "", "```", study.facts, "```", "", ...(study.fundamentalsNotes.length ? ["Derivations not possible: " + study.fundamentalsNotes.join("; ") + "."] : []), ""] : study.factsNote ? [`_${study.factsNote}_`, ""] : [];
}

/**
 * Lays finished research on the book: a holding whose symbol was studied gets
 * the fundamentals the filings gave, so the methodology's recipes can read
 * them (the context marks those fields as supplied). The latest study wins.
 */
export function applyResearch(book: Book, research: ResearchFile | null): Book {
  if (!research?.studies.length) return book;
  const byTicker = new Map<string, Study>();
  for (const s of [...research.studies].reverse()) if (s.ticker && Object.keys(s.fundamentals).length) byTicker.set(s.ticker, s);
  if (!byTicker.size) return book;
  return { ...book, holdings: book.holdings.map((h) => (byTicker.has(h.symbol.toUpperCase()) ? { ...h, fundamentals: { ...h.fundamentals, ...byTicker.get(h.symbol.toUpperCase())!.fundamentals } } : h)) };
}
