/**
 * The ontology as nodes and edges, the way lib/methodology.ts graph() lays
 * out one methodology: the inputs that supply fields, the objects the fields
 * belong to, the operations a recipe can apply (measures, windows, groupings,
 * series statistics), the panels and slots the app can draw, the screens
 * they sit on and the conditions that switch each on. Nothing of anyone's
 * portfolio or methodology is in it; it is the vocabulary itself, so a person
 * can see what a methodology may ask for before writing one. Pure.
 */
import { DIMENSION_ABOUT, DIMENSION_FIELD, DIMENSIONS, FIELDS, MEASURABLE, MEASURE_ABOUT, MEASURES, OBJECT_LABEL, OBJECTS, PANELS, SCREEN_IDS, SCREENS, SERIES_STAT_ABOUT, SERIES_STATS, SHOWN_WHEN, SHOWN_WHEN_ABOUT, SLOTS, WINDOW_ABOUT, WINDOWS, type FieldId, type ObjectId } from "@/lib/ontology";
import { INPUT_IDS, INPUTS } from "@/lib/setup";

export type OntologyKind = "input" | "object" | "field" | "measure" | "window" | "dimension" | "stat" | "panel" | "slot" | "screen" | "condition";
export type OntologyNode = { id: string; kind: OntologyKind; label: string };
export type OntologyEdgeKind = "supplies" | "belongs_to" | "measures" | "windows" | "groups" | "reads" | "summarises" | "sits_on" | "shown_when" | "draws";
export type OntologyEdge = { from: string; to: string; kind: OntologyEdgeKind };

export const ONTOLOGY_KIND_LABEL: Record<OntologyKind, string> = { input: "Input", object: "Object", field: "Field", measure: "Measure", window: "Window", dimension: "Grouping", stat: "Series statistic", panel: "Panel", slot: "Slot", screen: "Screen", condition: "Condition" };

/** The time windows apply to transactions; the series statistics read the time series. */
const WINDOWED: readonly ObjectId[] = ["transactions"];

export function ontologyGraph(): { nodes: OntologyNode[]; edges: OntologyEdge[] } {
  const nodes = new Map<string, OntologyNode>();
  const edges: OntologyEdge[] = [];
  const node = (n: OntologyNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return n.id;
  };
  const edge = (from: string, to: string, kind: OntologyEdgeKind) => edges.push({ from, to, kind });

  for (const id of INPUT_IDS) node({ id: `input:${id}`, kind: "input", label: INPUTS[id].label });
  node({ id: "input:feed", kind: "input", label: "Public market feed" });
  for (const id of OBJECTS) node({ id: `object:${id}`, kind: "object", label: OBJECT_LABEL[id].replace(/^./, (c) => c.toUpperCase()) });
  for (const [id, f] of Object.entries(FIELDS)) {
    const fid = node({ id: `field:${id}`, kind: "field", label: f.label });
    edge(fid, `object:${f.object}`, "belongs_to");
    if (f.suppliedBy === "feed") edge("input:feed", fid, "supplies");
    else if (f.suppliedBy !== "none") for (const i of f.suppliedBy) edge(`input:${i}`, fid, "supplies");
  }
  for (const m of MEASURES) {
    const id = node({ id: `measure:${m}`, kind: "measure", label: m });
    for (const o of MEASURABLE) edge(id, `object:${o}`, "measures");
  }
  for (const w of WINDOWS) {
    const id = node({ id: `window:${w}`, kind: "window", label: w.replace("_", " ") });
    for (const o of WINDOWED) edge(id, `object:${o}`, "windows");
  }
  for (const d of DIMENSIONS) {
    const id = node({ id: `dimension:${d}`, kind: "dimension", label: d.replace("_", " ") });
    for (const [o, f] of Object.entries(DIMENSION_FIELD[d])) {
      edge(id, `object:${o}`, "groups");
      if (f) edge(id, `field:${f as FieldId}`, "reads");
    }
  }
  for (const s of SERIES_STATS) {
    const id = node({ id: `stat:${s}`, kind: "stat", label: s.replace(/_/g, " ") });
    edge(id, "object:series", "summarises");
  }
  for (const [id, p] of Object.entries(PANELS)) {
    const pid = node({ id: `panel:${id}`, kind: "panel", label: p.label });
    edge(pid, "object:holdings", "draws");
  }
  for (const c of SHOWN_WHEN) node({ id: `condition:${c}`, kind: "condition", label: c });
  for (const id of SCREEN_IDS) {
    const s = SCREENS[id];
    const sid = node({ id: `screen:${id}`, kind: "screen", label: s.label });
    edge(sid, `condition:${s.shown}`, "shown_when");
    for (const slot of s.slots) {
      const def = SLOTS[slot];
      const slid = node({ id: `slot:${slot}`, kind: "slot", label: def.label });
      edge(slid, sid, "sits_on");
      edge(slid, `condition:${def.shown}`, "shown_when");
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/** What the explorer shows for each node: its description and where it comes from. */
export function ontologyDetails(): Record<string, { lines: string[] }> {
  const out: Record<string, { lines: string[] }> = {};
  for (const id of INPUT_IDS) out[`input:${id}`] = { lines: [INPUTS[id].how] };
  out["input:feed"] = { lines: ["Yahoo Finance, FRED, stooq and multpl, read-only, no key: the market indicators."] };
  for (const id of OBJECTS) out[`object:${id}`] = { lines: [`${Object.values(FIELDS).filter((f) => f.object === id).length} fields.`, id === "series" ? "Read by the series statistics, never measured row by row." : "A measure runs over its rows."] };
  for (const [id, f] of Object.entries(FIELDS)) out[`field:${id}`] = { lines: [f.about, `Type ${f.type}${f.values ? `: ${f.values.join(", ")}` : ""}.`, f.suppliedBy === "none" ? "No connection supplies this yet." : f.suppliedBy === "feed" ? "Supplied by the public market feed." : `Supplied by ${f.suppliedBy.map((i) => INPUTS[i].label).join(", ")}.`] };
  for (const m of MEASURES) out[`measure:${m}`] = { lines: [MEASURE_ABOUT[m]] };
  for (const w of WINDOWS) out[`window:${w}`] = { lines: [WINDOW_ABOUT[w]] };
  for (const d of DIMENSIONS) out[`dimension:${d}`] = { lines: [DIMENSION_ABOUT[d]] };
  for (const s of SERIES_STATS) out[`stat:${s}`] = { lines: [SERIES_STAT_ABOUT[s]] };
  for (const [id, p] of Object.entries(PANELS)) out[`panel:${id}`] = { lines: [p.about, "A view the app draws itself."] };
  for (const id of SCREEN_IDS) out[`screen:${id}`] = { lines: [SCREENS[id].about, `${SCREENS[id].slots.length} slots. ${SCREENS[id].tab ? "A phone tab." : "In the top menu and under More."}`] };
  for (const [id, s] of Object.entries(SLOTS)) out[`slot:${id}`] = { lines: [s.about, `Drawn when: ${SHOWN_WHEN_ABOUT[s.shown].replace(/^./, (c) => c.toLowerCase())}`] };
  for (const c of SHOWN_WHEN) out[`condition:${c}`] = { lines: [SHOWN_WHEN_ABOUT[c]] };
  return out;
}
