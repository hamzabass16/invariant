import { Donut, type Slice } from "@/components/charts/donut";

/** The lines a filing reports, as the filings entry or a report's detail keeps them. */
type GeographyLike = { form: string; period: string; lines: { name: string; sharePct: number; grain?: "country" | "region" }[]; partial: boolean; placedPct?: number };

// The fixed categorical order, largest line first: four hues, then the rest folded into one grey, and what the lines do not place lighter still.
const HUES = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)"] as const;
const OTHER = "var(--arch-none)";
const UNPLACED = "color-mix(in oklab, var(--arch-none), var(--surface) 45%)";

/**
 * One company's revenue by geography as a donut (Hamza, 23 Oct 2026): its
 * own reported lines, in its own grain, from the latest filing that gives
 * them. The four largest keep a hue each; the rest are one "Other" slice, and
 * the share no line places is its own slice, never folded into a line.
 */
function slicesOf(lines: { name: string; sharePct: number; group: string; detail?: string }[], unplacedPct: number): Slice[] {
  const sorted = [...lines].sort((a, b) => b.sharePct - a.sharePct);
  const head = sorted.length > HUES.length + 1 ? sorted.slice(0, HUES.length) : sorted.slice(0, HUES.length + 1);
  const rest = sorted.slice(head.length);
  const slices: Slice[] = head.map((l, i) => ({ key: l.name, label: l.name, value: l.sharePct, color: HUES[i] ?? OTHER, group: l.group, detail: l.detail }));
  if (rest.length) slices.push({ key: "other", label: "Other", value: rest.reduce((s, l) => s + l.sharePct, 0), color: OTHER, group: rest.map((l) => l.name).join(", ") });
  if (unplacedPct >= 0.05) slices.push({ key: "unplaced", label: "Not placed", value: unplacedPct, color: UNPLACED, group: "The lines do not place it" });
  return slices;
}

export function companyGeographySlices(g: GeographyLike): Slice[] {
  const placed = g.placedPct ?? g.lines.reduce((s, l) => s + l.sharePct, 0);
  return slicesOf(
    g.lines.map((l) => ({ name: l.name, sharePct: l.sharePct, group: l.grain === "country" ? "Country" : l.grain === "region" ? "Region" : "Reported line" })),
    g.partial ? Math.max(0, 100 - placed) : 0,
  );
}

function MixDonut({ title, subtitle, slices, lines, head }: { title: string; subtitle: string; slices: Slice[]; lines: number; head: string[] }) {
  return (
    <Donut
      title={title}
      subtitle={subtitle}
      slices={slices}
      legend={slices.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))}
      centre={{ value: String(lines), label: lines === 1 ? "line" : "lines" }}
      tableCaption={`${title}, by the lines the filing reports`}
      tableHead={head}
    />
  );
}

export function CompanyGeography({ geography }: { geography: GeographyLike }) {
  return <MixDonut title="Revenue by geography" subtitle={`Share of revenue, ${geography.period}, from the ${geography.form}.`} slices={companyGeographySlices(geography)} lines={geography.lines.length} head={["Line", "Share", "Reported as", ""]} />;
}
