import { flowLines, flowSvg } from "@/lib/income-flow";
import { barsGeometry, donutGeometry, DOC_COLOURS as C, DOC_FLOW, DOC_SERIES, fmtUnit, lineGeometry, scatterGeometry, type Geometry } from "@/lib/report-charts";
import { OMIT_WORDS, type Block, type Page, type ReportDoc, type Tone } from "@/lib/report-doc";
import { longDate } from "@/lib/time";

/**
 * A `ReportDoc` as one self-contained web page in Invariant's face (Hamza,
 * 4 Nov 2026: "more colourful, more visually appealing, more minimalist ...
 * techie"): graphite slides, a teal accent and a gilt hairline, Barlow
 * Condensed kickers, Plex Mono for every figure, charts as inline SVG with a
 * tooltip on every mark and a table of the same figures for a screen reader.
 * Slides are 16:9 from a laptop's width and flow as cards on a phone; printed,
 * each slide is a page. No script, no external request but the app's own
 * fonts (`/fonts/*.woff2`, from `base`). Pure.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TONE: Record<Tone, string> = { accent: C.accentText, up: C.up, down: C.down, warn: C.warn, muted: C.text3, gilt: C.gilt };
const toneOf = (t: Tone | undefined, fallback: string = C.text) => (t ? TONE[t] : fallback);

/** A figure, not words: short, and led by a digit, a sign or a currency. */
export const looksLikeFigure = (c: string) => c.length <= 28 && /^[-+−±~≈<>]?\s?(?:[A-Z]{3}\s|[$€£¥])?\s?[-+]?\d/.test(c.trim());
/** A column of figures is set right, in Plex Mono; a column of words stays left and wraps. */
export const figureColumn = (rows: readonly { cells: string[] }[], i: number) => i > 0 && rows.some((r) => (r.cells[i] ?? "").trim()) && rows.every((r) => !(r.cells[i] ?? "").trim() || looksLikeFigure(r.cells[i]) || /^(?:Beat|Miss|In line|Holds|Fails|Met|Not met)$/.test(r.cells[i].trim()));

function svgOf(g: Geometry, label: string): string {
  const parts: string[] = [];
  for (const s of g.grid) parts.push(`<path d="${s.d}" stroke="${s.colour}" stroke-width="${s.width}" fill="none"/>`);
  for (const r of g.rects) parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${Math.min(3, r.w / 2)}" fill="${r.colour}"><title>${esc(r.title)}</title></rect>`);
  for (const s of g.strokes) parts.push(`<path d="${s.d}" stroke="${s.colour}" stroke-width="${s.width}" fill="none" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="5 4"' : ""}/>`);
  for (const d of g.dots) parts.push(`<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${d.colour}" stroke="${C.surface}" stroke-width="2"><title>${esc(d.title)}</title></circle>`);
  for (const l of g.labels) parts.push(`<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" fill="${l.colour}" font-size="${l.size}"${l.bold ? ' font-weight="600"' : ""}>${esc(l.text)}</text>`);
  return `<svg viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${esc(label)}" class="chart-svg">${parts.join("")}</svg>`;
}

const legendOf = (g: { legend: { name: string; colour: string }[] }) => (g.legend.length ? `<ul class="legend">${g.legend.map((l) => `<li><i style="background:${l.colour}"></i>${esc(l.name)}</li>`).join("")}</ul>` : "");

function srTable(head: string[], rows: string[][]): string {
  return `<table class="sr"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "tiles":
      return `<div class="tiles">${b.tiles.map((t) => `<div class="tile"><div class="tile-label">${esc(t.label)}</div><div class="tile-value" style="color:${toneOf(t.tone)}">${esc(t.value)}</div>${t.detail ? `<div class="tile-detail">${esc(t.detail)}</div>` : ""}</div>`).join("")}</div>`;
    case "bullets":
      return `<div class="block">${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<ul class="bullets">${b.items.map((i) => `<li><i style="background:${toneOf(i.tone, C.accent)}"></i><span>${i.tag ? `<b class="tag" style="color:${toneOf(i.tone, C.accentText)};border-color:${toneOf(i.tone, C.accent)}">${esc(i.tag)}</b>` : ""}${i.url && /^https:\/\//.test(i.url) ? `<a href="${esc(i.url)}" rel="noreferrer noopener" target="_blank">${esc(i.text)}</a>` : esc(i.text)}</span></li>`).join("")}</ul></div>`;
    case "cards":
      return `<div class="block">${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<div class="cards">${b.cards
        .map((c) => `<div class="card" style="--bar:${toneOf(c.tone, C.accent)}"><div class="card-head">${esc(c.head)}${c.tag ? `<b class="tag" style="color:${toneOf(c.tone, C.accentText)};border-color:${toneOf(c.tone, C.accent)}">${esc(c.tag)}</b>` : ""}</div>${c.big ? `<div class="card-big" style="color:${toneOf(c.tone, C.accentText)}">${esc(c.big)}</div>` : ""}${c.lines.length ? `<ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</div>`)
        .join("")}</div></div>`;
    case "bars": {
      const g = barsGeometry(b, 560, 240);
      return `<figure class="chart"><figcaption>${esc(b.title)}</figcaption>${svgOf(g, b.title)}${legendOf(g)}${srTable(["", ...b.series.map((s) => s.name)], b.cats.map((c, i) => [c, ...b.series.map((s) => (s.values[i] === null ? "" : fmtUnit(s.values[i]!, b.unit)))]))}</figure>`;
    }
    case "line": {
      const g = lineGeometry(b, 560, 240);
      return `<figure class="chart"><figcaption>${esc(b.title)}</figcaption>${svgOf(g, b.title)}${legendOf(g)}</figure>`;
    }
    case "donut": {
      const g = donutGeometry(b, 180);
      const shares = b.parts.slice(0, 6).map((p) => (p.value / g.total) * 100);
      return `<figure class="chart donut"><figcaption>${esc(b.title)}</figcaption><div class="donut-row"><div class="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="${esc(b.title)}" class="donut-svg">${g.arcs.map((a) => `<path d="${a.d}" fill="${a.colour}"><title>${esc(a.title)}</title></path>`).join("")}</svg>${b.center ? `<div class="donut-center"><b>${esc(b.center.value)}</b><span>${esc(b.center.label)}</span></div>` : ""}</div><ul class="donut-list">${b.parts
        .slice(0, 6)
        .map((p, i) => `<li><i style="background:${DOC_SERIES[i % DOC_SERIES.length]}"></i><span>${esc(p.name)}</span><b>${shares[i].toFixed(0)}%</b>${p.text ? `<em>${esc(p.text)}</em>` : ""}</li>`)
        .join("")}</ul></div></figure>`;
    }
    case "scatter": {
      const g = scatterGeometry(b, 560, 260);
      return `<figure class="chart"><figcaption>${esc(b.title)}</figcaption>${svgOf(g, b.title)}<p class="note">${esc(b.yLabel)}</p></figure>`;
    }
    case "table":
      return `<div class="block">${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<div class="table-wrap"><table class="grid"><thead><tr>${b.head.map((h, i) => `<th class="${figureColumn(b.rows, i) ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.cells.map((c, i) => `<td class="${figureColumn(b.rows, i) ? "num" : ""}"${i === r.status ? ` style="color:${toneOf(r.tone)};font-weight:600"` : ""}>${esc(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div></div>`;
    case "meters":
      return `<div class="block">${b.title ? `<h3>${esc(b.title)}</h3>` : ""}<div class="meters">${b.items
        .map((m) => {
          const span = Math.max(Math.abs(m.target) * 1.25, Math.abs(m.now) * 1.1, 1e-9);
          const hb = m.higherIsBetter !== false;
          const frac = (v: number) => Math.max(0, Math.min(1, Math.max(0, v) / span));
          const good = hb ? m.now >= m.target : m.now <= m.target;
          return `<div class="meter"><div class="meter-head"><span>${esc(m.label)}</span><b style="color:${good ? C.up : C.warn}">${esc(m.nowText)}</b></div><div class="meter-track"><div class="meter-fill" style="width:${(frac(m.now) * 100).toFixed(1)}%;background:${good ? C.up : C.warn}"></div><div class="meter-mark" style="left:${(frac(m.target) * 100).toFixed(1)}%"></div></div><div class="meter-foot">target ${esc(m.targetText)}${m.note ? ` · ${esc(m.note)}` : ""}</div></div>`;
        })
        .join("")}</div></div>`;
    case "quad":
      return `<div class="quad">${b.quads.map((q) => `<div class="quad-cell" style="--bar:${TONE[q.tone]}"><h3 style="color:${TONE[q.tone]}">${esc(q.head)}</h3><ul>${q.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>`;
    case "callout":
      return `<div class="callout" style="--bar:${toneOf(b.tone, C.gilt)}">${esc(b.text)}</div>`;
    case "flow":
      return `<figure class="chart flow"><figcaption>${esc(b.title)}</figcaption><div class="flow-wrap">${flowSvg(b.flow, 760, DOC_FLOW, b.title).replace("<svg ", '<svg class="chart-svg flow-svg" ')}</div>${b.flow.notes.length ? `<p class="note">${esc(b.flow.notes.join(" "))}</p>` : ""}${srTable(["", "", ""], flowLines(b.flow).map((l) => [l.label, l.value, l.detail ?? ""]))}</figure>`;
  }
}

function pageHtml(p: Page, i: number, doc: ReportDoc, foot: string): string {
  const charts = p.blocks.filter((b) => ["bars", "line", "donut", "scatter"].includes(b.kind));
  // A split page puts its charts in the right column and the words in the left.
  const body = p.split && charts.length && charts.length < p.blocks.length ? `<div class="cols"><div class="col">${p.blocks.filter((b) => !charts.includes(b)).map(blockHtml).join("")}</div><div class="col">${charts.map(blockHtml).join("")}</div></div>` : p.split ? `<div class="cols">${p.blocks.map((b) => `<div class="col">${blockHtml(b)}</div>`).join("")}</div>` : p.blocks.map(blockHtml).join("");
  return `<section class="slide${p.hero ? " hero" : ""}" id="${esc(p.key)}" aria-label="${esc(p.kicker)}">
<header><div class="kicker"><span>${esc(p.kicker)}</span></div><h2>${esc(p.title)}</h2>${p.hero ? `<p class="sub">${esc(doc.subtitle)}</p>` : ""}</header>
<div class="body">${body}</div>
<footer><span>${esc(foot)} · ${i + 1}</span>${p.ref ? `<span class="ref">${esc(p.ref)}</span>` : ""}</footer>
</section>`;
}

/** The page's styles: the app's tokens, slides 16:9 from 760px, one column below it, a page per slide in print. */
function css(base: string): string {
  const f = (file: string) => `url("${base}/fonts/${file}") format("woff2")`;
  return `
@font-face{font-family:"Plex Mono";src:${f("ibm-plex-mono-400.woff2")};font-weight:400}
@font-face{font-family:"Plex Mono";src:${f("ibm-plex-mono-500.woff2")};font-weight:500}
@font-face{font-family:"Plex Mono";src:${f("ibm-plex-mono-600.woff2")};font-weight:600}
@font-face{font-family:"Barlow Condensed";src:${f("barlow-condensed-500.woff2")};font-weight:500}
@font-face{font-family:"Barlow Condensed";src:${f("barlow-condensed-600.woff2")};font-weight:600}
@font-face{font-family:"Plex Sans";src:${f("ibm-plex-sans-var.woff2")};font-weight:100 700}
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;background:${C.bg};color:${C.text};font-family:"Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.deck{max-width:1280px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}
.slide{container-type:inline-size;position:relative;background:linear-gradient(180deg,${C.surface} 0%,#0f1218 100%);border:1px solid ${C.hairline};border-radius:18px;padding:28px 32px 44px;display:flex;flex-direction:column;gap:18px}
.slide::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,${C.gilt}66,transparent)}
@media (min-width:760px){.slide{aspect-ratio:16/9;padding:36px 44px 48px}}
.hero{background:radial-gradient(120% 90% at 85% 10%,rgba(47,132,136,.32) 0%,rgba(47,132,136,0) 55%),radial-gradient(80% 70% at 0% 100%,rgba(201,169,106,.14) 0%,rgba(201,169,106,0) 60%),${C.bg};justify-content:center}
.hero h2{font-size:clamp(28px,4.4cqw,52px);letter-spacing:-.02em}
.hero .sub{color:${C.text2};font-size:15px;margin:10px 0 0}
.kicker{display:flex;align-items:center;gap:12px;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:600;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:${C.accentText}}
.kicker::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,${C.hairlineStrong},transparent)}
h2{margin:8px 0 0;font-weight:600;font-size:clamp(19px,2.3cqw,28px);line-height:1.2;letter-spacing:-.01em;max-width:62ch}
h3{margin:0 0 10px;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:600;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:${C.text2}}
.body{flex:1;display:flex;flex-direction:column;gap:18px;min-height:0}
.cols{display:grid;grid-template-columns:1fr;gap:22px;align-items:start}
@container (min-width:720px){.cols{grid-template-columns:1fr 1fr}}
.col{display:flex;flex-direction:column;gap:18px;min-width:0}
footer{position:absolute;left:32px;right:32px;bottom:14px;display:flex;justify-content:space-between;gap:16px;font-size:10.5px;color:${C.text3};font-family:"Plex Mono",ui-monospace,monospace}
footer .ref{text-align:right;max-width:55%}
@media (max-width:759px){.slide{padding-bottom:20px}footer{position:static;margin-top:4px}}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.tile{background:${C.surface2};border:1px solid ${C.hairline};border-radius:12px;padding:12px 14px}
.tile-label{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:11.5px;color:${C.text3}}
.tile-value{font-family:"Plex Mono",ui-monospace,monospace;font-weight:500;font-size:clamp(18px,2.1cqw,26px);margin-top:4px;letter-spacing:-.02em}
.tile-detail{font-size:12px;color:${C.text2};margin-top:4px;line-height:1.35}
.bullets{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.bullets li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.45;color:${C.text}}
.bullets a{color:${C.accentText};text-decoration:none;border-bottom:1px solid ${C.accent}55}
.bullets li i{flex:none;width:6px;height:6px;border-radius:2px;margin-top:8px}
.tag{display:inline-block;font-family:"Plex Mono",ui-monospace,monospace;font-weight:600;font-size:10.5px;letter-spacing:.04em;border:1px solid;border-radius:6px;padding:1px 6px;margin-right:8px;vertical-align:1px;text-transform:uppercase}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.card{position:relative;background:${C.surface2};border:1px solid ${C.hairline};border-radius:12px;padding:12px 14px 12px 18px}
.card::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--bar)}
.card-head{font-weight:600;font-size:14px;line-height:1.3;display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.card-big{font-family:"Plex Mono",ui-monospace,monospace;font-weight:500;font-size:22px;margin-top:6px}
.card ul{margin:8px 0 0;padding-left:16px;color:${C.text2};font-size:13px;line-height:1.45}
.card li+li{margin-top:4px}
.chart{margin:0;display:flex;flex-direction:column;gap:6px;min-width:0}
.chart figcaption{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:600;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:${C.text2}}
.chart-svg{width:100%;height:auto;font-family:"Plex Mono",ui-monospace,monospace;overflow:visible}
.flow-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.flow-svg{min-width:560px;font-family:"Plex Mono",ui-monospace,monospace}
.chart-svg rect:hover,.chart-svg circle:hover,.donut-svg path:hover{opacity:.82}
.legend{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:${C.text2}}
.legend li{display:flex;align-items:center;gap:6px}
.legend i,.donut-list i{width:10px;height:10px;border-radius:3px;display:inline-block;flex:none}
.donut-row{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.donut-wrap{position:relative;width:170px;flex:none}
.donut-svg{width:100%;height:auto}
.donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.donut-center b{font-family:"Plex Mono",ui-monospace,monospace;font-weight:500;font-size:20px}
.donut-center span{font-size:11px;color:${C.text3};max-width:90px}
.donut-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px;flex:1;min-width:180px}
.donut-list li{display:grid;grid-template-columns:10px 1fr auto;gap:4px 10px;align-items:center;font-size:13px}
.donut-list b{font-family:"Plex Mono",ui-monospace,monospace;font-weight:500}
.donut-list em{grid-column:2 / 4;font-style:normal;color:${C.text3};font-size:12px}
.note{margin:0;font-size:12px;color:${C.text3}}
.table-wrap{overflow-x:auto}
table.grid{width:100%;border-collapse:collapse;font-size:13px}
table.grid th{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:11.5px;color:${C.text3};text-align:left;padding:6px 10px;border-bottom:1px solid ${C.hairlineStrong}}
table.grid td{padding:7px 10px;border-bottom:1px solid ${C.hairline};vertical-align:top;line-height:1.35}
table.grid .num{text-align:right;font-family:"Plex Mono",ui-monospace,monospace;white-space:nowrap}
table.grid tr:last-child td{border-bottom:0}
.meters{display:flex;flex-direction:column;gap:14px}
.meter-head{display:flex;justify-content:space-between;gap:10px;font-size:13.5px}
.meter-head b{font-family:"Plex Mono",ui-monospace,monospace;font-weight:500}
.meter-track{position:relative;height:8px;border-radius:5px;background:${C.surface2};margin-top:6px;overflow:visible}
.meter-fill{height:100%;border-radius:5px}
.meter-mark{position:absolute;top:-4px;width:2px;height:16px;background:${C.gilt};border-radius:1px}
.meter-foot{font-size:11.5px;color:${C.text3};margin-top:5px;font-family:"Plex Mono",ui-monospace,monospace}
.quad{display:grid;grid-template-columns:1fr;gap:12px}
@container (min-width:640px){.quad{grid-template-columns:1fr 1fr}}
.quad-cell{position:relative;background:${C.surface2};border:1px solid ${C.hairline};border-radius:12px;padding:12px 14px 12px 18px}
.quad-cell::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--bar)}
.quad-cell ul{margin:0;padding-left:16px;font-size:13px;line-height:1.45;color:${C.text}}
.quad-cell li+li{margin-top:4px}
.callout{position:relative;background:linear-gradient(90deg,rgba(47,132,136,.14),rgba(47,132,136,0));border:1px solid ${C.hairline};border-radius:12px;padding:12px 16px 12px 20px;font-size:14.5px;line-height:1.45}
.callout::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--bar)}
.omitted{border:1px solid ${C.hairline};border-radius:14px;padding:16px 20px;color:${C.text2};font-size:12.5px;line-height:1.5}
.omitted h3{margin-bottom:6px}
.omitted ul{margin:0;padding-left:16px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.brand{display:flex;justify-content:space-between;align-items:center;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:600;letter-spacing:.2em;text-transform:uppercase;font-size:12px;color:${C.text3};padding:0 4px}
.brand b{color:${C.text};letter-spacing:.24em}
@page{size:13.333in 7.5in;margin:0}
@media print{html,body{background:${C.bg};-webkit-print-color-adjust:exact;print-color-adjust:exact}.deck{max-width:none;padding:0;gap:0}.brand{display:none}.slide{aspect-ratio:auto;width:13.333in;height:7.5in;border-radius:0;border:0;break-after:page;page-break-after:always}}
`;
}

/** The whole report as one HTML document. `base` is the app's address, for the fonts; empty serves them from the same site. */
export function reportHtml(doc: ReportDoc, base = ""): string {
  const foot = `${doc.title} · Invariant · ${longDate(doc.date)} · Not investment advice`;
  const omitted = doc.omitted.length
    ? `<aside class="omitted"><h3>What is not shown, and why</h3><ul>${doc.omitted.map((o) => `<li><b>${esc(o.what)}</b>: ${esc(OMIT_WORDS[o.why].toLowerCase())}${o.note ? `. ${esc(o.note.replace(/\.+$/, ""))}` : ""}.</li>`).join("")}</ul></aside>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(doc.title)}</title><style>${css(base)}</style></head><body><main class="deck"><div class="brand"><b>Invariant</b><span>${esc(longDate(doc.date))}</span></div>${doc.pages.map((p, i) => pageHtml(p, i, doc, foot)).join("\n")}${omitted}</main></body></html>`;
}
