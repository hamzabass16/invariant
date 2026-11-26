import type { AssetClass } from "@/lib/holdings";

/** Plain names and one hue per group of asset classes. Colour follows the class, never the holding. */
export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: "Stocks",
  etf: "Funds (listed)",
  option: "Options",
  bond: "Bonds",
  deposit: "Deposits",
  cash: "Cash",
  private_fund: "Private funds",
  real_estate: "Real estate",
  other: "Other",
};

export function assetClassColor(c: string): string {
  if (c === "equity" || c === "etf" || c === "option") return "var(--arch-tr)";
  if (c === "bond" || c === "deposit" || c === "cash") return "var(--arch-cm)";
  if (c === "private_fund") return "var(--arch-dg)";
  if (c === "real_estate") return "var(--arch-ph)";
  return "var(--arch-none)";
}

export const ASSET_GROUPS = [
  { label: "Listed", color: "var(--arch-tr)" },
  { label: "Fixed income and cash", color: "var(--arch-cm)" },
  { label: "Private funds", color: "var(--arch-dg)" },
  { label: "Real estate", color: "var(--arch-ph)" },
];

/** Categorical hues in a fixed order, for slices that are not classes (sectors, payers): the seventh and later fold into "more". */
export const CATEGORY_HUES = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)", "var(--series-spy)", "var(--series-qqq)", "var(--accent-text)"] as const;
