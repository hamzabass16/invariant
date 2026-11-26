import type { Route } from "next";
import Link from "next/link";

import { Columns } from "@/components/charts/columns";
import { Donut } from "@/components/charts/donut";
import { LineChart } from "@/components/charts/line-chart";
import { ListRow, ListSection } from "@/components/ui/list";
import { DATA_REFRESH_LABEL, dataOn, formatData, sourceWords, type CustomDataFile, type DataDef, type DataReading, type DataScreen } from "@/lib/custom-data";
import { longDate } from "@/lib/time";

/** A pie's parts in the fixed categorical order: four hues, then everything else folded into one grey "Other". */
const PIE_COLORS = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)"] as const;

function whenRead(r: DataReading | null): string {
  if (!r?.goodAt) return "Not read yet";
  return `Read ${longDate(r.goodAt.slice(0, 10))}`;
}

/** One line under each piece: where it came from, when, how often, and the pages a Claude reading named. */
function Provenance({ def, reading }: { def: DataDef; reading: DataReading | null }) {
  return (
    <div className="mt-2 px-1 text-caption text-text-tertiary">
      <p>
        {sourceWords(def)} · {whenRead(reading)} · {DATA_REFRESH_LABEL[def.refresh].toLowerCase()}
        {reading?.pages.length ? (
          <>
            {" · "}
            {reading.pages.map((p, i) => (
              <span key={p.url}>
                {i ? ", " : ""}
                <a href={p.url} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
                  {p.title}
                </a>
              </span>
            ))}
          </>
        ) : null}
      </p>
      {reading?.note ? <p className="mt-0.5">{reading.note}</p> : null}
      {reading?.problem ? <p className="mt-0.5 text-danger">{reading.problem}{reading.points.length ? " The last reading stays." : ""}</p> : null}
    </div>
  );
}

function Piece({ def, reading }: { def: DataDef; reading: DataReading | null }) {
  const pts = reading?.points ?? [];
  const fmt = `unit:${def.unit}` as const;
  if (!pts.length)
    return (
      <div className="card px-4 py-3">
        <p className="text-body font-medium">{def.name}</p>
        <p className="mt-1 text-subhead text-text-secondary">{reading?.problem ?? "Waiting for its first reading. It is read the next morning, or at once from Customise."}</p>
        <Provenance def={def} reading={null} />
      </div>
    );
  if (def.format === "number") {
    const p = pts[pts.length - 1];
    return (
      <div className="card px-4 py-3">
        <p className="text-footnote text-text-secondary">{def.name}</p>
        <p className="data mt-1 text-title-2">{formatData(p.value, def.unit)}</p>
        <p className="text-caption text-text-tertiary">{/^\d{4}-\d{2}-\d{2}$/.test(p.x) ? `As of ${longDate(p.x)}` : p.x}</p>
        <Provenance def={def} reading={reading} />
      </div>
    );
  }
  if (def.format === "line")
    return (
      <div>
        <LineChart title={def.name} subtitle={def.about || undefined} dates={pts.map((p) => p.x)} series={[{ key: def.id, label: def.name, color: "var(--series-hcmp)", values: pts.map((p) => p.value) }]} format={fmt} tableCaption={def.name} tableEvery={pts.length > 60 ? Math.ceil(pts.length / 40) : 1} />
        <Provenance def={def} reading={reading} />
      </div>
    );
  if (def.format === "bar")
    return (
      <div>
        <Columns title={def.name} subtitle={def.about || undefined} labels={pts.map((p) => p.x)} values={pts.map((p) => p.value)} color="var(--series-hcmp)" format={fmt} tableCaption={def.name} />
        <Provenance def={def} reading={reading} />
      </div>
    );
  if (def.format === "pie") {
    const positive = pts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
    const total = positive.reduce((a, p) => a + p.value, 0) || 1;
    // A part the source itself calls "Other" joins the grey rest, so the pie never shows two.
    const isOther = (p: { x: string }) => /^others?$/i.test(p.x.trim());
    const named = positive.filter((p) => !isOther(p));
    const top = named.slice(0, PIE_COLORS.length);
    const rest = [...named.slice(PIE_COLORS.length), ...positive.filter(isOther)];
    const parts = [...top.map((p, i) => ({ label: p.x, value: p.value, color: PIE_COLORS[i] })), ...(rest.length ? [{ label: rest.some(isOther) ? "Other" : rest.length === 1 ? rest[0].x : `Other (${rest.length})`, value: rest.reduce((a, p) => a + p.value, 0), color: "var(--arch-none)" }] : [])];
    return (
      <div>
        <Donut
          title={def.name}
          subtitle={def.about || undefined}
          slices={parts.map((p, i) => ({ key: `${i}`, label: p.label, value: (p.value / total) * 100, color: p.color, group: p.label, detail: formatData(p.value, def.unit) }))}
          legend={parts.map((p) => ({ label: p.label, color: p.color, kind: "rect" as const }))}
          centre={{ value: formatData(total, def.unit), label: "in all" }}
          tableCaption={def.name}
          tableHead={["Part", "Share", "Part", "Value"]}
        />
        <Provenance def={def} reading={reading} />
      </div>
    );
  }
  return (
    <div>
      <ListSection header={def.name} footer={def.about || undefined}>
        {pts.map((p) => (
          <ListRow key={p.x} label={p.x} value={<span className="data">{formatData(p.value, def.unit)}</span>} />
        ))}
      </ListSection>
      <Provenance def={def} reading={reading} />
    </div>
  );
}

/**
 * The data the person added themselves on this screen, in the order they
 * added it: numbers as tiles, then charts and tables, each saying where it
 * came from and when. Nothing is drawn when they added none here.
 */
export function YourData({ file, screen, demo }: { file: CustomDataFile; screen: DataScreen; demo: boolean }) {
  const pieces = dataOn(file, screen);
  if (!pieces.length) return null;
  const numbers = pieces.filter((p) => p.def.format === "number");
  const charts = pieces.filter((p) => p.def.format !== "number");
  return (
    <section className="mb-8" aria-label="Your data">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="section-header">Your data</h2>
        <Link href={"/customise#your-data" as Route} className="text-footnote text-accent-text">
          {demo ? "Fictional samples · Add data" : "Add or change"}
        </Link>
      </div>
      {numbers.length ? (
        <div className="pair-grid-sm trio-grid mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {numbers.map((p) => (
            <Piece key={p.def.id} def={p.def} reading={p.reading} />
          ))}
        </div>
      ) : null}
      <div className="grid gap-6">
        {charts.map((p) => (
          <Piece key={p.def.id} def={p.def} reading={p.reading} />
        ))}
      </div>
    </section>
  );
}
