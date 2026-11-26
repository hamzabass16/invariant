import type { Slice } from "@/components/charts/donut";
import type { DonutView } from "@/components/charts/donut-tabs";
import type { LegendItem } from "@/components/charts/frame";
import { ASSET_CLASS_LABEL, ASSET_GROUPS, assetClassColor, CATEGORY_HUES } from "@/lib/asset-classes";
import { companyHref } from "@/lib/company";
import { netWorth } from "@/lib/exposure";
import { pct } from "@/lib/format";
import { money, type AssetClass, type Book } from "@/lib/holdings";
import type { Methodology } from "@/lib/methodology";
import type { ClassMix, Weight } from "@/lib/screens";

// One hue per class in the methodology's order; "No class yet" is grey.
const CLASS_PALETTE = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)", "var(--series-spy)", "var(--series-qqq)", "var(--viz-text)", "var(--text-tertiary)"];
const CASH_COLOR = "var(--text-tertiary)";

export function classColor(m: Methodology | null, classId: string | null) {
  if (!classId) return "var(--arch-none)";
  const i = (m?.classes ?? []).findIndex((c) => c.id === classId);
  return i < 0 ? "var(--arch-none)" : CLASS_PALETTE[i % CLASS_PALETTE.length];
}

/** Lightness steps within a class so neighbouring holdings read apart; the label does the naming. */
function step(color: string, i: number) {
  return i === 0 ? color : `color-mix(in oklab, ${color}, var(--surface) ${Math.min(60, i * 16)}%)`;
}

/**
 * The views of the one donut card on Holdings (Hamza, 19 Oct 2026: one large
 * card with tabs instead of a donut each): by holding (coloured by class in
 * the methodology's order, lightness stepping within a class, cash one
 * slice), by class, by asset class, by currency; sectors and revenue by
 * region are built beside their own data. Each is a slot the methodology
 * switches on (lib/ontology.ts).
 */
export function holdingView(m: Methodology | null, mix: ClassMix[], weights: Weight[], ccy: string): DonutView {
  const mixColor = (c: ClassMix) => (c.kind === "cash" ? CASH_COLOR : classColor(m, c.classId));
  const slices: Slice[] = mix.flatMap((c) =>
    c.kind === "cash"
      ? [{ key: "cash", label: "Cash", value: c.weight, color: CASH_COLOR, group: "Cash", detail: "cash and deposits" }]
      : (() => {
          const rows = weights.filter((w) => w.classId === c.classId);
          const out: Slice[] = rows.map((w, i) => ({ key: w.symbol, label: w.symbol, value: w.weight, color: step(mixColor(c), i), group: w.classLabel, detail: w.cap ? `cap ${w.cap.cap}%` : "no cap", href: companyHref(w.symbol) }));
          // Cash and deposits a class takes in carry no symbol weight; they are one slice, so the ring adds up to net worth.
          const rest = c.weight - rows.reduce((t, w) => t + w.weight, 0);
          if (rest > 0.05) out.push({ key: `${c.classId ?? c.kind}-cash`, label: rows.length ? `${c.label} cash` : c.label, value: rest, color: step(mixColor(c), rows.length), group: c.label, detail: "cash and deposits" });
          return out;
        })(),
  ).sort((a, b) => b.value - a.value);
  const values = Object.fromEntries(weights.map((w) => [w.symbol, money(w.value, ccy)]));
  return {
    key: "holdings",
    tab: "Holdings",
    title: "Portfolio by holding",
    subtitle: "Weight of net worth, coloured by class; the cap is in the table.",
    slices,
    legend: classLegend(m, mix),
    centre: { value: String(weights.length), label: weights.length === 1 ? "holding" : "holdings" },
    tableCaption: "Weight of each holding, with its class and cap",
    tableHead: ["Holding", "Weight", "Class", "Cap"],
    values,
  };
}

function classLegend(m: Methodology | null, mix: ClassMix[]): LegendItem[] {
  return mix.map((c) => ({ label: c.label, color: c.kind === "cash" ? CASH_COLOR : classColor(m, c.classId), kind: "rect" as const }));
}

export function classView(m: Methodology | null, mix: ClassMix[], cash: number): DonutView {
  const slices: Slice[] = mix.map((c) => ({ key: c.classId ?? c.kind, label: c.label, value: c.weight, color: c.kind === "cash" ? CASH_COLOR : classColor(m, c.classId), group: c.label, detail: `${c.count} holding${c.count === 1 ? "" : "s"}${c.cap ? ` · cap ${c.cap.cap}%` : ""}` }));
  return {
    key: "classes",
    tab: "Classes",
    title: "Portfolio by class",
    subtitle: "Weight by the methodology's classes; holdings its classes do not place are 'No class yet'.",
    slices,
    legend: classLegend(m, mix),
    centre: { value: pct(Math.max(0, 100 - cash), 0), label: "invested" },
    tableCaption: "Weight by class",
    tableHead: ["Class", "Weight", "Group", "Holdings"],
    values: Object.fromEntries(mix.map((c) => [c.classId ?? c.kind, `${c.count}`])),
  };
}

export function assetClassView(book: Book): DonutView {
  const ccy = book.fx.base;
  const nw = netWorth(book);
  const slices: Slice[] = nw.byAssetClass.map((s) => ({ key: s.key, label: ASSET_CLASS_LABEL[s.key as AssetClass] ?? s.key, value: s.share * 100, color: assetClassColor(s.key), group: s.key, detail: money(s.value, ccy) }));
  return {
    key: "asset-classes",
    tab: "Asset classes",
    title: "By asset class",
    subtitle: `Net worth by asset class; real estate at the owner's share, net of mortgage. In ${ccy}.`,
    slices,
    legend: ASSET_GROUPS.map((g) => ({ ...g, kind: "rect" as const })),
    centre: { value: money(nw.total, ccy), label: "net worth" },
    tableCaption: "Net worth by asset class",
    tableHead: ["Asset class", "Share", "Group", "Value"],
    values: Object.fromEntries(nw.byAssetClass.map((s) => [s.key, money(s.value, ccy)])),
  };
}

export function currencyView(book: Book): DonutView | null {
  const ccy = book.fx.base;
  const nw = netWorth(book);
  if (!nw.byCurrency.length) return null;
  const slices: Slice[] = nw.byCurrency.map((c, i) => ({ key: c.key, label: c.key, value: c.share * 100, color: i < CATEGORY_HUES.length ? CATEGORY_HUES[i] : "var(--text-tertiary)", group: c.key, detail: money(c.value, ccy) }));
  return {
    key: "currencies",
    tab: "Currencies",
    title: "By currency",
    subtitle: `Net worth by the currency each holding is priced in. In ${ccy}.`,
    slices,
    legend: slices.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const })),
    centre: { value: String(nw.byCurrency.length), label: nw.byCurrency.length === 1 ? "currency" : "currencies" },
    tableCaption: "Net worth by currency",
    tableHead: ["Currency", "Share", "Currency", "Value"],
    values: Object.fromEntries(nw.byCurrency.map((c) => [c.key, money(c.value, ccy)])),
  };
}
