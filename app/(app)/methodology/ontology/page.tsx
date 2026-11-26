import Link from "next/link";

import { GraphExplorer, type GraphScheme } from "@/components/methodology/graph-explorer";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { ONTOLOGY_KIND_LABEL, ontologyDetails, ontologyGraph } from "@/lib/ontology-graph";
import { localDay } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Ontology · Invariant" };

/** The ontology's layout: inputs, objects, fields, the operations, the panels and slots, the screens, the conditions. */
const ONTOLOGY_SCHEME: GraphScheme = {
  columns: [["input"], ["object"], ["field"], ["measure", "window", "dimension", "stat"], ["panel", "slot"], ["screen"], ["condition"]],
  columnLabels: ["Inputs", "Objects", "Fields", "Operations", "Panels and slots", "Screens", "Conditions"],
  kindLabel: ONTOLOGY_KIND_LABEL,
  kindColor: {
    input: "var(--arch-none)",
    object: "var(--text)",
    field: "var(--series-spy)",
    measure: "var(--arch-tr)",
    window: "var(--arch-tr)",
    dimension: "var(--arch-dg)",
    stat: "var(--arch-cm)",
    panel: "var(--accent-text)",
    slot: "var(--arch-ph)",
    screen: "var(--text-secondary)",
    condition: "var(--text-tertiary)",
  },
  edgeWords: {
    supplies: ["Supplies", "Supplied by"],
    belongs_to: ["Belongs to", "Has field"],
    measures: ["Runs over", "Measured by"],
    windows: ["Applies to", "Windowed by"],
    groups: ["Groups", "Grouped by"],
    reads: ["Reads", "Read by"],
    summarises: ["Summarises", "Summarised by"],
    sits_on: ["Sits on", "Holds"],
    shown_when: ["Drawn when", "Switches on"],
    draws: ["Draws", "Drawn by"],
  },
  mono: ["field", "measure", "window", "dimension", "stat", "condition"],
  help: [
    "Left to right: the inputs that supply data, the objects (holdings, transactions, companies inside funds, market indicators, the time series), every field a recipe can name, the operations a recipe can apply, the panels and slots the app can draw, the screens they sit on, and the condition that switches each on.",
    "A methodology is a graph laid over this one: its figures name fields and operations, its rules test figures, and the slots it asks for are drawn. Nothing here belongs to any one methodology; what one cannot say in this vocabulary is a gap for the ontology to grow.",
  ],
};

/**
 * The ontology as an explorable graph: the whole vocabulary a methodology can
 * be written in, the same way the Graph screen shows one methodology.
 */
export default async function OntologyPage() {
  await screen("methodology");
  const g = ontologyGraph();
  return (
    <>
      <PageHeader title="Ontology" subtitle={`${g.nodes.length} elements, ${g.edges.length} relationships`} />
      <PageBody>
        <p className="mb-4 px-1 text-subhead text-text-secondary">
          Everything a methodology can refer to, and what draws what.{" "}
          <Link href="/methodology/graph" className="text-accent-text">
            Your methodology&apos;s graph
          </Link>{" "}
          lays its figures, classes and rules over this.
        </p>
        <GraphExplorer title="Invariant ontology" nodes={g.nodes} edges={g.edges} details={ontologyDetails()} json={JSON.stringify({ ontology: "Invariant", exported: localDay(), ...g }, null, 1)} scheme={ONTOLOGY_SCHEME} />
        <p className="mt-6 px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
