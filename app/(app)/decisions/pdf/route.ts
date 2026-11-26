import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { JournalPdf, type JournalPdfData } from "@/components/decisions/journal-pdf";
import { DECISION_LABEL, outcomeWords, sortedDecisions } from "@/lib/decisions";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { journalFingerprint, type JournalEntry } from "@/lib/receipts";
import { maskMoney } from "@/lib/stealth";
import { pdfResponse } from "@/lib/thesis-pdf-run";
import { localDay } from "@/lib/time";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The decision journal as a PDF (Hamza, 9 Nov 2026, the twenty more ways):
 * every Decision Log entry, oldest first, each amount masked, its words'
 * fingerprint sealed in the registry like a thesis's (lib/receipts.ts), so
 * the journal can be shown later to have existed, unchanged, by that day.
 * The demo seals nothing.
 */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  if (!ws.setup || !ws.modules.includes("overview")) return new Response("Not found", { status: 404 });
  const entries: JournalEntry[] = sortedDecisions(ws.decisions)
    .reverse()
    .map((d) => ({ date: d.date, kind: DECISION_LABEL[d.kind], symbol: d.symbol, title: maskMoney(d.title), text: maskMoney(d.text), outcome: d.action ? outcomeWords(d.action) : null }));
  const fingerprint = journalFingerprint(entries);
  let sealedAt: string | null = null;
  if (ws.mode !== "demo") {
    try {
      const { registryAvailable, sealReceipts } = await import("@/lib/registry");
      if (registryAvailable()) sealedAt = (await sealReceipts([fingerprint])).get(fingerprint) ?? null;
    } catch {
      sealedAt = null;
    }
  }
  const today = localDay();
  const d: JournalPdfData = {
    title: "Decision journal",
    methodology: ws.setup.methodology?.name ?? null,
    exportedOn: today,
    entries,
    fingerprint,
    sealedAt,
    checkUrl: sealedAt ? `${new URL(req.url).origin}/receipt/${fingerprint}` : null,
  };
  registerPdfFonts();
  const buf = await renderToBuffer(createElement(JournalPdf, { d }) as unknown as ReactElement<DocumentProps>);
  return pdfResponse(new Uint8Array(buf), `Decision journal ${today}.pdf`);
}
