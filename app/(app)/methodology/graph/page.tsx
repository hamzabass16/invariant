import { GitFork } from "lucide-react";
import Link from "next/link";

import { GraphExplorer, type NodeDetail } from "@/components/methodology/graph-explorer";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { classWaiting, computeFigure, contextFor, evaluate, graph, testedAs, type Methodology } from "@/lib/methodology";
import { FIELDS, PANELS } from "@/lib/ontology";
import { classWords, exprWords, formatUnit } from "@/lib/recipes";
import { INPUTS, type InputId } from "@/lib/setup";
import { localDay } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Methodology graph · Invariant" };

const VIEW_WORDS = { tile: "one number", bars: "bars", line: "a line over time", donut: "a donut", table: "a table" } as const;

/** What the explorer shows for each node: the recipe in words, the current value or status, where it comes from. */
function detailsFor(m: Methodology, book: Parameters<typeof contextFor>[0] | null, today: string, inputs: readonly InputId[]): Record<string, NodeDetail> {
  const out: Record<string, NodeDetail> = {};
  const ccy = book?.fx.base ?? "USD";
  const ctx = book ? contextFor(book, today, m) : null;
  for (const f of m.figures) {
    const lines = [`${exprWords(f.expr).replace(/^./, (c) => c.toUpperCase())}${f.by ? `, by ${f.by.replace("_", " ")}` : ""}.`, `Shown as ${VIEW_WORDS[f.view]}, in ${f.unit === "money" ? ccy : f.unit}.`];
    if (f.about) lines.unshift(f.about);
    let value: string | undefined;
    if (ctx) {
      const r = computeFigure(f, ctx, inputs);
      if (r.needs.length) lines.push(`Waiting for ${r.needs.map((n) => n.label.toLowerCase()).join(", ")}.`);
      else if (r.kind === "scalar") value = formatUnit(r.value, f.unit, ccy);
      else value = `${r.points.length} groups`;
    }
    out[`figure:${f.id}`] = { lines, value };
  }
  for (const c of m.classes) {
    const n = ctx ? ctx.book.holdings.filter((h) => ctx.classOf(h) === c.id).length : null;
    const waiting = classWaiting(c, inputs, ctx?.supplied);
    out[`class:${c.id}`] = { lines: [c.about ?? "", `${classWords(c)}. A holding is in the first class whose test holds${c.minimum !== undefined && c.minimum < c.criteria.length ? `; this one asks for ${c.minimum} of its ${c.criteria.length} criteria` : c.minimumShare !== undefined ? `; this one asks for ${c.minimumShare}% of the criteria that could be measured` : ""}.`, waiting].filter(Boolean), value: n === null ? undefined : `${n} holdings` };
  }
  const findings = book ? evaluate(m, book, today, inputs) : [];
  for (const r of m.rules) {
    const f = findings.find((x) => x.rule.id === r.id);
    out[`rule:${r.id}`] = {
      lines: [`${testedAs(r, m, ccy)}.`, r.severity === "breach" ? "A hard limit in the document." : "A guideline in the document.", f?.detail ?? ""].filter(Boolean),
      status: f?.status,
      value: f?.actual ? `${f.actual} vs ${f.limit}` : undefined,
    };
  }
  for (const [id, d] of Object.entries(FIELDS)) {
    out[`field:${id}`] = { lines: [d.about, d.suppliedBy === "none" ? "No connection supplies this yet." : d.suppliedBy === "feed" ? "Supplied by the public market feed." : `Supplied by ${d.suppliedBy.map((i) => INPUTS[i].label).join(", ")}.`] };
  }
  for (const [id, d] of Object.entries(INPUTS)) out[`input:${id}`] = { lines: [d.how, inputs.includes(id as InputId) ? "Connected in Setup." : "Not among your inputs."] };
  for (const [id, p] of Object.entries(PANELS)) out[`panel:${id}`] = { lines: [p.about, "A view the app draws itself."] };
  const sections = new Set(m.rules.map((r) => r.section));
  for (const s of sections) out[`section:${s}`] = { lines: [`Section ${s} of ${m.source.title}.`, `${m.rules.filter((r) => r.section === s).length} rules come from it.`] };
  out.dashboard = { lines: [`Leads with ${m.dashboard.headline.length} figures, then ${m.dashboard.sections.length} sections in the methodology's order.`] };
  return out;
}

/**
 * The methodology as an explorable graph: what reads what, what tests what,
 * what the dashboard shows and where in the document each rule sits.
 */
export default async function GraphPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const ws = await screen("methodology");
  const { draft } = await searchParams;
  const m = draft === "1" && ws.draft ? ws.draft : (ws.setup.methodology ?? ws.draft);
  const today = localDay();
  if (!m) {
    return (
      <>
        <PageHeader title="Methodology graph" />
        <PageBody>
          <EmptyState
            icon={GitFork}
            title="No methodology yet"
            instruction="Attach a document or ask for a suggested one, and its figures, classes, rules and dashboard appear here as a graph."
            action={
              <Link href="/methodology" className={buttonStyles({ variant: "secondary" })}>
                Methodology
              </Link>
            }
          />
        </PageBody>
      </>
    );
  }
  const g = graph(m);
  const isDraft = m === ws.draft && m !== ws.setup.methodology;
  return (
    <>
      <PageHeader title="Methodology graph" subtitle={`${m.name}${isDraft ? " (draft)" : ""}`} />
      <PageBody>
        <p className="mb-4 px-1 text-subhead text-text-secondary">
          Every element of your methodology and what it depends on.{" "}
          <Link href="/methodology" className="text-accent-text">
            Back to the methodology
          </Link>
          , or{" "}
          <Link href="/methodology/ontology" className="text-accent-text">
            the ontology it is written in
          </Link>
          .
        </p>
        <GraphExplorer title={m.name} nodes={g.nodes} edges={g.edges} details={detailsFor(m, ws.book, today, ws.setup.inputs)} json={JSON.stringify({ methodology: m.name, exported: today, ...g }, null, 1)} />
        <p className="mt-6 px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
