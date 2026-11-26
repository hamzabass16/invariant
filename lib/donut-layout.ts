/**
 * Where a donut's labels go, so that every label it draws is whole: inside
 * the drawing, clear of the ring and of each other. The labels sit in two
 * columns, left and right of the ring, joined to their slice by a leader;
 * a long name wraps onto a second line rather than run off the edge; the
 * ring shrinks before a label is cut, and the drawing grows taller before
 * labels overlap. Pure, so the check can hold it at phone and laptop widths.
 */

/** Plex Mono at 11px: every character is 0.6em wide. */
export const LABEL_CHAR_PX = 6.6;
export const LABEL_LINE_PX = 13;
const PAD = 6;
/** From the ring to the label column: an elbow, then a short run. */
const GAP = 20;
const R_MAX = 124;
const R_MIN = 52;

export type LabelBox = {
  /** The slice's index. */
  i: number;
  lines: string[];
  side: "left" | "right";
  /** The x the text is anchored at (its start on the right, its end on the left). */
  x: number;
  /** The top of the first line. */
  top: number;
  /** Width and height of the text block. */
  w: number;
  h: number;
  /** The leader: on the ring, at the elbow, at the label. */
  leader: [number, number][];
};

export type DonutLayout = { width: number; height: number; cx: number; cy: number; R: number; r: number; labels: LabelBox[] };

/** A label in lines of at most `max` characters, broken at spaces, a long word cut only when it alone is wider. */
export function wrapLabel(label: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of label.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > max) {
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(w.slice(0, max));
      w = w.slice(max);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= max) line = `${line} ${w}`;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/**
 * The layout for slices with the given shares (percent of the whole) and
 * labels, in a drawing `width` wide. Slices under `labelFrom` percent are not
 * labelled (the table and the tooltip name them).
 */
export function donutLayout(width: number, slices: readonly { label: string; share: number }[], labelFrom = 0): DonutLayout {
  const W = Math.max(240, Math.floor(width));
  const total = slices.reduce((s, x) => s + Math.max(0, x.share), 0) || 1;
  const mids: number[] = [];
  for (let i = 0, a = -Math.PI / 2; i < slices.length; i += 1) {
    const span = (Math.max(0, slices[i].share) / total) * Math.PI * 2;
    mids.push(a + span / 2);
    a += span;
  }
  const shown = slices.map((s, i) => ({ s, i })).filter(({ s }) => s.share > 0 && (s.share / total) * 100 >= labelFrom);

  // The widest line the columns can take, narrowed until the ring keeps its least radius.
  let maxChars = Math.max(4, Math.floor(Math.min(W * 0.27, 160) / LABEL_CHAR_PX));
  let wrapped = shown.map(({ s }) => wrapLabel(s.label, maxChars));
  const textW = () => Math.max(0, ...wrapped.flat().map((l) => l.length * LABEL_CHAR_PX));
  const radius = () => Math.min(R_MAX, (W - 2 * (textW() + GAP + PAD)) / 2);
  while (shown.length && radius() < R_MIN && maxChars > 4) {
    maxChars -= 1;
    wrapped = shown.map(({ s }) => wrapLabel(s.label, maxChars));
  }
  const R = Math.max(R_MIN, Math.floor(radius()));
  const r = R * 0.62;
  const cx = W / 2;

  const sides = { left: [] as LabelBox[], right: [] as LabelBox[] };
  shown.forEach(({ i }, k) => {
    const lines = wrapped[k];
    const side = Math.cos(mids[i]) >= 0 ? "right" : "left";
    sides[side].push({ i, lines, side, x: 0, top: 0, w: Math.max(...lines.map((l) => l.length)) * LABEL_CHAR_PX, h: lines.length * LABEL_LINE_PX, leader: [] });
  });
  // Tall enough for the ring and for each column stacked without overlap.
  const stack = (col: LabelBox[]) => col.reduce((s, b) => s + b.h + 3, 0);
  const height = Math.ceil(Math.max(2 * R + 2 * PAD + 16, stack(sides.left) + 2 * PAD, stack(sides.right) + 2 * PAD));
  const cy = height / 2;

  for (const side of ["left", "right"] as const) {
    const col = sides[side];
    const want = (b: LabelBox) => cy + (R + 10) * Math.sin(mids[b.i]) - b.h / 2;
    col.sort((a, b) => want(a) - want(b));
    // Down from the top, each below the last; then up from the bottom if the column ran over.
    let next = PAD;
    for (const b of col) {
      b.top = Math.max(want(b), next);
      next = b.top + b.h + 3;
    }
    let limit = height - PAD;
    for (let k = col.length - 1; k >= 0; k -= 1) {
      const b = col[k];
      if (b.top + b.h > limit) b.top = limit - b.h;
      limit = b.top - 3;
    }
    const dir = side === "right" ? 1 : -1;
    for (const b of col) {
      b.x = cx + dir * (R + GAP);
      const m = mids[b.i];
      const ring: [number, number] = [cx + (R + 2) * Math.cos(m), cy + (R + 2) * Math.sin(m)];
      const mid = b.top + LABEL_LINE_PX / 2;
      const elbow: [number, number] = [cx + dir * (R + 10) * Math.abs(Math.cos(m)), mid];
      b.leader = [ring, elbow, [b.x - dir * 3, mid]];
    }
  }
  const labels = [...sides.left, ...sides.right].sort((a, b) => a.i - b.i);
  return { width: W, height, cx, cy, R, r, labels };
}

/** Every label's box inside the drawing, and no two boxes on a side overlapping: what the check holds. */
export function labelsFit(l: DonutLayout): boolean {
  for (const b of l.labels) {
    const left = b.side === "right" ? b.x : b.x - b.w;
    const right = b.side === "right" ? b.x + b.w : b.x;
    if (left < 0 || right > l.width || b.top < 0 || b.top + b.h > l.height) return false;
    // Clear of the ring.
    if (b.side === "right" ? left < l.cx + l.R : right > l.cx - l.R) return false;
  }
  for (const side of ["left", "right"] as const) {
    const col = l.labels.filter((b) => b.side === side).sort((a, b) => a.top - b.top);
    for (let k = 1; k < col.length; k += 1) if (col[k].top < col[k - 1].top + col[k - 1].h) return false;
  }
  return true;
}
