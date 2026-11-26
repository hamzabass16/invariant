"use client";

import { Download, Minus, Plus, Scan } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import type { GraphEdge, GraphNode } from "@/lib/methodology";
import { cn } from "@/lib/utils";

/**
 * The methodology's context graph, laid out in layers and explorable: inputs
 * supply fields, fields feed figures and classes, figures are tested by rules
 * and shown by the dashboard, rules sit in sections of the document. Hover
 * lights a node's neighbours; selecting one traces everything it depends on
 * and everything that depends on it, and opens its details. The graph can be
 * downloaded as JSON for any graph tool.
 */

export type NodeDetail = { lines: string[]; status?: "pass" | "near" | "fail" | "manual" | "n/a"; value?: string };

/** A node of any graph the explorer draws: the methodology's, or the ontology's. */
export type ExplorerNode = { id: string; kind: string; label: string };
export type ExplorerEdge = { from: string; to: string; kind: string };

/** How a graph is laid out and named: its columns of kinds, each kind's word and colour, each edge's words both ways, and the help text. */
export type GraphScheme = {
  columns: string[][];
  columnLabels: string[];
  kindLabel: Record<string, string>;
  kindColor: Record<string, string>;
  edgeWords: Record<string, [string, string]>;
  /** Kinds drawn in the mono face (identifiers). */
  mono: readonly string[];
  help: string[];
};

type Kind = GraphNode["kind"];
export const METHODOLOGY_SCHEME: GraphScheme = {
  columns: [["input"], ["field"], ["class"], ["figure", "panel"], ["rule", "dashboard"], ["section"]] satisfies Kind[][],
  columnLabels: ["Inputs", "Fields", "Classes", "Figures and panels", "Rules and dashboard", "Document"],
  kindLabel: { input: "Input", field: "Field", class: "Class", figure: "Figure", panel: "Panel", rule: "Rule", dashboard: "Dashboard", section: "Document section" } satisfies Record<Kind, string>,
  kindColor: {
    input: "var(--arch-none)",
    field: "var(--series-spy)",
    class: "var(--arch-ph)",
    figure: "var(--arch-tr)",
    panel: "var(--accent-text)",
    rule: "var(--arch-cm)",
    dashboard: "var(--text)",
    section: "var(--text-tertiary)",
  } satisfies Record<Kind, string>,
  edgeWords: {
    reads: ["Reads", "Read by"],
    supplied_by: ["Supplied by", "Supplies"],
    filters_on: ["Filters on", "Filtered on by"],
    tests: ["Tests", "Tested by"],
    sits_in: ["Sits in", "Holds"],
    shows: ["Shows", "Shown by"],
    asked_by: ["Asked by", "Asks for"],
  } satisfies Record<GraphEdge["kind"], [string, string]>,
  mono: ["section", "field"],
  help: [
    "Left to right: the inputs that supply data, the fields they fill, the classes and figures built on them, the rules and dashboard that use the figures, and the sections of the document each rule came from.",
    "Every edge is a relationship the app checks when it computes: a finding can be traced from its rule through its figure to the fields it reads and the input that supplies them.",
  ],
};
const STATUS_WORDS = { pass: "Within", near: "Near limit", fail: "Outside", manual: "Yours to check", "n/a": "Waiting for data" } as const;
const STATUS_TONE = { pass: "ok", near: "info", fail: "danger", manual: "neutral", "n/a": "neutral" } as const;

const NODE_W = 168;
const NODE_H = 30;
const COL_W = 236;
const ROW_H = 40;
const PAD = 24;
const HEAD = 28;

type Placed = ExplorerNode & { col: number; row: number; x: number; y: number };

/** A column with more nodes than this wraps into side-by-side sub-columns, so a long list (the ontology's fields) stays readable. */
const MAX_ROWS = 36;
const SUB_GAP = 12;
const COL_GAP = COL_W - NODE_W;

/** Layers by kind, rows ordered to keep edges short: a few barycenter sweeps. */
function layout(nodes: ExplorerNode[], edges: ExplorerEdge[], COLUMNS: string[][]): { placed: Placed[]; width: number; height: number } {
  const colOf = (k: string) => Math.max(0, COLUMNS.findIndex((c) => c.includes(k)));
  const cols: ExplorerNode[][] = COLUMNS.map(() => []);
  for (const n of [...nodes].sort((a, b) => a.label.localeCompare(b.label))) cols[colOf(n.kind)].push(n);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const pos = new Map<string, number>();
  const place = () => cols.forEach((c) => c.forEach((n, i) => pos.set(n.id, i)));
  place();
  const sweep = (c: ExplorerNode[], neighbourCol: number) => {
    const bary = (n: ExplorerNode) => {
      const ns = (adj.get(n.id) ?? []).filter((id) => cols[neighbourCol].some((x) => x.id === id));
      return ns.length ? ns.reduce((s, id) => s + (pos.get(id) ?? 0), 0) / ns.length : pos.get(n.id) ?? 0;
    };
    c.sort((a, b) => bary(a) - bary(b) || a.label.localeCompare(b.label));
    place();
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < cols.length; i++) sweep(cols[i], i - 1);
    for (let i = cols.length - 2; i >= 0; i--) sweep(cols[i], i + 1);
  }
  const subs = cols.map((c) => Math.max(1, Math.ceil(c.length / MAX_ROWS)));
  const rowsIn = cols.map((c, i) => Math.ceil(c.length / subs[i]));
  const rows = Math.max(1, ...rowsIn);
  const placed: Placed[] = [];
  let x = PAD;
  cols.forEach((c, ci) => {
    if (!c.length) return;
    const offset = ((rows - rowsIn[ci]) * ROW_H) / 2;
    c.forEach((n, i) => {
      const sub = Math.floor(i / rowsIn[ci]);
      const row = i % rowsIn[ci];
      placed.push({ ...n, col: ci, row, x: x + sub * (NODE_W + SUB_GAP), y: PAD + HEAD + offset + row * ROW_H });
    });
    x += subs[ci] * NODE_W + (subs[ci] - 1) * SUB_GAP + COL_GAP;
  });
  return { placed, width: x - COL_GAP + PAD, height: PAD * 2 + HEAD + rows * ROW_H };
}

/** Everything a node depends on (following edges) and everything that depends on it (against them). */
function trace(id: string, edges: ExplorerEdge[]): Set<string> {
  const out = new Set<string>([id]);
  const walk = (start: string, dir: "down" | "up") => {
    const queue = [start];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const e of edges) {
        const next = dir === "down" ? (e.from === cur ? e.to : null) : e.to === cur ? e.from : null;
        if (next && !out.has(next)) {
          out.add(next);
          queue.push(next);
        }
      }
    }
  };
  walk(id, "down");
  walk(id, "up");
  return out;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** A graph whose fitted height would shrink its labels below this share of their width-fitted size starts width-fitted instead. */
const TALL_FIT = 0.75;

/** How many characters of a node's name fit beside its value (mono 0.6em at 10px), so the two never touch. */
const labelChars = (mono: boolean, value: string | null, max: number) =>
  value === null ? max : Math.min(max, Math.floor((NODE_W - 12 - 8 - value.length * 6 - 10) / (mono ? 7.2 : 6.8)));

export function GraphExplorer({ title, nodes, edges, details, json, scheme = METHODOLOGY_SCHEME }: { title: string; nodes: ExplorerNode[]; edges: ExplorerEdge[]; details: Record<string, NodeDetail>; json: string; scheme?: GraphScheme }) {
  const { columns: COLUMNS, columnLabels: COLUMN_LABEL, kindLabel: KIND_LABEL, kindColor: KIND_COLOR, edgeWords: EDGE_WORDS } = scheme;
  const { placed, width, height } = React.useMemo(() => layout(nodes, edges, COLUMNS), [nodes, edges, COLUMNS]);
  const byId = React.useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  // Null means "fit the whole graph", so a new layout starts fitted without an effect.
  const [viewState, setViewState] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const view = viewState ?? { x: 0, y: 0, w: width, h: height };
  const setView = React.useCallback((f: (v: { x: number; y: number; w: number; h: number }) => { x: number; y: number; w: number; h: number }) => setViewState((v) => f(v ?? { x: 0, y: 0, w: width, h: height })), [width, height]);
  const [dragging, setDragging] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const traced = React.useMemo(() => (selected ? trace(selected, edges) : null), [selected, edges]);
  const neighbours = React.useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    for (const e of edges) {
      if (e.from === hover) s.add(e.to);
      if (e.to === hover) s.add(e.from);
    }
    return s;
  }, [hover, edges]);
  const q = query.trim().toLowerCase();
  const matches = (n: ExplorerNode) => !q || n.label.toLowerCase().includes(q);
  const visible = (id: string) => {
    const n = byId.get(id);
    return !!n && !hidden.has(n.kind);
  };
  const emphasis = (id: string): "strong" | "dim" | "plain" => {
    if (traced) return traced.has(id) ? "strong" : "dim";
    if (neighbours) return neighbours.has(id) ? "strong" : "dim";
    if (q) return matches(byId.get(id)!) ? "strong" : "dim";
    return "plain";
  };

  // Pan and zoom on the SVG. Wheel zoom needs a non-passive listener to stop the page scrolling.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const r = el.getBoundingClientRect();
        const px = v.x + ((e.clientX - r.left) / r.width) * v.w;
        const py = v.y + ((e.clientY - r.top) / r.height) * v.h;
        const w = Math.min(width * 3, Math.max(width / 6, v.w * k));
        const h = (w / v.w) * v.h;
        return { x: px - (px - v.x) * (w / v.w), y: py - (py - v.y) * (h / v.h), w, h };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [width, setView]);

  const zoom = (k: number) => setView((v) => ({ x: v.x + (v.w - v.w * k) / 2, y: v.y + (v.h - v.h * k) / 2, w: v.w * k, h: v.h * k }));
  // Fit the whole graph when that costs the labels at most a quarter of their size; a much taller graph (the ontology's fields) fits its width and starts at the top, so the labels stay readable.
  const fit = React.useCallback(() => {
    const el = svgRef.current;
    if (!el) return setViewState(null);
    const r = el.getBoundingClientRect();
    const h = r.width > 0 ? width * (r.height / r.width) : height;
    setViewState(h >= height * TALL_FIT ? null : { x: 0, y: 0, w: width, h });
  }, [width, height]);
  React.useEffect(() => {
    fit();
  }, [fit]);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // Read the drag now: React runs the updater later, by which time a quick release has already cleared it.
    const d = drag.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    setView((v) => ({ ...v, x: d.vx - ((e.clientX - d.x) / r.width) * v.w, y: d.vy - ((e.clientY - d.y) / r.height) * v.h }));
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w.-]+/g, "-").toLowerCase()}-graph.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sel = selected ? byId.get(selected) : null;
  const selDetail = selected ? details[selected] : null;
  const links = sel
    ? Object.entries(
        edges
          .filter((e) => e.from === sel.id || e.to === sel.id)
          .reduce<Record<string, ExplorerNode[]>>((acc, e) => {
            const other = byId.get(e.from === sel.id ? e.to : e.from);
            if (!other) return acc;
            const word = (EDGE_WORDS[e.kind] ?? [e.kind, e.kind])[e.from === sel.id ? 0 : 1];
            (acc[word] ??= []).push(other);
            return acc;
          }, {}),
      )
    : [];
  const kinds = COLUMNS.flat().filter((k) => nodes.some((n) => n.kind === k));
  const usedCols = COLUMNS.map((c, i) => ({ i, used: placed.some((n) => n.col === i) })).filter((c) => c.used);
  const colX = (ci: number) => placed.find((n) => n.col === ci)?.x ?? 0;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a node" aria-label="Find a node" className="h-9 min-w-[10rem] flex-1 rounded-[10px] border border-hairline bg-surface px-3 text-subhead" />
          <Button variant="secondary" size="sm" onClick={() => zoom(1 / 1.25)} aria-label="Zoom in">
            <Plus className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => zoom(1.25)} aria-label="Zoom out">
            <Minus className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={fit} aria-label="Fit the whole graph">
            <Scan className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={download}>
            <Download className="size-4" aria-hidden /> JSON
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {kinds.map((k) => {
            const off = hidden.has(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={!off}
                onClick={() => setHidden((h) => {
                  const next = new Set(h);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                })}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption font-medium transition-colors", off ? "bg-surface text-text-tertiary line-through" : "bg-surface-2 text-text")}
              >
                <span className="inline-block size-2 rounded-full" style={{ background: KIND_COLOR[k] }} aria-hidden />
                {KIND_LABEL[k]}s · {nodes.filter((n) => n.kind === k).length}
              </button>
            );
          })}
        </div>
        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className="block h-[60vh] w-full touch-none select-none lg:h-[70vh]"
            role="img"
            aria-label={`${title}: ${nodes.length} nodes and ${edges.length} relationships. Select a node to read its details.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => {
              if (!(e.target as Element).closest("[data-node]")) setSelected(null);
            }}
            style={{ cursor: dragging ? "grabbing" : "grab" }}
          >
            {usedCols.map(({ i }) => (
              <text key={i} x={colX(i)} y={PAD + 10} className="section-header" fontSize={11} fill="var(--text-tertiary)" style={{ fontFamily: "var(--font-condensed)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {COLUMN_LABEL[i]}
              </text>
            ))}
            {edges.map((e, i) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b || !visible(e.from) || !visible(e.to)) return null;
              const [l, r] = a.x <= b.x ? [a, b] : [b, a];
              const x1 = l.x + NODE_W;
              const y1 = l.y + NODE_H / 2;
              const x2 = r.x;
              const y2 = r.y + NODE_H / 2;
              const c = (x2 - x1) / 2;
              const em = traced || neighbours ? (emphasis(e.from) === "strong" && emphasis(e.to) === "strong" ? "strong" : "dim") : "plain";
              return (
                <path
                  key={i}
                  d={`M${x1} ${y1} C${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={em === "strong" ? "var(--accent-text)" : "var(--hairline)"}
                  strokeWidth={em === "strong" ? 2 : 1.25}
                  opacity={em === "dim" ? 0.35 : 1}
                />
              );
            })}
            {placed.map((n) => {
              if (!visible(n.id)) return null;
              const em = emphasis(n.id);
              const d = details[n.id];
              const isSel = selected === n.id;
              const stroke = d?.status ? (d.status === "fail" ? "var(--danger)" : d.status === "near" ? "var(--warn)" : d.status === "pass" ? "var(--ok)" : KIND_COLOR[n.kind]) : KIND_COLOR[n.kind];
              return (
                <g
                  key={n.id}
                  data-node
                  tabIndex={0}
                  role="button"
                  aria-label={`${KIND_LABEL[n.kind]}: ${n.label}`}
                  aria-pressed={isSel}
                  transform={`translate(${n.x} ${n.y})`}
                  opacity={em === "dim" ? 0.3 : 1}
                  className="cursor-pointer outline-none transition-opacity duration-150"
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected((s) => (s === n.id ? null : n.id));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected((s) => (s === n.id ? null : n.id));
                    }
                  }}
                >
                  <title>{n.label}</title>
                  <rect width={NODE_W} height={NODE_H} rx={8} fill={isSel ? "var(--accent-subtle)" : "var(--surface-2)"} stroke={isSel || em === "strong" ? stroke : "var(--hairline)"} strokeWidth={isSel ? 2 : 1.25} />
                  <rect x={0} y={6} width={3} height={NODE_H - 12} rx={1.5} fill={stroke} />
                  <text x={12} y={NODE_H / 2} dy="0.34em" fontSize={12} fill="var(--text)" style={{ fontFamily: scheme.mono.includes(n.kind) ? "var(--font-mono)" : undefined }}>
                    {truncate(n.label, labelChars(scheme.mono.includes(n.kind), d?.value ? truncate(d.value, 9) : null, n.kind === "rule" ? 24 : 22))}
                  </text>
                  {d?.value ? (
                    <text x={NODE_W - 8} y={NODE_H / 2} dy="0.34em" textAnchor="end" fontSize={10} fill="var(--text-secondary)" style={{ fontFamily: "var(--font-mono)" }}>
                      {truncate(d.value, 9)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="mt-2 px-1 text-footnote text-text-tertiary">Drag to pan, scroll to zoom. Hover a node for its neighbours; select one to trace what it depends on and what depends on it.</p>
      </div>

      <aside className="mt-4 lg:mt-0" aria-live="polite">
        {sel ? (
          <div className="card px-4 py-4">
            <p className="section-header mb-1 flex items-center gap-2">
              <span className="inline-block size-2 rounded-full" style={{ background: KIND_COLOR[sel.kind] }} aria-hidden />
              {KIND_LABEL[sel.kind]}
            </p>
            <p className="text-body font-medium">{sel.label}</p>
            {selDetail?.status ? (
              <p className="mt-2">
                <StatusPill tone={STATUS_TONE[selDetail.status]}>{STATUS_WORDS[selDetail.status]}</StatusPill>
              </p>
            ) : null}
            {selDetail?.value ? <p className="data mt-2 text-title-2 font-semibold">{selDetail.value}</p> : null}
            {selDetail?.lines.map((l, i) => (
              <p key={i} className="mt-2 text-footnote text-text-secondary">
                {l}
              </p>
            ))}
            {links.map(([word, list]) => (
              <div key={word} className="mt-3">
                <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{word}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {list.map((n) => (
                    <button key={n.id} type="button" onClick={() => setSelected(n.id)} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-caption text-text transition-colors hover:bg-hairline">
                      <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[n.kind] }} aria-hidden />
                      <span className="truncate">{n.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setSelected(null)} className="mt-4 text-footnote text-accent-text">
              Clear selection
            </button>
          </div>
        ) : (
          <div className="card px-4 py-4 text-footnote text-text-secondary">
            <p className="section-header mb-1 text-text">How to read it</p>
            {scheme.help.map((h, i) => (
              <p key={i} className={i ? "mt-2" : undefined}>
                {h}
              </p>
            ))}
            <p className="mt-2">
              {nodes.length} nodes, {edges.length} relationships.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
