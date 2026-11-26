import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { ThesisPdf } from "@/components/theses/thesis-pdf";
import { publicPicture } from "@/lib/custom-data-run";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { deriveScreens } from "@/lib/screen-data";
import { capTone } from "@/lib/screens";
import { holdingFolder, marketReadings, marketThesisFor, paragraphsOf, pillarReadings, thesisFor } from "@/lib/theses";
import { huntFor, huntKey, shownFinds } from "@/lib/thesis-hunter";
import { picturesOf, type PdfPictures, type ThesisPdfData, type ThesisPdfFact } from "@/lib/thesis-pdf";
import { localDay } from "@/lib/time";
import { earningsFor, thesesFor, thesisHunterFor, type Workspace } from "@/lib/workspace";
import { demoBase } from "@/lib/deployment";

/**
 * A thesis's PDF (lib/thesis-pdf.ts plans it, components/theses/thesis-pdf.tsx
 * draws it): the same folder the thesis page reads, from the signed-in
 * person's own vault, and its pictures read once from their public addresses
 * (lib/custom-data-run.ts), none in the demo. No amount of money is put in it.
 */

/** Where a reader of a shared PDF can try the app: the public demo's tour. */
/** Where a reader can try the app: the deployment's demo (lib/deployment.ts), else none. */
const tryUrl = () => {
  const base = demoBase();
  return base ? `${base}/try` : null;
};
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** A stock thesis's PDF data; null when the symbol has neither a holding nor a thesis. */
export async function stockThesisPdf(ws: Workspace, symbol: string): Promise<ThesisPdfData | null> {
  const today = localDay();
  const [{ file }, earnings, hunter] = await Promise.all([thesesFor(ws), earningsFor(ws), thesisHunterFor(ws)]);
  const holding = ws.book?.holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
  const thesis = thesisFor(file, symbol);
  if (!holding && !thesis) return null;
  const setup = ws.setup;
  const data = ws.book && setup ? deriveScreens({ book: ws.book, methodology: setup.methodology, inputs: setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, today) : null;
  const w = data?.weights.find((x) => x.symbol === symbol) ?? null;
  const f = holdingFolder({ symbol, holding, thesis, earnings: earnings.file, studies: ws.research.studies, today });
  const price = holding?.price ?? null;
  const rec = f.record;
  const kills = f.signals.filter((s) => s.kind === "kill");
  const facts: ThesisPdfFact[] = [];
  if (ws.shown.classes && w?.classId) facts.push({ label: "Class", value: w.classLabel, detail: null, tone: "neutral" });
  if (w) facts.push({ label: "Weight", value: `${w.weight.toFixed(2)}%`, detail: w.cap ? `cap ${w.cap.cap}% (${w.cap.rule.section})` : "of the portfolio", tone: w.cap ? capTone(w.state) : "neutral" });
  if (price !== null && holding) facts.push({ label: "Price", value: `${n(price)} ${holding.currency}`, detail: `on ${today}`, tone: "neutral" });
  if (rec?.ownValuation) facts.push({ label: "Valuation per share", value: n(rec.ownValuation.base), detail: rec.ownValuation.basis ?? "base case", tone: price !== null ? (price > rec.ownValuation.base ? "warn" : "ok") : "neutral" });
  if (kills.length) facts.push({ label: "Kill signals", value: `${kills.filter((k) => k.met).length} of ${kills.length} met`, detail: null, tone: kills.some((k) => k.met) ? "danger" : "ok" });
  return {
    kind: "stock",
    title: symbol,
    subtitle: holding?.name ?? f.name ?? (f.held ? "Holding" : "Watchlist"),
    exportedOn: today,
    updatedOn: thesis?.updatedAt.slice(0, 10) ?? null,
    methodology: setup?.methodology?.name ?? null,
    facts: facts.slice(0, 4),
    paragraphs: paragraphsOf(thesis?.text),
    pathway: thesis?.pathway ?? null,
    pillars: f.pillars.map((p) => ({ name: p.pillar.name, text: p.pillar.text, tag: p.tag, words: p.words })),
    watch: thesis?.watch ?? [],
    signals: f.signals.map((s) => ({ label: s.label, kind: s.kind, reading: `${s.reading === null ? "No reading today" : `Today ${n(s.reading)}`}${s.note ? ` · ${s.note}` : ""}`, met: s.met })),
    valuation: rec?.ownValuation ? { low: rec.ownValuation.low, base: rec.ownValuation.base, high: rec.ownValuation.high, price, currency: holding?.currency ?? f.latest?.currency ?? "", basis: rec.ownValuation.basis, asOf: rec.ownValuation.asOf } : null,
    results: f.latest ? { date: f.latest.date, quarter: f.latest.quarter, headline: f.latest.headline } : null,
    figures: thesis?.figures ?? [],
    evidence: [...(thesis?.evidence ?? [])].reverse(),
    hunted: shownFinds(huntFor(hunter.file, huntKey({ kind: "stock", symbol }))),
    tryUrl: tryUrl(),
  };
}

/** A market thesis's PDF data; null when it is not on file. */
export async function marketThesisPdf(ws: Workspace, id: string): Promise<ThesisPdfData | null> {
  const today = localDay();
  const [{ file }, hunter] = await Promise.all([thesesFor(ws), thesisHunterFor(ws)]);
  const m = marketThesisFor(file, id);
  if (!m) return null;
  const pillars = pillarReadings(m.pillars, marketReadings(ws.book?.markets?.rows ?? []));
  return {
    kind: "market",
    title: m.title,
    subtitle: "Market thesis",
    exportedOn: today,
    updatedOn: m.updatedAt.slice(0, 10),
    methodology: ws.setup?.methodology?.name ?? null,
    facts: [],
    paragraphs: paragraphsOf(m.text),
    pathway: null,
    pillars: pillars.map((p) => ({ name: p.pillar.name, text: p.pillar.text, tag: p.tag, words: p.words })),
    watch: m.watch,
    signals: [],
    valuation: null,
    results: null,
    figures: m.figures,
    evidence: [...m.evidence].reverse(),
    hunted: shownFinds(huntFor(hunter.file, huntKey({ kind: "market", id: m.id }))),
    tryUrl: tryUrl(),
  };
}

/** The PDF itself; the pictures are read in parallel, none in the demo, and one that cannot be read is named with its page. */
export async function renderThesisPdf(d: ThesisPdfData, demo: boolean): Promise<Uint8Array> {
  registerPdfFonts();
  const pictures: PdfPictures = {};
  if (!demo) {
    const urls = picturesOf(d).slice(0, 16);
    const got = await Promise.all(urls.map((u) => publicPicture(u)));
    urls.forEach((u, i) => {
      if (got[i]) pictures[u] = got[i]!;
    });
  }
  const buf = await renderToBuffer(createElement(ThesisPdf, { d, pictures }) as unknown as ReactElement<DocumentProps>);
  return new Uint8Array(buf);
}

/** The response that downloads it. */
export function pdfResponse(pdf: Uint8Array, name: string): Response {
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
}
