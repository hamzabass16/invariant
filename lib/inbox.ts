import { z } from "zod";

/**
 * The statements inbox, read as data: which person an email is for, whether
 * it really came from them, and Gmail's forwarding confirmation code. Pure;
 * lib/inbox-mail.ts reads the mailbox and lib/inbox-run.ts reads what it
 * finds into each person's vault.
 *
 * One mailbox serves the deployment (INBOX_ADDRESS). Each person forwards to
 * its local part plus a tag (statements+1a2b3c4d@...), a short hash of their
 * sign-in, so the address names nobody. Anyone can write to an address, so a
 * tag alone never decides what is read: the mail must have been sent or
 * forwarded by the person's own account, which the receiving server records
 * in its own Authentication-Results line (SPF passed for an envelope sender
 * that is their address; Gmail's automatic forwarding sends as
 * them+caf_=...@gmail.com). Anything else is set aside unread.
 */

export type Header = { name: string; value: string };

/** A raw header block (RFC 5322) as name and value pairs in their order, top first; folded lines are unfolded. */
export function parseHeaders(raw: string): Header[] {
  const out: Header[] = [];
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && out.length) {
      out[out.length - 1].value += ` ${line.trim()}`;
      continue;
    }
    const i = line.indexOf(":");
    if (i <= 0) continue;
    out.push({ name: line.slice(0, i).trim().toLowerCase(), value: line.slice(i + 1).trim() });
  }
  return out;
}

/** Every value of one header, top first. */
export function headerValues(headers: Header[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((h) => h.name === n).map((h) => h.value);
}

/** The email addresses in a header value, lower-cased: "Name <a@b.com>, c@d.com" gives both. */
export function addressesIn(value: string): string[] {
  return (value.match(/[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[^\s<>,;:"'()[\]]+/g) ?? []).map((a) => a.toLowerCase().replace(/\.$/, ""));
}

/** An address as one mailbox: a +suffix dropped, and for Gmail the dots too, which Gmail ignores. */
export function baseAddress(address: string): string {
  const [local, domain] = address.toLowerCase().split("@");
  if (!local || !domain) return address.toLowerCase();
  let l = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") l = l.replace(/\./g, "");
  return `${l}@${domain === "googlemail.com" ? "gmail.com" : domain}`;
}

/** The tag an address carries for this inbox: "statements+1a2b3c4d@x.com" for inbox "statements@x.com" gives "1a2b3c4d". */
export function tagOf(address: string, inbox: string): string | null {
  const [local, domain] = inbox.toLowerCase().split("@");
  const m = address.toLowerCase().match(/^([^@+]+)\+([0-9a-f]{8})@(.+)$/);
  if (!m || !local || !domain) return null;
  const same = domain === "gmail.com" || domain === "googlemail.com" ? m[1].replace(/\./g, "") === local.replace(/\./g, "") : m[1] === local;
  return same && (m[3] === domain || (domain === "gmail.com" && m[3] === "googlemail.com")) ? m[2] : null;
}

/** The tag a newsletters address carries: "statements+1a2b3c4d-news@x.com" for inbox "statements@x.com" gives "1a2b3c4d". */
export function newsTagOf(address: string, inbox: string): string | null {
  const m = address.toLowerCase().match(/^([^@+]+)\+([0-9a-f]{8})-news@(.+)$/);
  return m ? tagOf(`${m[1]}+${m[2]}@${m[3]}`, inbox) : null;
}

function firstTag(headers: Header[], read: (address: string) => string | null): string | null {
  for (const name of ["delivered-to", "x-forwarded-to", "to", "cc"]) {
    for (const v of headerValues(headers, name)) {
      for (const a of addressesIn(v)) {
        const t = read(a);
        if (t) return t;
      }
    }
  }
  return null;
}

/** The person a statements email is for: the tag on the address it was delivered to, else on any address it was sent to. */
export function messageTag(headers: Header[], inbox: string): string | null {
  return firstTag(headers, (a) => tagOf(a, inbox));
}

/** The person a newsletter is for: the tag on their newsletters address (lib/newsletters.ts). */
export function newsletterTag(headers: Header[], inbox: string): string | null {
  return firstTag(headers, (a) => newsTagOf(a, inbox));
}

/** The receiving server's own verdicts: the topmost Authentication-Results line, which a sender cannot write above. */
function receivedVerdict(headers: Header[]): { spfFrom: string | null; dkimDomains: string[] } {
  const top = headerValues(headers, "authentication-results")[0] ?? "";
  const spf = top.match(/\bspf=pass\b[^;]*?smtp\.mailfrom=("?)([^\s;"]+)\1/i);
  const dkimDomains = [...top.matchAll(/\bdkim=pass\b[^;]*?header\.(?:i|d)=@?([^\s;]+)/gi)].map((m) => m[1].toLowerCase());
  return { spfFrom: spf ? spf[2].toLowerCase() : null, dkimDomains };
}

/**
 * True when the person's own account sent or forwarded the email: the
 * receiving server passed SPF for an envelope sender that is their address
 * (Gmail forwards as them+caf_=...@gmail.com, which is them).
 */
export function sentByOwner(headers: Header[], ownerEmail: string): boolean {
  const { spfFrom } = receivedVerdict(headers);
  if (!spfFrom || !spfFrom.includes("@")) return false;
  return baseAddress(spfFrom) === baseAddress(ownerEmail.trim());
}

/**
 * The From address the receiving server itself proved: DMARC passed for the
 * From domain, or DKIM for it, or SPF for an envelope sender in it (a
 * subdomain either way). Null when the sender is not proven, whatever the
 * From line claims.
 */
export function authenticatedFrom(headers: Header[]): string | null {
  const from = headerValues(headers, "from").flatMap(addressesIn)[0];
  const domain = from?.split("@")[1];
  if (!from || !domain) return null;
  const top = headerValues(headers, "authentication-results")[0] ?? "";
  const dmarc = top.match(/\bdmarc=pass\b[^;]*?header\.from=("?)([^\s;"]+)\1/i)?.[2]?.toLowerCase() ?? null;
  const { spfFrom, dkimDomains } = receivedVerdict(headers);
  const inDomain = (d: string | null | undefined) => !!d && (d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`));
  if (inDomain(dmarc) || dkimDomains.some(inDomain) || (spfFrom !== null && inDomain(spfFrom.split("@")[1]))) return from;
  return null;
}

/**
 * The recap newsletter the app's own inbox subscribes to (Hamza, 18 Oct
 * 2026): sent to the inbox itself, not to anyone's tagged address (a
 * person's own forward of the same newsletter carries their tag and stays
 * theirs), from one of the known recap senders, proven by the receiving
 * server. The sender's address, else null.
 */
export function sharedRecapSender(headers: Header[], inbox: string, senders: readonly string[]): string | null {
  if (messageTag(headers, inbox) || newsletterTag(headers, inbox)) return null;
  const from = authenticatedFrom(headers);
  if (!from) return null;
  return senders.some((s) => s.toLowerCase() === from) ? from : null;
}

/**
 * A recap newsletter the person subscribed with their own newsletters
 * address (Hamza, 20 Oct 2026): sent to their tag by one of the known recap
 * senders, proven by the receiving server. It came to them alone, so it is
 * read as theirs though they did not forward it. The sender, else null.
 */
export function subscribedRecapSender(headers: Header[], senders: readonly string[]): string | null {
  const from = authenticatedFrom(headers);
  if (!from) return null;
  return senders.some((s) => s.toLowerCase() === from) ? from : null;
}

export type ForwardingCode = { code: string | null; forAddress: string; receivedAt: string };

/**
 * Gmail's forwarding confirmation, when it asks this person's tag to accept
 * their mail: sent by Google (SPF or DKIM passed for google.com), for the
 * person's own address. Gmail puts a code in the subject on some accounts
 * and only a link in the text on others (Hamza's, 17 Oct 2026), so the
 * confirmation is known by its subject and the code may be missing; the
 * link is read from the text or the HTML with `forwardingLinks`.
 */
export function forwardingCode(headers: Header[], ownerEmail: string, receivedAt: string): ForwardingCode | null {
  const from = headerValues(headers, "from").flatMap(addressesIn);
  if (!from.some((a) => a === "forwarding-noreply@google.com")) return null;
  const { spfFrom, dkimDomains } = receivedVerdict(headers);
  const google = (spfFrom !== null && /@(?:[a-z0-9-]+\.)*google\.com$/.test(spfFrom)) || dkimDomains.some((d) => d === "google.com" || d.endsWith(".google.com") || d === "accounts.google.com");
  if (!google) return null;
  const subject = headerValues(headers, "subject")[0] ?? "";
  if (!/forwarding confirmation/i.test(subject)) return null;
  const code = subject.match(/\(#\s*(\d{6,12})\)/)?.[1] ?? null;
  const forAddress = addressesIn(subject.split(/receive mail from/i)[1] ?? "")[0];
  if (!forAddress || baseAddress(forAddress) !== baseAddress(ownerEmail.trim())) return null;
  return { code, forAddress, receivedAt };
}

/**
 * Gmail's confirmation link: on mail.google.com (Hamza's of 18 Oct 2026) or
 * mail-settings.google.com (older ones), its last path segment starting with
 * `vf-`. The cancel link's segment starts with `uf-`, so it never matches,
 * whatever its token holds.
 */
const CONFIRM_LINK = /https?:\/\/mail(?:-settings)?\.google\.com\/(?:[\w.-]+\/)*vf-[^\s<>"')\]]+/;

/** Whether a link is Gmail's confirmation link and nothing else: the only link the app ever opens. */
export function isForwardingConfirmLink(link: string): boolean {
  return new RegExp(`^${CONFIRM_LINK.source}$`).test(link);
}

function decodeHref(href: string): string {
  return href.replace(/&amp;/g, "&").replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** The confirmation link (never the cancel link) and any code printed in the confirmation: from its text, its HTML links, or the HTML itself. */
export function forwardingLinks(text: string, html = ""): { confirm: string | null; code: string | null } {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => decodeHref(m[1]));
  const confirm = [text, ...hrefs, html].join("\n").match(CONFIRM_LINK)?.[0] ?? null;
  const code = `${text}\n${html}`.match(/confirmation code\D{0,24}(\d{6,12})/i)?.[1] ?? null;
  return { confirm, code };
}


/** What Google's confirmation page says: confirmed, a link no longer valid, a form to submit, or nothing the app knows. */
export type ConfirmPage = { state: "confirmed" | "invalid" | "form" | "unknown"; form: { action: string; fields: Record<string, string> } | null };

/**
 * Reads Google's confirmation page. "Confirmation Success" and its kin mean
 * the forwarding is confirmed; a page with a form whose button says Confirm
 * (or Verify) asks for a click, and its action and hidden fields are
 * returned so the app can make that click itself; anything else is unknown,
 * never confirmed (Hamza, 18 Oct 2026: a page Google answered without
 * confirming was shown as confirmed).
 */
export function readConfirmPage(html: string, base: string): ConfirmPage {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/confirmation success|has been (confirmed|verified)|is now (confirmed|verified)|may now (automatically )?forward|already (been )?(confirmed|verified)|already verified/i.test(text)) return { state: "confirmed", form: null };
  if (/no longer valid|has expired|not valid|invalid request|link is invalid/i.test(text)) return { state: "invalid", form: null };
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1];
    const body = m[2];
    const button = /<(?:button|input)\b[^>]*(?:type\s*=\s*["']?submit["']?)?[^>]*>/gi;
    const submits = [...body.matchAll(button)].map((b) => b[0]);
    const label = submits.map((b) => `${attrOf(b, "value") ?? ""} ${b.replace(/<[^>]+>/g, " ")}`).join(" ") + " " + body.replace(/<[^>]+>/g, " ");
    if (!/confirm|verify/i.test(label)) continue;
    const method = (attrOf(attrs, "method") ?? "get").toLowerCase();
    if (method !== "post") continue;
    const action = resolveUrl(attrOf(attrs, "action") ?? "", base);
    if (!action) continue;
    const fields: Record<string, string> = {};
    for (const i of body.matchAll(/<input\b[^>]*>/gi)) {
      const type = (attrOf(i[0], "type") ?? "text").toLowerCase();
      const name = attrOf(i[0], "name");
      if (!name || type === "submit" || type === "button" || type === "checkbox" || type === "radio") continue;
      fields[name] = attrOf(i[0], "value") ?? "";
    }
    return { state: "form", form: { action, fields } };
  }
  return { state: "unknown", form: null };
}

function attrOf(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return decodeHref(m[1] ?? m[2] ?? m[3] ?? "");
}

function resolveUrl(action: string, base: string): string | null {
  try {
    const u = new URL(action, base);
    return /^https:$/.test(u.protocol) && /(^|\.)google\.com$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Whether an attachment is a PDF worth reading: by its type, or by its name when a mailer calls every file octet-stream. */
export function isPdfAttachment(a: { filename: string | null; contentType: string }): boolean {
  const type = a.contentType.toLowerCase();
  if (type === "application/pdf" || type === "application/x-pdf") return true;
  return (type === "application/octet-stream" || type === "binary/octet-stream") && /\.pdf$/i.test(a.filename ?? "");
}

/** The sentence for an email the person sent that carried no PDF: often a bank's "your statement is ready". */
export function noPdfSentence(subject: string): string {
  return `An email ("${subject.slice(0, 80) || "no subject"}") arrived without a PDF, so there was nothing to read. If it says a statement is ready, download it from the bank and send or upload the PDF.`;
}

export const NOT_OWNER_SENTENCE = "Set aside unread: it was not sent or forwarded from your own email account, so nothing in it was read. Forward statements from the account you sign in with.";

/** One line for the sync status: what the inbox gave this morning. */
export function inboxSentence(r: { emails: number; read: number; inUse: number; waiting: number; failed: number; setAside: number }): string {
  if (!r.emails) return "No new statements.";
  const parts = [`${r.inUse} in use`, r.waiting ? `${r.waiting} waiting for you on Statements` : null, r.failed ? `${r.failed} not read` : null, r.setAside ? `${r.setAside} set aside` : null].filter(Boolean);
  return `${r.emails} new email${r.emails === 1 ? "" : "s"}, ${r.read} document${r.read === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// The confirmations the app made, kept

/** Which of the person's two addresses a forwarding request or a newsletter was for. */
export const FORWARDING_KINDS = ["statements", "newsletters"] as const;
export type ForwardingKind = (typeof FORWARDING_KINDS)[number];

/** The kind of a message delivered to one of the person's addresses: its newsletters tag first, else its statements tag; null when it is for neither. */
export function forwardingKindOf(headers: Header[], inbox: string, tag: string): ForwardingKind | null {
  if (newsletterTag(headers, inbox) === tag) return "newsletters";
  if (messageTag(headers, inbox) === tag) return "statements";
  return null;
}

const confirmationSchema = z.object({
  kind: z.enum(FORWARDING_KINDS),
  /** The person's own address, as Gmail's request named it. */
  forAddress: z.string().max(200),
  /** When Gmail's request came. A newer request for the same kind replaces this record. */
  requestedAt: z.string(),
  /** When Google agreed, and how: the app pressed Google's Confirm, or Google reported the address verified already. */
  confirmedAt: z.string(),
  how: z.enum(["pressed", "already"]),
});
export type Confirmation = z.infer<typeof confirmationSchema>;

/** The vault's `forwarding` file: one confirmation per kind, the latest. Never a link, a code or a token. */
export const forwardingFileSchema = z.object({ version: z.literal(1), confirmations: z.array(confirmationSchema).max(4), updated: z.string() });
export type ForwardingFile = z.infer<typeof forwardingFileSchema>;
export const EMPTY_FORWARDING: ForwardingFile = { version: 1, confirmations: [], updated: "" };

/** The file with this confirmation in place of the kind's earlier one. */
export function recordConfirmation(file: ForwardingFile, c: Confirmation): ForwardingFile {
  return { version: 1, confirmations: [...file.confirmations.filter((x) => x.kind !== c.kind), c], updated: c.confirmedAt };
}

/** The kept confirmation for one kind, if any. */
export function confirmationOf(file: ForwardingFile | null, kind: ForwardingKind): Confirmation | null {
  return file?.confirmations.find((c) => c.kind === kind) ?? null;
}

/** True when the kept confirmation is of this very request, so the link is not opened again. */
export function alreadyConfirmed(kept: Confirmation | null, requestedAt: string): boolean {
  return kept !== null && kept.requestedAt === requestedAt;
}
