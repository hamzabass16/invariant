/**
 * Rule packs (Hamza, 9 Nov 2026, the twenty more ways): a few ready-made
 * rules anyone can lay on their own methodology, each with the figures it
 * tests, in the ontology's own recipe language. Adding a pack makes a draft
 * the person checks and confirms like any other; a figure or rule the
 * methodology already has (by id) is kept as it is. A pack holds no symbol
 * and nothing of anyone's portfolio. Pure.
 */
import { methodologySchema, ruleSchema, type Methodology, type Rule } from "@/lib/methodology";
import { figureSchema, type Figure } from "@/lib/recipes";

export type RulePack = { id: string; name: string; about: string; figures: Figure[]; rules: Rule[] };

const LISTED = { field: "asset_class", is: "not_in", value: ["cash", "deposit", "option"] };
const whole = { measure: "sum", over: "holdings", field: "owner_value", where: [] };

/** The packs as written; parsed once against the ontology's own schemas below, so a pack that does not hold fails at load. */
const RAW = [
  {
    id: "concentration",
    name: "Concentration",
    about: "No single holding above a tenth of the book, and the five largest together under half.",
    figures: [
      { id: "largest-holding", label: "Largest holding", about: "The biggest single position as a share of the portfolio.", unit: "pct", expr: { op: "ratio", num: { measure: "max", over: "holdings", field: "owner_value", where: [LISTED] }, den: whole }, view: "tile" },
      { id: "top5-share", label: "Five largest together", about: "The five largest positions as a share of the portfolio.", unit: "pct", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "owner_value", where: [LISTED], top: 5 }, den: whole }, view: "tile" },
    ],
    rules: [
      { id: "pack-largest-cap", section: "Concentration", text: "No single holding above 10% of the portfolio.", severity: "breach", test: { figure: "largest-holding", is: "lte", limit: 10 } },
      { id: "pack-top5-cap", section: "Concentration", text: "The five largest holdings together under 50% of the portfolio.", severity: "guideline", test: { figure: "top5-share", is: "lte", limit: 50 } },
    ],
  },
  {
    id: "diversification",
    name: "Diversification",
    about: "At least fifteen stocks and funds, and no sector above a third of the book.",
    figures: [
      { id: "stock-count", label: "Number of stocks", about: "The stocks and funds held.", unit: "count", expr: { op: "measure", of: { measure: "count", over: "holdings", where: [{ field: "asset_class", is: "in", value: ["equity", "etf"] }] } }, view: "tile" },
      { id: "weight-by-sector", label: "Weight by sector", about: "Each sector's share of the portfolio.", unit: "pct", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "owner_value", where: [{ field: "asset_class", is: "in", value: ["equity", "etf"] }] }, den: { ...whole, whole: true } }, by: "sector", view: "bars" },
    ],
    rules: [
      { id: "pack-min-holdings", section: "Diversification", text: "Hold at least 15 stocks or funds.", severity: "guideline", test: { figure: "stock-count", is: "gte", limit: 15 } },
      { id: "pack-sector-cap", section: "Diversification", text: "No sector above 35% of the portfolio.", severity: "guideline", test: { figure: "weight-by-sector", is: "lte", limit: 35 } },
    ],
  },
  {
    id: "drawdown",
    name: "Drawdown",
    about: "Be told when the book has fallen a fifth from its high within a year.",
    figures: [{ id: "max-drawdown-1y", label: "Worst drawdown, one year", about: "The deepest fall from a high over the past year.", unit: "pct", expr: { op: "series", stat: "max_drawdown", of: "nav", period: "1y" }, view: "tile" }],
    rules: [{ id: "pack-drawdown-watch", section: "Drawdown", text: "Tell me when the portfolio has fallen 20% from its high within the past year.", severity: "watch", test: { figure: "max-drawdown-1y", is: "gte", limit: -20 } }],
  },
  {
    id: "cash",
    name: "Cash buffer",
    about: "Keep between 2% and 20% of the book in cash.",
    figures: [{ id: "cash-share", label: "Cash", about: "Cash and deposits as a share of the portfolio.", unit: "pct", expr: { op: "ratio", num: { measure: "sum", over: "holdings", field: "owner_value", where: [{ field: "asset_class", is: "in", value: ["cash", "deposit"] }] }, den: whole }, view: "tile" }],
    rules: [
      { id: "pack-cash-floor", section: "Cash buffer", text: "Keep at least 2% of the portfolio in cash.", severity: "guideline", test: { figure: "cash-share", is: "gte", limit: 2 } },
      { id: "pack-cash-ceiling", section: "Cash buffer", text: "Keep no more than 20% of the portfolio in cash.", severity: "guideline", test: { figure: "cash-share", is: "lte", limit: 20 } },
    ],
  },
];

export const RULE_PACKS: readonly RulePack[] = RAW.map((p) => ({ id: p.id, name: p.name, about: p.about, figures: p.figures.map((f) => figureSchema.parse(f)), rules: p.rules.map((r) => ruleSchema.parse(r)) }));

export const rulePack = (id: string): RulePack | null => RULE_PACKS.find((p) => p.id === id) ?? null;

/** Which of a pack's rules the methodology already has, by id or by testing the same figure the same way. */
export function packHeld(m: Methodology, p: RulePack): boolean {
  return p.rules.every((r) => m.rules.some((x) => x.id === r.id || (!!x.test && !!r.test && x.test.figure === r.test.figure && x.test.is === r.test.is)));
}

/**
 * The methodology with a pack laid on it, as a draft (not adopted until
 * confirmed): its figures and rules that are not there yet, and a dashboard
 * section of the pack's figures. Null with the reason when it would not fit
 * (the methodology's limits) or adds nothing.
 */
export function withPack(m: Methodology, p: RulePack): { draft: Methodology } | { error: string } {
  const figs = new Set(m.figures.map((f) => f.id));
  const rules = new Set(m.rules.map((r) => r.id));
  const addFigures = p.figures.filter((f) => !figs.has(f.id));
  const addRules = p.rules.filter((r) => !rules.has(r.id) && !m.rules.some((x) => x.test && r.test && x.test.figure === r.test.figure && x.test.is === r.test.is));
  if (!addRules.length) return { error: `Your methodology already has the ${p.name.toLowerCase()} rules.` };
  if (m.figures.length + addFigures.length > 40 || m.rules.length + addRules.length > 40) return { error: "Your methodology is at its limit of 40 figures or rules; remove some first." };
  const shown = new Set(m.dashboard.sections.flatMap((s) => (s.kind === "figures" ? s.figures : [])));
  const sectionFigures = p.figures.map((f) => f.id).filter((id) => !shown.has(id));
  const sections = sectionFigures.length && m.dashboard.sections.length < 12 ? [...m.dashboard.sections, { kind: "figures" as const, label: p.name.slice(0, 60), figures: sectionFigures, from: p.name.slice(0, 20) }] : m.dashboard.sections;
  const parsed = methodologySchema.safeParse({ ...m, figures: [...m.figures, ...addFigures], rules: [...m.rules, ...addRules], dashboard: { ...m.dashboard, sections } });
  return parsed.success ? { draft: parsed.data } : { error: parsed.error.issues[0]?.message ?? "The pack does not fit this methodology." };
}
