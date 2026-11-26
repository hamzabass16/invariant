import { Document, Image, Line, Link, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import * as React from "react";

import { REVIEW_FONT } from "@/components/reports/review-pdf";
import { figureGeometry, type PdfPictures, type ThesisPdfData } from "@/lib/thesis-pdf";
import { FROM_LABEL, STANCE_LABEL } from "@/lib/thesis-hunter";
import type { ThesisFigure } from "@/lib/theses";

/**
 * A thesis as a PDF, marked Invariant on every page (Hamza, 20 Oct 2026:
 * "so users can export it and save it or send it to friends"): the review
 * report's face (Inter, near-black on white, a blue kicker, status words with
 * a dot), the app's mark and name in the running head, the thesis, its
 * pillars, what to watch, the kill signals, the valuation per share, the
 * latest results, the charts drawn as geometry and the pictures, what was
 * added and what the Thesis Hunter found, and a footer that says where it was
 * made and that it is not advice. Pure: it draws what lib/thesis-pdf.ts and
 * the route gathered.
 */

const INK = "#0b0b0b";
const MUTED = "#52514e";
const FAINT = "#8a8a88";
const RULE = "#e7e6e2";
const CARD = "#fafaf8";
const CARD_LINE = "#e0e0e0";
const BLUE = "#2a78d6";
const TEAL = "#2f8488";
const STATUS = { ok: "#0ca30c", warn: "#d99400", danger: "#e34948", info: BLUE, neutral: "#606060" } as const;
const TAG = { supported: { word: "Supported", tone: "ok" }, mixed: { word: "Mixed", tone: "warn" }, risk: { word: "At risk", tone: "danger" }, unread: { word: "No reading", tone: "neutral" } } as const;
const STANCE_TONE = { backs: "ok", challenges: "warn", update: "info" } as const;

const s = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: INK, fontFamily: REVIEW_FONT, fontSize: 8.8, lineHeight: 1.45, paddingTop: 56, paddingBottom: 52, paddingHorizontal: 40 },
  head: { position: "absolute", top: 18, left: 40, right: 40, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.6, borderBottomColor: RULE, borderBottomStyle: "solid", paddingBottom: 6 },
  brand: { fontSize: 9, fontWeight: 700, marginLeft: 6 },
  headRight: { marginLeft: "auto", fontSize: 6.8, color: FAINT },
  kicker: { fontSize: 6.8, fontWeight: 700, letterSpacing: 1.1, color: BLUE, textTransform: "uppercase", marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: 700, lineHeight: 1.15 },
  sub: { fontSize: 10.5, color: MUTED, marginBottom: 10 },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  p: { marginBottom: 6 },
  muted: { fontSize: 7.6, color: MUTED, marginBottom: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginBottom: 6 },
  tile: { width: "25%", paddingHorizontal: 4, marginBottom: 8 },
  tileBox: { backgroundColor: CARD, borderWidth: 1, borderColor: CARD_LINE, borderStyle: "solid", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 9, minHeight: 56 },
  tileLabel: { fontSize: 6, fontWeight: 700, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", marginBottom: 3 },
  tileValue: { fontSize: 14, fontWeight: 700, lineHeight: 1.15, marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: RULE, borderBottomStyle: "solid", paddingVertical: 5 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  dot: { width: 10, fontSize: 9, color: BLUE, fontWeight: 700 },
  card: { borderWidth: 1, borderColor: CARD_LINE, borderStyle: "solid", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8 },
  chartTitle: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", marginBottom: 3 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 10 },
  swatch: { width: 7, height: 7, borderRadius: 1.5, marginRight: 4 },
  source: { fontSize: 7, color: MUTED, marginTop: 4 },
  link: { color: BLUE, textDecoration: "none" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 6.6, color: FAINT, textAlign: "center" },
});

/** The app's mark, as app/icon.svg draws it: three teal bars on a dark tile. */
function Mark({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect x={0} y={0} width={64} height={64} rx={14} ry={14} fill="#0b0d12" />
      <Rect x={14} y={36} width={8} height={14} rx={2} ry={2} fill="#256b6e" />
      <Rect x={28} y={26} width={8} height={24} rx={2} ry={2} fill={TEAL} />
      <Rect x={42} y={14} width={8} height={36} rx={2} ry={2} fill="#8fd0d3" />
    </Svg>
  );
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });

function Status({ word, tone }: { word: string; tone: keyof typeof STATUS }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 5.5, height: 5.5, borderRadius: 2.75, backgroundColor: STATUS[tone], marginRight: 4 }} />
      <Text style={{ fontWeight: 600, color: tone === "neutral" ? INK : STATUS[tone] }}>{word}</Text>
    </View>
  );
}

function Chart({ f, width }: { f: ThesisFigure; width: number }) {
  const g = f.chart ? figureGeometry(f.chart, width) : null;
  if (!g) return null;
  const t = { fontSize: 6.2, fontFamily: REVIEW_FONT, fill: MUTED } as const;
  return (
    <View>
      {g.legend.length > 1 ? (
        <View style={s.legend}>
          {g.legend.map((l) => (
            <View key={l.label} style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: l.colour }]} />
              <Text style={{ fontSize: 7, color: MUTED }}>{l.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Svg width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`}>
        {g.ticks.map((k, i) => (
          <React.Fragment key={i}>
            <Line x1={g.plot.x} y1={k.y} x2={g.plot.x + g.plot.w} y2={k.y} stroke={RULE} strokeWidth={0.6} />
            <Text x={g.plot.x - 5} y={k.y + 2} style={t} textAnchor="end">
              {k.label}
            </Text>
          </React.Fragment>
        ))}
        {g.zeroY !== null ? <Line x1={g.plot.x} y1={g.zeroY} x2={g.plot.x + g.plot.w} y2={g.zeroY} stroke="#c6c6c6" strokeWidth={0.8} /> : null}
        {g.bars.map((b, i) => (
          <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.colour} rx={1.5} ry={1.5} />
        ))}
        {g.lines.map((l, i) => (l.d ? <Path key={i} d={l.d} stroke={l.colour} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null))}
        {g.cols.map((c, i) => (
          <Text key={i} x={c.x} y={g.plot.y + g.plot.h + 12} style={t} textAnchor="middle">
            {c.label}
          </Text>
        ))}
      </Svg>
    </View>
  );
}

/** A chart or a picture with its title, caption and source; a picture the PDF could not draw is named with its page. */
function Figure({ f, pictures, width = 493 }: { f: ThesisFigure; pictures: PdfPictures; /** The chart's width inside this card. */ width?: number }) {
  const pic = f.image ? pictures[f.image.url] : undefined;
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.chartTitle}>{f.title}</Text>
      {f.chart ? <Chart f={f} width={width} /> : null}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image takes no alt; the title and caption name it */}
      {f.image && pic ? <Image src={{ data: pic.data, format: pic.format }} style={{ maxWidth: width, maxHeight: 240, objectFit: "contain" }} /> : null}
      {f.image && !pic ? (
        <Text style={s.muted}>
          A picture, shown in the app:{" "}
          <Link src={f.image.url} style={s.link}>
            {f.image.alt || f.image.url.replace(/^https:\/\//, "").slice(0, 70)}
          </Link>
        </Text>
      ) : null}
      {f.caption ? <Text style={{ marginTop: 3 }}>{f.caption}</Text> : null}
      <Text style={s.source}>
        {"Source: "}
        {f.sourceUrl ? (
          <Link src={f.sourceUrl} style={s.link}>
            {f.source}
          </Link>
        ) : (
          f.source
        )}
        {`  ·  ${day(f.at)}`}
      </Text>
    </View>
  );
}

export function ThesisPdf({ d, pictures }: { d: ThesisPdfData; pictures: PdfPictures }) {
  const head = `${d.kind === "stock" ? "Stock thesis" : "Market thesis"} · ${d.title} · exported ${day(d.exportedOn)}`;
  return (
    <Document title={`${d.title} thesis`} author="Invariant" subject={d.kind === "stock" ? "Stock thesis" : "Market thesis"} creator="Invariant" producer="Invariant">
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          <Mark />
          <Text style={s.brand}>Invariant</Text>
          <Text style={s.headRight}>{head}</Text>
        </View>

        <Text style={s.kicker}>{d.kind === "stock" ? "Stock thesis" : "Market thesis"}</Text>
        <Text style={s.h1}>{d.title}</Text>
        <Text style={s.sub}>{[d.subtitle, d.methodology ? `under ${d.methodology}` : null, d.updatedOn ? `updated ${day(d.updatedOn)}` : null].filter(Boolean).join(" · ")}</Text>

        {d.facts.length ? (
          <View style={s.tiles}>
            {d.facts.map((f) => (
              <View key={f.label} style={s.tile}>
                <View style={s.tileBox}>
                  <Text style={s.tileLabel}>{f.label}</Text>
                  <Text style={[s.tileValue, { color: f.tone === "neutral" ? INK : STATUS[f.tone] }]}>{f.value}</Text>
                  {f.detail ? <Text style={{ fontSize: 6.6, color: MUTED }}>{f.detail}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.h2}>The thesis</Text>
        {d.paragraphs.length ? d.paragraphs.map((p, i) => <Text key={i} style={s.p}>{p}</Text>) : <Text style={s.muted}>No words yet.</Text>}
        {d.pathway ? (
          <Text style={s.p}>
            <Text style={{ fontWeight: 700 }}>Pathway. </Text>
            {d.pathway}
          </Text>
        ) : null}

        {d.pillars.length ? (
          <View>
            <Text style={s.h2}>Pillars, read on {day(d.exportedOn)}</Text>
            {d.pillars.map((p) => (
              <View key={p.name} style={s.row} wrap={false}>
                <View style={{ width: "70%", paddingRight: 8 }}>
                  <Text style={{ fontWeight: 700 }}>{p.name}</Text>
                  {p.text || p.words ? <Text style={{ color: MUTED }}>{`${p.text}${p.words ? ` ${p.words}` : ""}`.trim()}</Text> : null}
                </View>
                <View style={{ width: "30%", alignItems: "flex-end" }}>
                  <Status word={TAG[p.tag].word} tone={TAG[p.tag].tone} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {d.watch.length ? (
          <View>
            <Text style={s.h2}>Watch</Text>
            {d.watch.map((w) => (
              <View key={w} style={s.bullet}>
                <Text style={s.dot}>•</Text>
                <Text style={{ flex: 1 }}>{w}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {d.signals.length ? (
          <View>
            <Text style={s.h2}>Kill signals and triggers</Text>
            {d.signals.map((x, i) => (
              <View key={i} style={s.row} wrap={false}>
                <View style={{ width: "70%", paddingRight: 8 }}>
                  <Text style={{ fontWeight: 700 }}>{`${x.kind === "kill" ? "Kill signal" : "Trigger"}: ${x.label}`}</Text>
                  <Text style={{ color: MUTED }}>{x.reading}</Text>
                </View>
                <View style={{ width: "30%", alignItems: "flex-end" }}>
                  <Status word={x.met === null ? "Unread" : x.met ? "Met" : "Not met"} tone={x.met === null ? "neutral" : x.met ? (x.kind === "kill" ? "danger" : "warn") : "ok"} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {d.valuation || d.results ? <Text style={s.h2}>Valuation and results</Text> : null}
        {d.valuation ? (
          <Text style={s.p}>
            <Text style={{ fontWeight: 700 }}>Valuation per share. </Text>
            {`Base ${num(d.valuation.base)} ${d.valuation.currency}${d.valuation.low !== null ? `, bear ${num(d.valuation.low)}` : ""}${d.valuation.high !== null ? `, bull ${num(d.valuation.high)}` : ""}${d.valuation.basis ? ` (${d.valuation.basis})` : ""}, as of ${day(d.valuation.asOf)}${d.valuation.price !== null ? `; the price was ${d.valuation.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on ${day(d.exportedOn)}` : ""}.`}
          </Text>
        ) : null}
        {d.results ? (
          <Text style={s.p}>
            <Text style={{ fontWeight: 700 }}>{`Latest results${d.results.quarter ? `, ${d.results.quarter.replace("/", " ")}` : ""}, ${day(d.results.date)}. `}</Text>
            {d.results.headline}
          </Text>
        ) : null}

        {d.figures.length ? (
          <View>
            {d.figures.map((f, i) => (
              <View key={f.id} wrap={false}>
                {i === 0 ? <Text style={s.h2}>Charts and pictures</Text> : null}
                <Figure f={f} pictures={pictures} />
              </View>
            ))}
          </View>
        ) : null}

        {d.evidence.length ? (
          <View>
            {d.evidence.map((e, i) => (
              <View key={e.id} wrap={false}>
                {i === 0 ? <Text style={s.h2}>Added to the thesis</Text> : null}
                <View style={[s.row, { flexDirection: "column" }]}>
                  <Text style={{ fontWeight: 700 }}>{`${e.source}  ·  ${day(e.at)}`}</Text>
                  <Text>{e.summary}</Text>
                  <Text style={{ color: MUTED }}>{e.changes ? `Changed: ${e.changes}` : "Nothing in the thesis changed."}</Text>
                  <Text style={{ fontSize: 6.8, color: FAINT }}>{e.via === "claude" ? "Added by Claude" : "A note of the author's"}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {d.hunted.length ? (
          <View>
            {d.hunted.map((f, i) => (
              <View key={f.id} wrap={false}>
                {i === 0 ? (
                  <View>
                    <Text style={s.h2}>Added by Thesis Hunter</Text>
                    <Text style={s.muted}>Found by the author&apos;s own model on the web, in their newsletters and in their podcasts. A find never changes the thesis.</Text>
                  </View>
                ) : null}
                <View style={s.card}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <Status word={STANCE_LABEL[f.stance]} tone={STANCE_TONE[f.stance]} />
                  {f.pillar ? <Text style={{ color: MUTED, marginLeft: 8 }}>{f.pillar}</Text> : null}
                  <Text style={{ marginLeft: "auto", color: FAINT, fontSize: 7 }}>{day(f.date ?? f.found)}</Text>
                </View>
                <Text style={{ fontWeight: 700 }}>{f.title}</Text>
                <Text>{f.summary}</Text>
                {f.figure ? <Figure f={f.figure} pictures={pictures} width={471} /> : null}
                <Text style={s.source}>
                  {`${FROM_LABEL[f.from]}: `}
                  {f.sourceUrl ? (
                    <Link src={f.sourceUrl} style={s.link}>
                      {f.source}
                    </Link>
                  ) : (
                    f.source
                  )}
                </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[s.muted, { marginTop: 14 }]}>
          The author&apos;s own thesis, kept in Invariant. Figures come from public filings and markets, and the pillars are read on them as of the export. Not investment advice.
          {d.tryUrl ? (
            <>
              {" "}Try Invariant at{" "}
              <Link src={d.tryUrl} style={s.link}>
                {d.tryUrl.replace(/^https:\/\//, "")}
              </Link>
              .
            </>
          ) : null}
        </Text>

        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Made with Invariant  ·  ${d.tryUrl ? `${d.tryUrl.replace(/^https:\/\//, "")}  ·  ` : ""}Not investment advice  ·  ${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}
