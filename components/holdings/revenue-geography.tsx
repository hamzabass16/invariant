import type { Slice } from "@/components/charts/donut";
import type { DonutView } from "@/components/charts/donut-tabs";
import type { LegendItem } from "@/components/charts/frame";
import { NO_SPLIT, NOT_PLACED, revenueByRegion, type RevenueRegion } from "@/lib/exposure";
import { money, type Book } from "@/lib/holdings";

// One hue per region, in a fixed order, so a region keeps its colour whichever are present; what no filing places is neutral.
const REGION_COLOR: Record<RevenueRegion, string> = {
  Americas: "var(--arch-tr)",
  "Europe, Middle East and Africa": "var(--arch-cm)",
  "Asia-Pacific": "var(--arch-dg)",
  "Rest of world, not split": "var(--arch-ph)",
};
const REST_COLOR = "var(--arch-none)";
const UNPLACED_COLOR = "color-mix(in oklab, var(--arch-none), var(--surface) 45%)";

const list = (xs: string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

/**
 * Revenue by region, a view of the one donut card on Holdings: each company's revenue by geography as its latest
 * filing reports it, weighted by what is held, each reported line in the one
 * region it names, so no region overlaps another (lib/exposure.ts
 * revenueByRegion). What no filing places is its own named slice. The table
 * view names the reported lines behind each region.
 */
export function regionView(book: Book): DonutView | null {
  const ccy = book.fx.base;
  const g = revenueByRegion(book);
  if (!g.regions.length) return null;
  const slices: Slice[] = g.regions.map((r) => ({ key: r.region, label: r.region, value: r.share * 100, color: REGION_COLOR[r.region], group: list(r.lines, 4), detail: `${money(r.value, ccy)} · ${list(r.symbols)}` }));
  if (g.unplaced.value > 0) slices.push({ key: "unplaced", label: NOT_PLACED, value: g.unplaced.share * 100, color: UNPLACED_COLOR, group: "Not placed", detail: `${money(g.unplaced.value, ccy)} · ${list(g.unplaced.symbols)}` });
  if (g.rest.count) slices.push({ key: "rest", label: NO_SPLIT, value: g.rest.share * 100, color: REST_COLOR, group: "Not placed", detail: `${money(g.rest.value, ccy)} · ${list(g.rest.labels)}` });
  const legend: LegendItem[] = slices.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }));
  return {
    key: "regions",
    tab: "Regions",
    title: "Revenue by region",
    subtitle: `Share of net worth, by where each company's revenue is earned, from its latest filing. Companies report regions more often than countries, so a line is placed in the one region it names; "Rest of world" is what a company reports only as outside its home. In ${ccy}.`,
    slices,
    legend,
    labelFrom: 1.5,
    centre: { value: String(g.companies.length), label: g.companies.length === 1 ? "company" : "companies" },
    tableCaption: "Net worth by the region each company's revenue is earned in",
    tableHead: ["Region", "Share", "Reported as", "Value and holdings"],
    values: Object.fromEntries(g.regions.map((r) => [r.region, money(r.value, ccy)])),
  };
}
