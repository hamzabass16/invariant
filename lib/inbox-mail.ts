import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { htmlToText } from "@/lib/earnings";

import { isPdfAttachment, parseHeaders, type Header } from "@/lib/inbox";
import { SyncError } from "@/lib/sync-error";

/**
 * The one file that reads the statements inbox (IMAP), and only reads it:
 * the mailbox is opened read-only, so nothing is flagged, moved or deleted
 * (the guard holds that). Set by the operator in Vercel: INBOX_ADDRESS, the
 * mailbox's own address, INBOX_PASSWORD (an app password, never the account
 * password), and for a mailbox that is not Gmail, INBOX_IMAP_HOST and
 * INBOX_IMAP_PORT. The address, the password and what the mail says never
 * reach a log line.
 */

export type InboxConfig = { address: string; password: string; host: string; port: number };

export function inboxConfig(): InboxConfig | null {
  const address = process.env.INBOX_ADDRESS?.trim();
  const password = process.env.INBOX_PASSWORD?.replace(/\s+/g, "");
  if (!address || !password || !/^[^@\s+]+@[^@\s]+$/.test(address)) return null;
  const port = Number(process.env.INBOX_IMAP_PORT || 993);
  return { address, password, host: process.env.INBOX_IMAP_HOST?.trim() || "imap.gmail.com", port: Number.isFinite(port) ? port : 993 };
}

export type InboxMessage = { uid: number; size: number; receivedAt: string; headers: Header[] };
export type InboxDocument = { name: string; bytes: Uint8Array };
export type InboxContent = { subject: string; pdfs: InboxDocument[] };
/** An email's words: the text part, else its HTML read as text, and the HTML itself (for the links a text part can leave out). */
export type InboxText = { subject: string; from: string; text: string; html: string; /** The email's own Date header (ISO instant), when it has one. */ date?: string | null };
export type InboxSession = {
  address: string;
  /** Every message of the last `days` days, headers only, listed once per session. */
  list(): Promise<InboxMessage[]>;
  /** One message's PDFs; other attachments and the text are not kept. */
  open(uid: number): Promise<InboxContent>;
  /** One message's words (a newsletter, Gmail's confirmation): its sender, subject, text and HTML; no attachment. */
  openText(uid: number): Promise<InboxText>;
  close(): Promise<void>;
};

const HEADERS = ["delivered-to", "x-forwarded-to", "to", "cc", "from", "subject", "message-id", "authentication-results", "date"];
/** A message larger than this is not opened: the largest statement PDF read is 4 MB. */
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const OPEN_FAILED = "The statements inbox could not be opened. The operator checks INBOX_ADDRESS and INBOX_PASSWORD; statements wait in the inbox until then.";

/** Opens the inbox read-only. Throws a SyncError with a sentence when it cannot. */
export async function openInbox(cfg: InboxConfig, days = 30): Promise<InboxSession> {
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.port === 993, auth: { user: cfg.address, pass: cfg.password }, logger: false, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000 });
  // An idle socket error after the run must not crash the function.
  client.on("error", () => undefined);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
  } catch (e) {
    client.close();
    throw new SyncError(OPEN_FAILED, `imap open: ${codeOf(e)}`);
  }
  let listed: InboxMessage[] | null = null;
  return {
    address: cfg.address,
    async list() {
      if (listed) return listed;
      try {
        const since = new Date(Date.now() - days * 86_400_000);
        const uids = await client.search({ since }, { uid: true });
        if (!uids || !uids.length) return (listed = []);
        const rows = await client.fetchAll(uids.slice(-500), { uid: true, size: true, internalDate: true, headers: HEADERS }, { uid: true });
        listed = rows.map((r) => ({ uid: r.uid, size: r.size ?? 0, receivedAt: new Date(r.internalDate ?? Date.now()).toISOString(), headers: parseHeaders(r.headers?.toString("utf8") ?? "") }));
        return listed;
      } catch (e) {
        throw new SyncError("The statements inbox could not be listed. Statements wait in the inbox until the next run.", `imap list: ${codeOf(e)}`);
      }
    },
    async open(uid) {
      const row = listed?.find((m) => m.uid === uid);
      if (row && row.size > MAX_MESSAGE_BYTES) return { subject: "", pdfs: [] };
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) throw new Error("no source");
        const parsed = await simpleParser(msg.source, { skipHtmlToText: true, skipTextToHtml: true, skipTextLinks: true });
        const pdfs = parsed.attachments.filter((a) => isPdfAttachment({ filename: a.filename ?? null, contentType: a.contentType })).map((a, i) => ({ name: (a.filename || `attachment-${i + 1}.pdf`).slice(0, 160), bytes: new Uint8Array(a.content) }));
        return { subject: parsed.subject ?? "", pdfs };
      } catch (e) {
        throw new SyncError("An email in the statements inbox could not be opened. It is tried again on the next run.", `imap fetch: ${codeOf(e)}`);
      }
    },
    async openText(uid) {
      const row = listed?.find((m) => m.uid === uid);
      if (row && row.size > MAX_MESSAGE_BYTES) return { subject: "", from: "", text: "", html: "" };
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) throw new Error("no source");
        const parsed = await simpleParser(msg.source, { skipTextToHtml: true, skipTextLinks: true, skipImageLinks: true });
        // mailparser reads HTML as text only for a single-part message; an HTML-only part inside a multipart is read here.
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const text = parsed.text?.trim() ? parsed.text : html ? htmlToText(html) : "";
        return { subject: parsed.subject ?? "", from: parsed.from?.text ?? "", text, html, date: parsed.date instanceof Date && Number.isFinite(parsed.date.getTime()) ? parsed.date.toISOString() : null };
      } catch (e) {
        throw new SyncError("A newsletter in the inbox could not be opened. It is tried again on the next run.", `imap fetch: ${codeOf(e)}`);
      }
    },
    async close() {
      await client.logout().catch(() => client.close());
    },
  };
}

/** A scrubbed reason for the log: an error code or class, never the server's text, which can echo the address. */
function codeOf(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; authenticationFailed?: unknown; name?: unknown };
    if (o.authenticationFailed) return "authentication failed";
    if (typeof o.code === "string") return o.code.slice(0, 40);
    if (typeof o.name === "string") return o.name.slice(0, 40);
  }
  return "failed";
}
