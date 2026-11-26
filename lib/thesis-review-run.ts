import "server-only";

import { callChecked } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { pdfText } from "@/lib/pdf-text";
import { textLooksReadable } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import { EMPTY_THESES, marketThesisFor, thesesFileSchema, thesisFor } from "@/lib/theses";
import { ACCEPT, checkProposal, documentKind, EMPTY_PROPOSALS, isTextName, MAX_DOCUMENT_BYTES, parseReviewResponse, proposalKey, proposalsFileSchema, REVIEW_MODEL, reviewRequestBody, viewOf, withProposal, type MethodologyView, type Proposal, type Subject } from "@/lib/thesis-review";
import { localDay } from "@/lib/time";
import type { Vault } from "@/lib/vault";

/**
 * Add to thesis, the server half (lib/thesis-review.ts is the pure half):
 * reads the uploaded document on the person's own provider against the
 * thesis as kept and the methodology it lives under, checks what came back, and keeps the proposal pending in
 * the vault for the thesis page to show. The document is read once and never
 * kept; a failure is a sentence for the screen.
 */

export type Upload = { name: string; bytes: Uint8Array };

const isPdf = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/** The document as the model will read it: its text when it has one, else the PDF itself (Claude alone). */
async function readUpload(provider: ModelProvider, doc: Upload): Promise<{ text: string | null; pdf: Uint8Array | null; readFrom: "text" | "pdf" }> {
  if (doc.bytes.length > MAX_DOCUMENT_BYTES) throw new SyncError("Not read: the file is over 4 MB. Save the pages that matter, or print it to PDF without images.", "thesis upload size");
  if (isPdf(doc.bytes)) {
    const { text } = await pdfText(doc.bytes);
    if (text !== null && textLooksReadable(text)) return { text, pdf: null, readFrom: "text" };
    const cannot = providerCannot(provider, "pdf");
    if (cannot) throw new SyncError(`Not read: the PDF's text cannot be read (a scan or a watermark), and the PDF itself could not be read. Save the document as text.`, "thesis upload pdf on non-anthropic");
    return { text: null, pdf: doc.bytes, readFrom: "pdf" };
  }
  if (!isTextName(doc.name)) throw new SyncError(`Not read: it is not a PDF or a text file. Save it as PDF, text, Markdown, CSV or JSON (${ACCEPT.split(",").filter((x) => x.startsWith(".")).join(", ")}).`, "thesis upload type");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(doc.bytes).replace(/^﻿/, "");
  if (!text.trim()) throw new SyncError("Not read: the file is empty.", "thesis upload empty");
  return { text, pdf: null, readFrom: "text" };
}

/**
 * Reads one upload against one thesis and the methodology it lives under
 * (`methodologyView` in lib/thesis-review.ts, built by the caller from the
 * workspace; null when none is confirmed) and keeps the proposal pending. The
 * thesis is read from the vault as it stands, so the changes land on the
 * words the person sees; a stock with no thesis yet gets proposals that are
 * all additions.
 */
export async function proposeFromDocument(vault: Vault, provider: ModelProvider, subject: Subject, label: string, doc: Upload, now: Date, methodology: MethodologyView | null = null): Promise<Proposal> {
  const read = await readUpload(provider, doc);
  const theses = (await vault.readJson("theses", thesesFileSchema)) ?? EMPTY_THESES;
  const thesis = subject.kind === "stock" ? thesisFor(theses, subject.symbol) : marketThesisFor(theses, subject.id);
  if (subject.kind === "market" && !thesis) throw new SyncError("That market thesis is no longer on file.", "thesis upload market missing");
  const today = localDay(now);
  const body = reviewRequestBody({ document: { name: doc.name.slice(0, 160), text: read.text, pdf: read.pdf }, subject: { kind: subject.kind, label }, thesis: viewOf(thesis), methodology, today }, modelFor(provider, REVIEW_MODEL));
  // A reading that does not hold together is asked once more on the tier above (Hamza, 4 Nov 2026).
  const parsed = await callChecked(provider, body as ModelRequest, { agent: "reader", step: "thesis_doc", subject: subject.kind === "stock" ? subject.symbol : subject.id }, parseReviewResponse, (p) => p.ok);
  if (!parsed.ok) {
    console.error(`[theses] add to thesis: ${parsed.reason}`);
    throw new SyncError(parsed.called ? "Read, but what came back did not hold together, so nothing was proposed. Try again, or a clearer copy." : "The model answered in words instead of proposing changes. Try again.", "thesis upload parse");
  }
  const checked = checkProposal(parsed.read, viewOf(thesis), subject.kind, read.text);
  const proposal: Proposal = {
    key: proposalKey(subject),
    subject: subject.kind === "stock" ? { kind: "stock", symbol: subject.symbol.toUpperCase() } : { kind: "market", id: subject.id },
    at: now.toISOString(),
    document: { name: doc.name.slice(0, 160), bytes: doc.bytes.length, readFrom: read.readFrom },
    source: parsed.read.source,
    date: parsed.read.date,
    kind: parsed.read.kind === "data" || documentKind(doc.name) === "data" ? "data" : "document",
    summary: parsed.read.summary,
    changes: checked.changes,
    dropped: checked.dropped,
    unchecked: checked.unchecked,
    against: methodology?.name.slice(0, 80) ?? null,
  };
  const file = (await vault.readJson("thesis_proposals", proposalsFileSchema)) ?? EMPTY_PROPOSALS;
  await vault.writeJson("thesis_proposals", withProposal(file, proposal, now.toISOString()));
  return proposal;
}
