import { Circle, Document, Line, Link, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import * as React from "react";

import { PDF_SERIES, PDF_STATUS, type BarChart, type HeatChart, type LineChart, type PdfBlock, type PdfChapter, type PdfPlan, type PdfTable, type PieChart, type Tone } from "@/lib/review-pdf";

/**
 * The review as a PDF report in the HCMP review's own look (Hamza, 18 Oct
 * 2026: "mimic the exact same style"): Inter on white, near-black text, a
 * blue chapter kicker in spaced capitals, a bold title and a grey lead, the
 * cover's tiles on faint grey cards with the figure coloured by its sign,
 * bullets and numbers in blue, tables with a capitals header row and thin
 * rules, status words with a coloured dot, short-answer boxes with a blue
 * left rule, a black verdict box, charts in the deck's palette (blue for
 * the account, orange, green and purple for the benchmarks, red only for a
 * loss), the correlation matrix red through blue, and the page's footer
 * with the running number. Pure: it draws the plan lib/review-pdf.ts made;
 * lib/review-pdf-run.ts registers the fonts and renders it.
 */

export const REVIEW_FONT = "Inter";
const INK = "#0b0b0b";
const MUTED = "#52514e";
const FAINT = "#8a8a88";
const RULE = "#e7e6e2";
const RULE_DARK = "#c6c6c6";
const CARD = "#fafaf8";
const CARD_LINE = "#e0e0e0";
const BLUE = PDF_SERIES[0];
const BLUE_TINT = "#eef4fc";
const RED_TINT = "#fdf1f0";

const s = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: INK, fontFamily: REVIEW_FONT, fontSize: 8.5, lineHeight: 1.45, paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40 },
  kicker: { fontSize: 6.5, fontWeight: 700, letterSpacing: 1.1, color: BLUE, textTransform: "uppercase", marginBottom: 4 },
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.18, marginBottom: 6 },
  h2: { fontSize: 15, fontWeight: 700, lineHeight: 1.25, marginBottom: 4 },
  h3: { fontSize: 10.5, fontWeight: 700, marginTop: 14, marginBottom: 5 },
  lead: { fontSize: 9.5, color: MUTED, marginBottom: 10 },
  p: { marginBottom: 6 },
  muted: { fontSize: 7.5, color: MUTED, marginBottom: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.6, borderBottomColor: "#e0e0e0" },
  metaItem: { flexDirection: "row", marginRight: 16, marginBottom: 2 },
  metaLabel: { fontSize: 6.5, color: MUTED, marginRight: 4, marginTop: 1.5 },
  metaValue: { fontSize: 7.5, fontWeight: 700 },
  tiles: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 10 },
  tile: { width: "25%", paddingHorizontal: 4, marginBottom: 8 },
  tileBox: { backgroundColor: CARD, borderWidth: 1, borderColor: CARD_LINE, borderStyle: "solid", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9, minHeight: 62 },
  tileLabel: { fontSize: 6, fontWeight: 700, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", marginBottom: 3 },
  tileValue: { fontSize: 16, fontWeight: 700, lineHeight: 1.15, marginBottom: 2 },
  bullet: { flexDirection: "row", marginBottom: 5 },
  dot: { width: 10, fontSize: 9, color: BLUE, fontWeight: 700 },
  verdict: { flexDirection: "row", backgroundColor: "#ffffff", borderWidth: 1, borderColor: CARD_LINE, borderStyle: "solid", borderRadius: 6, marginTop: 10, marginBottom: 10, overflow: "hidden" },
  verdictTag: { width: 74, backgroundColor: INK, color: "#ffffff", fontSize: 9, fontWeight: 700, paddingVertical: 12, paddingHorizontal: 10, justifyContent: "center" },
  verdictBody: { flex: 1, paddingVertical: 8, paddingHorizontal: 12 },
  callout: { borderLeftWidth: 3, borderLeftStyle: "solid", paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderRadius: 2 },
  calloutTitle: { fontSize: 6.5, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 2 },
  table: { marginTop: 4, marginBottom: 10 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: RULE, borderBottomStyle: "solid" },
  trHead: { borderBottomWidth: 0.8, borderBottomColor: RULE_DARK },
  td: { paddingVertical: 4, paddingRight: 8, fontSize: 7.5, lineHeight: 1.35 },
  th: { fontSize: 6.3, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: MUTED, paddingVertical: 3 },
  chartTitle: { fontSize: 7.5, fontWeight: 600, marginTop: 8, marginBottom: 3 },
  numbered: { flexDirection: "row", marginBottom: 6 },
  numBall: { width: 13, height: 13, borderRadius: 6.5, backgroundColor: BLUE, color: "#ffffff", fontSize: 7, fontWeight: 700, textAlign: "center", paddingTop: 2, marginRight: 7, marginTop: 1 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, textAlign: "right", fontSize: 6.3, color: FAINT },
  link: { color: BLUE, textDecoration: "none", fontSize: 7.5, marginBottom: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2 },
  swatch: { width: 8, height: 8, borderRadius: 1.5, marginRight: 4 },
});

const toneColour = (t: Tone | "ok" | "warn" | "danger" | "neutral"): string => PDF_STATUS[t] ?? PDF_STATUS.neutral;
/** A figure's colour on a tile: green up, red down, blue otherwise. */
const tileColour = (t: "ok" | "warn" | "danger" | "neutral") => (t === "ok" ? PDF_STATUS.ok : t === "danger" ? PDF_STATUS.danger : t === "warn" ? "#eb6834" : BLUE);
const STATUS_WORD = /^(Followed|Partly|Not followed|Yours to check|Waiting for data|Within|Near the limit|Breach|Tripped|Outside guideline|Intact|Watch|At risk|Sale decided|No class|Residual|Act|Note|Waiting|Followed|ALARM)$/i;

function Status({ text, tone }: { text: string; tone: Tone }) {
  const colour = toneColour(tone);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour, marginTop: 3, marginRight: 4 }} />
      <Text style={{ color: tone === "neutral" ? INK : colour, fontWeight: 600 }}>{text}</Text>
    </View>
  );
}

function Table({ t }: { t: PdfTable }) {
  const ncol = Math.max(t.head?.length ?? 0, ...t.rows.map((r) => r.cells.length));
  const widths = t.widths ?? Array.from({ length: ncol }, (_, i) => (ncol === 3 ? [34, 18, 48][i] : 100 / ncol));
  const toneCol = t.toneCol === undefined ? 1 : t.toneCol;
  return (
    <View style={s.table}>
      {t.head ? (
        <View style={[s.tr, s.trHead]} wrap={false}>
          {t.head.map((h, i) => (
            <Text key={i} style={[s.td, s.th, { width: `${widths[i]}%` }]}>
              {h}
            </Text>
          ))}
        </View>
      ) : null}
      {t.rows.map((r, ri) => (
        <View key={ri} style={s.tr} wrap={false}>
          {Array.from({ length: ncol }, (_, i) => {
            const c = r.cells[i] ?? "";
            const status = toneCol === i && r.tone && c && STATUS_WORD.test(c.trim());
            const href = i === 0 && r.href && /^https?:\/\//i.test(r.href) ? r.href : null;
            return (
              <View key={i} style={[s.td, { width: `${widths[i]}%` }]}>
                {status ? <Status text={c} tone={r.tone!} /> : href ? <Link src={href} style={{ color: INK, textDecoration: "none", fontWeight: 600 }}>{c}</Link> : <Text style={i === 0 && t.head ? { fontWeight: 600 } : i === ncol - 1 && ncol > 2 ? { color: MUTED } : undefined}>{c}</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const f = 6.5;
const svgText = { fontSize: f, fontFamily: REVIEW_FONT, fill: MUTED } as const;

function Lines({ c }: { c: LineChart }) {
  return (
    <View wrap={false}>
      <View style={s.legend}>
        {c.lines.map((l) => (
          <View key={l.label} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: l.colour }]} />
            <Text style={{ fontSize: 7, color: MUTED }}>{l.label}</Text>
          </View>
        ))}
      </View>
      <Svg width={c.width} height={c.height} viewBox={`0 0 ${c.width} ${c.height}`}>
        {c.ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={c.plot.x} y1={t.y} x2={c.plot.x + c.plot.w} y2={t.y} stroke={RULE} strokeWidth={0.6} />
            <Text x={c.plot.x - 5} y={t.y + f / 3} style={svgText} textAnchor="end">
              {t.label}
            </Text>
          </React.Fragment>
        ))}
        {c.zeroY !== null ? <Line x1={c.plot.x} y1={c.zeroY} x2={c.plot.x + c.plot.w} y2={c.zeroY} stroke={RULE_DARK} strokeWidth={0.8} /> : null}
        {c.cols.map((col, i) => (
          <Text key={i} x={col.x} y={c.plot.y + c.plot.h + f + 7} style={svgText} textAnchor="middle">
            {col.label}
          </Text>
        ))}
        {c.lines.map((l, i) => (
          <React.Fragment key={i}>
            {l.d ? <Path d={l.d} stroke={l.colour} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {l.end ? (
              <Text x={l.end.x + 5} y={l.end.y + f / 3} style={{ fontSize: f, fontFamily: REVIEW_FONT, fill: l.colour, fontWeight: 700 }}>
                {`${l.label} ${l.end.text}`}
              </Text>
            ) : null}
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

function Bars({ c }: { c: BarChart }) {
  return (
    <View wrap={false}>
      <Svg width={c.width} height={c.height} viewBox={`0 0 ${c.width} ${c.height}`}>
        <Line x1={c.zeroX} y1={0} x2={c.zeroX} y2={c.height} stroke={RULE_DARK} strokeWidth={0.8} />
        {c.rows.map((r, i) => (
          <React.Fragment key={i}>
            <Text x={c.zeroX - 6 - (r.x < c.zeroX ? c.zeroX - r.x : 0)} y={r.y + r.h / 2 + f / 3} style={{ ...svgText, fill: INK }} textAnchor="end">
              {r.label}
            </Text>
            <Rect x={r.x} y={r.y} width={Math.max(r.w, 0.5)} height={r.h} fill={r.colour} rx={2} ry={2} />
            {r.mark !== null ? <Line x1={r.mark} y1={r.y - 2} x2={r.mark} y2={r.y + r.h + 2} stroke={INK} strokeWidth={1.2} /> : null}
            <Text x={r.x < c.zeroX ? c.zeroX + 4 : r.x + r.w + 4} y={r.y + r.h / 2 + f / 3} style={{ ...svgText, fill: INK, fontWeight: 600 }}>
              {r.text}
            </Text>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

function Heat({ c }: { c: HeatChart }) {
  const barX = c.size + 14;
  const scale = [1, 0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75, -1];
  const barH = c.size - c.labelW;
  const step = barH / scale.length;
  return (
    <View wrap={false}>
      <Svg width={c.size + 60} height={c.size + 4} viewBox={`0 0 ${c.size + 60} ${c.size + 4}`}>
        {c.symbols.map((sym, i) => (
          <React.Fragment key={sym}>
            <Text x={c.labelW - 4} y={c.labelW + i * c.cell + c.cell / 2 + f / 3} style={svgText} textAnchor="end">
              {sym}
            </Text>
            <Text x={c.labelW + i * c.cell + c.cell / 2} y={c.labelW - 4} style={{ ...svgText, fontSize: Math.min(f, c.cell / 4.2) }} textAnchor="middle">
              {sym}
            </Text>
          </React.Fragment>
        ))}
        {c.cells.map((cell, i) => (
          <React.Fragment key={i}>
            <Rect x={cell.x + 0.5} y={cell.y + 0.5} width={c.cell - 1} height={c.cell - 1} fill={cell.colour} />
            {cell.text ? (
              <Text x={cell.x + c.cell / 2} y={cell.y + c.cell / 2 + 2} style={{ fontSize: Math.min(5.5, c.cell / 4.5), fontFamily: REVIEW_FONT, fill: cell.dark ? "#ffffff" : INK }} textAnchor="middle">
                {cell.text}
              </Text>
            ) : null}
          </React.Fragment>
        ))}
        {scale.map((v, i) => (
          <React.Fragment key={i}>
            <Rect x={barX} y={c.labelW + i * step} width={8} height={step} fill={v >= 0 ? mixColour([240, 238, 236], [42, 120, 214], v) : mixColour([240, 238, 236], [208, 59, 59], -v)} />
            <Text x={barX + 12} y={c.labelW + i * step + step / 2 + f / 3} style={svgText}>
              {v.toFixed(2)}
            </Text>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

function mixColour(a: number[], b: number[], t: number): string {
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, t)).toString(16).padStart(2, "0")).join("")}`;
}

function Pie({ c }: { c: PieChart }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }} wrap={false}>
      <Svg width={c.size} height={c.size} viewBox={`0 0 ${c.size} ${c.size}`}>
        {c.slices.map((sl, i) => (
          <Path key={i} d={sl.d} fill={sl.colour} stroke="#ffffff" strokeWidth={1} />
        ))}
        <Circle cx={c.cx} cy={c.cy} r={c.hole - 0.5} fill="#ffffff" />
        {c.slices.map((sl, i) =>
          sl.text ? (
            <Text key={`t${i}`} x={sl.lx} y={sl.ly + 2} style={{ fontSize: 6, fontFamily: REVIEW_FONT, fill: "#ffffff", fontWeight: 700 }} textAnchor="middle">
              {sl.text}
            </Text>
          ) : null,
        )}
      </Svg>
      <View style={{ marginLeft: 18, flex: 1 }}>
        {c.slices.map((sl) => (
          <View key={sl.label} style={[s.legendItem, { marginBottom: 3 }]}>
            <View style={[s.swatch, { backgroundColor: sl.colour }]} />
            <Text style={{ fontSize: 7.5, flex: 1 }}>{sl.label}</Text>
            <Text style={{ fontSize: 7.5, fontWeight: 600, marginLeft: 8 }}>{`${sl.value.toFixed(1)}%`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Block({ b }: { b: PdfBlock }) {
  switch (b.kind) {
    case "h3":
      return <Text style={s.h3}>{b.text}</Text>;
    case "p":
      return <Text style={b.muted ? s.muted : s.p}>{b.text}</Text>;
    case "table":
      return <Table t={b} />;
    case "lines":
      return (
        <View>
          <Text style={s.chartTitle}>{b.title}</Text>
          <Lines c={b.chart} />
        </View>
      );
    case "bars":
      return (
        <View>
          <Text style={s.chartTitle}>{b.title}</Text>
          <Bars c={b.chart} />
        </View>
      );
    case "heat":
      return (
        <View>
          <Text style={s.chartTitle}>{b.title}</Text>
          <Heat c={b.chart} />
        </View>
      );
    case "pie":
      return (
        <View>
          <Text style={s.chartTitle}>{b.title}</Text>
          <Pie c={b.chart} />
        </View>
      );
    case "callout": {
      const warn = b.tone === "warn" || b.tone === "danger";
      return (
        <View style={[s.callout, { backgroundColor: warn ? RED_TINT : BLUE_TINT, borderLeftColor: warn ? PDF_STATUS.danger : BLUE }]} wrap={false}>
          <Text style={[s.calloutTitle, { color: warn ? PDF_STATUS.danger : BLUE }]}>{b.title}</Text>
          <Text>{b.text}</Text>
        </View>
      );
    }
    case "numbered":
      return (
        <View style={{ marginTop: 4, marginBottom: 6 }}>
          {b.items.map((it, i) => (
            <View key={i} style={s.numbered} wrap={false}>
              <Text style={[s.numBall, { backgroundColor: it.tone === "danger" ? PDF_STATUS.danger : it.tone === "warn" ? "#eb6834" : BLUE }]}>{String(i + 1)}</Text>
              <Text style={{ flex: 1 }}>
                <Text style={{ fontWeight: 700 }}>{it.lead}</Text>
                {it.text ? ` ${it.text}` : ""}
              </Text>
            </View>
          ))}
        </View>
      );
    case "links":
      return (
        <View style={{ marginBottom: 8 }}>
          {b.items.map((l, i) => (
            <Link key={i} src={l.href} style={s.link}>
              {`${l.label}  ${l.href.replace(/^https?:\/\//, "").slice(0, 70)}`}
            </Link>
          ))}
        </View>
      );
  }
}

function Chapter({ c }: { c: PdfChapter }) {
  return (
    <View>
      <Text style={s.kicker}>{`${c.number} · ${c.title}`}</Text>
      <Text style={s.h2}>{c.title}</Text>
      <Text style={s.lead}>{c.kicker}</Text>
      {c.blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </View>
  );
}

function Cover({ plan }: { plan: PdfPlan }) {
  const meta = plan.meta.split("  ·  ");
  return (
    <View>
      <Text style={s.kicker}>{plan.kicker}</Text>
      <Text style={s.h1}>{plan.title}</Text>
      <Text style={s.lead}>{plan.chapters.map((c) => c.title).join(", ")}, and your questions answered from the review&apos;s own figures.</Text>
      <View style={s.metaRow}>
        {[["Period", meta[0]], ["Figures", meta[1]?.replace(/^figures /, "") ?? ""], ["Rules", meta[2]?.replace(/^judged against /, "") ?? ""]].map(([k, v]) => (
          <View key={k} style={s.metaItem}>
            <Text style={s.metaLabel}>{k}</Text>
            <Text style={s.metaValue}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={s.tiles}>
        {plan.tiles.map((t, i) => (
          <View key={i} style={s.tile}>
            <View style={s.tileBox}>
              <Text style={s.tileLabel}>{t.label.split(",")[0]}</Text>
              <Text style={[s.tileValue, { color: tileColour(t.tone) }]}>{t.value}</Text>
              <Text style={{ fontSize: 6.5, color: MUTED }}>{t.label.includes(",") ? t.label.slice(t.label.indexOf(",") + 1).trim() : ""}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={[s.h2, { fontSize: 12, marginTop: 4 }]}>Bottom line</Text>
      {plan.bottomLine.map((p, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.dot}>•</Text>
          <Text style={{ flex: 1 }}>{p}</Text>
        </View>
      ))}
      {plan.bottomLineFrom === "summary" ? <Text style={s.muted}>No commentary was written for this review; the summary stands in.</Text> : null}
      {plan.verdict ? (
        <View style={s.verdict} wrap={false}>
          <View style={s.verdictTag}>
            <Text>Verdict</Text>
          </View>
          <View style={s.verdictBody}>
            <Text>
              <Text style={{ fontWeight: 700, color: toneColour(plan.verdict.level) }}>{plan.verdict.label}. </Text>
              {plan.verdict.reason}
            </Text>
            {plan.pillars.map((p) => (
              <Text key={p.label} style={{ marginTop: 3 }}>
                <Text style={{ fontWeight: 700, color: toneColour(p.level) }}>{`${p.label}: ${p.status}. `}</Text>
                {p.note}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      <Text style={s.muted}>{plan.disclaimer}</Text>
    </View>
  );
}

/** The footer on every page: the report's name and the page count, one text (a second text for the count beside the name breaks react-pdf's layout past about ten pages). */
function Footer({ plan }: { plan: PdfPlan }) {
  return <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${plan.footer}   ·   ${pageNumber} / ${totalPages}`} />;
}

/** The cover, then one page per chapter (a long chapter runs on), as the HCMP review is laid out. */
export function ReviewPdf({ plan }: { plan: PdfPlan }) {
  return (
    <Document title={plan.title} author="Invariant" subject={plan.kicker} creator="Invariant">
      <Page size="A4" style={s.page}>
        <Cover plan={plan} />
        <Footer plan={plan} />
      </Page>
      {plan.chapters.map((c) => (
        <Page key={c.number} size="A4" style={s.page}>
          <Chapter c={c} />
          <Footer plan={plan} />
        </Page>
      ))}
    </Document>
  );
}
