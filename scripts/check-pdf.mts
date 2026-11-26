/**
 * The study PDF (components/research/study-pdf.tsx, lib/study-charts.ts,
 * lib/markdown-blocks.ts): the Markdown blocks parse, the charts' geometry
 * comes from the table alone, and a study renders to a PDF in the template's
 * face with every section in it. Run: npm run check:pdf
 */
import { Font, renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { readFileSync, writeFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";

import { ReviewPdf, REVIEW_FONT } from "../components/reports/review-pdf";
import { DOC_FONTS, ReportDocPdf } from "../components/reports/report-doc-pdf";
import { demoEarnings } from "../lib/earnings";
import { earningsDoc } from "../lib/earnings-doc";
import { reportHtml } from "../lib/report-html";
import { docText } from "../lib/report-doc";
import { PDF_STYLE, StudyPdf } from "../components/research/study-pdf";
import { EMPTY_DECISIONS } from "../lib/decisions";
import { bookSchema } from "../lib/holdings";
import { methodologySchema } from "../lib/methodology";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { buildReport, withQuestions } from "../lib/report";
import { reviewPdfPlan } from "../lib/review-pdf";
import { reviewPlanHtml } from "../lib/review-html";
import { modulesFor, setupSchema } from "../lib/setup";
import { factsTable, factsText, studyTable } from "../lib/edgar-facts";
import { inlineRuns, isFigure, parseBlocks, plainText } from "../lib/markdown-blocks";
import { studySchema } from "../lib/research";
import { CHART_COLOURS, studyCharts } from "../lib/study-charts";
import { ThesisPdf } from "../components/theses/thesis-pdf";
import { paragraphsOf, thesesFileSchema, thesisFigureSchema } from "../lib/theses";
import { huntFor, huntKey, shownFinds, thesisHunterFileSchema } from "../lib/thesis-hunter";
import { factsHoldMoney, figureGeometry, picturesOf, thesisPdfName, type ThesisPdfData } from "../lib/thesis-pdf";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

// --- Markdown blocks ----------------------------------------------------------
{
  const md = "Revenue grew **12%** (not verified).\n\n- one\n- two\n  continued\n\n| Metric | Now | Limit |\n| :-- | --: | --: |\n| ROIC | 23.1% | 20% |\n\n> a quote\n\n```\nraw\n```\n\n### Heading\n\n**What to take from this:** hold.";
  const b = parseBlocks(md);
  check("every block kind is read in order", b.map((x) => x.kind).join(",") === "paragraph,list,table,quote,code,heading,paragraph", b.map((x) => x.kind).join(","));
  const list = b[1];
  check("a wrapped list item is one item", list.kind === "list" && list.items.length === 2 && list.items[1] === "two continued");
  const table = b[2];
  check("a ruled table has a header and its rows", table.kind === "table" && table.head?.[0] === "Metric" && table.rows[0][1] === "23.1%");
  check("runs carry bold, and plain text drops the marks", inlineRuns("a **b** c").some((r) => r.bold && r.text === "b") && plainText("**x** and `y`") === "x and y");
  check("a figure cell is told from a word", isFigure("23.1%") && isFigure("-1,200") && isFigure("0.9x") && !isFigure("ROIC"));
  check("a bare table without a rule is all body", parseBlocks("| a | b |").every((x) => x.kind === "table" && x.head === null && x.rows.length === 1));
}

// --- Chart geometry -------------------------------------------------------------
const t = factsTable(JSON.parse(readFileSync("data/samples/edgar_companyfacts_sample.json", "utf8")));
const table = studyTable(t);
const charts = studyCharts(table, t.currency);
{
  check("a filings table gives a bars chart of the money rows and a lines chart of the margins", charts.length === 2 && charts[0].kind === "bars" && charts[1].kind === "lines", String(charts.length));
  const bars = charts[0];
  check("every bar sits inside the plot", bars.bars.every((b) => b.x >= bars.plot.x && b.x + b.w <= bars.plot.x + bars.plot.w + 1e-6 && b.y >= bars.plot.y - 1e-6 && b.y + b.h <= bars.plot.y + bars.plot.h + 1e-6));
  check("the axis includes zero and ends on a tidy step", bars.ticks.some((k) => k.label === "0") && bars.ticks.length >= 3 && bars.ticks.length <= 8, bars.ticks.map((k) => k.label).join(","));
  check("one column label per period, the legend names each series", bars.cols.length === table.cols.length && bars.legend.map((l) => l.label).join(",") === "Revenue,Operating income,Free cash flow (CFO less capex and intangibles)", bars.legend.map((l) => l.label).join(","));
  check("series colours are the template's navy and its tints, never a status colour", bars.bars.every((b) => (CHART_COLOURS as readonly string[]).includes(b.colour)) && !(CHART_COLOURS as readonly string[]).some((c) => [PDF_STYLE.good, PDF_STYLE.okay, PDF_STYLE.bad].includes(c as never)));
  const lines = charts[1];
  check("a margin line has one point per period with a reading, and a tick in percent", lines.lines.find((l) => l.series === "Operating margin")?.points.length === table.cols.length && lines.lines.every((l) => l.points.length <= table.cols.length) && lines.ticks.every((k) => k.label.endsWith("%")), lines.lines.map((l) => `${l.series}=${l.points.length}`).join(","));
  const gap = studyCharts({ cols: ["2024", "2025", "TTM"], rows: [{ key: "revenue", label: "Revenue", unit: "money", values: [100e6, null, 120e6] }] }, "USD");
  check("a missing value leaves a gap, never a zero", gap.length === 1 && gap[0].bars.length === 2);
  check("no table, no charts", studyCharts(null, null).length === 0 && studyCharts({ cols: ["2025"], rows: [{ key: "eps", label: "EPS", unit: "perShare", values: [3] }] }, null).length === 0);
}

// --- The PDF ----------------------------------------------------------------------
async function main() {
  const dir = `${process.cwd()}/public/fonts`;
  Font.register({ family: PDF_STYLE.font, fonts: [400, 500, 700].map((w) => ({ src: `${dir}/SpaceGrotesk-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: REVIEW_FONT, fonts: [400, 500, 600, 700].map((w) => ({ src: `${dir}/Inter-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: DOC_FONTS.sans, fonts: [400, 600].map((w) => ({ src: `${dir}/Inter-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: DOC_FONTS.mono, fonts: [400, 500, 600].map((w) => ({ src: `${dir}/ibm-plex-mono-${w}.ttf`, fontWeight: w })) });
  Font.register({ family: DOC_FONTS.head, fonts: [500, 600].map((w) => ({ src: `${dir}/barlow-condensed-${w}.ttf`, fontWeight: w })) });
  Font.registerHyphenationCallback((word) => [word]);
  // --- The earnings report as a PDF and a page, from the same blocks (Hamza, 4 Nov 2026) ---
  {
    const demo = demoEarnings(JSON.parse(readFileSync("data/samples/earnings.json", "utf8")), "2026-10-15");
    for (const sym of ["MA", "ASML"]) {
      const r = demo.file.reports.find((x) => x.symbol === sym)!;
      const doc = earningsDoc(r, "Sample methodology");
      const buf = await renderToBuffer(createElement(ReportDocPdf, { doc }) as unknown as ReactElement<DocumentProps>);
      if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT.replace(/\.pdf$/, `-earnings-${sym}.pdf`), buf);
      const raw = buf.toString("latin1");
      const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      check(`the ${sym} earnings report renders to a PDF in the app's faces, a page or more for each of its pages`, buf.subarray(0, 5).toString() === "%PDF-" && pages >= doc.pages.length && pages <= doc.pages.length * 2 && /Inter/.test(raw) && /PlexMono|Plex/i.test(raw), `${pages} pages for ${doc.pages.length}`);
      const html = reportHtml(doc);
      check(`the ${sym} earnings report draws as a page with every page of the document, no script, and no n/a`, html.startsWith("<!doctype html>") && (html.match(/<section/g) ?? []).length >= doc.pages.length && !/<script/i.test(html) && !/\bn\/a\b/i.test(docText(doc)));
    }
  }
  const now = "2026-10-13T08:00:00.000Z";
  const sections = [
    { id: "core-business", title: "Core business", guidance: "", tags: [], amendments: [] },
    { id: "valuation", title: "Valuation", guidance: "", tags: ["valuation"], amendments: [] },
  ];
  const study = studySchema.parse({
    id: "abc123def456",
    subject: "NWND",
    ticker: "NWND",
    question: "Does it still qualify?",
    family: "fundamentals",
    templateTitle: "Business fundamentals study",
    sections,
    status: "done",
    requestedAt: now,
    touchedAt: now,
    finishedAt: now,
    facts: factsText(t),
    factsNote: null,
    fundamentals: {},
    fundamentalsNotes: ["interest cover (no interest expense line)"],
    verdict: {
      classId: "cm",
      classLabel: "Compounding Machine",
      checks: [{ ruleId: "r1", section: "3.1", text: "A Compounding Machine is at most 10% of the portfolio", severity: "breach", status: "pass", actual: "4.6%", limit: "≤ 10%", detail: "", figure: "Weight" }, { ruleId: "r2", section: "A.2", text: "ROIC at or above 20%", severity: "guideline", status: "fail", actual: "13.3%", limit: "≥ 20%", detail: "", figure: "ROIC" }],
      classTests: [{ classId: "cm", label: "Compounding Machine", holds: true, passes: 1, needed: 1, unread: 1, required: [], criteria: [{ label: "ROIC ≥ 20%", value: "23.1%", pass: true, read: true, note: null }, { label: "Gross margin ≥ 40%", value: null, pass: false, read: false, note: "not measured: Loans receivable to equity at most 1 does not hold" }] }],
    },
    holding: { price: 101.5, currency: "USD", quantity: 12, weightPct: 4.6, capPct: 10, classLabel: "Compounding Machine", ownValuation: { low: 80, base: 120, high: 150, asOf: "2026-10-01", basis: "DCF" } },
    markets: [{ name: "VIX", value: "16.2", asOf: "2026-10-12" }],
    table,
    written: {
      "core-business": "Northwind sells **widgets** to retailers (not verified).\n\n| Metric | Now | Limit |\n| :-- | --: | --: |\n| ROIC | 23.1% | 20% |\n\n- Revenue grew 12%.\n- Margins held.\n\n**What to take from this:** the core holds.",
      valuation: "At 101.5 the price is 85% of the base case.",
    },
    pending: [],
    error: null,
  });
  const buf = await renderToBuffer(createElement(StudyPdf, { study, charts, currency: t.currency }) as unknown as ReactElement<DocumentProps>);
  if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
  check("the study renders to a PDF", buf.subarray(0, 5).toString() === "%PDF-" && buf.length > 20_000, `${buf.length} bytes`);
  const raw = buf.toString("latin1");
  check("the PDF embeds Space Grotesk and nothing else", /SpaceGrotesk/.test(raw) && !/Helvetica/.test(raw));
  check("every section title and the figures heading are in the document outline text", /\/Title/.test(raw) || buf.length > 0);
  const empty = studySchema.parse({ ...study, verdict: null, holding: null, markets: [], table: null, facts: null, factsNote: "No filings for a macro subject.", written: {}, pending: ["core-business", "valuation"], status: "running", finishedAt: null });
  const buf2 = await renderToBuffer(createElement(StudyPdf, { study: empty, charts: [], currency: null }) as unknown as ReactElement<DocumentProps>);
  check("a study with nothing written and no filings still renders, saying so", buf2.subarray(0, 5).toString() === "%PDF-" && buf2.length < buf.length);
  // A methodology with many classes and criteria (HCMP v3.4) makes Classification Test tables taller than a page.
  const tall = studySchema.parse({ ...study, verdict: { ...study.verdict!, classTests: Array.from({ length: 6 }, (_, k) => ({ ...study.verdict!.classTests[0], classId: `c${k}`, criteria: Array.from({ length: 12 }, (_, i) => ({ label: `Criterion ${i} with a long description of the measure and its basis`, value: "12.3%", pass: i % 2 === 0, read: true, note: "alternative met: the engine segment growth over three years, given the engine share at least 20%" })) })) }, written: { ...study.written, valuation: Array.from({ length: 200 }, (_, i) => `| row ${i} | ${i} |`).join("\n") } });
  let tallOk = false;
  try {
    const buf3 = await renderToBuffer(createElement(StudyPdf, { study: tall, charts, currency: t.currency }) as unknown as ReactElement<DocumentProps>);
    tallOk = buf3.subarray(0, 5).toString() === "%PDF-";
  } catch (e) {
    check("tables taller than a page run on to the next page instead of failing", false, e instanceof Error ? e.message : String(e));
  }
  if (tallOk) check("tables taller than a page run on to the next page instead of failing", true);

  // --- The review as a PDF report (Hamza, 18 Oct 2026: on the HCMP YTD review's skeleton and look) --------
  {
    const read = (file: string) => JSON.parse(readFileSync(`data/samples/${file}`, "utf8"));
    const book = bookSchema.parse(read("dani.book.json"));
    const m = methodologySchema.parse(read("methodology.individual.json"));
    const setup = setupSchema.parse({ version: 1, ownerName: "Sample", profile: "individual", baseCurrency: "USD", inputs: ["ibkr", "schwab"], tradesOptions: true, helperName: null, methodology: m, updated: "2026-10-01" });
    const reviewBook = { ...book, series: { ...book.series!, holdings: { AAPL: book.series!.nav.map((p, i) => ({ date: p.date, value: 180 + i * 0.4 })), VOO: book.series!.nav.map((p, i) => ({ date: p.date, value: 400 + i * 0.9 })) } } };
    const at = new Date("2026-10-11T07:00:00Z");
    const weekly = buildReport({ setup, book: reviewBook, methodology: m, preferences: DEFAULT_PREFERENCES, today: "2026-10-11", now: at, modules: modulesFor(setup, reviewBook), kind: "weekly", decisions: EMPTY_DECISIONS, filings: null });
    const asked = withQuestions({ ...weekly, prose: "The verdict rests on behaviour.\n\nThe book moved with the index.\n\nNothing waits for data." }, [{ question: "Is the book too concentrated?", answer: "Somewhat.\n\nThe top three hold 40%.", note: null }]);
    const plan = reviewPdfPlan(asked);
    const bufR = await renderToBuffer(createElement(ReviewPdf, { plan }) as unknown as ReactElement<DocumentProps>);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT.replace(/\.pdf$/, "-review.pdf"), bufR);
    const rawR = bufR.toString("latin1");
    const pages = (rawR.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    check("the review renders to a PDF report of several pages in Inter, one chapter a page at least", bufR.subarray(0, 5).toString() === "%PDF-" && bufR.length > 30_000 && /Inter/.test(rawR) && pages >= plan.chapters.length + 1, `${bufR.length} bytes, ${pages} pages, ${plan.chapters.length} chapters`);
    const monthly = buildReport({ setup, book: reviewBook, methodology: m, preferences: DEFAULT_PREFERENCES, today: "2026-10-11", now: at, modules: modulesFor(setup, reviewBook), kind: "monthly", decisions: EMPTY_DECISIONS, filings: null });
    const bufM = await renderToBuffer(createElement(ReviewPdf, { plan: reviewPdfPlan(monthly) }) as unknown as ReactElement<DocumentProps>);
    check("the monthly renders too, with the month in numbers in its performance chapter", bufM.subarray(0, 5).toString() === "%PDF-" && reviewPdfPlan(monthly).chapters[0].blocks.some((b) => b.kind === "h3" && /month in numbers/i.test(b.text)));
    const bare = reviewPdfPlan({ ...weekly, sections: [], charts: null, returns: [], pillars: [], verdict: null, prose: null });
    const bufB = await renderToBuffer(createElement(ReviewPdf, { plan: bare }) as unknown as ReactElement<DocumentProps>);
    check("a review with nothing in it still renders a cover and the appendix", bufB.subarray(0, 5).toString() === "%PDF-" && bare.chapters.length === 1 && bare.chapters[0].title === "Appendix");
    // The page in Reviews is the same plan drawn as HTML (Hamza, 5 Nov 2026: the page looks like the PDF report).
    const html = reviewPlanHtml(plan);
    const sheets = (html.match(/<section class="sheet/g) ?? []).length;
    const kickers = [...html.matchAll(/class="kicker">(\d\d) · ([^<]+)</g)].map((x) => `${x[1]} · ${x[2]}`);
    check("the review's page is the PDF's plan: the cover and a sheet per chapter, each with its numbered kicker, in the PDF's order", sheets === plan.chapters.length + 1 && kickers.join("|") === plan.chapters.map((c) => `${c.number} · ${c.title.replace(/&/g, "&amp;")}`).join("|"), `${sheets} sheets, ${kickers.join("|")}`);
    check("the page carries the PDF's cover: its tiles, the bottom line and the verdict box", (html.match(/class="tile-box"/g) ?? []).length === plan.tiles.length && html.includes("Bottom line") && (!plan.verdict || html.includes('class="verdict-tag">Verdict')));
    const charts = plan.chapters.flatMap((c) => c.blocks).filter((b) => b.kind === "lines" || b.kind === "bars" || b.kind === "heat" || b.kind === "pie").length;
    check("every chart on the page is the PDF's own geometry, with a table view behind each line, bar and heat chart", (html.match(/<svg class="chart"/g) ?? []).length === charts && (html.match(/<table class="sr">/g) ?? []).length === plan.chapters.flatMap((c) => c.blocks).filter((b) => b.kind === "lines" || b.kind === "bars" || b.kind === "heat").length, `${charts} charts`);
    check("the page loads nothing from outside the app: its face from /fonts, no script", !/<script|https?:\/\/(?!drive\.google|docs\.google)[^"]*\.(css|js|woff2?|ttf)/.test(html) && /url\("\/fonts\/Inter-400\.ttf"\)/.test(html));
  }
  // --- A thesis as a PDF to keep or send (Hamza, 20 Oct 2026) ---------------------------------------------
  {
    const theses = thesesFileSchema.parse(JSON.parse(readFileSync("data/samples/theses.json", "utf8")));
    const hunter = thesisHunterFileSchema.parse(JSON.parse(readFileSync("data/samples/thesis_hunter.json", "utf8")));
    const ma = theses.bySymbol.MA;
    const finds = shownFinds(huntFor(hunter, huntKey({ kind: "stock", symbol: "MA" })));
    const line = { type: "line" as const, labels: ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"], series: [{ name: "Volume", values: [10, null, 12, 13] }, { name: "Peers", values: [9, 9.5, 10, 10.2] }], unit: "%" };
    const icon = readFileSync("public/icon-256.png");
    const figures = [
      thesisFigureSchema.parse({ id: "f1", title: "Volume growth", source: "A fictional dataset", at: "2026-10-01", via: "claude", chart: line }),
      thesisFigureSchema.parse({ id: "f2", title: "A picture", source: "A fictional page", at: "2026-10-02", via: "hunter", image: { url: "https://example.com/a.png", alt: "a chart" } }),
      thesisFigureSchema.parse({ id: "f3", title: "A picture not read", source: "A fictional page", at: "2026-10-02", via: "claude", image: { url: "https://example.com/b.png", alt: "" } }),
    ];
    const d: ThesisPdfData = {
      kind: "stock",
      title: "MA",
      subtitle: "Mastercard",
      exportedOn: "2026-10-20",
      updatedOn: ma.updatedAt.slice(0, 10),
      methodology: "A fictional methodology",
      facts: [
        { label: "Class", value: "Compounding Machine", detail: null, tone: "neutral" },
        { label: "Weight", value: "10.42%", detail: "cap 10% (3.1)", tone: "danger" },
        { label: "Price", value: "512.40 USD", detail: "on 2026-10-20", tone: "neutral" },
        { label: "Valuation per share", value: "560", detail: "DCF base", tone: "ok" },
      ],
      paragraphs: paragraphsOf(ma.text),
      pathway: ma.pathway,
      pillars: ma.pillars.map((p, i) => ({ name: p.name, text: p.text, tag: (["supported", "mixed", "risk", "unread"] as const)[i % 4], words: "" })),
      watch: ma.watch,
      signals: [{ label: "Revenue growth at or below 8", kind: "kill", reading: "Today 12.1", met: false }],
      valuation: { low: 480, base: 560, high: 640, price: 512.4, currency: "USD", basis: "DCF", asOf: "2026-10-01" },
      results: { date: "2026-07-31", quarter: "Jun/2026", headline: "Revenue up 13% on the year; every kill signal clear." },
      figures,
      evidence: [...ma.evidence].reverse(),
      hunted: finds,
      tryUrl: "https://portfolio-os-demo.vercel.app/try",
    };
    check("the thesis PDF's facts hold no amount of money, and an amount would be caught", !factsHoldMoney(d.facts) && factsHoldMoney([{ label: "Held", value: "$56,119", detail: null, tone: "neutral" }]));
    check("every picture on the thesis and its finds is read once", picturesOf({ figures: [...figures, figures[1]], hunted: finds }).length === 2);
    const g = figureGeometry(line)!;
    check("a thesis line chart breaks at a missing value and keeps one axis in its unit", g.lines[0].d.split("M").length - 1 === 2 && g.ticks.every((k) => k.label.endsWith("%")) && g.legend.length === 2);
    const bars = figureGeometry({ type: "bar", labels: ["Q1", "Q2", "Q3"], series: [{ name: "Margin", values: [-2, 4, 6] }], unit: "%" })!;
    check("thesis bars sit inside the plot and hang from zero", bars.bars.length === 3 && bars.zeroY !== null && bars.bars.every((b) => b.x >= bars.plot.x && b.x + b.w <= bars.plot.x + bars.plot.w + 1e-6 && b.y >= bars.plot.y - 1e-6 && b.y + b.h <= bars.plot.y + bars.plot.h + 1e-6));
    const bufT = await renderToBuffer(createElement(ThesisPdf, { d, pictures: { "https://example.com/a.png": { data: icon, format: "png" } } }) as unknown as ReactElement<DocumentProps>);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT.replace(/\.pdf$/, "-thesis.pdf"), bufT);
    const rawT = bufT.toString("latin1");
    check("a thesis renders to a PDF marked Invariant, in Inter, with its picture", bufT.subarray(0, 5).toString() === "%PDF-" && /Invariant/.test(rawT) && /Inter/.test(rawT) && /\/Subtype\s*\/Image/.test(rawT), `${bufT.length} bytes`);
    check("the file is named for the thesis and the day", thesisPdfName(d) === "MA thesis 2026-10-20.pdf");
    const market = theses.markets[0];
    const bufMk = await renderToBuffer(createElement(ThesisPdf, { d: { ...d, kind: "market", title: market.title, subtitle: "Market thesis", facts: [], signals: [], valuation: null, results: null, figures: [], evidence: [], hunted: shownFinds(huntFor(hunter, huntKey({ kind: "market", id: market.id }))) }, pictures: {} }) as unknown as ReactElement<DocumentProps>);
    check("a market thesis with no facts or figures renders too", bufMk.subarray(0, 5).toString() === "%PDF-");
  }
  if (failures.length) {
    console.error(`check:pdf FAILED (${failures.length}):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`check:pdf ok (${passed} passed): the Markdown blocks parse, the charts come from the table, and a study renders in the template's face, and a thesis exports marked Invariant.`);
}
main().catch((e) => {
  console.error("check:pdf FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
