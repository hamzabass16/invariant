import "server-only";

import { createHash } from "node:crypto";

import { providerFor } from "@/lib/hosted-model";
import { addressesIn, alreadyConfirmed, baseAddress, confirmationOf, EMPTY_FORWARDING, FORWARDING_KINDS, forwardingCode, forwardingFileSchema, forwardingKindOf, forwardingLinks, headerValues, inboxSentence, isForwardingConfirmLink, messageTag, newsletterTag, noPdfSentence, NOT_OWNER_SENTENCE, readConfirmPage, recordConfirmation, sentByOwner, sharedRecapSender, subscribedRecapSender, type Confirmation, type ForwardingCode, type ForwardingFile, type ForwardingKind, type Header } from "@/lib/inbox";
import type { InboxSession } from "@/lib/inbox-mail";
import { inboxTag } from "@/lib/inbox-tag";
import { bookSchema } from "@/lib/holdings";
import { callChecked } from "@/lib/methodology-draft";
import { modelFor, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import { type Digest, EMPTY_NEWSLETTERS, EMPTY_SENDERS, issuesToLay, keepDigests, NEWSLETTER_MODEL, NEWSLETTER_NO_AI, NEWSLETTER_NOT_OWNER, type NewsletterInput, type NewsletterReading, newsletterDated, newsletterImages, newsletterRequestBody, newsletterSendersSchema, type NewslettersFile, newslettersFileSchema, newslettersSentence, newsletterText, parseNewsletterResponse, type ProposedSender, proposeSenders, readKeys, redateDigest, senderOf, type SharedIssue, sharedDigest, undatedDigests, withoutSharedTwins, withTries } from "@/lib/newsletters";
import { newsSubjects } from "@/lib/report";
import { RECAP_NEWSLETTERS } from "@/lib/market-recap";
import { readStatements, type IncomingDocument } from "@/lib/statements-run";
import { SyncError } from "@/lib/sync-error";
import { EMPTY_STATEMENTS, statementsFileSchema, type StatementDoc } from "@/lib/statements";
import type { Vault } from "@/lib/vault";

/**
 * Reads one person's new emails from the statements inbox into their vault:
 * the emails tagged for them, sent or forwarded by their own account, whose
 * PDFs are read with the AI (lib/statements-run.ts). An email read
 * to the end is remembered by a hash of its Message-ID and never opened
 * again; the mailbox itself is never changed.
 */

/** At most this many new emails per person per run, oldest first, so one run stays inside the function's time. */
const PER_RUN = 12;

export type InboxRun = { emails: number; read: number; inUse: number; waiting: number; failed: number; setAside: number; sentence: string };

/** Reads the person's new emails; null when the inbox holds nothing for them. */
export async function readInboxInto(vault: Vault, email: string, session: InboxSession, now: Date): Promise<InboxRun | null> {
  const tag = inboxTag(email);
  const mine = (await session.list()).filter((m) => messageTag(m.headers, session.address) === tag && !forwardingCode(m.headers, email, m.receivedAt));
  if (!mine.length) return null;
  const file = (await vault.readJson("statements", statementsFileSchema)) ?? EMPTY_STATEMENTS;
  const seen = new Set(file.messages);
  const fresh = mine
    .map((m) => ({ m, key: messageKey(m.headers, m.uid, m.receivedAt) }))
    .filter((x) => !seen.has(x.key))
    .sort((a, b) => a.m.receivedAt.localeCompare(b.m.receivedAt))
    .slice(0, PER_RUN);
  if (!fresh.length) return { emails: 0, read: 0, inUse: 0, waiting: 0, failed: 0, setAside: 0, sentence: inboxSentence({ emails: 0, read: 0, inUse: 0, waiting: 0, failed: 0, setAside: 0 }) };

  const docs: IncomingDocument[] = [];
  const notes: { entry: StatementDoc; message: string }[] = [];
  const at = now.toISOString();
  const note = (key: string, name: string, sentence: string): { entry: StatementDoc; message: string } => ({
    message: key,
    entry: { id: createHash("sha256").update(`note:${key}`).digest("hex").slice(0, 16), name: name.slice(0, 160) || "An email", receivedAt: at, via: "inbox", status: "ignored", sentence, readFrom: null, extraction: null, unchecked: [], confirmedAt: null },
  });
  for (const { m, key } of fresh) {
    const subject = m.headers.find((h) => h.name === "subject")?.value ?? "";
    if (!sentByOwner(m.headers, email)) {
      notes.push(note(key, subject, NOT_OWNER_SENTENCE));
      continue;
    }
    const content = await session.open(m.uid);
    if (!content.pdfs.length) notes.push(note(key, content.subject || subject, noPdfSentence(content.subject || subject)));
    for (const p of content.pdfs) docs.push({ name: p.name, bytes: p.bytes, via: "inbox", message: key });
  }
  const provider = docs.length ? await providerFor(vault) : null;
  const entries = await readStatements(vault, provider, docs, now, notes);
  const count = (s: StatementDoc["status"]) => entries.filter((e) => e.status === s).length;
  const r = { emails: fresh.length, read: docs.length, inUse: count("applied"), waiting: count("review"), failed: count("failed"), setAside: count("ignored") + notes.length };
  return { ...r, sentence: inboxSentence(r) };
}

/** At most this many new newsletters per person per run, newest first, read four at a time. */
const NEWS_PER_RUN = 20;

export type NewslettersRun = { emails: number; read: number; failed: number; setAside: number; sentence: string };

/**
 * Reads the person's new newsletters (forwarded to their newsletters
 * address) into a short digest each, with the AI, as text. Only
 * the digest is kept; a read that fails keeps a sentence and is tried again
 * on the next run; a newsletter their own account did not forward is set
 * aside unread. Null when the inbox holds none for them.
 */
export async function readNewslettersInto(vault: Vault, email: string, session: InboxSession, now: Date): Promise<NewslettersRun | null> {
  const tag = inboxTag(email);
  const mine = (await session.list()).filter((m) => newsletterTag(m.headers, session.address) === tag && !forwardingCode(m.headers, email, m.receivedAt));
  if (!mine.length) return null;
  let file = (await vault.readJson("newsletters", newslettersFileSchema)) ?? EMPTY_NEWSLETTERS;
  const keyed = mine.map((m) => ({ m, key: messageKey(m.headers, m.uid, m.receivedAt) }));
  file = await redateInto(vault, file, session, keyed, now);
  const settled = readKeys(file, now);
  const fresh = keyed
    .filter((x) => !settled.has(x.key))
    .sort((a, b) => b.m.receivedAt.localeCompare(a.m.receivedAt))
    .slice(0, NEWS_PER_RUN);
  if (!fresh.length) return { emails: 0, read: 0, failed: 0, setAside: 0, sentence: newslettersSentence({ emails: 0, read: 0, failed: 0, setAside: 0 }) };
  const [hostedAi, book] = await Promise.all([providerFor(vault), vault.readJson("book", bookSchema).catch(() => null)]);
  const provider = hostedAi;
  const symbols = book ? newsSubjects(book).map((s) => s.symbol) : [];
  const digests: Digest[] = [];
  for (let i = 0; i < fresh.length; i += 4) digests.push(...(await Promise.all(fresh.slice(i, i + 4).map(({ m, key }) => readNewsletter(session, m, key, email, provider, symbols)))));
  // A recap the person also forwards is one issue with the shared copy, which stands for everyone (Hamza, 18 Oct 2026).
  await vault.writeJson("newsletters", keepDigests(file, withoutSharedTwins(withTries(digests, file, now), file.digests), now));
  const r = { emails: digests.length, read: digests.filter((d) => d.status === "read").length, failed: digests.filter((d) => d.status === "failed").length, setAside: digests.filter((d) => d.status === "set_aside").length };
  return { ...r, sentence: newslettersSentence(r) };
}

async function readNewsletter(session: InboxSession, m: { uid: number; receivedAt: string; headers: Header[] }, key: string, email: string, provider: ModelProvider | null, symbols: string[]): Promise<Digest> {
  const subject = (headerValues(m.headers, "subject")[0] ?? "").slice(0, 200);
  const headerFrom = headerValues(m.headers, "from")[0] ?? "";
  const base = { id: key, sender: senderOf(headerFrom), subject, receivedAt: m.receivedAt, reading: null };
  const subscribed = !sentByOwner(m.headers, email) && subscribedRecapSender(m.headers, RECAP_NEWSLETTERS.map((n) => n.sender)) !== null;
  if (!subscribed && !sentByOwner(m.headers, email)) return { ...base, status: "set_aside", sentence: NEWSLETTER_NOT_OWNER };
  if (!provider) return { ...base, status: "failed", sentence: NEWSLETTER_NO_AI };
  try {
    const content = await session.openText(m.uid);
    // Forwarded by hand, the email is from the person; the newsletter's own sender is in the forwarded header.
    const own = addressesIn(content.from || headerFrom).some((a) => baseAddress(a) === baseAddress(email));
    const quoted = own ? content.text.match(/Forwarded message[\s\S]{0,200}?\nFrom:\s*([^\n]+)/i)?.[1] : null;
    const sender = senderOf(quoted ?? content.from ?? headerFrom);
    const via = own ? "hand" : subscribed ? "subscribed" : "filter";
    // The newsletter's own moment (Hamza, 18 Oct 2026: a newsletter forwarded on Sunday is still Friday's): the forwarded header's Date, else the email's.
    const { date, from: dateFrom } = newsletterDated(content.text, content.date ?? null, m.receivedAt);
    const { text, cut } = newsletterText(content.text);
    if (text.length < 200) return { ...base, sender, via, date, dateFrom, status: "set_aside", sentence: "Set aside: it holds too few words to read as a newsletter." };
    // The newsletter's own pictures, by address alone, given to the model to place under its points (Hamza, 19 Oct 2026); the email itself is never kept.
    const images = newsletterImages(content.html);
    const parsed = await readingOf(provider, { sender, subject: content.subject || subject, date: date.slice(0, 10), text, cut, symbols, images });
    if (!parsed.ok) {
      console.error(`[newsletters] ${parsed.reason}`);
      return { ...base, sender, via, date, dateFrom, status: "failed", sentence: parsed.called ? "Read, but what came back did not hold together; it is tried again on the next run." : "The model answered in words instead of recording the newsletter; it is tried again on the next run." };
    }
    return { ...base, sender, via, date, dateFrom, status: "read", sentence: null, reading: parsed.reading, images };
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[newsletters] ${e.logDetail ?? "read failed"}`);
    return { ...base, status: "failed", sentence: `Not read: ${e.message}`.slice(0, 400) };
  }
}

/** Digests dated again per run, at most: each is one IMAP read of the email's text, no model. */
const REDATE_PER_RUN = 60;

/**
 * Dates again the digests dated by their arrival alone (kept before the
 * newsletter's own date was read, or forwarded by a program with no Date
 * line): the email is opened once more for its text and Date header, the
 * date read as `newsletterDated` reads a new one, and `dateFrom` set so it
 * is never opened again; an email no longer in the inbox is marked as dated
 * by its arrival. No model is called. Nothing is written when there is
 * nothing to date.
 */
async function redateInto(vault: Vault, file: NewslettersFile, session: InboxSession, mine: readonly { m: { uid: number; headers: Header[] }; key: string }[], now: Date): Promise<NewslettersFile> {
  const todo = undatedDigests(file).slice(0, REDATE_PER_RUN);
  if (!todo.length) return file;
  const byKey = new Map(mine.map((x) => [x.key, x.m]));
  const redated: Digest[] = [];
  for (const d of todo) {
    const m = byKey.get(d.id);
    if (!m) {
      redated.push(redateDigest(d, null, null));
      continue;
    }
    try {
      const content = await session.openText(m.uid);
      redated.push(redateDigest(d, content.text, content.date ?? null));
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[newsletters] redate: ${e.logDetail ?? "read failed"}`);
    }
  }
  if (!redated.length) return file;
  const moved = redated.filter((d) => d.date !== todo.find((t) => t.id === d.id)?.date).length;
  console.info(`[newsletters] dated again ${redated.length}, ${moved} moved`);
  const out = keepDigests(file, redated, now);
  await vault.writeJson("newsletters", out);
  return out;
}

/** One newsletter read on the person's provider: the record_newsletter call, parsed. */
async function readingOf(provider: ModelProvider, input: NewsletterInput) {
  const body = newsletterRequestBody(input, modelFor(provider, process.env.ANTHROPIC_NEWSLETTER_MODEL || NEWSLETTER_MODEL));
  // A reading that does not hold together is asked once more on the tier above (Hamza, 4 Nov 2026).
  return callChecked(provider, body as ModelRequest, { agent: "newsletter_reader", step: "newsletter", subject: input.sender }, (a) => parseNewsletterResponse(a, input.symbols, input.images?.length ?? 0), (p) => p.ok);
}

// ---------------------------------------------------------------------------
// The shared recap (Hamza, 18 Oct 2026)

/** Issues of the shared recap read from the app's inbox per run, newest first. */
const SHARED_PER_RUN = 10;

/**
 * The recap newsletter the app's own inbox subscribes to, read for everyone
 * (Hamza, 18 Oct 2026): the emails sent to the inbox itself by one of the
 * known recap senders and proven by the receiving server
 * (`sharedRecapSender`), each opened once as text: its own words as the
 * model reads them and its pictures with their sections. Nothing of anyone
 * is in it, and no model is called here.
 */
export async function readSharedIssues(session: InboxSession, senders: readonly string[], days = 7): Promise<SharedIssue[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const mine = (await session.list())
    .filter((m) => m.receivedAt >= since && sharedRecapSender(m.headers, session.address, senders) !== null)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, SHARED_PER_RUN);
  const issues: SharedIssue[] = [];
  for (const m of mine) {
    const content = await session.openText(m.uid);
    const headerFrom = headerValues(m.headers, "from")[0] ?? "";
    const { date, from: dateFrom } = newsletterDated(content.text, content.date ?? null, m.receivedAt);
    const { text, cut } = newsletterText(content.text);
    if (text.length < 200 && !content.html) continue;
    issues.push({ id: messageKey(m.headers, m.uid, m.receivedAt), sender: senderOf(content.from || headerFrom), subject: (content.subject || headerValues(m.headers, "subject")[0] || "").slice(0, 200), date, dateFrom, receivedAt: m.receivedAt, text, cut, images: newsletterImages(content.html) });
  }
  return issues;
}

export type SharedLay = { laid: number; failed: number };

/**
 * Lays the shared issues one person's vault still lacks into their
 * newsletters file, each read with the AI like any newsletter
 * they forward (the points on their holdings are theirs to pay for); with
 * no provider the pictures and the newsletter's words are kept with a
 * sentence, and read again once a model is added. Their own forward of the
 * same issue wins. Nothing is written when there is nothing new.
 */
export async function laySharedRecapsInto(vault: Vault, issues: readonly SharedIssue[], now: Date): Promise<SharedLay> {
  if (!issues.length) return { laid: 0, failed: 0 };
  const file = (await vault.readJson("newsletters", newslettersFileSchema)) ?? EMPTY_NEWSLETTERS;
  const hostedAi = await providerFor(vault);
  const provider = hostedAi;
  const todo = issuesToLay(issues, file.digests, provider !== null);
  if (!todo.length) return { laid: 0, failed: 0 };
  const book = await vault.readJson("book", bookSchema).catch(() => null);
  const symbols = book ? newsSubjects(book).map((s) => s.symbol) : [];
  let failed = 0;
  const digests: Digest[] = [];
  for (const issue of todo) {
    let reading: NewsletterReading | null = null;
    if (provider) {
      try {
        const parsed = await readingOf(provider, { sender: issue.sender, subject: issue.subject, date: issue.date.slice(0, 10), text: issue.text, cut: issue.cut, symbols, images: issue.images });
        if (parsed.ok) reading = parsed.reading;
        else {
          failed += 1;
          console.error(`[newsletters] shared: ${parsed.reason}`);
          continue;
        }
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        failed += 1;
        console.error(`[newsletters] shared: ${e.logDetail ?? "read failed"}`);
        continue;
      }
    }
    digests.push(sharedDigest(issue, reading));
  }
  if (digests.length) await vault.writeJson("newsletters", keepDigests(file, digests, now));
  return { laid: digests.length, failed };
}

export type Forwarding = { kind: ForwardingKind; code: string | null; link: string | null; forAddress: string; receivedAt: string; confirmed: boolean; sentence: string | null; how: "pressed" | "already" | null };

/**
 * Gmail's latest forwarding confirmation for this person, for their
 * statements address or their newsletters address, confirmed by itself
 * (Hamza, 17 Oct 2026): the confirmation is opened, Google's link in it
 * followed once as the inbox's owner would by clicking it, and the person
 * has nothing to type. The code and the link come back too, for the case
 * Google did not accept the link from here. Null when none came since
 * `since`, or in the days the session lists.
 */
/** Google's email carried no confirmation link the app could read: said, never a bare line. */
const NO_LINK = "Google's email carried no confirmation link the app could read. Click Re-send email beside the address in Gmail; the new request is read the same way.";

export type Confirm = (link: string) => Promise<{ confirmed: boolean; sentence: string | null; how?: "pressed" | "already" }>;

export async function latestForwarding(email: string, session: InboxSession, confirm: Confirm = confirmForwarding, since?: string, kind?: ForwardingKind, kept: Confirmation | null = null): Promise<Forwarding | null> {
  const tag = inboxTag(email);
  const found = (await session.list())
    .map((m) => ({ uid: m.uid, kind: forwardingKindOf(m.headers, session.address, tag), c: forwardingCode(m.headers, email, m.receivedAt) }))
    .filter((x): x is { uid: number; kind: ForwardingKind; c: ForwardingCode } => x.kind !== null && (!kind || x.kind === kind) && x.c !== null && (!since || x.c.receivedAt >= since))
    .sort((a, b) => b.c.receivedAt.localeCompare(a.c.receivedAt))[0];
  if (!found) return null;
  const base = { kind: found.kind, forAddress: found.c.forAddress, receivedAt: found.c.receivedAt };
  // The request the app already confirmed: Google's page is not opened again (a used link may read as expired, never as the proof it was).
  if (alreadyConfirmed(kept, found.c.receivedAt) && kept) return { ...base, code: null, link: null, confirmed: true, sentence: null, how: kept.how };
  const content = await session.openText(found.uid);
  const links = forwardingLinks(content.text, content.html);
  const code = found.c.code ?? links.code;
  const link = links.confirm;
  const { confirmed, sentence, how } = link ? await confirm(link) : { confirmed: false, sentence: NO_LINK, how: undefined };
  return { ...base, code, link, confirmed, sentence, how: confirmed ? (how ?? "pressed") : null };
}

export type ForwardingState = { file: ForwardingFile; requests: Forwarding[] };

/**
 * Gmail's latest request for each of the person's two addresses, confirmed
 * by itself and kept (Hamza, 18 Oct 2026: once confirmed, the page must
 * show it, today and after). A request already in the vault's `forwarding`
 * file is reported from the record without opening Google's page again; a
 * newly confirmed one is written there, with when it came and when Google
 * agreed, never its link. The morning refresh and the screens' watch share
 * this one path.
 */
export async function confirmForwardingInto(vault: Vault, email: string, session: InboxSession, since: string | undefined, now: Date, confirm: Confirm = confirmForwarding): Promise<ForwardingState> {
  let file = (await vault.readJson("forwarding", forwardingFileSchema)) ?? EMPTY_FORWARDING;
  const requests: Forwarding[] = [];
  for (const kind of FORWARDING_KINDS) {
    const kept = confirmationOf(file, kind);
    const fwd = await latestForwarding(email, session, confirm, since, kind, kept);
    if (!fwd) continue;
    requests.push(fwd);
    if (fwd.confirmed && !alreadyConfirmed(kept, fwd.receivedAt)) {
      file = recordConfirmation(file, { kind, forAddress: fwd.forAddress, requestedAt: fwd.receivedAt, confirmedAt: now.toISOString(), how: fwd.how ?? "pressed" });
      await vault.writeJson("forwarding", file);
    }
  }
  return { file, requests };
}

/** The answer Google's page gives, as a minimal fetch for the tests to fake. */
export type PageFetch = (url: string, init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; url: string; text(): Promise<string>; setCookies: string[] }>;

const fetchPage: PageFetch = async (url, init) => {
  const res = await fetch(url, { ...init, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  return { ok: res.ok, status: res.status, url: res.url, text: () => res.text(), setCookies: res.headers.getSetCookie() };
};

/** Google's page asks for a click the app could not make: the person makes it, on the page, in one press. */
export const CLICK_SENTENCE = "Google's page asks for one click to confirm it. Press Confirm in Google: it opens Google's page in a new tab, where that click finishes it.";

/**
 * Opens Gmail's confirmation link once, with one GET to Google (mail.google.com
 * or mail-settings.google.com), and, when Google's page answers with a
 * Confirm form, submits that form once with the page's own fields and
 * cookies: the click Google asks the receiving inbox for. The forwarding is
 * reported confirmed only when Google's page says so; any other answer
 * leaves it to the person, with the link (Hamza, 18 Oct 2026). The link is
 * never logged.
 */
export async function confirmForwarding(link: string, get: PageFetch = fetchPage): Promise<{ confirmed: boolean; sentence: string | null; how?: "pressed" | "already" }> {
  if (!isForwardingConfirmLink(link)) return { confirmed: false, sentence: null };
  try {
    const res = await get(link, { method: "GET" });
    if (!res.ok) return { confirmed: false, sentence: `Google answered ${res.status} to its confirmation link, so it was not confirmed from here. Press Confirm in Google to finish it.` };
    if (/^https:\/\/accounts\.google\.com\//.test(res.url)) return { confirmed: false, sentence: "Google asked for a sign-in before confirming, so it was not confirmed from here. Press Confirm in Google to finish it, signed in as yourself." };
    const page = readConfirmPage((await res.text()).slice(0, 200_000), res.url || link);
    if (page.state === "confirmed") return { confirmed: true, sentence: null, how: "already" };
    if (page.state === "invalid") return { confirmed: false, sentence: "Google says its confirmation link is no longer valid. If Gmail already shows the address as verified, nothing more is needed; if not, click Re-send email beside the address in Gmail." };
    if (page.state === "form" && page.form) {
      const cookie = res.setCookies.map((c) => c.split(";")[0]).join("; ");
      const body = new URLSearchParams(page.form.fields).toString();
      const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
      if (cookie) headers.cookie = cookie;
      const sent = await get(page.form.action, { method: "POST", headers, body });
      if (sent.ok && readConfirmPage((await sent.text()).slice(0, 200_000), sent.url || page.form.action).state === "confirmed") return { confirmed: true, sentence: null, how: "pressed" };
    }
    return { confirmed: false, sentence: CLICK_SENTENCE };
  } catch {
    return { confirmed: false, sentence: "Google's confirmation link could not be opened from here. Press Confirm in Google to finish it." };
  }
}

/** An email's lasting key: its Message-ID, else its place and time in the mailbox. */
export function messageKey(headers: Header[], uid: number, receivedAt: string): string {
  const id = headers.find((h) => h.name === "message-id")?.value.trim();
  return createHash("sha256")
    .update(id || `${uid}:${receivedAt}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * What the person's Claude found through the connector, laid on the vault's
 * `newsletter_senders` file as proposals (lib/newsletters.ts). Nothing
 * takes effect: the person keeps or removes each one on Setup's Newsletters card, and
 * only the kept ones make the filter. The one write the MCP server makes.
 */
export async function proposeNewsletterSenders(vault: Vault, found: readonly ProposedSender[], now: Date): Promise<ReturnType<typeof proposeSenders>> {
  const file = (await vault.readJson("newsletter_senders", newsletterSendersSchema)) ?? EMPTY_SENDERS;
  const result = proposeSenders(file, found, now.toISOString());
  await vault.writeJson("newsletter_senders", result.file);
  return result;
}
