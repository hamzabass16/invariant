/**
 * A squarified treemap (Bruls, Huizing and van Wijk, 2000): areas in
 * proportion to their values, laid out row by row so each rectangle stays as
 * close to square as the values allow. Pure; the heat map on Markets draws
 * the rectangles it returns.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Placed<T> = Rect & { item: T };

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  if (!sum || !side) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Lays items into the rectangle by value, largest first; an item with no value or a negative one takes no space. */
export function squarify<T>(items: readonly T[], valueOf: (t: T) => number, box: Rect): Placed<T>[] {
  const list = items.map((item) => ({ item, v: Math.max(0, valueOf(item)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((s, x) => s + x.v, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  // Values become areas in the box's own units.
  const scale = (box.w * box.h) / total;
  const areas = list.map((x) => ({ item: x.item, a: x.v * scale }));
  const out: Placed<T>[] = [];
  let { x, y, w, h } = box;
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row: typeof areas = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]].map((r) => r.a), side) <= worst(row.map((r) => r.a), side)) {
      row.push(areas[j]);
      j += 1;
    }
    const sum = row.reduce((s, r) => s + r.a, 0);
    if (w >= h) {
      // A column on the left, as wide as the row's area over the height.
      const cw = sum / h;
      let cy = y;
      for (const r of row) {
        const rh = r.a / cw;
        out.push({ x, y: cy, w: cw, h: rh, item: r.item });
        cy += rh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const r of row) {
        const cw = r.a / rh;
        out.push({ x: cx, y, w: cw, h: rh, item: r.item });
        cx += cw;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

/**
 * A size for each item that keeps every one in view (Hamza, 19 Oct 2026: "all
 * holdings must always be in view"): its own value, but never less than
 * `minShare` of the total, and no item left out for a value of zero or less.
 * The default floor is 3% of the map, or half an equal share when there are
 * more than sixteen items. Equal tiles when nothing has a value.
 */
export function inViewSize<T>(items: readonly T[], valueOf: (t: T) => number, minShare = Math.min(0.03, 0.5 / Math.max(1, items.length))): (t: T) => number {
  const total = items.reduce((s, t) => s + Math.max(0, valueOf(t) || 0), 0);
  if (!(total > 0)) return () => 1;
  const floor = total * minShare;
  return (t) => Math.max(floor, valueOf(t) || 0);
}
