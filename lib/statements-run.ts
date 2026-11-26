import "server-only";

import { createHash } from "node:crypto";

import { callChecked } from "@/lib/methodology-draft";
import { modelFor, providerCannot, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { pdfText } from "@/lib/pdf-text";
import { EMPTY_STATEMENTS, judge, keepDocument, keepMessages, MAX_PDF_BYTES, parseStatementResponse, readAgain, STATEMENT_MAX_TRIES, STATEMENT_MODEL, statementRequestBody, statementsFileSchema, textLooksReadable, triesAfter, type StatementDoc, type StatementsFile } from "@/lib/statements";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/**
 * Reads one statement or fund report on the person's own provider and keeps
 * what it said in their vault (lib/statements.ts says how it is checked). A
 * PDF with a readable text layer is sent as text, so any provider can read
 * it and every figure can be checked against it; one without (a scan, a
 * watermark) is sent as the PDF itself, which only Claude can read, and
 * waits for the person's look. The same PDF is read once: a second upload
 * returns the entry already kept, unless that read failed. Several arrive
 * together (an upload of a few, a morning's emails) and are read side by side,
 * then kept in one write so none overwrites another.
 *
 * Every outcome is an entry with a sentence, a failure included, so the
 * Statements screen never looks as if nothing arrived.
 */
/** A document to read; `message` is the inbox email it came in, so the email is marked read only once all of its documents are. */
export type IncomingDocument = { name: string; bytes: Uint8Array; via: StatementDoc["via"]; message?: string };

/**
 * Reads several documents side by side and keeps them in one write; returns
 * each one's entry in the order given. `notes` are entries made without a
 * read (an email with no PDF, one set aside unread), each with its email;
 * an email is marked read to the end unless one of its documents failed in
 * a way a later run can mend (no key yet, the model's error), so the next
 * morning tries it again.
 */
export async function readStatements(vault: Vault, provider: ModelProvider | null, docs: IncomingDocument[], now: Date, notes: { entry: StatementDoc; message: string }[] = []): Promise<StatementDoc[]> {
  const prev = (await vault.readJson("statements", statementsFileSchema)) ?? EMPTY_STATEMENTS;
  const reads = await Promise.all(docs.map((d) => readOne(provider, d, prev, now)));
  const entries = reads.map((r) => r.entry);
  let file = prev;
  for (const e of [...notes.map((n) => n.entry), ...entries].reverse()) if (!prev.documents.includes(e)) file = keepDocument(file, e, now.toISOString());
  const retry = new Set(docs.filter((d, i) => d.message && !reads[i].final).map((d) => d.message!));
  const done = [...new Set([...notes.map((n) => n.message), ...docs.flatMap((d) => (d.message ? [d.message] : []))])].filter((m) => !retry.has(m));
  file = keepMessages(file, done, now.toISOString());
  if (file !== prev) await vault.writeJson("statements", file);
  if (entries.some((e) => e.status === "applied")) await (await import("@/lib/beta-run")).recordEvent(vault.owner, "statement_read");
  return entries;
}

/** Reads one document. `final` is false for a failure a later run can mend, until it has failed STATEMENT_MAX_TRIES times. */
async function readOne(provider: ModelProvider | null, doc: IncomingDocument, prev: StatementsFile, now: Date): Promise<{ entry: StatementDoc; final: boolean }> {
  const entry = await readEntry(provider, doc, prev, now);
  return { entry, final: !readAgain(entry) };
}

async function readEntry(provider: ModelProvider | null, doc: IncomingDocument, prev: StatementsFile, now: Date): Promise<StatementDoc> {
  const at = now.toISOString();
  const id = createHash("sha256").update(doc.bytes).digest("hex").slice(0, 16);
  const base = { id, name: doc.name.slice(0, 160), receivedAt: at, via: doc.via };
  const failedAs = (sentence: string, readFrom: StatementDoc["readFrom"], tries?: number): StatementDoc => ({ ...base, status: "failed", sentence: sentence.slice(0, 600), readFrom, extraction: null, unchecked: [], confirmedAt: null, ...(tries === undefined ? {} : { tries }) });
  if (doc.bytes.length > MAX_PDF_BYTES) return failedAs("Not read: the PDF is over 4 MB. Ask for it without images, or print it to PDF again.", null);
  if (!isPdf(doc.bytes)) return failedAs("Not read: it is not a PDF. Statements and fund reports are read as PDFs.", null);
  const known = prev.documents.find((d) => d.id === id);
  if (known && known.status !== "failed") return known;
  // A failure a later run can mend counts as a try; the last of the morning's says so, and how to try once more.
  const tries = triesAfter(known);
  const last = doc.via === "inbox" && tries >= STATEMENT_MAX_TRIES ? ` Not read after ${tries} tries, so it is not read again by itself; upload it to try once more.` : "";
  const failed = (sentence: string, readFrom: StatementDoc["readFrom"] = null): StatementDoc => failedAs(`${sentence}${last}`, readFrom, tries);
  // No model set up calls nothing, so it is not counted as a try.
  if (!provider) return failedAs("Not read: the AI is not set up on this deployment yet.", null, tries - 1);

  const { text } = await pdfText(doc.bytes);
  const readable = text !== null && textLooksReadable(text);
  const cannot = readable ? null : providerCannot(provider, "pdf");
  if (cannot) return failed(`Not read: its text layer cannot be read (a scan or a watermark), and the PDF itself could not be read. Ask for a text PDF.`, "pdf");
  const readFrom = readable ? "text" : "pdf";
  try {
    const body = statementRequestBody({ name: base.name, text: readable ? text : null, pdf: readable ? null : doc.bytes }, modelFor(provider, process.env.ANTHROPIC_STATEMENT_MODEL || STATEMENT_MODEL));
    // A reading that does not hold together is asked once more on the tier above (Hamza, 4 Nov 2026).
    const parsed = await callChecked(provider, body as ModelRequest, { agent: "reader", step: "statement", subject: "statement" }, parseStatementResponse, (p) => p.ok);
    if (!parsed.ok) {
      console.error(`[statements] ${parsed.reason}`);
      return failed(parsed.called ? "Read, but what came back did not hold together, so nothing was added. Send it again, or a clearer copy." : "The model answered in words instead of recording the document. Send it again.", readFrom);
    }
    return judge({ ...base, readFrom }, parsed.extraction, readable ? text : null);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[statements] ${e.logDetail ?? "read failed"}`);
    return failed(`Not read: ${e.message}`, readFrom);
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}
