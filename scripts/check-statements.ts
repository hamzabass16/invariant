/**
 * Statements and fund reports (lib/statements.ts): the request, the reading
 * of the answer, the figure check against the document's own text, and the
 * merge into the book; and the PDF text layer (lib/pdf-text.ts) on a small
 * fictional statement written here. Every name and figure is invented.
 *
 * Run: npm run check:statements  (NODE_OPTIONS=--conditions=react-server, so
 * the "server-only" import resolves to the empty module.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readableSymbols } from "../lib/filings";
import { addressesIn, alreadyConfirmed, authenticatedFrom, baseAddress, confirmationOf, EMPTY_FORWARDING, forwardingCode, forwardingFileSchema, forwardingKindOf, forwardingLinks, inboxSentence, isForwardingConfirmLink, isPdfAttachment, readConfirmPage, recordConfirmation, messageTag, newsletterTag, newsTagOf, parseHeaders, sentByOwner, sharedRecapSender, subscribedRecapSender, tagOf } from "../lib/inbox";
import type { InboxSession } from "../lib/inbox-mail";
import { CLICK_SENTENCE, confirmForwarding, confirmForwardingInto, latestForwarding, readInboxInto, readNewslettersInto, type Confirm, type PageFetch } from "../lib/inbox-run";
import { inboxTag } from "../lib/inbox-tag";
import { bookSchema, type Book } from "../lib/holdings";
import { toOpenAIRequest, type ModelRequest } from "../lib/model-provider";
import { addSenders, backfillPrompt, bySender, byTheme, decideSender, digestDate, digestsIn, digestsOfWeek, EMPTY_NEWSLETTERS, EMPTY_SENDERS, filterSenders, filterSteps, finderPrompt, forwardingProof, gmailFilter, gmailFilterUrl, gmailSearchUrl, keepDigests, keptSenders, isRecapDigest, issuesToLay, isWeekendDay, isWeekendIssue, MAX_IMAGES, newsletterDate, newsletterDated, newsletterImages, newYorkWeekday, printedDate, redateDigest, pictureGroups, proposedSenders, proposeSenders, rankDigests, recapParts, recapToShow, removedSenders, sameIssue, sendersIn, newsletterRequestBody, newslettersAddressFor, newslettersFileSchema, newslettersSentence, newsletterText, parseNewsletterResponse, NEWSLETTER_MAX_TRIES, NEWSLETTER_NO_AI, NEWSLETTER_RETRY_MINUTES, readKeys, senderOf, SHARED_NO_MODEL, sharedDigest, sharedRecapFor, sharedRecapsSchema, type SharedIssue, topPoints, undatedDigests, unplacedStories, unreadOf, withoutSharedTwins, withRead, withTries, type Digest } from "../lib/newsletters";
import { pdfText } from "../lib/pdf-text";
import { DEFAULT_SHOWS, EMPTY_PODCASTS, episodeDay, episodesOfWeek, episodesToRead, EPISODES_PER_RUN, keepEpisodes, listingNotes, STALE_SHOW_DAYS, parseEpisodePage, parsePodcastResponse, parseShowPage, podcastRequestBody, podcastsFileSchema, podcastsSentence, showSlugOf, showTitleOf, transcriptText, PODCAST_MAX_CHARS, withoutShow, withShow, type Episode, type PodcastContext } from "../lib/podcasts";
import { localMoment } from "../lib/time";
import {
  EMPTY_STATEMENTS,
  judge,
  keepDocument,
  keepMessages,
  numbersIn,
  parseStatementResponse,
  printed,
  readAgain,
  STATEMENT_MAX_TRIES,
  statementRequestBody,
  statementsFileSchema,
  textLooksReadable,
  triesAfter,
  withStatements,
  type Extraction,
  type StatementDoc,
  type StatementPosition,
} from "../lib/statements";
import { atUtcHour, currentZone, localDay, setZoneSource, zonePlace } from "../lib/time";
import { defaultSchedule, scheduleWords } from "../lib/report";

// The checks read days and clocks in one zone, as a person in Athens would see them.
setZoneSource(() => "Europe/Athens");

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// A fictional statement: its printed text, and a tiny PDF carrying it.

const LINES = [
  "Example Private Bank SA - Portfolio statement",
  "Portfolio 1234.5678 Reference currency USD Data as of 30.09.2026",
  "Type Name ISIN Ccy Quantity Cost Market Value Value in Ref Ccy",
  "Cash Current account USD 25'000.00 25'000",
  "Cash Current account EUR 10'000.00 11'700",
  "Shares Example Robotics Corp US0000000001 USD 100.00 80.00 12'345.67 12'346",
  "Funds Example Europe Fund EUR-Acc LU0000000002 EUR 1'000.00 9.50 10'500.00 12'285",
  "Bonds Example Treasury 3.5% 2030 XS0000000003 USD 20'000.00 99.10 19'820.00 19'820",
  "Total portfolio value 81'151 USD",
];
const TEXT = LINES.join("\n");

function pos(over: Partial<StatementPosition> & Pick<StatementPosition, "name" | "currency" | "value" | "assetClass">): StatementPosition {
  return { isin: null, ticker: null, quantity: null, price: null, valueRef: null, costBasis: null, country: null, sector: null, themes: [], coupon: null, maturity: null, yieldPct: null, rating: null, ratePct: null, ...over };
}

const GOOD: Extraction = {
  kind: "bank_statement",
  institution: "Example Private Bank",
  account: "1234.5678",
  asOf: "2026-09-30",
  currency: "USD",
  totalValue: 81151,
  positions: [
    pos({ assetClass: "cash", name: "Current account USD", currency: "USD", value: 25000, valueRef: 25000 }),
    pos({ assetClass: "cash", name: "Current account EUR", currency: "EUR", value: 10000, valueRef: 11700 }),
    pos({ assetClass: "equity", name: "Example Robotics Corp", isin: "US0000000001", ticker: "EXRB", currency: "USD", quantity: 100, price: 123.4567, value: 12345.67, valueRef: 12346, costBasis: 8000, themes: ["Industrials"] }),
    pos({ assetClass: "etf", name: "Example Europe Fund EUR-Acc", isin: "LU0000000002", currency: "EUR", quantity: 1000, price: 10.5, value: 10500, valueRef: 12285 }),
    pos({ assetClass: "bond", name: "Example Treasury 3.5% 2030", isin: "XS0000000003", currency: "USD", quantity: 20000, value: 19820, valueRef: 19820, coupon: 3.5, maturity: "2030-06-15" }),
  ],
  fund: null,
  notes: [],
};

/** A one-page PDF with the lines as text, built by hand so the check needs no PDF writer. */
function tinyPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = ["BT", "/F1 9 Tf", "11 TL", "40 800 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const answer = (input: unknown) => ({ content: [{ type: "tool_use", name: "record_document", input }] });
const base = (id: string): Omit<StatementDoc, "status" | "sentence" | "unchecked" | "extraction" | "confirmedAt"> => ({ id, name: `${id}.pdf`, receivedAt: "2026-10-01T08:00:00.000Z", via: "upload", readFrom: "text" });

async function main() {
  // ---------------------------------------------------------------------------
  // 1. The text layer of a real PDF, and reading numbers both ways.

  const { text: pdfLayer, pages } = await pdfText(tinyPdf(LINES));
  check("a PDF's text layer is read, its figures with it (an apostrophe may come back as ’)", pages === 1 && !!pdfLayer && pdfLayer.includes("Example Robotics Corp") && printed(12345.67, numbersIn(pdfLayer)), JSON.stringify({ pages, robo: pdfLayer?.match(/Robotics.{0,60}/)?.[0] }));
  const broken = await pdfText(new TextEncoder().encode("%PDF-1.4 not really"));
  check("a PDF that cannot be opened gives no text, not a throw", broken.text === null);
  check("the statement's text reads as words", textLooksReadable(TEXT));
  check("watermark noise does not read as words", !textLooksReadable("x7#q 9z@! 3k$ ".repeat(80)));

  const nums = numbersIn("1'234.56 · 1,234.56 · 1.234,56 · 1 234 · -12'000 · 2.53%");
  check("1'234.56, 1,234.56 and 1.234,56 all read as 1234.56", nums.filter((n) => n === 1234.56).length >= 3, JSON.stringify(nums));
  check("a negative is read", nums.includes(-12000));
  check("a figure printed to the unit counts (12345.67 as 12'346)", printed(12345.67, numbersIn("12'346")));
  check("a figure not printed does not count", !printed(12999, numbersIn(TEXT)));
  check("a small figure must match to two places", !printed(10.51, numbersIn("10.50")) && printed(10.5, numbersIn("10.50")));

  // ---------------------------------------------------------------------------
  // 2. The request, for text and for a PDF, and one request shape for any provider.

  const textBody = statementRequestBody({ name: "s.pdf", text: TEXT, pdf: null }) as ModelRequest & { tools: { name: string; input_schema: unknown }[]; messages: { content: { type: string; text?: string }[] }[] };
  check("the request records through one tool", textBody.tools.length === 1 && textBody.tools[0].name === "record_document");
  check("a readable statement is sent as text", textBody.messages[0].content[0].type === "text" && textBody.messages[0].content[0].text!.includes("Example Robotics Corp"));
  let translated = true;
  try {
    toOpenAIRequest(textBody, "open-model");
  } catch {
    translated = false;
  }
  check("the text request translates for an open model", translated);
  const pdfBody = statementRequestBody({ name: "s.pdf", text: null, pdf: tinyPdf(["x"]) }) as ModelRequest & { messages: { content: { type: string }[] }[] };
  check("an unreadable one is sent as the PDF itself", pdfBody.messages[0].content[0].type === "document");
  let refused = false;
  try {
    toOpenAIRequest(pdfBody, "open-model");
  } catch {
    refused = true;
  }
  check("an open model is never sent a PDF", refused);
  const long = statementRequestBody({ name: "long.pdf", text: "a ".repeat(100_000), pdf: null }) as { messages: { content: { text?: string }[] }[] };
  check("a long text is cut and says so", long.messages[0].content[0].text!.includes("cut for length") && long.messages[0].content[0].text!.length < 160_000);

  // ---------------------------------------------------------------------------
  // 3. The answer.

  const ok = parseStatementResponse(answer(GOOD));
  check("a recorded document parses", ok.ok);
  const words = parseStatementResponse({ content: [{ type: "text", text: "The statement shows..." }] });
  check("an answer in words is refused", !words.ok && !words.called);
  const bad = parseStatementResponse(answer({ ...GOOD, asOf: "30.09.2026" }));
  check("an answer that does not fit is refused", !bad.ok && bad.called);

  // ---------------------------------------------------------------------------
  // 4. The check against the document.

  const applied = judge(base("aaaaaaaaaaaaaaaa"), GOOD, TEXT);
  check("every figure printed: applied", applied.status === "applied" && applied.unchecked.length === 0 && applied.sentence === null, JSON.stringify(applied.unchecked));

  const invented: Extraction = { ...GOOD, positions: GOOD.positions.map((p, i) => (i === 2 ? { ...p, value: 13345.67, valueRef: 13346 } : p)) };
  const r1 = judge(base("bbbbbbbbbbbbbbbb"), invented, TEXT);
  check("a figure not in the document: waits for the person", r1.status === "review" && r1.unchecked.some((u) => u.startsWith("Example Robotics Corp")), JSON.stringify(r1.unchecked));
  check("and says how many and what to do", !!r1.sentence && /not found printed/.test(r1.sentence) && /use them or remove it/.test(r1.sentence));

  const wrongIsin: Extraction = { ...GOOD, positions: GOOD.positions.map((p, i) => (i === 3 ? { ...p, isin: "LU0000000009" } : p)) };
  check("an ISIN not in the document: waits", judge(base("cccccccccccccccc"), wrongIsin, TEXT).status === "review");

  const dropped: Extraction = { ...GOOD, positions: GOOD.positions.slice(0, 4) };
  const r2 = judge(base("dddddddddddddddd"), dropped, TEXT);
  check("positions that do not add up to the total: waits", r2.status === "review" && /add up to/.test(r2.sentence ?? ""), r2.sentence ?? "");

  const fromPdf = judge({ ...base("eeeeeeeeeeeeeeee"), readFrom: "pdf" }, GOOD, null);
  check("read from the PDF itself: waits, nothing to check against", fromPdf.status === "review" && /text layer cannot be read/.test(fromPdf.sentence ?? ""));

  const notice = judge(base("ffffffffffffffff"), { ...GOOD, kind: "notice", positions: [], totalValue: null }, TEXT);
  check("a notice is set aside with a sentence", notice.status === "ignored" && /notice/.test(notice.sentence ?? ""));
  const other = judge(base("1111111111111111"), { ...GOOD, kind: "other", positions: [], totalValue: null }, TEXT);
  check("commentary is set aside", other.status === "ignored");

  const FUND_TEXT = "Example Ventures Fund II quarterly report 30 June 2026. Your capital account: 250,000.00. Commitment 500,000 Paid-in 300,000 Distributions 40,000. Portfolio: Alpha Robotics 1,200,000; Beta Health 800,000. Net IRR 9.4% TVPI 1.12x";
  const fundX: Extraction = {
    kind: "fund_report",
    institution: "Example Ventures",
    account: null,
    asOf: "2026-06-30",
    currency: "EUR",
    totalValue: null,
    positions: [],
    fund: {
      name: "Example Ventures Fund II",
      manager: "Example Ventures",
      vintage: 2022,
      currency: "EUR",
      nav: 250000,
      commitment: 500000,
      called: 300000,
      distributions: 40000,
      dpi: null,
      tvpi: 1.12,
      irrPct: 9.4,
      companies: [
        { name: "Alpha Robotics", ticker: null, sector: "Robotics", country: "DE", stage: "Series B", themes: ["Industrials"], fairValue: 1200000 },
        { name: "Beta Health", ticker: null, sector: "Health", country: "FR", stage: "Series A", themes: ["Healthcare"], fairValue: 800000 },
      ],
    },
    notes: [],
  };
  const fundDoc = judge(base("2222222222222222"), fundX, FUND_TEXT);
  check("a fund report with your share, every figure printed: applied", fundDoc.status === "applied", fundDoc.sentence ?? "");
  const wholeFund = judge(base("3333333333333333"), { ...fundX, fund: { ...fundX.fund!, nav: null, commitment: null, called: null, distributions: null } }, FUND_TEXT);
  check("a report with only the whole fund's figures says your share is elsewhere", wholeFund.status === "applied" && /capital account statement/.test(wholeFund.sentence ?? ""));

  // ---------------------------------------------------------------------------
  // 5. The file: the same document once, newest first.

  let file = keepDocument(EMPTY_STATEMENTS, applied, "2026-10-01T08:00:00Z");
  file = keepDocument(file, fundDoc, "2026-10-01T08:01:00Z");
  file = keepDocument(file, { ...applied, name: "again.pdf" }, "2026-10-01T08:02:00Z");
  check("the same document is kept once", file.documents.filter((d) => d.id === applied.id).length === 1 && file.documents[0].name === "again.pdf");
  check("the file validates", statementsFileSchema.safeParse(file).success);

  // ---------------------------------------------------------------------------
  // 6. Into the book.

  const today = "2026-10-13";
  const alone = withStatements(null, file, "USD", today);
  const b = alone.book!;
  check("statements alone make a book in the base currency", !!b && b.fx.base === "USD" && bookSchema.safeParse(b).success);
  check("one holding per position, from statements, as of the statement", b.holdings.filter((h) => h.valuation === "bank_statement").length === 5 && b.holdings.every((h) => h.source === "statements"));
  check("a rate is taken from the statement's own two columns (EUR 10'000 = USD 11'700)", Math.abs((b.fx.rates.EUR ?? 0) - 1.17) < 1e-9, JSON.stringify(b.fx.rates));
  const bond = b.holdings.find((h) => h.assetClass === "bond");
  check("a bond carries its coupon and maturity", bond?.bond?.coupon === 3.5 && bond.bond.maturity === "2030-06-15");
  const fund = b.holdings.find((h) => h.assetClass === "private_fund");
  check("a fund report becomes the fund at your value", fund?.value === 250000 && fund.fund?.commitment === 500000 && fund.fund.called === 300000 && fund.fund.reported.tvpi === 1.12 && fund.valuation === "fund_report");
  check("its companies sit under it", b.lookThrough.length === 2 && b.lookThrough.every((r) => r.parentId === fund?.id));

  const eurBase = withStatements(null, file, "CHF", today);
  check("a statement in a currency nothing converts is left out, and said so", !eurBase.book!.holdings.some((h) => h.valuation === "bank_statement") && eurBase.notes.some((n) => /left out/.test(n)), JSON.stringify(eurBase.notes));

  const review = keepDocument(EMPTY_STATEMENTS, r1, today);
  check("a document waiting for the person adds nothing", withStatements(null, review, "USD", today).book === null);
  const confirmed = keepDocument(EMPTY_STATEMENTS, { ...r1, status: "applied", confirmedAt: "2026-10-02T00:00:00Z" }, today);
  check("once confirmed, its figures are used", withStatements(null, confirmed, "USD", today).book?.holdings.length === 5);

  const older = judge({ ...base("4444444444444444"), receivedAt: "2026-09-01T00:00:00Z" }, { ...GOOD, asOf: "2026-08-31", positions: GOOD.positions.slice(0, 1), totalValue: 25000 }, TEXT);
  const both = keepDocument(keepDocument(EMPTY_STATEMENTS, older, today), applied, today);
  check("the latest statement per account is the one used", withStatements(null, both, "USD", today).book?.holdings.filter((h) => h.valuation === "bank_statement").length === 5);

  const broker: Book = bookSchema.parse({
    asOf: "2026-10-10",
    holdings: [
      { id: "ib:AAA", account: "IBKR", source: "ibkr", assetClass: "equity", symbol: "AAA", name: "AAA Inc", quantity: 10, price: 50, value: 500, costBasis: 400, currency: "USD", asOf: "2026-10-10", valuation: "broker", country: "US", sector: null, themes: [] },
      { id: "old:stmt", account: "Old bank", source: "statements", assetClass: "cash", symbol: "USD", name: "Old cash", quantity: 1, price: null, value: 1, costBasis: null, currency: "USD", asOf: "2026-01-01", valuation: "bank_statement", country: null, sector: null, themes: [] },
    ],
    lookThrough: [],
    transactions: [],
    fx: { base: "USD", asOf: "2026-10-10", rates: { EUR: 1.2 }, source: "IBKR" },
  });
  const merged = withStatements(broker, file, "USD", today).book!;
  check("the broker's holdings stay beside the statements", merged.holdings.some((h) => h.id === "ib:AAA") && merged.asOf === "2026-10-10");
  check("statement holdings a book file carried are replaced, not doubled", !merged.holdings.some((h) => h.id === "old:stmt"));
  check("the broker's own rate wins over one a statement implies", merged.fx.rates.EUR === 1.2);
  const isinOnly = withStatements(null, keepDocument(EMPTY_STATEMENTS, judge(base("5555555555555555"), { ...GOOD, positions: GOOD.positions.map((p) => ({ ...p, ticker: null })) }, TEXT), today), "USD", today).book!;
  check("a share named by its ISIN alone is not sent to the SEC", !readableSymbols(isinOnly).length && readableSymbols(b).includes("EXRB"), JSON.stringify(readableSymbols(isinOnly)));
  check("no statements in use leaves the book as it was", withStatements(broker, EMPTY_STATEMENTS, "USD", today).book === broker);


  // -------------------------------------------------------------------------
  // The statements inbox: whose an email is, whether their own account sent
  // it, Gmail's forwarding code, and the read into the vault. Every address
  // and message here is invented.

  const OWNER = "first.last@gmail.com";
  const INBOX = "statements.desk@gmail.com";
  const TAG = inboxTag(OWNER);
  check("a tag is eight hex of the sign-in, the same whatever its case", /^[0-9a-f]{8}$/.test(TAG) && inboxTag(" First.Last@Gmail.com ") === TAG);
  const mine = `statements.desk+${TAG}@gmail.com`;
  check("the tag is read off the inbox's own address", tagOf(mine, INBOX) === TAG && tagOf(`statementsdesk+${TAG}@googlemail.com`, INBOX) === TAG);
  check("another mailbox's tag is not ours", tagOf(`someone+${TAG}@gmail.com`, INBOX) === null && tagOf(`statements.desk+${TAG}@example.com`, INBOX) === null);
  check("addresses come out of a display list", JSON.stringify(addressesIn(`"Desk" <${mine}>, other@example.com`)) === JSON.stringify([mine, "other@example.com"]));
  check("a Gmail address is one mailbox with or without dots and a +suffix", baseAddress("First.Last+caf_=x=gmail.com@gmail.com") === "firstlast@gmail.com" && baseAddress("a.b@example.com") === "a.b@example.com");

  const forwarded = parseHeaders(
    [
      `Delivered-To: ${mine}`,
      `Authentication-Results: mx.google.com;`,
      `       dkim=pass header.i=@bank-b.example header.s=s1;`,
      `       spf=pass (google.com: domain of firstlast+caf_=${mine.replace("@", "=")}@gmail.com designates 192.0.2.1 as permitted sender) smtp.mailfrom="firstlast+caf_=${mine.replace("@", "=")}@gmail.com";`,
      `       dmarc=pass header.from=bank-b.example`,
      `From: Bank B <statements@bank-b.example>`,
      `To: ${OWNER}`,
      `Subject: Your September statement`,
      `Message-ID: <a1@bank-b.example>`,
      "",
    ].join("\r\n"),
  );
  check("folded header lines are unfolded", (forwarded.find((h) => h.name === "authentication-results")?.value ?? "").includes("dmarc=pass"));
  check("an email Gmail forwarded is for the tag it was delivered to", messageTag(forwarded, INBOX) === TAG);
  check("Gmail's automatic forward counts as sent by the person", sentByOwner(forwarded, OWNER));
  check("the same forward is not someone else's", !sentByOwner(forwarded, "other.person@gmail.com"));
  const spoofed = parseHeaders(
    [
      `Delivered-To: ${mine}`,
      `Authentication-Results: mx.google.com; spf=pass (google.com: domain of x@evil.example designates 198.51.100.7 as permitted sender) smtp.mailfrom=x@evil.example`,
      `Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=${OWNER}`,
      `From: ${OWNER}`,
      `Subject: Statement`,
      "",
    ].join("\r\n"),
  );
  check("a sender who writes the person's address into their own headers is not the person", !sentByOwner(spoofed, OWNER));
  const failedSpf = parseHeaders(`Delivered-To: ${mine}\r\nAuthentication-Results: mx.google.com; spf=softfail smtp.mailfrom=${OWNER}\r\nFrom: ${OWNER}\r\n`);
  check("an email whose sender check did not pass is not the person's", !sentByOwner(failedSpf, OWNER));

  const confirmation = parseHeaders(
    [
      `Delivered-To: ${mine}`,
      `Authentication-Results: mx.google.com; dkim=pass header.i=@accounts.google.com; spf=pass smtp.mailfrom=3abc@forwarding.bounces.google.com`,
      `From: Gmail Team <forwarding-noreply@google.com>`,
      `Subject: (#123456789) Gmail Forwarding Confirmation - Receive Mail from first.last@gmail.com`,
      "",
    ].join("\r\n"),
  );
  check("Gmail's forwarding code is read for the person it names", forwardingCode(confirmation, OWNER, "2026-10-13T10:00:00Z")?.code === "123456789");
  check("a forwarding code for another address is not shown", forwardingCode(confirmation, "other.person@gmail.com", "2026-10-13T10:00:00Z") === null);
  const fakeCode = parseHeaders(`Delivered-To: ${mine}\r\nAuthentication-Results: mx.google.com; spf=pass smtp.mailfrom=x@evil.example\r\nFrom: forwarding-noreply@google.com\r\nSubject: (#999999999) Gmail Forwarding Confirmation - Receive Mail from first.last@gmail.com\r\n`);
  check("a forwarding code Google did not send is not shown", forwardingCode(fakeCode, OWNER, "2026-10-13T10:00:00Z") === null);
  const linkOnly = parseHeaders(`Delivered-To: ${mine}\r\nAuthentication-Results: mx.google.com; dkim=pass header.i=@accounts.google.com; spf=pass smtp.mailfrom=3abc@forwarding.bounces.google.com\r\nFrom: Gmail Team <forwarding-noreply@google.com>\r\nSubject: Gmail Forwarding Confirmation - Receive Mail from first.last@gmail.com\r\n`);
  const linkOnlyRead = forwardingCode(linkOnly, OWNER, "2026-10-13T10:00:00Z");
  check("a confirmation whose subject carries no code is still known, for the person it names", linkOnlyRead !== null && linkOnlyRead.code === null && linkOnlyRead.forAddress === OWNER);
  const confirmText = "first.last@gmail.com has requested to automatically forward mail.\n\nplease click the link below to confirm the request:\n\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ-abc_DEF%5D-SsC4H-FaMDp7\n\nclick this link to cancel this verification:\nhttps://mail-settings.google.com/mail/uf-%5BANGjdJ_xyz%5D-SsC4H\n";
  const links = forwardingLinks(confirmText);
  check("the confirmation link is read from the text, never the cancel link", links.confirm === "https://mail-settings.google.com/mail/vf-%5BANGjdJ-abc_DEF%5D-SsC4H-FaMDp7" && links.code === null);
  check("a code printed in the text is read too", forwardingLinks("Confirmation code: 123456789\n").code === "123456789");
  const confirmHtml = '<html><body><p>Please confirm:</p><p><a href="https://mail-settings.google.com/mail/vf-%5BANGjdJ-html_DEF%5D-SsC4H?x=1&amp;y=2" style="color:#15c">Confirm</a></p><p><a href="https://mail-settings.google.com/mail/uf-%5BANvf-cancel%5D-SsC4H">cancel</a></p></body></html>';
  check("an HTML-only confirmation gives its link from the href, entities decoded, never the cancel link", forwardingLinks("", confirmHtml).confirm === "https://mail-settings.google.com/mail/vf-%5BANGjdJ-html_DEF%5D-SsC4H?x=1&y=2");
  check("a confirmation link under /u/0/ or on mail.google.com is known", forwardingLinks("see https://mail.google.com/mail/u/0/vf-%5Babc%5D-x now").confirm === "https://mail.google.com/mail/u/0/vf-%5Babc%5D-x");
  check("Gmail's link on mail.google.com (18 Oct 2026) is read and is the only kind the app opens", forwardingLinks("please click:\n\nhttps://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail\n\ncancel:\nhttps://mail.google.com/mail/uf-%5BANGjdJ-no%5D-tail\n").confirm === "https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail" && isForwardingConfirmLink("https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail") && !isForwardingConfirmLink("https://mail.google.com/mail/uf-%5BANGjdJ-no%5D-tail") && !isForwardingConfirmLink("https://evil.example/mail/vf-x"));
  check("a cancel link whose token holds vf- is not the confirmation link", forwardingLinks("https://mail-settings.google.com/mail/uf-%5BANvf-xx%5D-y\n").confirm === null);
  check("a PDF attachment is known by its type or, for octet-stream, its name", isPdfAttachment({ filename: "a.pdf", contentType: "application/pdf" }) && isPdfAttachment({ filename: "B.PDF", contentType: "application/octet-stream" }) && !isPdfAttachment({ filename: "a.png", contentType: "image/png" }) && !isPdfAttachment({ filename: "x.zip", contentType: "application/octet-stream" }));
  check("the morning line counts what came", inboxSentence({ emails: 2, read: 3, inUse: 1, waiting: 1, failed: 1, setAside: 0 }) === "2 new emails, 3 documents: 1 in use, 1 waiting for you on Statements, 1 not read." && inboxSentence({ emails: 0, read: 0, inUse: 0, waiting: 0, failed: 0, setAside: 0 }) === "No new statements.");
  check("a file written before the inbox reads with no emails marked", statementsFileSchema.parse({ version: 1, documents: [], updated: "" }).messages.length === 0);
  check("emails read are kept once each, newest first", JSON.stringify(keepMessages(keepMessages(EMPTY_STATEMENTS, ["aaaaaaaaaaaaaaaa"], "t"), ["bbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaa"], "t").messages) === JSON.stringify(["bbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaa"]));

  // The read into a vault, with a fake mailbox and no model key: a PDF that could not be read for want of a key is tried again next run; an email from a stranger and one without a PDF are listed and never opened again.
  const stored: Record<string, unknown> = {};
  const vault = {
    async readJson<T>(key: string, schema: { parse: (v: unknown) => T }) {
      return key in stored ? schema.parse(stored[key]) : null;
    },
    async writeJson(key: string, value: unknown) {
      stored[key] = JSON.parse(JSON.stringify(value));
    },
  } as unknown as Parameters<typeof readInboxInto>[0];
  const header = (lines: string[]) => parseHeaders(lines.join("\r\n"));
  const ownSent = (id: string, subject: string) => header([`Delivered-To: ${mine}`, `Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=${OWNER}`, `From: ${OWNER}`, `Subject: ${subject}`, `Message-ID: <${id}@mail.example>`]);
  const messages = [
    { uid: 1, size: 1000, receivedAt: "2026-10-12T08:00:00.000Z", headers: ownSent("m1", "Fwd: statement") },
    { uid: 2, size: 1000, receivedAt: "2026-10-12T09:00:00.000Z", headers: ownSent("m2", "Your statement is ready") },
    { uid: 3, size: 1000, receivedAt: "2026-10-12T10:00:00.000Z", headers: header([`Delivered-To: ${mine}`, `Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=x@evil.example`, `From: x@evil.example`, `Subject: Urgent`, `Message-ID: <m3@evil.example>`]) },
    { uid: 4, size: 1000, receivedAt: "2026-10-12T11:00:00.000Z", headers: header([`Delivered-To: statements.desk+00000000@gmail.com`, `Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=someone@example.com`, `Subject: Someone else's`, `Message-ID: <m4@example.com>`]) },
    { uid: 5, size: 1000, receivedAt: "2026-10-12T12:00:00.000Z", headers: confirmation },
  ];
  const opened: number[] = [];
  const session: InboxSession = {
    address: INBOX,
    list: async () => messages,
    open: async (uid) => {
      opened.push(uid);
      return uid === 1 ? { subject: "Fwd: statement", pdfs: [{ name: "statement.pdf", bytes: tinyPdf(LINES) }] } : { subject: "Your statement is ready", pdfs: [] };
    },
    openText: async () => ({ subject: "", from: "", text: "", html: "" }),
    close: async () => undefined,
  };
  const first = await readInboxInto(vault, OWNER, session, new Date("2026-10-13T06:00:00Z"));
  const kept = statementsFileSchema.parse(stored.statements);
  check("only the person's own emails are opened, and a stranger's never", JSON.stringify(opened) === JSON.stringify([1, 2]), JSON.stringify(opened));
  check("each email is listed: a PDF without a key fails, a notice and a stranger's mail are set aside", first?.emails === 3 && first.failed === 1 && first.setAside === 2 && kept.documents.length === 3, JSON.stringify(first));
  check("every entry from the inbox says so", kept.documents.every((d) => d.via === "inbox"));
  check("a PDF that failed for want of a key is tried again; the others are not", kept.messages.length === 2);
  opened.length = 0;
  const second = await readInboxInto(vault, OWNER, session, new Date("2026-10-14T06:00:00Z"));
  check("the next run opens only the email that failed", JSON.stringify(opened) === JSON.stringify([1]) && second?.emails === 1, JSON.stringify(opened));
  check("someone with no mail in the inbox gets no line", (await readInboxInto(vault, "nobody@example.com", session, new Date())) === null);

  // Newsletters: their own address on the same inbox, read on the person's key into a digest, never the email.
  const news = newslettersAddressFor(INBOX, TAG);
  check("the newsletters address is the statements address with -news", news === `statements.desk+${TAG}-news@gmail.com` && newslettersAddressFor("not an address", TAG) === null);
  check("a newsletters address carries the tag, and is not a statements address", newsTagOf(news!, INBOX) === TAG && tagOf(news!, INBOX) === null && newsTagOf(mine, INBOX) === null);
  const letter = (id: string, from: string, mailfrom: string) => header([`Delivered-To: ${news}`, `Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=${mailfrom}`, `From: ${from}`, `Subject: Letter ${id}`, `Message-ID: <${id}@letters.example>`]);
  const ownForward = `firstlast+caf_=${news!.replace("@", "=")}@gmail.com`;
  const letterMessages = [
    { uid: 11, size: 1000, receivedAt: "2026-10-12T07:00:00.000Z", headers: letter("n1", "Harbour Rates Note <note@harbour.example>", ownForward) },
    { uid: 12, size: 1000, receivedAt: "2026-10-12T08:00:00.000Z", headers: letter("n2", "x@evil.example", "x@evil.example") },
    { uid: 13, size: 1000, receivedAt: "2026-10-12T09:00:00.000Z", headers: parseHeaders([`Delivered-To: ${news}`, `Authentication-Results: mx.google.com; dkim=pass header.i=@accounts.google.com; spf=pass smtp.mailfrom=3abc@forwarding.bounces.google.com`, `From: Gmail Team <forwarding-noreply@google.com>`, `Subject: (#555666777) Gmail Forwarding Confirmation - Receive Mail from first.last@gmail.com`].join("\r\n")) },
  ];
  check("a newsletter is for the tag on its newsletters address, never the statements reader's", newsletterTag(letterMessages[0].headers, INBOX) === TAG && messageTag(letterMessages[0].headers, INBOX) === null);
  const textOpened: number[] = [];
  const newsSession: InboxSession = { ...session, list: async () => [...messages, ...letterMessages], openText: async (uid) => (textOpened.push(uid), { subject: "Letter", from: "Harbour Rates Note <note@harbour.example>", text: "Rates ".repeat(100), html: "" }) };
  const confirmedLinks: string[] = [];
  const fwdSession: InboxSession = { ...session, list: async () => letterMessages, openText: async () => ({ subject: "Gmail Forwarding Confirmation", from: "forwarding-noreply@google.com", text: confirmText, html: "" }) };
  const fwd = await latestForwarding(OWNER, fwdSession, async (link) => (confirmedLinks.push(link), { confirmed: true, sentence: null }));
  check("Gmail's request for the newsletters address is found, its link followed once, and the code kept", fwd?.code === "555666777" && fwd.confirmed && fwd.link === confirmedLinks[0] && confirmedLinks.length === 1 && confirmedLinks[0].includes("/vf-"), JSON.stringify(fwd));
  const since = await latestForwarding(OWNER, fwdSession, async () => ({ confirmed: true, sentence: null }), "2026-10-13T00:00:00Z");
  check("a request older than asked for is left alone", since === null);
  const htmlSession: InboxSession = { ...fwdSession, openText: async () => ({ subject: "Gmail Forwarding Confirmation", from: "forwarding-noreply@google.com", text: "", html: confirmHtml }) };
  const fromHtml = await latestForwarding(OWNER, htmlSession, async (link) => ({ confirmed: link.includes("vf-%5BANGjdJ-html_DEF"), sentence: null }));
  check("a confirmation that is HTML alone is confirmed from its link", fromHtml?.confirmed === true && fromHtml.link?.includes("/vf-") === true, JSON.stringify(fromHtml));
  const bareSession: InboxSession = { ...fwdSession, openText: async () => ({ subject: "Gmail Forwarding Confirmation", from: "forwarding-noreply@google.com", text: "no link here", html: "" }) };
  const bare = await latestForwarding(OWNER, bareSession, async () => ({ confirmed: true, sentence: null }));
  check("a confirmation with no link the app can read says so, and is never confirmed", bare?.confirmed === false && bare.link === null && /no confirmation link/.test(bare.sentence ?? ""), JSON.stringify(bare));
  check("a cancel link is never followed", (await confirmForwarding("https://mail-settings.google.com/mail/uf-abc")).confirmed === false);
  // Google's page (18 Oct 2026): "Please confirm forwarding mail of a to b." with a Confirm button; the app presses it, and says Confirmed only on Google's words.
  const confirmPage = '<html><body><div>Please confirm forwarding mail of first.last@gmail.com to <b>x</b>.</div><form method="POST" action="/mail/vf-%5BANGjdJ-real%5D-tail?confirm=1"><input type="hidden" name="at" value="AF6bup"><input type="hidden" name="t" value="2"><input type="submit" value="Confirm"></form></body></html>';
  const successPage = "<html><body><h2>Confirmation Success!</h2><p>first.last@gmail.com may now automatically forward mail to x.</p></body></html>";
  const read = readConfirmPage(confirmPage, "https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail");
  check("Google's Confirm form is read: its action on google.com and its hidden fields", read.state === "form" && read.form?.action === "https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail?confirm=1" && JSON.stringify(read.form?.fields) === JSON.stringify({ at: "AF6bup", t: "2" }), JSON.stringify(read));
  check("Google's success page is confirmed, an expired one invalid, a page with neither is unknown", readConfirmPage(successPage, "https://mail.google.com/").state === "confirmed" && readConfirmPage("<p>This link is no longer valid.</p>", "https://mail.google.com/").state === "invalid" && readConfirmPage("<p>Gmail</p>", "https://mail.google.com/").state === "unknown");
  check("a form posting off google.com is not pressed", readConfirmPage(confirmPage.replace('action="/mail/', 'action="https://evil.example/'), "https://mail.google.com/").state === "unknown");
  const calls: { url: string; method: string; body?: string; cookie?: string }[] = [];
  const google = (answers: Record<string, string>): PageFetch => async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, cookie: init.headers?.cookie });
    const html = answers[init.method] ?? "";
    return { ok: true, status: 200, url, text: async () => html, setCookies: init.method === "GET" ? ["S=abc; Path=/; Secure", "N=1"] : [] };
  };
  const pressed = await confirmForwarding("https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail", google({ GET: confirmPage, POST: successPage }));
  check("the app presses Google's Confirm itself: one POST of the form's fields with the page's cookies, confirmed on the success page", pressed.confirmed && calls.length === 2 && calls[1].method === "POST" && calls[1].url.endsWith("?confirm=1") && calls[1].body === "at=AF6bup&t=2" && calls[1].cookie === "S=abc; N=1", JSON.stringify({ pressed, calls }));
  calls.length = 0;
  const notTaken = await confirmForwarding("https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail", google({ GET: confirmPage, POST: confirmPage }));
  check("when Google's answer to the press is not a confirmation, the person is asked for the click, never told it is confirmed", !notTaken.confirmed && notTaken.sentence === CLICK_SENTENCE, JSON.stringify(notTaken));
  const blank = await confirmForwarding("https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail", google({ GET: "<html><body>Gmail</body></html>" }));
  check("a page Google answers without confirming is not Confirmed (18 Oct 2026)", !blank.confirmed && blank.sentence === CLICK_SENTENCE, JSON.stringify(blank));
  const signIn = await confirmForwarding("https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail", async (url) => ({ ok: true, status: 200, url: "https://accounts.google.com/ServiceLogin?x=" + encodeURIComponent(url), text: async () => "", setCookies: [] }));
  check("a sign-in page is reported, not taken as confirmed", !signIn.confirmed && /sign-in/.test(signIn.sentence ?? ""));
  const already = await confirmForwarding("https://mail.google.com/mail/vf-%5BANGjdJ-real%5D-tail", google({ GET: "<p>This address has already been verified.</p>" }));
  check("Google's already-verified page counts as confirmed, and says it was already", already.confirmed && already.how === "already" && pressed.how === "pressed");
  // The confirmation kept (Hamza, 18 Oct 2026): once Google agreed, the vault's forwarding file says so, for each address, and the link is never opened again.
  check("a request's kind is the address it was sent to", forwardingKindOf(letterMessages[2].headers, INBOX, TAG) === "newsletters" && forwardingKindOf(confirmation, INBOX, TAG) === "statements" && forwardingKindOf(messages[3].headers, INBOX, TAG) === null);
  const bothSession: InboxSession = { ...session, list: async () => [...messages, ...letterMessages], openText: async () => ({ subject: "Gmail Forwarding Confirmation", from: "forwarding-noreply@google.com", text: confirmText, html: "" }) };
  const confirms: string[] = [];
  const spy: Confirm = async (link) => (confirms.push(link), { confirmed: true, sentence: null, how: "pressed" });
  const s1 = await confirmForwardingInto(vault, OWNER, bothSession, undefined, new Date("2026-10-13T06:00:00Z"), spy);
  const forwardingKept = forwardingFileSchema.parse(stored.forwarding);
  check(
    "both addresses' requests are confirmed once each and kept with their times, never a link or a code",
    s1.requests.length === 2 && confirms.length === 2 && forwardingKept.confirmations.length === 2 && !JSON.stringify(stored.forwarding).includes("vf-") && !JSON.stringify(stored.forwarding).includes("123456789") && confirmationOf(forwardingKept, "newsletters")?.requestedAt === "2026-10-12T09:00:00.000Z" && confirmationOf(forwardingKept, "statements")?.confirmedAt === "2026-10-13T06:00:00.000Z" && confirmationOf(forwardingKept, "statements")?.how === "pressed",
    JSON.stringify(stored.forwarding),
  );
  confirms.length = 0;
  const s2 = await confirmForwardingInto(vault, OWNER, bothSession, undefined, new Date("2026-10-14T06:00:00Z"), spy);
  check("a request already confirmed is reported from the record and Google's page is not opened again", confirms.length === 0 && s2.requests.length === 2 && s2.requests.every((r) => r.confirmed && r.link === null && r.how === "pressed") && confirmationOf(s2.file, "statements")?.confirmedAt === "2026-10-13T06:00:00.000Z", JSON.stringify(s2.requests));
  const newer = { uid: 14, size: 1000, receivedAt: "2026-10-15T09:00:00.000Z", headers: letterMessages[2].headers };
  const newerSession: InboxSession = { ...bothSession, list: async () => [...messages, ...letterMessages, newer] };
  const s3 = await confirmForwardingInto(vault, OWNER, newerSession, undefined, new Date("2026-10-15T10:00:00Z"), async () => ({ confirmed: false, sentence: CLICK_SENTENCE }));
  check("a newer request for the same address is confirmed anew; until Google agrees the earlier record stands and the other address keeps its own", s3.requests.find((r) => r.kind === "newsletters")?.confirmed === false && confirmationOf(s3.file, "newsletters")?.requestedAt === "2026-10-12T09:00:00.000Z" && s3.requests.find((r) => r.kind === "statements")?.confirmed === true, JSON.stringify(s3));
  const s4 = await confirmForwardingInto(vault, OWNER, newerSession, undefined, new Date("2026-10-15T11:00:00Z"), async () => ({ confirmed: true, sentence: null, how: "already" }));
  check("once Google agrees, the newer request replaces the record, with how it was confirmed", confirmationOf(s4.file, "newsletters")?.requestedAt === "2026-10-15T09:00:00.000Z" && confirmationOf(s4.file, "newsletters")?.how === "already" && s4.file.confirmations.length === 2);
  const rec = recordConfirmation(EMPTY_FORWARDING, { kind: "statements", forAddress: OWNER, requestedAt: "a", confirmedAt: "b", how: "pressed" });
  check("one record per kind, the kept one known by its request", recordConfirmation(rec, { kind: "statements", forAddress: OWNER, requestedAt: "c", confirmedAt: "d", how: "already" }).confirmations.length === 1 && alreadyConfirmed(confirmationOf(rec, "statements"), "a") && !alreadyConfirmed(confirmationOf(rec, "statements"), "c") && !alreadyConfirmed(null, "a"));
  check("a moment is shown in Athens time, the same on the server and in the browser", localMoment("2026-10-18T12:21:00Z") === "18 Oct, 15:21" && localMoment("not a date") === "not a date");
  {
    // The zone is the person's own, never one written in (Hamza, 28 Oct 2026).
    setZoneSource(() => "America/New_York");
    const ny = localMoment("2026-10-18T12:21:00Z") === "18 Oct, 08:21" && localDay(new Date("2026-10-18T02:00:00Z")) === "2026-10-17" && defaultSchedule().zone === "America/New_York" && /08:00 New York time/.test(scheduleWords(defaultSchedule()));
    setZoneSource(() => "not/a-zone");
    const bad = currentZone() === "UTC";
    setZoneSource(() => "Europe/Athens");
    check("a moment and a day are read in the zone the person's browser reports, a schedule starts on it, and a zone no one knows falls back to UTC", ny && bad && zonePlace("America/Los_Angeles") === "Los Angeles" && atUtcHour(6, "Europe/Athens").length === 5);
  }
  const newsRun = await readNewslettersInto(vault, OWNER, newsSession, new Date("2026-10-13T06:00:00Z"));
  const newsKept = newslettersFileSchema.parse(stored.newsletters);
  check("without a key a newsletter waits with a sentence and is never opened; a stranger's is set aside", newsRun?.emails === 2 && newsRun.failed === 1 && newsRun.setAside === 1 && textOpened.length === 0 && newsKept.digests.every((d) => d.reading === null && !!d.sentence), JSON.stringify(newsRun));
  check("the statements reader leaves newsletters alone", (stored.statements as { documents: unknown[] }).documents.length === kept.documents.length);
  check("a failed newsletter is tried again, a set-aside one is not", readKeys(newsKept).size === 1);
  {
    // An emailed statement that fails in a way a later run can mend is read again each morning, at most STATEMENT_MAX_TRIES times (the state machine audit, 11 Nov 2026).
    const doc: StatementDoc = { id: "00000000000000bb", name: "s.pdf", receivedAt: "2026-11-11T06:00:00Z", via: "inbox", status: "failed", sentence: "Not read: the model did not answer.", readFrom: "text", extraction: null, unchecked: [], confirmedAt: null };
    const at = (tries: number | undefined): StatementDoc => ({ ...doc, tries });
    check(`a statement that failed in a way a later run can mend is read again until it has failed ${STATEMENT_MAX_TRIES} times; one too large is not`, triesAfter(undefined) === 1 && triesAfter(at(2)) === 3 && triesAfter(at(undefined)) === 2 && triesAfter({ ...doc, status: "review" }) === 1 && readAgain(at(1)) && readAgain(at(undefined)) && !readAgain(at(STATEMENT_MAX_TRIES)) && !readAgain({ ...doc, sentence: "Not read: the PDF is over 4 MB." }) && !readAgain({ ...doc, status: "applied" }));
  }
  {
    // A newsletter the model cannot read is not paid for on every run (the state machine audit, 11 Nov 2026).
    const t0 = new Date("2026-11-11T08:00:00Z");
    const fail: Digest = { id: "00000000000000aa", sender: "S", subject: "s", receivedAt: t0.toISOString(), status: "failed", sentence: "Read, but what came back did not hold together; it is tried again on the next run.", reading: null };
    const one = withTries([fail], EMPTY_NEWSLETTERS, t0)[0];
    const after = (min: number) => new Date(t0.getTime() + min * 60_000);
    const fileOf = (d: Digest) => ({ ...EMPTY_NEWSLETTERS, digests: [d] });
    const two = withTries([fail], fileOf(one), after(NEWSLETTER_RETRY_MINUTES))[0];
    const three = withTries([fail], fileOf(two), after(2 * NEWSLETTER_RETRY_MINUTES))[0];
    check(`a failed newsletter waits ${NEWSLETTER_RETRY_MINUTES} minutes before the next read and is left after ${NEWSLETTER_MAX_TRIES}, saying so`, one.tries === 1 && readKeys(fileOf(one), after(5)).has(fail.id) && !readKeys(fileOf(one), after(NEWSLETTER_RETRY_MINUTES)).has(fail.id) && two.tries === 2 && three.tries === NEWSLETTER_MAX_TRIES && readKeys(fileOf(three), after(10 * NEWSLETTER_RETRY_MINUTES)).has(fail.id) && /not tried again/.test(three.sentence ?? "") && !/tried again on the next run/.test(three.sentence ?? ""), JSON.stringify(three));
    const noAi = withTries([{ ...fail, sentence: NEWSLETTER_NO_AI }], fileOf(two), t0)[0];
    check("a newsletter not read because no model is set up is not counted as a try, and one kept before the count is read as one try", noAi.tries === undefined && !readKeys(fileOf({ ...fail }), t0).has(fail.id) && withTries([fail], fileOf(fail), t0)[0].tries === 2);
  }
  check("someone with no newsletters gets no line", (await readNewslettersInto(vault, "nobody@example.com", newsSession, new Date())) === null);
  check("the sender is the display name, else the domain", senderOf('"Harbour Rates Note" <note@harbour.example>') === "Harbour Rates Note" && senderOf("digest@mail.silicon-ledger.example") === "Silicon-ledger" && senderOf("") === "Unknown sender");
  const cleaned = newsletterText("Read more https://t.example/abc?x=1\n\n\n\nRates\u200b held.");
  check("a newsletter's text loses its links and blank runs", cleaned.text === "Read more \n\nRates held." && !cleaned.cut, JSON.stringify(cleaned));
  check("a long newsletter is cut and says so", newsletterText("x".repeat(50_000)).cut);
  const nbody = newsletterRequestBody({ sender: "Harbour Rates Note", subject: "Rates", date: "2026-10-12", text: "Rates held.", cut: false, symbols: ["AAPL", "VOO"] }, "m") as { tools: { name: string }[]; system: string; messages: { content: { text: string }[] }[] };
  check("the request records one newsletter through one tool, and names the holdings", nbody.tools[0].name === "record_newsletter" && nbody.system.includes("AAPL, VOO") && nbody.messages[0].content[0].text.includes("Harbour Rates Note"));
  check("the request is text only, so an open model can make it", (toOpenAIRequest(nbody as unknown as ModelRequest, "m") as { messages: unknown[] }).messages.length >= 2);
  const reading = parseNewsletterResponse({ content: [{ type: "tool_use", name: "record_newsletter", input: { topic: "macro", summary: "Rates bind.", points: [{ headline: "Rates bind", line: "Multiples cannot expand.", symbols: ["voo", "MSFT"] }] } }] }, ["AAPL", "VOO"]);
  check("a symbol outside the holdings is dropped, the rest kept upper-case", reading.ok && JSON.stringify(reading.reading.points[0].symbols) === JSON.stringify(["VOO"]), JSON.stringify(reading));
  const pictured = parseNewsletterResponse({ content: [{ type: "tool_use", name: "record_newsletter", input: { topic: "macro", summary: "The day.", points: [{ headline: "Chips led", line: "NVDA rose.", symbols: [], images: [2, 0, 9] }, { headline: "Rates", line: "Yields fell.", symbols: [], images: [0, 1] }] } }] }, [], 3);
  check("the model places pictures by number under the points: out of range dropped, none twice, the reading marked placed", pictured.ok && pictured.reading.placed === true && pictured.reading.points[0].images?.join(",") === "2,0" && pictured.reading.points[1].images?.join(",") === "1", JSON.stringify(pictured.ok ? pictured.reading.points.map((p) => p.images) : null));
  const unpictured = parseNewsletterResponse({ content: [{ type: "tool_use", name: "record_newsletter", input: { topic: "macro", summary: "The day.", points: [{ headline: "Chips", line: "Up.", symbols: [], images: [0] }] } }] }, [], 0);
  check("a newsletter with no pictures places none and is not marked placed", unpictured.ok && !unpictured.reading.placed && !(unpictured.reading.points[0].images ?? []).length);
  const body = newsletterRequestBody({ sender: "a@x.example", subject: "Recap", date: "2026-10-19", text: "Words.", cut: false, symbols: [], images: [{ alt: "Chart", section: "Chips led" }] });
  check("the request lists the pictures by number with their words and asks to leave out ads", JSON.stringify(body).includes("0: Chart") && JSON.stringify(body).includes("Leave out advertisements"));
  {
    // A reading a little over the limits is clipped, never thrown away (Hamza, 23 Oct 2026: the day's recap was missed for one field).
    const long = "Chips sink while staples catch a bid as the market rotates hard into defensive names after a run of earnings misses";
    const over = parseNewsletterResponse({ content: [{ type: "tool_use", name: "record_newsletter", input: { topic: "markets", summary: "x".repeat(500), points: [{ headline: long, line: "y ".repeat(200), symbols: ["NVDA"], images: Array.from({ length: 30 }, (_, i) => i) }, ...Array.from({ length: 7 }, (_, i) => ({ headline: `Story ${i}`, line: "A line." }))] } }] }, ["NVDA"], 40);
    check("a reading over its limits is clipped to fit", over.ok && over.reading.points.length === 6 && over.reading.points[0].headline.length <= 100 && over.reading.summary.length <= 420 && (over.reading.points[0].images?.length ?? 0) === 24 && over.reading.topic === "other" && over.reading.points[1].line === "A line.");
    check("a point without its line keeps its headline", over.ok && over.reading.points[6 - 1].headline === "Story 4");
  }
  check("an answer in words is refused", !parseNewsletterResponse({ content: [{ type: "text", text: "It says rates." }] }, []).ok);
  const dg = (id: string, sender: string, at: string, symbols: string[][]): Digest => ({ id, sender, subject: "s", receivedAt: at, status: "read", sentence: null, reading: { topic: "macro", summary: "s", points: symbols.map((sy, i) => ({ headline: `${sender} ${i}`, line: "l", symbols: sy })) } });
  const filed = keepDigests(EMPTY_NEWSLETTERS, [dg("0000000000000001", "A", "2026-10-06T07:00:00Z", [["AAPL"]]), dg("0000000000000002", "B", "2026-10-08T07:00:00Z", [[], ["AAPL", "VOO"]]), dg("0000000000000003", "A", "2026-10-09T07:00:00Z", [[]]), dg("0000000000000004", "C", "2026-10-12T07:00:00Z", [["VOO"]]), dg("0000000000000005", "D", "2026-01-01T07:00:00Z", [[]])], new Date("2026-10-13T06:00:00Z"));
  check("digests older than the keep window are dropped, the newest first", filed.digests.length === 4 && filed.digests[0].id === "0000000000000004");
  const week = digestsIn(filed, "2026-10-02", "2026-10-09");
  check("a period takes what arrived after its start and by its end", week.length === 3);
  check("senders are counted, most first", JSON.stringify(bySender(week)) === JSON.stringify([{ sender: "A", count: 2 }, { sender: "B", count: 1 }]));
  check("the points that touch the most holdings come first", topPoints(week, 2).map((p) => p.headline).join("|") === "B 1|A 0", topPoints(week).map((p) => p.headline).join("|"));
  // The Gmail filter, written for the person: senders found by their Claude or pasted, decided in the app.
  const pasted = 'Stratechery <email@stratechery.com>, letters@Substack.com\n"Harbour Rates Note" <note@harbour.example> email@stratechery.com not-an-address';
  check("addresses are read out of From lines and lists, once each, lower-cased", JSON.stringify(sendersIn(pasted)) === JSON.stringify(["email@stratechery.com", "letters@substack.com", "note@harbour.example"]) && sendersIn("nothing here").length === 0);
  check("the filter is Gmail's own from:(a OR b), none with no sender", gmailFilter(["a@x.example", "B@y.example"]) === "from:(a@x.example OR b@y.example)" && gmailFilter([]) === null && gmailFilter(["junk"]) === null);
  check(
    "the one filter carries the recap's sender first, once, beside the kept senders",
    filterSenders(["a@x.example", "StockMKTNewz@mail.beehiiv.com"], ["stockmktnewz@mail.beehiiv.com"]).join(",") === "stockmktnewz@mail.beehiiv.com,a@x.example" && filterSenders([], ["stockmktnewz@mail.beehiiv.com"]).length === 1 && filterSenders(["a@x.example"], []).join(",") === "a@x.example",
  );
  check("Gmail's Create filter box opens with the From line filled, and the search shows what it catches", gmailFilterUrl(["a@x.example", "b@y.example"]) === "https://mail.google.com/mail/u/0/#create-filter/from=a%40x.example+OR+b%40y.example" && gmailSearchUrl("from:(a@x.example)") === "https://mail.google.com/mail/u/0/#search/from%3A(a%40x.example)" && gmailFilterUrl([]) === null);
  const prompt = finderPrompt();
  check("the prompt sends Claude to Gmail for the last month and to propose_newsletter_senders, and forbids changing Gmail", prompt.includes("last 30 days") && prompt.includes("propose_newsletter_senders") && prompt.includes("Do not create or change anything in Gmail") && prompt.includes("send nothing.") && !prompt.includes("forward"));
  const withAddress = finderPrompt("x+1-news@example.com");
  check("with the address, the prompt also forwards the last week's newsletters there, and nothing else is sent", withAddress.includes("last 7 days from those senders, once each, to x+1-news@example.com") && withAddress.includes("send nothing but those forwards"));
  const backfill = backfillPrompt("x+1-news@example.com", ["a@x.example", "b@y.example"]);
  check("the backfill prompt names the kept senders and the address; none without either", backfill?.includes("from a@x.example, b@y.example, once each, to x+1-news@example.com") === true && backfill.startsWith("Using my Gmail connector: forward") && backfillPrompt(null, ["a@x.example"]) === null && backfillPrompt("x+1-news@example.com", []) === null, backfill ?? "null");
  check("the steps end in Gmail with Forward it to the person's address", filterSteps("x+1-news@example.com").length === 5 && filterSteps("x+1-news@example.com")[2].includes("x+1-news@example.com") && filterSteps(null)[2].includes("Newsletters card on Setup"));
  const found = [{ address: "Note <note@harbour.example>", name: "Harbour Rates Note", cadence: "every weekday" }, { address: "digest@silicon-ledger.example" }, { address: "junk" }];
  const p1 = proposeSenders(EMPTY_SENDERS, found, "2026-10-12T07:00:00.000Z");
  check("Claude's findings land as proposals, an entry with no address dropped", p1.added === 2 && proposedSenders(p1.file).length === 2 && keptSenders(p1.file).length === 0 && p1.file.senders[0].address === "note@harbour.example" && p1.file.senders[0].from === "claude" && p1.file.proposedAt === "2026-10-12T07:00:00.000Z");
  const d1 = decideSender(decideSender(p1.file, "note@harbour.example", "kept", "2026-10-12T08:00:00.000Z"), "digest@silicon-ledger.example", "removed", "2026-10-12T08:00:00.000Z");
  check("the person keeps one and removes one", keptSenders(d1).map((x) => x.address).join() === "note@harbour.example" && proposedSenders(d1).length === 0 && d1.senders[1].status === "removed");
  const p2 = proposeSenders(d1, [...found, { address: "new@letters.example", name: "New Letters" }], "2026-10-19T07:00:00.000Z");
  check("proposed again: a kept sender stays kept, a removed one stays removed and is not asked again, a new one is proposed", p2.added === 1 && p2.keptBefore === 1 && p2.removedBefore === 1 && proposedSenders(p2.file).map((x) => x.address).join() === "new@letters.example" && p2.file.senders[1].status === "removed");
  const a1 = addSenders(p2.file, 'Stratechery <email@stratechery.com>\ndigest@silicon-ledger.example', "2026-10-19T08:00:00.000Z");
  check("senders the person adds are kept at once, with the name from the From line; adding a removed one keeps it again", a1.added === 2 && keptSenders(a1.file).map((x) => x.address).sort().join() === "digest@silicon-ledger.example,email@stratechery.com,note@harbour.example" && a1.file.senders.find((x) => x.address === "email@stratechery.com")?.name === "Stratechery" && a1.file.senders.find((x) => x.address === "email@stratechery.com")?.from === "you");
  const again = decideSender(a1.file, "note@harbour.example", "removed", "2026-10-20T08:00:00.000Z");
  const back = decideSender(again, "digest@silicon-ledger.example", "kept", "2026-10-20T09:00:00.000Z");
  check("after the first filter a kept sender can be removed and a removed one kept again", removedSenders(again).map((x) => x.address).join() === "note@harbour.example" && keptSenders(back).map((x) => x.address).sort().join() === "digest@silicon-ledger.example,email@stratechery.com" && filterSteps(null)[4].includes("Filters and Blocked Addresses"));
  const viaDigest = (id: string, via: "filter" | "hand" | undefined, at: string, status: Digest["status"] = "read"): Digest => ({ id, sender: "A", subject: "s", receivedAt: at, status, sentence: status === "read" ? null : "x", reading: null, via });
  const proof = forwardingProof({ version: 1, updated: "", digests: [viaDigest("0000000000000011", "filter", "2026-10-19T07:00:00Z"), viaDigest("0000000000000012", "filter", "2026-10-20T07:00:00Z", "failed"), viaDigest("0000000000000013", "hand", "2026-10-18T13:00:00Z"), viaDigest("0000000000000014", undefined, "2026-10-17T07:00:00Z"), viaDigest("0000000000000015", "filter", "2026-10-21T07:00:00Z", "set_aside")] });
  check("the proof counts what the filter forwarded and what came by hand, a stranger's for nothing, an older digest as the filter's", JSON.stringify(proof) === JSON.stringify({ byFilter: 3, byHand: 1, firstFilterAt: "2026-10-17T07:00:00Z", lastFilterAt: "2026-10-20T07:00:00Z", lastHandAt: "2026-10-18T13:00:00Z", read: 3, failed: 1 }), JSON.stringify(proof));
  check("a digest kept before the field reads as before, and with it", newslettersFileSchema.parse({ version: 1, updated: "", digests: [viaDigest("0000000000000016", undefined, "2026-10-17T07:00:00Z")] }).digests[0].via === undefined && newslettersFileSchema.parse({ version: 1, updated: "", digests: [viaDigest("0000000000000017", "hand", "2026-10-17T07:00:00Z")] }).digests[0].via === "hand");
  // The pictures (Hamza, 18 Oct 2026): the newsletter's own, by address; trackers, icons and logos left out; the email never kept.
  const pics = newsletterImages(
    `<img src="https://email.example.com/o/eJwUy0" width="1" height="1" alt=""><img src="https://media.example.com/cdn-cgi/image/fit=scale-down/uploads/a.png" alt="S&amp;P 500 closes at a record" width="100%"><img src='https://media.example.com/uploads/b.jpg' style="width: 560px; height:auto"><img src="https://cdn.example.com/logos/x.png" width="40" height="40"><img src="https://cdn.example.com/brand.png" alt="Ledger logo"><img src="data:image/gif;base64,R0lGOD"><img src="https://media.example.com/uploads/b.jpg"><img src="http://plain.example.com/c.png"><img src="https://img.example.com/chart.png?w=800&amp;utm_source=mail" alt="Chart">${"<img src=\"https://many.example.com/p" + Array.from({ length: 20 }, (_, i) => `${i}.png\"><img src=\"https://many.example.com/p`).join("")}z.png">`,
  );
  check("a newsletter's pictures are read from its HTML: https alone, each once, no pixel, icon, logo or data image, the alt decoded", pics.length === 24 && pics[0].url.endsWith("/uploads/a.png") && pics[0].alt === "S&P 500 closes at a record" && pics[1].url.endsWith("/uploads/b.jpg") && pics[1].alt === null && pics[2].url.includes("chart.png?w=800&utm_source=mail") && !pics.some((i) => /\/o\/|logos|brand|data:|^http:/.test(i.url)), JSON.stringify(pics.slice(0, 3)));
  check("a digest keeps its pictures, one kept before reads without them, and a picture off https is refused", newslettersFileSchema.parse({ version: 1, updated: "", digests: [{ ...viaDigest("0000000000000018", "filter", "2026-10-17T07:00:00Z"), images: pics }] }).digests[0].images?.length === 24 && newslettersFileSchema.parse({ version: 1, updated: "", digests: [viaDigest("0000000000000019", "filter", "2026-10-17T07:00:00Z")] }).digests[0].images === undefined && !newslettersFileSchema.safeParse({ version: 1, updated: "", digests: [{ ...viaDigest("0000000000000020", "filter", "2026-10-17T07:00:00Z"), images: [{ url: "http://x.example/a.png", alt: null }] }] }).success && newslettersFileSchema.safeParse({ version: 1, updated: "", digests: [{ ...viaDigest("0000000000000021", "filter", "2026-10-17T07:00:00Z"), images: [{ url: "/samples/newsletter-session.svg", alt: null }] }] }).success);
  check("at most MAX_IMAGES pictures are kept", newsletterImages(Array.from({ length: MAX_IMAGES + 5 }, (_, i) => `<img src="https://many.example.com/q${i}.png">`).join("")).length === MAX_IMAGES);
  // The words before each picture (Hamza, 18 Oct 2026): a daily recap's opening performance pictures are told from its stories by the newsletter's own headings.
  const recapHtml = `<html><head><style>p{}</style></head><body><table><tr><td><p>September 24, 2026 | <a href="https://x">Read online</a></p></td></tr><tr><td><h1>NEW META GLASSES</h1><p>StockMKTNewz Daily Recap 9/24</p><img src="https://cdn.example.com/header.png" alt=""></td></tr><tr><td><p>Here&rsquo;s a quick recap of how the stock market performed today</p></td></tr><tr><td><p><strong>Heat Map of the S&amp;P 500</strong></p><img src="https://cdn.example.com/heat.png" alt=""></td></tr><tr><td><p>Here's how the major <b>United States</b> indices performed today</p><img src="https://cdn.example.com/idx.png"></td></tr><tr><td><p>Here are the Best and Worst Performing S&amp;P 500 Stocks from today</p><img src="https://cdn.example.com/best.png"></td></tr><tr><td><h2>The Daily Recap</h2><p>Here are the biggest news stories from the stock market today</p></td></tr><tr><td><img src="https://cdn.example.com/t1.png"></td></tr><tr><td><img src="https://cdn.example.com/t2.png"></td></tr><tr><td><h2>Get Ready For Tomorrow</h2><p>Earnings Hub:</p><img src="https://cdn.example.com/eh.png"></td></tr><tr><td><h1>SOME NEW YOUTUBE VIDEOS YOU NEED TO WATCH</h1></td></tr><tr><td><a href="https://youtu.be/x"><img width="20%" alt="" src="https://cdn.example.com/static_assets/youtube_play_icon.png"><img src="https://cdn.example.com/yt1.jpg"></a><p>Why Wall Street Still Needs Human Brokers in an AI World</p><a href="https://youtu.be/y"><img src="https://cdn.example.com/yt2.jpg"></a></td></tr></table></body></html>`;
  const recapPics = newsletterImages(recapHtml);
  check("each picture carries the newsletter's words before it, entities decoded, inline tags joined; a play icon is no picture", recapPics.length === 9 && !recapPics.some((x) => x.url.includes("play_icon")) && recapPics[7].section === "SOME NEW YOUTUBE VIDEOS YOU NEED TO WATCH" && recapPics[8].section === "Why Wall Street Still Needs Human Brokers in an AI World" && recapPics[1].section === "Heat Map of the S&P 500" && recapPics[2].section === "Here's how the major United States indices performed today" && recapPics[4].section === "Here are the biggest news stories from the stock market today" && recapPics[5].section === recapPics[4].section && recapPics[6].section === "Earnings Hub:", JSON.stringify(recapPics.map((x) => x.section)));
  const parts = recapParts(recapPics);
  check("a recap's pictures split where its stories begin: the header, heat map, indices and movers lead, the stories and what follows stay, the videos to watch and everything after them are left out (Hamza, 19 Oct 2026)", parts.lead.map((x) => x.url.split("/").pop()).join(",") === "header.png,heat.png,idx.png,best.png" && parts.stories.map((x) => x.url.split("/").pop()).join(",") === "t1.png,t2.png,eh.png", JSON.stringify(parts));
  {
    // Hamza, 23 Oct 2026: the recap showed only the pictures its points carried; the issue's other story pictures follow them.
    const stories = parts.stories;
    const at = (im: (typeof stories)[number]) => recapPics.indexOf(im);
    const rest = unplacedStories(recapPics, [{ images: [at(stories[0])] }, { images: [] }]);
    check("a recap's story pictures no point carries are kept for after its points, in order, the performance and videos still left out", rest.length === stories.length - 1 && rest[0] === stories[1] && !rest.some((im) => parts.lead.includes(im)) && unplacedStories(undefined, []).length === 0);
  }
  check("the videos are left out of a recap with no stories heading too", recapParts(recapPics.slice(4)).stories.map((x) => x.url.split("/").pop()).join(",") === "t1.png,t2.png,eh.png" && recapParts(recapPics.slice(7)).stories.length === 0);
  check("pictures with no marking words are all stories, grouped by their words", recapParts(pics).lead.length === 0 && recapParts(undefined).stories.length === 0 && pictureGroups(parts.stories).map((g) => `${g.section?.slice(0, 8)}:${g.images.length}`).join("|") === "Here are:2|Earnings:1");
  check("a picture kept before the sections reads without one", newslettersFileSchema.parse({ version: 1, updated: "", digests: [{ ...viaDigest("0000000000000022", "filter", "2026-10-17T07:00:00Z"), images: [{ url: "https://x.example/a.png", alt: null }] }] }).digests[0].images?.[0].section === undefined);
  // The newsletter's own date (Hamza, 18 Oct 2026: forwarded on the Sunday, the Friday recap was dated Sunday and fell outside the review's week).
  const fwdText = "---------- Forwarded message ---------\nFrom: Evan from StockMKTNewz <stockmktnewz@mail.beehiiv.com>\nDate: Fri, Oct 16, 2026 at 1:04 AM\nSubject: NEW META GLASSES\nTo: <me@example.com>\n\nbody";
  check("a hand forward is dated by the forwarded header's Date line", newsletterDate(fwdText, "2026-10-18T12:00:00Z", "2026-10-18T12:00:00.000Z") === "2026-10-16T01:04:00.000Z");
  check("a filter forward is dated by the email's own Date header", newsletterDate("plain body", "Thu, 15 Oct 2026 22:04:11 +0000", "2026-10-18T12:00:00.000Z") === "2026-10-15T22:04:11.000Z");
  check("a date that does not read, lies in the future or is too old falls back to the arrival", newsletterDate("plain", "garbage", "2026-10-18T12:00:00.000Z") === "2026-10-18T12:00:00.000Z" && newsletterDate("plain", "2026-12-01T00:00:00Z", "2026-10-18T12:00:00.000Z") === "2026-10-18T12:00:00.000Z" && newsletterDate("---------- Forwarded message ---------\nDate: Fri, Oct 16, 2020 at 1:04 AM\n", null, "2026-10-18T12:00:00.000Z") === "2026-10-18T12:00:00.000Z");
  // Hamza, 18 Oct 2026: their Claude forwarded 55 issues on a Sunday with no Date line the app could read, so every digest read as Sunday's and the weekly found none in its week.
  const masthead = "---------- Forwarded message ---------\nFrom: Evan <evan@mail.beehiiv.com>\nSubject: NEW META GLASSES\nTo: me\n\nStockMKTNewz Daily Recap\nOctober 15, 2026\n\nThe market fell.";
  check("a forward without a Date line is dated by the masthead date the newsletter prints", newsletterDated(masthead, "2026-10-18T12:00:00Z", "2026-10-18T12:00:00.000Z").date === "2026-10-15T12:00:00.000Z" && newsletterDated(masthead, "2026-10-18T12:00:00Z", "2026-10-18T12:00:00.000Z").from === "printed");
  check("the printed date reads in either order, with an ordinal, only near the top, and never one in the future", printedDate("Wednesday, 15th October 2026 · issue") === Date.UTC(2026, 9, 15, 12) && printedDate("Sep 3, 2026") === Date.UTC(2026, 8, 3, 12) && printedDate(`${"x".repeat(1600)} October 15, 2026`) === null && newsletterDated("Forwarded message\nFrom: a\n\nDecember 1, 2026 preview", null, "2026-10-18T12:00:00.000Z").from === "arrival");
  check("a Date line wins over the masthead, a filter forward's own header over both, and each says where it came from", newsletterDated(fwdText, "2026-10-18T12:00:00Z", "2026-10-18T12:00:00.000Z").from === "forward" && newsletterDated("plain body", "Thu, 15 Oct 2026 22:04:11 +0000", "2026-10-18T12:00:00.000Z").from === "header" && newsletterDated("plain", null, "2026-10-18T12:00:00.000Z").from === "arrival");
  const arrivalDated: Digest = { ...viaDigest("0000000000000030", "hand", "2026-10-18T12:00:00.000Z"), date: "2026-10-18T12:00:00.000Z", reading: { topic: "macro", summary: "s", points: [] } };
  const legacy: Digest = { ...viaDigest("0000000000000031", "hand", "2026-10-18T12:00:00.000Z"), reading: { topic: "macro", summary: "s", points: [] } };
  const triedAlready: Digest = { ...arrivalDated, id: "0000000000000032", dateFrom: "arrival" };
  const properly: Digest = { ...arrivalDated, id: "0000000000000033", date: "2026-10-15T12:00:00.000Z" };
  check("digests dated by their arrival alone, or kept before the date was read, are the ones dated again; one already placed, or already tried, is not", undatedDigests({ version: 1, updated: "", digests: [arrivalDated, legacy, triedAlready, properly] }).map((d) => d.id.slice(-2)).join() === "30,31");
  const redated = redateDigest(legacy, masthead, "2026-10-18T12:00:00Z");
  check("dating again reads the email once and marks where the date came from; an email gone from the inbox is marked as dated by its arrival", redated.date === "2026-10-15T12:00:00.000Z" && redated.dateFrom === "printed" && redateDigest(legacy, null, null).dateFrom === "arrival" && redateDigest(legacy, null, null).date === legacy.receivedAt && undatedDigests({ version: 1, updated: "", digests: [redateDigest(legacy, null, null)] }).length === 0);
  const dated: Digest = { ...viaDigest("0000000000000023", "hand", "2026-10-18T12:00:00.000Z"), date: "2026-10-16T01:04:00.000Z", reading: { topic: "macro", summary: "s", points: [] } };
  check("a digest is dated by its own date, else its arrival, and a review's week counts it by that date", digestDate(dated) === "2026-10-16T01:04:00.000Z" && digestDate(viaDigest("0000000000000024", "filter", "2026-10-18T12:00:00.000Z")) === "2026-10-18T12:00:00.000Z" && digestsIn({ version: 1, updated: "", digests: [dated] }, "2026-10-09", "2026-10-16").length === 1 && digestsIn({ version: 1, updated: "", digests: [dated] }, "2026-10-16", "2026-10-23").length === 0);
  const weekIn = [dated, { ...dated, id: "0000000000000025", date: "2026-10-10T20:00:00.000Z" }, { ...dated, id: "0000000000000026", date: "2026-10-17T20:00:00.000Z" }, { ...dated, id: "0000000000000027", date: "2026-10-17T21:00:00.000Z", status: "failed" as const, reading: null }];
  check("the Dashboard's week is the last seven days by the newsletter's date, newest first, a failed read left out", digestsOfWeek(weekIn, "2026-10-18").map((d) => d.id.slice(-2)).join(",") === "26,23", digestsOfWeek(weekIn, "2026-10-18").map((d) => d.id).join());
  check("a daily recap is known by its sender or subject", isRecapDigest({ sender: "Evan from StockMKTNewz", subject: "NEW META GLASSES" }) && isRecapDigest({ sender: "Closing Bell Recap", subject: "x" }) && isRecapDigest({ sender: "Harbour", subject: "Daily Recap 9/24" }) && !isRecapDigest({ sender: "Harbour Rates Note", subject: "Rates this week" }));
  check("unread is what was not opened; opening keeps the id once, the last 600", unreadOf(weekIn, ["0000000000000023"]).map((d) => d.id.slice(-2)).join() === "25,26,27" && withRead(["a"], "b").join() === "a,b" && withRead(["a", "b"], "b").join() === "a,b" && withRead(Array.from({ length: 600 }, (_, i) => `i${i}`), "z").length === 600 && withRead(Array.from({ length: 600 }, (_, i) => `i${i}`), "z")[599] === "z");
  // The Dashboard's view (Hamza, 18 Oct 2026): each newsletter under its theme, ranked by the theses and the share of the book it touches; themes by their best newsletter.
  const withPoints = (id: string, at: string, topic: "holdings" | "macro" | "tech" | "geopolitics" | "other", symbols: string[][]): Digest => ({ ...viaDigest(id, "filter", at), reading: { topic, summary: "s", points: symbols.map((sy, i) => ({ headline: `h${i}`, line: "l", symbols: sy })) } });
  const rankedIn = [
    withPoints("0000000000000031", "2026-10-17T21:00:00Z", "macro", [[], []]),
    withPoints("0000000000000032", "2026-10-17T21:10:00Z", "tech", [["GOOGL"], ["AMZN", "GOOGL"]]),
    withPoints("0000000000000033", "2026-10-17T20:50:00Z", "holdings", [["MA"], ["BKNG"]]),
    withPoints("0000000000000034", "2026-10-17T21:20:00Z", "holdings", [["UBER"]]),
    { ...viaDigest("0000000000000035", "filter", "2026-10-17T21:30:00Z"), status: "failed" as const, reading: null, sentence: "x" },
  ];
  const weightsIn = { MA: 12, BKNG: 6, GOOGL: 9, AMZN: 8, UBER: 5 };
  const ranked = rankDigests(rankedIn, weightsIn, new Set(["ma"]));
  const tied = rankDigests([withPoints("0000000000000036", "2026-10-15T21:00:00Z", "macro", [["UBER"], ["UBER"]]), withPoints("0000000000000037", "2026-10-16T21:00:00Z", "macro", [["UBER"]])], weightsIn, new Set());
  check("two newsletters as close to the theses and the book rank the newest first (Hamza, 18 Oct 2026), points on holdings after", tied.map((r) => r.digest.id.slice(-2)).join(",") === "37,36", tied.map((r) => `${r.digest.id.slice(-2)}:${r.score}`).join(","));
  check("a newsletter touching a holding with a thesis ranks first, then by the share of the book touched; a failed one is left out", ranked.map((r) => r.digest.id.slice(-2)).join(",") === "33,32,34,31" && ranked[0].touched.join(",") === "MA,BKNG" && ranked[0].share === 18 && ranked[0].theses === 1 && ranked[1].touched.join(",") === "GOOGL,AMZN" && ranked[1].share === 17 && ranked[1].theses === 0 && ranked[3].touched.length === 0, ranked.map((r) => `${r.digest.id.slice(-2)}:${r.score}`).join(","));
  const themes = byTheme(ranked, weightsIn, new Set(["MA"]));
  check("themes follow their best newsletter, hold their newsletters in rank order and count each holding once", themes.map((t) => t.topic).join(",") === "holdings,tech,macro" && themes[0].digests.map((r) => r.digest.id.slice(-2)).join(",") === "33,34" && themes[0].touched.join(",") === "MA,BKNG,UBER" && themes[0].share === 23 && themes[0].theses === 1 && themes[0].label === "Your holdings" && themes[2].touched.length === 0, themes.map((t) => `${t.topic}:${t.share}`).join(","));
  // The recap to show (Hamza, 18 Oct 2026): on a weekend, Friday's; the weekend issues carry no pictures.
  const issueAt = (id: string, iso: string, subject = "Daily Recap"): Digest => ({ ...viaDigest(id, "filter", iso), subject, date: iso });
  check("a moment's weekday is read in New York: Friday 22:30 New York is still Friday, Saturday is a weekend issue", newYorkWeekday("2026-10-17T02:30:00Z") === 5 && newYorkWeekday("2026-10-17T21:30:00Z") === 6 && !isWeekendIssue(issueAt("0000000000000041", "2026-10-17T02:30:00Z")) && isWeekendIssue(issueAt("0000000000000042", "2026-10-17T21:30:00Z")) && isWeekendIssue(issueAt("0000000000000043", "2026-10-18T15:00:00Z")));
  const weekRecaps = [issueAt("0000000000000044", "2026-10-18T15:00:00Z"), issueAt("0000000000000045", "2026-10-17T21:30:00Z"), issueAt("0000000000000046", "2026-10-16T21:30:00Z"), issueAt("0000000000000047", "2026-10-15T21:30:00Z")];
  const shown = recapToShow(weekRecaps);
  check("the recap shown is the newest written on a weekday, so a weekend shows Friday's; the weekend issues go under it", shown.lead?.id === "0000000000000046" && shown.earlier.map((d) => d.id.slice(-2)).join(",") === "44,45,47" && recapToShow(weekRecaps.slice(0, 2)).lead === null && recapToShow([]).lead === null);
  check("a day is known as a weekend by the person's own calendar", isWeekendDay("2026-10-17") && isWeekendDay("2026-10-18") && !isWeekendDay("2026-10-16"));

  // The shared recap (Hamza, 18 Oct 2026): the app's own inbox subscribes once, every vault gets a digest on its own key.
  const sharedIssue: SharedIssue = { id: "00000000000000a1", sender: "Evan from StockMKTNewz", subject: "NEW META GLASSES", date: "2026-10-16T21:31:00.000Z", receivedAt: "2026-10-16T21:31:40.000Z", text: "The biggest stories of the day. ".repeat(20), cut: false, images: [{ url: "https://x.example/a.png", alt: null, section: "Here are the biggest news stories" }] };
  check("a shared read keeps the week's issues under the session it was read for", sharedRecapsSchema.safeParse({ version: 1, session: "2026-10-16", issues: [sharedIssue], readAt: "2026-10-16T22:35:00Z" }).success && !sharedRecapsSchema.safeParse({ version: 1, session: "2026-10-16", issues: [{ ...sharedIssue, text: "x".repeat(40_001) }], readAt: "" }).success);
  const ownCopy = issueAt("00000000000000a2", "2026-10-16T21:31:00.000Z", "Fwd: NEW META GLASSES");
  check("the same issue is known by its subject and its New York day, however it came", sameIssue(sharedIssue, ownCopy) && !sameIssue(sharedIssue, issueAt("00000000000000a3", "2026-10-15T21:31:00.000Z", "NEW META GLASSES")) && !sameIssue(sharedIssue, issueAt("00000000000000a4", "2026-10-16T21:31:00.000Z", "Other")));
  const noModel = sharedDigest(sharedIssue, null);
  const withModel = sharedDigest(sharedIssue, { topic: "macro", summary: "The day.", points: [], placed: true });
  const unplaced = sharedDigest(sharedIssue, { topic: "macro", summary: "The day.", points: [] });
  check("a shared digest without a model keeps the pictures and a sentence; with one, the model's reading; both marked as coming with the app", noModel.status === "read" && noModel.via === "shared" && noModel.sentence === SHARED_NO_MODEL && noModel.images?.length === 1 && noModel.reading?.points.length === 0 && withModel.sentence === null && withModel.reading?.summary === "The day." && newslettersFileSchema.safeParse({ version: 1, updated: "", digests: [noModel, withModel] }).success);
  check("the issues a vault lacks are laid; one kept by id is not, unless read without a model and a model exists now; the person's own forward of the issue wins", issuesToLay([sharedIssue], [], false).length === 1 && issuesToLay([sharedIssue], [withModel], true).length === 0 && issuesToLay([sharedIssue], [noModel], false).length === 0 && issuesToLay([sharedIssue], [noModel], true).length === 1 && issuesToLay([sharedIssue], [ownCopy], true).length === 0 && issuesToLay([sharedIssue], [{ ...ownCopy, status: "failed" }], true).length === 1);
  check("a shared digest read before its pictures were placed is read again once, on a model; one placed is not", issuesToLay([sharedIssue], [unplaced], true).length === 1 && issuesToLay([sharedIssue], [unplaced], false).length === 0 && issuesToLay([sharedIssue], [withModel], true).length === 0);
  check("a forward that twins a shared digest already kept is not kept twice; another newsletter is", withoutSharedTwins([ownCopy, issueAt("00000000000000a5", "2026-10-16T20:00:00.000Z", "Rates note")], [withModel]).map((d) => d.id.slice(-2)).join(",") === "a5" && withoutSharedTwins([ownCopy], []).length === 1);
  check("the shared issues are nobody's forward on Is it working", forwardingProof({ version: 1, updated: "", digests: [withModel, ownCopy] }).byFilter === 1);
  const sharedMail = parseHeaders(["Delivered-To: statements@x.com", "Authentication-Results: mx.google.com; dkim=pass header.i=@mail.beehiiv.com header.s=k1 header.b=abc; spf=pass (google.com: domain of bounce@mail.beehiiv.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@mail.beehiiv.com; dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=mail.beehiiv.com", "From: Evan from StockMKTNewz <stockmktnewz@mail.beehiiv.com>", "To: statements@x.com", "Subject: NEW META GLASSES"].join("\n"));
  const senders = ["stockmktnewz@mail.beehiiv.com"];
  check("the shared recap is the known sender's email to the inbox itself, proven by the receiving server", authenticatedFrom(sharedMail) === "stockmktnewz@mail.beehiiv.com" && sharedRecapSender(sharedMail, "statements@x.com", senders) === "stockmktnewz@mail.beehiiv.com");
  const forwardedCopy = parseHeaders(["Delivered-To: statements+1a2b3c4d-news@x.com", "Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=hamza+caf_=statements+1a2b3c4d-news=x.com@gmail.com; dkim=pass header.i=@mail.beehiiv.com", "From: Evan from StockMKTNewz <stockmktnewz@mail.beehiiv.com>", "To: hamza@gmail.com"].join("\n"));
  const spoof = parseHeaders(["Delivered-To: statements@x.com", "Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=someone@evil.example; dkim=none; dmarc=fail header.from=mail.beehiiv.com", "From: Evan from StockMKTNewz <stockmktnewz@mail.beehiiv.com>", "To: statements@x.com"].join("\n"));
  const otherMail = parseHeaders(["Delivered-To: statements@x.com", "Authentication-Results: mx.google.com; dkim=pass header.d=other.example; dmarc=pass header.from=other.example", "From: Other <news@other.example>", "To: statements@x.com"].join("\n"));
  check("a person's forward of the same newsletter stays theirs, a spoof of the sender is nobody's, and another sender is not the shared recap", sharedRecapSender(forwardedCopy, "statements@x.com", senders) === null && authenticatedFrom(spoof) === null && sharedRecapSender(spoof, "statements@x.com", senders) === null && authenticatedFrom(otherMail) === "news@other.example" && sharedRecapSender(otherMail, "statements@x.com", senders) === null);

  // Hamza, 20 Oct 2026: one subscription never stands for everyone's.
  const subscribedMail = parseHeaders(["Delivered-To: statements+1a2b3c4d-news@x.com", "Authentication-Results: mx.google.com; dkim=pass header.i=@mail.beehiiv.com; dmarc=pass header.from=mail.beehiiv.com", "From: Evan from StockMKTNewz <stockmktnewz@mail.beehiiv.com>", "To: statements+1a2b3c4d-news@x.com"].join("\n"));
  check("a recap the person subscribed with their own newsletters address is theirs, proven by the receiving server; a spoof or another sender is not", subscribedRecapSender(subscribedMail, senders) === "stockmktnewz@mail.beehiiv.com" && subscribedRecapSender(spoof, senders) === null && subscribedRecapSender(otherMail, senders) === null && newsletterTag(subscribedMail, "statements@x.com") === "1a2b3c4d");
  check("the shared copy goes only to the addresses SHARED_RECAP_TO names", sharedRecapFor("Hamza@Gmail.com", "hamza@gmail.com, op@x.com") && !sharedRecapFor("dani@x.com", "hamza@gmail.com") && !sharedRecapFor("hamza@gmail.com", undefined) && !sharedRecapFor("", ""));
  check("a subscribed recap is not a filter's forward on Is it working", forwardingProof({ version: 1, updated: "", digests: [{ ...ownCopy, via: "subscribed" }] }).byFilter === 0);

  check("the morning line for newsletters", newslettersSentence({ emails: 3, read: 2, failed: 1, setAside: 0 }) === "3 new newsletters: 2 read, 1 not read." && newslettersSentence({ emails: 0, read: 0, failed: 0, setAside: 0 }) === "No new newsletters.");

  // Podcasts (Hamza, 20 Oct 2026): a show on podscripts.co, its episodes, a transcript, and a write-up on the person's model.
  {
    const allIn = DEFAULT_SHOWS[0]!;
    check("All-In is followed by default", EMPTY_PODCASTS.shows.length === 1 && allIn.slug === "all-in-with-chamath-jason-sacks-friedberg");
    check("a show's slug from its address, an episode's or the slug", showSlugOf("https://podscripts.co/podcasts/all-in-with-chamath-jason-sacks-friedberg") === allIn.slug && showSlugOf("podscripts.co/podcasts/all-in-with-chamath-jason-sacks-friedberg/some-episode") === allIn.slug && showSlugOf("  The-Prof-G-Pod  ") === "the-prof-g-pod" && showSlugOf("https://example.com/x y") === null);
    check("an episode's date in podscripts' words", episodeDay("October 15, 2026") === "2026-10-15" && episodeDay("Episode 12, 2026") === null && episodeDay("Sept. 3 2026") === "2026-09-03" && episodeDay("Sep 3, 2026") === "2026-09-03");
    const showHtml = `<html><head><title>All-In with Chamath, Jason, Sacks &amp; Friedberg Transcripts - Podscripts</title></head><body><h1>All-In with Chamath, Jason, Sacks &amp; Friedberg</h1>
      <div><a href="/podcasts/all-in-with-chamath-jason-sacks-friedberg/rates-chips-and-the-midterms">Rates, chips and the midterms</a><a href="/podcasts/all-in-with-chamath-jason-sacks-friedberg/rates-chips-and-the-midterms">3 comments</a><span>Episode Date: October 15, 2026</span></div>
      <div><a href="https://podscripts.co/podcasts/all-in-with-chamath-jason-sacks-friedberg/ai-capex">AI capex</a><span>Episode Date: <b>October 10, 2026</b></span></div>
      <a href="/podcasts/another-show/elsewhere">Not this show</a></body></html>`;
    const listed = parseShowPage(showHtml, allIn.slug);
    check("a show's page lists its episodes with their dates, not another show's", listed.length === 2 && listed[0]!.slug === "rates-chips-and-the-midterms" && listed[0]!.title === "Rates, chips and the midterms" && listed[0]!.date === "2026-10-15" && listed[1]!.date === "2026-10-10", JSON.stringify(listed));
    check("the show's title from its heading", showTitleOf(showHtml) === "All-In with Chamath, Jason, Sacks & Friedberg", String(showTitleOf(showHtml)));
    let threw = false;
    try {
      parseShowPage("<html><body>Nothing here</body></html>", allIn.slug);
    } catch {
      threw = true;
    }
    check("a show's page with no episodes throws, never a quiet week", threw);
    const said = Array.from({ length: 40 }, (_, i) => `<p>Starting point is 00:${String(i).padStart(2, "0")}:30</p><p>We talked about rates and chips at some length in part ${i}, and what the Fed might do next.</p>`).join("");
    const episodeHtml = `<html><body><h1>Rates, chips and the midterms</h1><p>Episode Date: October 15, 2026</p><h2>Transcript</h2>${said}<h3>Discussion (0)</h3><p>There aren't comments yet</p></body></html>`;
    const t = parseEpisodePage(episodeHtml);
    // podscripts.co as it reads on 27 Oct 2026: a comments link and a category badge before the title in its heading, and "Discussion (0)" between the Transcript heading and the transcript.
    const badged = parseShowPage(`<html><body><h2>All-In</h2><div><a href="/podcasts/${allIn.slug}/ai-cyber-panic">0 comments</a><a href="/podcasts/${allIn.slug}/ai-cyber-panic">Technology</a><h3><a href="/podcasts/${allIn.slug}/ai-cyber-panic">AI Cyber Panic</a></h3><p>Episode Date: October 23, 2026</p></div><div><a href="/podcasts/${allIn.slug}/dylan-field">0 comments</a><a href="/podcasts/${allIn.slug}/dylan-field">Technology</a><h3><a href="/podcasts/${allIn.slug}/dylan-field">Dylan Field: Is AI Replacing Designers?</a></h3><p>Episode Date: October 19, 2026</p></div></body></html>`, allIn.slug);
    check("an episode's title is the link in its heading, never the category badge", badged.length === 2 && badged[0]!.title === "AI Cyber Panic" && badged[0]!.date === "2026-10-23" && badged[1]!.title === "Dylan Field: Is AI Replacing Designers?" && badged[1]!.date === "2026-10-19", JSON.stringify(badged));
    const reordered = parseEpisodePage(`<html><body><h1>All-In - AI Cyber Panic</h1><p>Episode Date: October 23, 2026</p><p>Read More</p><h2>Transcript</h2><h3>Discussion (0)</h3>${said}</body></html>`);
    check("a transcript set after the discussion heading is still read", reordered.date === "2026-10-23" && reordered.text.includes("what the Fed might do next") && !/Discussion/.test(reordered.text), reordered.text.slice(0, 120));
    check("an episode's transcript between its heading and the discussion, the markers dropped", t.title === "Rates, chips and the midterms" && t.date === "2026-10-15" && !/Starting point/.test(t.text) && !/Discussion/.test(t.text) && t.text.includes("what the Fed might do next"), t.text.slice(0, 120));
    threw = false;
    try {
      parseEpisodePage("<html><body><h1>Soon</h1><h2>Transcript</h2><p>Coming soon.</p></body></html>");
    } catch {
      threw = true;
    }
    check("an episode with no transcript yet throws", threw);
    const long = transcriptText("line\n".repeat(PODCAST_MAX_CHARS));
    check("a long transcript is cut at a line and says so", long.cut && long.text.length <= PODCAST_MAX_CHARS && !transcriptText("short").cut);

    const ep = (id: string, date: string, status: Episode["status"]): Episode => ({ id, show: id.split("/")[0]!, title: id, date, status, reading: status === "read" ? { summary: "s", points: [], perspective: { text: "p", symbols: [], sections: [] } } : null, cut: false, error: status === "failed" ? "x" : null, readAt: `${date}T07:00:00.000Z` });
    const file = { ...EMPTY_PODCASTS, episodes: [ep(`${allIn.slug}/ai-capex`, "2026-10-10", "read")] };
    const other = { show: "the-prof-g-pod", episodes: [{ slug: "a", title: "A", date: "2026-10-19" }, { slug: "b", title: "B", date: "2026-10-18" }, { slug: "c", title: "C", date: "2026-10-17" }, { slug: "old", title: "Old", date: "2026-09-01" }] };
    const todo = episodesToRead(file, [{ show: allIn.slug, episodes: listed }, other], "2026-10-20");
    check("new episodes in the fortnight, read ones skipped, shows taken in turn", todo.length === EPISODES_PER_RUN && todo.some((e) => e.slug === "rates-chips-and-the-midterms") && !todo.some((e) => e.slug === "ai-capex" || e.slug === "old") && todo[0]!.date >= todo[todo.length - 1]!.date, JSON.stringify(todo.map((e) => e.slug)));
    // A quiet or undated listing is a sentence naming the newest episode found (Hamza, 4 Nov 2026), never a quiet fortnight.
    const quiet = listingNotes([{ show: "a", title: "All-In", episodes: [{ slug: "x", title: "AI Cyber Panic", date: "2026-10-23" }] }, { show: "b", title: "Undated", episodes: [{ slug: "y", title: "Y", date: null }] }, { show: "c", title: "Fresh", episodes: [{ slug: "z", title: "Z", date: "2026-11-01" }] }], "2026-11-04");
    check("a show quiet for STALE_SHOW_DAYS names its newest episode and date; one with no readable date says so; a fresh one says nothing", STALE_SHOW_DAYS === 10 && quiet.length === 2 && /All-In: the newest episode podscripts\.co lists is "AI Cyber Panic", dated 2026-10-23, 12 days ago/.test(quiet[0]) && /Undated: podscripts\.co lists 1 episode but no date/.test(quiet[1]) && /listingNotes\(/.test(readFileSync("lib/podcasts-run.ts", "utf8")), JSON.stringify(quiet));
    const failedFile = keepEpisodes(file, [ep(`${allIn.slug}/rates-chips-and-the-midterms`, "2026-10-15", "failed")], "2026-10-20T07:00:00Z");
    check("a failed read is tried again", episodesToRead(failedFile, [{ show: allIn.slug, episodes: listed }], "2026-10-20").some((e) => e.slug === "rates-chips-and-the-midterms"));
    const reread = keepEpisodes(failedFile, [ep(`${allIn.slug}/rates-chips-and-the-midterms`, "2026-10-15", "read")], "2026-10-21T07:00:00Z");
    check("a re-read replaces the failed one, newest first", reread.episodes.length === 2 && reread.episodes[0]!.status === "read" && reread.episodes[0]!.date === "2026-10-15");
    check("only read episodes of the fortnight are shown", episodesOfWeek(reread, "2026-10-20").length === 2 && episodesOfWeek(failedFile, "2026-10-20").length === 1 && episodesOfWeek(reread, "2026-11-20").length === 0);
    const added = withShow(file, { slug: "the-prof-g-pod", title: "The Prof G Pod", addedAt: "2026-10-20" }, "now");
    check("a show is added once and removed with its episodes", added.shows.length === 2 && withShow(added, { slug: "the-prof-g-pod", title: "x", addedAt: "2026-10-20" }, "now") === added && withoutShow(added, allIn.slug, "now").episodes.length === 0);
    check("the morning line for podcasts", podcastsSentence({ read: 2, failed: 1, problems: [] }) === "2 episodes written up; 1 not read." && podcastsSentence({ read: 0, failed: 0, problems: [] }) === "No new podcast episodes.");

    const context: PodcastContext = { holdings: [{ symbol: "NVDA", name: "NVIDIA", weight: 12.5, classLabel: "Compounding Machine" }], watchlist: ["AMD"], theses: [{ subject: "NVDA", text: "Data-centre demand lasts." }], methodology: { name: "Sample", summary: "Quality at a fair price.", classes: [{ label: "Compounding Machine", test: "ROIC above 20%" }], rules: [{ section: "3.4", text: "A position above its cap is trimmed." }] } };
    const req = podcastRequestBody({ show: allIn.title, title: t.title!, date: t.date!, text: t.text, cut: false, context }) as { system: string; tools: { name: string }[]; messages: { content: { text: string }[] }[] };
    check("the request carries the person's weights, classes, theses and rules, never an amount", req.system.includes("NVDA (NVIDIA) 12.5%, Compounding Machine") && req.system.includes("3.4: A position above its cap") && req.system.includes("Data-centre demand lasts") && !/\$\s?\d/.test(req.system) && req.tools[0]!.name === "record_episode" && req.messages[0]!.content[0]!.text.includes("what the Fed might do next"));
    check("the request translates for an open model", (() => {
      const o = toOpenAIRequest(req as unknown as ModelRequest, "llama") as { tools?: unknown[] };
      return Array.isArray(o.tools) && o.tools.length === 1;
    })());
    const answer = { content: [{ type: "tool_use", name: "record_episode", input: { summary: "Rates and chips.", points: [{ headline: "Chips", line: "Demand holds.", symbols: ["nvda", "TSLA"] }], perspective: { text: "Bears on NVDA's thesis; 3.4 applies if it runs.", symbols: ["NVDA", "AMD", "AAPL"], sections: ["3.4", "9.9"] } } }] };
    const parsed = parsePodcastResponse(answer, context);
    check("symbols outside the book and watchlist and sections the methodology lacks are dropped", parsed.ok && parsed.reading.points[0]!.symbols.join() === "NVDA" && parsed.reading.perspective.symbols.join() === "NVDA,AMD" && parsed.reading.perspective.sections.join() === "3.4", JSON.stringify(parsed));
    check("an answer in words is a reason, never an empty write-up", !parsePodcastResponse({ content: [{ type: "text", text: "Sure" }] }, context).ok);
    const sample = podcastsFileSchema.safeParse(JSON.parse(readFileSync(join(process.cwd(), "data/samples/podcasts.json"), "utf8")));
    check("the demo's podcasts parse and are marked as samples", sample.success && sample.data.episodes.length > 0 && sample.data.episodes.every((e) => /^Sample episode/.test(e.title)));
  }

  if (failures.length) {
    console.error(`check:statements FAILED (${passed} passed, ${failures.length} failed)\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`check:statements ok (${passed} passed): a PDF's text is read, every figure is checked against it, a misread one waits for the person, the statements lie on the book beside the broker's, the inbox reads only what the person's own account sent, and a newsletter becomes a digest on the person's key, the shared recap read once for the operator, a recap each person subscribes read as theirs, and shown as Friday's on a weekend; a podcast's episodes and transcript are read from podscripts.co and written up on the person's model against their book, never with an amount.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
