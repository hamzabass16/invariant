import { Document, Line, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import * as React from "react";

import { inlineRuns, isFigure, parseBlocks, type Block } from "@/lib/markdown-blocks";
import { passWords } from "@/lib/recipes";
import { FAMILY_LABEL, readingWords, type Study } from "@/lib/research";
import type { Chart } from "@/lib/study-charts";

/**
 * A study as a PDF in the stock template's own style (Space Grotesk, navy on
 * vellum, white tables with a grey header row, status colours only in a
 * result cell): the same blocks the screen shows, the same charts from
 * lib/study-charts.ts, every figure from the study itself. Pure: it draws
 * what it is given; the route registers the fonts and renders it. Sizes are
 * the template's pixels at three quarters, in points.
 */

export const PDF_STYLE = { navy: "#1d325c", bg: "#faf9f6", th: "#e6e8eb", line: "#dcdcdc", good: "#4CAF50", okay: "#FFC107", bad: "#F44336", font: "Space Grotesk" } as const;

const px = (n: number) => n * 0.75;
const s = StyleSheet.create({
  page: { backgroundColor: PDF_STYLE.bg, color: PDF_STYLE.navy, fontFamily: PDF_STYLE.font, fontSize: px(16), lineHeight: 1.6, paddingTop: px(40), paddingBottom: px(48), paddingHorizontal: px(40) },
  h1: { fontSize: px(42), fontWeight: 700, lineHeight: 1.25, marginBottom: px(20), paddingBottom: px(10), borderBottomWidth: px(4), borderBottomColor: PDF_STYLE.navy, borderBottomStyle: "solid" },
  h2: { fontSize: px(32), fontWeight: 700, lineHeight: 1.3, marginTop: px(40), marginBottom: px(10), paddingBottom: px(5) },
  h3: { fontSize: px(20), fontWeight: 700, marginTop: px(25), marginBottom: px(10) },
  p: { marginBottom: px(15) },
  meta: { fontSize: px(13), marginBottom: px(15) },
  li: { flexDirection: "row", marginBottom: px(8), paddingLeft: px(10) },
  bullet: { width: px(18) },
  quote: { borderLeftWidth: px(3), borderLeftColor: PDF_STYLE.line, borderLeftStyle: "solid", paddingLeft: px(12), marginBottom: px(15) },
  code: { fontSize: px(11), lineHeight: 1.4, backgroundColor: "#ffffff", borderWidth: 1, borderColor: PDF_STYLE.line, borderStyle: "solid", padding: px(8), marginBottom: px(15) },
  table: { marginTop: px(12), marginBottom: px(24), backgroundColor: "#ffffff", borderTopWidth: 1, borderLeftWidth: 1, borderColor: PDF_STYLE.line, borderStyle: "solid" },
  tr: { flexDirection: "row" },
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 0, borderRightWidth: 1, borderBottomWidth: 1, borderColor: PDF_STYLE.line, borderStyle: "solid", paddingVertical: px(5), paddingHorizontal: px(8), fontSize: px(13), lineHeight: 1.35 },
  th: { backgroundColor: PDF_STYLE.th, fontWeight: 700 },
  note: { fontWeight: 700, textDecoration: "underline" },
  footer: { position: "absolute", bottom: px(20), left: px(40), right: px(40), textAlign: "center", fontSize: px(10), color: "#5a6a85" },
  chartTitle: { fontSize: px(13), fontWeight: 500, marginTop: px(10), marginBottom: px(4) },
});

const RESULT: Record<string, string> = { pass: "Passes", near: "Near limit", fail: "Fails", "n/a": "Not testable" };

/** Bold, code and italic runs; a bold run that opens the closing line is underlined as the template's note. */
function runs(text: string): React.ReactNode[] {
  return inlineRuns(text).map((r, i) => {
    const note = r.bold && /^what to take from this/i.test(r.text.trim());
    return (
      <Text key={i} style={note ? s.note : r.bold ? { fontWeight: 700 } : r.code ? { fontSize: px(14) } : r.italic ? { fontWeight: 500 } : undefined}>
        {r.text}
      </Text>
    );
  });
}

/** A table as the template draws it: grey header row, a shaded first column on label tables, status words coloured; long tables run on to the next page between rows. */
function Table({ head, rows, widths }: { head: string[] | null; rows: string[][]; widths?: number[] }) {
  const ncol = Math.max(head?.length ?? 0, ...rows.map((r) => r.length));
  const label = !head || ncol <= 3;
  const cell = (c: string, i: number, isHead: boolean) => {
    const low = c.trim().toLowerCase();
    const colour = !isHead ? (/^(pass|passes|holds|good|beat)\b/.test(low) ? PDF_STYLE.good : /^(fail|fails|bad|miss)\b/.test(low) ? PDF_STYLE.bad : /^(near|okay|watch|due|in line)\b/.test(low) ? PDF_STYLE.okay : null) : null;
    return (
      <View key={i} style={[s.cell, isHead || (label && i === 0 && !isHead) ? s.th : {}, widths ? { flexBasis: `${widths[i] ?? 100 / ncol}%`, flexGrow: 0 } : {}, i > 0 && isFigure(c) ? { textAlign: "right" } : {}]}>
        <Text style={colour ? { color: colour, fontWeight: 700 } : undefined}>{isHead ? c : runs(c)}</Text>
      </View>
    );
  };
  return (
    // A table may break between rows, never inside one: a table kept whole that is taller than a page
    // (a class test with a dozen criteria) makes the renderer place it off the page and throw.
    <View style={s.table}>
      {head ? (
        <View style={s.tr} wrap={false}>
          {Array.from({ length: ncol }, (_, i) => cell(head[i] ?? "", i, true))}
        </View>
      ) : null}
      {rows.map((r, ri) => (
        <View key={ri} style={s.tr} wrap={false}>
          {Array.from({ length: ncol }, (_, i) => cell(r[i] ?? "", i, false))}
        </View>
      ))}
    </View>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return (
              <Text key={i} style={s.h3}>
                {runs(b.text)}
              </Text>
            );
          case "quote":
            return (
              <View key={i} style={s.quote}>
                <Text>{runs(b.text)}</Text>
              </View>
            );
          case "code":
            return (
              <Text key={i} style={s.code}>
                {b.text}
              </Text>
            );
          case "list":
            return (
              <View key={i} style={{ marginBottom: px(8) }}>
                {b.items.map((it, j) => (
                  <View key={j} style={s.li}>
                    <Text style={s.bullet}>{b.ordered ? `${j + 1}.` : "•"}</Text>
                    <Text style={{ flex: 1 }}>{runs(it)}</Text>
                  </View>
                ))}
              </View>
            );
          case "table":
            return <Table key={i} head={b.head} rows={b.rows} />;
          default:
            return (
              <Text key={i} style={s.p}>
                {runs(b.text)}
              </Text>
            );
        }
      })}
    </>
  );
}

/** One chart from its geometry: bars or lines, ticks, column labels, a legend; colours are the template's navy and its tints. */
export function ChartSvg({ chart }: { chart: Chart }) {
  const c = chart;
  const f = px(11);
  return (
    <View wrap={false} style={{ marginBottom: px(10) }}>
      <Text style={s.chartTitle}>{c.title}</Text>
      <Svg width={c.width} height={c.height} viewBox={`0 0 ${c.width} ${c.height}`}>
        {c.ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={c.plot.x} y1={t.y} x2={c.plot.x + c.plot.w} y2={t.y} stroke={PDF_STYLE.line} strokeWidth={0.75} />
            <Text x={c.plot.x - 6} y={t.y + f / 3} style={{ fontSize: f, fontFamily: PDF_STYLE.font, fill: PDF_STYLE.navy }} textAnchor="end">
              {t.label}
            </Text>
          </React.Fragment>
        ))}
        {c.zeroY !== null ? <Line x1={c.plot.x} y1={c.zeroY} x2={c.plot.x + c.plot.w} y2={c.zeroY} stroke={PDF_STYLE.navy} strokeWidth={1} /> : null}
        {c.bars.map((b, i) => <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.colour} />)}
        {c.lines.map((l, i) => (
          <React.Fragment key={i}>
            {l.points.length > 1 ? <Path d={l.points.map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} stroke={l.colour} strokeWidth={2} fill="none" /> : null}
            {l.points.map((p, j) => <Rect key={j} x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} fill={l.colour} />)}
          </React.Fragment>
        ))}
        {c.cols.map((col, i) => (
          <Text key={i} x={col.x} y={c.plot.y + c.plot.h + f + 6} style={{ fontSize: f, fontFamily: PDF_STYLE.font, fill: PDF_STYLE.navy }} textAnchor="middle">
            {col.label}
          </Text>
        ))}
        {c.legend.map((l, i) => {
          const x = c.plot.x + i * (c.plot.w / Math.max(c.legend.length, 1));
          const y = c.height - 8;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={y - 7} width={9} height={9} fill={l.colour} />
              <Text x={x + 13} y={y} style={{ fontSize: f, fontFamily: PDF_STYLE.font, fill: PDF_STYLE.navy }}>
                {l.label}
              </Text>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const num = (v: number | null, unit: "money" | "perShare" | "shares" | "pct" | "ratio"): string => {
  if (v === null) return "–";
  if (unit === "money") return Math.abs(v) >= 1e6 ? Math.round(v / 1e6).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (unit === "shares") return Math.round(v / 1e6).toLocaleString("en-US");
  if (unit === "pct") return `${v.toFixed(1)}%`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

/** The whole study: title and context, the methodology's verdict, the sections, the charts and the figures. */
export function StudyPdf({ study, charts, currency }: { study: Study; charts: Chart[]; currency: string | null }) {
  const v = study.verdict;
  const h = study.holding;
  return (
    <Document title={`${study.subject} study`} author="Invariant" subject={study.templateTitle} creator="Invariant">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {study.subject}
          {study.ticker && study.ticker !== study.subject ? ` (${study.ticker})` : ""}
        </Text>
        <Text style={s.meta}>
          {study.templateTitle} · {FAMILY_LABEL[study.family]} · requested {study.requestedAt.slice(0, 10)}
          {study.finishedAt ? `, finished ${study.finishedAt.slice(0, 10)}` : ""}
        </Text>
        {study.question ? (
          <Text style={s.p}>
            <Text style={{ fontWeight: 700 }}>Question. </Text>
            {study.question}
          </Text>
        ) : null}
        {h ? (
          <Text style={s.p}>
            <Text style={{ fontWeight: 700 }}>In the book. </Text>
            {h.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} units at {h.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} {h.currency}, {h.weightPct.toFixed(2)}% of net worth
            {h.capPct !== null ? ` against a ${h.capPct}% cap` : ""}
            {h.classLabel ? `, ${h.classLabel}` : ""}
            {h.ownValuation ? `; own valuation ${h.ownValuation.low ?? "–"} / ${h.ownValuation.base} / ${h.ownValuation.high ?? "–"} as of ${h.ownValuation.asOf}` : "; no own valuation recorded"}.
          </Text>
        ) : null}
        {study.markets.length ? (
          <Text style={s.p}>
            <Text style={{ fontWeight: 700 }}>Markets when the study started. </Text>
            {study.markets.map((r) => `${r.name} ${r.value}`).join(" · ")} (as of {study.markets[0].asOf}).
          </Text>
        ) : null}

        {v ? (
          <>
            <Text style={s.h2}>Methodology checks</Text>
            <Text style={s.p}>{v.classLabel ? `Class: ${v.classLabel}.` : "No class of the methodology fits the subject."}</Text>
            {v.checks.length ? (
              <Table head={["Section", "Rule", "Figure", "Limit", "Now", "Result"]} rows={v.checks.map((c) => [c.section, c.text, c.figure, c.limit, c.actual ?? (c.detail || ""), RESULT[c.status] ?? c.status])} widths={[9, 33, 18, 12, 14, 14]} />
            ) : (
              <Text style={s.p}>The methodology has no rule the app can test on this subject.</Text>
            )}
            {v.classTests.length ? <Text style={s.h3}>Classification Test</Text> : null}
            {[...v.classTests]
              .sort((a, b) => Number(b.holds) - Number(a.holds))
              .map((t) => (
                <View key={t.classId}>
                  <Text style={s.p}>
                    <Text style={{ fontWeight: 700 }}>{t.label}</Text>
                    {`: ${t.holds ? "holds" : "does not hold"}; ${passWords(t)}.`}
                  </Text>
                  <Table head={["Criterion", "Reading", "Result"]} rows={[...t.required.map((x) => [`${x.label} (required)`, readingWords(x), x.pass ? "Pass" : x.read ? "Fail" : "No reading"]), ...t.criteria.map((x) => [x.label, readingWords(x), x.pass ? "Pass" : x.read ? "Fail" : "No reading"])]} widths={[46, 36, 18]} />
                </View>
              ))}
          </>
        ) : null}

        {study.sections.map((sec) => (
          <View key={sec.id}>
            <Text style={s.h2}>{sec.title}</Text>
            {study.written[sec.id] ? <Blocks blocks={parseBlocks(study.written[sec.id])} /> : <Text style={s.p}>{study.pending.includes(sec.id) ? "Not written yet." : "Nothing written."}</Text>}
          </View>
        ))}

        {study.table || charts.length ? (
          <>
            <Text style={s.h2} break>
              Figures from the filings
            </Text>
            {charts.map((c, i) => (
              <ChartSvg key={i} chart={c} />
            ))}
            {study.table ? (
              <>
                <Text style={s.p}>Money in millions{currency ? ` of ${currency}` : ""}; shares in millions; per-share figures and ratios as reported or derived. Derived rows are arithmetic on the reported ones beside them.</Text>
                <Table head={["", ...study.table.cols]} rows={study.table.rows.map((r) => [r.label, ...r.values.map((x) => num(x, r.unit))])} />
              </>
            ) : null}
            {study.fundamentalsNotes.length ? <Text style={s.p}>Could not be derived: {study.fundamentalsNotes.join("; ")}.</Text> : null}
          </>
        ) : study.factsNote ? (
          <Text style={s.p}>{study.factsNote}</Text>
        ) : null}

        {/* A static line, no page numbers: any text re-rendered per page (react-pdf's render prop) makes the renderer throw once a study runs to many pages. */}
        <Text style={s.footer} fixed>{`${study.subject} · ${study.templateTitle} · Invariant · from the filings and the methodology's own checks · not investment advice`}</Text>
      </Page>
    </Document>
  );
}
