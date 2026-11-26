import { Circle, Document, Link, Page, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { figureColumn } from "@/lib/report-html";
import { flowFill, flowLayout } from "@/lib/income-flow";
import { barsGeometry, donutGeometry, DOC_COLOURS as C, DOC_FLOW, DOC_SERIES, lineGeometry, scatterGeometry, type Geometry } from "@/lib/report-charts";
import { OMIT_WORDS, type Block, type Page as DocPage, type ReportDoc, type Tone } from "@/lib/report-doc";
import { longDate } from "@/lib/time";

/**
 * A `ReportDoc` as a PDF, from the same pages and the same chart geometry as
 * the web page (`lib/report-html.ts`), so the file attached to an email reads
 * as the page in the app does: graphite 16:9 pages, the teal accent and the
 * gilt hairline, Barlow Condensed kickers, Plex Mono for every figure, Plex
 * Sans for words (the app's own faces from public/fonts, registered by
 * `registerPdfFonts`). A page with more than fits flows onto the next with
 * the same footer. Server-side only through `lib/report-doc-pdf-run.ts`.
 */

export const DOC_FONTS = { sans: "Invariant Sans", mono: "Invariant Mono", head: "Invariant Head" } as const;

const W = 960;
const H = 540;
const PAD_X = 44;
const INNER = W - 2 * PAD_X;
const GAP = 14;

const TONE: Record<Tone, string> = { accent: C.accentText, up: C.up, down: C.down, warn: C.warn, muted: C.text3, gilt: C.gilt };
const toneOf = (t: Tone | undefined, fallback: string = C.text) => (t ? TONE[t] : fallback);

const S = {
  page: { backgroundColor: C.bg, color: C.text, fontFamily: DOC_FONTS.sans, fontSize: 10.5, lineHeight: 1.4, paddingTop: 34, paddingBottom: 40, paddingHorizontal: PAD_X },
  kickerRow: { flexDirection: "row" as const, alignItems: "center" as const, marginBottom: 6 },
  kicker: { fontFamily: DOC_FONTS.head, fontWeight: 600, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase" as const, color: C.accentText },
  rule: { flexGrow: 1, height: 0.75, backgroundColor: C.hairlineStrong, marginLeft: 10 },
  title: { fontWeight: 600, fontSize: 17, lineHeight: 1.25, marginBottom: 14, maxWidth: 700 },
  heroTitle: { fontWeight: 600, fontSize: 30, lineHeight: 1.15, marginBottom: 8, maxWidth: 760 },
  sub: { color: C.text2, fontSize: 11, marginBottom: 18 },
  h3: { fontFamily: DOC_FONTS.head, fontWeight: 600, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase" as const, color: C.text2, marginBottom: 6 },
  box: { backgroundColor: C.surface2, borderWidth: 0.75, borderColor: C.hairline, borderRadius: 8 },
  foot: { position: "absolute" as const, left: PAD_X, right: PAD_X, bottom: 16, flexDirection: "row" as const, justifyContent: "space-between" as const, fontFamily: DOC_FONTS.mono, fontSize: 7.5, color: C.text3 },
  mono: { fontFamily: DOC_FONTS.mono },
};

function ChartSvg({ g, width }: { g: Geometry; width: number }) {
  const h = (g.height / g.width) * width;
  return (
    <Svg width={width} height={h} viewBox={`0 0 ${g.width} ${g.height}`}>
      {g.grid.map((s, i) => (
        <Path key={`g${i}`} d={s.d} stroke={s.colour} strokeWidth={s.width} fill="none" />
      ))}
      {g.rects.map((r, i) => (
        <Rect key={`r${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(3, r.w / 2)} fill={r.colour} />
      ))}
      {g.strokes.map((s, i) => (
        <Path key={`s${i}`} d={s.d} stroke={s.colour} strokeWidth={s.width} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? "5 4" : undefined} />
      ))}
      {g.dots.map((d, i) => (
        <Circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.colour} stroke={C.surface} strokeWidth={2} />
      ))}
      {g.labels.map((l, i) => (
        <Text key={`l${i}`} x={l.x} y={l.y} textAnchor={l.anchor} style={{ fontFamily: DOC_FONTS.mono, fontSize: l.size, fill: l.colour, fontWeight: l.bold ? 600 : 400 }}>
          {l.text}
        </Text>
      ))}
    </Svg>
  );
}

function Legend({ items }: { items: { name: string; colour: string }[] }) {
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
      {items.map((l, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 }}>
          <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: l.colour, marginRight: 4 }} />
          <Text style={{ fontSize: 8.5, color: C.text2 }}>{l.name}</Text>
        </View>
      ))}
    </View>
  );
}

function Tag({ text, tone }: { text: string; tone?: Tone }) {
  return <Text style={{ fontFamily: DOC_FONTS.mono, fontWeight: 600, fontSize: 7.5, color: toneOf(tone, C.accentText) }}>{`${text.toUpperCase()}  `}</Text>;
}

/** Equal columns that wrap: `per` to a row. */
function Grid({ per, width, children }: { per: number; width: number; children: ReactNode[] }) {
  const w = (width - GAP * (per - 1)) / per;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginRight: -GAP }}>
      {children.map((c, i) => (
        <View key={i} style={{ width: w, marginRight: GAP, marginBottom: GAP }} wrap={false}>
          {c}
        </View>
      ))}
    </View>
  );
}

function BlockPdf({ b, width }: { b: Block; width: number }) {
  switch (b.kind) {
    case "tiles": {
      const per = Math.min(b.tiles.length, width < 500 ? 2 : b.tiles.length > 4 ? 3 : 4);
      return (
        <Grid per={per} width={width}>
          {b.tiles.map((t, i) => (
            <View key={i} style={{ ...S.box, paddingVertical: 9, paddingHorizontal: 11 }}>
              <Text style={{ fontFamily: DOC_FONTS.head, fontWeight: 600, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.text3 }}>{t.label}</Text>
              <Text style={{ ...S.mono, fontWeight: 500, fontSize: 17, marginTop: 3, color: toneOf(t.tone) }}>{t.value}</Text>
              {t.detail ? <Text style={{ fontSize: 8.5, color: C.text2, marginTop: 3 }}>{t.detail}</Text> : null}
            </View>
          ))}
        </Grid>
      );
    }
    case "bullets":
      return (
        <View style={{ marginBottom: GAP }}>
          {b.title ? <Text style={S.h3}>{b.title}</Text> : null}
          {b.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 5 }} wrap={false}>
              <View style={{ width: 5, height: 5, borderRadius: 1.5, backgroundColor: toneOf(it.tone, C.accent), marginTop: 5, marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 10.5, lineHeight: 1.45 }}>
                {it.tag ? <Tag text={it.tag} tone={it.tone} /> : null}
                {it.url && /^https:\/\//.test(it.url) ? (
                  <Link src={it.url} style={{ color: C.accentText, textDecoration: "none" }}>
                    {it.text}
                  </Link>
                ) : (
                  it.text
                )}
              </Text>
            </View>
          ))}
        </View>
      );
    case "cards": {
      const per = width < 500 ? 1 : b.cards.length >= 3 && width > 700 ? 3 : 2;
      return (
        <View>
          {b.title ? <Text style={S.h3}>{b.title}</Text> : null}
          <Grid per={Math.min(per, b.cards.length)} width={width}>
            {b.cards.map((c, i) => (
              <View key={i} style={{ ...S.box, flexDirection: "row", padding: 10 }}>
                <View style={{ width: 2.5, borderRadius: 2, backgroundColor: toneOf(c.tone, C.accent), marginRight: 9 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 600, fontSize: 10.5 }}>
                    {c.tag ? <Tag text={c.tag} tone={c.tone} /> : null}
                    {c.head}
                  </Text>
                  {c.big ? <Text style={{ ...S.mono, fontWeight: 500, fontSize: 16, marginTop: 4, color: toneOf(c.tone, C.accentText) }}>{c.big}</Text> : null}
                  {c.lines.map((l, j) => (
                    <Text key={j} style={{ fontSize: 9.5, color: C.text2, marginTop: 3, lineHeight: 1.4 }}>{`•  ${l}`}</Text>
                  ))}
                </View>
              </View>
            ))}
          </Grid>
        </View>
      );
    }
    case "bars":
    case "line":
    case "scatter": {
      const g = b.kind === "bars" ? barsGeometry(b, 560, 200) : b.kind === "line" ? lineGeometry(b, 560, 200) : scatterGeometry(b, 560, 220);
      const w = Math.min(width, 470);
      return (
        <View style={{ marginBottom: GAP }} wrap={false}>
          <Text style={S.h3}>{b.title}</Text>
          <ChartSvg g={g} width={w} />
          <Legend items={g.legend} />
          {b.kind === "scatter" ? <Text style={{ fontSize: 8.5, color: C.text3, marginTop: 2 }}>{b.yLabel}</Text> : null}
        </View>
      );
    }
    case "donut": {
      const g = donutGeometry(b, 180);
      const size = 130;
      const parts = b.parts.slice(0, 6);
      return (
        <View style={{ marginBottom: GAP }} wrap={false}>
          <Text style={S.h3}>{b.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: size, height: size, marginRight: 16 }}>
              <Svg width={size} height={size} viewBox="0 0 180 180">
                {g.arcs.map((a, i) => (
                  <Path key={i} d={a.d} fill={a.colour} />
                ))}
              </Svg>
              {b.center ? (
                <View style={{ position: "absolute", left: 0, top: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ ...S.mono, fontWeight: 500, fontSize: 14 }}>{b.center.value}</Text>
                  <Text style={{ fontSize: 7.5, color: C.text3, maxWidth: 70, textAlign: "center" }}>{b.center.label}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              {parts.map((p, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: DOC_SERIES[i % DOC_SERIES.length], marginRight: 6 }} />
                  <Text style={{ flex: 1, fontSize: 9.5 }}>{p.name}</Text>
                  <Text style={{ ...S.mono, fontSize: 9.5, fontWeight: 500 }}>{`${((p.value / g.total) * 100).toFixed(0)}%`}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      );
    }
    case "table": {
      const nums = b.head.map((_, i) => figureColumn(b.rows, i));
      const flexOf = (i: number) => (i === 0 ? 2.2 : nums[i] ? 1 : 2);
      const cell = (i: number) => ({ flex: flexOf(i), paddingVertical: 3, paddingHorizontal: 6, textAlign: (nums[i] ? "right" : "left") as "right" | "left" });
      return (
        <View style={{ marginBottom: GAP }}>
          {b.title ? <Text style={S.h3}>{b.title}</Text> : null}
          <View style={{ flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: C.hairlineStrong }} fixed={false}>
            {b.head.map((h, i) => (
              <Text key={i} style={{ ...cell(i), fontFamily: DOC_FONTS.head, fontWeight: 600, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", color: C.text3 }}>
                {h}
              </Text>
            ))}
          </View>
          {b.rows.map((r, j) => (
            <View key={j} style={{ flexDirection: "row", borderBottomWidth: j === b.rows.length - 1 ? 0 : 0.5, borderBottomColor: C.hairline }} wrap={false}>
              {r.cells.map((c, i) => (
                <Text key={i} style={{ ...cell(i), fontSize: 9.5, ...(nums[i] ? S.mono : {}), ...(i === r.status ? { color: toneOf(r.tone), fontWeight: 600 } : {}) }}>
                  {c}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }
    case "meters":
      return (
        <View style={{ marginBottom: GAP }}>
          {b.title ? <Text style={S.h3}>{b.title}</Text> : null}
          {b.items.map((m, i) => {
            const span = Math.max(Math.abs(m.target) * 1.25, Math.abs(m.now) * 1.1, 1e-9);
            const frac = (v: number) => Math.max(0, Math.min(1, Math.max(0, v) / span));
            const good = m.higherIsBetter !== false ? m.now >= m.target : m.now <= m.target;
            const track = Math.min(width, 520);
            return (
              <View key={i} style={{ marginBottom: 9 }} wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", width: track }}>
                  <Text style={{ fontSize: 10 }}>{m.label}</Text>
                  <Text style={{ ...S.mono, fontWeight: 500, fontSize: 10, color: good ? C.up : C.warn }}>{m.nowText}</Text>
                </View>
                <View style={{ width: track, height: 6, borderRadius: 3, backgroundColor: C.surface2, marginTop: 4 }}>
                  <View style={{ width: track * frac(m.now), height: 6, borderRadius: 3, backgroundColor: good ? C.up : C.warn }} />
                  <View style={{ position: "absolute", left: track * frac(m.target) - 1, top: -3, width: 2, height: 12, backgroundColor: C.gilt }} />
                </View>
                <Text style={{ ...S.mono, fontSize: 8, color: C.text3, marginTop: 3 }}>{`target ${m.targetText}${m.note ? ` · ${m.note}` : ""}`}</Text>
              </View>
            );
          })}
        </View>
      );
    case "quad":
      return (
        <Grid per={width < 500 ? 1 : 2} width={width}>
          {b.quads.map((q, i) => (
            <View key={i} style={{ ...S.box, flexDirection: "row", padding: 10 }}>
              <View style={{ width: 2.5, borderRadius: 2, backgroundColor: TONE[q.tone], marginRight: 9 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...S.h3, color: TONE[q.tone] }}>{q.head}</Text>
                {q.items.map((t, j) => (
                  <Text key={j} style={{ fontSize: 9.5, marginTop: 2, lineHeight: 1.4 }}>{`•  ${t}`}</Text>
                ))}
              </View>
            </View>
          ))}
        </Grid>
      );
    case "callout":
      return (
        <View style={{ ...S.box, flexDirection: "row", padding: 11, marginBottom: GAP, backgroundColor: "#13232a" }} wrap={false}>
          <View style={{ width: 2.5, borderRadius: 2, backgroundColor: toneOf(b.tone, C.gilt), marginRight: 10 }} />
          <Text style={{ flex: 1, fontSize: 11, lineHeight: 1.45 }}>{b.text}</Text>
        </View>
      );
    case "flow": {
      // The same layout the page and the app draw (lib/income-flow.ts), scaled to the column.
      const g = flowLayout(b.flow, 760);
      return (
        <View style={{ marginBottom: GAP }} wrap={false}>
          <Text style={S.h3}>{b.title}</Text>
          <Svg width={width} height={(width * g.height) / g.width} viewBox={`0 0 ${g.width} ${g.height}`}>
            {g.bands.map((x, i) => (
              <Path key={`b${i}`} d={x.d} fill={flowFill(x.role, DOC_FLOW)} fillOpacity={0.38} />
            ))}
            {g.nodes.map((n, i) => (
              <Rect key={`n${i}`} x={n.x} y={n.y} width={n.w} height={n.h} rx={2} fill={flowFill(n.role, DOC_FLOW)} />
            ))}
            {g.texts.map((t, i) => (
              <Text key={`t${i}`} x={t.x} y={t.y} textAnchor={t.anchor} style={{ fontFamily: DOC_FONTS.mono, fontSize: t.size, fill: DOC_FLOW.text[t.tone], fontWeight: t.bold ? 600 : 400 }}>
                {t.text}
              </Text>
            ))}
          </Svg>
          {b.flow.notes.length ? <Text style={{ fontSize: 8.5, color: C.text3, marginTop: 2 }}>{b.flow.notes.join(" ")}</Text> : null}
        </View>
      );
    }
  }
}

const isChart = (b: Block) => b.kind === "bars" || b.kind === "line" || b.kind === "donut" || b.kind === "scatter";

function PageBody({ p }: { p: DocPage }) {
  const charts = p.blocks.filter(isChart);
  if (p.split && p.blocks.length > 1) {
    const col = (INNER - 22) / 2;
    const left = charts.length && charts.length < p.blocks.length ? p.blocks.filter((b) => !isChart(b)) : p.blocks.filter((_, i) => i % 2 === 0);
    const right = charts.length && charts.length < p.blocks.length ? charts : p.blocks.filter((_, i) => i % 2 === 1);
    return (
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: col, marginRight: 22 }}>
          {left.map((b, i) => (
            <BlockPdf key={i} b={b} width={col} />
          ))}
        </View>
        <View style={{ width: col }}>
          {right.map((b, i) => (
            <BlockPdf key={i} b={b} width={col} />
          ))}
        </View>
      </View>
    );
  }
  // Charts side by side, two to a row, so a page of tiles and charts stays one page.
  const rows: Block[][] = [];
  for (const b of p.blocks) {
    const last = rows[rows.length - 1];
    if (isChart(b) && last && last.length === 1 && isChart(last[0])) last.push(b);
    else rows.push([b]);
  }
  const half = (INNER - 22) / 2;
  return (
    <View>
      {rows.map((r, i) =>
        r.length === 2 ? (
          <View key={i} style={{ flexDirection: "row" }}>
            <View style={{ width: half, marginRight: 22 }}>
              <BlockPdf b={r[0]} width={half} />
            </View>
            <View style={{ width: half }}>
              <BlockPdf b={r[1]} width={half} />
            </View>
          </View>
        ) : (
          <BlockPdf key={i} b={r[0]} width={INNER} />
        ),
      )}
    </View>
  );
}

export function ReportDocPdf({ doc }: { doc: ReportDoc }) {
  const foot = `${doc.title} · Invariant · ${longDate(doc.date)} · Not investment advice`;
  return (
    <Document title={doc.title} author="Invariant" subject={doc.subtitle} creator="Invariant">
      {doc.pages.map((p, i) => (
        <Page key={p.key} size={[W, H]} style={{ ...S.page, ...(p.hero ? { justifyContent: "center" } : {}) }}>
          <View fixed style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: C.gilt, opacity: 0.35 }} />
          {p.hero ? <View fixed style={{ position: "absolute", right: -120, top: -160, width: 520, height: 520, borderRadius: 260, backgroundColor: C.accent, opacity: 0.12 }} /> : null}
          <View style={S.kickerRow}>
            <Text style={S.kicker}>{p.kicker}</Text>
            <View style={S.rule} />
          </View>
          <Text style={p.hero ? S.heroTitle : S.title}>{p.title}</Text>
          {p.hero ? <Text style={S.sub}>{doc.subtitle}</Text> : null}
          <PageBody p={p} />
          <View fixed style={S.foot}>
            <Text>{`${foot} · ${i + 1}`}</Text>
            {p.ref ? <Text style={{ maxWidth: 380, textAlign: "right" }}>{p.ref}</Text> : null}
          </View>
        </Page>
      ))}
      {doc.omitted.length ? (
        <Page size={[W, H]} style={S.page}>
          <View style={S.kickerRow}>
            <Text style={S.kicker}>Notes</Text>
            <View style={S.rule} />
          </View>
          <Text style={S.title}>What is not shown, and why</Text>
          {doc.omitted.map((o, i) => (
            <Text key={i} style={{ fontSize: 10, color: C.text2, marginBottom: 4, lineHeight: 1.45 }}>
              <Text style={{ color: C.text, fontWeight: 600 }}>{o.what}</Text>
              {`: ${OMIT_WORDS[o.why].toLowerCase()}${o.note ? `. ${o.note.replace(/\.+$/, "")}` : ""}.`}
            </Text>
          ))}
          <View fixed style={S.foot}>
            <Text>{foot}</Text>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}
