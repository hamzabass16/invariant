import { PDF_SERIES, PDF_STATUS, reviewPdfPlan, type BarChart, type HeatChart, type LineChart, type PdfBlock, type PdfChapter, type PdfPlan, type PdfTable, type PieChart, type Tone } from "@/lib/review-pdf";
import type { Report } from "@/lib/report";

/**
 * The review as a page, drawn from the same plan as its PDF (lib/review-pdf.ts;
 * Hamza, 5 Nov 2026: the page in Reviews looks like the PDF report): white
 * A4 sheets, the cover with its tiles, the bottom line and the black verdict
 * box, then one sheet per chapter with its "01 · Title" kicker, the same
 * tables, the same chart geometry and palette, Inter, and the footer on each
 * sheet. Sizes are the PDF's points, so a sheet at full width is the PDF's
 * page; a phone grows them a little and lays the cover's tiles two to a row.
 * Every chart carries a table behind it. Pure.
 */

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
const F = 6.5;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const safeHref = (h: string | null | undefined) => (h && /^https?:\/\//i.test(h) ? h : null);
const toneColour = (t: Tone | "ok" | "warn" | "danger" | "neutral"): string => PDF_STATUS[t] ?? PDF_STATUS.neutral;
const tileColour = (t: "ok" | "warn" | "danger" | "neutral") => (t === "ok" ? PDF_STATUS.ok : t === "danger" ? PDF_STATUS.danger : t === "warn" ? "#eb6834" : BLUE);
const STATUS_WORD = /^(Followed|Partly|Not followed|Yours to check|Waiting for data|Within|Near the limit|Breach|Tripped|Outside guideline|Intact|Watch|At risk|Sale decided|No class|Residual|Act|Note|Waiting|ALARM)$/i;

function srTable(head: string[], rows: string[][]): string {
  return `<table class="sr"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

const svgOpen = (w: number, h: number, label: string) => `<svg class="chart" viewBox="0 0 ${n(w)} ${n(h)}" style="max-width:calc(var(--u) * ${n(w)})" role="img" aria-label="${esc(label)}">`;
const text = (x: number, y: number, s: string, opts: { anchor?: "start" | "middle" | "end"; size?: number; fill?: string; weight?: number } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${n(opts.size ?? F)}" fill="${opts.fill ?? MUTED}"${opts.anchor && opts.anchor !== "start" ? ` text-anchor="${opts.anchor}"` : ""}${opts.weight ? ` font-weight="${opts.weight}"` : ""}>${esc(s)}</text>`;

function tableHtml(t: PdfTable): string {
  const ncol = Math.max(t.head?.length ?? 0, ...t.rows.map((r) => r.cells.length));
  const widths = t.widths ?? Array.from({ length: ncol }, (_, i) => (ncol === 3 ? [34, 18, 48][i] : 100 / ncol));
  const toneCol = t.toneCol === undefined ? 1 : t.toneCol;
  const cols = `<colgroup>${widths.slice(0, ncol).map((w) => `<col style="width:${n(w)}%">`).join("")}</colgroup>`;
  const head = t.head ? `<thead><tr>${Array.from({ length: ncol }, (_, i) => `<th>${esc(t.head![i] ?? "")}</th>`).join("")}</tr></thead>` : "";
  const body = t.rows
    .map((r) => {
      const cells = Array.from({ length: ncol }, (_, i) => {
        const c = r.cells[i] ?? "";
        const status = toneCol === i && r.tone && c && STATUS_WORD.test(c.trim());
        const href = i === 0 ? safeHref(r.href) : null;
        if (status) {
          const colour = toneColour(r.tone!);
          return `<td><span class="status"><i style="background:${colour}"></i><b style="color:${r.tone === "neutral" ? INK : colour}">${esc(c)}</b></span></td>`;
        }
        if (href) return `<td><a class="row-link" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(c)}</a></td>`;
        const cls = i === 0 && t.head ? ' class="lead-cell"' : i === ncol - 1 && ncol > 2 ? ' class="muted-cell"' : "";
        return `<td${cls}>${esc(c)}</td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="grid">${cols}${head}<tbody>${body}</tbody></table></div>`;
}

function linesHtml(title: string, c: LineChart): string {
  const legend = `<div class="legend">${c.lines.map((l) => `<span><i style="background:${l.colour}"></i>${esc(l.label)}</span>`).join("")}</div>`;
  const parts: string[] = [];
  for (const t of c.ticks) {
    parts.push(`<line x1="${n(c.plot.x)}" y1="${n(t.y)}" x2="${n(c.plot.x + c.plot.w)}" y2="${n(t.y)}" stroke="${RULE}" stroke-width="0.6"/>`);
    parts.push(text(c.plot.x - 5, t.y + F / 3, t.label, { anchor: "end" }));
  }
  if (c.zeroY !== null) parts.push(`<line x1="${n(c.plot.x)}" y1="${n(c.zeroY)}" x2="${n(c.plot.x + c.plot.w)}" y2="${n(c.zeroY)}" stroke="${RULE_DARK}" stroke-width="0.8"/>`);
  for (const col of c.cols) parts.push(text(col.x, c.plot.y + c.plot.h + F + 7, col.label, { anchor: "middle" }));
  for (const l of c.lines) {
    if (l.d) parts.push(`<path d="${l.d}" stroke="${l.colour}" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (l.end) parts.push(text(l.end.x + 5, l.end.y + F / 3, `${l.label} ${l.end.text}`, { fill: l.colour, weight: 700 }));
  }
  return `<figure><figcaption>${esc(title)}</figcaption>${legend}${svgOpen(c.width, c.height, title)}${parts.join("")}</svg>${srTable(c.table.head, c.table.rows)}</figure>`;
}

function barsHtml(title: string, c: BarChart): string {
  const parts = [`<line x1="${n(c.zeroX)}" y1="0" x2="${n(c.zeroX)}" y2="${n(c.height)}" stroke="${RULE_DARK}" stroke-width="0.8"/>`];
  for (const r of c.rows) {
    parts.push(text(c.zeroX - 6 - (r.x < c.zeroX ? c.zeroX - r.x : 0), r.y + r.h / 2 + F / 3, r.label, { anchor: "end", fill: INK }));
    parts.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(Math.max(r.w, 0.5))}" height="${n(r.h)}" fill="${r.colour}" rx="2" ry="2"/>`);
    if (r.mark !== null) parts.push(`<line x1="${n(r.mark)}" y1="${n(r.y - 2)}" x2="${n(r.mark)}" y2="${n(r.y + r.h + 2)}" stroke="${INK}" stroke-width="1.2"/>`);
    parts.push(text(r.x < c.zeroX ? c.zeroX + 4 : r.x + r.w + 4, r.y + r.h / 2 + F / 3, r.text, { fill: INK, weight: 600 }));
  }
  return `<figure><figcaption>${esc(title)}</figcaption>${svgOpen(c.width, c.height, title)}${parts.join("")}</svg>${srTable(["", ""], c.rows.map((r) => [r.label, r.text]))}</figure>`;
}

function mixColour(a: number[], b: number[], t: number): string {
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, t)).toString(16).padStart(2, "0")).join("")}`;
}

function heatHtml(title: string, c: HeatChart): string {
  const barX = c.size + 14;
  const scale = [1, 0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75, -1];
  const step = (c.size - c.labelW) / scale.length;
  const parts: string[] = [];
  c.symbols.forEach((sym, i) => {
    parts.push(text(c.labelW - 4, c.labelW + i * c.cell + c.cell / 2 + F / 3, sym, { anchor: "end" }));
    parts.push(text(c.labelW + i * c.cell + c.cell / 2, c.labelW - 4, sym, { anchor: "middle", size: Math.min(F, c.cell / 4.2) }));
  });
  for (const cell of c.cells) {
    parts.push(`<rect x="${n(cell.x + 0.5)}" y="${n(cell.y + 0.5)}" width="${n(c.cell - 1)}" height="${n(c.cell - 1)}" fill="${cell.colour}"/>`);
    if (cell.text) parts.push(text(cell.x + c.cell / 2, cell.y + c.cell / 2 + 2, cell.text, { anchor: "middle", size: Math.min(5.5, c.cell / 4.5), fill: cell.dark ? "#ffffff" : INK }));
  }
  scale.forEach((v, i) => {
    parts.push(`<rect x="${n(barX)}" y="${n(c.labelW + i * step)}" width="8" height="${n(step)}" fill="${v >= 0 ? mixColour([240, 238, 236], [42, 120, 214], v) : mixColour([240, 238, 236], [208, 59, 59], -v)}"/>`);
    parts.push(text(barX + 12, c.labelW + i * step + step / 2 + F / 3, v.toFixed(2)));
  });
  const k = c.symbols.length;
  const rows = c.symbols.map((a, i) => [a, ...c.symbols.map((_, j) => c.cells[i * k + j]?.text || (i === j ? "1" : ""))]);
  return `<figure><figcaption>${esc(title)}</figcaption>${svgOpen(c.size + 60, c.size + 4, title)}${parts.join("")}</svg>${srTable(["", ...c.symbols], rows)}</figure>`;
}

function pieHtml(title: string, c: PieChart): string {
  const parts = c.slices.map((sl) => `<path d="${sl.d}" fill="${sl.colour}" stroke="#ffffff" stroke-width="1"/>`);
  parts.push(`<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(c.hole - 0.5)}" fill="#ffffff"/>`);
  for (const sl of c.slices) if (sl.text) parts.push(text(sl.lx, sl.ly + 2, sl.text, { anchor: "middle", size: 6, fill: "#ffffff", weight: 700 }));
  const legend = c.slices.map((sl) => `<li><i style="background:${sl.colour}"></i><span>${esc(sl.label)}</span><b>${sl.value.toFixed(1)}%</b></li>`).join("");
  return `<figure><figcaption>${esc(title)}</figcaption><div class="pie">${svgOpen(c.size, c.size, title)}${parts.join("")}</svg><ul class="pie-legend">${legend}</ul></div></figure>`;
}

function blockHtml(b: PdfBlock): string {
  switch (b.kind) {
    case "h3":
      return `<h3>${esc(b.text)}</h3>`;
    case "p":
      return `<p class="${b.muted ? "muted" : "para"}">${esc(b.text)}</p>`;
    case "table":
      return tableHtml(b);
    case "lines":
      return linesHtml(b.title, b.chart);
    case "bars":
      return barsHtml(b.title, b.chart);
    case "heat":
      return heatHtml(b.title, b.chart);
    case "pie":
      return pieHtml(b.title, b.chart);
    case "callout": {
      const warn = b.tone === "warn" || b.tone === "danger";
      const colour = warn ? PDF_STATUS.danger : BLUE;
      return `<div class="callout" style="background:${warn ? RED_TINT : BLUE_TINT};border-left-color:${colour}"><div class="callout-title" style="color:${colour}">${esc(b.title)}</div><div>${esc(b.text)}</div></div>`;
    }
    case "numbered":
      return `<ol class="numbered">${b.items.map((it, i) => `<li><span class="ball" style="background:${it.tone === "danger" ? PDF_STATUS.danger : it.tone === "warn" ? "#eb6834" : BLUE}">${i + 1}</span><span><b>${esc(it.lead)}</b>${it.text ? ` ${esc(it.text)}` : ""}</span></li>`).join("")}</ol>`;
    case "links":
      return `<ul class="links">${b.items
        .map((l) => {
          const href = safeHref(l.href);
          return href ? `<li><a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(l.label)}<span>${esc(href.replace(/^https?:\/\//, ""))}</span></a></li>` : "";
        })
        .join("")}</ul>`;
  }
}

function coverHtml(plan: PdfPlan): string {
  const meta = plan.meta.split("  ·  ");
  const metaItems = [
    ["Period", meta[0] ?? ""],
    ["Figures", meta[1]?.replace(/^figures /, "") ?? ""],
    ["Rules", meta[2]?.replace(/^judged against /, "") ?? ""],
  ]
    .map(([k, v]) => `<span><em>${esc(k)}</em><b>${esc(v)}</b></span>`)
    .join("");
  const tiles = plan.tiles
    .map((t) => {
      const comma = t.label.indexOf(",");
      return `<div class="tile"><div class="tile-box"><div class="tile-label">${esc(comma >= 0 ? t.label.slice(0, comma) : t.label)}</div><div class="tile-value" style="color:${tileColour(t.tone)}">${esc(t.value)}</div><div class="tile-foot">${esc(comma >= 0 ? t.label.slice(comma + 1).trim() : "")}</div></div></div>`;
    })
    .join("");
  const verdict = plan.verdict
    ? `<div class="verdict"><div class="verdict-tag">Verdict</div><div class="verdict-body"><p><b style="color:${toneColour(plan.verdict.level)}">${esc(plan.verdict.label)}.</b> ${esc(plan.verdict.reason)}</p>${plan.pillars.map((p) => `<p><b style="color:${toneColour(p.level)}">${esc(`${p.label}: ${p.status}.`)}</b> ${esc(p.note)}</p>`).join("")}</div></div>`
    : "";
  return `<div class="kicker">${esc(plan.kicker)}</div><h1>${esc(plan.title)}</h1><p class="lead">${esc(plan.chapters.map((c) => c.title).join(", "))}, and your questions answered from the review's own figures.</p><div class="meta">${metaItems}</div><div class="tiles">${tiles}</div><h2 class="bottom">Bottom line</h2><ul class="bullets">${plan.bottomLine.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>${plan.bottomLineFrom === "summary" ? `<p class="muted">No commentary was written for this review; the summary stands in.</p>` : ""}${verdict}<p class="muted">${esc(plan.disclaimer)}</p>`;
}

function chapterHtml(c: PdfChapter): string {
  return `<div class="kicker">${esc(`${c.number} · ${c.title}`)}</div><h2>${esc(c.title)}</h2><p class="lead">${esc(c.kicker)}</p>${c.blocks.map(blockHtml).join("")}`;
}

function css(base: string): string {
  const font = (w: number) => `@font-face{font-family:"Inter";src:url("${base}/fonts/Inter-${w}.ttf") format("truetype");font-weight:${w};font-display:swap}`;
  return `${[400, 500, 600, 700].map(font).join("")}
:root{--u:1pt;color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0}
body{background:#e9e8e4;color:${INK};font-family:"Inter",Arial,sans-serif;-webkit-text-size-adjust:100%}
@media (prefers-color-scheme:dark){body{background:#26272b}}
.sheets{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 12px 24px}
.sheet{position:relative;width:calc(var(--u) * 595);max-width:100%;min-height:calc(var(--u) * 842);background:#fff;padding:calc(var(--u) * 40) calc(var(--u) * 40) calc(var(--u) * 48);box-shadow:0 1px 3px rgba(0,0,0,.14),0 8px 24px rgba(0,0,0,.06);font-size:calc(var(--u) * 8.5);line-height:1.45;overflow-wrap:anywhere}
.foot{position:absolute;bottom:calc(var(--u) * 22);left:calc(var(--u) * 40);right:calc(var(--u) * 40);text-align:right;font-size:calc(var(--u) * 6.3);color:${FAINT}}
.kicker{font-size:calc(var(--u) * 6.5);font-weight:700;letter-spacing:.17em;color:${BLUE};text-transform:uppercase;margin-bottom:calc(var(--u) * 4)}
h1{font-size:calc(var(--u) * 22);font-weight:700;line-height:1.18;margin:0 0 calc(var(--u) * 6)}
h2{font-size:calc(var(--u) * 15);font-weight:700;line-height:1.25;margin:0 0 calc(var(--u) * 4)}
h2.bottom{font-size:calc(var(--u) * 12);margin-top:calc(var(--u) * 4)}
h3{font-size:calc(var(--u) * 10.5);font-weight:700;margin:calc(var(--u) * 14) 0 calc(var(--u) * 5)}
p{margin:0}
.lead{font-size:calc(var(--u) * 9.5);color:${MUTED};margin-bottom:calc(var(--u) * 10)}
.para{margin-bottom:calc(var(--u) * 6)}
.muted{font-size:calc(var(--u) * 7.5);color:${MUTED};margin-bottom:calc(var(--u) * 8)}
.meta{display:flex;flex-wrap:wrap;gap:calc(var(--u) * 2) calc(var(--u) * 16);margin:calc(var(--u) * 4) 0 calc(var(--u) * 10);padding-bottom:calc(var(--u) * 8);border-bottom:.6pt solid #e0e0e0}
.meta em{font-style:normal;font-size:calc(var(--u) * 6.5);color:${MUTED};margin-right:calc(var(--u) * 4)}
.meta b{font-size:calc(var(--u) * 7.5)}
.tiles{display:flex;flex-wrap:wrap;margin:0 calc(var(--u) * -4) calc(var(--u) * 10)}
.tile{width:25%;padding:0 calc(var(--u) * 4);margin-bottom:calc(var(--u) * 8)}
.tile-box{background:${CARD};border:1px solid ${CARD_LINE};border-radius:calc(var(--u) * 6);padding:calc(var(--u) * 8) calc(var(--u) * 9);min-height:calc(var(--u) * 62);height:100%}
.tile-label{font-size:calc(var(--u) * 6);font-weight:700;letter-spacing:.13em;color:${MUTED};text-transform:uppercase;margin-bottom:calc(var(--u) * 3)}
.tile-value{font-size:calc(var(--u) * 16);font-weight:700;line-height:1.15;margin-bottom:calc(var(--u) * 2)}
.tile-foot{font-size:calc(var(--u) * 6.5);color:${MUTED}}
.bullets{list-style:none;margin:0;padding:0}
.bullets li{position:relative;padding-left:calc(var(--u) * 10);margin-bottom:calc(var(--u) * 5)}
.bullets li::before{content:"•";position:absolute;left:0;color:${BLUE};font-weight:700}
.verdict{display:flex;border:1px solid ${CARD_LINE};border-radius:calc(var(--u) * 6);margin:calc(var(--u) * 10) 0;overflow:hidden}
.verdict-tag{flex:0 0 calc(var(--u) * 74);background:${INK};color:#fff;font-size:calc(var(--u) * 9);font-weight:700;padding:calc(var(--u) * 12) calc(var(--u) * 10);display:flex;align-items:center}
.verdict-body{flex:1;padding:calc(var(--u) * 8) calc(var(--u) * 12)}
.verdict-body p+p{margin-top:calc(var(--u) * 3)}
.callout{border-left:3px solid;padding:calc(var(--u) * 6) calc(var(--u) * 10);margin-bottom:calc(var(--u) * 8);border-radius:2px}
.callout-title{font-size:calc(var(--u) * 6.5);font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:calc(var(--u) * 2)}
.table-wrap{margin:calc(var(--u) * 4) 0 calc(var(--u) * 10)}
table.grid{width:100%;border-collapse:collapse;table-layout:fixed}
table.grid th,table.grid td{text-align:left;vertical-align:top;padding:calc(var(--u) * 4) calc(var(--u) * 8) calc(var(--u) * 4) 0;font-size:calc(var(--u) * 7.5);line-height:1.35;border-bottom:.6pt solid ${RULE}}
table.grid th{font-size:calc(var(--u) * 6.3);font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:${MUTED};padding-top:calc(var(--u) * 3);padding-bottom:calc(var(--u) * 3);border-bottom:.8pt solid ${RULE_DARK}}
.lead-cell{font-weight:600}
.muted-cell{color:${MUTED}}
.row-link{color:${INK};font-weight:600;text-decoration:none}
.row-link:hover{text-decoration:underline}
.status{display:inline-flex;align-items:flex-start;gap:calc(var(--u) * 4)}
.status i{flex:0 0 auto;width:calc(var(--u) * 6);height:calc(var(--u) * 6);border-radius:50%;margin-top:calc(var(--u) * 3)}
.status b{font-weight:600}
figure{margin:0}
figcaption{font-size:calc(var(--u) * 7.5);font-weight:600;margin:calc(var(--u) * 8) 0 calc(var(--u) * 3)}
svg.chart{display:block;width:100%;height:auto;font-family:"Inter",Arial,sans-serif;overflow:visible}
.legend{display:flex;flex-wrap:wrap;gap:calc(var(--u) * 2) calc(var(--u) * 10);margin-bottom:calc(var(--u) * 2);font-size:calc(var(--u) * 7);color:${MUTED}}
.legend span{display:inline-flex;align-items:center;gap:calc(var(--u) * 4)}
.legend i,.pie-legend i{display:inline-block;flex:0 0 auto;width:calc(var(--u) * 8);height:calc(var(--u) * 8);border-radius:1.5pt}
.pie{display:flex;align-items:center;gap:calc(var(--u) * 18);margin-bottom:calc(var(--u) * 8)}
.pie svg.chart{flex:0 0 auto;width:calc(var(--u) * 170)}
.pie-legend{list-style:none;margin:0;padding:0;flex:1;min-width:0}
.pie-legend li{display:flex;align-items:center;gap:calc(var(--u) * 4);margin-bottom:calc(var(--u) * 3);font-size:calc(var(--u) * 7.5)}
.pie-legend span{flex:1}
.pie-legend b{font-weight:600;margin-left:calc(var(--u) * 8)}
.numbered{list-style:none;margin:calc(var(--u) * 4) 0 calc(var(--u) * 6);padding:0}
.numbered li{display:flex;gap:calc(var(--u) * 7);margin-bottom:calc(var(--u) * 6)}
.ball{flex:0 0 auto;width:calc(var(--u) * 13);height:calc(var(--u) * 13);border-radius:50%;color:#fff;font-size:calc(var(--u) * 7);font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:calc(var(--u) * 1)}
.links{list-style:none;margin:0 0 calc(var(--u) * 8);padding:0}
.links li{margin-bottom:calc(var(--u) * 2);font-size:calc(var(--u) * 7.5)}
.links a{color:${BLUE};text-decoration:none}
.links a span{margin-left:calc(var(--u) * 8);color:${FAINT}}
.links a:hover{text-decoration:underline}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){:root{--u:1.25pt}.sheets{padding:0;gap:8px}.sheet{min-height:0;padding:22px 16px 44px;box-shadow:none}.foot{left:16px;right:16px;bottom:16px}.tile{width:50%}.verdict{flex-direction:column}.verdict-tag{flex-basis:auto;padding:8px 12px}.pie{flex-direction:column;align-items:flex-start}}
@media print{body{background:#fff}.sheets{padding:0;gap:0}.sheet{box-shadow:none;break-after:page}}`;
}

/** The review's page from its PDF plan: one white sheet for the cover and one per chapter, as the PDF lays them. */
export function reviewPlanHtml(plan: PdfPlan, base = ""): string {
  const sheets = [coverHtml(plan), ...plan.chapters.map(chapterHtml)];
  const total = sheets.length;
  const body = sheets.map((inner, i) => `<section class="sheet${i === 0 ? " cover" : ""}">${inner}<div class="foot">${esc(`${plan.footer}   ·   ${i + 1} / ${total}`)}</div></section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><base target="_blank"><title>${esc(plan.title)}</title><style>${css(base)}</style></head><body><main class="sheets">${body}</main></body></html>`;
}

/** The review's page, from the kept report alone. */
export const reviewHtml = (r: Report, base = ""): string => reviewPlanHtml(reviewPdfPlan(r), base);

/** The address of a review's page, the one Reviews embeds. */
export const reviewViewHref = (id: string) => `/api/reports/deck?id=${encodeURIComponent(id)}`;
/** The address of a review's PDF, the same file the email carries. */
export const reviewPdfHref = (id: string) => `/api/reports/pdf?id=${encodeURIComponent(id)}`;
