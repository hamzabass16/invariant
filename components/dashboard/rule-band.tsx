import type { Resonance } from "@/lib/resonance";
import { cn } from "@/lib/utils";

/** How one rule stands, as the band draws it. */
type Strand = "breach" | "outside" | "kept" | "manual" | "waiting";

const HEIGHT = 40;
const LINES = 5;
const GAP = 22;

/** The rules in reading order: what is broken first, then what holds, then what the app cannot read. */
export function strandsOf(r: Resonance): Strand[] {
  return [
    ...Array<Strand>(r.breaches).fill("breach"),
    ...Array<Strand>(r.outside).fill("outside"),
    ...Array<Strand>(r.kept).fill("kept"),
    ...Array<Strand>(r.manual).fill("manual"),
    ...Array<Strand>(r.waiting).fill("waiting"),
  ];
}

/** One engraved line across [x0, x1] of a rule `span` wide: a sine whose phase steps with the line, so the lines weave. */
function wave(x0: number, x1: number, line: number, span: number, lines: number): string {
  const mid = HEIGHT / 2;
  const amp = lines > 2 ? 5 : 0;
  // About a period and a half per rule, whatever the width, so a narrow band never crowds into scribble.
  const period = span / 1.5 + line * 4;
  const phase = (line / lines) * Math.PI * 2;
  const y = (x: number) => mid + amp * Math.sin((x / period) * Math.PI * 2 + phase) + (line - (lines - 1) / 2) * (lines > 2 ? 3 : 6);
  let d = `M${x0.toFixed(1)} ${y(x0).toFixed(2)}`;
  for (let x = x0 + 4; x < x1; x += 4) d += ` L${x.toFixed(1)} ${y(x).toFixed(2)}`;
  return `${d} L${x1.toFixed(1)} ${y(x1).toFixed(2)}`;
}

/** The narrowest a single rule's strand is drawn on a laptop, in viewBox units; half that on a phone. */
const MIN_SPAN = 40;

/** One strand per rule, or, when `each` is false, one strand per state in reading order with its count. */
export function runsOf(strands: readonly Strand[], each: boolean): { state: Strand; count: number }[] {
  if (each) return strands.map((state) => ({ state, count: 1 }));
  const runs: { state: Strand; count: number }[] = [];
  for (const s of strands) {
    const last = runs[runs.length - 1];
    if (last && last.state === s) last.count += 1;
    else runs.push({ state: s, count: 1 });
  }
  return runs;
}

/** [x0, x1] broken once in the middle of each of `count` equal parts, each break `cut` either side. */
function breaksIn(x0: number, x1: number, count: number, cut: number): number[][] {
  const part = (x1 - x0) / count;
  const pieces: number[][] = [];
  let from = x0;
  for (let j = 0; j < count; j++) {
    const mid = x0 + part * (j + 0.5);
    pieces.push([from, mid - cut]);
    from = mid + cut;
  }
  pieces.push([from, x1]);
  return pieces;
}

const TONE: Record<Strand, string> = {
  breach: "var(--danger)",
  outside: "var(--warn)",
  kept: "var(--rule-ink)",
  manual: "var(--text-tertiary)",
  waiting: "var(--hairline-strong)",
};

/**
 * The rule band: every rule of the methodology on one fixed scale, drawn as
 * the fine engraved lines of a security print. A rule kept runs unbroken; a
 * rule not kept breaks in the middle, in the danger or warning ink; a rule
 * the app cannot measure is drawn faint, and one waiting for data is a bare
 * hairline. The words beside it say the same thing, so the band is never
 * the only carrier.
 */
export function RuleBand({ r, width = 1000, className }: { r: Resonance; width?: number; className?: string }) {
  const strands = strandsOf(r);
  if (!strands.length) return null;
  // The viewBox is drawn at about the width it is shown at (1000 on a laptop, 340 on a phone), so the lines keep their shape.
  const narrow = width < 600;
  const gap = narrow ? 10 : GAP;
  // Two straight engraved lines a rule on a phone, five weaving lines on a laptop: never a crowd.
  const lines = narrow ? 2 : LINES;
  const label = `${r.kept} of ${r.measured} measured rules kept, ${r.manual} yours to check, ${r.waiting} waiting for data`;
  // One strand a rule while each keeps at least MIN_SPAN; past that (a long methodology, found by the break-ui pass) the rules of one state share a strand, its width by their count, a broken strand breaking once per rule.
  const runs = runsOf(strands, (width - gap * (strands.length - 1)) / strands.length >= (narrow ? MIN_SPAN / 2 : MIN_SPAN));
  const room = width - gap * (runs.length - 1);
  const segments = runs.map((run, i) => ({ ...run, i, width: (run.count / strands.length) * room }));

  return (
    <svg viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" className={cn("rule-band block h-10 w-full", className)} role="img" aria-label={label}>
      {segments.map(({ state: s, count, i, width: span }, k) => {
        const x0 = segments.slice(0, k).reduce((sum, seg) => sum + seg.width + gap, 0);
        const x1 = x0 + span;
        if (s === "waiting") {
          return <line key={i} x1={x0} x2={x1} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke={TONE[s]} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
        }
        // A broken rule: the strand parts around a small break, always narrower than the gutter between rules, so a break never reads as a gutter.
        const cut = s === "breach" || s === "outside" ? gap / 6 : 0;
        // A shared strand breaks once per rule while each part keeps room to read as a line; past that the words carry the count.
        const parts = Math.max(1, Math.min(count, Math.floor(span / (narrow ? 16 : 28))));
        const pieces = cut ? breaksIn(x0, x1, parts, cut) : [[x0, x1]];
        return (
          <g key={i} stroke={TONE[s]} fill="none" opacity={s === "manual" ? 0.6 : 1}>
            {/* A rule the app cannot measure is drawn with two lines only, faint: present, not proven. */}
            {Array.from({ length: s === "manual" && lines > 2 ? 2 : lines }, (_, line) =>
              pieces.map(([a, b], p) => (
                <path key={`${line}-${p}`} d={wave(a, b, line, span, lines)} strokeWidth={s === "kept" ? 0.9 : 0.75} vectorEffect="non-scaling-stroke" pathLength={1} style={{ animationDelay: `${i * 12 + line * 6}ms` }} />
              )),
            )}
          </g>
        );
      })}
    </svg>
  );
}
